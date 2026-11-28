// Validates every GLB in public/models against tests/asset-contracts.mjs.
// ASSETS=a,b limits the run to named models; FAMILY=animals limits to one generator family.
// Without a filter every contract model must exist (the release gate).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CONTRACTS, PORTRAITS, TOTAL_RAW_BYTES, SHAPE_KEYS } from './asset-contracts.mjs';
import { checkImportedModel } from './model-import-check.mjs';
import { faceMask } from '../src/actors/face-look.js';

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

// The visitor (art/blender/vroid_lite.py): read with glTF-Transform, since her atlas is a WebP image (no decoder in Node).
// One skinned mesh, one primitive, one MASK material with its atlas at the contract's size; the face morphs, eye bones and
// clips; standing on the ground. A light file has exactly its standard file's skeleton (names, order) and clips.
async function readVroid(name) {
  const { NodeIO } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const { ImageUtils } = await import('@gltf-transform/core');
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(fileURLToPath(new URL(`${name}.glb`, MODELS)));
  const r = doc.getRoot();
  const prims = r.listMeshes().flatMap(m => m.listPrimitives());
  const tris = prims.reduce((a, p) => a + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0);
  const mat = prims[0]?.getMaterial(), tex = mat?.getBaseColorTexture();
  return {
    meshes: r.listMeshes().length, prims: prims.length, tris, mat, size: tex && ImageUtils.getSize(tex.getImage(), tex.getMimeType()),
    morphs: r.listMeshes()[0]?.getExtras()?.targetNames || [], skinned: r.listNodes().some(n => n.getMesh() && n.getSkin()),
    joints: r.listSkins()[0]?.listJoints().map(j => j.getName()) || [], nodes: new Set(r.listNodes().map(n => n.getName())),
    clips: r.listAnimations().map(a => a.getName()), minY: prims[0]?.getAttribute('POSITION').getMin([])[1],
    atlas: prims[0] && atlasShape(prims[0], r.listSkins()[0]?.listJoints().map(j => j.getName()) || []),
  };
}
// How the atlas holds the face (2026-11-28, faces at a distance): the texel shape on the front of the face (the face's own
// triangles, as actors/face-look.js finds them; median of the UV map's stretch across / along, area-weighted: 1 = square
// texels) and whether every UV stays inside the picture. The boys' first build packed their face skin 16 : 1 (Blender's
// packer corrected for the brow sheet's 4 : 1 aspect and turned the island: art/blender/vroid_lite.py build_atlas).
function atlasShape(prim, joints) {
  const P = prim.getAttribute('POSITION').getArray(), U = prim.getAttribute('TEXCOORD_0').getArray(), I = prim.getIndices().getArray();
  const J = prim.getAttribute('JOINTS_0').getArray(), Wt = prim.getAttribute('WEIGHTS_0').getArray(), n = P.length / 3;
  const own = new Set(['head', 'eye_L', 'eye_R'].map(x => joints.indexOf(x))), eyes = ['eye_L', 'eye_R'].map(x => joints.indexOf(x));
  const moves = prim.listTargets().map(t => t.getAttribute('POSITION')?.getArray()).filter(Boolean);
  const mask = faceMask(n, I, i => moves.some(M => M[i * 3] ** 2 + M[i * 3 + 1] ** 2 + M[i * 3 + 2] ** 2 > 1e-10) || (eyes.includes(J[i * 4]) && Wt[i * 4] > 0.5),
    i => { let w = 0; for (let k = 0; k < 4; k++) if (own.has(J[i * 4 + k])) w += Wt[i * 4 + k]; return w; });
  const rows = [];
  for (let t = 0; t < I.length; t += 3) {
    const [a, b, c] = [I[t], I[t + 1], I[t + 2]];
    if (!mask[a] || !mask[b] || !mask[c]) continue;
    const e1 = [0, 1, 2].map(k => P[b * 3 + k] - P[a * 3 + k]), e2 = [0, 1, 2].map(k => P[c * 3 + k] - P[a * 3 + k]);
    const nv = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], area = Math.hypot(...nv) / 2;
    if (area < 1e-9 || Math.abs(nv[2]) / (2 * area) < 0.5) continue;
    // the stretch: UV edges against the edges in the triangle's own plane (singular values of the 2 x 2 map)
    const l1 = Math.hypot(...e1), tx = e1.map(v => v / l1), nn = nv.map(v => v / (2 * area)), ty = [nn[1] * tx[2] - nn[2] * tx[1], nn[2] * tx[0] - nn[0] * tx[2], nn[0] * tx[1] - nn[1] * tx[0]];
    const x2 = e2[0] * tx[0] + e2[1] * tx[1] + e2[2] * tx[2], y2 = e2[0] * ty[0] + e2[1] * ty[1] + e2[2] * ty[2];
    const du1 = U[b * 2] - U[a * 2], dv1 = U[b * 2 + 1] - U[a * 2 + 1], du2 = U[c * 2] - U[a * 2], dv2 = U[c * 2 + 1] - U[a * 2 + 1];
    // M = D * inverse([[l1, x2], [0, y2]])
    const m00 = du1 / l1, m10 = dv1 / l1, m01 = (du2 - m00 * x2) / y2, m11 = (dv2 - m10 * x2) / y2;
    const f = m00 * m00 + m01 * m01 + m10 * m10 + m11 * m11, d = Math.abs(m00 * m11 - m01 * m10), q = Math.sqrt(Math.max(0, f * f - 4 * d * d));
    const s1 = Math.sqrt((f + q) / 2), s2 = Math.sqrt(Math.max(1e-30, (f - q) / 2));
    rows.push([s1 / s2, area]);
  }
  rows.sort((x, y) => x[0] - y[0]);
  const total = rows.reduce((s, r) => s + r[1], 0); let acc = 0, p50 = 1;
  for (const [an, w] of rows) { acc += w; if (acc >= total / 2) { p50 = an; break; } }
  let lo = Infinity, hi = -Infinity; for (const v of U) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  return { p50, lo, hi };
}
async function checkVroid(name, c) {
  const v = await readVroid(name);
  assert.equal(v.meshes, 1, 'one mesh'); assert.equal(v.prims, 1, 'one primitive (one draw call)');
  assert.ok(v.skinned, 'skinned');
  assert.ok(v.tris <= c.tris, `${v.tris} tris exceeds budget ${c.tris}`);
  assert.equal(v.mat.getAlphaMode(), 'MASK', 'alpha MASK (no sorting, one pass)');
  assert.deepEqual(v.size, [c.atlas, c.atlas], 'the atlas size');
  for (const m of c.morphs) assert.ok(v.morphs.includes(m), `morph ${m}`);
  for (const n of c.nodes) assert.ok(v.nodes.has(n), `missing node ${n}`);
  for (const clip of c.clips) assert.ok(v.clips.includes(clip), `missing clip ${clip}`);
  assert.ok(Math.abs(v.minY) < 0.05, `stands on the ground (min y ${v.minY.toFixed(3)})`);
  assert.ok(v.atlas.p50 < 1.6, `the head's texels are square enough in the atlas (stretch ${v.atlas.p50.toFixed(2)} : 1)`);
  assert.ok(v.atlas.lo > -0.002 && v.atlas.hi < 1.002, `every UV inside the atlas (${v.atlas.lo.toFixed(3)}..${v.atlas.hi.toFixed(3)})`);
  if (c.vroidOf) {
    const s = await readVroid(c.vroidOf);
    assert.deepEqual(v.joints, s.joints, 'same skeleton as the standard file');
    assert.deepEqual(v.clips, s.clips, 'same clips as the standard file');
    assert.ok(v.tris < s.tris * 0.72, 'much lighter than the standard file');
  }
}

