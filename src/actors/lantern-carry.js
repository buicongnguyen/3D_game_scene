// Where Mika carries Sora's lantern: WORN on her belt at the right hip (hands free) or HELD up in her right hand.
// This file is the pure part (no three.js; tests/lantern.test.mjs imports it): the rule that picks the state, the
// reasons other systems give, and the little pendulum that makes it sway. ./lantern-rig.js moves the model.
//
//   worn  by day, and whenever her hands are busy (fishing, a net, a kite line, cheering, sitting, swimming…)
//   held  after dark, walking or standing; while she aims it; and when an activity needs it in her hand
//
// Other systems never touch the mesh: they ask,  player.carry.want('worn' | 'held', 'my-key')  and later
// player.carry.release('my-key')  (or want('auto', 'my-key')). One key, one wish: asking twice is harmless.

export const CARRY = {
  blend: 0.35,          // seconds from belt to hand (and back)
  darkOn: 0.6,          // night level (0..1, the sky's own) at which she takes it in her hand…
  darkOff: 0.4,         // …and the level it must fall back to before it goes on the belt again
  settle: 0.45,         // she must have been free (on her feet, no gesture, not in a scene) this long to change by herself
};

/** Clips that keep her body busy for as long as they play: nothing asked by anyone puts the lantern in her hand. */
export const BODY_CLIPS = new Set(['Sit', 'SitFloor', 'Swim', 'Tread', 'Hang']);
/** Gestures that use her hands: the lantern goes to the belt, unless an activity asked for it in her hand. */
export const HAND_CLIPS = new Set(['Cast', 'Reel', 'Cheer', 'Stir', 'Hammer', 'Pet', 'Talk', 'Interact']);
/** Clips that hold the lantern out themselves. */
export const LANTERN_CLIPS = new Set(['Aim']);
/** Clips in which a held lantern is carried raised in front of her (the rig bends her right arm). */
export const CARRY_CLIPS = new Set(['Idle', 'Walk', 'Run', 'Jump', 'Fall', 'Land', 'Point', 'Wave']);

/** The wishes of other systems, by key. */
export class Reasons {
  constructor() { this.map = new Map(); this.held = 0; this.worn = 0; }
  /** state: 'held' | 'worn' | 'auto' (= no wish any more). */
  want(state, key = 'default') {
    this.release(key);
    if (state !== 'held' && state !== 'worn') return;
    this.map.set(key, state);
    this[state]++;
  }
  release(key = 'default') {
    const was = this.map.get(key);
    if (!was) return;
    this.map.delete(key);
    this[was]--;
  }
  has(key) { return this.map.has(key); }
  keys() { return [...this.map.keys()]; }
}

/** Is it dark enough to carry the lantern in hand? `was`: the answer last time (so it does not flip at the threshold). */
export function darkLatch(dark, was) {
  return was ? dark > CARRY.darkOff : dark >= CARRY.darkOn;
}

/**
 * The state she should be in now. In order:
 *   body busy (swimming, climbing, sitting, hanging from the kite)      -> worn
 *   someone asked for it in her hand (the night river)                  -> held
 *   she aims it                                                         -> held
 *   someone asked for free hands (fishing, a trick, the yard, the sky)  -> worn
 *   a gesture that uses her hands                                       -> worn
 *   otherwise by the dark, but only once she has been free for a moment: never in mid-air, mid-gesture or mid-scene.
 * inp: { body, aim, hands, held, worn, dark (latched bool), freeFor (s) }, prev: 'held' | 'worn'.
 */
export function resolveCarry(inp, prev = 'worn') {
  if (inp.body) return 'worn';
  if (inp.held > 0) return 'held';
  if (inp.aim) return 'held';
  if (inp.worn > 0) return 'worn';
  if (inp.hands) return 'worn';
  if (!(inp.freeFor >= CARRY.settle)) return prev;
  return inp.dark ? 'held' : 'worn';
}

