// Make & fly a kite: the rules (pure, no three.js; tested with recorded inputs in tests/tricks2-kite-dew.test.mjs).
//
// Building is three timing presses (bamboo cross, paper, tail): a marker sweeps over a bar and the press is judged by
// how far it is from the middle. The build quality decides how steady the kite flies (a poor tail makes it wobble).
//
// Flying is one number sideways and one up: x is the kite's place across the wind (0 = straight downwind, the middle
// of the "wind window"), h its height (0 on the grass, 1 at the top of the line). The wind pushes x about (a slow
// swing plus gusts on a seeded timetable); the player steers against it. Inside the window the kite climbs, outside it
// sinks; on the grass it takes a moment to launch again. Points: every second aloft counts, and counts more higher up.

export const KITE = {
  window: 0.42,        // half-width of the wind window (x units)
  windowFirst: 0.56,   // wider in the guided first try and in easy mode
  edge: 1.5,           // x never leaves [-edge, edge]
  steer: 0.8,          // how fast the player moves the kite sideways (x per second)
  rise: 0.115,         // climb per second inside the window (more near the middle)
  fall: 0.27,          // sink per second outside the window (more the further out)
  tugLift: 0.13,       // a tug on the line (Space / Jump) lifts the kite this much...
  tugCool: 1.0,        // ...once every this many seconds
  startH: 0.2,         // height just after a launch
  relaunch: 3.0,       // seconds on the grass before it flies again (a tug shortens it)
  lead: 1.1,           // grass and clouds show the wind this many seconds before the kite feels it
  ptsLow: 0.3, ptsHigh: 2,  // points per second aloft at h = 0 and h = 1 (rising with the square of h)
  stepPoints: 5,       // points for a perfect build step
};

