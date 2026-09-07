import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';

import type { RetargetedMotion } from './mixamoParser.ts';
import { mapUniversalBone } from './rigMapping.ts';
import { makeQuaternionTrack, makeVectorTrack, setTrack } from './trackUtils.ts';
import type { MotionTrackSet } from './types.ts';

function evaluateTrackAt(track: THREE.KeyframeTrack, time: number): number[] {
  const size = track.getValueSize();
  const trackWithInterpolant = track as THREE.KeyframeTrack & {
    createInterpolant: (result: Float32Array) => { evaluate: (time: number) => ArrayLike<number> };
  };
  const firstTime = track.times[0] ?? 0;
  const lastTime = track.times[track.times.length - 1] ?? firstTime;
  const sampleTime = Math.min(lastTime, Math.max(firstTime, time));
  return Array.from(trackWithInterpolant.createInterpolant(new Float32Array(size)).evaluate(sampleTime));
}

export function retargetUniversalClip(
  asset: THREE.Group,
  clip: THREE.AnimationClip,
  vrm: VRM | null,
): RetargetedMotion {
  const motionHips = asset.getObjectByName('pelvis');
  if (motionHips == null) throw new Error('Universal humanoid の pelvis が見つかりませんでした');
  asset.updateMatrixWorld(true);
  // UAL files are Z-up. Convert their coordinates to VRM's Y-up space before
  // applying translation tracks and relative bone rotations.
  const sourceToVrm = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  const vrmToSource = sourceToVrm.clone().invert();
  const restHipsWorldPosition = motionHips.getWorldPosition(new THREE.Vector3()).applyQuaternion(sourceToVrm);
  const motionHipsHeight = Math.max(Math.abs(restHipsWorldPosition.y), 0.0001);
  const sourceRoot = asset.getObjectByName('root');
  const sourceRootParentMatrix = sourceRoot?.parent?.matrixWorld.clone() ?? new THREE.Matrix4();
  const tracks: MotionTrackSet = new Map();
  const trackByName = new Map(clip.tracks.map((track) => [track.name, track]));
  const hipsPositionTrack = trackByName.get('pelvis.position');
  const rootPositionTrack = trackByName.get('root.position');
  const rootRotationTrack = trackByName.get('root.quaternion');

  if (hipsPositionTrack != null || rootPositionTrack != null) {
    const translationTimes = Array.from(new Set([
      ...(hipsPositionTrack == null ? [] : Array.from(hipsPositionTrack.times)),
      ...(rootPositionTrack == null ? [] : Array.from(rootPositionTrack.times)),
      ...(rootRotationTrack == null ? [] : Array.from(rootRotationTrack.times)),
    ])).sort((a, b) => a - b);
    const values: number[] = [];
    translationTimes.forEach((time) => {
      const rootPosition = rootPositionTrack == null
        ? sourceRoot?.position.clone() ?? new THREE.Vector3()
        : new THREE.Vector3().fromArray(evaluateTrackAt(rootPositionTrack, time) as [number, number, number]);
      const rootRotation = rootRotationTrack == null
        ? sourceRoot?.quaternion.clone() ?? new THREE.Quaternion()
        : new THREE.Quaternion().fromArray(evaluateTrackAt(rootRotationTrack, time) as [number, number, number, number]);
      const hipsPosition = hipsPositionTrack == null
        ? motionHips.position.clone()
        : new THREE.Vector3().fromArray(evaluateTrackAt(hipsPositionTrack, time) as [number, number, number]);
      const sourcePosition = hipsPosition
        .applyQuaternion(rootRotation)
        .add(rootPosition)
        .applyMatrix4(sourceRootParentMatrix)
        .applyQuaternion(sourceToVrm);
      // VRMA's normalized hips rest position has no horizontal offset.
      sourcePosition.x -= restHipsWorldPosition.x;
      sourcePosition.z -= restHipsWorldPosition.z;
      values.push(...sourcePosition.toArray());
    });
    setTrack(tracks, 'hips', 'translation', makeVectorTrack('', translationTimes, values));
  }

  clip.tracks.forEach((sourceTrack) => {
    const [sourceNodeName, propertyName] = sourceTrack.name.split('.');
    if (sourceNodeName == null || propertyName == null) return;
    const sourceBone = mapUniversalBone(sourceNodeName);
    if (sourceBone == null || (vrm != null && vrm.humanoid.getNormalizedBoneNode(sourceBone as never) == null)) return;
    const sourceNode = asset.getObjectByName(sourceNodeName);
    if (sourceNode?.parent == null) return;
    if (!(sourceTrack instanceof THREE.QuaternionKeyframeTrack)) return;

    const restRotationInverse = sourceNode.getWorldQuaternion(new THREE.Quaternion()).invert();
    const parentRestWorldRotation = sourceNode.parent.getWorldQuaternion(new THREE.Quaternion());
    const values: number[] = [];
    for (let index = 0; index < sourceTrack.values.length; index += 4) {
      const quaternion = new THREE.Quaternion()
        .fromArray(Array.from(sourceTrack.values.slice(index, index + 4)) as [number, number, number, number])
        .premultiply(parentRestWorldRotation)
        .multiply(restRotationInverse)
        .normalize();
      values.push(...sourceToVrm.clone().multiply(quaternion).multiply(vrmToSource).normalize().toArray());
    }
    setTrack(tracks, sourceBone, 'rotation', makeQuaternionTrack('', Array.from(sourceTrack.times), values));
  });
  return { tracks, restHipsY: motionHipsHeight };
}
