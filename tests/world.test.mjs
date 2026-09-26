import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HeightGrid, rawHeight } from '../src/world/heightfield.js';
import { BUILDINGS, LAMPS, PLACES, STONES, WORLD, FALLEN_STARS, river, riverHalfWidth, rail, RAIL_Y, VIADUCT, PATHS } from '../src/world/layout.js';
import { Colliders } from '../src/world/colliders.js';
import { scatter, forestDensity } from '../src/world/scatter.js';
import { lightingAt, sunDirection, SEASONS, PALETTES } from '../src/world/seasons.js';
import { MOVE } from '../src/actors/player.js';

const grid = new HeightGrid(2);

test('the baked grid returns the same surface the terrain mesh draws (triangle interpolation)', () => {
  for (const [x, z] of [[-45, 20], [115, 8], [0, -45], [62, -156]]) {
    const i = Math.round((x - grid.x0) / grid.step), j = Math.round((z - grid.z0) / grid.step);
    const gx = grid.x0 + i * grid.step, gz = grid.z0 + j * grid.step;
    assert.ok(Math.abs(grid.heightAt(gx, gz) - rawHeight(gx, gz)) < 1e-3, 'grid vertices are exact');
  }
});

test('buildings stand on dry, fairly level ground inside the playable valley', () => {
  for (const b of BUILDINGS) {
    const y = b.y ?? grid.heightAt(b.x, b.z);
    assert.ok(b.x > WORLD.minX && b.x < WORLD.maxX && b.z > WORLD.minZ && b.z < WORLD.maxZ, `${b.id} inside the world`);
    if (b.y === undefined) {
      assert.ok(y > 0.6, `${b.id} is above the water (${y.toFixed(2)})`);
      assert.ok(grid.slopeAt(b.x, b.z) < 20, `${b.id} is not on a cliff (${grid.slopeAt(b.x, b.z).toFixed(0)}°)`);
    }
  }
});

test('the river runs through the valley and is deep in the channel, shallow at the stepping stones', () => {
  for (let z = -190; z <= 170; z += 20) {
    if (Math.abs(z + 112) < 6 || Math.abs(z + 45) < 8) continue; // the ford and the mill island are shallow on purpose
    const n = river.nearest(0, z, 400);
    const p = river.at(n.s);
    assert.ok(grid.heightAt(p.x, p.z) < -1.2, `channel is deep at z=${z}`);
    assert.ok(riverHalfWidth(z) >= 7 && riverHalfWidth(z) <= 12);
  }
  for (const [x, z] of STONES) assert.ok(grid.heightAt(x, z) > -1.3 && grid.heightAt(x, z) < 0.1, `ford is shallow under the stone at ${x} (${grid.heightAt(x, z).toFixed(2)})`);
  for (let i = 1; i < STONES.length; i++) assert.ok(Math.hypot(STONES[i][0] - STONES[i - 1][0], STONES[i][1] - STONES[i - 1][1]) < 2.6, 'stones are a jump apart');
  assert.ok(grid.heightAt(PLACES.millIsland.x, PLACES.millIsland.z) > 1, 'mill island is dry');
});

test('the railway bed is flat at rail height between the portals, and the viaduct gorge stays open', () => {
  for (const [x, z] of [[-130, 116], [-98, 119.5], [120, 95], [165, 6]]) {
    const n = rail.nearest(x, z, 20);
    assert.ok(Math.abs(grid.heightAt(n.x, n.z) - (RAIL_Y - 0.42)) < 0.6, `rail bed at ${x},${z}`);
  }
  assert.ok(grid.heightAt(0, VIADUCT.z) < 0, 'the river flows under the viaduct');
});

test('story places are reachable: gentle slopes at quest spots and every fallen star on land', () => {
  for (const k of ['station', 'kawabe', 'takamori', 'pasture', 'shrine', 'orchard', 'landslide', 'engineShed']) {
    const p = PLACES[k];
    assert.ok(grid.slopeAt(p.x, p.z) < MOVE.maxSlope, `${k} is walkable`);
  }
  for (const s of FALLEN_STARS) {
    assert.ok(grid.heightAt(s.x, s.z) > 0.3, `${s.id} is on dry land`);
    assert.ok(grid.slopeAt(s.x, s.z) < MOVE.maxSlope + 5, `${s.id} is reachable (${grid.slopeAt(s.x, s.z).toFixed(0)}°)`);
  }
  for (const L of LAMPS) if (L.x !== undefined) assert.ok(L.x > WORLD.minX && L.x < WORLD.maxX);
});

