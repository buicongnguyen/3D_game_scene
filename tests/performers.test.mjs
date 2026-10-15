// The dance game's performers as data (src/content/performers.js) against their art contracts (tests/asset-contracts.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERFORMERS, SKIN_TONES, SHAPES, PROPORTIONS, lookIds, lookOf, cleanLook, clampProportion } from '../src/content/performers.js';
import { CONTRACTS, SHAPE_KEYS } from './asset-contracts.mjs';
import { PEOPLE, peopleFile } from '../src/engine/people.js';

test('every look shows one top, one bottom and one pair of shoes the performer file has', () => {
  for (const [id, p] of Object.entries(PERFORMERS)) {
    const c = CONTRACTS[id];
    assert.ok(c, `${id} has a contract`);
    assert.ok(p.looks.length >= 3 && p.looks.length <= 4, `${id}: 3-4 looks`);
    assert.deepEqual(p.looks.find(l => l.id === p.defaultLook)?.parts, c.look, `${id}: the default look is the contract's (and the light file's)`);
    for (const l of p.looks) {
      for (const slot of ['Top_', 'Bottom_', 'Shoes_']) assert.equal(l.parts.filter(x => x.startsWith(slot)).length, 1, `${id}/${l.id}: one ${slot}`);
      for (const part of l.parts) assert.ok(c.parts.includes(part), `${id}/${l.id}: ${part} is in the file`);
      for (const [m, hex] of Object.entries(l.tint)) assert.match(hex, /^#[0-9a-f]{6}$/i, `${id}/${l.id}: ${m} colour`);
      assert.ok(l.swatch, `${id}/${l.id}: a swatch for the wardrobe card`);
    }
    assert.equal(new Set(lookIds(id)).size, p.looks.length, `${id}: look ids are unique`);
    assert.ok(SKIN_TONES.some(s => s.id === p.skin), `${id}: default skin tone`);
  }
});

test('looks fall back to the default and saved ids are checked', () => {
  assert.equal(lookOf('nabi', 'street').id, 'street');
  assert.equal(lookOf('nabi', 'nope').id, PERFORMERS.nabi.defaultLook);
  assert.equal(lookOf('nobody', 'x'), null);
  assert.equal(cleanLook('hoa', 'aodai2'), 'aodai2');
  assert.equal(cleanLook('hoa', 'street'), null);
});

test('skin tones run fairest to deepest; the shape controls are the files\' shape keys', () => {
  const lum = hex => { const n = parseInt(hex.slice(1), 16); return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255); };
  for (let i = 1; i < SKIN_TONES.length; i++) assert.ok(lum(SKIN_TONES[i].hex) < lum(SKIN_TONES[i - 1].hex), `${SKIN_TONES[i].id} is deeper`);
  assert.deepEqual(SHAPES.map(s => s.id).sort(), [...SHAPE_KEYS].sort());
});

test('proportion controls clamp into modest ranges with 1 (or 0) as designed', () => {
  for (const [k, [lo, hi, def]] of Object.entries(PROPORTIONS)) {
    assert.ok(lo < def && def < hi, `${k} default inside`);
    assert.equal(clampProportion(k, 99), hi);
    assert.equal(clampProportion(k, -99), lo);
    assert.equal(clampProportion(k, NaN), def);
  }
});

test('the performers have light files; their clip-only cousins serve both sets', () => {
  for (const id of Object.keys(PERFORMERS)) {
    assert.ok(PEOPLE.includes(id), `${id} is one of the people`);
    assert.equal(peopleFile(id, 'lite'), `${id}.lite`);
    assert.ok(CONTRACTS[`${id}.lite`], `${id}.lite has a contract`);
  }
});
