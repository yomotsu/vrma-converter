import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const indexMarkup = readFileSync(resolve(projectRoot, 'index.html'), 'utf8');
const styleMarkup = readFileSync(resolve(projectRoot, 'src/style.css'), 'utf8');

test('presents bake FPS and frame step as selects without a duplicate range control', () => {
  assert.match(indexMarkup, /<select class="bake-fps-input" id="bake-fps"/);
  assert.match(indexMarkup, /<label class="frame-setting frame-step-setting"><span>FRAME STEP<\/span><span class="frame-step-readout"><span>Every<\/span><select class="frame-step-select" id="bake-frame-step"/);
  assert.match(indexMarkup, /<strong>frame<\/strong>/);
  assert.doesNotMatch(indexMarkup, /id="bake-frame-step-number"/);
  assert.doesNotMatch(indexMarkup, /id="bake-frame-step" type="range"/);
  assert.doesNotMatch(indexMarkup, /EVERY N FRAMES/);
});

test('explains the frame step quality and file size tradeoff', () => {
  assert.match(indexMarkup, /Frame Stepはキーフレームの間隔です。値が大きいほどファイル容量を抑えられますが、細かな動きが失われる場合があります。/);
});

test('adds space above the bake operation buttons', () => {
  assert.match(styleMarkup, /\.bake-actions\s*\{[^}]*margin-top:\s*16px;/s);
});

test('labels the revert action as restore', () => {
  assert.match(indexMarkup, /<button class="revert-button" id="bake-revert-button"[^>]*>RESTORE<\/button>/);
  assert.doesNotMatch(indexMarkup, /<button class="revert-button" id="bake-revert-button"[^>]*>REVERT<\/button>/);
});
