import * as THREE from 'three';
import { N_ } from '../i18n/i18n.js';
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
      if (!['starTrain'].includes(name)) this.g.follow.clearCutscene();
    }
  }

  update(dt) {
    // drifting lantern boats
    for (const b of this.boats) {
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
    r.placeAt(STOPS.station - 70);
    r.goTo(STOPS.station, 8.5);
    g.player.root.visible = false;
    this.d.npcs.genzo.setVisible(false);
    g.follow.cutscene({ pos: V(-30, 44, 168), look: V(-60, 16, 110) }, 0.01);
    await wait(100);
    await ui.fade(false, 1600);
    this.d.audio.whistle();
    await this.shot(V(-54, 30, 150), V(-120, 18, 108), 3.2);
    // follow the train in: one continuous, damped tracking shot
    const loco = r.cars[0].obj.position;
    g.follow.track(() => loco.clone().add(V(-2, 5.5, 16)), () => loco.clone().add(V(-6, 1.6, 0)), 3);
    const t0 = performance.now();
    while (r.train.target !== null && performance.now() - t0 < 22000) await wait(100);
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
    while (!this.rideDone) {
      d.ui.ride(true, d.q.count('lanterns'), this.lanterns.length);
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

  async finale() {
    const g = this.g, d = this.d;
    d.fx.fireworks(true, V(90, 20, 60));
    d.fx.meteorShower(1.4);
    // lantern boats drift down from the ferry landing
    for (let i = 0; i < 26; i++) {
      const obj = g.assets.clone('lantern-boat') || new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshStandardMaterial({ color: '#ffb13d', emissive: '#ff9a2a', emissiveIntensity: 3 }));
      obj.traverse(o => { if (o.isMesh) for (const m of [o.material].flat()) if (m.name === 'Lantern glow') { m.emissive = new THREE.Color('#ffb13d'); m.emissiveIntensity = 3.5; } });
      g.scene.add(obj);
      this.boats.push({ obj, s: river.nearest(12, 25).s + i * 2.2, off: ((i * 7) % 11 - 5) * 0.9 });
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
    // credits over the fireworks
    d.ui.open('credits');
    await wait(7500);
    d.ui.closeAll();
    g.paused = false;
    await d.ui.fade(true, 1200);
    d.fx.fireworks(false);
    d.fx.meteorShower(0);
    for (const b of this.boats) g.scene.remove(b.obj);
    this.boats = [];
    for (const L of this.lanterns) { g.scene.remove(L.obj); g.lights.remove(L.light); }
    // riders step off
    for (const n of Object.values(d.npcs)) if (n.riding) { n.root.removeFromParent(); g.scene.add(n.root); n.riding = false; }
    g.player.dismount(PLACES.halt.x - 4, PLACES.halt.z + 2, undefined, 0);
    g.railway.setFestival(false);
    g.railway.buildTrain(2);
    g.railway.placeAt(STOPS.station + 8);
    d.audio.setMusic('spring', 'calm');
    await d.ui.fade(false, 1200);
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
