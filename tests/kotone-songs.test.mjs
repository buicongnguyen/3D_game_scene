// Kotone's song "Golden Rails" (English and Vietnamese) and her hum loop: the files are there and in budget, their data
// reads the way game/perform/ and actors/face.js read it, the song follows the game's language, and the hum's rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { KOTONE_SONGS, KOTONE_HUM, songsFor } from '../src/content/kotone-songs.js';
import { createBeatClock } from '../src/game/perform/beat-clock.js';
import { planPerformance } from '../src/game/perform/plan.js';
import { Face } from '../src/actors/face.js';
import { HUM, humGain, humFormat, humAllowed, humPlace, KotoneHum } from '../src/game/kotone-hum.js';
import { TOTAL_SONG_BYTES } from './asset-contracts.mjs';
import { stampTable } from '../scripts/stamp-sw.mjs';

const PUB = 'public/';
const json = f => JSON.parse(readFileSync(PUB + f, 'utf8'));
const dataOf = s => Object.fromEntries(['beats', 'lyrics', 'mouth'].map(k => [k, json(`${s.base}${s.id}.${k}.json`)]));

test('her songs: one in English, one in Vietnamese; Korean and Japanese hear the English one', () => {
  assert.equal(KOTONE_SONGS.length, 2);
  assert.deepEqual(songsFor(KOTONE_SONGS, 'en').map(s => s.id), ['golden-rails-en']);
  assert.deepEqual(songsFor(KOTONE_SONGS, 'vi').map(s => s.id), ['golden-rails-vi']);
  assert.deepEqual(songsFor(KOTONE_SONGS, 'ko').map(s => s.id), ['golden-rails-en']);
  assert.deepEqual(songsFor(KOTONE_SONGS, 'ja').map(s => s.id), ['golden-rails-en']);
  const extra = { id: 'test', base: 'x/' };                          // a test page's ?kotoneSong= goes with every language
  assert.deepEqual(songsFor([...KOTONE_SONGS, extra], 'vi').map(s => s.id), ['golden-rails-vi', 'test']);
  assert.deepEqual(songsFor([{ id: 'both', language: 'en+vi' }], 'vi').map(s => s.id), ['both']);
});

test('the song files are there, read the way the performer reads them, and the plan follows the song', () => {
  for (const s of KOTONE_SONGS) {
    assert.ok(existsSync(PUB + s.base + s.audio), s.audio);
    const { beats, lyrics, mouth } = dataOf(s);
    // beats.json v1: the clock takes its grid, bpm and sections from it
    const clock = createBeatClock(s, { beats, lyrics });
    assert.equal(clock.info.source, 'beats', s.id);
    assert.ok(Math.abs(clock.info.bpm - s.bpm) < 0.5, `${s.id} bpm ${clock.info.bpm}`);
    assert.ok(Math.abs(clock.info.offset - s.offset) < 0.01, `${s.id} offset ${clock.info.offset}`);
    assert.equal(clock.duration, s.duration);
    assert.deepEqual(clock.sections.map(x => x.kind), ['intro', 'verse', 'prechorus', 'chorus', 'verse', 'chorus', 'outro']);
    // lyrics.json: lines with word timings, in time order, inside the song
    assert.ok(lyrics.lines.length >= 15);
    for (const l of lyrics.lines) { assert.ok(l.e > l.t && l.e <= s.duration, l.text); assert.ok(l.words?.length, l.text); }
    // mouth.json v2 at 25 fps for the whole song (open / pucker 0..scale)
    assert.equal(mouth.version, 2); assert.equal(mouth.fps, 25);
    assert.ok(Math.abs(mouth.open.length / 25 - s.duration) < 0.2, `${s.id} mouth ${mouth.open.length} frames`);
    assert.equal(mouth.pucker.length, mouth.open.length);
    assert.ok(Math.max(...mouth.open) <= mouth.scale && Math.max(...mouth.open) > mouth.scale * 0.5);
    // the plan: lively (the mood), a dance block from every section, the mic on the sung lines, a closing bow
    const plan = planPerformance(s, clock, lyrics);
    assert.equal(plan.kind, 'lively');
    for (const sec of clock.sections) assert.ok(plan.blocks.some(b => b.section === sec.index), `${s.id} ${sec.kind} has a dance`);
    assert.ok(plan.blocks.some(b => b.kind === 'chorus' && b.tier === 'big'), `${s.id}: a big chorus`);
    assert.ok(plan.spans.length >= 1 && plan.spans[0].t0 < lyrics.lines[1].t && plan.moments.some(m => m.id === 'bow'));
    // face.sing(): the lips open on a sung line and close in the gaps (sampled from her real mouth curves)
    const at = t => Face.prototype.songMouth.call({ song: { track: mouth, clock: () => t } })[0];
    const chorus = lyrics.lines.find(l => /Chorus/.test(l.section || ''));
    let sung = 0; for (let t = chorus.t; t < chorus.e; t += 0.04) sung = Math.max(sung, at(t));
    assert.ok(sung > 0.5, `${s.id} mouth open ${sung.toFixed(2)} in the chorus`);
    // ... and shut where the voice is (the curves come from the vocal stem: the Vietnamese take vocalises between its lyric
    // lines, so the gaps in lyrics.json are not all silent), at least over the instrumental close
    let quiet = 0, n = 0; for (let t = 0; t < s.duration; t += 0.04, n++) if (at(t) < 0.1) quiet++;
    assert.ok(quiet / n > 0.03 && quiet / n < 0.8, `${s.id} mouth shut ${(100 * quiet / n).toFixed(0)} % of the song`);
    for (let t = s.duration - 2; t < s.duration; t += 0.04) assert.ok(at(t) < 0.1, `${s.id} mouth shut at the end (${t.toFixed(2)} s)`);
  }
});

