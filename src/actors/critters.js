// The valley's small living things: crickets singing in the grass, spiders on their webs under the eaves, on fences and
// between forest trees, ladybugs on flowers and bushes, dragonflies darting over the river and the rice paddies, and
// butterflies drifting over meadows and gardens, and frogs on the paddy bunds and the river banks that sing at dusk
//   in spring and summer and plop into the water when Mika runs up.
//
// Cheap by construction (see the lightweight-game-objects skill):
// - Where they live is planned once, as plain data (planCritters, Node-testable), with its own seeded RNG.
// - Each kind draws from a small pool of model clones. A few times a second the pool is handed to the nearest present
//   critters within DRAW m of Mika; everything else is just numbers. So the draw-call cost is capped by the pools,
//   however many critters live in the valley. Clones animate only within ANIM m and never cast shadows.
// - The webs are static: one InstancedMesh per web part, refilled with the webs near Mika.
// - Season and hour decide who is out (game.shownSeason / game.shownHour()): crickets sing at dusk and at night,
//   ladybugs, dragonflies and butterflies keep to the day, and in winter everyone is tucked away.
// - No allocation per frame. A model that is not there yet (art in progress) is simply skipped.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Animator } from './animator.js';
import { rng } from '../engine/spline.js';
import { BUILDINGS, PADDIES, PLACES, ORCHARD_FENCE, river, riverHalfWidth } from '../world/layout.js';
import { FOOTPRINT } from '../world/structures.js';
import { placeProblems, doorPoint } from '../world/roads.js';
import { VEG_BEDS } from '../world/fields.js';

export const DRAW = 45;          // critters are drawn within this distance of Mika (m): a 15 cm bug is a few pixels there
export const ANIM = 32;          // ...and move and animate within this one
const WEB_DRAW = 55;

/**
 * Who lives here: model, pool size (most clones drawn at once), size, and how present they are by season and hour.
 * The models are true to life (a 1.3 cm ladybug, a 6 cm butterfly), so they are drawn a few times larger to read on a
 * phone screen at a few metres.
 */
export const CRITTER_KINDS = {
  cricket: { model: 'cricket', pool: 5, scale: 2.4, seasons: { spring: 0.4, summer: 1, autumn: 0.9, winter: 0 }, day: 0.45, night: 1 },
  spider: { model: 'spider', web: 'spider-web', pool: 4, scale: 2.6, seasons: { spring: 0.8, summer: 1, autumn: 1, winter: 0 }, day: 1, night: 1 },
  ladybug: { model: 'ladybug', pool: 4, scale: 6, seasons: { spring: 1, summer: 1, autumn: 0.6, winter: 0 }, day: 1, night: 0 },
  dragonfly: { model: 'dragonfly', pool: 4, scale: 2.6, seasons: { spring: 0.3, summer: 1, autumn: 0.9, winter: 0 }, day: 1, night: 0 },
  butterfly: { model: 'butterfly', pool: 6, scale: 2.8, seasons: { spring: 1, summer: 1, autumn: 0.4, winter: 0 }, day: 1, night: 0 },
  // two looks (7 cm brown pond frog, 4 cm green tree frog) share one pool, drawn 2.6x like the other critters
  frog: { model: 'frog-pond', models: ['frog-pond', 'frog-tree'], pool: 6, scale: 2.6, seasons: { spring: 0.9, summer: 1, autumn: 0.25, winter: 0 }, day: 0.35, night: 1 },
};
/** Croaks per minute for one frog at this hour: a swell at dusk (18:00-22:30), a murmur through the night, little by day. */
export function croakRate(hour) {
  const dusk = Math.max(0, 1 - Math.abs(hour - 20.2) / 2.2);
  const night = hour >= 22 || hour < 5 ? 0.45 : 0;
  return 1 + 11 * Math.max(dusk, night);
}
/** Wing colours for the butterflies (the model's tintable material is 'Butterfly wing'). */
export const BUTTERFLY_TINTS = ['#ffffff', '#ffb13b', '#8fd0ff', '#ffe36b', '#ff9ec4'];

/** 0..1: how much of the day it is (1 from 7:00 to 18:00, ramping over an hour at dawn and dusk). */
export function daylight(hour) {
  const up = Math.min(1, Math.max(0, hour - 6)), down = Math.min(1, Math.max(0, 19 - hour));
  return Math.min(up, down);
}
/** The share (0..1) of a kind's critters that are out in this season at this hour. */
export function presence(kind, season, hour) {
  const k = CRITTER_KINDS[kind], d = daylight(hour);
  return (k.seasons[season] ?? 0) * (k.day * d + k.night * (1 - d));
}

// where they live
const MEADOWS = [[-70, -20, 22], [-74, 62, 16], [-40, 70, 14], [60, 10, 18], [84, 30, 12], [140, -30, 16], [-58, 126, 10],
  [70, -55, 16], [-30, -70, 14], [-100, 92, 14]];
const VILLAGES = [[-45, 20, 70], [115, 6, 60], [-60, 140, 30], [72, -48, 34], [-98, 112, 26], [-15, -40, 20]];
const EAVES = ['kw1', 'kw3', 'kw5', 'kw7', 'kw8', 'otaHouse', 'tk1', 'tk3', 'tk5', 'tk6', 'cottage'];
const FOREST_TRAILS = [[-44, -92], [-30, -106], [-48, -62], [62, -122], [53, -121], [100, -96], [-50, -140]];

