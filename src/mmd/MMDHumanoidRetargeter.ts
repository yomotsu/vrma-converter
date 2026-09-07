import * as THREE from 'three';

import { continuousQuaternionValues } from '../animation/trackUtils.js';
import { retargetMmdExpressions } from './MMDExpressionRetargeter.js';
import type { MMDExpressionAvailability, MMDExpressionMotion } from './MMDExpressionRetargeter.js';
import type { MMDMotionBakeResult, MMDMotionBoneTrack } from './MMDMotionTypes.js';

export type MMDHumanoidMotion = {
  rotationTracks: Map<string, THREE.QuaternionKeyframeTrack>;
  translationTrack: THREE.VectorKeyframeTrack | null;
  expressionTracks: MMDExpressionMotion;
  restHipsY: number;
};

type MMDCenterRole = 'center' | 'groove' | 'lowerBody';

const normalizeMmdBoneName = (name: string): string => name
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[\s_.()\-]/g, '');

const boneAliases: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
  ['hips', ['センター', 'center', 'groove', 'グルーブ', '下半身', 'lowerbody', 'hips', 'hip', 'pelvis', 'root', 'waist']],
  ['spine', ['上半身', 'upperbody', 'spine']],
  ['chest', ['上半身2', 'upperbody2', 'chest']],
  ['upperChest', ['上半身3', 'upperbody3', 'upperchest']],
  ['neck', ['首', 'neck']],
  ['head', ['頭', 'head']],
  ['jaw', ['あご', '顎', 'jaw']],
  ['leftEye', ['左目', 'lefteye', 'lefteye']],
  ['rightEye', ['右目', 'righteye']],
  ['leftShoulder', ['左肩', 'leftshoulder', 'lshoulder', 'lshldr']],
  ['rightShoulder', ['右肩', 'rightshoulder', 'rshoulder', 'rshldr']],
  ['leftUpperArm', ['左腕', 'leftupperarm', 'leftarm', 'lupperarm', 'larm']],
  ['rightUpperArm', ['右腕', 'rightupperarm', 'rightarm', 'rupperarm', 'rarm']],
  ['leftLowerArm', ['左ひじ', '左肘', 'leftlowerarm', 'leftelbow', 'lelbow']],
  ['rightLowerArm', ['右ひじ', '右肘', 'rightlowerarm', 'rightelbow', 'relbow']],
  ['leftHand', ['左手首', 'lefthand', 'leftwrist', 'lhand', 'lwrist']],
  ['rightHand', ['右手首', 'righthand', 'rightwrist', 'rhand', 'rwrist']],
  ['leftUpperLeg', ['左足', 'leftupperleg', 'leftleg', 'lupperleg', 'lleg']],
  ['rightUpperLeg', ['右足', 'rightupperleg', 'rightleg', 'rupperleg', 'rleg']],
  ['leftLowerLeg', ['左ひざ', '左膝', 'leftlowerleg', 'leftknee', 'lknee']],
  ['rightLowerLeg', ['右ひざ', '右膝', 'rightlowerleg', 'rightknee', 'rknee']],
  ['leftFoot', ['左足首', 'leftfoot', 'leftankle', 'lfoot', 'lankle']],
  ['rightFoot', ['右足首', 'rightfoot', 'rightankle', 'rfoot', 'rankle']],
  ['leftToes', ['左つま先', '左爪先', 'lefttoes', 'lefttoe', 'ltoes', 'ltoe']],
  ['rightToes', ['右つま先', '右爪先', 'righttoes', 'righttoe', 'rtoes', 'rtoe']],
];

const boneAliasMap = new Map<string, string>();
for (const [target, aliases] of boneAliases) {
  for (const alias of aliases) boneAliasMap.set(normalizeMmdBoneName(alias), target);
}

const centerRoleAliases: Readonly<Record<MMDCenterRole, ReadonlyArray<string>>> = {
  center: ['センター', 'center'],
  groove: ['グルーブ', 'groove'],
  lowerBody: ['下半身', 'lowerbody'],
};

const fingerAliases: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
  ['thumb', ['親指', 'thumb']],
  ['index', ['人指', '人差し指', '示指', 'index', 'indexfinger']],
  ['middle', ['中指', 'middle', 'middlefinger']],
  ['ring', ['薬指', 'ring', 'ringfinger']],
  ['little', ['小指', 'little', 'littlefinger', 'pinky']],
];

