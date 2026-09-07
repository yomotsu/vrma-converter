# Internal ESM Module Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `src/main.ts` の変換、書き出し、Three.js、UI処理を内部ESMモジュールへ分割し、既存のVRMA Converterの挙動を維持したままコードを読みやすくする。

**Architecture:** `main.ts` をアプリ状態とイベント配線に絞り、アニメーション変換を `src/animation`、VRMA出力を `src/vrma`、Three.jsステージを `src/viewer`、DOM依存の表示処理を `src/ui` へ移す。変換モジュールはDOMとアプリstateへ依存せず、FBXのリグ選択だけをコールバックで受け取る。

**Tech Stack:** TypeScript ES Modules, Vite, three.js `^0.180.0`, `@pixiv/three-vrm` `^3.5.3`, `@pixiv/three-vrm-animation` `^3.5.3`, Node built-in test runner with `--experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-09-07-main-esm-module-refactor-design.md`

## Global Constraints

- 外部向けのライブラリAPI、npm公開エントリポイント、依存ライブラリの追加は行わない。
- `package.json` の既存の `"type": "module"` を維持する。
- production sourceの相対importは明示的な `.js` specifierを使い、型だけの依存には `import type` を使う。
- UIデザイン、対応フォーマット、リターゲット結果、MMD preview/bakerの挙動を変更しない。
- Mixamo、Universal rig、BVH、VRMAの変換結果は、分割前と同じ内部トラック、duration、source FPS、hipsの正規化情報を返す。
- FBXリグ選択のキャンセル、アニメーションなし、humanoidが0本の入力は現在と同じtoast経路へ渡す。
- 既存のNodeテストの `.ts` importと `--experimental-strip-types` を維持する。
- 既存の未コミット変更（`index.html`、`src/main.ts`、`src/mmd/MMDHumanoidRetargeter.ts`、`src/style.css`、`test/mmd/MMDHumanoidRetargeter.test.ts`）を破棄・上書きしない。
- 各タスクは実装前に対応するテストを追加し、テストが意図した理由で失敗することを確認してからproduction codeを追加する。
- `dist/` の生成物はコミットしない。

---

### Task 1: Add shared animation types and track utilities

**Files:**
- Create: `src/animation/types.ts`
- Create: `src/animation/trackUtils.ts`
- Create: `test/animation/trackUtils.test.ts`
- Modify: `src/mmd/MMDMotionMath.ts`
- Modify: `src/mmd/MMDMotionBaker.ts`
- Modify: `src/mmd/MMDHumanoidRetargeter.ts`

**Interfaces:**
- Produces `BoneName`, `TrackPath`, `MotionTrackSet`, `ExpressionTrackSet`, `BakeSettings`, `LoadedClip`, `AnimationState` from `src/animation/types.ts`.
- Produces `setTrack`, `cloneTrackSet`, `emptyExpressionTrackSet`, `cloneExpressionTrackSet`, `makeQuaternionTrack`, `makeContinuousQuaternionTrack`, `makeVectorTrack`, `fixedBakeTimes`, `sampleTrack`, `sampleNumberTrack`, `processTracks`, `processExpressionTracks`, `scaleTrackTimes`, `scaleTrackSetTimes`, `scaleExpressionTrackSetTimes`, `continuousQuaternionValues`, `normalizeBakeFps`, and `maxBakeFrameStepForFps` from `src/animation/trackUtils.ts`.
- Keeps `MMDMotionMath.ts` as the MMD-specific frame-time module while re-exporting the generic `continuousQuaternionValues` from `trackUtils.ts`, so existing MMD imports continue to work.

- [ ] **Step 1: Write failing tests for track cloning, bake sampling, and speed scaling**

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  cloneTrackSet,
  fixedBakeTimes,
  sampleTrack,
  scaleTrackSetTimes,
  setTrack,
} from '../../src/animation/trackUtils.ts';

test('fixedBakeTimes keeps the duration and the original final key', () => {
  assert.deepEqual(fixedBakeTimes(1, 30, 2, [0.73]), [0, 0.5, 0.73, 1]);
});

test('sampleTrack preserves quaternion continuity and source interpolation', () => {
  const source = new THREE.QuaternionKeyframeTrack(
    'hips.quaternion',
    [0, 1],
    [0, 0, 0, 1, 0, 0, 0, -1],
  );
  source.setInterpolation(THREE.InterpolateDiscrete);
  const sampled = sampleTrack(source, 1, { fps: 30, frameStep: 1 }, 'rotation');

  assert.equal(sampled.getInterpolation(), THREE.InterpolateDiscrete);
  assert.equal(sampled.times.length, 3);
  assert.deepEqual(Array.from(sampled.values).slice(0, 8), [0, 0, 0, 1, 0, 0, 0, 1]);
});

test('scaleTrackSetTimes clones tracks and divides key times by the multiplier', () => {
  const source = new Map();
  setTrack(source, 'hips', 'translation', new THREE.VectorKeyframeTrack('', [0, 2], [0, 1, 0, 0, 1, 0]));
  const scaled = scaleTrackSetTimes(source, 2);

  assert.deepEqual(Array.from(scaled.get('hips')!.translation!.times), [0, 1]);
  assert.notEqual(scaled.get('hips')!.translation, source.get('hips')!.translation);
  assert.deepEqual(Array.from(cloneTrackSet(source).get('hips')!.translation!.times), [0, 2]);
});
```

- [ ] **Step 2: Run the focused test and verify the expected missing-module failure**

Run: `node --test --experimental-strip-types test/animation/trackUtils.test.ts`

Expected: FAIL because `src/animation/trackUtils.ts` does not exist yet.

- [ ] **Step 3: Create the shared types and minimal utility implementations**

Move the exact existing `BoneName` union and the existing `MotionTrackSet`, `ExpressionTrackSet`, `BakeSettings`, `LoadedClip`, and `AnimationState` field definitions from `src/main.ts:24-124` into `src/animation/types.ts`. Use type-only imports for `three`, `VRM`, and `VRMAnimation`.

Implement the utility signatures below by moving the corresponding functions from `src/main.ts:805-925, 1396-1520, 2008-2032` without changing formulas or interpolation behavior:

```typescript
export function setTrack(
  set: MotionTrackSet,
  bone: BoneName,
  path: TrackPath,
  track: THREE.KeyframeTrack,
): void;

