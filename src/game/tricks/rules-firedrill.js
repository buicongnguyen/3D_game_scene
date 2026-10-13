// The rules of the Fire drill (tricks/firedrill.js draws them): practice with a grown-up at a metal tray, the way a
// school fire drill teaches it. Pure and Node-tested (tests/firedrill.test.mjs): no three.js, no DOM.
//
// First of all Mika shouts "Fire!" (in a real fire a child shouts, tells a grown-up and gets away: the drill says so at
// the start and on the results card). Then the method PASS:
//   Pull the pin, Aim at the base of the fire, Squeeze the handle, Sweep from side to side.
// A fire is a row of cells across the tray, each with a heat 0..1. The spray only cools the cells under the nozzle, and
// only when it is aimed low, at the base: aimed at the flame tops it does next to nothing. So the fire has to be swept.
// Standing matters too: 2 to 3 m away (closer scatters the fuel and is too hot; further and the spray falls short), with
// the wind at her back (downwind the powder blows back at her) and her back to the way out.
// The gauge: an extinguisher holds a few seconds of spray and no more.
//
// Levels (drillPlan): Easy one small tray, no wind, every step prompted. Normal three trays one after the other, small,
// middling and big, in a wind that turns; the big one smoulders, and flares up again if the sweeping stops as soon as the
// flames are down. Difficult: paper, a pan of oil and straw: the right extinguisher has to be chosen (water soaks paper
// and straw; powder for oil, and never water on oil: the grown-up stops that before a drop falls, and says why), a fire
// left burning too long catches the next tray, there is less in the extinguishers and nobody prompts the steps.

export const PASS = ['pull', 'aim', 'squeeze', 'sweep'];
/** The ring to stand in (metres from the tray) and the limits of a stance at all. */
export const STAND = { near: 2, far: 3, min: 1.2, max: 4.6 };
export const AIM = { x: 1.3, base: 0.28, high: 0.6, start: 0.82, speed: 1.0, lift: 1.0 };   // the nozzle: reach across (m), "on the base" below, "in the flames" above, where it starts, how fast it moves (m/s; heights/s)
export const CELL = 0.4;           // metres between two cells of a fire
export const REACH = 0.42;         // half the width of the spray at the tray
const RATE = 2.5;                  // heat a cell loses a second under a well-aimed spray (out in 0.4 s: one steady pass of the nozzle)
const REGROW = 0.15;               // heat a burning cell wins back a second when the spray is elsewhere
const COAT = 3.2;                  // seconds a cell that was put out resists catching again from its neighbour
const RELIGHT = 0.3;               // the heat of a cell that catches again
const GAP = 2.6;                   // seconds between one tray out and the next one lit
export const SIZES = { small: { cells: 3, embers: 0, par: 15 }, medium: { cells: 4, embers: 0, par: 17 }, big: { cells: 5, embers: 1.2, par: 21 } };
/** What burns in a tray, and which extinguisher is the one for it. */
export const FUEL = { straw: { best: 'water' }, paper: { best: 'water' }, oil: { best: 'powder' } };
export const POINTS = { shout: 10, out: 20, stance: 10, aim: 10, speed: 10, steps: 5, choice: 10, saved: 15 };

/** What a level's round is made of. The guided first play is Easy's. */
export function drillPlan(level = 'normal', first = false) {
  if (first || level === 'easy') return { level: 'easy', fires: [{ fuel: 'straw', size: 'small' }], wind: 0, seconds: 12, prompts: true, choose: false, spreadAfter: 0, parPlus: 12, slack: 2.2 };
  if (level === 'hard') return { level: 'hard', fires: [{ fuel: 'paper', size: 'medium' }, { fuel: 'oil', size: 'medium' }, { fuel: 'straw', size: 'big' }], shuffle: true, wind: 1, seconds: 9, prompts: false, choose: true, spreadAfter: 26, parPlus: 9, slack: 0.7 };
  return { level: 'normal', fires: [{ fuel: 'straw', size: 'small' }, { fuel: 'straw', size: 'medium' }, { fuel: 'straw', size: 'big' }], wind: 1, seconds: 12, prompts: true, choose: false, spreadAfter: 0, parPlus: 0, slack: 0.9 };
}

