import * as THREE from 'three';
import { Animator } from './animator.js';
import { WORLD, WATER_Y } from '../world/layout.js';
import { riverFlow } from '../world/heightfield.js';

export const MOVE = {
  radius: 0.32, height: 1.45, step: 0.46, gravity: 26, jumpV: 8.4,
  walk: 1.6, run: 4.4, sprint: 6.8, accel: 16, airAccel: 5, turn: 11, maxSlope: 47,
};

/** The speed leap, a little hack: tap jump quickly while running forward. 2 taps x4, 3 taps x8, 4 taps x16. */
export const LEAP = { window: 0.42, hold: 1.4, max: 4 };
/** Winter ice sits a hair above the summer water line. */
export const ICE_LIFT = 0.06;
export function leapMultiplier(taps) { return taps >= 2 ? 2 ** Math.min(taps, LEAP.max) : 1; }

/** Swimming: Mika floats with her head above the surface, strokes along, dives and climbs out. */
export const SWIM = {
  float: 1.02,     // feet below the surface while floating (head and shoulders out)
  enter: 1.15,     // water deeper than this and she swims
  speed: 2.3, fast: 3.4, accel: 3.4, turn: 6,
  dive: 2.4, rise: 2.8, buoy: 2.4,
  pivot: 0.95,     // body pitches about the hips
  drift: 0.35,     // the current's pull mid-channel (m/s)
};

