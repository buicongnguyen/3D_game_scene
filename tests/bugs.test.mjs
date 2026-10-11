// Meadow bug catching and the cricket's song: the rules, with recorded inputs (game/tricks/rules-hoppers.js, rules-cricket.js),
// and the data of the two tricks (content/tricks.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { TRICK, TRICKS, trickOpen, starsFor } from '../src/content/tricks.js';
import { placeProblems } from '../src/world/roads.js';
import {
  BUGS, rng, noiseOf, noticeR, aimSpot, catchable, Net, Tally, Meadow,
} from '../src/game/tricks/rules-hoppers.js';
import {
  CRICKET, fahrenheit, celsius, chirpsFor, tempFor, thermoTimes, guessOptions, hearing, Tickle, Crickets, cricketPoints, cricketScore,
  rng as crng,
} from '../src/game/tricks/rules-cricket.js';

const DT = 1 / 30;
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

/** A meadow with one bug of `kind` put exactly where the test wants it (nothing else spawns). */
function oneBug(kind, x, z, seed = 11, opts = {}) {
  const m = new Meadow({ rand: rng(seed), grass: 0, mantis: 0, ...opts });
  const b = m.spawn(kind, { x: 0, z: 0, facing: 0 });
  Object.assign(b, { x, z, hx: x, hz: z, fx: x, fz: z, tx: x, tz: z, t: kind === 'grass' ? 1e9 : b.t });   // (no idle hop: only Mika moves it)
  m.events.length = 0;
  return { m, b };
}
const kinds = m => m.events.map(e => e.kind);

// ------------------------------------------------------------------------------------------------ the trick data
test('the two meadow tricks are well formed and sit on clean ground', () => {
  for (const id of ['hoppers', 'cricket']) {
    const t = TRICK[id];
    assert.ok(t, id);
    assert.ok(TRICKS.indexOf(t) >= 8, `${id} comes after the first eight`);
    assert.deepEqual(placeProblems(t.place.x, t.place.z), [], id);
    for (const o of TRICKS) if (o !== t) assert.ok(Math.hypot(o.place.x - t.place.x, o.place.z - t.place.z) > 14, `${id} / ${o.id}`);
    assert.ok(t.howReal.length <= 170 && t.why.length <= 160 && t.safety.length <= 90);
  }
  assert.equal(TRICKS.indexOf(TRICK.cricket), TRICKS.indexOf(TRICK.hoppers) + 1);
  assert.deepEqual(TRICK.hoppers.stars, [40, 80, 120]);
  assert.deepEqual(TRICK.cricket.stars, [30, 60, 90]);
  assert.deepEqual([TRICK.hoppers.length, TRICK.hoppers.firstLength, TRICK.cricket.length, TRICK.cricket.firstLength], [75, 40, 90, 50]);
  assert.deepEqual(TRICK.hoppers.seasons, ['summer', 'autumn']);
  assert.deepEqual(TRICK.cricket.seasons, ['summer', 'autumn']);
  // hoppers by day, crickets from dusk to night; a frozen story clock never blocks either
  assert.ok(trickOpen(TRICK.hoppers, { season: 'summer', hour: 10, frozen: false }) && !trickOpen(TRICK.hoppers, { season: 'summer', hour: 21, frozen: false }));
  assert.ok(trickOpen(TRICK.cricket, { season: 'autumn', hour: 21, frozen: false }) && !trickOpen(TRICK.cricket, { season: 'autumn', hour: 12, frozen: false }));
  assert.ok(trickOpen(TRICK.cricket, { season: 'summer', hour: 12, frozen: true }) && !trickOpen(TRICK.hoppers, { season: 'winter', hour: 10, frozen: true }));
});

