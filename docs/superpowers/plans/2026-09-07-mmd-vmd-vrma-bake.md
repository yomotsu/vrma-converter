# MMD VMD IK Bake to VRMA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** VMDドロップ時にPMXのIK／Grant解決済み姿勢をFKとしてベイクし、現在のVRM向けVRMAクリップを一覧へ追加する。

**Architecture:** 変換用の`MMDMotionBaker`はPMX/VMDをrendererやoverlayから独立して読み込み、`MMDAnimationHelper`で30fpsごとに解決済みの全PMXボーンを採取する。`MMDHumanoidRetargeter`はMMD標準名とセンター系の合成を担当し、`main.ts`は結果を既存の`LoadedClip`／`AnimationState`へ接続する。既存の`MMDPlayer`は右下の開発用previewだけを担当し、将来prodエントリから外してもbakerの変換経路は残る。

**Tech Stack:** TypeScript ES Modules, three.js `^0.180.0`, existing `MMDLoader`/`MMDAnimationHelper`, Node built-in test runner with TypeScript stripping, Vite.

**Spec:** `docs/superpowers/specs/2026-09-07-mmd-vmd-vrma-bake-design.md`

## Global Constraints

- VMDの基準PMXは`assets/mobuko.pmx`に固定する。
- IK／Grantは`MMDAnimationHelper({ sync: false, pmxAnimation: true })`で解決し、物理演算は`physics: false`にする。
- ベイクのサンプルレートはVMDの30fpsで、各サンプルは0フレームから最終フレームまで含める。
- PMX全ボーンのFK回転をベイク結果に保持し、VRMAにはhumanoidへ対応付けできるボーンだけ出力する。
- MMD previewはVRMA側のtimeline／speed倍率／seekと状態を共有しない。
- prodからpreviewを将来削除できるよう、baker／retargeterはDOM、canvas、MMDPlayerへ依存しない。
- 既存のVRMA／GLB／GLTF／FBX／BVHの動作を変更しない。

---

### Task 1: Add testable MMD motion math and bake result types

**Files:**
- Create: `test/mmd/MMDMotionMath.test.ts`
- Create: `src/mmd/MMDMotionTypes.ts`
- Create: `src/mmd/MMDMotionMath.ts`
- Modify: `package.json:7-15`

**Interfaces:**
- Produces `MMDMotionBoneTrack`, `MMDMotionBakeResult`, `createMmdFrameTimes()`, and `continuousQuaternionValues()` for the following tasks.

- [ ] **Step 1: Write the failing frame-time and quaternion-continuity tests**

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';

import { continuousQuaternionValues, createMmdFrameTimes } from '../../src/mmd/MMDMotionMath.ts';

test('creates every 30fps frame and preserves the exact final time', () => {
  const times = createMmdFrameTimes(1, 30);
  assert.equal(times.length, 31);
  assert.equal(times[0], 0);
  assert.equal(times[1], 1 / 30);
  assert.equal(times.at(-1), 1);
});

test('flips quaternion signs so adjacent samples stay on one hemisphere', () => {
  const values = continuousQuaternionValues([
    0, 0, 0, 1,
    0, 0, 0, -1,
    0, 1, 0, 0,
  ]);
  assert.deepEqual(values.slice(0, 8), [0, 0, 0, 1, 0, 0, 0, 1]);
  assert.ok(values[8] === 0 && values[9] === 1 && values[10] === 0 && values[11] === 0);
});

test('returns one sample for a zero-duration motion', () => {
  assert.deepEqual(createMmdFrameTimes(0, 30), [0]);
});
```

- [ ] **Step 2: Run the focused test to verify it fails for the missing module**

Run: `node --test --experimental-strip-types test/mmd/MMDMotionMath.test.ts`

Expected: FAIL because `src/mmd/MMDMotionMath.ts` does not exist yet.

- [ ] **Step 3: Add the motion result types and minimal math implementation**

```typescript
// src/mmd/MMDMotionTypes.ts
import type * as THREE from 'three';

