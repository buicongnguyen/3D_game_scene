// © 2026 Bui Cong Nguyen · solluxlabs.com
// The song library (content/song-catalog.js, the starline-songs repo): the catalog read and checked from a local fixture
// (no network in tests), the Song row's songs per language and their order, a song's files loaded only when it is
// performed (with the built-in copy as its fallback), an instrumental danced without the mic, and the service worker
// keeping a library song once played.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { SONGS_BASE, CATALOG, songsBase, catalogSongs, fetchCatalog, mergeSongs, songOrder, songStyle, songDance } from '../src/content/song-catalog.js';
import { KOTONE_SONGS, songsFor } from '../src/content/kotone-songs.js';
import { loadSong, SingPlay, songTitle, danceFor } from '../src/game/singplay/singplay.js';
import { createBeatClock } from '../src/game/perform/beat-clock.js';
import { planPerformance, micShown } from '../src/game/perform/plan.js';
import { SongAudio } from '../src/game/perform/performer.js';
import { DANCE_STYLES } from '../src/content/kotone-club.js';

const INDEX = JSON.parse(readFileSync('tests/fixtures/songs-index.json', 'utf8'));
const BASE = 'http://127.0.0.1:4319/';
const params = q => new URLSearchParams(q);
/** A fetch that answers from a table (url -> json object, Uint8Array, or a function), counting what was asked. */
function fakeFetch(table, { delay = 0 } = {}) {
  const asked = [];
  const f = async (url, opts) => {
    asked.push(String(url));
    if (delay) await new Promise((res, rej) => { const t = setTimeout(res, delay); opts?.signal?.addEventListener?.('abort', () => { clearTimeout(t); rej(new Error('aborted')); }); });
    const v = table[String(url)];
    if (v === undefined) return { ok: false, status: 404, json: async () => null, blob: async () => null };
    if (v instanceof Error) throw v;
    return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(v)), blob: async () => new Blob([v], { type: 'audio/x-m4a' }) };
  };
  f.asked = asked;
  return f;
}

test('where the library is read from: the songs repo on Pages, ?songsBase for a local copy, none under ?qa or with off', () => {
  assert.equal(SONGS_BASE, 'https://buicongnguyen.github.io/starline-songs/');
  assert.equal(songsBase(params('')), SONGS_BASE);
  assert.equal(songsBase(params('qa=1')), null, 'test pages never reach out unless told');
  assert.equal(songsBase(params('qa=1&songsBase=http://127.0.0.1:4319')), BASE);
  assert.equal(songsBase(params('songsBase=off')), null);
  assert.equal(songsBase(params('songsBase=javascript:alert(1)')), null);
  assert.equal(songsBase(null), SONGS_BASE);
});

test('the catalog: songs only, every id and file checked, an instrumental carries no lyrics or mouth', () => {
  const s = catalogSongs(INDEX, BASE);
  assert.deepEqual(s.map(x => x.id), ['golden-rails-en', 'wake-up-new-day', 'softly-brave', 'mo-that-xa', 'byeolkkaji-jarana', 'glow', 'smooth'], 'the hum loop and the bad rows are left out');
  const w = s.find(x => x.id === 'wake-up-new-day');
  assert.equal(w.base, `${BASE}songs/wake-up-new-day/`); assert.equal(w.audio, 'wake-up-new-day.0f0f0f0f.m4a');
  assert.deepEqual(Object.keys(w.files).sort(), ['beats', 'lyrics', 'mouth', 'stage']);
  assert.equal(w.language, 'en'); assert.equal(w.remote, true); assert.equal(w.gainDb, -1.17);
  const g = s.find(x => x.id === 'glow');
  assert.equal(g.instrumental, true); assert.equal(g.language, undefined);
  assert.deepEqual(Object.keys(g.files).sort(), ['beats', 'stage'], 'a stray lyrics file on an instrumental is ignored');
  assert.equal(s.find(x => x.id === 'byeolkkaji-jarana').style, 'kpop');
  assert.deepEqual(catalogSongs({ version: 2, songs: INDEX.songs }, BASE), [], 'an unknown catalog version: nothing');
  assert.deepEqual(catalogSongs(null, BASE), []);
});

