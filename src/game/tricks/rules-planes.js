// Paper planes on the breeze: the rules (pure, no three.js, no DOM; tested in tests/planes.test.mjs).
//
// 1. FOLDING. The sheet is a set of flat polygons; a fold reflects everything on one side of a crease line over to the
//    other side and lays it on top, exactly like a flat fold of real paper (foldPaper). Each design is a list of such
//    folds, written the way a child would be told them ("the top left corner to the middle line"). The player stops a
//    marker that sweeps over a bar; how far it is from the middle turns or shifts the crease a little (creaseOf), so a
//    careless fold really lands crooked on the diagram. The errors add up to the plane's TRIM (trimOf): folds that do
//    not match left and right make it veer, sloppy folds of any kind make it draggy.
//
// 2. FLYING. A glider with a fixed trim, in still or moving air (stepPlane). Two numbers describe a design: v0, the
//    speed at which its wings carry exactly its weight, and ld, how many metres it glides for each metre it sinks.
//    Lift and drag grow with the square of the airspeed, so
//      - thrown faster than v0 the plane has lift to spare: it noses up and climbs, slows, and noses down again;
//        thrown much too hard (or with too much up-elevator) it rears up, runs out of speed and STALLS, or loops;
//      - thrown slower than v0, or flat, it has too little lift and DIVES into the grass;
//      - a gentle angle and a firm throw, near v0, is the long flat glide.
//    A paper clip on the nose moves the weight forward: the plane wants a higher speed and holds its nose steadier, so
//    a headwind takes less of its ground speed. Bending the back edges up (the elevator) trims the nose up: a lower v0,
//    a floatier flight, and a stall if it is overdone. A bent wingtip makes it turn. Wind moves the whole air the plane
//    flies in; a thermal is air rising over the sunny field, and a slow plane spends long enough in it to be lifted.
import { N_ } from '../../i18n/i18n.js';

export const G = 9.81;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** A small seeded random source (same numbers every run for the same seed). */
export function rng(seed) {
  let a = (Math.floor(seed) * 0x9e3779b1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ================================================================================================ folding
/** The sheet (an A4 page, 21 x 29.7 cm, in fold units): x -1..1, y -1.4..1.4, the nose end up. */
export const SHEET = { w: 2, h: 2.8 };
const T = SHEET.h / 2, B = -T;
const T22 = Math.tan(Math.PI / 8);

/** A fresh sheet: one polygon, its white inside up. Polygons: { pts: [[x, y]…], up: the inside shows, z: layer }. */
export function newSheet() { return [{ pts: [[-1, B], [1, B], [1, T], [-1, T]], up: true, z: 0 }]; }

const area = pts => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; };
/** The paper in all its layers (fold units squared): a fold never changes it. */
export function paperArea(polys) { return polys.reduce((s, p) => s + area(p.pts), 0); }

/** The part of a polygon on the side of the line (a, normal n) where (p - a) . n has the sign `side` (Sutherland–Hodgman). */
function half(pts, a, n, side) {
  const out = [], d = p => ((p[0] - a[0]) * n[0] + (p[1] - a[1]) * n[1]) * side;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length], dp = d(p), dq = d(q);
    if (dp >= 0) out.push(p);
    if (dp > 0 && dq < 0 || dp < 0 && dq > 0) { const k = dp / (dp - dq); out.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]); }
  }
  return out;
}

/** The mirror image of a point in the line through a with unit direction d. */
export function mirror(p, a, d) {
  const x = p[0] - a[0], y = p[1] - a[1], k = x * d[0] + y * d[1];
  return [a[0] + 2 * k * d[0] - x, a[1] + 2 * k * d[1] - y];
}

/**
 * Fold the paper along a crease { a: a point on it, d: its unit direction }: every layer on the side of `key` (the
 * corner that travels) is mirrored over the crease and laid on top, turned over. Returns the new polygons (the old
 * ones are left alone), bottom layer first.
 */