export type MMDMotionBoneTrack = {
  index: number;
  name: string;
  rotation: THREE.QuaternionKeyframeTrack;
  position: THREE.VectorKeyframeTrack;
  worldPosition: THREE.VectorKeyframeTrack;
  restWorldPosition: THREE.Vector3;
};

export type MMDMotionBakeResult = {
  duration: number;
  fps: number;
  times: number[];
  bones: MMDMotionBoneTrack[];
};
```

```typescript
// src/mmd/MMDMotionMath.ts
import * as THREE from 'three';

export function createMmdFrameTimes(duration: number, fps = 30): number[] {
  const safeDuration = Math.max(0, Number.isFinite(duration) ? duration : 0);
  const safeFps = Math.max(1, Math.round(Number.isFinite(fps) ? fps : 30));
  const frameCount = Math.max(0, Math.floor(safeDuration * safeFps + 0.000001));
  const times = Array.from({ length: frameCount + 1 }, (_, index) => index / safeFps);
  const finalTime = safeDuration;
  const lastTime = times[times.length - 1] ?? 0;
  if (lastTime < finalTime - 0.000001) times.push(finalTime);
  else if (times.length > 0) times[times.length - 1] = finalTime;
  return times;
}

export function continuousQuaternionValues(values: number[]): number[] {
  const result: number[] = [];
  let previous: THREE.Quaternion | null = null;
  for (let index = 0; index + 3 < values.length; index += 4) {
    const current = new THREE.Quaternion().fromArray(values.slice(index, index + 4) as [number, number, number, number]);
    if (current.lengthSq() < 1e-12) current.identity();
    else current.normalize();
    if (previous != null && previous.dot(current) < 0) {
      current.set(-current.x, -current.y, -current.z, -current.w);
    }
    result.push(...current.toArray());
    previous = current;
  }
  return result;
}
```

- [ ] **Step 4: Add the native test script and run the focused test**

Modify `package.json` to add:

```json
"test": "node --test --experimental-strip-types test/mmd/*.test.ts"
```

Run: `npm test -- --test-name-pattern="MMDMotionMath"`

Expected: PASS with all three focused tests passing.

- [ ] **Step 5: Commit the testable motion math**

```bash
git add package.json src/mmd/MMDMotionTypes.ts src/mmd/MMDMotionMath.ts test/mmd/MMDMotionMath.test.ts
git commit -m "test: cover MMD motion sampling math"
```

### Task 2: Add MMD humanoid mapping and FK retargeting

**Files:**
- Create: `test/mmd/MMDHumanoidRetargeter.test.ts`
- Create: `src/mmd/MMDHumanoidRetargeter.ts`
- Modify: `src/mmd/index.ts:1-3`

**Interfaces:**
- Consumes `MMDMotionBakeResult`.
- Produces `mapMmdBoneName(name: string): string | null` and `retargetMmdMotion(result: MMDMotionBakeResult, availableHumanoidNames?: ReadonlySet<string>): MMDHumanoidMotion`.

- [ ] **Step 1: Write failing mapping, center-composition, translation, and filtering tests**

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { mapMmdBoneName, retargetMmdMotion } from '../../src/mmd/MMDHumanoidRetargeter.ts';
import type { MMDMotionBakeResult, MMDMotionBoneTrack } from '../../src/mmd/MMDMotionTypes.ts';

const qTrack = (name: string, quaternion: THREE.Quaternion): THREE.QuaternionKeyframeTrack => (
  new THREE.QuaternionKeyframeTrack(name, [0], quaternion.toArray())
);

const pTrack = (name: string, position: THREE.Vector3): THREE.VectorKeyframeTrack => (
  new THREE.VectorKeyframeTrack(name, [0], position.toArray())
);

const bone = (index: number, name: string, quaternion: THREE.Quaternion, worldPosition: THREE.Vector3): MMDMotionBoneTrack => ({
  index,
  name,
  rotation: qTrack(name, quaternion),
  position: pTrack(name, new THREE.Vector3()),
  worldPosition: pTrack(name, worldPosition),
  restWorldPosition: worldPosition.clone(),
});

test('maps standard Japanese and English MMD names to VRM humanoid names', () => {
  assert.equal(mapMmdBoneName('左ひじ'), 'leftLowerArm');
  assert.equal(mapMmdBoneName('右手首'), 'rightHand');
  assert.equal(mapMmdBoneName('left_index_2'), 'leftIndexIntermediate');
  assert.equal(mapMmdBoneName('左足首'), 'leftFoot');
});

test('composes center, groove, and lower-body rotations into hips', () => {
  const center = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.2);
  const groove = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.3);
  const lower = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.4);
  const result: MMDMotionBakeResult = {
    duration: 0,
    fps: 30,
    times: [0],
    bones: [
      bone(0, 'センター', center, new THREE.Vector3(0, 8, 0)),
      bone(1, 'グルーブ', groove, new THREE.Vector3(0, 8, 0)),
      bone(2, '下半身', lower, new THREE.Vector3(0, 8, 0)),
    ],
  };
  const motion = retargetMmdMotion(result, new Set(['hips']));
  const actual = new THREE.Quaternion().fromArray(Array.from(motion.rotationTracks.get('hips')!.values) as [number, number, number, number]);
  const expected = center.clone().multiply(groove).multiply(lower).normalize();
  assert.ok(1 - Math.abs(actual.dot(expected)) < 1e-6);
});

test('extracts center movement as normalized hips translation', () => {
  const result: MMDMotionBakeResult = {
    duration: 1,
    fps: 30,
    times: [0, 1],
    bones: [{
      ...bone(0, 'センター', new THREE.Quaternion(), new THREE.Vector3(0, 8, 0)),
      worldPosition: pTrack('センター', new THREE.Vector3(1, 9, -2)),
    }],
  };
  result.bones[0].worldPosition = new THREE.VectorKeyframeTrack('センター', [0, 1], [0, 8, 0, 1, 9, -2]);
  const motion = retargetMmdMotion(result, new Set(['hips']));
  assert.deepEqual(Array.from(motion.translationTrack!.values), [0, 8, 0, 1, 9, -2]);
  assert.equal(motion.restHipsY, 8);
});

test('does not output humanoid tracks absent from the target VRM', () => {
  const result: MMDMotionBakeResult = { duration: 0, fps: 30, times: [0], bones: [bone(0, '頭', new THREE.Quaternion(), new THREE.Vector3())] };
  const motion = retargetMmdMotion(result, new Set(['hips']));
  assert.equal(motion.rotationTracks.has('head'), false);
});
```

