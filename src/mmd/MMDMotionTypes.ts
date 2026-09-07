import type * as THREE from 'three';

export type MMDMotionBoneTrack = {
  index: number;
  name: string;
  parentIndex: number;
  rotation: THREE.QuaternionKeyframeTrack;
  worldRotation: THREE.QuaternionKeyframeTrack;
  position: THREE.VectorKeyframeTrack;
  worldPosition: THREE.VectorKeyframeTrack;
  restWorldRotation: THREE.Quaternion;
  restWorldPosition: THREE.Vector3;
};

export type MMDMotionExpressionTrack = {
  index: number;
  name: string;
  weight: THREE.NumberKeyframeTrack;
};

export type MMDMotionBakeResult = {
  duration: number;
  fps: number;
  times: number[];
  bones: MMDMotionBoneTrack[];
  expressionTracks: MMDMotionExpressionTrack[];
};
