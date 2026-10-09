import * as THREE from 'three';
import { Quest } from './quest.js';
import { storyId } from './stories/index.js';
import { DIALOGUE, ITEMS, STEPS, STEP_INDEX, FISH, CHAPTERS, CAST, FRIENDS, KEEPSAKES, TREASURES, SKY_LETTERS, GIFTS, HUNT, huntProgress } from './story.js';
import { tx, N_ } from '../i18n/i18n.js';
import { NPC } from '../actors/npc.js';
import { Tamo } from '../actors/tamo.js';
import { Wildlife } from '../actors/animals.js';
import { Fishing, Cooking } from './minigames.js';
import { Scenes } from './scenes.js';
import { PLACES, FALLEN_STARS, DECK_Y, river, riverHalfWidth } from '../world/layout.js';
import { clockLabel } from '../world/seasons.js';
import { STOPS } from '../world/railway.js';
import { BarkBubbles } from '../ui/barks-ui.js';
import { TownLife } from './townlife.js';
import { Indoors } from './indoor.js';
import { Tricks } from './tricks.js';
import { SHOPS } from '../content/shops.js';

const SHOP_ROOMS = new Set(Object.values(SHOPS).map(s => s.room).filter(Boolean));
import { VILLAGERS, RETURNING, ROUTES } from '../content/villagers.js';
import { BARK_RANGE, BARK_NEAR, BarkClock, pickBark, zoneAt } from './barks.js';

const SAVE_KEY = 'starline-save-1';
const FRIEND_BY_KIND = Object.fromEntries(FRIENDS.map(f => [f.id, f]));
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Binds the quest engine to the world: NPCs, interactions, sparks, pickups, zones, effects, saving. */
export class Director {
  constructor(game, ui, audio, fx) {
    this.game = game;
    this.ui = ui;
    this.audio = audio;
    this.fx = fx;
    this.world = game.world;
    this.queue = Promise.resolve();
    this.busy = 0;
    this.interactables = new Map();
    this.targets = new Map();
    this.pickups = new Map();
    this.zones = new Map();
    this.npcs = {};
    this.minigame = null;
    this.stepClock = 0;
    this.saveClock = 0;
    this.slot = 1;
    this.tamo = new Tamo(game.scene, game.assets);
    this.tamo.pool = game.lights;
    this.wildlife = new Wildlife(game.scene, game.assets, game.world, game.colliders);
    this.wildlife.onPenned = () => this.event({ type: 'count', item: 'sheep' });
    this.scenes = new Scenes(this);
    this.spawnCast();
    // the remarks people call out as Mika walks past (game/barks.js says what, ui/barks-ui.js draws the bubbles)
    this.barks = { clock: new BarkClock(), ui: new BarkBubbles(), recent: new Set(), mine: new Map(), scan: 0, lit: new Set() };
    this.registerStatic();
  }

  // ------------------------------------------------------------------ setup
  spawnCast() {
    const g = this.game;
    const mk = (id, model, x, z, facing, opts) => (this.npcs[id] = new NPC(g.scene, g.assets, g.world, id, model, { x, z, facing, ...opts }));
    mk('genzo', 'genzo', -104, 117, Math.PI / 2);
    mk('rin', 'rin', 3.4, 31.2, Math.PI / 2);
    mk('ota', 'ota', -24, -40, Math.PI / 2);
    mk('hana', 'hana', 103.5, 16, Math.PI / 2);
    // the Grandma story: Grandma Sora herself, and Mika's parents for the ending (hidden in Classic; see placeGrandma)
    if (g.assets.has('sora')) mk('sora', 'sora', -54.6, 135.2, Math.PI / 2).setVisible(false);
    for (const [id, model, seed] of [['mom', 'villager-woman', 91], ['dad', 'villager-man', 97]]) mk(id, model, -55, 137, Math.PI / 2, { tint: NPC.villagerTint(seed) }).setVisible(false);
    const villagers = VILLAGERS;
    villagers.forEach(([id, model, x, z, f], i) => {
      const n = mk(id, model, x, z, f, { tint: NPC.villagerTint(i + 1) });
      n.villager = true;
      n.barkKind = model.slice(9);
      n.setIdle(i % 3 === 0 ? 'Talk' : 'Idle');
    });
    this.npcs.v7.setVisible(false);
    // people who left the valley come home as the lamps are lit (shown by placeCast)
    this.returning = RETURNING;
    this.returning.forEach(([id, model, x, z, f], i) => {
      const n = mk(id, model, x, z, f, { tint: NPC.villagerTint(i + 8) });
      n.villager = true;
      n.barkKind = model.slice(9);
      n.setIdle(i % 2 ? 'Talk' : 'Idle');
      n.setVisible(false);
    });
    // everyday routes: villagers stroll between a few spots and pause to chat
    this.routes = ROUTES;
    this.routeState = {};
  }

  /**
   * Where Grandma Sora is in her story: on the platform to meet Mika, at the cottage for the prologue, in her garden
   * through the year (always there to talk to), with the crowd at the meeting and on the platform for the Star Train,
   * and at home with Mika's parents after the festival. Classic has no Grandma on screen.
   */
  /** Mika's parents (and Grandma) on the platform beside Mika, just off the Star Train, for the ending. */
  parentsArrive() {
    const p = this.game.player.pos, f = this.game.player.facing;
    const fwd = V(Math.sin(f), 0, Math.cos(f)), side = V(Math.cos(f), 0, -Math.sin(f));
    [['mom', 1.6, -0.6], ['dad', 1.6, 0.6], ['sora', 1.2, -1.6]].forEach(([id, a, b]) => {
      const n = this.npcs[id];
      if (!n) return;
      const x = p.x + fwd.x * a + side.x * b, z = p.z + fwd.z * a + side.z * b;
      if (n.riding) { n.root.removeFromParent(); this.game.scene.add(n.root); n.riding = false; n.root.rotation.set(0, 0, 0); }
      n.setVisible(true);
      n.place(x, z, Math.atan2(p.x - x, p.z - z), p.y);
      n.setIdle('Wave');
    });
  }

  placeGrandma(step, ch, after) {
    const n = this.npcs, so = n.sora, grandma = storyId() === 'grandma', y = 16.95;
    // Mum and Dad are only seen arriving on the Star Train (parentsArrive): afterwards they went back to work
    for (const id of ['mom', 'dad']) if (n[id] && !n[id].riding) n[id].setVisible(false);
    if (!so) return;
    so.setVisible(grandma);
    if (!grandma || so.riding) return;     // on the Star Train she keeps her seat until the ride is over
    if (step === 'p.arrive') so.place(-91.2, 117.2, -Math.PI / 2, y);
    else if (step === 'p.cottage' || step === 'p.chest' || step === 'p.porch') so.place(-55.6, 139.4, Math.PI / 2);
    else if (step === 'c4.board' || step === 'c4.ride') so.place(-93.2, 117.3, -Math.PI / 2, y);   // down the platform: Genzo is the one to board with
    else if (step === 'c4.meeting' || (ch === 4 && after('c4.meeting') && !after('c4.lamp'))) so.place(-96.6, 116.6, Math.PI, y);
    else if (ch === 5) so.place(-55.6, 139.4, Math.PI / 2);
    else so.place(-54.6, 135.2, Math.PI / 2);   // her garden beside the cottage
    so.setIdle('Idle');
  }

  /** The "Talk to ..." interaction for one person (villagers, the cast, and the residents of the houses). */
  registerTalk(id) {
    const n = this.npcs[id];
    this.interact(`talk:${id}`, null, () => (n.villager ? tx('Talk to the villager') : tx('Talk to {name}', { name: tx(CAST[id]?.name || id) })),
      () => n.visible && this.q.state.step !== 'p.arrive' && this.scenes?.active !== 'starTrain', () => this.talk(id), 2.6, () => n.head(), () => (this.q?.step?.talk?.[id] ? 1 : id === 'sora' ? 0.6 : 0));   // Grandma wins over her dog in the garden
  }

  // ------------------------------------------------------------------ residents of the houses
  /** Someone lives in each ordinary house: they stand at the room's `Spot_npc_*` nodes and show only while that room does. */
  spawnResidents() {
    const g = this.game, I = g.interiors;
    this.residents = [];
    if (!I) return;
    const hash = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    let k = 0;
    for (const room of I.rooms.values()) {
      (room.spots || []).forEach((s, i) => {
        const h = hash(`${room.id}:${i}`);
        if (i > 0 && h % 2) return;                                   // the second spot is filled in every other house
        if (i === 0 && SHOP_ROOMS.has(room.id)) return;               // the shopkeeper stands behind the counter (townlife.js)
        const model = i > 0 && h % 3 === 0 ? 'villager-kid' : h % 2 ? 'villager-woman' : 'villager-man';
        const id = `res:${room.id}:${i}`;
        const n = new NPC(g.scene, g.assets, g.world, id, model, { x: s.pos.x, z: s.pos.z, facing: s.yaw, tint: NPC.villagerTint(40 + k++) });
        n.place(s.pos.x, s.pos.z, s.yaw, s.pos.y);
        n.villager = true; n.barkKind = model.slice(9); n.resident = room.id; n.spotYaw = s.yaw;
        n.setIdle(i ? 'Talk' : 'Idle');
        n.setVisible(false);
        this.npcs[id] = n;
        this.residents.push(n);
        this.registerTalk(id);
      });
    }
  }

  /** Residents appear while Mika is in their house, and turn to her when she comes close. */
  updateResidents() {
    if (!this.residents?.length) return;
    const act = this.game.interiors?.active || null, p = this.game.player.pos;
    for (const n of this.residents) {
      const here = n.resident === act;
      if (n.visible !== here) n.setVisible(here);
      if (!here) continue;
      if (n.pos.distanceTo(p) < 4.5) n.lookAt(p.x, p.z); else n.targetFacing = n.spotYaw;
    }
  }

  // ------------------------------------------------------------------ barks
  /** Who may say something now: the visible people outdoors, or the residents of the room Mika is in. */
  barkSpeakers() {
    const inside = this.game.interiors?.active || null, out = [];
    for (const [id, n] of Object.entries(this.npcs)) {
      if (!n.visible || n.riding || (n.path && n.speed > 3)) continue;
      if ((n.resident || null) !== inside) continue;
      out.push([id, n]);
    }
    return out;
  }

  /** What the remarks may depend on: the season, hour and weather shown on screen, and how far the story has come. */
  barkContext() {
    const g = this.game, season = g.shownSeason || g.time.season;
    return { season, hour: g.shownHour(), weather: season === 'winter' && !g.weatherOff ? 'snow' : null, chapter: this.q.state.chapter, place: null };
  }

