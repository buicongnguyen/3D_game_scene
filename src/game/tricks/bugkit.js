// What the two meadow tricks (hoppers.js, cricket.js) share: a picture of a bug (the artist's model, or a stand-in made of a
// few capsules until it lands), the net in Mika's right hand, the cage at her left hip, the creeping input, and the
// release at the end of a round, when the cage is opened and everything hops away.
import * as THREE from 'three';
import { Animator } from '../../actors/animator.js';
import { fit, trampleGrass } from './util.js';
import { tx } from '../../i18n/i18n.js';

/** "1 cricket" / "{n} crickets": the singular and the plural are two strings of their own (languages count differently). */
export const plural = (n, one, many) => (n === 1 ? tx(one) : tx(many, { n }));

const V3 = THREE.Vector3;
const SIZE = { grasshopper: 0.5, mantis: 0.65, cricket: 0.34 };         // metres, longest side (true bugs are a few cm: drawn about 7x larger, to read from the camera's 5 m)
const COLOUR = { grasshopper: ['#84b83a', '#5c8a26'], mantis: ['#79c04a', '#4d8c2c'], cricket: ['#4a3322', '#2b1d12'] };
const STAND_SCALE = 2.3;                                               // the cage on the grass is this much bigger than the cage on her hip
const HOP_CLIP = 0.66;                                                  // seconds of the Hop clip the round plays: 0.3 crouch + 0.36 leap

export const BUG_CSS = `
.bugBox{position:fixed;left:50%;top:calc(70px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:15;width:min(300px,82vw);padding:7px 12px 9px;border-radius:16px;
 background:rgba(255,247,232,.93);box-shadow:0 5px 16px rgba(40,20,0,.22);font:700 14px Nunito,system-ui,sans-serif;color:#5a3a22;text-align:center;zoom:var(--ui-scale,1);
 pointer-events:none;user-select:none;-webkit-user-select:none}
.bugBox .row{display:flex;gap:10px;justify-content:center;align-items:center}
.bugBox .cnt{display:flex;align-items:center;gap:5px;padding:2px 9px 2px 3px;border-radius:999px;background:#fff1cf;font:600 18px Fredoka,Nunito,sans-serif}
.bugBox .cnt img{width:28px;height:28px;border-radius:50%;background:#ffe9b8}
.bugBox .cnt .alt{display:none;font:700 12px Nunito,sans-serif;padding-left:6px}
.bugBox .cnt.noimg .alt{display:inline}
.bugBox .cnt.pop{animation:bugPop .35s}
.bugBox .lab{margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bugBox .bar{position:relative;height:12px;margin-top:4px;border-radius:6px;background:#ead9b8;overflow:hidden}
.bugBox .bar i{display:block;height:100%;width:0;border-radius:6px;background:#6cc24a}
.bugBox .bar i.mid{background:#f2b53a}.bugBox .bar i.hot{background:#e2572b}
.bugBox .bar b{position:absolute;top:0;bottom:0;width:2px;background:#5a3a22;opacity:.55}
@keyframes bugPop{40%{transform:scale(1.25)}}
@media (max-width:520px){.bugBox{width:min(205px,52vw);padding:6px 9px 8px;left:calc(12px + env(safe-area-inset-left,0px));transform:none;top:calc(64px + env(safe-area-inset-top,0px))}.bugBox .row{gap:6px}}
`;

// ------------------------------------------------------------------------------------------------ the input
/**
 * Creeping. Called every frame before Mika moves (ctx.beforeMove). Keyboard: she walks (1.9 m/s), Shift creeps (1 m/s).
 * Stick (touch or pad): the lower half of the stick creeps, the middle walks, the top runs; a held L3 (or Shift) creeps.
 * Returns nothing; `state.creeping` tells the round what it did.
 */
export function creepFilter(input, state = { creeping: false }) {
  return () => {
    const m = input.move, len = Math.hypot(m.x, m.y);
    const held = input.keys.has('sprint');
    state.creeping = held;
    if (len < 0.05) return;
    const analog = input.lastDevice === 'touch' || input.lastDevice === 'gamepad';
    const s = Math.min(1, len);
    let want;
    if (analog) want = held ? Math.min(s, 0.5) * 0.68 : s <= 0.5 ? s * 0.68 : s <= 0.85 ? 0.34 + (s - 0.5) / 0.35 * 0.25 : s;
    else want = held ? 0.3 : 0.58;
    state.creeping = want <= 0.36;
    m.x *= want / len; m.y *= want / len;
  };
}

