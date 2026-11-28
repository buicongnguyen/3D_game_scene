// Baked voice clips for the house scenes (docs/TRAVEL-LANGUAGE-PLAN.md §8). One reusable <audio> element streams the
// clip (nothing is decoded on the main thread); where the game's AudioContext runs, the element goes through it, so
// the volume works on iOS too and the music is ducked while someone speaks. Only the learning language's index.json
// (~10 KB) is fetched, when first needed; a house's clips are fetched when Mika nears its door (`prefetch`), and the
// service worker keeps them. Slower = playbackRate 0.75 with preservesPitch (no extra files).

const BASE = 'speech';

export class SpeechAudio {
  constructor(audio) {
    this.audio = audio;            // engine/audio.js (ctx, comp, music)
    this.indexes = new Map();      // lang -> Promise<index | null>
    this.blobs = new Map();        // url -> object URL (fetched ahead)
    this.el = null;
    this.src = null;
    this.playing = null;           // { key, lang, env: Uint8Array, d, t0 }
    this.volume = 0.9;
    this.muted = false;
  }

  /** The language's clip list, or null when there is none (then the caller falls back to device voice / blips). */
  index(lang) {
    if (!this.indexes.has(lang)) {
      this.indexes.set(lang, fetch(`${BASE}/${lang}/index.json`).then(r => (r.ok ? r.json() : null)).catch(() => null));
    }
    return this.indexes.get(lang);
  }

  async has(key, lang) { return !!(await this.index(lang))?.lines?.[key]; }

  /** Fetch these clips ahead (a house's due scene), quietly, at most once each. */
  async prefetch(keys, lang) {
    const idx = await this.index(lang);
    if (!idx) return;
    for (const k of keys) {
      const e = idx.lines[k];
      if (!e) continue;
      const url = `${BASE}/${lang}/${e.f}`;
      if (this.blobs.has(url)) continue;
      this.blobs.set(url, null);
      fetch(url).then(r => (r.ok ? r.blob() : null)).then(b => { if (b) this.blobs.set(url, URL.createObjectURL(b)); else this.blobs.delete(url); }).catch(() => this.blobs.delete(url));
    }
  }

  element() {
    if (this.el) return this.el;
    const el = this.el = new Audio();
    el.preload = 'auto';
    el.preservesPitch = true; el.mozPreservesPitch = true; el.webkitPreservesPitch = true;
    return el;
  }

  /** Route through the game's AudioContext once it exists (after the first touch). */
  route() {
    const a = this.audio, c = a?.ctx;
    if (!c || this.src || !this.el) return;
    try {
      this.src = c.createMediaElementSource(this.el);
      this.gain = c.createGain();
      this.gain.gain.value = this.volume;
      this.src.connect(this.gain).connect(a.master || c.destination);
    } catch (e) { console.warn('[speech] direct output', e); }
  }

  /**
   * Play one clip. -> Promise<boolean>: true when it played to the end, false when it was stopped, or there is no clip
   * (the caller then reads the line some other way).
   */
  async play(key, lang, { slow = false } = {}) {
    this.stop();
    const seq = this.seq;
    const idx = await this.index(lang), e = idx?.lines?.[key];
    if (!e || this.muted || seq !== this.seq) return false;
    const url = `${BASE}/${lang}/${e.f}`;
    // always from a fetched blob: Safari is strict about media byte ranges coming through a service worker
    let src = this.blobs.get(url);
    if (!src) {
      try { const r = await fetch(url); if (r.ok) { src = URL.createObjectURL(await r.blob()); this.blobs.set(url, src); } } catch { /* the plain URL below */ }
    }
    if (seq !== this.seq) return false;           // stopped (or another line asked for) while the clip was on its way
    const el = this.element();
    this.route();
    el.src = src || url;
    el.playbackRate = slow ? 0.75 : 1;
    if (!this.src) el.volume = this.volume;
    const env = e.env ? decodeEnv(e.env) : null;
    const token = this.playing = { key, lang, env, d: e.d, slow };
    this.duck(true);
    return new Promise(resolve => {
      const done = ok => { el.onended = el.onerror = null; if (this.playing === token) { this.playing = null; this.duck(false); } token.end = null; resolve(ok); };
      token.end = done;
      el.onended = () => done(true);
      el.onerror = () => done(false);
      const p = el.play();
      p?.catch?.(() => done(false));
    });
  }

  stop() {
    this.seq = (this.seq || 0) + 1;
    const p = this.playing;
    if (this.el && !this.el.paused) { try { this.el.pause(); } catch { /* ignore */ } }
    if (p) { this.playing = null; this.duck(false); p.end?.(false); }
  }

  /** Loudness 0..1 of the clip now playing (for lips, nods and glows); 0 when silent. */
  envelopeAt() {
    const p = this.playing;
    if (!p?.env || !this.el) return 0;
    const i = Math.floor(this.el.currentTime * 30);
    return i >= 0 && i < p.env.length ? p.env[i] / 255 : 0;
  }

  duck(on) {
    const a = this.audio;
    if (!a?.ctx || !a.music) return;
    const v = (a.musicVol ?? 0.55) * 0.5 * (on ? 0.35 : 1);
    try { a.music.gain.setTargetAtTime(v, a.ctx.currentTime, on ? 0.08 : 0.4); } catch { /* ignore */ }
  }
}

/** base64 Uint8 envelope (30 Hz) -> Uint8Array. */
export function decodeEnv(b64) {
  try {
    const s = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  } catch { return null; }
}