  updateBarks(dt) {
    const B = this.barks, g = this.game, p = g.player;
    for (const id of B.clock.update(dt)) {
      const n = this.npcs[id];
      if (n && B.lit.delete(id) && !n.path) n.setIdle(n.idleClip); // back to what they were doing
    }
    // while something owns the screen the bubbles are hidden (they keep their time), and nobody starts a new one
    const hushed = !!(this.busy || this.scenes.active || this.minigame || this.ui.dialogueOpen || this.ui.overlay || g.paused);
    B.ui.update(dt, g.camera, hushed);
    B.scan -= dt;
    if (hushed || B.scan > 0) return;
    B.scan = 0.35;
    let best = null, bd = Infinity;
    for (const [id, n] of this.barkSpeakers()) {
      const d = n.pos.distanceTo(p.pos);
      if (d > BARK_RANGE) continue;
      if (!B.clock.next.has(id)) { B.clock.prime(id, 0.6 + Math.random() * 6); continue; } // a beat before the first remark of a new face
      if (B.clock.canSpeak(id) && d < bd) { bd = d; best = [id, n]; }
    }
    if (!best) return;
    const [id, n] = best;
    const kind = n.barkKind || id, rv = river.nearest(n.pos.x, n.pos.z, 12);
    const ctx = { ...this.barkContext(), place: n.resident ? null : zoneAt(n.pos.x, n.pos.z, !!rv && rv.d - riverHalfWidth(rv.z) < 5) };
    const mine = B.mine.get(id) || B.mine.set(id, new Set()).get(id);
    const memory = new Set([...B.recent, ...mine]);
    const text = pickBark(kind, ctx, memory);
    if (!text) { B.clock.next.set(id, B.clock.t + 12); return; }
    for (const s of [B.recent, mine]) { s.add(text); while (s.size > (s === mine ? 6 : 24)) s.delete(s.values().next().value); }
    const named = !n.villager || !!n.folk;
    B.ui.show(id, text, out => { n.head(out); out.y += 0.3; return out; }, { name: named ? tx(n.folk?.name || CAST[id]?.name || id) : '', life: B.clock.life });
    B.clock.spoke(id);
    // they look up and talk with their hands while the bubble is up (unless they are mid-walk)
    if (!n.path) { n.lookAt(p.pos.x, p.pos.z); if (n.anim?.has?.('Talk')) { n.anim.play('Talk'); B.lit.add(id); } }
    if (bd < BARK_NEAR * 2) this.audio?.blip?.(CAST[id]?.pitch ?? { kid: 1.4, woman: 1.15, man: 0.9 }[kind] ?? 1);
  }

  /** Level of detail for people, a few times a second: near ones full, mid-range ones cheaper, far ones not drawn. */
  updateDetail(dt) {
    if ((this.detailT = (this.detailT ?? 0) - dt) > 0) return;
    this.detailT = 0.3;
    const q = this.game.renderer?.q || {}, c = this.game.camera.position, p = this.game.player.pos;
    const anim = q.npcAnim ?? 40, draw = q.npcDraw ?? 115, shade = q.npcShadow ?? 30;
    const story = this.scenes.active || this.busy;            // cut-scenes and dialogue frame anyone: keep everyone whole
    let i = 0;
    for (const n of Object.values(this.npcs)) {
      if (n.animTick === 0) n.animTick = i++;                 // stagger the reduced-rate updates
      const d = Math.min(n.pos.distanceTo(p), n.pos.distanceTo(c));
      const hyst = n.far ? -5 : 5;                            // a little hysteresis so nobody flickers at the edge
      const tier = story || n.resident ? 0 : d > draw + hyst ? 2 : d > anim + (n.animEvery > 1 ? -3 : 3) ? 1 : 0;
      n.setDetail(tier, tier === 0 && d < shade + (n.shadow ? 3 : -3));
    }
  }

  /** The meeting in the square holds everyone in place (and the neighbours' day plans pause). */
  townFrozen() {
    return this.scenes.active === 'meeting' || this.q.state.step === 'c4.meeting' || this.q.state.chapter === 4 && STEP_INDEX[this.q.state.step] > STEP_INDEX['c4.gather'] && STEP_INDEX[this.q.state.step] < STEP_INDEX['e.free'];
  }

  updateVillagers(dt) {
    const onStage = this.scenes.active === 'meeting' || this.q.state.step === 'c4.meeting' || this.q.state.chapter === 4 && STEP_INDEX[this.q.state.step] > STEP_INDEX['c4.gather'] && STEP_INDEX[this.q.state.step] < STEP_INDEX['e.free'];
    for (const [id, route] of Object.entries(this.routes)) {
      const n = this.npcs[id];
      if (!n || n.path || onStage || n.riding || this.busy) continue;
      const st = this.routeState[id] ??= { i: 0, wait: 2 + Math.random() * 6 };
      st.wait -= dt;
      if (st.wait > 0) continue;
      st.i = (st.i + 1) % route.length;
      const [x, z] = route[st.i];
      n.walk([[x, z]], () => { st.wait = 4 + Math.random() * 7; n.setIdle(Math.random() < 0.4 ? 'Talk' : 'Idle'); }, 1.25);
    }
  }

  /** Kobo's everyday timetable: station <-> west tunnel (the whole line once the viaduct is repaired). */
  updateTrain(dt) {
    const r = this.game.railway;
    if (this.scenes.active || this.q.state.step === 'c4.ride' || this.q.state.step === 'p.arrive') return;
    const T = r.train;
    const tt = this.timetable ??= { phase: 'wait', t: 20 };
    if (T.target !== null) return;
    tt.t -= dt;
    if (tt.t > 0) return;
    const epilogue = this.q.state.chapter === 5;
    if (tt.phase === 'wait') {
      const atStation = Math.abs(T.s - STOPS.station) < 20;
      // the Sunday service shuttles between the station and Takamori Halt, stopping at both so Mika can ride
      const dest = epilogue ? (atStation ? STOPS.halt : STOPS.station) : (atStation ? STOPS.westPortal - 12 : STOPS.station);
      r.goTo(dest, epilogue ? 9 : 8);
      if (this.game.player.pos.distanceTo(r.cars[0].obj.position) < 150) this.audio.whistle();
      tt.phase = 'run';
    } else {
      tt.phase = 'wait';
      tt.t = Math.abs(T.s - STOPS.station) < 20 || Math.abs(T.s - STOPS.halt) < 20 ? 35 : 45;
    }
  }

  registerStatic() {
    const S = this.game.structures;
    const L = this.game.structures.lamps;
    const at = (obj, fallback) => { if (!obj) return fallback; const p = new THREE.Vector3(); obj.getWorldPosition(p); return p; };
    // interactables
    const chestPos = at(S.nodes.chest, V(-55.6, 16.6, 138.4));
    this.interact('chest', chestPos, N_('Open Sora\'s chest'), () => this.step('p.chest'), () => this.event({ type: 'interact', target: 'chest' }), 2.4);
    this.interact('fishingSpot', V(4.2, 0.9, 30), N_('Fish'), () => this.q.unlocked('ferry') || this.q.has('canFish'), () => this.startFishing(), 2.6);
    const mill = S.byId.get('mill');
    this.interact('millAxle', V(mill.x + 4.2, mill.y + 1, mill.z + 2.2), N_('Fit the cogs and repair the wheel'), () => this.step('c1.wheel'), () => this.event({ type: 'interact', target: 'millAxle' }), 3.2);
    this.interact('drawbridgeUp', V(-9.8, 1.2, -45), N_('Look at the drawbridge'), () => !this.q.unlocked('drawbridge'), () => this.say('drawbridge_up'), 2.4);
    this.interact('ferryWest', V(-0.6, 0.9, 30), N_('Take the ferry across'), () => !this.world.frozen && this.npcs.rin.visible && this.game.player.pos.x < 12, () => this.ferry('east'), 2.4);
    this.interact('ferryEast', V(24.2, 0.9, 30), () => (this.step('c2.ferry') ? tx("Call Rin's ferry") : tx('Take the ferry back')), () => !this.world.frozen && this.game.player.pos.x > 12,
      () => this.ferry(this.step('c2.ferry') ? 'east' : 'west'), 2.4);
    // in winter the ferry is frozen in: the whole river is a road
    for (const [id, x] of [['ferryIceW', -0.6], ['ferryIceE', 24.2]]) this.interact(id, V(x, 0.9, 30), N_('Look at the frozen ferry'), () => !!this.world.frozen, () => this.say('ferry_frozen'), 2.4);
    const gal = this.game.structures.gallery || { x: 115, z: -4, y: 31.92 };
    this.interact('towerDoor', V(gal.x, gal.y - 10.6, gal.z + 2.8), N_('Climb the bell tower'), () => this.game.player.pos.y < gal.y - 3, () => this.tower(true), 2.2);
    this.interact('towerExit', V(gal.x, gal.y + 0.4, gal.z + 2.0), N_('Go back down'), () => this.game.player.pos.y > gal.y - 1, () => this.tower(false), 1.4, null, 1);
    this.interact('bell', V(gal.x, gal.y + 0.8, gal.z), N_('Ring the bell'), () => this.game.player.pos.y > gal.y - 1 && this.step('c2.bell'), () => this.ringBell(), 3.6, null, 2);
    this.interact('orchardGate', V(85, 22, -79), N_('The gate is locked'), () => !this.q.unlocked('orchardGate'), () => this.say('gate_locked'), 3);
    this.interact('shrineHearth', V(PLACES.forestHearth.x, 12.3, PLACES.forestHearth.z), N_('Cook honey chestnuts'), () => this.step('c3.cook'), () => this.startCooking(), 2.6);
    this.interact('bear', V(PLACES.bearSpot.x, 12.6, PLACES.bearSpot.z), N_('Offer the honey chestnuts'), () => this.step('c3.bear') && this.q.count('honeyChestnuts') > 0 && this.wildlife.story.bear?.visible, () => this.event({ type: 'interact', target: 'bear' }), 4.5, null, 2);
    this.interact('bearBlocked', V(PLACES.bearSpot.x, 12.6, PLACES.bearSpot.z), N_('Look at the sleeping bear'), () => !this.step('c3.bear') && this.wildlife.story.bear?.visible && !this.q.unlocked('shrineStairs'), () => this.say('bear_blocked'), 4.5);
    this.interact('gap', V(-1.2, DECK_Y, 120), N_('Look at the broken span'), () => !this.step('c4.repair') && !this.q.unlocked('viaduct'), () => this.say('gap_blocked'), 2.4);
    [118.8, 120, 121.2].forEach((z, i) => this.interact(`beam${i + 1}`, V(-1.4, DECK_Y, z), () => tx('Set beam {n}', { n: i + 1 }), () => this.step('c4.repair') && this.q.count('beams') === i, () => this.setBeam(i), 1.6));
    // the Sunday service: once the story is done, Mika can ride Kobo whenever he waits at a platform
    const trainWaiting = stop => {
      const T = this.game.railway.train;
      return this.q?.state.chapter === 5 && T.target === null && Math.abs(T.s - stop) < 20 && !this.scenes.active;
    };
    this.interact('rideStation', V(-90, 17.4, 116.6), N_('Ride Kobo to Takamori'), () => trainWaiting(STOPS.station), () => this.scenes.play('tour'), 3.5, null, 1);
    this.interact('rideHalt', V(PLACES.halt.x - 3, this.world.heightAt(PLACES.halt.x - 3, PLACES.halt.z) + 0.5, PLACES.halt.z + 1), N_('Ride Kobo to Hoshi Station'), () => trainWaiting(STOPS.halt), () => this.scenes.play('tour'), 4, null, 1);
    this.registerHomes();
    this.registerRewards();
    // valley friends: say hello to whichever creature is next to Mika
    this.interact('friend', null, () => tx(this.friendNear?.def.verb || ''), () => !!this.friendNear, () => this.befriend(this.friendNear), 6, () => this.friendNear?.a.pos, -0.4, 4);   // a hello never takes the place of the story (a cat by the chest)
    // NPC talk
    for (const id of Object.keys(this.npcs)) this.registerTalk(id);
    // the named neighbours: day plans, shops, games and their own stories (game/townlife.js)
    this.town = new TownLife(this);
    this.town.spawn();
    // things to do inside the houses, and the house memories (game/indoor.js)
    this.indoor = new Indoors(this);
    this.indoor.spawn();
    // Grandma's countryside tricks: signs, teaching, rounds and the journal Tricks tab (game/tricks.js)
    this.tricks = new Tricks(this);
    // spark targets
    this.target('porchLamp', at(S.nodes.porchFlame, V(-55.8, 18.5, 141.4)), N_('Light the porch lamp'), () => this.step('p.porch'), p => this.lightPorch(p), { r: 5.5, vy: 5 });
    this.target('millLamp', L.get('mill')?.flame, N_('Light the Mill Lamp'), () => this.step('c1.lamp'), () => this.event({ type: 'spark', target: 'millLamp' }), { r: 7.5, vy: 10 });
    // the Orchard Lamp works from the gallery or from the foot of the tower
    this.target('orchardLamp', L.get('orchard')?.flame, N_('Light the Orchard Lamp'), () => this.step('c2.lamp'), () => this.event({ type: 'spark', target: 'orchardLamp' }), { r: 10, vy: 24 });
    this.target('forestLamp', L.get('forest')?.flame, N_('Light the Forest Lamp'), () => this.step('c3.lamp'), () => this.event({ type: 'spark', target: 'forestLamp' }), { r: 7.5, vy: 10 });
    this.target('viaductLamp', L.get('viaduct')?.flame, N_('Light the Viaduct Lamp'), () => this.step('c4.lamp'), () => this.event({ type: 'spark', target: 'viaductLamp' }), { r: 7.5, vy: 10 });
    S.nodes.scarecrows.forEach((s, i) => {
      const bell = at(s.bell, V(s.x, s.y + 1.7, s.z));
      this.target(`bell${i}`, bell, N_('Ring the scarecrow bell'), () => this.step('c2.crows') && !this.q.has(`bell${i}`), () => {
        this.q.state.flags[`bell${i}`] = true;
        this.audio.bell();
        this.bellSwing = { node: s.bell, t: 0 };
        this.wildlife.scareCrow(i);
        this.event({ type: 'count', item: 'bells' });
      }, { r: 4.2, vy: 4 });
    });
    // zones
    this.zone('cottage', V(-55, 16, 140), 7, () => this.step('p.cottage'));
    this.zone('orchardGate', V(85, 22, -86), 6, () => this.step('c3.fox'));
    this.zone('bear', V(PLACES.bearSpot.x, 12, PLACES.bearSpot.z + 4), 11, () => this.step('c3.follow'));
    this.zone('landslide', V(PLACES.landslide.x, 8, PLACES.landslide.z + 6), 16, () => this.step('c3.landslide'));
    this.zone('platform', V(-98, 17, 116), 9, () => this.step('c4.meeting'));
    // fallen stars
    for (const s of FALLEN_STARS) this.pickup(s.id, 'fallen-star', V(s.x, this.world.heightAt(s.x, s.z) + 1.1, s.z), 'star', () => !this.q.state.stars.includes(s.id));
  }

