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

test('fixedBakeTimes samples every frame step at the selected bake FPS', () => {
  assert.deepEqual(fixedBakeTimes(0.2, 30, 2, [0.15]), [0, 0.066667, 0.133333, 0.15, 0.2]);
});

test('fixedBakeTimes limits the frame step to the selected bake FPS', () => {
  assert.deepEqual(fixedBakeTimes(2, 30, 60), [0, 1, 2]);
  assert.deepEqual(fixedBakeTimes(2, 240, 240), [0, 1, 2]);
});

test('sampleTrack preserves quaternion continuity and source interpolation', () => {
  const source = new THREE.QuaternionKeyframeTrack(
    'hips.quaternion',
    [0, 1],
    [0, 0, 0, 1, 0, 0, 0, -1],
  );
  source.setInterpolation(THREE.InterpolateDiscrete);
  const sampled = sampleTrack(source, 1, { fps: 30, frameStep: 30 }, 'rotation');

  assert.equal(sampled.getInterpolation(), THREE.InterpolateDiscrete);
  assert.equal(sampled.times.length, 2);
  assert.deepEqual(Array.from(sampled.values), [
    0, 0, 0, 1,
    0, 0, 0, 1,
  ]);
});

test('scaleTrackSetTimes clones tracks and divides key times by the multiplier', () => {
  const source = new Map();
  setTrack(source, 'hips', 'translation', new THREE.VectorKeyframeTrack('', [0, 2], [0, 1, 0, 0, 1, 0]));
  const scaled = scaleTrackSetTimes(source, 2);

  assert.deepEqual(Array.from(scaled.get('hips')!.translation!.times), [0, 1]);
  assert.notEqual(scaled.get('hips')!.translation, source.get('hips')!.translation);
  assert.deepEqual(Array.from(cloneTrackSet(source).get('hips')!.translation!.times), [0, 2]);
});
