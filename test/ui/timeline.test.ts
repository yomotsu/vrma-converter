import test from 'node:test';
import assert from 'node:assert/strict';

import { formatBoneName, getTimeAtPointer, isKeyframeTime, mergeKeyTimes } from '../../src/ui/timeline.ts';

test('merges and sorts duplicate key times', () => {
  assert.deepEqual(mergeKeyTimes([0, 0.5], [0.5, 1], [0.25]), [0, 0.25, 0.5, 1]);
});

test('formats a humanoid bone name for the timeline label', () => {
  assert.equal(formatBoneName('leftUpperArm'), 'LEFT UPPER ARM');
});

test('converts a pointer position into a clamped timeline time', () => {
  assert.equal(getTimeAtPointer(150, { left: 100, width: 400 }, 2), 0.25);
  assert.equal(getTimeAtPointer(600, { left: 100, width: 400 }, 2), 2);
});

test('recognizes a display time that lands on a keyframe timing', () => {
  assert.equal(isKeyframeTime(1 / 3, [0, 0.333333, 1]), true);
  assert.equal(isKeyframeTime(0.35, [0, 0.333333, 1]), false);
});
