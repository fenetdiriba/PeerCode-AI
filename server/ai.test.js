import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPrompt, extractCode, validateRequest } from './ai.js';
import { createApp } from './app.js';

test('buildPrompt marks the selection and asks for just the replacement', () => {
  const prompt = buildPrompt({ code: 'a\nb\nc', language: 'python', instruction: 'fix it', selection: { start: 2, end: 3 } });
  assert.match(prompt, /Language: Python/);
  assert.match(prompt, /a\n<<<SELECTION_START>>>b<<<SELECTION_END>>>\nc/);
  assert.match(prompt, /ONLY the new code/);
});

test('buildPrompt asks for the complete file without a selection', () => {
  const prompt = buildPrompt({ code: 'x = 1', language: 'javascript', instruction: 'add a test', selection: null });
  assert.match(prompt, /COMPLETE updated file/);
  assert.doesNotMatch(prompt, /SELECTION_START/);
});

test('extractCode strips one outer markdown fence and stray markers', () => {
  assert.equal(extractCode('```python\nprint(1)\n```'), 'print(1)');
  assert.equal(extractCode('```\nx\n```\n'), 'x');
  assert.equal(extractCode('const a = 1;'), 'const a = 1;');
  assert.equal(extractCode('<<<SELECTION_START>>>y<<<SELECTION_END>>>'), 'y');
  // Fences inside the code (e.g. in a string) are left alone.
  assert.equal(extractCode('s = "```"'), 's = "```"');
});

test('validateRequest', () => {
  const ok = validateRequest({ code: 'abc', language: 'python', instruction: ' go ', selection: { start: 1, end: 2 } });
  assert.deepEqual(ok, { ok: true, value: { code: 'abc', language: 'python', instruction: 'go', selection: { start: 1, end: 2 } } });
  // Empty selection means "whole file".
  assert.equal(validateRequest({ code: 'abc', language: 'python', instruction: 'go', selection: { start: 1, end: 1 } }).value.selection, null);
  assert.equal(validateRequest({ code: 'abc', language: 'cobol', instruction: 'go' }).ok, false);
  assert.equal(validateRequest({ code: 'abc', language: 'python', instruction: '   ' }).ok, false);
  assert.equal(validateRequest({ code: 'abc', language: 'python', instruction: 'go', selection: { start: 2, end: 9 } }).ok, false);
  assert.equal(validateRequest({ code: 'x'.repeat(30_001), language: 'python', instruction: 'go' }).ok, false);
});

async function withApp(options, fn) {
  const app = createApp(options);
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((r) => app.close(r));
  }
}

const post = (base, body, origin = 'https://peer-code-ai.vercel.app') =>
  fetch(`${base}/api/ai-hint`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });

test('HTTP: returns the model output for allowed origins, with CORS headers', async () => {
  const prompts = [];
  const generate = async (p) => {
    prompts.push(p);
    return '```js\nreturn a + b;\n```';
  };
  await withApp({ allowedOrigins: ['https://peer-code-ai.vercel.app'], generate }, async (base) => {
    const pre = await fetch(`${base}/api/ai-hint`, { method: 'OPTIONS', headers: { Origin: 'https://peer-code-ai.vercel.app' } });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('access-control-allow-origin'), 'https://peer-code-ai.vercel.app');

    const res = await post(base, { code: 'function add(a, b) {\n  return a - b;\n}', language: 'javascript', instruction: 'fix', selection: { start: 22, end: 35 } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), 'https://peer-code-ai.vercel.app');
    assert.deepEqual(await res.json(), { mode: 'selection', text: 'return a + b;' });
    assert.equal(prompts.length, 1);

    const health = await (await fetch(`${base}/health`)).json();
    assert.equal(health.ai, true);
  });
});

test('HTTP: rejects other origins, bad input, and missing configuration', async () => {
  await withApp({ allowedOrigins: ['https://peer-code-ai.vercel.app'], generate: async () => 'x' }, async (base) => {
    assert.equal((await post(base, { code: '', language: 'python', instruction: 'x' }, 'https://evil.example')).status, 403);
    assert.equal((await post(base, { code: '', language: 'python' })).status, 400);
    const bad = await fetch(`${base}/api/ai-hint`, { method: 'POST', headers: { Origin: 'https://peer-code-ai.vercel.app' }, body: '{not json' });
    assert.equal(bad.status, 400);
    assert.equal((await fetch(`${base}/api/ai-hint`)).status, 405);
  });
  await withApp({ generate: null }, async (base) => {
    const res = await post(base, { code: '', language: 'python', instruction: 'write hello world' });
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /GEMINI_API_KEY/);
    assert.equal((await (await fetch(`${base}/health`)).json()).ai, false);
  });
});

test('HTTP: rate limits per IP and reports model failures', async () => {
  await withApp({ generate: async () => 'ok', aiRequestsPer10Min: 2 }, async (base) => {
    const body = { code: 'x', language: 'python', instruction: 'go' };
    assert.equal((await post(base, body)).status, 200);
    assert.equal((await post(base, body)).status, 200);
    assert.equal((await post(base, body)).status, 429);
  });
  await withApp({ generate: async () => { throw new Error('quota'); } }, async (base) => {
    const res = await post(base, { code: 'x', language: 'python', instruction: 'go' });
    assert.equal(res.status, 502);
    assert.doesNotMatch((await res.json()).error, /quota/); // internal details stay in server logs
  });
});
