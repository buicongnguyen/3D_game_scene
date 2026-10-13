// Grasshopper and mantis (docs/RURAL-TRICKS.md, the meadow bug catching): summer and autumn days, in the long grass
// below the rice paddies. Mika holds a bug net and walks through the grass; a ring on the ground shows where the net will
// land. Grasshoppers crouch for 0.3 s before each hop (the tell); a mantis watches her, so she creeps while it stares.
// Catches go into the cage at her hip; at the end she opens it and everything hops away.
//
// The rules (the noise of her walk, the hop schedule, the mantis's alarm, the net, the score) are pure and Node-tested
// (./rules-hoppers.js); the round below only draws them. Cheap: at most ten pooled bug pictures, one ring, a few
// DOM numbers that are written only when they change; nothing allocates per frame.
import * as THREE from 'three';
import { N_, tx } from '../../i18n/i18n.js';
import { placeProblems } from '../../world/roads.js';
import { rng, BUGS, noiseOf, aimSpot, catchable, Meadow, Net, Tally, hopLevel, waveAt, Order } from './rules-hoppers.js';
import { BUG_CSS, Critter, NetRig, Cage, Release, creepFilter, padHeld, plural } from './bugkit.js';
import { addCss } from './util.js';

const V3 = THREE.Vector3;
const _v = new V3(), _w = new V3();
const GRASS_LIFT = 0.1;          // a grasshopper sits on the blades, not in the soil
const MANTIS_STALK = 0.5;        // a mantis stands on a stalk this high
const POSE = { sit: 'idle', crouch: 'crouch', hop: 'hop', tired: 'tired', stand: 'idle', threat: 'threat', flee: null };   // (a mantis flies off with its wings fanned: it keeps the threat pose)
const DOT = ['#6cc24a', '#f2b53a', '#e2572b'];   // a mantis's dot: calm, watching, alarmed
const MEADOW_R = 28;             // the bugs stay within this many metres of the sign
const TINT = [null, '#a0703a', '#c4b43a'];                    // a grasshopper's body: green (as painted), brown, golden
const GLOW = ['#c8ff9a', '#ffb878', '#fff08a'];               // the glow in the grass under each, in its colour
const WANT_CSS = ['#6cc24a', '#a0703a', '#d9b92e', '#3f9a52'];
const WANT_NAME = [N_('a green one'), N_('a brown one'), N_('a golden one'), N_('a mantis')];
/** What the teacher says when a wave begins (rules-hoppers.js HOP_LEVELS), by level. */
const WAVE_SAY = {
  normal: [null, N_('Part 2: two mantises are out. Creep when one stares!'), N_('Part 3: three mantises! Slow and steady.')],
  hard: [null, N_('Part 2: a windy spell! The glow is gone. Look for the bugs themselves.'), N_('Part 3: the wind drops. Three mantises are out!')],
};

const CSS = `
#bugPts{position:fixed;inset:0;z-index:15;pointer-events:none;overflow:hidden}
.bugBox .want{display:flex;gap:6px;align-items:center;justify-content:center;margin-top:6px;padding:3px 8px;border-radius:999px;background:#fff1cf;font:700 13px Nunito,system-ui,sans-serif;white-space:nowrap}
.bugBox .want i{width:14px;height:14px;border-radius:50%;background:var(--c);box-shadow:inset 0 0 0 2px #fff8,0 0 0 1px #5a3a2244;flex:none}
.bugBox .want b{color:#c2541c;font:600 15px Fredoka,Nunito,sans-serif}
.bugBox .want.pop{animation:bugPop .35s}
#bugPts span{position:absolute;transform:translate(-50%,-50%);font:700 22px Fredoka,Nunito,sans-serif;color:#fff;text-shadow:0 2px 0 #b8640a,0 0 8px #f2a51a;animation:bugFloat .95s ease-out forwards}
@keyframes bugFloat{from{opacity:1;margin-top:0}to{opacity:0;margin-top:-52px}}
`;

/** "3 grasshoppers and 1 mantis" for the results card, in the player's language. */
export function caughtText(g, m) {
  const a = g ? plural(g, N_('1 grasshopper'), N_('{n} grasshoppers')) : '', b = m ? plural(m, N_('1 mantis'), N_('{n} mantises')) : '';
  if (a && b) return tx('{a} and {b}', { a, b });
  return a || b || tx('nothing this time');
}

