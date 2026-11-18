import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Foliage } from '../src/world/foliage.js';

function forest(records = [{ x: 0, y: 0, z: 0, s: 1, rot: 0, model: 'tree-broadleaf-a' }]) {
  const geometry = new THREE.BoxGeometry(2, 8, 2).translate(0, 4, 0);
  const material = new THREE.MeshStandardMaterial();
  const scene = new THREE.Group(); scene.add(new THREE.Mesh(geometry, material));
  const parts = [{ geometry, material, matrix: new THREE.Matrix4() }];
  const assets = { has: name => ['tree-broadleaf-a', 'tree-broadleaf-a-lod'].includes(name),
    gltf: () => ({ scene }), parts: () => parts };
  const foliage = new Foliage(new THREE.Scene(), assets,
    { trees: records, bushes: [], rocks: [], flowers: [], reeds: [], lilies: [] }, { trees: 1, shadowRange: 40 });
  return { foliage, set: foliage.treeSets[0], dispose() { foliage.dispose(); geometry.dispose(); material.dispose(); } };
}

function step(set, distance, away = false) {
  const camera = new THREE.PerspectiveCamera(55, 390 / 844, 0.35, 4600);
  camera.position.set(0, 4, distance);
  camera.lookAt(0, 4, away ? distance + 50 : 0);
  camera.updateMatrixWorld(true);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  set.update(camera.position, frustum, 40, 100);
  return { near: set.near.map(m => m.count), far: set.far.map(m => m.count) };
}

for (const [label, route] of [
  ['cutoff stays hidden inside its hysteresis band', [[104], [96, true], [96]]],
  ['crossing outward while looking away', [[80], [104, true], [96]]],
  ['crossing inward while looking away', [[104], [80, true], [96]]],
  ['LOD stays distant inside its hysteresis band', [[45], [35, true], [35]]],
  ['LOD crosses outward while looking away', [[20], [45, true], [35]]],
  ['LOD crosses inward while looking away', [[45], [20, true], [35]]],
]) test(`foliage cells preserve the old per-record path: ${label}`, () => {
  const fast = forest(), old = forest(); old.set.cellsOn = false;
  try {
    for (const [distance, away] of route) assert.deepEqual(step(fast.set, distance, away), step(old.set, distance, away), `${distance} m, looking ${away ? 'away' : 'at the tree'}`);
  } finally { fast.dispose(); old.dispose(); }
});

test('switching the per-record fallback cannot leave a stale uniform distance state', () => {
  const fast = forest(), old = forest(); old.set.cellsOn = false;
  try {
    for (const [on, distance, away] of [[true, 200, true], [false, 20, false], [true, 200, true], [true, 96, false]]) {
      fast.set.cellsOn = on;
      assert.deepEqual(step(fast.set, distance, away), step(old.set, distance, away));
    }
  } finally { fast.dispose(); old.dispose(); }
});

test('offscreen cells wholly beyond both distances do not keep walking their records', () => {
  let reads = 0;
  const records = Array.from({ length: 100 }, (_, i) => ({ model: 'tree-broadleaf-a', y: 0, s: 1, rot: 0,
    get x() { reads++; return i % 10; }, get z() { reads++; return Math.floor(i / 10); } }));
  const f = forest(records);
  try {
    step(f.set, 300, true);
    reads = 0;
    for (let i = 0; i < 10; i++) step(f.set, 300 + i, true);
    assert.equal(reads, 0, 'stable far squares skip all per-record distance, frustum and instance work');
  } finally { f.dispose(); }
});

test('mixed cells match the old cull lists through camera travel, turns and quality distance changes', () => {
  let seed = 18112026;
  const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 2 ** 32);
  const records = Array.from({ length: 240 }, () => ({ model: 'tree-broadleaf-a', x: random() * 440 - 220,
    y: random() * 20, z: random() * 440 - 220, s: 0.7 + random(), sy: 0.8 + random(), rot: random() * 360 }));
  const fast = forest(records), old = forest(records); old.set.cellsOn = false;
  const matrix = new THREE.Matrix4();
  const list = meshes => meshes.map(mesh => Array.from({ length: mesh.count }, (_, i) => {
    mesh.getMatrixAt(i, matrix); return Array.from(matrix.elements).join(',');
  }).sort());
  try {
    for (let i = 0; i < 100; i++) {
      const camera = new THREE.PerspectiveCamera(55, i % 3 ? 390 / 844 : 16 / 9, 0.35, 4600);
      camera.position.set(Math.sin(i * 0.19) * 150, 4, Math.cos(i * 0.13) * 150);
      camera.lookAt(camera.position.x + Math.sin(i * 0.7) * 50, 8, camera.position.z + Math.cos(i * 0.7) * 50);
      camera.updateMatrixWorld(true);
      const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      const near = [40, 55, 70][Math.floor(i / 12) % 3], max = [100, 160, 240][Math.floor(i / 17) % 3];
      for (const f of [fast, old]) f.set.update(camera.position, frustum, near, max);
      assert.deepEqual(fast.set.state, old.set.state, `all distance states, frame ${i}`);
      assert.deepEqual(list(fast.set.near), list(old.set.near), `near instances, frame ${i}`);
      assert.deepEqual(list(fast.set.far), list(old.set.far), `distant instances, frame ${i}`);
    }
  } finally { fast.dispose(); old.dispose(); }
});
