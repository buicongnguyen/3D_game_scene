import * as THREE from 'three';
import { WORLD } from './layout.js';
import { makeGlowTexture } from '../engine/textures.js';

/*
 * Enterable interiors. Each room is a GLB (art/blender/build_interiors.py) hung high above the valley, where nothing
 * outside can be seen; walking in fades out, hides the outdoor world, teleports Mika to the room's Spawn node and
 * lights the room; walking out reverses it. Collision comes from the rooms' Col_* boxes, so the follow camera's
 * collider ray keeps it inside the walls, and a final clamp guarantees it never leaves the room.
 */

const HIGH = 600;                 // rooms hang this far above the valley (the valley tops out near 60 m)
const V3 = THREE.Vector3;
const toRad = d => d * Math.PI / 180;

/**
 * The rooms: GLB model, building (layout BUILDINGS id), keepsake model and where the room hangs (x, z). `gifts`: the
 * thank-you gifts that fill Sora's cottage, each sitting at the room's `Item_gift_<id>` node (art/blender/build_rewards.py).
 */
export const INTERIORS = [
  {
    id: 'cottage', building: 'cottage', model: 'interior-cottage', keepsake: { id: 'photo', model: 'keepsake-photo' }, kite: { id: 'kite', model: 'star-kite' }, at: [-176, -196],
    gifts: [
      { id: 'rin', model: 'gift-lure' }, { id: 'ota', model: 'gift-radish' }, { id: 'hana', model: 'gift-buns' },
      { id: 'genzo', model: 'gift-cap' }, { id: 'kon', model: 'gift-pinecone' }, { id: 'okuma', model: 'gift-honey' },
    ],
  },
  { id: 'bakery', building: 'bakery', model: 'interior-bakery', keepsake: { id: 'recipe', model: 'keepsake-recipe' }, at: [-176, -150] },
  { id: 'mill', building: 'mill', model: 'interior-mill', keepsake: { id: 'float', model: 'keepsake-float' }, at: [-176, -104] },
  { id: 'station', building: 'station', model: 'interior-station', keepsake: { id: 'ticket', model: 'keepsake-ticket' }, at: [-176, -58] },
];

/**
 * Ordinary homes: every house, shop and workshop can be entered. Buildings of the same kind share one room model
 * (art/blender/interior_<kind>.py) and differ in which decor variant (`Var_1..3` groups in the model) they show, so
 * three neighbours never look alike. The room id is the building id; a resident stands at each `Spot_npc_*` node.
 */
export const HOMES = [
  ['kawabe-a', ['kw1', 'kw3', 'kw5', 'kw7']],
  ['kawabe-b', ['kw4', 'kw6', 'otaHouse']],
  ['kawabe-shop', ['kw2', 'kw8']],
  ['takamori-a', ['tk1', 'tk3', 'tk5']],
  ['takamori-b', ['tk2', 'tk4', 'tk6']],
  ['boathouse', ['boathouse']],
  ['shed', ['engineShed']],
];
// the rooms hang in a grid above the valley, well apart (their lamps only reach ~8 m)
const HOME_SLOTS = [-196, -160, -124].flatMap(z => [-140, -108, -76, -44, -12, 20].map(x => [x, z]));
for (const [kind, buildings] of HOMES) {
  buildings.forEach((building, i) => INTERIORS.push({
    id: building, building, model: `interior-${kind}`, kind, variant: (i % 3) + 1, at: HOME_SLOTS[INTERIORS.length - 4],
  }));
}

/**
 * Front doors in each building model's own space (three.js: +Z is the model's front), read from the Blender
 * generators (build_architecture.py). out: how far in front of the door face the player stands (negative = the
 * door is on the back wall, like the boathouse's land door). A model's own `Door` node wins when it has one.
 */
