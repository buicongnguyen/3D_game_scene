import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { patchMaterial } from '../engine/effects.js';
import { PADDIES } from './layout.js';
import { lightingAt } from './seasons.js';
import { VEG_BEDS, WHEAT_FIELDS, CUT_IN_AUTUMN, FIELD_YEAR, LIGHT_COLOURS, bedRows, wheatRows, dryingRacks, fieldLights, fieldOptions, lightGlow } from './fields.js';

/*
 * The field grid west of Kawabe: flooded rice paddies, a wheat field of two dry plots on the top terrace and a few
 * vegetable beds, each inside its bund, with paper lanterns on the corner posts and fairy lights strung along two
 * sides. Everything is instanced or merged: the rice of each plot is one draw call and its grain heads one (autumn
 * only), the wheat of each plot one, the two vegetables one each, the soil, the mud of the drained paddies, the
 * drying racks, the posts and all the lights one each (two on Low, where the small lights are a lighter shape). A
 * plot out of view is not drawn. Wind comes from the shared foliage shader (effects.js); the lights glow at dusk and
 * night from their own colour (emissive, picked up by the bloom pass): there is not one real light among them.
 *
 * The year (fields.js FIELD_YEAR). Rice: spring = hills of seedlings just transplanted, in rows in mirror water;
 * summer = dense deep-green tillers; autumn = the paddies are drained, the rice is golden and its heads hang (three
 * plots are already cut: stubble, sheaves drying heads-down on racks and a few stood-up bundles); winter = stubble
 * in the mud, under snow. Wheat is the other way round: sown in autumn (green needles in the drill rows), small
 * tufts through the winter, tall and green in ear in spring, golden in summer. The plants of a stage are one small
 * shape each (the plot's instanced mesh swaps its geometry with the season), turned, sized and tinted per plant.
 */
const SEASON = {
  spring: { rice: '#93dd4c', wheat: '#58b23e', ear: null, bund: '#6e9c3a', water: true, mud: '#6a4e36', soil: '#5c3c24', veg: [1.08, 1.12, 0.82], vegSize: 0.5, leafy: true },
  summer: { rice: '#2f9a3c', wheat: '#eab53a', ear: null, bund: '#58903a', water: true, mud: '#6a4e36', soil: '#6b4729', veg: [1, 1, 1], vegSize: 1, leafy: true },
  autumn: { rice: '#c9a640', wheat: '#8fdc55', ear: '#f2a40e', bund: '#9a8446', water: false, mud: '#7b5a3a', soil: '#6e4a2c', veg: [1.02, 0.98, 0.8], vegSize: 1.08, leafy: true },
  winter: { rice: '#c2a268', wheat: '#5fa648', ear: null, bund: '#8f8068', water: false, mud: '#6b5745', soil: '#5e4632', veg: [0.8, 0.9, 0.8], vegSize: 0.62, leafy: false },
};
/** How a plant of each stage is sized: [across, up]. */
const RICE_SIZE = { seedling: [1, 1], green: [1, 1], golden: [1.04, 0.96], stubble: [1, 1] };
const WHEAT_SIZE = { sprout: [1, 1], green: [1, 0.9], golden: [1, 1] };

/** Triangles pushed one by one, with a colour per vertex. */
class Soup {
  constructor() { this.pos = []; this.col = []; }
  tri(a, b, c, ca, cb = ca, cc = ca) { this.pos.push(...a, ...b, ...c); this.col.push(...ca, ...cb, ...cc); }
  /** a, b take the first colour and c, d the second: triangles a-b-c and b-d-c. */
  quad(a, b, c, d, cab, ccd = cab) { this.tri(a, b, c, cab, cab, ccd); this.tri(b, d, c, cab, ccd, ccd); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    return g;
  }
}
/** A stock three.js geometry as plain triangles in one colour (to merge with a Soup). */
function painted(geo, colour) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set(colour, i * 3);
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/**
 * A leaf blade: a tapering ribbon that starts r0 out from the stem at height y0, rises h and arches `lean` outward
 * (its tip sinking by `droop` of its height), in `seg` pieces; shaded from `low` at the foot to `high` at the tip.
 */
function blade(s, a, { h, w, lean, r0 = 0, y0 = 0, seg = 3, droop = 0, tip = 0.3, low, high }) {
  const dx = Math.cos(a), dz = Math.sin(a), sx = -dz, sz = dx;
  let prev = null, pc = null;
  for (let k = 0; k <= seg; k++) {
    const t = k / seg, ww = w * (1 - t * (1 - tip)), r = r0 + lean * t * t, y = y0 + h * (t - droop * t * t * t);
    const row = [[dx * r - sx * ww, y, dz * r - sz * ww], [dx * r + sx * ww, y, dz * r + sz * ww]];
    const c = low.map((v, i) => v + (high[i] - v) * t);
    if (prev) s.quad(prev[0], prev[1], row[0], row[1], pc, c);
    prev = row; pc = c;
  }
}

