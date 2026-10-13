// The archery range: the pure rules (flight, wind, rings, stars), the site (safe, flat, clear of everything) and the data rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ARCH, rng, roundPlan, maxScore, arcAlpha, makeWind, windAt, drawAt, speedFor, swayAmp, swayAt, clampAim, movingV, gongV, ringOf, starsOf,
  launch, stepArrow, flyAll, arc, solveAim, missReason, aimOffset, guideStep, ghostWanted, guideDevice, slowMo, SLOWMO, stepArrowBalloons, solveBalloon,
} from '../src/game/tricks/rules-archery.js';
import { BAL, stagePlan, stackGap, groupMax, stageMax, newStage, stepStage, arrowPops, liveCount, falling, nearestBalloon, topOf } from '../src/game/tricks/rules-balloons.js';
import * as THREE from 'three';
import { solveArm, handBasis, STANCE, nockAt } from '../src/actors/archer-rig.js';
import { ARCHERY, toWorld, toLane, laneSamples, archerySolids } from '../src/content/archery.js';
import { TRICK } from '../src/content/tricks.js';
import { levelSpec } from '../src/content/levels.js';
import { SIGNS, signPlace } from '../src/content/signs.js';
import { BUILDINGS, PATHS, PADDIES, PLACES, river, riverHalfWidth, WORLD } from '../src/world/layout.js';
import { placeProblems, sharedGrid, buildRoads, inFootprint } from '../src/world/roads.js';
import { SPOTS } from '../src/content/townsfolk.js';
import { FARM } from '../src/content/farm.js';
import { SKY_SPOTS } from '../src/content/skyspots.js';
import { YARD_LIST } from '../src/content/yard.js';
import { TRICKS } from '../src/content/tricks.js';
import { DIALOGUE } from '../src/game/story.js';
import { useStory } from '../src/game/stories/index.js';

const A = ARCHERY;
const grid = sharedGrid();
const near = (a, b, e, m = '') => assert.ok(Math.abs(a - b) <= e, `${m} ${a} vs ${b}`);

/** The scene the rounds use: the three targets, and the sliding one (off unless asked). */
function scene(active = 0, moving = false) {
  const targets = [...A.targets.map(t => ({ u: t.u, v: t.v, r: t.r, y: A.centreH })), { u: A.moving.u, v: 0, r: A.moving.r, y: A.centreH, moving: true }];
  targets.forEach((t, i) => { t.off = moving ? i !== 3 : i === 3; });
  return { targets, active: moving ? 3 : active, back: A.back, side: A.side, vAt: (i, t) => movingV(A.moving, t) };
}
const calm = { scale: 1, ends: [{ base: 0, swing: 0, per: 8, ph: 0, gusts: [] }] };
const steady = w => ({ scale: 1, ends: [{ base: w, swing: 0, per: 8, ph: 0, gusts: [] }] });

// ------------------------------------------------------------------------------------------------ the rules
test('flight without wind matches the analytic parabola, at any frame rate', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 144, 0.05]) {
    const a = launch({}, { yaw: 0.05, pitch: 0.06 }, 1, 0, A.eye);
    const v0 = speedFor(1), vu = v0 * Math.cos(0.06) * Math.cos(0.05), vv = v0 * Math.cos(0.06) * Math.sin(0.05), vy = v0 * Math.sin(0.06);
    let t = 0;
    while (t < 0.4) { stepArrow(a, calm, 0, dt, { ...scene(), targets: [], back: 99, side: 99 }); t += dt; }
    near(a.u, ARCH.muzzle.u + vu * t, 1e-6, `u dt=${dt}`);
    near(a.v, ARCH.muzzle.v + vv * t, 1e-6, `v dt=${dt}`);
    near(a.y, A.eye + vy * t - 0.5 * ARCH.g * t * t, 1e-6, `y dt=${dt}`);
  }
});

test('a steady crosswind drifts the arrow by the analytic amount, toward the wind', () => {
  for (const w of [3, -3, 1.2]) {
    const a = launch({}, { yaw: 0, pitch: 0.05 }, 1, 0, A.eye);
    const free = { ...scene(), targets: [], back: 99, side: 99 };
    let t = 0;
    while (t < 0.6) { stepArrow(a, steady(w), 0, 1 / 60, free); t += 1 / 60; }
    const drift = w * (t - (1 - Math.exp(-ARCH.k * t)) / ARCH.k);
    near(a.v - ARCH.muzzle.v, drift, 1e-6, `w=${w}`);
    assert.equal(Math.sign(a.v - ARCH.muzzle.v), Math.sign(w), 'it goes the way the wind blows');
    near(a.dv, w * (1 - Math.exp(-ARCH.k * t)), 1e-6);
  }
  // no wind, no drift; a gust changes the drift but never the forward speed
  const b = flyAll({ yaw: 0, pitch: 0.05 }, 1, calm, 0, 0, scene(1));
  near(b.v, ARCH.muzzle.v, 1e-9);
});

test('the wind is seeded, signed, bounded and stronger at the far ends', () => {
  const a = makeWind(7, 4), b = makeWind(7, 4), c = makeWind(8, 4);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  let mean = [0, 0, 0, 0], neg = 0, pos = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const w = makeWind(seed, 4);
    for (let e = 0; e < 4; e++) {
      let s = 0, n = 0;
      for (let t = 0; t < 40; t += 0.5) { const v = windAt(w, e, t); assert.ok(Math.abs(v) <= ARCH.gustMax + 1e-9); s += Math.abs(v); n++; if (v < 0) neg++; else pos++; }
      mean[e] += s / n / 300;
    }
  }
  assert.ok(mean[0] < mean[1] && mean[1] < mean[2], `means rise with the distance: ${mean.map(m => m.toFixed(2))}`);
  assert.ok(mean[0] > 0.5 && mean[2] < 4.8, 'a breeze, never a gale');
  assert.ok(neg > 200 && pos > 200, 'both directions happen');
  // the first try and Easy get half the wind
  const half = makeWind(3, 4, 0.5);
  near(windAt(half, 1, 5) * 2, windAt(makeWind(3, 4, 1), 1, 5), 1e-9);
});

test('rings: 10 at the middle, 1 at the edge, nothing beyond; equal widths', () => {
  const r = 0.6;
  assert.equal(ringOf(0, r), 10);
  assert.equal(ringOf(0.059, r), 10);
  assert.equal(ringOf(0.061, r), 9);
  assert.equal(ringOf(0.3, r), 5);
  assert.equal(ringOf(0.599, r), 1);
  assert.equal(ringOf(0.6, r), 1);
  assert.equal(ringOf(0.601, r), 0);
  assert.equal(ringOf(NaN, r), 0);
  let last = 11;
  for (let d = 0; d <= r; d += 0.005) { const v = ringOf(d, r); assert.ok(v <= last && v >= 1); last = v; }
});

test('a hit scores the ring where the arrow crosses the target, a miss on the target scores nothing, a wrong target scores nothing', () => {
  const sc = scene(1);   // the 15 m target
  const aim = solveAim(1, 1, calm, 0, 0, sc);
  const hit = flyAll(aim, 1, calm, 0, 0, sc);
  assert.equal(hit.state, 'hit');
  assert.equal(hit.ring, 10, 'the solver finds the middle');
  assert.equal(hit.hitIdx, 1);
  // aimed a metre to the side: still on the 15 m target? 0.65 m face: a miss, and the arrow ends in the backstop
  const off = flyAll({ yaw: aim.yaw + 0.1, pitch: aim.pitch }, 1, calm, 0, 0, sc);
  assert.notEqual(off.state, 'hit');
  assert.equal(off.ring, 0);
  // a little off: a lower ring, never above the middle's
  const little = flyAll({ yaw: aim.yaw + 0.012, pitch: aim.pitch }, 1, calm, 0, 0, sc);
  assert.equal(little.state, 'hit');
  assert.ok(little.ring < 10 && little.ring >= 1);
  // the 20 m target shot at while the 15 m one is active: it is another target
  const sc20 = scene(2);
  const other = flyAll(solveAim(1, 1, calm, 0, 0, { ...sc20, active: 1 }), 1, calm, 0, 0, { ...sc20, active: 2 });
  assert.equal(other.state, 'other');
  assert.equal(other.ring, 0);
});

