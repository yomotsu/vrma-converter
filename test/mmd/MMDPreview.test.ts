import test from 'node:test';
import assert from 'node:assert/strict';

import { MMD_PREVIEW_ENABLED, createMmdPreviewController, isMmdPreviewEnabled } from '../../src/mmd/MMDPreview.ts';

test('enables the preview only when the URL contains the uppercase MMD flag', () => {
  assert.equal(isMmdPreviewEnabled('?MMD'), true);
  assert.equal(isMmdPreviewEnabled('?foo=1&MMD'), true);
  assert.equal(isMmdPreviewEnabled('?mmd'), false);
  assert.equal(isMmdPreviewEnabled('?foo=MMD'), false);
  assert.equal(isMmdPreviewEnabled(''), false);
});

test('keeps the MMD preview disabled in non-browser environments without invoking the player', async () => {
  let playCalls = 0;
  let setTimeCalls = 0;
  let updateCalls = 0;
  const player = {
    playVmd: async () => {
      playCalls += 1;
    },
    setTime: () => {
      setTimeCalls += 1;
    },
    update: () => {
      updateCalls += 1;
    },
  };

  const preview = createMmdPreviewController(MMD_PREVIEW_ENABLED, player);

  assert.equal(MMD_PREVIEW_ENABLED, false);
  assert.equal(preview.playVmd, null);
  preview.setTime(1);
  preview.update(1 / 60);
  assert.equal(playCalls, 0);
  assert.equal(setTimeCalls, 0);
  assert.equal(updateCalls, 0);
});

test('forwards timeline time to an enabled MMD preview player', () => {
  const times: number[] = [];
  const player = {
    playVmd: async () => undefined,
    setTime: (time: number) => times.push(time),
    update: () => undefined,
  };

  const preview = createMmdPreviewController(true, player);
  preview.setTime(1.25);

  assert.deepEqual(times, [1.25]);
});
