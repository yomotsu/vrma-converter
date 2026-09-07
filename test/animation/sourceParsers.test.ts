import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { retargetUniversalClip } from '../../src/animation/universalParser.ts';
import { isDazFriendlyBvh, retargetDazBvhClip } from '../../src/animation/bvhParser.ts';
import { retargetGenericClip } from '../../src/animation/genericParser.ts';
import { tracksFromVrma } from '../../src/animation/vrmaParser.ts';

test('retargets Universal pelvis translation into VRM hips coordinates', () => {
  const asset = new THREE.Group();
  const root = new THREE.Bone();
  root.name = 'root';
  const pelvis = new THREE.Bone();
  pelvis.name = 'pelvis';
  pelvis.position.set(0, 2, 0);
  root.add(pelvis);
  asset.add(root);
  asset.updateMatrixWorld(true);
  const clip = new THREE.AnimationClip('universal', 1, [
    new THREE.VectorKeyframeTrack('pelvis.position', [0], [0, 2, 0]),
    new THREE.QuaternionKeyframeTrack('pelvis.quaternion', [0], [0, 0, 0, 1]),
  ]);

  const result = retargetUniversalClip(asset, clip, null);
  assert.ok(result.tracks.get('hips')?.translation != null);
  assert.ok(result.restHipsY > 0);
});

test('recognizes a Daz-friendly skeleton and normalizes its root movement', () => {
  const names = ['hip', 'abdomen', 'rshldr', 'lshldr', 'rthigh', 'lthigh'];
  const bones = names.map((name) => { const bone = new THREE.Bone(); bone.name = name; return bone; });
  bones[1]!.position.y = -1;
  bones[0]!.add(bones[1]!);
  const skeleton = new THREE.Skeleton(bones);
  assert.equal(isDazFriendlyBvh(skeleton), true);
  const clip = new THREE.AnimationClip('daz', 1, [
    new THREE.VectorKeyframeTrack('hip.position', [0, 1], [0, 2, 0, 0, 3, 0]),
  ]);
  const result = retargetDazBvhClip(skeleton, clip, null);
  assert.deepEqual(Array.from(result.tracks.get('hips')!.translation!.values), [0, 1, 0, 0, 2, 0]);
});

test('retargetGenericClip keeps rotations and drops non-hips translations', () => {
  const clip = new THREE.AnimationClip('generic', 1, [
    new THREE.QuaternionKeyframeTrack('mixamorigHead.quaternion', [0], [0, 0, 0, 1]),
    new THREE.VectorKeyframeTrack('mixamorigHead.position', [0], [1, 2, 3]),
  ]);
  const tracks = retargetGenericClip(clip);
  assert.ok(tracks.get('head')?.rotation != null);
  assert.equal(tracks.get('head')?.translation, undefined);
});

test('tracksFromVrma clones humanoid, expression, and look-at tracks', () => {
  const rotation = new THREE.QuaternionKeyframeTrack('', [0], [0, 0, 0, 1]);
  const animation = {
    humanoidTracks: { rotation: new Map([['hips', rotation]]), translation: new Map() },
    expressionTracks: { preset: new Map(), custom: new Map() },
    lookAtTrack: null,
  } as unknown as import('@pixiv/three-vrm-animation').VRMAnimation;
  const result = tracksFromVrma(animation);
  assert.ok(result.tracks.get('hips')?.rotation != null);
  assert.notEqual(result.tracks.get('hips')!.rotation, rotation);
});
