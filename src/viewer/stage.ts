import * as THREE from 'three';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import type { VRM } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, VRMLookAtQuaternionProxy } from '@pixiv/three-vrm-animation';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { HUMAN_BONES } from '../animation/rigMapping.ts';
import type { BoneName } from '../animation/types.js';
import type { DomElements } from '../ui/dom.js';

export type ModelState = {
  root: THREE.Object3D;
  vrm?: VRM;
  bones: Partial<Record<BoneName, THREE.Object3D>>;
  name: string;
  source: 'bundled' | 'local';
  objectUrl?: string;
  height: number;
};

export type StageDom = Pick<
  DomElements,
  'viewport' | 'viewportShell' | 'viewportZoomRange' | 'viewportBackgroundButton' | 'bonesToggleButton'
>;

export type StageController = {
  loadVrmUrl(
    url: string,
    name: string,
    source: ModelState['source'],
    objectUrl?: string,
    previousModel?: ModelState | null,
  ): Promise<ModelState>;
  replaceModel(nextModel: ModelState, previousModel: ModelState | null): void;
  fitCameraToModel(model: ModelState | null): void;
  setViewportBackground(background: 'dark' | 'light'): void;
  toggleViewportBackground(): void;
  setBonesVisible(visible: boolean): void;
  toggleBonesVisible(): void;
  setViewportZoom(value: number): void;
  zoomViewportIn(): void;
  zoomViewportOut(): void;
  resize(): void;
  render(): void;
};

const STAGE_SHADOW_FOOT_BONES: BoneName[] = ['leftFoot', 'leftToes', 'rightFoot', 'rightToes'];
const STAGE_SHADOW_FOOT_WEIGHT_THRESHOLD = 0.2;
const STAGE_GRID_SIZE = 7;
const STAGE_GRID_DIVISIONS = 28;
const STAGE_GRID_CELL_SIZE = STAGE_GRID_SIZE / STAGE_GRID_DIVISIONS;
const STAGE_SHADOW_RADIUS_IN_GRID_CELLS = 5;
const STAGE_RING_INNER_RADIUS_IN_GRID_CELLS = 5.9;
const STAGE_RING_OUTER_RADIUS_IN_GRID_CELLS = 6;
const STAGE_SHADOW_RADIUS = STAGE_GRID_CELL_SIZE * STAGE_SHADOW_RADIUS_IN_GRID_CELLS;
const STAGE_RING_INNER_RADIUS = STAGE_RING_INNER_RADIUS_IN_GRID_CELLS / STAGE_SHADOW_RADIUS_IN_GRID_CELLS;
const STAGE_RING_OUTER_RADIUS = STAGE_RING_OUTER_RADIUS_IN_GRID_CELLS / STAGE_SHADOW_RADIUS_IN_GRID_CELLS;
const STAGE_FLOOR_DARK_MODE_COLOR = 0xffffff;
const STAGE_FLOOR_LIGHT_MODE_COLOR = 0x0a242d;
const STAGE_FLOOR_OPACITY = 0.22;
const STAGE_GRID_DARK_MODE_COLORS = [0x4ba7ac, 0x235764] as const;
const STAGE_GRID_LIGHT_MODE_COLORS = [0x2a6d71, 0x16333f] as const;
const STAGE_GRID_DARK_MODE_OPACITY = 0.55;
const STAGE_GRID_LIGHT_MODE_OPACITY = 0.28;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getObjectHeight(object: THREE.Object3D): number {
  const box = new THREE.Box3().setFromObject(object);
  return Math.max(0.1, box.max.y - box.min.y);
}

