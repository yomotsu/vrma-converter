import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { createVrmaBlob } from '../../src/vrma/exportVrma.ts';

test('creates a VRMA GLB with humanoid and expression animation channels', async () => {
  const animation = {
    displayName: 'walk',
    restHipsY: 1,
    tracks: new Map([
      ['hips', {
        rotation: new THREE.QuaternionKeyframeTrack('', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
        translation: new THREE.VectorKeyframeTrack('', [0, 1], [0, 1, 0, 0, 1, 0]),
      }],
    ]),
    expressionTracks: {
      preset: new Map([['blink', new THREE.NumberKeyframeTrack('', [0, 1], [0, 1])]]),
      custom: new Map(),
    },
    lookAtTrack: null,
  } as const;

  const bytes = new Uint8Array(await createVrmaBlob(animation).arrayBuffer());
  const view = new DataView(bytes.buffer);
  assert.equal(view.getUint32(0, true), 0x46546c67);
  assert.equal(view.getUint32(4, true), 2);
  const jsonLength = view.getUint32(12, true);
  assert.equal(view.getUint32(16, true), 0x4e4f534a);
  const json = JSON.parse(new TextDecoder().decode(bytes.slice(20, 20 + jsonLength)).trim());
  assert.equal(json.animations[0].name, 'walk');
  assert.equal(json.extensions.VRMC_vrm_animation.humanoid.humanBones.hips.node, 0);
  assert.ok(json.animations[0].channels.length >= 2);
});
