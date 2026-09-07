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
