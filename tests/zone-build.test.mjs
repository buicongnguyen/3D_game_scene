import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { pruneOutside, pruneScene, placeholdersInside } from '../src/world/zone-build.js';
import { CellGrid } from '../src/world/cells.js';

const zone = { x: 0, z: 0, r: 20 };
function wrapper(parent, name) {
  const g = new THREE.Group(); g.name = name; g.userData.cellGroup = true; parent.add(g); return g;
}
function model(parent, name, x) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  o.name = name; o.position.x = x; parent.add(o); return o;
}

test('zone pruning removes whole far cells and outside leaves in an edge cell', () => {
  const root = new THREE.Group(), nearCell = wrapper(root, 'cell:0,0'), kind = wrapper(nearCell, 'buildings');
  const nearGate = wrapper(kind, 'near gate'), farGate = wrapper(kind, 'far gate');
  const near = model(nearGate, 'near', 0), far = model(farGate, 'outside edge', 31);
  const farCell = wrapper(root, 'cell:2,0'), farKind = wrapper(farCell, 'props');
  model(wrapper(farKind, 'far gate'), 'far', 130);
  far.userData.placeholder = 'outside-placeholder';
  assert.equal(pruneOutside(root, zone, 0), 2);
  assert.equal(root.getObjectByName(near.name), near);
  assert.equal(root.getObjectByName(far.name), undefined, 'edge cell cannot retain a missing-model placeholder');
  assert.equal(farCell.parent, null, 'whole far cell leaves at once');
  assert.equal(farGate.parent, null, 'empty wrapper branches leave with their model');
  assert.deepEqual(placeholdersInside(root, zone), []);
});

test('ordinary model hierarchies stay atomic and empty cell wrappers are removed', () => {
  const root = new THREE.Group(), cell = wrapper(root, 'cell:0,0'), kind = wrapper(cell, 'buildings');
  const house = new THREE.Group(); house.name = 'one house'; kind.add(house);
  model(house, 'inside wing', 0); const wing = model(house, 'outside wing', 31);
  const empty = wrapper(root, 'cell:9,9'); wrapper(empty, 'props');
  pruneOutside(root, zone, 0);
  assert.equal(root.getObjectByName(house.name), house);
  assert.equal(wing.parent, house, 'only grid wrappers are expanded, never pieces of a model');
  assert.equal(empty.parent, null);
});

test('zoneKeep survives wrapper pruning and legacy unwrapped instanced batches stay protected', () => {
  const root = new THREE.Group(), cell = wrapper(root, 'cell:2,0'), kind = wrapper(cell, 'props');
  const kept = model(wrapper(kind, 'kept gate'), 'kept', 130); kept.userData.zoneKeep = true;
  model(wrapper(kind, 'outside gate'), 'outside peer', 132);
  const instanced = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 1);
  instanced.position.x = 200; root.add(instanced);
  const farCell = wrapper(root, 'cell:3,0'), batched = instanced.clone();
  wrapper(farCell, 'props').add(batched);
  pruneOutside(root, zone, 0);
  assert.equal(root.getObjectByName(kept.name), kept);
  assert.equal(root.getObjectByName('outside peer'), undefined);
  assert.equal(instanced.parent, root);
  assert.equal(farCell.parent, null, 'an entirely outside grid batch can leave with its bounded cell');
});

test('whole-scene pruning reaches cells but keeps movable and unrelated scene roots', () => {
  const scene = new THREE.Scene(), root = new THREE.Group(); root.name = 'structures'; scene.add(root);
  const cell = wrapper(root, 'cell:0,0'), props = wrapper(cell, 'props');
  model(wrapper(props, 'near gate'), 'near', 0); model(wrapper(props, 'far gate'), 'far', 31);
  const actor = model(scene, 'npc:offscreen', 200), light = new THREE.PointLight(); scene.add(light);
  pruneScene(scene, zone, 0);
  assert(root.getObjectByName('near')); assert.equal(root.getObjectByName('far'), undefined);
  assert.equal(actor.parent, scene); assert.equal(light.parent, scene);
});

test('a real grid cannot restore pruned edge gates or overwrite gameplay visibility', () => {
  const root = new THREE.Group(), grid = new CellGrid(root);
  const near = model(root, 'near', 0), edge = model(root, 'outside edge', 31), far = model(root, 'far', 130);
  for (const obj of [near, edge, far]) grid.add(obj, obj.position.x, 0, 'building');
  const q = { buildDist: 300, propDist: 80 };
  grid.update({ x: 0, z: 0 }, null, q); // Prime the bounds cache before the zone trims this grid.
  pruneOutside(root, zone, 0);
  near.visible = false; // e.g. a gameplay owner hides an exterior while using its room.
  grid.update({ x: 0, z: 0 }, null, q);
  assert(root.getObjectByName('near') === near);
  assert(!root.getObjectByName('outside edge') && !root.getObjectByName('far'));
  assert.equal(near.visible, false, 'the surviving distance gate must not rewrite its model visibility');
});
