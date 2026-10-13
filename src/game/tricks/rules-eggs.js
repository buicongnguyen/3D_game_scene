// Eggs down the gutters: the rules. Pure (no three.js, no DOM, no Math.random), tested in tests/eggs.test.mjs. The round
// (./eggs.js) draws what is decided here.
//
// Four hens sit on the henhouse roof, one over each of four bamboo down-gutters; each gutter ends in a spout. Between
// neighbouring gutters hang rungs: short bamboo seesaws. An egg that comes down to a rung is scooped up by it, the
// seesaw tips, and the egg rolls across into the neighbouring gutter. It takes every rung it meets. That is the
// lot-drawing game Amidakuji ("ghost leg"): every rung swaps two neighbours, so four eggs put in at the top always come
// out of four different spouts, whatever the board looks like.
// (A rung that only sloped one way could carry an egg one way only, and two eggs could then leave by the same spout:
// hence the seesaw, which tips to whichever side the egg is heading.)
//
// Mika stands below with her straw hat. A hen clucks and puffs for a second before she lays; the egg rolls slowly
// enough to follow with the eye. Difficulty comes from reading: more rungs, then two eggs in the gutters at once,
// then slightly quicker rolls. Between waves a rung or two moves, never while an egg is rolling.

/** The board and the play, in metres on the front of the henhouse (x to the right, y up from the ground). */
export const EGGS = Object.freeze({
  lanes: 4,
  rows: 5,                // heights a rung can hang at (one rung per row at most)
  dx: 0.95,               // gutter to gutter
  top: 3.84,              // where a laid egg enters its gutter
  row0: 3.5,              // the height of row 0
  rowH: 0.4,              // row to row
  spout: 1.62,            // where the egg leaves the gutter (just over Mika's head)
  hatY: 0.98,             // the brim of the hat she holds out in front of her
  scoop: 0.5,             // she still gets an egg this far below the brim (a late dive)
  catchR: 0.46,           // how far (m) from the middle of the hat still counts
  easyCatchR: 0.5,
  gravity: 6,             // a gentle drop from the spout
  basket: 2.0,            // x where she stands to tip the hat into the basket, right of the last gutter
  full: 6,                // eggs that fill the hat
  speed: 0.92,            // m/s an egg rolls at speed 1
  warn: 1.0,              // seconds a hen clucks and puffs before she lays
  lay: 0.28,              // seconds from the nest into the gutter
  gap: 1.5,               // two eggs at once: seconds between two lays (at speed 1)
  apart: 0.85,            // ...and two eggs never leave their spouts closer together than this (s)
  mika: 6.5,              // m/s: she is quick
  tip: 0.55,              // seconds to tip the hat into the basket
  shift: 1.25,            // seconds a board change takes (crossings swing to their new places)
  pause: 0.45,            // a breath between waves when nothing moves
  gold: 3,                // points for a golden egg
  quick: 2,               // ...and for a little brown egg, which rolls half as fast again
  quickSpeed: 1.5,
  chickSpeed: 0.8,        // a chick slides down a little slower than an egg rolls,
  chickGravity: 3,        // and flutters down from the spout
  lives: 3,               // broken eggs that end a Difficult round
  normalLives: 4,         // ...a Normal round
  gentleLives: 5,         // ...the guided first try and an Easy round
  slope: 0.105,           // a one-way slide: its high end is this far above its row, its low end this far below
  beat: 2.6,              // seconds a stage's name stays up before its first hen puffs (the clock waits)
  look: 1.15,             // seconds at least the board is in full view before the hiding board closes
  streak: 5,              // catches in a row that make the hens cheer
  streakBonus: 2,         // ...and what the cheer is worth
  orderBonus: 3,          // a stage's order filled
  perfectBonus: 2,        // a stage with nothing broken and no chick in the hat
  feedWarn: 1.5,          // feeding time: every hen puffs at once for this long,
  feedGap: 0.3,           // then they lay one after another, at least this far apart
});

export const laneX = i => (i - (EGGS.lanes - 1) / 2) * EGGS.dx;
export const rungY = r => EGGS.row0 - r * EGGS.rowH;

