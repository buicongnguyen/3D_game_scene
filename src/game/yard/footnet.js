// Foot-tennis (đá cầu over a net): a shuttlecock is kicked back and forth over the yard's low net. Whoever lets it
// touch the ground on their side, kicks it into the net or sends it out gives the other side a point. First to
// `target` points wins. This file is the whole game as a pure, seeded simulation (no three.js, no DOM): the yard's
// round runner (./round.js) shows it and feeds it Mika's input; the kids' own play is the same simulation with no
// human in it; tests/yard.test.mjs replays recorded input through it.
//
// With nobody to play against (wall: true) Mika practises against the kick-board behind the far end: every third
// return in a row is a point for her, every drop one for the board.
import { COURT, LEVELS, STYLES, KICK_Y, WINDUP, HUMAN_SPEED, rng, clamp, judge, makeFlight, flightAt, homes, stepToward } from './rules.js';
import { N_ } from '../../i18n/i18n.js';

const SERVE_WAIT = 1.3, POINT_PAUSE = 1.7, AI_REACH = 1.3;
const side = team => (team === 0 ? 1 : -1);

export class FootnetSim {
  /**
   * players: [{ id, team: 0 | 1, style?: 'strong' | 'tricky' | 'wobbly' | 'steady', human?: true, u?, v? }] (u, v:
   * where they stand now, in court space; they walk to their places). level: 'first' | 'easy' | 'normal'.
   * target: points to win. wall: practice against the kick-board (team 1 is nobody).
   */
  constructor({ seed = 1, players = [], level = 'normal', target = 5, wall = false } = {}) {
    this.rand = rng(seed);
    this.L = LEVELS[level] || LEVELS.normal;
    this.level = level;
    this.target = target;
    this.wall = !!wall;
    this.players = [];
    for (const team of [0, 1]) {
      const list = players.filter(p => p.team === team), H = homes(team, list.length);
      list.forEach((p, i) => this.players.push({
        id: p.id, team, human: !!p.human, style: STYLES[p.style] || STYLES.steady, home: H[i],
        u: p.u ?? H[i].u, v: p.v ?? H[i].v, moving: false, kickT: 9, cool: 0, plan: null,
      }));
    }
    this.human = this.players.find(p => p.human) || null;
    // two kids against Mika alone get in each other's way
    const n0 = this.players.filter(p => p.team === 0).length, n1 = this.players.length - n0;
    this.crowd = this.human && n0 === 1 && n1 === 2 ? 1.2 : 1;
    this.score = [0, 0];
    this.state = 'serve';
    this.t = 0;
    this.timer = SERVE_WAIT + 0.5;
    this.serves = [0, 0];                   // how often each team has served (its players take turns)
    this.server = this.pickServer(this.human ? 0 : this.rand() < 0.5 ? 0 : 1);
    this.flight = null;
    this.receiver = null;
    this.shuttle = { on: true, u: 0, y: 1, v: 0 };
    this.marker = { on: false, u: 0, v: 0, mine: false, out: false, tau: 0, dur: 1 };
    this.rally = 0;                          // touches in the rally now
    this.best = 0;                           // the longest rally of the match
    this.streak = 0;                         // practice: Mika's returns in a row
    this.touches = 0;                        // Mika's kicks that went back over
    this.events = [];
    this.over = null;
    this.wound = false;
  }

  pickServer(team) {
    const list = this.players.filter(p => p.team === team);
    if (!list.length) return null;
    return list[this.serves[team]++ % list.length];
  }

  emit(type, o) { this.events.push({ type, ...o }); }

  /** One step. input: { mx, mv (Mika's stick in court space: +u right, +v toward the camera), kick, pos?: { u, v } }. */
  step(dt, input = {}) {
    this.t += dt;
    const h = this.human;
    for (const p of this.players) { p.kickT += dt; p.cool -= dt; }
    if (h) this.moveHuman(h, dt, input);
    if (this.state === 'serve') this.stepServe(dt, input);
    else if (this.state === 'rally') this.stepRally(dt, input);
    else if (this.state === 'pause') {
      this.timer -= dt;
      this.goHome(dt, null);
      if (this.timer <= 0) {
        if (this.won() !== null) { this.state = 'over'; this.over = this.result(); this.emit('over', this.over); } else { this.state = 'serve'; this.timer = SERVE_WAIT; this.wound = false; this.shuttle.on = true; }
      }
    }
    return this;
  }

