import { GroundPose, GROUND } from './pose-ground.js';

const WANTS = ['creeping', 'kneel', 'waiting', 'reach'];
const TAP_SECONDS = 0.55;                                   // the little arm reach of a tap while she kneels
const TAP_BENDS = [['upperarm_R', 0.8]];                     // about the bone's own Z: the hanging arm swings forward (looked at in the game)
const DRIFT_FROM = 0.1;                                     // s: a hovering pickup starts to sink toward her hand
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

/** Applies the pure ground-pose rules without owning quest logic or a scene's movement lock. */
export class GroundPoseSystem {
  constructor(player) {
    this.p = player;
    this.rule = new GroundPose({ has: name => !!player.anim?.has(name) });
    this.requests = new Map();
    this.items = [];
    this.clip = null;        // the looping clip this system put in player.pose
    this.action = null;      // the one-shot clip this system is playing
    this.lockLeft = 0;
    this.reachAsk = false;
    this.tapLeft = 0;
    this.bends = null;
    this.input = { dt: 0, speed: 0, grounded: true, blocked: false, creeping: false, kneel: false, waiting: false, reach: false, reachNow: false };
    this.state = { active: false, clip: null, cameraLower: 0 };
  }

  want(key, input) { this.requests.set(key, input); }
  /** cancelAction: also drop what is playing now (a round ended). The camera eases back by itself in update(). */
  release(key, cancelAction = false) {
    this.requests.delete(key);
    if (cancelAction) {
      this.rule.clear();
      this.reachAsk = false;
      this.tapLeft = 0;
      this.bendArm(0);
      this.clearItems();
      this.apply({ active: false, clip: null, cameraLower: 0 });
    }
  }

  /** A new game or a loaded save: nothing is left over, the camera included. */
  reset() { this.requests.clear(); this.release(null, true); this.p.groundCameraLower = 0; }

  /** Returns false for old models, letting callers keep their existing gesture. Inventory changes stay instant. */
  pickup({ object = null, target = null, onGrab = null, onDone = null } = {}) {
    const p = this.p;
    if (!p.anim?.has('Pickup') || p.mounted || p.swimming || !p.grounded) return false;
    if (target) p.turnTo?.(Math.atan2(target.x - p.pos.x, target.z - p.pos.z), 1, 50);
    if (object || onGrab || onDone) this.items.push({ object, onGrab, onDone, t: 0, grabbed: false, from: object ? object.position.clone() : null });
    if (this.action !== 'Pickup') {
      this.apply(this.rule.update({ dt: 0, pickup: true, grounded: true, speed: 0 }));
      // Requests are edges; consuming the release allows another pickup later in the same session.
      this.rule.update({ dt: 0, pickup: false, grounded: true, speed: 0 });
    }
    return true;
  }

  /** One reach (a pat, a tickle, a bug into the cage). Kneeling, only her arm reaches. */
  reach() {
    if (!this.p.anim?.has('CrouchReach')) return false;
    this.reachAsk = true;
    return true;
  }

  /** An interrupted bend (a jump, a hint, the round ending) still shows what she already owns: the grab is not skipped. */
  clearItems() {
    for (const item of this.items) { item.object?.removeFromParent?.(); if (!item.grabbed) { item.grabbed = true; item.onGrab?.(); } item.onDone?.(); }
    this.items.length = 0;
  }

  /** A small right-arm reach on top of the kneel, sampled after the mixer; k = 0 gives the arm back to the clip. */
  bendArm(k) {
    if (!this.bends) {
      if (!(k > 0)) return;
      this.bends = TAP_BENDS.map(([name, angle]) => {
        const bone = this.p.model?.getObjectByName?.(name);
        return bone ? { bone, angle, base: bone.quaternion.clone(), wrote: bone.quaternion.clone(), on: false } : null;
      });
    }
    for (const b of this.bends) {
      if (!b) continue;
      if (b.on && b.bone.quaternion.equals(b.wrote)) b.bone.quaternion.copy(b.base);   // the mixer left it alone: start from the clip again
      b.on = k > 0.002;
      if (b.on) { b.base.copy(b.bone.quaternion); b.bone.rotateZ(b.angle * k); b.wrote.copy(b.bone.quaternion); }
    }
  }

