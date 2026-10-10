// The scene tour's data and camera math (src/content/tour.js): every tour is complete, every shot stands on real
// ground, and the whole flight stays out of the terrain, the water and the buildings on wide and tall screens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOURS, TOUR, YEAR, TEXT, TOUR_PLACES, DWELL, TRAVEL, FOV, timeline, poseAt, stopTime, shotOf, catmull, roofAt, obstacles, clearSight } from '../src/content/tour.js';
import { sharedGrid } from '../src/world/roads.js';
import { TERRAIN, WORLD } from '../src/world/layout.js';
import { SEASONS, PALETTES, lightingAt } from '../src/world/seasons.js';

const grid = sharedGrid();
const heightAt = (x, z) => grid.heightAt(x, z);
const ground = (x, z) => Math.max(heightAt(x, z), 0);       // the river's surface counts as ground
const ASPECTS = { wide: 16 / 9, tall: 390 / 844 };

test('tour: the five tours are defined, with unique ids and seven to nine stops each', () => {
  assert.deepEqual(TOURS.map(t => t.id), ['spring', 'summer', 'autumn', 'winter', 'night']);
  assert.equal(new Set(TOURS.map(t => t.id)).size, TOURS.length);
  assert.equal(TOUR.night.season, 'summer');
  for (const t of TOURS) {
    assert.ok(SEASONS.includes(t.season), `${t.id}: season`);
    assert.ok(t.stops.length >= 7 && t.stops.length <= 9, `${t.id}: ${t.stops.length} stops`);
    assert.equal(new Set(t.stops.map(s => s.place)).size, t.stops.length, `${t.id}: a place is visited once`);
    assert.ok([null, 'petals', 'leaves', 'snow', 'fireflies'].includes(t.weather), `${t.id}: weather`);
    for (const s of t.stops) {
      assert.ok(TOUR_PLACES[s.place], `${t.id}: unknown place ${s.place}`);
      assert.ok(s.hour >= 0 && s.hour < 24, `${t.id}/${s.place}: hour`);
    }
    // the day only moves forward, gently
    for (let i = 1; i < t.stops.length; i++) assert.ok(t.stops[i].hour >= t.stops[i - 1].hour && t.stops[i].hour - t.stops[i - 1].hour < 2.2, `${t.id}: the hour runs forward at stop ${i}`);
  }
  // each tour shows what it promises
  assert.ok(TOUR.night.stops.every(s => lightingAt('summer', s.hour).night > 0.9), 'the night tour is dark throughout');
  assert.equal(lightingAt('summer', TOUR.night.stops.at(-1).hour).stars, 1, 'stars at the last night stop');
  assert.equal(TOUR.night.stops.at(-1).place, 'hill');
  assert.ok(lightingAt('winter', TOUR.winter.stops.at(-1).hour).night > 0.3, 'winter ends with lit windows');
  for (const id of ['spring', 'autumn']) assert.ok(TOUR[id].stops.every(s => lightingAt(TOUR[id].season, s.hour).night < 0.2), `${id} is a daylight tour`);
  assert.equal(PALETTES[TOUR.winter.season].snow, 1);
  for (const t of TOURS) for (const need of ['kawabe', 'fields', 'dock', 'mill', 'shrine', 'takamori']) assert.ok(t.stops.some(s => s.place === need), `${t.id} visits ${need}`);
  assert.equal(TOUR_PLACES.dock.does, 'fish');
  assert.equal(TOUR_PLACES.viaduct.does, 'train');
  assert.equal(TOUR_PLACES.hill.does, 'stars');
});

test('tour: every string is there', () => {
  const all = [];
  for (const p of Object.values(TOUR_PLACES)) all.push(p.name);
  for (const t of [...TOURS, YEAR]) all.push(t.name, t.blurb);
  for (const t of TOURS) for (const s of t.stops) all.push(s.line);
  all.push(...Object.values(TEXT));
  for (const s of all) assert.ok(typeof s === 'string' && s.trim().length > 1, `empty string: ${JSON.stringify(s)}`);
  const lines = TOURS.flatMap(t => t.stops.map(s => s.line));
  assert.equal(new Set(lines).size, lines.length, 'no line is told twice');
  for (const l of lines) assert.ok(l.length <= 80, `a caption line fits two rows on a phone: ${l}`);
  for (const k of ['length', 'of']) assert.match(TEXT[k], /\{\w+\}/);
  assert.match(TEXT.safe, /not changed/);
});

