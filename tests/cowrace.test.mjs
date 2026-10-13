// Cow race: the rules (game/tricks/rules-cowrace.js), the trick row and the track site.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACK, BEAT, STARS, KIDS, newRace, stepRace, tap, simulate, raceScore, gradeTap, beatOffset, result, placeNow, finish, COURSE, PUDDLE, PUDDLE_S, SURGE_FROM, PLACE_POINTS, meetPlan, meetMax, botSteer, simulateMeet, SPEED, isBareback, steady, botBalance, BUMP_S } from '../src/game/tricks/rules-cowrace.js';
import { BALANCE, STEADY_BONUS, JOLT_FADE, HOP, newBalance, riderState, stepTilt, jolt, rock, botLean } from '../src/game/tricks/rules-cowbalance.js';
import { levelSpec } from '../src/content/levels.js';
import { starsNote, STARS_NOTE as NOTE_ONE, leanPrompt } from '../src/game/tricks/rules-cowhelp.js';

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
  assert.ok(t.stars[0] > 0 && STARS.join() === '30,60,80', 'one race keeps its own marks (the levels\' race days have theirs: see below)');
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

// ------------------------------------------------------------------------------------------------ the levels: a race day
test('race days: Easy two gentle heats, Normal three with a bareback final, Difficult four with sprints, puddles and the rodeo; the first try is Easy with a practice lap', () => {
  const E = meetPlan('easy'), N = meetPlan('normal'), H = meetPlan('hard'), F = meetPlan('hard', true);
  assert.deepEqual(E.heats.map(h => h.course), ['plain', 'classic']);
  assert.deepEqual(N.heats.map(h => h.course), ['classic', 'final', 'bareback']);
  assert.deepEqual(H.heats.map(h => h.course), ['surge', 'puddles', 'grand', 'rodeo']);
  // the levels differ in kind and in length: nobody rides bareback on Easy (or on a first try), Normal ends bareback, Difficult in the rodeo
  assert.deepEqual([E, F, N, H].map(p => p.heats.filter(h => isBareback(h.course)).length), [0, 0, 1, 1]);
  assert.equal(COURSE.bareback.balance, 'gentle'); assert.equal(COURSE.rodeo.balance, 'wild');
  assert.equal(meetMax(H), 4 * 105 + STEADY_BONUS);
  assert.deepEqual(F.heats.map(h => h.course), E.heats.map(h => h.course));
  assert.ok(F.heats[0].practice && F.heats[0].assist === 1 && !F.heats[1].practice && !E.heats[0].practice);
  assert.ok(E.heats.every(h => h.assist > 0) && N.heats.every(h => h.assist === 0) && H.window < N.window);
  assert.equal(meetMax(E), 210); assert.equal(meetMax(N), 315 + STEADY_BONUS);
  for (const plan of [E, N, H]) for (const h of plan.heats) assert.ok(COURSE[h.course], h.course);
  assert.equal(starsNote(1), NOTE_ONE); assert.match(starsNote(3), /Win every heat/);
  // the default race is the classic course, laid out the same for everyone
  const d = newRace({ seed: 9 });
  assert.ok(d.course.mud && d.course.puddles.length === 0 && d.course.surge === 0 && d.course.grass.every(g => g.every(Boolean)));
  assert.ok(!newRace({ seed: 9, course: 'plain' }).course.mud);
  for (let seed = 1; seed <= 30; seed++) {
    const f = newRace({ seed, course: 'final' }).course, g = newRace({ seed, course: 'grand' }).course;
    assert.deepEqual(f, newRace({ seed, course: 'final' }).course, 'a course is seeded');
    for (const lanes of f.grass) assert.equal(lanes.filter(Boolean).length, 2, 'the final: grass in two lanes at each spot');
    assert.equal(g.puddles.length, 8);
    for (const s of PUDDLE_S) {
      const row = g.puddles.filter(p => p.s === s);
      assert.equal(row.length, 2, 'two lanes of every row are dry');
      assert.ok(row.every(p => p.s < TRACK.mud[0] - PUDDLE.half || p.s > TRACK.mud[1] + PUDDLE.half) && row.every(p => TRACK.grass.every(gs => Math.abs(gs - p.s) > 2)), 'puddles lie clear of the mud and the grass');
    }
    assert.equal(newRace({ seed, course: 'puddles' }).course.puddles.length, 6);
  }
});

