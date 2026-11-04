// Whether a verified patch may be applied to the live, collaborative document.
// A verification is only evidence about the exact code it ran against. If anyone edited the
// file since, the evidence no longer applies: the user must re-verify against the live code.

/**
 * @param {{
 *   liveCode: string,
 *   sourceCode: string,
 *   runStatus: 'passed' | 'failed' | 'error' | null,
 * }} p
 * @returns {{ ok: true } | { ok: false, reason: 'not-verified' | 'tests-not-passing' | 'conflict', message: string }}
 */
export function applyDecision({ liveCode, sourceCode, runStatus }) {
  if (runStatus == null) return { ok: false, reason: 'not-verified', message: 'Verify the patch before applying it.' };
  if (runStatus !== 'passed') {
    return { ok: false, reason: 'tests-not-passing', message: 'The patched code did not pass verification, so it cannot be applied.' };
  }
  if (liveCode !== sourceCode) {
    return {
      ok: false,
      reason: 'conflict',
      message: 'The live code changed after this patch was verified (a collaborator may have edited it). Re-verify against the live code before applying.',
    };
  }
  return { ok: true };
}
