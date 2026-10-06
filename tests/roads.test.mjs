import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRoads, route, doorPoint, nearestNode, placeProblems, buildingSolids, legClear, pathLength, sharedGrid, inFootprint } from '../src/world/roads.js';
import { BUILDINGS, river, riverHalfWidth } from '../src/world/layout.js';
import { DOOR_SPOTS, HOMES } from '../src/world/interiors.js';

const KAWABE = { x: -45, z: 20 }, TAKAMORI = { x: 115, z: 6 };
const grid = sharedGrid();
const t0 = performance.now();
const G = buildRoads();
const buildMs = performance.now() - t0;
const solids = buildingSolids();
const ENTERABLE = [...HOMES.flatMap(([, ids]) => ids), 'cottage', 'bakery', 'mill', 'station', 'boathouse', 'engineShed'];
const westOfRiver = (x, z) => x < river.nearest(x, z, 400).x;

function inSolidAt(x, z, m = 0.15, except = null) {
  return solids.find(b => {
    if (b.id === except) return false;
    const dx = x - b.x, dz = z - b.z, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
    return Math.abs(lx) < b.hw + m && Math.abs(lz) < b.hd + m;
  })?.id ?? null;
}
/** Every 0.5 m along a route: clear of walls (a door's own wall excepted in its last 1.5 m) and dry. */
function routeProblems(path, doorId = null, doorAt = null) {
  const out = [];
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1], [bx, bz] = path[i], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5));
    for (let k = 0; k <= n; k++) {
      const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n;
      const ex = doorAt && Math.hypot(x - doorAt.x, z - doorAt.z) < 1.5 ? doorId : null;
      const s = inSolidAt(x, z, 0.15, ex);
      if (s) out.push(`(${x.toFixed(1)}, ${z.toFixed(1)}) inside ${s}`);
      const rv = river.nearest(x, z, 60);
      if (grid.heightAt(x, z) < 0.3 || (rv && rv.d < riverHalfWidth(rv.z))) out.push(`(${x.toFixed(1)}, ${z.toFixed(1)}) in water`);
    }
  }
  return out;
}

test('the road graph builds quickly, every drawn path leg is clear, and the networks stay on their side of the river', () => {
  assert.ok(buildMs < 400, `buildRoads took ${buildMs.toFixed(0)} ms`);
  assert.deepEqual(G.blocked, [], 'no road leg clips a wall');
  assert.equal(new Set(G.comp).size, 2, 'exactly two networks: west (Kawabe, station, mill) and east (Takamori, orchard, shrine)');
  for (const e of G.edges.filter(e => e.alive)) {
    const A = G.nodes[e.a], B = G.nodes[e.b];
    assert.equal(westOfRiver(A.x, A.z), westOfRiver(B.x, B.z), `edge (${A.x},${A.z})-(${B.x},${B.z}) crosses the river`);
  }
});

test('every enterable building has a dry door point reachable from its village centre', () => {
  for (const id of ENTERABLE) {
    const b = BUILDINGS.find(q => q.id === id);
    assert.ok(b && DOOR_SPOTS[b.model], `${id} has a door spot`);
    const d = doorPoint(id);
    assert.ok(d, `${id} door`);
    assert.ok(grid.heightAt(d.x, d.z) > 0.35, `${id} door is dry`);
    assert.equal(inSolidAt(d.x, d.z, 0.3), null, `${id} door point clear of walls`);
    assert.equal(G.unreachable[`door:${id}`], undefined, `${id}: ${G.unreachable[`door:${id}`]}`);
    const centre = westOfRiver(b.x, b.z) ? KAWABE : TAKAMORI, other = centre === KAWABE ? TAKAMORI : KAWABE;
    const r = route(G, centre, `door:${id}`);
    assert.ok(r && r.length >= 2, `${id} reachable from its village`);
    assert.deepEqual(routeProblems(r, id, d), [], `${id} route`);
    assert.equal(route(G, other, `door:${id}`), null, `${id} unreachable across the river`);
  }
});

