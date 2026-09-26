import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PATHS, PLACES, DECK_Y, RAIL_Y, VIADUCT } from '../world/layout.js';
import { GlowPoints, KIND, lin } from './cel-sprites.js';

// Festive decoration kit: catenary strings with instanced paper lanterns, bunting, blossom puffs and star
// ornaments, poles, fairy bulbs, halos and floating spirit lights. Emissive-only glow (no lights added),
// one draw call per ornament kind per level, built lazily the first time a level is shown.

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = v3(0, 1, 0);

/** Per-vertex colour + glow weight on a geometry (the decor material multiplies instance colours in). */
function paint(g, fn) {
  const p = g.attributes.position, n = p.count;
  const col = new Float32Array(n * 3), glow = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const [c, w] = fn(p.getX(i), p.getY(i), p.getZ(i));
    col[i * 3] = c; col[i * 3 + 1] = c; col[i * 3 + 2] = c; glow[i] = w;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
  return g;
}

function lanternGeo() {
  const prof = [[0, -0.23], [0.085, -0.23], [0.085, -0.195], [0.15, -0.165], [0.2, -0.09], [0.215, 0], [0.2, 0.09], [0.15, 0.165], [0.085, 0.195], [0.085, 0.23], [0, 0.23]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(prof, 12);
  g.deleteAttribute('uv');
  g.translate(0, -0.23, 0);  // hangs from its top
  // paper ribs: slightly darker bands; black lacquer caps
  return paint(g, (x, y) => {
    const yy = y + 0.23;
    if (Math.abs(yy) > 0.19) return [0.12, 0];
    const rib = Math.abs(Math.sin(yy * 42)) > 0.93 ? 0.8 : 1;
    return [rib, rib];
  });
}
function flagGeo() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.2, 0, 0, 0.2, 0, 0, 0, -0.4, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  return paint(g, () => [1, 0.12]);
}
function puffGeo() {
  const parts = [[0, 0, 0, 0.12], [0.1, -0.05, 0.03, 0.09], [-0.09, -0.06, -0.02, 0.085], [0.02, -0.12, 0.06, 0.08]].map(([x, y, z, r]) => {
    const s = new THREE.IcosahedronGeometry(r, 1);
    s.deleteAttribute('uv');
    s.translate(x, y - 0.1, z);
    return s;
  });
  return paint(mergeGeometries(parts), (x, y, z) => [0.9 + 0.1 * Math.sin(x * 40 + z * 30), 0.55]);
}
function starGeo() {
  const sh = new THREE.Shape();
  for (let k = 0; k < 10; k++) {
    const a = Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 0.1 : 0.24;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (k) sh.lineTo(x, y); else sh.moveTo(x, y);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 1 });
  g.deleteAttribute('uv');
  g.translate(0, -0.26, -0.025);
  return paint(g, () => [1, 1]);
}
function poleGeo() {
  const pole = new THREE.CylinderGeometry(0.06, 0.085, 1, 7);
  pole.translate(0, 0.5, 0);
  pole.deleteAttribute('uv');
  return paint(pole, () => [1, 0]);
}

/** One shared lit material; per-instance colours; emissive = colour x glow weight x uGlow. */
function decorMaterial(uGlow) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0, side: THREE.DoubleSide });
  m.onBeforeCompile = sh => {
    sh.uniforms.uGlow = uGlow;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlow;\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vGlow * uGlow;');
  };
  m.customProgramCacheKey = () => 'cel-decor';
  m.name = 'Celebration decor';
  return m;
}

const PAPER = ['#ff4a3d', '#ff7a2e', '#ffd04a', '#ff5f9e', '#ffffff', '#ff3b30'].map(h => new THREE.Color(h));
const SHRINE = ['#ff3b2f', '#ffffff', '#ff3b2f', '#ffefc8'].map(h => new THREE.Color(h));
const BUNTING = ['#ff4455', '#ffcf3a', '#2fb7ff', '#46d16a', '#ff7ac8', '#ff8a2a', '#9a6bff'].map(h => new THREE.Color(h));
const BLOSSOM = ['#ff9cc6', '#ffc2dc', '#ff7fb3', '#fff0f6'].map(h => new THREE.Color(h));
const STARS = ['#ffd24a', '#fff3c4', '#9fd8ff', '#ffc02a', '#ffe98a'].map(h => new THREE.Color(h));

