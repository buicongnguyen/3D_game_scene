// Grasshopper & mantis (meadow bug catching): the rules. Pure (no three.js, no DOM, no Math.random), seeded, and tested
// with recorded inputs in tests/bugs.test.mjs. The round (./hoppers.js) only draws what happens here.
//
// The meadow holds a few bugs at a time. Mika's walking speed is her "noise" (0 = creeping, 1 = running); everything
// else follows from it:
//   * a grasshopper notices her inside a radius that grows with her noise (1.3 m when she creeps, 3.4 m when she runs),
//     crouches for 0.3 s (the learnable tell), then hops away; after three hops it is tired for a moment;
//   * a mantis stands on its stalk and alternates between watching her and looking away. Creeping never alarms it.
//     Walking alarms it while it watches, running always does. Alarmed, it rears up in a bluff (threat), then flies off;
//   * the net lands at a spot 1.5 m ahead of her. A quick swing is small and loud; holding the button and letting go
//     is a gentle sweep that is wider and silent. A bug that is sitting, crouching, tired or only just leaving is caught.
//
// Three levels (HOP_LEVELS). Easy: one calm wave, grasshoppers that notice her later and crouch longer, one patient
// mantis. Normal: three waves, each with one more mantis. Difficult: the three waves with warier bugs, a windy spell in
// the second (the glow in the grass that marks the grasshoppers goes out and their crouch cannot be heard), and an order
// to fill all the way through (Order): "a brown one", "a mantis"... the bug that is asked for is worth 10 more.

