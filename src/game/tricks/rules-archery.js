// Bow and arrow (docs/RURAL-TRICKS.md): the rules (pure, no three.js; tested with recorded inputs in tests/archery.test.mjs).
//
// Everything is in LANE units (content/archery.js): u metres down the range, v to the shooter's right, y up from the ground
// at the shooting line. An arrow is a point with a velocity. Gravity pulls it down; the wind only pushes it sideways (the lane
// is shot across the wind, which is what the wind sock beside the line shows): the arrow picks up a sideways drift speed that
// relaxes toward the wind's speed like a light arrow in moving air, dv' = K (wind - dv), added to the aim's own sideways speed. Both pieces are integrated exactly for a steady wind, so the
// flight matches the analytic curves (the tests check it) whatever the frame rate.
//
// Safety is part of the rules, not of the scene: the aim is limited to a narrow cone down the lane, an arrow stops at the
// ground, at a target, at the backstop plane or at the side limit, and nothing else exists to be hit.

export const ARCH = {
  g: 9.81,
  k: 1.6,                 // how fast a light arrow takes up the wind's sideways speed (per second)
  vMin: 14, vMax: 34,     // arrow speed (m/s) at the shortest and the fullest draw
  drawTime: 1.0,          // seconds to a full draw
  minDraw: 0.25,          // releasing before this lets the bow down (no arrow is used)
  yawMax: 0.24, pitchMin: -0.08, pitchMax: 0.16,   // the aim cone (radians): about 14 degrees to each side, 5 down, 9 up
  muzzle: { u: 0.45, v: 0.28 },   // where the arrow leaves the bow (lane units; y is the eye height)
  sway: 0.0017,           // the bow's own slow sway at a full draw (radians, about 0.1 degrees)
  tremble: 0.014,         // extra sway at the end of a too-long hold (radians, about 0.8 degrees)
  holdFree: 0.7,          // seconds at full draw before the tremble starts
  holdTremble: 2.0,       // and the seconds it then takes to reach its full size
  steady: 1.2,            // a breath steadies the bow for this long...
  steadyCool: 2.5,        // ...and cannot be taken again for this long after it ends
  steadyKeep: 0.12,       // how much of the sway is left while steady
  gustMax: 5.5,           // no wind is ever stronger than this (m/s)
  ringsN: 10,
  perfect: 10,            // the ring that is a bullseye
  arrowsFirst: 4, arrows: 6, arrowsMoving: 4,
  stars: [60, 100, 140],  // (content/tricks.js repeats them: the test keeps the two in step)
};

