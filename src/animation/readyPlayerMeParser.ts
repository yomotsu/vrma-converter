import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';

import type { RetargetedMotion } from './mixamoParser.js';
import { getSourceTrackBoneName, mapReadyPlayerMeBone, trackPathFor } from './rigMapping.ts';
import { detectReadyPlayerMeGender, readyPlayerMeReferenceHipsY, readyPlayerMeRestRotation } from './readyPlayerMeRestPose.ts';
import { makeQuaternionTrack, makeVectorTrack, setTrack } from './trackUtils.ts';
import type { MotionTrackSet } from './types.js';

function normalizeHipsPosition(track: THREE.VectorKeyframeTrack, restPosition: THREE.Vector3): THREE.VectorKeyframeTrack {
  const values: number[] = [];
  for (let index = 0; index + 2 < track.values.length; index += 3) {
    values.push(
      track.values[index]! - restPosition.x,
      track.values[index + 1]!,
      track.values[index + 2]! - restPosition.z,
    );
  }
  return makeVectorTrack('', Array.from(track.times), values);
}

export function retargetReadyPlayerMeClip(
  asset: THREE.Group,
  clip: THREE.AnimationClip,
  targetVrm: VRM | null,
): RetargetedMotion {
  const motionHips = asset.getObjectByName('Hips');
  if (motionHips == null || motionHips.position.y <= 0.0001) {
    throw new Error('Ready Player Me の hips の高さを取得できませんでした');
  }
  asset.updateMatrixWorld(true);
  const gender = detectReadyPlayerMeGender(asset);
  const restWorldRotations = new WeakMap<THREE.Object3D, THREE.Quaternion>();
  const restWorldRotationFor = (node: THREE.Object3D): THREE.Quaternion => {
    const cached = restWorldRotations.get(node);
    if (cached != null) return cached.clone();
    const localRotation = readyPlayerMeRestRotation(node.name, gender);
    const rotation = localRotation == null
      ? node.quaternion.clone()
      : new THREE.Quaternion().fromArray(localRotation);
    if (node.parent != null) rotation.premultiply(restWorldRotationFor(node.parent));
    restWorldRotations.set(node, rotation.clone());
    return rotation;
  };
  const restHipsPosition = motionHips.position.clone();
  const tracks: MotionTrackSet = new Map();

  clip.tracks.forEach((sourceTrack) => {
    const path = trackPathFor(sourceTrack);
    if (path == null) return;
    const sourceNodeName = sourceTrack.name.split('.')[0] ?? sourceTrack.name;
    const sourceBone = mapReadyPlayerMeBone(getSourceTrackBoneName(sourceTrack.name));
    if (sourceBone == null || (targetVrm != null && targetVrm.humanoid.getNormalizedBoneNode(sourceBone as never) == null)) return;

    if (path === 'translation') {
      if (sourceBone === 'hips' && sourceTrack instanceof THREE.VectorKeyframeTrack) {
        setTrack(tracks, sourceBone, 'translation', normalizeHipsPosition(sourceTrack, restHipsPosition));
      }
      return;
    }
    if (!(sourceTrack instanceof THREE.QuaternionKeyframeTrack)) return;
    const sourceNode = asset.getObjectByName(sourceNodeName);
    if (sourceNode?.parent == null) return;

    const restRotationInverse = restWorldRotationFor(sourceNode).invert();
    const parentRestWorldRotation = restWorldRotationFor(sourceNode.parent);
    const values: number[] = [];
    for (let index = 0; index < sourceTrack.values.length; index += 4) {
      const quaternion = new THREE.Quaternion()
        .fromArray(Array.from(sourceTrack.values.slice(index, index + 4)) as [number, number, number, number])
        .premultiply(parentRestWorldRotation)
        .multiply(restRotationInverse)
        .normalize();
      values.push(...quaternion.toArray());
    }
    setTrack(tracks, sourceBone, 'rotation', makeQuaternionTrack('', Array.from(sourceTrack.times), values));
  });

  return { tracks, restHipsY: readyPlayerMeReferenceHipsY(asset, gender) ?? motionHips.position.y };
}