/** Collects ornaments for one level, then bakes them into instanced meshes. */
class Kit {
  constructor(heightAt, trees = []) {
    this.h = heightAt;
    this.trees = trees;
    this.lanterns = []; this.flags = []; this.puffs = []; this.stars = []; this.poles = [];
    this.bulbs = []; this.halos = []; this.spirits = []; this.cables = [];
  }

  ground(x, z) { return this.h(x, z); }

  /** True when no tree trunk or crown stands within `r` (x tree scale) of the segment a-b (xz). */
  clear(a, b, r = 2.4) {
    const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
    for (const t of this.trees) {
      const k = Math.max(0, Math.min(1, ((t.x - a.x) * dx + (t.z - a.z) * dz) / l2));
      if (Math.hypot(t.x - a.x - dx * k, t.z - a.z - dz * k) < r * t.s) return false;
    }
    return true;
  }

  pole(x, z, h = 5.2, y) {
    const g = y ?? this.ground(x, z);
    this.poles.push({ x, y: g, z, h });
    this.stars.push({ p: v3(x, g + h + 0.26, z), c: STARS[0], s: 0.9, yaw: 0 });
    return v3(x, g + h - 0.15, z);
  }

  /** A sagging string from a to b with ornaments every `step` metres. kind: lantern | flags | puffs | stars. */
  string(a, b, { sag, kind = 'lantern', step, palette, scale = 1, bulbs = true, cable = 1 } = {}) {
    const len = a.distanceTo(b);
    sag ??= Math.min(2.2, 0.35 + len * 0.07);
    step ??= { lantern: 1.7, flags: 0.55, puffs: 0.42, stars: 1.1 }[kind];
    const at = t => a.clone().lerp(b, t).addScaledVector(UP, -4 * sag * t * (1 - t));
    const segs = Math.max(6, Math.ceil(len / 0.8));
    for (let i = 0; i < segs; i++) this.cables.push([at(i / segs), at((i + 1) / segs), cable]);
    const dir = b.clone().sub(a).setY(0).normalize();
    const yaw = Math.atan2(dir.x, dir.z);
    const n = Math.max(1, Math.floor(len / step));
    for (let i = 1; i < n; i++) {
      const t = i / n, p = at(t);
      const k = i + Math.floor(a.x * 3 + a.z * 7);
      if (kind === 'lantern') {
        const c = (palette || PAPER)[((k % 6) + 6) % (palette || PAPER).length];
        const drop = 0.14;
        this.cables.push([p.clone(), p.clone().add(v3(0, -drop, 0)), 0.5]);
        const s = scale * (0.85 + ((k * 37) % 7) / 20);
        this.lanterns.push({ p: p.clone().add(v3(0, -drop, 0)), c, s, yaw: yaw + k });
        this.halos.push({ x: p.x, y: p.y - drop - 0.23 * s, z: p.z, color: glowOf(c), size: 1.5 * s, alpha: 0.7 });
      } else if (kind === 'flags') {
        const c = (palette || BUNTING)[((k % 7) + 7) % (palette || BUNTING).length];
        const tan = at(Math.min(1, t + 0.01)).sub(at(Math.max(0, t - 0.01))).normalize();
        this.flags.push({ p, c, s: scale, tan });
      } else if (kind === 'puffs') {
        const c = (palette || BLOSSOM)[((k % 4) + 4) % 4];
        this.puffs.push({ p, c, s: scale * (0.8 + ((k * 13) % 5) / 10), yaw: k * 1.3 });
      } else if (kind === 'stars') {
        const c = (palette || STARS)[((k % 5) + 5) % 5];
        const big = i % 4 === 0;
        this.stars.push({ p, c, s: scale * (big ? 1.35 : 0.8), yaw: yaw + Math.PI / 2 });
        this.halos.push({ x: p.x, y: p.y - 0.26 * scale, z: p.z, color: glowOf(c), size: (big ? 1.6 : 0.9) * scale, alpha: 0.6 });
      }
      if (bulbs && kind !== 'lantern') {
        const q = at((i + 0.5) / n);
        this.bulbs.push({ x: q.x, y: q.y - 0.05, z: q.z, color: [1.6, 1.15, 0.55], size: 0.3, alpha: 0.9 });
      }
    }
  }

