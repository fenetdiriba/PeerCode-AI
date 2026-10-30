// Manual end-to-end check against the REAL Meta Model API (not run by `npm test`).
//   npm run smoke:meta          (reads MODEL_API_KEY from the environment or .env)
//
// 1. Connectivity: one minimal chat-completions request, to separate API problems
//    (key, model, endpoint, network) from pipeline problems.
// 2. Real workflow on the demo history: locate regression → Muse Spark analysis →
//    patch validation → verification with real tests → apply (checkpoint the patched
//    code under the same rule the UI uses) → re-test the new checkpoint.
// The key is never printed. Exit code 0 only if every step succeeded.
import 'dotenv/config';
import { applyDecision } from '../shared/patch-safety.js';
import { createApp } from '../server/app.js';
import { CHALLENGES } from '../server/challenges.js';
import { createMetaClient, DEFAULT_BASE_URL, DEFAULT_MODEL, ModelError } from '../server/meta.js';
import { createRevisionStore } from '../server/revisions.js';
import { createRunner } from '../server/runner.js';

const clean = (v) => v?.trim().replace(/^["']|["']$/g, '').trim() || undefined;
const key = clean(process.env.MODEL_API_KEY);
const baseUrl = clean(process.env.META_BASE_URL) ?? DEFAULT_BASE_URL;
const modelName = clean(process.env.META_MODEL) ?? DEFAULT_MODEL;
const jsonMode = process.env.META_JSON_MODE !== 'off';

console.log(`Endpoint:  ${baseUrl.replace(/\/+$/, '')}/chat/completions`);
console.log(`Model:     ${modelName}`);
console.log(`JSON mode: ${jsonMode ? 'on (response_format: json_object)' : 'off'}`);
console.log(`API key:   ${key ? `set (${key.length} chars, not shown)` : 'NOT SET'}`);
if (!key) {
  console.error('\nFAIL: MODEL_API_KEY is not set. Put it in .env (gitignored) or export it in your shell.');
  process.exit(1);
}

/** What to do about each failure, keyed by ModelError code. */
function fixFor(code, upstreamStatus, detail) {
  if (code === 'network') {
    return /403|tunnel|proxy/i.test(detail)
      ? 'A proxy or firewall refused the connection to api.meta.ai. Allow that host (in a Claude cloud session, add api.meta.ai to the environment\'s allowed domains) or run this on your own machine.'
      : /ENOTFOUND|EAI_AGAIN/.test(detail)
        ? 'DNS lookup for the API host failed. Check your internet connection and META_BASE_URL.'
        : process.env.HTTPS_PROXY || process.env.https_proxy
          ? 'The connection went through the proxy in HTTPS_PROXY, which did not let it through. The proxy is probably blocking api.meta.ai: allow that host, or run this on a machine without the proxy.'
          : 'The server could not open a connection to the API host. Check your network, VPN or proxy.';
  }
  if (code === 'auth') return 'The key was rejected. Check that MODEL_API_KEY is the full key with no quotes or spaces, is active, and is for the Meta Model API. Create a new key if unsure.';
  if (code === 'rate-limit') return 'Rate limited. Wait a minute, then retry. If it persists, check your hackathon quota.';
  if (code === 'timeout') return 'No answer in time. Retry; if it keeps happening, the API may be degraded.';
  if (code === 'upstream') return 'Meta returned a server error. Retry shortly.';
  if (code === 'invalid-response') return 'The API answered 200, but not in a shape server/meta.js understands. Compare the response format in the docs with readText() in server/meta.js.';
  if (upstreamStatus === 404) return 'Endpoint or model not found. Check META_MODEL (model id spelling) and META_BASE_URL against the docs.';
  if (upstreamStatus === 400 && /response_format|json/i.test(detail)) return 'The API rejected response_format. Re-run with META_JSON_MODE=off.';
  if (upstreamStatus === 400 || upstreamStatus === 422) return 'The request body was refused. Compare buildRequest() in server/meta.js with the request format in the docs.';
  return 'See the detail above.';
}

function reportFailure(step, { code, upstreamStatus, detail, message }) {
  console.error(`\nFAIL at step: ${step}`);
  console.error(`  error code:       ${code ?? 'unknown'}`);
  console.error(`  HTTP status:      ${upstreamStatus ?? '(no HTTP response)'}`);
  console.error(`  message:          ${message}`);
  if (detail) console.error(`  detail (sanitized): ${detail}`);
  console.error(`  what to fix:      ${fixFor(code, upstreamStatus, detail ?? '')}`);
}

const model = createMetaClient({ apiKey: key, baseUrl, model: modelName, jsonMode });

// ---- Step 1: connectivity ---------------------------------------------------------------
console.log('\n[1/2] Connectivity: minimal request to the real Meta API...');
try {
  const started = performance.now();
  const text = await model.complete({ system: 'Reply with a JSON object only.', user: 'Return exactly {"ok": true}.' });
  console.log(`  OK in ${Math.round(performance.now() - started)}ms. Model replied: ${text.slice(0, 120).replace(/\s+/g, ' ')}`);
} catch (err) {
  if (err instanceof ModelError) reportFailure('connectivity', err);
  else reportFailure('connectivity', { message: String(err?.message ?? err) });
  process.exit(1);
}

// ---- Step 2: the real debugging workflow --------------------------------------------------
console.log('\n[2/2] Real workflow on the demo history...');
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
  for (const s of cart.demoSteps) {
    await call('POST', '/rooms/smoke/revisions', { sourceCode: s.code, label: s.label, author: s.author, challengeId: cart.id });
  }
  console.log(`  Saved ${cart.demoSteps.length} checkpoints.`);

  const { body: reg } = await call('POST', '/rooms/smoke/regression', {});
  console.log(`  Regression: ${reg.report.message} (${reg.report.executedRuns} test runs, ${reg.report.durationMs}ms)`);
  if (reg.report.outcome !== 'found') throw Object.assign(new Error('No regression found in the demo history.'), { step: 'locate' });

  const currentCode = cart.demoSteps.at(-1).code;
  console.log(`  Asking ${modelName} for root cause + patch...`);
  const an = await call('POST', '/rooms/smoke/analyze', {
    lastPassingId: reg.report.lastPassingRevisionId,
    firstFailingId: reg.report.firstFailingRevisionId,
    currentCode,
  });
  if (an.status !== 200) {
    reportFailure('analysis', { code: an.body.code?.replace(/^ai-/, ''), upstreamStatus: an.body.upstreamStatus, detail: an.body.detail, message: an.body.error });
    throw Object.assign(new Error('analysis failed'), { reported: true });
  }
  const a = an.body.analysis;
  console.log(`  Muse Spark answered in ${an.body.latencyMs}ms (attempts: ${an.body.attempts}). Response passed schema validation.`);
  console.log(`    What failed:  ${a.failedBehavior}`);
  console.log(`    What changed: ${a.whatChanged}`);
  console.log(`    Root cause:   ${a.probableRootCause}`);
  console.log(`    Why:          ${a.explanation}`);
  console.log(`    Uncertainty:  ${a.confidenceNotes}`);
  for (const e of a.edits) console.log(`    Patch:        - ${JSON.stringify(e.find)}\n                  + ${JSON.stringify(e.replace)}`);

  const { status: vs, body: ver } = await call('POST', '/verify', { challengeId: cart.id, sourceCode: currentCode, edits: a.edits });
  if (vs !== 200) throw Object.assign(new Error(`Verification request failed (${vs}): ${ver.error}`), { step: 'verify' });
  const failing = ver.run.cases.filter((c) => c.status !== 'passed').map((c) => `${c.name}: expected ${JSON.stringify(c.expected)}, got ${c.error ?? JSON.stringify(c.actual)}`);
  console.log(`  Verification on an isolated copy: ${ver.run.status} (${ver.run.passed}/${ver.run.total} tests)${failing.length ? `\n    ${failing.join('\n    ')}` : ''}`);
  if (ver.run.status !== 'passed') throw Object.assign(new Error('The model\'s patch did not pass verification (this is a real result, not an integration error).'), { step: 'verify' });

  // Apply under the same rule the UI enforces, then checkpoint and re-test.
  const decision = applyDecision({ liveCode: currentCode, sourceCode: currentCode, runStatus: ver.run.status });
  if (!decision.ok) throw Object.assign(new Error(decision.message), { step: 'apply' });
  const { body: applied } = await call('POST', '/rooms/smoke/revisions', { sourceCode: ver.patchedCode, label: `Apply verified patch (${modelName})`, author: 'smoke test', challengeId: cart.id });
  const { body: retest } = await call('POST', `/rooms/smoke/revisions/${applied.revision.id}/test`);
  console.log(`  Applied as checkpoint #${applied.revision.sequenceNumber}; re-test: ${retest.run.status} (${retest.run.passed}/${retest.run.total})`);
  ok = retest.run.status === 'passed';
  if (ok) console.log('\nSUCCESS: real Meta Muse Spark analysis → verified patch → applied → tests pass.');
} catch (err) {
  if (!err.reported) console.error(`\nFAIL at step: ${err.step ?? 'workflow'}\n  ${err.message}`);
} finally {
  await new Promise((r) => app.close(r));
}
process.exit(ok ? 0 : 1);
