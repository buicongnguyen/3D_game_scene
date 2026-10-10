import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { patchMaterial } from '../engine/effects.js';
import { PADDIES } from './layout.js';
import { lightingAt } from './seasons.js';
import { VEG_BEDS, CUT_IN_AUTUMN, LIGHT_COLOURS, bedRows, fieldLights, fieldOptions, lightGlow } from './fields.js';

/*
 * The field grid west of Kawabe: flooded rice paddies and a few dry vegetable beds, each inside its bund, with paper
 * lanterns on the corner posts and fairy lights strung along two sides. Everything is instanced or merged: the rice
 * of each plot is one draw call and its ears one (so plots out of view are not drawn), the two vegetables one each,
 * the soil, the posts and all the lights one each (two on Low, where the small lights are a lighter shape). Wind
 * comes from the shared foliage shader (effects.js); the lights glow at dusk and night from their own colour
 * (emissive, picked up by the bloom pass): there is not one real light among them.
 *
 * The year: spring = young shoots standing in water, seedlings in the beds; summer = tall green rice in ear, full
 * beds; autumn = golden rice (three plots already cut, with hay), full beds; winter = stubble, frosted soil and only
 * the hardy radish tops.
 */
const SEASON = {
  spring: { h: 0.5, wide: 1.25, rice: '#8fd34e', ear: null, bund: '#6e9c3a', water: true, cutAll: false, soil: '#5c3c24', veg: [1.08, 1.12, 0.82], vegSize: 0.5, leafy: true },
  summer: { h: 0.95, wide: 1, rice: '#3f9e3a', ear: '#b7d65a', bund: '#58903a', water: true, cutAll: false, soil: '#6b4729', veg: [1, 1, 1], vegSize: 1, leafy: true },
  autumn: { h: 1.0, wide: 1, rice: '#e6b33e', ear: '#ffd447', bund: '#9a8446', water: false, cutAll: false, soil: '#6e4a2c', veg: [1.02, 0.98, 0.8], vegSize: 1.08, leafy: true },
  winter: { h: 0.16, wide: 1, rice: '#b99a62', ear: null, bund: '#8f8068', water: false, cutAll: true, soil: '#5e4632', veg: [0.8, 0.9, 0.8], vegSize: 0.62, leafy: false },
};

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

