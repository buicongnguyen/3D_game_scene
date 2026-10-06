// Day planner for townsfolk: pure logic (no three.js, no DOM). The runtime (director) owns the bodies; each frame it
// calls planner.update(dt, hour, ctx), executes the returned commands, and reports back with planner.arrived() when a
// walk ends. Everything else (clip timers, waits, block changes, night, hour jumps) is timed here.
//
// Commands returned by update():
//   { type: 'walk', path: [[x, z], ...], speed, clip: 'Walk' | 'Run' }   walk the waypoints, then call arrived()
//   { type: 'teleport', at: [x, z], face? }                              snap there (story timelapse / first placement)
//   { type: 'clip', clip, prop: string|null, t, face? }                  loop a clip (t s; the planner ends it)
//   { type: 'hide', door: [x, z]|null }                                  vanish (went indoors / night)
//   { type: 'show', at: [x, z], face? }                                  reappear there (and stop selling)
//   { type: 'sell', shop, room }                                         keeper is indoors behind the counter (hidden outdoors)
//   { type: 'chat', with: id, at: [x, z], t }                           both present: face partner, Talk; convo may run
//   { type: 'play', game, at: [x, z], with: [ids], t }                  kids' game around `at` (radius ~5 m)

import { route, pointOf, pathLength, legClear } from '../world/roads.js';

export const isNight = hour => hour >= 20 || hour < 5;
export const CHAT_WAIT = 40;
const JUMP = 0.75;            // an hour step bigger than this in one update is a timelapse: teleport, don't walk
const wrap24 = h => ((h % 24) + 24) % 24;

/**
 * The block whose `from` is the latest <= hour (wrapping past midnight). A block may carry `when` (e.g. { lamps: 1 }
 * or { folk: { v3: 2 } }): it only counts while `ok(when)` holds; among blocks with the same `from`, the last
 * one listed that holds wins, so a plain block followed by a conditional one is "until / from then on".
 */
export function blockAt(plan, hour, ok = () => true) {
  if (!plan || !plan.length) return null;
  const h = wrap24(hour);
  const live = plan.filter(b => !b.when || ok(b.when));
  let best = null;
  for (const b of live) if (b.from <= h && (!best || b.from >= best.from)) best = b;
  if (best) return best;
  for (const b of live) if (!best || b.from >= best.from) best = b;   // before the first block: yesterday's last
  return best;
}

/** Index of the block in force (for change detection). */
export function blockIndex(plan, hour, ok) { const b = blockAt(plan, hour, ok); return b ? plan.indexOf(b) : -1; }

/** A block runs at night (people stay out) only when it says so; otherwise night sends everyone home. */
const nightOut = b => !!(b && b.night);

/** Where a task takes place (spot / door key) or null. */
export function taskPlace(task, person) {
  if (!task) return null;
  if (task.go) return task.go;
  if (task.at) return task.at;
  if (task.wander) return task.wander;
  if (task.deliver) return task.deliver[0] ? `door:${task.deliver[0].replace(/^door:/, '')}` : null;
  if (task.inside !== undefined) return person.home ? `door:${person.home}` : null;
  if (task.sell) return person.shopRoom ? `door:${person.shopRoom}` : person.home ? `door:${person.home}` : null;
  return null;
}
const hidesAt = task => task && (task.inside !== undefined || task.sell);

/**
 * Where a person is at `hour` without simulating: { x, z, hidden, block }. Night (unless the block runs at night),
 * `inside` and `sell` tasks place them hidden at their door. Uses the block's first placed task.
 */
export function whereAt(person, hour, roads, ok) {
  const b = blockAt(person.plan, hour, ok);
  const home = roads && person.home ? pointOf(roads, `door:${person.home}`) : null;
  if (!b || (isNight(hour) && !nightOut(b))) return { ...(home || { x: 0, z: 0 }), hidden: true, block: b };
  const tasks = b.tasks || [];
  // spread people out: start from the task the hour has reached within the block
  const span = blockSpan(person.plan, b);
  const frac = span > 0 ? (wrap24(hour - b.from) / span) : 0;
  const start = Math.min(tasks.length - 1, Math.floor(frac * tasks.length));
  for (let k = 0; k < tasks.length; k++) {
    const t = tasks[(start + k) % tasks.length];
    const key = taskPlace(t, person);
    const p = key && roads ? pointOf(roads, key) : null;
    if (p) return { x: p.x, z: p.z, hidden: !!hidesAt(t), block: b };
  }
  return { ...(home || { x: 0, z: 0 }), hidden: false, block: b };
}
function blockSpan(plan, b) {
  let next = null;
  for (const q of plan) if (q.from > b.from && (!next || q.from < next.from)) next = q;
  if (!next) for (const q of plan) if (!next || q.from < next.from) next = q;
  const d = wrap24(next.from - b.from);
  return d === 0 ? 24 : d;
}

