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
  lives: 3,               // broken eggs that end the round
  gentleLives: 5,         // ...on the guided first try and in Easy
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

/** The spout an egg laid into gutter `lane` leaves by: every rung it meets takes it to the neighbour. */
export function route(board, lane) {
  let c = lane;
  for (const r of board.rungs) { if (r.col === c) c += 1; else if (r.col + 1 === c) c -= 1; }
  return c;
}

/** Where all four eggs come out: [spout of gutter 0, of gutter 1, ...]. Always a permutation. */
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
  for (const r of board.rungs) out.push({ kind: 'rung', row: r.row, col: r.col, x0: laneX(r.col), x1: laneX(r.col + 1), y: rungY(r.row) });
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
    const to = r.col === c ? c + 1 : r.col + 1 === c ? c - 1 : -1;
    if (to < 0) continue;
    leg('down', c, rungY(r.row), -1);
    leg('cross', to, rungY(r.row), r.row);
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

// ---------------------------------------------------------------------------------------------------- the waves
/**
 * The plan of a round: a list of waves { rungs, eggs, at: eggs in the gutters at once, speed, moves }. After the last
 * one the round goes on with it, a little quicker each time (up to `cap`). level: 'easy' | 'normal' | 'hard'.
 */
export function wavePlan({ level = 'normal', first = false } = {}) {
  if (first) return { cap: 0.85, step: 0, waves: [
    { rungs: 0, eggs: 2, at: 1, speed: 0.85, moves: 0 }, { rungs: 1, eggs: 2, at: 1, speed: 0.85, moves: 0 },
    { rungs: 2, eggs: 3, at: 1, speed: 0.85, moves: 1 }, { rungs: 3, eggs: 3, at: 1, speed: 0.85, moves: 1 }] };
  if (level === 'easy') return { cap: 1.15, step: 0.05, waves: [
    { rungs: 0, eggs: 2, at: 1, speed: 0.9, moves: 0 }, { rungs: 1, eggs: 3, at: 1, speed: 0.9, moves: 0 },
    { rungs: 2, eggs: 3, at: 1, speed: 0.9, moves: 1 }, { rungs: 3, eggs: 4, at: 1, speed: 0.95, moves: 1 },
    { rungs: 3, eggs: 4, at: 2, speed: 0.95, moves: 1 }, { rungs: 4, eggs: 5, at: 2, speed: 1, moves: 1 }] };
  const k = level === 'hard' ? 1.12 : 1;
  return { cap: 1.5 * k, step: 0.1, waves: [
    { rungs: 1, eggs: 2, at: 1, speed: k, moves: 0 }, { rungs: 2, eggs: 3, at: 1, speed: k, moves: 1 },
    { rungs: 3, eggs: 3, at: 1, speed: k, moves: 1 }, { rungs: 4, eggs: 4, at: 2, speed: k, moves: 1 },
    { rungs: 4, eggs: 5, at: 2, speed: 1.12 * k, moves: 2 }, { rungs: 5, eggs: 6, at: 2, speed: 1.25 * k, moves: 2 }] };
}

/** The wave with index i of a plan (past the end: the last one again, quicker by `step` each time, up to `cap`). */
export function waveAt(plan, i) {
  const W = plan.waves, last = W[W.length - 1];
  if (i < W.length) return W[i];
  return { ...last, speed: Math.min(plan.cap, last.speed + plan.step * (i - W.length + 1)) };
}

/** Score to stars is content/tricks.js; this is what a catch is worth. */
export const eggPoints = gold => (gold ? EGGS.gold : 1);

// ---------------------------------------------------------------------------------------------------- the round
const MAX_EGGS = 4;          // eggs alive at once (two rolling, and the last ones still falling)
export const HEN = { idle: 0, warn: 1 };

/**
 * A round. step(dt, input) advances it; input = { mx: -1..1 (stick or keys), lane: 0..3 | 4 (the basket) | null (a tap
 * or drag under a spout) }. Everything the round draws is read from the fields; `events` holds what happened in the
 * last step: { type: 'warn' | 'lay' | 'cross' | 'out' | 'catch' | 'break' | 'full' | 'tip' | 'banked' | 'wave' | 'shift' | 'over', ... }.
 */
