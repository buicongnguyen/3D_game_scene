// The two fishing places (src/game/fishing/places.js) checked against the world: where she stands, what else happens
// there, the water, the catch on the ground, the camera, the stock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FishingSim, CAST, pickSpecies, makeFish, planCast, pileSlot, pileLength } from '../src/game/fishing/sim.js';
import { SPOTS, SPOT_IDS, spotByInteract, areaFor, allowed } from '../src/game/fishing/places.js';
import { FISH } from '../src/game/story.js';
import { rng } from '../src/engine/spline.js';
import { sharedGrid, inFootprint } from '../src/world/roads.js';
import { BUILDINGS, WATER_Y } from '../src/world/layout.js';
import { SKY_SPOT } from '../src/content/skyspots.js';
import { TRICKS } from '../src/content/tricks.js';

const DT = 1 / 60;
const grid = sharedGrid();
const LEN = { trout: 0.92, char: 0.8, koi: 1.12, starfin: 1.0 };        // the lengths in the water (pond.js)
const LONGEST = P => pileLength(LEN.koi, 0.8 + 0.75, P), WIDEST = P => LONGEST(P) * 0.3;
const MILL = BUILDINGS.find(b => b.id === 'mill');

/** What else the player does around the mill (positions as the director registers them): { x, z, r }. */
const MILL_THINGS = [
  { id: 'millAxle', x: MILL.x + 4.2, z: MILL.z + 2.2, r: 3.2 },
  { id: 'drawbridgeUp', x: -9.8, z: -45, r: 2.4 },
  { id: 'door:mill', x: MILL.x, z: MILL.z + 4.1, r: 1.8 },
  { id: 'spark:millLamp', x: 1.2, z: -45.6, r: 7.5, vertical: true },       // a spark target: reached from the island
  { id: 'sky:mill-lamp', x: SKY_SPOT['mill-lamp'].x, z: SKY_SPOT['mill-lamp'].z, r: SKY_SPOT['mill-lamp'].r },
  { id: 'door:otaHouse', x: -37, z: -46.7, r: 1.8 },
  { id: 'talk:ota', x: -24, z: -40.5, r: 2.6 },
  { id: 'mill race', x: -12.2, z: -45, r: 2.6 },                            // the fast, turbulent water under the wheel
  { id: 'stone landing', x: -9.6, z: -45, r: 2.2 },
];

test('every place: its prompt is within reach of where she stands, ids are unique, the dock keeps its public id', () => {
  assert.deepEqual([...SPOT_IDS].sort(), ['dock', 'mill']);
  assert.equal(SPOTS.dock.interact.id, 'fishingSpot');
  assert.equal(new Set(Object.values(SPOTS).map(s => s.interact.id)).size, SPOT_IDS.length);
  for (const s of Object.values(SPOTS)) {
    assert.equal(spotByInteract(s.interact.id), s);
    const d = Math.hypot(s.stand.x - s.interact.x, s.stand.z - s.interact.z);
    assert.ok(d < s.interact.r - 0.5, `${s.id}: the prompt reaches her stand (${d.toFixed(2)} m of ${s.interact.r})`);
    assert.ok(s.leave > s.interact.r, `${s.id}: she is not "too far" while the prompt still shows`);
  }
  const a = SPOTS.dock.interact, b = SPOTS.mill.interact;
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 40, 'one prompt can never shadow the other');
});