export function foldPaper(polys, crease, key) {
  const { a, d } = crease, n = [-d[1], d[0]];
  const side = (key[0] - a[0]) * n[0] + (key[1] - a[1]) * n[1] >= 0 ? 1 : -1;
  const stay = [], move = [];
  let top = 0;
  for (const p of polys) {
    top = Math.max(top, p.z);
    const s = half(p.pts, a, n, -side), m = half(p.pts, a, n, side);
    if (s.length >= 3 && area(s) > 1e-7) stay.push({ pts: s, up: p.up, z: p.z });
    if (m.length >= 3 && area(m) > 1e-7) move.push({ pts: m.map(q => mirror(q, a, d)), up: !p.up, z: p.z });
  }
  // what was on top of the moving stack is underneath after the fold
  for (const m of move) m.z = top + 1 + (top - m.z);
  return [...stay, ...move].sort((p, q) => p.z - q.z);
}

/** The layers a fold will move (as they lie before it): what the diagram swings over. */
export function movingPart(polys, crease, key) {
  const { a, d } = crease, n = [-d[1], d[0]];
  const side = (key[0] - a[0]) * n[0] + (key[1] - a[1]) * n[1] >= 0 ? 1 : -1;
  return polys.map(p => ({ pts: half(p.pts, a, n, side), up: p.up, z: p.z })).filter(p => p.pts.length >= 3 && area(p.pts) > 1e-7);
}

// A fold step: the crease runs from a to b when it is folded exactly; `key` is the corner that travels (it says which
// side moves); a careless fold turns the crease about a ('turn', by amp radians at the end of the bar) or shifts it
// sideways ('slide', by amp units). side: 'C' the middle crease, 'L' / 'R' the left and right twin folds (an error with
// the same sign is the mirror image on the other side, so L minus R is what does not match), 'H' the fold in half,
// 'W' the wings, 'S' a fold across both sides at once. back: the fold is opened again (it only leaves a crease).
const corner = (c, y, s, side, text) => ({ a: [c, y], b: [s, y - (1 + s * -c)], key: [s, y], vary: 'turn', sign: -s, amp: 0.17, side, text });
const steps = {
  centre: c => ({ a: [c, B], b: [c, T], key: [1, 0], vary: 'slide', sign: 1, amp: 0.13, side: 'C', back: true, text: N_('Fold the sheet in half the long way. Press the crease, then open it again.') }),
  half: c => ({ a: [c, B], b: [c, T], key: [-1, 0], vary: 'slide', sign: 1, amp: 0.07, side: 'H', text: N_('Fold the whole plane in half along the middle line.') }),
  wings: (c, k, text) => ({ a: [c + k, B], b: [c + k, T], key: [c + 1, 0], vary: 'turn', sign: 1, amp: 0.06, side: 'W', text }),
};

/**
 * The designs. fold(c): the fold steps, given where the middle crease really is (c: 0 when it was folded exactly).
 * v0: the speed (m/s) at which the wings carry the plane; ld: metres forward per metre down; steady: how firmly it holds
 * its nose (0..1); elev: up-elevator it has by its shape; stiff: how much faster than v0 (as lift, the square of the speed) its
 * wings stand before they flutter (left out: FLY.flutter; the stubby Looper takes a hard throw and turns it into a loop). far / float / steady5: the chooser's bars (1..5).
 */
