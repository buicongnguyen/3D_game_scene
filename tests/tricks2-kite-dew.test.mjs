// Countryside tricks, phase 2: Make & fly a kite and Dew webs at dawn. The rules are pure (src/game/tricks/rules-kite.js,
// rules-dew.js) and are played here from recorded inputs; the places of all four phase 2 tricks are checked too.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TRICK, TRICKS, starsFor, trickOpen } from '../src/content/tricks.js';
import { placeProblems } from '../src/world/roads.js';
import { sunDirection } from '../src/world/seasons.js';
import { PADDIES, BUILDINGS } from '../src/world/layout.js';
import { FARM } from '../src/content/farm.js';
import {
  KITE, rng, sweepAt, buildQuality, buildGrade, buildResult, makeWind, gustAt, windPush, newFlight, stepFlight, kiteScore, simulateFlight,
} from '../src/game/tricks/rules-kite.js';
import { DEW, sunSide, webVisibility, photoCheck, webSpots, nearestWeb, dewScore } from '../src/game/tricks/rules-dew.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// ------------------------------------------------------------------------------------------------ data and places
test('phase 2 tricks: seasons, hours and room to play', () => {
  assert.deepEqual(TRICKS.slice(4).map(t => t.id), ['kite', 'dew', 'roast', 'beetles']);
  assert.deepEqual(TRICK.kite.seasons, ['autumn', 'winter']);
  assert.deepEqual(TRICK.dew.seasons, ['spring', 'summer', 'autumn']);
  assert.deepEqual(TRICK.roast.seasons, ['autumn']);
  assert.deepEqual(TRICK.beetles.seasons, ['summer']);
  // a running clock: kites by day, dew webs only at dawn, the roast in the afternoon, the sap trap is set at dusk
  assert.ok(trickOpen(TRICK.kite, { season: 'autumn', hour: 12, frozen: false }) && !trickOpen(TRICK.kite, { season: 'autumn', hour: 21, frozen: false }));
  assert.ok(trickOpen(TRICK.dew, { season: 'spring', hour: 6, frozen: false }) && !trickOpen(TRICK.dew, { season: 'spring', hour: 9, frozen: false }));
  assert.ok(!trickOpen(TRICK.dew, { season: 'winter', hour: 6 }) && !trickOpen(TRICK.kite, { season: 'summer', hour: 12 }));
  assert.ok(trickOpen(TRICK.roast, { season: 'autumn', hour: 16, frozen: false }) && trickOpen(TRICK.beetles, { season: 'summer', hour: 18, frozen: false }));
  assert.match(TRICK.roast.safety, /Fires are for grown-ups/);
  // no two trick signs stand on top of each other, on a paddy, in a building, or where the farm animals graze
  for (const t of TRICKS) {
    for (const o of TRICKS) if (o !== t) assert.ok(Math.hypot(o.place.x - t.place.x, o.place.z - t.place.z) > 12, `${t.id} / ${o.id}`);
    for (const b of BUILDINGS) assert.ok(Math.hypot(b.x - t.place.x, b.z - t.place.z) > 6, `${t.id} / ${b.id}`);
    for (const [id, kind, x, z, , roam] of FARM) if (kind !== 'dog') assert.ok(Math.hypot(x - t.place.x, z - t.place.z) > roam + 3, `${t.id} / ${id}`);
  }
  assert.ok(PADDIES.length);
});

test('the kite meadow and the dew webs\' ring are walkable ground', () => {
  // the kite: Mika stands 7 m downwind of the sign (kite.js STAND / WIND_HEADING), the camera up to 15 m behind her
  const k = TRICK.kite.place, h = 0.3;
  for (const along of [-8, -4, 0, 7]) assert.deepEqual(placeProblems(k.x + Math.sin(h) * along, k.z + Math.cos(h) * along), [], `kite ${along}`);
  // dew: most of the ring round the sign must be good ground, so six webs always find a place
  const d = TRICK.dew.place;
  const ok = (x, z) => !placeProblems(d.x + x, d.z + z).length;
  for (let seed = 1; seed <= 40; seed++) assert.equal(webSpots(seed, DEW.webs, ok).length, DEW.webs, `seed ${seed}`);
});

