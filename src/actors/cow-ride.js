// Riding a cow. Feed a farm cow some hay from the haystack by her pasture and she is Mika's friend; then "Ride the cow"
// appears beside her. Mika hops up onto a straw-padded blanket and sits (her Sit clip) while the stick steers the cow:
// walk, hold to trot, hold on to gallop (a stamina bar drains, and fills again while walking, standing or grazing).
// "Moo!" calls out, and neighbours call back. Jump hops off; the cow is left where she stood and goes back to grazing.
//
// The cow is a farm animal (content/farm.js) whose own wandering is paused (`ridden`); this module moves her with the
// same ground, water and wall rules as Mika and poses Mika on the seat after every move (so there is no frame of lag).
// Nothing here is saved except the friendship (quest flags `cowBond:<id>`): a load never starts mounted.
import * as THREE from 'three';
import { WATER_Y, WORLD } from '../world/layout.js';
import { N_, tx } from '../i18n/i18n.js';
import { makeRig, removeRig, makeHaystack, SEAT, playGait, riderPose, riderClip, gaitFor, seatRider, ensureSeated } from './cow-rig.js';
import { RideCoachCard, icon, ensureCss } from './cow-help.js';
import { newRideCoach, stepRideCoach, skipRideStep, rideCoachDone, cowHintText } from '../game/tricks/rules-cowhelp.js';

const V3 = THREE.Vector3;
/** Speeds in metres per second at a kid's scale; stamina per second. */
export const RIDE = {
  walk: 3.5, trot: 8, gallop: 11, accel: 1.7, brake: 3.2,
  turnWalk: 2.6, turnFast: 1.35, radius: 0.7, height: 1.5, step: 0.46,
  wade: 0.55,                       // water deeper than this (m) is refused
  drainTrot: 0.12, drainGallop: 0.3, refillWalk: 0.14, refillStand: 0.3, refillGraze: 0.55, tired: 0.3,
  gallopAfter: 1.1,                 // seconds of holding before the trot becomes a gallop
};
/** The haystacks by the cows' pastures: where to take hay. */
export const HAY = [
  { id: 'kawabe', x: -41.5, z: 77.5, face: 0.4 },
  { id: 'takamori', x: 143.5, z: -4.5, face: 3.4 },
];
const LINES = [N_('Ride on, city girl!'), N_('Nice cow! Mind my cabbages, though.'), N_('Is that Mika on a COW? Wonderful!'), N_('Moo yourself, Mika!'), N_('Giddy-up, cow-girl!')];

const CSS = `
#cowUi{position:fixed;left:50%;bottom:calc(14px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:15;display:none;flex-direction:column;align-items:center;gap:8px;
 pointer-events:none;zoom:var(--ui-scale,1);font:700 14px Nunito,system-ui,sans-serif;color:#5a3a22}
#cowUi.on{display:flex}
#cowUi .row{display:flex;align-items:center;gap:8px}
#cowUi .en{display:flex;align-items:center;gap:6px;padding:4px 12px 4px 6px;border-radius:14px;background:#fff7e8e6;box-shadow:0 3px 12px rgba(40,20,0,.25)}
#cowUi .en .ic{display:flex;width:20px;height:20px}#cowUi .en .ic svg{width:20px;height:20px}
#cowUi .en .lb{min-width:44px;font:700 12px Nunito,sans-serif;white-space:nowrap}
#cowUi .en.low .lb{color:#c2541c}#cowUi .en.out .lb{color:#c0301c}
#cowUi .bar{width:min(190px,46vw);height:14px;border-radius:8px;background:#5a3a2222;overflow:hidden;position:relative}
#cowUi .bar i{position:absolute;left:0;top:0;bottom:0;width:100%;background:#7fcf6a;border-radius:8px;transform-origin:left;transition:background .2s}
#cowUi .bar.low i{background:#f0a040}
#cowUi .bar.out i{background:#e4584a}
#cowUi .help{pointer-events:auto;width:36px;height:36px;padding:0;border:0;border-radius:50%;background:#f08a3c;color:#fff;font:700 20px/36px Fredoka,Nunito,sans-serif;box-shadow:0 3px 0 #b8581c,0 4px 10px rgba(40,20,0,.3);touch-action:manipulation}
#cowUi .tip{padding:5px 12px;border-radius:12px;background:#fff7e8e6;box-shadow:0 3px 12px rgba(40,20,0,.2);max-width:min(440px,90vw);text-align:center}
#cowUi .legend{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 12px;padding:5px 12px;border-radius:14px;background:#fff7e8e6;box-shadow:0 3px 12px rgba(40,20,0,.2);font:700 12px Nunito,sans-serif}
#cowUi .legend span{display:inline-flex;align-items:center;gap:4px;border-radius:8px;padding:1px 3px}
#cowUi .legend .ch-kc{min-width:18px;padding:1px 5px;font-size:11px;border-bottom-width:3px}
#cowUi .legend span.hl{animation:cowHl .8s ease-in-out infinite}
#cowUi .btns{display:none;gap:10px;pointer-events:auto}
#cowUi.touch .btns{display:flex}
#cowUi.touch .legend{display:none}
#cowUi button.act{display:flex;align-items:center;justify-content:center;gap:6px;min-width:96px;min-height:60px;padding:6px 14px;border:0;border-radius:18px;font:700 17px Fredoka,Nunito,sans-serif;color:#fff;background:#f08a3c;box-shadow:0 4px 0 #b8581c,0 6px 14px rgba(40,20,0,.3);touch-action:none;user-select:none;-webkit-user-select:none}
#cowUi button.act svg{width:22px;height:22px;flex:none}
#cowUi button.moo{background:#4d9fd8;box-shadow:0 4px 0 #2a6a9a,0 6px 14px rgba(40,20,0,.3)}
#cowUi button.off{background:#8a7a68;box-shadow:0 4px 0 #5a4a3a,0 6px 14px rgba(40,20,0,.3)}
#cowUi button.on{transform:translateY(3px);filter:brightness(1.1)}
#cowUi button.hl{animation:cowHl .8s ease-in-out infinite}
@keyframes cowHl{0%,100%{transform:scale(1);box-shadow:0 0 0 0 #ffd08aaa}50%{transform:scale(1.08);box-shadow:0 0 0 8px #ffd08a00}}
#cowHint{position:fixed;left:0;top:0;z-index:13;display:none;pointer-events:none;padding:6px 12px;border-radius:14px;background:#fffdf6f4;box-shadow:0 4px 14px rgba(40,20,0,.3);border:2px solid #f08a3c;
 font:700 14px Nunito,system-ui,sans-serif;color:#4a3020;white-space:nowrap;will-change:transform}
#cowHint::after{content:"";position:absolute;left:50%;bottom:-9px;margin-left:-7px;border:7px solid transparent;border-top-color:#f08a3c;border-bottom:0}
@media (max-width:700px){#cowUi.touch{bottom:calc(150px + env(safe-area-inset-bottom,0px));left:auto;right:calc(12px + env(safe-area-inset-right,0px));transform:none;align-items:flex-end}#cowUi.touch .btns{flex-direction:column-reverse}#cowUi.touch .bar{width:84px}
 #cowUi.touch .en .lb{min-width:0;font-size:11px}
 #cowUi.touch .tip{position:fixed;left:calc(12px + env(safe-area-inset-left,0px));right:calc(130px + env(safe-area-inset-right,0px));top:calc(176px + env(safe-area-inset-top,0px));max-width:none;text-align:left}}
`;

