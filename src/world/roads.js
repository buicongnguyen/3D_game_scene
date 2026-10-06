// Road graph for townsfolk: pure math over layout data (no three.js objects are created), shared by runtime and tests.
// Nodes sit at PATHS vertices and junctions; named spots and building doors hang off the roads on short, clear spurs.
// Routes never cross the river (the villages are linked only by the ferry), so Kawabe <-> Takamori returns null.

import { BUILDINGS, PADDIES, PATHS, WORLD, river, riverHalfWidth } from './layout.js';
import { FOOTPRINT, PORCH } from './structures.js';
import { DOOR_SPOTS } from './interiors.js';
import { HeightGrid } from './heightfield.js';

const rad = d => d * Math.PI / 180;
const MERGE = 1.5;          // vertices closer than this are one node
const SAMPLE = 0.5;         // clearance sampling step along legs
const LINK = 45;            // longest connector between separate path networks
const SPUR = 60;            // longest spur from a spot / door to a road
const SLOPE_MAX = 30;       // walkable slope for spurs and connectors (deg)
const WET = 0.35;          // ground below this is water's edge (the mill yard sits at ~0.6 m)
const NO_SOLID = new Set(['platform', 'torii']);   // walk-over / walk-through models

let defaultGrid = null;
/** The shared height grid (built once on demand; the runtime may pass its own object with heightAt/slopeAt). */
export function sharedGrid() { return defaultGrid || (defaultGrid = new HeightGrid(2)); }

// ------------------------------------------------------------------ placement rules (same as tests/barks.test.mjs)
/** True when (x, z) lies inside a building's wall footprint grown by margin m (platforms excluded). */
export function inFootprint(x, z, m = 0.3, buildings = BUILDINGS) {
  return buildings.some(b => {
    const fp = FOOTPRINT[b.model];
    if (!fp || b.model === 'platform') return false;
    const r = rad(b.rot), dx = x - b.x, dz = z - b.z;
    const lx = dx * Math.cos(r) - dz * Math.sin(r), lz = dx * Math.sin(r) + dz * Math.cos(r);
    return Math.abs(lx) < fp[0] / 2 + m && Math.abs(lz) < fp[1] / 2 + m;
  });
}
const inPaddy = (x, z, m = 1.2) => PADDIES.some(p => Math.abs(x - p.x) < p.w / 2 + m && Math.abs(z - p.z) < p.d / 2 + m);

/** Why a person could not stand at (x, z): [] when fine. Same rules as the villager placement test. */
export function placeProblems(x, z, grid = sharedGrid()) {
  const out = [], h = grid.heightAt(x, z), rv = river.nearest(x, z, 60);
  if (inPaddy(x, z)) out.push('in a rice paddy');
  if (x < WORLD.minX + 3 || x > WORLD.maxX - 3 || z < WORLD.minZ + 3 || z > WORLD.maxZ - 3) out.push('outside the world');
  if (h < 0.8) out.push(`wet (${h.toFixed(1)} m)`);
  if (grid.slopeAt(x, z) > 22) out.push('steep');
  if (inFootprint(x, z)) out.push('inside a building');
  if (rv && rv.d - riverHalfWidth(rv.z) < 2.5) out.push('on the river');
  return out;
}

// ------------------------------------------------------------------ solids (approximate the runtime colliders)
/** Collider boxes as structures.js builds them: walls shrunk to 94 %, porches cut off (they are walkable). */
export function buildingSolids(buildings = BUILDINGS) {
  const out = [];
  for (const b of buildings) {
    const fp = FOOTPRINT[b.model];
    if (!fp || NO_SOLID.has(b.model)) continue;
    const porch = PORCH[b.model], r = rad(b.rot), fx = Math.sin(r), fz = Math.cos(r), back = porch ? porch.depth / 2 : 0;
    out.push({ id: b.id, x: b.x - fx * back, z: b.z - fz * back, hw: fp[0] * 0.94 / 2, hd: (fp[1] * 0.94 - (porch?.depth || 0)) / 2, c: Math.cos(r), s: Math.sin(r) });
  }
  return out;
}
function inSolid(solids, x, z, m, except) {
  for (const b of solids) {
    if (b.id === except) continue;
    const dx = x - b.x, dz = z - b.z;
    const lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
    if (Math.abs(lx) < b.hw + m && Math.abs(lz) < b.hd + m) return b.id;
  }
  return null;
}
function isWet(grid, x, z) {
  if (grid.heightAt(x, z) < WET) return true;
  const rv = river.nearest(x, z, 60);
  return !!(rv && rv.d - riverHalfWidth(rv.z) < 1.0);
}

/**
 * Is the straight leg a -> b walkable? Samples every 0.5 m: clear of building solids (margin m), dry, not too steep.
 * `except` = { id, near: [x, z], r } ignores that building within r of `near` (a door's own approach).
 */
