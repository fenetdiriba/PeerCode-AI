// What code the server is willing to execute.
//
// The test runner (runner.js) is a constrained child process, NOT a sandbox: Node's
// permission model doesn't block outbound network, and `vm` isn't a security boundary. So a
// public deployment must never run code that a visitor wrote. Two modes:
//
//   restricted (default): only code whose SHA-256 is on an allowlist is executed. The
//     allowlist holds each challenge's server-owned demo checkpoints and starter code, plus
//     patched code the server itself produced (model edits applied to allowlisted code) and
//     verified. Visitors can still type and checkpoint anything; it just won't run.
//   local: anything runs. For a developer's own machine only; must be set explicitly.
//
// In restricted mode the model only ever sees server-owned code (analyze requires allowlisted
// inputs), so visitors can't steer its output with prompt injection, and its edits are also
// screened below before they run. The screen is defense in depth, not the main guarantee.
import { HttpError } from './http.js';
import { hashCode } from './revisions.js';

export const EXECUTION_MODES = ['restricted', 'local'];

/** EXECUTION_MODE=local opts in to running arbitrary code; anything else is restricted. */
export function executionModeFromEnv(env) {
  return env.EXECUTION_MODE?.trim() === 'local' ? 'local' : 'restricted';
}

// Identifiers that have no business in a fix to these challenges and are the usual building
// blocks of sandbox escapes, host access, or network/timer use.
const DENIED = /\b(constructor|prototype|__proto__|__defineGetter__|__lookupGetter__|globalThis|global|self|window|process|require|import|eval|Function|Reflect|Proxy|fetch|XMLHttpRequest|WebSocket|Worker|SharedArrayBuffer|Atomics|WebAssembly|setTimeout|setInterval|setImmediate|queueMicrotask|arguments|caller|callee|module|exports|Symbol|getPrototypeOf|setPrototypeOf|defineProperty|with)\b/;
const MAX_SCREENED_EDITS = 3;
const MAX_SCREENED_REPLACE_CHARS = 800;

/**
 * Screen model-generated edits before they run in restricted mode.
 * @param {{ find: string, replace: string }[]} edits
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function screenEdits(edits) {
  if (edits.length > MAX_SCREENED_EDITS) return { ok: false, error: `the public demo accepts at most ${MAX_SCREENED_EDITS} edits` };
  for (const [i, e] of edits.entries()) {
    if (e.replace.length > MAX_SCREENED_REPLACE_CHARS) return { ok: false, error: `edit ${i + 1} is longer than ${MAX_SCREENED_REPLACE_CHARS} characters` };
    // Screen the whole replacement (stricter than diffing out the unchanged part). Computed
    // property access with a string literal is also refused: it's how denied names get spelled.
    const hit = e.replace.match(DENIED) ?? e.replace.match(/\[\s*['"`]/);
    if (hit) return { ok: false, error: `edit ${i + 1} uses "${hit[0]}", which the public demo does not run` };
  }
  return { ok: true };
}

/**
 * @param {{ mode?: 'restricted' | 'local', challenges: Record<string, import('./challenges.js').Challenge> }} options
 */
export function createExecutionPolicy({ mode = 'restricted', challenges }) {
  /** `${challengeId}:${sha256}` of code that may run in restricted mode */
  const trusted = new Set();
  const key = (challengeId, code) => `${challengeId}:${hashCode(code)}`;
  for (const c of Object.values(challenges)) {
    trusted.add(key(c.id, c.starterCode));
    for (const step of c.demoSteps) trusted.add(key(c.id, step.code));
  }

  return {
    mode,
    isTrusted: (challengeId, code) => mode === 'local' || trusted.has(key(challengeId, code)),
    /** Add server-produced code (a verified patch of trusted code) to the allowlist. */
    trust: (challengeId, code) => void trusted.add(key(challengeId, code)),
    /** Throw a 403 unless this code may run here. */
    assertExecutable(challengeId, code, what = 'This code') {
      if (mode === 'local' || trusted.has(key(challengeId, code))) return;
      throw new HttpError(
        403,
        `${what} isn't part of the built-in scenario, so this public server won't run it (it doesn't execute visitor-written code). Load the demo scenario, or run PeerCode locally with EXECUTION_MODE=local to test your own edits.`,
        { code: 'execution-restricted' },
      );
    },
  };
}
