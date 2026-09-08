import type * as THREE from 'three';

export type ReadyPlayerMeGender = 'feminine' | 'masculine';
type QuaternionArray = [number, number, number, number];

// The animation-library files are exported with a preview pose as the scene
// transform. These are the local rotations from the matching TPose armatures.
const feminineRestRotations: Record<string, QuaternionArray> = {
  Hips: [-0.02997774, -0.00002614, 0.00000078, 0.99955058],
  Spine: [-0.01378576, 0.00002629, 0.00000036, 0.99990499],
  Spine1: [-0.03635693, 0.00000011, 0.0000001, 0.99933887],
  Spine2: [0.06359202, -0.00000015, -0.00000009, 0.99797601],
  Neck: [0.13964607, 0.00000004, -0.00000011, 0.99020147],
  Head: [-0.05336163, 0.00000003, 0.00000012, 0.99857527],
  LeftShoulder: [-0.48168781, -0.49276939, 0.58890659, -0.42230824],
  LeftArm: [-0.05658777, -0.19787514, 0.10361828, 0.97309119],
  LeftForeArm: [0, 0, 0.02617707, 0.99965733],
  LeftHand: [0.00714946, 0.27302629, -0.02518176, 0.96165037],
  RightShoulder: [0.48168781, -0.49276987, 0.58890605, 0.42230842],
  RightArm: [-0.05658727, 0.1978756, -0.10361784, 0.97309119],
  RightForeArm: [0, 0, -0.02617691, 0.99965733],
  RightHand: [0.00714943, -0.27302629, 0.02518163, 0.96165037],
  LeftUpLeg: [0, -0.05625715, 0.9984163, 0],
  LeftLeg: [-0.03768057, 0.00034262, -0.00097534, 0.99928927],
  LeftFoot: [0.48480961, 0, 0, 0.87461972],
  LeftToeBase: [0.33071157, -0.01030158, 0.02612997, 0.94331384],
  RightUpLeg: [0, -0.05626813, 0.99841571, 0],
  RightLeg: [-0.03768227, -0.0003433, 0.00097558, 0.99928921],
  RightFoot: [0.48480961, 0, 0, 0.87461972],
  RightToeBase: [0.33071822, 0.01039753, -0.02612116, 0.94331068],
};

const masculineRestRotations: Record<string, QuaternionArray> = {
  Hips: [0.0162302, -0.00002624, -0.00000042, 0.99986827],
  Spine: [-0.06853317, 0.00002627, 0.00000181, 0.99764884],
  Spine1: [-0.03212389, 0.00000006, 0.0000001, 0.99948388],
  Spine2: [0.04709896, -0.00000024, 0.00000011, 0.99889022],
  Neck: [0.20275378, 0.00000007, 0.00000011, 0.97922975],
  Head: [-0.16267578, -0.00000031, -0.00000038, 0.98667955],
  LeftShoulder: [-0.50413549, -0.4903079, 0.5138908, -0.49128589],
  LeftArm: [-0.01699487, -0.19165535, 0.00789032, 0.98128343],
  LeftForeArm: [0.00000002, -0.00000001, 0.02617705, 0.99965733],
  LeftHand: [0.00714944, 0.27302629, -0.02518174, 0.96165037],
  RightShoulder: [0.50413132, -0.49031088, 0.51388824, 0.49128985],
  RightArm: [-0.01927656, 0.19180338, 0.00011838, 0.98124403],
  RightForeArm: [-0.00000001, 0, -0.02617688, 0.99965733],
  RightHand: [0.00714942, -0.27302629, 0.02518163, 0.96165037],
  LeftUpLeg: [0.00002623, -0.02166901, 0.99976522, 0.00000057],
  LeftLeg: [-0.01745242, 0, 0, 0.99984771],
  LeftFoot: [0.51143366, 0.0519562, 0.02041017, 0.85750777],
  LeftToeBase: [0.26822883, -0.04375387, 0.01854728, 0.96218234],
  RightUpLeg: [0.00002623, -0.02166901, 0.99976522, 0.00000057],
  RightLeg: [-0.01745234, 0, 0, 0.99984771],
  RightFoot: [0.51143456, -0.05195823, -0.02041123, 0.85750711],
  RightToeBase: [0.26822859, 0.04374935, -0.01855645, 0.96218246],
};

export function detectReadyPlayerMeGender(asset: THREE.Group): ReadyPlayerMeGender {
  const spine1 = asset.getObjectByName('Spine1');
  const leftArm = asset.getObjectByName('LeftArm');
  const spineLength = Math.abs(spine1?.position.y ?? 0);
  const armLength = Math.abs(leftArm?.position.y ?? 0);
  return spineLength > 0.0001 && armLength / spineLength > 0.82 ? 'masculine' : 'feminine';
}

export function readyPlayerMeRestRotation(name: string, gender: ReadyPlayerMeGender): QuaternionArray | null {
  return (gender === 'masculine' ? masculineRestRotations : feminineRestRotations)[name] ?? null;
}

export function readyPlayerMeReferenceHipsY(asset: THREE.Group, gender: ReadyPlayerMeGender): number | null {
  const spine1Y = Math.abs(asset.getObjectByName('Spine1')?.position.y ?? 0);
  if (spine1Y <= 0.0001) return null;
  const referenceSpine1Y = gender === 'masculine' ? 0.1305 : 0.0915;
  const referenceHipsY = gender === 'masculine' ? 1.0192 : 1.037;
  return spine1Y * referenceHipsY / referenceSpine1Y;
}