test('race days: a puddle slows the cow that runs through it, steering round it does not; the kids sprint for the ribbon', () => {
  const run = (lane, steerTo) => {
    const race = newRace({ seed: 5, course: 'puddles', playerLane: lane });
    const me = race.racers[0];
    let hit = 0;
    for (let i = 0; i < 60 * 40 && !race.over; i++) {
      me.combo = 9; me.lastPush = race.t;                       // (a perfect rhythm, so only the course matters)
      stepRace(race, 1 / 60, { steer: steerTo ? botSteer(race) : 0 });
      for (const e of race.events) if (e.type === 'puddle' && e.who === 0) hit++;
      race.events.length = 0;
    }
    return { hit, t: me.finished };
  };
  const C = newRace({ seed: 5, course: 'puddles' }).course;
  const wetLane = [0, 1, 2, 3].sort((a, b) => C.puddles.filter(p => p.lane === b).length - C.puddles.filter(p => p.lane === a).length)[0];
  const through = run(wetLane, false), round = run(wetLane, true);
  assert.ok(through.hit >= 1 && round.hit === 0, `through ${through.hit}, round ${round.hit}`);
  assert.ok(round.t < through.t - 0.3, `steering round is quicker: ${round.t} against ${through.t}`);
  // each puddle splashes a cow once
  const one = newRace({ seed: 5, course: 'puddles', playerLane: wetLane }), p0 = one.course.puddles.find(p => p.lane === wetLane);
  one.racers[0].s = p0.s - 0.2; one.racers[0].v = 1;
  let n = 0;
  for (let i = 0; i < 90; i++) { stepRace(one, 1 / 60); n += one.events.filter(e => e.type === 'puddle' && e.who === 0).length; one.events.length = 0; }
  assert.equal(n, 1);
  // the sprint: over the last metres a kid on a sprint course is faster than the same kid on the classic one
  const a = newRace({ seed: 3, course: 'classic' }), b = newRace({ seed: 3, course: 'surge' });
  for (const r of [a, b]) { r.racers[1].s = TRACK.len - SURGE_FROM + 1; r.racers[0].s = r.racers[1].s; for (let i = 0; i < 120; i++) stepRace(r, 1 / 60); }
  assert.ok(b.racers[1].v > a.racers[1].v * 1.03, `${b.racers[1].v} against ${a.racers[1].v}`);
  assert.deepEqual(PLACE_POINTS, [80, 50, 30, 10]);
});

