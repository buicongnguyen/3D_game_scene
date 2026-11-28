// A whole song performed by one character (Kotone): the plan (plan.js) played with the song's audio as the clock.
//   dances    beat-locked Club loops on her own mixer: clip time from the song's beat, a one-beat crossfade on each block's
//             bar line (Avatar Studio Club mode's dance-sets.js rule)
//   moments   one-shots over the dance, in and out over a beat (the closing bow holds)
//   mic       the mic moves' upper body over the dance on sung lines (mic-layer.js), the hand mic in her fist over each
//             vocal span (mic-prop.js)
//   face      face.sing(): the song's mouth curves (or lyric timings); her eyes on the camera on sung lines when it is near;
//             her mood (face.setMood: a resting smile, brighter on choruses, brightest in a cheer and the bow: moodAt)
// The pose is a pure function of the song time, so a skipped or slow frame never puts her off the beat.
// Hooks: the NPC calls poser.before() before its mixer update and poser.after() after it (actors/npc.js).
import * as THREE from 'three';
import { createBeatClock } from './beat-clock.js';
import { planPerformance, blockAt, momentAt, micShown, PLAN } from './plan.js';
import { micLayer, leadTarget, micClipFor, micFold, SINGING } from './mic-layer.js';
import { makeMic } from './mic-prop.js';
import { createFootHold } from './foot-hold.js';
import { createGroundFit } from './ground-fit.js';
import { MIC_CLIPS } from '../../content/kotone-club.js';

const follow = (cur, target, dt, up, down) => cur + (target - cur) * (1 - Math.exp(-dt / Math.max(1e-3, target > cur ? up : down)));
const smooth = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const CLOCK_TAU = .35;   // s: the song clock follows the audio clock this softly (Club "Club show": smooth at any frame rate)
/** How happy the performer looks (actors/face.js setMood) by the part of the song and the moment playing. */
export const MOOD = Object.freeze({ intro: .6, verse: .55, prechorus: .65, chorus: .85, drop: .85, bridge: .6, break: .65, outro: .65,
  other: .6, moment: .9, cheer: 1, bow: .95 });
export const moodAt = (section, moment = null) => (moment ? MOOD[moment] ?? MOOD.moment : MOOD[section] ?? MOOD.other);

/** The song's audio: an <audio> element through the game's music bus when WebAudio is up (else its own volume). */
export class SongAudio {
  constructor(url, audio) {
    this.audio = audio; this.el = null; this.url = url; this.gain = null; this.vol = 0;
  }
  ensure() {
    if (this.el || !this.url || typeof window === 'undefined' || !window.Audio) return this.el;
    const el = this.el = new window.Audio(); el.preload = 'auto'; el.src = this.url; el.crossOrigin = 'anonymous';
    const a = this.audio;
    if (a?.ctx && a.music) { try { const src = a.ctx.createMediaElementSource(el); this.gain = a.ctx.createGain(); this.gain.gain.value = 0; src.connect(this.gain); this.gain.connect(a.music); } catch { this.gain = null; } }
    return el;
  }
  /** Play at song time t with loudness k (0..1); k 0 pauses. */
  update(t, k, playing) {
    const el = k > 0.001 && playing ? this.ensure() : this.el;
    if (!el) return;
    if (k <= 0.001 || !playing || !(t >= 0)) { if (!el.paused) el.pause(); return; }
    if (Math.abs(el.currentTime - t) > .3 || el.paused) { try { el.currentTime = t; } catch { /* not seekable yet */ } }
    if (el.paused) el.play()?.catch?.(() => {});
    if (this.gain) this.gain.gain.setTargetAtTime(k * 2, this.audio.ctx.currentTime, .1);   // (the music bus is at half the music volume)
    else el.volume = Math.min(1, k * (this.audio?.musicVol ?? .55) * 1.6);
  }
  /** The song's sound as a MediaStream (Record): a tap on its gain node, else the element's own capture. */
  stream() {
    const el = this.ensure(); if (!el) return null;
    if (this.gain) { this.dest ||= this.audio.ctx.createMediaStreamDestination(); if (!this.tapped) { this.gain.connect(this.dest); this.tapped = true; } return this.dest.stream; }
    try { return el.captureStream?.() || el.mozCaptureStream?.() || null; } catch { return null; }
  }
  /** The audio's own time while it plays, else null. */
  time() { const el = this.el; return el && !el.paused && el.readyState >= 2 ? el.currentTime : null; }
  stop() { if (this.el) { this.el.pause(); this.el.removeAttribute('src'); this.el.load?.(); this.el = null; } }
}