export function cloneTrackSet(source: MotionTrackSet): MotionTrackSet;
export function emptyExpressionTrackSet(): ExpressionTrackSet;
export function cloneExpressionTrackSet(source: ExpressionTrackSet): ExpressionTrackSet;
export function makeQuaternionTrack(name: string, times: number[], values: number[]): THREE.QuaternionKeyframeTrack;
export function makeContinuousQuaternionTrack(name: string, times: number[], values: number[]): THREE.QuaternionKeyframeTrack;
export function makeVectorTrack(name: string, times: number[], values: number[]): THREE.VectorKeyframeTrack;
export function fixedBakeTimes(duration: number, fps: number, frameStep: number, preservedTimes?: number[]): number[];
export function sampleTrack(track: THREE.KeyframeTrack, duration: number, settings: BakeSettings, path: TrackPath): THREE.KeyframeTrack;
export function sampleNumberTrack(track: THREE.NumberKeyframeTrack, duration: number, settings: BakeSettings): THREE.NumberKeyframeTrack;
export function processTracks(source: MotionTrackSet, duration: number, bakeSettings: BakeSettings | null): MotionTrackSet;
export function processExpressionTracks(source: ExpressionTrackSet, duration: number, bakeSettings: BakeSettings | null): ExpressionTrackSet;
export function scaleTrackTimes(track: THREE.KeyframeTrack, multiplier: number): THREE.KeyframeTrack;
export function scaleTrackSetTimes(source: MotionTrackSet, multiplier: number): MotionTrackSet;
export function scaleExpressionTrackSetTimes(source: ExpressionTrackSet, multiplier: number): ExpressionTrackSet;
```

Keep `createMmdFrameTimes()` in `MMDMotionMath.ts`; move its generic quaternion helper to `trackUtils.ts`, and import it from the exact path `../animation/trackUtils.js`.

- [ ] **Step 4: Update production MMD imports to use ESM `.js` specifiers**

Change the touched production imports from `MMDMotionMath.ts` and `MMDExpressionRetargeter.ts` to `.js` specifiers, and change `MMDMotionBaker.ts`/`MMDHumanoidRetargeter.ts` to import `continuousQuaternionValues` from `../animation/trackUtils.js`. Leave test imports as `.ts` so the existing Node strip-types test command remains valid.

- [ ] **Step 5: Run the focused tests without changing the existing test glob yet**

Run: `node --test --experimental-strip-types test/animation/trackUtils.test.ts`

Expected: PASS with the three track utility tests.

- [ ] **Step 6: Run the complete current suite and commit only this task's files**

Run: `npm test`

Expected: PASS for all existing MMD/timeline tests. The new track utility test is covered by the focused command in the previous step.

Before staging, run `git diff -- src/mmd/MMDMotionMath.ts src/mmd/MMDMotionBaker.ts src/mmd/MMDHumanoidRetargeter.ts package.json` and confirm the existing MMD behavior changes are still present. Commit with:

```bash
git add package.json src/animation/types.ts src/animation/trackUtils.ts test/animation/trackUtils.test.ts src/mmd/MMDMotionMath.ts src/mmd/MMDMotionBaker.ts src/mmd/MMDHumanoidRetargeter.ts
git commit -m "refactor: extract animation track utilities"
```

### Task 2: Extract rig mapping and the Mixamo parser

**Files:**
- Create: `src/animation/rigMapping.ts`
- Create: `src/animation/mixamoParser.ts`
- Create: `test/animation/mixamoParser.test.ts`
- Modify: `src/main.ts:925-1190`

**Interfaces:**
- Produces `HUMAN_BONES`, `AnimationRigType`, `getSourceTrackBoneName`, `mapSourceBone`, `mapMixamoBone`, `mapUniversalBone`, `detectAnimationRig`, and `trackPathFor` from `rigMapping.ts`.
- Produces `RetargetedMotion` and `retargetMixamoClip(asset, clip, targetVrm)` from `mixamoParser.ts`.

- [ ] **Step 1: Write failing Mixamo mapping and retargeting tests**

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { detectAnimationRig, mapSourceBone } from '../../src/animation/rigMapping.ts';
import { retargetMixamoClip } from '../../src/animation/mixamoParser.ts';

test('maps Mixamo and common aliases to VRM humanoid names', () => {
  assert.equal(mapSourceBone('mixamorigLeftForeArm'), 'leftLowerArm');
  assert.equal(mapSourceBone('mixamorigRightHandIndex2'), 'rightIndexIntermediate');
  assert.equal(mapSourceBone('pelvis'), 'hips');
});

test('detects a Mixamo rig only when its hips marker is present', () => {
  const asset = new THREE.Group();
  const hips = new THREE.Bone();
  hips.name = 'mixamorigHips';
  asset.add(hips);
  assert.equal(detectAnimationRig(asset), 'mixamo');
});

test('retargetMixamoClip removes rest-world rotation and keeps hips translation', () => {
  const asset = new THREE.Group();
  const hips = new THREE.Bone();
  hips.name = 'mixamorigHips';
  hips.position.set(0, 1, 0);
  const leftArm = new THREE.Bone();
  leftArm.name = 'mixamorigLeftArm';
  leftArm.rotation.y = Math.PI / 2;
  hips.add(leftArm);
  asset.add(hips);
  asset.updateMatrixWorld(true);

  const clip = new THREE.AnimationClip('mixamo', 1, [
    new THREE.QuaternionKeyframeTrack('mixamorigLeftArm.quaternion', [0], [0, 0, 0, 1]),
    new THREE.VectorKeyframeTrack('mixamorigHips.position', [0], [0, 1, 0]),
  ]);
  const result = retargetMixamoClip(asset, clip, null);
  const arm = result.tracks.get('leftUpperArm')!.rotation!;
  const armRotation = new THREE.Quaternion().fromArray(Array.from(arm.values) as [number, number, number, number]);

  assert.equal(result.restHipsY, 1);
  assert.ok(Math.abs(armRotation.angleTo(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2))) < 1e-6);
  assert.deepEqual(Array.from(result.tracks.get('hips')!.translation!.values), [0, 1, 0]);
});
```

