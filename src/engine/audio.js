// Procedural audio (WebAudio): generative seasonal music, voice blips, SFX and ambience. No downloads.

const SCALES = {
  spring: [0, 2, 4, 7, 9], summer: [0, 2, 4, 7, 9], autumn: [0, 3, 5, 7, 10], winter: [0, 2, 3, 7, 8], night: [0, 2, 5, 7, 9],
};
const ROOTS = { spring: 62, summer: 64, autumn: 60, winter: 57, night: 58 };
const CHORDS = [[0, 4, 7], [5, 9, 12], [7, 11, 14], [9, 12, 16], [2, 5, 9], [4, 7, 11]];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

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
    this.amb.river = this.loop(700, 'lowpass', 0.35);
    this.amb.wind = this.loop(420, 'lowpass', 0.12);
  }

  /** Called every frame: distance to river (m), night 0..1, season, dt. */
  ambience(dt, riverDist, night, season, cozy) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.amb.river.g.gain.setTargetAtTime(this.amb.river.base * Math.max(0, 1 - riverDist / 45) ** 1.6, t, 0.3);
    this.amb.wind.g.gain.setTargetAtTime(this.amb.wind.base * (0.6 + (season === 'winter' ? 0.8 : 0.2) + Math.sin(t * 0.2) * 0.3), t, 0.5);
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
    if (season === 'summer' && night < 0.3) {
      this.cicT = (this.cicT ?? 0) - dt;
      if (this.cicT <= 0) { this.cicT = 0.12; this.noise({ dur: 0.1, vol: 0.006, freq: 6200, q: 8, bus: this.ambBus }); }
    }
    this.musicTick(night, cozy);
  }

  setMusic(season, mood) { this.season = season; this.mood = mood || 'calm'; }

  musicTick(night) {
    if (!this.ctx || this.musicVol <= 0.001) return;
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
}
