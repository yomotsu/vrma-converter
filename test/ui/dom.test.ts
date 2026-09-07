import test from 'node:test';
import assert from 'node:assert/strict';

test('maps the viewport and FBX dialog selectors to typed DOM references', async () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    querySelector: (selector: string) => ({ selector }),
  } as unknown as Document;
  try {
    const { dom } = await import('../../src/ui/dom.ts');
    assert.equal((dom.viewport as unknown as { selector: string }).selector, '#viewport');
    assert.equal((dom.fbxRigDialog as unknown as { selector: string }).selector, '#fbx-rig-dialog');
  } finally {
    globalThis.document = previousDocument;
  }
});