  apply(state) {
    const p = this.p, a = p.anim;
    this.state = state;
    if (!state.active || !state.clip) {
      if (this.clip && p.pose === this.clip) { p.pose = null; p.poseSpeed = 1; }
      if (this.action && a?.currentName === this.action) a.cancelOneShot();
      this.clip = this.action = null;
      this.lockLeft = 0;
      return;
    }
    if (state.once) {
      a.cancelOneShot();
      // While the one-shot plays nobody loops a pose; it holds its last frame until the next clip blends from it
      // (returning to Idle by itself made her bob up for a moment after every reach in a crouch).
      if (this.clip && p.pose === this.clip) { p.pose = null; p.poseSpeed = 1; }
      this.clip = null;
      this.action = state.clip;
      this.lockLeft = Math.min(GROUND.pickupLock, state.lockFor || 0);
      a.oneShotLocks = this.lockLeft > 0;
      a.once(state.clip, { fade: state.fade, hold: true });
      a.update(0);          // the player's mixer ran earlier this frame; sampling with dt=0 never advances it twice
      return;
    }
    if (state.clip === this.action) return;                 // the one-shot is still playing
    if (this.action) { if (a.currentName === this.action) a.cancelOneShot(); this.action = null; }
    const fresh = state.clip !== this.clip;
    if (!a.busy) a.play(state.clip, { fade: state.fade, speed: state.speed });
    this.clip = state.clip;
    p.pose = state.clip;
    p.poseSpeed = state.speed || 1;
    if (fresh) a.update(0);
  }

  update(dt, { blocked = false, moving = false } = {}) {
    const p = this.p, a = p.anim, input = this.input;
    input.dt = dt; input.speed = p.speed || 0; input.grounded = !!p.grounded; input.blocked = blocked;
    for (const name of WANTS) input[name] = false;
    for (const want of this.requests.values()) for (const name of WANTS) if (want[name]) input[name] = true;
    if (moving) input.speed = Math.max(0.3, input.speed);
    input.reachNow = this.reachAsk;
    this.reachAsk = false;
    this.lockLeft = Math.max(0, this.lockLeft - dt);
    if (this.action) {
      // Its clip ended (it holds the last frame) or something else took her over (a landing, another gesture).
      if (!a?.busy || a.currentName !== this.action) { this.rule.endAction(); this.action = null; this.lockLeft = 0; }
      else a.oneShotLocks = this.lockLeft > 0;
    }
    const state = this.rule.update(input);
    this.apply(state);
    if (state.tap) this.tapLeft = TAP_SECONDS;
    else if (this.tapLeft > 0) this.tapLeft = this.clip === 'Kneel' ? Math.max(0, this.tapLeft - dt) : 0;
    this.bendArm(this.tapLeft > 0 ? Math.sin(Math.PI * (1 - this.tapLeft / TAP_SECONDS)) : 0);
    if (blocked || !this.state.active && this.items.length) this.clearItems();
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i], grip = p.grip || p.model;
      item.t += dt;
      if (!item.grabbed && item.t >= GROUND.pickupGrab) {
        item.grabbed = true;
        if (item.object && grip) {
          grip.add(item.object);
          item.object.position.set(0, -0.03, 0.06);
          item.object.rotation.set(0, 0, 0);
        }
        item.onGrab?.();
      } else if (!item.grabbed && item.from && item.object?.parent && grip?.getWorldPosition) {
        // Story pickups hover at chest height: it sinks into her reaching hand instead of jumping there at the grab.
        const o = item.object, k = smooth((item.t - DRIFT_FROM) / (GROUND.pickupGrab - DRIFT_FROM));
        grip.getWorldPosition(o.position);
        o.parent.worldToLocal(o.position);
        o.position.lerpVectors(item.from, o.position, k);
      }
      if (item.t >= GROUND.pickupSeconds) { item.object?.removeFromParent?.(); item.onDone?.(); this.items.splice(i, 1); }
    }
    const lower = blocked ? 0 : this.state.cameraLower || 0;
    p.groundCameraLower = (p.groundCameraLower || 0) + (lower - (p.groundCameraLower || 0)) * (1 - Math.exp(-dt * 8));
    if (p.groundCameraLower < 1e-4) p.groundCameraLower = 0;
  }

  debug() { return { ...this.state, action: this.action, lockLeft: this.lockLeft, tapLeft: this.tapLeft, items: this.items.length, requests: [...this.requests.keys()] }; }
}
