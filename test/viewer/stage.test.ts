import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { getObjectHeight } from '../../src/viewer/stage.ts';

test('getObjectHeight returns the world-space object height with a safe minimum', () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1));
  assert.equal(getObjectHeight(mesh), 2);
  mesh.scale.y = 0;
  assert.equal(getObjectHeight(mesh), 0.1);
});