const ZERO = new V3();
const LS = 'starline-cow-help';
const lsGet = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch { return {}; } };
const lsSet = o => { try { localStorage.setItem(LS, JSON.stringify({ ...lsGet(), ...o })); } catch { /* private mode */ } };

export class CowRide {
  constructor(director) {
    this.d = director;
    this.g = director.game;
    this.cow = null;         // the cow Mika sits on
    this.phase = null;       // 'mount' | 'ride' | 'dismount' | null
    this.hay = 0;            // armfuls of hay Mika carries (not saved)
    this.t = 0;
    this.v = 0;              // the cow's speed
    this.stamina = 1;
    this.hold = 0;
    this.btn = { gallop: false };
    this.graze = 0;
    this.seat = new THREE.Object3D();
    this.seat.name = 'cow-seat';
    this.rig = null;
    this.from = new V3();
    this.to = new V3();
    this.tipLeft = 0;
    this.dustT = 0;
    this.prevZoom = 0;
    this.warn = 0;
    this.coach = null;       // the free-ride coach's progress ({ step, ... } from rules-cowhelp) while its card is up
    this.fixes = 0;          // how many times the rider had to be put back on a ride clip (must stay 0)
    this.buildUi();
  }

  get riding() { return !!this.phase; }
  get st() { return this.d.q?.state; }
  ready() { return !!this.st && this.st.chapter >= 1 && !this.g.interiors?.active; }
  cows() { return this.d.wildlife?.farm?.filter(a => a.kind === 'cow') || []; }
  bonded(a) { return !!this.st?.flags[`cowBond:${a.id}`]; }
  /** Free to do something with a cow: nothing else owns Mika or the screen. */
  free() {
    const d = this.d, p = this.g.player;
    return this.ready() && !this.phase && !d.busy && !d.minigame && !d.scenes?.active && !d.tricks?.round && !d.yard?.round && !p.swimming && !p.mounted && p.grounded && !d.q.state.step.startsWith('c4.ride');
  }
  nearCow(reach = 3.4) {
    const p = this.g.player.pos;
    let best = null, bd = reach;
    for (const a of this.cows()) {
      if (!a.visible || a.far || a.ridden) continue;
      const d = Math.hypot(a.pos.x - p.x, a.pos.z - p.z);
      if (d < bd && Math.abs(a.pos.y - p.y) < 2.2) { bd = d; best = a; }
    }
    return best;
  }