test('the cricket hills\' ring of hiding places has room for three crickets', () => {
  const c = TRICK.cricket.place;
  const ok = (x, z) => !placeProblems(x, z).length;
  for (let seed = 1; seed <= 40; seed++) {
    const cr = new Crickets({ rand: crng(seed), ok, centre: c, temp: 24 });
    assert.equal(cr.list.length, 3);
    for (const k of cr.list) { assert.deepEqual(placeProblems(k.x, k.z), [], `seed ${seed} cricket ${k.i}`); assert.ok(Math.hypot(k.x - c.x, k.z - c.z) <= CRICKET.ring[1] + 0.01); }
  }
  // and the meadow of the hoppers: bugs spawn on good ground all round the sign
  const h = TRICK.hoppers.place;
  for (let seed = 1; seed <= 20; seed++) {
    const m = new Meadow({ rand: rng(seed), ok });
    for (let i = 0; i < 80; i++) m.update(0.25, { x: h.x, z: h.z, speed: 0, facing: (i % 8) * 0.8 });
    assert.ok(m.bugs.length >= 6, `seed ${seed}: ${m.bugs.length} bugs`);
    for (const b of m.bugs) assert.deepEqual(placeProblems(b.x, b.z), []);
  }
});

// ------------------------------------------------------------------------------------------------ noise and the net
test('noise follows speed: silent creeping, loud running; the notice radius grows with it', () => {
  assert.equal(noiseOf(0), 0);
  assert.equal(noiseOf(BUGS.creep), 0);
  assert.equal(noiseOf(BUGS.walk), 1);
  assert.equal(noiseOf(9), 1);
  assert.ok(near(noiseOf(2.05), 0.5));
  assert.ok(near(noticeR(0), 1.3) && near(noticeR(1), 3.4));
  // the net lands 1.5 m ahead, a little outside the radius at which a creeper is noticed: you can swing before it knows
  const s = aimSpot(2, 3, Math.PI / 2);
  assert.ok(near(s.x, 3.5) && near(s.z, 3, 1e-9));
  assert.ok(BUGS.reach > noticeR(0) && BUGS.reach - BUGS.netR < noticeR(0));
});

test('the net: a tap is quick, small and loud; hold and let go is a wider silent sweep; it needs a moment between swings', () => {
  const n = new Net();
  let land = null;
  const run = (secs, input) => { for (let t = 0; t < secs; t += DT) { const r = n.update(DT, typeof input === 'function' ? input(t) : input); if (r) land = { ...r, at: +t.toFixed(2) }; } };
  // press and release within a few frames
  run(DT, { press: true, held: true });
  run(DT, { held: false });
  assert.equal(n.phase, 'quick');
  run(0.25, {});
  assert.deepEqual([land.r, land.loud], [BUGS.netR, true]);
  assert.ok(land.at <= 0.15, `lands ${land.at} s after the let-go`);
  // the next press is refused while the net is cooling
  land = null;
  n.update(DT, { press: true, held: true });
  assert.equal(n.phase, 'idle');
  run(0.5, {});
  // a sweep: held 0.6 s, then let go
  land = null;
  run(DT, { press: true, held: true });
  run(0.6, { held: true });
  assert.ok(n.sweeping);
  run(DT, { held: false });
  assert.equal(n.phase, 'sweep');
  run(1, {});
  assert.deepEqual([land.r, land.loud], [BUGS.sweepR, false]);
  // a tap on the screen is a quick swing at once
  run(0.6, {});
  land = null;
  run(DT, { tap: true });
  run(0.3, {});
  assert.equal(land.loud, true);
});

// ------------------------------------------------------------------------------------------------ grasshoppers
/** Walk toward (bx, bz) from `from` metres away at `speed`, facing it; call swing(m, p) at the aim spot when `swingAt` m away. */
function approach(m, b, { speed, swingAt = null, sweep = false }) {
  const p = { x: 0, z: -5, speed, facing: 0 };
  const log = { crouchAt: null, swung: null, res: null, t: 0 };
  const net = new Net();
  for (let t = 0; t < 30; t += DT) {
    log.t = t;
    p.x = 0; p.facing = Math.atan2(b.x - p.x, b.z - p.z);
    const d = Math.hypot(b.x - p.x, b.z - p.z);
    const swing = swingAt !== null && d <= swingAt && !log.swung;
    if (swing) { log.swung = t; }
    const land = net.update(DT, swing ? (sweep ? { press: true, held: true } : { tap: true }) : (log.swung && sweep && t - log.swung < 0.5 ? { held: true } : {}));
    p.speed = d > 0.9 ? speed : 0;
    if (d > 0.9) p.z += speed * DT * Math.cos(p.facing);
    m.update(DT, p);
    for (const e of m.events) if (e.kind === 'crouch' && log.crouchAt === null) log.crouchAt = { t, d };
    m.events.length = 0;
    if (land) { const a = aimSpot(p.x, p.z, p.facing); log.res = m.swing(a.x, a.z, land.r, land.loud); if (log.res.bug) break; }
  }
  return log;
}

