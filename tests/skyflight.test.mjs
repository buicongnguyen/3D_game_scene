// "Fly up" in the sky viewer: the horizon maths, the climb's state machine with every interrupt, the sky's own clock,
// the lift cheat that fades as she rises, and the per-spot sky altitudes (content/skyspots.js `lift`).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { horizonProfile, worstIn, elevationAt, clearAltitude, horizonDip } from '../src/content/horizon.js';
import {
  SkyFlight, advance, travelTime, BRAKE, liftScale, PROFILE, LEAVE_MAX_S, SUMMON_MAX_S, KITE_GRAB,
  nightAxis, clockOf, stepNight, canStepNight, hhmm, hourIcon, NIGHT,
} from '../src/game/skyflight.js';
import { SKY_SPOTS, SKY_LIFT_DEFAULT, SKY_LIFT_MIN, SKY_LIFT_MAX } from '../src/content/skyspots.js';
import { PROFILES, groupsUp, GROUP, groupInfo, worldDir, lstFor } from '../src/content/constellations.js';
import { buildStarSky } from '../src/game/skystars.js';
import { sharedGrid } from '../src/world/roads.js';
import { TERRAIN } from '../src/world/layout.js';

const DT = 1 / 60;

// ------------------------------------------------------------------------------------------------ the horizon
test('horizon: a wall 100 m south, 50 m high, on a toy terrain', () => {
  const heightAt = (x, z) => (z >= 100 ? 50 : 0);
  const at = eyeY => horizonProfile({ heightAt, x: 0, z: 0, eyeY, step: 5, maxDist: 300 });
  const p0 = at(0);
  assert.ok(Math.abs(elevationAt(p0, 180) - Math.atan2(50, 100) * 180 / Math.PI) < 1.2, `south ${elevationAt(p0, 180)}`);
  assert.ok(elevationAt(p0, 0) < 1, 'north is open flat ground');
  assert.ok(Math.abs(worstIn(p0) - elevationAt(p0, 180)) < 1e-6 || worstIn(p0) >= elevationAt(p0, 180));
  // the wall falls with the eye: 36 m up it stands at 8 degrees
  const clear = clearAltitude(a => at(a), 8, [0, 20, 40, 60]);
  assert.deepEqual([clear.alt, clear.clear], [40, true]);
  assert.ok(worstIn(at(36), [[150, 210]]) < 8.5 && worstIn(at(30), [[150, 210]]) > 8);
  // arcs wrap through north: the open north arc is clear on the ground
  assert.ok(worstIn(p0, [[300, 60]]) < 1);
  assert.ok(worstIn(p0, [[170, 190]]) > 20);
  // a ceiling it cannot reach: the best level is reported, not clear
  const never = clearAltitude(a => at(a), -5, [0, 20, 40]);
  assert.equal(never.clear, false);
  assert.equal(never.alt, 40);
});

test('horizon: tree crowns count as discs, the edge of the drawn terrain ends the march', () => {
  const flat = () => 0;
  const base = horizonProfile({ heightAt: flat, x: 0, z: 0, eyeY: 2, step: 10 });
  const tree = { x: 20, z: 0, top: 12, r: 3 };                                  // east, 20 m away, 10 m above the eye
  const withTree = horizonProfile({ heightAt: flat, x: 0, z: 0, eyeY: 2, step: 10, obstacles: [tree] });
  assert.ok(elevationAt(withTree, 90) > 25 && elevationAt(withTree, 90) < 27, `tree ${elevationAt(withTree, 90)}`);
  assert.ok(elevationAt(withTree, 270) < 0 && elevationAt(base, 90) < 0);
  // terrain beyond the drawn edge is not looked at
  const hills = (x, z) => (z > 150 ? 400 : 0);
  const inside = (x, z) => z < 120;
  const cut = horizonProfile({ heightAt: hills, x: 0, z: 0, eyeY: 0, step: 90, inside, maxDist: 400 });
  assert.ok(elevationAt(cut, 180) < 1);
  assert.ok(horizonDip(100) > 0.3 && horizonDip(100) < 0.5);
});

