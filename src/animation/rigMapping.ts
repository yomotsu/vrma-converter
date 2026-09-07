import type * as THREE from 'three';

import type { BoneName, TrackPath } from './types.js';

export const HUMAN_BONES: BoneName[] = [
  'hips', 'spine', 'chest', 'upperChest', 'neck', 'head', 'jaw', 'leftEye', 'rightEye',
  'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightShoulder', 'rightUpperArm',
  'rightLowerArm', 'rightHand', 'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'leftToes',
  'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'rightToes', 'leftThumbMetacarpal',
  'leftThumbProximal', 'leftThumbDistal', 'leftIndexProximal', 'leftIndexIntermediate',
  'leftIndexDistal', 'leftMiddleProximal', 'leftMiddleIntermediate', 'leftMiddleDistal',
  'leftRingProximal', 'leftRingIntermediate', 'leftRingDistal', 'leftLittleProximal',
  'leftLittleIntermediate', 'leftLittleDistal', 'rightThumbMetacarpal', 'rightThumbProximal',
  'rightThumbDistal', 'rightIndexProximal', 'rightIndexIntermediate', 'rightIndexDistal',
  'rightMiddleProximal', 'rightMiddleIntermediate', 'rightMiddleDistal', 'rightRingProximal',
  'rightRingIntermediate', 'rightRingDistal', 'rightLittleProximal', 'rightLittleIntermediate',
  'rightLittleDistal',
];

const boneAliases: Array<[BoneName, string[]]> = [
  ['hips', ['hips', 'hip', 'pelvis', 'root', 'center', 'waist']],
  ['upperChest', ['upperchest', 'spine3', 'spine03']],
  ['chest', ['chest', 'spine2', 'spine02', 'upperbody']],
  ['spine', ['spine', 'spine1', 'spine01', 'abdomen']],
  ['neck', ['neck']],
  ['head', ['head']],
  ['jaw', ['jaw', 'chin']],
  ['leftEye', ['lefteye', 'eyel']],
  ['rightEye', ['righteye', 'eyer']],
  ['leftShoulder', ['leftshoulder', 'lshoulder', 'leftcollar', 'lcollar', 'shoulderl']],
  ['rightShoulder', ['rightshoulder', 'rshoulder', 'rightcollar', 'rcollar', 'shoulderr']],
  ['leftUpperArm', ['leftupperarm', 'leftarm', 'lupperarm', 'larm', 'lshldr', 'arml']],
  ['rightUpperArm', ['rightupperarm', 'rightarm', 'rupperarm', 'rarm', 'rshldr', 'armr']],
  ['leftLowerArm', ['leftlowerarm', 'leftforearm', 'llowerarm', 'lforearm', 'forearml']],
  ['rightLowerArm', ['rightlowerarm', 'rightforearm', 'rlowerarm', 'rforearm', 'forearmr']],
  ['leftHand', ['lefthand', 'lhand', 'handl']],
  ['rightHand', ['righthand', 'rhand', 'handr']],
  ['leftUpperLeg', ['leftupperleg', 'leftupleg', 'leftthigh', 'lupperleg', 'lthigh', 'thighl']],
  ['rightUpperLeg', ['rightupperleg', 'rightupleg', 'rightthigh', 'rupperleg', 'rthigh', 'thighr']],
  ['leftLowerLeg', ['leftlowerleg', 'leftleg', 'leftshin', 'lleg', 'lshin', 'legl']],
  ['rightLowerLeg', ['rightlowerleg', 'rightleg', 'rightshin', 'rleg', 'rshin', 'legr']],
  ['leftFoot', ['leftfoot', 'lfoot', 'footl']],
  ['rightFoot', ['rightfoot', 'rfoot', 'footr']],
  ['leftToes', ['lefttoes', 'lefttoebase', 'ltoes', 'ltoebase', 'toesl']],
  ['rightToes', ['righttoes', 'righttoebase', 'rtoes', 'rtoebase', 'toesr']],
];

