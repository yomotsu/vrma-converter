import * as THREE from 'three';
import type { BoneName, BakeSettings, ExpressionTrackSet, MotionTrackSet, TrackPath } from './types.js';

const MIN_BAKE_FPS = 1;
const MAX_BAKE_FPS = 240;
const DEFAULT_BAKE_FPS = 30;
const MIN_BAKE_FRAME_STEP = 1;
const MAX_BAKE_FRAME_STEP = 120;

export function setTrack(set: MotionTrackSet, bone: BoneName, path: TrackPath, track: THREE.KeyframeTrack): void {
  const current = set.get(bone) ?? {};
  current[path] = track;
  set.set(bone, current);
}

export function cloneTrackSet(source: MotionTrackSet): MotionTrackSet {
  const clone: MotionTrackSet = new Map();
  source.forEach((tracks, bone) => {
    const next: Partial<Record<TrackPath, THREE.KeyframeTrack>> = {};
    if (tracks.rotation != null) next.rotation = tracks.rotation.clone();
    if (tracks.translation != null) next.translation = tracks.translation.clone();
    clone.set(bone, next);
  });
  return clone;
}

export function emptyExpressionTrackSet(): ExpressionTrackSet {
  return { preset: new Map(), custom: new Map() };
}

export function cloneExpressionTrackSet(source: ExpressionTrackSet): ExpressionTrackSet {
  const clone = emptyExpressionTrackSet();
  source.preset.forEach((track, name) => clone.preset.set(name, track.clone()));
  source.custom.forEach((track, name) => clone.custom.set(name, track.clone()));
  return clone;
}

export function makeQuaternionTrack(name: string, times: number[], values: number[]): THREE.QuaternionKeyframeTrack {
  return new THREE.QuaternionKeyframeTrack(name, times, values);
}

export function continuousQuaternionValues(values: number[]): number[] {
  const continuous: number[] = [];
  let previous: THREE.Quaternion | null = null;
  for (let index = 0; index + 3 < values.length; index += 4) {
    const quaternion = new THREE.Quaternion().fromArray(values.slice(index, index + 4) as [number, number, number, number]);
    if (quaternion.lengthSq() < 0.000000000001) quaternion.identity();
    else quaternion.normalize();
    if (previous != null && previous.dot(quaternion) < 0) quaternion.set(-quaternion.x, -quaternion.y, -quaternion.z, -quaternion.w);
    continuous.push(...quaternion.toArray().map((value) => Object.is(value, -0) ? 0 : value));
    previous = quaternion;
  }
  return continuous;
}

export function makeContinuousQuaternionTrack(name: string, times: number[], values: number[]): THREE.QuaternionKeyframeTrack {
  return new THREE.QuaternionKeyframeTrack(name, times, continuousQuaternionValues(values));
}

export function makeVectorTrack(name: string, times: number[], values: number[]): THREE.VectorKeyframeTrack {
  return new THREE.VectorKeyframeTrack(name, times, values);
}

export function normalizeBakeFps(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BAKE_FPS;
  return Math.round(Math.max(MIN_BAKE_FPS, Math.min(MAX_BAKE_FPS, value)));
}

export function maxBakeFrameStepForFps(fps: number): number {
  return Math.max(MIN_BAKE_FRAME_STEP, Math.min(MAX_BAKE_FRAME_STEP, Math.floor(normalizeBakeFps(fps))));
}

export function fixedBakeTimes(duration: number, fps: number, frameStep: number, preservedTimes: number[] = []): number[] {
  const safeDuration = Math.max(0, duration);
  const safeFps = normalizeBakeFps(fps);
  const safeDivisionCount = Math.round(Math.max(MIN_BAKE_FRAME_STEP, Math.min(maxBakeFrameStepForFps(safeFps), frameStep)));
  if (safeDuration <= 0) return [0];
  const frameInterval = safeFps / safeDivisionCount;
  const stepCount = Math.floor((safeDuration * safeFps + 0.000001) / frameInterval);
  const times = Array.from({ length: stepCount + 1 }, (_, index) => Math.min(safeDuration, Number(((index * frameInterval) / safeFps).toFixed(6))));
  const preserved = preservedTimes
    .filter((time) => Number.isFinite(time))
    .map((time) => Math.max(0, Math.min(safeDuration, time)))
    .map((time) => Number(time.toFixed(6)));
  preserved.push(Number(safeDuration.toFixed(6)));
  return Array.from(new Set([...times, ...preserved])).sort((a, b) => a - b);
}