export class EggRound {
  constructor({ level = 'normal', first = false, length = 90, rand = rng(1) } = {}) {
    this.level = level; this.first = !!first; this.rand = rand;
    this.gentle = this.first || level === 'easy';
    this.plan = wavePlan({ level, first });
    this.lives = this.gentle ? EGGS.gentleLives : EGGS.lives;
    this.catchR = this.gentle ? EGGS.easyCatchR : EGGS.catchR;
    this.length = length; this.left = length; this.time = 0;
    this.score = 0; this.caught = 0; this.golden = 0; this.broken = 0; this.laid = 0;
    this.hat = 0; this.basket = 0; this.tipT = 0;
    this.wave = -1; this.spec = null; this.phase = 'pause'; this.phaseT = 0.6;
    this.board = { rungs: [] }; this.changes = []; this.prevBoard = this.board; this.shiftK = 1;
    this.queue = []; this.sinceLay = 99; this.lastOut = -99; this.goldAt = -1;
    this.lengths = new Float32Array(EGGS.lanes); this._probe = { pts: [], legs: [], out: 0, length: 0 };
    this.hens = Array.from({ length: EGGS.lanes }, () => ({ warn: 0, gold: false }));     // warn: 0, or 0..1 while she puffs
    this.eggs = Array.from({ length: MAX_EGGS }, () => ({ on: false, state: '', lane: 0, out: 0, gold: false, s: 0, t: 0, x: 0, y: 0, vy: 0, leg: 0,
      path: { pts: [], legs: [], out: 0, length: 0 } }));
    this.mika = { x: laneX(1), target: 1, dir: 0, moving: false };
    this.over = false; this.reason = '';
    this.events = [];
    this._pt = {};
  }

  get full() { return !this.first && this.hat >= EGGS.full; }
  /** Seconds a hen clucks and puffs before she lays (a little longer on the guided first try). */
  get warnTime() { return this.first ? EGGS.warn * 1.3 : EGGS.warn; }
  /** Eggs in the gutters or in the air, and hens about to lay. */
  get busy() { let n = 0; for (const e of this.eggs) if (e.on) n++; for (const h of this.hens) if (h.warn > 0) n++; return n; }
  get rolling() { let n = 0; for (const e of this.eggs) if (e.on && e.state !== 'fall') n++; for (const h of this.hens) if (h.warn > 0) n++; return n; }

  /** Seconds until the egg leaves its spout (Infinity when it is not on the board). */
  eta(e) { return e.on && e.state !== 'fall' ? (e.state === 'lay' ? EGGS.lay - e.t : 0) + (e.path.length - e.s) / (EGGS.speed * this.spec.speed) : Infinity; }

  _startWave() {
    this.wave += 1;
    const spec = this.spec = waveAt(this.plan, this.wave), rand = this.rand;
    this.prevBoard = this.board;
    if (this.wave === 0) { this.board = makeBoard(rand, spec.rungs); this.changes = this.board.rungs.map(to => ({ from: null, to })); }
    else { const r = shiftBoard(this.board, rand, spec.rungs, spec.moves); this.board = r.board; this.changes = r.changes; }
    for (let i = 0; i < EGGS.lanes; i++) this.lengths[i] = eggPath(this.board, i, this._probe).length;      // metres from each hen to her egg's spout
    // which hens lay, in order: never the same hen three times running
    this.queue.length = 0;
    for (let k = 0; k < spec.eggs; k++) {
      let lane = pick(rand, EGGS.lanes);
      const q = this.queue, n = q.length;
      if (n >= 2 && q[n - 1] === lane && q[n - 2] === lane) lane = (lane + 1 + pick(rand, EGGS.lanes - 1)) % EGGS.lanes;
      q.push(lane);
    }
    // a golden egg: rare, never on the guided first try, at most one a wave
    this.goldAt = !this.first && this.wave >= 2 && rand() < 0.5 ? pick(rand, spec.eggs) : -1;
    this.phase = 'shift'; this.shiftK = this.changes.length ? 0 : 1;
    this.phaseT = this.changes.length ? EGGS.shift : EGGS.pause;
    this.events.push({ type: 'wave', wave: this.wave, changes: this.changes.length });
    if (this.changes.length) this.events.push({ type: 'shift' });
  }

