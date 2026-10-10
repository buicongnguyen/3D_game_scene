// River fishing rules (pure; no three.js, no DOM: Node-testable and seedable).
//
// One round: cast -> wait -> approach -> nibble -> bite -> hooked -> caught | escaped.
// The view only reads this state; the only input is "is the reel button held" once per update.
//   - wait/approach/nibble: pressing is too early. The fish bolts and the wait starts over.
//   - bite: the float goes under for a short window. Press inside it to set the hook.
//   - hooked: hold to reel. Holding raises the tension, a lot while the fish surges; letting go lets it drop
//     but gives line back. Tension at the top can snap the line, a line left slack for too long lets the fish
//     slip the hook, and a full progress bar lands it.
// Modelled on the Zoo Garden rules (cast, suitor, nibbles, bite window, surge/tension reel), rewritten for this game:
// one rod, no bait, difficulty from the fish (FISH[...].difficulty and its size), and a gentle mode for the story.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const CAST = { min: 2.4, max: 10.5, flight: 0.55, arc: 1.7 };
export const REEL = {
  rod: 0.5,               // rod quality 0..1 (one rod for now)
  window: 1.6, windowEasy: 2.6,   // seconds the float stays under
  startTension: 0.25, startProgress: 0.05,
  snap: 0.5, snapEasy: 0.25,      // chance the line breaks each time the tension tops out
  slack: 6, slackEasy: 9,         // seconds of a slack line before the fish slips the hook
  strainTo: 0.7, strainCost: 0.08,
};

/** Length range per species, cm. */
export const SIZE = { trout: [22, 46], char: [18, 38], koi: [32, 68], starfin: [28, 52] };
export const BIG = 0.78;          // above this fraction of the range the catch is "a big one"

/**
 * Which fish comes to the float. table = FISH (weights); at dusk the starfin takes 45 % of the bites (it has no
 * weight of its own); forced (the story's first three trout) wins over everything.
 */
export function pickSpecies(table, rand = Math.random, { dusk = false, forced = null } = {}) {
  if (forced) return forced;
  if (dusk && rand() < 0.45 && table.starfin) return 'starfin';
  const ids = Object.keys(table).filter(k => table[k].weight > 0);
  const total = ids.reduce((a, k) => a + table[k].weight, 0);
  let r = rand() * total;
  for (const k of ids) { r -= table[k].weight; if (r <= 0) return k; }
  return ids[ids.length - 1];
}

/** Length in cm: most fish are small, a few are big. */
export function fishSize(species, rand = Math.random) {
  const [a, b] = SIZE[species] || SIZE.trout;
  return Math.round(a + (b - a) * Math.pow(rand(), 2.4));
}

/** 0..1 through the species' size range. */
export function sizeFraction(species, cm) {
  const [a, b] = SIZE[species] || SIZE.trout;
  return clamp((cm - a) / (b - a), 0, 1);
}

/** How hard the fish fights, 0..1: the species' difficulty, more for a big one, less on Easy. */
export function fishPower(table, species, cm, easy = false) {
  const base = table[species]?.difficulty ?? 0.4;
  return clamp((base + (sizeFraction(species, cm) - 0.3) * 0.25) * (easy ? 0.65 : 1), 0.12, 0.95);
}

/** A whole fish for the sim's `choose`: { species, cm, power }. */
export function makeFish(table, rand, { dusk = false, forced = null, easy = false } = {}) {
  const species = pickSpecies(table, rand, { dusk, forced });
  const cm = fishSize(species, rand);
  return { species, cm, power: fishPower(table, species, cm, easy) };
}

/**
 * Where the float lands for a tap at (x, z). origin: the angler; the cast is kept between min and max from her and
 * inside the water the spot allows (ok(x, z)); a tap outside slides toward `home` (the middle of the fishing water)
 * until it fits. Returns { x, z, dist }.
 */
