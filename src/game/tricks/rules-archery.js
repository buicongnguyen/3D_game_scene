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
//
// The last end of every round after the first try is the BALLOON end (./rules-balloons.js): balloons that rise and drift on
// the same wind, each with a sandbag that falls when it pops and breaks the balloons below.
import { BAL, stagePlan, stageMax, arrowPops } from './rules-balloons.js';

export const ARCH = {
  g: 9.81,
  k: 1.6,                 // how fast a light arrow takes up the wind's sideways speed (per second)
  vMin: 14, vMax: 34,     // arrow speed (m/s) at the shortest and the fullest draw
  drawTime: 1.0,          // seconds to a full draw
  minDraw: 0.25,          // releasing before this lets the bow down (no arrow is used)
  yawMax: 0.24, pitchMin: -0.08, pitchMax: 0.16,   // the aim cone (radians): about 14 degrees to each side, 5 down, 9 up
  muzzle: { u: 0.45, v: 0.28 },   // where the arrow leaves the bow (lane units; y is the eye height)
  eye: 1.12,              // the height it leaves at: about Mika's cheek (content/archery.js repeats it: the tests keep the two in step)
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
  arrowsFirst: 4, arrows: 6, arrowsMoving: 4, arrowsFar: 4,   // arrowsFar: Easy's last end, at the far target
  fastPeriod: 7,          // Difficult: the sliding target crosses the lane in this many seconds there and back (content: 10)
  hardWind: 1.25, hardGust: 1.6,   // Difficult: a stronger wind, and gusts that push harder
  easyScale: 1.5,         // the first end of the first try: the target face is this much bigger...
  easyWind: 0.45,         // ...and the wind this much weaker
  guideIdle: 6,           // seconds of doing nothing on the first try before the ghost hand shows how
  guideAim: 0.05,         // radians of aiming that count as "has aimed"
  stars: [70, 160, 240],  // Normal's marks, with its balloon end (content/tricks.js repeats them: the test keeps the two in step)
};

