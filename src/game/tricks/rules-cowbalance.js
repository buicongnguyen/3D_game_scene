// Cow race, the bareback heats: the rider's balance. Pure rules (no three.js, no DOM), seeded, so a run replays in Node.
//
// In a bareback heat the cows keep their lanes and left / right is not steering any more: it is LEANING. While the cow
// runs, the rider slowly tips to one side (tilt, -1 = all the way left .. +1 = all the way right); the player leans the
// other way to bring her back to the middle. Past the edge she slides off into the grass, sits there for a moment and
// climbs back on: a few seconds lost, the race goes on.
//
//   d tilt / dt = drift(t) * rock(v)  +  grow * tilt  +  jolt  +  lean * power
//
//   drift   a slow seeded sway, a few seconds one way and then the other ("she gradually goes left or right")
//   rock    the cow's speed: a gallop rocks more than a trot, a standing cow does not rock at all
//   grow    the further she has tipped, the faster she goes (so a tip left alone always ends in the grass)
//   jolt    a short shove that fades in a quarter of a second: a tap off the beat, a bump on the track, the mud, a rival
//           brushing past in the next lane
//   lean    the player (-1..1), eased a little so a key press is not a jerk
//
// The first-order model is on purpose: holding "left" moves the marker left at a steady pace, which a child reads at once
// (a real pendulum, with its momentum, is a juggling act on a touch screen).
import { rng } from '../../engine/spline.js';

/**
 * The two kinds of bareback heat.
 *   warn    from here the gauge is red and the rider flails: the warning before the fall (the green middle is narrower on wild)
 *   cost    seconds in the grass before she is back on
 *   grace   seconds without any tipping after the start and after a remount
 *   keep    how much of the streak a fall leaves (times)
 *   restart how much of her speed the cow has again the moment the rider is back on (times): on gentle the cow trots
 *           straight off, so a fall costs little more than its two seconds; on wild she starts from a walk
 *   rivals  the chance that a village kid slides off once in the heat too
 */
export const BALANCE = {
  gentle: { drift: 0.2, grow: 0.3, power: 1.15, warn: 0.62, cost: 2.0, grace: 2.2, offbeat: 0.5, bump: 0, brush: 0.35, mud: 0.4, keep: 1, restart: 0.85, rivals: 0 },
  wild: { drift: 0.36, grow: 0.6, power: 1.5, warn: 0.5, cost: 3.0, grace: 2.0, offbeat: 0.8, bump: 1.3, brush: 0.6, mud: 0.6, keep: 0.5, restart: 0.35, rivals: 0.4 },
};
/** A heat ridden without a single fall: "Steady rider!" */
export const STEADY_BONUS = 15;
/** How fast a jolt fades (1/s): a jolt of j adds j / JOLT_FADE to the tilt in all. */
export const JOLT_FADE = 4;
/** The last part of a fall is the hop back on (seconds): the view plays it, the rules only count the whole. */
export const HOP = 0.5;

/** The balance of one heat: the preset plus the seeded sway (its own random source: the cows' draw stays what it was). */
export function newBalance(key, seed) {
  const P = BALANCE[key];
  if (!P) return null;
  const R = rng((seed * 7919 + 31) >>> 0 || 1);
  return { key, ...P, p1: R() * 6.283, p2: R() * 6.283, R };
}

/** The rider's part of a racer. */
export const riderState = () => ({ tilt: 0, jolt: 0, lean: 0, fallT: 0, graceT: 0, falls: 0, warned: false, fallSide: 0, fallV: 0, bump: 0, botDir: 0 });

/** How much the cow rocks her at speed v (m/s): nothing standing, about 0.7 at an amble, 1 at a good run, more with a grass burst. */
export const rock = v => (v < 0.3 ? 0 : Math.min(1.25, 0.35 + v * 0.25));

/** The slow sway at race time t (per second, before the cow's speed). */
export const drift = (B, t) => B.drift * (Math.sin(t * 0.83 + B.p1) * 0.75 + Math.sin(t * 0.31 + B.p2) * 0.55);

/** A shove: toward the side she is already tipping to, or a seeded side when she sits straight (dir given: that side). */
export function jolt(r, B, size, dir = 0) {
  if (!size || r.fallT > 0 || r.graceT > 0) return 0;
  const d = dir || (Math.abs(r.tilt) > 0.05 ? Math.sign(r.tilt) : (B.R() < 0.5 ? -1 : 1));
  r.jolt += d * size;
  return d;
}

/**
 * Advance the rider by dt. lean: -1..1 from the player. Returns 'fall' (she is off: fallT counts down, fallSide says where),
 * 'warn' (she has just tipped into the red) or null. noFall (a show wobble): she is caught at the edge.
 */
export function stepTilt(r, B, t, dt, lean, v, noFall = false) {
  if (r.fallT > 0) return null;
  r.lean += (Math.max(-1, Math.min(1, lean || 0)) - r.lean) * Math.min(1, dt * 12);
  const live = r.graceT > 0 ? 0 : 1;
  if (r.graceT > 0) r.graceT -= dt;
  r.tilt += ((drift(B, t) * rock(v) + B.grow * r.tilt) * live + r.jolt + r.lean * B.power) * dt;
  r.jolt *= Math.exp(-dt * JOLT_FADE);
  const a = Math.abs(r.tilt);
  if (a >= 1) {
    if (noFall) { r.tilt = Math.sign(r.tilt) * 0.98; return null; }
    r.fallSide = Math.sign(r.tilt); r.fallT = B.cost; r.falls++; r.fallV = v;
    r.tilt = 0; r.jolt = 0; r.lean = 0; r.warned = false;
    return 'fall';
  }
  if (a >= B.warn && !r.warned) { r.warned = true; return 'warn'; }
  if (a < B.warn * 0.8) r.warned = false;
  return null;
}

/** Count a fall down. Returns true on the frame she is back in the saddle. */
export function stepFall(r, B, dt) {
  if (r.fallT <= 0) return false;
  r.fallT -= dt;
  if (r.fallT > 0) return false;
  r.fallT = 0; r.graceT = B.grace;
  return true;
}

/**
 * A rider for tests and the QA autopilot: leans against the tip. dead = 0: at once and in proportion (never falls);
 * dead > 0: a child who only reacts once the marker is that far out, then leans hard until it is nearly back.
 */
export function botLean(r, { dead = 0 } = {}) {
  if (!dead) return Math.max(-1, Math.min(1, -(r.tilt * 5 + r.jolt * 0.6)));
  const a = Math.abs(r.tilt);
  if (a > dead) r.botDir = -Math.sign(r.tilt);
  else if (a < dead * 0.3) r.botDir = 0;
  return r.botDir;
}