// ------------------------------------------------------------------------------------------------ kite: the build
test('kite build: the marker sweeps end to end, a press is judged by its distance from the middle', () => {
  assert.ok(near(sweepAt(0, 1), -1) && near(sweepAt(1, 1), 1) && near(sweepAt(2, 1), -1) && near(sweepAt(0.5, 1), 0));
  for (let t = 0; t < 9; t += 0.07) assert.ok(Math.abs(sweepAt(t, 1.25)) <= 1 + 1e-9);
  assert.equal(buildQuality(0), 1);
  assert.equal(buildQuality(-0.14), 1);
  assert.ok(buildQuality(0.4) > 0.5 && buildQuality(0.4) < 0.65);
  assert.equal(buildQuality(0.9), 0);
  assert.ok(buildQuality(0.3) > buildQuality(-0.5));
  assert.deepEqual([1, 0.7, 0.2].map(buildGrade), [2, 1, 0]);
  // recorded presses: at t = 0.63 s, 0.52 s and 2.2 s of each step's sweep (speeds as in kite.js)
  const presses = [[0.63, 0.8], [0.52, 1.0], [2.2, 1.25]].map(([t, speed]) => buildQuality(sweepAt(t, speed)));
  const b = buildResult(presses);
  assert.deepEqual(presses.map(q => Math.round(q * 100)), [100, 100, 41]);
  assert.equal(b.points, 12);
  assert.ok(near(b.tail, presses[2]) && b.quality < 0.75);
  assert.deepEqual(buildResult([1, 1, 1]), { points: 15, quality: 1, tail: 1 });
  assert.equal(buildResult([]).points, 0);
});

// ------------------------------------------------------------------------------------------------ kite: the wind
test('kite wind: seeded, gusts on a timetable, never too strong to steer against for long', () => {
  assert.deepEqual(makeWind(7, 60), makeWind(7, 60));
  assert.notDeepEqual(makeWind(7, 60), makeWind(8, 60));
  for (let seed = 1; seed <= 30; seed++) {
    const w = makeWind(seed, 60);
    assert.ok(w.gusts.length >= 6 && w.gusts.length <= 12, `seed ${seed}: ${w.gusts.length} gusts`);
    assert.ok(w.gusts[0].t >= 5, 'a calm start');
    for (let i = 1; i < w.gusts.length; i++) assert.ok(w.gusts[i].t > w.gusts[i - 1].t + w.gusts[i - 1].dur, 'gusts do not overlap');
    for (const g of w.gusts) {
      assert.ok(near(gustAt(w, g.t + g.dur / 2), g.k, 1e-6) && gustAt(w, g.t - 0.01) === 0);
      // the whole shove of a gust is less than full steer over the same time: it can always be held
      assert.ok(Math.abs(g.k) * g.dur * 2 / Math.PI < KITE.steer * g.dur);
    }
    for (let t = 0; t < 60; t += 0.25) assert.ok(Math.abs(windPush(w, t)) < 1.7);
  }
  const R = rng(3), a = [R(), R(), R()];
  assert.ok(a.every(v => v >= 0 && v < 1) && new Set(a).size === 3);
});

// ------------------------------------------------------------------------------------------------ kite: the flight
test('kite flight from recorded inputs: steady hands climb, a kite left alone comes down', () => {
  const dt = 1 / 30;
  // recorded: hands off for the whole round
  let idleSum = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const idle = simulateFlight({ seed, dt, frames: [] });
    assert.ok(idle.falls >= 3, `seed ${seed}: idle falls ${idle.falls}`);
    assert.ok(kiteScore(6, idle) < TRICK.kite.stars[1], `seed ${seed}: idle scores ${kiteScore(6, idle)}`);
    idleSum += kiteScore(6, idle);
  }
  assert.ok(idleSum / 12 < TRICK.kite.stars[0], `idle average ${idleSum / 12}`);
  // a careful player: steers back to the middle a third of a second late, tugs when low
  const careful = () => { const seen = []; return s => { seen.push(s.x); const x = seen.length > 10 ? seen.shift() : 0; return { steer: Math.abs(x) > 0.18 ? -Math.sign(x) : 0, tug: s.h < 0.4 }; }; };
  let three = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const s = simulateFlight({ seed, dt, frames: careful() });
    assert.equal(s.falls, 0, `seed ${seed}`);
    assert.ok(s.top >= 0.99 && s.air > 59, `seed ${seed}`);
    const stars = starsFor(kiteScore(15, s), TRICK.kite.stars);
    assert.ok(stars >= 2, `seed ${seed}: ${kiteScore(15, s)}`);
    if (stars === 3) three++;
    assert.ok(kiteScore(15, s) <= 15 + KITE.ptsHigh * 60);
  }
  assert.ok(three >= 9, `three stars in ${three} of 12 careful flights`);
  // same seed, same inputs: the same flight (deterministic)
  const a = simulateFlight({ seed: 5, dt, frames: careful() }), b = simulateFlight({ seed: 5, dt, frames: careful() });
  assert.deepEqual(a, b);
  // a recorded tape from mid-flight (h = 0.8): hold right for 1.3 s (out of the window, sinking), then steer back and tug
  const tape = [];
  for (let i = 0; i < 40; i++) tape.push({ steer: 1 });
  const w = makeWind(2, 60), s = newFlight();
  s.h = 0.8;
  for (const f of tape) stepFlight(s, w, dt, f);
  assert.ok(s.x > KITE.window && !s.inWindow && s.h < 0.8 && s.aloft, `x ${s.x} h ${s.h}`);
  let hLow = s.h;
  const ptsLow = s.pts;
  for (let i = 0; i < 150; i++) { stepFlight(s, w, dt, { steer: s.x > 0.05 ? -1 : s.x < -0.05 ? 1 : 0, tug: i === 60 }); hLow = Math.min(hLow, s.h); }
  assert.ok(s.inWindow && s.h > hLow + KITE.tugLift, `back in the wind and climbing: h ${s.h}`);
  assert.ok(s.pts > ptsLow && s.aloft);
});

