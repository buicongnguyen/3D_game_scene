import * as THREE from 'three';
import { N_ } from '../i18n/i18n.js';
import { CAPTIONS, DIALOGUE, STAR_POEM } from './story.js';
import { tx } from '../i18n/i18n.js';
import { STOPS } from '../world/railway.js';
import { rail, RAIL_Y, DECK_Y, PLACES, FERRY, river, VIADUCT } from '../world/layout.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const wait = ms => new Promise(r => setTimeout(r, ms));

/** Scripted cutscenes. Each returns a promise that resolves when control can return. */
export class Scenes {
  constructor(director) {
    this.d = director;
    this.active = null;
    this.boats = [];
    this.lanterns = [];
  }

  get g() { return this.d.game; }

  async shot(pos, look, dur = 1.6, holdMs = 0) {
    this.g.follow.cutscene({ pos, look }, dur);
    await wait(dur * 1000 + holdMs);
  }

  async play(id, e) {
    const [name, arg] = id.split(':');
    this.active = name;
    this.d.busy++;
    this.g.player.locked = true;
    try {
      if (this[name]) await this[name](arg, e);
    } finally {
      this.active = null;
      this.d.busy--;
      if (!this.d.busy) this.g.player.locked = false;
      if (!['starTrain', 'farewell'].includes(name)) this.g.follow.clearCutscene();
    }
  }

  update(dt) {
    // drifting lantern boats
    for (const b of this.boats) {
      if (b.fixed) continue;
      b.s += dt * 1.4;
      const p = river.at(b.s);
      b.obj.position.set(p.x - p.tz * b.off, 0.05 + Math.sin(b.s * 2 + b.off) * 0.03, p.z + p.tx * b.off);
      b.obj.rotation.y += dt * 0.2;
    }
  }

  // ---------------------------------------------------------------- prologue
  async arrival() {
    const g = this.g, r = g.railway, ui = this.d.ui;
    await ui.fade(true, 10);
    // Kobo comes out of the west tunnel and runs the whole way in while the story is told across the top
    r.placeAt(STOPS.westPortal + 4);
    g.player.root.visible = false;
    this.d.npcs.genzo.setVisible(false);
    g.follow.cutscene({ pos: V(-30, 44, 168), look: V(-60, 16, 110) }, 0.01);
    await wait(100);
    ui.cinema(true);
    const told = Promise.all(CAPTIONS.arrival.map(c => ui.caption(c, 4300)));
    await ui.fade(false, 1600);
    await this.shot(V(-54, 30, 150), V(-120, 18, 108), 3.6, 600);
    r.goTo(STOPS.station, 7);
    this.d.audio.whistle();
    // hold the wide view while Kobo runs out of the tunnel and through the woods, easing a little closer…
    const t1 = performance.now();
    g.follow.cutscene({ pos: V(-62, 26, 144), look: V(-118, 17, 108) }, 9);
    while (r.train.s < STOPS.station - 50 && performance.now() - t1 < 16000) await wait(100);
    // …then ride alongside it into the platform: one continuous, damped tracking shot
    const loco = r.cars[0].obj.position;
    g.follow.track(() => loco.clone().add(V(-2, 5.5, 16)), () => loco.clone().add(V(-6, 1.6, 0)), 2.2);
    const t0 = performance.now();
    while (r.train.target !== null && performance.now() - t0 < 30000) await wait(100);
    await told;
    ui.cinema(false);
    this.d.audio.whistle();
    g.player.root.visible = true;
    g.player.teleport(-94.5, 115.2, undefined, Math.PI / 2);
    g.follow.yaw = Math.PI / 2;
    this.d.npcs.genzo.setVisible(true);
    this.d.npcs.genzo.place(-91.8, 115.4, -Math.PI / 2, RAIL_Y + 0.95);
    await this.shot(V(-90, 19.2, 110.5), V(-93, 17.3, 115.4), 1.4, 200);
    // queued after this cutscene finishes (awaiting here would deadlock the effect queue)
    this.d.event({ type: 'cutscene', id: 'arrival' });
  }

  async tamoWakes() {
    const g = this.g, S = g.structures;
    const chest = new THREE.Vector3();
    (S.nodes.chest || S.byId.get('cottage').obj).getWorldPosition(chest);
    // from the garden in front of the porch (the cottage faces +X)
    await this.shot(chest.clone().add(V(4.6, 1.5, 1.2)), chest.clone().add(V(0, 0.5, 0)), 1.2);
    const lid = S.nodes.chestLid;
    for (let i = 0; i <= 20; i++) { if (lid) lid.rotation.x = -1.4 * (i / 20); await wait(30); }
    this.d.fx.burst(chest.clone().add(V(0, 0.6, 0)), { n: 80, speed: 3, life: 1.6 });
    this.d.audio.star();
    this.d.tamo.show(chest.clone().add(V(0, 0.9, 0)));
    this.d.tamo.override = chest.clone().add(V(0, 1.6, 0));
    this.d.tamo.react('Happy');
    await wait(1400);
    this.d.tamo.override = null;
  }