/** A small seeded random source (the same numbers every run for the same seed). */
export function rng(seed) {
  let s = (Math.floor(seed) % 2147483646 + 2147483646) % 2147483646 + 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

export const BUGS = {
  reach: 1.5,             // the net lands this far in front of Mika (m)
  netR: 0.8,              // a quick swing catches anything this close to that spot...
  sweepR: 1.15,           // ...a gentle sweep a little more
  sweepHold: 0.3,         // hold the button this long (s) and the swing becomes a sweep
  quickLand: 0.1,         // a quick swing lands this long after the button is let go
  sweepLand: 0.35,        // a sweep lands this long after it is let go
  swingCool: 0.4,         // before the net can be swung again
  loud: 2.4,              // a quick swing startles bugs this close to where it lands
  creep: 1.1,             // m/s at or under this, Mika is silent
  walk: 3.0,              // m/s at or over this, Mika is as loud as she gets
  notice: [1.3, 3.4],     // radius (m) at which a grasshopper notices her: creeping .. running
  crouch: 0.3,            // a grasshopper crouches this long (s) before it hops
  hopTime: 0.36,
  rest: 1.8,              // tired after three hops (s)
  hopsToRest: 3,
  idleHop: [4, 9],        // an unbothered grasshopper hops now and then (s between)
  calmHop: [0.5, 0.9], startledHop: [1.4, 2.3], tamedHop: [1.0, 1.6],   // hop lengths (m)
  alarmRange: 7,          // a mantis only minds Mika inside this distance (m)
  threat: 1.1,            // the bluff lasts this long (s) before the mantis flies off
  flee: 0.7, fleeDist: [4, 6.5],
  watchFor: [1.8, 3.2], awayFor: [1.2, 2.2],   // how long a mantis watches her / looks away (s)
  alarmDecay: 0.35,       // per second when she is quiet
  alive: { grass: 6, mantis: 2 },   // bugs in the meadow at once (the round trims it on a phone)
  spawn: [3.2, 7], far: 15.5, respawn: [1.2, 2.4],
  points: { grass: 10, mantis: 25 }, streakFrom: 3, streakBonus: 5, cleanBonus: 15, cleanFrom: 4,
  orderBonus: 10,         // the bug the order asks for (Difficult)
};

/**
 * The levels. waves: each begins at a share of the round's time (`at`) and says how many bugs are out at once
 * (`wind`: a windy spell); notice: how much sooner (> 1) or later (< 1) a grasshopper notices her; crouch: seconds of
 * its tell; alarm: how fast a mantis takes alarm; order: bugs are asked for one at a time.
 */
export const HOP_LEVELS = {
  first: { waves: [{ at: 0, grass: 4, mantis: 1 }], notice: 1, crouch: BUGS.crouch, alarm: 1, order: false },
  easy: { waves: [{ at: 0, grass: 5, mantis: 1 }], notice: 0.75, crouch: 0.45, alarm: 0.7, order: false },
  normal: { waves: [{ at: 0, grass: 6, mantis: 1 }, { at: 0.34, grass: 6, mantis: 2 }, { at: 0.68, grass: 5, mantis: 3 }], notice: 1, crouch: BUGS.crouch, alarm: 1, order: false },
  hard: { waves: [{ at: 0, grass: 6, mantis: 1 }, { at: 0.3, grass: 6, mantis: 2, wind: true }, { at: 0.65, grass: 5, mantis: 3 }], notice: 1.15, crouch: 0.25, alarm: 1.25, order: true },
};
export const hopLevel = (level, first = false) => (first ? HOP_LEVELS.first : HOP_LEVELS[level] || HOP_LEVELS.normal);

/** Which wave a round is in after `t` of `length` seconds: its index in plan.waves. */
export function waveAt(plan, t, length) {
  const u = length > 0 ? t / length : 0;
  let k = 0;
  for (let i = 1; i < plan.waves.length; i++) if (u >= plan.waves[i].at) k = i;
  return k;
}

/** What an order can ask for: a grasshopper by its colour (0 green, 1 brown, 2 golden) or a mantis (3). */
export const WANT_MANTIS = 3;
export const wantOf = b => (b.kind === 'mantis' ? WANT_MANTIS : b.colour);

/**
 * The order (Difficult): one bug is asked for at a time. Catching it is worth BUGS.orderBonus more, and the next one
 * is asked (never the same twice in a row; a mantis one time in four). Any other catch counts as usual.
 */
export class Order {
  constructor(rand) { this.rand = rand; this.want = -1; this.filled = 0; this.other = 0; this.next(); }

  next() {
    let w = Math.floor(this.rand() * 4);
    if (w === this.want) w = (w + 1) % 4;
    this.want = w;
  }

  /** A bug was caught: returns the bonus it earned (0 when it was not the one asked for). */
  take(bug) {
    if (wantOf(bug) !== this.want) { this.other++; return 0; }
    this.filled++;
    this.next();
    return BUGS.orderBonus;
  }
}

const clamp01 = v => Math.max(0, Math.min(1, v));
const between = (R, [a, b]) => a + (b - a) * R();

/** How loud Mika is, 0..1, from her walking speed (m/s). */
export function noiseOf(speed) { return clamp01((speed - BUGS.creep) / (BUGS.walk - BUGS.creep)); }
/** How close a grasshopper must be to notice her. */
export function noticeR(noise) { return BUGS.notice[0] + (BUGS.notice[1] - BUGS.notice[0]) * noise; }

/** Where the net lands: `reach` m ahead of (x, z) along `facing` (the way she looks, radians). */
export function aimSpot(x, z, facing, out = { x: 0, z: 0 }) {
  out.x = x + Math.sin(facing) * BUGS.reach;
  out.z = z + Math.cos(facing) * BUGS.reach;
  return out;
}

/** Can the net take this bug right now? */
export function catchable(b) {
  if (!b.alive) return false;
  if (b.kind === 'grass') return b.st === 'sit' || b.st === 'crouch' || b.st === 'tired' || (b.st === 'hop' && b.u < 0.2);
  return b.st === 'stand';
}

// ------------------------------------------------------------------------------------------------ the net
/**
 * The net's state machine. update(dt, { press, held, tap }) each frame: press = the button went down this frame,
 * held = it is down, tap = a tap on the screen (a quick swing at once). Returns null, or (when the net lands) the
 * same record each time: { r: radius, loud: bool }.
 */
export class Net {
  constructor() {
    this.phase = 'idle';      // idle | hold | quick | sweep
    this.heldT = 0;
    this.t = 0;               // time left until it lands
    this.span = 1;            // how long this swing's landing wait is (for the picture)
    this.cool = 0;
    this.land = { r: 0, loud: false };
  }

  get sweeping() { return this.phase === 'hold' && this.heldT >= BUGS.sweepHold; }
  /** 0..1 progress of the swing that is on its way to landing (for the picture). */
  get u() { return this.phase === 'quick' || this.phase === 'sweep' ? 1 - this.t / this.span : 0; }

  update(dt, { press = false, held = false, tap = false } = {}) {
    this.cool = Math.max(0, this.cool - dt);
    const L = this.land;
    if (this.phase === 'idle') {
      if (this.cool > 0) return null;
      if (tap) { this.begin('quick'); }
      else if (press) { this.phase = 'hold'; this.heldT = 0; }
      return null;
    }
    if (this.phase === 'hold') {
      this.heldT += dt;
      if (!held) this.begin(this.heldT >= BUGS.sweepHold ? 'sweep' : 'quick');
      return null;
    }
    this.t -= dt;
    if (this.t > 0) return null;
    L.r = this.phase === 'sweep' ? BUGS.sweepR : BUGS.netR;
    L.loud = this.phase === 'quick';
    this.phase = 'idle';
    this.cool = BUGS.swingCool;
    return L;
  }

  begin(phase) {
    this.phase = phase;
    this.span = this.t = phase === 'sweep' ? BUGS.sweepLand : BUGS.quickLand;
  }
}

// ------------------------------------------------------------------------------------------------ the score
/** What a round has caught, and what it is worth: 10 a grasshopper, 25 a mantis, +5 for each catch in a run of three, +15 for a clean round. */
export class Tally {
  constructor() { this.grass = 0; this.mantis = 0; this.misses = 0; this.swings = 0; this.streak = 0; this.best = 0; this.bonus = 0; }

  /** A swing landed: kind = 'grass' | 'mantis' for a catch, null for a miss. Returns the points it earned. */
  swing(kind) {
    this.swings++;
    if (!kind) { this.misses++; this.streak = 0; return 0; }
    this[kind]++;
    this.streak++;
    this.best = Math.max(this.best, this.streak);
    const extra = this.streak >= BUGS.streakFrom ? BUGS.streakBonus : 0;
    this.bonus += extra;
    return BUGS.points[kind] + extra;
  }

  /** Points that are not a catch of their own (the order's bonus). */
  extra(points) { this.bonus += points; return points; }

  get caught() { return this.grass + this.mantis; }
  get clean() { return this.misses === 0 && this.caught >= BUGS.cleanFrom; }
  get score() { return this.grass * BUGS.points.grass + this.mantis * BUGS.points.mantis + this.bonus + (this.clean ? BUGS.cleanBonus : 0); }
}

// ------------------------------------------------------------------------------------------------ the meadow
/**
 * The bugs of one round. opts: { rand, ok(x, z) → can a bug be there, grass, mantis (how many at once) }.
 * update(dt, p) with p = { x, z, speed, facing }; events (crouch, hop, tired, look, away, alarm, threat, flee, spawn,
 * gone) are left in `this.events` as { kind, bug } for the picture and the sound; the round clears them each frame.
 */
export class Meadow {
  constructor({ rand, ok = () => true, grass = BUGS.alive.grass, mantis = BUGS.alive.mantis, notice = 1, crouch = BUGS.crouch, alarm = 1 } = {}) {
    this.rand = rand;
    this.ok = ok;
    this.want = { grass, mantis };
    this.notice = notice;       // the level: how much sooner a grasshopper notices her (the round lowers it in a windy spell)
    this.crouch = crouch;       // ...how long its tell lasts
    this.alarm = alarm;         // ...and how fast a mantis takes alarm
    this.bugs = [];
    this.events = [];
    this.respawn = { grass: 0.4, mantis: 2 };
    this.t = 0;
    this.nextId = 0;
    this.swingRes = { bug: null, startled: 0 };
  }

  emit(kind, bug) { this.events.push({ kind, bug }); }

  count(kind) { let n = 0; for (const b of this.bugs) if (b.alive && b.kind === kind) n++; return n; }

  /** A new bug somewhere 4..8.5 m from Mika, in the half of the meadow she is looking at when possible. */
  spawn(kind, p) {
    const R = this.rand, [lo, hi] = BUGS.spawn;
    for (let k = 0; k < 14; k++) {
      const a = (k < 9 ? p.facing + (R() - 0.5) * 2.4 : R() * Math.PI * 2), r = lo + R() * (hi - lo);
      const x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r;
      if (!this.ok(x, z)) continue;
      const b = { id: this.nextId++, kind, colour: kind === 'grass' ? this.nextId % 3 : -1, alive: true, x, z, hx: x, hz: z, face: R() * Math.PI * 2, t: 0, u: 0, st: kind === 'grass' ? 'sit' : 'stand',
        fx: x, fz: z, tx: x, tz: z, arc: 0, hops: 0, startled: false, alarm: 0, gaze: 'away', gazeT: 0, wary: 0, caught: false, ph: R() * 6.28 };
      b.t = between(R, BUGS.idleHop);
      if (kind === 'mantis') { b.gazeT = between(R, BUGS.awayFor); b.face = a + Math.PI; b.away = b.face; }
      this.bugs.push(b);
      this.emit('spawn', b);
      return b;
    }
    return null;
  }

  update(dt, p) {
    this.t += dt;
    const noise = noiseOf(p.speed), R = this.rand;
    for (let i = this.bugs.length - 1; i >= 0; i--) {
      const b = this.bugs[i];
      if (!b.alive) { this.bugs.splice(i, 1); continue; }
      const dx = p.x - b.x, dz = p.z - b.z, d = Math.hypot(dx, dz);
      if (d > BUGS.far && b.st !== 'hop' && b.st !== 'flee') { b.alive = false; this.emit('gone', b); continue; }
      if (b.kind === 'grass') this.grasshopper(b, dt, p, d, noise);
      else this.mantis(b, dt, p, d, noise);
    }
    // keep the meadow stocked: one new bug a moment after one is caught or lost
    for (const kind of ['grass', 'mantis']) {
      if (this.count(kind) >= this.want[kind]) { this.respawn[kind] = between(R, BUGS.respawn); continue; }
      if ((this.respawn[kind] -= dt) <= 0) { this.respawn[kind] = between(R, BUGS.respawn); this.spawn(kind, p); }
    }
  }

  /** Pick a landing spot for a hop of `len` metres, away from (px, pz) (within 55 degrees), on ground that is ok. */
  hopTarget(b, px, pz, len, away) {
    const R = this.rand;
    for (let k = 0; k < 6; k++) {
      const base = away ? Math.atan2(b.x - px, b.z - pz) : R() * Math.PI * 2;
      const a = base + (R() - 0.5) * (away ? 1.9 : 0.6);
      const l = len * (k < 4 ? 1 : 0.5);
      const x = b.x + Math.sin(a) * l, z = b.z + Math.cos(a) * l;
      if (this.ok(x, z)) { b.fx = b.x; b.fz = b.z; b.tx = x; b.tz = z; b.face = a; return true; }
    }
    return false;
  }

  grasshopper(b, dt, p, d, noise) {
    const R = this.rand;
    if (b.st === 'hop') {
      b.u = Math.min(1, b.u + dt / BUGS.hopTime);
      b.x = b.fx + (b.tx - b.fx) * b.u; b.z = b.fz + (b.tz - b.fz) * b.u;
      if (b.u >= 1) {
        b.hops++;
        if (b.hops % BUGS.hopsToRest === 0) { b.st = 'tired'; b.t = BUGS.rest; this.emit('tired', b); }
        else { b.st = 'sit'; b.t = between(R, BUGS.idleHop); b.startled = false; }
      }
      return;
    }
    if (b.st === 'crouch') {
      if ((b.t -= dt) > 0) return;
      const len = b.startled ? between(R, BUGS.startledHop) : between(R, BUGS.tamedHop);
      if (!this.hopTarget(b, p.x, p.z, len, true)) { b.st = 'sit'; b.t = 1; return; }
      b.st = 'hop'; b.u = 0; this.emit('hop', b);
      return;
    }
    if (b.st === 'tired') {
      if ((b.t -= dt) <= 0) { b.st = 'sit'; b.t = between(R, BUGS.idleHop); }
      return;                                           // too tired to mind anyone
    }
    // sitting: it notices Mika inside its radius, or after a while simply hops a little
    const nr = noticeR(noise) * this.notice;
    if (d < nr) {
      b.startled = d < nr * 0.62 || noise > 0.55;
      b.st = 'crouch'; b.t = this.crouch; this.emit('crouch', b);
      b.face = Math.atan2(b.x - p.x, b.z - p.z);
    } else if ((b.t -= dt) <= 0) {
      if (this.hopTarget(b, p.x, p.z, between(R, BUGS.calmHop), false)) { b.st = 'crouch'; b.t = this.crouch; b.startled = false; this.emit('crouch', b); }
      else b.t = 2;
    }
  }

  mantis(b, dt, p, d, noise) {
    const R = this.rand;
    b.wary = Math.max(0, b.wary - dt);
    if (b.st === 'threat') {
      b.u += dt;
      if (b.u >= BUGS.threat) {
        // fly off to another stalk, 4..6.5 m away from Mika
        const len = between(R, BUGS.fleeDist);
        let ok = false;
        for (let k = 0; k < 8 && !ok; k++) {
          const a = Math.atan2(b.x - p.x, b.z - p.z) + (R() - 0.5) * 2.2, x = b.x + Math.sin(a) * len, z = b.z + Math.cos(a) * len;
          if (this.ok(x, z)) { b.fx = b.x; b.fz = b.z; b.tx = x; b.tz = z; b.face = a; ok = true; }
        }
        if (!ok) { b.tx = b.x; b.tz = b.z; b.fx = b.x; b.fz = b.z; }
        b.st = 'flee'; b.u = 0; this.emit('flee', b);
      }
      return;
    }
    if (b.st === 'flee') {
      b.u = Math.min(1, b.u + dt / BUGS.flee);
      b.x = b.fx + (b.tx - b.fx) * b.u; b.z = b.fz + (b.tz - b.fz) * b.u;
      if (b.u >= 1) { b.st = 'stand'; b.alarm = 0.25; b.wary = 4; b.gaze = 'you'; b.gazeT = between(R, BUGS.watchFor); this.emit('look', b); }
      return;
    }
    // standing on its stalk: it turns its body (and head) to Mika while it watches, and away from her while it does not
    const want = b.gaze === 'you' ? Math.atan2(p.x - b.x, p.z - b.z) : b.away;
    b.face += Math.atan2(Math.sin(want - b.face), Math.cos(want - b.face)) * Math.min(1, dt * 3.5);
    // watch Mika for a while, look away for a while
    if ((b.gazeT -= dt) <= 0) {
      b.gaze = b.gaze === 'you' ? 'away' : 'you';
      b.gazeT = between(R, b.gaze === 'you' ? BUGS.watchFor : BUGS.awayFor);
      if (b.gaze === 'away') b.away = Math.atan2(p.x - b.x, p.z - b.z) + (R() < 0.5 ? 1 : -1) * (1.9 + R() * 0.8);   // it turns its back (well, its shoulder)
      this.emit(b.gaze === 'you' ? 'look' : 'away', b);
    }
    if (d > BUGS.alarmRange) { b.alarm = Math.max(0, b.alarm - BUGS.alarmDecay * dt); return; }
    // alarm: creeping is silent; walking alarms it while it watches; running alarms it always. Close is worse.
    const prox = 0.4 + 0.6 * clamp01(1 - d / BUGS.alarmRange), wary = b.wary > 0 ? 1.5 : 1;
    let rise = 0;
    if (noise > 0) rise = b.gaze === 'you' ? (0.5 + 1.5 * noise) * prox : Math.max(0, noise - 0.5) * 4 * prox;
    if (rise > 0) b.alarm = Math.min(1, b.alarm + rise * wary * this.alarm * dt);
    else b.alarm = Math.max(0, b.alarm - BUGS.alarmDecay * dt);
    if (b.alarm >= 1) { b.st = 'threat'; b.u = 0; this.emit('alarm', b); this.emit('threat', b); }
  }

  /**
   * The net lands at (ax, az) with radius r. Takes the nearest catchable bug in reach (and returns it, marked caught);
   * a loud swing also startles the others close to the spot. The same result record is reused.
   */
  swing(ax, az, r, loud) {
    let best = null, bd = r;
    for (const b of this.bugs) {
      if (!catchable(b)) continue;
      const d = Math.hypot(b.x - ax, b.z - az);
      if (d < bd) { bd = d; best = b; }
    }
    const res = this.swingRes;
    res.bug = best; res.startled = 0;
    if (best) { best.alive = false; best.caught = true; best.st = 'caught'; this.emit('caught', best); }
    if (loud) {
      for (const b of this.bugs) {
        if (!b.alive || Math.hypot(b.x - ax, b.z - az) > BUGS.loud) continue;
        if (b.kind === 'grass' && (b.st === 'sit' || b.st === 'tired')) { b.st = 'crouch'; b.t = this.crouch; b.startled = true; res.startled++; this.emit('crouch', b); }
        else if (b.kind === 'mantis' && b.st === 'stand') { b.alarm = Math.min(1, b.alarm + 0.45); res.startled++; }
      }
    }
    return res;
  }
}

/** Stars are in content/tricks.js. The record kept for the results card. */
export function bugsResult(t) {
  return { grass: t.grass, mantis: t.mantis, misses: t.misses, best: t.best, clean: t.clean, score: t.score };
}

/**
 * A scripted player on the pure rules, to tune the stars (tests/bugs.test.mjs): she walks to the bug she wants at
 * `speed` m/s, creeps the last metres (`creep` m/s inside `creepIn` m), stands still while a mantis watches when
 * `patient`, and swings (a sweep when `sweep`) once the bug is under the ring, after a reaction time `react`. After
 * every swing she needs `look` seconds to find the next bug (a child looks about; a machine would not).
 * Returns { score, grass, mantis, misses, filled }. Only the rules above are used: no picture, no clock but dt.
 */
export function botRound({ seed = 1, level = 'normal', length = 95, speed = 2.3, creep = 1.0, creepIn = 4.5, patient = true, sweep = true, react = 0.25, order = true, look = 3 } = {}) {
  const L = hopLevel(level), R = rng(seed), dt = 1 / 30;
  const m = new Meadow({ rand: R, ok: (x, z) => Math.hypot(x, z) < 28, grass: L.waves[0].grass, mantis: L.waves[0].mantis, notice: L.notice, crouch: L.crouch, alarm: L.alarm });
  const tally = new Tally(), ord = L.order ? new Order(rng(seed + 99)) : null;
  const p = { x: 0, z: 0, speed: 0, facing: 0 }, aim = { x: 0, z: 0 };
  let cool = 0, wait = 0, landIn = -1, landR = 0, wave = 0, busy = look, tgt = null;
  for (let t = 0; t < length; t += dt) {
    const w = waveAt(L, t, length);
    if (w !== wave) { wave = w; m.want.grass = L.waves[w].grass; m.want.mantis = L.waves[w].mantis; m.notice = L.notice * (L.waves[w].wind ? 0.85 : 1); }
    // whom to go for: the bug the order asks for when she follows it, else the nearest (she keeps to the one she chose)
    busy -= dt;
    if (tgt && (!tgt.alive || Math.hypot(tgt.x - p.x, tgt.z - p.z) > 12)) { tgt = null; busy = Math.max(busy, look * 0.5); }
    if (!tgt && busy <= 0) {
      let td = 1e9;
      for (const b of m.bugs) {
        if (!b.alive || b.st === 'flee' || b.st === 'threat') continue;
        let d = Math.hypot(b.x - p.x, b.z - p.z);
        if (ord && order && wantOf(b) === ord.want) d -= 6;
        if (d < td) { td = d; tgt = b; }
      }
    }
    p.speed = 0;
    if (tgt && landIn < 0 && busy <= 0) {
      const d = Math.hypot(tgt.x - p.x, tgt.z - p.z);
      p.facing = Math.atan2(tgt.x - p.x, tgt.z - p.z);
      const hold = patient && tgt.kind === 'mantis' && tgt.gaze === 'you' && d < BUGS.alarmRange && creep > BUGS.creep;
      const v = hold ? 0 : d < creepIn ? creep : speed;
      if (d > BUGS.reach - 0.25) { const s = Math.min(v * dt, d - (BUGS.reach - 0.3)); p.x += Math.sin(p.facing) * s; p.z += Math.cos(p.facing) * s; p.speed = v; }
      aimSpot(p.x, p.z, p.facing, aim);
      cool -= dt;
      if (catchable(tgt) && Math.hypot(tgt.x - aim.x, tgt.z - aim.z) < (sweep ? BUGS.sweepR : BUGS.netR) * 0.8 && cool <= 0) {
        wait += dt;
        if (wait >= react) { wait = 0; landIn = (sweep ? BUGS.sweepHold + BUGS.sweepLand : BUGS.quickLand); landR = sweep ? BUGS.sweepR : BUGS.netR; }
      } else wait = 0;
    }
    m.update(dt, p);
    if (landIn >= 0 && (landIn -= dt) < 0) {
      aimSpot(p.x, p.z, p.facing, aim);
      const res = m.swing(aim.x, aim.z, landR, !sweep);
      tally.swing(res.bug ? res.bug.kind : null);
      if (res.bug && ord) tally.extra(ord.take(res.bug));
      cool = BUGS.swingCool;
      tgt = null; busy = look;
    }
    m.events.length = 0;
  }
  return { score: tally.score, grass: tally.grass, mantis: tally.mantis, misses: tally.misses, filled: ord ? ord.filled : 0 };
}