test('kite flight: the grass, the relaunch, the tug, the tail and the window', () => {
  const dt = 1 / 30, w = { p1: 0, p2: 0, gusts: [] };
  // pinned to the edge the kite sinks to the grass, waits, and launches again from the middle
  const s = newFlight();
  let steps = 0;
  while (s.aloft && steps++ < 600) stepFlight(s, w, dt, { steer: 1 });
  assert.ok(!s.aloft && s.falls === 1 && s.h === 0);
  const pts = s.pts;
  let wait = 0;
  while (!s.aloft && wait < 10) { stepFlight(s, w, dt, {}); wait += dt; }
  assert.ok(Math.abs(wait - KITE.relaunch) < 0.1 && s.aloft && s.x === 0 && near(s.h, KITE.startH));
  assert.equal(s.pts, pts, 'no points on the grass');
  // a tug shortens the wait, and lifts a flying kite once per cool-down
  const s2 = newFlight(); s2.aloft = false; s2.down = KITE.relaunch;
  let wait2 = 0;
  while (!s2.aloft && wait2 < 10) { stepFlight(s2, w, dt, { tug: true }); wait2 += dt; }
  assert.ok(wait2 < KITE.relaunch - 1);
  const s3 = newFlight(), s4 = newFlight();
  stepFlight(s3, w, dt, { tug: true }); stepFlight(s3, w, dt, { tug: true }); stepFlight(s4, w, dt, {}); stepFlight(s4, w, dt, {});
  assert.ok(near(s3.h - s4.h, KITE.tugLift, 1e-6), 'one lift, not two');
  // higher is worth more
  const lo = newFlight(), hi = newFlight(); hi.h = 1;
  stepFlight(lo, w, 1, {}); stepFlight(hi, w, 1, {});
  assert.ok(hi.pts > lo.pts * 2);
  // a loose tail wags the kite; a wider window forgives more
  const still = { p1: Math.PI, p2: Math.PI, gusts: [] };
  const wag = q => { const f = newFlight({ quality: q, tail: q }); let m = 0; for (let i = 0; i < 300; i++) { stepFlight(f, { p1: 0, p2: 0, gusts: [], ...still }, dt, { steer: Math.max(-1, Math.min(1, -f.x * 8)) }); m = Math.max(m, Math.abs(f.x)); } return m; };
  assert.ok(wag(0.1) > wag(1));
  const narrow = simulateFlight({ seed: 4, dt, frames: [] }), wideW = simulateFlight({ seed: 4, dt, frames: [], window: KITE.windowFirst });
  assert.ok(wideW.pts > narrow.pts);
  assert.equal(kiteScore(15, { pts: 61.9 }), 76);
  assert.equal(kiteScore(0, null), 0);
});

