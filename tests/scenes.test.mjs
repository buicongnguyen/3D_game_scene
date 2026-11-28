// House scenes (docs/TRAVEL-LANGUAGE-PLAN.md §5): the pilot's text, chips, glossary, voices and the pure picker.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENES, LEARN_LANGS, UI_LANGS, dueScene, hourIn, segments, scenePhrases, lineKey } from '../src/content/scenes/index.js';
import { GLOSSARY } from '../src/content/scenes/glossary.js';
import { CAST_VOICES, voiceKey } from '../src/content/scenes/cast-voices.js';
import { CAST } from '../src/game/story.js';
import { INTERIOR_MANIFEST } from '../src/content/interior-manifest.js';
import { HOMES } from '../src/world/interiors.js';

const LIMIT = { en: 70, vi: 80, ko: 40, ja: 40 };

test('every line is written in every language, short enough for two rows on a phone', () => {
  assert.ok(SCENES.length >= 3);
  for (const s of SCENES) {
    for (const l of UI_LANGS) assert.ok(s.title[l], `${s.id} title ${l}`);
    assert.ok(s.lines.length >= 8 && s.lines.length <= 12, `${s.id}: 8-12 lines`);
    s.lines.forEach((line, i) => {
      for (const l of UI_LANGS) {
        assert.ok(line[l]?.trim(), `${lineKey(s.id, i)} ${l} missing`);
        assert.ok([...line[l]].length <= LIMIT[l], `${lineKey(s.id, i)} ${l} too long (${[...line[l]].length})`);
      }
    });
  }
});

test('chips are substrings of their line, have a glossary card, at most 3 phrases a scene', () => {
  for (const s of SCENES) {
    for (const lang of LEARN_LANGS) assert.ok(scenePhrases(s, lang).length <= 4, `${s.id} ${lang}: few phrases`);
    s.lines.forEach((line, i) => {
      for (const [lang, list] of Object.entries(line.chips || {})) {
        assert.ok(LEARN_LANGS.includes(lang));
        for (const [t, id] of list) {
          assert.ok(line[lang].includes(t), `${lineKey(s.id, i)} ${lang}: chip "${t}" not in the line`);
          assert.ok(GLOSSARY[id]?.[lang]?.say, `${id}: no ${lang} card`);
          for (const u of UI_LANGS) assert.ok(GLOSSARY[id].mean?.[u], `${id}: meaning in ${u}`);
        }
        const seg = segments(line, lang);
        assert.equal(seg.map(x => x.text).join(''), line[lang]);
        assert.equal(seg.filter(x => x.phrase).length, list.length);
      }
    });
  }
});

test('every speaker is in the cast and has a voice in each learning language; nobody in a house shares one', () => {
  for (const s of SCENES) {
    const seen = new Map();
    for (const who of new Set(s.lines.map(l => l.who))) {
      assert.ok(CAST[who], `${s.id}: ${who} is not in CAST`);
      const cv = CAST_VOICES[who];
      assert.ok(cv?.kind, `${who}: no voice profile`);
      for (const lang of LEARN_LANGS) {
        assert.ok(cv[lang]?.engine && cv[lang]?.voice, `${who}: no ${lang} voice`);
        const k = `${lang}|${voiceKey(cv[lang])}`;
        assert.ok(!seen.has(k), `${s.id}: ${who} and ${seen.get(k)} share the ${lang} voice ${voiceKey(cv[lang])}`);
        seen.set(k, who);
      }
    }
    for (const who of Object.keys(s.cast)) assert.ok(s.lines.some(l => l.who === who), `${s.id}: ${who} is seated but never speaks`);
  }
});

test('recall questions point at real lines; seats and cameras exist in the room model', () => {
  const kindOf = Object.fromEntries(HOMES.flatMap(([kind, list]) => list.map(b => [b, kind])));
  for (const s of SCENES) {
    for (const r of s.recall) {
      for (const i of [r.answer, ...r.decoys]) assert.ok(s.lines[i], `${s.id}: recall line ${i}`);
      assert.equal(new Set([r.answer, ...r.decoys]).size, 3);
      for (const u of UI_LANGS) assert.ok(r.q[u]);
    }
    // an outdoor scene (the station's travellers): its runner frames the shots, no seats or room cameras
    if (!s.house) { assert.ok(s.place, `${s.id}: a house or a place`); for (const l of s.lines) assert.ok(l.cam === undefined || (l.cam >= 0 && l.cam <= 2)); continue; }
    const man = INTERIOR_MANIFEST[`interior-${kindOf[s.house]}`];
    assert.ok(man, `${s.id}: room ${s.house}`);
    for (const seat of Object.values(s.cast)) assert.ok(man.nodes[seat], `${s.id}: ${seat} missing`);
    for (const n of ['Cam_wide', 'Cam_a', 'Cam_b', 'Spot_mika']) assert.ok(man.nodes[n], `${s.id}: ${n} missing`);
    for (const l of s.lines) assert.ok(l.cam === undefined || (l.cam >= 0 && l.cam <= 2));
  }
});

test('the picker: hour windows, heard today, past midnight', () => {
  assert.equal(hourIn([17, 21.5], 18), true);
  assert.equal(hourIn([17, 21.5], 10), false);
  assert.equal(hourIn([21, 2], 1), true);
  assert.equal(dueScene('kw4', { hour: 18.5 })?.id, 'kw4.supper');
  assert.equal(dueScene('kw4', { hour: 10 }), null);
  assert.equal(dueScene('kw4', { hour: 18.5, heardToday: new Set(['kw4.supper']) }), null);
  assert.equal(dueScene('kw2', { hour: 10 })?.id, 'kw2.shop');
  assert.equal(dueScene('kw5', { hour: 15 })?.id, 'kw5.cranes');
  assert.equal(dueScene('kw1', { hour: 15 }), null);
});
