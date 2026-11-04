import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRateLimiter } from './http.js';

test('rate limiter enforces the window and forgets idle keys', () => {
  let t = 0;
  const limited = createRateLimiter({ max: 2, windowMs: 1000, now: () => t });
  assert.equal(limited('a'), false);
  assert.equal(limited('a'), false);
  assert.equal(limited('a'), true); // third hit inside the window
  for (let i = 0; i < 50; i++) limited(`ip-${i}`);
  assert.equal(limited.size(), 51);
  t = 1500; // every key's hits are now outside the window
  assert.equal(limited('b'), false);
  assert.equal(limited.size(), 1); // idle keys pruned
  assert.equal(limited('a'), false); // 'a' starts fresh
});
