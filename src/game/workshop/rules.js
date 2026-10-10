// The Kite workshop: the rules, with no three.js and no DOM (tests/workshop.test.mjs imports this file).
//
// Mika fits electric motors to Grandma's wind-up Star Kite on the bench in the cottage (./index.js draws and plays it):
//   pick the parts -> mount four motors -> fit the propellers -> wire it -> balance the battery -> switch on.
// Here: what is on the tray, which propeller layouts fly straight, which wire goes where, how the balance is scored,
// the build quality and its stars, the save record (quest.state.workshop), and what the build does for flying
// (actors/kite.js asks assistSpec / stepCharge every frame while the kite carries the motors).

export const STEPS = ['pick', 'motors', 'props', 'wire', 'balance', 'switch'];

/** Where things go on the kite frame, in frame units (x: right, y: toward the nose). */
export const SOCKETS = {
  FL: { x: -0.5, y: 0.44 }, FR: { x: 0.5, y: 0.44 }, BL: { x: -0.5, y: -0.44 }, BR: { x: 0.5, y: -0.44 },
};
export const CORNERS = ['FL', 'FR', 'BL', 'BR'];
/** Places on the frame that look tempting and are wrong for a motor. */
export const WRONG_PLACES = { nose: { x: 0, y: 0.6 }, hub: { x: 0, y: 0 }, tail: { x: 0, y: -0.64 } };

/** The four motors, told apart by the colour of their caps (their wires match). */
export const MOTOR_COLORS = ['yellow', 'green', 'blue', 'pink'];

/** Everything on the tray. need: part of the build; the others are there for fun. */
export const TRAY = [
  { id: 'motor0', kind: 'motor', n: 0, need: true }, { id: 'motor1', kind: 'motor', n: 1, need: true },
  { id: 'motor2', kind: 'motor', n: 2, need: true }, { id: 'motor3', kind: 'motor', n: 3, need: true },
  { id: 'prop0', kind: 'prop', dir: 'cw', need: true }, { id: 'prop1', kind: 'prop', dir: 'cw', need: true },
  { id: 'prop2', kind: 'prop', dir: 'ccw', need: true }, { id: 'prop3', kind: 'prop', dir: 'ccw', need: true },
  { id: 'battery', kind: 'battery', need: true }, { id: 'switch', kind: 'switch', need: true }, { id: 'wire', kind: 'wire', need: true },
  { id: 'spoon', kind: 'spoon', need: false }, { id: 'peg', kind: 'peg', need: false },
];
export const NEEDED = TRAY.filter(p => p.need).length;

/** A fixed, mixed-up order for the tray (the same every time: the autopilot and the tests rely on it). */
export const TRAY_ORDER = ['prop2', 'motor0', 'spoon', 'battery', 'motor2', 'prop0', 'wire', 'motor3', 'peg', 'prop3', 'switch', 'motor1', 'prop1'];

// ---------------------------------------------------------------------------------------------- propellers
const SPIN = { cw: 1, ccw: -1 };

/**
 * What the kite does in the spin test. layout: { FL, FR, BL, BR } each 'cw' | 'ccw' (or missing).
 * A spinning propeller pushes the frame round the other way. Hovering, the four pushes must cancel (two each way);
 * leaning forward the back pair spins harder, leaning sideways one side does, and the pushes must still cancel.
 * That only works when each diagonal pair spins the same way and neighbours spin opposite ways.
 * Returns { ok, hover, pitch, roll, complete }: the twists (-4..4) hovering, leaning forward and leaning sideways.
 */
export function spinTest(layout) {
  const d = c => SPIN[layout?.[c]] || 0;
  const complete = CORNERS.every(c => d(c) !== 0);
  const hover = d('FL') + d('FR') + d('BL') + d('BR');
  const pitch = -d('FL') - d('FR') + d('BL') + d('BR');
  const roll = -d('FL') + d('FR') - d('BL') + d('BR');
  return { ok: complete && hover === 0 && pitch === 0 && roll === 0, hover, pitch, roll, complete };
}
export const propsValid = layout => spinTest(layout).ok;

