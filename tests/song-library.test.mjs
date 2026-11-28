// © 2026 Bui Cong Nguyen · solluxlabs.com
// The Song list's Download / Delete (game/singplay/song-library.js, song-list.js, public/sw.js; docs/SING-AND-PLAY.md
// "Song list: Download and Delete"), all from the fixture catalog with fake caches and a fake network (no network here):
// a download keeps every file of a song in the kept cache (never evicted), a played song sits in the play cache (the
// oldest go past 120 MB) and moves to the kept one when downloaded, Delete takes a song's files out and keeps its row, a
// full device or a lost connection leaves nothing half-kept, offline only what is on the device can be picked, and the
// list as data (tabs, rows, buttons, the storage line, Download all / Stop downloads).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { catalogSongs, mergeSongs, songUrls } from '../src/content/song-catalog.js';
import { KOTONE_SONGS } from '../src/content/kotone-songs.js';
import { SongLibrary, KEPT_CACHE, PLAY_CACHE, PERSIST_KEY, keepUrl, songBytes } from '../src/game/singplay/song-library.js';
import { SONG_TABS, defaultTab, inTab, fmtSize, storageLine, libraryNote } from '../src/game/singplay/song-list.js';
import { pickerData } from '../src/game/singplay/pickers.js';
import { SingPlay } from '../src/game/singplay/singplay.js';

const INDEX = JSON.parse(readFileSync('tests/fixtures/songs-index.json', 'utf8'));
const BASE = 'http://127.0.0.1:4337/';
const SONGS = catalogSongs(INDEX, BASE);
const by = id => SONGS.find(s => s.id === id);