- [ ] **Step 2: Run the focused test and verify the expected missing-module failure**

Run: `node --test --experimental-strip-types test/animation/mixamoParser.test.ts`

Expected: FAIL because `src/animation/rigMapping.ts` and `src/animation/mixamoParser.ts` do not exist yet.

- [ ] **Step 3: Move humanoid constants, alias tables, and rig detection into `rigMapping.ts`**

Move `HUMAN_BONES`, `boneAliases`, `mixamoVRMRigMap`, `universalVrmRigMap`, `normalizedBoneText`, `mapSourceBone`, `getSourceTrackBoneName`, `detectAnimationRig`, and `trackPathFor` from `src/main.ts` into the new module. Keep the existing alias precedence and finger normalization exactly, including `mixamorig`, `pinky`, `lshldr`, `rshldr`, and Universal names.

Use these signatures. `HUMAN_BONES` must contain the exact existing list from `src/main.ts:136-149`; do not shorten it or reorder it.

```typescript
export type AnimationRigType = 'mixamo' | 'universal';
export type RetargetedMotion = { tracks: MotionTrackSet; restHipsY: number };
export function mapSourceBone(name: string): BoneName | null;
export function mapMixamoBone(name: string): BoneName | null;
export function mapUniversalBone(name: string): BoneName | null;
export function detectAnimationRig(asset: THREE.Group): AnimationRigType | null;
```

- [ ] **Step 4: Move Mixamo rest-pose correction into `mixamoParser.ts`**

Move `normalizeSourceQuaternionTrack` into `genericParser.ts`; the Mixamo implementation itself must retain the current formula:

```typescript
const quaternion = new THREE.Quaternion()
  .fromArray(sourceValues)
  .premultiply(parentRestWorldRotation)
  .multiply(restRotationInverse)
  .normalize();
```

Implement:

```typescript
export function retargetMixamoClip(
  asset: THREE.Group,
  clip: THREE.AnimationClip,
  targetVrm: VRM | null,
): RetargetedMotion;
```

Filter a source bone when `targetVrm.humanoid.getNormalizedBoneNode(targetName)` is null, preserve only hips translation, and throw the existing hips-height error when `mixamorigHips` is absent or has no positive height.

- [ ] **Step 5: Remove duplicate Mixamo definitions from `main.ts` and run the focused/full tests**

Delete only the moved mapping and Mixamo functions/constants from `main.ts`; keep `chooseFbxRigType` in `main.ts` because it owns the dialog. Update imports to use `HUMAN_BONES`, `AnimationRigType`, and `retargetMixamoClip` from `.js` modules.

Run: `node --test --experimental-strip-types test/animation/mixamoParser.test.ts`

Expected: PASS with three tests.

Run: `npm test`

Expected: PASS with existing MMD/timeline tests, track utility tests, and Mixamo tests.

- [ ] **Step 6: Commit the rig and Mixamo extraction**

```bash
git add src/animation/rigMapping.ts src/animation/mixamoParser.ts test/animation/mixamoParser.test.ts src/main.ts
git commit -m "refactor: extract Mixamo animation parser"
```

### Task 3: Extract Universal, BVH, generic, and VRMA input parsers

**Files:**
- Create: `src/animation/universalParser.ts`
- Create: `src/animation/bvhParser.ts`
- Create: `src/animation/genericParser.ts`
- Create: `src/animation/vrmaParser.ts`
- Create: `test/animation/sourceParsers.test.ts`
- Modify: `src/main.ts:1190-1396`

**Interfaces:**
- Produces `retargetUniversalClip(asset, clip, targetVrm)` from `universalParser.ts`.
- Produces `isDazFriendlyBvh(skeleton)`, `retargetDazBvhClip(skeleton, clip, targetVrm)`, and `estimateBvhRestHipsHeight(skeleton)` from `bvhParser.ts`.
- Produces `retargetGenericClip(clip)` from `genericParser.ts`.
- Produces `tracksFromVrma(animation)` from `vrmaParser.ts`.

- [ ] **Step 1: Write failing tests for Universal coordinate conversion, Daz BVH detection, generic filtering, and VRMA extraction**

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { retargetUniversalClip } from '../../src/animation/universalParser.ts';
import { isDazFriendlyBvh, retargetDazBvhClip } from '../../src/animation/bvhParser.ts';
import { retargetGenericClip } from '../../src/animation/genericParser.ts';
import { tracksFromVrma } from '../../src/animation/vrmaParser.ts';

