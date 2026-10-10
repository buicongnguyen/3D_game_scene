// Sweet potato roast (docs/RURAL-TRICKS.md, trick 10): autumn, the open meadow south of Kawabe. Mika gathers armfuls of dry
// straw; Grandma lights it (fires are for grown-ups: Mika never does, and stands back while it burns down). Then Mika
// buries the sweet potatoes in the ash and watches each spot: grey ash is still raw, an amber glow with white steam is
// just right, black smoke is too late. Every potato has its own hidden cook time, so it is a little juggling game.
//
// The rules (the cook plan, the state of a potato, what the ash shows, the score) are pure and Node-tested; the round
// below only draws them. Cheap: one borrowed light from the shared LightPool, smoke and sparks from the shared particle
// pools (fx.soft / fx.glow), three flame cones, five small mounds, and at most a dozen little models made once.
import * as THREE from 'three';
import { tx, N_ } from '../../i18n/i18n.js';
import { rng } from '../../engine/spline.js';
import { Animator } from '../../actors/animator.js';

// ---------------------------------------------------------------------------------------------------- pure rules
export const POINTS = { perfect: 20, okay: 10, raw: 3, burnt: 0 };
export const OKAY = 1.6;          // seconds either side of the perfect window that still make an "okay" potato
export const STRAW = 3;           // armfuls of straw the fire needs
export const COUNT = 5;           // potatoes in a round

/**
 * The hidden cook plan (seeded): `count` potatoes, each { cook: seconds in the ash until perfect, win: how long it
 * stays perfect }. The cook times are spread over the range (one per band) and shuffled, so no two finish together.
 * gentle (the guided first try, Easy): shorter waits and a longer window.
 */
export function planRoast({ count = COUNT, gentle = false, rand }) {
  const lo = gentle ? 6 : 7, hi = gentle ? 15 : 20, band = (hi - lo) / count;
  const out = [];
  for (let i = 0; i < count; i++) out.push({ cook: +(lo + (i + rand() * 0.8) * band).toFixed(2), win: gentle ? 4.5 : 3.2 });
  for (let k = out.length - 1; k > 0; k--) { const j = Math.floor(rand() * (k + 1)); [out[k], out[j]] = [out[j], out[k]]; }
  return out;
}

/** What a potato is after `heat` seconds in the ash: 'raw' | 'okay' | 'perfect' | 'burnt'. */
export function cookState(heat, p) {
  if (heat < p.cook - OKAY) return 'raw';
  if (heat < p.cook) return 'okay';
  if (heat < p.cook + p.win) return 'perfect';
  if (heat < p.cook + p.win + OKAY) return 'okay';
  return 'burnt';
}

const clamp01 = v => Math.max(0, Math.min(1, v));
const smooth = (a, b, v) => { const u = clamp01((v - a) / (b - a)); return u * u * (3 - 2 * u); };

/**
 * What the ash over a potato shows (all 0..1): glow (grey ash for the first half, then warming to full amber exactly
 * when it turns perfect),
 * steam (white sweet-smelling puffs while it is perfect), char (darkening after the window; 1 = burnt, black smoke).
 */
export function cue(heat, p) {
  const end = p.cook + p.win;
  const char = clamp01((heat - end) / OKAY);
  return {
    glow: smooth(0.55, 1, heat / p.cook) * (1 - char),
    steam: heat >= p.cook - 0.4 && heat < end ? 1 : 0,
    char,
  };
}

/** One round of roasting (pure). Spots are 'empty' → 'buried' (heat rises with time) → 'dug' (with a result). */
export class Roast {
  constructor({ count = COUNT, gentle = false, rand }) {
    this.spots = planRoast({ count, gentle, rand }).map(p => ({ ...p, st: 'empty', heat: 0, result: null }));
    this.t = 0;
  }

  bury(i) {
    const s = this.spots[i];
    if (!s || s.st !== 'empty') return false;
    s.st = 'buried';
    return true;
  }

  /** Dig a potato out: returns what it is ('raw' | 'okay' | 'perfect' | 'burnt'), or null when nothing is buried there. */
  dig(i) {
    const s = this.spots[i];
    if (!s || s.st !== 'buried') return null;
    s.st = 'dug';
    s.result = cookState(s.heat, s);
    s.early = s.heat < s.cook;
    return s.result;
  }

  update(dt) {
    this.t += dt;
    for (const s of this.spots) if (s.st === 'buried') s.heat += dt;
  }

  /** Time is up: whatever is still in the ash is forgotten there (burnt); potatoes never buried count for nothing. */
  finish() {
    for (const s of this.spots) if (s.st === 'buried') { s.st = 'dug'; s.result = 'burnt'; s.forgot = true; }
  }

  get buried() { return this.spots.filter(s => s.st === 'buried').length; }
  get left() { return this.spots.filter(s => s.st === 'empty').length; }
  get done() { return this.spots.every(s => s.st === 'dug'); }
  get score() { return roastScore(this.spots.map(s => s.result)); }
  tally() {
    const t = { perfect: 0, okay: 0, raw: 0, burnt: 0 };
    for (const s of this.spots) if (s.result) t[s.result]++;
    return t;
  }
}

/** Score for a list of results (stars in content/tricks.js: 30 / 60 / 90; five perfect potatoes are 100). */
export function roastScore(results) {
  return results.reduce((a, r) => a + (POINTS[r] || 0), 0);
}

