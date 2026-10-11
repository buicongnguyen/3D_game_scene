import { GroundPose } from './pose-ground.js';

/** Applies the pure ground-pose rules without owning quest logic or a scene's movement lock. */
export class GroundPoseSystem {
  constructor(player) {
    this.p = player;
    this.rule = new GroundPose({ has: name => !!player.anim?.has(name) });
    this.requests = new Map();
    this.items = [];
    this.clip = null;
    this.action = null;
    this.lockLeft = 0;
    this.reachLeft = 0;
    this.state = { active: false, clip: null, cameraLower: 0 };
  }

  want(key, input) { this.requests.set(key, input); }
  release(key, cancelAction = false) {
    this.requests.delete(key);
    if (cancelAction) {
      this.rule.clear();
      this.reachLeft = 0;
      this.clearItems();
      this.apply({ active: false, clip: null, cameraLower: 0 });
      this.p.groundCameraLower = 0;
    }
  }

  reset() { this.requests.clear(); this.release(null, true); }

  /** Returns false for old models, letting callers keep their existing gesture. Inventory changes stay instant. */
  pickup({ object = null, target = null, onGrab = null, onDone = null } = {}) {
    const p = this.p;
    if (!p.anim?.has('Pickup') || p.mounted || p.swimming || !p.grounded) return false;
    if (target) p.turnTo?.(Math.atan2(target.x - p.pos.x, target.z - p.pos.z), 1, 50);
    if (object || onGrab || onDone) this.items.push({ object, onGrab, onDone, t: 0, grabbed: false });
    if (this.action !== 'Pickup') {
      this.apply(this.rule.update({ dt: 0, pickup: true, grounded: true, speed: 0 }));
      // Requests are edges; consuming the release allows another pickup later in the same session.
      this.rule.update({ dt: 0, pickup: false, grounded: true, speed: 0 });
    }
    return true;
  }

  reach(seconds = 0.8) {
    if (!this.p.anim?.has('CrouchReach')) return false;
    this.reachLeft = Math.max(this.reachLeft, seconds);
    return true;
  }

  clearItems() {
    for (const item of this.items) { item.object?.removeFromParent?.(); item.onDone?.(); }
    this.items.length = 0;
  }

  apply(state) {
    const p = this.p, a = p.anim;
    this.state = state;
    if (!state.active || !state.clip) {
      if (p.pose === this.clip) { p.pose = null; p.poseSpeed = 1; }
      if (this.action && a?.currentName === this.action) a.cancelOneShot();
      this.clip = this.action = null;
      this.lockLeft = 0;
      return;
    }
    if (state.once) {
      a.cancelOneShot();
      this.action = state.clip;
      this.lockLeft = Math.min(0.55, state.lockFor || 0);
      a.oneShotLocks = this.lockLeft > 0;
      a.once(state.clip, { fade: state.fade, then: 'Idle' });
    } else if (state.clip !== this.action) {
      if (this.action && a.currentName === this.action) a.cancelOneShot();
      this.action = null;
      if (!a.busy) a.play(state.clip, { fade: state.fade, speed: state.speed });
    }
    this.clip = state.clip;
    p.pose = state.clip;
    p.poseSpeed = state.speed || 1;
    // The player's mixer ran earlier this frame; sampling with dt=0 never advances it twice.
    a.update(0);
  }

  update(dt, { blocked = false, moving = false } = {}) {
    const p = this.p, input = { dt, speed: p.speed || 0, grounded: !!p.grounded, blocked };
    for (const want of this.requests.values()) {
      for (const name of ['creeping', 'kneel', 'waiting', 'reach']) if (want[name]) input[name] = true;
    }
    if (moving) input.speed = Math.max(0.3, input.speed);
    input.reach ||= this.reachLeft > 0;
    this.reachLeft = Math.max(0, this.reachLeft - dt);
    this.lockLeft = Math.max(0, this.lockLeft - dt);
    if (this.action && p.anim?.currentName === this.action) p.anim.oneShotLocks = this.lockLeft > 0;
    this.apply(this.rule.update(input));
    if (blocked || !this.state.active && this.items.length) this.clearItems();
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      item.t += dt;
      if (!item.grabbed && item.t >= 0.4) {
        item.grabbed = true;
        const grip = p.grip || p.model;
        if (item.object && grip) {
          grip.add(item.object);
          item.object.position.set(0, -0.03, 0.06);
          item.object.rotation.set(0, 0, 0);
        }
        item.onGrab?.();
      }
      if (item.t >= 1) { item.object?.removeFromParent?.(); item.onDone?.(); this.items.splice(i, 1); }
    }
    const lower = blocked ? 0 : this.state.cameraLower || 0;
    p.groundCameraLower = (p.groundCameraLower || 0) + (lower - (p.groundCameraLower || 0)) * (1 - Math.exp(-dt * 8));
  }

  debug() { return { ...this.state, lockLeft: this.lockLeft, reachLeft: this.reachLeft, items: this.items.length, requests: [...this.requests.keys()] }; }
}
