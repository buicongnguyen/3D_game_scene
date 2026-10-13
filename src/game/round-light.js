// Round-light: what every mini game round switches off for as long as it runs, the walking games included (they need
// the live valley, so focus mode, engine/focus.js, is not for them). Nothing a game plays with is touched:
//   - the Low tier (phones) starts ROUND_FLOOR steps down the frame governor's own ladder (engine/governor.js: fewer far
//     people and props, the shadow map refreshed every third frame, the picture at 85 %), exactly as the scene tour does;
//   - bloom is off by day (a dozen full-screen passes that only show on lamps and fireflies: at night it stays);
//   - the weather particles pause (petals, leaves, snow);
//   - Town Life plans only every TOWN_EVERY-th frame, with the time that passed (people keep walking and animating every
//     frame: only their decisions come a few hundredths of a second later).
// Held by owner: the trick framework and the yard runner hold it for a round, the Mini games menu for a launch and a
// little after (so picking the next game does not switch everything twice). Everything is put back when the last
// owner lets go. `?roundlight=off` (or window.__STARLINE_QA__.noRoundLight) turns it off, to measure what it gains.

export const ROUND_FLOOR = 2;
export const TOWN_EVERY = 4;
export const LINGER = 20;          // seconds the menu's hold outlives a game in an Explore session

export class RoundLight {
  constructor(game) {
    this.g = game;
    this.owners = new Set();
    this.on = false;
    this.saved = null;
    this.n = 0; this.acc = 0;
    this.linger = null;
  }

  get disabled() {
    const g = this.g;
    return g.params?.get?.('roundlight') === 'off' || (typeof window !== 'undefined' && !!window.__STARLINE_QA__?.noRoundLight);
  }

  hold(owner) { this.cancelLinger(owner); this.owners.add(owner); this.sync(); }
  release(owner) { this.cancelLinger(owner); this.owners.delete(owner); this.sync(); }
  /** Let go `seconds` from now, unless the owner holds again first. */
  releaseLater(owner, seconds = LINGER) {
    this.cancelLinger(owner);
    if (!this.owners.has(owner)) return;
    this.linger = { owner, id: setTimeout(() => { this.linger = null; this.release(owner); }, seconds * 1000) };
  }
  cancelLinger(owner) { if (this.linger && this.linger.owner === owner) { clearTimeout(this.linger.id); this.linger = null; } }

  sync() {
    const want = this.owners.size > 0 && !this.disabled;
    if (want === this.on) return;
    if (want) this.apply(); else this.restore();
  }

  apply() {
    const g = this.g, R = g.renderer;
    this.saved = { floor: R?.floor || 0 };
    this.on = true;
    this.n = 0; this.acc = 0;
    R?.setFloor?.(Math.max(this.saved.floor, ROUND_FLOOR));
    if (g.fx) g.fx.weatherHold = true;
  }

  restore() {
    const g = this.g, R = g.renderer, s = this.saved;
    this.on = false;
    this.saved = null;
    if (g.fx) g.fx.weatherHold = false;
    if (R?.bloom && R.q) R.bloom.enabled = !!R.q.bloom;
    if (s) R?.setFloor?.(s.floor);
  }

  /**
   * Every frame of Director.update while it is on. Returns the seconds Town Life should plan for now (0: not this frame).
   */
  frame(dt) {
    const g = this.g, R = g.renderer;
    // bloom: by day it is a dozen passes for a glow nobody sees; lamps, fireflies and the stars keep theirs
    if (R?.bloom && R.q?.bloom && R.qualityName === 'low') { const want = (g.night || 0) > 0.2; if (R.bloom.enabled !== want) R.bloom.enabled = want; }
    this.acc += dt;
    if (++this.n % TOWN_EVERY) return 0;
    const t = Math.min(this.acc, 0.25);
    this.acc = 0;
    return t;
  }
}
