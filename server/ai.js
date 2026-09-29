// AI code hints: POST /api/ai-hint with the current file, an instruction and an optional
// selection; Gemini returns replacement code. The API key lives only on the server.

const LANGUAGES = { javascript: 'JavaScript', typescript: 'TypeScript', python: 'Python', java: 'Java', cpp: 'C++' };
const MAX_CODE_CHARS = 30_000;
const MAX_INSTRUCTION_CHARS = 500;
const MAX_BODY_BYTES = 128 * 1024;
const TIMEOUT_MS = 30_000;
const SEL_START = '<<<SELECTION_START>>>';
const SEL_END = '<<<SELECTION_END>>>';

export const SYSTEM_INSTRUCTION = `You are the coding assistant inside PeerCode, a collaborative editor people use to practice coding interviews.
You edit code based on the user's instruction.
Rules:
- Reply with code only. No explanations, no markdown fences, no text before or after the code.
- Keep the existing style, naming and indentation.
- Change only what the instruction asks for. Don't rewrite unrelated code.
- Comments inside the code are fine when they help.`;

/**
 * @param {{ code: string, language: keyof typeof LANGUAGES, instruction: string, selection: { start: number, end: number } | null }} req
 */
export function buildPrompt({ code, language, instruction, selection }) {
  const lang = LANGUAGES[language];
  if (selection) {
    const marked = code.slice(0, selection.start) + SEL_START + code.slice(selection.start, selection.end) + SEL_END + code.slice(selection.end);
    return `Language: ${lang}
Instruction: ${instruction}

The user selected the part of the file between ${SEL_START} and ${SEL_END}.
Return ONLY the new code that should replace the selected part (without the markers). Return nothing else.

File:
${marked}`;
  }
  return `Language: ${lang}
Instruction: ${instruction}

Return the COMPLETE updated file.

File:
${code}`;
}

/** Models sometimes wrap code in ``` fences despite instructions; strip one outer fence. */
export function extractCode(text) {
  const trimmed = text.replace(/^\s*\n/, '').replace(/\s+$/, '');
  const fenced = trimmed.match(/^```[\w+#.-]*[ \t]*\n([\s\S]*?)\n?```$/);
  return (fenced ? fenced[1] : trimmed).replaceAll(SEL_START, '').replaceAll(SEL_END, '');
}

/** @returns {{ ok: true, value: Parameters<typeof buildPrompt>[0] } | { ok: false, error: string }} */
export function validateRequest(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request.' };
  const { code, language, instruction, selection } = body;
  if (typeof code !== 'string' || code.length > MAX_CODE_CHARS) {
    return { ok: false, error: `The file is too large for AI hints (max ${MAX_CODE_CHARS.toLocaleString()} characters).` };
  }
  if (!(language in LANGUAGES)) return { ok: false, error: 'Unsupported language.' };
  if (typeof instruction !== 'string' || !instruction.trim() || instruction.length > MAX_INSTRUCTION_CHARS) {
    return { ok: false, error: `Describe what you want in 1–${MAX_INSTRUCTION_CHARS} characters.` };
  }
  let sel = null;
  if (selection != null) {
    const { start, end } = selection;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > code.length) {
      return { ok: false, error: 'Invalid selection.' };
    }
    if (end > start) sel = { start, end };
  }
  return { ok: true, value: { code, language, instruction: instruction.trim(), selection: sel } };
}

/**
 * Models to try, in order. `gemini-flash-latest` is Google's alias for the current Flash
 * model, so it keeps working as specific versions are retired; the others are fallbacks.
 */
export const DEFAULT_MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash'];

/** An error whose message is safe and useful to show the user (no secrets, no raw payloads). */
export class AiError extends Error {
  constructor(userMessage, status = 502) {
    super(userMessage);
    this.userMessage = userMessage;
    this.status = status;
  }
}

/**
 * Turn a Gemini API error into something actionable. Returns 'model-unavailable' when the
 * next model should be tried instead.
 * @returns {AiError | 'model-unavailable'}
 */
