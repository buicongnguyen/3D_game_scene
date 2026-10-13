// Rope jumping (nhảy dây, ナワトビ): two kids turn a long rope, the jumper jumps in on the beat. One button: Jump / E /
// tap the moment before the rope reaches the ground (the airborne window is wide when she is new at it). Every clean
// jump adds to the streak, the kids count aloud, the rope speeds up as the streak grows; a trip ends the streak. A round
// is three trips or sixty seconds; the score is the longest streak (stars at 8 / 16 / 30). Kids on their own skip too and
// take turns. Pure and seeded (no three.js, no DOM).
//
// The levels (Mika's rounds; the kids' own skipping is the plain game):
//   first   60 s, three trips, a slow rope and a long jump (the guided first round)
//   easy    75 s, three trips: the rope gets quicker as the streak grows, nothing else
//   normal  90 s, three trips, and the turners CHANGE THE PACE: they call "Faster!" or "Slower!", turn once more as before,
//           and then the rope comes round at the new speed. The beat has to be listened for, not counted.
//   hard    110 s, three trips, the pace calls, and "Double!": one turn later the rope whips round TWICE in a row. One
//           late jump clears both (or two quick ones); a jump taken early comes down on the second.
import { rng, clamp, starsFor, stepToward } from './rules.js';
import { N_, tx } from '../../i18n/i18n.js';

export const ROPE_STARS = [8, 16, 30];
export const HANDS = 0.92;            // the height of the turners' hands
export const TURN_U = 2.3;            // the turners stand this far either side of the middle
const TRIPS = 3, ROUND = 60, PAUSE = 1.3, START = 1.6;
/** Per level: the clock, the trips allowed, the stars (longest streak), and what the turners call. */
export const ROPE_LEVEL = {
  first: { time: ROUND, trips: TRIPS, stars: ROPE_STARS },
  easy: { time: 75, trips: TRIPS, stars: [8, 16, 28] },
  normal: { time: 90, trips: TRIPS, stars: [10, 20, 34], tempo: true },
  hard: { time: 110, trips: TRIPS, stars: [10, 22, 40], tempo: true, doubles: true },
};
export const PACE = { fast: 0.8, slow: 1.25 };      // what "Faster!" and "Slower!" do to the turn
export const QUICK = 0.28;                           // "Double!": the second turn comes this soon after the first

/** Seconds per turn of the rope, by streak: it gets quicker, never frantic. level: first | easy | normal. */
export function turnPeriod(streak, level) {
  const slow = level === 'first' ? 1.5 : level === 'easy' ? 1.35 : 1.2;
  return Math.max(0.6, slow - streak * 0.028);
}
/** How long a jump lasts, and the height she needs to clear the rope when it reaches the ground. */
export const JUMP = { first: 0.72, easy: 0.62, normal: 0.52, hard: 0.56 };
export const CLEAR_H = 0.17;
export const jumpHeight = (t, d) => (t < 0 || t > d ? 0 : 0.62 * Math.sin(Math.PI * t / d));
/** The part of a jump that clears the rope: [from, to] seconds after the press. */
export function clearWindow(d) {
  const k = Math.asin(CLEAR_H / 0.62) * d / Math.PI;
  return [k, d - k];
}

