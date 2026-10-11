// Pure ground-pose decisions; callers own input, clip playback and instantaneous game events.
export const GROUND = Object.freeze({ walkSpeed: 0.6, pickupSeconds: 1, pickupGrab: 0.4, pickupLock: 0.55,
  reachSeconds: 0.8, sitDelay: 2.5, creepEnter: 1.02, creepLeave: 1.15, moveEnter: 0.18, moveLeave: 0.1 });

export class GroundPose {
  constructor({ has = () => true } = {}) { this.has = has; this.clear(); }

  clear() {
    this.clip = null; this.age = 0; this.idle = 0; this.low = false; this.walking = false;
    this.lastPickup = false; this.lastReach = false; this.action = null;
  }

  update({ dt = 0, speed = 0, creeping = false, pickup = false, reach = false, kneel = false,
    waiting = false, grounded = true, blocked = false } = {}) {
    dt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    speed = Number.isFinite(speed) ? Math.max(0, speed) : 0;
    const askPickup = pickup && !this.lastPickup, askReach = reach && !this.lastReach;
    this.lastPickup = !!pickup; this.lastReach = !!reach;
    this.age += dt;
    this.idle = waiting && speed < GROUND.moveLeave && grounded && !blocked ? this.idle + dt : 0;
    this.low = creeping && speed <= (this.low ? GROUND.creepLeave : GROUND.creepEnter);
    this.walking = speed > (this.walking ? GROUND.moveLeave : GROUND.moveEnter);
    let wanted = null, once = false;
    if (!grounded || blocked) { this.action = null; this.low = false; this.idle = 0; }
    else {
      if (askPickup && this.has('Pickup')) { this.action = 'Pickup'; this.age = 0; wanted = 'Pickup'; once = true; }
      else if (askReach && this.has('CrouchReach')) { this.action = 'CrouchReach'; this.age = 0; wanted = 'CrouchReach'; once = true; }
      else if (this.action) {
        const duration = this.action === 'Pickup' ? GROUND.pickupSeconds : GROUND.reachSeconds;
        const movable = this.action !== 'Pickup' || this.age >= GROUND.pickupLock;
        if (this.age >= duration || (this.walking && movable)) this.action = null;
        else wanted = this.action;
      }
      if (!wanted) {
        if (reach && !this.walking) wanted = 'CrouchReachHold';
        else if (kneel && !this.walking) wanted = 'Kneel';
        else if (this.low) wanted = this.walking ? 'CrouchWalk' : 'Crouch';
        else if (this.idle > GROUND.sitDelay) wanted = 'SitGrass';
      }
    }
    if (wanted && !this.has(wanted)) wanted = null;
    const changed = wanted !== this.clip;
    if (changed && !once) this.age = 0;
    this.clip = wanted;
    return { clip: wanted, active: !!wanted, changed, once,
      speed: wanted === 'CrouchWalk' ? Math.max(0.15, Math.min(1.8, speed / GROUND.walkSpeed)) : 1,
      fade: wanted === 'SitGrass' ? 0.45 : wanted === 'Pickup' ? 0.12 : 0.2,
      cameraLower: wanted === 'SitGrass' ? 0.55 : wanted ? 0.35 : 0,
      lockFor: wanted === 'Pickup' ? Math.max(0, GROUND.pickupLock - this.age) : 0,
      grabAt: GROUND.pickupGrab, age: this.age };
  }
}