export function legClear(ctx, ax, az, bx, bz, { m = 0.3, except = null, slope = true } = {}) {
  const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / SAMPLE));
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    let ex = null;
    if (except && Math.hypot(x - except.near[0], z - except.near[1]) < except.r) ex = except.id;
    if (inSolid(ctx.solids, x, z, m, ex)) return false;
    if (isWet(ctx.grid, x, z)) return false;
    if (slope && ctx.grid.slopeAt(x, z) > SLOPE_MAX) return false;
  }
  return true;
}

// ------------------------------------------------------------------ doors
/** World point just outside a building's front door (pushed clear of its walls) and the yaw facing away from it. */
export function doorPoint(buildingId, { buildings = BUILDINGS, doorSpots = DOOR_SPOTS, solids = null } = {}) {
  const b = buildings.find(q => q.id === buildingId);
  if (!b) return null;
  const spot = doorSpots[b.model];
  const fp = FOOTPRINT[b.model] || [2, 2, 2];
  const lx = spot?.x ?? 0, lz = spot ? spot.z + spot.out : fp[1] / 2 + 1;
  const r = rad(b.rot), c = Math.cos(r), s = Math.sin(r);
  let x = b.x + lx * c + lz * s, z = b.z - lx * s + lz * c;
  const sign = spot && spot.out < 0 ? -1 : 1;
  const face = r + (sign < 0 ? Math.PI : 0), dx = Math.sin(face), dz = Math.cos(face);
  const sol = solids || buildingSolids(buildings);
  for (let k = 0; k < 16 && inSolid(sol, x, z, 0.36, null); k++) { x += dx * 0.25; z += dz * 0.25; }
  return { x, z, face, building: buildingId };
}

// ------------------------------------------------------------------ graph
function segPoint(ax, az, bx, bz, px, pz) {
  const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1e-9;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2));
  return { t, x: ax + vx * t, z: az + vz * t, d: Math.hypot(ax + vx * t - px, az + vz * t - pz) };
}
function segX(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t > 0 && t < 1 && u > 0 && u < 1 ? t : null;
}

/**
 * Build the road graph once. spots: { key: {x, z} }; doorSpots: interiors DOOR_SPOTS; doors: building ids to attach
 * (default: every building with a door spot). Returns the graph object used by route()/nearestNode().
 */
