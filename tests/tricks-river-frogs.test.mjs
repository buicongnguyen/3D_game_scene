import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NIGHT_FISH, pickSpecies, spotStep, riverScore, shallowSpots, HOLD, RADIUS } from '../src/game/tricks/river.js';
import { Chorus, sneakStep, sneakScore, Simon, frogsScore, bundSpots, paddyWater, REACH, GRACE, FLEE_EVERY } from '../src/game/tricks/frogs.js';
import { planCritters, croakRate } from '../src/actors/critters.js';
import { scatter } from '../src/world/scatter.js';
import { sharedGrid } from '../src/world/roads.js';
import { rng } from '../src/engine/spline.js';
import { WATER_Y } from '../src/world/layout.js';
import { TRICK } from '../src/content/tricks.js';

const grid = sharedGrid();
const heightAt = (x, z) => grid.heightAt(x, z);

// ------------------------------------------------------------------ river
test('river: every round has a night-only fish, and every fish has art to borrow', () => {
  const R = rng(3);
  for (let k = 0; k < 50; k++) {
    const s = pickSpecies(6, R);
    assert.equal(s.length, 6);
    assert.ok(s.some(id => NIGHT_FISH[id].night), s.join());
  }
  for (const f of Object.values(NIGHT_FISH)) assert.ok(f.name && f.model.startsWith('fish-'));
});

test('river: holding the light over a fish for a second names it; moving off loses the hold', () => {
  const fish = [{ x: 0, z: 0, named: false, hold: 0 }, { x: 5, z: 0, named: false, hold: 0 }];
  let got = null;
  for (let t = 0; t < HOLD - 0.05; t += 0.1) got = spotStep(fish, 0.3, 0, 0.1) || got;
  assert.equal(got, null);
  spotStep(fish, 5, 0, 0.3);                     // the light slides away: the first fish loses its hold
  assert.ok(fish[0].hold < 0.5);
  for (let t = 0; t < 1.2 && !got; t += 0.1) got = spotStep(fish, 0.2, 0.1, 0.1);
  assert.equal(got, fish[0]);
  assert.ok(fish[0].named);
  // a named fish is not named again; nothing outside the circle is named
  for (let t = 0; t < 3; t += 0.1) assert.equal(spotStep(fish, 0, 0, 0.1), null);
  for (let t = 0; t < 3; t += 0.1) assert.equal(spotStep(fish, 5 + RADIUS, 0, 0.1), null);
});

test('river: score is fish + new kinds + shrimp, and the stars are reachable', () => {
  assert.equal(riverScore({ named: 0, species: 0, shrimp: 0 }), 0);
  assert.equal(riverScore({ named: 3, species: 2, shrimp: 7 }), 3 + 1 + 2);
  const best = riverScore({ named: 9, species: 5, shrimp: 26 });
  assert.ok(best >= TRICK.river.stars[2], `best ${best}`);
});

test('river: the shallows by the Kawabe dock are found and really shallow', () => {
  const p = TRICK.river.place, R = rng(5);
  const s = shallowSpots(heightAt, p.x, p.z, 9, { lo: 0.35, hi: 1.1, rand: R });
  assert.ok(s.length >= 6, `${s.length} fish spots`);
  for (const q of s) { const d = WATER_Y - heightAt(q.x, q.z); assert.ok(d >= 0.35 && d <= 1.1, `depth ${d}`); }
  assert.ok(shallowSpots(heightAt, p.x, p.z, 1, { lo: 0.25, hi: 0.5, along: 6, rand: R }).length === 1, 'a wading start');
});

// ------------------------------------------------------------------ frogs
test('frogs: the chorus swells, warns (hush) and goes quiet, over and over', () => {
  const c = new Chorus({ rand: rng(1) });
  const seen = [];
  for (let t = 0; t < 40; t += 0.05) { const ch = c.update(0.05); if (ch) seen.push(ch); assert.ok(c.level >= 0 && c.level <= 1); }
  assert.deepEqual(seen.slice(0, 3), ['hush', 'quiet', 'loud']);
  assert.ok(c.cycles >= 3);
  const g = new Chorus({ rand: () => 0.5, gentle: true }), n = new Chorus({ rand: () => 0.5 });
  assert.ok(g.len('hush') > n.len('hush') && g.dur > n.dur, 'the first try is gentler');
});