  // ---------------------------------------------------------------- chapter 1
  async wheelTurns() {
    const g = this.g, S = g.structures;
    const m = S.byId.get('mill');
    g.player.gesture('Hammer', { lock: true });
    for (let k = 0; k < 4; k++) setTimeout(() => this.d.audio.hammer(), 200 + k * 300);
    await this.shot(V(m.x + 14, m.y + 5, m.z + 10), V(m.x + 5.4, m.y + 1.8, m.z), 1.5, 600);
    this.d.millTurning = true;
    this.d.audio.bell();
    this.d.fx.splash(V(m.x + 5.8, 0.1, m.z + 1));
    await wait(1600);
    await this.shot(V(-4, 6, -34), V(-5.5, 1.2, -45), 2.2, 1600);
  }

  async lampLit(id) {
    const g = this.g;
    const L = g.structures.lamps.get(id);
    if (!L) return;
    const f = L.flame;
    const dir = f.clone().sub(g.player.pos).setY(0).normalize();
    const cam = f.clone().addScaledVector(dir, -9).add(V(dir.z * 5, -2.5, -dir.x * 5));
    if (g.world.heightAt(cam.x, cam.z) > cam.y - 1) cam.y = g.world.heightAt(cam.x, cam.z) + 2;
    await this.shot(cam, f, 1.2);
    g.structures.setLamp(id, true);
    this.d.fx.lampBloom(f);
    this.d.audio.lamp();
    this.d.tamo.react('Happy');
    g.follow.shake = 0.3;
    await this.shot(cam.clone().add(V(0, 3, 0)).lerp(f, 0.15), f.clone().add(V(0, -1, 0)), 3.2, 400);
  }

  // ---------------------------------------------------------------- chapter 3
  async bearWakes() {
    const b = this.d.wildlife.story.bear;
    if (!b) return;
    await this.shot(b.pos.clone().add(V(6, 3.5, 7)), b.pos.clone().add(V(0, 1, 0)), 1.2);
    await new Promise(res => this.d.wildlife.bearWakes(res));
  }

  // ---------------------------------------------------------------- chapter 4
  meetingPositions(after) {
    const n = this.d.npcs, y = RAIL_Y + 0.95;
    // after the meeting Genzo goes to work (viaduct, then the engine): the director places him
    if (!after) n.genzo.place(-98, 114.2, Math.PI, y);
    n.ota.place(-106, 115.2, Math.PI / 2 + 0.3, y);
    n.rin.place(-107.5, 113.6, Math.PI / 2, y);
    n.hana.place(-90, 115.2, -Math.PI / 2 - 0.3, y);
    n.v4.place(-88.5, 113.6, -Math.PI / 2, y);
    n.v1.place(-108.5, 116.3, Math.PI / 2, y);
    n.v5.place(-87, 116.2, -Math.PI / 2, y);
    if (after) { n.ota.lookAt(-90, 115); n.hana.lookAt(-106, 115); }
  }

  async meeting() {
    const g = this.g;
    await this.d.ui.fade(true, 600);
    this.meetingPositions(false);
    g.player.teleport(-99.5, 116.4, RAIL_Y + 0.95, Math.PI);
    await wait(100);
    g.follow.cutscene({ pos: V(-98, 21, 104), look: V(-98, 17.5, 115) }, 0.01);
    await this.d.ui.fade(false, 900);
    await wait(900);
    await this.shot(V(-94, 19.4, 108), V(-98, 17.8, 114.4), 2);
  }

  async relay() {
    const g = this.g, L = g.structures.lamps;
    const order = ['forest', 'mill', 'orchard', 'viaduct'];
    await this.shot(V(-60, 70, 190), V(20, 10, -40), 2.2, 600);
    for (const id of order) {
      const l = L.get(id);
      if (!l) continue;
      const f = l.flame;
      await this.shot(f.clone().add(V(12, 6, 16)), f, 1.6);
      this.d.fx.lampBloom(f);
      this.d.audio.chime(order.indexOf(id) + 1);
      await wait(700);
    }
    this.d.fx.meteorShower(0.4);
    await this.shot(V(10, 90, 230), V(10, 5, -20), 3, 1800);
  }

