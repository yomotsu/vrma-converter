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
): MMDMotionBoneTrack => {
  const normalized = quaternion.clone().normalize();
  return {
    index,
    name,
    parentIndex: -1,
    rotation: qTrack(name, quaternion),
    worldRotation: qTrack(`${name}.world`, normalized),
    position: pTrack(name, new THREE.Vector3()),
    worldPosition: pTrack(name, worldPosition),
    restWorldRotation: new THREE.Quaternion(),
    restWorldPosition: worldPosition.clone(),
  };
};

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
    expressionTracks: [],
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
    expressionTracks: [],
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
    expressionTracks: [],
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
    expressionTracks: [],
  };
  const motion = retargetMmdMotion(result, new Set(['leftUpperArm']));
  assert.equal(motion.rotationTracks.get('leftUpperArm')?.getValueSize(), 4);
  assert.deepEqual(Array.from(motion.rotationTracks.get('leftUpperArm')!.times), [0]);
});

test('converts an MMD sibling upper-body rotation into VRM spine-local rotation', () => {
  const hipsWorld = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1.4);
  const upperBodyWorld = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1.7);
  const withWorldPose = (
    source: MMDMotionBoneTrack,
    parentIndex: number,
    worldRotation: THREE.Quaternion,
  ): MMDMotionBoneTrack => ({
    ...source,
    parentIndex,
    worldRotation: qTrack(`${source.name}.world`, worldRotation),
  });
  const result: MMDMotionBakeResult = {
    duration: 0,
    fps: 30,
    times: [0],
    bones: [
      withWorldPose(bone(0, 'センター', new THREE.Quaternion(), new THREE.Vector3(0, 8, 0)), -1, new THREE.Quaternion()),
      withWorldPose(bone(1, '下半身', hipsWorld, new THREE.Vector3(0, 8, 0)), 0, hipsWorld),
      withWorldPose(bone(2, '上半身', upperBodyWorld, new THREE.Vector3(0, 8, 0)), 0, upperBodyWorld),
    ],
    expressionTracks: [],
  };

  const motion = retargetMmdMotion(result, new Set(['hips', 'spine']));
  const actual = new THREE.Quaternion().fromArray(
    Array.from(motion.rotationTracks.get('spine')!.values) as [number, number, number, number],
  );
  const expected = hipsWorld.clone().invert().multiply(upperBodyWorld).normalize();
  assert.ok(1 - Math.abs(actual.dot(expected)) < 1e-6);
});

test('retargets MMD facial morphs to available VRM expression presets', () => {
  const result: MMDMotionBakeResult = {
    duration: 1,
    fps: 30,
    times: [0],
    bones: [bone(0, 'センター', new THREE.Quaternion(), new THREE.Vector3())],
    expressionTracks: [
      {
        index: 0,
        name: 'まばたき',
        weight: new THREE.NumberKeyframeTrack('まばたき.weight', [0, 1], [0, 1]),
      },
      {
        index: 1,
        name: '未対応モーフ',
        weight: new THREE.NumberKeyframeTrack('未対応モーフ.weight', [0, 1], [0, 1]),
      },
    ],
  };

  const motion = retargetMmdMotion(
    result,
    undefined,
    { preset: new Set(['blink']), custom: new Set() },
  );
  assert.deepEqual(Array.from(motion.expressionTracks?.preset.keys() ?? []), ['blink']);
  assert.deepEqual(Array.from(motion.expressionTracks?.preset.get('blink')?.values ?? []), [0, 1]);
  assert.equal(motion.expressionTracks?.custom.size, 0);
});