const mixamoVRMRigMap: Record<string, BoneName> = {
  mixamorigHips: 'hips',
  mixamorigSpine: 'spine',
  mixamorigSpine1: 'chest',
  mixamorigSpine2: 'upperChest',
  mixamorigNeck: 'neck',
  mixamorigHead: 'head',
  mixamorigLeftShoulder: 'leftShoulder',
  mixamorigLeftArm: 'leftUpperArm',
  mixamorigLeftForeArm: 'leftLowerArm',
  mixamorigLeftHand: 'leftHand',
  mixamorigLeftHandThumb1: 'leftThumbMetacarpal',
  mixamorigLeftHandThumb2: 'leftThumbProximal',
  mixamorigLeftHandThumb3: 'leftThumbDistal',
  mixamorigLeftHandIndex1: 'leftIndexProximal',
  mixamorigLeftHandIndex2: 'leftIndexIntermediate',
  mixamorigLeftHandIndex3: 'leftIndexDistal',
  mixamorigLeftHandMiddle1: 'leftMiddleProximal',
  mixamorigLeftHandMiddle2: 'leftMiddleIntermediate',
  mixamorigLeftHandMiddle3: 'leftMiddleDistal',
  mixamorigLeftHandRing1: 'leftRingProximal',
  mixamorigLeftHandRing2: 'leftRingIntermediate',
  mixamorigLeftHandRing3: 'leftRingDistal',
  mixamorigLeftHandPinky1: 'leftLittleProximal',
  mixamorigLeftHandPinky2: 'leftLittleIntermediate',
  mixamorigLeftHandPinky3: 'leftLittleDistal',
  mixamorigRightShoulder: 'rightShoulder',
  mixamorigRightArm: 'rightUpperArm',
  mixamorigRightForeArm: 'rightLowerArm',
  mixamorigRightHand: 'rightHand',
  mixamorigRightHandPinky1: 'rightLittleProximal',
  mixamorigRightHandPinky2: 'rightLittleIntermediate',
  mixamorigRightHandPinky3: 'rightLittleDistal',
  mixamorigRightHandRing1: 'rightRingProximal',
  mixamorigRightHandRing2: 'rightRingIntermediate',
  mixamorigRightHandRing3: 'rightRingDistal',
  mixamorigRightHandMiddle1: 'rightMiddleProximal',
  mixamorigRightHandMiddle2: 'rightMiddleIntermediate',
  mixamorigRightHandMiddle3: 'rightMiddleDistal',
  mixamorigRightHandIndex1: 'rightIndexProximal',
  mixamorigRightHandIndex2: 'rightIndexIntermediate',
  mixamorigRightHandIndex3: 'rightIndexDistal',
  mixamorigRightHandThumb1: 'rightThumbMetacarpal',
  mixamorigRightHandThumb2: 'rightThumbProximal',
  mixamorigRightHandThumb3: 'rightThumbDistal',
  mixamorigLeftUpLeg: 'leftUpperLeg',
  mixamorigLeftLeg: 'leftLowerLeg',
  mixamorigLeftFoot: 'leftFoot',
  mixamorigLeftToeBase: 'leftToes',
  mixamorigRightUpLeg: 'rightUpperLeg',
  mixamorigRightLeg: 'rightLowerLeg',
  mixamorigRightFoot: 'rightFoot',
  mixamorigRightToeBase: 'rightToes',
};

const universalVrmRigMap: Record<string, BoneName> = {
  pelvis: 'hips',
  spine_01: 'spine',
  spine_02: 'chest',
  spine_03: 'upperChest',
  neck_01: 'neck',
  Head: 'head',
  clavicle_l: 'leftShoulder',
  upperarm_l: 'leftUpperArm',
  lowerarm_l: 'leftLowerArm',
  hand_l: 'leftHand',
  thumb_01_l: 'leftThumbMetacarpal',
  thumb_02_l: 'leftThumbProximal',
  thumb_03_l: 'leftThumbDistal',
  index_01_l: 'leftIndexProximal',
  index_02_l: 'leftIndexIntermediate',
  index_03_l: 'leftIndexDistal',
  middle_01_l: 'leftMiddleProximal',
  middle_02_l: 'leftMiddleIntermediate',
  middle_03_l: 'leftMiddleDistal',
  ring_01_l: 'leftRingProximal',
  ring_02_l: 'leftRingIntermediate',
  ring_03_l: 'leftRingDistal',
  pinky_01_l: 'leftLittleProximal',
  pinky_02_l: 'leftLittleIntermediate',
  pinky_03_l: 'leftLittleDistal',
  clavicle_r: 'rightShoulder',
  upperarm_r: 'rightUpperArm',
  lowerarm_r: 'rightLowerArm',
  hand_r: 'rightHand',
  thumb_01_r: 'rightThumbMetacarpal',
  thumb_02_r: 'rightThumbProximal',
  thumb_03_r: 'rightThumbDistal',
  index_01_r: 'rightIndexProximal',
  index_02_r: 'rightIndexIntermediate',
  index_03_r: 'rightIndexDistal',
  middle_01_r: 'rightMiddleProximal',
  middle_02_r: 'rightMiddleIntermediate',
  middle_03_r: 'rightMiddleDistal',
  ring_01_r: 'rightRingProximal',
  ring_02_r: 'rightRingIntermediate',
  ring_03_r: 'rightRingDistal',
  pinky_01_r: 'rightLittleProximal',
  pinky_02_r: 'rightLittleIntermediate',
  pinky_03_r: 'rightLittleDistal',
  thigh_l: 'leftUpperLeg',
  calf_l: 'leftLowerLeg',
  foot_l: 'leftFoot',
  ball_l: 'leftToes',
  thigh_r: 'rightUpperLeg',
  calf_r: 'rightLowerLeg',
  foot_r: 'rightFoot',
  ball_r: 'rightToes',
};

