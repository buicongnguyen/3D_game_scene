// Sack race (đua bao bố): a straight 13 m course, a banner at each end, a lane each. Hop forward with one press per hop
// (E / tap / Jump): a steady rhythm builds longer hops, mashing makes you wobble and, after a second wobble, tumble
// (the kids get up laughing). A round is about fifteen seconds; the stars are the finishing place. Pure and seeded (no
// three.js, no DOM): ./round.js shows it; the kids' own race is the same sim with nobody human in it.
import { rng, clamp, starsFor } from './rules.js';
import { N_, tx } from '../../i18n/i18n.js';

export const COURSE = 13;          // metres from the start line to the finish
export const START_V = COURSE / 2;  // the start line is on the near side (v > 0): the racers run away from the camera
const IDEAL = 0.5;                 // the steady hop: seconds between presses
const HOP_T = 0.34;                // a hop takes this long in the air
const FALL_T = 1.2;                // lying in the sack, laughing
const COUNT = 3.0;

/** How each kid races: interval between hops, how loosely they keep it, how often they topple. */
export const PACE = {
  strong: { I: 0.5, s: 0.03, fall: 0.015 }, tricky: { I: 0.52, s: 0.05, fall: 0.025 }, wobbly: { I: 0.56, s: 0.12, fall: 0.06 },
  steady: { I: 0.53, s: 0.05, fall: 0.025 }, captain: { I: 0.4, s: 0.06, fall: 0.07 }, never: { I: 0.5, s: 0.02, fall: 0.008 }, dreamy: { I: 0.6, s: 0.1, fall: 0.04 },
};

export class SackSim {
  /** players: [{ id, style?, human? }] (3 or 4 lanes). */
  constructor({ seed = 1, players = [], level = 'normal' } = {}) {
    this.rand = rng(seed);
    this.level = level;
    this.cap = level === 'first' ? 0.62 : level === 'easy' ? 0.74 : 0.84;      // how steady the kids' rhythm gets
    const n = players.length;
    this.players = players.map((p, i) => ({
      id: p.id, team: 0, human: !!p.human, style: p.style || 'steady', pace: PACE[p.style] || PACE.steady,
      d: 0, u: (i - (n - 1) / 2) * 1.5, v: START_V, y: 0, lean: 0, moving: false, kickT: 9,
      last: -9, hopT: 9, wobble: 0, rhythm: 0, fallT: 0, falls: 0, finish: null, place: 0, nextHop: 0.3 + this.rand() * 0.3, hops: 0, fast: 0,
    }));
    this.human = this.players.find(p => p.human) || null;
    this.state = 'count';
    this.timer = COUNT;
    this.t = 0; this.run = 0;
    this.placed = 0;
    this.score = [0, 0];
    this.events = [];
    this.over = null;
    this.shuttle = { on: false, u: 0, y: 0, v: 0 };
    this.marker = { on: false, u: 0, v: 0, mine: false, out: false, tau: 1, dur: 1 };
  }

  emit(type, o) { this.events.push({ type, ...o }); }

  step(dt, input = {}) {
    this.t += dt;
    for (const p of this.players) { p.kickT += dt; p.hopT += dt; }
    if (this.state === 'count') {
      const was = Math.ceil(this.timer);
      this.timer -= dt;
      if (Math.ceil(this.timer) !== was && this.timer > 0) this.emit('count', { n: Math.ceil(this.timer) });
      if (this.timer <= 0) { this.state = 'race'; this.run = 0; this.emit('go', {}); }
    } else if (this.state === 'race') {
      this.run += dt;
      for (const p of this.players) if (!p.finish) this.stepPlayer(p, dt, input);
      const fin = this.players.filter(p => p.finish), last = Math.max(0, ...fin.map(p => p.finish));
      if (fin.length === this.players.length || this.run > 40 || (fin.length >= this.players.length - 1 && this.run - last > 3.5)) this.finishRace();
    } else if (this.state === 'done') {
      this.timer -= dt;
      if (this.timer <= 0) { this.state = 'over'; this.over = this.result(); this.emit('over', this.over); }
    }
    for (const p of this.players) {
      // the hop in the air: an arc, and a lean forward
      const k = clamp(p.hopT / HOP_T, 0, 1);
      p.y = p.fallT > 0 ? 0 : p.hopT < HOP_T ? 0.26 * Math.sin(Math.PI * k) : 0;
      p.lean = p.fallT > 0 ? 1.4 : p.hopT < HOP_T ? 0.35 : 0.08;
      p.v = START_V - p.d;
      p.moving = p.hopT < HOP_T;
    }
    return this;
  }

  stepPlayer(p, dt, input) {
    if (p.fallT > 0) {
      p.fallT -= dt;
      if (p.fallT <= 0) { p.wobble = 0; p.last = -9; this.emit('up', { who: p.id }); }
      return;
    }
    if (p.human) { if (input.kick || input.jump) this.hop(p); return; }
    p.nextHop -= dt;
    if (p.nextHop <= 0) {
      this.hop(p);
      const s = p.pace.s, I = p.pace.I * (this.level === 'first' ? 1.15 : this.level === 'easy' ? 1.05 : 1);
      p.nextHop = Math.max(0.2, I + (this.rand() - 0.5) * 2 * s);
    }
  }