class HopRound {
  constructor(ctx, seed) {
    this.ctx = ctx;
    const g = this.g = ctx.game;
    this.world = g.world;
    this.player = ctx.player || g.player;
    this.scene = g.scene;
    this.audio = ctx.audio;
    this.seed = seed;
    this.rand = rng(seed);
    this.touch = !!ctx.ui?.touch;
    this.low = g.renderer?.q?.name === 'Low';
    const first = !!ctx.first;
    // the level's plan (HOP_LEVELS): its waves say how many bugs are out at once (a phone on the Low tier shows fewer)
    const L = this.L = hopLevel(ctx.level, first);
    this.wave = 0;
    this.windy = 0;                                    // 0..1: how hard the windy spell blows just now
    this.order = L.order ? new Order(rng(seed + 99)) : null;
    const grass = this.cap('grass', L.waves[0].grass), mantis = this.cap('mantis', L.waves[0].mantis);
    const c = ctx.place, grid = g.world.grid;
    this.meadow = new Meadow({
      rand: this.rand, grass, mantis, notice: L.notice, crouch: L.crouch, alarm: L.alarm,
      ok: (x, z) => Math.hypot(x - c.x, z - c.z) < MEADOW_R && !placeProblems(x, z, grid).length,
    });
    if (first) this.meadow.respawn.mantis = 12;       // the guided try: grasshoppers first, the mantis a little later
    this.net = new Net();
    this.tally = new Tally();
    this.cs = { creeping: false };
    this.pl = { x: 0, z: 0, speed: 0, facing: 0 };
    this.aim = { x: 0, z: 0 };
    this.free = { grasshopper: [], mantis: [] };
    this.all = [];
    this.carry = [];                                   // caught bugs on their way into the cage
    this.t = 0;
    this.said = {};
    this.sinceHit = 0;
    this.ready = false;
    this.swingK = 0;
    this.phaseWas = 'idle';
    this.shown = { g: -1, m: -1, pct: -1, cls: '' };
    this.release = null;
    this.ending = false;
    this.own = [];
  }

  /** How many bugs of a kind a wave may have out at once on this device (the Low tier draws fewer grasshoppers; the mantises are the waves). */
  cap(kind, n) { return this.low && kind === 'grass' ? Math.min(n, 4) : n; }

