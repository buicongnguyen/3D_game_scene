// © 2026 Bui Cong Nguyen · solluxlabs.com
// One Explore with a show layer (docs/EXPLORE-AND-SHOW.md): the calendar and Go to…'s forward-only rules, the festival's
// pure parts, the Explore moves pack contract, Play as's lists and petting distances, the late festival night.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { SEASONS, SEASON_DAYS, TIMES, MOMENTS, calendarOf, travel, applyTravel, valleyTime, landingLabel, DAY_MS } from '../src/game/valley-clock.js';
import { lanternRing, festivalWeather, isFestivalEvening, LATE } from '../src/game/festival.js';
import { PACK_MOVES, ALIASES, PINGPONG, HIPS_RULE, pingpong, retargetMove } from '../src/actors/body-moves.js';
import { MIKA, SAKI, MIKA_ONLY, PET, petDistance, playAsList, savedPlayAs } from '../src/game/play-as.js';
import { STAGES, FESTIVAL_STAGE } from '../src/content/stages.js';
import { SINGERS, NIGHT_STAR } from '../src/content/troupe.js';
import { TIME_CHOICES } from '../src/game/singplay/time-row.js';
import { Planner } from '../src/game/schedule.js';

const cal = (o = {}) => ({ season: 'spring', sd: 2, hour: 10, days: 5, festival: false, ...o });

test('Go to: a later hour is today, an earlier one tomorrow; nothing ever goes back', () => {
  let r = travel(cal(), { hour: 21 });
  assert.deepEqual([r.season, r.sd, r.hour, r.skipped, r.days], ['spring', 2, 21, 0, 5]);
  r = travel(cal(), { hour: 8 });
  assert.deepEqual([r.season, r.sd, r.hour, r.skipped, r.days], ['spring', 3, 8, 1, 6]);
  r = travel(cal(), { hour: 10 });
  assert.equal(r.skipped, 1, 'the same hour again is tomorrow, not now');
  // the last day of a season carries into the next one
  r = travel(cal({ sd: SEASON_DAYS - 1, hour: 22 }), { hour: 8 });
  assert.deepEqual([r.season, r.sd, r.skipped], ['summer', 0, 1]);
  // every landing is at or after where it left
  for (const s of SEASONS) for (const h of [0, 7.5, 12, 21]) for (const sd of [0, 3, SEASON_DAYS - 1]) for (const to of [{ hour: h }, { season: s }, { season: s, hour: h }]) {
    const c = cal({ season: s, sd, hour: 13 }), x = travel(c, to);
    assert.ok(x.days >= c.days && (x.skipped > 0 || x.hour >= c.hour || x.same), `${s} ${sd} ${JSON.stringify(to)}`);
  }
});

test('Go to: a season is its first day; the season it is in comes round again a year on', () => {
  let r = travel(cal(), { season: 'summer', hour: 20.5 });
  assert.deepEqual([r.season, r.sd, r.hour, r.skipped], ['summer', 0, 20.5, SEASON_DAYS - 2]);
  r = travel(cal(), { season: 'winter' });
  assert.deepEqual([r.season, r.sd, r.hour, r.skipped], ['winter', 0, 10, SEASON_DAYS - 2 + 2 * SEASON_DAYS]);
  r = travel(cal(), { season: 'spring', hour: 7.5 });
  assert.deepEqual([r.season, r.sd, r.skipped], ['spring', 3, 1], 'this season again, an hour past: tomorrow');
  r = travel(cal({ sd: SEASON_DAYS - 1 }), { season: 'spring', hour: 7.5 });
  assert.deepEqual([r.season, r.sd, r.skipped], ['spring', 0, 1 + 3 * SEASON_DAYS], 'its last day: a year on');
  r = travel(cal(), { season: 'spring', hour: 18 });
  assert.equal(r.skipped, 0, 'this season, later today');
});

