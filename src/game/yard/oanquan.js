// Ô ăn quan, the Vietnamese village board game, played with the real rules (Wikipedia, "Ô ăn quan"):
//
//   The board: twelve squares in a ring. Two big "quan" (mandarin) squares at the ends, 0 and 6, and five small
//   "rice-field" squares along each side: 1..5 are Mika's (the near row, left to right), 7..11 the opponent's (the far
//   row, right to left). Each small square starts with 5 dân (pebbles), each quan square with 1 quan (worth 10 dân).
//   A turn: take up ALL the pebbles of one of your own small squares and sow them one by one into the following squares,
//   either way round. When the last one is down, look at the next square:
//     - a small square with pebbles: pick them all up and keep sowing from there;
//     - a quan square (empty or not): the turn ends;
//     - an empty small square: if the square after it holds anything (dân or a quan) you capture all of it, and if the
//       square next after THAT is empty and the one beyond holds something, capture that too, and so on; as soon as the
//       next square is not empty, or the two next squares are empty, the turn ends.
//   When a player has nothing left on their side, they refill it, one dân per square, from the dân they have captured;
//   with fewer than five they borrow the rest from the opponent and give them back when counting. The game ends when both
//   quan are captured (the quick game ends at the FIRST quan captured, or after 24 turns). Pebbles left on a side count
//   for its owner; a dân is 1 point, a quan 10; the most points wins.
//
// This file is pure and seeded (no three.js, no DOM): the rules first (state, moves, steps for the animation, scoring),
// then the opponent (minimax), then the sim ./round.js shows. tests/yard2.test.mjs checks known positions.
import { rng, clamp } from './rules.js';
import { N_, tx } from '../../i18n/i18n.js';

export const SQ = 12, QUAN_AT = [0, 6], QUAN_VALUE = 10, START_DAN = 5, QUICK_TURNS = 24;
export const isQuanSq = i => i === 0 || i === 6;
const mod = i => ((i % SQ) + SQ) % SQ;
/** Which side owns a small square: 1..5 are player 0's, 7..11 are player 1's; the quan squares are nobody's. */
export const ownerOf = i => (i >= 1 && i <= 5 ? 0 : i >= 7 && i <= 11 ? 1 : -1);
export const SIDE = [[1, 2, 3, 4, 5], [7, 8, 9, 10, 11]];

/** A new game: 5 dân in every small square, one quan in each end square. */
export function newBoard() {
  const dan = Array(SQ).fill(START_DAN), quan = Array(SQ).fill(0);
  for (const q of QUAN_AT) { dan[q] = 0; quan[q] = 1; }
  return { dan, quan, pile: [{ dan: 0, quan: 0 }, { dan: 0, quan: 0 }], debt: [0, 0], turns: 0, moves: 0 };
}
export const cloneBoard = b => ({ dan: b.dan.slice(), quan: b.quan.slice(), pile: b.pile.map(p => ({ ...p })), debt: b.debt.slice(), turns: b.turns, moves: b.moves });
const empty = (b, i) => b.dan[i] === 0 && b.quan[i] === 0;

/** A player's points so far (captured pile only): dân 1, quan 10, less what they have borrowed. */
export const pileScore = (b, p) => b.pile[p].dan + b.pile[p].quan * QUAN_VALUE - b.debt[p];
/** Pebbles standing on a player's own small squares. */
export const sideDan = (b, p) => SIDE[p].reduce((s, i) => s + b.dan[i], 0);
export const quanLeft = b => b.quan[0] + b.quan[6];
/** Everything in play, in dân: board + piles (a game's total never changes: borrowed dân move between the piles). */
export function totalValue(b) {
  let t = 0;
  for (let i = 0; i < SQ; i++) t += b.dan[i] + b.quan[i] * QUAN_VALUE;
  for (const p of b.pile) t += p.dan + p.quan * QUAN_VALUE;
  return t;
}

/** Moves a player may make: each of their non-empty small squares, both ways round. dir +1 = counter-clockwise (rightward along the near row). */
export function legalMoves(b, p) {
  const out = [];
  for (const sq of SIDE[p]) if (b.dan[sq] > 0) for (const dir of [1, -1]) out.push({ sq, dir });
  return out;
}

