// Read aloud (engine/voice.js): who sounds like what, which of the device's voices they get, and how they are pitched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { speakerKind, voiceGender, voicesFor, pickVoice, speechFor, speakable } from '../src/engine/voice.js';
import { CAST } from '../src/game/story.js';
import { STORIES, useStory } from '../src/game/stories/index.js';

test('every named speaker sounds like someone: a woman, a man or a child', () => {
  for (const story of Object.keys(STORIES)) {
    useStory(story);
    for (const [id, c] of Object.entries(CAST)) {
      if (id === 'narrator' || id === 'villager') { assert.equal(speakerKind(c), null, id); continue; }
      assert.ok(['f', 'm', 'c'].includes(speakerKind(c)), `${story}: ${id} (${c.name}) needs a voice: 'f', 'm' or 'c'`);
    }
  }
  useStory('classic');
  assert.equal(speakerKind(CAST.genzo), 'm');
  assert.equal(speakerKind(CAST.mika), 'c');
  assert.equal(speakerKind({ name: 'Mr. Fujita', pitch: 0.85 }), 'm');
  assert.equal(speakerKind({ name: 'Mrs. Komori', pitch: 1.12 }), 'f');
  assert.equal(speakerKind({ name: 'Granny Tsuru', pitch: 1 }), 'f');
  assert.equal(speakerKind({ name: 'Yui', pitch: 1.5 }), 'c');
});

test("voices are told apart by their names where the name tells; Google's language voices do not", () => {
  assert.equal(voiceGender({ name: 'Kyoko' }), 'f');
  assert.equal(voiceGender({ name: 'Otoya' }), 'm');
  assert.equal(voiceGender({ name: 'Microsoft HoaiMy Online (Natural) - Vietnamese (Vietnam)' }), 'f');
  assert.equal(voiceGender({ name: 'Microsoft NamMinh Online (Natural) - Vietnamese (Vietnam)' }), 'm');
  assert.equal(voiceGender({ name: 'Microsoft An - Vietnamese (Vietnam)' }), 'm');
  assert.equal(voiceGender({ name: 'Google UK English Female' }), 'f');
  assert.equal(voiceGender({ name: 'Google UK English Male' }), 'm');
  assert.equal(voiceGender({ name: 'Microsoft SunHi Online (Natural) - Korean (Korea)' }), 'f');
  assert.equal(voiceGender({ name: 'Microsoft InJoon Online (Natural) - Korean (Korea)' }), 'm');
  assert.equal(voiceGender({ name: 'Google 日本語' }), null);
  assert.equal(voiceGender({ name: 'Tiếng Việt Việt Nam' }), null);
});

const apple = [
  { name: 'Samantha', lang: 'en-US', localService: true }, { name: 'Daniel', lang: 'en-GB', localService: true },
  { name: 'Kyoko', lang: 'ja-JP', localService: true }, { name: 'Otoya', lang: 'ja-JP', localService: true },
  { name: 'Linh', lang: 'vi-VN', localService: true }, { name: 'Yuna', lang: 'ko-KR', localService: true },
];
const android = [{ name: 'Tiếng Việt Việt Nam', lang: 'vi_VN', localService: true }, { name: '日本語 日本', lang: 'ja_JP', localService: true }];

test('each speaker gets a voice of their kind where the device has one, else the language\'s best', () => {
  assert.equal(pickVoice(apple, 'ja', 'm').name, 'Otoya');
  assert.equal(pickVoice(apple, 'ja', 'f').name, 'Kyoko');
  assert.equal(pickVoice(apple, 'ja', 'c').name, 'Kyoko');          // a child: a woman's voice, raised
  assert.equal(pickVoice(apple, 'en', 'm').name, 'Daniel');
  assert.equal(pickVoice(apple, 'vi', 'm').name, 'Linh');           // no man's voice in Vietnamese here: the one there is
  assert.equal(pickVoice(android, 'vi', 'm').name, 'Tiếng Việt Việt Nam');   // (Android writes vi_VN)
  assert.equal(pickVoice(android, 'ko', 'f'), null);                // nothing for Korean: the dialogue keeps its blips
  assert.equal(voicesFor(apple, 'fr').length, 0);
  // a natural / enhanced voice comes first
  assert.equal(pickVoice([{ name: 'Kyoko', lang: 'ja-JP' }, { name: 'Kyoko (Enhanced)', lang: 'ja-JP' }], 'ja', 'f').name, 'Kyoko (Enhanced)');
});

test('pitch: a man is lower than a woman, a child higher; a man on a woman\'s voice is lowered further', () => {
  useStory('classic');
  const on = (id, got) => speechFor(speakerKind(CAST[id]), CAST[id].pitch, got).pitch;
  assert.ok(on('genzo', 'm') < on('hana', 'f') && on('hana', 'f') < on('mika', 'f') && on('mika', 'f') < on('tamo', 'f'));
  assert.ok(on('genzo', 'f') < on('genzo', 'm') - 0.2, 'a man on the only (woman\'s) voice');
  assert.ok(on('hana', 'm') > on('hana', 'f'), 'a woman on the only (man\'s) voice is raised');
  assert.equal(on('genzo', null), on('genzo', 'f'), 'an unknown voice is taken as a woman\'s');
  for (const c of Object.values(CAST)) for (const got of ['f', 'm', null]) {
    const { pitch, rate } = speechFor(speakerKind(c), c.pitch, got);
    assert.ok(pitch >= 0.5 && pitch <= 1.8 && rate >= 0.9 && rate <= 1.1, `${c.name}: ${pitch} ${rate}`);
  }
});

test('emoji, stars and notes are not read out', () => {
  assert.equal(speakable('Look! ★ A star ✨ for you ♪'), 'Look! A star for you');
  assert.equal(speakable('🌸 Spring~ 🌸'), 'Spring');
  assert.equal(speakable('Grandma… are you there?'), 'Grandma… are you there?');
  assert.equal(speakable('★'), '');
});
