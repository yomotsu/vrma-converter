import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  cloneTrackSet,
  fixedBakeTimes,
  sampleTrack,
  scaleTrackSetTimes,
  setTrack,
} from '../../src/animation/trackUtils.ts';

test('fixedBakeTimes keeps the duration and the original final key', () => {
  assert.deepEqual(fixedBakeTimes(1, 30, 2, [0.73]), [0, 0.5, 0.73, 1]);
});

test('sampleTrack preserves quaternion continuity and source interpolation', () => {
  const source = new THREE.QuaternionKeyframeTrack(
    'hips.quaternion',
    [0, 1],
    [0, 0, 0, 1, 0, 0, 0, -1],
  );
  source.setInterpolation(THREE.InterpolateDiscrete);
  const sampled = sampleTrack(source, 1, { fps: 30, frameStep: 1 }, 'rotation');

  assert.equal(sampled.getInterpolation(), THREE.InterpolateDiscrete);
  assert.equal(sampled.times.length, 3);
  assert.deepEqual(Array.from(sampled.values).slice(0, 8), [0, 0, 0, 1, 0, 0, 0, 1]);
});

test('scaleTrackSetTimes clones tracks and divides key times by the multiplier', () => {
  const source = new Map();
  setTrack(source, 'hips', 'translation', new THREE.VectorKeyframeTrack('', [0, 2], [0, 1, 0, 0, 1, 0]));
  const scaled = scaleTrackSetTimes(source, 2);

  assert.deepEqual(Array.from(scaled.get('hips')!.translation!.times), [0, 1]);
  assert.notEqual(scaled.get('hips')!.translation, source.get('hips')!.translation);
  assert.deepEqual(Array.from(cloneTrackSet(source).get('hips')!.translation!.times), [0, 2]);
});
