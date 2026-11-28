// © 2026 Bui Cong Nguyen · solluxlabs.com
// Sing & Play's setup chips and pickers (game/singplay/pickers.js, docs/SING-AND-PLAY.md "Bar layout"): what each chip and
// picker shows as plain data, the song list's tags and sections, the Dance choice's Auto, the Group of 8 note, the Stage
// chip's "Here", the keyboard / gamepad step between controls, and the remembered Dance choice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PICKERS, DANCE_PICKS, DANCE_AUTO, navStep, songTags, songSections, fmtDuration, fmtHour, pickerData, chipData, groupNote } from '../src/game/singplay/pickers.js';
import { loadDance, DANCE_KEY, danceFor } from '../src/game/singplay/singplay.js';
import { SINGERS, NIGHT_STAR, KOTONE } from '../src/content/troupe.js';
import { STAGES } from '../src/content/stages.js';
import { TIME_CHOICES } from '../src/game/singplay/time-row.js';

const store = o => ({ getItem: k => (k in o ? o[k] : null) });
const SONGS = [
  { id: 'a', title: 'Alpha', lang: 'en', bpm: 120, duration: 169, dance: true, instrumental: false, style: null },
  { id: 'b', title: 'Bravo', lang: 'en', bpm: 82.4, duration: 88, dance: false, instrumental: false, style: 'cute' },
  { id: 'c', title: 'Glow', lang: null, bpm: 128, duration: 61, dance: true, instrumental: true, style: 'kpop' },
];
/** A SingPlay stand-in with the fields the pickers read. */
function fakeSp(o = {}) {
  return {
    singers: [...SINGERS], singer: KOTONE, singerNext: null, singerWait: false, songWait: false, groupWait: false, perf: null,
    songs: SONGS.map(song => ({ song })), songId: 'b', group: 4, dancePick: DANCE_AUTO, lyricsOn: true, showOn: false,
    limits: { max: 4, strongMax: 8, forced: false }, strong: { ok: false, why: 'measuring' },
    g: { player: { pos: { x: STAGES[0].x, y: 0, z: STAGES[0].z } } }, time: { currentTime: () => 'night' },
    max() { return this.strong.ok ? 8 : this.limits.max; },
    songChoices: () => SONGS, currentSong() { return SONGS.find(s => s.id === this.songId); },
    songDance() { return danceFor(DANCE_AUTO, this.currentSong()); },
    ...o,
  };
}

test('seven chips in the bar order; the Dance choice adds Auto (the default) before the four styles', () => {
  assert.deepEqual(PICKERS, ['singer', 'song', 'group', 'dance', 'stage', 'time', 'settings']);
  assert.deepEqual(DANCE_PICKS, ['auto', 'mix', 'kpop', 'cute', 'hiphop']);
  assert.equal(loadDance(store({})), 'auto', 'nothing stored: Auto');
  assert.equal(loadDance(store({ [DANCE_KEY]: 'hiphop' })), 'hiphop');
  assert.equal(loadDance(store({ [DANCE_KEY]: 'disco' })), 'auto');
  assert.equal(loadDance(store({ 'starline:singplay:dance': 'cute' })), 'auto', 'the older key (written by song picks too) is not read');
  assert.equal(loadDance({ getItem() { throw new Error('blocked'); } }), 'auto');
});