test('routes between every pair of Kawabe doors and every pair of Takamori doors are clear; cross-river is null', () => {
  const doors = Object.keys(G.doors);
  for (const a of doors) for (const b of doors) {
    if (a === b) continue;
    const r = route(G, `door:${a}`, `door:${b}`);
    const A = G.doors[a], B = G.doors[b];
    if (westOfRiver(A.x, A.z) !== westOfRiver(B.x, B.z)) { assert.equal(r, null, `${a} -> ${b}`); continue; }
    assert.ok(r, `${a} -> ${b}`);
    // walls excepted near either door (both ends are door approaches)
    const p = routeProblems(r, b, B).filter(s => !(s.includes(`inside ${a}`) && Math.hypot(...s.match(/-?[\d.]+/g).slice(0, 2).map(Number).map((v, i) => v - [A.x, A.z][i])) < 1.5));
    assert.deepEqual(p, [], `${a} -> ${b}`);
  }
});

test('fixture: spots attach by clear spurs, unknown keys and blocked spots are unreachable, routes are cached and copied', () => {
  const g = buildRoads({ spots: { well: { x: -42, z: 24 }, lake: { x: 12, z: 30 }, east: { x: 110, z: 12 } }, doors: ['kw2'] });
  assert.ok(g.keys.has('well') && g.keys.has('east'));
  assert.ok(g.unreachable.lake, 'a spot in the river has no spur');
  assert.equal(route(g, 'well', 'lake'), null);
  assert.equal(route(g, 'well', 'nowhere'), null);
  assert.equal(route(g, 'well', 'east'), null, 'no bridge between the villages');
  const r = route(g, 'well', 'door:kw2');
  assert.ok(r && pathLength(r) < 40);
  r.push([0, 0]);
  assert.notEqual(route(g, 'well', 'door:kw2').length, r.length, 'cached routes are copied');
  const n = nearestNode(g, -45, 20);
  assert.ok(Math.hypot(g.nodes[n].x + 45, g.nodes[n].z - 20) < 3);
  // legClear refuses a leg through a house and through the river
  assert.ok(!legClear(g, -60, 33, -50, 33));
  assert.ok(!legClear(g, -3, 30, 26, 30));
  assert.deepEqual(placeProblems(-45, 25), []);
  assert.ok(placeProblems(-56, 33).includes('inside a building') && inFootprint(-56, 33));
});

test('routing is fast', () => {
  const t = performance.now();
  for (let i = 0; i < 500; i++) route(G, { x: -45 + (i % 9), z: 10 + (i % 13) }, 'door:kw8');
  const ms = performance.now() - t;
  assert.ok(ms < 500, `500 free-point routes took ${ms.toFixed(0)} ms`);
});

// ------------------------------------------------------------------ the real content (once the writer's files exist)
let TF = null;
try { TF = await import('../src/content/townsfolk.js'); } catch { TF = null; }

test('townsfolk spots are well placed and every place in every plan is reachable within the person\'s network', { skip: !TF && 'src/content/townsfolk.js not written yet' }, () => {
  const { SPOTS, PEOPLE } = TF;
  for (const [k, s] of Object.entries(SPOTS)) assert.deepEqual(placeProblems(s.x, s.z), [], `spot ${k}`);
  const g = buildRoads({ spots: SPOTS });
  assert.deepEqual(Object.keys(g.unreachable).filter(k => !k.startsWith('door:')), [], 'every spot attaches to a road');
  for (const p of PEOPLE) {
    const places = [];
    if (p.home) places.push(`door:${p.home}`);
    for (const b of p.plan || []) for (const t of b.tasks || []) {
      for (const k of [t.go, t.at, t.wander]) if (k) places.push(k);
      for (const d of t.deliver || []) places.push(d.startsWith('door:') ? d : `door:${d}`);
    }
    const nets = new Set();
    for (const k of places) {
      const pt = k.startsWith('door:') ? g.doors[k.slice(5)] : SPOTS[k];
      assert.ok(pt, `${p.id}: unknown place ${k}`);
      assert.ok(g.keys.has(k), `${p.id}: ${k} is not on the roads`);
      nets.add(g.comp[g.keys.get(k)]);
    }
    assert.ok(nets.size <= 1, `${p.id} (${p.name}) has places on both sides of the river: ${places.join(', ')}`);
  }
});