export const DESIGNS = [
  {
    id: 'dart', name: N_('The Dart'), desc: N_('Long and pointed. Fast and far with a firm throw, but it drops quickly when it slows.'),
    v0: 8.2, ld: 5.2, steady: 0.5, elev: 0, bars: [5, 2, 3],
    fold: c => [steps.centre(c),
      corner(c, T, -1, 'L', N_('Fold the top left corner in to the middle line.')),
      corner(c, T, 1, 'R', N_('Now the top right corner, in to the middle line.')),
      { a: [c, T], b: [c - T22 * SHEET.h, B], key: [-1, T - 1], vary: 'turn', sign: 1, amp: 0.1, side: 'L', text: N_('Fold the slanted left edge in to the middle line, too.') },
      { a: [c, T], b: [c + T22 * SHEET.h, B], key: [1, T - 1], vary: 'turn', sign: -1, amp: 0.1, side: 'R', text: N_('And the slanted right edge, the same way.') },
      steps.half(c),
      steps.wings(c, 0.13, N_('Fold the wings down, level with the bottom edge.'))],
  },
  {
    id: 'glider', name: N_('The Glider'), desc: N_('Wide wings and a heavy front edge. Slow, and it floats for a long time. Throw it gently!'),
    v0: 4.3, ld: 4.7, steady: 0.3, elev: 0, bars: [2, 5, 2],
    fold: c => [steps.centre(c),
      { a: [-1, T - 0.42], b: [1, T - 0.42], key: [0, T], vary: 'slide', sign: 1, amp: 0.09, side: 'S', text: N_('Fold the top edge down, about two fingers wide.') },
      { a: [-1, T - 0.84], b: [1, T - 0.84], key: [0, T - 0.42], vary: 'slide', sign: 1, amp: 0.09, side: 'S', text: N_('Fold it down again, over itself. That makes a heavy front edge.') },
      { a: [-0.56, T - 0.84], b: [-1, T - 1.28], key: [-1, T - 0.84], vary: 'slide', sign: 1, amp: 0.08, side: 'L', text: N_('Fold the top left corner in: just a small triangle.') },
      { a: [0.56, T - 0.84], b: [1, T - 1.28], key: [1, T - 0.84], vary: 'slide', sign: -1, amp: 0.08, side: 'R', text: N_('And the top right corner, the same size.') },
      steps.half(c),
      steps.wings(c, 0.15, N_('Fold the wide wings down. Leave a narrow keel to hold.'))],
  },
  {
    id: 'stunt', name: N_('The Looper'), desc: N_('Short and stubby, its back edges bent up. Throw it hard and upward and it flies a loop.'),
    v0: 4.9, ld: 3.3, steady: 0.05, elev: 1, stiff: 6, bars: [2, 3, 1],
    fold: c => [steps.centre(c),
      corner(c, T, -1, 'L', N_('Fold the top left corner in to the middle line.')),
      corner(c, T, 1, 'R', N_('Now the top right corner, in to the middle line.')),
      { a: [-1, T - 0.72], b: [1, T - 0.72], key: [c, T], vary: 'slide', sign: 1, amp: 0.1, side: 'S', text: N_('Fold the point down, until its tip is well below the triangles.') },
      steps.half(c),
      steps.wings(c, 0.2, N_('Fold the wings down, then bend their back edges up a little.'))],
  },
  {
    id: 'bulldog', name: N_('The Bulldog'), desc: N_('A blunt, heavy nose and tidy wings. Very steady: the one for a long, straight flight.'),
    v0: 6.6, ld: 4.1, steady: 0.85, elev: 0, bars: [4, 3, 5],
    fold: c => [steps.centre(c),
      corner(c, T, -1, 'L', N_('Fold the top left corner in to the middle line.')),
      corner(c, T, 1, 'R', N_('Now the top right corner, in to the middle line.')),
      { a: [-1, T - 1], b: [1, T - 1], key: [c, T], vary: 'slide', sign: 1, amp: 0.1, side: 'S', text: N_('Fold the point down, along the bottom of the two triangles.') },
      corner(c, T - 1, -1, 'L', N_('Fold the new top left corner in to the middle line.')),
      corner(c, T - 1, 1, 'R', N_('And the new top right corner.')),
      steps.half(c),
      steps.wings(c, 0.2, N_('Fold the wings down, level with the bottom edge.'))],
  },
];
export const DESIGN = Object.fromEntries(DESIGNS.map(d => [d.id, d]));