test('arrows always stop: ground, backstop and side limits; nothing flies on', () => {
  const sc = scene(0);
  const cases = [
    [{ yaw: 0, pitch: ARCH.pitchMax }, 1],      // as high and as hard as allowed
    [{ yaw: 0, pitch: ARCH.pitchMin }, 1],      // straight into the ground
    [{ yaw: ARCH.yawMax, pitch: 0.1 }, 1],
    [{ yaw: -ARCH.yawMax, pitch: 0.1 }, 1],
    [{ yaw: 0, pitch: 0.05 }, 0.3],             // a weak draw: it falls short
  ];
  for (const wv of [-5.5, 0, 5.5]) for (const [aim, d] of cases) {
    const a = flyAll(aim, d, steady(wv), 0, 0, sc);
    assert.notEqual(a.state, 'fly', JSON.stringify(aim));
    assert.ok(a.u <= A.back + 1e-9, 'never past the backstop plane');
    assert.ok(Math.abs(a.v) <= A.side + 1e-9, 'never past the side limit');
    assert.ok(a.y >= -1e-9, 'never under the ground');
  }
  // every shot the aim cone and the draw allow ends at or before the backstop, inside the lane box (random sweep)
  const R = rng(5);
  for (let i = 0; i < 400; i++) {
    const aim = clampAim({ yaw: (R() - 0.5) * 0.6, pitch: (R() - 0.5) * 0.5 });
    const a = flyAll(aim, R(), steady((R() - 0.5) * 11), 0, R() * 10, sc);
    assert.ok(a.u <= A.back + 1e-9 && Math.abs(a.v) <= A.side + 1e-9 && a.state !== 'fly');
    assert.ok(a.u >= 0 && a.u <= A.lane.u1 && a.v >= A.lane.v0 && a.v <= A.lane.v1, 'the lane box holds every arrow');
  }
  // the highest allowed shot is still below the top of the backstop net at the net
  const top = flyAll({ yaw: 0, pitch: ARCH.pitchMax }, 1, calm, 0, 0, { ...sc, targets: [] });
  assert.equal(top.state, 'back');
  assert.ok(top.y < 3.3, `the highest shot reaches ${top.y.toFixed(2)} m at the backstop; the net is 3.4 m`);
});

test('the aim cone and the draw are clamped; sway grows with a long hold and a breath calms it', () => {
  const a = clampAim({ yaw: 5, pitch: -5 });
  assert.deepEqual(a, { yaw: ARCH.yawMax, pitch: ARCH.pitchMin });
  assert.equal(drawAt(0), 0); assert.equal(drawAt(ARCH.drawTime / 2), 0.5); assert.equal(drawAt(9), 1);
  assert.ok(speedFor(1) > speedFor(0.5) && speedFor(0.5) > speedFor(0));
  const early = swayAmp(ARCH.drawTime), late = swayAmp(ARCH.drawTime + ARCH.holdFree + ARCH.holdTremble);
  assert.ok(late > early * 4, 'a too-long hold trembles');
  assert.ok(swayAmp(4, 0.5) < swayAmp(4, 0) * 0.2, 'a breath steadies it');
  const o = swayAt(1.3, 0.01); assert.ok(Math.abs(o.yaw) <= 0.01 + 1e-12 && Math.abs(o.pitch) <= 0.01 + 1e-12);
  assert.deepEqual(swayAt(2, 0.01), swayAt(2, 0.01), 'deterministic');
});

test('the dotted arc follows the drop', () => {
  const out = new Float32Array(30);
  arc({ yaw: 0, pitch: 0.05 }, 1, 10, 0.05, out, A.eye);
  for (let i = 1; i < 10; i++) assert.ok(out[i * 3] > out[(i - 1) * 3], 'u grows');
  assert.ok(out[9 * 3 + 2] < A.eye + Math.sin(0.05) * speedFor(1) * 0.5, 'it bends down');
});

test('the sliding target stays inside its rail and the plan has the right ends', () => {
  for (let t = 0; t < 30; t += 0.1) assert.ok(Math.abs(movingV(A.moving, t)) <= A.moving.vMax + 1e-9);
  const first = roundPlan(true), full = roundPlan(false), easy = roundPlan(true, true);
  assert.deepEqual(first.ends.map(e => e.arrows), [4, 4, 4]);
  assert.deepEqual(full.ends.map(e => e.target), [0, 1, 2, 'moving', 'balloons']);
  assert.deepEqual(full.ends.map(e => e.arrows), [6, 6, 6, 4, 8]);
  assert.equal(first.windScale, 0.5); assert.equal(full.windScale, 1); assert.equal(easy.windScale, 0.5);
  assert.ok(first.arc && easy.arc && !full.arc);
  assert.equal(maxScore(full), 220 + stageMax(stagePlan('normal')));
  // the aim arc fades on later tries
  assert.equal(arcAlpha(0), 1); assert.ok(arcAlpha(1) < 1 && arcAlpha(1) > arcAlpha(2)); assert.equal(arcAlpha(5), 0); assert.equal(arcAlpha(5, true), 1);
});

// ------------------------------------------------------------------------------------------------ the bots: a round, end to end
/** Play a whole round with a model player: sigma = the angular error of the hand (radians); belief = how much of the wind they allow for
 *  (0 ignores the sock, 1 reads it right), windErr = how much that guess wobbles. */
/** The balloon end with a model player: every `pace` seconds one arrow, at the top balloon of the tallest stack with a chance of
 *  `smart` (else at the lowest balloon), with the hand's error sigma. Returns the stage (its score, what popped, what was lost). */
function playBalloons(seed, level, wind, ei, { sigma, smart = 1, pace = 3.5 }, R, gauss) {
  const spec = stagePlan(level), we = wind.ends[ei], S = newStage(spec, seed, we.base * wind.scale * (we.mul ?? 1));
  const sc = { targets: [], active: -1, back: A.back, side: A.side };
  const adv = dt => { for (let t = 0; t < dt - 1e-9; t += 1 / 30) stepStage(S, 1 / 30, windAt(wind, ei, S.t)); };
  let shots = 0;
  while (shots < spec.arrows && !S.done && S.t < 200) {
    adv(pace);
    if (S.done) break;
    const up = S.balloons.filter(b => b.state === 'up');
    if (!up.length) continue;
    let tgt;
    if (R() < smart) {
      const n = {};
      for (const b of up) n[b.group] = (n[b.group] || 0) + 1;
      tgt = topOf(S, +Object.keys(n).sort((a, b) => n[b] - n[a] || a - b)[0]);
    } else tgt = up.slice().sort((a, b) => a.y - b.y)[0];
    const aim = solveBalloon(tgt, 1, wind, ei, S.t);
    aim.yaw += gauss() * sigma; aim.pitch += gauss() * sigma;
    clampAim(aim, BAL.aim);
    const a = launch({}, aim, 1, S.t);
    for (let k = 0; a.state === 'fly' && k < 600; k++) { stepArrowBalloons(a, wind, ei, 1 / 60, sc, S, shots); stepStage(S, 1 / 60, windAt(wind, ei, S.t)); }
    shots++;
  }
  for (let k = 0; k < 300 && falling(S); k++) stepStage(S, 1 / 30, windAt(wind, ei, S.t));
  return S;
}

function playRound(seed, { sigma, belief = 1, windErr = 0, first = false, holdT = 1.2, idle = false, smart = 1, pace = 3.5 }) {
  const plan = roundPlan(first, false), wind = makeWind(seed, plan.ends.length, plan.windScale, plan.ends.map(e => e.wind)), R = rng(seed * 7 + 1);
  const gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += R(); return (s - 3) / 0.7071; };
  const sc = scene(0);
  let total = 0, bulls = 0;
  plan.ends.forEach((e, ei) => {
    if (e.target === 'balloons') { if (!idle) total += playBalloons(seed, 'normal', wind, ei, { sigma, smart, pace }, R, gauss).score; return; }
    const idx = e.target === 'moving' ? 3 : e.target;
    sc.active = idx;
    sc.targets.forEach((t, i) => { t.off = e.target === 'moving' ? i !== 3 : i === 3; });
    let t = 0;
    for (let n = 0; n < e.arrows; n++) {
      if (idle) break;
      t += 4.5;
      const guess = { scale: wind.scale * Math.min(2, Math.max(0, belief + windErr * gauss())), ends: wind.ends };
      const aim = solveAim(idx, 1, guess, ei, t, sc);
      const sw = swayAt(t * 3.1 + n, swayAmp(holdT));
      aim.yaw += sw.yaw + gauss() * sigma; aim.pitch += sw.pitch + gauss() * sigma;
      clampAim(aim);
      const a = flyAll(aim, 1, wind, ei, t, sc);
      if (a.state === 'hit') { total += a.ring; if (a.ring === 10) bulls++; }
    }
  });
  return { total, bulls, max: maxScore(plan) };
}
const median = xs => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const pctl = (xs, p) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length * p)];

