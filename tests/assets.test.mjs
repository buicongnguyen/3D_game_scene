// Validates every GLB in public/models against tests/asset-contracts.mjs.
// ASSETS=a,b limits the run to named models; FAMILY=animals limits to one generator family.
// Without a filter every contract model must exist (the release gate).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CONTRACTS, PORTRAITS, TOTAL_RAW_BYTES, SHAPE_KEYS } from './asset-contracts.mjs';
import { checkImportedModel } from './model-import-check.mjs';

const MODELS = new URL('../public/models/', import.meta.url);
const only = process.env.ASSETS?.split(',').map(s => s.trim()).filter(Boolean);
const family = process.env.FAMILY;
const names = Object.keys(CONTRACTS).filter(n => (!only || only.includes(n)) && (!family || CONTRACTS[n].family === family));
const partial = Boolean(only || family);

async function load(name) {
  const buf = readFileSync(new URL(`${name}.glb`, MODELS));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Promise((res, rej) => new GLTFLoader().parse(ab, '', res, rej));
}

function triangles(root) {
  let tris = 0;
  root.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry;
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return tris;
}

// The top-level node of each wardrobe part (Top_*, Bottom_*, Shoes_*, Hat_*) and the body, by name.
const PART = /^(Body|Top_|Bottom_|Shoes_|Hat_)/;
function partNodes(root) {
  const out = {};
  root.traverse(o => { if (!o.isBone && PART.test(o.name) && !PART.test(o.parent?.name || '')) out[o.name] = o; });
  return out;
}

// A performer of the dance game: a body and wardrobe parts on one skeleton, finger bones, shape keys, rotation clips.
function checkPerformer(name, c, gltf) {
  const root = gltf.scene, parts = partNodes(root);
  assert.ok(parts.Body, 'a Body mesh');
  for (const p of c.parts) assert.ok(parts[p], `wardrobe part ${p}`);
  for (const p of Object.keys(parts)) assert.ok(p === 'Body' || c.parts.includes(p), `part ${p} is in the contract`);
  const total = Object.values(parts).reduce((a, o) => a + triangles(o), 0);
  const look = ['Body', ...c.look].reduce((a, p) => a + triangles(parts[p]), 0);
  assert.ok(look <= c.tris, `default look ${look} tris exceeds ${c.tris}`);
  assert.ok(total <= c.total, `${total} tris in the file exceeds ${c.total}`);
  for (const n of c.nodes) assert.ok(root.getObjectByName(n), `missing node ${n}`);
  const mats = new Set();
  let draws = 0;
  root.traverse(o => {
    if (!o.isMesh) return;
    assert.ok(o.isSkinnedMesh, `${o.name} is skinned`);
    assert.ok(o.geometry.attributes.color, `${o.name} carries baked AO (COLOR_0)`);
    mats.add(o.material.name);
  });
  for (const p of ['Body', ...c.look]) parts[p].traverse(o => { if (o.isMesh) draws++; });
  assert.ok(mats.size <= 16, `${mats.size} materials`);
  assert.ok(draws <= 14, `the default look takes ${draws} draws`);
  for (const m of ['Skin', 'Hair', 'Eye white', 'Iris', 'Dark']) assert.ok(mats.has(m), `material ${m}`);
  // every garment that covers the body carries the body-shape keys (so clothes follow), with the documented names
  const keys = new Set();
  root.traverse(o => { if (o.morphTargetDictionary) for (const k of Object.keys(o.morphTargetDictionary)) keys.add(k); });
  for (const k of keys) assert.ok(SHAPE_KEYS.includes(k), `unknown shape key ${k}`);
  for (const k of SHAPE_KEYS) assert.ok(keys.has(k), `shape key ${k}`);
  for (const p of c.parts.filter(p => /^(Top|Bottom)_/.test(p))) {
    let has = false;
    parts[p].traverse(o => { if (o.morphTargetDictionary?.shape_build !== undefined) has = true; });
    assert.ok(has, `${p} follows shape_build`);
  }
  const clips = gltf.animations.map(a => a.name);
  for (const clip of c.clips) assert.ok(clips.includes(clip), `missing clip ${clip}`);
  for (const a of gltf.animations) {
    for (const t of a.tracks) {
      const [node, prop] = t.name.split('.');
      assert.ok(prop === 'quaternion' || (prop === 'position' && node === 'hips'), `${a.name} keys ${t.name}: only rotations and the hips' position`);
    }
  }
  const box = new THREE.Box3().setFromObject(root);
  assert.ok(box.min.y > -0.05, `stands on the origin (min y ${box.min.y.toFixed(3)})`);
}