function mapMmdFingerName(normalizedName: string): string | null {
  let side: 'left' | 'right' | null = null;
  let remainder = normalizedName;

  if (remainder.startsWith('left')) {
    side = 'left';
    remainder = remainder.slice('left'.length);
  } else if (remainder.startsWith('right')) {
    side = 'right';
    remainder = remainder.slice('right'.length);
  } else if (remainder.startsWith('左')) {
    side = 'left';
    remainder = remainder.slice(1);
  } else if (remainder.startsWith('右')) {
    side = 'right';
    remainder = remainder.slice(1);
  }

  if (side == null) return null;
  if (remainder.startsWith('hand')) remainder = remainder.slice('hand'.length);

  for (const [finger, aliases] of fingerAliases) {
    for (const alias of aliases) {
      const normalizedAlias = normalizeMmdBoneName(alias);
      if (!remainder.startsWith(normalizedAlias)) continue;

      const suffix = remainder.slice(normalizedAlias.length);
      if (!/^[0-3]$/.test(suffix)) continue;
      const segment = Number(suffix);

      if (finger === 'thumb') {
        if (segment > 2) return null;
        const thumbSegment = segment === 0 ? 'Metacarpal' : segment === 1 ? 'Proximal' : 'Distal';
        return `${side}Thumb${thumbSegment}`;
      }

      if (segment < 1) return null;
      const fingerSegment = segment === 1 ? 'Proximal' : segment === 2 ? 'Intermediate' : 'Distal';
      const fingerName = finger[0].toUpperCase() + finger.slice(1);
      return `${side}${fingerName}${fingerSegment}`;
    }
  }

  return null;
}

export function mapMmdBoneName(name: string): string | null {
  const normalizedName = normalizeMmdBoneName(name);
  return boneAliasMap.get(normalizedName) ?? mapMmdFingerName(normalizedName);
}

function findCenterRoleBone(result: MMDMotionBakeResult, role: MMDCenterRole): MMDMotionBoneTrack | undefined {
  const aliases = new Set(centerRoleAliases[role].map(normalizeMmdBoneName));
  return result.bones.find((bone) => aliases.has(normalizeMmdBoneName(bone.name)));
}

function valuesAt(track: THREE.KeyframeTrack, sampleIndex: number, valueSize: number): number[] {
  if (track.times.length === 0 || track.values.length === 0) return [];
  const sourceIndex = Math.min(sampleIndex, track.times.length - 1);
  const offset = sourceIndex * valueSize;
  return Array.from(track.values.slice(offset, offset + valueSize));
}

function quaternionAt(track: THREE.QuaternionKeyframeTrack, sampleIndex: number): THREE.Quaternion {
  const values = valuesAt(track, sampleIndex, 4);
  const quaternion = new THREE.Quaternion().fromArray(
    (values.length === 4 ? values : [0, 0, 0, 1]) as [number, number, number, number],
  );
  return quaternion.lengthSq() < 1e-12 ? quaternion.identity() : quaternion.normalize();
}

function hasQuaternionSamples(track: THREE.QuaternionKeyframeTrack | undefined): boolean {
  return track != null && track.times.length > 0 && track.values.length >= 4;
}

function motionWorldQuaternionAt(source: MMDMotionBoneTrack, sampleIndex: number): THREE.Quaternion {
  // Older callers may only provide local rotations. Keep that data usable while
  // making the baked world pose the preferred source for hierarchy retargeting.
  if (!hasQuaternionSamples(source.worldRotation)) return quaternionAt(source.rotation, sampleIndex);

  const current = quaternionAt(source.worldRotation, sampleIndex);
  const rest = source.restWorldRotation?.clone() ?? new THREE.Quaternion();
  if (rest.lengthSq() < 1e-12) rest.identity();
  else rest.normalize();
  return rest.invert().multiply(current).normalize();
}

function createQuaternionTrack(
  name: string,
  times: number[],
  quaternions: THREE.Quaternion[],
): THREE.QuaternionKeyframeTrack {
  const values = quaternions.flatMap((quaternion) => quaternion.toArray());
  return new THREE.QuaternionKeyframeTrack(name, [...times], continuousQuaternionValues(values));
}

function composedHipsQuaternions(
  times: number[],
  sources: MMDMotionBoneTrack[],
): THREE.Quaternion[] {
  return times.map((_, sampleIndex) => {
    const composed = new THREE.Quaternion();
    for (const source of sources) composed.multiply(quaternionAt(source.rotation, sampleIndex));
    return composed.normalize();
  });
}