export type AnimationRigType = 'mixamo' | 'universal';

export function getSourceTrackBoneName(trackName: string): string {
  const bracket = trackName.match(/bones\[([^\]]+)\]/i);
  if (bracket?.[1] != null) return bracket[1];
  const beforeProperty = trackName.split('.')[0] ?? trackName;
  return beforeProperty.split('/').pop() ?? beforeProperty;
}

function normalizedBoneText(value: string): string {
  return value
    .replace(/mixamorig/gi, '')
    .replace(/armature|skeleton|rig|joint|bone/gi, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}

export function mapSourceBone(name: string): BoneName | null {
  const clean = normalizedBoneText(name)
    .replace(/^(left|right|l|r)hand(?=(thumb|index|middle|ring|little|pinky))/, '$1')
    .replace(/pinky/g, 'little');
  for (const [bone, aliases] of boneAliases) {
    if (aliases.includes(clean)) return bone;
  }
  const fingerMatch = clean.match(/^(left|right|l|r)(thumb|index|middle|mid|ring|little)(metacarpal|proximal|intermediate|distal|1|2|3)$/);
  if (fingerMatch != null) {
    const side = fingerMatch[1] === 'left' || fingerMatch[1] === 'l' ? 'left' : 'right';
    const fingerToken = fingerMatch[2] === 'mid' ? 'middle' : fingerMatch[2];
    const finger = fingerToken[0].toUpperCase() + fingerToken.slice(1);
    const isThumb = finger === 'Thumb';
    const segment = fingerMatch[3] === '1' ? 'Proximal' : fingerMatch[3] === '2' ? (isThumb ? 'Distal' : 'Intermediate') : fingerMatch[3] === '3' ? 'Distal' : fingerMatch[3][0].toUpperCase() + fingerMatch[3].slice(1);
    const candidate = `${side}${finger}${segment}` as BoneName;
    return HUMAN_BONES.includes(candidate) ? candidate : null;
  }
  return null;
}

export function mapMixamoBone(name: string): BoneName | null {
  const mappedName = Object.keys(mixamoVRMRigMap).find((key) => key.toLowerCase() === name.toLowerCase());
  return (mappedName == null ? null : mixamoVRMRigMap[mappedName]) ?? mapSourceBone(name);
}

export function mapUniversalBone(name: string): BoneName | null {
  return universalVrmRigMap[name]
    ?? (name.toLowerCase() === 'root' ? null : mapSourceBone(name));
}

export function detectAnimationRig(asset: THREE.Group): AnimationRigType | null {
  const hasMixamoRig = asset.getObjectByName('mixamorigHips') != null;
  const hasUniversalRig = asset.getObjectByName('pelvis') != null
    && asset.getObjectByName('spine_01') != null;
  if (hasMixamoRig === hasUniversalRig) return null;
  return hasMixamoRig ? 'mixamo' : 'universal';
}

export function trackPathFor(track: THREE.KeyframeTrack): TrackPath | null {
  const name = track.name.toLowerCase();
  if (name.includes('quaternion') || name.endsWith('.rotation') || name.includes('rotation')) return 'rotation';
  if (name.includes('position') || name.includes('translation')) return 'translation';
  return null;
}
