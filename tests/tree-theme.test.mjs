import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { treeForTheme, TROPICAL_TREES } from '../src/world/tree-theme.js';
import { Foliage } from '../src/world/foliage.js';
import { scatter } from '../src/world/scatter.js';
import { HeightGrid } from '../src/world/heightfield.js';

const record = (overrides = {}) => ({ model: 'tree-broadleaf-a', x: 4, y: 2, z: 10, s: 1, rot: 30, ...overrides });

test('the tropical preference is off by default, persists, and notifies only actual changes', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const data = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value),
  } });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage; });
  const pref = await import('../src/world/tree-theme.js?preferences');
  assert.equal(pref.getTropicalTrees(), false);
  const seen = [], off = pref.onTreeThemeChange(on => seen.push(on));
  pref.setTropicalTrees(true); pref.setTropicalTrees(true);
  assert.deepEqual(seen, [true]);
  assert.equal(data.get('starline-opt-tropicalTrees'), 'true');
  data.set('starline-lang', 'vi');
  const reloaded = await import('../src/world/tree-theme.js?preferences-reloaded');
  assert.equal(reloaded.getTropicalTrees(), true, 'persisted independently of language');
  pref.setTropicalTrees(false);
  assert.equal(data.get('starline-opt-tropicalTrees'), 'false');
  assert.deepEqual(seen, [true, false]);
  off(); pref.setTropicalTrees(true);
  assert.deepEqual(seen, [true, false], 'unsubscribe releases the listener');
});

test('blocked browser storage still allows changing trees for the current session', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage; });
  const pref = await import('../src/world/tree-theme.js?blocked-storage');
  assert.equal(pref.getTropicalTrees(), false);
  pref.setTropicalTrees(true); assert.equal(pref.getTropicalTrees(), true);
  pref.setTropicalTrees(false); assert.equal(pref.getTropicalTrees(), false);
});

test('Tropical tree changes preserve placement and every original gameplay record', () => {
  const grid = new HeightGrid(2);
  for (const density of [0.6, 0.85, 1]) {
    const trees = scatter((x, z) => grid.heightAt(x, z), () => true, density).trees;
    const before = structuredClone(trees);
    trees.forEach(Object.freeze);
    const themed = trees.map(r => treeForTheme(r, true));
    const changed = themed.filter((r, i) => r !== trees[i]);
    assert.ok(changed.length > 5 && changed.length < trees.length / 10, 'a selective lowland variant');
    assert.deepEqual(new Set(changed.map(r => r.model)), new Set(TROPICAL_TREES));
    assert.deepEqual(themed, trees.map(r => treeForTheme(r, true)), 'repeatable without random state');
    assert.deepEqual(trees, before);
    for (let i = 0; i < trees.length; i++) {
      const original = trees[i], next = themed[i];
      assert.deepEqual([next.x, next.y, next.z, next.rot], [original.x, original.y, original.z, original.rot]);
      if (next !== original) {
        assert.equal(next.sourceModel, original.model);
        assert.equal(next.s * 8, original.s * (original.model === 'tree-broadleaf-b' ? 8.5 : 8));
      }
      assert.equal(treeForTheme(original, false), original);
    }
  }
});

test('orchards, story trees, named species, mountain trees and wildlife groves remain original', () => {
  for (const patch of [
    { orchard: true }, { story: 'chestnut' }, { far: true }, { y: 80 }, { z: -36 }, { z: 126 },
    ...['tree-peach', 'tree-chestnut', 'tree-sakura', 'tree-maple', 'tree-cedar', 'tree-pine', 'star-tree'].map(model => ({ model })),
    ...[[-44, -92], [-30, -106], [-48, -62], [62, -122], [53, -121], [100, -96], [-50, -140], [92, -103]]
      .flatMap(([x, z]) => [{ x, z }, { x, z: z + 22 }, { x: x + 22, z }]),
  ]) {
    const r = record(patch);
    assert.equal(treeForTheme(r, true), r, JSON.stringify(patch));
  }
});

