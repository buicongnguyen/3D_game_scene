// Night river lantern (docs/RURAL-TRICKS.md, trick 2): wade the shallows at night with the hand lantern. Its circle of
// light lies on the black water; inside it the water turns clear, the sleepy fish hold still and show every scale, and
// shrimp eyes twinkle back. Hold the circle over a fish for a second to name it (night-only fish come out too).
//
// Cheap by construction (lightweight-game-objects skill): one additive disc + one "clear water" disc, a small pool of
// fish clones (made once per round, materials cloned per fish so each can brighten on its own), shrimp eyes as ONE
// InstancedMesh, and the lantern's light borrowed from the shared LightPool (the light count never changes).
// The rules (what's in the circle, the 1 s naming hold, scoring) are pure and Node-tested.
//
// Three levels (RIVER_LEVELS): Easy is one short stretch with a quicker naming. Normal has two parts: the sleepy fish,
// then "the night deepens" and more fish (mostly the night-only ones) come out. Difficult adds two things to learn:
// fish are shy of a splash (wade softly near one: Shift, or the stick held gently, or it darts off and hides for a
// while) and a list of three kinds to find, worth a bonus.
import * as THREE from 'three';
import { river, riverHalfWidth, WATER_Y } from '../../world/layout.js';
import { FISH } from '../story.js';
import { tx, N_ } from '../../i18n/i18n.js';
import { disposeRigs, keepShallow, addCss } from './util.js';
import { creepFilter } from './bugkit.js';

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

/**
 * The levels. fish: sleepy fish in the first part; more: fish that come out in the second part ("the night deepens",
 * at `deepAt` of the round's time or when every fish so far is named); hold: seconds of light that name a fish;
 * shy: a splash near a fish sends it off (SPLASH); list: kinds on the list to find (LIST_BONUS points when all are).
 */
export const RIVER_LEVELS = {
  easy: { fish: 7, more: 0, hold: 0.8, shy: false, list: 0 },
  normal: { fish: 9, more: 5, hold: HOLD, shy: false, list: 0 },
  hard: { fish: 9, more: 6, hold: HOLD, shy: true, list: 3 },
};
export const DEEP_AT = 0.45;
export const LIST_BONUS = 5;
/** A splash: wading faster than `speed` (m/s) within `near` m of a fish not yet named sends it `dart` m off for `calm` s. */
export const SPLASH = { speed: 1.35, near: 3.2, dart: 2.6, calm: 3 };

export const riverLevel = (level, first = false) => (first ? RIVER_LEVELS.easy : RIVER_LEVELS[level] || RIVER_LEVELS.normal);

/** The kinds of the second part: mostly the fish that only come out at night. */
export function pickLate(n, rand = Math.random) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(i % 3 === 2 ? pickSpecies(1, rand)[0] : rand() < 0.5 ? 'catfish' : 'eel');
  return out;
}

/** The list to find (Difficult): `n` different kinds out of those in the water tonight, a night-only one among them. */
export function pickList(kinds, n, rand = Math.random) {
  const uniq = [...new Set(kinds)];
  for (let i = uniq.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [uniq[i], uniq[j]] = [uniq[j], uniq[i]]; }
  const out = uniq.slice(0, n), night = uniq.find(k => NIGHT_FISH[k].night);
  if (out.length && night && !out.some(k => NIGHT_FISH[k].night)) out[out.length - 1] = night;
  return out;
}

/**
 * One step of the splash rule (pure, Difficult). fish: [{ x, z, named, hold, shyT, hidden }]; (px, pz): Mika, wading at
 * `speed`. A fish that hears a splash darts away from her (f.dx, f.dz: where to, from its place) and cannot be named
 * until it has calmed down. Returns how many were startled just now.
 */
export function splashStep(fish, px, pz, speed, dt) {
  let n = 0;
  for (const f of fish) {
    if (f.shyT > 0) { f.shyT -= dt; continue; }
    if (f.named || f.hidden || speed <= SPLASH.speed) continue;
    const dx = f.x - px, dz = f.z - pz, d = Math.hypot(dx, dz);
    if (d > SPLASH.near) continue;
    const k = d > 0.05 ? SPLASH.dart / d : 0;
    f.dx = k ? dx * k : SPLASH.dart; f.dz = dz * k;
    f.shyT = SPLASH.calm; f.hold = 0;
    n++;
  }
  return n;
}

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
export function spotStep(fish, cx, cz, dt, r = RADIUS, hold = HOLD) {
  let best = null, bd = r * 0.8;
  for (const f of fish) {
    if (f.named || f.hidden || f.shyT > 0) continue;       // (not out yet, or darted off after a splash)
    const d = Math.hypot(f.x - cx, f.z - cz);
    if (d < bd) { bd = d; best = f; }
  }
  for (const f of fish) if (f !== best && !f.named) f.hold = Math.max(0, f.hold - dt * 2);
  if (!best) return null;
  best.hold += dt;
  if (best.hold >= hold) { best.named = true; best.hold = hold; return best; }
  return null;
}

/**
 * Score: one per fish named, one per new kind beyond the first, one per SHRIMP_PER_POINT shrimp eyes counted, and
 * LIST_BONUS when every kind on the list was found (list: true; Difficult).
 */