test('retargets Universal pelvis translation into VRM hips coordinates', () => {
  const asset = new THREE.Group();
  const root = new THREE.Bone();
  root.name = 'root';
  const pelvis = new THREE.Bone();
  pelvis.name = 'pelvis';
  pelvis.position.set(0, 2, 0);
  root.add(pelvis);
  asset.add(root);
  asset.updateMatrixWorld(true);
  const clip = new THREE.AnimationClip('universal', 1, [
    new THREE.VectorKeyframeTrack('pelvis.position', [0], [0, 2, 0]),
    new THREE.QuaternionKeyframeTrack('pelvis.quaternion', [0], [0, 0, 0, 1]),
  ]);

  const result = retargetUniversalClip(asset, clip, null);
  assert.ok(result.tracks.get('hips')?.translation != null);
  assert.ok(result.restHipsY > 0);
});

test('recognizes a Daz-friendly skeleton and normalizes its root movement', () => {
  const names = ['hip', 'abdomen', 'rshldr', 'lshldr', 'rthigh', 'lthigh'];
  const bones = names.map((name) => { const bone = new THREE.Bone(); bone.name = name; return bone; });
  bones[0]!.add(bones[1]!);
  const skeleton = new THREE.Skeleton(bones);
  assert.equal(isDazFriendlyBvh(skeleton), true);
  const clip = new THREE.AnimationClip('daz', 1, [
    new THREE.VectorKeyframeTrack('hip.position', [0, 1], [0, 2, 0, 0, 3, 0]),
  ]);
  const result = retargetDazBvhClip(skeleton, clip, null);
  assert.deepEqual(Array.from(result.tracks.get('hips')!.translation!.values), [0, 1, 0, 0, 2, 0]);
});

test('retargetGenericClip keeps rotations and drops non-hips translations', () => {
  const clip = new THREE.AnimationClip('generic', 1, [
    new THREE.QuaternionKeyframeTrack('mixamorigHead.quaternion', [0], [0, 0, 0, 1]),
    new THREE.VectorKeyframeTrack('mixamorigHead.position', [0], [1, 2, 3]),
  ]);
  const tracks = retargetGenericClip(clip);
  assert.ok(tracks.get('head')?.rotation != null);
  assert.equal(tracks.get('head')?.translation, undefined);
});

test('tracksFromVrma clones humanoid, expression, and look-at tracks', () => {
  const rotation = new THREE.QuaternionKeyframeTrack('', [0], [0, 0, 0, 1]);
  const animation = {
    humanoidTracks: { rotation: new Map([['hips', rotation]]), translation: new Map() },
    expressionTracks: { preset: new Map(), custom: new Map() },
    lookAtTrack: null,
  } as unknown as import('@pixiv/three-vrm-animation').VRMAnimation;
  const result = tracksFromVrma(animation);
  assert.ok(result.tracks.get('hips')?.rotation != null);
  assert.notEqual(result.tracks.get('hips')!.rotation, rotation);
});
```

- [ ] **Step 2: Run the focused test and verify the expected missing-module failure**

Run: `node --test --experimental-strip-types test/animation/sourceParsers.test.ts`

Expected: FAIL because the four new parser modules do not exist yet.

- [ ] **Step 3: Move Universal parser logic without altering coordinate conversion**

Move `evaluateTrackAt` and `retargetUniversalClip` from `src/main.ts:1190-1277` into `universalParser.ts`. Keep the existing Z-up to Y-up quaternions, root-parent matrix, hips translation time union, horizontal rest offset removal, and rest hips height calculation. Use `RetargetedMotion` from `rigMapping.ts` and `makeVectorTrack`/`setTrack` from `trackUtils.ts`.

- [ ] **Step 4: Move BVH and generic parser logic**

Move `isDazFriendlyBvh`, `estimateBvhRestHipsHeight`, `normalizeDazBvhRootTranslation`, and `retargetDazBvhClip` into `bvhParser.ts`. Move `retargetGenericClip`, `normalizeSourceQuaternionTrack`, and `normalizeSourcePositionTrack` into `genericParser.ts`. Keep the existing rule that only hips may emit a generic translation track and the existing Daz root translation normalization.

- [ ] **Step 5: Move VRMA track extraction**

Move `tracksFromVrma` into `vrmaParser.ts`. It must clone VRM humanoid tracks only for names in `HUMAN_BONES`, clone expression maps, and clone the optional look-at Quaternion track:

```typescript
export function tracksFromVrma(animation: VRMAnimation): {
  tracks: MotionTrackSet;
  expressionTracks: ExpressionTrackSet;
  lookAtTrack: THREE.QuaternionKeyframeTrack | null;
};
```

- [ ] **Step 6: Remove duplicate source parser functions from `main.ts` and run tests**

Replace the moved functions with imports, preserving the existing format dispatch temporarily in `main.ts` until Task 4. Run:

`node --test --experimental-strip-types test/animation/sourceParsers.test.ts`

Expected: PASS with four tests.

Run: `npm test`

Expected: PASS with all current and new parser tests.

- [ ] **Step 7: Commit the source parser extraction**

```bash
git add src/animation/universalParser.ts src/animation/bvhParser.ts src/animation/genericParser.ts src/animation/vrmaParser.ts test/animation/sourceParsers.test.ts src/main.ts
git commit -m "refactor: extract animation source parsers"
```

### Task 4: Extract the animation-file dispatcher

**Files:**
- Create: `src/animation/parseAnimationFile.ts`
- Create: `test/animation/parseAnimationFile.test.ts`
- Modify: `src/main.ts:1596-1750, 1926-1980`

**Interfaces:**
- Produces `AnimationFileParserOptions`, `SUPPORTED_ANIMATION_FORMATS`, `isSupportedAnimationFormat`, and `parseAnimationFile(file, targetVrm, options?)`.
- `chooseFbxRigType(fileName)` remains a DOM callback in `main.ts` and is passed through `options`.

- [ ] **Step 1: Write a failing test for supported file formats**

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SUPPORTED_ANIMATION_FORMATS,
  isSupportedAnimationFormat,
} from '../../src/animation/parseAnimationFile.ts';

test('accepts the non-MMD animation formats handled by the dispatcher', () => {
  assert.deepEqual(SUPPORTED_ANIMATION_FORMATS, ['vrma', 'glb', 'gltf', 'fbx', 'bvh']);
  assert.equal(isSupportedAnimationFormat('FBX'), true);
  assert.equal(isSupportedAnimationFormat('vmd'), false);
  assert.equal(isSupportedAnimationFormat('txt'), false);
});
```

