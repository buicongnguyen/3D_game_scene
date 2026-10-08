// Town Life at runtime: the valley's named neighbours (content/townsfolk.js) walk their day plans along the roads,
// work, shop, sit, chat and play; Mika can follow their little stories, run errands, and buy and sell in the shops.
// The planning is pure (game/schedule.js, world/roads.js, game/folk.js); this file only gives it bodies: it executes
// the planner's commands on NPCs, puts props in hands, runs the kids' games and the overheard conversations, and
// handles talking and shopping.
import * as THREE from 'three';
import { NPC } from '../actors/npc.js';
import { PEOPLE, SPOTS } from '../content/townsfolk.js';
import { SHOPS, GOODS } from '../content/shops.js';
import { CONVOS } from '../content/convos.js';
import { buildRoads, legClear } from '../world/roads.js';
import { Planner, Meetings, isNight } from './schedule.js';
import { talkTo, applyEffects, shopOffer, buy, sell, folkJournal } from './folk.js';
import { STEPS, STEP_INDEX, ITEMS } from './story.js';
import { BARK_RANGE } from './barks.js';
import { tx, N_ } from '../i18n/i18n.js';

const PERSON = new Map(PEOPLE.map(p => [p.id, p]));
// how a prop sits in the right hand (grip_R: +Y along the fingers, +X the palm normal), per clip, from the review
// renders of art/blender/build_townlife.py (art/CONTRACTS.md, Town Life villager clips). r = Euler XYZ, p = position.
const HANG = { r: [Math.PI, 0, 0] };
const GRIP = {
  broom: { Sweep: { r: [0.603, -0.457, 3.086] }, any: HANG },
  bucket: { Carry: { r: [-0.19, -0.39, 2.21] }, any: HANG },
  basket: { Carry: { r: [-0.19, -0.39, 2.21] }, any: HANG },
  hoe: { Hammer: { r: [0, -1.118, -0.548] }, any: HANG },
  letters: { any: { r: [0, 0, 0] } },
  ball: { any: { p: [0.1, 0.03, 0] } },
  'hand-lantern': { any: HANG },
  'fishing-rod': { any: { r: [0, 0, 0] } },
};
const LINE_TIME = 3.3;        // seconds each line of an overheard conversation stays up
const CONVO_COOL = 40;        // a pair rests this long between conversations
const V = new THREE.Vector3();
const GREET = 2.2;            // a walker who meets Mika this close (and her not running) stops and says hello
const SPACE = 0.7;            // people keep this far apart when they pass
// what the kids call out while Mika plays ball with them
const BALL_LINES = [N_('Catch, Mika!'), N_('Over here! Over here!'), N_('Nice throw!'), N_('Again! Again!'), N_('You throw like Rin!'), N_('Mika is on our team!')];

export class TownLife {
  constructor(director) {
    this.d = director;
    this.g = director.game;
    this.people = [];         // { p: person, n: NPC, plan: Planner, cmd, prop, keeper?: NPC }
    this.byId = new Map();
    this.games = new Map();   // kids' games, keyed by game@x,z
    this.convo = null;        // the conversation now running { pair, lines, i, t, convo }
    this.pairs = new Map();   // 'a|b' -> { a, b, t (cooldown) }
    this.t = 0;
  }

  // ------------------------------------------------------------------ setup
  spawn() {
    const d = this.d, g = this.g;
    const t0 = performance.now();
    this.roads = buildRoads({ spots: SPOTS, grid: g.world.grid });
    this.meetings = new Meetings();
    const shops = Object.fromEntries(Object.entries(SHOPS).map(([k, s]) => [k, { room: s.room, at: s.at, face: SPOTS[s.at]?.face }]));
    let seed = 60;
    for (const p of PEOPLE) {
      let n = d.npcs[p.id];
      if (!n) {
        n = d.npcs[p.id] = new NPC(g.scene, g.assets, g.world, p.id, p.model, { x: 0, z: 0, tint: NPC.villagerTint(seed++) });
        n.villager = true;
        n.barkKind = p.model.slice(9);
      }
      delete d.routes?.[p.id];                     // the old stroll loops give way to the day plan
      n.folk = p;
      n.name = p.name;
      const it = { p, n, plan: new Planner(p, { roads: this.roads, meetings: this.meetings, shops }), cmd: null, prop: null, propName: null };
      this.people.push(it);
      this.byId.set(p.id, it);
      this.registerTalk(it, n);
    }
    this.spawnKeepers();
    this.placeBenches();
    this.ball = this.makeBall();
    this.registerBall();
    console.info(`[town] ${this.people.length} neighbours, roads ${this.roads.nodes.length} nodes, ${Math.round(performance.now() - t0)} ms`);
  }