/** The most a plan can score. */
export function drillMax(plan) {
  const per = POINTS.out + POINTS.stance + POINTS.aim + POINTS.speed + POINTS.steps + (plan.choose ? POINTS.choice : 0);
  return POINTS.shout + plan.fires.length * per + POINTS.saved;
}

const clamp01 = v => Math.max(0, Math.min(1, v));
const ramp = (a, b, v) => clamp01((v - a) / (b - a));

/** How much of the spray works at this height of the nozzle (0 the foot of the fire .. 1 the flame tops). */
export function baseEffect(ay) { return 1 - 0.94 * ramp(AIM.base, AIM.high, ay); }

/** How well the spray works from a distance (metres): full in the ring, weak too close and too far. */
export function distEffect(d) {
  if (d < STAND.near) return 0.4 + 0.6 * ramp(1.0, STAND.near, d);
  if (d > STAND.far) return 1 - 0.75 * ramp(STAND.far, 4.5, d);
  return 1;
}

/** How well it works in the wind: `up` is 1 with the wind at her back, -1 facing into it; `wind` its strength 0..1. */
export function windEffect(up, wind = 1) {
  if (!wind) return 1;
  return 1 - wind * 0.55 * (1 - ramp(-0.3, 0.4, up));
}

/** What is wrong with a stance { dist, up, exit } in a wind: a list of 'close' | 'far' | 'downwind' | 'exit'. */
export function stanceFaults(st, wind = 1, tol = 0.15) {
  const out = [];
  if (st.dist < STAND.near - tol) out.push('close');
  else if (st.dist > STAND.far + tol) out.push('far');
  if (wind && st.up < 0.2) out.push('downwind');
  if (st.exit < 0.25) out.push('exit');
  return out;
}

/** Points for a stance (0..POINTS.stance): the ring 4, the wind 3, the way out 3. */
export function stanceScore(st, wind = 1) {
  if (!st) return 0;
  const d = st.dist >= STAND.near - 0.15 && st.dist <= STAND.far + 0.15 ? 4 : st.dist >= STAND.near - 0.6 && st.dist <= STAND.far + 0.6 ? 2 : 0;
  const w = !wind ? 3 : st.up >= 0.4 ? 3 : st.up >= 0 ? 1 : 0;
  const e = st.exit >= 0.25 ? 3 : st.exit >= -0.1 ? 1 : 0;
  return d + w + e;
}

/**
 * One round of the drill (pure). The round feeds it what Mika does: shout(), take(kind), plant(i, stance), unplant(),
 * and every frame update(dt, { squeeze, ax, ay }). It answers with `events` (a list the round reads and empties):
 *   { type: 'lit' | 'spread' | 'pin' | 'out' | 'down' | 'reflare' | 'relit' | 'empty' | 'wrong' | 'coach', i, why }
 * 'wrong' is a mistake that costs a point or two (why: 'noshout' | 'nopin' | 'high' | 'still' | 'early' | 'close' |
 * 'far' | 'downwind' | 'exit' | 'water-oil' | 'powder-soft'); 'coach' is a kind word that costs nothing (Easy does not
 * let her spray from a bad place: it says where to stand).
 */
