// Make & fly a kite: the rules (pure, no three.js; tested with recorded inputs in tests/tricks2-kite-dew.test.mjs).
//
// Building is three timing presses (bamboo cross, paper, tail): a marker sweeps over a bar and the press is judged by
// how far it is from the middle. The build quality decides how steady the kite flies (a poor tail makes it wobble).
//
// Flying is one number sideways and one up: x is the kite's place across the wind (0 = straight downwind, the middle
// of the "wind window"), h its height (0 on the grass, 1 at the top of the line). The wind pushes x about (a slow
// swing plus gusts on a seeded timetable); the player steers against it. Inside the window the kite climbs, outside it
// sinks; on the grass it takes a moment to launch again. Points: every second aloft counts, and counts more higher up.
//
// The levels (flightPlan) differ in what the sky asks for:
//   Easy       a steady wind (only gentle gusts), a wide window, and a few rings high in the middle: fly high.
//   Normal     gusts, and rings at set heights in the window: a ring below the kite means sliding out of the wind to sink
//              to it and back in before the kite is down (the height goals).
//   Difficult  the wind also turns (the window itself drifts left and right), the rings hang out to the sides, and a tree
//              stands at the right edge of the field: a kite that comes low over it is caught.

import { N_ } from '../../i18n/i18n.js';

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
  ringPoints: 15,      // points for a ring flown through
  gentle: 0.55,        // Easy: the gusts are this much weaker
  ringX: 0.24, ringH: 0.12,   // how near the kite must be to a ring's middle: across the wind, and in height
  ringLife: 9,         // seconds a ring stays in the sky
  shift: 0.5,          // Difficult: the window's middle drifts this far to each side when the wind turns
  shiftTime: 3.5,      // seconds a turn of the wind takes
  treeX: 1.0, treeH: 0.4,   // Difficult: the tree catches a kite right of treeX and lower than treeH
  snag: 1.6,           // extra seconds on the ground after the tree (untangling the line)
};

/**
 * The kites Mika can build. Each flies differently: `fly` holds the numbers the flight takes (all 1 / 0 for the plain
 * diamond, so a flight with no style is the flight it always was):
 *   rise   how fast it climbs in the wind window          fall   how fast it sinks outside it
 *   gust   how much the wind shoves it sideways           steer  how fast it answers the hand
 *   wag    how much a poor tail makes it wag              sway   a wobble of its own, whatever the tail (the flute kite)
 *   core   the middle share of the window where it climbs (a box kite needs the strong wind in the very middle;
 *          in the rest of the window it only holds its height)
 *   relaunch  extra seconds on the grass before it is up again
 * lift / steady / speed (1..5) are the bars the chooser shows. stars: the stars (over all three levels) that open it.
 */
export const KITE_STYLES = [
  { id: 'diamond', name: N_('Diamond kite'), desc: N_('Two sticks and a tail. Does everything well.'), stars: 0, lift: 3, steady: 3, speed: 3,
    fly: { rise: 1, fall: 1, gust: 1, steer: 1, wag: 1, sway: 0, core: 1, relaunch: 0 } },
  { id: 'kaku', name: N_('Kaku-dako'), desc: N_('A painted Japanese square kite with two long tails. Very steady, slow to climb.'), stars: 0, lift: 2, steady: 5, speed: 2,
    fly: { rise: 0.72, fall: 0.85, gust: 0.5, steer: 0.8, wag: 0.4, sway: 0, core: 1, relaunch: 0 } },
  { id: 'sao', name: N_('Diều sáo'), desc: N_('The flute kite of Vietnam. It climbs fast and hums up high, but gusts toss it about.'), stars: 1, lift: 5, steady: 2, speed: 3,
    fly: { rise: 1.42, fall: 1.1, gust: 1.35, steer: 1, wag: 1, sway: 0.1, core: 1, relaunch: 0 } },
  { id: 'bird', name: N_('Hawk kite'), desc: N_('A tonbi-dako with spread wings. Quick to turn and it glides, but it is twitchy.'), stars: 2, lift: 3, steady: 2, speed: 5,
    fly: { rise: 1.05, fall: 0.78, gust: 1.15, steer: 1.45, wag: 1.1, sway: 0, core: 1, relaunch: 0 } },
  { id: 'box', name: N_('Box kite'), desc: N_('Rock steady in a gust, but it only climbs in the strong wind in the very middle.'), stars: 3, lift: 3, steady: 4, speed: 2,
    fly: { rise: 1.05, fall: 1.6, gust: 0.42, steer: 0.85, wag: 0.3, sway: 0, core: 0.45, relaunch: 0.8 } },
];
export const KITE_STYLE = Object.fromEntries(KITE_STYLES.map(k => [k.id, k]));
const PLAIN = KITE_STYLES[0].fly;