/** The crease a press makes: the step's own line, turned or shifted by the marker's place e (-1..1; 0 is exact). */
export function creaseOf(step, e = 0) {
  let ax = step.a[0], ay = step.a[1], dx = step.b[0] - ax, dy = step.b[1] - ay;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;
  const k = e * step.amp * step.sign;
  if (step.vary === 'turn') { const c = Math.cos(k), s = Math.sin(k); return { a: [ax, ay], d: [dx * c - dy * s, dx * s + dy * c] }; }
  ax += -dy * k; ay += dx * k;
  return { a: [ax, ay], d: [dx, dy] };
}

/** What each level asks of a fold: tol, how far from the middle of the bar still counts as exact; speed, sweeps a second. */
export const FOLD = { easy: { tol: 0.34, speed: 0.55 }, normal: { tol: 0.2, speed: 0.72 }, hard: { tol: 0.13, speed: 0.9 } };

/** The marker's place on the bar (-1..1) at time t: a triangle wave, `speed` sweeps (end to end) a second. */
export function sweepAt(t, speed = 0.7) {
  const f = ((t * speed / 2) % 1 + 1) % 1;
  return f < 0.5 ? -1 + f * 4 : 3 - f * 4;
}

/** A press judged: the error that is left once the level's tolerance is taken off (signed, -1..1), and a grade (2 exact, 1 good, 0 crooked). */
export function foldError(e, level = 'normal') {
  const tol = (FOLD[level] || FOLD.normal).tol, a = Math.abs(e);
  const err = a <= tol ? 0 : Math.sign(e) * Math.min(1, (a - tol) / (1 - tol));
  return { err, grade: err === 0 ? 2 : Math.abs(err) < 0.45 ? 1 : 0 };
}

/**
 * Fold a whole design from the marker places of its presses (es: one number -1..1 per step; left out: exact).
 * Returns { polys: the folded paper, steps: the fold steps as they were made, errs: the error left of each press,
 * grades, c: where the middle crease lies }.
 */
export function foldDesign(id, es = [], level = 'normal') {
  const D = DESIGN[id] || DESIGNS[0];
  let polys = newSheet(), c = 0;
  const made = [], errs = [], grades = [];
  const n = D.fold(0).length;
  for (let i = 0; i < n; i++) {
    const step = D.fold(c)[i], j = foldError(es[i] || 0, level);
    errs.push(j.err); grades.push(j.grade);
    const crease = creaseOf(step, j.err);
    if (step.side === 'C') c = crease.a[0];
    if (!step.back) polys = foldPaper(polys, crease, step.key);
    made.push({ step, crease });
  }
  return { polys, steps: made, errs, grades, c };
}

/**
 * The trim the folds give the plane: veer (-1..1, + turns right: what does not match between left and right),
 * neat (0..1: 1 is a plane with every fold exact) and perfect (how many folds were exact).
 */
export function trimOf(id, errs) {
  const st = (DESIGN[id] || DESIGNS[0]).fold(0);
  let veer = 0, slop = 0, perfect = 0;
  st.forEach((s, i) => {
    const e = errs[i] || 0;
    slop += Math.abs(e);
    if (!e) perfect++;
    veer += e * (s.side === 'C' ? 0.8 : s.side === 'L' ? 0.5 : s.side === 'R' ? -0.5 : s.side === 'H' ? 0.45 : s.side === 'W' ? 0.7 : 0);
  });
  return { veer: clamp(veer, -1, 1), neat: clamp(1 - slop / st.length * 1.6, 0, 1), perfect, folds: st.length };
}

