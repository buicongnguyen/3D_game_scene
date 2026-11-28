import * as THREE from 'three';

// A small living face for a character whose model carries it (the VRoid visitor, art/blender/vroid_lite.py): three
// morph targets on the one skinned mesh ('blink', 'mouthA', 'mouthO') and two eye bones ('eye_L', 'eye_R').
//   blink  every 2.5-6 s (a double blink now and then)
//   mouth  flaps while one of her lines is on screen (speak(text): about 0.07 s a letter, 1-5 s), A with a touch of O;
//          or follows a song (sing(): the Avatar Studio's per-song mouth curves or lyric word timings)
//   eyes   look at a point (Mika's head) when it is near and in front, else straight ahead; clamped to a small cone
//   smile  a happy face (owner 2026-11-28: "all the faces look a little sad"): the 'smile' morph (closed-mouth smile and
//          lifted brows) and 'smileEyes' (the eye smile), both from the VRoid sample's own Fun / Joy shapes
//          (art/blender/vroid_mixamo.py add_happy_keys). A resting smile always; setMood() brightens it (choruses, a
//          cheer, a bow: game/perform/performer.js), eased. The mouth's own shapes sing on top: the smile gives way while
//          the mouth opens wide or rounds (so an "ah" or an "oh" stays readable), the eye smile while the lids blink.
//   life   small happy changes over a song or a line, after the Avatar Studio anime girls' singing face (its
//          src/sing-expression.js, owner: "happy like the anime girl characters"): a bigger grin in the gap after a sung
//          phrase (more often on choruses), a brow lift ('browUp') on a phrase's start now and then, and on bright parts
//          (mood >= 0.8) a wink ('wink': her right eye) after a phrase once in a while. faceLife() is pure (tests).
// Cost: one uniform array per frame and two bone rotations; nothing at all while `enabled` is false (far away, out of
// view, or the Low tier's far ring: the director switches it).

const ID = new THREE.Quaternion();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _e = new THREE.Vector3();

const EYE_CONE = 0.3;           // radians (~17 degrees) an eye may turn from straight ahead
const LOOK_NEAR = 7;            // metres: farther than this she looks ahead
/** The happy face: rest mood, the smile morph at mood 1 (capped), how much an open / round mouth takes away, the eye
 *  smile per mood (soft: 1 would close the eyes into "^^"), how fast the mood follows (1/s). */
export const SMILE = Object.freeze({ rest: .45, max: .85, open: .45, round: .8, keep: .3, eyes: .45, eyesFrom: .05, rate: 3 });
/** The smile weights for a mood (0..1) and the mouth now (open = mouthA, round = mouthO weights) and lid (blink 0..1). */
export function smileFor(mood, open = 0, round = 0, lid = 0) {
  const free = Math.min(1, Math.max(SMILE.keep, 1 - SMILE.open * open - SMILE.round * round));
  return [Math.min(SMILE.max, mood) * free, Math.max(0, SMILE.eyes * mood - SMILE.eyesFrom) * (1 - lid)];
}

/** The life of the face over a song (pure; per-phrase choices from a hash, so a member's face is its own but repeatable). */
export const LIFE = Object.freeze({ on: .14, off: .07, minPhrase: .6, gapAfter: .25, gapHold: 2.2, grin: .3,
  chance: .55, brightChance: .9, brow: .5, browChance: .4, browDur: .7, wink: 1, winkChance: .22, winkDur: .5, bright: .8 });