  moveHuman(h, dt, input) {
    if (input.pos) { h.moving = Math.hypot(input.pos.u - h.u, input.pos.v - h.v) > dt * 0.6; h.u = input.pos.u; h.v = input.pos.v; }
    else {
      const mx = input.mx || 0, mv = input.mv || 0, m = Math.hypot(mx, mv);
      h.moving = m > 0.05;
      if (m > 0.05) { const k = HUMAN_SPEED * dt / Math.max(1, m); h.u += mx * k; h.v += mv * k; }
    }
    h.u = clamp(h.u, -COURT.W / 2 - 0.8, COURT.W / 2 + 0.8);
    h.v = clamp(h.v, 0.45, COURT.HALF + 1.2);
  }

  /** Everyone but `busy` drifts back to their place. */
  goHome(dt, busy) {
    for (const p of this.players) {
      if (p.human || p === busy) continue;
      stepToward(p, p.home.u, p.home.v, p.style.speed * 0.7, dt);
    }
  }

  stepServe(dt, input) {
    const s = this.server, sh = this.shuttle;
    this.timer -= dt;
    this.goHome(dt, null);
    this.marker.on = false;
    if (!s) { this.state = 'over'; return; }
    sh.on = true; sh.u = s.u + 0.18; sh.v = s.v - side(s.team) * 0.25; sh.y = 0.85;
    if (s.human) { if (input.kick && this.timer <= SERVE_WAIT - 0.35) this.serve(s, input); return; }
    if (!this.wound && this.timer <= WINDUP) { this.wound = true; this.emit('windup', { who: s.id }); }
    if (this.timer <= 0) this.serve(s, input);
  }

  serve(s, input) {
    const r = this.rand, to = 1 - s.team, toHumans = this.human && this.human.team === to;
    s.kickT = 0;
    this.rally = 1;
    this.streak = 0;
    this.state = 'rally';
    this.emit('serve', { who: s.id, human: s.human });
    const a = { u: this.shuttle.u, y: KICK_Y + 0.3, v: this.shuttle.v };
    if (s.human && this.wall) { this.toWall(a, input, false); return; }
    let b;
    if (s.human) b = this.aim(input, s, false);
    else if (toHumans) b = { u: clamp(this.human.u + (r() - 0.5) * 2.4, -2.3, 2.3), y: 0, v: clamp(this.human.v + (r() - 0.5) * 1.6, 1.6, 4.6) };
    else b = { u: (r() - 0.5) * 3.6, y: 0, v: side(to) * (2.4 + r() * 1.8) };
    this.launch(makeFlight(a, b, 1.75 * (toHumans ? this.L.slow : 1), 2.9), s.team, {});
  }

  /** Where Mika's kick comes down: the stick aims it (left / right, short toward the net or deep). */
  aim(input, h, flat) {
    const r = this.rand, mx = input.mx || 0, mv = input.mv || 0;
    const depth = mv < -0.3 ? 4.7 : mv > 0.3 ? 1.9 : 3.4 + r() * 0.6;      // stick up the court = deep, back toward the camera = a short drop
    return { u: clamp(mx * 2.3 + (r() - 0.5) * (flat ? 0.4 : 0.9), -2.5, 2.5), y: 0, v: -side(h.team) * depth };
  }

  toWall(a, input, flat) {
    const b = { u: clamp(a.u * 0.35 + (input.mx || 0) * 1.1, -COURT.WALL_W / 2 + 0.3, COURT.WALL_W / 2 - 0.3), y: 0.95, v: COURT.WALL_V };
    this.launch(makeFlight(a, b, flat ? 1.0 : 1.5, flat ? 0.7 : 1.9), 0, { flat, wall: true });
  }

  /** The shuttle is in the air: who will take it, and how well. */
  launch(f, team, { flat = false, fault = null, wall = false } = {}) {
    const r = this.rand;
    Object.assign(f, { team, flat, fault, wall, to: f.bv > 0 ? 0 : 1 });
    this.flight = f;
    this.wound = false;
    for (const p of this.players) p.plan = null;
    const M = this.marker;
    M.on = !wall && fault !== 'net'; M.u = f.bu; M.v = f.bv; M.dur = f.dur; M.tau = f.dur; M.out = fault === 'out';
    this.receiver = null;
    if (wall || fault === 'net') { M.mine = false; return; }
    let best = null, bd = 1e9;
    for (const p of this.players) {
      if (p.team !== f.to) continue;
      const d = Math.hypot(p.u - f.bu, p.v - f.bv) - (p.human ? 0.4 : 0);     // between the two, it is Mika's
      if (d < bd) { bd = d; best = p; }
    }
    this.receiver = best;
    M.mine = !!best?.human;
    if (best && !best.human && fault !== 'out') {
      const vsHuman = this.human && this.human.team !== best.team;
      // (kids playing among themselves keep it up longer: it is their game, and it should look like one)
      const miss = best.style.miss * (!this.human ? 0.6 : vsHuman ? this.L.miss * this.crowd : 1) + (flat ? 0.1 : 0);
      best.plan = { tau: 0.07 + r() * 0.12, late: r() < miss, wound: false };
    }
  }

