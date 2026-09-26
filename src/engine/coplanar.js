import * as THREE from 'three';

/*
 * Load-time z-fighting fix for static models.
 *
 * The Blender kit often lays a detail flush on a larger surface: timber beams in plaster, trims on clapboard,
 * window panes on their backing board, signboards, coach panels. Those faces are exactly coplanar (or a few
 * millimetres apart) but belong to different primitives, so the depth test picks a random winner per pixel
 * and the detail shimmers as soon as the camera moves.
 *
 * For every pair of overlapping, same-facing faces of different materials closer than GAP, the face patch
 * that is on top (the one already in front, or for true ties the one whose area is covered the most, i.e. the
 * detail) is pushed out along its normal until it is SEP in front. Patches are connected coplanar triangles of
 * one primitive, so a beam is compared as a whole against the wall it sits on. Coincident vertices of the
 * detail's side faces move with it (no cracks); neighbours that lie in the base plane stay put.
 */
const GAP = 0.006;       // faces nearer than this (m) and overlapping fight in the depth buffer
const SEP = 0.006;       // separation after the fix (m): clean to ~150 m with a 24-bit depth buffer
const TIE = 0.0005;      // closer than this counts as exactly coplanar (no intended order)
const MIN_OVERLAP = 2e-4; // ignore overlaps below 2 cm^2

const _v = new THREE.Vector3();

/** Triangles of every static mesh under root, in root space. */
function collect(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const prims = [], tris = [];
  root.traverse(o => {
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || Array.isArray(o.material)) return;
    const geo = o.geometry, pos = geo?.attributes.position;
    if (!pos || geo.groups?.length > 1) return;
    const M = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const prim = { mesh: o, geo, M, mat: o.material?.name || '', index: prims.length, world: [] };
    prims.push(prim);
    const n = pos.count;
    const w = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(M);
      w[i * 3] = _v.x; w[i * 3 + 1] = _v.y; w[i * 3 + 2] = _v.z;
    }
    prim.world = w;
    const idx = geo.index;
    const count = idx ? idx.count : n;
    for (let k = 0; k + 2 < count; k += 3) {
      const ia = idx ? idx.getX(k) : k, ib = idx ? idx.getX(k + 1) : k + 1, ic = idx ? idx.getX(k + 2) : k + 2;
      const ax = w[ia * 3], ay = w[ia * 3 + 1], az = w[ia * 3 + 2];
      const ux = w[ib * 3] - ax, uy = w[ib * 3 + 1] - ay, uz = w[ib * 3 + 2] - az;
      const vx = w[ic * 3] - ax, vy = w[ic * 3 + 1] - ay, vz = w[ic * 3 + 2] - az;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz);
      if (l < 1e-9) continue;
      nx /= l; ny /= l; nz /= l;
      const bx = w[ib * 3], by = w[ib * 3 + 1], bz = w[ib * 3 + 2], cx = w[ic * 3], cy = w[ic * 3 + 1], cz = w[ic * 3 + 2];
      tris.push({
        prim: prim.index, v: [ia, ib, ic], n: [nx, ny, nz], d: nx * ax + ny * ay + nz * az, area: l / 2,
        box: [Math.min(ax, bx, cx), Math.min(ay, by, cy), Math.min(az, bz, cz), Math.max(ax, bx, cx), Math.max(ay, by, cy), Math.max(az, bz, cz)],
      });
    }
  });
  return { prims, tris };
}

// ---- 2D convex clipping for the overlap area of two coplanar triangles
function clip(poly, a, b) {
  const out = [];
  const side = p => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const sp = side(p), sq = side(q);
    if (sp >= 0) out.push(p);
    if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
  }
  return out;
}
const signedArea = p => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };

function overlapArea(prims, t1, t2) {
  const [nx, ny, nz] = t1.n;
  // in-plane basis
  let ux, uy, uz;
  if (Math.abs(ny) < 0.9) { ux = -nz; uy = 0; uz = nx; } else { ux = 0; uy = nz; uz = -ny; }
  const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
  const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
  const project = t => t.v.map(i => {
    const w = prims[t.prim].world, x = w[i * 3], y = w[i * 3 + 1], z = w[i * 3 + 2];
    return [x * ux + y * uy + z * uz, x * vx + y * vy + z * vz];
  });
  let a = project(t1), b = project(t2);
  if (signedArea(a) < 0) a.reverse();
  if (signedArea(b) < 0) b.reverse();
  for (let i = 0; i < 3 && a.length; i++) a = clip(a, b[i], b[(i + 1) % 3]);
  return a.length >= 3 ? Math.abs(signedArea(a)) : 0;
}

const RANGE = 0.03;      // pairs up to this far apart keep their order when either side is pushed