  _lay(lane, gold) {
    const e = this.eggs.find(x => !x.on);
    if (!e) return;
    e.on = true; e.state = 'lay'; e.lane = lane; e.gold = gold; e.s = 0; e.t = 0; e.vy = 0; e.leg = 0;
    eggPath(this.board, lane, e.path);
    e.out = e.path.out; e.x = laneX(lane); e.y = EGGS.top + 0.2;
    this.laid += 1; this.sinceLay = 0;
    this.events.push({ type: 'lay', lane, gold, out: e.out });
  }

  /** May the next hen start to puff now? One egg at a time, or two with a gap, and never two out of the spouts together. */
  _mayWarn() {
    const spec = this.spec;
    if (this.full || this.left <= 0 || !this.queue.length) return false;
    const n = this.rolling;
    if (n >= spec.at) return false;
    if (spec.at > 1 && n > 0 && this.sinceLay < EGGS.gap / spec.speed - EGGS.warn) return false;
    if (this.hens[this.queue[0]].warn > 0) return false;          // (she is already puffing: wait for her)
    if (n > 0) {
      // when would it leave its spout? keep that clear of the egg already rolling (and of the one a hen is about to lay)
      const v = EGGS.speed * spec.speed, warn = this.warnTime, mine = warn + EGGS.lay + this.lengths[this.queue[0]] / v;
      for (const e of this.eggs) if (e.on && Math.abs(this.eta(e) - mine) < EGGS.apart) return false;
      for (let i = 0; i < this.hens.length; i++) {
        const h = this.hens[i];
        if (h.warn > 0 && Math.abs((1 - h.warn) * warn + EGGS.lay + this.lengths[i] / v - mine) < EGGS.apart) return false;
      }
    }
    return true;
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
    const wasLeft = this.left;
    this.left = Math.max(0, this.left - dt);
    if (wasLeft > 0 && this.left <= 0) ev.push({ type: 'time' });

    // ---- Mika, and the hat tipped into the basket
    this._moveMika(dt, input);
    if (this.tipT > 0) {
      this.tipT -= dt;
      if (this.tipT <= 0) { this.tipT = 0; this.basket += this.hat; ev.push({ type: 'banked', n: this.hat }); this.hat = 0; this.mika.target = EGGS.lanes - 1; }
    } else if (this.full && this.mika.x >= EGGS.basket - 0.12) { this.tipT = EGGS.tip; ev.push({ type: 'tip', n: this.hat }); }

    // ---- waves
    if (this.phase === 'pause' || this.phase === 'shift') {
      this.phaseT -= dt;
      if (this.phase === 'shift' && this.changes.length) this.shiftK = Math.max(0, Math.min(1, 1 - this.phaseT / EGGS.shift));
      if (this.phaseT <= 0) {
        if (this.phase === 'pause' && this.left > 0) this._startWave();
        else if (this.phase === 'shift') { this.phase = 'run'; this.shiftK = 1; this.sinceLay = 99; }
      }
    } else if (this.phase === 'run') {
      const spec = this.spec;
      if (this._mayWarn()) {
        const lane = this.queue.shift(), h = this.hens[lane];
        h.warn = 1e-6; h.gold = spec.eggs - this.queue.length - 1 === this.goldAt;
        ev.push({ type: 'warn', lane, gold: h.gold });
      }
      for (let i = 0; i < this.hens.length; i++) {
        const h = this.hens[i];
        if (h.warn <= 0) continue;
        h.warn += dt / this.warnTime;
        if (h.warn >= 1) { h.warn = 0; this._lay(i, h.gold); }
      }
      if (!this.queue.length && !this.busy) { this.phase = 'pause'; this.phaseT = EGGS.pause; }
      else if (this.left <= 0 && !this.busy) { this.phase = 'pause'; this.phaseT = 0; }
    }

    // ---- eggs
    const v = this.spec ? EGGS.speed * this.spec.speed : EGGS.speed, m = this.mika;
    for (const e of this.eggs) {
      if (!e.on) continue;
      if (e.state === 'lay') {
        e.t += dt; e.y = EGGS.top + 0.2 * (1 - Math.min(1, e.t / EGGS.lay));
        if (e.t >= EGGS.lay) { e.state = 'roll'; e.y = EGGS.top; }
      } else if (e.state === 'roll') {
        e.s += v * dt;
        const leg = e.leg, p = pathAt(e.path, Math.min(e.s, e.path.length), this._pt);
        e.x = p.x; e.y = p.y; e.leg = p.leg;
        if (p.leg !== leg && e.path.legs[p.leg].kind === 'cross') ev.push({ type: 'cross', lane: e.path.legs[p.leg].from, row: e.path.legs[p.leg].row });
        if (e.s >= e.path.length) { e.state = 'fall'; e.vy = -0.6; e.x = laneX(e.out); e.y = EGGS.spout; this.lastOut = this.time; ev.push({ type: 'out', lane: e.out, gold: e.gold }); }
      } else if (e.state === 'fall') {
        e.vy -= EGGS.gravity * dt; e.y += e.vy * dt;
        const inHat = e.y <= EGGS.hatY + 0.08 && e.y >= EGGS.hatY - EGGS.scoop && Math.abs(m.x - e.x) <= this.catchR && this.tipT <= 0;
        if (inHat) {
          e.on = false;
          const pts = eggPoints(e.gold);
          this.score += pts; this.caught += 1; this.hat += 1; if (e.gold) this.golden += 1;
          ev.push({ type: 'catch', lane: e.out, gold: e.gold, points: pts, hat: this.hat });
          if (this.hat === EGGS.full && !this.first) ev.push({ type: 'full' });
        } else if (e.y <= 0.06) {
          e.on = false; this.broken += 1;
          ev.push({ type: 'break', lane: e.out, gold: e.gold, x: e.x, left: this.lives - this.broken });
        }
      }
    }

    // ---- the end: too many broken eggs, or the clock ran out and the last eggs are down
    if (this.broken >= this.lives) { this.over = true; this.reason = 'broken'; }
    else if (this.left <= 0 && !this.busy && this.tipT <= 0) { this.over = true; this.reason = 'time'; }
    if (this.over) ev.push({ type: 'over', reason: this.reason });
    return ev;
  }

