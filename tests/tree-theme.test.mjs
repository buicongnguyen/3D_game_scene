import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { treeForTheme, bushForTheme, TROPICAL_TREES, TROPICAL_BUSHES } from '../src/world/tree-theme.js';
import { Foliage } from '../src/world/foliage.js';
import { scatter } from '../src/world/scatter.js';
import { HeightGrid } from '../src/world/heightfield.js';
import { Splat } from '../src/world/terrain.js';
import { river } from '../src/world/layout.js';
import { planCritters } from '../src/actors/critters.js';

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
  const heights = { 'tree-broadleaf-a': 8, 'tree-broadleaf-b': 8.5, 'tree-cedar': 12,
    'tree-pine': 7, 'tree-maple': 5.5, 'tree-sakura': 6, 'tree-peach': 3.8, 'tree-chestnut': 7 };
  for (const density of [0.6, 0.85, 1]) {
    const grid = new HeightGrid(density < 0.85 ? 3 : 2), splat = new Splat(grid);
    const placed = scatter((x, z) => grid.heightAt(x, z),
      (x, z) => splat.sample(x, z, 0) < 0.12 && splat.sample(x, z, 3) > 0.1 && grid.slopeAt(x, z) < 36, density);
    const { trees, bushes } = placed;
    const before = structuredClone(trees);
    trees.forEach(Object.freeze);
    const themed = trees.map(r => treeForTheme(r, true));
    const changed = themed.filter((r, i) => r !== trees[i]);
    assert.ok(changed.length > trees.length * 0.9, 'the whole valley should visibly change, including its distant hills');
    assert.ok(changed.filter(r => !r.far).length > trees.filter(r => !r.far).length * 0.7, 'nearby scenery changes too');
    assert.ok(bushes.filter(r => bushForTheme(r, true) !== r).length > bushes.length * 0.7, 'most bushes become tropical');
    const critters = planCritters(placed, grid);
    const perchPositions = new Set([...critters.ladybug, ...critters.butterfly].flatMap(s => s.perches)
      .filter(p => !p.flower).map(p => `${p.x},${p.z}`));
    const eligible = bushes.filter(r => bushForTheme(r, true) !== r);
    const tropicalBushes = eligible.filter(r => !perchPositions.has(`${r.x},${r.z}`));
    assert.ok(tropicalBushes.length > bushes.length * 0.65, 'broad bush coverage survives actual insect landing protection');
    assert.ok(tropicalBushes.length > eligible.length * 0.85, 'most ordinary bushes still change');
    assert.deepEqual(new Set(changed.map(r => r.model)), new Set(TROPICAL_TREES));
    assert.deepEqual(themed, trees.map(r => treeForTheme(r, true)), 'repeatable without random state');
    assert.deepEqual(trees, before);
    for (let i = 0; i < trees.length; i++) {
      const original = trees[i], next = themed[i];
      assert.deepEqual([next.x, next.y, next.z, next.rot], [original.x, original.y, original.z, original.rot]);
      if (next !== original) {
        assert.equal(next.sourceModel, original.model);
        assert.ok(Math.abs(next.s * (next.sy ?? 1) * 8 - original.s * heights[original.model]) < 1e-10);
        assert.ok(next.s <= original.s, 'do not widen trunks beyond original colliders');
      }
      assert.equal(treeForTheme(original, false), original);
    }
    splat.texture.dispose();
  }
});

test('orchards, story trees, wildlife support trees and authored celebration trees remain original', () => {
  for (const patch of [
    { orchard: true }, { story: 'chestnut' }, { model: 'star-tree' },
    { model: 'tree-maple', x: 61, z: -121 }, { model: 'tree-cedar', x: 62, z: -157 },
    ...[[-44, -92], [-30, -106], [-48, -62], [62, -122], [53, -121], [100, -96], [-50, -140], [92, -103]]
      .flatMap(([x, z]) => [{ x, z }, { x, z: z + 22 }, { x: x + 22, z }]),
  ]) {
    const r = record(patch);
    assert.equal(treeForTheme(r, true), r, JSON.stringify(patch));
  }
  const s0 = river.nearest(1.2, -45.6).s, s1 = river.nearest(8, 60).s;
  const grid = new HeightGrid(2);
  const trees = scatter((x, z) => grid.heightAt(x, z), () => true).trees;
  const blossoms = trees.filter(r => {
    const bank = river.nearest(r.x, r.z, 90);
    return r.model === 'tree-sakura' && !r.far && bank && bank.s > Math.min(s0, s1) - 12 && bank.s < Math.max(s0, s1) + 12;
  });
  assert.ok(blossoms.length > 0);
  for (const r of blossoms) assert.equal(treeForTheme(r, true), r, 'petals originate at real sakura');
  for (const model of ['tree-cedar', 'tree-pine', 'tree-maple', 'tree-sakura', 'tree-chestnut']) {
    const r = record({ model, x: -140, z: 160, y: 80, far: true });
    assert.ok(TROPICAL_TREES.includes(treeForTheme(r, true).model), 'ambient hills are no longer excluded');
  }
});

