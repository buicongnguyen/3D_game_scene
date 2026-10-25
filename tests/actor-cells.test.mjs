import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { actorBounds, registerActor } from '../src/world/actor-cells.js';
import { updateCellGrids } from '../src/world/cells.js';
import { NPC } from '../src/actors/npc.js';
import { Wildlife } from '../src/actors/animals.js';
import { updateWorldMatrices } from '../src/engine/matrices.js';
import { pruneScene } from '../src/world/zone-build.js';
import { disposeRigs } from '../src/game/tricks/util.js';

function fixture() {
  const scene = new THREE.Scene(), world = { scene, heightAt: () => 0, quality: {} };
  const assets = { has: () => true, missing: new Set(), clone() {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial()));
    root.userData.clips = [new THREE.AnimationClip('Idle', 1, [new THREE.NumberKeyframeTrack('.rotation[y]', [0, 1], [0, .1])])];
    return root;
  } };
  const camera = new THREE.PerspectiveCamera(60, 1, .1, 2000);
  camera.position.set(0, 2, 0); camera.lookAt(0, 2, -1);
  const npc = (id, x = 0, z = -40) => new NPC(scene, assets, world, id, 'villager-man', { x, z });
  const update = () => updateCellGrids(scene, camera, {});
  return { scene, world, assets, camera, npc, update, get grid() { return scene.userData.actorCellGrid; } };
}

test('actor drawing gates hide offscreen bones without changing visibility, movement or animation callbacks', () => {
  const f = fixture(), n = f.npc('walking', 100, 40); n.shadow = false;
  assert(n.root.parent === f.scene, 'registration waits until rendering');
  f.update(); const entry = f.grid.entries.get(n.root);
  assert.equal(entry.gate.visible, false); assert.equal(n.root.visible, true); assert.equal(n.visible, true);
  let arrived = false; n.walk([[101, 40]], () => { arrived = true; }, 1.5);
  const time = n.anim.mixer.time; n.update(1); n.update(1);
  f.update();
  assert.equal(n.pos.x, 101); assert.equal(arrived, true); assert(n.anim.mixer.time > time);
  assert.equal(entry.gate.visible, false); assert.equal(n.root.visible, true);
  n.setHidden(true); f.update(); assert.equal(n.root.visible, false);
  n.setHidden(false); f.update(); assert.equal(n.root.visible, true);
});

test('turning the camera reveals an actor before matrix traversal, including changed children', () => {
  const f = fixture(), n = f.npc('behind', 0, 40); n.shadow = false;
  f.update(); updateWorldMatrices(f.scene); const entry = f.grid.entries.get(n.root);
  assert.equal(entry.gate.visible, false);
  n.root.position.x = 3; n.model.position.y = .3;
  f.camera.lookAt(3, 2, 40); f.update(); updateWorldMatrices(f.scene);
  assert.equal(entry.gate.visible, true);
  assert.equal(n.root.matrixWorld.elements[12], 3); assert.equal(n.model.matrixWorld.elements[13], .3);
});

test('external actor-grid visibility remains owned by the caller through camera reveal and restoration', () => {
  const f = fixture(), n = f.npc('externally hidden', 0, 40); n.shadow = false;
  f.update(); const entry = f.grid.entries.get(n.root);
  f.grid.group.visible = false;
  n.root.position.x = 3; n.model.position.y = .3; f.camera.lookAt(3, 2, 40);
  f.update(); updateWorldMatrices(f.scene);
  assert.equal(entry.gate.visible, true); assert.equal(entry.cell.group.visible, true);
  assert.equal(f.grid.group.visible, false, 'the culling prepass must not reveal an externally hidden root');
  f.grid.group.visible = true; f.update(); updateWorldMatrices(f.scene);
  assert.equal(f.grid.group.visible, true, 'external restoration stays in force');
  assert.equal(n.root.matrixWorld.elements[12], 3); assert.equal(n.model.matrixWorld.elements[13], .3);
});

