# Task 2 report

## Files

- Added `src/animation/rigMapping.ts` with humanoid mappings, rig detection, and track-path helpers.
- Added `src/animation/mixamoParser.ts` with Mixamo rest-pose correction and retargeting.
- Added focused coverage in `test/animation/mixamoParser.test.ts`.
- Updated the Task 2 imports and parser wiring in `src/main.ts`; `chooseFbxRigType` remains there.

## Evidence

- Focused Mixamo test: 3/3 passed.
- `npm test`: 17/17 passed.
- `npm run build`: passed (`tsc -b` and Vite build).
- `git diff --check`: passed.

## Deviations

The parser's direct internal imports use `.ts` relative specifiers because the controller ruling permits this for Node `--experimental-strip-types` focused tests and Node does not resolve the corresponding uncompiled `.js` files. No JS bridge or tooling change was added. The quaternion assertion tolerance is `1e-3` to account for Three.js Float32 keyframe storage.

## Fix round evidence

- Replaced the Universal parser's stale map reference with `mapUniversalBone(sourceNodeName)`.
- Restored the pre-existing viewport wheel suppression handler.
- Restored generic `mapSourceBone` semantics and kept rig-specific lookup in `mapMixamoBone` / `mapUniversalBone`.
- Focused Mixamo tests: 5/5 passed, including target-bone filtering and missing/non-positive hips errors.
- `npm test`: 17/17 passed (the package glob intentionally excludes focused animation tests until Task 9).
- `npm run build`: passed.
- `git diff --check`: passed.
