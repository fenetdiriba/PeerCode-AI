import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHALLENGES } from './challenges.js';
import { checkIsolation, compileSource, createRunner, parseHarnessOutput } from './runner.js';

const cart = CHALLENGES['cart-total'];
const runner = createRunner({ timeoutMs: 4000, caseTimeoutMs: 500 });

test('parseHarnessOutput: a full pass', () => {
  const out = JSON.stringify({ status: 'passed', cases: [{ name: 'a', status: 'passed' }, { name: 'b', status: 'passed' }], logs: ['hi'] });
  const run = parseHarnessOutput(`noise\n${out}\n`, 2);
  assert.equal(run.status, 'passed');
  assert.equal(run.passed, 2);
  assert.deepEqual(run.logs, ['hi']);
});

test('parseHarnessOutput never reports a pass it cannot back up', () => {
  // Claims passed but a case is missing.
  assert.equal(parseHarnessOutput(JSON.stringify({ status: 'passed', cases: [{ name: 'a', status: 'passed' }] }), 2).status, 'error');
  // Garbage output is a crash, not a pass.
  const garbage = parseHarnessOutput('Segmentation fault', 2);
  assert.equal(garbage.status, 'error');
  assert.equal(garbage.errorKind, 'crash');
  // Unknown status values become errors.
  assert.equal(parseHarnessOutput(JSON.stringify({ status: 'great', cases: [] }), 0).status, 'error');
});

test('parseHarnessOutput keeps failure and timeout details', () => {
  const failed = parseHarnessOutput(JSON.stringify({ status: 'failed', cases: [{ name: 'a', status: 'failed', expected: 12, actual: 4 }] }), 1);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.cases[0].actual, 4);
  const timeout = parseHarnessOutput(JSON.stringify({ status: 'error', errorKind: 'timeout', cases: [] }), 1);
  assert.equal(timeout.errorKind, 'timeout');
});

test('compileSource strips types and reports syntax errors', () => {
  assert.equal(compileSource('const n: number = 1;').ok, true);
  assert.equal(compileSource('function (').ok, false);
});

test('runner: baseline passes, the regression fails with real values', async () => {
  const pass = await runner.runTests(cart.demoSteps[0].code, cart);
  assert.equal(pass.status, 'passed');
  assert.equal(pass.passed, cart.tests.length);

  const fail = await runner.runTests(cart.demoSteps[2].code, cart);
  assert.equal(fail.status, 'failed');
  const q3 = fail.cases.find((c) => c.name === 'single item, quantity 3');
  assert.deepEqual([q3.status, q3.expected, q3.actual], ['failed', 12, 4]);
});

test('runner distinguishes compile errors, runtime errors, timeouts and missing functions', async () => {
  const compile = await runner.runTests('function calculateTotal( {', cart);
  assert.deepEqual([compile.status, compile.errorKind], ['error', 'compile']);

  const runtime = await runner.runTests('throw new Error("boom"); function calculateTotal() { return 0; }', cart);
  assert.deepEqual([runtime.status, runtime.errorKind], ['error', 'runtime']);

  const timeout = await runner.runTests('function calculateTotal() { for (;;) {} }', cart);
  assert.deepEqual([timeout.status, timeout.errorKind], ['error', 'timeout']);

  const missing = await runner.runTests('function somethingElse() {}', cart);
  assert.equal(missing.status, 'failed');
  assert.match(missing.cases[0].error, /calculateTotal is not defined/);
});

test('runner: candidate code gets no environment, require or eval', async () => {
  const probe = (expr) => `function calculateTotal() { return ${expr}; }`;
  const env = await runner.runTests(probe('typeof process'), { ...cart, tests: [{ name: 'p', fn: 'calculateTotal', args: [], expected: 'undefined' }] });
  assert.equal(env.status, 'passed');
  const req = await runner.runTests(probe('require("fs")'), cart);
  assert.match(req.cases[0].error, /Imports are not available/);
  const escape = await runner.runTests('const p = this.constructor.constructor("return process")(); function calculateTotal() { return 0; }', cart);
  assert.equal(escape.status, 'error');
});

test('runner: async scenario tests with deferred promises are deterministic', async () => {
  const search = CHALLENGES['search-race'];
  const base = await runner.runTests(search.demoSteps[0].code, search);
  assert.equal(base.status, 'passed', JSON.stringify(base));
  const runs = await Promise.all([1, 2, 3, 4, 5].map(() => runner.runTests(search.demoSteps[2].code, search)));
  for (const r of runs) assert.equal(r.passed, search.tests.length - 2);
  assert.equal(new Set(runs.map((r) => JSON.stringify(r.cases))).size, 1);
});

test('runner: a promise that never settles is a per-case timeout, not a hang', async () => {
  const neverSettles = { ...cart, language: 'javascript', tests: [{ name: 'hangs', fn: 'calculateTotal', args: [], expected: 0 }] };
  const r = await runner.runTests('function calculateTotal() { return new Promise(() => {}); }', neverSettles);
  assert.deepEqual([r.status, r.errorKind], ['error', 'timeout']);
});

test('isolation self-check passes on this Node and fails without the permission model', async () => {
  const ok = await checkIsolation();
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.deepEqual(Object.values(ok.checks).every(Boolean), true);
  // A "node" that ignores the flags (here: a shell that prints all-false) must fail the check.
  const fake = await checkIsolation({ nodePath: '/bin/echo' });
  assert.equal(fake.ok, false);
});
