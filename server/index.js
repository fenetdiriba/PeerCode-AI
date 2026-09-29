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
import { DEFAULT_MODELS, geminiGenerator } from './ai.js';
import { createApp } from './app.js';

const port = Number(process.env.PORT) || 4444;
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);
// Dashboards make it easy to paste a key with surrounding quotes or spaces; strip them.
const apiKey = process.env.GEMINI_API_KEY?.trim().replace(/^["']|["']$/g, '').trim();
const models = (process.env.GEMINI_MODEL ?? '')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

const { server, close } = createApp({
  allowedOrigins,
  maxConnectionsPerIp: Number(process.env.MAX_CONNECTIONS_PER_IP) || 20,
  generate: apiKey ? geminiGenerator(apiKey, models.length ? models : DEFAULT_MODELS) : null,
  aiRequestsPer10Min: Number(process.env.AI_REQUESTS_PER_10_MIN) || 20,
});

server.listen(port, () => {
  console.log(`PeerCode AI server listening on port ${port}`);
  console.log(allowedOrigins.length ? `Allowed origins: ${allowedOrigins.join(', ')}` : 'Allowed origins: any (set ALLOWED_ORIGINS in production)');
  console.log(apiKey ? 'AI hints: enabled' : 'AI hints: disabled (set GEMINI_API_KEY to enable)');
});

// Hosts send SIGTERM on redeploy; close sockets so clients reconnect to the new instance.
const shutdown = () => {
  close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
