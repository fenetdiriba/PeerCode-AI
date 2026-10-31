import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRequest, createMetaClient, ModelError, readText, sanitize } from './meta.js';

const KEY = 'sk-test-secret-123';
const reply = (status, body) => async () => ({ ok: status >= 200 && status < 300, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });

test('missing key: unavailable, and calls fail clearly without a request', async () => {
  let called = false;
  const client = createMetaClient({ apiKey: undefined, fetchImpl: async () => ((called = true), null) });
  assert.equal(client.available, false);
  await assert.rejects(client.complete({ system: 's', user: 'u' }), (e) => e instanceof ModelError && e.code === 'missing-key' && e.status === 503);
  assert.equal(called, false);
});

test('sends model, messages and bearer auth to /chat/completions', async () => {
  let seen;
  const client = createMetaClient({
    apiKey: KEY,
    baseUrl: 'https://api.example.test/v1/',
    model: 'muse-spark-1.3',
    fetchImpl: async (url, init) => {
      seen = { url, init };
      return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: '{"a":1}' } }] }) };
    },
  });
  assert.equal(await client.complete({ system: 'sys', user: 'usr' }), '{"a":1}');
  assert.equal(seen.url, 'https://api.example.test/v1/chat/completions');
  assert.equal(seen.init.headers.Authorization, `Bearer ${KEY}`);
  const body = JSON.parse(seen.init.body);
  assert.equal(body.model, 'muse-spark-1.3');
  assert.deepEqual(body.messages.map((m) => m.role), ['system', 'user']);
});

test('readText understands the known response shapes', () => {
  assert.equal(readText({ choices: [{ message: { content: 'x' } }] }), 'x');
  assert.equal(readText({ choices: [{ message: { content: [{ type: 'text', text: 'a' }, { text: 'b' }] } }] }), 'ab');
  assert.equal(readText({ completion_message: { content: { type: 'text', text: 'y' } } }), 'y');
  assert.equal(readText({ output_text: 'z' }), 'z');
  assert.equal(readText({ something: 'else' }), null);
});

test('buildRequest omits response_format when JSON mode is off', () => {
  assert.ok(buildRequest({ model: 'm', system: 's', user: 'u', jsonMode: true }).response_format);
  assert.equal(buildRequest({ model: 'm', system: 's', user: 'u', jsonMode: false }).response_format, undefined);
});

test('HTTP errors map to safe, specific errors that never contain the key', async () => {
  const cases = [
    [401, 'auth'],
    [403, 'auth'],
    [429, 'rate-limit'],
    [500, 'upstream'],
    [503, 'upstream'],
    [400, 'bad-request'],
    [404, 'bad-request'],
  ];
  for (const [status, code] of cases) {
    // The upstream body echoes the key; it must be redacted everywhere.
    const client = createMetaClient({ apiKey: KEY, fetchImpl: reply(status, { error: { message: `bad thing for key ${KEY}` } }) });
    await assert.rejects(client.complete({ system: 's', user: 'u' }), (e) => {
      assert.equal(e.code, code, String(status));
      assert.equal(e.upstreamStatus, status);
      assert.ok(!e.message.includes(KEY) && !e.detail.includes(KEY), 'key leaked');
      assert.match(e.detail, /bad thing for key \[REDACTED\]/);
      return true;
    });
  }
});

test('unexpected response shape, network failure and timeout', async () => {
  const shape = createMetaClient({ apiKey: KEY, fetchImpl: reply(200, { weird: true }) });
  await assert.rejects(shape.complete({ system: 's', user: 'u' }), (e) => e.code === 'invalid-response');

  const network = createMetaClient({ apiKey: KEY, fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  await assert.rejects(network.complete({ system: 's', user: 'u' }), (e) => e.code === 'network');

  const slow = createMetaClient({
    apiKey: KEY,
    timeoutMs: 20,
    fetchImpl: (_url, init) =>
      new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))),
  });
  await assert.rejects(slow.complete({ system: 's', user: 'u' }), (e) => e.code === 'timeout' && e.status === 504);
});

test('sanitize redacts the key and bearer tokens, and non-JSON error bodies are kept as detail', async () => {
  assert.equal(sanitize(`x ${KEY} y`, KEY), 'x [REDACTED] y');
  assert.equal(sanitize('Authorization: Bearer abc.def-123', KEY), 'Authorization: Bearer [REDACTED]');
  assert.equal(sanitize('z'.repeat(500), KEY).length, 300);
  const html = createMetaClient({ apiKey: KEY, fetchImpl: reply(502, '<html>Bad Gateway</html>') });
  await assert.rejects(html.complete({ system: 's', user: 'u' }), (e) => e.upstreamStatus === 502 && /Bad Gateway/.test(e.detail));
});

test('injected auth mode sends no Authorization header and needs no key', async () => {
  let headers;
  const client = createMetaClient({
    apiKey: undefined,
    authMode: 'injected',
    fetchImpl: async (_url, init) => {
      headers = init.headers;
      return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: 'x' } }] }) };
    },
  });
  assert.equal(client.available, true);
  assert.equal(await client.complete({ system: 's', user: 'u' }), 'x');
  assert.equal('Authorization' in headers, false);
  const rejected = createMetaClient({ apiKey: undefined, authMode: 'injected', fetchImpl: reply(401, { error: { message: 'bad key' } }) });
  await assert.rejects(rejected.complete({ system: 's', user: 'u' }), (e) => e.code === 'auth' && /network secret/.test(e.message));
});