  /** Front doors that open (Sora's cottage, Hana's bakery, Ōta's mill, Genzo's station), keepsakes, the Star Kite. */
  registerHomes() {
    const I = this.game.interiors;
    if (!I) return;
    this.spawnResidents();
    for (const d of I.doors) {
      this.interact(`door:${d.id}`, d.outside, N_('Go inside'), () => !I.active && !I.busy && !this.game.kite?.active, () => this.enterHome(d.id), 1.8, null, 0.5);
      this.interact(`exit:${d.id}`, d.exit, N_('Go outside'), () => I.active === d.id && !I.busy, () => this.leaveHome(), 1.8, null, 0.5);
    }
    for (const it of I.items) {
      if (it.kind === 'keepsake') {
        const k = KEEPSAKES.find(x => x.id === it.id);
        if (!k) continue;
        this.pickup(`keepsake-${k.id}`, k.model, it.pos, 'keepsake', () => I.active === it.interior && !this.q.state.keepsakes.includes(k.id), { keepsake: k });
        this.pickups.get(`keepsake-${k.id}`).obj.rotation.y = it.yaw || 0;
      } else if (it.kind === 'kite') {
        // Sora's Star Kite rests on its cradle by the workbench: it appears once Tamo is around to recognise it
        const obj = this.game.assets.clone('star-kite');
        if (!obj) continue;
        obj.position.copy(it.pos);
        obj.rotation.y = it.yaw || 0;
        obj.visible = false;
        this.game.scene.add(obj);
        // Sora's kite rests on her workbench whenever it isn't out flying (after it's Mika's, too)
        this.kiteStand = { obj, pos: it.pos.clone(), interior: it.interior, when: () => I.active === it.interior && this.q.has('hasTamo') && !(this.game.kite?.active) };
        this.interact('takeKite', it.pos.clone().add(V(0, -0.8, 0)), N_('Take the Star Kite'), () => this.kiteStand.when() && !(this.q.count('kite') > 0), () => this.takeKite(), 2.4, null, 1);
        this.interact('kiteRest', it.pos.clone().add(V(0, -0.8, 0)), () => tx('Look at: {item}', { item: tx(ITEMS.kite.name) }), () => this.kiteStand.when() && this.q.count('kite') > 0,
          () => this.say('kite_rest'), 2.4, null, 1);
      }
    }
  }

  /** Treasures, Sky Letters, the star-tree spot and the gifts in Sora's cottage. */
  registerRewards() {
    const S = this.game.structures, q = () => this.q;
    // Sora's music box, on the river bed right under the viaduct
    const rv = river.nearest(0, 121, 40);
    const mb = V(rv ? rv.x : 4, 0, rv ? rv.z : 121);
    mb.y = this.world.heightAt(mb.x, mb.z) + 0.35;
    this.pickup('musicBox', 'music-box', mb, 'treasure', () => !q().state.treasures.musicBox, { treasure: TREASURES[0], grab: 1.9 });
    // Sky Letters on high places (the Star Kite reaches them)
    const top = obj => { if (!obj) return null; const b = new THREE.Box3().setFromObject(obj); return V((b.min.x + b.max.x) / 2, b.max.y + 1.1, (b.min.z + b.max.z) / 2); };
    const spots = {
      station: top(S.byId.get('station')?.obj), belltower: top(S.byId.get('belltower')?.obj), mill: top(S.byId.get('mill')?.obj),
      viaduct: top(S.lamps.get('viaduct')?.obj), shrine: top(S.byId.get('shrine')?.obj),
    };
    for (const L of SKY_LETTERS) {
      if (!spots[L.id]) continue;
      this.pickup(`letter-${L.id}`, 'journal-page', spots[L.id], 'letter', () => !q().state.letters.includes(L.id), { letter: L, grab: 3.4 });
    }
    // the star-tree grows in Sora's garden, in front of the porch
    this.treeSpot = V(-49.5, 0, 135.5);
    this.treeSpot.y = this.world.heightAt(this.treeSpot.x, this.treeSpot.z);
    this.interact('plantAcorn', this.treeSpot.clone().add(V(0, 0.5, 0)), N_('Plant the golden acorn'), () => this.q.count('acorn') > 0 && !this.q.has('treePlanted'), () => this.scenes.play('plantTree'), 2.8, null, 1);
    // thank-you gifts that fill the cottage
    const I = this.game.interiors;
    this.giftObjs = [];
    for (const it of I?.items || []) {
      if (it.kind !== 'gift') continue;
      const g = GIFTS.find(x => x.id === it.id);
      const obj = g && this.game.assets.clone(g.model);
      if (!obj) continue;
      obj.position.copy(it.pos);
      obj.rotation.y = it.yaw || 0;
      obj.visible = false;
      this.game.scene.add(obj);
      const earned = () => !!this.q && STEP_INDEX[this.q.state.step] > STEP_INDEX[g.after];
      this.giftObjs.push({ g, obj, earned });
      this.interact(`gift:${g.id}`, it.pos, () => tx('Look at: {item}', { item: tx(g.name) }), () => I.active === 'cottage' && earned(), () => this.say(g.say), 2.4, null, 1, 4);
    }
  }

  giftsEarned() { return (this.giftObjs || []).filter(x => x.earned()); }

  /** New gifts: a note that something is waiting at the cottage. */
  checkGifts() {
    for (const x of this.giftsEarned()) {
      const f = `giftSeen_${x.g.id}`;
      if (this.q.has(f)) continue;
      this.q.state.flags[f] = true;
      this.ui.toast((storyId() === 'grandma' ? tx('{from} left a gift for you and Grandma', { from: tx(x.g.from) }) : tx('{from} left a gift at Sora\'s cottage', { from: tx(x.g.from) })), x.g.model);
    }
  }

  foundTreasure(t) {
    const st = this.q.state;
    if (st.treasures[t.id]) return;
    st.treasures[t.id] = true;
    this.audio.star();
    this.ui.toast(tx('Treasure found: {item}', { item: tx(t.name) }), t.icon);
    if (t.id === 'musicBox') this.scenes.play('musicBox');
  }

  foundLetter(L) {
    const st = this.q.state;
    if (st.letters.includes(L.id)) return;
    st.letters.push(L.id);
    this.audio.star();
    this.ui.toast(tx('Sky Letter {n}/{total}', { n: st.letters.length, total: SKY_LETTERS.length }), 'journal-page');
    this.say(L.say);
    if (st.letters.length === SKY_LETTERS.length) this.say('letters_all');
  }

  /** The star-tree in Sora's garden (grown when the golden acorn is planted). */
  spawnStarTree() {
    if (this.starTree) return this.starTree;
    const obj = this.game.assets.clone('star-tree');
    if (!obj) return null;
    obj.position.copy(this.treeSpot);
    this.game.scene.add(obj);
    this.game.colliders.cylinder(this.treeSpot.x, this.treeSpot.z, 0.35, this.treeSpot.y - 0.5, this.treeSpot.y + 3, { id: 'star-tree' });
    this.treeAura = this.game.celebrate?.treeGlow?.(obj, true);
    this.starTree = obj;
    return obj;
  }

  async enterHome(id) {
    const I = this.game.interiors;
    this.busy++;
    try { await I.enter(id, on => this.ui.fade(on, 350)); } finally { this.busy--; }
    const seen = `visited_${id}`;
    if (!this.q.has(seen) && DIALOGUE[`inside_${id}`]) { this.q.state.flags[seen] = true; this.say(`inside_${id}`); }
    if (id === 'cottage') {
      // gifts Mika hasn't seen yet sparkle as she comes in
      let n = 0;
      for (const x of this.giftsEarned()) {
        const f = `giftShown_${x.g.id}`;
        if (this.q.has(f)) continue;
        this.q.state.flags[f] = true;
        // one after another, so several new gifts read as a little sequence
        setTimeout(() => { if (this.game.interiors?.active === 'cottage') this.game.celebrate?.giftGlow?.(x.obj.position.clone()); }, 500 + n++ * 700);
      }
      if (this.giftsEarned().length === GIFTS.length && !this.q.has('homeFull')) { this.q.state.flags.homeFull = true; this.say('home_full'); }
    }
  }

  async leaveHome() {
    this.busy++;
    try { await this.game.interiors.exit(on => this.ui.fade(on, 350)); } finally { this.busy--; }
  }

  takeKite() {
    this.q.state.inv.kite = 1;
    this.game.player.gesture('Cheer', { lock: false });
    this.audio.pickup();
    this.fx.burst(this.kiteStand.obj.position.clone().add(V(0, 1, 0)), { n: 40, speed: 2.5 });
    this.ui.toast(tx('Received: {item}', { item: tx(ITEMS.kite.name) }), ITEMS.kite.icon);
    this.refreshObjective();
    this.say('kite_found');
  }

  foundKeepsake(k) {
    const st = this.q.state;
    if (st.keepsakes.includes(k.id)) return;
    st.keepsakes.push(k.id);
    this.audio.star();
    this.ui.toast(tx('Keepsake found: {item} ({n}/{total})', { item: tx(k.name), n: st.keepsakes.length, total: KEEPSAKES.length }), k.model);
    this.say(k.say);
  }

  get q() { return this.quest; }
  step(id) { return this.quest?.state.step === id; }

  /** Something Mika can do by walking up and pressing E. label: English source text or a function. */
  interact(id, pos, label, when, action, radius = 2.4, posFn = null, prio = 0, vy = 3.2) {
    this.interactables.set(id, { id, pos, label, when, action, radius, posFn, prio, vy });
  }

