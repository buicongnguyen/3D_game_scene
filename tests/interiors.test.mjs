import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INTERIORS, HOMES, DOOR_SPOTS } from '../src/world/interiors.js';
import { INTERIORS as INTERIOR_MODELS } from '../src/content/models.js';
import { BUILDINGS, WORLD } from '../src/world/layout.js';

const byId = new Map(BUILDINGS.map(b => [b.id, b]));

test('every house, shop and workshop can be entered: one room per building, sharing models by kind', () => {
  const homes = INTERIORS.filter(d => d.kind);
  assert.equal(homes.length, HOMES.reduce((n, [, list]) => n + list.length, 0));
  assert.ok(INTERIORS.length >= 21, `${INTERIORS.length} rooms`);
  const ids = INTERIORS.map(d => d.id);
  assert.equal(new Set(ids).size, ids.length, 'room ids are unique');
  for (const d of INTERIORS) {
    const b = byId.get(d.building);
    assert.ok(b, `${d.id}: building ${d.building} exists in the layout`);
    assert.ok(INTERIOR_MODELS.includes(d.model), `${d.id}: ${d.model} is loaded`);
  }
  // the buildings that are houses of one kind share that kind's room model
  const models = new Set(homes.filter(d => d.kind === 'kawabe-a').map(d => byId.get(d.building).model));
  assert.deepEqual([...models], ['kawabe-house-a']);
  // which ordinary buildings still have no door? only the bell tower, the shrine, platforms and landmarks
  const entered = new Set(INTERIORS.map(d => d.building));
  const left = BUILDINGS.filter(b => !entered.has(b.id)).map(b => b.model);
  assert.deepEqual([...new Set(left)].sort(), ['belltower', 'platform', 'shrine', 'torii'].sort(), `still closed: ${left.join(', ')}`);
});

test('the rooms hang apart from each other high above the valley and inside the world rectangle', () => {
  const seen = new Set();
  for (const d of INTERIORS) {
    const key = d.at.join(',');
    assert.ok(!seen.has(key), `${d.id} shares a spot`);
    seen.add(key);
    assert.ok(d.at[0] > WORLD.minX && d.at[0] < WORLD.maxX && d.at[1] > WORLD.minZ && d.at[1] < WORLD.maxZ);
  }
  const pts = INTERIORS.map(d => d.at);
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) assert.ok(Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) >= 28, `${INTERIORS[i].id} and ${INTERIORS[j].id} hang too close`);
});

test('neighbours in the same kind of house show different decor, and every kind has all three variants in use', () => {
  for (const [kind, list] of HOMES) {
    const vs = INTERIORS.filter(d => d.kind === kind).map(d => d.variant);
    assert.ok(vs.every(v => v >= 1 && v <= 3));
    assert.equal(new Set(vs).size, Math.min(3, list.length), `${kind}: ${vs.join(',')}`);
  }
});

test('each kind of building has a door spot, measured from its generator', () => {
  for (const [kind, list] of HOMES) {
    const model = byId.get(list[0]).model;
    const spot = DOOR_SPOTS[model];
    assert.ok(spot && Number.isFinite(spot.x) && Number.isFinite(spot.z) && Number.isFinite(spot.out), `${model} (${kind}) has a door spot`);
  }
});
