// Deterministic fault localization over recorded revisions.
//
// Goal: find the first observed failing revision of the regression that persists at the head,
// i.e. the earliest revision F such that F..head all fail and F-1 passes.
//
// 1. Test the baseline (must pass) and the head (must fail); otherwise there's nothing to find.
// 2. Bisect between them. That takes O(log n) runs but assumes outcomes are monotonic
//    (pass…pass fail…fail).
// 3. Verify with a backward linear scan from the head until the first passing revision. This
//    is exact for "the failure that persists at the head" whatever happened earlier. If it
//    disagrees with bisection, or any revision tested before the boundary failed, outcomes
//    were not monotonic: the linear answer wins and the report says so.
// Results are cached by content hash, since identical code gives identical deterministic results.
//
// A failed test only shows *where* behavior changed, not which line caused it. The report
// names revisions; the diff between them narrows the investigation.

/**
 * @typedef {import('./revisions.js').CodeRevision} CodeRevision
 * @typedef {import('./runner.js').TestRun} TestRun
 * @typedef {{ revisionId: string, sequenceNumber: number, status: TestRun['status'], errorKind?: string, passed: number, total: number }} Observation
 * @typedef {{
 *   outcome: 'found' | 'no-regression' | 'baseline-failing' | 'infrastructure-error' | 'not-enough-revisions',
 *   strategy: 'bisect+verify' | 'linear',
 *   baselineRevisionId: string | null,
 *   lastPassingRevisionId: string | null,
 *   firstFailingRevisionId: string | null,
 *   nonMonotonic: boolean,
 *   testsRun: number,
 *   revisionsInRange: number,
 *   observations: Observation[],
 *   firstFailingRun: TestRun | null,
 *   message: string,
 * }} RegressionReport
 */

const isPass = (run) => run.status === 'passed';

/**
 * @param {CodeRevision[]} revisions ordered by sequenceNumber
 * @param {(revision: CodeRevision) => Promise<TestRun>} test
 * @param {{ baselineId?: string, strategy?: 'bisect+verify' | 'linear' }} [options]
 * @returns {Promise<RegressionReport>}
 */
export async function locateRegression(revisions, test, { baselineId, strategy = 'bisect+verify' } = {}) {
  const ordered = [...revisions].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  const start = baselineId ? ordered.findIndex((r) => r.id === baselineId) : 0;
  const range = start >= 0 ? ordered.slice(start) : [];

  /** @type {Map<number, TestRun>} index in range -> run */
  const results = new Map();
  /** @type {Map<string, TestRun>} contentHash -> run */
  const byHash = new Map();
  let testsRun = 0;

  class InfrastructureError extends Error {}

  const run = async (i) => {
    if (results.has(i)) return results.get(i);
    const rev = range[i];
    let r = byHash.get(rev.contentHash);
    if (!r) {
      r = await test(rev);
      testsRun++;
      // An infrastructure failure says nothing about the code; stop instead of guessing.
      if (r.status === 'error' && r.errorKind === 'infrastructure') throw new InfrastructureError(r.message ?? 'Test infrastructure failed.');
      byHash.set(rev.contentHash, r);
    }
    results.set(i, r);
    return r;
  };

  const report = (fields) => {
    const observations = [...results.entries()]
      .sort(([a], [b]) => a - b)
      .map(([i, r]) => ({
        revisionId: range[i].id,
        sequenceNumber: range[i].sequenceNumber,
        status: r.status,
        ...(r.errorKind ? { errorKind: r.errorKind } : {}),
        passed: r.passed,
        total: r.total,
      }));
    return {
      strategy,
      baselineRevisionId: range[0]?.id ?? null,
      lastPassingRevisionId: null,
      firstFailingRevisionId: null,
      nonMonotonic: false,
      firstFailingRun: null,
      ...fields,
      testsRun,
      revisionsInRange: range.length,
      observations,
    };
  };

  if (range.length < 2) {
    return report({ outcome: 'not-enough-revisions', message: 'Create at least two checkpoints (a passing baseline and a later one).' });
  }

  try {
    const last = range.length - 1;
    if (!isPass(await run(0))) {
      return report({ outcome: 'baseline-failing', message: 'The baseline checkpoint does not pass its tests, so it cannot anchor a search. Pick an earlier passing baseline.' });
    }
    if (isPass(await run(last))) {
      return report({ outcome: 'no-regression', lastPassingRevisionId: range[last].id, message: 'The latest checkpoint passes every test. No regression to locate.' });
    }

    let firstFail;
    if (strategy === 'linear') {
      for (let i = 1; i <= last; i++) await run(i);
      firstFail = last;
      while (firstFail > 1 && !isPass(results.get(firstFail - 1))) firstFail--;
    } else {
      let lo = 0;
      let hi = last;
      while (hi - lo > 1) {
        const mid = (lo + hi) >>> 1;
        if (isPass(await run(mid))) lo = mid;
        else hi = mid;
      }
      // Verification: walk back from the head over the persisting failure.
      firstFail = last;
      while (firstFail > 1 && !isPass(await run(firstFail - 1))) firstFail--;
    }

    // Any tested revision before the boundary that didn't pass means outcomes flipped. This
    // also catches bisection disagreeing with the scan: its failing midpoint lies before it.
    let nonMonotonic = false;
    for (const [i, r] of results) if (i < firstFail - 1 && !isPass(r)) nonMonotonic = true;

    const firstFailingRun = results.get(firstFail);
    return report({
      outcome: 'found',
      lastPassingRevisionId: range[firstFail - 1].id,
      firstFailingRevisionId: range[firstFail].id,
      nonMonotonic,
      firstFailingRun,
      message: nonMonotonic
        ? `Test outcomes were not monotonic (some earlier checkpoints also failed). Checkpoint #${range[firstFail].sequenceNumber} is where the failure that persists to the latest checkpoint first appears.`
        : `Checkpoint #${range[firstFail].sequenceNumber} is the first observed failing checkpoint; #${range[firstFail - 1].sequenceNumber} is the last passing one.`,
    });
  } catch (err) {
    if (err instanceof InfrastructureError) {
      return report({ outcome: 'infrastructure-error', message: `Could not finish: ${err.message}` });
    }
    throw err;
  }
}
