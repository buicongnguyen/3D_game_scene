// Beetle sap trap (docs/RURAL-TRICKS.md, trick 6): a summer dusk in the grove. Choose a tree (beetles drink sap: oak and
// chestnut are right, a beech or a maple brings little, a cedar nothing), rub banana-and-sugar bait on the bark in an
// even rhythm, and sleep on it. At dawn, see who came: rhinoceros beetles, stag beetles, moths. Lift a beetle to look
// with slow hands (rush and it opens its wings and is gone), name it, and put it back on its tree.
//
// The levels (trapPlan): Easy is one trap, with slow hands that forgive. Normal sets TWO traps on two different trees and
// visits them one after the other at dawn, on one dawn clock: more trees to judge, and two patches of bait to rub well.
// Difficult adds two things that need new skill: a beetle in the hand wriggles now and then (it tenses first: let go and wait,
// or it flies), and a hornet has come to each trap too: it must be told from the beetles and left well alone.
//
// The rules (which trees stand for choosing, the rubbing, who comes, the lift, the score) are pure and Node-tested; the
// round below only draws them. Cheap: at most three beetles and three moths made once per round, one bait patch, one
// borrowed light from the shared LightPool, a few DOM labels.
import * as THREE from 'three';
import { tx, N_ } from '../../i18n/i18n.js';
import { rng } from '../../engine/spline.js';
import { Animator } from '../../actors/animator.js';
import { fit, disposeRigs, addCss } from './util.js';

// ---------------------------------------------------------------------------------------------------- pure rules
/** The valley's trees as a beetle sees them: sap 0..1 (how much sweet sap the bark gives). */
export const TREES = {
  'tree-broadleaf-a': { name: N_('Oak'), sap: 1, clue: N_('An oak: rough bark and acorns, full of sweet sap.') },
  'tree-chestnut': { name: N_('Chestnut'), sap: 1, clue: N_('A chestnut: prickly husks and sappy bark. Beetles love it.') },
  'tree-broadleaf-b': { name: N_('Beech'), sap: 0.15, clue: N_('A beech: smooth, dry bark with hardly any sap.') },
  'tree-maple': { name: N_('Maple'), sap: 0.22, clue: N_('A maple: thin, watery sap. Only a little comes.') },
  'tree-sakura': { name: N_('Cherry'), sap: 0.15, clue: N_('A cherry: pretty, but beetles pass it by.') },
  'tree-peach': { name: N_('Peach'), sap: 0.22, clue: N_('A peach tree: the fruit is sweet, the bark is not.') },
  'tree-cedar': { name: N_('Cedar'), sap: 0.03, clue: N_('A cedar: sticky resin, not sap. Beetles keep away.') },
  'tree-pine': { name: N_('Pine'), sap: 0.03, clue: N_('A pine: sticky resin, not sap. Beetles keep away.') },
};
export const isGood = model => (TREES[model]?.sap || 0) >= 0.9;

/**
 * What a level's round is made of: { traps, trees (to choose from), gentle (slow, forgiving hands and a slower rubbing bar),
 * wriggle (the beetle squirms in the hand), hornet (one comes to each trap), dawn (seconds for all the lifting) }.
 * The guided first try is Easy.
 */
export function trapPlan(level = 'normal', first = false) {
  if (first || level === 'easy') return { traps: 1, trees: 4, gentle: true, wriggle: false, hornet: false, dawn: 45 };
  if (level === 'hard') return { traps: 2, trees: 6, gentle: false, wriggle: true, hornet: true, dawn: 95 };
  return { traps: 2, trees: 5, gentle: false, wriggle: false, hornet: false, dawn: 80 };
}

/**
 * The trees to choose from (pure): up to `max` trees within `r` m of (x, z), of different kinds where the grove allows:
 * the nearest right tree (oak or chestnut) first, then the nearest tree of each other kind. trees: [{ model, x, z, … }].
 * good: how many right trees to offer (a level with two traps offers two: the other right KIND when the grove has it, an oak
 * and a chestnut, else a second tree of the same kind).
 */
export function pickTrees(trees, x, z, { max = 4, r = 28, min = 1.6, good: goods = 1 } = {}) {
  const near = trees.filter(t => TREES[t.model] && !t.far).map(t => ({ t, d: Math.hypot(t.x - x, t.z - z) }))
    .filter(q => q.d <= r && q.d >= min).sort((a, b) => a.d - b.d);
  const out = [], kinds = new Set();
  const take = q => { out.push(q.t); kinds.add(q.t.model); };
  const good = near.find(q => isGood(q.t.model));
  if (good) take(good);
  for (let n = 1; good && n < goods; n++) {
    const apart = q => isGood(q.t.model) && !out.includes(q.t) && !out.some(o => Math.hypot(o.x - q.t.x, o.z - q.t.z) < 2.5);
    const more = near.find(q => apart(q) && !kinds.has(q.t.model)) || near.find(apart);
    if (more) take(more);
  }
  for (const q of near) {
    if (out.length >= max) break;
    if (kinds.has(q.t.model) || isGood(q.t.model)) continue;
    if (out.some(o => Math.hypot(o.x - q.t.x, o.z - q.t.z) < 2.5)) continue;
    take(q);
  }
  // a thin grove: fill up with whatever else stands there (the other right kind, then repeats)
  for (const pass of [0, 1]) for (const q of near) {
    if (out.length >= max) break;
    if (out.includes(q.t) || (pass === 0 && kinds.has(q.t.model))) continue;
    if (out.some(o => Math.hypot(o.x - q.t.x, o.z - q.t.z) < 2.5)) continue;
    take(q);
  }
  return out;
}

export const ZONE = 0.16;         // half-width of the sweet middle of the rubbing bar (0..1)
export const STROKE_GAP = 0.3;    // seconds between strokes that count (mashing does nothing)

/**
 * Rubbing the bait on (pure): a marker swings across a bar; each press is one stroke, best in the middle. `strokes`
 * strokes make the patch; bait (0..1) is their mean quality. The swing quickens a little with every stroke.
 */
export class Rub {
  constructor({ strokes = 6, gentle = false } = {}) {
    this.strokes = strokes;
    this.gentle = gentle;
    this.n = 0;
    this.sum = 0;
    this.phase = 0;
    this.pos = 0;
    this.cool = 0;
    this.last = null;
  }

  get speed() { return (this.gentle ? 2.5 : 3.3) * (1 + 0.1 * this.n); }
  get done() { return this.n >= this.strokes; }
  /** Bait quality 0..1: strokes not made count as nothing. */
  get bait() { return this.sum / this.strokes; }

  update(dt) {
    this.cool = Math.max(0, this.cool - dt);
    this.phase += dt * this.speed;
    this.pos = 0.5 - 0.5 * Math.cos(this.phase);
  }

  /** One stroke now: returns its quality 0..1 (1 inside the middle zone), or null when it did not count. */
  press() {
    if (this.done || this.cool > 0) return null;
    const d = Math.abs(this.pos - 0.5);
    const q = d <= ZONE ? 1 : Math.max(0, 1 - (d - ZONE) / (0.5 - ZONE));
    this.n++;
    this.sum += q;
    this.cool = STROKE_GAP;
    this.last = q;
    return q;
  }
}

/**
 * Who is on the tree at dawn (pure, seeded): a list of 'rhino' | 'stag' | 'moth'. Beetles follow the sap and the bait:
 * a well-baited oak or chestnut brings three, a poorly baited one a single beetle, any other tree hardly ever one.
 * Moths come to anything sweet.
 */
