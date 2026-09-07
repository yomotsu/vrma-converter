import test from 'node:test';
import assert from 'node:assert/strict';

import { setBoneMappingPopoverOpen } from '../../src/ui/boneMappingPopover.ts';

test('uses the Popover API when opening and closing the bone details', () => {
  const calls: string[] = [];
  const popover = {
    hidden: true,
    showPopover: () => calls.push('show'),
    hidePopover: () => calls.push('hide'),
  };

  setBoneMappingPopoverOpen(popover, true);
  setBoneMappingPopoverOpen(popover, false);

  assert.deepEqual(calls, ['show', 'hide']);
});

test('does not hide a native popover that was already light-dismissed', () => {
  const calls: string[] = [];
  const popover = {
    hidden: false,
    showPopover: () => calls.push('show'),
    matches: () => false,
    hidePopover: () => calls.push('hide'),
  };

  setBoneMappingPopoverOpen(popover, true);
  setBoneMappingPopoverOpen(popover, false);

  assert.deepEqual(calls, ['show']);
  assert.equal(popover.hidden, true);
});