test('the catalog fetch: at most CATALOG.timeout, null when late or failing (the built-in songs then)', async () => {
  assert.equal(CATALOG.timeout, 4000);
  const ok = fakeFetch({ [`${BASE}index.json`]: INDEX });
  assert.equal((await fetchCatalog(BASE, { fetch: ok })).length, 7);
  assert.deepEqual(ok.asked, [`${BASE}index.json`], 'only the catalog: no song file loads before it is performed');
  assert.equal(await fetchCatalog(BASE, { fetch: fakeFetch({}) }), null, '404');
  assert.equal(await fetchCatalog(BASE, { fetch: fakeFetch({ [`${BASE}index.json`]: new Error('offline') }) }), null, 'offline');
  const t0 = Date.now();
  assert.equal(await fetchCatalog(BASE, { fetch: fakeFetch({ [`${BASE}index.json`]: INDEX }, { delay: 300 }), timeout: 40 }), null, 'too slow');
  assert.ok(Date.now() - t0 < 250);
  assert.equal(await fetchCatalog(null, { fetch: ok }), null);
});

test('the Song row: the songs of the game language plus the instrumentals; dance songs, then slow, then instrumentals', () => {
  const all = mergeSongs(KOTONE_SONGS, catalogSongs(INDEX, BASE));
  const ids = lang => songOrder(songsFor(all, lang)).map(s => s.id);
  assert.deepEqual(ids('en'), ['wake-up-new-day', 'golden-rails-en', 'softly-brave', 'glow', 'smooth']);
  assert.deepEqual(ids('vi'), ['mo-that-xa', 'golden-rails-vi', 'glow', 'smooth'], 'the built-in Vietnamese Golden Rails stays when the library has none');
  assert.deepEqual(ids('ko'), ['byeolkkaji-jarana', 'glow', 'smooth'], 'Korean gets its own song');
  assert.deepEqual(ids('ja'), ids('en'), 'Japanese: the English songs');
  // without the library (offline, late): the built-in songs only, as before
  assert.deepEqual(songOrder(songsFor(mergeSongs(KOTONE_SONGS, null), 'ko')).map(s => s.id), ['golden-rails-en']);
  // a library song with a built-in id replaces it, keeps its translated title and its entry's own fields, falls back to it
  const gr = all.find(s => s.id === 'golden-rails-en');
  assert.equal(gr.remote, true); assert.equal(gr.title, KOTONE_SONGS[0].title); assert.equal(gr.fallback, KOTONE_SONGS[0]);
  assert.equal(all.filter(s => s.id === 'golden-rails-en').length, 1);
  const own = mergeSongs([{ ...KOTONE_SONGS[0], singer: 'x' }], catalogSongs(INDEX, BASE));
  assert.equal(own.find(s => s.id === 'golden-rails-en').singer, 'x');
});

test('a song brings its dance on Auto: Cute for a slow song, the catalog hint, Mixed for an unhinted dance song', () => {
  const s = catalogSongs(INDEX, BASE), by = id => s.find(x => x.id === id);
  assert.equal(songStyle(by('softly-brave')), 'cute'); assert.equal(songStyle(by('glow')), 'kpop'); assert.equal(songStyle(by('smooth')), 'hiphop');
  assert.equal(songStyle(KOTONE_SONGS[0]), 'cute', 'Golden Rails (86.7 bpm) is a slow song by the 90 bpm rule');
  assert.equal(songStyle({ bpm: 120 }), null); assert.equal(songStyle({ bpm: 70, instrumental: true }), null);
  for (const x of s) assert.ok(!x.style || DANCE_STYLES.includes(x.style));
  assert.equal(songDance({ bpm: 90 }), true); assert.equal(songDance({ bpm: 89.9 }), false); assert.equal(songDance({ bpm: 120, dance: false }), false);
  // the Dance choice: Auto follows the song (Mixed when it has no style), a picked style stays whatever the song
  assert.equal(danceFor('auto', by('softly-brave')), 'cute'); assert.equal(danceFor('auto', by('glow')), 'kpop'); assert.equal(danceFor('auto', { bpm: 120 }), 'mix');
  assert.equal(danceFor('auto', null), 'mix'); assert.equal(danceFor('hiphop', by('softly-brave')), 'hiphop'); assert.equal(danceFor('nope', by('glow')), 'kpop');
});

