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

/**
 * TypeScript has its types stripped; both languages get ES module syntax turned into
 * CommonJS so `export` works in the vm context.
 * @param {'typescript' | 'javascript'} [language]
 * @returns {{ ok: true, js: string } | { ok: false, message: string }}
 */
export function compileSource(source, language = 'typescript') {
  try {
    const transforms = language === 'typescript' ? ['typescript', 'imports'] : ['imports'];
    return { ok: true, js: transform(source, { transforms, disableESTransforms: true }).code };
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

    const compiled = compileSource(sourceCode, challenge.language);
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
        child.stdin.end(JSON.stringify({ js: compiled.js, support: challenge.support ?? '', tests: challenge.tests, caseTimeoutMs }));
      });
      return { ...result, durationMs: elapsed() };
    } finally {
      release();
    }
  }

  return { runTests };
}

// Probe run in a child with the same flags as real test runs (minus the harness). Each check
// must come back denied/empty for the runner to be considered constrained.
const ISOLATION_PROBE = `
const out = {};
const denied = (fn) => { try { fn(); return false; } catch (e) { return e.code === 'ERR_ACCESS_DENIED'; } };
out.fsWriteDenied = denied(() => require('node:fs').writeFileSync(require('node:os').tmpdir() + '/peercode-probe', 'x'));
out.childProcessDenied = denied(() => require('node:child_process').execFileSync(process.execPath, ['-e', '0']));
out.workerDenied = denied(() => new (require('node:worker_threads').Worker)('0', { eval: true }));
out.envEmpty = Object.keys(process.env).length === 0;
out.codegenDisabled = (() => { try { new Function('return 1')(); return false; } catch { return true; } })();
process.stdout.write(JSON.stringify(out));
`;

/**
 * Check that the child-process restrictions actually hold on this host (Node version, flags).
 * Network is NOT checked or restricted; callers must not treat a pass as a sandbox.
 * @returns {Promise<{ ok: boolean, nodeVersion: string, checks: Record<string, boolean>, error?: string }>}
 */
// Generous timeout: on a throttled host (e.g. 0.1 CPU) Node start-up alone can take seconds.
export function checkIsolation({ nodePath = process.execPath, timeoutMs = 20_000 } = {}) {
  return new Promise((resolve) => {
    const done = (r) => resolve({ nodeVersion: process.version, ...r });
    let child;
    try {
      child = spawn(nodePath, ['--permission', '--disallow-code-generation-from-strings', '-e', ISOLATION_PROBE], { env: {}, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      return done({ ok: false, checks: {}, error: `spawn failed: ${err.message}` });
    }
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (c) => (stdout += c));
    child.stderr.on('data', (c) => (stderr += c));
    child.on('error', (err) => {
      clearTimeout(timer);
      done({ ok: false, checks: {}, error: err.message });
    });
    child.on('close', () => {
      clearTimeout(timer);
      try {
        const checks = JSON.parse(stdout);
        done({ ok: Object.values(checks).every(Boolean), checks });
      } catch {
        done({ ok: false, checks: {}, error: stderr.trim().split('\n').slice(-2).join(' ').slice(0, 300) || 'probe produced no output' });
      }
    });
  });
}