/** A small seeded random source (the same numbers every run for the same seed). */
export function rng(seed) {
  let s = (Math.floor(seed) % 2147483646 + 2147483646) % 2147483646 + 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
const pick = (rand, n) => Math.min(n - 1, Math.floor(rand() * n));

// ---------------------------------------------------------------------------------------------------- the board
// A board is a list of rungs { row, col }: a crossing in `row` between gutter `col` and gutter `col + 1`, sorted by row.

const sorted = rungs => rungs.slice().sort((a, b) => a.row - b.row);

/** Would a rung at (row, col) sit well among `rungs`? Its row is free, and the rung above and below is not the same pair
 *  (two crossings of one pair in a row undo each other: a knot that only looks hard). */
export function rungFits(rungs, row, col) {
  if (row < 0 || row >= EGGS.rows || col < 0 || col >= EGGS.lanes - 1) return false;
  let up = null, down = null;
  for (const r of rungs) {
    if (r.row === row) return false;
    if (r.row < row && (!up || r.row > up.row)) up = r;
    if (r.row > row && (!down || r.row < down.row)) down = r;
  }
  return !(up && up.col === col) && !(down && down.col === col);
}

/** One rung a row, and never the same pair twice running. */
export function wellFormed(rungs) {
  const s = sorted(rungs);
  for (let i = 1; i < s.length; i++) if (s[i].row === s[i - 1].row || s[i].col === s[i - 1].col) return false;
  return true;
}

/** Every place a new rung could go. */
function freePlaces(rungs) {
  const out = [];
  for (let row = 0; row < EGGS.rows; row++) for (let col = 0; col < EGGS.lanes - 1; col++) if (rungFits(rungs, row, col)) out.push({ row, col });
  return out;
}

/** A fresh board with n rungs (seeded). */
export function makeBoard(rand, n) {
  const rungs = [];
  for (let k = 0; k < Math.min(n, EGGS.rows); k++) {
    const free = freePlaces(rungs);
    if (!free.length) break;
    rungs.push(free[pick(rand, free.length)]);
  }
  return { rungs: sorted(rungs) };
}

/**
 * The next wave's board: `moves` rungs go to new places, then rungs are added (or taken away) until there are `n`.
 * Returns { board, changes }: changes are { from, to } with from or to null for a rung that arrives or leaves, in the
 * order the round shows them. Rungs that stay are the same objects in neither list.
 */
export function shiftBoard(board, rand, n, moves = 1) {
  let rungs = board.rungs.slice();
  const changes = [];
  n = Math.min(n, EGGS.rows);
  while (rungs.length > n) {
    // (take one away that leaves no two rungs of one pair in a row, when there is such a one)
    const fine = rungs.filter(r => wellFormed(rungs.filter(q => q !== r))), list = fine.length ? fine : rungs;
    const gone = list[pick(rand, list.length)];
    changes.push({ from: gone, to: null });
    rungs = rungs.filter(r => r !== gone);
  }
  for (let k = 0; k < moves && rungs.length; k++) {
    const options = [];
    for (const old of rungs) {
      if (changes.some(c => c.to === old)) continue;            // (a rung moves once a wave)
      const rest = rungs.filter(r => r !== old);
      for (let row = 0; row < EGGS.rows; row++) for (let col = 0; col < EGGS.lanes - 1; col++) {
        if ((row === old.row && col === old.col) || rest.some(r => r.row === row)) continue;
        const to = { row, col };
        if (wellFormed([...rest, to])) options.push({ old, to });
      }
    }
    if (!options.length) break;
    const o = options[pick(rand, options.length)];
    rungs = [...rungs.filter(r => r !== o.old), o.to];
    changes.push({ from: o.old, to: o.to });
  }
  while (rungs.length < n) {
    const free = freePlaces(rungs);
    if (!free.length) break;
    const to = free[pick(rand, free.length)];
    rungs.push(to);
    changes.push({ from: null, to });
  }
  if (!wellFormed(rungs) || rungs.length !== n) {
    // (cornered: hang a fresh board; whatever is not where it was leaves, whatever is new arrives)
    const fresh = makeBoard(rand, n).rungs, same = (a, b) => a.row === b.row && a.col === b.col;
    const kept = board.rungs.filter(r => fresh.some(f => same(f, r)));
    rungs = fresh.map(f => kept.find(r => same(f, r)) || f);
    changes.length = 0;
    for (const r of board.rungs) if (!kept.includes(r)) changes.push({ from: r, to: null });
    for (const r of rungs) if (!kept.includes(r)) changes.push({ from: null, to: r });
  }
  return { board: { rungs: sorted(rungs) }, changes };
}

// A rung may be a one-way slide (Difficult): `way` 1 slopes down from gutter col to col + 1, -1 from col + 1 down to
// col. It carries an egg downhill only; an egg in the gutter at its low end rolls past underneath. A board with a slide
// is no longer a permutation (two eggs may leave by one spout, one after the other); a board without one always is.

/** Where a rung takes an egg that comes down gutter c: the neighbour's index, or -1 when the egg rolls past it. */
export function rungTo(r, c) {
  const way = r.way || 0;
  if (r.col === c && way >= 0) return c + 1;
  if (r.col + 1 === c && way <= 0) return c - 1;
  return -1;
}

/** Make `n` rungs of a board one-way slides (seeded); slides it already has are kept as far as they go. */
export function setWays(board, rand, n) {
  const sloped = board.rungs.filter(r => r.way), plain = board.rungs.filter(r => !r.way);
  while (sloped.length > n) sloped.splice(pick(rand, sloped.length), 1)[0].way = 0;
  while (sloped.length < n && plain.length) {
    const r = plain.splice(pick(rand, plain.length), 1)[0];
    r.way = rand() < 0.5 ? 1 : -1;
    sloped.push(r);
  }
  return board;
}

/**
 * A hiding board for one cell of the ladder (Difficult): { row, col, rung } over a seesaw (rung: true) or over a bare
 * stretch between two gutters in a row that has no rung at all (rung: false). It is only shut while eggs roll, so what
 * is behind it has been seen. Never over a one-way slide. null when there is no place for one.
 */
export function pickCover(board, rand) {
  const rungs = board.rungs.filter(r => !r.way), bare = [];
  for (let row = 0; row < EGGS.rows; row++) if (!board.rungs.some(r => r.row === row)) bare.push(row);
  if (rungs.length && (!bare.length || rand() < 0.6)) { const r = rungs[pick(rand, rungs.length)]; return { row: r.row, col: r.col, rung: true }; }
  if (bare.length) return { row: bare[pick(rand, bare.length)], col: pick(rand, EGGS.lanes - 1), rung: false };
  return null;
}

/** The spout an egg laid into gutter `lane` leaves by: every rung it meets takes it to the neighbour. */
export function route(board, lane) {
  let c = lane;
  for (const r of board.rungs) { const to = rungTo(r, c); if (to >= 0) c = to; }
  return c;
}

/** Where all four eggs come out: [spout of gutter 0, of gutter 1, ...]. A permutation unless the board has a slide. */
export function outputs(board) {
  return Array.from({ length: EGGS.lanes }, (_, i) => route(board, i));
}

/**
 * The gutter pieces of a board, as they are drawn: { kind: 'down', lane, x, y0, y1 } for each down-gutter (top to spout)
 * and { kind: 'rung', row, col, x0, x1, y } for each seesaw (level at rest, between gutter col and col + 1).
 */
export function pieces(board) {
  const out = [];
  for (let lane = 0; lane < EGGS.lanes; lane++) out.push({ kind: 'down', lane, x: laneX(lane), y0: EGGS.top, y1: EGGS.spout });
  for (const r of board.rungs) {
    // (a slide: y0 and y1 are the heights of its ends over gutter col and col + 1)
    const way = r.way || 0, y = rungY(r.row);
    out.push({ kind: 'rung', row: r.row, col: r.col, way, x0: laneX(r.col), x1: laneX(r.col + 1), y, y0: y + way * EGGS.slope, y1: y - way * EGGS.slope });
  }
  return out;
}

/**
 * The way an egg rolls from the top of gutter `lane`: { pts: [x, y, x, y, ...], legs: [{ kind, from, to, row, s0, s1 }],
 * out, length }. s0/s1 are metres rolled at the start and the end of a leg. `into` may be an object to refill.
 */
export function eggPath(board, lane, into = null) {
  const p = into || { pts: [], legs: [], out: 0, length: 0 };
  p.pts.length = 0; p.legs.length = 0;
  let c = lane, y = EGGS.top, s = 0;
  p.pts.push(laneX(c), y);
  const leg = (kind, to, y1, row) => {
    const len = Math.hypot(laneX(to) - laneX(c), y1 - y);
    if (len < 1e-9) return;
    p.legs.push({ kind, from: c, to, row, s0: s, s1: s + len });
    s += len; c = to; y = y1;
    p.pts.push(laneX(c), y);
  };
  for (const r of board.rungs) {
    const to = rungTo(r, c);
    if (to < 0) continue;
    const h = r.way ? EGGS.slope : 0;
    leg('down', c, rungY(r.row) + h, -1);
    leg('cross', to, rungY(r.row) - h, r.row);
  }
  leg('down', c, EGGS.spout, -1);
  p.out = c; p.length = s;
  return p;
}

/** The point (and the leg) of a path after s metres: writes out.x, out.y, out.leg (index); returns out. */
export function pathAt(path, s, out = {}) {
  const L = path.legs;
  let i = 0;
  while (i < L.length - 1 && s > L[i].s1) i++;
  const g = L[i], k = Math.max(0, Math.min(1, (s - g.s0) / (g.s1 - g.s0 || 1)));
  out.x = path.pts[i * 2] + (path.pts[i * 2 + 2] - path.pts[i * 2]) * k;
  out.y = path.pts[i * 2 + 1] + (path.pts[i * 2 + 3] - path.pts[i * 2 + 1]) * k;
  out.leg = i;
  return out;
}

// ---------------------------------------------------------------------------------------------------- the stages
// A round is a morning in two or three stages, each a share of the round's clock, each with its own waves and an order
// from Grandma (so many eggs caught in the stage). Between two stages the board rests for a beat and the clock waits.
//
// A wave: { rungs, eggs, at: things in the gutters at once, speed, moves: rungs that swing to a new place,
//   gold: chance of one golden egg, chick: chance of one chick, quick: chance (per egg) of a little brown egg,
//   oneway: rungs that are one-way slides, cover: a hiding board over one cell, all: feeding time (every hen lays) }.
// What comes down: 'egg' (1 point), 'gold' (3), 'quick' (a little brown egg: 2, rolls fast), 'chick' (must NOT land in the hat: let it
// flutter down onto the straw, 1 point).
const W = (rungs, eggs, at, speed, moves, more = null) => ({ rungs, eggs, at, speed, moves, gold: 0.5, chick: 0, quick: 0, oneway: 0, cover: false, all: false, ...more });

/**
 * The plan of a round: { stages: [{ id: 'morning' | 'busy' | 'feeding', share, order, cap, step, loop, waves }] }.
 * After a stage's last wave its last `loop` waves come round again, quicker by `step` each time (up to `cap`), until
 * the stage's share of the clock is used up. level: 'easy' | 'normal' | 'hard'; first: the guided first try.
 *
 * The levels differ in kind. Easy: few rungs, one egg at a time, a wide hat that never fills, nothing to dodge.
 * Normal: swinging rungs, two eggs at once, the hat to empty, chicks, one feeding time. Difficult: a hiding board,
 * one-way slides, three at once, little quick eggs, feeding time again and again.
 */
export function stagePlan({ level = 'normal', first = false } = {}) {
  if (first) return { stages: [
    { id: 'morning', share: 1, order: 0, cap: 0.85, step: 0, loop: 1, waves: [
      W(0, 2, 1, 0.85, 0, { gold: 0 }), W(1, 2, 1, 0.85, 0, { gold: 0 }), W(2, 3, 1, 0.85, 1, { gold: 0 }), W(3, 3, 1, 0.85, 1, { gold: 0 })] }] };
  if (level === 'easy') return { stages: [
    { id: 'morning', share: 0.42, order: 5, cap: 1, step: 0.04, loop: 1, waves: [
      W(0, 2, 1, 0.92, 0, { gold: 0 }), W(1, 3, 1, 0.92, 0, { gold: 0 }), W(2, 3, 1, 0.95, 1)] },
    { id: 'busy', share: 0.58, order: 6, cap: 1.2, step: 0.05, loop: 1, waves: [
      W(2, 3, 1, 1, 1), W(3, 4, 1, 1.05, 1), W(3, 4, 1, 1.1, 1)] }] };
  if (level === 'hard') return { stages: [
    { id: 'morning', share: 0.23, order: 8, cap: 1.25, step: 0.05, loop: 1, waves: [
      W(3, 3, 2, 1.1, 1, { cover: true }), W(4, 4, 2, 1.1, 1, { cover: true }), W(4, 4, 2, 1.15, 2, { cover: true, quick: 0.25 })] },
    { id: 'busy', share: 0.35, order: 12, cap: 1.35, step: 0.05, loop: 2, waves: [
      W(4, 5, 3, 1.15, 1, { oneway: 1, chick: 0.6 }), W(5, 5, 3, 1.2, 2, { oneway: 1, chick: 0.6, quick: 0.25 }),
      W(5, 6, 3, 1.2, 2, { oneway: 2, cover: true, chick: 0.5, quick: 0.25 })] },
    { id: 'feeding', share: 0.42, order: 17, cap: 1.5, step: 0.05, loop: 2, waves: [
      W(5, 4, 4, 1.25, 1, { all: true, cover: true, gold: 0.7 }), W(5, 6, 3, 1.3, 2, { oneway: 1, cover: true, chick: 0.5, quick: 0.3 }),
      W(5, 4, 4, 1.3, 2, { all: true, oneway: 1, gold: 0.7 })] }] };
  return { stages: [
    { id: 'morning', share: 0.27, order: 4, cap: 1.15, step: 0.05, loop: 1, waves: [
      W(1, 2, 1, 1, 0, { gold: 0 }), W(2, 3, 1, 1, 1), W(3, 3, 1, 1.05, 1)] },
    { id: 'busy', share: 0.36, order: 7, cap: 1.25, step: 0.05, loop: 2, waves: [
      W(3, 4, 2, 1, 1, { chick: 0.6 }), W(4, 4, 2, 1.05, 1, { chick: 0.6 }), W(4, 5, 2, 1.1, 2, { chick: 0.5 })] },
    { id: 'feeding', share: 0.37, order: 9, cap: 1.4, step: 0.05, loop: 2, waves: [
      W(4, 5, 2, 1.15, 2, { chick: 0.4, gold: 0.7 }), W(4, 4, 4, 1.15, 1, { all: true, gold: 0.7 }), W(5, 6, 2, 1.25, 2, { chick: 0.4 })] }] };
}

/** The wave with index i of a stage (past the end: its last `loop` waves again, quicker by `step` each time round). */
export function waveAt(stage, i) {
  const V = stage.waves;
  if (i < V.length) return V[i];
  const loop = Math.max(1, Math.min(V.length, stage.loop || 1)), k = i - V.length, base = V[V.length - loop + (k % loop)];
  return { ...base, speed: Math.min(Math.max(stage.cap, base.speed), base.speed + stage.step * (Math.floor(k / loop) + 1)) };
}

/** Score to stars is content/tricks.js; this is what a catch is worth (a chick that lands on the straw: 1). */
export const eggPoints = kind => (kind === 'gold' || kind === true ? EGGS.gold : kind === 'quick' ? EGGS.quick : 1);
/** How fast a thing comes down the gutters, against a plain egg. */
export const kindSpeed = kind => (kind === 'quick' ? EGGS.quickSpeed : kind === 'chick' ? EGGS.chickSpeed : 1);

// ---------------------------------------------------------------------------------------------------- the round
const MAX_EGGS = 6;          // things alive at once (three or four rolling, and the last ones still falling)
export const HEN = { idle: 0, warn: 1 };

/**
 * A round. step(dt, input) advances it; input = { mx: -1..1 (stick or keys), lane: 0..3 | 4 (the basket) | null (a tap
 * or drag under a spout) }. Everything the round draws is read from the fields; `events` holds what happened in the
 * last step: { type: 'stage' | 'wave' | 'shift' | 'feed' | 'warn' | 'lay' | 'cross' | 'out' | 'catch' | 'cheer' | 'order'
 * | 'break' | 'chick' (safe on the straw) | 'peep' (a chick in the hat) | 'full' | 'tip' | 'banked' | 'stageEnd' | 'time' | 'over', ... }.
 * `hold` (set by the round's screen) keeps a stage's opening beat from running out: the clock waits with it.
 */
export class EggRound {
  constructor({ level = 'normal', first = false, length = 90, rand = rng(1) } = {}) {
    this.level = level; this.first = !!first; this.rand = rand;
    this.gentle = this.first || level === 'easy';
    this.noBasket = this.gentle;                              // the hat never fills: nothing to empty
    this.stages = stagePlan({ level, first }).stages;
    this.lives = this.gentle ? EGGS.gentleLives : level === 'hard' ? EGGS.lives : EGGS.normalLives;
    this.catchR = this.gentle ? EGGS.easyCatchR : EGGS.catchR;
    this.length = length; this.left = length; this.time = 0;
    // the clock reading at which each stage is over (the last one at 0)
    let used = 0;
    this.ends = this.stages.map((s, i) => (i === this.stages.length - 1 ? 0 : Math.round(length * (1 - (used += s.share)))));
    this.score = 0; this.caught = 0; this.golden = 0; this.broken = 0; this.laid = 0;
    this.chicks = 0; this.peeps = 0; this.streak = 0; this.bestStreak = 0; this.cheers = 0; this.orders = 0; this.perfect = 0;
    // (the broken eggs are swept up between two stages: `lives` is how many may break in ONE stage; `broken` counts them all)
    this.stage = -1; this.stageCaught = 0; this.stageBroken = 0; this.stageClean = true; this.orderMet = false; this.hold = false;
    this.hat = 0; this.basket = 0; this.tipT = 0;
    this.wave = -1; this.waves = 0; this.spec = null; this.phase = 'pause'; this.phaseT = 0;
    this.board = { rungs: [], cover: null }; this.changes = []; this.shiftK = 1; this.coverK = 0; this.started = false;
    this.queue = []; this.feed = false; this.sinceLay = 99; this.lastOut = -99;
    this.tally = [];                                          // eggs caught in each finished stage
    this.lengths = new Float32Array(EGGS.lanes); this._probe = { pts: [], legs: [], out: 0, length: 0 };
    this.hens = Array.from({ length: EGGS.lanes }, () => ({ warn: 0, kind: 'egg', gold: false, total: EGGS.warn }));     // warn: 0, or 0..1 while she puffs
    this.eggs = Array.from({ length: MAX_EGGS }, () => ({ on: false, state: '', kind: 'egg', lane: 0, out: 0, gold: false, v: 1, s: 0, t: 0, x: 0, y: 0, vy: 0, leg: 0,
      path: { pts: [], legs: [], out: 0, length: 0 } }));
    this.mika = { x: laneX(1), target: 1, dir: 0, moving: false };
    this.over = false; this.reason = '';
    this.events = [];
    this._pt = {};
  }

  get full() { return !this.noBasket && this.hat >= EGGS.full; }
  /** Seconds a hen clucks and puffs before she lays (a little longer on the guided first try). */
  get warnTime() { return this.first ? EGGS.warn * 1.3 : EGGS.warn; }
  /** Eggs in the gutters or in the air, and hens about to lay. */
  get busy() { let n = 0; for (const e of this.eggs) if (e.on) n++; for (const h of this.hens) if (h.warn > 0) n++; return n; }
  get rolling() { let n = 0; for (const e of this.eggs) if (e.on && e.state !== 'fall') n++; for (const h of this.hens) if (h.warn > 0) n++; return n; }
  /** The stage being played (null before the first step). */
  get stageSpec() { return this.stages[this.stage] || null; }
  get lastStage() { return this.stage >= this.stages.length - 1; }
  /** The stage's share of the clock is used up: no hen starts to puff any more. */
  get stageOver() { return this.stage >= 0 && this.left <= this.ends[this.stage]; }

  /** Seconds until the egg leaves its spout (Infinity when it is not on the board). */
  eta(e) { return e.on && e.state !== 'fall' ? (e.state === 'lay' ? EGGS.lay - e.t : 0) + (e.path.length - e.s) / (EGGS.speed * this.spec.speed * e.v) : Infinity; }

  _nextStage() {
    this.stage += 1;
    this.wave = -1; this.stageCaught = 0; this.stageBroken = 0; this.stageClean = true; this.orderMet = false;
    this.phase = 'beat'; this.phaseT = EGGS.beat;
    const s = this.stageSpec;
    this.events.push({ type: 'stage', stage: this.stage, id: s.id, order: s.order, of: this.stages.length, lives: this.lives });
  }

  _endStage() {
    const perfect = this.stageClean && this.stageCaught > 0;
    this.tally.push(this.stageCaught);
    if (perfect) { this.perfect += 1; this.score += EGGS.perfectBonus; }
    this.events.push({ type: 'stageEnd', stage: this.stage, id: this.stageSpec.id, perfect, points: perfect ? EGGS.perfectBonus : 0, order: this.orderMet, last: this.lastStage });
  }

  _startWave() {
    this.wave += 1; this.waves += 1;
    const spec = this.spec = waveAt(this.stageSpec, this.wave), rand = this.rand;
    if (!this.started) { this.started = true; this.board = makeBoard(rand, spec.rungs); this.changes = this.board.rungs.map(to => ({ from: null, to })); }
    else { const r = shiftBoard(this.board, rand, spec.rungs, spec.moves); this.board = r.board; this.changes = r.changes; }
    setWays(this.board, rand, spec.oneway);
    this.board.cover = spec.cover ? pickCover(this.board, rand) : null;
    for (let i = 0; i < EGGS.lanes; i++) this.lengths[i] = eggPath(this.board, i, this._probe).length;      // metres from each hen to her egg's spout
    const q = this.queue;
    q.length = 0;
    if (spec.all) {
      // feeding time: every hen lays one, in a shuffled order
      const lanes = Array.from({ length: EGGS.lanes }, (_, i) => i);
      for (let i = lanes.length - 1; i > 0; i--) { const j = pick(rand, i + 1), t = lanes[i]; lanes[i] = lanes[j]; lanes[j] = t; }
      for (const lane of lanes) q.push({ lane, kind: 'egg' });
    } else for (let k = 0; k < spec.eggs; k++) {
      // which hens lay, in order: never the same hen three times running
      let lane = pick(rand, EGGS.lanes);
      const n = q.length;
      if (n >= 2 && q[n - 1].lane === lane && q[n - 2].lane === lane) lane = (lane + 1 + pick(rand, EGGS.lanes - 1)) % EGGS.lanes;
      q.push({ lane, kind: rand() < spec.quick ? 'quick' : 'egg' });
    }
    // at most one golden egg a wave, and at most one chick (never the first thing down)
    if (rand() < spec.gold) q[pick(rand, q.length)].kind = 'gold';
    if (!spec.all && q.length >= 3 && rand() < spec.chick) { const c = q[1 + pick(rand, q.length - 1)]; if (c.kind !== 'gold') c.kind = 'chick'; }
    this.feed = !!spec.all;
    this.phase = 'shift'; this.shiftK = this.changes.length ? 0 : 1;
    this.phaseT = this.changes.length ? EGGS.shift : EGGS.pause;
    if (this.board.cover) this.phaseT = Math.max(this.phaseT, EGGS.look);
    this.events.push({ type: 'wave', wave: this.wave, changes: this.changes.length });
    this.events.push({ type: 'shift', changes: this.changes.length });
  }

  _lay(lane, kind) {
    const e = this.eggs.find(x => !x.on);
    if (!e) return;
    e.on = true; e.state = 'lay'; e.lane = lane; e.kind = kind; e.gold = kind === 'gold'; e.v = kindSpeed(kind); e.s = 0; e.t = 0; e.vy = 0; e.leg = 0;
    eggPath(this.board, lane, e.path);
    e.out = e.path.out; e.x = laneX(lane); e.y = EGGS.top + 0.2;
    this.laid += 1; this.sinceLay = 0;
    this.events.push({ type: 'lay', lane, kind, gold: e.gold, out: e.out });
  }

  /** May the next hen start to puff now? One egg at a time, or more with a gap, and never two out of the spouts together. */
  _mayWarn() {
    const spec = this.spec;
    if (this.full || this.stageOver || !this.queue.length) return false;
    const n = this.rolling;
    if (n >= spec.at) return false;
    if (spec.at > 1 && n > 0 && this.sinceLay < EGGS.gap / spec.speed - EGGS.warn) return false;
    const next = this.queue[0];
    if (this.hens[next.lane].warn > 0) return false;          // (she is already puffing: wait for her)
    if (n > 0) {
      // when would it leave its spout? keep that clear of the eggs already rolling (and of the ones hens are about to lay)
      const v = EGGS.speed * spec.speed, warn = this.warnTime, mine = warn + EGGS.lay + this.lengths[next.lane] / (v * kindSpeed(next.kind));
      for (const e of this.eggs) if (e.on && Math.abs(this.eta(e) - mine) < EGGS.apart) return false;
      for (let i = 0; i < this.hens.length; i++) {
        const h = this.hens[i];
        if (h.warn > 0 && Math.abs((1 - h.warn) * h.total + EGGS.lay + this.lengths[i] / (v * kindSpeed(h.kind)) - mine) < EGGS.apart) return false;
      }
    }
    return true;
  }

  /** Feeding time: every hen puffs at once, then they lay one after another, so that no two eggs leave their spouts together. */
  _feedNow() {
    const v = EGGS.speed * this.spec.speed, exits = [];
    let t = EGGS.feedWarn;
    this.events.push({ type: 'feed' });
    for (const q of this.queue) {
      const roll = EGGS.lay + this.lengths[q.lane] / (v * kindSpeed(q.kind));
      let at = t;
      while (exits.some(x => Math.abs(x - (at + roll)) < EGGS.apart)) at += 0.1;
      exits.push(at + roll);
      const h = this.hens[q.lane];
      h.warn = 1e-6; h.kind = q.kind; h.gold = q.kind === 'gold'; h.total = at;
      this.events.push({ type: 'warn', lane: q.lane, kind: q.kind, gold: h.gold, feed: true });
      t = at + EGGS.feedGap;
    }
    this.queue.length = 0; this.feed = false;
  }

  _moveMika(dt, input) {
    const m = this.mika, x0 = m.x, min = laneX(0);
    // the way to the basket opens when the hat is full (on her way back from it she is still out there)
    const max = this.full ? EGGS.basket : Math.max(laneX(EGGS.lanes - 1), x0);
    const stopX = t => (t >= EGGS.lanes ? EGGS.basket : laneX(t));
    if (this.tipT > 0) { m.moving = false; return; }
    const mx = input?.mx || 0, lane = input?.lane;
    if (lane !== null && lane !== undefined) m.target = Math.max(0, Math.min(this.full ? EGGS.lanes : EGGS.lanes - 1, lane));
    else if (Math.abs(mx) > 0.25) {
      m.dir = Math.sign(mx); m.target = -1;
      m.x += m.dir * EGGS.mika * Math.min(1, Math.abs(mx) * 1.3) * dt;
    } else if (m.target < 0) {
      // let go: she settles under the nearest spout, a little ahead of where she was heading
      const at = m.x + m.dir * 0.22;
      let best = 0, bd = Infinity;
      for (let i = 0; i <= (this.full ? EGGS.lanes : EGGS.lanes - 1); i++) { const d = Math.abs(stopX(i) - at); if (d < bd) { bd = d; best = i; } }
      m.target = best;
    }
    if (m.target >= 0) {
      if (m.target >= EGGS.lanes && !this.full) m.target = EGGS.lanes - 1;
      const tx = stopX(m.target), d = tx - m.x, stepMax = EGGS.mika * dt;
      if (Math.abs(d) <= stepMax) m.x = tx; else { m.x += Math.sign(d) * stepMax; m.dir = Math.sign(d); }
    }
    m.x = Math.max(min, Math.min(max, m.x));
    m.moving = Math.abs(m.x - x0) > 1e-5;
  }

  step(dt, input) {
    const ev = this.events;
    ev.length = 0;
    if (this.over) return ev;
    dt = Math.max(0, Math.min(0.1, dt));
    this.time += dt; this.sinceLay += dt;
    // the clock waits while a stage's name is up
    if (this.phase !== 'beat' && this.stage >= 0) {
      const wasLeft = this.left;
      this.left = Math.max(0, this.left - dt);
      if (wasLeft > 0 && this.left <= 0) ev.push({ type: 'time' });
    }

    // ---- Mika, and the hat tipped into the basket
    this._moveMika(dt, input);
    if (this.tipT > 0) {
      this.tipT -= dt;
      if (this.tipT <= 0) { this.tipT = 0; this.basket += this.hat; ev.push({ type: 'banked', n: this.hat }); this.hat = 0; this.mika.target = EGGS.lanes - 1; }
    } else if (this.full && this.mika.x >= EGGS.basket - 0.12) { this.tipT = EGGS.tip; ev.push({ type: 'tip', n: this.hat }); }

    // ---- stages and waves
    if (this.phase === 'beat') {
      if (!this.hold) this.phaseT -= dt;
      if (this.phaseT <= 0) this._startWave();
    } else if (this.phase === 'pause' || this.phase === 'shift') {
      this.phaseT -= dt;
      if (this.phase === 'shift' && this.changes.length) this.shiftK = Math.max(0, Math.min(1, 1 - this.phaseT / EGGS.shift));
      if (this.phaseT <= 0) {
        if (this.phase === 'shift') { this.phase = 'run'; this.shiftK = 1; this.sinceLay = 99; }
        else if (this.stage < 0) this._nextStage();
        else if (this.stageOver) { if (!this.lastStage) { this._endStage(); this._nextStage(); } }
        else this._startWave();
      }
    } else if (this.phase === 'run') {
      if (this.feed) { if (!this.full && !this.stageOver && !this.rolling) this._feedNow(); }
      else if (this._mayWarn()) {
        const q = this.queue.shift(), h = this.hens[q.lane];
        h.warn = 1e-6; h.kind = q.kind; h.gold = q.kind === 'gold'; h.total = this.warnTime;
        ev.push({ type: 'warn', lane: q.lane, kind: q.kind, gold: h.gold });
      }
      for (let i = 0; i < this.hens.length; i++) {
        const h = this.hens[i];
        if (h.warn <= 0) continue;
        h.warn += dt / h.total;
        if (h.warn >= 1) { h.warn = 0; this._lay(i, h.kind); }
      }
      if (!this.queue.length && !this.busy) { this.phase = 'pause'; this.phaseT = EGGS.pause; }
      else if (this.stageOver && !this.busy) { this.phase = 'pause'; this.phaseT = this.lastStage ? 0 : EGGS.pause; }
    }
    // the hiding board is shut only while eggs roll
    const shut = this.board.cover && this.phase === 'run' ? 1 : 0;
    this.coverK = Math.max(0, Math.min(1, this.coverK + (shut ? dt : -dt) / 0.3));

    // ---- eggs (and chicks)
    const v = this.spec ? EGGS.speed * this.spec.speed : EGGS.speed, m = this.mika;
    for (const e of this.eggs) {
      if (!e.on) continue;
      if (e.state === 'lay') {
        e.t += dt; e.y = EGGS.top + 0.2 * (1 - Math.min(1, e.t / EGGS.lay));
        if (e.t >= EGGS.lay) { e.state = 'roll'; e.y = EGGS.top; }
      } else if (e.state === 'roll') {
        e.s += v * e.v * dt;
        const leg = e.leg, p = pathAt(e.path, Math.min(e.s, e.path.length), this._pt);
        e.x = p.x; e.y = p.y; e.leg = p.leg;
        if (p.leg !== leg && e.path.legs[p.leg].kind === 'cross') ev.push({ type: 'cross', lane: e.path.legs[p.leg].from, row: e.path.legs[p.leg].row });
        if (e.s >= e.path.length) {
          e.state = 'fall'; e.vy = e.kind === 'chick' ? -0.3 : -0.6; e.x = laneX(e.out); e.y = EGGS.spout; this.lastOut = this.time;
          ev.push({ type: 'out', lane: e.out, kind: e.kind, gold: e.gold });
        }
      } else if (e.state === 'fall') {
        const chick = e.kind === 'chick';
        e.vy -= (chick ? EGGS.chickGravity : EGGS.gravity) * dt; e.y += e.vy * dt;
        const inHat = e.y <= EGGS.hatY + 0.08 && e.y >= EGGS.hatY - EGGS.scoop && Math.abs(m.x - e.x) <= this.catchR && this.tipT <= 0;
        // (a chick only lands in a hat that is held still under it: running past below it is fine)
        if (inHat && chick && (m.moving || e.y < EGGS.hatY - EGGS.scoop / 2)) { /* it flutters on down */ }
        else if (inHat && chick) {
          // a chick in the hat: it hops out again unhurt, but that is not where chicks go
          e.on = false; this.peeps += 1; this.streak = 0; this.stageClean = false;
          ev.push({ type: 'peep', lane: e.out, x: e.x });
        } else if (inHat) {
          e.on = false;
          const pts = eggPoints(e.kind);
          this.score += pts; this.caught += 1; this.hat += 1; if (e.gold) this.golden += 1;
          this.streak += 1; this.bestStreak = Math.max(this.bestStreak, this.streak); this.stageCaught += 1;
          ev.push({ type: 'catch', lane: e.out, kind: e.kind, gold: e.gold, points: pts, hat: this.hat, streak: this.streak });
          if (this.streak % EGGS.streak === 0) { this.cheers += 1; this.score += EGGS.streakBonus; ev.push({ type: 'cheer', streak: this.streak, points: EGGS.streakBonus }); }
          const order = this.stageSpec.order;
          if (order && !this.orderMet && this.stageCaught >= order) { this.orderMet = true; this.orders += 1; this.score += EGGS.orderBonus; ev.push({ type: 'order', stage: this.stage, points: EGGS.orderBonus }); }
          if (this.hat === EGGS.full && !this.noBasket) ev.push({ type: 'full' });
        } else if (e.y <= 0.06) {
          e.on = false;
          if (chick) { this.chicks += 1; this.score += 1; ev.push({ type: 'chick', lane: e.out, x: e.x, points: 1 }); }
          else {
            this.broken += 1; this.stageBroken += 1; this.streak = 0; this.stageClean = false;
            ev.push({ type: 'break', lane: e.out, kind: e.kind, gold: e.gold, x: e.x, left: this.lives - this.stageBroken });
          }
        }
      }
    }

    // ---- the end: too many broken eggs, or the clock ran out and the last eggs are down
    if (this.stageBroken >= this.lives) { this.over = true; this.reason = 'broken'; }
    else if (this.left <= 0 && !this.busy && this.tipT <= 0) { this.over = true; this.reason = 'time'; this._endStage(); }
    if (this.over) ev.push({ type: 'over', reason: this.reason });
    return ev;
  }

  result() {
    return { score: this.score, caught: this.caught, golden: this.golden, broken: this.broken, laid: this.laid, waves: this.waves, reason: this.reason,
      chicks: this.chicks, peeps: this.peeps, bestStreak: this.bestStreak, cheers: this.cheers, orders: this.orders, perfect: this.perfect,
      stages: Math.max(0, this.stage + 1), perStage: this.tally.slice(), seconds: Math.round(this.time) };
  }
}

/**
 * Play a whole round with a simple player, for the tests and for tuning the stars: it reads the board and goes where
 * the next egg will come out (the hat to the basket when it is full), and steps aside for a chick. skill 0..1: the share
 * of things it reads right; a misread egg sends it under a neighbouring spout, a misread chick lands in the hat.
 * Returns the round's result().
 */
export function replay({ seed = 1, level = 'normal', first = false, length = 90, skill = 1, dt = 1 / 30, react = 0.25 } = {}) {
  const sim = new EggRound({ level, first, length, rand: rng(seed) }), luck = rng(seed * 7919 + 13);
  const input = { mx: 0, lane: null }, wrong = new Map(), list = [];
  const clampLane = l => Math.max(0, Math.min(EGGS.lanes - 1, l));
  let guard = 0;
  while (!sim.over && guard++ < 2e5) {
    // what is on its way, soonest at the hat first (a chick that is already below the hat does not matter any more)
    list.length = 0;
    for (const e of sim.eggs) {
      if (!e.on) { wrong.delete(e); continue; }
      if (e.kind === 'chick' && e.state === 'fall' && e.y < EGGS.hatY - EGGS.scoop) continue;
      if (!wrong.has(e)) wrong.set(e, luck() < skill ? 0 : luck() < 0.5 ? -1 : 1);
      // it needs a moment to read a fresh one
      if (e.state !== 'fall' && e.s <= react * EGGS.speed) continue;
      list.push(e);
    }
    const when = e => (e.state === 'fall' ? e.y - 10 : sim.eta(e) + (e.kind === 'chick' ? 0.3 : 0));
    list.sort((a, b) => when(a) - when(b));
    let lane = null;
    const next = list[0];
    if (next && next.kind !== 'chick') lane = clampLane(next.out + wrong.get(next));
    else if (next) {
      // a chick: wait under the egg that follows it, or beside the chick's spout
      const after = list.find(e => e.kind !== 'chick'), want = after ? clampLane(after.out + wrong.get(after)) : Math.round((sim.mika.x - laneX(0)) / EGGS.dx);
      lane = wrong.get(next) ? next.out : want !== next.out ? clampLane(want) : next.out < EGGS.lanes - 1 ? next.out + 1 : next.out - 1;
    } else if (sim.full) lane = EGGS.lanes;
    input.lane = lane;
    sim.step(dt, input);
  }
  return sim.result();
}
