// Minimal WebRTC signaling server for y-webrtc.
// Peers subscribe to a room "topic" and publish offers/answers/ICE candidates to it.
// Once two browsers have connected, no document data passes through here.
import http from 'node:http';
import { WebSocketServer } from 'ws';

const port = Number(process.env.PORT) || 4444;
const topics = new Map(); // topic name -> Set<WebSocket>

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('PeerCode AI signaling server: ok');
});
const wss = new WebSocketServer({ server });

const send = (ws, message) => {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
};

wss.on('connection', (ws) => {
  const subscribed = new Set();
  let alive = true;
  ws.on('pong', () => (alive = true));
  const heartbeat = setInterval(() => {
    if (!alive) return ws.terminate();
    alive = false;
    ws.ping();
  }, 30000);

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    switch (msg?.type) {
      case 'subscribe':
        for (const t of msg.topics ?? []) {
          if (typeof t !== 'string') continue;
          if (!topics.has(t)) topics.set(t, new Set());
          topics.get(t).add(ws);
          subscribed.add(t);
        }
        break;
      case 'unsubscribe':
        for (const t of msg.topics ?? []) {
          topics.get(t)?.delete(ws);
          if (topics.get(t)?.size === 0) topics.delete(t);
          subscribed.delete(t);
        }
        break;
      case 'publish': {
        const receivers = topics.get(msg.topic);
        if (!receivers) break;
        msg.clients = receivers.size;
        for (const r of receivers) send(r, msg);
        break;
      }
      case 'ping':
        send(ws, { type: 'pong' });
    }
  });

  ws.on('close', () => {
    clearInterval(heartbeat);
    for (const t of subscribed) {
      const subs = topics.get(t);
      subs?.delete(ws);
      if (subs?.size === 0) topics.delete(t);
    }
  });
});

server.listen(port, () => console.log(`Signaling server listening on ws://localhost:${port}`));