test('a grasshopper that is crept up on is caught before it notices; one that is walked up to crouches first, then hops', () => {
  for (const seed of [3, 12, 40]) {
    // creeping at 0.9 m/s: nothing happens until the swing, and the swing catches it
    let { m, b } = oneBug('grass', 0, 3, seed);
    let log = approach(m, b, { speed: 0.9, swingAt: 1.5 });
    assert.equal(log.crouchAt, null, `seed ${seed}: it never noticed`);
    assert.equal(log.res.bug, b);
    assert.equal(b.caught, true);
    // walking at 2.2 m/s: it crouches at roughly the notice radius, and hops 0.3 s later
    ({ m, b } = oneBug('grass', 0, 3, seed));
    log = approach(m, b, { speed: 2.2 });
    assert.ok(log.crouchAt && near(log.crouchAt.d, noticeR(noiseOf(2.2)), 0.2), `seed ${seed}: crouch at ${log.crouchAt?.d}`);
  }
  // the crouch is the tell: a swing that lands during it still catches; one that lands after the hop is under way does not
  let { m, b } = oneBug('grass', 0, 3);
  const p = { x: 0, z: 0.5, speed: 2.4, facing: 0 };
  m.update(DT, p);
  assert.equal(b.st, 'crouch');
  for (let t = 0; t < 0.25; t += DT) m.update(DT, p);
  assert.ok(catchable(b));
  assert.equal(m.swing(b.x, b.z, BUGS.netR, true).bug, b);
  ({ m, b } = oneBug('grass', 0, 3));
  m.update(DT, p);
  for (let t = 0; t < 0.9; t += DT) m.update(DT, p);
  assert.ok(b.st === 'hop' || b.st === 'sit' || b.st === 'crouch');
  assert.ok(Math.hypot(b.x, b.z - 3) > 0.3, 'it has gone');
});

test('a startled grasshopper hops away from Mika, further when she is loud; after three hops it is tired and easy to catch', () => {
  const { m, b } = oneBug('grass', 0, 3, 5);
  const p = { x: 0, z: 2.2, speed: 4.4, facing: 0 };
  const lens = [];
  let tired = null;
  for (let t = 0; t < 12 && !tired; t += DT) {
    const before = [b.x, b.z];
    m.update(DT, p);
    for (const e of m.events) if (e.kind === 'hop') lens.push(Math.hypot(b.tx - b.x, b.tz - b.z));
    if (b.st === 'tired') tired = t;
    // Mika follows it, running
    p.z += (b.z - p.z) * 0.02; p.x += (b.x - p.x) * 0.02;
    m.events.length = 0;
    void before;
  }
  assert.ok(tired !== null, 'rested after its hops');
  assert.ok(lens.length >= 3 && lens.every(l => l >= 1 && l <= 2.4), `hops ${lens.map(l => l.toFixed(1))}`);
  assert.equal(b.hops, 3);
  assert.ok(catchable(b), 'a tired grasshopper can be netted');
  // it does not mind her while it rests
  m.update(DT, { x: b.x, z: b.z - 0.5, speed: 4, facing: 0 });
  assert.equal(b.st, 'tired');
});