export function planCast(tap, { origin, home, ok = () => true, min = CAST.min, max = CAST.max }) {
  let dx = tap.x - origin.x, dz = tap.z - origin.z, d = Math.hypot(dx, dz);
  if (d < 1e-4) { dx = home.x - origin.x; dz = home.z - origin.z; d = Math.hypot(dx, dz) || 1; }
  const want = clamp(d, min, max);
  let x = origin.x + dx / d * want, z = origin.z + dz / d * want;
  if (!ok(x, z)) {
    const sx = x, sz = z;
    for (let i = 1; i <= 24; i++) {
      const k = i / 24;
      x = sx + (home.x - sx) * k; z = sz + (home.z - sz) * k;
      if (ok(x, z)) break;
    }
  }
  return { x, z, dist: Math.hypot(x - origin.x, z - origin.z) };
}

export class FishingSim {
  /**
   * rand: seeded 0..1; easy: gentler numbers; gentle: the line can never snap and a fish never loses interest (the
   * story's first trout); choose(): the fish that comes, { species, cm, power, dist? }.
   */
  constructor({ rand = Math.random, easy = false, gentle = false, quality = REEL.rod, choose } = {}) {
    this.rand = rand;
    this.easy = easy;
    this.gentle = gentle;
    this.q = quality;
    this.choose = choose || (() => ({ species: 'trout', cm: 30, power: 0.35 }));
    this.phase = 'cast';
    this.t = 0;                 // seconds in this phase
    this.held = true;           // the press that cast the line is not a strike
    this.fish = null;
    this.dist = 0;              // the coming fish's distance from the float (m)
    this.nibble = 0;            // 1 -> 0 through one nibble (0.3 s)
    this.tension = 0;
    this.progress = 0;
    this.surging = false;
    this.slack = 0;
    this.result = null;         // 'caught' | 'escaped'
    this.reason = null;         // 'snap' | 'slack'
    this.early = 0; this.missed = 0; this.bites = 0;
    this.waitFor = 0;
    this.window = easy ? REEL.windowEasy : REEL.window;
  }

  range(a, b) { return a + (b - a) * this.rand(); }
  go(phase) { this.phase = phase; this.t = 0; }
  get over() { return this.phase === 'caught' || this.phase === 'escaped'; }
  /** 1 -> 0 through the bite window. */
  get biteLeft() { return this.phase === 'bite' ? clamp(1 - this.t / this.window, 0, 1) : 0; }

  startWait(extra = 0) {
    this.fish = null; this.dist = 0; this.nibble = 0;
    this.waitFor = extra + this.range(2, 5.5) * (this.easy ? 0.6 : 1) / (1 + this.q * 0.5);
    this.go('wait');
  }

  tooEarly(ev) {
    this.early++;
    ev.push('early');
    this.startWait(1.5);
  }

  /** held: is the reel button down now. Returns the events of this step (strings). */
  update(dt, held = false) {
    const ev = [];
    const press = held && !this.held;
    this.held = held;
    this.t += dt;
    switch (this.phase) {
      case 'cast':
        if (this.t >= CAST.flight) { ev.push('land'); this.startWait(); }
        break;
      case 'wait':
        if (press) this.tooEarly(ev);
        else if (this.t >= this.waitFor) {
          this.fish = this.choose();
          this.dist = clamp(this.fish.dist ?? this.range(2.4, 4), 1.1, 4.5);
          ev.push('attract');
          this.go('approach');
        }
        break;
      case 'approach':
        if (press) { this.tooEarly(ev); break; }
        this.dist = Math.max(0.55, this.dist - (this.dist > 2 ? 1.1 : 0.55) * dt);
        if (this.dist <= 0.55 && this.t > 0.8) {
          this.nibbles = 1 + Math.floor(this.rand() * (this.easy ? 2 : 3));
          this.nextNibble = this.range(0.4, 1.1);
          this.go('nibble');
        }
        break;
      case 'nibble':
        if (press) { this.tooEarly(ev); break; }
        this.nibble = Math.max(0, this.nibble - dt / 0.3);
        this.nextNibble -= dt;
        if (this.nextNibble <= 0) {
          if (this.nibbles > 0) { this.nibbles--; this.nibble = 1; this.nextNibble = this.range(0.6, 1.4); ev.push('nibble'); }
          else if (this.gentle || this.rand() < 0.95) { this.bites++; this.nibble = 0; ev.push('bite'); this.go('bite'); }
          else { ev.push('lost'); this.startWait(); }
        }
        break;
      case 'bite':
        if (press) {
          this.tension = REEL.startTension; this.progress = REEL.startProgress; this.slack = 0;
          this.surgeT = 0; this.calmT = this.range(0.9, 1.8); this.surging = false;
          ev.push('hook');
          this.go('hooked');
        } else if (this.t > this.window) { this.missed++; ev.push('missed'); this.startWait(); }
        break;
      case 'hooked': this.reel(dt, held, ev); break;
    }
    return ev;
  }

