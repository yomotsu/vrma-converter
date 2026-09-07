# Task 6 report

## Files

- Added `src/ui/dom.ts` with the complete existing selector/type map and exported `DomElements` and `dom`.
- Added `src/ui/scrollbars.ts` with the existing scrollbar state, geometry, pointer handling, observers, and listeners behind `installAlwaysVisibleScrollbars(options)`.
- Added focused coverage in `test/ui/dom.test.ts` and `test/ui/scrollbars.test.ts`.
- Updated `src/main.ts` to import the UI modules and pass the sidebar and timeline targets during bootstrap.

## TDD evidence

- RED: `node --test --experimental-strip-types test/ui/dom.test.ts test/ui/scrollbars.test.ts` exited 1 before the production modules existed. Both tests failed with `ERR_MODULE_NOT_FOUND` (0 passed, 2 failed).
- GREEN: the same focused command passed 2/2 tests after the modules were added.
- The first build found two residual `scheduleAlwaysScrollbarRefresh` references in `main.ts`. The extracted scrollbar constructor already registers passive scroll listeners for both timeline elements, so the duplicate calls were removed while retaining sticky-ruler updates and scrollbar refresh behavior.

## Verification

- Focused UI tests: 2/2 passed.
- `npm test`: 17/17 passed. The package script intentionally excludes `test/ui` until Task 9, so the UI tests were also run directly.
- `npm run build`: passed (`tsc -b` and Vite; 46 modules transformed). Vite emitted its existing non-failing large-chunk advisory.
- `git diff --check`: passed.

## Compatibility and preservation

- All DOM selectors and element types are unchanged.
- Scrollbar visibility thresholds, 24px minimum thumb clamp, geometry, drag/page behavior, mutation observation, scroll scheduling, and resize scheduling are unchanged.
- Existing user-owned changes in `index.html`, `src/style.css`, and `test/mmd/MMDHumanoidRetargeter.test.ts` remain unstaged and unmodified by Task 6.
- The existing lower-body MMD preference and mapped-bones display text remain present.