  /** A spark target: stand near it and press E, and Tamo flies over and sparks it. */
  target(id, pos, label, when, onHit, reach = {}) {
    if (!pos) return;
    const t = { id, pos: pos.clone(), label, when, onHit, posFn: reach.at || null };
    this.targets.set(id, t);
    const tamoHere = () => this.tamoAround();
    this.interact(`spark:${id}`, null, label, () => tamoHere() && !t.pending && t.when(), () => this.sparkAt(t),
      reach.r ?? 6, () => (t.posFn ? t.posFn() : t.pos), reach.prio ?? 2, reach.vy ?? 6);
    this.interactables.get(`spark:${id}`).spark = true;
  }

  sparkAt(t) {
    if (t.pending) return;
    t.pending = true;
    const p = this.game.player;
    const to = t.posFn ? t.posFn().clone() : t.pos.clone();
    p.turnTo(Math.atan2(to.x - p.pos.x, to.z - p.pos.z), 1, 50);
    p.gesture('Point', { lock: false });
    this.audio.spark();
    this.tamo.react?.('Happy');
    const hit = pos => {
      if (!t.pending) return;
      t.pending = false;
      if (!t.when()) return;
      this.audio.sparkHit();
      this.fx.burst(pos, { n: 50, speed: 5 });
      t.onHit(pos);
    };
    this.tamo.fire(to, hit);
    // the spark flies at most ~1.1 s; if it never lands (Tamo hidden mid-flight), light it anyway
    setTimeout(() => hit(to), 2500);
  }

  zone(id, pos, r, when) { this.zones.set(id, { id, pos, r, when }); }

  pickup(id, model, pos, item, when = () => true, extra = {}) {
    const obj = this.game.assets.clone(model) || new THREE.Mesh(new THREE.OctahedronGeometry(0.25), new THREE.MeshStandardMaterial({ color: '#ffd45a', emissive: '#ff9a2a', emissiveIntensity: 1 }));
    obj.traverse(o => { if (o.isMesh) { o.castShadow = true; for (const m of [o.material].flat()) if (m.name === 'Lamp star') { m.emissive = new THREE.Color('#ffc23a'); m.emissiveIntensity = 2.2; } } });
    obj.position.copy(pos);
    obj.scale.setScalar(model === 'fallen-star' ? 1.25 : 1.1);
    this.game.scene.add(obj);
    const pk = { id, obj, pos: pos.clone(), item, when, t: Math.random() * 6, ...extra };
    this.pickups.set(id, pk);
    const label = () => (item === 'star' ? tx('Pick up the fallen star') : item === 'keepsake' ? tx('Look at: {item}', { item: tx(extra.keepsake.name) })
      : item === 'treasure' ? tx('Pick up: {item}', { item: tx(extra.treasure.name) }) : item === 'letter' ? tx('Read the Sky Letter')
        : tx('Pick up: {item}', { item: tx(ITEMS[item]?.name || item) }));
    this.interact(`pick:${id}`, null, label, () => this.pickups.has(id) && when(), () => this.collect(pk), 2.8, () => pk.obj.position, 0.5, 3.6);
  }

  removePickup(id) {
    const p = this.pickups.get(id);
    if (!p) return;
    this.game.scene.remove(p.obj);
    this.pickups.delete(id);
    this.interactables.delete(`pick:${id}`);
  }

  collect(pk) {
    if (!this.pickups.has(pk.id)) return;
    this.q.state.flags[pk.id] = true;
    this.removePickup(pk.id);
    this.fx.burst(pk.obj.position, { n: 24, speed: 2.5, size: 0.25 });
    this.game.player.gesture('Interact', { lock: false });
    if (pk.keepsake) { this.foundKeepsake(pk.keepsake); return; }
    if (pk.treasure) { this.foundTreasure(pk.treasure); return; }
    if (pk.letter) { this.foundLetter(pk.letter); return; }
    this.event({ type: 'pickup', item: pk.item, id: pk.id });
  }

  // ------------------------------------------------------------------ game start / load
  async begin(saved) {
    this.quest = new Quest(saved?.quest, { story: this.newStory });
    this.ui.applyStory?.();              // the diary tab and credits line of this save's story
    this.game.quest = this.quest;
    const effects = this.quest.start();
    const resumed = this.quest.resumed;
    if (resumed && saved?.player) this.game.player.teleport(saved.player.x, saved.player.z, saved.player.y, saved.player.facing);
    if (this.tamoAround()) this.tamo.show(this.game.player.pos.clone().add(V(0, 1.6, 0)));
    if (resumed && STEP_INDEX[this.q.state.step] > STEP_INDEX['p.porch']) this.lightPorchVisual();
    this.power();
    this.placeCast();
    await this.run(effects, !resumed);
    const st = this.q.state;
    if (STEP_INDEX[st.step] > STEP_INDEX['c3.lamp'] && !st.inv.acorn && !st.flags.treePlanted && !st.flags.acornGiven) { st.inv.acorn = 1; st.flags.acornGiven = true; }
    if (resumed && st.step === 'e.free' && this.q.has('allStars')) this.event({ type: 'cutscene', id: 'starfall' });
    else if (resumed && st.chapter === 5 && !st.flags.huntAsked && !st.flags.hunt) this.run([{ cutscene: 'huntAsk' }]);
  }

  /** Saving is refused while a cutscene or the Star Train ride owns the game, or Mika is riding something. */
  canSave() {
    return !!this.quest && !this.scenes.active && !this.minigame && !this.tricks?.round && !this.game.player.mounted && this.q.state.step !== 'c4.ride';
  }

  save() {
    this.saveFailed = false; // set again below only when the browser refuses the write (storage full or blocked)
    if (!this.canSave()) return false;
    const p = this.game.player;
    // The logical season and hour live in the quest state (the engine sets them before any fade finishes);
    // the position is the last safe footing, never mid-air.
    const I = this.game.interiors;
    const s = I?.active ? I.doors.find(d => d.id === I.active).outside : p.lastSafe;
    const data = { v: 1, quest: this.quest.save(), player: { x: s.x, y: s.y, z: s.z, facing: p.facing }, at: Date.now() };
    try {
      localStorage.setItem(Director.key(this.slot), JSON.stringify(data));
      if (!this.explore) localStorage.setItem('starline-last-slot', String(this.slot));   // Explore never becomes the "last story"
      this.saveFailed = false; return true;
    } catch { this.saveFailed = true; return false; }
  }

  /** Three save profiles. Slot 1 keeps the original key, so older saves appear there. */
  static key(slot = 1) { return slot === 1 ? SAVE_KEY : `starline-save-${slot}`; }

  static loadSave(slot = 1) {
    try {
      const d = JSON.parse(localStorage.getItem(Director.key(slot)));
      return d && typeof d === 'object' && d.quest && typeof d.quest === 'object' ? d : null; // anything else is not a save
    } catch { return null; }
  }

  static clearSave(slot = 1) { try { localStorage.removeItem(Director.key(slot)); } catch { /* ignore */ } }

  static slots() { return [1, 2, 3].map(slot => ({ slot, data: Director.loadSave(slot) })); }

  static lastSlot() { try { return +localStorage.getItem('starline-last-slot') || 1; } catch { return 1; } }

  // ------------------------------------------------------------------ Hard mode: aim and spark
  /** Hard mode, and Tamo is here to spark: hold Aim (right mouse, Q, LT or the Aim button) and Spark (click, R, RT, Spark). */
  canAim() {
    const g = this.game, p = g.player;
    return !!g.hard && !!this.quest && this.tamoAround() && !this.busy && !this.minigame && !this.ui.overlay && !g.kite?.active
      && !p.swimming && !p.mounted && !g.interiors?.active && !p.locked;
  }

  updateAim() {
    const g = this.game, p = g.player;
    this.ui.aimButton(!!g.hard && this.tamoAround() && !p.swimming && !p.mounted && !g.interiors?.active && !g.kite?.active && !this.busy);
    if (!p.aiming) { if (this.aimShown) { this.ui.reticle(false); this.aimShown = false; } this.aimLock = null; return; }
    const { origin, dir } = g.follow.aimRay();
    let best = null, bestAng = 1e9;
    for (const t of this.targets.values()) {
      if (t.pending || !t.when()) continue;
      const tp = t.posFn ? t.posFn() : t.pos;
      const to = tp.clone().sub(origin);
      const dist = to.length();
      if (dist > 34) continue;
      const ang = to.normalize().angleTo(dir);
      if (ang > Math.atan2(1.5, dist) + 0.04) continue;
      if (!this.lineOfSight(this.tamo.pos, tp)) continue;
      if (ang < bestAng) { bestAng = ang; best = t; }
    }
    this.aimLock = best;
    this.ui.reticle(true, !!best, best ? (typeof best.label === 'function' ? best.label() : tx(best.label)) : '');
    this.aimShown = true;
    if (g.input.pressed('fire')) this.fireSpark(origin, dir);
  }

  /** Nothing but air between Tamo and the target (the ground is checked; buildings are forgiving). */
  lineOfSight(a, b) {
    for (let i = 1; i < 24; i++) {
      const t = i / 24;
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
      if (this.world.heightAt(x, z) > y + 0.2) return false;
    }
    return true;
  }

  fireSpark(origin, dir) {
    if ((this.sparkCooldown || 0) > performance.now()) return;
    this.sparkCooldown = performance.now() + 450;
    const t = this.aimLock;
    if (t) { this.sparkAt(t); return; }
    // a miss: the spark flies to wherever the reticle points and fizzles
    let to = origin.clone().addScaledVector(dir, 30);
    for (let d = 2; d < 30; d += 1) {
      const q = origin.clone().addScaledVector(dir, d);
      if (this.world.heightAt(q.x, q.z) > q.y) { to = q; break; }
    }
    this.audio.spark();
    this.game.player.gesture('Point', { lock: false, then: 'Aim' });
    this.tamo.fire(to, pos => { this.audio.miss(); this.fx.burst(pos, { n: 14, speed: 2, size: 0.2 }); });
  }

  // ------------------------------------------------------------------ the treasure hunt
  /**
   * Every treasure of the hunt with where it is: pos is the point outdoors to head for (a home's front door for
   * things inside), at is the thing itself, inside the home it's in (or null).
   */
  huntTargets() {
    const st = this.q.state, I = this.game.interiors;
    const door = id => I?.doors.find(d => d.id === id)?.outside;
    const pk = id => this.pickups.get(id)?.pos;
    const out = [];
    for (const h of HUNT) {
      let at = null, inside = null;
      if (h.id === 'kite') { at = this.kiteStand?.pos; inside = this.kiteStand?.interior || 'cottage'; }
      else if (h.id === 'musicBox') at = pk('musicBox');
      else if (h.id === 'compass') at = V(4.2, 1, 30);      // Rin's dock: keep fishing
      else if (h.id === 'tree') at = this.treeSpot;
      else if (h.id.startsWith('letter-')) at = pk(h.id);
      else if (h.id.startsWith('keepsake-')) {
        const k = KEEPSAKES.find(x => `keepsake-${x.id}` === h.id);
        const it = I?.items.find(x => x.kind === 'keepsake' && x.id === k?.id);
        at = it?.pos || null; inside = k?.home || null;
      }
      const pos = inside ? door(inside) : at;
      out.push({ id: h.id, name: h.name, icon: h.icon, found: h.found(st), pos: pos?.clone?.() || null, at: at?.clone?.() || null, inside });
    }
    return out;
  }

  /** From the journal: start the treasure hunt without waiting for Tamo to ask again. */
  startHunt() {
    const st = this.q.state;
    st.flags.hunt = true;
    st.flags.huntAsked = true;
    this.refreshObjective(true);
    this.ui.toast(tx('Treasure hunt started! Look for the little twinkles.'), 'star-compass');
  }

