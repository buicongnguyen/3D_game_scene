import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { updateWorldMatrices } from '../src/engine/matrices.js';
import { dirtyRange, writeInstanceMatrix } from '../src/engine/buffer-updates.js';
import { Pool } from '../src/fx/fx.js';
import { SpriteSystem } from '../src/fx/cel-sprites.js';

test('dirty ranges retain culled changes and remain bounded', () => {
  const a = new THREE.BufferAttribute(new Float32Array(160), 16);
  dirtyRange(a, 96, 16); dirtyRange(a, 16, 16);
  assert.deepEqual(a.updateRanges, [{ start: 16, count: 96 }]);
  for (let i = 0; i < 100; i++) dirtyRange(a, 32, 16);
  assert.equal(a.updateRanges.length, 1);
  const v = a.version; dirtyRange(a, 0, 0); assert.equal(a.version, v);
  a.clearUpdateRanges(); dirtyRange(a, 0, 16);
  assert.deepEqual(a.updateRanges, [{ start: 0, count: 16 }]);
});

test('identical float32 instance matrices do not upload; replacements do', () => {
  const a = new THREE.InstancedBufferAttribute(new Float32Array(32), 16);
  const m = new THREE.Matrix4().makeRotationY(0.123456789);
  assert.equal(writeInstanceMatrix(a, 0, m), true);
  const v = a.version;
  assert.equal(writeInstanceMatrix(a, 0, m), false); assert.equal(a.version, v);
  writeInstanceMatrix(a, 1, m); m.setPosition(1, 2, 3);
  assert.equal(writeInstanceMatrix(a, 0, m), true);
  assert.equal(a.array[12], 1);
});

test('world cache matches native movement, turns, scaling, reparenting and reveal', () => {
  const root = new THREE.Group(), a = new THREE.Group(), b = new THREE.Group(), child = new THREE.Object3D();
  root.add(a, b); a.add(child); child.position.set(1, 2, 3); b.position.x = 10;
  const verify = () => {
    updateWorldMatrices(root);
    const cached = child.matrixWorld.clone();
    root.updateMatrixWorld(true);
    assert.ok(cached.equals(child.matrixWorld));
  };
  verify(); a.position.x = 5; verify(); a.rotation.y = 0.7; verify(); a.scale.setScalar(2); verify();
  b.add(child); verify();
  b.visible = false; updateWorldMatrices(root); b.position.z = 13; updateWorldMatrices(root); b.visible = true; verify();
  b.position.x = 20; b.getWorldPosition(new THREE.Vector3()); verify();
  child.matrixAutoUpdate = false; child.matrix.makeTranslation(3, 4, 5); child.matrixWorldNeedsUpdate = true; verify();
  child.matrixAutoUpdate = true; verify(); // same TRS as before manual mode must be recomposed
  child.position.x = 7; verify();
});

test('unchanged explicit root queries do not invalidate entire scene', () => {
  const root = new THREE.Scene(); root.matrixWorldAutoUpdate = false;
  const group = new THREE.Group(); root.add(group);
  for (let i = 0; i < 100; i++) group.add(new THREE.Object3D());
  updateWorldMatrices(root); group.getWorldPosition(new THREE.Vector3());
  const original = THREE.Matrix4.prototype.multiplyMatrices; let calls = 0;
  THREE.Matrix4.prototype.multiplyMatrices = function (...args) { calls++; return original.apply(this, args); };
  try { updateWorldMatrices(root); } finally { THREE.Matrix4.prototype.multiplyMatrices = original; }
  assert.ok(calls < 5, `expected local invalidation, got ${calls}`);
  root.matrixWorld.makeTranslation(10, 0, 0); root.matrixWorldNeedsUpdate = true;
  updateWorldMatrices(root); assert.equal(group.children[0].matrixWorld.elements[12], 10);
});

test('particle expiry, empty updates, ring wrap and reuse preserve live slots', () => {
  globalThis.innerHeight = 800;
  const pool = new Pool(new THREE.Scene(), 4);
  const g = pool.points.geometry, p = new THREE.Vector3(), v = new THREE.Vector3(1, 0, 0);
  pool.update(0.1); assert.equal(g.attributes.position.version, 0);
  pool.emit(p, v, { life: 1 }); pool.update(0.1);
  assert.equal(g.drawRange.count, 1); assert.ok(pool.pos[0] > 0);
  assert.deepEqual(g.attributes.position.updateRanges, [{ start: 0, count: 3 }]);
  pool.update(2); assert.equal(g.drawRange.count, 0); assert.equal(pool.col[3], 0);
  const version = g.attributes.position.version; pool.update(1); assert.equal(g.attributes.position.version, version);
  for (let i = 0; i < 6; i++) pool.emit(p, v, { life: 1 });
  pool.update(0.1); assert.equal(g.drawRange.count, 4);
  assert.ok(pool.col[15] > 0);
  g.dispose(); pool.points.material.dispose();
});

test('GPU sprite flush retains uploads across skipped renders and ring wrap', () => {
  const s = Object.create(SpriteSystem.prototype);
  Object.assign(s, { n: 8, start: 6, pending: 2, lastBirth: Infinity, points: {}, attrs: [new THREE.BufferAttribute(new Float32Array(24), 3)] });
  s.flush(); s.start = 1; s.pending = 2; s.flush();
  assert.deepEqual(s.attrs[0].updateRanges, [{ start: 3, count: 21 }]);
  s.attrs[0].clearUpdateRanges(); s.start = 7; s.pending = 3; s.flush();
  assert.deepEqual(s.attrs[0].updateRanges, [{ start: 0, count: 24 }]);
  const version = s.attrs[0].version; s.flush(); assert.equal(s.attrs[0].version, version);
});

test('animated skeleton world matrices and bind inverses match native traversal', () => {
  const root = new THREE.Scene(), mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  const a = new THREE.Bone(), b = new THREE.Bone(); a.add(b); b.position.y = 1; mesh.add(a); root.add(mesh);
  mesh.bind(new THREE.Skeleton([a, b]));
  for (let i = 0; i < 20; i++) {
    a.rotation.z = i * 0.1; mesh.position.x = i * 0.2;
    updateWorldMatrices(root);
    const world = b.matrixWorld.clone(), bind = mesh.bindMatrixInverse.clone();
    root.updateMatrixWorld(true);
    assert.ok(world.equals(b.matrixWorld)); assert.ok(bind.equals(mesh.bindMatrixInverse));
  }
  mesh.geometry.dispose(); mesh.material.dispose(); mesh.skeleton.dispose();
});