// ================================================================================================ the day
/** What Mika may change on a plane, and how far. */
export const TWEAKS = { elev: [0, 3], clip: [0, 1], tip: [-1, 1] };
export const THROW = { minSpeed: 3, maxSpeed: 8.8, minAngle: -6, maxAngle: 58, hand: 1.45, swing: 0.42, fill: 1.25, throws: 3 };
/** The flight: below `stall` of its lift a nose-up plane stalls and flies again above `fly`; above `flutter` the paper flutters. */
export const FLY = { stall: 0.42, fly: 0.85, stallDrag: 3.6, stallLift: 0.2, flutter: 1.5, flutterDrag: 1.5 };
export const POINTS = { ring: 10, goal: 15, loop: 5 };

/** The throw's speed (m/s) for a power 0..1, and the swinging aim angle (degrees) at time t. */
export const throwSpeed = power => THROW.minSpeed + (THROW.maxSpeed - THROW.minSpeed) * clamp(power, 0, 1);
export function aimAt(t) { const u = (sweepAt(t, THROW.swing) + 1) / 2; return THROW.minAngle + (THROW.maxAngle - THROW.minAngle) * u; }
/** The power while the button is held for t seconds: it fills, and empties again if it is held too long. */
export function powerAt(t) { const f = (t / THROW.fill) % 2; return f < 1 ? f : 2 - f; }

/**
 * A level's day on the hill: { level, wind: { x: with the throw (+ a tailwind), y: across (+ to the right) } in m/s,
 * gusts: [{ t, dur, x, y }], thermal: { x, y, r, w } | null, ring: { x, y, r } | null (land in it for a bonus), goal
 * (metres; 0: none; the round sets it with dayGoal), designs, tweaks, path: the aim helper draws the flight to come,
 * kind: 'calm' | 'tail' | 'head' | 'cross' }. The guided first try is Easy's day.
 */
export function makeDay(seed = 1, level = 'normal', first = false) {
  const R = rng(seed * 7919 + 104729);
  if (first || level === 'easy') return { level: 'easy', seed, wind: { x: 0, y: 0 }, gusts: [], thermal: null, ring: null, goal: 0, designs: ['dart'], tweaks: [], path: true, kind: 'calm' };
  if (level !== 'hard') {
    const tail = R() < 0.5, w = 0.8 + R() * 0.6;
    return { level: 'normal', seed, wind: { x: tail ? w : -w, y: (R() - 0.5) * 0.6 }, gusts: [], thermal: null,
      ring: { x: 17 + R() * 9, y: (R() - 0.5) * 5, r: 3.4 }, goal: 0, designs: DESIGNS.map(d => d.id), tweaks: ['elev'], path: false, kind: tail ? 'tail' : 'head' };
  }
  // (a tailwind carries a floating plane a long way down this hill, so the tailwind days are the gentler ones)
  const k = R(), kind = k < 0.42 ? 'tail' : k < 0.84 ? 'head' : 'cross', w = kind === 'tail' ? 1.3 + R() * 0.5 : 2 + R() * 0.9;
  // (a side wind comes up from the river, on the left: it pushes a plane into the hillside)
  const wind = kind === 'cross' ? { x: (R() - 0.5) * 0.8, y: 1.4 + R() * 0.6 } : { x: kind === 'tail' ? w : -w, y: (R() - 0.5) * 0.5 };
  const gusts = [];
  for (let t = 0.8 + R() * 1.2; t < 40; t += 1.6 + R() * 2) gusts.push({ t, dur: 0.9 + R() * 0.8, x: (R() - 0.5) * 1.5, y: (R() - 0.5) * 1.1 });
  return { level: 'hard', seed, wind, gusts, thermal: { x: 15 + R() * 8, y: (R() - 0.5) * 6, r: 5.5, w: 0.9 }, ring: null, goal: 0,
    designs: DESIGNS.map(d => d.id), tweaks: ['elev', 'clip', 'tip'], path: false, kind };
}

