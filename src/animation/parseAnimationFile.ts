import * as THREE from 'three';
import { BVHLoader } from 'three/examples/jsm/loaders/BVHLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import type { VRM } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin } from '@pixiv/three-vrm-animation';
import type { VRMAnimation } from '@pixiv/three-vrm-animation';

import { isDazFriendlyBvh, retargetDazBvhClip } from './bvhParser.ts';
import { retargetGenericClip } from './genericParser.ts';
import { retargetMixamoClip } from './mixamoParser.ts';
import { detectAnimationRig } from './rigMapping.ts';
import type { AnimationRigType } from './rigMapping.ts';
import { emptyExpressionTrackSet } from './trackUtils.ts';
import type { LoadedClip } from './types.ts';
import { retargetUniversalClip } from './universalParser.ts';
import { tracksFromVrma } from './vrmaParser.ts';

export const SUPPORTED_ANIMATION_FORMATS = ['vrma', 'glb', 'gltf', 'fbx', 'bvh'] as const;

export type AnimationFileParserOptions = {
  chooseFbxRigType?: (fileName: string) => Promise<AnimationRigType | null>;
};

const gltfLoader = new GLTFLoader();
gltfLoader.crossOrigin = 'anonymous';
gltfLoader.register((parser) => new VRMLoaderPlugin(parser));
gltfLoader.register((parser) => new VRMAnimationLoaderPlugin(parser));
const fbxLoader = new FBXLoader();
const bvhLoader = new BVHLoader();

export function isSupportedAnimationFormat(format: string): boolean {
  return (SUPPORTED_ANIMATION_FORMATS as readonly string[]).includes(format.toLowerCase());
}

function extensionOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function estimateFps(clip: THREE.AnimationClip, duration: number): number {
  const firstTrack = clip.tracks[0];
  if (firstTrack == null || duration <= 0) return 30;
  for (let index = 1; index < firstTrack.times.length; index += 1) {
    const frameInterval = firstTrack.times[index] - firstTrack.times[index - 1];
    if (frameInterval > 0.000001) return clamp(Math.round(1 / frameInterval), 1, 240);
  }
  return clamp(Math.round(firstTrack.times.length / duration), 1, 240);
}

function labelForClip(clip: THREE.AnimationClip | undefined, index: number): string {
  const name = clip?.name?.trim();
  return name != null && name.length > 0 && name !== 'animation' ? name : `Take ${Math.max(0, Math.round(index + 1))}`;
}

export async function parseAnimationFile(
  file: File,
  targetVrm: VRM | null,
  options?: AnimationFileParserOptions,
): Promise<LoadedClip[]> {
  const format = extensionOf(file.name);
  const url = URL.createObjectURL(file);
  try {
    if (format === 'fbx') {
      const source = await fbxLoader.loadAsync(url);
      if (source.animations.length === 0) throw new Error('FBX にアニメーションクリップがありません');
      const rigType = detectAnimationRig(source) ?? await options?.chooseFbxRigType?.(file.name);
      if (rigType == null) throw new Error('FBX のリグ形式の選択をキャンセルしました');
      return source.animations.map((clip, index) => {
        const retargeted = rigType === 'mixamo'
          ? retargetMixamoClip(source, clip, targetVrm)
          : retargetUniversalClip(source, clip, targetVrm);
        return {
          tracks: retargeted.tracks,
          expressionTracks: emptyExpressionTrackSet(),
          lookAtTrack: null,
          duration: clip.duration,
          sourceFps: estimateFps(clip, clip.duration),
          restHipsY: retargeted.restHipsY,
          clipName: labelForClip(clip, index),
          compatible: retargeted.tracks.size > 0,
        };
      });
    }
    if (format === 'bvh') {
      const result = bvhLoader.parse(new TextDecoder().decode(await file.arrayBuffer()));
      const clip = result.clip;
      if (clip == null) throw new Error('BVH にアニメーションデータがありません');
      const dazFriendly = isDazFriendlyBvh(result.skeleton);
      const retargeted = dazFriendly ? retargetDazBvhClip(result.skeleton, clip, targetVrm) : null;
      const tracks = retargeted?.tracks ?? retargetGenericClip(clip);
      return [{
        tracks,
        expressionTracks: emptyExpressionTrackSet(),
        lookAtTrack: null,
        duration: clip.duration,
        sourceFps: estimateFps(clip, clip.duration),
        restHipsY: retargeted?.restHipsY ?? 1,
        clipName: labelForClip(clip, 0),
        compatible: tracks.size > 0,
      }];
    }
    const gltf = await gltfLoader.loadAsync(url);
    const vrmAnimations = (gltf.userData as { vrmAnimations?: VRMAnimation[] }).vrmAnimations;
    if (vrmAnimations != null && vrmAnimations.length > 0) {
      return vrmAnimations.map((animation, index) => {
        const clip = gltf.animations[index];
        const loadedTracks = tracksFromVrma(animation);
        return {
          tracks: loadedTracks.tracks,
          expressionTracks: loadedTracks.expressionTracks,
          lookAtTrack: loadedTracks.lookAtTrack,
          duration: animation.duration || clip?.duration || 0,
          sourceFps: clip == null ? 30 : estimateFps(clip, animation.duration || clip.duration),
          restHipsY: Math.abs(animation.restHipsPosition.y) || 1,
          clipName: labelForClip(clip, index),
          compatible: loadedTracks.tracks.size > 0 || loadedTracks.expressionTracks.preset.size > 0 || loadedTracks.expressionTracks.custom.size > 0,
        };
      });
    }
    if (gltf.animations.length === 0) throw new Error('GLB / GLTF にアニメーションクリップがありません');
    const rigType = detectAnimationRig(gltf.scene);
    return gltf.animations.map((clip, index) => {
      const retargeted = rigType === 'mixamo'
        ? retargetMixamoClip(gltf.scene, clip, targetVrm)
        : rigType === 'universal'
          ? retargetUniversalClip(gltf.scene, clip, targetVrm)
          : null;
      const tracks = retargeted?.tracks ?? retargetGenericClip(clip);
      return {
        tracks,
        expressionTracks: emptyExpressionTrackSet(),
        lookAtTrack: null,
        duration: clip.duration,
        sourceFps: estimateFps(clip, clip.duration),
        restHipsY: retargeted?.restHipsY ?? 1,
        clipName: labelForClip(clip, index),
        compatible: tracks.size > 0,
      };
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