  /** Floating spirit lights along a polyline of [x, z] points. */
  spiritPath(pts, { every = 1.9, spread = 2.8, lo = 1.0, hi = 3.4, colors } = {}) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.floor(len / every));
      for (let k = 0; k < n; k++) {
        const t = (k + Math.random()) / n;
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const side = (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * spread);
        const nx = -(bz - az) / len, nz = (bx - ax) / len;
        const px = x + nx * side, pz = z + nz * side;
        const c = (colors || SPIRITS)[Math.floor(Math.random() * (colors || SPIRITS).length)];
        this.spirits.push({ x: px, y: this.ground(px, pz) + lo + Math.random() * (hi - lo), z: pz, color: c, size: 0.28 + Math.random() * 0.34, alpha: 1 });
      }
    }
  }

  bake(mat, lineMat) {
    const group = new THREE.Group();
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), E = new THREE.Euler();
    const inst = (geo, list, fill) => {
      if (!list.length) return;
      const m = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((o, i) => { fill(o, M); m.setMatrixAt(i, M); m.setColorAt(i, o.c || new THREE.Color(1, 1, 1)); });
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
      m.castShadow = false;
      m.receiveShadow = true;
      group.add(m);
    };
    inst(GEO.lantern(), this.lanterns, (o, m) => m.compose(o.p, Q.setFromAxisAngle(UP, o.yaw), S.setScalar(o.s)));
    inst(GEO.flag(), this.flags, (o, m) => {
      const x = o.tan, z = x.clone().cross(UP).normalize(), y = z.clone().cross(x).normalize();
      m.makeBasis(x, y, z).scale(S.setScalar(o.s)).setPosition(o.p);
    });
    inst(GEO.puff(), this.puffs, (o, m) => m.compose(o.p, Q.setFromEuler(E.set(0, o.yaw, 0)), S.setScalar(o.s)));
    inst(GEO.star(), this.stars, (o, m) => m.compose(o.p, Q.setFromAxisAngle(UP, o.yaw), S.setScalar(o.s)));
    const poleCol = new THREE.Color('#5a2a22');
    inst(GEO.pole(), this.poles, (o, m) => { o.c = poleCol; m.compose(v3(o.x, o.y - 0.2, o.z), Q.identity(), S.set(1, o.h + 0.2, 1)); });
    if (this.cables.length) {
      const pos = [];
      for (const [a, b] of this.cables) pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const l = new THREE.LineSegments(g, lineMat);
      group.add(l);
    }
    const glows = {};
    if (this.halos.length) group.add((glows.halos = new GlowPoints(this.halos, { kind: KIND.GLOW, flicker: 0.12, renderOrder: 5 })).points);
    if (this.bulbs.length) group.add((glows.bulbs = new GlowPoints(this.bulbs, { kind: KIND.GLOW, flicker: 0.3, renderOrder: 5 })).points);
    if (this.spirits.length) group.add((glows.spirits = new GlowPoints(this.spirits, { kind: KIND.GLOW, bob: 0.45, flicker: 0.25, renderOrder: 5 })).points);
    return { group, glows };
  }
}

const SPIRITS = [lin('#bff7ff', 1.6), lin('#c9ffcf', 1.5), lin('#fff1b0', 1.6), lin('#ffc8f0', 1.4), lin('#ffffff', 1.5)];
const glowOf = c => [Math.min(2, c.r * 1.9 + 0.25), Math.min(2, c.g * 1.6 + 0.12), Math.min(2, c.b * 1.3 + 0.05)];

let GEO_CACHE = null;
const geo = () => (GEO_CACHE ??= { lantern: lanternGeo(), flag: flagGeo(), puff: puffGeo(), star: starGeo(), pole: poleGeo() });
const GEO = { lantern: () => geo().lantern, flag: () => geo().flag, puff: () => geo().puff, star: () => geo().star, pole: () => geo().pole };

/** Façade anchor in front of a placed building: `fwd` metres out from its origin along its front, `up` above its base. */
function facade(S, id, fwd, up, side = 0) {
  const r = S.byId.get(id);
  if (!r) return null;
  const a = r.rot * Math.PI / 180, fx = Math.sin(a), fz = Math.cos(a);
  return v3(r.x + fx * fwd + fz * side, r.y + up, r.z + fz * fwd - fx * side);
}

