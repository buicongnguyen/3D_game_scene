// © 2026 Bui Cong Nguyen · solluxlabs.com
// Kotone hums on her day walks: now and then, while she walks between the station forecourt and the lane by day and Mika
// is near, she hums her song's tune softly (content/kotone-songs.js KOTONE_HUM: a wordless 8-bar loop), her lips moving
// with it (actors/face.js sing(), the loop's own mouth curves).
//
//   when     a walk of her day plan starts (06:00-17:00, not her evening show, no dialogue, scene, mini game, pause or Sing
//            & Play) and she has not hummed for HUM.rest seconds: one walk in three
//   sound    Web Audio: an AudioBufferSourceNode looping between loopStart and loopEnd (never <audio loop>), through the
//            music bus (Settings > Music sets its volume) at a gain by Mika's distance: full within HUM.full m, nothing
//            from HUM.near m; it starts on a phrase (bar 0, 2, 4 or 6) and plays one loop cycle at most, so the seam is heard
//            when it starts past bar 0
//   stops    when she stops walking, Mika walks off, the cycle is done, or anything above stops being true (a short fade);
//            a frame that never comes (pause, a hidden tab) fades it out by itself: every frame pushes a fade-out half a
//            second ahead (a dead man's switch on the gain)
//   silent   Settings > Voices "Off", ?mute (no audio context at all), Music at 0
// The valley's own tune holds while she hums (audio.holdMusic), so the two never play over each other; her show's song
// never overlaps: the show runs only from 17:00 and a hum stops the moment it begins.
// The loop (0.24 MB) is fetched the first time Mika comes near her by day, and decoded once.
import { KOTONE_HUM } from '../content/kotone-songs.js';

export const HUM = Object.freeze({
  who: 'kotone',
  near: 15, full: 4,        // m: silent from near, full volume within full
  fetchNear: 30,            // m: the loop is fetched when Mika is this near her by day
  chance: 1 / 3,            // of her walks
  rest: 40,                 // s: at least this long between two hums
  from: 6, to: 17,          // hours (her show begins at 17:00)
  vol: 0.45,                // of the music bus at full (her show's song: 1)
  fadeIn: 0.5, fadeOut: 0.6,
  phrases: [0, 2, 4, 6],    // bars a hum may start on
  bars: 8,
  minSpeed: 0.3,            // m/s: slower than this is standing
});

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Loudness 0..1 at Mika's distance d (m): eased from nothing at HUM.near to full at HUM.full. */
export const humGain = d => { const x = clamp((HUM.near - d) / (HUM.near - HUM.full), 0, 1); return x * x * (3 - 2 * x); };

/** 'ogg' where the browser plays Ogg Vorbis, else 'm4a' (Safari, iPhones). canPlay: an <audio>'s canPlayType. */
export function humFormat(canPlay) {
  try { return canPlay?.('audio/ogg; codecs="vorbis"') ? 'ogg' : 'm4a'; } catch { return 'm4a'; }
}

/** May she hum now (pure; everything but the dice)? */
export function humAllowed(s) {
  return !!(s.audio && !s.voicesOff && s.music > 0.001 && s.hour >= HUM.from && s.hour < HUM.to && !s.show && !s.hushed && s.visible
    && s.walking && s.dist < HUM.near);
}

/** Where a hum that started at bar `bar` of the loop is after `elapsed` s: { t (mouth time from loopStart), done }. */
export function humPlace(bar, elapsed, loopLen = KOTONE_HUM.loopEnd - KOTONE_HUM.loopStart) {
  const start = bar * loopLen / HUM.bars;
  return { t: (start + Math.max(0, elapsed)) % loopLen, done: elapsed >= loopLen - HUM.fadeOut };
}

const decode = (ctx, buf) => new Promise((res, rej) => { const p = ctx.decodeAudioData(buf, res, rej); p?.then?.(res, rej); });

export class KotoneHum {
  constructor(town, { rand = Math.random } = {}) {
    this.town = town; this.g = town.g; this.d = town.d; this.rand = rand;
    this.it = null; this.buf = null; this.mouth = null; this.loading = null;
    this.play = null;          // { src, gain, t0, bar } while she hums
    this.lastCmd = null; this.wants = false; this.restT = 0;
    this.last = null; this.speed = 0;
    this.clock = () => (this.play ? humPlace(this.play.bar, this.g.audio.ctx.currentTime - this.play.t0).t : -1);
  }

  get on() { return !!this.play; }

  /** Fetch and decode the loop (once): .ogg where Vorbis plays, else (or when it fails) .m4a. */
  load() {
    const ctx = this.g.audio?.ctx;
    if (this.loading || !ctx || typeof fetch !== 'function') return this.loading;
    const H = KOTONE_HUM, el = typeof window !== 'undefined' && window.Audio ? new window.Audio() : null;
    const first = humFormat(el && (t => el.canPlayType(t))), order = first === 'ogg' ? ['ogg', 'm4a'] : ['m4a'];
    const get = async fmt => decode(ctx, await (await fetch(H.base + H[fmt])).arrayBuffer());
    this.loading = (async () => {
      fetch(`${H.base}${H.id}.mouth.json`).then(r => (r.ok ? r.json() : null)).then(m => { this.mouth = m?.open ? m : null; }).catch(() => {});
      for (const fmt of order) { try { this.buf = await get(fmt); this.format = fmt; return true; } catch { /* the next format */ } }
      return false;
    })();
    return this.loading;
  }

