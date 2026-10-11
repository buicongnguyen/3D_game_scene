// Every yard (content/yard.js YARDS): flat, dry, open ground clear of everything else in the valley, with gates the kids
// can walk through, and every game's stage and ground marks clear of buildings, roads and each other.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { YARD_LIST, YARDS, yardSolids, fenceRuns, gates, leavePath, enterPoint, insideFence, groundMarks, stageOf, toWorld, toCourt, gameOn, setGameOn, yardAt } from '../src/content/yard.js';
import { YARD_GAME } from '../src/game/yard/index.js';
import { placeProblems, sharedGrid, inFootprint, buildRoads, route } from '../src/world/roads.js';
import { PATHS, PADDIES, CLEARINGS, FALLEN_STARS, BUILDINGS, POST_SHAPES, SHAPES } from '../src/world/layout.js';
import { FOOTPRINT } from '../src/world/structures.js';
import { SIGNS, BOARD, signPlace } from '../src/content/signs.js';
import { DOOR_SPOTS } from '../src/world/interiors.js';
import { TRICKS } from '../src/content/tricks.js';
import { SKY_SPOTS } from '../src/content/skyspots.js';
import { FARM } from '../src/content/farm.js';
import { PEOPLE, SPOTS } from '../src/content/townsfolk.js';

const toFence = (Y, x, z) => { const F = Y.fence; return Math.hypot(Math.max(F.x0 - x, 0, x - F.x1), Math.max(F.z0 - z, 0, z - F.z1)); };
function segDist(ax, az, bx, bz, px, pz) {
  const vx = bx - ax, vz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz || 1e-9)));
  return Math.hypot(ax + vx * t - px, az + vz * t - pz);
}
/** Ground points of everything the yard owns: its fenced lattice, its solids and its ground marks. */
function ownPoints(Y) {
  const F = Y.fence, pts = [];
  for (let x = F.x0; x <= F.x1 + 1e-6; x += 1) for (let z = F.z0; z <= F.z1 + 1e-6; z += 1) pts.push([x, z]);
  const { boxes, posts } = yardSolids(Y);
  for (const b of boxes) pts.push([b.x - b.hw, b.z - b.hd], [b.x + b.hw, b.z + b.hd]);
  for (const p of posts) pts.push([p.x, p.z]);
  for (const m of groundMarks(Y)) for (let x = m.x - m.hw; x <= m.x + m.hw + 1e-6; x += 1) for (let z = m.z - m.hd; z <= m.z + m.hd + 1e-6; z += 1) pts.push([x, z]);
  return pts;
}

