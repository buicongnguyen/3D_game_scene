// Squares of the map for static things (engine/cell-grid.js): adopting moves nothing in the world, a square is hidden only
// when it is outside the view and outside the sun's shadow box, and what moves is never in a square.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CellGrid, Cells, cellIndex, CELL } from '../src/engine/cell-grid.js';

const box = (x, z, s = 4) => { const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s)); m.position.set(x, s / 2, z); m.rotation.y = x * 0.01; return m; };

function world() {
  const scene = new THREE.Scene(), parent = new THREE.Group();
  parent.name = 'structures';
  scene.add(parent);
  const things = [];
  for (let i = 0; i < 60; i++) { const o = box(-300 + (i * 37) % 600, -300 + (i * 53) % 600); parent.add(o); things.push(o); }
  const house = new THREE.Group(); house.position.set(20, 0, -10); house.add(box(0, 0, 6), box(3, 2, 2)); parent.add(house); things.push(house);
  const ferry = box(5, 30); ferry.name = 'ferry'; parent.add(ferry);
  const long = new THREE.Mesh(new THREE.BoxGeometry(200, 2, 2)); parent.add(long);            // a fence line across the map
  const lamp = box(40, 40); lamp.add(new THREE.PointLight()); parent.add(lamp);
  scene.updateMatrixWorld(true);
  return { scene, parent, things, ferry, long, lamp };
}

const worldMatrices = objs => objs.map(o => { o.updateWorldMatrix(true, true); const out = []; o.traverse(c => out.push(...c.matrixWorld.elements)); return out; });

test('the grid is centred on the villages', () => {
  assert.deepEqual(cellIndex(-26, 20), [0, 0]);        // Kawabe: one square, not the corner of four
  assert.deepEqual(cellIndex(110, -16), [2, 0]);       // Takamori
  assert.deepEqual(cellIndex(CELL / 2 - 0.01, 0), [0, 0]);
  assert.deepEqual(cellIndex(CELL / 2, 0), [1, 0]);
});

test('adopting moves nothing in the world, and leaves what moves, what is too large and what holds a light', () => {
  const { parent, things, ferry, long, lamp } = world();
  const before = worldMatrices(things);
  const grid = new CellGrid(parent, { skip: o => o === ferry });
  const n = grid.adopt();
  assert.equal(n, things.length);
  assert.deepEqual(worldMatrices(things), before);
  for (const o of [ferry, long, lamp]) assert.equal(o.parent, parent);
  for (const o of things) { assert.ok(o.parent.userData.cell, 'in a square'); assert.equal(o.parent.parent, parent); }
  // every thing is inside its square's ball
  for (const c of grid.cells.values()) for (const o of c.group.children) {
    const b = new THREE.Box3().setFromObject(o), s = b.getBoundingSphere(new THREE.Sphere());
    assert.ok(c.sphere.center.distanceTo(s.center) + s.radius <= c.sphere.radius + 1e-9);
  }
});

const camera = (x, z, lx, lz, aspect = 390 / 844) => {
  const c = new THREE.PerspectiveCamera(55, aspect, 0.35, 4600);
  c.position.set(x, 3, z); c.lookAt(lx, 2, lz); c.updateMatrixWorld(true);
  return c;
};
const frustumOf = cam => new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));

test('a square is hidden only when nothing in it can be in the view or in the shadow box', () => {
  const { parent, things } = world();
  const grid = new CellGrid(parent);
  grid.adopt();
  const sun = new THREE.DirectionalLight(); sun.castShadow = true;
  const r = 30; Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 420 }); sun.shadow.camera.updateProjectionMatrix();
  let hiddenSome = 0;
  for (let k = 0; k < 40; k++) {
    const x = -250 + (k * 71) % 500, z = -250 + (k * 113) % 500, a = k * 0.7;
    const cam = camera(x, z, x + Math.sin(a) * 50, z + Math.cos(a) * 50);
    sun.position.set(x + 120, 160, z + 60); sun.target.position.set(x, 0, z); sun.updateMatrixWorld(); sun.target.updateMatrixWorld();
    Cells.sun = sun;
    grid.update(frustumOf(cam), Cells.sunFrustum());
    sun.shadow.updateMatrices(sun);
    const view = frustumOf(cam), shadow = sun.shadow.getFrustum();
    for (const o of things) {
      const s = new THREE.Box3().setFromObject(o).getBoundingSphere(new THREE.Sphere());
      if (!o.parent.visible) { hiddenSome++; assert.ok(!view.intersectsSphere(s) && !shadow.intersectsSphere(s), `hidden but seen or casting (cam ${k})`); }
    }
  }
  assert.ok(hiddenSome > 200, `squares do get hidden (${hiddenSome})`);
});

test("the sun's box worked out from the light is three.js's own shadow frustum", () => {
  const sun = new THREE.DirectionalLight(); sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 1, far: 420 }); sun.shadow.camera.updateProjectionMatrix();
  sun.position.set(-80, 200, 35); sun.target.position.set(12, 3, -7);
  sun.updateMatrixWorld(); sun.target.updateMatrixWorld();
  Cells.sun = sun;
  const mine = Cells.sunFrustum().planes.map(p => [...p.normal.toArray(), p.constant]);
  sun.shadow.updateMatrices(sun);
  const theirs = sun.shadow.getFrustum().planes.map(p => [...p.normal.toArray(), p.constant]);
  mine.flat().forEach((v, i) => assert.ok(Math.abs(v - theirs.flat()[i]) < 1e-6, `plane value ${i}`));
});

test('switched off, every square is shown; something that moves leaves its square', () => {
  const { parent, things } = world();
  const grid = Cells.add(new CellGrid(parent));
  grid.adopt();
  Cells.sun = null;
  Cells.update(camera(0, 0, 0, 50));
  assert.ok(grid.hidden > 0);
  Cells.enabled = false; Cells.update(camera(0, 0, 0, 50));
  assert.equal(grid.hidden, 0);
  assert.ok([...grid.cells.values()].every(c => c.group.visible));
  Cells.enabled = true;
  const mover = things[3], at = mover.getWorldPosition(new THREE.Vector3());
  mover.position.x += 5;
  for (let i = 0; i < 10; i++) grid.check();
  assert.equal(mover.parent, parent, 'back under the parent');
  assert.ok(mover.getWorldPosition(new THREE.Vector3()).distanceTo(at) - 5 < 1e-9);
  Cells.remove(grid);
});
