// © 2026 Bui Cong Nguyen · solluxlabs.com
// The song library on this device (docs/SING-AND-PLAY.md "Song list: Download and Delete"). Owner, 2026-11-28: "Add the
// full list of songs: if I want, I press Download and it downloads; if memory is full I can delete a song (it stays in
// the list)." Two caches, both read by the service worker (public/sw.js) and by the page itself (so a downloaded song
// plays where no worker runs: the dev server, ?qa and ?nosw pages):
//   starline-songs-kept   Download puts a song's files here (all of them, audio first). Never emptied by the worker: only
//                         Delete (or Settings' "Clear downloaded game data") takes a song out.
//   starline-songs        the worker keeps a song's files here when it is played without a download; the oldest go once
//                         the songs in it pass 120 MB (sw.js SONGS_MAX_TOTAL). A download moves a song out of it.
// A download asks for each file with ?keep=1: the worker answers from the play cache when the song is in it (no network)
// and stores nothing itself; this module writes the kept copy and then drops the play copy. Files are immutable (their
// names carry the song's version), so a kept copy never goes stale. The first download asks the browser once to keep
// this site's storage (navigator.storage.persist). No DOM here: song-list.js shows it.
import { songUrls as urlsOf } from '../../content/song-catalog.js';

export const KEPT_CACHE = 'starline-songs-kept';   // (sw.js SONGS_KEPT)
export const PLAY_CACHE = 'starline-songs';        // (sw.js SONGS)
export const KEEP_PARAM = 'keep';                  // (sw.js: a download's request, stored by the page, not the worker)
export const PERSIST_KEY = 'starline:songs:persistAsked';
/** Room left after a download (MB): a download that would leave less is refused as "full" before it starts. */
export const SPARE_MB = 20;
const MB = 1048576;
const isFull = e => e?.name === 'QuotaExceededError' || e?.code === 22 || /quota/i.test(String(e?.message || ''));

/** A library song's file URLs, audio first (content/song-catalog.js songUrls). [] for a built-in song. */
export const songUrls = urlsOf;
/** The URL a download asks for (the worker knows it by ?keep=1). */
export const keepUrl = url => `${url}${url.includes('?') ? '&' : '?'}${KEEP_PARAM}=1`;
/** A song's size on the device (bytes): all its files when the catalog says, else its audio. */
export const songBytes = s => (Number(s?.totalBytes) > 0 ? Number(s.totalBytes) : Number(s?.bytes) > 0 ? Number(s.bytes) : 0);

export class SongLibrary {
  /**
   * env (tests pass their own): caches, fetch, storage (navigator.storage), online () -> bool, store (localStorage),
   * onChange () (any state changed: a scan, a download's progress, a delete, the network).
   */
  constructor({ caches = globalThis.caches, fetch = globalThis.fetch?.bind(globalThis), storage = globalThis.navigator?.storage, online = () => globalThis.navigator?.onLine !== false, store = globalThis.localStorage, onChange = null } = {}) {
    Object.assign(this, { caches, get: fetch, storage, isOnline: online, store, onChange });
    this.kept = new Set(); this.cached = new Set();   // song ids whose every file is in the kept / play cache
    this.jobs = new Map();    // id -> { song, got, total, state: 'wait' | 'run', ctl }
    this.queue = []; this.running = false; this.error = null;   // error: { kind: 'full' | 'net' | 'storage', id, title } (the last one)
    this.estimate = null;     // { quota, usage } from navigator.storage.estimate (null: not known)
    this.songs = []; this.scanned = false; this.ticked = 0; this.waiters = [];
  }

  get ok() { return !!this.caches && typeof this.caches.open === 'function'; }
  online() { try { return this.isOnline() !== false; } catch { return true; } }
  changed(now = false) {
    // progress comes many times a second: at most 8 updates a second (the end of a download always shows)
    const t = Date.now();
    if (!now && t - this.ticked < 125) return;
    this.ticked = t; this.onChange?.();
  }

