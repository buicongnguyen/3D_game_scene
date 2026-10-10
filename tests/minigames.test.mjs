import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cooking } from '../src/game/minigames.js';
import { herdStep, SHY_RADIUS } from '../src/actors/animals.js';
import { rng } from '../src/engine/spline.js';

// (fishing: tests/fishing.test.mjs)

test('cooking: the pot finishes by itself after a short stir', () => {
  const c = new Cooking();
  let t = 0;
  while (!c.update(1 / 60) && t < 10) t += 1 / 60;
  assert.ok(c.done && t > 1.5 && t < 4, `cooked in ${t.toFixed(1)} s`);
  assert.equal(c.view().progress, 1);
});

test('sheep: a sheep sent home trots into the pen on its own, even from far away', () => {
  const pen = { x: 0, z: 0, r: 5 };
  for (const [x, z] of [[0, 40], [35, -30], [-45, 10]]) {
    const s = { x, z, vx: 0, vz: 0, homing: true };
    const player = { x: 100, z: 100 };
    let t = 0;
    for (; t < 40 && !s.penned; t += 1 / 60) Object.assign(s, herdStep(s, player, [s], pen, 1 / 60, rng(Math.round(t * 60))));
    assert.ok(s.penned, `sheep from ${x},${z} got home`);
    assert.ok(t < 25, `took ${t.toFixed(1)} s`);
  }
});

test('sheep: grazing sheep let Mika walk right up (they only shuffle aside when bumped)', () => {
  const pen = { x: 0, z: 0, r: 5 };
  const s = { x: 60, z: 60, vx: 0, vz: 0 };
  const far = herdStep(s, { x: 60 + SHY_RADIUS + 0.8, z: 60 }, [s], pen, 0.2, () => 0.5);
  assert.ok(far.speed < 0.3, 'calm at arm\'s length');
  const near = herdStep(s, { x: 61, z: 60 }, [s], pen, 0.2, () => 0.5);
  assert.ok(near.x < 60, 'steps away when bumped');
});