function preserveTrackInterpolation(source: THREE.KeyframeTrack, baked: THREE.KeyframeTrack): void {
  const interpolation = source.getInterpolation();
  if (interpolation === THREE.InterpolateDiscrete || interpolation === THREE.InterpolateLinear || interpolation === THREE.InterpolateSmooth) {
    baked.setInterpolation(interpolation);
  }
}

export function sampleTrack(track: THREE.KeyframeTrack, duration: number, settings: BakeSettings, path: TrackPath): THREE.KeyframeTrack {
  const lastTime = track.times[track.times.length - 1];
  const times = fixedBakeTimes(duration, settings.fps, settings.frameStep, lastTime == null ? [] : [lastTime]);
  const size = track.getValueSize();
  const trackWithInterpolant = track as THREE.KeyframeTrack & { createInterpolant: (result: Float32Array) => { evaluate: (time: number) => ArrayLike<number> } };
  const interpolant = trackWithInterpolant.createInterpolant(new Float32Array(size));
  const values: number[] = [];
  times.forEach((time) => values.push(...Array.from(interpolant.evaluate(time))));
  const baked = path === 'rotation'
    ? makeContinuousQuaternionTrack(track.name, times, values)
    : makeVectorTrack(track.name, times, values);
  preserveTrackInterpolation(track, baked);
  return baked;
}

export function sampleNumberTrack(track: THREE.NumberKeyframeTrack, duration: number, settings: BakeSettings): THREE.NumberKeyframeTrack {
  const lastTime = track.times[track.times.length - 1];
  const times = fixedBakeTimes(duration, settings.fps, settings.frameStep, lastTime == null ? [] : [lastTime]);
  const trackWithInterpolant = track as THREE.NumberKeyframeTrack & { createInterpolant: (result: Float32Array) => { evaluate: (time: number) => ArrayLike<number> } };
  const interpolant = trackWithInterpolant.createInterpolant(new Float32Array(1));
  const values = times.map((time) => Number(interpolant.evaluate(time)[0] ?? 0));
  const baked = new THREE.NumberKeyframeTrack(track.name, times, values);
  preserveTrackInterpolation(track, baked);
  return baked;
}

export function processTracks(source: MotionTrackSet, duration: number, bakeSettings: BakeSettings | null): MotionTrackSet {
  const processed: MotionTrackSet = new Map();
  source.forEach((trackSet, bone) => {
    const next: Partial<Record<TrackPath, THREE.KeyframeTrack>> = {};
    (['rotation', 'translation'] as TrackPath[]).forEach((path) => {
      const original = trackSet[path];
      if (original == null) return;
      next[path] = bakeSettings == null ? original.clone() : sampleTrack(original, duration, bakeSettings, path);
    });
    processed.set(bone, next);
  });
  return processed;
}

export function processExpressionTracks(source: ExpressionTrackSet, duration: number, bakeSettings: BakeSettings | null): ExpressionTrackSet {
  const processed = emptyExpressionTrackSet();
  const process = (original: THREE.NumberKeyframeTrack): THREE.NumberKeyframeTrack => bakeSettings == null ? original.clone() : sampleNumberTrack(original, duration, bakeSettings);
  source.preset.forEach((track, name) => processed.preset.set(name, process(track)));
  source.custom.forEach((track, name) => processed.custom.set(name, process(track)));
  return processed;
}

export function scaleTrackTimes(track: THREE.KeyframeTrack, multiplier: number): THREE.KeyframeTrack {
  const scaled = track.clone();
  scaled.times = Float32Array.from(track.times, (time) => time / multiplier);
  return scaled;
}

export function scaleTrackSetTimes(source: MotionTrackSet, multiplier: number): MotionTrackSet {
  const scaled: MotionTrackSet = new Map();
  source.forEach((tracks, bone) => {
    const next: Partial<Record<TrackPath, THREE.KeyframeTrack>> = {};
    if (tracks.rotation != null) next.rotation = scaleTrackTimes(tracks.rotation, multiplier);
    if (tracks.translation != null) next.translation = scaleTrackTimes(tracks.translation, multiplier);
    scaled.set(bone, next);
  });
  return scaled;
}

export function scaleExpressionTrackSetTimes(source: ExpressionTrackSet, multiplier: number): ExpressionTrackSet {
  const scaled = emptyExpressionTrackSet();
  source.preset.forEach((track, name) => scaled.preset.set(name, scaleTrackTimes(track, multiplier) as THREE.NumberKeyframeTrack));
  source.custom.forEach((track, name) => scaled.custom.set(name, scaleTrackTimes(track, multiplier) as THREE.NumberKeyframeTrack));
  return scaled;
}