  reel(dt, held, ev) {
    const p = this.fish.power, k = this.easy ? 0.7 : 1;
    if (this.surgeT > 0) {
      this.surgeT -= dt;
      if (this.surgeT <= 0) this.calmT = this.range(0.8, 2.2) * (1.2 - p * 0.5);
    } else {
      this.calmT -= dt;
      if (this.calmT <= 0) { this.surgeT = this.range(0.5, 0.8 + p) * (this.easy ? 0.8 : 1); ev.push('surge'); }
    }
    const surging = this.surging = this.surgeT > 0;
    if (held) {
      this.progress += dt * 0.3 * (1.15 - p * 0.45) * (surging ? 0.4 : 1);
      this.tension += dt * k * (1.2 - this.q * 0.45) * (0.08 + (surging ? 0.6 * p + 0.12 : 0.02));
      this.slack = 0;
    } else {
      this.tension = Math.max(0, this.tension - dt * 0.9);
      this.progress = Math.max(0, this.progress - dt * 0.05 * p * (surging ? 2.5 : 1));
      this.slack += dt;
    }
    if (this.tension >= 1) {
      if (!this.gentle && this.rand() < (this.easy ? REEL.snapEasy : REEL.snap)) return this.end('escaped', 'snap', ev);
      this.tension = REEL.strainTo;
      this.progress = Math.max(0, this.progress - REEL.strainCost);
      ev.push('strain');
    }
    if (this.slack > (this.easy ? REEL.slackEasy : REEL.slack)) return this.end('escaped', 'slack', ev);
    if (this.progress >= 1) { this.progress = 1; return this.end('caught', null, ev); }
  }

  end(result, reason, ev) {
    this.result = result; this.reason = reason; this.surging = false;
    ev.push(reason || result);
    this.go(result);
  }
}

// ------------------------------------------------------------------------------------------------ the catch on the dock
// Landed fish lie in two short ranks on the dock planks just west of Mika (close, so a phone's narrow view keeps them),
// heads to the water, clear of her feet, of Rin's place on the south side and of both edges; at most PILE.cap show,
// older ones go into the creel that stands by her.
export const PILE = {
  cap: 8, x0: 2.84, dx: 0.33, z: [29.44, 30.4], scale: 0.55,  // scale: a fish out of the water against one in it
  dock: { x0: 0.2, x1: 4.3, z0: 28.75, z1: 31.25, y: 0.72 },  // the planks
  creel: { x: 3.3, z: 29.08, r: 0.24 },
  keepOut: [{ x: 3.8, z: 30.1, r: 0.5 }, { x: 3.6, z: 31.2, r: 0.55 }],   // Mika's feet; Rin's place in chapter one
};

/** Where the i-th fish of the row lies: { x, z, yaw } (yaw: heading of its head; a slight fan, a slight stagger). */
export function pileSlot(i) {
  const k = Math.max(0, Math.min(PILE.cap - 1, i));
  const col = k >> 1, rank = k & 1;        // the two places nearest her fill first
  return { x: PILE.x0 - col * PILE.dx, z: PILE.z[rank], yaw: Math.PI + (col - 1.5) * 0.06 };
}

/** Length on the dock (m) of a fish that is `len` m long in the water at school size `size`. */
export function pileLength(len, size) { return len * size * PILE.scale; }

/**
 * The row after one more fish is landed (pure). pile: [{ id }] oldest first. Returns { pile, creel: [ids that went
 * into the creel] }: the newcomer takes the last place, and the oldest move on when the row is full.
 */
export function pileAdd(pile, item) {
  const next = [...pile, item], creel = [];
  while (next.length > PILE.cap) creel.push(next.shift().id);
  return { pile: next, creel };
}

// ------------------------------------------------------------------------------------------------ the school
// The fish in the fishing water (pure too: the view only draws these records).
// state: swim (wandering) | suitor (the sim's fish: coming, nibbling, biting, fighting) | flee | gone (waiting to come
// back from the rim) | held (the view owns it: the leap to the angler).

