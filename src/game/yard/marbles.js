// Marbles (bắn bi, ビー玉): a chalk ring on bare dirt, coloured marbles in the middle. Take turns flicking the shooter
// at them to knock them out of the ring; the marbles you knock out are yours. Aim at a marble (tap it, or the arrow keys
// move the cross-hair), hold the button to charge the flick and let go to shoot. Four shots each: the first to four
// marbles, or the most after eight shots, wins. A pure, deterministic 2D physics module (circles, elastic bounces,
// friction) so a recorded game replays exactly; no three.js, no DOM. ./round.js shows it.
//
// The levels (the kids' own game is the plain one):
//   first   four shots each, first to four of the eight, a flick that carries further (the guided first game)
//   easy    five shots each, first to five of the eight
//   normal  six shots each, and in the middle of the flower sits the big TOR: heavy, hard to shift, worth two. First
//           to six points of the ten.
//   hard    six shots each, the tor, and COLOURS: the four red marbles are Mika's, the four blue ones the kid's. A
//           marble knocked out goes to whoever's colour it is, whoever shot, so a careless shot scores for the other
//           side. The tor goes to the one who knocks it out. First to five (it cannot be done without the tor).
import { rng, clamp, stepToward } from './rules.js';
import { N_, tx } from '../../i18n/i18n.js';

export const RING = 0.9;               // radius of the chalk ring (metres)
export const R_MARBLE = 0.065, R_SHOOTER = 0.085;
export const SHOTS = 4, WIN_AT = 4;
export const R_TOR = 0.095, M_TOR = 2.2, TOR_COLOUR = 6;
/** Per level: shots each, points that win at once, how far Mika's flick carries, the kids' aim error, the tor, the colours. */
export const MARBLES_LEVEL = {
  first: { shots: SHOTS, win: WIN_AT, flick: 1.22, skill: 0.1 },
  easy: { shots: 5, win: 5, flick: 1.1, skill: 0.07 },
  normal: { shots: 6, win: 6, flick: 1, skill: 0.035, tor: true },
  hard: { shots: 6, win: 5, flick: 1, skill: 0.03, tor: true, sides: true },
};
const FRICTION = 2.4, ROLL = 0.35, REST = 0.92, V_MIN = 0.03, STEP = 1 / 240, MAXV = 6.2, V_BASE = 2.4, V_POW = 3.6;

/** The start: eight marbles clustered in the middle (a flower of seven and one more beside it). */
export function setup(seed = 1, { tor = false, sides = false } = {}) {
  const rand = rng(seed), out = [];
  const spot = [[0, 0], ...[0, 1, 2, 3, 4, 5].map(i => [Math.cos(i * Math.PI / 3 + 0.3) * 0.17, Math.sin(i * Math.PI / 3 + 0.3) * 0.17]), [0.4, -0.1]];
  spot.forEach(([x, y], i) => out.push({ id: i, u: x, v: y, vu: 0, vv: 0, r: R_MARBLE, c: i % 6, out: false, owner: -1, roll: 0, rot: rand() * 6.28 }));
  if (tor) {
    // the tor takes the middle of the flower (the petals stand a little wider for it); the marble that was there lies apart
    const mid = out[0];
    Object.assign(mid, { u: -0.4, v: 0.1 });
    for (let i = 1; i <= 6; i++) { out[i].u *= 1.02; out[i].v *= 1.02; }
    out.push({ id: 8, u: 0, v: 0, vu: 0, vv: 0, r: R_TOR, m: M_TOR, c: TOR_COLOUR, tor: true, out: false, owner: -1, roll: 0, rot: rand() * 6.28 });
  }
  // colours: round the flower red, blue, red, blue; the two that lie apart are one of each
  if (sides) for (const b of out) if (!b.tor) { b.side = b.id % 2; b.c = b.side; }
  return out;
}