  /** Shopkeepers indoors: a second body behind the counter, shown while they mind the shop (or are home upstairs). */
  spawnKeepers() {
    const d = this.d, g = this.g, I = g.interiors;
    if (!I) return;
    for (const [key, s] of Object.entries(SHOPS)) {
      const it = this.byId.get(s.keeper), room = s.room && I.rooms.get(s.room);
      if (!it || !room?.spots?.length) continue;
      const spot = room.spots[0];
      const outdoor = it.n;
      const k = new NPC(g.scene, g.assets, g.world, `shop:${key}`, outdoor.folk.model || 'villager-man', { x: spot.pos.x, z: spot.pos.z, facing: spot.yaw });
      // dress the counter body exactly like the outdoor one (same tinted materials)
      const mats = new Map();
      outdoor.model.traverse(o => { if (o.isMesh) mats.set(o.name, o.material); });
      k.model.traverse(o => { if (o.isMesh && mats.has(o.name)) o.material = mats.get(o.name); });
      k.place(spot.pos.x, spot.pos.z, spot.yaw, spot.pos.y);
      Object.assign(k, { villager: true, folk: it.p, shopKey: key, resident: room.id, spotYaw: spot.yaw, barkKind: outdoor.barkKind, name: it.p.name });
      k.setIdle('Idle');
      k.setVisible(false);
      d.npcs[k.id] = k;
      it.keeper = k;
      it.shopRoom = room.id;
      this.registerTalk(it, k);
    }
  }

  /** A wooden bench wherever someone sits down in their plan (so nobody sits on air). */
  placeBenches() {
    const g = this.g, seen = new Set();
    for (const p of PEOPLE) for (const b of p.plan || []) {
      let at = null;
      for (const task of b.tasks) {
        if (task.go && !String(task.go).startsWith('door:')) at = task.go;
        const where = task.at || at;
        if (task.do === 'Sit' && where && SPOTS[where] && !seen.has(where)) seen.add(where);
      }
    }
    this.benches = new Map();
    for (const key of seen) {
      const s = SPOTS[key], face = s.face ?? 0;
      // the Sit clip puts the hips on a 0.45 m seat over the root, feet forward: the bench stands right at the spot
      const bx = s.x, bz = s.z;
      const m = g.assets.clone('bench');
      if (m) {
        m.position.set(bx, g.world.heightAt(bx, bz), bz);
        m.rotation.y = face;
        m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        g.scene.add(m);
      }
      this.benches.set(key, { x: s.x, z: s.z, face });
    }
  }