test('Go to: the festival switch moves no time; moments; the save and the valley date', () => {
  let r = travel(cal(), { festival: true });
  assert.deepEqual([r.skipped, r.hour, r.festival, r.same], [0, 10, true, false]);
  assert.equal(travel(cal({ festival: true }), { festival: true }).same, true);
  assert.equal(MOMENTS.length, 4);
  assert.deepEqual(MOMENTS.map(m => m.season), SEASONS, 'one moment a season');
  assert.equal(MOMENTS.find(m => m.id === 'festival').festival, true);
  assert.ok(MOMENTS.filter(m => m.id !== 'festival').every(m => m.festival === undefined), 'other moments keep the switch as it is');
  assert.deepEqual(TIMES.map(t => [t.id, t.hour]), TIME_CHOICES.map(c => [c.id, c.hour]), "the show's Time chip and Go to… share the hours");
  const st = { season: 'spring', hour: 10, explore: { playAs: 'nu-3' } };
  applyTravel(st, travel(calendarOf(st), { season: 'autumn', hour: 15.5 }));
  assert.equal(st.explore.playAs, 'nu-3', 'other Explore fields kept');
  assert.deepEqual(calendarOf(st), { season: 'autumn', sd: 0, hour: 15.5, days: 14, festival: false });
  assert.equal(valleyTime(3, 1000).getTime(), 1000 + 3 * DAY_MS);
  assert.equal(valleyTime(-2, 1000).getTime(), 1000, 'never behind the real date');
  assert.deepEqual(calendarOf({}), { season: 'spring', sd: 0, hour: 10, days: 0, festival: false });
  assert.deepEqual(calendarOf({ season: 'mud', hour: NaN, explore: { sd: 99, days: -4 } }), { season: 'spring', sd: SEASON_DAYS - 1, hour: 10, days: 0, festival: false });
  assert.equal(landingLabel(cal(), { hour: 21 }).key, 'Later today');
  assert.equal(landingLabel(cal(), { hour: 8 }).key, 'Tomorrow');
  assert.equal(landingLabel(cal(), { season: 'summer' }).vars.n, 1);
});

test('the festival: its stage, its lanterns round the performers (not toward the camera), fireflies and the tune', () => {
  assert.ok(FESTIVAL_STAGE && FESTIVAL_STAGE.festival && STAGES.includes(FESTIVAL_STAGE));
  const ring = lanternRing({ x: 0, z: 0, facing: 0 });
  assert.equal(ring.poles.length, 4);
  assert.ok(ring.lanterns.length >= 30);
  // the camera stands on -z (facing 0: the view is +z behind the performers): no string runs across the front
  assert.ok(ring.lanterns.every(l => l.z > -2 + 1e-6 || Math.abs(Math.abs(l.x) - 7.5) < 1e-6), 'no lanterns hang across the front');
  assert.ok(ring.lanterns.every(l => Math.hypot(l.x, l.z) > 3), 'none over the performers');
  assert.equal(festivalWeather({ on: true, night: 0.8, season: 'summer' }), 'fireflies');
  assert.equal(festivalWeather({ on: true, night: 0.8, season: 'winter' }), null, 'winter keeps its snow');
  assert.equal(festivalWeather({ on: true, night: 0.1, season: 'summer' }), null);
  assert.equal(festivalWeather({ on: false, night: 0.9, season: 'summer' }), null);
  assert.ok(isFestivalEvening(20) && !isFestivalEvening(12) && !isFestivalEvening(23.5));
});

test('a festival night: people stay out until LATE, then go home', () => {
  const person = { id: 't', home: 'h', plan: [{ from: 6, at: [0, 0], do: 'Idle' }, { from: 17, at: [5, 5], do: 'Idle' }] };
  const roads = { route: (a, b) => [a, b] };
  const run = (hour, late) => { const P = new Planner(person, roads); P.update(0, hour, { pos: [5, 5], late }); return P.update(0.1, hour, { pos: [5, 5], late }); };
  const P1 = new Planner(person, roads); P1.update(0, 21, { pos: [5, 5] });
  assert.equal(P1.atNight, true, 'a plain night: home');
  const P2 = new Planner(person, roads); P2.update(0, 21, { pos: [5, 5], late: LATE });
  assert.notEqual(P2.atNight, true, 'a festival night: still out at 21:00');
  const P3 = new Planner(person, roads); P3.update(0, 23.5, { pos: [5, 5], late: LATE });
  assert.equal(P3.atNight, true, 'home after LATE');
  void run;
});

