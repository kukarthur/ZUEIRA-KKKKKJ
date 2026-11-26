import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const runtimeSource = await readFile(new URL('../src/game-runtime.js', import.meta.url), 'utf8');
const htmlSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const styleSource = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');

test('menu bootstrap defers Three.js, scene and map imports until match start', () => {
  assert.doesNotMatch(mainSource, /from\s+['"]three(?:\/|['"])/);
  assert.doesNotMatch(mainSource, /from\s+['"].*map\.js['"]/);
  assert.match(mainSource, /await import\(['"]\.\/game-runtime\.js['"]\)/);
  assert.match(runtimeSource, /new THREE\.WebGLRenderer/);
  assert.match(runtimeSource, /createMap\(scene,\s*mapId\)/);
});

test('menu and lobby start with a CSS-only background and hidden game canvas', () => {
  assert.match(htmlSource, /<canvas id="game" class="game-canvas"/);
  assert.match(styleSource, /\.game-canvas\s*\{\s*display:\s*none;/);
  assert.match(styleSource, /\.game-canvas\.visible\s*\{\s*display:\s*block;/);
  assert.match(htmlSource, /id="attackers-players"/);
  assert.match(htmlSource, /id="defenders-players"/);
});
