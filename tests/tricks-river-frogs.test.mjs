import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NIGHT_FISH, pickSpecies, spotStep, riverScore, shallowSpots, HOLD, RADIUS, RIVER_LEVELS, riverLevel, pickLate, pickList, splashStep, SPLASH, LIST_BONUS, SHRIMP_PER_POINT } from '../src/game/tricks/river.js';
import { Chorus, sneakStep, sneakScore, Simon, frogsScore, bundSpots, paddyWater, REACH, GRACE, FLEE_EVERY, FROG_LEVELS, frogLevel, frogsBest, tooClose } from '../src/game/tricks/frogs.js';
import { LEVELS, levelSpec } from '../src/content/levels.js';
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
  // every level: three stars are in reach of a round that names every fish (four kinds) and counts most of the shrimp
  for (const l of LEVELS) {
    const L = riverLevel(l), s = levelSpec(TRICK.river, l).stars;
    const all = riverScore({ named: L.fish + L.more, species: 4, shrimp: 18, list: L.list > 0 });
    assert.ok(all >= s[2], `${l}: every fish scores ${all}, three stars at ${s[2]}`);
    assert.ok(riverScore({ named: 3, species: 2, shrimp: 3 }) >= levelSpec(TRICK.river, 'easy').stars[0], 'one star on Easy is three fish');
    // ...and not of the fish alone on Normal and Difficult: the shrimp or the list are needed too
    if (l !== 'easy') assert.ok(riverScore({ named: L.fish, species: 3 }) < s[1], `${l}: the first part alone is not two stars`);
  }
  assert.equal(riverScore({ named: 2, species: 2, shrimp: 0, list: true }), 3 + LIST_BONUS);
  assert.ok(SHRIMP_PER_POINT === 3);
});

test('river levels: fewer fish and a quicker naming on Easy, a second part on Normal, shy fish and a list on Difficult', () => {
  assert.equal(riverLevel('easy', false), RIVER_LEVELS.easy);
  assert.equal(riverLevel('hard', true), RIVER_LEVELS.easy, 'the guided try is the Easy river');
  const { easy, normal, hard } = RIVER_LEVELS;
  assert.ok(easy.fish < normal.fish && easy.more === 0 && normal.more > 0 && hard.more >= normal.more);
  assert.ok(easy.hold < HOLD && normal.hold === HOLD && !normal.shy && hard.shy && hard.list === 3 && !normal.list);
  // a shorter hold names a fish sooner
  const quick = [{ x: 0, z: 0, named: false, hold: 0 }];
  let t = 0;
  while (!spotStep(quick, 0.2, 0, 0.05, RADIUS, easy.hold) && t < 3) t += 0.05;
  assert.ok(Math.abs(t - easy.hold) < 0.11, `named after ${t}`);
  // a fish that is not out yet, or has darted off, cannot be named
  const hid = [{ x: 0, z: 0, named: false, hold: 0, hidden: true }, { x: 0.4, z: 0, named: false, hold: 0, shyT: 2 }];
  for (let k = 0; k < 40; k++) assert.equal(spotStep(hid, 0, 0, 0.05), null);
  // the second part is mostly the fish of the night
  const R = rng(8), late = pickLate(6, R);
  assert.equal(late.length, 6);
  assert.ok(late.filter(k => NIGHT_FISH[k].night).length >= 4, late.join());
  // the list: three different kinds out of tonight's, one of the night among them
  for (let k = 0; k < 30; k++) {
    const kinds = [...pickSpecies(9, R), ...pickLate(6, R)], list = pickList(kinds, 3, R);
    assert.equal(new Set(list).size, list.length);
    assert.ok(list.length === Math.min(3, new Set(kinds).size) && list.every(x => kinds.includes(x)));
    assert.ok(list.some(x => NIGHT_FISH[x].night), list.join());
  }
  assert.deepEqual(pickList([], 3, R), []);
});