// ------------------------------------------------------------------------------------------------ levels
const LEVELS = {
  // Kawabe: lanterns across and along the main street, blossom garlands on the eaves, a lantern-lined lane
  // down to the dock and a maypole of lanterns from the Mill Lamp.
  1(k, g) {
    const S = g.structures;
    const W = { kw1: [3.2, 3.7], kw2: [3.5, 3.4], kw3: [3.2, 3.7], kw4: [3.7, 3.4], kw8: [3.5, 3.4], kw5: [3.2, 3.7], kw6: [3.7, 3.4], kw7: [3.2, 3.7], otaHouse: [3.7, 3.4] };
    const A = (id, side = 0) => facade(S, id, W[id][0] + 0.5, W[id][1], side);
    const cross = [['kw1', 'kw5', 1.5, 2.5], ['kw1', 'kw5', -2.2, -1], ['kw3', 'kw6', 2.2, 3.4], ['kw3', 'kw6', -1.8, -1.2], ['kw8', 'kw7', 0.6, -2.4], ['kw8', 'kw7', -2.2, 0.8]];
    for (const [w, e, sw, se] of cross) { const a = A(w, sw), b = A(e, se); if (a && b) k.string(a, b, { sag: 1.3 }); }
    // zig-zags between the gaps (house corner to house corner diagonally across the street)
    for (const [w, e, sw, se] of [['kw2', 'kw5', 2.2, -2.5], ['kw2', 'kw6', -2.2, 3.2], ['kw4', 'kw6', 3.8, -2.5], ['kw4', 'kw7', -3.8, 2.5]]) {
      const a = A(w, sw), b = A(e, se);
      if (a && b) k.string(a, b, { sag: 1.6 });
    }
    // blossom garlands swagged along every façade
    for (const id of ['kw1', 'kw2', 'kw3', 'kw4', 'kw8', 'kw5', 'kw6', 'kw7', 'otaHouse']) {
      const half = id === 'kw4' || id === 'kw6' || id === 'otaHouse' ? 4.1 : 3.2;
      const a = A(id, -half), m = A(id, 0), b = A(id, half);
      if (!a) continue;
      a.y -= 0.35; m.y -= 0.35; b.y -= 0.35;
      k.string(a, m, { kind: 'puffs', sag: 0.45, bulbs: false });
      k.string(m, b, { kind: 'puffs', sag: 0.45, bulbs: false });
    }
    // lantern poles down the lane to the dock
    const lane = [-39, -30.5, -22, -13.5, -5];
    const tops = lane.map((x, i) => k.pole(x, 30 + (i % 2 ? -2.3 : 2.3), 4.6));
    for (let i = 0; i < tops.length - 1; i++) if (k.clear(tops[i], tops[i + 1], 2.4)) k.string(tops[i], tops[i + 1], { sag: 0.9, step: 1.35 });
    // the Mill Lamp maypole
    const L = g.structures.lamps.get('mill');
    if (L) {
      const top = L.flame.clone().add(v3(0, 1.1, 0));
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2 + 0.3;
        const x = L.flame.x + Math.cos(a) * 3.6, z = L.flame.z + Math.sin(a) * 3.6;
        const base = k.pole(x, z, 1.7, Math.max(1.2, k.ground(x, z)));
        k.string(top, base, { sag: 0.5, step: 1.1, scale: 0.9 });
      }
    }
  },

  // Takamori: a canopy of lantern strings radiating from the bell tower, bunting round the square and the
  // tower gallery, and lantern poles up the lane from the landing.
  2(k, g) {
    const S = g.structures, T = S.byId.get('belltower');
    if (T) {
      const gy = T.y;
      const corner = (sx, sz) => v3(T.x + sx * 2.45, gy + 13.6, T.z + sz * 2.45);
      const ends = [
        [facade(S, 'tk1', 4.2, 4.6), 1, 1], [facade(S, 'tk3', 4.2, 4.6), 1, -1], [facade(S, 'tk2', 3.9, 4.0), -1, -1],
        [facade(S, 'bakery', 4.1, 4.6), -1, 1], [facade(S, 'tk4', 3.9, 4.0), 1, 1], [facade(S, 'tk4', 3.9, 4.0, 2.2), -1, 1],
        [v3(108, k.ground(108, 0) + 3.3, 0), -1, 1], [v3(122, k.ground(122, 12) + 3.3, 12), 1, 1],
      ];
      for (const [e, sx, sz] of ends) if (e) k.string(corner(sx, sz), e, { sag: 1.6, step: 1.45 });
      // bunting round the gallery
      const gal = T.y + 12.35;
      const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => v3(T.x + x * 2.62, gal, T.z + z * 2.62));
      for (let i = 0; i < 4; i++) k.string(c[i], c[(i + 1) % 4], { kind: 'flags', sag: 0.3, step: 0.42, scale: 0.8 });
    }
    // bunting between the houses round the square
    for (const [a, b] of [['bakery', 'tk2'], ['tk1', 'tk3'], ['bakery', 'tk4'], ['tk4', 'tk1'], ['tk5', 'bakery']]) {
      const pa = facade(S, a, 3.8, 4.3), pb = facade(S, b, 3.8, 4.3);
      if (pa && pb) k.string(pa, pb, { kind: 'flags', sag: 1.8 });
    }
    // lantern poles along the lane from the landing
    const lane = PATHS[6].pts;
    const posts = [];
    for (let i = 0; i < lane.length - 1; i++) {
      const [ax, az] = lane[i], [bx, bz] = lane[i + 1];
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 10));
      for (let j = 0; j < n; j++) {
        const t = j / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const side = posts.length % 2 ? 1 : -1, nx = -(bz - az) / len, nz = (bx - ax) / len;
        posts.push([x + nx * 2.4 * side, z + nz * 2.4 * side]);
      }
    }
    // a post never stands in a tree, and a span is only hung where no crown is in the way
    const spots = posts.filter(([x, z]) => Math.hypot(x - 115, z - 6) > 12 && x > 32 && k.clear(v3(x, 0, z), v3(x, 0, z), 2.2));
    let prev = null;
    for (const [x, z] of spots) {
      const top = v3(x, k.ground(x, z) + 4.25, z);
      if (prev && prev.distanceTo(top) < 16 && k.clear(prev, top, 2.6)) k.string(prev, top, { sag: 1.0 });
      k.pole(x, z, 4.4);
      prev = top;
    }
  },

  // The forest: spirit lights drifting along the paths and round the shrine, lanterns up the stairs and on
  // both torii, extra stone lanterns glowing beside the steps.
  3(k, g) {
    for (const i of [9, 10, 11]) k.spiritPath(PATHS[i].pts);
    k.spiritPath([[62, -116], [62, -146], [62, -158]], { every: 1.6, spread: 3.5, lo: 1.2, hi: 4 });
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 9;
      const x = 60 + Math.cos(a) * r, z = -118 + Math.sin(a) * r * 0.7;
      k.spirits.push({ x, y: k.ground(x, z) + 1 + Math.random() * 4, z, color: SPIRITS[i % SPIRITS.length], size: 0.3 + Math.random() * 0.4, alpha: 1 });
    }
    // lantern strings on poles either side of the stairs
    for (const side of [-1, 1]) {
      const zs = [-120.5, -128.5, -136.5, -144.5];
      const tops = zs.map(z => k.pole(62 + side * 4.3, z, 3.4));
      for (let i = 0; i < tops.length - 1; i++) k.string(tops[i], tops[i + 1], { sag: 0.7, step: 1.3, palette: SHRINE });
    }
    // big red lanterns hanging from the torii tie-beams
    for (const id of ['torii', 'toriiTop']) {
      const r = g.structures.byId.get(id);
      if (!r) continue;
      for (const dx of [-1.05, 1.05]) {
        const p = v3(r.x + dx, r.y + 3.95, r.z);
        k.cables.push([p.clone(), p.clone().add(v3(0, -0.35, 0)), 0.5]);
        k.lanterns.push({ p: p.clone().add(v3(0, -0.35, 0)), c: SHRINE[0], s: 1.9, yaw: 0 });
        k.halos.push({ x: p.x, y: p.y - 0.8, z: p.z, color: [2, 0.6, 0.3], size: 2.6, alpha: 0.7 });
      }
    }
    // stone-lantern glows (the lanterns themselves are the placed props; these are their halos)
    for (const [x, z] of [[58.5, -118], [65.5, -118], [58, -150], [66, -150]]) k.halos.push({ x, y: k.ground(x, z) + 1.25, z, color: [2, 1.3, 0.55], size: 2.2, alpha: 0.8 });
  },

  // Station, platform and viaduct: star garlands.
  4(k, g) {
    const V = VIADUCT, y = DECK_Y + 1.12;
    const piers = [];
    for (let x = V.x0; x <= V.x1 + 0.01; x += 7) piers.push(x);
    for (const zs of [-3.05, 3.05]) {
      for (let i = 0; i < piers.length - 1; i++) {
        const a = v3(piers[i], y, V.z + zs), b = v3(piers[i + 1], y, V.z + zs);
        if (zs > 0 && Math.abs((a.x + b.x) / 2) < 4) continue; // the lamp refuge
        k.string(a, b, { kind: 'stars', sag: 0.8, step: 0.9, cable: 1 });
        k.halos.push({ x: a.x, y: y + 0.05, z: a.z, color: [2, 1.6, 0.7], size: 1.2, alpha: 0.8 });
      }
    }
    // star strings from the Viaduct Lamp to the near parapet
    const L = g.structures.lamps.get('viaduct');
    if (L) {
      const top = L.flame.clone().add(v3(0, 1.2, 0));
      for (const dx of [-9, -4.5, 4.5, 9]) k.string(top, v3(L.flame.x + dx, y, V.z + 3.05), { kind: 'stars', sag: 0.5, step: 0.8, scale: 0.9 });
    }
    // Hoshi Station: along the canopy eave, and out to the lamps
    const st = g.structures.byId.get('station');
    if (st) {
      const ey = st.y + 3.25, ez = st.z + 3.55;
      const xs = [-6.3, -3.15, 0, 3.15, 6.3].map(d => st.x + d);
      for (let i = 0; i < xs.length - 1; i++) k.string(v3(xs[i], ey, ez), v3(xs[i + 1], ey, ez), { kind: 'stars', sag: 0.45, step: 0.8, scale: 0.85 });
      k.string(v3(xs[0], ey, ez), v3(-110, k.ground(-110, 118) + 3.3, 118), { kind: 'stars', sag: 0.9 });
      // platform: short posts along its back edge with a garland
      const pz = PLACES.platform.z - 1.6, py = RAIL_Y + 0.95;
      const posts = [-112, -104, -92, -84].map(x => k.pole(x, pz, 2.6, py));
      for (let i = 0; i < posts.length - 1; i++) if (i !== 1) k.string(posts[i], posts[i + 1], { kind: 'stars', sag: 0.6 });
    }
    // Takamori Halt
    const h = g.structures.byId.get('haltPlatform');
    if (h) {
      const a = h.rot * Math.PI / 180, dx = Math.cos(a), dz = -Math.sin(a), bx = -Math.sin(a), bz = -Math.cos(a);
      const posts = [-11, -3.5, 4, 11.5].map(t => k.pole(h.x + dx * t + bx * 1.5, h.z + dz * t + bz * 1.5, 2.6, RAIL_Y + 0.95));
      for (let i = 0; i < posts.length - 1; i++) k.string(posts[i], posts[i + 1], { kind: 'stars', sag: 0.6 });
    }
  },
};

