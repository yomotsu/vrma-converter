import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const indexMarkup = readFileSync(resolve(projectRoot, 'index.html'), 'utf8');
const mainMarkup = readFileSync(resolve(projectRoot, 'src/main.ts'), 'utf8');
const styleMarkup = readFileSync(resolve(projectRoot, 'src/style.css'), 'utf8');

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

test('shows a dismissible first-visit hint for the animation drop target', () => {
  assert.match(indexMarkup, /class="animation-drop-hint" id="animation-drop-hint" role="status"/);
  assert.match(indexMarkup, /id="animation-drop-hint-close"/);
  assert.match(mainMarkup, /localStorage\.getItem\(ANIMATION_DROP_HINT_STORAGE_KEY\)/);
  assert.match(mainMarkup, /localStorage\.setItem\(ANIMATION_DROP_HINT_STORAGE_KEY, 'true'\)/);
  assert.match(mainMarkup, /setTimeout\(dismissAnimationDropHint, ANIMATION_DROP_HINT_AUTO_DISMISS_MS\)/);
  assert.match(styleMarkup, /\.animation-drop-hint\s*\{/);
  assert.match(styleMarkup, /animation-drop-hint-exit/);
  assert.match(styleMarkup, /anchor-name:\s*--animation-drop-target/);
  assert.match(styleMarkup, /position-anchor:\s*--animation-drop-target/);
  assert.match(styleMarkup, /\.motion-dropzone\.first-visit-focus\s*\{/);
});
