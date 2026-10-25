import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CELL, cellIndex, CellGrid, cullReference, distanceVisible, updateCellGrids } from '../src/world/cells.js';

const q = { buildDist: 300, propDist: 80, midDist: 140 };
const model = (x, z, size = 2) => {
  const obj = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshBasicMaterial());
  obj.position.set(x, 0, z);
  return obj;
};
const camera = (x = 0, z = 0, lookZ = -20) => {
  const cam = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
  cam.position.set(x, 2, z); cam.lookAt(x, 2, lookZ); cam.updateMatrixWorld();
  return cam;
};

test('64 m cells use centred boundaries including negative coordinates', () => {
  assert.equal(CELL, 64);
  assert.deepEqual([-96.01, -96, -32.01, -32, 31.99, 32, 110].map(x => cellIndex(x)), [-2, -1, -1, 0, 0, 1, 2]);
  assert.equal(cellIndex(-26), cellIndex(20));
});

test('distance hysteresis and orbit reference exactly match the old culler', () => {
  assert.equal(distanceVisible(true, 79 ** 2, 80), true);
  assert.equal(distanceVisible(true, 80 ** 2, 80), false);
  assert.equal(distanceVisible(false, 70 ** 2, 80), false);
  assert.equal(distanceVisible(false, 67 ** 2, 80), true);
  const focus = { x: 0, z: 0 }, near = { x: 14, z: 0 }, far = { x: 15, z: 0 };
  assert.equal(cullReference(focus, near), focus);
  assert.equal(cullReference(focus, far), far);
});

test('identity cell parents preserve world transforms and separate prop/building/mid ranges', () => {
  const parent = new THREE.Group(), grid = new CellGrid(parent);
  const prop = model(0, -90), building = model(0, -90), mid = model(0, -90);
  parent.add(prop); prop.rotation.y = 0.4; prop.scale.set(2, 3, 4); prop.updateMatrixWorld(true);
  const before = prop.matrixWorld.clone();
  grid.add(prop, 0, -90, 'prop'); grid.add(building, 0, -90, 'building'); grid.add(mid, 0, -90, 'mid');
  parent.updateMatrixWorld(true); assert.deepEqual(prop.matrixWorld.elements, before.elements);
  grid.update({ x: 0, z: 0 }, camera(), q);
  assert.equal(prop.parent.visible, false); assert.equal(building.parent.visible, true); assert.equal(mid.parent.visible, true);
  assert.equal(prop.visible, true);
  building.visible = false; grid.update({ x: 0, z: 0 }, camera(), q); assert.equal(building.visible, false);
});

test('a near cell keeps the exact cutoff for each prop and does not reuse frustum state as distance history', () => {
  const grid = new CellGrid(new THREE.Group());
  const near = model(0, -70), far = model(0, -90);
  grid.add(near, 0, -70, 'prop'); grid.add(far, 0, -90, 'prop');
  grid.update({ x: 0, z: 0 }, camera(0, 0, 20), q);
  assert.equal(near.parent.parent.visible, false);
  grid.update({ x: 0, z: 0 }, camera(), q);
  assert.equal(near.parent.parent.visible, true);
  assert.equal(near.parent.visible, true); assert.equal(far.parent.visible, false);
});

test('cell bounds include models crossing a cell edge and hide whole offscreen subtrees', () => {
  const grid = new CellGrid(new THREE.Group()), obj = model(40, -40, 60), behind = model(0, 100);
  grid.add(obj, 40, -40, 'building'); grid.add(behind, 0, 100, 'building');
  grid.update({ x: 0, z: 0 }, camera(), q);
  assert.equal(obj.parent.parent.parent.visible, true);
  assert.equal(behind.parent.parent.parent.visible, false);
});

test('offscreen shadow casters remain visible and the real shadow matrix is untouched', () => {
  const scene = new THREE.Scene(), parent = new THREE.Group(); scene.add(parent);
  const sun = new THREE.DirectionalLight(); sun.castShadow = true;
  sun.position.set(0, 30, 100); sun.target.position.set(0, 0, 100);
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 0.1, far: 100 });
  sun.shadow.camera.updateProjectionMatrix(); scene.add(sun, sun.target);
  const oldMatrix = sun.shadow.matrix.clone();
  const grid = new CellGrid(parent, CELL, { scene, sky: { sun } }), caster = model(0, 100);
  grid.add(caster, 0, 100, 'building'); updateCellGrids(scene, camera(), q);
  assert.equal(caster.parent.parent.parent.visible, true);
  assert.deepEqual(sun.shadow.matrix.elements, oldMatrix.elements);
});

test('pruned cells and distance gates stay detached after updates', () => {
  const grid = new CellGrid(new THREE.Group()), obj = model(0, -20);
  grid.add(obj, 0, -20, 'prop'); const cell = obj.parent.parent.parent;
  cell.removeFromParent(); grid.update({ x: 0, z: 0 }, camera(), q);
  assert.equal(cell.parent, null);
});
