// PeerCode AI server, one port:
//   /match         matchmaking queue
//   /relay/<room>  fallback relay for rooms whose peers can't connect directly (forwards, never stores)
//   anything else  WebRTC signaling (introduces peers so they can sync directly)
//
// Environment:
//   PORT             port to listen on (hosts like Railway/Render set this). Default 4444.
//   ALLOWED_ORIGINS  comma-separated origins allowed to connect, e.g.
//                    https://peercode.vercel.app,https://peercode-*.vercel.app
//                    (* matches one subdomain part, for preview deploys). Unset = any origin.
//   MAX_CONNECTIONS_PER_IP  default 20.
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { createMatchmaker } from './matchmaking.js';
import { handleRelay } from './relay.js';
import { handleSignaling } from './signaling.js';

const port = Number(process.env.PORT) || 4444;
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);
const maxPerIp = Number(process.env.MAX_CONNECTIONS_PER_IP) || 20;

/** Turn "https://peercode-*.vercel.app" into a regex where * matches one hostname label. */
function originPattern(origin) {
  const escaped = origin.replace(/[.+?^$()|[\]{}\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\*/g, '[a-z0-9-]+')}$`, 'i');
}
const originPatterns = allowedOrigins.map(originPattern);
const originAllowed = (origin) => !originPatterns.length || originPatterns.some((re) => re.test(origin ?? ''));

const matchmaker = createMatchmaker();
const connectionsByIp = new Map();

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, queue: matchmaker.size, connections: wss.clients.size }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('PeerCode AI server: ok');
});

/** Behind a proxy (Railway, Render), the real client IP is the first X-Forwarded-For entry. */
function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0].trim();
  return first || req.socket.remoteAddress || 'unknown';
}

const wss = new WebSocketServer({
  server,
  // Room relay messages can carry a whole document on join (code + chat history).
  maxPayload: 1024 * 1024,
  verifyClient: ({ origin, req }, done) => {
    if (!originAllowed(origin)) return done(false, 403, 'Origin not allowed');
    if ((connectionsByIp.get(clientIp(req)) ?? 0) >= maxPerIp) return done(false, 429, 'Too many connections');
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

server.listen(port, () => {
  console.log(`PeerCode AI server listening on port ${port} (signaling: /, matchmaking: /match, relay: /relay/<room>, health: /health)`);
  console.log(allowedOrigins.length ? `Allowed origins: ${allowedOrigins.join(', ')}` : 'Allowed origins: any (set ALLOWED_ORIGINS in production)');
});

// Hosts send SIGTERM on redeploy; close sockets so clients reconnect to the new instance.
const shutdown = () => {
  matchmaker.close();
  for (const ws of wss.clients) ws.close(1012, 'Server restarting');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