/** Overlapping near-coplanar triangle pairs of different materials closer than `range`: [{t1, t2, area}]. */
export function findCoplanar(root, range = GAP) {
  const { prims, tris } = collect(root);
  // numeric plane key: quantised normal (129^3 cells) x slab of thickness 2*range along it
  for (const t of tris) t.nk = ((Math.round(t.n[0] * 64) + 64) * 129 + Math.round(t.n[1] * 64) + 64) * 129 + Math.round(t.n[2] * 64) + 64;
  const planeKey = (t, dd = 0) => t.nk * 1e7 + Math.floor(t.d / (range * 2)) + dd + 5e6;
  const buckets = new Map();
  for (const t of tris) {
    const k = planeKey(t);
    let b = buckets.get(k);
    if (!b) buckets.set(k, b = []);
    b.push(t);
  }
  const pairs = [];
  const test = (t1, t2) => {
    if (t1.prim === t2.prim || prims[t1.prim].mat === prims[t2.prim].mat) return;
    if (t1.n[0] * t2.n[0] + t1.n[1] * t2.n[1] + t1.n[2] * t2.n[2] < 0.9995) return;
    if (Math.abs(t1.d - t2.d) >= range) return;
    const A = t1.box, B = t2.box;
    if (A[0] > B[3] + range || B[0] > A[3] + range || A[1] > B[4] + range || B[1] > A[4] + range || A[2] > B[5] + range || B[2] > A[5] + range) return;
    const area = overlapArea(prims, t1, t2);
    if (area > MIN_OVERLAP * 0.05) pairs.push({ t1, t2, area });
  };
  const byMat = list => {
    const m = new Map();
    for (const t of list) { const k = prims[t.prim].mat; let l = m.get(k); if (!l) m.set(k, l = []); l.push(t); }
    return m;
  };
  const grouped = new Map();
  for (const [k, list] of buckets) grouped.set(k, byMat(list));
  for (const [k, list] of buckets) {
    // only faces of different materials are compared (same-material overlaps cannot be seen)
    const here = grouped.get(k), next = grouped.get(planeKey(list[0], 1));
    const mats = [...here.keys()];
    for (let i = 0; i < mats.length; i++) for (let j = i + 1; j < mats.length; j++) {
      for (const t1 of here.get(mats[i])) for (const t2 of here.get(mats[j])) test(t1, t2);
    }
    if (next) for (const [ma, la] of here) for (const [mb, lb] of next) {
      if (ma === mb) continue;
      for (const t1 of la) for (const t2 of lb) test(t1, t2);
    }
  }
  return { prims, tris, buckets, pairs, planeKey };
}

/**
 * Separate z-fighting faces of a static model in place. Returns the number of face patches moved.
 * Geometry is edited in place (shared by every clone of the model).
 */