/** Is the pad's action button (X, the one the game's 'act' uses) held? The game's input only reports its press, and the net needs the hold. */
export function padHeld() {
  const pads = typeof navigator !== 'undefined' ? navigator.getGamepads?.() : null;
  if (!pads) return false;
  for (const p of pads) if (p?.buttons?.[2]?.pressed) return true;
  return false;
}

// ------------------------------------------------------------------------------------------------ the bug
/** A few capsules in the right colours, standing in for a model that is not there yet (+Z is forward). */
function standIn(kind, size) {
  const [c1, c2] = COLOUR[kind];
  const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 });
  const body = mat(c1), dark = mat(c2), eye = new THREE.MeshStandardMaterial({ color: '#15110d', roughness: 0.3 });
  const own = [body, dark, eye], g = new THREE.Group(), k = size;
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => {
    own.push(geo);
    const o = new THREE.Mesh(geo, m);
    o.position.set(x * k, y * k, z * k); o.rotation.set(rx, ry, rz); o.castShadow = false;
    g.add(o);
    return o;
  };
  const cap = (r, l) => new THREE.CapsuleGeometry(r * k, l * k, 3, 6), ball = r => new THREE.SphereGeometry(r * k, 8, 6), stick = (w, l) => new THREE.BoxGeometry(w * k, l * k, w * k);
  if (kind === 'mantis') {
    add(cap(0.05, 0.5), body, 0, 0.58, 0.06, -0.3);                               // the long thorax, leaning back
    add(cap(0.07, 0.34), body, 0, 0.3, -0.18, Math.PI / 2 + 0.35);               // the abdomen
    const head = add(ball(0.07), body, 0, 0.9, 0.16); head.scale.set(1.5, 0.9, 0.9);
    add(ball(0.03), eye, -0.08, 0.92, 0.2); add(ball(0.03), eye, 0.08, 0.92, 0.2);
    for (const sx of [-1, 1]) {
      add(cap(0.02, 0.26), dark, sx * 0.07, 0.72, 0.22, 0.9);                       // the folded forelegs
      add(stick(0.025, 0.4), dark, sx * 0.07, 0.2, 0.0, 0.2, 0, sx * 0.25);
    }
  } else if (kind === 'grasshopper') {
    add(cap(0.11, 0.5), body, 0, 0.26, -0.1, Math.PI / 2);                          // the abdomen
    add(ball(0.12), body, 0, 0.28, 0.28);
    add(ball(0.1), body, 0, 0.3, 0.42);
    add(ball(0.035), eye, -0.07, 0.35, 0.46); add(ball(0.035), eye, 0.07, 0.35, 0.46);
    for (const sx of [-1, 1]) {
      add(stick(0.05, 0.4), dark, sx * 0.14, 0.25, -0.02, -0.5, 0, sx * 0.25);      // the big hind legs
      add(stick(0.02, 0.3), dark, sx * 0.04, 0.45, 0.62, -1.1);                     // the antennae
    }
  } else {
    add(cap(0.14, 0.45), body, 0, 0.18, -0.05, Math.PI / 2);
    add(ball(0.13), body, 0, 0.2, 0.38);
    add(ball(0.03), eye, -0.07, 0.25, 0.48); add(ball(0.03), eye, 0.07, 0.25, 0.48);
    for (const sx of [-1, 1]) {
      add(stick(0.04, 0.34), dark, sx * 0.14, 0.16, -0.08, -0.4, 0, sx * 0.35);
      add(stick(0.015, 0.7), dark, sx * 0.05, 0.4, 0.7, -1.2);
    }
  }
  return { group: g, own };
}

