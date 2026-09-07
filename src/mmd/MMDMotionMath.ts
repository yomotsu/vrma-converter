export { continuousQuaternionValues } from '../animation/trackUtils.ts';

export function createMmdFrameTimes(duration: number, fps = 30): number[] {
  const safeDuration = Math.max(0, Number.isFinite(duration) ? duration : 0);
  const safeFps = Math.max(1, Math.round(Number.isFinite(fps) ? fps : 30));
  const frameCount = Math.max(0, Math.floor(safeDuration * safeFps + 0.000001));
  const times = Array.from({ length: frameCount + 1 }, (_, index) => index / safeFps);
  const finalTime = safeDuration;
  const lastTime = times[times.length - 1] ?? 0;

  if (lastTime < finalTime - 0.000001) times.push(finalTime);
  else if (times.length > 0) times[times.length - 1] = finalTime;

  return times;
}
