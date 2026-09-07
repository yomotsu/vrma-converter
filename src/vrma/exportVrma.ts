import * as THREE from 'three';

import { HUMAN_BONES } from '../animation/rigMapping.ts';
import type { AnimationState, BoneName, TrackPath } from '../animation/types.js';

export type VrmaExportAnimation = Pick<
  AnimationState,
  'displayName' | 'restHipsY' | 'tracks' | 'expressionTracks' | 'lookAtTrack'
>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function exportFloatData(values: number[], binaryChunks: Array<{ offset: number; data: Uint8Array }>, stateRef: { length: number }): { offset: number; byteLength: number; count: number } {
  const alignedOffset = Math.ceil(stateRef.length / 4) * 4;
  const floatArray = new Float32Array(values);
  const bytes = new Uint8Array(floatArray.buffer);
  binaryChunks.push({ offset: alignedOffset, data: bytes });
  stateRef.length = alignedOffset + bytes.byteLength;
  return { offset: alignedOffset, byteLength: bytes.byteLength, count: values.length };
}

function samplesForVrmaTrack(track: THREE.KeyframeTrack): { times: number[]; values: number[] } {
  return { times: Array.from(track.times), values: Array.from(track.values) };
}

export function createVrmaBlob(animation: VrmaExportAnimation): Blob {
  const binaryChunks: Array<{ offset: number; data: Uint8Array }> = [];
  const binaryLength = { length: 0 };
  const bufferViews: Array<Record<string, unknown>> = [];
  const accessors: Array<Record<string, unknown>> = [];
  const samplers: Array<Record<string, unknown>> = [];
  const channels: Array<Record<string, unknown>> = [];
  const nodeIndices = new Map<BoneName, number>();
  const translationScale = animation.restHipsY > 0.0001 ? 1 / animation.restHipsY : 1;

  const nodes: Array<{ name: string; translation: number[]; rotation?: number[] }> = HUMAN_BONES.map((bone, index) => {
    nodeIndices.set(bone, index);
    return {
      name: bone,
      translation: bone === 'hips' ? [0, 1, 0] : [0, 0, 0],
    };
  });
  const humanBones: Record<string, { node: number }> = {};
  nodeIndices.forEach((node, bone) => { humanBones[bone] = { node }; });

  const expressionNodeIndices = new Map<string, number>();
  const expressionNodes: Array<{ name: string; translation: number[]; rotation?: number[] }> = [];
  const addExpressionNode = (group: 'preset' | 'custom', name: string): number => {
    const key = `${group}:${name}`;
    const existing = expressionNodeIndices.get(key);
    if (existing != null) return existing;
    const node = nodes.length + expressionNodes.length;
    expressionNodeIndices.set(key, node);
    expressionNodes.push({ name: `expression:${group}:${name}`, translation: [0, 0, 0] });
    return node;
  };

  const presetExpressions: Record<string, { node: number }> = {};
  animation.expressionTracks.preset.forEach((_track, name) => {
    presetExpressions[name] = { node: addExpressionNode('preset', name) };
  });
  const customExpressions: Record<string, { node: number }> = {};
  animation.expressionTracks.custom.forEach((_track, name) => {
    customExpressions[name] = { node: addExpressionNode('custom', name) };
  });
  nodes.push(...expressionNodes);
  const lookAtNodeIndex = animation.lookAtTrack == null
    ? null
    : nodes.push({ name: 'lookAt', translation: [0, 0, 0], rotation: [0, 0, 0, 1] }) - 1;

  const addTrack = (bone: BoneName, path: TrackPath, track: THREE.KeyframeTrack): void => {
    const samples = samplesForVrmaTrack(track);
    const values = samples.values;
    const times = samples.times;
    if (times.length === 0) return;
    const outputSize = path === 'rotation' ? 4 : 3;
    const outputValues: number[] = [];
    for (let index = 0; index < times.length; index += 1) {
      const sample = values.slice(index * outputSize, index * outputSize + outputSize);
      if (path === 'rotation') {
        const quaternion = new THREE.Quaternion().fromArray(sample as [number, number, number, number]).normalize();
        outputValues.push(...quaternion.toArray());
      } else {
        outputValues.push(...sample.map((value) => value * (bone === 'hips' ? translationScale : 1)));
      }
    }
    const input = exportFloatData(times, binaryChunks, binaryLength);
    const output = exportFloatData(outputValues, binaryChunks, binaryLength);
    const inputView = bufferViews.push({ buffer: 0, byteOffset: input.offset, byteLength: input.byteLength }) - 1;
    const outputView = bufferViews.push({ buffer: 0, byteOffset: output.offset, byteLength: output.byteLength }) - 1;
    const inputAccessor = accessors.push({
      bufferView: inputView,
      componentType: 5126,
      count: times.length,
      type: 'SCALAR',
      min: [Math.min(...times)],
      max: [Math.max(...times)],
    }) - 1;
    const outputAccessor = accessors.push({
      bufferView: outputView,
      componentType: 5126,
      count: times.length,
      type: path === 'rotation' ? 'VEC4' : 'VEC3',
    }) - 1;
    const samplerIndex = samplers.push({ input: inputAccessor, output: outputAccessor, interpolation: 'LINEAR' }) - 1;
    channels.push({ sampler: samplerIndex, target: { node: nodeIndices.get(bone), path: path === 'rotation' ? 'rotation' : 'translation' } });
  };

  animation.tracks.forEach((trackSet, bone) => {
    const rotation = trackSet.rotation;
    if (rotation != null) addTrack(bone, 'rotation', rotation);
    const translation = trackSet.translation;
    if (translation != null && bone === 'hips') addTrack(bone, 'translation', translation);
  });

  const addExpressionTrack = (
    group: 'preset' | 'custom',
    name: string,
    track: THREE.NumberKeyframeTrack,
  ): void => {
    const node = expressionNodeIndices.get(`${group}:${name}`);
    const times = Array.from(track.times);
    if (node == null || times.length === 0) return;
    const values = Array.from(track.values).map((value) => clamp(value, 0, 1));
    const outputValues: number[] = [];
    values.forEach((value) => outputValues.push(value, 0, 0));
    const input = exportFloatData(times, binaryChunks, binaryLength);
    const output = exportFloatData(outputValues, binaryChunks, binaryLength);
    const inputView = bufferViews.push({ buffer: 0, byteOffset: input.offset, byteLength: input.byteLength }) - 1;
    const outputView = bufferViews.push({ buffer: 0, byteOffset: output.offset, byteLength: output.byteLength }) - 1;
    const inputAccessor = accessors.push({
      bufferView: inputView,
      componentType: 5126,
      count: times.length,
      type: 'SCALAR',
      min: [Math.min(...times)],
      max: [Math.max(...times)],
    }) - 1;
    const outputAccessor = accessors.push({
      bufferView: outputView,
      componentType: 5126,
      count: times.length,
      type: 'VEC3',
      min: [Math.min(...values), 0, 0],
      max: [Math.max(...values), 0, 0],
    }) - 1;
    const samplerIndex = samplers.push({ input: inputAccessor, output: outputAccessor, interpolation: 'LINEAR' }) - 1;
    channels.push({ sampler: samplerIndex, target: { node, path: 'translation' } });
  };

  animation.expressionTracks.preset.forEach((track, name) => {
    addExpressionTrack('preset', name, track);
  });
  animation.expressionTracks.custom.forEach((track, name) => {
    addExpressionTrack('custom', name, track);
  });

  if (lookAtNodeIndex != null && animation.lookAtTrack != null && animation.lookAtTrack.times.length > 0) {
    const times = Array.from(animation.lookAtTrack.times);
    const values = Array.from(animation.lookAtTrack.values);
    const outputValues: number[] = [];
    for (let index = 0; index < times.length; index += 1) {
      const quaternion = new THREE.Quaternion()
        .fromArray(values.slice(index * 4, index * 4 + 4) as [number, number, number, number])
        .normalize();
      outputValues.push(...quaternion.toArray());
    }
    const input = exportFloatData(times, binaryChunks, binaryLength);
    const output = exportFloatData(outputValues, binaryChunks, binaryLength);
    const inputView = bufferViews.push({ buffer: 0, byteOffset: input.offset, byteLength: input.byteLength }) - 1;
    const outputView = bufferViews.push({ buffer: 0, byteOffset: output.offset, byteLength: output.byteLength }) - 1;
    const inputAccessor = accessors.push({
      bufferView: inputView,
      componentType: 5126,
      count: times.length,
      type: 'SCALAR',
      min: [Math.min(...times)],
      max: [Math.max(...times)],
    }) - 1;
    const outputAccessor = accessors.push({
      bufferView: outputView,
      componentType: 5126,
      count: times.length,
      type: 'VEC4',
    }) - 1;
    const samplerIndex = samplers.push({ input: inputAccessor, output: outputAccessor, interpolation: 'LINEAR' }) - 1;
    channels.push({ sampler: samplerIndex, target: { node: lookAtNodeIndex, path: 'rotation' } });
  }

  const vrmaExtension: {
    specVersion: string;
    humanoid: { humanBones: Record<string, { node: number }> };
    expressions?: { preset: Record<string, { node: number }>; custom: Record<string, { node: number }> };
    lookAt?: { node: number };
  } = {
    specVersion: '1.0',
    humanoid: { humanBones },
  };
  if (Object.keys(presetExpressions).length > 0 || Object.keys(customExpressions).length > 0) {
    vrmaExtension.expressions = { preset: presetExpressions, custom: customExpressions };
  }
  if (lookAtNodeIndex != null && animation.lookAtTrack != null && animation.lookAtTrack.times.length > 0) {
    vrmaExtension.lookAt = { node: lookAtNodeIndex };
  }

  const binary = new Uint8Array(binaryLength.length);
  binaryChunks.forEach(({ offset, data }) => binary.set(data, offset));
  const gltf = {
    asset: { version: '2.0', generator: 'VRMA Converter' },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, index) => index) }],
    nodes,
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews,
    accessors,
    animations: [{ name: animation.displayName, samplers, channels }],
    extensionsUsed: ['VRMC_vrm_animation'],
    extensions: { VRMC_vrm_animation: vrmaExtension },
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(gltf));
  const paddedJsonLength = Math.ceil(jsonBytes.byteLength / 4) * 4;
  const paddedBinaryLength = Math.ceil(binary.byteLength / 4) * 4;
  const totalLength = 12 + 8 + paddedJsonLength + 8 + paddedBinaryLength;
  const glb = new ArrayBuffer(totalLength);
  const view = new DataView(glb);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  let offset = 12;
  view.setUint32(offset, paddedJsonLength, true);
  view.setUint32(offset + 4, 0x4e4f534a, true);
  new Uint8Array(glb, offset + 8, jsonBytes.byteLength).set(jsonBytes);
  new Uint8Array(glb, offset + 8 + jsonBytes.byteLength, paddedJsonLength - jsonBytes.byteLength).fill(0x20);
  offset += 8 + paddedJsonLength;
  view.setUint32(offset, paddedBinaryLength, true);
  view.setUint32(offset + 4, 0x004e4942, true);
  new Uint8Array(glb, offset + 8, binary.byteLength).set(binary);
  return new Blob([glb], { type: 'model/gltf-binary' });
}
