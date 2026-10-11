// Cow race: the rules (game/tricks/rules-cowrace.js), the trick row and the track site.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACK, BEAT, STARS, KIDS, newRace, stepRace, tap, simulate, raceScore, gradeTap, beatOffset, result, placeNow, finish } from '../src/game/tricks/rules-cowrace.js';

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

test('the race is replayable: same seed, same result', () => {
  const a = simulate(7, { jitter: 0.04 }), b = simulate(7, { jitter: 0.04 });
  assert.equal(a.place, b.place);
  assert.equal(a.time, b.time);
  assert.deepEqual(a.order, b.order);
});

test('the four cows have four different lanes, Mika first', () => {
  for (const seed of SEEDS) {
    const race = newRace({ seed });
    assert.equal(race.racers.length, 4);
    assert.equal(race.racers[0].id, 'mika');
    assert.deepEqual(race.racers.slice(1).map(r => r.name), KIDS);
    assert.equal(new Set(race.racers.map(r => r.lane)).size, 4);
  }
});

test('tap grading: on the beat is good, a little off is ok, between beats is a miss', () => {
  const race = newRace({ seed: 1 });
  assert.equal(gradeTap(race, BEAT * 3), 'good');
  assert.equal(gradeTap(race, BEAT * 3 + 0.1), 'good');
  assert.equal(gradeTap(race, BEAT * 3 + 0.2), 'ok');
  assert.equal(gradeTap(race, BEAT * 3.5), 'miss');
  assert.ok(Math.abs(beatOffset(BEAT * 5 + 0.05) - 0.05) < 1e-9);
  const easy = newRace({ seed: 1, assist: 1 });
  assert.ok(easy.window.good > race.window.good && easy.window.ok > race.window.ok, 'the first lap has a wider window');
});

test('a careful rhythm bot wins at least half of the races', () => {
  let wins = 0;
  for (const seed of SEEDS) if (simulate(seed, { jitter: 0.035 }).place === 1) wins++;
  assert.ok(wins >= SEEDS.length / 2, `careful bot won ${wins}/${SEEDS.length}`);
});

test('a perfect rhythm bot wins nearly always, a sloppy one only sometimes', () => {
  let perfect = 0, sloppy = 0;
  for (const seed of SEEDS) { if (simulate(seed, { jitter: 0.01 }).place === 1) perfect++; if (simulate(seed, { jitter: 0.2, lazy: 0.4 }).place === 1) sloppy++; }
  assert.ok(perfect >= SEEDS.length * 0.8, `perfect ${perfect}`);
  assert.ok(sloppy < perfect, `sloppy ${sloppy} vs perfect ${perfect}`);
});

test('a beginner (sloppy taps, Easy window) wins some races but not all', () => {
  let wins = 0;
  for (const seed of SEEDS) if (simulate(seed, { jitter: 0.2, lazy: 0.3 }, { assist: 0.5 }).place === 1) wins++;
  assert.ok(wins >= 5 && wins < SEEDS.length, `beginner won ${wins}/${SEEDS.length}`);
});

test('an idle player never wins, and is not last by a mile either', () => {
  for (const seed of SEEDS) {
    const r = simulate(seed, { idle: true });
    assert.ok(r.place >= 3, `seed ${seed}: idle place ${r.place}`);
  }
});

test('mashing is slower than keeping the beat', () => {
  let rhythm = 0, mash = 0;
  for (const seed of SEEDS) {
    const a = simulate(seed, { jitter: 0.03 }), b = simulate(seed, { mash: true });
    rhythm += a.time ?? TRACK.timeout; mash += b.time ?? TRACK.timeout;
    assert.ok(b.place >= 2, `seed ${seed}: mashing won`);
  }
  assert.ok(mash > rhythm * 1.12, `mash ${mash.toFixed(0)} s vs rhythm ${rhythm.toFixed(0)} s in total`);
});

test('mashing tires the cow, and it puffs', () => {
  const race = newRace({ seed: 3 });
  for (let i = 0; i < 12; i++) { race.t += 0.1; tap(race); }
  assert.ok(race.events.some(e => e.type === 'tired'));
  assert.ok(race.racers[0].tiredT > 0);
});