- [ ] **Step 2: Run the focused mapping test to verify it fails**

Run: `node --test --experimental-strip-types test/mmd/MMDHumanoidRetargeter.test.ts`

Expected: FAIL because `MMDHumanoidRetargeter.ts` does not exist yet.

- [ ] **Step 3: Implement the mapping and retargeter**

Implement these exact public types and functions:

```typescript
export type MMDHumanoidMotion = {
  rotationTracks: Map<string, THREE.QuaternionKeyframeTrack>;
  translationTrack: THREE.VectorKeyframeTrack | null;
  restHipsY: number;
};

export function mapMmdBoneName(name: string): string | null;
export function retargetMmdMotion(
  result: MMDMotionBakeResult,
  availableHumanoidNames?: ReadonlySet<string>,
): MMDHumanoidMotion;
```

Use NFKC normalization and remove spaces, `_`, `-`, `.`, parentheses, and the optional `hand` prefix before matching. Include Japanese aliases for `センター`, `グルーブ`, `下半身`, `上半身`, `上半身2`, `上半身3`, `首`, `頭`, `左肩`, `左腕`, `左ひじ`, `左手首`, `左足`, `左ひざ`, `左足首`, `左つま先`, the corresponding right-side names, and standard MMD finger names (`親指`, `人指`／`示指`, `中指`, `薬指`, `小指`). Include English aliases such as `center`, `groove`, `lowerbody`, `upperbody`, `leftarm`, `leftelbow`, `lefthand`, `left_index_2`, and their right-side variants.

