import test from 'node:test';
import assert from 'node:assert/strict';

import { continuousQuaternionValues, createMmdFrameTimes } from '../../src/mmd/MMDMotionMath.ts';

test('creates every 30fps frame and preserves the exact final time', () => {
  const times = createMmdFrameTimes(1, 30);
  assert.equal(times.length, 31);
  assert.equal(times[0], 0);
  assert.equal(times[1], 1 / 30);
  assert.equal(times.at(-1), 1);
});

test('flips quaternion signs so adjacent samples stay on one hemisphere', () => {
  const values = continuousQuaternionValues([
    0, 0, 0, 1,
    0, 0, 0, -1,
    0, 1, 0, 0,
  ]);
  assert.deepEqual(values.slice(0, 8), [0, 0, 0, 1, 0, 0, 0, 1]);
  assert.ok(values[8] === 0 && values[9] === 1 && values[10] === 0 && values[11] === 0);
});

test('returns one sample for a zero-duration motion', () => {
  assert.deepEqual(createMmdFrameTimes(0, 30), [0]);
});
