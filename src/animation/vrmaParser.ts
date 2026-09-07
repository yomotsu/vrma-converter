import * as THREE from 'three';
import type { VRMAnimation } from '@pixiv/three-vrm-animation';

import { HUMAN_BONES } from './rigMapping.ts';
import { cloneExpressionTrackSet, setTrack } from './trackUtils.ts';
import type { BoneName, ExpressionTrackSet, MotionTrackSet } from './types.js';

export function tracksFromVrma(animation: VRMAnimation): {
  tracks: MotionTrackSet;
  expressionTracks: ExpressionTrackSet;
  lookAtTrack: THREE.QuaternionKeyframeTrack | null;
} {
  const tracks: MotionTrackSet = new Map();
  animation.humanoidTracks.rotation.forEach((track, boneName) => {
    const bone = boneName as BoneName;
    if (HUMAN_BONES.includes(bone)) setTrack(tracks, bone, 'rotation', track.clone());
  });
  animation.humanoidTracks.translation.forEach((track, boneName) => {
    const bone = boneName as BoneName;
    if (HUMAN_BONES.includes(bone)) setTrack(tracks, bone, 'translation', track.clone());
  });
  return {
    tracks,
    expressionTracks: cloneExpressionTrackSet(animation.expressionTracks),
    lookAtTrack: animation.lookAtTrack?.clone() ?? null,
  };
}