// Clips for an existing person: no mesh, the person's own bones (rest pose to the bit) and the dance clips.
async function checkClipFile(name, c, gltf) {
  const std = await load(c.clipsOf);
  let meshes = 0;
  gltf.scene.traverse(o => { if (o.isMesh) meshes++; });
  assert.equal(meshes, 0, 'no mesh');
  const bones = new Map();
  std.scene.traverse(o => { if (o.isBone) bones.set(o.name, o); });
  let n = 0;
  gltf.scene.traverse(o => {
    const b = bones.get(o.name);
    if (!b) return;
    n++;
    for (const k of ['position', 'quaternion', 'scale']) {
      const x = o[k].toArray(), y = b[k].toArray();
      assert.ok(x.every((v, i) => Math.abs(v - y[i]) < 1e-6), `${o.name} rest ${k}`);
    }
  });
  assert.equal(n, bones.size, `all ${bones.size} bones of ${c.clipsOf}`);
  const clips = gltf.animations.map(a => a.name);
  for (const clip of c.clips) assert.ok(clips.includes(clip), `missing clip ${clip}`);
  for (const a of gltf.animations) for (const t of a.tracks) assert.ok(bones.has(t.name.split('.')[0]), `${a.name} drives a bone ${c.clipsOf} has`);
}

// A light person against the standard model it was made from: same skeleton, clips and nodes; one mesh, one draw.
async function checkLite(name, c, gltf) {
  const std = await load(c.lite), want = CONTRACTS[c.lite];
  // a performer's light file is its default look: compare it with that look's meshes only
  if (want.family === 'performers') {
    const parts = partNodes(std.scene);
    for (const [p, o] of Object.entries(parts)) if (p !== 'Body' && !want.look.includes(p)) o.removeFromParent();
  }
  const meshes = [];
  gltf.scene.traverse(o => { if (o.isMesh) meshes.push(o); });
  assert.equal(meshes.length, 1, 'one mesh (one draw call)');
  const mesh = meshes[0], g = mesh.geometry, lib = mesh.userData.people;
  assert.ok(mesh.isSkinnedMesh && !Array.isArray(mesh.material), 'one skinned primitive, one material');
  const tris = triangles(gltf.scene), stdTris = triangles(std.scene);
  assert.ok(tris <= c.tris, `${tris} tris exceeds budget ${c.tris}`);
  assert.ok(tris < stdTris * 0.72, `${tris} tris is not much lighter than the standard ${stdTris}`);
  for (const a of ['position', 'normal', 'color', 'skinIndex', 'skinWeight', '_part']) assert.ok(g.attributes[a], `attribute ${a}`);
  // the palette: every material of the standard model, by name, colour and roughness
  const stdMats = new Map();
  std.scene.traverse(o => { if (o.isMesh) stdMats.set(o.material.name, o.material); });
  assert.deepEqual(lib.parts.map(p => p.name), [...stdMats.keys()], 'the palette lists the standard materials in order');
  for (const p of lib.parts) {
    const m = stdMats.get(p.name);
    assert.ok(Math.abs(m.roughness - p.roughness) < 1e-3 && Math.abs(m.metalness - p.metalness) < 1e-3, `${p.name} roughness/metalness`);
    for (const [i, k] of ['r', 'g', 'b'].entries()) assert.ok(Math.abs(m.color[k] - p.color[i]) < 1e-4, `${p.name} colour`);
  }
  for (const part of c.parts ?? []) assert.ok(lib.parts.some(p => p.name === part), `missing tintable part "${part}"`);
  const used = new Set(g.attributes._part.array);
  for (const i of used) assert.ok(i < lib.parts.length, 'part numbers are inside the palette');
  // the skeleton: same bones, parents, rest pose and bind
  const bones = r => { const out = []; r.traverse(o => { if (o.isBone) out.push(o); }); return out; };
  const a = bones(gltf.scene), b = bones(std.scene);
  assert.deepEqual(a.map(o => `${o.name}<${o.parent?.name}`), b.map(o => `${o.name}<${o.parent?.name}`), 'same bones');
  for (const [i, o] of a.entries()) for (const k of ['position', 'quaternion', 'scale']) assert.deepEqual(o[k].toArray(), b[i][k].toArray(), `${o.name} rest ${k}`);
  for (const n of want.nodes ?? []) assert.ok(gltf.scene.getObjectByName(n), `missing node ${n}`);
  let stdMesh = null;
  std.scene.traverse(o => { if (o.isSkinnedMesh && !stdMesh) stdMesh = o; });
  assert.deepEqual(mesh.skeleton.bones.map(o => o.name), stdMesh.skeleton.bones.map(o => o.name), 'same joints, same order');
  assert.deepEqual(mesh.skeleton.boneInverses.map(m => m.elements), stdMesh.skeleton.boneInverses.map(m => m.elements), 'same bind matrices');
  // the clips: same names, lengths and keys
  assert.deepEqual(gltf.animations.map(x => x.name), std.animations.map(x => x.name), 'same clips');
  for (const [i, clip] of gltf.animations.entries()) {
    const s = std.animations[i];
    assert.equal(clip.duration, s.duration, `${clip.name} length`);
    assert.deepEqual(clip.tracks.map(t => [t.name, t.times.length]), s.tracks.map(t => [t.name, t.times.length]), `${clip.name} tracks`);
    for (const [k, t] of clip.tracks.entries()) assert.deepEqual(t.values, s.tracks[k].values, `${clip.name} ${t.name} keys`);
  }
  // weights: at most four bones a vertex, adding up to one; the model stands where the standard one stands
  const w = g.attributes.skinWeight;
  for (let i = 0; i < w.count; i++) assert.ok(Math.abs(w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i) - 1) < 2e-3, 'weights add up to one');
  const box = new THREE.Box3().setFromObject(gltf.scene), sbox = new THREE.Box3().setFromObject(std.scene);
  for (const e of ['min', 'max']) for (const k of ['x', 'y', 'z']) assert.ok(Math.abs(box[e][k] - sbox[e][k]) < 0.012, `same size (${e}.${k}: ${box[e][k].toFixed(3)} vs ${sbox[e][k].toFixed(3)})`);
}

