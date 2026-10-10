import * as THREE from 'three';
import { CARRY, SWAY, Reasons, darkLatch, resolveCarry, clipKind, makeSway, stepSway, stepBlend, ease, restLean, lanternLight } from './lantern-carry.js';

// Mika's lantern on her body (the rules live in ./lantern-carry.js).
//
// The lantern is a child of her model and is placed once a frame, after the mixer and after everything that poses
// her bones (the kite, the yard kick): it hangs from a point that slides between her belt and her hand, always
// upright in the world, with a small sway. Nothing is re-parented, so it can never be drawn twice or get lost.
// Held, her clips know nothing of a lantern (the arms just swing): the right arm is bent to carry it in front of
// her, on top of the clip. Worn, the clips are left alone and both hands are free.

const HIP = new THREE.Vector3(-0.2, 0.04, -0.1);     // the belt hook, from the hips bone, in her own frame (-x: her right, -z: behind)
const LAP_FWD = 0.19, LAP_UP = 0.075;                    // seated, it stands on her lap: ahead of the hips, on top of her thighs
const WORN_SCALE = 0.86;                                // on the belt it is strapped short
const ARM_UP = new THREE.Vector3(-0.3, -0.9, 0.32).normalize();      // upper arm, carrying: down, a little out and forward
const ARM_FORE = new THREE.Vector3(-0.12, 0.3, 1).normalize();       // forearm: forward and a little up
const ARM_KEEP = 0.12;                                  // how much of the clip's swing stays in the carrying arm
const LIGHT = 2.4;                                      // the lantern's light at night, in her hand
const LIGHT_OUT = 0.4, LIGHT_UP = 0.3;                  // the pooled light stands a little off her, so it lights the ground and not just her coat

