// Fallback relay for rooms. Some networks (mobile carriers, campus Wi-Fi) block direct
// WebRTC connections between browsers. When that happens, clients still reach each other
// through here: every binary frame a client sends is forwarded to the other clients in the
// same room. Nothing is parsed or stored; the server never holds a copy of the document.
import { send } from './util.js';

const rooms = new Map(); // room name -> Set<WebSocket>
const ROOM_PATTERN = /^[a-z0-9-]{1,64}$/;
const MAX_MESSAGES_PER_SECOND = 60;

const broadcastPeerCount = (clients) => {
  for (const c of clients) send(c, { type: 'peers', count: clients.size - 1 });
};

/**
 * @param {import('ws').WebSocket} ws
 * @param {string} room
 * @returns {boolean} false if the room name is invalid
 */
export function handleRelay(ws, room) {
  if (!ROOM_PATTERN.test(room)) return false;
  if (!rooms.has(room)) rooms.set(room, new Set());
  const clients = rooms.get(room);
  clients.add(ws);
  broadcastPeerCount(clients);

  let windowStart = Date.now();
  let count = 0;

  ws.on('message', (data, isBinary) => {
    if (!isBinary) return;
    const now = Date.now();
    if (now - windowStart >= 1000) {
      windowStart = now;
      count = 0;
    }
    if (++count > MAX_MESSAGES_PER_SECOND) return;
    for (const c of clients) {
      if (c !== ws && c.readyState === c.OPEN) c.send(data, { binary: true });
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    if (clients.size === 0) rooms.delete(room);
    else broadcastPeerCount(clients);
  });
  return true;
}
