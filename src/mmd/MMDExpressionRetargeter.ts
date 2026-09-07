import * as THREE from 'three';

import type { MMDMotionBakeResult } from './MMDMotionTypes.js';

export type MMDExpressionAvailability = {
  preset?: ReadonlySet<string>;
  custom?: ReadonlySet<string>;
};

export type MMDExpressionMotion = {
  preset: Map<string, THREE.NumberKeyframeTrack>;
  custom: Map<string, THREE.NumberKeyframeTrack>;
};

const normalizeMmdExpressionName = (name: string): string => name
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[\s_.()\-]/g, '');

const expressionAliases: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
  ['blink', ['まばたき', '瞬き', 'blink', 'eyeclose']],
  ['blinkLeft', ['ウィンク', 'wink', 'winkleft', 'ウィンク左', '左ウィンク']],
  ['blinkRight', ['ウィンク右', 'winkright', 'wink右', '右ウィンク']],
  ['happy', ['笑い', 'happy']],
  ['angry', ['怒り', 'angry']],
  ['sad', ['困る', '悲しい', 'sad']],
  ['relaxed', ['なごみ', 'relaxed']],
  ['surprised', ['びっくり', '驚き', 'surprised']],
  ['aa', ['あ', 'a', 'aa']],
  ['ih', ['い', 'i', 'ih']],
  ['ou', ['う', 'u', 'ou']],
  ['ee', ['え', 'e', 'ee']],
  ['oh', ['お', 'o', 'oh']],
];

const expressionAliasMap = new Map<string, string>();
for (const [target, aliases] of expressionAliases) {
  for (const alias of aliases) expressionAliasMap.set(normalizeMmdExpressionName(alias), target);
}

export function mapMmdExpressionName(name: string): string | null {
  return expressionAliasMap.get(normalizeMmdExpressionName(name)) ?? null;
}

function expressionTrack(
  targetName: string,
  source: THREE.NumberKeyframeTrack,
): THREE.NumberKeyframeTrack {
  const track = new THREE.NumberKeyframeTrack(
    `${targetName}.weight`,
    Array.from(source.times),
    Array.from(source.values),
  );
  track.setInterpolation(source.getInterpolation());
  return track;
}

function availableCustomExpressionName(
  sourceName: string,
  available: ReadonlySet<string> | undefined,
): string | null {
  if (available == null) return null;
  const normalizedSourceName = normalizeMmdExpressionName(sourceName);
  for (const name of available) {
    if (name === sourceName || normalizeMmdExpressionName(name) === normalizedSourceName) return name;
  }
  return null;
}

function canOutput(available: ReadonlySet<string> | undefined, name: string): boolean {
  return available == null || available.has(name);
}

export function retargetMmdExpressions(
  result: MMDMotionBakeResult,
  available: MMDExpressionAvailability = {},
): MMDExpressionMotion {
  const expressionTracks: MMDExpressionMotion = { preset: new Map(), custom: new Map() };

  for (const source of result.expressionTracks) {
    const presetName = mapMmdExpressionName(source.name);
    if (presetName != null && canOutput(available.preset, presetName)) {
      if (!expressionTracks.preset.has(presetName)) {
        expressionTracks.preset.set(presetName, expressionTrack(presetName, source.weight));
      }
      continue;
    }

    const customName = availableCustomExpressionName(source.name, available.custom);
    if (customName != null && !expressionTracks.custom.has(customName)) {
      expressionTracks.custom.set(customName, expressionTrack(customName, source.weight));
    }
  }

  return expressionTracks;
}