  // ------------------------------------------------------------------ the world: haystacks and what Mika can do
  /** Stand the haystacks and register the three interactions. Called once by the director. */
  register() {
    const d = this.d, g = this.g;
    this.stacks = [];
    for (const h of HAY) {
      const y = g.world.heightAt(h.x, h.z);
      if (y < 0.8) continue;
      const m = makeHaystack();
      m.position.set(h.x, y, h.z);
      m.rotation.y = h.face;
      g.scene.add(m);
      g.colliders?.cylinder?.(h.x, h.z, 1.0, y, y + 1.5);
      this.stacks.push({ ...h, y, obj: m });
      d.interact(`hay:${h.id}`, new V3(h.x, y + 0.8, h.z), N_('Take some hay'), () => this.free() && this.hay < 1 && this.bond() !== 'all', () => this.takeHay(h), 3.4, null, 0.2);
    }
    d.interact('feedCow', null, N_('Feed the cow'), () => this.free() && this.hay > 0 && !!this.feedTarget(), () => this.feed(this.feedTarget()), 4, () => this.feedTarget()?.pos, 0.45, 3);
    d.interact('rideCow', null, N_('Ride the cow'), () => this.free() && !!this.rideTarget(), () => this.mount(this.rideTarget()), 4, () => this.rideTarget()?.pos, 0.5, 3);
  }
  /** 'all' once every cow in the valley is a friend (no more hay needed), else null. */
  bond() { return this.cows().length && this.cows().every(a => this.bonded(a)) ? 'all' : null; }
  feedTarget() { const a = this.nearCow(3.6); return a && !this.bonded(a) ? a : null; }
  rideTarget() { const a = this.nearCow(3.6); return a && this.bonded(a) ? a : null; }

  takeHay(target = null) {
    const d = this.d, p = this.g.player;
    this.hay = 1;
    const show = () => {
      if (!this.hay) return;
      this.hayBundle ??= makeHaystack();
      this.hayBundle.name = 'cow:hay-armful';
      this.hayBundle.scale.set(0.28, 0.18, 0.25);
      this.hayBundle.position.set(0, -0.08, 0.04);
      (p.grip || p.model).add(this.hayBundle);
      p.carry?.want('worn', 'cow-hay');
    };
    // Hay is owned instantly. An interrupted cosmetic bend still leaves the armful in her hands.
    if (!d.ground?.pickup({ target, onGrab: show, onDone: show })) { show(); p.gesture('Interact', { lock: false }); }
    d.audio.click();
    d.ui.toast(tx('A big armful of hay. Find a cow and feed her.'), 'cow-ride');
  }

  feed(a) {
    if (!a) return;
    const d = this.d, p = this.g.player, st = this.st;
    this.hay = 0;
    this.hayBundle?.removeFromParent();
    p.carry?.release('cow-hay');
    a.hold?.();
    a.lookAt(p.pos.x, p.pos.z);
    p.turnTo(Math.atan2(a.pos.x - p.pos.x, a.pos.z - p.pos.z), 1, 50);
    if (!d.ground?.reach()) p.gesture('Interact', { lock: false });
    a.farm.t = 4; a.farm.state = 'graze';
    if (a.anim?.has('Graze')) a.setIdle('Graze');
    d.audio.animal('cow', 0.8);
    d.audio.good();
    d.fx.burst(a.pos.clone().add(new V3(0, 1.4, 0)), { n: 18, color: [1, 0.55, 0.7], speed: 1.6, size: 0.22, gravity: -1.2 });
    st.flags[`cowBond:${a.id}`] = true;
    d.ui.toast(tx('She munches happily. Now she is your friend: she will carry you!'), 'cow-ride');
    d.save();
  }

  // ------------------------------------------------------------------ mounting
  mount(a) {
    if (!a || this.phase) return;
    const g = this.g, p = g.player;
    this.cow = a;
    a.ridden = true;
    a.hold?.();
    a.path = null;
    a.farm && (a.farm.state = 'ridden');
    a.anim?.cancelOneShot();
    a.setIdle('Idle');
    this.rig = makeRig(a.root);
    a.root.add(this.rig);
    this.seat.position.set(SEAT.x, SEAT.y, SEAT.z);
    a.root.add(this.seat);
    this.v = 0; this.stamina = 1; this.hold = 0; this.graze = 0; this.warn = 0;
    this.heading = a.facing;
    this.phase = 'mount';
    this.landed = false;
    this.t = 0;
    this.from.copy(p.pos);
    p.climb = null;
    p.vel.set(0, 0, 0);
    p.carry?.want('worn', 'cowride');
    p.anim?.once('Jump', { hold: true, fade: 0.08 });
    p.poseSpeed = 1;
    this.d.audio.click();
    this.showUi(true);
    this.hideHint();
  }

  seatWorld(out) {
    this.cow.root.updateMatrixWorld(true);
    return this.seat.getWorldPosition(out);
  }

  finishMount() {
    const p = this.g.player, a = this.cow;
    p.anim?.cancelOneShot();
    p.mounted = { obj: this.seat, offset: ZERO, facingOffset: 0 };
    p.pose = riderPose(p.anim);
    p.poseSpeed = 1;
    seatRider(p.anim, 'RideCow');                    // seated on the very frame the hop ends: no blend through standing
    p.speed = 0;
    this.phase = 'ride';
    this.prevZoom = this.g.follow.zoomTarget;
    this.g.follow.zoomTarget = Math.max(this.g.follow.zoomTarget, (this.g.camera.aspect || 1.7) < 0.9 ? 7.6 : 9.6);   // closer on a tall phone screen: the cow is narrow
    this.rode = true;
    // the first ride on this device teaches itself: three steps, each done by doing it ("?" brings it back any time)
    if (!lsGet().rideCoach) this.startCoach();
    else this.tip(this.d.ui.touch ? N_('Stick steers. Hold Gallop to trot, then run. Jump hops off.') : N_('Move to steer. Hold E or Shift to trot, hold on to gallop. M moos. Space hops off.'), 6);
    void a;
  }

