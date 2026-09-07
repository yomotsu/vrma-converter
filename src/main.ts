import './style.css';

import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { VRMLookAtQuaternionProxy } from '@pixiv/three-vrm-animation';
import defaultVrmUrl from '../assets/model.vrm?url';
import defaultMmdModelUrl from '../assets/mobuko.pmx?url';
import {
  createMmdPreviewController,
  MMD_PREVIEW_ENABLED,
  MMDMotionBaker,
  MMDPlayer,
  retargetMmdMotion,
} from './mmd/index.js';
import type { MMDMotionBakeResult } from './mmd/index.js';
import type { AnimationState, BoneName, BakeSettings, ExpressionTrackSet, LoadedClip, MotionTrackSet } from './animation/types.js';
import { HUMAN_BONES } from './animation/rigMapping.js';
import type { AnimationRigType } from './animation/rigMapping.js';
import { isSupportedAnimationFormat, parseAnimationFile } from './animation/parseAnimationFile.js';
import { createPreviewAnimation } from './animation/previewAnimation.js';
import { createVrmaBlob } from './vrma/exportVrma.js';
import { displayFormatForImport } from './animation/displayFormat.js';
import { dom } from './ui/dom.js';
import { installAlwaysVisibleScrollbars } from './ui/scrollbars.js';
import { allAnimationKeyTimes, createTimelineController } from './ui/timeline.js';
import { createStage } from './viewer/stage.js';
import type { ModelState } from './viewer/stage.js';
import {
  cloneExpressionTrackSet,
  cloneTrackSet,
  emptyExpressionTrackSet,
  fixedBakeTimes,
  makeQuaternionTrack,
  makeVectorTrack,
  maxBakeFrameStepForFps,
  normalizeBakeFps,
  processExpressionTracks,
  processTracks,
  sampleTrack,
  scaleExpressionTrackSetTimes,
  scaleTrackTimes,
  scaleTrackSetTimes,
  setTrack,
} from './animation/trackUtils.js';

type ExpressionPresetName = Parameters<ExpressionTrackSet['preset']['set']>[0];

const MIN_BAKE_FPS = 1;
const MAX_BAKE_FPS = 240;
const DEFAULT_BAKE_FPS = 30;
const MIN_BAKE_FRAME_STEP = 1;
const MAX_BAKE_FRAME_STEP = 120;
const TIMELINE_AUTO_SCROLL_EDGE = 48;
const TIMELINE_AUTO_SCROLL_MAX_SPEED = 14;

const clock = new THREE.Clock();
const stage = createStage(dom);
dom.overlayCanvas.hidden = !MMD_PREVIEW_ENABLED;
const mmdPlayer = MMD_PREVIEW_ENABLED
  ? new MMDPlayer(dom.overlayCanvas, { modelUrl: defaultMmdModelUrl })
  : null;
const mmdPreview = createMmdPreviewController(MMD_PREVIEW_ENABLED, mmdPlayer);
const mmdBaker = new MMDMotionBaker({ modelUrl: defaultMmdModelUrl, fps: 30 });

const state: {
  model: ModelState | null;
  animations: AnimationState[];
  animation: AnimationState | null;
  mixer: THREE.AnimationMixer | null;
  action: THREE.AnimationAction | null;
  isPlaying: boolean;
  time: number;
  speedMultiplier: number;
  bakeFps: number;
  bakeFrameStep: number;
  zoom: number;
  transformsExpanded: boolean;
  lastUiUpdate: number;
  toastTimer: number | undefined;
} = {
  model: null,
  animations: [],
  animation: null,
  mixer: null,
  action: null,
  isPlaying: true,
  time: 0,
  speedMultiplier: 1,
  bakeFps: DEFAULT_BAKE_FPS,
  bakeFrameStep: MIN_BAKE_FRAME_STEP,
  zoom: 1,
  transformsExpanded: false,
  lastUiUpdate: 0,
  toastTimer: undefined,
};

const timeline = createTimelineController(dom, {
  getAnimation: () => state.animation,
  getTime: () => state.time,
  getZoom: () => state.zoom,
  getTransformsExpanded: () => state.transformsExpanded,
});

function showToast(message: string): void {
  dom.toastMessage.textContent = message;
  dom.toast.classList.add('visible');
  if (state.toastTimer !== undefined) window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => dom.toast.classList.remove('visible'), 2800);
}

function setLoading(visible: boolean, label = 'LOADING ASSET'): void {
  dom.loading.hidden = !visible;
  dom.loadingLabel.textContent = label;
}

function formatSeconds(seconds: number, decimals = 2): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60).toString().padStart(2, '0');
  const remaining = (safe % 60).toFixed(decimals).padStart(decimals + 3, '0');
  return `${minutes}:${remaining}`;
}