/** The wind at time t of a throw (throws of a round each meet their own gusts): into `out` { x, y }. */
export function windAt(day, t, nth = 0, out = { x: 0, y: 0 }) {
  let x = day.wind.x, y = day.wind.y;
  const tt = t + nth * 9.5;
  for (let i = 0; i < day.gusts.length; i++) {
    const g = day.gusts[i];
    if (tt >= g.t && tt < g.t + g.dur) { const k = Math.sin(Math.PI * (tt - g.t) / g.dur); x += g.x * k; y += g.y * k; }
  }
  out.x = x; out.y = y;
  return out;
}

/** The air rising at (x, y), m/s: strongest in the middle of the thermal, nothing outside it. */
export function liftAt(day, x, y) {
  const th = day.thermal;
  if (!th) return 0;
  const d = Math.hypot(x - th.x, y - th.y) / th.r;
  return d >= 1 ? 0 : th.w * (1 - d * d);
}

// ================================================================================================ flying
/**
 * A plane ready to throw: the design's numbers with the tweaks and the trim worked in.
 * tweaks { elev 0..3, clip 0|1, tip -1|0|1 }, trim { veer, neat } (trimOf; left out: a perfect plane).
 */
export function makePlane(id, tweaks = {}, trim = null) {
  const D = DESIGN[id] || DESIGNS[0];
  const elev = clamp(Math.round(tweaks.elev || 0), 0, 3), clip = tweaks.clip ? 1 : 0, tip = clamp(Math.round(tweaks.tip || 0), -1, 1);
  const up = elev + D.elev, veer = trim?.veer || 0, neat = trim?.neat ?? 1;
  const v0 = D.v0 * (1 - 0.085 * up) * (clip ? 1.15 : 1);
  const ld = D.ld * (1 - 0.06 * Math.max(0, up - 1) - 0.1 * Math.max(0, up - 2)) * (clip ? 0.97 : 1) * (tip ? 0.96 : 1);
  const steady = clamp(D.steady - 0.13 * up + (clip ? 0.32 : 0), 0, 1);
  return { id: D.id, v0, ld, steady, elev, clip, tip, veer, neat, turn: veer * 0.12 + tip * 0.09, drag: 1 + 0.7 * (1 - neat), stallQ: FLY.stall * (1 + 0.2 * up), flutter: D.stiff || FLY.flutter, glide: -Math.atan(1 / ld), liftPow: 2 * (1 - 0.3 * steady) };
}

/** A throw leaving the hand: angle in degrees above level, power 0..1; nth: which throw of the round (its gusts). */
export function newThrow(P, { angle = 12, power = 0.7 } = {}, day = null, nth = 0) {
  const sp = throwSpeed(power), a = angle * Math.PI / 180, w = day ? windAt(day, 0, nth) : { x: 0, y: 0 };
  // thrown straight ahead over the ground; the air it meets is that speed less the wind
  const ax = sp * Math.cos(a) - w.x, ay = -w.y, az = sp * Math.sin(a), h = Math.hypot(ax, ay) || 1e-6;
  return { x: 0, y: 0, z: THROW.hand, v: Math.max(0.8, Math.hypot(h, az)), g: Math.atan2(az, h), psi: Math.atan2(ay, ax), t: 0, nth,
    wx: w.x, wy: w.y, landed: false, wet: false, stall: false, stalled: false, loops: 0, top: THROW.hand, dist: 0, lift: 0, angle, power };
}

const flat = () => 0;
const _w = { x: 0, y: 0 };
/**
 * Advance a throw by dt (changed in place, no allocation). ground(x, y): the height of the ground there above the
 * spot Mika throws from (left out: a level field); a ground under -90 is water.
 */