test('loud swings startle the bugs round them; a sweep does not', () => {
  const { m, b } = oneBug('grass', 1.5, 3);
  const other = m.spawn('grass', { x: 0, z: 0, facing: 0 });
  Object.assign(other, { x: 1.9, z: 3.2, hx: 1.9, hz: 3.2 });
  m.events.length = 0;
  const r = m.swing(b.x, b.z, BUGS.netR, false);
  assert.equal(r.bug, b);
  assert.equal(r.startled, 0);
  assert.equal(other.st, 'sit');
  const { m: m2, b: b2 } = oneBug('grass', 1.5, 3, 9);
  const o2 = m2.spawn('grass', { x: 0, z: 0, facing: 0 });
  Object.assign(o2, { x: 1.9, z: 3.2 });
  const r2 = m2.swing(b2.x, b2.z, BUGS.netR, true);
  assert.equal(r2.bug, b2);
  assert.equal(r2.startled, 1);
  assert.equal(o2.st, 'crouch');
});

// ------------------------------------------------------------------------------------------------ mantises
test('a mantis never minds a creeper, minds a walker only while it watches, and is alarmed by a runner', () => {
  for (const seed of [1, 7, 23, 99]) {
    // creeping from 6.5 m to 1.5 m, then standing there for 10 s: silent
    let { m, b } = oneBug('mantis', 0, 6.5, seed);
    const p = { x: 0, z: 0, speed: 0.95, facing: 0 };
    let peak = 0;
    for (let t = 0; t < 30; t += DT) {
      p.z = Math.min(5, p.z + p.speed * DT); if (p.z >= 5) p.speed = 0;
      m.update(DT, p); peak = Math.max(peak, b.alarm); m.events.length = 0;
    }
    assert.equal(peak, 0, `seed ${seed}: creeping is silent`);
    assert.equal(b.st, 'stand');
    // running up to it: alarm, threat, then it flies off
    ({ m, b } = oneBug('mantis', 0, 7, seed));
    const q = { x: 0, z: 1, speed: 4.4, facing: 0 };
    const seen = [];
    let t = 0;
    for (; t < 6 && !seen.includes('flee'); t += DT) { q.z += 4.4 * DT * (q.z < 6 ? 1 : 0); q.speed = q.z < 6 ? 4.4 : 0.2; m.update(DT, q); for (const e of m.events) seen.push(e.kind); m.events.length = 0; }
    assert.ok(seen.includes('threat') && seen.includes('flee'), `seed ${seed}: ${seen}`);
    assert.ok(seen.indexOf('threat') < seen.indexOf('flee'));
    assert.ok(t < 5, 'quick');
    for (let k = 0; k < 40; k++) m.update(DT, q);
    assert.ok(Math.hypot(b.x - 0, b.z - 7) >= 3.4, 'it flew to another stalk');
    assert.equal(b.st, 'stand');
    assert.ok(b.wary > 0 || b.alarm > 0, 'and is on its guard');
  }
  // walking at 2 m/s (noise 0.47): alarm only grows while it is looking at her
  const { m, b } = oneBug('mantis', 0, 5, 4);
  const p = { x: 0, z: 1.5, speed: 2, facing: 0 };
  let rose = 0, roseWhileAway = 0;
  for (let t = 0; t < 40; t += DT) {
    const was = b.alarm, gaze = b.gaze;
    m.update(DT, p);
    if (b.st === 'threat') break;
    if (b.alarm > was + 1e-9) { rose++; if (gaze === 'away' && b.gaze === 'away') roseWhileAway++; }
    m.events.length = 0;
  }
  assert.ok(rose > 0, 'it minds a walker that it is watching');
  assert.equal(roseWhileAway, 0, 'and not one it is looking away from');
});