export class RopeSim {
  /**
   * players: [{ id, role: 'turn' | 'jump', human?, style? }]; with fewer than two turners the rope is tied to two posts.
   * rotate: after a trip the jumper changes (the kids' own game).
   */
  constructor({ seed = 1, players = [], level = 'normal', rotate = false } = {}) {
    this.rand = rng(seed);
    this.level = level;
    this.rotate = !!rotate;
    this.players = players.map((p, i) => ({ id: p.id, team: 0, human: !!p.human, role: p.role, style: p.style || 'steady', u: 0, v: 0, y: 0, moving: false, kickT: 9, cool: 0, jumpT: 9, order: i }));
    this.human = this.players.find(p => p.human) || null;
    this.turners = this.players.filter(p => p.role === 'turn');
    this.posts = this.turners.length < 2;
    this.layout();
    for (const p of this.players) { const t = this.spot(p); p.u = t.u; p.v = t.v; }
    this.ph = 0;                         // 0 .. 1 round the rope; the rope touches the ground at 0
    this.T = turnPeriod(0, level);
    this.state = 'start';                // start (the rope is turned up), run, trip, over
    this.timer = START;
    const K = this.K = ROPE_LEVEL[level] || ROPE_LEVEL.normal;
    this.maxTrips = K.trips;
    this.streak = 0; this.best = 0; this.total = 0; this.trips = 0; this.t = 0; this.timeLeft = rotate ? Infinity : K.time;
    // what the turners call (Mika's rounds only): a change of pace, a double turn
    this.tempo = !!this.human && !!K.tempo;
    this.doubles = !!this.human && !!K.doubles;
    this.pace = 1; this.nextPace = null;        // the pace now, and the one called for (it starts at the next touch of the ground)
    this.double = 0;                            // 2: called, the pair is next; 1: between the two turns of the pair; 0: none
    this.callIn = this.tempo ? 4 + Math.floor(this.rand() * 3) : 0;      // (the kids' own game draws nothing here: it replays as before)
    this.calls = 0; this.doubled = 0;
    if (this.tempo) this.timer += 2;            // (the level's rule is on the hint line before the first jump: time to read it)
    this.contact = false;
    this.score = [0, 0];
    this.events = [];
    this.over = null;
    this.shuttle = { on: false, u: 0, y: 0, v: 0 };
    this.marker = { on: false, u: 0, v: 0, mine: false, out: false, tau: 0, dur: 1 };
    this.next = this.rand() * 0.5;       // when the kid jumper jumps (seconds before the rope touches)
  }

  get jumper() { return this.players.find(p => p.role === 'jump') || null; }
  layout() { this.slotT = this.turners.map((p, i) => (i ? 1 : -1) * TURN_U); }
  /** Where a player stands: turners at the ends, the jumper in the middle, kids waiting in a line behind. */
  spot(p) {
    if (p.role === 'turn') return { u: this.turners.indexOf(p) ? TURN_U : -TURN_U, v: 0 };
    if (p.role === 'jump') return { u: 0, v: 0 };
    return { u: -1.6 + (p.order % 3) * 0.6, v: 1.9 };
  }

  emit(type, o) { this.events.push({ type, ...o }); }

  /** Seconds for the turn that is starting now. */
  period() {
    if (this.double === 1) return QUICK;
    if (!this.tempo) return turnPeriod(this.streak, this.level);
    // with pace calls the streak quickens the rope only a little: the calls do the rest
    return Math.max(0.62, Math.max(0.82, 1.15 - this.streak * 0.012) * this.pace);
  }

  /** The turners' calls, decided as the rope touches the ground (after a clean jump): a new pace, or a double turn. */
  callOut() {
    if (this.double === 2) { this.double = 1; return; }         // the pair starts now: this turn is the quick one
    if (this.double === 1) { this.double = 0; this.doubled++; }
    if (this.nextPace !== null) { this.pace = this.nextPace; this.nextPace = null; }
    if (!this.tempo || --this.callIn > 0) return;
    this.callIn = 5 + Math.floor(this.rand() * 4);
    this.calls++;
    if (this.doubles && this.rand() < 0.5) { this.double = 2; this.emit('double', {}); return; }
    const kind = this.pace < 1 ? 'slow' : this.pace > 1 ? 'fast' : this.rand() < 0.6 ? 'fast' : 'slow';
    this.nextPace = PACE[kind];
    this.emit('tempo', { kind });
  }

