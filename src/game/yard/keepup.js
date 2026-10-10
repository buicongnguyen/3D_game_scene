// Keep it up: everybody stands in a ring on the near half of the court and keeps the shuttlecock in the air, kicking
// it from one to the next; the touches in a row are counted. Alone, Mika (or a kid) juggles it from foot to foot.
// A round lasts `time` seconds, or until Mika has let it fall three times; a kid's drop only breaks the count. The
// score is the longest run of touches.
// Pure and seeded like ./footnet.js (same step / events / result shape, so the yard's round runner shows either).
import { COURT, LEVELS, STYLES, KICK_Y, WINDUP, HUMAN_SPEED, rng, clamp, judge, makeFlight, flightAt, stepToward, starsFor } from './rules.js';
import { N_ } from '../../i18n/i18n.js';

export const RING = { u: 0, v: 2.9, r: 2.0 };       // the ring's middle (court space) and radius
export const KEEPUP_STARS = [6, 12, 24];
const SERVE_WAIT = 1.2, DROP_PAUSE = 1.5, AI_REACH = 1.2, MAX = 60;

/** Where n players stand: on the ring, the first one nearest the camera. */
export function ringPlaces(n) {
  if (n <= 1) return [{ u: RING.u, v: RING.v }];
  return Array.from({ length: n }, (_, i) => {
    const a = Math.PI / 2 + i * Math.PI * 2 / n;                 // +v (toward the camera) first
    return { u: RING.u + Math.cos(a) * RING.r, v: RING.v + Math.sin(a) * RING.r };
  });
}

export class KeepupSim {
  /** players: [{ id, style?, human?, u?, v? }]; the human (if any) takes the place nearest the camera. lives: Mika's drops allowed. */
  constructor({ seed = 1, players = [], level = 'normal', lives = 3, time = 60 } = {}) {
    this.rand = rng(seed);
    this.L = LEVELS[level] || LEVELS.normal;
    this.level = level;
    const list = [...players].sort((a, b) => (b.human ? 1 : 0) - (a.human ? 1 : 0));
    const P = ringPlaces(list.length);
    this.players = list.map((p, i) => ({
      id: p.id, team: 0, human: !!p.human, style: STYLES[p.style] || STYLES.steady, home: P[i],
      u: p.u ?? P[i].u, v: p.v ?? P[i].v, moving: false, kickT: 9, cool: 0, plan: null,
    }));
    this.human = this.players.find(p => p.human) || null;
    this.solo = this.players.length === 1;
    this.lives = lives;
    this.timeLeft = this.human ? time : Infinity;      // the kids' own game has no clock
    this.count = 0;                // touches in a row now
    this.best = 0;
    this.touches = 0;              // Mika's own touches
    this.score = [0, 0];           // [best, count]: the same shape the scoreboard shows for the other game
    this.state = 'serve';
    this.t = 0;
    this.timer = SERVE_WAIT + 0.5;
    this.server = this.human || this.players[0] || null;
    this.flight = null;
    this.receiver = null;
    this.shuttle = { on: true, u: 0, y: 1, v: 0 };
    this.marker = { on: false, u: 0, v: 0, mine: false, out: false, tau: 0, dur: 1 };
    this.events = [];
    this.over = null;
    this.wound = false;
  }

  emit(type, o) { this.events.push({ type, ...o }); }