/** Play recorded inputs [[time, 'bury' | 'dig', spot], …] (sorted by time) on a Roast; returns the results per input. */
export function replay(game, inputs, { dt = 0.05, until = 0 } = {}) {
  const out = [];
  let k = 0;
  const end = Math.max(until, inputs.length ? inputs[inputs.length - 1][0] : 0);
  for (let n = 0, steps = Math.ceil(end / dt - 1e-9); n <= steps; n++) {
    const t = n * dt;
    while (k < inputs.length && inputs[k][0] <= t + 1e-6) { const [, act, i] = inputs[k++]; out.push(act === 'bury' ? game.bury(i) : game.dig(i)); }
    game.update(dt);
  }
  return out;
}

/**
 * Where things go (pure): the hearth is the flattest dry point ~3.4 m from the sign; straw piles stand round it at
 * 5.5-7.5 m on dry, nearly level ground. Returns { x, z, y, piles: [{ x, z, y }] } (fewer piles if the ground is bad).
 */
export function layout(heightAt, place, rand, { piles = STRAW + 1, dry = 0.45 } = {}) {
  let best = null;
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2, x = place.x + Math.sin(a) * 3.4, z = place.z + Math.cos(a) * 3.4, y = heightAt(x, z);
    if (y < dry) continue;
    let rough = Math.abs(y - heightAt(place.x, place.z)) * 0.5;
    for (let j = 0; j < 6; j++) rough += Math.abs(heightAt(x + Math.sin(j) * 1.5, z + Math.cos(j) * 1.5) - y);
    if (!best || rough < best.rough) best = { x, z, y, rough };
  }
  if (!best) best = { x: place.x, z: place.z, y: heightAt(place.x, place.z), rough: 0 };
  const out = [], a0 = rand() * Math.PI * 2;
  for (let k = 0; k < 14 && out.length < piles; k++) {
    const a = a0 + k * 2.399963, r = 5.5 + rand() * 2;                 // golden-angle steps: spread round the hearth
    const x = best.x + Math.sin(a) * r, z = best.z + Math.cos(a) * r, y = heightAt(x, z);
    if (y < dry || Math.abs(y - best.y) > 1.3) continue;
    if (Math.hypot(x - place.x, z - place.z) < 1.6 || out.some(q => Math.hypot(q.x - x, q.z - z) < 2.2)) continue;
    out.push({ x, z, y });
  }
  return { x: best.x, z: best.z, y: best.y, piles: out };
}

// ---------------------------------------------------------------------------------------------------- the round
const V = () => new THREE.Vector3();
const _v = V(), _w = V(), _c = new THREE.Color();
const RING_R = 1.0;               // the potatoes lie in a ring this far from the middle of the ash
const BED_R = 1.5;
const ASH = new THREE.Color('#4d4744'), AMBER = new THREE.Color('#ff9a1c'), CHAR = new THREE.Color('#1c1512');
const CHEERS = [N_('Roast potatoes! Save me one!'), N_('That smells SO good!'), N_('Me! Me! The big one!'), N_('Hot hot hot! Blow on it!')];

function bedTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,196,96,1)');
  grd.addColorStop(0.28, 'rgba(240,120,40,1)');
  grd.addColorStop(0.62, 'rgba(120,70,50,0.98)');
  grd.addColorStop(0.86, 'rgba(92,86,80,0.9)');
  grd.addColorStop(1, 'rgba(92,86,80,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  // a few darker flecks of burnt straw
  for (let i = 0; i < 60; i++) {
    const a = i * 2.4, r = 14 + (i * 37 % 44);
    g.fillStyle = `rgba(40,30,26,${0.15 + (i % 5) * 0.06})`;
    g.fillRect(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 2 + i % 3, 1 + i % 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Scale a model so its longest side is `size` metres (the artist's units may differ); returns the model. */
function fit(model, size) {
  const b = new THREE.Box3().setFromObject(model), d = b.getSize(_v), m = Math.max(d.x, d.y, d.z) || 1;
  model.scale.multiplyScalar(size / m);
  return model;
}

class RoastRound {
  constructor(ctx, seed) {
    this.ctx = ctx;
    const g = this.g = ctx.game;
    this.player = ctx.player || g.player;
    this.scene = g.scene;
    this.added = [];
    this.own = [];              // geometries, materials and textures made here (disposed at the end)
    this.seed = seed;
    this.rand = rng(seed);
    this.game = new Roast({ count: COUNT, gentle: !!ctx.first || !!g.easy, rand: this.rand });
    this.phase = 'gather';
    this.t = 0;
    this.straw = 0;
    this.carrying = false;
    this.fire = 0;              // flame height 0..1
    this.embers = 0;            // glow of the ash bed 0..1
    this.I = 0;                 // the firelight
    this.sel = -1;
    this.flick = 1;
    this.puff = new Float32Array(COUNT);
    this.fades = 0;
  }

  add(o, parent = this.scene) { parent.add(o); if (parent === this.scene) this.added.push(o); return o; }
  keep(x) { this.own.push(x); return x; }
  mat(m) { return this.keep(m); }

  /** Trample the grass round the hearth for the round (the splat map's grass channel), and put it back after. */
  clearGrass(x, z, r) {
    const sp = this.g.world?.splat;
    if (!sp?.paintDisc || !sp.data) return;
    const pad = 11;                       // the straw piles (up to 7.5 m off) clear a little grass too
    const i0 = Math.max(0, Math.floor(x - pad - sp.x0)), i1 = Math.min(sp.w - 1, Math.ceil(x + pad - sp.x0));
    const j0 = Math.max(0, Math.floor(z - pad - sp.z0)), j1 = Math.min(sp.h - 1, Math.ceil(z + pad - sp.z0));
    const rows = [];
    for (let j = j0; j <= j1; j++) rows.push(sp.data.slice((j * sp.w + i0) * 4, (j * sp.w + i1 + 1) * 4));
    this.grassWas = { sp, i0, j0, rows };
    sp.paintDisc(x, z, r, 3, 0, 1.2);
  }

  restoreGrass() {
    const w = this.grassWas;
    if (!w) return;
    w.rows.forEach((row, k) => w.sp.data.set(row, ((w.j0 + k) * w.sp.w + w.i0) * 4));
    w.sp.texture.needsUpdate = true;
    this.grassWas = null;
  }

  strawModel(size, layers = 1) {
    const a = this.g.assets;
    if (a?.has?.('straw-pile')) {
      // the artist's pile is a low mound (with its own ember bed, shown once it has burnt down): heap up `layers` of it
      const root = new THREE.Group();
      root.userData.embers = [];
      for (let k = 0, y = 0; k < layers; k++) {
        const m = a.clone('straw-pile');
        const em = m.getObjectByName('embers');
        if (em) { em.visible = false; if (k === 0) root.userData.embers.push(em); else em.removeFromParent(); }
        const st = m.getObjectByName('straw_pile');
        if (st) root.userData.straw = (root.userData.straw || []).concat(st);
        fit(m, size * (1 - k * 0.27));
        m.traverse(o => { if (o.isMesh) { o.castShadow = size > 0.8 && k === 0; o.receiveShadow = true; } });
        m.position.y = y;
        m.rotation.y = k * 2.1;
        y += size * (1 - k * 0.27) * 0.17;
        root.add(m);
      }
      return root;
    }
    // no art yet: a little stook of straw (a cone with a tied waist)
    const root = new THREE.Group();
    const cone = new THREE.Mesh(this.geo.cone, this.mats.straw);
    cone.scale.set(size * 0.45, size * 0.75, size * 0.45);
    cone.position.y = size * 0.375;
    const band = new THREE.Mesh(this.geo.band, this.mats.strawDark);
    band.scale.setScalar(size * 0.21);
    band.position.y = size * 0.52;
    cone.castShadow = size > 0.8;
    root.add(cone, band);
    return root;
  }

  potatoModel() {
    const a = this.g.assets, root = new THREE.Group(), mats = [];
    if (a?.has?.('sweet-potato')) {
      const m = fit(a.clone('sweet-potato'), 0.38);
      m.traverse(o => {
        if (!o.isMesh) return;
        // the model holds the raw potato and the roasted one (broken open): one is shown at a time
        const roasted = /^roasted/.test(o.name) || /^roasted/.test(o.parent?.name || '');
        (roasted ? this._roasted ??= [] : this._raw ??= []).push(o);
        o.visible = !roasted;
        o.castShadow = true;
        o.material = [o.material].flat().map(x => { const c = this.mat(x.clone()); mats.push(c); return c; });
        if (o.material.length === 1) o.material = o.material[0];
      });
      root.add(m);
      root.userData.raw = this._raw || [];
      root.userData.roasted = this._roasted || [];
      this._raw = this._roasted = null;
    } else {
      const c = this.mat(new THREE.MeshStandardMaterial({ color: '#a8436e', roughness: 0.75 }));
      const body = new THREE.Mesh(this.geo.potato, c);
      body.castShadow = true;
      root.add(body);
      mats.push(c);
    }
    for (const c of mats) c.userData.base = c.color.clone();
    return { root, mats };
  }

  build() {
    const g = this.g, ctx = this.ctx, heightAt = (x, z) => g.world.heightAt(x, z);
    const L = this.lay = layout(heightAt, ctx.place, this.rand);
    this.clearGrass(L.x, L.z, 2.9);
    this.geo = {
      cone: this.keep(new THREE.ConeGeometry(1, 1, 9)),
      band: this.keep(new THREE.TorusGeometry(1, 0.22, 5, 10).rotateX(Math.PI / 2)),
      potato: this.keep(new THREE.SphereGeometry(0.075, 10, 7).scale(1, 0.9, 2)),
      mound: this.keep(new THREE.SphereGeometry(0.3, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.5, 1)),
      hollow: this.keep(new THREE.RingGeometry(0.17, 0.26, 20).rotateX(-Math.PI / 2)),
      ring: this.keep(new THREE.RingGeometry(0.36, 0.43, 28).rotateX(-Math.PI / 2)),
      bed: this.keep(new THREE.CircleGeometry(BED_R, 28).rotateX(-Math.PI / 2)),
      flame: this.keep(new THREE.ConeGeometry(0.5, 1, 7).translate(0, 0.5, 0)),
      arrow: this.keep(new THREE.ConeGeometry(0.16, 0.3, 4).rotateX(Math.PI)),
    };
    this.mats = {
      straw: this.mat(new THREE.MeshStandardMaterial({ color: '#e2bd5a', roughness: 0.9 })),
      strawDark: this.mat(new THREE.MeshStandardMaterial({ color: '#a9812f', roughness: 0.9 })),
      hollow: this.mat(new THREE.MeshBasicMaterial({ color: '#2a211c', transparent: true, opacity: 0, depthWrite: false })),
      ring: this.mat(new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0, depthWrite: false, fog: false })),
      arrow: this.mat(new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.9, fog: false })),
    };
    // the hearth: a group tilted to the ground, so the ash bed and the potatoes lie on the slope
    const h = this.hearth = this.add(new THREE.Group());
    h.name = 'trick:roast-hearth';
    h.position.set(L.x, L.y + 0.03, L.z);
    const nx = heightAt(L.x - 0.8, L.z) - heightAt(L.x + 0.8, L.z), nz = heightAt(L.x, L.z - 0.8) - heightAt(L.x, L.z + 0.8);
    h.quaternion.setFromUnitVectors(_v.set(0, 1, 0), _w.set(nx, 1.6, nz).normalize());
    this.centre = V().set(L.x, L.y, L.z);
    this.bedTex = this.keep(bedTexture());
    this.bed = this.add(new THREE.Mesh(this.geo.bed, this.mat(new THREE.MeshBasicMaterial({ map: this.bedTex, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }))), h);
    this.bed.renderOrder = 2;
    // the fire's own pile of straw (grows with every armful), and the flames
    this.pile = this.add(this.strawModel(1.5, 3), h);
    this.pile.scale.setScalar(0.001);
    this.flames = [];
    for (const [col, s, ox, oz] of [['#ff5a10', 1, 0, 0], ['#ff9a1e', 0.72, 0.2, 0.1], ['#ffe066', 0.5, -0.12, -0.14]]) {
      const f = this.add(new THREE.Mesh(this.geo.flame, this.mat(new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthWrite: false, fog: false }))), h);
      f.position.set(ox, 0.05, oz);
      f.userData.s = s;
      f.visible = false;
      f.renderOrder = 6;
      this.flames.push(f);
    }
    // the spots round the ash: a hollow to bury in, a mound over a buried potato
    this.spots = this.game.spots.map((s, i) => {
      const a = i / COUNT * Math.PI * 2 + 0.3, lx = Math.sin(a) * RING_R, lz = Math.cos(a) * RING_R;
      const hollow = this.add(new THREE.Mesh(this.geo.hollow, this.mats.hollow), h);
      hollow.position.set(lx, 0.025, lz);
      hollow.renderOrder = 3;
      const mm = this.mat(new THREE.MeshStandardMaterial({ color: ASH.clone(), roughness: 0.95, emissive: '#000000' }));
      const mound = this.add(new THREE.Mesh(this.geo.mound, mm), h);
      mound.position.set(lx, 0, lz);
      mound.visible = false;
      const at = h.localToWorld(V().set(lx, 0, lz));
      return { i, lx, lz, at, hollow, mound, mm, potato: null, pop: 0 };
    });
    this.selRing = this.add(new THREE.Mesh(this.geo.ring, this.mats.ring), h);
    this.selRing.renderOrder = 7;
    // straw piles round the field, each with a bobbing arrow while Mika still needs straw
    this.piles = L.piles.map(q => {
      const m = this.add(this.strawModel(1.6, 3));
      m.position.set(q.x, q.y, q.z);
      this.g.world?.splat?.paintDisc?.(q.x, q.z, 0.9, 3, 0, 0.8);
      m.rotation.y = this.rand() * 6.28;
      const arrow = this.add(new THREE.Mesh(this.geo.arrow, this.mats.arrow));
      arrow.position.set(q.x, q.y + 1.7, q.z);
      return { ...q, m, arrow, taken: false };
    });
    // an armful is carried on the head, the way it is done in the fields
    this.bundle = this.strawModel(0.95, 2);
    this.bundle.visible = false;
    (this.player.root || this.player.model).add(this.bundle);
    this.bundle.position.set(0, 1.32, 0.02);
    // the potatoes wait in a little heap between the sign and the hearth
    // (a quarter turn round the hearth from the sign, so the signpost never stands in the picture)
    const toSign = this.back = V().set(this.ctx.place.x - L.x, 0, this.ctx.place.z - L.z).normalize().applyAxisAngle(_w.set(0, 1, 0), 1.25);
    this.heap = V().set(L.x + toSign.x * 2.1, 0, L.z + toSign.z * 2.1);
    this.side = V().set(-toSign.z, 0, toSign.x);
    this.potatoes = this.game.spots.map((s, i) => {
      const p = this.potatoModel();
      const x = this.heap.x + this.side.x * (i - 2) * 0.22, z = this.heap.z + this.side.z * (i - 2) * 0.22;
      p.home = V().set(x, heightAt(x, z) + 0.07, z);
      p.root.position.copy(p.home);
      p.root.rotation.y = this.rand() * 6.28;
      p.move = null;
      this.add(p.root);
      return p;
    });
    // one warm light for the whole fire, borrowed from the shared pool
    this.lightPos = V().set(L.x, L.y + 0.8, L.z);
    this.light = g.lights?.add({ pos: this.lightPos, intensity: () => this.I * this.flick, range: 9, color: '#ff9a3c' });
    this.standIn();
    return true;
  }

  /** The grown-up who lights the fire. When the teacher is not standing nearby, a stand-in of her model watches. */
  standIn() {
    const d = this.ctx.director, g = this.g, n = d?.npcs?.[this.ctx.teacher], L = this.lay;
    if (!n || (n.visible && n.pos.distanceTo(this.centre) < 14)) return;
    const name = n.model?.userData?.model;
    const m = name && g.assets?.has?.(name) ? g.assets.clone(name) : null;
    if (!m) return;
    m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    // she waits on the far side of the hearth from Mika
    const x = L.x - this.back.x * 2.2 + this.side.x * 1.2, z = L.z - this.back.z * 2.2 + this.side.z * 1.2;
    m.position.set(x, g.world.heightAt(x, z), z);
    m.rotation.y = Math.atan2(L.x - x, L.z - z);
    m.visible = false;
    this.grown = this.add(m);
    this.grownAnim = m.userData.clips?.length ? new Animator(m) : null;
    this.grownAnim?.play('Idle');
  }

  // ------------------------------------------------------------ helpers
  hint(text, life) { this.ctx.hint?.(text, life); }

  smoke(at, dark, size = 0.5, up = 1.3) {
    const c = dark ? 0.12 : 0.92, fx = this.ctx.fx;
    fx?.soft?.emit(_v.set(at.x + (Math.random() - 0.5) * 0.12, at.y + 0.18, at.z + (Math.random() - 0.5) * 0.12),
      _w.set((Math.random() - 0.5) * 0.25 + 0.12, up * (0.8 + Math.random() * 0.4), (Math.random() - 0.5) * 0.25),
      { life: dark ? 2.2 : 1.6, size, color: [c, c, c], alpha: dark ? 0.75 : 0.65, drag: 0.5, grow: dark ? 0.9 : 0.6, gravity: -0.15 });
  }

  spark(n = 1) {
    const fx = this.ctx.fx, c = this.centre;
    for (let i = 0; i < n; i++) {
      fx?.glow?.emit(_v.set(c.x + (Math.random() - 0.5) * 0.9, c.y + 0.15, c.z + (Math.random() - 0.5) * 0.9),
        _w.set((Math.random() - 0.5) * 0.5, 1 + Math.random() * 1.4, (Math.random() - 0.5) * 0.5),
        { life: 0.9 + Math.random() * 0.8, size: 0.07 + Math.random() * 0.06, color: [1, 0.55 + Math.random() * 0.3, 0.15], gravity: -0.3, drag: 0.6 });
    }
  }

  /** Mika never walks through the fire: she is eased back to the edge of the ash. */
  keepOut(r) {
    const p = this.player.pos, dx = p.x - this.centre.x, dz = p.z - this.centre.z, d = Math.hypot(dx, dz);
    if (d < r && d > 1e-3) { p.x = this.centre.x + dx / d * r; p.z = this.centre.z + dz / d * r; }
  }

  // ------------------------------------------------------------ phases
  gather(dt) {
    const p = this.player, pos = p.pos, ctx = this.ctx;
    this.keepOut(0.9);
    let near = null, nd = 2.0;
    for (const q of this.piles) {
      q.arrow.visible = !q.taken && !this.carrying;
      q.arrow.position.y = q.y + 1.7 + Math.sin(this.t * 4 + q.x) * 0.1;
      q.arrow.rotation.y += dt * 2;
      if (q.taken) continue;
      const d = Math.hypot(q.x - pos.x, q.z - pos.z);
      if (d < nd) { nd = d; near = q; }
    }
    this.nearPile = near;
    if (!this.carrying && near && ctx.pressed()) {
      near.taken = true;
      near.m.scale.multiplyScalar(0.6);                  // an armful gone from the pile
      this.carrying = true;
      this.bundle.visible = true;
      p.gesture?.('Interact', { lock: false });
      ctx.audio?.pickup?.();
      this.hint(tx('Good. Carry it to the fire spot.'), 3);
    } else if (this.carrying && Math.hypot(this.centre.x - pos.x, this.centre.z - pos.z) < 1.9) {
      this.carrying = false;
      this.bundle.visible = false;
      this.straw++;
      ctx.audio?.land?.(0.3);
      ctx.fx?.burst?.(_v.copy(this.centre).setY(this.centre.y + 0.4), { n: 8, color: [0.95, 0.8, 0.4], speed: 1.2, size: 0.1, gravity: 3 });
      if (this.straw >= STRAW || !this.piles.some(q => !q.taken)) this.startLight();
      else this.hint(STRAW - this.straw === 1 ? tx('One more armful of straw.') : tx('{n} more armfuls of straw.', { n: STRAW - this.straw }), 3);
    }
    const want = Math.min(1, this.straw / STRAW);
    const s = this.pile.scale.x + (Math.max(0.001, want) - this.pile.scale.x) * Math.min(1, dt * 6);
    this.pile.scale.setScalar(s);
  }

  startLight() {
    const ctx = this.ctx, p = this.player, g = this.g, L = this.lay;
    this.phase = 'light';
    this.lt = 0;
    ctx.lock?.(true);
    for (const q of this.piles) q.arrow.visible = false;
    this.fades++;
    ctx.fade?.(true, 300).then(() => {
      if (this.disposed) return;
      // Mika stands well back, by the potatoes, facing the fire
      const sx = this.heap.x + (this.heap.x - L.x) * 0.45, sz = this.heap.z + (this.heap.z - L.z) * 0.45;
      p.teleport(sx, sz, undefined, Math.atan2(L.x - sx, L.z - sz));
      if (g.follow) { g.follow.yaw = p.facing; g.follow.first = true; }
      if (this.grown) this.grown.visible = true;
      // a side view of the fire, with Mika and the grown-up either side of it
      // (from the side the signpost is not on)
      const c = this.centre, s = this.side, b = this.back, pl = ctx.place;
      const k = (pl.x - c.x) * s.x + (pl.z - c.z) * s.z > 0 ? -1 : 1;
      g.follow?.cutscene?.({ pos: V().set(c.x + s.x * k * 4.6 + b.x * 1.2, c.y + 2.1, c.z + s.z * k * 4.6 + b.z * 1.2), look: V().set(c.x, c.y + 0.7, c.z) }, 0.01);
      this.lit = true;
      ctx.fade?.(false, 450);
      this.fades--;
    });
    const grandma = ctx.teacher === 'sora';
    this.hint(grandma
      ? tx('Stand back, Mi-chan. Lighting the fire is a grown-up\'s job.')
      : tx('Stand back. Grandpa lights it: fires are for grown-ups.'), 5);
  }

  lighting(dt) {
    if (!this.lit) return;
    this.lt += dt;
    const t = this.lt;
    // the straw catches, burns high, and falls into glowing ash
    this.fire = t < 1.2 ? t / 1.2 : t < 3.2 ? 1 : Math.max(0.16, 1 - (t - 3.2) / 2.2);
    this.embers = clamp01((t - 2.4) / 2.4);
    this.burn(clamp01((t - 1) / 3));
    if (t < 0.1 && !this.whoosh) { this.whoosh = true; this.ctx.audio?.whoosh?.(2); }
    if (Math.random() < dt * 14) this.smoke(_v.copy(this.centre).setY(this.centre.y + 0.5 + this.fire * 0.6), false, 0.9, 2);
    // a soft glow and flying sparks round the flames (the shared additive pool)
    if (this.fire > 0.3 && Math.random() < dt * 20) {
      this.ctx.fx?.glow?.emit(_v.set(this.centre.x + (Math.random() - 0.5) * 0.5, this.centre.y + 0.3 + Math.random() * this.fire, this.centre.z + (Math.random() - 0.5) * 0.5),
        _w.set(0, 0.8, 0), { life: 0.5, size: 0.9 + Math.random() * 0.5, color: [1, 0.5, 0.12], alpha: 0.35, drag: 0.5 });
      this.spark(1);
    }
    if (t > 5.4) this.startCook();
  }

  /** The fire's straw burns away (k 0..1); the model's own bed of coals is left in the middle. */
  burn(k) {
    const ud = this.pile.userData, s = Math.max(0.001, 1 - k);
    if (ud.straw?.length) {
      for (const o of ud.straw) { o.userData.s0 ??= o.scale.x; o.scale.setScalar(o.userData.s0 * s); }
      for (const o of ud.embers || []) {
        o.visible = k > 0.35;
        // the coals glow: an own copy of the model's ember material, turned up
        if (o.visible && !o.userData.hot) {
          o.userData.hot = true;
          o.traverse(c => { if (c.isMesh && c.material?.emissive) { c.material = this.mat(c.material.clone()); c.material.emissiveIntensity = 2.6; this.coals = c.material; } });
        }
      }
    } else this.pile.scale.setScalar(s);
  }

  startCook() {
    const ctx = this.ctx;
    this.phase = 'cook';
    ctx.lock?.(false);
    this.g.follow?.clearCutscene?.(true);
    this.mats.hollow.opacity = 0.75;
    this.hint(ctx.first
      ? tx('The ash is ready. Stand by a hollow and press {act} to bury a sweet potato.')
      : tx('Bury the potatoes, then watch the ash over each one.'), 6);
  }

  /** The spot Mika stands at: the nearest to a point half a step ahead of her. */
  pick() {
    const p = this.player, x = p.pos.x + Math.sin(p.facing) * 0.35, z = p.pos.z + Math.cos(p.facing) * 0.35;
    let best = -1, bd = 1.25;
    for (const s of this.spots) {
      if (this.game.spots[s.i].st === 'dug') continue;
      const d = Math.hypot(s.at.x - x, s.at.z - z);
      if (d < bd) { bd = d; best = s.i; }
    }
    return best;
  }

  act(i) {
    const gs = this.game.spots[i], s = this.spots[i], ctx = this.ctx, pt = this.potatoes[i];
    if (gs.st === 'empty') {
      if (!this.game.bury(i)) return;
      pt.move = { from: pt.root.position.clone(), to: s.at.clone().setY(s.at.y + 0.02), u: 0, dur: 0.4, arc: 0.6, then: 'in' };
      this.player.gesture?.('Interact', { lock: false });
      ctx.audio?.land?.(0.25);
      if (this.game.left === 0) {
        this.hint(ctx.first
          ? tx('Now watch. Grey ash is still raw. An amber glow and white steam: dig it out with {act}. Black smoke is too late!')
          : tx('Amber glow and white steam: dig! Black smoke: too late.'), 7);
      }
      return;
    }
    const res = this.game.dig(i);
    if (!res) return;
    s.mound.visible = false;
    this.land(i, res);
    this.player.gesture?.('Interact', { lock: false });
    const text = {
      perfect: tx('Perfect! Golden, soft and sweet.'),
      okay: gs.early ? tx('A little firm in the middle, but good.') : tx('A bit dark on one side, still tasty.'),
      raw: tx('Too early: this one is still hard.'),
      burnt: tx('Oh no, charcoal! That one stayed too long.'),
    }[res];
    this.hint(text, 3);
    ctx.audio?.[res === 'perfect' ? 'pickup' : res === 'okay' ? 'good' : 'bad']?.();
    if (res === 'perfect') ctx.fx?.burst?.(_v.copy(s.at).setY(s.at.y + 0.4), { n: 14, color: [1, 0.8, 0.35], speed: 1.4, size: 0.14, gravity: 1 });
  }

  /** A dug potato hops out to the row beside the fire, wearing what it became. */
  land(i, res) {
    const pt = this.potatoes[i], s = this.spots[i], n = this.out = (this.out || 0) + 1;
    const x = this.heap.x + this.side.x * (n - 3) * 0.32 + this.back.x * 0.5, z = this.heap.z + this.side.z * (n - 3) * 0.32 + this.back.z * 0.5;
    pt.root.visible = true;
    pt.root.position.copy(s.at);
    pt.move = { from: s.at.clone(), to: V().set(x, this.g.world.heightAt(x, z) + 0.08, z), u: 0, dur: 0.55, arc: 0.9, then: 'out' };
    pt.res = res;
    // a good one is shown broken open, golden inside (the model's roasted half); a burnt one is a lump of charcoal
    const ud = pt.root.userData, open = ud.roasted?.length && (res === 'perfect' || res === 'okay');
    if (open) { ud.raw.forEach(o => { o.visible = false; }); ud.roasted.forEach(o => { o.visible = true; }); }
    const tint = open ? { perfect: null, okay: '#7a5a40' }[res] : { perfect: '#ffb648', okay: '#b98a5a', raw: null, burnt: '#1a1513' }[res];
    for (const c of pt.mats) {
      if (tint) c.color.copy(c.userData.base).lerp(_c.set(tint), res === 'burnt' ? 0.92 : open ? 0.35 : 0.6);
      if (c.emissive && !open) c.emissive.set(res === 'perfect' ? '#5a2a00' : '#000000');
    }
    pt.root.scale.setScalar(open ? 1.25 : 1);
    pt.steam = res === 'perfect' || res === 'okay' ? 4 : 0;
  }

  cook(dt) {
    const ctx = this.ctx, game = this.game;
    this.keepOut(0.5);
    game.update(dt);
    this.sel = this.pick();
    if (this.sel >= 0 && ctx.pressed()) this.act(this.sel);
    for (const s of this.spots) {
      const gs = game.spots[s.i];
      if (gs.st !== 'buried') continue;
      const q = cue(gs.heat, gs);
      s.mm.color.copy(ASH).lerp(AMBER, q.glow * 0.7).lerp(CHAR, q.char);
      s.mm.emissive.copy(AMBER).multiplyScalar(q.glow * q.glow * (1.7 + Math.sin(this.t * 7 + s.i) * 0.3));
      s.mound.scale.setScalar(q.steam && !q.char ? 1.06 + Math.sin(this.t * 9) * 0.06 : 1);
      // smoke tells the same story: a thin wisp, then white steam, then thick black smoke
      const rate = q.char > 0 ? 5 + q.char * 9 : q.steam ? 6 : 0.7;
      this.puff[s.i] += dt * rate;
      if (this.puff[s.i] >= 1) {
        this.puff[s.i] = 0;
        this.smoke(s.at, q.char > 0.15, q.char > 0 ? 0.6 + q.char * 0.4 : q.steam ? 0.6 : 0.2, q.steam && !q.char ? 1.9 : 1.1);
      }
    }
  }

  finishRound() {
    if (this.phase === 'done') return;
    const ctx = this.ctx, d = ctx.director, p = this.player.pos;
    this.game.finish();
    for (const s of this.spots) s.mound.visible = false;
    this.phase = 'done';
    this.endT = 2.6;
    this.sel = -1;
    const t = this.game.tally(), good = t.perfect + t.okay;
    // the neighbours' kids, if any are about, come running in spirit: a cheer each
    const kids = (d?.town?.people || []).filter(it => it.n?.barkKind === 'kid' && it.n.visible && !it.n.far && it.n.pos.distanceTo(p) < 30).slice(0, 3);
    this.cheered = kids.length;
    if (good) kids.forEach((k, i) => d.barks?.ui?.show?.(`roast:${k.p.id}`, tx(CHEERS[(i + this.seed) % CHEERS.length]), out => { k.n.head(out); out.y += 0.3; return out; }, { name: tx(k.p.name || ''), life: 3.2 }));
    if (good) ctx.audio?.fanfare?.(); else ctx.audio?.bad?.();
    this.hint(t.perfect >= 4 ? tx('What a roast! Share them round while they\'re hot.')
      : good ? tx('Hot potatoes for everyone. Blow on them first!')
        : tx('Never mind. The ash is still warm: we\'ll try again.'), 4);
    if (good && this.player.anim?.has?.('Cheer')) this.player.gesture('Cheer', { lock: false });
  }

  update(dt) {
    this.t += dt;
    if (this.phase === 'gather') this.gather(dt);
    else if (this.phase === 'light') this.lighting(dt);
    else if (this.phase === 'cook') this.cook(dt);
    else if (this.phase === 'done') this.endT -= dt;
    // fire, ash and light
    this.flick += ((0.8 + Math.random() * 0.4) - this.flick) * Math.min(1, dt * 14);
    const f = this.fire;
    for (const m of this.flames) {
      m.visible = f > 0.02;
      const s = m.userData.s, w = 1 + Math.sin(this.t * (9 + s * 5) + s * 4) * 0.14;
      m.scale.set(s * (0.5 + f * 0.6), s * f * 1.9 * w * this.flick, s * (0.5 + f * 0.6));
      m.rotation.y += dt * 2;
    }
    this.bed.material.opacity = this.embers;
    this.bed.material.color.setScalar(0.82 + this.flick * 0.18);
    if (this.coals) this.coals.emissiveIntensity = 1.8 + this.flick * 1.2;
    this.I = Math.max(f * 14, this.embers * 2.2);
    if (this.embers > 0.5 && Math.random() < dt * 5) this.spark();
    if (this.embers > 0.5 && Math.random() < dt * 1.6) this.smoke(_v.copy(this.centre).setY(this.centre.y + 0.2), false, 0.5, 1.5);
    this.grownAnim?.update(dt);
    // the ring under the spot Mika can use
    const s = this.sel >= 0 && this.phase === 'cook' ? this.spots[this.sel] : null;
    this.selRing.scale.setScalar(1);
    if (s) { this.selRing.position.set(s.lx, 0.06, s.lz); this.mats.ring.opacity = 0.6 + Math.sin(this.t * 6) * 0.2; }
    else if (this.phase === 'gather' && this.carrying) {
      // where the armful goes
      this.selRing.position.set(0, 0.06, 0);
      this.selRing.scale.setScalar(2.6 + Math.sin(this.t * 4) * 0.2);
      this.mats.ring.opacity = 0.7;
    } else this.mats.ring.opacity = 0;
    // potatoes in the air, and the steam of the good ones
    for (const pt of this.potatoes) {
      const m = pt.move;
      if (m) {
        m.u = Math.min(1, m.u + dt / m.dur);
        pt.root.position.lerpVectors(m.from, m.to, m.u);
        pt.root.position.y += Math.sin(Math.PI * m.u) * m.arc;
        pt.root.rotation.x += dt * 9;
        if (m.u >= 1) {
          pt.move = null;
          pt.root.rotation.x = 0;
          if (m.then === 'in') { pt.root.visible = false; const sp = this.spots[this.potatoes.indexOf(pt)]; sp.mound.visible = true; sp.hollow.visible = false; }
        }
      } else if (pt.steam > 0) {
        pt.steam -= dt;
        if (Math.random() < dt * 5) this.smoke(pt.root.position, false, 0.2, 0.9);
      }
    }
  }

  get score() { return this.game.score; }
  get over() { return this.phase === 'done' && this.endT <= 0; }

  /** What a QA script needs: where things are, and (unlike the player) the hidden cook times. */
  view() {
    return {
      phase: this.phase, seed: this.seed, straw: this.straw, carrying: this.carrying, sel: this.sel, score: this.score,
      fire: { x: this.centre.x, z: this.centre.z }, cheered: this.cheered ?? null,
      piles: this.piles.map(q => ({ x: q.x, z: q.z, taken: q.taken })),
      spots: this.spots.map(s => { const gs = this.game.spots[s.i]; return { i: s.i, x: s.at.x, z: s.at.z, st: gs.st, heat: gs.heat, cook: gs.cook, win: gs.win, now: cookState(gs.heat, gs), result: gs.result }; }),
    };
  }

  dispose() {
    this.disposed = true;
    this.ctx.lock?.(false);
    if (this.light) this.g.lights?.remove(this.light);
    this.bundle.removeFromParent();
    this.restoreGrass();
    // rigged clones own a bone texture each (the geometry and materials belong to the model library)
    for (const o of this.added) { this.scene.remove(o); o.traverse(c => { if (c.isSkinnedMesh) c.skeleton?.dispose?.(); }); }
    for (const x of this.own) x.dispose?.();
    this.own.length = 0;
    const d = this.ctx.director;
    for (const it of d?.town?.people || []) d.barks?.ui?.hide?.(`roast:${it.p.id}`);
    if (this.fades > 0) this.ctx.fade?.(false, 150);
  }
}

