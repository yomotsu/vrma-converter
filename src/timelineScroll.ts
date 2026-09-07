export type TimelineScrollPosition = {
  currentScrollLeft: number;
  playheadCenter: number;
  viewportLeft: number;
  viewportWidth: number;
  maxScrollLeft: number;
};

export function getTimelineScrollLeftForPlayhead(position: TimelineScrollPosition): number {
  const viewportRight = position.viewportLeft + position.viewportWidth;
  if (position.playheadCenter >= position.viewportLeft && position.playheadCenter <= viewportRight) {
    return position.currentScrollLeft;
  }

  const viewportCenter = position.viewportLeft + position.viewportWidth / 2;
  return Math.min(
    position.maxScrollLeft,
    Math.max(0, position.currentScrollLeft + position.playheadCenter - viewportCenter),
  );
}