  step(dt, input = {}) {
    this.t += dt;
    for (const p of this.players) { p.kickT += dt; p.jumpT += dt; }
    const j = this.jumper;
    if (j) j.y = jumpHeight(j.jumpT, JUMP[this.level] || JUMP.normal);
    for (const p of this.players) if (p.role !== 'jump') p.y = 0;
    for (const p of this.players) { const t = this.spot(p); stepToward(p, t.u, t.v, 3, dt); }
    if (this.state === 'over') return this;
    if (this.state === 'start') { this.timer -= dt; this.ph = (this.ph + dt / 1.6) % 1; if (this.timer <= 0) { this.state = 'run'; this.ph = 0.15; this.emit('go', {}); } return this; }
    if (this.state === 'trip') {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.trips >= this.maxTrips || this.timeLeft <= 0) { this.finish(); return this; }
        this.state = 'start'; this.timer = 1.0; this.ph = 0.2;
      }
      return this;
    }
    // run: the clock, the jumper's press, the rope
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) { this.timeLeft = 0; this.finish(); return this; }
    if (j) {
      if (j.human && (input.kick || input.jump) && j.jumpT > 0.2) { j.jumpT = 0; this.emit('jump', { who: j.id, human: true }); }
      if (!j.human) {
        const toGround = (1 - this.ph) * this.T;          // seconds until the rope reaches the ground
        const d = JUMP[this.level] || JUMP.normal, [a, b] = clearWindow(d), aim = (a + b) / 2 + (this.next - 0.25) * 0.4;
        if (j.jumpT > 0.3 && toGround <= aim) { j.jumpT = 0; this.emit('jump', { who: j.id }); }
      }
    }
    const was = this.ph;
    this.ph += dt / this.T;
    if (this.ph >= 1) { this.ph -= 1; this.touch(was); }
    return this;
  }

  /** The rope has just reached the ground. */
  touch(was) {
    const j = this.jumper;
    this.emit('ground', {});
    if (!j) return;
    let clear = j.y > CLEAR_H;
    // a kid jumper trips now and then (never in the first two turns)
    if (!j.human && clear && this.streak >= 2 && this.rand() < 0.07 + 0.003 * this.streak) clear = false;
    if (!j.human && !clear && this.streak < 2) clear = true;
    if (clear) {
      this.streak++; this.total++;
      this.best = Math.max(this.best, this.streak);
      this.score[0] = this.best; this.score[1] = this.streak;
      this.next = this.rand() * 0.5;
      this.emit('count', { n: this.streak, who: j.id, human: j.human });
      this.callOut();
      this.T = this.period();
    } else {
      this.trips++;
      this.emit('trip', { who: j.id, human: j.human, streak: this.streak, trips: this.trips, double: this.double > 0 });
      this.streak = 0; this.score[1] = 0;
      // the rope starts again at its plain pace, and whatever was called is forgotten
      this.pace = 1; this.nextPace = null; this.double = 0;
      this.callIn = Math.max(this.callIn, 4);
      this.T = this.period();
      this.state = 'trip'; this.timer = PAUSE;
      if (this.rotate) this.turn();
    }
    void was;
  }

  /** Kids' own game: the jumper changes places with a turner. */
  turn() {
    const j = this.jumper, t = this.turners[0];
    if (!j || !t) return;
    j.role = 'turn'; t.role = 'jump';
    this.turners = this.players.filter(p => p.role === 'turn');
    j.jumpT = 9; t.jumpT = 9;
  }

  finish() {
    this.state = 'over';
    this.over = this.result();
    this.emit('over', this.over);
  }

  result() {
    const S = this.K.stars;
    return { won: this.best >= S[0], score: this.best, rally: this.best, stars: starsFor(this.best, S), touches: this.total, trips: this.trips, doubles: this.doubled };
  }

  hud() {
    const T = this.maxTrips;
    return { l: tx('Streak'), big: String(this.streak), r: tx('Best: {n}', { n: this.best }), sub: `${'♥'.repeat(Math.max(0, T - this.trips))}${'♡'.repeat(Math.min(T, this.trips))} · ${Math.max(0, Math.ceil(this.timeLeft))}` };
  }
  hint() {
    if (this.state === 'start' && this.human) {
      // before the first jump the level's own rule is said once
      if (!this.total && !this.trips && this.doubles) return tx('On "Double!" the rope comes round twice: jump late and stay up.');
      if (!this.total && !this.trips && this.tempo) return tx('The turners call "Faster!" or "Slower!". Listen, then keep the new beat.');
      return tx('Press {act} just before the rope reaches the ground');
    }
    if (this.state === 'run' && this.double) return tx('Double! Twice round: jump late');
    if (this.state === 'run' && this.nextPace !== null) return this.nextPace < 1 ? tx('Faster! After this turn') : tx('Slower! After this turn');
    return null;
  }

  /** The rope's shape at fraction s (0 .. 1) of the way from one turner's hand to the other's: { u, v, y } in stage space. */
  ropeAt(s, out) {
    const a = this.posts ? -TURN_U : this.turners[0] ? this.turners[0].u : -TURN_U, b = this.posts ? TURN_U : this.turners[1] ? this.turners[1].u : TURN_U;
    const th = this.ph * Math.PI * 2, bulge = Math.sin(Math.PI * s) * (HANDS * 0.96 + 0.05 * Math.sin(th * 2));
    out.u = a + (b - a) * s;
    out.v = bulge * Math.sin(th);
    out.y = HANDS - bulge * Math.cos(th);
    return out;
  }
}

