// Time-travel debugger API (JSON over HTTP, same port as everything else):
//   GET    /api/challenges
//   GET    /api/rooms/:room/revisions
//   POST   /api/rooms/:room/revisions               { sourceCode, label, author, challengeId }
//   DELETE /api/rooms/:room/revisions               clear the room's history (demo restart)
//   POST   /api/rooms/:room/revisions/:id/test      run the challenge tests on one revision
//   POST   /api/rooms/:room/regression              { baselineId?, strategy? }
//   POST   /api/rooms/:room/analyze                 { lastPassingId, firstFailingId, currentCode }
//   POST   /api/verify                              { challengeId, sourceCode, edits }
import { buildDebugPrompt, parseAnalysis, SYSTEM_PROMPT } from './analysis.js';
import { CHALLENGES, publicChallenge } from './challenges.js';
import { createRateLimiter, HttpError, json, readJson } from './http.js';
import { ModelError } from './meta.js';
import { applyEdits, validateEdits } from './patches.js';
import { locateRegression } from './regression.js';
import { hashCode, MAX_SOURCE_CHARS, ROOM_PATTERN, validateRevisionInput } from './revisions.js';

const MAX_CACHED_RUNS = 500;

/**
 * @param {{
 *   store: ReturnType<typeof import('./revisions.js').createRevisionStore>,
 *   runner: ReturnType<typeof import('./runner.js').createRunner>,
 *   model: ReturnType<typeof import('./meta.js').createMetaClient>,
 *   challenges?: Record<string, import('./challenges.js').Challenge>,
 *   testRunsPerMinute?: number,
 *   analysesPer10Min?: number,
 * }} deps
 */
export function createDebugger({ store, runner, model, challenges = CHALLENGES, testRunsPerMinute = 60, analysesPer10Min = 20 }) {
  const testLimited = createRateLimiter({ max: testRunsPerMinute, windowMs: 60_000 });
  const aiLimited = createRateLimiter({ max: analysesPer10Min, windowMs: 10 * 60_000 });

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
    if (!rev) throw new HttpError(404, 'Checkpoint not found.');
    return rev;
  };

  const checkTestLimit = (ip) => {
    if (testLimited(ip)) throw new HttpError(429, 'Too many test runs. Wait a minute and try again.');
  };

  /** @param {{ method: string, parts: string[], body: () => Promise<any>, ip: string }} r */
  async function route({ method, parts, body, ip }) {
    // parts: path split after "/api"
    if (parts[0] === 'challenges' && parts.length === 1 && method === 'GET') {
      return { challenges: Object.values(challenges).map(publicChallenge), ai: { available: model.available, model: model.model } };
    }

    if (parts[0] === 'verify' && parts.length === 1 && method === 'POST') {
      const { challengeId, sourceCode, edits } = await body();
      const challenge = getChallenge(challengeId);
      if (typeof sourceCode !== 'string' || sourceCode.length > MAX_SOURCE_CHARS) throw new HttpError(400, 'Invalid source code.');
      const valid = validateEdits(edits);
      if (!valid.ok) throw new HttpError(400, valid.error);
      const applied = applyEdits(sourceCode, valid.edits);
      if (!applied.ok) throw new HttpError(409, applied.error, { code: 'patch-does-not-apply' });
      checkTestLimit(ip);
      const run = await testCode(challenge, applied.code);
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
        await store.clear(roomId);
        return { revisions: [] };
      }
    }

    if (rest[0] === 'revisions' && rest.length === 3 && rest[2] === 'test' && method === 'POST') {
      const rev = await getRevision(roomId, rest[1]);
      checkTestLimit(ip);
      return { revisionId: rev.id, run: await testCode(getChallenge(rev.challengeId), rev.sourceCode) };
    }

    if (rest[0] === 'regression' && rest.length === 1 && method === 'POST') {
      const { baselineId, strategy } = await body();
      if (strategy !== undefined && strategy !== 'bisect+verify' && strategy !== 'linear') throw new HttpError(400, 'Invalid strategy.');
      const revisions = await store.list(roomId);
      if (baselineId !== undefined && !revisions.some((r) => r.id === baselineId)) throw new HttpError(404, 'Baseline checkpoint not found.');
      const start = baselineId ? revisions.findIndex((r) => r.id === baselineId) : 0;
      const ids = new Set(revisions.slice(start).map((r) => r.challengeId));
      if (ids.size > 1) throw new HttpError(400, 'These checkpoints belong to different challenges; pick a baseline from the current one.');
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
      if (!model.available) throw new HttpError(503, 'Meta AI analysis is unavailable: MODEL_API_KEY is not set on the server.', { code: 'ai-unavailable' });
      if (aiLimited(ip)) throw new HttpError(429, 'Too many AI requests. Try again in a few minutes.');

      const [passRun, failingRun] = await Promise.all([testCode(challenge, lastPassing.sourceCode), testCode(challenge, firstFailing.sourceCode)]);
      if (passRun.status !== 'passed' || failingRun.status === 'passed') {
        throw new HttpError(409, 'These checkpoints are not a passing → failing pair. Locate the regression first.');
      }
      const user = buildDebugPrompt({ challenge, lastPassing, firstFailing, failingRun, currentCode });
      const started = performance.now();
      // One retry: if the reply doesn't validate, tell the model why and ask again.
      let lastError = '';
      for (let attempt = 1; attempt <= 2; attempt++) {
        const prompt = attempt === 1 ? user : `${user}\n\nYour previous answer was rejected: ${lastError}\nReply again with only the JSON object.`;
        let text;
        try {
          text = await model.complete({ system: SYSTEM_PROMPT, user: prompt });
        } catch (err) {
          if (err instanceof ModelError) throw new HttpError(err.status, err.message, { code: `ai-${err.code}` });
          throw err;
        }
        const parsed = parseAnalysis(text, currentCode);
        if (parsed.ok) {
          return {
            analysis: parsed.analysis,
            patchedCode: parsed.patchedCode,
            sourceHash: hashCode(currentCode),
            model: model.model,
            attempts: attempt,
            latencyMs: Math.round(performance.now() - started),
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
      const result = await route({ method: req.method ?? 'GET', parts, body: () => readJson(req), ip });
      json(res, 200, result);
    } catch (err) {
      if (err instanceof HttpError) return json(res, err.status, { error: err.message, ...err.extra });
      console.error('Debugger API error:', err);
      json(res, 500, { error: 'Internal server error.' });
    }
  }

  return { handle };
}