test('race days: the stars. Easy is easy, Normal wants care and the grass, Difficult wants the beat AND the lanes', () => {
  const N = 80, med = xs => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const day = (level, bot) => Array.from({ length: N }, (_, i) => simulateMeet(i + 1, level, bot).score);
  const stars = (level, xs) => levelSpec(TRICK.cowrace, level).stars.filter(s => med(xs) >= s).length;
  // (in a bareback heat each of them leans as late as they tap: `dead` is how far the marker is out before they react)
  const idle = { idle: true }, beginner = { jitter: 0.2, lazy: 0.25, lean: { dead: 0.55 } }, sloppy = { jitter: 0.14, lazy: 0.1, lean: { dead: 0.45 } },
    noSteer = { jitter: 0.08, lean: { dead: 0.3 } }, noLean = { jitter: 0.08, steer: true }, careful = { jitter: 0.08, steer: true, lean: { dead: 0.3 } };
  for (const level of ['easy', 'normal', 'hard']) assert.equal(stars(level, day(level, idle)), 0, `${level}: never tapping earns nothing`);
  assert.ok(stars('easy', day('easy', beginner)) >= 2, 'Easy: a beginner wins stars');
  assert.equal(stars('easy', day('easy', sloppy)), 3);
  assert.equal(stars('normal', day('normal', beginner)), 1);
  assert.ok(stars('normal', day('normal', sloppy)) >= 2);
  assert.equal(stars('normal', day('normal', careful)), 3);
  assert.ok(stars('hard', day('hard', sloppy)) <= 1, 'Difficult: a loose beat is one star at most');
  assert.ok(stars('hard', day('hard', noSteer)) <= 2, 'a good beat that never changes lane is not three');
  assert.equal(stars('hard', day('hard', careful)), 3, 'the beat, the lanes and the balance together are');
  for (const level of ['normal', 'hard']) assert.ok(stars(level, day(level, noLean)) <= 2, `${level}: a fine rider who never leans in the bareback heat is not three`);
  for (const level of ['easy', 'normal', 'hard']) {
    const s = levelSpec(TRICK.cowrace, level).stars;
    assert.ok(s[2] < meetMax(meetPlan(level)) && s[2] > meetMax(meetPlan(level)) * 0.8, `${level}: three stars are a near-perfect day`);
  }
  // a race day is a few heats of about 25 seconds: two on Easy, three on Normal, four on Difficult, and the longest stays
  // well under two and a half minutes with its countdowns and the podium (about 8 s a heat on top of the racing)
  const len = level => { const d = simulateMeet(3, level, careful); assert.ok(d.times.every(t => t > 14 && t < 40), level); return d.times.reduce((a, b) => a + b, 0) + d.times.length * 8; };
  const [le, ln, lh] = ['easy', 'normal', 'hard'].map(len);
  assert.equal(simulateMeet(3, 'hard', careful).places.length, 4);
  assert.ok(le < ln - 15 && ln < lh - 15 && lh < 140, `round lengths ${le.toFixed(0)} / ${ln.toFixed(0)} / ${lh.toFixed(0)} s`);
});

// ------------------------------------------------------------------------------------------ the bareback heats: balance
const DT = 1 / 60;
/** One bareback heat with a perfect beat held by hand, so only the balance matters. lean: a number, or (race) => number. */
function ride(course, seed, lean = 0, seconds = 45) {
  const race = newRace({ seed, course }), me = race.racers[0], log = { falls: [], warns: [], remounts: [], kidFalls: 0, bumps: 0, maxTilt: 0, stoodStill: true };
  for (let i = 0; i < seconds * 60 && !race.over; i++) {
    if (me.fallT <= 0) { me.combo = 6; me.lastPush = race.t; }
    stepRace(race, DT, { lean: typeof lean === 'function' ? lean(race) : lean, steer: 1 });
    for (const e of race.events) {
      if (e.type === 'fall' && e.who === 0) log.falls.push(race.t);
      else if (e.type === 'fall') log.kidFalls++;
      else if (e.type === 'wobble') log.warns.push(race.t);
      else if (e.type === 'remount' && e.who === 0) log.remounts.push(race.t);
      else if (e.type === 'bump') log.bumps++;
    }
    race.events.length = 0;
    log.maxTilt = Math.max(log.maxTilt, Math.abs(me.tilt));
  }
  return { race, me, ...log };
}

test('balance: only the bareback courses tip her; on Easy and on every saddle heat nobody can fall', () => {
  for (const course of Object.keys(COURSE)) {
    const race = newRace({ seed: 4, course });
    assert.equal(!!race.balance, isBareback(course), course);
  }
  for (const level of ['easy', 'normal', 'hard']) for (const first of [false, true]) for (const h of meetPlan(level, first).heats) {
    if (isBareback(h.course)) continue;
    for (const seed of [1, 2, 3]) {
      const r = ride(h.course, seed, 1, 30);              // leaning hard all race long: it is steering there, never a fall
      assert.equal(r.falls.length, 0, `${level} ${h.course}`); assert.equal(r.me.tilt, 0); assert.equal(r.kidFalls, 0);
    }
  }
  assert.deepEqual(meetPlan('easy').heats.filter(h => isBareback(h.course)), []);
  // a caught wobble (noFall) never becomes a fall either
  const B = newBalance('wild', 3), r = riderState();
  for (let i = 0; i < 60 * 30; i++) assert.notEqual(stepTilt(r, B, i * DT, DT, 1, 2.8, true), 'fall');
  assert.ok(Math.abs(r.tilt) < 1 && r.falls === 0);
});