export function riverScore({ named = 0, species = 0, shrimp = 0, list = false }) {
  return named + Math.max(0, species - 1) + Math.floor(shrimp / SHRIMP_PER_POINT) + (list ? LIST_BONUS : 0);
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

// the list to find (Difficult): a row of chips under the round's pill; a chip turns green when its kind is named
const CSS = `
#riverList{position:fixed;left:50%;top:calc(70px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:15;display:flex;flex-wrap:wrap;gap:4px;justify-content:center;
 max-width:min(460px,94vw);padding:5px 8px;border-radius:16px;background:rgba(255,247,232,.93);box-shadow:0 5px 16px rgba(40,20,0,.22);
 font:700 12px Nunito,system-ui,sans-serif;color:#5a3a22;pointer-events:none;zoom:var(--ui-scale,1);width:max-content}
#riverList b{align-self:center;color:#c2541c;margin-right:2px}
#riverList span{padding:2px 7px;border-radius:999px;background:#27304f;color:#fff3d6;white-space:nowrap}
#riverList span.on{background:#3f9a52;color:#fff}
#riverList span.on::before{content:'✓ '}
#riverList span.pop{animation:riverPop .4s}
@keyframes riverPop{40%{transform:scale(1.18)}}
@media (max-width:520px){#riverList{top:calc(114px + env(safe-area-inset-top,0px))}}
@media (max-height:460px){#riverList{top:calc(62px + env(safe-area-inset-top,0px));padding:4px 8px}}
`;

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
    this.L = riverLevel(ctx.level, !!ctx.first);       // the level's plan (RIVER_LEVELS)
    this.part = 1;                                      // 2 once the night has deepened
    this.list = [];                                     // kinds to find (Difficult)
    this.listDone = false;
    this.splashes = 0;
    this.splashHint = 0;
    this.cs = { creeping: false };
  }

  add(o) { this.scene.add(o); this.added.push(o); return o; }

  build() {
    const g = this.g, p = this.player.pos, heightAt = (x, z) => g.world.heightAt(x, z);
    // stand Mika ankle-to-knee deep in the shallows nearest her
    // the shallows have an edge: she wades to her knees, not out into the channel (it used to end in a swim and a scolding)
    this.ctx?.beforeMove?.(keepShallow(this.player, heightAt, WATER_Y - 0.9));
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
    // (the fish of the second part are made now too, and wait out of sight: nothing is built in the middle of a round)
    const L = this.L;
    const spots = shallowSpots(heightAt, p.x, p.z, L.fish + L.more, { lo: 0.35, hi: 1.1, along: L.more ? 15 : 12 });
    const early = Math.min(spots.length, L.fish);
    const kinds = [...pickSpecies(early), ...pickLate(spots.length - early)];
    spots.forEach((s, i) => this.addFish(kinds[i], s, i, i >= early));
    if (!this.fish.some(f => f.hidden)) this.part = 2;
    if (L.shy) this.ctx?.beforeMove?.(creepFilter(g.input, this.cs));     // Difficult: Shift, or the stick held gently, wades softly
    if (L.list && typeof document !== 'undefined') {
      this.list = pickList(kinds, L.list);
      addCss('riverCss', CSS);
      const el = this.listEl = document.createElement('div');
      el.id = 'riverList';
      const b = document.createElement('b');
      b.textContent = tx('Find:');
      el.appendChild(b);
      this.listChips = this.list.map(k => { const s = document.createElement('span'); s.textContent = tx(NIGHT_FISH[k].name); el.appendChild(s); return s; });
      document.body.appendChild(el);
    }
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

  addFish(kind, s, i, late = false) {
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
      face: Math.random() * 6.28, ph: i * 1.7, named: false, hold: 0, calm: 0, hidden: late, shyT: 0, dx: 0, dz: 0, fade: late ? 0 : 1 };
    for (const c of mats) c.opacity = 0.2;
    root.visible = !late;
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
    // Difficult: a splash near a fish sends it darting off
    this.splashHint -= dt;
    if (this.L.shy) {
      const n = splashStep(this.fish, p.pos.x, p.pos.z, p.speed, dt);
      if (n) {
        this.splashes += n;
        audio?.splash?.(0.5);
        if (this.splashHint <= 0) {
          this.splashHint = 7;
          const stick = this.ctx.ui?.touch || g.input?.lastDevice === 'gamepad';
          this.ctx.hint?.(stick ? tx('Splash! It darted off. Push the stick gently near a fish.') : tx('Splash! It darted off. Hold Shift to wade softly near a fish.'));
        }
      }
    }
    this.swimFish(dt);
    // naming: hold the light over a fish
    const got = spotStep(this.fish, this.cx, this.cz, dt, RADIUS, this.L.hold);
    let holding = null;
    for (const f of this.fish) if (!f.named && f.hold > 0 && (!holding || f.hold > holding.hold)) holding = f;
    if (holding) {
      this.ring.position.set(holding.x, WATER_Y + 0.04, holding.z);
      const u = holding.hold / this.L.hold;
      this.ring.scale.setScalar(1.6 - u * 0.6);
      this.ring.material.opacity = 0.3 + u * 0.6;
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
      // the list to find: tick the kind off; all of them is a bonus
      const li = this.list.indexOf(got.kind);
      if (li >= 0 && fresh) {
        const chip = this.listChips?.[li];
        if (chip) { chip.classList.add('on'); chip.classList.add('pop'); }
        if (!this.listDone && this.list.every(k => this.species.has(k))) {
          this.listDone = true;
          audio?.star?.();
          this.ctx.hint?.(tx('All three on the list! Well spotted.'));
        }
      }
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
      if (f.hidden) continue;
      const shy = f.shyT > 0;
      const d = Math.hypot(f.x - this.cx, f.z - this.cz), lit = shy ? 0 : d < RADIUS ? 1 : Math.max(0, 1 - (d - RADIUS) / 1.2);
      // far from the light a fish is not drawn at all (it would only be a dark smudge); it fades in as the light comes near
      const want = d < 8 ? 1 : 0;
      f.fade += (want - f.fade) * Math.min(1, dt * 2);
      const vis = f.fade > 0.02;
      if (f.root.visible !== vis) f.root.visible = vis;
      f.calm += ((lit > 0.5 ? 1 : 0) - f.calm) * Math.min(1, dt * 2.5);
      f.ph += dt * (1 - f.calm * 0.85);
      if (shy) {
        // a splash: it darts away from her and keeps low until it has calmed down
        const nx = f.hx + f.dx, nz = f.hz + f.dz;
        if (Math.hypot(nx - f.x, nz - f.z) > 0.15) f.face = Math.atan2(nx - f.x, nz - f.z);
        f.x += (nx - f.x) * Math.min(1, dt * 3.5); f.z += (nz - f.z) * Math.min(1, dt * 3.5);
        f.ph += dt * 2;
      } else if (f.calm < 0.6) {
        f.ang += dt * 0.25 * (1 - f.calm);
        const nx = f.hx + Math.cos(f.ang + f.ph * 0.1) * 1.4, nz = f.hz + Math.sin(f.ang + f.ph * 0.1) * 1.4;
        f.face = Math.atan2(nx - f.x, nz - f.z);
        f.x += (nx - f.x) * dt * 0.5 * (1 - f.calm); f.z += (nz - f.z) * dt * 0.5 * (1 - f.calm);
      }
      f.root.position.set(f.x, f.y + Math.sin(f.ph * 1.3) * 0.02, f.z);
      f.root.rotation.set(0, f.face + Math.sin(f.ph * 6) * 0.08 * (1 - f.calm * 0.7), 0);
      const shown = (0.2 + 0.8 * lit) * f.fade, tint = NIGHT_FISH[f.kind].glow ? GLOW_COOL : GLOW_WARM, k = 0.12 + 0.3 * lit + (f.named ? 0.08 : 0);
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

  /** The second part: the night deepens and the fish that waited out of sight come out to feed. */
  deepen() {
    if (this.part >= 2) return;
    this.part = 2;
    for (const f of this.fish) if (f.hidden) { f.hidden = false; f.fade = 0; }
    this.ctx.audio?.chime?.(2);
    this.ctx.hint?.(tx('Part 2: the night deepens. More fish come out to feed!'));
  }

  get score() { return riverScore({ named: this.named, species: this.species.size, shrimp: this.shrimpSeen, list: this.listDone }); }
  get done() { return this.fish.length > 0 && this.fish.every(f => f.named); }
  /** Every fish that is out so far has been named. */
  get cleared() { return this.fish.every(f => f.named || f.hidden); }

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
    this.listEl?.remove();
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
        : r.L.shy ? tx('Wade softly near a fish, or it darts off. Find the three kinds on the list!')
          : tx('Find the sleepy fish in the lantern light, and look for twinkling shrimp eyes.'));
      const total = ctx.roundTime || 80;
      let left = total, safety = !!ctx.first;
      ctx.hud?.(0, left);
      const res = await ctx.loop(dt => {
        r.update(dt);
        left -= dt;
        if (safety && left < (ctx.roundTime || 80) - 5) { safety = false; ctx.hint?.(tx('Only with a grown-up at night, and only ankle-deep.')); }
        ctx.hud?.(r.score, Math.max(0, left));
        if (r.part < 2 && (r.cleared || left <= total * (1 - DEEP_AT))) r.deepen();
        if (left <= 0 || r.done) return true;
      });
      const named = r.fish.filter(f => f.named).map(f => f.kind);
      return { score: r.score, caught: r.named, quit: !!res?.quit,
        extra: tx('{n} kinds, {s} shrimp eyes', { n: r.species.size, s: r.shrimpSeen }),
        detail: { species: [...r.species], shrimp: r.shrimpSeen, named, all: r.done, level: ctx.level, list: r.list, listDone: r.listDone, splashes: r.splashes } };
    } finally {
      r.dispose();
      ctx.setNight?.(false);
    }
  },
  /** Not in a round: the shrimp eyes need the lantern, so the place stays as it is (the river is lovely already). */
  ambient() {},
  _Round: RiverRound,
};
