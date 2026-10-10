// Minigame rules (pure; Node-testable). The director drives them each frame and renders their state.
// (Fishing has its own rules and view now: src/game/fishing/.)

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
