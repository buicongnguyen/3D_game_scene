import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FARM, FARM_KINDS, nextAction } from '../src/content/farm.js';
import { ANIMALS } from '../src/content/models.js';
import { HeightGrid } from '../src/world/heightfield.js';
import { BUILDINGS, PADDIES, WORLD } from '../src/world/layout.js';
import { FOOTPRINT } from '../src/world/structures.js';

const grid = new HeightGrid(2);
const rad = d => d * Math.PI / 180;
const inBuilding = (x, z, m = 0.3) => BUILDINGS.some(b => {
  const fp = FOOTPRINT[b.model];
  if (!fp || b.model === 'platform') return false;
  const r = rad(b.rot), dx = x - b.x, dz = z - b.z;
  return Math.abs(dx * Math.cos(r) - dz * Math.sin(r)) < fp[0] / 2 + m && Math.abs(dx * Math.sin(r) + dz * Math.cos(r)) < fp[1] / 2 + m;
});
const inPaddy = (x, z, m = 1.2) => PADDIES.some(p => Math.abs(x - p.x) < p.w / 2 + m && Math.abs(z - p.z) < p.d / 2 + m);
const bad = (x, z) => inPaddy(x, z) || x < WORLD.minX + 3 || x > WORLD.maxX - 3 || z < WORLD.minZ + 3 || z > WORLD.maxZ - 3 || grid.heightAt(x, z) < 0.8 || grid.slopeAt(x, z) > 24 || inBuilding(x, z);

test('the farm has cows, pigs, goats and dogs in both villages, and their models are listed for loading', () => {
  const by = k => FARM.filter(f => f[1] === k);
  for (const k of ['cow', 'pig', 'goat', 'dog']) {
    assert.ok(by(k).length >= 2, `${k}: ${by(k).length}`);
    assert.ok(ANIMALS.includes(FARM_KINDS[k].model), `${k} model is loaded`);
  }
  assert.ok(FARM.length >= 12);
  assert.equal(new Set(FARM.map(f => f[0])).size, FARM.length, 'ids are unique');
  assert.ok(FARM.some(f => f[2] < -40) && FARM.some(f => f[2] > 90), 'Kawabe and Takamori both have animals');
});

test('every animal starts on dry gentle ground clear of buildings, and so does the ring it roams', () => {
  for (const [id, kind, x, z, , radius] of FARM) {
    assert.ok(!bad(x, z), `${id} starts at (${x}, ${z}) on bad ground`);
    if (!radius) continue;
    // the roam points are picked at random within the radius; the ring must be mostly open ground so the animal is not boxed in
    let open = 0, n = 16;
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; if (!bad(x + Math.cos(a) * radius, z + Math.sin(a) * radius)) open++; }
    assert.ok(open >= n * 0.6, `${id} (${kind}): only ${open}/${n} of its roaming ring is open ground`);
  }
});

test('grazing animals choose sensibly: they doze at night, call only when someone is near and they have rested', () => {
  const picks = (ctx, k = 400) => Array.from({ length: k }, () => nextAction('cow', ctx).action);
  const count = (list, a) => list.filter(x => x === a).length;
  const day = picks({ night: 0, near: false, rested: true });
  assert.equal(count(day, 'sleep'), 0, 'no sleeping in daylight');
  assert.equal(count(day, 'call'), 0, 'no calling at nobody');
  assert.ok(count(day, 'graze') > 100 && count(day, 'walk') > 40 && count(day, 'idle') > 40);
  const night = picks({ night: 1, near: false, rested: true });
  assert.ok(count(night, 'sleep') > 250, 'mostly asleep at night');
  const near = picks({ night: 0, near: true, rested: true });
  assert.ok(count(near, 'call') > 30 && count(near, 'call') < 160, `calls when someone is near (${count(near, 'call')})`);
  assert.equal(count(picks({ night: 0, near: true, rested: false }), 'call'), 0, 'a call needs a rest in between');
  for (const k of Object.values(FARM_KINDS)) assert.ok(k.walk > 0.3 && k.speed >= k.walk * 0.5 && k.speed <= k.walk * 1.5, 'walk speeds match the authored clips');
});