/** A hill of rice seedlings just set into the mud: four short, upright blades (16 triangles). */
function seedlingGeometry() {
  const s = new Soup();
  for (let b = 0; b < 4; b++) {
    blade(s, b * 1.72 + 0.4, { h: 0.3 + (b % 3) * 0.045, w: 0.03, lean: 0.05 + (b % 2) * 0.05, r0: 0.02 + (b % 2) * 0.02, seg: 2, low: [0.6, 0.72, 0.5], high: [1.08, 1.1, 0.8] });
  }
  return s.geometry();
}

/** A tillered rice plant, summer to harvest: nine long leaves arching out of one clump (48 triangles). */
function clumpGeometry() {
  const s = new Soup();
  for (let b = 0; b < 9; b++) {
    const outer = b % 3 === 2;
    blade(s, b * 2.399 + 0.3, { h: 0.6 + (b % 4) * 0.09, w: outer ? 0.05 : 0.044, lean: 0.13 + (b % 3) * 0.1, r0: 0.02 + (b % 2) * 0.03, seg: outer ? 2 : 3, droop: outer ? 0.22 : 0.08,
      low: [0.5, 0.58, 0.44], high: outer ? [0.96, 1.0, 0.8] : [1.1, 1.12, 0.86] });
  }
  return s.geometry();
}

/**
 * The grain of one rice plant in autumn: four heavy panicles that come up out of the clump, bend over and hang
 * (40 triangles), in the same frame as clumpGeometry. A rice head droops; a wheat ear stands up (wheatGeometry).
 */
function earGeometry() {
  const s = new Soup();
  const path = [[0.08, 0.74, 0.008], [0.2, 0.97, 0.024], [0.33, 0.9, 0.034], [0.4, 0.6, 0.014]];   // [out, up, half width]
  const cols = [[0.6, 0.7, 0.3], [0.95, 0.9, 0.5], [1, 0.86, 0.36], [0.92, 0.7, 0.24]];
  for (let b = 0; b < 4; b++) {
    const a = b * 1.57 + 0.55 + (b % 2) * 0.35, k = 0.86 + (b % 3) * 0.1, dx = Math.cos(a), dz = Math.sin(a), sx = -dz, sz = dx;
    const at = (i, side, lift) => { const [r, y, w] = path[i]; return [dx * r * k + sx * w * side, y * k + w * lift, dz * r * k + sz * w * side]; };
    // a flat ribbon seen from above and one seen from the side: the head keeps some body from every direction
    for (let i = 0; i < 3; i++) s.quad(at(i, -1, 0), at(i, 1, 0), at(i + 1, -1, 0), at(i + 1, 1, 0), cols[i], cols[i + 1]);
    for (let i = 1; i < 3; i++) s.quad(at(i, 0, -1), at(i, 0, 1), at(i + 1, 0, -1), at(i + 1, 0, 1), cols[i], cols[i + 1]);
  }
  return s.geometry();
}

/** What the sickle leaves: a tuft of short cut straws (12 triangles). */
function stubbleGeometry() {
  const s = new Soup();
  for (let b = 0; b < 6; b++) {
    blade(s, b * 2.399, { h: 0.11 + (b % 3) * 0.03, w: 0.022, lean: 0.02 + (b % 2) * 0.03, r0: 0.02 + (b % 3) * 0.025, seg: 1, tip: 0.9, low: [0.7, 0.66, 0.55], high: [1.1, 1.06, 0.9] });
  }
  return s.geometry();
}

/**
 * A tuft of wheat, tall: four straight stalks, each with an upright bearded ear (a spindle and its awns), over a few
 * leaves (60 triangles). Green in spring, golden in summer (the material's colour).
 */
function wheatGeometry() {
  const s = new Soup();
  const stalk = [0.6, 0.66, 0.48], top = [0.92, 0.94, 0.8], ear = [1.2, 1.08, 0.7], awn = [1.3, 1.24, 0.95];
  for (let b = 0; b < 4; b++) {
    const a = b * 1.57 + 0.3, h = 0.6 + (b % 3) * 0.08, lean = 0.03 + (b % 2) * 0.05, r0 = 0.03 + (b % 2) * 0.03;
    blade(s, a, { h, w: 0.02, lean, r0, seg: 2, tip: 0.8, low: stalk, high: top });
    const dx = Math.cos(a), dz = Math.sin(a), cx = dx * (r0 + lean), cz = dz * (r0 + lean);
    for (const [ux, uz] of [[dx, dz], [-dz, dx]]) {
      const p = (r, y) => [cx + ux * r + dx * (y - h) * 0.12, y, cz + uz * r + dz * (y - h) * 0.12];
      s.tri(p(0, h - 0.01), p(-0.042, h + 0.09), p(0.042, h + 0.09), top, ear, ear);
      s.tri(p(-0.042, h + 0.09), p(0, h + 0.25), p(0.042, h + 0.09), ear);
      // the beard: two thin awns standing up and a little apart
      for (const e of [-1, 1]) s.tri(p(e * 0.028, h + 0.13), p(e * 0.004, h + 0.17), p(e * 0.075, h + 0.38), ear, ear, awn);
    }
  }
  for (let b = 0; b < 3; b++) blade(s, b * 2.1 + 1.1, { h: 0.34 + b * 0.05, w: 0.03, lean: 0.14, r0: 0.03, seg: 2, droop: 0.2, low: stalk, high: [0.95, 1, 0.8] });
  return s.geometry();
}

