// Technical audit of exported GLBs (geometry, skin, clips, materials). Re-runnable evidence, not a test gate.
//
//   node art/blender/validate_glb.mjs [--dir public/models] [--json out.json] name...
//   (no names: the rural-tricks phase 2 set)
//
// Per model it prints ERR (a real defect), WARN (look at it) and info lines:
//   nodes      unapplied scale / rotation on mesh nodes, node origins, the scene's top-level nodes
//   attributes UVs / tangents exported for nothing, COLOR_0 type, the albedo it gives per material in three.js
//   materials  duplicates (.001), identical twins, unused ones, doubleSided, alpha, emissive
//   geometry   (all positions welded at 1 micron, across materials) zero-area and duplicate triangles, edges
//              shared by more than two faces, faces flipped against their neighbour, closed shells that face
//              inward, openings in single-sided parts that can be looked into (buried ones are fine), large
//              single-sided sheets (vanish from behind), and overlapping near-coplanar faces of different
//              colour (z-fighting) with the gap between them
//   skin       weights that do not sum to 1, unweighted vertices, joints that move no vertex
//   clips      first key vs last key per track (loop seam), scale tracks, tracks on unknown nodes, and for
//              Walk: how far each planted foot slides sideways and whether all feet agree on the ground speed
// Exit code 1 when any ERR is found.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : null; };
const DIR = path.resolve(ROOT, opt('--dir') || 'public/models');
const JSON_OUT = opt('--json');
const NAMES = argv.length ? argv : ['beetle-rhino', 'beetle-stag', 'moth', 'kite-paper', 'sweet-potato', 'straw-pile', 'spider-web'];
// Large single-sided sheets that are fine because their back can never be seen (reason shown in the report).
const SHEETS_OK = {
  'beetle-rhino': 'wing cases lie on the belly', 'beetle-stag': 'wing cases lie on the belly',
  'straw-pile': 'the mound and the ember bed sit on the ground',
};

const srgb = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const hex = rgb => '#' + rgb.map(c => Math.round(255 * Math.min(1, Math.max(0, srgb(c)))).toString(16).padStart(2, '0')).join('');
const at = p => p.toArray().map(x => +x.toFixed(4)).join(' ');
const LEG = /^(?:leg|shin|foot)(\d_[LR])$/;

async function load(file) {
  const buf = readFileSync(file);
  const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const gltf = await new Promise((res, rej) => new GLTFLoader().parse(ab, '', res, rej));
  return { json, gltf, bytes: buf.length };
}

