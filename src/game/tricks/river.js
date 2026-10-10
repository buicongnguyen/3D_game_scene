// Night river lantern (docs/RURAL-TRICKS.md, trick 2): wade the shallows at night with the hand lantern. Its circle of
// light lies on the black water; inside it the water turns clear, the sleepy fish hold still and show every scale, and
// shrimp eyes twinkle back. Hold the circle over a fish for a second to name it (night-only fish come out too).
//
// Cheap by construction (lightweight-game-objects skill): one additive disc + one "clear water" disc, a small pool of
// fish clones (made once per round, materials cloned per fish so each can brighten on its own), shrimp eyes as ONE
// InstancedMesh, and the lantern's light borrowed from the shared LightPool (the light count never changes).
// The rules (what's in the circle, the 1 s naming hold, scoring) are pure and Node-tested.
import * as THREE from 'three';
import { river, riverHalfWidth, WATER_Y } from '../../world/layout.js';
import { FISH } from '../story.js';
import { tx, N_ } from '../../i18n/i18n.js';
import { disposeRigs } from './util.js';

/** Fish the lantern can find. model + tint/scale reuse the existing fish art; night: only at night (not on the rod). */
export const NIGHT_FISH = {
  trout: { name: FISH.trout.name, model: 'fish-trout', w: 3 },
  char: { name: FISH.char.name, model: 'fish-trout', tint: '#9fd8b8', w: 2 },
  koi: { name: FISH.koi.name, model: 'fish-koi', w: 1 },
  starfin: { name: FISH.starfin.name, model: 'fish-starfin', w: 0.7, glow: true },
  catfish: { name: N_('River catfish'), model: 'fish-trout', tint: '#6b5a48', scale: [1.35, 1.1, 1.5], w: 2, night: true,
    desc: N_('Whiskers like a grandpa, and it only comes out after dark to feel along the bottom for supper.') },
  eel: { name: N_('Night eel'), model: 'fish-trout', tint: '#4d5a3a', scale: [0.55, 0.6, 2.4], w: 1.2, night: true,
    desc: N_('Lies in the stones all day and slides out at night like a ribbon of dark water.') },
};
export const RADIUS = 1.7;        // the circle of light on the water (m)
export const HOLD = 1;            // seconds over a fish to name it
export const SHRIMP_PER_POINT = 3;

/** Pick `n` fish species for a night round (seeded rand): every round has at least one night-only fish. */
export function pickSpecies(n, rand = Math.random) {
  const ids = Object.keys(NIGHT_FISH), total = ids.reduce((a, k) => a + NIGHT_FISH[k].w, 0), out = [];
  for (let i = 0; i < n; i++) {
    let r = rand() * total, k = ids[0];
    for (const id of ids) { r -= NIGHT_FISH[id].w; if (r <= 0) { k = id; break; } }
    out.push(k);
  }
  if (n && !out.some(k => NIGHT_FISH[k].night)) out[n - 1] = rand() < 0.6 ? 'catfish' : 'eel';
  return out;
}

/**
 * One step of naming (pure). fish: [{ x, z, named, hold }]; (cx, cz): the circle's centre. The fish nearest the centre
 * and well inside the circle gathers `hold`; every other un-named fish loses it. Returns the fish just named, or null.
 */
export function spotStep(fish, cx, cz, dt, r = RADIUS) {
  let best = null, bd = r * 0.8;
  for (const f of fish) {
    if (f.named) continue;
    const d = Math.hypot(f.x - cx, f.z - cz);
    if (d < bd) { bd = d; best = f; }
  }
  for (const f of fish) if (f !== best && !f.named) f.hold = Math.max(0, f.hold - dt * 2);
  if (!best) return null;
  best.hold += dt;
  if (best.hold >= HOLD) { best.named = true; best.hold = HOLD; return best; }
  return null;
}

/** Score: one per fish named, one per new kind beyond the first, one per SHRIMP_PER_POINT shrimp eyes counted. */
export function riverScore({ named = 0, species = 0, shrimp = 0 }) {
  return named + Math.max(0, species - 1) + Math.floor(shrimp / SHRIMP_PER_POINT);
}

