// Runs inside a separate Node process started by runner.js with the permission model on
// (no fs writes, no child processes, no workers) and an empty environment.
// Reads { js, support, tests, caseTimeoutMs } from stdin and writes one JSON result to stdout.
// `support` is trusted, challenge-owned test code (e.g. scenario drivers with deferred
// promises); it runs after the candidate code in the same context. A test case may return a
// promise: it is awaited with a per-case timeout. No timers exist in the context, so async
// tests are driven by explicitly resolved promises and are deterministic.
//
// Candidate code runs in a fresh vm context with no require/process/fetch. vm is NOT a
// security boundary; the process-level restrictions above are the real (partial) guard.
'use strict';
const vm = require('node:vm');
const { isDeepStrictEqual } = require('node:util');

const MAX_LOG_LINES = 100;
const MAX_LINE = 500;

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
  });
}

const errorText = (err) => (err && err.name ? `${err.name}: ${err.message}` : String(err)).slice(0, MAX_LINE);

async function main() {
  const { js, support, tests, caseTimeoutMs } = JSON.parse(await readStdin());
  const logs = [];
  const log = (...args) => {
    if (logs.length < MAX_LOG_LINES) logs.push(args.map((a) => (typeof a === 'string' ? a : safeJson(a))).join(' ').slice(0, MAX_LINE));
  };
  const moduleObj = { exports: {} };
  const sandbox = {
    console: { log, info: log, debug: log, warn: log, error: log },
    module: moduleObj,
    exports: moduleObj.exports,
    require: () => {
      throw new Error('Imports are not available in the test runner.');
    },
  };
  const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });

  try {
    vm.runInContext(js, context, { timeout: caseTimeoutMs, filename: 'candidate.js' });
  } catch (err) {
    const timedOut = err && err.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT';
    return finish({ status: 'error', errorKind: timedOut ? 'timeout' : 'runtime', message: errorText(err), cases: [], logs });
  }
  if (support) {
    try {
      vm.runInContext(support, context, { timeout: caseTimeoutMs, filename: 'challenge-tests.js' });
    } catch (err) {
      return finish({ status: 'error', errorKind: 'infrastructure', message: `Test support code failed: ${errorText(err)}`, cases: [], logs });
    }
  }

  const cases = [];
  for (const t of tests) {
    // Arguments go in and results come out as JSON, so values never cross realms and
    // comparisons aren't fooled by prototypes from the candidate's context.
    context.__fnName = t.fn;
    context.__argsJson = JSON.stringify(t.args);
    try {
      // The synchronous part runs under vm's timeout; a returned promise is awaited below.
      const out = vm.runInContext(
        `(() => {
          const f = typeof globalThis[__fnName] === 'function' ? globalThis[__fnName]
            : typeof module.exports[__fnName] === 'function' ? module.exports[__fnName]
            : typeof exports[__fnName] === 'function' ? exports[__fnName] : undefined;
          if (!f) throw new ReferenceError(__fnName + ' is not defined as a top-level function');
          const r = f(...JSON.parse(__argsJson));
          return r && typeof r.then === 'function' ? Promise.resolve(r).then((v) => JSON.stringify({ v })) : JSON.stringify({ v: r });
        })()`,
        context,
        { timeout: caseTimeoutMs },
      );
      const resultJson = typeof out === 'string' ? out : await withTimeout(out, caseTimeoutMs);
      const actual = JSON.parse(resultJson).v;
      const passed = isDeepStrictEqual(actual, t.expected);
      cases.push({ name: t.name, status: passed ? 'passed' : 'failed', expected: t.expected, actual });
    } catch (err) {
      if (err && err.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') {
        cases.push({ name: t.name, status: 'error', expected: t.expected, error: `Timed out after ${caseTimeoutMs}ms` });
        break; // one hung case is enough to report; don't spend the wall-clock budget on the rest
      } else {
        cases.push({ name: t.name, status: 'failed', expected: t.expected, error: errorText(err) });
      }
    }
  }
  const timedOut = cases.some((c) => c.status === 'error');
  const allPassed = cases.every((c) => c.status === 'passed');
  finish({ status: timedOut ? 'error' : allPassed ? 'passed' : 'failed', errorKind: timedOut ? 'timeout' : undefined, cases, logs });
}

/** Await a promise, rejecting like vm's timeout if it doesn't settle in time. */
function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`Timed out after ${ms}ms`), { code: 'ERR_SCRIPT_EXECUTION_TIMEOUT' })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function safeJson(v) {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function finish(result) {
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((err) => {
  finish({ status: 'error', errorKind: 'infrastructure', message: errorText(err), cases: [], logs: [] });
});
