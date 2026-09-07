type BoneMappingPopover = HTMLElement & {
  showPopover?: () => void;
  hidePopover?: () => void;
};

const fallbackOpenPopovers = new WeakSet<object>();

export function isBoneMappingPopoverOpen(popover: BoneMappingPopover): boolean {
  if (typeof popover.showPopover === 'function' && typeof popover.matches === 'function') {
    return popover.matches(':popover-open');
  }
  return fallbackOpenPopovers.has(popover) || !popover.hidden;
}

export function setBoneMappingPopoverOpen(popover: BoneMappingPopover, open: boolean): void {
  if (open) {
    popover.hidden = false;
    if (typeof popover.showPopover === 'function') popover.showPopover();
    fallbackOpenPopovers.add(popover);
    return;
  }

  const supportsNativePopover = typeof popover.showPopover === 'function' && typeof popover.matches === 'function';
  const nativeOpen = supportsNativePopover && popover.matches(':popover-open');
  if (typeof popover.hidePopover === 'function' && (nativeOpen || (!supportsNativePopover && fallbackOpenPopovers.has(popover)))) {
    popover.hidePopover();
  }
  popover.hidden = true;
  fallbackOpenPopovers.delete(popover);
}
