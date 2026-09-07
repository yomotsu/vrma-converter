import test from 'node:test';
import assert from 'node:assert/strict';

import { MMD_PREVIEW_ENABLED, createMmdPreviewController } from '../../src/mmd/MMDPreview.ts';

test('keeps the debug MMD preview disabled without invoking the player', async () => {
  let playCalls = 0;
  let updateCalls = 0;
  const player = {
    playVmd: async () => {
      playCalls += 1;
    },
    update: () => {
      updateCalls += 1;
    },
  };

  const preview = createMmdPreviewController(MMD_PREVIEW_ENABLED, player);

  assert.equal(MMD_PREVIEW_ENABLED, false);
  assert.equal(preview.playVmd, null);
  preview.update(1 / 60);
  assert.equal(playCalls, 0);
  assert.equal(updateCalls, 0);
});
