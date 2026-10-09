// Frog chorus (docs/RURAL-TRICKS.md, trick 3): dusk at the paddies. The frogs sing in swells; walk while the chorus is
// loud and freeze when it goes quiet (moving in the silence sends the nearest frogs plopping into the water). Reach the
// singer on the far bund and it hops onto Mika's hand. Then the frogs line up for a call-and-answer: they croak in an
// order and Mika copies it (left/right + E, the number keys, or a tap on the frog).
//
// The rules (the chorus's swells, the sneak, the call-and-answer and the score) are pure and Node-tested; the round
// below only draws them. Cheap: up to 9 frog clones made once per round (no shadows), two rings, no lights.
import * as THREE from 'three';
import { PADDIES } from '../../world/layout.js';
import { tx } from '../../i18n/i18n.js';
import { Animator } from '../../actors/animator.js';

// ---------------------------------------------------------------------------------------------------- pure rules
/**
 * The chorus: loud → hush (it thins out: a warning) → quiet → loud again. level() is 0..1 for the sound and the HUD.
 * Moving is only wrong while it is `quiet`. gentle (the guided first try): longer songs and a longer warning.
 */
export class Chorus {
  constructor({ rand = Math.random, gentle = false } = {}) {
    this.rand = rand;
    this.gentle = gentle;
    this.phase = 'loud';
    this.t = 0;
    this.dur = this.len('loud');
    this.level = 1;
    this.cycles = 0;
  }

  len(phase) {
    const r = this.rand(), g = this.gentle;
    if (phase === 'loud') return (g ? 5 : 3.2) + r * (g ? 2 : 3);
    if (phase === 'hush') return g ? 1.4 : 0.8;
    return (g ? 1.6 : 1.8) + r * (g ? 0.8 : 1.4);       // quiet
  }

  /** Advance; returns the new phase name when it changed, else null. */
  update(dt) {
    this.t += dt;
    let changed = null;
    if (this.t >= this.dur) {
      this.phase = { loud: 'hush', hush: 'quiet', quiet: 'loud' }[this.phase];
      if (this.phase === 'loud') this.cycles++;
      this.t = 0;
      this.dur = this.len(this.phase);
      changed = this.phase;
    }
    const u = this.t / this.dur;
    this.level = this.phase === 'loud' ? Math.min(1, 0.3 + this.t / 0.4) : this.phase === 'hush' ? 1 - u * 0.85 : 0;
    return changed;
  }

  get quiet() { return this.phase === 'quiet'; }
}

export const REACH = 1.4;        // close enough to the frog to hold out a hand (m)
export const GRACE = 0.3;        // seconds of moving in the silence before the frogs notice
export const COOLDOWN = 1.4;     // after a startle, the frogs need a moment before the next one counts
export const FLEE_EVERY = 3;     // every third startle, the singer itself hops off to another spot

/**
 * One step of the sneak (pure). st: { startles, grace, cool }; moving: Mika is walking; dist: to the singer.
 * Returns 'reach' (close and not caught moving in the quiet), 'startle', 'flee' (a startle that also sends the singer
 * off), or null.
 */
export function sneakStep(st, { moving, quiet, dist, dt }) {
  st.cool = Math.max(0, (st.cool || 0) - dt);
  if (quiet && moving) st.grace = (st.grace || 0) + dt;
  else st.grace = 0;
  if (st.grace > GRACE && st.cool <= 0) {
    st.startles = (st.startles || 0) + 1;
    st.grace = 0;
    st.cool = COOLDOWN;
    return st.startles % FLEE_EVERY === 0 ? 'flee' : 'startle';
  }
  if (dist < REACH && !(quiet && moving)) return 'reach';
  return null;
}

/** Points for the sneak: 35 for a perfect stalk, 5 fewer per startle, never under 10 once reached. */
export function sneakScore(startles, reached = true) {
  return reached ? Math.max(10, 35 - 5 * startles) : 0;
}

/**
 * Call and answer: `count` frogs; rounds grow from `start` to `max` calls. press(i) → 'ok' | 'round' (copied the whole
 * call: points added, the next one is longer) | 'wrong' (the same call is played again) | 'done' (finished the longest,
 * or a second mistake). Points: 5 per call in each copied round.
 */
export class Simon {
  constructor({ count = 4, start = 3, max = 5, lives = 2, rand = Math.random } = {}) {
    Object.assign(this, { count, start, max, lives, rand });
    this.len = start;
    this.points = 0;
    this.rounds = 0;
    this.mistakes = 0;
    this.over = false;
    this.next();
  }