test('frogs: moving in the quiet startles (after a grace), walking in the song never does; every third startle the singer flees', () => {
  const st = {};
  for (let t = 0; t < 5; t += 0.05) assert.equal(sneakStep(st, { moving: true, quiet: false, dist: 10, dt: 0.05 }), null);
  assert.equal(sneakStep(st, { moving: true, quiet: true, dist: 10, dt: GRACE / 2 }), null);   // a slow reaction is forgiven
  assert.equal(sneakStep(st, { moving: false, quiet: true, dist: 10, dt: 1 }), null);
  const evs = [];
  for (let t = 0; t < 12; t += 0.05) { const e = sneakStep(st, { moving: true, quiet: true, dist: 10, dt: 0.05 }); if (e) evs.push(e); }
  assert.ok(evs.length >= FLEE_EVERY && evs.length <= 12 / 1.4 + 1, evs.join());
  assert.equal(evs[FLEE_EVERY - 1], 'flee');
  assert.ok(evs.slice(0, FLEE_EVERY - 1).every(e => e === 'startle'));
  // reaching: close, and not caught moving in the quiet
  assert.equal(sneakStep({}, { moving: true, quiet: false, dist: REACH - 0.1, dt: 0.05 }), 'reach');
  assert.equal(sneakStep({}, { moving: false, quiet: true, dist: REACH - 0.1, dt: 0.05 }), 'reach');
  assert.equal(sneakStep({}, { moving: true, quiet: true, dist: REACH - 0.1, dt: 0.05 }), null);
});

test('frogs: call-and-answer grows longer, forgives one mistake, and scores 5 per call', () => {
  const s = new Simon({ count: 4, start: 3, max: 5, rand: rng(9) });
  for (let i = 1; i < s.seq.length; i++) assert.notEqual(s.seq[i], s.seq[i - 1], 'no frog twice in a row');
  const play = () => { let r; for (const i of [...s.seq]) r = s.press(i); return r; };
  assert.equal(play(), 'round');
  assert.equal(s.len, 4);
  const wrong = (s.seq[0] + 1) % 4;
  assert.equal(s.press(wrong), 'wrong');
  assert.equal(s.at, 0, 'the same call again');
  assert.equal(play(), 'round');
  assert.equal(play(), 'done');
  assert.equal(s.points, 5 * (3 + 4 + 5));
  assert.equal(s.press(0), 'done');
  const t = new Simon({ count: 3, start: 3, rand: rng(2) });
  t.press((t.seq[0] + 1) % 3);
  assert.equal(t.press((t.seq[0] + 1) % 3), 'done', 'two mistakes end it');
  assert.equal(t.points, 0);
});

test('frogs: scoring fits the stars (30 / 60 / 90)', () => {
  const [one, two, three] = TRICK.frogs.stars;
  assert.equal(frogsScore({ reached: false, simon: 0 }), 0);
  assert.ok(frogsScore({ startles: 0, reached: true, simon: 0 }) >= one, 'a clean stalk is a star');
  assert.ok(frogsScore({ startles: 2, reached: true, simon: 5 * 3 }) < two);
  assert.ok(frogsScore({ startles: 0, reached: true, simon: 5 * (3 + 4 + 5) }) >= three);
  assert.equal(sneakScore(10), 10);
});

test('frogs: the bottom paddies have bund spots for the frogs, each beside paddy water', () => {
  const p = TRICK.frogs.place, s = bundSpots(p.x, p.z, 22);
  assert.ok(s.length > 30, `${s.length}`);
  for (const q of s.slice(0, 40)) assert.ok(paddyWater(q.wx, q.wz) !== null, 'water beside each spot');
  assert.ok(s.some(q => Math.hypot(q.x - p.x, q.z - p.z) > 9 && Math.hypot(q.x - p.x, q.z - p.z) < 16), 'a singer spot 9-16 m off');
});

test('ambient frogs: on the paddy bunds and river banks, singing loudest at dusk', () => {
  const placed = scatter((x, z) => grid.heightAt(x, z), () => true, 0.85);
  const plan = planCritters(placed, grid, () => 0.6);
  assert.ok(plan.frog.length >= 20, `${plan.frog.length}`);
  for (const f of plan.frog) assert.ok(Number.isFinite(f.wx) && Number.isFinite(f.wy), 'every frog knows where to dive');
  assert.ok(croakRate(20) > croakRate(12) * 5 && croakRate(23) > croakRate(12));
});