/**
 * Play a move. Returns { board (a new board), steps, got: { dan, quan }, over } where steps are the animation:
 *   { t: 'pick', sq, n }   the hand takes up n pebbles from sq
 *   { t: 'drop', sq }      one pebble goes down in sq
 *   { t: 'take', sq, dan, quan }   a capture
 * `board.turns` counts turns played. The caller handles refilling (`refill`) and the end (`finished`).
 */
export function play(board, p, sq, dir) {
  const b = cloneBoard(board), steps = [], got = { dan: 0, quan: 0 };
  if (ownerOf(sq) !== p || b.dan[sq] <= 0 || (dir !== 1 && dir !== -1)) return { board: b, steps, got, illegal: true };
  let n = b.dan[sq], pos = sq, guard = 0;
  b.dan[sq] = 0;
  steps.push({ t: 'pick', sq, n });
  for (;;) {
    while (n > 0) { pos = mod(pos + dir); b.dan[pos]++; n--; steps.push({ t: 'drop', sq: pos }); }
    if (++guard > 80) break;
    const next = mod(pos + dir);
    if (isQuanSq(next)) break;                                  // a quan square: the turn ends
    if (b.dan[next] > 0) { n = b.dan[next]; b.dan[next] = 0; pos = next; steps.push({ t: 'pick', sq: next, n }); continue; }
    // an empty small square: capture the one after it, and keep capturing while the pattern repeats
    let cur = next;
    for (;;) {
      const after = mod(cur + dir);
      if (empty(b, after)) break;
      const d = b.dan[after], q = b.quan[after];
      b.pile[p].dan += d; b.pile[p].quan += q; got.dan += d; got.quan += q;
      b.dan[after] = 0; b.quan[after] = 0;
      steps.push({ t: 'take', sq: after, dan: d, quan: q });
      cur = mod(after + dir);
      if (!empty(b, cur)) break;                                // the next square holds something: the turn ends
    }
    break;
  }
  b.turns++;
  return { board: b, steps, got, illegal: false };
}

/**
 * Before a player's turn: with nothing on their side they refill it one dân per square from their captured dân, borrowing
 * from the opponent's captured dân what they lack. Returns { board, refilled, borrowed, stuck } (stuck: nobody can pay).
 */
export function refill(board, p) {
  const b = cloneBoard(board);
  if (sideDan(b, p) > 0) return { board: b, refilled: false, borrowed: 0, stuck: false };
  const need = SIDE[p].length, own = Math.min(need, b.pile[p].dan);
  let borrow = need - own;
  const o = 1 - p;
  if (borrow > b.pile[o].dan) return { board: b, refilled: false, borrowed: 0, stuck: true };
  b.pile[p].dan -= own;
  if (borrow) { b.pile[o].dan -= borrow; b.debt[p] += borrow; }
  for (const sq of SIDE[p]) b.dan[sq] = 1;
  return { board: b, refilled: true, borrowed: borrow, stuck: false };
}

/** Has the game ended? quick: it ends at the first quan captured, or after QUICK_TURNS turns. */
export function finished(b, quick = false) {
  if (quanLeft(b) === 0) return true;
  if (quick && (quanLeft(b) < 2 || b.turns >= QUICK_TURNS)) return true;
  return false;
}

/**
 * The final points: pebbles left on a side count for its owner, the borrowed dân go back, dân 1 and quan 10. A quan still
 * standing in the quick game's last position (and dân dropped in the quan squares) count for nobody.
 */
export function finalScore(b) {
  const s = [0, 1].map(p => b.pile[p].dan + b.pile[p].quan * QUAN_VALUE + sideDan(b, p));
  s[0] += b.debt[1] - b.debt[0];
  s[1] += b.debt[0] - b.debt[1];
  return s;
}

// ------------------------------------------------------------------------------------------------ the opponent
/** Evaluate a position for player p: captured points now, plus what stands on their side, minus the opponent's. */
export function evaluate(b, p) {
  return (pileScore(b, p) - pileScore(b, 1 - p)) + 0.35 * (sideDan(b, p) - sideDan(b, 1 - p));
}