  /** The arrow after the stars: the nearest treasure left (the Star Kite first while Sky Letters still wait on the roofs). */
  huntTarget() {
    if (!this.q.has('hunt')) return null;
    const p = this.game.player.pos;
    const left = this.huntTargets().filter(t => !t.found && t.pos);
    if (!left.length) return null;
    const kite = left.find(t => t.id === 'kite');
    if (kite && left.some(t => t.id.startsWith('letter-'))) return kite.pos.clone().add(V(0, 1.6, 0));
    left.sort((a, b) => a.pos.distanceTo(p) - b.pos.distanceTo(p));
    return left[0].pos.clone().add(V(0, 1.4, 0));
  }

  huntInside() {
    const I = this.game.interiors;
    if (!this.q.has('hunt') || !I?.active || STEP_INDEX[this.q.state.step] < STEP_INDEX['e.done']) return null;
    const t = this.huntTargets().find(x => !x.found && x.inside === I.active && x.at);
    return t ? t.at.clone().add(V(0, 0.5, 0)) : null;
  }

  /** The hunt's glints on things that aren't pickups (the kite on its stand, the star-tree spot, Rin's dock), and the finale. */
  updateHunt() {
    const st = this.q.state, on = !!st.flags.hunt;
    if (this.kiteStand?.obj.visible && !(st.inv.kite > 0)) this.fx.glint(this.kiteStand.pos.clone().add(V(0, 0.4, 0)), on);
    if (this.treeSpot && st.inv.acorn > 0 && !st.flags.treePlanted) this.fx.glint(this.treeSpot.clone().add(V(0, 0.6, 0)), on);
    if (on && !st.treasures.compass && st.step !== 'c1.fish') this.fx.glint(V(4.2, 1.2, 30), true);
    if (on && !st.flags.huntDone && !this.busy) {
      const { found, total } = huntProgress(st);
      if (found !== this.huntSeen) { this.huntSeen = found; this.refreshObjective(); }
      if (found >= total) { st.flags.huntDone = true; this.audio.fanfare?.(); this.game.celebrate?.sparkleBurst?.(this.game.player.pos.clone().add(V(0, 2.2, 0))); this.say('hunt_done'); }
    }
  }

  /** Numbers for the last page. */
  endStats() {
    const st = this.q.state;
    const mins = Math.round((st.playtime || 0) / 60);
    return {
      photos: this.album(),
      lines: [
        tx('{n} of 12 Fallen Stars', { n: st.stars.length }),
        tx('{n} of 4 Star Lamps', { n: Object.values(st.lamps).filter(Boolean).length }),
        tx('{n} fish caught', { n: Object.values(st.fishLog || {}).reduce((a, n) => a + n, 0) }),
        tx('{n} of {total} friends made', { n: Object.keys(st.friends || {}).length, total: FRIENDS.length }),
        tx('{n} of 5 Sky Letters', { n: (st.letters || []).length }),
        tx('Played for {h} h {m} min', { h: Math.floor(mins / 60), m: mins % 60 }),
      ],
    };
  }

  /** Tamo is at Mika's side: from the chest until he goes home to his lamp, and again on his Sundays off. */
  tamoAround() {
    const q = this.q;
    return !!q && q.has('hasTamo') && (!q.has('tamoHome') || q.has('tamoBack'));
  }

  /** Every lit lamp: Tamo wears its colour, the valley keeps its decorations, and the world gets a little more vivid. */
  power() {
    const lit = Object.values(this.q.state.lamps).filter(Boolean).length;
    this.tamo.power = 1 + lit;
    this.game.celebrate?.decorate?.(lit);
    // after the summer festival the peach orchard keeps its lanterns
    if (lit >= 2 && !this.orchardGlow && this.game.celebrate) this.orchardGlow = this.game.celebrate.orchardLanterns(V(72, 0, -48), 45, true);
    if (this.game.renderer?.grade) this.game.renderer.grade.uniforms.uVibrance.value = 0.22 + lit * 0.035;
  }

  // ------------------------------------------------------------------ photo album (one per save profile)
  album() {
    try { return JSON.parse(localStorage.getItem(`starline-album-${this.slot}`)) || {}; } catch { return {}; }
  }

  addPhoto(id, url) {
    const a = this.album();
    a[id] = url;
    try { localStorage.setItem(`starline-album-${this.slot}`, JSON.stringify(a)); } catch { /* storage full: the photo just isn't kept */ }
    this.ui.toast(tx('A photo for the album!'), 'journal-page');
  }

  // ------------------------------------------------------------------ NPC schedule
  placeCast() {
    const st = this.q.state, step = st.step, ch = st.chapter, n = this.npcs;
    const idx = STEP_INDEX[step];
    const after = id => idx > STEP_INDEX[id];
    // Genzo
    if (step === 'p.arrive') n.genzo.place(-92.5, 116.6, -Math.PI / 2, 16.95);
    else if (step === 'c4.shed') n.genzo.place(-157, 93.5, -2.4);
    else if (step === 'c4.repair' || step === 'c4.lamp') n.genzo.place(-8.5, 121.6, Math.PI / 2, DECK_Y); // beside the gap, watching the beams go in
    else if (step === 'c4.board' || step === 'c4.ride') n.genzo.place(-86.5, 116.8, -Math.PI / 2, 16.95);
    else n.genzo.place(-104, 116.8, Math.PI / 2, 16.95);
    n.genzo.setIdle(ch === 4 && !after('c4.meeting') ? 'Sad' : ch >= 1 && ch <= 3 ? 'ArmsCrossed' : 'Idle');
    // Rin
    if (ch <= 1 && !this.q.unlocked('ferry')) { n.rin.place(3.6, 31.2, Math.PI / 2, 0.72); n.rin.setIdle(step === 'c1.fish' || step === 'c1.rin' ? 'Reel' : 'Idle'); }
    else {
      // Rin waits with her ferry, on whichever bank it is moored at
      const east = (this.game.structures?.nodes?.ferry?.position.x ?? 0) > 12;
      n.rin.place(east ? PLACES.eastDock.x - 0.8 : -0.4, 31.6, east ? -Math.PI / 2 : Math.PI / 2, 0.72);
      n.rin.setIdle('Idle');
    }
    // Ōta
    n.ota.place(-24, -40.5, Math.PI / 2);
    n.ota.setIdle('Idle');
    // Hana
    n.hana.place(103.5, 16, Math.PI / 2);
    n.hana.setIdle(ch === 2 ? 'Knead' : 'Idle');
    // chapter 4 meeting & finale positions are set by the scenes
    if (step === 'c4.meeting' || (after('c4.meeting') && ch === 4)) this.scenes.meetingPositions(after('c4.meeting'));
    if (ch === 5) {
      this.scenes.epiloguePositions();
      for (const [id, route] of Object.entries(this.routes)) this.npcs[id]?.place(route[0][0], route[0][1]);
    }
    this.placeGrandma(step, ch, after);
    this.npcs.v7.setVisible(ch >= 4 && after('c4.gather'));
    const lit = Object.values(st.lamps).filter(Boolean).length;
    for (const [id, , , , , need] of this.returning) this.npcs[id].setVisible(need === 4 ? ch === 5 : lit >= need);
    // rewards that persist: the star-tree, Starfall Night skies, and news of new gifts
    if (st.flags.treePlanted) this.spawnStarTree();
    if (st.flags.allStars && STEP_INDEX[st.step] >= STEP_INDEX['e.free'] && !this.starfallSky) this.starfallSky = this.game.celebrate?.starfall?.(true);
    this.checkGifts();
    // animals per chapter
    const W = this.wildlife;
    if (step === 'c1.cogs' && this.q.count('cog') < 3 && !st.flags.crabBooped) W.spawnCrab();
    if (ch <= 3 && !this.q.unlocked('shrineStairs')) W.spawnBear();
    // once the lamp is lit Ōkuma has a den of his own; until then he's off wandering
    if (idx > STEP_INDEX['c3.lamp']) W.bearToDen();
    else if (this.q.unlocked('shrineStairs') && W.story.bear && !this.scenes.active) W.story.bear.setVisible(false);
  }

  // ------------------------------------------------------------------ events & effects
  event(ev) {
    if (!this.quest) return;
    const effects = this.quest.dispatch(ev);
    return this.run(effects);
  }

  run(effects, fresh = true) {
    this.queue = this.queue.then(() => this.play(effects, fresh)).catch(err => console.error(err));
    return this.queue;
  }

  async play(effects, fresh) {
    for (const e of effects) {
      this.running = e;
      (this.trace ??= []).push(`${Math.round(performance.now() / 100) / 10}s ${JSON.stringify(e)}`);
      if (this.trace.length > 60) this.trace.shift();
      try { await this.effect(e, fresh); } catch (err) { console.error('effect failed', e, err); }
    }
    this.running = null;
    this.refreshObjective();
  }

  async effect(e, fresh) {
    const g = this.game, ui = this.ui;
    if (e.say === 'ending_parents') this.parentsArrive();   // Grandma story: they step off the Star Train
    if (e.say || e.lines) await this.sayNow(e.say, e.lines);
    else if (e.line) await this.sayNow(null, [e.line]);
    else if (e.cutscene) await this.scenes.play(e.cutscene, e);
    else if (e.title !== undefined) {
      this.audio.setMusic(CHAPTERS[e.title].season, 'calm');
      if (fresh) await ui.card(e.title);
    } else if (e.season) {
      if (g.time.season !== e.season) {
        if (!e.silent && fresh) await ui.fade(true, 700);
        g.setSeason(e.season);
        this.audio.setMusic(e.season);
        this.placeCast();
        if (!e.silent && fresh) await ui.fade(false, 900);
      } else this.audio.setMusic(e.season);
    } else if (e.time !== undefined) g.time.hour = e.time;
    else if (e.timelapse !== undefined) await this.timelapse(e.timelapse);
    else if (e.lamp) {
      g.structures.setLamp(e.lamp, true, e.silent);
      this.power();
    } else if (e.unlock) this.unlock(e.unlock, e.silent);
    else if (e.spawn) this.spawn(e.spawn, e.silent);
    else if (e.journal !== undefined) { if (fresh) { ui.toast(tx('Journal page added — press J to read'), 'journal-page'); this.audio.pickup(); } }
    else if (e.give) { const it = ITEMS[e.give[0]]; if (it) ui.toast(tx('Received: {item}', { item: tx(it.name) }), it.icon); }
    else if (e.got) { const it = ITEMS[e.got]; if (it && !e.silent) { ui.toast(`${tx(it.name)} ×${e.total}`, it.icon); this.audio.pickup(); } }
    else if (e.caught) {
      ui.toast(tx('Caught a {fish}!', { fish: tx(FISH[e.caught]?.name || e.caught) }), 'plate-trout'); this.audio.good();
      const st = this.q.state, total = Object.values(st.fishLog).reduce((a, n) => a + n, 0);
      if (!st.treasures.compass && total >= 4) {
        st.treasures.compass = true;
        st.inv.compass = 1;
        ui.toast(tx('Treasure found: {item}', { item: tx(ITEMS.compass.name) }), ITEMS.compass.icon);
        this.audio.star();
        await this.sayNow('compass_found');
      }
    }
    else if (e.star) { ui.toast(tx('Fallen Star {n}/12', { n: e.count }), 'fallen-star'); this.audio.star(); }
    else if (e.allStars) { await this.scenes.play('starfall'); }
    else if (e.chapter !== undefined) { this.placeCast(); }
    else if (e.flag) { if (e.flag === 'tamoHome' && !this.q.has('tamoBack')) this.tamo.hide(); if (e.flag === 'tamoBack') this.tamo.show(this.game.player.pos.clone().add(V(0, 1.6, 0))); this.power(); }
    else if (e.autosave) this.save();
    else if (e.stepDone) { this.audio.chime(1); this.stepClock = 0; this.placeCast(); }
    else if (e.objective) this.refreshObjective(true);
  }

  refreshObjective(pulse = false) {
    if (!this.quest) return;
    if (this.explore) { this.ui.setObjective(-1, tx('Explore Hoshi Valley: wander, shop, play ball and visit the neighbours.'), pulse); this.refreshHud(); return; }
    this.ui.setObjective(this.q.state.chapter, this.q.objective(tx), pulse);
    this.refreshHud();
  }