/** One physics step over circles: friction, then pairwise elastic collisions. Returns the loudest bump (0 if none). */
export function stepBalls(balls, dt) {
  let bump = 0;
  for (const b of balls) {
    if (b.out && b.rest) continue;
    const sp = Math.hypot(b.vu, b.vv);
    if (sp > 0) {
      const ns = Math.max(0, sp * Math.exp(-FRICTION * dt) - ROLL * dt);
      const k = ns / sp;
      b.vu *= k; b.vv *= k;
      if (ns < V_MIN) { b.vu = 0; b.vv = 0; }
    }
    b.u += b.vu * dt; b.v += b.vv * dt;
    b.roll += Math.hypot(b.vu, b.vv) * dt / b.r;
  }
  for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
    const a = balls[i], b = balls[j];
    if (a.rest && b.rest) continue;
    const dx = b.u - a.u, dv = b.v - a.v, d = Math.hypot(dx, dv), min = a.r + b.r;
    if (d >= min || d < 1e-9) continue;
    const nx = dx / d, ny = dv / d, ma = a.m || 1, mb = b.m || 1;
    // push apart in proportion to the other's mass, then exchange the normal velocity (elastic with a little loss)
    const over = min - d;
    a.u -= nx * over * mb / (ma + mb); a.v -= ny * over * mb / (ma + mb);
    b.u += nx * over * ma / (ma + mb); b.v += ny * over * ma / (ma + mb);
    const rv = (b.vu - a.vu) * nx + (b.vv - a.vv) * ny;
    if (rv >= 0) continue;
    const imp = -(1 + REST) * rv / (1 / ma + 1 / mb);
    a.vu -= imp * nx / ma; a.vv -= imp * ny / ma;
    b.vu += imp * nx / mb; b.vv += imp * ny / mb;
    bump = Math.max(bump, -rv);
  }
  return bump;
}

export class MarblesSim {
  /** players: [{ id, human?, style? }] (two). */
  constructor({ seed = 1, players = [], level = 'normal' } = {}) {
    this.rand = rng(seed);
    this.level = level;
    this.players = players.slice(0, 2).map((p, i) => ({ id: p.id, team: i, human: !!p.human, style: p.style || 'steady', u: 0, v: 0, moving: false, kickT: 9, lean: 0, shots: 0, won: 0 }));
    // the two players crouch either side of the ring: Mika on the near side
    const hi = this.players.findIndex(p => p.human), first = hi < 0 ? 0 : hi;
    this.players.forEach((p, i) => { const near = i === first; p.u = near ? 1.4 : -1.4; p.v = near ? 1.15 : -1.15; });
    this.human = this.players.find(p => p.human) || null;
    // (the kids' own game is the plain one: eight marbles, four shots)
    const K = this.K = this.human ? MARBLES_LEVEL[level] || MARBLES_LEVEL.normal : { ...MARBLES_LEVEL.first, skill: (MARBLES_LEVEL[level] || MARBLES_LEVEL.normal).skill };
    this.shots = K.shots; this.winAt = K.win;
    this.sides = !!K.sides;                // colours: a marble out goes to its colour's owner (player 0 red, player 1 blue)
    this.gifts = 0;                        // marbles Mika knocked out for the other side
    this.balls = setup(seed, K);
    this.shooter = { id: 99, u: 0, v: RING, vu: 0, vv: 0, r: R_SHOOTER, m: 1.6, c: -1, out: false, owner: -1, roll: 0, rot: 0, rest: true, live: false };
    this.turn = first;                     // whose shot it is
    this.state = 'aim';
    this.timer = 1.4;
    this.aim = { u: 0, v: -0.1 };          // the cross-hair (stage space)
    this.power = 0; this.charging = false; this.dirUp = 1;
    this.t = 0;
    this.score = [0, 0];
    this.events = [];
    this.over = null;
    this.shuttle = { on: false, u: 0, y: 0, v: 0 };
    this.marker = { on: false, u: 0, v: 0, mine: false, out: false, tau: 1, dur: 1 };
    this.skill = K.skill;                  // the kids' aim error (radians) at best
    this.start();
  }

