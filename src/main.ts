import './style.css';

import * as THREE from 'three';
import { BVHLoader } from 'three/examples/jsm/loaders/BVHLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import type { VRM } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, VRMLookAtQuaternionProxy } from '@pixiv/three-vrm-animation';
import type { VRMAnimation } from '@pixiv/three-vrm-animation';
import defaultVrmUrl from '../assets/model.vrm?url';
import defaultMmdModelUrl from '../assets/mobuko.pmx?url';
import { MMDPlayer } from './mmd/index.js';

type BoneName =
  | 'hips'
  | 'spine'
  | 'chest'
  | 'upperChest'
  | 'neck'
  | 'head'
  | 'jaw'
  | 'leftEye'
  | 'rightEye'
  | 'leftShoulder'
  | 'leftUpperArm'
  | 'leftLowerArm'
  | 'leftHand'
  | 'rightShoulder'
  | 'rightUpperArm'
  | 'rightLowerArm'
  | 'rightHand'
  | 'leftUpperLeg'
  | 'leftLowerLeg'
  | 'leftFoot'
  | 'leftToes'
  | 'rightUpperLeg'
  | 'rightLowerLeg'
  | 'rightFoot'
  | 'rightToes'
  | 'leftThumbMetacarpal'
  | 'leftThumbProximal'
  | 'leftThumbDistal'
  | 'leftIndexProximal'
  | 'leftIndexIntermediate'
  | 'leftIndexDistal'
  | 'leftMiddleProximal'
  | 'leftMiddleIntermediate'
  | 'leftMiddleDistal'
  | 'leftRingProximal'
  | 'leftRingIntermediate'
  | 'leftRingDistal'
  | 'leftLittleProximal'
  | 'leftLittleIntermediate'
  | 'leftLittleDistal'
  | 'rightThumbMetacarpal'
  | 'rightThumbProximal'
  | 'rightThumbDistal'
  | 'rightIndexProximal'
  | 'rightIndexIntermediate'
  | 'rightIndexDistal'
  | 'rightMiddleProximal'
  | 'rightMiddleIntermediate'
  | 'rightMiddleDistal'
  | 'rightRingProximal'
  | 'rightRingIntermediate'
  | 'rightRingDistal'
  | 'rightLittleProximal'
  | 'rightLittleIntermediate'
  | 'rightLittleDistal';

type TrackPath = 'rotation' | 'translation';
type MotionTrackSet = Map<BoneName, Partial<Record<TrackPath, THREE.KeyframeTrack>>>;
type ExpressionTrackSet = VRMAnimation['expressionTracks'];
type BakeSettings = { fps: number; frameStep: number };

const MIN_BAKE_FPS = 1;
const MAX_BAKE_FPS = 240;
const DEFAULT_BAKE_FPS = 30;
const MIN_BAKE_FRAME_STEP = 1;
const MAX_BAKE_FRAME_STEP = 120;
const TIMELINE_EDGE_PADDING = 40;
const TIMELINE_AUTO_SCROLL_EDGE = 48;
const TIMELINE_AUTO_SCROLL_MAX_SPEED = 14;
const DEFAULT_TIMELINE_PIXELS_PER_SECOND = 240;

type ModelState = {
  root: THREE.Object3D;
  vrm?: VRM;
  bones: Partial<Record<BoneName, THREE.Object3D>>;
  name: string;
  source: 'bundled' | 'local';
  objectUrl?: string;
  height: number;
};

type AnimationState = {
  id: string;
  name: string;
  displayName: string;
  clipName: string;
  clipIndex: number;
  clipCount: number;
  format: string;
  duration: number;
  sourceFps: number;
  restHipsY: number;
  originalTracks: MotionTrackSet;
  sourceTracks: MotionTrackSet;
  tracks: MotionTrackSet;
  originalExpressionTracks: ExpressionTrackSet;
  sourceExpressionTracks: ExpressionTrackSet;
  expressionTracks: ExpressionTrackSet;
  originalLookAtTrack: THREE.QuaternionKeyframeTrack | null;
  sourceLookAtTrack: THREE.QuaternionKeyframeTrack | null;
  lookAtTrack: THREE.QuaternionKeyframeTrack | null;
  source: 'preview' | 'file';
  compatible: boolean;
  bakePreview: BakeSettings | null;
  bakeApplied: boolean;
  originalDuration: number;
  appliedSpeedMultiplier: number;
};

