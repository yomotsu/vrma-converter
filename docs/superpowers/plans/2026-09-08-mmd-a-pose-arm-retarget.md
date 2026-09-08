# MMD A-Pose Arm Retarget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the MMD A-pose shoulder, upper-arm, and elbow rotations into canonical VRMA arm rotations while preserving the already-correct body and leg tracks.

**Architecture:** Keep the existing MMD bake result unchanged and make the humanoid retargeter geometry-aware only for the mapped arm chain. For each shoulder-to-hand segment, use the baked source rest direction as the source bone basis, transfer the resolved source world pose into the canonical left/right arm axis, then derive the target local rotation from the previously converted target parent. If a legacy or synthetic bake result lacks usable position data, retain the current quaternion-only fallback.

**Tech Stack:** TypeScript, Three.js `Quaternion`/`Vector3`, Node built-in test runner, existing MMD bake and retarget modules.

**Spec:** `docs/superpowers/specs/2026-09-07-mmd-vmd-vrma-bake-design.md`

## Global Constraints

- Keep the fixed PMX source as `assets/mobuko.pmx` and keep MMD physics disabled with `physics: false`.
- Preserve the existing 30fps bake, quaternion continuity, hips translation, expression mapping, and non-arm retarget behavior.
- Do not add a PMX-selection UI or make the conversion depend on the debug overlay.
- Do not add external dependencies.
- Do not use subagents; execute every task in the current session.

---

### Task 1: Lock the A-pose arm behavior with a failing retargeter test

**Files:**
- Modify: `test/mmd/MMDHumanoidRetargeter.test.ts`
- Reference: `src/mmd/MMDHumanoidRetargeter.ts`

**Interfaces:**
- Consumes: existing `retargetMmdMotion(result, availableHumanoidNames)`.
- Produces: a regression test proving that an A-pose source chain is converted from source geometry into canonical left/right arm directions.

- [x] **Step 1: Write the failing test**

Add a helper that creates a multi-sample quaternion track and a result bone with explicit `parentIndex`, `worldPosition`, and `restWorldPosition`. Add this test after the existing mapped-bone test:

```ts
test('converts A-pose arm geometry into canonical VRMA arm directions', () => {
  const makeArmBone = (
    index: number,
    name: string,
    parentIndex: number,
    position: THREE.Vector3,
    restPosition: THREE.Vector3,
  ): MMDMotionBoneTrack => ({
    index,
    name,
    parentIndex,
    rotation: qTrack(`${name}.rotation`, new THREE.Quaternion()),
    worldRotation: qTrack(`${name}.world`, new THREE.Quaternion()),
    position: pTrack(`${name}.position`, new THREE.Vector3()),
    worldPosition: pTrack(`${name}.worldPosition`, position),
    restWorldRotation: new THREE.Quaternion(),
    restWorldPosition: restPosition,
  });

  const result: MMDMotionBakeResult = {
    duration: 0,
    fps: 30,
    times: [0],
    bones: [
      makeArmBone(0, '上半身', -1, new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, 10, 0)),
      makeArmBone(1, '左肩', 0, new THREE.Vector3(0, 9, 0), new THREE.Vector3(0, 9, 0)),
      makeArmBone(2, '左腕', 1, new THREE.Vector3(1, 8.5, 0), new THREE.Vector3(1, 8.5, 0)),
      makeArmBone(3, '左腕捩', 2, new THREE.Vector3(1.5, 7.9, 0), new THREE.Vector3(1.5, 7.9, 0)),
      makeArmBone(4, '左ひじ', 3, new THREE.Vector3(2, 7.3, 0), new THREE.Vector3(2, 7.3, 0)),
      makeArmBone(5, '左手捩', 4, new THREE.Vector3(2.5, 6.8, 0), new THREE.Vector3(2.5, 6.8, 0)),
      makeArmBone(6, '左手首', 5, new THREE.Vector3(3, 6.2, 0), new THREE.Vector3(3, 6.2, 0)),
    ],
    expressionTracks: [],
  };

  const motion = retargetMmdMotion(
    result,
    new Set(['spine', 'leftShoulder', 'leftUpperArm', 'leftLowerArm']),
  );
  const world = (name: string, parent: THREE.Quaternion): THREE.Quaternion => (
    parent.clone().multiply(new THREE.Quaternion().fromArray(
      Array.from(motion.rotationTracks.get(name)!.values) as [number, number, number, number],
    )).normalize()
  );
  const spine = new THREE.Quaternion().fromArray(
    Array.from(motion.rotationTracks.get('spine')!.values) as [number, number, number, number],
  );
  const shoulder = world('leftShoulder', spine);
  const upperArm = world('leftUpperArm', shoulder);
  const lowerArm = world('leftLowerArm', upperArm);
  const axis = new THREE.Vector3(1, 0, 0);
  assert.ok(axis.clone().applyQuaternion(shoulder).distanceTo(new THREE.Vector3(1, -0.5, 0).normalize()) < 1e-5);
  assert.ok(axis.clone().applyQuaternion(upperArm).distanceTo(new THREE.Vector3(1, -1.2, 0).normalize()) < 1e-5);
  assert.ok(axis.clone().applyQuaternion(lowerArm).distanceTo(new THREE.Vector3(1, -1.1, 0).normalize()) < 1e-5);
});
```

- [x] **Step 2: Run the focused test to verify it fails**

