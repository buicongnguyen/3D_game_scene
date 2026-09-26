// Minigame rules (pure; Node-testable). The director drives them each frame and renders their state.

/** Fishing: wait for a bite, strike within the window, then keep the fish inside the reel zone. */
export class Fishing {
  constructor({ difficulty = 0.35, rand = Math.random, dusk = false } = {}) {
    this.rand = rand;
    this.difficulty = difficulty;
    this.phase = 'wait';
    this.t = 0;
    this.biteAt = 1.4 + rand() * 2.6;
    this.zone = 0.5;
    this.zoneV = 0;
    this.zoneW = 0.3 - difficulty * 0.1;
    this.fish = 0.5;
    this.fishTarget = 0.5;
    this.progress = 0.3;
    this.result = null;
    this.species = dusk && rand() < 0.45 ? 'starfin' : rand() < 0.62 ? 'trout' : rand() < 0.6 ? 'char' : 'koi';
    if (this.species === 'starfin') this.difficulty = 0.6;
  }

  get title() {
    return { wait: 'Wait for a bite…', bite: 'A bite! Strike now!', reel: 'Reel it in!', done: this.result === 'caught' ? 'Caught!' : 'It got away…' }[this.phase];
  }

  /** press = strike/reel button went down this frame; hold = held. Returns the phase. */
  update(dt, press, hold) {
    this.t += dt;
    if (this.phase === 'wait') {
      if (press) { this.phase = 'done'; this.result = 'early'; return this.phase; }
      if (this.t >= this.biteAt) { this.phase = 'bite'; this.t = 0; }
    } else if (this.phase === 'bite') {
      if (press) { this.phase = 'reel'; this.t = 0; }
      else if (this.t > 1.1) { this.phase = 'wait'; this.t = 0; this.biteAt = 1.2 + this.rand() * 2.2; this.missed = (this.missed || 0) + 1; if (this.missed > 2) { this.phase = 'done'; this.result = 'escaped'; } }
    } else if (this.phase === 'reel') {
      // fish darts around; harder fish change target more often and further
      if (this.rand() < dt * (1.1 + this.difficulty * 2.2)) this.fishTarget = Math.min(0.97, Math.max(0.03, this.fish + (this.rand() - 0.5) * (0.4 + this.difficulty * 0.7)));
      this.fish += (this.fishTarget - this.fish) * (1 - Math.exp(-dt * (2 + this.difficulty * 3)));
      this.zoneV += (hold ? 2.6 : -2.0) * dt;
      this.zoneV *= Math.exp(-dt * 2.2);
      this.zone += this.zoneV * dt;
      if (this.zone < this.zoneW / 2) { this.zone = this.zoneW / 2; this.zoneV = Math.max(0, this.zoneV) * 0.3; }
      if (this.zone > 1 - this.zoneW / 2) { this.zone = 1 - this.zoneW / 2; this.zoneV = Math.min(0, this.zoneV) * 0.3; }
      const inside = Math.abs(this.fish - this.zone) < this.zoneW / 2;
      this.progress += (inside ? 0.34 : -0.2 - this.difficulty * 0.1) * dt;
      if (this.progress >= 1) { this.phase = 'done'; this.result = 'caught'; }
      else if (this.progress <= 0 || this.t > 30) { this.phase = 'done'; this.result = 'escaped'; }
    }
    return this.phase;
  }

  view() { return { title: this.title, phase: this.phase, zone: this.zone, zoneW: this.zoneW, fish: this.fish, progress: Math.max(0, Math.min(1, this.progress)) }; }
}

/** Cooking: press when the shrinking ring meets the gold circle. Four good stirs cook the dish. */
export class Cooking {
  constructor({ period = 1.5, need = 4 } = {}) {
    this.period = period;
    this.need = need;
    this.t = 0;
    this.good = 0;
    this.presses = 0;
    this.flash = 0;
    this.lastGood = false;
    this.done = false;
  }

  get ring() { return 1 - 0.62 * ((this.t % this.period) / this.period); }

  update(dt, press) {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt);
    if (press && !this.done) {
      const r = this.ring;
      this.lastGood = r > 0.49 && r < 0.66;
      this.presses++;
      if (this.lastGood) this.good++;
      this.flash = 0.35;
      // no one fails a bear's dinner: after many tries every press counts
      if (!this.lastGood && this.presses > 10) this.good++;
      if (this.good >= this.need) this.done = true;
    }
    return this.done;
  }

  view() { return { ring: this.ring, flash: this.flash, good: this.lastGood, progress: this.good / this.need }; }
}
