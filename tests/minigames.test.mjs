import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Fishing, Cooking } from '../src/game/minigames.js';
import { herdStep } from '../src/actors/animals.js';
import { rng } from '../src/engine/spline.js';

function playFishing(policy, seed, opts = {}) {
  const f = new Fishing({ rand: rng(seed), ...opts });
  const dt = 1 / 60;
  let t = 0;
  while (f.phase !== 'done' && t < 60) {
    const { press, hold } = policy(f);
    f.update(dt, press, hold);
    t += dt;
  }
  return f;
}

// A skilled player strikes on the bite and keeps the zone under the fish.
const skilled = f => ({ press: f.phase === 'bite', hold: f.phase === 'reel' && f.zone < f.fish + 0.02 });

test('a skilled player lands most trout; an idle player never does', () => {
  let caught = 0;
  for (let s = 1; s <= 40; s++) if (playFishing(skilled, s).result === 'caught') caught++;
  assert.ok(caught >= 34, `skilled caught ${caught}/40`);
  for (let s = 1; s <= 10; s++) assert.notEqual(playFishing(() => ({ press: false, hold: false }), s).result, 'caught');
});

test('striking before the bite scares the fish; the starfin only appears at dusk and is harder', () => {
  const f = new Fishing({ rand: rng(3) });
  f.update(0.1, true, false);
  assert.equal(f.result, 'early');
  const species = new Set();
  for (let s = 0; s < 60; s++) species.add(new Fishing({ rand: rng(s) }).species);
  assert.ok(!species.has('starfin'));
  const dusk = Array.from({ length: 60 }, (_, s) => new Fishing({ rand: rng(s), dusk: true })).filter(f => f.species === 'starfin');
  assert.ok(dusk.length > 10 && dusk.every(f => f.difficulty > 0.5));
});

test('cooking: on-beat stirring finishes in four presses, mashing still finishes (no fail state)', () => {
  const c = new Cooking();
  let presses = 0;
  for (let i = 0; i < 2000 && !c.done; i++) {
    const r = c.ring;
    const press = r > 0.55 && r < 0.6 && (i % 3 === 0);
    if (press) presses++;
    c.update(1 / 60, press);
  }
  assert.ok(c.done);
  assert.ok(presses <= 6, `took ${presses}`);
  const m = new Cooking();
  for (let i = 0; i < 40 && !m.done; i++) m.update(0.37, true);
  assert.ok(m.done, 'mashing eventually cooks');
});

test('herding: sheep flee the player and can be steered into the pen', () => {
  const pen = { x: 0, z: 0, r: 5 };
  const flock = [{ x: 0, z: 22, vx: 0, vz: 0 }];
  const player = { x: 0, z: 30 };
  // walk behind the sheep, pushing it toward the pen
  for (let i = 0; i < 60 * 40 && !flock[0].penned; i++) {
    const s = flock[0];
    const dx = s.x - pen.x, dz = s.z - pen.z, d = Math.hypot(dx, dz) || 1;
    player.x = s.x + dx / d * 5; player.z = s.z + dz / d * 5;
    Object.assign(s, herdStep(s, player, flock, pen, 1 / 60, rng(i)));
  }
  assert.ok(flock[0].penned, 'sheep reached the pen');
  const s2 = { x: 10, z: 10, vx: 0, vz: 0 };
  const n = herdStep(s2, { x: 12, z: 10 }, [s2], pen, 0.2, () => 0.5);
  assert.ok(n.x < 10, 'flees away from the player');
});
