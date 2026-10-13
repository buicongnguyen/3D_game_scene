// Cricket by its song: the rules. Pure (no three.js, no DOM, no Math.random), seeded, tested with recorded inputs in
// tests/bugs.test.mjs. The round (./cricket.js) only draws and sounds what happens here.
//
// Three crickets sing, one after the other, hidden in the grass round the sign. The song tells where: it pans to the
// side it comes from and gets louder as Mika gets near (and a pulse on the screen edge shows the same for ears that
// cannot hear it). Close up the cricket goes quiet when she moves ("shh"); stand still and it starts again. Then a
// three-beat tap on the beat of its song tickles it into the cage. The last one is counted for 14 seconds: the chirps
// in 14 seconds tell the temperature (Dolbear's law), and a guess earns a bonus.
//
// Three levels (CRICKET_LEVELS). Easy: two crickets, a wide tap window, answers far apart. Normal: three crickets, each
// one quieter than the one before. Difficult: four crickets, four taps in a narrower window, and two things to learn:
// a bell cricket sings over the song from another spot (a long high trill: walk to that one and the time is lost), and
// the chirps of the last cricket are not counted on the screen: Mika counts them herself and says how many there were.

/** A small seeded random source (the same numbers every run for the same seed). */
export function rng(seed) {
  let s = (Math.floor(seed) % 2147483646 + 2147483646) % 2147483646 + 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

export const CRICKET = {
  count: 3,
  ring: [6, 12],          // how far from the sign the crickets hide (m)
  gap: 6,                 // metres between two hiding places
  hear: 30,               // beyond this the song cannot be heard (m)
  near: 2.4,              // inside this a moving Mika silences it
  moving: 0.45,           // m/s: faster than this is "moving"
  still: 0.9,             // she must be still this long (s) before it sings again
  revealStill: 0.6,       // and this long (s) within reach before it shows itself
  reach: 1.7,             // close enough to tickle it (m)
  beats: 3, lead: 1.7,    // the tap sequence: three beats, the first one this long after it starts (s); the cricket sings two count-in beats before it
  perfect: 0.1, good: 0.2, window: 0.3, easyWindow: 0.4,   // how far from the beat a tap may be (s)
  beat: [0.7, 0.9],       // seconds between beats (each cricket has its own)
  hushAfterFail: 2.5, flee: [5, 9],
  thermoSeconds: 14,
  points: { found: 20, speed: 10, gentle: 10, guess: 10, wrong: 5 }, speedWithin: 30,
  wrongMost: 3,           // at most this many visits to the other singer cost points
  other: { rate: 0.6, pitch: 1.5, pulses: 8, vol: 0.8, from: [6, 10], hush: 3 },   // the bell cricket of the Difficult level
};

/**
 * The levels. count: crickets to find; beats / window: the tickle (taps, and how far off the beat one may be, s);
 * soft: each cricket sings more softly than the one before; other: a bell cricket sings too (not the one to find);
 * step: how far apart the answers of the guess are; ask: 'temp' (how warm, with the count on the screen) or 'count'
 * (the count is hidden: how many chirps were there?).
 */
export const CRICKET_LEVELS = {
  first: { count: 3, beats: 3, window: 0.4, soft: false, other: false, step: 3, ask: 'temp' },
  easy: { count: 2, beats: 3, window: 0.4, soft: false, other: false, step: 5, ask: 'temp' },
  normal: { count: 3, beats: 3, window: 0.3, soft: true, other: false, step: 3, ask: 'temp' },
  hard: { count: 4, beats: 4, window: 0.24, soft: true, other: true, step: 4, ask: 'count' },
};
export const cricketLevel = (level, first = false) => (first ? CRICKET_LEVELS.first : CRICKET_LEVELS[level] || CRICKET_LEVELS.normal);
/** How loud the first, second, third and fourth cricket of a round sing when each is quieter than the last. */
export const SOFTER = [1, 0.8, 0.62, 0.5];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const between = (R, [a, b]) => a + (b - a) * R();

// ------------------------------------------------------------------------------------------------ Dolbear's law
/** Chirps in 14 seconds -> degrees Fahrenheit (Dolbear's law: chirps + 40). */
export const fahrenheit = n14 => n14 + 40;
/** Chirps in 14 seconds -> degrees Celsius. */
export const celsius = n14 => (fahrenheit(n14) - 32) * 5 / 9;
/** The chirps in 14 seconds a cricket makes at this temperature (whole degrees Celsius). */
export const chirpsFor = tC => Math.max(8, Math.round(tC * 9 / 5 + 32 - 40));

/** Tonight's temperature (whole degrees C): a warm summer night or a cooler autumn one. */
export function tempFor(seed, season) {
  const R = rng(seed * 7 + 3), [lo, hi] = season === 'autumn' ? [14, 21] : [21, 27];
  return Math.round(lo + R() * (hi - lo));
}

/** The 14-second count: the times (s) of every chirp, N of them spread evenly (so the count is exactly N). */
export function thermoTimes(n14) {
  const out = [], step = CRICKET.thermoSeconds / n14;
  for (let i = 0; i < n14; i++) out.push(+(i * step + step * 0.5).toFixed(3));
  return out;
}

/** Three answers to "how warm is the night?": the right one and two others a few degrees off, in a seeded order. */
export function guessOptions(tC, rand, step = 3, lo = 8, hi = 38) {
  const sets = [[-step, step], [step, 2 * step], [-2 * step, -step]].filter(([a, b]) => tC + a >= lo && tC + b <= hi);
  const [a, b] = sets[Math.floor(rand() * sets.length)] || [step, 2 * step];
  const list = [tC, tC + a, tC + b];
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return list;
}

/** Three answers to "how many chirps was that?" (Difficult): the right count and two others `step` apart. */
export function countOptions(n14, rand, step = 4) {
  return guessOptions(n14, rand, step, 4, 99);
}

// ------------------------------------------------------------------------------------------------ hearing
/** Which way, how far, how loud: the cricket at (cx, cz) heard by Mika at (px, pz) with the camera looking along camYaw. */
export function hearing(px, pz, cx, cz, camYaw, out = { rel: 0, d: 0, pan: 0, vol: 0 }) {
  const dx = cx - px, dz = cz - pz, d = Math.hypot(dx, dz);
  // the camera's forward is (sin yaw, cos yaw) and its right (-cos yaw, sin yaw): see actors/player.js
  const fwd = dx * Math.sin(camYaw) + dz * Math.cos(camYaw), right = -dx * Math.cos(camYaw) + dz * Math.sin(camYaw);
  out.d = d;
  out.rel = Math.atan2(right, fwd);                       // 0 = straight ahead, +pi/2 = to the right, pi = behind
  out.pan = clamp(Math.sin(out.rel) * 0.95, -0.95, 0.95);
  out.vol = d >= CRICKET.hear ? 0 : Math.max(0.1, (1 - d / CRICKET.hear) ** 1.3);
  return out;
}

// ------------------------------------------------------------------------------------------------ the tickle
/**
 * Three beats, tapped on the beat. start() begins it; update(dt, tapped) returns null, or an event once per beat:
 * 'perfect' | 'good' | 'ok' (a tap on the beat) or 'rough' (a tap well off the beat, or none: the cricket hops away).
 * After the third good beat `done` is true and `quality` (0..1) is how gently it was done.
 */
export class Tickle {
  constructor(beat = 0.8, window = CRICKET.window, beats = CRICKET.beats) {
    this.beat = beat; this.window = window; this.beats = beats;
    this.t = 0; this.n = 0; this.sum = 0; this.done = false; this.failed = false; this.on = false;
  }

  start() { this.t = 0; this.n = 0; this.sum = 0; this.done = this.failed = false; this.on = true; }

  /** Seconds from now to the beat being waited for. */
  get toBeat() { return CRICKET.lead + this.n * this.beat - this.t; }
  get quality() { return this.done ? this.sum / this.beats : 0; }

  update(dt, tapped) {
    if (!this.on || this.done || this.failed) return null;
    this.t += dt;
    const err = this.toBeat;                                // > 0: the beat is still coming
    if (tapped) {
      if (Math.abs(err) > this.window) return this.fail();
      const a = Math.abs(err), q = a <= CRICKET.perfect ? 1 : a <= CRICKET.good ? 0.6 : 0.3;
      this.sum += q; this.n++;
      if (this.n >= this.beats) { this.done = true; this.on = false; }
      return q === 1 ? 'perfect' : q === 0.6 ? 'good' : 'ok';
    }
    if (err < -this.window) return this.fail();             // the beat went by with no tap
    return null;
  }

  fail() { this.failed = true; this.on = false; return 'rough'; }
}

// ------------------------------------------------------------------------------------------------ the hunt
/**
 * The crickets of one round. opts: { rand, ok(x, z), centre: { x, z }, temp: °C, first: bool (nearer and easier) }.
 * update(dt, p, camYaw) with p = { x, z, speed }: the cricket being hunted sings, hushes, resumes, and reveals itself;
 * events are left in `this.events` as { kind, c, ... } for the sound and the picture (the round clears them each frame).
 */
export class Crickets {
  constructor({ rand, ok = () => true, centre, temp = 24, first = false, count = CRICKET.count, window = CRICKET.window, beats = CRICKET.beats, soft = false, other = false } = {}) {
    this.rand = rand; this.ok = ok; this.temp = temp; this.first = first;
    this.window = window; this.beats = beats;
    this.wrong = 0;                                       // visits to the other singer (Difficult)
    this.heardOther = { rel: 0, d: 0, pan: 0, vol: 0 };
    this.n14 = chirpsFor(temp);
    this.events = [];
    this.cur = 0;
    this.t = 0;
    this.heard = { rel: 0, d: 0, pan: 0, vol: 0 };
    this.list = [];
    const R = rand, a0 = R() * Math.PI * 2, ring = first ? [CRICKET.ring[0], CRICKET.ring[0] + 4] : CRICKET.ring;
    for (let i = 0; i < count; i++) {
      let pos = null;
      for (let k = 0; k < 60 && !pos; k++) {
        const a = a0 + i * 2.1 + (R() - 0.5) * 0.9 + (k > 30 ? R() * 3 : 0), r = between(R, ring);
        const x = centre.x + Math.sin(a) * r, z = centre.z + Math.cos(a) * r;
        if (this.ok(x, z) && !this.list.some(c => Math.hypot(c.x - x, c.z - z) < CRICKET.gap)) pos = { x, z };
      }
      pos ??= { x: centre.x + 7 + i * 3, z: centre.z + 7 };
      // the last one sings at exactly the rate of the night's temperature, the others a little off it
      const rate = this.n14 / CRICKET.thermoSeconds * (i === count - 1 ? 1 : [0.82, 1.14, 0.9][i] ?? 1);
      this.list.push({ i, x: pos.x, z: pos.z, pitch: [0.96, 1.08, 1.0, 1.04][i] ?? 1, rate, pulses: 3 + (i % 2), beat: between(R, CRICKET.beat),
        loud: soft ? SOFTER[i] ?? 0.5 : 1,
        st: 'sing', next: 0.6 + R() * 0.5, still: 0, quiet: 0, fails: 0, hunt: 0, caught: false, quality: 0 });
    }
    // the bell cricket: another song, from another spot (never the one to find)
    this.other = null;
    if (other) {
      const O = CRICKET.other;
      this.other = { x: centre.x, z: centre.z, rate: O.rate, pitch: O.pitch, pulses: O.pulses, next: 1.5, still: 0, quiet: 0, other: true };
      this.placeOther({ x: centre.x, z: centre.z });
    }
  }

  /** Put the bell cricket somewhere 6..10 m from the cricket being hunted, not right beside Mika. */
  placeOther(p) {
    const o = this.other, c = this.active, R = this.rand;
    if (!o || !c) return;
    for (let k = 0; k < 30; k++) {
      const a = R() * Math.PI * 2, r = between(R, CRICKET.other.from), x = c.x + Math.sin(a) * r, z = c.z + Math.cos(a) * r;
      if (this.ok(x, z) && Math.hypot(x - p.x, z - p.z) > 5) { o.x = x; o.z = z; return; }
    }
    o.x = c.x + 7; o.z = c.z - 4;
  }

  /** The bell cricket sings on, whatever Mika does; standing still right by it finds it out ('wrong') and it moves off. */
  otherStep(dt, p, camYaw) {
    const o = this.other;
    if (o.quiet > 0) { o.quiet -= dt; return; }
    const h = hearing(p.x, p.z, o.x, o.z, camYaw, this.heardOther);
    if (h.d <= CRICKET.reach && p.speed <= CRICKET.moving) {
      o.still += dt;
      if (o.still >= CRICKET.revealStill) {
        this.wrong++; o.still = 0; o.quiet = CRICKET.other.hush;
        this.emit('wrong', o, { x: o.x, z: o.z });
        this.placeOther(p);
        return;
      }
    } else o.still = 0;
    if ((o.next -= dt) <= 0) {
      o.next += 1 / o.rate;
      this.emit('other', o, { vol: h.vol * CRICKET.other.vol, pan: h.pan, rel: h.rel, d: h.d, pitch: o.pitch, pulses: o.pulses });
    }
  }

  get active() { return this.list[this.cur] || null; }
  get done() { return this.cur >= this.list.length; }
  get caught() { return this.list.filter(c => c.caught).length; }

  emit(kind, c, extra) { this.events.push({ kind, c, ...extra }); }

  update(dt, p, camYaw) {
    const c = this.active;
    this.t += dt;
    this.px = p.x; this.pz = p.z;
    if (!c) return;
    c.hunt += dt;
    const h = hearing(p.x, p.z, c.x, c.z, camYaw, this.heard), moving = p.speed > CRICKET.moving;
    if (c.st === 'tickle') return;                                  // the round runs the tap sequence
    if (this.other) this.otherStep(dt, p, camYaw);
    if (c.quiet > 0) { c.quiet -= dt; return; }                      // it hopped away: quiet for a while
    if (h.d < CRICKET.near) {
      // close up: it goes quiet when she moves, and sings again once she has been still a moment
      if (moving) {
        if (c.st === 'sing') { c.st = 'hush'; this.emit('hush', c, { d: h.d }); }
        c.still = 0;
        return;
      }
      c.still += dt;
      if (c.st === 'hush' && c.still >= CRICKET.still) { c.st = 'sing'; c.next = 0; this.emit('resume', c, { d: h.d }); }
      else if (c.st === 'hush') return;
      else if (h.d <= CRICKET.reach && c.still >= CRICKET.revealStill) { c.st = 'tickle'; this.emit('reveal', c, { d: h.d }); return; }
    } else { c.still = 0; if (c.st === 'hush') { c.st = 'sing'; c.next = 0.3; } }
    // the song, at the cricket's own rate
    if (c.st === 'sing' && (c.next -= dt) <= 0) {
      c.next += 1 / c.rate;
      this.emit('chirp', c, { vol: h.vol * c.loud, pan: h.pan, rel: h.rel, d: h.d, pitch: c.pitch, pulses: c.pulses });
    }
  }

  /** The tap sequence failed: the cricket hops 5..9 m away and keeps quiet a moment. */
  flee(p) {
    const c = this.active, R = this.rand;
    c.fails++; c.st = 'sing'; c.quiet = CRICKET.hushAfterFail; c.still = 0;
    for (let k = 0; k < 20; k++) {
      const a = R() * Math.PI * 2, r = between(R, CRICKET.flee), x = c.x + Math.sin(a) * r, z = c.z + Math.cos(a) * r;
      if (this.ok(x, z) && Math.hypot(x - p.x, z - p.z) > CRICKET.near + 1) { c.x = x; c.z = z; break; }
    }
    this.emit('fled', c, {});
  }

  /** The tickle worked: the cricket is caught with a gentleness (0..1); the next one starts to sing. */
  catchIt(quality) {
    const c = this.active;
    c.caught = true; c.quality = quality; c.st = 'caught';
    this.emit('caught', c, { quality });
    this.cur++;
    const n = this.active;
    if (n) { n.hunt = 0; n.next = 1.2; }
    if (n && this.other) this.placeOther({ x: this.px || 0, z: this.pz || 0 });
  }

  /** How wide a tap may be off the beat for this cricket: the level's window, wider after two failed tries, and in the guided first round. */
  windowFor(c) { return this.first ? CRICKET.easyWindow : c.fails >= 2 ? Math.min(CRICKET.easyWindow, this.window + 0.1) : this.window; }
}

// ------------------------------------------------------------------------------------------------ the score
/** 20 for each cricket, up to 10 for speed (found within 30 s of starting its hunt), up to 10 for a gentle tickle, 10 for the right temperature. */
export function cricketPoints(c) {
  const P = CRICKET.points;
  return P.found + Math.round(P.speed * clamp(1 - c.hunt / CRICKET.speedWithin, 0, 1)) + Math.round(P.gentle * c.quality);
}

/**
 * The round's score from the crickets caught (each with `hunt` seconds and `quality`) and whether the guess was right;
 * each visit to the other singer (Difficult, at most CRICKET.wrongMost of them) takes 5 away.
 */
export function cricketScore(list, guessed = false, wrong = 0) {
  let s = 0;
  for (const c of list) if (c.caught) s += cricketPoints(c);
  return Math.max(0, s + (guessed ? CRICKET.points.guess : 0) - CRICKET.points.wrong * Math.min(CRICKET.wrongMost, wrong));
}