// ------------------------------------------------------------------------------------------------ dew webs
test('dew webs show only up close with the sun behind Mika', () => {
  const [sx, sz] = [1, 0];                                   // the sun in the east
  assert.equal(sunSide(3, 0, sx, sz), 1);
  assert.equal(sunSide(-3, 0, sx, sz), 0);
  assert.ok(sunSide(0, 3, sx, sz) > 0 && sunSide(0, 3, sx, sz) < 0.5);
  // close, on the sunward side: bright. Same distance on the shaded side: nearly nothing
  assert.ok(webVisibility(2.5, 0, sx, sz) > 0.95);
  assert.ok(webVisibility(-2.5, 0, sx, sz) < 0.15);
  // far away it is a hair-thin glint whatever the side, and nothing at all beyond that
  assert.ok(webVisibility(14, 0, sx, sz) <= DEW.faint + 1e-9 && webVisibility(14, 0, sx, sz) > 0);
  assert.equal(webVisibility(30, 0, sx, sz), 0);
  // it fades in smoothly on the way (no pop)
  let last = 0;
  for (let d = 12; d >= 2; d -= 0.5) { const v = webVisibility(d, 0, sx, sz); assert.ok(v >= last - 1e-9 && v - last < 0.2, `at ${d} m`); last = v; }
  // the guided try sees further
  assert.ok(webVisibility(11, 0, sx, sz, DEW.farFirst) > webVisibility(11, 0, sx, sz) + 0.2);
  assert.equal(photoCheck(2, 0, sx, sz), 'ok');
  assert.equal(photoCheck(-2, 0, sx, sz), 'side');
  assert.equal(photoCheck(6, 0, sx, sz), 'far');
  // the real dawn sun (east, a little south) works the same way in every dew season
  for (const season of TRICK.dew.seasons) {
    const s = sunDirection(6, season), l = Math.hypot(s.x, s.z);
    assert.ok(s.x / l > 0.8, 'the dawn sun is in the east');
    assert.equal(photoCheck(s.x / l * 2.2, s.z / l * 2.2, s.x / l, s.z / l), 'ok');
  }
});

test('dew web spots are seeded, spread out and respect the ground', () => {
  const a = webSpots(42), b = webSpots(42);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, webSpots(43));
  for (let seed = 1; seed <= 50; seed++) {
    const s = webSpots(seed);
    assert.equal(s.length, DEW.webs);
    for (const w of s) {
      const r = Math.hypot(w.x, w.z);
      assert.ok(r >= DEW.rMin - 1e-9 && r <= DEW.rMax + 1e-9 && w.h >= 0.75 && w.h <= 1.2);
      for (const o of s) if (o !== w) assert.ok(Math.hypot(o.x - w.x, o.z - w.z) >= DEW.gap);
    }
    // they lie all round the sign, not in one corner
    const quads = new Set(s.map(w => (w.x > 0 ? 1 : 0) + (w.z > 0 ? 2 : 0)));
    assert.ok(quads.size >= 3, `seed ${seed}`);
  }
  // blocked ground is never used; with no room at all it gives up quietly
  const east = webSpots(9, DEW.webs, x => x > 0);
  assert.ok(east.length >= 3 && east.every(w => w.x > 0));
  assert.deepEqual(webSpots(9, DEW.webs, () => false), []);
});

test('dew round from a recorded walk: find, wrong side, photograph, score', () => {
  const sun = [1, 0];
  const webs = webSpots(7).map(w => ({ ...w, found: false }));
  // recorded: Mika walks to each web's shaded side first (no photo), then round to the sunny side (photo)
  let seconds = 0, found = 0;
  const log = [];
  for (let k = 0; k < 4; k++) {
    const i = nearestWeb(webs, k ? webs[log[k - 1]].x + 2.2 : 0, k ? webs[log[k - 1]].z : 0);
    const w = webs[i];
    assert.equal(photoCheck(-2.2, 0.3, ...sun), 'side');
    assert.equal(photoCheck(2.2, 0.3, ...sun), 'ok');
    w.found = true; found++; seconds += 9; log.push(i);
  }
  assert.equal(new Set(log).size, 4, 'a found web is never offered again');
  assert.equal(nearestWeb(webs.map(w => ({ ...w, found: true })), 0, 0), -1);
  assert.equal(dewScore({ found, total: 6, seconds, length: 90 }), 40);
  assert.equal(starsFor(40, TRICK.dew.stars), 1);
  // all six: 60 points and a point for every 3 s left
  assert.equal(dewScore({ found: 6, total: 6, seconds: 54, length: 90 }), 72);
  assert.equal(starsFor(dewScore({ found: 6, total: 6, seconds: 89, length: 90 }), TRICK.dew.stars), 2);
  assert.equal(starsFor(dewScore({ found: 6, total: 6, seconds: 40, length: 90 }), TRICK.dew.stars), 3);
  assert.equal(dewScore({ found: 5, total: 6, seconds: 10, length: 90 }), 50, 'no speed bonus before the last web');
  assert.equal(dewScore({}), 0);
});

test('kite and dew modules: play() and no rule code in three.js land', async () => {
  for (const id of ['kite', 'dew']) {
    const m = (await import(`../src/game/tricks/${id}.js`)).default;
    assert.equal(m.id, id);
    assert.equal(typeof m.play, 'function');
    const rules = fs.readFileSync(new URL(`../src/game/tricks/rules-${id}.js`, import.meta.url), 'utf8');
    assert.ok(!/from 'three'|\bdocument\./.test(rules), `rules-${id}.js is pure`);
  }
});
