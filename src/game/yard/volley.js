// Volleyball (kid-sized: a 2.2 m net on Takamori Green). Two on a side, up to three touches a side: bump (receive),
// set, spike. A free ball may go over on the first or second touch; a good set and a well-timed third touch makes a
// fast steep spike. A partner kid does the set when Mika bumps. Rally scoring (a point every rally), the serve
// rotates inside a team, first to `target` (3 the first time). Pure, seeded (no three.js, no DOM): ./round.js shows it.
//
// Alone against nobody (wall: true) Mika keeps a ball going off the practice board: three returns in a row is a point.
import { COURT, LEVELS, STYLES, KICK_Y, WINDUP, HUMAN_SPEED, rng, clamp, judge, makeFlight, flightAt, stepToward } from './rules.js';
import { N_, tx } from '../../i18n/i18n.js';

export const NET_H = 2.2;
const SERVE_WAIT = 1.4, POINT_PAUSE = 1.8, AI_REACH = 1.4;
const side = team => (team === 0 ? 1 : -1);

/** Where a side's players stand: with two, a back player and a net player. */
export function volleyHomes(team, n) {
  const s = side(team);
  return n <= 1 ? [{ u: 0, v: s * 3.2 }] : [{ u: -1.4, v: s * 3.9 }, { u: 1.1, v: s * 1.9 }];
}

export class VolleySim {
  /** players: [{ id, team, style?, human?, u?, v? }]; level 'first' | 'easy' | 'normal'; wall: practice board. */
  constructor({ seed = 1, players = [], level = 'normal', target = 5, wall = false } = {}) {
    this.rand = rng(seed);
    this.L = LEVELS[level] || LEVELS.normal;
    this.level = level;
    this.target = target;
    this.wall = !!wall;
    this.players = [];
    for (const team of [0, 1]) {
      const list = players.filter(p => p.team === team), H = volleyHomes(team, list.length);
      list.forEach((p, i) => this.players.push({
        id: p.id, team, human: !!p.human, style: STYLES[p.style] || STYLES.steady, home: H[i],
        u: p.u ?? H[i].u, v: p.v ?? H[i].v, moving: false, kickT: 9, cool: 0, plan: null,
      }));
    }
    this.human = this.players.find(p => p.human) || null;
    this.score = [0, 0];
    this.state = 'serve';
    this.t = 0;
    this.timer = SERVE_WAIT + 0.5;
    this.serves = [0, 0];
    this.server = this.pickServer(this.human ? 0 : this.rand() < 0.5 ? 0 : 1);
    this.flight = null;
    this.receiver = null;
    this.touchN = 0;                         // touches the team in possession has had
    this.shuttle = { on: true, u: 0, y: 1, v: 0 };      // (the ball: the round runner draws every game's flier the same way)
    this.marker = { on: false, u: 0, v: 0, mine: false, out: false, tau: 0, dur: 1 };
    this.rally = 0; this.best = 0; this.streak = 0; this.touches = 0; this.spikes = 0;
    this.events = [];
    this.over = null;
    this.wound = false;
    this.hold = null;
  }

