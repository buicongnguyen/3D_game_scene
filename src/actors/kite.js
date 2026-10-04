import * as THREE from 'three';
import { WORLD, WATER_Y } from '../world/layout.js';
import { Colliders } from '../world/colliders.js';
import { SWIM } from './player.js';
import { makeGlowTexture } from '../engine/textures.js';

/**
 * Flight tuning (metres, seconds). Mika hangs under the kite; `pos` is the handle bar (her palms).
 */
export const KITE = {
  cruise: 9, boost: 20,          // horizontal speeds (m/s)
  climb: 5.5, dive: 7,           // vertical speeds (m/s)
  accel: 1.6, brake: 1.05,       // velocity response (1/s) with / without stick input
  turn: 2.8,                     // heading response (1/s) at cruise
  clearance: 2.5,                // her feet stay this far above ground, water, roofs and treetops
  ceiling: 140,                  // feet never climb above this (the valley floor is y ~ 0)
  maxY: 180,                     // hard cap: interiors live up at y ~ 600
  margin: 14,                    // soft band inside the world bounds
  lift: 3,                       // the grab lifts her this far before she has control
  hang: 1.32,                    // palms above her feet in the Hang pose (art/blender/player_anims.py hang())
  fwd: 0.11,                     // palms in front of her body line in the Hang pose
  feet: 1.5,                     // palms down to the pointed toes (clearance)
  top: 1.35,                     // handle up to the lantern finial
  radius: 0.95,                  // kite half-span for side-on obstacles
};

// canopy height of a tree model at scale 1 (m) and its crown radius as a fraction of that height
const TREE_H = {
  'tree-broadleaf-a': 8, 'tree-broadleaf-b': 8.5, 'tree-cedar': 12, 'tree-pine': 7, 'tree-maple': 5.5,
  'tree-sakura': 6, 'tree-peach': 3.8, 'tree-chestnut': 7,
};
const TREE_CELL = 16;

const V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3(), V4 = new THREE.Vector3();
const M4 = new THREE.Matrix4();
const ease = t => t * t * (3 - 2 * t);
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);

/**
 * Sora's Star Kite: a handmade wind-up flying machine that swoops down, lifts Mika by its handle bar
 * and flies her over the valley.
 *
 *   const kite = new StarKite(game);   // hidden until launched
 *   kite.update(dt)                    // every frame, after railway.update, before player.update
 *   kite.toggle()                      // launch if canLaunch(), else land (resume if already landing)
 *
 * States: idle -> arrive (swoops in) -> lift (grab, rises KITE.lift) -> fly -> land -> leave (flies up
 * and away) -> idle. While carrying, Mika is mounted on `anchor` (the handle, yaw only) and her model
 * is re-pinned each frame so her palms stay on the bar while she swings like a pendulum beneath it.
 */