/** One bug on screen. kind: 'grasshopper' | 'mantis' | 'cricket'. Hidden until bound; pose() names what it is doing. */
export class Critter {
  constructor(assets, kind) {
    this.kind = kind;
    this.root = new THREE.Group();
    this.root.name = `bug:${kind}`;
    this.root.visible = false;
    this.own = [];
    this.anim = null;
    const m = assets?.has?.(kind) ? assets.clone(kind) : null;
    if (m) {
      fit(m, SIZE[kind]);
      m.traverse(o => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
      this.model = m;
      this.anim = m.userData.clips?.length ? new Animator(m) : null;
    } else {
      const s = standIn(kind, SIZE[kind]);
      this.model = s.group;
      this.own = s.own;
    }
    this.real = !!m;
    this.root.add(this.model);
    this.name = '';
    this.pt = 0;
    this.sway = Math.random() * 6;
  }

  /** Another colour for the rice-field grasshopper's body (the artist's material takes brown, golden or green; the stripe and shading stay). */
  tint(hex) {
    this.model.traverse(o => {
      if (!o.isMesh) return;
      const list = [o.material].flat().map(m => {
        if (m?.name !== 'Hopper body') return m;
        const c = m.clone();
        c.color.set(hex);
        this.own.push(c);
        return c;
      });
      o.material = Array.isArray(o.material) ? list : list[0];
    });
  }

  /** Does the artist's model have this clip? */
  has(clip) { return !!this.anim?.has(clip); }

  /** Start a pose (a named little action). `again` restarts a one-shot that is already on. */
  pose(name, again = false) {
    if (this.name === name && !again) return;
    this.name = name;
    this.pt = 0;
    const a = this.anim;
    if (!a) return;
    const clip = { idle: 'Idle', tired: 'Idle', crouch: 'Hop', hop: null, look: 'Look', lookr: 'LookR', threat: 'Threat', flee: 'Threat', walk: 'Walk', struggle: 'Struggle', strike: 'Strike', chirp: 'Chirp', sing: 'Sing' }[name];
    if (!clip || !a.has(clip)) return;
    a.cancelOneShot();
    if (name === 'crouch') a.once('Hop', { then: 'Idle', speed: (a.clips.get('Hop').duration || HOP_CLIP) / HOP_CLIP, fade: 0.08 });
    else if (name === 'look' || name === 'lookr' || name === 'chirp') a.once(clip, { then: 'Idle' });
    else if (name === 'threat' || name === 'flee') a.once('Threat', { hold: true, fade: 0.1 });   // the wings stay fanned while it flies off
    else if (name === 'strike') a.once('Strike', { then: 'Struggle', fade: 0.06 });
    else a.play(clip);
  }

  update(dt) {
    if (!this.root.visible) return;
    this.pt += dt;
    this.sway += dt;
    if (this.anim) { this.anim.update(dt); return; }
    // the stand-in has no clips: a few numbers stand in for them
    const m = this.model, t = this.pt;
    let sy = 1, sz = 1, rx = 0, rz = 0, ry = 0;
    switch (this.name) {
      case 'crouch': { const u = Math.min(1, t / 0.3); sy = 1 - 0.3 * u; sz = 1 + 0.15 * u; break; }
      case 'hop': case 'flee': rx = -0.35; sy = 1.1; break;
      case 'tired': sy = 0.82; break;
      case 'look': ry = Math.sin(t * 7) * 0.5 * Math.max(0, 1 - t / 0.8); break;
      case 'threat': rx = -0.7; sy = 1.15; break;
      case 'struggle': case 'strike': rz = Math.sin(t * 38) * 0.22; break;
      case 'chirp': sy = 1 + Math.sin(t * 60) * 0.04; break;
      default: sy = 1 + Math.sin(this.sway * 2) * 0.02; rz = this.kind === 'mantis' ? Math.sin(this.sway * 1.4) * 0.06 : 0;
    }
    m.scale.set(1, sy, sz); m.rotation.set(rx, ry, rz);
  }

  dispose() {
    this.root.removeFromParent();
    this.anim?.mixer?.stopAllAction?.();
    this.model.traverse(o => { if (o.isSkinnedMesh) o.skeleton?.dispose?.(); });
    for (const x of this.own) x.dispose();
  }
}

// ------------------------------------------------------------------------------------------------ the net
function plainNet() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#a8743c', roughness: 0.8 });
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.95, 6), wood);
  stick.position.y = 0.42;
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 5, 14), wood);
  hoop.position.y = 1.04;
  const bagMat = new THREE.MeshStandardMaterial({ color: '#f4f1e6', transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 1 });
  const bag = new THREE.Mesh(new THREE.ConeGeometry(0.155, 0.32, 10, 1, true), bagMat);
  bag.position.set(0, 1.04, -0.14); bag.rotation.x = -Math.PI / 2;
  g.add(stick, hoop, bag);
  g.userData.own = [wood, stick.geometry, hoop.geometry, bag.geometry, bagMat];
  return g;
}