test('balance: a rider who never leans is in the grass within seconds (sooner on Difficult); one who leans against the tip never is', () => {
  const first = { bareback: [], rodeo: [] };
  for (let seed = 1; seed <= 40; seed++) {
    for (const course of ['bareback', 'rodeo']) {
      const idle = ride(course, seed, 0);
      assert.ok(idle.falls.length >= 1, `${course} seed ${seed}: never leaning never fell`);
      assert.ok(idle.warns.length >= 1 && idle.warns[0] < idle.falls[0], `${course} seed ${seed}: the warning comes before the fall`);
      first[course].push(idle.falls[0]);
      const bot = ride(course, seed, race => botBalance(race));
      assert.equal(bot.falls.length, 0, `${course} seed ${seed}: the leaning bot fell`);
      assert.ok(bot.maxTilt < 0.75, `${course} seed ${seed}: the bot tipped to ${bot.maxTilt.toFixed(2)}`);
      assert.ok(steady(bot.race) && result(bot.race).steady);
      // a child who only reacts once the marker is well out still stays on
      assert.equal(ride(course, seed, race => botBalance(race, { dead: 0.4 })).falls.length, 0, `${course} seed ${seed}: a late leaner fell`);
    }
  }
  const med = xs => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  assert.ok(Math.max(...first.rodeo) < 12, `Difficult: never leaning falls within 12 s (latest ${Math.max(...first.rodeo).toFixed(1)})`);
  assert.ok(Math.max(...first.bareback) < 25, `Normal: within 25 s (latest ${Math.max(...first.bareback).toFixed(1)})`);
  assert.ok(med(first.rodeo) < med(first.bareback) - 2, `Difficult tips faster: ${med(first.rodeo).toFixed(1)} against ${med(first.bareback).toFixed(1)} s`);
  assert.ok(Math.min(...first.bareback) > BALANCE.gentle.grace + 1.5, 'Normal: there is time to see it coming');
  // leaning the wrong way all the time is a fall too (over the other side)
  assert.ok(ride('bareback', 2, 1).falls.length >= 1 && ride('bareback', 2, -1).falls.length >= 1);
});

