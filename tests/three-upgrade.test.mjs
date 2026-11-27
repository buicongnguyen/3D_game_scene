// What the three.js upgrade (r180 -> r187) must not lose. Each of these once broke the picture while every other test
// still passed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { QUALITY, BLOOM } from '../src/engine/renderer.js';

const SRC = new URL('../src/', import.meta.url);
const files = fs.readdirSync(SRC, { recursive: true }).filter(f => f.endsWith('.js'));
const source = f => fs.readFileSync(new URL(f.split(path.sep).join('/'), SRC), 'utf8');
const using = re => files.filter(f => re.test(source(f)));

test('the soft shadow type is named as three has it now, before anything compiles', () => {
  // r182 removed PCFSoftShadowMap and swaps it only at the first shadow pass: a tier that skips that pass on its first
  // frame compiled the wrong shaders and the ground, houses and people vanished on phones
  assert.deepEqual(using(/shadowMap\.type\s*=\s*THREE\.PCFSoftShadowMap/), []);
  assert.match(source('engine/renderer.js'), /shadowMap\.type = THREE\.PCFShadowMap;/);
});

test('no deprecated THREE.Clock', () => {
  assert.deepEqual(using(/new THREE\.Clock\(/), []);
});

test('the bloom keeps the values fitted to the old look', () => {
  // r186 rewrote UnrealBloomPass: the old 0.42 / 0.55 now washes out night lanterns and sunlit snow. Re-fit against
  // pictures (not by eye) if these ever change.
  assert.deepEqual(BLOOM, { strength: 0.2, radius: 0.4, threshold: 0.92 });
  assert.match(source('engine/renderer.js'), /BLOOM.strength, BLOOM.radius, BLOOM.threshold/);
});

test('no quality tier turns the tree shadow proxies on by itself', () => {
  // they were never drawn before r182; turning them on changes the look and adds shadow-pass work (the owner's call)
  for (const [name, q] of Object.entries(QUALITY)) assert.notEqual(q.foliageShadows, true, name);
});
