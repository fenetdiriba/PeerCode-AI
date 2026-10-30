// End-to-end over HTTP with a real runner and a scripted model:
// baseline → failing revision → regression identification → model analysis → patch → verification.
// The model is mocked here; the real Meta API is exercised separately by `npm run smoke:meta`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyDecision } from '../shared/patch-safety.js';
import { createApp } from './app.js';
import { CHALLENGES } from './challenges.js';
import { createRevisionStore } from './revisions.js';
import { createRunner } from './runner.js';

const cart = CHALLENGES['cart-total'];
const fix = {
  failedBehavior: 'Totals ignore quantity.',
  whatChanged: 'The reducer stopped multiplying by quantity.',
  probableRootCause: 'item.price is summed instead of item.price * item.quantity.',
  explanation: 'quantity-3 test expects 12, gets 4.',
  edits: [{ find: 'sum + item.price,', replace: 'sum + item.price * item.quantity,' }],
  confidenceNotes: 'Negative quantities are untested.',
};

function scriptedModel(replies) {
  const prompts = [];
  return {
    prompts,
    client: {
      model: 'scripted-test-model',
      available: true,
      complete: async ({ user }) => {
        prompts.push(user);
        const next = replies.shift();
        if (next instanceof Error) throw next;
        return next;
      },
    },
  };
}