/** Rendezvous board shared by every planner (chat tasks). */
export class Meetings {
  constructor() { this.here = new Map(); }
  arrive(me, partner, at) { this.here.set(me, { with: partner, at }); }
  leave(me) { this.here.delete(me); }
  /** True when both have arrived for each other. */
  met(me, partner) { const a = this.here.get(me), b = this.here.get(partner); return !!(a && b && a.with === partner && b.with === me); }
}

export class Planner {
  /**
   * person: { id, home, plan, shopRoom? }; opts.roads: buildRoads() graph; opts.rand: () => [0, 1);
   * opts.meetings: shared Meetings; opts.shops: { key: { room } } to find shop rooms.
   */
  constructor(person, { rand = Math.random, roads = null, meetings = null, shops = null, speed = 1.25 } = {}) {
    this.person = person;
    this.rand = rand;
    this.roads = roads;
    this.meetings = meetings;
    this.shops = shops || {};
    this.speed = speed;
    this.pos = null;           // [x, z] where the planner believes the body is
    this.hidden = false;
    this.lastHour = null;
    this.block = -1;
    this.ti = -1;              // task index in the block
    this.phase = 'idle';       // idle | walk | timed | wait | indoors | night
    this.timer = 0;
    this.after = null;         // continuation once a walk arrives
    this.walkBudget = 0;
    this.sub = null;           // per-task scratch (deliver queue, wander time)
    this.selling = false;
  }

  get id() { return this.person.id; }

  /** The runtime finished the walk it was given. */
  arrived(at) {
    if (this.phase !== 'walk') return;
    if (at) this.pos = [at[0] ?? at.x, at[1] ?? at.z];
    else if (this.walkEnd) this.pos = this.walkEnd.slice();
    this.phase = 'idle';
    const k = this.after; this.after = null;
    this.pending = k;           // run on the next update (keeps command order in one place)
  }

  /** One step: returns the commands to execute now (often []). ctx.pos: actual body position [x, z] (optional). */
  update(dt, hour, ctx = {}) {
    const out = [];
    if (ctx.pos) this.pos = [ctx.pos[0] ?? ctx.pos.x, ctx.pos[1] ?? ctx.pos.z];
    const first = this.lastHour === null;
    let jump = first;
    if (!first) { let d = Math.abs(wrap24(hour) - wrap24(this.lastHour)); d = Math.min(d, 24 - d); if (d > JUMP) jump = true; }
    this.lastHour = hour;

    const plan = this.person.plan || [];
    if (ctx.ok) this.ok = ctx.ok;
    const bi = blockIndex(plan, hour, this.ok), b = plan[bi];
    const night = isNight(hour) && !nightOut(b);
    if (night) {
      if (!this.atNight) { this.atNight = true; this.block = -2; this.teleportNext = jump; this.goNight(out, jump); return this.flush(out); }
    } else if (bi !== this.block || this.atNight) {
      this.atNight = false;
      this.leaveTask(out);
      this.block = bi;
      this.ti = -1;
      this.teleportNext = jump;
      if (jump && first) {
        const w = whereAt(this.person, hour, this.roads, this.ok);
        this.pos = [w.x, w.z];
        out.push({ type: 'teleport', at: [w.x, w.z] });
      }
      this.next(out);
      return this.flush(out);
    }
    if (jump) this.teleportNext = true;

    if (this.pending) { const k = this.pending; this.pending = null; k(out); return this.flush(out); }
    if (this.answerCall(out)) return this.flush(out);
    switch (this.phase) {
      case 'walk':
        this.walkBudget -= dt;
        if (this.walkBudget <= 0) { this.arrived(); const k = this.pending; this.pending = null; if (k) k(out); }
        break;
      case 'timed':
      case 'indoors':
        if (this.timer !== Infinity) { this.timer -= dt; if (this.timer <= 0) this.finishTimed(out); }
        break;
      case 'wait': {
        const t = this.task();
        if (this.meetings && this.meetings.met(this.id, t.chat)) {
          this.phase = 'timed'; this.timer = t.t ?? 20; this.onTimedEnd = o => this.meetings.leave(this.id);
          out.push({ type: 'chat', with: t.chat, at: this.pos.slice(), t: this.timer });
        } else if ((this.timer -= dt) <= 0) { this.meetings?.leave(this.id); this.next(out); }
        break;
      }
      case 'idle': if (!this.atNight) this.next(out); break;
    }
    return this.flush(out);
  }