/** One rice plant: a handful of thin arching leaves. */
function riceGeometry() {
  const pos = [], idx = [], uv = [];
  let base = 0;
  for (let b = 0; b < 7; b++) {
    const a = (b / 7) * Math.PI * 2 + b * 0.37;
    // leaves ~1 px wide at 15 m: a little wider, with a blunter taper, so swaying rice does not sparkle
    const h = 0.45 + (b % 3) * 0.08, w = 0.03, lean = 0.12 + (b % 2) * 0.08;
    const dx = Math.cos(a), dz = Math.sin(a), sx = -dz, sz = dx;
    for (let s = 0; s <= 3; s++) {
      const t = s / 3, ww = w * (1 - t * 0.7);
      const cx = dx * lean * t * t, cz = dz * lean * t * t, cy = h * t;
      pos.push(cx - sx * ww, cy, cz - sz * ww, cx + sx * ww, cy, cz + sz * ww);
      uv.push(0, t, 1, t);
    }
    for (let s = 0; s < 3; s++) { const i = base + s * 2; idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); }
    base += 8;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** The ears of one rice plant: a drooping grain head at the tip of every other leaf (same frame as riceGeometry). */
function earGeometry() {
  const s = new Soup(), c = [1, 1, 1];
  for (let b = 0; b < 7; b += 2) {
    const a = (b / 7) * Math.PI * 2 + b * 0.37, h = 0.45 + (b % 3) * 0.08, lean = 0.12 + (b % 2) * 0.08;
    const dx = Math.cos(a), dz = Math.sin(a), sx = -dz, sz = dx;
    const at = (r, y) => [dx * (lean + r), h + y, dz * (lean + r)];
    const p0 = at(-0.02, -0.02), p1 = at(0.08, 0.035), p2 = at(0.2, -0.07), w = 0.034;
    s.tri(p0, [p1[0] - sx * w, p1[1], p1[2] - sz * w], [p1[0] + sx * w, p1[1], p1[2] + sz * w], c);
    s.tri([p1[0] - sx * w, p1[1], p1[2] - sz * w], p2, [p1[0] + sx * w, p1[1], p1[2] + sz * w], c);
    s.tri(p0, [p1[0], p1[1] + w, p1[2]], [p1[0], p1[1] - w, p1[2]], c);
    s.tri([p1[0], p1[1] + w, p1[2]], p2, [p1[0], p1[1] - w, p1[2]], c);
  }
  return s.geometry();
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
    this.riceMat = patchMaterial(new THREE.MeshStandardMaterial({ color: '#8fd34e', roughness: 0.75, side: THREE.DoubleSide }), { wind: 2 });
    this.earMat = patchMaterial(new THREE.MeshStandardMaterial({ color: '#ffd447', roughness: 0.6, side: THREE.DoubleSide, vertexColors: true }), { wind: 2 });
    this.vegMat = patchMaterial(new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide, vertexColors: true }), { wind: 2 });
    this.soilMat = patchMaterial(new THREE.MeshStandardMaterial({ color: '#6b4729', roughness: 1, vertexColors: true }));
    const bundMat = this.bundMat = patchMaterial(new THREE.MeshStandardMaterial({ color: '#7f8f3c', roughness: 0.95 }));
    const bunds = [], waters = [];
    const leafy = [], radish = [];
    const plots = [];                 // the rice plots: { p, list: [{ x, y, z, rot }] }
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
      waters.push(new THREE.PlaneGeometry(p.w, p.d).rotateX(-Math.PI / 2).translate(p.x, y + 0.08, p.z));
      // low quality plants the rice a little wider apart (about 40 % fewer plants)
      const stepX = opt.riceStepX, stepZ = opt.riceStepZ, rice = [];
      for (let ix = 0.6; ix < p.w - 0.3; ix += stepX) for (let iz = 0.55; iz < p.d - 0.3; iz += stepZ) {
        const rx = p.x - p.w / 2 + ix + (Math.sin(ix * 7 + iz) * 0.05), rz = p.z - p.d / 2 + iz;
        if (world.heightAt(rx, rz) > y + 0.2) continue;   // under the turf at the hillside's foot
        rice.push({ x: rx, z: rz, y: y + 0.02, rot: (ix * 13.7 + iz * 7.1) % 6.28 });
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
    // the rice: one instanced mesh a plot (a plot behind the camera costs nothing), each with a fixed bound. Its ears
    // ride on the same instance matrices, so they are made without a buffer of their own.
    const riceGeo = riceGeometry(), earGeo = earGeometry();
    this.plots = plots.map(({ p, list }) => {
      const rice = new THREE.InstancedMesh(riceGeo, this.riceMat, list.length);
      rice.name = `rice:${p.id}`;
      rice.receiveShadow = true;
      const ears = new THREE.InstancedMesh(earGeo, this.earMat, 0);
      ears.instanceMatrix = rice.instanceMatrix;
      ears.count = list.length;
      rice.boundingSphere = ears.boundingSphere = new THREE.Sphere(new THREE.Vector3(p.x, p.t + 0.6, p.z), Math.hypot(p.w / 2, p.d / 2) + 0.8);
      this.group.add(rice, ears);
      return { id: p.id, rice, ears, list };
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
    this.group.add(this.water, this.bunds, this.soil, this.leafy, this.radish);
    // autumn: the plots already cut get drying hay
    this.hay = new THREE.Group();
    for (const p of PADDIES.filter(q => CUT_IN_AUTUMN.has(q.id))) {
      for (let k = 0; k < 2; k++) {
        const h = assets.clone('haybale');
        if (!h) continue;
        h.position.set(p.x - 2 + k * 3.6, p.t, p.z + (k ? 1.4 : -1.2));
        h.rotation.y = k * 1.3 + p.x;
        this.hay.add(h);
      }
    }
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
    this.bundMat.color.set(s.bund);
    this.soilMat.color.set(s.soil);
    this.vegMat.color.setRGB(...s.veg);
    if (s.ear) this.earMat.color.set(s.ear);
    const M = _m, q = _q, up = _up, P = _p, S = _s;
    // a plot is cut (stubble) or standing as a whole; only standing rice carries ears
    for (const plot of this.plots) {
      const cut = s.cutAll || (season === 'autumn' && CUT_IN_AUTUMN.has(plot.id));
      const h = cut ? (season === 'winter' ? 0.16 : 0.22) : s.h, wide = cut ? 1 : s.wide;
      plot.list.forEach((r, i) => {
        q.setFromAxisAngle(up, r.rot);
        M.compose(P.set(r.x, r.y, r.z), q, S.set(wide, h, wide));
        plot.rice.setMatrixAt(i, M);
      });
      plot.rice.instanceMatrix.needsUpdate = true;
      plot.ears.visible = !!s.ear && !cut && this.options.ears;
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
    this.hay.visible = season === 'autumn';
  }
}
