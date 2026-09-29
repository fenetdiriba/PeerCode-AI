// Minimal WebRTC signaling for y-webrtc.
// Peers subscribe to a room "topic" and publish offers/answers/ICE candidates to it.
// Once two browsers have connected, no document data passes through here.
import { send } from './util.js';

const topics = new Map(); // topic name -> Set<WebSocket>

/** @param {import('ws').WebSocket} ws */
export function handleSignaling(ws) {
  const subscribed = new Set();

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
    for (const t of subscribed) {
      const subs = topics.get(t);
      subs?.delete(ws);
      if (subs?.size === 0) topics.delete(t);
    }
  });
}
