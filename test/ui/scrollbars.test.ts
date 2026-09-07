import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateScrollbarThumbSize } from '../../src/ui/scrollbars.ts';

test('calculates the rounded scrollbar thumb size before clamping', () => {
  assert.equal(calculateScrollbarThumbSize(200, 100, 300), 67);
});
