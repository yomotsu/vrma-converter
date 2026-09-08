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
  const duration = 24;
  const fps = 30;
  const heelLiftObservedStart = 492 / fps;
  const heelLiftObservedEnd = 516 / fps;
  const heelRecoveryObservedEnd = 609 / fps;
  const heelLiftEnd = heelLiftObservedStart
    + (heelLiftObservedEnd - heelLiftObservedStart) * (2 / 3);
  const heelRecoveryEnd = heelLiftObservedEnd
    + (heelRecoveryObservedEnd - heelLiftObservedEnd) / 3;
  const heelReleaseStart = 17.7;
  const heelLoweringEnd = heelReleaseStart + (heelRecoveryEnd - heelReleaseStart) * (2 / 3);
  // Keep only pose changes that matter to the preview. Three.js interpolates
  // the motion between these points, so filling every source frame would add
  // data without improving the clip noticeably.
  const times = [
    0, 0.5, 1, 1.2, 1.5, 2, 2.5, 3, 3.8, 4.5, 5.4, 6, 6.1, 7, 7.4,
    9, 9.3, 9.5, 10.5, 11.4, 11.6, 11.8, 12.7, 12.8, 13, 13.05, 13.2,
    13.25, 13.55, 13.75, 13.8, 15.2, 15.45, 16, heelLiftObservedStart,
    heelLiftEnd, heelLiftObservedEnd, heelReleaseStart, heelLoweringEnd, 18.2, 19.3, 22, duration,
  ];
  const loop = (time: number) => Math.sin((time / duration) * Math.PI * 2);
  // A little variation in each breath avoids a metronomic rise and fall.
  const breath = (time: number) => Math.sin(time * Math.PI / 2 + 0.22 * loop(time));
  const ease = (value: number) => {
    const t = THREE.MathUtils.clamp(value, 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
  };
  // Unevenly spaced gestures have quiet holds and ease to rest at both ends.
  const gesture = (time: number, start: number, peak: number, release: number, end: number) => (
    ease((time - start) / (peak - start)) * (1 - ease((time - release) / (end - release)))
  );
  // The slow sag followed by a quicker recovery reads as an effort to hold T-pose.
  const fatigue = (time: number, delay: number) => gesture(time - delay, 2, 10.5, 11.6, 13);
  const recovery = (time: number, delay: number) => gesture(time - delay, 11.8, 12.8, 13.3, 15.2);
  const recoverySnap = (time: number, delay: number) => gesture(time - delay, 12.7, 13, 13.2, 13.8);
  // Notice the tiring arm, glance diagonally down, then look up before lifting it.
  const glanceDown = (time: number) => gesture(time, 6, 7.4, 9.5, 11.4);
  const glanceRight = (time: number) => gesture(time, 1, 2, 3, 4.5);
  const heelRise = (time: number) => gesture(time, 16, heelLiftEnd, heelReleaseStart, heelLoweringEnd);
  const footGlance = (time: number) => gesture(time, 16.4, 17.2, 18.2, 19.3);
  const headPitch = (time: number) => 0.2 * glanceDown(time) + 0.14 * footGlance(time) + 0.016 * breath(time - 0.3);
  const headYaw = (time: number) => 0.28 * glanceDown(time) - 0.25 * glanceRight(time) + 0.18 * footGlance(time);
  const headTilt = (time: number) => 0.055 * glanceDown(time) - 0.03 * glanceRight(time);
  const kneeBend = (time: number) => 0.16 - 0.055 * breath(time - 0.15) + 0.045 * fatigue(time, 0) + 0.035 * heelRise(time);
  const weightShift = (time: number) => 0.009 * loop(time * 2) - 0.018 * heelRise(time);
  // Approximate equal thigh/shin lengths in the normalized, unit-hips-height rig.
  // Lower the pelvis as both knees soften, and counter its lateral shift with the legs.
  const legReach = (time: number) => 0.9 * Math.cos(kneeBend(time) / 2);
  const legLean = (time: number) => -Math.asin(weightShift(time) / legReach(time));
  const tracks: MotionTrackSet = new Map();
  const rotation = (bone: BoneName, fn: (time: number) => THREE.Euler): void => {
    const values = quaternionValuesFor(times, (time) => new THREE.Quaternion().setFromEuler(fn(time)));
    setTrack(tracks, bone, 'rotation', makeQuaternionTrack('', times, values));
  };
  rotation('hips', () => new THREE.Euler());
  rotation('spine', (time) => new THREE.Euler(-0.025 * breath(time) + 0.025 * fatigue(time, 0), 0, -0.018 * loop(time * 2) + 0.008 * heelRise(time), 'XYZ'));
  rotation('chest', (time) => new THREE.Euler(-0.025 * breath(time - 0.12), 0.045 * glanceDown(time) - 0.025 * glanceRight(time), 0, 'XYZ'));
  rotation('neck', (time) => new THREE.Euler(0.3 * headPitch(time), 0.3 * headYaw(time), 0.3 * headTilt(time), 'YXZ'));
  rotation('head', (time) => new THREE.Euler(0.7 * headPitch(time), 0.7 * headYaw(time), 0.7 * headTilt(time), 'YXZ'));
  for (const side of ['left', 'right'] as const) {
    const sign = side === 'left' ? -1 : 1;
    const delay = side === 'left' ? 0 : 0.25;
    const effort = (time: number) => gesture(time - delay, 1.2, 3.8, 5.4, 7) + 0.65 * recovery(time, delay);
    rotation(`${side}Shoulder`, (time) => new THREE.Euler(0.018 * breath(time - 0.25), 0.02 * breath(time), -sign * (0.022 * breath(time) + 0.02 * recovery(time, delay)), 'XYZ'));
    rotation(`${side}UpperArm`, (time) => {
      const effort = fatigue(time, delay);
      const tremble = 0.003 * effort * loop((time - delay) * 48);
      return new THREE.Euler(0.02 * effort, 0, sign * (0.025 + 0.18 * effort - 0.07 * recovery(time, delay) + tremble), 'XYZ');
    });
    rotation(`${side}LowerArm`, (time) => new THREE.Euler(0, 0, sign * (0.025 + 0.055 * fatigue(time, delay + 0.15) - 0.05 * effort(time)), 'XYZ'));
    rotation(`${side}Hand`, (time) => new THREE.Euler(0, 0, sign * (0.025 + 0.06 * fatigue(time, delay + 0.25) - 0.11 * effort(time) - 0.055 * recoverySnap(time, delay)), 'XYZ'));
    const fingerSegments = [
      ['ThumbMetacarpal', 0.55], ['ThumbProximal', 0.75], ['ThumbDistal', 0.9],
      ['IndexProximal', 0.65], ['IndexIntermediate', 0.85], ['IndexDistal', 1],
      ['MiddleProximal', 0.65], ['MiddleIntermediate', 0.85], ['MiddleDistal', 1],
      ['RingProximal', 0.65], ['RingIntermediate', 0.85], ['RingDistal', 1],
      ['LittleProximal', 0.65], ['LittleIntermediate', 0.85], ['LittleDistal', 1],
    ] as const;
    fingerSegments.forEach(([segment, factor]) => {
      rotation(`${side}${segment}` as BoneName, (time) => new THREE.Euler(
        0, 0, sign * factor * (0.11 * fatigue(time, delay) - 0.12 * effort(time)
          - (segment.endsWith('Distal') ? 0.095 : 0.02) * recoverySnap(time, delay)), 'XYZ',
      ));
    });
    const play = (time: number) => side === 'left' ? heelRise(time) : 0;
    const bend = (time: number) => kneeBend(time) + (side === 'left' ? 0.48 * heelRise(time) : 0);
    rotation(`${side}UpperLeg`, (time) => new THREE.Euler(
      -bend(time) / 2,
      -sign * 0.08 * play(time),
      legLean(time),
      'ZYX',
    ));
    rotation(`${side}LowerLeg`, (time) => new THREE.Euler(bend(time), 0, 0, 'XYZ'));
    rotation(`${side}Foot`, (time) => {
      // Lift the heel while the toes point down toward the floor.
      const neutral = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, legLean(time)))
        .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(bend(time) / 2, 0, 0))).invert();
      neutral.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(
        0.32 * play(time), 0, 0, 'XYZ',
      )));
      // Turn the toe toward the supporting foot so the heel drifts outward.
      neutral.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.2 * play(time), 0, 'XYZ')));
      return new THREE.Euler().setFromQuaternion(neutral);
    });
    rotation(`${side}Toes`, (time) => new THREE.Euler(
      -0.24 * (side === 'left' ? heelRise(time) : 0),
      sign * (0.06 - 0.14 * play(time)),
      0,
      'XYZ'));
  }
  // VRMA hips translations are absolute positions in the normalized rig.
  // Account for bent knees and lateral lean instead of bobbing through the floor.
  const hipsPositionValues = times.flatMap((time) => [
    weightShift(time), 0.1 + legReach(time) * Math.cos(legLean(time)), 0,
  ]);
  setTrack(tracks, 'hips', 'translation', makeVectorTrack('', times, hipsPositionValues));
  const expressionTracks = emptyExpressionTrackSet();
  const blinkTimes = [0];
  const blinkValues = [0];
  for (const time of [2.5, 6.1, 9.3, 13.2, 13.55, 16.4, 20.3, 23.1]) {
    blinkTimes.push(time, time + 0.07, time + 0.19);
    blinkValues.push(0, 1, 0);
  }
  blinkTimes.push(duration);
  blinkValues.push(0);
  expressionTracks.preset.set('blink', new THREE.NumberKeyframeTrack('', blinkTimes, blinkValues));
  // Eyes lead the head slightly; the proxy supports both bone and expression look-at.
  const lookAtTrack = makeQuaternionTrack('', times, quaternionValuesFor(times, (time) => (
    new THREE.Quaternion().setFromEuler(new THREE.Euler(
      0.09 * glanceDown(time + 0.2) + 0.07 * footGlance(time + 0.2),
      0.12 * (glanceDown(time + 0.2) - glanceRight(time + 0.2)) + 0.08 * footGlance(time + 0.2),
      0,
      'YXZ',
    ))
  )));
  return {
    id: 'preview-animation',
    name: 'preview-loop.vrma',
    displayName: 'Preview loop',
    clipName: 'Preview loop',
    clipIndex: 0,
    clipCount: 1,
    format: 'VRMA',
    duration,
    sourceFps: fps,
    restHipsY: 1,
    originalTracks: cloneTrackSet(tracks),
    sourceTracks: tracks,
    tracks: cloneTrackSet(tracks),
    originalExpressionTracks: cloneExpressionTrackSet(expressionTracks),
    sourceExpressionTracks: cloneExpressionTrackSet(expressionTracks),
    expressionTracks: cloneExpressionTrackSet(expressionTracks),
    originalLookAtTrack: lookAtTrack.clone(),
    sourceLookAtTrack: lookAtTrack.clone(),
    lookAtTrack,
    source: 'preview',
    compatible: true,
    bakePreview: null,
    bakeApplied: false,
    originalDuration: duration,
    appliedSpeedMultiplier: 1,
  };
}