For the center group, locate at most one source track for each role in parent-to-child order `center`, `groove`, `lowerBody`. At each baked time, multiply the local quaternions in that order and emit one `hips` track. Select translation from the first available role in the same order, subtract its rest x/z world position, keep the source absolute y position, and return the positive rest y as `restHipsY`. If no center role exists, use a source bone mapped directly to hips. Skip tracks whose target name is not in `availableHumanoidNames`; omit the translation when hips is unavailable.

- [ ] **Step 4: Run mapping tests and the full native test suite**

Run: `node --test --experimental-strip-types test/mmd/MMDHumanoidRetargeter.test.ts`

Expected: PASS with four tests.

Run: `npm test`

Expected: PASS with all motion-math and retargeter tests passing.

- [ ] **Step 5: Export the retargeter from the MMD module index**

Add the following exports to `src/mmd/index.ts`:

```typescript
export { mapMmdBoneName, retargetMmdMotion } from './MMDHumanoidRetargeter.js';
export type { MMDHumanoidMotion } from './MMDHumanoidRetargeter.js';
export type { MMDMotionBakeResult, MMDMotionBoneTrack } from './MMDMotionTypes.js';
```

- [ ] **Step 6: Commit the MMD retargeter**

```bash
git add src/mmd/MMDHumanoidRetargeter.ts src/mmd/MMDMotionTypes.ts src/mmd/index.ts test/mmd/MMDHumanoidRetargeter.test.ts
git commit -m "feat: add MMD humanoid FK retargeting"
```

### Task 3: Add PMX/VMD IK bake implementation

**Files:**
- Create: `test/mmd/MMDMotionBaker.test.ts`
- Create: `src/mmd/MMDMotionBaker.ts`
- Modify: `src/mmd/index.ts:1-10`

**Interfaces:**
- Consumes a loaded `THREE.SkinnedMesh`, `THREE.AnimationClip`, and an `MMDAnimationHelperLike` for the pure sampling function.
- Produces `bakeLoadedMmdMotion(mesh, animation, helper, options?)` and `MMDMotionBaker.bakeVmd(file)`.

- [ ] **Step 1: Write the failing synthetic sampling test**

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { bakeLoadedMmdMotion } from '../../src/mmd/MMDMotionBaker.ts';

test('samples every PMX bone after the helper has applied its resolved pose', () => {
  const root = new THREE.Bone();
  root.name = 'センター';
  const child = new THREE.Bone();
  child.name = '左足';
  root.add(child);
  const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  mesh.add(root);
  mesh.bind(new THREE.Skeleton([root, child]));
  const animation = new THREE.AnimationClip('mmd', 1, []);
  const resolved = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.5);
  const helper = {
    add: () => undefined,
    update: () => { child.quaternion.copy(resolved); },
  };

  const result = bakeLoadedMmdMotion(mesh, animation, helper, { fps: 30 });

  assert.equal(result.bones.length, 2);
  assert.equal(result.times.length, 31);
  assert.deepEqual(result.times.slice(0, 2), [0, 1 / 30]);
  const childTrack = result.bones.find((bone) => bone.name === '左足')!.rotation;
  assert.ok(Math.abs(new THREE.Quaternion().fromArray(Array.from(childTrack.values).slice(0, 4) as [number, number, number, number]).dot(resolved)) > 0.999);
});
```

- [ ] **Step 2: Run the synthetic test to verify it fails**

Run: `node --test --experimental-strip-types test/mmd/MMDMotionBaker.test.ts`

Expected: FAIL because `MMDMotionBaker.ts` does not exist yet.

- [ ] **Step 3: Implement the loaded-motion sampler**

Define the testable helper contract and implementation:

```typescript
export type MMDAnimationHelperLike = {
  add(mesh: THREE.SkinnedMesh, params: { animation: THREE.AnimationClip; physics: false }): unknown;
  update(delta: number): unknown;
  remove?(mesh: THREE.SkinnedMesh): unknown;
};

