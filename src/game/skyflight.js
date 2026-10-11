// "Fly up" in the sky viewer (game/skygaze.js): the Star Kite lifts Mika straight up from where she stands, so the
// valley's mountains drop below the horizon and the star groups show where they really are, then brings her back to
// the same spot. Pure maths and a small state machine (no three.js, no DOM): tests/skyflight.test.mjs drives it.
//
// Phases:  ground -> summon (the kite swoops in and takes hold) -> up -> hover -> down -> ground
//   any time: 'down' (Come down), 'leave' (the viewer is closing: a fast, gentle descent, 3 s at most),
//             'snap' (something else took the screen: straight to the ground, no flying).
// The altitude is in metres above the take-off feet. It moves with a limited speed and a limited acceleration, so
// every reversal (up, then at once down again) is as smooth as the first lift, whenever it comes.
//
// The sky viewer also keeps a sky-only clock (the "sky time"): the hour the stars are drawn for, in half-hour steps
// inside the night. The game clock is never touched.

import { SKY_LIFT_DEFAULT, SKY_LIFT_MIN, SKY_LIFT_MAX } from '../content/skyspots.js';

export { SKY_LIFT_DEFAULT, SKY_LIFT_MIN, SKY_LIFT_MAX };    // metres above the spot (content/skyspots.js has a figure per spot)
export const KITE_GRAB = 3;                   // the kite's own first lift (KITE.lift): where the guided climb takes over

/** Speed limit (m/s) and acceleration (m/s²) of each movement. A 130 m climb takes about five seconds. */
export const PROFILE = {
  up: { vmax: 44, a: 22 },
  down: { vmax: 38, a: 18 },
  leave: { vmax: 100, a: 80 },                // an exit while up: under 3 s from anywhere in the climb (a fast, smooth drop)
};
export const LEAVE_MAX_S = 3;
export const BRAKE = 0.92;                    // advance() brakes at this share of the acceleration, so a frame's step never overshoots the stop
export const SUMMON_MAX_S = 8;                // the kite did not come (something is in the way): give up

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Move `s` ({ alt, vel }) toward `target` with the profile's limits; it arrives with no speed left and never overshoots. */
export function advance(s, target, dt, P) {
  dt = Math.min(dt, 0.1);
  const d = target - s.alt, dir = Math.sign(d);
  if (!dir) { s.vel = 0; return true; }
  // (the last metre eases in: the speed is capped by the distance left, so she touches down at a walking pace)
  const vDes = dir * Math.min(P.vmax, Math.sqrt(2 * BRAKE * P.a * Math.abs(d)), 8 * Math.abs(d) + 0.3);
  s.vel += clamp(vDes - s.vel, -P.a * dt, P.a * dt);
  s.alt += s.vel * dt;
  if ((target - s.alt) * dir <= 0 || (Math.abs(target - s.alt) < 0.03 && Math.abs(s.vel) < 1)) { s.alt = target; s.vel = 0; return true; }
  return false;
}

/** The time (s) a climb or a descent of `metres` takes with a profile (what advance() does, in closed form). */
export function travelTime(metres, P) {
  const b = P.a * BRAKE, ramp = P.vmax / P.a, brake = P.vmax / b;
  const dist = P.vmax * (ramp + brake) / 2;   // up to speed and down to a stop, in metres
  return metres >= dist ? ramp + brake + (metres - dist) / P.vmax : Math.sqrt(2 * metres * (1 / P.a + 1 / b));
}

/** How much of the "low groups are lifted" cheat is left at an altitude: 1 on the ground, 0 at the top. */
export const liftScale = (alt, lift) => clamp(1 - alt / Math.max(1, lift), 0, 1);

export class SkyFlight {
  /** @param {{lift?:number}} o  lift: the sky altitude of the spot, in metres above the take-off feet. */
  constructor({ lift = SKY_LIFT_DEFAULT } = {}) {
    this.lift = clamp(Number.isFinite(lift) ? lift : SKY_LIFT_DEFAULT, SKY_LIFT_MIN, SKY_LIFT_MAX);
    this.phase = 'ground';
    this.alt = 0; this.vel = 0;
    this.t = 0;                     // seconds in this phase
    this.mode = 'down';             // the profile of the descent in progress ('down' | 'leave')
    this.leaving = false;
  }

