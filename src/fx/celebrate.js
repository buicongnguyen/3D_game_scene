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
import { StarField } from './cel-starfall.js';
import { Constellation, FIGURE_NAMES } from './cel-constellations.js';
import { GhostMaterials, aimArm, memoryDisc } from './cel-memory.js';
import { NoteSystem, NOTE, MoteCloud } from './cel-magic.js';
import { GlowLines } from './cel-lines.js';

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
    // set 2: Starfall Night, constellations, the golden memory, the star-tree, gifts and music
    this.starfield = new StarField(Math.round(15000 * K), q === 'Low' ? 4 : 6, q === 'Low' ? 40 : 64);
    this.sf = { cur: 0, target: 0 };
    this.skyFigs = new THREE.Group();
    this.skyFigs.name = 'cel:constellations';
    this.figs = {};
    for (const n of FIGURE_NAMES) { this.figs[n] = new Constellation(n); this.skyFigs.add(this.figs[n].group); }
    this.notes = new NoteSystem(Math.round(240 * Math.max(0.6, K)));
    this.ghost = new GhostMaterials();
    this.memDisc = memoryDisc();
    this.treeGlows = [];
    this.root.add(this.starfield.points, this.skyFigs, this.notes.points, this.memDisc);
    this.precompile();
  }

  /** Compile every celebration material now (while loading), not in the middle of a cutscene. */
  precompile() {
    const g = this.g, r = g.renderer?.renderer;
    if (!r?.compile || !g.camera) return;
    const probe = new THREE.Group();
    const bub = new THREE.Mesh(this.bubbleGeo, this.bubbleMat);
    probe.add(bub, this.decor.probe());
    // set 2: a skinned ghost (the skinning variant of the ghost program) and a mote cloud; these probe
    // materials are kept (never disposed) so their programs stay cached for every later show
    const ghost = this.g.assets?.clone?.('hana');
    if (ghost) probe.add(this.ghost.apply(ghost));
    this.moteProbe = new MoteCloud(4, 1, 1);
    probe.add(this.moteProbe.points);
    // the orchard lanterns' instanced variant of the decor material (no shadow receiving, unlike the decor probe)
    const lanterns = new THREE.InstancedMesh(this.decor.lanternGeometry(), this.decor.mat, 1);
    lanterns.setColorAt(0, new THREE.Color(1, 1, 1));
    probe.add(lanterns);
    this.root.add(probe);
    // the scene is drawn into the composer's HDR target, whose programs differ (tone mapping, output colour
    // space) from ones compiled for the screen: compile against a target like it
    const comp = g.renderer?.composer, prevRT = r.getRenderTarget?.();
    try {
      if (comp?.renderTarget1) r.setRenderTarget(comp.renderTarget1);
      r.compile(this.root, g.camera, g.scene);
      if (g.foliage?.group && this.blossom.mats.length) r.compile(g.foliage.group, g.camera, g.scene);
    } catch (e) { console.warn('celebrate precompile', e); }
    if (comp?.renderTarget1) r.setRenderTarget(prevRT ?? null);
    this.root.remove(probe);
    ghost?.traverse(o => o.skeleton?.dispose?.());
    lanterns.geometry.dispose();
    lanterns.dispose();
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

  /**
   * End every running effect at once (e.g. a skipped cutscene). Persistent celebration effects fade out; the
   * lasting world states (decorate, starfall, treeGlow) are left as they are.
   */
  stopAll() {
    // swap first: an onStop handler may start a new effect, which must not be dropped by the reset
    const running = this.tasks; this.tasks = [];
    for (const t of running) this.finish(t);
    this.aurora(false);
    this.starSnow(false);
    for (const h of [...this.lanternSets]) h.stop(true);
  }

  /** Remove everything from the scene (stops effects, restores borrowed materials and sheep). */
  dispose() {
    this.stopAll();
    this.tasks.length = 0;
    this.decor.set(0);
    for (const h of [...this.treeGlows]) h.end();
    this.sf.cur = this.sf.target = 0;
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
    let acc = 0, accG = 0, accB = 0;
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
      }
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
    // cull by where the lanterns hang: they pop in from scale 0, so the mesh cannot measure itself
    mesh.boundingSphere = new THREE.Sphere(C.clone(), 1);
    if (items.length) { mesh.boundingSphere.setFromPoints(items.map(o => o.p)); mesh.boundingSphere.radius += 2; } else mesh.frustumCulled = false;
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
    const dir = B.clone().sub(A);
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

  // ---------------------------------------------------------------------------------------------- 15. starfall
  /**
   * Starfall Night: the night sky fills with thousands of twinkling stars in several colours and sizes, a faint
   * milky-way band (along the sky's own) and slow drifting meteors; the sky's clouds still pass in front. One
   * Points draw, no lights. Only visible at night (fades with the night factor), so it can simply stay on.
   * Persistent handle { stop() }; starfall(false) fades it out. Not touched by stopAll().
   */
  starfall(on = true) {
    this.sf.target = on ? 1 : 0;
    return { stop: () => { this.sf.target = 0; } };
  }

  // ---------------------------------------------------------------------------------------------- 16. constellations
  /**
   * The stars draw themselves, star by star, into glowing constellations of the valley's friends: kobo (the
   * little engine), bear (Okuma), koi, fox (Kon), tamo, mika (with Sora's lantern). They are spread left to right
   * across the sky round the viewer (default: the camera, `spread` 200 deg centred on where it faces, alternating
   * `elev` [34, 50] deg, figure centres; each ~23 deg across) and drawn in `names` order, one every `draw` s (2.5),
   * then hold and fade gently over the last ~3.5 s. Options: center (fixed viewpoint; default follows the
   * camera), names, yaw (rad, 0 = -z, + toward +x), spread, elev, size (angular scale), draw. ~seconds.
   * The promise has `.figures`: [{ name, dir (unit Vector3 from the viewer), at, done }] for camera work.
   */
  constellations(seconds = 30, { center, names = FIGURE_NAMES, yaw, spread = 200, elev = [34, 50], size = 1, draw = 2.5 } = {}) {
    const g = this.g, cam = g.camera;
    const list = names.filter(n => this.figs[n]);
    if (!list.length) return Promise.resolve();
    if (this.conTask && !this.conTask.done) this.finish(this.conTask);
    const n = list.length;
    const fwd = cam.getWorldDirection(v3());
    const yaw0 = yaw ?? Math.atan2(fwd.x, -fwd.z);
    const D = Math.min(draw, (seconds * 0.6) / n);
    const fadeT = Math.min(3.5, seconds * 0.15);
    const fixed = center ? toVec(center) : null;
    const figs = list.map((name, i) => {
      const f = this.figs[name];
      const az = yaw0 + (n === 1 ? 0 : ((i + 0.5) / n - 0.5) * spread * Math.PI / 180);
      const el = (n === 1 ? (elev[0] + elev[1]) / 2 : elev[i % 2]) * Math.PI / 180;
      const dir = v3(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az));
      f.aim(dir);
      f.group.scale.set(size, size, 1);
      const fs = seconds - fadeT + (n === 1 ? 0 : i / (n - 1)) * fadeT * 0.4;
      return { f, name, dir, at: 0.5 + i * D, fs, fe: fs + fadeT * 0.6, done: false, i };
    });
    this.skyFigs.visible = true;
    const px = () => (g.renderer?.renderer?.domElement?.height || innerHeight) / 720;
    const pen = v3(), w = v3();
    const promise = this.run((dt, t) => {
      this.skyFigs.position.copy(fixed || cam.position);
      this.skyFigs.updateMatrixWorld(true);
      const pxs = px();
      for (const F of figs) {
        const lt = (t - F.at) * (F.f.draw / D);
        const o = smooth(0, 0.25, t - F.at) * (1 - smooth(F.fs, F.fe, t));
        F.f.set(lt, o, pxs);
        if (lt <= 0 || o < 0.01) continue;
        // stardust falling from the pen while it draws
        if (lt < F.f.draw && F.f.pen(lt, pen)) {
          F.f.group.localToWorld(w.copy(pen));
          for (let k = 0; k < 2; k++) this.glow.emit(w, _v.set(rand(-9, 9), rand(-12, 3), rand(-9, 9)), { life: rand(0.6, 1.1), size: rand(5, 11), color: pick([[2.4, 2.1, 1.6], F.f.color, [2.2, 1.5, 0.7]]), kind: KIND.SPARK, gravity: 14, drag: 1.2, twinkle: 1 });
        }
        if (!F.done && lt >= F.f.draw) {
          F.done = true;
          this.sfx('chime', F.i);
          const st = F.f.stars;
          for (let k = 0; k < Math.round(36 * this.k); k++) {
            const s = st[Math.floor(Math.random() * st.length)];
            if (s.kind === 2) continue;
            F.f.group.localToWorld(w.copy(s.v));
            this.glow.emit(w, _v.set(rand(-14, 14), rand(-10, 14), rand(-14, 14)), { life: rand(1, 1.8), size: rand(6, 13), color: pick([[2.4, 2.2, 1.8], F.f.color]), kind: Math.random() < 0.4 ? KIND.STAR : KIND.SPARK, gravity: 6, drag: 1.5, twinkle: 1 });
          }
        }
      }
      return t >= seconds;
    }, () => { for (const F of figs) F.f.set(0, 0, 1); this.skyFigs.visible = false; });
    promise.figures = figs.map(F => ({ name: F.name, dir: F.dir.clone(), at: F.at, done: F.at + D }));
    this.conTask = promise.task;
    return promise;
  }

  // ---------------------------------------------------------------------------------------------- 17. golden memory
  /**
   * A golden memory at `pos` (on the ground): Genzo, Ota, Hana and Sora as children, translucent glowing gold
   * ghosts, rise out of the ground in a ring holding hands, dance round, stop to cheer and wave, dance back the
   * other way, then dissolve upward into sparkles. Options: radius (ring, 0.82 m), scale (0.88: young), light
   * (a warm light-pool source, default true). Clones the rigged models and removes them after. ~seconds.
   */
  memory(pos, seconds = 12, { radius = 0.82, scale = 0.88, light = true } = {}) {
    const g = this.g, K = this.k, P = toVec(pos);
    if (this.memTask && !this.memTask.done) this.finish(this.memTask);
    const cast = ['genzo', 'ota', 'hana', 'villager-woman'];
    const GM = this.ghost, GU = GM.shared;
    GU.uOpacity.value = 0; GU.uLow.value = 0; GU.uHigh.value = 0; GU.uBase.value = P.y; GU.uHeight.value = 1.62 * scale;
    const holder = new THREE.Group();
    holder.name = 'cel:memory';
    holder.position.copy(P);
    this.root.add(holder);
    const dancers = [];
    cast.forEach((name, i) => {
      const obj = g.assets?.clone?.(name);
      if (!obj) return;
      GM.apply(obj);
      obj.scale.setScalar(scale);
      const wrap = new THREE.Group();
      wrap.add(obj);
      holder.add(wrap);
      const mixer = new THREE.AnimationMixer(obj);
      const clips = new Map((obj.userData.clips || []).map(c => [c.name, c]));
      const bones = {};
      obj.traverse(o => { if (o.isBone || o.type === 'Bone') bones[o.name] = o; });
      dancers.push({ name, obj, wrap, mixer, clips, bones, a0: i * Math.PI * 2 / cast.length, cur: null, cheer: clips.has('Cheer') ? 'Cheer' : 'Wave', ph: rand(0, 6) });
    });
    if (!dancers.length) { this.root.remove(holder); return Promise.resolve(); }
    const N = dancers.length;
    const play = (d, name, speed = 1, fade = 0.35, once = false) => {
      const clip = d.clips.get(name) || d.clips.get('Idle');
      if (!clip) return;
      const a = d.mixer.clipAction(clip);
      a.timeScale = speed;
      if (d.cur === a) return;
      a.reset();
      a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
      a.clampWhenFinished = once;
      a.setEffectiveWeight(1).play();
      if (d.cur) d.cur.crossFadeTo(a, fade, false);
      d.cur = a;
    };
    dancers.forEach(d => { play(d, 'Walk', 0.5, 0); d.mixer.update(d.ph); });
    // hands: which hand of each dancer reaches for the next one round the ring is found from the pose itself
    const threadSegs = [];
    for (let i = 0; i < N * 3; i++) threadSegs.push({ a: v3(), b: v3(0, 0.01, 0), color: [2.4, 1.8, 0.9], w: 1 });
    const threads = new GlowLines(threadSegs, { width: 0.05, minPx: 1.6, shimmer: 0.8, renderOrder: 7 });
    threads.mesh.frustumCulled = false;
    threads.opacity = 0;
    holder.add(threads.mesh);
    threads.mesh.position.set(-P.x, -P.y, -P.z);   // segments are written in world space
    const disc = this.memDisc;
    disc.position.set(P.x, P.y + 0.04, P.z);
    disc.visible = true;
    disc.material.uniforms.uO.value = 0;
    const lamp = { I: 0 }, lp = P.clone().add(v3(0, 1.3, 0));
    const src = light ? this.light(lp, () => lamp.I, 7, '#ffc86a') : null;
    const T = seconds;
    const tIn = Math.min(1.8, T * 0.16), tOut = Math.min(2.4, T * 0.2);
    const c0 = T * 0.44, c1 = c0 + Math.min(1.9, T * 0.16);
    const H = 1.62 * scale;
    let theta = 0, sideMap = null, cheered = false, acc = 0, accE = 0;
    const tgt = v3(), sh = v3(), sh2 = v3(), hA = v3(), hB = v3(), mid = v3();
    const task = this.run((dt, t) => {
      const fadeIn = smooth(0, tIn, t), out = smooth(T - tOut, T, t);
      GU.uHigh.value = 1.12 * fadeIn + (fadeIn >= 1 ? 1 : 0);
      GU.uLow.value = 1.12 * out;
      GU.uOpacity.value = smooth(0, 0.3, t) * (1 - smooth(T - 0.15, T, t));
      const cheering = t > c0 && t < c1;
      // ring speed: round one way, pause to cheer, then back the other way
      const w = 0.42 * (t < c0 ? smooth(0, 0.8, t) * (1 - smooth(c0 - 0.5, c0, t)) : -smooth(c1, c1 + 0.8, t));
      theta += w * dt;
      const hands = (1 - smooth(c0 - 0.45, c0, t)) * smooth(0.3, 0.9, t) + smooth(c1 - 0.1, c1 + 0.5, t) * (1 - out);
      if (cheering && !cheered) {
        cheered = true;
        dancers.forEach(d => play(d, d.cheer, 1, 0.25, true));
        _p.copy(P).add(_s.set(0, 1.3, 0));
        this.spray(_p, { n: Math.round(60 * K), speed: 3.5, life: 1.6, size: 0.14, kind: KIND.STAR, gravity: -0.4, drag: 1.4 });
        this.spray(_p, { n: Math.round(14 * K), colors: [lin('#ff7eb6', 2), lin('#ffd46a', 2)], speed: 2.4, life: 2, size: 0.16, kind: KIND.HEART, gravity: -0.6, drag: 1.2 });
      }
      if (!cheering && cheered && t > c1 && dancers[0].cur?.loop === THREE.LoopOnce) dancers.forEach(d => play(d, 'Walk', 0.5, 0.4));
      dancers.forEach((d, i) => {
        const a = theta + d.a0;
        const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
        const hop = Math.abs(Math.sin(t * 4.2 + i * 0.8)) * 0.05 * hands;
        d.wrap.position.set(x, hop, z);
        const yawC = Math.atan2(-x, -z);
        const dirw = Math.sign(w) || (t < c0 ? 1 : -1);
        const yawT = Math.atan2(-Math.sin(a) * dirw, Math.cos(a) * dirw);
        let dy = yawT - yawC; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        d.wrap.rotation.y = yawC + dy * 0.45 * (cheering ? 0.2 : 1);
        d.mixer.update(dt);
        if (d.bones.head) d.bones.head.scale.setScalar(1.13);
      });
      holder.updateMatrixWorld(true);
      if (!sideMap) {
        // does hand_L or hand_R point toward the next dancer?
        sideMap = dancers.map((d, i) => {
          const nx = dancers[(i + 1) % N].wrap.getWorldPosition(v3());
          const L = d.bones.hand_L?.getWorldPosition(v3()), R = d.bones.hand_R?.getWorldPosition(v3());
          return L && R ? (L.distanceTo(nx) < R.distanceTo(nx) ? 'L' : 'R') : 'L';
        });
      }
      const other = s => (s === 'L' ? 'R' : 'L');
      let seg = 0;
      for (let i = 0; i < N; i++) {
        const A = dancers[i], B = dancers[(i + 1) % N];
        const sa = sideMap[i], sb = other(sideMap[(i + 1) % N]);
        const ua = A.bones[`upperarm_${sa}`], ub = B.bones[`upperarm_${sb}`];
        if (!ua || !ub) continue;
        ua.getWorldPosition(sh); ub.getWorldPosition(sh2);
        tgt.addVectors(sh, sh2).multiplyScalar(0.5);
        tgt.y -= 0.28 * scale;
        aimArm(ua, A.bones[`forearm_${sa}`], A.bones[`hand_${sa}`], tgt, hands);
        aimArm(ub, B.bones[`forearm_${sb}`], B.bones[`hand_${sb}`], tgt, hands);
        A.bones[`hand_${sa}`]?.getWorldPosition(hA);
        B.bones[`hand_${sb}`]?.getWorldPosition(hB);
        mid.addVectors(hA, hB).multiplyScalar(0.5);
        mid.y -= 0.04 + hA.distanceTo(hB) * 0.15;
        threads.setSegment(seg++, hA, _q2.copy(hA).lerp(mid, 0.9));
        threads.setSegment(seg++, _q2.copy(hA).lerp(mid, 0.9), _q3.copy(hB).lerp(mid, 0.9));
        threads.setSegment(seg++, _q3.copy(hB).lerp(mid, 0.9), hB);
      }
      threads.opacity = hands * GU.uOpacity.value * 0.9 * (1 - out);
      // sparkles: rising off the dancers, a flurry along the dissolve edges
      acc += dt * 46 * K * GU.uOpacity.value;
      while (acc > 1) {
        acc--;
        const d = pick(dancers);
        d.wrap.getWorldPosition(_p);
        _p.add(_s.set(rand(-0.3, 0.3), rand(0.1, 1) * H * fadeIn, rand(-0.3, 0.3)));
        this.glow.emit(_p, _v.set(rand(-0.15, 0.15), rand(0.4, 1.0), rand(-0.15, 0.15)), { life: rand(1.4, 2.6), size: rand(0.06, 0.13), color: pick(GOLDS), kind: Math.random() < 0.7 ? KIND.SPARK : KIND.STAR, gravity: -0.1, drag: 0.4, twinkle: 1, flutter: 0.08 });
      }
      const edge = fadeIn < 1 ? GU.uHigh.value : out > 0 ? GU.uLow.value : -1;
      if (edge > 0 && edge < 1.05) {
        accE += dt * 150 * K;
        while (accE > 1) {
          accE--;
          const d = pick(dancers), ang = rand(0, 6.28), r = rand(0.1, 0.28);
          d.wrap.getWorldPosition(_p);
          _p.add(_s.set(Math.cos(ang) * r, edge * H, Math.sin(ang) * r));
          this.glow.emit(_p, _v.set(Math.cos(ang) * 0.3, rand(0.5, out > 0 ? 2.2 : 0.8), Math.sin(ang) * 0.3), { life: rand(0.8, 1.8), size: rand(0.06, 0.14), color: pick([[2.4, 2.0, 1.3], ...GOLDS]), kind: KIND.SPARK, gravity: -0.2, drag: 0.6, twinkle: 1 });
        }
      }
      disc.material.uniforms.uO.value = GU.uOpacity.value * (0.55 + 0.45 * fadeIn) * (1 - out * 0.8);
      lamp.I = (2.2 + 5.5 * this.night) * GU.uOpacity.value * (1 - out * 0.7);
      return t >= T;
    }, () => {
      for (const d of dancers) {
        d.mixer.stopAllAction();
        d.mixer.uncacheRoot(d.obj);
        d.obj.traverse(o => o.skeleton?.dispose?.());
      }
      this.root.remove(holder);
      threads.mesh.geometry.dispose(); threads.mat.dispose();
      disc.visible = false;
      this.unlight(src);
    });
    this.memTask = task.task;
    return task;
  }

  // ---------------------------------------------------------------------------------------------- 18. grow
  /**
   * A magical growing animation for a model (the star-tree): it rises from nothing with an ease-out-back
   * (height leading, crown following, a little untwist), a triple spiral of gold sparkles climbing around it,
   * then a burst of stars from the crown. Adds `obj` to the scene if it has no parent; restores its scale and
   * rotation exactly at the end. ~seconds + 1.4 s.
   */
  grow(obj, seconds = 3, { spin = 1.1 } = {}) {
    const g = this.g, K = this.k;
    if (!obj) return Promise.resolve();
    if (!obj.parent) g.scene.add(obj);
    const S = obj.scale.clone(), yaw = obj.rotation.y;
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const wp = obj.getWorldPosition(v3());
    const base = v3(wp.x, box.isEmpty() ? wp.y : box.min.y, wp.z);
    const H = box.isEmpty() ? 5 : Math.max(1, box.max.y - box.min.y);
    const R = box.isEmpty() ? 2 : Math.max(0.8, Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2);
    const f = Math.max(0.45, Math.min(1, H / 7));   // sparkle scale: a sapling gets a finer spiral than a big tree
    obj.scale.setScalar(1e-4);
    const lamp = { I: 0 }, lp = base.clone();
    const src = this.light(lp, () => lamp.I, Math.max(12, H * 2.2), '#ffd27a');
    _p.copy(base).add(_s.set(0, 0.3, 0));
    this.glow.emit(_p, _v.set(0, 0, 0), { life: 1.1, size: R * 0.8, color: [2.2, 1.6, 0.8], kind: KIND.RING, grow: 2.2, alpha: 0.6 });
    this.glow.emit(_p, _v.set(0, 0, 0), { life: 0.8, size: R * 1.1, color: [2.0, 1.4, 0.6], kind: KIND.GLOW, alpha: 0.4 });
    this.spray(_p, { n: Math.round(40 * K), speed: 3 * f, life: 1.3, size: 0.25 * f, gravity: -0.5, up: 1 });
    this.sfx('star');
    let acc = 0, burst = false;
    return this.run((dt, t) => {
      // a steady rise, a little overshoot around 75 %, settled at the end (height leads, the crown follows)
      const k = clamp01(t / seconds), grow = x => easeOutBack(clamp01(x) ** 1.6);
      const ey = grow(k), exz = grow(k * 1.15 - 0.15);
      obj.scale.set(S.x * Math.max(1e-4, exz), S.y * Math.max(1e-4, ey), S.z * Math.max(1e-4, exz));
      obj.rotation.y = yaw + spin * (1 - k) ** 2;
      const h = H * Math.max(0.05, Math.min(1.1, ey));
      if (t < seconds) {
        // three comet heads spiral up round the trunk, each leaving a helical ribbon of sparkles
        acc += dt * 240 * K * f;
        const per = Math.floor(acc / 3);
        acc -= per * 3;
        for (let arm = 0; arm < 3; arm++) {
          const u = (t * 0.75 + arm / 3) % 1;
          const th = u * Math.PI * 4 + arm * Math.PI * 2 / 3 + t * 1.2;
          const r = (R * (0.35 + 0.75 * Math.min(1, exz)) * (1 - 0.5 * u) + 0.35 * f);
          _p.set(base.x + Math.cos(th) * r, base.y + 0.2 + u * h, base.z + Math.sin(th) * r);
          this.glow.emit(_p, _v.set(0, 0.2, 0), { life: 0.2, size: 0.75 * f, color: [2.4, 1.8, 0.9], kind: KIND.GLOW, alpha: 0.55 });
          for (let i = 0; i < per; i++) {
            _q2.set(_p.x + rand(-0.12, 0.12), _p.y + rand(-0.12, 0.12), _p.z + rand(-0.12, 0.12));
            this.glow.emit(_q2, _v.set(-Math.sin(th) * 0.35 + rand(-0.2, 0.2), rand(0.2, 0.7), Math.cos(th) * 0.35 + rand(-0.2, 0.2)), { life: rand(0.9, 1.6), size: rand(0.18, 0.36) * f, color: Math.random() < 0.8 ? pick(GOLDS) : pick([lin('#ff8ac4', 2.2), lin('#8ad0ff', 2.2)]), kind: Math.random() < 0.7 ? KIND.SPARK : KIND.STAR, drag: 0.8, gravity: 0.3, twinkle: 1 });
          }
        }
      }
      lp.set(base.x, base.y + h * 0.55, base.z);
      lamp.I = (10 + 26 * this.night) * f * f * smooth(0, 0.5, t) * (1 - smooth(seconds + 0.2, seconds + 1.4, t));
      if (!burst && t >= seconds) {
        burst = true;
        const crown = v3(base.x, base.y + H * 0.66, base.z);
        this.spray(crown, { n: Math.round(130 * K), speed: Math.max(3.5, R * 2.4), life: 2.2, size: 0.5 * f, kind: KIND.STAR, gravity: 0.6, drag: 1.5, up: 0.4 });
        this.spray(crown, { n: Math.round(110 * K), colors: [...GOLDS, lin('#ff8ac4', 2.2), lin('#9ad8ff', 2.2)], speed: Math.max(3, R * 2), life: 2.8, size: 0.26 * f, gravity: 1, drag: 1.1, up: 0.5 });
        this.glow.emit(crown, _v.set(0, 0, 0), { life: 0.45, size: H * 0.9, color: [2.4, 1.9, 1.2], kind: KIND.GLOW, alpha: 0.28 });
        this.glow.emit(crown, _v.set(0, 0, 0), { life: 0.8, size: R * 0.7, color: [2.3, 1.7, 1.0], kind: KIND.RING, grow: 3, alpha: 0.45 });
        this.sfx('sparkHit');
      }
      return t >= seconds + 1.4;
    }, () => { obj.scale.copy(S); obj.rotation.y = yaw; this.unlight(src); });
  }

  // ---------------------------------------------------------------------------------------------- 19. tree glow
  /**
   * A persistent soft aura for the star-tree: golden motes drifting up and around the tree and a gently pulsing
   * glow in the crown, brighter at night (plus a soft night light-pool source unless light: false). `pos` is the
   * tree's base point, or the tree Object3D itself (then radius and height are fitted to its bounds). Options:
   * radius (1.5 m), height (3.6 m): sized for the 3 m star-tree. Handle { stop(), promise };
   * treeGlow(null, false) stops all. Not touched by stopAll().
   */
  treeGlow(pos, on = true, { radius = 1.5, height = 3.6, light = true } = {}) {
    if (!on) { for (const h of [...this.treeGlows]) h.stop(); return null; }
    const K = this.k;
    let P;
    if (pos?.isObject3D) {
      pos.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(pos);
      if (b.isEmpty()) P = pos.getWorldPosition(v3());
      else {
        P = v3((b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2);
        radius = Math.max(0.8, Math.max(b.max.x - b.min.x, b.max.z - b.min.z) * 0.55);
        height = Math.max(1.5, (b.max.y - b.min.y) * 1.2);
      }
    } else P = toVec(pos);
    const motes = new MoteCloud(Math.round(Math.min(170, 40 + height * 18) * Math.max(0.6, K)), radius, height, Math.max(0.5, Math.min(1, height / 7)));
    motes.points.position.copy(P);
    motes.intensity = 0;
    const crown = P.clone().add(v3(0, height * 0.58, 0));
    // an aura behind the crown (the foliage rims it with light) and a faint glow on the camera side
    const halo = new GlowPoints([{ x: 0, y: 0, z: 0, size: height * 1.8, color: [2.1, 1.35, 0.5], alpha: 0.42 }], { kind: KIND.GLOW });
    const front = new GlowPoints([{ x: 0, y: 0, z: 0, size: height * 0.9, color: [2.4, 1.85, 1.0], alpha: 0.12 }], { kind: KIND.GLOW });
    halo.intensity = 0; front.intensity = 0;
    halo.points.position.copy(crown); front.points.position.copy(crown);
    halo.points.frustumCulled = false; front.points.frustumCulled = false;
    const group = new THREE.Group();
    group.name = 'cel:treeGlow';
    group.add(motes.points, halo.points, front.points);
    this.root.add(group);
    const st = { fade: 0, stopping: false, t: 0, I: 0 };
    const src = light ? this.light(crown, () => st.I, Math.max(7, height * 1.5), '#ffd27a') : null;
    let resolve;
    const handle = { stop: () => { st.stopping = true; }, promise: new Promise(r => { resolve = r; }) };
    handle.step = dt => {
      st.t += dt;
      st.fade = st.stopping ? Math.max(0, st.fade - dt / 1.5) : Math.min(1, st.fade + dt / 1.5);
      const night = this.night, pulse = 0.82 + 0.18 * Math.sin(st.t * 1.6);
      _v.subVectors(this.g.camera.position, crown).setY(0);
      if (_v.lengthSq() > 1e-4) {
        _v.normalize();
        halo.points.position.copy(crown).addScaledVector(_v, -radius * 0.9);
        front.points.position.copy(crown).addScaledVector(_v, radius * 0.9);
      }
      motes.intensity = st.fade * (0.55 + 0.45 * night);
      halo.intensity = st.fade * (0.28 + 0.72 * night) * pulse;
      front.intensity = halo.intensity;
      st.I = st.fade * night * 5 * pulse;
      if (st.fade > 0.2 && Math.random() < dt * 3) {
        _p.set(crown.x + rand(-1, 1) * radius * 0.7, crown.y + rand(-0.4, 0.5) * height * 0.5, crown.z + rand(-1, 1) * radius * 0.7);
        this.glow.emit(_p, _v.set(0, rand(0.1, 0.4), 0), { life: rand(0.9, 1.5), size: rand(0.25, 0.45), color: pick(GOLDS), kind: KIND.SPARK, twinkle: 0.6 });
      }
      return st.stopping && st.fade <= 0;
    };
    handle.end = () => {
      this.root.remove(group);
      motes.dispose();
      for (const gp of [halo, front]) { gp.points.geometry.dispose(); gp.mat.dispose(); }
      this.unlight(src);
      this.treeGlows = this.treeGlows.filter(h => h !== handle);
      resolve();
    };
    this.treeGlows.push(handle);
    return handle;
  }

  // ---------------------------------------------------------------------------------------------- 20. gift glow
  /** A small warm sparkle and a tiny ribbon of hearts spiralling up where a thank-you gift just appeared. ~3 s. */
  giftGlow(pos) {
    const P = toVec(pos), K = this.k;
    this.spray(P, { n: Math.round(36 * K), speed: 2.2, life: 1.3, size: 0.12, gravity: -0.3, drag: 1.6, up: 0.6 });
    this.glow.emit(P, _v.set(0, 0, 0), { life: 0.5, size: 1.2, color: [2.4, 1.8, 1.0], kind: KIND.GLOW, alpha: 0.45 });
    this.glow.emit(P, _v.set(0, 0, 0), { life: 0.7, size: 0.5, color: [2.2, 1.7, 1.0], kind: KIND.RING, grow: 3, alpha: 0.7 });
    const lamp = { t: 0 };
    const src = this.light(P, () => Math.max(0, 7 * (1 - lamp.t / 1.2)), 6, '#ffd6a0');
    const HEARTS = [lin('#ff5a8a', 2.2), lin('#ff8ab8', 2.2), lin('#ffd46a', 2.1), lin('#ff6a6a', 2.1)];
    let acc = 0, n = 0;
    this.sfx('pickup');
    return this.run((dt, t) => {
      lamp.t = t;
      acc += dt * 9;
      while (acc > 1 && n < 16) {
        acc--;
        const u = n / 15, a = u * Math.PI * 3.2;
        _p.set(P.x + Math.cos(a) * 0.32, P.y + 0.15 + u * 1.3, P.z + Math.sin(a) * 0.32);
        this.glow.emit(_p, _v.set(-Math.sin(a) * 0.12, 0.25, Math.cos(a) * 0.12), { life: rand(1.4, 1.8), size: 0.13 + 0.06 * Math.sin(u * Math.PI), color: HEARTS[n % HEARTS.length], kind: KIND.HEART, gravity: -0.15, drag: 0.8, twinkle: 0.3, flutter: 0.04 });
        this.glow.emit(_p, _v.set(rand(-0.2, 0.2), rand(-0.3, 0.1), rand(-0.2, 0.2)), { life: rand(0.6, 1), size: rand(0.05, 0.09), color: pick(GOLDS), kind: KIND.SPARK, twinkle: 1 });
        n++;
      }
      return t > 3;
    }, () => this.unlight(src));
  }

  // ---------------------------------------------------------------------------------------------- 21. music notes
  /**
   * Little glowing music notes (gold, pink and blue) float up and sway from `pos` (Sora's music box), with a
   * few sparkles. Notes stop rising ~2.6 s before the end, so the last have faded when it resolves. ~seconds.
   */
  musicNotes(pos, seconds = 8) {
    const P = toVec(pos);
    const COLS = [lin('#ffd46a', 2.5), lin('#ffe9a8', 2.3), lin('#ff8ac4', 2.5), lin('#ffb0d8', 2.3), lin('#8ac8ff', 2.5), lin('#b8a8ff', 2.4)];
    const KINDS = [NOTE.EIGHTH, NOTE.EIGHTH, NOTE.PAIR, NOTE.QUARTER, NOTE.SIXTEENTH, NOTE.CLEF];
    let acc = 0.7, last = -1;
    return this.run((dt, t) => {
      if (t < seconds - 2.6) {
        acc += dt * 4.2;
        while (acc > 1) {
          acc--;
          let side = Math.random() < 0.5 ? -1 : 1;
          if (side === last && Math.random() < 0.6) side = -side;
          last = side;
          _p.set(P.x + rand(-0.08, 0.08), P.y + 0.12, P.z + rand(-0.08, 0.08));
          const ang = rand(0, Math.PI * 2);
          this.notes.emit(_p, _v.set(Math.cos(ang) * 0.18, rand(0.42, 0.62), Math.sin(ang) * 0.18), { life: rand(2.2, 2.7), size: rand(0.22, 0.32), color: pick(COLS), kind: pick(KINDS), spin: rand(0.22, 0.42), flutter: rand(0.05, 0.1), drag: 0.25, gravity: -0.05, twinkle: 0.25 });
          this.glow.emit(_p, _v.set(rand(-0.2, 0.2), rand(0.3, 0.7), rand(-0.2, 0.2)), { life: rand(0.8, 1.4), size: rand(0.04, 0.08), color: pick(GOLDS), kind: KIND.SPARK, twinkle: 1, drag: 0.5 });
        }
      }
      return t >= seconds;
    });
  }

  // ---------------------------------------------------------------------------------------------- frame
  update(dt) {
    const g = this.g;
    // the sky's environment map arrives with the first world update: compile the env-mapped variants then too
    if (!this.envCompiled && g.scene?.environment) { this.envCompiled = true; this.precompile(); }
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
    ease(this.sf, 0.4);
    this.starfield.update(this.sf.cur * smooth(0.35, 0.95, night), cam, g.world?.sky, Math.max(0.6, Math.min(3, h / 720)));
    for (const tg of [...this.treeGlows]) if (tg.step(dt)) tg.end();
    this.decor.update(night);
    this.glow.flush();
    this.solid.flush();
    this.notes.flush();
  }
}
