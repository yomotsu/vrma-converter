import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { createPreviewAnimation } from '../../src/animation/previewAnimation.ts';

test('creates the startup preview clip with hips and blink animation', () => {
  const animation = createPreviewAnimation();

  assert.equal(animation.duration, 24);
  assert.equal(animation.source, 'preview');
  assert.equal(animation.tracks.has('hips'), true);
  assert.equal(animation.expressionTracks.preset.has('blink'), true);
  assert.ok(animation.lookAtTrack);
});

test('uses a toe planted heel raise instead of circling the ankle', () => {
  const { tracks } = createPreviewAnimation();
  const hips = tracks.get('hips')!.translation!;
  let maxLeftLift = 0;
  for (let frame = 0; frame < hips.times.length; frame += 1) {
    for (const side of ['left', 'right'] as const) {
      const upper = new THREE.Quaternion().fromArray(tracks.get(`${side}UpperLeg`)!.rotation!.values, frame * 4);
      const lower = new THREE.Quaternion().fromArray(tracks.get(`${side}LowerLeg`)!.rotation!.values, frame * 4);
      const ankle = new THREE.Vector3().fromArray(hips.values, frame * 3)
        .add(new THREE.Vector3(0, -0.45, 0).applyQuaternion(upper))
        .add(new THREE.Vector3(0, -0.45, 0).applyQuaternion(upper.clone().multiply(lower)));
      if (side === 'right' || hips.times[frame] <= 16 || hips.times[frame] >= 22) {
        assert.ok(ankle.distanceTo(new THREE.Vector3(0, 0.1, 0)) < 1e-6);
      } else {
        maxLeftLift = Math.max(maxLeftLift, ankle.y - 0.1);
        assert.ok(ankle.y >= 0.1 - 1e-6);
      }
    }
  }
  assert.ok(maxLeftLift > 0.03);
  assert.ok(Math.max(...hips.values.filter((_, index) => index % 3 === 1))
    - Math.min(...hips.values.filter((_, index) => index % 3 === 1)) > 0.003);
  const leftKnee = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().fromArray(
    tracks.get('leftLowerLeg')!.rotation!.values, 18 * 30 * 4,
  )).x;
  const leftFoot = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().fromArray(
    tracks.get('leftFoot')!.rotation!.values, 18 * 30 * 4,
  )).x;
  const restingFoot = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().fromArray(
    tracks.get('leftFoot')!.rotation!.values, 1 * 30 * 4,
  )).x;
  const leftToes = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().fromArray(
    tracks.get('leftToes')!.rotation!.values, 18 * 30 * 4,
  )).x;
  assert.ok(leftKnee > 0.2);
  assert.ok(leftFoot - restingFoot > 0.04);
  assert.ok(leftToes < -0.1);
  const restingYaw = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().fromArray(
    tracks.get('leftFoot')!.rotation!.values, 1 * 30 * 4,
  )).y;
  const raisedYaw = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().fromArray(
    tracks.get('leftFoot')!.rotation!.values, 17.5 * 30 * 4,
  )).y;
  assert.ok(raisedYaw > restingYaw + 0.15);
  const leftToeRestYaw = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().fromArray(
    tracks.get('leftToes')!.rotation!.values, 1 * 30 * 4,
  )).y;
  const leftToeRaisedYaw = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().fromArray(
    tracks.get('leftToes')!.rotation!.values, 17.5 * 30 * 4,
  )).y;
  const rightToeRestYaw = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().fromArray(
    tracks.get('rightToes')!.rotation!.values, 1 * 30 * 4,
  )).y;
  assert.ok(leftToeRestYaw < -0.03);
  assert.ok(rightToeRestYaw > 0.03);
  assert.ok(leftToeRaisedYaw < leftToeRestYaw - 0.05);
});

test('arches the wrists and fingers while trying, then lets them droop with fatigue', () => {
  const animation = createPreviewAnimation();
  const fingerBones = [
    'ThumbMetacarpal', 'ThumbProximal', 'ThumbDistal',
    'IndexProximal', 'IndexIntermediate', 'IndexDistal',
    'MiddleProximal', 'MiddleIntermediate', 'MiddleDistal',
    'RingProximal', 'RingIntermediate', 'RingDistal',
    'LittleProximal', 'LittleIntermediate', 'LittleDistal',
  ] as const;
  const signedZ = (bone: `${'left' | 'right'}${string}`, time: number): number => {
    const side = bone.startsWith('left') ? -1 : 1;
    const track = animation.tracks.get(bone as never)!.rotation!;
    return side * new THREE.Euler().setFromQuaternion(new THREE.Quaternion().fromArray(track.values, time * 30 * 4)).z;
  };
  for (const side of ['left', 'right'] as const) {
    const healthy = signedZ(`${side}Hand`, 1);
    const trying = signedZ(`${side}Hand`, 4);
    const tired = signedZ(`${side}Hand`, 9);
    assert.ok(trying < healthy - 0.08);
    assert.ok(tired > healthy + 0.05);
    for (const finger of fingerBones) {
      const bone = `${side}${finger}` as never;
      assert.ok(animation.tracks.has(bone));
      assert.ok(signedZ(bone, 4) < signedZ(bone, 1) - 0.06);
      assert.ok(signedZ(bone, 9) > signedZ(bone, 1) + 0.05);
    }
  }
});