export class School {
  /** area: { cx, cz, rx, rz } ellipse the fish keep to; mix: species per fish; deep: how many swim low as shadows. */
  constructor({ rand = Math.random, area, mix = ['trout'], deep = 0 }) {
    this.rand = rand;
    this.area = area;
    this.mix = mix;
    this.fish = [];
    this.t = 0;
    mix.forEach((species, i) => this.fish.push(this.spawn(species, i >= mix.length - deep)));
  }

  range(a, b) { return a + (b - a) * this.rand(); }
  inside(x, z, k = 1) { const a = this.area; return ((x - a.cx) / (a.rx * k)) ** 2 + ((z - a.cz) / (a.rz * k)) ** 2 <= 1; }

  point(k = 0.9) {
    const a = this.area, ang = this.rand() * Math.PI * 2, r = Math.sqrt(this.rand()) * k;
    return { x: a.cx + Math.cos(ang) * a.rx * r, z: a.cz + Math.sin(ang) * a.rz * r };
  }

  rim() {
    const a = this.area, ang = this.rand() * Math.PI * 2;
    return { x: a.cx + Math.cos(ang) * a.rx * 1.12, z: a.cz + Math.sin(ang) * a.rz * 1.12 };
  }

  spawn(species, deep = false, at = null) {
    const p = at || this.point();
    const f = { species, deep, x: p.x, z: p.z, heading: this.rand() * Math.PI * 2, speed: 0, wig: this.rand() * 10, state: 'swim',
      t: 0, goalT: 0, gx: p.x, gz: p.z, lift: 0, fast: 0, size: this.range(0.85, 1.15) * (deep ? 1.5 : 1) };
    this.newGoal(f, null);
    return f;
  }

  newGoal(f, float) {
    for (let i = 0; i < 8; i++) {
      const p = this.point(f.deep ? 0.7 : 0.9);
      f.gx = p.x; f.gz = p.z;
      if (!float || Math.hypot(p.x - float.x, p.z - float.z) > 1.8) break;   // goals keep clear of the float
    }
    f.goalT = this.range(4, 8);
    f.cruise = f.deep ? this.range(0.25, 0.45) : this.range(0.5, 1.1);
  }

  /** The fish that takes the sim's interest: the nearest swimmer of that species, else a newcomer from the rim. */
  suitorFor(species, float) {
    let best = null, bd = 7;
    for (const f of this.fish) {
      if (f.state !== 'swim' || f.deep || f.species !== species) continue;
      const d = Math.hypot(f.x - float.x, f.z - float.z);
      if (d < bd) { bd = d; best = f; }
    }
    if (!best) {
      // nobody of that kind about: one swims in from the edge nearest the float
      const a = this.area, ang = Math.atan2((float.z - a.cz) / a.rz, (float.x - a.cx) / a.rx) + this.range(-0.9, 0.9);
      best = this.spawn(species, false, { x: a.cx + Math.cos(ang) * a.rx * 1.05, z: a.cz + Math.sin(ang) * a.rz * 1.05 });
      this.fish.push(best);
      best.extra = true;
    }
    best.state = 'suitor';
    best.bearing = Math.atan2(best.z - float.z, best.x - float.x);
    best.r = Math.hypot(best.x - float.x, best.z - float.z);
    return best;
  }

  /** Bolt away from (x, z). */
  flee(f, x, z, speed = 3.2, time = 1.4) {
    f.state = 'flee'; f.t = time; f.fleeSpeed = speed;
    f.heading = Math.atan2(f.x - x, f.z - z) + this.range(-0.4, 0.4);
  }

  /** A caught fish leaves the water; another swims in from the rim a little later. */
  take(f, back = 3) { f.state = 'gone'; f.t = back; }