  pickServer(team) {
    const list = this.players.filter(p => p.team === team);
    return list.length ? list[this.serves[team]++ % list.length] : null;
  }
  teamOf(team) { return this.players.filter(p => p.team === team); }
  emit(type, o) { this.events.push({ type, ...o }); }
  get netH() { return NET_H; }

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
    if (input.pos) { h.moving = Math.hypot(input.pos.u - h.u, input.pos.v - h.v) > dt * 0.6; h.u = input.pos.u; h.v = input.pos.v; } else {
      const mx = input.mx || 0, mv = input.mv || 0, m = Math.hypot(mx, mv);
      h.moving = m > 0.05;
      if (m > 0.05) { const k = HUMAN_SPEED * dt / Math.max(1, m); h.u += mx * k; h.v += mv * k; }
    }
    h.u = clamp(h.u, -COURT.W / 2 - 0.8, COURT.W / 2 + 0.8);
    h.v = clamp(h.v, 0.45, COURT.HALF + 1.2);
  }

  /** Everyone but `busy` drifts to where they should be: home, or (the one who just passed) the attack spot. */
  goHome(dt, busy) {
    for (const p of this.players) {
      if (p.human || p === busy) continue;
      const t = p.attack || p.home;
      stepToward(p, t.u, t.v, p.style.speed * 0.8, dt);
    }
  }

  stepServe(dt, input) {
    const s = this.server, sh = this.shuttle;
    this.timer -= dt;
    this.goHome(dt, null);
    this.marker.on = false;
    if (!s) { this.state = 'over'; return; }
    sh.on = true; sh.u = s.u + 0.18; sh.v = s.v - side(s.team) * 0.25; sh.y = 1.0;
    if (s.human) { if (input.kick && this.timer <= SERVE_WAIT - 0.35) this.serve(s, input); return; }
    if (!this.wound && this.timer <= WINDUP) { this.wound = true; this.emit('windup', { who: s.id, kind: 'serve' }); }
    if (this.timer <= 0) this.serve(s, input);
  }

  serve(s, input) {
    const r = this.rand, to = 1 - s.team, toHumans = !!this.human && this.human.team === to;
    s.kickT = 0; this.rally = 1; this.streak = 0; this.touchN = 0;
    this.state = 'rally';
    for (const p of this.players) p.attack = null;
    this.emit('serve', { who: s.id, human: s.human });
    const a = { u: this.shuttle.u, y: 1.2, v: this.shuttle.v };
    if (s.human && this.wall) { this.toWall(a, input, false); return; }
    let b, fault = null;
    if (s.human) b = this.aim(input, s, false);
    else {
      const x = r();
      fault = x < s.style.net ? 'net' : x < s.style.net + s.style.out ? 'out' : null;
      b = toHumans ? { u: clamp(this.human.u + (r() - 0.5) * 2.4, -2.3, 2.3), y: 0, v: clamp(this.human.v + (r() - 0.5) * 1.6, 1.8, 4.6) } : { u: (r() - 0.5) * 3.6, y: 0, v: side(to) * (2.2 + r() * 2.2) };
      if (fault === 'out') b = { u: b.u, y: 0, v: side(to) * (COURT.HALF + 0.8 + r()) };
      if (fault === 'net') b = { u: a.u, y: NET_H * 0.5, v: -side(s.team) * 0.12 };
    }
    const f = makeFlight(a, b, (fault === 'net' ? 0.7 : 1.7) * (toHumans ? this.L.slow : 1), fault === 'net' ? 0.3 : 3.2, { netH: NET_H, net: fault === 'net' });
    this.launch(f, s.team, { kind: 'serve', fault, over: true });
  }

  /** Mika's aim: stick across = left / right; up the court = deep, back toward her = a short drop. */
  aim(input, h, flat) {
    const r = this.rand, mx = input.mx || 0, mv = input.mv || 0;
    const depth = mv < -0.3 ? 4.7 : mv > 0.3 ? 1.9 : 3.4 + r() * 0.6;
    return { u: clamp(mx * 2.3 + (r() - 0.5) * (flat ? 0.4 : 0.9), -2.5, 2.5), y: 0, v: -side(h.team) * depth };
  }

  toWall(a, input, flat) {
    const b = { u: clamp(a.u * 0.35 + (input.mx || 0) * 1.1, -COURT.WALL_W / 2 + 0.3, COURT.WALL_W / 2 - 0.3), y: 1.0, v: COURT.WALL_V };
    this.launch(makeFlight(a, b, flat ? 1.0 : 1.5, flat ? 0.7 : 1.9, { netH: 9 }), 0, { kind: 'bump', wall: true });
  }

  /**
   * The ball is in the air. meta: { kind, over (crosses the net), fault, wall, to (player who must hit it, for a pass) }.
   * A flight `over` the net is for the other side's nearest player; a pass is for the partner it names.
   */
  launch(f, team, { kind, fault = null, wall = false, over = false, to = null } = {}) {
    const r = this.rand;
    Object.assign(f, { team, kind, fault, wall, over, to: over ? 1 - team : team });
    this.flight = f;
    this.wound = false;
    for (const p of this.players) p.plan = null;
    const M = this.marker;
    M.on = !wall && fault !== 'net'; M.u = f.bu; M.v = f.bv; M.dur = f.dur; M.tau = f.dur; M.out = fault === 'out'; M.mine = false;
    this.receiver = null;
    if (over) { this.touchN = 0; }
    if (wall || fault === 'net') return;
    let best = to;
    if (!best) {
      let bd = 1e9;
      for (const p of this.players) {
        if (p.team !== f.to) continue;
        const d = Math.hypot(p.u - f.bu, p.v - f.bv) - (p.human ? 0.4 : 0);
        if (d < bd) { bd = d; best = p; }
      }
    }
    this.receiver = best;
    M.mine = !!best?.human;
    if (best && !best.human && fault !== 'out') {
      const vsHuman = !!this.human && this.human.team !== best.team;
      const alone = vsHuman && this.teamOf(this.human.team).length === 1;
      const miss = best.style.miss * (!this.human ? 0.6 : vsHuman ? this.L.miss * 0.6 * (alone ? 1.8 : 1) : 0.5) + (f.kind === 'spike' ? 0.18 : 0);
      best.plan = { tau: 0.07 + r() * 0.12, late: r() < miss, wound: false };
    }
    // whoever just passed goes to the net to attack the set (a kid; Mika is her own legs)
    if (kind === 'bump' || kind === 'set') for (const p of this.players) if (p.team === f.to && p !== best && !p.human) p.attack = kind === 'bump' ? { u: clamp(f.bu + (r() < 0.5 ? -1 : 1) * 1.3, -2.4, 2.4), v: side(f.to) * 2.4 } : null;
  }

  stepRally(dt, input) {
    const f = this.flight, sh = this.shuttle, h = this.human, M = this.marker;
    f.t += dt;
    const tau = f.dur - f.t;
    flightAt(f, Math.min(1, f.t / f.dur), sh);
    M.tau = Math.max(0, tau);
    const rc = this.receiver;
    if (rc && !rc.human && rc.plan) {
      const pl = rc.plan;
      stepToward(rc, f.bu, f.bv, rc.style.speed * (pl.late ? 0.5 : 1.25), dt);
      if (!pl.late) {
        if (!pl.wound && tau <= pl.tau + WINDUP) { pl.wound = true; this.emit('windup', { who: rc.id, kind: f.kind }); }
        if (tau <= pl.tau && Math.hypot(rc.u - f.bu, rc.v - f.bv) <= AI_REACH) { this.aiHit(rc); return; }
      }
    }
    this.goHome(dt, rc);
    // Mika: anything coming down to her is hers to try (her side: a serve, a bump of the partner's, a set)
    if (h && input.kick && h.cool <= 0 && !f.wall && this.receiver === h) {
      const d = Math.hypot(h.u - f.bu, h.v - f.bv), q = judge(tau, this.L);
      if (d <= this.L.reach && q !== 'early') { this.humanHit(h, q, input); return; }
      h.cool = 0.26; h.kickT = 0;
      this.emit('whiff', { who: h.id, why: d > this.L.reach ? 'far' : 'early' });
    }
    if (f.t >= f.dur) this.land(f);
  }

  /** Mika's touch. The touch number says what it is: bump, set or spike; the quality says how good. */
  humanHit(h, q, input) {
    const sh = this.shuttle, a = { u: sh.u, y: Math.max(KICK_Y + 0.4, sh.y), v: sh.v }, flat = q === 'perfect', n = ++this.touchN;
    h.kickT = 0; this.rally++; this.touches++;
    const mate = this.teamOf(h.team).find(p => p !== h);
    const kind = n === 1 ? 'bump' : n === 2 ? 'set' : 'spike';
    this.emit('kick', { who: h.id, human: true, quality: q, touch: n, kind, u: sh.u, y: sh.y, v: sh.v });
    h.attack = null;
    if (this.wall) {
      if (++this.streak >= 3) {
        this.streak = 0; this.score[0]++;
        this.emit('point', { team: 0, why: 'streak', score: this.score.slice(), rally: this.rally });
        if (this.won() !== null) { this.best = Math.max(this.best, this.rally); this.flight = null; this.marker.on = false; this.shuttle.on = false; this.state = 'pause'; this.timer = 0.9; return; }
      }
      this.toWall(a, input, flat);
      return;
    }
    const mv = input.mv || 0;
    const sendOver = !mate || n >= 3 || (n === 1 && mv < -0.6) || (n === 2 && mv < -0.6);
    if (!sendOver) {
      this.pass(h, mate, n === 1 ? 'bump' : 'set', q, a);
      return;
    }
    // over the net: a perfect third touch is the spike (fast and steep), anything else a lob over
    const spike = flat && n >= 2;
    if (spike) this.spikes++;
    const b = this.aim(input, h, flat);
    const up = { u: a.u, y: Math.max(a.y, spike ? 2.45 : a.y), v: a.v };
    this.launch(makeFlight(up, b, spike ? 0.7 : flat ? 1.1 : 1.8, spike ? 0.2 : flat ? 0.6 : 3.1, { netH: NET_H }), h.team, { kind: spike ? 'spike' : n === 1 ? 'pass' : 'lob', over: true });
  }

  /** A same-side pass to the partner: bump (to the setter) or set (to the hitter). */
  pass(p, mate, kind, q, a) {
    const r = this.rand, s = side(p.team), good = q === 'perfect' || (p.human ? q === 'ok' : r() < 0.78);
    let b;
    if (kind === 'bump') b = { u: clamp(mate.home.u * 0.5 + (r() - 0.5) * 0.9, -2, 2), y: 0, v: s * (1.5 + r() * 0.5) };
    else {
      // the set goes high and soft, in front of the hitter, close to the net so the spike can come down steep
      const hit = mate;
      b = { u: clamp(hit.u + (r() - 0.5) * 1.2, -2.3, 2.3), y: 0, v: s * (1.6 + r() * 0.5) };
    }
    const dur = kind === 'bump' ? (good ? 1.45 : 1.2) : (good ? 1.7 : 1.15), h = kind === 'bump' ? 2.4 : good ? 3.4 : 1.8;
    this.emit('pass', { who: p.id, kind, good });
    this.launch(makeFlight(a, b, dur * (this.human && mate.human ? this.L.slow : 1), h, { netH: NET_H }), p.team, { kind, to: mate, over: false });
    this.flight.good = good;
  }

  aiHit(p) {
    const r = this.rand, st = p.style, sh = this.shuttle, n = ++this.touchN, mate = this.teamOf(p.team).find(o => o !== p);
    p.kickT = 0; p.plan = null; p.attack = null; this.rally++;
    const flatQ = r() < st.flat;
    const kind = n === 1 ? 'bump' : n === 2 ? 'set' : 'spike';
    this.emit('kick', { who: p.id, quality: flatQ ? 'perfect' : 'ok', touch: n, kind, u: sh.u, y: sh.y, v: sh.v });
    const a = { u: sh.u, y: Math.max(KICK_Y + 0.4, sh.y), v: sh.v };
    // a pass to the partner (mostly), unless it is the third touch or nobody is there
    const toMate = mate && n < 3 && (n === 2 || r() < 0.82);
    if (toMate) { this.pass(p, mate, n === 1 ? 'bump' : 'set', flatQ ? 'perfect' : 'ok', a); return; }
    const to = 1 - p.team, s = side(to), h = this.human, toHumans = !!h && h.team === to;
    const x = r(), spike = n >= 2 && r() < st.spike, fault = x < st.net * (spike ? 2 : 1) ? 'net' : x < st.net * (spike ? 2 : 1) + st.out ? 'out' : null;
    if (spike) this.spikes++;
    const up = { u: a.u, y: spike ? 2.45 : a.y, v: a.v };
    if (fault === 'net') { this.launch(makeFlight(up, { u: a.u + (r() - 0.5), y: NET_H * 0.55, v: -side(p.team) * 0.12 }, 0.6, 0.3, { net: true, netH: NET_H }), p.team, { kind, fault, over: true }); return; }
    let b;
    if (fault === 'out') b = r() < 0.6 ? { u: (r() - 0.5) * 4, y: 0, v: s * (COURT.HALF + 0.9 + r() * 0.9) } : { u: (r() < 0.5 ? -1 : 1) * (COURT.W / 2 + 0.8 + r() * 0.6), y: 0, v: s * (1.5 + r() * 3) };
    else if (toHumans && r() < this.L.kind) b = { u: clamp(h.u + (r() - 0.5) * 3, -2.4, 2.4), y: 0, v: clamp(h.v + (r() - 0.5) * 2.4, 1.3, 4.8) };
    else if (spike || st.aim === 'deep') b = { u: (r() - 0.5) * 4.6, y: 0, v: s * (3.9 + r()) };
    else if (st.aim === 'away') {
      let o = null;
      for (const q of this.players) if (q.team === to && (!o || Math.abs(q.v) < Math.abs(o.v))) o = q;
      b = { u: ((o ? o.u : 0) > 0 ? -1 : 1) * (1.3 + r() * 1.1), y: 0, v: s * (r() < 0.5 ? 1.7 + r() * 0.5 : 4.3 + r() * 0.6) };
    } else b = { u: (r() - 0.5) * 4.8, y: 0, v: s * (1.6 + r() * 3.3) };
    const dur = spike ? 1.0 : flatQ ? 1.05 : 1.75, slow = toHumans ? this.L.slow * (spike ? 1.2 : 1) : 1;
    this.launch(makeFlight(up, b, dur * slow, spike ? 0.2 : flatQ ? 0.55 : 2.9 + r() * 0.6, { netH: NET_H }), p.team, { kind: spike ? 'spike' : n === 1 ? 'pass' : 'lob', fault, over: true });
  }

  land(f) {
    const sh = this.shuttle;
    if (f.wall) {
      const r = this.rand, h = this.human;
      this.emit('wall', { u: f.bu, y: f.by, v: f.bv });
      const b = { u: clamp(h.u + (r() - 0.5) * 3.2, -2.4, 2.4), y: 0, v: clamp(h.v + (r() - 0.5) * 2.2, 1.4, 4.7) };
      this.launch(makeFlight({ u: f.bu, y: f.by, v: f.bv }, b, 1.7 * this.L.slow, 2.5, { netH: 9 }), 1, { kind: 'pass', over: true });
      this.touchN = 0;
      return;
    }
    flightAt(f, 1, sh);
    this.emit('land', { u: f.bu, v: f.bv, fault: f.fault, side: f.to });
    // a ball that crossed and fell on its side is the sender's point; a pass nobody touched is the passer's loss
    if (f.fault) this.point(1 - f.team, f.fault);
    else this.point(f.over ? f.team : 1 - f.team, f.over ? 'ground' : 'dropped');
  }

  point(team, why) {
    this.score[team]++;
    this.best = Math.max(this.best, this.rally);
    this.emit('point', { team, why, score: this.score.slice(), rally: this.rally });
    this.rally = 0; this.streak = 0; this.touchN = 0;
    this.flight = null; this.receiver = null;
    this.marker.on = false;
    for (const p of this.players) { p.plan = null; p.attack = null; }
    this.state = 'pause';
    this.timer = POINT_PAUSE;
    this.server = this.wall ? this.human : this.pickServer(team);
  }

  won() { return this.score[0] >= this.target ? 0 : this.score[1] >= this.target ? 1 : null; }

  result() {
    const [a, b] = this.score, won = a >= this.target && a > b;
    const stars = won ? (b <= 1 ? 3 : 2) : a >= this.target - 2 && a > 0 ? 1 : 0;
    return { won, mine: a, theirs: b, score: a, rally: Math.max(this.best, this.rally), stars, touches: this.touches, spikes: this.spikes };
  }

  hud(names) { return { l: names.mine, big: `${this.score[0]} : ${this.score[1]}`, r: names.theirs, sub: this.wall ? tx('Three in a row: a point') : tx('First to {n}', { n: this.target }) }; }
  hint() {
    if (this.state === 'serve' && this.server === this.human) return tx('Press {act} to serve');
    const f = this.flight, h = this.human;
    if (this.state !== 'rally' || !f || !h || this.receiver !== h) return null;
    return f.kind === 'set' ? tx('Spike! Press {act} just as it comes down') : f.kind === 'bump' ? tx('Set it up: press {act} as it comes down') : null;
  }
}

