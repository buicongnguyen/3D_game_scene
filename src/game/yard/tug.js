// Tug of war (kéo co, 綱引き): a long rope on a marked strip, a flag on its middle and a line each side. The kids shout
// "Heave!" on a beat: press / tap when the ring closes on you to add a big pull, off the beat adds little and tires you
// out (the strain meter). The flag crossing a line is a pull won; first to two pulls takes the match. One button only.
// Pure and seeded (no three.js, no DOM): ./round.js shows it; the kids' own game is the same sim with nobody human.
import { rng, clamp, stepToward } from './rules.js';
import { N_, tx } from '../../i18n/i18n.js';

export const LINE = 1.5;            // the flag crossing this far from the middle (metres) wins the pull
export const PULL_WINS = 2;
export const BEAT = 1.5;            // seconds between "Heave!"s
const WIN = { first: { perfect: 0.22, good: 0.42 }, easy: { perfect: 0.17, good: 0.34 }, normal: { perfect: 0.13, good: 0.26 } };
const OPP = { first: 0.82, easy: 0.88, normal: 0.94 };
const READY = 2.4, PAUSE = 2.2, TIMEOUT = 22;

/** How strong each kid pulls (1 = average). */
export const PULL = { strong: 1.1, tricky: 0.95, wobbly: 0.85, steady: 1.0, captain: 1.15, never: 1.05, dreamy: 0.9 };

export class TugSim {
  /** players: [{ id, team: 0 | 1, style?, human? }]; a side with fewer than two pullers is helped by a post (anchor). */
  constructor({ seed = 1, players = [], level = 'normal', target = PULL_WINS } = {}) {
    this.rand = rng(seed);
    this.level = level;
    this.W = WIN[level] || WIN.normal;
    this.target = target;
    this.players = players.map(p => ({ id: p.id, team: p.team, human: !!p.human, style: p.style || 'steady', pull: PULL[p.style] ?? 1, u: 0, v: 0, moving: false, kickT: 9, lean: 0, cool: 0 }));
    this.human = this.players.find(p => p.human) || null;
    this.place();
    for (const p of this.players) { const s = this.spotOf(p); p.u = s.u; p.v = s.v; }
    this.pos = 0;                         // -1 .. 1; > 0 = toward team 0 (the flag has moved to its side)
    this.vel = 0;
    this.heave = [0, 0];                  // the decaying surge of each side's last heave
    this.fatigue = 0;
    this.score = [0, 0];
    this.state = 'ready';
    this.timer = READY;
    this.t = 0; this.pullT = 0;
    this.beatT = 1.2 + READY;             // seconds to the next beat
    this.beatN = 0;
    this.pressed = false;                 // the press of this beat has been counted
    this.rhythm = 0;                      // Mika's on-beat heaves in a row
    this.heaves = 0; this.perfects = 0;
    this.events = [];
    this.over = null;
    this.shuttle = { on: false, u: 0, y: 0, v: 0 };
    this.marker = { on: false, u: 0, v: 0, mine: true, out: false, tau: 1, dur: BEAT };
  }

  place() {
    for (const t of [0, 1]) this.players.filter(p => p.team === t).forEach((p, i) => { p.slot = i; });
  }
  /** A puller stands on the rope: team 0 on the -u half, team 1 on +u, slid along with the flag. */
  spotOf(p) {
    const s = p.team === 0 ? -1 : 1, shift = -(this.pos || 0) * LINE;
    return { u: shift + s * (1.9 + (p.slot || 0) * 1.1), v: 0 };
  }
  anchors(t) { return this.players.filter(p => p.team === t).length < 2 ? 1 : 0; }
  power(t) {
    const list = this.players.filter(p => p.team === t);
    return list.reduce((s, p) => s + 0.5 * p.pull, 0) + this.anchors(t) * 0.45;
  }
  emit(type, o) { this.events.push({ type, ...o }); }