test('balance: the fall and the remount. A few seconds in the grass, the cow waits, then she is seated and safe for a moment', () => {
  for (const [course, key] of [['bareback', 'gentle'], ['rodeo', 'wild']]) {
    const P = BALANCE[key], race = newRace({ seed: 6, course }), me = race.racers[0];
    for (let i = 0; i < 60 * 3; i++) { me.combo = 6; me.lastPush = race.t; stepRace(race, DT, {}); race.events.length = 0; }
    const s0 = me.s, v0 = me.v;
    me.graceT = 0; me.tilt = 0.999;
    stepRace(race, DT, { lean: 1 });
    const fall = race.events.find(e => e.type === 'fall' && e.who === 0);
    assert.ok(fall && fall.side === 1 && me.fallT === P.cost && me.falls === 1 && me.tilt === 0, course);
    assert.equal(me.combo, Math.floor(6 * P.keep), 'the streak is cut');
    race.events.length = 0;
    assert.equal(tap(race), null, 'no cow under her to ask');
    let t = 0, back = null, slowest = 9;
    while (back == null && t < 10) { slowest = Math.min(slowest, me.v); stepRace(race, DT, { lean: 1 }); t += DT; if (race.events.some(e => e.type === 'remount' && e.who === 0)) back = t; assert.ok(!race.events.some(e => e.type === 'fall' && e.who === 0)); race.events.length = 0; }
    assert.ok(Math.abs(back - P.cost) < 0.05, `${course}: back on after ${back?.toFixed(2)} s`);
    assert.ok(me.s - s0 < v0 * 0.35 && slowest < 0.05, `${course}: the cow stopped and waited (${(me.s - s0).toFixed(2)} m on)`);
    assert.ok(Math.abs(me.v - v0 * P.restart) < 0.05, `${course}: and she trots off again at ${me.v.toFixed(2)} of ${v0.toFixed(2)} m/s`);
    assert.ok(me.fallT === 0 && me.graceT === P.grace);
    // safe for a moment: nothing tips her during the grace, then it starts again
    for (let i = 0; i < Math.floor(P.grace * 60) - 2; i++) { me.combo = 6; me.lastPush = race.t; stepRace(race, DT, {}); race.events.length = 0; assert.equal(me.tilt, 0); }
  }
  assert.ok(BALANCE.wild.cost > BALANCE.gentle.cost && Math.abs(BALANCE.gentle.cost - 2) < 0.01, 'Normal: about two seconds; Difficult: more');
  assert.ok(BALANCE.wild.warn < BALANCE.gentle.warn && BALANCE.wild.drift > BALANCE.gentle.drift && BALANCE.wild.grow > BALANCE.gentle.grow, 'Difficult: a narrower green and a faster tip');
  assert.ok(HOP < BALANCE.gentle.cost - 0.8, 'the hop back on fits in the fall');
  // a fall costs the race time: the same rider, falling, is later at the ribbon
  const a = simulate(8, { jitter: 0.03, lean: true }, { course: 'bareback' }), b = simulate(8, { jitter: 0.03 }, { course: 'bareback' });
  assert.ok(b.falls >= 1 && a.falls === 0 && b.time > a.time + 1.5, `${b.time} against ${a.time}`);
  assert.ok(BALANCE.gentle.restart > BALANCE.wild.restart && BALANCE.gentle.keep >= BALANCE.wild.keep, 'Normal: the cow trots straight off; Difficult: from a walk');
});

test('balance: what tips her. A gallop rocks more than a trot, an off-beat tap, a bump and a rival brushing past shove her', () => {
  assert.equal(rock(0), 0); assert.ok(rock(1.3) < rock(2.8) && rock(2.8) < rock(3.7) && rock(9) <= 1.25);
  // the same seed at an amble and at a run: the runner is in the grass sooner
  const tip = combo => { const race = newRace({ seed: 9, course: 'bareback' }), me = race.racers[0]; for (let i = 0; i < 60 * 60; i++) { me.combo = combo; me.lastPush = race.t; stepRace(race, DT, {}); if (me.falls) return race.t; race.events.length = 0; } return 99; };
  assert.ok(tip(9) < tip(0), `a run ${tip(9).toFixed(1)} s, an amble ${tip(0).toFixed(1)} s`);
  // a jolt adds size / JOLT_FADE to the tilt, toward the side she is already tipping to; none while she is safe or off
  const B = newBalance('wild', 1), r = riderState();
  r.tilt = 0.2; assert.equal(jolt(r, B, 0.8), 1); assert.equal(r.jolt, 0.8);
  const flat = { ...B, drift: 0, grow: 0 };
  for (let i = 0; i < 120; i++) stepTilt(r, flat, i * DT, DT, 0, 2.5);
  assert.ok(Math.abs(r.tilt - (0.2 + 0.8 / JOLT_FADE)) < 0.01, `tilt ${r.tilt}`);
  r.graceT = 1; assert.equal(jolt(r, B, 0.8), 0); r.graceT = 0; r.fallT = 1; assert.equal(jolt(r, B, 0.8), 0);
  // an off-beat tap in a bareback heat jolts her; the same tap in a saddle heat does not
  for (const [course, want] of [['bareback', true], ['classic', false]]) {
    const race = newRace({ seed: 2, course }); race.racers[0].graceT = 0; race.t = BEAT * 4.5;
    assert.equal(tap(race), 'miss'); assert.equal(race.racers[0].jolt !== 0, want, course);
  }
  // the rodeo has ridges across the track, clear of the mud and the grass, and each one shoves her once
  const rodeo = newRace({ seed: 3, course: 'rodeo' });
  assert.equal(rodeo.course.bumps.length, COURSE.rodeo.bumps); assert.equal(newRace({ seed: 3, course: 'bareback' }).course.bumps.length, 0);
  for (const s of rodeo.course.bumps) assert.ok(BUMP_S.includes(s) && (s < TRACK.mud[0] - 1 || s > TRACK.mud[1] + 1) && TRACK.grass.every(g => Math.abs(g - s) > 2) && s < TRACK.len - 3, `ridge at ${s}`);
  const over = ride('rodeo', 3, race => botBalance(race));
  assert.equal(over.bumps, COURSE.rodeo.bumps); assert.equal(over.falls.length, 0);
  // a rival passing in the next lane brushes her away from it
  const br = newRace({ seed: 5, course: 'bareback', playerLane: 1 }), me = br.racers[0], kid = br.racers.find(k => k.ai && Math.abs(k.lane - 1) === 1);
  br.t = 5; me.graceT = 0; me.s = 20; me.v = 0; kid.s = 19; kid.v = 3;
  let brushed = false;
  for (let i = 0; i < 90 && !brushed; i++) { me.v = 0; stepRace(br, DT, {}); brushed = br.events.some(e => e.type === 'brush'); br.events.length = 0; }
  assert.ok(brushed && Math.sign(me.jolt) === Math.sign(me.lane - kid.lane), 'pushed away from the rival');
});

