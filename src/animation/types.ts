import type * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { VRMAnimation } from '@pixiv/three-vrm-animation';

export type BoneName =
  | 'hips' | 'spine' | 'chest' | 'upperChest' | 'neck' | 'head' | 'jaw' | 'leftEye' | 'rightEye'
  | 'leftShoulder' | 'leftUpperArm' | 'leftLowerArm' | 'leftHand' | 'rightShoulder' | 'rightUpperArm'
  | 'rightLowerArm' | 'rightHand' | 'leftUpperLeg' | 'leftLowerLeg' | 'leftFoot' | 'leftToes'
  | 'rightUpperLeg' | 'rightLowerLeg' | 'rightFoot' | 'rightToes' | 'leftThumbMetacarpal'
  | 'leftThumbProximal' | 'leftThumbDistal' | 'leftIndexProximal' | 'leftIndexIntermediate'
  | 'leftIndexDistal' | 'leftMiddleProximal' | 'leftMiddleIntermediate' | 'leftMiddleDistal'
  | 'leftRingProximal' | 'leftRingIntermediate' | 'leftRingDistal' | 'leftLittleProximal'
  | 'leftLittleIntermediate' | 'leftLittleDistal' | 'rightThumbMetacarpal' | 'rightThumbProximal'
  | 'rightThumbDistal' | 'rightIndexProximal' | 'rightIndexIntermediate' | 'rightIndexDistal'
  | 'rightMiddleProximal' | 'rightMiddleIntermediate' | 'rightMiddleDistal' | 'rightRingProximal'
  | 'rightRingIntermediate' | 'rightRingDistal' | 'rightLittleProximal' | 'rightLittleIntermediate'
  | 'rightLittleDistal';

export type TrackPath = 'rotation' | 'translation';
export type MotionTrackSet = Map<BoneName, Partial<Record<TrackPath, THREE.KeyframeTrack>>>;
export type ExpressionTrackSet = VRMAnimation['expressionTracks'];
export type BakeSettings = { fps: number; frameStep: number };

export type LoadedClip = {
  tracks: MotionTrackSet;
  expressionTracks: ExpressionTrackSet;
  lookAtTrack: THREE.QuaternionKeyframeTrack | null;
  duration: number;
  sourceFps: number;
  restHipsY: number;
  clipName: string;
  compatible: boolean;
};

export type AnimationState = {
  id: string;
  name: string;
  displayName: string;
  clipName: string;
  clipIndex: number;
  clipCount: number;
  format: string;
  derivedFrom?: 'VMD';
  duration: number;
  sourceFps: number;
  restHipsY: number;
  originalTracks: MotionTrackSet;
  sourceTracks: MotionTrackSet;
  tracks: MotionTrackSet;
  originalExpressionTracks: ExpressionTrackSet;
  sourceExpressionTracks: ExpressionTrackSet;
  expressionTracks: ExpressionTrackSet;
  originalLookAtTrack: THREE.QuaternionKeyframeTrack | null;
  sourceLookAtTrack: THREE.QuaternionKeyframeTrack | null;
  lookAtTrack: THREE.QuaternionKeyframeTrack | null;
  source: 'preview' | 'file';
  compatible: boolean;
  bakePreview: BakeSettings | null;
  bakeApplied: boolean;
  originalDuration: number;
  appliedSpeedMultiplier: number;
};