/** What a whole turn does to the position, including the refill the next player needs. Returns { board, got, steps, stuck }. */
export function turn(board, p, sq, dir) {
  const r = play(board, p, sq, dir);
  return r;
}

/** The next position's mover with refill applied. */
export function prepare(board, p) {
  return refill(board, p);
}

/**
 * Minimax with depth `depth` (1 = best immediate result). Returns the best { sq, dir, value } for player p or null.
 * rand (optional) breaks ties; `noise` picks a random legal move that often (the kids' slips).
 */
export function bestMove(board, p, depth = 2, rand = null, noise = 0) {
  depth = Math.max(1, Math.floor(depth));
  const prep = refill(board, p), b0 = prep.board;
  const moves = legalMoves(b0, p);
  if (!moves.length) return null;
  if (rand && noise && rand() < noise) { const m = moves[Math.floor(rand() * moves.length)]; return { ...m, value: 0, random: true }; }
  const search = (b, pl, d, me) => {
    // value for `me`, with `pl` to move
    if (finished(b, false) || d === 0) return evaluate(b, me);
    const pr = refill(b, pl);
    if (pr.stuck) return evaluate(b, me);
    const ms = legalMoves(pr.board, pl);
    if (!ms.length) return evaluate(pr.board, me);
    let best = pl === me ? -1e9 : 1e9;
    for (const m of ms) {
      const r = play(pr.board, pl, m.sq, m.dir);
      const v = search(r.board, 1 - pl, d - 1, me);
      if (pl === me ? v > best : v < best) best = v;
    }
    return best;
  };
  let best = null, bv = -1e9;
  for (const m of moves) {
    const r = play(b0, p, m.sq, m.dir);
    const v = search(r.board, 1 - p, depth - 1, p) + (rand ? rand() * 0.01 : 0);
    if (v > bv) { bv = v; best = { ...m, value: v }; }
  }
  return best;
}

/** For the "?" hint: every legal move with what it captures, best first. */
export function hints(board, p) {
  const out = legalMoves(refill(board, p).board, p).map(m => {
    const r = play(refill(board, p).board, p, m.sq, m.dir), g = r.got.dan + r.got.quan * QUAN_VALUE;
    return { ...m, gain: g };
  });
  return out.sort((a, b) => b.gain - a.gain);
}

// ------------------------------------------------------------------------------------------------ the sim
const PICK_T = 0.55, DROP_T = 0.24, TAKE_T = 0.7, THINK_KID = [1.4, 2.4], PAUSE = 0.8;
const DEPTH = { first: 1, easy: 1, normal: 2 };
const NOISE = { first: 0.35, easy: 0.2, normal: 0.04 };

export class OanSim {
  /** players: [{ id, human?, style? }] (two; the human is player 0, the near row); level; quick: the quick game. */
  constructor({ seed = 1, players = [], level = 'normal', quick = true } = {}) {
    this.rand = rng(seed);
    this.level = level;
    this.quick = quick;
    const ordered = [...players].sort((a, b) => (b.human ? 1 : 0) - (a.human ? 1 : 0)).slice(0, 2);
    this.players = ordered.map((p, i) => ({ id: p.id, team: i, human: !!p.human, style: p.style || 'steady', u: i ? 2.9 : -2.9, v: i ? -0.9 : 0.9, moving: false, kickT: 9, lean: 0 }));
    this.human = this.players.find(p => p.human) || null;
    this.board = newBoard();
    this.shown = { dan: this.board.dan.slice(), quan: this.board.quan.slice() };    // what the animation has laid out so far
    this.mover = 0;
    this.state = 'start';
    this.timer = 1.4;
    this.anim = null;
    this.sel = null;                       // the square Mika has picked up (highlighted)
    this.hintOn = false;
    this.last = null;
    this.t = 0;
    this.score = [0, 0];
    this.events = [];
    this.over = null;
    this.shuttle = { on: false, u: 0, y: 0, v: 0 };
    this.marker = { on: false, u: 0, v: 0, mine: false, out: false, tau: 1, dur: 1 };
    this.depth = DEPTH[level] ?? 2;
  }