export class StarKite {
  constructor(game) {
    this.game = game;
    this.state = 'idle';
    this.t = 0;
    this.pos = new THREE.Vector3();        // the handle bar (world)
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.yawRate = 0;
    this.bank = 0;
    this.pitch = 0;
    this.boostK = 0;
    this.thrust = 0;
    this.spin = 0;                         // rotor rate (rad/s)
    this.scale = 0;                        // pop-in / pop-out
    this.acc = new THREE.Vector3();        // smoothed acceleration (for the swing and attitude)
    this.lastVel = new THREE.Vector3();
    this.swing = { p: 0, pv: 0, r: 0, rv: 0 };
    this.camIdle = 0;
    this.noFly = null;                     // optional (x, z) => true where the kite must not go
    this.offset = new THREE.Vector3(0, -KITE.hang, 0);
    this.expect = new THREE.Vector3();
    this.palm = new THREE.Vector3(0, KITE.hang, KITE.fwd);
    this.anchor = new THREE.Object3D();    // what Mika is mounted on: the handle, yaw only
    this.anchor.name = 'kite-anchor';

    // ---- model: a private copy of every material so glow changes never touch another kite (the workbench one)
    this.root = new THREE.Group();
    this.root.name = 'star-kite';
    this.root.rotation.order = 'YXZ';
    this.root.visible = false;
    const model = game.assets?.clone?.('star-kite') || fallbackModel();
    this.model = model;
    this.root.add(model);
    const copies = new Map();
    const own = m => {
      if (!copies.has(m)) copies.set(m, m.clone());
      return copies.get(m);
    };
    model.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material);
    });
    this.glowMats = [...copies.values()].filter(m => m.name === 'Kite glow');
    for (const m of this.glowMats) {
      m.emissive = new THREE.Color('#ffbf45');
      m.emissiveIntensity = 1.2;
    }
    const node = n => model.getObjectByName(n);
    this.rotors = [1, 2, 3, 4].map(i => node(`Rotor_${i}`));
    this.canopy = node('Canopy');
    this.core = node('Core');
    this.keyNode = node('Key');
    this.tails = [1, 2, 3].map(i => node(`Tail_${i}`)).filter(Boolean);
    this.handleNode = node('Handle') || model;

    // rotor blur discs (fade in as the blades get going)
    const discTex = discTexture();
    this.discs = this.rotors.map((r, i) => {
      if (!r) return null;
      const d = new THREE.Mesh(new THREE.CircleGeometry(0.235, 28), new THREE.MeshBasicMaterial({
        map: discTex, color: '#fff2d2', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
      }));
      d.rotation.x = -Math.PI / 2;
      d.position.y = 0.004;
      d.rotation.z = i;
      d.renderOrder = 2;
      r.add(d);
      return d;
    });
    // a soft halo around the star lantern (reads from far away, and at night)
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(64), color: '#ffcf6a', transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    this.halo.scale.setScalar(0.85);
    (this.core || model).add(this.halo);
    game.scene.add(this.root);

    // the lantern lights the valley at night through the shared light pool (constant light count)
    // (the light sits inside the control triangle: it warms Mika, the canopy's underside and the ground,
    // where one right above the paper would blow the canopy out)
    this.corePos = new THREE.Vector3();
    this.lightPos = new THREE.Vector3();
    this.lightI = 0;
    this.light = game.lights?.add({ pos: this.lightPos, intensity: () => this.lightI, range: 11, color: '#ffc45a' });

    // treetops for low flying (the colliders only know trunks)
    this.trees = new Map();
    for (const t of game.placed?.trees || []) {
      const h = (TREE_H[t.model] || 7) * (t.s || 1);
      const k = `${Math.floor(t.x / TREE_CELL)},${Math.floor(t.z / TREE_CELL)}`;
      if (!this.trees.has(k)) this.trees.set(k, []);
      this.trees.get(k).push({ x: t.x, z: t.z, top: t.y + h, r: h * 0.42 });
    }

    // Mika's bones for pinning her palms to the bar
    const pm = game.player?.model;
    const hL = pm?.getObjectByName('hand_L'), hR = pm?.getObjectByName('hand_R'), gR = pm?.getObjectByName('grip_R');
    this.bones = hL && hR && gR ? { hL, hR, gR } : null;
  }

  // ------------------------------------------------------------------ public API
  /** The kite is in use: coming for Mika, carrying her, or setting her down. */
  get active() { return this.state === 'arrive' || this.state === 'lift' || this.state === 'fly' || this.state === 'land'; }
  /** Mika is hanging from the handle. */
  get carrying() { return this.state === 'lift' || this.state === 'fly' || this.state === 'land'; }
  /** Horizontal speed (m/s), e.g. for the camera's FOV. */
  get speed() { return Math.hypot(this.vel.x, this.vel.z); }

  canLaunch() {
    const p = this.game.player;
    if (!p || this.active) return false;
    if (p.mounted || p.locked || p.climb) return false;
    if (!(p.grounded || p.swimming)) return false;
    if (p.anim?.busy && p.anim.oneShotLocks) return false;
    if (p.pos.y > KITE.maxY - 20) return false;                 // inside an interior
    if (this.noFly?.(p.pos.x, p.pos.z)) return false;
    // not under a deck, a porch or a bridge: the kite needs open sky above her
    for (const it of this.game.colliders.near(p.pos.x, p.pos.z)) {
      if (it.enabled && it.y0 > p.pos.y + 1 && it.y0 < p.pos.y + 6 && Colliders.contains(it, p.pos.x, p.pos.z, 0.6)) return false;
    }
    return true;
  }

  /** Whistle for the kite: it swoops in from the sky and grabs Mika. Returns false if it can't come now. */
  launch() {
    if (!this.canLaunch()) return false;
    const g = this.game, p = g.player, yaw = g.follow?.yaw ?? p.facing;
    const fwd = V1.set(Math.sin(yaw), 0, Math.cos(yaw)), right = V2.set(-Math.cos(yaw), 0, Math.sin(yaw));
    // appear up and to the right, ahead of the camera, so the swoop crosses the screen
    this.from = new THREE.Vector3().addScaledVector(fwd, 5).addScaledVector(right, 7).add(V3.set(0, 8, 0));
    if (this.state === 'leave') this.from.copy(this.pos).sub(this.grabPoint(V4));
    else {
      this.scale = 0;
      this.heading = Math.atan2(-this.from.x, -this.from.z);
      g.fx?.burst?.(this.grabPoint(V4).add(this.from), { n: 36, color: [1, 0.86, 0.45], speed: 3, life: 0.9, size: 0.3, gravity: -0.4 });
    }
    this.state = 'arrive';
    this.stateT = 0;
    this.vel.set(0, 0, 0);
    this.root.visible = true;
    return true;
  }

  /** Set Mika down on the ground (or drop her into the river) below; the kite then flies off. */
  land(quick = false) {
    if (!this.carrying) {
      if (this.state === 'arrive') { this.send(); return true; }
      return false;
    }
    if (this.state === 'land') { this.quick = this.quick || quick; return true; }
    this.state = 'land';
    this.stateT = 0;
    this.quick = quick;
    this.spot = this.landingSpot(this.pos.x + this.vel.x * 0.7, this.pos.z + this.vel.z * 0.7);
    return true;
  }

  /** One button: launch if possible, otherwise land (or keep flying if a landing is under way). */
  toggle() {
    if (this.state === 'land' && !this.quick && !this.game.player.locked) { this.state = 'fly'; return true; }
    if (this.active) return this.land();
    return this.launch();
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    if (this.state === 'idle') return;
    const g = this.game, p = g.player;
    this.t += dt;
    this.stateT = (this.stateT || 0) + dt;
    // somebody else moved Mika (a cutscene teleport, the train, the ferry): let go of her where she is
    if (this.carrying) {
      if (p.mounted?.obj !== this.anchor) { this.release(false); }
      else if (p.pos.distanceToSquared(this.expect) > 0.36) { this.release(false, true); }
    }
    if (this.state === 'arrive') this.arrive(dt);
    else if (this.state === 'lift') this.lift(dt);
    else if (this.state === 'fly') this.fly(dt);
    else if (this.state === 'land') this.landing(dt);
    else if (this.state === 'leave') this.leave(dt);
    if (this.state === 'idle') return;
    this.pose(dt);
    if (this.carrying) this.hold(dt);
  }

  // ------------------------------------------------------------------ states
  /** Where the bar goes to be grabbed: just in front of her forehead. */
  grabPoint(out) {
    const p = this.game.player;
    return out.set(p.pos.x + Math.sin(p.facing) * KITE.fwd, p.pos.y + KITE.hang, p.pos.z + Math.cos(p.facing) * KITE.fwd);
  }

  arrive(dt) {
    const g = this.game, p = g.player;
    if (p.mounted || p.locked || p.climb || p.pos.y > KITE.maxY - 20) { this.send(); return; }
    const u = Math.min(1, this.stateT / 1.55);
    const e = 1 - Math.pow(1 - u, 2.2);
    const G = this.grabPoint(V1);
    const S = V2.copy(G).add(this.from);
    const C = V3.copy(G).addScaledVector(this.from, 0.35).setY(G.y + 2.2);
    // quadratic Bezier S -> C -> G, re-aimed every frame so it follows her if she moves
    const prev = V4.copy(this.pos);
    this.pos.set(0, 0, 0).addScaledVector(S, (1 - e) * (1 - e)).addScaledVector(C, 2 * e * (1 - e)).addScaledVector(G, e * e);
    if (this.stateT > dt) this.vel.copy(this.pos).sub(prev).divideScalar(Math.max(dt, 1e-4));
    const hs = Math.hypot(this.vel.x, this.vel.z);
    const target = u > 0.7 || hs < 1 ? p.facing : Math.atan2(this.vel.x, this.vel.z);
    this.turn(target, dt, 5);
    this.scale = Math.min(1, this.scale + dt / 0.28);
    this.thrust = 0.75;
    if (u >= 1) this.grab();
  }

  grab() {
    const g = this.game, p = g.player;
    const wasSwimming = p.swimming;
    this.pos.copy(this.grabPoint(V1));
    this.vel.set(0, 0, 0);
    this.lastVel.set(0, 0, 0);
    this.acc.set(0, 0, 0);
    this.heading = p.facing;
    this.liftFrom = this.pos.y;
    this.saved = {
      pivotY: p.pivot.position.y, model: p.model.position.clone(), lantern: p.lantern ? p.lantern.visible : null,
    };
    this.pinW = 0;
    this.offset.set(0, -KITE.hang, -KITE.fwd);
    this.swing.p = 0; this.swing.pv = 0; this.swing.r = 0; this.swing.rv = 0;
    this.placeAnchor();
    p.mount(this.anchor, this.offset, 0);
    if (p.lantern) p.lantern.visible = false;
    this.holdClip(0.3);
    this.state = 'lift';
    this.stateT = 0;
    g.follow.flying = true;
    g.fx?.burst?.(V1.copy(this.pos).add(V2.set(0, 0.3, 0)), { n: 28, color: [1, 0.84, 0.4], speed: 2.4, life: 0.8, size: 0.24, gravity: -0.6 });
    if (wasSwimming) g.fx?.splash?.(V1.set(p.pos.x, WATER_Y, p.pos.z));
  }

  lift(dt) {
    const u = Math.min(1, this.stateT / 1.3);
    const y = this.liftFrom + KITE.lift * ease(u);
    this.vel.set(0, (y - this.pos.y) / Math.max(dt, 1e-4), 0);
    this.pos.y = y;
    this.thrust = 0.9;
    if (this.game.player.locked) { this.land(true); return; }
    if (u >= 1) { this.state = 'fly'; this.stateT = 0; }
  }

  fly(dt) {
    const g = this.game, inp = g.input, p = g.player;
    if (p.locked) { this.land(true); this.landing(dt); return; }
    const yawC = g.follow.yaw;
    const mx = inp.move.x, my = inp.move.y;
    const mag = Math.min(1, Math.hypot(mx, my));
    let dx = Math.sin(yawC) * my - Math.cos(yawC) * mx, dz = Math.cos(yawC) * my + Math.sin(yawC) * mx;
    const dl = Math.hypot(dx, dz);
    if (dl > 1e-4) { dx /= dl; dz /= dl; }
    const boosting = inp.held('sprint') && mag > 0.2;
    this.boostK += ((boosting ? 1 : 0) - this.boostK) * damp(boosting ? 2.2 : 1.3, dt);
    const top = mag * lerp(KITE.cruise, KITE.boost, this.boostK);
    const k = damp(mag > 0.05 ? KITE.accel * (1 + this.boostK * 0.4) : KITE.brake, dt);
    this.vel.x += (dx * top - this.vel.x) * k;
    this.vel.z += (dz * top - this.vel.z) * k;
    const vy = inp.held('jump') ? KITE.climb : inp.held('dive') ? -KITE.dive : 0;
    this.vel.y += (vy - this.vel.y) * damp(2.6, dt);
    this.move(dt, false);
    const hs = this.speed;
    if (hs > 0.8) this.turn(Math.atan2(this.vel.x, this.vel.z), dt, KITE.turn * (0.45 + 0.55 * Math.min(1, hs / KITE.cruise)));
    else this.turn(this.heading, dt, 1);
    this.thrust = clamp(0.32 + 0.5 * hs / KITE.boost + 0.3 * Math.max(0, this.vel.y) / KITE.climb - 0.12 * Math.max(0, -this.vel.y) / KITE.dive, 0.2, 1);
    this.recentre(dt, hs);
    // a faint trail of sparks from the lantern while boosting
    if (this.boostK > 0.35 && g.fx) {
      this.sparkAcc = (this.sparkAcc || 0) + dt * 60 * this.boostK;
      while (this.sparkAcc > 1) {
        this.sparkAcc--;
        const c = V1.copy(this.corePos).add(V2.set((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.4));
        const v = V3.copy(this.vel).multiplyScalar(-0.12).add(V2.set((Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 0.4, (Math.random() - 0.5) * 0.6));
        if (g.fx.glow?.emit) g.fx.glow.emit(c, v, { life: 0.7 + Math.random() * 0.5, size: 0.16 + Math.random() * 0.14, color: [1, 0.82 + Math.random() * 0.12, 0.42], drag: 1.2, gravity: -0.2 });
        else g.fx.twinkle?.(c);
      }
    }
  }

  landing(dt) {
    const g = this.game, p = g.player, L = this.spot;
    const quick = this.quick || p.locked;
    const dx = L.x - this.pos.x, dz = L.z - this.pos.z, d = Math.hypot(dx, dz);
    const hsT = Math.min(quick ? 9 : 5, d * 1.3);
    const kx = damp(2.4, dt);
    this.vel.x += ((d > 1e-3 ? dx / d : 0) * hsT - this.vel.x) * kx;
    this.vel.z += ((d > 1e-3 ? dz / d : 0) * hsT - this.vel.z) * kx;
    const feet = this.pos.y - KITE.hang;
    const above = feet - L.y;
    const vyT = -clamp(above * (quick ? 1.5 : 0.95), 0.9, quick ? 16 : 7.5);
    this.vel.y += (vyT - this.vel.y) * damp(3.2, dt);
    this.move(dt, true);
    if (this.speed > 0.8) this.turn(Math.atan2(this.vel.x, this.vel.z), dt, 2);
    this.thrust = 0.45;
    const feetNow = this.pos.y - KITE.hang;
    if (L.water && feetNow <= WATER_Y + 0.75 && d < 2.5) { this.release(true); return; }
    if (!L.water && feetNow <= L.y + 0.04 && d < 0.8) this.release(true);
    else if (this.stateT > 25) this.release(true);                       // never hang about forever
  }

  leave(dt) {
    const f = V1.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    this.vel.x += (f.x * 7 - this.vel.x) * damp(1.2, dt);
    this.vel.z += (f.z * 7 - this.vel.z) * damp(1.2, dt);
    this.vel.y += (7.5 - this.vel.y) * damp(1.4, dt);
    this.pos.addScaledVector(this.vel, dt);
    this.pos.y = Math.min(this.pos.y, KITE.maxY);
    this.turn(this.heading + dt * 0.8, dt, 3);
    this.thrust = 1;
    if (this.stateT > 1.6) this.scale = Math.max(0, 1 - (this.stateT - 1.6) / 0.35);
    if (this.stateT > 1.95) {
      this.game.fx?.burst?.(V1.copy(this.pos).add(V2.set(0, 0.9, 0)), { n: 44, color: [1, 0.86, 0.45], speed: 3.2, life: 1.1, size: 0.34, gravity: -0.3 });
      this.hide();
    }
  }

  /** The kite leaves without Mika (called off mid-swoop, or the moment was taken by a cutscene). */
  send() {
    this.state = 'leave';
    this.stateT = 0;
  }

  /** Let go of Mika. landed: she is set down at the kite's position (feet on the spot, or dropped into the river). */
  release(landed, teleported = false) {
    const g = this.game, p = g.player;
    const s = this.saved;
    if (s) {
      p.pivot.position.y = s.pivotY;
      p.model.position.copy(s.model);
      if (p.lantern && s.lantern !== null) p.lantern.visible = !p.swimming; // not the saved value: a kite summoned from the water saved "hidden"
    }
    p.pivot.rotation.set(0, 0, 0);
    this.saved = null;
    if (p.anim?.oneShot?.kite) p.anim.cancelOneShot();
    if (p.mounted?.obj === this.anchor) {
      if (landed) {
        const L = this.spot;
        const x = this.pos.x - Math.sin(this.heading) * KITE.fwd, z = this.pos.z - Math.cos(this.heading) * KITE.fwd;
        const y = L && !L.water ? L.y : this.pos.y - KITE.hang;
        p.dismount(x, z, y, this.heading);
        if (!L?.water) p.anim?.once('Land', { speed: 1.2, then: 'Idle' });
      } else {
        // teleported (cutscene): keep where she was put
        p.dismount(p.pos.x, p.pos.z, teleported ? p.pos.y : undefined, p.facing);
      }
    }
    g.follow.flying = false;
    this.send();
  }

  hide() {
    this.state = 'idle';
    this.root.visible = false;
    this.lightI = 0;
    this.vel.set(0, 0, 0);
    this.game.audio?.kiteHum?.(false, 0);
  }

  // ------------------------------------------------------------------ flight helpers
  turn(target, dt, rate) {
    const step = wrap(target - this.heading) * damp(rate, dt);
    this.heading = wrap(this.heading + step);
    this.yawRate += (step / Math.max(dt, 1e-4) - this.yawRate) * damp(8, dt);
  }

  /** Integrate with the world: soft bounds, side-on obstacles, the floor ahead and the ceiling. */
  move(dt, landing) {
    const g = this.game;
    const W = WORLD, m = KITE.margin;
    const np = V1.copy(this.pos).addScaledVector(this.vel, dt);
    // soft world bounds: a gentle push back inside the band, a hard wall at the edge
    if (np.x < W.minX + m) this.vel.x += (W.minX + m - np.x) * 2 * dt;
    if (np.x > W.maxX - m) this.vel.x -= (np.x - W.maxX + m) * 2 * dt;
    if (np.z < W.minZ + m) this.vel.z += (W.minZ + m - np.z) * 2 * dt;
    if (np.z > W.maxZ - m) this.vel.z -= (np.z - W.maxZ + m) * 2 * dt;
    np.x = clamp(np.x, W.minX, W.maxX);
    np.z = clamp(np.z, W.minZ, W.maxZ);
    // no-fly zones (optional story gates): slide along them
    if (this.noFly && this.noFly(np.x, np.z)) {
      if (!this.noFly(np.x, this.pos.z)) { np.z = this.pos.z; this.vel.z = 0; }
      else if (!this.noFly(this.pos.x, np.z)) { np.x = this.pos.x; this.vel.x = 0; }
      else { np.x = this.pos.x; np.z = this.pos.z; this.vel.x = 0; this.vel.z = 0; }
    }
    // tall things side-on (towers, piers, lamp posts): slide around them
    const feet = np.y - KITE.feet;
    const res = g.colliders.resolve(np.x, np.z, KITE.radius, feet, KITE.feet + KITE.top, 0.05);
    if (res.hit && !res.hit.walkable && res.hit.y1 - res.hit.y0 < 30) {
      const bx = res.x - np.x, bz = res.z - np.z, bl = Math.hypot(bx, bz);
      if (bl > 1e-5) { const into = (this.vel.x * bx + this.vel.z * bz) / bl; if (into < 0) { this.vel.x -= into * bx / bl; this.vel.z -= into * bz / bl; } }
      np.x = res.x; np.z = res.z;
    }
    // ceiling: a deck or roof overhead (flying under the viaduct is fine, through it is not)
    const ceil = this.ceilingAt(np.x, np.z, np.y);
    if (np.y > ceil) { np.y = ceil; this.vel.y = Math.min(this.vel.y, 0); }
    // floor: terrain, water, roofs and treetops, looking ahead so it climbs before it gets there
    if (!landing) {
      const minY = this.floorAhead(np.x, np.z, np.y) + KITE.clearance + KITE.feet;
      if (np.y < minY && minY < ceil) {
        np.y += (minY - np.y) * damp(9, dt);
        np.y = Math.max(np.y, minY - 0.35);
        if (this.vel.y < 0) this.vel.y *= 1 - damp(10, dt);
      }
      const top = Math.min(KITE.ceiling + KITE.feet, KITE.maxY);
      if (np.y > top - 6 && this.vel.y > 0) this.vel.y *= 1 - damp(2.5 * (1 - (top - np.y) / 6), dt);
      if (np.y > top) { np.y = top; this.vel.y = Math.min(this.vel.y, 0); }
    } else {
      // setting down: clear treetops and roofs until close to the spot, then only what she can stand on
      const L = this.spot;
      const far = Math.hypot(L.x - np.x, L.z - np.z) > 2.5;
      const under = far ? this.floorAt(np.x, np.z, np.y) + 0.4 : this.floorAt(np.x, np.z, np.y, true);
      const floor = L.water && !far ? WATER_Y + 0.6 : Math.max(under, L.water ? WATER_Y + 0.6 : L.y);
      np.y = Math.max(np.y, floor + KITE.hang);
    }
    this.pos.copy(np);
  }

  /** Highest thing under (x, z) that the kite must clear, given its altitude y (the handle). */
  floorAt(x, z, y, walkOnly = false) {
    const g = this.game;
    let f = Math.max(g.world.heightAt(x, z), WATER_Y);
    const top = y + KITE.top;
    for (const it of g.colliders.near(x, z)) {
      if (!it.enabled) continue;
      if (it.y1 - it.y0 > 30) continue;                   // invisible story walls reach 40-65 m: not floors
      if (walkOnly && !it.walkable) continue;
      if (it.y0 > top) continue;                          // overhead (a deck we are under)
      if (it.y1 > top + 2.5 && !walkOnly) continue;       // much taller than us: go round, not over
      if (!Colliders.contains(it, x, z, walkOnly ? 0 : KITE.radius)) continue;
      if (it.y1 > f) f = it.y1;
    }
    if (!walkOnly) {
      const i = Math.floor(x / TREE_CELL), j = Math.floor(z / TREE_CELL);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const list = this.trees.get(`${i + a},${j + b}`);
        if (!list) continue;
        for (const t of list) {
          const d = Math.hypot(x - t.x, z - t.z);
          const r = t.r + KITE.radius;
          if (d >= r) continue;
          const h = t.top - t.r * 0.55 * (d / r) * (d / r);
          if (h > f) f = h;
        }
      }
    }
    return f;
  }

  /** Is (x, z) under a tree crown (inflated by pad)? */
  treeAt(x, z, pad = 0) {
    const i = Math.floor(x / TREE_CELL), j = Math.floor(z / TREE_CELL);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      for (const t of this.trees.get(`${i + a},${j + b}`) || []) if (Math.hypot(x - t.x, z - t.z) < t.r + pad) return true;
    }
    return false;
  }

  floorAhead(x, z, y) {
    let f = this.floorAt(x, z, y);
    for (const t of [0.35, 0.8, 1.4]) f = Math.max(f, this.floorAt(x + this.vel.x * t, z + this.vel.z * t, y) - t * 1.2);
    return f;
  }

  /** Lowest overhead solid above the kite (its underside), as a handle height limit. */
  ceilingAt(x, z, y) {
    let c = Infinity;
    const top = this.pos.y + KITE.top;
    for (const it of this.game.colliders.near(x, z)) {
      if (!it.enabled || it.y0 < top - 0.3 || !Colliders.contains(it, x, z, KITE.radius * 0.8)) continue;
      c = Math.min(c, it.y0 - KITE.top - 0.15);
    }
    void y;
    return c;
  }

  /** Nearest open, level spot near (x, z) to set Mika down (or open water to drop her into). */
  landingSpot(x, z) {
    const g = this.game;
    const feet = this.pos.y - KITE.hang;
    const test = (px, pz) => {
      if (px < WORLD.minX + 2 || px > WORLD.maxX - 2 || pz < WORLD.minZ + 2 || pz > WORLD.maxZ - 2) return null;
      if (this.noFly?.(px, pz)) return null;
      const bed = g.world.heightAt(px, pz);
      const walk = g.colliders.groundAt(px, pz, feet, 0);
      if (!walk && WATER_Y - bed > SWIM.enter) return { x: px, z: pz, y: WATER_Y, water: true };
      const y = walk ? walk.y : bed;
      if (!walk && g.world.grid.slopeAt(px, pz) > 36) return null;
      for (const it of g.colliders.near(px, pz)) {
        if (!it.enabled || it.walkable || it.y1 <= y + 0.3 || it.y0 > y + 1.6) continue;
        if (Colliders.contains(it, px, pz, 0.7)) return null;
      }
      if (this.treeAt(px, pz, 1.2)) return null;
      return { x: px, z: pz, y, water: false };
    };
    // first choice: no tree crown between the spot and the follow camera, so she stays in view once down
    const yaw = g.follow?.yaw ?? this.heading;
    const cx = -Math.sin(yaw), cz = -Math.cos(yaw);
    const inView = s => s.water || ![2.5, 5, 7.5].some(d => this.treeAt(s.x + cx * d, s.z + cz * d, 0.3));
    let fallback = null;
    for (const r of [0, 2.5, 5, 8, 12, 17, 24]) {
      const n = r === 0 ? 1 : Math.round(r * 2.2);
      for (let k = 0; k < n; k++) {
        const a = this.heading + (k / n) * Math.PI * 2;
        const s = test(x + Math.sin(a) * r, z + Math.cos(a) * r);
        if (!s) continue;
        if (inView(s)) return s;
        fallback ??= s;
      }
    }
    if (fallback) return fallback;
    return { x, z, y: Math.max(g.world.heightAt(x, z), WATER_Y), water: WATER_Y - g.world.heightAt(x, z) > SWIM.enter };
  }

  /** Swing the follow camera round behind the kite while the player isn't steering it. */
  recentre(dt, hs) {
    const g = this.game, f = g.follow, look = g.input.look;
    if (Math.abs(look.x) + Math.abs(look.y) > 0.5) this.camIdle = 0; else this.camIdle += dt;
    if (hs < 2 || this.camIdle < 1.2) return;
    const w = Math.min(1, (this.camIdle - 1.2) * 0.8) * Math.min(1, hs / KITE.cruise);
    f.yaw += wrap(this.heading - f.yaw) * damp(1.3 * w, dt);
    f.pitch += (0.34 - f.pitch) * damp(0.5 * w, dt);
  }

  // ------------------------------------------------------------------ presentation
  /** Kite attitude, rotors, canopy flutter, tail, lantern glow, anchor and sound. */
  pose(dt) {
    const g = this.game;
    const hs = this.speed;
    const s01 = Math.min(1, hs / KITE.boost);
    // smoothed acceleration in the kite's frame
    const a = V1.copy(this.vel).sub(this.lastVel).divideScalar(Math.max(dt, 1e-4));
    this.lastVel.copy(this.vel);
    this.acc.lerp(a.clampLength(0, 30), damp(6, dt));
    const sh = Math.sin(this.heading), ch = Math.cos(this.heading);
    const vF = this.vel.x * sh + this.vel.z * ch;
    const aF = this.acc.x * sh + this.acc.z * ch;
    const aL = this.acc.x * ch - this.acc.z * sh;            // toward the kite's left (+X)
    // bank into turns, nose down with speed and when speeding up (like a quad), up when climbing
    const bankT = clamp(-this.yawRate * hs * 0.07 - aL * 0.018, -0.46, 0.46);
    const pitchT = clamp(0.013 * vF + 0.028 * aF - 0.025 * this.vel.y, -0.3, 0.42);
    this.bank += (bankT - this.bank) * damp(4, dt);
    this.pitch += (pitchT - this.pitch) * damp(3.5, dt);
    const hover = this.carrying ? 1 - Math.min(1, hs / 3) : 0;
    const bob = Math.sin(this.t * 1.9) * 0.09 * hover;
    const wob = Math.sin(this.t * 1.3) * 0.035 * hover;
    this.root.position.set(this.pos.x, this.pos.y + bob, this.pos.z);
    this.root.rotation.set(this.pitch + Math.sin(this.t * 1.7 + 1) * 0.02 * hover, this.heading, this.bank + wob);
    const sc = this.scale < 1 ? popScale(this.scale) : 1;
    this.root.scale.setScalar(Math.max(0.001, sc));
    this.bob = bob;

    // rotors: spin with thrust (capped per frame so they never strobe backwards), blur discs fade in
    this.spin += (14 + 52 * this.thrust - this.spin) * damp(3, dt);
    const step = Math.min(this.spin * dt, 0.95);
    this.rotors.forEach((r, i) => { if (r) r.rotation.y += (i === 0 || i === 3 ? -1 : 1) * step; });
    const blur = smooth(24, 50, this.spin) * 0.5 * Math.min(1, sc);
    for (const d of this.discs) if (d) { d.material.opacity = blur; d.visible = blur > 0.01; }
    // paper canopy flutter and breathing
    if (this.canopy) {
      const fl = 0.006 + 0.022 * s01;
      this.canopy.rotation.x = fl * (Math.sin(this.t * 13.1) + 0.5 * Math.sin(this.t * 21.7 + 0.4));
      this.canopy.rotation.z = fl * 0.7 * Math.sin(this.t * 11.3 + 1.2);
      this.canopy.scale.y = 1 + (0.02 + 0.04 * s01) * Math.sin(this.t * 9.7);
    }
    // tail: droops when hovering, streams back at speed, snakes side to side, swings out in turns
    const droop = [-0.22, -0.14, -0.1], stream = [0.24, 0.05, 0.02];
    this.tails.forEach((tl, i) => {
      tl.rotation.x = lerp(droop[i], stream[i], s01) + 0.08 * Math.sin(this.t * 3.1 - i * 0.8);
      tl.rotation.y = (0.14 + 0.3 * s01) * Math.sin(this.t * (4.2 + 4 * s01) - i * 1.15) - this.yawRate * 0.15 * (i + 1);
      tl.rotation.z = 0.25 * Math.sin(this.t * 5.3 - i * 0.9);
    });
    if (this.keyNode) this.keyNode.rotation.z -= dt * (1.2 + 3.5 * this.thrust);
    // the star lantern: spinning core, pulsing glow, halo and the pooled light (brighter at night)
    const night = g.night || 0;
    const pulse = 0.88 + 0.12 * Math.sin(this.t * 3.1) + 0.25 * this.boostK;
    if (this.core) {
      this.core.rotation.y += dt * (1.2 + 2 * this.boostK);
      this.core.getWorldPosition(this.corePos);
    } else this.corePos.copy(this.root.position).add(V2.set(0, 1.05, 0));
    for (const m of this.glowMats) m.emissiveIntensity = (1.1 + night * 1.9) * pulse;
    this.halo.material.opacity = (0.22 + night * 0.45) * pulse * Math.min(1, sc);
    this.lightPos.copy(this.root.position).y += 0.5 * sc;
    this.lightI = (0.4 + night * 3.2) * pulse * Math.min(1, sc);
    if (night > 0.3 && Math.random() < dt * 3) g.fx?.twinkle?.(this.corePos);

    // Mika's anchor: the handle, yaw only (she hangs plumb and swings on her own)
    this.placeAnchor();
    // the mounted player reports speed 0, so publish the flight speed for the camera's FOV
    g.follow.flySpeed = this.carrying ? hs : 0;
    g.audio?.kiteHum?.(this.state !== 'leave' || this.stateT < 1.2, this.thrust);
  }

  placeAnchor() {
    this.anchor.position.set(this.pos.x, this.pos.y + (this.bob || 0), this.pos.z);
    this.anchor.rotation.set(0, this.heading, 0);
    this.anchor.updateMatrixWorld(true);
  }

  /** Keep the Hang clip playing (the mount would otherwise play Idle). */
  holdClip(fade = 0.25) {
    const a = this.game.player.anim;
    if (!a) return;
    const name = a.has('Hang') ? 'Hang' : 'Fall';
    if (a.currentName === name && a.oneShot?.kite) return;
    a.cancelOneShot();
    a.play(name, { fade });
    a.oneShot = { action: a.action(name), then: null, onDone: null, kite: true };
  }

  /** Pin Mika's palms to the bar and swing her beneath it like a pendulum. Runs before player.update. */
  hold(dt) {
    const g = this.game, p = g.player;
    this.holdClip();
    this.pinW = Math.min(1, (this.pinW || 0) + dt / 0.45);
    const w = ease(this.pinW);
    const hanging = !!(this.bones && p.anim?.has('Hang'));
    if (hanging) {
      // palm midpoint in the model's own space, from the pose drawn last frame
      const m = p.model;
      m.updateWorldMatrix(true, false);
      M4.copy(m.matrixWorld).invert();
      const a = this.bones.hL.getWorldPosition(V1).applyMatrix4(M4);
      const b = this.bones.hR.getWorldPosition(V2).applyMatrix4(M4);
      const c = this.bones.gR.getWorldPosition(V3).applyMatrix4(M4);
      V4.set((a.x + b.x) / 2, (a.y + b.y) / 2 + (c.y - b.y), (a.z + b.z) / 2 + (c.z - b.z));
      if (Number.isFinite(V4.y) && V4.y > 0.6 && V4.y < 2) this.palm.copy(V4);
    }
    // pendulum: legs trail back with speed and lag behind acceleration; swing out in turns
    const sh = Math.sin(this.heading), ch = Math.cos(this.heading);
    const vF = this.vel.x * sh + this.vel.z * ch;
    const aF = this.acc.x * sh + this.acc.z * ch;
    const aL = this.acc.x * ch - this.acc.z * sh;
    const lat = this.yawRate * this.speed + aL;               // centripetal + sideways push (toward +X)
    const tP = clamp(-0.1 + 0.024 * vF + 0.04 * aF, -0.4, 0.62);
    const tR = clamp(-Math.atan(lat / 9.8) * 0.9, -0.55, 0.55);
    const S = this.swing, om = 3.3, ze = 0.32;
    S.pv += (om * om * (tP - S.p) - 2 * ze * om * S.pv) * dt;
    S.rv += (om * om * (tR - S.r) - 2 * ze * om * S.rv) * dt;
    S.p += S.pv * dt;
    S.r += S.rv * dt;
    const H = KITE.hang;
    p.pivot.position.set(0, H, 0);
    if (hanging) p.model.position.set(-this.palm.x * w, -H + (H - this.palm.y) * w, -this.palm.z * w);
    else p.model.position.set(0, -H - 0.1, 0);
    p.pivot.rotation.set(S.p * w, 0, S.r * w);
    // blend the mount from "standing under the bar" to "hanging from it"
    this.offset.set(0, -H, -KITE.fwd * (1 - w));
    this.expect.set(this.anchor.position.x - sh * KITE.fwd * (1 - w), this.anchor.position.y - H, this.anchor.position.z - ch * KITE.fwd * (1 - w));
  }

  dispose() {
    this.game.lights?.remove?.(this.light);
    this.game.scene.remove(this.root);
  }
}