  emit(type, o) { this.events.push({ type, ...o }); }
  get cur() { return this.players[this.turn]; }
  /** Where the shooter starts for a cross-hair: the rim point opposite it (the near rim when it is in the middle). */
  startFor(aim, turn = this.turn) {
    const near = this.players[turn] === this.players.find(p => p.v > 0) ? 1 : -1;
    const l = Math.hypot(aim.u, aim.v);
    if (l < 0.12) return { u: 0, v: near * RING };
    return { u: -aim.u / l * RING, v: -aim.v / l * RING };
  }
  start() {
    const p = this.cur, s = this.startFor(this.aim);
    Object.assign(this.shooter, { u: s.u, v: s.v, vu: 0, vv: 0, rest: true, live: false });
    this.power = 0; this.charging = false;
    p.moving = false;
    this.state = 'aim'; this.timer = p.human ? Infinity : 1.2 + this.rand() * 0.5;
    this.plan = null;
    if (!p.human) this.plan = this.think(p);
    else this.aim = { u: 0, v: -0.1 * Math.sign(p.v || 1) };
    this.emit('turn', { who: p.id, human: p.human, shot: p.shots + 1 });
  }

  /** The kid picks a marble that can be knocked clear, stands opposite it and flicks. */
  think(p) {
    const r = this.rand, all = this.balls.filter(b => !b.out), own = this.sides ? all.filter(b => b.tor || b.side === this.turn) : all;
    const live = own.length ? own : all;       // (with colours: their own and the tor; nothing of theirs left: any)
    if (!live.length) return null;
    // the one closest to the rim in the direction it can be pushed: the largest radial offset
    let best = null, bs = -1e9;
    for (const b of live) { const sc = Math.hypot(b.u, b.v) + r() * 0.12; if (sc > bs) { bs = sc; best = b; } }
    const ang = Math.atan2(best.v, best.u) + (r() - 0.5) * 2 * this.skill * (p.style === 'wobbly' ? 3 : p.style === 'never' ? 0.5 : 1.3);
    const st = Math.hypot(best.u, best.v) < 0.12 ? { u: 0, v: -Math.sign(p.v) * RING } : { u: -Math.cos(ang) * RING, v: -Math.sin(ang) * RING };
    const dx = best.u - st.u, dy = best.v - st.v, d = Math.hypot(dx, dy);
    const dir = Math.atan2(dy, dx) + (r() - 0.5) * 2 * this.skill;
    const v0 = clamp(d * FRICTION * 1.05 + 0.7 + (r() - 0.5) * 1.0, 2.5, 5.9);
    return { st, dir, power: clamp((v0 - V_BASE) / V_POW, 0.05, 1), aim: { u: best.u, v: best.v } };
  }

  step(dt, input = {}) {
    this.t += dt;
    for (const p of this.players) { p.kickT += dt; p.lean *= Math.exp(-dt * 5); }
    if (this.state === 'over') return this;
    const p = this.cur;
    if (this.state === 'aim') {
      if (p.human) this.humanAim(dt, input);
      else {
        this.timer -= dt;
        const pl = this.plan;
        if (pl) { this.aim.u += (pl.aim.u - this.aim.u) * Math.min(1, dt * 5); this.aim.v += (pl.aim.v - this.aim.v) * Math.min(1, dt * 5); Object.assign(this.shooter, { u: pl.st.u, v: pl.st.v }); }
        if (this.timer <= 0) { if (pl) this.fire(Math.cos(pl.dir) * (V_BASE + V_POW * pl.power), Math.sin(pl.dir) * (V_BASE + V_POW * pl.power)); else this.finish(); }
      }
    } else if (this.state === 'roll') {
      let left = dt, bump = 0;
      while (left > 1e-9) { const h = Math.min(STEP, left); bump = Math.max(bump, this.physics(h)); left -= h; }
      if (bump > 0.25) this.emit('click', { strength: Math.min(1, bump / 3) });
      if (this.settled()) this.settle();
    } else if (this.state === 'pause') {
      this.timer -= dt;
      if (this.timer <= 0) this.next();
    }
    return this;
  }