test('tour: every stop stands in the open, above the ground, looking at something near', () => {
  for (const [id, p] of Object.entries(TOUR_PLACES)) {
    for (const [kind, v] of [['wide', p], ...(p.tall ? [['tall', p.tall]] : [])]) {
      const [x, y, z] = v.cam;
      assert.ok(x > WORLD.minX && x < WORLD.maxX && z > WORLD.minZ && z < WORLD.maxZ, `${id}: inside the valley`);
      assert.ok(y - ground(x, z) >= 1.5, `${id} (${kind}): camera ${(y - ground(x, z)).toFixed(2)} m above the ground`);
      assert.ok(y >= roofAt(x, z, heightAt, 1.5) + 1, `${id} (${kind}): camera clear of buildings`);
      const d = Math.hypot(v.look[0] - x, v.look[1] - y, v.look[2] - z);
      assert.ok(d > 6 && d < 70, `${id} (${kind}): subject ${d.toFixed(0)} m away`);
    }
  }
  // the dock looks steeply down into the water; the hill looks up
  const dock = TOUR_PLACES.dock, hill = TOUR_PLACES.hill;
  const pitch = p => Math.atan2(p.look[1] - p.cam[1], Math.hypot(p.look[0] - p.cam[0], p.look[2] - p.cam[2])) * 180 / Math.PI;
  assert.ok(pitch(dock) < -35, `the dock shot looks down (${pitch(dock).toFixed(0)}°)`);
  assert.ok(heightAt(dock.look[0], dock.look[2]) < -0.8, 'the dock shot looks at open water');
  assert.ok(heightAt(dock.fish[0], dock.fish[1]) < -1, 'the fish swim in deep water');
  assert.ok(pitch(hill) > 20, `the hill shot looks up (${pitch(hill).toFixed(0)}°)`);
});

test('tour: timings add up', () => {
  let year = 0;
  for (const t of TOURS) {
    const tl = timeline(t);
    year += tl.length;
    assert.ok(tl.length > 45 && tl.length < 100, `${t.id}: ${tl.length.toFixed(0)} s`);
    assert.equal(tl.segs.filter(s => s.kind === 'dwell').length, t.stops.length);
    assert.equal(tl.segs.filter(s => s.kind === 'travel').length, t.stops.length - 1);
    let at = 0;
    for (const s of tl.segs) {
      assert.ok(Math.abs(s.t0 - at) < 1e-9 && s.t1 > s.t0, `${t.id}: segments follow one another`);
      at = s.t1;
      if (s.kind === 'travel') assert.ok(s.t1 - s.t0 >= TRAVEL[0] - 1e-9 && s.t1 - s.t0 <= TRAVEL[1] + 1e-9);
      else assert.ok(s.t1 - s.t0 >= 4 && s.t1 - s.t0 <= 10, 'a short dwell');
    }
    assert.ok(Math.abs(at - tl.length) < 1e-9);
    t.stops.forEach((s, i) => {
      const p = poseAt(t, tl, stopTime(tl, i) + 0.01, { heightAt });
      assert.equal(p.i, i); assert.equal(p.kind, 'dwell'); assert.equal(p.hour, s.hour);
    });
    assert.equal(shotOf(t.stops[0]).name, TOUR_PLACES[t.stops[0].place].name);
  }
  assert.ok(year < 8 * 60, `the whole year lasts ${(year / 60).toFixed(1)} min`);
  assert.ok(DWELL >= 4 && FOV.tall > FOV.wide);
});

