// Festival dance: the pure rules (no three.js, no DOM), tested in Node by tests/dance.test.mjs. The game itself is
// ./dance.js. Two dances share these rules:
//   'festival'  the hat dance (múa nón) with Hoa by the bell tower: sweep left, sweep right, hat up, turn, then hat tilt,
//               hands up and the bow
//   'kpop'      the K-pop stage with Nabi (and Haru): side steps, jump clap, spin, then point and step, wave to the crowd
//               and heart hands
// Everybody faces the camera, so a move is named by the SCREEN's side: 'left' is a step toward the left of the screen
// (which is the dancer's own right). Only the Difficult level's "mirror" calls are said in the teacher's own words
// ("My left!"): her left is the screen's right, and the player follows her body (mirror()).
//
// A round is a song on a grid of beats. Every move fills two beats (the art contract: a move clip is 40 frames at 30 fps,
// authored at 90 BPM). Easy and Normal are "watch, then copy": the teacher dances a line, a bar for "your turn", then the
// player dances it back. Difficult is danced along with the teacher (the call comes a beat ahead), with mirror lines and a
// free-style chorus at the end, where any moves on the beat score and a combo of them (never one move three times running)
// earns a bonus. Times are seconds on the round's own clock (0 = the first beat of the count-in).
import { N_ } from '../../i18n/i18n.js';

// ------------------------------------------------------------------------------------------------ the moves
// slot: which input plays it (0..3 the arrows / swipes, 4 Space / A, 5 Q / X, 6 R / Y); icon: the picture on the card and
// the button (dance.js draws them); clip: the dancer's clip for the move as SEEN ON SCREEN (facing the camera, a step to
// the screen's left is a step to the dancer's own right, so 'left' plays the R clip)
export const MOVES = {
  festival: {
    left: { slot: 0, word: N_('Sweep left'), short: N_('Left'), icon: 'left', clip: 'SweepR' },
    right: { slot: 1, word: N_('Sweep right'), short: N_('Right'), icon: 'right', clip: 'SweepL' },
    up: { slot: 2, word: N_('Hat up'), short: N_('Up'), icon: 'up', clip: 'FanUp' },
    down: { slot: 3, word: N_('Turn'), short: N_('Turn'), icon: 'turn', clip: 'Turn' },
    hands: { slot: 4, word: N_('Hands up'), short: N_('Hands'), icon: 'hands', clip: 'Flourish' },
    tilt: { slot: 5, word: N_('Hat tilt'), short: N_('Tilt'), icon: 'tilt', clip: 'HatTilt' },
    bow: { slot: 6, word: N_('Bow'), short: N_('Bow'), icon: 'bow', clip: 'DanceBow', finish: true },
  },
  kpop: {
    left: { slot: 0, word: N_('Side step'), short: N_('Left'), icon: 'left', clip: 'SideR' },
    right: { slot: 1, word: N_('Side step'), short: N_('Right'), icon: 'right', clip: 'SideL' },
    up: { slot: 2, word: N_('Jump clap'), short: N_('Clap'), icon: 'clap', clip: 'JumpClap' },
    down: { slot: 3, word: N_('Spin'), short: N_('Spin'), icon: 'spin', clip: 'Spin' },
    point: { slot: 4, word: N_('Point and step'), short: N_('Point'), icon: 'point', clip: 'PointStep' },
    wave: { slot: 5, word: N_('Wave to the crowd'), short: N_('Wave'), icon: 'wave', clip: 'CrowdWave' },
    heart: { slot: 6, word: N_('Heart hands'), short: N_('Heart'), icon: 'heart', clip: 'HeartHands', finish: true },
  },
};
export const MODES = ['festival', 'kpop'];
export const BASIC = ['left', 'right', 'up', 'down'];
/** The moves of a mode, in input-slot order (the buttons on screen, left to right). */
export const slotsOf = mode => Object.keys(MOVES[mode] || MOVES.festival).sort((a, b) => MOVES[mode][a].slot - MOVES[mode][b].slot);
/** The two moves a level adds after the four basic ones, and the finishing move. */
export const EXTRA = { festival: ['hands', 'tilt'], kpop: ['point', 'wave'] };
export const FINISH = { festival: 'bow', kpop: 'heart' };