/** Cache Storage in memory (put can be made to fail as a full device: full = number of puts that still fit). */
function fakeCaches() {
  const store = new Map(), key = k => (typeof k === 'string' ? k : k.url);
  const api = {
    store, full: Infinity, puts: 0,
    open: async name => {
      if (!store.has(name)) store.set(name, new Map());
      const m = store.get(name);
      return {
        match: async k => m.get(key(k))?.clone(),
        put: async (k, r) => { if (api.puts >= api.full) { const e = new Error('The quota has been exceeded.'); e.name = 'QuotaExceededError'; throw e; } api.puts++; m.set(key(k), r); },
        keys: async () => [...m.keys()].map(url => ({ url })),
        delete: async k => m.delete(key(k)),
      };
    },
    has: (name, url) => !!store.get(name)?.has(url),
    urls: name => [...(store.get(name)?.keys() || [])],
  };
  return api;
}
/** The network: every file of the fixture songs (audio 3000 bytes, json 100), asked urls counted; offline throws. */
function fakeNet({ missing = [], gate = null } = {}) {
  const files = new Map();
  for (const s of SONGS) for (const u of songUrls(s)) files.set(u, new Uint8Array(u.endsWith('.m4a') ? 3000 : 100).fill(7));
  const f = async (url, opts) => {
    f.asked.push(url);
    if (f.offline) throw new TypeError('Failed to fetch');
    if (opts?.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
    const clean = url.split('?')[0], b = files.get(clean);
    if (!b || missing.includes(clean)) return new Response(null, { status: 404 });
    // a slow body (gate): one chunk, then it waits; an abort ends it as fetch does
    const body = gate ? new ReadableStream({
      start(c) { c.enqueue(b.slice(0, 1000)); opts?.signal?.addEventListener('abort', () => c.error(new DOMException('The operation was aborted.', 'AbortError'))); },
      async pull(c) { await gate.promise; c.enqueue(b.slice(1000)); c.close(); },
    }) : b;
    return new Response(body, { status: 200, headers: { 'content-type': clean.endsWith('.m4a') ? 'audio/mp4' : 'application/json', 'content-length': String(b.byteLength) } });
  };
  f.asked = []; f.offline = false;
  return f;
}
const memStore = (o = {}) => ({ o, getItem: k => (k in o ? o[k] : null), setItem: (k, v) => { o[k] = String(v); } });
const fakeStorage = (free = 5e9) => ({ persisted: 0, quota: free + 1e8, usage: 1e8, estimate: async function () { return { quota: this.quota, usage: this.usage }; }, persist: async function () { this.persisted++; return true; } });
function lib(o = {}) {
  const env = { caches: fakeCaches(), fetch: fakeNet(o.net), storage: fakeStorage(o.free), store: memStore(), online: true, changes: 0 };
  const L = new SongLibrary({ caches: env.caches, fetch: env.fetch, storage: env.storage, store: env.store, online: () => env.online, onChange: () => { env.changes++; } });
  return { L, env };
}

test('Download keeps every file of a song (audio first, asked with ?keep=1) in the kept cache; Delete takes them out, the row stays', async () => {
  const { L, env } = lib();
  await L.scan(SONGS);
  const w = by('wake-up-new-day');
  assert.equal(L.state(w), 'none'); assert.equal(L.state(KOTONE_SONGS[0]), 'builtin');
  assert.equal(songBytes(w), 3634000, 'the catalog size of all its files'); assert.equal(songBytes(by('softly-brave')), 3300000, 'no totalBytes: the audio');
  assert.equal(L.download(w), true);
  assert.equal(L.state(w), 'run', 'it starts at once'); assert.equal(L.download(w), false, 'not twice');
  await L.idle();
  assert.equal(L.state(w), 'kept'); assert.equal(L.error, null);
  const urls = songUrls(w);
  assert.equal(urls.length, 5); assert.ok(urls[0].endsWith('.m4a'), 'audio first');
  assert.deepEqual(env.fetch.asked, urls.map(keepUrl), 'each file once, marked for the worker (?keep=1)');
  assert.deepEqual(env.caches.urls(KEPT_CACHE).sort(), [...urls].sort(), 'kept under the clean names (what the game and the worker ask for)');
  const a = await (await env.caches.open(KEPT_CACHE)).match(urls[0]);
  assert.equal(a.headers.get('content-type'), 'audio/mp4'); assert.equal(a.headers.get('content-length'), '3000'); assert.equal((await a.arrayBuffer()).byteLength, 3000);
  assert.equal(env.storage.persisted, 1, 'the first download asks the browser to keep the site storage'); assert.equal(env.store.o[PERSIST_KEY], '1');
  assert.deepEqual(L.summary(), { n: 1, bytes: 3634000 });
  // the game reads it from the device, with no network
  const n = env.fetch.asked.length, get = L.fetcher();
  assert.equal((await (await get(urls[0])).arrayBuffer()).byteLength, 3000); assert.equal(env.fetch.asked.length, n);
  await get(`${BASE}index.json`); assert.equal(env.fetch.asked.length, n + 1, 'anything else: the network');
  // a second download: no second persist request
  L.download(by('glow')); await L.idle();
  assert.equal(L.state(by('glow')), 'kept'); assert.equal(env.storage.persisted, 1);
  // Delete: the files go, the song stays listed and can be downloaded again
  assert.equal(await L.remove(w), true);
  assert.equal(L.state(w), 'none'); assert.equal(env.caches.urls(KEPT_CACHE).filter(u => u.includes('wake-up')).length, 0);
  assert.equal(L.songs.some(s => s.id === w.id), true);
  assert.equal(await L.remove(KOTONE_SONGS[0]), false, 'built-in songs are part of the game');
  // a scan reads the states back from the caches (a new visit)
  const again = new SongLibrary({ caches: env.caches, fetch: env.fetch, storage: env.storage, store: env.store });
  await again.scan(SONGS);
  assert.equal(again.state(by('glow')), 'kept'); assert.equal(again.state(w), 'none');
});

test('a song played lately moves from the play cache: no network, one copy on the device', async () => {
  const { L, env } = lib();
  const s = by('softly-brave'), urls = songUrls(s), play = await env.caches.open(PLAY_CACHE);
  for (const u of urls) await play.put(u, new Response(new Uint8Array(50), { headers: { 'content-type': 'application/json', 'content-length': '50' } }));
  await L.scan(SONGS);
  assert.equal(L.state(s), 'cached');
  env.online = false;
  assert.equal(L.usable(s), true, 'offline: a played song can still be sung');
  assert.equal(L.download(s), true, 'offline, but every file is on the device'); await L.idle();
  assert.equal(L.state(s), 'kept'); assert.equal(env.fetch.asked.length, 0);
  assert.deepEqual(env.caches.urls(PLAY_CACHE).filter(u => urls.includes(u)), [], 'the play copy is gone');
});

test('no room: refused before it starts, or stopped when the device fills up, nothing half-kept, the queue stops', async () => {
  const small = lib({ free: 10 * 1048576 });
  await small.L.scan(SONGS);
  small.L.download(by('wake-up-new-day')); await small.L.idle();
  assert.equal(small.L.state(by('wake-up-new-day')), 'none');
  assert.deepEqual(small.L.error, { kind: 'full', id: 'wake-up-new-day', title: 'Wake Up, New Day' });
  assert.equal(small.env.fetch.asked.length, 0, 'not even started: the room left would be under 20 MB');
  assert.match(libraryNote(small.L), /^Not enough room on this device for Wake Up, New Day\. Delete a downloaded song to make room\.$/);
  // the browser refuses mid-way (QuotaExceededError): the files kept so far go, and the songs queued after it too
  const { L, env } = lib();
  await L.scan(SONGS);
  env.caches.full = 2;
  L.download(by('wake-up-new-day')); L.download(by('glow'));
  assert.equal(L.state(by('glow')), 'wait');
  await L.idle();
  assert.equal(L.error.kind, 'full'); assert.equal(L.state(by('wake-up-new-day')), 'none'); assert.equal(L.state(by('glow')), 'none', 'the queue stopped');
  assert.deepEqual(env.caches.urls(KEPT_CACHE), [], 'nothing half-kept');
  assert.equal(L.busy(), false);
  // room again (a song deleted): it downloads
  env.caches.full = Infinity; L.download(by('glow')); await L.idle();
  assert.equal(L.state(by('glow')), 'kept'); assert.equal(L.error, null);
});

test('a lost connection or Stop: the partial files go, the song can be downloaded again', async () => {
  const w = by('wake-up-new-day'), urls = songUrls(w);
  const { L, env } = lib({ net: { missing: [urls[2]] } });
  await L.scan(SONGS);
  L.download(w); await L.idle();
  assert.equal(L.state(w), 'none'); assert.equal(L.error.kind, 'net'); assert.deepEqual(env.caches.urls(KEPT_CACHE), []);
  assert.equal(libraryNote(L), "Wake Up, New Day couldn't be downloaded: check the connection.");
  // Stop in the middle of the audio
  let open; const gate = { promise: new Promise(r => { open = r; }) };
  const slow = lib({ net: { gate } });
  await slow.L.scan(SONGS);
  slow.L.download(w); slow.L.download(by('glow'));
  await new Promise(r => setTimeout(r, 20));
  assert.equal(slow.L.state(w), 'run'); assert.ok(slow.L.progress(w) > 0 && slow.L.progress(w) < 0.01, `${slow.L.progress(w)}`);
  assert.equal(slow.L.cancel('glow'), true, 'out of the queue'); assert.equal(slow.L.state(by('glow')), 'none');
  slow.L.cancel(w.id); open();
  await slow.L.idle();
  assert.equal(slow.L.state(w), 'none'); assert.equal(slow.L.error, null, 'a stop is no error'); assert.deepEqual(slow.env.caches.urls(KEPT_CACHE), []);
  // Download all then Stop downloads
  const all = lib({ net: { gate: { promise: new Promise(() => {}) } } });
  await all.L.scan(SONGS);
  assert.equal(all.L.downloadAll(SONGS.filter(s => inTab({ lang: s.language, instrumental: s.instrumental }, 'en'))), 3);
  assert.equal(all.L.busy(), true); all.L.cancelAll(); await all.L.idle();
  assert.equal(all.L.busy(), false); assert.deepEqual(all.env.caches.urls(KEPT_CACHE), []);
});

test('offline: only what is on the device can be sung; downloads wait for the connection', async () => {
  const { L, env } = lib();
  await L.scan(SONGS);
  L.download(by('glow')); await L.idle();
  env.online = false;
  const [gr] = mergeSongs(KOTONE_SONGS, SONGS).filter(s => s.id === 'golden-rails-en');
  assert.equal(L.usable(by('softly-brave')), false); assert.equal(L.usable(by('glow')), true, 'downloaded');
  assert.equal(L.usable(KOTONE_SONGS[1]), true, 'built in'); assert.equal(L.usable(gr), true, 'a library copy of a built-in song: the built-in one plays');
  assert.equal(L.download(by('softly-brave')), false); assert.equal(L.error.kind, 'net');
  assert.equal(libraryNote({ ...L, error: null, online: () => false }), 'Offline: the downloaded songs can be sung.');
  env.online = true; assert.equal(L.usable(by('softly-brave')), true);
});

test('the Song list as data: tabs, each row with its own button, the storage line, Download all and Stop downloads', async () => {
  assert.deepEqual(SONG_TABS, ['all', 'en', 'vi', 'ko', 'inst']);
  assert.deepEqual(['en', 'vi', 'ko', 'ja'].map(defaultTab), ['en', 'vi', 'ko', 'en'], "the game's language (Japanese: English)");
  assert.equal(fmtSize(3634000), '3.5\u00a0MB'); assert.equal(fmtSize(150 * 1048576), '150\u00a0MB'); assert.equal(fmtSize(2.5 * 1073741824), '2.5\u00a0GB');
  let open; const gate = { promise: new Promise(r => { open = r; }) };
  const { L, env } = lib({ net: { gate } });
  const sp = Object.create(SingPlay.prototype);
  Object.assign(sp, { perf: null, songWait: false, songId: '', dancePick: 'auto', loaded: new Map(), label() {}, songTab: null, library: L });
  sp.setSongs(mergeSongs(KOTONE_SONGS, SONGS)); await L.scan();
  const rows = d => d.sections.flatMap(s => s.items), row = (d, id) => rows(d).find(i => i.id === id);
  const inTabData = t => { const was = sp.songTab; sp.songTab = t; try { return pickerData(sp, 'song'); } finally { sp.songTab = was; } };
  let d = pickerData(sp, 'song');
  assert.equal(d.tab, 'en');
  assert.deepEqual(d.tabs.map(t => [t.id, t.n]), [['all', 8], ['en', 3], ['vi', 2], ['ko', 1], ['inst', 2]], 'every song of the catalog is listed (all 8 of the fixture)');
  assert.deepEqual(rows(d).map(i => i.id), ['wake-up-new-day', 'golden-rails-en', 'softly-brave']);
  assert.deepEqual(rows(inTabData('vi')).map(i => i.id), ['mo-that-xa', 'golden-rails-vi']);
  const w = row(d, 'wake-up-new-day');
  assert.equal(w.sub, 'EN · 105 bpm · Mixed · 2:47 · 3.5\u00a0MB'); assert.equal(w.state, 'none'); assert.equal(w.line, '');
  assert.deepEqual(w.act, { kind: 'download', text: 'Download', aria: 'Download Wake Up, New Day (3.5\u00a0MB)', disabled: false });
  assert.equal(w.selected, true, "nothing picked: the first of the game's language");
  assert.match(d.storage, /^Nothing downloaded yet · free about 4\.7\u00a0GB$/);
  assert.deepEqual(d.all, { kind: 'all', n: 3, text: 'Download all 3 (8.3\u00a0MB)' });
  assert.equal(inTabData('all').all, null, 'not on All: one language (or the instrumentals) at a time');
  // downloading: the % on the row's own button (a tap stops it), the next one waiting, the header's Stop
  sp.downloadSong('wake-up-new-day'); sp.downloadSong('softly-brave');
  await new Promise(r => setTimeout(r, 20));
  d = pickerData(sp, 'song');
  assert.equal(row(d, 'wake-up-new-day').state, 'run'); assert.equal(row(d, 'wake-up-new-day').act.kind, 'cancel'); assert.equal(row(d, 'wake-up-new-day').act.text, '0 %');
  assert.equal(row(d, 'wake-up-new-day').line, 'Downloading 0 %');
  assert.deepEqual([row(d, 'softly-brave').line, row(d, 'softly-brave').act.text], ['Waiting to download', 'Waiting']);
  assert.deepEqual(d.all, { kind: 'stop', text: 'Stop downloads' });
  open(); await L.idle();
  d = pickerData(sp, 'song');
  assert.equal(row(d, 'wake-up-new-day').line, '✓ Downloaded');
  assert.deepEqual(row(d, 'wake-up-new-day').act, { kind: 'delete', text: 'Delete', aria: 'Delete Wake Up, New Day from this device', disabled: false });
  assert.equal(d.storage, `Downloaded: 2 songs · ${fmtSize(3634000 + 3300000)} · free about 4.7\u00a0GB`);
  assert.deepEqual(d.all, { kind: 'all', n: 1, text: 'Download all 1 (1.7\u00a0MB)' });
  assert.equal(storageLine(null), '');
  // while it is sung: "Playing now", and it cannot be deleted
  sp.perf = { data: { song: { id: 'wake-up-new-day' } } };
  d = pickerData(sp, 'song');
  assert.equal(row(d, 'wake-up-new-day').line, 'Playing now'); assert.equal(row(d, 'wake-up-new-day').act.disabled, true);
  assert.equal(await sp.deleteSong('wake-up-new-day'), false);
  sp.perf = null;
  // offline: the rest "Needs internet" (shown, not pickable, no Download), the downloaded and built-in ones stay
  env.online = false;
  d = pickerData(sp, 'song');
  assert.deepEqual([row(d, 'golden-rails-en').state, row(d, 'golden-rails-en').disabled], ['none', false], 'a built-in fallback: still sung');
  const mo = row(inTabData('vi'), 'mo-that-xa');
  assert.deepEqual([mo.state, mo.line, mo.disabled, mo.act], ['offline', 'Needs internet', true, null]);
  assert.equal(d.all, null); assert.equal(d.note, 'Offline: the downloaded songs can be sung.');
  assert.equal(sp.chooseSong('mo-that-xa'), false); assert.equal(sp.chooseSong('softly-brave'), true, 'downloaded');
  env.online = true;
  // Delete: the row stays, its button is Download again
  assert.equal(await sp.deleteSong('softly-brave'), true);
  d = pickerData(sp, 'song');
  assert.equal(row(d, 'softly-brave').act.kind, 'download'); assert.equal(row(d, 'softly-brave').line, '');
  assert.equal(sp.downloadAll('ko'), 1); await L.idle(); assert.equal(L.state(by('byeolkkaji-jarana')), 'kept');
});

test('the service worker: a downloaded song is served from the kept cache and never evicted; played songs go oldest first past 120 MB', async () => {
  const SCOPE = 'https://buicongnguyen.github.io/3D_game_scene/', LIB = 'https://buicongnguyen.github.io/starline-songs/';
  const src = readFileSync('public/sw.js', 'utf8').replace(/^const STAMP = .*\/\/ @stamp$/m, 'const STAMP = {"build":"t","files":{},"assets":[]}; // @stamp');
  assert.match(src, new RegExp(`const SONGS_KEPT = \`\\$\\{PREFIX\\}songs-kept\``), 'the kept cache name matches song-library.js');
  assert.equal(KEPT_CACHE, 'starline-songs-kept'); assert.equal(PLAY_CACHE, 'starline-songs');
  const C = fakeCaches();
  let net = 0;
  const big = 50 * 1048576, body = new Uint8Array(100).map((_, i) => i);
  const fetch = async req => { net++; return new Response(body, { status: 200, headers: { 'content-length': String(req.url.includes('/big') ? big : 100), 'content-type': 'audio/mp4' } }); };
  const on = {};
  const self = { registration: { scope: SCOPE }, addEventListener: (t, fn) => { on[t] = fn; }, skipWaiting: async () => {}, clients: { get: async () => ({ url: SCOPE }), claim: async () => {} } };
  vm.runInNewContext(src, { self, caches: C, fetch, Request, Response, URL, Headers, navigator: { storage: { estimate: async () => ({ quota: 1e10, usage: 0 }) } }, Date, setTimeout, console });
  const ask = async (url, headers = {}) => {
    const waits = []; let p = null;
    on.fetch({ request: new Request(url, { headers }), clientId: 'c', respondWith: x => { p = x; }, waitUntil: x => waits.push(x) });
    const r = await p; await Promise.all(waits); return r;
  };
  // a downloaded song (the page wrote it): answered from the kept cache, ranges too, no network
  const kept = `${LIB}songs/glow/glow.55554444.m4a`;
  await (await C.open(KEPT_CACHE)).put(kept, new Response(body, { headers: { 'content-type': 'audio/mp4', 'content-length': '100' } }));
  assert.equal((await ask(kept)).status, 200); assert.equal(net, 0);
  const part = await ask(kept, { range: 'bytes=0-9' });
  assert.equal(part.status, 206); assert.deepEqual([...new Uint8Array(await part.arrayBuffer())], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]); assert.equal(net, 0);
  // a download's request (?keep=1): fetched, handed to the page, not stored by the worker
  const dl = `${LIB}songs/smooth/smooth.12121212.m4a`;
  await ask(keepUrl(dl)); assert.equal(net, 1); assert.equal(C.has(PLAY_CACHE, dl), false);
  // a played song: kept in the play cache; a download of it then is answered from there
  await ask(dl); assert.equal(net, 2); assert.equal(C.has(PLAY_CACHE, dl), true);
  await ask(keepUrl(dl)); assert.equal(net, 2, 'from the play cache: no network');
  // played songs pass 120 MB: the oldest go first; the kept cache and the catalog are never touched
  await ask(`${LIB}index.json`);
  for (const k of ['a', 'b', 'c']) await ask(`${LIB}songs/big${k}/big${k}.00000000.m4a`);
  const left = C.urls(PLAY_CACHE);
  assert.ok(!left.includes(dl), 'the oldest played song went'); assert.ok(!left.includes(`${LIB}songs/biga/biga.00000000.m4a`));
  assert.ok(left.includes(`${LIB}songs/bigc/bigc.00000000.m4a`) && left.includes(`${LIB}index.json`));
  assert.deepEqual(C.urls(KEPT_CACHE), [kept], 'the downloaded song stays');
});