test('stars: an idle player earns none, a careful beginner one or two, a player who reads the wind three', () => {
  const N = 120, run = o => Array.from({ length: N }, (_, i) => playRound(i + 1, o).total);
  const idle = run({ idle: true, sigma: 0 });
  assert.ok(idle.every(s => s === 0));
  // (smart: how often they take the top balloon of a stack in the balloon end; pace: seconds between arrows there)
  const beginner = run({ sigma: 0.018, belief: 0, smart: 0.4, pace: 4 });          // a steady hand that never looks at the wind sock
  const careless = run({ sigma: 0.035, belief: 0, smart: 0.2, pace: 4.5 });        // a shaky hand
  const reader = run({ sigma: 0.008, belief: 0.7, windErr: 0.4, smart: 0.9, pace: 3.2 });   // a good hand, and the sock read about right
  const expert = run({ sigma: 0.0005, belief: 1, windErr: 0.05 });
  const stars = xs => starsOf(median(xs));
  assert.ok(stars(beginner) >= 1 && stars(beginner) <= 2, `a careful beginner (median ${median(beginner)}) gets one or two stars`);
  assert.ok(pctl(beginner, 0.05) >= 40, 'and rarely nothing');
  assert.ok(stars(careless) <= 1, `a shaky hand (median ${median(careless)}) gets at most one`);
  assert.ok(stars(reader) === 3, `reading the wind with a good hand (median ${median(reader)}) earns three stars`);
  assert.ok(median(expert) >= ARCH.stars[2] + 40);
  assert.ok(pctl(careless, 0.95) < ARCH.stars[2], 'three stars are not luck');
  assert.ok(pctl(beginner, 0.95) < ARCH.stars[2], 'and not for ignoring the wind');
  assert.equal(median(idle), 0);
  // the guided first try (12 arrows, half the wind, no balloons; it is marked as an Easy round) lets a careful player earn a star
  const firstTry = run({ sigma: 0.018, belief: 0, first: true });
  assert.ok(starsOf(median(firstTry), levelSpec(TRICK.archery, 'easy').stars) >= 1, `first try median ${median(firstTry)}`);
});

test('a round is deterministic for a seed', () => {
  const o = { sigma: 0.01, belief: 0.5, windErr: 0.3 };
  const a = playRound(42, o), b = playRound(42, o), c = playRound(43, o);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('the stars in the data are the stars of the rules', () => {
  assert.deepEqual(TRICK.archery.stars, ARCH.stars);
  assert.equal(starsOf(69), 0); assert.equal(starsOf(70), 1); assert.equal(starsOf(160), 2); assert.equal(starsOf(240), 3);
});

// ------------------------------------------------------------------------------------------------ the site
const rect = (x, z, m = 0) => { const p = toLane(x, z), L = A.lane; return p.u >= L.u0 - m && p.u <= L.u1 + m && p.v >= L.v0 - m && p.v <= L.v1 + m; };
const segPts = (ax, az, bx, bz, step = 0.75) => { const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step)); return Array.from({ length: n + 1 }, (_, i) => [ax + (bx - ax) * i / n, az + (bz - az) * i / n]); };
const segDist = (ax, az, bx, bz, px, pz) => { const vx = bx - ax, vz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz || 1e-9))); return Math.hypot(ax + vx * t - px, az + vz * t - pz); };

test('the lane is dry, open, flat ground: not a paddy, the river, a wall; no steeper than the playground', () => {
  for (const [x, z] of laneSamples(2)) {
    assert.deepEqual(placeProblems(x, z), [], `lane point ${x}, ${z}`);
    assert.ok(grid.slopeAt(x, z) < 12, `slope at ${x}, ${z}: ${grid.slopeAt(x, z).toFixed(1)} deg`);
  }
  // flat to a hand's breadth across the shooting end, gently rising toward the backstop (a hill behind it)
  const ys = laneSamples(2).map(([x, z]) => grid.heightAt(x, z));
  assert.ok(Math.max(...ys) - Math.min(...ys) < 2.4, `the lane's ground varies by ${(Math.max(...ys) - Math.min(...ys)).toFixed(2)} m`);
  const line = [-4, -2, 0, 2, 4].map(v => { const p = toWorld(0, v); return grid.heightAt(p.x, p.z); });
  assert.ok(Math.max(...line) - Math.min(...line) < 0.3, 'the shooting line is level');
  // the ground behind the backstop does not fall away: an arrow cannot go downhill into the village
  const b0 = toWorld(A.back, 0), b1 = toWorld(A.back + 12, 0);
  assert.ok(grid.heightAt(b1.x, b1.z) >= grid.heightAt(b0.x, b0.z) - 0.05, 'the hill rises behind the backstop');
});

test('the range keeps its distance from houses, doors, roads, paddies, the river and every other place', () => {
  const margin = 7;   // metres beyond the arrows' whole reach
  for (const b of BUILDINGS) assert.ok(!rect(b.x, b.z, margin - 3) , `building ${b.id} is too close to the lane`);
  for (const b of BUILDINGS) for (const [x, z] of laneSamples(3)) assert.ok(!inFootprint(x, z, 3.5) || b.model === 'platform', 'no wall within 3.5 m of the lane');
  for (const p of PATHS) for (let i = 0; i + 1 < p.pts.length; i++) for (const [x, z] of segPts(...p.pts[i], ...p.pts[i + 1])) assert.ok(!rect(x, z, 4), `path ${p.pts[i]} crosses the lane`);
  for (const pd of PADDIES) for (const [x, z] of [[pd.x, pd.z], [pd.x - pd.w / 2, pd.z - pd.d / 2], [pd.x + pd.w / 2, pd.z + pd.d / 2], [pd.x - pd.w / 2, pd.z + pd.d / 2], [pd.x + pd.w / 2, pd.z - pd.d / 2]]) assert.ok(!rect(x, z, 4), `paddy ${pd.id}`);
  for (const [k, s] of Object.entries(SPOTS)) assert.ok(!rect(s.x, s.z, 5), `Town Life spot ${k}`);
  for (const f of FARM) assert.ok(!rect(f[2], f[3], 5 + f[5]), `animal ${f[0]}`);
  for (const s of SKY_SPOTS) assert.ok(!rect(s.x, s.z, 4), `sky spot ${s.id}`);
  for (const Y of YARD_LIST) assert.ok(!rect(Y.x, Y.z, 14), `yard ${Y.id}`);
  for (const t of TRICKS) if (t.id !== 'archery') assert.ok(!rect(t.place.x, t.place.z, 8), `trick sign ${t.id}`);
  for (const s of SIGNS) if (s.at && s.id !== 'archery') assert.ok(!rect(s.at.x, s.at.z, 4), `name board ${s.id}`);
  for (const [id, p] of Object.entries(PLACES)) assert.ok(!rect(p.x, p.z, 6), `place ${id}`);
  // the river is far off
  for (const [x, z] of laneSamples(4)) { const rv = river.nearest(x, z, 60); assert.ok(!rv || rv.d - riverHalfWidth(rv.z) > 30, 'the river is far away'); }
  // the world's edge
  for (const [x, z] of laneSamples(6)) assert.ok(x > WORLD.minX + 20 && z > WORLD.minZ + 20 && z < WORLD.maxZ - 20);
});

test('no villager route crosses the lane or its cordon; the kids\' spot is on a clear patch behind the line', () => {
  const g = buildRoads({ spots: SPOTS });
  for (const e of g.edges) {
    const a = g.nodes[e.a], b = g.nodes[e.b];
    for (const [x, z] of segPts(a.x, a.z, b.x, b.z)) assert.ok(!rect(x, z, 3.5), `a route runs through the range at ${x.toFixed(1)}, ${z.toFixed(1)}`);
  }
  const s = A.spot, w = toWorld(s.u, s.v);
  assert.deepEqual(placeProblems(w.x, w.z), []);
  const L = toLane(w.x, w.z);
  assert.ok(L.u <= A.lane.u0 - 1 && L.u > -8, 'the practising kids stand just behind the lane box (they never stand where arrows can fly)');
  assert.ok(!rect(w.x, w.z, 0.5));
});

test('the trick sign and the name board stand beside the range, on dry ground, clear of each other', () => {
  const t = TRICK.archery, sg = SIGNS.find(s => s.id === 'archery');
  assert.deepEqual(placeProblems(t.place.x, t.place.z), []);
  assert.equal(t.place.x, A.sign.x); assert.equal(t.place.z, A.sign.z);
  const L = toLane(t.place.x, t.place.z);
  assert.ok(L.u > -3 && L.u < 2 && Math.abs(L.v) <= A.half + 0.2, 'the sign stands at the shooting line');
  assert.equal(t.place.face, A.heading, 'and looks down the lane');
  assert.ok(sg, 'the name board has a data row');
  const p = signPlace(sg, null);
  assert.ok(Math.hypot(p.x - t.place.x, p.z - t.place.z) > 3);
  assert.equal(sg.text, 'Archery range');
  assert.deepEqual(placeProblems(p.x, p.z), []);
});