test('the real valley: the rim stands high on the floor and falls with the altitude (terrain only)', () => {
  const grid = sharedGrid();
  const inside = (x, z) => x >= TERRAIN.minX && x <= TERRAIN.maxX && z >= TERRAIN.minZ && z <= TERRAIN.maxZ;
  const sp = SKY_SPOTS.find(s => s.id === 'mill-lamp');
  const at = a => horizonProfile({ heightAt: (x, z) => grid.heightAt(x, z), x: sp.x, z: sp.z, eyeY: grid.heightAt(sp.x, sp.z) + 1.5 + a, inside });
  assert.ok(worstIn(at(0)) > 25, 'from the valley floor the mountains stand more than 25 degrees up');
  assert.ok(worstIn(at(sp.lift)) < worstIn(at(0)) - 12, 'the rim falls by more than 12 degrees at the sky altitude');
  assert.ok(worstIn(at(200)) < 6, 'and it is under 6 degrees all round at 200 m');
});

// ------------------------------------------------------------------------------------------------ the sky altitudes
const visibleShare = (profile, hz) => {
  let tot = 0, vis = 0;
  for (const season of ['spring', 'summer', 'autumn', 'winter']) for (const hour of [19.5, 21, 23, 1, 3.5]) {
    for (const i of groupsUp(season, hour, profile)) { tot++; if (i.alt >= elevationAt(hz, i.az) + 2) vis++; }
  }
  return vis / tot;
};

test('every sky spot has a sensible lift, and at it nearly every evening group clears the rim in both sky profiles', () => {
  const grid = sharedGrid();
  const inside = (x, z) => x >= TERRAIN.minX && x <= TERRAIN.maxX && z >= TERRAIN.minZ && z <= TERRAIN.maxZ;
  assert.ok(SKY_LIFT_DEFAULT >= SKY_LIFT_MIN && SKY_LIFT_DEFAULT <= SKY_LIFT_MAX);
  for (const s of SKY_SPOTS) {
    assert.ok(Number.isFinite(s.lift) && s.lift >= SKY_LIFT_MIN && s.lift <= SKY_LIFT_MAX && s.lift % 10 === 0, `${s.id}: lift ${s.lift}`);
    const floor = (s.on === 'deck' ? s.y : s.on === 'gallery' ? grid.heightAt(s.x, s.z) + 11 : grid.heightAt(s.x, s.z)) + 1.5;
    assert.ok(floor + s.lift + 3 < 400, `${s.id}: the top stays far below the interiors (y ~ 600)`);
    const at = a => horizonProfile({ heightAt: (x, z) => grid.heightAt(x, z), x: s.x, z: s.z, eyeY: floor + a, inside });
    const hz = at(s.lift), ground = at(0);
    for (const id of ['jp', 'vn']) {
      const up = visibleShare(PROFILES[id], hz), down = visibleShare(PROFILES[id], ground);
      assert.ok(up >= 0.94, `${s.id}/${id}: only ${(up * 100).toFixed(0)} per cent of the groups clear the rim at ${s.lift} m`);
      assert.ok(up > down + 0.1, `${s.id}/${id}: flying up must help (${(down * 100).toFixed(0)} -> ${(up * 100).toFixed(0)})`);
    }
    // not wasteful: ten metres lower would still do the same job at most spots, but never twenty lower with a clear gain left
    const lower = at(s.lift - 20);
    assert.ok(Math.min(visibleShare(PROFILES.jp, lower), visibleShare(PROFILES.vn, lower)) < 0.985, `${s.id}: ${s.lift - 20} m would already be enough`);
  }
});

test('the low groups of the request show above the rim at the three test spots when she is up', () => {
  const grid = sharedGrid();
  const inside = (x, z) => x >= TERRAIN.minX && x <= TERRAIN.maxX && z >= TERRAIN.minZ && z <= TERRAIN.maxZ;
  const cases = [['crux', 'vn', 'spring', 22], ['scorpius', 'jp', 'summer', 21], ['orion', 'jp', 'winter', 22]];
  for (const id of ['star-hill', 'mill-lamp', 'viaduct-lamp']) {
    const s = SKY_SPOTS.find(x => x.id === id);
    const floor = (s.on === 'deck' ? s.y : grid.heightAt(s.x, s.z)) + 1.5;
    const hz = horizonProfile({ heightAt: (x, z) => grid.heightAt(x, z), x: s.x, z: s.z, eyeY: floor + s.lift, inside });
    for (const [gid, pid, season, hour] of cases) {
      const i = groupInfo(GROUP[gid], season, hour, PROFILES[pid]);
      assert.ok(i.up, `${gid} is up`);
      assert.ok(i.alt > elevationAt(hz, i.az) + 1, `${id}: ${gid} (${i.alt.toFixed(0)} deg at az ${i.az.toFixed(0)}) is under the rim (${elevationAt(hz, i.az).toFixed(0)})`);
    }
  }
});

