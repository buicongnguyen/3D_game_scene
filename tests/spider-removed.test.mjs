// The spider web game and the spiders and webs on the map were removed (owner, 2026-11: too much drawing, too much trouble).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRICKS } from '../src/content/tricks.js';
import { FRIENDS } from '../src/game/story.js';
import { CRITTER_KINDS } from '../src/actors/critters.js';
import { migrate, freshState } from '../src/game/quest.js';

test('no spider is left in the games, the friends or the map', () => {
  assert.ok(!TRICKS.some(t => t.id === 'dew'));
  assert.ok(!FRIENDS.some(f => f.id === 'spider'));
  assert.ok(!('spider' in CRITTER_KINDS));
});

test('an old save that had befriended the spider no longer counts it', () => {
  const old = { ...freshState(), friends: { dog: 1, spider: 1, fox: 1 } };
  assert.deepEqual(Object.keys(migrate(old).friends).sort(), ['dog', 'fox']);
  assert.deepEqual(migrate({ ...freshState(), friends: { dog: 1 } }).friends, { dog: 1 });
});
