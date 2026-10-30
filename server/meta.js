// Meta Model API client (Muse Spark). Runs on the server only; the key never reaches the browser.
//
// UNVERIFIED WIRE FORMAT: the official docs (https://dev.meta.ai/docs/overview) could not be
// reached from the environment this was written in. The request below uses the common
// chat-completions shape (POST {base}/chat/completions, Bearer auth, `messages`), and the
// response reader accepts both the OpenAI-style `choices[0].message.content` and the Llama
// API-style `completion_message.content.text`. Check it against the docs and run
// `npm run smoke:meta` with a real key before relying on it. Everything that touches the
// wire format is in `buildRequest` and `readText`, so a correction stays local.

export const DEFAULT_BASE_URL = 'https://api.meta.ai/v1';
export const DEFAULT_MODEL = 'muse-spark-1.3';

/** An error whose message is safe to show users (never contains the key or raw payloads). */
export class ModelError extends Error {
  /** @param {'missing-key' | 'auth' | 'rate-limit' | 'timeout' | 'upstream' | 'bad-request' | 'network' | 'invalid-response'} code */
  constructor(code, message, status = 502, { upstreamStatus = null, detail = '' } = {}) {
    super(message);
    this.code = code;
    this.status = status;
    /** HTTP status Meta answered with, if any (for diagnostics; not shown in the app UI). */
    this.upstreamStatus = upstreamStatus;
    /** Sanitized error text from Meta's response body (key redacted, truncated). */
    this.detail = detail;
  }
}

/** Redact the key (and anything bearer-token shaped) and cap the length, for safe logging. */
export function sanitize(text, secret) {
  let out = String(text ?? '');
  if (secret) out = out.split(secret).join('[REDACTED]');
  return out.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]').slice(0, 300);
}

/**
 * @param {{ model: string, system: string, user: string, jsonMode: boolean }} p
 */
export function buildRequest({ model, system, user, jsonMode }) {
  return {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.1,
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
  };
}

/** Pull the assistant text out of a response body, or null if the shape is unknown. */
export function readText(body) {
  const choice = body?.choices?.[0]?.message?.content;
  if (typeof choice === 'string') return choice;
  if (Array.isArray(choice)) return choice.map((p) => (typeof p === 'string' ? p : p?.text ?? '')).join('');
  const llama = body?.completion_message?.content;
  if (typeof llama === 'string') return llama;
  if (typeof llama?.text === 'string') return llama.text;
  if (typeof body?.output_text === 'string') return body.output_text;
  return null;
}

/** Map an HTTP failure to a user-facing ModelError. `rawText` is used when the body isn't JSON. */
export function classifyHttpError(status, body, secret, rawText = '') {
  const message = body?.error?.message ?? body?.message ?? body?.detail ?? (typeof body?.error === 'string' ? body.error : '') ?? '';
  const detail = sanitize(message || rawText, secret);
  const extra = { upstreamStatus: status, detail };
  if (status === 401 || status === 403) return new ModelError('auth', `The Meta API rejected the key (${status}). Check MODEL_API_KEY on the server.`, 502, extra);
  if (status === 429) return new ModelError('rate-limit', 'The Meta API rate limit was hit. Wait a minute and try again.', 429, extra);
  if (status === 404) return new ModelError('bad-request', `The Meta API endpoint or model was not found (${detail || 'check META_BASE_URL / META_MODEL'}).`, 502, extra);
  if (status >= 500) return new ModelError('upstream', `The Meta API is having trouble right now (${status}). Try again shortly.`, 502, extra);
  return new ModelError('bad-request', `The Meta API refused the request (${status}${detail ? `: ${detail}` : ''}).`, 502, extra);
}

/**
 * @param {{
 *   apiKey: string | undefined, baseUrl?: string, model?: string, timeoutMs?: number,
 *   jsonMode?: boolean, fetchImpl?: typeof fetch,
 * }} options
 * @returns {{ model: string, available: boolean, complete: (p: { system: string, user: string }) => Promise<string> }}
 */
export function createMetaClient({ apiKey, baseUrl = DEFAULT_BASE_URL, model = DEFAULT_MODEL, timeoutMs = 60_000, jsonMode = true, fetchImpl = fetch }) {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  return {
    model,
    available: Boolean(apiKey),
    async complete({ system, user }) {
      if (!apiKey) throw new ModelError('missing-key', 'Meta AI analysis is unavailable: MODEL_API_KEY is not set on the server.', 503);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let res;
      try {
        res = await fetchImpl(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(buildRequest({ model, system, user, jsonMode })),
          signal: controller.signal,
        });
      } catch (err) {
        if (err?.name === 'AbortError') throw new ModelError('timeout', `The Meta API did not answer within ${Math.round(timeoutMs / 1000)}s.`, 504);
        // e.g. DNS failure, TLS error, or a proxy refusing the connection.
        const parts = [];
        for (let e = err, depth = 0; e && depth < 5; e = e.cause, depth++) {
          if (e.code && typeof e.code === 'string') parts.push(e.code);
          if (e.message && e.message !== 'fetch failed') parts.push(e.message);
        }
        const cause = sanitize(parts.join(': ') || String(err), apiKey);
        throw new ModelError('network', 'Could not reach the Meta API from the server.', 502, { detail: cause });
      } finally {
        clearTimeout(timer);
      }
      const raw = await res.text().catch(() => '');
      let body = null;
      try {
        body = JSON.parse(raw);
      } catch {
        // Not JSON; handled below.
      }
      if (!res.ok) throw classifyHttpError(res.status, body, apiKey, raw);
      const text = readText(body);
      if (text == null) {
        const keys = body && typeof body === 'object' ? Object.keys(body).join(', ') : 'non-JSON body';
        throw new ModelError('invalid-response', 'The Meta API answered in an unexpected format.', 502, { upstreamStatus: res.status, detail: `top-level fields: ${keys}` });
      }
      return text;
    },
  };
}
