// The yard games' shared rules: the court, a seeded random source, shuttle flights, kick timing and how the kids
// play. Pure and seeded (no three.js, no DOM, no Math.random): tests/yard.test.mjs replays recorded input through it.
//
// Court space (content/yard.js): u across, v along, the net at v = 0, y up from the ground. Team 0 plays the near
// half (v > 0), team 1 the far half (v < 0).

export const COURT = { W: 6, L: 11, HALF: 5.5, NET: 1.3, WALL_V: -9.1, WALL_H: 2.0, WALL_W: 3.2 };
export const HUMAN_SPEED = 4.4;          // Mika's run (actors/player.js MOVE.run), used when a test drives her
export const KICK_Y = 0.35;              // a shuttle leaves the foot this high
export const WINDUP = 0.46;              // the kids' Kick clip strikes this long after it starts (art/CONTRACTS.md)

/** mulberry32: a small seeded generator; returns a function giving numbers in [0, 1). */
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * How forgiving a kick is. tau = seconds before the shuttle would touch the ground when the foot swings.
 *   perfect: tau inside [p0, p1]; okay: tau <= ok; earlier than that the foot finds only air (try again).
 *   reach: how far from the landing ring the kicker may stand. slow: incoming shuttles hang this much longer.
 */
export const LEVELS = {
  first: { p0: 0.02, p1: 0.30, ok: 0.70, reach: 1.75, slow: 1.3, miss: 1.25, kind: 0.75 },
  easy: { p0: 0.03, p1: 0.26, ok: 0.60, reach: 1.6, slow: 1.15, miss: 1.1, kind: 0.6 },
  normal: { p0: 0.04, p1: 0.20, ok: 0.46, reach: 1.35, slow: 1, miss: 1, kind: 0.4 },
};

/** 'perfect' | 'ok' | 'early' for a swing tau seconds before the landing (tau < 0, after it, is never asked). */
export function judge(tau, L) {
  if (tau > L.ok) return 'early';
  return tau >= L.p0 && tau <= L.p1 ? 'perfect' : 'ok';
}

/**
 * How each kid plays. speed m/s; miss = chance to arrive late on an ordinary shuttle; flat = how often their return
 * is the fast flat one; net / out = chance their own kick dies in the net or sails out; aim = where they send it.
 */
export const STYLES = {
  strong: { speed: 3.9, miss: 0.07, flat: 0.5, net: 0.02, out: 0.03, aim: 'deep' },      // Kenta: hard and deep
  tricky: { speed: 3.6, miss: 0.10, flat: 0.3, net: 0.03, out: 0.03, aim: 'away' },      // Yui: wherever you are not
  wobbly: { speed: 3.3, miss: 0.17, flat: 0.12, net: 0.06, out: 0.07, aim: 'any' },      // Daichi: anywhere, also out
  steady: { speed: 3.6, miss: 0.10, flat: 0.25, net: 0.03, out: 0.03, aim: 'any' },
};

/**
 * A flight from a to b ({ u, y, v }) lasting dur seconds, rising h above the straight line at its middle. When the
 * line crosses the net the arc is raised until it clears the tape by `clear` metres (unless `net`: it is meant to die there).
 */
export function makeFlight(a, b, dur, h, { clear = 0.3, net = false } = {}) {
  const f = { au: a.u, ay: a.y, av: a.v, bu: b.u, by: b.y, bv: b.v, h, dur, t: 0 };
  if (!net && a.v * b.v < 0) {
    const k = a.v / (a.v - b.v), line = a.y + (b.y - a.y) * k, need = COURT.NET + clear - line;
    if (need > 0) f.h = Math.max(h, need / (4 * k * (1 - k)));
  }
  return f;
}

/** The shuttle on its flight at k = t / dur (0 .. 1); writes { u, y, v } into out. */
export function flightAt(f, k, out) {
  out.u = f.au + (f.bu - f.au) * k;
  out.v = f.av + (f.bv - f.av) * k;
  out.y = f.ay + (f.by - f.ay) * k + 4 * f.h * k * (1 - k);
  return out;
}

/** Height over the net line (v = 0), or null when the flight never crosses it. */
export function netHeight(f) {
  if (f.av * f.bv >= 0) return null;
  const k = f.av / (f.av - f.bv);
  return f.ay + (f.by - f.ay) * k + 4 * f.h * k * (1 - k);
}

/** Where the players of a team stand when nothing is happening: one in the middle, or two side by side. */
export function homes(team, n) {
  const s = team === 0 ? 1 : -1;
  if (n <= 1) return [{ u: 0, v: s * 3.2 }];
  return [{ u: -1.5, v: s * 3.4 }, { u: 1.5, v: s * 3.0 }].slice(0, n);
}

/** Move p toward (u, v) at speed; returns true while still on the way. */
export function stepToward(p, u, v, speed, dt) {
  const du = u - p.u, dv = v - p.v, d = Math.hypot(du, dv);
  if (d < 0.05) { p.moving = false; return false; }
  const s = Math.min(d, speed * dt);
  p.u += du / d * s; p.v += dv / d * s;
  p.moving = d > 0.12;
  return true;
}

/** Stars for a score against three thresholds. */
export const starsFor = (score, th) => (score >= th[2] ? 3 : score >= th[1] ? 2 : score >= th[0] ? 1 : 0);