test('the mill place: dry, level ground clear of the wheel, door, drawbridge, lamp step, sky spot, race and trick signs', () => {
  const s = SPOTS.mill, st = s.stand;
  assert.ok(grid.heightAt(st.x, st.z) > 0.2, 'dry');
  assert.ok(grid.slopeAt(st.x, st.z) < 22, 'not steep');
  assert.ok(!inFootprint(st.x, st.z, 1.5), 'clear of every building');
  for (const t of MILL_THINGS) {
    const d = Math.hypot(st.x - t.x, st.z - t.z);
    assert.ok(d > t.r + 1.5 || (t.vertical && d > 6), `${t.id} is ${d.toFixed(1)} m from her stand (its radius ${t.r})`);
    const di = Math.hypot(s.interact.x - t.x, s.interact.z - t.z);
    assert.ok(di > t.r + 1 || (t.vertical && di > 6), `${t.id} overlaps the Fish prompt (${di.toFixed(1)} m of ${t.r})`);
  }
  for (const t of TRICKS) assert.ok(Math.hypot(st.x - t.place.x, st.z - t.place.z) > 15, `trick sign ${t.id} is near`);
  assert.ok(Math.hypot(st.x - MILL.x, st.z - MILL.z) > 9, 'well away from the mill house');
  assert.ok(!BUILDINGS.some(b => Math.hypot(b.x - st.x, b.z - st.z) < 8), 'no building within 8 m');
});

test('both places: the clear patch lies in the river, in cast range of where she stands, and the school has room to swim', () => {
  for (const s of Object.values(SPOTS)) for (const k of ['wide', 'tall']) {
    const a = s.area[k];
    const d = Math.hypot(a.cx - s.stand.x, a.cz - s.stand.z);
    assert.ok(d > CAST.min + a.rx * 0.2 && d < CAST.max + a.rx * 0.7, `${s.id}/${k}: ${d.toFixed(1)} m to the middle of the water`);
    assert.ok(a.clear >= Math.max(a.rx, a.rz) * 1.6, `${s.id}/${k}: the patch covers the whole school`);
    let wet = 0, n = 0;
    for (let i = 0; i < 48; i++) for (const q of [0.55, 1]) {
      const x = a.cx + Math.cos(i / 48 * 2 * Math.PI) * a.rx * q, z = a.cz + Math.sin(i / 48 * 2 * Math.PI) * a.rz * q;
      n++; if (grid.heightAt(x, z) < -0.3) wet++;
    }
    assert.ok(wet / n > 0.97, `${s.id}/${k}: ${(100 * wet / n).toFixed(0)} % of the school's water is deep enough`);
    const c = planCast({ x: a.cx, z: a.cz }, { origin: s.stand, home: { x: a.cx, z: a.cz }, ok: (x, z) => allowed(s, x, z) && grid.heightAt(x, z) < WATER_Y - 0.7 });
    assert.ok(Math.hypot(c.x - a.cx, c.z - a.cz) < 0.5, `${s.id}/${k}: casting at the middle lands there`);
  }
  assert.ok(areaFor(SPOTS.mill, 1, false) === SPOTS.mill.area.tall && areaFor(SPOTS.mill, 0, true) === SPOTS.mill.area.ice);
});

test('winter: the hole in the ice is open river, in range, and every cast into it lands in the hole', () => {
  for (const s of Object.values(SPOTS)) {
    const a = s.area.ice, d = Math.hypot(a.cx - s.stand.x, a.cz - s.stand.z);
    assert.ok(d > CAST.min + 1 && d < 9 - 1.5, `${s.id}: hole ${d.toFixed(1)} m away`);
    assert.ok(grid.heightAt(a.cx, a.cz) < -0.7, `${s.id}: the hole is over deep water`);
    assert.ok(a.hole - 0.55 > 1, 'a hole big enough to cast into');
    const r = rng(7);
    for (let i = 0; i < 100; i++) {
      const p = planCast({ x: a.cx + (r() - 0.5) * 20, z: a.cz + (r() - 0.5) * 20 }, { origin: s.stand, home: { x: a.cx, z: a.cz }, ok: (x, z) => allowed(s, x, z, true), max: 9 });
      assert.ok(Math.hypot(p.x - a.cx, p.z - a.cz) <= a.hole - 0.55 + 1e-6);
    }
  }
});

