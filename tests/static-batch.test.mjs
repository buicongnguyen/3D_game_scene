import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { batchCopies } from '../src/world/static-batch.js';
import { CellGrid } from '../src/world/cells.js';

const geometry = new THREE.BoxGeometry(2, 3, 1), material = new THREE.MeshStandardMaterial();
const assets = { parts: () => [{ geometry, material, matrix: new THREE.Matrix4().makeTranslation(0, 1.5, 0) }] };
function copy(group, x, z) {
  const o = new THREE.Group(); o.userData.model = 'fence'; o.position.set(x, 2, z); o.rotation.y = 0.4;
  const mesh = new THREE.Mesh(geometry, material); mesh.position.y = 1.5; o.add(mesh); group.add(o);
  return o;
}

test('batches share centred cell parents without changing instance world transforms', () => {
  const group = new THREE.Group(), grid = new CellGrid(group), originals = [copy(group, -10, 0), copy(group, 10, 0)];
  group.updateMatrixWorld(true); const before = originals.map(o => o.children[0].matrixWorld.clone());
  assert.equal(batchCopies(group, assets, ['fence'], { grid }), 1);
  const mesh = group.getObjectByName('fence:batch'); group.updateMatrixWorld(true);
  assert.equal(mesh.parent.parent.name, 'cell:0,0');
  for (let i = 0; i < 2; i++) {
    const actual = new THREE.Matrix4(); mesh.getMatrixAt(i, actual); actual.premultiply(mesh.matrixWorld);
    for (let k = 0; k < 16; k++) assert.ok(Math.abs(actual.elements[k] - before[i].elements[k]) < 1e-6);
  }
});

test('legacy batching retains its uncentred 48 m partition, and keeps toggled/placeholder copies', () => {
  const group = new THREE.Group(), a = copy(group, -10, 0), b = copy(group, 10, 0);
  const kept = copy(group, 15, 0), placeholder = copy(group, 20, 0); placeholder.userData.placeholder = 'fence';
  assert.equal(batchCopies(group, assets, ['fence'], { keep: new Set([kept]) }), 0);
  assert.deepEqual(group.children, [a, b, kept, placeholder]);
});

test('singletons in a cell remain real models and distant batches have separate parents', () => {
  const group = new THREE.Group(), grid = new CellGrid(group);
  const single = copy(group, 40, 0); copy(group, -10, 0); copy(group, 10, 0);
  assert.equal(batchCopies(group, assets, ['fence'], { grid }), 1);
  assert.equal(single.parent.parent.name, 'cell:1,0');
  assert.equal(single.children.length, 1);
  assert.equal(group.getObjectByName('fence:batch').parent.parent.name, 'cell:0,0');
});

test('wide viaduct batches keep their original draw count while gaining cell parents', () => {
  const group = new THREE.Group(), grid = new CellGrid(group);
  for (const x of [-100, -70, -30, -10, 10, 30, 70, 100]) copy(group, x, 0);
  assert.equal(batchCopies(group, assets, ['fence'], { grid, cell: 400, preserveBatches: true }), 2);
  const batches = []; group.traverse(o => { if (o.isInstancedMesh) batches.push(o); });
  assert.deepEqual(batches.map(o => o.count), [4, 4]);
  assert(batches.every(o => o.parent.parent.name.startsWith('cell:')));
});
