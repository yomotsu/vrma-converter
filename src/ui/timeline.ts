import { HUMAN_BONES } from '../animation/rigMapping.ts';
import type {
  AnimationState,
  BoneName,
  ExpressionTrackSet,
  MotionTrackSet,
  TrackPath,
} from '../animation/types.js';
import { getTimelineScrollLeftForPlayhead } from '../timelineScroll.ts';
import type { DomElements } from './dom.js';

const TIMELINE_EDGE_PADDING = 40;
const DEFAULT_TIMELINE_PIXELS_PER_SECOND = 240;

export type TimelineDom = Pick<
  DomElements,
  | 'timelineRuler'
  | 'timelineRulerSticky'
  | 'timelineBody'
  | 'timelineScroll'
  | 'timelineScrollContent'
  | 'trackLanes'
  | 'transformsToggle'
  | 'transformBoneLabels'
  | 'transformBoneLanes'
  | 'transformsKeys'
  | 'faceKeys'
  | 'playhead'
  | 'currentFrame'
  | 'totalFrames'
  | 'currentTime'
>;

export type TimelineStateAccessors = {
  getAnimation: () => AnimationState | null;
  getTime: () => number;
  getZoom: () => number;
  getTransformsExpanded: () => boolean;
};

export type TimelineController = {
  render(): void;
  updatePlayhead(): void;
  centerOnPlayhead(): void;
  getTimeAtPointer(clientX: number): number | null;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatSeconds(seconds: number, decimals = 2): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60).toString().padStart(2, '0');
  const remaining = (safe % 60).toFixed(decimals).padStart(decimals + 3, '0');
  return `${minutes}:${remaining}`;
}

function formatTimelineSecond(seconds: number): string {
  const rounded = Math.round(Math.max(0, seconds) * 100) / 100;
  const value = Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return `${value}s`;
}

function formatFrame(frame: number): string {
  return Math.max(0, Math.round(frame)).toString();
}

function uniqueKeyTimes(set: MotionTrackSet): number[] {
  const values = new Set<number>();
  set.forEach((tracks) => {
    Object.values(tracks).forEach((track) => {
      track?.times.forEach((time) => values.add(Math.round(time * 1000) / 1000));
    });
  });
  return Array.from(values).sort((a, b) => a - b);
}

function uniqueExpressionKeyTimes(set: ExpressionTrackSet): number[] {
  const values = new Set<number>();
  set.preset.forEach((track) => track.times.forEach((time) => values.add(Math.round(time * 1000) / 1000)));
  set.custom.forEach((track) => track.times.forEach((time) => values.add(Math.round(time * 1000) / 1000)));
  return Array.from(values).sort((a, b) => a - b);
}

export function allAnimationKeyTimes(animation: AnimationState): number[] {
  return mergeKeyTimes(uniqueKeyTimes(animation.tracks), uniqueExpressionKeyTimes(animation.expressionTracks));
}

export function mergeKeyTimes(...lists: number[][]): number[] {
  return Array.from(new Set(lists.flat())).sort((a, b) => a - b);
}

function laneTimes(set: MotionTrackSet, paths: TrackPath[]): number[] {
  const values = new Set<number>();
  set.forEach((tracks, bone) => {
    const isBody = bone !== 'hips';
    const allowed = isBody ? paths.includes('rotation') : paths.includes('translation') || paths.includes('rotation');
    if (!allowed) return;
    paths.forEach((path) => tracks[path]?.times.forEach((time) => values.add(Math.round(time * 1000) / 1000)));
  });
  return Array.from(values).sort((a, b) => a - b);
}

function trackTimesForBone(set: MotionTrackSet, bone: BoneName): number[] {
  const tracks = set.get(bone);
  if (tracks == null) return [];
  return mergeKeyTimes(
    tracks.translation == null ? [] : Array.from(tracks.translation.times).map((time) => Math.round(time * 1000) / 1000),
    tracks.rotation == null ? [] : Array.from(tracks.rotation.times).map((time) => Math.round(time * 1000) / 1000),
  );
}

export function formatBoneName(bone: BoneName): string {
  return bone.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();
}

export function getTimeAtPointer(
  clientX: number,
  trackRect: Pick<DOMRect, 'left' | 'width'>,
  duration: number,
): number {
  const width = Math.max(1, trackRect.width);
  return clamp((clientX - trackRect.left) / width, 0, 1) * duration;
}

