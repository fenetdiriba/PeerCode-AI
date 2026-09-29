// Matchmaking queue. Clients join with a skill profile; every tick we pair the waiting
// pool by cosine similarity (see shared/matching.js) and send both people the same room.
// State is in memory: fine for one server process. A multi-instance deploy would move
// the pool to something shared like Redis.
import { randomBytes, randomUUID } from 'node:crypto';
import {
  normalizeSkills,
  pairUp,
  sharedSkills,
  suggestEditorLanguage,
} from '../shared/matching.js';
import { send } from './util.js';

const TICK_MS = 1000;
const ROOM_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function roomId() {
  return Array.from(randomBytes(6), (b) => ROOM_ALPHABET[b % ROOM_ALPHABET.length]).join('');
}

const cleanName = (raw) =>
  (typeof raw === 'string' ? raw : '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 24) || 'Anonymous';

const cleanUserId = (raw) => (typeof raw === 'string' && /^[a-zA-Z0-9-]{8,64}$/.test(raw) ? raw : randomUUID());

export function createMatchmaker({ now = () => Date.now() } = {}) {
  /** @type {Map<string, { id: string, userId: string, ws: import('ws').WebSocket, name: string, skills: import('../shared/matching.js').SkillProfile, joinedAt: number }>} */
  const pool = new Map();

  const broadcastQueueSize = () => {
    for (const entry of pool.values()) send(entry.ws, { type: 'queue', size: pool.size });
  };

  const publicProfile = (e) => ({ name: e.name, ...e.skills });

  function tick() {
    if (pool.size < 2) return;
    const pairs = pairUp([...pool.values()], now());
    for (const { a, b, score } of pairs) {
      pool.delete(a.id);
      pool.delete(b.id);
      const room = roomId();
      const shared = sharedSkills(a.skills, b.skills);
      const language = suggestEditorLanguage(a.skills, b.skills);
      send(a.ws, { type: 'matched', roomId: room, score, language, shared, partner: publicProfile(b) });
      send(b.ws, { type: 'matched', roomId: room, score, language, shared, partner: publicProfile(a) });
    }
    if (pairs.length) broadcastQueueSize();
  }

  const timer = setInterval(tick, TICK_MS);

  /** @param {import('ws').WebSocket} ws */
  function handle(ws) {
    const id = randomUUID();

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg?.type === 'join') {
        const skills = normalizeSkills(msg.profile?.skills);
        if (!skills) {
          send(ws, { type: 'error', message: 'Pick at least one language or topic, and a level.' });
          return;
        }
        pool.set(id, {
          id,
          userId: cleanUserId(msg.profile?.userId),
          ws,
          name: cleanName(msg.profile?.name),
          skills,
          joinedAt: pool.get(id)?.joinedAt ?? now(),
        });
        broadcastQueueSize();
        tick();
      } else if (msg?.type === 'leave') {
        if (pool.delete(id)) broadcastQueueSize();
      }
    });

    ws.on('close', () => {
      if (pool.delete(id)) broadcastQueueSize();
    });
  }

  return {
    handle,
    tick,
    get size() {
      return pool.size;
    },
    close: () => clearInterval(timer),
  };
}