  /** Hop off to the cow's right (or the first free side), leave her grazing. */
  dismount() {
    if (this.phase !== 'ride') return;
    const a = this.cow, p = this.g.player, w = this.g.world;
    const yaw = a.facing;
    let best = null;
    for (const side of [1, -1, 2.2]) {
      const sx = Math.cos(yaw) * (side > 2 ? -2.2 : side * 1.7), sz = -Math.sin(yaw) * (side > 2 ? -2.2 : side * 1.7);
      const x = a.pos.x + sx + (side > 2 ? Math.sin(yaw) * -1.2 : 0), z = a.pos.z + sz;
      const h = w.heightAt(x, z);
      if (WATER_Y - h > 0.5 && !w.frozen) continue;
      const r = this.g.colliders.resolve(x, z, 0.4, h, 1.4, 0.4);
      if (r.hit && Math.hypot(r.x - x, r.z - z) > 0.05) continue;
      best = [x, z, h];
      break;
    }
    if (!best) best = [a.pos.x - Math.sin(yaw) * 2, a.pos.z - Math.cos(yaw) * 2, w.heightAt(a.pos.x - Math.sin(yaw) * 2, a.pos.z - Math.cos(yaw) * 2)];
    this.from.copy(p.pos);
    this.to.set(best[0], Math.max(best[2], this.g.player.groundHeight(best[0], best[1], best[2] + 1)), best[1]);
    this.phase = 'dismount';
    this.t = 0;
    p.mounted = null;
    p.pose = null;
    p.poseSpeed = 1;
    p.anim?.once('Jump', { hold: true, fade: 0.08 });
    this.g.follow.zoomTarget = this.prevZoom || 6.2;
    this.d.audio.click();
    this.stopCoach(false);
  }

  release() {
    const a = this.cow, p = this.g.player;
    if (a) {
      removeRig(this.rig);
      a.root.remove(this.seat);
      if (a.root.parent !== this.g.scene) this.g.scene.add(a.root);
      a.ridden = false;
      a.path = null;
      // she stays where Mika got off: that spot is her pasture now (her old one may be across the valley), and she grazes there
      if (a.farm) { a.farm.t = 3; a.farm.state = 'idle'; a.farm.retarget = 0; a.farm.home = { x: a.pos.x, z: a.pos.z }; }
      a.setIdle(a.anim?.has('Graze') ? 'Graze' : 'Idle');
      a.anim?.cancelOneShot();
      a.anim?.play('Idle', { fade: 0.3 });
    }
    this.rig = null;
    this.cow = null;
    this.phase = null;
    this.v = 0;
    p.carry?.release('cowride');
    p.poseSpeed = 1;
    this.stopCoach(false);
    this.showUi(false);
    if (this.rode) lsSet({ rides: (lsGet().rides || 0) + 1 });
    // the first ride makes the friendship official once she is back on her own feet (the hello is a short scene)
    if (this.rode) { this.rode = false; this.d.meetFriend?.('cowpal'); }
  }

  /** Throw everything down at once (a trick started, a scene, a load): Mika on the ground, the cow free. */
  abort() {
    if (!this.phase) return;
    const p = this.g.player;
    p.mounted = null; p.pose = null; p.poseSpeed = 1;
    p.anim?.cancelOneShot();
    p.anim?.snap('Idle');                            // standing on the frame she leaves the seat, not a blend from sitting
    if (this.cow) { const s = this.cow.pos; p.teleport(s.x + 1.6, s.z, undefined, p.facing); }
    this.g.follow.zoomTarget = this.prevZoom || 6.2;
    this.release();
  }

  // ------------------------------------------------------------------ every frame (after the animals have moved)
  update(dt) {
    if (this.mooCd > 0) this.mooCd -= dt;
    if (this.tipLeft > 0) { this.tipLeft -= dt; if (this.tipLeft <= 0) this.setTip(''); }
    if (!this.phase) { this.updateHint(); return; }
    const g = this.g, p = g.player, a = this.cow, d = this.d;
    // anything that takes Mika away drops her where she is
    if (d.busy || d.scenes?.active || d.tricks?.round || g.interiors?.active || p.swimming || p.aiming) { this.abort(); return; }
    this.t += dt;
    if (this.phase === 'mount') {
      const k = Math.min(1, this.t / 0.65), e = k * k * (3 - 2 * k);
      this.seatWorld(this.to);
      p.pos.lerpVectors(this.from, this.to, e);
      p.pos.y += Math.sin(Math.PI * k) * 0.6;
      p.facing = a.facing;
      this.place(p);
      this.keepCow(dt, 0);
      // the hop ends already sitting: she lands in the saddle on a ride clip, never a frame standing on the cow's back
      if (k >= 0.8 && !this.landed) { this.landed = true; p.anim?.cancelOneShot(); p.pose = riderPose(p.anim); p.poseSpeed = 1; seatRider(p.anim, 'RideCow'); }
      if (k >= 1) this.finishMount();
      return;
    }
    if (this.phase === 'dismount') {
      const k = Math.min(1, this.t / 0.55), e = k * k * (3 - 2 * k);
      this.seatWorld(this.from);
      p.pos.lerpVectors(this.from, this.to, e);
      p.pos.y += Math.sin(Math.PI * k) * 0.55;
      this.place(p);
      this.keepCow(dt, 0);
      if (k >= 1) {
        p.anim?.cancelOneShot();
        p.teleport(this.to.x, this.to.z, this.to.y, a.facing + 1.2);
        this.release();
      }
      return;
    }
    this.ride(dt);
  }

