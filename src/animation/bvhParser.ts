import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';

import type { RetargetedMotion } from './mixamoParser.js';
import { getSourceTrackBoneName, mapSourceBone, trackPathFor } from './rigMapping.ts';
import { makeContinuousQuaternionTrack, makeVectorTrack, setTrack } from './trackUtils.ts';
import type { MotionTrackSet } from './types.js';

export function isDazFriendlyBvh(skeleton: THREE.Skeleton): boolean {
  const names = new Set(skeleton.bones.map((bone) => bone.name.toLowerCase()));
  return names.has('hip')
    && names.has('abdomen')
    && names.has('rshldr')
    && names.has('lshldr')
    && names.has('rthigh')
    && names.has('lthigh');
}

export function estimateBvhRestHipsHeight(skeleton: THREE.Skeleton): number {
  const root = skeleton.bones[0];
  if (root == null) return 1;
  root.updateMatrixWorld(true);
  const rootY = root.getWorldPosition(new THREE.Vector3()).y;
  let lowestY = rootY;
  skeleton.bones.forEach((bone) => {
    lowestY = Math.min(lowestY, bone.getWorldPosition(new THREE.Vector3()).y);
  });
  return Math.max(0.0001, Math.abs(rootY - lowestY));
}

function normalizeDazBvhRootTranslation(track: THREE.KeyframeTrack, restHipsY: number): THREE.VectorKeyframeTrack {
  const times = Array.from(track.times);
  const values = Array.from(track.values);
  const first = values.slice(0, 3);
  const normalized: number[] = [];
  for (let index = 0; index + 2 < values.length; index += 3) {
    normalized.push(
      values[index] - (first[0] ?? 0),
      restHipsY + values[index + 1] - (first[1] ?? 0),
      values[index + 2] - (first[2] ?? 0),
    );
  }
  return makeVectorTrack('', times, normalized);
}

export function retargetDazBvhClip(
  skeleton: THREE.Skeleton,
  clip: THREE.AnimationClip,
  vrm: VRM | null,
): RetargetedMotion {
  const tracks: MotionTrackSet = new Map();
  const root = skeleton.bones[0];
  const restHipsY = estimateBvhRestHipsHeight(skeleton);
  const rootPositionTrack = root == null
    ? null
    : clip.tracks.find((track) => track.name === `${root.name}.position`) ?? null;

  clip.tracks.forEach((sourceTrack) => {
    const path = trackPathFor(sourceTrack);
    if (path == null) return;
    const sourceBone = mapSourceBone(getSourceTrackBoneName(sourceTrack.name));
    if (sourceBone == null || (vrm != null && vrm.humanoid.getNormalizedBoneNode(sourceBone as never) == null)) return;

    if (path === 'translation') {
      if (sourceBone === 'hips' && sourceTrack === rootPositionTrack) {
        setTrack(tracks, sourceBone, 'translation', normalizeDazBvhRootTranslation(sourceTrack, restHipsY));
      }
      return;
    }
    if (!(sourceTrack instanceof THREE.QuaternionKeyframeTrack)) return;
    // BVHLoader already evaluates the channel order from the Daz export. The
    // resulting rotations are local T-pose-relative rotations, so remove no
    // first-frame rotation here. Only fix quaternion sign changes, which are
    // mathematically equivalent but would otherwise create interpolation flips.
    setTrack(
      tracks,
      sourceBone,
      'rotation',
      makeContinuousQuaternionTrack('', Array.from(sourceTrack.times), Array.from(sourceTrack.values)),
    );
  });
  return { tracks, restHipsY };
}