export class Drill {
  constructor({ level = 'normal', first = false, rand = Math.random, plan = null } = {}) {
    const P = this.plan = plan || drillPlan(level, first);
    const list = P.fires.map(f => ({ ...f }));
    if (P.shuffle) for (let k = list.length - 1; k > 0; k--) { const j = Math.floor(rand() * (k + 1)); [list[k], list[j]] = [list[j], list[k]]; }
    this.fires = list.map((f, i) => {
      const S = SIZES[f.size], n = S.cells;
      return {
        i, fuel: f.fuel, size: f.size, st: 'wait', cells: new Float32Array(n), coat: new Float32Array(n), n, embers: S.embers, embers0: S.embers,
        par: S.par + P.parPlus, litAt: 0, outAt: 0, burnT: 0, idle: 0, spread: false, reflares: 0,
        stance: null, eff: 1, spray: 0, onBase: 0, high: 0, minX: 9, maxX: -9, wrong: [], used: [],
        steps: { pull: false, aim: false, squeeze: false, sweep: false }, aimT: 0,
      };
    });
    // a wind for every tray (the angle it blows to, radians off "from the way out to the trays"): it turns between trays
    this.winds = this.fires.map(() => (P.wind ? (rand() - 0.5) * 1.5 : 0));
    this.ext = { powder: { left: P.seconds, pin: false, emptied: false }, water: { left: P.seconds, pin: false, emptied: false } };
    this.held = null;
    this.shouted = false;
    this.noshout = false;
    this.target = -1;           // the tray she is planted at
    this.t = 0;
    this.gap = 0;
    this.used = 0;              // seconds of spray in all
    this.refills = 0;
    this.events = [];
    this.finished = false;
    this._emptyTold = false;
    this.light(0);
  }

  ev(type, i = -1, why = '') { this.events.push({ type, i, why }); }
  wrong(f, why) {
    const list = f ? f.wrong : (this.global ??= []);
    if (list.includes(why)) return false;
    list.push(why);
    this.ev('wrong', f ? f.i : -1, why);
    return true;
  }

  light(i, spread = false) {
    const f = this.fires[i];
    if (!f || f.st !== 'wait') return false;
    f.st = 'burn'; f.cells.fill(1); f.coat.fill(0); f.litAt = this.t; f.spread = spread;
    this.ev(spread ? 'spread' : 'lit', i);
    return true;
  }

  /** The tray to deal with now: the first one burning (or smouldering), else -1. */
  get cur() { for (const f of this.fires) if (f.st === 'burn' || f.st === 'down') return f.i; return -1; }
  get done() { return this.fires.every(f => f.st === 'out'); }
  get burning() { let n = 0; for (const f of this.fires) if (f.st === 'burn' || f.st === 'down') n++; return n; }

  /** The step that is due now: 'shout' | 'take' | 'pull' | 'aim' | 'squeeze' | 'sweep' | 'wait' (the next tray is not lit yet). */
  get step() {
    if (!this.shouted) return 'shout';
    if (!this.held) return 'take';
    const f = this.fires[this.target >= 0 ? this.target : this.cur];
    if (!f) return 'wait';
    if (this.target < 0 || !this.ext[this.held].pin) return 'pull';
    if (!f.steps.aim) return 'aim';
    if (!f.steps.squeeze) return 'squeeze';
    return 'sweep';
  }

  /** Shout "Fire!": the first thing to do. True the first time. */
  shout() {
    if (this.shouted) return false;
    this.shouted = true;
    return true;
  }

  /**
   * Take an extinguisher from the row ('powder' | 'water'); the one in her hand goes back. Taking one before the
   * shout is a mistake (the shout is made up for at once). An empty one is swapped for a full one (a refill).
   */
  take(kind) {
    const e = this.ext[kind];
    if (!e) return false;
    if (!this.shouted) { this.noshout = true; this.shouted = true; this.wrong(null, 'noshout'); }
    if (this.target >= 0) this.unplant();
    if (e.left <= 0) { e.left = this.plan.seconds; e.pin = false; e.emptied = false; this.refills++; this._emptyTold = false; }
    this.held = kind;
    return true;
  }

