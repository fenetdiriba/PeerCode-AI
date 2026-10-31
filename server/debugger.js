// Time-travel debugger API (JSON over HTTP, same port as everything else):
//   GET    /api/challenges
//   GET    /api/rooms/:room/revisions
//   POST   /api/rooms/:room/revisions               { sourceCode, label, author, challengeId }
//   DELETE /api/rooms/:room/revisions               { challengeId? } clear history (demo restart)
//   POST   /api/rooms/:room/revisions/:id/test      run the challenge tests on one revision
//   POST   /api/rooms/:room/regression              { challengeId?, baselineId?, strategy? }
//   POST   /api/rooms/:room/analyze                 { lastPassingId, firstFailingId, currentCode }
//   POST   /api/verify                              { analysisId } (any mode) or
//                                                   { challengeId, sourceCode, edits } (local mode only)
//
// Security: what may execute is decided by execution-policy.js (restricted by default: only
// server-owned code and server-produced patches). Execution is also refused entirely when the
// startup isolation self-check failed. If DEBUGGER_ACCESS_CODE is set, every write, test run
// and AI call needs the X-PeerCode-Access header. AI calls have a per-IP limit and a global
// daily cap to protect API credits.
import { ANALYSIS_SCHEMA, buildDebugPrompt, parseAnalysis, SYSTEM_PROMPT } from './analysis.js';
import { CHALLENGES, publicChallenge } from './challenges.js';
import { timingSafeEqual } from 'node:crypto';
import { createExecutionPolicy, screenEdits } from './execution-policy.js';
import { createRateLimiter, HttpError, json, readJson } from './http.js';
import { ModelError } from './meta.js';
import { applyEdits, validateEdits } from './patches.js';
import { locateRegression } from './regression.js';
import { hashCode, MAX_SOURCE_CHARS, ROOM_PATTERN, validateRevisionInput } from './revisions.js';
import { randomUUID } from 'node:crypto';

const MAX_CACHED_RUNS = 500;
const MAX_ANALYSES = 500;
const ANALYSIS_TTL_MS = 30 * 60_000;

/**
 * @param {{
 *   store: ReturnType<typeof import('./revisions.js').createRevisionStore>,
 *   runner: ReturnType<typeof import('./runner.js').createRunner>,
 *   model: ReturnType<typeof import('./meta.js').createMetaClient>,
 *   challenges?: Record<string, import('./challenges.js').Challenge>,
 *   testRunsPerMinute?: number,
 *   analysesPer10Min?: number,
 *   aiDailyLimit?: number,
 *   executionMode?: 'restricted' | 'local',
 *   isolation?: { ok: boolean, checks?: Record<string, boolean>, error?: string } | null,
 *   accessCode?: string | null,
 *   persistence?: string,
 *   now?: () => number,
 * }} deps
 */