export function stepPlane(s, P, day, dt, ground = flat) {
  if (s.landed) return s;
  s.t += dt;
  let up = 0;
  if (day) {
    const w = windAt(day, s.t, s.nth, _w), dx = w.x - s.wx, dy = w.y - s.wy;
    if (dx || dy) {
      // a gust: the air changes speed, the plane's own speed over the ground does not (yet)
      const c = Math.cos(s.psi), n = Math.sin(s.psi);
      s.v = Math.max(0.8, s.v - (dx * c + dy * n) * Math.cos(s.g));
      s.psi -= (dy * c - dx * n) / Math.max(2.5, s.v) * (0.7 - 0.4 * P.steady);
      s.wx = w.x; s.wy = w.y;
    }
    up = liftAt(day, s.x, s.y);
  }
  s.lift = up;
  const r = s.v / P.v0, q = r * r, v = Math.max(1.2, s.v);
  const turns = Math.floor((s.g + Math.PI) / TAU), gw = s.g - turns * TAU;          // the nose angle, a loop taken off
  // the stall: too slow to fly while the nose is still up, the wing lets go. Little lift and a lot of drag until the
  // nose has dropped and the plane has dived back up to flying speed (which costs height)
  if (!s.stall && q < P.stallQ && gw > -0.5 && s.t > 0.15) { s.stall = true; s.stalled = true; }
  else if (s.stall && q > FLY.fly) s.stall = false;
  // thrown far faster than it can fly, paper wings flutter and bend: more drag
  const drag = P.drag * (s.stall ? FLY.stallDrag : 1) * (q > P.flutter ? 1 + FLY.flutterDrag * (q - P.flutter) : 1);
  s.v += (-G * Math.sin(s.g) - G / P.ld * q * drag) * dt;
  if (s.v < 0.8) s.v = 0.8;
  let dg = G * (Math.pow(r, P.liftPow) * (s.stall ? FLY.stallLift : 1) - Math.cos(s.g)) / v;
  if (!s.stall && gw > -1.3 && gw < 1.3) dg -= P.steady * 1.5 * (gw - P.glide);     // a steady plane swings back to its glide
  s.g += dg * dt;
  const loops = Math.floor((s.g + Math.PI * 0.5) / TAU);
  if (loops > s.loops) s.loops = loops;
  s.psi += P.turn * G * q / v * dt;
  const ch = Math.cos(s.g) * s.v;
  s.x += (ch * Math.cos(s.psi) + s.wx) * dt;
  s.y += (ch * Math.sin(s.psi) + s.wy) * dt;
  s.z += (Math.sin(s.g) * s.v + up) * dt;
  if (s.z > s.top) s.top = s.z;
  let gz = ground(s.x, s.y);
  if (gz < -90) { gz += 100; s.wet = true; } else s.wet = false;
  // the throw is measured down the field, from the line Mika stands on (as in a throwing contest): curving away earns nothing
  if (s.z <= gz || s.t > 40) { s.z = gz; s.landed = true; s.dist = Math.max(0, s.x); } else s.wet = false;
  return s;
}

/** Fly a whole throw. Returns the landed state; path (a Float32Array, x y z per sample) is filled when given, and state.n says how many samples. */
export function flyThrow(P, aim, day = null, ground = flat, { dt = 1 / 60, nth = 0, path = null, every = 6 } = {}) {
  const s = newThrow(P, aim, day, nth);
  let n = 0, i = 0;
  const cap = path ? Math.floor(path.length / 3) : 0;
  while (!s.landed) {
    if (path && i % every === 0 && n < cap) { path[n * 3] = s.x; path[n * 3 + 1] = s.y; path[n * 3 + 2] = s.z; n++; }
    stepPlane(s, P, day, dt, ground);
    i++;
  }
  if (path && n < cap) { path[n * 3] = s.x; path[n * 3 + 1] = s.y; path[n * 3 + 2] = s.z; n++; }
  s.n = n;
  return s;
}