for (const name of names) {
  const c = CONTRACTS[name];
  test(`${name} meets its contract`, async () => {
    const file = new URL(`${name}.glb`, MODELS);
    assert.ok(existsSync(file), `${name}.glb missing`);
    if (c.family === 'vietnam-import') {
      const imported = await checkImportedModel(readFileSync(file), c);
      if (c.lodOf) {
        const source = await checkImportedModel(readFileSync(new URL(`${c.lodOf}.glb`, MODELS)), CONTRACTS[c.lodOf]);
        assert.ok(imported.tris < source.tris, `${name} reduces its near-model triangle count`);
        assert.deepEqual(imported.materials, source.materials, `${name} preserves materials and leaf alpha settings`);
        assert.deepEqual(imported.imageHashes, source.imageHashes, `${name} preserves the authored atlas`);
        for (const edge of ['min', 'max']) for (let i = 0; i < 3; i++) {
          assert.ok(Math.abs(imported.bounds[edge][i] - source.bounds[edge][i]) < .002, `${name} preserves the near silhouette envelope`);
        }
      }
      return;
    }
    const gltf = await load(name);
    const root = gltf.scene;
    if (c.lite) { await checkLite(name, c, gltf); return; }
    if (c.family === 'performers') { checkPerformer(name, c, gltf); return; }
    if (c.clipsOf) { await checkClipFile(name, c, gltf); return; }
    const tris = triangles(root);
    assert.ok(tris > 0, 'has geometry');
    assert.ok(tris <= c.tris, `${tris} tris exceeds budget ${c.tris}`);
    for (const n of c.nodes ?? []) assert.ok(root.getObjectByName(n), `missing node ${n}`);
    const mats = new Set();
    let vertexColors = 0, meshes = 0;
    root.traverse(o => {
      if (!o.isMesh) return;
      meshes++;
      if (o.geometry.attributes.color) vertexColors++;
      for (const m of [o.material].flat()) mats.add(m.name);
    });
    for (const m of c.mats ?? []) assert.ok(mats.has(m), `missing material "${m}" (has ${[...mats].join(', ')})`);
    assert.ok(mats.size <= (c.family === 'characters' ? 10 : 8), `${mats.size} materials exceeds limit`);
    assert.equal(vertexColors, meshes, 'every mesh carries baked AO (COLOR_0)');
    const clips = gltf.animations.map(a => a.name);
    for (const clip of c.clips ?? []) {
      assert.ok(clips.includes(clip), `missing clip ${clip} (has ${clips.join(', ')})`);
      const a = gltf.animations.find(x => x.name === clip);
      assert.ok(a.duration > 0 && a.tracks.length > 0, `clip ${clip} is empty`);
    }
    if (c.clips) {
      let skinned = false;
      root.traverse(o => { if (o.isSkinnedMesh) skinned = true; });
      assert.ok(skinned, 'rigged model has a skinned mesh');
      const box = new THREE.Box3().setFromObject(root);
      assert.ok(box.min.y > -0.3 || c.family !== 'characters' || name === 'tamo', `stands on the origin (min y ${box.min.y.toFixed(2)})`);
    }
  });
}

if (!partial) {
  test('model library stays within the raw download budget', () => {
    let total = 0;
    for (const f of readdirSync(MODELS)) if (f.endsWith('.glb')) total += statSync(new URL(f, MODELS)).size;
    assert.ok(total <= TOTAL_RAW_BYTES, `${total} bytes > ${TOTAL_RAW_BYTES}`);
  });
  test('dialogue portraits and item icons exist', () => {
    for (const p of PORTRAITS) assert.ok(existsSync(new URL(`../public/portraits/${p}.webp`, import.meta.url)), `portrait ${p}`);
    for (const [n, c] of Object.entries(CONTRACTS)) if (c.icon) assert.ok(existsSync(new URL(`../public/icons/${n}.webp`, import.meta.url)), `icon ${n}`);
  });
}