export function classifyGeminiError(err) {
  const status = Number(err?.status) || 0;
  const msg = String(err?.message ?? '');
  if (status === 404 || /not found|is not supported for generateContent|no longer available|deprecated/i.test(msg)) {
    return 'model-unavailable';
  }
  if (/API keys are not supported|Expected OAuth2|CREDENTIALS_MISSING|UNAUTHENTICATED/i.test(msg)) {
    return new AiError('This kind of key isn’t accepted by the Gemini API. Create one at aistudio.google.com/apikey (it starts with “AIza”).');
  }
  if (/API key not valid|API_KEY_INVALID|invalid api key/i.test(msg)) {
    return new AiError('The Gemini API key on the server is invalid. Check GEMINI_API_KEY on Railway (no spaces or quotes).');
  }
  if (/location is not supported|User location/i.test(msg)) {
    return new AiError('Gemini isn’t available in the server’s region.');
  }
  if (status === 429 || /quota|RESOURCE_EXHAUSTED|rate limit/i.test(msg)) {
    return new AiError('The Gemini free quota is used up for now. Try again in a minute.', 429);
  }
  if (status === 401 || status === 403 || /PERMISSION_DENIED|has not been used in project|disabled/i.test(msg)) {
    return new AiError('The Gemini API key doesn’t have access. Make sure it was created in Google AI Studio.');
  }
  if (status >= 500) return new AiError('Gemini is having trouble right now. Try again in a moment.');
  // Unrecognized: include a short, safe code so the failure can be diagnosed without server logs.
  const code = status
    ? `Gemini error ${status}`
    : /fetch failed|ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|network/i.test(msg)
      ? 'network error reaching Gemini'
      : 'unexpected Gemini error';
  return new AiError(`The AI request failed (${code}). Try again, or check the server logs.`);
}

/**
 * Gemini via @google/genai, loaded lazily so the server starts fine without it configured.
 * Tries each model until one works and remembers it for later requests.
 *
 * @param {string} apiKey
 * @param {string[]} [models]
 * @param {{ createClient?: (apiKey: string) => Promise<any> }} [deps] injectable for tests
 */
export function geminiGenerator(apiKey, models = DEFAULT_MODELS, deps = {}) {
  const createClient =
    deps.createClient ??
    (async (key) => {
      const { GoogleGenAI } = await import('@google/genai');
      return new GoogleGenAI({ apiKey: key });
    });
  let client;
  let working = 0; // index of the first model that isn't known to be unavailable

  return async (prompt) => {
    if (!client) {
      try {
        client = await createClient(apiKey);
      } catch (err) {
        console.error('Could not start the Gemini client:', err);
        throw new AiError('The AI client failed to start on the server (check the server logs and Node version).');
      }
    }
    for (let i = working; i < models.length; i++) {
      try {
        const res = await client.models.generateContent({
          model: models[i],
          contents: prompt,
          config: { systemInstruction: SYSTEM_INSTRUCTION, temperature: 0.2 },
        });
        if (i !== working) console.log(`AI hints: using model ${models[i]}`);
        working = i;
        return res.text ?? '';
      } catch (err) {
        const kind = classifyGeminiError(err);
        console.error(`Gemini error (model ${models[i]}, status ${err?.status ?? '?'}): ${err?.message ?? err}`);
        if (kind !== 'model-unavailable') throw kind;
      }
    }
    throw new AiError(`None of the configured Gemini models are available (${models.join(', ')}). Set GEMINI_MODEL on the server.`);
  };
}

/**
 * @param {{ generate: ((prompt: string) => Promise<string>) | null, maxRequests?: number, windowMs?: number, now?: () => number }} opts
 */
export function createAiHint({ generate, maxRequests = 20, windowMs = 10 * 60_000, now = () => Date.now() }) {
  const requestsByIp = new Map(); // ip -> timestamps

  const json = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  const limited = (ip) => {
    const t = now();
    const recent = (requestsByIp.get(ip) ?? []).filter((ts) => t - ts < windowMs);
    if (recent.length >= maxRequests) {
      requestsByIp.set(ip, recent);
      return true;
    }
    recent.push(t);
    requestsByIp.set(ip, recent);
    return false;
  };

  const readBody = (req) =>
    new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY_BYTES) {
          reject(Object.assign(new Error('Request too large.'), { status: 413 }));
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {string} ip
   */
  async function handle(req, res, ip) {
    if (!generate) {
      return json(res, 503, { error: 'AI hints aren’t set up on this server yet (GEMINI_API_KEY is missing).' });
    }
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (err) {
      return json(res, err.status ?? 400, { error: err.status ? err.message : 'Invalid JSON.' });
    }
    const parsed = validateRequest(body);
    if (!parsed.ok) return json(res, 400, { error: parsed.error });
    if (limited(ip)) return json(res, 429, { error: 'Too many AI requests. Try again in a few minutes.' });

    const { value } = parsed;
    let timer;
    try {
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS);
      });
      const text = await Promise.race([generate(buildPrompt(value)), timeout]);
      return json(res, 200, { mode: value.selection ? 'selection' : 'file', text: extractCode(text) });
    } catch (err) {
      console.error('AI hint failed:', err?.message ?? err);
      if (err?.message === 'timeout') return json(res, 504, { error: 'The AI took too long. Try a smaller request.' });
      // AiError messages are written for users; anything else stays in the server logs.
      if (err instanceof AiError) return json(res, err.status, { error: err.userMessage });
      return json(res, 502, { error: 'The AI request failed (server error). Try again, or check the server logs.' });
    } finally {
      clearTimeout(timer);
    }
  }

  return { handle };
}