  step(dt, input = {}) {
    this.t += dt;
    for (const p of this.players) { p.kickT += dt; p.lean *= Math.exp(-dt * 4); }
    for (const p of this.players) { const s = this.spotOf(p); stepToward(p, s.u, s.v, 6, dt); }
    this.fatigue = Math.max(0, this.fatigue - dt * 0.16);
    this.heave[0] *= Math.exp(-dt * 2.2); this.heave[1] *= Math.exp(-dt * 2.2);
    const M = this.marker;
    if (this.state === 'over') { M.on = false; return this; }
    if (this.state === 'ready' || this.state === 'point') {
      M.on = false;
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.state === 'point') {
          if (Math.max(...this.score) >= this.target) { this.state = 'over'; this.over = this.result(); this.emit('over', this.over); return this; }
          this.pos = 0; this.vel = 0;
        }
        this.state = 'pull'; this.pullT = 0; this.beatT = 1.0; this.pressed = false;
        this.emit('go', {});
      }
      return this;
    }
    // ---- pulling
    this.pullT += dt;
    this.beatT -= dt;
    const h = this.human;
    M.on = !!h; M.u = h ? h.u : 0; M.v = h ? h.v : 0; M.mine = true; M.tau = Math.max(0, this.beatT); M.dur = BEAT; M.out = false;
    if (this.beatT <= 0) {
      this.beatT += BEAT; this.beatN++; this.pressed = false;
      this.emit('beat', { n: this.beatN });
      // the kids heave on the beat: how well depends on who they are (and a little on luck)
      for (const p of this.players) {
        if (p.human) continue;
        const well = this.rand() < 0.55 + 0.2 * p.pull + (p.style === 'never' ? 0.1 : 0);
        const amount = well ? 1.0 : 0.3;
        this.heave[p.team] += amount * p.pull * 0.85;
        p.kickT = 0; p.lean = 1;
        this.emit('pull', { who: p.id, well });
      }
      if (h) this.emit('shout', { who: 'beat' });
    }
    if (h && (input.kick || input.jump)) this.press(h);
    // forces: the pull of the two sides, a drag so the flag never runs away
    const opp = this.human ? OPP[this.level] ?? 1 : 1;
    const f0 = this.power(0) + this.heave[0], f1 = (this.power(1) + this.heave[1]) * opp;
    this.vel += ((f0 - f1) * 0.5 - this.vel * 2.6) * dt;
    this.pos = clamp(this.pos + this.vel * dt * 3.0, -1.05, 1.05);
    if (Math.abs(this.pos) >= 1) this.winPull(this.pos > 0 ? 0 : 1, 'line');
    else if (this.pullT >= TIMEOUT) this.winPull(this.pos > 0.02 ? 0 : 1, 'time');
    return this;
  }

  /** Mika presses: how far from the beat she is says how much she adds. */
  press(h) {
    // distance to the nearest beat (the one coming, or the one that has just gone)
    const toNext = this.beatT, sinceLast = BEAT - this.beatT, e = Math.min(toNext, sinceLast);
    const early = toNext < sinceLast;
    h.kickT = 0; h.lean = 1;
    const mult = this.fatigue > 0.65 ? 0.4 : 1;
    if (!this.pressed && e <= this.W.good) {
      this.pressed = true;
      const perfect = e <= this.W.perfect;
      this.heave[0] += (perfect ? 1.5 : 1.2) * mult;
      this.rhythm = perfect ? this.rhythm + 1 : 0;
      this.heaves++; if (perfect) this.perfects++;
      this.emit('heave', { who: h.id, human: true, quality: perfect ? 'perfect' : 'good', early });
    } else {
      this.heave[0] += 0.15 * mult;
      this.fatigue = Math.min(1, this.fatigue + 0.3);
      this.rhythm = 0;
      this.emit('heave', { who: h.id, human: true, quality: 'off' });
    }
  }

  winPull(team, why) {
    this.score[team]++;
    this.state = 'point'; this.timer = PAUSE;
    this.marker.on = false;
    this.emit('point', { team, why, score: this.score.slice() });
  }

  result() {
    const [a, b] = this.score, won = a >= this.target && a > b;
    const stars = won ? (b === 0 ? 3 : 2) : a > 0 ? 1 : 0;
    return { won, mine: a, theirs: b, score: a, rally: this.perfects, stars, touches: this.heaves };
  }

  hud(names) {
    const n = Math.round(this.fatigue * 5);
    return { l: names.mine, big: `${this.score[0]} : ${this.score[1]}`, r: names.theirs, sub: `${tx('Strain')} ${'▮'.repeat(n)}${'▯'.repeat(5 - n)}` };
  }
  hint() {
    if (this.state === 'ready' && this.human) return tx('Press {act} as the ring closes on you');
    if (this.fatigue > 0.65) return tx('Too tired: wait for the beat');
    return null;
  }
}

/** A stand-in for the player: presses on the beat (offset = seconds early (-) or late); null never presses. */
export function tugBot(sim, at = 0) {
  const out = { mx: 0, mv: 0, kick: false };
  if (sim.state !== 'pull' || at === null || !sim.human) return out;
  const off = typeof at === 'function' ? at(sim) : at, sinceLast = BEAT - sim.beatT, key = off >= 0 ? sim.beatN : sim.beatN + 1;
  if (sim._bot === key) return out;
  if (off >= 0 ? sinceLast >= off : sim.beatT <= -off) { sim._bot = key; out.kick = true; }
  return out;
}

export default {
  id: 'tug',
  name: N_('Tug of war'),
  look: 'tug',
  moves: false,
  /** Mika joins the weaker side: with three kids, one kid and Mika against two; fewer: Mika and a post against them. */
  teams(kids) {
    if (kids.length >= 3) return { mine: [kids[2]], theirs: [kids[0], kids[1]] };
    return { mine: [], theirs: kids.slice(0, 2) };
  },
  target: () => PULL_WINS,
  create: opts => new TugSim(opts),
  bot: tugBot,
  focus: { u: 0, v: 0, w: 9.5, l: 5 },
  roles(ids, round = 0) {
    if (ids.length < 3) return { game: 'keepup', play: ids.slice(), watch: [] };
    const r = round % 3;
    return { game: 'tug', play: [ids[(r + 1) % 3], ids[(r + 2) % 3], ids[r]].slice(0, 3), watch: ids.slice(3) };
  },
  ambientTeam: (play, i) => (i === 2 ? 1 : 0) ,
  card(res, rec, names) {
    return {
      verdict: res.won ? tx('You win the pull!') : tx('The other side wins the pull'), good: res.won,
      score: `${names.mine} ${res.mine} : ${res.theirs} ${names.theirs}`,
      best: tx('Wins: {n} · Perfect heaves: {m}', { n: rec.wins, m: rec.rally }),
    };
  },
};
