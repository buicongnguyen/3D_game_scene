// Validates every GLB in public/models against tests/asset-contracts.mjs.
// ASSETS=a,b limits the run to named models; FAMILY=animals limits to one generator family.
// Without a filter every contract model must exist (the release gate).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CONTRACTS, PORTRAITS, TOTAL_RAW_BYTES } from './asset-contracts.mjs';

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

for (const name of names) {
  const c = CONTRACTS[name];
  test(`${name} meets its contract`, async () => {
    const file = new URL(`${name}.glb`, MODELS);
    assert.ok(existsSync(file), `${name}.glb missing`);
    const gltf = await load(name);
    const root = gltf.scene;
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
