// Tug of war (kéo co, 綱引き): a long rope on a marked strip, a flag on its middle and a line each side. The kids shout
// "Heave!" on a beat: press / tap when the ring closes on you to add a big pull, off the beat adds little and tires you
// out (the strain meter). The flag crossing a line is a pull won; first to two pulls takes the match. One button only.
// Pure and seeded (no three.js, no DOM): ./round.js shows it; the kids' own game is the same sim with nobody human.
//
// The levels (Mika's rounds; the kids' own pull is the plain game):
//   first   best of three, wide windows, a weaker other side (the guided first round)
//   easy    best of five: heave on every beat
//   normal  best of five, and now and then the call is "Hold!": the ring turns red and does not close, everybody digs
//           their heels in, and a pull on that beat is a slip (strain, and the flag gives a little). Holding rests her.
//   hard    best of five, the holds, a beat that CHANGES TEMPO in the middle of a pull ("Faster!" / "Slower!": watch the
//           ring, do not count), and muddy ground: any pull off the beat slips and gives ground.
import { rng, clamp, stepToward } from './rules.js';
import { N_, tx } from '../../i18n/i18n.js';

export const LINE = 1.5;            // the flag crossing this far from the middle (metres) wins the pull
export const PULL_WINS = 2;
export const BEAT = 1.5;            // seconds between "Heave!"s
const WIN = { first: { perfect: 0.22, good: 0.42 }, easy: { perfect: 0.17, good: 0.34 }, normal: { perfect: 0.13, good: 0.26 }, hard: { perfect: 0.13, good: 0.26 } };
const OPP = { first: 0.82, easy: 0.88, normal: 0.94, hard: 0.94 };
/** Per level: pulls to win, hold beats, tempo changes, mud. */
export const TUG_LEVEL = {
  first: { target: 2 },
  easy: { target: 3 },
  normal: { target: 3, holds: true },
  hard: { target: 3, holds: true, tempo: true, mud: true },
};
export const TEMPOS = [1.15, BEAT, 1.9];      // Difficult: seconds between beats, changed in the middle of a pull
export const PAIR_MAX = 1.95;                 // the most two kids pull together against Mika and the post
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
    // Mika alone with the post against the two strongest kids could not be won at all (measured: 0 of 40 perfect rounds
    // against Hiro and Nao on Normal), and a level that cannot be won never opens the next one: against her alone a pair
    // pulls no harder than Nao and Sumi do together. (The guided first round is left as it was.)
    const foes = this.players.filter(p => p.team === 1), sum = foes.reduce((s, p) => s + p.pull, 0);
    if (this.human && level !== 'first' && foes.length === 2 && this.players.length === 3 && sum > PAIR_MAX) for (const p of foes) p.pull *= PAIR_MAX / sum;
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
    // the level's own rules (Mika's rounds only)
    const K = this.K = TUG_LEVEL[level] || TUG_LEVEL.normal;
    this.holds = !!this.human && !!K.holds;
    this.tempo = !!this.human && !!K.tempo;
    this.mud = !!this.human && !!K.mud;
    this.beatLen = BEAT;                  // seconds between beats now
    this.holdNow = false;                 // the beat that is coming is a "Hold!"
    this.holdLast = false;                // the beat that has just gone was one
    this.slip = false;                    // she pulled on the hold nearest to her press
    this.sinceHold = 0; this.sinceTempo = 0;
    this.slips = 0; this.held = 0;
    if (this.holds) this.timer += 1.6;    // (the level's rule is on the hint line before the first pull: time to read it)
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
        this.beatLen = BEAT; this.holdNow = this.holdLast = this.slip = false; this.sinceHold = 0; this.sinceTempo = 0;
        M.out = false; M.dur = BEAT;
        this.beat0 = this.beatN;              // the beats counted when this pull began
        this.emit('go', {});
      }
      return this;
    }
    // ---- pulling
    this.pullT += dt;
    this.beatT -= dt;
    const h = this.human;
    if (this.beatT <= 0) {
      const hold = this.holdNow;
      this.beatN++; this.pressed = false;
      // the hold before this beat, kept: her heels were dug in, and she has her breath back
      if (this.holdLast && !this.slip) { this.held++; this.fatigue = Math.max(0, this.fatigue - 0.25); this.emit('dug', {}); }
      this.holdLast = hold; this.slip = false;
      this.sinceHold = hold ? 0 : this.sinceHold + 1; this.sinceTempo++;
      // what the next beat will be: now and then a "Hold!" (never two running), and on Difficult a new tempo
      this.holdNow = this.holds && !hold && this.sinceHold >= 2 && this.rand() < 0.3;
      if (this.tempo && !hold && this.sinceTempo >= 3 && this.rand() < 0.45) {
        const was = this.beatLen, rest = TEMPOS.filter(t => t !== was);
        this.beatLen = rest[Math.floor(this.rand() * rest.length)];
        this.sinceTempo = 0;
        this.emit('tempo', { kind: this.beatLen < was ? 'fast' : 'slow', beat: this.beatLen });
      }
      this.beatT += this.beatLen;
      this.emit('beat', { n: this.beatN, hold });
      if (this.holdNow) this.emit('holdcall', {});
      // the kids heave on the beat: how well depends on who they are (and a little on luck); on a hold nobody does
      for (const p of this.players) {
        if (p.human || hold) continue;
        const well = this.rand() < 0.55 + 0.2 * p.pull + (p.style === 'never' ? 0.1 : 0);
        const amount = well ? 1.0 : 0.3;
        this.heave[p.team] += amount * p.pull * 0.85;
        p.kickT = 0; p.lean = 1;
        this.emit('pull', { who: p.id, well });
      }
      if (h) this.emit('shout', { who: 'beat' });
    }
    M.on = !!h; M.u = h ? h.u : 0; M.v = h ? h.v : 0; M.mine = true; M.tau = Math.max(0, this.beatT); M.dur = this.beatLen; M.out = this.holdNow;
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
    const toNext = this.beatT, sinceLast = this.beatLen - this.beatT, e = Math.min(toNext, sinceLast);
    const early = toNext < sinceLast;
    h.kickT = 0; h.lean = 1;
    const mult = this.fatigue > 0.65 ? 0.4 : 1;
    if (early ? this.holdNow : this.holdLast) {
      // a pull on a "Hold!": her feet go from under her
      this.slip = true; this.slips++;
      this.fatigue = Math.min(1, this.fatigue + 0.4);
      this.heave[0] *= 0.4;                                  // (her side's surge goes with her)
      this.pos = clamp(this.pos - (this.mud ? 0.22 : 0.16), -1.05, 1.05);
      this.rhythm = 0;
      this.emit('heave', { who: h.id, human: true, quality: 'slip', hold: true });
      return;
    }
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
      // Difficult: the ground is mud, and a pull off the beat gives a little of it away
      if (this.mud) { this.slips++; this.pos = clamp(this.pos - 0.08, -1.05, 1.05); }
      this.emit('heave', { who: h.id, human: true, quality: 'off', mud: this.mud });
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
    return { won, mine: a, theirs: b, score: a, rally: this.perfects, stars: this.stars(won, a, b), touches: this.heaves, slips: this.slips, held: this.held };
  }

  /**
   * Stars. Best of three (the first round, and the kids' own pull): a clean sweep is three, a win two, a pull won one.
   * Best of five (easy, normal, hard): a win is two, and three when the other side took one pull at most (on Difficult:
   * with no more than two slips as well). A lost match earns one for a pull won (two on Difficult; on Easy eight
   * heaves on the beat earn it too).
   */
  stars(won, a, b) {
    const lv = this.level;
    if (this.target <= 2) return won ? (b === 0 ? 3 : 2) : a > 0 ? 1 : 0;
    if (won) return b <= 1 && (lv !== 'hard' || this.slips <= 2) ? 3 : 2;
    return a >= (lv === 'hard' ? 2 : 1) || (lv === 'easy' && this.heaves >= 8) ? 1 : 0;
  }

  hud(names) {
    const n = Math.round(this.fatigue * 5);
    return { l: names.mine, big: `${this.score[0]} : ${this.score[1]}`, r: names.theirs, sub: `${tx('Strain')} ${n}/5`, pips: { label: tx('Strain'), n, of: 5 } };
  }
  hint() {
    if (this.state === 'ready' && this.human) {
      // before the first pull the level's own rule is said once
      if (this.mud) return tx('Muddy ground: a pull off the beat slips. On "Hold!" do not pull.');
      if (this.holds) return tx('When the ring turns red they call "Hold!": do not pull on that beat.');
      return tx('Press {act} as the ring closes on you');
    }
    if (this.state === 'pull' && this.holdNow) return tx('Hold! Do not pull');
    if (this.fatigue > 0.65) return tx('Too tired: wait for the beat');
    return null;
  }
}