  place(p) {
    p.root.position.copy(p.pos);
    p.root.rotation.y = p.facing;
  }

  /** Keep the cow's own clip and root consistent when she is not being steered (mounting, hopping off). */
  keepCow(dt, speed) {
    const a = this.cow;
    playGait(a.anim, speed, false, 0.25);
    a.root.position.copy(a.pos);
    a.root.rotation.y = a.facing;
  }

  ride(dt) {
    const g = this.g, p = g.player, a = this.cow, inp = g.input, d = this.d, w = g.world;
    // ---- what the rider asks for
    const mx = inp.move.x, my = inp.move.y, mag = Math.min(1, Math.hypot(mx, my));
    const yaw = g.follow.yaw;
    let dx = Math.sin(yaw) * my - Math.cos(yaw) * mx, dz = Math.cos(yaw) * my + Math.sin(yaw) * mx;
    const dl = Math.hypot(dx, dz);
    const holding = inp.held('sprint') || inp.held('act') || this.btn.gallop;
    if (inp.pressed('jump') || inp.pressed('back')) { this.dismount(); return; }
    if (this.mooReq) { this.mooReq = false; this.moo(); }

    // ---- stamina and gait
    const moving = this.v > 0.6;
    this.hold = holding && mag > 0.1 ? this.hold + dt : 0;
    let gait = 'walk';
    if (this.hold > 0 && this.stamina > (this.exhausted ? RIDE.tired : 0.02)) { gait = this.hold > RIDE.gallopAfter && this.stamina > 0.12 ? 'gallop' : 'trot'; this.exhausted = false; }
    if (this.stamina <= 0.01 && !this.exhausted) { this.exhausted = true; this.tip(N_('Puff, puff! The cow needs a rest. Walk, or stand and let her graze.'), 4); }
    if (gait === 'gallop') this.stamina -= RIDE.drainGallop * dt;
    else if (gait === 'trot') this.stamina -= RIDE.drainTrot * dt;
    else if (this.graze > 0.8) this.stamina += RIDE.refillGraze * dt;
    else if (!moving) this.stamina += RIDE.refillStand * dt;
    else this.stamina += RIDE.refillWalk * dt;
    this.stamina = Math.max(0, Math.min(1, this.stamina));
    if (this.stamina > RIDE.tired) this.exhausted = false;

    // ---- steering: turn toward the stick, limited; slow down while the nose swings round
    let want = 0;
    if (dl > 0.08 && mag > 0.08) {
      const target = Math.atan2(dx / dl, dz / dl);
      let diff = Math.atan2(Math.sin(target - this.heading), Math.cos(target - this.heading));
      const rate = (this.v > 6 ? RIDE.turnFast : RIDE.turnWalk) * (0.45 + 0.55 * Math.min(1, (this.v + 1.2) / 3.5));
      this.heading += Math.max(-rate * dt, Math.min(rate * dt, diff));
      diff = Math.atan2(Math.sin(target - this.heading), Math.cos(target - this.heading));
      const cap = gait === 'gallop' ? RIDE.gallop : gait === 'trot' ? RIDE.trot : RIDE.walk;
      want = (gait === 'walk' ? cap * Math.min(1, mag / 0.6) : cap) * Math.max(0.15, Math.cos(Math.min(1.4, Math.abs(diff))));
    }
    const exhaustedCap = this.exhausted ? RIDE.walk * 0.6 : Infinity;
    want = Math.min(want, exhaustedCap);
    this.v += (want - this.v) * (1 - Math.exp(-(want > this.v ? RIDE.accel : RIDE.brake) * dt));
    if (this.v < 0.05 && want === 0) this.v = 0;

    // ---- move with the ground rules of Mika: walls, steep slopes, deep water
    let blocked = false;
    const sx = Math.sin(this.heading), sz = Math.cos(this.heading);
    const total = this.v * dt, sub = Math.max(1, Math.ceil(total / 0.3));
    for (let i = 0; i < sub && total > 0; i++) {
      const step = total / sub;
      let nx = a.pos.x + sx * step, nz = a.pos.z + sz * step;
      nx = Math.min(WORLD.maxX - 1, Math.max(WORLD.minX + 1, nx)); nz = Math.min(WORLD.maxZ - 1, Math.max(WORLD.minZ + 1, nz));
      const hN = w.heightAt(nx, nz), hNow = w.heightAt(a.pos.x, a.pos.z);
      const deep = !w.frozen && WATER_Y - hN > RIDE.wade;
      const steep = hN > hNow + 0.04 && w.grid.slopeAt(nx, nz) > 36;
      const r = g.colliders.resolve(nx, nz, RIDE.radius, a.pos.y, RIDE.height, RIDE.step);
      const bumped = Math.hypot(r.x - nx, r.z - nz) > step * 0.5;
      if (deep || steep || bumped) { blocked = true; if (deep || steep) break; }
      a.pos.x = r.x; a.pos.z = r.z;
    }
    if (blocked) {
      // refuse gently: slow down and swing the nose away from the trouble
      this.v *= Math.exp(-dt * 6);
      this.heading += (dl > 0.08 ? 0.6 : 1.3) * dt * (this.turnAway ??= Math.random() < 0.5 ? 1 : -1);
      if (this.warn <= 0) { this.warn = 6; d.ui.toast(tx('Her hooves do not like deep water or steep rocks.'), 'cow-ride'); }
    } else this.turnAway = null;
    this.warn -= dt;
    let gy = w.heightAt(a.pos.x, a.pos.z);
    if (w.frozen && gy < WATER_Y + 0.06) gy = WATER_Y + 0.06;
    const c = g.colliders.groundAt(a.pos.x, a.pos.z, a.pos.y + 0.6, 0.6);
    if (c && c.y > gy) gy = c.y;
    a.pos.y += (gy - a.pos.y) * Math.min(1, dt * 14);
    // wading: the legs go in, the splash shows
    const wet = !w.frozen && gy < WATER_Y - 0.08 && this.v > 1.5;

    // ---- the picture: facing, gait, bob
    a.facing = a.targetFacing = this.heading;
    const phase = (this.cycle = (this.cycle || 0) + dt * (this.v > 0.4 ? Math.min(3.4, 0.5 + this.v * 0.42) / 1.2 : 0));
    const bob = this.v > 0.5 ? Math.abs(Math.sin(phase * Math.PI * 2)) * (0.015 + Math.min(this.v, RIDE.gallop) * 0.0055) : 0;
    a.root.position.set(a.pos.x, a.pos.y + bob * 0.5, a.pos.z);
    a.root.rotation.y = this.heading;
    a.root.rotation.x = Math.sin(phase * Math.PI * 2) * 0.012 * Math.min(1, this.v / 4);
    // grazing: stand still a moment and the cow lowers her head to eat (the stamina fills faster)
    if (this.v < 0.1 && want === 0) this.graze += dt; else this.graze = 0;
    if (this.v > 0.4) { const gb = playGait(a.anim, this.v); p.pose = riderClip(p.anim, gb?.rider); p.poseSpeed = gb ? Math.max(0.6, Math.min(1.4, this.v / gb.auth)) : 1; }
    else if (this.graze > 0.9 && a.anim?.has('Graze') && !a.anim.busy) a.anim.play('Graze', { fade: 0.4 });
    else if (this.graze <= 0.9 && !a.anim.busy) a.anim?.play('Idle', { fade: 0.3 });
    if (this.v <= 0.4) { p.pose = riderPose(p.anim); p.poseSpeed = 1; }
    // the rider's self-check: whatever else touched Mika's animator while she is mounted (a gesture still playing, an Idle), she sits
    if (ensureSeated(p.anim, p.pose, p.poseSpeed)) { this.fixes++; if (this.fixes <= 3) console.warn('[cow-ride] Mika was not on a ride clip: corrected'); }

    // ---- Mika on the seat, after the cow has moved
    a.root.updateMatrixWorld(true);
    this.rig?.userData.update();
    this.seat.getWorldPosition(p.pos);
    p.pos.y += bob * 0.5;
    p.facing = this.heading;
    p.speed = this.v;
    p.vel.set(0, 0, 0);
    p.grounded = true;
    this.place(p);
    p.lastSafe.copy(a.pos);

    // ---- dust, splashes, ui
    this.dustT -= dt;
    if (this.v > 5 && this.dustT <= 0) {
      this.dustT = gait === 'gallop' ? 0.08 : 0.14;
      d.fx.burst(a.pos.clone().add(new V3(-sx * 0.9, 0.12, -sz * 0.9)), wet ? { n: 6, color: [0.75, 0.88, 1], speed: 1.6, size: 0.25, gravity: 3 } : { n: 3, color: [0.82, 0.72, 0.5], speed: 0.8, size: 0.3, gravity: -0.6 });
    }
    this.writeUi(gait);
    this.coachTick(dt, { steering: mag > 0.1 && this.v > 0.8, holding: holding && mag > 0.1 && this.stamina > 0.02, mooed: !!this.mooedNow });
    this.mooedNow = false;
  }