test('the catch on the ground at every place: eight slots on valid ground, clear of Mika and the creel, never overlapping', () => {
  for (const s of Object.values(SPOTS)) {
    const P = s.pile, long = LONGEST(P), wide = WIDEST(P);
    const slots = Array.from({ length: P.cap }, (_, i) => pileSlot(i, P));
    const onGround = (x, z) => P.dock ? x > P.dock.x0 + 0.05 && x < P.dock.x1 && z > P.dock.z0 + 0.1 && z < P.dock.z1 - 0.1 : grid.heightAt(x, z) > 0.2 && grid.slopeAt(x, z) < 22;
    slots.forEach((q, i) => {
      for (const k of [-0.5, 0, 0.5]) {
        const x = q.x + Math.sin(q.yaw) * long * k, z = q.z + Math.cos(q.yaw) * long * k;
        assert.ok(onGround(x, z), `${s.id}: slot ${i} at ${x.toFixed(2)}, ${z.toFixed(2)} is not on dry ground`);
        for (const o of P.keepOut) assert.ok(Math.hypot(x - o.x, z - o.z) > o.r, `${s.id}: slot ${i} lies on someone's feet`);
        assert.ok(Math.hypot(x - P.creel.x, z - P.creel.z) > P.creel.r + 0.05, `${s.id}: slot ${i} under the creel`);
      }
      if (!P.dock) for (const k of [-0.5, 0.5]) assert.ok(grid.heightAt(q.x + Math.sin(q.yaw) * long * k, q.z + Math.cos(q.yaw) * long * k) > 0.25, `${s.id}: slot ${i} is wet`);
      for (let j = 0; j < i; j++) {
        const p = slots[j], dx = q.x - p.x, dz = q.z - p.z, c = Math.cos(q.yaw), sn = Math.sin(q.yaw);
        const across = Math.abs(dx * c - dz * sn), along = Math.abs(dx * sn + dz * c);
        assert.ok(across >= wide * 0.95 || along >= long, `${s.id}: slots ${j} and ${i} overlap`);
      }
    });
    assert.ok(onGround(P.creel.x, P.creel.z) && Math.hypot(P.creel.x - s.stand.x, P.creel.z - s.stand.z) > P.creel.r + 0.6, `${s.id}: the creel stands on dry ground beside her`);
    const a = s.area.wide, hx = Math.sin(P.yaw), hz = Math.cos(P.yaw);
    assert.ok(hx * (a.cx - s.stand.x) + hz * (a.cz - s.stand.z) > 0, `${s.id}: heads point toward the water`);
    const sh = s.shot.land;
    for (const q of [slots[0], slots[P.cap - 1]]) assert.ok(Math.hypot(q.x - sh.pos[0], q.z - sh.pos[2]) < 14, `${s.id}: the pile is far from the camera`);
  }
  const P = SPOTS.mill.pile, hs = Array.from({ length: P.cap }, (_, i) => { const q = pileSlot(i, P); return [grid.heightAt(q.x - 0.45, q.z), grid.heightAt(q.x + 0.45, q.z)]; });
  assert.ok(hs.every(([a, b]) => Math.abs(a - b) < 0.2), 'the mill bank under the fish is nearly level');
});