test('tour: the whole flight stays above the ground and the water and out of every building', () => {
  for (const [name, aspect] of Object.entries(ASPECTS)) {
    for (const t of TOURS) {
      const tl = timeline(t), env = { heightAt, aspect };
      let last = null, lastLook = null;
      for (let s = 0; s <= tl.length; s += 0.05) {
        const p = poseAt(t, tl, s, env), [x, y, z] = p.pos, where = `${t.id} (${name}) at ${s.toFixed(2)} s, toward ${t.stops[p.i].place}`;
        assert.ok(p.pos.every(Number.isFinite) && p.look.every(Number.isFinite) && Number.isFinite(p.hour), `${where}: finite`);
        assert.ok(x > TERRAIN.minX && x < TERRAIN.maxX && z > TERRAIN.minZ && z < TERRAIN.maxZ, `${where}: over the terrain`);
        assert.ok(y - ground(x, z) >= 1.19, `${where}: ${(y - ground(x, z)).toFixed(2)} m above the ground`);
        assert.ok(y >= roofAt(x, z, heightAt, 1.5) + 1.19, `${where}: inside a building's space`);
        assert.ok(y < 120, `${where}: not in orbit`);
        assert.ok(Math.hypot(p.look[0] - x, p.look[1] - y, p.look[2] - z) > 4, `${where}: the subject is in front of the lens`);
        if (last) {
          const v = Math.hypot(x - last[0], y - last[1], z - last[2]) / 0.05, w = Math.hypot(p.look[0] - lastLook[0], p.look[1] - lastLook[1], p.look[2] - lastLook[2]) / 0.05;
          assert.ok(v < 70, `${where}: the camera jumps (${v.toFixed(0)} m/s)`);
          assert.ok(w < 70, `${where}: the view jumps (${w.toFixed(0)} m/s)`);
        }
        last = p.pos; lastLook = p.look;
      }
      // a rest is a rest: the camera barely moves there
      for (const seg of tl.segs.filter(s => s.kind === 'dwell')) {
        const a = poseAt(t, tl, seg.t0 + 0.01, env).pos, b = poseAt(t, tl, seg.t1 - 0.01, env).pos;
        assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 9, `${t.id}: the rest at stop ${seg.i} drifts gently`);
      }
    }
  }
});

test('tour: camera helpers', () => {
  // the curve passes through its two inner points
  const a = [0, 0, 0], b = [10, 2, 0], c = [20, 2, 10], d = [40, 0, 10];
  assert.deepEqual(catmull(a, b, c, d, 0).map(v => +v.toFixed(6)), b);
  assert.deepEqual(catmull(a, b, c, d, 1).map(v => +v.toFixed(6)), c);
  assert.ok(catmull(null, b, c, null, 0.5).every(Number.isFinite), 'missing neighbours are mirrored');
  // a ridge between camera and subject lifts the camera until it sees over
  const ridge = (x) => (Math.abs(x - 10) < 3 ? 12 : 0);
  const cam = clearSight([0, 5, 0], [20, 2, 0], ridge, 1);
  assert.ok(cam[1] > 20, `lifted to ${cam[1].toFixed(1)}`);
  assert.equal(clearSight([0, 30, 0], [20, 2, 0], () => 0, 1)[1], 30, 'a clear view is left alone');
  // buildings, lamp towers and the viaduct are all known obstacles; the viaduct can be passed underneath
  const ids = obstacles().map(o => o.id);
  for (const id of ['mill', 'belltower', 'shrine', 'lamp:forest', 'viaduct']) assert.ok(ids.includes(id), `obstacle ${id}`);
  assert.ok(roofAt(115, -4, heightAt) > 21 + 16, 'the bell tower is tall');
  assert.equal(roofAt(-45, 30, heightAt), -Infinity, 'the open street has no roof');
  assert.ok(roofAt(0, 120, heightAt) > 20, 'the viaduct deck and its train');
  const near = roofAt(0, 130, heightAt, 1.5, 16), far = roofAt(0, 146, heightAt, 1.5, 16);
  assert.ok(roofAt(0, 130, heightAt) === -Infinity && near > 5 && near < 21 && far === -Infinity, 'a soft ramp leads up to an obstacle');
});