export function buildRoads({ paths = PATHS, buildings = BUILDINGS, spots = {}, doorSpots = DOOR_SPOTS, doors = null, grid = null } = {}) {
  const g = {
    nodes: [], adj: [], edges: [], keys: new Map(), unreachable: {}, blocked: [], cache: new Map(),
    solids: buildingSolids(buildings), grid: grid || sharedGrid(), doors: {}, comp: [],
  };
  const addNode = (x, z) => { g.nodes.push({ x, z }); g.adj.push([]); return g.nodes.length - 1; };
  const nodeAt = (x, z) => {
    for (let i = 0; i < g.nodes.length; i++) if (Math.hypot(g.nodes[i].x - x, g.nodes[i].z - z) < MERGE) return i;
    return addNode(x, z);
  };
  const addEdge = (a, b) => {
    if (a === b || g.adj[a].some(e => e.to === b)) return;
    const w = Math.hypot(g.nodes[a].x - g.nodes[b].x, g.nodes[a].z - g.nodes[b].z);
    const e = { a, b, w, alive: true };
    g.edges.push(e); g.adj[a].push({ to: b, w, e }); g.adj[b].push({ to: a, w, e });
  };
  const killEdge = e => {
    e.alive = false;
    g.adj[e.a] = g.adj[e.a].filter(q => q.e !== e); g.adj[e.b] = g.adj[e.b].filter(q => q.e !== e);
  };

  // 1. split every path segment where another path touches or crosses it
  const segs = [];
  paths.forEach((p, pi) => { for (let i = 0; i + 1 < p.pts.length; i++) segs.push({ pi, a: p.pts[i], b: p.pts[i + 1], ts: [0, 1] }); });
  const ends = paths.flatMap((p, pi) => p.pts.map(q => ({ pi, q })));
  for (const s of segs) {
    for (const o of segs) if (o.pi !== s.pi) { const t = segX(s.a, s.b, o.a, o.b); if (t !== null) s.ts.push(t); }
    for (const { pi, q } of ends) if (pi !== s.pi) {
      const p = segPoint(s.a[0], s.a[1], s.b[0], s.b[1], q[0], q[1]);
      if (p.d < MERGE && p.t > 0 && p.t < 1) s.ts.push(p.t);
    }
  }
  for (const s of segs) {
    const ts = [...new Set(s.ts)].sort((a, b) => a - b);
    let prev = null;
    for (const t of ts) {
      const n = nodeAt(s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t);
      if (prev !== null) addEdge(prev, n);
      prev = n;
    }
  }
  // the drawn paths are trusted, with two repairs: a lane end that runs into the water is pulled back to the last dry
  // point, and a leg that clips a wall is bent round the wall's nearest clear corner
  for (const e of [...g.edges]) {
    if (!e.alive) continue;
    for (const [end, other] of [[e.a, e.b], [e.b, e.a]]) {
      if (g.adj[end].length !== 1) continue;
      const E = g.nodes[end], O = g.nodes[other], d = Math.hypot(E.x - O.x, E.z - O.z);
      if (!isWet(g.grid, E.x, E.z)) continue;
      let t = 1;
      while (t > 0 && isWet(g.grid, O.x + (E.x - O.x) * t, O.z + (E.z - O.z) * t)) t -= SAMPLE / d;
      t = Math.max(0, t - 1 / d);
      E.x = O.x + (E.x - O.x) * t; E.z = O.z + (E.z - O.z) * t;
      e.w = d * t; for (const q of [...g.adj[e.a], ...g.adj[e.b]]) if (q.e === e) q.w = e.w;
    }
  }
  for (const e of [...g.edges]) {
    if (!e.alive) continue;
    const A = g.nodes[e.a], B = g.nodes[e.b];
    if (legClear(g, A.x, A.z, B.x, B.z, { m: 0.2, slope: false })) continue;
    let best = null;
    for (const b of g.solids) {
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const lx = sx * (b.hw + 0.9), lz = sz * (b.hd + 0.9);
        const cx = b.x + lx * b.c + lz * b.s, cz = b.z - lx * b.s + lz * b.c;
        const len = Math.hypot(cx - A.x, cz - A.z) + Math.hypot(cx - B.x, cz - B.z);
        if (best && len >= best.len) continue;
        if (len > e.w * 1.6 + 4) continue;
        if (legClear(g, A.x, A.z, cx, cz, { m: 0.3, slope: false }) && legClear(g, cx, cz, B.x, B.z, { m: 0.3, slope: false })) best = { cx, cz, len };
      }
    }
    if (!best) { g.blocked.push([e.a, e.b]); continue; }
    const c = addNode(best.cx, best.cz);
    killEdge(e); addEdge(e.a, c); addEdge(c, e.b);
  }

  // 2. join separate networks (e.g. the cottage lane) by their nearest clear vertex pair; water never gets crossed
  for (let guard = 0; guard < 20; guard++) {
    const comp = components(g);
    const groups = new Map();
    comp.forEach((c, i) => { if (!groups.has(c)) groups.set(c, []); groups.get(c).push(i); });
    if (groups.size < 2) break;
    let best = null;
    const list = [...groups.values()];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const pairs = [];
      for (const a of list[i]) for (const b of list[j]) {
        const d = Math.hypot(g.nodes[a].x - g.nodes[b].x, g.nodes[a].z - g.nodes[b].z);
        if (d < LINK) pairs.push([d, a, b]);
      }
      pairs.sort((p, q) => p[0] - q[0]);
      for (const [d, a, b] of pairs.slice(0, 12)) {
        if (best && d >= best[0]) break;
        if (legClear(g, g.nodes[a].x, g.nodes[a].z, g.nodes[b].x, g.nodes[b].z)) { best = [d, a, b]; break; }
      }
    }
    if (!best) break;
    addEdge(best[1], best[2]);
  }

  // 3. spurs: spots and doors hang off the nearest clear point of a road
  const attach = (key, x, z, except) => {
    const cands = [];
    for (const e of g.edges) {
      if (!e.alive) continue;
      const A = g.nodes[e.a], B = g.nodes[e.b], p = segPoint(A.x, A.z, B.x, B.z, x, z);
      if (p.d < SPUR) cands.push({ d: p.d, x: p.x, z: p.z, e, t: p.t });
    }
    g.nodes.forEach((n, i) => { const d = Math.hypot(n.x - x, n.z - z); if (d < SPUR) cands.push({ d, x: n.x, z: n.z, node: i }); });
    cands.sort((a, b) => a.d - b.d);
    for (const c of cands.slice(0, 40)) {
      if (!legClear(g, x, z, c.x, c.z, { except })) continue;
      let at = c.node;
      if (at === undefined) {
        if (!c.e.alive) continue;
        if (c.t <= 1e-3) at = c.e.a; else if (c.t >= 1 - 1e-3) at = c.e.b;
        else { at = addNode(c.x, c.z); killEdge(c.e); addEdge(c.e.a, at); addEdge(at, c.e.b); }
      }
      const me = addNode(x, z);
      addEdge(me, at);
      g.keys.set(key, me);
      return me;
    }
    g.unreachable[key] = 'no clear spur to a road';
    return null;
  };
  for (const [k, s] of Object.entries(spots)) attach(k, s.x, s.z, null);
  const doorIds = doors || buildings.filter(b => doorSpots[b.model] && !NO_SOLID.has(b.model)).map(b => b.id);
  for (const id of doorIds) {
    const d = doorPoint(id, { buildings, doorSpots, solids: g.solids });
    if (!d) { g.unreachable[`door:${id}`] = 'unknown building'; continue; }
    g.doors[id] = d;
    attach(`door:${id}`, d.x, d.z, { id, near: [d.x, d.z], r: 1.5 });
  }
  g.comp = components(g);
  return g;
}