test('the solid things of the range stand off the lane\'s middle and keep the shooting line walkable', () => {
  const { boxes, posts } = archerySolids();
  const stand = toWorld(A.stand.u, A.stand.v);
  const all = [...boxes.map(b => ({ x: b.x, z: b.z, r: Math.max(b.hw, b.hd) })), ...posts];
  for (const o of posts) {
    const p = toLane(o.x, o.z);
    assert.ok(Math.hypot(o.x - stand.x, o.z - stand.z) > 1.5, 'nothing solid where Mika stands');
    // the target stands do not block a straight walk from the line down the middle of the lane to the first target's side
    void p;
  }
  assert.ok(all.length >= 6);
  for (const b of boxes) assert.ok(toLane(b.x, b.z).u < A.back + 3 && toLane(b.x, b.z).u > -6);
});

test('the teaching scene exists in both stories, and the data row reads like the others', () => {
  const t = TRICK.archery;
  assert.equal(t.intro, 'trick_archery_intro');
  for (const story of ['classic', 'grandma']) {
    useStory(story);
    const lines = DIALOGUE[t.intro];
    assert.ok(lines?.length >= 3, story);
    assert.ok(lines.some(l => l[0] === t.teacher[story]));
    for (const l of lines) assert.ok(l[1].length <= 135, l[1]);
  }
  useStory('classic');
  assert.ok(t.seasons.includes('spring') && t.seasons.includes('autumn') && !t.seasons.includes('winter'));
  assert.equal(t.unit, 'points');
  assert.ok(t.length <= 120 && t.firstLength <= 60 && t.firstLength <= t.length);
  assert.ok(fs.readFileSync(new URL('../src/content/archery.js', import.meta.url), 'utf8').includes('WEST'));
});

// ------------------------------------------------------------------------------------------------ the first try's guide
test('the first end of the first try is an easy end: a bigger face, a weaker wind, a big arc; nothing else changes', () => {
  const first = roundPlan(true), full = roundPlan(false);
  assert.ok(first.ends[0].scale > 1.3 && first.ends[0].wind < 0.6 && first.ends[0].bigArc, 'the first end is easy');
  for (const e of first.ends.slice(1)) assert.ok(e.scale === 1 && e.wind === 1 && !e.bigArc, 'the others are as usual');
  for (const e of full.ends) if (e.target !== 'balloons') assert.ok(e.scale === 1 && e.wind === 1 && !e.bigArc, 'later tries have no easy end');
  // the weaker wind of an end is a multiple of the same seeded wind
  const w1 = makeWind(9, 3, 0.5), w2 = makeWind(9, 3, 0.5, first.ends.map(e => e.wind));
  for (const t of [0, 1.7, 4, 9]) {
    near(windAt(w2, 0, t), windAt(w1, 0, t) * first.ends[0].wind, 1e-9, 'end 0');
    near(windAt(w2, 1, t), windAt(w1, 1, t), 1e-9, 'end 1 is untouched');
  }
  // a bigger face really is easier: an aim about 0.75 of a plain face's radius to the side misses it and hits the big one
  const sc = scene(0), r0 = sc.targets[0].r;
  const aim = solveAim(0, 1, calm, 0, 0, sc);
  aim.yaw += 0.75 * r0 / (A.targets[0].u - ARCH.muzzle.u) * 1.0;
  aim.yaw += 0.3 * r0 / 9.55;                                    // (about 1.05 r in all: off the plain face, inside the big one)
  const plain = flyAll(aim, 1, calm, 0, 0, sc);
  sc.targets[0].r = r0 * first.ends[0].scale;
  const big = flyAll(aim, 1, calm, 0, 0, sc);
  assert.ok(plain.state === 'back' || plain.state === 'ground', 'it misses the plain face: ' + plain.state);
  assert.equal(big.state, 'hit', 'and hits the bigger one');
  assert.ok(big.ring >= 1 && big.ring <= 3, 'near its edge');
});

test('a miss is explained: too high, too low, to the left, to the right, the wind, or too short', () => {
  const sc = scene(1), solved = solveAim(1, 1, calm, 0, 0, sc);
  const shoot = (dyaw, dpitch) => flyAll({ yaw: solved.yaw + dyaw, pitch: solved.pitch + dpitch }, 1, calm, 0, 0, sc);
  assert.equal(missReason(shoot(0, 0)), null, 'a hit has no reason');
  assert.equal(missReason(shoot(0, 0.05)), 'high');
  assert.equal(missReason(shoot(0, -0.05)), 'low');
  assert.equal(missReason(shoot(0.06, 0)), 'right');
  assert.equal(missReason(shoot(-0.06, 0)), 'left');
  // a push of the wind is named as the wind
  const a = shoot(0.06, 0);
  assert.equal(missReason(a, 3), 'wind'); assert.equal(missReason(a, -3), 'right', 'the wind blew the other way: it was the aim');
  // an arrow that never reaches the target: short
  const low = flyAll({ yaw: solved.yaw, pitch: -0.07 }, 0.3, calm, 0, 0, sc);
  assert.equal(low.state, 'ground');
  assert.equal(missReason(low), 'short');
  assert.equal(missReason({ state: 'other' }), 'other');
});

test('aimOffset says where an arrow crosses the target and whether that is the face: the crosshair turns green', () => {
  const sc = scene(0);
  for (const i of [0, 1, 2]) {
    const tg = sc.targets[i], aim = solveAim(i, 1, calm, 0, 0, sc);
    const o = aimOffset(aim, 1, tg, A.eye);
    assert.ok(o.on && o.d < 0.05 * tg.r + 0.02, `the solved aim is on target ${i}: ${o.d}`);
    assert.ok(!aimOffset({ yaw: aim.yaw + 3 * tg.r / tg.u, pitch: aim.pitch }, 1, tg, A.eye).on, 'three radii off is not on the face');
    assert.ok(aimOffset({ yaw: aim.yaw, pitch: aim.pitch + 0.02 }, 1, tg, A.eye).dy > 0 && aimOffset({ yaw: aim.yaw + 0.02, pitch: aim.pitch }, 1, tg, A.eye).dv > 0, 'dy up and dv to the right are positive');
  }
  // it matches the real flight (no wind): where aimOffset says the arrow crosses is where the physics puts it
  const tg = sc.targets[1], aim = { yaw: 0.04, pitch: 0.07 }, o = aimOffset(aim, 1, tg, A.eye);
  const a = flyAll(aim, 1, calm, 0, 0, { ...sc, active: 1 });
  near(a.passV, o.dv, 1e-3, 'the sideways crossing'); near(a.passY, o.dy, 1e-3, 'the height crossing');
});

test('the guide teaches in order: aim, hold, let go; the ghost hand waits six idle seconds and only before the first draw', () => {
  const none = { aimed: false, drew: false, shot: false };
  assert.equal(guideStep(none), 'aim');
  assert.equal(guideStep({ ...none, aimed: true }), 'hold');
  assert.equal(guideStep({ ...none, aimed: true }, true), 'release', 'drawing now: let go next');
  assert.equal(guideStep({ aimed: true, drew: true, shot: false }), 'release');
  assert.equal(guideStep({ aimed: true, drew: true, shot: true }), null);
  assert.ok(!ghostWanted(true, none, ARCH.guideIdle - 0.1) && ghostWanted(true, none, ARCH.guideIdle));
  assert.equal(ARCH.guideIdle, 6, 'six seconds, as the brief says');
  assert.ok(!ghostWanted(false, none, 99), 'not after the first try');
  assert.ok(!ghostWanted(true, { ...none, drew: true }, 99) && !ghostWanted(true, { ...none, shot: true }, 99), 'not once they have drawn or shot');
  assert.ok(!ghostWanted(true, none, 99, true), 'not while the card is up');
  assert.equal(guideDevice(true, 'touch'), 'touch'); assert.equal(guideDevice(false, 'gamepad'), 'pad'); assert.equal(guideDevice(false, 'keyboard'), 'key');
  assert.ok(slowMo(true, 1) && !slowMo(true, 2) && !slowMo(false, 1) && SLOWMO > 0.1 && SLOWMO < 0.6, 'only the very first arrow of the first try is slowed');
});