test('offscreen shadow casters stay drawn while non-casters may be pruned', () => {
  const f = fixture(), n = f.npc('shadow', 40, 0), sun = new THREE.DirectionalLight();
  sun.castShadow = true; sun.position.set(40, 50, 10); sun.target.position.set(40, 0, 0);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, bottom: -12, top: 12, near: .1, far: 200 });
  sun.shadow.camera.updateProjectionMatrix(); f.scene.add(sun, sun.target); f.world.sky = { sun };
  f.update(); const entry = f.grid.entries.get(n.root);
  assert.equal(f.grid.visibility.frustum.intersectsBox(actorBounds(n)), false, 'actor is offscreen');
  assert.equal(entry.gate.visible, true, 'its shadow can still enter the rendered map');
  n.shadow = false; f.update(); assert.equal(entry.gate.visible, false);
});

test('walking and teleporting across centred cell edges retain root/gate transforms and remove empty cells', () => {
  const f = fixture(), n = f.npc('crossing', 31, -40); n.root.scale.set(2, .7, 1); n.root.rotation.y = .8;
  f.update(); const entry = f.grid.entries.get(n.root), gate = entry.gate;
  assert.equal(entry.cell.key, '0,-1');
  for (const [x, key] of [[33, '1,-1'], [-33, '-1,-1'], [200, '3,-1']]) {
    n.place(x, -40, .8); f.update();
    assert.equal(entry.cell.key, key); assert(entry.gate === gate); assert.equal(f.grid.cells.size, 1);
    assert.deepEqual(n.root.getWorldPosition(new THREE.Vector3()).toArray(), [x, 0, -40]);
    assert.deepEqual(n.root.scale.toArray(), [2, .7, 1]); assert.equal(n.root.rotation.y, .8);
  }
});

test('resident, train and foreign-parent actors bypass gates and rejoin when their own root returns to the scene', () => {
  const f = fixture(), resident = f.npc('resident'), rider = f.npc('rider');
  resident.resident = 'cottage'; resident.place(0, -40, 0, 600); f.update();
  assert(resident.root.parent === f.scene);
  const entry = f.grid.entries.get(rider.root), seat = new THREE.Group(); f.scene.add(seat);
  seat.add(rider.root); rider.root.position.set(0, 0, 0); rider.riding = true; f.update();
  assert(rider.root.parent === seat); assert.equal(entry.cell, null);
  assert.equal(f.grid.entries.has(rider.root), false, 'the train owns the actor without a second strong registry');
  f.scene.add(rider.root); rider.riding = false; rider.place(70, -40); f.update();
  const returned = f.grid.entries.get(rider.root);
  assert(rider.root.parent === returned.gate); assert.equal(returned.cell.key, '1,-1');
  const room = new THREE.Group(); f.scene.add(room); room.add(rider.root); f.update();
  assert(rider.root.parent === room, 'a foreign parent is never stolen, even without a flag');
});

test('repeated foreign-owner round cleanup cannot retain disposed subtrees in the actor registry', () => {
  const f = fixture(); f.npc('permanent'); f.update();
  const count = f.grid.entries.size, cells = f.grid.cells.size;
  for (let round = 0; round < 30; round++) {
    const owner = new THREE.Group(), n = f.npc(`round:${round}`); f.scene.add(owner); owner.add(n.root);
    f.update(); owner.removeFromParent(); disposeRigs(n.root); f.update();
    assert(n.root.parent === owner, 'the disposed owner was never stolen or reattached');
    assert.equal(f.grid.entries.size, count); assert.equal(f.grid.cells.size, cells);
  }
});

test('temporarily detached foreign parents may reattach and their actors can later return to grid ownership', () => {
  const f = fixture(), n = f.npc('temporary owner'), owner = new THREE.Group(); f.scene.add(owner); owner.add(n.root);
  f.update(); owner.removeFromParent(); f.update();
  assert(n.root.parent === owner); assert.equal(f.grid.entries.has(n.root), false);
  f.scene.add(owner); f.update();
  assert(n.root.parent === owner, 'reattaching the same foreign subtree needs no registration or stealing');
  f.scene.add(n.root); f.update();
  assert(n.root.parent === f.grid.entries.get(n.root).gate, 'direct scene return automatically re-enrols the actor');
});