/** Is this kite open to a player with `stars` stars on the kite game (all levels added up)? */
export function kiteOpen(style, stars = 0) { return (stars || 0) >= (KITE_STYLE[style]?.stars ?? 99); }

/** The sáo kite's flutes sing when it flies this high (0 = silent .. 1 = full voice at the top of the line). */
export function fluteVoice(s) { return s.aloft && s.style === 'sao' ? Math.max(0, Math.min(1, (s.h - 0.6) / 0.3)) : 0; }

/**
 * What a level's flight is made of: { window, gusts (their strength, times), shift, rings: 'high' | 'height' | 'wide', tree }. The guided first try
 * flies Easy's sky.
 */
export function flightPlan(level = 'normal', first = false) {
  if (first || level === 'easy') return { window: KITE.windowFirst, gusts: KITE.gentle, shift: false, rings: 'high', tree: false };
  if (level === 'hard') return { window: KITE.window, gusts: 1, shift: true, rings: 'wide', tree: true };
  return { window: KITE.window, gusts: 1, shift: false, rings: 'height', tree: false };
}

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
/**
 * The round's sky: a slow swing and a timetable of gusts { t, dur, k } (k: push sideways, signed). plan (flightPlan; left
 * out: Normal's wind as it always was, no rings): gusts scales the timetable's pushes; shift adds the turns of the wind
 * { t, c } (the window's middle goes to c); rings adds the rings { t0, t1, x, h } to fly through; tree marks the tree.
 */
export function makeWind(seed, length = 60, plan = null) {
  const R = rng(seed);
  const w = { p1: R() * 6.283, p2: R() * 6.283, gusts: [], shifts: [], rings: [], tree: !!plan?.tree };
  let t = 5 + R() * 2, sign = R() < 0.5 ? -1 : 1;
  while (t < length - 2) {
    const strong = t > length * 0.45;
    w.gusts.push({ t, dur: 1.5 + R() * 0.7, k: sign * (0.75 + R() * 0.3 + (strong ? 0.2 : 0)) });
    sign = R() < 0.72 ? -sign : sign;
    t += (strong ? 4.2 : 5.5) + R() * 2.6;
  }
  if (!plan) return w;
  if (plan.gusts !== 1) for (const g of w.gusts) g.k *= plan.gusts;      // Easy: the same gusts, gentler
  // the level's own things come from a second seeded source, so the gusts above stay what the seed always gave
  const Q = rng(seed * 31 + 17);
  if (plan.shift) {
    let c = Q() < 0.5 ? -1 : 1;
    for (let ts = 13 + Q() * 4; ts < length - 6; ts += 13 + Q() * 6) { w.shifts.push({ t: ts, c: c * KITE.shift * (0.75 + Q() * 0.25) }); c = -c; }
  }
  if (plan.rings) {
    // the first ring waits until the kite has had time to climb; then one after the other, with a breath between
    let side = Q() < 0.5 ? -1 : 1, low = Q() < 0.5;
    for (let t0 = 11 + Q() * 2; t0 + 5 < length; t0 += KITE.ringLife + 2.5 + Q() * 1.5) {
      const c = windCentre(w, t0 + KITE.ringLife * 0.5);
      let x = c + (Q() - 0.5) * 0.24, h = 0.9 + Q() * 0.08;        // 'high': where a kite at the top of its line already is
      if (plan.rings === 'height') { h = low ? 0.42 + Q() * 0.14 : 0.72 + Q() * 0.2; low = !low; }
      else if (plan.rings === 'wide') {
        const off = plan.window + 0.2 + Q() * 0.22;
        x = c + side * off; h = 0.5 + Q() * 0.34; side = -side;
        if (plan.tree && x > KITE.treeX - KITE.ringX - 0.08) x = c - off;      // never a ring in the tree: it hangs on the other side
      }
      w.rings.push({ t0, t1: t0 + KITE.ringLife, x: Math.max(-KITE.edge + 0.2, Math.min(KITE.edge - 0.2, x)), h });
    }
  }
  return w;
}