export function bakeLoadedMmdMotion(
  mesh: THREE.SkinnedMesh,
  animation: THREE.AnimationClip,
  helper: MMDAnimationHelperLike,
  options: { fps?: number } = {},
): MMDMotionBakeResult;
```

Before sampling, call `mesh.pose()` and store each bone's rest world position in mesh-local coordinates. Add the mesh to the helper with `{ animation, physics: false }`. Use `createMmdFrameTimes(animation.duration, fps)`; for each time call `helper.update(time - previousTime)`, then `mesh.updateMatrixWorld(true)`. For every skeleton bone, append local `position`, local `quaternion`, and mesh-local world position values. Build `QuaternionKeyframeTrack` values through `continuousQuaternionValues()` and `VectorKeyframeTrack` values directly. Return all bones in skeleton order, the sample times, `duration`, and the selected fps.

- [ ] **Step 4: Implement the browser-facing `MMDMotionBaker` loader**

Use dynamic ES module imports so the pure sampler remains testable and the conversion layer does not force the debug player into its dependency graph:

```typescript
export type MMDMotionBakerOptions = { modelUrl: string; fps?: number };

export class MMDMotionBaker {
  public constructor(options: MMDMotionBakerOptions);
  public bakeVmd(file: File): Promise<MMDMotionBakeResult>;
}
```

`bakeVmd()` shall create a VMD object URL, dynamically import `./loaders/MMDLoader.js` and `./animation/MMDAnimationHelper.js`, call `loadWithAnimation(modelUrl, vmdUrl, ...)`, create `MMDAnimationHelper({ sync: false, pmxAnimation: true })`, pass the loaded mesh/clip to `bakeLoadedMmdMotion`, and revoke the VMD URL in `finally`. Remove the mesh from the helper after sampling. Dispose geometry, materials, and referenced textures from the conversion-only mesh after the result is built. Do not create a renderer, scene, camera, canvas, or DOM reference.

- [ ] **Step 5: Run the baker test and full test suite**

Run: `node --test --experimental-strip-types test/mmd/MMDMotionBaker.test.ts`

Expected: PASS with the synthetic all-bones/FK sampling test.

Run: `npm test`

Expected: PASS with all tests passing.

- [ ] **Step 6: Export the baker**

Add to `src/mmd/index.ts`:

```typescript
export { MMDMotionBaker, bakeLoadedMmdMotion } from './MMDMotionBaker.js';
export type { MMDAnimationHelperLike, MMDMotionBakerOptions } from './MMDMotionBaker.js';
```

- [ ] **Step 7: Commit the PMX/VMD baker**

```bash
git add src/mmd/MMDMotionBaker.ts src/mmd/index.ts test/mmd/MMDMotionBaker.test.ts
git commit -m "feat: bake MMD IK poses into FK tracks"
```

### Task 4: Connect VMD baking to the existing VRMA clip pipeline

**Files:**
- Modify: `src/main.ts:98-124, 424-465, 1664-1850`
- Modify: `src/mmd/index.ts:1-14`
- Modify: `index.html:37-45`

**Interfaces:**
- Consumes `MMDMotionBaker.bakeVmd()` and `retargetMmdMotion()`.
- Produces a normal `AnimationState` with `format: 'VRMA'`, `derivedFrom: 'VMD'`, and tracks ready for the existing viewport/timeline/export code.

- [ ] **Step 1: Extend the retargeter test with a VRMA-ready track assertion**

Extend `test/mmd/MMDHumanoidRetargeter.test.ts` with:

```typescript
test('returns a VRMA-ready rotation track for a mapped VMD bone', () => {
  const result: MMDMotionBakeResult = {
    duration: 0,
    fps: 30,
    times: [0],
    bones: [bone(0, '左腕', new THREE.Quaternion(), new THREE.Vector3())],
  };
  const motion = retargetMmdMotion(result, new Set(['leftUpperArm']));
  assert.equal(motion.rotationTracks.get('leftUpperArm')?.getValueSize(), 4);
  assert.deepEqual(Array.from(motion.rotationTracks.get('leftUpperArm')!.times), [0]);
});
```

- [ ] **Step 2: Run the retargeter tests before wiring**

Run: `node --test --experimental-strip-types test/mmd/MMDHumanoidRetargeter.test.ts`

Expected: PASS; the retargeter already provides the track contract consumed by the application wiring below.

- [ ] **Step 3: Add the VMD-derived metadata and shared clip insertion helper**

Extend `AnimationState` with:

```typescript
derivedFrom?: 'VMD';
```

Extract the existing `loadedClips.map(...)` block into a helper with this signature:

```typescript
function addLoadedAnimationClips(
  file: File,
  loadedClips: LoadedClip[],
  format: string,
  derivedFrom?: 'VMD',
): void;
```

The helper shall assign IDs, clone source/original/current tracks, push all clips, select the first clip, and update the existing UI. The normal file path calls it with `extension.toUpperCase()`. The VMD path calls it with `'VRMA'` and `'VMD'`.

- [ ] **Step 4: Convert the baked MMD result into `LoadedClip`**

Add this function in `src/main.ts`:

```typescript
function loadedClipFromMmdBake(result: MMDMotionBakeResult, targetVrm: VRM | null): LoadedClip {
  const available = targetVrm == null
    ? undefined
    : new Set(HUMAN_BONES.filter((bone) => targetVrm.humanoid.getNormalizedBoneNode(bone as never) != null));
  const retargeted = retargetMmdMotion(result, available);
  const tracks: MotionTrackSet = new Map();
  retargeted.rotationTracks.forEach((track, boneName) => {
    if (HUMAN_BONES.includes(boneName as BoneName)) setTrack(tracks, boneName as BoneName, 'rotation', track);
  });
  if (retargeted.translationTrack != null && tracks.has('hips')) {
    setTrack(tracks, 'hips', 'translation', retargeted.translationTrack);
  }
  return {
    tracks,
    expressionTracks: emptyExpressionTrackSet(),
    lookAtTrack: null,
    duration: result.duration,
    sourceFps: result.fps,
    restHipsY: retargeted.restHipsY,
    clipName: 'MMD Motion',
    compatible: tracks.size > 0,
  };
}
```

Use `withoutExtension(file.name)` for `clipName` when creating the final `AnimationState`, while keeping the function’s result independent of `File` metadata.

- [ ] **Step 5: Wire VMD handling without coupling overlay state to VRMA state**

Import and instantiate:

```typescript
import { MMDMotionBaker, MMDPlayer, retargetMmdMotion } from './mmd/index.js';
import type { MMDMotionBakeResult } from './mmd/index.js';

