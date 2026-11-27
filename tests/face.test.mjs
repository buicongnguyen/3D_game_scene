// The small face rig (src/actors/face.js): blinks on its own, moves the lips while a line is shown, stops when quiet or off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Face } from '../src/actors/face.js';

function model() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  const head = new THREE.Bone(); head.name = 'head';
  const skel = new THREE.Skeleton([head]);
  const mesh = new THREE.SkinnedMesh(g, new THREE.MeshBasicMaterial());
  mesh.add(head); mesh.bind(skel);
  mesh.morphTargetDictionary = { blink: 0, mouthA: 1, mouthO: 2 };
  mesh.morphTargetInfluences = [0, 0, 0];
  const root = new THREE.Group(); root.add(mesh);
  return { root, mesh };
}

test('a model without the morphs has no face', () => {
  assert.equal(Face.attach(new THREE.Group()), null);
});

test('blinks within six seconds, lips move only while a line is shown, and switching off rests the face', () => {
  const { root, mesh } = model();
  const f = Face.attach(root);
  assert.ok(f);
  let blinked = 0, mouth = 0;
  for (let i = 0; i < 400; i++) { f.update(1 / 60); blinked = Math.max(blinked, mesh.morphTargetInfluences[0]); mouth = Math.max(mouth, mesh.morphTargetInfluences[1]); }
  assert.ok(blinked > 0.5, 'a blink');
  assert.equal(mouth, 0, 'no lips without a line');
  f.speak('Oh! Hello. I am Kotone.');
  let open = 0;
  for (let i = 0; i < 60; i++) { f.update(1 / 60); open = Math.max(open, mesh.morphTargetInfluences[1]); }
  assert.ok(open > 0.3 && open <= 0.8, `lips move (${open.toFixed(2)})`);
  f.quiet();
  for (let i = 0; i < 30; i++) f.update(1 / 60);
  assert.ok(mesh.morphTargetInfluences[1] < 0.02, 'quiet closes the mouth');
  f.speak('More words'); f.update(1 / 60);
  f.setEnabled(false);
  assert.deepEqual(mesh.morphTargetInfluences, [0, 0, 0], 'off: everything at rest');
});