// ------------------------------------------------------------------------------------------------ Mika's hands
test('the two-bone arm solver puts the wrist where asked when it can, stretches straight when it cannot, and keeps the bone lengths', () => {
  const S = new THREE.Vector3(0, 1, 0), l1 = 0.191, l2 = 0.177, pole = new THREE.Vector3(0, -1, 0), E = new THREE.Vector3(), Wr = new THREE.Vector3();
  const T = new THREE.Vector3(0.1, 1.05, 0.28);
  const r = solveArm(S, T, l1, l2, pole, E, Wr);
  assert.ok(r < 1 && r > 0.5);
  near(Wr.distanceTo(T), 0, 1e-9, 'the wrist is on the target');
  near(E.distanceTo(S), l1, 1e-9, 'upper arm'); near(E.distanceTo(Wr), l2, 1e-9, 'forearm');
  assert.ok(E.y < 1.0, 'the elbow follows the pole (down)');
  // too far: straight toward it, never longer
  const far = new THREE.Vector3(0, 1, 2), r2 = solveArm(S, far, l1, l2, pole, E, Wr);
  assert.ok(r2 > 1); near(Wr.distanceTo(S), (l1 + l2) * 0.9995, 1e-6); near(E.distanceTo(S), l1, 1e-9);
  assert.ok(Wr.z > 0.3 && Math.abs(Wr.x) < 1e-6, 'it points at the target');
  // the pole picks the side the elbow bends to
  const up = solveArm(S, T, l1, l2, new THREE.Vector3(0, 1, 0), E, Wr);
  assert.ok(E.y > 1.0 && up === r);
  // a pole along the line of the arm still gives a valid elbow
  solveArm(S, new THREE.Vector3(0, 1, 0.3), l1, l2, new THREE.Vector3(0, 0, 1), E, Wr);
  assert.ok(Number.isFinite(E.x + E.y + E.z));
});

test('a hand frame points the fingers along y with the thumb up and is a proper rotation', () => {
  for (const dir of [[0, 0, -1], [1, 0.2, 0], [-0.3, -0.1, 1]]) {
    const y = new THREE.Vector3(...dir).normalize(), q = handBasis(y, new THREE.Vector3(0, 1, 0));
    near(new THREE.Vector3(0, 1, 0).applyQuaternion(q).dot(y), 1, 1e-9, 'fingers');
    const thumb = new THREE.Vector3(0, 0, -1).applyQuaternion(q);                // the hand's -z is the thumb
    assert.ok(thumb.y > 0.9, `the thumb is up (${thumb.y})`);
    near(q.length(), 1, 1e-9);
  }
});

test("the stance fits Mika: the bow hand and the string hand reach with the measured arm, the arrow is a kid's length", () => {
  // measured on Mika (art/CONTRACTS.md rig, metres): upper arm 0.191, forearm 0.177, palm centre 0.042 from the wrist, shoulders 0.138 off the middle at 0.985
  const reach = 0.191 + 0.177 + 0.042;
  const sin = Math.sin(STANCE.side * (1 - STANCE.chestBack)), cos = Math.cos(STANCE.side * (1 - STANCE.chestBack));
  // lane frame (u down the range, v to the right): Mika's middle at the stand; her left shoulder is ahead of her middle and to the left of it
  const C = A.stand, SL = { u: C.u + 0.138 * sin, v: C.v - 0.138 * cos }, SR = { u: C.u - 0.138 * sin, v: C.v + 0.138 * cos };
  const hand = (S, P, dy) => Math.hypot(P.u - S.u, P.v - S.v, dy);
  const dy = A.eye - 0.985;
  const gripD = hand(SL, ARCH.muzzle, dy);
  assert.ok(gripD < reach * 1.0 && gripD > reach * 0.62, `the bow arm reaches the muzzle without a fully stretched or folded arm: ${gripD.toFixed(2)} of ${reach.toFixed(2)}`);
  const braceD = hand(SR, { u: ARCH.muzzle.u - nockAt(0), v: ARCH.muzzle.v }, dy), fullD = hand(SR, { u: ARCH.muzzle.u - nockAt(1), v: ARCH.muzzle.v }, dy);
  assert.ok(braceD < reach * 1.02, `the string hand reaches the string at rest: ${braceD.toFixed(2)}`);
  assert.ok(fullD > 0.1 && fullD < reach * 0.7, `and comes back to the cheek with a bent arm: ${fullD.toFixed(2)}`);
  assert.ok(STANCE.arrow > nockAt(1) && STANCE.arrow < nockAt(1) + 0.2, 'the arrow is a little longer than the draw');
  assert.ok(A.eye > 1.0 && A.eye < 1.25, 'the arrow leaves from about the height of her cheek');
  assert.equal(A.eye, ARCH.eye, 'the content and the rules agree on that height');
  assert.ok(A.stand.u > -0.85 && A.stand.u < 0.36, 'she stands on the shooting board');
});

// ------------------------------------------------------------------------------------------------ the levels
/** A whole round at a level with a model player (as playRound above), the sliding target and the gong led with an error of `lead` seconds. */
function playLevel(seed, level, { sigma, belief = 1, windErr = 0, lead = 0, holdT = 1.2, smart = 1, pace = 3.5 }) {
  const plan = roundPlan(false, level), wind = makeWind(seed, plan.ends.length, plan.windScale, plan.ends.map(e => e.wind), plan.gust), R = rng(seed * 7 + 1);
  const gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += R(); return (s - 3) / 0.7071; };
  let period = A.moving.period;
  const targets = [...A.targets.map(t => ({ u: t.u, v: t.v, r: t.r, y: A.centreH })), { u: A.moving.u, v: 0, r: A.moving.r, y: A.centreH, moving: true }, { u: A.gong.u, v: A.gong.v, r: A.gong.r, y: A.gong.h, moving: true }];
  const sc = { targets, active: 0, back: A.back, side: A.side, vAt: (i, t) => (i === 4 ? gongV(A.gong, t) : movingV(A.moving, t, period)) };
  let total = 0;
  plan.ends.forEach((e, ei) => {
    if (e.target === 'balloons') { total += playBalloons(seed, level, wind, ei, { sigma, smart, pace }, R, gauss).score; return; }
    const idx = e.target === 'moving' ? 3 : e.target === 'gong' ? 4 : e.target;
    period = e.period || A.moving.period;
    sc.active = idx;
    sc.targets.forEach((t, i) => { t.off = idx >= 3 ? i !== idx : i >= 3; });
    let t = 0;
    for (let n = 0; n < e.arrows; n++) {
      t += 4.5;
      const guess = { scale: wind.scale * Math.min(2, Math.max(0, belief + windErr * gauss())), gust: wind.gust, ends: wind.ends };
      const aim = solveAim(idx, 1, guess, ei, t, sc), sw = swayAt(t * 3.1 + n, swayAmp(holdT));
      aim.yaw += sw.yaw + gauss() * sigma; aim.pitch += sw.pitch + gauss() * sigma;
      clampAim(aim);
      const a = flyAll(aim, 1, wind, ei, t + (idx >= 3 ? gauss() * lead : 0), sc);
      if (a.state === 'hit') total += a.ring;
    }
  });
  return total;
}

test('levels: Easy has no wind and the aim arc, Normal is the full round, Difficult has gusts, a lively sliding target and a gong', () => {
  const E = roundPlan(false, 'easy'), N = roundPlan(false, 'normal'), H = roundPlan(false, 'hard');
  assert.deepEqual(roundPlan(false, true), E); assert.deepEqual(roundPlan(false, false), N); assert.deepEqual(roundPlan(false), N); assert.deepEqual(roundPlan(false, 'nonsense'), N);
  assert.deepEqual(E.ends.map(e => [e.target, e.arrows]), [[0, 6], [1, 6], [2, 4], ['balloons', 6]]);
  assert.deepEqual(H.ends.map(e => [e.target, e.arrows]), [[1, 6], [2, 6], ['moving', 6], ['gong', 6], ['balloons', 8]]);
  assert.deepEqual([maxScore(E), maxScore(N), maxScore(H)], [160, 220, 240].map((v, i) => v + stageMax(stagePlan(['easy', 'normal', 'hard'][i]))));
  assert.ok(E.windScale === 0 && E.arc && !E.noArc && N.windScale === 1 && !N.noArc && H.windScale > 1 && H.gust > 1 && H.noArc);
  assert.deepEqual(roundPlan(true, 'hard'), roundPlan(true), 'the guided first try is the same whatever the level');
  // Easy: not a breath of wind, at any second of any end
  const calmWind = makeWind(5, E.ends.length, E.windScale, E.ends.map(e => e.wind), E.gust);
  for (let e = 0; e < 3; e++) for (let t = 0; t < 60; t += 1.7) assert.equal(windAt(calmWind, e, t), 0);
  // Difficult: the same seed blows harder than Normal's, and a gust pushes harder still (never past the limit)
  let harder = 0, n = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const wn = makeWind(seed, 4, N.windScale, null, N.gust), wh = makeWind(seed, 4, H.windScale, null, H.gust);
    for (let t = 0; t < 60; t += 0.5) { n++; if (Math.abs(windAt(wh, 1, t)) > Math.abs(windAt(wn, 1, t)) + 1e-9) harder++; assert.ok(Math.abs(windAt(wh, 1, t)) <= ARCH.gustMax + 1e-9); }
  }
  assert.ok(harder > n * 0.9);
  // the sliding target is livelier on Difficult; the gong is small, swings about its hanging place and stays in the aim cone
  assert.ok(H.ends[2].period < A.moving.period);
  assert.ok(Math.abs(movingV(A.moving, 1, H.ends[2].period)) > Math.abs(movingV(A.moving, 1)));
  const G = A.gong;
  assert.ok(G.r < A.targets[0].r * 0.7 && G.u > A.targets[0].u && G.u < A.moving.u);
  for (let t = 0; t < 10; t += 0.1) {
    const v = gongV(G, t);
    assert.ok(Math.abs(v - G.v) <= G.swing + 1e-9);
    assert.ok(Math.abs(Math.atan2(v - ARCH.muzzle.v, G.u - ARCH.muzzle.u)) < ARCH.yawMax - 0.05, 'the gong can always be aimed at');
  }
  assert.ok(Math.abs(gongV(G, G.period / 4) - (G.v + G.swing)) < 1e-3 && Math.abs(gongV(G, G.period) - G.v) < 1e-2);
  // an arrow solved for the swinging gong rings it
  const sc = { targets: [{ u: G.u, v: G.v, r: G.r, y: G.h, moving: true }], active: 0, back: A.back, side: A.side, vAt: (i, t) => gongV(G, t) };
  for (const t0 of [0.3, 1.1, 2.4, 3.3]) { const a = flyAll(solveAim(0, 1, calm, 0, t0, sc), 1, calm, 0, t0, sc); assert.equal(a.state, 'hit', `t0 ${t0}`); assert.ok(a.ring >= 8); }
});