  emit(type, o) { this.events.push({ type, ...o }); }
  get cur() { return this.players[this.mover]; }

  step(dt, input = {}) {
    this.t += dt;
    for (const p of this.players) { p.kickT += dt; p.lean *= Math.exp(-dt * 5); }
    if (this.state === 'over') return this;
    if (this.state === 'start') { this.timer -= dt; if (this.timer <= 0) this.begin(); return this; }
    if (this.state === 'think') {
      const p = this.cur;
      if (p.human) {
        if (input.hint) { this.hintOn = !this.hintOn; this.emit('hint', {}); }
        if (input.pick !== undefined && input.pick !== null) this.pick(input.pick);
        if (input.dir && this.sel !== null) this.go(this.sel, input.dir);
      } else {
        this.timer -= dt;
        if (this.timer <= 0) {
          const bonus = p.style === 'never' || p.style === 'strong' ? 1 : p.style === 'wobbly' ? -1 : 0;
          const m = bestMove(this.board, this.mover, Math.max(1, this.depth + bonus), this.rand, NOISE[this.level] ?? 0.05);
          if (m) this.go(m.sq, m.dir); else this.endGame();
        }
      }
      return this;
    }
    if (this.state === 'sow') { this.animate(dt); return this; }
    if (this.state === 'pause') { this.timer -= dt; if (this.timer <= 0) this.begin(); }
    return this;
  }

  /** The start of a turn: refill an empty side, end the game if it is over, otherwise wait for the move. */
  begin() {
    if (finished(this.board, this.quick)) { this.endGame(); return; }
    const r = refill(this.board, this.mover);
    if (r.stuck) { this.endGame(); return; }
    if (r.refilled) {
      this.board = r.board;
      this.syncShown();
      this.emit('refill', { who: this.cur.id, human: this.cur.human, borrowed: r.borrowed, p: this.mover });
    }
    if (!legalMoves(this.board, this.mover).length) { this.endGame(); return; }
    this.state = 'think'; this.sel = null; this.hintOn = false;
    this.timer = THINK_KID[0] + this.rand() * (THINK_KID[1] - THINK_KID[0]);
    this.emit('turn', { who: this.cur.id, human: this.cur.human, p: this.mover });
  }

  syncShown() { this.shown.dan = this.board.dan.slice(); this.shown.quan = this.board.quan.slice(); this.updateScore(); }
  updateScore() { this.score = [pileScore(this.board, 0), pileScore(this.board, 1)]; }

  /** The squares the hint lights: every one with a legal move, those that capture first. */
  hintSquares() {
    // (the board draws this every frame while the hint is on: a position changes only when a move is played)
    if (this.hintFor === this.board && this.hintMover === this.mover) return this.hintList;
    const seen = [];
    for (const m of hints(this.board, this.mover)) if (!seen.includes(m.sq)) seen.push(m.sq);
    this.hintFor = this.board; this.hintMover = this.mover;
    return (this.hintList = seen.slice(0, 6));
  }

  /** Mika taps one of her squares (null: let go). */
  pick(sq) {
    if (sq === null) { this.sel = null; return; }
    if (ownerOf(sq) !== this.mover || this.board.dan[sq] <= 0) { this.emit('refuse', { sq }); return; }
    this.sel = sq;
    this.emit('select', { sq });
  }

  /** A move: the square and the way round. */
  go(sq, dir) {
    const r = play(this.board, this.mover, sq, dir);
    if (r.illegal) { this.emit('refuse', { sq }); return false; }
    this.anim = { r, i: 0, t: 0, dir, sq, wait: 0 };
    this.state = 'sow'; this.sel = null; this.hintOn = false;
    this.cur.kickT = 0; this.cur.lean = 1;
    this.emit('sow', { who: this.cur.id, human: this.cur.human, sq, dir });
    return true;
  }

