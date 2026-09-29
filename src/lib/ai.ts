import { AI_HINT_URL } from './config';
import { LanguageId } from '../types';

export interface AiEditRequest {
  code: string;
  language: LanguageId;
  instruction: string;
  /** Character offsets into `code`; null edits the whole file. */
  selection: { start: number; end: number } | null;
}

export interface AiEditResponse {
  /** 'selection': text replaces the selection. 'file': text is the complete new file. */
  mode: 'selection' | 'file';
  text: string;
}

export async function requestAiEdit(req: AiEditRequest, signal?: AbortSignal): Promise<AiEditResponse> {
  let res: Response;
  try {
    res = await fetch(AI_HINT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new Error("Can't reach the AI server. Check your connection and try again.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `The AI request failed (${res.status}).`);
  if (!body || (body.mode !== 'selection' && body.mode !== 'file') || typeof body.text !== 'string') {
    throw new Error('The AI returned an unexpected response.');
  }
  return body as AiEditResponse;
}

/**
 * The smallest single replacement that turns `before` into `after`: skip the common
 * prefix and suffix. Applying only the changed middle keeps the edit small in the shared
 * document, so a partner's cursor elsewhere in the file doesn't jump.
 */
export function minimalReplacement(before: string, after: string): { start: number; end: number; text: string } {
  let prefix = 0;
  const maxPrefix = Math.min(before.length, after.length);
  while (prefix < maxPrefix && before.charCodeAt(prefix) === after.charCodeAt(prefix)) prefix++;
  let suffix = 0;
  const maxSuffix = Math.min(before.length, after.length) - prefix;
  while (
    suffix < maxSuffix &&
    before.charCodeAt(before.length - 1 - suffix) === after.charCodeAt(after.length - 1 - suffix)
  ) {
    suffix++;
  }
  return { start: prefix, end: before.length - suffix, text: after.slice(prefix, after.length - suffix) };
}
