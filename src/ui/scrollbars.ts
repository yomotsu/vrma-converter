type ScrollbarAxis = 'vertical' | 'horizontal';
type AlwaysScrollbar = {
  target: HTMLElement;
  axis: ScrollbarAxis;
  track: HTMLDivElement;
  thumb: HTMLDivElement;
};

export type AlwaysVisibleScrollbarOptions = {
  sidebarTargets: Iterable<HTMLElement>;
  timelineBody: HTMLElement;
  timelineScroll: HTMLElement;
};

const alwaysScrollbars: AlwaysScrollbar[] = [];
let alwaysScrollbarRefreshFrame: number | null = null;
let alwaysScrollbarOptions: AlwaysVisibleScrollbarOptions | null = null;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function calculateScrollbarThumbSize(trackSize: number, viewportSize: number, contentSize: number): number {
  return Math.round((trackSize * viewportSize) / contentSize);
}

function scrollbarPointerPosition(event: PointerEvent, axis: ScrollbarAxis): number {
  return axis === 'vertical' ? event.clientY : event.clientX;
}

function scrollbarScrollPosition(scrollbar: AlwaysScrollbar): number {
  return scrollbar.axis === 'vertical' ? scrollbar.target.scrollTop : scrollbar.target.scrollLeft;
}

function setScrollbarScrollPosition(scrollbar: AlwaysScrollbar, value: number): void {
  if (scrollbar.axis === 'vertical') {
    scrollbar.target.scrollTop = value;
  } else {
    scrollbar.target.scrollLeft = value;
  }
}

function refreshAlwaysScrollbar(scrollbar: AlwaysScrollbar): void {
  const { target, axis, track, thumb } = scrollbar;
  const rect = target.getBoundingClientRect();
  const visibleBodyRect = axis === 'horizontal' && target === alwaysScrollbarOptions?.timelineScroll
    ? alwaysScrollbarOptions.timelineBody.getBoundingClientRect()
    : rect;
  const viewportSize = axis === 'vertical' ? target.clientHeight : target.clientWidth;
  const contentSize = axis === 'vertical' ? target.scrollHeight : target.scrollWidth;
  const trackSize = axis === 'vertical' ? rect.height : rect.width;
  if (viewportSize <= 0 || contentSize <= viewportSize + 1 || trackSize <= 0) {
    track.hidden = true;
    return;
  }

  const thickness = 10;
  const thumbSize = clamp(calculateScrollbarThumbSize(trackSize, viewportSize, contentSize), 24, trackSize);
  const maxThumbOffset = Math.max(0, trackSize - thumbSize);
  const maxScroll = Math.max(0, contentSize - viewportSize);
  const thumbOffset = maxScroll === 0 ? 0 : (scrollbarScrollPosition(scrollbar) / maxScroll) * maxThumbOffset;
  track.hidden = false;
  if (axis === 'vertical') {
    track.style.left = `${Math.round(rect.right - thickness)}px`;
    track.style.top = `${Math.round(rect.top)}px`;
    track.style.width = `${thickness}px`;
    track.style.height = `${Math.round(rect.height)}px`;
    thumb.style.left = '0';
    thumb.style.top = `${Math.round(thumbOffset)}px`;
    thumb.style.width = '100%';
    thumb.style.height = `${thumbSize}px`;
  } else {
    track.style.left = `${Math.round(rect.left)}px`;
    track.style.top = `${Math.round(visibleBodyRect.bottom - thickness)}px`;
    track.style.width = `${Math.round(rect.width)}px`;
    track.style.height = `${thickness}px`;
    thumb.style.left = `${Math.round(thumbOffset)}px`;
    thumb.style.top = '0';
    thumb.style.width = `${thumbSize}px`;
    thumb.style.height = '100%';
  }
}

function refreshAlwaysScrollbars(): void {
  alwaysScrollbarRefreshFrame = null;
  alwaysScrollbars.forEach(refreshAlwaysScrollbar);
}

function scheduleAlwaysScrollbarRefresh(): void {
  if (alwaysScrollbarRefreshFrame != null) return;
  alwaysScrollbarRefreshFrame = window.requestAnimationFrame(refreshAlwaysScrollbars);
}

function createAlwaysScrollbar(target: HTMLElement, axis: ScrollbarAxis): void {
  const track = document.createElement('div');
  track.className = `always-scrollbar ${axis}`;
  track.hidden = true;
  track.setAttribute('aria-hidden', 'true');
  const thumb = document.createElement('div');
  thumb.className = 'always-scrollbar-thumb';
  track.append(thumb);
  document.body.append(track);
  const scrollbar: AlwaysScrollbar = { target, axis, track, thumb };
  alwaysScrollbars.push(scrollbar);

  thumb.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const startPointer = scrollbarPointerPosition(event, axis);
    const startScroll = scrollbarScrollPosition(scrollbar);
    const trackRect = track.getBoundingClientRect();
    const thumbRect = thumb.getBoundingClientRect();
    const trackSize = axis === 'vertical' ? trackRect.height : trackRect.width;
    const thumbSize = axis === 'vertical' ? thumbRect.height : thumbRect.width;
    const maxThumbOffset = Math.max(0, trackSize - thumbSize);
    const viewportSize = axis === 'vertical' ? target.clientHeight : target.clientWidth;
    const contentSize = axis === 'vertical' ? target.scrollHeight : target.scrollWidth;
    const maxScroll = Math.max(0, contentSize - viewportSize);
    if (maxThumbOffset <= 0 || maxScroll <= 0) return;

    const move = (moveEvent: PointerEvent): void => {
      const delta = scrollbarPointerPosition(moveEvent, axis) - startPointer;
      setScrollbarScrollPosition(scrollbar, startScroll + (delta / maxThumbOffset) * maxScroll);
      scheduleAlwaysScrollbarRefresh();
    };
    const stop = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  });

  track.addEventListener('pointerdown', (event) => {
    if (event.target === thumb) return;
    event.preventDefault();
    event.stopPropagation();
    const pointer = scrollbarPointerPosition(event, axis);
    const thumbRect = thumb.getBoundingClientRect();
    const viewportSize = axis === 'vertical' ? target.clientHeight : target.clientWidth;
    const direction = pointer < (axis === 'vertical' ? thumbRect.top : thumbRect.left) ? -1 : 1;
    setScrollbarScrollPosition(scrollbar, scrollbarScrollPosition(scrollbar) + direction * viewportSize);
    scheduleAlwaysScrollbarRefresh();
  });

  target.addEventListener('scroll', scheduleAlwaysScrollbarRefresh, { passive: true });
  const observer = new MutationObserver(scheduleAlwaysScrollbarRefresh);
  observer.observe(target, { attributes: true, childList: true, subtree: true });
}

export function installAlwaysVisibleScrollbars(options: AlwaysVisibleScrollbarOptions): void {
  alwaysScrollbarOptions = options;
  for (const sidebar of options.sidebarTargets) createAlwaysScrollbar(sidebar, 'vertical');
  createAlwaysScrollbar(options.timelineBody, 'vertical');
  createAlwaysScrollbar(options.timelineScroll, 'horizontal');
  window.addEventListener('resize', scheduleAlwaysScrollbarRefresh);
  scheduleAlwaysScrollbarRefresh();
}