test('river, Difficult: a splash near a fish sends it off for a while; wading softly never does', () => {
  const mk = () => [{ x: 2, z: 0, named: false, hold: 0.6, shyT: 0 }, { x: 9, z: 0, named: false, hold: 0, shyT: 0 }, { x: 1, z: 1, named: true, hold: 1, shyT: 0 }];
  let fish = mk();
  for (let t = 0; t < 5; t += 0.05) assert.equal(splashStep(fish, 0, 0, SPLASH.speed - 0.05, 0.05), 0, 'a soft wade');
  assert.equal(splashStep(fish, 0, 0, SPLASH.speed + 0.5, 0.05), 1, 'a walk right beside it');
  const f = fish[0];
  assert.ok(f.shyT === SPLASH.calm && f.hold === 0, 'it darts off and the naming starts again');
  assert.ok(f.dx > 0 && Math.abs(Math.hypot(f.dx, f.dz) - SPLASH.dart) < 1e-6, 'away from her');
  assert.ok(!fish[1].shyT && !fish[2].shyT, 'not the far one, nor one already named');
  assert.equal(spotStep(fish, 2, 0, 0.5), null, 'no naming while it hides');
  assert.equal(splashStep(fish, 0, 0, 3, 0.05), 0, 'it is off already');
  let t = 0;
  while (f.shyT > 0 && t < 10) { splashStep(fish, 20, 20, 0, 0.05); t += 0.05; }
  assert.ok(Math.abs(t - SPLASH.calm) < 0.2, `calm again after ${t} s`);
  fish = mk();
  assert.equal(splashStep(fish, 2 + SPLASH.near + 0.2, 0, 4, 0.05), 0, 'too far to hear');
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

test('frogs: scoring fits the stars of every level', () => {
  assert.equal(frogsScore({ reached: false, simon: 0 }), 0);
  assert.equal(frogsScore({ startles: 1, reached: true, simon: 15 }), 45);
  assert.equal(frogsScore({ sneaks: [{ startles: 0, reached: true }, { startles: 2, reached: true }], simon: 35 }), 35 + 25 + 35);
  assert.equal(frogsScore({ sneaks: [{ startles: 0, reached: true }, { startles: 4, reached: false }], simon: 0 }), 35, 'a singer not reached scores nothing');
  assert.equal(sneakScore(10), 10);
  assert.deepEqual(LEVELS.map(l => frogsBest(frogLevel(l))), [80, 130, 160]);
  for (const l of LEVELS) {
    const L = frogLevel(l), [one, two, three] = levelSpec(TRICK.frogs, l).stars, best = frogsBest(L);
    const clean = Array.from({ length: L.sneaks }, () => ({ startles: 0, reached: true }));
    const rough = Array.from({ length: L.sneaks }, () => ({ startles: 3, reached: true }));
    assert.ok(frogsScore({ sneaks: clean, simon: 0 }) >= one, `${l}: clean sneaking is a star`);
    assert.ok(frogsScore({ sneaks: rough, simon: 5 * L.start }) < two, `${l}: a rough sneak and one song is not two`);
    assert.ok(three <= best - 5 && three >= best - 20, `${l}: three stars (${three}) leave a slip or two below the best (${best})`);
    assert.ok(frogsScore({ sneaks: clean, simon: best - L.sneaks * 35 - 5 * L.max }) < three, `${l}: three stars need the longest song too`);
  }
  assert.ok(frogsScore({ startles: 0, reached: true, simon: 5 * 2 }) >= levelSpec(TRICK.frogs, 'easy').stars[0], 'the guided try earns a star');
});

test('frog levels: one gentle sneak on Easy, two singers on Normal, a wide berth and a ringless song on Difficult', () => {
  const { first, easy, normal, hard } = FROG_LEVELS;
  assert.equal(frogLevel('hard', true), first);
  assert.deepEqual([easy.sneaks, normal.sneaks, hard.sneaks], [1, 2, 2]);
  assert.deepEqual([easy.row, normal.row, hard.row], [3, 4, 5]);
  assert.ok(easy.max < normal.max && normal.max < hard.max && easy.lives > normal.lives);
  assert.ok(easy.gap > normal.gap && normal.gap > hard.gap && hard.gap >= 0.55, 'a quicker call, still one a child can follow');
  assert.ok(easy.rings && normal.rings && !hard.rings && !normal.berth && hard.berth > REACH, 'the berth is wider than the reach');
  // the longest call of every level can be made with its row (no frog twice in a row needs two frogs at least)
  for (const L of Object.values(FROG_LEVELS)) {
    const s = new Simon({ count: L.row, start: L.start, max: L.max, lives: L.lives, rand: rng(L.row) });
    let r = 'ok', guard = 0;
    while (r !== 'done' && guard++ < 200) r = s.press(s.seq[s.at]);
    assert.equal(s.rounds, L.max - L.start + 1);
    assert.equal(s.points + L.sneaks * 35, frogsBest(L));
  }
  // the sharp chorus of Difficult warns for a shorter moment, and its silences differ more
  const sharp = new Chorus({ rand: () => 0.5, sharp: true }), plain = new Chorus({ rand: () => 0.5 });
  assert.ok(sharp.len('hush') < plain.len('hush') && sharp.len('hush') >= 0.4);
  const lo = new Chorus({ rand: () => 0, sharp: true }).len('quiet'), hi = new Chorus({ rand: () => 0.999, sharp: true }).len('quiet');
  assert.ok(hi - lo > 2 && lo >= 1.2);
  assert.ok(!new Chorus({ sharp: true, gentle: true }).sharp, 'never in a gentle round');
  // a wide berth: the nearest sitting frog inside it, never the singer, never one in the water
  const frogs = [{ x: 0, z: 1, st: 'sit' }, { x: 1.5, z: 0, st: 'sit' }, { x: 0.3, z: 0, st: 'swim' }, { x: 5, z: 5, st: 'sit' }];
  assert.equal(tooClose(frogs, 0, 0, hard.berth), frogs[0]);
  assert.equal(tooClose(frogs, 0, 0, hard.berth, frogs[0]), frogs[1]);
  assert.equal(tooClose(frogs, 0, 0, 0.5), null);
  assert.equal(tooClose(frogs, 5, 3, hard.berth), frogs[3]);
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
