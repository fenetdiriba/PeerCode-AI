import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { handleRelay } from './relay.js';

class FakeSocket extends EventEmitter {
  OPEN = 1;
  readyState = 1;
  binary = [];
  control = [];
  send(data, opts) {
    if (opts?.binary) this.binary.push(Buffer.from(data));
    else this.control.push(JSON.parse(data));
  }
  receive(bytes) {
    this.emit('message', Buffer.from(bytes), true);
  }
}

test('forwards binary frames to the other clients in the same room only', () => {
  const [a, b, c] = [new FakeSocket(), new FakeSocket(), new FakeSocket()];
  assert.ok(handleRelay(a, 'room-1'));
  assert.ok(handleRelay(b, 'room-1'));
  assert.ok(handleRelay(c, 'room-2'));
  a.receive([1, 2, 3]);
  assert.deepEqual(b.binary, [Buffer.from([1, 2, 3])]);
  assert.equal(a.binary.length, 0); // never echoed to the sender
  assert.equal(c.binary.length, 0); // other rooms never see it
  [a, b, c].forEach((s) => s.emit('close'));
});

test('tells clients how many others are in the room', () => {
  const [a, b] = [new FakeSocket(), new FakeSocket()];
  handleRelay(a, 'room-count');
  assert.deepEqual(a.control.at(-1), { type: 'peers', count: 0 });
  handleRelay(b, 'room-count');
  assert.deepEqual(a.control.at(-1), { type: 'peers', count: 1 });
  b.emit('close');
  assert.deepEqual(a.control.at(-1), { type: 'peers', count: 0 });
  a.emit('close');
});

test('rejects invalid room names and ignores text frames', () => {
  assert.equal(handleRelay(new FakeSocket(), '../etc'), false);
  assert.equal(handleRelay(new FakeSocket(), 'UPPER'), false);
  const [a, b] = [new FakeSocket(), new FakeSocket()];
  handleRelay(a, 'room-text');
  handleRelay(b, 'room-text');
  a.emit('message', Buffer.from('hello'), false);
  assert.equal(b.binary.length, 0);
  [a, b].forEach((s) => s.emit('close'));
});

test('drops messages beyond the per-second rate limit', () => {
  const [a, b] = [new FakeSocket(), new FakeSocket()];
  handleRelay(a, 'room-flood');
  handleRelay(b, 'room-flood');
  for (let i = 0; i < 100; i++) a.receive([i]);
  assert.equal(b.binary.length, 60);
  [a, b].forEach((s) => s.emit('close'));
});
