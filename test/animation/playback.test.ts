import test from 'node:test';
import assert from 'node:assert/strict';

import { advancePlaybackTime } from '../../src/animation/playback.ts';

test('wraps playback time at the end when looping is enabled', () => {
  const result = advancePlaybackTime(0.9, 0.3, 1, true);
  assert.ok(Math.abs(result.time - 0.2) < 1e-9);
  assert.equal(result.playing, true);
});

test('stops at the end when looping is disabled', () => {
  assert.deepEqual(advancePlaybackTime(0.9, 0.3, 1, false), { time: 1, playing: false });
});
