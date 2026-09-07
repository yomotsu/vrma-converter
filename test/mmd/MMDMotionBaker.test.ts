import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { bakeLoadedMmdMotion } from '../../src/mmd/MMDMotionBaker.ts';

test('samples every PMX bone after the helper has applied its resolved pose', () => {
  const root = new THREE.Bone();
  root.name = 'センター';
  const child = new THREE.Bone();
  child.name = '左足';
  root.add(child);
  const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  mesh.add(root);
  mesh.bind(new THREE.Skeleton([root, child]));
  const animation = new THREE.AnimationClip('mmd', 1, []);
  const resolved = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.5);
  const helper = {
    add: () => undefined,
    update: () => { child.quaternion.copy(resolved); },
  };

  const result = bakeLoadedMmdMotion(mesh, animation, helper, { fps: 30 });

  assert.equal(result.bones.length, 2);
  assert.equal(result.times.length, 31);
  assert.deepEqual(result.times.slice(0, 2), [0, 1 / 30]);
  const childTrack = result.bones.find((bone) => bone.name === '左足')!.rotation;
  assert.ok(Math.abs(new THREE.Quaternion().fromArray(
    Array.from(childTrack.values).slice(0, 4) as [number, number, number, number],
  ).dot(resolved)) > 0.999);
  const childResult = result.bones.find((bone) => bone.name === '左足')!;
  assert.equal(childResult.parentIndex, 0);
  assert.ok(Math.abs(new THREE.Quaternion().fromArray(
    Array.from(childResult.worldRotation.values).slice(0, 4) as [number, number, number, number],
  ).dot(resolved)) > 0.999);
  assert.ok(childResult.restWorldRotation.equals(new THREE.Quaternion()));
});

test('extracts VMD morph tracks with their PMX morph names', () => {
  const root = new THREE.Bone();
  root.name = 'センター';
  const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  mesh.add(root);
  mesh.bind(new THREE.Skeleton([root]));
  mesh.morphTargetDictionary = { まばたき: 0 };
  mesh.morphTargetInfluences = [0];
  const animation = new THREE.AnimationClip('mmd', 0.5, [
    new THREE.NumberKeyframeTrack('.morphTargetInfluences[0]', [0, 0.5], [0.25, 0.75]),
  ]);
  const helper = { add: () => undefined, update: () => undefined };

  const result = bakeLoadedMmdMotion(mesh, animation, helper, { fps: 30 });

  assert.ok(Array.isArray(result.expressionTracks));
  if (!Array.isArray(result.expressionTracks)) return;
  assert.equal(result.expressionTracks.length, 1);
  assert.equal(result.expressionTracks[0]!.name, 'まばたき');
  assert.deepEqual(Array.from(result.expressionTracks[0]!.weight.times), [0, 0.5]);
  assert.deepEqual(Array.from(result.expressionTracks[0]!.weight.values), [0.25, 0.75]);
});
