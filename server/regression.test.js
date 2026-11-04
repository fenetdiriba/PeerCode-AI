import assert from 'node:assert/strict';
import { test } from 'node:test';
import { locateRegression } from './regression.js';

/** Revisions whose test outcome is given by a pattern like "PPFFF" (E = infrastructure error, T = timeout). */
function fixture(pattern) {
  const revisions = [...pattern].map((_, i) => ({ id: `r${i + 1}`, sequenceNumber: i + 1, contentHash: `h${i + 1}`, sourceCode: '' }));
  const calls = [];
  const test = async (rev) => {
    calls.push(rev.id);
    const ch = pattern[rev.sequenceNumber - 1];
    if (ch === 'P') return { status: 'passed', passed: 1, total: 1, cases: [] };
    if (ch === 'F') return { status: 'failed', passed: 0, total: 1, cases: [] };
    if (ch === 'T') return { status: 'error', errorKind: 'timeout', passed: 0, total: 1, cases: [] };
    return { status: 'error', errorKind: 'infrastructure', message: 'spawn failed', passed: 0, total: 1, cases: [] };
  };
  return { revisions, test, calls };
}

test('finds the first failing revision in a monotonic history', async () => {
  for (const pattern of ['PF', 'PPF', 'PFFFF', 'PPPPPPPF', 'PPPPFFFFFFFFFFF']) {
    const { revisions, test } = fixture(pattern);
    const report = await locateRegression(revisions, test);
    const first = pattern.indexOf('F') + 1;
    assert.equal(report.outcome, 'found', pattern);
    assert.equal(report.firstFailingRevisionId, `r${first}`, pattern);
    assert.equal(report.lastPassingRevisionId, `r${first - 1}`, pattern);
    assert.equal(report.nonMonotonic, false, pattern);
  }
});

test('bisection tests fewer revisions than a linear scan on long passing prefixes', async () => {
  const pattern = 'P'.repeat(60) + 'FF';
  const { revisions, test, calls } = fixture(pattern);
  const report = await locateRegression(revisions, test);
  assert.equal(report.firstFailingRevisionId, 'r61');
  assert.ok(report.testsRun < 15, `ran ${report.testsRun}`);
  assert.equal(report.testsRun, calls.length);
});

test('non-monotonic outcomes: the persisting failure wins and is flagged', async () => {
  // Fails at 2, recovers at 3, fails again from 5 onward.
  const { revisions, test } = fixture('PFPPFFF');
  const report = await locateRegression(revisions, test);
  assert.equal(report.outcome, 'found');
  assert.equal(report.firstFailingRevisionId, 'r5');
  assert.equal(report.lastPassingRevisionId, 'r4');

  // Bisection alone lands on r3 (its first midpoint fails, r2 passes), but r4 passes again;
  // the backward scan corrects the boundary and the report says outcomes flipped.
  const tricky = fixture('PPFPFF');
  const r2 = await locateRegression(tricky.revisions, tricky.test);
  assert.equal(r2.firstFailingRevisionId, 'r5');
  assert.equal(r2.nonMonotonic, true);
});

test('linear strategy tests every revision and finds the same answer', async () => {
  const { revisions, test, calls } = fixture('PPFPFF');
  const report = await locateRegression(revisions, test, { strategy: 'linear' });
  assert.equal(report.firstFailingRevisionId, 'r5');
  assert.equal(report.nonMonotonic, true);
  assert.equal(calls.length, 6);
});

test('baseline failing, no regression, and too few revisions are reported, not guessed', async () => {
  assert.equal((await locateRegression(fixture('FFF').revisions, fixture('FFF').test)).outcome, 'baseline-failing');
  assert.equal((await locateRegression(fixture('PPP').revisions, fixture('PPP').test)).outcome, 'no-regression');
  assert.equal((await locateRegression(fixture('P').revisions, fixture('P').test)).outcome, 'not-enough-revisions');
});

test('a custom baseline narrows the range', async () => {
  const { revisions, test } = fixture('FPPF');
  const report = await locateRegression(revisions, test, { baselineId: 'r2' });
  assert.equal(report.firstFailingRevisionId, 'r4');
  assert.equal(report.revisionsInRange, 3);
});

test('timeouts count as failing; infrastructure errors abort the search', async () => {
  const timeout = fixture('PPTT');
  const r = await locateRegression(timeout.revisions, timeout.test);
  assert.equal(r.firstFailingRevisionId, 'r3');
  assert.equal(r.observations.find((o) => o.revisionId === 'r3').errorKind, 'timeout');

  const infra = fixture('PPEF');
  const i = await locateRegression(infra.revisions, infra.test);
  assert.equal(i.outcome, 'infrastructure-error');
  assert.equal(i.firstFailingRevisionId, null);
});

test('identical code is tested once (cache by content hash)', async () => {
  const { revisions, test, calls } = fixture('PPFFF');
  for (const r of revisions.slice(2)) r.contentHash = 'same';
  await locateRegression(revisions, test, { strategy: 'linear' });
  assert.equal(calls.filter((id) => ['r3', 'r4', 'r5'].includes(id)).length, 1);
});