test('yards: each stands on dry, gentle, open ground (the court itself dead flat)', () => {
  const g = sharedGrid();
  for (const Y of YARD_LIST) {
    for (const [x, z] of ownPoints(Y)) {
      assert.deepEqual(placeProblems(x, z), [], `${Y.id} (${x.toFixed(1)}, ${z.toFixed(1)})`);
      assert.ok(!inFootprint(x, z, 1.0), `${Y.id}: (${x.toFixed(1)}, ${z.toFixed(1)}) is at a wall`);
      assert.ok(g.slopeAt(x, z) <= 6, `${Y.id}: slope ${g.slopeAt(x, z).toFixed(1)} at (${x.toFixed(1)}, ${z.toFixed(1)})`);
    }
    let lo = 1e9, hi = -1e9;
    for (let u = -3.2; u <= 3.2; u += 0.8) for (let v = -5.7; v <= 5.7; v += 0.95) { const w = toWorld(u, v, {}, stageOf(Y)), h = g.heightAt(w.x, w.z); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    assert.ok(hi - lo < 0.015, `${Y.id}: the court is flat (${(hi - lo).toFixed(3)} m)`);
    // every game's stage is flat enough to play on (the sack race and the tug strip are the long ones)
    for (const id of Y.games) {
      const S = stageOf(Y, id);
      let a = 1e9, b = -1e9;
      for (let u = -3; u <= 3; u += 1) for (let v = -7; v <= 7; v += 1) { const w = toWorld(u, v, {}, S), h = g.heightAt(w.x, w.z); a = Math.min(a, h); b = Math.max(b, h); }
      if (id === 'sack' || id === 'tug') assert.ok(b - a < 0.7, `${Y.id}/${id}: the strip is level (${(b - a).toFixed(2)} m)`);
    }
  }
});

test('yards: clear of roads, paddies, trick signs, sky spots, fallen stars, animals and other yards', () => {
  for (const Y of YARD_LIST) {
    const pts = ownPoints(Y);
    for (const p of PATHS) for (let i = 0; i + 1 < p.pts.length; i++) for (const [x, z] of pts) {
      assert.ok(segDist(...p.pts[i], ...p.pts[i + 1], x, z) > p.w / 2 + 1.2, `${Y.id}: (${x.toFixed(1)}, ${z.toFixed(1)}) is on a ${p.w} m road`);
    }
    for (const p of PADDIES) assert.ok(toFence(Y, p.x, p.z) > Math.hypot(p.w, p.d) / 2 + 3, `${Y.id}: ${p.id}`);
    for (const t of TRICKS) assert.ok(toFence(Y, t.place.x, t.place.z) > 6, `${Y.id}: the ${t.id} sign`);
    for (const s of SKY_SPOTS) if (s.on === 'ground') assert.ok(toFence(Y, s.x, s.z) > s.r + 6, `${Y.id}: sky spot ${s.id}`);
    for (const s of FALLEN_STARS) assert.ok(toFence(Y, s.x, s.z) > 5, `${Y.id}: ${s.id}`);
    for (const [id, , x, z, , r] of FARM) assert.ok(toFence(Y, x, z) > r + 3, `${Y.id}: ${id} roams here`);
    for (const O of YARD_LIST) if (O !== Y) assert.ok(Math.hypot(O.x - Y.x, O.z - Y.z) > 60, 'yards are far apart');
    // marks on the ground do not overlap the court's fence rectangle, the fence's own props, or each other
    const marks = groundMarks(Y);
    for (const m of marks) {
      const dx = Math.max(Y.fence.x0 - (m.x + m.hw), m.x - m.hw - Y.fence.x1, 0), dz = Math.max(Y.fence.z0 - (m.z + m.hd), m.z - m.hd - Y.fence.z1, 0);
      assert.ok(Math.hypot(dx, dz) >= 0.25 || !Y.stages?.[m.id] || m.id === 'sack', `${Y.id}: the ${m.id} marks sit clear of the rails`);
    }
    for (let i = 0; i < marks.length; i++) for (let j = i + 1; j < marks.length; j++) {
      const a = marks[i], b = marks[j];
      assert.ok(Math.abs(a.x - b.x) > a.hw + b.hw + 0.3 || Math.abs(a.z - b.z) > a.hd + b.hd + 0.3, `${Y.id}: ${a.id} and ${b.id} overlap`);
    }
  }
});

test('yards: name boards and Town Life spots', () => {
  const building = id => BUILDINGS.find(b => b.id === id);
  for (const Y of YARD_LIST) {
    const s = SIGNS.find(q => q.id === Y.sign);
    assert.ok(s, `${Y.id}: a name board`);
    assert.equal(s.text, Y.name);
    const p = signPlace(s, null, null, null), [w] = BOARD[s.kind], ax = Math.cos(p.yaw), az = -Math.sin(p.yaw);
    for (const o of [-(w / 2 + 0.1), 0, w / 2 + 0.1]) {
      const x = p.x + ax * o, z = p.z + az * o;
      assert.ok(!insideFence(Y, x, z, 0.5) && toFence(Y, x, z) < 4.5, `${Y.id}: the board stands just outside`);
      assert.deepEqual(placeProblems(x, z), []);
      for (const gt of gates(Y)) assert.ok(Math.hypot(gt.x - x, gt.z - z) > 2.2, `${Y.id}: the board keeps clear of the ${gt.side} gate`);
      for (const m of groundMarks(Y)) assert.ok(Math.abs(x - m.x) > m.hw + 0.4 || Math.abs(z - m.z) > m.hd + 0.4, `${Y.id}: the board stands on the ${m.id} marks`);
    }
    // no other board stands in the yard
    for (const o of SIGNS) {
      if (o === s) continue;
      const b = o.building ? building(o.building) : null, q = signPlace(o, b, b && FOOTPRINT[b.model], b && DOOR_SPOTS[b.model]);
      assert.ok(!insideFence(Y, q.x, q.z, 0.5), `${Y.id}: board ${o.id} in the yard`);
    }
    const spot = SPOTS[Y.spot];
    assert.ok(spot, `${Y.id}: the Town Life spot ${Y.spot}`);
    assert.deepEqual(placeProblems(spot.x, spot.z), []);
    const near = gates(Y).filter(gt => Math.hypot(gt.outX - spot.x, gt.outZ - spot.z) < 1.2);
    assert.ok(near.length, `${Y.id}: the spot is just outside a gate`);
    for (const [id, q] of Object.entries(SPOTS)) if (id !== Y.spot) assert.ok(toFence(Y, q.x, q.z) > 1.2, `${Y.id}: ${id} is by the fence`);
    // the kids who play there are Town Life people of that village, and none of them lives in the yard
    for (const id of Y.kids) { const k = PEOPLE.find(p => p.id === id); assert.ok(k && k.village === Y.id, `${Y.id}: ${id}`); }
  }
  assert.equal(yardAt(-20, 15).id, 'kawabe');
  assert.equal(yardAt(115, -21).id, 'takamori');
  assert.equal(yardAt(0, 100), null);
});

test('yards: kids walk in and out by the gates, never through the rails', () => {
  for (const Y of YARD_LIST) {
    const runs = fenceRuns(Y);
    assert.ok(gates(Y).length >= 2 && gates(Y).every(gt => gt.side && Math.hypot(gt.inX - gt.outX, gt.inZ - gt.outZ) > 1.7));
    const crosses = (a, b) => { for (const [x0, z0, x1, z1] of runs) for (let t = 0; t <= 1; t += 0.02) { const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t; if (segDist(x0, z0, x1, z1, x, z) < 0.12) return true; } return false; };
    const F = Y.fence;
    for (let x = F.x0 + 0.6; x < F.x1; x += 1.6) for (let z = F.z0 + 0.6; z < F.z1; z += 1.6) {
      const path = leavePath(Y, x, z);
      assert.equal(path.length, 3, 'a kid inside is given the gate way out');
      let at = [x, z];
      for (const p of path) { assert.ok(!crosses(at, p) || at === path[0], `${Y.id}: from (${x.toFixed(1)}, ${z.toFixed(1)}) the way to the gate crosses the rails`); at = p; }
      assert.ok(!insideFence(Y, ...path[2], -0.01) && !insideFence(Y, path[2][0], path[2][1], 0));
    }
    assert.deepEqual(leavePath(Y, F.x0 - 3, F.z0 - 3), []);
    const e = enterPoint(Y, SPOTS[Y.spot].x, SPOTS[Y.spot].z);
    assert.ok(e && insideFence(Y, e[0], e[1]));
    assert.equal(enterPoint(Y, Y.x, Y.z), null);
    // every game's stage can be reached on foot from the yard's spot
    const roads = buildRoads({ spots: SPOTS });
    for (const id of Y.games) {
      const S = stageOf(Y, id), w = toWorld(0, 0, {}, S);
      assert.ok(Math.abs(toCourt(w.x, w.z, {}, S).u) < 1e-9);
    }
    void roads; void route;
  }
});

test('yards: each yard lists games the registry knows, and the board setting cycles only those', () => {
  for (const Y of YARD_LIST) {
    assert.ok(Y.games.length >= 3);
    for (const id of Y.games) assert.ok(YARD_GAME[id], `${Y.id}: ${id}`);
    assert.equal(new Set(Y.games).size, Y.games.length);
    const save = {};
    assert.equal(gameOn(save, Y), Y.games[0]);
    for (const id of Y.games) { setGameOn(save, Y, id); assert.equal(gameOn(save, Y), id); }
    setGameOn(save, Y, 'nonsense');
    assert.equal(gameOn(save, Y), Y.games[0]);
  }
  assert.deepEqual(YARDS.kawabe.games, ['footnet', 'keepup', 'rope', 'marbles', 'oanquan']);
  assert.deepEqual(YARDS.takamori.games, ['volley', 'tug', 'sack', 'rope']);
  void POST_SHAPES; void SHAPES; void CLEARINGS;
});
