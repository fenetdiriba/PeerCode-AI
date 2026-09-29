import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cosineSimilarity,
  encodeProfile,
  matchScore,
  minScoreAfter,
  normalizeSkills,
  pairUp,
  suggestEditorLanguage,
} from './matching.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('encodeProfile lays out languages, topics, then level', () => {
  const v = encodeProfile({ languages: ['Python', 'Rust'], topics: ['Graphs'], level: 'intermediate' });
  assert.equal(v.length, 15);
  assert.deepEqual(v, [1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0.5]);
});

test('cosineSimilarity basics', () => {
  close(cosineSimilarity([1, 0], [1, 0]), 1);
  close(cosineSimilarity([1, 0], [0, 1]), 0);
  close(cosineSimilarity([1, 1], [1, 0]), Math.SQRT1_2);
  close(cosineSimilarity([2, 2], [1, 1]), 1); // direction only, not magnitude
  assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
});

test('identical profiles score 1, disjoint beginners score 0', () => {
  const p = { languages: ['Java'], topics: ['DP', 'Trees'], level: 'advanced' };
  close(matchScore(p, p), 1);
  assert.equal(
    matchScore({ languages: ['Go'], topics: ['SQL'], level: 'beginner' }, { languages: ['Java'], topics: ['OS'], level: 'beginner' }),
    0,
  );
});

test('more overlap means a higher score', () => {
  const me = { languages: ['Python', 'JavaScript'], topics: ['Arrays', 'Graphs'], level: 'intermediate' };
  const close1 = { languages: ['Python', 'JavaScript'], topics: ['Graphs'], level: 'intermediate' };
  const far = { languages: ['Python'], topics: ['SQL'], level: 'advanced' };
  assert.ok(matchScore(me, close1) > matchScore(me, far));
});

test('normalizeSkills drops unknown values and rejects empty profiles', () => {
  assert.deepEqual(normalizeSkills({ languages: ['Python', 'COBOL'], topics: ['DP', 1], level: 'advanced' }), {
    languages: ['Python'],
    topics: ['DP'],
    level: 'advanced',
  });
  assert.equal(normalizeSkills({ languages: [], topics: [], level: 'advanced' }), null);
  assert.equal(normalizeSkills({ languages: ['Python'], level: 'wizard' }), null);
  assert.equal(normalizeSkills(null), null);
});

test('threshold relaxes with wait time and bottoms out at 0', () => {
  assert.equal(minScoreAfter(0), 0.75);
  assert.ok(minScoreAfter(10_000) < minScoreAfter(0));
  assert.equal(minScoreAfter(60_000), 0);
});

const entry = (id, skills, joinedAt = 0, userId = id) => ({ id, userId, joinedAt, skills });

test('pairUp pairs the most similar people first', () => {
  const py = { languages: ['Python'], topics: ['Graphs', 'DP'], level: 'intermediate' };
  const js = { languages: ['JavaScript'], topics: ['Arrays'], level: 'beginner' };
  const pool = [entry('a', py), entry('b', js), entry('c', py), entry('d', js)];
  const pairs = pairUp(pool, 0);
  const ids = pairs.map((p) => [p.a.id, p.b.id].sort().join('')).sort();
  assert.deepEqual(ids, ['ac', 'bd']);
});

test('pairUp waits for a good match, then relaxes', () => {
  const a = entry('a', { languages: ['Python'], topics: ['DP'], level: 'advanced' });
  const b = entry('b', { languages: ['Java'], topics: ['DP'], level: 'beginner' });
  assert.equal(pairUp([a, b], 0).length, 0);
  assert.equal(pairUp([a, b], 30_000).length, 1);
});

test('pairUp never pairs someone with themselves in another tab', () => {
  const s = { languages: ['Python'], topics: ['DP'], level: 'advanced' };
  assert.equal(pairUp([entry('t1', s, 0, 'same-user'), entry('t2', s, 0, 'same-user')], 60_000).length, 0);
});

test('suggestEditorLanguage prefers a shared, editor-supported language', () => {
  const a = { languages: ['Go', 'Java', 'Python'], topics: [], level: 'beginner' };
  const b = { languages: ['Rust', 'Python', 'Go'], topics: [], level: 'beginner' };
  assert.equal(suggestEditorLanguage(a, b), 'python'); // Go is shared but the editor can't open it
  assert.equal(suggestEditorLanguage({ languages: ['Rust'], topics: [], level: 'beginner' }, { languages: ['Go'], topics: [], level: 'beginner' }), 'javascript');
});