  /**
   * Plant her feet at tray i and pull the pin. stance: { dist: metres, up: 1 with the wind at her back .. -1,
   * exit: 1 with the way out straight behind her .. -1 }. Returns { ok, why } where why is the reason it was refused:
   * 'none' (nothing in her hand) | 'nofire' | 'toofar' | 'tooclose' | 'water-oil' | on Easy also 'close' | 'far' | 'exit'.
   */
  plant(i, stance) {
    const f = this.fires[i], P = this.plan;
    if (!this.held) return { ok: false, why: 'none' };
    if (!f || (f.st !== 'burn' && f.st !== 'down')) return { ok: false, why: 'nofire' };
    if (stance.dist > STAND.max) return { ok: false, why: 'toofar' };
    if (stance.dist < STAND.min) { this.wrong(f, 'close'); return { ok: false, why: 'tooclose' }; }
    if (this.held === 'water' && f.fuel === 'oil') { this.wrong(f, 'water-oil'); return { ok: false, why: 'water-oil' }; }
    const wind = P.wind, faults = stanceFaults(stance, wind, P.prompts && !wind ? 0.35 : 0.15);
    if (P.level === 'easy' && faults.length) {
      // Easy: she is shown where to stand before anything is sprayed; nothing is lost
      this.ev('coach', i, faults[0]);
      return { ok: false, why: faults[0] };
    }
    for (const w of faults) this.wrong(f, w);
    f.stance = { dist: stance.dist, up: stance.up, exit: stance.exit };
    f.eff = distEffect(stance.dist) * windEffect(stance.up, wind);
    if (P.level === 'easy') f.eff = 1;
    this.target = i;
    const e = this.ext[this.held];
    if (!e.pin) { e.pin = true; this.ev('pin', i); }
    f.steps.pull = true;
    if (!f.used.includes(this.held)) {
      f.used.push(this.held);
      // powder knocks the flames off straw and paper, but it does not soak them: they smoulder longer
      if (this.held === 'powder' && FUEL[f.fuel].best === 'water' && P.choose) { f.embers += 1.4; f.embers0 += 1.4; this.wrong(f, 'powder-soft'); }
    }
    return { ok: true, why: '' };
  }

  unplant() { this.target = -1; }

  /** A frame: the handle (squeeze) and where the nozzle points (ax metres across the tray, ay 0 foot .. 1 flame tops). */
  update(dt, { squeeze = false, ax = 0, ay = 1 } = {}) {
    if (this.finished) return;
    this.t += dt;
    const P = this.plan, f = this.fires[this.target] || null, e = this.held ? this.ext[this.held] : null;
    let spraying = false, base = 0;
    this.spraying = false;
    if (squeeze && e) {
      if (!e.pin) this.wrong(this.fires[this.cur] || null, 'nopin');
      else if (!f) { if (this.t - (this._standTold ?? -9) > 5) { this._standTold = this.t; this.ev('coach', this.cur, 'stand'); } }
      else if (e.left <= 0) { if (!this._emptyTold) { this._emptyTold = true; e.emptied = true; this.ev('empty', f.i); } }
      else {
        spraying = this.spraying = true;
        e.left = Math.max(0, e.left - dt);
        this.used += dt;
        f.spray += dt;
        base = baseEffect(ay);
        if (base >= 0.5) { f.onBase += dt; f.minX = Math.min(f.minX, ax); f.maxX = Math.max(f.maxX, ax); } else f.high += dt;
        if (f.spray >= 0.3) f.steps.squeeze = true;
        if (f.high > 0.9 && f.high > f.onBase) this.wrong(f, 'high');
      }
    }
    if (f && ay <= AIM.base) { f.aimT += dt; if (f.aimT >= 0.2) f.steps.aim = true; }
    for (const g of this.fires) {
      if (g.st === 'burn') {
        g.burnT += dt;
        const on = spraying && g === f, half = (g.n - 1) / 2;
        let alive = 0;
        for (let k = 0; k < g.n; k++) {
          const w = on ? Math.max(0, 1 - Math.abs(ax - (k - half) * CELL) / REACH) : 0;
          let h = g.cells[k];
          if (h > 0) {
            if (w > 0) h -= RATE * base * g.eff * w * dt; else h = Math.min(1, h + REGROW * dt);
            if (h <= 0) { h = 0; g.coat[k] = COAT; }
          } else if (g.coat[k] > 0) g.coat[k] = Math.max(0, g.coat[k] - (w > 0 && base >= 0.5 ? 0 : dt));
          else if ((k > 0 && g.cells[k - 1] > 0.35) || (k < g.n - 1 && g.cells[k + 1] > 0.35)) { h = RELIGHT; this.ev('relit', g.i); }
          g.cells[k] = h;
          if (h > 0) alive++;
        }
        // sweeping: a long spray at one spot while the rest burns on is a step done wrong
        if (on && base >= 0.5 && alive && g.onBase > 2.4 && g.maxX - g.minX < 0.35) this.wrong(g, 'still');
        if (!alive) {
          if (g.embers > 0.01) { g.st = 'down'; g.idle = 0; this.ev('down', g.i); } else this.out(g);
        } else if (P.spreadAfter && g.burnT > P.spreadAfter && !g.spreadDone) {
          g.spreadDone = true;
          if (this.fires[g.i + 1]?.st === 'wait') this.light(g.i + 1, true);
        }
      } else if (g.st === 'down') {
        // the flames are down but the heap still smoulders: a moment more of sweeping, or it flares up again
        const on = spraying && g === f && base >= 0.5 && Math.abs(ax) <= (g.n / 2) * CELL + REACH;
        if (on) { g.embers -= dt * g.eff; g.idle = 0; if (g.embers <= 0) this.out(g); }
        else {
          g.idle += dt;
          if (g.idle > 1.7) {
            g.st = 'burn'; g.cells.fill(0.5); g.coat.fill(0); g.embers = g.embers0 * 0.6; g.reflares++;
            this.ev('reflare', g.i);
            this.wrong(g, 'early');
          }
        }
      }
    }
    // the next tray is lit a moment after the last one went out
    if (!this.burning && !this.done) {
      this.gap += dt;
      if (this.gap >= GAP) { this.gap = 0; const n = this.fires.find(x => x.st === 'wait'); if (n) this.light(n.i); }
    } else this.gap = 0;
  }