  /** A fresh call of the current length; no frog twice in a row. */
  next() {
    const seq = [];
    while (seq.length < this.len) {
      const i = Math.floor(this.rand() * this.count);
      if (i !== seq[seq.length - 1]) seq.push(i);
    }
    this.seq = seq;
    this.at = 0;
    return seq;
  }

  press(i) {
    if (this.over) return 'done';
    if (i !== this.seq[this.at]) {
      this.mistakes++;
      this.at = 0;
      if (this.mistakes >= this.lives) { this.over = true; return 'done'; }
      return 'wrong';
    }
    this.at++;
    if (this.at < this.seq.length) return 'ok';
    this.points += 5 * this.len;
    this.rounds++;
    if (this.len >= this.max) { this.over = true; return 'done'; }
    this.len++;
    this.next();
    return 'round';
  }
}

/** The whole round's score (stars in content/tricks.js: 30 / 60 / 90). */
export function frogsScore({ startles = 0, reached = false, simon = 0 }) {
  return sneakScore(startles, reached) + simon;
}

/** Spots along the paddy bunds within `r` m of (x, z) (pure): { x, y, z, wx, wy, wz } with a water point beside. */
export function bundSpots(x, z, r = 24, step = 1.6) {
  const out = [];
  for (const p of PADDIES) {
    if (Math.hypot(p.x - x, p.z - z) > r + 8) continue;
    const y = p.t + 0.29, wy = p.t + 0.06;
    for (let u = -p.w / 2 + 0.6; u <= p.w / 2 - 0.6; u += step) for (const sd of [-1, 1]) {
      out.push({ x: p.x + u, y, z: p.z + sd * p.d / 2, wx: p.x + u, wy, wz: p.z + sd * (p.d / 2 - 0.9) });
    }
    for (let v = -p.d / 2 + 0.6; v <= p.d / 2 - 0.6; v += step) for (const sd of [-1, 1]) {
      out.push({ x: p.x + sd * p.w / 2, y, z: p.z + v, wx: p.x + sd * (p.w / 2 - 0.9), wy, wz: p.z + v });
    }
  }
  return out.filter(s => Math.hypot(s.x - x, s.z - z) <= r);
}

/** Paddy water height at (x, z), or null when not over a paddy. */
export function paddyWater(x, z) {
  for (const p of PADDIES) if (Math.abs(x - p.x) < p.w / 2 && Math.abs(z - p.z) < p.d / 2) return p.t + 0.08;
  return null;
}

// ---------------------------------------------------------------------------------------------------- the round
const V = () => new THREE.Vector3();
const _v = V(), _w = V();
const PITCH = [0.72, 0.88, 1.06, 1.28, 1.52];

class FrogRound {
  constructor(ctx) {
    this.ctx = ctx;
    this.g = ctx.game;
    this.player = ctx.player || this.g.player;
    this.scene = this.g.scene;
    this.added = [];
    this.frogs = [];
    this.st = { startles: 0 };
    this.phase = 'sneak';
    this.simonPts = 0;
    this.reached = false;
    this.listeners = [];
  }

  add(o) { this.scene.add(o); this.added.push(o); return o; }

