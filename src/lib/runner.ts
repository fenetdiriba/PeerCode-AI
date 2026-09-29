import { transform } from 'sucrase';
import { LanguageId, RunResult } from '../types';

const TIMEOUT_MS = 5000;
const MAX_LINES = 500;

// Runs inside a throwaway Web Worker: no DOM, no access to the page, and it is
// terminated after every run (or on timeout), so an infinite loop can't freeze the tab.
const WORKER_SOURCE = `
const fmt = (v, depth = 0) => {
  if (typeof v === 'string') return depth ? JSON.stringify(v) : v;
  if (typeof v === 'function') return '[Function ' + (v.name || 'anonymous') + ']';
  if (typeof v === 'bigint') return v + 'n';
  if (v instanceof Error) return v.name + ': ' + v.message;
  if (v === null || typeof v !== 'object') return String(v);
  if (depth > 3) return Array.isArray(v) ? '[Array]' : '[Object]';
  if (Array.isArray(v)) return '[' + v.map((x) => fmt(x, depth + 1)).join(', ') + ']';
  if (v instanceof Map) return 'Map(' + v.size + ') {' + [...v].map(([k, x]) => fmt(k, depth + 1) + ' => ' + fmt(x, depth + 1)).join(', ') + '}';
  if (v instanceof Set) return 'Set(' + v.size + ') {' + [...v].map((x) => fmt(x, depth + 1)).join(', ') + '}';
  const entries = Object.entries(v).map(([k, x]) => k + ': ' + fmt(x, depth + 1));
  return '{ ' + entries.join(', ') + (entries.length ? ' }' : '}');
};
const emit = (kind, args) => self.postMessage({ type: 'line', kind, text: args.map((a) => fmt(a)).join(' ') });
console.log = console.info = console.debug = (...a) => emit('log', a);
console.warn = console.error = (...a) => emit('error', a);
self.onmessage = async (e) => {
  try {
    await (0, eval)('(async () => {\\n' + e.data + '\\n})()');
  } catch (err) {
    emit('error', [err && err.name ? err.name + ': ' + err.message : String(err)]);
  }
  self.postMessage({ type: 'done' });
};
`;

let workerUrl: string | null = null;

function toJavaScript(code: string, language: LanguageId): string {
  if (language === 'typescript') {
    return transform(code, { transforms: ['typescript'], disableESTransforms: true }).code;
  }
  return code;
}

export function runCode(code: string, language: LanguageId): Promise<RunResult> {
  const started = performance.now();
  const lines: RunResult['lines'] = [];
  const finish = (): RunResult => ({ lines, durationMs: Math.round(performance.now() - started) });

  let js: string;
  try {
    js = toJavaScript(code, language);
  } catch (err) {
    lines.push({ kind: 'error', text: `SyntaxError: ${(err as Error).message}` });
    return Promise.resolve(finish());
  }

  workerUrl ??= URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
  const worker = new Worker(workerUrl);

  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      worker.terminate();
      resolve(finish());
    };
    const timer = setTimeout(() => {
      lines.push({ kind: 'error', text: `Stopped after ${TIMEOUT_MS / 1000}s. Is there an infinite loop?` });
      done();
    }, TIMEOUT_MS);

    worker.onmessage = (e: MessageEvent<{ type: 'line' | 'done'; kind: 'log' | 'error'; text: string }>) => {
      if (e.data.type === 'done') return done();
      if (lines.length < MAX_LINES) lines.push({ kind: e.data.kind, text: e.data.text });
      else if (lines.length === MAX_LINES) lines.push({ kind: 'info', text: `Output truncated at ${MAX_LINES} lines.` });
    };
    worker.onerror = (e) => {
      e.preventDefault();
      lines.push({ kind: 'error', text: e.message || 'Worker error' });
      done();
    };
    worker.postMessage(js);
  });
}
