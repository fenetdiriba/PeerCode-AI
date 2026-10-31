// Repeated evaluation against the REAL Meta Model API (costs API credits; not run by npm test).
//   npm run eval:meta -- --runs=5 [--challenge=<id>|all]
//   (dev proxy: META_AUTH=injected NODE_USE_ENV_PROXY=1 npm run eval:meta -- --runs=5)
//
// Each trial uses a fresh room on an in-process server in the default restricted mode:
// seed the challenge's demo history, locate the regression, analyze with Muse Spark, verify
// by analysisId, apply (checkpoint the verified code) and re-test. Raw model outputs are
// saved so explanations can be reviewed by hand; the root-cause rubric below is a keyword
// check, not a judgment of quality.
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { diffStats } from '../shared/diff.js';
import { createApp } from '../server/app.js';
import { CHALLENGES } from '../server/challenges.js';
import { createMetaClient, DEFAULT_BASE_URL, DEFAULT_MODEL, responseFormatFromEnv } from '../server/meta.js';
import { createRevisionStore } from '../server/revisions.js';
import { createRunner } from '../server/runner.js';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const runs = Math.max(1, Math.min(20, Number(arg('runs', 3))));
const which = arg('challenge', 'all');
const challenges = which === 'all' ? Object.values(CHALLENGES) : [CHALLENGES[which]];
if (challenges.some((c) => !c)) throw new Error(`Unknown challenge ${which}`);

/** Keyword rubric for "named the actual root cause". Both groups must match. */
const RUBRIC = {
  'cart-total': [/quantity/i, /multipl|\*|times|dropp|remov|missing/i],
  'search-race': [/latestRequest|request ?id|counter|generation|token/i, /clear|blank|empty|idle/i],
};
const namesRootCause = (id, a) => {
  const text = `${a.probableRootCause} ${a.explanation} ${a.whatChanged}`;
  return RUBRIC[id].every((re) => re.test(text));
};

const injected = process.env.META_AUTH === 'injected';
const model = createMetaClient({
  apiKey: process.env.MODEL_API_KEY?.trim() || undefined,
  authMode: injected ? 'injected' : 'key',
  baseUrl: process.env.META_BASE_URL || DEFAULT_BASE_URL,
  model: process.env.META_MODEL || DEFAULT_MODEL,
  responseFormat: responseFormatFromEnv(process.env),
});
if (!model.available) throw new Error('Set MODEL_API_KEY (or META_AUTH=injected behind a key-injecting proxy).');

const app = createApp({ debuggerDeps: { store: createRevisionStore(), runner: createRunner(), model, aiDailyLimit: 1000, analysesPer10Min: 1000 } });
await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${app.server.address().port}/api`;
const call = async (method, path, body) => {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};

const trials = [];
try {
  for (const c of challenges) {
    for (let i = 1; i <= runs; i++) {
      const room = `eval-${c.id}-${i}-${Date.now().toString(36)}`;
      const t = { challenge: c.id, trial: i };
      try {
        const ids = [];
        for (const s of c.demoSteps) ids.push((await call('POST', `/rooms/${room}/revisions`, { sourceCode: s.code, label: s.label, author: s.author, challengeId: c.id })).body.revision.id);
        const reg = (await call('POST', `/rooms/${room}/regression`, { challengeId: c.id })).body.report;
        t.localizationCorrect = reg.firstFailingRevisionId === ids[2] && reg.lastPassingRevisionId === ids[1];
        t.localizationMs = reg.durationMs;

        const currentCode = c.demoSteps.at(-1).code;
        const started = performance.now();
        const an = await call('POST', `/rooms/${room}/analyze`, { lastPassingId: reg.lastPassingRevisionId, firstFailingId: reg.firstFailingRevisionId, currentCode });
        t.analysisWallMs = Math.round(performance.now() - started);
        if (an.status !== 200) {
          Object.assign(t, { analysisOk: false, analysisError: `${an.status} ${an.body.code ?? ''}: ${an.body.error}` });
          trials.push(t);
          console.log(`${c.id} #${i}: analysis FAILED (${t.analysisError})`);
          continue;
        }
        const a = an.body;
        Object.assign(t, {
          analysisOk: true,
          attempts: a.attempts,
          responseFormat: a.responseFormat,
          schemaFallback: a.schemaFallback,
          modelLatencyMs: a.latencyMs,
          usage: a.usage,
          requestIds: a.requestIds,
          namesRootCause: namesRootCause(c.id, a.analysis),
          edits: a.analysis.edits.length,
          patchLines: diffStats(currentCode, a.patchedCode),
          analysis: a.analysis,
        });
        const ver = (await call('POST', '/verify', { analysisId: a.analysisId })).body;
        t.verification = `${ver.run.status} ${ver.run.passed}/${ver.run.total}`;
        t.verified = ver.run.status === 'passed';
        if (t.verified) {
          const applied = (await call('POST', `/rooms/${room}/revisions`, { sourceCode: ver.patchedCode, label: 'Apply verified patch', challengeId: c.id })).body.revision;
          const re = (await call('POST', `/rooms/${room}/revisions/${applied.id}/test`)).body.run;
          t.appliedRetest = `${re.status} ${re.passed}/${re.total}`;
        }
        console.log(`${c.id} #${i}: loc=${t.localizationCorrect} rootCause=${t.namesRootCause} verify=${t.verification} attempts=${t.attempts} ${t.modelLatencyMs}ms ${t.usage.totalTokens} tok (${t.usage.reasoningTokens} reasoning) format=${t.responseFormat}`);
      } catch (err) {
        t.error = String(err?.message ?? err);
        console.log(`${c.id} #${i}: ERROR ${t.error}`);
      }
      trials.push(t);
    }
  }
} finally {
  await new Promise((r) => app.close(r));
}

const sum = (xs) => xs.reduce((x, y) => x + y, 0);
const median = (xs) => {
  const s = [...xs].sort((x, y) => x - y);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2)) : null;
};
const summary = challenges.map((c) => {
  const ts = trials.filter((t) => t.challenge === c.id);
  const ok = ts.filter((t) => t.analysisOk);
  return {
    challenge: c.id,
    trials: ts.length,
    localizationCorrect: ts.filter((t) => t.localizationCorrect).length,
    validAnalysis: ok.length,
    firstAttemptValid: ok.filter((t) => t.attempts === 1).length,
    schemaFallbacks: ok.filter((t) => t.schemaFallback).length,
    namesRootCause: ok.filter((t) => t.namesRootCause).length,
    verifiedPatches: ts.filter((t) => t.verified).length,
    appliedRetestPassed: ts.filter((t) => t.appliedRetest?.startsWith('passed')).length,
    modelLatencyMs: { median: median(ok.map((t) => t.modelLatencyMs)), min: Math.min(...ok.map((t) => t.modelLatencyMs)), max: Math.max(...ok.map((t) => t.modelLatencyMs)) },
    tokens: {
      total: sum(ok.map((t) => t.usage.totalTokens)),
      medianPerAnalysis: median(ok.map((t) => t.usage.totalTokens)),
      medianReasoning: median(ok.map((t) => t.usage.reasoningTokens)),
    },
  };
});
console.log(JSON.stringify(summary, null, 2));

mkdirSync('docs/eval', { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out = `docs/eval/meta-eval-${stamp}.json`;
writeFileSync(out, JSON.stringify({ date: new Date().toISOString(), model: model.model, responseFormat: model.responseFormat, node: process.version, runsPerChallenge: runs, summary, trials }, null, 2));
console.log(`Wrote ${out}`);
