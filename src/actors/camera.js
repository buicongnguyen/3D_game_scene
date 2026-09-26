import * as THREE from 'three';
import { WATER_Y } from '../world/layout.js';

const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Third-person follow camera with orbit input, auto-recentre, aim mode, terrain/building collision
 * and scripted cutscene shots. yaw = heading the camera looks toward (model +Z at yaw 0).
 */
export class FollowCamera {
  constructor(camera, world, colliders) {
    this.camera = camera;
    this.world = world;
    this.colliders = colliders;
    this.yaw = Math.PI;
    this.pitch = 0.32;
    this.dist = 6.2;
    this.zoomTarget = 6.2;
    this.idle = 0;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.shot = null;
    this.aimBlend = 0;
    this.shake = 0;
    this.fovBase = 55;
    this.first = true;
  }

  /** Scripted shot: from/to {pos, look} with duration; hold keeps the final framing until cleared. */
  cutscene(to, duration = 1.6, from = null) {
    this.tracking = null;
    this.shot = {
      from: from || { pos: this.camera.position.clone(), look: this.look.clone() },
      to: { pos: to.pos.clone(), look: to.look.clone() }, t: 0, d: duration,
    };
  }

  /** Follow a moving subject smoothly: pos()/look() give the desired framing every frame. */
  track(pos, look, stiffness = 4) {
    this.shot = null;
    this.tracking = { pos, look, k: stiffness, lookNow: this.look.clone() };
  }

  clearCutscene(snapBehind = true) {
    this.shot = null;
    this.tracking = null;
    this.idle = snapBehind ? 10 : 0;
  }

  update(dt, player, input, aiming) {
    this.setNear(this.tracking || this.shot ? 1.2 : 0.35);
    if (this.tracking) {
      const tr = this.tracking;
      const k = 1 - Math.exp(-dt * tr.k);
      this.camera.position.lerp(tr.pos(), k);
      tr.lookNow.lerp(tr.look(), k);
      this.look.copy(tr.lookNow);
      this.camera.lookAt(this.look);
      this.pos.copy(this.camera.position);
      this.setFov(this.fovBase, dt);
      return;
    }
    if (this.shot) {
      const s = this.shot;
      s.t = Math.min(s.d, s.t + dt);
      const k = ease(s.t / s.d);
      this.camera.position.lerpVectors(s.from.pos, s.to.pos, k);
      this.look.lerpVectors(s.from.look, s.to.look, k);
      this.camera.lookAt(this.look);
      this.pos.copy(this.camera.position);
      this.setFov(this.fovBase, dt);
      return;
    }
    const sens = 0.0042;
    const lx = input.look.x, ly = input.look.y;
    const aimMul = aiming ? 0.55 : 1;
    this.yaw -= lx * sens * aimMul;
    this.pitch += ly * sens * 0.8 * aimMul;
    this.pitch = THREE.MathUtils.clamp(this.pitch, aiming ? -0.95 : -0.45, aiming ? 0.9 : 1.15);
    this.zoomTarget = THREE.MathUtils.clamp(this.zoomTarget + input.zoom * 0.7, 3.2, 11);
    // auto-recentre behind the player while moving without camera input
    if (Math.abs(lx) + Math.abs(ly) > 0.5) this.idle = 0; else this.idle += dt;
    if (!aiming && player.speed > 1.2 && this.idle > 1.4) {
      let d = player.facing - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * (1 - Math.exp(-dt * 1.4 * Math.min(1, (this.idle - 1.4) * 0.8)));
      this.pitch += (0.3 - this.pitch) * (1 - Math.exp(-dt * 0.8));
    }
    this.aimBlend += ((aiming ? 1 : 0) - this.aimBlend) * (1 - Math.exp(-dt * 10));
    const dist = THREE.MathUtils.lerp(this.zoomTarget, 2.4, this.aimBlend);
    const fwd = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    const right = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const pivot = player.pos.clone().add(new THREE.Vector3(0, THREE.MathUtils.lerp(1.45, 1.55, this.aimBlend), 0));
    pivot.addScaledVector(right, 0.62 * this.aimBlend);
    // collision: pull in before terrain or buildings block the view
    let d = dist;
    const steps = 14;
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * dist;
      const p = pivot.clone().addScaledVector(fwd, -t);
      if (this.world.heightAt(p.x, p.z) > p.y - 0.35) { d = Math.max(1.2, t - 0.4); break; }
    }
    const end = pivot.clone().addScaledVector(fwd, -d);
    const hitT = this.colliders.raycast(pivot.x, pivot.y, pivot.z, end.x, end.y, end.z);
    if (hitT < 1) d = Math.max(1.0, d * hitT - 0.3);
    // smooth only the distance (keeps the orbit responsive but hides snaps)
    if (this.first) { this.dist = d; this.first = false; }
    this.dist = d < this.dist ? d : this.dist + (d - this.dist) * (1 - Math.exp(-dt * 3));
    const target = pivot.clone().addScaledVector(fwd, -this.dist);
    const g = this.world.heightAt(target.x, target.z);
    if (target.y < g + 0.45) target.y = g + 0.45;
    // over the river the camera stays clear of the surface: above it, or below it once Mika dives
    if (g < WATER_Y) {
      if (player.submerged) target.y = Math.min(target.y, WATER_Y - 0.35);
      else target.y = Math.max(target.y, WATER_Y + 0.45);
    }
    this.camera.position.copy(target);
    this.look.copy(pivot).addScaledVector(fwd, 10);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const s = this.shake * 0.06;
      this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s));
    }
    this.camera.lookAt(this.look);
    this.pos.copy(this.camera.position);
    this.setFov(THREE.MathUtils.lerp(this.fovBase + Math.min(6, player.speed * 0.8), 44, this.aimBlend), dt);
  }

  /** Wide cinematic shots get a larger near plane for depth precision; gameplay keeps a close one. */
  setNear(n) {
    if (Math.abs(this.camera.near - n) < 1e-3) return;
    this.camera.near = n;
    this.camera.updateProjectionMatrix();
  }

  setFov(f, dt) {
    const c = this.camera;
    const nf = c.fov + (f - c.fov) * (1 - Math.exp(-dt * 6));
    if (Math.abs(nf - c.fov) > 0.01) { c.fov = nf; c.updateProjectionMatrix(); }
  }

  /** World-space aim ray from the screen centre. */
  aimRay() {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    return { origin: this.camera.position.clone(), dir };
  }
}
