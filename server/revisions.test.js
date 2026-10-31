import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createRevisionStore, hashCode, validateRevisionInput } from './revisions.js';

const tmpDir = () => fs.mkdtemp(path.join(os.tmpdir(), 'peercode-rev-'));

test('create assigns increasing sequence numbers, hashes and timestamps', async () => {
  const store = createRevisionStore({ now: () => new Date('2026-10-30T12:00:00Z') });
  const a = await store.create('room-1', { sourceCode: 'a', label: 'first', author: 'A', challengeId: 'cart-total' });
  const b = await store.create('room-1', { sourceCode: 'b', challengeId: 'cart-total' });
  assert.equal(a.sequenceNumber, 1);
  assert.equal(b.sequenceNumber, 2);
  assert.equal(a.contentHash, hashCode('a'));
  assert.equal(a.createdAt, '2026-10-30T12:00:00.000Z');
  assert.notEqual(a.id, b.id);
  // Rooms are independent.
  assert.equal((await store.create('room-2', { sourceCode: 'x', challengeId: 'cart-total' })).sequenceNumber, 1);
});

test('revisions reconstruct the exact source, including whitespace and unicode', async () => {
  const store = createRevisionStore();
  const source = 'function f() {\r\n\treturn "é ✓ 🙂";  \n}\n\n';
  const rev = await store.create('r', { sourceCode: source, challengeId: 'c' });
  assert.equal((await store.get('r', rev.id)).sourceCode, source);
});

test('concurrent creates get distinct, gap-free sequence numbers in timeline order', async () => {
  const store = createRevisionStore();
  const created = await Promise.all(Array.from({ length: 20 }, (_, i) => store.create('r', { sourceCode: String(i), challengeId: 'c' })));
  const seqs = created.map((r) => r.sequenceNumber).sort((x, y) => x - y);
  assert.deepEqual(seqs, Array.from({ length: 20 }, (_, i) => i + 1));
  const listed = await store.list('r');
  assert.deepEqual(listed.map((r) => r.sequenceNumber), seqs);
});

test('history persists across store instances (server restart / page refresh)', async () => {
  const dir = await tmpDir();
  const first = createRevisionStore({ dir });
  const rev = await first.create('room-1', { sourceCode: 'const x = 1;\n', label: 'cp', challengeId: 'c' });
  await first.create('room-1', { sourceCode: 'const x = 2;\n', challengeId: 'c' });

  const second = createRevisionStore({ dir });
  const listed = await second.list('room-1');
  assert.equal(listed.length, 2);
  assert.deepEqual(listed[0], rev);
  // Numbering continues after a restart.
  assert.equal((await second.create('room-1', { sourceCode: 'z', challengeId: 'c' })).sequenceNumber, 3);
  await fs.rm(dir, { recursive: true, force: true });
});

test('clear empties a room, persistently', async () => {
  const dir = await tmpDir();
  const store = createRevisionStore({ dir });
  await store.create('r', { sourceCode: 'a', challengeId: 'c' });
  await store.clear('r');
  assert.deepEqual(await createRevisionStore({ dir }).list('r'), []);
  await fs.rm(dir, { recursive: true, force: true });
});

test('invalid room ids are rejected', async () => {
  const store = createRevisionStore();
  await assert.rejects(store.list('../etc'));
  await assert.rejects(store.create('a/b', { sourceCode: '', challengeId: 'c' }));
});

test('validateRevisionInput', () => {
  assert.equal(validateRevisionInput({ sourceCode: 'x', challengeId: 'c' }).ok, true);
  assert.equal(validateRevisionInput({ sourceCode: 1, challengeId: 'c' }).ok, false);
  assert.equal(validateRevisionInput({ sourceCode: 'x' }).ok, false);
  assert.equal(validateRevisionInput({ sourceCode: 'x'.repeat(50_001), challengeId: 'c' }).ok, false);
  assert.equal(validateRevisionInput({ sourceCode: 'x', challengeId: 'c', label: 'y'.repeat(500) }).value.label.length, 120);
});

test('room cap: new rooms are refused once the limit is reached; existing rooms keep working', async () => {
  const dir = await tmpDir();
  const store = createRevisionStore({ dir, maxRooms: 2 });
  await store.create('r1', { sourceCode: 'a', challengeId: 'c' });
  await store.create('r2', { sourceCode: 'a', challengeId: 'c' });
  await assert.rejects(store.create('r3', { sourceCode: 'a', challengeId: 'c' }), (e) => e.status === 507);
  assert.equal((await store.create('r1', { sourceCode: 'b', challengeId: 'c' })).sequenceNumber, 2);
  await fs.rm(dir, { recursive: true, force: true });
});