  get airborne() { return this.phase === 'up' || this.phase === 'hover' || this.phase === 'down'; }
  /** Anything but standing on the ground: the viewer must not close on its own until the flight is over. */
  get busy() { return this.phase !== 'ground'; }
  /** 0 on the ground, 1 at the top. */
  get progress() { return clamp(this.alt / this.lift, 0, 1); }
  /** What is left of the lift cheat (1 = full, 0 = none). */
  get liftK() { return this.airborne ? liftScale(this.alt, this.lift) : 1; }
  /** Is "Fly up" (rather than "Come down") what a press would do now? */
  get wantsUp() { return this.phase === 'ground' || (this.phase === 'down' && this.mode !== 'leave'); }

  /**
   * Ask for something. 'up' | 'down' | 'leave' | 'snap'. Returns the events it caused (strings), possibly none.
   * 'up' is ignored while the viewer is closing.
   */
  request(what) {
    const ev = [];
    if (what === 'snap') {
      if (this.phase !== 'ground') ev.push(this.airborne ? 'snap' : 'cancel');
      this.reset();
      return ev;
    }
    if (what === 'up') {
      if (this.leaving) return ev;
      if (this.phase === 'ground') { this.phase = 'summon'; this.t = 0; ev.push('summon'); }
      else if (this.phase === 'down') { this.phase = 'up'; this.t = 0; ev.push('ascend'); }
      return ev;
    }
    if (what === 'down' || what === 'leave') {
      const fast = what === 'leave';
      if (fast) this.leaving = true;
      if (this.phase === 'summon') { this.reset(); ev.push('cancel'); }          // the kite had not taken hold yet
      else if (this.phase === 'up' || this.phase === 'hover') { this.phase = 'down'; this.t = 0; this.mode = fast ? 'leave' : 'down'; ev.push('descend'); }
      else if (this.phase === 'down' && fast && this.mode !== 'leave') { this.mode = 'leave'; }
    }
    return ev;
  }

  reset() { this.phase = 'ground'; this.alt = 0; this.vel = 0; this.t = 0; this.mode = 'down'; }

  /**
   * Advance by dt seconds. kiteReady: the kite has taken hold of Mika and the guided climb may begin.
   * Returns the events of this step: 'ascend' (the climb begins), 'top', 'touchdown', 'abort' (the kite never came).
   */
  update(dt, kiteReady = false) {
    const ev = [];
    this.t += dt;
    if (this.phase === 'summon') {
      if (kiteReady) { this.phase = 'up'; this.t = 0; this.alt = KITE_GRAB; this.vel = 0; ev.push('ascend'); }
      else if (this.t > SUMMON_MAX_S) { this.reset(); ev.push('abort'); }
    } else if (this.phase === 'up') {
      if (advance(this, this.lift, dt, PROFILE.up)) { this.phase = 'hover'; this.t = 0; ev.push('top'); }
    } else if (this.phase === 'down') {
      if (advance(this, 0, dt, PROFILE[this.mode])) { this.reset(); ev.push('touchdown'); }
    }
    return ev;
  }
}

// ------------------------------------------------------------------------------------------------ sky time
// The night, as a continuous axis of hours: 19:00 is 19, midnight is 24, 05:00 is 29.
export const NIGHT = { from: 19, to: 29, step: 0.5 };

/** A clock hour (0..24) on the night axis, or null in the daytime (06:00-18:59 are not part of the night). */
export function nightAxis(hour) {
  const h = ((hour % 24) + 24) % 24, v = h < 12 ? h + 24 : h;
  return v >= NIGHT.from - 0.25 && v <= NIGHT.to + 0.25 ? clamp(v, NIGHT.from, NIGHT.to) : null;
}
/** The clock hour (0..24) of a point on the night axis. */
export const clockOf = v => ((v % 24) + 24) % 24;

/** One 30-minute step later (dir +1) or earlier (dir -1), on the half hours, inside the night. Returns the same value at the ends. */
export function stepNight(v, dir) {
  const s = NIGHT.step, eps = 1e-6;
  const next = dir > 0 ? Math.floor(v / s + eps) * s + s : Math.ceil(v / s - eps) * s - s;
  return clamp(next, NIGHT.from, NIGHT.to);
}
export const canStepNight = (v, dir) => stepNight(v, dir) !== v;

/** "21:30" for an hour (0..24, fractions are minutes). */
export function hhmm(hour) {
  const m = Math.round((((hour % 24) + 24) % 24) * 60) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
/** The sun or the moon for the chip: the moon from 18:00 to 06:00. */
export const hourIcon = hour => { const h = ((hour % 24) + 24) % 24; return h >= 6 && h < 18 ? 'sun' : 'moon'; };