  humanAim(dt, input) {
    const a = this.aim, sp = 1.5;
    if (input.aimU !== undefined && input.aimU !== null) { a.u = input.aimU; a.v = input.aimV; }
    a.u = clamp(a.u + (input.mx || 0) * sp * dt, -RING, RING);
    a.v = clamp(a.v + (input.mv || 0) * sp * dt, -RING, RING);
    const s = this.startFor(a);
    Object.assign(this.shooter, { u: s.u, v: s.v });
    // hold to charge (it swings up and down while held), let go to flick
    if (input.hold) {
      if (!this.charging) { this.charging = true; this.power = 0; this.dirUp = 1; this.emit('charge', {}); }
      this.power += this.dirUp * dt * 0.95;
      if (this.power >= 1) { this.power = 1; this.dirUp = -1; } else if (this.power <= 0) { this.power = 0; this.dirUp = 1; }
    } else if (this.charging) {
      const pw = Math.max(0.12, this.power), l = Math.hypot(a.u - s.u, a.v - s.v) || 1, v0 = (V_BASE + V_POW * pw) * this.K.flick;   // a gentler first game: the flick carries further
      this.charging = false;
      this.fire((a.u - s.u) / l * v0, (a.v - s.v) / l * v0);
    }
  }

  fire(vu, vv) {
    const p = this.cur, S = this.shooter;
    S.vu = vu; S.vv = vv; S.rest = false; S.live = true;
    const sp = Math.hypot(vu, vv); if (sp > MAXV) { S.vu *= MAXV / sp; S.vv *= MAXV / sp; }
    p.shots++; p.kickT = 0; p.lean = 1;
    this.state = 'roll'; this.charging = false; this.rolling = 0;
    this.emit('shoot', { who: p.id, human: p.human, power: Math.hypot(S.vu, S.vv) / MAXV });
  }

  physics(h) {
    const all = [this.shooter, ...this.balls.filter(b => !b.out)];
    for (const b of all) b.rest = false;
    const bump = stepBalls(all, h);
    this.rolling += h;
    return bump;
  }
  settled() {
    if (this.rolling > 9) return true;
    for (const b of [this.shooter, ...this.balls]) if (!b.out && Math.hypot(b.vu, b.vv) > 0) return false;
    return true;
  }

  /** Everything has stopped: marbles outside the ring are the shooter's. */
  settle() {
    const p = this.cur;
    let got = 0;
    for (const b of this.balls) {
      if (b.out) continue;
      if (Math.hypot(b.u, b.v) > RING + 0.01) {
        // whose it is: the shooter's, or (with colours) whoever's colour it is; the tor is the shooter's and counts two
        const to = this.sides && !b.tor ? b.side : this.turn, q = this.players[to] || p, n = b.tor ? 2 : 1, gift = q !== p;
        b.out = true; b.owner = to; b.rest = true; q.won += n;
        if (!gift) got += n; else if (p.human) this.gifts++;
        this.emit('out', { who: q.id, human: q.human, id: b.id, u: b.u, v: b.v, tor: !!b.tor, gift, by: p.id });
      }
    }
    this.score = this.players.map(q => q.won);
    this.shooter.live = false; this.shooter.rest = true;
    this.emit('shotdone', { who: p.id, got });
    this.state = 'pause'; this.timer = got ? 1.6 : 1.2;
  }

  next() {
    const live = this.balls.filter(b => !b.out).length;
    const done = this.players.some(q => q.won >= this.winAt) || this.players.every(q => q.shots >= this.shots) || !live;
    if (done) { this.finish(); return; }
    this.turn = (this.turn + 1) % this.players.length;
    if (this.cur.shots >= this.shots) this.turn = (this.turn + 1) % this.players.length;
    this.start();
  }

  finish() {
    this.state = 'over';
    this.over = this.result();
    this.emit('over', this.over);
  }

  result() {
    const h = this.human || this.players[0], o = this.players.find(q => q !== h) || { won: 0 };
    const won = h.won > o.won, tie = h.won === o.won;
    // stars. first, easy: a win is two, three with five marbles or a shut-out; a draw or two marbles earn one.
    // normal: a win is two, three when she reached the six points; a draw or three points earn one.
    // hard: a win is two, three with five points and at most one marble knocked out for the other side; a draw or three points earn one.
    const lv = this.human ? this.level : 'first';
    const stars = lv === 'normal' ? (won ? (h.won >= this.winAt ? 3 : 2) : tie || h.won >= 3 ? 1 : 0)
      : lv === 'hard' ? (won ? (h.won >= this.winAt && this.gifts <= 1 ? 3 : 2) : tie || h.won >= 3 ? 1 : 0)
        : won ? (h.won >= 5 || o.won === 0 ? 3 : 2) : tie || h.won >= 2 ? 1 : 0;
    return { won, tie, mine: h.won, theirs: o.won, score: h.won, rally: h.won, stars, gain: h.won, touches: h.shots, gifts: this.gifts };
  }