function findMappedParentWorldQuaternion(
  bonesByIndex: ReadonlyMap<number, MMDMotionBoneTrack>,
  source: MMDMotionBoneTrack,
  hipsWorldQuaternions: THREE.Quaternion[],
  sampleIndex: number,
): THREE.Quaternion {
  const visited = new Set<number>();
  let parentIndex = source.parentIndex;

  while (parentIndex >= 0 && !visited.has(parentIndex)) {
    visited.add(parentIndex);
    const parent = bonesByIndex.get(parentIndex);
    if (parent == null) break;

    const parentTarget = mapMmdBoneName(parent.name);
    if (parentTarget === 'hips') {
      return hipsWorldQuaternions[sampleIndex]?.clone() ?? new THREE.Quaternion();
    }
    if (parentTarget != null) return motionWorldQuaternionAt(parent, sampleIndex);
    parentIndex = parent.parentIndex;
  }

  return new THREE.Quaternion();
}

function createHipsTranslationTrack(
  times: number[],
  source: MMDMotionBoneTrack,
): THREE.VectorKeyframeTrack {
  const rest = source.restWorldPosition;
  const values = times.flatMap((_, sampleIndex) => {
    const position = valuesAt(source.worldPosition, sampleIndex, 3);
    const x = position[0] ?? rest.x;
    const y = position[1] ?? rest.y;
    const z = position[2] ?? rest.z;
    return [x - rest.x, y, z - rest.z];
  });
  return new THREE.VectorKeyframeTrack('hips.position', [...times], values);
}

function canOutputBone(availableHumanoidNames: ReadonlySet<string> | undefined, name: string): boolean {
  return availableHumanoidNames == null || availableHumanoidNames.has(name);
}

export function retargetMmdMotion(
  result: MMDMotionBakeResult,
  availableHumanoidNames?: ReadonlySet<string>,
  availableExpressions?: MMDExpressionAvailability,
): MMDHumanoidMotion {
  const times = result.times.length > 0 ? result.times : [0];
  const rotationTracks = new Map<string, THREE.QuaternionKeyframeTrack>();
  const centerSources = (['center', 'groove', 'lowerBody'] as const)
    .map((role) => findCenterRoleBone(result, role))
    .filter((bone): bone is MMDMotionBoneTrack => bone != null);
  const directHips = centerSources.length === 0
    ? result.bones.find((bone) => mapMmdBoneName(bone.name) === 'hips')
    : undefined;
  const hipsSources = centerSources.length > 0 ? centerSources : directHips == null ? [] : [directHips];
  const consumed = new Set(hipsSources.map((bone) => bone.index));
  const bonesByIndex = new Map(result.bones.map((bone) => [bone.index, bone] as const));
  const hipsWorldQuaternions = hipsSources.length > 0
    ? centerSources.length > 0
      ? composedHipsQuaternions(times, hipsSources)
      : times.map((_, sampleIndex) => motionWorldQuaternionAt(hipsSources[0]!, sampleIndex))
    : times.map(() => new THREE.Quaternion());

  if (hipsSources.length > 0 && canOutputBone(availableHumanoidNames, 'hips')) {
    rotationTracks.set('hips', createQuaternionTrack('hips', times, hipsWorldQuaternions));
  }

  const translationSource = findCenterRoleBone(result, 'lowerBody')
    ?? findCenterRoleBone(result, 'center')
    ?? hipsSources[0];
  const translationTrack = translationSource != null && canOutputBone(availableHumanoidNames, 'hips')
    ? createHipsTranslationTrack(times, translationSource)
    : null;
  const restHipsY = translationSource == null ? 1 : Math.max(0.0001, Math.abs(translationSource.restWorldPosition.y));

  for (const bone of result.bones) {
    if (consumed.has(bone.index)) continue;
    const targetName = mapMmdBoneName(bone.name);
    if (targetName == null || targetName === 'hips' || !canOutputBone(availableHumanoidNames, targetName)) continue;
    if (rotationTracks.has(targetName)) continue;

    const quaternions = times.map((_, sampleIndex) => {
      const currentWorld = motionWorldQuaternionAt(bone, sampleIndex);
      const parentWorld = findMappedParentWorldQuaternion(
        bonesByIndex,
        bone,
        hipsWorldQuaternions,
        sampleIndex,
      );
      return parentWorld.invert().multiply(currentWorld).normalize();
    });
    rotationTracks.set(targetName, createQuaternionTrack(targetName, times, quaternions));
  }

  return {
    rotationTracks,
    translationTrack,
    expressionTracks: retargetMmdExpressions(result, availableExpressions),
    restHipsY,
  };
}