/** The net in her right hand: upright at rest, raised while the button is held, swung with k from 0 to 1. */
export class NetRig {
  constructor(assets, player) {
    this.player = player;
    this.grip = player.grip || player.model;
    this.onBone = this.grip !== player.model;
    this.net = assets?.clone?.('bug-net') || plainNet();
    this.net.traverse(o => { if (o.isMesh) o.castShadow = true; });
    if (this.onBone) this.net.rotation.set(Math.PI, 0, 0); else this.net.position.set(-0.28, 0.75, 0.1);   // the artist's carry pose, as the firefly net
    this.rest = this.net.rotation.clone();
    this.grip.add(this.net);
    this.k = 0;
    this.bends = ['upperarm_R', 'forearm_R'].map(name => {
      const bone = player.model?.getObjectByName(name);
      return bone ? { bone, base: new THREE.Quaternion(), wrote: new THREE.Quaternion(), on: false } : null;
    });
  }

  pose(k) {
    const low = /^Crouch/.test(this.player.pose || this.player.anim?.currentName || '');
    // Preserve the crouched legs and torso: the sweep is only an arm overlay, sampled after the mixer.
    for (let i = 0; i < this.bends.length; i++) {
      const b = this.bends[i];
      if (!b) continue;
      if (b.on && b.bone.quaternion.equals(b.wrote)) b.bone.quaternion.copy(b.base);
      b.on = low && k > 0.002;
      if (b.on) { b.base.copy(b.bone.quaternion); b.bone.rotateX((i ? -0.45 : -1.05) * Math.sin(Math.PI * k)); b.wrote.copy(b.bone.quaternion); }
    }
    if (Math.abs(k - this.k) < 0.002) return;
    this.k = k;
    if (this.onBone) this.net.rotation.set(Math.PI + (-2.478 - Math.PI) * k, 1.281 * k, -0.626 * k);
    else this.net.rotation.set(this.rest.x + k * 0.9, this.rest.y, this.rest.z);
  }

  dispose() {
    this.net.removeFromParent();
    for (const x of this.net.userData.own || []) x.dispose();
  }
}

// ------------------------------------------------------------------------------------------------ the cage
function plainCage() {
  const g = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({ color: '#cfe9f7', transparent: true, opacity: 0.35, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false });
  const wood = new THREE.MeshStandardMaterial({ color: '#b98a54', roughness: 0.75 });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.2, 14, 1, true), glass);
  wall.position.y = 0.1;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.02, 14), wood);
  const lid = new THREE.Group();
  lid.name = 'lid';
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.025, 14), wood);
  cap.position.set(0.1, 0, 0);                                                 // hinged on its -x edge (the lid group sits there)
  lid.add(cap);
  lid.position.set(-0.1, 0.21, 0);
  g.add(wall, base, lid);
  g.userData.own = [glass, wood, wall.geometry, base.geometry, cap.geometry];
  return g;
}

/** The bug cage: hangs at her left hip while she plays; stands on the grass, lid open, for the release. */
export class Cage {
  constructor(assets, player) {
    this.player = player;
    const m = assets?.clone?.('bug-cage');
    this.fromModel = !!m;
    this.model = m || plainCage();
    if (m) fit(m, 0.22);
    // hang it by its top: the middle of the top at the origin, so it dangles from the hook
    const box = new THREE.Box3().setFromObject(this.model), c = box.getCenter(new V3());
    this.height = box.max.y - box.min.y;
    this.holder = new THREE.Group();
    this.holder.name = 'trick:bug-cage';
    this.inner = new THREE.Group();
    this.inner.add(this.model);
    this.model.position.set(-c.x, -box.max.y, -c.z);
    this.holder.add(this.inner);
    this.lid = this.model.getObjectByName('lid') || null;
    this.lidRest = this.lid ? this.lid.rotation.clone() : null;
    this.lidPos = this.lid ? this.lid.position.clone() : null;
    this.hips = player.model.getObjectByName('hips') || null;
    (this.hips || player.model).add(this.holder);
    this.holder.position.set(0.2, 0.0, -0.1);                                  // the left hip (the lantern hangs on the right one)
    this.onHip = true;
    this.model.traverse(o => { if (o.isMesh) o.castShadow = false; });
  }

  /** Lid open amount 0..1. */
  open(k) {
    if (!this.lid) { this.model.visible = k < 0.5; return; }
    // the lid's origin is the middle of its rim: it slides off to the side and tips over there
    this.lid.position.set(this.lidPos.x + 0.19 * k, this.lidPos.y + 0.05 * k, this.lidPos.z);
    this.lid.rotation.set(this.lidRest.x, this.lidRest.y, this.lidRest.z - 1.05 * k);
  }