test('ordinary bushes change deterministically while flowers and special bushes stay original', () => {
  const seen = new Set();
  for (let x = 0; x < 20; x++) {
    const r = Object.freeze(record({ x: x * 0.17, model: x % 2 ? 'bush-a' : 'bush-b' }));
    const next = bushForTheme(r, true);
    assert.equal(bushForTheme(r, false), r);
    assert.deepEqual(next, bushForTheme(r, true));
    assert.equal(next.sourceModel, r.model);
    assert.deepEqual([next.x, next.y, next.z, next.rot, next.s], [r.x, r.y, r.z, r.rot, r.s]);
    seen.add(next.model);
  }
  assert.deepEqual(seen, new Set(TROPICAL_BUSHES));
  for (const patch of [{ model: 'hydrangea' }, { model: 'flowers-a' }, { model: 'bush-a', story: true }]) {
    const r = record(patch);
    assert.equal(bushForTheme(r, true), r);
  }
});

function fixture(missing = [], withAtlas = false) {
  const models = new Map();
  let sharedDisposals = 0;
  for (const name of ['tree-broadleaf-a', 'tree-broadleaf-a-lod', 'tree-broadleaf-b', 'tree-cedar', 'tree-peach',
    'bush-a', 'bush-b', 'hydrangea', 'rock-a', ...TROPICAL_TREES, ...TROPICAL_TREES.map(t => `${t}-lod`), ...TROPICAL_BUSHES]) {
    if (missing.includes(name)) continue;
    const height = name === 'bush-a' ? 1.19 : name === 'bush-b' ? 1.09 : name.startsWith('bush-') ? 1.2 : 8;
    const geometry = new THREE.BoxGeometry(2, height, 2).translate(0, height / 2, 0);
    const material = new THREE.MeshStandardMaterial({ color: 0x379232 });
    material.name = name.includes('-vn-') ? 'VN leaves' : 'Leaves';
    if (name.includes('-vn-')) {
      material.map = new THREE.Texture(withAtlas ? { width: 2048, height: 1024 } : undefined);
      material.alphaTest = 0.5; material.side = THREE.DoubleSide;
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
  const placed = { trees, bushes: [record({ model: 'bush-a' }), record({ model: 'bush-b', x: 6, s: 0.8 }),
    record({ model: 'hydrangea' })], rocks: [record({ model: 'rock-a' })], flowers: [], reeds: [], lilies: [] };
  const scene = new THREE.Scene();
  const foliage = new Foliage(scene, assets, placed, { trees: 1, shadowRange: 40 });
  return { foliage, placed, scene, assets, sharedDisposals: () => sharedDisposals };
}

test('theme switches dispose owned instance resources, retain shared assets and preserve hidden interiors', () => {
  const f = fixture();
  const { foliage, placed } = f;
  const before = structuredClone(placed);
  const group = foliage.group, rock = foliage.sets.find(s => s.model === 'rock-a');
  const baseline = group.children.length;
  group.visible = false;
  foliage.setSeason('winter');
  for (let i = 0; i < 8; i++) {
    const changing = [...foliage.treeSets, ...foliage.bushSets];
    const old = changing.flatMap(s => [...s.meshes(), ...s.shadowMeshes()]);
    const proxies = changing.flatMap(s => s.shadowMeshes());
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
    assert.equal(foliage.sets.find(s => s.model === 'rock-a'), rock);
    assert.equal(foliage.lastPos.x, 1e9);
    assert.equal(foliage.shadowFocus.x, 1e9);
    const peach = foliage.treeSets.find(s => s.model === 'tree-peach');
    assert.equal(peach.records[0], placed.trees[2]);
    assert.equal(peach.near[0].userData.inSeason, false);
    if (i % 2) assert.equal(group.children.length, baseline);
    else {
      assert.ok(foliage.treeSets.some(s => s.model.startsWith('tree-vn-')));
      assert.ok(foliage.bushSets.some(s => s.model.startsWith('bush-vn-')));
      for (const set of [...foliage.treeSets, ...foliage.bushSets].filter(s => s.model.includes('-vn-'))) {
        assert.equal(set.near[0].userData.inSeason, true, 'tropical leaves retain their authored colour');
        assert.equal(set.near[0].material.color.getHex(), 0x379232);
        assert.equal(set.shadow[0].material.map, (set.far ?? set.near)[0].material.map);
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

test('missing imports fall back to their donors and unchanged settings avoid needless rebuilds', () => {
  const { foliage, placed } = fixture([...TROPICAL_TREES, ...TROPICAL_BUSHES]);
  foliage.setTheme(true);
  assert.ok(foliage.treeSets.every(s => !s.model.startsWith('tree-vn-')));
  assert.equal(foliage.treeSets.find(s => s.model === 'tree-broadleaf-a').records[0], placed.trees[0]);
  assert.equal(foliage.bushSets.find(s => s.model === 'bush-a').records[0], placed.bushes[0]);
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

test('tropical bushes keep the exact original asset top used by critter perches', () => {
  const { foliage, placed, assets } = fixture();
  foliage.setTheme(true);
  for (const original of placed.bushes) {
    const set = foliage.bushSets.find(s => s.records.some(r => r.x === original.x && (r.sourceModel ?? r.model) === original.model));
    const next = set.records.find(r => r.x === original.x && (r.sourceModel ?? r.model) === original.model);
    const oldTop = new THREE.Box3().setFromObject(assets.gltf(original.model).scene).max.y * original.s + original.y;
    assert.ok(Math.abs(next.y + set.height * next.s * (next.sy ?? 1) - oldTop) < 1e-6);
  }
  foliage.dispose();
});

test('insect landing bushes stay solid when planning occurs before or after switching themes', () => {
  const { foliage, placed } = fixture();
  foliage.setTheme(true);
  const [bush, neighbour] = placed.bushes;
  foliage.protectBushPerches([{ x: bush.x, z: bush.z, flower: false }]);
  const kept = () => foliage.bushSets.flatMap(s => s.records);
  assert.ok(kept().includes(bush));
  assert.ok(!kept().includes(neighbour), 'other ordinary bushes still change');
  foliage.setTheme(false);
  foliage.protectBushPerches([{ x: neighbour.x, z: neighbour.z, flower: false }]);
  foliage.setTheme(true);
  assert.ok(kept().includes(bush) && kept().includes(neighbour), 'every reachable perch is retained');
  const sets = foliage.bushSets;
  foliage.protectBushPerches([{ x: bush.x, z: bush.z, flower: false }]);
  assert.equal(foliage.bushSets, sets, 'repeat planning does not rebuild unchanged sets');
  foliage.dispose();
});

test('imported near trees, distant trees and shrubs share one atlas without merging their materials', () => {
  const { foliage, assets } = fixture([], true);
  const names = [...TROPICAL_TREES, ...TROPICAL_TREES.map(t => `${t}-lod`), ...TROPICAL_BUSHES];
  const materials = names.map(name => assets.parts(name)[0].material);
  assert.equal(new Set(materials.map(m => m.map)).size, 1, 'only one GPU atlas upload');
  assert.equal(new Set(materials).size, names.length, 'per-species material factors remain independent');
  const shared = materials[0].map;
  let disposed = 0;
  shared.addEventListener('dispose', () => disposed++);
  foliage.setTheme(true); foliage.setTheme(false); foliage.dispose();
  assert.equal(disposed, 0, 'switching and unloading foliage keep the shared atlas reusable');
});

test('stretched tropical cedars use full height for camera and shadow culling, and use distant LODs', () => {
  const { foliage, placed } = fixture();
  placed.trees.push(record({ model: 'tree-cedar', x: 200, y: 0, z: 200, s: 2, far: true }));
  foliage.setTheme(true);
  const set = foliage.treeSets.find(s => s.records.some(r => r.sourceModel === 'tree-cedar'));
  const at = set.records.findIndex(r => r.sourceModel === 'tree-cedar');
  const bounds = [];
  set.update(new THREE.Vector3(200, 0, 210), { intersectsSphere: sphere => { bounds.push(sphere.clone()); return true; } }, 55, 1400);
  assert.equal(bounds[at].center.y, 12, '24 m tall tree is centered halfway up');
  assert.ok(bounds[at].radius >= set.radius * 3, 'culling includes vertical stretch');
  const pos = new THREE.Vector3(0, 0, 0);
  set.update(pos, { intersectsSphere: () => true }, 55, 1400);
  assert.ok(set.far?.[0].count > 0, 'thousands of distant trees use cheap meshes');
  // Looking straight along z makes light-space y equal world y. This focus reaches
  // the tall crown, but would miss a shadow proxy centered/capped at the old height.
  set.updateShadow(new THREE.Vector3(200, 31, 200), 0, new THREE.Vector3(0, 0, 1));
  assert.ok(set.shadow[0].count > 0);
  foliage.dispose();
});