/** Shallow spots (pure): points by the river near (x, z) where the water is between `lo` and `hi` m deep. */
export function shallowSpots(heightAt, x, z, n, { lo = 0.3, hi = 0.95, along = 11, rand = Math.random } = {}) {
  const w = river.nearest(x, z, 120);
  if (!w) return [];
  const out = [];
  const side = Math.sign((x - river.at(w.s).x) * -river.at(w.s).tz + (z - river.at(w.s).z) * river.at(w.s).tx) || 1;
  for (let k = 0; k < n * 40 && out.length < n; k++) {
    const p = river.at(w.s + (rand() - 0.5) * 2 * along), hw = riverHalfWidth(p.z);
    const off = side * hw * (0.35 + rand() * 0.75);
    const sx = p.x - p.tz * off, sz = p.z + p.tx * off, depth = WATER_Y - heightAt(sx, sz);
    if (depth < lo || depth > hi) continue;
    if (out.some(q => Math.hypot(q.x - sx, q.z - sz) < 0.9)) continue;
    out.push({ x: sx, z: sz, depth });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------- the round
const V = () => new THREE.Vector3();
const _v = V(), _c = new THREE.Color(), _m = new THREE.Matrix4(), _up1 = V().set(0, 1, 0);
const GLOW_COOL = new THREE.Color('#7fd8ff'), GLOW_WARM = new THREE.Color('#ffcf8a');   // what a fish gives back to the lantern

function discTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,236,190,1)');
  grd.addColorStop(0.62, 'rgba(255,214,140,0.75)');
  grd.addColorStop(0.86, 'rgba(255,190,110,0.35)');
  grd.addColorStop(1, 'rgba(255,170,90,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class RiverRound {
  constructor(ctx) {
    this.ctx = ctx;
    const g = this.g = ctx.game;
    this.player = ctx.player || g.player;
    this.scene = g.scene;
    this.added = [];
    this.fish = [];
    this.t = 0;
    this.named = 0;
    this.species = new Set();
    this.shrimpSeen = 0;
    this.cx = 0; this.cz = 0;
    this.I = 0;
  }

  add(o) { this.scene.add(o); this.added.push(o); return o; }

  build() {
    const g = this.g, p = this.player.pos, heightAt = (x, z) => g.world.heightAt(x, z);
    // stand Mika ankle-to-knee deep in the shallows nearest her
    const start = shallowSpots(heightAt, p.x, p.z, 1, { lo: 0.25, hi: 0.5, along: 6 })[0];
    if (start) {
      const w = river.nearest(start.x, start.z, 40), q = river.at(w.s);
      this.player.teleport(start.x, start.z, undefined, Math.atan2(q.tx, q.tz));
      if (g.follow) { g.follow.yaw = this.player.facing; g.follow.first = true; }
    }
    // the circle: an additive glow on the surface and, under it, a soft "clear water" disc that shows the sandy bed
    const tex = this.tex = discTexture();
    const geo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
    this.glow = this.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, color: '#ffcf86', fog: false })));
    this.glow.renderOrder = 6;
    this.clear = this.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.5, depthWrite: false, color: '#c9b48a', fog: false })));
    this.clear.renderOrder = 3;
    this.glow.name = this.clear.name = 'trick:river-circle';
    // the lantern's light, borrowed from the shared pool (fades in and out with the round)
    this.lightPos = V();
    this.light = g.lights?.add({ pos: this.lightPos, intensity: () => this.I * 9, range: 7, color: '#ffc978' });
    // fish: sleepy ones in the shallows round Mika
    const spots = shallowSpots(heightAt, p.x, p.z, 9, { lo: 0.35, hi: 1.1, along: 12 });
    const kinds = pickSpecies(spots.length);
    spots.forEach((s, i) => this.addFish(kinds[i], s, i));
    // shrimp: a scatter of pairs of eyes on the bed, one InstancedMesh
    const shrimp = this.shrimp = shallowSpots(heightAt, p.x, p.z, 26, { lo: 0.12, hi: 0.8, along: 12 })
      .map(s => ({ ...s, y: heightAt(s.x, s.z) + 0.04, a: Math.random() * 6.28, ph: Math.random() * 10, seen: false, lit: 0 }));
    const eye = new THREE.SphereGeometry(0.018, 6, 4);
    const im = this.eyes = new THREE.InstancedMesh(eye, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), Math.max(1, shrimp.length * 2));
    im.name = 'trick:shrimp-eyes';
    im.renderOrder = 7;
    im.frustumCulled = false;
    im.count = shrimp.length * 2;
    shrimp.forEach((s, i) => {
      for (const k of [0, 1]) {
        const ox = Math.cos(s.a) * (k ? 0.025 : -0.025), oz = -Math.sin(s.a) * (k ? 0.025 : -0.025);
        im.setMatrixAt(i * 2 + k, _m.makeTranslation(s.x + ox, s.y, s.z + oz));
        im.setColorAt(i * 2 + k, _c.setRGB(0, 0, 0));
      }
    });
    this.add(im);
    // a ring that fills while naming a fish
    this.ring = this.add(new THREE.Mesh(new THREE.RingGeometry(0.3, 0.36, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0, depthWrite: false, fog: false })));
    this.ring.renderOrder = 8;
    this.ring.name = 'trick:name-ring';               // (the name marks what dispose() frees)
    this.player.carry?.want('held', 'river');          // this is the one trick played with the lantern in her hand
  }

  addFish(kind, s, i) {
    const def = NIGHT_FISH[kind], a = this.g.assets;
    const m = a?.has?.(def.model) ? a.clone(def.model) : null;
    let root;
    const mats = [];
    if (m) {
      root = new THREE.Group();
      root.add(m);
      const sc = def.scale || [1, 1, 1];
      m.scale.set(m.scale.x * sc[0], m.scale.y * sc[1], m.scale.z * sc[2]);
      m.traverse(o => {
        if (!o.isMesh) return;
        o.castShadow = false;
        o.material = [o.material].flat().map(x => {
          const c = x.clone();
          if (def.tint && c.color) c.color.multiply(_c.set(def.tint));
          c.transparent = true;          // drawn after the river so the circle shows it "through clear water"
          c.depthWrite = true;
          c.fog = false;
          mats.push(c);
          return c;
        });
        if (o.material.length === 1) o.material = o.material[0];
        o.renderOrder = 5;
      });
    } else {
      // no art: a small placeholder fish (body + tail)
      root = new THREE.Group();
      const c = new THREE.MeshStandardMaterial({ color: def.tint || '#c9b9a0', transparent: true, fog: false });
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 6).scale(0.6, 0.55, 1.6), c);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.14, 4).rotateX(Math.PI / 2).translate(0, 0, -0.24), c);
      root.add(body, tail);
      const sc = def.scale || [1, 1, 1];
      root.scale.set(sc[0], sc[1], sc[2]);
      body.renderOrder = tail.renderOrder = 5;
      body.name = tail.name = 'trick:ph';
      mats.push(c);
    }
    root.name = `trick:fish-${kind}`;
    const bed = this.g.world.heightAt(s.x, s.z);
    const f = { kind, root, mats, x: s.x, z: s.z, hx: s.x, hz: s.z, y: Math.min(-0.22, bed + 0.18), ang: Math.random() * 6.28,
      face: Math.random() * 6.28, ph: i * 1.7, named: false, hold: 0, calm: 0 };
    for (const c of mats) c.opacity = 0.2;
    this.add(root);
    this.fish.push(f);
  }

  update(dt) {
    const p = this.player, g = this.g, audio = this.ctx.audio;
    this.t += dt;
    this.I = Math.min(1, this.I + dt * 1.5);
    // the circle lies ~1.4 m ahead of the lantern, on the water
    const lw = p.lanternWorld ? p.lanternWorld(_v) : _v.copy(p.pos).add(_up1);
    const fx = Math.sin(p.facing), fz = Math.cos(p.facing);
    const ax = lw.x + fx * 1.3, az = lw.z + fz * 1.3;
    const k = Math.min(1, dt * 8);
    this.cx += (ax - this.cx) * (this.t < 0.1 ? 1 : k); this.cz += (az - this.cz) * (this.t < 0.1 ? 1 : k);
    const wob = 1 + Math.sin(this.t * 2.3) * 0.03;
    this.glow.position.set(this.cx, WATER_Y + 0.03, this.cz);
    this.glow.scale.setScalar(RADIUS * 1.25 * wob);
    this.glow.material.opacity = 0.5 * this.I;
    this.clear.position.set(this.cx, WATER_Y + 0.015, this.cz);
    this.clear.scale.setScalar(RADIUS * wob);
    this.clear.material.opacity = 0.42 * this.I;
    this.lightPos.set(this.cx * 0.5 + lw.x * 0.5, lw.y + 0.25, this.cz * 0.5 + lw.z * 0.5);
    this.swimFish(dt);
    // naming: hold the light over a fish
    const got = spotStep(this.fish, this.cx, this.cz, dt);
    let holding = null;
    for (const f of this.fish) if (!f.named && f.hold > 0 && (!holding || f.hold > holding.hold)) holding = f;
    if (holding) {
      this.ring.position.set(holding.x, WATER_Y + 0.04, holding.z);
      this.ring.scale.setScalar(1.6 - holding.hold * 0.6);
      this.ring.material.opacity = 0.3 + holding.hold * 0.6;
    } else this.ring.material.opacity = Math.max(0, this.ring.material.opacity - dt * 3);
    if (got) {
      const def = NIGHT_FISH[got.kind], fresh = !this.species.has(got.kind);
      this.named++;
      this.species.add(got.kind);
      audio?.good?.();
      if (fresh) audio?.chime?.(this.species.size);
      this.ctx.hint?.(def.night ? tx('A {fish}! It only comes out at night.', { fish: tx(def.name) }) : tx('A {fish}, fast asleep.', { fish: tx(def.name) }));
      this.ctx.director?.fx?.burst?.(_v.set(got.x, WATER_Y + 0.08, got.z), { n: 10, color: [1, 0.85, 0.5], speed: 0.6, size: 0.08, gravity: -0.6 });
      const st = this.ctx.director?.q?.state;
      if (st) { st.fishSeen ??= {}; st.fishSeen[got.kind] = (st.fishSeen[got.kind] || 0) + 1; }
    }
    this.shrimpEyes(dt, audio);
    if (p.swimming && !this.warned) { this.warned = true; this.ctx.hint?.(tx('Too deep! Stay in the shallows, where the water is below your knees.')); }
    if (!p.swimming) this.warned = false;
  }

  // The two busy loops of a frame live in small methods of their own: the optimiser compiles those quickly, where the
  // same arithmetic inside the long update() ran interpreted and made a new number object for every result.
  swimFish(dt) {
    // fish: wander slowly; in the light they doze, hold still and show clearly
    for (const f of this.fish) {
      const d = Math.hypot(f.x - this.cx, f.z - this.cz), lit = d < RADIUS ? 1 : Math.max(0, 1 - (d - RADIUS) / 1.2);
      f.calm += ((lit > 0.5 ? 1 : 0) - f.calm) * Math.min(1, dt * 2.5);
      f.ph += dt * (1 - f.calm * 0.85);
      if (f.calm < 0.6) {
        f.ang += dt * 0.25 * (1 - f.calm);
        const nx = f.hx + Math.cos(f.ang + f.ph * 0.1) * 1.4, nz = f.hz + Math.sin(f.ang + f.ph * 0.1) * 1.4;
        f.face = Math.atan2(nx - f.x, nz - f.z);
        f.x += (nx - f.x) * dt * 0.5 * (1 - f.calm); f.z += (nz - f.z) * dt * 0.5 * (1 - f.calm);
      }
      f.root.position.set(f.x, f.y + Math.sin(f.ph * 1.3) * 0.02, f.z);
      f.root.rotation.set(0, f.face + Math.sin(f.ph * 6) * 0.08 * (1 - f.calm * 0.7), 0);
      const shown = 0.2 + 0.8 * lit, tint = NIGHT_FISH[f.kind].glow ? GLOW_COOL : GLOW_WARM, k = 0.12 + 0.3 * lit + (f.named ? 0.08 : 0);
      for (const c of f.mats) {
        c.opacity = shown;
        if (c.emissive) c.emissive.copy(tint).multiplyScalar(k);
      }
    }
  }

  shrimpEyes(dt, audio) {
    // shrimp eyes: they shine back only when the light faces them (inside and just around the circle), twinkling
    const im = this.eyes;
    for (let i = 0; i < this.shrimp.length; i++) {
      const s = this.shrimp[i], d = Math.hypot(s.x - this.cx, s.z - this.cz);
      const face = d < RADIUS * 1.3 ? 1 - d / (RADIUS * 1.3) : 0;
      s.ph += dt;
      const tw = 0.55 + 0.45 * Math.max(0, Math.sin(s.ph * 5.3 + i)) ** 3;
      s.lit += ((face > 0 ? 1 : 0) - s.lit) * Math.min(1, dt * 6);
      const b = s.lit * tw * (0.5 + face) * this.I;
      _c.setRGB(1.6 * b, 1.05 * b, 0.55 * b);
      im.setColorAt(i * 2, _c); im.setColorAt(i * 2 + 1, _c);
      if (!s.seen && face > 0.35 && s.lit > 0.8) {
        s.seen = true; this.shrimpSeen++;
        audio?.twinkle?.(0.8);
      }
    }
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }

  get score() { return riverScore({ named: this.named, species: this.species.size, shrimp: this.shrimpSeen }); }
  get done() { return this.fish.length > 0 && this.fish.every(f => f.named); }

  dispose() {
    if (this.light) this.g.lights?.remove(this.light);
    for (const o of this.added) {
      this.scene.remove(o);
      disposeRigs(o);                 // every fish clone is rigged: a bone texture per skinned mesh
      o.traverse?.(c => {
        if (c.isMesh && c.name.startsWith('trick:')) { c.geometry.dispose(); [c.material].flat().forEach(m => m.dispose()); }
      });
    }
    for (const f of this.fish) for (const c of f.mats) c.dispose();
    this.eyes?.dispose?.();
    this.tex?.dispose();
    this.player.carry?.release('river');
  }
}

