# Task 4 report

## Files

- Added `src/animation/parseAnimationFile.ts` with non-MMD format support, animation loaders, dispatch, FPS estimation, clip labels, compatibility calculation, and object URL cleanup.
- Added focused format-support coverage in `test/animation/parseAnimationFile.test.ts`.
- Updated `src/main.ts` to delegate only VRMA/GLB/GLTF/FBX/BVH files and pass the existing DOM-owned `chooseFbxRigType` callback; the VMD branch remains in `main.ts`.

## TDD evidence

- RED: `node --test --experimental-strip-types test/animation/parseAnimationFile.test.ts` exited 1 with `ERR_MODULE_NOT_FOUND` for `src/animation/parseAnimationFile.ts` before the production module was created.
- GREEN: the same focused command passed 1/1 after the dispatcher was extracted.

## Verification

- Focused animation-file dispatcher test: 1/1 passed.
- `npm test`: 17/17 passed. The package script intentionally excludes `test/animation` until Task 9, so the Task 4 test is represented by the focused result above.
- `npm run build`: passed (`tsc -b` and Vite; 42 modules transformed). Vite emitted its non-failing large-chunk advisory.
- `git diff --check`: passed.

## Compatibility and preservation

- The extracted dispatcher preserves loader plugin registration, FBX chooser cancellation and multi-clip labels, VRMA expressions/look-at, BVH parser selection, source FPS, compatibility fields, and object URL revocation.
- Direct relative imports in the Node-tested module use `.ts` specifiers under the controller compatibility ruling. No JS bridge or package/tooling change was added.
- Existing user-owned changes in `index.html`, `src/main.ts`, `src/style.css`, and `test/mmd/MMDHumanoidRetargeter.test.ts`, including the lower-body MMD preference, remain present and are excluded from the Task 4 commit.