/** Her own words for a side: what the screen calls 'left' is the right of a dancer facing us. Other moves are the same. */
export function mirror(move) { return move === 'left' ? 'right' : move === 'right' ? 'left' : move; }

// ------------------------------------------------------------------------------------------------ the levels
// bpm: the tempo; lines: moves per line; style: 'watch' (the teacher shows the line, then the player copies it) or
// 'along' (danced together, the call a beat ahead); gap: beats of "your turn" between the show and the copy; rest:
// beats after a line; card: 'always' (the move to do stays on the card while copying), 'demo' (only while the teacher
// shows it: the copy is from memory), 'call' (a beat ahead); win: the timing windows (seconds either side of the beat)
export const DANCE_LEVELS = {
  easy: { bpm: 80, lines: [4, 4, 4, 4], style: 'watch', gap: 4, rest: 0, card: 'always', extra: false, win: { perfect: 0.2, good: 0.38 } },
  normal: { bpm: 96, lines: [5, 5, 6, 5, 6, 6], style: 'watch', gap: 4, rest: 0, card: 'demo', extra: true, finishLines: [2, 5], win: { perfect: 0.18, good: 0.35 } },
  hard: { bpm: 100, lines: [6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6], style: 'along', gap: 0, rest: 4, card: 'call', lead: 1, extra: true, finishLines: [5, 10],
    mirror: [2, 4, 6, 8, 9], chorus: 8, win: { perfect: 0.15, good: 0.3 } },
};
export const COUNT_IN = 4;          // beats of "5, 6, 7, 8" before the first line
export const FINALE = 4;            // beats of the closing bow after the last line
export const CHORUS_CALL = 4;       // beats of "free style!" before the chorus
export const POINTS = { perfect: 10, good: 6, wrong: 0, miss: 0 };
export const CLEAN = 10;            // every move of a line at least good
export const ROUND_LENGTH = { easy: 70, normal: 100, hard: 130 };     // what the rounds aim at (seconds)

/** A move clip's speed and lead: authored at 90 BPM, its accent at frame 10 of 40 (half a beat in). */
export const CLIP = Object.freeze({ bpm: 90, fps: 30, frames: 40, accent: 10 });
export const clipSpeed = bpm => bpm / CLIP.bpm;
/** Seconds from a demonstrator's clip start to its accent: start it this much before the beat. */
export const clipLead = bpm => (CLIP.accent / CLIP.fps) * CLIP.bpm / bpm;

