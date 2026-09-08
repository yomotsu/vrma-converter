import * as THREE from 'three';

import { MMDAnimationHelper } from './animation/MMDAnimationHelper.js';
import { MMDLoader } from './loaders/MMDLoader.js';

export type MMDPlayerOptions = {
  modelUrl: string;
};

type MMDLoadResult = {
  mesh: THREE.SkinnedMesh;
  animation: THREE.AnimationClip;
};

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error('MMD モーションの読み込みに失敗しました');
}

/**
 * A self-contained, read-only MMD preview rendered into the overlay canvas.
 *
 * This player intentionally owns its scene, camera, and MMD animation helper.
 * The VRM converter supplies the timeline time so the preview can follow it.
 */
export class MMDPlayer {
  private readonly canvas: HTMLCanvasElement;
  private readonly modelUrl: string;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly loader: MMDLoader;
  private readonly resizeObserver: ResizeObserver | null;
  private mesh: THREE.SkinnedMesh | null = null;
  private helper: MMDAnimationHelper | null = null;
  private loadSequence = 0;
  private requestedTime = 0;
  private appliedTime = 0;
  private animationDuration = 0;

  public constructor(canvas: HTMLCanvasElement, options: MMDPlayerOptions) {
    this.canvas = canvas;
    this.modelUrl = options.modelUrl;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.01, 1000);
    this.camera.position.set(0, 0, 30);
    this.loader = new MMDLoader(THREE.DefaultLoadingManager);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);

    this.scene.add(new THREE.AmbientLight(0xffffff, 2.2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
    keyLight.position.set(-1, 1.5, 2);
    this.scene.add(keyLight);

    this.resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => this.resize());
    this.resizeObserver?.observe(canvas);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  /** Load the bundled PMX model and play the supplied VMD file. */
  public async playVmd(file: File): Promise<void> {
    const request = ++this.loadSequence;
    const animationUrl = URL.createObjectURL(file);
    try {
      const result = await this.loadWithAnimation(this.modelUrl, animationUrl);
      if (request !== this.loadSequence) {
        this.disposeMesh(result.mesh);
        return;
      }
      this.install(result);
    } finally {
      URL.revokeObjectURL(animationUrl);
    }
  }

  /** Set the MMD animation to the converter timeline's time in seconds. */
  public setTime(time: number): void {
    this.requestedTime = Number.isFinite(time) ? Math.max(0, time) : 0;
    this.applyRequestedTime();
  }

  /** Render the MMD preview after its pose has been synchronized. */
  public update(_delta: number): void {
    if (this.mesh != null) this.mesh.updateMatrixWorld(true);
    this.renderer.render(this.scene, this.camera);
  }

  private loadWithAnimation(modelUrl: string, animationUrl: string): Promise<MMDLoadResult> {
    return new Promise((resolve, reject) => {
      this.loader.loadWithAnimation(
        modelUrl,
        animationUrl,
        (result: MMDLoadResult) => resolve(result),
        undefined,
        (error: unknown) => reject(toError(error)),
      );
    });
  }

  private install(result: MMDLoadResult): void {
    this.removeCurrentMesh();
    this.mesh = result.mesh;
    this.animationDuration = Math.max(0, result.animation.duration);
    this.appliedTime = 0;
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);

    this.helper = new MMDAnimationHelper({ sync: false, pmxAnimation: true });
    this.helper.add(this.mesh, { animation: result.animation, physics: false });
    this.frameMesh(this.mesh);
    this.applyRequestedTime();
  }

  private applyRequestedTime(): void {
    if (this.helper == null) return;
    const targetTime = Math.min(this.requestedTime, this.animationDuration);
    const delta = targetTime - this.appliedTime;
    if (delta !== 0) this.helper.update(delta);
    this.appliedTime = targetTime;
  }

  private frameMesh(mesh: THREE.SkinnedMesh): void {
    mesh.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(mesh);
    if (bounds.isEmpty()) return;

    const center = bounds.getCenter(new THREE.Vector3());
    mesh.position.sub(center);
    mesh.updateMatrixWorld(true);

    const framedSize = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
    const viewSize = Math.max(framedSize.x, framedSize.y, framedSize.z, 0.01);
    const distance = (viewSize / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 1.2);
    this.camera.position.set(0, 0, Math.max(0.1, distance));
    this.camera.near = Math.max(0.01, distance / 100);
    this.camera.far = Math.max(100, distance * 20);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();

  }

  private resize = (): void => {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width || 256);
    const height = Math.max(1, rect.height || 256);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };

  private removeCurrentMesh(): void {
    if (this.helper != null && this.mesh != null) {
      this.helper.remove(this.mesh);
      this.helper = null;
    }
    if (this.mesh == null) return;
    this.scene.remove(this.mesh);
    this.disposeMesh(this.mesh);
    this.mesh = null;
    this.animationDuration = 0;
    this.appliedTime = 0;
  }

  private disposeMesh(mesh: THREE.SkinnedMesh): void {
    const textures = new Set<THREE.Texture>();
    mesh.traverse((object) => {
      const drawable = object as THREE.Mesh;
      drawable.geometry?.dispose();
      const materials = Array.isArray(drawable.material)
        ? drawable.material
        : drawable.material == null ? [] : [drawable.material];
      materials.forEach((material) => {
        const materialRecord = material as THREE.Material & Record<string, unknown>;
        for (const value of Object.values(materialRecord)) {
          if (value instanceof THREE.Texture) textures.add(value);
        }
        material.dispose();
      });
    });
    textures.forEach((texture) => texture.dispose());
  }
}