  /** The items strip, with Mika's purse of mon when she has any. */
  refreshHud() {
    const st = this.q.state;
    this.ui.setInventory(st.mon > 0 ? { ...st.inv, mon: st.mon } : st.inv);
  }

  /** Queue a dialogue: safe from anywhere (interactions, spark hits, scenes outside the effect queue). */
  say(id, lines) { return this.run([{ say: id, lines }]); }

  /** Play a dialogue now: only from inside the effect queue or a cutscene running in it. */
  async sayNow(id, lines) {
    // before the chest and after the finale there is no Tamo at Mika's side: such scenes use their Tamo-free variant
    if (id && !lines && this.q && !this.tamoAround() && DIALOGUE[`${id}_solo`]) id = `${id}_solo`;
    lines = lines || DIALOGUE[id];
    if (!lines) return;
    this.busy++;
    try { await this.dialogueBody(lines); } finally { this.busy--; }
  }

  /** Dialogue with speaker gestures and a gentle camera framing. */
  async dialogueBody(lines, { local = false } = {}) {
    const g = this.game;
    g.player.locked = true;
    g.player.vel.set(0, 0, 0);
    const speakers = new Set(lines.filter(l => Array.isArray(l)).map(l => l[0]));
    const npc = [...speakers].map(s => this.npcs[s] || (s === 'villager' ? this.nearestVillager() : null)).find(Boolean);
    if (npc && npc.pos.distanceTo(g.player.pos) < 9 && !this.scenes.active) {
      npc.lookAt(g.player.pos.x, g.player.pos.z);
      g.player.turnTo(Math.atan2(npc.pos.x - g.player.pos.x, npc.pos.z - g.player.pos.z), 1, 50);
      this.frameTalk(npc);
    }
    const choice = await this.ui.dialogue(lines, {
      onLine: (who, anim) => {
        const n = this.npcs[who];
        if (n) n.gesture(anim || 'Talk');
        else if (who === 'mika') g.player.anim?.once(anim || 'Talk', { then: 'Idle' });
        else if (who === 'tamo') this.tamo.react(anim || 'Talk');
        this.audio.blip(1);
      },
    });
    for (const s of speakers) if (this.npcs[s]) this.npcs[s].setIdle(this.npcs[s].idleClip);
    if (!this.scenes.active) g.follow.clearCutscene(false);
    // the key press that closed the dialogue must not also start the next interaction
    g.input.edges.clear();
    this.actCooldown = 0.35;
    // queued: this may be running inside the effect queue
    // a local choice (a shop menu) is answered by its caller, not by the story
    if (choice && !local) this.event({ type: 'choice', id: lines.find(l => l.choice)?.id || 'confession', value: choice });
    return choice;
  }

  nearestVillager() {
    let best = null, bd = 1e9;
    for (const n of Object.values(this.npcs)) if (n.villager && n.visible) { const d = n.pos.distanceTo(this.game.player.pos); if (d < bd) { bd = d; best = n; } }
    return best;
  }

  frameTalk(npc) {
    const p = this.game.player.pos, n = npc.pos;
    const mid = p.clone().lerp(n, 0.5);
    const dx = n.x - p.x, dz = n.z - p.z, l = Math.hypot(dx, dz) || 1;
    const side = V(-dz / l, 0, dx / l);
    const shot = (s, r, up, back) => mid.clone().addScaledVector(side, s * r).add(V(0, up, 0)).addScaledVector(V(-dx / l, 0, -dz / l), back);
    let camPos = shot(1, 4.2, 1.9, 1.2);
    const I = this.game.interiors;
    if (I?.active) {
      // indoors the usual shot is outside the walls: try both sides and closer in, else the nearest point inside
      camPos = [[1, 2.6, 1.5, 0.6], [-1, 2.6, 1.5, 0.6], [1, 1.9, 1.4, 0.3], [-1, 1.9, 1.4, 0.3]].map(a => shot(...a)).find(c => I.roomHas(c)) || I.clampToRoom(shot(1, 2.2, 1.5, 0.4));
    } else if (this.world.heightAt(camPos.x, camPos.z) > camPos.y - 0.6) camPos.y = this.world.heightAt(camPos.x, camPos.z) + 1.2;
    this.game.follow.cutscene({ pos: camPos, look: mid.clone().add(V(0, 1.25, 0)) }, 0.8);
  }

  /** The nearest creature Mika could say hello to (the story's own uses of animals come first). */
  findFriend() {
    const p = this.game.player.pos;
    let best = null, bd = 1e9;
    for (const a of this.wildlife.actors) {
      const def = FRIEND_BY_KIND[a.kind];
      if (!def || !a.visible || !a.root.visible || a.flying) continue;
      if (a.kind === 'sheep' && !a.penned) continue; // runaways are sent home first
      if (a.kind === 'fox' && a.path) continue;
      const reach = a.kind === 'bear' ? 4.2 : a.kind === 'duck' ? 3.6 : a.kind === 'cow' ? 3.4 : 2.6;
      const d = Math.hypot(a.pos.x - p.x, a.pos.z - p.z);
      if (d > reach || Math.abs(a.pos.y - p.y) > 2.5) continue;
      if (d < bd) { bd = d; best = { a, def }; }
    }
    // the little ones (crickets, spiders, ladybugs, dragonflies, butterflies) that are near enough to be drawn
    for (const a of this.wildlife.critters?.visuals || []) {
      const def = FRIEND_BY_KIND[a.kind];
      if (!def || !a.slot || !a.near || !a.root.visible) continue;
      const d = Math.hypot(a.pos.x - p.x, a.pos.z - p.z);
      if (d > 2.6 || Math.abs(a.pos.y - p.y) > 2.5) continue;
      if (d < bd) { bd = d; best = { a, def }; }
    }
    return best;
  }

  befriend(f) {
    if (!f) return;
    const { a, def } = f, g = this.game, p = g.player, st = this.q.state;
    if (a.kind !== 'bear' && a.kind !== 'duck') a.lookAt(p.pos.x, p.pos.z);
    p.turnTo(Math.atan2(a.pos.x - p.pos.x, a.pos.z - p.pos.z), 1, 50);
    p.gesture(a.kind === 'duck' ? 'Wave' : 'Interact', { lock: false });
    a.hold?.();                                                // a critter stays put for the hello
    const react = { rabbit: 'Hop', chicken: 'Flap', cat: 'Sit', sheep: 'Bleat', deer: 'Idle', fox: 'Look', cow: 'Moo', pig: 'Oink', goat: 'Bleat', dog: 'Wag', cricket: 'Chirp' }[a.kind];
    if (react && a.anim?.has?.(react)) a.anim.once(react, { then: a.idleClip || 'Idle' });
    if (['cow', 'pig', 'goat', 'dog'].includes(a.kind)) this.audio.animal(a.kind, 0.9);
    if (a.kind === 'cricket') this.audio.chirp?.(1, a.slot?.pitch ?? 1);
    const small = !!a.slot, up = small ? 0.25 : a.kind === 'bear' ? 1.6 : a.kind === 'cow' ? 1.3 : 0.8;
    this.fx.burst(a.pos.clone().add(V(0, up, 0)), small ? { n: 10, color: [1, 0.55, 0.7], speed: 0.9, size: 0.12, gravity: -1.2 } : { n: 18, color: [1, 0.55, 0.7], speed: 1.6, size: 0.22, gravity: -1.2 });
    this.audio.good();
    if (st.friends[def.id]) return;
    st.friends[def.id] = true;
    const n = Object.keys(st.friends).length;
    this.ui.toast(tx('New friend: {name} ({n}/{total})', { name: tx(def.name), n, total: FRIENDS.length }), def.icon);
    this.say(`friend_${def.id}`);
    if (n === FRIENDS.length) { this.say('friends_all'); this.ui.toast(tx('Friend of the Valley!'), 'fallen-star'); }
  }

  talk(id) {
    const n = this.npcs[id];
    if (!n) return;
    // after the festival Grandma tells Mika the happy secret of her year, once; her chatter after that
    if (id === 'sora' && storyId() === 'grandma' && this.q.state.chapter === 5 && !this.q.has('porchTalk')) {
      this.q.state.flags.porchTalk = true;
      return this.say('porch_talk');
    }
    // a countryside trick in season: the teacher's first talk teaches it (once)
    if (this.tricks?.onTalk(id)) return;
    return this.event({ type: 'talk', who: n.villager ? 'villager' : id });
  }

  // ------------------------------------------------------------------ world changes
  unlock(what, silent) {
    const g = this.game, S = g.structures;
    if (what === 'drawbridge') {
      g.colliders.enable(S.solids.drawbridge);
      this.drawbridgeTarget = 0;
      this.millTurning = true;
      if (silent) this.drawbridgeAngle = 0;
    } else if (what === 'orchardGate') {
      g.colliders.remove(S.solids.orchardGate);
      if (S.nodes.orchardGate) S.nodes.orchardGate.visible = false;
    } else if (what === 'shrineStairs') {
      g.colliders.remove(S.solids.bear);
      if (silent && this.wildlife.story.bear && !this.wildlife.story.bear.inDen) this.wildlife.story.bear.setVisible(false);
    } else if (what === 'viaduct') {
      g.railway.setRepaired(true);
      if (!silent) this.fx.fireworks(true, V(0, 34, 122), 10); // stops itself after 10 s on the game clock, unless a scene takes the sky over
    } else if (what === 'ferry' && !silent) {
      this.ui.toast(tx('Rin\'s ferry now crosses the river'));
    }
  }

