import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { createMatchmaker } from './matchmaking.js';

class FakeSocket extends EventEmitter {
  OPEN = 1;
  readyState = 1;
  sent = [];
  send(data) {
    this.sent.push(JSON.parse(data));
  }
  receive(msg) {
    this.emit('message', Buffer.from(JSON.stringify(msg)));
  }
  last(type) {
    return this.sent.filter((m) => m.type === type).at(-1);
  }
}

const profile = (name, skills, userId = `user-${name}-0000`) => ({ type: 'join', profile: { name, userId, skills } });
const PY = { languages: ['Python'], topics: ['Graphs'], level: 'intermediate' };

test('two compatible users get the same room and each other’s profile', (t) => {
  const mm = createMatchmaker();
  t.after(mm.close);
  const a = new FakeSocket();
  const b = new FakeSocket();
  mm.handle(a);
  mm.handle(b);
  a.receive(profile('Ana', PY));
  assert.equal(a.last('queue').size, 1);
  b.receive(profile('Ben', PY));

  const ma = a.last('matched');
  const mb = b.last('matched');
  assert.ok(ma && mb);
  assert.equal(ma.roomId, mb.roomId);
  assert.match(ma.roomId, /^[a-z0-9]{6}$/);
  assert.equal(ma.partner.name, 'Ben');
  assert.equal(mb.partner.name, 'Ana');
  assert.equal(ma.score, 1);
  assert.equal(ma.language, 'python');
  assert.deepEqual(ma.shared, { languages: ['Python'], topics: ['Graphs'] });
  assert.equal(mm.size, 0);
});

test('invalid profiles are rejected and never queued', (t) => {
  const mm = createMatchmaker();
  t.after(mm.close);
  const a = new FakeSocket();
  mm.handle(a);
  a.receive(profile('Ana', { languages: ['COBOL'], topics: [], level: 'advanced' }));
  assert.ok(a.last('error'));
  assert.equal(mm.size, 0);
});

test('names are sanitized before being sent to the partner', (t) => {
  const mm = createMatchmaker();
  t.after(mm.close);
  const a = new FakeSocket();
  const b = new FakeSocket();
  mm.handle(a);
  mm.handle(b);
  a.receive(profile('<img src=x onerror=alert(1)>', PY));
  b.receive(profile('Ben', PY));
  assert.equal(b.last('matched').partner.name, 'img srcx onerroralert1');
});

test('leaving or disconnecting removes you from the pool', (t) => {
  const mm = createMatchmaker();
  t.after(mm.close);
  const a = new FakeSocket();
  const b = new FakeSocket();
  mm.handle(a);
  mm.handle(b);
  a.receive(profile('Ana', PY));
  b.receive(profile('Ben', { languages: ['Java'], topics: ['SQL'], level: 'beginner' }));
  assert.equal(mm.size, 2);
  a.receive({ type: 'leave' });
  assert.equal(mm.size, 1);
  assert.equal(b.last('queue').size, 1);
  b.emit('close');
  assert.equal(mm.size, 0);
});

test('a poor match waits until the threshold relaxes', (t) => {
  let clock = 0;
  const mm = createMatchmaker({ now: () => clock });
  t.after(mm.close);
  const a = new FakeSocket();
  const b = new FakeSocket();
  mm.handle(a);
  mm.handle(b);
  a.receive(profile('Ana', { languages: ['Python'], topics: ['DP'], level: 'advanced' }));
  b.receive(profile('Ben', { languages: ['Java'], topics: ['DP'], level: 'beginner' }));
  assert.equal(a.last('matched'), undefined);
  clock = 30_000;
  mm.tick();
  assert.ok(a.last('matched'));
  assert.ok(a.last('matched').score < 0.75);
});
