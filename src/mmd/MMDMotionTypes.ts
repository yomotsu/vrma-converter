import type * as THREE from 'three';

export type MMDMotionBoneTrack = {
  index: number;
  name: string;
  rotation: THREE.QuaternionKeyframeTrack;
  position: THREE.VectorKeyframeTrack;
  worldPosition: THREE.VectorKeyframeTrack;
  restWorldPosition: THREE.Vector3;
};

export type MMDMotionBakeResult = {
  duration: number;
  fps: number;
  times: number[];
  bones: MMDMotionBoneTrack[];
};