  stepRally(dt, input) {
    const f = this.flight, sh = this.shuttle, h = this.human, M = this.marker;
    f.t += dt;
    const tau = f.dur - f.t;
    flightAt(f, Math.min(1, f.t / f.dur), sh);
    M.tau = Math.max(0, tau);
    // the kid whose shuttle it is runs under it and swings; everybody else gets back in place
    const rc = this.receiver;
    if (rc && !rc.human && rc.plan) {
      const pl = rc.plan;
      stepToward(rc, f.bu, f.bv, rc.style.speed * (pl.late ? 0.5 : 1.2), dt);
      if (!pl.late) {
        if (!pl.wound && tau <= pl.tau + WINDUP) { pl.wound = true; this.emit('windup', { who: rc.id }); }
        if (tau <= pl.tau && Math.hypot(rc.u - f.bu, rc.v - f.bv) <= AI_REACH) { this.aiKick(rc); return; }
      }
    }
    this.goHome(dt, rc);
    // Mika: anything coming down on her side is hers to try
    if (h && input.kick && h.cool <= 0 && f.to === h.team && !f.wall) {
      const d = Math.hypot(h.u - f.bu, h.v - f.bv), q = judge(tau, this.L);
      if (d <= this.L.reach && q !== 'early') { this.humanKick(h, q, input); return; }
      h.cool = 0.26; h.kickT = 0;
      this.emit('whiff', { who: h.id, why: d > this.L.reach ? 'far' : 'early' });
    }
    if (f.t >= f.dur) this.land(f);
  }

  humanKick(h, q, input) {
    const flat = q === 'perfect', sh = this.shuttle;
    h.kickT = 0;
    this.rally++; this.touches++;
    this.emit('kick', { who: h.id, human: true, quality: q, u: sh.u, y: sh.y, v: sh.v });
    const a = { u: sh.u, y: Math.max(KICK_Y, sh.y), v: sh.v };
    if (this.wall) {
      if (++this.streak >= 3) {
        this.streak = 0;
        this.score[0]++;
        this.emit('point', { team: 0, why: 'streak', score: this.score.slice(), rally: this.rally });
        if (this.won() !== null) {
          // that was the match: the last shuttle is left to fall
          this.best = Math.max(this.best, this.rally);
          this.flight = null; this.marker.on = false; this.shuttle.on = false;
          this.state = 'pause'; this.timer = 0.9;
          return;
        }
      }
      this.toWall(a, input, flat);
      return;
    }
    this.launch(makeFlight(a, this.aim(input, h, flat), flat ? 1.0 : 1.75, flat ? 0.5 : 3.1), h.team, { flat });
  }

  aiKick(p) {
    const r = this.rand, st = p.style, sh = this.shuttle, to = 1 - p.team, s = side(to), h = this.human;
    p.kickT = 0; p.plan = null;
    this.rally++;
    const toHumans = !!h && h.team === to;
    const x = r(), fault = x < st.net ? 'net' : x < st.net + st.out ? 'out' : null;
    const flat = r() < st.flat * (toHumans ? 1 - this.L.kind : 1);
    this.emit('kick', { who: p.id, quality: flat ? 'perfect' : 'ok', u: sh.u, y: sh.y, v: sh.v });
    const a = { u: sh.u, y: Math.max(KICK_Y, sh.y), v: sh.v };
    if (fault === 'net') {
      this.launch(makeFlight(a, { u: a.u + (r() - 0.5), y: COURT.NET * 0.55, v: -s * 0.12 }, 0.7, 0.35, { net: true }), p.team, { fault });
      return;
    }
    let b;
    if (fault === 'out') b = r() < 0.6 ? { u: (r() - 0.5) * 4, y: 0, v: s * (COURT.HALF + 0.9 + r() * 0.9) } : { u: (r() < 0.5 ? -1 : 1) * (COURT.W / 2 + 0.8 + r() * 0.6), y: 0, v: s * (1.5 + r() * 3) };
    else if (toHumans && r() < this.L.kind) b = { u: clamp(h.u + (r() - 0.5) * 3, -2.4, 2.4), y: 0, v: clamp(h.v + (r() - 0.5) * 2.4, 1.3, 4.8) };
    else if (st.aim === 'deep') b = { u: (r() - 0.5) * 4.6, y: 0, v: s * (3.9 + r()) };
    else if (st.aim === 'away') {
      // wherever the nearest opponent is not: the other side of the court, short or deep
      let o = null;
      for (const q of this.players) if (q.team === to && (!o || Math.abs(q.v) < Math.abs(o.v))) o = q;
      const uo = o ? o.u : 0;
      b = { u: (uo > 0 ? -1 : 1) * (1.3 + r() * 1.1), y: 0, v: s * (r() < 0.5 ? 1.7 + r() * 0.5 : 4.3 + r() * 0.6) };
    } else b = { u: (r() - 0.5) * 4.8, y: 0, v: s * (1.6 + r() * 3.3) };
    this.launch(makeFlight(a, b, (flat ? 1.05 : 1.75) * (toHumans ? this.L.slow : 1), flat ? 0.55 : 2.9 + r() * 0.6), p.team, { flat, fault });
  }