test('balance: the rivals sway, and in the rodeo some of them slide off too (never on Normal); the day is replayable', () => {
  let rodeoFalls = 0, heats = 0;
  for (let seed = 1; seed <= 40; seed++) {
    assert.equal(ride('bareback', seed, race => botBalance(race)).kidFalls, 0, 'Normal: the kids stay on');
    const r = ride('rodeo', seed, race => botBalance(race));
    rodeoFalls += r.kidFalls; heats++;
    for (const k of r.race.racers.slice(1)) assert.ok(k.falls <= 1 && Math.abs(k.tilt) <= 1);
  }
  assert.ok(rodeoFalls > heats * 0.6 && rodeoFalls < heats * 2, `rodeo: ${rodeoFalls} kid falls in ${heats} heats`);
  const a = simulateMeet(11, 'hard', { jitter: 0.1, steer: true }), b = simulateMeet(11, 'hard', { jitter: 0.1, steer: true });
  assert.deepEqual([a.score, a.places, a.times, a.falls], [b.score, b.places, b.times, b.falls]);
  assert.ok(a.falls >= 1, 'a rider who never leans falls in the rodeo');
});

test('balance: the bonus. A bareback heat without a fall is "Steady rider!"; a fall, an unfinished heat or a saddle heat is not', () => {
  const clean = simulate(4, { jitter: 0.03, lean: true }, { course: 'bareback' }), fell = simulate(4, { jitter: 0.03 }, { course: 'bareback' }), saddle = simulate(4, { jitter: 0.03 }, { course: 'classic' });
  assert.ok(clean.steady && clean.falls === 0);
  assert.equal(clean.score, raceScore(clean.place, clean.time) + STEADY_BONUS);
  assert.ok(!fell.steady && fell.falls >= 1); assert.equal(fell.score, raceScore(fell.place, fell.time));
  assert.ok(!saddle.steady); assert.equal(saddle.score, raceScore(saddle.place, saddle.time));
  const dnf = newRace({ seed: 4, course: 'bareback' }); finish(dnf);
  assert.ok(!steady(dnf) && !result(dnf).steady);
  // the leaning bot's lean is a plain, bounded number, and the gauge's words follow the side
  const r = riderState(); r.tilt = 0.9; assert.equal(botLean(r), -1); r.tilt = -0.02; assert.ok(botLean(r) > 0 && botLean(r) < 0.2);
  assert.equal(leanPrompt(0.2, 0.5), ''); assert.equal(leanPrompt(0.7, 0.5), 'Lean left!'); assert.equal(leanPrompt(-0.7, 0.5), 'Lean right!');
});