test('the song choice as data: songChoices (every language) / currentSong / chooseSong (any picker can host it)', () => {
  const sp = Object.create(SingPlay.prototype);
  Object.assign(sp, { perf: null, songWait: false, songId: '', dancePick: 'auto', loaded: new Map(), label() {} });
  let shown = null; sp.onSongs = c => { shown = c; };
  sp.setSongs(mergeSongs(KOTONE_SONGS, catalogSongs(INDEX, BASE)));
  assert.deepEqual(shown.map(c => c.id), ['wake-up-new-day', 'mo-that-xa', 'byeolkkaji-jarana', 'golden-rails-vi', 'golden-rails-en', 'softly-brave', 'glow', 'smooth'],
    'the whole list, every language (owner 2026-11-28): dance songs, slow songs, instrumentals');
  const c = shown[0];
  assert.deepEqual(Object.keys(c).sort(), ['bpm', 'bytes', 'dance', 'duration', 'fallback', 'id', 'instrumental', 'lang', 'remote', 'style', 'title', 'totalBytes']);
  assert.equal(c.title, 'Wake Up, New Day'); assert.equal(c.lang, 'en'); assert.equal(c.dance, true);
  assert.equal(c.bytes, 3472717); assert.equal(c.totalBytes, 3634000); assert.equal(shown.find(x => x.id === 'softly-brave').totalBytes, 3300000, 'no totalBytes: the audio');
  assert.equal(shown.find(x => x.id === 'golden-rails-en').fallback, true); assert.equal(shown.find(x => x.id === 'golden-rails-vi').remote, false);
  assert.equal(songTitle({ remote: true, title: 'Breeze' }), 'Breeze', 'a library title is shown as written');
  assert.equal(shown.find(x => x.id === 'golden-rails-en').title, 'Golden Rails', 'a built-in song keeps its own (translated) title');
  assert.equal(sp.currentSong().id, 'wake-up-new-day', "nothing picked: the first of the game's language");
  assert.equal(sp.chooseSong('softly-brave'), true); assert.equal(sp.currentSong().id, 'softly-brave'); assert.equal(sp.danceNow(), 'cute', 'a slow song brings Cute on Auto');
  assert.equal(sp.songDance(), 'cute');
  assert.equal(sp.chooseSong('mo-that-xa'), true, 'a song in another language'); assert.equal(sp.currentSong().id, 'mo-that-xa'); assert.equal(sp.songDance(), 'mix');
  assert.equal(sp.chooseSong('nope'), false); assert.equal(sp.currentSong().id, 'mo-that-xa');
  // offline: only what is on the device (library.usable) can be picked; a picked song that cannot play gives way to the
  // first of the game's language that can (a built-in one here), without forgetting the pick
  sp.library = { usable: s => !s.remote || !!s.fallback };
  assert.equal(sp.chooseSong('softly-brave'), false, 'offline, not downloaded'); assert.equal(sp.currentSong().id, 'golden-rails-en');
  assert.equal(sp.songId, 'mo-that-xa'); assert.equal(sp.chooseSong('golden-rails-vi'), true, 'built in: always');
  sp.loaded.set('softly-brave', Promise.resolve({})); assert.equal(sp.chooseSong('softly-brave'), true, 'loaded this visit: still here offline');
  sp.library = null;
  sp.perf = {}; assert.equal(sp.chooseSong('glow'), false, 'never during a song'); sp.perf = null;
  assert.equal(sp.chooseSong('glow'), true); assert.equal(sp.danceNow(), 'kpop'); assert.equal(sp.currentSong().instrumental, true);
  // a picked style is kept when the song changes (Auto is the only choice that follows the song)
  assert.equal(sp.setDance('hiphop'), true); assert.equal(sp.chooseSong('softly-brave'), true); assert.equal(sp.danceNow(), 'hiphop'); assert.equal(sp.songDance(), 'cute');
  assert.equal(sp.setDance('disco'), false); sp.perf = {}; assert.equal(sp.setDance('auto'), false, 'never during a song'); sp.perf = null;
});