  async starTrain() {
    const g = this.g, r = g.railway, d = this.d;
    await d.ui.fade(true, 600);
    r.buildTrain(3);
    r.setFestival(true);
    r.placeAt(STOPS.station + 8);
    r.update(0, 1);
    const loco = r.cars[0];
    // passengers ride the coach balconies
    const riders = [['ota', 1, 1], ['hana', 1, 2], ['rin', 2, 1], ['v1', 2, 2], ['v4', 3, 1], ['v5', 3, 2]];
    for (const [id, car, seat] of riders) {
      const n = d.npcs[id];
      const c = r.cars[car];
      if (!n || !c) continue;
      const s = c.seats[seat - 1] || c.obj;
      n.root.removeFromParent();
      s.add(n.root);
      n.root.position.set(0, 0, 0);
      n.root.rotation.set(0, Math.PI / 2 * (seat === 1 ? 1 : -1), 0);
      n.riding = true;
    }
    const genzo = d.npcs.genzo;
    genzo.root.removeFromParent();
    (loco.cab || loco.obj).add(genzo.root);
    genzo.root.position.set(0.4, 0, 0);
    genzo.root.rotation.set(0, 0, 0);
    genzo.riding = true;
    g.player.mount(loco.cab || loco.obj, V(-0.5, 0, -0.2), 0);
    this.makeLanterns();
    d.fx.meteorShower(1);
    d.fx.fireworks(true, V(40, 20, 90));
    d.audio.setMusic('winter', 'finale');
    d.ui.ride(true, 0, this.lanterns.length);
    g.follow.clearCutscene();
    g.follow.yaw = Math.atan2(rail.at(STOPS.station + 20).tx, rail.at(STOPS.station + 20).tz);
    await d.ui.fade(false, 900);
    d.audio.whistle();
    r.goTo(STOPS.halt, 6.5);
    this.d.busy--;           // let the player light lanterns (E) during the ride
    g.player.locked = false;
    r.onArrive = () => { r.onArrive = null; this.rideDone = true; };
    this.rideDone = false;
    const told = new Set();
    while (!this.rideDone) {
      d.ui.ride(true, d.q.count('lanterns'), this.lanterns.length);
      const f = (r.train.s - STOPS.station) / (STOPS.halt - STOPS.station);
      for (const c of CAPTIONS.ride) if (f >= c.at && !told.has(c)) { told.add(c); d.ui.caption(c.text, 5200); }
      await wait(200);
    }
    d.ui.ride(false);
    this.d.busy++;
    g.player.locked = true;
    d.audio.whistle();
    d.event({ type: 'ride', done: true });
  }

