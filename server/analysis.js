// Prompt and response validation for the debugging agent.
// The model must answer with one JSON object; anything else is rejected, never shown as analysis.
import { unifiedDiff } from '../shared/diff.js';
import { applyEdits, validateEdits } from './patches.js';

export const SYSTEM_PROMPT = `You are the debugging agent inside PeerCode, a collaborative code editor.
You are given a regression: a checkpoint whose tests passed, the next checkpoint where they fail, the diff between them, the failing test output, and the current code.
Explain the root cause and propose the smallest patch to the CURRENT code that makes the tests pass without changing unrelated behavior.

Reply with ONE JSON object and nothing else (no markdown, no prose outside JSON), exactly with these keys:
{
  "failedBehavior": "what behavior failed, in one or two sentences",
  "whatChanged": "what changed between the passing and failing checkpoints",
  "probableRootCause": "the most likely root cause, one sentence",
  "explanation": "short reasoning connecting the change to the failing tests",
  "edits": [ { "find": "exact text copied from the CURRENT code", "replace": "replacement text" } ],
  "confidenceNotes": "what is uncertain or what the tests do not cover"
}
Rules for "edits":
- Each "find" must be copied character-for-character from the CURRENT code (including indentation) and must occur exactly once in it.
- Keep edits minimal: change only what fixes the regression. Usually one edit.
- Do not modify or delete the tests; they are not in the code.`;

/**
 * @param {{
 *   challenge: { title: string, description: string, language: string },
 *   lastPassing: { sequenceNumber: number, label: string, author: string, sourceCode: string },
 *   firstFailing: { sequenceNumber: number, label: string, author: string, sourceCode: string },
 *   failingRun: import('./runner.js').TestRun,
 *   currentCode: string,
 * }} ctx
 */
export function buildDebugPrompt({ challenge, lastPassing, firstFailing, failingRun, currentCode }) {
  // Every test with its status, so the model knows what IS covered (not only what failed).
  const byName = new Map(failingRun.cases.map((c) => [c.name, c]));
  const suite = (challenge.tests ?? [])
    .map((t) => {
      const c = byName.get(t.name);
      return `- [${c ? c.status.toUpperCase() : 'NOT RUN'}] ${t.name}`;
    })
    .join('\n');
  const failures = failingRun.cases
    .filter((c) => c.status !== 'passed')
    .map((c) => {
      const test = challenge.tests?.find((t) => t.name === c.name);
      const input = test ? `\n  call: ${test.fn}(${test.args.map((a) => JSON.stringify(a)).join(', ')})` : '';
      return `- ${c.name}${input}\n  expected: ${JSON.stringify(c.expected)}\n  got:      ${c.error ? `error "${c.error}"` : JSON.stringify(c.actual)}`;
    })
    .join('\n');
  const summary =
    failingRun.status === 'error'
      ? `Run error (${failingRun.errorKind}): ${failingRun.message ?? ''}`
      : `${failingRun.passed}/${failingRun.total} tests passed.`;
  const driver = challenge.support ? `\nTrusted test driver (not part of the code you edit):\n<<<DRIVER\n${challenge.support.trim()}\nDRIVER>>>\n` : '';
  return `Challenge: ${challenge.title} (${challenge.language})
Specification: ${challenge.description}
How the tests work: ${challenge.testNotes ?? 'Each test calls a top-level function and compares the JSON result exactly.'}
${driver}
Last passing checkpoint: #${lastPassing.sequenceNumber} "${lastPassing.label}" by ${lastPassing.author || 'unknown'}
First failing checkpoint: #${firstFailing.sequenceNumber} "${firstFailing.label}" by ${firstFailing.author || 'unknown'}

Diff from last passing to first failing (- removed, + added):
${unifiedDiff(lastPassing.sourceCode, firstFailing.sourceCode)}

Full test suite at the first failing checkpoint (${summary}):
${suite}

Failing tests in detail:
${failures || '(no per-test detail)'}

CURRENT code (your edits must apply to this exact text):
<<<CODE
${currentCode}
CODE>>>`;
}

const field = (description) => ({ type: 'string', minLength: 1, maxLength: 2000, description });

/**
 * JSON Schema for Meta structured output (response_format.json_schema, strict: true).
 * Meets Meta's strict subset: plain object root, additionalProperties: false on every object,
 * every property required, no allOf/oneOf. Decoding is constrained to it; parseAnalysis still
 * validates everything (and that the edits apply), since a schema can't check that `find`
 * occurs exactly once in the code.
 */
export const ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['failedBehavior', 'whatChanged', 'probableRootCause', 'explanation', 'edits', 'confidenceNotes'],
  properties: {
    failedBehavior: field('What behavior failed, in one or two sentences.'),
    whatChanged: field('What changed between the passing and failing checkpoints.'),
    probableRootCause: field('The most likely root cause, one sentence.'),
    explanation: field('Short reasoning connecting the change to the failing tests.'),
    edits: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      description: 'Minimal find/replace edits to the CURRENT code. Usually one.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['find', 'replace'],
        properties: {
          find: { type: 'string', minLength: 1, maxLength: 4000, description: 'Exact text copied from the CURRENT code; must occur exactly once.' },
          replace: { type: 'string', maxLength: 4000, description: 'Replacement text.' },
        },
      },
    },
    confidenceNotes: field('What is uncertain or not covered by the tests.'),
  },
};

/** Take the JSON object out of a reply that may be fenced or have stray text around it. */
export function extractJsonObject(text) {
  if (typeof text !== 'string') return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

const TEXT_FIELDS = ['failedBehavior', 'whatChanged', 'probableRootCause', 'explanation', 'confidenceNotes'];
const MAX_FIELD = 2000;

/**
 * Validate the model's reply against the schema and check that its edits apply cleanly to
 * the code they target.
 * @returns {{ ok: true, analysis: DebugAnalysis, patchedCode: string } | { ok: false, error: string }}
 *
 * @typedef {{ failedBehavior: string, whatChanged: string, probableRootCause: string, explanation: string,
 *   edits: import('./patches.js').Edit[], confidenceNotes: string }} DebugAnalysis
 */
export function parseAnalysis(text, currentCode) {
  const obj = extractJsonObject(text);
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, error: 'The model did not return a JSON object.' };
  for (const key of TEXT_FIELDS) {
    if (typeof obj[key] !== 'string' || !obj[key].trim()) return { ok: false, error: `The model's answer is missing "${key}".` };
  }
  const edits = validateEdits(obj.edits);
  if (!edits.ok) return { ok: false, error: `The model's patch is invalid: ${edits.error}` };
  const applied = applyEdits(currentCode, edits.edits);
  if (!applied.ok) return { ok: false, error: `The model's patch does not apply: ${applied.error}` };
  /** @type {DebugAnalysis} */
  const analysis = { edits: edits.edits };
  for (const key of TEXT_FIELDS) analysis[key] = obj[key].trim().slice(0, MAX_FIELD);
  return { ok: true, analysis, patchedCode: applied.code };
}
