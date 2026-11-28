// © 2026 Bui Cong Nguyen · solluxlabs.com
// The song library (docs/SING-AND-PLAY.md "Songs from the library"): Sing & Play's songs live in their own public repo,
// github.com/buicongnguyen/starline-songs, served by GitHub Pages from the game's own origin
// (https://buicongnguyen.github.io/starline-songs/), so Web Audio and Record take its sound like a song of the game's.
//   index.json            the catalog (version 1): per song id, ver, title, lang, instrumental, dance, mood, style, bpm,
//                         offset, duration, bytes (audio), totalBytes (all its files), gainDb, base 'songs/<id>/',
//                         files { audio, beats, lyrics, mouth, stage }, singer (whose song it is: the Night Star's show)
//   songs/<id>/<id>.<ver>.<kind>   immutable files: a new version is a new name (the service worker keeps them as they are)
// The catalog is read when Sing & Play starts (at most CATALOG.timeout; late or failed: the built-in songs only,
// content/kotone-songs.js); a song's files load only when it is performed, or when the player downloads it (the Song list:
// game/singplay/song-library.js, song-list.js). ?songsBase=<url> reads another copy (a local
// server of the songs repo), ?songsBase=off none; ?qa pages read none unless given one.
import { DANCE_STYLES } from './kotone-club.js';

export const SONGS_BASE = 'https://buicongnguyen.github.io/starline-songs/';
export const CATALOG = Object.freeze({ file: 'index.json', timeout: 4000, danceBpm: 90 });
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/, FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const finite = v => typeof v === 'number' && Number.isFinite(v);

/** Where the library is read from (a URL ending in '/'), or null: none. */
export function songsBase(params) {
  const v = params?.get?.('songsBase');
  if (v === 'off') return null;
  if (v) return /^https?:\/\/[^\s]+$/.test(v) ? (v.endsWith('/') ? v : `${v}/`) : null;
  return params?.has?.('qa') ? null : SONGS_BASE;
}

/**
 * index.json -> song entries as content/kotone-songs.js lists them (+ files, instrumental, dance, style, gainDb, remote):
 * songs only (the hum loop and anything else are left out), every id and file name checked, an instrumental without lyrics
 * or mouth (it is danced, not sung: no mic, no caption).
 */
export function catalogSongs(index, base) {
  if (!index || index.version !== 1 || !Array.isArray(index.songs) || !base) return [];
  const out = [], seen = new Set();
  for (const e of index.songs) {
    if (!e || (e.kind && e.kind !== 'song') || !ID.test(e.id || '') || seen.has(e.id) || !(finite(e.bpm) && e.bpm > 0) || !(finite(e.duration) && e.duration > 0)) continue;
    const f = e.files || {};
    if (!FILE.test(f.audio || '')) continue;
    const inst = e.instrumental === true, files = {};
    for (const k of inst ? ['beats', 'stage'] : ['beats', 'lyrics', 'mouth', 'stage']) if (FILE.test(f[k] || '')) files[k] = f[k];
    seen.add(e.id);
    out.push({
      id: e.id, title: String(e.title || e.id).slice(0, 80), base: `${base}songs/${e.id}/`, audio: f.audio, files,
      bpm: e.bpm, offset: finite(e.offset) ? e.offset : 0, duration: e.duration, mood: String(e.mood || ''),
      language: inst || !e.lang ? undefined : String(e.lang), instrumental: inst,
      dance: typeof e.dance === 'boolean' ? e.dance : e.bpm >= CATALOG.danceBpm,
      style: DANCE_STYLES.includes(e.style) ? e.style : undefined,
      gainDb: finite(e.gainDb) ? Math.max(-12, Math.min(6, e.gainDb)) : 0, bytes: finite(e.bytes) ? e.bytes : 0,
      totalBytes: finite(e.totalBytes) && e.totalBytes >= (e.bytes || 0) ? e.totalBytes : finite(e.bytes) ? e.bytes : 0, remote: true,
      ...(ID.test(e.singer || '') ? { singer: e.singer } : {}),   // (whose song it is: showSongs; 'night-star' = her show sings it)
    });
  }
  return out;
}

/** The library's songs (null when the catalog fails or takes longer than `timeout` ms). */
export async function fetchCatalog(base, { fetch: get = globalThis.fetch, timeout = CATALOG.timeout } = {}) {
  if (!base || typeof get !== 'function') return null;
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  let timer = null;
  const late = new Promise(done => { timer = setTimeout(() => { ctl?.abort(); done(null); }, timeout); });
  const got = Promise.resolve().then(() => get(base + CATALOG.file, { signal: ctl?.signal, cache: 'no-cache' }))
    .then(r => (r?.ok ? r.json() : null)).then(j => { const s = catalogSongs(j, base); return s.length ? s : null; }).catch(() => null);
  try { return await Promise.race([got, late]); } finally { clearTimeout(timer); }
}

/**
 * The built-in songs with the library's: a library song with a built-in one's id takes its place (keeping that entry's
 * own fields and translated title; the built-in one is its `fallback` when the library copy cannot load); the built-in
 * songs the library does not have come first.
 */
export function mergeSongs(builtIn, remote) {
  if (!remote?.length) return builtIn.slice();
  const own = new Map(builtIn.map(s => [s.id, s]));
  const lib = remote.map(s => (own.has(s.id) ? { ...own.get(s.id), ...s, title: own.get(s.id).title, fallback: own.get(s.id) } : s));
  return [...builtIn.filter(s => !remote.some(r => r.id === s.id)), ...lib];
}

/** A library song's file URLs, the audio first (what a download keeps: game/singplay/song-library.js); [] for a built-in
 *  song (the game's own files). */
export const songUrls = s => (s?.remote && s.audio ? [s.base + s.audio, ...Object.values(s.files || {}).map(f => s.base + f)] : []);

/** A song to dance to (bpm 90 and up, unless its entry says). */
export const songDance = s => (typeof s?.dance === 'boolean' ? s.dance : Number(s?.bpm) >= CATALOG.danceBpm);

/** The Song row's order: the dance songs, then the slow songs, then the instrumentals (the list's order inside each). */
export function songOrder(list) {
  const rank = s => (s.instrumental ? 2 : songDance(s) ? 0 : 1);
  return list.map((s, i) => [s, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(x => x[0]);
}

/** The Dance choice a song brings when it is picked: its own hint, else Cute for a slow sung song (a gentle sway, still
 *  singing into the mic), else null (the player's choice stays). */
export const songStyle = s => (DANCE_STYLES.includes(s?.style) ? s.style : s && !s.instrumental && !songDance(s) ? 'cute' : null);