const near = (x, z, list) => list.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r);

/**
 * Plan every critter's home (pure; the same valley every time). placed: the scenery plan ({ flowers, bushes, trees });
 * grid: { heightAt, slopeAt }; topOf(model) → height of a flower or bush model at scale 1 (for perching on top).
 * Returns { cricket: [...], spider: [...], ladybug: [...], dragonfly: [...], butterfly: [...] } of plain slots.
 */
export function planCritters(placed, grid, topOf = () => 0.6, seed = 5150) {
  const R = rng(seed);
  const ok = (x, z) => !placeProblems(x, z, grid).length;
  const out = { cricket: [], spider: [], ladybug: [], dragonfly: [], butterfly: [], frog: [] };
  const slot = (kind, x, y, z, extra) => {
    const s = { kind, i: out[kind].length, hx: x, hy: y, hz: z, x, y, z, face: R() * Math.PI * 2, luck: R(), ph: R() * 10,
      st: 'idle', t: R() * 3, u: 0, dur: 0, fx: 0, fy: 0, fz: 0, tx: 0, ty: 0, tz: 0, arc: 0, d: 1e9, want: false, vis: null, hold: 0, ...extra };
    out[kind].push(s);
    return s;
  };
  // crickets in the long grass of the meadows round the villages
  for (const [cx, cz, r] of MEADOWS) {
    for (let n = 0, k = 0; n < 5 && k < 40; k++) {
      const x = cx + (R() - 0.5) * 2 * r, z = cz + (R() - 0.5) * 2 * r;
      if (!ok(x, z)) continue;
      slot('cricket', x, grid.heightAt(x, z), z, { pitch: 0.92 + R() * 0.16 });
      n++;
    }
  }
  // spider webs: across a front corner under the eaves (away from the door), on fences, and between forest trees
  for (const id of EAVES) {
    const b = BUILDINGS.find(q => q.id === id), fp = FOOTPRINT[b?.model];
    if (!fp) continue;
    const door = doorPoint(id), r = b.rot * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    const front = Math.cos(door.face - r) > 0 ? 1 : -1;
    let best = null;
    for (const side of [-1, 1]) {
      const lx = side * (fp[0] / 2 + 0.25), lz = front * (fp[1] / 2 + 0.25);
      const x = b.x + lx * c + lz * s, z = b.z - lx * s + lz * c;
      const dd = Math.hypot(x - door.x, z - door.z);
      if (!best || dd > best.dd) best = { x, z, dd, lx, lz };
    }
    const { x, z } = best;
    const h = grid.heightAt(x, z);
    if (h < 0.8) continue;
    // the web spans the corner diagonally: its face looks out along the corner's diagonal
    const ox = Math.sign(best.lx) * c + front * s, oz = -Math.sign(best.lx) * s + front * c;
    slot('spider', x, h + 1.9, z, { ry: Math.atan2(ox, oz), webR: 0.42 });
  }
  const F = ORCHARD_FENCE;
  for (const x of [21, 47, 121, 163]) {
    const h = grid.heightAt(x, F.z);
    if (h > 0.8) slot('spider', x, h + 0.72, F.z, { ry: 0, webR: 0.3 });
  }
  slot('spider', -64, grid.heightAt(-64, 133) + 0.7, 133, { ry: Math.PI / 2, webR: 0.3 });  // the bamboo fence by the cottage
  const trees = (placed.trees || []).filter(t => !t.far && !t.orchard && !t.story && near(t.x, t.z, FOREST_TRAILS.map(([x, z]) => [x, z, 22])));
  let pairs = 0;
  for (let a = 0; a < trees.length && pairs < 6; a++) {
    for (let b = a + 1; b < trees.length; b++) {
      const A = trees[a], B = trees[b], gap = Math.hypot(A.x - B.x, A.z - B.z);
      if (gap < 2.2 || gap > 3.6) continue;
      const x = (A.x + B.x) / 2, z = (A.z + B.z) / 2, h = grid.heightAt(x, z);
      if (h < 0.8 || out.spider.some(w => Math.hypot(w.hx - x, w.hz - z) < 14)) continue;
      // the web hangs across the gap: its face looks across the line between the trunks
      slot('spider', x, h + 1.4, z, { ry: Math.atan2(B.z - A.z, -(B.x - A.x)), webR: 0.42 });
      pairs++;
      break;
    }
  }
  // ladybugs on the flowers and bushes round the villages; each knows two neighbouring perches to fly to
  const perches = [];
  for (const f of placed.flowers || []) if (near(f.x, f.z, VILLAGES)) perches.push({ x: f.x, y: f.y + topOf(f.model) * f.s, z: f.z, flower: true });
  for (const b of placed.bushes || []) if (near(b.x, b.z, VILLAGES)) perches.push({ x: b.x, y: b.y + topOf(b.model) * b.s, z: b.z, flower: false });
  const neighbours = (p, n, r, filter) => perches.filter(q => q !== p && (!filter || filter(q)) && Math.hypot(q.x - p.x, q.z - p.z) < r)
    .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)).slice(0, n);
  const pick = (n, minGap, kind) => {
    const chosen = [];
    for (let k = 0; k < perches.length * 2 && chosen.length < n; k++) {
      const p = perches[Math.floor(R() * perches.length)];
      if (chosen.some(q => Math.hypot(q.x - p.x, q.z - p.z) < minGap) || out[kind === 'ladybug' ? 'butterfly' : 'ladybug'].some(q => q.hx === p.x && q.hz === p.z)) continue;
      chosen.push(p);
    }
    return chosen;
  };
  for (const p of pick(30, 6, 'ladybug')) slot('ladybug', p.x, p.y, p.z, { perches: [p, ...neighbours(p, 2, 10)], at: 0 });
  // butterflies over the meadows and gardens: an anchor to wander round and up to four flowers to rest on
  for (const p of pick(30, 9, 'butterfly')) {
    const s = slot('butterfly', p.x, p.y + 1, p.z, { perches: [p, ...neighbours(p, 3, 8, q => q.flower)], at: 0, tint: out.butterfly.length % BUTTERFLY_TINTS.length, hd: R() * 6.28 });
    s.st = 'fly';
    s.t = 3 + R() * 8;
  }
  // dragonflies along the river near the banks (Kawabe to the stepping stones) and over the rice paddies
  for (let z = -116; z <= 70; z += 13) {
    const w = river.nearest(10, z, 80);
    if (!w) continue;
    const p = river.at(w.s), side = (out.dragonfly.length % 2) ? 1 : -1, off = Math.max(1, riverHalfWidth(p.z) - 1.6) * side;
    slot('dragonfly', p.x - p.tz * off, 0.95, p.z + p.tx * off, {});
  }
  for (const p of PADDIES) slot('dragonfly', p.x, p.t + 0.85, p.z, { paddy: true });
  // frogs: two on the bunds of every paddy (diving into the paddy water), and on the low river banks (into the river)
  for (const p of PADDIES) {
    for (let n = 0; n < 2; n++) {
      const side = Math.floor(R() * 4), u = (R() - 0.5) * 0.8;
      const ex = side < 2 ? u * p.w : (side === 2 ? -0.5 : 0.5) * p.w, ez = side < 2 ? (side === 0 ? -0.5 : 0.5) * p.d : u * p.d;
      const ix = side < 2 ? 0 : -Math.sign(ex), iz = side < 2 ? -Math.sign(ez) : 0;
      const frog = { tree: R() < 0.35, pitch: 0.85 + R() * 0.3, wx: p.x + ex + ix * 0.9, wy: p.t + 0.06, wz: p.z + ez + iz * 0.9 };
      // the dry vegetable beds (world/fields.js) have no water to dive into: no frogs there (the dice are still rolled)
      if (!VEG_BEDS.has(p.id)) slot('frog', p.x + ex, p.t + 0.29, p.z + ez, frog);
    }
  }
  for (let z = -100; z <= 66; z += 15) {
    const w = river.nearest(10, z, 80);
    if (!w) continue;
    const c = river.at(w.s);
    for (const side of [-1, 1]) {
      for (let k = 0; k < 8; k++) {
        const off = (riverHalfWidth(c.z) - 1 + k * 0.7) * side, x = c.x - c.tz * off, zz = c.z + c.tx * off, h = grid.heightAt(x, zz);
        if (h < 0.04 || h > 0.8 || placeProblems(x, zz, grid).some(q => !q.startsWith('wet') && q !== 'on the river')) continue;
        const wo = off - 1.4 * side;
        slot('frog', x, h, zz, { tree: R() < 0.2, pitch: 0.85 + R() * 0.3, wx: c.x - c.tz * wo, wy: -0.04, wz: c.z + c.tx * wo });
        break;
      }
    }
  }
  return out;
}

