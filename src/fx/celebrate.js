import * as THREE from 'three';
import { river, riverHalfWidth, WATER_Y } from '../world/layout.js';
import { SpriteSystem, GlowPoints, KIND, U, lin } from './cel-sprites.js';
import { Rainbow, Aurora, StarSnow, FireflyRiver } from './cel-sky.js';
import { RiverWave, BlossomGlow } from './cel-wave.js';
import { Butterflies, Ripples, bubbleMaterial } from './cel-critters.js';
import { KodamaPool } from './cel-kodama.js';
import { SkyTrain } from './cel-train.js';
import { PetalStar } from './cel-star.js';
import { Decor } from './cel-decor.js';

/*
 * Celebration & fantasy effects for the lamp-lighting endings (see the API list in the class doc).
 * Everything is pooled and built at construction (one shader compile up front); effects are driven by
 * `update(dt)` on the game clock, so they pause with the game. No lights are created: the light pool gets
 * extra *sources* (constant light count) where an effect should light the valley.
 */

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOutBack = x => { const c = 1.9; x = clamp01(x); return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const toVec = p => (p?.isVector3 ? p.clone() : Array.isArray(p) ? v3(p[0], p[1], p[2]) : v3(p?.x, p?.y, p?.z));

const PINKS = [lin('#ff7eb6'), lin('#ff9cc8'), lin('#ff5a9e'), lin('#ffb8d8'), lin('#ff86b0'), lin('#ffe4f0'), lin('#ff6aa8')];
const GOLDS = [lin('#ffd46a', 2.2), lin('#ffe9a8', 2.2), lin('#ffb640', 2.2), lin('#fff6dc', 2)];
const FESTIVE = ['#ff4a5a', '#ffcf3a', '#3ab8ff', '#4ee07a', '#ff7ad0', '#ff9a2a', '#b07aff', '#ffffff'];
const hueColor = (h, k = 1.8) => { const c = new THREE.Color().setHSL(((h % 1) + 1) % 1, 1, 0.6); return [c.r * k, c.g * k, c.b * k]; };
const _p = v3(), _v = v3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = v3(), _e = new THREE.Euler();
const _q2 = v3(), _q3 = v3(), _e3 = v3();

/**
 * const c = new Celebrate(game); call c.update(dt) every frame.
 * One-shots return a Promise that resolves when the effect has finished; persistent effects return a
 * handle { stop(), promise } (stop() fades out). See each method for arguments and rough duration.
 */
export class Celebrate {
  constructor(game) {
    this.g = game;
    const q = game.renderer?.q?.name || 'Medium';
    this.tier = q.toLowerCase();
    this.k = q === 'Low' ? 0.5 : q === 'High' ? 1.25 : 1;
    this.sound = true;
    this.t = 0;
    this.tasks = [];
    this.root = new THREE.Group();
    this.root.name = 'celebrate';
    game.scene.add(this.root);
    const K = this.k;
    this.glow = new SpriteSystem(Math.round(7000 * K), { additive: true, renderOrder: 7 });
    this.solid = new SpriteSystem(Math.round(6000 * K), { additive: false, renderOrder: 6 });
    this.root.add(this.solid.points, this.glow.points);
    this.rainbowFx = new Rainbow();
    this.auroraFx = new Aurora();
    this.snowFx = new StarSnow(Math.round(3200 * K));
    this.ff = new FireflyRiver(Math.round(5200 * K));
    this.wave = new RiverWave();
    this.star = new PetalStar(Math.round(1600 * K), Math.round(380 * K));
    this.bflies = new Butterflies(Math.round(72 * Math.max(0.6, K)));
    this.kod = new KodamaPool(24);
    this.ripples = new Ripples(32);
    this.train = new SkyTrain(3.2);
    this.root.add(this.rainbowFx.mesh, this.auroraFx.mesh, this.snowFx.points, this.ff.points, this.ff.ribbon, this.wave.mesh,
      this.star.group, this.bflies.mesh, this.kod.group, this.train.group, this.ripples.mesh);
    this.blossom = new BlossomGlow(game.foliage);
    this.bubbleGeo = new THREE.SphereGeometry(1, 28, 18);
    this.bubbleMat = bubbleMaterial();
    this.decor = new Decor(game);
    this.aur = { cur: 0, target: 0 };
    this.snow = { cur: 0, target: 0 };
    this.lanternSets = [];
    this.koi = [];
    this.precompile();
  }

  /** Compile every celebration material now (while loading), not in the middle of a cutscene. */
  precompile() {
    const g = this.g, r = g.renderer?.renderer;
    if (!r?.compile || !g.camera) return;
    const probe = new THREE.Group();
    const bub = new THREE.Mesh(this.bubbleGeo, this.bubbleMat);
    probe.add(bub, this.decor.probe());
    this.root.add(probe);
    try {
      r.compile(this.root, g.camera, g.scene);
      if (g.foliage?.group && this.blossom.mats.length) r.compile(g.foliage.group, g.camera, g.scene);
    } catch (e) { console.warn('celebrate precompile', e); }
    this.root.remove(probe);
  }

  // ---------------------------------------------------------------------------------------------- plumbing
  run(step, onStop) {
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    const task = { t: 0, step, onStop, done: false, resolve };
    this.tasks.push(task);
    promise.task = task;
    return promise;
  }

  finish(task) {
    if (task.done) return;
    task.done = true;
    task.onStop?.();
    task.resolve();
  }

  /** End every running effect at once (e.g. a skipped cutscene). Persistent effects fade out. */
  stopAll() {
    for (const t of this.tasks) this.finish(t);
    this.tasks.length = 0;
    this.aurora(false);
    this.starSnow(false);
    for (const h of [...this.lanternSets]) h.stop(true);
  }

  /** Remove everything from the scene (stops effects, restores borrowed materials and sheep). */
  dispose() {
    this.stopAll();
    for (const t of this.tasks) this.finish(t);
    this.tasks.length = 0;
    this.decor.set(0);
    this.g.scene.remove(this.root, this.decor.group);
  }

  get night() { return this.g.night ?? this.g.world?.sky?.state?.night ?? 0; }

  light(pos, intensity, range = 26, color = '#ffc861') {
    return this.g.lights?.add?.({ pos, intensity, range, color }) || null;
  }
  unlight(src) { if (src) this.g.lights?.remove?.(src); }

  sfx(name, ...a) { if (this.sound) { try { this.g.audio?.[name]?.(...a); } catch { /* audio is optional */ } } }

  /** A radial burst of sprites. */
  spray(p, { n = 40, colors = GOLDS, speed = 5, life = 1.6, size = 0.35, kind = KIND.SPARK, gravity = 1, drag = 1.4, solid = false, up = 0.3, spin = 0, twinkle = 0.8, flutter = 0, swirl = 0, grow = 0, alpha = 1 } = {}) {
    const sys = solid ? this.solid : this.glow;
    for (let i = 0; i < n; i++) {
      _v.set(Math.random() - 0.5, Math.random() - 0.5 + up, Math.random() - 0.5).normalize().multiplyScalar(speed * rand(0.35, 1));
      sys.emit(p, _v, { life: life * rand(0.6, 1.2), size: size * rand(0.6, 1.3), color: pick(colors), kind, gravity, drag, spin: spin * rand(-1, 1), twinkle, flutter, swirl, center: p, grow, alpha });
    }
  }

  // ---------------------------------------------------------------------------------------------- 1. blossom wave
  /**
   * A golden light wave races down the river from arc length riverS0 to riverS1 (either direction) in
   * `seconds`, throwing up a spiralling storm of pink petals; sakura near the river flare pink as it
   * passes and keep glowing for `linger` s after the crest arrives. `from` (e.g. the lamp flame) bursts
   * first and sends a streak of light to the river. Resolves after ~0.7 + seconds + 2.6 s (the trees'
   * afterglow then fades by itself over the next linger + 2.5 s).
   */
  blossomWave(from, riverS0, riverS1, seconds = 8, { linger = 4 } = {}) {
    const g = this.g, K = this.k;
    const s0 = Math.max(0, Math.min(river.length, riverS0)), s1 = Math.max(0, Math.min(river.length, riverS1));
    const dir = Math.sign(s1 - s0) || 1;
    const y = WATER_Y + (g.world?.frozen ? 0.14 : 0.08);
    const origin = from ? toVec(from) : null;
    this.wave.build(s0, s1, y + 0.04);
    const W = this.wave.uniforms;
    W.uDir.value = dir; W.uTrail.value = 38; W.uA.value = 0; W.uHead.value = s0;
    this.wave.mesh.visible = true;
    const start = river.at(s0), end = river.at(s1);
    this.blossom.track(start.x, start.z, end.x, end.z, 90);
    const lo = Math.min(s0, s1) - 12, hi = Math.max(s0, s1) + 12;
    const trees = [];
    for (const t of g.placed?.trees ?? []) {
      if (t.model !== 'tree-sakura' || t.far) continue;
      const n = river.nearest(t.x, t.z, 90);
      if (n && n.s > lo && n.s < hi) trees.push({ t, s: n.s, done: false });
    }
    const head = v3();
    const lamp = { I: 0 };
    const src = this.light(head, () => lamp.I, 30, '#ffc45e');
    if (origin) {
      this.spray(origin, { n: Math.round(90 * K), speed: 7, life: 1.8, size: 0.55, gravity: -0.2, kind: KIND.STAR });
      this.spray(origin, { n: Math.round(50 * K), colors: PINKS, speed: 6, life: 3.5, size: 0.4, kind: KIND.PETAL, solid: true, gravity: 1, drag: 1.1, spin: 5, flutter: 0.3, twinkle: 0 });
      this.glow.emit(origin, _v.set(0, 0, 0), { life: 0.8, size: 3, color: [2.4, 1.6, 0.7], kind: KIND.RING, grow: 2.2, alpha: 0.7 });
      this.glow.emit(origin, _v.set(0, 0, 0), { life: 0.6, size: 7, color: [2.2, 1.5, 0.8], kind: KIND.GLOW, alpha: 0.6 });
    }
    let acc = 0, accG = 0, accB = 0, after = 0;
    const lead = origin ? 0.7 : 0;   // the streak from the lamp down to the river
    this.sfx('star');
    return this.run((dt, t, task) => {
      if (origin && t < lead) {
        const k = t / lead;
        _p.set(origin.x + (start.x - origin.x) * k, origin.y + (y + 0.5 - origin.y) * k, origin.z + (start.z - origin.z) * k);
        for (let i = 0; i < 4; i++) this.glow.emit(_p, _v.set(rand(-1, 1), rand(-0.5, 1), rand(-1, 1)), { life: 1.1, size: rand(0.3, 0.7), color: pick(GOLDS), kind: KIND.SPARK, drag: 1, twinkle: 1 });
        this.glow.emit(_p, _v.set(0, 0, 0), { life: 0.35, size: 2.2, color: [2.2, 1.5, 0.6], kind: KIND.GLOW, alpha: 0.6 });
        return false;
      }
      const tw = t - lead;
      const k = clamp01(tw / seconds);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      const s = s0 + (s1 - s0) * (0.2 * k + 0.8 * e);
      const p = river.at(s), hw = riverHalfWidth(p.z) * 0.85;
      head.set(p.x, y + 1.6, p.z);
      const running = tw < seconds;
      const fadeOut = 1 - smooth(seconds, seconds + 2.6, tw);
      W.uHead.value = s;
      W.uA.value = smooth(0, 0.6, tw) * fadeOut;
      lamp.I = fadeOut * (14 + 26 * this.night) * smooth(0, 0.5, tw);
      if (running) {
        const nx = -p.tz, nz = p.tx, tx = p.tx * dir, tz = p.tz * dir;
        // the petal storm: spiralling columns thrown up off the crest
        acc += dt * 460 * K;
        while (acc > 1) {
          acc--;
          const off = rand(-1, 1) * hw;
          _p.set(p.x + nx * off, y + 0.3, p.z + nz * off);
          const out = Math.sign(off || 1) * rand(1, 5);
          _v.set(nx * out + tx * rand(2, 7), rand(5, 13), nz * out + tz * rand(2, 7));
          this.solid.emit(_p, _v, { life: rand(5.5, 8.5), size: rand(0.34, 0.6), color: pick(PINKS), kind: KIND.PETAL, gravity: 1.2, drag: 0.8, flutter: rand(0.25, 0.6), spin: rand(2, 6) * (Math.random() < 0.5 ? -1 : 1), swirl: rand(0.6, 1.6) * (Math.random() < 0.5 ? -1 : 1), center: head });
        }
        // golden sparkles climbing with them
        accG += dt * 150 * K;
        while (accG > 1) {
          accG--;
          const off = rand(-1, 1) * hw;
          _p.set(p.x + nx * off, y + rand(0.2, 1.2), p.z + nz * off);
          this.glow.emit(_p, _v.set(nx * rand(-2, 2) + tx * 2, rand(3, 10), nz * rand(-2, 2) + tz * 2), { life: rand(1.4, 2.8), size: rand(0.3, 0.7), color: pick(GOLDS), kind: Math.random() < 0.6 ? KIND.SPARK : KIND.STAR, gravity: 0.5, drag: 0.9, twinkle: 1, swirl: 0.9, center: head });
        }
        // the crest itself: a line of light across the river
        accB += dt * 40;
        while (accB > 1) {
          accB--;
          const off = rand(-1, 1) * hw;
          _p.set(p.x + nx * off - tx * Math.abs(off) * 0.25, y + 0.5, p.z + nz * off - tz * Math.abs(off) * 0.25);
          this.glow.emit(_p, _v.set(tx * 4, rand(0.5, 1.5), tz * 4), { life: 0.5, size: rand(2.2, 3.8), color: [1.9, 1.05, 0.3], kind: KIND.GLOW, alpha: 0.26, grow: 0.5 });
        }
      } else after += dt;
      // sakura flare as the crest passes them
      for (const tr of trees) {
        if (tr.done || (s - tr.s) * dir < -6) continue;
        tr.done = true;
        const T = tr.t, crown = v3(T.x, T.y + 4.3 * T.s, T.z);
        this.spray(crown, { n: Math.round(110 * K), colors: PINKS, speed: 7, life: 6, size: 0.45, kind: KIND.PETAL, solid: true, gravity: 1, drag: 1, spin: 5, twinkle: 0, flutter: 0.4, up: 0.5 });
        this.spray(crown, { n: Math.round(40 * K), colors: [lin('#ff6aa8', 2.4), lin('#ffc0dc', 2.2), ...GOLDS], speed: 5, life: 2, size: 0.55, gravity: 0.1 });
        this.glow.emit(crown, _v.set(0, 0, 0), { life: 1.4, size: 13 * T.s, color: [1.9, 0.55, 1.0], kind: KIND.GLOW, alpha: 0.5, grow: 0.3 });
      }
      const glow = 0.95 * smooth(0, 1, tw) * (1 - smooth(seconds + linger, seconds + linger + 2.5, tw));
      this.blossom.set(head.x, head.z, 30, 2.6 * fadeOut * smooth(0, 0.6, tw), glow);
      if (tw > seconds + 2.6) task.resolve();   // the wave is over; the trees' afterglow fades on its own
      return tw > seconds + linger + 2.6;
    }, () => {
      this.wave.mesh.visible = false;
      this.blossom.set(0, 0, 30, 0, 0);
      this.unlight(src);
    });
  }

  // ---------------------------------------------------------------------------------------------- 2. koi
  koiSlot() {
    let k = this.koi.find(x => !x.busy);
    if (k) return k;
    if (this.koi.length >= 12) return null;
    const obj = this.g.assets?.clone?.('fish-koi');
    if (!obj) return null;
    obj.traverse(o => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
    const mixer = new THREE.AnimationMixer(obj);
    const clip = (obj.userData.clips || []).find(c => c.name === 'Swim');
    if (clip) mixer.clipAction(clip).play();
    const holder = new THREE.Group();
    holder.add(obj);
    holder.visible = false;
    this.root.add(holder);
    k = { obj: holder, mixer, busy: false };
    this.koi.push(k);
    return k;
  }

  /**
   * `n` koi leap in staggered arcs from `a` to `b` (river-surface points, e.g. bank to bank) trailing
   * rainbow sparkles, with spray and ripples on take-off and splash-down. Options: height (4.2 m),
   * duration (1.5 s per leap), stagger (0.34 s), scale (4.2 x the model: ~1.9 m magic koi).
   * ~ n * stagger + duration s.
   */
  koiArc(a, b, n = 7, { height = 4.2, duration = 1.5, stagger = 0.34, scale = 4.2 } = {}) {
    const A = toVec(a), B = toVec(b);
    const span = B.clone().sub(A), side = v3(-span.z, 0, span.x).normalize();
    const leaps = [];
    for (let i = 0; i < n; i++) {
      const j = rand(-2.2, 2.2), l = rand(-1, 1);
      leaps.push({
        t0: i * stagger + rand(0, 0.12), a: A.clone().addScaledVector(side, j + l * 0.5), b: B.clone().addScaledVector(side, j - l * 0.5),
        h: height * rand(0.8, 1.2), dur: duration * rand(0.9, 1.12), slot: null, state: 0, hue: Math.random(),
      });
    }
    const wy = WATER_Y + (this.g.world?.frozen ? 0.14 : 0.05);
    const splash = (p, big) => {
      const w = v3(p.x, wy + 0.1, p.z);
      // spray: a crown of droplets and a few glints
      for (let i = 0; i < Math.round(34 * this.k); i++) {
        const a = rand(0, Math.PI * 2), sp = rand(1.2, 3);
        this.glow.emit(w, _v.set(Math.cos(a) * sp, rand(3, 6.5), Math.sin(a) * sp), { life: rand(0.7, 1.1), size: rand(0.1, 0.2), color: [1.1, 1.35, 1.5], kind: KIND.GLOW, gravity: 12, drag: 0.3, alpha: 0.9 });
      }
      this.spray(w, { n: 8, colors: [[1.8, 2, 2.2]], speed: 3, life: 0.8, size: 0.35, gravity: 6, up: 1.5 });
      this.ripples.emit(w.x, wy + 0.02, w.z, big ? 3.2 : 2.4, 1.5, 0.9);
      this.ripples.emit(w.x, wy + 0.02, w.z, big ? 1.8 : 1.3, 1.1, 0.7);
      this.sfx('splash', 0.45);
    };
    return this.run((dt, t) => {
      let alive = 0;
      for (const L of leaps) {
        if (L.state === 2) continue;
        alive++;
        const u = (t - L.t0) / L.dur;
        if (u < 0) continue;
        if (L.state === 0) {
          L.slot = this.koiSlot();
          if (L.slot) { L.slot.busy = true; L.slot.obj.visible = true; L.slot.obj.scale.setScalar(scale); }
          L.state = 1;
          splash(L.a, false);
        }
        const k = Math.min(1, u);
        _p.copy(L.a).lerp(L.b, k);
        _p.y = wy + (L.a.y - WATER_Y) * (1 - k) + (L.b.y - WATER_Y) * k + 4 * L.h * k * (1 - k) - 0.3;
        _v.copy(L.b).sub(L.a);
        _v.y = 4 * L.h * (1 - 2 * k);
        const back = _s.copy(_v).normalize();
        if (L.slot) {
          const o = L.slot.obj;
          o.position.copy(_p);
          o.lookAt(_q2.copy(_p).add(_v));
          o.rotateZ(Math.sin(t * 9 + L.hue * 10) * 0.25);
          L.slot.mixer.update(dt * 3.2);
        }
        // a rainbow of sparkles streaming off the tail
        for (let i = 0; i < 3; i++) {
          const d = rand(0.5, 1.2) * scale * 0.25;
          _q3.set(_p.x - back.x * d + rand(-0.25, 0.25), _p.y - back.y * d + rand(-0.25, 0.25), _p.z - back.z * d + rand(-0.25, 0.25));
          this.glow.emit(_q3, _e3.set(rand(-0.4, 0.4), rand(-0.3, 0.4), rand(-0.4, 0.4)),
            { life: rand(0.9, 1.6), size: rand(0.22, 0.42), color: hueColor(L.hue + t * 0.9 + i * 0.07, 2), kind: KIND.SPARK, gravity: 0.6, drag: 0.8, twinkle: 0.8 });
        }
        if (u >= 1) {
          L.state = 2;
          splash(L.b, true);
          if (L.slot) { L.slot.busy = false; L.slot.obj.visible = false; }
        }
      }
      return alive === 0;
    }, () => { for (const L of leaps) if (L.slot && L.state === 1) { L.slot.busy = false; L.slot.obj.visible = false; } });
  }

  // ---------------------------------------------------------------------------------------------- 3. rainbow
  /** A big soft rainbow arch standing on `center` (radius in metres) that draws itself, holds and fades. ~seconds. */
  rainbow(center, radius = 90, seconds = 12) {
    const R = this.rainbowFx, U2 = R.uniforms;
    R.mesh.position.copy(toVec(center));
    R.mesh.scale.setScalar(radius);
    R.mesh.visible = true;
    U2.uReveal.value = 0;
    this.sfx('chime', 2);
    return this.run((dt, t) => {
      const rev = smooth(0, 3.2, t);
      U2.uReveal.value = rev < 0.999 ? rev * 1.06 : 1.2;
      U2.uA.value = smooth(0, 1.2, t) * (1 - smooth(seconds - 3, seconds, t));
      R.face(this.g.camera.position);
      if (rev < 0.99 && rev > 0.01) {
        // sparkles off the growing tip
        const th = Math.PI * (1 - Math.min(1, rev * 1.06));
        _p.set(Math.cos(th) * radius * 0.94, Math.sin(th) * radius * 0.94, 0).applyQuaternion(R.mesh.quaternion).add(R.mesh.position);
        for (let i = 0; i < 3; i++) this.glow.emit(_p, _v.set(rand(-2, 2), rand(-2, 1), rand(-2, 2)), { life: 1.8, size: rand(2, 4), color: hueColor(Math.random(), 2), kind: KIND.SPARK, gravity: 1, drag: 0.6, twinkle: 1 });
      }
      return t >= seconds;
    }, () => { R.mesh.visible = false; });
  }

  // ---------------------------------------------------------------------------------------------- 4. petal star
  /**
   * Petals swirl up from around `pos` into a giant glowing five-point star above it (facing the camera),
   * hold, then stream away to `pointTo` (the next lamp) and burst there. Options: height (star centre above
   * pos, 22), radius (10), spread (ground radius the petals rise from, 12). ~11 s.
   */
  petalStar(pos, pointTo, { height = 22, radius = 10, spread = 12 } = {}) {
    const g = this.g, S = this.star, P = toVec(pos), to = pointTo ? toVec(pointTo) : P.clone().add(v3(60, 20, 0));
    const center = P.clone().add(v3(0, height, 0));
    const normal = g.camera.position.clone().sub(center);
    S.setup({ center, radius, normal, end: to, heightAt: (x, z) => g.world.heightAt(x, z), from: P, spread });
    const T1 = S.uniforms.uT1.value, T2 = S.uniforms.uT2.value, T3 = S.uniforms.uT3.value;
    const halo = new GlowPoints([{ x: center.x, y: center.y, z: center.z, size: radius * 3.4, color: [1.7, 0.55, 0.9], alpha: 0.6 }], { kind: KIND.GLOW, flicker: 0.15 });
    const core = new GlowPoints([{ x: center.x, y: center.y, z: center.z, size: radius * 0.9, color: [2.4, 1.7, 0.9], alpha: 0.9 }], { kind: KIND.STAR });
    halo.intensity = 0; core.intensity = 0;
    S.group.add(halo.points, core.points);
    const lamp = { I: 0 };
    const src = this.light(center, () => lamp.I, 50, '#ffb7d0');
    let burst = false, formed = false;
    this.sfx('star');
    return this.run((dt, t) => {
      S.t = t;
      const hold = smooth(T1 * 0.7, T1 + 0.8, t) * (1 - smooth(T2 + 0.3, T2 + T3 * 0.7, t));
      S.outline.opacity = hold;
      halo.intensity = hold * 0.45;
      core.intensity = hold * (0.8 + 0.2 * Math.sin(t * 5));
      lamp.I = hold * (18 + 40 * this.night);
      if (!formed && t > T1 + 0.4) {
        formed = true;
        this.spray(center, { n: Math.round(120 * this.k), speed: radius * 0.9, life: 2, size: 0.7, kind: KIND.STAR, gravity: 0, drag: 1.6 });
        this.glow.emit(center, _v.set(0, 0, 0), { life: 1.0, size: radius * 1.5, color: [2.2, 1.6, 1.4], kind: KIND.RING, grow: 2.5, alpha: 0.8 });
        this.sfx('sparkHit');
      }
      if (!burst && t > T2 + T3 * 0.75 + 0.4) {
        burst = true;
        this.spray(to, { n: Math.round(110 * this.k), speed: 7, life: 2, size: 0.55, kind: KIND.STAR, gravity: 0.3 });
        this.spray(to, { n: Math.round(60 * this.k), colors: PINKS, speed: 6, life: 3.5, size: 0.4, kind: KIND.PETAL, solid: true, gravity: 1, drag: 1, spin: 5, flutter: 0.3 });
        this.glow.emit(to, _v.set(0, 0, 0), { life: 0.9, size: 12, color: [2.2, 1.5, 1.2], kind: KIND.GLOW, alpha: 0.7 });
        this.sfx('chime', 4);
      }
      return t > T2 + T3 + 2.2;
    }, () => {
      S.petals.visible = false; S.sparks.visible = false; S.outline.opacity = 0;
      S.group.remove(halo.points, core.points);
      halo.points.geometry.dispose(); halo.mat.dispose(); core.points.geometry.dispose(); core.mat.dispose();
      this.unlight(src);
    });
  }

  // ---------------------------------------------------------------------------------------------- 5. firefly river
  /**
   * Thousands of fireflies rise from the fields around `center` and flow as a river of light across the
   * night sky, then scatter and fade. By default the river sweeps from left to right across the view of
   * the camera (or of `from`) about `height` m above the centre. Options: radius (ground area, 60),
   * height (32), width (band half-width, 6), from (viewpoint), path ([4 points] cubic Bezier). ~seconds.
   */
  fireflyRiver(center, seconds = 16, { radius = 60, height = 32, width = 6, path, from } = {}) {
    const g = this.g, C = toVec(center), F = this.ff, H = height;
    let P;
    if (path?.length === 4) P = path.map(toVec);
    else {
      const eye = from ? toVec(from) : g.camera.position;
      const f = C.clone().sub(eye).setY(0);
      if (f.lengthSq() < 1) f.set(0, 0, -1);
      f.normalize();
      const r = v3(-f.z, 0, f.x);
      const at = (side, fwd, up) => C.clone().addScaledVector(r, side).addScaledVector(f, fwd).add(v3(0, up, 0));
      P = [at(-220, 90, H + 48), at(-90, -20, H - 14), at(80, 40, H + 30), at(230, 60, H + 6)];
    }
    F.setup(C, (x, z) => g.world.heightAt(x, z), radius, P);
    F.uniforms.uWidth.value = width;
    F.points.visible = true; F.ribbon.visible = true;
    const u = F.uniforms;
    return this.run((dt, t) => {
      u.uT.value = t;
      u.uFade.value = smooth(0, 1.5, t) * (1 - smooth(seconds - 3, seconds, t));
      u.uRib.value = smooth(3, 9, t) * (1 - smooth(seconds - 4, seconds - 1, t));
      return t >= seconds;
    }, () => { F.points.visible = false; F.ribbon.visible = false; });
  }

  // ---------------------------------------------------------------------------------------------- 6. orchard lanterns
  /**
   * Every peach tree within `radius` of `center` glows like a paper lantern: lantern orbs pop into the crowns
   * (rippling out from the centre), the crowns glow warm from inside and the peaches shine. Persistent:
   * returns a handle { stop(), promise }. orchardLanterns(null, 0, false) stops all.
   */
  orchardLanterns(center, radius = 45, on = true) {
    if (!on) { for (const h of [...this.lanternSets]) h.stop(); return null; }
    const g = this.g, C = toVec(center);
    const trees = (g.placed?.trees ?? []).filter(t => t.model === 'tree-peach' && Math.hypot(t.x - C.x, t.z - C.z) < radius);
    const cols = ['#ff5a3a', '#ff8a2e', '#ffc23a', '#ff6fa0', '#fff0d0'].map(h => new THREE.Color(h));
    const items = [], halos = [], crowns = [];
    for (const t of trees) {
      const d = Math.hypot(t.x - C.x, t.z - C.z);
      const n = 5;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + t.rot, r = 1.5 * t.s * rand(0.85, 1.15);
        const p = v3(t.x + Math.cos(a) * r, t.y + t.s * rand(1.7, 2.9), t.z + Math.sin(a) * r);
        const c = pick(cols);
        items.push({ p, c, s: rand(0.9, 1.2), at: d * 0.045 + rand(0, 0.5), yaw: rand(0, 6) });
        halos.push({ x: p.x, y: p.y - 0.25, z: p.z, size: 1.8, color: [Math.min(2, c.r * 2 + 0.3), c.g * 1.6 + 0.15, c.b * 1.2 + 0.05], alpha: 0.8 });
      }
      crowns.push({ x: t.x, y: t.y + 2.3 * t.s, z: t.z, size: 6.5 * t.s, color: [1.5, 0.75, 0.3], alpha: 0.5 });
    }
    const mesh = new THREE.InstancedMesh(this.decor.lanternGeometry(), this.decor.mat, Math.max(1, items.length));
    mesh.count = items.length;
    mesh.frustumCulled = false;
    items.forEach((o, i) => { mesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); mesh.setColorAt(i, o.c); });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    const hp = new GlowPoints(halos, { kind: KIND.GLOW, flicker: 0.18 });
    const cp = new GlowPoints(crowns, { kind: KIND.GLOW, flicker: 0.08 });
    hp.intensity = 0; cp.intensity = 0;
    const group = new THREE.Group();
    group.name = 'cel:orchardLanterns';
    group.add(mesh, hp.points, cp.points);
    this.root.add(group);
    const mats = [];
    for (const s of g.foliage?.sets ?? []) if (/^tree-peach/.test(s.model)) for (const m of s.meshes()) if ((m.material.name === 'Peach' || m.material.name === 'Leaves') && !mats.includes(m.material)) mats.push(m.material);
    const saved = mats.map(m => ({ m, e: m.emissive.clone(), i: m.emissiveIntensity }));
    let fade = 0, stopping = false, popped = 0;
    const handle = { stop: (now = false) => { stopping = true; if (now) fade = 0; } };
    this.lanternSets.push(handle);
    handle.promise = this.run((dt, t) => {
      fade = stopping ? Math.max(0, fade - dt / 1.6) : Math.min(1, fade + dt / 1.2);
      const night = this.night;
      let changed = false;
      items.forEach((o, i) => {
        const k = stopping ? fade : easeOutBack((t - o.at) / 0.5);
        if (!stopping && t < o.at + 0.6) changed = true;
        else if (stopping) changed = true;
        if (!stopping && t >= o.at && !o.popped) {
          o.popped = true; popped++;
          if (popped % 2) this.glow.emit(o.p, _v.set(0, 0.5, 0), { life: 0.7, size: 1.2, color: [2, 1.4, 0.6], kind: KIND.SPARK, twinkle: 0.5 });
        }
        _q.setFromAxisAngle(_s.set(0, 1, 0), o.yaw + Math.sin(t * 0.8 + i) * 0.1);
        mesh.setMatrixAt(i, _m.compose(o.p, _q, _v.setScalar(Math.max(0, k) * o.s)));
      });
      if (changed) mesh.instanceMatrix.needsUpdate = true;
      hp.intensity = fade * (0.35 + night * 0.9);
      cp.intensity = fade * (0.12 + night * 0.55);
      for (const s of saved) {
        if (s.m.name === 'Peach') { s.m.emissive.set('#ff7a2a'); s.m.emissiveIntensity = fade * (0.25 + night * 1.6); }
        else { s.m.emissive.set('#ffb35a'); s.m.emissiveIntensity = fade * night * 0.1; }
      }
      return stopping && fade <= 0;
    }, () => {
      for (const s of saved) { s.m.emissive.copy(s.e); s.m.emissiveIntensity = s.i; }
      this.root.remove(group);
      mesh.dispose(); hp.points.geometry.dispose(); hp.mat.dispose(); cp.points.geometry.dispose(); cp.mat.dispose();
      this.lanternSets = this.lanternSets.filter(h => h !== handle);
    });
    return handle;
  }

  // ---------------------------------------------------------------------------------------------- 7. floating sheep
  /**
   * Hana's sheep (director.wildlife.story.sheep, or `actors`) float up a few metres in golden sparkle
   * bubbles, bob and turn, then drift back down and the bubbles pop. Restores them exactly. ~seconds.
   */
  floatSheep(seconds = 8, actors, { height = 3.2 } = {}) {
    const list = (actors || this.g.director?.wildlife?.story?.sheep || []).filter(s => s?.root);
    if (!list.length) return Promise.resolve();
    const items = list.map((s, i) => {
      const target = s.model || s.root.children[0] || s.root;
      const b = new THREE.Mesh(this.bubbleGeo, this.bubbleMat);
      b.renderOrder = 8;
      b.visible = false;
      this.root.add(b);
      return { s, target, y0: target.position.y, rz: target.rotation.z, rx: target.rotation.x, b, d: i * 0.35 + rand(0, 0.2), ph: rand(0, 6), h: height * rand(0.85, 1.15), popped: false };
    });
    // a warm glow inside each bubble, and one light source over the flock so the wool catches it
    const inner = new GlowPoints(items.map(() => ({ x: 0, y: -999, z: 0, size: 2.6, color: [1.6, 1.1, 0.45], alpha: 0.55 })), { kind: KIND.GLOW, flicker: 0.1 });
    inner.points.frustumCulled = false;
    this.root.add(inner.points);
    const IP = inner.points.geometry.attributes.position;
    const mid = v3(), lamp = { I: 0 };
    const src = this.light(mid, () => lamp.I, 14, '#ffd27a');
    this.sfx('star');
    return this.run((dt, t) => {
      let done = true;
      for (const it of items) {
        const tt = t - it.d;
        const up = smooth(0, 2.4, tt) * (1 - smooth(seconds - 2.6, seconds - 0.2, tt));
        if (tt < seconds) done = false;
        const bob = Math.sin(tt * 2.1 + it.ph) * 0.22 * up;
        const lift = it.h * up + bob;
        it.target.position.y = it.y0 + lift;
        it.target.rotation.z = it.rz + Math.sin(tt * 1.3 + it.ph) * 0.16 * up;
        it.target.rotation.x = it.rx + Math.sin(tt * 1.7 + it.ph * 2) * 0.1 * up;
        if (tt > 0 && tt < 0.1 && !it.bleat) { it.bleat = true; it.s.anim?.once?.('Bleat', { then: 'Idle' }); }
        const show = tt > 0 && tt < seconds;
        it.b.visible = show;
        IP.setXYZ(items.indexOf(it), it.s.root.position.x, show ? it.s.root.position.y + 0.55 + lift : -999, it.s.root.position.z);
        if (show) {
          const r = it.s.root.position;
          const sc = 1.05 * easeOutBack(tt / 0.6);
          it.b.position.set(r.x, r.y + 0.5 + lift, r.z);
          it.b.scale.set(sc, sc * (1 + Math.sin(tt * 3 + it.ph) * 0.04), sc);
          if (Math.random() < dt * 14) {
            _p.set(r.x + rand(-1, 1), r.y + 0.5 + lift + rand(-1, 1), r.z + rand(-1, 1));
            this.glow.emit(_p, _v.set(rand(-0.3, 0.3), rand(-0.6, -0.1), rand(-0.3, 0.3)), { life: rand(1, 1.8), size: rand(0.2, 0.4), color: pick(GOLDS), kind: Math.random() < 0.15 ? KIND.HEART : KIND.SPARK, twinkle: 1, drag: 0.5 });
          }
        }
        if (tt >= seconds - 0.25 && !it.popped) {
          it.popped = true;
          const r = it.s.root.position;
          _p.set(r.x, r.y + 0.6, r.z);
          this.spray(_p, { n: Math.round(40 * this.k), speed: 3.5, life: 1.2, size: 0.3, gravity: 0.5 });
          this.glow.emit(_p, _v.set(0, 0, 0), { life: 0.4, size: 3, color: [1.6, 1.5, 1.2], kind: KIND.RING, grow: 2, alpha: 0.8 });
          this.sfx('bubble');
        }
      }
      IP.needsUpdate = true;
      mid.set(0, 0, 0);
      for (const it of items) mid.add(it.s.root.position);
      mid.divideScalar(items.length).add(_s.set(0, 3 + height * 0.6, 0));
      lamp.I = (8 + 22 * this.night) * smooth(0, 1.5, t) * (1 - smooth(seconds - 1, seconds + 0.5, t));
      inner.intensity = smooth(0, 1, t) * (1 - smooth(seconds - 0.8, seconds, t));
      return done;
    }, () => {
      for (const it of items) {
        it.target.position.y = it.y0; it.target.rotation.z = it.rz; it.target.rotation.x = it.rx;
        this.root.remove(it.b);
      }
      this.root.remove(inner.points);
      inner.points.geometry.dispose(); inner.mat.dispose();
      this.unlight(src);
    });
  }

  // ---------------------------------------------------------------------------------------------- 8. butterflies
  /**
   * Maple leaves swirl up around `from` and hatch into golden-orange butterflies that flutter up to `to`
   * (e.g. the shrine steps to the Forest Lamp), circle it and dissolve into sparkles. ~seconds.
   */
  leafButterflies(from, to, seconds = 9) {
    const g = this.g, A = toVec(from), B = toVec(to), BF = this.bflies;
    const n = BF.n;
    const dir = B.clone().sub(A), len = dir.length();
    const side = v3(-dir.z, 0, dir.x).normalize();
    // a flight path that hugs the ground (up the steps) a few metres above it
    const knots = [];
    for (let i = 0; i <= 6; i++) {
      const k = i / 6, p = A.clone().lerp(B, k);
      p.y = Math.max(p.y, g.world.heightAt(p.x, p.z)) + (i === 0 ? 1.5 : i === 6 ? 1.8 : 3.2);
      knots.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(knots);
    const maples = (g.placed?.trees ?? []).filter(t => t.model === 'tree-maple' && !t.far && Math.hypot(t.x - A.x, t.z - A.z) < 26);
    const cols = [lin('#ffb020', 1.15), lin('#ff7a1a', 1.1), lin('#ffd24a', 1.2), lin('#ff5a2a', 1.05), lin('#ffe07a', 1.2)];
    const leafCols = [lin('#e2381f'), lin('#f06a1c'), lin('#f5a623'), lin('#d92a1a')];
    const flies = [];
    for (let i = 0; i < n; i++) {
      let s;
      if (maples.length && i % 3 === 0) { const t = pick(maples); s = v3(t.x + rand(-2, 2), t.y + t.s * rand(3, 5), t.z + rand(-2, 2)); }
      else { const a = rand(0, Math.PI * 2), r = rand(0.5, 7); s = v3(A.x + Math.cos(a) * r, 0, A.z + Math.sin(a) * r); s.y = g.world.heightAt(s.x, s.z) + 0.2; }
      const hatch = rand(0.7, 3.0);
      const hp = s.clone().add(v3(rand(-1, 1), rand(1.4, 3.2), rand(-1, 1)));
      this.solid.emit(s, _v.copy(hp).sub(s).divideScalar(hatch), { life: hatch, size: rand(0.35, 0.5), color: pick(leafCols), kind: KIND.LEAF, spin: rand(3, 7), flutter: 0.25 });
      const c = pick(cols);
      BF.mesh.setColorAt(i, new THREE.Color(c[0], c[1], c[2]));
      flies.push({ hp, hatch, dur: Math.max(2.5, (seconds - 2.2 - hatch) * rand(0.85, 1)), die: seconds - rand(0.1, 0.9), off: rand(-3, 3), up: rand(-0.6, 1.4), ph: rand(0, 6.28), flap: rand(12, 18), sc: rand(0.45, 0.62), rr: rand(1.4, 2.6), gone: false });
    }
    BF.mesh.instanceColor.needsUpdate = true;
    BF.mesh.count = n;
    BF.mesh.visible = true;
    const F = BF.aF.array;
    const yaw = new THREE.Object3D();
    return this.run((dt, t) => {
      const night = this.night;
      let active = 0;
      flies.forEach((f, i) => {
        const tt = t - f.hatch;
        if (tt < 0 || f.gone) { F[i * 4 + 2] = 0; BF.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); if (!f.gone) active++; return; }
        active++;
        if (!f.popped) { f.popped = true; this.glow.emit(f.hp, _v.set(0, 0.4, 0), { life: 0.5, size: 0.6, color: pick(GOLDS), kind: KIND.SPARK, twinkle: 0.5 }); }
        const u = clamp01(tt / f.dur);
        const e = 0.35 * u + 0.65 * u * u * (3 - 2 * u);
        curve.getPoint(e, _p);
        const sway = Math.sin(tt * 0.9 + f.ph) * 1.1;
        _p.addScaledVector(side, (f.off + sway) * (1 - e * 0.7)).add(_s.set(0, f.up + Math.sin(tt * f.flap * 0.25 + f.ph) * 0.18, 0));
        // hatch blend, then a spiral round the destination at the end
        const hb = smooth(0, 1.1, tt);
        _p.lerpVectors(f.hp, _p, hb);
        // then a lazy spiral up round the destination until they dissolve
        const circle = Math.max(0, tt - f.dur);
        if (circle > 0) { const a = f.ph + circle * 2.4, r = f.rr * smooth(0, 0.8, circle); _p.add(_s.set(Math.cos(a) * r, circle * 0.55, Math.sin(a) * r)); }
        const prev = f.prev || _p.clone();
        const vel = _p.clone().sub(prev);
        f.prev = _p.clone();
        yaw.position.copy(_p);
        if (vel.lengthSq() > 1e-6) yaw.lookAt(_p.clone().add(vel));
        yaw.rotateX(-0.35);
        const pop = smooth(0, 0.3, tt);
        yaw.scale.setScalar(f.sc * pop);
        yaw.updateMatrix();
        BF.mesh.setMatrixAt(i, yaw.matrix);
        F[i * 4] = f.ph; F[i * 4 + 1] = f.flap; F[i * 4 + 2] = 1; F[i * 4 + 3] = 0.35 + night * 0.9;
        if (Math.random() < dt * 5) this.glow.emit(_p, _v.set(0, -0.3, 0), { life: 0.9, size: 0.18, color: pick(GOLDS), kind: KIND.SPARK, twinkle: 1 });
        if (t > f.die) {
          f.gone = true;
          this.spray(_p, { n: 10, speed: 2, life: 0.9, size: 0.25, gravity: 0.2 });
          F[i * 4 + 2] = 0;
          BF.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
        }
      });
      BF.mesh.instanceMatrix.needsUpdate = true;
      BF.aF.needsUpdate = true;
      return active === 0 || t > seconds + 0.5;
    }, () => { BF.mesh.visible = false; BF.mesh.count = 0; });
  }

  // ---------------------------------------------------------------------------------------------- 9. kodama
  /**
   * Little white forest spirits pop up among the trees around `center`, rattle their heads, glow softly,
   * then sink away. Options: radius (16), face (a point they turn toward; default the camera). ~seconds.
   */
  kodama(center, count = 14, seconds = 10, { radius = 16, face } = {}) {
    const g = this.g, C = toVec(center), P = this.kod;
    const n = Math.min(count, P.n);
    const trees = (g.placed?.trees ?? []).filter(t => !t.far && Math.hypot(t.x - C.x, t.z - C.z) < radius + 6);
    const look = face ? toVec(face) : g.camera.position.clone();
    const spots = [];
    const ok = (x, z) => (g.world.grid?.slopeAt ? g.world.grid.slopeAt(x, z) < 32 : true) && g.world.heightAt(x, z) > 0.5;
    for (let tries = 0; spots.length < n && tries < 400; tries++) {
      let x, z;
      if (trees.length && tries % 3 !== 2) { const t = pick(trees), a = rand(0, 6.28), r = rand(0.8, 1.6) * t.s; x = t.x + Math.cos(a) * r; z = t.z + Math.sin(a) * r; }
      else { const a = rand(0, 6.28), r = radius * Math.sqrt(Math.random()); x = C.x + Math.cos(a) * r; z = C.z + Math.sin(a) * r; }
      if (!ok(x, z) || spots.some(s => Math.hypot(s.x - x, s.z - z) < 1.1)) continue;
      spots.push({ x, z });
    }
    const list = spots.map((s, i) => ({
      x: s.x, z: s.z, y: g.world.heightAt(s.x, s.z), at: rand(0, 3.2) + i * 0.08, sc: rand(1.0, 1.45) * (Math.random() < 0.15 ? 1.35 : 1),
      yaw: Math.atan2(look.x - s.x, look.z - s.z) + rand(-0.5, 0.5), eye: rand(0.85, 1.2), seed: Math.random(), rattle: [], popped: false,
    }));
    for (const k of list) { let t = k.at + rand(0.8, 2.5); while (t < seconds - 1.8) { k.rattle.push(t); t += rand(1.4, 3.5); } }
    P.group.visible = true;
    const H = P.heads, B = P.bodies, HK = H.geometry.attributes.aK.array, BK = B.geometry.attributes.aK.array;
    const neck = new THREE.Matrix4().makeTranslation(0, 0.33, 0), rot = new THREE.Matrix4(), head = new THREE.Matrix4();
    const lift = new THREE.Matrix4().makeTranslation(0, 0.2, 0).multiply(new THREE.Matrix4().makeScale(0.56, 0.56, 0.56));
    let clicks = 0;
    return this.run((dt, t) => {
      let c = 0;
      for (const k of list) {
        const tt = t - k.at;
        if (tt < 0) continue;
        if (!k.popped) {
          k.popped = true;
          _p.set(k.x, k.y + 0.4, k.z);
          this.spray(_p, { n: Math.round(14 * this.k), colors: [lin('#d8ffe8', 1.8), lin('#ffffff', 1.6), lin('#b8f5ff', 1.6)], speed: 2, life: 1.1, size: 0.22, gravity: -0.3 });
          if (clicks++ % 3 === 0) this.sfx('blip', 1.8);
        }
        const out = 1 - smooth(seconds - 1.6, seconds, t);
        const s = easeOutBack(tt / 0.5) * k.sc;
        const sink = -0.5 * (1 - smooth(0, 0.35, tt)) - 0.6 * (1 - out);
        // rattle bursts: a fast side-to-side clack of the head
        let rz = Math.sin(tt * 0.9 + k.seed * 9) * 0.12;
        for (const r of k.rattle) { const d = t - r; if (d > 0 && d < 0.7) { rz += Math.sin(d * 42) * 0.34 * Math.sin(d / 0.7 * Math.PI); if (d < dt * 1.5 && clicks++ % 2 === 0) this.click(); } }
        const sway = Math.sin(tt * 1.6 + k.seed * 20) * 0.05;
        _q.setFromEuler(_e.set(0, k.yaw, sway));
        _m.compose(_p.set(k.x, k.y + sink, k.z), _q, _s.setScalar(Math.max(0.001, s)));
        B.setMatrixAt(c, _m);
        rot.makeRotationFromEuler(_e.set(Math.sin(tt * 0.7 + k.seed * 4) * 0.1, Math.sin(tt * 0.5 + k.seed) * 0.15, rz));
        head.copy(_m).multiply(neck).multiply(rot).multiply(lift);
        H.setMatrixAt(c, head);
        const alpha = smooth(0, 0.25, tt) * out;
        const glow = 0.55 + 0.35 * Math.sin(t * 2.2 + k.seed * 12);
        HK.set([alpha, glow, k.eye, k.seed], c * 4);
        BK.set([alpha, glow * 0.8, 1, k.seed], c * 4);
        c++;
      }
      H.count = c; B.count = c;
      H.instanceMatrix.needsUpdate = true; B.instanceMatrix.needsUpdate = true;
      H.geometry.attributes.aK.needsUpdate = true; B.geometry.attributes.aK.needsUpdate = true;
      const sky = this.g.world?.sky;
      if (sky?.sun) {
        P.uniforms.uL.value.subVectors(sky.sun.position, sky.sun.target.position).normalize();
        P.uniforms.uLc.value.copy(sky.sun.color).multiplyScalar(Math.min(1.2, sky.sun.intensity / 3));
        P.uniforms.uSky.value.copy(sky.hemi.color).multiplyScalar(Math.min(1, sky.hemi.intensity));
      }
      P.uniforms.uNight.value = this.night;
      return t >= seconds;
    }, () => { P.group.visible = false; H.count = 0; B.count = 0; });
  }

  click() {
    const a = this.g.audio;
    if (!this.sound || !a?.noise) return;
    try { for (let i = 0; i < 5; i++) a.noise({ dur: 0.025, vol: 0.035, freq: 2400 + Math.random() * 900, q: 7, when: i * 0.06 }); } catch { /* optional */ }
  }

  // ---------------------------------------------------------------------------------------------- 10/11. aurora, star snow
  /** Shimmering green-violet-pink aurora curtains all round the night sky. Persistent handle; aurora(false) fades it. */
  aurora(on = true) {
    this.aur.target = on ? 1 : 0;
    return { stop: () => { this.aur.target = 0; } };
  }

  /** Glittering star-snow (twinkling gold/white flakes around the camera). Persistent handle; starSnow(false) fades it. */
  starSnow(on = true) {
    this.snow.target = on ? 1 : 0;
    return { stop: () => { this.snow.target = 0; } };
  }

  // ---------------------------------------------------------------------------------------------- 12. star train
  /**
   * The Star Train (Kobo + two coaches in starlight, stardust steam, Sora waving from a window) crosses the
   * sky along `path` (array of points / [x,y,z], or a THREE.Curve; default: a west-to-east arc ~100 m over
   * the valley) in `seconds`. The promise has `.sora` (Object3D on her face) and `.train` (group) for
   * camera tracking. ~seconds.
   */
  skyTrain(path, seconds = 24) {
    const T = this.train;
    let curve;
    if (path?.getPointAt) curve = path;
    else {
      const pts = (path?.length >= 2 ? path : [[-430, 112, 200], [-190, 104, 128], [30, 100, 58], [250, 106, -8], [470, 118, -90]]).map(toVec);
      curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    }
    const len = curve.getLength();
    T.group.visible = true;
    T.opacity = 0;
    const up = v3(0, 1, 0), X = v3(), Y = v3(), Z = v3(), world = v3();
    let acc = 0, accS = 0;
    const promise = this.run((dt, t) => {
      const u = clamp01(t / seconds);
      curve.getPointAt(u, _p);
      curve.getTangentAt(u, X).normalize();
      Z.crossVectors(X, up).normalize();
      Y.crossVectors(Z, X).normalize();
      _m.makeBasis(X, Y, Z);
      T.group.quaternion.setFromRotationMatrix(_m);
      T.group.position.copy(_p).addScaledVector(Y, Math.sin(t * 2.3) * 0.35);
      T.group.rotateX(Math.sin(t * 1.7) * 0.02);
      T.group.updateMatrixWorld(true);
      const fade = smooth(0, 2, t) * (1 - smooth(seconds - 2.5, seconds, t));
      T.opacity = fade;
      T.animate(u * len, t);
      // stardust steam from the chimney, trailing in world space
      world.copy(T.chimney).applyMatrix4(T.inner.matrixWorld);
      acc += dt * 95 * this.k * fade;
      while (acc > 1) {
        acc--;
        _v.copy(Y).multiplyScalar(rand(2, 5)).addScaledVector(X, rand(-3, -1)).add(_s.set(rand(-0.8, 0.8), rand(-0.3, 0.3), rand(-0.8, 0.8)));
        if (Math.random() < 0.3) this.glow.emit(world, _v, { life: rand(2.6, 4), size: rand(4, 7.5), color: pick([[0.75, 0.8, 1.35], [1.1, 0.75, 1.3], [0.9, 1.0, 1.4]]), kind: KIND.GLOW, alpha: 0.3, grow: 1.8, drag: 0.8 });
        else this.glow.emit(world, _v, { life: rand(2.2, 3.8), size: rand(0.6, 1.3), color: pick([[2.2, 2.0, 1.6], [2.2, 1.6, 0.7], [1.4, 1.7, 2.4], [2.2, 1.0, 1.6]]), kind: Math.random() < 0.6 ? KIND.SPARK : KIND.STAR, drag: 0.7, gravity: -0.2, twinkle: 1 });
      }
      // a sparkling track of stars falls from the wheels
      accS += dt * 60 * this.k * fade;
      while (accS > 1) {
        accS--;
        const w = pick(T.wheels);
        _s.copy(w.c).applyMatrix4(T.inner.matrixWorld);
        this.glow.emit(_s, _v.set(rand(-0.5, 0.5), rand(-1.2, -0.2), rand(-0.5, 0.5)), { life: rand(1.6, 2.8), size: rand(0.35, 0.7), color: pick(GOLDS), kind: KIND.SPARK, gravity: 1.2, drag: 0.5, twinkle: 1 });
      }
      if (t < 1.2 && Math.random() < 0.6) {
        _s.set(rand(-24, 4), rand(0, 4), rand(-1.5, 1.5)).multiplyScalar(T.S / 3.2).applyMatrix4(T.inner.matrixWorld);
        this.spray(_s, { n: 6, speed: 3, life: 1.2, size: 0.8, gravity: 0 });
      }
      return t >= seconds;
    }, () => { T.group.visible = false; });
    promise.sora = T.sora;
    promise.train = T.group;
    return promise;
  }

  // ---------------------------------------------------------------------------------------------- 13. decorations
  /**
   * Persistent festive decoration, cumulative: 1 Kawabe lanterns + blossom garlands (and the Mill Lamp
   * maypole), 2 Takamori lantern canopy + bunting, 3 forest spirit lights + shrine lanterns, 4 star
   * garlands on the station, platforms and viaduct. decorate(0) hides everything. Glows with nightfall.
   */
  decorate(level) {
    this.decor.set(level);
    return this.decor.level;
  }

  // ---------------------------------------------------------------------------------------------- 14. burst
  /** A big joyful confetti + star burst at `pos` (colors: optional list of hex strings or [r,g,b]). ~4.5 s. */
  sparkleBurst(pos, colors) {
    const P = toVec(pos), K = this.k;
    const cols = (colors?.length ? colors : FESTIVE).map(c => (Array.isArray(c) ? c : lin(c)));
    const bright = cols.map(c => [c[0] * 2, c[1] * 2, c[2] * 2]);
    for (let i = 0; i < Math.round(360 * K); i++) {
      const a = rand(0, Math.PI * 2), el = rand(0.25, 1.2), sp = rand(6, 15);
      _v.set(Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp + 2, Math.sin(a) * Math.cos(el) * sp);
      this.solid.emit(P, _v, { life: rand(4, 6.5), size: rand(0.32, 0.5), color: pick(cols), kind: Math.random() < 0.1 ? KIND.HEART : KIND.CONFETTI, gravity: 3.4, drag: 1.7, flutter: rand(0.2, 0.5), spin: rand(5, 11) * (Math.random() < 0.5 ? -1 : 1) });
    }
    this.spray(P, { n: Math.round(100 * K), colors: [...GOLDS, ...bright], speed: 13, life: 2.2, size: 0.8, kind: KIND.STAR, gravity: 0.8, drag: 1.8, twinkle: 1, up: 0.25 });
    this.spray(P, { n: Math.round(140 * K), colors: [...GOLDS, ...bright], speed: 9, life: 3.2, size: 0.32, kind: KIND.SPARK, gravity: 1.4, drag: 1.2, twinkle: 1.2, up: 0.4 });
    this.glow.emit(P, _v.set(0, 0, 0), { life: 0.3, size: 9, color: [2.4, 2.1, 1.7], kind: KIND.GLOW, alpha: 0.7 });
    this.glow.emit(P, _v.set(0, 0, 0), { life: 0.6, size: 2.5, color: [2.2, 1.8, 1.4], kind: KIND.RING, grow: 6, alpha: 0.6 });
    const flash = { t: 0 };
    const src = this.light(P, () => Math.max(0, 45 * (1 - flash.t / 0.7)), 26, '#fff0d0');
    this.sfx('sparkHit');
    return this.run((dt, t) => { flash.t = t; return t > 4.5; }, () => this.unlight(src));
  }

  // ---------------------------------------------------------------------------------------------- frame
  update(dt) {
    const g = this.g;
    this.t += dt;
    U.uTime.value = this.t;
    const cam = g.camera, h = g.renderer?.renderer?.domElement?.height || innerHeight;
    U.uScale.value = h / (2 * Math.tan((cam.fov * Math.PI / 180) / 2));
    for (const task of this.tasks) {
      if (task.done) continue;
      task.t += dt;
      let end = false;
      try { end = task.step(dt, task.t, task); } catch (e) { console.error('celebrate effect', e); end = true; }
      if (end) this.finish(task);
    }
    if (this.tasks.some(t => t.done)) this.tasks = this.tasks.filter(t => !t.done);
    const night = this.night;
    // persistent sky effects
    const ease = (s, rate) => { s.cur += Math.sign(s.target - s.cur) * Math.min(Math.abs(s.target - s.cur), dt * rate); };
    ease(this.aur, 0.35);
    const aI = this.aur.cur * smooth(0.25, 0.85, night);
    this.auroraFx.uniforms.uI.value = aI;
    this.auroraFx.uniforms.uCam.value.copy(cam.position);
    this.auroraFx.mesh.visible = aI > 0.003;
    ease(this.snow, 0.5);
    this.snowFx.uniforms.uI.value = this.snow.cur * (0.55 + 0.45 * night);
    this.snowFx.uniforms.uCam.value.copy(cam.position);
    this.snowFx.points.visible = this.snow.cur > 0.003;
    this.decor.update(night);
    this.glow.flush();
    this.solid.flush();
  }
}
