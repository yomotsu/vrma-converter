import * as THREE from 'three';

import type { AnimationState, BoneName, MotionTrackSet } from './types.js';
import {
  cloneExpressionTrackSet,
  cloneTrackSet,
  emptyExpressionTrackSet,
  makeQuaternionTrack,
  makeVectorTrack,
  setTrack,
} from './trackUtils.ts';

function quaternionValuesFor(
  times: number[],
  fn: (time: number, index: number) => THREE.Quaternion,
): number[] {
  return times.flatMap((time, index) => fn(time, index).toArray());
}

export function createPreviewAnimation(): AnimationState {
  const duration = 2.4;
  const times = [0, 0.6, 1.2, 1.8, 2.4];
  const loop = (time: number) => Math.sin((time / duration) * Math.PI * 2);
  const tracks: MotionTrackSet = new Map();
  const rotation = (bone: BoneName, fn: (time: number) => THREE.Euler): void => {
    const values = quaternionValuesFor(times, (time) => new THREE.Quaternion().setFromEuler(fn(time)));
    setTrack(tracks, bone, 'rotation', makeQuaternionTrack('', times, values));
  };
  rotation('hips', (time) => new THREE.Euler(0.025 * loop(time), 0.04 * loop(time + 0.3), 0.02 * loop(time), 'XYZ'));
  rotation('spine', (time) => new THREE.Euler(0.035 * loop(time + 0.3), 0, 0, 'XYZ'));
  rotation('chest', (time) => new THREE.Euler(0.04 * loop(time + 0.3), 0.025 * loop(time), 0, 'XYZ'));
  rotation('head', (time) => new THREE.Euler(0.02 * loop(time), 0.05 * loop(time + 0.8), 0, 'XYZ'));
  rotation('leftUpperArm', (time) => new THREE.Euler(0, 0, -0.08 + 0.07 * loop(time + 0.4), 'XYZ'));
  rotation('rightUpperArm', (time) => new THREE.Euler(0, 0, 0.08 - 0.07 * loop(time + 0.4), 'XYZ'));
  rotation('leftLowerArm', (time) => new THREE.Euler(0, 0, -0.06 + 0.04 * loop(time + 0.8), 'XYZ'));
  rotation('rightLowerArm', (time) => new THREE.Euler(0, 0, 0.06 - 0.04 * loop(time + 0.8), 'XYZ'));
  rotation('leftUpperLeg', (time) => new THREE.Euler(0.025 * loop(time), 0, 0.015 * loop(time), 'XYZ'));
  rotation('rightUpperLeg', (time) => new THREE.Euler(-0.025 * loop(time), 0, -0.015 * loop(time), 'XYZ'));
  // VRMA hips translations are absolute positions in the normalized rig.
  // Keep the preview hips at the normalized rest height; using zero here
  // places the hips at the floor and buries the model's legs in the stage.
  const hipsPositionValues = times.flatMap((time) => [0, 1 + 0.012 * loop(time), 0]);
  setTrack(tracks, 'hips', 'translation', makeVectorTrack('', times, hipsPositionValues));
  const expressionTracks = emptyExpressionTrackSet();
  expressionTracks.preset.set(
    'blink',
    new THREE.NumberKeyframeTrack('', [0, 1.08, 1.13, 1.2, duration], [0, 0, 1, 0, 0]),
  );
  return {
    id: 'preview-animation',
    name: 'preview-loop.vrma',
    displayName: 'Preview loop',
    clipName: 'Preview loop',
    clipIndex: 0,
    clipCount: 1,
    format: 'VRMA',
    duration,
    sourceFps: 30,
    restHipsY: 1,
    originalTracks: cloneTrackSet(tracks),
    sourceTracks: tracks,
    tracks: cloneTrackSet(tracks),
    originalExpressionTracks: cloneExpressionTrackSet(expressionTracks),
    sourceExpressionTracks: cloneExpressionTrackSet(expressionTracks),
    expressionTracks: cloneExpressionTrackSet(expressionTracks),
    originalLookAtTrack: null,
    sourceLookAtTrack: null,
    lookAtTrack: null,
    source: 'preview',
    compatible: true,
    bakePreview: null,
    bakeApplied: false,
    originalDuration: duration,
    appliedSpeedMultiplier: 1,
  };
}