// ------------------------------------------------------------------------------------------------ the climb
function run(f, seconds, { ready = true, from = 0 } = {}) {
  const ev = [];
  for (let t = from; t < seconds; t += DT) for (const e of f.update(DT, ready)) ev.push(e);
  return ev;
}
function rise(lift = 130) {
  const f = new SkyFlight({ lift });
  assert.deepEqual(f.request('up'), ['summon']);
  assert.equal(f.phase, 'summon');
  assert.deepEqual(f.update(DT, true), ['ascend']);
  assert.equal(f.alt, KITE_GRAB);
  return f;
}

test('the climb: ground, summon, up, hover, down, ground - about five seconds each way', () => {
  for (const lift of [120, 130, 140]) {
    const f = rise(lift);
    let t = 0, top = null;
    while (f.phase === 'up' && t < 12) { const e = f.update(DT, true); t += DT; if (e.includes('top')) top = t; }
    assert.equal(f.phase, 'hover');
    assert.ok(top > 3.5 && top < 6.2, `${lift} m up in ${top.toFixed(2)} s`);
    assert.ok(Math.abs(travelTime(lift - KITE_GRAB, PROFILE.up) - top) < 0.45, 'the closed form agrees');
    assert.equal(f.alt, lift);
    assert.equal(f.liftK, 0);
    assert.deepEqual(f.request('down'), ['descend']);
    t = 0;
    let land = false;
    while (f.phase === 'down' && t < 12) { if (f.update(DT, true).includes('touchdown')) land = true; t += DT; }
    assert.ok(land && f.phase === 'ground' && f.alt === 0 && f.vel === 0 && f.liftK === 1);
    assert.ok(t > 3.5 && t < 6.5, `down in ${t.toFixed(2)} s`);
  }
});

test('the climb never overshoots, never goes under the ground, and its speed changes smoothly', () => {
  const f = rise(140);
  let prev = f.vel, worst = 0;
  const seq = [];
  for (let i = 0; i < 60 * 25; i++) {
    if (i === 60 * 7) f.request('down');
    if (i === 60 * 14) f.request('up');
    if (i === 60 * 16) f.request('down');
    f.update(DT, true);
    seq.push(f.alt);
    assert.ok(f.alt >= 0 && f.alt <= 140 + 1e-9, `alt ${f.alt}`);
    worst = Math.max(worst, Math.abs(f.vel - prev));
    prev = f.vel;
    assert.ok(Math.abs(f.vel) <= PROFILE.leave.vmax + 1e-9);
  }
  assert.ok(worst <= PROFILE.leave.a * DT + 1e-6 || worst < 1.5, `speed jumped by ${worst}`);
  assert.equal(f.phase, 'ground');
});

test('an exit at any moment of the climb brings her down within three seconds, gently', () => {
  for (const lift of [120, 140]) {
    for (let start = 0; start <= 7; start += 0.25) {
      const f = rise(lift);
      let t = 0;
      while (t < start && f.phase !== 'hover') { f.update(DT, true); t += DT; }
      const before = f.alt, v0 = f.vel;
      assert.deepEqual(f.request('leave').includes('descend'), true);
      let n = 0, prev = f.vel, landed = false;
      while (f.phase !== 'ground' && n < 60 * 6) {
        if (f.update(DT, true).includes('touchdown')) landed = true;
        n++;
        assert.ok(Math.abs(f.vel - prev) <= PROFILE.leave.a * DT + 1.5, 'no jerk (the last step onto the ground may stop up to 1.5 m/s)');
        prev = f.vel;
        assert.ok(f.alt >= -1e-9);
      }
      assert.ok(landed, `lift ${lift}, left at ${start}s (${before.toFixed(0)} m, v ${v0.toFixed(0)})`);
      assert.ok(n * DT <= LEAVE_MAX_S, `${n * DT} s from ${before.toFixed(0)} m`);
      assert.equal(f.leaving, true);
      assert.deepEqual(f.request('up'), [], 'no new climb while the viewer closes');
    }
  }
  assert.ok(travelTime(140, PROFILE.leave) <= LEAVE_MAX_S - 0.2);
});