test('the mud slows everybody, the grass speeds them up', () => {
  const race = newRace({ seed: 5 });
  const kid = race.racers[1];
  kid.s = TRACK.mud[0] + 0.2; kid.v = 2.55;
  for (let i = 0; i < 90; i++) stepRace(race, 1 / 60);
  assert.ok(kid.v < 2.0, `kid in the mud: ${kid.v.toFixed(2)}`);
  const k2 = race.racers[2];
  k2.s = TRACK.grass[0] - 0.2;
  for (let i = 0; i < 30; i++) stepRace(race, 1 / 60);
  assert.ok(k2.grass[0] && k2.boostT > 0, 'the grass bundle was eaten');
});

test('races take about twenty to forty seconds, scores and stars follow the place', () => {
  const times = SEEDS.map(seed => simulate(seed, { jitter: 0.035 }).time);
  for (const t of times) assert.ok(t > 14 && t < 40, `time ${t}`);
  assert.equal(raceScore(1, 25) >= STARS[2], true, '1st place is three stars');
  assert.equal(raceScore(1, 60) >= STARS[2], true, '1st place is three stars even when slow');
  assert.ok(raceScore(4, null) < STARS[0], 'last place without finishing earns nothing');
  assert.ok(raceScore(2, 25) >= STARS[1] && raceScore(2, 25) < STARS[2]);
  assert.ok(raceScore(3, 25) >= STARS[0] && raceScore(3, 25) < STARS[1]);
  assert.ok(raceScore(1, 20) > raceScore(1, 30), 'a quicker win scores more');
});

test('the race ends, places are 1..4 once each, and Mika gets a place while running', () => {
  const r = simulate(11, { idle: true });
  assert.deepEqual(r.race.racers.map(x => x.place).sort(), [1, 2, 3, 4]);
  const race = newRace({ seed: 2 });
  assert.equal(placeNow(race), 1, 'level at the start counts as first');
  finish(race);
  assert.ok(race.over);
  assert.ok(result(race).stars >= 0);
});

test('the track fits the pasture: the lanes are 12 m wide and the mud sits between the grass bundles', () => {
  assert.equal(TRACK.lanes * TRACK.laneW, 12);
  assert.ok(TRACK.grass[0] < TRACK.mud[0] && TRACK.mud[1] < TRACK.grass[1] && TRACK.grass[1] < TRACK.len);
});

// ---------------------------------------------------------------------------------------------------------- the site
import { SITE, SITE_RECT } from '../src/content/cowtrack.js';
import { TRICK } from '../src/content/tricks.js';
import { HAY } from '../src/actors/cow-ride.js';
import { DIALOGUE, FRIENDS } from '../src/game/story.js';
import { useStory } from '../src/game/stories/index.js';
import { placeProblems, sharedGrid, inFootprint } from '../src/world/roads.js';
import { PATHS, PADDIES, FALLEN_STARS } from '../src/world/layout.js';
import { TRICKS } from '../src/content/tricks.js';
import { SKY_SPOTS } from '../src/content/skyspots.js';
import { FARM } from '../src/content/farm.js';
import { YARD_LIST } from '../src/content/yard.js';

const segDist = (ax, az, bx, bz, px, pz) => {
  const vx = bx - ax, vz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz || 1e-9)));
  return Math.hypot(ax + vx * t - px, az + vz * t - pz);
};

test('the site matches the rules and its ground is dry, gentle and level enough', () => {
  assert.equal(SITE.len, TRACK.len);
  assert.equal(SITE.lanes, TRACK.lanes);
  assert.equal(SITE.laneW, TRACK.laneW);
  const g = sharedGrid();
  let lo = 1e9, hi = -1e9;
  for (let x = SITE_RECT.x0; x <= SITE_RECT.x1; x += 2) for (let z = SITE_RECT.z0; z <= SITE_RECT.z1; z += 2) {
    assert.deepEqual(placeProblems(x, z), [], `(${x}, ${z})`);
    assert.ok(!inFootprint(x, z, 2.5), `(${x}, ${z}) is at a wall`);
  }
  for (let s = -2; s <= SITE.len + 2; s += 2) for (let l = 0; l <= TRACK.lanes; l++) {
    const x = SITE.x0 + s, z = SITE.z + (l - TRACK.lanes / 2) * TRACK.laneW, h = g.heightAt(x, z);
    lo = Math.min(lo, h); hi = Math.max(hi, h);
    assert.ok(g.slopeAt(x, z) < 11, `slope ${g.slopeAt(x, z).toFixed(1)} at (${x}, ${z})`);
  }
  assert.ok(hi - lo < 1.2, `the track is level to ${(hi - lo).toFixed(2)} m`);
});