export const DOOR_SPOTS = {
  'signal-cottage': { x: 0, z: 1.4, out: 1.0 },   // red panel door, standing on the porch
  bakery: { x: 0, z: 2.6, out: 1.1 },             // shop door between the two display windows
  mill: { x: 0, z: 2.8, out: 1.3 },               // double doors under the pent roof
  station: { x: 0, z: 1.3, out: 1.1 },            // waiting-room doors on the platform side
  boathouse: { x: -1.0, z: -3.7, out: -1.2 },     // land door at the back
  'engine-shed': { x: 0, z: 8.9, out: 1.4 },      // the big arched opening on the front wall
  'takamori-house-a': { x: 1.25, z: 2.55, out: 0.8 }, // on the porch deck, door right of centre
  'kawabe-shop': { x: 0, z: 2.0, out: 1.0 },          // under the pent roof, between the hatch window and the front window
  'takamori-house-b': { x: 0, z: 1.55, out: 0.9 },    // on the raised veranda
  'kawabe-house-a': { x: 0, z: 2.45, out: 1.0 },    // lattice door in the front wall, between the lattice windows
  'kawabe-house-b': { x: -0.3, z: 2.35, out: 0.6 },   // glass doors, standing on the veranda
};

const LAMP = { color: '#ffb35a', range: 7.5 };
const FIRE = { color: '#ff8a3a', range: 6.5 };