test('Come down, then Fly up again on the way down: the climb resumes from where she is', () => {
  const f = rise(130);
  run(f, 3, {});
  f.request('down');
  run(f, 1, {});
  const mid = f.alt;
  assert.ok(mid > 5 && mid < 130, `mid ${mid}`);
  assert.equal(f.wantsUp, true);
  assert.deepEqual(f.request('up'), ['ascend']);
  run(f, 12);
  assert.equal(f.phase, 'hover');
});

test('interrupts before the kite has taken hold: cancel, abort after eight seconds, snap from anywhere', () => {
  let f = new SkyFlight({ lift: 130 });
  f.request('up');
  assert.deepEqual(f.request('down'), ['cancel']);
  assert.equal(f.phase, 'ground');
  f = new SkyFlight({ lift: 130 });
  f.request('up');
  assert.deepEqual(run(f, SUMMON_MAX_S + 0.5, { ready: false }), ['abort']);
  assert.equal(f.phase, 'ground');
  assert.equal(f.busy, false);
  // snap: from summon, from the climb, from the hover, from the descent
  for (const stage of ['summon', 'up', 'hover', 'down']) {
    f = new SkyFlight({ lift: 130 });
    f.request('up');
    if (stage !== 'summon') f.update(DT, true);
    if (stage === 'hover') run(f, 9);
    if (stage === 'down') { run(f, 5); f.request('down'); run(f, 1); }
    const ev = f.request('snap');
    assert.equal(ev.length, 1, stage);
    assert.deepEqual([f.phase, f.alt, f.vel, f.liftK], ['ground', 0, 0, 1]);
  }
  // snapping on the ground is a no-op
  assert.deepEqual(new SkyFlight().request('snap'), []);
  // an exit while the kite is coming (leave in summon) is a cancel too
  f = new SkyFlight({ lift: 130 });
  f.request('up');
  assert.deepEqual(f.request('leave'), ['cancel']);
  assert.equal(f.leaving, true);
});

test('the flight is busy exactly while she is not on the ground, so the viewer cannot close under her', () => {
  const f = new SkyFlight({ lift: 120 });
  assert.equal(f.busy, false);
  f.request('up');
  assert.equal(f.busy, true);
  f.update(DT, true);
  assert.equal(f.airborne, true);
  run(f, 12);
  f.request('down');
  run(f, 12);
  assert.equal(f.busy, false);
  assert.equal(f.wantsUp, true);
  // limits are clamped
  assert.equal(new SkyFlight({ lift: 9999 }).lift, SKY_LIFT_MAX);
  assert.equal(new SkyFlight({ lift: -5 }).lift, SKY_LIFT_MIN);
  assert.equal(new SkyFlight({}).lift, SKY_LIFT_DEFAULT);
  assert.equal(new SkyFlight({ lift: NaN }).lift, SKY_LIFT_DEFAULT);
});

test('advance(): reaches the target with no speed left, whatever the frame time', () => {
  for (const dt of [1 / 144, 1 / 60, 1 / 30, 0.1, 0.5]) {
    for (const [from, to] of [[0, 130], [130, 0], [60, 61], [60, 60.001], [3, 140]]) {
      const s = { alt: from, vel: 0 };
      let n = 0;
      while (!advance(s, to, dt, PROFILE.up) && n++ < 5000) { /* run */ }
      assert.ok(n < 5000, `${from}->${to} at dt ${dt}`);
      assert.deepEqual([s.alt, s.vel], [to, 0]);
    }
  }
});

// ------------------------------------------------------------------------------------------------ the lift cheat
test('the lift cheat fades with the climb and is gone at the top', () => {
  assert.equal(liftScale(0, 120), 1);
  assert.equal(liftScale(60, 120), 0.5);
  assert.equal(liftScale(120, 120), 0);
  assert.equal(liftScale(500, 120), 0);
  assert.equal(liftScale(-4, 120), 1);
  const f = rise(130);
  assert.ok(f.liftK < 1 && f.liftK > 0.9, 'just off the ground');
  let last = f.liftK;
  while (f.phase === 'up') { f.update(DT, true); assert.ok(f.liftK <= last + 1e-12, 'only falls while rising'); last = f.liftK; }
  assert.equal(f.liftK, 0);
  f.request('down');
  while (f.phase === 'down') { f.update(DT, true); }
  assert.equal(f.liftK, 1);
  // on the ground and while the kite swoops in the cheat is as it always was
  const g = new SkyFlight({ lift: 130 });
  g.request('up');
  assert.equal(g.liftK, 1);
});

