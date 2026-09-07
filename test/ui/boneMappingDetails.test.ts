import test from 'node:test';
import assert from 'node:assert/strict';

import { getBoneMappingDetails } from '../../src/ui/boneMappingDetails.ts';

test('returns every humanoid bone with its mapped state', () => {
  const details = getBoneMappingDetails({ hips: {}, jaw: undefined });

  assert.equal(details.length, 55);
  assert.deepEqual(details.find((detail) => detail.name === 'hips'), {
    name: 'hips',
    mapped: true,
  });
  assert.deepEqual(details.find((detail) => detail.name === 'jaw'), {
    name: 'jaw',
    mapped: false,
  });
});