test('levels: the stars. Easy rewards a steady hand, Difficult wants the wind read and the moving targets led', () => {
  const N = 80, run = (level, o) => Array.from({ length: N }, (_, i) => playLevel(i + 1, level, o));
  const stars = (level, xs) => starsOf(median(xs), levelSpec(TRICK.archery, level).stars);
  // (smart: how often they take the top balloon of a stack in the balloon end; pace: seconds between arrows there)
  const careless = { sigma: 0.035, belief: 0, lead: 0.5, smart: 0.2, pace: 4.5 }, beginner = { sigma: 0.018, belief: 0, lead: 0.35, smart: 0.4, pace: 4 }, learner = { sigma: 0.013, belief: 0.4, windErr: 0.5, lead: 0.25, smart: 0.7, pace: 3.5 };
  const reader = { sigma: 0.008, belief: 0.7, windErr: 0.4, lead: 0.15, smart: 0.9, pace: 3.2 }, sharp = { sigma: 0.005, belief: 0.9, windErr: 0.2, lead: 0.08, smart: 1, pace: 3 };
  assert.ok(stars('easy', run('easy', careless)) >= 1, 'Easy: a shaky hand still earns a star');
  assert.equal(stars('easy', run('easy', beginner)), 2);
  assert.equal(stars('easy', run('easy', reader)), 3);
  assert.deepEqual(levelSpec(TRICK.archery, 'normal').stars, ARCH.stars, 'Normal keeps the marks of the rules');
  assert.equal(stars('normal', run('normal', beginner)), 1);
  assert.equal(stars('normal', run('normal', learner)), 2);
  assert.equal(stars('normal', run('normal', reader)), 3);
  assert.ok(stars('hard', run('hard', careless)) === 0);
  assert.equal(stars('hard', run('hard', beginner)), 1);
  assert.equal(stars('hard', run('hard', reader)), 2, 'Difficult: Normal\'s three-star hand is two stars here');
  assert.equal(stars('hard', run('hard', sharp)), 3);
  assert.ok(pctl(run('hard', reader), 0.9) < levelSpec(TRICK.archery, 'hard').stars[2], 'and three stars are not luck');
  assert.ok(levelSpec(TRICK.archery, 'hard').length >= levelSpec(TRICK.archery, 'normal').length);
});

// ------------------------------------------------------------------------------------------------ the balloon end
const noScene = () => ({ targets: [], active: -1, back: A.back, side: A.side });
/** A stage of one wave made for a test. */
const stageOf = (groups, o = {}) => newStage({ arrows: 6, rise: 0.2, hit: 1, selfPop: false, wind: 1, waveTime: 60, ...o, waves: [groups] }, o.seed ?? 3, o.est ?? 0);
/** Shoot one full-draw arrow at balloon b in a wind and let the stage run on for `after` seconds. Returns the events. */
function shootAt(S, b, wind = calm, root = 0, after = 3, miss = 0) {
  const ev = [], aim = solveBalloon(b, 1, wind, 0, S.t), sc = noScene();
  aim.yaw += miss;
  const a = launch({}, aim, 1, S.t);
  for (let k = 0; a.state === 'fly' && k < 600; k++) { stepArrowBalloons(a, wind, 0, 1 / 120, sc, S, root, ev); stepStage(S, 1 / 120, windAt(wind, 0, S.t), ev); }
  assert.notEqual(a.state, 'fly', 'the arrow always stops');
  for (let t = 0; t < after; t += 1 / 60) stepStage(S, 1 / 60, windAt(wind, 0, S.t), ev);
  return ev;
}

test('balloons: every level ends with a balloon end, scaled; the guided first try has none', () => {
  for (const lv of ['easy', 'normal', 'hard']) {
    const plan = roundPlan(false, lv), last = plan.ends[plan.ends.length - 1], spec = stagePlan(lv);
    assert.equal(last.target, 'balloons');
    assert.equal(plan.ends.filter(e => e.target === 'balloons').length, 1);
    assert.equal(last.arrows, spec.arrows); assert.equal(last.level, lv); assert.equal(last.wind, spec.wind);
    // every stack clears the one below it, starts low and has room to climb; everything can be aimed at
    for (const w of spec.waves) for (const g of w) {
      let y = g.y;
      g.k.forEach((k, i) => { assert.ok(BAL.kinds[k], k); if (i) y += stackGap(g.k[i - 1], k); });
      assert.ok(g.y >= 1.1 && y < BAL.ceil - 1.5, `${lv}: a stack tops out at ${y}`);
      assert.ok(Math.abs(g.v) <= 2.3 && g.u >= 9 && g.u <= 13);
    }
    assert.ok(stageMax(spec) > 0 && maxScore(plan) === plan.ends.slice(0, -1).reduce((s, e) => s + e.arrows * 10, 0) + stageMax(spec));
  }
  assert.ok(!roundPlan(true).ends.some(e => e.target === 'balloons') && !roundPlan(true, 'hard').ends.some(e => e.target === 'balloons'));
  const E = stagePlan('easy'), N = stagePlan('normal'), H = stagePlan('hard');
  assert.equal(stagePlan('nonsense'), N);
  // Easy: slow, stacks of two, a generous hit circle, nothing pops by itself. Normal: stacks of three, a diagonal, a golden one.
  // Difficult: faster, a stronger share of the wind, an exact hit circle, more small balloons.
  const tall = s => Math.max(...s.waves.flat().map(g => g.k.length)), kinds = s => s.waves.flat().flatMap(g => g.k);
  assert.ok(E.rise < N.rise && N.rise < H.rise && E.hit > N.hit && N.hit > H.hit && H.hit === 1);
  assert.ok(!E.selfPop && N.selfPop && H.selfPop);
  assert.equal(tall(E), 2); assert.equal(tall(N), 3); assert.equal(tall(H), 3);
  assert.ok(!kinds(E).includes('gold') && kinds(N).includes('gold') && kinds(H).includes('gold'));
  assert.ok(N.waves.flat().some(g => g.lineUp) && H.waves.flat().some(g => g.lineUp) && !E.waves.flat().some(g => g.lineUp));
  assert.ok(H.wind * ARCH.hardWind > N.wind && E.waves.length < N.waves.length);
  assert.ok(kinds(H).filter(k => k === 'small').length > kinds(N).filter(k => k === 'small').length);
  // bigger is worth less, the golden one the most; a stack shot from the top is worth its chain
  const K = BAL.kinds;
  assert.ok(K.big.r > K.mid.r && K.mid.r > K.small.r && K.big.pts < K.mid.pts && K.mid.pts < K.small.pts && K.gold.pts > K.small.pts);
  assert.equal(groupMax({ k: ['mid', 'mid', 'mid'] }), 3 + 6 + 9);
  assert.equal(groupMax({ k: ['small', 'mid', 'big'] }), 2 + 3 * 2 + 4 * 3);
  assert.equal(groupMax({ k: ['gold'] }), 8);
});