/** Do two 2D triangles overlap? (separating axes; shrunk a little so shared edges and corners do not count) */
function tri2dOverlap(A, B) {
  const shrink = T => { const cx = (T[0][0] + T[1][0] + T[2][0]) / 3, cy = (T[0][1] + T[1][1] + T[2][1]) / 3; return T.map(p => [cx + (p[0] - cx) * 0.96, cy + (p[1] - cy) * 0.96]); };
  A = shrink(A); B = shrink(B);
  for (const T of [A, B]) for (let i = 0; i < 3; i++) {
    const a = T[i], b = T[(i + 1) % 3], nx = -(b[1] - a[1]), ny = b[0] - a[0];
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const p of A) { const d = p[0] * nx + p[1] * ny; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
    for (const p of B) { const d = p[0] * nx + p[1] * ny; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
    if (a1 <= b0 || b1 <= a0) return false;
  }
  return true;
}

function audit(name, { json, gltf, bytes }) {
  const out = { name, bytes, err: [], warn: [], info: [] };
  const E = s => out.err.push(s), W = s => out.warn.push(s), I = s => out.info.push(s);
  const joints = new Set((json.skins || []).flatMap(s => s.joints));

  // ---- nodes
  (json.nodes || []).forEach((n, i) => {
    if (joints.has(i)) return;
    if (n.scale && n.scale.some(v => Math.abs(v - 1) > 1e-5)) E(`node ${n.name}: unapplied scale ${n.scale.map(v => +v.toFixed(4))}`);
    if (n.rotation && Math.abs(Math.abs(n.rotation[3]) - 1) > 1e-5) (n.mesh !== undefined ? E : W)(`node ${n.name}: unapplied rotation ${n.rotation.map(v => +v.toFixed(4))}`);
    if (n.translation && n.skin === undefined && n.translation.some(v => Math.abs(v) > 1e-6)) I(`node ${n.name}: origin at ${n.translation.map(v => +v.toFixed(4))}`);
  });
  const tree = (i, d = 0) => { const n = json.nodes[i]; return joints.has(i) ? '' : `${n.name}${n.mesh !== undefined ? '' : '(empty)'}` + ((n.children || []).filter(c => !joints.has(c)).length ? ` > [${n.children.filter(c => !joints.has(c)).map(c => tree(c, d + 1)).join(', ')}]` : ''); };
  I(`scene: ${(json.scenes[0].nodes || []).map(i => tree(i)).join(', ')}`);

  // ---- materials and attributes
  const mats = json.materials || [];
  const sig = m => JSON.stringify({ ...m, name: undefined });
  mats.forEach((m, i) => {
    if (/\.\d{3}$/.test(m.name)) E(`material ${m.name}: duplicate suffix`);
    mats.forEach((o, j) => { if (j > i && sig(o) === sig(m)) W(`materials ${m.name} and ${o.name} are identical: merge them`); });
  });
  const used = new Set();
  for (const m of json.meshes || []) for (const p of m.primitives) {
    for (const a of Object.keys(p.attributes)) if (/^TEXCOORD|^TANGENT/.test(a)) W(`mesh ${m.name}: ${a} exported (no texture uses it)`);
    if (p.attributes.COLOR_0 === undefined) E(`mesh ${m.name}: no COLOR_0`);
    used.add(p.material);
  }
  mats.forEach((m, i) => { if (!used.has(i)) W(`material ${m.name} is not used by any primitive`); });

  // ---- geometry in scene space (bind pose for skinned meshes), welded across every primitive
  gltf.scene.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const key = new Map(), P = [];
  const F = [];                // { v: [i0, i1, i2], mat, double, col: [r, g, b] }
  let tris = 0, draws = 0, degenerate = 0, dup = 0;
  const v = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const seen = new Set();
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    draws++;
    const g = o.geometry, pos = g.attributes.position, idx = g.index, mat = o.material, col = g.attributes.color;
    const count = idx ? idx.count : pos.count;
    tris += count / 3;
    const vid = new Int32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      box.expandByPoint(v);
      const k = `${Math.round(v.x * 1e6)},${Math.round(v.y * 1e6)},${Math.round(v.z * 1e6)}`;
      if (!key.has(k)) { key.set(k, P.length); P.push(v.clone()); }
      vid[i] = key.get(k);
    }
    if (col) {
      const s = [0, 0, 0]; let lo = 1, hi = 0, maxLum = 0; const bc = [mat.color.r, mat.color.g, mat.color.b];
      for (let i = 0; i < col.count; i++) { const r = col.getX(i), gg = col.getY(i), bb = col.getZ(i); s[0] += r; s[1] += gg; s[2] += bb; lo = Math.min(lo, r, gg, bb); hi = Math.max(hi, r, gg, bb); maxLum = Math.max(maxLum, 0.2126 * r * bc[0] + 0.7152 * gg * bc[1] + 0.0722 * bb * bc[2]); }
      const base = [mat.color.r, mat.color.g, mat.color.b], mean = s.map((x, k) => x / col.count * base[k]);
      const peak = Math.max(...base);
      I(`material ${mat.name} on ${o.name}: ${count / 3} tris, ${mat.side === THREE.DoubleSide ? 'double' : 'single'}-sided, rough ${+mat.roughness.toFixed(2)}, metal ${mat.metalness}` +
        `${mat.transparent ? ', alpha ' + mat.opacity : ''}${mat.emissive?.getHex() ? ', emissive #' + mat.emissive.getHexString() + ' x' + mat.emissiveIntensity : ''}; base ${hex(base)}, mean albedo ${hex(mean)} (COLOR_0 ${lo.toFixed(2)}..${hi.toFixed(2)}, ${col.normalized ? 'normalised ' : ''}${col.array.constructor.name}, linear)`);
      const lum = 0.2126 * mean[0] + 0.7152 * mean[1] + 0.0722 * mean[2];
      if (lum < 0.004 && !/eye/i.test(mat.name)) W(`material ${mat.name}: mean albedo ${hex(mean)} is nearly black in three.js`);
      if (maxLum > 0.8 && !mat.emissive?.getHex()) W(`material ${mat.name}: brightest albedo has luminance ${maxLum.toFixed(2)} (linear): in full sun it passes the bloom threshold (0.92) and glows white`);
    }
    for (let t = 0; t < count; t += 3) {
      const vi = [0, 1, 2].map(e => (idx ? idx.getX(t + e) : t + e));
      const [i0, i1, i2] = vi.map(x => vid[x]);
      a.copy(P[i0]); b.copy(P[i1]); c.copy(P[i2]);
      const area = n.subVectors(b, a).cross(v.subVectors(c, a)).length() / 2;
      if (i0 === i1 || i1 === i2 || i0 === i2 || area < 1e-13) { degenerate++; continue; }
      const k = [i0, i1, i2].sort((x, y) => x - y).join(',') + '|' + mat.name;
      if (seen.has(k)) { dup++; continue; }
      seen.add(k);
      const q = [0, 0, 0];
      if (col) for (const x of vi) { q[0] += col.getX(x) / 3; q[1] += col.getY(x) / 3; q[2] += col.getZ(x) / 3; }
      F.push({ v: [i0, i1, i2], mat: mat.name, double: mat.side === THREE.DoubleSide, col: q.map((x, k2) => x * [mat.color.r, mat.color.g, mat.color.b][k2]) });
    }
  });
  if (degenerate) E(`${degenerate} zero-area triangle(s)`);
  if (dup) E(`${dup} duplicate triangle(s) (same three corners, same material)`);
  const size = box.getSize(new THREE.Vector3()), diag = size.length();
  out.tris = tris; out.draws = draws;
  I(`${tris} tris, ${draws} draw call(s), ${bytes} bytes; bounds x ${box.min.x.toFixed(4)}..${box.max.x.toFixed(4)}, y ${box.min.y.toFixed(4)}..${box.max.y.toFixed(4)}, z ${box.min.z.toFixed(4)}..${box.max.z.toFixed(4)}`);

  const edges = new Map();
  F.forEach((f, fi) => { for (let e = 0; e < 3; e++) { const p = f.v[e], q = f.v[(e + 1) % 3], k = p < q ? `${p},${q}` : `${q},${p}`; (edges.get(k) || edges.set(k, []).get(k)).push([fi, p < q ? 1 : -1]); } });
  let nonManifold = 0, flipped = 0; const flipAt = [], nmAt = [];
  const parent = F.map((_, i) => i), find = x => { while (parent[x] !== x) x = parent[x] = parent[parent[x]]; return x; };
  const boundaryFace = new Set();
  for (const [k, fs] of edges) {
    if (fs.length > 2) { nonManifold++; if (nmAt.length < 3) nmAt.push(at(P[+k.split(',')[0]])); }
    if (fs.length === 2 && fs[0][1] === fs[1][1]) { flipped++; if (flipAt.length < 4) flipAt.push(`${F[fs[0][0]].mat} ${at(P[+k.split(',')[0]])}`); }
    if (fs.length === 1) boundaryFace.add(fs[0][0]);
    if (fs.length <= 2) for (let i = 1; i < fs.length; i++) parent[find(fs[i][0])] = find(fs[0][0]);
  }
  if (nonManifold) W(`${nonManifold} edge(s) shared by more than two faces (parts welded through each other), e.g. near ${nmAt.join(' | ')}`);
  if (flipped) E(`${flipped} shared edge(s) with inconsistent winding (a face is flipped against its neighbour), e.g. ${flipAt.join(' | ')}`);
  const groups = new Map();
  F.forEach((f, fi) => { const r = find(fi); (groups.get(r) || groups.set(r, []).get(r)).push(fi); });
  const shells = [];
  for (const [, fis] of groups) {
    const bb = new THREE.Box3(); let open = false;
    for (const fi of fis) { for (const i of F[fi].v) bb.expandByPoint(P[i]); if (boundaryFace.has(fi)) open = true; }
    const ctr = bb.getCenter(new THREE.Vector3()); let vol = 0;
    for (const fi of fis) { const f = F[fi].v; a.copy(P[f[0]]).sub(ctr); b.copy(P[f[1]]).sub(ctr); c.copy(P[f[2]]).sub(ctr); vol += a.dot(b.clone().cross(c)) / 6; }
    const inShell = new Set(fis), loops = [];
    if (open) {
      const adj = new Map();
      for (const [k, fs] of edges) if (fs.length === 1 && inShell.has(fs[0][0])) { const [p, q] = k.split(',').map(Number); (adj.get(p) || adj.set(p, []).get(p)).push(q); (adj.get(q) || adj.set(q, []).get(q)).push(p); }
      const done = new Set();
      for (const p0 of adj.keys()) {
        if (done.has(p0)) continue;
        const lb = new THREE.Box3(), st = [p0];
        while (st.length) { const p = st.pop(); if (done.has(p)) continue; done.add(p); lb.expandByPoint(P[p]); for (const q of adj.get(p)) st.push(q); }
        loops.push({ size: lb.getSize(new THREE.Vector3()).length(), at: lb.getCenter(new THREE.Vector3()) });
      }
    }
    shells.push({ fis, mat: [...new Set(fis.map(fi => F[fi].mat))].join('+'), double: fis.every(fi => F[fi].double), open, vol, loops, box: bb, tris: fis.map(fi => F[fi].v.map(i => P[i])) });
  }
  for (const s of shells) if (!s.open && s.vol < 0) E(`${s.mat}: a closed shell of ${s.fis.length} tris faces inward (flipped normals) near ${at(s.box.getCenter(new THREE.Vector3()))}`);
  // openings of single-sided parts: is the opening buried in other geometry, or can you look into it?
  // Rays leave the middle of the opening in 26 directions; if most of them soon hit another part, it is buried.
  const DIRS = [];
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) if (x || y || z) DIRS.push(new THREE.Vector3(x, y, z).normalize());
  const inside = (p, own) => {
    let hit = 0; const tmp = new THREE.Vector3(), ray = new THREE.Ray(p, DIRS[0]);
    for (const d of DIRS) {
      ray.direction.copy(d);
      let got = false;
      for (const s of shells) {
        if (s === own || got) continue;
        if (s.box.distanceToPoint(p) > diag * 0.1) continue;
        for (const t of s.tris) { const h = ray.intersectTriangle(t[0], t[1], t[2], false, tmp); if (h && h.distanceTo(p) < diag * 0.1) { got = true; break; } }
      }
      if (got) hit++;
    }
    return hit >= 18;
  };
  let holes = 0, buried = 0, big = 0, parts = 0, partTris = 0; const holeAt = [];
  for (const s of shells) if (s.open && !s.double) {
    parts++; partTris += s.fis.length;
    for (const l of s.loops) {
      if (inside(l.at, s)) buried++;
      else if (l.size > diag * 0.2) big++;
      else if (l.size > diag * 0.012) { holes++; if (holeAt.length < 6) holeAt.push(`${(l.size * 1000).toFixed(1)} mm at ${at(l.at)}`); }
    }
  }
  if (parts) I(`${parts} open single-sided part(s), ${partTris} tris: ${buried} opening(s) buried in other parts, ${big} large sheet edge(s), ${holes} exposed small opening(s)`);
  if (holes) W(`${holes} exposed opening(s) in single-sided parts (you can look into the part; its far side is culled): ${holeAt.join(' | ')}`);
  if (big) (SHEETS_OK[name] ? I : W)(`${big} large single-sided sheet edge(s): invisible from behind${SHEETS_OK[name] ? ` (accepted: ${SHEETS_OK[name]})` : ''}`);

  // ---- overlapping near-coplanar faces of different shells
  const LIMIT = Math.max(diag * 0.004, 1e-5);
  const flat = [];
  shells.forEach((s, si) => s.fis.forEach((fi, q) => {
    const t = s.tris[q];
    const nn = new THREE.Vector3().subVectors(t[1], t[0]).cross(new THREE.Vector3().subVectors(t[2], t[0])).normalize();
    flat.push({ si, t, n: nn, d: nn.dot(t[0]), f: F[fi], box: new THREE.Box3().setFromPoints(t) });
  }));
  const fights = new Map();
  for (let i = 0; i < flat.length; i++) for (let j = i + 1; j < flat.length; j++) {
    const A = flat[i], B = flat[j];
    if (A.si === B.si) continue;
    const dot = A.n.dot(B.n);
    if (Math.abs(dot) < 0.9995) continue;
    if (!A.box.clone().expandByScalar(LIMIT).intersectsBox(B.box)) continue;
    const gap = Math.max(...B.t.map(p => Math.abs(A.n.dot(p) - A.d)));
    if (gap > LIMIT) continue;
    const u = new THREE.Vector3().subVectors(A.t[1], A.t[0]).normalize(), w = new THREE.Vector3().crossVectors(A.n, u);
    const pr = T => T.map(p => [p.dot(u), p.dot(w)]);
    if (!tri2dOverlap(pr(A.t), pr(B.t))) continue;
    const same = A.f.mat === B.f.mat && A.f.col.every((x, q) => Math.abs(x - B.f.col[q]) < 0.03);
    const k = [A.f.mat, B.f.mat].sort().join(' / ') + (dot > 0 ? ', same-facing' : ', back-to-back') + (same ? ', same colour' : ', different colours');
    const f = fights.get(k) || fights.set(k, { n: 0, min: Infinity, max: 0 }).get(k);
    f.n++; f.min = Math.min(f.min, gap); f.max = Math.max(f.max, gap);
  }
  for (const [k, f] of fights) {
    const msg = `overlapping near-coplanar faces, ${k}: ${f.n} pair(s), gap ${(f.min * 1000).toFixed(2)}..${(f.max * 1000).toFixed(2)} mm (${(f.min / diag * 100).toFixed(3)}% of the model)`;
    const harmless = / same colour$/.test(k);
    (harmless ? I : f.min < diag * 5e-4 ? E : f.min < diag * 2e-3 ? W : I)(msg + (harmless ? ' (no visible fight: identical shading)' : f.min < diag * 5e-4 ? ': z-fighting' : ''));
  }

  // ---- skin
  const skinnedAll = []; gltf.scene.traverse(o => { if (o.isSkinnedMesh) skinnedAll.push(o); });
  if (skinnedAll.length) {
    const bones = skinnedAll[0].skeleton.bones, usedJ = new Set();
    let bad = 0, zero = 0, maxInf = 0;
    for (const o of skinnedAll) {
      const sw = o.geometry.attributes.skinWeight, si = o.geometry.attributes.skinIndex;
      for (let i = 0; i < sw.count; i++) {
        const ws = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)], js = [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)];
        const sum = ws.reduce((p, q) => p + q, 0);
        if (sum < 1e-4) zero++; else if (Math.abs(sum - 1) > 1e-3) bad++;
        maxInf = Math.max(maxInf, ws.filter(x => x > 1e-4).length);
        ws.forEach((x, k) => { if (x > 1e-4) usedJ.add(o.skeleton.bones[js[k]].name); });
      }
    }
    if (zero) E(`skin: ${zero} vertex(es) with no weights`);
    if (bad) E(`skin: ${bad} vertex(es) whose weights do not sum to 1`);
    const idle = bones.map(bn => bn.name).filter(nm => !usedJ.has(nm) && nm !== 'root');
    I(`skin: ${bones.length} joints (${bones.map(bn => bn.name).join(', ')}), up to ${maxInf} influence(s) per vertex`);
    if (idle.length) W(`skin: joints that move no vertex: ${idle.join(', ')}`);
  }

  // ---- clips
  const nodeNames = new Set(); gltf.scene.traverse(o => nodeNames.add(o.name));
  for (const clip of gltf.animations) {
    let seam = 0, seamTrack = '', scaleTracks = 0, nonUnitScale = 0;
    for (const tr of clip.tracks) {
      const dotAt = tr.name.lastIndexOf('.'), node = tr.name.slice(0, dotAt), prop = tr.name.slice(dotAt + 1);
      if (!nodeNames.has(node)) E(`clip ${clip.name}: track on unknown node ${node}`);
      const sz = tr.getValueSize(), vals = tr.values, last = vals.length - sz;
      let d = 0;
      if (prop === 'quaternion') { let dot = 0; for (let k = 0; k < 4; k++) dot += vals[k] * vals[last + k]; d = 2 * Math.acos(Math.min(1, Math.abs(dot))) * 180 / Math.PI; }
      else for (let k = 0; k < sz; k++) d = Math.max(d, Math.abs(vals[k] - vals[last + k]) * (prop === 'position' ? 1000 : 1));
      if (d > seam) { seam = d; seamTrack = tr.name; }
      if (prop === 'scale') { scaleTracks++; for (const x of vals) if (Math.abs(x - 1) > 1e-4) { nonUnitScale++; break; } }
    }
    (seam > 0.5 ? E : I)(`clip ${clip.name}: ${clip.duration.toFixed(3)} s, ${clip.tracks.length} tracks, loop seam ${seam.toFixed(3)} (deg or mm) on ${seamTrack || '-'}`);
    if (nonUnitScale) W(`clip ${clip.name}: ${nonUnitScale} scale track(s) with keys other than 1`);
    else if (scaleTracks) I(`clip ${clip.name}: ${scaleTracks} scale track(s) that never leave 1 (two keys each: harmless weight from the shared exporter)`);
  }

  // ---- Walk: do planted feet stay planted, and do all feet agree on the ground speed?
  const walk = gltf.animations.find(cl => cl.name === 'Walk');
  if (walk && skinnedAll.length) {
    const feet = new Map();
    for (const o of skinnedAll) {
      const sw = o.geometry.attributes.skinWeight, si = o.geometry.attributes.skinIndex, pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const ws = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)], js = [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)];
        const m = LEG.exec(o.skeleton.bones[js[ws.indexOf(Math.max(...ws))]].name);
        if (!m) continue;
        o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld);
        if (!feet.has(m[1]) || v.y < feet.get(m[1]).y) feet.set(m[1], { o, i, y: v.y });
      }
    }
    if (feet.size) {
      const mixer = new THREE.AnimationMixer(gltf.scene), act = mixer.clipAction(walk); act.play();
      const N = 96, paths = new Map([...feet.keys()].map(k => [k, []]));
      for (let s = 0; s < N; s++) {
        mixer.setTime(walk.duration * s / N);
        gltf.scene.updateMatrixWorld(true);
        for (const o of skinnedAll) o.skeleton.update();
        for (const [k, f] of feet) { f.o.getVertexPosition(f.i, v); v.applyMatrix4(f.o.matrixWorld); paths.get(k).push(v.clone()); }
      }
      act.stop(); mixer.setTime(0);
      const lines = [], speeds = []; let worstSide = 0, worstUneven = 0;
      for (const [k, pts] of [...paths].sort()) {
        const lowest = Math.min(...pts.map(p => p.y)), lift = Math.max(...pts.map(p => p.y)) - lowest;
        const down = pts.map(p => p.y < lowest + Math.max(lift * 0.06, diag * 0.002));
        // the stance is the longest run of planted samples (cyclic)
        let best = [0, 0];
        for (let s = 0; s < N; s++) if (down[s] && !down[(s + N - 1) % N]) { let len = 0; while (len < N && down[(s + len) % N]) len++; if (len > best[1]) best = [s, len]; }
        if (best[1] < 4) { lines.push(`${k}: never planted`); continue; }
        const st = Array.from({ length: best[1] }, (_, q) => pts[(best[0] + q) % N]);
        const side = Math.max(...st.map(p => p.x)) - Math.min(...st.map(p => p.x));
        const travel = st[st.length - 1].z - st[0].z, time = walk.duration * (st.length - 1) / N;
        let off = 0; st.forEach((p, q) => { off = Math.max(off, Math.abs(p.z - (st[0].z + travel * q / (st.length - 1)))); });
        speeds.push(Math.abs(travel) / time);
        worstSide = Math.max(worstSide, side); worstUneven = Math.max(worstUneven, off);
        lines.push(`${k}: planted ${(st.length / N * 100).toFixed(0)}% of the loop, travels ${(travel * 1000).toFixed(2)} mm, slides sideways ${(side * 1000).toFixed(2)} mm, uneven by ${(off * 1000).toFixed(2)} mm, lifts ${(lift * 1000).toFixed(2)} mm`);
      }
      const sp = speeds.length ? [Math.min(...speeds), Math.max(...speeds)] : [0, 0];
      const skate = worstSide / size.z > 0.01 || (sp[1] - sp[0]) / (sp[1] || 1) > 0.1 || speeds.length < feet.size;
      (skate ? E : I)(`Walk feet: sideways slide up to ${(worstSide * 1000).toFixed(2)} mm (${(worstSide / size.z * 100).toFixed(1)}% of body length), ground speed implied by the feet ${(sp[0] * 1000).toFixed(1)}..${(sp[1] * 1000).toFixed(1)} mm/s` + (skate ? ': feet skate (they slide sideways or disagree on the speed)' : ' (move the model at this speed x its scale)'));
      lines.forEach(I);
    }
  }
  return out;
}

let bad = 0;
const all = [];
for (const name of NAMES) {
  const r = audit(name, await load(path.join(DIR, name + '.glb')));
  all.push(r);
  console.log(`\n== ${name}  (${r.tris} tris, ${r.bytes} B)  ${r.err.length} ERR, ${r.warn.length} WARN`);
  for (const s of r.err) console.log('  ERR  ' + s);
  for (const s of r.warn) console.log('  WARN ' + s);
  for (const s of r.info) console.log('  info ' + s);
  bad += r.err.length;
}
if (JSON_OUT) writeFileSync(path.resolve(ROOT, JSON_OUT), JSON.stringify(all, null, 1));
console.log(`\n${bad} error(s) in ${NAMES.length} model(s)`);
process.exit(bad ? 1 : 0);