test('a mantis is caught from a quiet approach, not while it bluffs; the score counts runs and a clean round', () => {
  const { m, b } = oneBug('mantis', 0, 3, 8);
  assert.ok(catchable(b));
  b.st = 'threat';
  assert.ok(!catchable(b), 'rearing up, it strikes at the net instead');
  b.st = 'stand';
  const r = m.swing(0, 3.3, BUGS.sweepR, false);
  assert.equal(r.bug, b);
  assert.equal(b.alive, false);
  assert.ok(kinds(m).includes('caught'));
  // the tally: 10 and 25, +5 for each catch in a run of three, +15 for a clean round of four or more
  const t = new Tally();
  assert.equal(t.swing('grass'), 10);
  assert.equal(t.swing('grass'), 10);
  assert.equal(t.swing('mantis'), 30);          // the third in a row: +5
  assert.equal(t.swing(null), 0);
  assert.equal(t.streak, 0);
  assert.equal(t.swing('grass'), 10);
  assert.equal(t.score, 10 + 10 + 25 + 5 + 10);
  assert.ok(!t.clean);
  const c = new Tally();
  for (const k of ['grass', 'grass', 'grass', 'mantis']) c.swing(k);
  assert.ok(c.clean);
  assert.equal(c.score, 10 + 10 + 10 + 25 + 5 + 5 + BUGS.cleanBonus);
  assert.equal(c.score, 80);
  assert.equal(starsFor(c.score, TRICK.hoppers.stars), 2);
  assert.equal(starsFor(120, TRICK.hoppers.stars), 3);
});

test('the meadow keeps itself stocked, loses the bugs Mika leaves behind and is the same every time for a seed', () => {
  const log = seed => {
    const m = new Meadow({ rand: rng(seed), ok: (x, z) => Math.hypot(x, z) < 40 });
    const out = [];
    const p = { x: 0, z: 0, speed: 1.5, facing: 0 };
    for (let t = 0; t < 60; t += DT) {
      p.x += Math.sin(p.facing) * 1.5 * DT; p.z += Math.cos(p.facing) * 1.5 * DT; p.facing += 0.01;
      m.update(DT, p);
      for (const e of m.events) out.push(`${e.kind}${e.bug.id}@${t.toFixed(2)}`);
      m.events.length = 0;
      assert.ok(m.count('grass') <= BUGS.alive.grass && m.count('mantis') <= BUGS.alive.mantis);
      if (t > 8) assert.ok(m.count('grass') >= 3, `grass ${m.count('grass')} at ${t.toFixed(1)}`);
    }
    return out;
  };
  const a = log(77);
  assert.ok(a.length > 20);
  assert.deepEqual(a, log(77));
  assert.notDeepEqual(a, log(78));
  // fewer on a phone: the round asks for fewer at once
  const small = new Meadow({ rand: rng(3), grass: 4, mantis: 1 });
  for (let i = 0; i < 100; i++) small.update(0.2, { x: 0, z: 0, speed: 0, facing: 0 });
  assert.ok(small.count('grass') <= 4 && small.count('mantis') <= 1);
});

// ------------------------------------------------------------------------------------------------ crickets: the song
test('Dolbear\'s law: chirps in 14 s + 40 = degrees F; the counts are whole and the temperatures come back', () => {
  assert.equal(fahrenheit(30), 70);
  assert.ok(near(celsius(30), 21.111, 1e-3));
  for (const tC of [14, 17, 21, 24, 27]) {
    const n = chirpsFor(tC);
    assert.ok(Math.abs(celsius(n) - tC) <= 0.3, `${tC} C -> ${n} chirps -> ${celsius(n).toFixed(2)} C`);
  }
  assert.equal(chirpsFor(24), 35);
  for (const season of ['summer', 'autumn']) for (let s = 1; s < 50; s++) {
    const t = tempFor(s, season);
    assert.ok(Number.isInteger(t) && (season === 'summer' ? t >= 21 && t <= 27 : t >= 14 && t <= 21), `${season} ${t}`);
  }
  assert.equal(tempFor(5, 'summer'), tempFor(5, 'summer'));
  // the 14-second count has exactly n chirps inside the window, evenly spread
  for (const n of [24, 31, 35, 39]) {
    const times = thermoTimes(n);
    assert.equal(times.length, n);
    assert.ok(times[0] > 0 && times[n - 1] < 14 && times.every((t, i) => !i || t > times[i - 1]));
  }
  // the guess: three different answers, the right one among them, in a seeded order
  for (let s = 1; s < 40; s++) for (const t of [9, 14, 21, 27, 35]) {
    const o = guessOptions(t, crng(s));
    assert.equal(new Set(o).size, 3);
    assert.ok(o.includes(t));
    assert.deepEqual(o, guessOptions(t, crng(s)));
  }
});