/** Winter wheat just up, autumn to the thaw: three green needles in the drill row (6 triangles). */
function sproutGeometry() {
  const s = new Soup();
  for (let b = 0; b < 3; b++) blade(s, b * 2.1 + 0.5, { h: 0.13 + b * 0.025, w: 0.024, lean: 0.05, r0: 0.01, seg: 1, tip: 0.15, low: [0.7, 0.8, 0.6], high: [1.1, 1.12, 0.85] });
  return s.geometry();
}

/** A square timber from a to b (drying racks). */
function beam(a, b, thick, colour) {
  const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return painted(new THREE.BoxGeometry(thick, len, thick).applyQuaternion(q).translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), colour);
}

/**
 * The harvest of a cut paddy (fields.js dryingRacks) as triangles standing at height y: a pole on three pairs of
 * crossed legs with the sheaves hung astride it, heads down, and a few bundles stood up on the stubble.
 */
function harvestParts(p, y, parts) {
  const wood = [0.2, 0.1, 0.04], straw = [0.62, 0.42, 0.11], pale = [0.74, 0.56, 0.2], grain = [0.78, 0.4, 0.035];
  const { racks, stooks } = dryingRacks(p), s = new Soup();
  const rnd = (a, b) => Math.abs(Math.sin(a * 12.9898 + b * 78.233) * 43758.5453) % 1;
  for (const r of racks) {
    const top = y + 1.16, x0 = r.x - r.len / 2, x1 = r.x + r.len / 2;
    parts.push(beam([x0 - 0.3, top, r.z], [x1 + 0.3, top, r.z], 0.07, wood));
    for (const lx of [x0, r.x, x1]) for (const side of [-1, 1]) parts.push(beam([lx, y - 0.05, r.z + side * 0.44], [lx, top + 0.2, r.z - side * 0.07], 0.06, wood));
    for (let i = 0; i < r.sheaves; i++) {
      const u = rnd(r.x + i, r.z), v = rnd(r.z + i * 3, r.x), x = x0 + 0.19 + i * (r.len - 0.38) / (r.sheaves - 1) + (u - 0.5) * 0.05;
      const len = 0.6 + u * 0.16, out = 0.19 + v * 0.07, wt = 0.1, wb = 0.19 + v * 0.03, ty = top + 0.075, by = ty - len;
      for (const side of [-1, 1]) {
        const z0 = r.z + side * 0.035, z1 = r.z + side * out;
        s.quad([x - wt, ty, z0], [x + wt, ty, z0], [x - wb, by, z1], [x + wb, by, z1], side > 0 ? pale : straw, grain);
      }
      // the open sides of the sheaf, and the bound straw lying over the pole
      for (const e of [-1, 1]) s.tri([x + e * wt, ty, r.z], [x + e * wb, by, r.z - out], [x + e * wb, by, r.z + out], straw, grain, grain);
      s.quad([x - wt, ty, r.z - 0.035], [x + wt, ty, r.z - 0.035], [x - wt, ty + 0.012, r.z + 0.035], [x + wt, ty + 0.012, r.z + 0.035], pale);
    }
  }
  const hung = s.geometry();
  hung.deleteAttribute('normal');
  parts.push(hung);
  stooks.forEach(([x, z], i) => {
    const k = 0.9 + rnd(x, z) * 0.25;
    const body = painted(new THREE.CylinderGeometry(0.07 * k, 0.25 * k, 0.6 * k, 6).translate(0, 0.3 * k, 0), i % 2 ? straw : pale);
    const head = painted(new THREE.CylinderGeometry(0.21 * k, 0.07 * k, 0.26 * k, 6).translate(0, 0.72 * k, 0), grain);
    for (const g of [body, head]) { g.rotateY(rnd(z, x) * 3).rotateZ((rnd(x, i) - 0.5) * 0.18).translate(x, y, z); parts.push(g); }
  });
}

