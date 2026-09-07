import test from 'node:test';
import assert from 'node:assert/strict';

import { createPreviewAnimation } from '../../src/animation/previewAnimation.ts';

test('creates the startup preview clip with hips and blink animation', () => {
  const animation = createPreviewAnimation();

  assert.equal(animation.duration, 2.4);
  assert.equal(animation.source, 'preview');
  assert.equal(animation.tracks.has('hips'), true);
  assert.equal(animation.expressionTracks.preset.has('blink'), true);
});
