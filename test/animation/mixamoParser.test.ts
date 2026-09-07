import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { detectAnimationRig, mapSourceBone } from '../../src/animation/rigMapping.ts';
import { retargetMixamoClip } from '../../src/animation/mixamoParser.ts';

test('maps Mixamo and common aliases to VRM humanoid names', () => {
  assert.equal(mapSourceBone('mixamorigLeftForeArm'), 'leftLowerArm');
  assert.equal(mapSourceBone('mixamorigRightHandIndex2'), 'rightIndexIntermediate');
  assert.equal(mapSourceBone('pelvis'), 'hips');
});

test('detects a Mixamo rig only when its hips marker is present', () => {
  const asset = new THREE.Group();
  const hips = new THREE.Bone();
  hips.name = 'mixamorigHips';
  asset.add(hips);
  assert.equal(detectAnimationRig(asset), 'mixamo');
});

test('retargetMixamoClip removes rest-world rotation and keeps hips translation', () => {
  const asset = new THREE.Group();
  const hips = new THREE.Bone();
  hips.name = 'mixamorigHips';
  hips.position.set(0, 1, 0);
  const leftArm = new THREE.Bone();
  leftArm.name = 'mixamorigLeftArm';
  leftArm.rotation.y = Math.PI / 2;
  hips.add(leftArm);
  asset.add(hips);
  asset.updateMatrixWorld(true);

  const clip = new THREE.AnimationClip('mixamo', 1, [
    new THREE.QuaternionKeyframeTrack('mixamorigLeftArm.quaternion', [0], [0, 0, 0, 1]),
    new THREE.VectorKeyframeTrack('mixamorigHips.position', [0], [0, 1, 0]),
  ]);
  const result = retargetMixamoClip(asset, clip, null);
  const arm = result.tracks.get('leftUpperArm')!.rotation!;
  const armRotation = new THREE.Quaternion().fromArray(Array.from(arm.values) as [number, number, number, number]);

  assert.equal(result.restHipsY, 1);
  assert.ok(Math.abs(armRotation.angleTo(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2))) < 1e-3);
  assert.deepEqual(Array.from(result.tracks.get('hips')!.translation!.values), [0, 1, 0]);
});