test('the songs fit their budget; no instrumental is shipped; the service worker never stores them', () => {
  const walk = d => readdirSync(d).flatMap(f => (statSync(path.join(d, f)).isDirectory() ? walk(path.join(d, f)) : [path.join(d, f)]));
  const files = walk(PUB + 'songs'), total = files.reduce((n, f) => n + statSync(f).size, 0);
  assert.ok(total <= TOTAL_SONG_BYTES, `${(total / 1e6).toFixed(2)} MB of songs > ${TOTAL_SONG_BYTES / 1e6} MB`);
  assert.ok(!files.some(f => /inst/.test(f)), 'no instrumentals');
  // stamp-sw's table lists models, icons, portraits, zones and assets only: songs/ is not cached by the worker
  const dist = mkdtempSync(path.join(tmpdir(), 'starline-sw-'));
  try {
    mkdirSync(path.join(dist, 'songs/kotone'), { recursive: true }); mkdirSync(path.join(dist, 'models'));
    writeFileSync(path.join(dist, 'index.html'), '<html></html>'); writeFileSync(path.join(dist, 'songs/kotone/a.m4a'), 'x'); writeFileSync(path.join(dist, 'models/a.glb'), 'x');
    const t = stampTable(dist);
    assert.deepEqual(Object.keys(t.files), ['models/a.glb']);
  } finally { rmSync(dist, { recursive: true, force: true }); }
});

test('the hum loop: both files, loop points inside them, a mouth curve one loop long', () => {
  const H = KOTONE_HUM;
  for (const f of [H.ogg, H.m4a]) assert.ok(statSync(PUB + H.base + f).size > 100_000, f);
  const mouth = json(`${H.base}${H.id}.mouth.json`), beats = json(`${H.base}${H.id}.beats.json`), len = H.loopEnd - H.loopStart;
  assert.ok(H.loopStart > 0 && Math.abs(len - beats.duration) < 0.01, `loop ${len} vs ${beats.duration}`);
  assert.ok(Math.abs(mouth.open.length / mouth.fps - len) < 0.1, `${mouth.open.length} frames`);
  assert.equal(beats.downbeats.length, HUM.bars);
});