/** The same from the clip she plays. */
export function clipKind(name) {
  return BODY_CLIPS.has(name) ? 'body' : HAND_CLIPS.has(name) ? 'hands' : LANTERN_CLIPS.has(name) ? 'aim' : CARRY_CLIPS.has(name) ? 'carry' : 'other';
}

// ---------------------------------------------------------------------------------------------- the sway
// A damped pendulum with two small angles (x, z: the way the bottom of the lantern leans, radians), pushed by the
// acceleration of the point it hangs from. No engine, no allocation: four numbers.
export const SWAY = {
  w2: 52,               // (rad/s)^2: a 19 cm pendulum
  dampWorn: 5.2,        // 1/s: it rubs on her coat
  dampHeld: 3.0,
  gain: 0.3,            // how much of the push it takes (a real one would take 1 / length)
  maxAcc: 40,           // m/s^2: a teleport or a hitch never throws it
  max: 0.6,             // rad, either way, in her hand
  wornOut: 0.5,         // on the belt: this far away from her…
  wornIn: 0.04,         // …but hardly into her coat
  step: 1 / 120,
};

export function makeSway() { return { x: 0, z: 0, vx: 0, vz: 0 }; }

/**
 * Advance the sway by dt. ax, az: acceleration of the hanging point (m/s^2) along the two axes; worn: on the belt
 * (limits lo..hi along x: her body is on the +x side; more damping). Returns s. Always finite and inside the limits.
 */
export function stepSway(s, ax, az, dt, worn = false) {
  const S = SWAY;
  if (!(dt > 0)) return s;
  if (!Number.isFinite(ax)) ax = 0;
  if (!Number.isFinite(az)) az = 0;
  ax = Math.max(-S.maxAcc, Math.min(S.maxAcc, ax));
  az = Math.max(-S.maxAcc, Math.min(S.maxAcc, az));
  const damp = worn ? S.dampWorn : S.dampHeld;
  const lo = worn ? -S.wornOut : -S.max, hi = worn ? S.wornIn : S.max;
  let left = Math.min(dt, 0.1);
  while (left > 1e-6) {
    const h = Math.min(S.step, left);
    left -= h;
    // the bob lags behind the hand: a push forward leans it back
    s.vx += (-S.w2 * Math.sin(s.x) - damp * s.vx - ax * S.gain / 0.19) * h;
    s.vz += (-S.w2 * Math.sin(s.z) - damp * s.vz - az * S.gain / 0.19) * h;
    s.x += s.vx * h;
    s.z += s.vz * h;
    if (s.x < lo) { s.x = lo; if (s.vx < 0) s.vx = 0; } else if (s.x > hi) { s.x = hi; if (s.vx > 0) s.vx = 0; }
    if (s.z < -S.max) { s.z = -S.max; if (s.vz < 0) s.vz = 0; } else if (s.z > S.max) { s.z = S.max; if (s.vz > 0) s.vz = 0; }
  }
  if (!Number.isFinite(s.x + s.z + s.vx + s.vz)) { s.x = s.z = s.vx = s.vz = 0; }
  return s;
}

/** Smooth 0..1. */
export function ease(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

/** Move the blend (0 = on the belt, 1 = in her hand) toward the state. */
export function stepBlend(t, state, dt) {
  const d = dt / CARRY.blend;
  return state === 'held' ? Math.min(1, t + d) : Math.max(0, t - d);
}

/**
 * How far the lantern must lean out so that its bottom stays on a surface instead of sinking into it (sitting on a
 * bench or on the floor): drop = height of the hanging point over the surface, len = length of the lantern.
 */
export function restLean(drop, len) {
  if (!(len > 0) || drop >= len) return 0;
  return Math.min(1.35, Math.acos(Math.max(0, drop) / len));
}

/** The lantern's own light: brightness (0..1 of full) and reach (m) for a blend, at a night level. */
export function lanternLight(blend, night) {
  const e = ease(blend), n = Math.max(0, Math.min(1, (night - 0.25) / 0.5));
  return { level: n * (0.5 + 0.5 * e), range: 6.5 + 3 * e };
}