test('the camera at each place looks down from above ground, clear of buildings, at the stand and the water', () => {
  for (const s of Object.values(SPOTS)) for (const [k, v] of Object.entries(s.shot)) {
    const [px, py, pz] = v.pos, [lx, ly, lz] = v.look;
    assert.ok(!inFootprint(px, pz, 0.5), `${s.id}/${k}: the camera is inside a building`);
    assert.ok(py - grid.heightAt(px, pz) > 5, `${s.id}/${k}: the camera is low (${(py - grid.heightAt(px, pz)).toFixed(1)} m)`);
    const down = Math.atan2(py - ly, Math.hypot(lx - px, lz - pz)) * 180 / Math.PI;
    assert.ok(down > 20 && down < 55, `${s.id}/${k}: looks ${down.toFixed(0)} degrees down`);
    const dir = [lx - px, ly - py, lz - pz], to = [s.stand.x - px, 1 - py, s.stand.z - pz];
    const dot = (dir[0] * to[0] + dir[1] * to[1] + dir[2] * to[2]) / (Math.hypot(...dir) * Math.hypot(...to));
    assert.ok(Math.acos(dot) * 180 / Math.PI < v.fov * 0.62, `${s.id}/${k}: Mika is outside the frame`);
    for (let i = 1; i < 20; i++) { const f = i / 20; assert.ok(!inFootprint(px + (lx - px) * f, pz + (lz - pz) * f, 0), `${s.id}/${k}: a building is in the view`); }
  }
});

test("stock: koi live at the mill pool, trout at both, the starfin only at dusk; the story's fish are trout at either place", () => {
  const share = (spot, n = 6000) => {
    const rand = rng(11), c = {};
    for (let i = 0; i < n; i++) { const k = pickSpecies(FISH, rand, { mult: spot.stock.mult }); c[k] = (c[k] || 0) + 1; }
    return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v / n]));
  };
  const dock = share(SPOTS.dock), mill = share(SPOTS.mill);
  assert.ok(Math.abs(dock.trout - 0.6 / 0.97) < 0.03, 'the dock is the old table: the same odds as before');
  assert.ok(mill.koi > dock.koi * 2.5 && mill.koi > 0.3, `koi ${mill.koi.toFixed(2)} at the mill vs ${dock.koi.toFixed(2)} at the dock`);
  assert.ok(mill.trout > 0.35 && mill.char > 0.15, 'trout and char still bite at the mill');
  assert.ok(!dock.starfin && !mill.starfin, 'no starfin by day');
  for (const s of Object.values(SPOTS)) {
    assert.ok(s.stock.pattern.includes('trout') && s.stock.deep.length > 0, `${s.id}: the school has trout`);
    const rand = rng(3);
    for (let i = 0; i < 40; i++) assert.equal(makeFish(FISH, rand, { forced: 'trout', mult: s.stock.mult, dusk: true }).species, 'trout');
    const dusk = Array.from({ length: 400 }, () => pickSpecies(FISH, rand, { dusk: true, mult: s.stock.mult })).filter(k => k === 'starfin').length;
    assert.ok(dusk > 120 && dusk < 240, `${s.id}: the starfin takes about 45 % of the bites at dusk (${dusk}/400)`);
    for (const n of [10, 6, 4]) assert.ok(Array.from({ length: n }, (_, i) => s.stock.pattern[i % s.stock.pattern.length]).includes('trout'), `${s.id}/${n}`);
  }
  const count = (s, k) => Array.from({ length: 10 }, (_, i) => s.stock.pattern[i % s.stock.pattern.length]).filter(x => x === k).length;
  assert.ok(count(SPOTS.mill, 'koi') > count(SPOTS.dock, 'koi'));
  assert.deepEqual(SPOTS.dock.stock.pattern, ['trout', 'char', 'trout', 'koi', 'trout']);
});

test('the story step c1.fish counts a trout caught at the mill like one caught at the dock (Easy never snaps there either)', () => {
  for (const s of Object.values(SPOTS)) for (let seed = 1; seed <= 20; seed++) {
    const rand = rng(seed);
    const sim = new FishingSim({ rand, gentle: true, easy: true, choose: () => makeFish(FISH, rand, { forced: 'trout', mult: s.stock.mult, easy: true }) });
    let t = 0;
    while (!sim.over && t < 120) { sim.update(DT, sim.phase === 'bite' || sim.phase === 'hooked'); t += DT; }
    assert.equal(sim.result, 'caught', `${s.id}/${seed}: ${sim.reason}`);
    assert.equal(sim.fish.species, 'trout');
  }
});
