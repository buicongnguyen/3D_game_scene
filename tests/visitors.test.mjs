// © 2026 Bui Cong Nguyen · solluxlabs.com
// The station visitors (content/visitors.js, game/station-visitors.js): their day, their walk and their scene.
import test from 'node:test';
import assert from 'node:assert/strict';
import { phaseAt, along, beside, onStones, STONE_WALK, SPOTS, VISITORS, CHATTER, SCENE_ID } from '../src/content/visitors.js';
import { SCENE_BY_ID, LEARN_LANGS, lineLang, scenePhrases } from '../src/content/scenes/index.js';
import { CAST_VOICES } from '../src/content/scenes/cast-voices.js';
import { CAST } from '../src/game/story.js';
import { recallFor, normalizeBook } from '../src/game/phrasebook.js';
import { bakeList } from '../scripts/speech-build.mjs';
import { HUMAN_GAIT } from '../src/actors/gait.js';
import { PEOPLE, LITE_ON_LOW } from '../src/engine/people.js';
import { bootModels } from '../src/content/models.js';

test('their day: off the morning train, the shrine in the evening, gone at night', () => {
  assert.equal(phaseAt(6.5), 'away');
  assert.equal(phaseAt(10), 'day');
  assert.equal(phaseAt(16.9), 'day');
  assert.equal(phaseAt(18), 'evening');
  assert.equal(phaseAt(20.8), 'leaving');
  assert.equal(phaseAt(22), 'away');
  assert.equal(phaseAt(-1), 'away');
});

test('the walker: points along a path, Bibi beside her sister, the stepping stones', () => {
  const p = along([[0, 0], [10, 0], [10, 10]], 15);
  assert.ok(Math.abs(p.x - 10) < 1e-9 && Math.abs(p.z - 5) < 1e-9 && !p.end);
  assert.ok(along([[0, 0], [10, 0]], 11).end);
  const b = beside(0, 0, 0, 1, 0);                  // facing +z: to her left is +x
  assert.ok(Math.abs(b.x - 1) < 1e-9 && Math.abs(b.z) < 1e-9);
  for (const [x, z] of STONE_WALK.slice(1, -1)) assert.ok(onStones(x, z), `stone ${x}`);
  assert.ok(!onStones(SPOTS.fordWest.x, SPOTS.fordWest.z) && !onStones(SPOTS.fordEast.x, SPOTS.fordEast.z));
});

test('the sisters: cast, gait, light files on Low, never fetched at the start', () => {
  for (const v of VISITORS) {
    assert.ok(CAST[v.id]?.voice, `${v.id}: a cast entry with a device voice`);
    assert.ok(HUMAN_GAIT[v.model]?.walk, `${v.model}: walk reference`);
    assert.ok(PEOPLE.includes(v.model) && LITE_ON_LOW.includes(v.model));
    assert.ok(!bootModels().includes(v.model), `${v.model} is fetched near them only`);
  }
  for (const list of Object.values(CHATTER)) for (const [who] of list) assert.ok(CAST[who]);
});

test('"Which way?": Vita asks in English whatever is learned; every other line in the learning language', () => {
  const s = SCENE_BY_ID.get(SCENE_ID);
  assert.ok(s && s.place === 'station' && !s.house);
  const en = s.lines.filter(l => l.say === 'en');
  assert.ok(en.length >= 1 && en.every(l => l.who === 'vita'));
  assert.equal(lineLang(en[0], 'ko'), 'en');
  assert.equal(lineLang(s.lines[0], 'vi'), 'vi');
  // English lines are baked once, in English
  const keys = bakeList(['ko']).filter(b => b.scene === SCENE_ID).map(b => b.i);
  assert.equal(keys.length, s.lines.length - en.length);
  for (const lang of LEARN_LANGS) {
    const ph = scenePhrases(s, lang);
    for (const id of ['excuse-me', 'which-way', 'thank-you', 'nice-trip']) assert.ok(ph.includes(id), `${lang}: ${id}`);
  }
  // their voices are their own: nobody in the homes speaks with them
  for (const who of ['vita', 'bibi']) for (const lang of LEARN_LANGS) {
    const k = JSON.stringify(CAST_VOICES[who][lang]);
    for (const [id, cv] of Object.entries(CAST_VOICES)) if (id !== who) assert.notEqual(JSON.stringify(cv[lang]), k, `${who} ${lang} = ${id}`);
  }
});

test('Tamo asks about the sisters on a later day', () => {
  const book = normalizeBook({});
  book.scenes[SCENE_ID] = { ko: { n: 1, last: 100 } };
  assert.equal(recallFor(book, 'station', 'ko', 100), null, 'not the same day');
  const r = recallFor(book, 'station', 'ko', 101);
  assert.equal(r?.scene.id, SCENE_ID);
  assert.equal(r.choices.length, 3);
});