export class Interiors {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'interiors';
    this.group.visible = false;
    game.scene.add(this.group);
    this.rooms = new Map();
    this.doors = [];
    this.items = [];
    this.active = null;
    this.busy = false;
    this.hidden = [];
    this.t = 0;
    this.viewMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
    this.viewMat.name = 'Window view (unlit)';
    for (const def of INTERIORS) {
      try { this.build(def); } catch (e) { console.warn(`interior ${def.id} skipped`, e); }
    }
    this.patchSky();
    this.patchCamera();
  }

  // ------------------------------------------------------------------ building
  build(def) {
    const g = this.game;
    const model = g.assets.clone(def.model);
    if (!model) { console.warn(`interior model ${def.model} not loaded`); return; }
    const rec = g.structures?.byId.get(def.building);
    const spot = rec ? DOOR_SPOTS[rec.name] : null;
    const back = spot && spot.out < 0;
    // the room keeps its building's orientation, so the sun comes through the same side as outdoors
    const yaw = rec ? toRad(rec.rot) + (back ? Math.PI : 0) : 0;
    const x = THREE.MathUtils.clamp(def.at[0], WORLD.minX + 12, WORLD.maxX - 12);
    const z = THREE.MathUtils.clamp(def.at[1], WORLD.minZ + 12, WORLD.maxZ - 12);
    const root = new THREE.Group();
    root.name = `interior-${def.id}`;
    root.position.set(x, HIGH, z);
    root.rotation.y = yaw;
    root.visible = false;
    root.add(model);
    this.group.add(root);
    root.updateMatrixWorld(true);
    const inv = root.matrixWorld.clone().invert();

    const room = { id: def.id, def, root, model, inv, yaw, lights: [], glow: [], fire: [], nodes: {}, cols: [], motes: null, bounds: new THREE.Box3() };
    const wp = o => o.getWorldPosition(new V3());
    const cols = [], variants = [];
    model.traverse(o => {
      if (o.isMesh && o.name.startsWith('Col_')) { cols.push(o); return; }
      if (o.isMesh) {
        const m = o.material;
        if (m.name === 'Window view') { o.material = this.viewMat; o.castShadow = false; o.receiveShadow = false; }
        else if (m.name === 'Interior glow' || m.name === 'Interior fire') {
          o.castShadow = false;
          m.emissive = new THREE.Color(m.name === 'Interior fire' ? '#ff7a2a' : '#ffb347');
          m.emissiveIntensity = 0;
          (m.name === 'Interior fire' ? room.fire : room.glow).push(m);
        }
      }
      if (/^(Spawn|Exit|Item_|Light_|Gear_|Pendulum|Spot_)/.test(o.name)) room.nodes[o.name] = o;
      if (/^Var_\d+$/.test(o.name)) variants.push(o);
    });
    // a home shows ONE of its decor variants; the others stay hidden
    for (const v of variants) v.visible = v.name === `Var_${def.variant ?? 1}`;

    // collision boxes -> kinematic colliders (hidden meshes)
    const q = new THREE.Quaternion(), e = new THREE.Euler(), s = new V3(), c = new V3(), size = new V3();
    for (const o of cols) {
      o.visible = false;
      o.castShadow = false;
      o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox;
      bb.getCenter(c); bb.getSize(size);
      o.getWorldScale(s);
      const wc = o.localToWorld(c.clone());
      o.getWorldQuaternion(q);
      e.setFromQuaternion(q, 'YXZ');
      const ud = o.userData || {};
      const hw = size.x * s.x / 2, hh = size.y * s.y / 2, hd = size.z * s.z / 2;
      const it = g.colliders.box(wc.x, wc.z, hw, hd, e.y * 180 / Math.PI, wc.y - hh, wc.y + hh, {
        walkable: !!ud.walk, blocksView: !!ud.view, surface: ud.surface || (ud.walk ? 'wood' : undefined), id: `interior-${def.id}`,
      });
      room.cols.push(it);
      // room-space bounds from the floor and the camera ceiling
      const local = bb.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      if (o.name === 'Col_floor') { room.bounds.min.set(local.min.x + 0.2, local.max.y, local.min.z + 0.2); room.bounds.max.set(local.max.x - 0.2, local.max.y + 3, local.max.z - 0.2); }
      if (o.name === 'Col_ceiling') room.camTop = local.min.y;
    }
    if (room.camTop !== undefined) room.bounds.max.y = room.camTop;

    // nodes
    const N = room.nodes;
    room.spawn = N.Spawn ? wp(N.Spawn) : new V3(x, HIGH, z);
    room.exit = N.Exit ? wp(N.Exit) : room.spawn.clone();
    const into = room.spawn.clone().sub(room.exit);
    room.insideFacing = Math.atan2(into.x, into.z);
    room.floorY = room.spawn.y;
    Object.entries(N).filter(([n]) => n.startsWith('Light_')).sort().forEach(([, o]) => {
      const fire = !!o.userData?.fire;
      const L = { pos: wp(o), fire, k: 0, phase: Math.random() * 10 };
      const cfg = fire ? FIRE : LAMP;
      L.src = g.lights?.add({ pos: L.pos, color: cfg.color, range: cfg.range, intensity: () => (this.active === def.id ? L.k : 0) });
      room.lights.push(L);
    });
    // yaw: rotation.y that lines a model up with the room (its +Z toward the room's door)
    if (N.Item_keepsake && def.keepsake) this.items.push({ interior: def.id, id: def.keepsake.id, kind: 'keepsake', model: def.keepsake.model, pos: wp(N.Item_keepsake), yaw });
    if (N.Item_kite && def.kite) this.items.push({ interior: def.id, id: def.kite.id, kind: 'kite', model: def.kite.model, pos: wp(N.Item_kite), yaw });
    // gifts sit on furniture: the node is 8 mm above the surface and its own rotation turns the gift toward the room
    const yawOf = o => { const d = new V3(0, 0, 1).applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion())); return Math.atan2(d.x, d.z); };
    for (const gf of def.gifts ?? []) {
      const o = N[`Item_gift_${gf.id}`];
      if (o) this.items.push({ interior: def.id, id: gf.id, kind: 'gift', model: gf.model, pos: wp(o), yaw: yawOf(o) });
    }
    // where the people who live here stand (+Z of the node is the way they face)
    room.spots = Object.entries(N).filter(([n]) => n.startsWith('Spot_npc_')).sort(([a], [b]) => a.localeCompare(b)).map(([, o]) => ({ pos: wp(o), yaw: yawOf(o) }));
    room.gears = Object.entries(N).filter(([n]) => n.startsWith('Gear_')).map(([n, o]) => ({ o, axis: o.userData?.axis || 'x', ratio: o.userData?.ratio ?? 1, rest: o.rotation.clone() }));
    room.pendulum = N.Pendulum || null;
    room.motes = this.makeMotes(room);
    this.rooms.set(def.id, room);

    // the outside door
    const door = this.outsideDoor(def, rec, spot);
    if (door) this.doors.push({ id: def.id, building: def.building, ...door, inside: room.spawn.clone(), insideFacing: room.insideFacing, exit: room.exit.clone() });
  }

  /** World point in front of a building's door (walkable, clear of its collider) and the facing away from it. */
  outsideDoor(def, rec, spot) {
    if (!rec) return null;
    const g = this.game;
    const obj = rec.obj;
    obj.updateMatrixWorld(true);
    const sign = spot && spot.out < 0 ? -1 : 1;
    const node = obj.getObjectByName('Door');
    const p = node ? node.getWorldPosition(new V3()) : obj.localToWorld(new V3(spot?.x ?? 0, 0, spot ? spot.z + spot.out : (rec.fp?.[1] ?? 6) / 2 + 1));
    const facing = toRad(rec.rot) + (sign < 0 ? Math.PI : 0);
    const dir = new V3(Math.sin(facing), 0, Math.cos(facing));
    const ground = (x, z) => {
      let y = g.world.heightAt(x, z);
      const c = g.colliders.groundAt(x, z, rec.y + 1.4, 1.2);
      if (c && c.y > y) y = c.y;
      return y;
    };
    for (let k = 0; k < 16; k++) {
      const y = ground(p.x, p.z);
      const hit = g.colliders.resolve(p.x, p.z, 0.36, y, 1.45, 0.46).hit;
      if (!hit) { p.y = y; break; }
      p.addScaledVector(dir, 0.25);
      p.y = ground(p.x, p.z);
    }
    return { outside: p, outsideFacing: facing };
  }

  makeMotes(room) {
    const n = 56;
    const b = room.bounds;
    if (b.isEmpty()) return null;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = THREE.MathUtils.lerp(b.min.x, b.max.x, Math.random());
      pos[i * 3 + 1] = b.min.y + 0.4 + Math.random() * 2.2;
      pos[i * 3 + 2] = THREE.MathUtils.lerp(b.min.z, b.max.z, Math.random());
      seed[i] = Math.random() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.PointsMaterial({
      map: (Interiors.glowTex ??= makeGlowTexture(32)), color: room.id === 'mill' || room.id === 'bakery' ? '#fff0d0' : '#ffd79a',
      size: 0.035, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.name = 'motes';
    room.root.add(pts);
    return { pts, pos, seed, n };
  }

  // ------------------------------------------------------------------ lighting and camera hooks
  /** Re-light the scene after the sky sets the outdoor light: sunlight only through windows, warm fill. */
  patchSky() {
    const sky = this.game.world?.sky;
    if (!sky || sky.__interiors) return;
    sky.__interiors = true;
    const orig = sky.update.bind(sky);
    const warm = new THREE.Color('#ffe0b8'), floor = new THREE.Color('#9a6038'), tmp = new THREE.Color();
    sky.update = (...args) => {
      const L = orig(...args);
      if (this.active) {
        const night = L.night || 0;
        // the room shell shadows the sun; what comes through the windows lands as warm patches
        sky.sun.intensity *= 0.9;
        sky.hemi.color.copy(warm).lerp(tmp.setRGB(0.55, 0.62, 0.9), night * 0.5);
        sky.hemi.groundColor.copy(floor);
        sky.hemi.intensity = THREE.MathUtils.lerp(1.05, 0.42, night);
        this.game.scene.environmentIntensity = L.env * 0.4;
        this.game.scene.fog.density = 0;
        this.tintViews(L);
      }
      return L;
    };
  }

  /** Painted window views glow like daylight; at dusk they warm up, at night they go deep blue. */
  tintViews(L) {
    const night = L.night || 0;
    const hz = L.horizon || [1, 1, 1];
    const c = this.viewMat.color;
    const day = new THREE.Color(1.25, 1.22, 1.16);
    const dusk = new THREE.Color().setRGB(hz[0], hz[1], hz[2], THREE.SRGBColorSpace).multiplyScalar(1.1);
    const dark = new THREE.Color(0.1, 0.14, 0.32);
    const warmth = THREE.MathUtils.clamp(1 - Math.abs((L.hour ?? 12) - 18.2) / 1.3, 0, 1) + THREE.MathUtils.clamp(1 - Math.abs((L.hour ?? 12) - 6.2) / 1.0, 0, 1);
    c.copy(day).lerp(dusk, Math.min(1, warmth) * (1 - night)).lerp(dark, night);
  }

  /** Keep the follow camera inside the room (the collider ray does the work; this is the guarantee). */
  patchCamera() {
    const f = this.game.follow;
    if (!f || f.__interiors) return;
    f.__interiors = true;
    const orig = f.update.bind(f);
    f.update = (...args) => {
      orig(...args);
      if (this.active && !f.shot && !f.tracking) this.clampCamera();
    };
  }

  clampCamera() {
    const room = this.rooms.get(this.active);
    const cam = this.game.camera, f = this.game.follow;
    if (!room || room.bounds.isEmpty()) return;
    const m = 0.42;
    const b = room.bounds;
    const lo = new V3(b.min.x + m, b.min.y + 0.3, b.min.z + m), hi = new V3(b.max.x - m, b.max.y - 0.25, b.max.z - m);
    const p = cam.position.clone().applyMatrix4(room.inv);
    if (p.x >= lo.x && p.x <= hi.x && p.y >= lo.y && p.y <= hi.y && p.z >= lo.z && p.z <= hi.z) return;
    const pivot = this.game.player.pos.clone().add(new V3(0, 1.45, 0)).applyMatrix4(room.inv);
    pivot.clamp(lo, hi);
    const d = p.clone().sub(pivot);
    let t = 1;
    for (const k of ['x', 'y', 'z']) {
      if (d[k] > 1e-6 && pivot[k] + d[k] > hi[k]) t = Math.min(t, (hi[k] - pivot[k]) / d[k]);
      if (d[k] < -1e-6 && pivot[k] + d[k] < lo[k]) t = Math.min(t, (lo[k] - pivot[k]) / d[k]);
    }
    p.copy(pivot).addScaledVector(d, Math.max(0, t)).applyMatrix4(room.root.matrixWorld);
    cam.position.copy(p);
    cam.lookAt(f.look);
    f.pos.copy(p);
  }

  // ------------------------------------------------------------------ enter / exit
  /** Walk into room `id`. fade(on) => Promise fades the screen (optional). Resolves true once inside. */
  async enter(id, fade) {
    const room = this.rooms.get(id);
    if (!room || this.busy || this.active === id) return false;
    this.busy = true;
    try {
      await fade?.(true);
      if (this.active) this.leaveRoom();
      const g = this.game;
      this.active = id;
      this.group.visible = true;
      for (const r of this.rooms.values()) r.root.visible = r === room;
      this.hideOutdoors();
      g.player.teleport(room.spawn.x, room.spawn.z, room.spawn.y, room.insideFacing);
      this.snapCamera(room.insideFacing, true);
      this.snapTamo();
      this.update(0);
      await fade?.(false);
      return true;
    } finally { this.busy = false; }
  }

  /** Walk back out through the door of the current room. */
  async exit(fade) {
    if (!this.active || this.busy) return false;
    const door = this.doors.find(d => d.id === this.active);
    this.busy = true;
    try {
      await fade?.(true);
      this.leaveRoom();
      const g = this.game;
      if (door) g.player.teleport(door.outside.x, door.outside.z, door.outside.y, door.outsideFacing);
      else g.player.teleport(g.player.lastSafe.x, g.player.lastSafe.z, g.player.lastSafe.y); // a room without a door record must not strand her up in the sky
      this.snapCamera(door ? door.outsideFacing : g.player.facing, false);
      this.snapTamo();
      g.world.focus?.copy(g.player.pos);
      try { g.structures?.cull(g.player.pos, g.renderer.q); } catch { /* optional */ }
      await fade?.(false);
      return true;
    } finally { this.busy = false; }
  }

  leaveRoom() {
    this.active = null;
    this.group.visible = false;
    for (const r of this.rooms.values()) r.root.visible = false;
    this.restoreOutdoors();
  }

  snapCamera(yaw, inside) {
    const f = this.game.follow;
    if (!f) return;
    if (inside) { this.savedZoom ??= f.zoomTarget; f.zoomTarget = Math.min(f.zoomTarget, 4.6); f.pitch = 0.34; }
    else if (this.savedZoom !== undefined) { f.zoomTarget = this.savedZoom; this.savedZoom = undefined; f.pitch = 0.32; }
    f.yaw = yaw;
    f.idle = 0;
    f.first = true;
  }

  snapTamo() {
    const t = this.game.director?.tamo;
    if (!t || t.hidden) return;
    const p = this.game.player;
    t.pos.set(p.pos.x - Math.sin(p.facing) * 0.4 + Math.cos(p.facing) * 0.6, p.pos.y + 1.7, p.pos.z - Math.cos(p.facing) * 0.4 - Math.sin(p.facing) * 0.6);
    t.vel?.set(0, 0, 0);
    t.root?.position.copy(t.pos);
  }

  /**
   * Hide every top-level outdoor object (terrain, water, foliage, grass, structures, railway, particles, NPCs ...).
   * Kept: lights (the light count must never change), the player, Tamo, the rooms, and anything hung up here with
   * them (pickups placed at the rooms' item nodes). Their `visible` is intercepted while inside, so systems that set
   * it every frame cannot bring the valley back; the last value they set is restored on the way out.
   */
  hideOutdoors() {
    const g = this.game;
    const keep = new Set([this.group, g.player.root, g.director?.tamo?.root, g.camera].filter(Boolean));
    for (const o of g.scene.children) {
      if (keep.has(o) || o.isLight || o.position.y > HIGH / 2 || Object.getOwnPropertyDescriptor(o, 'visible')?.get) continue;
      const rec = { o, want: o.visible };
      Object.defineProperty(o, 'visible', { configurable: true, enumerable: true, get: () => false, set: v => { rec.want = v; } });
      this.hidden.push(rec);
    }
  }

  restoreOutdoors() {
    for (const r of this.hidden) {
      delete r.o.visible;
      r.o.visible = r.want;
    }
    this.hidden.length = 0;
  }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    this.t += dt;
    const room = this.active && this.rooms.get(this.active);
    if (!room) return;
    const night = this.game.night || 0;
    const t = this.t;
    // lamps: steady warm light, brighter at night; fires flicker
    for (const L of room.lights) {
      const base = L.fire ? 2.6 + 1.6 * night : 4.2 + 3.2 * night;
      const fl = L.fire ? 0.82 + 0.12 * Math.sin(t * 11 + L.phase) + 0.06 * Math.sin(t * 23.7 + L.phase * 2) : 0.985 + 0.015 * Math.sin(t * 3 + L.phase);
      L.k = base * fl;
    }
    for (const m of room.glow) m.emissiveIntensity = 0.45 + 1.2 * night;
    for (const m of room.fire) m.emissiveIntensity = (0.8 + 0.3 * night) * (0.85 + 0.1 * Math.sin(t * 13) + 0.05 * Math.sin(t * 29));
    // mill gears follow the water wheel outside
    const wheel = this.game.structures?.nodes?.millWheel;
    if (room.gears.length && wheel) {
      const a = wheel.rotation.x;
      for (const gr of room.gears) gr.o.rotation[gr.axis] = gr.rest[gr.axis] + a * gr.ratio;
    }
    if (room.pendulum) room.pendulum.rotation.x = Math.sin(t * Math.PI) * 0.16;
    // dust motes drifting in the light
    const M = room.motes;
    if (M) {
      const b = room.bounds;
      for (let i = 0; i < M.n; i++) {
        const s = M.seed[i];
        M.pos[i * 3] += Math.sin(t * 0.21 + s) * 0.03 * dt;
        M.pos[i * 3 + 1] += (0.02 + Math.sin(t * 0.33 + s * 2) * 0.03) * dt;
        M.pos[i * 3 + 2] += Math.cos(t * 0.17 + s) * 0.03 * dt;
        if (M.pos[i * 3 + 1] > b.min.y + 2.8) M.pos[i * 3 + 1] = b.min.y + 0.3;
      }
      M.pts.geometry.attributes.position.needsUpdate = true;
      M.pts.material.opacity = 0.35 + 0.3 * (1 - night);
    }
  }

  /** Door the player is standing at: {door, side: 'outside'|'inside'} within `r` metres, or null. */
  nearDoor(pos, r = 1.8) {
    for (const d of this.doors) {
      if (!this.active && d.outside.distanceTo(pos) < r) return { door: d, side: 'outside' };
      if (this.active === d.id && d.exit.distanceTo(pos) < r) return { door: d, side: 'inside' };
    }
    return null;
  }
}