/** A small seeded random source (same numbers every run for the same seed). */
export function rng(seed) {
  let s = (Math.floor(seed) % 2147483646 + 2147483646) % 2147483646 + 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

// ----------------------------------------------------------------------------------------------- building
/** The marker's place on the bar (-1..1) at time t: a triangle wave, `speed` sweeps (end to end) per second. */
export function sweepAt(t, speed = 0.8) {
  const f = ((t * speed / 2) % 1 + 1) % 1;       // one full there-and-back per 2 sweeps
  return f < 0.5 ? -1 + f * 4 : 3 - f * 4;
}

/** How good a press is, 0..1, from the marker's distance to the middle: perfect within 0.14, nothing beyond 0.75. */
export function buildQuality(offset) {
  const a = Math.abs(offset);
  if (a <= 0.14) return 1;
  return Math.max(0, 1 - (a - 0.14) / 0.61);
}

/** Words for a build step: 2 perfect, 1 good, 0 wobbly. */
export function buildGrade(q) { return q >= 0.99 ? 2 : q >= 0.5 ? 1 : 0; }

/** Points for the three build steps (0..15) and the kite's overall quality (0..1; the tail counts double). */
export function buildResult(qs) {
  const q = [0, 1, 2].map(i => Math.min(1, Math.max(0, qs[i] ?? 0)));
  return { points: q.reduce((s, v) => s + Math.round(v * KITE.stepPoints), 0), quality: (q[0] + q[1] + q[2] * 2) / 4, tail: q[2] };
}

// ----------------------------------------------------------------------------------------------- the wind
/** The round's wind: a slow swing and a timetable of gusts { t, dur, k } (k: push sideways, signed). */
export function makeWind(seed, length = 60) {
  const R = rng(seed);
  const w = { p1: R() * 6.283, p2: R() * 6.283, gusts: [] };
  let t = 5 + R() * 2, sign = R() < 0.5 ? -1 : 1;
  while (t < length - 2) {
    const strong = t > length * 0.45;
    w.gusts.push({ t, dur: 1.5 + R() * 0.7, k: sign * (0.75 + R() * 0.3 + (strong ? 0.2 : 0)) });
    sign = R() < 0.72 ? -sign : sign;
    t += (strong ? 4.2 : 5.5) + R() * 2.6;
  }
  return w;
}

/** The gust blowing at time t (its strength now, signed), or 0. */
export function gustAt(w, t) {
  for (const g of w.gusts) {
    if (t >= g.t && t < g.t + g.dur) return g.k * Math.sin(Math.PI * (t - g.t) / g.dur);
  }
  return 0;
}

/** Sideways push of the wind on the kite at time t (x per second, signed). */
export function windPush(w, t) {
  return 0.2 * Math.sin(t * 0.55 + w.p1) + 0.1 * Math.sin(t * 1.35 + w.p2) + gustAt(w, t);
}

// ----------------------------------------------------------------------------------------------- flying
/** A fresh flight. quality 0..1 from the build; window: half-width of the wind window. */
export function newFlight({ quality = 1, tail = quality, window = KITE.window } = {}) {
  return { x: 0, h: KITE.startH, aloft: true, down: 0, tug: 0, pts: 0, air: 0, top: 0, falls: 0, t: 0, inWindow: true, quality, tail, window };
}

/**
 * Advance the flight by dt. input: { steer: -1..1 (right is +x), tug: bool (a press this step) }.
 * Returns the same state object (changed in place, no allocation).
 */
export function stepFlight(s, w, dt, input) {
  const K = KITE, steer = Math.max(-1, Math.min(1, input?.steer || 0));
  s.t += dt;
  s.tug = Math.max(0, s.tug - dt);
  if (!s.aloft) {
    // on the grass: wind it in, walk it back to the middle, and up again (a tug hurries it)
    s.x += (0 - s.x) * Math.min(1, dt * 3);
    s.down -= dt;
    if (input?.tug && s.tug <= 0) { s.tug = K.tugCool; s.down -= 0.7; }
    if (s.down <= 0) { s.aloft = true; s.h = K.startH; s.x = 0; }
    s.inWindow = true;
    return s;
  }
  // a poor tail lets the kite wag from side to side
  const wag = (1 - s.tail) * 0.34 * Math.sin(s.t * 3.3);
  s.x += (windPush(w, s.t) + wag + steer * K.steer) * dt;
  if (s.x > K.edge) s.x = K.edge; else if (s.x < -K.edge) s.x = -K.edge;
  const a = Math.abs(s.x);
  s.inWindow = a <= s.window;
  if (s.inWindow) s.h += K.rise * (1.4 - 0.8 * a / s.window) * dt;
  else s.h -= K.fall * (1 + (a - s.window) * 1.6) * dt;
  if (input?.tug && s.tug <= 0) { s.tug = K.tugCool; s.h += K.tugLift * (s.inWindow ? 1 : 0.45); }
  if (s.h > 1) s.h = 1;
  if (s.h <= 0) { s.h = 0; s.aloft = false; s.down = K.relaunch; s.falls++; s.inWindow = false; return s; }
  s.air += dt;
  s.pts += (K.ptsLow + (K.ptsHigh - K.ptsLow) * s.h * s.h) * dt;
  if (s.h > s.top) s.top = s.h;
  return s;
}

/** The round's score: build points plus flight points. */
export function kiteScore(buildPoints, s) { return Math.max(0, Math.floor(buildPoints + (s?.pts || 0))); }

/**
 * Play a whole flight from recorded inputs (tests, and the QA autopilot's expectations).
 * frames: [{ steer, tug }] one per step of dt; or a function (state, wind, t) -> input (a bot).
 */
export function simulateFlight({ seed = 1, length = 60, dt = 1 / 30, quality = 1, tail = quality, window = KITE.window, frames }) {
  const w = makeWind(seed, length), s = newFlight({ quality, tail, window });
  const n = Math.round(length / dt);
  for (let i = 0; i < n; i++) stepFlight(s, w, dt, typeof frames === 'function' ? frames(s, w, i * dt) : frames?.[i]);
  return s;
}