const mmdBaker = new MMDMotionBaker({ modelUrl: defaultMmdModelUrl });
```

Replace the early-return VMD branch with this behavior:

```typescript
const request = ++animationRequestSequence;
if (extension === 'vmd') {
  void mmdPlayer.playVmd(file).catch((error: unknown) => {
    if (request === animationRequestSequence) showToast(error instanceof Error ? error.message : 'VMD プレビューの読み込みに失敗しました');
  });
  setLoading(true, 'BAKING MMD IK TO FK');
  try {
    const baked = await mmdBaker.bakeVmd(file);
    if (request !== animationRequestSequence) return;
    const loaded = loadedClipFromMmdBake(baked, state.model?.vrm ?? null);
    if (!loaded.compatible) throw new Error('VMDから対応する humanoid ボーンを抽出できませんでした');
    loaded.clipName = withoutExtension(file.name);
    addLoadedAnimationClips(file, [loaded], 'VRMA', 'VMD');
    showToast(`${file.name} をIKベイクしてVRMA化しました`);
  } catch (error) {
    if (request === animationRequestSequence) showToast(error instanceof Error ? error.message : 'VMDのIKベイクに失敗しました');
  } finally {
    if (request === animationRequestSequence) setLoading(false);
  }
  return;
}
```

Keep `MMDPlayer`’s existing update loop and do not call `seekTo`, `setPlayState`, `applySpeed`, or any timeline operation from the VMD branch. Ensure the request sequence is also checked after normal-file parsing so an older VMD bake cannot be inserted after a newer drop.

- [ ] **Step 6: Render the derived metadata in the clip list**

Change the list metadata construction to append ` · IK BAKED` when `animation.derivedFrom === 'VMD'`. Keep the type badge as `VRMA` and leave the existing download name logic unchanged; it already derives `file.vmd` → `file.vrma` from `animation.name`.

Update the dropzone helper text to include the actual MMD behavior:

```html
<small>Mixamo の FBX<br />Universal humanoid rig 対応 FBX<br />BVH / VRMA / VMD など</small>
```

- [ ] **Step 7: Run TypeScript build and native tests**

Run: `npm test`

Expected: PASS with all tests passing.

Run: `npm run build`

Expected: exit 0 with TypeScript and Vite build output.

- [ ] **Step 8: Commit VMD-to-clip integration**

```bash
git add src/main.ts src/mmd/index.ts index.html test/mmd/MMDHumanoidRetargeter.test.ts
git commit -m "feat: add baked VMD clips to VRMA pipeline"
```

### Task 5: Update documentation and perform browser-level verification

**Files:**
- Modify: `README.md:14-25`
- Create: `test/mmd/mmd-vmd-smoke.html`
- Create: `test/mmd/mmd-vmd-smoke.ts`

- [ ] **Step 1: Create a browser smoke page that loads a synthetic PMX animation through the baker sampler**

The smoke page shall instantiate a two-bone PMX-shaped `SkinnedMesh`, provide a helper that applies a known resolved quaternion, call `bakeLoadedMmdMotion`, and write `window.__mmdBakeSmoke = { boneCount, sampleCount, resolvedDot }`. The script shall throw if `boneCount !== 2`, `sampleCount !== 31`, or `resolvedDot < 0.999`.

- [ ] **Step 2: Run the smoke page through the existing Vite dev server and inspect the browser console**

Run: `npm run dev -- --host 127.0.0.1`

Open: `http://127.0.0.1:5173/test/mmd/mmd-vmd-smoke.html`