const HUMAN_BONES: BoneName[] = [
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

const $ = <T extends HTMLElement>(selector: string) => document.querySelector(selector) as T;

const dom = {
  viewport: $<HTMLCanvasElement>('#viewport'),
  overlayCanvas: $<HTMLCanvasElement>('#overlay-canvas'),
  viewportShell: $<HTMLElement>('#viewport-shell'),
  loading: $<HTMLElement>('#loading-overlay'),
  loadingLabel: $<HTMLElement>('#loading-label'),
  modelDrop: $<HTMLButtonElement>('#model-drop'),
  modelInput: $<HTMLInputElement>('#vrm-file-input'),
  animationDrop: $<HTMLButtonElement>('#animation-drop'),
  animationInput: $<HTMLInputElement>('#animation-file-input'),
  assetList: $<HTMLElement>('#asset-list'),
  modelName: $<HTMLElement>('#model-name'),
  modelStatus: $<HTMLElement>('#model-status'),
  bonesReadout: $<HTMLElement>('#readout-bones'),
  queueCount: $<HTMLElement>('#queue-count'),
  dataDuration: $<HTMLElement>('#data-duration'),
  dataKeyframes: $<HTMLElement>('#data-keyframes'),
  dataFormat: $<HTMLElement>('#data-format'),
  bakeOperationRow: $<HTMLElement>('#bake-operation-row'),
  bakeFps: $<HTMLInputElement>('#bake-fps'),
  bakeFrameStep: $<HTMLInputElement>('#bake-frame-step'),
  bakeFrameStepNumber: $<HTMLInputElement>('#bake-frame-step-number'),
  bakeFrameMidLabel: $<HTMLElement>('#bake-frame-mid-label'),
  bakeFrameMaxLabel: $<HTMLElement>('#bake-frame-max-label'),
  bakeApply: $<HTMLButtonElement>('#bake-apply-button'),
  bakeCancel: $<HTMLButtonElement>('#bake-cancel-button'),
  bakeRevert: $<HTMLButtonElement>('#bake-revert-button'),
  download: $<HTMLButtonElement>('#download-button'),
  downloadName: $<HTMLElement>('#download-name'),
  downloadSize: $<HTMLElement>('#download-size'),
  speedOperationRow: $<HTMLElement>('#speed-operation-row'),
  speedMultiplier: $<HTMLInputElement>('#speed-multiplier'),
  speedMultiplierValue: $<HTMLElement>('#speed-multiplier-value'),
  play: $<HTMLButtonElement>('#play-button'),
  playIcon: $<HTMLElement>('#play-icon'),
  currentFrame: $<HTMLElement>('#current-frame'),
  totalFrames: $<HTMLElement>('#total-frames'),
  currentTime: $<HTMLElement>('#current-time'),
  previousFrame: $<HTMLButtonElement>('#previous-frame-button'),
  nextFrame: $<HTMLButtonElement>('#next-frame-button'),
  viewportBackgroundButton: $<HTMLButtonElement>('#viewport-background-button'),
  resetView: $<HTMLButtonElement>('#reset-view-button'),
  viewportZoomOutButton: $<HTMLButtonElement>('#viewport-zoom-out-button'),
  viewportZoomButton: $<HTMLButtonElement>('#viewport-zoom-button'),
  viewportZoomRange: $<HTMLInputElement>('#viewport-zoom-range'),
  timelineRuler: $<HTMLElement>('#timeline-ruler'),
  timelineRulerSticky: $<HTMLElement>('#timeline-ruler-sticky'),
  timelineBody: $<HTMLElement>('#timeline-body'),
  timelineScroll: $<HTMLElement>('#timeline-scroll'),
  timelineScrollContent: $<HTMLElement>('#timeline-scroll-content'),
  trackLanes: $<HTMLElement>('#track-lanes'),
  transformsToggle: $<HTMLButtonElement>('#transforms-toggle'),
  transformBoneLabels: $<HTMLElement>('#transform-bone-labels'),
  transformBoneLanes: $<HTMLElement>('#transform-bone-lanes'),
  transformsKeys: $<HTMLElement>('#transforms-keys'),
  faceKeys: $<HTMLElement>('#face-keys'),
  playhead: $<HTMLElement>('#playhead'),
  zoomIn: $<HTMLButtonElement>('#zoom-in-button'),
  zoomOut: $<HTMLButtonElement>('#zoom-out-button'),
  toast: $<HTMLElement>('#toast'),
  toastMessage: $<HTMLElement>('#toast-message'),
  fbxRigDialog: $<HTMLDialogElement>('#fbx-rig-dialog'),
  fbxRigFileName: $<HTMLElement>('#fbx-rig-file-name'),
};

type ScrollbarAxis = 'vertical' | 'horizontal';
type AlwaysScrollbar = {
  target: HTMLElement;
  axis: ScrollbarAxis;
  track: HTMLDivElement;
  thumb: HTMLDivElement;
};

const alwaysScrollbars: AlwaysScrollbar[] = [];
let alwaysScrollbarRefreshFrame: number | null = null;

function scrollbarPointerPosition(event: PointerEvent, axis: ScrollbarAxis): number {
  return axis === 'vertical' ? event.clientY : event.clientX;
}

function scrollbarScrollPosition(scrollbar: AlwaysScrollbar): number {
  return scrollbar.axis === 'vertical' ? scrollbar.target.scrollTop : scrollbar.target.scrollLeft;
}

function setScrollbarScrollPosition(scrollbar: AlwaysScrollbar, value: number): void {
  if (scrollbar.axis === 'vertical') {
    scrollbar.target.scrollTop = value;
  } else {
    scrollbar.target.scrollLeft = value;
  }
}

function refreshAlwaysScrollbar(scrollbar: AlwaysScrollbar): void {
  const { target, axis, track, thumb } = scrollbar;
  const rect = target.getBoundingClientRect();
  const visibleBodyRect = axis === 'horizontal' && target === dom.timelineScroll
    ? dom.timelineBody.getBoundingClientRect()
    : rect;
  const viewportSize = axis === 'vertical' ? target.clientHeight : target.clientWidth;
  const contentSize = axis === 'vertical' ? target.scrollHeight : target.scrollWidth;
  const trackSize = axis === 'vertical' ? rect.height : rect.width;
  if (viewportSize <= 0 || contentSize <= viewportSize + 1 || trackSize <= 0) {
    track.hidden = true;
    return;
  }

  const thickness = 10;
  const thumbSize = clamp(Math.round((trackSize * viewportSize) / contentSize), 24, trackSize);
  const maxThumbOffset = Math.max(0, trackSize - thumbSize);
  const maxScroll = Math.max(0, contentSize - viewportSize);
  const thumbOffset = maxScroll === 0 ? 0 : (scrollbarScrollPosition(scrollbar) / maxScroll) * maxThumbOffset;
  track.hidden = false;
  if (axis === 'vertical') {
    track.style.left = `${Math.round(rect.right - thickness)}px`;
    track.style.top = `${Math.round(rect.top)}px`;
    track.style.width = `${thickness}px`;
    track.style.height = `${Math.round(rect.height)}px`;
    thumb.style.left = '0';
    thumb.style.top = `${Math.round(thumbOffset)}px`;
    thumb.style.width = '100%';
    thumb.style.height = `${thumbSize}px`;
  } else {
    track.style.left = `${Math.round(rect.left)}px`;
    track.style.top = `${Math.round(visibleBodyRect.bottom - thickness)}px`;
    track.style.width = `${Math.round(rect.width)}px`;
    track.style.height = `${thickness}px`;
    thumb.style.left = `${Math.round(thumbOffset)}px`;
    thumb.style.top = '0';
    thumb.style.width = `${thumbSize}px`;
    thumb.style.height = '100%';
  }
}

function refreshAlwaysScrollbars(): void {
  alwaysScrollbarRefreshFrame = null;
  alwaysScrollbars.forEach(refreshAlwaysScrollbar);
}

function scheduleAlwaysScrollbarRefresh(): void {
  if (alwaysScrollbarRefreshFrame != null) return;
  alwaysScrollbarRefreshFrame = window.requestAnimationFrame(refreshAlwaysScrollbars);
}

function createAlwaysScrollbar(target: HTMLElement, axis: ScrollbarAxis): void {
  const track = document.createElement('div');
  track.className = `always-scrollbar ${axis}`;
  track.hidden = true;
  track.setAttribute('aria-hidden', 'true');
  const thumb = document.createElement('div');
  thumb.className = 'always-scrollbar-thumb';
  track.append(thumb);
  document.body.append(track);
  const scrollbar: AlwaysScrollbar = { target, axis, track, thumb };
  alwaysScrollbars.push(scrollbar);

  thumb.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const startPointer = scrollbarPointerPosition(event, axis);
    const startScroll = scrollbarScrollPosition(scrollbar);
    const trackRect = track.getBoundingClientRect();
    const thumbRect = thumb.getBoundingClientRect();
    const trackSize = axis === 'vertical' ? trackRect.height : trackRect.width;
    const thumbSize = axis === 'vertical' ? thumbRect.height : thumbRect.width;
    const maxThumbOffset = Math.max(0, trackSize - thumbSize);
    const viewportSize = axis === 'vertical' ? target.clientHeight : target.clientWidth;
    const contentSize = axis === 'vertical' ? target.scrollHeight : target.scrollWidth;
    const maxScroll = Math.max(0, contentSize - viewportSize);
    if (maxThumbOffset <= 0 || maxScroll <= 0) return;

    const move = (moveEvent: PointerEvent): void => {
      const delta = scrollbarPointerPosition(moveEvent, axis) - startPointer;
      setScrollbarScrollPosition(scrollbar, startScroll + (delta / maxThumbOffset) * maxScroll);
      scheduleAlwaysScrollbarRefresh();
    };
    const stop = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  });

  track.addEventListener('pointerdown', (event) => {
    if (event.target === thumb) return;
    event.preventDefault();
    event.stopPropagation();
    const pointer = scrollbarPointerPosition(event, axis);
    const thumbRect = thumb.getBoundingClientRect();
    const viewportSize = axis === 'vertical' ? target.clientHeight : target.clientWidth;
    const direction = pointer < (axis === 'vertical' ? thumbRect.top : thumbRect.left) ? -1 : 1;
    setScrollbarScrollPosition(scrollbar, scrollbarScrollPosition(scrollbar) + direction * viewportSize);
    scheduleAlwaysScrollbarRefresh();
  });

  target.addEventListener('scroll', scheduleAlwaysScrollbarRefresh, { passive: true });
  const observer = new MutationObserver(scheduleAlwaysScrollbarRefresh);
  observer.observe(target, { attributes: true, childList: true, subtree: true });
}