test('hearing: the song pans to the side it comes from, fades with distance and shows where it is', () => {
  // facing +z (yaw 0): +x is to the LEFT (actors/player.js), -x to the right
  const left = hearing(0, 0, 8, 0, 0), right = hearing(0, 0, -8, 0, 0), ahead = hearing(0, 0, 0, 8, 0), behind = hearing(0, 0, 0, -8, 0);
  assert.ok(left.pan < -0.9 && right.pan > 0.9 && near(ahead.pan, 0, 1e-9) && near(behind.pan, 0, 1e-9));
  assert.ok(near(ahead.rel, 0) && near(Math.abs(behind.rel), Math.PI, 1e-9) && near(right.rel, Math.PI / 2) && near(left.rel, -Math.PI / 2));
  // turning the camera turns the sound: after a quarter turn to the right the cricket that was ahead is on the left
  const turned = hearing(0, 0, 0, 8, -Math.PI / 2);
  assert.ok(turned.pan < 0, 'turned right: it is now on the left');
  const v = [1, 5, 10, 20, 29].map(d => hearing(0, 0, 0, d, 0).vol);
  assert.ok(v.every((x, i) => !i || x < v[i - 1]), `volume falls with distance: ${v.map(x => x.toFixed(2))}`);
  assert.equal(hearing(0, 0, 0, 31, 0).vol, 0);
  assert.ok(hearing(0, 0, 0, 29.9, 0).vol >= 0.1);
});

/** Run a Crickets hunt with a player script: path(t) -> { x, z, speed }. Returns the events seen by kind. */
function hunt(seed, path, secs, opts = {}) {
  const c = new Crickets({ rand: crng(seed), centre: { x: 0, z: 0 }, temp: 24, ...opts });
  const seen = [];
  for (let t = 0; t < secs; t += DT) {
    c.update(DT, path(t, c), 0);
    for (const e of c.events) seen.push({ ...e, t });
    c.events.length = 0;
  }
  return { c, seen };
}

test('a cricket sings at the night\'s rate; the last one exactly at the temperature\'s rate', () => {
  const { c, seen } = hunt(4, () => ({ x: 0, z: 0, speed: 0 }), 14);
  const chirps = seen.filter(e => e.kind === 'chirp');
  assert.ok(chirps.length > 20 && chirps.every(e => e.c === c.list[0]));
  assert.ok(chirps.every(e => e.vol > 0 && e.pan >= -1 && e.pan <= 1 && e.pulses >= 3 && e.pulses <= 4));
  // the third cricket sings chirpsFor(temp) chirps in 14 s
  const last = new Crickets({ rand: crng(4), centre: { x: 0, z: 0 }, temp: 24 }).list[2];
  assert.ok(near(last.rate * 14, chirpsFor(24), 1e-9));
  const pitches = new Set(new Crickets({ rand: crng(4), centre: { x: 0, z: 0 } }).list.map(k => k.pitch));
  assert.equal(pitches.size, 3, 'each cricket has its own pitch');
});