  makeLanterns() {
    const g = this.g, d = this.d;
    if (this.lanterns.length) return;
    const s0 = STOPS.station + 30, s1 = STOPS.halt - 12;
    for (let i = 0; i < 8; i++) {
      const s = s0 + (s1 - s0) * (i / 7);
      const p = rail.at(s);
      const side = i % 2 ? 1 : -1;
      const onDeck = p.x > VIADUCT.x0 && p.x < VIADUCT.x1 && Math.abs(p.z - VIADUCT.z) < 4;
      const off = onDeck ? 2.4 : 3.6;
      const x = p.x - p.tz * off * side, z = p.z + p.tx * off * side;
      const y = onDeck ? DECK_Y + 1.0 : g.world.heightAt(x, z);
      const obj = g.assets.clone('street-lamp') || new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.4, 0.3), new THREE.MeshStandardMaterial({ color: '#6b4a33' }));
      obj.position.set(x, y, z);
      // own material copies, dark until sparked (the shared street-lamp glow is driven by nightfall)
      obj.traverse(o => { if (o.isMesh) { o.material = [o.material].flat().map(m => m.clone()).find(Boolean); if (o.material.name === 'Street glow') o.material.emissiveIntensity = 0; } });
      g.scene.add(obj);
      const head = V(x, y + 2.4, z);
      const L = { obj, head, lit: false };
      const light = g.lights.add({ pos: head, intensity: () => (L.lit ? 30 : 0), range: 16 });
      L.light = light;
      this.lanterns.push(L);
      d.target(`lantern${i}`, head, N_('Light the trackside lantern'), () => d.step('c4.ride') && !L.lit, () => {
        L.lit = true;
        obj.traverse(o => { if (o.isMesh) for (const m of [o.material].flat()) if (m.name === 'Street glow') { m.emissive = new THREE.Color('#ffb13d'); m.emissiveIntensity = 4; } });
        d.fx.lampBloom(head);
        d.audio.chime(i % 6);
        d.event({ type: 'count', item: 'lanterns' });
      }, { r: 11, vy: 8, prio: 2 });
    }
  }

  /** Epilogue: ride Kobo's Sunday service between the station and Takamori Halt, with the story told on top. */
  async tour() {
    const g = this.g, r = g.railway, d = this.d;
    const fromStation = Math.abs(r.train.s - STOPS.station) < Math.abs(r.train.s - STOPS.halt);
    const [s0, s1] = fromStation ? [STOPS.station, STOPS.halt] : [STOPS.halt, STOPS.station];
    await d.ui.fade(true, 500);
    const loco = r.cars[0];
    g.player.mount(loco.cab || loco.obj, V(-0.5, 0, -0.2), 0);
    g.follow.clearCutscene();
    g.follow.yaw = Math.atan2(rail.at(s0 + (s1 - s0) * 0.05).tx, rail.at(s0 + (s1 - s0) * 0.05).tz) + (fromStation ? 0 : Math.PI);
    await d.ui.fade(false, 700);
    d.audio.whistle();
    r.goTo(s1, 8);
    this.d.busy--;           // look around freely while riding
    g.player.locked = false;
    const told = new Set();
    let arrived = false;
    r.onArrive = () => { r.onArrive = null; arrived = true; };
    while (!arrived) {
      const f = (r.train.s - s0) / (s1 - s0);
      for (const c of CAPTIONS.tour) if (f >= c.at && !told.has(c)) { told.add(c); d.ui.caption(c.text, 5000); }
      await wait(200);
    }
    this.d.busy++;
    d.audio.whistle();
    await d.ui.fade(true, 500);
    if (fromStation) g.player.dismount(PLACES.halt.x - 4, PLACES.halt.z + 2, undefined, 0);
    else g.player.dismount(-94.5, 115.2, undefined, Math.PI / 2);
    g.follow.yaw = g.player.facing;
    this.d.timetable = { phase: 'wait', t: 30 };
    await d.ui.fade(false, 600);
  }

  async finale() {
    const g = this.g, d = this.d;
    d.fx.fireworks(true, V(90, 20, 60));
    d.fx.meteorShower(1.4);
    // Kawabe's lanterns: in winter they are set out in a long line on the frozen river; otherwise they drift downstream
    const frozen = !!g.world.frozen, s0 = river.nearest(0, 118).s;
    for (let i = 0; i < 26; i++) {
      const obj = g.assets.clone('lantern-boat') || new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshStandardMaterial({ color: '#ffb13d', emissive: '#ff9a2a', emissiveIntensity: 3 }));
      obj.traverse(o => { if (o.isMesh) for (const m of [o.material].flat()) if (m.name === 'Lantern glow') { m.emissive = new THREE.Color('#ffb13d'); m.emissiveIntensity = 3.5; } });
      g.scene.add(obj);
      if (frozen) {
        const p = river.at(s0 - 70 + i * 6), off = (i % 2 ? 1 : -1) * (1.5 + (i * 7) % 4);
        obj.position.set(p.x - p.tz * off, 0.08, p.z + p.tx * off);
        obj.rotation.y = i * 1.3;
        this.boats.push({ obj, fixed: true });
      } else this.boats.push({ obj, s: river.nearest(12, 25).s + i * 2.2, off: ((i * 7) % 11 - 5) * 0.9 });
    }
    await this.shot(V(-20, 26, 160), V(0, 18, 120), 2.5, 1500);
    await this.shot(V(40, 30, 150), V(0, 22, 118), 3, 800);
    const f = g.structures.lamps.get('viaduct')?.flame || V(0, 25, 118.6);
    await this.shot(g.player.pos.clone().add(V(-5, 3, 6)), g.player.pos.clone().add(V(0, 1.6, 0)), 1.6);
    this.farewellTarget = f;
  }

  async farewell() {
    const g = this.g, d = this.d;
    const f = g.structures.lamps.get('viaduct')?.flame || V(0, 25, 118.6);
    d.tamo.override = f.clone();
    d.tamo.react('Happy');
    await this.shot(f.clone().add(V(14, 4, 18)), f, 2.5, 2500);
    d.fx.lampBloom(f);
    d.audio.lamp();
    d.tamo.hide();
    await wait(1600);
  }

  // ---------------------------------------------------------------- celebrations: every lamp wakes the valley up
  /** Place friends for a party: [[npcId, x, z, facing]]. Villager/NPC ids from director.npcs. */
  gather(list) {
    const d = this.d;
    for (const [id, x, z, facing] of list) {
      const n = d.npcs[id];
      if (!n) continue;
      n.path = null;
      n.setVisible(true);
      n.place(x, z, facing);
      n.setIdle('Talk');
    }
    return list.map(([id]) => d.npcs[id]).filter(Boolean);
  }

  /** Everyone at the party cheers and waves now and then until stop() is called. */
  partyLoop(npcs) {
    let on = true;
    const tick = () => {
      if (!on) return;
      const n = npcs[Math.floor(Math.random() * npcs.length)];
      if (n) n.gesture(['Cheer', 'Wave', 'Talk', 'Cheer'][Math.floor(Math.random() * 4)]);
      if (Math.random() < 0.3) this.d.tamo.react('Happy');
      setTimeout(tick, 700 + Math.random() * 900);
    };
    tick();
    return () => { on = false; };
  }

  /** A frame for the album: the next rendered frame, downscaled. */
  async photo(id) {
    const url = await this.g.snapshot?.();
    if (url) this.d.addPhoto(id, url);
  }

  async celebrate(n) {
    const g = this.g, d = this.d;
    n = +n;
    d.audio.fanfare?.();
    d.audio.setMusic(g.time.season, 'finale');
    d.ui.cinema(true);
    try { await this[`party${n}`](g.celebrate); } finally {
      d.ui.cinema(false);
      d.audio.setMusic(g.shownSeason || g.time.season, 'calm');
      g.celebrate?.decorate?.(n);
    }
  }

  // spring: the Blossom Wave, koi over the wheel, a rainbow, and a star of petals pointing to Takamori
  async party1(C) {
    const g = this.g, d = this.d;
    const lamp = g.structures.lamps.get('mill')?.flame || V(1.2, 8.8, -45.6);
    const party = this.gather([['ota', -14, -41.5, Math.PI / 2], ['rin', -12, -39, Math.PI / 2], ['v1', -16, -37.5, 1.2], ['v2', -12.5, -35.8, 1.9], ['v3', -14.5, -34.5, 1.6]]);
    g.player.teleport(-11.4, -40.6, undefined, Math.PI / 2);
    const stop = this.partyLoop(party);
    const s0 = river.nearest(lamp.x, lamp.z).s, s1 = river.nearest(8, 60).s;
    C?.blossomWave?.(lamp, s0, s1, 9);
    await this.shot(V(18, 30, -78), V(4, 2, -20), 2.2, 400);
    C?.koiArc?.(V(-1, 0, -40), V(9, 0, -37), 7);
    C?.rainbow?.(V(6, 0, 5), 90, 26);
    await d.sayNow(null, DIALOGUE.c1_party.slice(0, 3));
    await this.shot(V(-4, 7, -30), V(-12, 3, -39), 1.6, 300);
    await this.photo('c1');
    C?.petalStar?.(V(8, 18, -18), V(115, 36, -4));
    await this.shot(V(-16, 10, -30), V(10, 36, -20), 2, 1800);
    await d.sayNow(null, DIALOGUE.c1_party.slice(3));
    stop();
  }

  // summer night: every peach tree a lantern, a river of fireflies, fireworks, a circle dance and floating sheep
  async party2(C) {
    const g = this.g, d = this.d;
    const ring = (i, n, r = 5.5) => [115 + Math.cos(i / n * Math.PI * 2) * r, 7 + Math.sin(i / n * Math.PI * 2) * r];
    const ids = ['hana', 'v4', 'v5', 'v6'];
    const party = this.gather(ids.map((id, i) => [id, ...ring(i, ids.length), 0]));
    // a bon-odori circle: everyone walks round the ring
    let dancing = true;
    party.forEach((n, i) => {
      let k = i * 3;
      const next = () => { if (!dancing) return; k = (k + 1) % 12; n.walk([ring(k, 12)], next, 1.1); };
      next();
    });
    g.player.teleport(111, 11, undefined, 0.8);
    const stop = this.partyLoop(party);
    if (!d.orchardGlow) d.orchardGlow = C?.orchardLanterns?.(V(72, 0, -48), 45, true);
    C?.fireflyRiver?.(V(72, 0, -48), 22);
    d.fx.fireworks(true, V(118, 30, -12));
    await this.shot(V(138, 30, 26), V(96, 14, -30), 2.4, 500);
    await d.sayNow(null, DIALOGUE.c2_party.slice(0, 2));
    C?.floatSheep?.(9);
    await this.shot(V(132, 12, -18), V(150, 4, -38), 1.6, 1200);
    await d.sayNow(null, DIALOGUE.c2_party.slice(2, 4));
    await this.shot(V(122, 9, 18), V(115, 2, 6), 1.6, 300);
    await this.photo('c2');
    // an answer from Kawabe: one small lantern boat on the river
    const boat = g.assets.clone('lantern-boat');
    if (boat && !g.world.frozen) { g.scene.add(boat); this.boats.push({ obj: boat, s: river.nearest(9, -20).s, off: 0.5 }); }
    await this.shot(V(40, 14, 10), V(9, 0, -12), 2, 600);
    await d.sayNow(null, DIALOGUE.c2_party.slice(4));
    dancing = false;
    stop();
    d.fx.fireworks(false);
  }

  // autumn: kodama, leaf-butterflies up the shrine steps, the animals gather to watch the moon
  async party3(C) {
    const g = this.g, d = this.d, W = d.wildlife;
    const clearing = V(60, g.world.heightAt(60, -118), -118);
    const bear = W.story.bear || W.spawnBear();
    bear.path = null; bear.setVisible(true); bear.place(56.5, -115.5, 0.9); bear.setIdle('Sit');
    const fox = W.story.fox || W.spawnFox([[63.5, -114.5]]);
    fox.path = null; fox.trail = []; fox.place(63.5, -114.5, -2.4); fox.setIdle('Sit');
    (W.deer || []).slice(0, 2).forEach((a, i) => { a.path = null; a.place(64 + i * 2.2, -120 - i, -1.2); a.setIdle('Graze'); });
    (W.rabbits || []).slice(0, 2).forEach((a, i) => { a.path = null; a.place(59 + i * 1.3, -121.5, 0.3); a.setIdle('Idle'); });
    g.player.teleport(60.5, -113, undefined, Math.PI);
    C?.kodama?.(clearing, 36, 16);
    C?.leafButterflies?.(V(61, 12, -121), V(71, 25, -146), 10);
    await this.shot(V(76, 30, -104), V(62, 12, -130), 2.2, 400);
    await d.sayNow(null, DIALOGUE.c3_party.slice(0, 3));
    // the sky darkens for moon-viewing
    const h0 = g.time.hour, t0 = performance.now();
    while (performance.now() - t0 < 3000) { const k = (performance.now() - t0) / 3000; g.time.hour = h0 + (20.5 - h0) * k * k * (3 - 2 * k); await wait(16); }
    d.q.state.hour = g.time.hour;
    const moon = g.sky?.uniforms?.uMoonDir?.value?.clone().normalize() || V(-0.45, 0.62, 0.52).normalize();
    await this.shot(clearing.clone().add(V(-moon.x * 9, 3, -moon.z * 9)), clearing.clone().add(moon.clone().multiplyScalar(40)), 2, 400);
    await d.sayNow(null, DIALOGUE.c3_party.slice(3));
    await this.shot(V(60, 16.5, -106), V(60, 13, -118), 1.4, 300);
    await this.photo('c3');
    // Ōkuma's thank-you: a golden acorn
    bear.setIdle('Walk'); bear.walk([[59.2, -113.8]], () => bear.setIdle('Sit'), 0.9);
    await this.shot(V(63, 14.5, -108.5), V(59.5, 12.6, -113.5), 1.6, 1200);
    d.fx.burst(V(59.8, 12.5, -113.2), { n: 30, color: [1, 0.85, 0.3], speed: 2 });
    d.q.state.inv.acorn = 1;
    d.ui.toast(tx('Received: {item}', { item: tx('Golden acorn') }), 'golden-acorn');
    await d.sayNow('bear_acorn');
  }

  // winter finale: aurora, star-snow, the Star Train crossing the sky with Sora at the window, then the photo
  async party4(C) {
    const g = this.g, d = this.d, r = g.railway;
    const aurora = C?.aurora?.(true), snow = C?.starSnow?.(true);
    const hx = PLACES.halt.x, hz = PLACES.halt.z, hy = g.world.heightAt(hx, hz);
    await this.shot(V(hx - 10, hy + 5, hz - 6), V(hx - 50, hy + 60, hz + 70), 2.2, 300);
    const train = C?.skyTrain?.(null, 20);
    // follow the train of starlight across the sky from the halt
    const camAt = V(hx - 6, hy + 3.2, hz - 2);
    const trainAt = () => (train?.train ? train.train.getWorldPosition(V(0, 0, 0)) : V(hx - 40, hy + 90, hz + 90));
    g.follow.track(() => camAt.clone(), trainAt, 2.2);
    await wait(1600);
    await d.sayNow(null, DIALOGUE.c4_skytrain.slice(0, 1));
    // close on the window: Sora, waving
    if (train?.sora) {
      const at = () => train.sora.getWorldPosition(V(0, 0, 0));
      g.follow.track(() => at().add(V(-5, 2, -25)), at, 3);
      await wait(3200);
    }
    await d.sayNow(null, DIALOGUE.c4_skytrain.slice(1, 2));
    g.follow.track(() => camAt.clone().add(V(-4, 0.6, -3)), trainAt, 2.2);
    await d.sayNow(null, DIALOGUE.c4_skytrain.slice(2));
    await Promise.race([train, wait(1500)]); // the train sails on out of sight while everyone climbs down
    // everyone steps down in front of Kobo for the photograph
    for (const n of Object.values(d.npcs)) if (n.riding) { n.root.removeFromParent(); g.scene.add(n.root); n.riding = false; }
    const loco = r.cars[0].obj;
    const p = rail.at(r.train.s), fwd = V(p.tx, 0, p.tz), side = V(-p.tz, 0, p.tx);
    const front = loco.position.clone().addScaledVector(fwd, 5.2);
    const row = ['ota', 'genzo', null, 'hana', 'rin'];
    const party = this.gather(row.map((id, i) => id && [id, front.x + side.x * (i - 2) * 1.05, front.z + side.z * (i - 2) * 1.05, Math.atan2(fwd.x, fwd.z)]).filter(Boolean));
    g.player.dismount(front.x, front.z, undefined, Math.atan2(fwd.x, fwd.z));
    const stop = this.partyLoop(party);
    const cam = front.clone().addScaledVector(fwd, 7.5).add(V(0, 2.1, 0));
    await this.shot(cam, front.clone().add(V(0, 1.3, 0)), 1.6, 200);
    await d.sayNow(null, DIALOGUE.c4_photo.slice(0, 5));
    stop();
    for (const n of party) { n.setIdle('Idle'); n.lookAt(cam.x, cam.z); }
    g.player.facing = Math.atan2(fwd.x, fwd.z);
    await d.sayNow(null, DIALOGUE.c4_photo.slice(5));
    for (const n of party) n.gesture(n.anim?.has?.('Cheer') ? 'Cheer' : 'Wave');
    g.player.gesture('Cheer', { lock: false });
    await wait(450);
    await this.photo('c4');
    d.ui.flash?.();
    d.audio.star();
    C?.sparkleBurst?.(front.clone().add(V(0, 2.5, 0)));
    await wait(1400);
    // the credits, as a photo album of the year
    d.ui.creditsAlbum?.(d.album());
    d.ui.open('credits');
    await wait(9000);
    d.ui.closeAll();
    g.paused = false;
    await d.ui.fade(true, 1200);
    aurora?.stop?.(); snow?.stop?.();
    d.fx.fireworks(false);
    d.fx.meteorShower(0);
    for (const b of this.boats) g.scene.remove(b.obj);
    this.boats = [];
    for (const L of this.lanterns) { g.scene.remove(L.obj); g.lights.remove(L.light); }
    g.player.dismount(PLACES.halt.x - 4, PLACES.halt.z + 2, undefined, 0);
    g.railway.setFestival(false);
    g.railway.buildTrain(2);
    g.railway.placeAt(STOPS.station + 8);
    d.audio.setMusic('spring', 'calm');
    await d.ui.fade(false, 1200);
  }

  // ---------------------------------------------------------------- rewards
  /** Sora's music box: Mika climbs out onto the bank and opens it; a golden memory dances. */
  async musicBox() {
    const g = this.g, d = this.d, C = g.celebrate;
    const rv = river.nearest(g.player.pos.x, g.player.pos.z, 60);
    const side = rv ? V(-rv.tz, 0, rv.tx) : V(1, 0, 0);
    let bank = null;
    for (const sgn of [1, -1]) for (let k = 4; k < 30 && !bank; k += 1) {
      const x = (rv?.x ?? g.player.pos.x) + side.x * k * sgn, z = (rv?.z ?? g.player.pos.z) + side.z * k * sgn;
      if (g.world.heightAt(x, z) > 0.6 && g.world.grid.slopeAt(x, z) < 20) bank = V(x, g.world.heightAt(x, z), z);
    }
    bank ??= g.player.pos.clone();
    await d.ui.fade(true, 500);
    g.player.teleport(bank.x, bank.z, undefined, Math.atan2(-side.x, -side.z));
    const box = g.assets.clone('music-box');
    const front = V(Math.sin(g.player.facing), 0, Math.cos(g.player.facing));
    const at = bank.clone().addScaledVector(front, 0.9).add(V(0, 0.05, 0));
    if (box) { box.position.copy(at); box.rotation.y = g.player.facing + Math.PI; g.scene.add(box); }
    const cam = bank.clone().addScaledVector(front, 3.4).add(V(side.x * 1.5, 1.6, side.z * 1.5));
    g.follow.cutscene({ pos: cam, look: bank.clone().add(V(0, 0.9, 0)) }, 0.01);
    await d.ui.fade(false, 700);
    g.player.gesture('Interact', { lock: true });
    d.audio.lullaby?.();
    C?.musicNotes?.(at.clone().add(V(0, 0.3, 0)), 10);
    const dance = C?.memory?.(bank.clone().addScaledVector(front, 4.5), 14);
    await this.shot(bank.clone().addScaledVector(front, -2.5).add(V(0, 2.2, 0)), bank.clone().addScaledVector(front, 4.5).add(V(0, 1, 0)), 2, 300);
    await d.sayNow('music_box');
    await Promise.race([dance, wait(4000)]);
    if (box) g.scene.remove(box);
  }

  /** The golden acorn goes into Sora's garden and a star-tree grows from it. */
  async plantTree() {
    const g = this.g, d = this.d, C = g.celebrate, spot = d.treeSpot;
    d.q.state.inv.acorn = 0;
    d.q.state.flags.treePlanted = true;
    g.player.teleport(spot.x - 1.6, spot.z + 1.2, undefined, Math.atan2(1.6, -1.2));
    await this.shot(spot.clone().add(V(-5, 2.4, 5.5)), spot.clone().add(V(0, 1.2, 0)), 1.2, 200);
    g.player.gesture('Interact', { lock: true });
    await wait(900);
    d.fx.burst(spot.clone().add(V(0, 0.3, 0)), { n: 50, color: [1, 0.85, 0.35], speed: 2.5 });
    const tree = d.spawnStarTree();
    await this.shot(spot.clone().add(V(-7, 3.5, 8)), spot.clone().add(V(0, 2.2, 0)), 1.2, 0);
    const grown = tree ? C?.grow?.(tree, 3.5) : null;
    d.audio.star();
    await d.sayNow('star_tree');
    await grown;
    d.refreshObjective();
  }

  /** All twelve Fallen Stars: night falls, the sky fills with stars and constellations, the poem writes itself. */
  async starfall() {
    const g = this.g, d = this.d, C = g.celebrate;
    d.ui.cinema(true);
    const h0 = g.time.hour, to = 22.3, t0 = performance.now();
    while (performance.now() - t0 < 3200) {
      const k = (performance.now() - t0) / 3200, e = k * k * (3 - 2 * k);
      g.time.hour = (h0 + ((to - h0 + 24) % 24) * e) % 24;
      await wait(16);
    }
    d.q.state.hour = g.time.hour;
    d.starfallSky ??= C?.starfall?.(true);
    d.fx.meteorShower(1);
    d.audio.setMusic(g.shownSeason || g.time.season, 'finale');
    const p = g.player.pos, fwd = V(Math.sin(g.follow.yaw), 0, Math.cos(g.follow.yaw));
    await this.shot(p.clone().addScaledVector(fwd, -3).add(V(0, 1.6, 0)), p.clone().addScaledVector(fwd, 30).add(V(0, 26, 0)), 2.4, 300);
    await d.sayNow('starfall');
    const drawn = C?.constellations?.(30, { center: p.clone() });
    // Sora's poem, two lines at a time, written across the sky
    for (let i = 0; i < STAR_POEM.length; i += 2) d.ui.caption(`${tx(STAR_POEM[i])} ${tx(STAR_POEM[i + 1])}`, 4200);
    await this.shot(p.clone().addScaledVector(fwd, -6).add(V(0, 2.4, 0)), p.clone().addScaledVector(fwd, 20).add(V(0, 34, 0)), 6, 0);
    await Promise.race([drawn, wait(28000)]);
    d.ui.cinema(false);
    await d.sayNow('sora_last_letter');
    d.fx.meteorShower(0.35);
    d.audio.setMusic(g.shownSeason || g.time.season, 'calm');
  }

  /** Epilogue: Tamo pops out of the Viaduct Lamp. Sundays off! */
  async tamoReturns() {
    const g = this.g, d = this.d;
    const f = g.structures.lamps.get('viaduct')?.flame || V(0, 25, 118.6);
    const p = g.player.pos;
    d.tamo.show(f.clone());
    d.tamo.override = f.clone();
    await this.shot(p.clone().add(V(-4, 2.6, 5)), p.clone().add(V(0, 1.6, 0)), 1.2, 200);
    d.fx.burst(f, { n: 60, speed: 4 });
    d.audio.star();
    const t0 = performance.now(), from = f.clone(), to = () => p.clone().add(V(0.8, 1.8, 0.4));
    while (performance.now() - t0 < 1600) {
      const k = (performance.now() - t0) / 1600, e = k * k * (3 - 2 * k);
      d.tamo.override = from.clone().lerp(to(), e).add(V(0, Math.sin(k * Math.PI) * 6, 0));
      await wait(16);
    }
    d.tamo.override = null;
    d.tamo.react('Happy');
    d.fx.burst(to(), { n: 40, speed: 2.5, color: [1, 0.85, 0.4] });
    await d.sayNow('tamo_returns');
  }

  epiloguePositions() {
    const n = this.d.npcs, y = RAIL_Y + 0.95;
    n.genzo.place(-92, 116.6, -Math.PI / 2, y);
    n.ota.place(98.5, 18.5, -1.2);
    n.hana.place(101.5, 17, 1.8);
    n.rin.place(-0.4, 31.6, Math.PI / 2, 0.72);
  }

  // ---------------------------------------------------------------- ferry
  async ferry(side) {
    const g = this.g, d = this.d, S = g.structures;
    const ferry = S.nodes.ferry;
    const from = side === 'east' ? FERRY.from : FERRY.to;
    const to = side === 'east' ? FERRY.to : FERRY.from;
    const rin = d.npcs.rin;
    await d.ui.fade(true, 350);
    ferry.position.set(from.x, 0, from.z);
    g.player.mount(ferry, V(0.4, 0.55, -0.8), Math.PI / 2);
    rin.place(from.x, from.z, 0, 0.55);
    rin.setIdle('Pole');
    await d.ui.fade(false, 350);
    const t0 = performance.now(), dur = 6500;
    await d.say('ferry_ride');
    this.g.follow.cutscene({ pos: V((from.x + to.x) / 2, 7, from.z + 16), look: V((from.x + to.x) / 2, 0.5, from.z) }, 1.2);
    await new Promise(res => {
      const tick = () => {
        const k = Math.min(1, (performance.now() - t0) / dur);
        const e = k * k * (3 - 2 * k);
        ferry.position.set(from.x + (to.x - from.x) * e, Math.sin(k * 20) * 0.04, from.z + Math.sin(k * Math.PI) * 1.5);
        rin.place(ferry.position.x - 0.8, ferry.position.z + 0.2, Math.PI / 2 * (to.x > from.x ? 1 : -1), 0.55);
        if (k < 1) requestAnimationFrame(tick); else res();
      };
      tick();
    });
    const landX = side === 'east' ? PLACES.eastDock.x + 2.4 : PLACES.kawabeDock.x - 3.6;
    g.player.dismount(landX, 30, 0.72, side === 'east' ? Math.PI / 2 : -Math.PI / 2);
    g.follow.yaw = side === 'east' ? Math.PI / 2 : -Math.PI / 2;
    rin.setIdle('Idle');
    rin.place(side === 'east' ? PLACES.eastDock.x - 0.8 : -0.4, 31.6, side === 'east' ? -Math.PI / 2 : Math.PI / 2, 0.72);
    g.follow.clearCutscene();
  }
}
