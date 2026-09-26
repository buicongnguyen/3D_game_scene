import * as THREE from 'three';
import { placeholder } from '../engine/assets.js';
import { patchMaterial } from '../engine/effects.js';
import { BUILDINGS, LAMPS, DOCKS, STONES, PLACES, DECK_Y, VIADUCT, SCARECROWS, ORCHARD_FENCE } from './layout.js';

// Wall footprints (w, d, h) from art/CONTRACTS.md; colliders use these, not roof overhangs.
export const FOOTPRINT = {
  'kawabe-house-a': [7, 6, 7.2], 'kawabe-house-b': [9, 7, 6.8], 'kawabe-shop': [6, 6, 5.5], boathouse: [6, 8, 4.5],
  mill: [8, 7, 7.5], 'star-lamp': [2.2, 2.2, 9.5], 'takamori-house-a': [8, 7, 8.5], 'takamori-house-b': [6, 6, 6],
  bakery: [9, 7, 7.5], belltower: [5, 5, 17], station: [14, 6, 6.5], platform: [30, 4.5, 0.95], 'signal-cottage': [7, 6, 6],
  'engine-shed': [10, 18, 7.5], shrine: [6, 7, 6.5], torii: [5, 0.8, 5], 'stone-lantern': [0.9, 0.9, 1.8],
  'lamp-viaduct': [2.2, 2.2, 9], 'tunnel-portal': [9, 4, 9],
};

// Walkable porches / verandas on the front (+Z) side: depth in metres and floor height.
export const PORCH = {
  'signal-cottage': { depth: 2.0, floor: 0.42 }, 'kawabe-house-b': { depth: 1.3, floor: 0.45 }, 'takamori-house-b': { depth: 1.5, floor: 0.4 },
  station: { depth: 2.4, floor: 0.15 }, bakery: { depth: 0.9, floor: 0.2 }, shrine: { depth: 1.2, floor: 0.9 },
};

const toRad = d => d * Math.PI / 180;

/** Places buildings, lamps, docks, stones and set dressing; registers colliders and dynamic nodes. */
export class Structures {
  constructor(scene, assets, world, colliders, lightPool) {
    this.lightPool = lightPool;
    this.cullList = [];
    this.scene = scene;
    this.assets = assets;
    this.world = world;
    this.colliders = colliders;
    this.group = new THREE.Group();
    this.group.name = 'structures';
    scene.add(this.group);
    this.byId = new Map();
    this.nodes = {};          // named dynamic nodes: millWheel, drawbridge, bell, chestLid, ...
    this.lamps = new Map();   // lamp id -> {flame: Vector3, object, materials}
    this.solids = {};         // toggleable colliders: drawbridge, viaductGap, gate, bear ...
    this.worldBuild();
  }

  model(name, fallbackSize, color) {
    const m = this.assets.clone(name);
    if (m) {
      m.traverse(o => { if (o.isMesh) patchMaterial(o.material); });
      return m;
    }
    return placeholder(name, fallbackSize || [2, 2, 2], color);
  }