- [ ] **Step 2: Run the focused test and verify the expected missing-module failure**

Run: `node --test --experimental-strip-types test/animation/parseAnimationFile.test.ts`

Expected: FAIL because `src/animation/parseAnimationFile.ts` does not exist yet.

- [ ] **Step 3: Implement the dispatcher and loader setup**

Move the current `LoadedClip`-producing logic from `main.ts` into the new module. Create local `GLTFLoader`, `FBXLoader`, and `BVHLoader` instances. Register `VRMLoaderPlugin` and `VRMAnimationLoaderPlugin` on the GLTF loader exactly as the current main module does.

Use these signatures:

```typescript
export const SUPPORTED_ANIMATION_FORMATS = ['vrma', 'glb', 'gltf', 'fbx', 'bvh'] as const;
export type AnimationFileParserOptions = {
  chooseFbxRigType?: (fileName: string) => Promise<AnimationRigType | null>;
};
export function isSupportedAnimationFormat(format: string): boolean;
export async function parseAnimationFile(
  file: File,
  targetVrm: VRM | null,
  options?: AnimationFileParserOptions,
): Promise<LoadedClip[]>;
```

Preserve the current object URL `try/finally` revocation, FBX multi-clip labels, VRMA expression/look-at extraction, BVH parser choice, source FPS estimation, and compatible flag calculation. If an FBX rig is ambiguous and no chooser returns `mixamo` or `universal`, throw the existing cancellation message.

- [ ] **Step 4: Replace the dispatcher and extension validation in `main.ts`**

Import `parseAnimationFile` and `isSupportedAnimationFormat` from `./animation/parseAnimationFile.js`. Keep the VMD branch in `handleAnimationFile`; use the dispatcher for only the five supported non-MMD formats and pass:

```typescript
const loadedClips = await parseAnimationFile(file, state.model?.vrm ?? null, {
  chooseFbxRigType,
});
```

Remove the old `parseAnimationFile`, `estimateFps`, and `labelForClip` implementations from `main.ts` after the imports compile.

- [ ] **Step 5: Run focused/full tests and build**

Run: `node --test --experimental-strip-types test/animation/parseAnimationFile.test.ts`

Expected: PASS with one format-support test.

Run: `npm test`

Expected: PASS with all tests.

Run: `npm run build`

Expected: TypeScript and Vite build complete successfully.

- [ ] **Step 6: Commit the dispatcher extraction**

```bash
git add src/animation/parseAnimationFile.ts test/animation/parseAnimationFile.test.ts src/main.ts
git commit -m "refactor: extract animation file dispatcher"
```

### Task 5: Extract VRMA export and preview animation generation

**Files:**
- Create: `src/vrma/exportVrma.ts`
- Create: `src/animation/previewAnimation.ts`
- Create: `test/vrma/exportVrma.test.ts`
- Create: `test/animation/previewAnimation.test.ts`
- Modify: `src/main.ts:867-923, 2509-2737`

**Interfaces:**
- Produces `VrmaExportAnimation` and `createVrmaBlob(animation)` from `src/vrma/exportVrma.ts`.
- Produces `createPreviewAnimation()` from `src/animation/previewAnimation.ts`.

- [ ] **Step 1: Write failing tests for VRMA GLB output and the preview clip**

Use a minimal internal animation fixture with one hips rotation, one hips translation, and one `blink` expression. The exporter test must decode the JSON chunk from `Blob.arrayBuffer()` and assert the GLB magic, JSON chunk type, animation name, `VRMC_vrm_animation` humanBones, and at least two animation channels.

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { createVrmaBlob } from '../../src/vrma/exportVrma.ts';