/** A leafy green (cabbage or lettuce): a rosette of broad leaves round a pale heart. */
function leafyGeometry() {
  const s = new Soup();
  const pale = [0.39, 0.72, 0.14], mid = [0.1, 0.44, 0.06], dark = [0.035, 0.26, 0.035];   // linear RGB
  for (let b = 0; b < 8; b++) {
    const a = (b / 8) * Math.PI * 2 + (b % 2) * 0.2, dx = Math.cos(a), dz = Math.sin(a), sx = -dz, sz = dx;
    const up = b % 2 ? 0.05 : 0;
    const p = (r, y, w) => [[dx * r - sx * w, y, dz * r - sz * w], [dx * r + sx * w, y, dz * r + sz * w]];
    const [a0, a1] = p(0.03, 0.04, 0.035), [b0, b1] = p(0.2, 0.15 + up, 0.12), [c0, c1] = p(0.34 - up, 0.11 + up * 2, 0.04);
    s.quad(a0, a1, b0, b1, pale, mid);
    s.quad(b0, b1, c0, c1, mid, dark);
  }
  const heart = painted(new THREE.IcosahedronGeometry(0.115, 0).scale(1, 0.85, 1).translate(0, 0.13, 0), pale);
  const leaves = s.geometry();
  heart.deleteAttribute('normal');
  leaves.deleteAttribute('normal');
  const g = mergeGeometries([leaves, heart]);
  leaves.dispose(); heart.dispose();
  g.computeVertexNormals();
  return g;
}

/** A radish: a tuft of upright leaves over a white shoulder pushing out of the ridge. */
function radishGeometry() {
  const s = new Soup();
  const pale = [0.27, 0.63, 0.1], dark = [0.035, 0.32, 0.045];   // linear RGB
  for (let b = 0; b < 6; b++) {
    const a = (b / 6) * Math.PI * 2 + b * 0.5, dx = Math.cos(a), dz = Math.sin(a), sx = -dz, sz = dx;
    const h = 0.4 + (b % 3) * 0.07, lean = 0.13 + (b % 2) * 0.07;
    let prev = null;
    for (let k = 0; k <= 3; k++) {
      const t = k / 3, w = 0.05 * (t < 0.5 ? 0.6 + t * 0.8 : 1.4 - t * 1.1);
      const cx = dx * lean * t * t, cz = dz * lean * t * t, cy = 0.08 + h * t;
      const row = [[cx - sx * w, cy, cz - sz * w], [cx + sx * w, cy, cz + sz * w]];
      if (prev) s.quad(prev[0], prev[1], row[0], row[1], k === 1 ? pale : dark, dark);
      prev = row;
    }
  }
  const root = painted(new THREE.CylinderGeometry(0.05, 0.07, 0.12, 6).translate(0, 0.05, 0), [1, 0.98, 0.94]);
  const leaves = s.geometry();
  root.deleteAttribute('normal');
  leaves.deleteAttribute('normal');
  const g = mergeGeometries([leaves, root]);
  leaves.dispose(); root.dispose();
  g.computeVertexNormals();
  return g;
}

/** A paper lantern one metre across: a round body under a dark cap (scaled per instance). */
function lanternGeometry() {
  const body = painted(new THREE.SphereGeometry(0.5, 7, 5).scale(1, 1.12, 1), [1, 1, 1]);
  const cap = painted(new THREE.CylinderGeometry(0.2, 0.26, 0.14, 6).translate(0, 0.58, 0), [0.1, 0.08, 0.06]);
  const foot = painted(new THREE.CylinderGeometry(0.22, 0.18, 0.1, 6).translate(0, -0.57, 0), [0.1, 0.08, 0.06]);
  const g = mergeGeometries([body, cap, foot]);
  body.dispose(); cap.dispose(); foot.dispose();
  return g;
}

/** A fairy light for small screens: the same paper ball in 24 triangles instead of 104 (it is 14 cm across). */
function bulbGeometry() {
  const body = painted(new THREE.SphereGeometry(0.5, 5, 3).scale(1, 1.12, 1), [1, 1, 1]);
  const cap = painted(new THREE.ConeGeometry(0.27, 0.2, 4, 1, true).translate(0, 0.62, 0), [0.1, 0.08, 0.06]);
  const g = mergeGeometries([body, cap]);
  body.dispose(); cap.dispose();
  return g;
}