/** The middle of the wind window at time t (0 unless the wind turns: Difficult): eased from one turn to the next. */
export function windCentre(w, t) {
  const S = w.shifts;
  if (!S || !S.length) return 0;
  let c = 0;
  for (let i = 0; i < S.length; i++) {
    if (t < S[i].t) break;
    const u = Math.min(1, (t - S[i].t) / KITE.shiftTime), e = u * u * (3 - 2 * u), from = i ? S[i - 1].c : 0;
    c = from + (S[i].c - from) * e;
  }
  return c;
}

/** The ring in the sky at time t (or null), and its number. */
export function ringAt(w, t) {
  for (let i = 0; i < w.rings.length; i++) if (t >= w.rings[i].t0 && t < w.rings[i].t1) return w.rings[i];
  return null;
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
/** A fresh flight. quality 0..1 from the build; window: half-width of the wind window; style: a KITE_STYLES id (left out: the diamond). */
export function newFlight({ quality = 1, tail = quality, window = KITE.window, style = 'diamond' } = {}) {
  return { x: 0, h: KITE.startH, aloft: true, down: 0, tug: 0, pts: 0, air: 0, top: 0, falls: 0, t: 0, inWindow: true, quality, tail, window,
    c: 0, ring: 0, got: 0, missed: 0, ringPts: 0, hitT: -9, snags: 0, snagT: -9, style: KITE_STYLE[style] ? style : 'diamond', fly: KITE_STYLE[style]?.fly || PLAIN };
}

/**
 * Advance the flight by dt. input: { steer: -1..1 (right is +x), tug: bool (a press this step) }.
 * Returns the same state object (changed in place, no allocation).
 */
export function stepFlight(s, w, dt, input) {
  const K = KITE, steer = Math.max(-1, Math.min(1, input?.steer || 0)), F = s.fly || PLAIN;
  s.t += dt;
  s.tug = Math.max(0, s.tug - dt);
  const c = s.c = windCentre(w, s.t);        // the middle of the window (it drifts when the wind turns)
  // a ring nobody flew through goes by
  const R = w.rings;
  while (R && s.ring < R.length && s.t >= R[s.ring].t1) { s.ring++; s.missed++; }
  if (!s.aloft) {
    // on the grass: wind it in, walk it back to the middle, and up again (a tug hurries it)
    s.x += (c - s.x) * Math.min(1, dt * 3);
    s.down -= dt;
    if (input?.tug && s.tug <= 0) { s.tug = K.tugCool; s.down -= 0.7; }
    if (s.down <= 0) { s.aloft = true; s.h = K.startH; s.x = c; }
    s.inWindow = true;
    return s;
  }
  // a poor tail lets the kite wag from side to side (and some kites sway whatever the tail)
  const wag = ((1 - s.tail) * 0.34 * F.wag + F.sway) * Math.sin(s.t * 3.3);
  s.x += (windPush(w, s.t) * F.gust + wag + steer * K.steer * F.steer) * dt;
  if (s.x > K.edge) s.x = K.edge; else if (s.x < -K.edge) s.x = -K.edge;
  const a = Math.abs(s.x - c);
  s.inWindow = a <= s.window;
  // (a kite with a narrow core climbs only in the strong wind in the middle; in the rest of the window it holds its height)
  if (s.inWindow) s.h += K.rise * F.rise * (a <= s.window * F.core ? 1.4 - 0.8 * a / s.window : 0.1) * dt;
  else s.h -= K.fall * F.fall * (1 + (a - s.window) * 1.6) * dt;
  // (a tug lifts a kite as well as it climbs by itself: a heavy kite less, and the box kite only in its strong middle wind)
  if (input?.tug && s.tug <= 0) { s.tug = K.tugCool; s.h += K.tugLift * F.rise * (s.inWindow && a <= s.window * F.core ? 1 : 0.45); }
  if (s.h > 1) s.h = 1;
  if (s.h <= 0) { s.h = 0; s.aloft = false; s.down = K.relaunch + F.relaunch; s.falls++; s.inWindow = false; return s; }
  // the tree at the right edge of the field catches a kite that comes low over it
  if (w.tree && s.x >= K.treeX && s.h <= K.treeH) {
    s.h = 0; s.aloft = false; s.down = K.relaunch + F.relaunch + K.snag; s.falls++; s.snags++; s.snagT = s.t; s.inWindow = false;
    return s;
  }
  // through the ring that hangs in the sky now
  if (R && s.ring < R.length) {
    const r = R[s.ring];
    if (s.t >= r.t0 && Math.abs(s.x - r.x) <= K.ringX && Math.abs(s.h - r.h) <= K.ringH) { s.ring++; s.got++; s.ringPts += K.ringPoints; s.hitT = s.t; }
  }
  s.air += dt;
  s.pts += (K.ptsLow + (K.ptsHigh - K.ptsLow) * s.h * s.h) * dt;
  if (s.h > s.top) s.top = s.h;
  return s;
}

/** The round's score: build points plus flight points plus the rings flown through. */
export function kiteScore(buildPoints, s) { return Math.max(0, Math.floor(buildPoints + (s?.pts || 0) + (s?.ringPts || 0))); }

/**
 * A scripted flyer (tests, tuning, the QA autopilot): returns { steer, tug } for this step. skill: { gain: how hard it
 * steers back (1 = a careful child), rings: goes for the rings, noise: a wobble in the hands, see: seconds it sees the wind
 * coming (0 = only feels it) }. It keeps the kite in the middle of the window, sinks to a ring by sliding out of the wind on
 * the ring's side, and gives the tree a wide berth.
 */
export function kiteBot(s, w, skill = {}, out = { steer: 0, tug: false }) {
  const { gain = 3, rings = true, noise = 0, see = 0.5 } = skill, K = KITE;
  let target = s.c;
  const r = rings && w.rings && s.ring < w.rings.length ? w.rings[s.ring] : null;
  if (s.aloft && r && s.t >= r.t0 - 0.5) {
    const left = r.t1 - s.t, far = Math.abs(r.x - s.c) > s.window - 0.05;
    if (Math.abs(s.h - r.h) <= K.ringH * 0.85 && Math.abs(r.x - s.c) <= s.window) target = r.x;      // level with it already
    else if (s.h > r.h + (s.inWindow ? K.ringH * 0.5 : K.ringH * 0.5 + 0.09)) {
      // too high: slide out of the wind on the ring's side and let it sink (not over the tree)
      const side = r.x >= s.c ? 1 : -1;
      target = s.c + side * (s.window + 0.22);
      if (w.tree && target > K.treeX - 0.12) target = s.c - (s.window + 0.22);
    } else if (s.h < r.h - K.ringH * 0.6) target = far && left < 2.5 ? r.x : s.c;        // climb first, in the wind
    else target = r.x;
  }
  if (w.tree && s.h < K.treeH + 0.12 && target > K.treeX - 0.15) target = K.treeX - 0.15;
  const push = windPush(w, s.t + see);
  let steer = (target - s.x) * gain - push * (see > 0 ? 0.9 : 0);
  if (noise) steer += Math.sin(s.t * 2.1 + 1) * noise + Math.sin(s.t * 5.3) * noise * 0.5;
  out.steer = Math.max(-1, Math.min(1, steer));
  out.tug = s.aloft ? s.inWindow && s.h < 0.9 && !(r && s.h > r.h - 0.02 && s.t >= r.t0 - 2) : true;
  return out;
}

/**
 * Play a whole flight from recorded inputs (tests, and the QA autopilot's expectations).
 * frames: [{ steer, tug }] one per step of dt; or a function (state, wind, t) -> input (a bot).
 */
export function simulateFlight({ seed = 1, length = 60, dt = 1 / 30, quality = 1, tail = quality, window = KITE.window, frames, plan = null, style = 'diamond' }) {
  const w = makeWind(seed, length, plan), s = newFlight({ quality, tail, window: plan ? plan.window : window, style });
  const n = Math.round(length / dt);
  for (let i = 0; i < n; i++) stepFlight(s, w, dt, typeof frames === 'function' ? frames(s, w, i * dt) : frames?.[i]);
  return s;
}