test('creates a VRMA GLB with humanoid and expression animation channels', async () => {
  const animation = {
    displayName: 'walk',
    restHipsY: 1,
    tracks: new Map([
      ['hips', {
        rotation: new THREE.QuaternionKeyframeTrack('', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
        translation: new THREE.VectorKeyframeTrack('', [0, 1], [0, 1, 0, 0, 1, 0]),
      }],
    ]),
    expressionTracks: {
      preset: new Map([['blink', new THREE.NumberKeyframeTrack('', [0, 1], [0, 1])]]),
      custom: new Map(),
    },
    lookAtTrack: null,
  } as const;

  const bytes = new Uint8Array(await createVrmaBlob(animation).arrayBuffer());
  const view = new DataView(bytes.buffer);
  assert.equal(view.getUint32(0, true), 0x46546c67);
  assert.equal(view.getUint32(4, true), 2);
  const jsonLength = view.getUint32(12, true);
  assert.equal(view.getUint32(16, true), 0x4e4f534a);
  const json = JSON.parse(new TextDecoder().decode(bytes.slice(20, 20 + jsonLength)).trim());
  assert.equal(json.animations[0].name, 'walk');
  assert.equal(json.extensions.VRMC_vrm_animation.humanoid.humanBones.hips.node, 0);
  assert.ok(json.animations[0].channels.length >= 2);
});
```

The preview test should assert `duration === 2.4`, `source === 'preview'`, `tracks.has('hips')`, and a `blink` preset track.

- [ ] **Step 2: Run both focused tests and verify the expected missing-module failures**

Run: `node --test --experimental-strip-types test/vrma/exportVrma.test.ts test/animation/previewAnimation.test.ts`

Expected: FAIL because the new exporter and preview modules do not exist yet.

- [ ] **Step 3: Move the preview generator into `previewAnimation.ts`**

Move `createPreviewAnimation`, `quaternionValuesFor`, and only the preview-specific track construction from `main.ts`. Import the shared constructors and clone helpers from `trackUtils.js`. Return the exact existing `AnimationState` values, including `preview-animation`, `preview-loop.vrma`, 2.4 seconds, 30 FPS, and hips translation at normalized rest height.

- [ ] **Step 4: Move the VRMA Blob writer into `exportVrma.ts`**

Move `exportFloatData`, `samplesForVrmaTrack`, and `createVrmaBlob` without changing GLB alignment, JSON padding, binary accessors, quaternion normalization, hips translation scaling, expression nodes, look-at nodes, or `VRMC_vrm_animation` structure.

Define the state-independent input type:

```typescript
export type VrmaExportAnimation = Pick<
  AnimationState,
  'displayName' | 'restHipsY' | 'tracks' | 'expressionTracks' | 'lookAtTrack'
>;

export function createVrmaBlob(animation: VrmaExportAnimation): Blob;
```

- [ ] **Step 5: Rewire `main.ts` and run tests/build**

Import `createPreviewAnimation` and `createVrmaBlob` using `.js` specifiers, remove the moved functions from `main.ts`, and keep `downloadVrma()` as the DOM download action.

Run: `node --test --experimental-strip-types test/vrma/exportVrma.test.ts test/animation/previewAnimation.test.ts`

Expected: PASS with both focused tests.

Run: `npm test && npm run build`

Expected: all tests pass and the Vite build succeeds.

- [ ] **Step 6: Commit the exporter and preview extraction**

```bash
git add src/vrma/exportVrma.ts src/animation/previewAnimation.ts test/vrma/exportVrma.test.ts test/animation/previewAnimation.test.ts src/main.ts
git commit -m "refactor: extract preview and VRMA export"
```

### Task 6: Extract typed DOM references and always-visible scrollbars

**Files:**
- Create: `src/ui/dom.ts`
- Create: `src/ui/scrollbars.ts`
- Create: `test/ui/dom.test.ts`
- Create: `test/ui/scrollbars.test.ts`
- Modify: `src/main.ts:151-360`

**Interfaces:**
- Produces the typed `dom` object from `src/ui/dom.ts`.
- Produces `installAlwaysVisibleScrollbars(options)` from `src/ui/scrollbars.ts`.

- [ ] **Step 1: Write failing tests for DOM selector typing and scrollbar geometry**

`dom.test.ts` should install a minimal `globalThis.document.querySelector()` implementation that returns an object containing the requested selector, dynamically import `src/ui/dom.ts`, and assert that `dom.viewport` resolves `#viewport` and `dom.fbxRigDialog` resolves `#fbx-rig-dialog`. `scrollbars.test.ts` should test `calculateScrollbarThumbSize(trackSize, viewportSize, contentSize)` with a vertical viewport of 100px, content of 300px, and track of 200px, expecting the raw 67px result before the minimum-size clamp.

```typescript
test('maps the viewport and FBX dialog selectors to typed DOM references', async () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    querySelector: (selector: string) => ({ selector }),
  } as unknown as Document;
  try {
    const { dom } = await import('../../src/ui/dom.ts');
    assert.equal((dom.viewport as unknown as { selector: string }).selector, '#viewport');
    assert.equal((dom.fbxRigDialog as unknown as { selector: string }).selector, '#fbx-rig-dialog');
  } finally {
    globalThis.document = previousDocument;
  }
});
```

- [ ] **Step 2: Run the focused tests and verify the expected missing-module failures**

Run: `node --test --experimental-strip-types test/ui/dom.test.ts test/ui/scrollbars.test.ts`

Expected: FAIL because `src/ui/dom.ts` and `src/ui/scrollbars.ts` do not exist yet.

- [ ] **Step 3: Move the `$` helper and complete DOM map into `dom.ts`**

Move the exact selector/type map from `src/main.ts:151-216` into `dom.ts`. Export a `DomElements` type containing every existing field and export a `dom: DomElements` value initialized with the same selector strings and generic element types. Do not change selector strings or element types.

- [ ] **Step 4: Move scrollbar state and listeners into `scrollbars.ts`**

Move `ScrollbarAxis`, `AlwaysScrollbar`, pointer/scroll position helpers, refresh scheduling, scrollbar construction, and `installAlwaysVisibleScrollbars` from `main.ts:218-360`. Accept the sidebar collection and the two timeline elements through an options object so the module does not know the application state:

```typescript
export type AlwaysVisibleScrollbarOptions = {
  sidebarTargets: Iterable<HTMLElement>;
  timelineBody: HTMLElement;
  timelineScroll: HTMLElement;
};

export function installAlwaysVisibleScrollbars(options: AlwaysVisibleScrollbarOptions): void;
```

Export one pure geometry helper for the test, but keep all DOM listener details private.

- [ ] **Step 5: Rewire bootstrap and run UI-focused/full tests**

In `main.ts`, import `dom` and `installAlwaysVisibleScrollbars`, remove the moved code, and call:

```typescript
installAlwaysVisibleScrollbars({
  sidebarTargets: document.querySelectorAll<HTMLElement>('.sidebar'),
  timelineBody: dom.timelineBody,
  timelineScroll: dom.timelineScroll,
});
```

Run: `node --test --experimental-strip-types test/ui/dom.test.ts test/ui/scrollbars.test.ts`

Expected: PASS.

Run: `npm test && npm run build`

Expected: all tests pass and the build succeeds.

- [ ] **Step 6: Commit the DOM and scrollbar extraction**

```bash
git add src/ui/dom.ts src/ui/scrollbars.ts test/ui/dom.test.ts test/ui/scrollbars.test.ts src/main.ts
git commit -m "refactor: extract DOM and scrollbar modules"
```

### Task 7: Extract timeline rendering and pure timeline helpers

**Files:**
- Create: `src/ui/timeline.ts`
- Create: `test/ui/timeline.test.ts`
- Modify: `src/main.ts:2095-2480`

**Interfaces:**
- Produces `TimelineController`, `createTimelineController(dom, accessors)`, `mergeKeyTimes`, `formatBoneName`, and `getTimeAtPointer` from `src/ui/timeline.ts`.

- [ ] **Step 1: Write failing tests for timeline key merging and pointer time conversion**

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';

import { formatBoneName, getTimeAtPointer, mergeKeyTimes } from '../../src/ui/timeline.ts';

test('merges and sorts duplicate key times', () => {
  assert.deepEqual(mergeKeyTimes([0, 0.5], [0.5, 1], [0.25]), [0, 0.25, 0.5, 1]);
});

test('formats a humanoid bone name for the timeline label', () => {
  assert.equal(formatBoneName('leftUpperArm'), 'LEFT UPPER ARM');
});

test('converts a pointer position into a clamped timeline time', () => {
  assert.equal(getTimeAtPointer(150, { left: 100, width: 400 }, 2), 0.25);
  assert.equal(getTimeAtPointer(600, { left: 100, width: 400 }, 2), 2);
});
```

- [ ] **Step 2: Run the focused tests and verify the expected missing-module failure**

Run: `node --test --experimental-strip-types test/ui/timeline.test.ts`

Expected: FAIL because `src/ui/timeline.ts` does not exist yet.

- [ ] **Step 3: Implement the timeline controller contract**

Export a `TimelineDom` type using the following exact field list, then define accessors so the module never imports the full app state:

```typescript
export type TimelineDom = Pick<
  DomElements,
  | 'timelineRuler'
  | 'timelineRulerSticky'
  | 'timelineBody'
  | 'timelineScroll'
  | 'timelineScrollContent'
  | 'trackLanes'
  | 'transformsToggle'
  | 'transformBoneLabels'
  | 'transformBoneLanes'
  | 'transformsKeys'
  | 'faceKeys'
  | 'playhead'
  | 'currentFrame'
  | 'totalFrames'
  | 'currentTime'
>;
```

```typescript
export type TimelineStateAccessors = {
  getAnimation: () => AnimationState | null;
  getTime: () => number;
  getZoom: () => number;
  getTransformsExpanded: () => boolean;
};

export type TimelineController = {
  render(): void;
  updatePlayhead(): void;
  centerOnPlayhead(): void;
  getTimeAtPointer(clientX: number): number | null;
};

export function createTimelineController(
  timelineDom: TimelineDom,
  accessors: TimelineStateAccessors,
): TimelineController;
```

Keep `uniqueKeyTimes`, `uniqueExpressionKeyTimes`, and `allAnimationKeyTimes` in `timeline.ts` because they are timeline display calculations; also keep `laneTimes`, `trackTimesForBone`, ruler rendering, transform row rendering, sticky ruler updates, playhead updates, and center calculation in this module. Use `getTimelineScrollLeftForPlayhead` from `timelineScroll.ts` unchanged.

- [ ] **Step 4: Move timeline DOM rendering and preserve callback boundaries**

Move `renderKeyRow`, `updateTransformsExpansionUi`, `renderTransformBoneRows`, `getTimelinePixelsPerSecond`, `updateStickyTimelineRuler`, `renderTimeline`, `updatePlayhead`, `centerTimelineOnPlayhead`, and `seekFromPointer` behavior into the controller. `main.ts` remains responsible for changing `state.time`, calling the mixer, and deciding play/pause. The controller returns a time; it does not mutate playback state.

- [ ] **Step 5: Rewire all timeline calls and run tests/build**

Replace calls in `main.ts` as follows:

```typescript
const timeline = createTimelineController(dom, {
  getAnimation: () => state.animation,
  getTime: () => state.time,
  getZoom: () => state.zoom,
  getTransformsExpanded: () => state.transformsExpanded,
});

timeline.render();
timeline.updatePlayhead();
timeline.centerOnPlayhead();
const time = timeline.getTimeAtPointer(event.clientX);
if (time != null) seekTo(time);
```

Run: `node --test --experimental-strip-types test/ui/timeline.test.ts`

Expected: PASS with three tests.

Run: `npm test && npm run build`

Expected: all tests and the ESM build pass.

- [ ] **Step 6: Commit the timeline extraction**

```bash
git add src/ui/timeline.ts test/ui/timeline.test.ts src/main.ts
git commit -m "refactor: extract timeline renderer"
```

### Task 8: Extract the Three.js viewer stage and VRM loading

**Files:**
- Create: `src/viewer/stage.ts`
- Create: `test/viewer/stage.test.ts`
- Modify: `src/main.ts:363-805, 2483-2490, 2943-2970`

**Interfaces:**
- Produces `ModelState`, `StageDom`, `StageController`, `createStage(dom)`, and `getObjectHeight` from `src/viewer/stage.ts`.

- [ ] **Step 1: Write a failing pure stage helper test**

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { getObjectHeight } from '../../src/viewer/stage.ts';

test('getObjectHeight returns the world-space object height with a safe minimum', () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1));
  assert.equal(getObjectHeight(mesh), 2);
  mesh.scale.y = 0;
  assert.equal(getObjectHeight(mesh), 0.1);
});
```

- [ ] **Step 2: Run the focused test and verify the expected missing-module failure**

Run: `node --test --experimental-strip-types test/viewer/stage.test.ts`

Expected: FAIL because `src/viewer/stage.ts` does not exist yet.

- [ ] **Step 3: Define the stage controller and move scene setup**

Move scene, renderer, camera, controls, lights, floor/grid, stage shadow constants, `getVrmBones`, `getStageShadowFootprint`, `updateStageShadow`, `disposeObject`, `replaceModel`, camera fit/zoom/background functions, and VRM loader setup from `main.ts` into `stage.ts`.

`loadVrmUrl` hides the supplied previous model and clears its stage shadow before loading, restores the previous model and shadow if loading fails, and returns the new model without attaching it. `replaceModel` attaches the new model, disposes the old model and object URL, updates the stage shadow, and fits the camera.

Use these boundaries:

```typescript
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
  'viewport' | 'viewportShell' | 'viewportZoomRange' | 'viewportBackgroundButton'
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
  setViewportZoom(value: number): void;
  zoomViewportIn(): void;
  zoomViewportOut(): void;
  resize(): void;
  render(): void;
};

export function createStage(stageDom: StageDom): StageController;
```

The stage controller may own Three.js resources but must not import `AnimationState`, call `rebuildAction`, call `updateInterface`, show toast messages, or mutate the app state.

- [ ] **Step 4: Rewire model loading and animation target access in `main.ts`**

Keep loading labels, toast messages, previous-model state, mixer teardown, and animation rebuilding in `main.ts`. Replace direct scene/camera/renderer references with the controller:

```typescript
const stage = createStage(dom);
const nextModel = await stage.loadVrmUrl(url, fileName, 'local', objectUrl, state.model);
stage.replaceModel(nextModel, state.model);
state.model = nextModel;
rebuildAction();
```

The stage controller hides scene/model attachment and renderer/camera resources. Keep `mmdPreview.update(delta)` and `vrm.update(delta)` in `main.ts`; call only `stage.render()` and `stage.resize()` from the animation loop and resize listener.

- [ ] **Step 5: Run stage test, full tests, and build**

Run: `node --test --experimental-strip-types test/viewer/stage.test.ts`

Expected: PASS with one pure helper test.

Run: `npm test && npm run build`

Expected: all tests pass and the ESM/Vite build succeeds.

- [ ] **Step 6: Commit the viewer extraction**

```bash
git add src/viewer/stage.ts test/viewer/stage.test.ts src/main.ts
git commit -m "refactor: extract Three.js viewer stage"
```

### Task 9: Finish the thin app entrypoint and verify the complete behavior

**Files:**
- Modify: `src/main.ts`
- Modify: `src/ui/timeline.ts`
- Modify: `src/animation/types.ts`
- Modify: `package.json`

**Interfaces:**
- `main.ts` imports internal modules with `.js` specifiers and owns only app state, toast/loading text, MMD baker/preview wiring, animation list operations, playback state, event handlers, and bootstrap.

- [ ] **Step 1: Remove all remaining moved implementations from `main.ts`**

Run:

```bash
rg -n "mixamoVRMRigMap|universalVrmRigMap|retargetMixamoClip|retargetUniversalClip|retargetDazBvhClip|retargetGenericClip|createVrmaBlob|renderTimeline|createAlwaysScrollbar|new THREE\.WebGLRenderer|new GLTFLoader" src/main.ts
```

Expected: no moved parser/export/UI/stage implementation remains; only imported names and controller calls may remain. `main.ts` must retain no Mixamo alias table, parser body, GLB binary writer, timeline row generation, or scrollbar pointer implementation.

- [ ] **Step 2: Normalize every production relative import to explicit ESM specifiers**

Run:

```bash
rg -n "from ['\"]\.?\.?/.*\.ts['\"]|import\(['\"]\.?\.?/.*\.ts['\"]\)" src
```

Expected: no production source import ends in `.ts`; test files may continue to import `.ts`.

- [ ] **Step 3: Update the test script after every test directory exists**

Change only the `test` script in `package.json` to include all test directories while retaining the existing MMD and timeline globs:

```json
"test": "node --test --experimental-strip-types test/mmd/*.test.ts test/timeline/*.test.ts test/animation/*.test.ts test/vrma/*.test.ts test/ui/*.test.ts test/viewer/*.test.ts"
```

- [ ] **Step 4: Run static checks and the complete test suite**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `npm test`

Expected: all MMD, timeline, animation, VRMA, UI, and viewer tests pass with no uncaught errors.

Run: `npm run build`

Expected: `tsc -b` and `vite build` both succeed.

- [ ] **Step 5: Verify the browser smoke path**

Run: `npm run dev` and open the Vite URL. Verify, in order:

1. `assets/model.vrm` loads and the preview animation plays.
2. A Mixamo FBX loads, its clip appears in the list, and the avatar plays the retargeted motion.
3. A GLB/GLTF, Universal FBX, BVH, and VRMA can still be loaded through the same drop target.
4. Timeline play/pause, frame stepping, pointer seek, horizontal/vertical scrolling, zoom, and transform expansion still work.
5. Speed multiplier, bake preview/apply/cancel/revert, and VRMA download still work.
6. VMD remains handled by the existing MMD baker/preview path.

- [ ] **Step 6: Review the final diff for user-owned changes and commit the integration**

Run: `git status --short` and `git diff --stat`.

Confirm the original `index.html`, `src/style.css`, `src/mmd/MMDHumanoidRetargeter.ts`, and test changes remain intact and are not reverted. Confirm no `dist/` files are staged.

```bash
git add src/main.ts src/animation src/vrma src/viewer src/ui test/animation test/vrma test/ui test/viewer package.json
git commit -m "refactor: modularize converter entrypoint"
```

- [ ] **Step 7: Report the final module map and verification evidence**

Include the final `main.ts` line count, the created module paths, the exact `npm test` result, the exact `npm run build` result, and any browser smoke checks that could not be automated.