/** A small seeded random generator (mulberry32): the same seed, the same dance. */
export function rng(seed) {
  let a = (Math.floor(seed) >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The timing grade of a press `dt` seconds off its beat: 'perfect' | 'good' | 'miss'. */
export function judge(press, beat, level = 'normal') {
  const w = (DANCE_LEVELS[level] || DANCE_LEVELS.normal).win, d = Math.abs(press - beat);
  return d <= w.perfect ? 'perfect' : d <= w.good ? 'good' : 'miss';
}

/** The combo bonus of a free-style chorus: 4 points a move of the longest run, from three on. */
export const comboBonus = run => (run >= 3 ? 4 * run : 0);
/** Would this move be the third of the same in a row? (a combo never repeats one move three times) */
export const tripled = (move, prev1, prev2) => move === prev1 && move === prev2;

// ------------------------------------------------------------------------------------------------ the sequences
const pick = (rand, list) => list[Math.floor(rand() * list.length) % list.length];

/** One line of `n` moves from `vocab`: never one move three times running, at least two different moves. */
export function makeLine(rand, n, vocab, { must = [], finish = null, sides = 0 } = {}) {
  for (let tries = 0; tries < 60; tries++) {
    const line = [];
    const body = finish ? n - 1 : n;
    for (let i = 0; i < body; i++) {
      let m = pick(rand, vocab), guard = 0;
      while ((tripled(m, line[i - 1], line[i - 2]) || (i > 0 && m === line[i - 1] && rand() < 0.55)) && guard++ < 12) m = pick(rand, vocab);
      line.push(m);
    }
    // the moves a line must teach go in at random places (never the last place of a line that ends with a bow)
    for (const m of must) if (!line.includes(m)) line[Math.floor(rand() * body)] = m;
    if (finish) line.push(finish);
    const ok = new Set(line).size >= 2 && !line.some((m, i) => i >= 2 && tripled(m, line[i - 1], line[i - 2]))
      && line.filter(m => m === 'left' || m === 'right').length >= sides;
    if (ok) return line;
  }
  // (never reached with a vocabulary of four or more)
  return Array.from({ length: n }, (_, i) => vocab[i % vocab.length]);
}

/**
 * The plan of a round: { level, mode, bpm, spb (seconds a beat), beats (in all), length (seconds), lines: [{ i, moves,
 * mirror, demoAt?, copyAt / alongAt (beat of the first move), end (beat after it) }], targets: [{ i, line, k, move,
 * beat, t, call, mirror, chorus, finish }], cues: [{ beat, t, type, ... }] }.
 *   cue types: 'count' (n 1..4), 'phase' (phase 'watch' | 'turn' | 'copy' | 'along' | 'rest' | 'chorus' | 'finale', line),
 *   'demo' (the teacher's move k of a line: at the beat of its accent), 'call' (show the card for a target),
 *   'say' (a line for the teacher: key), 'end'
 * first: the guided first go (Easy, with two simple lines to begin with).
 */
export function planRound({ level = 'easy', mode = 'festival', seed = 1, first = false } = {}) {
  if (first || !DANCE_LEVELS[level]) level = 'easy';
  const L = DANCE_LEVELS[level];
  const rand = rng(seed), spb = 60 / L.bpm;
  const ex = EXTRA[mode] || EXTRA.festival, fin = FINISH[mode] || FINISH.festival;
  const vocab = L.extra ? [...BASIC, ...ex] : BASIC.slice();
  const lines = [], targets = [], cues = [];
  const cue = (beat, type, o = {}) => cues.push({ beat, t: beat * spb, type, ...o });
  let b = 0;
  for (let n = 1; n <= COUNT_IN; n++) cue(b + n - 1, 'count', { n });
  b += COUNT_IN;
  const target = (line, k, move, beat, o = {}) => {
    const t = { i: targets.length, line, k, move, beat, t: beat * spb, call: o.call || { kind: 'move', move }, mirror: !!o.mirror, chorus: !!o.chorus, finish: MOVES[mode][move]?.finish || false };
    targets.push(t);
    return t;
  };
  L.lines.forEach((n, li) => {
    const isMirror = (L.mirror || []).includes(li);
    const finish = (L.finishLines || []).includes(li) ? fin : null;
    // what each line teaches: the two new moves come in on lines 2 and 3 of Normal, and keep coming back after that
    const must = !L.extra ? [] : li === 1 ? [ex[0]] : li === 2 ? [ex[1]] : li > 2 && rand() < 0.6 ? [pick(rand, ex)] : [];
    let moves;
    if (first && li === 0) moves = ['left', 'right', 'left', 'right'];
    else if (first && li === 1) moves = ['up', 'down', 'up', 'down'];
    else moves = makeLine(rand, n, vocab, { must, finish, sides: isMirror ? 2 : 0 });
    const line = { i: li, moves, mirror: isMirror, finish: !!finish };
    if (L.style === 'watch') {
      line.demoAt = b;
      cue(b, 'phase', { phase: 'watch', line: li });
      moves.forEach((m, k) => cue(b + 2 * k, 'demo', { line: li, k, move: m }));
      b += 2 * n;
      cue(b, 'phase', { phase: 'turn', line: li });
      b += L.gap;
      line.copyAt = b;
      cue(b, 'phase', { phase: 'copy', line: li });
      moves.forEach((m, k) => {
        const tg = target(li, k, m, b + 2 * k);
        // Easy keeps the move on the card while it is copied (shown from the beat before its own); Normal hides it
        cue(b + 2 * k - 1, 'call', { target: tg.i, hidden: L.card !== 'always' });
      });
      b += 2 * n;
    } else {
      cue(b - Math.min(L.rest, 4), 'say', { key: isMirror ? 'mirror' : li === 0 ? 'along' : finish ? 'finish' : 'line', line: li });
      line.alongAt = b;
      cue(b, 'phase', { phase: 'along', line: li });
      moves.forEach((m, k) => {
        // a mirror line calls a side in her own words ("My left!"): the move to make is the other side of the screen
        const said = isMirror ? mirror(m) : m;
        const call = isMirror && said !== m ? { kind: 'her', said } : { kind: 'move', move: m };
        const tg = target(li, k, m, b + 2 * k, { call, mirror: isMirror && said !== m });
        cue(b + 2 * k, 'demo', { line: li, k, move: m });
        cue(b + 2 * k - (L.lead || 1), 'call', { target: tg.i, hidden: false });
      });
      b += 2 * n;
      cue(b, 'phase', { phase: 'rest', line: li });
      b += L.rest;
    }
    line.end = b;
    lines.push(line);
  });
  let chorus = null;
  if (L.chorus) {
    cue(b, 'phase', { phase: 'chorus-call' });
    cue(b, 'say', { key: 'chorus' });
    b += CHORUS_CALL;
    chorus = { at: b, slots: L.chorus };
    cue(b, 'phase', { phase: 'chorus' });
    for (let k = 0; k < L.chorus; k++) {
      const tg = target(lines.length, k, null, b + 2 * k, { chorus: true, call: { kind: 'free' } });
      cue(b + 2 * k - 1, 'call', { target: tg.i, hidden: false });
    }
    b += 2 * L.chorus;
  }
  cue(b, 'phase', { phase: 'finale' });
  cue(b, 'say', { key: 'finale' });
  b += FINALE;
  cue(b, 'end');
  cues.sort((p, q) => p.beat - q.beat);
  return { level, mode, bpm: L.bpm, spb, beats: b, length: b * spb, lines, targets, cues, chorus, first, style: L.style, card: L.card, win: L.win };
}

/** The most a round can score (every move perfect, every line clean, the longest chorus combo). */
export function bestScore(plan) {
  return plan.targets.length * POINTS.perfect + plan.lines.length * CLEAN + (plan.chorus ? comboBonus(plan.chorus.slots) : 0);
}

// ------------------------------------------------------------------------------------------------ the round
/**
 * A round being danced. update(t) moves the clock on and returns the events that happened (misses of beats gone by,
 * clean lines, the chorus bonus, the end); press(move, t) is a press of the player at time t and returns its event.
 *   { type: 'hit', target, grade: 'perfect' | 'good', points, combo? }   { type: 'wrong', target, move }
 *   { type: 'miss', target }   { type: 'stray', move }   { type: 'clean', line, points }   { type: 'combo', run, points }
 *   { type: 'end' }
 */
export class DanceRound {
  constructor(opts = {}) {
    this.plan = opts.plan || planRound(opts);
    this.level = this.plan.level;
    this.t = 0;
    this.score = 0;
    this.grades = new Array(this.plan.targets.length).fill(null);       // per target: 'perfect' | 'good' | 'wrong' | 'miss'
    this.next = 0;                // the first target not judged yet
    this.lineDone = new Set();
    this.count = { perfect: 0, good: 0, wrong: 0, miss: 0, stray: 0, clean: 0 };
    this.run = 0; this.bestRun = 0; this.prev = [null, null];
    this.streak = 0; this.bestStreak = 0;
    this.glow = 0;                // 0..1: how bright the lanterns burn (good dancing lights them up)
    this.over = false;
    this.bonus = 0;
  }

  get length() { return this.plan.length; }
  get left() { return Math.max(0, this.plan.length - this.t); }

  /** The target a press at time t would be judged against (the first one not judged whose window holds t), or null. */
  targetAt(t) {
    const T = this.plan.targets, w = this.plan.win.good;
    for (let i = this.next; i < T.length; i++) {
      if (this.grades[i]) continue;
      if (T[i].t - w > t) return null;
      if (Math.abs(T[i].t - t) <= w) return T[i];
    }
    return null;
  }

  press(move, t = this.t) {
    if (this.over) return null;
    const tg = this.targetAt(t);
    if (!tg) { this.count.stray++; return { type: 'stray', move }; }
    const ev = [];
    if (!tg.chorus && move !== tg.move) {
      this.grade(tg, 'wrong', ev);
      return { type: 'wrong', target: tg, move, after: ev };
    }
    const g = judge(t, tg.t, this.level);
    if (g === 'miss') { this.grade(tg, 'miss', ev); return { type: 'miss', target: tg, after: ev }; }
    const out = { type: 'hit', target: tg, grade: g, points: POINTS[g], move };
    if (tg.chorus) {
      // a combo: moves on the beat, but never one move three times running
      if (tripled(move, this.prev[0], this.prev[1])) { this.run = 0; out.repeat = true; }
      else { this.run++; this.bestRun = Math.max(this.bestRun, this.run); }
      this.prev = [move, this.prev[0]];
      out.combo = this.run;
    }
    this.grade(tg, g, ev, out);
    out.after = ev;
    return out;
  }

  grade(tg, g, ev = [], out = null) {
    this.grades[tg.i] = g;
    this.count[g]++;
    const pts = POINTS[g] || 0;
    this.score += pts;
    if (out) out.points = pts;
    if (g === 'perfect' || g === 'good') { this.streak++; this.bestStreak = Math.max(this.bestStreak, this.streak); this.glow = Math.min(1, this.glow + (g === 'perfect' ? 0.11 : 0.07)); }
    else { this.streak = 0; this.glow = Math.max(0, this.glow - 0.12); if (tg.chorus) { this.run = 0; this.prev = [null, null]; } }
    while (this.next < this.grades.length && this.grades[this.next]) this.next++;
    this.checkLine(tg, ev);
  }

  checkLine(tg, ev) {
    const T = this.plan.targets;
    if (tg.chorus) {
      if (T.filter(x => x.chorus).every(x => this.grades[x.i]) && !this.lineDone.has('chorus')) {
        this.lineDone.add('chorus');
        const pts = comboBonus(this.bestRun);
        this.bonus += pts; this.score += pts;
        ev.push({ type: 'combo', run: this.bestRun, points: pts });
      }
      return;
    }
    if (this.lineDone.has(tg.line)) return;
    const mine = T.filter(x => !x.chorus && x.line === tg.line);
    if (!mine.every(x => this.grades[x.i])) return;
    this.lineDone.add(tg.line);
    if (mine.every(x => this.grades[x.i] === 'perfect' || this.grades[x.i] === 'good')) {
      this.count.clean++; this.bonus += CLEAN; this.score += CLEAN;
      ev.push({ type: 'clean', line: tg.line, points: CLEAN });
    }
  }

  /** Move the clock on to t: beats whose window has passed unpressed are missed. Returns the events. */
  update(t) {
    const ev = [];
    if (this.over) return ev;
    this.t = Math.max(this.t, t);
    const T = this.plan.targets, w = this.plan.win.good;
    for (let i = this.next; i < T.length && T[i].t + w < this.t; i++) {
      if (this.grades[i]) continue;
      ev.push({ type: 'miss', target: T[i] });
      this.grade(T[i], 'miss', ev);
    }
    if (this.t >= this.plan.length) { this.over = true; ev.push({ type: 'end' }); }
    return ev;
  }

  result() {
    const c = this.count;
    return { score: this.score, perfect: c.perfect, good: c.good, missed: c.miss + c.wrong, wrong: c.wrong, clean: c.clean, lines: this.plan.lines.length,
      combo: this.bestRun, streak: this.bestStreak, bonus: this.bonus, best: bestScore(this.plan), moves: this.plan.targets.length };
  }
}

/**
 * A scripted dancer for the tests and the QA autopilot. jitter: seconds off the beat (uniform either side); wrong: the
 * share of presses with a wrong move; skip: the share of beats not pressed; rand: its own random numbers.
 */
export function botPress(round, target, { jitter = 0, wrong = 0, skip = 0, rand = Math.random } = {}) {
  if (rand() < skip) return null;
  const vocab = slotsOf(round.plan.mode);
  let move = target.move;
  if (target.chorus) {
    // free style: anything but a third time of the same move
    const ok = vocab.filter(m => !tripled(m, round.prev[0], round.prev[1]));
    move = ok[Math.floor(rand() * ok.length) % ok.length];
  }
  if (!target.chorus && rand() < wrong) move = vocab.find(m => m !== target.move);
  return { move, t: target.t + (rand() * 2 - 1) * jitter };
}

/** Dance a whole round with the bot; returns the result. */
export function playBot(opts, bot = {}) {
  const r = new DanceRound(opts), rand = bot.rand || rng((opts.seed || 1) * 7 + 3);
  for (const tg of r.plan.targets) {
    r.update(tg.t - r.plan.win.good - 1e-6);
    const p = botPress(r, tg, { ...bot, rand });
    if (p) { r.update(Math.min(p.t, tg.t + r.plan.win.good)); r.press(p.move, p.t); }
  }
  r.update(r.plan.length + 0.01);
  return r.result();
}
