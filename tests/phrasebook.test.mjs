// The travel notebook (game/phrasebook.js): heard lines, Leitner boxes, recall and the phrase of the day.
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyBook, hearLine, hearScene, heardToday, recallFor, answerRecall, phraseOfDay, bookStats, normalizePrefs, normalizeBook, keep, dayOf } from '../src/game/phrasebook.js';
import { SCENE_BY_ID } from '../src/content/scenes/index.js';

const hearAll = (b, id, lang, day) => { SCENE_BY_ID.get(id).lines.forEach((_, i) => hearLine(b, id, i, lang, day)); hearScene(b, id, lang, day); return b; };

test('hearing a scene records lines, phrases in box 1 and today', () => {
  const b = hearAll(emptyBook(), 'kw4.supper', 'ko', 100);
  assert.equal(bookStats(b, 'ko').lines, 12);
  assert.equal(bookStats(b, 'ko').scenes, 1);
  assert.equal(bookStats(b, 'ko').phrases, 4);
  assert.equal(b.phrases['before-meal'].ko.box, 1);
  assert.deepEqual([...heardToday(b, 'ko', 100)], ['kw4.supper']);
  assert.equal(heardToday(b, 'ko', 101).size, 0);
  assert.equal(heardToday(b, 'en', 100).size, 0);
  keep(b, 'more', 'ko');
  assert.equal(bookStats(b, 'ko').kept, 1);
});

test('recall: never the same day as the scene, three distinct choices, boxes move, once a day', () => {
  const b = hearAll(emptyBook(), 'kw4.supper', 'vi', 100);
  assert.equal(recallFor(b, 'kw4', 'vi', 100), null);
  const r = recallFor(b, 'kw4', 'vi', 101);
  assert.ok(r);
  assert.equal(new Set(r.choices).size, 3);
  assert.ok(r.choices.includes(r.answer));
  answerRecall(b, 'kw4.supper', 'vi', 101, true);
  assert.equal(recallFor(b, 'kw4', 'vi', 101), null);
  const ids = SCENE_BY_ID.get('kw4.supper').lines[r.answer].chips.vi.map(([, id]) => id);
  for (const id of ids) assert.equal(b.phrases[id].vi.box, 2);
  answerRecall(b, 'kw4.supper', 'vi', 102, false);
});

test('phrase of the day is the same all day and comes from heard phrases', () => {
  const b = hearAll(emptyBook(), 'kw2.shop', 'en', 200);
  const a1 = phraseOfDay(b, 'en', 201), a2 = phraseOfDay(b, 'en', 201);
  assert.deepEqual(a1, a2);
  assert.ok(['how-much', 'may-i-have', 'come-again'].includes(a1.id));
  assert.ok(phraseOfDay(emptyBook(), 'ko', 5)?.id);                 // before anything: the first scene's phrases
  assert.equal(typeof dayOf(new Date(2026, 10, 28)), 'number');
});

test('stored data is checked on the way in', () => {
  assert.deepEqual(normalizePrefs({ learn: 'xx', speed: 3 }), { learn: null, meaning: true, speed: 1, roman: true });
  assert.equal(normalizePrefs({ learn: 'off' }).learn, 'off');
  assert.equal(normalizePrefs({ learn: 'ko', speed: 0.75 }).speed, 0.75);
  assert.deepEqual(normalizeBook({ v: 9 }), emptyBook());
});