test('close up it goes quiet when Mika moves, sings again when she stands still, and shows itself when she is near enough', () => {
  const c0 = new Crickets({ rand: crng(9), centre: { x: 0, z: 0 } }).list[0];
  // walk straight to the cricket, stop 2 m from it, shuffle, stop 1.2 m from it
  const path = (t) => {
    const d0 = Math.hypot(c0.x, c0.z), ux = c0.x / d0, uz = c0.z / d0;
    const walk = Math.min(t * 3, d0 - 2.0);
    if (t < (d0 - 2.0) / 3) return { x: ux * walk, z: uz * walk, speed: 3 };
    const t1 = t - (d0 - 2.0) / 3;
    if (t1 < 2.5) return { x: ux * (d0 - 2.0), z: uz * (d0 - 2.0), speed: 0 };              // still at 2 m: (within near) it hushes only if she moved
    const s = Math.min(1, (t1 - 2.5) * 0.5);                                              // a slow step closer to 1.2 m
    return { x: ux * (d0 - 2.0 + 0.8 * s), z: uz * (d0 - 2.0 + 0.8 * s), speed: s < 1 ? 0.8 : 0 };
  };
  const { seen } = hunt(9, path, 14);
  const order = seen.filter(e => ['hush', 'resume', 'reveal'].includes(e.kind)).map(e => e.kind);
  // she stops 2 m away (too far to tickle): it hushes as she arrives, sings when she is still, hushes at her step, sings, reveals itself
  assert.deepEqual(order, ['hush', 'resume', 'hush', 'resume', 'reveal'], `${order}`);
  const hush = seen.find(e => e.kind === 'hush'), resume = seen.find(e => e.kind === 'resume'), reveal = seen.find(e => e.kind === 'reveal');
  assert.ok(reveal.t > resume.t);
  assert.ok(resume.t - hush.t >= CRICKET.still - 0.05, 'she had to stand still before it sang again');
  assert.ok(reveal.d <= CRICKET.reach + 1e-6);
  // while hushed there is no song
  const between = seen.filter(e => e.kind === 'chirp' && e.t > hush.t && e.t < resume.t);
  assert.equal(between.length, 0);
});

test('the tickle: three taps on the beat catch it; a tap off the beat, or none, frightens it away and it hops somewhere else', () => {
  const play = (taps, beat = 0.8, win = CRICKET.window) => {
    const k = new Tickle(beat, win);
    k.start();
    const out = [];
    for (let t = 0; t < 6 && !k.done && !k.failed; t += DT) {
      const tapped = taps.some(x => Math.abs(x - t) < DT / 2);
      const r = k.update(DT, tapped);
      if (r) out.push(r);
    }
    return { k, out };
  };
  const L = CRICKET.lead, on = [L, L + 0.8, L + 1.6];
  let { k, out } = play(on);
  assert.ok(k.done && !k.failed);
  assert.deepEqual(out.length, 3);
  assert.ok(k.quality > 0.8, `q ${k.quality}`);
  ({ k, out } = play(on.map(t => t + 0.2)));
  assert.ok(k.done);
  assert.ok(k.quality < 0.7 && k.quality > 0.2, `late taps are rougher: ${k.quality}`);
  ({ k, out } = play([0.2]));
  assert.ok(k.failed && out[0] === 'rough', 'a tap far too early');
  ({ k, out } = play([on[0], on[1]]));
  assert.ok(k.failed, 'the third beat went by');
  // wider windows (the guided round, or after two failures) forgive more
  ({ k } = play([on[0] + 0.35, on[1], on[2]]));
  assert.ok(k.failed);
  ({ k } = play([on[0] + 0.35, on[1], on[2]], 0.8, CRICKET.easyWindow));
  assert.ok(k.done);
  // the hunt: a failed tickle moves the cricket, keeps it quiet, counts the failure; three catches end the round
  const c = new Crickets({ rand: crng(21), centre: { x: 0, z: 0 }, temp: 22 });
  const first = c.active, at = [first.x, first.z];
  c.flee({ x: 0, z: 0 });
  assert.notDeepEqual([first.x, first.z], at);
  assert.equal(first.fails, 1);
  assert.equal(first.quiet, CRICKET.hushAfterFail);
  assert.equal(c.windowFor(first), CRICKET.window);
  first.fails = 2;
  assert.equal(c.windowFor(first), CRICKET.easyWindow);
  for (let i = 0; i < 3; i++) { c.active.hunt = 12; c.catchIt(i === 0 ? 1 : 0.5); }
  assert.ok(c.done && c.caught === 3);
});