  groundFor(x, z, w, d, rot) {
    const r = toRad(rot), c = Math.cos(r), s = Math.sin(r);
    let hi = -1e9, lo = 1e9;
    for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [0, 0]]) {
      const h = this.world.heightAt(x + lx * c + lz * s, z - lx * s + lz * c);
      hi = Math.max(hi, h); lo = Math.min(lo, h);
    }
    return hi - lo < 0.9 ? hi - 0.08 : this.world.heightAt(x, z);
  }

  place(id, name, x, z, rot = 0, y, opts = {}) {
    const fp = FOOTPRINT[name] || [2, 2, 2];
    const obj = this.model(name, fp, opts.color);
    const gy = y ?? this.groundFor(x, z, fp[0], fp[1], rot);
    obj.position.set(x, gy, z);
    obj.rotation.y = toRad(rot);
    obj.name = id;
    this.group.add(obj);
    const rec = { id, name, obj, x, z, y: gy, rot, fp };
    this.byId.set(id, rec);
    if (!opts.noCull && name !== 'belltower') this.cullList.push({ obj, x, z, prop: false });
    if (opts.collide !== false) {
      const [w, d, h] = fp;
      const shrink = opts.shrink ?? 0.94;
      const porch = PORCH[name];
      const r = toRad(rot), fx = Math.sin(r), fz = Math.cos(r);
      const back = porch ? porch.depth / 2 : 0;
      rec.solid = this.colliders.box(x - fx * back, z - fz * back, w * shrink / 2, (d * shrink - (porch?.depth || 0)) / 2, rot, gy - 1, gy + h, { blocksView: h > 3, id });
      if (porch) {
        const off = d / 2 - porch.depth / 2;
        rec.porch = this.colliders.box(x + fx * off, z + fz * off, w * 0.46, porch.depth / 2, rot, gy - 1, gy + porch.floor, { walkable: true, surface: 'wood' });
      }
    }
    if (opts.clearGrass !== false) {
      this.world.splat.paintRect(x, z, fp[0] / 2 + 0.6, fp[1] / 2 + 0.6, rot, 3, 0, 1.2);
      // worn ground in front of doors
      const r = toRad(rot);
      this.world.splat.paintDisc(x + Math.sin(r) * (fp[1] / 2 + 1.2), z + Math.cos(r) * (fp[1] / 2 + 1.2), 1.6, 0, 0.8, 1.2);
    }
    return rec;
  }

  worldBuild() {
    for (const b of BUILDINGS) {
      const opts = {};
      if (b.model === 'platform' || b.model === 'belltower') Object.assign(opts, { collide: false });
      this.place(b.id, b.model, b.x, b.z, b.rot, b.y, opts);
      if (b.model === 'belltower') this.towerColliders(this.byId.get(b.id));
      if (b.model === 'platform') {
        const r = this.byId.get(b.id);
        r.solid = this.colliders.box(b.x, b.z, 15, 2.2, b.rot, r.y - 2, r.y + 0.95, { walkable: true, surface: 'stone' });
      }
    }
    this.findNodes();
    this.placeLamps();
    this.placeDocks();
    this.placeStones();
    this.placeDressing();
  }

  /** Bell tower: solid base whose top is the walkable gallery, a central shaft above it, invisible railings. */
  towerColliders(r) {
    const g = r.y + 11;
    this.gallery = { x: r.x, z: r.z, y: g };
    r.solid = this.colliders.box(r.x, r.z, 2.5, 2.5, 0, r.y - 1, g, { walkable: true, surface: 'wood', blocksView: true, id: 'belltower' });
    this.colliders.box(r.x, r.z, 1.35, 1.35, 0, g, r.y + 17, { blocksView: true, id: 'belltowerShaft' });
    for (const [dx, dz, hw, hd] of [[0, -2.55, 2.7, 0.15], [0, 2.55, 2.7, 0.15], [-2.55, 0, 0.15, 2.7], [2.55, 0, 0.15, 2.7]]) {
      this.colliders.box(r.x + dx, r.z + dz, hw, hd, 0, g, g + 2.6, { id: 'railing' });
    }
  }

  findNodes() {
    const mill = this.byId.get('mill')?.obj;
    this.nodes.millWheel = mill?.getObjectByName('Wheel') || null;
    const tower = this.byId.get('belltower')?.obj;
    this.nodes.bell = tower?.getObjectByName('Bell') || null;
    const cottage = this.byId.get('cottage')?.obj;
    this.nodes.chestLid = cottage?.getObjectByName('ChestLid') || null;
    this.nodes.porchFlame = cottage?.getObjectByName('PorchFlame') || null;
    this.nodes.chest = cottage?.getObjectByName('Chest') || null;
    this.nodes.shrineBoard = this.byId.get('shrine')?.obj.getObjectByName('Noticeboard') || null;
    // the mill wheel blocks the race
    if (mill) {
      const r = this.byId.get('mill');
      this.colliders.box(r.x + 5.4, r.z, 0.8, 3.2, 0, r.y - 2, r.y + 5, { id: 'millWheel' });
    }
  }

  placeLamps() {
    for (const L of LAMPS) {
      let obj, rec;
      if (L.building) {
        rec = this.byId.get(L.building);
        obj = rec?.obj;
      } else {
        rec = this.place(`lamp-${L.id}`, L.model, L.x, L.z, L.rot, L.y, { collide: false, clearGrass: L.id !== 'viaduct', noCull: true });
        obj = rec.obj;
        this.colliders.cylinder(L.x, L.z, 1.15, rec.y - 1, rec.y + 9, { blocksView: true, id: `lamp-${L.id}` });
      }
      if (!obj) continue;
      obj.updateMatrixWorld(true);
      const flameNode = obj.getObjectByName('Flame');
      const flame = new THREE.Vector3();
      if (flameNode) flameNode.getWorldPosition(flame);
      else flame.copy(obj.position).add(new THREE.Vector3(0, L.building ? 15.5 : 7.6, 0));
      const mats = new Set();
      obj.traverse(o => {
        if (!o.isMesh) return;
        for (const m of [o.material].flat()) if (m.name === 'Lamp glass' || m.name === 'Lamp star') {
          // each lamp gets its own material copy so lamps light independently
          if (!o.userData.ownMat) { o.material = Array.isArray(o.material) ? o.material.map(x => x.clone()) : o.material.clone(); o.userData.ownMat = true; }
        }
      });
      obj.traverse(o => {
        if (!o.isMesh) return;
        for (const m of [o.material].flat()) if (m.name === 'Lamp glass' || m.name === 'Lamp star') {
          m.emissive = new THREE.Color(m.name === 'Lamp star' ? '#ffd35a' : '#ffb13d');
          m.emissiveIntensity = 0;
          mats.add(m);
        }
      });
      const rec2 = { ...L, flame, obj, mats: [...mats], lit: 0, target: 0, intensity: 0 };
      rec2.light = this.lightPool?.add({ pos: flame, intensity: () => rec2.intensity, range: 34 });
      this.lamps.set(L.id, rec2);
    }
  }

  placeDocks() {
    for (const d of DOCKS) {
      const r = toRad(d.rot), fx = Math.sin(r), fz = Math.cos(r);
      for (let i = 0; i < d.n; i++) {
        const x = d.x + fx * (i * 4 + 2), z = d.z + fz * (i * 4 + 2);
        const obj = this.model('dock', [2.6, 0.2, 4], '#8a6440');
        obj.position.set(x, 0.72, z);
        obj.rotation.y = r;
        this.group.add(obj);
        this.colliders.box(x, z, 1.3, 2.05, d.rot, -3, 0.72, { walkable: true, surface: 'wood' });
      }
    }
  }

  placeStones() {
    STONES.forEach(([x, z], i) => {
      const obj = this.model(i % 2 ? 'stepping-stone-b' : 'stepping-stone', [1.4, 1.4, 1.2], '#8d8a84');
      obj.position.set(x, 0, z);
      obj.rotation.y = i * 1.7;
      this.group.add(obj);
      this.colliders.cylinder(x, z, 0.68, -2, 0.35, { walkable: true, surface: 'stone', id: `stone${i}` });
    });
  }

  placeDressing() {
    const P = PLACES;
    // drawbridge from the mill bank to the island (raised until the wheel turns)
    const hinge = { x: -8.8, z: -45 };
    const db = this.model('drawbridge', [1.8, 0.3, 6], '#8a6440');
    db.position.set(hinge.x, 1.15, hinge.z);
    db.rotation.y = toRad(90);
    this.group.add(db);
    this.nodes.drawbridge = db.getObjectByName('Deck') || db;
    this.solids.drawbridge = this.colliders.box(hinge.x + 3, hinge.z, 3.1, 0.95, 0, -2, 1.2, { walkable: true, surface: 'wood', enabled: true });
    this.colliders.remove(this.solids.drawbridge); // raised at start
    // mill island ground is walkable terrain; the ferry and boats
    const ferry = this.model('ferry', [2.4, 1, 5.2], '#9a6b45');
    ferry.position.set(5.6, 0, 30);
    ferry.rotation.y = toRad(90);
    this.group.add(ferry);
    this.nodes.ferry = ferry;
    const boat = this.model('rowboat', [1.4, 0.6, 3.4], '#b8553a');
    boat.position.set(-6.8, 0.02, -4);
    boat.rotation.y = toRad(20);
    this.group.add(boat);
    this.nodes.rowboat = boat;
    // crate stack by the boathouse (cog 2 sits on top)
    const bh = this.byId.get('boathouse');
    const base = bh ? bh.y : 1.3;
    const stack = [[-17.2, -12.4, 1], [-18.6, -13.6, 2], [-20.2, -14.4, 3]];
    this.crateTop = null;
    for (const [x, z, n] of stack) {
      const gy = this.world.heightAt(x, z);
      for (let k = 0; k < n; k++) {
        const c = this.model('crate', [1, 1, 1], '#a0703f');
        c.position.set(x, gy + k * 1.0, z);
        c.rotation.y = toRad(12 * n + k * 7);
        this.group.add(c);
      }
      this.colliders.box(x, z, 0.52, 0.52, 12 * n, gy - 0.5, gy + n * 1.0, { walkable: true, surface: 'wood' });
      this.crateTop = { x, z, y: gy + n * 1.0 };
    }
    void base;
    // hearths: cottage garden and shrine clearing
    for (const [id, x, z] of [['hearthShrine', P.forestHearth.x, P.forestHearth.z]]) {
      const h = this.model('hearth', [1.4, 1.4, 1.2], '#6d6259');
      h.position.set(x, this.world.heightAt(x, z), z);
      this.group.add(h);
      this.nodes[id] = h;
      this.colliders.cylinder(x, z, 0.8, h.position.y - 1, h.position.y + 0.6, { id });
    }
    // scarecrows in the orchard
    this.nodes.scarecrows = SCARECROWS.map(([x, z], i) => {
      const s = this.model('scarecrow', [0.8, 0.4, 1.9], '#c89b4a');
      s.position.set(x, this.world.heightAt(x, z), z);
      s.rotation.y = i * 1.3;
      this.group.add(s);
      this.colliders.cylinder(x, z, 0.3, s.position.y, s.position.y + 1.9);
      return { obj: s, bell: s.getObjectByName('Bell'), x, z, y: s.position.y };
    });
    // sheep pen
    const pen = this.model('sheep-pen', [10, 10, 1.2], '#9a7a50');
    pen.position.set(P.pen.x, this.world.heightAt(P.pen.x, P.pen.z), P.pen.z);
    this.group.add(pen);
    this.nodes.pen = pen;
    this.nodes.penGate = pen.getObjectByName('Gate');
    // pen fence colliders: ring of posts with the opening on the south (+z) side
    for (let a = 0; a < 20; a++) {
      const ang = (a / 20) * Math.PI * 2;
      const px = P.pen.x + Math.sin(ang) * 5, pz = P.pen.z + Math.cos(ang) * 5;
      if (Math.abs(ang) < 0.35 || Math.abs(ang - Math.PI * 2) < 0.35) continue;
      this.colliders.cylinder(px, pz, 0.55, pen.position.y - 1, pen.position.y + 1.3);
    }
    // orchard fence along the forest edge with the locked gate
    const F = ORCHARD_FENCE;
    for (let x = F.x0; x <= F.x1; x += 2) {
      if (Math.abs(x - F.gateX) < F.gateW / 2) continue;
      const y = this.world.heightAt(x, F.z);
      if (y < 0.5) continue;
      const f = this.model('fence-wood', [2, 0.2, 1.2], '#8f6a42');
      f.position.set(x, y, F.z);
      this.group.add(f);
    }
    // the fence runs out into the river so the shallows cannot be used to slip round it
    const fx0 = F.x0 - 10;
    this.solids.fence = this.colliders.box((fx0 + F.gateX - F.gateW / 2) / 2, F.z, (F.gateX - F.gateW / 2 - fx0) / 2, 0.3, 0, -5, 60);
    this.colliders.box((F.gateX + F.gateW / 2 + F.x1) / 2, F.z, (F.x1 - F.gateX - F.gateW / 2) / 2, 0.3, 0, -5, 60);
    this.solids.orchardGate = this.colliders.box(F.gateX, F.z, F.gateW / 2, 0.35, 0, -5, 60, { id: 'orchardGate' });
    const gate = this.model('fence-wood', [F.gateW, 0.2, 1.4], '#b0463a');
    gate.position.set(F.gateX, this.world.heightAt(F.gateX, F.z), F.z);
    gate.scale.set(F.gateW / 2, 1.2, 1);
    this.group.add(gate);
    this.nodes.orchardGate = gate;
    // four stone flights up the shrine hill (each 4.5 m run, 3 m rise; the terrain ramp matches)
    for (let k = 0; k < 4; k++) {
      const st = this.model('shrine-stairs', [4, 4.5, 3], '#9d968c');
      st.position.set(P.shrineStairsBase.x, 12 + k * 3, -124.25 - k * 4.5);
      this.group.add(st);
    }
    // bear blocks the shrine stairs until chapter 3 (the bear actor is placed by the animals module)
    // Ōkuma blocks the whole stair foot; hedges of bamboo keep the hillside flanks closed
    this.solids.bear = this.colliders.box(P.bearSpot.x, P.bearSpot.z, 6.5, 1.6, 0, 0, 40, { id: 'bear' });
    for (const side of [-1, 1]) {
      this.colliders.box(P.bearSpot.x + side * 6.8, P.bearSpot.z - 12, 0.4, 12, 0, 0, 60, { id: 'shrineHedge' });
      for (let k = 0; k < 12; k++) {
        const x = P.bearSpot.x + side * 6.8, z = P.bearSpot.z - 1 - k * 2;
        const f = this.model('fence-bamboo', [2, 0.2, 1.2], '#8f9a4a');
        f.position.set(x, this.world.heightAt(x, z), z);
        f.rotation.y = Math.PI / 2;
        this.group.add(f);
      }
    }
    // street lamps, benches, flowers, props around the villages
    const dress = [
      ['street-lamp', -47.5, 40, 90], ['street-lamp', -47.5, 5, 90], ['street-lamp', -42.5, -20, -90], ['street-lamp', -84, 94, 40],
      ['bench', -50, 26, 90], ['postbox', -49.5, 24, 90], ['well', -40, 22, 0], ['market-stall', -49, -24, 90], ['market-stall', -41, 40, -90],
      ['barrel', -27, -38, 0], ['barrel', -26, -39.2, 0], ['sacks', -24.5, -38.5, 30], ['cart', -30, -48, 70], ['noren-lantern', -52, 33, 0],
      ['street-lamp', 108, 0, 0], ['street-lamp', 122, 12, 180], ['bench', 112, 12, 180], ['bench', 118, 12, 180], ['flowerpot', 103, 8, 0],
      ['flowerpot', 103, 20, 0], ['festival-stall', 108, 20, 180], ['haybale', 140, -48, 20], ['haybale', 142, -46, 50], ['signpost', 26, 25, 90],
      ['signpost', -44, 64, 0], ['laundry-line', -60, 10, 90], ['bench', -92, 118.5, 0], ['bench', -104, 118.5, 0], ['street-lamp', -110, 118, 0],
      ['street-lamp', 140, 69, 0], ['bench', 144, 70, -120], ['stone-lantern', 58.5, -118, 0], ['stone-lantern', 65.5, -118, 0],
      ['stone-lantern', 58, -150, 0], ['stone-lantern', 66, -150, 0], ['signpost', 84, -76, 0], ['log', -38, -94, 60], ['stump', -52, -70, 0],
      ['fence-bamboo', -64, 132, 0], ['fence-bamboo', -64, 134, 0], ['flowerpot', -55, 137, 0], ['barrel', -155, 96, 0], ['crate', -153, 97, 20],
    ];
    for (const [name, x, z, rot] of dress) {
      const y = this.world.heightAt(x, z);
      const o = this.model(name, [0.8, 0.8, 1.4], '#9a7a50');
      o.position.set(x, y, z);
      o.rotation.y = toRad(rot);
      this.group.add(o);
      this.cullList.push({ obj: o, x, z, prop: true });
      if (!['flowerpot', 'noren-lantern', 'laundry-line'].includes(name)) this.colliders.cylinder(x, z, name === 'well' || name === 'market-stall' || name === 'festival-stall' ? 1.1 : 0.4, y - 0.5, y + 1.6);
      this.world.splat.paintDisc(x, z, 0.8, 3, 0.2, 0.8);
    }
  }

  /** Distance culling (quality-dependent): small props vanish sooner than buildings. */
  cull(camPos, q) {
    const p2 = q.propDist * q.propDist, b2 = q.buildDist * q.buildDist;
    for (const c of this.cullList) {
      const d2 = (c.x - camPos.x) ** 2 + (c.z - camPos.z) ** 2;
      c.obj.visible = d2 < (c.prop ? p2 : b2);
    }
    if (!q.propShadows && !this.propShadowsOff) {
      this.propShadowsOff = true;
      for (const c of this.cullList) if (c.prop) c.obj.traverse(o => { if (o.isMesh) o.castShadow = false; });
    }
  }

  /** Lamp brightness 0..1 per lamp id (animated toward target in update). */
  setLamp(id, on, instant = false) {
    const L = this.lamps.get(id);
    if (!L) return;
    L.target = on ? 1 : 0;
    if (instant) L.lit = L.target;
  }

  update(dt, night) {
    for (const L of this.lamps.values()) {
      L.lit += (L.target - L.lit) * (1 - Math.exp(-dt * 2.2));
      const flicker = 0.92 + 0.08 * Math.sin(performance.now() * 0.011 + L.flame.x);
      const k = L.lit * flicker;
      for (const m of L.mats) m.emissiveIntensity = k * (m.name === 'Lamp star' ? 3.2 : 4.5);
      L.intensity = k * (8 + 55 * night);
    }
  }

  /** Lamp positions for water reflections. */
  lampReflections() {
    return [...this.lamps.values()].filter(l => l.lit > 0.05).map(l => ({ x: l.flame.x, y: l.flame.y, z: l.flame.z, intensity: l.lit }));
  }
}

export { DECK_Y, VIADUCT };
