// End-to-end checks against a running PeerCode server (deployed or local). Security first:
// if any security check fails, the AI pipeline is not run and the exit code is 1.
//
//   SERVER_URL=https://your-server.up.railway.app \
//   FRONTEND_ORIGIN=https://your-app.vercel.app \
//   PEERCODE_ACCESS_CODE=...   (only if the server sets DEBUGGER_ACCESS_CODE; never printed)
//   node e2e/deployed-api.mjs [--no-ai] [--expect-volume]
//
// --no-ai skips the Muse Spark pipeline (saves API credits). --expect-volume fails unless
// /health reports checkpoints on a persistent volume.
const SERVER = (process.env.SERVER_URL ?? '').replace(/\/+$/, '');
if (!/^https?:\/\//.test(SERVER)) {
  console.error('Set SERVER_URL, e.g. https://peercode-server.up.railway.app');
  process.exit(2);
}
const ORIGIN = process.env.FRONTEND_ORIGIN?.replace(/\/+$/, '');
const ACCESS = process.env.PEERCODE_ACCESS_CODE?.trim();
const noAi = process.argv.includes('--no-ai');
const expectVolume = process.argv.includes('--expect-volume');

let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
  return ok;
};
const call = async (method, path, body, { access = ACCESS, origin = ORIGIN } = {}) => {
  const headers = { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(origin ? { Origin: origin } : {}), ...(access ? { 'X-PeerCode-Access': access } : {}) };
  const res = await fetch(SERVER + path, { method, headers, body: body && JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // non-JSON (e.g. 403 from origin check without body)
  }
  return { status: res.status, body: json, text };
};

console.log(`Server: ${SERVER}${ORIGIN ? `  Origin: ${ORIGIN}` : ''}${ACCESS ? '  (access code set, not shown)' : ''}\n`);

// ---- 1. Health and security posture ----------------------------------------------------
const health = await call('GET', '/health');
const dbg = health.body?.debugger;
check(health.status === 200 && health.body?.ok, 'GET /health answers ok', `HTTP ${health.status}`);
check(dbg?.executionMode === 'restricted', 'execution mode is restricted', dbg?.executionMode);
check(dbg?.executionAvailable === true && dbg?.isolation?.ok === true, 'runner isolation self-check passed on the server', JSON.stringify(dbg?.isolation?.checks ?? dbg?.isolation));
check(dbg?.ai === true, 'Meta AI configured (MODEL_API_KEY present on the server)');
if (expectVolume) check(String(dbg?.persistence).startsWith('volume'), 'checkpoints stored on a persistent volume', dbg?.persistence);
else console.log(`info  checkpoint storage: ${dbg?.persistence}`);
console.log(`info  access code required: ${dbg?.accessCodeRequired}; outbound network from test processes restricted: ${dbg?.networkRestricted}`);

// ---- 2. Security checks ----------------------------------------------------------------
const foreign = await call('GET', '/api/challenges', undefined, { origin: 'https://evil.example' });
check(foreign.status === 403, 'API rejects a foreign Origin (ALLOWED_ORIGINS is set)', `HTTP ${foreign.status}`);

if (dbg?.accessCodeRequired) {
  const noCode = await call('POST', '/api/rooms/e2e-nocode/revisions', { sourceCode: 'x', challengeId: 'cart-total' }, { access: '' });
  check(noCode.status === 401, 'writes without the access code are refused', `HTTP ${noCode.status}`);
  if (!ACCESS) {
    console.error('\nThe server requires an access code: set PEERCODE_ACCESS_CODE to continue.');
    process.exit(1);
  }
}

const rawVerify = await call('POST', '/api/verify', {
  challengeId: 'cart-total',
  sourceCode: 'function calculateTotal(items) { return 0; }',
  edits: [{ find: 'return 0', replace: 'return 1' }],
});
check(rawVerify.status === 403 && rawVerify.body?.code === 'execution-restricted', 'client-supplied code + edits are not executed (/api/verify)', `HTTP ${rawVerify.status}`);

const room = `e2e-${Date.now().toString(36)}`;
const visitor = await call('POST', `/api/rooms/${room}/revisions`, { sourceCode: 'function calculateTotal() { return 0; } // visitor', label: 'visitor code', challengeId: 'cart-total' });
check(visitor.status === 200, 'visitor checkpoints can be saved', `HTTP ${visitor.status}`);
if (visitor.body?.revision) {
  const run = await call('POST', `/api/rooms/${room}/revisions/${visitor.body.revision.id}/test`);
  check(run.status === 403 && run.body?.code === 'execution-restricted', 'a visitor checkpoint is never executed', `HTTP ${run.status}`);
}
const guess = await call('POST', '/api/verify', { analysisId: '00000000-0000-0000-0000-000000000000' });
check(guess.status === 404, 'guessed analysis ids are rejected', `HTTP ${guess.status}`);

if (failures) {
  console.error(`\n${failures} check(s) failed. Not running the AI pipeline. Fix the server configuration first.`);
  process.exit(1);
}

// ---- 3. Real pipeline on both challenges (restricted mode) -----------------------------
if (noAi) {
  console.log('\nSkipping the AI pipeline (--no-ai).');
  process.exit(0);
}
const { body: listing } = await call('GET', '/api/challenges');
for (const c of listing.challenges) {
  const r = `${room}-${c.id}`;
  console.log(`\n== ${c.title} (${c.id})`);
  const ids = [];
  for (const s of c.demoSteps) ids.push((await call('POST', `/api/rooms/${r}/revisions`, { sourceCode: s.code, label: s.label, author: s.author, challengeId: c.id })).body.revision.id);
  const reg = (await call('POST', `/api/rooms/${r}/regression`, { challengeId: c.id })).body?.report;
  check(reg?.firstFailingRevisionId === ids[2] && reg?.lastPassingRevisionId === ids[1], 'regression localized at #3 (last pass #2)', reg?.message);
  const started = Date.now();
  const an = await call('POST', `/api/rooms/${r}/analyze`, { lastPassingId: ids[1], firstFailingId: ids[2], currentCode: c.demoSteps.at(-1).code });
  if (!check(an.status === 200, 'Muse Spark analysis returned a valid patch', an.status === 200 ? `${an.body.model}, ${Date.now() - started}ms, ${an.body.usage.totalTokens} tokens, ${an.body.responseFormat}` : `HTTP ${an.status} ${an.body?.code ?? ''} ${an.body?.error ?? an.text.slice(0, 200)}`)) continue;
  console.log(`      root cause: ${an.body.analysis.probableRootCause}`);
  const ver = await call('POST', '/api/verify', { analysisId: an.body.analysisId });
  check(ver.body?.run?.status === 'passed', 'patch verified on an isolated copy', `${ver.body?.run?.passed}/${ver.body?.run?.total}`);
  if (ver.body?.run?.status !== 'passed') continue;
  const applied = (await call('POST', `/api/rooms/${r}/revisions`, { sourceCode: ver.body.patchedCode, label: 'Apply verified patch', challengeId: c.id })).body.revision;
  const re = await call('POST', `/api/rooms/${r}/revisions/${applied.id}/test`);
  check(re.body?.run?.status === 'passed', 'applied checkpoint re-tests green', `${re.body?.run?.passed}/${re.body?.run?.total}`);
  await call('DELETE', `/api/rooms/${r}/revisions`, { challengeId: c.id });
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