/** A ridge of tilled soil along z: a low triangular bank, a little lighter along its crest. */
function ridge(s, x, y, z0, z1, w, h, colour) {
  const top = colour.map(v => v * 1.12);
  const a0 = [x - w / 2, y, z0], a1 = [x - w / 2, y, z1], b0 = [x, y + h, z0 + 0.15], b1 = [x, y + h, z1 - 0.15], c0 = [x + w / 2, y, z0], c1 = [x + w / 2, y, z1];
  s.quad(a0, a1, b0, b1, colour, top);
  s.quad(b0, b1, c0, c1, top, colour);
  s.tri(c0, a0, b0, colour, colour, top);
  s.tri(a1, c1, b1, colour, colour, top);
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _p = new THREE.Vector3(), _s = new THREE.Vector3();

export class Paddies {
  constructor(scene, assets, world) {
    this.world = world;
    // how densely the grid is planted and lit for this tier (fields.js fieldOptions: cropDensity, fieldLights, riceEars, detail)
    const opt = this.options = fieldOptions(world.quality);
    this.group = new THREE.Group();
    this.group.name = 'paddies';
    scene.add(this.group);
    // a shallow sky mirror: dark, glossy and mostly reflection
    this.waterMat = new THREE.MeshStandardMaterial({ color: '#2f6f86', roughness: 0.03, metalness: 0.62, transparent: true, opacity: 0.9, envMapIntensity: 1.8 });
    this.riceMat = patchMaterial(new THREE.MeshStandardMaterial({ color: '#93dd4c', roughness: 0.75, side: THREE.DoubleSide, vertexColors: true }), { wind: 2 });
    this.wheatMat = patchMaterial(new THREE.MeshStandardMaterial({ color: '#58b23e', roughness: 0.75, side: THREE.DoubleSide, vertexColors: true }), { wind: 2 });
    this.earMat = patchMaterial(new THREE.MeshStandardMaterial({ color: '#f7c530', roughness: 0.6, side: THREE.DoubleSide, vertexColors: true }), { wind: 2 });
    this.vegMat = patchMaterial(new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide, vertexColors: true }), { wind: 2 });
    this.soilMat = patchMaterial(new THREE.MeshStandardMaterial({ color: '#6b4729', roughness: 1, vertexColors: true }));
    const bundMat = this.bundMat = patchMaterial(new THREE.MeshStandardMaterial({ color: '#7f8f3c', roughness: 0.95 }));
    const bunds = [], waters = [];
    const leafy = [], radish = [];
    const plots = [];                 // the rice plots: { p, list: [{ x, y, z, rot, s, tint }] }
    const wheat = [];                 // the wheat plots, the same
    const mud = new Soup();           // the floor of the rice paddies, seen once they are drained
    const rnd = (a, b) => Math.abs(Math.sin(a * 12.9898 + b * 78.233) * 43758.5453) % 1;
    const soil = new Soup(), earth = [1, 1, 1];
    for (const p of PADDIES) {
      const y = p.t;
      const t = 0.55, hgt = 0.34;
      for (const [cx, cz, sx, sz] of [[0, -p.d / 2, p.w + t, t], [0, p.d / 2, p.w + t, t], [-p.w / 2, 0, t, p.d], [p.w / 2, 0, t, p.d]]) {
        const b = new THREE.BoxGeometry(sx, hgt, sz, Math.max(1, Math.round(sx / 1.5)), 1, Math.max(1, Math.round(sz / 1.5)));
        // soften the bund into a rounded levee
        const pa = b.attributes.position;
        for (let i = 0; i < pa.count; i++) if (pa.getY(i) > 0) { pa.setX(i, pa.getX(i) * (sx > sz ? 1 : 0.7)); pa.setZ(i, pa.getZ(i) * (sz > sx ? 1 : 0.7)); }
        b.translate(p.x + cx, y + hgt / 2 - 0.05, p.z + cz);
        bunds.push(b.toNonIndexed());
      }
      world.splat.paintRect(p.x, p.z, p.w / 2 + 0.6, p.d / 2 + 0.6, 0, 3, 0, 0.8);
      if (VEG_BEDS.has(p.id)) {
        // a dry bed: tilled earth, ridges running north-south, greens and radishes in alternate rows
        const x0 = p.x - p.w / 2, x1 = p.x + p.w / 2, z0 = p.z - p.d / 2, z1 = p.z + p.d / 2, ys = y + 0.09;
        soil.quad([x0, ys, z0], [x0, ys, z1], [x1, ys, z0], [x1, ys, z1], earth.map(v => v * 0.86));
        for (const row of bedRows(p, opt.vegSpacing)) {
          // the hillside's foot covers the uphill edge of some plots: nothing is planted under the turf
          if (world.heightAt(row.x, p.z) > ys + 0.1) continue;
          ridge(soil, row.x, ys, row.z0, row.z1, 0.82, 0.17, earth);
          row.plants.forEach((z, k) => {
            const rnd = Math.abs(Math.sin(row.x * 12.9898 + z * 78.233) * 43758.5453) % 1;
            (row.kind === 'leafy' ? leafy : radish).push({ x: row.x + (rnd - 0.5) * 0.1, y: ys + 0.14, z, rot: rnd * 6.28, s: 0.86 + ((k * 7 + Math.round(row.x * 3)) % 5) * 0.07 });
          });
        }
        continue;
      }
      if (WHEAT_FIELDS.has(p.id)) {
        // a dry field: lighter, finer earth drilled in close rows running north-south, a tuft of wheat every few hands
        const x0 = p.x - p.w / 2, x1 = p.x + p.w / 2, z0 = p.z - p.d / 2, z1 = p.z + p.d / 2, ys = y + 0.09, dry = [1.16, 1.08, 0.92];
        soil.quad([x0, ys, z0], [x0, ys, z1], [x1, ys, z0], [x1, ys, z1], dry.map(v => v * 0.9));
        const rows = wheatRows(p, opt.wheatStepX, opt.wheatStepZ), list = [];
        for (const row of rows) {
          if (world.heightAt(row.x, p.z) > ys + 0.1) continue;      // under the turf at the hillside's foot
          ridge(soil, row.x, ys, z0 + 0.5, z1 - 0.5, (p.w - 1.5) / (rows.length - 1) * 0.92, 0.05, dry);
          row.plants.forEach((z, k) => {
            const u = rnd(row.x, z), v = rnd(z, row.x + k);
            list.push({ x: row.x + (u - 0.5) * 0.07, y: ys + 0.03, z: z + (v - 0.5) * 0.12, rot: u * 6.28, s: 0.86 + v * 0.3, tint: 0.88 + u * 0.2 });
          });
        }
        if (list.length) wheat.push({ p, list });
        continue;
      }
      waters.push(new THREE.PlaneGeometry(p.w, p.d).rotateX(-Math.PI / 2).translate(p.x, y + 0.08, p.z));
      // the paddy floor in a few uneven patches of mud (hidden under the water until the paddy is drained)
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
        const ax = p.x - p.w / 2 + a * p.w / 3, bz = p.z - p.d / 2 + b * p.d / 3, c = 0.9 + rnd(ax, bz) * 0.2, ym = y + 0.07;
        mud.quad([ax, ym, bz], [ax, ym, bz + p.d / 3], [ax + p.w / 3, ym, bz], [ax + p.w / 3, ym, bz + p.d / 3], [c, c, c]);
      }
      // hills of rice in rows both ways, as they are set out by hand along a string (Low: a little wider apart)
      const stepX = opt.riceStepX, stepZ = opt.riceStepZ, rice = [];
      for (let ix = 0.6; ix < p.w - 0.3; ix += stepX) for (let iz = 0.55; iz < p.d - 0.3; iz += stepZ) {
        const u = rnd(p.x + ix, p.z + iz), v = rnd(p.z + iz * 3, p.x + ix);
        const rx = p.x - p.w / 2 + ix + (u - 0.5) * 0.09, rz = p.z - p.d / 2 + iz + (v - 0.5) * 0.07;
        if (world.heightAt(rx, rz) > y + 0.2) continue;   // under the turf at the hillside's foot
        rice.push({ x: rx, z: rz, y: y + 0.02, rot: u * 6.28, s: 0.84 + v * 0.3, tint: 0.86 + u * 0.22 });
      }
      if (rice.length) plots.push({ p, list: rice });
    }
    this.water = new THREE.Mesh(mergeGeometries(waters), this.waterMat);
    this.water.receiveShadow = true;
    this.water.renderOrder = 1;
    this.bunds = new THREE.Mesh(mergeGeometries(bunds.map(b => { b.deleteAttribute('uv'); return b; })), bundMat);
    this.bunds.receiveShadow = true;
    this.bunds.castShadow = true;
    this.soil = new THREE.Mesh(soil.geometry(), this.soilMat);
    this.soil.name = 'vegetable-beds';
    this.soil.receiveShadow = true;
    // the paddy floor: out of sight under the water, shown when the paddies are drained
    this.mudMat = patchMaterial(new THREE.MeshStandardMaterial({ color: '#7b5a3a', roughness: 1, vertexColors: true }));
    this.mud = new THREE.Mesh(mud.geometry(), this.mudMat);
    this.mud.name = 'paddy-mud';
    this.mud.receiveShadow = true;
    this.mud.visible = false;
    // the rice: one instanced mesh a plot (a plot behind the camera costs nothing), each with a fixed bound. Its grain
    // rides on the same instance matrices, so the heads are made without a buffer of their own. The shape of a plant
    // follows the season: the mesh is handed another geometry, the matrices are rewritten once.
    const riceGeo = this.riceGeo = { seedling: seedlingGeometry(), green: clumpGeometry(), stubble: stubbleGeometry() };
    riceGeo.golden = riceGeo.green;
    const wheatGeo = this.wheatGeo = { sprout: sproutGeometry(), green: wheatGeometry() };
    wheatGeo.golden = wheatGeo.green;
    const earGeo = earGeometry(), tint = new THREE.Color();
    const planted = (geo, mat, name, p, list, hue) => {
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      mesh.name = name;
      mesh.receiveShadow = true;
      // a little lighter or darker, greener or yellower, plant by plant: no two neighbours quite alike
      list.forEach((r, i) => mesh.setColorAt(i, tint.setRGB(r.tint * (1 + (r.s - 1) * hue), r.tint, r.tint * (1 - (r.s - 1) * hue))));
      mesh.instanceColor.needsUpdate = true;
      mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(p.x, p.t + 0.6, p.z), Math.hypot(p.w / 2, p.d / 2) + 0.8);
      return mesh;
    };
    this.plots = plots.map(({ p, list }) => {
      const rice = planted(riceGeo.seedling, this.riceMat, `rice:${p.id}`, p, list, 0.35);
      const ears = new THREE.InstancedMesh(earGeo, this.earMat, 0);
      ears.name = `rice-ears:${p.id}`;
      ears.instanceMatrix = rice.instanceMatrix;
      ears.count = list.length;
      ears.boundingSphere = rice.boundingSphere;
      ears.visible = false;
      this.group.add(rice, ears);
      return { id: p.id, rice, ears, list };
    });
    this.wheat = wheat.map(({ p, list }) => {
      const mesh = planted(wheatGeo.green, this.wheatMat, `wheat:${p.id}`, p, list, 0.3);
      this.group.add(mesh);
      return { id: p.id, mesh, list };
    });
    this.leafy = new THREE.InstancedMesh(leafyGeometry(), this.vegMat, Math.max(1, leafy.length));
    this.radish = new THREE.InstancedMesh(radishGeometry(), this.vegMat, Math.max(1, radish.length));
    this.leafyRecords = leafy;
    this.radishRecords = radish;
    this.leafy.receiveShadow = this.radish.receiveShadow = true;
    // a fixed bound for the vegetables too: the whole grid. (three.js measures an instanced mesh once, the first time
    // it is drawn, and the crops' matrices change with the season.)
    const box = new THREE.Box3();
    for (const p of PADDIES) { box.expandByPoint(_p.set(p.x - p.w / 2, p.t - 0.5, p.z - p.d / 2)); box.expandByPoint(_p.set(p.x + p.w / 2, p.t + 2, p.z + p.d / 2)); }
    const bound = box.getBoundingSphere(new THREE.Sphere());
    for (const m of [this.leafy, this.radish]) m.boundingSphere = bound;
    this.group.add(this.water, this.mud, this.bunds, this.soil, this.leafy, this.radish);
    // autumn: the plots already cut dry their sheaves on racks (one merged mesh, drawn in autumn only)
    const parts = [];
    for (const p of PADDIES.filter(q => CUT_IN_AUTUMN.has(q.id) && !VEG_BEDS.has(q.id) && !WHEAT_FIELDS.has(q.id))) harvestParts(p, p.t + 0.07, parts);
    this.strawMat = patchMaterial(new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide, vertexColors: true }));
    this.hay = new THREE.Mesh(parts.length ? mergeGeometries(parts.map(g => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('normal'); n.deleteAttribute('uv'); return n; })) : new THREE.BufferGeometry(), this.strawMat);
    if (parts.length) this.hay.geometry.computeVertexNormals();
    for (const g of parts) g.dispose();
    this.hay.name = 'rice-drying-racks';
    this.hay.castShadow = world.quality?.propShadows !== false;
    this.hay.receiveShadow = true;
    this.hay.visible = false;
    this.group.add(this.hay);
    this.buildLights();
  }

  /** Lantern posts and fairy lights round every plot (fields.js): one merged mesh of wood and wire, one of lights. */
  buildLights() {
    if (!this.options.lights) return;        // a tier may leave the festival lights out altogether (fieldLights: 0)
    const { posts, lanterns, wires } = fieldLights(PADDIES, (x, z) => this.world.heightAt(x, z), { bulbs: this.options.bulbs });
    const wood = [0.2, 0.09, 0.035], wire = [0.02, 0.014, 0.01];   // linear RGB
    const parts = [];
    for (const p of posts) parts.push(painted(new THREE.BoxGeometry(0.075, p.h, 0.075).translate(p.x, p.y + p.h / 2, p.z), wood));
    const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), q = new THREE.Quaternion();
    for (const [ax, ay, az, bx, by, bz] of wires) {
      dir.set(bx - ax, by - ay, bz - az);
      const len = dir.length();
      q.setFromUnitVectors(up, dir.normalize());
      parts.push(painted(new THREE.BoxGeometry(0.02, len + 0.01, 0.02).applyQuaternion(q).translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), wire));
    }
    const postMat = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    this.posts = new THREE.Mesh(mergeGeometries(parts), postMat);
    for (const p of parts) p.dispose();
    this.posts.name = 'field-light-posts';
    this.posts.receiveShadow = true;
    // the lights: paper by day (their own colour, unlit), glowing from dusk. uGlow follows the sky, read once a frame.
    this.glow = { value: 0 };
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65 });
    mat.onBeforeCompile = sh => {
      sh.uniforms.uLanternGlow = this.glow;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uLanternGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * uLanternGlow;');
    };
    patchMaterial(mat, { snow: 0 });
    mat.customProgramCacheKey = () => 'fx00-field-lights';
    this.lanternMat = mat;
    // all the lights are one instanced mesh; with the lighter shape for the small ones (Low) they are two
    const M = new THREE.Matrix4(), c = new THREE.Color(), one = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3();
    const light = this.options.lightGeometry === 'light';
    const sets = light ? [[lanterns.filter(l => l.big), lanternGeometry()], [lanterns.filter(l => !l.big), bulbGeometry()]] : [[lanterns, lanternGeometry()]];
    this.lightMeshes = sets.filter(([list]) => list.length).map(([list, geo], k) => {
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      mesh.name = k ? 'field-lights-small' : 'field-lights';
      list.forEach((l, i) => {
        const s = l.big ? 0.3 : 0.14;
        M.compose(P.set(l.x, l.y, l.z), one, S.set(s, s * (l.big ? 1.18 : 1), s));
        mesh.setMatrixAt(i, M);
        mesh.setColorAt(i, c.set(LIGHT_COLOURS[l.c]));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      return mesh;
    });
    this.lanterns = this.lightMeshes[0];
    const world = this.world;
    // how dark it is, worked out again only when the clock has moved (a twelfth of a minute) or the season changed:
    // the whole lighting table is heavy to ask every frame, and with the story's clock standing still it never changes
    let litSeason = '', litTick = -1, lit = 0;
    const glowNow = () => {
      const season = world.season || 'summer', tick = Math.round((world.hour ?? 10) * 720);
      if (litSeason !== season || litTick !== tick) { litSeason = season; litTick = tick; lit = lightGlow(lightingAt(season, tick / 720).night); }
      // a slow shimmer, like candle flames behind paper
      this.glow.value = lit * (2.5 + 0.2 * Math.sin(performance.now() * 0.0021));
    };
    for (const m of this.lightMeshes) m.onBeforeRender = glowNow;
    this.group.add(this.posts, ...this.lightMeshes);
  }

  setSeason(season) {
    const s = SEASON[season];
    if (!s || season === this.season) return;      // nothing to rewrite
    this.season = season;
    this.riceMat.color.set(s.rice);
    this.wheatMat.color.set(s.wheat);
    this.mudMat.color.set(s.mud);
    this.bundMat.color.set(s.bund);
    this.soilMat.color.set(s.soil);
    this.vegMat.color.setRGB(...s.veg);
    if (s.ear) this.earMat.color.set(s.ear);
    const M = _m, q = _q, up = _up, P = _p, S = _s, broad = this.options.broad;
    const write = (mesh, list, geo, [across, tall], spread) => {
      mesh.geometry = geo;
      for (let i = 0; i < list.length; i++) {
        const r = list[i], w = across * spread * (0.92 + (r.s - 0.84) * 0.5);
        q.setFromAxisAngle(up, r.rot);
        M.compose(P.set(r.x, r.y, r.z), q, S.set(w, tall * r.s, w));
        mesh.setMatrixAt(i, M);
      }
      mesh.instanceMatrix.needsUpdate = true;
    };
    // a plot is cut (stubble) or standing as a whole; only standing golden rice carries its grain
    for (const plot of this.plots) {
      const stage = season === 'autumn' && CUT_IN_AUTUMN.has(plot.id) ? 'stubble' : FIELD_YEAR.rice[season];
      // sparser tiers draw the grown plant broader, so the summer field still closes up; seedlings and stubble stay small
      write(plot.rice, plot.list, this.riceGeo[stage], RICE_SIZE[stage], stage === 'green' || stage === 'golden' ? broad : 1);
      plot.ears.visible = stage === 'golden' && !!s.ear && this.options.ears;
    }
    for (const plot of this.wheat) {
      const stage = FIELD_YEAR.wheat[season];
      write(plot.mesh, plot.list, this.wheatGeo[stage], WHEAT_SIZE[stage], stage === 'sprout' ? 1 : broad);
    }
    for (const [mesh, list, show] of [[this.leafy, this.leafyRecords, s.leafy], [this.radish, this.radishRecords, true]]) {
      list.forEach((r, i) => {
        q.setFromAxisAngle(up, r.rot);
        const k = s.vegSize * r.s;
        M.compose(P.set(r.x, r.y, r.z), q, S.set(k, k, k));
        mesh.setMatrixAt(i, M);
      });
      mesh.count = list.length;
      mesh.visible = show && list.length > 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.water.visible = s.water;
    this.mud.visible = !s.water;
    this.hay.visible = season === 'autumn';
  }
}
