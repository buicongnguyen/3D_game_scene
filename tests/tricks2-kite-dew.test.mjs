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
import { KITE, rng, sweepAt, buildQuality, buildGrade, buildResult, makeWind, gustAt, windPush, newFlight, stepFlight, kiteScore, simulateFlight, flightPlan, windCentre, ringAt, kiteBot } from '../src/game/tricks/rules-kite.js';
import { DEW, sunSide, webVisibility, photoCheck, webSpots, nearestWeb, dewScore, DEW_LEVELS, dewLevel, photoPerfect, dryTimes, dryness } from '../src/game/tricks/rules-dew.js';
import { LEVELS, levelSpec } from '../src/content/levels.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// ------------------------------------------------------------------------------------------------ data and places
test('phase 2 tricks: seasons, hours and room to play', () => {
  const ids = TRICKS.map(t => t.id);
  for (const id of ['kite', 'dew', 'roast', 'beetles']) assert.ok(ids.includes(id), id);          // (later tricks may follow: new rows need no edit here)
  assert.ok(ids.indexOf('kite') < ids.indexOf('dew') && ids.indexOf('dew') < ids.indexOf('roast') && ids.indexOf('roast') < ids.indexOf('beetles'));
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
  // ...and the bigger patches of the Normal and Difficult levels hold all their webs too (the old ones included)
  for (const [l, L] of Object.entries(DEW_LEVELS)) {
    for (let seed = 1; seed <= 40; seed++) {
      const s = webSpots(seed, L.webs + L.decoys, ok, { rMax: L.rMax, gap: L.rMax > DEW.rMax ? 5 : DEW.gap });
      assert.equal(s.length, L.webs + L.decoys, `${l} seed ${seed}`);
    }
  }
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
  // (a plain minute in Normal's wind, no rings: the marks such a flight was always held to)
  const PLAIN = [40, 70, 100];
  // recorded: hands off for the whole round
  let idleSum = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const idle = simulateFlight({ seed, dt, frames: [] });
    assert.ok(idle.falls >= 3, `seed ${seed}: idle falls ${idle.falls}`);
    assert.ok(kiteScore(6, idle) < PLAIN[1], `seed ${seed}: idle scores ${kiteScore(6, idle)}`);
    idleSum += kiteScore(6, idle);
  }
  assert.ok(idleSum / 12 < PLAIN[0], `idle average ${idleSum / 12}`);
  // a careful player: steers back to the middle a third of a second late, tugs when low
  const careful = () => { const seen = []; return s => { seen.push(s.x); const x = seen.length > 10 ? seen.shift() : 0; return { steer: Math.abs(x) > 0.18 ? -Math.sign(x) : 0, tug: s.h < 0.4 }; }; };
  let three = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const s = simulateFlight({ seed, dt, frames: careful() });
    assert.equal(s.falls, 0, `seed ${seed}`);
    assert.ok(s.top >= 0.99 && s.air > 59, `seed ${seed}`);
    const stars = starsFor(kiteScore(15, s), PLAIN);
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
  // all six: 60 points and a point for every 3 s left
  assert.equal(dewScore({ found: 6, total: 6, seconds: 54, length: 90 }), 72);
  // the stars of every level: half the webs are one star, all of them two, all of them with time to spare three
  for (const l of LEVELS) {
    const L = dewLevel(l), { stars, length } = levelSpec(TRICK.dew, l), n = L.webs;
    assert.ok(starsFor(dewScore({ found: Math.ceil(n / 2), total: n, seconds: length, length, perfect: L.grade ? 2 : 0 }), stars) >= 1, `${l}: half the webs`);
    assert.equal(starsFor(dewScore({ found: n - 1, total: n, seconds: length, length }), stars), l === 'hard' ? 1 : 2, `${l}: all but one`);
    const slow = dewScore({ found: n, total: n, seconds: length - 2, length, perfect: 0 });
    assert.equal(starsFor(slow, stars), l === 'hard' ? 1 : 2, `${l}: every web at the last moment (${slow})`);
    const good = dewScore({ found: n, total: n, seconds: length * 0.72, length, perfect: L.grade ? n - 2 : 0 });
    assert.equal(starsFor(good, stars), 3, `${l}: every web with time to spare (${good})`);
    // Difficult: plain photos of every web are two stars; three want most of them perfect and no old web
    if (L.grade) {
      assert.equal(starsFor(dewScore({ found: n, total: n, seconds: length * 0.8, length, perfect: 1 }), stars), 2);
      assert.ok(dewScore({ found: n, total: n, seconds: length * 0.72, length, perfect: n - 2, decoys: 2 }) < good);
    }
  }
  assert.equal(dewScore({ found: 5, total: 6, seconds: 10, length: 90 }), 50, 'no speed bonus before the last web');
  assert.equal(dewScore({}), 0);
  assert.equal(dewScore({ found: 1, total: 10, decoys: 3 }), 0, 'never under zero');
  assert.equal(dewScore({ found: 4, total: 10, perfect: 3, decoys: 1 }), 40 + 15 - 5);
});