function formatTimelineSecond(seconds: number): string {
  const rounded = Math.round(Math.max(0, seconds) * 100) / 100;
  const value = Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return `${value}s`;
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatFrame(frame: number): string {
  return Math.max(0, Math.round(frame)).toString();
}

function withoutExtension(name: string): string {
  return name.replace(/\.[^/.]+$/, '');
}

function extensionOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

async function loadVrmUrl(url: string, name: string, source: ModelState['source'], objectUrl?: string): Promise<void> {
  const previousModel = state.model;
  setLoading(true, 'LOADING VRM AVATAR');
  try {
    const nextModel = await stage.loadVrmUrl(url, name, source, objectUrl, previousModel);
    if (state.mixer != null) {
      state.mixer.stopAllAction();
      state.mixer = null;
      state.action = null;
    }
    stage.replaceModel(nextModel, previousModel);
    state.model = nextModel;
    rebuildAction();
    updateInterface();
    showToast(`${name} をアバターとして読み込みました`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'VRM の読み込みに失敗しました';
    showToast(message);
    throw error;
  } finally {
    setLoading(false);
  }
}

function chooseFbxRigType(fileName: string): Promise<AnimationRigType | null> {
  dom.fbxRigFileName.textContent = fileName;
  dom.fbxRigDialog.returnValue = '';
  return new Promise((resolve) => {
    const handleClose = (): void => {
      const value = dom.fbxRigDialog.returnValue;
      resolve(value === 'mixamo' || value === 'universal' ? value : null);
    };
    dom.fbxRigDialog.addEventListener('close', handleClose, { once: true });
    dom.fbxRigDialog.showModal();
  });
}

function copyTrackInterpolation(source: THREE.KeyframeTrack, target: THREE.KeyframeTrack): void {
  const interpolation = source.getInterpolation();
  if (interpolation === THREE.InterpolateDiscrete || interpolation === THREE.InterpolateLinear || interpolation === THREE.InterpolateSmooth) {
    target.setInterpolation(interpolation);
  }
}

function setBakeSettings(fpsValue: number, frameStepValue: number): void {
  if (!Number.isFinite(fpsValue) || !Number.isFinite(frameStepValue)) return;
  const fps = normalizeBakeFps(fpsValue);
  const frameStep = Math.round(clamp(frameStepValue, MIN_BAKE_FRAME_STEP, maxBakeFrameStepForFps(fps)));
  state.bakeFps = fps;
  state.bakeFrameStep = frameStep;
  dom.bakeFps.value = fps.toString();
  dom.bakeFrameStep.max = maxBakeFrameStepForFps(fps).toString();
  dom.bakeFrameStepNumber.max = maxBakeFrameStepForFps(fps).toString();
  dom.bakeFrameStep.value = frameStep.toString();
  dom.bakeFrameStepNumber.value = frameStep.toString();
  const animation = state.animation;
  if (animation == null || !animation.compatible) return;
  animation.bakePreview = { fps, frameStep };
  processCurrentTracks();
}

function initialBakeFpsFor(animation: AnimationState): number {
  return normalizeBakeFps(animation.sourceFps);
}

function setBakeFrameStepValue(value: number): void {
  if (!Number.isFinite(value)) return;
  setBakeSettings(state.bakeFps, value);
}

function targetNodeFor(bone: BoneName): THREE.Object3D | null {
  return state.model?.bones[bone] ?? null;
}

function createTargetClip(animation: AnimationState): THREE.AnimationClip {
  const outputTracks: THREE.KeyframeTrack[] = [];
  const metaVersion = state.model?.vrm?.meta.metaVersion;
  let translationScale = 1;
  if (animation.restHipsY > 0.0001 && state.model?.vrm != null) {
    const normalizedRest = state.model.vrm.humanoid.normalizedRestPose.hips?.position?.[1] ?? 1;
    translationScale = normalizedRest / animation.restHipsY;
  }
  animation.tracks.forEach((trackSet, bone) => {
    const target = targetNodeFor(bone);
    if (target == null) return;
    const rotation = trackSet.rotation;
    if (rotation != null) {
      const values = Array.from(rotation.values).map((value, index) => metaVersion === '0' && (index % 4 === 0 || index % 4 === 2) ? -value : value);
      const outputTrack = new THREE.QuaternionKeyframeTrack(`${target.name}.quaternion`, Array.from(rotation.times), values);
      copyTrackInterpolation(rotation, outputTrack);
      outputTracks.push(outputTrack);
    }
    const translation = trackSet.translation;
    if (translation != null && bone === 'hips') {
      const values = Array.from(translation.values).map((value, index) => {
        const flipped = metaVersion === '0' && index % 3 !== 1 ? -value : value;
        return flipped * translationScale;
      });
      const outputTrack = new THREE.VectorKeyframeTrack(`${target.name}.position`, Array.from(translation.times), values);
      copyTrackInterpolation(translation, outputTrack);
      outputTracks.push(outputTrack);
    }
  });

  const expressionManager = state.model?.vrm?.expressionManager;
  if (expressionManager != null) {
    const appendExpressionTrack = (name: string, sourceTrack: THREE.NumberKeyframeTrack): void => {
      const trackName = expressionManager.getExpressionTrackName(name);
      if (trackName == null) return;
      const track = sourceTrack.clone();
      track.name = trackName;
      outputTracks.push(track);
    };
    animation.expressionTracks.preset.forEach((track, name) => appendExpressionTrack(name, track));
    animation.expressionTracks.custom.forEach((track, name) => appendExpressionTrack(name, track));
  }

  const vrm = state.model?.vrm;
  if (vrm?.lookAt != null && animation.lookAtTrack != null) {
    const proxy = vrm.scene.children.find((object) => object instanceof VRMLookAtQuaternionProxy);
    if (proxy != null) {
      const track = animation.lookAtTrack.clone();
      track.name = `${proxy.name}.quaternion`;
      outputTracks.push(track);
    }
  }
  return new THREE.AnimationClip(animation.displayName, animation.duration, outputTracks);
}

function rebuildAction(): void {
  if (state.model == null || state.animation == null) return;
  if (state.mixer != null) state.mixer.stopAllAction();
  state.mixer = new THREE.AnimationMixer(state.model.root);
  // Keyframe density must not change the playback clock. The animation always
  // runs across the original clip duration at the explicit playback rate.
  state.mixer.timeScale = 1;
  const clip = createTargetClip(state.animation);
  state.action = state.mixer.clipAction(clip);
  state.action.setLoop(THREE.LoopRepeat, Infinity);
  state.action.clampWhenFinished = false;
  state.action.setEffectiveTimeScale(1);
  state.action.play();
  state.mixer.setTime(state.time);
  if (!state.isPlaying) state.action.paused = true;
}

function loadedClipFromMmdBake(result: MMDMotionBakeResult, targetVrm: VRM | null): LoadedClip {
  const available = targetVrm == null
    ? undefined
    : new Set(HUMAN_BONES.filter((bone) => targetVrm.humanoid.getNormalizedBoneNode(bone as never) != null));
  const expressionManager = targetVrm?.expressionManager;
  const availableExpressions = targetVrm == null
    ? undefined
    : expressionManager == null
      ? { preset: new Set<string>(), custom: new Set<string>() }
      : {
        preset: new Set(Object.keys(expressionManager.presetExpressionMap)),
        custom: new Set(Object.keys(expressionManager.customExpressionMap)),
      };
  const retargeted = retargetMmdMotion(result, available, availableExpressions);
  const tracks: MotionTrackSet = new Map();
  const expressionTracks = emptyExpressionTrackSet();

  retargeted.rotationTracks.forEach((track, boneName) => {
    if (HUMAN_BONES.includes(boneName as BoneName)) {
      setTrack(tracks, boneName as BoneName, 'rotation', track);
    }
  });
  if (retargeted.translationTrack != null && tracks.has('hips')) {
    setTrack(tracks, 'hips', 'translation', retargeted.translationTrack);
  }
  retargeted.expressionTracks.preset.forEach((track, name) => {
    expressionTracks.preset.set(name as ExpressionPresetName, track);
  });
  retargeted.expressionTracks.custom.forEach((track, name) => {
    expressionTracks.custom.set(name, track);
  });

  return {
    tracks,
    expressionTracks,
    lookAtTrack: null,
    duration: result.duration,
    sourceFps: result.fps,
    restHipsY: retargeted.restHipsY,
    clipName: 'MMD Motion',
    compatible: tracks.size > 0 || expressionTracks.preset.size > 0 || expressionTracks.custom.size > 0,
  };
}

let animationSequence = 0;
let animationRequestSequence = 0;

function addLoadedAnimationClips(
  file: File,
  loadedClips: LoadedClip[],
  format: string,
  derivedFrom?: 'VMD',
): AnimationState[] {
  const clipCount = loadedClips.length;
  const addedAnimations: AnimationState[] = loadedClips.map((loaded, index) => ({
    id: `animation-${++animationSequence}`,
    name: file.name,
    displayName: withoutExtension(file.name),
    clipName: loaded.clipName,
    clipIndex: index,
    clipCount,
    format,
    derivedFrom,
    duration: Math.max(0.001, loaded.duration),
    sourceFps: loaded.sourceFps,
    restHipsY: loaded.restHipsY,
    originalTracks: cloneTrackSet(loaded.tracks),
    sourceTracks: cloneTrackSet(loaded.tracks),
    tracks: cloneTrackSet(loaded.tracks),
    originalExpressionTracks: cloneExpressionTrackSet(loaded.expressionTracks),
    sourceExpressionTracks: cloneExpressionTrackSet(loaded.expressionTracks),
    expressionTracks: cloneExpressionTrackSet(loaded.expressionTracks),
    originalLookAtTrack: loaded.lookAtTrack?.clone() ?? null,
    sourceLookAtTrack: loaded.lookAtTrack?.clone() ?? null,
    lookAtTrack: loaded.lookAtTrack?.clone() ?? null,
    source: 'file' as const,
    compatible: loaded.compatible,
    bakePreview: null,
    bakeApplied: false,
    originalDuration: Math.max(0.001, loaded.duration),
    appliedSpeedMultiplier: 1,
  }));

  state.animations.push(...addedAnimations);
  const firstAnimation = addedAnimations[0];
  if (firstAnimation != null) selectAnimation(firstAnimation.id);
  return addedAnimations;
}

function formatClipMeta(animation: AnimationState): string {
  const clipNumber = animation.clipCount > 1 ? ` · CLIP ${String(animation.clipIndex + 1).padStart(2, '0')}/${String(animation.clipCount).padStart(2, '0')}` : '';
  return `${animation.displayName} · ${animation.format}${clipNumber} · ${formatSeconds(animation.duration).slice(3)} SEC`;
}

function renderAnimationList(): void {
  dom.assetList.replaceChildren();
  state.animations.forEach((animation) => {
    const item = document.createElement('div');
    item.className = `asset-item${state.animation?.id === animation.id ? ' active' : ''}${animation.compatible ? '' : ' incompatible'}`;
    item.dataset.animationId = animation.id;
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.title = animation.source === 'preview' ? 'プレビューアニメーション' : `${animation.name} · ${animation.clipName}`;
    item.addEventListener('click', () => selectAnimation(animation.id));
    item.addEventListener('keydown', (event) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        const currentIndex = state.animations.findIndex((candidate) => candidate.id === animation.id);
        const direction = event.key === 'ArrowUp' ? -1 : 1;
        const nextIndex = clamp(currentIndex + direction, 0, state.animations.length - 1);
        if (currentIndex >= 0 && nextIndex !== currentIndex) {
          event.preventDefault();
          selectAnimation(state.animations[nextIndex].id);
        }
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectAnimation(animation.id);
      }
    });

    const type = document.createElement('span');
    type.className = 'asset-type';
    type.textContent = animation.source === 'preview' ? 'PRE' : animation.format;
    const copy = document.createElement('span');
    copy.className = 'asset-copy';
    const name = document.createElement('strong');
    name.textContent = animation.clipName;
    const meta = document.createElement('small');
    const derivedMeta = animation.derivedFrom === 'VMD' ? ' · IK + FACE BAKED' : '';
    meta.textContent = animation.source === 'preview'
      ? 'PREVIEW · 2.40 SEC'
      : `${formatClipMeta(animation)}${derivedMeta}${animation.compatible ? '' : ' · UNMAPPED'}`;
    copy.append(name, meta);
    item.append(type, copy);

    if (animation.source === 'preview') {
      const previewTag = document.createElement('span');
      previewTag.className = 'asset-more';
      previewTag.textContent = 'DEMO';
      item.append(previewTag);
    }
    const remove = document.createElement('button');
    remove.className = 'asset-delete';
    remove.type = 'button';
    remove.title = 'このアニメーションを削除';
    remove.setAttribute('aria-label', `${animation.clipName} を削除`);
    remove.textContent = '×';
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      removeAnimation(animation.id);
    });
    item.append(remove);
    dom.assetList.append(item);
  });
  if (state.animations.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'asset-empty';
    empty.textContent = 'モーションをドロップして追加';
    dom.assetList.append(empty);
  }
}