test('paths never run through buildings', () => {
  for (const b of BUILDINGS) {
    if (['platform', 'torii', 'toriiTop', 'haltPlatform'].includes(b.id)) continue;
    for (const p of PATHS) for (let k = 0; k < p.pts.length - 1; k++) {
      const [ax, az] = p.pts[k], [bx, bz] = p.pts[k + 1];
      for (let t = 0; t <= 1; t += 0.05) {
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        assert.ok(Math.hypot(x - b.x, z - b.z) > 2.6, `path through ${b.id} at ${x.toFixed(0)},${z.toFixed(0)}`);
      }
    }
  }
});

test('colliders: walls block, walkable tops can be stepped onto, the crate stack is a jumpable staircase', () => {
  const c = new Colliders();
  const wall = c.box(0, 0, 2, 1, 30, 0, 5);
  const r = c.resolve(0.5, 0.2, 0.3, 0, 1.5);
  assert.ok(!Colliders.contains(wall, r.x, r.z, 0.29), 'pushed out of the wall');
  const deck = c.box(10, 0, 3, 1, 0, -2, 0.4, { walkable: true });
  assert.equal(c.groundAt(10, 0, 0, 0.5).y, 0.4, 'a low deck is ground');
  assert.equal(c.resolve(10, 0, 0.3, 0, 1.5).x, 10, 'low decks do not push you');
  // crates 1 m, 2 m, 3 m high: each step is reachable with the jump height
  const jump = MOVE.jumpV * MOVE.jumpV / (2 * MOVE.gravity);
  assert.ok(jump > 1.15, `jump height ${jump.toFixed(2)} m clears a 1 m crate`);
  const cyl = c.cylinder(20, 0, 1, 0, 2);
  const out = c.resolve(20.3, 0, 0.3, 0, 1.5);
  assert.ok(Math.hypot(out.x - 20, out.z) >= 1.29, 'pushed out of the cylinder');
  c.remove(cyl);
  assert.equal(c.resolve(20.3, 0, 0.3, 0, 1.5).x, 20.3, 'removed colliders stop blocking');
  c.enable(cyl);
  assert.ok(c.raycast(15, 1, 0, 25, 1, 0) === 1, 'raycast ignores solids that do not block the view');
});

test('scatter is deterministic and keeps paths, buildings and the river clear', () => {
  const heightAt = (x, z) => grid.heightAt(x, z);
  const free = (x, z) => grid.slopeAt(x, z) < 36;
  const a = scatter(heightAt, free, 0.6), b = scatter(heightAt, free, 0.6);
  assert.equal(a.trees.length, b.trees.length);
  assert.deepEqual(a.trees.slice(0, 5), b.trees.slice(0, 5));
  assert.ok(a.trees.length > 1500, `valley has a forest (${a.trees.length})`);
  for (const t of a.trees) {
    if (t.far || t.orchard || t.story) continue;
    for (const bld of BUILDINGS) assert.ok(Math.hypot(t.x - bld.x, t.z - bld.z) > 7, `tree inside ${bld.id}`);
    const n = river.nearest(t.x, t.z, 40);
    if (n) assert.ok(n.d > riverHalfWidth(n.z) + 2.5, 'tree in the river');
  }
  assert.ok(forestDensity(0, -150) > forestDensity(-45, 20), 'the north is wooded, Kawabe is open');
});

test('seasons and daylight: vivid days, deep blue nights, the sun rises east and sets west', () => {
  for (const s of SEASONS) {
    const noon = lightingAt(s, 12), night = lightingAt(s, 22), dusk = lightingAt(s, 18.4);
    assert.ok(noon.sunIntensity > 2.5 && noon.night === 0);
    assert.ok(night.night === 1 && night.stars === 1);
    const [r, g, b] = night.zenith;
    assert.ok(b > r && b > g && b < 0.25, 'night sky is a very dark blue, not pink');
    assert.ok(dusk.sunDir.y > 0.02, 'the golden-hour sun is still above the horizon');
    assert.ok(PALETTES[s].grass.length === 3);
  }
  assert.ok(sunDirection(7).x > 0.5 && sunDirection(17.5).x < -0.5, 'east in the morning, west in the evening');
  assert.equal(PALETTES.winter.snow, 1);
  assert.ok(PALETTES.winter.bareTrees && !PALETTES.summer.bareTrees);
});
