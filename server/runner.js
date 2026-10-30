// Constrained test execution for predefined challenges.
//
// Candidate TypeScript is compiled here (sucrase only transforms text; nothing is executed),
// then run in a separate Node process (runner-harness.cjs) with:
//   - the Node permission model: no fs writes, no child processes, no worker threads, and
//     fs reads limited to the harness file
//   - an empty environment, so no API keys or other host secrets are visible
//   - a heap cap, a capped stdout, and a wall-clock timeout that SIGKILLs the process
// This is NOT a sandbox: Node 22's permission model does not block network access, and the
// process shares the host kernel. It is suitable for the trusted demo challenges only.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { transform } from 'sucrase';

const HARNESS = fileURLToPath(new URL('./runner-harness.cjs', import.meta.url));
const MAX_STDOUT_BYTES = 256 * 1024;

/**
 * @typedef {'compile' | 'runtime' | 'timeout' | 'crash' | 'infrastructure'} ErrorKind
 * @typedef {{ name: string, status: 'passed' | 'failed' | 'error', expected: unknown, actual?: unknown, error?: string }} CaseResult
 * @typedef {{
 *   status: 'passed' | 'failed' | 'error', errorKind?: ErrorKind, message?: string,
 *   cases: CaseResult[], passed: number, total: number, logs: string[], durationMs: number,
 * }} TestRun
 */

/** @returns {{ ok: true, js: string } | { ok: false, message: string }} */
export function compileTypeScript(source) {
  try {
    return { ok: true, js: transform(source, { transforms: ['typescript', 'imports'], disableESTransforms: true }).code };
  } catch (err) {
    return { ok: false, message: String(err?.message ?? err).slice(0, 500) };
  }
}

/**
 * Turn the harness's stdout into a TestRun. Anything that isn't the expected shape is an
 * error, never a pass: a run only counts as passed when every case reported "passed".
 * @returns {Omit<TestRun, 'durationMs'>}
 */
export function parseHarnessOutput(stdout, total) {
  const line = stdout.trim().split('\n').at(-1) ?? '';
  let raw;
  try {
    raw = JSON.parse(line);
  } catch {
    return { status: 'error', errorKind: 'crash', message: 'The test process exited without reporting results.', cases: [], passed: 0, total, logs: [] };
  }
  const cases = Array.isArray(raw?.cases) ? raw.cases.filter((c) => c && typeof c.name === 'string' && ['passed', 'failed', 'error'].includes(c.status)) : [];
  const logs = Array.isArray(raw?.logs) ? raw.logs.filter((l) => typeof l === 'string') : [];
  const passed = cases.filter((c) => c.status === 'passed').length;
  let status = ['passed', 'failed', 'error'].includes(raw?.status) ? raw.status : 'error';
  // Defensive: "passed" must mean every expected case ran and passed.
  if (status === 'passed' && (cases.length !== total || passed !== total)) status = 'error';
  const run = { status, cases, passed, total, logs };
  if (status === 'error') {
    run.errorKind = ['runtime', 'timeout', 'crash', 'infrastructure', 'compile'].includes(raw?.errorKind) ? raw.errorKind : 'crash';
    run.message = typeof raw?.message === 'string' ? raw.message : run.errorKind === 'timeout' ? 'A test timed out.' : 'The test run failed.';
  }
  return run;
}

/**
 * @param {{ timeoutMs?: number, caseTimeoutMs?: number, maxConcurrent?: number, heapMb?: number, nodePath?: string }} [options]
 */
export function createRunner({ timeoutMs = 8000, caseTimeoutMs = 1000, maxConcurrent = 2, heapMb = 64, nodePath = process.execPath } = {}) {
  let active = 0;
  const waiting = [];
  const acquire = () => (active < maxConcurrent ? (active++, Promise.resolve()) : new Promise((r) => waiting.push(r)));
  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else active--;
  };

  /** @returns {Promise<TestRun>} */
  async function runTests(sourceCode, challenge) {
    const started = performance.now();
    const elapsed = () => Math.round(performance.now() - started);
    const total = challenge.tests.length;

    const compiled = compileTypeScript(sourceCode);
    if (!compiled.ok) {
      return { status: 'error', errorKind: 'compile', message: compiled.message, cases: [], passed: 0, total, logs: [], durationMs: elapsed() };
    }

    await acquire();
    try {
      const result = await new Promise((resolve) => {
        let child;
        try {
          child = spawn(
            nodePath,
            ['--permission', `--allow-fs-read=${HARNESS}`, `--max-old-space-size=${heapMb}`, '--disallow-code-generation-from-strings', HARNESS],
            { env: {}, stdio: ['pipe', 'pipe', 'pipe'] },
          );
        } catch (err) {
          return resolve({ status: 'error', errorKind: 'infrastructure', message: `Could not start the test process: ${err.message}`, cases: [], passed: 0, total, logs: [] });
        }
        let stdout = '';
        let stderr = '';
        let killedForTimeout = false;
        let settled = false;
        const settle = (r) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(r);
        };
        const timer = setTimeout(() => {
          killedForTimeout = true;
          child.kill('SIGKILL');
        }, timeoutMs);

        child.stdout.on('data', (c) => {
          if (stdout.length < MAX_STDOUT_BYTES) stdout += c.toString('utf8');
          else child.kill('SIGKILL');
        });
        child.stderr.on('data', (c) => {
          if (stderr.length < 4000) stderr += c.toString('utf8');
        });
        child.on('error', (err) =>
          settle({ status: 'error', errorKind: 'infrastructure', message: `Test process error: ${err.message}`, cases: [], passed: 0, total, logs: [] }),
        );
        child.on('close', (code, signal) => {
          if (killedForTimeout) {
            return settle({ status: 'error', errorKind: 'timeout', message: `Stopped after ${timeoutMs}ms.`, cases: [], passed: 0, total, logs: [] });
          }
          const parsed = parseHarnessOutput(stdout, total);
          if (parsed.errorKind === 'crash') {
            parsed.message = /heap out of memory|allocation failed/i.test(stderr)
              ? `The code ran out of memory (limit ${heapMb} MB).`
              : `The test process exited (${signal ?? `code ${code}`}) without reporting results.`;
          }
          settle(parsed);
        });
        child.stdin.on('error', () => {}); // the child may die before reading everything
        child.stdin.end(JSON.stringify({ js: compiled.js, tests: challenge.tests, caseTimeoutMs }));
      });
      return { ...result, durationMs: elapsed() };
    } finally {
      release();
    }
  }

  return { runTests };
}
