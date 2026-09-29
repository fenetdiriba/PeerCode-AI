// PeerCode AI server: WebRTC signaling (any path) + matchmaking (/match), one port.
// Neither sees code: rooms sync peer-to-peer once browsers are introduced.
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { createMatchmaker } from './matchmaking.js';
import { handleSignaling } from './signaling.js';

const port = Number(process.env.PORT) || 4444;
const matchmaker = createMatchmaker();

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('PeerCode AI server: ok');
});

const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });

wss.on('connection', (ws, req) => {
  // Drop connections that stop answering pings (closed laptop, lost network).
  let alive = true;
  ws.on('pong', () => (alive = true));
  const heartbeat = setInterval(() => {
    if (!alive) return ws.terminate();
    alive = false;
    ws.ping();
  }, 30000);
  ws.on('close', () => clearInterval(heartbeat));

  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (path === '/match') matchmaker.handle(ws);
  else handleSignaling(ws);
});

server.listen(port, () => {
  console.log(`PeerCode AI server on ws://localhost:${port} (signaling) and ws://localhost:${port}/match (matchmaking)`);
});