  hud(names) {
    const h = this.human || this.players[0];
    return { l: names.mine, big: `${this.score[0] ?? 0} : ${this.score[1] ?? 0}`, r: names.theirs, sub: tx('Shot {n} of {m}', { n: Math.min(this.shots, h.shots + (this.state === 'aim' && this.cur === h ? 1 : 0)), m: this.shots }) };
  }
  hint() {
    if (this.state === 'aim' && this.cur.human) {
      if (this.charging) return tx('Let go to flick!');
      // before her first shot the level's own rule is said once
      if (!this.cur.shots && this.sides) return tx('The red marbles are yours, the blue ones are your friend\'s. The big one counts two.');
      if (!this.cur.shots && this.K.tor) return tx('The big marble in the middle counts two.');
      return tx('Aim at a marble, then hold {act} and let go to flick');
    }
    return null;
  }
}

/** A stand-in for the player: aims at the marble nearest the rim, charges for `power`, releases. */
export function marblesBot(sim, power = 0.55) {
  const out = { mx: 0, mv: 0, kick: false, hold: false };
  if (sim.state !== 'aim' || !sim.human || sim.cur !== sim.human || power === null) return out;
  // (with colours she goes for her own and the tor; sim.botSides = false: a player who shoots at whatever is nearest the rim)
  const all = sim.balls.filter(b => !b.out), own = sim.sides && sim.botSides !== false ? all.filter(b => b.tor || b.side === 0) : all;
  const live = own.length ? own : all;
  if (!live.length) return out;
  let best = live[0];
  for (const b of live) if (Math.hypot(b.u, b.v) > Math.hypot(best.u, best.v)) best = b;
  out.aimU = best.u; out.aimV = best.v;
  const want = typeof power === 'function' ? power(sim) : power;
  out.hold = !sim.charging || sim.power < want;
  if (sim.charging && sim.power >= want) out.hold = false;
  return out;
}

export default {
  id: 'marbles',
  name: N_('Marbles'),
  look: 'marbles',
  moves: false,
  /** Mika against one kid (the best kid out of doors). */
  teams(kids) { return { mine: [], theirs: kids.slice(0, 1) }; },
  target: level => (MARBLES_LEVEL[level] || MARBLES_LEVEL.normal).win,
  create: opts => new MarblesSim({ ...opts, players: [...opts.players].sort((a, b) => (b.human ? 1 : 0) - (a.human ? 1 : 0)).slice(0, 2) }),
  bot: marblesBot,
  // close on the ring: nobody stands in the picture (see `still`). On a wide screen the ring stays between the hint line
  // at the top and the "Hold to flick" button at the bottom; a phone held upright has the room of its own framing.
  focus: { u: 0, v: 0, w: 2.2, l: 2.2, pitch: 62, h: 0.3, top: 0.58, bottom: -0.62 },
  tall: { top: 0.74, bottom: -0.56 },
  // focus mode (engine/focus.js, round.js enterStill): the yard is a soft still picture, the ring is a mat on the ground,
  // nobody is drawn; only the marbles, the shooter and the aim line are live
  still: { backdrop: 'blur', sim: 'all', mat: true },
  roles(ids) {
    if (ids.length < 2) return { game: 'keepup', play: ids.slice(), watch: [] };
    return { game: 'marbles', play: ids.slice(0, 2), watch: ids.slice(2) };
  },
  ambientTeam: (play, i) => i,
  card(res, rec, names) {
    return {
      verdict: res.won ? tx('You win the marbles!') : res.tie ? tx('A draw: you keep your own') : tx('The kid wins this one'), good: res.won,
      score: `${names.mine} ${res.mine} : ${res.theirs} ${names.theirs}`,
      best: tx('Marbles won: {n} · Collected: {m}', { n: res.mine, m: rec.total || 0 }),
    };
  },
};
