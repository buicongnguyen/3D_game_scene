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