/** Cumulative festive decoration of the valley (levels 1..4). */
export class Decor {
  constructor(game) {
    this.g = game;
    this.uGlow = { value: 0.3 };
    this.mat = decorMaterial(this.uGlow);
    this.lineMat = new THREE.LineBasicMaterial({ color: '#3a2a26', transparent: true, opacity: 0.85 });
    this.group = new THREE.Group();
    this.group.name = 'cel:decor';
    game.scene.add(this.group);
    this.levels = {};
    this.level = 0;
  }

  /** The paper-lantern geometry (shared with the orchard lanterns). */
  lanternGeometry() { return GEO.lantern(); }

  /** A throw-away instanced mesh so the decor material can be compiled up front. */
  probe() {
    const m = new THREE.InstancedMesh(GEO.lantern(), this.mat, 1);
    m.setColorAt(0, new THREE.Color(1, 1, 1));
    m.receiveShadow = true;
    const l = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([v3(), v3(0, 1, 0)]), this.lineMat);
    const g = new THREE.Group();
    g.add(m, l);
    return g;
  }

  build(n) {
    if (this.levels[n] || !LEVELS[n]) return this.levels[n];
    const trees = (this.g.placed?.trees ?? []).filter(t => !t.far);
    const k = new Kit((x, z) => this.g.world.heightAt(x, z), trees);
    LEVELS[n](k, this.g);
    const baked = k.bake(this.mat, this.lineMat);
    baked.group.name = `cel:decor${n}`;
    this.group.add(baked.group);
    this.levels[n] = baked;
    return baked;
  }

  set(level) {
    this.level = Math.max(0, Math.min(4, level | 0));
    for (let n = 1; n <= 4; n++) {
      if (n <= this.level) this.build(n);
      if (this.levels[n]) this.levels[n].group.visible = n <= this.level;
    }
  }

  update(night) {
    this.uGlow.value = 0.3 + night * 2.4;
    for (const L of Object.values(this.levels)) {
      const G = L.glows;
      if (G.halos) G.halos.intensity = 0.12 + night * 0.85;
      if (G.bulbs) G.bulbs.intensity = 0.5 + night * 0.9;
      if (G.spirits) G.spirits.intensity = 0.3 + night * 0.9;
    }
  }
}
