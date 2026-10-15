// Morning exercise: the rules. Pure (no three.js, no DOM, no Math.random), tested in tests/exercise.test.mjs. The round
// (./exercise.js) shows and plays what is planned here.
//
// Three routines, each played at three levels:
//   * radio:   the morning exercise of Japan's radio (rajio taisō) and of Vietnamese school yards: stretch, arm swings,
//              arm circles, side bends, twists, knee bends, little jumps, deep breaths, to a piano march and a count;
//   * workout: a kids' workout: marching, star jumps, high knees, squats, a short plank on the knees, a stretch;
//   * yoga:    kids' yoga named after animals and nature: mountain, tree, warrior, bird, cat and cow, cobra (the snake),
//              child's pose (the little mouse), and balloon breaths to a calm drone.
// Everything is timed in counts (one, two, three, four...). A move is a clip of n counts that loops; the counts where
// Mika must answer are its hits, each with the control that answers it (up, down, left, right or tap). A hold is a
// pose kept steady while a balance needle drifts (small left / right taps bring it back); a breath grows a circle while
// the button is held (breathing in) and shrinks it when it is let go (out).
// Nobody fails: a missed count only costs its points. A routine is worth the same at a level whichever it is (the
// points of a cue are the level's total split over the routine's cues), so the stars mean the same everywhere.
import { N_ } from '../../i18n/i18n.js';

