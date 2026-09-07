import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { mapMmdBoneName, retargetMmdMotion } from '../../src/mmd/MMDHumanoidRetargeter.ts';
import type { MMDMotionBakeResult, MMDMotionBoneTrack } from '../../src/mmd/MMDMotionTypes.ts';

const qTrack = (name: string, quaternion: THREE.Quaternion): THREE.QuaternionKeyframeTrack => (
  new THREE.QuaternionKeyframeTrack(name, [0], quaternion.toArray())
);

const pTrack = (name: string, position: THREE.Vector3): THREE.VectorKeyframeTrack => (
  new THREE.VectorKeyframeTrack(name, [0], position.toArray())
);

const bone = (
  index: number,
  name: string,
  quaternion: THREE.Quaternion,
  worldPosition: THREE.Vector3,
): MMDMotionBoneTrack => ({
  index,
  name,
  rotation: qTrack(name, quaternion),
  position: pTrack(name, new THREE.Vector3()),
  worldPosition: pTrack(name, worldPosition),
  restWorldPosition: worldPosition.clone(),
});

test('maps standard Japanese and English MMD names to VRM humanoid names', () => {
  assert.equal(mapMmdBoneName('左ひじ'), 'leftLowerArm');
  assert.equal(mapMmdBoneName('右手首'), 'rightHand');
  assert.equal(mapMmdBoneName('left_index_2'), 'leftIndexIntermediate');
  assert.equal(mapMmdBoneName('左足首'), 'leftFoot');
});

test('composes center, groove, and lower-body rotations into hips', () => {
  const center = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.2);
  const groove = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.3);
  const lower = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.4);
  const result: MMDMotionBakeResult = {
    duration: 0,
    fps: 30,
    times: [0],
    bones: [
      bone(0, 'センター', center, new THREE.Vector3(0, 8, 0)),
      bone(1, 'グルーブ', groove, new THREE.Vector3(0, 8, 0)),
      bone(2, '下半身', lower, new THREE.Vector3(0, 8, 0)),
    ],
  };
  const motion = retargetMmdMotion(result, new Set(['hips']));
  const actual = new THREE.Quaternion().fromArray(
    Array.from(motion.rotationTracks.get('hips')!.values) as [number, number, number, number],
  );
  const expected = center.clone().multiply(groove).multiply(lower).normalize();
  assert.ok(1 - Math.abs(actual.dot(expected)) < 1e-6);
});

test('extracts center movement as normalized hips translation', () => {
  const result: MMDMotionBakeResult = {
    duration: 1,
    fps: 30,
    times: [0, 1],
    bones: [{
      ...bone(0, 'センター', new THREE.Quaternion(), new THREE.Vector3(0, 8, 0)),
      worldPosition: new THREE.VectorKeyframeTrack('センター', [0, 1], [0, 8, 0, 1, 9, -2]),
    }],
  };
  const motion = retargetMmdMotion(result, new Set(['hips']));
  assert.deepEqual(Array.from(motion.translationTrack!.values), [0, 8, 0, 1, 9, -2]);
  assert.equal(motion.restHipsY, 8);
});

test('does not output humanoid tracks absent from the target VRM', () => {
  const result: MMDMotionBakeResult = {
    duration: 0,
    fps: 30,
    times: [0],
    bones: [bone(0, '頭', new THREE.Quaternion(), new THREE.Vector3())],
  };
  const motion = retargetMmdMotion(result, new Set(['hips']));
  assert.equal(motion.rotationTracks.has('head'), false);
});

test('returns a VRMA-ready rotation track for a mapped VMD bone', () => {
  const result: MMDMotionBakeResult = {
    duration: 0,
    fps: 30,
    times: [0],
    bones: [bone(0, '左腕', new THREE.Quaternion(), new THREE.Vector3())],
  };
  const motion = retargetMmdMotion(result, new Set(['leftUpperArm']));
  assert.equal(motion.rotationTracks.get('leftUpperArm')?.getValueSize(), 4);
  assert.deepEqual(Array.from(motion.rotationTracks.get('leftUpperArm')!.times), [0]);
});
