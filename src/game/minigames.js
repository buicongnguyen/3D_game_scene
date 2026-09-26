// Minigame rules (pure; Node-testable). The director drives them each frame and renders their state.
// Both are deliberately one-button: the fun is in the moment, not in the input.

/** Fishing: the float bobs, then dips — press E while it is under and the fish is yours.
 *  Pressing early does nothing and a missed bite just comes round again: nothing is ever lost. */
export class Fishing {
  constructor({ rand = Math.random, dusk = false, window = 1.6 } = {}) {
    this.rand = rand;
    this.window = window;
    this.phase = 'wait';
    this.t = 0;
    this.biteAt = 1.2 + rand() * 2.0;
    this.bites = 0;
    this.result = null;
    this.species = dusk && rand() < 0.45 ? 'starfin' : rand() < 0.62 ? 'trout' : rand() < 0.6 ? 'char' : 'koi';
  }

  get title() {
    return { wait: 'Wait for the float to dip…', bite: 'A bite! Press {act}!', done: 'Caught!' }[this.phase];
  }

  /** press = the action button went down this frame. Returns the phase. */
  update(dt, press) {
    this.t += dt;
    if (this.phase === 'wait') {
      if (this.t >= this.biteAt) { this.phase = 'bite'; this.t = 0; this.bites++; }
    } else if (this.phase === 'bite') {
      if (press) { this.phase = 'done'; this.result = 'caught'; }
      else if (this.t > this.window) { this.phase = 'wait'; this.t = 0; this.biteAt = 1.0 + this.rand() * 1.6; }
    }
    return this.phase;
  }

  view() { return { title: this.title, phase: this.phase, bite: this.phase === 'bite' ? 1 - this.t / this.window : 0 }; }
}

/** Cooking: press E at the hearth and the pot does the rest; a short progress bar fills. */
export class Cooking {
  constructor({ duration = 2.6 } = {}) {
    this.duration = duration;
    this.t = 0;
    this.done = false;
  }

  update(dt) {
    this.t += dt;
    if (this.t >= this.duration) this.done = true;
    return this.done;
  }

  view() { return { progress: Math.min(1, this.t / this.duration), done: this.done }; }
}