// The visitor's clip pack (vroid_mixamo.py): her armature with no mesh, the same joints in the same order with the same
// parents and rest pose as her model, every clip, keys only on her bones.
async function checkVroidClips(name, c) {
  const { NodeIO } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const read = async n => (await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(fileURLToPath(new URL(`${n}.glb`, MODELS)))).getRoot();
  const pack = await read(name), person = await read(c.of);
  assert.equal(pack.listMeshes().length, 0, 'a clip pack carries no mesh');
  const parentOf = r => { const m = new Map(); for (const n of r.listNodes()) for (const k of n.listChildren()) m.set(k, n.getName()); return m; };
  const pp = parentOf(pack), hp = parentOf(person);
  const mine = new Map(pack.listNodes().map(n => [n.getName(), n]));
  const joints = person.listSkins()[0].listJoints();
  for (const j of joints) {
    const o = mine.get(j.getName());
    assert.ok(o, `the pack lacks bone ${j.getName()}`);
    assert.equal(pp.get(o), hp.get(j), `${j.getName()}: same parent`);
    for (const k of ['getTranslation', 'getRotation', 'getScale']) assert.deepEqual(o[k](), j[k](), `${j.getName()}: same rest (${k})`);
  }
  const names = new Set(joints.map(j => j.getName()));
  const clips = pack.listAnimations().map(a => a.getName());
  for (const clip of c.clips) assert.ok(clips.includes(clip), `missing clip ${clip}`);
  for (const a of pack.listAnimations()) for (const ch of a.listChannels()) {
    assert.ok(names.has(ch.getTargetNode().getName()), `${a.getName()} moves ${ch.getTargetNode().getName()}, which ${c.of} does not have`);
    assert.ok(['rotation', 'translation'].includes(ch.getTargetPath()), `${a.getName()}: rotations and the hips only`);
  }
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

// A clip pack (the morning exercise's moves) against the person it moves: no mesh, every clip, the person's bones with
// the same parents and rest pose, rotations for those bones only (a clip that named a bone the person lacks would not play).
async function checkClips(name, c, gltf) {
  let meshes = 0;
  gltf.scene.traverse(o => { if (o.isMesh) meshes++; });
  assert.equal(meshes, 0, 'a clip pack carries no mesh');
  const clips = gltf.animations.map(a => a.name);
  for (const clip of c.clips) assert.ok(clips.includes(clip), `missing clip ${clip}`);
  const person = await load(c.of);
  const bones = r => { const m = new Map(); r.traverse(o => { if (o.isBone) m.set(o.name, o); }); return m; };
  const nodes = r => { const m = new Map(); r.traverse(o => m.set(o.name, o)); return m; };
  const mine = nodes(gltf.scene), theirs = bones(person.scene);
  for (const [n, b] of theirs) {
    const o = mine.get(n);
    assert.ok(o, `the pack lacks bone ${n}`);
    assert.equal(o.parent?.name, b.parent?.name, `${n}: same parent`);
    for (const k of ['position', 'quaternion', 'scale']) assert.deepEqual(o[k].toArray(), b[k].toArray(), `${n}: same rest ${k}`);
  }
  for (const a of gltf.animations) for (const t of a.tracks) {
    const bone = t.name.slice(0, t.name.lastIndexOf('.'));
    assert.ok(theirs.has(bone), `${a.name} moves ${bone}, which ${c.of} does not have`);
    assert.ok(a.duration > 0 && t.times.length >= 2, `${a.name} ${t.name} is keyed`);
  }
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
    if (c.family === 'vroid') { await checkVroid(name, c); return; }
    if (c.family === 'vroid-clips') { await checkVroidClips(name, c); return; }
    const gltf = await load(name);
    const root = gltf.scene;
    if (c.lite) { await checkLite(name, c, gltf); return; }
    if (c.family === 'performers') { checkPerformer(name, c, gltf); return; }
    if (c.clipsOf) { await checkClipFile(name, c, gltf); return; }
    if (c.family === 'clips') { await checkClips(name, c, gltf); return; }
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