/** The moment at bar position `bar` and its weight (in and out over a beat; the song's last moment holds to the end). */
export function momentWeight(P, bar) {
  const M = P.moments; let best = null;
  for (const mo of M) {
    const beat = bar * P.meter, s = mo.b0 * P.meter, e = mo.b1 * P.meter, last = mo.b1 >= P.lastBar;
    if (beat < s - 1e-6 || (!last && beat > e)) continue;
    const f = mo.fade || PLAN.fadeBeats, w = Math.min(smooth((beat - s) / f), last ? 1 : smooth((e - beat) / f));
    if (!best || w > best.w) best = { ...mo, w };
  }
  return best && best.w > 1e-3 ? best : null;
}

/**
 * The dance of song time t on a mixer's actions (Map clip name -> AnimationAction, all playing at timeScale 0): the
 * block's loop at the beat, a cross-fade from the block before over its first beat or two, a moment over both. A pure
 * function of t (a skipped frame never puts the dancer off the beat). -> true while a cross-fade runs (foot-hold.js).
 */
export function poseDance(P, c, actions, songT) {
  const t = Math.min(songT, P.end), b = c.beatAt(t), bar = b / P.meter, m = P.rate.m;
  const i = blockAt(P, bar), blk = P.blocks[i], prev = P.blocks[i - 1];
  const clipTime = (a, beat0) => { const L = a.getClip().duration; const x = Math.max(0, b - beat0) * m * .5; return ((x % L) + L) % L; };
  const mo = momentWeight(P, bar), mw = mo ? mo.w : 0;
  for (const a of actions.values()) a.setEffectiveWeight(0);
  const x = prev ? smooth((b - blk.b0 * P.meter) / (blk.fade || PLAN.fadeBeats)) : 1;   // (two beats between stances that differ)
  const ca = actions.get(blk.clip);
  if (ca) { ca.time = clipTime(ca, blk.b0 * P.meter); ca.setEffectiveWeight((1 - mw) * x); }
  if (prev && x < 1) { const pa = actions.get(prev.clip); if (pa && pa !== ca) { pa.time = clipTime(pa, prev.b0 * P.meter); pa.setEffectiveWeight((1 - mw) * (1 - x)); } }
  if (mo) { const a = actions.get(mo.clip); if (a) { const L = a.getClip().duration; a.time = Math.min(L - 1e-3, Math.max(0, b - mo.b0 * P.meter) * m * .5); a.setEffectiveWeight(mw); } }
  return Boolean((prev && x < 1) || (mo && mo.w < 1));
}

export class Performer {
  /**
   * npc: the performer (actors/npc.js: model, anim, face); clips: Map name -> AnimationClip (her pack, made ready for her
   * model); song: { song (the list entry), beats, lyrics, mouth, stage, url }; restRoot: the pack's armature (rest pose).
   */
  constructor(npc, clips, song, { audio = null, restRoot = null, style, ground = null } = {}) {
    this.n = npc; this.clips = clips; this.data = song;
    this.clock = createBeatClock(song.song, { beats: song.beats, sections: song.stage?.sections || null, lyrics: song.lyrics });
    this.plan = planPerformance(song.song, this.clock, song.lyrics, { style });   // (style: the Dance choice)
    this.mood = moodAt('intro');
    this.sound = new SongAudio(song.url, audio);
    this.restRoot = restRoot;
    this.ground = ground;   // (x, z) -> y: her feet fitted to a hillside (ground-fit.js); null on level stages
    this.t = 0; this.on = false; this.done = false;
    this.w = 0; this.g = 0; this.cur = ''; this.prevMic = ''; this.xfAt = -99;
    this.actions = new Map(); this.layer = null; this.mic = null;
    this.camera = null;
    this.onPose = null;   // (dt, song time) after her dance pose, before the mic layer (game/perform/troupe.js)
  }

  get state() { const bar = this.clock.barAt(this.t), b = this.plan.blocks[blockAt(this.plan, bar)], m = momentAt(this.plan, bar), s = this.clock.sectionAt(this.t);
    return { t: this.t, bar, section: s.kind, dance: b?.clip, moment: m?.clip || null, mic: this.g, sing: this.w, micClip: this.cur, done: this.done }; }

  /** Take her body (from song time t). */
  start(t = this.t) {
    const n = this.n, anim = n.anim; if (!anim || this.on) return;
    this.t = t; this.on = true;
    anim.cancelOneShot(); anim.mixer.stopAllAction(); anim.current = null; anim.currentName = ''; anim.locked = true;
    for (const name of new Set([...this.plan.blocks.map(b => b.clip), ...this.plan.moments.map(m => m.clip)])) {
      const clip = this.clips.get(name); if (!clip) continue;
      const a = anim.mixer.clipAction(clip); a.setLoop(THREE.LoopRepeat, Infinity); a.timeScale = 0; a.setEffectiveWeight(0); a.play();
      this.actions.set(name, a);
    }
    // the mic moves of her style (an older pack without one of them: no mic layer, she dances and the mic stays down)
    const set = this.plan.mic, want = [...new Set([...set.verse, ...set.chorus])];
    const mics = new Map(MIC_CLIPS.filter(id => want.includes(id) && this.clips.has(id)).map(id => [id, this.clips.get(id)]));
    this.layer = mics.size === want.length ? micLayer(n.model, mics, this.restRoot) : null;
    this.mic = this.layer ? makeMic(n.model) : null;
    this.feet = createFootHold(n.model);
    this.fit = this.ground ? createGroundFit(n.model, this.ground) : null;
    const track = this.data.mouth?.open ? this.data.mouth : this.data.lyrics;
    if (track) n.face?.sing(track, () => this.t);
    n.poser = this;
  }