test('a library song loads its versioned files only when performed, plays a blob copy, and falls back to the built-in one', async () => {
  const s = catalogSongs(INDEX, BASE), w = s.find(x => x.id === 'wake-up-new-day'), d = `${BASE}songs/wake-up-new-day/`;
  const beats = { version: 1, bpm: 105, beats: [0.0923, 0.664, 1.235, 1.807], downbeats: [0.0923], sections: [], meter: 4 };
  const f = fakeFetch({ [`${d}${w.files.beats}`]: beats, [`${d}${w.files.lyrics}`]: { version: 1, lines: [] }, [`${d}${w.files.mouth}`]: { version: 2, fps: 25, open: [0], pucker: [0] }, [`${d}${w.files.stage}`]: { sections: [] }, [`${d}${w.audio}`]: new Uint8Array([1, 2, 3, 4]) });
  const got = await loadSong(w, { fetch: f });
  assert.ok(got.url.startsWith('blob:'), got.url); assert.deepEqual(got.beats, beats); assert.equal(got.song.gainDb, -1.17);
  assert.equal(f.asked.length, 5); assert.ok(f.asked.every(u => u.startsWith(d)));
  URL.revokeObjectURL(got.url);
  // an instrumental: no lyrics or mouth asked for
  const g = s.find(x => x.id === 'glow'), gd = `${BASE}songs/glow/`, fg = fakeFetch({ [`${gd}${g.files.beats}`]: beats, [`${gd}${g.audio}`]: new Uint8Array([5]) });
  const gi = await loadSong(g, { fetch: fg });
  assert.equal(gi.lyrics, null); assert.equal(gi.mouth, null); assert.ok(!fg.asked.some(u => /lyrics|mouth/.test(u)));
  URL.revokeObjectURL(gi.url);
  assert.equal(await loadSong(w, { fetch: fakeFetch({}) }), null, 'no audio: not playable');
  // the built-in songs keep their old names (base + id.kind.json) and stream their file
  const fb = fakeFetch({ 'songs/kotone/golden-rails-en.beats.json': beats });
  const b = await loadSong(KOTONE_SONGS[0], { fetch: fb });
  assert.equal(b.url, 'songs/kotone/golden-rails-en.m4a'); assert.deepEqual(fb.asked.sort(), ['beats', 'lyrics', 'mouth', 'stage'].map(k => `songs/kotone/golden-rails-en.${k}.json`).sort());
  // SingPlay.songData: once per song, the built-in copy when the library's cannot load
  const sp = Object.create(SingPlay.prototype); sp.loaded = new Map();
  const realFetch = globalThis.fetch; globalThis.fetch = fakeFetch({ 'songs/kotone/golden-rails-en.beats.json': beats });
  try {
    const gr = mergeSongs(KOTONE_SONGS, s).find(x => x.id === 'golden-rails-en');
    const data = await sp.songData(gr);
    assert.equal(data.url, 'songs/kotone/golden-rails-en.m4a', 'library copy gone: the built-in one');
    assert.equal(await sp.songData(gr), data, 'loaded once');
  } finally { globalThis.fetch = realFetch; }
});