  step(dt, input = {}) {
    this.t += dt;
    const h = this.human;
    for (const p of this.players) { p.kickT += dt; p.cool -= dt; }
    if (h) this.moveHuman(h, dt, input);
    // the clock runs while the shuttle is in the air; at zero the round is over where it stands
    if (this.state === 'rally' && (this.timeLeft -= dt) <= 0) {
      this.timeLeft = 0;
      this.flight = null; this.receiver = null; this.marker.on = false; this.shuttle.on = false;
      this.emit('time', {});
      this.state = 'pause'; this.timer = 0.8;
    }
    if (this.state === 'serve') this.stepServe(dt, input);
    else if (this.state === 'rally') this.stepRally(dt, input);
    else if (this.state === 'pause') {
      this.timer -= dt;
      this.goHome(dt, null);
      if (this.timer <= 0) {
        if (this.lives <= 0 || this.best >= MAX || this.timeLeft <= 0) { this.state = 'over'; this.over = this.result(); this.emit('over', this.over); } else { this.state = 'serve'; this.timer = SERVE_WAIT; this.wound = false; this.shuttle.on = true; }
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

  goHome(dt, busy) {
    for (const p of this.players) {
      if (p.human || p === busy) continue;
      stepToward(p, p.home.u, p.home.v, p.style.speed * 0.6, dt);
    }
  }

  stepServe(dt, input) {
    const s = this.server, sh = this.shuttle;
    this.timer -= dt;
    this.goHome(dt, null);
    this.marker.on = false;
    if (!s) { this.state = 'over'; return; }
    sh.on = true; sh.u = s.u + 0.18; sh.v = s.v - 0.2; sh.y = 0.85;
    if (s.human) { if (input.kick && this.timer <= SERVE_WAIT - 0.35) this.kick(s, 'ok', input, true); return; }
    if (!this.wound && this.timer <= WINDUP) { this.wound = true; this.emit('windup', { who: s.id }); }
    if (this.timer <= 0) this.kick(s, 'ok', input, true);
  }

  /** Whoever kicks sends it up toward somebody (or back over their own head when alone). */
  kick(p, q, input, serve = false) {
    const r = this.rand, sh = this.shuttle, clean = q === 'perfect';
    p.kickT = 0; p.plan = null;
    if (serve) { this.count = 1; this.state = 'rally'; this.emit('serve', { who: p.id, human: p.human }); }
    else {
      this.count++;
      this.emit('kick', { who: p.id, human: p.human, quality: q, u: sh.u, y: sh.y, v: sh.v });
    }
    if (p.human) this.touches++;
    this.best = Math.max(this.best, this.count);
    this.score[0] = this.best; this.score[1] = this.count;
    // the longer it stays up, the quicker and the wider the passes
    const heat = Math.min(1, this.count / 30);
    const a = { u: sh.u, y: Math.max(KICK_Y, sh.y), v: sh.v };
    let to = p, b;
    if (this.solo) {
      const mx = p.human ? input.mx || 0 : 0, mv = p.human ? input.mv || 0 : 0;
      const d = (clean ? 0.5 : 1.0) + r() * (0.5 + heat * 0.7), ang = r() * Math.PI * 2;
      const aimed = Math.hypot(mx, mv) > 0.3;
      b = { u: p.u + (aimed ? mx * d : Math.cos(ang) * d), y: 0, v: p.v + (aimed ? mv * d : Math.sin(ang) * d) };
      // keep it on the half court, away from the net
      b.u = clamp(b.u, -COURT.W / 2 + 0.4, COURT.W / 2 - 0.4); b.v = clamp(b.v, 1.0, COURT.HALF - 0.3);
    } else {
      const others = this.players.filter(o => o !== p);
      const h = this.human;
      if (p.human && Math.hypot(input.mx || 0, input.mv || 0) > 0.3) {
        // Mika picks who gets it with the stick
        let bd = -9;
        for (const o of others) { const du = o.u - p.u, dv = o.v - p.v, d = Math.hypot(du, dv) || 1, dot = (du * input.mx + dv * input.mv) / d; if (dot > bd) { bd = dot; to = o; } }
      } else if (h && !p.human && (others.length === 1 || r() < 0.55)) to = h;
      else { const rest = others.filter(o => !o.human || others.length === 1); to = rest[Math.floor(r() * rest.length)] || others[0]; }
      const off = (clean ? 0.25 : 0.55) + heat * 0.7, ang = r() * Math.PI * 2;
      b = { u: to.home.u + Math.cos(ang) * off * r(), y: 0, v: Math.max(0.9, to.home.v + Math.sin(ang) * off * r()) };
    }
    const toHuman = to.human;
    const f = makeFlight(a, b, (1.6 - heat * 0.35) * (toHuman ? this.L.slow : 1), 2.7 - heat * 0.4);
    Object.assign(f, { team: 0, to: 0, flat: false, fault: null, wall: false });
    this.flight = f;
    this.receiver = to;
    this.wound = false;
    const M = this.marker;
    M.on = true; M.u = b.u; M.v = b.v; M.dur = f.dur; M.tau = f.dur; M.mine = !!toHuman; M.out = false;
    for (const o of this.players) o.plan = null;
    if (!to.human) {
      const miss = to.style.miss * 0.45 * (clean ? 0.5 : 1) + heat * 0.05;
      to.plan = { tau: 0.07 + r() * 0.12, late: r() < miss, wound: false };
    }
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
      stepToward(rc, f.bu, f.bv, rc.style.speed * (pl.late ? 0.4 : 1.1), dt);
      if (!pl.late) {
        if (!pl.wound && tau <= pl.tau + WINDUP) { pl.wound = true; this.emit('windup', { who: rc.id }); }
        if (tau <= pl.tau && Math.hypot(rc.u - f.bu, rc.v - f.bv) <= AI_REACH) { this.kick(rc, this.rand() < rc.style.flat ? 'perfect' : 'ok', input); return; }
      }
    }
    this.goHome(dt, rc);
    if (h && input.kick && h.cool <= 0) {
      const d = Math.hypot(h.u - f.bu, h.v - f.bv), q = judge(tau, this.L);
      if (d <= this.L.reach && q !== 'early') { this.kick(h, q, input); return; }
      h.cool = 0.26; h.kickT = 0;
      this.emit('whiff', { who: h.id, why: d > this.L.reach ? 'far' : 'early' });
    }
    if (f.t >= f.dur) this.drop(f);
  }

  drop(f) {
    const who = this.receiver;
    flightAt(f, 1, this.shuttle);
    this.emit('land', { u: f.bu, v: f.bv, fault: null, side: 0 });
    if (who?.human) this.lives--;
    this.emit('point', { team: 1, why: 'drop', who: who?.id, human: !!who?.human, score: [this.best, 0], rally: this.count, lives: this.lives });
    this.count = 0; this.score[1] = 0;
    this.flight = null; this.receiver = null; this.marker.on = false;
    for (const p of this.players) p.plan = null;
    this.state = 'pause';
    this.timer = DROP_PAUSE;
    // whoever dropped it starts again (a kid for a kid, Mika for Mika)
    this.server = who || this.server;
  }

  result() {
    return { won: this.best >= KEEPUP_STARS[0], score: this.best, rally: this.best, stars: starsFor(this.best, KEEPUP_STARS), touches: this.touches, lives: this.lives };
  }
}

/** A stand-in for the player (see footnetBot). */
export function keepupBot(sim, at = 0.12) {
  const h = sim.human, out = { mx: 0, mv: 0, kick: false };
  if (!h) return out;
  if (sim.state === 'serve') { out.kick = at !== null && sim.server === h; return out; }
  const f = sim.flight;
  if (sim.state !== 'rally' || !f || !sim.marker.mine || at === null) return out;
  const du = f.bu - h.u, dv = f.bv - h.v, d = Math.hypot(du, dv);
  if (d > 0.15) { out.mx = du / d; out.mv = dv / d; }
  const tau = f.dur - f.t, want = typeof at === 'function' ? at(sim) : at;
  out.kick = tau <= want && d <= sim.L.reach;
  return out;
}

export default {
  id: 'keepup',
  name: N_('Keep it up'),
  /** Everybody plays (up to three kids with Mika); alone she juggles. */
  teams(kids) { return { mine: kids.slice(0, 3), theirs: [] }; },
  target: () => 0,
  create: opts => new KeepupSim(opts),
  bot: keepupBot,
  focus: { u: RING.u, v: RING.v, w: COURT.W + 1, l: RING.r * 2 + 3 },
};