const hash01 = (a, b) => { let h = (Math.imul(a | 0, 2654435761) ^ Math.imul(b | 0, 1597334677)) >>> 0; h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13; return (h >>> 0) / 4294967296; };
const ss = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** -> update(dt, open 0..1, mood 0..1) -> { grin (added to the mood), brow 0..1, wink 0..1 } */
export function faceLife(seed = 1) {
  const st = { voiced: false, len: 0, silent: 9, phrase: 0, gap: false, browT: -1, winkT: -1, grin: 0 }, out = { grin: 0, brow: 0, wink: 0 };
  return function update(dt, open, mood) {
    const bright = mood >= LIFE.bright;
    if (!st.voiced && open > LIFE.on) {
      st.voiced = true; st.len = 0; st.phrase++; st.gap = false;
      if (hash01(seed, st.phrase * 7 + 3) < LIFE.browChance * (bright ? 1 : .7)) st.browT = 0;
    } else if (st.voiced && open < LIFE.off) {
      st.voiced = false; st.silent = 0;
      st.gap = st.len >= LIFE.minPhrase && hash01(seed, st.phrase) < (bright ? LIFE.brightChance : LIFE.chance);
      if (st.gap && bright && st.winkT < 0 && hash01(seed, st.phrase * 13 + 5) < LIFE.winkChance) st.winkT = 0;
    }
    if (st.voiced) st.len += dt; else st.silent += dt;
    const want = !st.voiced && st.gap ? ss((st.silent - LIFE.gapAfter) / .2) * (1 - ss((st.silent - LIFE.gapHold) / .8)) * LIFE.grin : 0;
    st.grin += (want - st.grin) * (1 - Math.exp(-dt / (want > st.grin ? .22 : .18)));
    out.grin = st.grin;
    out.brow = 0; if (st.browT >= 0) { st.browT += dt; if (st.browT < LIFE.browDur) out.brow = LIFE.brow * Math.sin(Math.PI * st.browT / LIFE.browDur) ** 2; else st.browT = -1; }
    out.wink = 0; if (st.winkT >= 0) { st.winkT += dt; const w = st.winkT - LIFE.gapAfter; if (w > LIFE.winkDur) st.winkT = -1; else if (w > 0) out.wink = LIFE.wink * Math.min(1, w / .1, (LIFE.winkDur - w) / .15); }
    return out;
  };
}

export class Face {
  /** -> Face, or null when the model has no face rig. */
  static attach(model) {
    let mesh = null;
    model.traverse(o => { if (!mesh && o.isSkinnedMesh && o.morphTargetDictionary && 'blink' in o.morphTargetDictionary) mesh = o; });
    if (!mesh) return null;
    return new Face(model, mesh);
  }