  /**
   * Someone is waiting for me at a meeting spot: if this block has a chat with them and I am only at a small chore
   * or errand (a timed clip or a walk; not selling, indoors or chatting), drop it and go. A new walk replaces the old one.
   */
  answerCall(out) {
    if (!this.meetings || (this.phase !== 'timed' && this.phase !== 'walk') || this.selling || this.hidden || this.atNight) return false;
    const cur = this.task();
    if (cur?.chat || cur?.play) return false;
    const tasks = ((this.person.plan || [])[this.block] || {}).tasks || [];
    for (const [who, m] of this.meetings.here) {
      if (m.with !== this.id) continue;
      const i = tasks.findIndex(t => t.chat === who);
      if (i < 0) continue;
      this.onTimedEnd = null; this.after = null; this.phase = 'idle';
      this.ti = i - 1;
      this.next(out);
      return true;
    }
    return false;
  }

  flush(out) { if (out.length) this.teleportNext = false; return out; }

  task() { const b = (this.person.plan || [])[this.block]; return b ? (b.tasks || [])[this.ti] : null; }

  leaveTask(out) {
    if (this.meetings) this.meetings.leave(this.id);
    this.after = null; this.pending = null; this.sub = null; this.onTimedEnd = null;
    if (this.hidden) {
      const d = this.homeDoor() || this.pos;
      this.hidden = false; this.selling = false;
      if (d) { this.pos = d.slice(); out.push({ type: 'show', at: d.slice() }); }
    }
    this.phase = 'idle';
  }

  homeDoor(id = this.person.home) {
    const p = id && this.roads ? pointOf(this.roads, `door:${id}`) : null;
    return p ? [p.x, p.z] : null;
  }

  goNight(out, jump) {
    this.leaveTask(out);
    this.phase = 'night';
    const door = this.homeDoor();
    if (jump || !door || !this.pos) {
      if (door) this.pos = door.slice();
      this.hidden = true; out.push({ type: 'hide', door });
      return;
    }
    this.walkTo(out, `door:${this.person.home}`, o => { this.phase = 'night'; this.hidden = true; o.push({ type: 'hide', door }); });
  }

  /** Walk to a place key, then run k(out). Teleports instead during a timelapse. */
  walkTo(out, key, k, { speed = null, clip = null } = {}) {
    const target = this.roads ? pointOf(this.roads, key) : null;
    if (!target || !this.pos) { k(out); return; }
    if (this.teleportNext) {
      this.pos = [target.x, target.z];
      out.push({ type: 'teleport', at: this.pos.slice() });
      k(out); return;
    }
    if (Math.hypot(target.x - this.pos[0], target.z - this.pos[1]) < 0.6) { k(out); return; }
    const path = route(this.roads, { x: this.pos[0], z: this.pos[1] }, key);
    if (!path) { k(out); return; }   // unreachable (other side of the river): skip the leg
    const v = speed ?? this.speed;
    this.phase = 'walk';
    this.after = k;
    this.walkEnd = path[path.length - 1];
    this.walkBudget = pathLength(path) / v * 3 + 10;
    out.push({ type: 'walk', path, speed: v, clip: clip || (v > 2.2 ? 'Run' : 'Walk') });
  }

  /** Straight short walk (wander), no routing. */
  stroll(out, to, k) {
    this.phase = 'walk'; this.after = k; this.walkEnd = to;
    const d = Math.hypot(to[0] - this.pos[0], to[1] - this.pos[1]);
    this.walkBudget = d / 0.9 * 3 + 5;
    out.push({ type: 'walk', path: [this.pos.slice(), to.slice()], speed: 0.9, clip: 'Walk' });
  }

  timed(out, t, cmd, onEnd = null) {
    this.phase = t === 0 || t === Infinity ? 'indoors' : 'timed';
    this.timer = t === 0 ? Infinity : t;
    this.onTimedEnd = onEnd;
    if (cmd) out.push(cmd);
  }

  finishTimed(out) {
    const f = this.onTimedEnd; this.onTimedEnd = null;
    this.phase = 'idle';
    if (f) f(out);
    if (this.phase === 'idle' && !this.pending) this.next(out);
  }

  /** Start the next task of the block (loops). */
  next(out) {
    const tasks = ((this.person.plan || [])[this.block] || {}).tasks || [];
    if (!tasks.length) { this.timed(out, Infinity, { type: 'clip', clip: 'Idle', prop: null, t: Infinity }); return; }
    // guard against a block of zero-time tasks spinning forever within one frame
    this.spin = (this.spin || 0) + 1;
    if (this.spin > tasks.length + 2) { this.spin = 0; this.timed(out, 1, null); return; }
    this.ti = (this.ti + 1) % tasks.length;
    this.start(tasks[this.ti], out);
    if (this.phase !== 'idle') this.spin = 0;
  }