  land(f) {
    const sh = this.shuttle;
    if (f.wall) {
      // off the kick-board and back to Mika
      const r = this.rand, h = this.human;
      this.emit('wall', { u: f.bu, y: f.by, v: f.bv });
      const b = { u: clamp(h.u + (r() - 0.5) * 3.2, -2.4, 2.4), y: 0, v: clamp(h.v + (r() - 0.5) * 2.2, 1.4, 4.7) };
      this.launch(makeFlight({ u: f.bu, y: f.by, v: f.bv }, b, 1.7 * this.L.slow, 2.5), 1, {});
      return;
    }
    flightAt(f, 1, sh);
    this.emit('land', { u: f.bu, v: f.bv, fault: f.fault, side: f.to });
    this.point(f.fault ? 1 - f.team : f.team, f.fault || 'ground');
  }

  point(team, why) {
    this.score[team]++;
    this.best = Math.max(this.best, this.rally);
    this.emit('point', { team, why, score: this.score.slice(), rally: this.rally });
    this.rally = 0; this.streak = 0;
    this.flight = null; this.receiver = null;
    this.marker.on = false;
    for (const p of this.players) p.plan = null;
    this.state = 'pause';
    this.timer = POINT_PAUSE;
    this.server = this.wall ? this.human : this.pickServer(team);
  }

  /** The winning team, or null while the match is on. */
  won() { return this.score[0] >= this.target ? 0 : this.score[1] >= this.target ? 1 : null; }

  result() {
    const [a, b] = this.score, won = a >= this.target && a > b;
    const stars = won ? (b <= 1 ? 3 : 2) : a >= this.target - 2 && a > 0 ? 1 : 0;
    return { won, mine: a, theirs: b, score: a, rally: Math.max(this.best, this.rally), stars, touches: this.touches };
  }
}

/**
 * A stand-in for the player (tests and the QA autopilot): walks under her shuttles and kicks `at` seconds before
 * they land (0.12 = a perfect kick on every level; null = never kicks; a function (sim) => seconds for odd players).
 */
export function footnetBot(sim, at = 0.12) {
  const h = sim.human, out = { mx: 0, mv: 0, kick: false };
  if (!h) return out;
  if (sim.state === 'serve') { out.kick = at !== null && sim.server === h; return out; }
  const f = sim.flight;
  if (sim.state !== 'rally' || !f || f.to !== h.team || f.wall || at === null) return out;
  if (!sim.marker.mine || sim.marker.out) return out;
  const du = f.bu - h.u, dv = f.bv - h.v, d = Math.hypot(du, dv);
  if (d > 0.15) { out.mx = du / d; out.mv = dv / d; }
  const tau = f.dur - f.t, want = typeof at === 'function' ? at(sim) : at;
  out.kick = tau <= want && d <= sim.L.reach;
  return out;
}

export default {
  id: 'footnet',
  name: N_('Foot-tennis'),
  /** Who stands where: with three kids Mika gets a partner; with fewer she plays them alone; with none, the board. */
  teams(kids) {
    if (!kids.length) return { mine: [], theirs: [], wall: true };
    if (kids.length >= 3) return { mine: [kids[2]], theirs: [kids[0], kids[1]] };
    return { mine: [], theirs: kids.slice(0, 2) };
  },
  target: level => (level === 'first' ? 3 : 5),
  create: opts => new FootnetSim(opts),
  bot: footnetBot,
  focus: { u: 0, v: 0, w: COURT.W + 1.5, l: COURT.L + 1.5 },      // what the camera must show
};
