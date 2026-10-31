// Starts the PeerCode AI server (see app.js for what it serves).
//
// Environment:
//   PORT                    port to listen on (hosts like Railway/Render set this). Default 4444.
//   ALLOWED_ORIGINS         comma-separated origins allowed to connect, e.g.
//                           https://peercode.vercel.app,https://peercode-*.vercel.app
//                           (* matches one subdomain part, for preview deploys). Unset = any origin.
//   MAX_CONNECTIONS_PER_IP  default 20.
//   GEMINI_API_KEY          enables AI code hints. Unset = the endpoint answers 503.
//   GEMINI_MODEL            model(s) to use, comma-separated, tried in order.
//                           Default: gemini-flash-latest, then gemini-2.5-flash, gemini-2.0-flash.
//   AI_REQUESTS_PER_10_MIN  per-IP limit for AI hints. Default 20.
//   MODEL_API_KEY           Meta Model API key; enables Muse Spark debugging analysis.
//   META_BASE_URL           default https://api.meta.ai/v1
//   META_MODEL              default muse-spark-1.3
//   META_RESPONSE_FORMAT    json_schema (default, Meta structured output), json_object, or none.
//   META_AUTH               "injected" when an egress proxy adds the Authorization header
//                           (e.g. a Claude Code network secret); MODEL_API_KEY is then not needed.
//   REVISIONS_DIR           where checkpoints are stored (one JSON file per room). Default ./data/revisions.
//   TEST_TIMEOUT_MS         wall-clock limit per test run. Default 8000.
//   EXECUTION_MODE          restricted (default): only built-in scenario code and server-made
//                           patches run. local: run anything (your own machine only; refused
//                           on hosting platforms).
//   DEBUGGER_ACCESS_CODE    optional; if set, writes, test runs and AI calls need it.
//   AI_DAILY_LIMIT          model calls per UTC day across all users. Default 200.
//   RAILWAY_VOLUME_MOUNT_PATH  set by Railway when a volume is attached; checkpoints go there.
import 'dotenv/config';
import { DEFAULT_MODELS, geminiGenerator } from './ai.js';
import { createApp } from './app.js';
import path from 'node:path';
import { executionModeFromEnv } from './execution-policy.js';
import { createMetaClient, DEFAULT_BASE_URL, DEFAULT_MODEL, responseFormatFromEnv } from './meta.js';
import { createRevisionStore } from './revisions.js';
import { checkIsolation, createRunner } from './runner.js';

const port = Number(process.env.PORT) || 4444;
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);
// Dashboards make it easy to paste a key with surrounding quotes or spaces; strip them.
const clean = (v) => v?.trim().replace(/^["']|["']$/g, '').trim() || undefined;
const apiKey = clean(process.env.GEMINI_API_KEY);
const metaKey = clean(process.env.MODEL_API_KEY);
const hosted = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RENDER || process.env.NODE_ENV === 'production');
const volume = process.env.RAILWAY_VOLUME_MOUNT_PATH;
const revisionsDir = process.env.REVISIONS_DIR || (volume ? path.join(volume, 'revisions') : 'data/revisions');
const persistence = volume && revisionsDir.startsWith(volume) ? `volume (${revisionsDir})` : hosted ? `ephemeral disk (${revisionsDir})` : `local dir (${revisionsDir})`;
const executionMode = executionModeFromEnv(process.env);

// Refuse configurations that are unsafe or can't work on a public host.
if (hosted && executionMode === 'local') {
  console.error('Refusing to start: EXECUTION_MODE=local runs arbitrary visitor code and must not be used on a hosted server.');
  process.exit(1);
}
if (hosted && process.env.META_AUTH === 'injected') {
  console.error('Refusing to start: META_AUTH=injected relies on a development proxy that adds the key. On a hosted server set MODEL_API_KEY instead.');
  process.exit(1);
}
const model = createMetaClient({
  apiKey: metaKey,
  authMode: process.env.META_AUTH === 'injected' ? 'injected' : 'key',
  baseUrl: clean(process.env.META_BASE_URL) ?? DEFAULT_BASE_URL,
  model: clean(process.env.META_MODEL) ?? DEFAULT_MODEL,
  responseFormat: responseFormatFromEnv(process.env),
});
const models = (process.env.GEMINI_MODEL ?? '')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

// Confirm the test runner's child-process restrictions hold on this host before serving.
const isolation = await checkIsolation();

const { server, close } = createApp({
  allowedOrigins,
  maxConnectionsPerIp: Number(process.env.MAX_CONNECTIONS_PER_IP) || 20,
  generate: apiKey ? geminiGenerator(apiKey, models.length ? models : DEFAULT_MODELS) : null,
  aiRequestsPer10Min: Number(process.env.AI_REQUESTS_PER_10_MIN) || 20,
  debuggerDeps: {
    store: createRevisionStore({ dir: revisionsDir }),
    runner: createRunner({ timeoutMs: Number(process.env.TEST_TIMEOUT_MS) || 8000 }),
    model,
    executionMode,
    isolation,
    accessCode: clean(process.env.DEBUGGER_ACCESS_CODE) ?? null,
    aiDailyLimit: Number(process.env.AI_DAILY_LIMIT) || 200,
    persistence,
  },
});

server.listen(port, () => {
  console.log(`PeerCode AI server listening on port ${port}`);
  console.log(allowedOrigins.length ? `Allowed origins: ${allowedOrigins.join(', ')}` : 'Allowed origins: any (set ALLOWED_ORIGINS in production)');
  console.log(apiKey ? 'AI hints: enabled' : 'AI hints: disabled (set GEMINI_API_KEY to enable)');
  console.log(model.available ? `Debugger AI (${model.authMode === 'injected' ? 'key injected by proxy' : 'MODEL_API_KEY'}): ${model.model} via ${clean(process.env.META_BASE_URL) ?? DEFAULT_BASE_URL}` : 'Debugger AI: unavailable (set MODEL_API_KEY to enable)');
  console.log(`Checkpoints: ${persistence}`);
  if (hosted && !volume) console.warn('WARNING: no Railway volume attached; checkpoints are lost on every redeploy.');
  console.log(`Test execution: ${executionMode} mode; isolation self-check ${isolation.ok ? 'passed' : `FAILED, execution disabled (${isolation.error ?? JSON.stringify(isolation.checks)})`} on Node ${isolation.nodeVersion}. Outbound network from test processes is NOT blocked.`);
  if (process.env.DEBUGGER_ACCESS_CODE) console.log('Debugger access code: required');
});

// Hosts send SIGTERM on redeploy; close sockets so clients reconnect to the new instance.
const shutdown = () => {
  close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