/** A stand-in for the player: presses on the beat (offset = seconds early (-) or late); null never presses. */
export function tugBot(sim, at = 0) {
  const out = { mx: 0, mv: 0, kick: false };
  if (sim.state !== 'pull' || at === null || !sim.human) return out;
  const off = typeof at === 'function' ? at(sim) : at, sinceLast = sim.beatLen - sim.beatT, key = off >= 0 ? sim.beatN : sim.beatN + 1;
  if (sim._bot === key) return out;
  // a "Hold!": she keeps still (sim.botHold = false: a player who pulls on every beat all the same)
  if ((off >= 0 ? sim.holdLast : sim.holdNow) && sim.botHold !== false) return out;
  // (a pull starts between two beats: she waits for the first one instead of pulling at once, off the beat)
  if (off >= 0 && sim.beatN === sim.beat0) return out;
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
  target: level => (TUG_LEVEL[level] || TUG_LEVEL.normal).target,
  create: opts => new TugSim(opts),
  bot: tugBot,
  focus: { u: 0, v: 0, w: 9.5, l: 5 },
  // a phone held upright: look along the rope from Mika's end, so the pull runs up the screen and the players are not 30 px
  tall: { mode: 'side', pitch: 48, w: 9.4, l: 2.4, h: 1.4, top: 0.82, bottom: -0.78 },
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
