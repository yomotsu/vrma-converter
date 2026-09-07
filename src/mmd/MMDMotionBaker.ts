import * as THREE from 'three';

import { continuousQuaternionValues, createMmdFrameTimes } from './MMDMotionMath.ts';
import type { MMDMotionBakeResult, MMDMotionBoneTrack } from './MMDMotionTypes.js';

export type MMDAnimationHelperLike = {
  add(mesh: THREE.SkinnedMesh, params: { animation: THREE.AnimationClip; physics: false }): unknown;
  update(delta: number): unknown;
  remove?(mesh: THREE.SkinnedMesh): unknown;
};

export type MMDMotionBakerOptions = {
  modelUrl: string;
  fps?: number;
};

function selectedFps(fps: number | undefined): number {
  return Math.max(1, Math.round(Number.isFinite(fps) ? fps! : 30));
}

function disposeMmdMesh(mesh: THREE.SkinnedMesh): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  mesh.traverse((object) => {
    const drawable = object as THREE.Mesh;
    if (drawable.geometry instanceof THREE.BufferGeometry) geometries.add(drawable.geometry);

    const objectMaterials = Array.isArray(drawable.material)
      ? drawable.material
      : drawable.material == null ? [] : [drawable.material];
    for (const material of objectMaterials) {
      materials.add(material);
      for (const value of Object.values(material as THREE.Material & Record<string, unknown>)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  });

  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
  mesh.skeleton?.dispose();
}

export function bakeLoadedMmdMotion(
  mesh: THREE.SkinnedMesh,
  animation: THREE.AnimationClip,
  helper: MMDAnimationHelperLike,
  options: { fps?: number } = {},
): MMDMotionBakeResult {
  const fps = selectedFps(options.fps);
  const bones = mesh.skeleton.bones.slice();

  mesh.pose();
  mesh.updateMatrixWorld(true);
  const meshWorldInverse = mesh.matrixWorld.clone().invert();
  const boneIndices = new Map(bones.map((bone, index) => [bone, index] as const));
  const restWorldRotations = bones.map((bone) => bone.getWorldQuaternion(new THREE.Quaternion()));
  const restWorldPositions = bones.map((bone) => (
    bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(meshWorldInverse)
  ));
  const positionValues = bones.map(() => [] as number[]);
  const rotationValues = bones.map(() => [] as number[]);
  const worldRotationValues = bones.map(() => [] as number[]);
  const worldPositionValues = bones.map(() => [] as number[]);
  const times = createMmdFrameTimes(animation.duration, fps);
  let previousTime = 0;

  helper.add(mesh, { animation, physics: false });
  for (const time of times) {
    helper.update(Math.max(0, time - previousTime));
    mesh.updateMatrixWorld(true);

    bones.forEach((bone, index) => {
      positionValues[index]!.push(...bone.position.toArray());
      rotationValues[index]!.push(...bone.quaternion.toArray());
      worldRotationValues[index]!.push(...bone.getWorldQuaternion(new THREE.Quaternion()).toArray());
      worldPositionValues[index]!.push(
        ...bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(meshWorldInverse).toArray(),
      );
    });
    previousTime = time;
  }

  const motionBones: MMDMotionBoneTrack[] = bones.map((bone, index) => ({
    index,
    name: bone.name,
    parentIndex: bone.parent == null ? -1 : (boneIndices.get(bone.parent as THREE.Bone) ?? -1),
    rotation: new THREE.QuaternionKeyframeTrack(
      `${bone.name}.quaternion`,
      [...times],
      continuousQuaternionValues(rotationValues[index]!),
    ),
    worldRotation: new THREE.QuaternionKeyframeTrack(
      `${bone.name}.worldQuaternion`,
      [...times],
      continuousQuaternionValues(worldRotationValues[index]!),
    ),
    position: new THREE.VectorKeyframeTrack(`${bone.name}.position`, [...times], positionValues[index]!),
    worldPosition: new THREE.VectorKeyframeTrack(
      `${bone.name}.worldPosition`,
      [...times],
      worldPositionValues[index]!,
    ),
    restWorldRotation: restWorldRotations[index]!.clone(),
    restWorldPosition: restWorldPositions[index]!.clone(),
  }));

  return {
    duration: Math.max(0, Number.isFinite(animation.duration) ? animation.duration : 0),
    fps,
    times,
    bones: motionBones,
  };
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error('MMDモーションの読み込みに失敗しました');
}

type MMDLoadResult = {
  mesh: THREE.SkinnedMesh;
  animation: THREE.AnimationClip;
};

/**
 * Loads the fixed PMX and samples a VMD with MMD's IK/grant solver enabled.
 * This class deliberately has no renderer, scene, canvas, or DOM dependency.
 */
export class MMDMotionBaker {
  private readonly modelUrl: string;
  private readonly fps: number;

  public constructor(options: MMDMotionBakerOptions) {
    this.modelUrl = options.modelUrl;
    this.fps = selectedFps(options.fps);
  }

  public async bakeVmd(file: File): Promise<MMDMotionBakeResult> {
    const animationUrl = URL.createObjectURL(file);
    let loaded: MMDLoadResult | null = null;
    let helper: MMDAnimationHelperLike | null = null;

    try {
      const [{ MMDLoader }, { MMDAnimationHelper }] = await Promise.all([
        import('./loaders/MMDLoader.js'),
        import('./animation/MMDAnimationHelper.js'),
      ]);
      const loader = new MMDLoader(THREE.DefaultLoadingManager);
      loaded = await new Promise<MMDLoadResult>((resolve, reject) => {
        loader.loadWithAnimation(
          this.modelUrl,
          animationUrl,
          (result: MMDLoadResult) => resolve(result),
          undefined,
          (error: unknown) => reject(toError(error)),
        );
      });

      const hasBoneAnimation = loaded.animation.tracks.some((track) => (
        track.name.includes('.bones[') && track.name.endsWith('.quaternion')
      ));
      if (!hasBoneAnimation) throw new Error('VMDに有効なボーンモーションがありません');

      helper = new MMDAnimationHelper({ sync: false, pmxAnimation: true });
      return bakeLoadedMmdMotion(loaded.mesh, loaded.animation, helper, { fps: this.fps });
    } finally {
      if (loaded != null) {
        helper?.remove?.(loaded.mesh);
        disposeMmdMesh(loaded.mesh);
      }
      URL.revokeObjectURL(animationUrl);
    }
  }
}