test('makes breathing visible in the chest and knees', () => {
  const { tracks } = createPreviewAnimation();
  const chest = tracks.get('chest')!.rotation!;
  const knee = tracks.get('rightLowerLeg')!.rotation!;
  const chestX = Array.from(chest.values, (_, index) => index % 4 === 0 ? Math.abs(chest.values[index]) : 0);
  const kneeX = Array.from(knee.values, (_, index) => index % 4 === 0 ? Math.abs(knee.values[index]) : 0);
  assert.ok(Math.max(...chestX) < 0.018);
  assert.ok(Math.max(...kneeX) - Math.min(...kneeX) > 0.03);
  const shoulder = tracks.get('leftShoulder')!.rotation!;
  assert.ok(Math.max(...Array.from(shoulder.values, (_, index) => index % 4 === 1 ? Math.abs(shoulder.values[index]) : 0)) > 0.008);
});

test('lowers the arms slowly and raises the heel quickly', () => {
  const { tracks } = createPreviewAnimation();
  const arm = tracks.get('leftUpperArm')!.rotation!;
  const signedArm = (frame: number) => -new THREE.Euler().setFromQuaternion(
    new THREE.Quaternion().fromArray(arm.values, frame * 4),
  ).z;
  assert.ok(signedArm(6 * 30) < 0.12);
  assert.ok(signedArm(9 * 30) > 0.15);
  const knee = tracks.get('leftLowerLeg')!.rotation!;
  const at = (seconds: number) => new THREE.Euler().setFromQuaternion(
    new THREE.Quaternion().fromArray(knee.values, seconds * 30 * 4),
  ).x;
  assert.ok(at(16.5) < at(17.5) - 0.07);
  assert.ok(at(16.5) > 0.2);
  assert.ok(at(17.5) > 0.45);
  assert.ok(at(17) < at(17.5) - 0.05);
  const spine = tracks.get('spine')!.rotation!;
  const spineZ = (seconds: number) => new THREE.Euler().setFromQuaternion(
    new THREE.Quaternion().fromArray(spine.values, seconds * 30 * 4),
  ).z;
  assert.ok(Math.abs(spineZ(18) - spineZ(16)) < 0.03);
  const hips = tracks.get('hips')!.translation!;
  assert.ok(Math.abs(hips.values[18 * 30 * 3] - hips.values[16 * 30 * 3]) < 0.035);
});

test('adds a brief wrist and distal finger recoil at arm recovery', () => {
  const animation = createPreviewAnimation();
  const signedZ = (bone: `${'left' | 'right'}${string}`, time: number): number => {
    const side = bone.startsWith('left') ? -1 : 1;
    const track = animation.tracks.get(bone as never)!.rotation!;
    return side * new THREE.Euler().setFromQuaternion(
      new THREE.Quaternion().fromArray(track.values, time * 30 * 4),
    ).z;
  };
  for (const side of ['left', 'right'] as const) {
    const offset = side === 'left' ? 0 : 0.25;
    const frame = (seconds: number) => Math.round((seconds + offset) * 30) / 30;
    assert.ok(signedZ(`${side}Hand`, frame(13)) < signedZ(`${side}Hand`, frame(12.8)) - 0.045);
    assert.ok(signedZ(`${side}IndexDistal`, frame(13)) < signedZ(`${side}IndexDistal`, frame(12.8)) - 0.055);
    assert.ok(signedZ(`${side}IndexDistal`, frame(13.5)) > signedZ(`${side}IndexDistal`, frame(13)) + 0.015);
  }
});

test('tires once, lifts the arms past their starting height, then settles', () => {
  const animation = createPreviewAnimation();
  for (const side of ['left', 'right'] as const) {
    const arm = animation.tracks.get(`${side}UpperArm`)!.rotation!;
    const sign = side === 'left' ? -1 : 1;
    const droop = Array.from(arm.times, (_, frame) => sign * new THREE.Euler().setFromQuaternion(
      new THREE.Quaternion().fromArray(arm.values, frame * 4),
    ).z);
    let episodes = 0;
    droop.forEach((angle, index) => {
      if (angle > 0.1 && (index === 0 || droop[index - 1] <= 0.1)) episodes += 1;
    });
    assert.equal(episodes, 1);
    assert.ok(droop[9 * 30] > droop[0] + 0.15);
    assert.ok(droop[13 * 30] < droop[0] - 0.04);
    assert.ok(Math.abs(droop[15.5 * 30] - droop[0]) < 1e-6);
  }
});

test('all preview tracks close the loop without a pose jump', () => {
  const animation = createPreviewAnimation();
  const tracks = [
    ...Array.from(animation.tracks.values()).flatMap((set) => Object.values(set)),
    ...animation.expressionTracks.preset.values(),
    animation.lookAtTrack!,
  ];
  for (const track of tracks) {
    assert.equal(track.times[0], 0);
    assert.equal(track.times.at(-1), animation.duration);
    const size = track.getValueSize();
    for (let component = 0; component < size; component += 1) {
      assert.ok(Math.abs(track.values[component] - track.values[track.values.length - size + component]) < 1e-6);
    }
  }
});
