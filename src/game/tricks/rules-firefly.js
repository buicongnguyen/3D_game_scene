// Firefly jar: the rules. Pure (no three.js, no DOM, no Math.random), tested in tests/firefly.test.mjs. The round
// (./firefly.js) draws what is decided here.
//
// Three kinds of firefly live at the paddy edge, as in the Japanese countryside:
//   * Heike  – small and green, a quick blink, low over the grass and the rice. The common one: 1 point;
//   * Genji  – big and yellow, a slow blink, higher up and over the water. Neighbours blink together: 2 points;
//   * Hime   – tiny and golden, a fast twinkle, very shy, and rare: 3 points.
// They are shy. Mika's walking speed is her noise: tiptoeing (or standing still) never bothers them, a plain walk sends
// off the ones right beside her, running clears the air round her. A scared firefly dims, rises and drifts away for a
// few seconds, and cannot be caught meanwhile.
// One sweep of the net takes every firefly that glows inside its reach, and fireflies caught together are worth more.

/** A small seeded random source (the same numbers every run for the same seed). */
export function rng(seed) {
  let s = (Math.floor(seed) % 2147483646 + 2147483646) % 2147483646 + 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** Blink rhythm: a flash, then darkness. Glow 0..1 at time t for one firefly (lit = the lit fraction of the period). */
export function blink(t, period, phase, lit = 0.32) {
  const f = ((t / period + phase) % 1 + 1) % 1;
  return f < lit ? Math.sin(Math.PI * f / lit) : 0;
}

export const HEIKE = 0, GENJI = 1, HIME = 2;

/**
 * The kinds. period: seconds between flashes [from, to]; lit: the lit share of a period; size: how big the dot is drawn;
 * colour: its light (linear r, g, b); height: metres above the ground [from, to]; shy: how much sooner it takes fright;
 * group: how many gather in one place [from, to]; unison: neighbours of the group blink together.
 */
export const KINDS = [
  { id: 'heike', name: 'Heike', points: 1, period: [1.3, 1.7], lit: 0.45, size: 0.8, colour: [0.5, 1.0, 0.28], css: '#9be84a', height: [0.45, 1.05], shy: 1, group: [1, 3], unison: false },
  { id: 'genji', name: 'Genji', points: 2, period: [3.1, 3.7], lit: 0.34, size: 1.35, colour: [1.0, 0.9, 0.36], css: '#ffe45c', height: [1.0, 1.55], shy: 1, group: [2, 3], unison: true },
  { id: 'hime', name: 'Hime', points: 3, period: [0.9, 1.0], lit: 0.55, size: 0.7, colour: [1.0, 0.56, 0.16], css: '#ffa23a', height: [0.55, 0.95], shy: 1.7, group: [1, 1], unison: false },
];

export const FIREFLY = {
  lantern: 10,            // caught fireflies that make the jar a lantern (the finale)
  jar: 24,                // a full jar ends the round early
  reach: 1.3,             // the net takes fireflies this far (m, on the ground plan) from the middle of its sweep...
  easyReach: 1.6,         // ...a little more in Easy mode
  behind: 0.35,           // the sweep's middle is (reach - behind) ahead of her: one sitting on her shoulder is caught too
  tall: 1.6,              // ...and at most this far above or below the hoop
  hoop: 1.1,              // the hoop's height above Mika's feet in a sweep
  catchable: 0.3,         // a firefly can be caught while it glows at least this much
  easyCatchable: 0.05,    // Easy mode: the faintest glow will do
  swingCool: 0.45,        // seconds before the net can sweep again
  creep: 1.2,             // m/s at or under this, Mika is silent
  run: 4.0,               // m/s at or over this, she is as loud as she gets
  scare: [0.6, 4.8],      // radius (m) inside which fireflies take fright: the quietest noise that counts .. running
  shyFor: 4,              // a scared firefly stays away this long (s), then drifts home
  missShy: 1.8,           // a sweep through fireflies that are dark sends those off for this long
  flee: 2.6,              // how far (m) a scared one drifts from its place
  rise: 0.9,              // ...and how far up
  unison: [0, 0, 1, 2, 3],   // bonus points for 0, 1, 2, 3, 4+ fireflies in one sweep
  himeAfter: 10,          // the rare one only turns up after this many seconds...
  himeEvery: [9, 15],     // ...and then one at a time, this many seconds after the last one left [from, to]
  genjiShare: 0.3,        // of the groups that fly in, this share is Genji...
  genjiMost: 5,           // ...while fewer than this many Genji are flying
  flyIn: 3,               // seconds between groups flying in (the place refills slowly: a jar is not filled by standing still)
};

/** How loud Mika is at this speed: 0 = tiptoe or standing, 1 = running. A plain walk (1.9 m/s) is about 0.25. */
export function noiseOf(speed) {
  return Math.min(1, Math.max(0, (speed - FIREFLY.creep) / (FIREFLY.run - FIREFLY.creep)));
}

/**
 * The radius (m) round Mika inside which a firefly of `kind` takes fright at this noise. 0 = nobody minds.
 * easy: smaller. first (the guided try): only running counts.
 */
export function scareRadius(noise, kind = HEIKE, { easy = false, first = false } = {}) {
  if (noise <= 0 || ((first || easy) && noise < 0.6)) return 0;      // the Easy level: a plain walk bothers nobody
  const r = FIREFLY.scare[0] + (FIREFLY.scare[1] - FIREFLY.scare[0]) * noise;
  return r * KINDS[kind].shy * (easy || first ? 0.6 : 1);
}

/** Is a point (relative to the middle of the sweep, dy from the hoop) inside the net's reach? */
export function inNet(dx, dy, dz, reach = FIREFLY.reach) {
  return dx * dx + dz * dz <= reach * reach && Math.abs(dy) <= FIREFLY.tall;
}

/** Bright enough to be caught? */
export function catchable(glow, easy = false) {
  return glow >= (easy ? FIREFLY.easyCatchable : FIREFLY.catchable);
}

/** The lit share of a period for a kind: longer in the guided try and in Easy mode. */
export function litFor(kind, { easy = false, first = false } = {}) {
  return Math.min(0.7, KINDS[kind].lit + (first ? 0.14 : easy ? 0.12 : 0));
}

/** Bonus points for n fireflies caught in one sweep. */
export function unisonBonus(n) {
  const u = FIREFLY.unison;
  return u[Math.min(u.length - 1, Math.max(0, Math.floor(n)))];
}

/** What is in the jar: how many of each kind, the points, the best sweep. */
export class Jar {
  constructor(size = FIREFLY.jar) {
    this.size = size;         // a full jar ends the round early
    this.counts = [0, 0, 0];
    this.caught = 0;          // fireflies in the jar
    this.score = 0;           // points
    this.sweeps = 0;          // sweeps that caught something
    this.best = 0;            // most fireflies in one sweep
    this.bonus = 0;           // points that came from sweeps of two or more
    this.last = { n: 0, points: 0, bonus: 0 };
  }

  /** One sweep: `n` of each kind [heike, genji, hime]. Returns this.last = { n, points, bonus } (the same object every time). */
  sweep(heike, genji = 0, hime = 0) {
    const n = heike + genji + hime, l = this.last;
    l.n = n; l.bonus = unisonBonus(n);
    l.points = heike * KINDS[HEIKE].points + genji * KINDS[GENJI].points + hime * KINDS[HIME].points + l.bonus;
    if (!n) return l;
    this.counts[HEIKE] += heike; this.counts[GENJI] += genji; this.counts[HIME] += hime;
    this.caught += n; this.score += l.points; this.bonus += l.bonus; this.sweeps++;
    if (n > this.best) this.best = n;
    return l;
  }

  /** Points that are not fireflies (a wish of Grandma's filled on the Difficult level). */
  extra(points) { this.score += points; this.bonus += points; }

  get lantern() { return this.caught >= FIREFLY.lantern; }
  get full() { return this.caught >= this.size; }
}

// ------------------------------------------------------------------------------------------------ the three levels
/**
 * A round has stages: each begins at a share of the round's time (`at`, 0..1) and says who flies in (`genji`: the share
 * of Genji groups, `most`: how many Genji at once) and how hard the breeze blows (`breeze`, metres the swarm drifts to
 * each side). What the teacher says when a stage begins is the round's (firefly.js STAGE_SAY).
 *   easy    one gentle stage: a walk scares nobody, long glows, a wide net (scareRadius, litFor, FIREFLY.easyReach);
 *   normal  two stages: the paddy edge as it is, then the Genji hour (the big ones come out over the water);
 *   hard    three stages, and Grandma's wishes all the way through (Wish): calm, then a breeze that drifts the swarm,
 *           then the Genji hour in a lighter breeze.
 */
export const FF_LEVELS = {
  first: { jar: FIREFLY.jar, wish: false, stages: [{ at: 0, genji: FIREFLY.genjiShare, most: FIREFLY.genjiMost, breeze: 0 }] },
  easy: { jar: FIREFLY.jar, wish: false, stages: [{ at: 0, genji: FIREFLY.genjiShare, most: FIREFLY.genjiMost, breeze: 0 }] },
  normal: { jar: 30, wish: false, stages: [
    { at: 0, genji: FIREFLY.genjiShare, most: FIREFLY.genjiMost, breeze: 0 },
    { at: 0.45, genji: 0.6, most: 9, breeze: 0 },
  ] },
  hard: { jar: 30, wish: true, stages: [
    { at: 0, genji: 0.4, most: 6, breeze: 0 },
    { at: 0.33, genji: 0.4, most: 6, breeze: 2.2 },
    { at: 0.68, genji: 0.6, most: 9, breeze: 0.9 },
  ] },
};

/** The plan of a level ('easy' | 'normal' | 'hard'; the guided first try has its own). */
export function levelPlan(level, first = false) {
  return first ? FF_LEVELS.first : FF_LEVELS[level] || FF_LEVELS.normal;
}

/** Which stage a round is in after `t` of `length` seconds: its index in plan.stages. */
export function stageAt(plan, t, length) {
  const u = length > 0 ? t / length : 0;
  let k = 0;
  for (let i = 1; i < plan.stages.length; i++) if (u >= plan.stages[i].at) k = i;
  return k;
}

/** How far (m) the breeze has pushed the swarm at time t: a slow swing to and fro, with a quicker gust on top. */
export function breezeAt(t, strength) {
  return strength ? strength * (0.75 * Math.sin(t * 0.55) + 0.25 * Math.sin(t * 1.45 + 1)) : 0;
}

export const WISH = { heike: 3, genji: [2, 3], bonus: 3 };

/**
 * Grandma's wishes (the Difficult level): she asks for one kind at a time ("three Heike", then "two Genji"...). Only the
 * wished kind stays in the jar; the others in the sweep are let go again. The rare Hime is always welcome. Each wish
 * filled is worth WISH.bonus points, and the next one is asked.
 */
export class Wish {
  constructor(rand) {
    this.rand = rand;
    this.kind = GENJI;        // (next() turns it: the first wish is the common Heike)
    this.need = 0; this.have = 0; this.filled = 0; this.letGo = 0;
    this.keep = [0, 0, 0];
    this.next();
  }

  next() {
    this.kind = this.kind === HEIKE ? GENJI : HEIKE;
    this.need = this.kind === HEIKE ? WISH.heike : WISH.genji[0] + Math.floor(this.rand() * (WISH.genji[1] - WISH.genji[0] + 1));
    this.have = 0;
  }

  /**
   * One sweep of `got` = [heike, genji, hime]. Returns what stays in the jar (this.keep, the same array every time);
   * this.done is true when the sweep filled the wish (the next one is already asked).
   */
  take(got) {
    const k = this.keep, w = this.kind;
    k[HEIKE] = w === HEIKE ? got[HEIKE] : 0;
    k[GENJI] = w === GENJI ? got[GENJI] : 0;
    k[HIME] = got[HIME];
    this.letGo += got[HEIKE] + got[GENJI] - k[HEIKE] - k[GENJI];
    this.have += k[w];
    this.done = this.have >= this.need;
    if (this.done) { this.filled++; this.next(); }
    return k;
  }
}

/** The jar light's strength for a number of fireflies; never over `cap` (firefly.js JAR_LIGHT). */
export function jarGlow(caught, cap) {
  return caught > 0 ? Math.min(cap, 0.5 + caught * 0.22) : 0;
}

/** The jar light's colour: the kinds' colours mixed by how many of each are in it. Writes r, g, b into out[0..2]. */
export function jarColour(counts, out) {
  const n = counts[0] + counts[1] + counts[2];
  if (!n) { out[0] = 0.85; out[1] = 1; out[2] = 0.42; return out; }
  for (let c = 0; c < 3; c++) out[c] = (counts[0] * KINDS[0].colour[c] + counts[1] * KINDS[1].colour[c] + counts[2] * KINDS[2].colour[c]) / n;
  // a light must stay light: lift it toward a pale yellow-green so three golden Hime do not turn the path orange
  out[0] = 0.55 * out[0] + 0.45 * 0.85; out[1] = 0.55 * out[1] + 0.45 * 1; out[2] = 0.55 * out[2] + 0.45 * 0.42;
  return out;
}

/**
 * Who flies in next. free: how many of each kind are flying now [heike, genji, hime]; t: seconds into the round;
 * himeIn: seconds until a Hime may come (<= 0: now). Returns the kind and writes nothing; the size of the group is groupSize().
 */
export function nextKind(rand, free, t, himeIn, { first = false, genji = FIREFLY.genjiShare, most = FIREFLY.genjiMost } = {}) {
  if (!first && t >= FIREFLY.himeAfter && himeIn <= 0 && free[HIME] === 0) return HIME;
  // the common one is never missing; the big ones come now and then, and only so many at a time (more in the Genji hour)
  if (free[HEIKE] < 3) return HEIKE;
  return free[GENJI] < most && rand() < genji ? GENJI : HEIKE;
}

/** How many fly in together. */
export function groupSize(rand, kind) {
  const g = KINDS[kind].group;
  return g[0] + Math.floor(rand() * (g[1] - g[0] + 1));
}

/** Seconds until the next Hime may come, once one has been caught or has gone. */
export function himeWait(rand) {
  const e = FIREFLY.himeEvery;
  return e[0] + rand() * (e[1] - e[0]);
}