test('pool-local NPCs and plain cloned hens never enter the world actor registry', () => {
  const f = fixture(); f.npc('permanent'); f.update(); const count = f.grid.entries.size;
  for (let round = 0; round < 10; round++) {
    const owner = new THREE.Group(); f.scene.add(owner);
    const localWorld = { heightAt: () => 0, quality: {} };
    const coach = new NPC(owner, f.assets, localWorld, 'swim-coach', 'rin', { x: 0, z: 0 });
    const adult = new NPC(owner, f.assets, localWorld, 'swim-watcher', 'villager-woman', { x: 1, z: 0 });
    const hen = f.assets.clone('chicken'); owner.add(hen);
    f.update(); owner.removeFromParent(); disposeRigs(coach.root); disposeRigs(adult.root); disposeRigs(hen); f.update();
    assert.equal(f.grid.entries.size, count);
  }
});

test('ridden cows leave grid ownership without hiding their mounted player or altering visibility', () => {
  const f = fixture(), cow = f.npc('cow'), seat = new THREE.Group(), player = new THREE.Group();
  cow.root.add(seat); seat.add(player); f.update();
  const entry = f.grid.entries.get(cow.root); cow.ridden = true; f.update();
  assert(cow.root.parent === f.scene); assert(player.parent === seat); assert.equal(player.visible, true);
  assert.equal(cow.root.visible, true); assert.equal(entry.cell, null);
  cow.ridden = false; f.update(); assert(cow.root.parent === entry.gate);
});

test('bounds include root/model scale and offsets; hydration preserves a registered actor root', () => {
  const f = fixture(), n = f.npc('late'); n.root.scale.set(2, .5, 1); n.model.scale.set(1, 3, 1); n.model.position.set(2, 1, 0);
  const b = actorBounds(n); assert(b.min.x <= n.root.position.x - 30); assert(b.max.y >= n.root.position.y + 60);
  f.update(); const entry = f.grid.entries.get(n.root), gate = entry.gate, old = n.model;
  n.pending = { assets: f.assets, model: 'villager-man', tint: null }; n.hydrate(); f.update();
  assert(n.model !== old); assert(n.model.parent === n.root); assert(entry.gate === gate);
  assert.equal(f.grid.entries.size, 1);
});

test('wildlife and temporary performer removal releases gates/cells and cannot resurrect detached bodies', () => {
  const f = fixture(), animal = f.npc('crab'), performer = f.npc('temporary'); f.update();
  const wildlife = { scene: f.scene, actors: [animal] };
  Wildlife.prototype.remove.call(wildlife, animal); performer.root.removeFromParent(); f.update();
  assert.equal(wildlife.actors.length, 0); assert.equal(f.grid.entries.size, 0); assert.equal(f.grid.cells.size, 0);
  assert(animal.root.parent === null && performer.root.parent === null); assert.equal(f.grid.group.children.length, 0);
});

test('gone actors leave owned gates without being restored to the scene or stealing an external parent', () => {
  const f = fixture(), owned = f.npc('gone'), foreign = f.npc('external'); f.update();
  const seat = new THREE.Group(); f.scene.add(seat); seat.add(foreign.root);
  owned.gone = true; foreign.gone = true; f.update();
  assert(owned.root.parent === null, 'gone owned actor is never reattached to the scene');
  assert(foreign.root.parent === seat, 'disposal remains with the external owner');
  assert.equal(f.grid.entries.size, 0); assert.equal(f.grid.cells.size, 0);
});

test('play-zone pruning preserves actor cells and cells=off leaves the exact old hierarchy', () => {
  const f = fixture(), n = f.npc('zone'); f.update();
  pruneScene(f.scene, { x: 1000, z: 1000, r: 20 }, 0);
  assert(f.grid.group.parent === f.scene); assert(n.root.parent === f.grid.entries.get(n.root).gate);
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'location');
  try {
    Object.defineProperty(globalThis, 'location', { configurable: true, value: { search: '?cells=off' } });
    const off = fixture(), untouched = off.npc('off');
    assert(untouched.root.parent === off.scene); assert.equal(off.grid, undefined);
    assert.equal(off.scene.userData.cellGrids, undefined); assert.equal(registerActor(untouched, off.scene, off.world), null);
  } finally { if (previous) Object.defineProperty(globalThis, 'location', previous); else delete globalThis.location; }
});
