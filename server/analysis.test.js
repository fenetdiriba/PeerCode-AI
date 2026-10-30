import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDebugPrompt, extractJsonObject, parseAnalysis } from './analysis.js';
import { CHALLENGES } from './challenges.js';
import { applyEdits, validateEdits } from './patches.js';

const cart = CHALLENGES['cart-total'];
const buggy = cart.demoSteps[2].code;
const goodReply = {
  failedBehavior: 'Totals ignore quantity.',
  whatChanged: 'The reducer stopped multiplying by quantity.',
  probableRootCause: 'item.price is added instead of item.price * item.quantity.',
  explanation: 'Quantity-3 test expects 12 but gets 4.',
  edits: [{ find: 'sum + item.price,', replace: 'sum + item.price * item.quantity,' }],
  confidenceNotes: 'Tests do not cover negative quantities.',
};

test('parseAnalysis accepts a valid reply and applies its patch', () => {
  const r = parseAnalysis(JSON.stringify(goodReply), buggy);
  assert.equal(r.ok, true);
  assert.equal(r.analysis.probableRootCause, goodReply.probableRootCause);
  assert.match(r.patchedCode, /sum \+ item\.price \* item\.quantity,/);
});

test('parseAnalysis tolerates fences and stray text around the JSON', () => {
  assert.equal(parseAnalysis('Here you go:\n```json\n' + JSON.stringify(goodReply) + '\n```', buggy).ok, true);
  assert.equal(parseAnalysis('Sure! ' + JSON.stringify(goodReply) + ' Hope that helps.', buggy).ok, true);
});

test('parseAnalysis rejects invalid replies with a reason', () => {
  assert.match(parseAnalysis('I think the bug is on line 5.', buggy).error, /JSON object/);
  assert.match(parseAnalysis(JSON.stringify({ ...goodReply, probableRootCause: '' }), buggy).error, /probableRootCause/);
  assert.match(parseAnalysis(JSON.stringify({ ...goodReply, edits: [] }), buggy).error, /no edits/);
  assert.match(parseAnalysis(JSON.stringify({ ...goodReply, edits: [{ find: 'not in code', replace: 'x' }] }), buggy).error, /not found/);
  // "item.price" appears in several places, so it's ambiguous.
  assert.match(parseAnalysis(JSON.stringify({ ...goodReply, edits: [{ find: 'item', replace: 'it' }] }), buggy).error, /more than once/);
  assert.match(parseAnalysis('[1,2]', buggy).error, /JSON object/);
});

test('extractJsonObject returns null for non-JSON', () => {
  assert.equal(extractJsonObject('no braces'), null);
  assert.equal(extractJsonObject('{ not: json }'), null);
  assert.equal(extractJsonObject(undefined), null);
});

test('buildDebugPrompt includes the diff, failures and current code', () => {
  const prompt = buildDebugPrompt({
    challenge: cart,
    lastPassing: { sequenceNumber: 2, label: 'Add formatPrice helper', author: 'A', sourceCode: cart.demoSteps[1].code },
    firstFailing: { sequenceNumber: 3, label: 'Simplify reducer', author: 'B', sourceCode: buggy },
    failingRun: { status: 'failed', passed: 2, total: 5, cases: [{ name: 'single item, quantity 3', status: 'failed', expected: 12, actual: 4 }], logs: [], durationMs: 1 },
    currentCode: buggy,
  });
  assert.match(prompt, /- {5}\(sum, item\) => sum \+ item\.price \* item\.quantity,/);
  assert.match(prompt, /\+ {5}\(sum, item\) => sum \+ item\.price,/);
  assert.match(prompt, /single item, quantity 3: expected 12, got 4/);
  assert.match(prompt, /<<<CODE\n[\s\S]*calculateTotal[\s\S]*CODE>>>/);
});

test('applyEdits applies non-overlapping unique edits regardless of order', () => {
  const src = 'a = 1;\nb = 2;\nc = 3;\n';
  const r = applyEdits(src, [{ find: 'c = 3', replace: 'c = 30' }, { find: 'a = 1', replace: 'a = 10' }]);
  assert.deepEqual(r, { ok: true, code: 'a = 10;\nb = 2;\nc = 30;\n' });
});

test('applyEdits rejects missing, ambiguous and overlapping edits', () => {
  assert.equal(applyEdits('x x', [{ find: 'x', replace: 'y' }]).ok, false);
  assert.equal(applyEdits('abc', [{ find: 'z', replace: 'y' }]).ok, false);
  const overlap = applyEdits('abcdef', [{ find: 'abcd', replace: '1' }, { find: 'cdef', replace: '2' }]);
  assert.equal(overlap.ok, false);
  assert.match(overlap.error, /overlap/);
});

test('validateEdits', () => {
  assert.equal(validateEdits([{ find: 'a', replace: 'b' }]).ok, true);
  assert.equal(validateEdits('nope').ok, false);
  assert.equal(validateEdits([{ find: 'a' }]).ok, false);
  assert.equal(validateEdits([{ find: 'a', replace: 'a' }]).ok, false);
  assert.equal(validateEdits(Array(9).fill({ find: 'a', replace: 'b' })).ok, false);
  // Extra fields from the model are dropped.
  assert.deepEqual(validateEdits([{ find: 'a', replace: 'b', why: 'x' }]).edits, [{ find: 'a', replace: 'b' }]);
});