  moo() {
    const d = this.d, a = this.cow;
    if (!a || this.mooCd > 0) return;
    this.mooCd = 1.6;
    this.mooedNow = true;
    d.audio.animal('cow', 1);
    if (this.v < 0.8 && a.anim?.has('Moo')) a.anim.once('Moo', { then: this.graze > 0.9 ? 'Graze' : 'Idle' });
    d.fx.burst(a.pos.clone().add(new V3(Math.sin(this.heading) * 1.1, 1.5, Math.cos(this.heading) * 1.1)), { n: 14, color: [1, 0.9, 0.5], speed: 1.8, size: 0.22, gravity: -0.8 });
    // the neighbours answer
    const B = d.barks;
    if (!B) return;
    let best = null, bd = 16;
    for (const [id, n] of d.barkSpeakers()) {
      const dist = n.pos.distanceTo(a.pos);
      if (dist < bd && B.clock.canSpeak(id)) { bd = dist; best = [id, n]; }
    }
    if (!best) return;
    const [id, n] = best;
    const text = tx(LINES[(this.lineAt = ((this.lineAt ?? -1) + 1 + Math.floor(Math.random() * 2)) % LINES.length)]);
    B.ui.show(id, text, out => { n.head(out); out.y += 0.3; return out; }, { name: '', life: B.clock.life });
    B.clock.spoke(id);
    if (!n.path) { n.lookAt(a.pos.x, a.pos.z); if (n.anim?.has?.('Wave') && !n.anim.busy) n.anim.once('Wave', { then: n.idleClip }); }
  }