function focusSelectedAnimation(): void {
  dom.assetList.querySelector<HTMLElement>('.asset-item.active')?.focus();
}

function selectAnimation(id: string): void {
  const next = state.animations.find((animation) => animation.id === id);
  if (next == null) return;
  state.animation = next;
  state.bakeFps = initialBakeFpsFor(next);
  state.bakeFrameStep = MIN_BAKE_FRAME_STEP;
  state.speedMultiplier = next.appliedSpeedMultiplier;
  next.bakePreview = null;
  state.time = 0;
  state.isPlaying = true;
  processCurrentTracks();
  renderAnimationList();
  timeline.render();
  updateInterface();
  focusSelectedAnimation();
  if (!next.compatible) showToast(`${next.clipName} に対応する humanoid ボーンがありません`);
}

function removeAnimation(id: string): void {
  const index = state.animations.findIndex((animation) => animation.id === id);
  if (index < 0) return;
  const removed = state.animations[index];
  const wasSelected = state.animation?.id === id;
  state.animations.splice(index, 1);
  if (wasSelected) {
    const fallback = state.animations[index] ?? state.animations[index - 1] ?? state.animations[0] ?? null;
    if (fallback != null) {
      state.animation = fallback;
      state.bakeFps = initialBakeFpsFor(fallback);
      state.bakeFrameStep = MIN_BAKE_FRAME_STEP;
      state.speedMultiplier = fallback.appliedSpeedMultiplier;
      fallback.bakePreview = null;
      state.time = 0;
      state.isPlaying = true;
      processCurrentTracks();
    } else {
      state.animation = null;
      state.time = 0;
      state.speedMultiplier = 1;
      state.action?.stop();
      state.mixer = null;
      state.action = null;
    }
  }
  renderAnimationList();
  timeline.render();
  updateInterface();
  showToast(`${removed.clipName} を一覧から削除しました`);
}