export default {
  id: 'river',
  async play(ctx) {
    const r = new RiverRound(ctx);
    ctx.setNight?.(true);
    if (typeof window !== 'undefined' && window.__STARLINE_QA__) window.__STARLINE_QA__.trickRound = r;   // test hook (?qa=1 only)
    try {
      r.build();
      ctx.hint?.(ctx.first
        ? tx('Walk slowly through the shallows. Hold the lantern\'s light over a fish for a moment to name it.')
        : tx('Find the sleepy fish in the lantern light, and look for twinkling shrimp eyes.'));
      let left = ctx.roundTime || 80, safety = !!ctx.first;
      ctx.hud?.(0, left);
      const res = await ctx.loop(dt => {
        r.update(dt);
        left -= dt;
        if (safety && left < (ctx.roundTime || 80) - 5) { safety = false; ctx.hint?.(tx('Only with a grown-up at night, and only ankle-deep.')); }
        ctx.hud?.(r.score, Math.max(0, left));
        if (left <= 0 || r.done) return true;
      });
      const named = r.fish.filter(f => f.named).map(f => f.kind);
      return { score: r.score, caught: r.named, quit: !!res?.quit,
        extra: tx('{n} kinds, {s} shrimp eyes', { n: r.species.size, s: r.shrimpSeen }),
        detail: { species: [...r.species], shrimp: r.shrimpSeen, named, all: r.done } };
    } finally {
      r.dispose();
      ctx.setNight?.(false);
    }
  },
  /** Not in a round: the shrimp eyes need the lantern, so the place stays as it is (the river is lovely already). */
  ambient() {},
  _Round: RiverRound,
};
