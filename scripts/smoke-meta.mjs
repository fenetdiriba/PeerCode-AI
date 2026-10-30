// Manual end-to-end check against the REAL Meta Model API (not run by `npm test`).
//   MODEL_API_KEY=... npm run smoke:meta
// Runs the demo history through the real pipeline: locate regression → Muse Spark analysis →
// patch validation → verification with real tests. Prints what happened; exits 1 on failure.
import 'dotenv/config';
import { createApp } from '../server/app.js';
import { CHALLENGES } from '../server/challenges.js';
import { createMetaClient, DEFAULT_BASE_URL, DEFAULT_MODEL } from '../server/meta.js';
import { createRevisionStore } from '../server/revisions.js';
import { createRunner } from '../server/runner.js';

const key = process.env.MODEL_API_KEY?.trim();
if (!key) {
  console.error('MODEL_API_KEY is not set. Put it in .env or the environment.');
  process.exit(1);
}
const model = createMetaClient({
  apiKey: key,
  baseUrl: process.env.META_BASE_URL || DEFAULT_BASE_URL,
  model: process.env.META_MODEL || DEFAULT_MODEL,
  jsonMode: process.env.META_JSON_MODE !== 'off',
});
const app = createApp({ debuggerDeps: { store: createRevisionStore(), runner: createRunner(), model } });
await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${app.server.address().port}/api`;
const call = async (method, path, body) => {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};

let ok = false;
try {
  const cart = CHALLENGES['cart-total'];
  for (const s of cart.demoSteps) await call('POST', '/rooms/smoke/revisions', { sourceCode: s.code, label: s.label, author: s.author, challengeId: cart.id });
  const { body: reg } = await call('POST', '/rooms/smoke/regression', {});
  console.log(`Regression: ${reg.report.outcome}, ${reg.report.message} (${reg.report.testsRun} test runs, ${reg.report.durationMs}ms)`);

  const currentCode = cart.demoSteps.at(-1).code;
  console.log(`Calling ${model.model} at ${process.env.META_BASE_URL || DEFAULT_BASE_URL} ...`);
  const an = await call('POST', '/rooms/smoke/analyze', {
    lastPassingId: reg.report.lastPassingRevisionId,
    firstFailingId: reg.report.firstFailingRevisionId,
    currentCode,
  });
  if (an.status !== 200) throw new Error(`Analysis failed (${an.status}): ${an.body.error}`);
  console.log(`Model answered in ${an.body.latencyMs}ms (attempts: ${an.body.attempts})`);
  console.log(JSON.stringify(an.body.analysis, null, 2));

  const { body: ver } = await call('POST', '/verify', { challengeId: cart.id, sourceCode: currentCode, edits: an.body.analysis.edits });
  console.log(`Verification: ${ver.run.status} (${ver.run.passed}/${ver.run.total} tests)`);
  ok = ver.run.status === 'passed';
} catch (err) {
  console.error(err.message);
} finally {
  await new Promise((r) => app.close(r));
}
process.exit(ok ? 0 : 1);