  start(t, out) {
    const p = this.person;
    if (t.go) { this.walkTo(out, t.go, o => this.next(o), { speed: t.speed }); return; }
    if (t.do) {
      const play = o => this.timed(o, t.t ?? 8, { type: 'clip', clip: t.do, prop: t.prop ?? null, t: t.t ?? 8, face: t.face });
      if (t.at) this.walkTo(out, t.at, play); else play(out);
      return;
    }
    if (t.inside !== undefined) {
      const door = this.homeDoor();
      const enter = o => {
        this.hidden = true; o.push({ type: 'hide', door });
        this.timed(o, t.inside, null, o2 => { this.hidden = false; if (door) { this.pos = door.slice(); o2.push({ type: 'show', at: door.slice() }); } });
      };
      if (door) this.walkTo(out, `door:${p.home}`, enter); else enter(out);
      return;
    }
    if (t.sell && this.shops[t.sell]?.at && !this.shops[t.sell]?.room) {
      // an open-air stall: mind it in plain sight
      const at = this.shops[t.sell].at;
      const begin = o => { this.selling = true; this.timed(o, t.t ?? 60, { type: 'clip', clip: 'Idle', prop: null, t: t.t ?? 60, face: this.shops[t.sell].face }, () => { this.selling = false; }); };
      this.walkTo(out, at, begin);
      return;
    }
    if (t.sell) {
      const room = this.shops[t.sell]?.room || p.shopRoom || p.home;
      const door = this.homeDoor(room);
      const begin = o => {
        this.hidden = true; this.selling = true;
        o.push({ type: 'hide', door }, { type: 'sell', shop: t.sell, room });
        this.timed(o, t.t ?? 0, null, o2 => { this.hidden = false; this.selling = false; if (door) { this.pos = door.slice(); o2.push({ type: 'show', at: door.slice() }); } });
      };
      if (door) this.walkTo(out, `door:${room}`, begin); else begin(out);
      return;
    }
    if (t.chat) {
      const arrive = o => {
        if (!this.meetings) { this.timed(o, Math.min(t.t ?? 10, 10), { type: 'clip', clip: 'Idle', prop: null, t: 10 }); return; }
        this.meetings.arrive(this.id, t.chat, t.at);
        if (this.meetings.met(this.id, t.chat)) {
          this.timed(o, t.t ?? 20, { type: 'chat', with: t.chat, at: this.pos.slice(), t: t.t ?? 20 }, () => this.meetings.leave(this.id));
        } else {
          this.phase = 'wait'; this.timer = CHAT_WAIT;
          o.push({ type: 'clip', clip: 'Idle', prop: null, t: CHAT_WAIT });
        }
      };
      this.walkTo(out, t.at, arrive);
      return;
    }
    if (t.play) {
      const spot = this.roads ? pointOf(this.roads, t.at) : null;
      const begin = o => this.timed(o, t.t ?? 30, { type: 'play', game: t.play, at: spot ? [spot.x, spot.z] : this.pos.slice(), with: t.with || [], t: t.t ?? 30 });
      this.walkTo(out, t.at, begin, { speed: t.speed ?? 2.6 });
      return;
    }
    if (t.deliver) {
      const doors = t.deliver.map(d => (d.startsWith('door:') ? d : `door:${d}`));
      let i = 0;
      const step = o => {
        if (i >= doors.length) { this.next(o); return; }
        const key = doors[i++];
        this.walkTo(o, key, o2 => this.timed(o2, 3, { type: 'clip', clip: 'Interact', prop: 'letters', t: 3 }, o3 => step(o3)));
      };
      step(out);
      return;
    }
    if (t.wander) {
      const c = this.roads ? pointOf(this.roads, t.wander) : null;
      let left = t.t ?? 30;
      const r = t.r ?? 4;
      const amble = o => {
        if (left <= 0 || !c) { this.next(o); return; }
        // pick a point that a straight stroll can reach (clear of walls and water); else pause
        for (let k = 0; k < 6; k++) {
          const a = this.rand() * Math.PI * 2, d = r * Math.sqrt(this.rand());
          const to = [c.x + Math.cos(a) * d, c.z + Math.sin(a) * d];
          if (this.roads && !strollOk(this.roads, this.pos, to)) continue;
          const dd = Math.hypot(to[0] - this.pos[0], to[1] - this.pos[1]);
          left -= dd / 0.9;
          this.stroll(o, to, o2 => { const pause = 2 + this.rand() * 4; left -= pause; this.timed(o2, pause, { type: 'clip', clip: 'Idle', prop: null, t: pause }, amble); });
          return;
        }
        left -= 3; this.timed(o, 3, { type: 'clip', clip: 'Idle', prop: null, t: 3 }, amble);
      };
      this.walkTo(out, t.wander, amble);
      return;
    }
    // unknown task: idle briefly
    this.timed(out, 3, { type: 'clip', clip: 'Idle', prop: null, t: 3 });
  }
}

function strollOk(g, a, b) { return legClear(g, a[0], a[1], b[0], b[1]); }