export function createTimelineController(
  timelineDom: TimelineDom,
  accessors: TimelineStateAccessors,
): TimelineController {
  let timelinePixelsPerSecond: number | null = null;

  function renderKeyRow(
    row: HTMLElement,
    times: number[],
    duration: number,
    className: string,
    muted = false,
    provisionalTimes: Set<number> = new Set(),
  ): void {
    row.replaceChildren();
    const limited = times.length > 600 ? times.filter((_, index) => index % Math.ceil(times.length / 600) === 0) : times;
    limited.forEach((time) => {
      const marker = document.createElement('span');
      const provisional = provisionalTimes.has(Math.round(time * 1000) / 1000);
      marker.className = `keyframe ${className}${muted ? ' muted' : ''}${provisional ? ' provisional' : ''}`;
      marker.style.left = `${duration <= 0 ? 0 : (time / duration) * 100}%`;
      marker.title = `${provisional ? 'PREVIEW · ' : ''}F ${formatFrame(time * (accessors.getAnimation()?.sourceFps ?? 30))} · ${formatSeconds(time)}`;
      row.append(marker);
    });
  }

  function updateTransformsExpansionUi(): void {
    const expanded = accessors.getTransformsExpanded();
    timelineDom.transformBoneLabels.hidden = !expanded;
    timelineDom.transformBoneLanes.hidden = !expanded;
    timelineDom.trackLanes.classList.toggle('transforms-expanded', expanded);
    timelineDom.transformsToggle.setAttribute('aria-expanded', String(expanded));
    timelineDom.transformsToggle.title = expanded ? 'ボーン別の表示を折りたたむ' : 'ボーン別に展開';
    timelineDom.transformsToggle.setAttribute('aria-label', expanded ? 'Bonesのボーン別表示を折りたたむ' : 'Bonesをボーン別に展開');
  }

  function renderTransformBoneRows(
    sourceTracks: MotionTrackSet,
    outputTracks: MotionTrackSet,
    duration: number,
    isTuningPreview: boolean,
    provisionalTimesFor: (sourceTimes: number[], outputTimes: number[]) => Set<number>,
  ): void {
    timelineDom.transformBoneLabels.replaceChildren();
    timelineDom.transformBoneLanes.replaceChildren();
    if (!accessors.getTransformsExpanded()) return;

    const bones = HUMAN_BONES.filter((bone) => (
      trackTimesForBone(sourceTracks, bone).length > 0 || trackTimesForBone(outputTracks, bone).length > 0
    ));
    bones.forEach((bone) => {
      const sourceTimes = trackTimesForBone(sourceTracks, bone);
      const outputTimes = trackTimesForBone(outputTracks, bone);
      const times = isTuningPreview ? mergeKeyTimes(sourceTimes, outputTimes) : outputTimes;
      const sourceSet = sourceTracks.get(bone);
      const outputSet = outputTracks.get(bone);
      const hasTranslation = sourceSet?.translation != null || outputSet?.translation != null;
      const hasRotation = sourceSet?.rotation != null || outputSet?.rotation != null;
      const pathLabel = [hasTranslation ? 'POSITION' : '', hasRotation ? 'ROTATION' : '']
        .filter((label) => label.length > 0)
        .join(' + ');

      const label = document.createElement('div');
      label.className = 'track-label track-bone-label';
      const color = document.createElement('span');
      color.className = 'track-color transforms';
      const name = document.createElement('span');
      name.className = 'track-bone-name';
      name.textContent = formatBoneName(bone);
      const path = document.createElement('small');
      path.textContent = pathLabel;
      label.append(color, name, path);

      const lane = document.createElement('div');
      lane.className = 'track-lane track-bone-lane';
      lane.dataset.bone = bone;
      const row = document.createElement('div');
      row.className = 'key-row';
      lane.append(row);
      timelineDom.transformBoneLabels.append(label);
      timelineDom.transformBoneLanes.append(lane);
      renderKeyRow(row, times, duration, 'transforms', false, provisionalTimesFor(sourceTimes, outputTimes));
    });
  }

  function getTimelinePixelsPerSecond(duration: number): number {
    if (timelinePixelsPerSecond == null) {
      const availableWidth = timelineDom.timelineScroll.clientWidth;
      timelinePixelsPerSecond = availableWidth > 0
        ? availableWidth / Math.max(0.001, duration)
        : DEFAULT_TIMELINE_PIXELS_PER_SECOND;
    }
    return timelinePixelsPerSecond;
  }

  function updateStickyTimelineRuler(): void {
    const bodyRect = timelineDom.timelineBody.getBoundingClientRect();
    const scrollRect = timelineDom.timelineScroll.getBoundingClientRect();
    timelineDom.timelineRulerSticky.style.left = `${Math.round(scrollRect.left)}px`;
    timelineDom.timelineRulerSticky.style.top = `${Math.round(bodyRect.top)}px`;
    timelineDom.timelineRulerSticky.style.width = `${Math.round(scrollRect.width)}px`;
    const ruler = timelineDom.timelineRuler.cloneNode(true) as HTMLElement;
    ruler.removeAttribute('id');
    ruler.style.left = `${TIMELINE_EDGE_PADDING}px`;
    ruler.style.width = `${Math.round(timelineDom.timelineRuler.getBoundingClientRect().width)}px`;
    ruler.style.transform = `translateX(-${timelineDom.timelineScroll.scrollLeft}px)`;
    timelineDom.timelineRulerSticky.replaceChildren(ruler);
  }

  function snapTimeToFrame(time: number): number {
    const animation = accessors.getAnimation();
    if (animation == null) return time;
    const fps = Math.max(1, animation.sourceFps);
    return clamp(Math.round(time * fps) / fps, 0, animation.duration);
  }

  function updatePlayhead(): void {
    const animation = accessors.getAnimation();
    const duration = animation?.duration ?? 1;
    const fps = Math.max(1, animation?.sourceFps ?? 30);
    const displayTime = snapTimeToFrame(accessors.getTime());
    const percent = clamp((displayTime / duration) * 100, 0, 100);
    timelineDom.playhead.style.left = `${percent}%`;
    const frame = Math.round(displayTime * fps);
    timelineDom.currentFrame.textContent = `F ${formatFrame(frame)}`;
    timelineDom.totalFrames.textContent = formatFrame(Math.round(duration * fps));
    timelineDom.currentTime.textContent = formatSeconds(displayTime);
  }

  function render(): void {
    updateTransformsExpansionUi();
    const animation = accessors.getAnimation();
    if (animation == null) {
      timelineDom.transformsKeys.replaceChildren();
      timelineDom.transformBoneLabels.replaceChildren();
      timelineDom.transformBoneLanes.replaceChildren();
      timelineDom.faceKeys.replaceChildren();
      timelineDom.timelineRuler.replaceChildren();
      timelineDom.timelineRulerSticky.replaceChildren();
      updatePlayhead();
      return;
    }
    const { duration, tracks } = animation;
    const motionTimes = uniqueKeyTimes(tracks);
    const expressionTimes = uniqueExpressionKeyTimes(animation.expressionTracks);
    const isBakePreview = animation.bakePreview != null;
    const sourceTracks = animation.sourceTracks;
    const sourceMotionTimes = uniqueKeyTimes(sourceTracks);
    const sourceExpressionTimes = uniqueExpressionKeyTimes(animation.sourceExpressionTracks);
    const transformsSourceTimes = mergeKeyTimes(laneTimes(sourceTracks, ['translation']), laneTimes(sourceTracks, ['rotation']));
    const transformsOutputTimes = mergeKeyTimes(laneTimes(tracks, ['translation']), laneTimes(tracks, ['rotation']));
    const provisionalTimesFor = (sourceTimes: number[], outputTimes: number[]): Set<number> => {
      if (isBakePreview) return new Set([
        ...sourceTimes.filter((time) => !outputTimes.includes(time)),
        ...outputTimes.filter((time) => !sourceTimes.includes(time)),
      ]);
      return new Set<number>();
    };
    const transformsTimes = isBakePreview
      ? mergeKeyTimes(transformsSourceTimes, transformsOutputTimes)
      : transformsOutputTimes;
    const faceOutputTimes = animation.source === 'preview' ? motionTimes.filter((_, index) => index % 2 === 0) : expressionTimes;
    const faceSourceTimes = animation.source === 'preview'
      ? sourceMotionTimes.filter((_, index) => index % 2 === 0)
      : sourceExpressionTimes;
    const faceTimes = isBakePreview ? mergeKeyTimes(faceSourceTimes, faceOutputTimes) : faceOutputTimes;
    renderKeyRow(timelineDom.transformsKeys, transformsTimes, duration, 'transforms', false, provisionalTimesFor(transformsSourceTimes, transformsOutputTimes));
    renderTransformBoneRows(sourceTracks, tracks, duration, isBakePreview, provisionalTimesFor);
    renderKeyRow(timelineDom.faceKeys, faceTimes, duration, 'face', true, provisionalTimesFor(faceSourceTimes, faceOutputTimes));
    const fps = Math.max(1, animation.sourceFps);
    const totalFrames = Math.max(1, Math.round(duration * fps));
    timelineDom.timelineRuler.replaceChildren();
    const frameStep = `${100 / totalFrames}%`;
    const secondStep = `${duration <= 0 ? 100 : (1 / duration) * 100}%`;
    timelineDom.timelineRuler.style.setProperty('--frame-step', frameStep);
    timelineDom.timelineRuler.style.setProperty('--second-step', secondStep);
    timelineDom.trackLanes.style.setProperty('--frame-step', frameStep);
    timelineDom.trackLanes.style.setProperty('--second-step', secondStep);
    const trackWidth = Math.max(1, duration * getTimelinePixelsPerSecond(duration) * accessors.getZoom());
    timelineDom.timelineScrollContent.style.width = `${trackWidth + TIMELINE_EDGE_PADDING * 2}px`;
    timelineDom.timelineRuler.style.width = '100%';
    timelineDom.trackLanes.style.width = '100%';
    const timeRow = document.createElement('div');
    timeRow.className = 'ruler-row ruler-time-row';
    const secondCount = Math.floor(duration + 0.0001);
    for (let second = 0; second <= secondCount; second += 1) {
      const mark = document.createElement('span');
      mark.className = 'ruler-mark';
      mark.style.left = `${duration <= 0 ? 0 : (second / duration) * 100}%`;
      mark.textContent = formatTimelineSecond(second);
      timeRow.append(mark);
    }
    if (duration - secondCount > 0.0001) {
      const mark = document.createElement('span');
      mark.className = 'ruler-mark ruler-final-time-mark';
      mark.style.left = '100%';
      mark.textContent = formatTimelineSecond(duration);
      timeRow.append(mark);
    }
    timelineDom.timelineRuler.append(timeRow);
    const frameRow = document.createElement('div');
    frameRow.className = 'ruler-row ruler-frame-row';
    for (let frame = 0; frame <= totalFrames; frame += 10) {
      const mark = document.createElement('span');
      mark.className = 'ruler-mark';
      mark.style.left = `${(frame / totalFrames) * 100}%`;
      mark.textContent = `F ${formatFrame(frame)}`;
      frameRow.append(mark);
    }
    if (totalFrames % 10 !== 0) {
      const mark = document.createElement('span');
      mark.className = 'ruler-mark';
      mark.style.left = '100%';
      mark.textContent = `F ${formatFrame(totalFrames)}`;
      frameRow.append(mark);
    }
    timelineDom.timelineRuler.append(frameRow);
    updateStickyTimelineRuler();
    updatePlayhead();
  }

  function centerOnPlayhead(): void {
    const playheadRect = timelineDom.playhead.getBoundingClientRect();
    const timelineRect = timelineDom.timelineScroll.getBoundingClientRect();
    const currentScrollLeft = timelineDom.timelineScroll.scrollLeft;
    const nextScrollLeft = getTimelineScrollLeftForPlayhead({
      currentScrollLeft,
      playheadCenter: playheadRect.left + playheadRect.width / 2,
      viewportLeft: timelineRect.left,
      viewportWidth: timelineDom.timelineScroll.clientWidth,
      maxScrollLeft: Math.max(0, timelineDom.timelineScroll.scrollWidth - timelineDom.timelineScroll.clientWidth),
    });
    if (nextScrollLeft !== currentScrollLeft) timelineDom.timelineScroll.scrollLeft = nextScrollLeft;
  }

  function timeAtPointer(clientX: number): number | null {
    const animation = accessors.getAnimation();
    if (animation == null) return null;
    return getTimeAtPointer(clientX, timelineDom.trackLanes.getBoundingClientRect(), animation.duration);
  }

  timelineDom.timelineBody.addEventListener('scroll', updateStickyTimelineRuler, { passive: true });
  timelineDom.timelineScroll.addEventListener('scroll', updateStickyTimelineRuler, { passive: true });
  window.addEventListener('resize', updateStickyTimelineRuler);

  return { render, updatePlayhead, centerOnPlayhead, getTimeAtPointer: timeAtPointer };
}
