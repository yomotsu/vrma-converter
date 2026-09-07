import * as THREE from 'three';

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

export function continuousQuaternionValues(values: number[]): number[] {
  const result: number[] = [];
  let previous: THREE.Quaternion | null = null;

  for (let index = 0; index + 3 < values.length; index += 4) {
    const current = new THREE.Quaternion().fromArray(
      values.slice(index, index + 4) as [number, number, number, number],
    );

    if (current.lengthSq() < 1e-12) current.identity();
    else current.normalize();

    if (previous != null && previous.dot(current) < 0) {
      current.set(-current.x, -current.y, -current.z, -current.w);
    }

    result.push(...current.toArray().map((value) => Object.is(value, -0) ? 0 : value));
    previous = current;
  }

  return result;
}
