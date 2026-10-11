import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { updateWorldMatrices } from '../src/engine/matrices.js';

// the visible-only world matrix pass (engine/matrices.js) must agree with three.js' own updateMatrixWorld wherever
// something can be seen
const worldPos = o => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
const same = (a, b, msg) => assert.ok(a.distanceTo(b) < 1e-9, `${msg}: ${a.toArray()} vs ${b.toArray()}`);

function scene() {
  const s = new THREE.Scene();
  s.matrixWorldAutoUpdate = false;
  return s;
}

test('moving things follow, unmoved ones are left alone', () => {
  const s = scene(), g = new THREE.Group(), m = new THREE.Mesh();
  g.add(m); s.add(g);
  m.position.set(1, 2, 3);
  updateWorldMatrices(s);
  same(worldPos(m), new THREE.Vector3(1, 2, 3), 'first frame');
  g.position.x = 10;
  updateWorldMatrices(s);
  same(worldPos(m), new THREE.Vector3(11, 2, 3), 'parent moved');
  m.rotation.y = 1; m.scale.setScalar(2);
  updateWorldMatrices(s);
  assert.ok(Math.abs(m.matrixWorld.elements[0] - 2 * Math.cos(1)) < 1e-9, 'rotation and scale picked up');
});

test('something that moves while hidden is right the first frame it is shown again', () => {
  const s = scene(), g = new THREE.Group(), m = new THREE.Mesh();
  g.add(m); s.add(g);
  updateWorldMatrices(s);
  g.visible = false;
  for (let i = 0; i < 5; i++) { g.position.x += 1; m.position.z -= 1; updateWorldMatrices(s); }
  g.visible = true;
  updateWorldMatrices(s);
  same(worldPos(m), new THREE.Vector3(5, 0, -5), 'shown again');
});

test('objects added after the first frame, and bones under a moving character, are current', () => {
  const s = scene(), root = new THREE.Group(), bone = new THREE.Bone(), tip = new THREE.Bone();
  bone.add(tip); root.add(bone); s.add(root);
  tip.position.y = 1;
  updateWorldMatrices(s);
  root.position.set(3, 0, 0); bone.rotation.z = Math.PI / 2;
  updateWorldMatrices(s);
  same(worldPos(tip), new THREE.Vector3(2, 0, 0), 'tip of a rotated bone');
  const late = new THREE.Mesh(); late.position.set(0, 7, 0); root.add(late);
  updateWorldMatrices(s);
  same(worldPos(late), new THREE.Vector3(3, 7, 0), 'added late');
});

test('an object moved to another parent is placed by the new parent in the same frame', () => {
  const s = scene(), a = new THREE.Group(), b = new THREE.Group(), m = new THREE.Mesh();
  a.position.x = 5; b.position.x = -5;
  a.add(m); s.add(a, b);
  updateWorldMatrices(s);
  same(worldPos(m), new THREE.Vector3(5, 0, 0), 'under a');
  b.add(m);                       // same local transform (identity), another parent, nobody moved
  updateWorldMatrices(s);
  same(worldPos(m), new THREE.Vector3(-5, 0, 0), 'under b');
  s.add(m);
  updateWorldMatrices(s);
  same(worldPos(m), new THREE.Vector3(0, 0, 0), 'under the scene');
});