  /** The library songs (remote) the list shows; their states are read from the caches. */
  async scan(songs = this.songs) {
    this.songs = songs.filter(s => s?.remote);
    if (!this.ok) { this.scanned = true; this.changed(true); return; }
    const has = async name => { try { const c = await this.caches.open(name); return new Set((await c.keys()).map(r => r.url)); } catch { return new Set(); } };
    const [k, p] = await Promise.all([has(KEPT_CACHE), has(PLAY_CACHE)]);
    const all = (set, s) => { const u = songUrls(s); return u.length > 0 && u.every(x => set.has(x)); };
    this.kept = new Set(this.songs.filter(s => all(k, s)).map(s => s.id));
    this.cached = new Set(this.songs.filter(s => !this.kept.has(s.id) && all(p, s)).map(s => s.id));
    this.scanned = true;
    await this.usage();
    this.changed(true);
  }

  /** navigator.storage.estimate -> this.estimate ({ quota, usage }) or null. */
  async usage() {
    try { const e = await this.storage?.estimate?.(); this.estimate = e && Number.isFinite(e.quota) ? { quota: e.quota, usage: e.usage || 0 } : null; } catch { this.estimate = null; }
    return this.estimate;
  }
  /** Free room (bytes) as the browser tells it, or null. */
  free() { return this.estimate ? Math.max(0, this.estimate.quota - this.estimate.usage) : null; }
  /** The downloaded songs now: { n, bytes } (bytes: the catalog's sizes). */
  summary() { const list = this.songs.filter(s => this.kept.has(s.id)); return { n: list.length, bytes: list.reduce((a, s) => a + songBytes(s), 0) }; }

  /**
   * A song's state on this device: 'builtin' (the game's own files), 'kept' (downloaded), 'wait' / 'run' (in the download
   * queue / downloading: see progress()), 'cached' (played lately: in the play cache, may go), 'none'.
   */
  state(s) {
    if (!s?.remote) return 'builtin';
    const j = this.jobs.get(s.id);
    if (j) return j.state;
    return this.kept.has(s.id) ? 'kept' : this.cached.has(s.id) ? 'cached' : 'none';
  }
  /** 0..1 of a song being downloaded (0 when it is not). */
  progress(s) { const j = this.jobs.get(s?.id); return j && j.total > 0 ? Math.min(1, j.got / j.total) : 0; }
  /** True when it can be sung now: online, or its files are on the device (kept, cached, built in or a built-in fallback). */
  usable(s) {
    if (!s) return false;
    const st = this.state(s);
    return st === 'builtin' || st === 'kept' || st === 'cached' || !!s.fallback || this.online();
  }

  /** Ask once (per device) to keep this site's storage; called in the tap's own turn (Firefox asks the player then). */
  persistOnce() {
    try { if (this.store?.getItem(PERSIST_KEY)) return false; this.store?.setItem(PERSIST_KEY, '1'); } catch { /* ask anyway */ }
    try { const p = this.storage?.persist?.(); p?.catch?.(() => {}); return true; } catch { return false; }
  }

  /** Put a song in the download queue (one download at a time). false: built in, already kept or queued, or offline. */
  download(s) {
    if (!s?.remote || !this.ok || this.jobs.has(s.id) || this.kept.has(s.id)) return false;
    if (!this.online() && !this.cached.has(s.id)) { this.error = { kind: 'net', id: s.id, title: s.title }; this.changed(true); return false; }   // (a played one moves from the play cache)
    this.persistOnce();   // (once per device: the first download)
    this.error = null;
    this.jobs.set(s.id, { song: s, got: 0, total: songBytes(s), state: 'wait', ctl: null });
    this.queue.push(s.id);
    this.changed(true);
    this.run();
    return true;
  }
  /** Queue every song of a list that is not on the device yet. -> how many were queued. */
  downloadAll(list) { let n = 0; for (const s of list) if (this.state(s) === 'none' || this.state(s) === 'cached') n += this.download(s) ? 1 : 0; return n; }
  /** Stop a song's download (or take it out of the queue): its partial files go. */
  cancel(id) {
    const j = this.jobs.get(id); if (!j) return false;
    if (j.state === 'run') j.ctl?.abort(); else { this.jobs.delete(id); this.queue = this.queue.filter(x => x !== id); this.changed(true); }
    return true;
  }
  /** Stop every download (the running one and the queue). */
  cancelAll() { for (const id of [...this.queue]) this.cancel(id); for (const [id, j] of this.jobs) if (j.state === 'run') this.cancel(id); }
  /** True while a download runs or waits. */
  busy() { return this.jobs.size > 0; }
  /** A promise for the moment the queue is empty (tests, the browser check). */
  idle() { return this.running ? new Promise(done => this.waiters.push(done)) : Promise.resolve(); }