const V = () => new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = V();
const _x = V(), _y = V(), _z = V();
const byD = (a, b) => a.d - b.d;
const ease = u => 1 - (1 - u) * (1 - u);

export class Critters {
  constructor(scene, assets, world) {
    this.scene = scene;
    this.assets = assets;
    this.world = world;
    this.R = rng(777);
    this.planned = false;
    this.slots = null;
    this.pools = {};           // kind -> [visual]
    this.visuals = [];         // every pooled visual (what the director may befriend)
    this.cand = [];            // scratch
    this.assignT = 0;
    this.stillT = 0;
    this.chorusT = 2;
    this.frogChorusT = 1;
    this.nearFrogs = 0;
    this.nearestFrog = 1e9;
    this.nearCrickets = 0;
    this.nearestCricket = 1e9;
    this.visitor = null;
    this.webs = null;
  }

  /** How tall a scatter model stands (for perching on its top). */
  topOf(model) {
    const g = this.assets.gltf?.(model);
    if (!g) return 0.6;
    return new THREE.Box3().setFromObject(g.scene).max.y;
  }

  plan(game) {
    this.planned = true;
    const grid = this.world.grid;
    const tops = {};
    this.slots = planCritters(game.placed || {}, grid, m => (tops[m] ??= this.topOf(m)));
    for (const [kind, def] of Object.entries(CRITTER_KINDS)) {
      const models = (def.models || [def.model]).filter(m => this.assets.has(m));
      if (!models.length || (def.web && !this.assets.has(def.web))) continue;
      if (def.web && !this.makeWebs(def)) continue;
      const quality = game.renderer?.q?.name === 'Low' ? 0.6 : 1;
      const pool = this.pools[kind] = [];
      for (let i = 0; i < Math.max(2, Math.round(def.pool * quality)); i++) {
        const v = this.makeVisual(kind, def, models[i % models.length]);
        if (!v) break;
        pool.push(v);
        this.visuals.push(v);
      }
    }
  }