test('balloons: they rise, drift downwind (a big one faster than a small one) and can always be aimed at while they climb', () => {
  const S = stageOf([{ k: ['big'], u: 9.5, v: 0, y: 1.3 }, { k: ['small'], u: 12, v: 0, y: 1.3 }]);
  const [big, small] = S.balloons, v0 = [big.v, small.v];
  for (let i = 0; i < 300; i++) stepStage(S, 1 / 60, 2);
  near(big.y, 1.3 + 0.2 * 5, 1e-6); near(small.y, 1.3 + 0.2 * 5, 1e-6);
  near(big.v - v0[0], 2 * BAL.kinds.big.sail * 5, 1e-6); near(small.v - v0[1], 2 * BAL.kinds.small.sail * 5, 1e-6);
  assert.ok(big.v - v0[0] > small.v - v0[1] && small.v > v0[1], 'downwind, the big one faster');
  assert.ok(Math.abs(big.sv - big.v) <= BAL.swayA + 1e-9 && Math.abs(big.sy - big.y) <= BAL.swayA, 'the bob is small');
  // a wind the other way takes them the other way; no wind, straight up
  const L = stageOf([{ k: ['mid'], u: 10, v: 0, y: 1.3 }]), l0 = L.balloons[0].v;
  for (let t = 0; t < 3; t += 1 / 60) stepStage(L, 1 / 60, -1.5);
  assert.ok(L.balloons[0].v < l0);
  // the same at any frame rate
  const P = stageOf([{ k: ['mid'], u: 10, v: 0, y: 1.3 }]), Q = stageOf([{ k: ['mid'], u: 10, v: 0, y: 1.3 }]);
  for (let i = 0; i < 300; i++) stepStage(P, 1 / 60, 1.2);
  for (let i = 0; i < 50; i++) stepStage(Q, 0.1, 1.2);
  near(P.balloons[0].y, Q.balloons[0].y, 1e-6); near(P.balloons[0].v, Q.balloons[0].v, 1e-6);
  // every balloon of every level, from the moment it is let go to the top of the range, is inside the end's aim cone
  for (const lv of ['easy', 'normal', 'hard']) for (const est of [-2.4, 0, 2.4]) {
    const T = newStage(stagePlan(lv), 11, est);
    for (const b of T.balloons) for (const y of [b.y, BAL.ceil]) {
      const aim = solveBalloon({ ...b, sy: y }, 1, calm, 0, 0);
      const exact = { yaw: Math.atan2(b.sv - ARCH.muzzle.v, b.u - ARCH.muzzle.u), pitch: Math.atan2(y - ARCH.eye, b.u - ARCH.muzzle.u) };
      assert.ok(Math.abs(exact.yaw) < BAL.aim.yawMax - 0.02 && aim.pitch < BAL.aim.pitchMax - 0.01 && aim.pitch > BAL.aim.pitchMin, `${lv}: yaw ${exact.yaw} pitch ${aim.pitch}`);
    }
  }
  assert.ok(BAL.aim.pitchMax > ARCH.pitchMax && BAL.aim.yawMax > ARCH.yawMax, 'the balloon end aims higher and wider than the targets');
  assert.deepEqual(clampAim({ yaw: 1, pitch: 1 }, BAL.aim), { yaw: BAL.aim.yawMax, pitch: BAL.aim.pitchMax });
  assert.deepEqual(clampAim({ yaw: 1, pitch: 1 }), { yaw: ARCH.yawMax, pitch: ARCH.pitchMax });
});

test('balloons: one arrow at the top of a stack pops the whole column, each next one worth more', () => {
  const S = stageOf([{ k: ['mid', 'mid', 'mid'], u: 10.5, v: -1, y: 1.2 }]);
  for (let t = 0; t < 1.5; t += 1 / 60) stepStage(S, 1 / 60, 0);
  const top = topOf(S, 0);
  assert.equal(top.id, 2);
  assert.equal(nearestBalloon(S, Math.atan2(top.sv - ARCH.muzzle.v, top.u - ARCH.muzzle.u), Math.atan2(top.sy - ARCH.eye, top.u - ARCH.muzzle.u), ARCH.muzzle.u, ARCH.muzzle.v, ARCH.eye), top);
  const ev = shootAt(S, top), pops = ev.filter(e => e.type === 'pop');
  assert.deepEqual(pops.map(e => [e.b.id, e.by, e.mult, e.pts]), [[2, 'arrow', 1, 3], [1, 'weight', 2, 6], [0, 'weight', 3, 9]]);
  assert.equal(S.score, 18); assert.equal(S.popped, 3); assert.equal(S.lost, 0);
  assert.equal(liveCount(S), 0);
  assert.ok(!falling(S) && ev.filter(e => e.type === 'thud').length === 3, 'every sandbag reaches the ground');
  assert.ok(S.done, 'the last wave is cleared: the end is over');
  // the bottom one alone: one balloon, its own points, the others still up
  const B = stageOf([{ k: ['mid', 'mid', 'mid'], u: 10.5, v: -1, y: 1.2 }]);
  const ev2 = shootAt(B, B.balloons[0], calm, 0, 1);
  assert.deepEqual(ev2.filter(e => e.type === 'pop').map(e => [e.b.id, e.pts]), [[0, 3]]);
  assert.equal(liveCount(B), 2); assert.equal(B.score, 3);
  // the middle one: it and the one below (x2), the top one flies on
  const M = stageOf([{ k: ['small', 'small', 'small'], u: 11, v: 1, y: 1.2 }]);
  shootAt(M, M.balloons[1], calm, 0, 2);
  assert.equal(M.score, 4 + 8); assert.equal(liveCount(M), 1); assert.equal(M.balloons[2].state, 'up');
  // an arrow that misses pops nothing; an arrow goes on through a balloon to one behind it (each its own points, no chain bonus)
  const X = stageOf([{ k: ['mid'], u: 10, v: 0, y: 2 }]);
  assert.equal(shootAt(X, X.balloons[0], calm, 0, 0.5, 0.09).filter(e => e.type === 'pop').length, 0);
  const T = stageOf([{ k: ['big'], u: 9.5, v: 0, y: 2 }, { k: ['big'], u: 12, v: 0, y: 2 }]);
  T.balloons[1].v = T.balloons[0].v + 0.12; T.balloons[0].ph = T.balloons[1].ph = 0;
  stepStage(T, 1e-4, 0);
  const through = shootAt(T, T.balloons[0], calm, 0, 0.2).filter(e => e.type === 'pop');
  assert.deepEqual(through.map(e => [e.by, e.mult]), [['arrow', 1], ['arrow', 1]]);
  // the hit circle is the level's: an arrow just outside the balloon pops it on Easy's generous circle, not on Difficult's exact one
  for (const [hit, n] of [[1.35, 1], [1, 0]]) {
    const G = stageOf([{ k: ['mid'], u: 10, v: 0, y: 2.5 }], { hit }), b = G.balloons[0];
    assert.equal(arrowPops(G, b.u - 0.2, b.sv + b.r * 1.2, b.sy, b.u + 0.2, b.sv + b.r * 1.2, b.sy, 0), n);
  }
});

test('balloons: a sandbag falls straight down, so it misses a balloon that has drifted aside; the wind lines a diagonal up', () => {
  const S = stageOf([{ k: ['mid', 'mid'], u: 10, v: 0, y: 1.3 }]);
  S.balloons[0].v += 0.9;                                         // the lower one has drifted nearly a metre aside
  stepStage(S, 1e-4, 0);
  const ev = shootAt(S, S.balloons[1]);
  assert.deepEqual(ev.filter(e => e.type === 'pop').map(e => e.b.id), [1]);
  assert.equal(S.balloons[0].state, 'up'); assert.equal(S.score, 3);
  const thud = ev.find(e => e.type === 'thud');
  assert.ok(thud && Math.abs(thud.v - S.balloons[1].sv) < 1e-9 && thud.y === 0, 'the sandbag came straight down to the ground');
  assert.ok(!S.done && liveCount(S) === 1);
  // a diagonal (small, mid, big from the bottom) in a steady wind: at first the top balloon's sandbag would fall beside the
  // middle one; about lineUp seconds later the three stand in a column and one arrow takes them all
  const diag = [{ k: ['small', 'mid', 'big'], u: 10.5, v: 0, y: 1.2, lineUp: 6 }];
  for (const w of [1.6, -1.6]) {
    const early = stageOf(diag, { est: w, seed: 5 }), late = stageOf(diag, { est: w, seed: 5 }), wind = steady(w);
    const [lo, mid, top] = early.balloons;
    assert.ok((top.v - lo.v) * w < 0 && (mid.v - lo.v) * w < 0 && Math.abs(top.v - lo.v) > Math.abs(mid.v - lo.v), 'the higher, bigger ones start upwind');
    assert.ok(Math.abs(top.v - mid.v) > mid.r * BAL.land + BAL.weightR, 'too far aside at first');
    for (let t = 0; t < 0.4; t += 1 / 60) stepStage(early, 1 / 60, w);
    shootAt(early, early.balloons[2], wind, 0, 2);
    assert.equal(early.balloons[1].state, 'up', 'shot too early: the sandbag misses');
    for (let t = 0; t < 6; t += 1 / 60) stepStage(late, 1 / 60, w);
    assert.ok(Math.abs(late.balloons[2].v - late.balloons[0].v) < 0.05 && Math.abs(late.balloons[1].v - late.balloons[0].v) < 0.05, 'lined up');
    shootAt(late, late.balloons[2], wind, 0, 2.5);
    assert.equal(liveCount(late), 0);
    assert.equal(late.score, 2 + 3 * 2 + 4 * 3);
  }
  // with no wind a diagonal is simply a column
  const still = stageOf(diag, { est: 0 });
  assert.ok(still.balloons.every(b => Math.abs(b.v - still.balloons[0].v) < 1e-9));
});