  // ------------------------------------------------------------------ ui
  buildUi() {
    if (typeof document === 'undefined') { this.el = null; return; }
    ensureCss();
    if (!document.getElementById('cowUiCss')) {
      const s = document.createElement('style');
      s.id = 'cowUiCss';
      s.textContent = CSS;
      document.head.appendChild(s);
    }
    const root = document.createElement('div');
    root.id = 'cowUi';
    root.innerHTML = `<div class="tip"></div>
      <div class="row"><div class="en"><span class="ic">${icon('bolt')}</span><span class="lb"></span><div class="bar"><i></i></div></div><button class="help" type="button">?</button></div>
      <div class="legend"><span data-k="steer"><i class="ch-kc">WASD</i><b></b></span><span data-k="gallop"><i class="ch-kc">E</i><i class="ch-kc">Shift</i><b></b></span><span data-k="moo"><i class="ch-kc">M</i><b></b></span><span data-k="off"><i class="ch-kc">Space</i><b></b></span></div>
      <div class="btns"><button class="act off" type="button">${icon('hop')}<span></span></button><button class="act moo" type="button">${icon('moo')}<span></span></button><button class="act go" type="button">${icon('hoof')}<span></span></button></div>`;
    document.body.appendChild(root);
    const q = s => root.querySelector(s);
    this.el = { root, tip: q('.tip'), bar: q('.bar'), fill: q('.bar i'), en: q('.en'), enLb: q('.en .lb'), help: q('.help'), legend: q('.legend'), off: q('.off'), moo: q('.moo'), go: q('.go'), shown: false, fillW: -1, cls: '' };
    this.el.off.onclick = () => this.dismount();
    this.el.moo.onclick = () => { this.mooReq = true; };
    this.el.help.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (this.phase === 'ride') this.startCoach(); });
    const hold = on => e => { e.preventDefault(); this.btn.gallop = on; this.el.go.classList.toggle('on', on); };
    this.el.go.addEventListener('pointerdown', hold(true));
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) this.el.go.addEventListener(ev, hold(false));
    // the coach card, and the little "press E to ride" bubble that floats over the cow
    this.coachCard = new RideCoachCard(!!this.d.ui.touch, { onNext: () => this.coachNext(), onSkip: () => this.stopCoach(true) });
    const hint = document.createElement('div');
    hint.id = 'cowHint';
    document.body.appendChild(hint);
    this.hintEl = hint;
    this.refreshLabels();
  }

  refreshLabels() {
    if (!this.el) return;
    const e = this.el, set = (b, t) => { b.lastElementChild.textContent = tx(t); };
    set(e.off, N_('Hop off')); set(e.moo, N_('Moo!')); set(e.go, N_('Gallop'));
    e.help.setAttribute('aria-label', tx('How to ride'));
    e.legend.querySelector('[data-k=steer] b').textContent = tx('Steer');
    e.legend.querySelector('[data-k=gallop] b').textContent = tx('Gallop');
    e.legend.querySelector('[data-k=moo] b').textContent = tx('Moo!');
    e.legend.querySelector('[data-k=off] b').textContent = tx('Hop off');
    this.energyText = null;
  }

  showUi(on) {
    const e = this.el;
    if (!e || e.shown === on) return;
    e.shown = on;
    e.root.classList.toggle('on', on);
    e.root.classList.toggle('touch', !!this.d.ui.touch);
    if (on) { this.refreshLabels(); addEventListener('keydown', this.onKey ??= (ev => { if (ev.code === 'KeyM' || ev.code === 'KeyG') this.mooReq = true; })); }
    else { removeEventListener('keydown', this.onKey); this.btn.gallop = false; e.go.classList.remove('on'); this.setTip(''); }
  }

  tip(text, life = 5) { this.setTip(tx(text)); this.tipLeft = life; }
  setTip(text) {
    const e = this.el;
    if (!e || e.tipText === text) return;
    e.tipText = text;
    e.tip.textContent = text;
    e.tip.style.display = text ? '' : 'none';
  }

  writeUi(gait) {
    const e = this.el;
    if (!e) return;
    const w = Math.round(this.stamina * 100);
    if (w !== e.fillW) { e.fillW = w; e.fill.style.transform = `scaleX(${(w / 100).toFixed(2)})`; }
    const cls = this.exhausted ? 'bar out' : this.stamina < 0.3 ? 'bar low' : 'bar';
    if (cls !== e.cls) {
      e.cls = cls; e.bar.className = cls;
      e.en.classList.toggle('low', cls === 'bar low'); e.en.classList.toggle('out', cls === 'bar out');
      const text = cls === 'bar' ? tx('Energy') : tx('Low! Let her rest');
      if (text !== this.energyText) { this.energyText = text; e.enLb.textContent = text; }
    } else if (this.energyText == null) { this.energyText = tx('Energy'); e.enLb.textContent = this.energyText; }
    void gait;
  }

  // ------------------------------------------------------------------ the coach: three steps, learn by doing
  startCoach() {
    if (!this.coachCard?.el) return;
    this.coach = newRideCoach();
    this.setTip('');
    this.coachCard.step = -1;
    this.coachCard.show(true);
    this.coachCard.render(0, false);
    this.highlight(0);
  }
  coachNext() { if (this.coach) { skipRideStep(this.coach); this.afterCoachStep(); } }
  afterCoachStep() {
    const c = this.coach;
    if (!c) return;
    if (rideCoachDone(c)) {
      if (!c.closeIn) { c.closeIn = 5; this.coachCard.render(3, false); this.highlight(3); lsSet({ rideCoach: true }); }
      else this.stopCoach(true);                     // "Got it" on the closing line
      return;
    }
    this.coachCard.render(c.step, false);
    this.highlight(c.step);
  }
  stopCoach(remember) {
    if (remember) lsSet({ rideCoach: true });
    this.coach = null;
    this.coachCard?.show(false);
    this.highlight(-1);
  }
  /** The control the step is about pulses (the on-screen button on a phone, its key on a keyboard). */
  highlight(step) {
    const e = this.el;
    if (!e) return;
    e.go.classList.toggle('hl', step === 1);
    e.moo.classList.toggle('hl', step === 2);
    e.off.classList.toggle('hl', step === 2);
    e.legend.querySelector('[data-k=steer]').classList.toggle('hl', step === 0);
    e.legend.querySelector('[data-k=gallop]').classList.toggle('hl', step === 1);
    e.legend.querySelector('[data-k=moo]').classList.toggle('hl', step === 2);
    e.legend.querySelector('[data-k=off]').classList.toggle('hl', step === 2);
  }
  coachTick(dt, sig) {
    const c = this.coach;
    if (!c) return;
    if (c.closeIn) {                                   // the closing "Great riding!" line stays a few seconds
      c.closeIn -= dt;
      if (c.closeIn <= 0) this.stopCoach(true);
      return;
    }
    const wasDone = c.doneT > 0;
    const changed = stepRideCoach(c, dt, sig);
    if (changed) this.afterCoachStep();
    else if (!wasDone && c.doneT > 0) this.coachCard.render(c.step, true);      // done: a green tick, then on to the next step
  }

  // ------------------------------------------------------------------ the floating hint over a cow
  hideHint() { if (this.hintEl && this.hintShown) { this.hintShown = false; this.hintEl.style.display = 'none'; } }
  /** "Press E to ride" over a friend who is near (and "feed her" over a cow you carry hay for), until you have ridden a few times. */
  updateHint() {
    const el = this.hintEl;
    if (!el) return;
    let target = null, kind = 'ride';
    if (this.free() && !this.d.ui.dialogueOpen && (lsGet().rides || 0) < 3) {
      const p = this.g.player.pos;
      let best = 14;
      for (const a of this.cows()) {
        if (!a.visible || a.far || a.ridden) continue;
        const bonded = this.bonded(a);
        if (!(bonded || this.hay > 0)) continue;
        const dd = Math.hypot(a.pos.x - p.x, a.pos.z - p.z);
        if (dd < best) { best = dd; target = a; kind = bonded ? 'ride' : 'feed'; }
      }
      if (target) this.hintNear = best <= 3.6;
    }
    if (!target) { this.hideHint(); return; }
    const v = this.hv ??= new V3();
    v.set(target.pos.x, target.pos.y + 2.05, target.pos.z).project(this.g.camera);
    if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) { this.hideHint(); return; }
    const text = tx(cowHintText(kind, this.hintNear));
    if (text !== this.hintText) { this.hintText = text; el.textContent = text; }
    if (!this.hintShown) { this.hintShown = true; el.style.display = 'block'; }
    const x = (v.x * 0.5 + 0.5) * innerWidth, y = (-v.y * 0.5 + 0.5) * innerHeight;
    el.style.transform = `translate(${Math.round(x - el.offsetWidth / 2)}px,${Math.round(y - el.offsetHeight - 12)}px)`;
  }
}