export function trapOutcome({ sap, bait, rand, hornet = false }) {
  const a = sap * (0.35 + 0.65 * Math.max(0, Math.min(1, bait)));
  const beetles = Math.min(3, Math.floor(a * 3.2 + rand() * 0.5));
  const out = [];
  let rhino = rand() < 0.5;
  for (let i = 0; i < beetles; i++) { out.push(rhino ? 'rhino' : 'stag'); rhino = !rhino; }
  const moths = beetles === 0 ? 2 : 1 + (rand() < 0.5 ? 1 : 0);
  for (let i = 0; i < moths; i++) out.push('moth');
  // Difficult: a hornet drinks at the sap too (hornets really do come to sappy oaks: that is why you look before you touch)
  if (hornet) out.push('hornet');
  return out;
}

export const V_MAX = 0.5;         // hands moving faster than this startle the beetle
/** The wriggle (Difficult): the beetle tenses for `warn` seconds, then squirms for `kick`; while it squirms a hand faster than `limit` of V_MAX loses it. */
export const WRIGGLE = { first: [0.7, 1.3], every: [1.1, 1.9], warn: 0.45, kick: 0.6, limit: 0.42 };

/**
 * Lifting a beetle (pure): holding raises the hand faster and faster, letting go slows it. Height h runs 0..1.
 * update(dt, held) → 'lifted' (h reached 1 with calm hands), 'flew' (the hand went faster than V_MAX), or null.
 */
export class Lift {
  /** wriggle: the beetle squirms now and then (Difficult); rand: the seeded source of when. */
  constructor({ gentle = false, wriggle = false, rand = null } = {}) {
    this.accel = gentle ? 0.6 : 0.85;
    this.decay = 1.8;
    this.h = 0;
    this.v = 0;
    this.out = null;
    this.t = 0;                 // seconds since the hand first moved
    this.rand = wriggle ? rand || Math.random : null;
    this.kickAt = this.rand ? WRIGGLE.first[0] + this.rand() * (WRIGGLE.first[1] - WRIGGLE.first[0]) : Infinity;
  }

  /** 'calm', 'warn' (it tenses: a moment to let go) or 'kick' (it squirms: only a slow hand keeps it). */
  get state() { return this.t >= this.kickAt ? 'kick' : this.t >= this.kickAt - WRIGGLE.warn ? 'warn' : 'calm'; }
  /** The fastest the hand may move now. */
  get limit() { return this.state === 'kick' ? V_MAX * WRIGGLE.limit : V_MAX; }

  update(dt, held) {
    if (this.out) return null;
    this.v = held ? this.v + this.accel * dt : Math.max(0, this.v - this.decay * dt);
    if (this.h > 0 || this.v > 0) this.t += dt;
    if (this.rand && this.t >= this.kickAt + WRIGGLE.kick) this.kickAt = this.t + WRIGGLE.every[0] + this.rand() * (WRIGGLE.every[1] - WRIGGLE.every[0]);
    if (this.v > this.limit) return (this.out = 'flew');
    this.h += this.v * dt * 1.8;
    if (this.h >= 1) { this.h = 1; return (this.out = 'lifted'); }
    return null;
  }

  /** 0..1: how close the hand is to startling the beetle. */
  get rush() { return Math.min(1, this.v / V_MAX); }
}

export const SEEN = { rhino: 12, stag: 12, moth: 5 };
export const GENTLE = 20;         // for each beetle lifted gently and put back
export const HORNET = { left: 10, touched: 15 };   // a hornet left in peace earns this; one that was touched costs that

/**
 * Score (stars in content/tricks.js, by level): every visitor seen, plus every beetle handled gently; on Difficult also each
 * hornet left alone, less each one touched. Never below nothing.
 */
export function beetlesScore({ visitors = [], gentle = 0, hornetsLeft = 0, hornetsTouched = 0 }) {
  return Math.max(0, visitors.reduce((a, k) => a + (SEEN[k] || 0), 0) + GENTLE * gentle + HORNET.left * hornetsLeft - HORNET.touched * hornetsTouched);
}

/** Play recorded lifting input on a Lift: holds = [[from, to], …] seconds held. Returns { out, t, h }. */
export function replayLift(lift, holds, { dt = 1 / 60, until = 20 } = {}) {
  for (let t = 0; t < until; t += dt) {
    const out = lift.update(dt, holds.some(([a, b]) => t >= a && t < b));
    if (out) return { out, t: +t.toFixed(3), h: lift.h };
  }
  return { out: null, t: until, h: lift.h };
}

export const NAMES = {
  rhino: { name: N_('Rhinoceros beetle'), say: N_('A rhinoceros beetle! The horn is for wrestling other beetles off the sap, not for hurting.') },
  stag: { name: N_('Stag beetle'), say: N_('A stag beetle! Those antlers are its jaws. Hold it by the sides, like this.') },
  moth: { name: N_('Moth') },
  hornet: { name: N_('Hornet') },
};

