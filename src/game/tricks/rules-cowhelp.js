// How to ride and race: the pure parts (no three.js, no DOM), so they are tested in Node (tests/cowhelp.test.mjs).
// The pictures and the cards are drawn by actors/cow-help.js; the free ride's coach is driven from actors/cow-ride.js,
// the race's from game/tricks/cowrace.js.
import { N_ } from '../../i18n/i18n.js';

// ------------------------------------------------------------------------------------------------ free riding: 3 steps
/** The three steps of the free-ride coach: steer, hold to gallop (mind the energy bar), moo and hop off. */
export const RIDE_STEPS = ['steer', 'gallop', 'moo'];

/**
 * Title, text and a one-line extra for a step on this device. `touch` = a phone or tablet (stick, on-screen buttons),
 * else keyboard (WASD / arrows, E or Shift, M, Space). Every string is a plain English source for tx().
 */
export function rideStepText(step, touch) {
  switch (RIDE_STEPS[step]) {
    case 'steer': return {
      title: N_('1. Steer'),
      text: touch ? N_('Drag on the left side of the screen to steer your cow.') : N_('Press W A S D (or the arrow keys) to steer your cow.'),
      extra: '',
    };
    case 'gallop': return {
      title: N_('2. Hold to gallop'),
      text: touch ? N_('Hold the Gallop button: she trots, then runs.') : N_('Hold E or Shift: she trots, then runs.'),
      extra: N_('The Energy bar goes down. Low? Let her rest and graze.'),
    };
    case 'moo': return {
      title: N_('3. Moo and hop off'),
      text: touch ? N_('Tap Moo! to moo. Tap Hop off to get down.') : N_('Press M to moo. Press Space to hop off.'),
      extra: '',
    };
    default: return { title: N_('Great riding!'), text: touch ? N_('Tap Hop off whenever you want to get down.') : N_('Press Space whenever you want to hop off.'), extra: '' };
  }
}

/** A fresh coach: step 0 of 3, nothing done yet. step 3 = finished. */
export const newRideCoach = () => ({ step: 0, t: 0, steerT: 0, holdT: 0, mooed: false, doneT: 0 });

export const COACH_NEED = { steer: 1.6, hold: 1.3 };

/**
 * Advance the coach by dt. sig = { steering: the stick or keys ask for a turn while the cow is moving, holding: the gallop
 * control is held, mooed: the cow mooed this frame }. A step is done by DOING it (for a moment), then the coach moves on
 * by itself after a short "well done" beat (done = true for COACH_DONE_BEAT seconds); the Next button skips it.
 * Returns true when the step changed this call.
 */
export const COACH_DONE_BEAT = 0.9;
export function stepRideCoach(c, dt, sig = {}) {
  if (c.step >= RIDE_STEPS.length) return false;
  c.t += dt;
  if (c.doneT > 0) {
    c.doneT -= dt;
    if (c.doneT <= 0) { c.step++; c.t = 0; c.steerT = c.holdT = 0; c.mooed = false; return true; }
    return false;
  }
  const s = RIDE_STEPS[c.step];
  if (s === 'steer') { if (sig.steering) c.steerT += dt; if (c.steerT >= COACH_NEED.steer) c.doneT = COACH_DONE_BEAT; }
  else if (s === 'gallop') { if (sig.holding) c.holdT += dt; if (c.holdT >= COACH_NEED.hold) c.doneT = COACH_DONE_BEAT; }
  else if (s === 'moo') { if (sig.mooed) c.mooed = true; if (c.mooed) c.doneT = COACH_DONE_BEAT; }
  return false;
}
/** Skip the current step (the Next button). */
export function skipRideStep(c) { if (c.step < RIDE_STEPS.length) { c.doneT = 0; c.step++; c.t = 0; c.steerT = c.holdT = 0; c.mooed = false; } }
export const rideCoachDone = c => c.step >= RIDE_STEPS.length;