test('the cricket score: 20 each, up to 10 for speed and 10 for a gentle tickle, 10 for the right temperature', () => {
  const quick = { caught: true, hunt: 0, quality: 1 }, slow = { caught: true, hunt: 40, quality: 0 };
  assert.equal(cricketPoints(quick), 40);
  assert.equal(cricketPoints(slow), 20);
  assert.equal(cricketScore([quick, quick, quick], true), 130);
  assert.equal(cricketScore([quick, slow, { caught: false, hunt: 5, quality: 1 }]), 60);
  const T = TRICK.cricket.stars;
  assert.equal(starsFor(cricketScore([slow, slow, slow]), T), 2);
  assert.equal(starsFor(cricketScore([quick, quick, slow], true), T), 3);
  assert.equal(starsFor(cricketScore([slow]), T), 0);
});

// ------------------------------------------------------------------------------------------------ the input
import { creepFilter } from '../src/game/tricks/bugkit.js';

/** Mika's walking speed for a stick magnitude (actors/player.js: the walk is analog up to 0.6, then she runs; sprint is ignored below 0.6). */
const speedFor = mag => (mag < 0.05 ? 0 : mag < 0.6 ? 1.6 * (mag / 0.6) * 1.2 : 4.4);

test('creeping: Shift (or L3) creeps, the lower half of a stick creeps, the keyboard otherwise walks; the top of a stick runs', () => {
  const run = (device, held, x, y) => {
    const input = { keys: new Set(held ? ['sprint'] : []), lastDevice: device, move: { x, y } };
    const st = { creeping: false };
    creepFilter(input, st)();
    return { mag: Math.hypot(input.move.x, input.move.y), st };
  };
  // keyboard: W is a walk (noise 0.4: a watching mantis minds it), Shift + W a creep (silent)
  const w = run('keyboard', false, 0, 1), c = run('keyboard', true, 0, 1), d = run('keyboard', false, 0.7071, 0.7071);
  assert.ok(near(noiseOf(speedFor(w.mag)), 0.4, 0.02) && !w.st.creeping);
  assert.equal(noiseOf(speedFor(c.mag)), 0);
  assert.ok(c.st.creeping);
  assert.ok(near(d.mag, w.mag), 'a diagonal is no faster');
  // a stick: the lower half creeps, the middle walks, the top runs
  const noises = [0.15, 0.3, 0.5, 0.7, 0.85, 1].map(s => noiseOf(speedFor(run('touch', false, 0, s).mag)));
  assert.deepEqual(noises.slice(0, 3).map(n => n < 0.05), [true, true, true], `the lower half is quiet: ${noises}`);
  assert.ok(noises[3] > 0.2 && noises[3] < 0.6, `the middle is a walk: ${noises[3]}`);
  assert.equal(noises[5], 1);
  assert.ok(noises.every((n, i) => !i || n >= noises[i - 1]), 'a bigger push is never quieter');
  // L3 held on a pad caps the stick at a creep
  assert.equal(noiseOf(speedFor(run('gamepad', true, 0, 1).mag)), 0);
  // standing still stays still
  assert.equal(run('keyboard', false, 0, 0).mag, 0);
});

test('a creeper who stands still within reach shows the cricket without ever hushing it', () => {
  const c = new Crickets({ rand: crng(14), centre: { x: 0, z: 0 } });
  const a = c.list[0], d0 = Math.hypot(a.x, a.z), ux = a.x / d0, uz = a.z / d0;
  const seen = [];
  for (let t = 0; t < 40 && !seen.includes('reveal'); t += DT) {
    const walk = Math.min(0.3 * t, d0 - 1.4);                                         // 0.3 m/s: under the "moving" speed
    c.update(DT, { x: ux * walk, z: uz * walk, speed: walk < d0 - 1.4 ? 0.3 : 0 }, 0);
    for (const e of c.events) seen.push(e.kind);
    c.events.length = 0;
  }
  assert.ok(seen.includes('reveal'));
  assert.ok(!seen.includes('hush'), `${seen.filter(k => k !== 'chirp')}`);
});