Run: `node --test --experimental-strip-types test/mmd/MMDHumanoidRetargeter.test.ts`

Expected: FAIL in `converts A-pose arm geometry into canonical VRMA arm directions`, because the current retargeter copies quaternion-only source rotations and does not use the A-pose segment directions.

### Task 2: Implement geometry-aware arm-chain retargeting

**Files:**
- Modify: `src/mmd/MMDHumanoidRetargeter.ts`
- Test: `test/mmd/MMDHumanoidRetargeter.test.ts`

**Interfaces:**
- Consumes: `MMDMotionBoneTrack.worldPosition`, `restWorldPosition`, `worldRotation`, and existing mapped-parent lookup.
- Produces: the same `MMDHumanoidMotion` return type, with corrected shoulder/upper-arm/lower-arm tracks when valid source geometry is available.

- [x] **Step 1: Add source geometry helpers**

Implement helpers with these exact responsibilities:

```ts
function findMappedChild(
  bonesByIndex: ReadonlyMap<number, MMDMotionBoneTrack>,
  source: MMDMotionBoneTrack,
): MMDMotionBoneTrack | undefined;

function positionAt(
  track: THREE.VectorKeyframeTrack,
  sampleIndex: number,
): THREE.Vector3 | null;

function directionBetween(
  source: MMDMotionBoneTrack,
  child: MMDMotionBoneTrack,
  sampleIndex: number,
  rest: boolean,
): THREE.Vector3 | null;
```

`findMappedChild` walks the source hierarchy through unmapped twist/helper bones and returns the nearest child whose name maps to a humanoid role. `positionAt` reads one world-position sample. `directionBetween` subtracts the child and source positions, converts rest positions into the source rest-local frame, and returns `null` for a zero or non-finite vector. The regression fixture includes `左腕捩` and `左手捩`, matching the real PMX chain.

- [x] **Step 2: Add the canonical arm conversion**

Add a helper that converts one side in chain order:

```ts
function createArmRotationTracks(
  side: 'left' | 'right',
  times: number[],
  bonesByIndex: ReadonlyMap<number, MMDMotionBoneTrack>,
  sources: ReadonlyArray<MMDMotionBoneTrack | undefined>,
  initialParentWorldQuaternions: THREE.Quaternion[],
): Map<string, THREE.QuaternionKeyframeTrack>;
```

Use the canonical axis `(1, 0, 0)` for the left side and `(-1, 0, 0)` for the right side. For every sample and every source segment:

1. Get the rest direction from the mapped source bone to its nearest mapped child.
2. Build `sourceBasis = setFromUnitVectors(canonicalAxis, restDirection)`. This is the A-pose-to-canonical basis correction.
3. Compute `desiredWorld = motionWorldQuaternionAt(source, sampleIndex) * sourceBasis`.
4. Convert it to a local target track with `initialParentWorld.inverse() * desiredWorld`.
5. Use the resulting `desiredWorld` as the next chain parent, so unmapped twist bones do not become accidental humanoid parents.

If any segment has no valid rest/current geometry, return an empty map and let the existing quaternion-only path handle the arm chain. Keep hand output on the current path; the correction targets shoulder, upper arm, and elbow, and this avoids inventing a hand roll from positions alone.

- [x] **Step 3: Integrate the arm helper without changing other bones**

In `retargetMmdMotion`, build left and right arm tracks after hips are prepared. Use the existing mapped-parent world quaternion for the shoulder’s parent. Insert corrected tracks only when `canOutputBone` permits the target bone and no track has already been created. Skip the corrected source indices only for the three corrected roles; all other mapped bones continue through the existing loop.

- [x] **Step 4: Run the focused test to verify it passes**

Run: `node --test --experimental-strip-types test/mmd/MMDHumanoidRetargeter.test.ts`

Expected: PASS, including the existing mapping, hips, fallback, spine, and expression tests.

### Task 3: Validate against the supplied VMD and VRMA reference

**Files:**
- Modify: `docs/superpowers/plans/2026-09-08-mmd-a-pose-arm-retarget.md` only if verification notes need recording.
- Reference input: `,/LEMON MELON COOKIE/vmd/LEMON MELON COOKIE.vmd`
- Reference output: `,/LEMON MELON COOKIE/vrma/LEMON MELON COOKIE.vrma`

**Interfaces:**
- Consumes: the real fixed PMX bake and the corrected `retargetMmdMotion` output.
- Produces: fresh evidence that shoulder, upper-arm, and lower-arm tracks no longer use the uncorrected MMD A-pose basis.

- [x] **Step 1: Run the full test suite**

Run: `npm test`

Expected: all tests pass with zero failures.

- [x] **Step 2: Run the production build**

Run: `npm run build`

Expected: TypeScript and Vite both exit successfully.

- [x] **Step 3: Run the real-file comparison diagnostic**

The local PMX/VMD loader diagnostic baked the supplied VMD and compared the first-frame tracks with the supplied VRMA. The corrected differences were 8.73° (left shoulder), 16.60° (left upper arm), 4.48° (left lower arm), 8.73° (right shoulder), 16.72° (right upper arm), and 2.10° (right lower arm). The large elbow/forearm mismatch was reduced to a small residual, and no non-arm retarget code was changed.

- [x] **Step 4: Inspect the final diff**

Run: `git diff --check` and `git status --short`

Confirm that only the retargeter, its regression test, and this implementation plan changed; do not commit or use a subagent.
