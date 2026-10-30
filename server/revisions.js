// Revision history: explicit checkpoints of a room's code.
//
// A revision is a full snapshot, not a Yjs update. Snapshots are lossless (any revision is
// reconstructed by reading it back) and independent of CRDT internals. `sequenceNumber` is
// assigned by the server and strictly increases within a room, so ordering is deterministic
// even when two collaborators checkpoint at the same moment. Rooms are persisted as one JSON
// file each, written atomically (temp file + rename).
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const ROOM_PATTERN = /^[a-z0-9-]{1,64}$/;
export const MAX_SOURCE_CHARS = 50_000;
export const MAX_REVISIONS_PER_ROOM = 200;

/** SHA-256 of the exact source text; used to detect identical code and live-document drift. */
export const hashCode = (source) => createHash('sha256').update(source, 'utf8').digest('hex');

/**
 * @typedef {{
 *   id: string, roomId: string, sequenceNumber: number, createdAt: string,
 *   sourceCode: string, contentHash: string, label: string, author: string, challengeId: string,
 * }} CodeRevision
 */

/** @returns {{ ok: true, value: { sourceCode: string, label: string, author: string, challengeId: string } } | { ok: false, error: string }} */
export function validateRevisionInput(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request.' };
  const { sourceCode, label = '', author = '', challengeId } = body;
  if (typeof sourceCode !== 'string') return { ok: false, error: 'sourceCode must be a string.' };
  if (sourceCode.length > MAX_SOURCE_CHARS) return { ok: false, error: `Code is too large (max ${MAX_SOURCE_CHARS} characters).` };
  if (typeof label !== 'string' || typeof author !== 'string') return { ok: false, error: 'label and author must be strings.' };
  if (typeof challengeId !== 'string' || !challengeId) return { ok: false, error: 'challengeId is required.' };
  return { ok: true, value: { sourceCode, label: label.trim().slice(0, 120), author: author.trim().slice(0, 40), challengeId } };
}

/**
 * @param {{ dir?: string | null, now?: () => Date }} [options] dir = null keeps everything in memory
 */
export function createRevisionStore({ dir = null, now = () => new Date() } = {}) {
  /** @type {Map<string, CodeRevision[]>} */
  const rooms = new Map();
  /** Per-room promise chain, so reads, appends and writes for a room never interleave. */
  const queues = new Map();

  const serialize = (roomId, task) => {
    const next = (queues.get(roomId) ?? Promise.resolve()).then(task, task);
    queues.set(roomId, next.catch(() => {}));
    return next;
  };

  const fileFor = (roomId) => path.join(/** @type {string} */ (dir), `${roomId}.json`);

  async function load(roomId) {
    if (!ROOM_PATTERN.test(roomId)) throw new Error('Invalid room id.');
    if (rooms.has(roomId)) return rooms.get(roomId);
    let list = [];
    if (dir) {
      try {
        const parsed = JSON.parse(await fs.readFile(fileFor(roomId), 'utf8'));
        if (Array.isArray(parsed?.revisions)) list = parsed.revisions;
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
    }
    list.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    rooms.set(roomId, list);
    return list;
  }

  async function persist(roomId, list) {
    if (!dir) return;
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${fileFor(roomId)}.${process.pid}.${randomUUID()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify({ version: 1, revisions: list }));
    await fs.rename(tmp, fileFor(roomId));
  }

  return {
    /** @returns {Promise<CodeRevision[]>} oldest first */
    list: (roomId) => serialize(roomId, async () => [...(await load(roomId))]),

    /** @returns {Promise<CodeRevision | undefined>} */
    get: (roomId, id) => serialize(roomId, async () => (await load(roomId)).find((r) => r.id === id)),

    /** @returns {Promise<CodeRevision>} */
    create: (roomId, { sourceCode, label = '', author = '', challengeId }) =>
      serialize(roomId, async () => {
        const list = await load(roomId);
        if (list.length >= MAX_REVISIONS_PER_ROOM) {
          throw Object.assign(new Error(`This room has reached ${MAX_REVISIONS_PER_ROOM} checkpoints.`), { status: 409 });
        }
        /** @type {CodeRevision} */
        const revision = {
          id: randomUUID(),
          roomId,
          sequenceNumber: (list.at(-1)?.sequenceNumber ?? 0) + 1,
          createdAt: now().toISOString(),
          sourceCode,
          contentHash: hashCode(sourceCode),
          label,
          author,
          challengeId,
        };
        const next = [...list, revision];
        await persist(roomId, next);
        rooms.set(roomId, next);
        return revision;
      }),

    /** Remove a room's whole history (used to restart the demo scenario). */
    clear: (roomId) =>
      serialize(roomId, async () => {
        await load(roomId);
        await persist(roomId, []);
        rooms.set(roomId, []);
      }),
  };
}
