import * as THREE from 'three';
import { Animator } from './animator.js';
import { placeholder } from '../engine/assets.js';

const SHIRTS = ['#e0567a', '#3a8fd8', '#f2b53a', '#5fae3e', '#8a5ad8', '#e2702a', '#1fa5a0'];
const TROUSERS = ['#2d3a5a', '#5a3a2a', '#3a4a3a', '#6a6a7a', '#2a2a3a'];
const RUN_SPEED = 4.2;       // m/s a Run clip is authored for at 1.0x (art/CONTRACTS.md)
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
    // level of detail (set by the director every few frames): far people are not drawn, mid-range ones animate at a
    // lower rate and cast no shadow. `visible` stays the logical state; `far` only hides the drawing.
    this.far = false; this.animEvery = 1; this.animAcc = 0; this.animTick = 0; this.shadow = true;
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

  // `visible` = shown by the story (setVisible) and not away indoors or asleep by their day plan (setHidden)
  setVisible(v) { this.storyVisible = v; this.applyVisible(); }
  setHidden(h) { this.hiddenBy = h; this.applyVisible(); }
  applyVisible() { this.visible = this.storyVisible !== false && !this.hiddenBy; this.root.visible = this.visible && !this.far; }

  /** Detail for this distance: tier 0 full, 1 = animate every 3rd frame and no shadow, 2 = not drawn. */
  setDetail(tier, shadow) {
    const far = tier >= 2;
    if (far !== this.far) { this.far = far; this.root.visible = this.visible && !far; }
    this.animEvery = tier === 1 ? 3 : 1;
    if (shadow !== this.shadow) { this.shadow = shadow; this.model.traverse(o => { if (o.isMesh) o.castShadow = shadow; }); }
  }

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

  /** Walk along [[x, z], ...] then call done. `clip` picks Walk or Run (by speed when not given). */
  walk(points, done, speed = 1.5, clip) {
    this.path = points.slice();
    this.speed = speed;
    this.onPathDone = done;
    this.walkClip = clip;
    const run = (clip ? clip === 'Run' : speed > 3) && this.anim?.has('Run');
    this.anim?.play(run ? 'Run' : 'Walk', { speed: run ? speed / RUN_SPEED : speed / 1.6 });
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
        const g = this.far ? null : colliders?.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.6, 0.8);
        if (g && g.y > this.pos.y) this.pos.y = g.y;
        this.targetFacing = Math.atan2(dx, dz);
      }
    }
    let df = this.targetFacing - this.facing;
    df = Math.atan2(Math.sin(df), Math.cos(df));
    this.facing += df * (1 - Math.exp(-dt * 7));
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.facing;
    if (this.far) return;
    // mid-range people step their animation less often (staggered so they do not all tick on the same frame)
    this.animAcc += dt;
    if (++this.animTick % this.animEvery) return;
    this.anim?.update(this.animAcc);
    this.animAcc = 0;
  }
}