export function createBoneHelper(root: THREE.Object3D): THREE.SkeletonHelper {
  const helper = new THREE.SkeletonHelper(root);
  helper.visible = false;
  return helper;
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

function getHorizontalDistance(first: THREE.Vector3 | undefined, second: THREE.Vector3 | undefined): number {
  if (first == null || second == null) return 0;
  return Math.hypot(first.x - second.x, first.z - second.z);
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

export function createStage(stageDom: StageDom): StageController {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x07111c, 0.055);
  const renderer = new THREE.WebGLRenderer({
    canvas: stageDom.viewport,
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
  const controls = new OrbitControls(camera, stageDom.viewport);
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 2;
  controls.maxDistance = 8;
  controls.target.set(0, 1.08, 0);
  controls.update();

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
  const grid = new THREE.GridHelper(
    STAGE_GRID_SIZE,
    STAGE_GRID_DIVISIONS,
    STAGE_GRID_DARK_MODE_COLORS[0],
    STAGE_GRID_DARK_MODE_COLORS[1],
  );
  const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
  const setStageGridAppearance = (isLight: boolean): void => {
    const colors = isLight ? STAGE_GRID_LIGHT_MODE_COLORS : STAGE_GRID_DARK_MODE_COLORS;
    const opacity = isLight ? STAGE_GRID_LIGHT_MODE_OPACITY : STAGE_GRID_DARK_MODE_OPACITY;
    gridMaterials.forEach((material, index) => {
      material.transparent = true;
      material.opacity = opacity;
      if (material instanceof THREE.LineBasicMaterial) material.color.set(colors[index] ?? colors[0]);
    });
  };
  setStageGridAppearance(false);
  stageGroup.add(grid);

  const floorMaterial = new THREE.MeshBasicMaterial({
    color: STAGE_FLOOR_DARK_MODE_COLOR,
    transparent: true,
    opacity: STAGE_FLOOR_OPACITY,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 80), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.renderOrder = 1;
  floor.visible = false;
  stageGroup.add(floor);

  const floorRing = new THREE.Mesh(
    new THREE.RingGeometry(STAGE_RING_INNER_RADIUS, STAGE_RING_OUTER_RADIUS, 96),
    new THREE.MeshBasicMaterial({ color: 0x53cfc8, opacity: 1, side: THREE.DoubleSide }),
  );
  floorRing.rotation.x = -Math.PI / 2;
  floorRing.visible = false;
  stageGroup.add(floorRing);

  const gltfLoader = new GLTFLoader();
  gltfLoader.crossOrigin = 'anonymous';
  gltfLoader.register((parser) => new VRMLoaderPlugin(parser));
  gltfLoader.register((parser) => new VRMAnimationLoaderPlugin(parser));

  let activeModel: ModelState | null = null;
  let boneHelper: THREE.SkeletonHelper | null = null;
  let bonesVisible = false;

  function disposeBoneHelper(): void {
    if (boneHelper == null) return;
    scene.remove(boneHelper);
    boneHelper.geometry.dispose();
    const material = boneHelper.material;
    if (Array.isArray(material)) material.forEach((item) => item.dispose());
    else material.dispose();
    boneHelper = null;
  }

  function refreshBoneHelper(): void {
    disposeBoneHelper();
    if (activeModel != null && bonesVisible) {
      boneHelper = createBoneHelper(activeModel.root);
      boneHelper.visible = true;
      scene.add(boneHelper);
    }
    stageDom.bonesToggleButton.classList.toggle('active', bonesVisible);
    stageDom.bonesToggleButton.setAttribute('aria-pressed', String(bonesVisible));
    stageDom.bonesToggleButton.setAttribute('aria-label', bonesVisible ? 'ボーンを非表示' : 'ボーンを表示');
    stageDom.bonesToggleButton.title = bonesVisible ? 'ボーンを非表示' : 'ボーンを表示';
  }

  function updateStageShadow(model: ModelState | null): void {
    if (model == null) {
      floor.visible = false;
      floorRing.visible = false;
      return;
    }
    const bounds = getStageShadowFootprint(model, getStageShadowFootBones(model));
    if (bounds == null) {
      floor.visible = false;
      floorRing.visible = false;
      return;
    }
    const radius = STAGE_SHADOW_RADIUS;
    const centerX = (bounds.min.x + bounds.max.x) * 0.5;
    const centerZ = (bounds.min.z + bounds.max.z) * 0.5;
    floor.scale.setScalar(radius);
    floor.position.set(centerX, 0, centerZ);
    floorRing.scale.setScalar(radius);
    floorRing.position.set(centerX, 0, centerZ);
    floor.visible = true;
    floorRing.visible = true;
  }

  function updateViewportZoomUi(): void {
    const span = Math.max(0.001, controls.maxDistance - controls.minDistance);
    const zoom = ((controls.maxDistance - controls.getDistance()) / span) * 100;
    stageDom.viewportZoomRange.value = clamp(zoom, 0, 100).toFixed(0);
  }
  controls.addEventListener('change', updateViewportZoomUi);

  function fitCameraToModel(model: ModelState | null): void {
    if (model == null) return;
    const height = model.height || getObjectHeight(model.root);
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

  function setViewportDistance(distance: number): void {
    const nextDistance = clamp(distance, controls.minDistance, controls.maxDistance);
    const direction = camera.position.clone().sub(controls.target);
    if (direction.lengthSq() < 0.000001) direction.set(0, 0, 1);
    direction.normalize();
    camera.position.copy(controls.target).addScaledVector(direction, nextDistance);
    controls.update();
    updateViewportZoomUi();
  }

  function setViewportBackground(background: 'dark' | 'light'): void {
    const isLight = background === 'light';
    stageDom.viewportShell.classList.toggle('light-background', isLight);
    setStageGridAppearance(isLight);
    floorMaterial.color.set(isLight ? STAGE_FLOOR_LIGHT_MODE_COLOR : STAGE_FLOOR_DARK_MODE_COLOR);
    floorMaterial.opacity = STAGE_FLOOR_OPACITY;
    stageDom.viewportBackgroundButton.setAttribute('aria-pressed', String(isLight));
    const nextBackgroundLabel = isLight ? '黒っぽい背景に切り替え' : '白っぽい背景に切り替え';
    stageDom.viewportBackgroundButton.title = nextBackgroundLabel;
    stageDom.viewportBackgroundButton.setAttribute('aria-label', nextBackgroundLabel);
  }

  async function loadVrmUrl(
    url: string,
    name: string,
    source: ModelState['source'],
    objectUrl?: string,
    previousModel?: ModelState | null,
  ): Promise<ModelState> {
    if (previousModel != null) previousModel.root.visible = false;
    updateStageShadow(null);
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
      return {
        root: vrm.scene,
        vrm,
        bones: getVrmBones(vrm),
        name,
        source,
        objectUrl,
        height: getObjectHeight(vrm.scene),
      };
    } catch (error) {
      if (previousModel != null) {
        previousModel.root.visible = true;
        updateStageShadow(previousModel);
      }
      if (objectUrl != null) URL.revokeObjectURL(objectUrl);
      throw error;
    }
  }

  function replaceModel(nextModel: ModelState, previousModel: ModelState | null): void {
    disposeBoneHelper();
    if (previousModel != null) {
      scene.remove(previousModel.root);
      disposeObject(previousModel.root);
      if (previousModel.objectUrl != null) URL.revokeObjectURL(previousModel.objectUrl);
    }
    scene.add(nextModel.root);
    activeModel = nextModel;
    nextModel.root.traverse((object) => { object.frustumCulled = false; });
    updateStageShadow(nextModel);
    refreshBoneHelper();
    fitCameraToModel(nextModel);
  }

  function toggleViewportBackground(): void {
    const isLight = stageDom.viewportShell.classList.contains('light-background');
    setViewportBackground(isLight ? 'dark' : 'light');
  }

  function setBonesVisible(visible: boolean): void {
    bonesVisible = visible;
    refreshBoneHelper();
  }

  function toggleBonesVisible(): void {
    setBonesVisible(!bonesVisible);
  }

  function setViewportZoom(value: number): void {
    const normalized = clamp(value, 0, 100) / 100;
    const distance = controls.maxDistance - normalized * (controls.maxDistance - controls.minDistance);
    setViewportDistance(distance);
  }

  function resize(): void {
    const rect = stageDom.viewportShell.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function render(): void {
    controls.update();
    renderer.render(scene, camera);
  }

  return {
    loadVrmUrl,
    replaceModel,
    fitCameraToModel,
    setViewportBackground,
    toggleViewportBackground,
    setBonesVisible,
    toggleBonesVisible,
    setViewportZoom,
    zoomViewportIn: () => setViewportDistance(controls.getDistance() * 0.82),
    zoomViewportOut: () => setViewportDistance(controls.getDistance() / 0.82),
    resize,
    render,
  };
}