/** A small seeded random source (the same numbers every run for the same seed). */
export function rng(seed) {
  let s = (Math.floor(seed) % 2147483646 + 2147483646) % 2147483646 + 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

export const ROUTINES = ['radio', 'workout', 'yoga'];
export const ROUTINE_NAME = { radio: N_('Radio exercise'), workout: N_('Workout'), yoga: N_("Kids' yoga") };
export const ROUTINE_DESC = {
  radio: N_('Stretch, swing, bend and jump to the piano, like radio exercise.'),
  workout: N_('March, star jumps, squats and a little plank.'),
  yoga: N_('Be a tree, a cat, a snake and a little mouse. Slow and calm.'),
};
export const KEYS = ['up', 'down', 'left', 'right', 'tap'];
export const KEY_WORD = { up: N_('Up'), down: N_('Down'), left: N_('Left'), right: N_('Right'), tap: N_('Tap') };

/**
 * The moves. clip: the animation (art/blender/exercise_moves.py); counts: its loop; hits: [[count, key], ...];
 * kind: 'beat' | 'hold' | 'breath'; sides: the move goes to the left and the right in turn (its second half mirrors the
 * first, so the instructor facing the class plays it half a loop on to show it as in a mirror); side: a held pose
 * done on one side (L lifts the left leg); floor: done on the floor (on a mat, from hands and knees); pic: its picture
 * on the card; name: the card's word; say: what the instructor calls when it starts.
 */
export const MOVES = {
  stretch: { clip: 'ExStretch', counts: 4, kind: 'beat', hits: [[1, 'up']], pic: 'stretch', name: N_('Stretch up'), say: N_('Reach up high, up on your toes!') },
  swing: { clip: 'ExArmSwing', counts: 2, kind: 'beat', hits: [[1, 'tap']], pic: 'swing', name: N_('Arm swings'), say: N_('Swing your arms and bounce your knees!') },
  circle: { clip: 'ExArmCircle', counts: 2, kind: 'beat', hits: [[1, 'tap']], pic: 'circle', name: N_('Arm circles'), say: N_('Big circles with both arms!') },
  sidebend: { clip: 'ExSideBend', counts: 4, kind: 'beat', hits: [[1, 'left'], [3, 'right']], sides: true, pic: 'sidebend', name: N_('Side bends'), say: N_('Bend to the side, like a flower in the wind.') },
  twist: { clip: 'ExTwist', counts: 4, kind: 'beat', hits: [[1, 'left'], [3, 'right']], sides: true, pic: 'twist', name: N_('Twists'), say: N_('Turn your body, let your arms swing round.') },
  kneebend: { clip: 'ExKneeBend', counts: 2, kind: 'beat', hits: [[1, 'down']], pic: 'kneebend', name: N_('Knee bends'), say: N_('Hands on your knees, bend and stretch!') },
  jump: { clip: 'ExJump', counts: 2, kind: 'beat', hits: [[0, 'tap'], [1, 'tap']], pic: 'jump', name: N_('Little jumps'), say: N_('Little jumps, light as a bird!') },
  breathe: { clip: 'ExBreath', counts: 4, kind: 'breath', pic: 'breathe', name: N_('Deep breath'), say: N_('Arms up, breathe in... and down, breathe out.') },
  march: { clip: 'ExMarch', counts: 2, kind: 'beat', hits: [[0, 'left'], [1, 'right']], sides: true, pic: 'march', name: N_('Marching'), say: N_('March on the spot, knees up!') },
  star: { clip: 'ExStarJump', counts: 2, kind: 'beat', hits: [[1, 'up']], pic: 'star', name: N_('Star jumps'), say: N_('Jump out like a star, and in again!') },
  knees: { clip: 'ExHighKnees', counts: 2, kind: 'beat', hits: [[0, 'left'], [1, 'right']], sides: true, pic: 'knees', name: N_('High knees'), say: N_('Knees up high, quick feet!') },
  squat: { clip: 'ExSquat', counts: 4, kind: 'beat', hits: [[1, 'down']], pic: 'squat', name: N_('Squats'), say: N_('Sit back like on a chair, then stand tall.') },
  plank: { clip: 'ExPlank', counts: 4, kind: 'hold', floor: true, pic: 'plank', name: N_('Knee plank'), say: N_('Knees down, body long and straight. Hold it!') },
  reach: { clip: 'ExToeReach', counts: 4, kind: 'hold', pic: 'reach', name: N_('Stretch'), say: N_('Soft knees, let your hands hang down. Breathe.') },
  mountain: { clip: 'ExMountain', counts: 4, kind: 'hold', pic: 'mountain', name: N_('Be a mountain'), say: N_('Stand tall and still, like a mountain.') },
  tree: { clip: 'ExTree', counts: 4, kind: 'hold', side: true, pic: 'tree', name: N_('Be a tree'), say: N_('Foot on your leg, arms up like branches.') },
  warrior: { clip: 'ExWarrior', counts: 4, kind: 'hold', side: true, pic: 'warrior', name: N_('Be a warrior'), say: N_('Step wide, bend your knee, arms out strong.') },
  bird: { clip: 'ExBird', counts: 4, kind: 'hold', side: true, pic: 'bird', name: N_('Be a bird'), say: N_('Lean forward, one leg back, spread your wings.') },
  catcow: { clip: 'ExCatCow', counts: 4, kind: 'beat', hits: [[1, 'up'], [3, 'down']], floor: true, pic: 'catcow', name: N_('Cat and cow'), say: N_('Cow: look up. Cat: round your back.') },
  cobra: { clip: 'ExCobra', counts: 4, kind: 'hold', floor: true, pic: 'cobra', name: N_('Be a snake'), say: N_('Lie on your tummy and lift your chest. Hiss!') },
  child: { clip: 'ExChild', counts: 4, kind: 'hold', floor: true, pic: 'child', name: N_('Be a little mouse'), say: N_('Sit back on your heels and rest, small as a mouse.') },
  balloon: { clip: 'ExBreath', counts: 4, kind: 'breath', pic: 'breathe', name: N_('Balloon breaths'), say: N_('Fill up like a balloon... and let it out slowly.') },
};

/** Seconds a count lasts, per routine and level. Yoga is slower: it breathes. */
export const TEMPO = {
  radio: { easy: 0.72, normal: 0.6, hard: 0.5 },
  workout: { easy: 0.72, normal: 0.6, hard: 0.5 },
  yoga: { easy: 0.95, normal: 0.86, hard: 0.8 },
};
/** How close to its count a press must land (seconds either side): Great, then Good. */
export const WINDOWS = { easy: { great: 0.16, good: 0.32 }, normal: { great: 0.11, good: 0.22 }, hard: { great: 0.085, good: 0.17 } };
/** What a level's whole routine is worth, and the stars (also the trick row's `levels` in content/tricks.js). */
export const LEVEL_MAX = { easy: 100, normal: 200, hard: 300 };
export const STARS = { easy: [30, 60, 82], normal: [80, 135, 172], hard: [130, 205, 258] };
/** The balance needle of a hold: how hard it is pushed about (per level), and how the player's taps steer it. */
export const BALANCE = {
  drift: { easy: 1.25, normal: 1.6, hard: 2.3 },   // the push of the wobble (needle widths a second squared)
  push: 4.2,          // a held left / right pushes back this hard
  spring: 1.1,        // the pose itself pulls back a little toward the middle
  damp: 1.7,          // and settles
  steady: 0.32,       // inside this the needle is in the green
};
export const GRACE = 0.3;     // a breath may start or end this late (s) and still count

/** The side an instructor facing the class shows a sided move on, as the class sees it: her left is your right. */
export function demoSide(side, mirror) {
  if (side !== 'left' && side !== 'right') return side;
  return mirror ? (side === 'left' ? 'right' : 'left') : side;
}

/**
 * Where the instructor's clip of a move starts against the class's (0 or 0.5 of a loop). Facing the class she shows a
 * sided move as in a mirror (her right when the class goes left: half a loop on), and so the class can copy what it
 * sees. In a mirror section (Difficult) she does her own side instead: the class goes the way the word says.
 */
export const demoPhase = (move, mirror) => (MOVES[move]?.sides && !mirror ? 0.5 : 0);
/** And for a held pose on one side: the side of the clip she plays (the class plays `side`). */
export const demoHoldSide = (side, mirror) => (mirror ? side : side === 'L' ? 'R' : 'L');

// ---------------------------------------------------------------------------------------------------- the routines
// A plan item: { t: 'talk', n, say } | { t: 'move', m, n, watch?, mirror?, card? } | { t: 'combo', ms: [a, b], n, ... }
// | { t: 'hold', m, n, side? } | { t: 'breath', m, n } | { t: 'trans', clip, n, rev? }
// n: counts; watch: counts at the start the instructor shows alone (no hits); card: 'full' | 'word' | 'none'.
const TALK = {
  hello: N_('Good morning! Stand tall, feet a little apart. Here we go!'),
  helloYoga: N_('Good morning! Let\'s be calm and slow today. Breathe through your nose.'),
  helloWork: N_('Good morning! Let\'s get our hearts pumping!'),
  down: N_('Come down onto your hands and knees.'),
  last: N_('Last one: a big deep breath to finish.'),
  mirror: N_('Now I use my own left and right. Follow the word, not my side!'),
  follow: N_('No cards now. Follow me!'),
  bye: N_('Well done! Shake out your arms and legs.'),
};
export { TALK };

const R = (level, easy, normal, hard) => (level === 'easy' ? easy : level === 'hard' ? hard : normal);

function radio(level, first) {
  const w = R(level, 4, 2, 0), n = R(level, 12, 16, 16);
  const out = [{ t: 'talk', n: 4, say: TALK.hello }];
  out.push({ t: 'move', m: 'stretch', n, watch: w });
  out.push({ t: 'move', m: 'swing', n, watch: w });
  out.push({ t: 'move', m: 'circle', n: R(level, 8, 16, 16), watch: w });
  out.push({ t: 'move', m: 'sidebend', n, watch: w });
  if (level === 'hard') out.push({ t: 'talk', n: 4, say: TALK.mirror }, { t: 'move', m: 'sidebend', n: 16, mirror: true, card: 'word' });
  out.push({ t: 'move', m: 'twist', n, watch: w });
  if (level === 'hard') out.push({ t: 'move', m: 'twist', n: 16, mirror: true, card: 'word' });
  out.push({ t: 'move', m: 'kneebend', n, watch: w });
  if (level !== 'easy') out.push({ t: 'combo', ms: ['stretch', 'sidebend'], n: 16 }, { t: 'combo', ms: ['swing', 'circle'], n: 16 });
  if (level === 'hard') out.push({ t: 'talk', n: 4, say: TALK.follow }, { t: 'combo', ms: ['kneebend', 'swing'], n: 16, card: 'none' }, { t: 'combo', ms: ['stretch', 'twist'], n: 16, card: 'none' });
  out.push({ t: 'move', m: 'jump', n, watch: w });
  out.push({ t: 'talk', n: 4, say: TALK.last }, { t: 'breath', m: 'breathe', n: R(level, 8, 12, 16) });
  out.push({ t: 'talk', n: 4, say: TALK.bye });
  if (first) for (const it of out) if (it.t === 'move') it.watch = Math.max(it.watch || 0, 4);
  return out;
}

function workout(level, first) {
  const w = R(level, 4, 2, 0), n = R(level, 12, 16, 16);
  const out = [{ t: 'talk', n: 4, say: TALK.helloWork }];
  out.push({ t: 'move', m: 'march', n, watch: w });
  out.push({ t: 'move', m: 'star', n, watch: w });
  if (level !== 'easy') out.push({ t: 'move', m: 'knees', n: R(level, 0, 12, 16), watch: w });
  if (level === 'hard') out.push({ t: 'talk', n: 4, say: TALK.mirror }, { t: 'move', m: 'march', n: 16, mirror: true, card: 'word' }, { t: 'move', m: 'knees', n: 16, mirror: true, card: 'word' });
  out.push({ t: 'move', m: 'squat', n, watch: w });
  out.push({ t: 'move', m: 'march', n: R(level, 8, 16, 16) });
  if (level !== 'easy') out.push({ t: 'combo', ms: ['march', 'star'], n: 16 }, { t: 'combo', ms: ['squat', 'star'], n: 16 });
  if (level === 'hard') out.push({ t: 'talk', n: 4, say: TALK.follow }, { t: 'combo', ms: ['squat', 'knees'], n: 16, card: 'none' }, { t: 'combo', ms: ['star', 'march'], n: 16, card: 'none' });
  out.push({ t: 'talk', n: 2, say: TALK.down }, { t: 'trans', clip: 'ExDown', n: 4 }, { t: 'trans', clip: 'ExPlankIn', n: 2 });
  out.push({ t: 'hold', m: 'plank', n: R(level, 6, 8, 12) });
  out.push({ t: 'trans', clip: 'ExPlankIn', n: 2, rev: true }, { t: 'trans', clip: 'ExDown', n: 4, rev: true });
  out.push({ t: 'hold', m: 'reach', n: R(level, 8, 8, 12) });
  out.push({ t: 'talk', n: 2, say: TALK.last }, { t: 'breath', m: 'breathe', n: R(level, 8, 8, 12) });
  out.push({ t: 'talk', n: 4, say: TALK.bye });
  if (first) for (const it of out) if (it.t === 'move') it.watch = Math.max(it.watch || 0, 4);
  return out;
}

function yoga(level) {
  const h = R(level, 8, 8, 10);
  const sided = (m, sides) => {
    const out = [];
    for (const side of sides) {
      out.push({ t: 'trans', clip: `${MOVES[m].clip}In${side}`, n: 2, side });
      out.push({ t: 'hold', m, n: h, side });
      out.push({ t: 'trans', clip: `${MOVES[m].clip}In${side}`, n: 2, side, rev: true });
    }
    return out;
  };
  const both = level === 'easy' ? ['L'] : ['L', 'R'];
  const out = [{ t: 'talk', n: 4, say: TALK.helloYoga }, { t: 'hold', m: 'mountain', n: R(level, 8, 6, 6) }];
  out.push(...sided('tree', both));
  if (level !== 'easy') out.push(...sided('warrior', both));
  if (level === 'hard') out.push(...sided('bird', both));
  out.push({ t: 'talk', n: 2, say: TALK.down }, { t: 'trans', clip: 'ExDown', n: 4 });
  out.push({ t: 'move', m: 'catcow', n: R(level, 12, 12, 12), watch: R(level, 4, 4, 0) });
  if (level === 'hard') out.push({ t: 'move', m: 'catcow', n: 8, card: 'none' });
  if (level !== 'easy') out.push({ t: 'trans', clip: 'ExCobraIn', n: 3 }, { t: 'hold', m: 'cobra', n: h }, { t: 'trans', clip: 'ExCobraIn', n: 3, rev: true });
  out.push({ t: 'trans', clip: 'ExChildIn', n: 2 }, { t: 'hold', m: 'child', n: h }, { t: 'trans', clip: 'ExChildIn', n: 2, rev: true });
  out.push({ t: 'trans', clip: 'ExDown', n: 4, rev: true }, { t: 'talk', n: 2, say: TALK.last });
  out.push({ t: 'breath', m: 'balloon', n: R(level, 8, 12, 12) });
  out.push({ t: 'talk', n: 4, say: TALK.bye });
  return out;
}

/**
 * The plan of one round: { routine, level, count (seconds a count), items: [{...item, start}], cues, holds, breaths,
 * counts, seconds, units }. Items are laid out one after the other on the count line (start: the first count).
 * cues: [{ i, at (count), key, item }] the hits to answer; holds: [{ from, to, m, side, drift }]; breaths:
 * [{ from, to, in: [[a, b], ...] }] (counts breathed in; the rest is out).
 */
export function makeRoutine({ routine = 'radio', level = 'normal', first = false, seed = 1 } = {}) {
  const items = routine === 'workout' ? workout(level, first) : routine === 'yoga' ? yoga(level, first) : radio(level, first);
  const count = TEMPO[routine][level];
  const cues = [], holds = [], breaths = [];
  let t = 0;
  for (const it of items) {
    it.start = t;
    if (it.t === 'move' || it.t === 'combo') {
      // a combo plays its two moves in turn, four counts each (a move of two counts loops twice)
      for (let c = it.watch || 0; c < it.n; c++) {
        const m = it.t === 'combo' ? it.ms[Math.floor(c / 4) % 2] : it.m, mv = MOVES[m];
        const local = it.t === 'combo' ? c % 4 : c;
        for (const [hc, key] of mv.hits || []) if (local % mv.counts === hc) cues.push({ i: cues.length, at: t + c, key, m, mirror: !!it.mirror, card: it.card || 'full' });
      }
    } else if (it.t === 'hold') {
      holds.push({ from: t, to: t + it.n, m: it.m, side: it.side || null, drift: BALANCE.drift[level] * (MOVES[it.m].floor ? 0.8 : 1) });
    } else if (it.t === 'breath') {
      const ins = [];
      for (let c = 0; c + 4 <= it.n; c += 4) ins.push([t + c, t + c + 2]);
      breaths.push({ from: t, to: t + it.n, in: ins });
    }
    t += it.n;
  }
  // what each answer is worth: a cue 1 unit, a hold 1 unit for every two counts, a breath 1 unit each way
  const units = cues.length + holds.reduce((a, h) => a + (h.to - h.from) / 2, 0) + breaths.reduce((a, b) => a + b.in.length * 2, 0);
  return { routine, level, first, seed, count, items, cues, holds, breaths, counts: t, seconds: t * count, units, max: LEVEL_MAX[level], unit: LEVEL_MAX[level] / Math.max(1, units) };
}

/** The plan item playing at count c (and its index), or null after the end. */
export function itemAt(plan, c) {
  const it = plan.items;
  for (let i = 0; i < it.length; i++) if (c < it[i].start + it[i].n) return { item: it[i], index: i };
  return null;
}

/** The move playing at count c inside an item (a combo switches every four counts) and the count within its loop. */
export function moveAt(item, c) {
  const local = c - item.start;
  if (item.t === 'combo') {
    const m = item.ms[((Math.floor(local / 4) % 2) + 2) % 2], l4 = ((local % 4) + 4) % 4;
    return { m, phase: (l4 / MOVES[m].counts) % 1 };
  }
  if (!item.m) return null;
  const mv = MOVES[item.m];
  return { m: item.m, phase: ((local / mv.counts) % 1 + 1) % 1 };
}

/** How a press lands against its count: 'great', 'good' or null (outside). dt: seconds early (-) or late (+). */
export function judge(dt, level) {
  const w = WINDOWS[level] || WINDOWS.normal, a = Math.abs(dt);
  return a <= w.great ? 'great' : a <= w.good ? 'good' : null;
}

/** The wobble of a hold: a smooth, seeded push that never repeats exactly (needle widths per second squared). */
export function wobbleForce(t, seed, strength) {
  const r = rng(seed * 7 + 3), a = r() * 6.28, b = r() * 6.28, c = r() * 6.28;
  return strength * (0.55 * Math.sin(1.3 * t + a) + 0.3 * Math.sin(2.9 * t + b) + 0.15 * Math.sin(5.3 * t + c));
}

/** One step of the balance needle { w, v }: steer -1 (left), 0 or 1 (right) pushes it that way. Returns the state. */
export function balanceStep(s, dt, force, steer) {
  const B = BALANCE;
  const acc = force + steer * B.push - B.spring * s.w - B.damp * s.v;
  s.v += acc * dt;
  s.w += s.v * dt;
  if (s.w > 1) { s.w = 1; s.v = Math.min(0, s.v); }
  if (s.w < -1) { s.w = -1; s.v = Math.max(0, s.v); }
  return s;
}

/** Is a breath in at count c (one of the item's in-spans)? */
export function breathingIn(b, c) {
  for (const [a, e] of b.in) if (c >= a && c < e) return true;
  return false;
}

/**
 * The scoring of a round. One instance per round: press() answers cues, tick() moves the clock on (misses cues whose
 * window has passed, scores holds and breaths), total() is the score. Time is in seconds from the round's start.
 */
export class Session {
  constructor(plan, seed = plan.seed || 1) {
    this.plan = plan;
    this.seed = seed;
    this.t = 0;
    this.done = new Map();          // cue index -> 'great' | 'good' | 'miss' | 'wrong'
    this.points = 0;
    this.great = 0; this.good = 0; this.miss = 0;
    this.streak = 0; this.best = 0;
    this.bal = { w: 0, v: 0 };      // the balance needle of the hold playing now
    this.holdSteady = 0; this.holdTime = 0;   // (seconds) over every hold
    this.breathOk = 0; this.breathTime = 0;
    this.holdParts = new Map();     // hold index -> { ok, all }
    this.breathParts = new Map();
    this.next = 0;                  // the first cue not yet answered or missed
  }

  get countSec() { return this.plan.count; }
  countAt(t) { return t / this.plan.count; }

  /** The cue a press at time t would answer: the nearest open one within the Good window. */
  open(t) {
    const W = WINDOWS[this.plan.level].good, cs = this.plan.count;
    let best = null, bd = Infinity;
    for (let i = this.next; i < this.plan.cues.length; i++) {
      const q = this.plan.cues[i], dt = t - q.at * cs;
      if (dt < -W) break;
      if (this.done.has(i) || dt > W) continue;
      if (Math.abs(dt) < bd) { bd = Math.abs(dt); best = q; }
    }
    return best;
  }

  /** A press of `key` at time t. Returns { result: 'great'|'good'|'wrong'|null, cue, dt } (null: nothing to answer). */
  press(key, t) {
    const q = this.open(t);
    if (!q) return { result: null, cue: null, dt: 0 };
    const dt = t - q.at * this.plan.count;
    let result = key === q.key ? judge(dt, this.plan.level) : 'wrong';
    if (!result) return { result: null, cue: null, dt };
    this.done.set(q.i, result);
    if (result === 'great') { this.great++; this.points += this.plan.unit; this.streak++; }
    else if (result === 'good') { this.good++; this.points += this.plan.unit * 0.6; this.streak++; }
    else { this.miss++; this.streak = 0; }
    this.best = Math.max(this.best, this.streak);
    this.advance();
    return { result, cue: q, dt };
  }

  advance() { while (this.next < this.plan.cues.length && this.done.has(this.next)) this.next++; }

  /**
   * Move the clock to t. hold: the hold button is down; steer: -1 / 0 / 1 (left / right held). Returns the cues missed
   * by this step ([cue, ...]) and the state of a hold or breath playing now.
   */
  tick(t, dt, { hold = false, steer = 0 } = {}) {
    const plan = this.plan, cs = plan.count, W = WINDOWS[plan.level].good;
    this.t = t;
    const missed = [];
    for (let i = this.next; i < plan.cues.length; i++) {
      const q = plan.cues[i];
      if (t - q.at * cs <= W) break;
      if (!this.done.has(i)) { this.done.set(i, 'miss'); this.miss++; this.streak = 0; missed.push(q); }
    }
    this.advance();
    const c = t / cs;
    let state = null;
    const hi = plan.holds.findIndex(h => c >= h.from && c < h.to);
    if (hi >= 0) {
      const h = plan.holds[hi];
      if (!this.holdParts.has(hi)) { this.holdParts.set(hi, { ok: 0, all: 0 }); this.bal = { w: 0, v: 0 }; }
      balanceStep(this.bal, dt, wobbleForce(t, this.seed + hi, h.drift), steer);
      const steady = hold && Math.abs(this.bal.w) < BALANCE.steady;
      const part = this.holdParts.get(hi);
      part.all += dt; if (steady) part.ok += dt;
      this.holdTime += dt; if (steady) this.holdSteady += dt;
      state = { kind: 'hold', hold: h, w: this.bal.w, steady, holding: hold };
    }
    const bi = plan.breaths.findIndex(b => c >= b.from && c < b.to);
    if (bi >= 0) {
      const b = plan.breaths[bi], inNow = breathingIn(b, c);
      // just after the guide turns, the old way still counts for a moment
      const late = breathingIn(b, c - GRACE / cs);
      const ok = hold === inNow || hold === late;
      if (!this.breathParts.has(bi)) this.breathParts.set(bi, { ok: 0, all: 0 });
      const part = this.breathParts.get(bi);
      part.all += dt; if (ok) part.ok += dt;
      this.breathTime += dt; if (ok) this.breathOk += dt;
      state = { kind: 'breath', breath: b, in: inNow, ok, holding: hold };
    }
    return { missed, state };
  }

  /** The points so far (cues as they are answered; holds and breaths by the share of their time done right). */
  total() {
    const plan = this.plan;
    let p = this.points;
    // (a hold or a breath earns as it goes: its share of time done right, out of its whole length)
    plan.holds.forEach((h, i) => { const part = this.holdParts.get(i); if (part) p += plan.unit * ((h.to - h.from) / 2) * Math.min(1, part.ok / ((h.to - h.from) * plan.count * 0.97)); });
    plan.breaths.forEach((b, i) => { const part = this.breathParts.get(i); if (part) p += plan.unit * b.in.length * 2 * Math.min(1, part.ok / ((b.to - b.from) * plan.count * 0.97)); });
    return Math.round(p);
  }

  /** The numbers for the results card. */
  summary() {
    return {
      score: this.total(), great: this.great, good: this.good, miss: this.miss, best: this.best,
      steady: this.holdTime ? Math.round(100 * this.holdSteady / this.holdTime) : null,
      breath: this.breathTime ? Math.round(100 * this.breathOk / this.breathTime) : null,
    };
  }
}

/** Stars for a score at a level. */
export const starsAt = (score, level) => STARS[level].filter(s => score >= s).length;