  build() {
    const g = this.g, ctx = this.ctx, assets = g.assets;
    addCss('bugCss', BUG_CSS);
    addCss('hopCss', CSS);
    // the bug pictures, made once: a few spare ones for the caught bugs still on their way to the cage
    const stalkGeo = new THREE.CylinderGeometry(0.012, 0.02, MANTIS_STALK, 5).translate(0, -MANTIS_STALK / 2, 0);
    const stalkMat = new THREE.MeshStandardMaterial({ color: '#6c9a3a', roughness: 0.9 });
    const dotGeo = new THREE.SphereGeometry(0.045, 8, 6);
    this.own.push(stalkGeo, stalkMat, dotGeo);
    // a soft glow in the grass under each grasshopper: green bugs on green grass are hard to find from the camera's distance
    const gc = document.createElement('canvas');
    gc.width = gc.height = 64;
    const gx = gc.getContext('2d'), gr = gx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,246,170,0.95)'); gr.addColorStop(0.5, 'rgba(255,236,120,0.4)'); gr.addColorStop(1, 'rgba(255,230,100,0)');
    gx.fillStyle = gr; gx.fillRect(0, 0, 64, 64);
    const glowTex = new THREE.CanvasTexture(gc);
    glowTex.colorSpace = THREE.SRGBColorSpace;
    const glowGeo = new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2);
    // (one glow material for each body colour when an order asks for bugs by colour; else one for all)
    this.glowMats = (this.order ? GLOW : ['#ffffff']).map(col => new THREE.MeshBasicMaterial({ map: glowTex, color: col, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.own.push(glowTex, glowGeo, ...this.glowMats);
    let maxG = 0, maxM = 0;
    for (const w of this.L.waves) { maxG = Math.max(maxG, this.cap('grass', w.grass)); maxM = Math.max(maxM, this.cap('mantis', w.mantis)); }
    for (const [kind, n] of [['grasshopper', maxG + 3], ['mantis', maxM + 2]]) {
      for (let i = 0; i < n; i++) {
        const c = new Critter(assets, kind);
        c.col = kind === 'grasshopper' ? i % 3 : -1;
        if (kind === 'grasshopper') {
          const glow = new THREE.Mesh(glowGeo, this.glowMats[c.col % this.glowMats.length]);
          glow.position.y = 0.06 - GRASS_LIFT;
          glow.renderOrder = 4;
          c.root.add(glow);
        }
        if (kind === 'grasshopper' && i % 3) c.tint(TINT[i % 3]);   // brown and golden ones show against the green grass
        if (kind === 'mantis') {
          const stalk = new THREE.Mesh(stalkGeo, stalkMat);
          stalk.castShadow = false;
          c.root.add(stalk);
          c.stalk = stalk;
          // a little dot over its head says how it feels: green calm, amber watching, red alarmed
          c.dotMat = new THREE.MeshBasicMaterial({ color: '#6cc24a', transparent: true, opacity: 0.95, depthTest: false, fog: false });
          c.dot = new THREE.Mesh(dotGeo, c.dotMat);
          c.dot.position.y = 0.48; c.dot.renderOrder = 9;
          c.root.add(c.dot);
          c.own.push(c.dotMat);
        }
        this.scene.add(c.root);
        this.free[kind].push(c);
        this.all.push(c);
      }
    }
    // the ring where the net will land
    const ringGeo = new THREE.RingGeometry(0.86, 1, 44).rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.75, depthWrite: false, depthTest: false, fog: false, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(ringGeo, this.ringMat);
    this.ring.renderOrder = 6;
    this.ring.name = 'trick:net-ring';
    this.ringCol = new THREE.Color();
    this.scene.add(this.ring);
    this.own.push(ringGeo, this.ringMat);
    this.rig = new NetRig(assets, this.player);
    this.cage = new Cage(assets, this.player);
    // the HUD: the cage with a count for each kind, and how loud she is walking
    const el = this.el = document.createElement('div');
    el.className = 'bugBox';
    el.innerHTML = `<div class="row">
      <span class="cnt g"><img alt="" src="${ctx.ui.icon('grasshopper')}"><span class="alt"></span><b>0</b></span>
      <span class="cnt m"><img alt="" src="${ctx.ui.icon('mantis')}"><span class="alt"></span><b>0</b></span></div>
      ${this.order ? '<div class="want"><span></span><i></i><span class="wn"></span><b></b></div>' : ''}
      <div class="lab"></div><div class="bar"><i></i><b></b></div>`;
    document.body.appendChild(el);
    if (this.order) {
      const w = el.querySelector('.want');
      w.firstElementChild.textContent = tx('Catch next:');
      w.querySelector('b').textContent = `+${BUGS.orderBonus}`;
      this.wantEl = w; this.wantDot = w.querySelector('i'); this.wantName = w.querySelector('.wn');
      this.wantShown = -1;
      this.showWant();
    }
    for (const [cls, name] of [['g', N_('Grasshoppers')], ['m', N_('Mantises')]]) {
      const cnt = el.querySelector(`.cnt.${cls}`), img = cnt.querySelector('img');
      cnt.querySelector('.alt').textContent = tx(name);
      img.onerror = () => { cnt.classList.add('noimg'); img.remove(); };
    }
    this.q = { g: el.querySelector('.cnt.g'), gn: el.querySelector('.cnt.g b'), m: el.querySelector('.cnt.m'), mn: el.querySelector('.cnt.m b'), fill: el.querySelector('.bar i'), mark: el.querySelector('.bar b') };
    el.querySelector('.lab').textContent = tx('Walk softly');
    this.q.mark.style.left = `${BUGS.creep / BUGS.walk * 100}%`;
    this.pts = document.createElement('div');
    this.pts.id = 'bugPts';
    document.body.appendChild(this.pts);
    // the camera comes in and tilts down a little: the meadow floor, where the bugs are, fills the picture (she can still move it)
    const f = g.follow;
    this.camWas = f.zoomTarget;
    f.zoomTarget = Math.min(f.zoomTarget, 4.6);
    f.pitch = Math.max(f.pitch, 0.7);
    // (the camera eases back to a low view while she walks: held at 40 degrees or more, so Mika does not hide the ring and the bugs in it)
    ctx.beforeMove(() => { if (f.pitch < 0.7) f.pitch += (0.7 - f.pitch) * 0.25; });
    ctx.beforeMove(creepFilter(g.input, this.cs));
    ctx.debug.view = () => this.view();
    ctx.debug.round = this;
    // the meadow's everyday grasshoppers and mantises keep out of sight while the round has its own
    const crit = ctx.director.wildlife?.critters;
    if (crit) { (crit.hidden ??= new Set()).add('grasshopper').add('mantis'); this.crit = crit; }
  }

  /** The order's card: the bug asked for now, by its colour and its name. */
  showWant() {
    const w = this.order.want;
    if (w === this.wantShown) return;
    const was = this.wantShown;
    this.wantShown = w;
    this.wantDot.style.setProperty('--c', WANT_CSS[w]);
    this.wantName.textContent = tx(WANT_NAME[w]);
    if (was >= 0) { this.wantEl.classList.remove('pop'); void this.wantEl.offsetWidth; this.wantEl.classList.add('pop'); }
  }

  /** The round's waves: more mantises out as it goes on; on Difficult a windy spell in the middle. */
  waves(dt, left) {
    const L = this.L, total = this.ctx.roundTime, k = waveAt(L, total - left, total);
    if (k !== this.wave) {
      this.wave = k;
      const w = L.waves[k], m = this.meadow;
      m.want.grass = this.cap('grass', w.grass); m.want.mantis = this.cap('mantis', w.mantis);
      m.respawn.mantis = Math.min(m.respawn.mantis, 0.6);
      const say = !this.ctx.first && WAVE_SAY[this.ctx.level]?.[k];
      if (say) { this.ctx.hint(say, 5.5); this.audio?.chime?.(2); }
      if (w.wind) this.audio?.whoosh?.(0.8);
    }
    // the wind: it comes up and drops over a second or two; while it blows the glow is gone, and her steps are harder to hear
    const blow = L.waves[this.wave].wind ? 1 : 0;
    if (this.windy !== blow) {
      this.windy += Math.sign(blow - this.windy) * Math.min(Math.abs(blow - this.windy), dt * 0.7);
      this.meadow.notice = L.notice * (1 - 0.15 * this.windy);
    }
    if (blow && (this.gust = (this.gust || 0) - dt) <= 0) { this.gust = 3.2 + Math.random() * 2; this.audio?.whoosh?.(0.5); }
  }

  // ---------------------------------------------------------------- the bugs on screen
  /** A picture for a new bug: a grasshopper of the colour the rules gave it when one is free (else any, and the bug takes that colour). */
  take(kind, col = -1) {
    const list = this.free[kind];
    if (col >= 0) for (let i = list.length - 1; i >= 0; i--) if (list[i].col === col) return list.splice(i, 1)[0];
    return list.pop() || null;
  }
  give(c) { c.root.visible = false; c.bst = c.gz = ''; this.free[c.kind].push(c); }

  events() {
    const ev = this.meadow.events, audio = this.audio;
    for (let i = 0; i < ev.length; i++) {
      const { kind, bug: b } = ev[i];
      if (kind === 'spawn') {
        const c = this.take(b.kind === 'grass' ? 'grasshopper' : 'mantis', b.colour);
        if (!c) { b.alive = false; continue; }
        if (b.kind === 'grass') b.colour = c.col;
        b.vis = c; c.bug = b; c.bst = ''; c.gz = '';
        c.root.visible = true; c.root.scale.setScalar(1);
        c.pose('idle', true);
        this.place(c, b);
        if (b.kind === 'mantis' && !this.said.mantis) { this.said.mantis = 1; if (this.ctx.first) this.ctx.hint(N_('A mantis! When it stares, creep. When it looks away, you can walk.'), 6); }
      } else if (kind === 'gone') {
        if (b.vis) { this.give(b.vis); b.vis = null; }
      } else if (kind === 'crouch') {
        if (this.windy < 0.5) audio?.blip?.(1.9);                 // (the wind in the grass hides the little rustle)
        if (!this.said.crouch && this.ctx.first && this.tally.caught === 0) { this.said.crouch = 1; this.ctx.hint(N_('It crouched! That means it is about to jump. Swing now, or creep closer next time.'), 5); }
      } else if (kind === 'hop') audio?.jump?.();
      else if (kind === 'alarm') audio?.miss?.();
      else if (kind === 'threat') {
        audio?.whoosh?.(2);
        if (!this.said.threat) { this.said.threat = 1; this.ctx.hint(N_('It is only bluffing, rearing up to look big. A quieter walk next time!'), 4.5); }
      } else if (kind === 'caught') this.caught(b);
    }
    ev.length = 0;
  }

  /** A bug was netted: its picture struggles in the net, then travels into the cage. */
  caught(b) {
    const c = b.vis;
    if (!c) return;
    this.ctx.groundReach?.();
    b.vis = null;
    c.pose(b.kind === 'mantis' ? 'strike' : 'struggle', true);
    this.carry.push({ c, t: 0, kind: b.kind, fx: c.root.position.x, fy: c.root.position.y, fz: c.root.position.z, tx: this.aim.x, tz: this.aim.z });
  }

  place(c, b) {
    const r = c.root, ground = this.world.heightAt(b.x, b.z);
    let y = ground + (b.kind === 'mantis' ? MANTIS_STALK : GRASS_LIFT);
    if (b.st === 'hop') y += Math.sin(Math.PI * b.u) * (0.12 + 0.1 * Math.hypot(b.tx - b.fx, b.tz - b.fz));
    else if (b.st === 'flee') y += Math.sin(Math.PI * b.u) * 0.9;
    r.position.set(b.x, y, b.z);
    r.rotation.y = b.face;
  }

  drawBugs(dt) {
    const bugs = this.meadow.bugs;
    const glow = (0.42 + 0.2 * Math.sin(this.t * 3.2)) * (1 - 0.92 * this.windy);
    for (let i = 0; i < this.glowMats.length; i++) this.glowMats[i].opacity = glow;
    for (let i = 0; i < bugs.length; i++) {
      const b = bugs[i], c = b.vis;
      if (!c || !b.alive) continue;
      this.place(c, b);
      if (c.bst !== b.st) {
        c.bst = b.st;
        const want = POSE[b.st];
        if (b.kind === 'mantis' && b.st === 'stand') c.gz = '';       // it is standing again: settle the gaze below
        else if (want) c.pose(want, b.st === 'crouch');
      }
      if (b.kind === 'mantis') {
        if (b.st === 'stand' && c.gz !== b.gaze) { c.gz = b.gaze; c.pose(b.gaze === 'you' ? 'look' : 'lookr', true); }
        // its dot: calm, watching, alarmed
        const mood = b.alarm > 0.55 || b.st === 'threat' ? 2 : b.gaze === 'you' && b.st === 'stand' ? 1 : 0;
        if (mood !== c.mood) { c.mood = mood; c.dotMat.color.set(DOT[mood]); }
        c.dot.scale.setScalar(1 + b.alarm * 0.9);
        c.dot.visible = b.st !== 'flee';
      }
      c.update(dt);
    }
    // the caught ones: into the net, then to the cage at her hip
    const cage = this.cage;
    for (let i = this.carry.length - 1; i >= 0; i--) {
      const k = this.carry[i], c = k.c, r = c.root;
      k.t += dt;
      if (k.t < 0.4) {
        const u = k.t / 0.4;
        r.position.set(k.fx + (k.tx - k.fx) * u, k.fy + (this.world.heightAt(k.tx, k.tz) + 0.6 - k.fy) * u + Math.sin(Math.PI * u) * 0.25, k.fz + (k.tz - k.fz) * u);
      } else if (k.t < 0.8) {
        const u = (k.t - 0.4) / 0.4;
        cage.holder.getWorldPosition(_v);
        _w.set(k.tx, this.world.heightAt(k.tx, k.tz) + 0.6, k.tz);
        r.position.lerpVectors(_w, _v, u * u * (3 - 2 * u));
        r.scale.setScalar(1 - 0.7 * u);
        cage.open(Math.sin(Math.PI * u) * 0.6);
      } else {
        cage.open(0);
        this.give(c);
        this.carry.splice(i, 1);
        this.bump(k.kind === 'mantis' ? this.q.m : this.q.g);
        continue;
      }
      c.update(dt);
    }
  }

  bump(el) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); this.audio?.pickup?.(); }

  // ---------------------------------------------------------------- the net
  /** The net landed: take the nearest bug at the ring, score it, startle the others if the swing was loud. */
  land(L) {
    const a = this.aim, res = this.meadow.swing(a.x, a.z, L.r, L.loud);
    const kind = res.bug ? res.bug.kind : null;
    let pts = this.tally.swing(kind);
    if (res.bug && this.order) {
      const plus = this.tally.extra(this.order.take(res.bug));
      if (plus) { pts += plus; this.audio?.star?.(); this.showWant(); if (!this.said.order) { this.said.order = 1; this.ctx.hint(N_('Just the one on the card! Now the next.'), 3.5); } }
    }
    if (res.bug) {
      this.sinceHit = 0;
      this.audio?.good?.();
      this.ctx.fx?.burst?.(_v.set(a.x, this.world.heightAt(a.x, a.z) + 0.4, a.z), { n: 10 + (kind === 'mantis' ? 8 : 0), color: [0.7, 0.95, 0.4], speed: 1.3, size: 0.12, gravity: 1 });
      this.popup(a.x, a.z, `+${pts}`);
      if (!this.said.first && this.ctx.first) { this.said.first = 1; this.ctx.hint(N_('Got one! Into the cage it goes. Now find a mantis: they are worth more.'), 5.5); }
      else if (kind === 'mantis' && !this.said.mCaught) { this.said.mCaught = 1; this.ctx.hint(N_('A mantis! Very fine hands, Mika.'), 3.5); }
    } else {
      this.audio?.blip?.(0.7);
      if (this.tally.misses === 3 && !this.ctx.first) this.ctx.hint(N_('Wait for the ring to sit on it, and creep.'), 4);
    }
  }

  /** A little number rising from where the net landed. */
  popup(x, z, text) {
    _v.set(x, this.world.heightAt(x, z) + 0.7, z).project(this.g.camera);
    if (_v.z > 1) return;
    const s = document.createElement('span');
    s.textContent = text;
    s.style.left = `${(_v.x * 0.5 + 0.5) * innerWidth}px`;
    s.style.top = `${(-_v.y * 0.5 + 0.5) * innerHeight}px`;
    this.pts.appendChild(s);
    setTimeout(() => s.remove(), 1000);
  }

  // ---------------------------------------------------------------- every frame
  update(dt) {
    this.t += dt;
    this.sinceHit += dt;
    const p = this.player, inp = this.g.input, pl = this.pl;
    this.ctx.groundPose?.({ creeping: !this.ending && this.cs.creeping });
    pl.x = p.pos.x; pl.z = p.pos.z; pl.speed = p.speed; pl.facing = p.facing;
    if (!this.ending) this.meadow.update(dt, pl);
    this.events();
    // the net: press, hold (a sweep), let go; a tap on the screen swings at once
    const land = this.ending ? null : this.net.update(dt, { press: inp.pressed('act'), held: inp.held('act') || padHeld(), tap: inp.pressed('tap') });
    const phase = this.net.phase;
    if (phase !== this.phaseWas) {
      if ((phase === 'quick' || phase === 'sweep') && this.phaseWas !== 'quick' && this.phaseWas !== 'sweep') {
        this.audio?.[phase === 'quick' ? 'whoosh' : 'stroke']?.(1.6);
        if (!(this.cs.creeping && p.anim?.has('Crouch'))) p.gesture?.('Interact', { lock: false });
      }
      this.phaseWas = phase;
    }
    // where the ring lies: 1.5 m ahead, drawn toward a bug that is nearly under it
    aimSpot(pl.x, pl.z, pl.facing, this.aim);
    let near = null, nd = 1.45;
    for (const b of this.meadow.bugs) {
      if (!catchable(b)) continue;
      const d = Math.hypot(b.x - this.aim.x, b.z - this.aim.z);
      if (d < nd) { nd = d; near = b; }
    }
    if (near) { this.aim.x += (near.x - this.aim.x) * 0.4; this.aim.z += (near.z - this.aim.z) * 0.4; }
    const r = this.net.sweeping || phase === 'sweep' ? BUGS.sweepR : BUGS.netR;
    const ready = !!near && nd < r;
    this.drawRing(r, ready);
    if (land) this.land(land);
    // the net in her hand
    let k = this.swingK;
    if (phase === 'quick' || phase === 'sweep') k = Math.min(1, this.net.u * 1.05);
    else if (phase === 'hold') k = this.net.sweeping ? 0.3 : 0.16;
    else k = Math.max(0, k - dt * (this.net.cool > 0 ? 3.2 : 4));
    if (land) k = 1;
    this.swingK = k;
    this.rig.pose(k);
    this.drawBugs(dt);
    this.hud();
    this.hints();
  }

  drawRing(r, ready) {
    const a = this.aim, ring = this.ring;
    ring.position.set(a.x, this.world.heightAt(a.x, a.z) + 0.07, a.z);
    ring.scale.setScalar(r * (1 + Math.sin(this.t * 7) * 0.025));
    if (ready !== this.ready) { this.ready = ready; this.ringMat.color.set(ready ? '#9be86a' : '#fff3c4'); }
    this.ringMat.opacity = ready ? 0.95 : this.net.phase === 'idle' ? 0.55 : 0.8;
  }

  hud() {
    const t = this.tally, q = this.q, s = this.shown;
    if (t.grass !== s.g) { s.g = t.grass; q.gn.textContent = t.grass; }
    if (t.mantis !== s.m) { s.m = t.mantis; q.mn.textContent = t.mantis; }
    const sp = this.player.speed, pct = Math.round(Math.min(1, sp / BUGS.walk) * 50) * 2, cls = sp <= BUGS.creep ? '' : sp <= BUGS.creep * 1.9 ? 'mid' : 'hot';
    if (pct !== s.pct) { s.pct = pct; q.fill.style.width = `${pct}%`; }
    if (cls !== s.cls) { s.cls = cls; q.fill.className = cls; }
  }

  hints() {
    const ctx = this.ctx;
    if (ctx.first && !this.said.sweep && this.t > 16 && this.tally.caught > 0 && this.tally.caught < 3) { this.said.sweep = 1; ctx.hint(N_('Hold {act} and let go for a gentle sweep: wider, and quiet.'), 5); }
    if (!ctx.first && !this.said.sweep && this.t > 25 && this.net.cool === 0 && this.tally.swings > 2 && this.tally.misses > 2) { this.said.sweep = 1; ctx.hint(N_('Hold {act} and let go for a gentle sweep: wider, and quiet.'), 5); }
  }

  /** What the QA scripts need: where things are, in the world and on the screen. */
  view() {
    const cam = this.g.camera, el = this.g.renderer?.renderer?.domElement, rc = el?.getBoundingClientRect?.();
    const scr = (x, y, z) => { _v.set(x, y, z).project(cam); return rc ? [rc.left + (_v.x + 1) / 2 * rc.width, rc.top + (1 - _v.y) / 2 * rc.height] : null; };
    return {
      t: this.t, aim: { ...this.aim }, ready: this.ready, net: this.net.phase, noise: noiseOf(this.player.speed), speed: this.player.speed, creeping: this.cs.creeping,
      level: this.ctx.level, wave: this.wave, windy: this.windy, want: this.order ? this.order.want : -1, filled: this.order ? this.order.filled : 0,
      tally: { grass: this.tally.grass, mantis: this.tally.mantis, misses: this.tally.misses, score: this.tally.score },
      bugs: this.meadow.bugs.filter(b => b.alive).map(b => ({ id: b.id, kind: b.kind, colour: b.colour, st: b.st, x: b.x, z: b.z, alarm: b.alarm, gaze: b.gaze, hops: b.hops, scr: scr(b.x, this.world.heightAt(b.x, b.z) + 0.3, b.z) })),
    };
  }

  // ---------------------------------------------------------------- the end: open the cage
  startRelease() {
    const p = this.player, f = p.facing, ctx = this.ctx;
    this.ending = true;
    // everything still in the meadow or in the net goes away first
    for (const b of this.meadow.bugs) if (b.vis) { this.give(b.vis); b.vis = null; }
    for (const k of this.carry) this.give(k.c);
    this.carry.length = 0;
    this.ring.visible = false;
    this.rig.pose(0);
    ctx.lock(true);
    const x = p.pos.x + Math.sin(f + 0.8) * 1.8, z = p.pos.z + Math.cos(f + 0.8) * 1.8;   // beside her, not in front: from the camera she would hide it
    this.cage.stand(this.scene, this.world, x, z, f + Math.PI);
    const items = [];
    const mk = (kind, n) => { for (let i = 0; i < n; i++) { const c = this.take(kind); if (c) { c.root.position.set(x, 0, z); items.push({ critter: c }); } } };
    mk('grasshopper', Math.min(this.tally.grass, 8));
    mk('mantis', Math.min(this.tally.mantis, 3));
    for (const it of items) if (it.critter.dot) it.critter.dot.visible = false;
    for (const it of items) if (it.critter.stalk) it.critter.stalk.visible = false;      // no stalk when it hops out of the cage
    this.release = new Release(this.cage, items, this.world, this.rand);
    this.releaseItems = items;
    p.gesture?.('Interact', { lock: false });
    this.audio?.chime?.(2);
  }

  updateRelease(dt) {
    if (!this.release) return true;
    const done = this.release.update(dt);
    return done;
  }

  dispose() {
    this.ctx.lock?.(false);
    if (this.camWas !== undefined) this.g.follow.zoomTarget = this.camWas;
    this.crit?.hidden?.delete('grasshopper'); this.crit?.hidden?.delete('mantis');
    this.rig?.dispose();
    this.cage?.dispose();
    for (const c of this.all) c.dispose();
    for (const x of this.own) x.dispose();
    this.ring?.removeFromParent();
    this.el?.remove();
    this.pts?.remove();
    this.all.length = 0;
  }
}

