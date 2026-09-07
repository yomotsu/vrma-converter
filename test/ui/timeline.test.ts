import test from 'node:test';
import assert from 'node:assert/strict';

import { formatBoneName, getTimeAtPointer, mergeKeyTimes } from '../../src/ui/timeline.ts';

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
