// The People setting (src/engine/people.js): which set each choice loads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weakDevice, peopleSetFor, peopleFile } from '../src/engine/people.js';

test('Automatic gives the light people only to weak devices on the Low tier', () => {
  assert.equal(weakDevice({ tier: 'low', memory: 8, cores: 8 }), false, 'a capable modern phone keeps Standard');
  assert.equal(weakDevice({ tier: 'low', memory: 2, cores: 8 }), true, 'little memory');
  assert.equal(weakDevice({ tier: 'low', memory: 8, cores: 4 }), true, 'few cores');
  assert.equal(weakDevice({ tier: 'low', memory: 8, cores: 8, slow: true }), true, 'frames already slow');
  assert.equal(weakDevice({ tier: 'low' }), false, 'nothing known (Safari has no deviceMemory): Standard');
  assert.equal(weakDevice({ tier: 'medium', memory: 2, cores: 2, slow: true }), false, 'not on Medium or High');
});

test('Standard and Light are kept on every device; Automatic follows weakDevice', () => {
  const old = { memory: 2, cores: 4 }, strong = { memory: 8, cores: 8 };
  assert.equal(peopleSetFor('std', 'low', old), 'std');
  assert.equal(peopleSetFor('lite', 'high', strong), 'lite');
  assert.equal(peopleSetFor('auto', 'low', old), 'lite');
  assert.equal(peopleSetFor('auto', 'low', strong), 'std');
  assert.equal(peopleSetFor('auto', 'medium', old), 'std');
});

test('only the nine people have light files', () => {
  assert.equal(peopleFile('mika', 'lite'), 'mika.lite');
  assert.equal(peopleFile('villager-kid', 'lite'), 'villager-kid.lite');
  assert.equal(peopleFile('tamo', 'lite'), 'tamo');
  assert.equal(peopleFile('mika', 'std'), 'mika');
});
