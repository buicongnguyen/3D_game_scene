// Rope jumping (nhảy dây, ナワトビ): two kids turn a long rope, the jumper jumps in on the beat. One button: Jump / E /
// tap the moment before the rope reaches the ground (the airborne window is wide when she is new at it). Every clean
// jump adds to the streak, the kids count aloud, the rope speeds up as the streak grows; a trip ends the streak. A round
// is three trips or sixty seconds; the score is the longest streak (stars at 8 / 16 / 30). Kids on their own skip too and
// take turns. Pure and seeded (no three.js, no DOM).
import { rng, clamp, starsFor, stepToward } from './rules.js';
import { N_, tx } from '../../i18n/i18n.js';

export const ROPE_STARS = [8, 16, 30];
export const HANDS = 0.92;            // the height of the turners' hands
export const TURN_U = 2.3;            // the turners stand this far either side of the middle
const TRIPS = 3, ROUND = 60, PAUSE = 1.3, START = 1.6;

/** Seconds per turn of the rope, by streak: it gets quicker, never frantic. level: first | easy | normal. */
export function turnPeriod(streak, level) {
  const slow = level === 'first' ? 1.5 : level === 'easy' ? 1.35 : 1.2;
  return Math.max(0.6, slow - streak * 0.028);
}
/** How long a jump lasts, and the height she needs to clear the rope when it reaches the ground. */
export const JUMP = { first: 0.72, easy: 0.62, normal: 0.52 };
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
    this.streak = 0; this.best = 0; this.total = 0; this.trips = 0; this.t = 0; this.timeLeft = rotate ? Infinity : ROUND;
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
        if (this.trips >= TRIPS || this.timeLeft <= 0) { this.finish(); return this; }
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
      this.T = turnPeriod(this.streak, this.level);
      this.next = this.rand() * 0.5;
      this.emit('count', { n: this.streak, who: j.id, human: j.human });
    } else {
      this.trips++;
      this.emit('trip', { who: j.id, human: j.human, streak: this.streak, trips: this.trips });
      this.streak = 0; this.score[1] = 0;
      this.T = turnPeriod(0, this.level);
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
    return { won: this.best >= ROPE_STARS[0], score: this.best, rally: this.best, stars: starsFor(this.best, ROPE_STARS), touches: this.total, trips: this.trips };
  }

  hud() {
    return { l: tx('Streak'), big: String(this.streak), r: tx('Best: {n}', { n: this.best }), sub: `${'♥'.repeat(Math.max(0, TRIPS - this.trips))}${'♡'.repeat(Math.min(TRIPS, this.trips))} · ${Math.max(0, Math.ceil(this.timeLeft))}` };
  }
  hint() {
    if (this.state === 'start' && this.human) return tx('Press {act} just before the rope reaches the ground');
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
  const want = typeof at === 'function' ? at(sim) : at, toGround = (1 - sim.ph) * sim.T;
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