  makeFrog(i, tree) {
    const a = this.g.assets, names = tree ? ['frog-tree', 'frog-pond'] : ['frog-pond', 'frog-tree'];
    const name = names.find(n => a?.has?.(n));
    const root = new THREE.Group();
    root.name = 'trick:frog';
    let anim = null, sac = null, model = null;
    if (name) {
      model = a.clone(name);
      model.scale.multiplyScalar(2.8);                 // true-to-life 4-7 cm frogs, drawn larger to read
      model.traverse(o => { if (o.isMesh) { o.castShadow = false; } });
      root.add(model);
      if (model.userData.clips?.length) anim = new Animator(model);
    } else {
      // no art yet: a little green placeholder frog with a throat pouch that puffs
      const skin = new THREE.MeshStandardMaterial({ color: tree ? '#58b84a' : '#8a7a4a', roughness: 0.6 });
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 7).scale(1, 0.65, 1.15), skin);
      body.position.y = 0.06;
      const eyeM = new THREE.MeshStandardMaterial({ color: '#202020' });
      for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), eyeM); e.position.set(sx * 0.05, 0.12, 0.07); root.add(e); }
      sac = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshStandardMaterial({ color: '#f2e6b8', roughness: 0.4 }));
      sac.position.set(0, 0.04, 0.1);
      root.add(body, sac);
      root.traverse(o => { if (o.isMesh) o.name = 'trick:ph'; });
    }
    const f = { i, root, anim, sac, model, tree, pitch: PITCH[i % PITCH.length] * (tree ? 1 : 1), x: 0, y: 0, z: 0, face: 0,
      st: 'sit', hop: null, croakT: Math.random() * 2, puff: 0, wet: 0 };
    this.add(root);
    return f;
  }

  build() {
    const g = this.g, p = this.player.pos;
    const spots = bundSpots(p.x, p.z, 22).filter(s => Math.hypot(s.x - p.x, s.z - p.z) > 4);
    for (let k = spots.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [spots[k], spots[j]] = [spots[j], spots[k]]; }
    // the singer: a spot 9-16 m off; the others anywhere round it
    const dist = s => Math.hypot(s.x - p.x, s.z - p.z);
    const target = spots.find(s => dist(s) > 9 && dist(s) < 16) || spots.sort((a, b) => dist(b) - dist(a))[0];
    if (!target) return false;
    this.spots = spots;
    const chosen = [target, ...spots.filter(s => s !== target && spots.indexOf(s) % 2 === 0).slice(0, 8)];
    chosen.forEach((s, i) => {
      const f = this.makeFrog(i, i % 3 === 1);
      f.home = s; f.x = s.x; f.y = s.y; f.z = s.z;
      f.face = Math.atan2(p.x - s.x, p.z - s.z) + (Math.random() - 0.5);
      this.frogs.push(f);
    });
    this.singer = this.frogs[0];
    this.singer.pitch = 0.95;
    // a soft marker ring under the singer, and two rings for the call-and-answer
    const ringGeo = new THREE.RingGeometry(0.2, 0.26, 28).rotateX(-Math.PI / 2);
    const ring = color => { const m = this.add(new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, fog: false }))); m.name = 'trick:ring'; m.renderOrder = 8; return m; };
    this.mark = ring('#ffe89a');
    this.selRing = ring('#ffffff');
    this.callRing = ring('#ffd23f');
    this.chorus = new Chorus({ gentle: !!this.ctx.first });
    g.follow && (g.follow.first = false);
    return true;
  }

  // ------------------------------------------------------------ frog motion
  hop(f, x, y, z, dur = 0.38, arc = 0.3, then = 'sit') {
    f.hop = { fx: f.x, fy: f.y, fz: f.z, x, y, z, u: 0, dur, arc, then };
    f.face = Math.atan2(x - f.x, z - f.z);
    f.st = 'hop';
    if (f.anim?.has('Hop')) f.anim.once('Hop', { then: then === 'swim' ? 'Swim' : 'Idle', speed: 1.3 });
  }

  croak(f, vol = 1) {
    f.puff = 1;
    if (f.anim?.has('Croak')) f.anim.once('Croak', { then: 'Idle' });
    this.ctx.audio?.croak?.(vol, f.pitch, f.tree ? 'tree' : 'pond');
  }

  moveFrogs(dt) {
    const p = this.player.pos;
    for (const f of this.frogs) {
      if (f.st === 'hop') {
        const h = f.hop;
        h.u = Math.min(1, h.u + dt / h.dur);
        f.x = h.fx + (h.x - h.fx) * h.u; f.z = h.fz + (h.z - h.fz) * h.u;
        f.y = h.fy + (h.y - h.fy) * h.u + Math.sin(Math.PI * h.u) * h.arc;
        if (h.u >= 1) {
          f.st = h.then;
          if (h.then === 'swim') { f.wet = 4 + Math.random() * 3; this.ctx.audio?.plop?.(Math.max(0.2, 1 - Math.hypot(f.x - p.x, f.z - p.z) / 20)); this.g.director?.fx?.ripple?.(f.x, f.z); }
        }
      } else if (f.st === 'swim') {
        f.y = f.hop.y - 0.04 + Math.sin(performance.now() / 300 + f.i) * 0.01;
        if ((f.wet -= dt) <= 0 && this.phase === 'sneak' && f !== this.singer) this.hop(f, f.home.x, f.home.y, f.home.z, 0.4, 0.25);
      }
      if (f.puff > 0) f.puff = Math.max(0, f.puff - dt * 2.5);
      if (f.sac) f.sac.scale.setScalar(1 + Math.sin(Math.min(1, f.puff) * Math.PI) * 1.4);
      if (f.st !== 'hand') { f.root.position.set(f.x, f.y, f.z); f.root.rotation.set(0, f.face, 0); }
      f.anim?.update(dt);
    }
  }

  // ------------------------------------------------------------ phases
  sneak(dt) {
    const p = this.player, ch = this.chorus;
    const changed = ch.update(dt);
    if (changed === 'quiet') this.ctx.hint?.(tx('Shh… the frogs stopped. Freeze!'));
    else if (changed === 'loud') this.ctx.hint?.(tx('They\'re singing again. Go!'));
    // the chorus: each frog croaks now and then while it's loud, thinning out in the hush
    const rate = ch.phase === 'loud' ? 1 : ch.phase === 'hush' ? 0.3 : 0;
    for (const f of this.frogs) {
      if (f.st !== 'sit' || !rate) continue;
      if ((f.croakT -= dt * rate) <= 0) {
        f.croakT = 0.9 + Math.random() * 1.6;
        const d = Math.hypot(f.x - p.pos.x, f.z - p.pos.z);
        this.croak(f, Math.max(0.15, 1 - d / 26) * (f === this.singer ? 1 : 0.8));
      }
    }
    const dist = Math.hypot(this.singer.x - p.pos.x, this.singer.z - p.pos.z);
    const moving = p.speed > 0.35;
    const ev = this.singer.st === 'sit' ? sneakStep(this.st, { moving, quiet: ch.quiet, dist, dt }) : null;
    if (ev === 'startle' || ev === 'flee') {
      // the nearest frogs that are still out jump in
      const near = this.frogs.filter(f => f.st === 'sit' && f !== this.singer).sort((a, b) => Math.hypot(a.x - p.pos.x, a.z - p.pos.z) - Math.hypot(b.x - p.pos.x, b.z - p.pos.z)).slice(0, 2);
      for (const f of near) this.hop(f, f.home.wx, f.home.wy, f.home.wz, 0.45, 0.4, 'swim');
      this.ctx.audio?.bad?.();
      if (ev === 'flee') {
        const s = this.spots.filter(q => !this.frogs.some(f => f.home === q) && Math.hypot(q.x - p.pos.x, q.z - p.pos.z) > 7)
          .sort(() => Math.random() - 0.5)[0];
        if (s) { this.singer.home = s; this.hop(this.singer, s.x, s.y, s.z, 1.2, 1.2); }
        this.ctx.hint?.(tx('Oh! The singer hopped away. Find it by its voice.'));
      } else this.ctx.hint?.(tx('Plop! You moved in the quiet.'));
    }
    // the marker under the singer glows in time with its croak
    const s = this.singer;
    this.mark.position.set(s.x, s.y + 0.02, s.z);
    this.mark.material.opacity = (0.25 + s.puff * 0.5) * (dist < 25 ? 1 : 0);
    this.mark.scale.setScalar(1 + s.puff * 0.4);
    if (ev === 'reach') this.onReach();
  }

  onReach() {
    const p = this.player, s = this.singer;
    this.reached = true;
    this.phase = 'hand';
    this.handT = 0;
    this.mark.material.opacity = 0;
    p.turnTo?.(Math.atan2(s.x - p.pos.x, s.z - p.pos.z), 1, 50);
    p.gesture?.('Interact', { lock: false });
    this.hop(s, s.x, s.y + 0.2, s.z, 0.35, 0.3, 'hand');
    this.ctx.audio?.good?.();
    this.ctx.hint?.(tx('It hopped onto your hand! Cool and light, and very calm.'));
  }

  hand(dt) {
    const s = this.singer, p = this.player;
    this.handT += dt;
    if (s.st === 'hand') {
      const grip = p.grip || p.model;
      grip?.getWorldPosition?.(_v) ?? _v.copy(p.pos).add({ x: 0, y: 1, z: 0 });
      s.root.position.set(_v.x, _v.y + 0.08, _v.z);
      s.root.rotation.set(0, p.facing + Math.PI, 0);
      if (this.handT > 0.8 && this.handT - dt <= 0.8) this.croak(s, 1);
    }
    if (this.handT > 2.4) {
      s.st = 'sit'; s.x = s.root.position.x; s.y = s.root.position.y; s.z = s.root.position.z;
      this.startSimon();
    }
  }

  startSimon() {
    const p = this.player, g = this.g, first = !!this.ctx.first;
    this.phase = 'simon';
    this.ctx.lock?.(true);
    // four (three on the first try) frogs hop into a row in front of Mika
    const n = first ? 3 : 4, fx = Math.sin(p.facing), fz = Math.cos(p.facing), rx = Math.cos(p.facing), rz = -Math.sin(p.facing);
    this.row = [];
    const pool = [this.singer, ...this.frogs.filter(f => f !== this.singer)];
    for (let k = 0; k < n; k++) {
      const f = pool[k], off = (k - (n - 1) / 2) * 0.75;
      const x = p.pos.x + fx * 2.1 + rx * off, z = p.pos.z + fz * 2.1 + rz * off;
      const y = Math.max(g.world.heightAt(x, z), paddyWater(x, z) ?? -1e9);
      f.pitch = PITCH[k + (n === 3 ? 1 : 0)];
      f.wet = 0;
      this.hop(f, x, y, z, 0.5 + k * 0.08, 0.45, 'sit');
      f.face = Math.atan2(p.pos.x - x, p.pos.z - z);
      f.root.scale.setScalar(1.5);                  // a little larger for the call-and-answer close-up
      this.row.push(f);
    }
    for (const f of this.frogs) if (!this.row.includes(f) && f.st !== 'swim') this.hop(f, f.home.wx, f.home.wy, f.home.wz, 0.45, 0.4, 'swim');
    // frame the row from behind Mika's shoulder
    const mid = V().set(p.pos.x + fx * 2.1, p.pos.y + 0.2, p.pos.z + fz * 2.1);
    g.follow?.cutscene?.({ pos: V().set(p.pos.x - fx * 0.6 - rx * 0.9, p.pos.y + 3.2, p.pos.z - fz * 0.6 - rz * 0.9), look: mid }, 0.9);
    this.simon = new Simon({ count: n, start: first ? 2 : 3, max: first ? 3 : 5 });
    this.sel = Math.floor(n / 2);
    this.show = { i: -1, t: -1.4 };          // a beat for the frogs to settle, then the call
    this.ctx.hint?.(first
      ? tx('Listen to the order they sing in, then copy it: choose with left/right and press E, or tap the frogs.')
      : tx('Copy the frogs\' song: same order!'));
    this.listen();
  }

  /** Number keys and taps choose a frog directly (removed in dispose). */
  listen() {
    const onKey = e => { const k = +e.key; if (k >= 1 && k <= this.row.length) this.press(k - 1); };
    const el = this.g.renderer?.renderer?.domElement;
    const onTap = e => {
      if (!el || this.phase !== 'simon') return;
      const r = el.getBoundingClientRect();
      let best = -1, bd = 70;
      this.row.forEach((f, i) => {
        _w.set(f.x, f.y + 0.1, f.z).project(this.g.camera);
        const sx = r.left + (_w.x + 1) / 2 * r.width, sy = r.top + (1 - _w.y) / 2 * r.height, d = Math.hypot(sx - e.clientX, sy - e.clientY);
        if (d < bd) { bd = d; best = i; }
      });
      if (best >= 0) { this.sel = best; this.press(best); }
    };
    addEventListener('keydown', onKey);
    el?.addEventListener('pointerdown', onTap);
    this.listeners.push(() => removeEventListener('keydown', onKey), () => el?.removeEventListener('pointerdown', onTap));
  }

  press(i) {
    if (this.phase !== 'simon' || this.show.i >= 0 || this.show.t < 0 || this.simon.over) return;
    const f = this.row[i];
    this.croak(f, 1);
    this.flash(f, this.callRing);
    const r = this.simon.press(i);
    this.simonPts = this.simon.points;
    if (r === 'round') { this.ctx.audio?.good?.(); this.ctx.hint?.(tx('Perfect! A longer song now…')); this.show = { i: -1, t: -1.2 }; }
    else if (r === 'wrong') { this.ctx.audio?.bad?.(); this.ctx.hint?.(tx('Not quite. Listen again…')); this.show = { i: -1, t: -1.2 }; }
    else if (r === 'done') { this.endT = 1.4; this.ctx.audio?.[this.simon.mistakes >= this.simon.lives ? 'bad' : 'fanfare']?.(); }
  }

  flash(f, ring) { ring.position.set(f.x, f.y + 0.02, f.z); ring.material.opacity = 0.9; ring.userData.f = f; }

  simonStep(dt) {
    const inp = this.g.input, sh = this.show;
    // play the call: one frog every 0.75 s (0.95 on the first try)
    if (sh.i >= 0 || sh.t < 0) {
      sh.t += dt;
      const gap = this.ctx.first ? 0.95 : 0.75;
      if (sh.t >= 0 && sh.t >= (sh.i + 1) * gap) {
        sh.i++;
        if (sh.i < this.simon.seq.length) { const f = this.row[this.simon.seq[sh.i]]; this.croak(f, 1); this.flash(f, this.callRing); }
        else { sh.i = -1; sh.t = 0; this.ctx.hint?.(tx('Your turn!')); }
      }
    } else if (inp && !this.simon.over) {
      const mx = inp.move?.x || 0;
      if (Math.abs(mx) > 0.55 && !this.stickHeld) { this.stickHeld = true; this.sel = Math.max(0, Math.min(this.row.length - 1, this.sel + Math.sign(mx))); this.ctx.audio?.click?.(); }
      if (Math.abs(mx) < 0.3) this.stickHeld = false;
      if (inp.pressed?.('act') || inp.pressed?.('jump')) this.press(this.sel);
    }
    const sf = this.row[this.sel];
    this.selRing.position.set(sf.x, sf.y + 0.015, sf.z);
    this.selRing.material.opacity = sh.i < 0 && sh.t >= 0 && !this.simon.over ? 0.55 + Math.sin(performance.now() / 160) * 0.2 : 0;
    this.callRing.material.opacity = Math.max(0, this.callRing.material.opacity - dt * 1.6);
    this.callRing.scale.setScalar(1 + (0.9 - this.callRing.material.opacity) * 0.6);
    if (this.endT !== undefined) this.endT -= dt;
  }

  update(dt) {
    if (this.phase === 'sneak') this.sneak(dt);
    else if (this.phase === 'hand') this.hand(dt);
    else if (this.phase === 'simon') this.simonStep(dt);
    this.moveFrogs(dt);
  }

  get score() { return frogsScore({ startles: this.st.startles, reached: this.reached, simon: this.simonPts }); }
  get done() { return this.phase === 'simon' && this.endT !== undefined && this.endT <= 0; }

  dispose() {
    for (const off of this.listeners) off();
    this.listeners.length = 0;
    this.ctx.lock?.(false);
    this.g.follow?.clearCutscene?.(false);
    for (const o of this.added) {
      this.scene.remove(o);
      o.traverse?.(c => { if (c.isMesh && c.name.startsWith('trick:')) { c.geometry.dispose(); [c.material].flat().forEach(m => m.dispose()); } });
    }
  }
}