function installAlwaysVisibleScrollbars(): void {
  document.querySelectorAll<HTMLElement>('.sidebar').forEach((sidebar) => createAlwaysScrollbar(sidebar, 'vertical'));
  createAlwaysScrollbar(dom.timelineBody, 'vertical');
  createAlwaysScrollbar(dom.timelineScroll, 'horizontal');
  window.addEventListener('resize', scheduleAlwaysScrollbarRefresh);
  scheduleAlwaysScrollbarRefresh();
}

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x07111c, 0.055);
const renderer = new THREE.WebGLRenderer({
  canvas: dom.viewport,
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance',
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
camera.position.set(0, 1.28, 3.75);
const controls = new OrbitControls(camera, dom.viewport);
// OrbitControls maps right-drag to pan and shift + left-drag to pan.
controls.enablePan = true;
controls.screenSpacePanning = true;
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 2;
controls.maxDistance = 8;
controls.target.set(0, 1.08, 0);
controls.update();
controls.addEventListener('change', updateViewportZoomUi);

const hemiLight = new THREE.HemisphereLight(0xa9e8e1, 0x102337, 2.25);
scene.add(hemiLight);
const keyLight = new THREE.DirectionalLight(0xfff6e6, 3.4);
keyLight.position.set(2.8, 4.5, 3.5);
scene.add(keyLight);
const rimLight = new THREE.PointLight(0x54d8d8, 5.5, 6, 2);
rimLight.position.set(-2.2, 1.9, -1.5);
scene.add(rimLight);

const stageGroup = new THREE.Group();
scene.add(stageGroup);
const grid = new THREE.GridHelper(7, 28, 0x2a6d71, 0x16333f);
const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
gridMaterials.forEach((material) => {
  material.transparent = true;
  material.opacity = 0.28;
});
grid.position.y = 0.005;
stageGroup.add(grid);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(1, 80),
  new THREE.MeshBasicMaterial({ color: 0x0a242d, transparent: true, opacity: 0.37, side: THREE.DoubleSide }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0.01;
floor.visible = false;
stageGroup.add(floor);

const floorRing = new THREE.Mesh(
  new THREE.RingGeometry(2.1, 2.105, 96),
  new THREE.MeshBasicMaterial({ color: 0x53cfc8, transparent: true, opacity: 0.3, side: THREE.DoubleSide }),
);
floorRing.rotation.x = -Math.PI / 2;
floorRing.position.y = 0.015;
floorRing.visible = false;
stageGroup.add(floorRing);

const STAGE_SHADOW_FOOT_BONES: BoneName[] = ['leftFoot', 'leftToes', 'rightFoot', 'rightToes'];
const STAGE_SHADOW_FOOT_WEIGHT_THRESHOLD = 0.2;
const STAGE_SHADOW_MARGIN = 1.08;
const STAGE_SHADOW_MIN_RADIUS = 0.06;
const STAGE_SHADOW_SCALE = 1.5;

const clock = new THREE.Clock();
const gltfLoader = new GLTFLoader();
gltfLoader.crossOrigin = 'anonymous';
gltfLoader.register((parser) => new VRMLoaderPlugin(parser));
gltfLoader.register((parser) => new VRMAnimationLoaderPlugin(parser));
const fbxLoader = new FBXLoader();
const bvhLoader = new BVHLoader();
const mmdPlayer = new MMDPlayer(dom.overlayCanvas, { modelUrl: defaultMmdModelUrl });

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
  timelinePixelsPerSecond: number | null;
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
  timelinePixelsPerSecond: null,
  transformsExpanded: false,
  lastUiUpdate: 0,
  toastTimer: undefined,
};

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

function getObjectHeight(object: THREE.Object3D): number {
  const box = new THREE.Box3().setFromObject(object);
  return Math.max(0.1, box.max.y - box.min.y);
}

function getStageShadowFootBones(model: ModelState): Map<BoneName, THREE.Object3D> {
  const bones = new Map<BoneName, THREE.Object3D>();
  STAGE_SHADOW_FOOT_BONES.forEach((boneName) => {
    const bone = model.vrm?.humanoid.getRawBoneNode(boneName as never) ?? model.bones[boneName];
    if (bone != null) bones.set(boneName, bone);
  });
  return bones;
}

function getStageShadowFootprint(model: ModelState, footBones: Map<BoneName, THREE.Object3D>): THREE.Box3 | null {
  const footBoneSet = new Set(footBones.values());
  const bounds = new THREE.Box3();
  const vertex = new THREE.Vector3();
  let sampleCount = 0;

  model.root.updateMatrixWorld(true);
  model.root.traverse((object) => {
    if (!(object instanceof THREE.SkinnedMesh)) return;
    const skinIndex = object.geometry.getAttribute('skinIndex');
    const skinWeight = object.geometry.getAttribute('skinWeight');
    if (skinIndex == null || skinWeight == null) return;

    for (let index = 0; index < skinIndex.count; index += 1) {
      let footWeight = 0;
      for (let component = 0; component < skinIndex.itemSize; component += 1) {
        const bone = object.skeleton.bones[skinIndex.getComponent(index, component)];
        if (footBoneSet.has(bone)) footWeight += skinWeight.getComponent(index, component);
      }
      if (footWeight < STAGE_SHADOW_FOOT_WEIGHT_THRESHOLD) continue;

      object.getVertexPosition(index, vertex);
      object.localToWorld(vertex);
      bounds.expandByPoint(vertex);
      sampleCount += 1;
    }
  });

  if (sampleCount > 0 && !bounds.isEmpty()) return bounds;

  // A few VRMs have no skinned foot vertices. Use the humanoid foot/toe nodes
  // as a conservative fallback, still avoiding the full (often T-pose) bounds.
  const leftFoot = footBones.get('leftFoot');
  const leftToes = footBones.get('leftToes');
  const rightFoot = footBones.get('rightFoot');
  const rightToes = footBones.get('rightToes');
  const footPoints = new Map<BoneName, THREE.Vector3>();
  footBones.forEach((bone, boneName) => {
    const point = new THREE.Vector3();
    bone.getWorldPosition(point);
    footPoints.set(boneName, point);
    bounds.expandByPoint(point);
  });
  if (bounds.isEmpty()) return null;

  const footLength = Math.max(
    leftFoot != null && leftToes != null ? getHorizontalDistance(footPoints.get('leftFoot'), footPoints.get('leftToes')) : 0,
    rightFoot != null && rightToes != null ? getHorizontalDistance(footPoints.get('rightFoot'), footPoints.get('rightToes')) : 0,
  );
  const size = bounds.getSize(new THREE.Vector3());
  const padding = Math.max(0.03, footLength * 0.35, Math.max(size.x, size.z) * 0.2);
  bounds.min.x -= padding;
  bounds.max.x += padding;
  bounds.min.z -= padding;
  bounds.max.z += padding;
  return bounds;
}

function getHorizontalDistance(first: THREE.Vector3 | undefined, second: THREE.Vector3 | undefined): number {
  if (first == null || second == null) return 0;
  return Math.hypot(first.x - second.x, first.z - second.z);
}

function updateStageShadow(model: ModelState | null): void {
  if (model == null) {
    floor.visible = false;
    floorRing.visible = false;
    return;
  }
  const footBones = getStageShadowFootBones(model);
  const bounds = getStageShadowFootprint(model, footBones);
  if (bounds == null) {
    floor.visible = false;
    floorRing.visible = false;
    return;
  }

  const width = Math.max(0, bounds.max.x - bounds.min.x);
  const depth = Math.max(0, bounds.max.z - bounds.min.z);
  const radius = Math.max(STAGE_SHADOW_MIN_RADIUS, Math.hypot(width, depth) * 0.5 * STAGE_SHADOW_MARGIN) * STAGE_SHADOW_SCALE;
  const centerX = (bounds.min.x + bounds.max.x) * 0.5;
  const centerZ = (bounds.min.z + bounds.max.z) * 0.5;
  const groundY = bounds.min.y + Math.max(0.001, radius * 0.02);
  floor.scale.setScalar(radius);
  floor.position.set(centerX, groundY, centerZ);
  floorRing.scale.setScalar(radius / 2.1);
  floorRing.position.set(centerX, groundY + Math.max(0.001, radius * 0.015), centerZ);
  floor.visible = true;
  floorRing.visible = true;
}

function getVrmBones(vrm: VRM): Partial<Record<BoneName, THREE.Object3D>> {
  const bones: Partial<Record<BoneName, THREE.Object3D>> = {};
  HUMAN_BONES.forEach((boneName) => {
    const bone = vrm.humanoid.getNormalizedBoneNode(boneName as never);
    if (bone != null) bones[boneName] = bone;
  });
  return bones;
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry != null) mesh.geometry.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((item) => item.dispose());
    else if (material != null) material.dispose();
  });
}

function replaceModel(nextModel: ModelState): void {
  if (state.mixer != null) {
    state.mixer.stopAllAction();
    state.mixer = null;
    state.action = null;
  }
  if (state.model != null) {
    scene.remove(state.model.root);
    disposeObject(state.model.root);
    if (state.model.objectUrl != null) URL.revokeObjectURL(state.model.objectUrl);
  }
  state.model = nextModel;
  scene.add(nextModel.root);
  nextModel.root.traverse((object) => { object.frustumCulled = false; });
  updateStageShadow(nextModel);
  fitCameraToModel();
  rebuildAction();
  updateInterface();
}

function fitCameraToModel(): void {
  if (state.model == null) return;
  const height = state.model.height || getObjectHeight(state.model.root);
  const targetY = height * 0.5;
  controls.minDistance = Math.max(0.5, height * 0.75);
  controls.maxDistance = Math.max(6, height * 5);
  const fitDistance = clamp(height * 2.2, controls.minDistance + 0.01, controls.maxDistance * 0.92);
  controls.target.set(0, targetY, 0);
  camera.position.set(0, targetY + height * 0.08, fitDistance);
  camera.near = Math.max(0.01, height / 100);
  camera.far = height * 20;
  camera.updateProjectionMatrix();
  controls.update();
  updateViewportZoomUi();
}

function updateViewportZoomUi(): void {
  const span = Math.max(0.001, controls.maxDistance - controls.minDistance);
  const zoom = ((controls.maxDistance - controls.getDistance()) / span) * 100;
  dom.viewportZoomRange.value = clamp(zoom, 0, 100).toFixed(0);
}

type ViewportBackground = 'dark' | 'light';

function setViewportBackground(background: ViewportBackground): void {
  const isLight = background === 'light';
  dom.viewportShell.classList.toggle('light-background', isLight);
  dom.viewportBackgroundButton.setAttribute('aria-pressed', String(isLight));
  const nextBackgroundLabel = isLight ? '黒っぽい背景に切り替え' : '白っぽい背景に切り替え';
  dom.viewportBackgroundButton.title = nextBackgroundLabel;
  dom.viewportBackgroundButton.setAttribute('aria-label', nextBackgroundLabel);
}

function toggleViewportBackground(): void {
  const isLight = dom.viewportShell.classList.contains('light-background');
  setViewportBackground(isLight ? 'dark' : 'light');
}

function setViewportZoom(value: number): void {
  const normalized = clamp(value, 0, 100) / 100;
  const distance = controls.maxDistance - normalized * (controls.maxDistance - controls.minDistance);
  setViewportDistance(distance);
}

