// Sack race (đua bao bố): a straight 13 m course, a banner at each end, a lane each. Hop forward with one press per hop
// (E / tap / Jump): a steady rhythm builds longer hops, mashing makes you wobble and, after a second wobble, tumble
// (the kids get up laughing). A round is about fifteen seconds; solo stars use finish time, other races finishing place. Pure and seeded (no
// three.js, no DOM): ./round.js shows it; the kids' own race is the same sim with nobody human in it.
//
// The levels (Mika's races; the kids' own race is always the plain single length):
//   first   one length of the green, 13 m (the guided first race, exactly as it always was)
//   easy    there and back: to the far banner, turn, and home again (26 m). The turn costs some of the rhythm.
//   normal  three lengths (39 m) with two LOGS across the lanes: a hop into a log is a stumble, a LEAP (the Jump
//           button) clears it. A leap where there is no log is a wasted, clumsy one.
//   hard    four lengths (52 m), the logs, a strip of MUD in the middle where the steady beat is slower (hop at the old
//           pace and the hops go short, hurry and she wobbles), and rivals who keep a fine rhythm and never fall over.
import { rng, clamp } from './rules.js';
import { N_, tx } from '../../i18n/i18n.js';
import { levelBest } from '../../content/levels.js';

export const COURSE = 13;          // metres from the start line to the finish
export const START_V = COURSE / 2;  // the start line is on the near side (v > 0): the racers run away from the camera
const IDEAL = 0.5;                 // the steady hop: seconds between presses
const HOP_T = 0.34;                // a hop takes this long in the air
const FALL_T = 1.2;                // lying in the sack, laughing
const COUNT = 3.0;
const TIMEOUT = 40;
const GRACE = 3.5;                 // the race waits this long for a racer who has stopped trying
const WATCH = 5;                   // and this long for the kids once Mika herself has finished
// Owner-approved solo rule: steady ~11 s gets 3 stars (<=13 s); <=18 s gets 2; any finish by 40 s gets 1.
// Countdown is excluded. Completing the course is required for every reward, including races against kids.
export const SOLO_TIMES = Object.freeze({ three: 13, two: 18, limit: TIMEOUT });
/**
 * Per level: lengths of the course, the deadline, `par` (the score is (par - seconds) x 10), the solo star times
 * [three, two] (any finish before the deadline earns one), how steady the kids get (`cap`), how slowly they hop (`slow`),
 * how wide Mika's beat is judged (`wide`), and what lies on the course.
 */
