// Play zones (src/world/zone.js, docs/play-zones/phase-2-zone-pilot.md): the ground a zone is built on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HeightGrid, rawHeight } from '../src/world/heightfield.js';
import { TERRAIN } from '../src/world/layout.js';
import { zoneHeightFn, outside, inZone, touchesZone, zoneFromParam, COARSE_STEP, BLEND } from '../src/world/zone.js';

const zone = { x: -26, z: 20, r: 60 };

test('inside a zone the ground is exactly the valley\'s; far outside it is the coarse landscape', () => {
  const coarse = new HeightGrid(COARSE_STEP, TERRAIN), f = zoneHeightFn(zone, coarse);
  for (const [x, z] of [[-26, 20], [-50, 40], [10, 10], [-70, -10], [20, 25]]) {
    if (outside(zone, x, z) > 0) continue;
    assert.equal(f(x, z, 3), rawHeight(x, z, 3), `exact at ${x},${z}`);
  }
  for (const [x, z] of [[120, -100], [-150, 150], [90, 90]]) {
    assert.ok(outside(zone, x, z) > BLEND);
    assert.equal(f(x, z, 3), coarse.meshHeightAt(x, z), `coarse at ${x},${z}`);
  }
});

test('the blend band eases from the exact ground into the far landscape without steps', () => {
  const f = zoneHeightFn(zone);
  let prev = f(zone.x + zone.r - 1, zone.z, 3);
  for (let d = 0; d <= BLEND + 2; d += 0.5) {
    const h = f(zone.x + zone.r + d, zone.z, 3);
    assert.ok(Math.abs(h - prev) < 1.5, `no step at +${d} m (${prev.toFixed(2)} -> ${h.toFixed(2)})`);
    prev = h;
  }
});

test('zone shapes and the ?zone= parameter', () => {
  assert.ok(inZone(zone, -26, 79) && !inZone(zone, -26, 81) && inZone(zone, -26, 81, 2));
  assert.ok(touchesZone(zone, -26, 85, 6) && !touchesZone(zone, -26, 85, 4));
  assert.deepEqual(zoneFromParam('-26,20,60'), zone);
  assert.equal(zoneFromParam('1,2'), null);
  assert.equal(zoneFromParam('1,2,-3'), null);
  assert.equal(zoneFromParam(null), null);
});

test('a lazy height grid gives exactly the baked grid\'s heights, computing only what is read', () => {
  const box = { minX: -60, maxX: 20, minZ: -10, maxZ: 70 };
  const baked = new HeightGrid(2, box), lazy = HeightGrid.lazy(2, box);
  for (const [x, z] of [[-26, 20], [-6, 22], [-40.3, 51.7], [10, 0], [-59, 69]]) {
    assert.equal(lazy.heightAt(x, z), baked.heightAt(x, z), `${x},${z}`);
    assert.equal(lazy.slopeAt(x, z), baked.slopeAt(x, z), `slope ${x},${z}`);
  }
  assert.ok(lazy.raw.filter(v => v === v).length < 100, 'only the points near the queries were computed');
  assert.deepEqual([...lazy.h], [...baked.h], 'reading h bakes the rest');
});

test('the soft wall: nothing inside, eased back past the edge, outward speed taken away, never out', async () => {
  const { wallStep, WALL_IN, zoneFog } = await import('../src/world/zone.js');
  const z = { x: 0, z: 0, r: 50 };
  const p = { x: 10, z: 0 }, v = { x: 3, z: 0 };
  assert.equal(wallStep(z, p, v, 1 / 60), false);
  assert.deepEqual([p, v], [{ x: 10, z: 0 }, { x: 3, z: 0 }]);
  const q = { x: 50 - WALL_IN + 2, z: 0 }, w = { x: 4, z: 1 };
  assert.equal(wallStep(z, q, w, 1 / 60), true);
  assert.ok(q.x < 50 - WALL_IN + 2, 'eased back');
  assert.equal(w.x, 0, 'outward speed gone');
  assert.equal(w.z, 1, 'sideways speed kept');
  const far = { x: 80, z: 0 }, s = { x: 0, z: 0 };
  wallStep(z, far, s, 1 / 60);
  assert.ok(Math.hypot(far.x, far.z) <= 49 + 1e-9, 'never past r - 1');
  // walking straight out for ten seconds never gets her past r - 1
  const m = { x: 0, z: 30 }, mv = { x: 0, z: 0 };
  for (let i = 0; i < 600; i++) { mv.x = 0; mv.z = 4; m.z += mv.z / 60; wallStep(z, m, mv, 1 / 60); }
  assert.ok(m.z <= 49 && m.z > 50 - WALL_IN - 1, `held near the edge (${m.z.toFixed(2)})`);
  assert.ok(zoneFog(z) > 0.01 && zoneFog(z) < 0.02);
});

test('every converted game has its zone and a baked far view on disk', async () => {
  const fs = await import('node:fs');
  const { ZONES, zoneFor, playableIn } = await import('../src/content/zones.js');
  const { BACKDROPS } = await import('../src/content/zone-backdrops.js');
  for (const id of Object.keys(ZONES)) {
    const z = zoneFor(id);
    assert.ok(z && z.r > 20, `${id} has a zone`);
    assert.ok(playableIn(z, id), `${id} plays in its own zone`);
    const b = BACKDROPS[id];
    assert.ok(b, `${id}: run scripts/bake-zone-backdrops.mjs`);
    for (const sub of ['', 'hd/']) for (const f of ['px', 'nx', 'py', 'ny', 'pz', 'nz']) {
      const p = new URL(`../public/${b.dir}${sub}${f}.webp`, import.meta.url);
      assert.ok(fs.existsSync(p) && fs.statSync(p).size > 500, `${id}: ${b.dir}${sub}${f}.webp`);
    }
    assert.ok(b.near < z.r - 10, `${id}: the bake's near plane leaves the fade band in the picture`);
  }
});

test('a zone loads the buildings near it, not the ones across the valley, and no people or big animals up front', async () => {
  const { zoneModels, LAZY_MODELS } = await import('../src/world/zone.js');
  const { bootModels } = await import('../src/content/models.js');
  const { zoneFor } = await import('../src/content/zones.js');
  const boot = bootModels(), eggs = zoneModels(zoneFor('trick:eggs'), boot, 0), tug = zoneFor('yard:tug');
  assert.ok(eggs.includes('station') && !eggs.includes('belltower') && !eggs.includes('bakery'), 'eggs: the station, not Takamori');
  assert.ok(eggs.includes('chicken'), 'eggs clones its hens at once');
  assert.ok(eggs.includes('mika') && !eggs.includes('villager-man') && !eggs.includes('cow'));
  assert.ok(zoneModels(tug, boot, 0).includes('belltower'), 'tug: the bell tower on the green');
  assert.ok(eggs.length <= boot.length - 30, `fewer models (${eggs.length} of ${boot.length})`);
  assert.ok(LAZY_MODELS.every(n => boot.includes(n)), 'every lazy model is one the valley would load');
});