  makeBall() {
    const m = this.g.assets.clone('ball') || new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 1), new THREE.MeshStandardMaterial({ color: '#e0433a', roughness: 0.6 }));
    m.visible = false;
    m.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.g.scene.add(m);
    return m;
  }

  registerTalk(it, n) {
    const d = this.d;
    const label = () => {
      if (n.shopKey || this.atStall(it, n)) return tx('Shop at {shop}', { shop: tx(SHOPS[n.shopKey || it.p.shop].name) });
      return tx('Talk to {name}', { name: tx(it.p.name) });
    };
    // a little below the story's own people, so a passer-by never steals the focus from what the story needs
    d.interact(`talk:${n.id}`, null, label, () => n.visible && !n.far && d.q.state.step !== 'p.arrive' && d.scenes?.active !== 'starTrain',
      () => this.talk(it, n), 2.6, () => n.head(), () => (n.shopKey ? 1 : -0.5));
  }

  atStall(it, n) {
    const s = it.p.shop && SHOPS[it.p.shop];
    if (!s?.at || !SPOTS[s.at] || !it.plan.selling) return false;
    return Math.hypot(n.pos.x - SPOTS[s.at].x, n.pos.z - SPOTS[s.at].z) < 4;
  }

  // ------------------------------------------------------------------ every frame
  update(dt) {
    const d = this.d, g = this.g;
    if (!this.people.length) return;
    this.t += dt;
    const frozen = d.townFrozen?.() || d.busy > 0 || !!d.scenes.active;
    const hour = g.shownHour();
    const ok = this.blockOk ??= w => this.holds(w);
    for (const it of this.people) {
      const n = it.n;
      this.updateKeeper(it);
      if (frozen) continue;
      if (this.courtesy(it, dt)) continue;          // stopped to say hello: the day plan waits
      if (it.game && it.game === this.mikaPlays) continue;   // nobody leaves a game Mika is playing in
      // a scene moved them (place() drops the walk): the planner takes it as arrived and carries on from there
      if (it.plan.phase === 'walk' && !n.path) it.plan.arrived([n.pos.x, n.pos.z]);
      const cmds = it.plan.update(dt, hour, { pos: [n.pos.x, n.pos.z], ok });
      for (const c of cmds) this.exec(it, c);
    }
    if (!frozen) { this.updateGames(dt); this.keepApart(dt); }
    // Mika's game ended (the kids went home) or she wandered off: she is no longer playing
    const mg = this.mikaPlays;
    if (mg && (!this.games.has(mg.key) || Math.hypot(mg.at[0] - g.player.pos.x, mg.at[1] - g.player.pos.z) > 12)) {
      if (mg.holder === this.mika) mg.holder = mg.kids[0] || null;
      if (mg.flight?.to === this.mika) mg.flight = null;
      this.mikaPlays = null;
    }
    if (frozen || !this.ballGame || !this.games.has(this.ballGame.key)) this.ball.visible = false;
    this.updateConvos(dt, frozen);
  }

  exec(it, c) {
    const n = it.n;
    if (c.type !== 'chat' && c.type !== 'play') this.leaveGame(it);
    switch (c.type) {
      case 'walk': {
        // what they were carrying comes along, hanging from the hand (a broom or hoe goes back in the shed)
        const keep = c.clip !== 'Run' && it.cmd?.type === 'clip' && ['bucket', 'basket', 'letters', 'hand-lantern'].includes(it.propName);
        this.setProp(it, keep ? it.propName : null);
        n.setIdle('Idle');
        n.walk(c.path, () => it.plan.arrived(c.path[c.path.length - 1]), c.speed, c.clip);
        break;
      }
      case 'teleport': n.place(c.at[0], c.at[1], c.face); break;
      case 'clip': {
        n.path = null;
        if (c.face !== undefined) n.targetFacing = c.face;
        const clip = this.clipFor(n, c.clip);
        this.setProp(it, c.prop || null, clip);
        n.sitting = c.clip === 'Sit';
        n.setIdle(clip);
        if (n.anim && !n.anim.busy) n.anim.play(clip);
        break;
      }
      case 'hide': this.setProp(it, null); n.path = null; n.setHidden(true); break;
      case 'show': n.place(c.at[0], c.at[1], c.face); n.setHidden(false); n.setIdle('Idle'); break;
      case 'sell': this.setProp(it, null); n.setHidden(true); break;
      case 'chat': {
        this.setProp(it, null);
        n.path = null;
        const o = this.byId.get(c.with)?.n;
        if (o) n.lookAt(o.pos.x, o.pos.z);
        n.setIdle(this.clipFor(n, 'Talk'));
        const key = [it.p.id, c.with].sort().join('|');
        if (!this.pairs.has(key)) this.pairs.set(key, { a: [it.p.id, c.with].sort()[0], b: [it.p.id, c.with].sort()[1], t: 4 + Math.random() * 8 });
        it.chatWith = c.with;
        break;
      }
      case 'play': this.setProp(it, null); this.joinGame(it, c); break;
    }
    it.cmd = c;
    if (c.type !== 'chat') it.chatWith = null;
    if (c.type !== 'clip') n.sitting = false;
  }

  clipFor(n, clip) {
    if (n.anim?.has?.(clip)) return clip;
    return { Sweep: 'Idle', Carry: 'Idle', Sit: 'Idle', Hammer: 'Talk', Interact: 'Wave', Throw: 'Wave', Kick: 'Cheer', Jump: 'Cheer', Run: 'Walk', Bow: 'Wave' }[clip] || 'Idle';
  }

  setProp(it, name, clip = 'any') {
    if (it.propName === name && it.propClip === clip) return;
    it.propClip = clip;
    if (it.prop) { it.prop.removeFromParent(); it.prop = null; }
    it.propName = name;
    if (!name) return;
    const grip = it.n.model.getObjectByName('grip_R');
    const m = grip && this.g.assets.clone(name);
    if (!m) return;
    const g = GRIP[name] || {}, o = g[clip] || g.any || {};
    const kid = it.n.barkKind === 'kid';
    m.position.set(...(o.p || [0, 0, 0]).map(v => v * (kid ? 0.7 : 1)));
    m.rotation.set(...(o.r || [0, 0, 0]));
    if (kid && name === 'broom') m.scale.setScalar(0.75);   // an adult's broom would go through the floor
    m.traverse(x => { if (x.isMesh) x.castShadow = it.n.shadow; });
    grip.add(m);
    it.prop = m;
  }

  /** The counter body indoors: present while the keeper sells, or is at home in the house above the shop. */
  updateKeeper(it) {
    const k = it.keeper;
    if (!k) return;
    const act = this.g.interiors?.active || null;
    const home = it.p.home === it.shopRoom;
    const present = it.plan.selling || (home && it.n.hiddenBy);
    const show = act === it.shopRoom && !!present;
    if (k.visible !== show) k.setVisible(show);
    if (show) {
      const p = this.g.player.pos;
      if (k.pos.distanceTo(p) < 4.5) k.lookAt(p.x, p.z); else k.targetFacing = k.spotYaw;
    }
  }

  /** A scene takes this person out of their day plan (a party, the meeting): back in sight, empty-handed, plan reset. */
  release(id) {
    const it = this.byId.get(id);
    if (!it) return;
    const n = it.n, P = it.plan;
    this.leaveGame(it);
    this.setProp(it, null);
    n.path = null; n.onPathDone = null; n.sitting = false;
    n.setHidden(false);
    this.meetings.leave(id);
    Object.assign(P, { phase: 'idle', hidden: false, selling: false, after: null, pending: null, onTimedEnd: null });
    it.cmd = null; it.chatWith = null; it.paused = null;
  }

  // ------------------------------------------------------------------ manners
  /**
   * A neighbour walking along who comes face to face with Mika (and she is not running past) stops, turns to her and
   * waves, then goes on once she steps away. Returns true while they wait (the planner is held).
   */
  courtesy(it, dt) {
    const n = it.n, p = this.g.player;
    it.greetCool = (it.greetCool || 0) - dt;
    if (it.paused) {
      const w = it.paused;
      w.t += dt;
      n.lookAt(p.pos.x, p.pos.z);
      if (n.pos.distanceTo(p.pos) < GREET + 1.4 && w.t < 14 && n.visible) return true;
      it.paused = null;
      it.greetCool = 25;
      n.walk(w.path, w.done, w.speed, w.clip);
      return false;
    }
    if (!n.path || !n.visible || n.far || it.game || (n.speed > 2.2) || it.greetCool > 0) return false;
    if ((p.speed ?? 0) > 2.6 || p.locked || n.pos.distanceTo(p.pos) > GREET) return false;
    // only when Mika is ahead of them, not when she is behind their back
    const [tx_, tz] = n.path[0], hx = tx_ - n.pos.x, hz = tz - n.pos.z, mx = p.pos.x - n.pos.x, mz = p.pos.z - n.pos.z;
    if (hx * mx + hz * mz < 0) return false;
    it.paused = { path: n.path, done: n.onPathDone, speed: n.speed, clip: n.walkClip, t: 0 };
    n.path = null; n.onPathDone = null;
    n.setIdle('Idle');
    n.anim?.play('Idle');
    if (n.anim?.has?.('Wave')) n.anim.once('Wave', { then: 'Idle' });
    return true;
  }

  /** People passing each other (or Mika) step a little aside instead of walking through. */
  keepApart(dt) {
    const p = this.g.player.pos, list = this.people.filter(x => x.n.visible && !x.n.far && !x.n.sitting);
    const push = (n, ax, az, d) => {
      if (!n.path) return;                       // only walkers give way; people at work stay where they are
      const k = Math.min(SPACE - d, dt * 1.6) / (d || 1);
      n.pos.x += ax * k; n.pos.z += az * k;
    };
    for (let i = 0; i < list.length; i++) {
      const a = list[i].n;
      const mx = a.pos.x - p.x, mz = a.pos.z - p.z, md = Math.hypot(mx, mz);
      if (md < SPACE && Math.abs(a.pos.y - p.y) < 1.5) push(a, mx, mz, md);
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j].n, dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z;
        if (Math.abs(dx) > SPACE || Math.abs(dz) > SPACE) continue;
        const d = Math.hypot(dx, dz);
        if (d >= SPACE) continue;
        push(a, dx, dz, d); push(b, -dx, -dz, d);
      }
    }
  }

  // ------------------------------------------------------------------ Mika plays ball
  registerBall() {
    const p = this.g.player;
    // Mika as a player in the kids' game: same shape as a kid entry
    this.mika = { mika: true, p: { id: 'mika' }, n: {
      pos: p.pos, visible: true, far: false, path: null, barkKind: 'kid',
      head: out => out.copy(p.pos).setY(p.pos.y + 1.25), lookAt: () => {},
      anim: { once: (clip, o) => p.anim?.has?.(clip) && p.anim.once(clip, o), has: c => !!p.anim?.has?.(c) },
    } };
    this.d.interact('ballGame', null,
      () => (this.mikaPlays && this.ballGame?.holder === this.mika ? tx('Throw the ball') : tx('Join the ball game')),
      () => this.ballWhen(), () => this.ballAct(), 5.5,
      () => {
        const gm = this.ballGame;   // (asked for even while the prompt is off, so never assume a game)
        if (this.mikaPlays || !gm) return V.copy(p.pos).setY(p.pos.y + 1);
        return V.set(gm.at[0], this.g.world.heightAt(gm.at[0], gm.at[1]) + 1, gm.at[1]);
      }, 0.3);
  }

  ballWhen() {
    const gm = this.ballGame, d = this.d;
    if (!gm || !this.games.has(gm.key) || d.busy || d.scenes.active || this.g.interiors?.active) return false;
    if (this.mikaPlays === gm) return gm.holder === this.mika && !gm.flight;
    return !this.mikaPlays && gm.kids.some(k => k.n.visible);
  }

  ballAct() {
    const gm = this.ballGame;
    if (!gm) return;
    if (this.mikaPlays !== gm) { this.mikaPlays = gm; gm.passes = 0; gm.t = 0.6; this.shout(gm, BALL_LINES[0]); return; }
    const kids = gm.kids.filter(k => k.n.visible);
    if (!kids.length) return;
    this.throwBall(gm, this.mika, kids[Math.floor(Math.random() * kids.length)]);
  }

  /** One of the kids calls out (a speech bubble with their name). */
  shout(gm, text) {
    const k = gm.kids.find(x => x.n.visible);
    if (!k) return;
    this.d.barks.ui.show(`ball:${k.p.id}`, text, out => { k.n.head(out); out.y += 0.3; return out; }, { name: tx(k.p.name || ''), life: 2.6 });
    this.d.audio?.blip?.(1.4);
  }

  throwBall(gm, from, to) {
    from.n.path = null;
    from.n.lookAt(to.n.pos.x, to.n.pos.z);
    const kick = !from.mika && Math.random() < 0.5 && from.n.anim?.has?.('Kick');
    const clip = from.mika ? (from.n.anim.has('Cast') ? 'Cast' : 'Interact') : kick ? 'Kick' : this.clipFor(from.n, 'Throw');
    from.n.anim?.once?.(clip, { then: from.mika ? 'Idle' : from.n.idleClip });
    if (from.mika) this.g.player.turnTo?.(Math.atan2(to.n.pos.x - from.n.pos.x, to.n.pos.z - from.n.pos.z), 1, 50);
    const a = new THREE.Vector3().copy(from.n.pos).setY(from.n.pos.y + (kick ? 0.1 : 0.8));
    const b = new THREE.Vector3().copy(to.n.pos).setY(to.n.pos.y + 0.8);
    // a beat for the wind-up before the ball leaves the hand (t starts below zero)
    gm.flight = { a, b, t: kick ? -0.25 : -0.35, dur: 0.6 + a.distanceTo(b) * 0.09, h: kick ? 0.6 : 1.4, to };
    if (from.mika && ++gm.passes % 3 === 0) this.shout(gm, BALL_LINES[1 + Math.floor(Math.random() * (BALL_LINES.length - 1))]);
  }

  // ------------------------------------------------------------------ kids' games
  joinGame(it, c) {
    const key = `${c.game}@${c.at[0].toFixed(1)},${c.at[1].toFixed(1)}`;
    if (it.game?.key === key) return;
    this.leaveGame(it);
    let gm = this.games.get(key);
    if (!gm) this.games.set(key, gm = { key, game: c.game, at: c.at, kids: [], t: 0, holder: null, it: null, flight: null, turn: 0 });
    gm.kids.push(it);
    it.game = gm;
    it.n.path = null;
    it.n.setIdle('Idle');
  }

  leaveGame(it) {
    const gm = it.game;
    if (!gm) return;
    gm.kids = gm.kids.filter(k => k !== it);
    it.game = null;
    if (gm.holder === it) gm.holder = gm.kids[0] || null;
    if (gm.it === it) gm.it = gm.kids[0] || null;
    if (!gm.kids.length) { this.games.delete(gm.key); if (this.ballGame === gm) { this.ballGame = null; this.ball.visible = false; } }
  }

  /** A point near the game's centre the kid can reach in a straight line. */
  roam(gm, n, r = 4.5) {
    for (let k = 0; k < 6; k++) {
      const a = Math.random() * Math.PI * 2, rr = (0.3 + Math.random() * 0.7) * r;
      const x = gm.at[0] + Math.cos(a) * rr, z = gm.at[1] + Math.sin(a) * rr;
      if (legClear(this.roads, n.pos.x, n.pos.z, x, z)) return [x, z];
    }
    return null;
  }

  updateGames(dt) {
    const p = this.g.player;
    for (const gm of this.games.values()) {
      gm.t -= dt;
      const kids = gm.kids.filter(k => k.n.visible);
      if (!kids.length) continue;
      if (gm.game === 'ball') this.ballStep(gm, kids, dt, p);
      else if (gm.game === 'tag') this.tagStep(gm, kids, dt);
      else this.hopStep(gm, kids, dt);
    }
  }

  ballStep(gm, kids, dt, p) {
    // one ball in the valley: it belongs to the nearest ball game to Mika
    if (this.ballGame !== gm) {
      const mine = this.ballGame && this.games.has(this.ballGame.key) ? Math.hypot(this.ballGame.at[0] - p.pos.x, this.ballGame.at[1] - p.pos.z) : Infinity;
      if (Math.hypot(gm.at[0] - p.pos.x, gm.at[1] - p.pos.z) < mine) { this.ballGame = gm; gm.flight = null; }
    }
    const hasBall = this.ballGame === gm;
    // Mika plays while she stays near; walking off with the ball tosses it back first
    let mika = this.mikaPlays === gm;
    if (mika && (this.ballGame !== gm || Math.hypot(gm.at[0] - p.pos.x, gm.at[1] - p.pos.z) > 9)) {
      if (gm.holder === this.mika && !gm.flight && kids.length) this.throwBall(gm, this.mika, kids[0]);
      if (!gm.flight || gm.flight.to !== this.mika) { this.mikaPlays = null; mika = false; }
    }
    const players = mika ? [...kids, this.mika] : kids;
    if (!gm.holder || !players.includes(gm.holder)) gm.holder = kids[0];
    const B = this.ball;
    if (gm.flight && !hasBall) gm.flight = null;      // only the game that has the ball throws it
    if (gm.flight) {
      const f = gm.flight;
      f.t += dt;
      const k = Math.max(0, Math.min(1, f.t / f.dur));
      B.position.lerpVectors(f.a, f.b, k);
      B.position.y += Math.sin(k * Math.PI) * f.h;
      B.rotation.x += dt * 9;
      if (k >= 1) {
        gm.flight = null;
        gm.holder = f.to;
        gm.t = 1 + Math.random() * 1.6;
        if (hasBall && f.to.n.pos.distanceTo(p.pos) < 14) this.d.audio?.land?.(0.2);
      }
    } else if (hasBall) {
      gm.holder.n.head(B.position); B.position.y -= gm.holder === this.mika ? 0.45 : 0.75;
    }
    if (hasBall) B.visible = gm.holder.n.visible && !gm.holder.n.far;
    for (const k of kids) {
      if (k === gm.holder || k.n.path) continue;
      const target = gm.flight ? B.position : gm.holder.n.pos;   // (Mika's pos when she holds it)
      k.n.lookAt(target.x, target.z);
      // shuffle about a little while waiting
      if (Math.random() < dt * 0.25) { const q = this.roam(gm, k.n, 3.5); if (q) k.n.walk([q], null, 1.4); }
    }
    // Mika throws when she likes (ballAct); the kids throw on their own, to her half the time
    if (!hasBall || gm.flight || gm.t > 0 || gm.holder === this.mika || players.length < 2) return;
    const others = players.filter(k => k !== gm.holder);
    const to = mika && Math.random() < 0.5 ? this.mika : others[Math.floor(Math.random() * others.length)];
    this.throwBall(gm, gm.holder, to);
  }

  tagStep(gm, kids, dt) {
    if (!gm.it || !kids.includes(gm.it)) gm.it = kids[Math.floor(Math.random() * kids.length)];
    const it = gm.it;
    const run = it.n.anim?.has?.('Run');
    for (const k of kids) {
      const n = k.n;
      if (k === it) {
        // the chaser picks the nearest and runs at them
        let best = null, bd = Infinity;
        for (const o of kids) if (o !== it) { const dd = o.n.pos.distanceTo(n.pos); if (dd < bd) { bd = dd; best = o; } }
        if (!best) continue;
        if (bd < 0.9 && gm.t <= 0) {
          gm.it = best; gm.t = 1.6;                       // tagged! a moment's grace before the new chaser starts
          n.path = null; n.anim?.once?.(this.clipFor(n, 'Cheer'), { then: 'Idle' });
          best.n.path = null;
          continue;
        }
        if (gm.t > 0) continue;
        if (!n.path || (k.retarget = (k.retarget ?? 0) - dt) <= 0) {
          k.retarget = 0.4;
          if (legClear(this.roads, n.pos.x, n.pos.z, best.n.pos.x, best.n.pos.z)) n.walk([[best.n.pos.x, best.n.pos.z]], null, run ? 3.4 : 2.2, run ? 'Run' : 'Walk');
        }
      } else if (!n.path) {
        const dd = n.pos.distanceTo(it.n.pos);
        if (dd < 4.5 || Math.random() < dt * 0.3) {
          // run away from the chaser, staying in the playground
          const away = [n.pos.x + (n.pos.x - it.n.pos.x) / (dd || 1) * 3, n.pos.z + (n.pos.z - it.n.pos.z) / (dd || 1) * 3];
          const ok = Math.hypot(away[0] - gm.at[0], away[1] - gm.at[1]) < 5.5 && legClear(this.roads, n.pos.x, n.pos.z, away[0], away[1]);
          const q = ok ? away : this.roam(gm, n);
          if (q) n.walk([q], null, run ? 3.2 : 2, run ? 'Run' : 'Walk');
        } else n.lookAt(it.n.pos.x, it.n.pos.z);
      }
    }
  }

  hopStep(gm, kids, dt) {
    if (gm.t > 0) return;
    gm.t = 1.4 + Math.random() * 0.8;
    const k = kids[gm.turn++ % kids.length];
    k.n.anim?.once?.(this.clipFor(k.n, 'Jump'), { then: 'Idle' });
    for (const o of kids) if (o !== k) { o.n.lookAt(k.n.pos.x, k.n.pos.z); if (Math.random() < 0.3) o.n.anim?.once?.(this.clipFor(o.n, 'Cheer'), { then: 'Idle' }); }
  }

  /** A plan block's or conversation's extra conditions: lamps lit, and how far a neighbour's own story has come. */
  holds(w) {
    const st = this.d.q.state;
    if (w.lamps !== undefined && Object.values(st.lamps || {}).filter(Boolean).length < w.lamps) return false;
    for (const [id, n] of Object.entries(w.folk || {})) if ((st.folk?.[id]?.stage || 0) < n) return false;
    if (w.chapter && (st.chapter < w.chapter[0] || st.chapter > w.chapter[1])) return false;
    return true;
  }

  // ------------------------------------------------------------------ overheard conversations
  convoFits(c, a, b, ctx, heard) {
    if (heard.has(c.id) && !c.generic) return false;
    if (c.after && !heard.has(c.after)) return false;
    const w = c.when || {};
    if (w.chapter && (ctx.chapter < w.chapter[0] || ctx.chapter > w.chapter[1])) return false;
    if (w.season && w.season !== ctx.season) return false;
    if (w.night !== undefined && w.night !== isNight(ctx.hour)) return false;
    if (w.lamps !== undefined && ctx.lamps < w.lamps) return false;
    if (w.folk && !this.holds({ folk: w.folk })) return false;
    const kindOk = (want, n) => want === 'any' ? n.barkKind !== 'kid' : n.barkKind === want;
    const generic = ['man', 'woman', 'kid', 'any'].includes(c.a);
    if (!generic) return (c.a === a.p.id && c.b === b.p.id) || (c.a === b.p.id && c.b === a.p.id);
    return (kindOk(c.a, a.n) && kindOk(c.b, b.n)) || (kindOk(c.a, b.n) && kindOk(c.b, a.n));
  }

  pickConvo(a, b) {
    const st = this.d.q.state, heard = new Set(st.heard || []);
    const ctx = { chapter: st.chapter, season: this.g.shownSeason || this.g.time.season, hour: this.g.shownHour(), lamps: Object.values(st.lamps || {}).filter(Boolean).length };
    const fits = CONVOS.filter(c => this.convoFits(c, a, b, ctx, heard));
    if (!fits.length) return null;
    // their own running story first (in order), then the general chit-chat, avoiding what was just said
    const own = fits.filter(c => !['man', 'woman', 'kid', 'any'].includes(c.a));
    if (own.length) return { c: own[0], swap: own[0].a !== a.p.id };
    const recent = this.recentGeneric ??= [];
    const fresh = fits.filter(c => !recent.includes(c.id));
    const c = (fresh.length ? fresh : fits)[Math.floor(Math.random() * (fresh.length ? fresh : fits).length)];
    recent.push(c.id); if (recent.length > 8) recent.shift();
    const aFits = c.a === 'any' ? a.n.barkKind !== 'kid' : a.n.barkKind === c.a;
    const bFits = c.b === 'any' ? b.n.barkKind !== 'kid' : b.n.barkKind === c.b;
    return { c, swap: !(aFits && bFits) };
  }

  updateConvos(dt, frozen) {
    const d = this.d, B = d.barks, p = this.g.player.pos;
    const hushed = frozen || !!(d.minigame || d.ui.dialogueOpen || d.ui.overlay || this.g.paused || this.g.interiors?.active);
    const C = this.convo;
    if (C) {
      const a = this.byId.get(C.a).n, b = this.byId.get(C.b).n;
      const gone = !a.visible || !b.visible || this.byId.get(C.a).chatWith !== C.b;
      C.t -= dt;
      if (hushed || gone) { if (gone) this.convo = null; return; }
      B.clock.sinceLast = 0;                                  // the rest of the valley lets them talk
      if (C.t > 0) return;
      if (C.i >= C.lines.length) {
        const st = d.q.state;
        if (!C.c.generic && Math.hypot((a.pos.x + b.pos.x) / 2 - p.x, (a.pos.z + b.pos.z) / 2 - p.z) < BARK_RANGE + 6) (st.heard ||= []).includes(C.c.id) || st.heard.push(C.c.id);
        this.pairs.get([C.a, C.b].sort().join('|')).t = CONVO_COOL;
        this.convo = null;
        return;
      }
      const [who, text] = C.lines[C.i++];
      const id = (who === 'a') !== C.swap ? C.a : C.b;
      const n = id === C.a ? a : b;
      B.ui.show(`convo:${id}`, text, out => { n.head(out); out.y += 0.3; return out; }, { name: tx(n.name || ''), life: LINE_TIME });
      if (n.anim?.has?.('Talk') && !n.anim.busy) n.anim.play('Talk');
      if (n.pos.distanceTo(p) < 14) d.audio?.blip?.({ kid: 1.4, woman: 1.15, man: 0.9 }[n.barkKind] ?? 1);
      C.t = LINE_TIME * 0.82;
      return;
    }
    if (hushed) return;
    for (const pr of this.pairs.values()) {
      pr.t -= dt;
      if (pr.t > 0) continue;
      const A = this.byId.get(pr.a), Bp = this.byId.get(pr.b);
      if (A?.chatWith !== pr.b || Bp?.chatWith !== pr.a || A.cmd?.type !== 'chat' || Bp.cmd?.type !== 'chat') { pr.t = 1; continue; }
      if (!A.n.visible || !Bp.n.visible || A.n.far) { pr.t = 2; continue; }
      const mid = Math.hypot((A.n.pos.x + Bp.n.pos.x) / 2 - p.x, (A.n.pos.z + Bp.n.pos.z) / 2 - p.z);
      if (mid > BARK_RANGE) { pr.t = 1; continue; }
      if (A.n.pos.distanceTo(Bp.n.pos) > 4) { pr.t = 1; continue; }
      const pick = this.pickConvo(A, Bp);
      if (!pick) { pr.t = CONVO_COOL; continue; }
      pick.c.generic = ['man', 'woman', 'kid', 'any'].includes(pick.c.a);
      this.convo = { a: A.p.id, b: Bp.p.id, c: pick.c, swap: pick.swap, lines: pick.c.lines, i: 0, t: 0 };
      return;
    }
  }

  // ------------------------------------------------------------------ talking and shopping
  foldState() {
    const q = this.d.q, st = q.state;
    return { folk: st.folk, mon: st.mon, inv: st.inv, chapter: st.chapter, lamps: st.lamps, done: id => STEP_INDEX[st.step] > STEP_INDEX[id] };
  }

  /** Items the story still needs from here on (never sold away). */
  storyNeeds() {
    const out = new Set(), i = STEP_INDEX[this.d.q.state.step];
    for (const s of STEPS.slice(i)) {
      for (const k of Object.keys(s.done?.have || {})) out.add(k);
      for (const e of [...(s.enter || []), ...(s.exit || [])]) if (e.take) out.add(e.take[0]);   // e.g. the cooking pot's chestnuts
    }
    return out;
  }

  apply(fx) {
    const st = this.d.q.state, ui = this.d.ui;
    const before = { ...st.inv };
    applyEffects(st, fx);
    st.folk = { ...st.folk };
    if (fx.mon > 0) { ui.toast(tx('+{n} mon', { n: fx.mon }), 'mon'); this.d.audio.pickup(); }
    for (const [k, n] of Object.entries(fx.items || {})) {
      const it = ITEMS[k];
      if (!it) continue;
      if (n > 0) ui.toast(tx('Received: {item}', { item: tx(it.name) }), it.icon);
      else if (n < 0 && (before[k] || 0) > 0) ui.toast(tx('Gave: {item}', { item: tx(it.name) }), it.icon);
    }
    this.d.refreshHud?.();
  }

  /** Mika talks to a neighbour (or their counter body indoors). */
  async talk(it, body) {
    const d = this.d;
    if (d.busy) return;
    const saved = d.npcs[it.p.id];
    // the person stops what they are doing to listen
    const walking = body.path ? { path: body.path, done: body.onPathDone, speed: body.speed, clip: body.walkClip } : null;
    body.path = null;
    d.npcs[it.p.id] = body;                       // the dialogue animates whichever body Mika is facing
    d.busy++;
    try {
      const shopKey = body.shopKey || (this.atStall(it, body) ? it.p.shop : null);
      if (shopKey) await this.shop(it, body, shopKey);
      else await this.chat(it);
    } finally {
      d.busy--;
      d.npcs[it.p.id] = saved;
      if (walking) body.walk(walking.path, walking.done, walking.speed, walking.clip);
      else body.setIdle(body.idleClip);
      d.save?.();
    }
  }

  async chat(it) {
    const st = this.foldState();
    const r = talkTo(it.p, st, this.storyNeeds());
    let lines = r.lines;
    if (!lines.length) lines = [[it.p.id, tx('Lovely day for it.')]];
    await this.d.dialogueBody(lines, { local: true });
    this.apply(r.effects);
  }

  async shop(it, body, key) {
    const d = this.d, s = SHOPS[key], st = d.q.state, id = it.p.id;
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    let opening = [[id, pick(s.hello)]];
    for (let guard = 0; guard < 30; guard++) {
      const offer = shopOffer(s, this.foldState(), GOODS, this.storyNeeds());
      const options = [
        ...offer.buy.map(b => ({ text: tx('Buy {item} ({price} mon)', { item: tx(b.name), price: b.price }), value: `buy:${b.key}` })),
        ...offer.sell.map(x => ({ text: tx('Sell {item} (+{price} mon, have {n})', { item: tx(ITEMS[x.key]?.name || x.name), price: x.price, n: x.have }), value: `sell:${x.key}` })),
        { text: tx('Just chat'), value: 'chat' },
        { text: tx('Goodbye'), value: 'bye' },
      ];
      const purse = [id, tx('You have {n} mon.', { n: st.mon || 0 })];
      const v = await d.dialogueBody([...opening, purse, { id: 'shop', choice: options }], { local: true });
      opening = [];
      if (!v || v === 'bye') { await d.dialogueBody([[id, pick(s.bye), 'Wave']], { local: true }); return; }
      if (v === 'chat') { await this.chat(it); return; }
      const [op, item] = v.split(':');
      const r = op === 'buy' ? buy(s, item, this.foldState(), GOODS) : sell(s, item, this.foldState(), this.storyNeeds());
      if (!r.ok) { d.audio.bad(); opening = [[id, r.reason === 'broke' ? pick(s.broke) : tx('Hm, not today.')]]; continue; }
      this.apply(r.effects);
      d.audio.good();
      opening = [[id, s.thanks?.[item] || tx('Thank you kindly!'), 'Bow']];
    }
  }

  /** For the journal: the neighbours Mika has met and how their stories stand. */
  journal() { return folkJournal(PEOPLE, this.foldState()); }
}

export { PERSON };