async function handleAnimationFile(file: File): Promise<void> {
  const request = ++animationRequestSequence;
  const extension = extensionOf(file.name);
  if (extension === 'vmd') {
    const previewPromise = mmdPreview.playVmd?.(file);
    if (previewPromise != null) {
      void previewPromise.then(() => {
        if (request === animationRequestSequence) showToast(`${file.name} を MMD プレビューで再生しています`);
      }).catch((error: unknown) => {
        if (request === animationRequestSequence) {
          showToast(error instanceof Error ? error.message : 'VMD の読み込みに失敗しました');
        }
      });
    }
    setLoading(true, 'BAKING MMD IK TO FK');
    try {
      const baked = await mmdBaker.bakeVmd(file);
      if (request !== animationRequestSequence) return;
      const loaded = loadedClipFromMmdBake(baked, state.model?.vrm ?? null);
      if (!loaded.compatible) throw new Error('VMDから対応するボーンまたは表情を抽出できませんでした');
      loaded.clipName = withoutExtension(file.name);
      addLoadedAnimationClips(file, [loaded], displayFormatForImport(extension), 'VMD');
      showToast(`${file.name} をIK・表情変換してVRMA化しました`);
    } catch (error) {
      if (request === animationRequestSequence) {
        showToast(error instanceof Error ? error.message : 'VMDのIK・表情変換に失敗しました');
      }
    } finally {
      if (request === animationRequestSequence) setLoading(false);
    }
    return;
  }
  if (!isSupportedAnimationFormat(extension)) {
    setLoading(false);
    showToast('VRMA / GLB / GLTF / FBX / BVH / VMD を選択してください');
    return;
  }
  setLoading(true, 'RETARGETING MOTION');
  try {
    const loadedClips = await parseAnimationFile(file, state.model?.vrm ?? null, {
      chooseFbxRigType,
    });
    if (request !== animationRequestSequence) return;
    if (loadedClips.length === 0 || !loadedClips.some((clip) => clip.compatible)) throw new Error('対応する humanoid ボーンが見つかりませんでした');
    const addedAnimations = addLoadedAnimationClips(file, loadedClips, displayFormatForImport(extension));
    showToast(addedAnimations.length > 1
      ? `${file.name} · ${addedAnimations.length} clips を追加しました`
      : `${file.name} をリターゲットしました`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'アニメーションの変換に失敗しました';
    showToast(message);
  } finally {
    if (request === animationRequestSequence) setLoading(false);
  }
}

function processCurrentTracks(): void {
  if (state.animation == null) return;
  state.animation.tracks = processTracks(
    state.animation.sourceTracks,
    state.animation.duration,
    state.animation.bakePreview,
  );
  state.animation.expressionTracks = processExpressionTracks(
    state.animation.sourceExpressionTracks,
    state.animation.duration,
    state.animation.bakePreview,
  );
  state.animation.lookAtTrack = state.animation.sourceLookAtTrack == null
    ? null
    : state.animation.bakePreview == null
      ? state.animation.sourceLookAtTrack.clone()
      : sampleTrack(state.animation.sourceLookAtTrack, state.animation.duration, state.animation.bakePreview, 'rotation') as THREE.QuaternionKeyframeTrack;
  if (state.model != null) rebuildAction();
  setPlayState(state.isPlaying);
  timeline.render();
  updateInterface();
}

function formatSpeedMultiplier(multiplier: number): string {
  const rounded = Math.round(multiplier * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}×`;
}

function applySpeed(): void {
  const animation = state.animation;
  const multiplier = state.speedMultiplier;
  const appliedMultiplier = animation?.appliedSpeedMultiplier ?? 1;
  if (
    animation == null
    || !animation.compatible
    || animation.bakePreview != null
    || !Number.isFinite(multiplier)
    || multiplier <= 0
    || !Number.isFinite(appliedMultiplier)
    || appliedMultiplier <= 0
    || Math.abs(multiplier - appliedMultiplier) < 0.0001
  ) return;

  const relativeMultiplier = multiplier / appliedMultiplier;
  animation.sourceTracks = scaleTrackSetTimes(animation.sourceTracks, relativeMultiplier);
  animation.sourceExpressionTracks = scaleExpressionTrackSetTimes(animation.sourceExpressionTracks, relativeMultiplier);
  animation.sourceLookAtTrack = animation.sourceLookAtTrack == null
    ? null
    : scaleTrackTimes(animation.sourceLookAtTrack, relativeMultiplier) as THREE.QuaternionKeyframeTrack;
  animation.duration = Math.max(0.001, animation.duration / relativeMultiplier);
  animation.appliedSpeedMultiplier = multiplier;
  state.time = clamp(state.time, 0, animation.duration);
  processCurrentTracks();
  showToast(`${formatSpeedMultiplier(multiplier)} をVRMAに適用しました`);
}

function applyBake(): void {
  const animation = state.animation;
  if (animation == null || animation.bakePreview == null) return;
  animation.sourceTracks = cloneTrackSet(animation.tracks);
  animation.sourceExpressionTracks = cloneExpressionTrackSet(animation.expressionTracks);
  animation.sourceLookAtTrack = animation.lookAtTrack?.clone() ?? null;
  animation.bakePreview = null;
  animation.bakeApplied = true;
  processCurrentTracks();
  showToast('固定間隔のベイクを確定しました');
}

function cancelBake(): void {
  const animation = state.animation;
  if (animation == null || animation.bakePreview == null) return;
  animation.bakePreview = null;
  processCurrentTracks();
  showToast('ベイクのプレビューを取り消しました');
}

function revertBake(): void {
  const animation = state.animation;
  if (animation == null || (!animation.bakeApplied && animation.bakePreview == null)) return;
  animation.sourceTracks = cloneTrackSet(animation.originalTracks);
  animation.sourceExpressionTracks = cloneExpressionTrackSet(animation.originalExpressionTracks);
  animation.sourceLookAtTrack = animation.originalLookAtTrack?.clone() ?? null;
  animation.duration = animation.originalDuration;
  animation.appliedSpeedMultiplier = 1;
  animation.bakePreview = null;
  animation.bakeApplied = false;
  state.speedMultiplier = 1;
  processCurrentTracks();
  showToast('オリジナルのファイル状態に戻しました');
}


function updateInterface(): void {
  const model = state.model;
  const animation = state.animation;
  const mapped = model == null ? 0 : HUMAN_BONES.filter((bone) => model.bones[bone] != null).length;
  const total = HUMAN_BONES.length;
  if (model != null) {
    dom.modelName.textContent = model.name;
    dom.modelStatus.textContent = model.source === 'bundled' ? 'ASSETS · BUNDLED VRM' : 'LOCAL FILE · VRM';
  }
  dom.bonesReadout.textContent = `${mapped} / ${total}`;
  if (animation != null) {
    const keyCount = allAnimationKeyTimes(animation).length;
    const previewSettings = animation.bakePreview;
    const hasBakePreview = previewSettings != null;
    const hasTuningPreview = hasBakePreview;
    const hasBakeChanges = animation.bakeApplied || hasBakePreview;
    const canTune = animation.compatible;
    dom.dataDuration.textContent = formatSeconds(animation.duration);
    dom.dataKeyframes.textContent = keyCount.toString();
    dom.dataFormat.textContent = animation.format;
    dom.downloadName.textContent = `${withoutExtension(animation.name)}.vrma`;
    dom.downloadSize.textContent = canTune
      ? formatFileSize(createVrmaBlob(animation).size)
      : '—';
    dom.download.disabled = !canTune || hasTuningPreview;
    dom.speedMultiplier.disabled = !canTune || hasBakePreview;
    dom.speedOperationRow.classList.toggle('locked', !canTune);
    dom.bakeFps.disabled = !canTune;
    dom.bakeFrameStep.disabled = !canTune;
    dom.bakeFrameStepNumber.disabled = !canTune;
    dom.bakeApply.disabled = !canTune || !hasBakePreview;
    dom.bakeCancel.disabled = !canTune || !hasBakePreview;
    dom.bakeRevert.disabled = !canTune || !hasBakeChanges;
    dom.bakeOperationRow.classList.toggle('preview', hasBakePreview);
    dom.bakeOperationRow.classList.toggle('locked', !canTune);
  } else {
    dom.dataDuration.textContent = '00:00.00';
    dom.dataKeyframes.textContent = '0';
    dom.dataFormat.textContent = '—';
    dom.downloadName.textContent = 'animation.vrma';
    dom.downloadSize.textContent = '—';
    dom.download.disabled = true;
    dom.speedMultiplier.disabled = true;
    dom.speedOperationRow.classList.add('locked');
    dom.bakeFps.disabled = true;
    dom.bakeFrameStep.disabled = true;
    dom.bakeFrameStepNumber.disabled = true;
    dom.bakeApply.disabled = true;
    dom.bakeCancel.disabled = true;
    dom.bakeRevert.disabled = true;
    dom.bakeOperationRow.classList.remove('preview');
    dom.bakeOperationRow.classList.add('locked');
  }
  dom.queueCount.textContent = `${state.animations.length} ${state.animations.length === 1 ? 'ITEM' : 'ITEMS'}`;
  dom.speedMultiplier.value = state.speedMultiplier.toString();
  dom.speedMultiplierValue.textContent = formatSpeedMultiplier(state.speedMultiplier);
  dom.bakeFps.value = state.bakeFps.toString();
  const maxFrameStep = maxBakeFrameStepForFps(state.bakeFps);
  dom.bakeFrameStep.max = maxFrameStep.toString();
  dom.bakeFrameStepNumber.max = maxFrameStep.toString();
  dom.bakeFrameStep.value = state.bakeFrameStep.toString();
  dom.bakeFrameStepNumber.value = state.bakeFrameStep.toString();
  dom.bakeFrameMidLabel.textContent = `${Math.ceil(maxFrameStep / 2)}`;
  dom.bakeFrameMaxLabel.textContent = `${maxFrameStep}`;
  timeline.updatePlayhead();
}

function setPlayState(playing: boolean): void {
  state.isPlaying = playing;
  if (state.action != null) state.action.paused = !playing;
  dom.playIcon.textContent = playing ? 'Ⅱ' : '▶';
  dom.play.setAttribute('aria-label', playing ? '一時停止' : '再生');
}

function seekTo(time: number): void {
  if (state.animation == null) return;
  const fps = Math.max(1, state.animation.sourceFps);
  state.time = clamp(Math.round(time * fps) / fps, 0, state.animation.duration);
  if (state.mixer != null) {
    // setTime() still evaluates the action, so temporarily clear paused while
    // seeking. Otherwise a paused timeline click would keep the pose at frame 0.
    if (state.action != null) state.action.paused = false;
    state.mixer.setTime(state.time);
    if (state.action != null) state.action.paused = !state.isPlaying;
  }
  if (state.model?.vrm != null) state.model.vrm.update(0);
  timeline.updatePlayhead();
}

function resetView(): void {
  stage.fitCameraToModel(state.model);
  showToast('ビューをリセットしました');
}

function handleFileInput(input: HTMLInputElement, handler: (file: File) => void): void {
  const file = input.files?.[0];
  input.value = '';
  if (file != null) handler(file);
}

function bindDropTarget(target: HTMLElement, handler: (file: File) => void): void {
  ['dragenter', 'dragover'].forEach((eventName) => target.addEventListener(eventName, (event) => {
    event.preventDefault();
    target.classList.add('drag-over');
  }));
  ['dragleave', 'drop'].forEach((eventName) => target.addEventListener(eventName, (event) => {
    event.preventDefault();
    target.classList.remove('drag-over');
  }));
  target.addEventListener('drop', (event) => {
    const file = (event as DragEvent).dataTransfer?.files?.[0];
    if (file != null) handler(file);
  });
}

function downloadVrma(): void {
  if (state.animation == null) {
    showToast('アニメーションを先に読み込んでください');
    return;
  }
  if (!state.animation.compatible || state.animation.bakePreview != null) return;
  const blob = createVrmaBlob(state.animation);
  const downloadName = `${withoutExtension(state.animation.name)}.vrma`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = downloadName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(`${downloadName} を書き出しました`);
}

function installPreview(): void {
  const preview = createPreviewAnimation();
  state.animations = [preview];
  state.animation = preview;
  state.time = 0;
  rebuildAction();
  setPlayState(state.isPlaying);
  renderAnimationList();
  timeline.render();
  updateInterface();
}

function bindEvents(): void {
  stage.setViewportBackground('dark');
  dom.modelDrop.addEventListener('click', () => dom.modelInput.click());
  dom.animationDrop.addEventListener('click', () => dom.animationInput.click());
  dom.modelInput.addEventListener('change', () => handleFileInput(dom.modelInput, (file) => {
    if (extensionOf(file.name) !== 'vrm') {
      showToast('VRM ファイルを選択してください');
      return;
    }
    const url = URL.createObjectURL(file);
    void loadVrmUrl(url, file.name, 'local', url).catch(() => undefined);
  }));
  dom.animationInput.addEventListener('change', () => handleFileInput(dom.animationInput, (file) => { void handleAnimationFile(file); }));
  bindDropTarget(dom.modelDrop, (file) => {
    if (extensionOf(file.name) !== 'vrm') {
      showToast('ここには VRM ファイルをドロップしてください');
      return;
    }
    const url = URL.createObjectURL(file);
    void loadVrmUrl(url, file.name, 'local', url).catch(() => undefined);
  });
  bindDropTarget(dom.animationDrop, (file) => { void handleAnimationFile(file); });

  document.addEventListener('dragover', (event) => event.preventDefault());
  document.addEventListener('drop', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('#model-drop, #animation-drop')) return;
    event.preventDefault();
    const file = (event as DragEvent).dataTransfer?.files?.[0];
    if (file == null) return;
    if (extensionOf(file.name) === 'vrm') {
      const url = URL.createObjectURL(file);
      void loadVrmUrl(url, file.name, 'local', url).catch(() => undefined);
    } else {
      void handleAnimationFile(file);
    }
  });

  dom.play.addEventListener('click', () => {
    const playing = !state.isPlaying;
    setPlayState(playing);
    if (!playing) timeline.centerOnPlayhead();
  });
  dom.previousFrame.addEventListener('click', () => seekTo(Math.max(0, state.time - 1 / (state.animation?.sourceFps ?? 30))));
  dom.nextFrame.addEventListener('click', () => seekTo(Math.min(state.animation?.duration ?? 0, state.time + 1 / (state.animation?.sourceFps ?? 30))));
  dom.speedMultiplier.addEventListener('input', () => {
    const multiplier = Number(dom.speedMultiplier.value);
    if (!Number.isFinite(multiplier) || multiplier <= 0) return;
    state.speedMultiplier = multiplier;
    applySpeed();
  });
  dom.viewportBackgroundButton.addEventListener('click', stage.toggleViewportBackground);
  dom.resetView.addEventListener('click', resetView);
  dom.viewportZoomOutButton.addEventListener('click', stage.zoomViewportOut);
  dom.viewportZoomButton.addEventListener('click', stage.zoomViewportIn);
  dom.viewportZoomRange.addEventListener('input', () => stage.setViewportZoom(Number(dom.viewportZoomRange.value)));
  dom.transformsToggle.addEventListener('click', () => {
    state.transformsExpanded = !state.transformsExpanded;
    timeline.render();
  });
  dom.viewport.addEventListener('contextmenu', (event) => event.preventDefault());
  // OrbitControls normally consumes wheel events for dolly. Keep pinch-to-zoom,
  // but let wheel events retain their browser default and do nothing to the camera.
  dom.viewport.addEventListener('wheel', (event) => {
    // Trackpad pinch gestures are exposed as ctrl+wheel by most browsers.
    // Preserve those while keeping ordinary wheel scrolling out of dolly/zoom.
    if (!event.ctrlKey) event.stopImmediatePropagation();
  }, { capture: true });
  dom.download.addEventListener('click', downloadVrma);
  dom.bakeFps.addEventListener('change', () => {
    const animation = state.animation;
    if (animation == null || !animation.compatible) return;
    setBakeSettings(Number(dom.bakeFps.value), state.bakeFrameStep);
  });
  dom.bakeFrameStep.addEventListener('input', () => {
    const animation = state.animation;
    if (animation == null || !animation.compatible) return;
    setBakeFrameStepValue(Number(dom.bakeFrameStep.value));
  });
  dom.bakeFrameStepNumber.addEventListener('input', () => {
    if (dom.bakeFrameStepNumber.value.trim() === '') return;
    const value = Number(dom.bakeFrameStepNumber.value);
    if (!Number.isFinite(value)) return;
    setBakeFrameStepValue(value);
  });
  dom.bakeApply.addEventListener('click', applyBake);
  dom.bakeCancel.addEventListener('click', cancelBake);
  dom.bakeRevert.addEventListener('click', revertBake);
  dom.zoomIn.addEventListener('click', () => { state.zoom = clamp(state.zoom + 0.25, 1, 3); timeline.render(); });
  dom.zoomOut.addEventListener('click', () => { state.zoom = clamp(state.zoom - 0.25, 1, 3); timeline.render(); });

  let seeking = false;
  let seekingPointerX = 0;
  let autoScrollFrame: number | null = null;
  const stopTimelineAutoScroll = (): void => {
    if (autoScrollFrame == null) return;
    window.cancelAnimationFrame(autoScrollFrame);
    autoScrollFrame = null;
  };
  const autoScrollTimeline = (): void => {
    autoScrollFrame = null;
    if (!seeking) return;

    const scrollRect = dom.timelineScroll.getBoundingClientRect();
    const maxScrollLeft = Math.max(0, dom.timelineScroll.scrollWidth - dom.timelineScroll.clientWidth);
    if (maxScrollLeft > 0) {
      const distanceToLeft = seekingPointerX - scrollRect.left;
      const distanceToRight = scrollRect.right - seekingPointerX;
      let direction = 0;
      let distanceToEdge = 0;
      if (distanceToLeft < TIMELINE_AUTO_SCROLL_EDGE) {
        direction = -1;
        distanceToEdge = distanceToLeft;
      } else if (distanceToRight < TIMELINE_AUTO_SCROLL_EDGE) {
        direction = 1;
        distanceToEdge = distanceToRight;
      }
      if (direction !== 0) {
        const edgeProgress = clamp(
          (TIMELINE_AUTO_SCROLL_EDGE - distanceToEdge) / TIMELINE_AUTO_SCROLL_EDGE,
          0,
          1,
        );
        const scrollDelta = direction * Math.max(1, Math.round(TIMELINE_AUTO_SCROLL_MAX_SPEED * edgeProgress));
        const nextScrollLeft = clamp(dom.timelineScroll.scrollLeft + scrollDelta, 0, maxScrollLeft);
        if (nextScrollLeft !== dom.timelineScroll.scrollLeft) {
          dom.timelineScroll.scrollLeft = nextScrollLeft;
          const time = timeline.getTimeAtPointer(seekingPointerX);
          if (time != null) seekTo(time);
        }
      }
    }
    autoScrollFrame = window.requestAnimationFrame(autoScrollTimeline);
  };
  const startTimelineAutoScroll = (): void => {
    if (autoScrollFrame == null) autoScrollFrame = window.requestAnimationFrame(autoScrollTimeline);
  };
  dom.timelineScroll.addEventListener('wheel', (event) => {
    const isShiftHorizontal = event.shiftKey && event.deltaX === 0;
    const horizontalDelta = isShiftHorizontal ? event.deltaY : event.deltaX;
    const verticalDelta = isShiftHorizontal ? 0 : event.deltaY;
    const maxScrollLeft = Math.max(0, dom.timelineScroll.scrollWidth - dom.timelineScroll.clientWidth);
    const maxScrollTop = Math.max(0, dom.timelineBody.scrollHeight - dom.timelineBody.clientHeight);
    const nextScrollLeft = clamp(dom.timelineScroll.scrollLeft + horizontalDelta, 0, maxScrollLeft);
    const nextScrollTop = clamp(dom.timelineBody.scrollTop + verticalDelta, 0, maxScrollTop);
    const horizontalChanged = nextScrollLeft !== dom.timelineScroll.scrollLeft;
    const verticalChanged = nextScrollTop !== dom.timelineBody.scrollTop;
    if (!horizontalChanged && !verticalChanged) return;
    if (horizontalChanged) dom.timelineScroll.scrollLeft = nextScrollLeft;
    if (verticalChanged) dom.timelineBody.scrollTop = nextScrollTop;
    event.preventDefault();
  }, { passive: false });
  dom.timelineScroll.addEventListener('pointerdown', (event) => {
    if (state.animation == null) return;
    setPlayState(false);
    seeking = true;
    seekingPointerX = event.clientX;
    dom.timelineScroll.setPointerCapture(event.pointerId);
    const time = timeline.getTimeAtPointer(event.clientX);
    if (time != null) seekTo(time);
    startTimelineAutoScroll();
  });
  dom.timelineScroll.addEventListener('pointermove', (event) => {
    if (!seeking) return;
    seekingPointerX = event.clientX;
    const time = timeline.getTimeAtPointer(event.clientX);
    if (time != null) seekTo(time);
  });
  const stopSeeking = (): void => {
    seeking = false;
    stopTimelineAutoScroll();
  };
  dom.timelineScroll.addEventListener('pointerup', stopSeeking);
  dom.timelineScroll.addEventListener('pointercancel', stopSeeking);
  dom.timelineScroll.addEventListener('lostpointercapture', stopSeeking);
  window.addEventListener('resize', stage.resize);
}

function animate(): void {
  requestAnimationFrame(animate);
  const delta = Math.min(0.05, clock.getDelta());
  if (state.animation != null && state.isPlaying && state.mixer != null) {
    state.time += delta;
    if (state.time > state.animation.duration) state.time %= state.animation.duration;
    state.mixer.setTime(state.time);
  }
  if (state.model?.vrm != null) state.model.vrm.update(delta);
  stage.render();
  mmdPreview.update(delta);
  if (performance.now() - state.lastUiUpdate > 40) {
    state.lastUiUpdate = performance.now();
    timeline.updatePlayhead();
  }
}

async function bootstrap(): Promise<void> {
  bindEvents();
  installAlwaysVisibleScrollbars({
    sidebarTargets: document.querySelectorAll<HTMLElement>('.sidebar'),
    timelineBody: dom.timelineBody,
    timelineScroll: dom.timelineScroll,
  });
  stage.resize();
  installPreview();
  animate();
  try {
    await loadVrmUrl(defaultVrmUrl, 'model.vrm', 'bundled');
  } catch {
    showToast('assets/model.vrm の読み込みに失敗しました');
  }
}


void bootstrap();