// a little overshoot when popping in, a quick shrink when leaving
function popScale(s) {
  const t = clamp(s, 0, 1);
  return t < 1 ? t * (1 + 0.35 * Math.sin(Math.PI * t)) : 1;
}

function discTexture() {
  const n = 128;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  const img = g.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = (x + 0.5) / n * 2 - 1, v = (y + 0.5) / n * 2 - 1;
    const r = Math.hypot(u, v), a = Math.atan2(v, u);
    let al = THREE.MathUtils.smoothstep(r, 0.12, 0.3) * (1 - THREE.MathUtils.smoothstep(r, 0.84, 1.0));
    al *= 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.cos(3 * a + r * 2.2), 2.5);   // three swept blade streaks
    const i = (y * n + x) * 4;
    img.data[i] = 255; img.data[i + 1] = 246; img.data[i + 2] = 222; img.data[i + 3] = Math.round(al * 255);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Stand-in if star-kite.glb is missing: a red diamond with four rotors, same node names. */
function fallbackModel() {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: '#e2432f', roughness: 0.7, side: THREE.DoubleSide });
  const brass = new THREE.MeshStandardMaterial({ color: '#dcaa48', roughness: 0.3, metalness: 0.85 });
  const glow = new THREE.MeshStandardMaterial({ color: '#ffd45a', emissive: '#ffb830', emissiveIntensity: 1.5, name: 'Kite glow' });
  glow.name = 'Kite glow';
  const canopy = new THREE.Group(); canopy.name = 'Canopy'; canopy.position.y = 0.9; g.add(canopy);
  const sail = new THREE.Mesh(new THREE.CircleGeometry(0.85, 4), red);
  sail.rotation.x = -Math.PI / 2; canopy.add(sail);
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), glow); core.name = 'Core'; core.position.y = 1.05; g.add(core);
  [[0.64, -0.56], [-0.64, -0.56], [0.64, 0.56], [-0.64, 0.56]].forEach(([x, z], i) => {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.01, 0.05), brass);
    r.name = `Rotor_${i + 1}`; r.position.set(x, 0.72, -z * -1); g.add(r);
  });
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.86, 8), brass);
  bar.rotation.z = Math.PI / 2; g.add(bar);
  const h = new THREE.Object3D(); h.name = 'Handle'; g.add(h);
  return g;
}
