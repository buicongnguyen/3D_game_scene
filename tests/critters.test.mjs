import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planCritters, presence, CRITTER_KINDS, Critters } from '../src/actors/critters.js';
import { scatter } from '../src/world/scatter.js';
import { sharedGrid, placeProblems } from '../src/world/roads.js';
import { river, riverHalfWidth, PADDIES } from '../src/world/layout.js';
import { FRIENDS } from '../src/game/story.js';
import { ANIMALS } from '../src/content/models.js';

const grid = sharedGrid();
const placed = scatter((x, z) => grid.heightAt(x, z), () => true, 0.85);
const plan = planCritters(placed, grid, () => 0.6);

test('the critter plan is the same every time and every kind has a home', () => {
  const again = planCritters(placed, grid, () => 0.6);
  for (const kind of Object.keys(CRITTER_KINDS)) {
    assert.ok(plan[kind].length >= 8, `${kind}: ${plan[kind].length}`);
    assert.deepEqual(plan[kind].map(s => [s.hx, s.hz]), again[kind].map(s => [s.hx, s.hz]), kind);
  }
});

test('crickets sit on dry, gentle ground; dragonflies hover over water; webs and perches are dry', () => {
  for (const s of plan.cricket) assert.deepEqual(placeProblems(s.hx, s.hz, grid), [], `cricket at ${s.hx.toFixed(1)}, ${s.hz.toFixed(1)}`);
  for (const s of plan.dragonfly) {
    const w = river.nearest(s.hx, s.hz, 40);
    const overRiver = w && w.d < riverHalfWidth(w.z), overPaddy = PADDIES.some(p => Math.abs(s.hx - p.x) < p.w / 2 && Math.abs(s.hz - p.z) < p.d / 2);
    assert.ok(overRiver || overPaddy, `dragonfly at ${s.hx.toFixed(1)}, ${s.hz.toFixed(1)}`);
  }
  for (const s of [...plan.spider, ...plan.ladybug, ...plan.butterfly]) assert.ok(grid.heightAt(s.hx, s.hz) > 0.8, `${s.kind} at ${s.hx.toFixed(1)}, ${s.hz.toFixed(1)}`);
  // webs hang low enough for Mika to meet the spider
  for (const s of plan.spider) assert.ok(s.hy - grid.heightAt(s.hx, s.hz) < 2.2, 'web too high');
});

test('season and hour decide who is out; everyone can be met at some time of year', () => {
  assert.equal(presence('butterfly', 'winter', 12), 0);
  assert.equal(presence('ladybug', 'summer', 1), 0);
  assert.ok(presence('cricket', 'summer', 22) > presence('cricket', 'summer', 12));
  for (const kind of Object.keys(CRITTER_KINDS)) {
    assert.ok(['spring', 'summer', 'autumn'].some(se => [8, 12, 16, 20, 23].some(h => presence(kind, se, h) > 0.5)), kind);
    assert.ok(FRIENDS.some(f => f.id === kind), `${kind} is a valley friend`);
    assert.ok(ANIMALS.includes(CRITTER_KINDS[kind].model), `${kind} model is loaded`);
  }
});

test('a grasshopper with no dry ground to hop to sits a while instead of crouching again every frame', () => {
  const stub = Object.assign(Object.create(Critters.prototype), { world: { heightAt: () => 0 }, play() {}, launch() { throw new Error('must not hop into the water'); } });
  const clips = [];
  const v = { anim: { has: () => true, clips: new Map([['Hop', { duration: 0.6 }]]), once: (n) => clips.push(n) } };
  const s = { st: 'idle', t: 0, hold: 0, x: 0, y: 1, z: 0, hx: 0, hz: 0, face: 0 };
  stub.place = () => {};
  stub.grasshopper(v, s, 0.016, false, 1, 0, 1);      // bored: crouches
  assert.equal(s.st, 'crouch');
  stub.grasshopper(v, s, 0.4, false, 1, 0, 1);        // the crouch is over, the water is all around: no hop
  assert.equal(s.st, 'idle');
  assert.ok(s.t >= 1, `a rest before the next try (${s.t})`);
  for (let i = 0; i < 30; i++) stub.grasshopper(v, s, 0.016, false, 1, 0, 1);
  assert.equal(clips.length, 1, 'the Hop clip is not replayed every frame');
});