  animate(dt) {
    const A = this.anim;
    A.t -= dt;
    while (A.t <= 0 && A.i < A.r.steps.length) {
      const s = A.r.steps[A.i++], S = this.shown;
      if (s.t === 'pick') { S.dan[s.sq] = 0; A.t += PICK_T; this.emit('pick', { sq: s.sq, n: s.n }); }
      else if (s.t === 'drop') { S.dan[s.sq]++; A.t += DROP_T; A.last = s.sq; this.emit('drop', { sq: s.sq }); }
      else { S.dan[s.sq] = 0; S.quan[s.sq] = 0; A.t += TAKE_T; this.emit('take', { sq: s.sq, dan: s.dan, quan: s.quan, who: this.cur.id, human: this.cur.human }); }
    }
    if (A.i >= A.r.steps.length && A.t <= 0) {
      this.board = A.r.board;
      this.syncShown();
      this.last = { who: this.mover, got: A.r.got };
      this.emit('done', { who: this.cur.id, human: this.cur.human, got: A.r.got });
      this.anim = null;
      this.mover = 1 - this.mover;
      this.state = 'pause'; this.timer = PAUSE;
    }
  }

  endGame() {
    this.state = 'over';
    const fs = finalScore(this.board);
    this.final = fs;
    this.score = fs.slice();
    this.over = this.result();
    this.emit('over', this.over);
  }

  result() {
    const [a, b] = this.final || this.score, h = this.human ? 0 : 0;
    const won = a > b, tie = a === b;
    const stars = won ? (a >= b + 12 ? 3 : 2) : tie ? 1 : a >= b - 5 ? 1 : 0;
    void h;
    return { won, tie, mine: a, theirs: b, score: a, rally: this.board.turns, stars, touches: this.board.turns, quan: this.board.pile[0].quan };
  }

  hud(names) {
    return { l: names.mine, big: `${this.score[0]} : ${this.score[1]}`, r: names.theirs, sub: this.state === 'think' && this.cur.human ? tx('Your turn') : this.state === 'over' ? '' : tx('Turn {n}', { n: this.board.turns + 1 }) };
  }
  hint() {
    if (this.state === 'think' && this.cur.human && !this.touchUi) return this.sel === null ? tx('Left or right picks a square, then {act} sows ▶ or Space sows ◀. W shows a hint') : tx('Now: {act} sows ▶, Space sows ◀');
    if (this.state === 'think' && this.cur.human) return this.sel === null ? tx('Tap one of your squares, then ◀ or ▶ to sow. Tap ? for a hint') : tx('Now choose the way round: ◀ or ▶');
    return null;
  }
}

/** A stand-in for the player: plays the best move at `depth` (null: waits forever). */
export function oanBot(sim, depth = 2) {
  const out = {};
  if (sim.state !== 'think' || !sim.human || sim.mover !== 0 || depth === null) return out;
  // depth 0: a player who just picks the first square she can (the QA's hopeless player)
  const m = depth === 0 ? legalMoves(sim.board, 0)[0] : bestMove(sim.board, 0, depth, null, 0);
  if (m) { out.pick = m.sq; out.dir = m.dir; }
  return out;
}

export default {
  id: 'oanquan',
  name: N_('Ô ăn quan'),
  look: 'board',
  moves: false,
  /** Mika against one kid (the kid who is out of doors, nearest first). */
  teams(kids) { return { mine: [], theirs: kids.slice(0, 1) }; },
  target: () => 0,
  create: opts => new OanSim({ ...opts, players: opts.players }),
  bot: oanBot,
  focus: { u: 0, v: 0, w: 4.5, l: 1.8, pitch: 62 },
  roles(ids) {
    if (ids.length < 2) return { game: 'keepup', play: ids.slice(), watch: [] };
    return { game: 'oanquan', play: ids.slice(0, 2), watch: ids.slice(2) };
  },
  ambientTeam: (play, i) => i,
  card(res, rec, names) {
    return {
      verdict: res.won ? tx('You win the board!') : res.tie ? tx('A draw: well played') : tx('The kid wins this one'), good: res.won,
      score: `${names.mine} ${res.mine} : ${res.theirs} ${names.theirs}`,
      best: tx('Wins: {n} · Quan captured: {m}', { n: rec.wins, m: res.quan }),
    };
  },
};