test('the site is clear of roads, paddies, signs, sky spots, fallen stars, animals and the yards', () => {
  const R = SITE_RECT, pts = [];
  for (let x = R.x0; x <= R.x1; x += 3) for (let z = R.z0; z <= R.z1; z += 3) pts.push([x, z]);
  for (const p of PATHS) for (let i = 0; i + 1 < p.pts.length; i++) for (const [x, z] of pts) assert.ok(segDist(...p.pts[i], ...p.pts[i + 1], x, z) > p.w / 2 + 1.5, `(${x}, ${z}) is on a ${p.w} m road`);
  for (const p of PADDIES) for (const [x, z] of pts) assert.ok(Math.abs(x - p.x) > p.w / 2 + 3 || Math.abs(z - p.z) > p.d / 2 + 3, p.id);
  for (const t of TRICKS) if (t.id !== 'cowrace') for (const [x, z] of pts) assert.ok(Math.hypot(x - t.place.x, z - t.place.z) > 6, `${t.id} sign`);
  for (const s of SKY_SPOTS) if (s.on === 'ground') for (const [x, z] of pts) assert.ok(Math.hypot(x - s.x, z - s.z) > s.r + 5, `sky spot ${s.id}`);
  for (const s of FALLEN_STARS) for (const [x, z] of pts) assert.ok(Math.hypot(x - s.x, z - s.z) > 6, s.id);
  for (const [id, , fx, fz, , r] of FARM) for (const [x, z] of pts) assert.ok(Math.hypot(x - fx, z - fz) > r + 2, `${id} roams here`);
  for (const Y of YARD_LIST) for (const [x, z] of pts) assert.ok(Math.hypot(Math.max(Y.fence.x0 - x, 0, x - Y.fence.x1), Math.max(Y.fence.z0 - z, 0, z - Y.fence.z1)) > 6, `the ${Y.id} yard`);
});

test('the trick sign stands on dry ground next to the track, not on it', () => {
  const t = TRICK.cowrace, half = SITE.lanes * SITE.laneW / 2;
  assert.deepEqual(placeProblems(t.place.x, t.place.z), []);
  assert.ok(Math.abs(t.place.z - SITE.z) > half + 1.5 || t.place.x < SITE.x0 - SITE.margin - 1, 'the sign is off the lanes');
  assert.ok(Math.hypot(t.place.x - SITE.x0, t.place.z - SITE.z) < 14, 'and close to the start');
  assert.ok(t.stars[0] > 0 && STARS.join() === t.stars.join(), 'the stars match the rules');
});

test('the haystacks stand on dry ground clear of the track, roads and animals own ground', () => {
  for (const h of HAY) {
    assert.deepEqual(placeProblems(h.x, h.z), [], h.id);
    assert.ok(!inFootprint(h.x, h.z, 2), `${h.id} haystack at a wall`);
    for (const p of PATHS) for (let i = 0; i + 1 < p.pts.length; i++) assert.ok(segDist(...p.pts[i], ...p.pts[i + 1], h.x, h.z) > p.w / 2 + 1.2, `${h.id} on a road`);
    assert.ok(FARM.some(([, kind, fx, fz]) => kind === 'cow' && Math.hypot(h.x - fx, h.z - fz) < 14), `${h.id} is by a cow pasture`);
  }
});

test('the dialogue: both stories teach the race, the cow friend exists in the journal', () => {
  for (const story of ['classic', 'grandma']) {
    useStory(story);
    const lines = DIALOGUE[TRICK.cowrace.intro];
    assert.ok(lines?.length >= 3, story);
    assert.ok(lines.some(l => l[0] === TRICK.cowrace.teacher[story]), `${story}: taught by ${TRICK.cowrace.teacher[story]}`);
    for (const l of lines) assert.ok(l[1].length <= 135, l[1]);
    for (const k of ['friend_cowpal', 'friend_cowpal_solo']) assert.ok(DIALOGUE[k]?.length, `${story}: ${k}`);
  }
  useStory('classic');
  assert.ok(FRIENDS.some(f => f.id === 'cowpal' && f.icon && f.desc && f.hint && f.verb));
});
