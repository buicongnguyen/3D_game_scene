import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Fishing, Cooking } from '../src/game/minigames.js';
import { herdStep, SHY_RADIUS } from '../src/actors/animals.js';
import { rng } from '../src/engine/spline.js';

function playFishing(policy, seed, opts = {}, limit = 60) {
  const f = new Fishing({ rand: rng(seed), ...opts });
  const dt = 1 / 60;
  let t = 0;
  while (f.phase !== 'done' && t < limit) {
    f.update(dt, policy(f));
    t += dt;
  }
  return { f, t };
}

test('fishing is one press: press E while the float is under and the fish is caught', () => {
  for (let s = 1; s <= 30; s++) {
    const { f, t } = playFishing(f => f.phase === 'bite', s);
    assert.equal(f.result, 'caught');
    assert.ok(t < 4, `bite came after ${t.toFixed(1)} s`);
  }
  // an idle player never catches anything, but nothing is lost either: the bites keep coming
  const { f } = playFishing(() => false, 3, {}, 20);
  assert.notEqual(f.result, 'caught');
  assert.ok(f.bites >= 3, `bites ${f.bites}`);
});

test('pressing early does nothing; a late press after a missed bite still works on the next one', () => {
  const f = new Fishing({ rand: rng(5) });
  f.update(0.1, true);
  assert.equal(f.phase, 'wait');
  let t = 0, pressedAfterMiss = false;
  while (f.phase !== 'done' && t < 20) {
    // ignore the first bite, take the second
    const press = f.phase === 'bite' && f.bites >= 2;
    if (press) pressedAfterMiss = true;
    f.update(1 / 60, press);
    t += 1 / 60;
  }
  assert.ok(pressedAfterMiss && f.result === 'caught');
});

test('the starfin only bites at dusk', () => {
  const species = new Set();
  for (let s = 0; s < 60; s++) species.add(new Fishing({ rand: rng(s) }).species);
  assert.ok(!species.has('starfin'));
  const dusk = Array.from({ length: 60 }, (_, s) => new Fishing({ rand: rng(s), dusk: true })).filter(f => f.species === 'starfin');
  assert.ok(dusk.length > 10);
});

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
