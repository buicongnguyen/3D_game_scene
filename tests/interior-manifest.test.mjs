import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildManifest } from '../scripts/interior-manifest.mjs';
import { INTERIOR_MANIFEST } from '../src/content/interior-manifest.js';
import { INTERIORS } from '../src/world/interiors.js';
import { ROOM_MODELS, ALL_MODELS, bootModels, TROPICAL_MODELS } from '../src/content/models.js';

test('the interior manifest matches the room models (run: node scripts/interior-manifest.mjs)', async () => {
  const fresh = JSON.parse(JSON.stringify(await buildManifest()));
  assert.deepEqual(INTERIOR_MANIFEST, fresh);
});

test('every room has a manifest entry with a spawn, an exit and its gifts; rooms are not part of the first load', () => {
  for (const d of INTERIORS) {
    const m = INTERIOR_MANIFEST[d.model];
    assert.ok(m, `${d.id}: manifest for ${d.model}`);
    assert.ok(m.nodes.Spawn && m.nodes.Exit, `${d.id}: Spawn and Exit`);
    assert.ok(m.floor && m.ceilingMinY !== null, `${d.id}: floor and ceiling`);
    for (const gf of d.gifts ?? []) assert.ok(m.nodes[`Item_gift_${gf.id}`], `${d.id}: gift node ${gf.id}`);
    assert.ok(ROOM_MODELS.includes(d.model));
  }
  assert.equal(ROOM_MODELS.length, 11);
  const boot = new Set(bootModels());
  for (const m of [...ROOM_MODELS, ...TROPICAL_MODELS]) assert.ok(!boot.has(m), `${m} is loaded later`);
  assert.ok(bootModels({ tropical: true }).includes('tree-vn-mango'));
  assert.equal(ALL_MODELS.length - bootModels().length, ROOM_MODELS.length + TROPICAL_MODELS.length);
});