// -------------------------------------------------------------------------------------------------- the cow race: card
/** The three steps of the race's intro card (all shown at once): steer, tap on the beat, do not mash. */
export function raceStepText(step, touch) {
  switch (step) {
    case 0: return {
      title: N_('1. Steer'),
      text: touch ? N_('Drag on the left side of the screen to steer between the lanes.') : N_('Press A and D (or the arrow keys) to steer between the lanes.'),
    };
    case 1: return {
      title: N_('2. Tap on the beat'),
      text: touch ? N_('Tap Giddy-up! when the ring closes.') : N_('Press E or Space when the ring closes.'),
    };
    default: return {
      title: N_('3. Do not mash'),
      text: N_('Tapping too fast tires the cow. Eat the grass bundles for a boost, and finish first!'),
    };
  }
}

// ------------------------------------------------------------------------------------------------ the beat: what to say
/**
 * The word for a graded tap (rules-cowrace tapKind) and its colour tone. practice = the first try, which names a near miss
 * ("Too early!") where a normal lap just says "Nice".
 */
export function tapLabel(kind, practice) {
  switch (kind) {
    case 'perfect': return { text: N_('Perfect!'), tone: 'good' };
    case 'good': return { text: N_('Good!'), tone: 'good' };
    case 'okEarly': return practice ? { text: N_('Too early!'), tone: 'ok' } : { text: N_('Nice'), tone: 'ok' };
    case 'okLate': return practice ? { text: N_('Too late!'), tone: 'ok' } : { text: N_('Nice'), tone: 'ok' };
    case 'early': return { text: N_('Too early!'), tone: 'bad' };
    case 'late': return { text: N_('Too late!'), tone: 'bad' };
    case 'mash': return { text: N_('Puff!'), tone: 'bad' };
    default: return null;
  }
}

/** The teacher's reaction to each of the first COACH_TAPS taps of a first try (null afterwards). */
export const COACH_TAPS = 3;
export function coachLine(kind, n) {
  if (n >= COACH_TAPS) return null;
  switch (kind) {
    case 'perfect': return N_('Perfect! That is the beat of her hooves.');
    case 'good': return N_('Good! One tap for every ring.');
    case 'okEarly': case 'early': return N_('A bit early. Wait until the ring closes.');
    case 'okLate': case 'late': return N_('A bit late. Tap a little sooner.');
    case 'mash': return N_('Too fast! Cows get tired. Wait for the next ring.');
    default: return null;
  }
}

/** No tap for this long after "Go!": a ghost shows how (seconds). */
export const GHOST_AFTER = 5;
export const GHOST_SHOW = 4;
/**
 * Should the ghost tap demo show now? t = race time, lastTap = race time of the player's last tap (-9: none), taps = taps so
 * far, ghostEnd = race time the last demo ended (-99: none). Only for a player who has not got the idea yet (fewer than 3 taps).
 */
export function ghostDue(t, lastTap, taps, ghostEnd = -99) {
  if (taps >= 3) return false;
  return t - Math.max(lastTap, 0) >= GHOST_AFTER && t - ghostEnd >= GHOST_AFTER;
}

/** What the results card says about stars (the race's STARS thresholds are 30 / 60 / 80 points; 1st place is always 3). */
export const STARS_NOTE = N_('Stars: 1st place = 3 stars. A slower place or time earns fewer.');

/** The same for a race day of several heats (the levels: rules-cowrace.js meetPlan). */
export const STARS_NOTE_DAY = N_('Stars: the points of all heats add up. Win every heat for 3 stars.');
export const starsNote = heats => (heats > 1 ? STARS_NOTE_DAY : STARS_NOTE);

/** The floating hint over a cow: what to do next with her, from where Mika stands. */
export function cowHintText(kind, near) {
  if (kind === 'ride') return near ? N_('Press {act} to ride') : N_('Walk up to her, then press {act} to ride');
  return near ? N_('Press {act} to feed her') : N_('Walk up to her, then press {act} to feed her');
}
