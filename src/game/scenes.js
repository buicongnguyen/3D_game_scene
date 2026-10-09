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

  /** Chapter 3: the camera finds the landslide scar, then Mika and Tamo talk it over. */
  async landslide() {
    const L = PLACES.landslide, toe = this.above(L.x, L.z, 0);
    // straight up the path, then a slow push in toward the headscarp
    await this.shot(this.above(L.x + 2.6, L.z + 24, 4.2), toe.clone().add(V(0, 3.6, -6)), 2.2, 900);
    await this.shot(this.above(L.x + 1.6, L.z + 15, 3.4), toe.clone().add(V(0, 4.6, -8)), 3.6, 0);
    await this.d.sayNow('c3_landslide');
  }

  // ---------------------------------------------------------------- chapter 4
  meetingPositions(after) {
    const n = this.d.npcs, y = RAIL_Y + 0.95;
    // after the meeting Genzo goes to work (viaduct, then the engine): the director places him
    if (!after) n.genzo.place(-98, 114.2, Math.PI, y);
    n.ota.place(-106, 115.2, Math.PI / 2 + 0.3, y);
    n.rin.place(-107.5, 113.6, Math.PI / 2, y);
    n.hana.place(-90, 115.2, -Math.PI / 2 - 0.3, y);
    for (const id of ['v4', 'v1', 'v5']) this.d.town?.release(id);   // the neighbours leave their day plans for the meeting
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
    try {
      while (!this.rideDone) {
        d.ui.ride(true, d.q.count('lanterns'), this.lanterns.length);
        const f = (r.train.s - STOPS.station) / (STOPS.halt - STOPS.station);
        for (const c of CAPTIONS.ride) if (f >= c.at && !told.has(c)) { told.add(c); d.ui.caption(c.text, 5200); }
        await wait(200);
      }
    } finally {
      d.ui.ride(false);
      this.d.busy++;          // always re-balanced, so an error mid-ride cannot leave the game "busy" below zero for the session
      g.player.locked = true;
    }
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
    try {
      while (!arrived) {
        const f = (r.train.s - s0) / (s1 - s0);
        for (const c of CAPTIONS.tour) if (f >= c.at && !told.has(c)) { told.add(c); d.ui.caption(c.text, 5000); }
        await wait(200);
      }
    } finally { this.d.busy++; }
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
      this.d.town?.release(id);                 // out of their day plan (indoors, mid-errand) and into the party
      n.setVisible(true);
      n.place(x, z, facing, this.standY(x, z));
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

  /** Where someone stands at (x, z): the ground, or the top of a platform, deck or step there. */
  standY(x, z) {
    const g = this.g, h = g.world.heightAt(x, z);
    const c = g.colliders.groundAt(x, z, h + 3, 3);
    return c && c.y > h ? c.y : h;
  }

  /** `n` places in a row through c along dir, `gap` apart, on c's level (a slot off a platform's edge moves outward on the other side). */
  rowSlots(c, dir, n, gap = 0.95) {
    const out = [];
    for (let i = 0; out.length < n && i < 24; i++) {
      const o = (i % 2 ? -1 : 1) * Math.ceil((i + 1) / 2) * gap; // +1, -1, +2, -2 …
      const x = c.x + dir.x * o, z = c.z + dir.z * o;
      if (Math.abs(this.standY(x, z) - c.y) < 0.3) out.push([x, z, o]);
    }
    return out.sort((a, b) => a[2] - b[2]);
  }

  /** A point `dy` above whatever one would stand on at (x, z). */
  above(x, z, dy = 0) { return V(x, this.standY(x, z) + dy, z); }

  /** Eases the time of day to `hour` over `ms`, the short way round the clock (golden hour, blue hour, night). */
  async easeHour(hour, ms = 2500) {
    const g = this.g, h0 = g.time.hour, t0 = performance.now();
    const span = ((hour - h0 + 36) % 24) - 12;
    while (performance.now() - t0 < ms) {
      const k = (performance.now() - t0) / ms;
      g.time.hour = (h0 + span * k * k * (3 - 2 * k) + 24) % 24;
      await wait(16);
    }
    g.time.hour = (hour + 24) % 24;
    this.d.q.state.hour = g.time.hour;
  }

  /**
   * A slow reward flight: the camera glides along a smooth curve through [pos, look] keyframes for `seconds`,
   * easing in and out and never dipping into the ground, while `captions` ({at, text}) are told across the top.
   * Level of detail follows the view meanwhile, so the whole village stays dressed while the camera is far from Mika.
   */
  async flight(keys, seconds, captions = []) {
    const g = this.g, d = this.d;
    const P = new THREE.CatmullRomCurve3(keys.map(k => k[0]), false, 'centripetal');
    const L = new THREE.CatmullRomCurve3(keys.map(k => k[1]), false, 'centripetal');
    const T = seconds * 1000, t0 = performance.now(), a = 0.14, v = 1 / (1 - a);
    // a gentle start and stop, a steady glide in between
    const u = () => {
      const t = Math.min(1, (performance.now() - t0) / T);
      return t < a ? v * t * t / (2 * a) : t > 1 - a ? 1 - v * (1 - t) * (1 - t) / (2 * a) : v * (t - a / 2);
    };
    const pos = () => {
      const p = P.getPoint(u());
      p.y = Math.max(p.y, g.world.heightAt(p.x, p.z) + 3);
      return p;
    };
    const look = () => (g.viewFocus = L.getPoint(u()));
    g.follow.track(pos, look, 5);
    const told = new Set();
    try {
      while (performance.now() - t0 < T) {
        const f = (performance.now() - t0) / T;
        for (const c of captions || []) if (f >= c.at && !told.has(c)) { told.add(c); d.ui.caption(c.text, 5600); }
        await wait(100);
      }
      await wait(500);
    } finally {
      g.viewFocus = null;   // level of detail goes back to following Mika, whatever happened
    }
  }

  /**
   * The chapter photograph: everyone turns to the camera and cheers, Tamo floats into the frame, a warm fill light
   * (night photos) brightens their faces and colours, and the frame goes into the album.
   */
  async groupPhoto(id, people, cam, look, { fill = false, tamo = true } = {}) {
    const g = this.g, d = this.d, p = g.player;
    if (tamo && d.tamoAround()) d.tamo.override = look.clone().lerp(cam, 0.18).add(V(0.9, 1.2, 0));
    await this.shot(cam, look, 1.8, 250);
    for (const n of people) { n.setIdle('Idle'); n.lookAt(cam.x, cam.z); }
    p.facing = Math.atan2(cam.x - p.pos.x, cam.z - p.pos.z);
    const light = fill ? g.lights.add({ pos: cam.clone().lerp(look, 0.45).add(V(0, 1.4, 0)), intensity: () => 34, range: 14, color: '#ffe2b8' }) : null;
    await wait(450);
    for (const n of people) n.gesture(n.anim?.has?.('Cheer') ? 'Cheer' : 'Wave');
    p.gesture('Cheer', { lock: false });
    await wait(520);
    await this.photo(id);
    d.ui.flash?.();
    d.audio.star();
    await wait(1200);
    if (light) g.lights.remove(light);
    d.tamo.override = null;
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

  // spring at golden hour: the Blossom Wave, koi over the wheel, a rainbow, the photo on the west bank, a star of
  // petals pointing to Takamori, and a slow flight over Kawabe with the blossoms streaming down the river
  async party1(C) {
    const g = this.g, d = this.d;
    const lamp = g.structures.lamps.get('mill')?.flame || V(1.2, 8.8, -45.6);
    const golden = this.easeHour(17.6, 2600);
    // everyone on the west bank, in a row facing the river and the lamp
    const row = [['v3', -13.4, -31.6], ['v1', -12.8, -33.4], ['ota', -12.9, -35.1], ['rin', -12.5, -38.7], ['v2', -12.9, -40.4]];
    const party = this.gather(row.map(([id, x, z]) => [id, x, z, Math.PI / 2]));
    g.player.teleport(-12.3, -36.9, undefined, Math.PI / 2);
    const stop = this.partyLoop(party);
    const s0 = river.nearest(lamp.x, lamp.z).s, s1 = river.nearest(8, 60).s;
    C?.blossomWave?.(lamp, s0, s1, 9);
    await this.shot(V(18, 30, -78), V(4, 2, -20), 2.2, 400);
    await golden;
    C?.koiArc?.(V(-1, 0, -40), V(9, 0, -37), 7);
    C?.rainbow?.(V(6, 0, 5), 90, 70);
    await d.sayNow(null, DIALOGUE.c1_party.slice(0, 3));
    stop();
    await this.groupPhoto('c1', party, this.above(-19.4, -36.4, 2.2), this.above(-12.6, -36.4, 1.3));
    const stop2 = this.partyLoop(party);
    C?.petalStar?.(V(8, 18, -18), V(115, 36, -4));
    await this.shot(V(-16, 10, -30), V(10, 36, -20), 2, 1800);
    await d.sayNow(null, DIALOGUE.c1_party.slice(3));
    // the reward: a long, slow look at Kawabe from the air while the blossoms stream down the river
    C?.blossomWave?.(lamp, s0, s1, 24, { linger: 6 });
    await this.flight([
      [V(-5, 5.5, -31), V(3, 2.5, -46)],
      [V(12, 14, -24), V(1, 3, -46)],
      [V(30, 34, 0), V(-8, 0, -38)],
      [V(20, 56, 44), V(-26, 0, -16)],
      [V(-12, 74, 80), V(-40, 2, -6)],
    ], 24, CAPTIONS.flight1);
    stop2();
  }

  // summer blue hour: every peach tree a lantern, a river of fireflies, fireworks, a circle dance, floating sheep,
  // the photo under the bell tower, and a slow flight over Takamori and the glowing orchard
  async party2(C) {
    const g = this.g, d = this.d;
    const blue = this.easeHour(19.7, 2600);
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
    C?.fireflyRiver?.(V(72, 0, -48), 70);
    d.fx.fireworks(true, V(118, 30, -12));
    await this.shot(this.above(142, 26, 12), this.above(98, -28, 2), 2.4, 500);
    await blue;
    await d.sayNow(null, DIALOGUE.c2_party.slice(0, 2));
    C?.floatSheep?.(9);
    await this.shot(this.above(134, -14, 5), this.above(150, -38, 2), 1.6, 1200);
    await d.sayNow(null, DIALOGUE.c2_party.slice(2, 4));
    // the photo: the dancers line up in the square, the bell tower and the fireworks behind them
    dancing = false;
    stop();
    const line = [['hana', 111.4], ['v4', 113.2], ['v5', 116.8], ['v6', 118.6]];
    for (const [id, x] of line) d.npcs[id]?.place(x, 8.6, 0, this.standY(x, 8.6));
    g.player.teleport(115, 8.6, undefined, 0);
    const people = line.map(([id]) => d.npcs[id]).filter(Boolean);
    await this.groupPhoto('c2', people, this.above(115, 17.4, 1.7), this.above(115, 5, 3.4), { fill: true });
    const stop2 = this.partyLoop(people);
    // an answer from Kawabe: one small lantern boat on the river
    const boat = g.assets.clone('lantern-boat');
    if (boat && !g.world.frozen) { g.scene.add(boat); this.boats.push({ obj: boat, s: river.nearest(9, -20).s, off: 0.5 }); }
    await this.shot(V(40, 14, 10), V(9, 0, -12), 2, 600);
    await d.sayNow(null, DIALOGUE.c2_party.slice(4));
    // the reward: a slow flight over Takamori and the orchard glowing like a field of lanterns
    await this.flight([
      [this.above(121, 22, 5), this.above(115, -2, 6)],
      [this.above(140, 4, 16), this.above(100, -30, 2)],
      [this.above(126, -58, 34), this.above(76, -46, 0)],
      [this.above(72, -98, 50), this.above(88, -22, 0)],
      [this.above(38, -40, 62), this.above(112, -4, 4)],
    ], 24, CAPTIONS.flight2);
    stop2();
    d.fx.fireworks(false);
  }

  // autumn: a golden afternoon with the forest's animals, the photo under the torii, a slow flight over the shrine
  // woods, then the kodama come out as the moon rises, and Ōkuma brings a golden acorn
  async party3(C) {
    const g = this.g, d = this.d, W = d.wildlife;
    const golden = this.easeHour(16.9, 2600);
    const clearing = this.above(60, -118, 0);
    const cam = this.above(60.4, -107.9, 1.9);
    const face = (x, z) => Math.atan2(cam.x - x, cam.z - z);
    const bear = W.story.bear || W.spawnBear();
    bear.path = null; bear.setVisible(true); bear.place(57, -115.8, face(57, -115.8)); bear.setIdle('Sit');
    const fox = W.story.fox || W.spawnFox([[63.5, -114.5]]);
    fox.path = null; fox.trail = []; fox.place(63.4, -114.8, face(63.4, -114.8)); fox.setIdle('Sit');
    (W.deer || []).slice(0, 2).forEach((a, i) => { a.path = null; a.place(64.4 + i * 2.2, -119.5 - i, face(64.4 + i * 2.2, -119.5 - i)); a.setIdle('Graze'); });
    (W.rabbits || []).slice(0, 2).forEach((a, i) => { a.path = null; a.place(58.6 + i * 1.4, -112.6 + i * 0.4, face(58.6 + i * 1.4, -112.6)); a.setIdle('Idle'); });
    g.player.teleport(60.6, -114, undefined, 0);
    C?.leafButterflies?.(V(61, 12, -121), V(71, 25, -146), 10);
    await this.shot(this.above(76, -104, 17), this.above(62, -130, 0), 2.2, 400);
    await golden;
    await d.sayNow(null, DIALOGUE.c3_party.slice(0, 3));
    // the photo in the golden light: Mika with Ōkuma, Kon, the deer and the rabbits, under the torii
    await this.groupPhoto('c3', [], cam, this.above(60.6, -116.5, 1.1));
    // the reward: a slow flight over the golden shrine woods while the leaves turn into butterflies
    C?.leafButterflies?.(V(61, 12, -121), V(71, 25, -146), 16);
    await this.flight([
      [this.above(66, -107, 4), this.above(62, -126, 5)],
      [this.above(82, -118, 16), this.above(64, -150, 6)],
      [this.above(84, -170, 32), this.above(56, -128, 0)],
      [this.above(38, -176, 48), this.above(62, -112, 0)],
      [this.above(16, -118, 60), this.above(70, -142, 0)],
    ], 24, CAPTIONS.flight3);
    // the sky darkens for moon-viewing, and the kodama come out
    g.player.teleport(60.5, -113, undefined, Math.PI);
    C?.kodama?.(clearing, 36, 16);
    await this.shot(this.above(66, -108, 5), clearing.clone().add(V(0, 2, 0)), 1.6, 0);
    await this.easeHour(20.5, 3000);
    const moon = g.sky?.uniforms?.uMoonDir?.value?.clone().normalize() || V(-0.45, 0.62, 0.52).normalize();
    await this.shot(clearing.clone().add(V(-moon.x * 9, 3, -moon.z * 9)), clearing.clone().add(moon.clone().multiplyScalar(40)), 2, 400);
    await d.sayNow(null, DIALOGUE.c3_party.slice(3));
    // Ōkuma's thank-you: a golden acorn
    bear.setIdle('Walk'); bear.walk([[59.2, -113.8]], () => bear.setIdle('Sit'), 0.9);
    await this.shot(this.above(63, -108.5, 2.2), this.above(59.5, -113.5, 0.6), 1.6, 1200);
    d.fx.burst(this.above(59.8, -113.2, 0.4), { n: 30, color: [1, 0.85, 0.3], speed: 2 });
    d.q.state.inv.acorn = 1;
    d.q.state.flags.acornGiven = true;
    d.ui.toast(tx('Received: {item}', { item: tx('Golden acorn') }), 'golden-acorn');
    await d.sayNow('bear_acorn');
  }

  // winter finale: aurora, star-snow, the Star Train crossing the sky with Sora at the window, the photo in front of
  // Kobo, and a slow flight over the whole snowy valley
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
    // everyone steps down in front of Kobo for the photograph (on the platform or the track bed, wherever that is)
    for (const n of Object.values(d.npcs)) if (n.riding) { n.root.removeFromParent(); g.scene.add(n.root); n.riding = false; }
    const loco = r.cars[0].obj;
    const p = rail.at(r.train.s), fwd = V(p.tx, 0, p.tz), side = V(-p.tz, 0, p.tx);
    const front = loco.position.clone().addScaledVector(fwd, 5.2);
    front.y = this.standY(front.x, front.z);
    // a row across the platform, everyone on the same level as Mika (nobody off the edge on the track bed)
    const slots = this.rowSlots(front, side, 4, 0.9);
    const ids = ['ota', 'genzo', 'hana', 'rin'];
    const party = this.gather(slots.map(([x, z], i) => [ids[i], x, z, Math.atan2(fwd.x, fwd.z)]));
    g.player.dismount(front.x, front.z, front.y, Math.atan2(fwd.x, fwd.z));
    const stop = this.partyLoop(party);
    const mid = slots.reduce((m, [x, z]) => m.add(V(x / (slots.length + 1), 0, z / (slots.length + 1))), V(front.x / (slots.length + 1), 0, front.z / (slots.length + 1)));
    mid.y = front.y;
    const cam = mid.clone().addScaledVector(fwd, 5.6).add(V(0, 2.2, 0));
    await this.shot(cam, front.clone().add(V(0, 1.3, 0)), 1.6, 200);
    await d.sayNow(null, DIALOGUE.c4_photo.slice(0, 5));
    stop();
    for (const n of party) { n.setIdle('Idle'); n.lookAt(cam.x, cam.z); }
    g.player.facing = Math.atan2(fwd.x, fwd.z);
    await d.sayNow(null, DIALOGUE.c4_photo.slice(5));
    await this.groupPhoto('c4', party, cam.clone().add(V(0, -0.3, 0)), mid.clone().add(V(0, 1.25, 0)).addScaledVector(fwd, -1.4), { tamo: false });
    C?.sparkleBurst?.(front.clone().add(V(0, 2.5, 0)));
    const stop2 = this.partyLoop(party);
    await wait(1400);
    // the reward: a long, slow flight over the snowy valley under the aurora, fireworks over the mended viaduct
    d.fx.fireworks(true, V(0, 34, 120));
    await this.flight([
      [cam.clone().add(V(0, 2.5, 0)), front.clone().add(V(0, 1.5, 0))],
      [this.above(122, 44, 42), this.above(50, 108, 0)],
      [this.above(66, 58, 72), this.above(0, 120, 8)],
      [this.above(-6, 66, 92), this.above(-58, 132, 0)],
      [this.above(-60, 74, 86), this.above(-98, 118, 0)],
    ], 26, CAPTIONS.flight4);
    d.fx.fireworks(false);
    stop2();
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
    // queued after this cutscene finishes (awaiting here would deadlock the effect queue): The End
    d.event({ type: 'cutscene', id: 'starfall' });
  }

  /** Tamo offers the treasure hunt: at the start of the epilogue, and again after The End if the answer was no. */
  async huntAsk(when) {
    const d = this.d, st = d.q.state;
    if (st.flags.hunt) return;
    const late = when === 'end' || st.step === 'e.done';
    if (!late && st.flags.huntAsked) return;
    await d.sayNow(late ? 'hunt_offer_end' : 'hunt_offer');
  }

  /** The End: the camera rises from Mika over the starlit valley, then the last page of the book. */
  async theEnd() {
    const g = this.g, d = this.d;
    const p = g.player.pos.clone(), fwd = V(Math.sin(g.follow.yaw), 0, Math.cos(g.follow.yaw));
    d.ui.cinema(true);
    d.audio.setMusic(g.shownSeason || g.time.season, 'finale');
    d.fx.meteorShower(0.9);
    await this.flight([
      [p.clone().addScaledVector(fwd, 4).add(V(0, 1.8, 0)), p.clone().add(V(0, 1.3, 0))],
      [p.clone().addScaledVector(fwd, -10).add(V(0, 12, 0)), p.clone().add(V(0, 5, 0))],
      [V(-30, 80, 170), V(0, 18, 20)],
      [V(40, 118, 210), V(0, 6, -30)],
    ], 22, CAPTIONS.theEnd);
    d.ui.cinema(false);
    await d.ui.theEnd(d.endStats());
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
    await d.say('ferry_ride');
    // the crossing starts once Rin has had her say (timed from here, so a slow reader never sees the boat jump)
    const t0 = performance.now(), dur = 6500;
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