test('the hum: when she may hum, how loud, which file, where it is in the loop', () => {
  const ok = { audio: true, voicesOff: false, music: 0.55, hour: 10, show: false, hushed: false, visible: true, walking: true, dist: 6 };
  assert.ok(humAllowed(ok));
  for (const [k, v] of Object.entries({ audio: false, voicesOff: true, music: 0, hour: 17.2, show: true, hushed: true, visible: false, walking: false, dist: 15.5 })) {
    assert.ok(!humAllowed({ ...ok, [k]: v }), k);
  }
  assert.ok(!humAllowed({ ...ok, hour: 5.5 }));
  assert.equal(humGain(2), 1); assert.equal(humGain(HUM.near), 0); assert.ok(humGain(9) > 0.2 && humGain(9) < 0.8);
  assert.equal(humFormat(t => (/ogg/.test(t) ? 'probably' : '')), 'ogg');
  assert.equal(humFormat(t => (/mp4/.test(t) ? 'maybe' : '')), 'm4a');
  assert.equal(humFormat(null), 'm4a');
  const len = KOTONE_HUM.loopEnd - KOTONE_HUM.loopStart;
  assert.ok(Math.abs(humPlace(4, 1).t - (len / 2 + 1)) < 1e-9);
  assert.ok(humPlace(4, len * 0.6).t < len * 0.2, 'past the seam the mouth goes on from the loop start');
  assert.ok(!humPlace(0, len - 1).done && humPlace(0, len - 0.5).done, 'one loop cycle at most');
});

test('the hum in Town Life: one walk in three, never by night, in the show, in dialogue or with Voices off', () => {
  // a fake valley: Web Audio nodes that record what was asked of them
  const nodes = [];
  const param = () => ({ value: 0, cancelScheduledValues() {}, setValueAtTime(v) { this.value = v; }, setTargetAtTime(v) { this.target = v; } });
  const ctx = { state: 'running', currentTime: 0, createBufferSource: () => { const n = { started: null, stopped: null, connect() {}, disconnect() {}, start(t, o) { this.started = [t, o]; }, stop(t) { this.stopped = t; } }; nodes.push(n); return n; }, createGain: () => ({ gain: param(), connect() {}, disconnect() {} }) };
  const holds = new Set(), audio = { ctx, music: {}, musicVol: 0.55, holdMusic: (k, on) => (on ? holds.add(k) : holds.delete(k)) };
  const face = { song: null, sing(t, c) { this.song = t ? { clock: c } : null; } };
  const n = { pos: { x: 0, z: 0 }, path: null, visible: true, far: false, face };
  const it = { p: { id: 'kotone' }, n, cmd: null };
  const voice = { mode: 'blips', muted: false };
  const town = { people: [it], show: { on: () => false }, g: { audio, player: { pos: { x: 5, z: 0 } }, paused: false }, d: { ui: { voice } } };
  let dice = 0.1; const hum = new KotoneHum(town, { rand: () => dice });
  hum.buf = {}; hum.mouth = { open: [1], fps: 25 }; hum.loading = Promise.resolve(true);
  const walk = () => { it.cmd = { type: 'walk' }; n.path = [[50, 0]]; };
  const step = (hour, k = 10) => { for (let i = 0; i < k; i++) { ctx.currentTime += 0.1; n.pos.x += n.path ? 0.1 : 0; hum.update(0.1, hour, false); } };
  walk(); step(10);
  assert.ok(hum.on, 'hums on a day walk with Mika near');
  assert.ok(holds.has('kotone-hum') && face.song && n.humming);
  const src = nodes.at(-1), bar = (src.started[1] - KOTONE_HUM.loopStart) / ((KOTONE_HUM.loopEnd - KOTONE_HUM.loopStart) / 8);
  assert.ok(HUM.phrases.includes(Math.round(bar)), `starts on a phrase (bar ${bar})`);
  n.path = null; step(10, 3);
  assert.ok(!hum.on && src.stopped !== null && !face.song && !holds.size, 'stops when she stops walking');
  walk(); step(10);
  assert.ok(!hum.on, 'rests between hums');
  hum.restT = 0; walk(); dice = 0.9; step(10);
  assert.ok(!hum.on, 'two walks in three stay quiet');
  dice = 0.1; walk(); step(19);
  assert.ok(!hum.on, 'not at night');
  walk(); voice.mode = 'off'; step(10);
  assert.ok(!hum.on, 'not with Voices off');
  voice.mode = 'blips'; walk(); town.d.busy = 1; step(10);
  assert.ok(!hum.on, 'not in dialogue');
  town.d.busy = 0; walk(); step(10);
  assert.ok(hum.on);
  town.g.player.pos.x = n.pos.x + 20; step(10, 2);
  assert.ok(!hum.on, 'stops when Mika walks off');
});
