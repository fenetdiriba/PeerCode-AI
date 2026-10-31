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
import 'dotenv/config';
import { DEFAULT_MODELS, geminiGenerator } from './ai.js';
import { createApp } from './app.js';
import { createMetaClient, DEFAULT_BASE_URL, DEFAULT_MODEL, responseFormatFromEnv } from './meta.js';
import { createRevisionStore } from './revisions.js';
import { createRunner } from './runner.js';

const port = Number(process.env.PORT) || 4444;
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);
// Dashboards make it easy to paste a key with surrounding quotes or spaces; strip them.
const clean = (v) => v?.trim().replace(/^["']|["']$/g, '').trim() || undefined;
const apiKey = clean(process.env.GEMINI_API_KEY);
const metaKey = clean(process.env.MODEL_API_KEY);
const revisionsDir = process.env.REVISIONS_DIR || 'data/revisions';
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

const { server, close } = createApp({
  allowedOrigins,
  maxConnectionsPerIp: Number(process.env.MAX_CONNECTIONS_PER_IP) || 20,
  generate: apiKey ? geminiGenerator(apiKey, models.length ? models : DEFAULT_MODELS) : null,
  aiRequestsPer10Min: Number(process.env.AI_REQUESTS_PER_10_MIN) || 20,
  debuggerDeps: {
    store: createRevisionStore({ dir: revisionsDir }),
    runner: createRunner({ timeoutMs: Number(process.env.TEST_TIMEOUT_MS) || 8000 }),
    model,
  },
});

server.listen(port, () => {
  console.log(`PeerCode AI server listening on port ${port}`);
  console.log(allowedOrigins.length ? `Allowed origins: ${allowedOrigins.join(', ')}` : 'Allowed origins: any (set ALLOWED_ORIGINS in production)');
  console.log(apiKey ? 'AI hints: enabled' : 'AI hints: disabled (set GEMINI_API_KEY to enable)');
  console.log(model.available ? `Debugger AI (${model.authMode === 'injected' ? 'key injected by proxy' : 'MODEL_API_KEY'}): ${model.model} via ${clean(process.env.META_BASE_URL) ?? DEFAULT_BASE_URL}` : 'Debugger AI: unavailable (set MODEL_API_KEY to enable)');
  console.log(`Checkpoints stored in ${revisionsDir}`);
});

// Hosts send SIGTERM on redeploy; close sockets so clients reconnect to the new instance.
const shutdown = () => {
  close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