function components(g) {
  const comp = new Array(g.nodes.length).fill(-1);
  let c = 0;
  for (let i = 0; i < g.nodes.length; i++) {
    if (comp[i] >= 0) continue;
    const stack = [i]; comp[i] = c;
    while (stack.length) { const n = stack.pop(); for (const { to } of g.adj[n]) if (comp[to] < 0) { comp[to] = c; stack.push(to); } }
    c++;
  }
  return comp;
}

/** Nearest node to (x, z); with clear: true, the nearest one reachable by a clear straight leg (null if none). */
export function nearestNode(g, x, z, { clear = false, max = 40 } = {}) {
  const order = g.nodes.map((n, i) => [Math.hypot(n.x - x, n.z - z), i]).sort((a, b) => a[0] - b[0]);
  if (!clear) return order.length ? order[0][1] : null;
  for (const [d, i] of order.slice(0, 12)) {
    if (d > max) break;
    if (d < 0.05 || legClear(g, x, z, g.nodes[i].x, g.nodes[i].z, { slope: false })) return i;
  }
  return null;
}

/** World point of a spot key / 'door:id' / {x, z} in the graph (null when unknown). */
export function pointOf(g, p) {
  if (p && typeof p === 'object') return { x: p.x, z: p.z };
  const n = g.keys.get(p);
  if (n !== undefined) return { x: g.nodes[n].x, z: g.nodes[n].z };
  if (typeof p === 'string' && p.startsWith('door:') && g.doors[p.slice(5)]) return { x: g.doors[p.slice(5)].x, z: g.doors[p.slice(5)].z };
  return null;
}

function endNode(g, p) {
  if (p && typeof p === 'object') {
    const n = nearestNode(g, p.x, p.z, { clear: true });
    return n === null ? nearestNode(g, p.x, p.z) : n;
  }
  const n = g.keys.get(p);
  return n === undefined ? null : n;
}

/**
 * Waypoints [[x, z], ...] from `from` to `to` (each a spot key, 'door:<id>' or {x, z}) along the roads, or null when
 * unreachable (unknown key, or the other side of the river). Spot/door-to-spot/door routes are cached.
 */
export function route(g, from, to) {
  const cacheable = typeof from === 'string' && typeof to === 'string';
  const key = cacheable ? `${from}|${to}` : null;
  if (key && g.cache.has(key)) return g.cache.get(key)?.map(p => p.slice()) ?? null;
  const a = endNode(g, from), b = endNode(g, to);
  let out = null;
  if (a !== null && b !== null && g.comp[a] === g.comp[b]) {
    const ids = astar(g, a, b);
    if (ids) {
      out = ids.map(i => [g.nodes[i].x, g.nodes[i].z]);
      if (typeof from === 'object') out.unshift([from.x, from.z]);
      if (typeof to === 'object') out.push([to.x, to.z]);
      out = out.filter((p, i) => i === 0 || Math.hypot(p[0] - out[i - 1][0], p[1] - out[i - 1][1]) > 0.05);
    }
  }
  if (key) g.cache.set(key, out);
  return out ? out.map(p => p.slice()) : null;
}

/** Component id of a node key / point (same id = same village network). */
export function networkOf(g, p) { const n = endNode(g, p); return n === null ? null : g.comp[n]; }

/** Total length of a waypoint list. */
export function pathLength(path) { let l = 0; for (let i = 1; i < path.length; i++) l += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); return l; }

function astar(g, a, b) {
  const N = g.nodes.length, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), shut = new Uint8Array(N);
  const B = g.nodes[b], h = i => Math.hypot(g.nodes[i].x - B.x, g.nodes[i].z - B.z);
  dist[a] = 0;
  const open = [[h(a), a]];
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
    const [, n] = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    if (shut[n]) continue;
    if (n === b) break;
    shut[n] = 1;
    for (const { to, w } of g.adj[n]) {
      const d = dist[n] + w;
      if (d < dist[to]) { dist[to] = d; prev[to] = n; open.push([d + h(to), to]); }
    }
  }
  if (dist[b] === Infinity) return null;
  const ids = [];
  for (let n = b; n !== -1; n = prev[n]) ids.push(n);
  return ids.reverse();
}