test('song rows: tags (language or Instrumental, bpm, style, length) and sections dance -> slow -> instrumentals', () => {
  assert.deepEqual(songTags(SONGS[0]), ['EN', '120 bpm', '2:49']);
  assert.deepEqual(songTags(SONGS[1]), ['EN', '82 bpm', 'Cute', '1:28']);
  assert.deepEqual(songTags(SONGS[2]), ['Instrumental', '128 bpm', 'K-pop', '1:01']);
  assert.deepEqual(songTags({ lang: 'en+vi', bpm: 0 }), ['EN/VI']);
  assert.deepEqual(songSections([SONGS[2], SONGS[1], SONGS[0]]).map(s => [s.kind, s.items.map(c => c.id)]), [['dance', ['a']], ['slow', ['b']], ['inst', ['c']]]);
  assert.deepEqual(songSections([SONGS[1]]).map(s => s.kind), ['slow'], 'empty sections left out');
  assert.equal(fmtDuration(0), ''); assert.equal(fmtDuration(null), ''); assert.equal(fmtDuration(59.6), '1:00');
  assert.equal(fmtDuration(125), '2:05');
  assert.deepEqual(TIME_CHOICES.map(c => fmtHour(c.hour)), ['8:00', '12:30', '18:00', '21:00']);
});

test('pickers as data: one selected option each, every option of the choice shown', () => {
  const sp = fakeSp({ singers: [...SINGERS, NIGHT_STAR] });
  const one = id => pickerData(sp, id).sections.flatMap(s => s.items);
  const singer = one('singer');
  assert.deepEqual(singer.map(i => i.id), [...SINGERS, NIGHT_STAR]);
  assert.deepEqual(singer.filter(i => i.selected).map(i => i.id), [KOTONE]);
  assert.equal(singer.find(i => i.id === NIGHT_STAR).sub, 'Best at night');
  assert.ok(singer.every(i => i.img === `faces/${i.id}.webp`));
  const songs = pickerData(sp, 'song');
  assert.equal(songs.kind, 'songs', 'the Song list: tabs over the rows (song-list.js)');
  assert.equal(songs.tab, 'en', "it opens on the game's language");
  assert.deepEqual(songs.tabs.map(t => [t.id, t.name, t.n]), [['all', 'All', 3], ['en', 'English', 2], ['vi', 'Tiếng Việt', 0], ['ko', '한국어', 0], ['inst', 'Instrumental', 1]]);
  assert.deepEqual(songs.sections.map(s => s.label), ['Dance songs', 'Slow songs']);
  assert.deepEqual(pickerData(fakeSp({ songTab: 'all' }), 'song').sections.map(s => s.label), ['Dance songs', 'Slow songs', 'Instrumentals']);
  assert.deepEqual(one('song').filter(i => i.selected).map(i => i.id), ['b']);
  assert.equal(pickerData(fakeSp({ songTab: 'inst' }), 'song').sections[0].items.find(i => i.id === 'c').sub, 'Instrumental · 128 bpm · K-pop · 1:01');
  assert.ok(one('song').every(i => i.act === null), 'no library here: no Download buttons');
  const dance = one('dance');
  assert.deepEqual(dance.map(i => i.id), DANCE_PICKS);
  assert.equal(dance.find(i => i.selected).id, 'auto');
  assert.equal(dance[0].sub, 'Follows the song: Cute', 'Auto names the style it will dance now');
  assert.deepEqual(one('time').map(i => [i.id, i.selected]), TIME_CHOICES.map(c => [c.id, c.id === 'night']));
  const sw = pickerData(sp, 'settings');
  assert.equal(sw.kind, 'switches');
  assert.deepEqual(sw.sections[0].items.map(i => [i.id, i.on]), [['lyrics', true], ['show', false]]);
  // busy states: options shown, not pickable
  assert.ok(pickerData(fakeSp({ singerWait: true }), 'singer').sections[0].items.every(i => i.disabled));
  assert.ok(pickerData(fakeSp({ songWait: true }), 'song').sections.flatMap(s => s.items).every(i => i.disabled));
  assert.equal(pickerData(fakeSp({ perf: {} }), 'settings').sections[0].items[1].disabled, true, 'show effects: not during a song');
});

