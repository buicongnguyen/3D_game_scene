import * as THREE from 'three';
import { Animator } from './animator.js';
import { placeholder } from '../engine/assets.js';

const SHIRTS = ['#e0567a', '#3a8fd8', '#f2b53a', '#5fae3e', '#8a5ad8', '#e2702a', '#1fa5a0'];
const TROUSERS = ['#2d3a5a', '#5a3a2a', '#3a4a3a', '#6a6a7a', '#2a2a3a'];
const HAIR = ['#2a1d16', '#4a3020', '#1a1a1a', '#6a4a2a', '#d8d0c0', '#8a8a8a'];

/**
 * A character standing in the world: plays clips, turns toward the player when talked to,
 * can walk a short path, and exposes a talk anchor for the camera and markers.
 */
export class NPC {
  constructor(scene, assets, world, id, model, { x, z, facing = 0, tint = null, name } = {}) {
    this.id = id;
    this.world = world;
    this.name = name || id;
    const m = assets.clone(model);
    this.model = m || placeholder(model, [0.7, 1.6, 0.5], '#6b7aa8');
    this.anim = m ? new Animator(m) : null;
    this.model.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      if (tint) {
        const mats = [o.material].flat().map(mat => {
          const t = tint[mat.name];
          if (!t) return mat;
          const c = mat.clone(); c.color.set(t); return c;
        });
        o.material = Array.isArray(o.material) ? mats : mats[0];
      }
    });
    this.root = new THREE.Group();
    this.root.name = `npc:${id}`;
    this.root.add(this.model);
    scene.add(this.root);
    this.pos = new THREE.Vector3();
    this.home = { x, z, facing };
    this.facing = facing;
    this.targetFacing = facing;
    this.idleClip = 'Idle';
    this.path = null;
    this.speed = 1.5;
    this.visible = true;
    this.place(x, z, facing);
    this.anim?.play(this.idleClip);
  }

  static villagerTint(seed) {
    const r = n => SHIRTS[(seed * 7 + n) % SHIRTS.length];
    return { 'Villager shirt': r(0), 'Villager trousers': TROUSERS[(seed * 3) % TROUSERS.length], 'Villager hair': HAIR[(seed * 5) % HAIR.length] };
  }

  place(x, z, facing, y) {
    // placing someone cancels whatever walk they were on
    this.path = null;
    this.onPathDone = null;
    this.pos.set(x, y ?? this.world.heightAt(x, z), z);
    if (facing !== undefined) { this.facing = facing; this.targetFacing = facing; }
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.facing;
  }

  setVisible(v) { this.visible = v; this.root.visible = v; }

  /** Talk anchor (head height). */
  head(out = new THREE.Vector3()) { return out.copy(this.pos).add(new THREE.Vector3(0, 1.55, 0)); }

  lookAt(x, z) { this.targetFacing = Math.atan2(x - this.pos.x, z - this.pos.z); }

  gesture(clip) {
    if (!this.anim?.has(clip)) return;
    if (['Idle', 'Walk', 'Talk', 'Sad', 'ArmsCrossed', 'Knead', 'Pole', 'Reel'].includes(clip)) { this.anim.play(clip); this.loopGesture = clip; }
    else this.anim.once(clip, { then: this.idleClip });
  }

  setIdle(clip) {
    this.idleClip = clip;
    if (!this.path && !this.anim?.busy) this.anim?.play(clip);
  }

  /** Walk along [[x, z], ...] then call done. */
  walk(points, done, speed = 1.5) {
    this.path = points.slice();
    this.speed = speed;
    this.onPathDone = done;
    this.anim?.play(speed > 3 ? 'Run' : 'Walk', { speed: speed > 3 ? speed / 4.2 : speed / 1.6 });
  }

  update(dt, colliders) {
    if (!this.visible) return;
    // riding: the root is parented to a seat on the train, so only animate
    if (this.riding) { this.anim?.update(dt); return; }
    if (this.path?.length) {
      const [tx, tz] = this.path[0];
      const dx = tx - this.pos.x, dz = tz - this.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.25) {
        this.path.shift();
        if (!this.path.length) {
          this.path = null;
          this.anim?.play(this.idleClip);
          const cb = this.onPathDone; this.onPathDone = null; cb?.();
        }
      } else {
        const step = Math.min(d, this.speed * dt);
        this.pos.x += dx / d * step; this.pos.z += dz / d * step;
        this.pos.y = this.world.heightAt(this.pos.x, this.pos.z);
        const g = colliders?.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.6, 0.8);
        if (g && g.y > this.pos.y) this.pos.y = g.y;
        this.targetFacing = Math.atan2(dx, dz);
      }
    }
    let df = this.targetFacing - this.facing;
    df = Math.atan2(Math.sin(df), Math.cos(df));
    this.facing += df * (1 - Math.exp(-dt * 7));
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.facing;
    this.anim?.update(dt);
  }
}