  /**
   * Stand it on the ground at (x, z), turned to yaw. It is drawn about twice as big as it hangs (the bugs are drawn big
   * too) and the grass round it is trampled, or it would be lost among the blades.
   */
  stand(scene, world, x, z, yaw) {
    scene.add(this.holder);
    this.holder.scale.setScalar(STAND_SCALE);
    this.holder.position.set(x, world.heightAt(x, z) + this.height * STAND_SCALE, z);
    this.holder.rotation.set(0, yaw, 0);
    this.onHip = false;
    this.grassOff ??= trampleGrass(world, x, z, 1.9);
  }

  /** The top of the opening, in world space (where the bugs come out). */
  mouth(out) { return out.copy(this.holder.position).setY(this.holder.position.y + 0.04 * STAND_SCALE); }

  dispose() {
    this.grassOff?.();
    this.holder.removeFromParent();
    for (const x of this.model.userData.own || []) x.dispose();
    this.model.traverse(o => { if (o.isSkinnedMesh) o.skeleton?.dispose?.(); });
  }
}

// ------------------------------------------------------------------------------------------------ the release
const ease = u => u * u * (3 - 2 * u);
const _a = new V3(), _b = new V3();

/**
 * Open the cage and let everything go: each bug crouches, leaps out of the mouth, sits a moment on the grass, hops
 * away and shrinks into it. items: [{ critter, wait }]. update(dt) returns true when the last one has gone.
 */
export class Release {
  constructor(cage, items, world, rand) {
    this.cage = cage; this.world = world; this.t = 0;
    this.items = items.map((it, i) => {
      const mouth = cage.mouth(new V3()), a = rand() * Math.PI * 2;
      const r1 = 1 + rand() * 1.2, r2 = 2.2 + rand() * 1.6;
      const out = new V3(mouth.x + Math.sin(a) * r1, 0, mouth.z + Math.cos(a) * r1);
      const away = new V3(out.x + Math.sin(a + (rand() - 0.5)) * r2, 0, out.z + Math.cos(a + (rand() - 0.5)) * r2);
      out.y = world.heightAt(out.x, out.z); away.y = world.heightAt(away.x, away.z);
      return { c: it.critter, wait: it.wait ?? i * 0.2, mouth, out, away, st: 'wait', u: 0, a, kind: it.critter.kind };
    });
    this.lid = 0;
    for (const it of this.items) { it.c.root.visible = false; it.c.pose('idle'); }
  }

  update(dt) {
    this.t += dt;
    this.lid = Math.min(1, this.lid + dt * 2.5);
    this.cage.open(ease(this.lid));
    let live = 0;
    for (const it of this.items) {
      const c = it.c, r = c.root;
      if (it.st === 'gone') continue;
      live++;
      if (this.t < it.wait + 0.5) continue;                                     // the lid is opening first
      if (it.st === 'wait') { it.st = 'crouch'; it.u = 0; r.visible = true; r.position.copy(it.mouth); r.scale.setScalar(0.6); r.rotation.y = it.a; c.pose('crouch', true); }
      it.u += dt;
      const flyer = it.kind === 'mantis';
      if (it.st === 'crouch' && it.u >= (flyer ? 0.05 : 0.3)) { it.st = 'out'; it.u = 0; if (flyer) c.pose('flee'); }
      else if (it.st === 'out') {
        const k = Math.min(1, it.u / 0.45);
        r.position.lerpVectors(it.mouth, it.out, ease(k)); r.position.y += Math.sin(Math.PI * k) * 0.55;
        r.scale.setScalar(0.6 + 0.4 * k);
        r.rotation.y = it.a;
        if (k >= 1) { it.st = 'sit'; it.u = 0; c.pose('idle'); }
      } else if (it.st === 'sit' && it.u >= 0.5) { it.st = 'crouch2'; it.u = 0; c.pose('crouch', true); it.a += (Math.random() - 0.5) * 0.6; }
      else if (it.st === 'crouch2' && it.u >= (flyer ? 0.05 : 0.3)) { it.st = 'away'; it.u = 0; if (flyer) c.pose('flee'); }
      else if (it.st === 'away') {
        const k = Math.min(1, it.u / 0.55);
        _a.copy(it.out); _b.copy(it.away);
        r.position.lerpVectors(_a, _b, ease(k)); r.position.y += Math.sin(Math.PI * k) * 0.7;
        r.rotation.y = Math.atan2(it.away.x - it.out.x, it.away.z - it.out.z);
        r.scale.setScalar(1 - 0.85 * k);
        if (k >= 1) { it.st = 'gone'; r.visible = false; }
      }
      c.update(dt);
    }
    return live === 0;
  }
}