function setViewportDistance(distance: number): void {
  const nextDistance = clamp(distance, controls.minDistance, controls.maxDistance);
  const direction = camera.position.clone().sub(controls.target);
  if (direction.lengthSq() < 0.000001) direction.set(0, 0, 1);
  direction.normalize();
  camera.position.copy(controls.target).addScaledVector(direction, nextDistance);
  controls.update();
  updateViewportZoomUi();
}

function zoomViewportIn(): void {
  setViewportDistance(controls.getDistance() * 0.82);
}

function zoomViewportOut(): void {
  setViewportDistance(controls.getDistance() / 0.82);
}

async function loadVrmUrl(url: string, name: string, source: 'bundled' | 'local', objectUrl?: string): Promise<void> {
  const previousModel = state.model;
  if (previousModel != null) previousModel.root.visible = false;
  updateStageShadow(null);
  setLoading(true, 'LOADING VRM AVATAR');
  try {
    const gltf = await gltfLoader.loadAsync(url);
    const vrm = (gltf.userData as { vrm?: VRM }).vrm;
    if (vrm == null) throw new Error('This file does not contain a VRM avatar.');
    VRMUtils.rotateVRM0(vrm);
    if (vrm.lookAt != null && vrm.scene.children.find((object) => object instanceof VRMLookAtQuaternionProxy) == null) {
      const lookAtProxy = new VRMLookAtQuaternionProxy(vrm.lookAt);
      lookAtProxy.name = 'VRMLookAtQuaternionProxy';
      vrm.scene.add(lookAtProxy);
    }
    const model: ModelState = {
      root: vrm.scene,
      vrm,
      bones: getVrmBones(vrm),
      name,
      source,
      objectUrl,
      height: getObjectHeight(vrm.scene),
    };
    replaceModel(model);
    showToast(`${name} をアバターとして読み込みました`);
  } catch (error) {
    if (state.model === previousModel && previousModel != null) {
      previousModel.root.visible = true;
      updateStageShadow(previousModel);
    }
    if (objectUrl != null) URL.revokeObjectURL(objectUrl);
    const message = error instanceof Error ? error.message : 'VRM の読み込みに失敗しました';
    showToast(message);
    throw error;
  } finally {
    setLoading(false);
  }
}

function setTrack(set: MotionTrackSet, bone: BoneName, path: TrackPath, track: THREE.KeyframeTrack): void {
  const current = set.get(bone) ?? {};
  current[path] = track;
  set.set(bone, current);
}

function cloneTrackSet(source: MotionTrackSet): MotionTrackSet {
  const clone: MotionTrackSet = new Map();
  source.forEach((tracks, bone) => {
    const next: Partial<Record<TrackPath, THREE.KeyframeTrack>> = {};
    if (tracks.rotation != null) next.rotation = tracks.rotation.clone();
    if (tracks.translation != null) next.translation = tracks.translation.clone();
    clone.set(bone, next);
  });
  return clone;
}

function emptyExpressionTrackSet(): ExpressionTrackSet {
  return { preset: new Map(), custom: new Map() };
}

function cloneExpressionTrackSet(source: ExpressionTrackSet): ExpressionTrackSet {
  const clone = emptyExpressionTrackSet();
  source.preset.forEach((track, name) => clone.preset.set(name, track.clone()));
  source.custom.forEach((track, name) => clone.custom.set(name, track.clone()));
  return clone;
}

function makeQuaternionTrack(name: string, times: number[], values: number[]): THREE.QuaternionKeyframeTrack {
  return new THREE.QuaternionKeyframeTrack(name, times, values);
}

function continuousQuaternionValues(values: number[]): number[] {
  const continuous: number[] = [];
  let previous: THREE.Quaternion | null = null;
  for (let index = 0; index + 3 < values.length; index += 4) {
    const quaternion = new THREE.Quaternion().fromArray(values.slice(index, index + 4) as [number, number, number, number]);
    if (quaternion.lengthSq() < 0.000000000001) quaternion.identity();
    else quaternion.normalize();
    if (previous != null && previous.dot(quaternion) < 0) quaternion.set(-quaternion.x, -quaternion.y, -quaternion.z, -quaternion.w);
    continuous.push(...quaternion.toArray());
    previous = quaternion;
  }
  return continuous;
}

function makeContinuousQuaternionTrack(name: string, times: number[], values: number[]): THREE.QuaternionKeyframeTrack {
  return new THREE.QuaternionKeyframeTrack(name, times, continuousQuaternionValues(values));
}

function makeVectorTrack(name: string, times: number[], values: number[]): THREE.VectorKeyframeTrack {
  return new THREE.VectorKeyframeTrack(name, times, values);
}


function quaternionValuesFor(
  times: number[],
  fn: (time: number, index: number) => THREE.Quaternion,
): number[] {
  return times.flatMap((time, index) => fn(time, index).toArray());
}

function createPreviewAnimation(): AnimationState {
  const duration = 2.4;
  const times = [0, 0.6, 1.2, 1.8, 2.4];
  const loop = (time: number) => Math.sin((time / duration) * Math.PI * 2);
  const tracks: MotionTrackSet = new Map();
  const rotation = (bone: BoneName, fn: (time: number) => THREE.Euler): void => {
    const values = quaternionValuesFor(times, (time) => new THREE.Quaternion().setFromEuler(fn(time)));
    setTrack(tracks, bone, 'rotation', makeQuaternionTrack('', times, values));
  };
  rotation('hips', (time) => new THREE.Euler(0.025 * loop(time), 0.04 * loop(time + 0.3), 0.02 * loop(time), 'XYZ'));
  rotation('spine', (time) => new THREE.Euler(0.035 * loop(time + 0.3), 0, 0, 'XYZ'));
  rotation('chest', (time) => new THREE.Euler(0.04 * loop(time + 0.3), 0.025 * loop(time), 0, 'XYZ'));
  rotation('head', (time) => new THREE.Euler(0.02 * loop(time), 0.05 * loop(time + 0.8), 0, 'XYZ'));
  rotation('leftUpperArm', (time) => new THREE.Euler(0, 0, -0.08 + 0.07 * loop(time + 0.4), 'XYZ'));
  rotation('rightUpperArm', (time) => new THREE.Euler(0, 0, 0.08 - 0.07 * loop(time + 0.4), 'XYZ'));
  rotation('leftLowerArm', (time) => new THREE.Euler(0, 0, -0.06 + 0.04 * loop(time + 0.8), 'XYZ'));
  rotation('rightLowerArm', (time) => new THREE.Euler(0, 0, 0.06 - 0.04 * loop(time + 0.8), 'XYZ'));
  rotation('leftUpperLeg', (time) => new THREE.Euler(0.025 * loop(time), 0, 0.015 * loop(time), 'XYZ'));
  rotation('rightUpperLeg', (time) => new THREE.Euler(-0.025 * loop(time), 0, -0.015 * loop(time), 'XYZ'));
  // VRMA hips translations are absolute positions in the normalized rig.
  // Keep the preview hips at the normalized rest height; using zero here
  // places the hips at the floor and buries the model's legs in the stage.
  const hipsPositionValues = times.flatMap((time) => [0, 1 + 0.012 * loop(time), 0]);
  setTrack(tracks, 'hips', 'translation', makeVectorTrack('', times, hipsPositionValues));
  const expressionTracks = emptyExpressionTrackSet();
  expressionTracks.preset.set(
    'blink',
    new THREE.NumberKeyframeTrack('', [0, 1.08, 1.13, 1.2, duration], [0, 0, 1, 0, 0]),
  );
  return {
    id: 'preview-animation',
    name: 'preview-loop.vrma',
    displayName: 'Preview loop',
    clipName: 'Preview loop',
    clipIndex: 0,
    clipCount: 1,
    format: 'VRMA',
    duration,
    sourceFps: 30,
    restHipsY: 1,
    originalTracks: cloneTrackSet(tracks),
    sourceTracks: tracks,
    tracks: cloneTrackSet(tracks),
    originalExpressionTracks: cloneExpressionTrackSet(expressionTracks),
    sourceExpressionTracks: cloneExpressionTrackSet(expressionTracks),
    expressionTracks: cloneExpressionTrackSet(expressionTracks),
    originalLookAtTrack: null,
    sourceLookAtTrack: null,
    lookAtTrack: null,
    source: 'preview',
    compatible: true,
    bakePreview: null,
    bakeApplied: false,
    originalDuration: duration,
    appliedSpeedMultiplier: 1,
  };
}