  spawn(group, silent) {
    const W = this.wildlife, S = this.game.structures, q = this.q;
    if (group === 'cogs') {
      if (!q.has('cogReeds')) this.pickup('cogReeds', 'cog', V(-8.8, this.world.heightAt(-8.8, 5.5) + 0.6, 5.5), 'cog', () => !q.has('cogReeds'));
      if (!q.has('cogCrates') && S.crateTop) this.pickup('cogCrates', 'cog', V(S.crateTop.x, S.crateTop.y + 0.7, S.crateTop.z), 'cog', () => !q.has('cogCrates'));
      if (!q.has('crabBooped')) {
        W.spawnCrab();
        const c = W.story.crab;
        this.target('crab', c.pos.clone().add(V(0, 0.3, 0)), N_('Boop the crab'), () => this.step('c1.cogs') && !q.has('crabBooped') && !!W.story.crab, () => {
          q.state.flags.crabBooped = true;
          this.audio.sparkHit();
          q.state.flags.crabHint = true;
          this.say('c1_crab_hit');
          W.crabBooped();
          this.pickup('cogCrab', 'cog', c.pos.clone().add(V(0.4, 0.8, 0)), 'cog', () => !q.has('cogCrab'));
        }, { r: 4.5, vy: 3.5, at: () => (W.story.crab || c).pos.clone().add(V(0, 0.3, 0)) });
      } else if (!q.has('cogCrab')) this.pickup('cogCrab', 'cog', V(PLACES.sandbar.x + 0.4, 1.0, PLACES.sandbar.z), 'cog', () => !q.has('cogCrab'));
    } else if (group === 'sheep') {
      W.spawnSheep();
      W.placeSheepPenned(q.count('sheep'));
      W.story.sheep.forEach((s, i) => this.interact(`sheep${i}`, null, N_('Send the sheep home'), () => this.step('c2.sheep') && !s.penned && !s.homing,
        () => { W.sendHome(s); this.audio.good(); this.game.player.gesture('Wave', { lock: false }); }, 3.6, () => s.pos, 1, 3));
    } else if (group === 'crows') {
      if (q.count('bells') < 5) W.spawnCrows(S.nodes.scarecrows);
    } else if (group === 'peaches') {
      const trees = this.game.placed.trees.filter(t => t.orchard);
      for (let i = 0; i < 7; i++) {
        const t = trees[(i * 5 + 3) % trees.length];
        const id = `peach${i}`;
        if (q.has(id)) continue;
        const a = i * 2.1;
        this.pickup(id, 'peach', V(t.x + Math.cos(a) * 1.4, t.y + 1.2, t.z + Math.sin(a) * 1.4), 'peach', () => !q.has(id) && this.step('c2.peaches'));
      }
    } else if (group === 'fox') {
      if (STEP_INDEX[q.state.step] <= STEP_INDEX['c3.follow']) W.spawnFox([[85, -86], [83, -98], [74, -108], [66, -116], [62, -114.5]]);
      else if (!W.story.fox) W.spawnFox([[62, -114.5]]); // Kon stays by the shrine clearing
    } else if (group === 'forestFood') {
      const spots = { chestnut: [[78.5, -101.5], [89, -116], [70.8, -94.6], [94, -103.4]], mushroom: [[72, -112], [96, -96], [58, -104]] };
      for (const [item, list] of Object.entries(spots)) list.forEach(([x, z], i) => {
        const id = `${item}${i}`;
        if (!q.has(id)) this.pickup(id, item === 'mushroom' ? 'mushroom-item' : 'chestnut', V(x, this.world.heightAt(x, z) + 0.45, z), item, () => !q.has(id) && this.step('c3.gather'));
      });
      // the hive hangs on a branch near the chestnuts
      const hive = V(100, this.world.heightAt(100, -118) + 4.2, -118);
      if (!this.hiveObj) {
        this.hiveObj = this.game.assets.clone('beehive-branch');
        if (this.hiveObj) { this.hiveObj.position.set(100, this.world.heightAt(100, -118) + 3.2, -118); this.game.scene.add(this.hiveObj); }
      }
      if (q.has('hiveDropped')) { const hv = this.hiveObj?.getObjectByName('Hive'); if (hv) hv.visible = false; }
      if (!q.has('hiveDropped')) {
        this.target('hive', hive, N_('Knock down the beehive'), () => this.step('c3.gather') && !q.has('hiveDropped'), () => {
          q.state.flags.hiveDropped = true;
          const h = this.hiveObj?.getObjectByName('Hive');
          if (h) h.visible = false;
          this.pickup('honeycomb0', 'honeycomb', V(100, this.world.heightAt(100, -118) + 0.5, -117), 'honeycomb', () => !q.has('honeycomb0'));
          this.bees = 7;
          this.say('c3_hive_hit');
        }, { r: 5.5, vy: 6 });
      } else if (!q.has('honeycomb0')) this.pickup('honeycomb0', 'honeycomb', V(100, this.world.heightAt(100, -118) + 0.5, -117), 'honeycomb', () => !q.has('honeycomb0'));
    } else if (group === 'repair') {
      this.game.railway.setRepaired(q.unlocked('viaduct'), q.count('beams'));
    }
    void silent;
  }

  // ------------------------------------------------------------------ sequences
  async timelapse(to) {
    this.busy++;
    this.game.player.locked = true;
    const g = this.game;
    let from = g.time.hour;
    if (to < from) to += 24;
    const t0 = performance.now();
    await new Promise(res => {
      const tick = () => {
        const k = Math.min(1, (performance.now() - t0) / 3200);
        const e = k * k * (3 - 2 * k);
        g.time.hour = (from + (to - from) * e) % 24;
        if (k < 1) requestAnimationFrame(tick); else res();
      };
      tick();
    });
    this.q.state.hour = g.time.hour;
    this.busy--;
    if (!this.busy) g.player.locked = false;
  }

  async ferry(side) {
    if (!this.q.unlocked('ferry')) { await this.say('ferry_locked'); return; }
    this.busy++;
    try { await this.scenes.ferry(side); } finally { this.busy--; }
    if (side === 'east') await this.event({ type: 'ferry', side: 'east' });
  }

  async tower(up) {
    if (up && !(this.q.count('key') > 0 || STEP_INDEX[this.q.state.step] > STEP_INDEX['c2.lamp'])) { await this.say('tower_locked'); return; }
    this.busy++;
    await this.ui.fade(true, 350);
    this.busy--;
    const gal = this.game.structures.gallery || { x: 115, z: -4, y: 31.92 };
    if (up) this.game.player.teleport(gal.x, gal.z + 1.95, gal.y + 0.02, Math.PI);
    else this.game.player.teleport(gal.x, gal.z + 5.4, undefined, 0);
    this.game.follow.yaw = up ? Math.PI : 0;
    await this.ui.fade(false, 450);
  }

  async ringBell() {
    this.audio.bell();
    this.bellSwing = { node: this.game.structures.nodes.bell, t: 0 };
    this.game.follow.shake = 0.5;
    await this.event({ type: 'interact', target: 'bell' });
  }

  async setBeam(i) {
    this.busy++;
    try {
      this.game.player.gesture('Hammer', { lock: true });
      for (let k = 0; k < 4; k++) setTimeout(() => { this.audio.hammer(); this.game.follow.shake = 0.12; }, 250 + k * 320);
      await new Promise(r => setTimeout(r, 1500));
      this.game.railway.setRepaired(false, i + 1);
      this.fx.burst(V(-1.4 + 3.5 * i, DECK_Y + 0.3, 120), { n: 30, color: [0.9, 0.75, 0.5], speed: 3, size: 0.25, gravity: 6 });
    } finally { this.busy--; }
    await this.event({ type: 'count', item: 'beams' });
  }

  lightPorchVisual() {
    const S = this.game.structures;
    const p = this.targets.get('porchLamp')?.pos;
    if (!p) return;
    if (!this.porchLight) this.porchLight = this.game.lights.add({ pos: p.clone(), intensity: 12, range: 14 });
    S.byId.get('cottage')?.obj.traverse(o => { if (o.isMesh) for (const m of [o.material].flat()) if (m.name === 'Porch glass') { m.emissive = new THREE.Color('#ffb13d'); m.emissiveIntensity = 3; } });
  }

  lightPorch(p) {
    this.lightPorchVisual();
    this.fx.burst(p, { n: 60, speed: 4 });
    this.audio.lamp();
    return this.event({ type: 'spark', target: 'porchLamp' });
  }

  // ------------------------------------------------------------------ minigames
  startFishing() {
    if (this.minigame) return;
    const dusk = this.game.time.hour > 17.6 && this.game.time.hour < 20.5;
    this.minigame = { kind: 'fish', m: new Fishing({ dusk, window: this.game.easy ? 2.6 : 1.6 }) };
    this.game.player.locked = true;
    this.game.player.turnTo(Math.PI / 2, 1, 50);
    this.game.player.gesture('Cast', { lock: true, then: 'Reel' });
    this.ui.showFishing(true);
  }

  startCooking() {
    if (this.minigame) return;
    this.minigame = { kind: 'cook', m: new Cooking() };
    this.game.player.locked = true;
    this.game.player.anim?.play('Stir');
    this.ui.showCooking(true);
  }

  updateMinigame(dt) {
    const mg = this.minigame;
    if (!mg) return;
    const inp = this.game.input;
    // camera drags are not strikes: only the action buttons (and a tap) count
    const press = inp.pressed('act') || inp.pressed('jump') || inp.pressed('tap');
    if (inp.pressed('back') || inp.pressed('pause')) { this.endMinigame(); return; }
    if (mg.kind === 'fish') {
      const f = mg.m;
      const before = f.phase;
      f.update(dt, press);
      if (before === 'wait' && f.phase === 'bite') { this.audio.reel(); this.game.follow.shake = 0.25; this.fx.splash(V(6.5, 0, 30)); }
      this.ui.fishing(f.view());
      if (f.phase === 'done') {
        const token = this.minigame = { kind: 'ending' };
        setTimeout(() => { if (this.minigame === token) this.endMinigame(); }, 900);
        this.game.player.gesture('Cheer', { lock: true });
        this.event({ type: 'catch', species: f.species });
      }
    } else if (mg.kind === 'cook') {
      const c = mg.m;
      if (Math.random() < dt * 6) this.audio.bubble();
      const done = c.update(dt);
      this.ui.cooking(c.view());
      if (done) {
        const token = this.minigame = { kind: 'ending' };
        this.fx.burst(V(PLACES.forestHearth.x, 13.2, PLACES.forestHearth.z), { n: 50, color: [1, 0.7, 0.3], speed: 3 });
        setTimeout(() => { if (this.minigame === token) this.endMinigame(); this.event({ type: 'minigame', name: 'cook', ok: true }); }, 700);
      }
    }
  }

  endMinigame() {
    this.minigame = null;
    this.ui.showFishing(false);
    this.ui.showCooking(false);
    this.actCooldown = 0.5;
    if (!this.busy) this.game.player.locked = false;
    this.game.player.anim?.cancelOneShot();
  }