const Y = new THREE.Vector3(0, 1, 0);
const _hand = new THREE.Vector3(), _hip = new THREE.Vector3(), _at = new THREE.Vector3(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qm = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');

/** One bone bent toward a fixed pose on top of the clip (the mixer only rewrites a bone whose clip value changed). */
class BoneBend {
  constructor(bone, target) { this.bone = bone; this.target = target; this.base = new THREE.Quaternion(); this.wrote = new THREE.Quaternion(); this.on = false; }
  apply(w) {
    const q = this.bone.quaternion;
    if (this.on && q.equals(this.wrote)) q.copy(this.base);   // untouched since last frame: start again from the clip's pose
    this.on = w > 0.001;
    if (!this.on) return;
    this.base.copy(q);
    q.slerp(this.target, w);
    this.wrote.copy(q);
  }
}

export class LanternCarry {
  /** player: the Player (model, grip, anim…), lantern: the lantern model (not yet in the scene). */
  constructor(player, lantern) {
    this.p = player;
    this.obj = lantern;
    this.reasons = new Reasons();
    this.state = 'worn';
    this.blend = 0;               // 0 on the belt .. 1 in her hand
    this.dark = false;
    this.freeFor = 9;
    this.first = true;
    this.sway = makeSway();
    this.armW = 0;
    this.lapW = 0;                // 1 while she sits: it stands on her lap
    this.prev = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.world = new THREE.Vector3();          // where the flame is (for sparks)
    this.lightAt = new THREE.Vector3();
    this.light = null;
    this.lightLevel = 0;

    const m = player.model;
    this.hips = m.getObjectByName('hips') || null;
    this.grip = player.grip !== m ? player.grip : null;
    this.ok = !!(this.hips && this.grip);
    // its size, measured standing upright on its own
    lantern.position.set(0, 0, 0); lantern.rotation.set(0, 0, 0); lantern.scale.setScalar(1);
    lantern.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(lantern);
    this.len = Math.max(0.1, -box.min.y);
    const flame = lantern.getObjectByName('Flame');
    this.flameY = flame ? flame.position.y : -this.len * 0.6;
    m.add(lantern);
    if (!this.ok) { lantern.position.set(-0.28, 0.75, 0.1); return; }

    // the carrying pose of the right arm, worked out once from the rest pose
    const upper = m.getObjectByName('upperarm_R'), fore = m.getObjectByName('forearm_R');
    if (upper && fore && fore.parent === upper) {
      m.updateWorldMatrix(true, true);
      const qModel = m.getWorldQuaternion(new THREE.Quaternion()).invert();
      const inModel = (o, out) => o.getWorldQuaternion(out).premultiply(qModel);
      const qParent = inModel(upper.parent, new THREE.Quaternion()), qU = inModel(upper, new THREE.Quaternion());
      const swing = new THREE.Quaternion().setFromUnitVectors(Y.clone().applyQuaternion(qU).normalize(), ARM_UP);
      const qU2 = swing.clone().multiply(qU);
      const qF = qU2.clone().multiply(fore.quaternion);
      const swingF = new THREE.Quaternion().setFromUnitVectors(Y.clone().applyQuaternion(qF).normalize(), ARM_FORE);
      const qF2 = swingF.multiply(qF);
      this.bends = [
        new BoneBend(upper, qParent.invert().multiply(qU2)),
        new BoneBend(fore, qU2.clone().invert().multiply(qF2)),
      ];
    } else this.bends = [];
  }

  // ------------------------------------------------------------------ what other systems call
  /** Ask for a carry state: 'worn' (hands free), 'held' (in her hand) or 'auto' (no wish). key names who asks. */
  want(state, key) { this.reasons.want(state, key); }
  release(key) { this.reasons.release(key); }
  /** Jump to where it should be, without the clip-on motion (after a fade or a teleport into a scene). */
  snap() { this.first = true; }

  debug() {
    return { state: this.state, blend: +this.blend.toFixed(2), dark: this.dark, reasons: this.reasons.keys(), arm: +this.armW.toFixed(2), visible: this.obj.visible,
      sway: [+this.sway.x.toFixed(3), +this.sway.z.toFixed(3)], clip: this.p.anim?.currentName, light: +this.lightLevel.toFixed(2), parent: this.obj.parent?.name };
  }

  // ------------------------------------------------------------------ once a frame, after everything that poses her
  /** game: for the night level, the shared lights and the click. */
  update(dt, game) {
    const p = this.p, a = p.anim;
    if (!this.ok) return;
    if (!p.root.visible) this.first = true;      // off screen (the title, a cutscene without her): it is simply where it belongs when she is back
    const kind = clipKind(a?.currentName || 'Idle');
    const night = game?.night || 0;
    this.dark = darkLatch(night, this.dark);
    const free = p.grounded && !p.locked && !p.climb && !p.swimming && !(a && a.busy) && kind === 'carry';
    this.freeFor = free ? this.freeFor + dt : 0;
    if (this.first) this.freeFor = 9;
    const R = this.reasons;
    const next = resolveCarry({
      body: p.swimming || !!p.climb || kind === 'body', aim: p.aiming || kind === 'aim', hands: kind === 'hands',
      held: R.held, worn: R.worn, dark: this.dark, freeFor: this.freeFor,
    }, this.state);
    if (next !== this.state) {
      this.state = next;
      if (!this.first) {
        this.sway.vz += next === 'held' ? 1.6 : -1.6;        // the little swing of unhooking it / hooking it on
        if (next === 'held' && this.blend <= 0) this.click(game);
      }
    }
    const was = this.blend;
    this.blend = this.first ? (this.state === 'held' ? 1 : 0) : stepBlend(this.blend, this.state, dt);
    if (was > 0 && this.blend <= 0 && !this.first) this.click(game);     // it catches on the belt hook
    const e = ease(this.blend);

    // her right arm carries it in front of her (only on top of the clips that just let the arm swing)
    const carry = kind === 'carry' && !p.swimming && !p.climb ? 1 : 0;
    this.armW = this.first ? carry : this.armW + (carry - this.armW) * (1 - Math.exp(-dt * 9));
    const w = e * this.armW * (1 - ARM_KEEP);
    for (const b of this.bends) b.apply(w);

    // the point it hangs from: the belt hook, the hand, or on its way between them
    this.grip.updateWorldMatrix(true, false);          // (the hips are on the way up, so they are current too)
    const model = p.model;
    model.matrixWorld.decompose(_v, _qm, _s);
    const f = p.facing, sf = Math.sin(f), cf = Math.cos(f);
    _hand.setFromMatrixPosition(this.grip.matrixWorld);
    _hip.copy(HIP).applyMatrix4(this.hips.matrixWorld);
    _at.lerpVectors(_hip, _hand, e);
    const arc = Math.sin(Math.PI * e);
    _at.x += -cf * 0.07 * arc; _at.z += sf * 0.07 * arc; _at.y += 0.03 * arc;      // out and around her coat, not through it
    // sitting (a chair, a bench, a floor cushion) there is no room for it at her hip: she stands it on her lap
    const clip = a?.currentName, seated = clip === 'Sit' || clip === 'SitFloor' ? 1 : 0;
    this.lapW = this.first ? seated : this.lapW + (seated - this.lapW) * (1 - Math.exp(-dt * 7));
    if (this.lapW < 0.002) this.lapW = 0;
    const lap = ease(this.lapW) * (1 - e);
    if (lap > 0) {
      _v.setFromMatrixPosition(this.hips.matrixWorld);
      _v.x += sf * LAP_FWD; _v.z += cf * LAP_FWD; _v.y += LAP_UP + this.len * WORN_SCALE;
      _at.lerp(_v, lap);
    }

    // sway: pushed by how the hanging point speeds up, in her own frame (x: her left, z: ahead)
    const s = this.sway;
    if (this.first || _at.distanceToSquared(this.prev) > 2.25 || !(dt > 1e-5)) {
      this.vel.set(0, 0, 0);
      if (this.first) { s.x = s.z = s.vx = s.vz = 0; }
    } else {
      const ix = 1 / dt;
      const vx = (_at.x - this.prev.x) * ix, vz = (_at.z - this.prev.z) * ix;
      const ax = (vx - this.vel.x) * ix, az = (vz - this.vel.z) * ix;
      this.vel.x = vx; this.vel.z = vz;
      stepSway(s, ax * cf - az * sf, ax * sf + az * cf, dt, e < 0.5);
    }
    const still = 1 - lap;                              // standing on her lap it does not swing
    this.prev.copy(_at);
    // on the belt it rests on the ground instead of sinking in (a deep landing, a crouch)
    const lean = e < 1 && !p.swimming && !p.mounted ? restLean(_at.y - p.root.position.y - 0.02, this.len * WORN_SCALE) * (1 - e) * still : 0;
    const sx = Math.min(s.x * still, -lean);

    // upright in the world, leaning by the sway; then into the model's frame
    _e.set(-s.z * still, f, sx);
    _q.setFromEuler(_e);
    this.world.set(0, this.flameY, 0).applyQuaternion(_q).add(_at);
    const o = this.obj;
    o.quaternion.copy(_qm.invert()).multiply(_q);
    o.position.copy(_at);
    model.worldToLocal(o.position);
    o.scale.setScalar(WORN_SCALE + (1 - WORN_SCALE) * e);

    // its light: a soft glow at her hip, a wider pool in her hand (one source of the shared pool, never a new light)
    const L = lanternLight(this.blend, night);
    const rp = p.root.position, ox = this.world.x - rp.x, oz = this.world.z - rp.z, ol = Math.hypot(ox, oz) || 1;
    this.lightAt.set(this.world.x + ox / ol * LIGHT_OUT, this.world.y + LIGHT_UP, this.world.z + oz / ol * LIGHT_OUT);
    const shown = o.visible && p.root.visible && model.visible;
    this.lightLevel = shown ? L.level : 0;
    if (!this.light && game?.lights) this.light = game.lights.add({ pos: this.lightAt, color: '#ffc46b', intensity: () => this.lightLevel * LIGHT, range: L.range });
    if (this.light) this.light.range = L.range;
    this.first = false;
  }

  click(game) {
    if (!this.obj.visible || !this.p.root.visible) return;
    const au = game?.audio;
    try { au?.tone?.(980, { type: 'triangle', dur: 0.05, vol: 0.05, rev: 0 }); au?.tone?.(1460, { type: 'triangle', dur: 0.04, vol: 0.035, rev: 0, when: 0.045 }); } catch { /* no sound */ }
  }
}