export const SACK_LEVEL = {
  first: { lengths: 1, limit: TIMEOUT, par: 22, solo: [SOLO_TIMES.three, SOLO_TIMES.two], cap: 0.62, slow: 1.15, wide: 0.07 },
  easy: { lengths: 2, limit: 75, par: 45, solo: [27, 36], cap: 0.74, slow: 1.05, wide: 0.03 },
  normal: { lengths: 3, limit: 110, par: 70, solo: [39, 52], cap: 0.84, slow: 1, wide: 0, logs: true },
  hard: { lengths: 4, limit: 150, par: 95, solo: [55, 72], cap: 0.95, slow: 1, wide: 0, logs: true, mud: true, sure: true },
};
export const LOGS_V = [3.0, -3.6];     // where the two logs lie across the lanes (stage v)
export const MUD_V = [-1.5, 1.1];      // the strip of mud between them (stage v, from .. to)
export const LEAP = 0.95;              // a leap carries this far, far enough to clear a log
const LEAP_T = 0.46, MUD_IDEAL = 0.68, REACH = 0.66;
/** How often each kid misses a log (they hop into it). */
const LOG_MISS = { strong: 0.05, tricky: 0.08, wobbly: 0.25, steady: 0.08, captain: 0.14, never: 0.03, dreamy: 0.2 };

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
    const L = SACK_LEVEL[level] || SACK_LEVEL.normal, mine = players.some(p => p.human);
    // (the kids' own race is the plain single length at the level's pace: no turn, no logs, no mud)
    const K = this.K = mine ? L : { ...SACK_LEVEL.first, cap: L.cap, slow: L.slow, wide: L.wide };
    this.cap = K.cap;                                   // how steady the kids' rhythm gets
    this.lengths = K.lengths;
    this.total = K.lengths * COURSE;                    // metres to hop
    this.limit = K.limit;
    this.logs = K.logs ? LOGS_V : null;
    this.mud = K.mud ? MUD_V : null;
    const n = players.length;
    this.players = players.map((p, i) => ({
      id: p.id, team: 0, human: !!p.human, style: p.style || 'steady', pace: PACE[p.style] || PACE.steady,
      d: 0, u: (i - (n - 1) / 2) * 1.5, v: START_V, y: 0, lean: 0, moving: false, kickT: 9, back: false, air: HOP_T, high: 0.26,
      last: -9, hopT: 9, wobble: 0, rhythm: 0, fallT: 0, falls: 0, finish: null, place: 0, nextHop: 0.3 + this.rand() * 0.3, hops: 0, fast: 0, act: -9,
      leaps: 0, stumbles: 0,
    }));
    this.human = this.players.find(p => p.human) || null;
    this.state = 'count';
    this.timer = COUNT + (this.logs ? 1 : 0);          // (a second more to read the rule of the logs)
    this.t = 0; this.run = 0;
    this.placed = 0;
    this.score = [0, 0];
    this.events = [];
    this.over = null;
    this.shuttle = { on: false, u: 0, y: 0, v: 0 };
    this.marker = { on: false, u: 0, v: 0, mine: false, out: false, tau: 1, dur: 1 };
  }

  emit(type, o) { this.events.push({ type, ...o }); }

  /** Which length a racer who has hopped d metres is on (0 = the first, going away), and where on the stage that is. */
  legOf(d) { return Math.min(this.lengths - 1, Math.floor(d / COURSE)); }
  vAt(d) { const leg = this.legOf(d), w = d - leg * COURSE; return leg % 2 ? -START_V + w : START_V - w; }
  /** The first log within `reach` metres ahead of a racer at d: its place along the race (metres), or -1. */
  logAhead(d, reach) {
    if (!this.logs) return -1;
    const leg = this.legOf(d);
    let best = -1;
    for (const v of this.logs) {
      const at = leg * COURSE + (leg % 2 ? v + START_V : START_V - v);
      if (at > d + 1e-6 && at <= d + reach && (best < 0 || at < best)) best = at;
    }
    return best;
  }
  inMud(p) { return !!this.mud && p.v >= this.mud[0] && p.v <= this.mud[1]; }

  step(dt, input = {}) {
    this.t += dt;
    for (const p of this.players) { p.kickT += dt; p.hopT += dt; }
    if (this.state === 'count') {
      const was = Math.ceil(this.timer);
      this.timer -= dt;
      if (Math.ceil(this.timer) !== was && this.timer > 0) this.emit('count', { n: Math.ceil(this.timer) });
      if (this.timer <= 0) { this.state = 'race'; this.run = 0; this.emit('go', {}); }
    } else if (this.state === 'race') {
      const raceDt = Math.min(dt, Math.max(0, this.limit - this.run));
      this.run += raceDt;
      for (const p of this.players) if (p.finish === null) this.stepPlayer(p, raceDt, input);
      const fin = this.players.filter(p => p.finish !== null), last = Math.max(0, ...fin.map(p => p.finish));
      // The trailing racer is cut off only once they stop trying: a child who is still hopping (or getting up) always gets
      // to cross the line before the deadline. Otherwise the "must finish" rule turns every slow race against kids into
      // "Did not finish" with no star, where the same pace alone earns one or two.
      const h = this.human, since = h && h.finish === null ? Math.max(last, h.act) : last;
      // Once Mika is over the line her place is settled: she watches the others for a few seconds, not for the half
      // minute a dreamy kid can take (measured: an 11 s win waited until 19.7 s for its card).
      const settled = !!h && h.finish !== null && this.run - h.finish > WATCH;
      if (fin.length === this.players.length || this.run >= this.limit || settled || (fin.length > 0 && fin.length >= this.players.length - 1 && this.run - since > GRACE)) this.finishRace();
    } else if (this.state === 'done') {
      this.timer -= dt;
      if (this.timer <= 0) { this.state = 'over'; this.over = this.result(); this.emit('over', this.over); }
    }
    for (const p of this.players) {
      // the hop in the air: an arc, and a lean forward
      const k = clamp(p.hopT / p.air, 0, 1);
      p.y = p.fallT > 0 ? 0 : p.hopT < p.air ? p.high * Math.sin(Math.PI * k) : 0;
      p.lean = p.fallT > 0 ? 1.4 : p.hopT < p.air ? 0.35 : 0.08;
      p.back = this.legOf(p.d) % 2 === 1;                 // on the way home she faces the other way
      p.v = this.vAt(p.d);
      p.moving = p.hopT < p.air;
    }
    return this;
  }

  stepPlayer(p, dt, input) {
    if (p.fallT > 0) {
      p.fallT -= dt; p.act = this.run;                   // getting up is still trying
      if (p.fallT <= 0) { p.wobble = 0; p.last = -9; this.emit('up', { who: p.id }); }
      return;
    }
    // (with logs on the course the Jump button is the leap; without, either button is a hop, as it always was)
    if (p.human) { if (input.kick || input.jump) this.hop(p, !!input.jump && !!this.logs); return; }
    p.nextHop -= dt;
    if (p.nextHop <= 0) {
      // a kid leaps a log that is within a hop (now and then they do not see it)
      const log = !!this.logs && this.logAhead(p.d, REACH) >= 0;
      this.hop(p, log && this.rand() >= (this.K.sure ? 0.02 : LOG_MISS[p.style] ?? 0.08));
      const s = p.pace.s, I = p.pace.I * this.K.slow * (this.inMud(p) ? MUD_IDEAL / IDEAL : 1);
      p.nextHop = Math.max(0.2, I + (this.rand() - 0.5) * 2 * s);
    }
  }

  /**
   * One press. The gap since the last decides: steady builds rhythm, a quick one wobbles, a long one loses the beat.
   * leap: the long jump that clears a log (a hop into a log is a stumble; a leap over nothing is a wasted one).
   */
  hop(p, leap = false) {
    if (p.hopT < 0.16 && p.human) return;               // (a bounce of the same press)
    p.act = this.run;
    const mud = this.inMud(p), ideal = mud ? MUD_IDEAL : IDEAL;      // in the mud the steady beat is slower
    const e = this.run - p.last, wide = this.K.wide, from = p.d;
    p.last = this.run;
    let len = 0.34;
    if (e > ideal + 0.5) p.rhythm = 0;
    else if (Math.abs(e - ideal) <= 0.1 + wide) { p.rhythm = Math.min(1, p.rhythm + 0.2); }
    else if (Math.abs(e - ideal) <= 0.2 + wide) p.rhythm = Math.max(0, p.rhythm - 0.2);
    else if (e < ideal - 0.2 - wide) {
      // too quick: the sack wobbles
      p.wobble += p.human ? 0.5 : 0.35;
      p.rhythm = 0;
      this.emit('wobble', { who: p.id, human: p.human });
      if (p.wobble >= 1) { this.tumble(p); return; }
    } else p.rhythm = Math.max(0, p.rhythm - 0.4);
    if (!p.human && !this.K.sure && this.rand() < p.pace.fall) { this.tumble(p); return; }
    p.wobble = Math.max(0, p.wobble - 0.1);
    len += 0.28 * Math.min(p.rhythm, p.human ? 1 : this.cap);
    if (mud) len *= 0.88;                                // heavy going
    const log = this.logAhead(p.d, leap ? LEAP : len);
    if (leap) {
      if (log >= 0) { len = LEAP; p.leaps++; }
      else { len = 0.45; p.rhythm = Math.max(0, p.rhythm - 0.4); }      // a leap over nothing: clumsy, and the beat suffers
    } else if (log >= 0) {
      // into the log: over it in a heap, and a moment to get up
      p.d = log + 0.25; p.stumbles++;
      this.tumble(p, 0.8, 'log');
      return;
    }
    if (p.hopT < p.air * 0.6) len *= 0.5;                // landing too soon: a short stumble hop
    p.d += len; p.hopT = 0; p.kickT = 0; p.hops++;
    p.air = leap ? LEAP_T : HOP_T; p.high = leap ? 0.44 : 0.26;
    this.emit('hop', { who: p.id, human: p.human, rhythm: p.rhythm, leap });
    if (p.d >= this.total) {
      p.d = this.total; p.finish = this.run; p.place = ++this.placed;
      this.emit('finish', { who: p.id, place: p.place, time: p.finish, human: p.human });
    } else if (Math.floor(p.d / COURSE) > Math.floor(from / COURSE)) {
      // the far banner (or the near one): round she goes, and some of the rhythm is lost in the turn
      p.d = Math.floor(p.d / COURSE) * COURSE;
      p.rhythm = Math.min(p.rhythm, 0.4);
      this.emit('turn', { who: p.id, human: p.human, length: Math.floor(p.d / COURSE) + 1, of: this.lengths });
    }
  }

  tumble(p, time = FALL_T, why = null) {
    p.fallT = time; p.falls++; p.wobble = 0; p.rhythm = 0;
    this.emit('fall', { who: p.id, human: p.human, why });
  }

  finishRace() {
    // anyone still hopping is placed by how far they got
    const rest = this.players.filter(p => p.finish === null).sort((a, b) => b.d - a.d);
    for (const p of rest) { p.place = ++this.placed; p.finish = null; }
    this.state = 'done'; this.timer = 1.6;
    this.score = [this.human ? this.human.place : 0, this.players.length];
  }

  result() {
    const h = this.human, n = this.players.length;
    const winner = this.players.find(p => p.place === 1 && p.finish !== null);
    const racer = h || winner, finished = racer?.finish !== null && racer?.finish !== undefined;
    const place = h ? h.place : winner ? 1 : 0, time = finished ? racer.finish : null;
    const S = this.K.solo;
    const stars = !finished ? 0 : n === 1 ? (time <= S[0] ? 3 : time <= S[1] ? 2 : time <= this.limit ? 1 : 0)
      : place === 1 ? 3 : place === 2 ? (n === 2 ? 1 : 2) : 1;       // a finish is never worth the same as not finishing
    const score = h && finished ? Math.max(1, Math.round((this.K.par - time) * 10)) : 0;
    return {
      won: finished && place === 1, finished, place, n, time, dist: h ? h.d : 0, score, rally: finished ? place : 0, stars, touches: h?.hops || 0, falls: h?.falls || 0,
      course: this.total, lengths: this.lengths, par: this.K.par, first: this.level === 'first', leaps: h?.leaps || 0, stumbles: h?.stumbles || 0,
    };
  }

  hud(names) {
    const h = this.human;
    const pos = h ? 1 + this.players.filter(p => p !== h && p.d > h.d).length : 0;
    const l = h && this.lengths > 1 ? tx('Length {n} of {m}', { n: this.legOf(h.d) + 1, m: this.lengths }) : tx('Sack race');
    return { l, big: this.state === 'count' ? String(Math.max(1, Math.ceil(this.timer))) : this.run.toFixed(1), r: h ? tx('Place {n}', { n: pos }) : '', sub: h && h.wobble > 0.3 ? tx('Wobbling!') : '' };
  }
  hint() {
    const h = this.human;
    if (this.state === 'count' && h) {
      // during the countdown the level's own rule is said
      if (this.mud) return tx('Leap the logs with {jump}. In the mud, hop slower.');
      if (this.logs) return tx('Hop with {act}. Leap over the logs with {jump}.');
      if (this.lengths > 1) return tx('Hop to the far banner, turn, and hop back.');
      return tx('Press {act} once for every hop, in a steady beat');
    }
    if (this.state === 'race' && h && h.finish === null && h.fallT <= 0) {
      if (this.logAhead(h.d, 1.6) >= 0) return tx('A log! Leap with {jump}');
      if (this.inMud(h)) return tx('Mud: hop slower');
    }
    return null;
  }
}

