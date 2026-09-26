import * as THREE from 'three';
import { Animator } from './animator.js';
import { WORLD } from '../world/layout.js';

export const MOVE = {
  radius: 0.32, height: 1.45, step: 0.46, gravity: 26, jumpV: 8.4,
  walk: 1.6, run: 4.4, sprint: 6.8, accel: 16, airAccel: 5, turn: 11, maxSlope: 47,
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
    this.root.add(this.model);
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
    const g = this.groundHeight(x, z, 999);
    this.pos.set(x, y ?? g, z);
    this.vel.set(0, 0, 0);
    if (facing !== undefined) this.facing = facing;
    this.lastSafe.copy(this.pos);
    this.grounded = true;
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.facing;
  }

  groundHeight(x, z, footY) {
    let g = this.world.heightAt(x, z);
    const c = this.colliders.groundAt(x, z, footY, MOVE.step);
    if (c && c.y > g) { g = c.y; this.onItem = c.item; } else this.onItem = null;
    return g;
  }

  /** Ride along with a moving object (ferry deck, train cab). offset is in the object's local space. */
  mount(obj, offset = new THREE.Vector3(), facingOffset = 0) { this.mounted = { obj, offset, facingOffset }; this.vel.set(0, 0, 0); }
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
    const canMove = !this.locked && !this.aiming && !(this.anim?.busy && this.anim.oneShotLocks);
    let mx = canMove ? input.move.x : 0, my = canMove ? input.move.y : 0;
    const mag = Math.min(1, Math.hypot(mx, my));
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const rx = -Math.cos(camYaw), rz = Math.sin(camYaw);
    let dx = fx * my + rx * mx, dz = fz * my + rz * mx;
    const dl = Math.hypot(dx, dz);
    if (dl > 1e-4) { dx /= dl; dz /= dl; }
    let target = 0;
    if (mag > 0.05) {
      target = mag < 0.6 ? M.walk * (mag / 0.6) * 1.2 : M.run;
      if (input.held('sprint') && mag >= 0.6) target = M.sprint;
    }
    const accel = this.grounded ? M.accel : M.airAccel;
    const k = 1 - Math.exp(-accel * dt);
    this.vel.x += (dx * target - this.vel.x) * k;
    this.vel.z += (dz * target - this.vel.z) * k;

    // horizontal move with steep-slope blocking
    let nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    const hNow = this.world.heightAt(this.pos.x, this.pos.z);
    const hNext = this.world.heightAt(nx, nz);
    if (hNext > hNow + 0.05 && this.world.grid.slopeAt(nx, nz) > M.maxSlope && hNext > this.pos.y - 0.2) {
      // slide along the contour instead of climbing
      const n = this.world.grid.normalAt(nx, nz);
      const nl = Math.hypot(n.nx, n.nz) || 1;
      const ux = n.nx / nl, uz = n.nz / nl;
      const into = this.vel.x * ux + this.vel.z * uz;
      if (into < 0) { this.vel.x -= into * ux; this.vel.z -= into * uz; }
      nx = this.pos.x + this.vel.x * dt; nz = this.pos.z + this.vel.z * dt;
    }
    // soft world bounds
    nx = Math.min(WORLD.maxX, Math.max(WORLD.minX, nx));
    nz = Math.min(WORLD.maxZ, Math.max(WORLD.minZ, nz));
    const res = this.colliders.resolve(nx, nz, M.radius, this.pos.y, M.height, M.step);
    this.pos.x = res.x; this.pos.z = res.z;

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

    // deep water: respawn at the last safe footing (no swimming in Hoshi Valley)
    const terrain = this.world.heightAt(this.pos.x, this.pos.z);
    if (!this.onItem && terrain < -0.7 && this.pos.y < 0.15) {
      this.events.push({ type: 'splash', x: this.pos.x, z: this.pos.z });
      this.teleport(this.lastSafe.x, this.lastSafe.z, this.lastSafe.y);
    }
    this.safeTimer -= dt;
    if (this.grounded && this.safeTimer <= 0 && (terrain > 0.15 || this.onItem) && this.world.grid.slopeAt(this.pos.x, this.pos.z) < 35) {
      this.lastSafe.copy(this.pos);
      this.safeTimer = 0.5;
    }
    this.surface = this.onItem ? (this.onItem.surface || 'wood') : terrain < 0.3 ? 'sand' : 'grass';

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

  turnTo(yaw, dt, rate) {
    let d = yaw - this.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.facing += d * (1 - Math.exp(-rate * dt));
  }

  animate(dt, hs) {
    const a = this.anim;
    if (!a) return;
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
