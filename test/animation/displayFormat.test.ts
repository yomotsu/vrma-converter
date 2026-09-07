import test from 'node:test';
import assert from 'node:assert/strict';

import { displayFormatForImport } from '../../src/animation/displayFormat.ts';

test('displays imported VMD motion as VMD', () => {
  assert.equal(displayFormatForImport('vmd'), 'VMD');
});

test('keeps the file extension display format for other animation imports', () => {
  assert.equal(displayFormatForImport('fbx'), 'FBX');
});