/** A stand-in for the player: presses `at` seconds before the rope reaches the ground (null: never). */
export function ropeBot(sim, at = 0.27) {
  const out = { mx: 0, mv: 0, kick: false };
  if (sim.state !== 'run' || at === null || !sim.human) return out;
  let want = typeof at === 'function' ? at(sim) : at;
  const toGround = (1 - sim.ph) * sim.T;
  // a double turn is coming: a careful player jumps late so that one jump clears both (sim.botDouble = false: one who does not)
  if (sim.double === 2 && sim.botDouble !== false) want = Math.min(want, 0.13);
  if (sim.double === 1) return out;
  out.kick = toGround <= want && toGround > want - 0.06 && sim.human.jumpT > 0.4;
  return out;
}

export default {
  id: 'rope',
  name: N_('Rope jumping'),
  look: 'rope',
  moves: false,
  /** Two kids turn and Mika jumps; with one kid or none the rope is tied to the posts. */
  teams(kids) { return { mine: [], theirs: kids.slice(0, 2), turn: kids.slice(0, 2) }; },
  target: () => 0,
  create(o) {
    const hum = o.players.find(p => p.human), kids = o.players.filter(p => !p.human);
    const list = hum ? [{ id: hum.id, role: 'jump', human: true }, ...kids.slice(0, 2).map(p => ({ id: p.id, role: 'turn', style: p.style }))]
      : kids.map((p, i) => ({ id: p.id, role: i === 0 ? 'jump' : 'turn', style: p.style }));
    return new RopeSim({ ...o, players: list, rotate: !hum });
  },
  bot: ropeBot,
  focus: { u: 0, v: 0.2, w: 7, l: 4.6 },
  // focus mode (engine/focus.js, round.js enterStill): the valley is a still picture; the kids, the rope and the scoreboard stay live
  still: { backdrop: 'frozen', sim: 'actors' },
  roles(ids) {
    if (ids.length < 3) return { game: 'keepup', play: ids.slice(), watch: [] };
    return { game: 'rope', play: ids.slice(0, 3), watch: ids.slice(3) };
  },
  ambientTeam: () => 0,
  card(res, rec, names, newBest) {
    return {
      verdict: res.stars >= 3 ? tx('Nobody in the village jumps like that!') : res.stars ? tx('Well jumped!') : tx('Good try!'), good: res.stars > 0,
      score: tx('{n} jumps in a row', { n: res.score }),
      best: newBest && rec.plays > 1 ? tx('New best!') : tx('Best: {n}', { n: rec.best }),
    };
  },
};