test('Group: 8 only where this device offers it, else a short note why', () => {
  const ids = sp => pickerData(sp, 'group').sections[0].items.map(i => i.id);
  const phone = fakeSp();
  assert.deepEqual(ids(phone), ['1', '4']);
  assert.equal(pickerData(phone, 'group').note, 'Group of 8: checking this device…');
  assert.equal(groupNote(fakeSp({ strong: { ok: false, why: 'little memory' } })), 'Group of 8 needs a faster device');
  const strong = fakeSp({ strong: { ok: true, why: 'measured' } });
  assert.deepEqual(ids(strong), ['1', '4', '8']); assert.equal(pickerData(strong, 'group').note, '');
  assert.equal(pickerData(fakeSp({ groupWait: true }), 'group').note, 'Getting the group ready…');
  assert.deepEqual(pickerData(phone, 'group').sections[0].items.filter(i => i.selected).map(i => i.id), ['4']);
});

test('Stage: the stage she stands on, else "Here" (listed first and picked)', () => {
  const on = fakeSp(), off = fakeSp({ g: { player: { pos: { x: 0, y: 0, z: 0 } } } });
  assert.equal(chipData(on, 'stage').v, 'Station stage');
  assert.equal(chipData(off, 'stage').v, 'Here');
  const a = pickerData(on, 'stage').sections[0].items, b = pickerData(off, 'stage').sections[0].items;
  assert.deepEqual(a.map(i => i.id), STAGES.map(s => s.id)); assert.deepEqual(a.filter(i => i.selected).map(i => i.id), ['station']);
  assert.deepEqual(b.map(i => i.id), ['here', ...STAGES.map(s => s.id)]); assert.deepEqual(b.filter(i => i.selected).map(i => i.id), ['here']);
});

test('chips show the current values (the singer being loaded already, dimmed)', () => {
  const sp = fakeSp({ dancePick: 'kpop' });
  assert.deepEqual(PICKERS.map(id => chipData(sp, id).v), ['Kotone', 'Bravo', 'Group of 4', 'K-pop', 'Station stage', 'Night', '']);
  assert.deepEqual(PICKERS.map(id => chipData(sp, id).k), ['Singer', 'Song', 'Group', 'Dance', 'Stage', 'Time', 'Settings']);
  const wait = chipData(fakeSp({ singerNext: 'nu-3', singerWait: true }), 'singer');
  assert.equal(wait.v, 'Saki'); assert.equal(wait.wait, true); assert.equal(wait.img, 'faces/nu-3.webp');
  assert.equal(chipData(fakeSp({ songs: [], songId: '', currentSong: () => null }), 'song').v, 'No songs yet');
});

test('keyboard / gamepad step: by place on the screen, reading order at a row end', () => {
  // a 3-column grid of 7 tiles (100 x 80, 10 apart) and a list of 3 rows
  const grid = Array.from({ length: 7 }, (_, i) => ({ left: (i % 3) * 110, right: (i % 3) * 110 + 100, top: Math.floor(i / 3) * 90, bottom: Math.floor(i / 3) * 90 + 80 }));
  assert.equal(navStep(grid, 0, 'right'), 1); assert.equal(navStep(grid, 1, 'down'), 4); assert.equal(navStep(grid, 4, 'up'), 1);
  assert.equal(navStep(grid, 2, 'right'), 3, 'a row end goes on to the next row');
  assert.equal(navStep(grid, 3, 'left'), 2);
  assert.equal(navStep(grid, 5, 'down'), 6, 'down from a short last row: the nearest below');
  assert.equal(navStep(grid, 6, 'down'), -1); assert.equal(navStep(grid, 0, 'up'), -1); assert.equal(navStep(grid, 0, 'left'), -1);
  const list = [0, 1, 2].map(i => ({ left: 0, right: 300, top: i * 60, bottom: i * 60 + 54 }));
  assert.equal(navStep(list, 0, 'down'), 1); assert.equal(navStep(list, 1, 'right'), 2); assert.equal(navStep(list, 2, 'down'), -1);
  assert.equal(navStep([], 0, 'down'), -1); assert.equal(navStep(list, 9, 'down'), 0, 'nothing focused: the first');
});