function fixture(missing = []) {
  const models = new Map();
  let sharedDisposals = 0;
  for (const name of ['tree-broadleaf-a', 'tree-broadleaf-a-lod', 'tree-broadleaf-b', 'tree-peach', 'bush-a', ...TROPICAL_TREES]) {
    if (missing.includes(name)) continue;
    const geometry = new THREE.BoxGeometry(2, 8, 2).translate(0, 4, 0);
    const material = new THREE.MeshStandardMaterial({ color: 0x379232 });
    material.name = name.startsWith('tree-vn-') ? 'VN leaves' : 'Leaves';
    if (name.startsWith('tree-vn-')) {
      material.map = new THREE.Texture(); material.alphaTest = 0.5; material.side = THREE.DoubleSide;
    }
    geometry.addEventListener('dispose', () => sharedDisposals++);
    material.addEventListener('dispose', () => sharedDisposals++);
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(geometry, material));
    models.set(name, { scene, parts: [{ geometry, material, matrix: new THREE.Matrix4() }] });
  }
  const assets = {
    has: name => models.has(name),
    parts: name => models.get(name).parts,
    gltf: name => models.get(name),
  };
  const trees = [record(), record({ x: 6, model: 'tree-broadleaf-b' }), record({ model: 'tree-peach', orchard: true })];
  const placed = { trees, bushes: [record({ model: 'bush-a' })], rocks: [], flowers: [], reeds: [], lilies: [] };
  const scene = new THREE.Scene();
  const foliage = new Foliage(scene, assets, placed, { trees: 1, shadowRange: 40 });
  return { foliage, placed, scene, assets, sharedDisposals: () => sharedDisposals };
}

test('theme switches dispose owned instance resources, retain shared assets and preserve hidden interiors', () => {
  const f = fixture();
  const { foliage, placed } = f;
  const before = structuredClone(placed);
  const group = foliage.group, bush = foliage.sets.find(s => s.model === 'bush-a');
  const baseline = group.children.length;
  group.visible = false;
  foliage.setSeason('winter');
  for (let i = 0; i < 8; i++) {
    const old = foliage.treeSets.flatMap(s => [...s.meshes(), ...s.shadowMeshes()]);
    const proxies = foliage.treeSets.flatMap(s => s.shadowMeshes());
    let disposedMeshes = 0, disposedMaterials = 0;
    old.forEach(m => m.addEventListener('dispose', () => disposedMeshes++));
    proxies.forEach(m => m.material.addEventListener('dispose', () => disposedMaterials++));
    foliage.lastPos.set(0, 0, 0); foliage.shadowFocus.set(0, 0, 0);
    foliage.setTheme(!(i % 2));
    assert.equal(disposedMeshes, old.length);
    assert.equal(disposedMaterials, proxies.length);
    assert.ok(old.every(m => m.parent === null));
    assert.equal(foliage.group, group);
    assert.equal(group.visible, false);
    assert.equal(foliage.sets.find(s => s.model === 'bush-a'), bush);
    assert.equal(foliage.lastPos.x, 1e9);
    assert.equal(foliage.shadowFocus.x, 1e9);
    const peach = foliage.treeSets.find(s => s.model === 'tree-peach');
    assert.equal(peach.records[0], placed.trees[2]);
    assert.equal(peach.near[0].userData.inSeason, false);
    if (i % 2) assert.equal(group.children.length, baseline);
    else {
      assert.ok(foliage.treeSets.some(s => s.model.startsWith('tree-vn-')));
      for (const set of foliage.treeSets.filter(s => s.model.startsWith('tree-vn-'))) {
        assert.equal(set.near[0].userData.inSeason, true, 'tropical leaves retain their authored colour');
        assert.equal(set.near[0].material.color.getHex(), 0x379232);
        assert.equal(set.shadow[0].material.map, set.near[0].material.map);
        assert.equal(set.shadow[0].material.alphaTest, 0.5);
        assert.equal(set.shadow[0].material.side, THREE.DoubleSide);
      }
    }
    assert.deepEqual(placed, before);
    assert.equal(f.sharedDisposals(), 0);
  }
  foliage.dispose();
  assert.equal(group.children.length, 0);
  assert.equal(group.parent, null);
  assert.equal(f.sharedDisposals(), 0);
});

test('missing imported trees fall back to their donors and unchanged settings avoid needless rebuilds', () => {
  const { foliage, placed } = fixture(TROPICAL_TREES);
  foliage.setTheme(true);
  assert.ok(foliage.treeSets.every(s => !s.model.startsWith('tree-vn-')));
  assert.equal(foliage.treeSets.find(s => s.model === 'tree-broadleaf-a').records[0], placed.trees[0]);
  foliage.setTheme(false);
  const sets = foliage.treeSets;
  foliage.setTheme(false);
  assert.equal(foliage.treeSets, sets);
  foliage.dispose();
});

test('new tree buffers populate with a stationary camera after a theme change', () => {
  const { foliage } = fixture();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1000);
  camera.position.set(4, 8, 35); camera.lookAt(4, 5, 10);
  const focus = new THREE.Vector3(4, 2, 10);
  foliage.updateShadows(focus); foliage.update(camera);
  assert.ok(foliage.treeSets.some(s => s.near[0].count > 0));
  foliage.setTheme(true);
  assert.ok(foliage.treeSets.every(s => s.near[0].count === 0));
  foliage.updateShadows(focus); foliage.update(camera);
  for (const set of foliage.treeSets) {
    assert.ok(set.near[0].count > 0);
    assert.ok(set.shadow[0].count > 0);
  }
  foliage.dispose();
});
