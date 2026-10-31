// Client for the time-travel debugger API (server/debugger.js). All execution and model calls
// happen on the server; the browser only sends code and renders results.
import { DEBUGGER_API_URL } from './config';

export interface TestCase {
  name: string;
  fn: string;
  args: unknown[];
  expected: unknown;
}

export interface Challenge {
  id: string;
  title: string;
  description: string;
  language: 'typescript';
  starterCode: string;
  tests: TestCase[];
  demoSteps: { label: string; author: string; code: string }[];
}

export interface CodeRevision {
  id: string;
  roomId: string;
  sequenceNumber: number;
  createdAt: string;
  sourceCode: string;
  contentHash: string;
  label: string;
  author: string;
  challengeId: string;
}

export type ErrorKind = 'compile' | 'runtime' | 'timeout' | 'crash' | 'infrastructure';

export interface CaseResult {
  name: string;
  status: 'passed' | 'failed' | 'error';
  expected: unknown;
  actual?: unknown;
  error?: string;
}

export interface TestRun {
  status: 'passed' | 'failed' | 'error';
  errorKind?: ErrorKind;
  message?: string;
  cases: CaseResult[];
  passed: number;
  total: number;
  logs: string[];
  durationMs: number;
}

export interface Observation {
  revisionId: string;
  sequenceNumber: number;
  status: TestRun['status'];
  errorKind?: ErrorKind;
  passed: number;
  total: number;
}

export interface RegressionReport {
  outcome: 'found' | 'no-regression' | 'baseline-failing' | 'infrastructure-error' | 'not-enough-revisions';
  strategy: 'bisect+verify' | 'linear';
  baselineRevisionId: string | null;
  lastPassingRevisionId: string | null;
  firstFailingRevisionId: string | null;
  nonMonotonic: boolean;
  testsRun: number;
  revisionsInRange: number;
  observations: Observation[];
  firstFailingRun: TestRun | null;
  message: string;
  /** Test processes actually started for this search; the rest were cached results for identical code. */
  executedRuns: number;
  durationMs: number;
}

export interface PatchEdit {
  find: string;
  replace: string;
}

export interface DebugAnalysis {
  failedBehavior: string;
  whatChanged: string;
  probableRootCause: string;
  explanation: string;
  edits: PatchEdit[];
  confidenceNotes: string;
}

export interface AnalyzeResponse {
  analysis: DebugAnalysis;
  patchedCode: string;
  sourceHash: string;
  model: string;
  attempts: number;
  latencyMs: number;
  responseFormat: 'json_schema' | 'json_object' | 'none';
  schemaFallback: boolean;
  usage: { promptTokens: number; completionTokens: number; reasoningTokens: number; totalTokens: number };
  requestIds: string[];
}

export interface VerifyResponse {
  sourceHash: string;
  patchedCode: string;
  patchedHash: string;
  run: TestRun;
}

/** An API failure with the server's user-facing message and optional machine-readable code. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${DEBUGGER_API_URL}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Can't reach the PeerCode server.", 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status}).`, res.status, data?.code);
  return data as T;
}

export const debuggerApi = {
  challenges: () => api<{ challenges: Challenge[]; ai: { available: boolean; model: string } }>('GET', '/challenges'),
  listRevisions: (roomId: string) => api<{ revisions: CodeRevision[] }>('GET', `/rooms/${roomId}/revisions`),
  createRevision: (roomId: string, input: { sourceCode: string; label: string; author: string; challengeId: string }) =>
    api<{ revision: CodeRevision }>('POST', `/rooms/${roomId}/revisions`, input),
  clearRevisions: (roomId: string) => api<{ revisions: CodeRevision[] }>('DELETE', `/rooms/${roomId}/revisions`),
  testRevision: (roomId: string, revisionId: string) => api<{ revisionId: string; run: TestRun }>('POST', `/rooms/${roomId}/revisions/${revisionId}/test`, {}),
  locateRegression: (roomId: string, opts: { baselineId?: string; strategy?: 'bisect+verify' | 'linear' } = {}) =>
    api<{ report: RegressionReport }>('POST', `/rooms/${roomId}/regression`, opts),
  analyze: (roomId: string, input: { lastPassingId: string; firstFailingId: string; currentCode: string }) =>
    api<AnalyzeResponse>('POST', `/rooms/${roomId}/analyze`, input),
  verify: (input: { challengeId: string; sourceCode: string; edits: PatchEdit[] }) => api<VerifyResponse>('POST', '/verify', input),
};