async function withServer(model, fn) {
  const app = createApp({ debuggerDeps: { store: createRevisionStore(), runner: createRunner(), model } });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}/api`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  try {
    await fn(call);
  } finally {
    await new Promise((r) => app.close(r));
  }
}

async function seedDemo(call, room) {
  const ids = [];
  for (const step of cart.demoSteps) {
    const { body } = await call('POST', `/rooms/${room}/revisions`, { sourceCode: step.code, label: step.label, author: step.author, challengeId: 'cart-total' });
    ids.push(body.revision.id);
  }
  return ids;
}

test('full pipeline: locate, analyze, verify, and the apply rule', async () => {
  const { client, prompts } = scriptedModel([JSON.stringify(fix)]);
  await withServer(client, async (call) => {
    const ids = await seedDemo(call, 'pipeline');

    const listed = await call('GET', '/rooms/pipeline/revisions');
    assert.deepEqual(listed.body.revisions.map((r) => r.sequenceNumber), [1, 2, 3, 4, 5]);

    const { body: reg } = await call('POST', '/rooms/pipeline/regression', {});
    assert.equal(reg.report.outcome, 'found');
    assert.equal(reg.report.firstFailingRevisionId, ids[2]); // "Simplify reducer"
    assert.equal(reg.report.lastPassingRevisionId, ids[1]);
    assert.equal(reg.report.firstFailingRun.status, 'failed');

    const currentCode = cart.demoSteps.at(-1).code;
    const { status, body: an } = await call('POST', '/rooms/pipeline/analyze', {
      lastPassingId: reg.report.lastPassingRevisionId,
      firstFailingId: reg.report.firstFailingRevisionId,
      currentCode,
    });
    assert.equal(status, 200, JSON.stringify(an));
    assert.equal(an.model, 'scripted-test-model');
    assert.match(prompts[0], /expected 12, got 4/);

    const { body: ver } = await call('POST', '/verify', { challengeId: 'cart-total', sourceCode: currentCode, edits: an.analysis.edits });
    assert.equal(ver.run.status, 'passed');
    assert.equal(ver.run.passed, cart.tests.length);
    assert.equal(ver.sourceHash, an.sourceHash);

    // Apply is allowed only while the live code still equals what was verified.
    assert.deepEqual(applyDecision({ liveCode: currentCode, sourceCode: currentCode, runStatus: ver.run.status }), { ok: true });
    assert.equal(applyDecision({ liveCode: currentCode + '// partner edit\n', sourceCode: currentCode, runStatus: 'passed' }).reason, 'conflict');
    assert.equal(applyDecision({ liveCode: currentCode, sourceCode: currentCode, runStatus: 'failed' }).reason, 'tests-not-passing');
    assert.equal(applyDecision({ liveCode: currentCode, sourceCode: currentCode, runStatus: null }).reason, 'not-verified');
  });
});

test('a wrong patch is reported as failing verification, not hidden', async () => {
  await withServer(scriptedModel([]).client, async (call) => {
    const code = cart.demoSteps[2].code;
    const { body } = await call('POST', '/verify', { challengeId: 'cart-total', sourceCode: code, edits: [{ find: 'sum + item.price,', replace: 'sum + item.price * 2,' }] });
    assert.equal(body.run.status, 'failed');
    const stale = await call('POST', '/verify', { challengeId: 'cart-total', sourceCode: code, edits: [{ find: 'nope', replace: 'x' }] });
    assert.equal(stale.status, 409);
  });
});

test('invalid model output is retried once, then reported as an error', async () => {
  const { client, prompts } = scriptedModel(['The bug is on line 5.', '{"still": "wrong"}']);
  await withServer(client, async (call) => {
    const ids = await seedDemo(call, 'invalid');
    const res = await call('POST', '/rooms/invalid/analyze', { lastPassingId: ids[1], firstFailingId: ids[2], currentCode: cart.demoSteps[2].code });
    assert.equal(res.status, 502);
    assert.equal(res.body.code, 'ai-invalid-output');
    assert.equal(prompts.length, 2);
    assert.match(prompts[1], /previous answer was rejected/);
  });
});

test('a reply that validates on retry succeeds', async () => {
  const { client } = scriptedModel(['nope', JSON.stringify(fix)]);
  await withServer(client, async (call) => {
    const ids = await seedDemo(call, 'retry');
    const res = await call('POST', '/rooms/retry/analyze', { lastPassingId: ids[1], firstFailingId: ids[2], currentCode: cart.demoSteps[2].code });
    assert.equal(res.status, 200);
    assert.equal(res.body.attempts, 2);
  });
});

test('AI unavailable and API failures surface as errors with codes', async () => {
  await withServer({ model: 'muse-spark-1.3', available: false, complete: async () => '' }, async (call) => {
    const ids = await seedDemo(call, 'nokey');
    const res = await call('POST', '/rooms/nokey/analyze', { lastPassingId: ids[1], firstFailingId: ids[2], currentCode: '' });
    assert.equal(res.status, 503);
    assert.equal(res.body.code, 'ai-unavailable');
    const ch = await call('GET', '/challenges');
    assert.equal(ch.body.ai.available, false);
  });
  const { ModelError } = await import('./meta.js');
  await withServer(scriptedModel([new ModelError('rate-limit', 'slow down', 429)]).client, async (call) => {
    const ids = await seedDemo(call, 'limited');
    const res = await call('POST', '/rooms/limited/analyze', { lastPassingId: ids[1], firstFailingId: ids[2], currentCode: cart.demoSteps[2].code });
    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'ai-rate-limit');
  });
});

test('analyze refuses pairs that are not passing → failing', async () => {
  await withServer(scriptedModel([]).client, async (call) => {
    const ids = await seedDemo(call, 'pairs');
    const res = await call('POST', '/rooms/pairs/analyze', { lastPassingId: ids[2], firstFailingId: ids[3], currentCode: '' });
    assert.equal(res.status, 409);
    const backwards = await call('POST', '/rooms/pairs/analyze', { lastPassingId: ids[3], firstFailingId: ids[1], currentCode: '' });
    assert.equal(backwards.status, 400);
  });
});

test('per-revision test endpoint and input validation', async () => {
  await withServer(scriptedModel([]).client, async (call) => {
    const ids = await seedDemo(call, 'single');
    const ok = await call('POST', `/rooms/single/revisions/${ids[0]}/test`);
    assert.equal(ok.body.run.status, 'passed');
    assert.equal((await call('POST', '/rooms/single/revisions/missing/test')).status, 404);
    assert.equal((await call('POST', '/rooms/single/revisions', { sourceCode: 'x', challengeId: 'nope' })).status, 400);
    assert.equal((await call('GET', '/rooms/BAD!/revisions')).status, 404);
  });
});