  /**
   * Bake colours: the opaque parts of a critter (body, eyes, markings) differ only in colour, so they become one mesh
   * with the colours in its vertices and one material — one draw instead of three. See-through parts (wings, which
   * the butterflies also tint) stay separate. The merged geometry and material are shared by every clone of a kind.
   */
  bake(kind, m) {
    const parts = [];
    m.traverse(o => { if (o.isSkinnedMesh && !Array.isArray(o.material)) parts.push(o); });
    const keep = o => o.material.transparent || o.material.name === 'Butterfly wing' || o.material.map;
    const solid = parts.filter(o => !keep(o));
    if (solid.length < 2 || solid.some(o => o.skeleton !== solid[0].skeleton)) return;
    const cache = (this.baked ??= {});
    if (!cache[kind]) {
      const geos = solid.map(o => {
        const g = o.geometry.clone(), n = g.attributes.position.count, col = new Float32Array(n * 3), c = o.material.color;
        const had = g.attributes.color;
        for (let i = 0; i < n; i++) {
          col[i * 3] = c.r * (had ? had.getX(i) : 1); col[i * 3 + 1] = c.g * (had ? had.getY(i) : 1); col[i * 3 + 2] = c.b * (had ? had.getZ(i) : 1);
        }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k);
        g.morphAttributes = {};
        return g;
      });
      const geometry = mergeGeometries(geos, false);
      if (!geometry) return;
      const material = solid[0].material.clone();
      material.name = `${kind} baked`;
      material.color.set('#ffffff');
      material.vertexColors = true;
      cache[kind] = { geometry, material };
    }
    solid[0].geometry = cache[kind].geometry;
    solid[0].material = cache[kind].material;
    for (const o of solid.slice(1)) o.removeFromParent();
  }

  makeVisual(kind, def, model = def.model) {
    const m = this.assets.clone(model);
    if (!m) return null;
    const root = new THREE.Group();
    root.name = `critter:${kind}`;
    if (def.size) {
      const sz = new THREE.Box3().setFromObject(m).getSize(V());
      m.scale.multiplyScalar(def.size / (Math.max(sz.x, sz.z) || def.size));
    } else m.scale.multiplyScalar(def.scale);
    // (the bake needs the parts to share a skeleton, which they do since Assets.clone shares them; it changes the
    // roughness of small parts a little, so it is kept to the tiers that merge characters)
    if (this.world.quality?.mergeChars) { try { this.bake(model, m); } catch (e) { console.warn(`critter bake skipped for ${kind}`, e); } }
    const wings = [];
    m.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = false;                       // too small to matter in the shadow map
      if ([o.material].flat().some(x => x?.name === 'Butterfly wing')) wings.push(o);
    });
    root.add(m);
    root.visible = false;
    this.scene.add(root);
    const anim = m.userData.clips?.length ? new Animator(m) : null;
    const v = {
      kind, look: model, root, model: m, anim, wings, pos: root.position, visible: true, idleClip: 'Idle', slot: null, near: false, clip: '', chirpT: 1 + Math.random() * 6,
      lookAt() {},                                // critters do not turn to face Mika; they have their own business
      hold: () => { if (v.slot) v.slot.hold = 4; },
    };
    if (kind === 'butterfly' && wings.length && !this.wingMats) {
      const base = [wings[0].material].flat().find(x => x.name === 'Butterfly wing');
      this.wingMats = BUTTERFLY_TINTS.map(c => { const w = base.clone(); w.color.multiply(new THREE.Color(c)); return w; });
    }
    return v;
  }

  /** One InstancedMesh per part of the (static) web model; filled with the webs near Mika in assign(). */
  makeWebs(def) {
    const parts = this.assets.parts(def.web);
    if (!parts.length) return false;
    const box = new THREE.Box3();
    for (const p of parts) { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox.clone().applyMatrix4(p.matrix)); }
    const size = box.getSize(V()), centre = box.getCenter(V());
    // the web's thinnest axis is its face normal: turn it to +Z, centre it, and size it to the slot's radius
    const axis = size.x <= size.y && size.x <= size.z ? 'x' : size.y <= size.z ? 'y' : 'z';
    const pre = new THREE.Matrix4();
    if (axis === 'x') pre.makeRotationY(-Math.PI / 2);
    else if (axis === 'y') pre.makeRotationX(Math.PI / 2);
    const plane = axis === 'x' ? Math.min(size.y, size.z) : axis === 'y' ? Math.min(size.x, size.z) : Math.min(size.x, size.y);
    const base = new THREE.Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z);
    const n = this.slots.spider.length;
    const meshes = parts.map(p => {
      const im = new THREE.InstancedMesh(p.geometry, p.material, n);
      im.name = 'critter:spider-web';
      im.castShadow = false;
      im.receiveShadow = false;
      im.count = 0;
      im.frustumCulled = true;
      im.userData.local = pre.clone().multiply(base).multiply(p.matrix);
      this.scene.add(im);
      return im;
    });
    this.webs = { meshes, plane: plane / 2 || 0.4, shown: -1 };
    return true;
  }

  /** Fill the web instances with the webs within WEB_DRAW m (only when the set changes). */
  showWebs(p, on) {
    const W = this.webs;
    if (!W) return;
    let key = 0, n = 0;
    if (on) for (const s of this.slots.spider) if (Math.hypot(s.hx - p.x, s.hz - p.z) < WEB_DRAW) key += 1 << (s.i % 30), n++;
    if (key === W.shown && n === W.n) return;
    W.shown = key; W.n = n;
    for (const im of W.meshes) {
      let k = 0;
      if (on) for (const s of this.slots.spider) {
        if (Math.hypot(s.hx - p.x, s.hz - p.z) >= WEB_DRAW) continue;
        const sc = s.webR / W.plane;
        _q.setFromAxisAngle(_y.set(0, 1, 0), s.ry);
        _m.compose(_p.set(s.hx, s.hy, s.hz), _q, _s.set(sc, sc, sc)).multiply(im.userData.local);
        im.setMatrixAt(k++, _m);
      }
      im.count = k;
      im.instanceMatrix.needsUpdate = true;
      im.boundingSphere = null;
      if (k) im.computeBoundingSphere();
      im.visible = k > 0;
    }
  }

  // ---------------------------------------------------------------- pooling
  bind(v, s) {
    v.slot = s; s.vis = v;
    v.root.visible = true;
    v.clip = '';
    if (v.kind === 'butterfly' && this.wingMats) for (const w of v.wings) w.material = this.wingMats[s.tint];
    if (v.kind === 'spider') this.placeSpider(v, s); else this.place(v, s);
    this.play(v, this.restClip(v.kind, s));
  }

  unbind(v) {
    if (this.visitor === v.slot) this.visitor = null;
    if (v.slot) v.slot.vis = null;
    v.slot = null;
    v.near = false;
    v.root.visible = false;
  }

  restClip(kind, s) {
    if (kind === 'dragonfly') return 'Fly';
    if (kind === 'butterfly') return s.st === 'rest' ? 'Rest' : 'Fly';
    if (kind === 'ladybug') return s.st === 'fly' ? 'Fly' : 'Idle';
    if (kind === 'spider') return s.st === 'walk' ? 'Walk' : 'Idle';
    if (kind === 'frog') return s.st === 'swim' ? 'Swim' : 'Idle';
    return 'Idle';
  }

  play(v, clip) {
    if (v.clip === clip || !v.anim?.has(clip)) return;
    v.clip = clip;
    v.anim.play(clip, { speed: 0.9 + (v.slot?.ph % 1) * 0.2 });
  }

  /** Hand each kind's pool to the nearest critters that are out at this season and hour. */
  assign(p, g) {
    const indoor = !!g.interiors?.active;
    const season = g.shownSeason || g.time?.season || 'spring', hour = g.shownHour ? g.shownHour() : 12;
    this.nearCrickets = 0; this.nearestCricket = 1e9; this.nearFrogs = 0; this.nearestFrog = 1e9;
    for (const kind in CRITTER_KINDS) {
      const slots = this.slots[kind], pool = this.pools[kind];
      const share = indoor ? 0 : presence(kind, season, hour);
      const cand = this.cand;
      cand.length = 0;
      for (const s of slots) {
        s.want = false;
        s.on = s.luck < share;
        s.d = Math.hypot(s.x - p.x, s.z - p.z);
        if (s.on && s.d < DRAW) cand.push(s);
      }
      if (kind === 'cricket') for (const s of cand) { this.nearCrickets++; if (s.d < this.nearestCricket) this.nearestCricket = s.d; }
      if (kind === 'frog') for (const s of cand) { this.nearFrogs++; if (s.d < this.nearestFrog) this.nearestFrog = s.d; }
      if (!pool) continue;
      cand.sort(byD);
      for (let i = 0; i < cand.length && i < pool.length; i++) cand[i].want = true;
      for (const v of pool) if (v.slot && !v.slot.want) this.unbind(v);
      for (let i = 0, j = 0; i < cand.length && i < pool.length; i++) {
        if (cand[i].vis) continue;
        while (j < pool.length && pool[j].slot) j++;
        if (j >= pool.length) break;
        this.bind(pool[j], cand[i]);
      }
      for (const v of pool) v.near = !!v.slot && v.slot.d < ANIM;
    }
    this.showWebs(p, !indoor && (CRITTER_KINDS.spider.seasons[season] ?? 0) > 0);
  }

  // ---------------------------------------------------------------- per frame
  update(dt, player, director) {
    const g = director?.game;
    if (!this.planned) { if (!g?.placed) return; this.plan(g); }
    const p = player.pos;
    if ((this.assignT -= dt) <= 0) { this.assignT = 0.25; this.assign(p, g); }
    this.stillT = player.speed < 0.2 && !player.swimming ? this.stillT + dt : 0;
    const night = g.night || 0, audio = director.audio;
    for (const v of this.visuals) {
      const s = v.slot;
      if (!s || !v.near) continue;
      s.ph += dt;
      if (s.hold > 0) s.hold -= dt;
      const dx = s.x - p.x, dz = s.z - p.z, d = Math.hypot(dx, dz);
      // Mika running close by, or walking right up to one, startles the jumpy ones (unless it is being befriended)
      const startled = s.hold <= 0 && (d < 1.2 && player.speed > 0.3 || d < 3.5 && player.speed > 3.2);
      if (v.kind === 'cricket') this.cricket(v, s, dt, startled, dx, dz, d, night, audio);
      else if (v.kind === 'spider') this.spider(v, s, dt);
      else if (v.kind === 'ladybug') this.ladybug(v, s, dt, startled);
      else if (v.kind === 'dragonfly') this.dragonfly(v, s, dt, player);
      else if (v.kind === 'frog') this.frog(v, s, dt, startled || d < 2.2 && player.speed > 2.2, d, audio, g);
      else this.butterfly(v, s, dt, startled || d < 2 && player.speed > 3.2 && s.hold <= 0);
      v.anim?.update(dt);
    }
    // a gentle chorus from the crickets further off, louder at night
    if (this.nearCrickets && (this.chorusT -= dt) <= 0) {
      const rate = (0.4 + night * 2.6) * Math.min(1, this.nearCrickets / 6);
      this.chorusT = (0.4 + Math.random()) / Math.max(0.1, rate);
      audio?.chirp?.((0.12 + night * 0.3) * Math.max(0, 1 - this.nearestCricket / DRAW), 0.9 + Math.random() * 0.25);
    }
    // ...and the frogs further off, swelling at dusk
    if (this.nearFrogs && (this.frogChorusT -= dt) <= 0) {
      const rate = croakRate(g.shownHour ? g.shownHour() : 12) / 60 * Math.min(4, this.nearFrogs);
      this.frogChorusT = (0.5 + Math.random()) / Math.max(0.02, rate);
      audio?.croak?.(0.35 * Math.max(0, 1 - this.nearestFrog / DRAW), 0.85 + Math.random() * 0.3, Math.random() < 0.3 ? 'tree' : 'pond');
    }
  }

  place(v, s) {
    v.root.position.set(s.x, s.y, s.z);
    v.root.rotation.set(0, s.face, 0);
  }

  /** Start a flight (or hop) from where the critter is to (tx, ty, tz) over `dur` s, arcing `arc` m up. */
  launch(s, tx, ty, tz, dur, arc) {
    s.fx = s.x; s.fy = s.y; s.fz = s.z; s.tx = tx; s.ty = ty; s.tz = tz;
    s.u = 0; s.dur = dur; s.arc = arc;
    s.face = Math.atan2(tx - s.x, tz - s.z);
  }

  /** Advance a flight; true when it has landed. */
  fly(s, dt, easeIt = true) {
    s.u = Math.min(1, s.u + dt / s.dur);
    const e = easeIt ? ease(s.u) : s.u;
    s.x = s.fx + (s.tx - s.fx) * e; s.z = s.fz + (s.tz - s.fz) * e;
    s.y = s.fy + (s.ty - s.fy) * e + Math.sin(Math.PI * s.u) * s.arc;
    return s.u >= 1;
  }

  cricket(v, s, dt, startled, dx, dz, d, night, audio) {
    if (s.st === 'hop') {
      if (this.fly(s, dt, false)) { s.st = 'idle'; s.t = 4 + Math.random() * 10; this.play(v, 'Idle'); }
    } else if (startled) {
      // hop away from Mika (back toward home when it has strayed)
      let ax = dx / (d || 1), az = dz / (d || 1);
      if (Math.hypot(s.x - s.hx, s.z - s.hz) > 6) { ax = s.hx - s.x; az = s.hz - s.z; const l = Math.hypot(ax, az) || 1; ax /= l; az /= l; }
      const r = 1.5 + Math.random(), j = (Math.random() - 0.5) * 0.8;
      const tx = s.x + (ax - az * j) * r, tz = s.z + (az + ax * j) * r;
      if (this.world.heightAt(tx, tz) > 0.8) this.hop(v, s, tx, tz);
    } else if ((s.t -= dt) <= 0) {
      const a = Math.random() * 6.28, tx = s.hx + Math.cos(a) * 2, tz = s.hz + Math.sin(a) * 2;
      if (this.world.heightAt(tx, tz) > 0.8) this.hop(v, s, tx, tz); else s.t = 3;
    }
    // chirping: more often at night; the nearer, the louder
    if ((v.chirpT -= dt) <= 0) {
      v.chirpT = night > 0.5 ? 1.5 + Math.random() * 4 : 5 + Math.random() * 10;
      if (s.st !== 'hop' && d < 28) {
        if (v.anim?.has('Chirp')) { v.clip = ''; v.anim.once('Chirp', { then: 'Idle' }); v.clip = 'Idle'; }
        audio?.chirp?.((1 - d / 28) ** 1.5, s.pitch);
      }
    }
    this.place(v, s);
  }

  hop(v, s, tx, tz) {
    this.launch(s, tx, this.world.heightAt(tx, tz), tz, 0.42, 0.32);
    s.st = 'hop';
    if (v.anim?.has('Hop')) { v.anim.once('Hop', { then: 'Idle', speed: 1.2 }); v.clip = 'Idle'; }
  }

  /** Sits on the bund or bank and sings; hops into the water when startled, swims a while, then climbs back. */
  frog(v, s, dt, startled, d, audio, g) {
    if (s.st === 'hop') {
      if (this.fly(s, dt, false)) {
        if (s.into) { s.st = 'swim'; s.t = 5 + Math.random() * 6; this.play(v, 'Swim'); audio?.plop?.(Math.max(0, 1 - d / 20)); }
        else { s.st = 'idle'; s.t = 3 + Math.random() * 8; this.play(v, 'Idle'); }
      }
    } else if (s.st === 'swim') {
      s.face += Math.sin(s.ph * 0.8) * dt * 0.6;
      s.y = s.wy - 0.02 + Math.sin(s.ph * 2) * 0.01;
      if ((s.t -= dt) <= 0 && d > 4) this.frogHop(v, s, s.hx, s.hy, s.hz, false);
    } else if (startled && s.hold <= 0) {
      this.frogHop(v, s, s.wx, s.wy - 0.02, s.wz, true);
    } else {
      if ((s.t -= dt) <= 0 && s.hold <= 0) {             // a little shuffle round its spot, facing the water
        const a = Math.random() * 6.28, tx = s.hx + Math.cos(a) * 0.4, tz = s.hz + Math.sin(a) * 0.4;
        this.frogHop(v, s, tx, s.hy, tz, false);
        s.face = Math.atan2(s.wx - tx, s.wz - tz);
      }
      if ((v.chirpT -= dt) <= 0) {
        v.chirpT = 60 / croakRate(g?.shownHour ? g.shownHour() : 12) * (0.5 + Math.random());
        if (d < 30) {
          if (v.anim?.has('Croak')) { v.clip = ''; v.anim.once('Croak', { then: 'Idle' }); v.clip = 'Idle'; }
          audio?.croak?.((1 - d / 30) ** 1.5, s.pitch, s.tree ? 'tree' : 'pond');
        }
      }
    }
    this.place(v, s);
  }

  frogHop(v, s, tx, ty, tz, into) {
    this.launch(s, tx, ty, tz, into ? 0.45 : 0.32, into ? 0.4 : 0.18);
    s.st = 'hop'; s.into = into;
    if (v.anim?.has('Hop')) { v.anim.once('Hop', { then: into ? 'Swim' : 'Idle', speed: 1.3 }); v.clip = into ? 'Swim' : 'Idle'; }
  }

  /** The spider sits on its web, now and then walks a little way across it. */
  spider(v, s, dt) {
    s.wu ??= 0; s.wv ??= 0; s.dir ??= -Math.PI / 2;
    if (s.st === 'walk') {
      const ex = s.tx - s.wu, ey = s.ty - s.wv, l = Math.hypot(ex, ey), step = 0.07 * dt;
      if (l <= step) { s.wu = s.tx; s.wv = s.ty; s.st = 'idle'; s.t = 3 + Math.random() * 7; this.play(v, 'Idle'); }
      else { s.wu += ex / l * step; s.wv += ey / l * step; s.dir = Math.atan2(ey, ex); }
    } else if ((s.t -= dt) <= 0) {
      const a = Math.random() * 6.28, r = Math.random() * s.webR * 0.55;
      s.tx = Math.cos(a) * r; s.ty = Math.sin(a) * r;
      s.st = 'walk';
      this.play(v, 'Walk');
    }
    this.placeSpider(v, s);
  }

  placeSpider(v, s) {
    s.wu ??= 0; s.wv ??= 0; s.dir ??= -Math.PI / 2;
    const n = _z.set(Math.sin(s.ry), 0, Math.cos(s.ry));            // web face normal
    const right = _x.set(Math.cos(s.ry), 0, -Math.sin(s.ry));       // across the web
    // position on the web's face, a hair in front of it
    s.x = s.hx + right.x * s.wu + n.x * 0.02; s.y = s.hy + s.wv; s.z = s.hz + right.z * s.wu + n.z * 0.02;
    v.root.position.set(s.x, s.y, s.z);
    // belly to the web: the spider's up is the web normal, its forward is the way it walks in the web's plane
    const cu = Math.cos(s.dir), cv = Math.sin(s.dir);
    const fwd = _p.set(right.x * cu, cv, right.z * cu);
    const side = _y.crossVectors(n, fwd);
    _m.makeBasis(side, n, fwd);
    v.root.quaternion.setFromRotationMatrix(_m);
  }

  /** On a flower or bush top, turning slowly; flies to a neighbouring perch when startled (or after a hello). */
  ladybug(v, s, dt, startled) {
    if (s.st === 'fly') {
      if (this.fly(s, dt)) { s.st = 'idle'; s.t = 5 + Math.random() * 20; this.play(v, 'Idle'); }
    } else {
      s.face += dt * 0.35 * Math.sin(s.ph * 0.3);
      if (s.leave && s.hold <= 0 || startled || (s.t -= dt) <= 0 && s.perches.length > 1 && Math.random() < 0.3) {
        s.leave = false;
        if (s.perches.length > 1) {
          s.at = (s.at + 1 + Math.floor(Math.random() * (s.perches.length - 1))) % s.perches.length;
          const q = s.perches[s.at];
          this.launch(s, q.x, q.y, q.z, 0.8 + Math.hypot(q.x - s.x, q.z - s.z) / 2.2, 0.9);
          s.st = 'fly';
          this.play(v, 'Fly');
        } else if (startled) s.hold = 3;                 // nowhere to go: she just tucks in
        else s.t = 10;
      }
    }
    if (s.hold > 0) s.leave = true;                      // after a hello she flies off, as the scene says
    this.place(v, s);
  }

  /** Darts from hover to hover round its spot over the water; comes to look at a Mika who stands still nearby. */
  dragonfly(v, s, dt, player) {
    const p = player.pos;
    const visiting = this.visitor === s;
    if (!this.visitor && this.stillT > 1.5 && Math.hypot(s.hx - p.x, s.hz - p.z) < 10) this.visitor = s;
    else if (visiting && (this.stillT === 0 && s.hold <= 0)) this.visitor = null;
    s.t -= dt;
    if (s.st === 'dart') {
      if (this.fly(s, dt)) { s.st = 'hover'; s.t = 0.5 + Math.random() * 1.6; }
    } else if (s.t <= 0) {
      let tx, ty, tz;
      if (this.visitor === s) {
        // hover in front of Mika's face, just out of reach of her nose
        const f = player.facing, r = 0.85 + Math.random() * 0.25;
        tx = p.x + Math.sin(f) * r + (Math.random() - 0.5) * 0.3; tz = p.z + Math.cos(f) * r + (Math.random() - 0.5) * 0.3;
        ty = p.y + 1.25 + Math.random() * 0.25;
      } else {
        const a = Math.random() * 6.28, r = 1 + Math.random() * 3.5;
        tx = s.hx + Math.cos(a) * r; tz = s.hz + Math.sin(a) * r; ty = s.hy + (Math.random() - 0.3) * 0.5;
      }
      this.launch(s, tx, ty, tz, 0.25 + Math.hypot(tx - s.x, tz - s.z) / 9, 0.05);
      s.st = 'dart';
    } else {
      s.y += Math.sin(s.ph * 7) * 0.02 * dt * 7;        // a tiny hovering bob
    }
    if (s.st === 'hover' && this.visitor === s) s.face = Math.atan2(p.x - s.x, p.z - s.z);
    this.play(v, 'Fly');
    this.place(v, s);
  }

  /** Wanders round its meadow with a turn limit and a flutter; lands to rest on a flower now and then. */
  butterfly(v, s, dt, startled) {
    const ground = this.world.heightAt(s.x, s.z);
    if (s.st === 'rest') {
      if ((s.t -= dt) <= 0 || startled) { s.st = 'fly'; s.t = 6 + Math.random() * 10; this.play(v, 'Fly'); }
    } else if (s.st === 'land') {
      if (this.fly(s, dt)) { s.st = 'rest'; s.t = 3 + Math.random() * 5; s.face = s.ph % 6.28; this.play(v, 'Rest'); }
      else if (startled) { s.st = 'fly'; s.t = 6; this.play(v, 'Fly'); }
    } else {
      s.t -= dt;
      if (s.goalT === undefined || (s.goalT -= dt) <= 0 || Math.hypot((s.gx ?? s.hx) - s.x, (s.gz ?? s.hz) - s.z) < 0.6) {
        const a = Math.random() * 6.28, r = Math.random() * 5;
        s.gx = s.hx + Math.cos(a) * r; s.gz = s.hz + Math.sin(a) * r; s.goalT = 2 + Math.random() * 3;
      }
      const want = Math.atan2(s.gx - s.x, s.gz - s.z);
      let dh = want - s.hd;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      s.hd += Math.max(-2.4 * dt, Math.min(2.4 * dt, dh)) + Math.sin(s.ph * 3.1) * 0.9 * dt;
      const speed = startled ? 2.6 : 1.1;
      s.x += Math.sin(s.hd) * speed * dt; s.z += Math.cos(s.hd) * speed * dt;
      const ty = ground + 1.0 + Math.sin(s.ph * 0.7) * 0.35 + Math.sin(s.ph * 9) * 0.06;
      s.y += (Math.max(ty, s.hy - 0.6) - s.y) * Math.min(1, dt * 3);
      s.face = s.hd;
      if (s.t <= 0 && s.perches.length && !startled) {
        // pick the nearest of its flowers and glide down onto it
        let best = 0, bd = 1e9;
        for (let k = 0; k < s.perches.length; k++) { const q = s.perches[k], dd = Math.hypot(q.x - s.x, q.z - s.z); if (dd < bd) { bd = dd; best = k; } }
        s.at = best;
        const q = s.perches[best];
        this.launch(s, q.x, q.y + 0.02, q.z, 0.6 + bd / 1.2, 0.25);
        s.st = 'land';
      }
    }
    this.place(v, s);
  }
}
