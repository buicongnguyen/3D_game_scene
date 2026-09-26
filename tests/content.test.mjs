import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FRIENDS, FISH, CAPTIONS, KEEPSAKES, DIALOGUE, ITEMS } from '../src/game/story.js';
import { freshState, migrate } from '../src/game/quest.js';

const icon = n => fs.existsSync(new URL(`../public/icons/${n}.webp`, import.meta.url));

test('journal pictures exist for every fish and every valley friend', () => {
  for (const f of Object.values(FISH)) assert.ok(icon(f.icon), `fish icon ${f.icon}`);
  for (const f of FRIENDS) assert.ok(icon(f.icon), `friend icon ${f.icon}`);
  for (const f of Object.values(FISH)) assert.ok(f.hint && f.desc, `${f.name} has a hint and a description`);
});

test('every friend has a first-hello scene and a prompt; there is a reward for meeting them all', () => {
  const ids = new Set();
  for (const f of FRIENDS) {
    assert.ok(!ids.has(f.id)); ids.add(f.id);
    assert.ok(DIALOGUE[`friend_${f.id}`], `friend_${f.id}`);
    assert.ok(f.verb && f.desc && f.hint, f.id);
  }
  assert.ok(DIALOGUE.friends_all);
});

test('keepsakes each have a scene, a home and a place in the journal', () => {
  for (const k of KEEPSAKES) {
    assert.ok(DIALOGUE[k.say], k.say);
    assert.ok(k.home && k.where && k.text && k.model, k.id);
  }
  assert.ok(ITEMS.kite && DIALOGUE.kite_found);
});

test('train captions are timed in order along the ride and short enough to read', () => {
  for (const key of ['ride', 'tour']) {
    const at = CAPTIONS[key].map(c => c.at);
    assert.deepEqual(at, [...at].sort((a, b) => a - b), key);
    assert.ok(at.every(a => a >= 0 && a < 1));
    for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= 0.1, `${key}: captions ${i - 1}/${i} too close`);
  }
  for (const c of [...CAPTIONS.arrival, ...CAPTIONS.ride.map(x => x.text), ...CAPTIONS.tour.map(x => x.text)]) assert.ok(c.length <= 120, c);
});

test('old saves gain friends and keepsakes when loaded', () => {
  const old = freshState();
  delete old.friends; delete old.keepsakes;
  const s = migrate(old);
  assert.deepEqual(s.friends, {});
  assert.deepEqual(s.keepsakes, []);
});