export default {
  id: 'hoppers',
  async play(ctx) {
    await ctx.ensureModels?.(['bug-net', 'bug-cage']);
    if (ctx.quit) return { score: 0, quit: true };
    const qa = typeof window !== 'undefined' ? window.__STARLINE_QA__ : null;
    const r = new HopRound(ctx, qa?.trickSeed ?? ((Date.now() / 7) & 0xffff));
    if (qa) qa.trickRound = r;                                                   // test hook (?qa=1 only)
    try {
      r.build();
      ctx.hint(ctx.first
        ? (r.touch ? N_('Push the stick gently to creep up on a grasshopper, then tap {act} to swing the net at the ring.')
          : N_('Creep up on a grasshopper (hold Shift), then press {act} to swing the net at the ring.'))
        : r.order ? N_('Creep up and swing at the ring. The bug on the card is worth 10 more!')
          : N_('Creep up, then swing the net at the ring. Mantises are worth more.'), 7);
      let left = ctx.roundTime;
      ctx.hud(0, left);
      const res = await ctx.loop(dt => {
        left -= dt;
        r.waves(dt, left);
        r.update(dt);
        ctx.hud(r.tally.score, Math.max(0, left));
        return left <= 0 ? { done: true } : undefined;
      });
      const t = r.tally;
      if (!res?.quit) {
        ctx.hint(N_('Time! Look them over, then let them go.'), 3.5);
        r.startRelease();
        await ctx.loop(dt => { r.update(dt); return r.updateRelease(dt) ? true : undefined; });
        if (!ctx.quit) ctx.hint(N_('Off you go, little ones. Come back tomorrow!'), 3);
        if (!ctx.quit) await ctx.wait(0.6);
      }
      const friends = [];
      if (t.grass) friends.push('grasshopper');
      if (t.mantis) friends.push('mantis');
      return {
        score: t.score, quit: !!res?.quit, caught: t.caught,
        extra: t.clean ? N_('a clean round, no misses') : caughtText(t.grass, t.mantis),
        detail: { grass: t.grass, mantis: t.mantis, misses: t.misses, best: t.best, friends, seed: r.seed, level: ctx.level, orders: r.order ? r.order.filled : 0 },
      };
    } finally {
      r.dispose();
    }
  },
  ambient() {},
  _Round: HopRound,
};