/** The finishing time a saved sack-race score stands for (SackSim.result: score = (22 - time) x 10). */
export const bestSeconds = (score, par = 22) => par - score / 10;

/**
 * A stand-in for the player: hops every `gap` seconds (gap may be a function); null never. She leaps the logs and slows
 * down in the mud (sim.botLeap = false / sim.botMud = false: a player who does not).
 */
export function sackBot(sim, gap = 0.5) {
  const out = { mx: 0, mv: 0, kick: false, jump: false }, h = sim.human;
  if (!h || sim.state !== 'race' || gap === null || h.fallT > 0 || h.finish !== null) return out;
  let g = typeof gap === 'function' ? gap(sim) : gap;
  if (sim.inMud(h) && sim.botMud !== false) g *= MUD_IDEAL / IDEAL;
  if (sim.run - h.last < g - 1e-9) return out;
  if (sim.botLeap !== false && sim.logAhead(h.d, REACH) >= 0) out.jump = true; else out.kick = true;
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
  cam: 'side',                      // wide screens: from the side the banners frame the race (from behind, the start banner hung across it)
  // a phone held upright: the whole 13 m course makes the racers a dozen pixels tall, so the camera shows seven metres of
  // it and travels with Mika (the HUD still says her place)
  tall: { mode: 'end', pitch: 50, w: 5.4, l: 7, h: 1.3, top: 0.8, follow: { ahead: 1.7, l: 7 } },
  roles(ids) {
    if (ids.length < 2) return { game: 'keepup', play: ids.slice(), watch: [] };
    return { game: 'sack', play: ids.slice(0, 4), watch: ids.slice(4) };
  },
  ambientTeam: () => 0,
  card(res, rec, names, newBest) {
    const ord = [tx('1st'), tx('2nd'), tx('3rd'), tx('4th'), tx('5th')][Math.min(4, res.place - 1)];
    // (the record keeps a score, (par - seconds) x 10, per level: shown as the time it stands for, not as a bare "103".
    // The guided first race is kept with the Easy ones; its own card shows its own time.)
    const par = res.par ?? 22, lengths = res.lengths || 1;
    const best = res.level && !res.first ? levelBest(rec, res.level) : rec.best;
    return {
      verdict: !res.finished ? tx('Did not finish') : res.place === 1 ? tx('You win the race!') : tx('You came {place}', { place: ord }), good: res.finished && res.place <= 2,
      score: res.finished ? (lengths > 1 ? tx('{n} s for {m} lengths of the green', { n: res.time.toFixed(1), m: lengths }) : tx('{n} s across the green', { n: res.time.toFixed(1) }))
        : tx('You hopped {n} m of {m} m', { n: Math.floor(res.dist || 0), m: res.course || COURSE }),
      best: newBest && rec.plays > 1 ? tx('New best!') : best > 1 ? tx('Best: {n} s', { n: bestSeconds(best, par).toFixed(1) }) : '',
    };
  },
};