  out(f) {
    f.st = 'out'; f.outAt = this.t; f.cells.fill(0); f.embers = 0; f.steps.sweep = true; f.steps.aim = f.steps.squeeze = true;
    if (this.target === f.i) this.target = -1;
    this.ev('out', f.i);
  }

  /** Time is up: the round is over as it stands (the grown-up covers what still burns). */
  finish() { this.finished = true; this.target = -1; }

  /** How hard a tray burns now, 0..1 (what the flames show). */
  level(i) { const f = this.fires[i]; if (!f || f.st === 'wait' || f.st === 'out') return 0; let s = 0; for (let k = 0; k < f.n; k++) s += f.cells[k]; return s / f.n; }

  /** The points of one tray, in parts. */
  fireScore(f) {
    const P = this.plan, out = f.st === 'out';
    const s = { out: out ? POINTS.out : 0, stance: stanceScore(f.stance, P.wind), aim: f.spray > 0.2 ? Math.round(POINTS.aim * clamp01(f.onBase / f.spray)) : 0, speed: 0, steps: 0, choice: 0 };
    if (out) s.speed = Math.round(POINTS.speed * clamp01(1 - (f.outAt - f.litAt - f.par) / (f.par * 1.5)));
    if (f.stance) s.steps = Math.max(0, POINTS.steps - 2 * f.wrong.filter(w => w === 'nopin' || w === 'high' || w === 'still' || w === 'early').length);
    if (P.choose && f.used.length) s.choice = f.wrong.includes('water-oil') ? 0 : f.wrong.includes('powder-soft') ? 5 : POINTS.choice;
    s.total = s.out + s.stance + s.aim + s.speed + s.steps + s.choice;
    return s;
  }

  /** The seconds of spray a clean round needs: every cell once, the smouldering, and a little for the sweep's ends. */
  get ideal() { let n = 0; for (const f of this.fires) n += f.n / RATE + SIZES[f.size].embers + 0.5; return n; }

  /** Points for what was not wasted (only when every tray is out and no extinguisher ran empty). */
  get saved() {
    if (!this.done || this.refills || this.ext.powder.emptied || this.ext.water.emptied) return 0;
    return Math.round(POINTS.saved * clamp01(1 - (this.used - this.ideal) / (this.ideal * this.plan.slack)));
  }