export function createDebugger({
  store,
  runner,
  model,
  challenges = CHALLENGES,
  testRunsPerMinute = 60,
  analysesPer10Min = 20,
  aiDailyLimit = 200,
  executionMode = 'restricted',
  isolation = null,
  accessCode = null,
  persistence = 'memory',
  now = () => Date.now(),
}) {
  const testLimited = createRateLimiter({ max: testRunsPerMinute, windowMs: 60_000 });
  const aiLimited = createRateLimiter({ max: analysesPer10Min, windowMs: 10 * 60_000 });
  const policy = createExecutionPolicy({ mode: executionMode, challenges });
  // isolation null = not checked (tests); { ok: false } disables execution entirely.
  const executionAvailable = isolation === null || isolation.ok;

  /** Model calls today (UTC), across all clients: protects the API budget. */
  const daily = { day: '', count: 0 };
  const takeDailyAiCall = () => {
    const day = new Date(now()).toISOString().slice(0, 10);
    if (daily.day !== day) Object.assign(daily, { day, count: 0 });
    if (daily.count >= aiDailyLimit) throw new HttpError(429, 'The demo has used its AI budget for today. Try again tomorrow, or run PeerCode locally with your own key.', { code: 'ai-daily-limit' });
    daily.count++;
  };

  /** Server-issued analyses: verify runs exactly these edits on exactly this code. */
  /** @type {Map<string, { challengeId: string, sourceCode: string, edits: { find: string, replace: string }[], createdAt: number }>} */
  const analyses = new Map();
  const rememberAnalysis = (record) => {
    const id = randomUUID();
    analyses.set(id, record);
    for (const [k, v] of analyses) if (analyses.size > MAX_ANALYSES || now() - v.createdAt > ANALYSIS_TTL_MS) analyses.delete(k);
    return id;
  };

  const checkAccess = (provided) => {
    if (!accessCode) return;
    const a = Buffer.from(String(provided ?? ''));
    const b = Buffer.from(accessCode);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new HttpError(401, 'This server needs a demo access code.', { code: 'access-code-required' });
    }
  };

  const assertExecution = () => {
    if (!executionAvailable) {
      throw new HttpError(503, 'Test execution is disabled on this server: its isolation self-check failed at startup (see /health).', { code: 'execution-unavailable' });
    }
  };

  // Tests are deterministic fixtures, so a result is a function of (challenge, exact code).
  /** @type {Map<string, Promise<import('./runner.js').TestRun>>} */
  const runCache = new Map();
  const testCode = (challenge, sourceCode, onExecute = () => {}) => {
    const key = `${challenge.id}:${hashCode(sourceCode)}`;
    let p = runCache.get(key);
    if (!p) {
      onExecute();
      p = runner.runTests(sourceCode, challenge);
      runCache.set(key, p);
      // Don't cache infrastructure failures or timeouts (they may be load-related).
      p.then((r) => {
        if (r.status === 'error' && (r.errorKind === 'infrastructure' || r.errorKind === 'timeout')) runCache.delete(key);
      });
      if (runCache.size > MAX_CACHED_RUNS) runCache.delete(runCache.keys().next().value);
    }
    return p;
  };

  const getChallenge = (id) => {
    const c = challenges[id];
    if (!c) throw new HttpError(400, 'Unknown challenge.');
    return c;
  };

  const getRevision = async (roomId, id) => {
    const rev = typeof id === 'string' ? await store.get(roomId, id) : undefined;
    if (!rev) {
      throw new HttpError(404, 'That checkpoint no longer exists. The server may have restarted (free hosting keeps no history); load the demo scenario again.', { code: 'checkpoint-not-found' });
    }
    return rev;
  };

  const checkTestLimit = (ip) => {
    if (testLimited(ip)) throw new HttpError(429, 'Too many test runs. Wait a minute and try again.');
  };

  /** @param {{ method: string, parts: string[], body: () => Promise<any>, ip: string, access: string | undefined }} r */
  async function route({ method, parts, body, ip, access }) {
    // parts: path split after "/api"
    if (parts[0] === 'challenges' && parts.length === 1 && method === 'GET') {
      return {
        // Only a volume (or a developer's local dir) survives restarts.
        storage: { ephemeral: !persistence.startsWith('volume') && !persistence.startsWith('local dir') },
        challenges: Object.values(challenges).map(publicChallenge),
        ai: { available: model.available, model: model.model },
        execution: { mode: policy.mode, available: executionAvailable },
        access: { required: Boolean(accessCode) },
      };
    }
    // Everything except reading is gated by the access code (when one is configured).
    if (method !== 'GET') checkAccess(access);

    if (parts[0] === 'verify' && parts.length === 1 && method === 'POST') {
      assertExecution();
      const req = await body();
      let challenge;
      let sourceCode;
      let edits;
      if (req.analysisId !== undefined) {
        const record = typeof req.analysisId === 'string' ? analyses.get(req.analysisId) : undefined;
        if (!record) throw new HttpError(404, 'That analysis has expired. Analyze again.', { code: 'analysis-not-found' });
        ({ sourceCode, edits } = record);
        challenge = getChallenge(record.challengeId);
      } else {
        // Client-supplied code and edits: arbitrary code, so local mode only.
        if (policy.mode !== 'local') {
          throw new HttpError(403, 'This public server only verifies patches it generated for the built-in scenario. Analyze the scenario code (undo any edits first), or run PeerCode locally.', { code: 'execution-restricted' });
        }
        challenge = getChallenge(req.challengeId);
        sourceCode = req.sourceCode;
        if (typeof sourceCode !== 'string' || sourceCode.length > MAX_SOURCE_CHARS) throw new HttpError(400, 'Invalid source code.');
        const valid = validateEdits(req.edits);
        if (!valid.ok) throw new HttpError(400, valid.error);
        edits = valid.edits;
      }
      const applied = applyEdits(sourceCode, edits);
      if (!applied.ok) throw new HttpError(409, applied.error, { code: 'patch-does-not-apply' });
      checkTestLimit(ip);
      const run = await testCode(challenge, applied.code);
      // A server-generated patch of trusted code that passed may run again later (e.g. the
      // checkpoint created when it's applied).
      if (run.status === 'passed' && req.analysisId !== undefined) policy.trust(challenge.id, applied.code);
      return { sourceHash: hashCode(sourceCode), patchedCode: applied.code, patchedHash: hashCode(applied.code), run };
    }

    if (parts[0] !== 'rooms' || !ROOM_PATTERN.test(parts[1] ?? '')) throw new HttpError(404, 'Not found.');
    const roomId = parts[1];
    const rest = parts.slice(2);

    if (rest[0] === 'revisions' && rest.length === 1) {
      if (method === 'GET') return { revisions: await store.list(roomId) };
      if (method === 'POST') {
        const parsed = validateRevisionInput(await body());
        if (!parsed.ok) throw new HttpError(400, parsed.error);
        getChallenge(parsed.value.challengeId);
        try {
          return { revision: await store.create(roomId, parsed.value) };
        } catch (err) {
          if (err.status) throw new HttpError(err.status, err.message);
          throw err;
        }
      }
      if (method === 'DELETE') {
        const { challengeId } = await body();
        if (challengeId !== undefined) getChallenge(challengeId);
        await store.clear(roomId, challengeId);
        return { revisions: await store.list(roomId) };
      }
    }

    if (rest[0] === 'revisions' && rest.length === 3 && rest[2] === 'test' && method === 'POST') {
      const rev = await getRevision(roomId, rest[1]);
      assertExecution();
      policy.assertExecutable(rev.challengeId, rev.sourceCode, `Checkpoint #${rev.sequenceNumber}`);
      checkTestLimit(ip);
      return { revisionId: rev.id, run: await testCode(getChallenge(rev.challengeId), rev.sourceCode) };
    }

    if (rest[0] === 'regression' && rest.length === 1 && method === 'POST') {
      const { challengeId, baselineId, strategy } = await body();
      if (strategy !== undefined && strategy !== 'bisect+verify' && strategy !== 'linear') throw new HttpError(400, 'Invalid strategy.');
      if (challengeId !== undefined) getChallenge(challengeId);
      // A room can hold several challenges' histories; search only the requested one.
      const revisions = (await store.list(roomId)).filter((r) => challengeId === undefined || r.challengeId === challengeId);
      if (baselineId !== undefined && !revisions.some((r) => r.id === baselineId)) throw new HttpError(404, 'Baseline checkpoint not found.');
      const start = baselineId ? revisions.findIndex((r) => r.id === baselineId) : 0;
      const ids = new Set(revisions.slice(start).map((r) => r.challengeId));
      if (ids.size > 1) throw new HttpError(400, 'These checkpoints belong to different challenges; pick a baseline from the current one.');
      assertExecution();
      // All or nothing: a search over partly-unrunnable history would give a wrong answer.
      for (const r of revisions.slice(Math.max(start, 0))) policy.assertExecutable(r.challengeId, r.sourceCode, `Checkpoint #${r.sequenceNumber}`);
      checkTestLimit(ip);
      const started = performance.now();
      let executedRuns = 0; // fresh test-process executions; the rest came from the result cache
      const report = await locateRegression(revisions, (rev) => testCode(getChallenge(rev.challengeId), rev.sourceCode, () => executedRuns++), { baselineId, strategy });
      return { report: { ...report, executedRuns, durationMs: Math.round(performance.now() - started) } };
    }

    if (rest[0] === 'analyze' && rest.length === 1 && method === 'POST') {
      const { lastPassingId, firstFailingId, currentCode } = await body();
      if (typeof currentCode !== 'string' || currentCode.length > MAX_SOURCE_CHARS) throw new HttpError(400, 'Invalid current code.');
      const lastPassing = await getRevision(roomId, lastPassingId);
      const firstFailing = await getRevision(roomId, firstFailingId);
      if (lastPassing.sequenceNumber >= firstFailing.sequenceNumber) throw new HttpError(400, 'The passing checkpoint must come before the failing one.');
      const challenge = getChallenge(firstFailing.challengeId);
      assertExecution();
      // Restricted mode: the prompt contains only server-owned code, so visitors can't steer
      // the model (and the code that runs is never theirs).
      policy.assertExecutable(challenge.id, lastPassing.sourceCode, `Checkpoint #${lastPassing.sequenceNumber}`);
      policy.assertExecutable(challenge.id, firstFailing.sourceCode, `Checkpoint #${firstFailing.sequenceNumber}`);
      policy.assertExecutable(challenge.id, currentCode, 'The live code');
      if (!model.available) throw new HttpError(503, 'Meta AI analysis is unavailable: MODEL_API_KEY is not set on the server.', { code: 'ai-unavailable' });
      if (aiLimited(ip)) throw new HttpError(429, 'Too many AI requests. Try again in a few minutes.');
      takeDailyAiCall();

      const [passRun, failingRun] = await Promise.all([testCode(challenge, lastPassing.sourceCode), testCode(challenge, firstFailing.sourceCode)]);
      if (passRun.status !== 'passed' || failingRun.status === 'passed') {
        throw new HttpError(409, 'These checkpoints are not a passing → failing pair. Locate the regression first.');
      }
      const user = buildDebugPrompt({ challenge, lastPassing, firstFailing, failingRun, currentCode });
      const started = performance.now();
      // One retry: if the reply doesn't validate, tell the model why and ask again.
      let lastError = '';
      const usage = { promptTokens: 0, completionTokens: 0, reasoningTokens: 0, totalTokens: 0 };
      const requestIds = [];
      for (let attempt = 1; attempt <= 2; attempt++) {
        if (attempt > 1) takeDailyAiCall();
        const prompt = attempt === 1 ? user : `${user}\n\nYour previous answer was rejected: ${lastError}\nReply again with only the JSON object.`;
        let result;
        try {
          result = await model.complete({ system: SYSTEM_PROMPT, user: prompt, schema: { name: 'debug_analysis', schema: ANALYSIS_SCHEMA } });
        } catch (err) {
          if (err instanceof ModelError) {
            // Sanitized upstream details (key redacted) help diagnose integration problems.
            throw new HttpError(err.status, err.message, { code: `ai-${err.code}`, upstreamStatus: err.upstreamStatus, detail: err.detail });
          }
          throw err;
        }
        if (result.usage) for (const k of Object.keys(usage)) usage[k] += result.usage[k];
        if (result.id) requestIds.push(result.id);
        let parsed = parseAnalysis(result.text, currentCode);
        if (parsed.ok && policy.mode !== 'local') {
          const screened = screenEdits(parsed.analysis.edits);
          if (!screened.ok) parsed = { ok: false, error: `The patch was refused: ${screened.error}.` };
        }
        if (parsed.ok) {
          return {
            analysis: parsed.analysis,
            patchedCode: parsed.patchedCode,
            sourceHash: hashCode(currentCode),
            model: model.model,
            attempts: attempt,
            latencyMs: Math.round(performance.now() - started),
            analysisId: rememberAnalysis({ challengeId: challenge.id, sourceCode: currentCode, edits: parsed.analysis.edits, createdAt: now() }),
            responseFormat: result.responseFormat,
            schemaFallback: Boolean(result.schemaFallback),
            usage,
            requestIds,
          };
        }
        lastError = parsed.error;
      }
      throw new HttpError(502, `Meta AI returned an answer that failed validation: ${lastError}`, { code: 'ai-invalid-output' });
    }

    throw new HttpError(404, 'Not found.');
  }

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {string} path pathname starting with /api/
   * @param {string} ip
   */
  async function handle(req, res, path, ip) {
    const parts = path.slice('/api/'.length).split('/').filter(Boolean);
    try {
      const access = req.headers['x-peercode-access'];
      const result = await route({ method: req.method ?? 'GET', parts, body: () => readJson(req), ip, access: Array.isArray(access) ? access[0] : access });
      json(res, 200, result);
    } catch (err) {
      if (err instanceof HttpError) return json(res, err.status, { error: err.message, ...err.extra });
      console.error('Debugger API error:', err);
      json(res, 500, { error: 'Internal server error.' });
    }
  }

  /** For /health: how this server executes code (no secrets). */
  const status = () => ({
    executionMode: policy.mode,
    executionAvailable,
    isolation: isolation ?? 'not checked',
    networkRestricted: false,
    persistence,
    ai: model.available,
    accessCodeRequired: Boolean(accessCode),
  });

  return { handle, status };
}
