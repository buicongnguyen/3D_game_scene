// Procedural audio (WebAudio): generative seasonal music, voice blips, SFX and ambience. No downloads.

const SCALES = {
  spring: [0, 2, 4, 7, 9], summer: [0, 2, 4, 7, 9], autumn: [0, 3, 5, 7, 10], winter: [0, 2, 3, 7, 8], night: [0, 2, 5, 7, 9],
};
const ROOTS = { spring: 62, summer: 64, autumn: 60, winter: 57, night: 58 };
const CHORDS = [[0, 4, 7], [5, 9, 12], [7, 11, 14], [9, 12, 16], [2, 5, 9], [4, 7, 11]];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
// the Festival dance's two tunes (Audio.danceBeat): four bars of chords and eight eighth notes a bar (null: a rest).
// festival: D major pentatonic over D, Bm, G, A; kpop: a bright hook over C, G, Am, F. Original, written for the game.
const DANCE_TUNES = {
  festival: {
    chords: [[62, 66, 69], [59, 62, 66], [55, 59, 62], [57, 61, 64]],
    tune: [[74, 76, 78, null, 81, 78, 76, null], [74, 76, 78, 76, 74, null, 71, null], [78, 81, 83, null, 81, 78, 76, null], [74, 76, 74, 71, 69, null, 74, null]],
  },
  kpop: {
    chords: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]],
    tune: [[76, 76, 79, 76, 74, 72, 74, null], [74, 74, 79, 74, 71, null, 74, 76], [76, 76, 81, 79, 76, null, 72, 74], [77, 76, 74, 72, 74, null, null, null]],
  },
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.musicVol = 0.55;
    this.sfxVol = 0.8;
    this.season = 'spring';
    this.mood = 'calm';
    this.nextNote = 0;
    this.beat = 0;
    this.amb = {};
  }

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    c.onstatechange = () => { if (c.state === 'closed') this.ctx = null; };
    // iOS suspends or interrupts the context after a call, a tab switch or a screen lock: wake it on return or on the next touch
    const wake = () => { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume?.()?.catch?.(() => {}); };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
    addEventListener('pointerdown', wake); addEventListener('keydown', wake);
    this.master = c.createGain(); this.master.gain.value = 0.9; this.master.connect(c.destination);
    // under water everything is heard through the river: a lowpass on the whole mix
    this.muffle = c.createBiquadFilter(); this.muffle.type = 'lowpass'; this.muffle.frequency.value = 20000; this.muffle.connect(this.master);
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 3; this.comp.connect(this.muffle);
    this.music = c.createGain(); this.music.gain.value = this.musicVol * 0.5; this.music.connect(this.comp);
    this.sfx = c.createGain(); this.sfx.gain.value = this.sfxVol; this.sfx.connect(this.comp);
    this.ambBus = c.createGain(); this.ambBus.gain.value = this.sfxVol * 0.6; this.ambBus.connect(this.comp);
    this.reverb = c.createConvolver();
    this.reverb.buffer = this.impulse(2.6);
    this.revGain = c.createGain(); this.revGain.gain.value = 0.45;
    this.reverb.connect(this.revGain); this.revGain.connect(this.comp);
    this.noiseBuf = this.makeNoise();
    this.startAmbience();
  }

  setVolumes(music, sfx) {
    this.musicVol = music; this.sfxVol = sfx;
    if (!this.ctx) return;
    this.music.gain.setTargetAtTime(music * 0.5, this.ctx.currentTime, 0.2);
    this.sfx.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.2);
    this.ambBus.gain.setTargetAtTime(sfx * 0.6, this.ctx.currentTime, 0.2);
  }

  impulse(sec) {
    const c = this.ctx, len = c.sampleRate * sec, b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return b;
  }

  makeNoise() {
    const c = this.ctx, b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = w * 0.5 + last * 3.5; }
    return b;
  }

  // ---------------------------------------------------------------- primitives
  tone(freq, { type = 'sine', dur = 0.3, vol = 0.2, attack = 0.005, when = 0, bus = this.sfx, rev = 0.2, detune = 0, glide = 0, filter = 0 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
    if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * glide), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    let node = o;
    if (filter) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; o.connect(f); node = f; }
    node.connect(g); g.connect(bus);
    if (rev) { const s = c.createGain(); s.gain.value = rev; g.connect(s); s.connect(this.reverb); }
    o.start(t); o.stop(t + dur + 0.05);
  }

  noise({ dur = 0.2, vol = 0.2, freq = 1200, q = 1, type = 'bandpass', when = 0, bus = this.sfx, sweep = 0 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + when;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(bus);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  pluck(midi, when = 0, vol = 0.12) {
    const f = mtof(midi);
    this.tone(f, { type: 'triangle', dur: 1.6, vol, when, bus: this.music, rev: 0.55, filter: 2600 });
    this.tone(f * 2, { type: 'sine', dur: 0.5, vol: vol * 0.35, when, bus: this.music, rev: 0.4 });
  }

  pad(midis, when, dur, vol = 0.035) {
    for (const m of midis) this.tone(mtof(m), { type: 'sine', dur, vol, attack: dur * 0.35, when, bus: this.music, rev: 0.7, detune: (Math.random() - 0.5) * 8 });
  }

  // ---------------------------------------------------------------- SFX
  click() { this.tone(1400, { type: 'triangle', dur: 0.06, vol: 0.08, rev: 0 }); }
  blip(pitch = 1) { this.tone(420 * pitch * (0.92 + Math.random() * 0.16), { type: 'square', dur: 0.05, vol: 0.035, rev: 0.05, filter: 1800 }); }
  /** A farm animal's call; `vol` (0..1) is how near it is, so a far-off moo is a murmur. */
  animal(kind, vol = 1) {
    const v = 0.16 * vol;
    if (!this.ctx || v < 0.006) return;
    if (kind === 'cow') {            // a long low moo that sags in pitch
      this.tone(118, { type: 'sawtooth', dur: 1.15, vol: v, attack: 0.14, glide: 0.8, filter: 520, rev: 0.3 });
      this.tone(236, { type: 'sine', dur: 0.9, vol: v * 0.3, attack: 0.18, glide: 0.8, rev: 0.25 });
    } else if (kind === 'pig') {     // two short snorting grunts
      this.tone(170, { type: 'square', dur: 0.12, vol: v * 0.8, filter: 700, glide: 0.8, rev: 0.1 });
      this.tone(140, { type: 'square', dur: 0.16, vol: v * 0.8, filter: 650, glide: 0.75, when: 0.17, rev: 0.1 });
      this.noise({ dur: 0.1, vol: v * 0.5, freq: 1100, q: 1.2, when: 0.04 });
    } else if (kind === 'goat') {    // a wobbling bleat
      this.tone(540, { type: 'sawtooth', dur: 0.6, vol: v * 0.7, attack: 0.03, glide: 0.7, filter: 1500, detune: -12, rev: 0.2 });
      this.tone(560, { type: 'sawtooth', dur: 0.6, vol: v * 0.5, attack: 0.03, glide: 0.72, filter: 1500, detune: 14, rev: 0.2 });
    } else if (kind === 'dog') {     // a bright double bark
      for (const w of [0, 0.22]) {
        this.tone(330, { type: 'square', dur: 0.13, vol: v * 0.7, attack: 0.004, glide: 0.55, filter: 1800, when: w, rev: 0.15 });
        this.noise({ dur: 0.09, vol: v * 0.55, freq: 1600, q: 0.9, when: w });
      }
    }
  }
  /** A cricket's chirp: three quick bright pulses. `vol` (0..1) is how near it is; `pitch` tells one cricket from another. */
  chirp(vol = 1, pitch = 1) {
    const v = 0.022 * vol;
    if (!this.ctx || v < 0.0015) return;
    const f = 4400 * pitch, n = 3 + (Math.random() < 0.3 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      this.tone(f, { type: 'sine', dur: 0.032, vol: v, attack: 0.004, when: i * 0.052, bus: this.ambBus, rev: 0.12 });
      this.tone(f * 2.01, { type: 'sine', dur: 0.02, vol: v * 0.25, attack: 0.003, when: i * 0.052, bus: this.ambBus, rev: 0 });
    }
  }
  /**
   * The cricket trick's song, placed in the stereo field: a trill of 3 or 4 bright two-note pulses. pan: -1 (left) ..
   * 1 (right), where it comes from; vol (0..1): how near it is; pitch tells one cricket from another.
   */
  chirpAt(vol = 1, pitch = 1, pan = 0, pulses = 3) {
    const v = 0.05 * vol;
    if (!this.ctx || v < 0.002) return;
    const c = this.ctx;
    let bus = this.ambBus;
    if (c.createStereoPanner) { bus = c.createStereoPanner(); bus.pan.value = Math.max(-1, Math.min(1, pan)); bus.connect(this.ambBus); }
    const f = 4000 * pitch;
    for (let i = 0; i < pulses; i++) {
      const g = i % 2 ? f * 1.06 : f;
      this.tone(g, { type: 'sine', dur: 0.04, vol: v, attack: 0.004, when: i * 0.058, bus, rev: 0.1 });
      this.tone(g * 2.01, { type: 'sine', dur: 0.025, vol: v * 0.25, attack: 0.003, when: i * 0.058, bus, rev: 0 });
    }
  }
  /**
   * A frog's croak: a burst of throaty pulses through a resonant band (the throat pouch). `vol` (0..1) is how near it
   * is; `pitch` tells one frog from another; kind 'tree' is the bright "kero-kero" of a tree frog, 'pond' a deep "gwa".
   */
  croak(vol = 1, pitch = 1, kind = 'pond') {
    const v = 0.07 * vol;
    if (!this.ctx || v < 0.002) return;
    const tree = kind === 'tree', f = (tree ? 520 : 150) * pitch, n = tree ? 2 : 3 + (Math.random() < 0.4 ? 1 : 0);
    const gap = tree ? 0.11 : 0.045;
    for (let i = 0; i < n; i++) {
      this.tone(f, { type: 'sawtooth', dur: tree ? 0.07 : 0.05, vol: v, attack: 0.006, when: i * gap, bus: this.ambBus, rev: 0.15, filter: f * 5, glide: tree ? 1.15 : 0.92 });
      this.tone(f * 0.5, { type: 'square', dur: 0.04, vol: v * 0.35, attack: 0.004, when: i * gap, bus: this.ambBus, rev: 0, filter: f * 3 });
    }
  }
  /** A small thing slipping into still water (a frog jumping in, a fish turning). */
  plop(vol = 1) {
    if (!this.ctx) return;
    this.tone(260 + Math.random() * 120, { dur: 0.09, vol: 0.06 * vol, glide: 2.6, rev: 0.3 });
    this.noise({ dur: 0.18, vol: 0.05 * vol, freq: 900, q: 0.7, type: 'lowpass', sweep: 0.4 });
  }
  /** A tiny glassy twinkle (shrimp eyes catching the lantern). */
  twinkle(vol = 1) { if (this.ctx) this.tone(mtof(91 + Math.floor(Math.random() * 5)), { dur: 0.18, vol: 0.025 * vol, rev: 0.6 }); }
  step(surface = 'grass') {
    const f = { grass: 900, wood: 420, stone: 1500, sand: 700, snow: 600, ice: 2600 }[surface] || 900;
    this.noise({ dur: surface === 'wood' ? 0.09 : 0.07, vol: surface === 'snow' ? 0.14 : 0.09, freq: f * (0.9 + Math.random() * 0.2), q: surface === 'wood' ? 4 : 1.2 });
    if (surface === 'wood') this.tone(160 + Math.random() * 30, { dur: 0.08, vol: 0.05, rev: 0 });
  }
  jump() { this.noise({ dur: 0.12, vol: 0.06, freq: 1800, sweep: 0.5 }); }
  land(s = 0.5) { this.noise({ dur: 0.14, vol: 0.08 + s * 0.12, freq: 500, q: 0.8 }); }
  splash(strength = 0.6) { this.noise({ dur: 0.35 + strength * 0.4, vol: 0.12 + strength * 0.3, freq: 1600 + strength * 1200, q: 0.5, type: 'lowpass', sweep: 0.3 }); }
  whoosh(mul = 4) { this.noise({ dur: 0.5, vol: 0.12 + Math.log2(mul) * 0.03, freq: 700 + mul * 60, q: 0.8, type: 'bandpass', sweep: 2.4 }); }
  stroke() { this.noise({ dur: 0.32, vol: 0.07, freq: 1300, q: 0.6, type: 'lowpass', sweep: 0.5 }); }
  setUnderwater(on) {
    if (!this.ctx || this._under === on) return;
    this._under = on;
    this.muffle.frequency.setTargetAtTime(on ? 520 : 20000, this.ctx.currentTime, 0.06);
  }
  spark() {
    this.noise({ dur: 0.4, vol: 0.12, freq: 3000, sweep: 0.4 });
    [0, 4, 7, 12].forEach((d, i) => this.tone(mtof(84 + d), { dur: 0.25, vol: 0.05, when: i * 0.03, rev: 0.5 }));
  }
  sparkHit() { [0, 7, 12, 16, 19].forEach((d, i) => this.tone(mtof(79 + d), { dur: 0.5, vol: 0.06, when: i * 0.04, rev: 0.6 })); }
  miss() { this.tone(300, { type: 'triangle', dur: 0.25, vol: 0.06, glide: 0.6 }); }
  pickup() { [0, 4, 7, 12].forEach((d, i) => this.tone(mtof(76 + d), { type: 'triangle', dur: 0.35, vol: 0.09, when: i * 0.06, rev: 0.4 })); }
  /** Sora's lullaby, as a music box would play it. */
  lullaby() {
    const r = 79, tune = [0, 4, 7, 9, 7, 4, 2, 4, 0, -3, 0, 2, 4, 2, 0, -5, 0];
    tune.forEach((d, i) => this.tone(mtof(r + d), { type: 'sine', dur: 0.9, vol: 0.07, when: i * 0.42, rev: 0.7 }));
    tune.forEach((d, i) => { if (i % 4 === 0) this.tone(mtof(r - 12 + d), { type: 'triangle', dur: 1.4, vol: 0.03, when: i * 0.42, rev: 0.6 }); });
  }
  /** A wind chime by the shrine. */
  windChime() {
    const base = [84, 86, 88, 91, 93][Math.floor(Math.random() * 5)];
    [0, 7, 12].forEach((d, i) => { if (Math.random() < 0.7) this.tone(mtof(base + d), { type: 'sine', dur: 2.2, vol: 0.025, when: i * 0.13 + Math.random() * 0.1, rev: 0.8 }); });
  }
  fanfare() {
    const r = (ROOTS[this.season] || 60) + 12;
    [0, 4, 7, 12, 7, 12, 16, 19, 24].forEach((d, i) => this.pluck(r + d, i * 0.11, 0.12));
    this.pad([r - 12, r - 5, r, r + 4, r + 7], 0.9, 3.5, 0.06);
    [0, 0.45, 0.9].forEach(w => this.noise({ dur: 0.08, vol: 0.08, freq: 3200, q: 2, when: w }));
  }
  star() { [0, 7, 12, 16, 19, 24].forEach((d, i) => this.tone(mtof(79 + d), { dur: 0.8, vol: 0.07, when: i * 0.07, rev: 0.8 })); }
  lamp() {
    const r = ROOTS[this.season] || 60;
    this.pad([r - 12, r - 5, r, r + 4, r + 7], 0, 4.5, 0.06);
    [0, 4, 7, 11, 14, 19, 24].forEach((d, i) => this.pluck(r + 12 + d, 0.3 + i * 0.11, 0.1));
    this.noise({ dur: 1.2, vol: 0.08, freq: 5000, sweep: 0.3, type: 'highpass' });
  }
  bell() {
    for (const [m, v] of [[1, 0.2], [2.01, 0.1], [2.76, 0.08], [4.07, 0.05], [5.4, 0.03]]) this.tone(196 * m, { dur: 4 * (1.2 - m * 0.1), vol: v, rev: 0.6 });
  }
  whistle() {
    for (const f of [587, 740, 880]) this.tone(f, { type: 'sawtooth', dur: 1.3, vol: 0.03, attack: 0.08, filter: 2200, rev: 0.5 });
  }
  chuff(vol = 1) { this.noise({ dur: 0.22, vol: 0.12 * vol, freq: 380, q: 0.7, type: 'lowpass' }); }
  hammer() { this.tone(180, { dur: 0.12, vol: 0.14, rev: 0.2 }); this.noise({ dur: 0.06, vol: 0.12, freq: 2400 }); }
  reel() { this.noise({ dur: 0.04, vol: 0.05, freq: 3200, q: 6 }); }
  /** The Star Kite: a breathy wind plus a soft propeller buzz, rising with thrust (0..1). */
  kiteHum(on, thrust = 0.5) {
    const c = this.ctx;
    if (!c) return;
    if (!this.kite && on) {
      const wind = this.loop(900, 'bandpass', 0.22);
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 90;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
      const g = c.createGain(); g.gain.value = 0;
      o.connect(f); f.connect(g); g.connect(this.sfx); o.start();
      this.kite = { wind, o, g };
    }
    if (!this.kite) return;
    const t = c.currentTime, k = this.kite;
    k.wind.g.gain.setTargetAtTime(on ? 0.05 + thrust * 0.18 : 0, t, 0.25);
    k.wind.f.frequency.setTargetAtTime(600 + thrust * 900, t, 0.3);
    k.g.gain.setTargetAtTime(on ? 0.012 + thrust * 0.02 : 0, t, 0.2);
    k.o.frequency.setTargetAtTime(80 + thrust * 70, t, 0.2);
  }

  bubble() { this.tone(300 + Math.random() * 400, { dur: 0.12, vol: 0.04, glide: 1.8, rev: 0.2 }); }
  good() { [0, 7, 12].forEach((d, i) => this.tone(mtof(81 + d), { type: 'triangle', dur: 0.25, vol: 0.07, when: i * 0.05 })); }
  bad() { this.tone(220, { type: 'square', dur: 0.2, vol: 0.04, filter: 900, glide: 0.7 }); }
  chime(n = 0) { const r = 72 + [0, 2, 4, 5, 7, 9][n % 6]; [0, 4, 7, 12, 16].forEach((d, i) => this.pluck(r + d, i * 0.18, 0.1)); }
  firework(when = 0) {
    this.noise({ dur: 0.9, vol: 0.05, freq: 1500, sweep: 3, when });
    this.noise({ dur: 1.3, vol: 0.22, freq: 260, type: 'lowpass', when: when + 0.9 });
    this.noise({ dur: 1.6, vol: 0.05, freq: 5000, type: 'highpass', when: when + 1.0 });
  }

  // ---------------------------------------------------------------- ambience
  loop(freq, type, vol) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = c.createGain(); g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(this.ambBus); s.start();
    return { g, f, base: vol };
  }

  startAmbience() {
    this.amb.river = this.loop(700, 'lowpass', 0.14);
    this.amb.wind = this.loop(420, 'lowpass', 0.12);
  }

  /** Called every frame: distance to river (m), night 0..1, season, dt. */
  ambience(dt, riverDist, night, season, cozy) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // The wind bed is off: a steady hiss under everything was heard as white noise whenever nothing else played.
    // The river is only heard close to its bank, and quietly (it is filtered noise too).
    this.ambAt = t;
    this.amb.river.g.gain.setTargetAtTime(this.amb.river.base * Math.max(0, 1 - riverDist / 16) ** 1.6, t, 0.3);
    this.amb.wind.g.gain.setTargetAtTime(0, t, 0.3);
    // if the game stops asking (a pause, a title screen, a round that freezes the valley), the bed fades instead of hanging
    this.ambWatch ??= setInterval(() => {
      if (!this.ctx || this.ctx.currentTime - this.ambAt < 0.6) return;
      this.amb.river.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
      this.amb.wind.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
    }, 500);
    this.birdT = (this.birdT ?? 2) - dt;
    if (this.birdT <= 0) {
      this.birdT = 1.5 + Math.random() * 4;
      if (night < 0.4 && season !== 'winter') {
        const base = 2200 + Math.random() * 1600;
        for (let i = 0; i < 2 + Math.floor(Math.random() * 4); i++) this.tone(base * (1 + Math.random() * 0.2), { dur: 0.08, vol: 0.02, when: i * 0.1, glide: 1.3 + Math.random() * 0.4, bus: this.ambBus, rev: 0.3 });
      } else if (night > 0.6 && season !== 'winter') {
        for (let i = 0; i < 3; i++) this.tone(4200, { type: 'square', dur: 0.03, vol: 0.006, when: i * 0.07, bus: this.ambBus, filter: 5000, rev: 0 });
      }
    }
    // (the summer cicadas were an unbroken thread of filtered noise: a hiss, not a song. Taken out with the wind bed.)
    this.musicTick(night, cozy);
  }

  setMusic(season, mood) { this.season = season; this.mood = mood || 'calm'; }

  /** A round that plays a tune of its own (the Festival dance) holds the valley's music while it runs. key: who holds it. */
  holdMusic(key, on) {
    this.musicHolds ??= new Set();
    if (on) this.musicHolds.add(key); else this.musicHolds.delete(key);
  }

  /**
   * One beat of a dance tune (the Festival dance, game/tricks/dance.js), scheduled `when` seconds from now. The round's
   * own clock decides the beats and asks for each one a moment ahead, so the song follows the game (and stops with it).
   *   style  'festival': a plucked pentatonic tune, a soft pad, a taiko thump and a wood block (a bon odori / hat dance feel)
   *          'kpop': a bright synth hook sung by a soft voice lead, bass, kick on every beat, claps and hats
   *   beat   the song's beat number (0..3 the count-in clicks); spb seconds a beat
   *   o      { energy 0..1: more layers as the dancing goes well, crowd 0..1: claps from the watchers, count: a count-in beat }
   */
  danceBeat(style, beat, when, spb, o = {}) {
    if (!this.ctx) return;
    const t = Math.max(0, when), music = this.music, sfx = this.sfx, energy = o.energy ?? 0.5;
    const click = (f, v) => this.tone(f, { type: 'triangle', dur: 0.06, vol: v, when: t, rev: 0.05 });
    if (o.count) { click(beat % 4 === 0 ? 1320 : 990, 0.09); if (beat % 4 === 0) this.noise({ dur: 0.05, vol: 0.05, freq: 3000, q: 2, when: t }); return; }
    const k = ((beat % 4) + 4) % 4, bar = Math.floor(beat / 4) % 4, half = spb / 2;
    const T = DANCE_TUNES[style] || DANCE_TUNES.festival;
    // the chord of the bar, under everything
    if (k === 0) {
      this.pad(T.chords[bar].map(m => m - 12), t, spb * 4, style === 'kpop' ? 0.022 : 0.028);
      this.tone(mtof(T.chords[bar][0] - 24), { type: style === 'kpop' ? 'square' : 'triangle', dur: spb * 1.6, vol: 0.06, when: t, bus: music, rev: 0.1, filter: 420 });
    }
    // the tune: two eighth notes a beat
    for (let e = 0; e < 2; e++) {
      const m = T.tune[bar][k * 2 + e];
      if (m == null) continue;
      const w = t + e * half, v = 0.07 + energy * 0.03;
      if (style === 'kpop') {
        // a soft "voice": two detuned triangles that swell in, and a bright synth an octave down for the hook
        this.tone(mtof(m), { type: 'triangle', dur: half * 1.8, vol: v, attack: 0.03, when: w, bus: music, rev: 0.35, detune: -7 });
        this.tone(mtof(m), { type: 'triangle', dur: half * 1.8, vol: v * 0.7, attack: 0.03, when: w, bus: music, rev: 0.35, detune: 8 });
        if (energy > 0.35) this.tone(mtof(m - 12), { type: 'square', dur: half * 0.9, vol: 0.025, when: w, bus: music, rev: 0.15, filter: 2200 });
      } else {
        this.tone(mtof(m), { type: 'triangle', dur: 0.5, vol: v, when: w, bus: music, rev: 0.4, filter: 3200 });
        this.tone(mtof(m) * 2, { type: 'sine', dur: 0.22, vol: v * 0.3, when: w, bus: music, rev: 0.3 });
      }
    }
    // the drums
    if (style === 'kpop') {
      this.tone(150, { type: 'sine', dur: 0.2, vol: 0.2, when: t, glide: 0.33, rev: 0 });                       // kick on every beat
      if (k === 1 || k === 3) this.noise({ dur: 0.12, vol: 0.12, freq: 1500, q: 0.8, when: t });              // the clap
      this.noise({ dur: 0.035, vol: 0.035 + energy * 0.02, freq: 7500, type: 'highpass', when: t + half });   // hats between the beats
      if (energy > 0.6) this.noise({ dur: 0.03, vol: 0.025, freq: 8000, type: 'highpass', when: t + half * 0.5 });
      // the crowd's chant at the end of the phrase when the stage is on fire
      if ((o.crowd || 0) > 0.55 && bar === 3 && k === 3) {
        for (const [f, d] of [[392, 0], [494, half]]) this.tone(f, { type: 'sawtooth', dur: 0.14, vol: 0.035, when: t + d, filter: 1300, rev: 0.3, bus: sfx });
        this.noise({ dur: 0.2, vol: 0.05, freq: 1200, q: 0.6, when: t, bus: sfx });
      }
    } else {
      if (k === 0 || k === 2) {
        // the taiko: a deep thump with a skin slap
        this.tone(k === 0 ? 92 : 104, { type: 'sine', dur: 0.32, vol: 0.2, when: t, glide: 0.55, rev: 0.2 });
        this.noise({ dur: 0.08, vol: 0.06, freq: 380, type: 'lowpass', when: t });
      } else this.tone(880, { type: 'triangle', dur: 0.05, vol: 0.06, when: t, rev: 0.1 });              // the wood block
      if (energy > 0.45) this.noise({ dur: 0.04, vol: 0.022 + energy * 0.012, freq: 6000, type: 'highpass', when: t + half });
      if (energy > 0.75 && k === 3) this.tone(1320, { type: 'triangle', dur: 0.05, vol: 0.04, when: t + half, rev: 0.1 });
    }
    // the watchers clap along on the backbeat
    if ((o.crowd || 0) > 0.2 && (k === 1 || k === 3)) this.noise({ dur: 0.07, vol: 0.03 + 0.05 * o.crowd, freq: 1900, q: 0.9, when: t + 0.01, bus: sfx });
  }

  musicTick(night) {
    if (!this.ctx || this.musicVol <= 0.001 || this.musicHolds?.size || this.songOn) return;
    const c = this.ctx;
    const tempo = this.mood === 'finale' ? 92 : this.mood === 'tense' ? 64 : 76;
    const beatLen = 60 / tempo / 2;
    if (this.nextNote < c.currentTime - 1) this.nextNote = c.currentTime + 0.1;
    while (this.nextNote < c.currentTime + 0.3) {
      const key = night > 0.6 && this.mood !== 'finale' ? 'night' : this.season;
      const scale = SCALES[key], root = ROOTS[key];
      const bar = Math.floor(this.beat / 8);
      const chord = CHORDS[(bar * (key === 'autumn' ? 3 : 2)) % CHORDS.length];
      const when = this.nextNote - c.currentTime;
      if (this.beat % 16 === 0) this.pad(chord.map(d => root - 12 + d), when, beatLen * 16, this.mood === 'finale' ? 0.05 : 0.03);
      const density = this.mood === 'finale' ? 0.8 : this.mood === 'quiet' ? 0.2 : 0.45;
      if (Math.random() < density) {
        this.walk = ((this.walk ?? 2) + Math.floor(Math.random() * 3) - 1 + scale.length * 3) % (scale.length * 2);
        const deg = this.walk % scale.length, oct = Math.floor(this.walk / scale.length);
        this.pluck(root + scale[deg] + oct * 12, when, 0.07 + Math.random() * 0.04);
      }
      if (this.beat % 8 === 4 && Math.random() < 0.5) this.pluck(root - 12 + chord[0], when, 0.05);
      this.nextNote += beatLen;
      this.beat++;
    }
  }

  // ---------------------------------------------------------------- the morning exercise (game/tricks/exercise.js)
  /** A song of a mini game holds the valley's own music (true) or gives it back (false). */
  song(on) {
    this.songOn = !!on;
    if (!on && this.ctx) this.nextNote = this.ctx.currentTime + 0.4;
  }

  /** A piano note: a quick hammer, a bright partial and a short ring (not a pluck's long tail). */
  piano(midi, when = 0, vol = 0.08, dur = 0.55) {
    const f = mtof(midi);
    this.tone(f, { type: 'triangle', dur, vol, attack: 0.004, when, bus: this.music, rev: 0.25, filter: 3200 });
    this.tone(f * 2.003, { type: 'sine', dur: dur * 0.45, vol: vol * 0.35, attack: 0.003, when, bus: this.music, rev: 0.15 });
    this.tone(f * 0.998, { type: 'sine', dur: dur * 0.8, vol: vol * 0.4, attack: 0.006, when, bus: this.music, rev: 0.2 });
  }

  /**
   * One count of the morning exercise's music, `when` seconds from now. style: 'radio' (a piano march in C, the bass
   * on the count and the chord half a count after: oom-pah), 'workout' (the same tune up a tone, with a kick on every
   * count and a clap on the even ones), 'yoga' (a calm drone with a soft bell, no tune). n: the count from the start
   * of the song; len: seconds a count lasts.
   */
  exerciseBeat(style, n, when, len) {
    if (!this.ctx) return;
    const k = ((n % 16) + 16) % 16, half = len / 2;
    if (style === 'yoga') {
      const root = 50;
      if (n % 8 === 0) this.pad([root - 12, root - 5, root, root + 7], when, len * 8.5, 0.032);
      if (n % 4 === 0) {
        const bell = [74, 76, 79, 81, 79, 76, 74, 71][(n / 4) % 8];
        this.tone(mtof(bell), { type: 'sine', dur: 2.6, vol: 0.035, attack: 0.01, when, bus: this.music, rev: 0.7 });
        this.tone(mtof(bell) * 2.76, { type: 'sine', dur: 1.2, vol: 0.008, attack: 0.01, when, bus: this.music, rev: 0.7 });
      }
      return;
    }
    const up = style === 'workout' ? 2 : 0;
    const TUNE = [67, 72, 76, 79, 76, 72, 74, 0, 77, 76, 74, 72, 71, 72, 74, 0, 76, 79, 81, 79, 76, 72, 74, 76, 77, 74, 71, 67, 72, 0, 72, 0];
    const BASS = [48, 48, 53, 55, 48, 53, 55, 48];
    const CHORD = { 48: [60, 64, 67], 53: [60, 65, 69], 55: [59, 62, 67] };
    const a = TUNE[k * 2], b = TUNE[k * 2 + 1], bass = BASS[Math.floor(k / 2)];
    if (a) this.piano(a + up, when, 0.075);
    if (b) this.piano(b + up, when + half, 0.065);
    if (k % 2 === 0) this.piano(bass + up - 12 * 0, when, 0.07, 0.4);
    else this.piano(bass + up + 7, when, 0.05, 0.35);
    for (const m of CHORD[bass]) this.piano(m + up, when + half, 0.028, 0.22);
    if (style === 'workout') {
      this.tone(110, { type: 'sine', dur: 0.16, vol: 0.12, attack: 0.002, when, bus: this.music, rev: 0, glide: 0.45 });
      if (n % 2 === 1) this.noise({ dur: 0.09, vol: 0.06, freq: 1700, q: 1.1, when, bus: this.music });
      this.noise({ dur: 0.03, vol: 0.02, freq: 7000, q: 0.8, type: 'highpass', when: when + half, bus: this.music });
    }
  }

  /**
   * A sung count, one short syllable a count (the vowels of the numbers in the player's language: "one, two, three...",
   * "ichi, ni, san...", "một, hai, ba..."), from a tiny formant voice. n: 1..8.
   */
  countVoice(n, when = 0, lang = 'en', vol = 0.05) {
    if (!this.ctx) return;
    const SAY = {
      en: [['', 'ʌ'], ['t', 'u'], ['th', 'i'], ['f', 'ɔ'], ['f', 'ai'], ['s', 'ɪ'], ['s', 'ɛ'], ['', 'ei']],
      ja: [['', 'i'], ['n', 'i'], ['s', 'a'], ['sh', 'i'], ['g', 'o'], ['r', 'o'], ['sh', 'i'], ['h', 'a']],
      vi: [['m', 'o'], ['h', 'ai'], ['b', 'a'], ['b', 'o'], ['n', 'a'], ['s', 'au'], ['b', 'ai'], ['t', 'a']],
      ko: [['h', 'a'], ['t', 'u'], ['s', 'e'], ['n', 'e'], ['t', 'a'], ['', 'ʌ'], ['', 'i'], ['', 'ʌ']],
    };
    const F = { a: [800, 1250], e: [480, 1950], ɛ: [580, 1800], i: [300, 2350], ɪ: [400, 2000], o: [450, 850], ɔ: [580, 880], u: [330, 900], ʌ: [660, 1200] };
    const [cons, vow] = (SAY[lang] || SAY.en)[(n - 1) % 8];
    const c = this.ctx, t0 = c.currentTime + when, dur = 0.2, f0 = 290 * (n === 1 || n === 5 ? 1.12 : 1) * (1 + 0.02 * ((n - 1) % 4));
    let t = t0;
    if (cons === 's' || cons === 'sh' || cons === 'th' || cons === 'f' || cons === 'h') {
      const fr = cons === 's' ? 6200 : cons === 'sh' ? 3600 : cons === 'h' ? 1800 : 5000;
      this.noise({ dur: 0.06, vol: vol * (cons === 'h' || cons === 'f' || cons === 'th' ? 0.5 : 0.9), freq: fr, q: 1.2, type: 'bandpass', when });
      t += 0.045;
    } else if (cons === 't' || cons === 'b' || cons === 'g') {
      this.noise({ dur: 0.02, vol: vol * 0.7, freq: cons === 't' ? 4000 : 900, q: 0.8, when });
      t += 0.02;
    }
    const src = c.createOscillator(), g = c.createGain();
    src.type = 'sawtooth';
    src.frequency.setValueAtTime(f0, t);
    src.frequency.linearRampToValueAtTime(f0 * 0.9, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + (cons === 'n' || cons === 'm' ? 0.04 : 0.015));
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    const glide = vow.length === 2 ? vow : null, v0 = F[glide ? glide[0] : vow] || F.a, v1 = glide ? F[glide[1]] || v0 : v0;
    for (const [i, gain] of [[0, 1], [1, 0.5]]) {
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass'; bp.Q.value = 7;
      bp.frequency.setValueAtTime(v0[i], t);
      bp.frequency.linearRampToValueAtTime(v1[i], t + dur * 0.8);
      const ga = c.createGain(); ga.gain.value = gain * 2.2;
      src.connect(bp); bp.connect(ga); ga.connect(g);
    }
    g.connect(this.sfx);
    const s = c.createGain(); s.gain.value = 0.12; g.connect(s); s.connect(this.reverb);
    src.start(t); src.stop(t + dur + 0.05);
  }
}
