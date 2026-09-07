import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test('Vite emits asset URLs relative to the GitHub Pages project path', () => {
  const configPath = resolve(projectRoot, 'vite.config.ts');

  assert.equal(existsSync(configPath), true, 'vite.config.ts must exist');
  assert.match(readFileSync(configPath, 'utf8'), /base:\s*['"]\.\/['"]/);
});

test('GitHub Pages deploys the production build from main', () => {
  const workflowPath = resolve(projectRoot, '.github/workflows/deploy-pages.yml');

  assert.equal(existsSync(workflowPath), true, 'deploy-pages.yml must exist');

  const workflow = readFileSync(workflowPath, 'utf8');
  assert.match(workflow, /push:\s*\n\s+branches:\s*\n\s+[-*]\s*main/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /actions\/upload-pages-artifact@v3/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
});
