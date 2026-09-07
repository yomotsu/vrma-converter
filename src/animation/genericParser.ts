import * as THREE from 'three';

import { getSourceTrackBoneName, mapSourceBone, trackPathFor } from './rigMapping.ts';
import { makeQuaternionTrack, makeVectorTrack, setTrack } from './trackUtils.ts';
import type { MotionTrackSet } from './types.ts';

function normalizeSourceQuaternionTrack(track: THREE.KeyframeTrack): THREE.QuaternionKeyframeTrack {
  const times = Array.from(track.times);
  const values = Array.from(track.values);
  const first = new THREE.Quaternion().fromArray(values.slice(0, 4) as [number, number, number, number]);
  const inverseFirst = first.clone().invert();
  const normalized: number[] = [];
  for (let index = 0; index < values.length; index += 4) {
    const current = new THREE.Quaternion().fromArray(values.slice(index, index + 4) as [number, number, number, number]);
    normalized.push(...inverseFirst.clone().multiply(current).normalize().toArray());
  }
  return makeQuaternionTrack('', times, normalized);
}

function normalizeSourcePositionTrack(track: THREE.KeyframeTrack, onlyRoot: boolean): THREE.VectorKeyframeTrack {
  const times = Array.from(track.times);
  const values = Array.from(track.values);
  const first = values.slice(0, 3);
  const normalized = values.map((value, index) => onlyRoot ? value - (first[index % 3] ?? 0) : value);
  return makeVectorTrack('', times, normalized);
}

export function retargetGenericClip(clip: THREE.AnimationClip): MotionTrackSet {
  const tracks: MotionTrackSet = new Map();
  clip.tracks.forEach((sourceTrack) => {
    const path = trackPathFor(sourceTrack);
    if (path == null) return;
    const sourceBone = mapSourceBone(getSourceTrackBoneName(sourceTrack.name));
    if (sourceBone == null) return;
    if (path === 'translation' && sourceBone !== 'hips') return;
    const normalized = path === 'rotation'
      ? normalizeSourceQuaternionTrack(sourceTrack)
      : normalizeSourcePositionTrack(sourceTrack, sourceBone === 'hips');
    setTrack(tracks, sourceBone, path, normalized);
  });
  return tracks;
}