test('the Explore moves pack: its list is the bake list, aliases and the there-and-back pickup', () => {
  const list = JSON.parse(fs.readFileSync(new URL('../art/blender/explore_moves.json', import.meta.url), 'utf8'));
  assert.deepEqual(list.map(x => x[0]).sort(), [...PACK_MOVES].sort());
  for (const [alias, from] of Object.entries(ALIASES)) assert.ok(PACK_MOVES.includes(from) && !PACK_MOVES.includes(alias), alias);
  for (const n of [...Object.keys(PINGPONG), ...Object.keys(HIPS_RULE)]) assert.ok(PACK_MOVES.includes(n), n);
  // the moves an Explore body is asked for (actors/player.js, ground poses, indoor sits, petting) are all there
  for (const n of ['Jump', 'Fall', 'Land', 'Swim', 'Tread', 'Sit', 'SitFloor', 'SitGrass', 'Crouch', 'CrouchWalk', 'CrouchReach', 'CrouchReachHold', 'Kneel', 'Pickup', 'Interact', 'Pet', 'PetLow', 'Pat', 'PatHigh', 'Hang'])
    assert.ok(PACK_MOVES.includes(n) || ALIASES[n], n);
  const clip = new THREE.AnimationClip('Pickup', 1, [new THREE.NumberKeyframeTrack('a.x', [0, 0.5, 1], [0, 1, 2])]);
  const pp = pingpong(clip, 1);
  assert.equal(pp.duration, 1);
  assert.deepEqual(Array.from(pp.tracks[0].times), [0, 0.25, 0.5, 0.75, 1]);
  assert.deepEqual(Array.from(pp.tracks[0].values), [0, 1, 2, 1, 0], 'down and back up');
});

test('a pack clip on another body: rest turns kept, hips travel by the leg ratio, flat and seat rules', () => {
  const q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.2);
  const src = new Map([['hips', { q: q0, p: new THREE.Vector3(0, 0.9, 0) }], ['spine', { q: q0, p: new THREE.Vector3() }]]);
  const dst = new Map([['hips', { q: q0, p: new THREE.Vector3(0, 1.0, 0) }], ['spine', { q: q1, p: new THREE.Vector3() }]]);
  const clip = new THREE.AnimationClip('Jump', 1, [
    new THREE.QuaternionKeyframeTrack('spine.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
    new THREE.VectorKeyframeTrack('hips.position', [0, 1], [0, 0.9, 0, 0.1, 1.2, 0]),
  ]);
  const plain = retargetMove(clip, src, dst, { k: 1.1 });
  const sp = plain.tracks.find(t => t.name === 'spine.quaternion'), hp = plain.tracks.find(t => t.name === 'hips.position');
  assert.ok(Math.abs(new THREE.Quaternion().fromArray(sp.values, 0).angleTo(q1)) < 1e-6, 'a rest pose stays that body\'s rest');
  assert.ok(Math.abs(hp.values[4] - (1.0 + 0.3 * 1.1)) < 1e-6 && Math.abs(hp.values[3] - 0.11) < 1e-6, 'hips travel scaled');
  const flat = retargetMove(clip, src, dst, { k: 1.1, rule: 'flat' }).tracks.find(t => t.name === 'hips.position');
  assert.ok(Math.abs(flat.values[1] - 1.0) < 1e-6 && Math.abs(flat.values[4] - 1.0) < 1e-6, 'flat: the game lifts her');
  const seat = retargetMove(clip, src, dst, { k: 1, rule: { seat: 0.45 }, over: 1.0 }).tracks.find(t => t.name === 'hips.position');
  assert.ok(Math.abs((seat.values[1] + seat.values[4]) / 2 - 0.45) < 1e-6, 'seat: the hips 0.45 m over her root on average');
});

test('Play as: Mika and the singers, Stella once seen; Mika-only activities; petting distances', () => {
  const store = { getItem: () => null };
  assert.deepEqual(playAsList(store), [MIKA, ...SINGERS]);
  assert.deepEqual(playAsList(store, new URLSearchParams('nightstar=1')), [MIKA, ...SINGERS, NIGHT_STAR]);
  assert.ok(SINGERS.includes(SAKI));
  assert.equal(savedPlayAs({ explore: { playAs: 'nu-3' } }, playAsList(store)), 'nu-3');
  assert.equal(savedPlayAs({ explore: { playAs: NIGHT_STAR } }, playAsList(store)), MIKA, 'Stella not met yet: Mika');
  assert.equal(savedPlayAs({}, playAsList(store)), MIKA);
  assert.deepEqual(MIKA_ONLY.map(a => a.id).sort(), ['cook', 'fish', 'ride', 'sky', 'trick', 'workshop', 'yard']);
  for (const [kind, spec] of Object.entries(PET)) {
    assert.ok(['PetLow', 'Pat', 'PatHigh'].includes(spec.clip), kind);
    const high = petDistance(spec, { fwd: 0.5, up: spec.h + 0.1 }), low = petDistance(spec, { fwd: 0.5, up: spec.h - 0.2 });
    assert.ok(high < low, `${kind}: a hand over the back reaches in further than one at the flank`);
    assert.ok(low >= 0.5 + spec.r, `${kind}: a low hand stays outside the body`);
  }
});