  /** Give her body back (keeps the song time, so start() goes on from there). */
  stop() {
    const n = this.n, anim = n.anim;
    if (!this.on) return;
    this.on = false;
    this.fit?.restore(); this.layer?.restore(); this.feet?.restore();
    for (const a of this.actions.values()) { a.stop(); anim.mixer.uncacheAction(a.getClip(), anim.root); }
    this.actions.clear(); this.layer = null;
    this.mic?.dispose(); this.mic = null;
    n.face?.sing(null); n.face?.setMood(); n.gaze = null;
    if (n.poser === this) n.poser = null;
    anim.locked = false;
    anim.play(n.idleClip || 'Idle', { fade: .3 });
    this.sound.update(0, 0, false);
  }

  dispose() { this.stop(); this.sound.stop(); }

  /** Jump to song time t (tests, a replay): the audio follows. */
  seek(t) { this.t = Math.max(0, t); const el = this.sound.el; if (el) { try { el.currentTime = this.t; } catch { /* not seekable yet */ } } }

  /**
   * The song clock and the audio: dt seconds; listen 0..1 how loud Mika hears it (0: the audio pauses, the clock goes
   * on); camera: the view camera (her eyes meet it on sung lines when near).
   */
  update(dt, { listen = 0, camera = null } = {}) {
    if (!this.on || this.done) return;
    this.camera = camera;
    this.t += dt;
    const at = this.sound.time();
    if (at !== null) { const d = at - this.t; this.t = Math.abs(d) > .3 ? at : this.t + d * (1 - Math.exp(-dt / CLOCK_TAU)); }
    this.sound.update(this.t, listen, this.t < this.plan.end);
    if (this.t >= this.plan.end + 1.2) this.done = true;
  }

  /** Before the mixer: the dance pose of this song time (action times and weights). */
  before() {
    if (!this.on) return;
    this.fit?.restore(); this.layer?.restore(); this.feet?.restore();
    this.fading = poseDance(this.plan, this.clock, this.actions, this.t);
  }

  /** The moment now and its weight (in and out over a beat; the song's last moment holds to the end). */
  momentNow(bar) { return momentWeight(this.plan, bar); }

  /** After the mixer: the mic layer over the dance, the mic in her hand, her eyes. */
  after(dt) {
    if (!this.on) return;
    const P = this.plan, t = Math.min(this.t, P.end), c = this.clock, lines = P.lines;
    const want = lines ? leadTarget(lines, t) : 0;
    this.feet?.update(dt, this.fading);   // planted feet held through a cross-fade (foot-hold.js)
    this.onPose?.(dt, t);                  // her dance pose, before the mic: a group's front row copies it (troupe.js)
    this.fit?.apply();                     // then her own feet on the slope under her (the copies fit their own: troupe.js)
    this.w = follow(this.w, want, dt, SINGING.up, SINGING.down);
    this.g = micShown(P, t);
    this.mic?.show(this.g);
    if (this.layer && (this.w > 1e-3 || this.g > 1e-3)) {
      const b = c.beatAt(t), id = lines ? micClipFor(lines, t, P.mic) : P.mic.verse[0];
      if (id !== this.cur) { if (this.cur) { this.prevMic = this.cur; this.xfAt = b; } this.cur = id; }
      const x = b * micFold(c.bpmAt(t)) * .5, L1 = this.layer.loop(this.cur), L0 = this.layer.loop(this.prevMic || this.cur), xf = smooth((b - this.xfAt) / SINGING.micFade);
      this.layer.apply(this.cur, ((x % L1) + L1) % L1, xf < 1 ? this.prevMic : '', ((x % L0) + L0) % L0, xf, this.w, this.g);
    }
    // mood: brighter on choruses, brightest in a cheer and the bow (a group's members take hers: troupe.js)
    const mo = momentAt(P, c.barAt(t));
    this.mood = moodAt(c.sectionAt(t).kind, mo?.id);
    this.n.face?.setMood(this.mood);
    // eyes: the camera on her sung lines when it is near (the face looks at Mika's head otherwise)
    const cam = this.camera, n = this.n;
    if (cam && this.w > .5) { const p = cam.getWorldPosition?.(_cam) || cam.position; n.gaze = p.distanceToSquared(n.pos) < 144 ? p : null; }
    else n.gaze = null;
  }
}
const _cam = new THREE.Vector3();