// ---------------------------------------------------------------------------------------------------- the round
const V = () => new THREE.Vector3();
const _v = V(), _w = V(), _x = V(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
const _probe = new THREE.Object3D();
const byAngle = (a, b) => a.a - b.a;      // left to right on the bark
const BAIT_H = 1.3;
const CRAWL = 0.035;              // metres a second a beetle walks on the bark
const WALK_CLIP = 0.0156;         // ...and the speed its Walk clip is drawn for, at the model's own size (art/CONTRACTS.md)               // the bait patch sits at a child's eye height
const TREE_R = 2.7;               // close enough to a tree to choose it

const CSS = `
#trick2Labels{position:fixed;inset:0;z-index:15;pointer-events:none}
#trick2Labels span{position:absolute;transform:translate(-50%,-50%);padding:3px 10px;border-radius:999px;background:rgba(255,253,246,.92);
 box-shadow:0 3px 10px rgba(40,20,0,.25);font:700 14px Nunito,system-ui,sans-serif;color:#4a3020;white-space:nowrap}
#trick2Labels span.near{background:#ffe08a}
#trick2Meter{position:fixed;left:50%;top:calc(70px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:16;width:min(340px,82vw);
 padding:9px 14px 11px;border-radius:18px;background:rgba(255,247,232,.94);box-shadow:0 6px 20px rgba(40,20,0,.25);font:700 14px Nunito,system-ui,sans-serif;
 color:#5a3a22;text-align:center;zoom:var(--ui-scale,1);pointer-events:none}
#trick2Meter .bar{position:relative;height:18px;margin-top:6px;border-radius:9px;background:#e9d7b4;overflow:hidden}
#trick2Meter .zone{position:absolute;top:0;bottom:0;background:#9bd46a}
#trick2Meter .zone.bad{background:#e8674a;transition:left .12s,width .12s}
#trick2Meter.squirm{box-shadow:0 0 0 3px #e8674a,0 6px 20px rgba(40,20,0,.25)}
#trick2Meter .fill{position:absolute;left:0;top:0;bottom:0;background:#f2b53a}
#trick2Meter .cur{position:absolute;top:-2px;bottom:-2px;width:6px;margin-left:-3px;border-radius:3px;background:#5a3a22}
#trick2Meter .dots{margin-top:5px;letter-spacing:4px;color:#c2541c;min-height:1em}
#trick2Meter .prog{position:relative;height:8px;margin-top:6px;border-radius:4px;background:#e9d7b4;overflow:hidden}
@media (max-width:560px){#trick2Meter{top:calc(118px + env(safe-area-inset-top,0px))}}
`;

class BeetleRound {
  constructor(ctx, seed) {
    this.ctx = ctx;
    const g = this.g = ctx.game;
    this.player = ctx.player || g.player;
    this.scene = g.scene;
    this.added = [];
    this.own = [];
    this.listeners = [];
    this.seed = seed;
    this.rand = rng(seed);
    // the level comes from the picker (ctx.level): how many traps, how the beetle behaves in the hand, the hornet (trapPlan)
    this.plan = trapPlan(ctx.level, !!ctx.first);
    this.gentle = this.plan.gentle;
    this.phase = 'choose';
    this.t = 0;
    this.left = ctx.roundTime || 70;
    this.dawnLeft = this.plan.dawn;
    this.traps = [];            // the traps set at dusk: { c (the tree), trunk, bait, rub, camPos, camLook, stand }
    this.trapAt = -1;           // the trap being looked at, at dawn
    this.hornetsLeft = 0;
    this.hornetsTouched = 0;
    this.moving = false;        // between two traps at dawn (a fade)
    this.visitors = [];
    this.kinds = [];
    this.gentleN = 0;
    this.flown = 0;
    this.tree = null;
    this.rub = null;
    this.lift = null;
    this.sel = -1;
    this.I = 0;
    this.fading = 0;
    this.pointerHeld = false;
  }

  add(o, parent = this.scene) { parent.add(o); if (parent === this.scene) this.added.push(o); return o; }
  keep(x) { this.own.push(x); return x; }

  build() {
    const g = this.g, ctx = this.ctx, place = ctx.place;
    const trees = pickTrees(g.placed?.trees || [], place.x, place.z, { max: this.plan.trees, good: this.plan.traps });
    if (!trees.length) return false;
    this.trees = trees.map((t, i) => ({ i, t, def: TREES[t.model], x: t.x, z: t.z, y: g.world.heightAt(t.x, t.z), label: null }));
    if (typeof document !== 'undefined') {
      addCss('trick2Css', CSS);
      this.labels = document.createElement('div');
      this.labels.id = 'trick2Labels';
      document.body.appendChild(this.labels);
      for (const c of this.trees) { c.label = document.createElement('span'); c.label.textContent = tx(c.def.name); this.labels.appendChild(c.label); }
      this.meter = document.createElement('div');
      this.meter.id = 'trick2Meter';
      this.meter.style.display = 'none';
      this.meter.innerHTML = '<div class="lab"></div><div class="bar"><i class="fill"></i><i class="zone"></i><i class="cur"></i></div><div class="prog"><i class="fill"></i></div><div class="dots"></div>';
      document.body.appendChild(this.meter);
      // the meter's parts, found once; `shown` remembers what is on the page so a frame writes only what changed
      const q = s => this.meter.querySelector(s);
      this.mel = { lab: q('.lab'), zone: q('.zone'), fill: q('.bar .fill'), cur: q('.cur'), prog: q('.prog'), progFill: q('.prog .fill'), dots: q('.dots') };
      this.shown = { cur: NaN, dots: -1, prog: NaN, hidden: null };
    }
    // a soft ring at the foot of each tree that can be chosen
    this.ringGeo = this.keep(new THREE.RingGeometry(0.75, 0.9, 32).rotateX(-Math.PI / 2));
    this.ringMat = this.keep(new THREE.MeshBasicMaterial({ color: '#ffe89a', transparent: true, opacity: 0.5, depthWrite: false, fog: false }));
    this.ringNear = this.keep(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
    for (const c of this.trees) {
      c.ring = this.add(new THREE.Mesh(this.ringGeo, this.ringMat));
      c.ring.position.set(c.x, c.y + 0.12, c.z);
      c.ring.renderOrder = 6;
    }
    // press and hold on the picture also lifts (a finger or the mouse on the beetle)
    const el = g.renderer?.renderer?.domElement;
    if (el) {
      const down = e => { this.pointerHeld = true; this.tap = { x: e.clientX, y: e.clientY }; };
      const up = () => { this.pointerHeld = false; };
      el.addEventListener('pointerdown', down);
      addEventListener('pointerup', up);
      addEventListener('pointercancel', up);
      this.listeners.push(() => el.removeEventListener('pointerdown', down), () => removeEventListener('pointerup', up), () => removeEventListener('pointercancel', up));
    }
    this.lightPos = V();
    this.light = g.lights?.add({ pos: this.lightPos, intensity: () => this.I, range: 6, color: '#ffe2b0' });
    return true;
  }

  hint(text, life) { this.ctx.hint?.(text, life); }

  // ------------------------------------------------------------ the trunk
  /** Measure the chosen tree's trunk (once): its radius at a few heights and angles round the side facing the camera. */
  measure(tree, a0) {
    const g = this.g, t = tree.t, s = t.s || 1, fallback = 0.26 * s;
    const HS = [0.8, 1.05, 1.3, 1.55, 1.8], AS = [-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9];
    const table = AS.map(() => HS.map(() => fallback));
    const src = g.assets?.clone?.(t.model);
    if (src) {
      const grp = new THREE.Group();
      grp.add(src);
      grp.position.set(t.x, t.y, t.z);
      grp.rotation.y = (t.rot || 0) * Math.PI / 180;
      grp.scale.set(s, s * (t.sy ?? 1), s);
      grp.updateMatrixWorld(true);
      const ray = new THREE.Raycaster();
      AS.forEach((a, ai) => HS.forEach((h, hi) => {
        const dx = Math.sin(a0 + a), dz = Math.cos(a0 + a);
        ray.set(_v.set(t.x + dx * 3, t.y + h, t.z + dz * 3), _w.set(-dx, 0, -dz));
        ray.far = 3;
        const hits = ray.intersectObject(grp, true);
        // the hit nearest the axis is the bark (leaves and twigs hang further out)
        let r = null;
        for (const hit of hits) { const rr = 3 - hit.distance; if (rr > 0.06 * s && (r === null || rr < r)) r = rr; }
        if (r !== null) table[ai][hi] = Math.min(0.7 * s, r);
      }));
    }
    this.trunk = { x: t.x, y: tree.y, z: t.z, a0, HS, AS, table, r0: table[3][2] };
  }

  /** A point on the bark: a = angle from the camera side (rad), h = height (m), out = distance off the bark. */
  bark(a, h, out = 0, pos = V(), normal = null) {
    const T = this.trunk, { HS, AS, table } = T;
    const fa = Math.max(0, Math.min(AS.length - 1.001, (a - AS[0]) / (AS[1] - AS[0]))), fh = Math.max(0, Math.min(HS.length - 1.001, (h - HS[0]) / (HS[1] - HS[0])));
    const ia = Math.floor(fa), ih = Math.floor(fh), ua = fa - ia, uh = fh - ih;
    const r = (table[ia][ih] * (1 - ua) + table[ia + 1][ih] * ua) * (1 - uh) + (table[ia][ih + 1] * (1 - ua) + table[ia + 1][ih + 1] * ua) * uh;
    const dx = Math.sin(T.a0 + a), dz = Math.cos(T.a0 + a);
    normal?.set(dx, 0, dz);
    return pos.set(T.x + dx * (r + out), T.y + h, T.z + dz * (r + out));
  }

  /** Stand an object on the bark, its back to the tree, heading `head` (0 = up the trunk). */
  stick(obj, a, h, out, head = 0) {
    this.bark(a, h, out, obj.position, _w);
    _x.crossVectors(_w, UP).normalize();
    _m.makeBasis(_x, _w, UP);
    obj.quaternion.setFromRotationMatrix(_m).multiply(_q.setFromAxisAngle(UP, head));
  }

  // ------------------------------------------------------------ creatures
  beetleModel(kind) {
    const a = this.g.assets, name = `beetle-${kind}`, root = new THREE.Group(), size = kind === 'rhino' ? 0.24 : 0.21;
    let anim = null, walkSpeed = 1;
    if (a?.has?.(name)) {
      const m = a.clone(name), s0 = m.scale.x;
      fit(m, size);
      m.traverse(o => { if (o.isMesh) o.castShadow = false; });
      root.add(m);
      if (m.userData.clips?.length) anim = new Animator(m);
      // the Walk clip's feet cover WALK_CLIP metres a second at the model's own size: play it at the pace of the crawl
      walkSpeed = CRAWL / (WALK_CLIP * (m.scale.x / s0));
    } else {
      // no art yet: a glossy little beetle with its horn (rhinoceros) or antler jaws (stag)
      const shell = this.keep(new THREE.MeshStandardMaterial({ color: kind === 'rhino' ? '#4a2a14' : '#201a18', roughness: 0.25, metalness: 0.2 }));
      const geo = this.keep(new THREE.SphereGeometry(0.5, 12, 8));
      const body = new THREE.Mesh(geo, shell);
      body.scale.set(0.55, 0.36, 0.62);
      body.position.set(0, 0.17, -0.1);
      const chest = new THREE.Mesh(geo, shell);
      chest.scale.set(0.46, 0.3, 0.3);
      chest.position.set(0, 0.16, 0.24);
      const head = new THREE.Mesh(geo, shell);
      head.scale.set(0.24, 0.16, 0.2);
      head.position.set(0, 0.12, 0.42);
      root.add(body, chest, head);
      const horn = this.keep(new THREE.ConeGeometry(0.045, 0.34, 5).translate(0, 0.17, 0));
      if (kind === 'rhino') {
        const h1 = new THREE.Mesh(horn, shell);
        h1.position.set(0, 0.12, 0.48);
        h1.rotation.x = 0.9;
        const h2 = new THREE.Mesh(horn, shell);
        h2.scale.setScalar(0.5);
        h2.position.set(0, 0.26, 0.3);
        h2.rotation.x = 0.5;
        root.add(h1, h2);
      } else for (const sx of [-1, 1]) {
        const j = new THREE.Mesh(horn, shell);
        j.position.set(sx * 0.09, 0.11, 0.48);
        j.rotation.set(1.45, 0, -sx * 0.35);
        root.add(j);
      }
      const legGeo = this.keep(new THREE.BoxGeometry(0.34, 0.025, 0.03));
      for (const sx of [-1, 1]) for (const lz of [-0.22, 0.02, 0.24]) {
        const l = new THREE.Mesh(legGeo, shell);
        l.position.set(sx * 0.3, 0.07, lz);
        l.rotation.set(0, -sx * lz * 1.2, sx * -0.35);
        root.add(l);
      }
      const inner = new THREE.Group();
      inner.add(...root.children.slice());
      inner.scale.setScalar(size);
      root.add(inner);
    }
    return { root, anim, walkSpeed };
  }

  mothModel() {
    const a = this.g.assets;
    if (a?.has?.('moth')) {
      // the artist's moth: its rest pose is wings flat, so a clip always plays (Idle = wings folded)
      const m = fit(a.clone('moth'), 0.085), root = new THREE.Group();
      m.traverse(o => { if (o.isMesh) o.castShadow = false; });
      root.add(m);
      const anim = m.userData.clips?.length ? new Animator(m) : null;
      return { root, anim, wings: null };
    }
    if (!this.mothGeo) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.03, 0.06, 0, 0.05, 0.05, 0, -0.04, 0, 0, 0.03, 0.05, 0, -0.04, 0, 0, -0.02], 3));
      g.computeVertexNormals();
      this.mothGeo = this.keep(g);
      this.mothMat = this.keep(new THREE.MeshStandardMaterial({ color: '#d9c7a0', roughness: 0.9, side: THREE.DoubleSide }));
      this.mothBody = this.keep(new THREE.BoxGeometry(0.012, 0.012, 0.06));
      this.mothDark = this.keep(new THREE.MeshStandardMaterial({ color: '#6a5540', roughness: 0.9 }));
    }
    const root = new THREE.Group(), wings = [];
    for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(this.mothGeo, this.mothMat);
      w.scale.x = sx;
      root.add(w);
      wings.push(w);
    }
    root.add(new THREE.Mesh(this.mothBody, this.mothDark));
    return { root, wings };
  }

  /** A hornet (Difficult): yellow and dark bands, a narrow waist, two pale wings. Procedural and tiny: the model budget is full. */
  hornetModel() {
    const root = new THREE.Group(), inner = new THREE.Group();
    if (!this.hornetGeo) {
      this.hornetGeo = this.keep(new THREE.SphereGeometry(0.5, 10, 7));
      this.hornetWing = this.keep(new THREE.CircleGeometry(0.5, 12).scale(0.5, 0.17, 1).rotateX(-Math.PI / 2).translate(0.27, 0, 0));      // a long oval, hinged at the body
      this.hornetYel = this.keep(new THREE.MeshStandardMaterial({ color: '#f5b51d', roughness: 0.45, emissive: '#3a2400', emissiveIntensity: 0.6 }));
      this.hornetBlk = this.keep(new THREE.MeshStandardMaterial({ color: '#2a1a10', roughness: 0.5 }));
      this.hornetGlass = this.keep(new THREE.MeshStandardMaterial({ color: '#dfe9f5', roughness: 0.3, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false }));
    }
    const Y = this.hornetYel, K = this.hornetBlk;
    // (z along the body, head first; y off the bark)
    for (const [z, sx, sy, sz, m] of [[0.4, 0.2, 0.17, 0.17, Y], [0.2, 0.25, 0.22, 0.26, K], [-0.02, 0.27, 0.23, 0.2, Y], [-0.16, 0.26, 0.22, 0.14, K], [-0.28, 0.23, 0.2, 0.14, Y], [-0.4, 0.17, 0.15, 0.14, K], [-0.5, 0.1, 0.09, 0.12, Y]]) {
      const b = new THREE.Mesh(this.hornetGeo, m);
      b.scale.set(sx, sy, sz);
      b.position.set(0, 0.15, z);
      inner.add(b);
    }
    const wings = [];
    for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(this.hornetWing, this.hornetGlass);
      w.scale.x = sx;
      w.position.set(sx * 0.08, 0.27, 0.16);
      w.rotation.y = sx * 1.12;
      inner.add(w);
      wings.push(w);
    }
    inner.scale.setScalar(0.17);
    root.add(inner);
    return { root, wings, hornet: true };
  }

  // ------------------------------------------------------------ phases
  choose(dt) {
    const p = this.player.pos, ctx = this.ctx;
    this.left -= dt;
    this.tap = null;
    let near = null, nd = TREE_R;
    for (const c of this.trees) {
      if (c.used) continue;                              // a tree with a trap on it already
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < nd) { nd = d; near = c; }
    }
    if (near !== this.near) {
      this.near = near;
      if (near) this.hint(tx('{clue} Press {act} to set the trap here.', { clue: tx(near.def.clue) }), 8);
    }
    for (const c of this.trees) {
      c.ring.material = c === near ? this.ringNear : this.ringMat;
      c.ring.scale.setScalar(1 + Math.sin(this.t * 3 + c.i) * 0.05);
    }
    this.ringMat.opacity = 0.4 + Math.sin(this.t * 3) * 0.12;
    if (near && ctx.pressed()) this.startRub(near);
    else if (this.left <= 0) { if (this.traps.length) this.startNight(); else this.finish(tx('No trap set')); }
  }

  startRub(c) {
    const ctx = this.ctx, g = this.g, p = this.player;
    this.tree = c;
    this.phase = 'rub';
    ctx.lock?.(true);
    for (const q of this.trees) q.ring.visible = false;
    if (this.labels) this.labels.style.display = 'none';
    const a0 = Math.atan2(p.pos.x - c.x, p.pos.z - c.z);
    this.measure(c, a0);
    const T = this.trunk;
    // Mika beside the trunk, a hand on the bark; the camera looks over her shoulder at the bait
    const pa = a0 + 1.4, pr = Math.max(T.r0 + 0.7, 0.42 * (c.t.s || 1) + 0.45);
    this.stand = { x: c.x + Math.sin(pa) * pr, z: c.z + Math.cos(pa) * pr, face: pa + Math.PI };
    p.teleport(this.stand.x, this.stand.z, undefined, this.stand.face);
    this.camPos = V().set(c.x + Math.sin(a0) * (T.r0 + 1.75), T.y + 1.42, c.z + Math.cos(a0) * (T.r0 + 1.75));
    this.camLook = V().set(c.x, T.y + BAIT_H, c.z);
    g.follow?.cutscene?.({ pos: this.camPos, look: this.camLook }, 0.8);
    // the bait: a sticky yellow patch that grows with every stroke
    this.baitGeo = this.keep(new THREE.CircleGeometry(0.1, 14).scale(1, 1.25, 1));
    this.baitMat = this.keep(new THREE.MeshBasicMaterial({ color: '#a5681a', transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    this.bait = this.add(new THREE.Mesh(this.baitGeo, this.baitMat));
    this.bark(0, BAIT_H, 0.03, this.bait.position, _w);
    this.bait.lookAt(_v.copy(this.bait.position).add(_w));
    this.bait.scale.setScalar(0.001);
    this.bait.renderOrder = 4;
    this.bark(0, BAIT_H, 0.9, this.lightPos);
    this.rub = new Rub({ strokes: 6, gentle: this.gentle });
    this.rubEnd = null;
    this.showMeter('rub');
    this.hint(this.traps.length ? isGood(c.t.model) ? tx('Another good tree. Rub the bait in well: press {act} in the green.') : tx('Let\'s see what this one brings. Rub the bait in: press {act} in the green.')
      : isGood(c.t.model)
      ? tx('Good choice! Now rub the banana and sugar in: press {act} each time the marker crosses the green.')
      : tx('Hmm, let\'s see what comes. Rub the bait in: press {act} each time the marker crosses the green.'), 7);
  }

  showMeter(mode) {
    if (!this.meter) return;
    const el = this.mel, sh = this.shown;
    this.meterMode = mode;
    this.meter.style.display = mode ? '' : 'none';
    sh.hidden = !mode;
    if (!mode) return;
    sh.cur = sh.prog = NaN; sh.dots = -1;
    const zone = el.zone;
    if (mode === 'rub') {
      el.lab.textContent = tx('Rub the bait in');
      zone.className = 'zone';
      zone.style.left = `${(0.5 - ZONE) * 100}%`; zone.style.width = `${ZONE * 200}%`;
      el.fill.style.width = '0';
      el.prog.style.display = 'none';
      el.dots.style.display = '';
    } else {
      el.lab.textContent = this.ctx.ui?.touch ? tx('Lift slowly: hold and let go, hold and let go') : tx('Lift slowly: hold {act}, let go, hold again');
      zone.className = 'zone bad';
      zone.style.left = '80%'; zone.style.width = '20%';
      sh.lim = 80; sh.squirm = false;
      this.meter.classList.remove('squirm');
      el.prog.style.display = '';
      el.dots.style.display = 'none';
    }
  }

  /** The marker of the meter, 0..1 across the bar (written when it has moved a tenth of a percent). */
  meterCur(v) {
    const k = Math.round(v * 1000), sh = this.shown;
    if (k !== sh.cur) { sh.cur = k; this.mel.cur.style.left = `${k / 10}%`; }
  }

  rubbing(dt) {
    const ctx = this.ctx, inp = this.g.input, rub = this.rub;
    this.I += (1.8 - this.I) * Math.min(1, dt * 2);
    if (this.rubEnd !== null) {
      if ((this.rubEnd -= dt) <= 0) this.afterRub();
      return;
    }
    this.left -= dt;
    rub.update(dt);
    const tap = !!this.tap;
    this.tap = null;
    if (ctx.pressed() || inp?.pressed?.('jump') || tap) {
      const q = rub.press();
      if (q !== null) {
        this.player.gesture?.('Interact', { lock: false });
        ctx.audio?.[q >= 0.99 ? 'good' : 'stroke']?.();
        if (q < 0.4) this.hint(tx('A thin smear. Wait for the green!'), 2.5);
      }
    }
    const want = 0.25 + 0.75 * Math.sqrt(rub.sum / rub.strokes);
    this.bait.scale.setScalar(rub.n ? this.bait.scale.x + (want - this.bait.scale.x) * Math.min(1, dt * 8) : 0.001);
    if (this.meter) {
      this.meterCur(rub.pos);
      if (this.shown.dots !== rub.n) { this.shown.dots = rub.n; this.mel.dots.textContent = '●'.repeat(rub.n) + '○'.repeat(rub.strokes - rub.n); }
    }
    if (rub.done || this.left <= 0) {
      this.left = Math.max(0, this.left);
      this.rubEnd = 1.1;
      const b = rub.bait;
      this.hint(b >= 0.8 ? tx('A lovely thick patch. They\'ll smell that from far away.')
        : b >= 0.45 ? tx('That will do. Now we wait for night.')
          : tx('Not much bait on there… we\'ll see who comes.'), 3);
    }
  }

  /** A patch of bait is on: the trap is set. On to the next tree while there is one to set (and light to do it by), else the night. */
  afterRub() {
    const ctx = this.ctx;
    this.traps.push({ c: this.tree, trunk: this.trunk, bait: this.bait, rub: this.rub, camPos: this.camPos, camLook: this.camLook, stand: this.stand });
    this.tree.used = true;
    if (this.traps.length >= this.plan.traps || this.left <= 5 || !this.trees.some(c => !c.used)) { this.startNight(); return; }
    this.phase = 'choose';
    this.near = null;
    this.rubEnd = null;
    this.showMeter(null);
    this.I = 0;
    ctx.lock?.(false);
    this.g.follow?.clearCutscene?.(true);
    for (const q of this.trees) q.ring.visible = !q.used;
    if (this.labels) { this.labels.style.display = ''; this.tree.label.style.visibility = 'hidden'; }
    this.hint(tx('One trap is set! Now a second tree: find another one with sweet sap.'), 6);
  }

  startNight() {
    const ctx = this.ctx;
    this.phase = 'night';
    this.showMeter(null);
    this.fading++;
    ctx.fade?.(true, 600).then(() => {
      if (this.disposed) return;
      ctx.setNight?.(true, 5.6);
      this.visit(0);
      this.nightT = 0.7;
    });
  }

  /** Go to trap k (at dawn): Mika, the camera and the light stand at its tree, and its visitors are on the bark. */
  visit(k) {
    const T = this.traps[k], p = this.player;
    this.trapAt = k;
    this.tree = T.c; this.trunk = T.trunk; this.bait = T.bait; this.rub = T.rub; this.camPos = T.camPos; this.camLook = T.camLook;
    // the creatures of the tree before step out of the picture (they are freed with the round)
    for (const v of this.visitors) this.scene.remove(v.root);
    this.visitors = [];
    this.sel = -1; this.lift = null; this.endT = undefined; this.emptyT = undefined;
    p.teleport(T.stand.x, T.stand.z, undefined, T.stand.face);
    this.g.follow?.cutscene?.({ pos: T.camPos, look: T.camLook }, 0.01);
    this.bark(0, BAIT_H, 0.9, this.lightPos);
    for (const q of this.traps) q.bait.visible = q === T;
    this.arrive();
  }

  /** Who came in the night: put them on the bark round the bait. */
  arrive() {
    const c = this.tree;
    const kinds = trapOutcome({ sap: c.def.sap, bait: this.rub.bait, rand: this.rand, hornet: this.plan.hornet });
    this.kinds.push(...kinds);
    const SPOTS = [[-0.34, 1.42], [0.36, 1.22], [0.05, 1.62], [-0.5, 1.1], [0.55, 1.55], [-0.12, 0.98]];
    // (the hornet never takes the same place twice: its spot is drawn among them all)
    const at = SPOTS.map((_, i) => i);
    for (let i = at.length - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [at[i], at[j]] = [at[j], at[i]]; }
    kinds.forEach((kind, i) => {
      const [a, h] = SPOTS[(this.plan.hornet ? at[i % at.length] : i) % SPOTS.length];
      const v = { i, kind, a, h, head: (this.rand() - 0.5) * 2, st: 'sit', t: this.rand() * 3, ta: a, th: h, pause: 1 + this.rand() * 2, tw: null };
      if (kind === 'moth') Object.assign(v, this.mothModel());
      else if (kind === 'hornet') Object.assign(v, this.hornetModel());
      else Object.assign(v, this.beetleModel(kind));
      v.root.name = `trick:${kind}`;
      this.add(v.root);
      this.stick(v.root, v.a, v.h, kind === 'moth' ? 0.012 : 0.004, v.head);
      v.anim?.play('Idle');
      v.anim?.update(v.t);                               // not all in step
      this.visitors.push(v);
    });
    if (this.selRing) return;
    this.selGeo = this.keep(new THREE.RingGeometry(0.15, 0.165, 28).rotateX(-Math.PI / 2));
    this.selMat = this.keep(new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    this.selRing = this.add(new THREE.Mesh(this.selGeo, this.selMat));
    this.selRing.renderOrder = 7;
  }

  night(dt) {
    if (this.nightT === undefined) return;
    if ((this.nightT -= dt) > 0 || this.dawning) return;
    this.dawning = true;
    this.ctx.fade?.(false, 900).then(() => { this.fading--; });
    this.startDawn();
  }

  startDawn() {
    this.phase = 'dawn';
    this.ctx.audio?.chime?.(1);
    this.greet();
  }

  /** At a trap, at dawn: say who came (and, on Difficult, which of them to leave alone). */
  greet() {
    const c = this.tree, second = this.trapAt > 0;
    const beetles = this.visitors.filter(v => v.kind === 'rhino' || v.kind === 'stag').length;
    const hornet = this.visitors.some(v => v.kind === 'hornet');
    if (beetles) {
      this.showMeter('lift');
      this.hint(hornet && !second ? tx('Dawn! Beetles, and a hornet with yellow stripes. Never touch a hornet: lift only the beetles.')
        : hornet ? tx('The second tree. A hornet here too: leave it be, and lift the beetles gently.')
          : second ? tx('Now the second tree. Slow hands again!')
            : tx('Dawn! Look who came for breakfast. Lift one gently to look: slow hands, or it flies.'), 6);
    } else {
      this.emptyT = second || this.trapAt + 1 < this.traps.length ? 4.2 : 5.5;
      this.hint(isGood(c.t.model)
        ? tx('Only moths this time. With more bait rubbed in, the beetles will find it.')
        : tx('Only moths. A {tree} has hardly any sap: try an oak or a chestnut next time.', { tree: tx(c.def.name).toLowerCase() }), 6);
    }
  }

  /** This trap is done: count its hornet, then the next trap (a fade), or the end. */
  leave() {
    for (const v of this.visitors) if (v.kind === 'hornet' && !v.touched && !v.counted) { v.counted = true; this.hornetsLeft++; }
    if (this.trapAt + 1 >= this.traps.length || this.dawnLeft <= 3) { this.finish(); return; }
    this.moving = true;
    this.showMeter(null);
    this.fading++;
    this.ctx.fade?.(true, 450).then(() => {
      if (this.disposed) return;
      this.visit(this.trapAt + 1);
      this.greet();
      this.moving = false;
      this.ctx.fade?.(false, 600).then(() => { this.fading--; });
    });
  }

  /** What Mika can reach for on the bark, left to right: the beetles, and on Difficult the hornet too (the same list is refilled every frame). */
  liftable() {
    const out = this.canLift ??= [];
    out.length = 0;
    for (const v of this.visitors) if (v.kind !== 'moth' && v.st === 'sit') out.push(v);
    if (this.plan.hornet) out.sort(byAngle);
    return out;
  }

  dawn(dt) {
    const ctx = this.ctx, inp = this.g.input, cam = this.g.camera;
    this.I += (2.2 - this.I) * Math.min(1, dt * 2);
    if (this.moving) return;
    this.dawnLeft -= dt;
    if (this.emptyT !== undefined) { if ((this.emptyT -= dt) <= 0) this.leave(); return; }
    const can = this.liftable();
    let beetlesLeft = false;
    for (const q of can) if (q.kind !== 'hornet') beetlesLeft = true;
    const showing = this.visitors.some(v => v.st === 'show' || v.st === 'up' || v.st === 'back');
    const cur = this.visitors[this.sel];
    if ((!cur || cur.st !== 'sit') && !showing) {
      this.sel = can.length ? can[0].i : -1;
      this.lift = null;
    }
    if (!beetlesLeft && !showing && !this.visitors.some(v => v.st === 'fly')) {
      this.showMeter(null);
      this.sel = -1;                                    // (nothing to reach for: the hornet keeps its place)
      if (this.endT === undefined) {
        this.endT = 1.6;
        this.hint(this.gentleN ? tx('Back on their tree, safe and sound. Well done.') : tx('They\'ll be back tomorrow night. Slow hands next time.'), 4);
      }
      if ((this.endT -= dt) <= 0) this.leave();
      return;
    }
    if (this.dawnLeft <= 0 && !showing) { this.dawnLeft = 0; this.leave(); return; }
    const v = this.visitors[this.sel];
    if (v && v.st === 'sit') {
      // choose another beetle: left/right, or a tap on it
      const mx = inp?.move?.x || 0;
      if (Math.abs(mx) > 0.55 && !this.stickHeld && can.length > 1 && !(this.lift?.h > 0.05)) {
        this.stickHeld = true;
        const k = can.indexOf(v);
        this.sel = can[(k + (mx > 0 ? 1 : can.length - 1)) % can.length].i;
        this.lift = null;
        ctx.audio?.click?.();
      }
      if (Math.abs(mx) < 0.3) this.stickHeld = false;
      if (this.tap && !(this.lift?.h > 0.05)) {
        const el = this.g.renderer?.renderer?.domElement, r = el?.getBoundingClientRect();
        let best = null, bd = 80;
        if (r) for (const q of can) {
          _v.copy(q.root.position).project(cam);
          const d = Math.hypot(r.left + (_v.x + 1) / 2 * r.width - this.tap.x, r.top + (1 - _v.y) / 2 * r.height - this.tap.y);
          if (d < bd) { bd = d; best = q; }
        }
        if (best && best.i !== this.sel) { this.sel = best.i; this.lift = null; }
      }
      this.tap = null;
      const cv = this.visitors[this.sel];
      this.lift ??= new Lift({ gentle: this.gentle, wriggle: this.plan.wriggle && cv.kind !== 'hornet', rand: this.rand });
      const held = !!(inp?.held?.('act') || inp?.held?.('jump') || this.pointerHeld);
      const out = this.lift.update(dt, held);
      if (cv.kind === 'hornet') { if (out || this.lift.h > 0.1) this.touched(cv); }
      else if (out === 'lifted') this.lifted(cv);
      else if (out === 'flew') this.flew(cv);
      if (this.meter && this.lift) {
        // the red end of the bar grows while the beetle squirms (Difficult): the hand must be nearly still then
        const sh = this.shown, lim = Math.round(this.lift.limit / (V_MAX * 1.25) * 100), squirm = this.lift.state !== 'calm';
        if (lim !== sh.lim) { sh.lim = lim; this.mel.zone.style.left = `${lim}%`; this.mel.zone.style.width = `${100 - lim}%`; }
        if (squirm !== sh.squirm) {
          sh.squirm = squirm;
          this.meter.classList.toggle('squirm', squirm);
          this.mel.lab.textContent = squirm ? tx('It wriggles! Let go and wait…') : ctx.ui?.touch ? tx('Lift slowly: hold and let go, hold and let go') : tx('Lift slowly: hold {act}, let go, hold again');
          if (squirm && !this.wriggleTold) { this.wriggleTold = true; this.hint(tx('It wriggles! When the bar turns red, let go and wait a moment.'), 4); }
        }
        this.meterCur(Math.min(1, this.lift.v / (V_MAX * 1.25)));
        const k = Math.round(this.lift.h * 1000);
        if (k !== this.shown.prog) { this.shown.prog = k; this.mel.progFill.style.width = `${k / 10}%`; }
      }
    } else this.tap = null;
  }

  lifted(v) {
    const ctx = this.ctx, cam = this.g.camera, def = NAMES[v.kind];
    v.st = 'up';
    cam.getWorldDirection(_v);
    // just beyond the camera's near plane, a little above the middle (clear of the hint bubble), and as large as the
    // screen allows with its whole outline in view (a phone held upright is narrow)
    const d = (cam.near || 0.5) + 0.25, viewH = 2 * d * Math.tan((cam.fov || 55) * Math.PI / 360), viewW = viewH * (cam.aspect || 1);
    const to = V().copy(cam.position).addScaledVector(_v, d).add(_w.set(0, viewH * 0.06, 0));
    v.showScale = Math.max(1, Math.min(viewW * 0.46, viewH * 0.34) / (v.kind === 'rhino' ? 0.24 : 0.21));
    v.tw = { from: v.root.position.clone(), to, u: 0, dur: 0.6, q0: v.root.quaternion.clone() };
    v.showT = 3;
    this.gentleN++;
    this.lift = null;
    ctx.audio?.pickup?.();
    this.hint(tx(def.say), 4.5);
    (this.named ??= []).push(v.kind);
  }

  flew(v) {
    const ctx = this.ctx;
    v.st = 'fly';
    this.bark(v.a + (this.rand() - 0.5) * 2, 4.5, 2.5, _v);
    v.tw = { from: v.root.position.clone(), to: _v.clone(), u: 0, dur: 1.3 };
    this.flown++;
    this.lift = null;
    ctx.audio?.whoosh?.(1.5);
    ctx.audio?.bad?.();
    this.hint(tx('Too fast! It opened its wings and flew. Slow hands next time.'), 3.5);
  }

  /** A hand on the hornet: it buzzes off in a huff. Never touch a hornet. */
  touched(v) {
    const ctx = this.ctx;
    v.st = 'fly';
    v.touched = true;
    this.bark(v.a + (this.rand() - 0.5) * 2, 4.5, 2.5, _v);
    v.tw = { from: v.root.position.clone(), to: _v.clone(), u: 0, dur: 1.0 };
    this.hornetsTouched++;
    this.lift = null;
    ctx.audio?.noise?.({ dur: 0.5, vol: 0.14, freq: 240, q: 6 });
    ctx.audio?.bad?.();
    this.hint(tx('No, no! Never touch a hornet. It has buzzed off: leave the next one alone.'), 4.5);
  }

  /** Every creature's little life on the bark. */
  creatures(dt) {
    const cam = this.g.camera;
    // while one beetle is held up to look at, everything else on the bark steps out of the picture
    const focus = this.visitors.find(v => v.st === 'up' || v.st === 'show' || v.st === 'back');
    if (this.bait) this.bait.visible = !focus;
    if (this.meter && this.meterMode && this.shown.hidden !== !!focus) { this.shown.hidden = !!focus; this.meter.style.display = focus ? 'none' : ''; }
    for (const v of this.visitors) {
      v.root.visible = v.st !== 'gone' && (!focus || v === focus);
      v.t += dt;
      if (v.root.visible) v.anim?.update(dt);            // the ones out of the picture hold their pose
      if (v.kind === 'moth') {
        // moths rest with wings spread, opening and closing them slowly; now and then one shivers
        const flap = 0.25 + Math.abs(Math.sin(v.t * (v.i % 2 ? 1.3 : 0.9))) * 0.5 + (Math.sin(v.t * 0.7 + v.i) > 0.96 ? Math.sin(v.t * 40) * 0.4 : 0);
        if (v.wings) { v.wings[0].rotation.z = -flap; v.wings[1].rotation.z = flap; }
        continue;
      }
      const sel = v.i === this.sel && this.lift;
      if (v.wings) { const f = 0.1 + Math.abs(Math.sin(v.t * 31)) * (v.st === 'fly' ? 0.9 : 0.12); v.wings[0].rotation.z = -f; v.wings[1].rotation.z = f; }      // the hornet's wings shiver
      if (v.st === 'sit') {
        if (sel && this.lift.h > 0.01) {
          // in Mika's fingers: off the bark, trembling when the hand hurries, squirming when it wriggles
          const h = this.lift.h, rush = this.lift.rush ** 3, wr = this.lift.state === 'kick' ? 1 : this.lift.state === 'warn' ? 0.4 : 0;
          this.stick(v.root, v.a, v.h + h * 0.05, 0.004 + h * 0.3, v.head + Math.sin(v.t * 45) * 0.25 * rush + Math.sin(v.t * 26) * 0.55 * wr);
          continue;
        }
        // wander slowly round the bait
        if (v.pause > 0) {
          v.pause -= dt;
          if (v.pause <= 0) {
            v.ta = Math.max(-0.6, Math.min(0.6, v.a + (this.rand() - 0.5) * 0.5)); v.th = Math.max(1, Math.min(1.65, v.h + (this.rand() - 0.5) * 0.3));
            if (v.anim?.has('Walk')) v.anim.play('Walk', { speed: v.walkSpeed || 1 }); else v.anim?.play('Idle');
          }
        } else {
          const da = v.ta - v.a, dh = v.th - v.h, r = this.trunk.r0, d = Math.hypot(da * r, dh);
          if (d < 0.01) { v.pause = 1.5 + this.rand() * 3; v.anim?.play('Idle'); }
          else {
            const step = Math.min(d, dt * CRAWL);
            v.a += da * r / d * step / r; v.h += dh / d * step;
            const want = Math.atan2(-da * r, dh);
            v.head += Math.atan2(Math.sin(want - v.head), Math.cos(want - v.head)) * Math.min(1, dt * 3);
          }
        }
        this.stick(v.root, v.a, v.h, 0.004, v.head);
      } else if (v.st === 'up' || v.st === 'back') {
        const w = v.tw;
        w.u = Math.min(1, w.u + dt / w.dur);
        const e = w.u * w.u * (3 - 2 * w.u);
        v.root.position.lerpVectors(w.from, w.to, e);
        if (v.st === 'up') {
          // turn it to face Mika (the camera), a little larger to see
          _m.lookAt(cam.position, v.root.position, UP);
          _q.setFromRotationMatrix(_m).multiply(_q2.setFromAxisAngle(_x.set(1, 0, 0), 0.9));
          v.root.quaternion.slerpQuaternions(w.q0, _q, e);
          v.root.scale.setScalar(1 + e * (v.showScale - 1));
          if (w.u >= 1) { v.st = 'show'; v.base = v.root.quaternion.clone(); }
        } else {
          v.root.quaternion.slerp(w.q1, e);
          v.root.scale.setScalar(v.showScale - e * (v.showScale - 1));
          if (w.u >= 1) { v.st = 'done'; v.pause = 2; v.root.scale.setScalar(1); }
        }
      } else if (v.st === 'show') {
        v.showT -= dt;
        v.root.quaternion.copy(v.base).multiply(_q.setFromAxisAngle(UP, Math.sin(v.t * 1.4) * 0.7));
        if (v.showT <= 0 || (v.showT < 2 && this.ctx.pressed())) {
          v.st = 'back';
          this.stick(_probe, v.a, v.h, 0.004, v.head);
          v.tw = { from: v.root.position.clone(), to: _probe.position.clone(), q1: _probe.quaternion.clone(), u: 0, dur: 0.6 };
        }
      } else if (v.st === 'fly') {
        const w = v.tw;
        w.u = Math.min(1, w.u + dt / w.dur);
        v.root.position.lerpVectors(w.from, w.to, w.u * w.u);
        v.root.rotation.z += dt * 9;
        if (w.u >= 1) { v.st = 'gone'; v.root.visible = false; }
      } else if (v.st === 'done') {
        this.stick(v.root, v.a, v.h, 0.004, v.head);
      }
    }
    // the ring round the beetle Mika is reaching for
    const s = this.visitors[this.sel];
    if (this.selRing) {
      if (s && s.st === 'sit' && this.phase === 'dawn') {
        this.stick(this.selRing, s.a, s.h, 0.06, 0);
        this.selMat.opacity = 0.55 + Math.sin(this.t * 6) * 0.2;
      } else this.selMat.opacity = 0;
    }
  }

  finish(extra) {
    if (this.phase === 'done') return;
    this.phase = 'done';
    this.extra = extra;
    this.showMeter(null);
  }

  labelsStep() {
    if (!this.labels || this.phase !== 'choose') return;
    const cam = this.g.camera, w = innerWidth, h = innerHeight;
    for (const c of this.trees) {
      _v.set(c.x, c.y + 2.3, c.z);
      const d = _v.distanceTo(cam.position);
      _v.project(cam);
      const on = _v.z < 1 && d < 40 && Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05;
      // a label is written only when it moved by a pixel or changed its look
      if (c.on !== on) { c.on = on; c.label.style.display = on ? '' : 'none'; }
      if (!on) continue;
      const lx = Math.round((_v.x + 1) / 2 * w), ly = Math.round(Math.max(120, (1 - _v.y) / 2 * h)), near = c === this.near;
      if (lx !== c.lx) { c.lx = lx; c.label.style.left = `${lx}px`; }
      if (ly !== c.ly) { c.ly = ly; c.label.style.top = `${ly}px`; }
      if (near !== c.nearShown) { c.nearShown = near; c.label.classList.toggle('near', near); }
    }
  }

  update(dt) {
    this.t += dt;
    if (this.phase === 'choose') this.choose(dt);
    else if (this.phase === 'rub') this.rubbing(dt);
    else if (this.phase === 'night') this.night(dt);
    else if (this.phase === 'dawn') this.dawn(dt);
    if (this.visitors.length) this.creatures(dt);
    this.labelsStep();
  }

  get score() { return this.phase === 'dawn' || this.phase === 'done' ? beetlesScore({ visitors: this.kinds, gentle: this.gentleN, hornetsLeft: this.hornetsLeft, hornetsTouched: this.hornetsTouched }) : 0; }
  get timeLeft() { return this.phase === 'dawn' ? Math.max(0, this.dawnLeft) : this.phase === 'choose' || this.phase === 'rub' ? Math.max(0, this.left) : null; }

  /** What a QA script needs. */
  view() {
    const cam = this.g.camera, el = this.g.renderer?.renderer?.domElement, r = el?.getBoundingClientRect?.();
    return {
      phase: this.phase, seed: this.seed, score: this.score, near: this.near?.i ?? null, sel: this.sel,
      traps: this.traps.length, trapAt: this.trapAt, plan: this.plan, moving: this.moving, hornetsLeft: this.hornetsLeft, hornetsTouched: this.hornetsTouched,
      trees: (this.trees || []).map(c => ({ i: c.i, x: c.x, z: c.z, model: c.t.model, name: c.def.name, sap: c.def.sap, good: isGood(c.t.model), used: !!c.used })),
      tree: this.tree ? { i: this.tree.i, model: this.tree.t.model, sap: this.tree.def.sap } : null,
      rub: this.rub ? { pos: this.rub.pos, n: this.rub.n, strokes: this.rub.strokes, bait: this.rub.bait, cool: this.rub.cool, zone: ZONE } : null,
      lift: this.lift ? { h: this.lift.h, v: this.lift.v, max: V_MAX, limit: this.lift.limit, state: this.lift.state } : null,
      visitors: this.visitors.map(v => {
        const s = r ? _v.copy(v.root.position).project(cam) : null;
        return { i: v.i, kind: v.kind, st: v.st, sx: s ? r.left + (s.x + 1) / 2 * r.width : null, sy: s ? r.top + (1 - s.y) / 2 * r.height : null };
      }),
      gentle: this.gentleN, flown: this.flown,
    };
  }

  dispose() {
    this.disposed = true;
    for (const off of this.listeners) off();
    this.listeners.length = 0;
    this.ctx.lock?.(false);
    this.g.follow?.clearCutscene?.(true);
    if (this.light) this.g.lights?.remove(this.light);
    // rigged clones own a bone texture each (the geometry and materials belong to the model library)
    for (const o of this.added) { this.scene.remove(o); disposeRigs(o); }
    for (const x of this.own) x.dispose?.();
    this.own.length = 0;
    this.labels?.remove();
    this.meter?.remove();
    if (this.fading > 0) this.ctx.fade?.(false, 200);
  }
}

export default {
  id: 'beetles',
  async play(ctx) {
    const g = ctx.game;
    await ctx.ensureModels?.(['beetle-rhino', 'beetle-stag', 'moth']);
    if (ctx.quit) return { score: 0, quit: true };
    const qa = typeof window !== 'undefined' ? window.__STARLINE_QA__ : null;
    const r = new BeetleRound(ctx, qa?.trickSeed ?? ((Date.now() / 7) & 0xffff));
    // dusk for setting the trap, when the hour on screen is not dusk already (the framework restores it)
    const h = g.shownHour ? g.shownHour() : 18;
    if (!(h >= 17 && h < 19.5)) ctx.setNight?.(true, 18.4);
    if (qa) qa.trickRound = r;                                                   // test hook (?qa=1 only)
    ctx.debug.view = () => r.view();
    ctx.debug.round = r;
    try {
      if (!r.build()) return { score: 0, quit: true };
      ctx.hint?.(ctx.first
        ? tx('Choose a tree for the trap. Beetles drink sweet sap, so an oak or a chestnut is best. Walk up to one and read its name.')
        : r.plan.traps > 1 ? tx('Two traps tonight, on two trees. Oak and chestnut have the sweetest sap.')
          : tx('Choose a tree: oak and chestnut have the sweetest sap.'), 7);
      ctx.hud?.(0, r.left);
      const res = await ctx.loop(dt => {
        r.update(dt);
        ctx.hud?.(r.score, r.timeLeft);
        if (r.phase === 'done') return true;
      });
      const beetles = r.kinds.filter(k => k === 'rhino' || k === 'stag').length, moths = r.kinds.filter(k => k === 'moth').length;
      return { score: r.score, caught: r.gentleN, quit: !!res?.quit,
        extra: r.extra || tx('Beetles: {b}, moths: {m}', { b: beetles, m: moths }),
        detail: { tree: r.tree?.t.model || null, good: r.tree ? isGood(r.tree.t.model) : false, bait: r.rub?.bait ?? 0, visitors: [...r.kinds], gentle: r.gentleN, flown: r.flown, named: r.named || [], seed: r.seed,
          traps: r.traps.length, trees: r.traps.map(q => q.c.t.model), hornetsLeft: r.hornetsLeft, hornetsTouched: r.hornetsTouched,
          // the framework adds these to the friends journal (FRIENDS ids in story.js)
          friends: [...new Set(r.named || [])].map(k => ({ rhino: 'beetleRhino', stag: 'beetleStag' }[k])).filter(Boolean) } };
    } finally {
      r.dispose();
      ctx.setNight?.(false);
    }
  },
  ambient() {},
  _Round: BeetleRound,
};