  /** One press. The gap since the last decides: steady builds rhythm, a quick one wobbles, a long one loses the beat. */
  hop(p) {
    if (p.hopT < 0.16 && p.human) return;               // (a bounce of the same press)
    const e = this.run - p.last, wide = this.level === 'first' ? 0.07 : this.level === 'easy' ? 0.03 : 0;
    p.last = this.run;
    let len = 0.34;
    if (e > 1.0) p.rhythm = 0;
    else if (Math.abs(e - IDEAL) <= 0.1 + wide) { p.rhythm = Math.min(1, p.rhythm + 0.2); }
    else if (Math.abs(e - IDEAL) <= 0.2 + wide) p.rhythm = Math.max(0, p.rhythm - 0.2);
    else if (e < IDEAL - 0.2 - wide) {
      // too quick: the sack wobbles
      p.wobble += p.human ? 0.5 : 0.35;
      p.rhythm = 0;
      this.emit('wobble', { who: p.id, human: p.human });
      if (p.wobble >= 1) { this.tumble(p); return; }
    } else p.rhythm = Math.max(0, p.rhythm - 0.4);
    if (!p.human && this.rand() < p.pace.fall) { this.tumble(p); return; }
    p.wobble = Math.max(0, p.wobble - 0.1);
    len += 0.28 * Math.min(p.rhythm, p.human ? 1 : this.cap);
    if (p.hopT < HOP_T * 0.6) len *= 0.5;                // landing too soon: a short stumble hop
    p.d += len; p.hopT = 0; p.kickT = 0; p.hops++;
    this.emit('hop', { who: p.id, human: p.human, rhythm: p.rhythm });
    if (p.d >= COURSE) {
      p.d = COURSE; p.finish = this.run; p.place = ++this.placed;
      this.emit('finish', { who: p.id, place: p.place, time: p.finish, human: p.human });
    }
  }

  tumble(p) {
    p.fallT = FALL_T; p.falls++; p.wobble = 0; p.rhythm = 0;
    this.emit('fall', { who: p.id, human: p.human });
  }

  finishRace() {
    // anyone still hopping is placed by how far they got
    const rest = this.players.filter(p => !p.finish).sort((a, b) => b.d - a.d);
    for (const p of rest) { p.place = ++this.placed; p.finish = null; }
    this.state = 'done'; this.timer = 1.6;
    this.score = [this.human ? this.human.place : 0, this.players.length];
  }

  result() {
    const h = this.human, n = this.players.length;
    const place = h ? h.place : 1, time = h?.finish ?? this.run;
    const stars = place === 1 ? 3 : place === 2 ? 2 : place === 3 && n <= 3 ? 1 : place === 3 ? 1 : 0;
    const score = h?.finish ? Math.max(1, Math.round((22 - h.finish) * 10)) : 0;
    return { won: place === 1, place, n, time, score, rally: place, stars, touches: h?.hops || 0, falls: h?.falls || 0 };
  }

  hud(names) {
    const h = this.human;
    const pos = h ? 1 + this.players.filter(p => p !== h && p.d > h.d).length : 0;
    return { l: tx('Sack race'), big: this.state === 'count' ? String(Math.max(1, Math.ceil(this.timer))) : this.run.toFixed(1), r: h ? tx('Place {n}', { n: pos }) : '', sub: h && h.wobble > 0.3 ? tx('Wobbling!') : '' };
  }
  hint() {
    if (this.state === 'count' && this.human) return tx('Press {act} once for every hop, in a steady beat');
    return null;
  }
}

/** A stand-in for the player: hops every `gap` seconds (gap may be a function); null never. */
export function sackBot(sim, gap = 0.5) {
  const out = { mx: 0, mv: 0, kick: false }, h = sim.human;
  if (!h || sim.state !== 'race' || gap === null || h.fallT > 0 || h.finish) return out;
  const g = typeof gap === 'function' ? gap(sim) : gap;
  out.kick = sim.run - h.last >= g - 1e-9;
  return out;
}

export default {
  id: 'sack',
  name: N_('Sack race'),
  look: 'sack',
  moves: false,
  sideOk: true,                     // the course runs across the screen from the side
  /** Mika races up to three kids, one lane each. */
  teams(kids) { return { mine: [], theirs: kids.slice(0, 3) }; },
  target: () => 0,
  create: opts => new SackSim({ ...opts, players: opts.players.map(p => ({ id: p.id, style: p.style, human: p.human })) }),
  bot: sackBot,
  focus: { u: 0, v: 0, w: 6.5, l: COURSE + 3 },
  roles(ids) {
    if (ids.length < 2) return { game: 'keepup', play: ids.slice(), watch: [] };
    return { game: 'sack', play: ids.slice(0, 4), watch: ids.slice(4) };
  },
  ambientTeam: () => 0,
  card(res, rec, names, newBest) {
    const ord = [tx('1st'), tx('2nd'), tx('3rd'), tx('4th'), tx('5th')][Math.min(4, res.place - 1)];
    return {
      verdict: res.place === 1 ? tx('You win the race!') : tx('You came {place}', { place: ord }), good: res.place <= 2,
      score: res.time ? tx('{n} s across the green', { n: res.time.toFixed(1) }) : tx('Did not finish'),
      best: newBest && rec.plays > 1 ? tx('New best!') : tx('Best: {n}', { n: rec.best }),
    };
  },
};