  constructor(model, mesh) {
    this.model = model;
    this.mesh = mesh;
    const d = mesh.morphTargetDictionary;
    this.ix = { blink: d.blink, a: d.mouthA ?? -1, o: d.mouthO ?? -1, smile: d.smile ?? -1, eyes: d.smileEyes ?? -1, brow: d.browUp ?? -1, wink: d.wink ?? -1 };
    this.life = faceLife((Math.random() * 2 ** 31) | 0);
    this.moodWant = SMILE.rest;  // setMood()
    this.mood = SMILE.rest;
    this.eyes = ['eye_L', 'eye_R'].map(n => model.getObjectByName(n)).filter(Boolean).map(bone => {
      // the eye's forward (the model's +Z) in the bone's own frame, from the bind pose
      const i = mesh.skeleton.bones.indexOf(bone);
      const bind = new THREE.Matrix4().copy(mesh.skeleton.boneInverses[i]).invert();
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(bind).invert()).normalize();
      return { bone, rest: bone.quaternion.clone(), fwd };
    });
    this.enabled = true;
    this.t = 0;
    this.nextBlink = 1 + Math.random() * 3;
    this.blinkT = -1;
    this.twice = false;
    this.talkT = 0;
    this.mouth = 0;
    this.look = 0;              // 0 ahead .. 1 at the target
    this.target = null;
    this.song = null;           // sing(): a song's mouth curves or lyric timings drive the lips
  }

  /** Her line is on screen: move the lips for about as long as it takes to say. */
  speak(text = '', secs = 0) {
    this.talkT = secs > 0 ? secs : Math.min(5, Math.max(1, String(text).length * 0.07));
  }

  quiet() { this.talkT = 0; }

  /**
   * Sing along to a song: the mouth follows the song's own curves instead of the flaps of speak(). `track` is the Avatar
   * Studio's per-song mouth file (`<song>.mouth.json` v2: { fps, scale, open: [0..scale], pucker: [0..scale] }) or its
   * lyrics file (`<song>.lyrics.json`: { lines: [{ t, e, words: [{ w, t, e }] }] }: flaps inside each sung word);
   * `clock()` -> the song's time in seconds (an <audio> element's currentTime, or a WebAudio start time). sing(null) stops.
   * open drives mouthA, pucker mouthO.
   */
  sing(track, clock, when = null) {
    // when(t) -> bool: sing only then (a group's members sing along on the choruses: game/perform/troupe.js)
    this.song = track && clock ? { track, clock, when, words: track.lines ? track.lines.flatMap(l => l.words?.length ? l.words : [{ t: l.t, e: l.e }]) : null, wi: 0 } : null;
    if (!this.song) this.talkT = 0;
  }

  /** [open, round] 0..1 of the song's mouth at its time now, or null when no song is set. */
  songMouth() {
    const s = this.song;
    if (!s) return null;
    const t = s.clock(), tr = s.track;
    if (!(t >= 0) || (s.when && !s.when(t))) return [0, 0];
    if (tr.open) {
      const i = Math.min(tr.open.length - 1, Math.max(0, t * (tr.fps || 25))), a = Math.floor(i), b = Math.min(tr.open.length - 1, a + 1), f = i - a, k = 1 / (tr.scale || 99);
      const at = arr => (arr ? (arr[a] * (1 - f) + arr[b] * f) * k : 0);
      return [at(tr.open), at(tr.pucker)];
    }
    // lyric timings only: syllable flaps inside each word (the words are in time order; walk forward from the last one)
    const w = s.words;
    if (s.wi >= w.length || (w[s.wi] && t < w[s.wi].t)) s.wi = 0;
    while (s.wi < w.length && w[s.wi].e <= t) s.wi++;
    const word = w[s.wi];
    if (!word || t < word.t) return [0, 0];
    const p = (t - word.t) / Math.max(0.05, word.e - word.t);
    return [0.3 + 0.55 * Math.abs(Math.sin(Math.PI * Math.max(1, Math.round((word.e - word.t) * 5)) * p)), 0.15];
  }

  /** How happy she looks, 0..1 (SMILE.rest when nothing is going on); eased in update(). */
  setMood(v = SMILE.rest) { this.moodWant = Math.min(1, Math.max(0, v)); }

  /** Look at this world point (or null for straight ahead). */
  lookAt(p) { this.target = p; }

  setEnabled(on) {
    if (on === this.enabled) return;
    this.enabled = on;
    if (!on) {
      const m = this.mesh.morphTargetInfluences;
      m[this.ix.blink] = 0; if (this.ix.a >= 0) m[this.ix.a] = 0; if (this.ix.o >= 0) m[this.ix.o] = 0;
      for (const k of ['smile', 'eyes', 'brow', 'wink']) if (this.ix[k] >= 0) m[this.ix[k]] = 0;
      this.mouth = 0;
      for (const e of this.eyes) e.bone.quaternion.copy(e.rest);
    }
  }

  /** After the animation mixer has posed the body for this frame. */
  update(dt) {
    if (!this.enabled) return;
    this.t += dt;
    const m = this.mesh.morphTargetInfluences;
    // blink: 0.07 s down, 0.09 s up
    this.nextBlink -= dt;
    if (this.nextBlink <= 0 && this.blinkT < 0) { this.blinkT = 0; this.twice = Math.random() < 0.18; }
    let lid = 0;
    if (this.blinkT >= 0 && this.winking) this.blinkT = -1, this.nextBlink = .4;   // (no blink through a wink)
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const b = this.blinkT;
      lid = b < 0.07 ? b / 0.07 : Math.max(0, 1 - (b - 0.07) / 0.09);
      if (b > 0.16) {
        this.blinkT = -1;
        this.nextBlink = this.twice ? 0.12 : 2.5 + Math.random() * 3.5;
        this.twice = false;
      }
    }
    m[this.ix.blink] = lid;
    // mouth: syllables at ~6 a second with uneven heights, eased in and out
    this.talkT = Math.max(0, this.talkT - dt);
    const sung = this.songMouth();
    if (sung) {
      // (a song: its own open / round curves, eased a little so the 25 fps steps do not show)
      this.mouth += (sung[0] - this.mouth) * Math.min(1, dt * 24);
      this.round = (this.round || 0) + (sung[1] - (this.round || 0)) * Math.min(1, dt * 24);
      if (this.ix.a >= 0) m[this.ix.a] = this.mouth * 0.85;
      if (this.ix.o >= 0) m[this.ix.o] = this.round * 0.7;
    } else {
      const want = this.talkT > 0 ? 0.25 + 0.55 * Math.abs(Math.sin(this.t * 9.5)) * (0.65 + 0.35 * Math.sin(this.t * 3.1)) : 0;
      this.mouth += (want - this.mouth) * Math.min(1, dt * 18);
      if (this.ix.a >= 0) m[this.ix.a] = this.mouth * 0.8;
      if (this.ix.o >= 0) m[this.ix.o] = this.talkT > 0 ? this.mouth * 0.3 * (0.5 + 0.5 * Math.sin(this.t * 2.3)) : 0;
    }
    // smile: under the mouth's own shapes (they were written above), the eye smile under the blink
    if (this.ix.smile >= 0 || this.ix.eyes >= 0) {
      this.mood += (this.moodWant - this.mood) * Math.min(1, dt * SMILE.rate);
      const L = this.life(dt, sung ? sung[0] : this.talkT > 0 ? this.mouth : 0, this.mood);
      const [sm, ey] = smileFor(Math.min(1, this.mood + L.grin), this.ix.a >= 0 ? m[this.ix.a] : 0, this.ix.o >= 0 ? m[this.ix.o] : 0, lid);
      const wink = this.ix.wink >= 0 ? L.wink : 0;
      this.winking = wink > 0;
      if (this.ix.smile >= 0) m[this.ix.smile] = sm;
      if (this.ix.eyes >= 0) m[this.ix.eyes] = ey * (1 - wink);      // (the winking eye's smile is the wink itself)
      if (this.ix.brow >= 0) m[this.ix.brow] = L.brow;
      if (this.ix.wink >= 0) m[this.ix.wink] = wink;
    }
    // eyes
    if (!this.eyes.length) return;
    let aim = 0;
    if (this.target) {
      _v.setFromMatrixPosition(this.eyes[0].bone.matrixWorld);
      _w.copy(this.target).sub(_v);
      if (_w.lengthSq() < LOOK_NEAR * LOOK_NEAR) aim = 1;
    }
    this.look += (aim - this.look) * Math.min(1, dt * 4);
    for (const e of this.eyes) {
      e.bone.quaternion.copy(e.rest);
      if (this.look < 0.01 || !this.target) continue;
      // last frame's head matrix (never update world matrices here: the engine walks them itself, engine/matrices.js,
      // and forcing the walk from a bone up to the scene broke the frame)
      e.bone.parent.matrixWorld.decompose(_v, _qp, _s);
      _q.copy(_qp).multiply(e.rest);                     // the eye's neutral world rotation
      const cur = _e.copy(e.fwd).applyQuaternion(_q);
      _v.setFromMatrixPosition(e.bone.matrixWorld);
      const to = _w.copy(this.target).sub(_v).normalize();
      const ang = cur.angleTo(to);
      if (!(ang < 1.2) || ang < 1e-4) continue;          // behind her: straight ahead
      // turn toward the target, at most EYE_CONE, eased by `look`: world = q2 * qh * rest -> local = qh^-1 * q2 * qh * rest
      _q2.setFromUnitVectors(cur, to).slerp(ID, 1 - Math.min(1, EYE_CONE / ang) * this.look);
      e.bone.quaternion.copy(_qp.invert().multiply(_q2).multiply(_q));
    }
  }
}

/** The switch for all faces: `?face=off` turns them off (to measure what they cost). */
Face.on = !(typeof location !== 'undefined' && /[?&]face=off\b/.test(location.search || ''));