test('dew levels: more webs over a bigger patch, webs that dry (the sunny side first), old webs and perfect photos', () => {
  const { first, easy, normal, hard } = DEW_LEVELS;
  assert.equal(dewLevel('hard', true), first);
  assert.ok(easy.webs < first.webs && first.webs < normal.webs && normal.webs < hard.webs);
  assert.ok(hard.webs + hard.decoys <= DEW.maxWebs && easy.rMax < normal.rMax && normal.rMax <= hard.rMax);
  assert.ok(easy.far > normal.far && !easy.dry && normal.dry > 0.3 && hard.dry > 0.3 && !normal.decoys && hard.decoys === 2 && hard.grade && !normal.grade);
  // drying: never on Easy; on Normal the sunny side goes first, one web after the other, the last as the round ends
  const webs = [{ x: 6, z: 0 }, { x: -8, z: 2 }, { x: 0, z: 9 }, { x: 12, z: -3 }, { x: 3, z: 3, decoy: true }];
  assert.ok(dryTimes(webs, 1, 0, 110, 0).every(t => t === Infinity));
  const dry = dryTimes(webs, 1, 0, 110, 0.5);
  assert.equal(dry[4], Infinity, 'an old web is dry already');
  assert.ok(dry[3] < dry[0] && dry[0] < dry[2] && dry[2] < dry[1], `sunny side first: ${dry}`);
  assert.ok(dry[3] > 55 && Math.abs(dry[1] - 110) < 1e-9);
  assert.equal(dryness(10, dry[3]), 0);
  assert.ok(dryness(dry[3] - DEW.dryWarn / 2, dry[3]) > 0.4 && dryness(dry[3] - DEW.dryWarn / 2, dry[3]) < 0.6, 'its drops fade first: a warning');
  assert.equal(dryness(dry[3] + 1, dry[3]), 1);
  assert.equal(dryness(500, Infinity), 0);
  // a dried web is not offered any more
  assert.equal(nearestWeb([{ x: 1, z: 0, dry: true }, { x: 5, z: 0 }], 0, 0), 1);
  // a perfect photo: in line with the sun and at the right distance
  assert.ok(photoPerfect(2.2, 0, 1, 0));
  assert.ok(photoPerfect(2.2, 0.6, 1, 0) && !photoPerfect(2.2, 1.6, 1, 0), 'a little off the line is fine, well off it is not');
  assert.ok(!photoPerfect(1.2, 0, 1, 0) && !photoPerfect(3.2, 0, 1, 0), 'too close, too far');
  assert.ok(!photoPerfect(-2.2, 0, 1, 0));
  assert.equal(photoCheck(2.2, 1.6, 1, 0), 'ok', '...though it is still a photo');
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

// ------------------------------------------------------------------------------------------------ the kite's levels
test('kite levels: Easy a gentle wind and rings up high, Normal rings at set heights, Difficult a turning wind, side rings and a tree', () => {
  const E = flightPlan('easy'), N = flightPlan('normal'), H = flightPlan('hard');
  assert.deepEqual(flightPlan('normal', true), E, 'the guided first try flies Easy\'s sky');
  assert.ok(E.window > N.window && E.gusts < 1 && N.gusts === 1 && !E.shift && !N.shift && H.shift && H.tree && !N.tree);
  for (let seed = 1; seed <= 20; seed++) {
    const plain = makeWind(seed, 80), e = makeWind(seed, 60, E), n = makeWind(seed, 80, N), h = makeWind(seed, 100, H);
    assert.equal(plain.rings.length, 0); assert.equal(plain.shifts.length, 0);
    assert.deepEqual(n.gusts, plain.gusts, 'a plan never changes the seed\'s gusts');
    assert.ok(e.gusts.every((g, i) => Math.abs(g.k) < Math.abs(makeWind(seed, 60).gusts[i].k)), 'Easy: the same gusts, gentler');
    assert.ok(e.rings.length >= 3 && n.rings.length >= 5 && h.rings.length >= 6, `rings ${e.rings.length} ${n.rings.length} ${h.rings.length}`);
    assert.ok(e.rings.every(r => r.h >= 1 - KITE.ringH && Math.abs(r.x) <= 0.2), 'Easy: a kite at the top of its line, in the middle, is in every ring');
    assert.ok(n.rings.some(r => r.h < 0.6) && n.rings.some(r => r.h > 0.7) && n.rings.every(r => Math.abs(r.x) <= N.window), 'Normal: low and high rings, all in the wind');
    assert.ok(h.shifts.length >= 3 && h.shifts.every(s => Math.abs(s.c) <= KITE.shift + 1e-9));
    for (const r of h.rings) {
      assert.ok(Math.abs(r.x - windCentre(h, r.t0 + KITE.ringLife / 2)) > H.window, 'Difficult: every ring hangs outside the wind');
      assert.ok(!(r.x + KITE.ringX >= KITE.treeX && r.h - KITE.ringH <= KITE.treeH), 'and none of them in the tree');
    }
    for (const w of [e, n, h]) for (let i = 1; i < w.rings.length; i++) assert.ok(w.rings[i].t0 >= w.rings[i - 1].t1 + 2, 'one ring at a time, with a breath between');
    assert.equal(ringAt(n, n.rings[0].t0 + 1), n.rings[0]); assert.equal(ringAt(n, n.rings[0].t0 - 1), null);
    assert.equal(windCentre(n, 50), 0); assert.equal(windCentre(h, 0), 0);
    const s0 = h.shifts[0];
    assert.ok(Math.abs(windCentre(h, s0.t + KITE.shiftTime) - s0.c) < 1e-9 && Math.abs(windCentre(h, s0.t + KITE.shiftTime / 2) - s0.c / 2) < 1e-9, 'the wind turns smoothly');
  }
});

test('kite levels: the window follows the turning wind, a ring counts once, the tree catches a low kite', () => {
  const dt = 1 / 30, H = flightPlan('hard'), w = makeWind(4, 100, H);
  // steering to the middle of the FIELD is not enough once the wind has turned: the middle of the wind is where the kite climbs
  const s = newFlight({ window: H.window });
  const t1 = w.shifts[0].t + KITE.shiftTime + 0.5;
  while (s.t < t1) stepFlight(s, w, dt, { steer: Math.max(-1, Math.min(1, (windCentre(w, s.t) - s.x) * 4)) });
  assert.ok(Math.abs(s.c - w.shifts[0].c) < 1e-6 && s.inWindow && Math.abs(s.x - s.c) < 0.2);
  // a ring: fly at it and it is taken once
  const r = { t0: 0, t1: 9, x: 0.1, h: 0.5 }, sky = { ...makeWind(1, 60), rings: [r], gusts: [] };
  const a = newFlight(); a.h = 0.5; a.x = 0.1;
  stepFlight(a, sky, dt, {}); stepFlight(a, sky, dt, {});
  assert.equal(a.got, 1); assert.equal(a.ring, 1); assert.equal(a.ringPts, KITE.ringPoints);
  assert.equal(kiteScore(10, a), Math.floor(10 + a.pts + KITE.ringPoints));
  const miss = newFlight(); miss.h = 0.5 + KITE.ringH + 0.05; miss.x = 0.1;
  for (let i = 0; i < 9.2 * 30; i++) { miss.h = 0.5 + KITE.ringH + 0.05; miss.x = 0.1; stepFlight(miss, sky, dt, {}); }
  assert.equal(miss.got, 0); assert.equal(miss.missed, 1, 'too high: the ring goes by');
  // the tree: low on the right is caught (longer on the ground), high over it is safe
  const tree = { ...makeWind(1, 60), gusts: [], tree: true };
  const low = newFlight(); low.x = KITE.treeX + 0.1; low.h = KITE.treeH - 0.05;
  stepFlight(low, tree, dt, {});
  assert.ok(!low.aloft && low.snags === 1 && low.falls === 1 && low.down > KITE.relaunch);
  const high = newFlight(); high.x = KITE.treeX + 0.1; high.h = 0.9;
  stepFlight(high, tree, dt, {});
  assert.ok(high.aloft && high.snags === 0);
  const noTree = newFlight(); noTree.x = KITE.treeX + 0.1; noTree.h = KITE.treeH - 0.05;
  stepFlight(noTree, { ...tree, tree: false }, dt, {});
  assert.ok(noTree.aloft, 'no tree on Easy and Normal');
});

test('kite levels: the stars. Easy forgives, Normal wants the rings, Difficult wants the side rings and a clean flight', () => {
  const med = xs => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const fly = (level, build, skill, n = 40) => Array.from({ length: n }, (_, i) => {
    const plan = flightPlan(level), out = { steer: 0, tug: false };
    const s = simulateFlight({ seed: i + 1, length: levelSpec(TRICK.kite, level).length, plan, quality: build / 15, tail: build / 15, frames: skill ? (st, w) => kiteBot(st, w, skill, out) : () => null });
    return { score: kiteScore(build, s), got: s.got, snags: s.snags, falls: s.falls };
  });
  const idle = null, drifter = { gain: 0.6, rings: false, noise: 0.5, see: 0 }, careful = { gain: 2.5, rings: false, noise: 0.15, see: 0 }, ringer = { gain: 3, rings: true, noise: 0.08, see: 0.4 };
  const stars = (level, runs) => starsFor(med(runs.map(r => r.score)), levelSpec(TRICK.kite, level).stars);
  // Easy: letting go still earns a star most days, any steering earns three
  assert.ok(stars('easy', fly('easy', 8, idle)) >= 1);
  assert.equal(stars('easy', fly('easy', 9, drifter)), 3);
  // Normal: hands off earns nothing, staying in the wind two stars, the rings the third
  assert.equal(stars('normal', fly('normal', 8, idle)), 0);
  assert.equal(stars('normal', fly('normal', 11, careful)), 2);
  assert.ok(stars('normal', fly('normal', 13, ringer)) >= 2);
  assert.ok(med(fly('normal', 13, ringer).map(r => r.got)) >= 4 && fly('normal', 15, { ...ringer, noise: 0 }).filter(r => r.score >= levelSpec(TRICK.kite, 'normal').stars[2]).length >= 20, 'three stars are there for a flyer who takes the rings');
  // Difficult: staying in the turning wind without the rings is not two stars; the side rings make three
  const hc = fly('hard', 11, careful), hr = fly('hard', 13, ringer);
  assert.ok(stars('hard', hc) <= 1, `careful, no rings: ${med(hc.map(r => r.score))}`);
  assert.equal(stars('hard', hr), 3, `rings: ${med(hr.map(r => r.score))}`);
  assert.ok(med(hr.map(r => r.got)) >= 6);
  assert.ok(fly('hard', 8, idle).reduce((a, r) => a + r.snags, 0) > 20, 'a kite left alone ends in the tree again and again');
  // the levels get longer
  assert.ok(levelSpec(TRICK.kite, 'easy').length < levelSpec(TRICK.kite, 'normal').length && levelSpec(TRICK.kite, 'normal').length < levelSpec(TRICK.kite, 'hard').length);
});

// ------------------------------------------------------------------------------------------------ kite: the styles
test('kite styles: five kites that fly differently, two open from the start, the others with stars', async () => {
  const { KITE_STYLES, KITE_STYLE, kiteOpen, fluteVoice } = await import('../src/game/tricks/rules-kite.js');
  assert.deepEqual(KITE_STYLES.map(k => k.id), ['diamond', 'kaku', 'sao', 'bird', 'box']);
  for (const k of KITE_STYLES) { for (const b of [k.lift, k.steady, k.speed]) assert.ok(b >= 1 && b <= 5, k.id); assert.ok(k.name && k.desc.length <= 90, k.id); }
  assert.deepEqual(KITE_STYLES.map(k => kiteOpen(k.id, 0)), [true, true, false, false, false]);
  assert.deepEqual(KITE_STYLES.map(k => kiteOpen(k.id, 2)), [true, true, true, true, false]);
  assert.ok(kiteOpen('box', 3) && !kiteOpen('nope', 9));
  // the plain diamond is the flight it always was: the same numbers with and without a style
  const steer = s => ({ steer: Math.abs(s.x) > 0.18 ? -Math.sign(s.x) : 0, tug: s.h < 0.4 });
  assert.deepEqual(simulateFlight({ seed: 4, frames: steer, style: 'diamond' }), simulateFlight({ seed: 4, frames: steer }));
  assert.equal(newFlight({ style: 'nope' }).style, 'diamond');
  // lift: in the middle of a still sky the flute kite climbs fastest, the kaku-dako slowest
  const calm = { p1: 0, p2: 0, gusts: [], shifts: [], rings: [] }, still = { ...calm, p1: Math.PI, p2: Math.PI };
  const climb = style => { const s = newFlight({ style }); let t = 0; while (s.h < 0.9 && t < 30) { stepFlight(s, calm, 1 / 30, { steer: -Math.sign(s.x) * Math.min(1, Math.abs(s.x) * 20), tug: false }); t += 1 / 30; } return t; };
  assert.ok(climb('sao') < climb('diamond') && climb('diamond') < climb('kaku'), `to the top: flute ${climb('sao').toFixed(1)} s, diamond ${climb('diamond').toFixed(1)} s, kaku ${climb('kaku').toFixed(1)} s`);
  // steadiness: the same gust shoves the kaku-dako and the box kite half as far as the diamond, the flute kite further
  const gust = { ...still, gusts: [{ t: 1, dur: 2, k: 1 }] };
  const shove = style => { const s = newFlight({ style }); let m = 0; for (let i = 0; i < 120; i++) { stepFlight(s, gust, 1 / 30, null); m = Math.max(m, Math.abs(s.x)); } return m; };
  assert.ok(shove('kaku') < shove('diamond') * 0.7 && shove('box') < shove('diamond') * 0.7 && shove('sao') > shove('diamond') * 1.05);
  // speed: the hawk kite crosses the sky fastest
  const cross = style => { const s = newFlight({ style, tail: 1 }); for (let i = 0; i < 30; i++) stepFlight(s, still, 1 / 30, { steer: 1 }); return s.x; };
  assert.ok(cross('bird') > cross('diamond') * 1.3 && cross('kaku') < cross('diamond'));
  // the box kite climbs only in the strong wind in the very middle; off it (still in the window) it just holds
  const at = (style, x) => { const s = newFlight({ style }); s.x = x; const h0 = s.h; stepFlight(s, still, 0.01, null); return (s.h - h0) / 0.01; };
  assert.ok(at('box', 0.05) > 0.1 && at('box', 0.3) < 0.03 && at('box', 0.3) > 0 && at('diamond', 0.3) > 0.08);
  // the flute kite sings when it is up high, and only it
  const hi = newFlight({ style: 'sao' }); hi.h = 0.95;
  const lo = newFlight({ style: 'sao' }); lo.h = 0.5;
  const other = newFlight({ style: 'kaku' }); other.h = 0.95;
  assert.ok(fluteVoice(hi) === 1 && fluteVoice(lo) === 0 && fluteVoice(other) === 0);
  assert.equal(KITE_STYLE.sao.name, 'Diều sáo');
  // every kite can earn every star: the rules' own flyer who takes the rings gets at least two on each level, with each kite
  const med = xs => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  for (const level of LEVELS) for (const k of KITE_STYLES) {
    const scores = Array.from({ length: 24 }, (_, i) => { const plan = flightPlan(level), out = { steer: 0, tug: false }; return kiteScore(13, simulateFlight({ seed: i + 1, length: levelSpec(TRICK.kite, level).length, plan, quality: 13 / 15, tail: 13 / 15, style: k.id, frames: (st, w) => kiteBot(st, w, { gain: 3, rings: true, noise: 0.08, see: 0.4 }, out) })); });
    assert.ok(starsFor(med(scores), levelSpec(TRICK.kite, level).stars) >= 2, `${k.id} on ${level}: ${med(scores)}`);
    assert.ok(Math.max(...scores) >= levelSpec(TRICK.kite, level).stars[2], `${k.id} on ${level}: three stars are within reach (${Math.max(...scores)})`);
  }
});
