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

/** Gemini via @google/genai, loaded lazily so the server starts fine without it configured. */
export function geminiGenerator(apiKey, model = 'gemini-2.5-flash') {
  let client;
  return async (prompt) => {
    if (!client) {
      const { GoogleGenAI } = await import('@google/genai');
      client = new GoogleGenAI({ apiKey });
    }
    const res = await client.models.generateContent({
      model,
      contents: prompt,
      config: { systemInstruction: SYSTEM_INSTRUCTION, temperature: 0.2 },
    });
    return res.text ?? '';
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
      const timedOut = err?.message === 'timeout';
      return json(res, timedOut ? 504 : 502, {
        error: timedOut ? 'The AI took too long. Try a smaller request.' : 'The AI request failed. Try again.',
      });
    } finally {
      clearTimeout(timer);
    }
  }

  return { handle };
}