Expected: the page title reports `MMD bake smoke: PASS` and the console contains no uncaught error.

- [ ] **Step 3: Verify the real application behavior with a VMD file**

In the browser:

1. Drop a VMD into `#animation-drop`.
2. Confirm the PMX is visible in the fixed 256x256 bottom-right overlay.
3. Confirm one `VRMA` item with `IK BAKED` appears in the motion clip list.
4. Confirm the selected clip animates the VRM in `#viewport` and the timeline has transform keys.
5. Confirm the download button creates a `.vrma` file named from the VMD.
6. Change the VRMA speed/timeline controls and confirm the PMX overlay remains independent.

- [ ] **Step 4: Update README behavior documentation**

Document that VMD is both previewed by the debug-only PMX overlay and converted into an IK-baked VRMA clip for the current VRM avatar, while the overlay itself is not controlled by timeline or speed controls. State that the overlay is intentionally isolated for future removal from prod builds.

- [ ] **Step 5: Remove the temporary smoke page after verification**

Delete only `test/mmd/mmd-vmd-smoke.html` and `test/mmd/mmd-vmd-smoke.ts` after the browser check, then verify `git status --short` contains no smoke files.

- [ ] **Step 6: Run final verification**

Run: `npm test`

Expected: all native tests pass.

Run: `npm run build`

Expected: exit 0.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 7: Commit documentation and final implementation changes**

```bash
git add README.md
git commit -m "docs: document baked VMD VRMA conversion"
```
