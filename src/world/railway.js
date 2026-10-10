import * as THREE from 'three';
import { placeholder } from '../engine/assets.js';
import { patchMaterial } from '../engine/effects.js';
import { rail, RAIL_Y, DECK_Y, VIADUCT, VIADUCT_SPANS, RAIL_PORTALS, PLACES } from './layout.js';

const GAUGE = 0.7175; // rail centre offset from the track axis (standard gauge, matches the sleeper tie plates)

/** Station stops along the line (arc length). */
export const STOPS = {
  station: rail.nearest(PLACES.station.x + 6, 119.5).s,
  halt: rail.nearest(PLACES.halt.x, PLACES.halt.z).s,
  westPortal: RAIL_PORTALS.west,
  eastPortal: RAIL_PORTALS.east,
  viaductWest: rail.nearest(VIADUCT.x0, VIADUCT.z).s,
};

function railGeometry(s0, s1) {
  const pos = [], idx = [];
  const prof = [[-0.035, 0], [0.035, 0], [0.035, 0.1], [0.05, 0.1], [0.05, 0.14], [-0.05, 0.14], [-0.05, 0.1], [-0.035, 0.1]];
  let rows = 0;
  for (const side of [-1, 1]) {
    const start = pos.length / 3;
    rows = 0;
    for (let s = s0; s <= s1 + 0.001; s += 1) {
      const p = rail.at(s);
      const nx = -p.tz, nz = p.tx;
      const cx = p.x + nx * GAUGE * side, cz = p.z + nz * GAUGE * side;
      for (const [u, v] of prof) pos.push(cx + nx * u, RAIL_Y - 0.14 + v, cz + nz * u);
      rows++;
    }
    const n = prof.length;
    for (let r = 0; r < rows - 1; r++) for (let k = 0; k < n; k++) {
      const a = start + r * n + k, b = start + r * n + ((k + 1) % n), c = a + n, d = b + n;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function ballastGeometry(s0, s1, skip) {
  const pos = [], idx = [], col = [];
  const across = [-1.9, -1.35, 1.35, 1.9];
  const hts = [-0.62, -0.3, -0.3, -0.62];
  let rows = 0;
  for (let s = s0; s <= s1 + 0.001; s += 1) {
    const p = rail.at(s);
    const nx = -p.tz, nz = p.tx;
    const onDeck = skip(p.x, p.z);
    for (let k = 0; k < 4; k++) {
      pos.push(p.x + nx * across[k], RAIL_Y + hts[k] + (onDeck ? 0.18 : 0), p.z + nz * across[k]);
      const sh = 0.85 + ((Math.sin(s * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1 * 0.2;
      col.push(sh, sh, sh);
    }
    rows++;
  }
  for (let r = 0; r < rows - 1; r++) for (let k = 0; k < 3; k++) {
    const a = r * 4 + k, b = a + 1, c = a + 4, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A car (loco or coach) positioned by arc length along the line. */
class Car {
  constructor(obj, length, kind) {
    this.obj = obj;
    this.length = length;
    this.kind = kind;
    this.wheels = [];
    obj.traverse(o => { if (/^Wheel\d$/.test(o.name)) this.wheels.push(o); });
    this.rod = obj.getObjectByName('Rod');
    this.rodBase = this.rod ? this.rod.position.clone() : null;
    this.smoke = obj.getObjectByName('Smoke');
    this.garland = obj.getObjectByName('Garland');
    this.cab = obj.getObjectByName('Cab');
    this.seats = [1, 2, 3, 4].map(i => obj.getObjectByName(`Seat${i}`)).filter(Boolean);
  }
}

export class Railway {
  constructor(scene, assets, world, colliders, lightPool) {
    this.lightPool = lightPool;
    this.scene = scene;
    this.assets = assets;
    this.world = world;
    this.colliders = colliders;
    this.group = new THREE.Group();
    this.group.name = 'railway';
    scene.add(this.group);
    this.repaired = false;
    const s0 = RAIL_PORTALS.west - 20, s1 = RAIL_PORTALS.east + 20;
    const onViaduct = (x, z) => x > VIADUCT.x0 && x < VIADUCT.x1 && Math.abs(z - VIADUCT.z) < 4;
    const inGap = (x, z) => onViaduct(x, z) && x > VIADUCT.brokenSpan[0] + 0.2 && x < VIADUCT.brokenSpan[1] - 0.2;
    // rails: separate meshes west/east of the broken span so the gap can be bridged later
    const gapS0 = rail.nearest(VIADUCT.brokenSpan[0], VIADUCT.z).s, gapS1 = rail.nearest(VIADUCT.brokenSpan[1], VIADUCT.z).s;
    const railMat = new THREE.MeshStandardMaterial({ color: '#8e8a86', metalness: 0.75, roughness: 0.38 });
    this.rails = [railGeometry(s0, gapS0), railGeometry(gapS1, s1)].map(g => new THREE.Mesh(g, railMat));
    this.gapRails = new THREE.Mesh(railGeometry(gapS0, gapS1), railMat);
    this.gapRails.visible = false;
    for (const m of [...this.rails, this.gapRails]) { m.castShadow = true; m.receiveShadow = true; this.group.add(m); }
    const ballastMat = new THREE.MeshStandardMaterial({ color: '#8d857b', roughness: 0.95, vertexColors: true });
    patchMaterial(ballastMat);
    for (const [a, b] of [[s0, gapS0 - 1], [gapS1 + 1, s1]]) {
      const bm = new THREE.Mesh(ballastGeometry(a, b, onViaduct), ballastMat);
      bm.receiveShadow = true;
      this.group.add(bm);
    }
    this.placeSleepers(s0, s1, inGap);
    this.placeViaduct();
    this.placePortals();
    // dirt verge along the line
    for (let s = s0; s < s1; s += 2) {
      const p = rail.at(s);
      if (!onViaduct(p.x, p.z)) this.world.splat.paintDisc(p.x, p.z, 2.2, 3, 0, 1.5);
    }
    this.cars = [];
    this.train = { s: STOPS.westPortal - 6, v: 0, target: null, dir: 1, visible: true };
    this.buildTrain(2);
  }

  placeSleepers(s0, s1, inGap) {
    const parts = this.assets.parts('sleeper');
    const list = [];
    for (let s = s0; s <= s1; s += 0.62) {
      const p = rail.at(s);
      list.push({ p, gap: inGap(p.x, p.z) });
    }
    const build = (items) => {
      const meshes = (parts.length ? parts : [{ geometry: new THREE.BoxGeometry(2.3, 0.15, 0.24).translate(0, -0.075, 0), material: new THREE.MeshStandardMaterial({ color: '#6b4a33', roughness: 0.9 }), matrix: new THREE.Matrix4() }])
        .map(part => {
          const m = new THREE.InstancedMesh(part.geometry, part.material, items.length);
          const M = new THREE.Matrix4(), q = new THREE.Quaternion();
          items.forEach((it, i) => {
            q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.atan2(it.p.tx, it.p.tz) + Math.PI / 2);
            M.compose(new THREE.Vector3(it.p.x, RAIL_Y - 0.14, it.p.z), q, new THREE.Vector3(1, 1, 1)).multiply(part.matrix);
            m.setMatrixAt(i, M);
          });
          m.receiveShadow = true;
          m.castShadow = false;
          this.group.add(m);
          return m;
        });
      return meshes;
    };
    // one instanced mesh per ~75 m stretch: the whole line as one mesh was drawn in full (90 k triangles) wherever
    // the camera looked, because its bounds span the valley
    const laid = list.filter(i => !i.gap);
    for (let i = 0; i < laid.length; i += 120) for (const m of build(laid.slice(i, i + 120))) m.computeBoundingSphere();
    this.gapSleepers = build(list.filter(i => i.gap));
    this.gapSleepers.forEach(m => { m.visible = false; });
  }

  model(name, size, color) {
    const m = this.assets.clone(name);
    if (m) { m.traverse(o => { if (o.isMesh) patchMaterial(o.material); }); return m; }
    return placeholder(name, size, color);
  }

  placeViaduct() {
    const V = VIADUCT;
    for (const [x, rot] of [[V.x0 + 5, 0], [V.x1 - 5, 180]]) {
      const a = this.model('viaduct-abutment', [10, 5.5, 1], '#a79f94');
      a.position.set(x, DECK_Y, V.z);
      a.rotation.y = rot * Math.PI / 180;
      this.group.add(a);
    }
    for (const cx of VIADUCT_SPANS) {
      const broken = cx === (V.brokenSpan[0] + V.brokenSpan[1]) / 2;
      const s = this.model(broken ? 'viaduct-broken' : 'viaduct-span', [14, 5.5, 1], '#a79f94');
      s.position.set(cx, DECK_Y, V.z);
      this.group.add(s);
      if (broken) {
        this.brokenSpan = s;
        const r = this.model('viaduct-repair', [14, 5.5, 0.6], '#c79a5b');
        r.position.set(cx, DECK_Y, V.z);
        r.visible = false;
        this.group.add(r);
        this.repair = r;
        this.beams = [1, 2, 3].map(i => r.getObjectByName(`Beam${i}`)).filter(Boolean);
        this.scaffold = r.getObjectByName('Scaffold');
      }
      // piers stand in the gorge: solid for the player walking below
      const px = cx + 7;
      if (px < V.x1 - 6) this.colliders.box(px, V.z, 1.3, 2.9, 0, -5, DECK_Y - 1.5);
    }
    // walkable deck (west + east halves), tall invisible parapets, barriers at the gap
    const [g0, g1] = V.brokenSpan;
    this.deckWest = this.colliders.box((V.x0 + g0) / 2, V.z, (g0 - V.x0) / 2, 2.35, 0, DECK_Y - 1.5, DECK_Y, { walkable: true, surface: 'stone' });
    this.deckEast = this.colliders.box((g1 + V.x1) / 2, V.z, (V.x1 - g1) / 2, 2.35, 0, DECK_Y - 1.5, DECK_Y, { walkable: true, surface: 'stone' });
    this.deckGap = this.colliders.box((g0 + g1) / 2, V.z, (g1 - g0) / 2, 2.35, 0, DECK_Y - 1.5, DECK_Y, { walkable: true, surface: 'wood' });
    this.colliders.remove(this.deckGap);
    for (const side of [-1, 1]) this.colliders.box(0, V.z + side * 2.6, (V.x1 - V.x0) / 2, 0.3, 0, DECK_Y - 0.5, DECK_Y + 3, { id: 'parapet' });
    this.gapBarriers = [g0 - 0.3, g1 + 0.3].map(x => this.colliders.box(x, V.z, 0.3, 2.3, 0, DECK_Y - 0.5, DECK_Y + 3, { id: 'gap' }));
  }

  placePortals() {
    for (const [s, into] of [[RAIL_PORTALS.west, -1], [RAIL_PORTALS.east, 1]]) {
      const p = rail.at(s);
      const o = this.model('tunnel-portal', [9, 4, 9], '#8f8b86');
      o.position.set(p.x, RAIL_Y, p.z);
      // model front (+Z) faces out of the tunnel, i.e. against the direction "into" the mountain
      o.rotation.y = Math.atan2(-p.tx * into, -p.tz * into);
      this.group.add(o);
    }
  }

  buildTrain(coaches) {
    for (const c of this.cars) this.group.remove(c.obj);
    for (const col of this.colliderCars || []) this.colliders.remove(col);
    this.cars = [];
    const loco = this.model('kobo', [2.6, 3.6, 7.2], '#d63a2a');
    this.cars.push(new Car(loco, 7.2, 'loco'));
    for (let i = 0; i < coaches; i++) this.cars.push(new Car(this.model('coach', [2.6, 3.4, 9.5], '#1f8f8a'), 9.5, 'coach'));
    for (const c of this.cars) this.group.add(c.obj);
    this.headPos ??= new THREE.Vector3();
    if (!this.headSrc) this.headSrc = this.lightPool?.add({ pos: this.headPos, intensity: () => this.headI || 0, range: 22, color: '#ffe2a8' });
    this.colliderCars = this.cars.map(() => this.colliders.box(0, 0, 1.3, 4.5, 0, RAIL_Y - 1, RAIL_Y + 3.6, { id: 'train' }));
  }

  setFestival(on) {
    for (const c of this.cars) if (c.garland) c.garland.visible = on;
  }

  /** Complete the span: show the trestle, rails and sleepers; open the deck. */
  setRepaired(on, beamsPlaced = 3) {
    this.repaired = on;
    if (this.repair) this.repair.visible = on || beamsPlaced > 0;
    this.beams?.forEach((b, i) => { b.visible = i < beamsPlaced; });
    if (this.scaffold) this.scaffold.visible = !on;
    this.gapRails.visible = on;
    this.gapSleepers.forEach(m => { m.visible = on; });
    if (on) { this.colliders.enable(this.deckGap); this.gapBarriers.forEach(b => this.colliders.remove(b)); }
    else { this.colliders.remove(this.deckGap); this.gapBarriers.forEach(b => this.colliders.enable(b)); }
  }

  /** Drive the train toward arc length `s` (stops there) at cruising speed v. */
  goTo(s, v = 9) { this.train.target = s; this.train.cruise = v; }
  placeAt(s) { this.train.s = s; this.train.v = 0; this.train.target = null; }

  update(dt, night) {
    const T = this.train;
    if (T.target !== null) {
      const dist = T.target - T.s;
      const dir = Math.sign(dist);
      const brake = Math.sqrt(2 * 1.2 * Math.abs(dist));
      const want = dir * Math.min(T.cruise, brake);
      T.v += Math.max(-1.6 * dt * 60 / 60, Math.min(1.6 * dt, want - T.v));
      if (Math.abs(dist) < 0.05 && Math.abs(T.v) < 0.15) { T.s = T.target; T.v = 0; T.target = null; this.onArrive?.(T.s); this.onArriveAny?.(T.s); }
    } else T.v *= Math.exp(-dt * 3);
    // never run onto the broken span
    if (!this.repaired) {
      const limit = STOPS.viaductWest + 38;
      if (T.s > limit) { T.s = limit; T.v = 0; }
    }
    T.s += T.v * dt;
    let s = T.s;
    const dirSign = 1;
    this.cars.forEach((car, i) => {
      const p = rail.at(s - car.length / 2);
      const a = rail.at(s - car.length / 2 - 2), b = rail.at(s - car.length / 2 + 2);
      car.obj.position.set(p.x, RAIL_Y, p.z);
      car.obj.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) * dirSign;
      const inTunnel = s < RAIL_PORTALS.west - 3 || s > RAIL_PORTALS.east + 3 + car.length;
      car.obj.visible = !inTunnel;
      const col = this.colliderCars[i];
      if (inTunnel) this.colliders.remove(col); else this.colliders.move(col, p.x, p.z);
      col.c = Math.cos(car.obj.rotation.y); col.s = Math.sin(car.obj.rotation.y);
      // wheels & rods
      const r = car.kind === 'loco' ? 0.65 : 0.45;
      const ang = T.s / r;
      for (const w of car.wheels) w.rotation.x = ang;
      if (car.rod && car.rodBase) {
        // crank pins hang 0.22 m below the axle at rest; rotate that offset about X with the wheels
        car.rod.position.set(car.rodBase.x, car.rodBase.y + 0.22 - 0.22 * Math.cos(ang), car.rodBase.z - 0.22 * Math.sin(ang));
      }
      s -= car.length + (i === 0 ? 0 : 0.3); // Kobo -> coach centres 8.35 m apart (buffers touching)
    });
    const lc = this.cars[0].obj;
    this.headPos.set(0, 2.0, 7).applyMatrix4(lc.matrixWorld);
    this.headI = lc.visible && night > 0.3 ? 18 * night : 0;
    this.smokeRate = Math.min(1, Math.abs(T.v) / 5) * 0.8 + 0.2;
  }

  /** Smoke emitter world position (for particles). */
  smokePoint(out = new THREE.Vector3()) {
    const c = this.cars[0];
    if (c.smoke) return c.smoke.getWorldPosition(out);
    return out.copy(c.obj.position).add(new THREE.Vector3(0, 3.8, 0));
  }
}