/** A small seeded random source (same numbers every run for the same seed). */
export function rng(seed) {
  let s = (Math.floor(seed) % 2147483646 + 2147483646) % 2147483646 + 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

// ----------------------------------------------------------------------------------------------- the plan of a round
/**
 * The ends of a round, by level ('easy' | 'normal' | 'hard'; true / false are read as Easy / Normal):
 *   Easy       10, 15 and 20 m with no wind at all, the dotted aim arc always drawn (6, 6 and 4 arrows): learn the drop of the arrow.
 *   Normal     the full round: 10, 15 and 20 m in the wind, then a bonus end at the sliding target (6, 6, 6 and 4 arrows).
 *   Difficult  15 and 20 m in a stronger, gustier wind, the sliding target twice as lively, and a last end at a small swinging
 *              gong (6 arrows each); no aim arc, ever: lead a moving target, time the swing, read the gusts.
 * first: the guided first try (three short ends, a gentle wind, no sliding target). Its very first end is an "easy end": the
 * target face is half as big again and the wind half as strong as the rest of that try (end.scale, end.wind), and its dotted
 * aim arc is drawn big (end.bigArc).
 * Every level's round then closes with the balloon end (target 'balloons', level: whose stagePlan; rules-balloons.js); the
 * guided first try has none.
 * Returns { ends: [{ target: 0 | 1 | 2 | 'moving' | 'gong' | 'balloons', arrows, scale, wind, bigArc, period?, level? }], windScale, gust, arc, noArc }.
 */
export function roundPlan(first, level = 'normal') {
  const lv = level === true ? 'easy' : level === 'easy' || level === 'hard' ? level : 'normal';
  const end = (target, arrows, extra) => ({ target, arrows, scale: 1, wind: 1, bigArc: false, ...extra });
  if (first) {
    const n = ARCH.arrowsFirst;
    return { ends: [end(0, n, { scale: ARCH.easyScale, wind: ARCH.easyWind, bigArc: true }), end(1, n), end(2, n)], windScale: 0.5, gust: 1, arc: true, noArc: false };
  }
  const n = ARCH.arrows, bs = stagePlan(lv), bal = end('balloons', bs.arrows, { wind: bs.wind, level: lv });
  if (lv === 'easy') return { ends: [end(0, n), end(1, n), end(2, ARCH.arrowsFar), bal], windScale: 0, gust: 1, arc: true, noArc: false };
  if (lv === 'hard') return { ends: [end(1, n), end(2, n), end('moving', n, { period: ARCH.fastPeriod }), end('gong', n), bal], windScale: ARCH.hardWind, gust: ARCH.hardGust, arc: false, noArc: true };
  return { ends: [end(0, n), end(1, n), end(2, n), end('moving', ARCH.arrowsMoving), bal], windScale: 1, gust: 1, arc: false, noArc: false };
}

/** The most points a plan can give (a ring is 10 at best; the balloon end: its best chains, one arrow each). */
export function maxScore(plan) { return plan.ends.reduce((s, e) => s + (e.target === 'balloons' ? stageMax(stagePlan(e.level)) : e.arrows * 10), 0); }

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
export function makeWind(seed, ends = 4, scale = 1, endMul = null, gust = 1) {
  const R = rng(seed), out = { scale, gust, ends: [] };
  const mags = [[0.7, 1.7], [1.4, 2.9], [2.1, 3.9], [1.2, 2.5]];
  let sign = R() < 0.5 ? -1 : 1;
  for (let e = 0; e < ends; e++) {
    const [lo, hi] = mags[Math.min(e, mags.length - 1)];
    sign = R() < 0.35 ? sign : -sign;           // the wind often turns between ends
    const base = sign * (lo + R() * (hi - lo));
    const gusts = [];
    for (let t = 2 + R() * 3; t < 60; t += 3.5 + R() * 5) gusts.push({ t, dur: 1.4 + R() * 1.6, k: (R() < 0.8 ? 1 : -0.5) * (0.35 + R() * 0.55) });
    out.ends.push({ base, swing: 0.2 + R() * 0.15, per: 6.5 + R() * 4, ph: R() * 6.283, gusts, mul: endMul?.[e] ?? 1 });
  }
  return out;
}

/** The crosswind (m/s, signed) at second t of end `end`. */
export function windAt(wind, end, t) {
  const w = wind.ends[Math.min(end, wind.ends.length - 1)];
  let k = 1 + w.swing * Math.sin(t * 6.283 / w.per + w.ph);
  for (const g of w.gusts) {
    const x = (t - g.t) / g.dur;
    if (x > 0 && x < 1) k += g.k * (wind.gust ?? 1) * Math.sin(x * Math.PI) ** 2;
  }
  const v = w.base * k * wind.scale * (w.mul ?? 1);
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

/** Keep an aim inside the cone (lim: another cone, e.g. the balloon end's BAL.aim, which reaches much higher). */
export function clampAim(a, lim = ARCH) {
  a.yaw = a.yaw < -lim.yawMax ? -lim.yawMax : a.yaw > lim.yawMax ? lim.yawMax : a.yaw;
  a.pitch = a.pitch < lim.pitchMin ? lim.pitchMin : a.pitch > lim.pitchMax ? lim.pitchMax : a.pitch;
  return a;
}

// ----------------------------------------------------------------------------------------------- the targets
/** Where the sliding target is (v) at second t. period: its own, or a livelier one (Difficult). */
export function movingV(M, t, period = M.period) { return M.vMax * Math.sin(t * 6.283 / period); }

/** Where the swinging gong's middle is (v) at second t: a slow pendulum about its hanging place. */
export function gongV(G, t) { return G.v + G.swing * Math.sin(t * 6.283 / G.period); }

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
export function launch(a, aim, draw, t0, eye = ARCH.eye, out = null) {
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
      if (i === scene.active) { a.passV = cv - tv; a.passY = cy - tg.y; a.passD = d; }      // where it crossed the target's plane, from its middle (for "too high")
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

/** Why an arrow that did not score missed: 'high' | 'low' | 'left' | 'right' | 'wind' (pushed that way by a real wind) | 'short' (fell before the target) | 'other' (another target) | null (it scored). v is + to the shooter's right. */
export function missReason(a, windV = 0) {
  if (a.state === 'hit') return null;
  if (a.state === 'other') return 'other';
  if (a.passD === undefined) return a.state === 'ground' ? 'short' : 'low';
  const dy = a.passY, dv = a.passV;
  if (Math.abs(dy) >= Math.abs(dv)) return dy > 0 ? 'high' : 'low';
  if (Math.abs(windV) >= 0.9 && Math.sign(windV) === Math.sign(dv)) return 'wind';
  return dv > 0 ? 'right' : 'left';
}

/**
 * Where an arrow shot with this aim and draw (no wind) crosses the plane of a target (u metres down the lane, v and the face's middle y,
 * radius r): how far from the middle sideways (dv, + = right) and up (dy), and whether that is on the face. For the crosshair that turns green.
 */
export function aimOffset(aim, draw, tg, eye = ARCH.eye) {
  const s = speedFor(Math.max(0.3, draw)), cp = Math.cos(aim.pitch);
  const vu = s * cp * Math.cos(aim.yaw), vv = s * cp * Math.sin(aim.yaw), vy = s * Math.sin(aim.pitch);
  const t = (tg.u - ARCH.muzzle.u) / (vu || 1e-9);
  const v = ARCH.muzzle.v + vv * t, y = eye + vy * t - 0.5 * ARCH.g * t * t;
  const dv = v - (tg.v ?? 0), dy = y - tg.y, d = Math.hypot(dv, dy);
  return { dv, dy, d, on: d <= tg.r };
}

// ----------------------------------------------------------------------------------------------- the first-try guide
/**
 * What a first-time player still has to learn, in order: 'aim' (move the crosshair), 'hold' (draw), 'release' (let go while drawing),
 * then null. done: { aimed, drew, shot } flags; drawing: the string is being drawn now.
 */
export function guideStep(done, drawing = false) {
  if (!done.aimed) return 'aim';
  if (!done.drew && !drawing) return 'hold';
  if (!done.shot) return 'release';
  return null;
}

/** Does the ghost hand show how now? On the first try, after guideIdle seconds with no aiming or drawing, before the first shot, and not while another help is up. */
export function ghostWanted(first, done, idle, busy = false) {
  return !!first && !busy && !done.shot && !done.drew && idle >= ARCH.guideIdle;
}

/** The tutorial's device: 'touch', 'pad' (a gamepad) or 'key' (mouse and keyboard). */
export function guideDevice(touch, lastDevice) { return touch ? 'touch' : lastDevice === 'gamepad' ? 'pad' : 'key'; }

/** The first-try guide's slow motion: the first arrow of the first try flies at this fraction of real time. */
export const SLOWMO = 0.3;
/** Is this arrow the one that flies in slow motion? (the first of the first try's first end) */
export function slowMo(first, shots) { return !!first && shots === 1; }

/** Fly one arrow to its end in one go (tests, the solver). Returns the arrow. */
export function flyAll(aim, draw, wind, end, t0, scene, eye = ARCH.eye, dt = 1 / 60) {
  const a = launch({}, aim, draw, t0, eye);
  let n = 0;
  while (a.state === 'fly' && n++ < 1200) stepArrow(a, wind, end, dt, scene);
  return a;
}

/** The dotted aim arc: n points (u, v, y triples into `out`) of an arrow shot without wind, spaced dt seconds apart. */
export function arc(aim, draw, n, dt, out, eye = ARCH.eye) {
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
export function solveAim(i, draw, wind, end, t0, scene, eye = ARCH.eye, lim = ARCH) {
  const tg = scene.targets[i], tv = tg.moving ? scene.vAt(i, t0 + 0.7) : tg.v;
  const aim = { yaw: Math.atan2(tv - ARCH.muzzle.v, tg.u - ARCH.muzzle.u), pitch: 0.03 };
  const sc = { ...scene, active: i };
  for (let k = 0; k < 8; k++) {
    // fly it to the plane only (the arrow is stopped there by a copy of the scene with this target as the backstop)
    const probe = { ...sc, back: tg.u, targets: [] };
    const a = flyAll(clampAim({ ...aim }, lim), draw, wind, end, t0, probe, eye);
    const dist = Math.max(1, tg.u - ARCH.muzzle.u);
    const tvNow = tg.moving ? scene.vAt(i, t0 + a.t) : tg.v;
    aim.yaw += (tvNow - a.v) / dist;
    aim.pitch += (tg.y - a.y) / dist;
  }
  return clampAim(aim, lim);
}

// ----------------------------------------------------------------------------------------------- the balloon end
/**
 * Advance an arrow of the balloon end by dt seconds: it flies as any arrow (the scene has no target faces then), and every
 * balloon of stage S (rules-balloons.js) whose plane it crosses inside its hit circle pops; the arrow flies on to the ground,
 * the backstop plane or the side limit. root: the arrow's number in the end (the chain it starts). Returns how many it popped.
 */
export function stepArrowBalloons(a, wind, end, dt, scene, S, root, events = null) {
  let left = dt, n = 0;
  while (left > 1e-9 && a.state === 'fly') {
    const h = left > 1 / 120 ? 1 / 120 : left;
    left -= h;
    const pu = a.u, pv = a.v, py = a.y;
    stepArrow(a, wind, end, h, scene);
    n += arrowPops(S, pu, pv, py, a.u, a.v, a.y, root, events);
  }
  return n;
}

/** The aim that sends a full-draw arrow through a balloon where it hangs now (a bot's and the QA script's helper). */
export function solveBalloon(b, draw, wind, end, t0, eye = ARCH.eye) {
  return solveAim(0, draw, wind, end, t0, { targets: [{ u: b.u, v: b.sv, y: b.sy, r: b.r }], back: 99, side: 99 }, eye, BAL.aim);
}
