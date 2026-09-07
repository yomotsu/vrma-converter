import test from 'node:test';
import assert from 'node:assert/strict';

import { getTimelineScrollLeftForPlayhead } from '../../src/timelineScroll.ts';

test('centers an offscreen playhead in the timeline viewport', () => {
  const nextScrollLeft = getTimelineScrollLeftForPlayhead({
    currentScrollLeft: 300,
    playheadCenter: 1250,
    viewportLeft: 100,
    viewportWidth: 600,
    maxScrollLeft: 2000,
  });

  assert.equal(nextScrollLeft, 1150);
});

test('keeps the current scroll position while the playhead is visible', () => {
  const nextScrollLeft = getTimelineScrollLeftForPlayhead({
    currentScrollLeft: 300,
    playheadCenter: 500,
    viewportLeft: 100,
    viewportWidth: 600,
    maxScrollLeft: 2000,
  });

  assert.equal(nextScrollLeft, 300);
});

test('clamps the centered playhead position to the scroll range', () => {
  const nextScrollLeft = getTimelineScrollLeftForPlayhead({
    currentScrollLeft: 900,
    playheadCenter: 2000,
    viewportLeft: 100,
    viewportWidth: 500,
    maxScrollLeft: 1200,
  });

  assert.equal(nextScrollLeft, 1200);
});
