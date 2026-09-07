import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';

import { makeQuaternionTrack, makeVectorTrack, setTrack } from './trackUtils.ts';
import { mapMixamoBone } from './rigMapping.ts';
import type { MotionTrackSet } from './types.js';

export type RetargetedMotion = { tracks: MotionTrackSet; restHipsY: number };

export function retargetMixamoClip(
  asset: THREE.Group,
  clip: THREE.AnimationClip,
  targetVrm: VRM | null,
): RetargetedMotion {
  const motionHips = asset.getObjectByName('mixamorigHips');
  if (motionHips == null || motionHips.position.y <= 0.0001) {
    throw new Error('Mixamo FBX の hips の高さを取得できませんでした');
  }
  asset.updateMatrixWorld(true);
  const motionHipsHeight = motionHips.position.y;
  const tracks: MotionTrackSet = new Map();
  clip.tracks.forEach((sourceTrack) => {
    const [mixamoRigName, propertyName] = sourceTrack.name.split('.');
    if (mixamoRigName == null || propertyName == null) return;
    const sourceBone = mapMixamoBone(mixamoRigName);
    if (sourceBone == null || (targetVrm != null && targetVrm.humanoid.getNormalizedBoneNode(sourceBone as never) == null)) return;
    const mixamoRigNode = asset.getObjectByName(mixamoRigName);
    if (mixamoRigNode?.parent == null) return;

    const restRotationInverse = mixamoRigNode.getWorldQuaternion(new THREE.Quaternion()).invert();
    const parentRestWorldRotation = mixamoRigNode.parent.getWorldQuaternion(new THREE.Quaternion());
    if (sourceTrack instanceof THREE.QuaternionKeyframeTrack) {
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
    } else if (sourceTrack instanceof THREE.VectorKeyframeTrack && sourceBone === 'hips') {
      setTrack(tracks, sourceBone, 'translation', makeVectorTrack('', Array.from(sourceTrack.times), Array.from(sourceTrack.values)));
    }
  });
  return { tracks, restHipsY: motionHipsHeight };
}