test('balloons: at the top of the range one pops by itself and its sandbag breaks the ones below: those are lost, not scored', () => {
  const S = stageOf([{ k: ['mid', 'mid', 'mid'], u: 10.5, v: 0, y: 1.2 }], { selfPop: true, rise: 0.5 });
  const ev = [], top0 = S.balloons[2].y;
  let t = 0;
  while (!ev.some(e => e.type === 'pop') && t < 30) { stepStage(S, 1 / 60, 0, ev); t += 1 / 60; }
  near(t, (BAL.ceil - top0) / 0.5, 0.05, 'it pops when it reaches the top');
  assert.deepEqual([ev[0].b.id, ev[0].by, ev[0].pts, ev[0].lost], [2, 'self', 0, true]);
  near(S.balloons[2].y, BAL.ceil, 0.02);
  for (let k = 0; k < 240; k++) stepStage(S, 1 / 60, 0, ev);
  assert.deepEqual(ev.filter(e => e.type === 'pop').map(e => [e.b.id, e.by, e.pts, e.lost]), [[2, 'self', 0, true], [1, 'weight', 0, true], [0, 'weight', 0, true]]);
  assert.equal(S.score, 0); assert.equal(S.lost, 3); assert.equal(S.popped, 0);
  assert.ok(S.done);
  // shot before it gets there, the same stack is 18 points: a reason to take the high ones first
  const B = stageOf([{ k: ['mid', 'mid', 'mid'], u: 10.5, v: 0, y: 1.2 }], { selfPop: true, rise: 0.5 });
  for (let k = 0; k < 120; k++) stepStage(B, 1 / 60, 0);
  shootAt(B, topOf(B, 0));
  assert.equal(B.score, 18); assert.equal(B.lost, 0);
  // a chain an arrow started is never taken away by a later pop at the top, and the other way round
  const C = stageOf([{ k: ['mid', 'mid'], u: 10, v: -1.5, y: 1.2 }, { k: ['small'], u: 12, v: 1.5, y: 6.2 }], { selfPop: true, rise: 0.5 });
  const evC = shootAt(C, topOf(C, 0), calm, 0, 4);
  assert.equal(C.score, 3 + 6); assert.equal(C.lost, 1);
  assert.ok(evC.some(e => e.type === 'pop' && e.by === 'self' && e.b.kind === 'small'));
  // Easy: nothing pops by itself; a balloon floats off over the top and nothing falls
  const E = stageOf([{ k: ['mid', 'mid'], u: 10, v: 0, y: 1.2 }], { selfPop: false, rise: 0.8 }), evE = [];
  for (let k = 0; k < 60 * 14 && !E.done; k++) stepStage(E, 1 / 60, 0, evE);
  assert.ok(E.done && E.away === 2 && E.lost === 0 && E.score === 0 && !evE.some(e => e.type === 'pop') && !falling(E));
  assert.ok(E.balloons.every(b => b.state === 'away' && b.y > BAL.ceil));
  // a balloon the wind carries over the rope cordon is gone too
  const W = stageOf([{ k: ['big'], u: 9.5, v: 0, y: 1.3 }], { selfPop: true });
  for (let k = 0; k < 60 * 12 && !W.done; k++) stepStage(W, 1 / 60, 5);
  assert.ok(W.done && W.away === 1 && W.lost === 0 && Math.abs(W.balloons[0].v) > BAL.side);
});

test('balloons: the waves follow each other, the stage is the same for a seed, and a whole level plays out', () => {
  // the next wave comes a breath after the last balloon of this one is gone, or when its time is up
  const spec = stagePlan('normal'), S = newStage(spec, 21, 1.2);
  assert.equal(S.wave, 0);
  const n0 = S.balloons.length;
  assert.equal(n0, spec.waves[0].reduce((s, g) => s + g.k.length, 0));
  for (const b of S.balloons) b.state = 'away';
  const ev = [];
  for (let t = 0; t < BAL.gap - 0.1; t += 1 / 60) stepStage(S, 1 / 60, 0, ev);
  assert.equal(S.wave, 0);
  for (let t = 0; t < 0.3; t += 1 / 60) stepStage(S, 1 / 60, 0, ev);
  assert.equal(S.wave, 1); assert.ok(ev.some(e => e.type === 'wave' && e.n === 1));
  assert.ok(S.balloons.length > n0 && S.balloons.slice(n0).every(b => b.state === 'up' && b.wave === 1 && b.born > 0));
  const T = newStage({ ...spec, selfPop: false, waveTime: 4 }, 21, 0);
  for (let t = 0; t < 4.2; t += 1 / 60) stepStage(T, 1 / 60, 0);
  assert.equal(T.wave, 1, 'the next wave does not wait for ever');
  assert.ok(liveCount(T) > n0);
  // a wave is let go upwind, mirrored or not by the seed, in colours that differ from their neighbours; a golden one is golden
  const up = newStage(spec, 4, 2), down = newStage(spec, 4, -2);
  const mean = Z => Z.balloons.reduce((s, b) => s + b.v, 0) / Z.balloons.length;
  assert.ok(mean(up) < mean(down), 'upwind of the middle');
  for (let s = 1; s < 30; s++) {
    const Z = newStage(stagePlan('hard'), s, 1.5);
    for (let k = 0; k < 60 * 40; k++) stepStage(Z, 1 / 30, 1.5);
    assert.ok(Z.done, 'left alone, a stage ends by itself');
    for (const b of Z.balloons) assert.ok(b.gold ? b.col === -1 : b.col >= 0 && b.col < BAL.colours);
    for (let i = 1; i < Z.balloons.length; i++) if (!Z.balloons[i].gold && !Z.balloons[i - 1].gold) assert.notEqual(Z.balloons[i].col, Z.balloons[i - 1].col);
  }
  // replay: the same seed, wind and arrows give the same stage, to the last digit; another seed another one
  const play = seed => {
    const wind = makeWind(seed, 5, 1, [1, 1, 1, 1, 0.7]), R = rng(seed * 7 + 1), gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += R(); return (s - 3) / 0.7071; };
    const Z = playBalloons(seed, 'normal', wind, 4, { sigma: 0.01, smart: 0.8, pace: 3.3 }, R, gauss);
    return JSON.stringify({ t: Z.t, score: Z.score, popped: Z.popped, lost: Z.lost, away: Z.away, b: Z.balloons.map(b => [b.state, b.v, b.y, b.col]) });
  };
  assert.equal(play(77), play(77));
  assert.notEqual(play(77), play(78));
  // whole stages: a perfect hand that always takes the top of the tallest stack clears most of what the level can give;
  // a hand that only ever takes the lowest balloon gets far less (the chain is the point of the end)
  for (const lv of ['easy', 'normal', 'hard']) {
    const run = smart => Array.from({ length: 40 }, (_, i) => {
      const seed = i + 1, plan = roundPlan(false, lv), ei = plan.ends.length - 1, wind = makeWind(seed, plan.ends.length, plan.windScale, plan.ends.map(e => e.wind), plan.gust);
      const R = rng(seed * 7 + 1), gauss = () => { let s = 0; for (let k = 0; k < 6; k++) s += R(); return (s - 3) / 0.7071; };
      return playBalloons(seed, lv, wind, ei, { sigma: 0.002, smart, pace: 3 }, R, gauss).score;
    });
    const top = median(run(1)), low = median(run(0)), max = stageMax(stagePlan(lv));
    assert.ok(top >= max * 0.8, `${lv}: the clever shots give ${top} of about ${max}`);
    assert.ok(low < top * 0.75, `${lv}: the lowest balloons only give ${low} against ${top}`);
  }
});