/** Every way of putting two clockwise and two counter-clockwise propellers on four motors (6), for the tests. */
export function allLayouts() {
  const out = [];
  for (let m = 0; m < 16; m++) {
    const L = Object.fromEntries(CORNERS.map((c, i) => [c, m & (1 << i) ? 'cw' : 'ccw']));
    if (CORNERS.filter(c => L[c] === 'cw').length === 2) out.push(L);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- wiring
/**
 * The plugs. A wire runs from a source to the socket of the same colour:
 *   red     battery (+)  -> the switch
 *   four    the switch   -> each motor (the colour of its cap)
 *   black   battery (-)  -> the frame's return lug
 */
export const WIRES = [
  { id: 'red', color: 'red', from: 'bat+', to: 'sw-in' },
  ...MOTOR_COLORS.map((c, i) => ({ id: c, color: c, from: `sw-${c}`, to: `motor${i}`, motor: i })),
  { id: 'black', color: 'black', from: 'bat-', to: 'lug' },
];
const WIRE_FROM = Object.fromEntries(WIRES.map(w => [w.from, w]));
const WIRE_TO = Object.fromEntries(WIRES.map(w => [w.to, w]));

/** Does a wire from plug `from` belong in socket `to`? Returns the wire, or null. */
export function wireFor(from, to) {
  const w = WIRE_FROM[from];
  return w && w.to === to ? w : null;
}
export const isSource = id => !!WIRE_FROM[id];
export const isSink = id => !!WIRE_TO[id];
/** All wires connected? done: an iterable of wire ids. */
export function wiringDone(done) {
  const s = new Set(done);
  return WIRES.every(w => s.has(w.id));
}

// ---------------------------------------------------------------------------------------------- balance
export const BALANCE = { start: 0.12, tol: 0.045, wide: 0.28, gain: 3.2 };

/** Where along the rail (0 = tail end, 1 = nose end) the battery balances the kite; it moves a little each rebuild. */
export function balanceIdeal(plays = 0) {
  const p = Number.isFinite(plays) ? Math.max(0, Math.floor(plays)) : 0;
  return +(0.56 + 0.14 * Math.sin(p * 2.4 + 0.6)).toFixed(3);
}
/** The level bubble (-1..1): it runs to the light (high) end. Battery too far to the nose -> bubble toward the tail. */
export function bubbleAt(t, ideal) {
  return Math.max(-1, Math.min(1, (ideal - t) * BALANCE.gain));
}
export const balanced = (t, ideal) => Math.abs(t - ideal) <= BALANCE.tol;
/** 1 inside the marks, falling to 0 a good way off. */
export function balanceScore(t, ideal) {
  const e = Math.abs(t - ideal);
  if (!Number.isFinite(e)) return 0;
  if (e <= BALANCE.tol) return 1;
  return Math.max(0, 1 - (e - BALANCE.tol) / (BALANCE.wide - BALANCE.tol));
}

// ---------------------------------------------------------------------------------------------- build quality
export const QUALITY = { perMistake: 6, mistakes: 70, balance: 30, stars: [0, 60, 85] };

/** Build quality 10..100: few mistakes (70 points) and a level battery (30 points). */
export function quality(mistakes, balScore) {
  const m = Number.isFinite(mistakes) ? Math.max(0, mistakes) : 99;
  const b = Number.isFinite(balScore) ? Math.max(0, Math.min(1, balScore)) : 0;
  return Math.max(10, Math.round(Math.max(0, QUALITY.mistakes - QUALITY.perMistake * m) + QUALITY.balance * b));
}
/** A finished build always earns one star: it flies. */
export function starsFor(q) {
  return QUALITY.stars.filter(t => q >= t).length;
}

// ---------------------------------------------------------------------------------------------- the save record
export function freshWorkshop() {
  return { built: false, stars: 0, best: 0, plays: 0, prog: null };
}

/** quest.state.workshop from any saved value: { built, stars, best, plays, prog: null | { step, mistakes, slots, layout, bal } }. */
export function cleanWorkshop(raw) {
  const out = freshWorkshop();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const int = (v, max) => (Number.isFinite(v) ? Math.min(max, Math.max(0, Math.floor(v))) : 0);
  out.built = !!raw.built;
  out.stars = int(raw.stars, 3);
  out.best = int(raw.best, 100);
  out.plays = int(raw.plays, 9999);
  if (out.built) { out.stars = Math.max(1, out.stars); out.plays = Math.max(1, out.plays); } else { out.stars = 0; out.best = 0; }
  const p = raw.prog;
  if (p && typeof p === 'object' && !Array.isArray(p)) {
    const step = int(p.step, STEPS.length - 1);
    const perm = Array.isArray(p.slots) && p.slots.length === 4 && [0, 1, 2, 3].every(i => p.slots.includes(i)) ? p.slots.slice() : null;
    const lay = p.layout && typeof p.layout === 'object' && propsValid(p.layout) ? Object.fromEntries(CORNERS.map(c => [c, p.layout[c]])) : null;
    const bal = Number.isFinite(p.bal) ? Math.max(0, Math.min(1, p.bal)) : null;
    // a step can only be resumed with what the steps before it left behind
    let s = step;
    if (s > 1 && !perm) s = 1;
    if (s > 2 && !lay) s = 2;
    if (s > 4 && bal === null) s = 4;
    if (s > 0 || int(p.mistakes, 99) > 0) out.prog = { step: s, mistakes: int(p.mistakes, 99), slots: s > 1 ? perm : null, layout: s > 2 ? lay : null, bal: s > 4 ? bal : null };
  }
  return out;
}

/** Fold a finished build into the record. Returns { rec, stars, newBest }. */
export function recordBuild(prev, q) {
  const rec = { ...cleanWorkshop(prev), prog: null };
  const stars = starsFor(q);
  const newBest = !rec.built || q > rec.best;
  rec.built = true;
  rec.plays += 1;
  rec.best = Math.max(rec.best, q);
  rec.stars = Math.max(rec.stars, stars);
  return { rec, stars, newBest };
}

/**
 * Is the workshop open? Mika must own the kite. In the Grandma story the mill must be making electricity (the Mill
 * Lamp is on: chapter one's last job), so there is something to charge the battery from; Classic only asks for the kite.
 */
export function workshopOpen(state) {
  if (!state || !(state.inv?.kite > 0)) return false;
  return state.story !== 'grandma' || !!state.lamps?.mill;
}

// ---------------------------------------------------------------------------------------------- flying with motors
/** The kite as it has always flown (actors/kite.js KITE): what an empty battery, or no build, gives. */
export const PLAIN = { boost: 20, climb: 5.5, accel: 1.6, brake: 1.05, lift: 1.3 };

/**
 * What the motors add, for a build of `stars` (0 = not built -> null).
 *   boost   top speed holding Shift (m/s)          climb   Space (m/s)
 *   accel   how briskly it gets going (1/s)        brake   how briskly it stops and hovers with no input (1/s)
 *   lift    seconds from the grab to flying        capacity  seconds of full boost in the battery
 *   drain   charge used per second, as boost-seconds: boosting 1, climbing 0.45, holding a hover 0.1
 *   charge  seconds for a full recharge on the ground, and near a lit Star Lamp or the mill wheel
 */
export function assistSpec(stars) {
  const s = Number.isFinite(stars) ? Math.min(3, Math.max(0, Math.floor(stars))) : 0;
  if (!s) return null;
  return {
    stars: s, boost: 27, climb: 8.5, accel: 2.5, brake: 3.2, lift: 0.9,
    capacity: [0, 32, 38, 44][s],
    drain: { boost: 1, climb: 0.45, hover: 0.1 },
    charge: { ground: 40, power: 6 },
    powerRange: 26,
  };
}

const smooth01 = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
/** How much of the assist is felt at a charge (0..1): all of it down to 10 %, then it fades to the plain kite. */
export function assistLevel(charge) {
  return Number.isFinite(charge) ? smooth01(charge / 0.1) : 0;
}
/** The flight numbers at a charge: the plain kite at zero, the assisted one with charge, a smooth fade between. */
export function flightNumbers(spec, charge, out = {}) {
  const k = spec ? assistLevel(charge) : 0;
  for (const key of ['boost', 'climb', 'accel', 'brake']) out[key] = PLAIN[key] + ((spec ? spec[key] : PLAIN[key]) - PLAIN[key]) * k;
  out.lift = spec && charge > 0.1 ? spec.lift : PLAIN.lift;
  out.k = k;
  return out;
}

/**
 * The battery after dt seconds in the air. use: { boost: 0..1 (how hard it boosts), climb: bool, hover: bool }.
 * Returns the new charge (0..1). It never goes below zero, and gliding along costs nothing.
 */
export function stepCharge(charge, use, dt, spec) {
  if (!spec || !(dt > 0)) return Number.isFinite(charge) ? Math.max(0, Math.min(1, charge)) : 0;
  const d = spec.drain;
  const amps = d.boost * Math.max(0, Math.min(1, use?.boost || 0)) + (use?.climb ? d.climb : 0) + (use?.hover ? d.hover : 0);
  return Math.max(0, Math.min(1, (Number.isFinite(charge) ? charge : 0) - amps * dt / spec.capacity));
}
/** The battery after dt seconds on the ground; nearPower: beside a lit Star Lamp or the mill wheel. */
export function groundCharge(charge, nearPower, dt, spec) {
  if (!spec || !(dt > 0)) return Number.isFinite(charge) ? Math.max(0, Math.min(1, charge)) : 0;
  return Math.max(0, Math.min(1, (Number.isFinite(charge) ? charge : 0) + dt / (nearPower ? spec.charge.power : spec.charge.ground)));
}