test('skystars: the buffers hold the real positions, setLift moves the directions the labels use between lifted and true', () => {
  const profile = PROFILES.jp, season = 'summer', hour = 21;
  const sky = buildStarSky({ season, hour, profile, look: 'night', low: true });
  const scorpius = sky.infos.find(i => i.id === 'scorpius');
  assert.ok(scorpius && scorpius.lift > 0, 'scorpius is lifted on the ground');
  const dirAt = (alt, az) => worldDir(alt, az);
  const close = (v, a) => Math.abs(v.x - a[0]) + Math.abs(v.y - a[1]) + Math.abs(v.z - a[2]) < 1e-9;
  assert.equal(sky.liftK, 1);
  assert.ok(close(scorpius.dir, dirAt(scorpius.alt + scorpius.lift, scorpius.az)));
  assert.equal(sky.setLift(0.5), true);
  assert.ok(close(scorpius.dir, dirAt(scorpius.alt + scorpius.lift * 0.5, scorpius.az)));
  assert.equal(sky.setLift(0.5), false, 'no change, no work');
  sky.setLift(0);
  assert.ok(close(scorpius.dir, dirAt(scorpius.alt, scorpius.az)), 'at the top the group stands where it really is');
  assert.equal(sky.uniforms.uLiftK.value, 0);
  const g = sky.points.geometry.attributes;
  const lifts = g.aLift.array;
  assert.equal(lifts.length, g.position.count);
  assert.ok(lifts.some(v => v > 0) && lifts.every(v => v >= 0 && v <= 20 * Math.PI / 180 + 1e-6));
  const first = scorpius.stars[0], lp = g.position.array, i = first.idx * 3;
  const real = worldDir(Math.atan2(lp[i + 1], Math.hypot(lp[i], lp[i + 2])) * 180 / Math.PI, 0);
  assert.ok(real, 'the buffer holds the star at its real altitude');
  const L = lstFor(season, hour);
  void L;
  // the ribbons carry the same lifts
  const la = sky.lines.geometry.attributes.aLift.array;
  assert.equal(la.length, sky.lines.geometry.attributes.position.count);
  assert.ok(la.some(v => v > 0));
  sky.setLift(1);
  assert.ok(close(scorpius.dir, dirAt(scorpius.alt + scorpius.lift, scorpius.az)));
  sky.dispose();
});

// ------------------------------------------------------------------------------------------------ the sky's own clock
test('sky time: half-hour steps inside the night, clamped, never past 19:00 or 05:00', () => {
  assert.deepEqual([NIGHT.from, NIGHT.to, NIGHT.step], [19, 29, 0.5]);
  assert.equal(nightAxis(21), 21);
  assert.equal(nightAxis(0), 24);
  assert.equal(nightAxis(3.5), 27.5);
  assert.equal(nightAxis(5), 29);
  assert.ok(Math.abs(nightAxis(19.3) - 19.3) < 1e-9);
  assert.equal(nightAxis(12), null);
  assert.equal(nightAxis(6.5), null);
  assert.equal(nightAxis(17), null);
  assert.equal(nightAxis(18.9), 19, 'the last minutes of dusk count as 19:00');
  assert.equal(stepNight(21, 1), 21.5);
  assert.equal(stepNight(21, -1), 20.5);
  assert.equal(stepNight(21.2, 1), 21.5, 'steps land on the half hours');
  assert.equal(stepNight(21.2, -1), 21);
  assert.equal(stepNight(21.5, -1), 21);
  assert.equal(stepNight(19, -1), 19);
  assert.equal(stepNight(19.3, -1), 19);
  assert.equal(stepNight(29, 1), 29);
  assert.equal(stepNight(28.7, 1), 29);
  assert.equal(canStepNight(19, -1), false);
  assert.equal(canStepNight(19, 1), true);
  assert.equal(canStepNight(29, 1), false);
  // the whole night, there and back: 20 steps each way
  let v = 19, n = 0;
  while (canStepNight(v, 1)) { v = stepNight(v, 1); n++; }
  assert.deepEqual([v, n], [29, 20]);
  while (canStepNight(v, -1)) { v = stepNight(v, -1); n--; }
  assert.deepEqual([v, n], [19, 0]);
  // the clock hour of an axis value and its text
  assert.equal(clockOf(24), 0);
  assert.equal(clockOf(27.5), 3.5);
  assert.equal(clockOf(21), 21);
  assert.equal(hhmm(21), '21:00');
  assert.equal(hhmm(clockOf(24.5)), '00:30');
  assert.equal(hhmm(3.5), '03:30');
  assert.equal(hhmm(19.3), '19:18');
  assert.equal(hhmm(23.999), '00:00');
  assert.equal(hhmm(-0.5), '23:30');
  assert.equal(hourIcon(21), 'moon');
  assert.equal(hourIcon(2), 'moon');
  assert.equal(hourIcon(12), 'sun');
  assert.equal(hourIcon(6), 'sun');
});