  // ------------------------------------------------------------------ per-frame
  update(dt) {
    const g = this.game, p = g.player, inp = g.input;
    if (!this.quest) return;
    // the player is locked exactly while something owns the screen (dialogue, cutscene, minigame, transition)
    p.locked = this.busy > 0 || !!this.minigame || !!this.tricks?.locks;
    this.q.state.playtime += dt;
    // a gentle hint the first time Mika gets near the thieving crab
    const crab = this.wildlife.story.crab;
    if (crab && this.step('c1.cogs') && !this.q.has('crabHint') && !this.busy && crab.pos.distanceTo(p.pos) < 16) {
      this.q.state.flags.crabHint = true;
      this.say('c1_crab');
    }
    this.updateResidents();
    this.updateDetail(dt);
    for (const n of new Set(Object.values(this.npcs))) n.update(dt, g.colliders);   // a shopkeeper can be listed twice while talking
    this.updateVillagers(dt);
    this.town?.update(dt);
    this.indoor?.update();
    this.tricks?.update(dt);
    this.updateBarks(dt);
    this.updateTrain(dt);
    this.wildlife.update(dt, p, this);
    this.tamo.update(dt, p, g.night || 0, !!p.aiming, g.follow.yaw, g.camera);
    this.updateMinigame(dt);
    this.animateWorld(dt);
    this.scenes.update(dt);
    // pickups
    for (const pk of this.pickups.values()) {
      const active = pk.when();
      pk.obj.visible = active;
      if (!active) continue;
      pk.t += dt;
      if (pk.keepsake) { pk.obj.scale.setScalar(1); this.fx.glint(pk.obj.position, this.q.has('hunt')); continue; }
      pk.obj.position.y = pk.pos.y + Math.sin(pk.t * 2.2) * 0.12;
      pk.obj.rotation.y += dt * 1.6;
      if (pk.item === 'star') this.fx.twinkle(pk.obj.position);
      else if (pk.treasure || pk.letter) this.fx.glint(pk.obj.position, this.q.has('hunt'));
      if (!this.busy && pk.obj.position.distanceTo(p.pos.clone().add(V(0, 0.8, 0))) < (pk.grab || 1.45)) this.collect(pk);
    }
    // Rin's ferry is the story's way over; only when the river is frozen does walking across the ice count instead
    if (this.step('c2.ferry') && this.world.frozen && !this.busy && !p.swimming && p.grounded && p.pos.x > 22 && p.pos.z > -60 && p.pos.z < 110) this.event({ type: 'ferry', side: 'east' });
    // zones
    if (!this.busy) for (const z of this.zones.values()) {
      if (z.when() && Math.hypot(p.pos.x - z.pos.x, p.pos.z - z.pos.z) < z.r && Math.abs(p.pos.y - z.pos.y) < 12) this.event({ type: 'arrive', zone: z.id });
    }
    // bees chase briefly after the hive drops
    if (this.bees > 0) { this.bees -= dt; this.fx.bees(p.pos, dt); }
    // interaction prompt
    this.friendNear = !this.busy ? this.findFriend() : null;
    this.actCooldown = Math.max(0, (this.actCooldown || 0) - dt);
    // the Star Kite: G (or the Kite button) launches and lands once Mika has it
    const kite = g.kite, hasKite = this.q.count('kite') > 0;
    if (kite && hasKite && inp.pressed('kite') && !this.busy && !this.minigame && !this.ui.overlay && !this.scenes.active && !this.game.interiors?.active) kite.toggle();
    this.ui.kiteButton(!!kite && hasKite && !this.game.interiors?.active && (kite.active || kite.canLaunch()));
    const canAct = !this.busy && !this.minigame && !this.tricks?.round && !p.locked && !this.ui.overlay && this.actCooldown <= 0 && !kite?.active && !p.aiming;
    const hard = !!this.game.hard;
    let best = null, bd = 1e9, aimHint = null, ad = 1e9;
    if (canAct) for (const it of this.interactables.values()) {
      const pos = it.posFn ? it.posFn() : it.pos;
      if (!pos) continue;
      const d = Math.hypot(pos.x - p.pos.x, pos.z - p.pos.z);
      // Easy mode (the default): Tamo reaches lamps and bells from much farther away and 4x the height
      const reachR = it.spark ? it.radius * (this.game.easy ? 1.6 : 1.15) : it.radius;
      const reachY = it.spark ? it.vy * (this.game.easy ? 4 : 1.5) : it.vy;
      if (d > reachR || Math.abs(pos.y - (p.pos.y + 1)) > reachY) continue;
      if (!it.when()) continue;
      // Hard mode: lamps, bells and the rest are aimed at and sparked by hand (the Star Train's lanterns stay one press)
      if (hard && it.spark && !it.id.startsWith('spark:lantern')) { if (d < ad) { ad = d; aimHint = it; } continue; }
      // story-relevant interactions win over nearby generic ones
      const score = d - (typeof it.prio === 'function' ? it.prio() : it.prio || 0) * 10;
      if (score < bd) { bd = score; best = it; }
    }
    if (best) bd = Math.hypot((best.posFn ? best.posFn() : best.pos).x - p.pos.x, (best.posFn ? best.posFn() : best.pos).z - p.pos.z) / (best.spark && this.game.easy ? 1.6 : 1);
    this.focus = best;
    const labelOf = it => (typeof it.label === 'function' ? it.label() : tx(it.label));
    if (!best && aimHint) {
      this.ui.prompt(tx('Aim and spark: {what}', { what: labelOf(aimHint) }), this.ui.touch ? tx('Aim') : tx('Right mouse'));
      // the first time in a session: how aiming works on this device
      if (!this.aimTaught) {
        this.aimTaught = true;
        this.ui.toast(tx('Hard mode: hold {aim} to aim, then press {fire} to spark', this.ui.touch ? { aim: tx('Aim'), fire: tx('Spark') } : { aim: tx('Right mouse'), fire: tx('Left click') }));
      }
    }
    else this.ui.prompt(best ? labelOf(best) : null);
    this.updateAim();
    if (best && (inp.pressed('act') || (this.ui.touch && inp.pressed('tap') && bd < best.radius * 0.8))) {
      this.audio.click();
      best.action();
    }
    // marker
    // inside a home the arrow only leads to a treasure in this room (the world outside is far below)
    this.ui.marker(g.camera, this.busy || this.tricks?.round ? null : g.interiors?.active ? this.huntInside() : this.markerTarget(), p.pos);
    this.updateHunt();
    if (this.kiteStand) this.kiteStand.obj.visible = this.kiteStand.when();
    this.updateValley(dt);
    for (const x of this.giftObjs || []) x.obj.visible = this.game.interiors?.active === 'cottage' && x.earned();
    // clock & autosave
    this.ui.setClock(g.shownSeason || g.time.season, clockLabel(g.shownHour()));
    this.ui.swimming(p.swimming);
    this.ui.leap(p.leapMul);
    this.saveClock += dt;
    if (this.saveClock > 45 && !this.busy && !this.minigame) {
      this.saveClock = 0;
      if (!this.save() && this.saveFailed && !this.warnedSave) { this.warnedSave = true; this.ui.toast(tx("Couldn't write the save: storage is full or blocked")); }
    }
    // footsteps
    if (p.grounded && p.speed > 0.8) {
      this.stepAcc = (this.stepAcc || 0) + dt * Math.min(p.speed, 7) * 0.62;
      if (this.stepAcc > 1) { this.stepAcc = 0; if (p.leapMul > 1) this.fx.twinkle(p.pos.clone().add(V(0, 0.2, 0))); this.audio.step(g.time.season === 'winter' && p.surface === 'grass' ? 'snow' : p.surface); }
    }
    for (const e of p.events) {
      if (e.type === 'jump') this.audio.jump();
      if (e.type === 'land') this.audio.land(e.strength);
      if (e.type === 'splash') { this.audio.splash(e.strength); this.fx.splash(V(e.x, 0, e.z)); }
      if (e.type === 'leap') { this.audio.whoosh(e.mul); this.fx.burst(p.pos.clone().add(V(0, 0.3, 0)), { n: 10 + e.mul, color: [1, 0.85, 0.45], speed: 2.5, size: 0.2 }); }
      if (e.type === 'stroke') { this.audio.stroke(); if (Math.random() < 0.5) this.fx.splash(V(e.x, 0, e.z)); }
    }
    // river ambience
    const rv = river.nearest(p.pos.x, p.pos.z, 80);
    this.audio.ambience(dt, rv ? Math.max(0, rv.d - riverHalfWidth(rv.z)) : 80, g.night || 0, g.time.season);
  }

  /** The valley's machinery wakes up with its lamps; the star compass points the way. */
  updateValley(dt) {
    const g = this.game, p = g.player, st = this.q.state;
    const hr = Math.floor(g.shownHour());
    if (this.lastHour !== undefined && hr !== this.lastHour && st.lamps.orchard && !this.busy) {
      const tower = V(115, 30, -4), d = tower.distanceTo(p.pos);
      if (d < 260) { this.audio.bell(); this.bellSwing = { node: g.structures.nodes.bell, t: 0 }; }
    }
    this.lastHour = hr;
    if (st.lamps.forest && Math.hypot(p.pos.x - 62, p.pos.z + 152) < 38 && (this.chimeT = (this.chimeT || 0) - dt) <= 0) {
      this.chimeT = 2.5 + Math.random() * 4;
      this.audio.windChime?.();
    }
    // the star compass: a needle toward the nearest Fallen Star still to find
    let dir = null, dist = 0;
    if (st.treasures.compass && !this.busy && !g.interiors?.active && st.stars.length < 12) {
      let best = null, bd = 1e9;
      for (const pk of this.pickups.values()) if (pk.item === 'star' && pk.when()) { const d = pk.pos.distanceTo(p.pos); if (d < bd) { bd = d; best = pk; } }
      if (best) { dir = Math.atan2(best.pos.x - p.pos.x, best.pos.z - p.pos.z) - g.follow.yaw; dist = bd; }
    }
    this.ui.compass(dir, dist);
  }

  animateWorld(dt) {
    const S = this.game.structures;
    if (S.nodes.millWheel && (this.millTurning || this.q.unlocked('drawbridge'))) S.nodes.millWheel.rotation.x -= dt * 0.55;
    const target = this.q.unlocked('drawbridge') ? 0 : -1.2;
    this.drawbridgeAngle = this.drawbridgeAngle ?? target;
    this.drawbridgeAngle += (target - this.drawbridgeAngle) * (1 - Math.exp(-dt * 0.8));
    if (S.nodes.drawbridge) S.nodes.drawbridge.rotation.x = this.drawbridgeAngle;
    if (this.bellSwing?.node) {
      this.bellSwing.t += dt;
      this.bellSwing.node.rotation.x = Math.sin(this.bellSwing.t * 5) * 0.5 * Math.exp(-this.bellSwing.t * 0.7);
      if (this.bellSwing.t > 6) this.bellSwing = null;
    }
    // train smoke
    const r = this.game.railway;
    if (r.cars[0].obj.visible) this.fx.smoke(r.smokePoint(), r.smokeRate, dt, this.game.night || 0);
    this.chuffAcc = (this.chuffAcc || 0) + Math.abs(r.train.v) * dt * 0.5;
    if (this.chuffAcc > 1) {
      this.chuffAcc = 0;
      const d = r.cars[0].obj.position.distanceTo(this.game.player.pos);
      if (d < 120 && r.cars[0].obj.visible) this.audio.chuff(Math.max(0, 1 - d / 120));
    }
  }

  markerTarget() {
    const m = this.q.step.marker;
    if (!m) return null;
    const [kind, what] = m.split(':');
    const p = this.game.player.pos;
    if (kind === 'place') { const pl = PLACES[what] || PLACES[what === 'pen' ? 'pen' : what]; return pl ? V(pl.x, this.world.heightAt(pl.x, pl.z) + 2, pl.z) : null; }
    if (kind === 'npc') {
      if (what === 'fox') return this.wildlife.story.fox?.pos.clone().add(V(0, 1.2, 0));
      if (what === 'sheep') {
        // the nearest sheep still waiting to be sent home; once they're all on their way, the pen
        const left = (this.wildlife.story.sheep || []).filter(s => !s.penned && !s.homing).sort((a, b) => a.pos.distanceTo(p) - b.pos.distanceTo(p));
        return left[0] ? left[0].pos.clone().add(V(0, 1.3, 0)) : V(PLACES.pen.x, this.world.heightAt(PLACES.pen.x, PLACES.pen.z) + 2, PLACES.pen.z);
      }
      if (what === 'bear') return V(PLACES.bearSpot.x, 14, PLACES.bearSpot.z);
      const opts = what.split('|').filter(w => !(w === 'ota' && this.q.has('invitedOta')) && !(w === 'hana' && this.q.has('invitedHana')));
      const list = opts.map(w => this.npcs[w]).filter(Boolean);
      list.sort((a, b) => a.pos.distanceTo(p) - b.pos.distanceTo(p));
      return list[0]?.head();
    }
    if (kind === 'interact') {
      if (what === 'beam') return V(-1.4, DECK_Y + 1, 120);
      if (what === 'ferry') return p.x < 12 ? V(-0.6, 1.8, 30) : V(24.2, 1.8, 30); // over there: Rin comes to fetch Mika
      const it = this.interactables.get(what);
      if (what === 'bell' && p.y < 28) return this.interactables.get('towerDoor').pos.clone().add(V(0, 1.5, 0));
      return it?.pos?.clone().add(V(0, 1, 0)) || null;
    }
    if (kind === 'target') {
      if (what === 'bell' || what === 'lantern') { const t = [...this.targets.values()].filter(t => t.id.startsWith(what) && t.when()).sort((a, b) => a.pos.distanceTo(p) - b.pos.distanceTo(p))[0]; return t?.pos || null; }
      return this.targets.get(what)?.pos || null;
    }
    if (kind === 'hunt') return this.huntTarget();
    if (kind === 'item') {
      const items = what === 'forest' ? ['chestnut', 'mushroom', 'honeycomb'] : [what];
      let best = null, bd = 1e9;
      for (const pk of this.pickups.values()) {
        if (!items.includes(pk.item) || !pk.when()) continue;
        if (what === 'forest') {
          const need = { chestnut: 3, mushroom: 2, honeycomb: 1 }[pk.item];
          if (this.q.count(pk.item) >= need) continue;
        }
        const d = pk.pos.distanceTo(p);
        if (d < bd) { bd = d; best = pk.pos; }
      }
      if (!best && what === 'forest' && !this.q.has('hiveDropped')) return this.targets.get('hive')?.pos || null;
      if (!best && what === 'cog' && this.wildlife.story.crab) return this.wildlife.story.crab.pos.clone().add(V(0, 1, 0));
      return best;
    }
    return null;
  }
}

export { STEPS, STOPS };