export function separateCoplanar(root) {
  const { prims, tris, pairs } = findCoplanar(root, RANGE);
  if (!pairs.some(p => Math.abs(p.t1.d - p.t2.d) < GAP)) return 0;

  // --- patches: connected coplanar triangles of one primitive (union-find over shared vertex positions)
  const involved = new Set();
  for (const p of pairs) { involved.add(p.t1); involved.add(p.t2); }
  const parent = new Map();
  const find = t => { let r = t; while (parent.get(r) !== r) r = parent.get(r); let c = t; while (parent.get(c) !== r) { const nx = parent.get(c); parent.set(c, r); c = nx; } return r; };
  const unite = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  const posKey = (prim, i) => { const w = prims[prim].world; return `${Math.round(w[i * 3] * 1e4)},${Math.round(w[i * 3 + 1] * 1e4)},${Math.round(w[i * 3 + 2] * 1e4)}`; };
  // triangles of the involved primitives, grouped by facing, then split into planes by sorting on d
  const nKey = t => t.prim * 3e6 + t.nk;
  const need = new Set();
  for (const t of involved) need.add(nKey(t));
  const groups = new Map();
  for (const t of tris) {
    const k = nKey(t);
    if (!need.has(k)) continue;
    let l = groups.get(k);
    if (!l) groups.set(k, l = []);
    l.push(t);
  }
  for (const list of groups.values()) {
    list.sort((x, y) => x.d - y.d);
    for (let i0 = 0, i = 1; i <= list.length; i++) {
      if (i < list.length && list[i].d - list[i - 1].d < TIE) continue;
      const plane = list.slice(i0, i);
      i0 = i;
      if (!plane.some(u => involved.has(u))) continue;
      // join triangles of this plane that share a vertex position
      const byPos = new Map();
      for (const u of plane) {
        parent.set(u, u);
        for (const vi of u.v) {
          const k = posKey(u.prim, vi);
          const o = byPos.get(k);
          if (o) unite(o, u); else byPos.set(k, u);
        }
      }
    }
  }
  const patches = new Map(); // root tri -> {id, tris, area, d, n, prim, off}
  for (const [t] of parent) {
    const r = find(t);
    let P = patches.get(r);
    if (!P) patches.set(r, P = { id: patches.size, tris: [], area: 0, dA: 0, n: r.n, prim: r.prim, off: 0 });
    P.tris.push(t); P.area += t.area; P.dA += t.d * t.area;
  }
  for (const P of patches.values()) P.d = P.dA / P.area;

  // --- pairwise order between patches
  const rel = new Map();
  for (const { t1, t2, area } of pairs) {
    const a = patches.get(find(t1)), b = patches.get(find(t2));
    if (!a || !b || a === b) continue;
    const [lo, hi] = a.id < b.id ? [a, b] : [b, a];
    const id = lo.id * 1e6 + hi.id;
    let r = rel.get(id);
    if (!r) rel.set(id, r = { a: lo, b: hi, area: 0 });
    r.area += area;
  }
  const cons = [];
  for (const r of rel.values()) {
    if (r.area < MIN_OVERLAP) continue;
    const g = r.a.d - r.b.d; // > 0: a already in front
    let front, back;
    if (Math.abs(g) >= GAP) { // already far enough apart: only keeps its order if a push brings them together
      [front, back] = g > 0 ? [r.a, r.b] : [r.b, r.a];
    } else if (Math.abs(g) >= TIE) { [front, back] = g > 0 ? [r.a, r.b] : [r.b, r.a]; }
    else {
      const ca = r.area / r.a.area, cb = r.area / r.b.area;
      [front, back] = ca > cb * 1.02 || (Math.abs(ca - cb) <= cb * 0.02 && r.a.area <= r.b.area) ? [r.a, r.b] : [r.b, r.a];
    }
    cons.push({ front, back, gap: Math.max(0, front.d - back.d) });
  }
  if (!cons.length) return 0;
  // relax: every front patch ends SEP ahead of its back patch (layers stack: wall < pane < mullion)
  for (let it = 0; it < 10; it++) {
    let changed = false;
    for (const c of cons) {
      const need = c.back.off + SEP - c.gap;
      if (need > c.front.off + 1e-6) { c.front.off = Math.min(need, SEP * 4); changed = true; }
    }
    if (!changed) break;
  }

  // --- move vertices (per geometry, so shared geometry is displaced once)
  const moves = new Map(); // geometry -> Map(vertex -> {x,y,z, mag})
  const inv3 = new THREE.Matrix3();
  let moved = 0;
  const vertTris = new Map(); // prim -> Array(vertex -> tris) built lazily
  const trisOfPrim = new Map();
  for (const t of tris) { let l = trisOfPrim.get(t.prim); if (!l) trisOfPrim.set(t.prim, l = []); l.push(t); }
  for (const P of patches.values()) {
    if (P.off <= 0) continue;
    moved++;
    const prim = prims[P.prim];
    inv3.setFromMatrix4(prim.M).invert();
    const disp = new THREE.Vector3(P.n[0] * P.off, P.n[1] * P.off, P.n[2] * P.off).applyMatrix3(inv3);
    let gm = moves.get(prim.geo);
    if (!gm) moves.set(prim.geo, gm = new Map());
    const own = new Set();
    for (const t of P.tris) for (const i of t.v) own.add(i);
    const put = i => { const e = gm.get(i); if (!e || e.mag < P.off) gm.set(i, { x: disp.x, y: disp.y, z: disp.z, mag: P.off }); };
    for (const i of own) put(i);
    // coincident vertices of side faces follow (split normals would otherwise open a crack)
    let vt = vertTris.get(P.prim);
    if (!vt) {
      vt = new Map();
      for (const t of trisOfPrim.get(P.prim) || []) for (const i of t.v) { let l = vt.get(i); if (!l) vt.set(i, l = []); l.push(t); }
      vertTris.set(P.prim, vt);
      vt.byPos = new Map();
      const n = prim.geo.attributes.position.count;
      for (let i = 0; i < n; i++) { const k = posKey(P.prim, i); let l = vt.byPos.get(k); if (!l) vt.byPos.set(k, l = []); l.push(i); }
    }
    for (const i of own) for (const j of vt.byPos.get(posKey(P.prim, i)) || []) {
      if (own.has(j)) continue;
      const inPlane = (vt.get(j) || []).some(u => u.n[0] * P.n[0] + u.n[1] * P.n[1] + u.n[2] * P.n[2] > 0.999 && Math.abs(u.d - P.d) < GAP);
      if (!inPlane) put(j);
    }
  }
  for (const [geo, gm] of moves) {
    const pos = geo.attributes.position;
    for (const [i, m] of gm) pos.setXYZ(i, pos.getX(i) + m.x, pos.getY(i) + m.y, pos.getZ(i) + m.z);
    if (pos.isInterleavedBufferAttribute) pos.data.needsUpdate = true; else pos.needsUpdate = true;
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
  }
  return moved;
}
