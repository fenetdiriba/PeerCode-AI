// Meta Model API client (Muse Spark). Runs on the server only; the key never reaches the browser.
//
// AUTH MODES: by default the client sends `Authorization: Bearer $MODEL_API_KEY`. With
// authMode 'injected' (env META_AUTH=injected) it sends no Authorization header at all: an
// egress proxy adds the key (e.g. a Claude Code network secret for api.meta.ai), so the key
// never exists in this process.
//
// WIRE FORMAT: checked on 2026-10-31 against https://dev.meta.ai/docs (authentication,
// chat completions, structured output, error handling) and the live API: POST
// {base}/chat/completions with Bearer auth and an OpenAI-style body; the reply text is at
// choices[0].message.content; errors are { error: { message, type, param, code } }, and
// unknown paths return 404 with an empty body.
//
// STRUCTURED OUTPUT: with a schema, requests use the documented
// response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } }, which
// constrains decoding to the schema. If Meta rejects the schema (HTTP 400 about
// response_format / the schema), the call is retried once with { type: 'json_object' } and the
// result says so; server-side validation runs either way.

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

/** @typedef {'json_schema' | 'json_object' | 'none'} ResponseFormat */

/**
 * @param {{ model: string, system: string, user: string, responseFormat: ResponseFormat, schema?: { name: string, schema: object } }} p
 */
export function buildRequest({ model, system, user, responseFormat, schema }) {
  let format = {};
  if (responseFormat === 'json_schema' && schema) {
    format = { response_format: { type: 'json_schema', json_schema: { name: schema.name, strict: true, schema: schema.schema } } };
  } else if (responseFormat === 'json_schema' || responseFormat === 'json_object') {
    format = { response_format: { type: 'json_object' } };
  }
  return {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.1,
    ...format,
  };
}

/** META_RESPONSE_FORMAT: json_schema (default) | json_object | none. */
export function responseFormatFromEnv(env) {
  const v = env.META_RESPONSE_FORMAT?.trim();
  return v === 'json_object' || v === 'none' ? v : 'json_schema';
}

/** Did Meta reject the structured-output part of the request (rather than something else)? */
export function isSchemaRejection(err) {
  return err instanceof ModelError && err.upstreamStatus === 400 && /response_format|json_schema|schema/i.test(`${err.detail} ${err.message}`);
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
 *   apiKey: string | undefined, authMode?: 'key' | 'injected', baseUrl?: string, model?: string, timeoutMs?: number,
 *   responseFormat?: ResponseFormat, fetchImpl?: typeof fetch,
 * }} options
 * @returns {{ model: string, available: boolean, authMode: 'key' | 'injected', responseFormat: ResponseFormat, complete: (p: { system: string, user: string, schema?: { name: string, schema: object } }) => Promise<CompletionResult> }}
 */
export function createMetaClient({ apiKey, authMode = 'key', baseUrl = DEFAULT_BASE_URL, model = DEFAULT_MODEL, timeoutMs = 90_000, responseFormat = 'json_schema', fetchImpl = fetch }) {
  const injected = authMode === 'injected';
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  return {
    model,
    available: injected || Boolean(apiKey),
    authMode: injected ? 'injected' : 'key',
    responseFormat,
    /**
     * @param {{ system: string, user: string, schema?: { name: string, schema: object } }} p
     * @returns {Promise<CompletionResult>}
     */
    async complete({ system, user, schema }) {
      try {
        return await request({ system, user, schema, format: responseFormat });
      } catch (err) {
        if (responseFormat === 'json_schema' && schema && isSchemaRejection(err)) {
          console.warn(`Meta rejected the json_schema response format (${sanitize(err.detail, apiKey)}); retrying with json_object.`);
          const result = await request({ system, user, schema: undefined, format: 'json_object' });
          return { ...result, schemaFallback: true };
        }
        throw err;
      }
    },
  };

  /** @param {{ system: string, user: string, schema?: { name: string, schema: object }, format: ResponseFormat }} p */
  async function request({ system, user, schema, format }) {
    if (!injected && !apiKey) throw new ModelError('missing-key', 'Meta AI analysis is unavailable: MODEL_API_KEY is not set on the server.', 503);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers: { ...(injected ? {} : { Authorization: `Bearer ${apiKey}` }), 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(buildRequest({ model, system, user, responseFormat: format, schema })),
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
    if (!res.ok) {
      const err = classifyHttpError(res.status, body, apiKey, raw);
      if (injected && err.code === 'auth') {
        err.message = `The Meta API rejected the request (${res.status}). The key is injected by the egress proxy (META_AUTH=injected): check the network secret for api.meta.ai.`;
      }
      throw err;
    }
    const text = readText(body);
    if (text == null) {
      const keys = body && typeof body === 'object' ? Object.keys(body).join(', ') : 'non-JSON body';
      throw new ModelError('invalid-response', 'The Meta API answered in an unexpected format.', 502, { upstreamStatus: res.status, detail: `top-level fields: ${keys}` });
    }
    const choice = body?.choices?.[0];
    if (choice?.message?.refusal) {
      throw new ModelError('invalid-response', 'The model refused to answer.', 502, { upstreamStatus: res.status, detail: sanitize(choice.message.refusal, apiKey) });
    }
    if (choice?.finish_reason === 'length') {
      throw new ModelError('invalid-response', 'The model ran out of output tokens before finishing its answer.', 502, { upstreamStatus: res.status, detail: 'finish_reason: length' });
    }
    return {
      text,
      id: typeof body?.id === 'string' ? body.id : null,
      finishReason: choice?.finish_reason ?? null,
      usage: normalizeUsage(body?.usage),
      responseFormat: format === 'json_schema' && !schema ? 'json_object' : format,
    };
  }
}

/**
 * @typedef {{ promptTokens: number, completionTokens: number, reasoningTokens: number, totalTokens: number }} Usage
 * @typedef {{ text: string, id: string | null, finishReason: string | null, usage: Usage | null,
 *   responseFormat: ResponseFormat, schemaFallback?: boolean }} CompletionResult
 */

/** @returns {Usage | null} */
export function normalizeUsage(u) {
  if (!u || typeof u !== 'object') return null;
  const n = (v) => (Number.isFinite(v) ? v : 0);
  return {
    promptTokens: n(u.prompt_tokens),
    completionTokens: n(u.completion_tokens),
    reasoningTokens: n(u.completion_tokens_details?.reasoning_tokens),
    totalTokens: n(u.total_tokens),
  };
}
