import test from 'node:test';
import assert from 'node:assert/strict';
import { Governor, settingsAt, LADDER } from '../src/engine/governor.js';
import { QUALITY } from '../src/engine/renderer.js';

const run = (g, dt, seconds) => { const seen = []; for (let t = 0; t < seconds; t += dt) { const l = g.frame(dt); if (l !== null) seen.push(l); } return seen; };

test('governor: steady slow frames walk down the ladder one step at a time and stop at the bottom', () => {
  const g = new Governor();
  const seen = run(g, 1 / 20, 120);
  assert.deepEqual(seen, [1, 2, 3, 4, 5]);
  assert.equal(g.level, LADDER.length - 1);
});

test('governor: smooth frames never change anything; one hitch or a hidden tab does not count', () => {
  const g = new Governor();
  assert.deepEqual(run(g, 1 / 60, 60), []);
  g.frame(0.2); g.frame(3);
  assert.deepEqual(run(g, 1 / 60, 30), []);
});

test('governor: never bounces between two levels', () => {
  // a device that is slow at level 0 and fast at level 1
  const g = new Governor();
  const changes = [];
  for (let t = 0; t < 900;) { const dt = g.level === 0 ? 1 / 22 : 1 / 60; t += dt; const l = g.frame(dt); if (l !== null) changes.push(l); }
  assert.deepEqual(changes, [1, 0, 1], 'down, one try back up, down for good');
  assert.equal(g.ceiling, 1);
});

test('governor: the ladder only ever makes the Low tier lighter', () => {
  const base = QUALITY.low;
  for (let l = 1; l < LADDER.length; l++) {
    const a = settingsAt(base, l - 1), b = settingsAt(base, l);
    for (const k of ['npcDraw', 'npcAnim', 'npcShadow', 'propDist', 'midDist']) assert.ok(b.q[k] <= a.q[k], `${k} at level ${l}`);
    assert.ok(b.q.shadowEvery >= a.q.shadowEvery);
    assert.ok(b.scale <= a.scale);
    assert.ok(b.q.npcDraw >= 40 && b.q.propDist >= 50, 'the valley is never emptied');
  }
  assert.equal(settingsAt(base, 0).scale, 1);
});