  get shoutScore() { return this.shouted && !this.noshout ? POINTS.shout : 0; }
  get score() { let s = this.shoutScore + this.saved; for (const f of this.fires) s += this.fireScore(f).total; return s; }
  get outCount() { let n = 0; for (const f of this.fires) if (f.st === 'out') n++; return n; }
  get mistakes() { let n = (this.global || []).length; for (const f of this.fires) n += f.wrong.length; return n; }
}

/**
 * A player made of rules, for the tests and for tuning the stars: it plays a whole round of a level and returns
 * { score, time, drill }. skill 1: clean (shouts, picks the right extinguisher, stands in the ring with the wind at
 * its back, aims low, sweeps on a moment after the flames are down). Lower skills dawdle, stand a little wrong, spray
 * the flame tops first, stop sweeping the moment the flames are down, and at 0.3 and less forget the shout and take
 * any extinguisher.
 */
export function botRound(level, { seed = 1, skill = 1, dt = 0.05, time = null, first = false } = {}) {
  let s = seed >>> 0 || 1;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const d = new Drill({ level, first, rand });
  const limit = time ?? { easy: 70, normal: 100, hard: 130 }[d.plan.level];
  const slow = 1 + (1 - skill) * 1.6;
  let t = 0;
  const idle = sec => { for (let k = 0; k < sec / dt && t < limit; k++) { d.update(dt); t += dt; } };
  idle(1.2 * slow);
  if (skill > 0.3) d.shout();
  let tries = 0;
  while (!d.done && t < limit && tries++ < 40) {
    const i = d.cur;
    if (i < 0) { idle(0.2); continue; }
    const f = d.fires[i];
    const want = !d.plan.choose ? 'powder' : skill > 0.3 ? FUEL[f.fuel].best : f.wrong.includes('water-oil') ? 'powder' : 'water';
    if (d.held !== want || d.ext[want].left <= 0) { idle((d.plan.choose ? 5 : 4) * slow); d.take(want); }
    idle(3 * slow);
    let stance = skill >= 0.9 ? { dist: 2.5, up: 0.95, exit: 0.9 } : skill >= 0.5 ? { dist: 3.3, up: 0.3, exit: 0.4 } : { dist: 3.7, up: -0.1, exit: 0.1 };
    let r = d.plant(i, stance);
    if (!r.ok && r.why === 'water-oil') continue;
    if (!r.ok) { idle(2 * slow); stance = { dist: 2.5, up: 0.9, exit: 0.9 }; r = d.plant(i, stance); if (!r.ok) break; }
    let ax = 0, ay = AIM.start, dir = -1;
    // the careless spray the flame tops first
    if (skill < 0.9) for (let k = 0; k < (1 - skill) * 1.6 / dt && t < limit; k++) { d.update(dt, { squeeze: true, ax, ay }); t += dt; }
    while (ay > 0.1 && t < limit) { ay = Math.max(0.1, ay - AIM.lift * dt); d.update(dt, { ax, ay }); t += dt; }
    const half = (f.n - 1) / 2 * CELL;
    let guard = 0;
    while (d.target === i && t < limit && guard++ < 4000) {
      const e = d.ext[d.held];
      if (e.left <= 0) break;
      if (f.st === 'down' && skill < 0.9 && !f.reflares) { idle(2); continue; }     // stops too early, once
      // sweep: on to the next cell that still burns, at the nozzle's pace
      let goal = ax;
      if (f.st === 'burn') {
        let best = 9;
        for (let k = 0; k < f.n; k++) if (f.cells[k] > 0) { const cx = (k - (f.n - 1) / 2) * CELL, dd = Math.abs(cx - ax); if (dd < best) { best = dd; goal = cx; } }
      } else { if (Math.abs(ax) >= half) dir = -Math.sign(ax) || 1; goal = ax + dir * 0.2; }
      const step = AIM.speed * dt * (0.55 + 0.45 * skill);
      ax += Math.max(-step, Math.min(step, goal - ax));
      d.update(dt, { squeeze: true, ax, ay });
      t += dt;
    }
  }
  if (!d.done) d.finish();
  return { score: d.score, time: t, drill: d };
}