/** What went wrong (or right) with a landed throw, for the teacher: 'wet' | 'loop' | 'stall' | 'dive' | 'veer' | 'far' | 'ok'. */
export function verdict(s, P, best = 0) {
  if (s.wet) return 'wet';
  if (s.loops) return 'loop';
  if (s.t < 1.3 && s.top < THROW.hand + 0.5) return 'dive';
  if (s.stalled && s.dist < Math.max(12, best * 0.8)) return 'stall';
  if (Math.abs(s.y) > Math.max(4, s.dist * 0.3)) return 'veer';
  return s.dist >= best && s.dist > 14 ? 'far' : 'ok';
}

/** Did the throw land in the ring? */
export function inRing(day, s) { return !!day.ring && !s.wet && Math.hypot(s.x - day.ring.x, s.y - day.ring.y) <= day.ring.r; }

/**
 * The longest throw the day allows a perfectly folded plane (a search over designs, tweaks, angles and powers):
 * { dist, design, elev, clip, tip, angle, power }. Used for the day's goal and by the tests.
 */
export function bestThrow(day, ground = flat, { designs = day.designs, dt = 1 / 40 } = {}) {
  let best = { dist: 0 };
  const has = k => day.tweaks.includes(k);
  for (const id of designs) for (let elev = 0; elev <= (has('elev') ? 3 : 0); elev++) for (let clip = 0; clip <= (has('clip') ? 1 : 0); clip++) {
    const P = makePlane(id, { elev, clip });
    for (let angle = 0; angle <= 40; angle += 5) for (let power = 0.3; power <= 1.001; power += 0.1) {
      const s = flyThrow(P, { angle, power }, day, ground, { dt });
      if (!s.wet && s.dist > best.dist) best = { dist: s.dist, design: id, elev, clip, tip: 0, angle, power };
    }
  }
  return best;
}

/** How much of the day's very best throw the goal asks for: more than the wrong plane can fly, less than the right one flown well. */
export const GOAL_SHARE = 0.82;

/** The distance to beat on a Difficult day: what a child who has understood the wind can reach (metres, whole). */
export function dayGoal(day, ground = flat) { return Math.round(bestThrow(day, ground).dist * GOAL_SHARE); }

/**
 * The round's score: a point for every whole metre of the best throw, 10 for a plane landed in the ring, 15 for
 * reaching the day's goal, 5 for a loop, and a point for every exact fold.
 * throws: [{ dist, ring, loops, wet }]; perfect: exact folds.
 */
export function planeScore(day, throws, perfect = 0) {
  let best = 0, ring = false, loop = false;
  for (const t of throws) { if (!t.wet && t.dist > best) best = t.dist; if (t.ring) ring = true; if (t.loops) loop = true; }
  const goal = day.goal > 0 && best >= day.goal;
  return { best, ring, loop, goal, score: Math.floor(best) + (ring ? POINTS.ring : 0) + (goal ? POINTS.goal : 0) + (loop ? POINTS.loop : 0) + perfect };
}

// ================================================================================================ the hill
/** Where the round is played, from the sign: Mika throws `stand` metres along `heading` (radians; sin, cos in x, z). */
export const FIELD = { heading: 3.4, stand: 8.2, water: 0.12 };

/**
 * The hill as the flight sees it: ground(x, y) for stepPlane from the world's heightAt(x, z) and the sign's place
 * { x, z }. x runs along the throw, y to the right of it; water comes back 100 lower (the flight's sign for "wet").
 */
export function fieldGround(heightAt, place) {
  const dx = Math.sin(FIELD.heading), dz = Math.cos(FIELD.heading), rx = -dz, rz = dx;
  const ox = place.x + dx * FIELD.stand, oz = place.z + dz * FIELD.stand, h0 = heightAt(ox, oz);
  const fn = (x, y) => { const h = heightAt(ox + dx * x + rx * y, oz + dz * x + rz * y); return h < FIELD.water ? FIELD.water - h0 - 100 : h - h0; };
  fn.origin = { x: ox, z: oz, y: h0, dx, dz, rx, rz };
  return fn;
}