  result() {
    return { score: this.score, caught: this.caught, golden: this.golden, broken: this.broken, laid: this.laid, waves: this.wave + 1, reason: this.reason,
      seconds: Math.round(this.time) };
  }
}

/**
 * Play a whole round with a simple player, for the tests and for tuning the stars: it reads the board and goes where
 * the next egg will come out (the hat to the basket when it is full). skill 0..1: the share of eggs it reads right; a
 * misread egg sends it under a neighbouring spout. Returns the round's result() plus { seconds }.
 */
export function replay({ seed = 1, level = 'normal', first = false, length = 90, skill = 1, dt = 1 / 30, react = 0.25 } = {}) {
  const sim = new EggRound({ level, first, length, rand: rng(seed) }), luck = rng(seed * 7919 + 13);
  const input = { mx: 0, lane: null }, wrong = new Map();
  let guard = 0;
  while (!sim.over && guard++ < 1e5) {
    // the egg that leaves its spout first (a falling one first of all)
    let next = null, best = Infinity;
    for (const e of sim.eggs) {
      if (!e.on) continue;
      const t = e.state === 'fall' ? -1 : sim.eta(e);
      if (t < best) { best = t; next = e; }
    }
    let lane = null;
    if (next) {
      if (!wrong.has(next)) wrong.set(next, luck() < skill ? 0 : luck() < 0.5 ? -1 : 1);
      // it needs a moment to read a fresh egg
      if (next.state === 'fall' || next.s > react * EGGS.speed) lane = Math.max(0, Math.min(EGGS.lanes - 1, next.out + wrong.get(next)));
    } else if (sim.full) lane = EGGS.lanes;
    for (const e of sim.eggs) if (!e.on) wrong.delete(e);
    input.lane = lane;
    sim.step(dt, input);
  }
  return sim.result();
}
