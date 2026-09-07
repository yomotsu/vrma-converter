export type PlaybackAdvance = {
  time: number;
  playing: boolean;
};

export function advancePlaybackTime(
  time: number,
  delta: number,
  duration: number,
  loop: boolean,
): PlaybackAdvance {
  const nextTime = time + Math.max(0, delta);
  if (nextTime <= duration) return { time: nextTime, playing: true };
  if (loop && duration > 0) return { time: nextTime % duration, playing: true };
  return { time: Math.max(0, duration), playing: false };
}