function getSourceTrackBoneName(trackName: string): string {
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

type AnimationRigType = 'mixamo' | 'universal';

function mapSourceBone(name: string): BoneName | null {
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


function detectAnimationRig(asset: THREE.Group): AnimationRigType | null {
  const hasMixamoRig = asset.getObjectByName('mixamorigHips') != null;
  const hasUniversalRig = asset.getObjectByName('pelvis') != null
    && asset.getObjectByName('spine_01') != null;
  if (hasMixamoRig === hasUniversalRig) return null;
  return hasMixamoRig ? 'mixamo' : 'universal';
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

function trackPathFor(track: THREE.KeyframeTrack): TrackPath | null {
  const name = track.name.toLowerCase();
  if (name.includes('quaternion') || name.endsWith('.rotation') || name.includes('rotation')) return 'rotation';
  if (name.includes('position') || name.includes('translation')) return 'translation';
  return null;
}

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

function retargetMixamoClip(
  asset: THREE.Group,
  clip: THREE.AnimationClip,
  vrm: VRM | null,
): { tracks: MotionTrackSet; restHipsY: number } {
  const motionHips = asset.getObjectByName('mixamorigHips');
  if (motionHips == null || motionHips.position.y <= 0.0001) {
    throw new Error('Mixamo FBX の hips の高さを取得できませんでした');
  }
  asset.updateMatrixWorld(true);
  const motionHipsHeight = motionHips.position.y;
  const tracks: MotionTrackSet = new Map();
  clip.tracks.forEach((sourceTrack) => {
    const [mixamoRigName, propertyName] = sourceTrack.name.split('.');
    if (mixamoRigName == null || propertyName == null) return;
    const sourceBone = mixamoVRMRigMap[mixamoRigName] ?? mapSourceBone(mixamoRigName);
    if (sourceBone == null || (vrm != null && vrm.humanoid.getNormalizedBoneNode(sourceBone as never) == null)) return;
    const mixamoRigNode = asset.getObjectByName(mixamoRigName);
    if (mixamoRigNode?.parent == null) return;

    const restRotationInverse = mixamoRigNode.getWorldQuaternion(new THREE.Quaternion()).invert();
    const parentRestWorldRotation = mixamoRigNode.parent.getWorldQuaternion(new THREE.Quaternion());
    if (sourceTrack instanceof THREE.QuaternionKeyframeTrack) {
      const values: number[] = [];
      for (let index = 0; index < sourceTrack.values.length; index += 4) {
        const quaternion = new THREE.Quaternion()
          .fromArray(Array.from(sourceTrack.values.slice(index, index + 4)) as [number, number, number, number])
          .premultiply(parentRestWorldRotation)
          .multiply(restRotationInverse)
          .normalize();
        values.push(...quaternion.toArray());
      }
      setTrack(tracks, sourceBone, 'rotation', makeQuaternionTrack('', Array.from(sourceTrack.times), values));
    } else if (sourceTrack instanceof THREE.VectorKeyframeTrack && sourceBone === 'hips') {
      setTrack(tracks, sourceBone, 'translation', makeVectorTrack('', Array.from(sourceTrack.times), Array.from(sourceTrack.values)));
    }
  });
  return { tracks, restHipsY: motionHipsHeight };
}

function evaluateTrackAt(track: THREE.KeyframeTrack, time: number): number[] {
  const size = track.getValueSize();
  const trackWithInterpolant = track as THREE.KeyframeTrack & {
    createInterpolant: (result: Float32Array) => { evaluate: (time: number) => ArrayLike<number> };
  };
  const firstTime = track.times[0] ?? 0;
  const lastTime = track.times[track.times.length - 1] ?? firstTime;
  return Array.from(trackWithInterpolant.createInterpolant(new Float32Array(size)).evaluate(clamp(time, firstTime, lastTime)));
}

function retargetUniversalClip(
  asset: THREE.Group,
  clip: THREE.AnimationClip,
  vrm: VRM | null,
): { tracks: MotionTrackSet; restHipsY: number } {
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
    const sourceBone = universalVrmRigMap[sourceNodeName]
      ?? (sourceNodeName.toLowerCase() === 'root' ? null : mapSourceBone(sourceNodeName));
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

function retargetGenericClip(clip: THREE.AnimationClip): MotionTrackSet {
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






function isDazFriendlyBvh(skeleton: THREE.Skeleton): boolean {
  const names = new Set(skeleton.bones.map((bone) => bone.name.toLowerCase()));
  return names.has('hip')
    && names.has('abdomen')
    && names.has('rshldr')
    && names.has('lshldr')
    && names.has('rthigh')
    && names.has('lthigh');
}

function estimateBvhRestHipsHeight(skeleton: THREE.Skeleton): number {
  const root = skeleton.bones[0];
  if (root == null) return 1;
  root.updateMatrixWorld(true);
  const rootY = root.getWorldPosition(new THREE.Vector3()).y;
  let lowestY = rootY;
  skeleton.bones.forEach((bone) => {
    lowestY = Math.min(lowestY, bone.getWorldPosition(new THREE.Vector3()).y);
  });
  return Math.max(0.0001, Math.abs(rootY - lowestY));
}

function normalizeDazBvhRootTranslation(track: THREE.KeyframeTrack, restHipsY: number): THREE.VectorKeyframeTrack {
  const times = Array.from(track.times);
  const values = Array.from(track.values);
  const first = values.slice(0, 3);
  const normalized: number[] = [];
  for (let index = 0; index + 2 < values.length; index += 3) {
    normalized.push(
      values[index] - (first[0] ?? 0),
      restHipsY + values[index + 1] - (first[1] ?? 0),
      values[index + 2] - (first[2] ?? 0),
    );
  }
  return makeVectorTrack('', times, normalized);
}

function retargetDazBvhClip(
  skeleton: THREE.Skeleton,
  clip: THREE.AnimationClip,
  vrm: VRM | null,
): { tracks: MotionTrackSet; restHipsY: number } {
  const tracks: MotionTrackSet = new Map();
  const root = skeleton.bones[0];
  const restHipsY = estimateBvhRestHipsHeight(skeleton);
  const rootPositionTrack = root == null
    ? null
    : clip.tracks.find((track) => track.name === `${root.name}.position`) ?? null;

  clip.tracks.forEach((sourceTrack) => {
    const path = trackPathFor(sourceTrack);
    if (path == null) return;
    const sourceBone = mapSourceBone(getSourceTrackBoneName(sourceTrack.name));
    if (sourceBone == null || (vrm != null && vrm.humanoid.getNormalizedBoneNode(sourceBone as never) == null)) return;

    if (path === 'translation') {
      if (sourceBone === 'hips' && sourceTrack === rootPositionTrack) {
        setTrack(tracks, sourceBone, 'translation', normalizeDazBvhRootTranslation(sourceTrack, restHipsY));
      }
      return;
    }
    if (!(sourceTrack instanceof THREE.QuaternionKeyframeTrack)) return;
    // BVHLoader already evaluates the channel order from the Daz export. The
    // resulting rotations are local T-pose-relative rotations, so remove no
    // first-frame rotation here. Only fix quaternion sign changes, which are
    // mathematically equivalent but would otherwise create interpolation flips.
    setTrack(
      tracks,
      sourceBone,
      'rotation',
      makeContinuousQuaternionTrack('', Array.from(sourceTrack.times), Array.from(sourceTrack.values)),
    );
  });
  return { tracks, restHipsY };
}

function tracksFromVrma(animation: VRMAnimation): {
  tracks: MotionTrackSet;
  expressionTracks: ExpressionTrackSet;
  lookAtTrack: THREE.QuaternionKeyframeTrack | null;
} {
  const tracks: MotionTrackSet = new Map();
  animation.humanoidTracks.rotation.forEach((track, boneName) => {
    const bone = boneName as BoneName;
    if (HUMAN_BONES.includes(bone)) setTrack(tracks, bone, 'rotation', track.clone());
  });
  animation.humanoidTracks.translation.forEach((track, boneName) => {
    const bone = boneName as BoneName;
    if (HUMAN_BONES.includes(bone)) setTrack(tracks, bone, 'translation', track.clone());
  });
  return {
    tracks,
    expressionTracks: cloneExpressionTrackSet(animation.expressionTracks),
    lookAtTrack: animation.lookAtTrack?.clone() ?? null,
  };
}

function normalizeBakeFps(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BAKE_FPS;
  return Math.round(clamp(value, MIN_BAKE_FPS, MAX_BAKE_FPS));
}

function maxBakeFrameStepForFps(fps: number): number {
  return Math.max(MIN_BAKE_FRAME_STEP, Math.min(MAX_BAKE_FRAME_STEP, Math.floor(normalizeBakeFps(fps))));
}

function fixedBakeTimes(duration: number, fps: number, frameStep: number, preservedTimes: number[] = []): number[] {
  const safeDuration = Math.max(0, duration);
  const safeFps = normalizeBakeFps(fps);
  const safeDivisionCount = Math.round(clamp(frameStep, MIN_BAKE_FRAME_STEP, maxBakeFrameStepForFps(safeFps)));
  if (safeDuration <= 0) return [0];
  const frameInterval = safeFps / safeDivisionCount;
  const stepCount = Math.floor((safeDuration * safeFps + 0.000001) / frameInterval);
  const times = Array.from({ length: stepCount + 1 }, (_, index) => Math.min(safeDuration, Number(((index * frameInterval) / safeFps).toFixed(6))));
  const preserved = preservedTimes
    .filter((time) => Number.isFinite(time))
    .map((time) => clamp(time, 0, safeDuration))
    .map((time) => Number(time.toFixed(6)));
  preserved.push(Number(safeDuration.toFixed(6)));
  return Array.from(new Set([...times, ...preserved])).sort((a, b) => a - b);
}

function sampleTrack(track: THREE.KeyframeTrack, duration: number, settings: BakeSettings, path: TrackPath): THREE.KeyframeTrack {
  const lastTime = track.times[track.times.length - 1];
  const times = fixedBakeTimes(duration, settings.fps, settings.frameStep, lastTime == null ? [] : [lastTime]);
  const size = track.getValueSize();
  const trackWithInterpolant = track as THREE.KeyframeTrack & {
    createInterpolant: (result: Float32Array) => { evaluate: (time: number) => ArrayLike<number> };
  };
  const interpolant = trackWithInterpolant.createInterpolant(new Float32Array(size));
  const values: number[] = [];
  times.forEach((time) => values.push(...Array.from(interpolant.evaluate(time))));
  const baked = path === 'rotation'
    ? makeQuaternionTrack(track.name, times, values)
    : makeVectorTrack(track.name, times, values);
  preserveTrackInterpolation(track, baked);
  return baked;
}

function sampleNumberTrack(track: THREE.NumberKeyframeTrack, duration: number, settings: BakeSettings): THREE.NumberKeyframeTrack {
  const lastTime = track.times[track.times.length - 1];
  const times = fixedBakeTimes(duration, settings.fps, settings.frameStep, lastTime == null ? [] : [lastTime]);
  const trackWithInterpolant = track as THREE.NumberKeyframeTrack & {
    createInterpolant: (result: Float32Array) => { evaluate: (time: number) => ArrayLike<number> };
  };
  const interpolant = trackWithInterpolant.createInterpolant(new Float32Array(1));
  const values = times.map((time) => Number(interpolant.evaluate(time)[0] ?? 0));
  const baked = new THREE.NumberKeyframeTrack(track.name, times, values);
  preserveTrackInterpolation(track, baked);
  return baked;
}

function preserveTrackInterpolation(source: THREE.KeyframeTrack, baked: THREE.KeyframeTrack): void {
  const interpolation = source.getInterpolation();
  if (interpolation === THREE.InterpolateDiscrete || interpolation === THREE.InterpolateLinear || interpolation === THREE.InterpolateSmooth) {
    baked.setInterpolation(interpolation);
  }
}

function copyTrackInterpolation(source: THREE.KeyframeTrack, target: THREE.KeyframeTrack): void {
  preserveTrackInterpolation(source, target);
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

function processTracks(
  source: MotionTrackSet,
  duration: number,
  bakeSettings: BakeSettings | null,
): MotionTrackSet {
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

function processExpressionTracks(
  source: ExpressionTrackSet,
  duration: number,
  bakeSettings: BakeSettings | null,
): ExpressionTrackSet {
  const processed = emptyExpressionTrackSet();
  const process = (original: THREE.NumberKeyframeTrack): THREE.NumberKeyframeTrack => {
    return bakeSettings == null ? original.clone() : sampleNumberTrack(original, duration, bakeSettings);
  };
  source.preset.forEach((track, name) => processed.preset.set(name, process(track)));
  source.custom.forEach((track, name) => processed.custom.set(name, process(track)));
  return processed;
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

type LoadedClip = {
  tracks: MotionTrackSet;
  expressionTracks: ExpressionTrackSet;
  lookAtTrack: THREE.QuaternionKeyframeTrack | null;
  duration: number;
  sourceFps: number;
  restHipsY: number;
  clipName: string;
  compatible: boolean;
};

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
  return name != null && name.length > 0 && name !== 'animation' ? name : `Take ${formatFrame(index + 1)}`;
}

async function parseAnimationFile(file: File, targetVrm: VRM | null): Promise<LoadedClip[]> {
  const format = extensionOf(file.name);
  const url = URL.createObjectURL(file);
  try {
    if (format === 'fbx') {
      const source = await fbxLoader.loadAsync(url);
      if (source.animations.length === 0) throw new Error('FBX にアニメーションクリップがありません');
      const rigType = detectAnimationRig(source) ?? await chooseFbxRigType(file.name);
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

let animationSequence = 0;

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
    meta.textContent = animation.source === 'preview' ? 'PREVIEW · 2.40 SEC' : `${formatClipMeta(animation)}${animation.compatible ? '' : ' · UNMAPPED'}`;
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
  renderTimeline();
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
  renderTimeline();
  updateInterface();
  showToast(`${removed.clipName} を一覧から削除しました`);
}

async function handleAnimationFile(file: File): Promise<void> {
  const extension = extensionOf(file.name);
  if (extension === 'vmd') {
    try {
      await mmdPlayer.playVmd(file);
      showToast(`${file.name} を MMD プレビューで再生しています`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'VMD の読み込みに失敗しました';
      showToast(message);
    }
    return;
  }
  if (!['vrma', 'glb', 'gltf', 'fbx', 'bvh'].includes(extension)) {
    showToast('VRMA / GLB / GLTF / FBX / BVH / VMD を選択してください');
    return;
  }
  setLoading(true, 'RETARGETING MOTION');
  try {
    const loadedClips = await parseAnimationFile(file, state.model?.vrm ?? null);
    if (loadedClips.length === 0 || !loadedClips.some((clip) => clip.compatible)) throw new Error('対応する humanoid ボーンが見つかりませんでした');
    const clipCount = loadedClips.length;
    const addedAnimations = loadedClips.map((loaded, index) => ({
      id: `animation-${++animationSequence}`,
      name: file.name,
      displayName: withoutExtension(file.name),
      clipName: loaded.clipName,
      clipIndex: index,
      clipCount,
      format: extension.toUpperCase(),
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
    // The first clip in a dropped file is the automatic playback target.
    selectAnimation(addedAnimations[0].id);
    showToast(clipCount > 1 ? `${file.name} · ${clipCount} clips を追加しました` : `${file.name} をリターゲットしました`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'アニメーションの変換に失敗しました';
    showToast(message);
  } finally {
    setLoading(false);
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
  renderTimeline();
  updateInterface();
}

function formatSpeedMultiplier(multiplier: number): string {
  const rounded = Math.round(multiplier * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}×`;
}

function scaleTrackTimes(track: THREE.KeyframeTrack, multiplier: number): THREE.KeyframeTrack {
  const scaled = track.clone();
  scaled.times = Float32Array.from(track.times, (time) => time / multiplier);
  return scaled;
}

function scaleTrackSetTimes(source: MotionTrackSet, multiplier: number): MotionTrackSet {
  const scaled: MotionTrackSet = new Map();
  source.forEach((tracks, bone) => {
    const next: Partial<Record<TrackPath, THREE.KeyframeTrack>> = {};
    if (tracks.rotation != null) next.rotation = scaleTrackTimes(tracks.rotation, multiplier);
    if (tracks.translation != null) next.translation = scaleTrackTimes(tracks.translation, multiplier);
    scaled.set(bone, next);
  });
  return scaled;
}

function scaleExpressionTrackSetTimes(source: ExpressionTrackSet, multiplier: number): ExpressionTrackSet {
  const scaled = emptyExpressionTrackSet();
  source.preset.forEach((track, name) => scaled.preset.set(name, scaleTrackTimes(track, multiplier) as THREE.NumberKeyframeTrack));
  source.custom.forEach((track, name) => scaled.custom.set(name, scaleTrackTimes(track, multiplier) as THREE.NumberKeyframeTrack));
  return scaled;
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

function uniqueKeyTimes(set: MotionTrackSet): number[] {
  const values = new Set<number>();
  set.forEach((tracks) => {
    Object.values(tracks).forEach((track) => {
      track?.times.forEach((time) => values.add(Math.round(time * 1000) / 1000));
    });
  });
  return Array.from(values).sort((a, b) => a - b);
}

function uniqueExpressionKeyTimes(set: ExpressionTrackSet): number[] {
  const values = new Set<number>();
  set.preset.forEach((track) => track.times.forEach((time) => values.add(Math.round(time * 1000) / 1000)));
  set.custom.forEach((track) => track.times.forEach((time) => values.add(Math.round(time * 1000) / 1000)));
  return Array.from(values).sort((a, b) => a - b);
}

function allAnimationKeyTimes(animation: AnimationState): number[] {
  return mergeKeyTimes(uniqueKeyTimes(animation.tracks), uniqueExpressionKeyTimes(animation.expressionTracks));
}

function laneTimes(set: MotionTrackSet, paths: TrackPath[]): number[] {
  const values = new Set<number>();
  set.forEach((tracks, bone) => {
    const isBody = bone !== 'hips';
    const allowed = isBody ? paths.includes('rotation') : paths.includes('translation') || paths.includes('rotation');
    if (!allowed) return;
    paths.forEach((path) => tracks[path]?.times.forEach((time) => values.add(Math.round(time * 1000) / 1000)));
  });
  return Array.from(values).sort((a, b) => a - b);
}

function mergeKeyTimes(...lists: number[][]): number[] {
  return Array.from(new Set(lists.flat())).sort((a, b) => a - b);
}

function trackTimesForBone(set: MotionTrackSet, bone: BoneName): number[] {
  const tracks = set.get(bone);
  if (tracks == null) return [];
  return mergeKeyTimes(
    tracks.translation == null ? [] : Array.from(tracks.translation.times).map((time) => Math.round(time * 1000) / 1000),
    tracks.rotation == null ? [] : Array.from(tracks.rotation.times).map((time) => Math.round(time * 1000) / 1000),
  );
}

function formatBoneName(bone: BoneName): string {
  return bone.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();
}

function renderKeyRow(
  row: HTMLElement,
  times: number[],
  duration: number,
  className: string,
  muted = false,
  provisionalTimes: Set<number> = new Set(),
): void {
  row.replaceChildren();
  const limited = times.length > 600 ? times.filter((_, index) => index % Math.ceil(times.length / 600) === 0) : times;
  limited.forEach((time) => {
    const marker = document.createElement('span');
    const provisional = provisionalTimes.has(Math.round(time * 1000) / 1000);
    marker.className = `keyframe ${className}${muted ? ' muted' : ''}${provisional ? ' provisional' : ''}`;
    marker.style.left = `${duration <= 0 ? 0 : (time / duration) * 100}%`;
    marker.title = `${provisional ? 'PREVIEW · ' : ''}F ${formatFrame(time * (state.animation?.sourceFps ?? 30))} · ${formatSeconds(time)}`;
    row.append(marker);
  });
}

function updateTransformsExpansionUi(): void {
  const expanded = state.transformsExpanded;
  dom.transformBoneLabels.hidden = !expanded;
  dom.transformBoneLanes.hidden = !expanded;
  dom.trackLanes.classList.toggle('transforms-expanded', expanded);
  dom.transformsToggle.setAttribute('aria-expanded', String(expanded));
  dom.transformsToggle.title = expanded ? 'ボーン別の表示を折りたたむ' : 'ボーン別に展開';
  dom.transformsToggle.setAttribute('aria-label', expanded ? 'Bonesのボーン別表示を折りたたむ' : 'Bonesをボーン別に展開');
}

function renderTransformBoneRows(
  sourceTracks: MotionTrackSet,
  outputTracks: MotionTrackSet,
  duration: number,
  isTuningPreview: boolean,
  provisionalTimesFor: (sourceTimes: number[], outputTimes: number[]) => Set<number>,
): void {
  dom.transformBoneLabels.replaceChildren();
  dom.transformBoneLanes.replaceChildren();
  if (!state.transformsExpanded) return;

  const bones = HUMAN_BONES.filter((bone) => (
    trackTimesForBone(sourceTracks, bone).length > 0 || trackTimesForBone(outputTracks, bone).length > 0
  ));
  bones.forEach((bone) => {
    const sourceTimes = trackTimesForBone(sourceTracks, bone);
    const outputTimes = trackTimesForBone(outputTracks, bone);
    const times = isTuningPreview ? mergeKeyTimes(sourceTimes, outputTimes) : outputTimes;
    const sourceSet = sourceTracks.get(bone);
    const outputSet = outputTracks.get(bone);
    const hasTranslation = sourceSet?.translation != null || outputSet?.translation != null;
    const hasRotation = sourceSet?.rotation != null || outputSet?.rotation != null;
    const pathLabel = [hasTranslation ? 'POSITION' : '', hasRotation ? 'ROTATION' : '']
      .filter((label) => label.length > 0)
      .join(' + ');

    const label = document.createElement('div');
    label.className = 'track-label track-bone-label';
    const color = document.createElement('span');
    color.className = 'track-color transforms';
    const name = document.createElement('span');
    name.className = 'track-bone-name';
    name.textContent = formatBoneName(bone);
    const path = document.createElement('small');
    path.textContent = pathLabel;
    label.append(color, name, path);

    const lane = document.createElement('div');
    lane.className = 'track-lane track-bone-lane';
    lane.dataset.bone = bone;
    const row = document.createElement('div');
    row.className = 'key-row';
    lane.append(row);
    dom.transformBoneLabels.append(label);
    dom.transformBoneLanes.append(lane);
    renderKeyRow(row, times, duration, 'transforms', false, provisionalTimesFor(sourceTimes, outputTimes));
  });
}

function getTimelinePixelsPerSecond(duration: number): number {
  if (state.timelinePixelsPerSecond == null) {
    const availableWidth = dom.timelineScroll.clientWidth;
    state.timelinePixelsPerSecond = availableWidth > 0
      ? availableWidth / Math.max(0.001, duration)
      : DEFAULT_TIMELINE_PIXELS_PER_SECOND;
  }
  return state.timelinePixelsPerSecond;
}

function updateStickyTimelineRuler(): void {
  const bodyRect = dom.timelineBody.getBoundingClientRect();
  const scrollRect = dom.timelineScroll.getBoundingClientRect();
  dom.timelineRulerSticky.style.left = `${Math.round(scrollRect.left)}px`;
  dom.timelineRulerSticky.style.top = `${Math.round(bodyRect.top)}px`;
  dom.timelineRulerSticky.style.width = `${Math.round(scrollRect.width)}px`;
  const ruler = dom.timelineRuler.cloneNode(true) as HTMLElement;
  ruler.removeAttribute('id');
  ruler.style.left = `${TIMELINE_EDGE_PADDING}px`;
  ruler.style.width = `${Math.round(dom.timelineRuler.getBoundingClientRect().width)}px`;
  ruler.style.transform = `translateX(-${dom.timelineScroll.scrollLeft}px)`;
  dom.timelineRulerSticky.replaceChildren(ruler);
}

function renderTimeline(): void {
  updateTransformsExpansionUi();
  if (state.animation == null) {
    dom.transformsKeys.replaceChildren();
    dom.transformBoneLabels.replaceChildren();
    dom.transformBoneLanes.replaceChildren();
    dom.faceKeys.replaceChildren();
    dom.timelineRuler.replaceChildren();
    dom.timelineRulerSticky.replaceChildren();
    updatePlayhead();
    return;
  }
  const { duration, tracks } = state.animation;
  const motionTimes = uniqueKeyTimes(tracks);
  const expressionTimes = uniqueExpressionKeyTimes(state.animation.expressionTracks);
  const isBakePreview = state.animation.bakePreview != null;
  const isTuningPreview = isBakePreview;
  const sourceTracks = state.animation.sourceTracks;
  const sourceMotionTimes = uniqueKeyTimes(sourceTracks);
  const sourceExpressionTimes = uniqueExpressionKeyTimes(state.animation.sourceExpressionTracks);
  const transformsSourceTimes = mergeKeyTimes(
    laneTimes(sourceTracks, ['translation']),
    laneTimes(sourceTracks, ['rotation']),
  );
  const transformsOutputTimes = mergeKeyTimes(
    laneTimes(tracks, ['translation']),
    laneTimes(tracks, ['rotation']),
  );
  const provisionalTimesFor = (sourceTimes: number[], outputTimes: number[]): Set<number> => {
    if (isBakePreview) return new Set([
      ...sourceTimes.filter((time) => !outputTimes.includes(time)),
      ...outputTimes.filter((time) => !sourceTimes.includes(time)),
    ]);
    return new Set<number>();
  };
  const transformsTimes = isTuningPreview
    ? mergeKeyTimes(transformsSourceTimes, transformsOutputTimes)
    : transformsOutputTimes;
  const faceOutputTimes = state.animation.source === 'preview' ? motionTimes.filter((_, index) => index % 2 === 0) : expressionTimes;
  const faceSourceTimes = state.animation.source === 'preview'
    ? sourceMotionTimes.filter((_, index) => index % 2 === 0)
    : sourceExpressionTimes;
  const faceTimes = isTuningPreview ? mergeKeyTimes(faceSourceTimes, faceOutputTimes) : faceOutputTimes;
  renderKeyRow(
    dom.transformsKeys,
    transformsTimes,
    duration,
    'transforms',
    false,
    provisionalTimesFor(transformsSourceTimes, transformsOutputTimes),
  );
  renderTransformBoneRows(sourceTracks, tracks, duration, isTuningPreview, provisionalTimesFor);
  renderKeyRow(dom.faceKeys, faceTimes, duration, 'face', true, provisionalTimesFor(faceSourceTimes, faceOutputTimes));
  const fps = Math.max(1, state.animation.sourceFps);
  const totalFrames = Math.max(1, Math.round(duration * fps));
  dom.timelineRuler.replaceChildren();
  const frameStep = `${100 / totalFrames}%`;
  const secondStep = `${duration <= 0 ? 100 : (1 / duration) * 100}%`;
  dom.timelineRuler.style.setProperty('--frame-step', frameStep);
  dom.timelineRuler.style.setProperty('--second-step', secondStep);
  dom.trackLanes.style.setProperty('--frame-step', frameStep);
  dom.trackLanes.style.setProperty('--second-step', secondStep);
  const pixelsPerSecond = getTimelinePixelsPerSecond(duration);
  const trackWidth = Math.max(1, duration * pixelsPerSecond * state.zoom);
  dom.timelineScrollContent.style.width = `${trackWidth + TIMELINE_EDGE_PADDING * 2}px`;
  dom.timelineRuler.style.width = '100%';
  dom.trackLanes.style.width = '100%';
  const timeRow = document.createElement('div');
  timeRow.className = 'ruler-row ruler-time-row';
  const secondCount = Math.floor(duration + 0.0001);
  for (let second = 0; second <= secondCount; second += 1) {
    const time = second;
    const mark = document.createElement('span');
    mark.className = 'ruler-mark';
    mark.style.left = `${duration <= 0 ? 0 : (time / duration) * 100}%`;
    mark.textContent = formatTimelineSecond(time);
    timeRow.append(mark);
  }
  if (duration - secondCount > 0.0001) {
    const mark = document.createElement('span');
    mark.className = 'ruler-mark ruler-final-time-mark';
    mark.style.left = '100%';
    mark.textContent = formatTimelineSecond(duration);
    timeRow.append(mark);
  }
  dom.timelineRuler.append(timeRow);
  const frameRow = document.createElement('div');
  frameRow.className = 'ruler-row ruler-frame-row';
  for (let frame = 0; frame <= totalFrames; frame += 10) {
    const mark = document.createElement('span');
    mark.className = 'ruler-mark';
    mark.style.left = `${(frame / totalFrames) * 100}%`;
    mark.textContent = `F ${formatFrame(frame)}`;
    frameRow.append(mark);
  }
  if (totalFrames % 10 !== 0) {
    const mark = document.createElement('span');
    mark.className = 'ruler-mark';
    mark.style.left = '100%';
    mark.textContent = `F ${formatFrame(totalFrames)}`;
    frameRow.append(mark);
  }
  dom.timelineRuler.append(frameRow);
  updateStickyTimelineRuler();
  updatePlayhead();
}

function updatePlayhead(): void {
  const duration = state.animation?.duration ?? 1;
  const fps = Math.max(1, state.animation?.sourceFps ?? 30);
  const displayTime = snapTimeToFrame(state.time);
  const percent = clamp((displayTime / duration) * 100, 0, 100);
  dom.playhead.style.left = `${percent}%`;
  const frame = Math.round(displayTime * fps);
  dom.currentFrame.textContent = `F ${formatFrame(frame)}`;
  dom.totalFrames.textContent = formatFrame(Math.round(duration * fps));
  dom.currentTime.textContent = formatSeconds(displayTime);
}

function snapTimeToFrame(time: number): number {
  const animation = state.animation;
  if (animation == null) return time;
  const fps = Math.max(1, animation.sourceFps);
  return clamp(Math.round(time * fps) / fps, 0, animation.duration);
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
  dom.bonesReadout.textContent = `${mapped} / ${total} BONES MAPPED`;
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
  updatePlayhead();
}

function setPlayState(playing: boolean): void {
  state.isPlaying = playing;
  if (state.action != null) state.action.paused = !playing;
  dom.playIcon.textContent = playing ? 'Ⅱ' : '▶';
  dom.play.setAttribute('aria-label', playing ? '一時停止' : '再生');
}

function seekTo(time: number): void {
  if (state.animation == null) return;
  state.time = snapTimeToFrame(clamp(time, 0, state.animation.duration));
  if (state.mixer != null) {
    // setTime() still evaluates the action, so temporarily clear paused while
    // seeking. Otherwise a paused timeline click would keep the pose at frame 0.
    if (state.action != null) state.action.paused = false;
    state.mixer.setTime(state.time);
    if (state.action != null) state.action.paused = !state.isPlaying;
  }
  if (state.model?.vrm != null) state.model.vrm.update(0);
  updatePlayhead();
}

function seekFromPointer(clientX: number): void {
  if (state.animation == null) return;
  const trackRect = dom.trackLanes.getBoundingClientRect();
  const width = Math.max(1, trackRect.width);
  const localX = clientX - trackRect.left;
  seekTo(clamp(localX / width, 0, 1) * state.animation.duration);
}

function resetView(): void {
  fitCameraToModel();
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

function createVrmaBlob(animation: AnimationState): Blob {
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
    asset: { version: '2.0', generator: 'Motion Forge VRMA Converter' },
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
  renderTimeline();
  updateInterface();
}

function bindEvents(): void {
  setViewportBackground('dark');
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

  dom.play.addEventListener('click', () => setPlayState(!state.isPlaying));
  dom.previousFrame.addEventListener('click', () => seekTo(Math.max(0, state.time - 1 / (state.animation?.sourceFps ?? 30))));
  dom.nextFrame.addEventListener('click', () => seekTo(Math.min(state.animation?.duration ?? 0, state.time + 1 / (state.animation?.sourceFps ?? 30))));
  dom.speedMultiplier.addEventListener('input', () => {
    const multiplier = Number(dom.speedMultiplier.value);
    if (!Number.isFinite(multiplier) || multiplier <= 0) return;
    state.speedMultiplier = multiplier;
    applySpeed();
  });
  dom.viewportBackgroundButton.addEventListener('click', toggleViewportBackground);
  dom.resetView.addEventListener('click', resetView);
  dom.viewportZoomOutButton.addEventListener('click', zoomViewportOut);
  dom.viewportZoomButton.addEventListener('click', zoomViewportIn);
  dom.viewportZoomRange.addEventListener('input', () => setViewportZoom(Number(dom.viewportZoomRange.value)));
  dom.transformsToggle.addEventListener('click', () => {
    state.transformsExpanded = !state.transformsExpanded;
    renderTimeline();
  });
  dom.timelineBody.addEventListener('scroll', () => {
    updateStickyTimelineRuler();
    scheduleAlwaysScrollbarRefresh();
  }, { passive: true });
  dom.timelineScroll.addEventListener('scroll', () => {
    updateStickyTimelineRuler();
    scheduleAlwaysScrollbarRefresh();
  }, { passive: true });
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
  dom.zoomIn.addEventListener('click', () => { state.zoom = clamp(state.zoom + 0.25, 1, 3); renderTimeline(); });
  dom.zoomOut.addEventListener('click', () => { state.zoom = clamp(state.zoom - 0.25, 1, 3); renderTimeline(); });

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
          seekFromPointer(seekingPointerX);
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
    seekFromPointer(event.clientX);
    startTimelineAutoScroll();
  });
  dom.timelineScroll.addEventListener('pointermove', (event) => {
    if (!seeking) return;
    seekingPointerX = event.clientX;
    seekFromPointer(event.clientX);
  });
  const stopSeeking = (): void => {
    seeking = false;
    stopTimelineAutoScroll();
  };
  dom.timelineScroll.addEventListener('pointerup', stopSeeking);
  dom.timelineScroll.addEventListener('pointercancel', stopSeeking);
  dom.timelineScroll.addEventListener('lostpointercapture', stopSeeking);
  window.addEventListener('resize', resizeRenderer);
  window.addEventListener('resize', updateStickyTimelineRuler);
}

function resizeRenderer(): void {
  const rect = dom.viewportShell.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animate(): void {
  requestAnimationFrame(animate);
  const delta = Math.min(0.05, clock.getDelta());
  controls.update();
  if (state.animation != null && state.isPlaying && state.mixer != null) {
    state.time += delta;
    if (state.time > state.animation.duration) state.time %= state.animation.duration;
    state.mixer.setTime(state.time);
  }
  if (state.model?.vrm != null) state.model.vrm.update(delta);
  renderer.render(scene, camera);
  mmdPlayer.update(delta);
  if (performance.now() - state.lastUiUpdate > 40) {
    state.lastUiUpdate = performance.now();
    updatePlayhead();
  }
}

async function bootstrap(): Promise<void> {
  bindEvents();
  installAlwaysVisibleScrollbars();
  resizeRenderer();
  installPreview();
  animate();
  try {
    await loadVrmUrl(defaultVrmUrl, 'model.vrm', 'bundled');
  } catch {
    showToast('assets/model.vrm の読み込みに失敗しました');
  }
}


void bootstrap();