/** A small seeded random source (same numbers every run for the same seed). */
export function rng(seed) {
  let s = (Math.floor(seed) % 2147483646 + 2147483646) % 2147483646 + 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

// ----------------------------------------------------------------------------------------------- the plan of a round
/**
 * The ends of a round: three at 10, 15 and 20 m, and (after the first try) a fourth at a sliding target.
 * easy: Easy mode in the settings. first: the guided first try (fewer arrows, a gentler wind, no sliding target).
 */
export function roundPlan(first, easy = false) {
  const n = first ? ARCH.arrowsFirst : ARCH.arrows;
  const ends = [{ target: 0, arrows: n }, { target: 1, arrows: n }, { target: 2, arrows: n }];
  if (!first) ends.push({ target: 'moving', arrows: ARCH.arrowsMoving });
  return { ends, windScale: first || easy ? 0.5 : 1, arc: first || easy };
}

/** The most points a plan can give. */
export function maxScore(plan) { return plan.ends.reduce((s, e) => s + e.arrows, 0) * 10; }

/** How strongly the dotted aim arc is drawn on the nth try (plays so far, 0 = the first): 1 first try and on Easy, then fading to nothing. */
export function arcAlpha(plays, easy = false) {
  if (easy || plays <= 0) return 1;
  return Math.max(0, 0.6 - 0.2 * plays);
}

// ----------------------------------------------------------------------------------------------- the wind
/**
 * The wind of a round: one per end, a base crosswind (signed: + pushes toward +v, the shooter's right), a slow swing and a
 * timetable of gusts. Stronger at the far ends. Seeded: the same seed gives the same wind.
 */
export function makeWind(seed, ends = 4, scale = 1) {
  const R = rng(seed), out = { scale, ends: [] };
  const mags = [[0.7, 1.7], [1.4, 2.9], [2.1, 3.9], [1.2, 2.5]];
  let sign = R() < 0.5 ? -1 : 1;
  for (let e = 0; e < ends; e++) {
    const [lo, hi] = mags[Math.min(e, mags.length - 1)];
    sign = R() < 0.35 ? sign : -sign;           // the wind often turns between ends
    const base = sign * (lo + R() * (hi - lo));
    const gusts = [];
    for (let t = 2 + R() * 3; t < 60; t += 3.5 + R() * 5) gusts.push({ t, dur: 1.4 + R() * 1.6, k: (R() < 0.8 ? 1 : -0.5) * (0.35 + R() * 0.55) });
    out.ends.push({ base, swing: 0.2 + R() * 0.15, per: 6.5 + R() * 4, ph: R() * 6.283, gusts });
  }
  return out;
}

/** The crosswind (m/s, signed) at second t of end `end`. */
export function windAt(wind, end, t) {
  const w = wind.ends[Math.min(end, wind.ends.length - 1)];
  let k = 1 + w.swing * Math.sin(t * 6.283 / w.per + w.ph);
  for (const g of w.gusts) {
    const x = (t - g.t) / g.dur;
    if (x > 0 && x < 1) k += g.k * Math.sin(x * Math.PI) ** 2;
  }
  const v = w.base * k * wind.scale;
  return v > ARCH.gustMax ? ARCH.gustMax : v < -ARCH.gustMax ? -ARCH.gustMax : v;
}

// ----------------------------------------------------------------------------------------------- the bow
/** Draw fraction 0..1 after `t` seconds of holding. */
export function drawAt(t) { return t <= 0 ? 0 : t >= ARCH.drawTime ? 1 : t / ARCH.drawTime; }

/** Arrow speed for a draw. */
export function speedFor(draw) { return ARCH.vMin + (ARCH.vMax - ARCH.vMin) * Math.min(1, Math.max(0, draw)); }

/**
 * How big the bow's sway is (radians) after holding for `t` seconds, `steadyLeft` seconds of a breath still to run. It grows
 * with the draw, and past `holdFree` seconds of a full draw it trembles more and more.
 */
export function swayAmp(t, steadyLeft = 0) {
  const d = drawAt(t), over = Math.max(0, t - ARCH.drawTime - ARCH.holdFree) / ARCH.holdTremble;
  const a = ARCH.sway * (0.4 + 0.6 * d) + ARCH.tremble * Math.min(1, over) ** 1.3;
  return steadyLeft > 0 ? a * ARCH.steadyKeep : a;
}

/** The sway as an offset (yaw, pitch radians) at second t: two slow, unrelated waves (deterministic, no random numbers). */
export function swayAt(t, amp, out = { yaw: 0, pitch: 0 }) {
  out.yaw = amp * (Math.sin(t * 2.9 + 0.7) * 0.7 + Math.sin(t * 5.3 + 2.1) * 0.3);
  out.pitch = amp * (Math.sin(t * 2.3 + 4.0) * 0.7 + Math.sin(t * 4.7 + 1.2) * 0.3);
  return out;
}

/** Keep an aim inside the cone. */
export function clampAim(a) {
  a.yaw = a.yaw < -ARCH.yawMax ? -ARCH.yawMax : a.yaw > ARCH.yawMax ? ARCH.yawMax : a.yaw;
  a.pitch = a.pitch < ARCH.pitchMin ? ARCH.pitchMin : a.pitch > ARCH.pitchMax ? ARCH.pitchMax : a.pitch;
  return a;
}

// ----------------------------------------------------------------------------------------------- the targets
/** Where the sliding target is (v) at second t. */
export function movingV(M, t) { return M.vMax * Math.sin(t * 6.283 / M.period); }

/** The ring (1..10) a hit at distance d from the middle of a face of radius r scores; 0 beyond the face. */
export function ringOf(d, r) {
  if (!(d <= r)) return 0;
  const n = ARCH.ringsN, i = Math.floor(d / (r / n));
  return Math.max(1, n - Math.min(n - 1, i));
}

/** Stars for a total (0..3). */
export function starsOf(total, stars = ARCH.stars) { return stars.filter(s => total >= s).length; }

// ----------------------------------------------------------------------------------------------- the flight
/**
 * A new arrow in flight. aim: { yaw, pitch } radians (yaw + = toward +v), draw: 0..1, t0: seconds into the end (for the wind),
 * eye: release height above the line's ground. state: 'fly' | 'hit' (a face) | 'back' | 'ground' | 'side' | 'other' (a target
 * that is not the one being shot at).
 */
export function launch(a, aim, draw, t0, eye = 1.38, out = null) {
  const s = speedFor(draw), cp = Math.cos(aim.pitch);
  const o = a || {};
  o.u = ARCH.muzzle.u; o.v = ARCH.muzzle.v; o.y = eye;
  o.vu = s * cp * Math.cos(aim.yaw); o.vv = s * cp * Math.sin(aim.yaw); o.vy = s * Math.sin(aim.pitch);
  o.dv = 0;
  o.t = 0; o.t0 = t0; o.state = 'fly';
  o.ring = 0; o.hitU = 0; o.hitV = 0; o.hitY = 0; o.hitIdx = -1; o.dist = 0;
  return o;
}

/**
 * Advance an arrow by dt seconds (split into steps of at most 1/120 s). The world, all optional but `targets`:
 *   scene.targets   [{ u, v, r, y (centre height), moving? }]  (a moving target's v is read at the crossing time through vAt(i, t))
 *   scene.active    the index of the target being shot at (its hits score), -1 for none
 *   scene.vAt(i, t) the target's v at second t of the end
 *   scene.back, scene.side   the backstop plane and the side limit (defaults from content/archery.js values given by the caller)
 *   scene.ground(u, v)       ground height above the line's ground (0 when missing)
 * Returns the arrow (state 'fly' while it flies).
 */
export function stepArrow(a, wind, end, dt, scene) {
  let left = dt;
  while (left > 1e-9 && a.state === 'fly') {
    const h = left > 1 / 120 ? 1 / 120 : left;
    left -= h;
    const pu = a.u, pv = a.v, py = a.y;
    // gravity (exact)
    a.y += a.vy * h - 0.5 * ARCH.g * h * h;
    a.vy -= ARCH.g * h;
    a.u += a.vu * h;
    // the wind's push: a sideways drift speed that relaxes toward the wind's speed (exact for a steady wind over the step), on top of
    // the sideways speed the aim gave the arrow (which stays)
    const w = windAt(wind, end, a.t0 + a.t + h * 0.5), e = Math.exp(-ARCH.k * h);
    a.v += a.vv * h + w * h + (a.dv - w) * (1 - e) / ARCH.k;
    a.dv = w + (a.dv - w) * e;
    a.t += h;
    // the target faces: crossing the plane of each one this step
    const T = scene.targets;
    for (let i = 0; i < T.length && a.state === 'fly'; i++) {
      const tg = T[i];
      if (tg.off || !(pu < tg.u && a.u >= tg.u)) continue;
      const f = (tg.u - pu) / ((a.u - pu) || 1e-9), cv = pv + (a.v - pv) * f, cy = py + (a.y - py) * f;
      const tv = tg.moving ? scene.vAt(i, a.t0 + a.t - h * (1 - f)) : tg.v;
      const d = Math.hypot(cv - tv, cy - tg.y);
      if (d <= tg.r) {
        a.u = tg.u; a.v = cv; a.y = cy; a.hitU = tg.u; a.hitV = cv - tv; a.hitY = cy - tg.y; a.hitIdx = i; a.dist = d;
        if (i === scene.active) { a.state = 'hit'; a.ring = ringOf(d, tg.r); } else { a.state = 'other'; a.ring = 0; }
      }
    }
    if (a.state !== 'fly') break;
    // the ground, the backstop and the side limit
    const gr = scene.ground ? scene.ground(a.u, a.v) : 0;
    if (a.u >= scene.back) {
      const f = (scene.back - pu) / ((a.u - pu) || 1e-9);
      a.u = scene.back; a.v = pv + (a.v - pv) * f; a.y = Math.max(gr, py + (a.y - py) * f); a.state = 'back';
    } else if (a.y <= gr) {
      const f = (py - gr) / ((py - a.y) || 1e-9);
      a.u = pu + (a.u - pu) * f; a.v = pv + (a.v - pv) * f; a.y = gr; a.state = 'ground';
    } else if (a.v > scene.side || a.v < -scene.side) {
      a.v = a.v > 0 ? scene.side : -scene.side; a.y = Math.max(gr, a.y); a.state = 'side';
    }
  }
  return a;
}

/** Fly one arrow to its end in one go (tests, the solver). Returns the arrow. */
export function flyAll(aim, draw, wind, end, t0, scene, eye = 1.38, dt = 1 / 60) {
  const a = launch({}, aim, draw, t0, eye);
  let n = 0;
  while (a.state === 'fly' && n++ < 1200) stepArrow(a, wind, end, dt, scene);
  return a;
}

/** The dotted aim arc: n points (u, v, y triples into `out`) of an arrow shot without wind, spaced dt seconds apart. */
export function arc(aim, draw, n, dt, out, eye = 1.38) {
  const s = speedFor(draw), cp = Math.cos(aim.pitch);
  const vu = s * cp * Math.cos(aim.yaw), vv = s * cp * Math.sin(aim.yaw), vy = s * Math.sin(aim.pitch);
  for (let i = 0; i < n; i++) {
    const t = (i + 1) * dt;
    out[i * 3] = ARCH.muzzle.u + vu * t; out[i * 3 + 1] = ARCH.muzzle.v + vv * t; out[i * 3 + 2] = eye + vy * t - 0.5 * ARCH.g * t * t;
  }
  return out;
}

/**
 * The aim that sends an arrow of the given draw through the middle of target `i` for the wind known at the release (a bot's
 * and the tests' helper): a few corrections of yaw and pitch from the flights themselves.
 */
export function solveAim(i, draw, wind, end, t0, scene, eye = 1.38) {
  const tg = scene.targets[i], tv = tg.moving ? scene.vAt(i, t0 + 0.7) : tg.v;
  const aim = { yaw: Math.atan2(tv - ARCH.muzzle.v, tg.u - ARCH.muzzle.u), pitch: 0.03 };
  const sc = { ...scene, active: i };
  for (let k = 0; k < 8; k++) {
    // fly it to the plane only (the arrow is stopped there by a copy of the scene with this target as the backstop)
    const probe = { ...sc, back: tg.u, targets: [] };
    const a = flyAll(clampAim({ ...aim }), draw, wind, end, t0, probe, eye);
    const dist = Math.max(1, tg.u - ARCH.muzzle.u);
    const tvNow = tg.moving ? scene.vAt(i, t0 + a.t) : tg.v;
    aim.yaw += (tvNow - a.v) / dist;
    aim.pitch += (tg.y - a.y) / dist;
  }
  return clampAim(aim);
}