  /** Every frame (Town Life's update, after the show). frozen: dialogue, a scene or anything that holds the valley. */
  update(dt, hour, frozen) {
    const town = this.town, g = this.g, d = this.d, a = g.audio;
    const it = this.it ||= town.people.find(x => x.p.id === HUM.who) || null;
    if (!it) return;
    const n = it.n, p = g.player?.pos;
    this.restT -= dt;
    // how fast she really moves (a greeting stop keeps the walk but not the motion)
    if (this.last && dt > 0) { const v = Math.hypot(n.pos.x - this.last.x, n.pos.z - this.last.z) / dt; this.speed += (v - this.speed) * Math.min(1, dt * 6); }
    (this.last ||= { x: 0, z: 0 }).x = n.pos.x; this.last.z = n.pos.z;
    const dist = p ? Math.hypot(p.x - n.pos.x, p.z - n.pos.z) : Infinity;
    const day = hour >= HUM.from && hour < HUM.to;
    const voice = d.ui?.voice, voicesOff = !voice || voice.mode === 'off' || voice.muted;
    if (day && !voicesOff && a?.ctx && dist < HUM.fetchNear && !this.loading) this.load();
    // a new walk of her plan: one in three, after a rest
    const cmd = it.cmd;
    if (cmd !== this.lastCmd) { this.lastCmd = cmd; this.wants = cmd?.type === 'walk' && this.restT <= 0 && this.rand() < HUM.chance; }
    const walking = !!n.path?.length && this.speed > HUM.minSpeed;
    const hushed = frozen || !!(d.busy || d.scenes?.active || d.minigame || d.singplay || d.ui?.dialogueOpen || g.paused || it.yardHold || n.poser);
    const ok = humAllowed({ audio: !!a?.ctx && a.ctx.state === 'running', voicesOff, music: a?.musicVol ?? 0, hour, show: town.show?.on(it), hushed, visible: n.visible && !n.far, walking, dist });
    if (this.play && !a?.ctx) { this.play.n.humming = false; this.play = null; a?.holdMusic?.('kotone-hum', false); return; }   // (the audio context closed)
    if (this.play) {
      const P = humPlace(this.play.bar, a.ctx.currentTime - this.play.t0);
      if (!ok || P.done) { this.stop(); this.wants = false; return; }
      this.level(humGain(dist));
      return;
    }
    if (ok && this.wants && this.buf) this.start(n);
  }

  start(n) {
    const a = this.g.audio, ctx = a.ctx, H = KOTONE_HUM;
    const src = ctx.createBufferSource(), gain = ctx.createGain();
    src.buffer = this.buf; src.loop = true; src.loopStart = H.loopStart; src.loopEnd = H.loopEnd;
    gain.gain.value = 0;
    src.connect(gain); gain.connect(a.music);
    const bar = HUM.phrases[Math.floor(this.rand() * HUM.phrases.length)], t0 = ctx.currentTime + 0.03;
    src.start(t0, H.loopStart + bar * (H.loopEnd - H.loopStart) / HUM.bars);
    this.play = { src, gain, t0, bar, n };
    a.holdMusic?.('kotone-hum', true);
    if (this.mouth) n.face?.sing(this.mouth, this.clock);
    n.humming = true;
    this.level(humGain(Math.hypot(this.g.player.pos.x - n.pos.x, this.g.player.pos.z - n.pos.z)), HUM.fadeIn);
  }

  /** The gain toward k (0..1 of HUM.vol), with the dead man's switch: silent half a second after the last frame. */
  level(k, tau = 0.15) {
    const ctx = this.g.audio.ctx, P = this.play.gain.gain, now = ctx.currentTime, v = P.value;
    P.cancelScheduledValues(now); P.setValueAtTime(v, now);
    P.setTargetAtTime(k * HUM.vol * 2, now, tau / 3);       // (the music bus is at half the music volume)
    P.setTargetAtTime(0, now + 0.5, 0.12);
  }

  /** Fade out and let go (her lips stop unless her show took them). */
  stop() {
    const pl = this.play; if (!pl) return;
    this.play = null; this.restT = HUM.rest;
    const ctx = this.g.audio.ctx, P = pl.gain.gain, now = ctx.currentTime, v = P.value;
    P.cancelScheduledValues(now); P.setValueAtTime(v, now); P.setTargetAtTime(0, now, HUM.fadeOut / 4);
    try { pl.src.stop(now + HUM.fadeOut * 1.5); } catch { /* already stopped */ }
    pl.src.onended = () => { pl.src.disconnect(); pl.gain.disconnect(); };
    this.g.audio.holdMusic?.('kotone-hum', false);
    if (pl.n.face?.song?.clock === this.clock) pl.n.face.sing(null);
    pl.n.humming = false;
  }
}