/** A stand-in for the player (tests and the QA autopilot): runs under her balls and hits `at` seconds before they land. */
export function volleyBot(sim, at = 0.12) {
  const h = sim.human, out = { mx: 0, mv: 0, kick: false };
  if (!h) return out;
  if (sim.state === 'serve') { out.kick = at !== null && sim.server === h; return out; }
  const f = sim.flight;
  if (sim.state !== 'rally' || !f || sim.receiver !== h || f.wall || at === null) return out;
  if (!sim.marker.mine || sim.marker.out) return out;
  const du = f.bu - h.u, dv = f.bv - h.v, d = Math.hypot(du, dv);
  if (d > 0.15) { out.mx = du / d; out.mv = dv / d; }
  const tau = f.dur - f.t, want = typeof at === 'function' ? at(sim) : at;
  out.kick = tau <= want && d <= sim.L.reach;
  // up the court on the third touch (or when there is no partner), so she attacks
  if (out.kick && (sim.touchN >= 2 || !sim.teamOf(h.team).some(p => p !== h))) { out.mv = -1; out.mx = 0; }
  return out;
}

export default {
  id: 'volley',
  name: N_('Volleyball'),
  look: 'ball',
  moves: true,
  sideOk: true,
  /** Mika plus a partner against two kids; fewer kids: Mika alone against them; nobody: the practice board. */
  teams(kids) {
    if (!kids.length) return { mine: [], theirs: [], wall: true };
    if (kids.length >= 3) return { mine: [kids[2]], theirs: [kids[0], kids[1]] };
    return { mine: [], theirs: kids.slice(0, 2) };
  },
  target: level => (level === 'first' ? 3 : 5),
  create: opts => new VolleySim(opts),
  bot: volleyBot,
  focus: { u: 0, v: 0, w: COURT.W + 1.5, l: COURT.L + 1.5 },
  /** The kids on their own: two against two with four, one against one with two, three: one sits out. */
  roles(ids, round = 0, loser = null) {
    if (ids.length < 2) return { game: 'keepup', play: ids.slice(), watch: [] };
    if (ids.length >= 4) return { game: 'volley', play: ids.slice(0, 4), watch: ids.slice(4) };
    if (ids.length === 2) return { game: 'volley', play: ids.slice(), watch: [] };
    let bench = ids[round % 3];
    if (loser && ids.includes(loser)) bench = loser;
    return { game: 'volley', play: ids.filter(i => i !== bench), watch: [bench] };
  },
  ambientTeam: (play, i) => (play.length === 2 ? i : i % 2),
  card(res, rec, names, newBest) {
    return {
      verdict: res.won ? tx('You win!') : tx('The kids win this one'), good: res.won,
      score: `${names.mine} ${res.mine} : ${res.theirs} ${names.theirs}`,
      best: tx('Wins: {n} · Longest rally: {m}', { n: rec.wins, m: rec.rally }),
    };
  },
};
