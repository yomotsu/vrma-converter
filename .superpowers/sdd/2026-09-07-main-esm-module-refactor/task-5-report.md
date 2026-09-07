# Task 5 report

## Files

- Added `src/animation/previewAnimation.ts` with the existing startup preview animation generator and exact preview state values.
- Added `src/vrma/exportVrma.ts` with the state-independent `VrmaExportAnimation` input type and existing GLB writer.
- Added focused coverage in `test/animation/previewAnimation.test.ts` and `test/vrma/exportVrma.test.ts`.
- Updated `src/main.ts` to import both modules with `.js` specifiers, removing only the moved implementations and retaining `downloadVrma()` as the DOM action.

## TDD evidence

- RED: `node --test --experimental-strip-types test/vrma/exportVrma.test.ts test/animation/previewAnimation.test.ts` exited 1 before the production modules existed, with `ERR_MODULE_NOT_FOUND` for both new modules (0 passed, 2 failed).
- The first implementation run exposed Node's lack of `.js`-to-`.ts` remapping for internal source imports. Under the controller ruling, only the two directly tested modules were changed to `.ts` relative source imports; no bridge or tooling change was added.
- GREEN: the same focused command passed 2/2 tests.

## Verification

- Focused preview/export tests: 2/2 passed.
- `npm test`: 17/17 passed. The package script intentionally excludes the focused animation and VRMA directories until Task 9.
- `npm run build`: passed (`tsc -b` and Vite; 44 modules transformed). Vite emitted its non-failing large-chunk advisory.
- `git diff --check`: passed.

## Compatibility and preservation

- Preview identity, duration, source FPS, normalized hips translation, animation tracks, blink track, cloning behavior, and state flags remain unchanged.
- VRMA node order and extension structure, 4-byte alignment, JSON-space padding, binary accessors, quaternion normalization, hips scaling, expression clamping/nodes, and look-at node/channel behavior remain unchanged.
- Existing user-owned changes in `index.html`, `src/main.ts`, `src/style.css`, and `test/mmd/MMDHumanoidRetargeter.test.ts`, including the lower-body MMD preference, remain present. The pre-existing `src/main.ts` bones-readout edit is excluded from the Task 5 commit through partial staging.