  /**
   * dt; float: { x, z } or null; drive: for the suitor, { phase, dist, nibble, progress, surging, origin: { x, z } }.
   */
  update(dt, float = null, drive = null) {
    this.t += dt;
    const turn = (f, want, rate) => {
      let d = want - f.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      f.heading += d * Math.min(1, dt * rate);
    };
    for (const f of this.fish) {
      f.fast = Math.max(0, f.fast - dt * 2);
      f.lift += (0 - f.lift) * Math.min(1, dt * 6);
      if (f.state === 'gone') {
        f.t -= dt;
        if (f.t <= 0) {
          if (f.extra) { f.dead = true; continue; }
          const p = this.rim();
          f.x = p.x; f.z = p.z; f.state = 'swim'; f.size = this.range(0.85, 1.15);
          this.newGoal(f, float);
        }
        continue;
      }
      if (f.state === 'held') continue;
      if (f.state === 'flee') {
        f.t -= dt; f.fast = 1;
        f.x += Math.sin(f.heading) * f.fleeSpeed * dt; f.z += Math.cos(f.heading) * f.fleeSpeed * dt;
        if (f.t <= 0) { f.state = 'swim'; this.newGoal(f, float); if (f.extra) { f.extra = false; } }
        continue;
      }
      if (f.state === 'suitor' && float && drive) { this.driveSuitor(f, dt, float, drive, turn); continue; }
      // wandering
      f.goalT -= dt;
      const gd = Math.hypot(f.gx - f.x, f.gz - f.z);
      if (gd < 0.3 || f.goalT <= 0) this.newGoal(f, float);
      if (float && !f.deep) {
        const fd = Math.hypot(f.x - float.x, f.z - float.z);
        if (fd < 1.3 && !f.shy) {            // too close to the float: swim off the other way
          f.shy = 1.2;
          const away = Math.atan2(f.x - float.x, f.z - float.z);
          f.gx = f.x + Math.sin(away) * 3; f.gz = f.z + Math.cos(away) * 3;
          if (!this.inside(f.gx, f.gz)) { const p = this.point(0.8); f.gx = p.x; f.gz = p.z; }
          f.goalT = 4;
        }
      }
      f.shy = Math.max(0, (f.shy || 0) - dt);
      turn(f, Math.atan2(f.gx - f.x, f.gz - f.z), 3);
      const want = f.cruise * (f.shy ? 1.8 : 1);
      f.speed += (want - f.speed) * Math.min(1, dt * 2);
      f.x += Math.sin(f.heading) * f.speed * dt; f.z += Math.cos(f.heading) * f.speed * dt;
    }
    if (this.fish.some(f => f.dead)) this.fish = this.fish.filter(f => !f.dead);
  }

  driveSuitor(f, dt, float, d, turn) {
    const toFloat = Math.atan2(float.x - f.x, float.z - f.z);
    if (d.phase === 'hooked') {
      // dragged from where the float landed toward the angler, thrashing sideways; it faces away and pulls
      const o = d.origin, k = d.progress;
      const bx = float.cx + (o.x - float.cx) * k * 0.82, bz = float.cz + (o.z - float.cz) * k * 0.82;
      const ax = o.x - float.cx, az = o.z - float.cz, al = Math.hypot(ax, az) || 1;
      const side = Math.sin(this.t * (d.surging ? 9 : 5) + f.wig) * (d.surging ? 0.75 : 0.35);
      const tx = bx - az / al * side, tz = bz + ax / al * side;
      f.x += (tx - f.x) * Math.min(1, dt * 8); f.z += (tz - f.z) * Math.min(1, dt * 8);
      turn(f, Math.atan2(-ax, -az) + side * 0.9, 10);
      f.fast = 1;
      if (d.surging) f.lift = Math.max(f.lift, 0.18 + 0.1 * Math.sin(this.t * 14));
      return;
    }
    let r = f.r;
    if (d.phase === 'approach') r = Math.max(d.dist, 0.55);
    else if (d.phase === 'nibble') r = 0.55 - Math.sin((1 - d.nibble) * Math.PI) * (d.nibble > 0 ? 0.36 : 0);
    else if (d.phase === 'bite') { r = 0.14; f.fast = 1; }
    f.r += (r - f.r) * Math.min(1, dt * (d.phase === 'approach' ? 3 : 14));
    const tx = float.x + Math.cos(f.bearing) * f.r, tz = float.z + Math.sin(f.bearing) * f.r;
    f.x += (tx - f.x) * Math.min(1, dt * 6); f.z += (tz - f.z) * Math.min(1, dt * 6);
    turn(f, toFloat, 6);
    if (d.phase !== 'approach') f.lift = Math.max(f.lift, 0.1);
  }
}