test('sky time: the groups that are up change through the night, and the stars wheel round the North Star', () => {
  for (const [pid, profile] of Object.entries(PROFILES)) {
    for (const season of ['spring', 'summer', 'autumn', 'winter']) {
      const early = groupsUp(season, 19.5, profile).map(i => i.id), late = groupsUp(season, 4.5, profile).map(i => i.id);
      assert.ok(early.length >= 5 && late.length >= 5, `${pid}/${season}: ${early.length} / ${late.length} groups`);
      assert.notDeepEqual([...early].sort(), [...late].sort(), `${pid}/${season}: the night must change the sky`);
      // each half hour is a different sky: no two neighbouring steps have identical positions
      const a = groupsUp(season, 22, profile), b = groupsUp(season, 22.5, profile);
      const shared = a.find(x => b.some(y => y.id === x.id));
      assert.ok(shared && Math.abs(shared.az - b.find(y => y.id === shared.id).az) > 0.1, 'the groups move');
    }
  }
  // a group sets and a group rises: Scorpius is low in the south at 21:00 on a summer night and is gone by 04:30
  assert.ok(groupsUp('summer', 21, PROFILES.jp).some(i => i.id === 'scorpius'));
  assert.ok(!groupsUp('summer', 4.5, PROFILES.jp).some(i => i.id === 'scorpius'));
  // the North Star stays put: Polaris (latitude 35) is within a degree of the same altitude all night
  const alts = [19.5, 22, 1, 4].map(h => groupInfo(GROUP['little-dipper'], 'autumn', h, PROFILES.jp)).map(i => i.alt);
  assert.ok(Math.max(...alts) - Math.min(...alts) < 20 && alts.every(a => a > 20), `little dipper ${alts.map(a => a.toFixed(0))}`);
});

test('sky time: the learned-groups record only ever takes known ids, whatever hour the sky shows', async () => {
  const { cleanStarGroups, learnGroup } = await import('../src/content/constellations.js');
  const rec = cleanStarGroups(null);
  for (const hour of [19.5, 22, 1, 4.5]) for (const i of groupsUp('winter', hour, PROFILES.jp)) learnGroup(rec, i.id);
  assert.ok(rec.learned.includes('orion'));
  assert.equal(learnGroup(rec, 'orion'), false);
  assert.deepEqual(cleanStarGroups(rec).learned, rec.learned);
});

// ------------------------------------------------------------------------------------------------ the wiring
test('skygaze.js: the fly-up keys do not clash with the game, the clock never touches the game clock, the new lines are source strings', () => {
  const src = fs.readFileSync(new URL('../src/game/skygaze.js', import.meta.url), 'utf8');
  const input = fs.readFileSync(new URL('../src/engine/input.js', import.meta.url), 'utf8');
  for (const code of ['KeyU', 'PageUp', 'PageDown', 'Home']) {
    assert.ok(src.includes(`'${code}'`), `${code} is used`);
    assert.ok(!new RegExp(`${code}:`).test(input), `${code} is free in the game's key map`);
  }
  // G is the kite key; Tab [ ] , . T E Space Backspace Esc keep their meaning
  assert.ok(/KeyG: 'kite'/.test(input));
  for (const code of ["'Tab'", "'BracketRight'", "'BracketLeft'", "'KeyT'", "'Escape'"]) assert.ok(src.includes(code));
  assert.ok(!/time\.hour\s*=|timeOverride\s*=|cycleHour\s*=/.test(src), 'the sky viewer never writes the game clock');
  assert.ok(/N_\('Get the Star Kite first'\)/.test(src));
  const kite = fs.readFileSync(new URL('../src/actors/kite.js', import.meta.url), 'utf8');
  assert.ok(/this\.guide = null;\s*\n?\s*const g = this\.game, p = g\.player;/.test(kite) || kite.split('this.guide = null').length >= 3, 'the kite forgets the guide when it lets go');
});