/** Mika: third-person character controller, animation state and held props. */
export class Player {
  constructor(scene, assets, world, colliders) {
    this.world = world;
    this.colliders = colliders;
    this.pos = new THREE.Vector3(-95, 17, 116);
    this.vel = new THREE.Vector3();
    this.facing = Math.PI; // radians; model +Z faces (sin, cos)
    this.grounded = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.airTime = 0;
    this.lastSafe = this.pos.clone();
    this.safeTimer = 0;
    this.speed = 0;
    this.locked = false;       // cutscenes / dialogue
    this.aiming = false;
    this.surface = 'grass';
    this.events = [];
    this.swimming = false;
    this.swimCooldown = 0;
    this.pitch = 0;
    this.leapMul = 1;
    this.leapT = 0;
    this.taps = 0;

    this.root = new THREE.Group();
    this.root.name = 'player';
    const model = assets.clone('mika');
    if (model) {
      this.model = model;
      this.anim = new Animator(model);
    } else {
      this.model = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.8, 6, 12), new THREE.MeshStandardMaterial({ color: '#f2b53a', roughness: 0.5 }));
      body.position.y = 0.72;
      body.castShadow = true;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 14), new THREE.MeshStandardMaterial({ color: '#f1c7a1', roughness: 0.6 }));
      head.position.y = 1.28;
      head.castShadow = true;
      this.model.add(body, head);
      this.anim = null;
    }
    this.model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    // swimming tips the body forward about the hips, not the feet
    this.pivot = new THREE.Group();
    this.pivot.position.y = SWIM.pivot;
    this.model.position.y = -SWIM.pivot;
    this.pivot.add(this.model);
    this.root.add(this.pivot);
    scene.add(this.root);
    // Sora's lantern in the right hand
    this.grip = this.model.getObjectByName('grip_R') || this.model;
    const lantern = assets.clone('hand-lantern');
    if (lantern) {
      this.lantern = lantern;
      this.grip.add(lantern);
      // grip_R's +Y runs elbow -> hand; the lantern is authored upright, so flip it to hang from the hand
      if (this.grip !== this.model) lantern.rotation.x = Math.PI;
      else lantern.position.set(-0.28, 0.75, 0.1);
    }
  }

  teleport(x, z, y, facing) {
    this.climb = null; // a climb-out still in progress would pull her back to the old shore
    const g = this.groundHeight(x, z, 999);
    this.pos.set(x, y ?? g, z);
    this.vel.set(0, 0, 0);
    if (facing !== undefined) this.facing = facing;
    this.lastSafe.copy(this.pos);
    this.grounded = true;
    this.setSwimming(false);
    this.leapMul = 1;
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.facing;
  }

  /** Head below the surface (diving): the camera and effects follow her under. */
  get submerged() { return this.swimming && this.pos.y + 1.35 < WATER_Y - 0.05; }

  setSwimming(on) {
    if (this.swimming === on) return;
    this.swimming = on;
    if (on) this.leapMul = 1;
    if (this.lantern) this.lantern.visible = !on;
    if (!on) { this.pitch = 0; this.pivot.rotation.x = 0; }
  }

  groundHeight(x, z, footY) {
    let g = this.world.heightAt(x, z);
    // a frozen river is a floor
    if (this.world.frozen && g < WATER_Y + ICE_LIFT) g = WATER_Y + ICE_LIFT;
    const c = this.colliders.groundAt(x, z, footY, MOVE.step);
    if (c && c.y > g) { g = c.y; this.onItem = c.item; } else this.onItem = null;
    return g;
  }

  /** Ride along with a moving object (ferry deck, train cab). offset is in the object's local space. */
  mount(obj, offset = new THREE.Vector3(), facingOffset = 0) { this.climb = null; this.mounted = { obj, offset, facingOffset }; this.vel.set(0, 0, 0); this.setSwimming(false); }
  dismount(x, z, y, facing) { this.mounted = null; this.teleport(x, z, y, facing); }

  /** input: Input, camYaw: radians (camera look heading). */
  update(dt, input, camYaw) {
    const M = MOVE;
    if (this.mounted) {
      const { obj, offset, facingOffset } = this.mounted;
      obj.updateMatrixWorld(true);
      this.pos.copy(offset).applyMatrix4(obj.matrixWorld);
      const q = new THREE.Quaternion();
      obj.getWorldQuaternion(q);
      const f = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      if (this.aiming) this.turnTo(camYaw, dt, 16); else this.facing = Math.atan2(f.x, f.z) + facingOffset;
      this.grounded = true;
      this.speed = 0;
      this.root.position.copy(this.pos);
      this.root.rotation.y = this.facing;
      this.animate(dt, 0);
      return;
    }
    this.swimCooldown = Math.max(0, this.swimCooldown - dt);
    if (this.climb) { this.updateClimb(dt); return; }
    if (this.swimming) { this.swim(dt, input, camYaw); return; }
    const canMove = !this.locked && !this.aiming && !(this.anim?.busy && this.anim.oneShotLocks);
    let mx = canMove ? input.move.x : 0, my = canMove ? input.move.y : 0;
    const mag = Math.min(1, Math.hypot(mx, my));
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const rx = -Math.cos(camYaw), rz = Math.sin(camYaw);
    let dx = fx * my + rx * mx, dz = fz * my + rz * mx;
    const dl = Math.hypot(dx, dz);
    if (dl > 1e-4) { dx /= dl; dz /= dl; }
    // the speed leap: quick jump taps while running forward multiply the pace (x4, x8, x16)
    this.clockT = (this.clockT || 0) + dt;
    const forward = my > 0.5;
    if (canMove && input.pressed('jump')) {
      this.taps = forward && this.clockT - (this.lastTap ?? -9) < LEAP.window ? Math.min(LEAP.max, this.taps + 1) : 1;
      this.lastTap = this.clockT;
      if (this.taps >= 2) {
        const mul = leapMultiplier(this.taps);
        if (mul > this.leapMul) this.events.push({ type: 'leap', mul });
        this.leapMul = Math.max(this.leapMul, mul);
        this.leapT = LEAP.hold;
        if (!this.grounded) this.vel.y = Math.max(this.vel.y, M.jumpV * 0.75); // a hop in mid-air keeps the leap going
      }
    }
    this.leapT = Math.max(0, this.leapT - dt);
    if (this.leapMul > 1 && (!forward || !canMove || (this.leapT <= 0 && this.grounded))) this.leapMul = 1;

    let target = 0;
    if (mag > 0.05) {
      target = mag < 0.6 ? M.walk * (mag / 0.6) * 1.2 : M.run;
      if (input.held('sprint') && mag >= 0.6) target = M.sprint;
      if (this.leapMul > 1) target = M.run * this.leapMul;
    }
    // ice is slippery: she builds speed slowly and slides a little when she stops or turns
    this.onIce = !!this.world.frozen && !this.onItem && this.world.heightAt(this.pos.x, this.pos.z) < WATER_Y + ICE_LIFT; // docks and decks are not ice
    const accel = this.leapMul > 1 ? 9 : this.grounded ? (this.onIce ? 2.6 : M.accel) : M.airAccel;
    const k = 1 - Math.exp(-accel * dt);
    this.vel.x += (dx * target - this.vel.x) * k;
    this.vel.z += (dz * target - this.vel.z) * k;

    // horizontal move with steep-slope blocking, in short steps so a fast leap never tunnels through a wall
    const sub = Math.max(1, Math.ceil(Math.hypot(this.vel.x, this.vel.z) * dt / 0.35));
    for (let i = 0; i < sub; i++) {
      const sdt = dt / sub;
      let nx = this.pos.x + this.vel.x * sdt, nz = this.pos.z + this.vel.z * sdt;
      const hNow = this.world.heightAt(this.pos.x, this.pos.z);
      const hNext = this.world.heightAt(nx, nz);
      if (hNext > hNow + 0.05 && this.world.grid.slopeAt(nx, nz) > M.maxSlope && hNext > this.pos.y - 0.2) {
        // slide along the contour instead of climbing
        const n = this.world.grid.normalAt(nx, nz);
        const nl = Math.hypot(n.nx, n.nz) || 1;
        const ux = n.nx / nl, uz = n.nz / nl;
        const into = this.vel.x * ux + this.vel.z * uz;
        if (into < 0) { this.vel.x -= into * ux; this.vel.z -= into * uz; }
        nx = this.pos.x + this.vel.x * sdt; nz = this.pos.z + this.vel.z * sdt;
      }
      // soft world bounds
      nx = Math.min(WORLD.maxX, Math.max(WORLD.minX, nx));
      nz = Math.min(WORLD.maxZ, Math.max(WORLD.minZ, nz));
      const res = this.colliders.resolve(nx, nz, M.radius, this.pos.y, M.height, M.step);
      this.pos.x = res.x; this.pos.z = res.z;
      // keep her on the ground over bumps while racing along
      if (this.grounded && this.vel.y <= 0) { const gh = this.groundHeight(this.pos.x, this.pos.z, this.pos.y); if (gh > this.pos.y && gh - this.pos.y < M.step) this.pos.y = gh; }
    }

    // vertical
    this.jumpBuffer = input.pressed('jump') && !this.locked ? 0.14 : Math.max(0, this.jumpBuffer - dt);
    this.coyote = this.grounded ? 0.12 : Math.max(0, this.coyote - dt);
    if (this.jumpBuffer > 0 && this.coyote > 0 && canMove) {
      this.vel.y = M.jumpV;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.anim?.once('Jump', { hold: true, fade: 0.08 });
      this.events.push({ type: 'jump' });
    }
    this.vel.y -= M.gravity * dt;
    this.pos.y += this.vel.y * dt;
    const ground = this.groundHeight(this.pos.x, this.pos.z, this.pos.y);
    const wasGrounded = this.grounded;
    if (this.pos.y <= ground + 0.001 || (wasGrounded && this.vel.y <= 0 && this.pos.y - ground < 0.42)) {
      if (!wasGrounded && this.airTime > 0.1) {
        this.events.push({ type: 'land', strength: Math.min(1, this.airTime) });
        if (this.anim?.currentName === 'Jump' || this.anim?.currentName === 'Fall') {
          this.anim.cancelOneShot();
          if (this.airTime > 0.5) this.anim.once('Land', { speed: 1.4, then: 'Idle' });
        }
      }
      this.pos.y = ground;
      this.vel.y = 0;
      this.grounded = true;
      this.airTime = 0;
    } else {
      this.grounded = false;
      this.airTime += dt;
    }

    // deep water: Mika swims
    const terrain = this.world.heightAt(this.pos.x, this.pos.z);
    if (!this.world.frozen && !this.onItem && WATER_Y - terrain > SWIM.enter && this.pos.y < WATER_Y - SWIM.float + 0.12 && this.swimCooldown <= 0) {
      this.events.push({ type: 'splash', x: this.pos.x, z: this.pos.z, strength: Math.min(1, Math.abs(this.vel.y) / 8 + 0.25) });
      this.vel.y *= 0.3;
      this.setSwimming(true);
      this.anim?.cancelOneShot();
      this.root.position.copy(this.pos);
      return;
    }
    this.safeTimer -= dt;
    if (this.grounded && this.safeTimer <= 0 && (terrain > 0.15 || this.onItem) && this.world.grid.slopeAt(this.pos.x, this.pos.z) < 35) {
      this.lastSafe.copy(this.pos);
      this.safeTimer = 0.5;
    }
    this.surface = this.onItem ? (this.onItem.surface || 'wood') : this.onIce ? 'ice' : terrain < 0.3 ? 'sand' : 'grass';

    // facing
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.speed = hs;
    if (this.aiming) {
      this.turnTo(camYaw, dt, 16);
    } else if (hs > 0.3 && target > 0) {
      this.turnTo(Math.atan2(this.vel.x, this.vel.z), dt, M.turn);
    }

    this.root.position.copy(this.pos);
    this.root.rotation.y = this.facing;
    this.animate(dt, hs);
  }

  // ------------------------------------------------------------------ water
  swim(dt, input, camYaw) {
    const S = SWIM;
    // the river froze (a season change): climb out onto the ice
    if (this.world.frozen) {
      this.setSwimming(false);
      this.pos.y = WATER_Y + ICE_LIFT;
      this.vel.set(0, 0, 0);
      this.grounded = true;
      this.root.position.copy(this.pos);
      return;
    }
    const canMove = !this.locked;
    const mx = canMove ? input.move.x : 0, my = canMove ? input.move.y : 0;
    const mag = Math.min(1, Math.hypot(mx, my));
    let dx = Math.sin(camYaw) * my - Math.cos(camYaw) * mx, dz = Math.cos(camYaw) * my + Math.sin(camYaw) * mx;
    const dl = Math.hypot(dx, dz);
    if (dl > 1e-4) { dx /= dl; dz /= dl; }
    const target = mag > 0.05 ? (input.held('sprint') ? S.fast : S.speed) * mag : 0;
    const k = 1 - Math.exp(-S.accel * dt);
    this.vel.x += (dx * target - this.vel.x) * k;
    this.vel.z += (dz * target - this.vel.z) * k;
    // the river carries a swimmer gently downstream, strongest mid-channel
    const fl = riverFlow(this.pos.x, this.pos.z);
    const pull = fl ? S.drift * Math.max(0, 1 - fl.d / Math.max(4, fl.hw)) : 0;
    let nx = this.pos.x + (this.vel.x + (fl ? fl.tx * pull : 0)) * dt;
    let nz = this.pos.z + (this.vel.z + (fl ? fl.tz * pull : 0)) * dt;
    nx = Math.min(WORLD.maxX, Math.max(WORLD.minX, nx));
    nz = Math.min(WORLD.maxZ, Math.max(WORLD.minZ, nz));
    const res = this.colliders.resolve(nx, nz, MOVE.radius, this.pos.y, MOVE.height, 0.1);
    this.pos.x = res.x; this.pos.z = res.z;

    // vertical: hold dive to go down, jump to come up; otherwise she bobs back to the surface
    const surfaceY = WATER_Y - S.float;
    const diving = canMove && input.held('dive');
    const rising = canMove && input.held('jump') && this.pos.y < surfaceY - 0.1;
    const vyT = diving ? -S.dive : rising ? S.rise : Math.max(-1.6, Math.min(1.8, (surfaceY - this.pos.y) * S.buoy));
    this.vel.y += (vyT - this.vel.y) * (1 - Math.exp(-dt * 4));
    this.pos.y += this.vel.y * dt;
    const bed = this.world.heightAt(this.pos.x, this.pos.z);
    if (this.pos.y < bed + 0.08) { this.pos.y = bed + 0.08; this.vel.y = Math.max(0, this.vel.y); }
    if (this.pos.y > surfaceY) { this.pos.y = surfaceY + (this.pos.y - surfaceY) * 0.3; this.vel.y = Math.min(this.vel.y, 0.2); }
    const bob = this.submerged ? 0 : Math.sin(performance.now() / 520) * 0.025;

    // leaving the water: wade out where the bed comes up, or climb onto a bank / dock ahead
    // (a held dive must not keep her swimming into a bank that rises above the surface: she would be squashed under the turf)
    if (WATER_Y - bed < S.enter - 0.25 && (!diving || bed + 0.08 > surfaceY)) {
      this.setSwimming(false);
      this.swimCooldown = 0.4;
      this.pos.y = Math.max(this.pos.y, bed);
      this.grounded = true;
    } else if (canMove && input.pressed('jump') && this.pos.y > surfaceY - 0.25) {
      const ax = this.pos.x + Math.sin(this.facing) * 0.95, az = this.pos.z + Math.cos(this.facing) * 0.95;
      let top = this.world.heightAt(ax, az);
      const c = this.colliders.groundAt(ax, az, WATER_Y + 1.6, 0.3);
      if (c && c.y > top) top = c.y;
      const blocked = this.colliders.resolve(ax, az, MOVE.radius, top + 0.05, MOVE.height, 0.1).hit;
      if (top > WATER_Y - 0.35 && top < WATER_Y + 1.65 && !blocked) {
        this.climb = { from: this.pos.clone(), to: new THREE.Vector3(ax, top, az), t: 0 };
        this.anim?.once('Land', { speed: 0.8, then: 'Idle' });
      } else {
        this.vel.y = 6.2;
        this.anim?.once('Jump', { hold: true, fade: 0.08 });
      }
      this.setSwimming(false);
      this.swimCooldown = 0.45;
      this.grounded = false;
      this.events.push({ type: 'splash', x: this.pos.x, z: this.pos.z, strength: 0.35 });
    }

    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.speed = hs;
    if (hs > 0.25 && target > 0) this.turnTo(Math.atan2(this.vel.x, this.vel.z), dt, S.turn);
    if (this.swimming) {
      // lie flat to stroke, tip down to dive, stand up to tread water
      const want = (hs > 0.6 ? 1.2 : 0.12) + (diving ? 0.45 : rising ? -0.35 : 0);
      this.pitch += (want - this.pitch) * (1 - Math.exp(-dt * 4));
      this.pivot.rotation.x = this.pitch;
      if (hs > 0.6 && !this.submerged) {
        this.strokeAcc = (this.strokeAcc || 0) + dt * hs * 0.55;
        if (this.strokeAcc > 1) { this.strokeAcc = 0; this.events.push({ type: 'stroke', x: this.pos.x, z: this.pos.z }); }
      }
      const a = this.anim;
      if (a && !a.busy) {
        if (hs > 0.6 || diving || rising) a.play(a.has('Swim') ? 'Swim' : 'Walk', { speed: Math.max(0.7, hs / S.speed), fade: 0.3 });
        else a.play(a.has('Tread') ? 'Tread' : 'Idle', { fade: 0.35 });
      }
    }
    this.root.position.set(this.pos.x, this.pos.y + bob, this.pos.z);
    this.root.rotation.y = this.facing;
    this.anim?.update(dt);
  }

  updateClimb(dt) {
    const c = this.climb;
    c.t = Math.min(1, c.t + dt / 0.5);
    const e = c.t * c.t * (3 - 2 * c.t);
    this.pos.lerpVectors(c.from, c.to, e);
    this.pos.y += Math.sin(Math.PI * c.t) * 0.35;
    this.vel.set(0, 0, 0);
    if (c.t >= 1) { this.climb = null; this.pos.copy(c.to); this.grounded = true; this.lastSafe.copy(this.pos); }
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.facing;
    this.anim?.update(dt);
  }

  turnTo(yaw, dt, rate) {
    let d = yaw - this.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.facing += d * (1 - Math.exp(-rate * dt));
  }

  animate(dt, hs) {
    const a = this.anim;
    if (!a) return;
    // a held pose (sitting indoors) wins over the walk cycle until it is cleared
    if (this.pose && !a.busy) { a.play(this.pose, { fade: 0.3 }); a.update(dt); return; }
    if (!a.busy) {
      if (!this.grounded && this.airTime > 0.22 && this.vel.y < 0) a.play('Fall', { fade: 0.2 });
      else if (this.grounded) {
        if (this.aiming) a.play('Aim', { fade: 0.15 });
        else if (hs < 0.25) a.play('Idle', { fade: 0.25 });
        else if (hs < 2.7) a.play('Walk', { speed: Math.max(0.6, hs / MOVE.walk) * 0.95, fade: 0.2 });
        else a.play('Run', { speed: Math.min(1.5, Math.max(0.85, hs / MOVE.run)), fade: 0.18 });
      }
    }
    a.update(dt);
  }

  /** Play a one-shot gesture (Interact, Cheer, Wave, ...). Movement is locked while it plays if lock=true. */
  gesture(name, { lock = true, then = 'Idle', onDone } = {}) {
    if (!this.anim) { onDone?.(); return; }
    this.anim.oneShotLocks = lock;
    this.anim.once(name, { then, onDone: () => { this.anim.oneShotLocks = false; onDone?.(); } });
  }

  /** World position of the lantern (spark origin). */
  lanternWorld(out = new THREE.Vector3()) {
    if (this.lantern) return this.lantern.getWorldPosition(out);
    return out.copy(this.pos).add(new THREE.Vector3(0, 1.1, 0));
  }
}