export default {
  id: 'frogs',
  async play(ctx) {
    const g = ctx.game, r = new FrogRound(ctx);
    // a dusk look for the round when the hour on screen is not dusk already (the framework restores it)
    const h = g.shownHour ? g.shownHour() : 19.5;
    if (!(h >= 17.5 && h < 22.5)) ctx.setNight?.(true, 19.4);
    if (typeof window !== 'undefined' && window.__STARLINE_QA__) window.__STARLINE_QA__.trickRound = r;   // test hook (?qa=1 only)
    try {
      if (!r.build()) return { score: 0, quit: true };
      ctx.hint?.(ctx.first
        ? tx('Sneak up on the singing frog on the far bund. Walk while they sing; freeze when they go quiet.')
        : tx('Walk while the frogs sing, freeze when they stop.'));
      // the sneak has the round's time; the call-and-answer after it is untimed (it ends by itself)
      let left = ctx.roundTime || 70;
      ctx.hud?.(0, left);
      const res = await ctx.loop(dt => {
        r.update(dt);
        if (r.phase === 'sneak') left -= dt;
        ctx.hud?.(r.score, r.phase === 'sneak' ? Math.max(0, left) : null);
        if (r.done || (r.phase === 'sneak' && left <= 0)) return true;
      });
      const sm = r.simon;
      return { score: r.score, caught: r.reached ? 1 : 0, quit: !!res?.quit,
        extra: r.reached ? tx('{n} songs copied', { n: sm?.rounds || 0 }) : tx('The frog got away'),
        detail: { startles: r.st.startles, rounds: sm?.rounds || 0, simon: r.simonPts } };
    } finally {
      r.dispose();
      ctx.setNight?.(false);
    }
  },
  ambient() {},
  _Round: FrogRound,
};
