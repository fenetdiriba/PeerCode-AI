// PeerCode AI server, one port:
//   POST /api/ai-hint  AI code hints (Gemini), key stays on the server
//   GET  /health       health check
//   ws /match          matchmaking queue
//   ws /relay/<room>   fallback relay for rooms whose peers can't connect directly (forwards, never stores)
//   ws (other paths)   WebRTC signaling (introduces peers so they can sync directly)
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { createAiHint } from './ai.js';
import { createMatchmaker } from './matchmaking.js';
import { handleRelay } from './relay.js';
import { handleSignaling } from './signaling.js';

/** Turn "https://peercode-*.vercel.app" into a regex where * matches one hostname label. */
function originPattern(origin) {
  const escaped = origin.replace(/[.+?^$()|[\]{}\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\*/g, '[a-z0-9-]+')}$`, 'i');
}

/** Behind a proxy (Railway, Render), the real client IP is the first X-Forwarded-For entry. */
function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0].trim();
  return first || req.socket.remoteAddress || 'unknown';
}

/**
 * @param {{
 *   allowedOrigins?: string[],
 *   maxConnectionsPerIp?: number,
 *   generate?: ((prompt: string) => Promise<string>) | null,
 *   aiRequestsPer10Min?: number,
 * }} [options]
 */
export function createApp({ allowedOrigins = [], maxConnectionsPerIp = 20, generate = null, aiRequestsPer10Min = 20 } = {}) {
  const originPatterns = allowedOrigins.map(originPattern);
  const originAllowed = (origin) => !originPatterns.length || originPatterns.some((re) => re.test(origin ?? ''));

  const matchmaker = createMatchmaker();
  const aiHint = createAiHint({ generate, maxRequests: aiRequestsPer10Min });
  const connectionsByIp = new Map();

  const server = http.createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;

    if (path === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: true,
          ai: Boolean(generate),
          // Hosts expose the deployed commit; shows at a glance whether a merge has gone live.
          version: (process.env.RAILWAY_GIT_COMMIT_SHA || process.env.RENDER_GIT_COMMIT || 'dev').slice(0, 7),
          queue: matchmaker.size,
          connections: wss.clients.size,
        }),
      );
      return;
    }

    if (path === '/api/ai-hint') {
      // The browser calls this cross-origin (Vercel -> Railway), so answer CORS for allowed sites only.
      const origin = req.headers.origin;
      if (origin && !originAllowed(origin)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Origin not allowed' }));
        return;
      }
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '600',
        });
        res.end();
        return;
      }
      if (req.method !== 'POST') {
        res.writeHead(405, { Allow: 'POST, OPTIONS' });
        res.end();
        return;
      }
      aiHint.handle(req, res, clientIp(req)).catch((err) => {
        console.error('AI hint handler crashed:', err);
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('PeerCode AI server: ok');
  });

  const wss = new WebSocketServer({
    server,
    // Room relay messages can carry a whole document on join (code + chat history).
    maxPayload: 1024 * 1024,
    verifyClient: ({ origin, req }, done) => {
      if (!originAllowed(origin)) return done(false, 403, 'Origin not allowed');
      if ((connectionsByIp.get(clientIp(req)) ?? 0) >= maxConnectionsPerIp) return done(false, 429, 'Too many connections');
      done(true);
    },
  });

  wss.on('connection', (ws, req) => {
    const ip = clientIp(req);
    connectionsByIp.set(ip, (connectionsByIp.get(ip) ?? 0) + 1);

    // Drop connections that stop answering pings (closed laptop, lost network).
    let alive = true;
    ws.on('pong', () => (alive = true));
    const heartbeat = setInterval(() => {
      if (!alive) return ws.terminate();
      alive = false;
      ws.ping();
    }, 30000);

    ws.on('close', () => {
      clearInterval(heartbeat);
      const left = (connectionsByIp.get(ip) ?? 1) - 1;
      if (left > 0) connectionsByIp.set(ip, left);
      else connectionsByIp.delete(ip);
    });

    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (path === '/match') matchmaker.handle(ws);
    else if (path.startsWith('/relay/')) {
      // Room names are [a-z0-9-], so no decoding is needed; anything else is rejected.
      if (!handleRelay(ws, path.slice('/relay/'.length))) ws.close(1008, 'Invalid room');
    } else handleSignaling(ws);
  });

  /** Close sockets (so clients reconnect to a new instance) and stop accepting connections. */
  const close = (callback) => {
    matchmaker.close();
    for (const ws of wss.clients) ws.close(1012, 'Server restarting');
    server.close(callback);
  };

  return { server, wss, close };
}