export default {
  id: 'roast',
  async play(ctx) {
    const g = ctx.game;
    await ctx.ensureModels?.(['sweet-potato', 'straw-pile']);
    if (ctx.quit) return { score: 0, quit: true };
    const qa = typeof window !== 'undefined' ? window.__STARLINE_QA__ : null;
    const r = new RoastRound(ctx, qa?.trickSeed ?? ((Date.now() / 7) & 0xffff));
    // a late-afternoon look for the round when the hour on screen is not one already (the framework restores it)
    const h = g.shownHour ? g.shownHour() : 17;
    if (!(h >= 15 && h < 19)) ctx.setNight?.(true, 17.2);
    if (qa) qa.trickRound = r;                                                   // test hook (?qa=1 only)
    ctx.debug.view = () => r.view();
    ctx.debug.round = r;
    try {
      r.build();
      ctx.hint?.(ctx.first
        ? tx('First the fire needs straw. Walk to a straw pile and press {act}, then carry the armful here. Three will do.')
        : tx('Gather three armfuls of straw for the fire.'), 6);
      // gathering and the lighting are untimed; the clock runs while the potatoes are in the ash
      let left = ctx.roundTime || 70;
      ctx.hud?.(0, null);
      const res = await ctx.loop(dt => {
        r.update(dt);
        if (r.phase === 'cook') {
          left -= dt;
          if (left <= 0 || r.game.done) r.finishRound();
        }
        ctx.hud?.(r.score, r.phase === 'cook' ? Math.max(0, left) : null);
        if (r.over) return true;
      });
      const t = r.game.tally();
      return { score: r.score, caught: t.perfect + t.okay, quit: !!res?.quit,
        extra: tx('{p} perfect, {o} good', { p: t.perfect, o: t.okay }),
        detail: { ...t, results: r.game.spots.map(s => s.result), cheered: r.cheered || 0, seed: r.seed } };
    } finally {
      r.dispose();
      ctx.setNight?.(false);
    }
  },
  ambient() {},
  _Round: RoastRound,
};