  async run() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        const id = this.queue.shift(), j = this.jobs.get(id);
        if (!j) continue;
        j.state = 'run'; j.ctl = typeof AbortController === 'function' ? new AbortController() : null;
        this.changed(true);
        const r = await this.fetchSong(j);
        this.jobs.delete(id);
        if (r === 'ok') { this.kept.add(id); this.cached.delete(id); }
        else if (r !== 'cancel') {
          this.error = { kind: r, id, title: j.song.title };
          if (r === 'full') { for (const q of this.queue) this.jobs.delete(q); this.queue = []; }   // (no room: the rest would fail too)
        }
        await this.usage();
        this.changed(true);
      }
    } finally { this.running = false; for (const done of this.waiters.splice(0)) done(); }
  }

  /** One song's files into the kept cache. -> 'ok' | 'full' | 'net' | 'cancel' | 'storage' */
  async fetchSong(j) {
    const s = j.song, urls = songUrls(s);
    let kept;
    try { kept = await this.caches.open(KEPT_CACHE); } catch { return 'storage'; }
    const free = (await this.usage(), this.free());
    if (free !== null && free < j.total + SPARE_MB * MB) return 'full';
    const done = [];
    const undo = async () => { for (const u of done) { try { await kept.delete(u); } catch { /* gone */ } } };
    let play = null;
    try { play = await this.caches.open(PLAY_CACHE); } catch { /* none */ }
    try {
      for (const u of urls) {
        if (j.ctl?.signal?.aborted) { await undo(); return 'cancel'; }
        // a file the play cache has is moved from there (no network: a song played lately downloads at once)
        const res = (await play?.match(u, { ignoreVary: true }).catch(() => null)) || await this.get(keepUrl(u), { signal: j.ctl?.signal, cache: 'no-cache' });
        if (!res?.ok) { await undo(); return j.ctl?.signal?.aborted ? 'cancel' : 'net'; }
        const type = res.headers?.get?.('content-type') || (u.endsWith('.m4a') ? 'audio/mp4' : 'application/json');
        const blob = await this.body(res, j);
        await kept.put(u, new Response(blob, { status: 200, headers: { 'content-type': type, 'content-length': String(blob.size) } }));
        done.push(u);
      }
    } catch (e) {
      await undo();
      return j.ctl?.signal?.aborted ? 'cancel' : isFull(e) ? 'full' : 'net';
    }
    // the play copy goes (one copy per song on the device)
    try { for (const u of urls) await play?.delete(u); } catch { /* fine */ }
    j.got = j.total;
    return 'ok';
  }

  /** A response's body as a Blob, counting its bytes into the job's progress. */
  async body(res, j) {
    const reader = res.body?.getReader?.();
    if (!reader) { const b = await res.blob(); j.got += b.size; this.changed(); return b; }
    const parts = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value); j.got += value.byteLength; this.changed();
    }
    return new Blob(parts);
  }

  /** Delete a downloaded song's files (the list keeps the song: it can be downloaded again). */
  async remove(s) {
    if (!s?.remote || !this.ok || this.jobs.has(s.id)) return false;
    try {
      const k = await this.caches.open(KEPT_CACHE), p = await this.caches.open(PLAY_CACHE);
      for (const u of songUrls(s)) { await k.delete(u); await p.delete(u); }
    } catch { return false; }
    this.kept.delete(s.id); this.cached.delete(s.id); this.error = null;
    await this.usage();
    this.changed(true);
    return true;
  }

  /** A fetch for loadSong: a song file from the kept cache, else from the play cache, else the network. */
  fetcher() {
    return async (url, opts) => {
      if (this.ok && songUrlsHave(this.songs, url)) {
        for (const name of [KEPT_CACHE, PLAY_CACHE]) {
          try { const hit = await (await this.caches.open(name)).match(url, { ignoreVary: true }); if (hit) return hit; } catch { /* next */ }
        }
      }
      return this.get(url, opts);
    };
  }
}

/** True when url is one of the listed songs' files (only those are looked up in the caches). */
const songUrlsHave = (songs, url) => songs.some(s => url.startsWith(s.base));