test('an instrumental is danced: no mic span, no sung line; the catalog gain sets the song level', () => {
  const g = catalogSongs(INDEX, BASE).find(x => x.id === 'glow');
  const clock = createBeatClock(g, {});
  for (const style of DANCE_STYLES) {
    const plan = planPerformance(g, clock, null, { style });
    assert.equal(plan.spans.length, 0, style); assert.equal(plan.lines, null);
    assert.ok(plan.blocks.length >= 3); assert.ok(plan.moments.some(m => m.id === 'bow' && !m.mic));
    for (let t = 0; t < g.duration; t += 2) assert.equal(micShown(plan, t), 0);
  }
  assert.ok(Math.abs(new SongAudio('x', null, -6).level - 0.501) < 0.001); assert.equal(new SongAudio('x', null).level, 1);
});

test('the service worker: a library song kept once played (ranges from the kept copy), the catalog network first', async () => {
  const SCOPE = 'https://buicongnguyen.github.io/3D_game_scene/', LIB = 'https://buicongnguyen.github.io/starline-songs/';
  const src = readFileSync('public/sw.js', 'utf8').replace(/^const STAMP = .*\/\/ @stamp$/m, 'const STAMP = {"build":"t","files":{},"assets":[]}; // @stamp');
  const store = new Map(), key = k => (typeof k === 'string' ? k : k.url);
  const caches = { open: async name => { if (!store.has(name)) store.set(name, new Map()); const m = store.get(name);
    return { match: async k => m.get(key(k))?.clone() || undefined, put: async (k, r) => { m.set(key(k), r); }, keys: async () => [...m.keys()].map(url => ({ url })), delete: async k => m.delete(key(k)) }; } };
  let net = 0, online = true, client = SCOPE;
  const body = new Uint8Array(100).map((_, i) => i);
  const fetch = async req => { net++; if (!online) throw new TypeError('offline'); return new Response(req.url.endsWith('index.json') ? '{"version":1}' : body, { status: 200, headers: { 'content-length': String(req.url.endsWith('index.json') ? 13 : 100), 'content-type': 'audio/mp4' } }); };
  const on = {};
  const self = { registration: { scope: SCOPE }, addEventListener: (t, fn) => { on[t] = fn; }, skipWaiting: async () => {}, clients: { get: async () => ({ url: client }), claim: async () => {} } };
  vm.runInNewContext(src, { self, caches, fetch, Request, Response, URL, Headers, navigator: { storage: { estimate: async () => ({ quota: 1e10, usage: 0 }) } }, Date, setTimeout, console });
  const ask = async (url, headers = {}) => {
    const waits = []; let p = null;
    on.fetch({ request: new Request(url, { headers }), clientId: 'c', respondWith: x => { p = x; }, waitUntil: x => waits.push(x) });
    if (!p) return null;
    const r = await p; await Promise.all(waits); return r;
  };
  const song = `${LIB}songs/glow/glow.55554444.m4a`;
  assert.equal((await ask(song)).status, 200); assert.equal(net, 1);
  assert.equal((await ask(song)).status, 200); assert.equal(net, 1, 'played again: from the kept copy');
  const part = await ask(song, { range: 'bytes=10-19' });
  assert.equal(part.status, 206); assert.deepEqual([...new Uint8Array(await part.arrayBuffer())], [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]); assert.equal(net, 1);
  assert.equal((await ask(`${LIB}index.json`)).status, 200); assert.equal(net, 2, 'the catalog asks the network');
  online = false;
  assert.equal(await (await ask(`${LIB}index.json`)).text(), '{"version":1}', 'offline: the kept catalog');
  online = true; client = `${SCOPE}?qa=1`; const n = net;
  await ask(`${LIB}songs/smooth/smooth.12121212.m4a`); assert.equal(net, n + 1); assert.ok(!store.get('starline-songs').has(`${LIB}songs/smooth/smooth.12121212.m4a`), 'test pages keep nothing');
  assert.equal(await ask('http://127.0.0.1:4319/songs/glow/glow.55554444.m4a'), null, 'another origin: left alone');
  assert.equal(await ask(`${LIB}README.md`), null, 'only the catalog and song files');
});
