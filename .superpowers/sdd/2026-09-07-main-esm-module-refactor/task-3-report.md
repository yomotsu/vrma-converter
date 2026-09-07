# Task 3 report

## Files

- Added `src/animation/universalParser.ts` with the existing Universal coordinate conversion, hips translation time union, root-parent transform, horizontal rest-offset removal, and rest-height calculation.
- Added `src/animation/bvhParser.ts` with Daz skeleton detection, rest-height estimation, root translation normalization, target filtering, and quaternion continuity.
- Added `src/animation/genericParser.ts` with the existing source-track normalization and hips-only translation rule.
- Added `src/animation/vrmaParser.ts` with cloned humanoid, expression, and optional look-at tracks.
- Added focused coverage in `test/animation/sourceParsers.test.ts`.
- Replaced only the moved source-parser bodies in `src/main.ts` with imports; format dispatch remains in `src/main.ts` for Task 4.

## TDD evidence

- RED: `node --test --experimental-strip-types test/animation/sourceParsers.test.ts` failed with `ERR_MODULE_NOT_FOUND` for `src/animation/universalParser.ts` before production modules were created (0 passed, 1 file-level failure).
- The initial GREEN run passed 3/4 tests and exposed an invalid Daz fixture: all skeleton bones were colocated, so the preserved rest-height estimator returned its `0.0001` floor. Setting the synthetic abdomen one unit below the root made the literal expected normalization valid without changing production behavior.
- GREEN: focused source-parser tests passed 4/4.

## Verification

- Focused source-parser tests: 4/4 passed.
- `npm test`: 17/17 passed. The package script intentionally excludes `test/animation` until Task 9, so the four Task 3 tests are represented by the focused result above.
- `npm run build`: passed (`tsc -b` and Vite; 41 modules transformed).
- `git diff --check`: passed.

## Compatibility and preservation

- Direct relative imports in the focused-test-facing source parser modules use `.ts` specifiers under the controller ruling. No JS bridge or package/tooling change was added.
- `RetargetedMotion` is imported from its reviewed Task 2 location, `mixamoParser.ts`; no prior-task module was modified.
- Existing user-owned changes in `index.html`, `src/main.ts`, `src/style.css`, and `test/mmd/MMDHumanoidRetargeter.test.ts`, including the lower-body MMD preference, remain present and unmodified by Task 3.
