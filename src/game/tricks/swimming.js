// A supervised, virtual swimming lesson. The pool and player controller exist only for this round.
// The small game distances/times are not a real swimming qualification or a breath-holding exercise.
//
// What this file owns: the temporary pool (one merged vertex-coloured mesh, a patterned water surface, lane ropes,
// ripples, droplets and bubbles: nine draw calls and one small data texture), Rin and a watching grown-up on the
// deck, Mika's body in the water (pitch, depth and a few bones bent after the mixer, so she really lies in a star
// float instead of crawling on the spot), the camera and the lesson panel. Everything is put back in `finally`.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { N_, tx, getLang } from '../../i18n/i18n.js';
import { NPC } from '../../actors/npc.js';
import { SwimLesson, SWIM, ropeFor } from './rules-swimming.js';
import { addCss, disposeRigs, trampleGrass } from './util.js';

// Local pool coordinates: +z is the exit (south) end, y = 0 is the ground under the pool.
// exit: the gold ring on the dry deck at the top of the steps. entry: where Mika stands hip-deep on the steps.
export const POOL = Object.freeze({ x: -22, z: 65, halfWidth: 4, halfLength: 7, apronX: 7, apronZ: 9,
  water: 1.3, deck: 1.42, floorTop: 0.16, stepsFrom: 5, stepsTo: 8, rope: 2.3,
  exit: Object.freeze({ x: 0, z: 8.4 }), entry: Object.freeze({ x: 0, z: 6.2 }) });

const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
/** Height of the walking line down the pool steps (pool floor at z <= stepsFrom, deck at z >= stepsTo). */
export function stepHeight(z) {
  return POOL.floorTop + clamp((z - POOL.stepsFrom) / (POOL.stepsTo - POOL.stepsFrom), 0, 1) * (POOL.deck - POOL.floorTop);
}

const STAGE = {
  check: N_('Find the safe exit'), entry: N_('Enter slowly'), bubbles: N_('Gentle bubbles'),
  float: N_('Float and recover'), tread: N_('Gentle treading'), glide: N_('Glide, kick and paddle'),
  turn: N_('Turn toward the exit'), swim: N_('Swim back to the exit'), out: N_('Climb out'), done: N_('Practice complete'),
};
const SAFETY = N_('Game practice only. In real water, learn with a qualified swimming teacher and a grown-up watching.');
const FEEDBACK = {
  release_to_continue: N_('Release the button before the next drill.'),
  normal_breath: N_('Bring Mika upright, release, and let her breathe normally before trying again.'),
  gentle_bubbles: N_('A gentle bubble cue, then release for air. No breath-holding contest.'),
  small_adjustments: N_('Keep the stick near the centre. Small, calm adjustments help Mika float.'),
  aim_marker: N_('Steer toward the marker while you tap a gentle stroke.'),
  release_and_rhythm: N_('Release between strokes. Tap with the slow pulse.'),
  slow_scull: N_('Slower, gentle taps. Let the pulse arrive before the next stroke.'),
  follow_rhythm: N_('Follow the slow pulse. You can try the rhythm again.'),
  inside_pool: N_('Stay inside the lane and steer back toward the marker.'),
  try_cue: N_('Try the instruction above. Take your time; Rin is here.'),
};

const CSS = `
body.swim-round #tAct,body.swim-round #tJump,body.swim-round #tDive,body.swim-round #tKite,body.swim-round #tAim,body.swim-round #tFire{display:none!important}
body.swim-round #toasts{visibility:hidden}
#swimLesson{position:fixed;inset:0;z-index:17;pointer-events:none;font:700 15px Nunito,system-ui,sans-serif;color:#234a56;user-select:none;-webkit-user-select:none}
#swimLesson .lesson{position:absolute;top:calc(68px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);width:min(440px,calc(100vw - 28px));box-sizing:border-box;padding:9px 16px 10px;border-radius:20px;background:rgba(245,255,253,.95);box-shadow:0 5px 18px #1234;text-align:center}
#swimLesson .step{font:700 12px Nunito,system-ui,sans-serif;letter-spacing:.02em;color:#4f8590;margin:0 0 1px}
#swimLesson .cue{font:600 21px/1.2 Fredoka,Nunito,sans-serif;margin:0 0 4px;color:#a34920}
#swimLesson .instruction{font-size:14px;line-height:1.3;color:#234a56}
#swimLesson .track{height:8px;border-radius:20px;background:#bddad5;overflow:hidden;margin:8px 0 2px}
#swimLesson .progress{height:100%;width:0;background:#3caa82;border-radius:20px}
#swimLesson .rhythm{height:20px;position:relative;background:#dceee6;border-radius:20px;margin:7px 0 2px;overflow:hidden}
#swimLesson .zone{position:absolute;right:0;top:0;width:24%;height:100%;background:#87cba8}
#swimLesson .pulse{position:absolute;left:0;top:2px;width:16px;height:16px;border-radius:50%;background:#bb602b;transform:translateX(-50%)}
#swimLesson .rhythm.late .zone{background:#bdd1ce}#swimLesson .rhythm.late .pulse{background:#778d8b}
#swimLesson .feedback{font-size:13px;line-height:1.3;color:#a34920;margin-top:5px}
#swimLesson .controls{font-size:12px;color:#5b787a;margin-top:5px}
#swimLesson .safe{position:absolute;left:50%;bottom:calc(12px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);max-width:min(650px,calc(100vw - 32px));width:max-content;padding:5px 10px;border-radius:12px;background:#eefbf7e8;text-align:center;font-size:11px;line-height:1.3}
#swimLesson button{pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;cursor:pointer;border:0;font:800 16px Nunito,system-ui,sans-serif;min-height:56px;padding:10px 16px;border-radius:18px;box-shadow:0 4px 0 #174e5e;background:#27889b;color:#fff}
#swimLesson .act{position:absolute;right:calc(24px + env(safe-area-inset-right,0px));bottom:calc(92px + env(safe-area-inset-bottom,0px));width:132px;max-width:35vw;min-height:72px}
#swimLesson .act.held{background:#bf672b;transform:translateY(3px);box-shadow:0 1px 0 #713d1b}
#swimLesson .leave{position:absolute;right:calc(24px + env(safe-area-inset-right,0px));bottom:calc(184px + env(safe-area-inset-bottom,0px));min-height:44px;min-width:72px;font-size:13px;background:#edf8f2;color:#325955;box-shadow:0 3px 0 #c1d9d3}
@media(max-width:560px){#swimLesson .lesson{top:calc(112px + env(safe-area-inset-top,0px));padding:8px 12px 9px}#swimLesson .cue{font-size:19px}#swimLesson .instruction{font-size:13px}#swimLesson .feedback{font-size:12px}#swimLesson .safe{font-size:10px}#swimLesson .leave{bottom:calc(181px + env(safe-area-inset-bottom,0px))}}
@media(max-height:540px){#swimLesson .lesson{left:18px;transform:none;width:310px;top:70px;font-size:12px}#swimLesson .safe{left:16px;transform:none;max-width:65vw}#swimLesson .instruction{font-size:12px}#swimLesson .cue{font-size:17px}}
`;

/** Shared input mapping includes the existing pad X hold, which Input stores separately from keyboard keys. */
export function swimInput(input, pointerHeld = false) {
  const enabled = input.enabled !== false;
  return { act: enabled && !!(pointerHeld || input.held?.('act') || input._gp?.act || input.pressed?.('act')),
    mx: enabled ? input.move?.x || 0 : 0, mv: enabled ? -(input.move?.y || 0) : 0 };
}

/**
 * Own only this instance's update. Restores absent/inherited properties as well as explicit values.
 * afterPose(dt) runs after the animation mixer each frame (the swim poses bend a few bones on top of the clip).
 */
export function takeSwimmer(player, afterPose = null) {
  const fields = ['facing', 'swimming', 'pitch', 'speed', 'grounded', 'locked', 'pose', 'poseSpeed'];
  const descriptors = new Map(['update', ...fields].map(k => [k, Object.getOwnPropertyDescriptor(player, k)]));
  const vectors = ['pos', 'vel'].map(k => [k, player[k].clone()]);
  const rootPos = player.root.position.clone(), rootRot = player.root.rotation.clone(), pivotRot = player.pivot.rotation.clone();
  const anim = player.anim, oldClip = anim?.currentName, oldTime = anim?.current?.time || 0;
  const oldSpeed = anim?.current?.timeScale || 1;
  const oldOneShot = anim?.oneShot, oldLocks = anim?.oneShotLocks;
  const oldLoop = anim?.current?.loop, oldRepeats = anim?.current?.repetitions, oldClamp = anim?.current?.clampWhenFinished;
  let restored = false;
  anim?.cancelOneShot?.();
  player.swimming = false; player.grounded = true; player.locked = true; player.vel.set(0, 0, 0);
  player.update = dt => {
    player.root.position.copy(player.pos); player.root.rotation.y = player.facing;
    player.pivot.rotation.x = player.pitch;
    anim?.play(player.pose || 'Idle', { speed: player.poseSpeed ?? 1, fade: 0.25 }); anim?.update(dt);
    afterPose?.(dt);
  };
  return () => {
    if (restored) return;
    restored = true;
    for (const [k, value] of vectors) player[k].copy(value);
    player.root.position.copy(rootPos); player.root.rotation.copy(rootRot); player.pivot.rotation.copy(pivotRot);
    for (const [k, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(player, k, descriptor); else delete player[k];
    }
    if (oldClip) {
      // snap() stops every action and poses the skeleton from the clip again: the bones bent for the floats go with it
      anim?.snap?.(oldClip, { speed: oldSpeed, time: oldTime });
      if (oldOneShot) {
        anim.current?.setLoop?.(oldLoop, oldRepeats);
        if(anim.current)anim.current.clampWhenFinished=oldClamp;
        anim.oneShot=oldOneShot;anim.oneShotLocks=oldLocks;
      }
    }
  };
}

/**
 * Mika has Swim and Tread clips but no floats. The floats are the Idle clip laid flat by the hip pivot, with the arms
 * and legs opened by hand after the mixer has run (the mixer writes every bone again next frame, so nothing has to be
 * remembered or put back; it works on Low's merged skin too: the bones are there either way).
 * want: { back, front, dip } weights 0..1; apply(dt) eases toward them and bends the bones.
 */
export function makeSwimPose(player) {
  const model = player.model, bone = name => model?.getObjectByName?.(name) || null;
  const B = model ? { uaL: bone('upperarm_L'), uaR: bone('upperarm_R'), faL: bone('forearm_L'), faR: bone('forearm_R'),
    thL: bone('thigh_L'), thR: bone('thigh_R'), shL: bone('shin_L'), shR: bone('shin_R'), head: bone('head'), spine: bone('spine') } : null;
  const want = { back: 0, front: 0, dip: 0 }, now = { back: 0, front: 0, dip: 0 };
  let time = 0;
  return { want, now,
    apply(dt) {
      time += dt;
      const k = 1 - Math.exp(-dt * 5);
      now.back += (want.back - now.back) * k; now.front += (want.front - now.front) * k; now.dip += (want.dip - now.dip) * k;
      if (!B) return;
      const b = now.back, f = now.front, d = now.dip, sway = Math.sin(time * 1.3);
      if (b > 0.01) {
        // star float on her back: arms out to the sides, legs a little apart, everything loose and slowly drifting
        // (arm and leg bones point down their own -Y with Z to her back: -Z swings a left limb outward, +Z a right one)
        B.uaL?.rotateZ(-b * (1.05 + 0.07 * sway)); B.uaR?.rotateZ(b * (1.05 - 0.07 * sway));
        B.faL?.rotateZ(-b * 0.18); B.faR?.rotateZ(b * 0.18);
        B.thL?.rotateZ(-b * (0.24 + 0.03 * sway)); B.thR?.rotateZ(b * (0.24 - 0.03 * sway));
        B.head?.rotateX(-b * 0.12);
      }
      if (f > 0.01) {
        // front float: arms reach ahead past her ears, legs trail, face down in the water
        B.uaL?.rotateZ(f * (0.55 + 0.05 * sway)); B.uaR?.rotateZ(-f * (0.55 - 0.05 * sway));
        B.uaL?.rotateX(-f * 3.0); B.uaR?.rotateX(-f * 3.0);
        B.thL?.rotateZ(-f * 0.22); B.thR?.rotateZ(f * 0.22);
        B.head?.rotateX(f * 0.25);
      }
      if (d > 0.01) { B.head?.rotateX(d * 0.2); B.spine?.rotateX(d * 0.08); }   // mouth to the water, eyes above it
    } };
}

function makeUi(ctx) {
  addCss('swimCss', CSS);
  const el = document.createElement('div'); el.id = 'swimLesson';
  el.innerHTML = '<section class="lesson"><div class="step"></div><div class="cue" aria-live="polite"></div><div class="instruction"></div><div class="track"><div class="progress"></div></div><div class="rhythm"><i class="zone"></i><i class="pulse"></i></div><div class="feedback"></div><div class="controls"></div></section><button class="leave"></button><button class="act"></button><div class="safe"></div>';
  document.body.append(el); document.body.classList.add('swim-round');
  const nodes = Object.fromEntries(['step', 'instruction', 'cue', 'progress', 'rhythm', 'zone', 'pulse', 'feedback', 'controls', 'safe', 'leave', 'act'].map(c => [c, el.querySelector(`.${c}`)]));
  nodes.title = nodes.step; nodes.safe.textContent = tx(SAFETY); nodes.leave.textContent = tx('Leave');
  let held = false, pointer = null;
  const listeners = [];
  const on = (target, name, fn, options) => { target.addEventListener(name, fn, options); listeners.push(() => target.removeEventListener(name, fn, options)); };
  const release = () => { held = false; pointer = null; nodes.act.classList.remove('held'); };
  on(nodes.act, 'pointerdown', e => {
    if (e.button !== 0 || pointer !== null) return;
    e.preventDefault(); pointer = e.pointerId; held = true; nodes.act.classList.add('held');
    nodes.act.setPointerCapture?.(pointer);
  });
  const end = e => { if (e.pointerId === pointer) { e.preventDefault(); release(); } };
  on(nodes.act, 'pointerup', end); on(nodes.act, 'pointercancel', end); on(nodes.act, 'lostpointercapture', release);
  on(nodes.leave, 'click', () => { release(); ctx.quit = true; });
  on(window, 'blur', release); on(window, 'pagehide', release); on(window, 'mobile-game-interruption', release);
  on(document, 'visibilitychange', () => { if (document.hidden) release(); });
  on(window, 'resize', release);
  return { nodes, get held() { return held; }, release,
    destroy() { release(); listeners.forEach(f => f()); el.remove(); document.body.classList.remove('swim-round'); } };
}

/** A small tileable caustic pattern (light net on pool blue). Built from numbers: no canvas, so it also runs headless. */
function waterTexture(size = 128) {
  const data = new Uint8Array(size * size * 4), TAU = Math.PI * 2;
  const ridge = v => Math.pow(1 - Math.abs(Math.sin(Math.PI * v)), 5);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const u = i / size, v = j / size;
    const a = u * 3 + 0.32 * Math.sin(TAU * (v * 2 + 0.1)) + 0.14 * Math.sin(TAU * (u + v) * 3);
    const b = v * 3 + 0.32 * Math.sin(TAU * (u * 2 + 0.35)) + 0.14 * Math.sin(TAU * (u - v) * 2);
    const c = (u + v) * 2 + 0.3 * Math.sin(TAU * (u * 2 - v));
    const line = Math.min(1, Math.max(ridge(a), ridge(b)) * 0.95 + ridge(c) * 0.35);
    const o = (j * size + i) * 4;
    data[o] = 50 + line * 118; data[o + 1] = 172 + line * 60; data[o + 2] = 214 + line * 30; data[o + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

const RIPPLES = 12, DROPS = 14, BUBBLES = 12;
const COACH = Object.freeze({ x: 2.3, z: 7.6, deckX: 5.05 });   // Rin's corner by the steps; her line along the east deck
// The pool floor stands this far above the highest ground under it: meadow flowers and tall grass stay below the tiles.
const LIFT = 0.75;
const NO_FOAM = new THREE.Color(0, 0, 0), FOAM = new THREE.Color(0.5, 0.56, 0.58);

/** Raised, calm pool on dry land. All geometry/materials here are owned by this round. rope: where the two lane ropes float
 *  (m from the middle; a level may narrow the lane); via: rings on the way back (pool coordinates), drawn while they wait. */
export function makePool(game, { rope = POOL.rope, via = [] } = {}) {
  const group = new THREE.Group(); group.name = 'swimming-practice';
  const floor = Math.max(...[-7, 0, 7].flatMap(x => [-9, 0, 9].map(z => game.world.heightAt(POOL.x + x, POOL.z + z)))) + LIFT;
  group.position.set(POOL.x, floor, POOL.z);
  const owned = [], keep = obj => (owned.push(obj), obj), solids = [];
  const paint = (geo, color) => {
    const c = new THREE.Color(color), a = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo;
  };
  const box = (x, y, z, w, h, d, color) => solids.push(paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color));
  /** A block standing on the buried base (so no edge of the raised platform ever shows a gap under it). */
  const block = (x0, x1, z0, z1, top, color, base = -LIFT - 1.2) => box((x0 + x1) / 2, (top + base) / 2, (z0 + z1) / 2, x1 - x0, top - base, z1 - z0, color);
  const D = POOL.deck, W = POOL.water, F = POOL.floorTop;
  const TILE = '#c9ecee', LINE = '#2f7fa8', WALL = '#63b9d2', BAND = '#2d82ad', COPING = '#d6cdbb', WOOD = '#d4b684', SEAM = '#b5935f', STEP = '#e6dfcd', GOLD = '#dfa032', RAIL = '#93a4ad';
  // pool shell: pale tiled floor with a dark swimming line, blue walls with a darker waterline band
  box(0, F / 2, 0, 8, F, 14, TILE);
  box(0, F + 0.006, -1.2, 0.3, 0.012, 8.8, LINE); box(0, F + 0.006, -5.75, 1.3, 0.012, 0.3, LINE); box(0, F + 0.006, 3.35, 1.3, 0.012, 0.3, LINE);
  for (const s of [-1, 1]) {
    box(s * 4.1, D / 2, 0, 0.2, D, 14.4, WALL); box(s * 3.985, W - 0.08, 0, 0.03, 0.34, 14, BAND);
    box(s * 2.75, D / 2, 7.1, 2.9, D, 0.2, WALL); box(s * 2.7, W - 0.08, 6.985, 2.6, 0.34, 0.03, BAND);
  }
  box(0, D / 2, -7.1, 8, D, 0.2, WALL); box(0, W - 0.08, -6.985, 8, 0.34, 0.03, BAND);
  // the deck is a solid timber platform (its sides reach into the ground), with plank seams and a pale stone coping
  block(-6.5, -4.2, -9, 9, D, WOOD); block(4.2, 6.5, -9, 9, D, WOOD);
  block(-4.2, 4.2, -9, -7.2, D, WOOD); block(-4.2, 4.2, 8, 9, D, WOOD);
  block(-4.2, -1.4, 7.2, 8, D, WOOD); block(1.4, 4.2, 7.2, 8, D, WOOD);
  for (let z = -8; z <= 8; z++) for (const s of [-1, 1]) box(s * 5.35, D + 0.003, z, 2.3, 0.006, 0.05, SEAM);
  for (let x = -3.5; x <= 3.5; x++) { box(x, D + 0.003, -8.1, 0.05, 0.006, 1.8, SEAM); if (Math.abs(x) > 1.6) box(x, D + 0.003, 8.5, 0.05, 0.006, 1, SEAM); }
  for (const s of [-1, 1]) { box(s * 4.2, D + 0.03, 0, 0.5, 0.06, 14.9, COPING); box(s * 2.9, D + 0.03, 7.2, 3.1, 0.06, 0.5, COPING); }
  box(0, D + 0.03, -7.2, 8.9, 0.06, 0.5, COPING);
  // steps down into the water (the lesson's walking line runs along their noses), each with a gold edge
  const TREADS = 6, run = (POOL.stepsTo - 0.08 - (POOL.stepsFrom + 0.42)) / TREADS;
  for (let i = 0; i < TREADS; i++) {
    const z0 = POOL.stepsFrom + 0.42 + i * run, top = stepHeight(z0 + run * 0.5);
    block(-1.3, 1.3, z0, z0 + run + 0.01, top, STEP, 0); box(0, top + 0.005, z0 + 0.05, 2.6, 0.01, 0.1, GOLD);
  }
  // handrails either side of the steps, and timber steps up to the deck from the meadow
  for (const s of [-1, 1]) {
    box(s * 1.5, D + 0.45, 8.2, 0.07, 0.9, 0.07, RAIL); box(s * 1.5, (D + 0.9 + 0.5) / 2, 6.35, 0.07, D + 0.4, 0.07, RAIL);
    box(s * 1.5, D + 0.9, 7.275, 0.07, 0.07, 1.92, RAIL);
  }
  for (let k = 1; k <= 6; k++) block(-1.3, 1.3, 9 + (k - 1) * 0.34, 9 + k * 0.34, D - k * 0.34, k % 2 ? SEAM : WOOD);
  const solidGeo = keep(mergeGeometries(solids)); solids.forEach(g => g.dispose());
  const solidMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  const solid = new THREE.Mesh(solidGeo, solidMat); solid.receiveShadow = true; solid.castShadow = true; group.add(solid);
  // water: the surface plus the notch over the steps; two drifting layers of one small pattern make it shimmer
  const sheet = new THREE.PlaneGeometry(8, 14).rotateX(-Math.PI / 2), notch = new THREE.PlaneGeometry(2.6, 0.8).rotateX(-Math.PI / 2).translate(0, 0, 7.4);
  for (const g of [sheet, notch]) { const p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 8, p.getZ(i) / 8); }
  const waterGeo = keep(mergeGeometries([sheet, notch])); sheet.dispose(); notch.dispose();
  const tex = keep(waterTexture()), tex2 = keep(tex.clone()); tex.repeat.set(2, 2); tex2.repeat.set(1.3, 1.3); tex2.needsUpdate = true;
  const waterMat = keep(new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.58, depthWrite: false }));
  const waterMat2 = keep(new THREE.MeshBasicMaterial({ map: tex2, transparent: true, opacity: 0.26, depthWrite: false }));
  const water = new THREE.Mesh(waterGeo, waterMat); water.position.y = W; water.renderOrder = 1; group.add(water);
  const water2 = new THREE.Mesh(waterGeo, waterMat2); water2.position.y = W + 0.004; water2.renderOrder = 2; group.add(water2);
  const matrix = new THREE.Matrix4(), color = new THREE.Color(), quat = new THREE.Quaternion(), vPos = new THREE.Vector3(), vScale = new THREE.Vector3();
  // lane ropes: red and cream floats, close enough to read as a rope
  const floatGeo = keep(new THREE.SphereGeometry(0.1, 8, 5).scale(1, 0.85, 1.35)), floatMat = keep(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }));
  const PER = 42, floats = new THREE.InstancedMesh(floatGeo, floatMat, PER * 2);
  for (let i = 0; i < PER * 2; i++) {
    const k = i % PER;
    matrix.makeTranslation(i < PER ? -rope : rope, W + 0.02, -6.62 + k * 0.28); floats.setMatrixAt(i, matrix);
    floats.setColorAt(i, color.set(Math.floor(k / 3) % 2 ? '#d9534a' : '#ebe5d6'));
  }
  group.add(floats);
  const exitMat = keep(new THREE.MeshBasicMaterial({ color: '#e59a2e' }));
  const exit = new THREE.Mesh(keep(new THREE.TorusGeometry(0.5, 0.07, 6, 28)), exitMat); exit.name = 'swim-exit'; exit.rotation.x = -Math.PI / 2; exit.position.set(POOL.exit.x, D + 0.04, POOL.exit.z); group.add(exit);
  const targetMat = keep(new THREE.MeshBasicMaterial({ color: '#d2434f' })), target = new THREE.Mesh(keep(new THREE.TorusGeometry(0.55, 0.08, 6, 28)), targetMat);
  target.name = 'swim-target'; target.rotation.x = -Math.PI / 2; target.position.set(SWIM.glide.x, W + 0.05, SWIM.glide.z); group.add(target);
  // the rings of the way back (Difficult): the same red ring, a little smaller, hidden until the swim back
  const rings = via.map(v => {
    const m = new THREE.Mesh(target.geometry, targetMat);
    m.name = 'swim-ring'; m.rotation.x = -Math.PI / 2; m.scale.setScalar(0.9); m.position.set(v.x, W + 0.05, v.z); m.visible = false; group.add(m);
    return m;
  });
  // ripples (flat foam rings that grow and fade away), droplets and mouth bubbles: three instanced meshes
  const overlay = { transparent: true, depthWrite: false };
  const ripples = new THREE.InstancedMesh(keep(new THREE.RingGeometry(0.9, 1, 28).rotateX(-Math.PI / 2)), keep(new THREE.MeshBasicMaterial({ color: '#ffffff', blending: THREE.AdditiveBlending, ...overlay })), RIPPLES);
  const drops = new THREE.InstancedMesh(keep(new THREE.SphereGeometry(0.045, 6, 4)), keep(new THREE.MeshBasicMaterial({ color: '#eaf8fb' })), DROPS);
  const bubbles = new THREE.InstancedMesh(keep(new THREE.SphereGeometry(0.045, 6, 4)), keep(new THREE.MeshBasicMaterial({ color: '#edffff', opacity: 0.85, ...overlay })), BUBBLES);
  ripples.renderOrder = 3; bubbles.renderOrder = 4; ripples.frustumCulled = drops.frustumCulled = bubbles.frustumCulled = false;
  const rip = new Float32Array(RIPPLES * 5).fill(0), drop = new Float32Array(DROPS * 7).fill(0); // x,z,age,life,size | x,y,z,vx,vy,vz,life
  matrix.makeScale(0, 0, 0);
  for (let i = 0; i < RIPPLES; i++) { ripples.setMatrixAt(i, matrix); ripples.setColorAt(i, NO_FOAM); }
  for (let i = 0; i < DROPS; i++) drops.setMatrixAt(i, matrix);
  for (let i = 0; i < BUBBLES; i++) bubbles.setMatrixAt(i, matrix);
  group.add(ripples, drops, bubbles);
  let ripNext = 0, dropNext = 0, seed = 1;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);   // looks only: the rules never see it
  const ripple = (x, z, size = 1, life = 1.5) => { const o = (ripNext++ % RIPPLES) * 5; rip[o] = x; rip[o + 1] = z; rip[o + 2] = 0; rip[o + 3] = life; rip[o + 4] = size; };
  const splash = (x, z, n = 5, power = 1) => {
    ripple(x, z, 0.9 * power, 1.1);
    for (let i = 0; i < n; i++) {
      const o = (dropNext++ % DROPS) * 7, a = rand() * Math.PI * 2, r = 0.5 + rand() * 0.7;
      drop[o] = x + Math.sin(a) * 0.15; drop[o + 1] = W + 0.03; drop[o + 2] = z + Math.cos(a) * 0.15;
      drop[o + 3] = Math.sin(a) * r * power; drop[o + 4] = (1.5 + rand() * 1.2) * power; drop[o + 5] = Math.cos(a) * r * power; drop[o + 6] = 1;
    }
  };
  const poolWorld = { heightAt: () => POOL.deck, quality: game.world.quality };
  const actor = (id, model, placement) => {
    const shared = new Set(), local = new Set();
    const assets = { clone(name) {
      const clone = game.assets.clone(name);
      clone?.traverse(o => { if (o.isMesh) for (const m of [o.material].flat()) shared.add(m); });
      return clone;
    } };
    const npc = new NPC(group, assets, poolWorld, id, model, placement);
    // Low-tier merging creates a palette per actor, but its merged geometry is cached across actors/rounds.
    // Skeleton cleanup alone leaks these materials on every replay. Missing-model placeholders are also local.
    npc.model.traverse(o => {
      if (!o.isMesh) return;
      for (const m of [o.material].flat()) if (!shared.has(m)) local.add(m);
      if (!npc.anim) local.add(o.geometry);
    });
    local.forEach(keep);
    return npc;
  };
  // Rin waits at the corner of the steps for the standing drills and walks the east deck beside her pupil for the
  // swims; the grown-up stands by the exit, where every shot can see her
  const coach = actor('swim-coach', 'rin', { x: COACH.x, z: COACH.z, facing: -Math.PI / 2 });
  const adult = actor('swim-watcher', 'villager-woman', { x: 4.6, z: 7.9, facing: -Math.PI / 2 });
  const grass = trampleGrass(game.world, POOL.x, POOL.z, 11);
  game.scene.add(group);
  let disposed = false, time = 0, cheer = 0, coachWalking = false, wake = 0;
  const face = (npc, x, z, dt) => {
    const want = Math.atan2(x - npc.pos.x, z - npc.pos.z), d = Math.atan2(Math.sin(want - npc.root.rotation.y), Math.cos(want - npc.root.rotation.y));
    npc.root.rotation.y += d * Math.min(1, dt * 6);
  };
  return { group, floor, waterY: floor + W, deckY: floor + D, target, rings, exit, coach, adult, ripple, splash,
    /** Both watchers cheer (a finished drill, the dry deck). */
    cheer() { if (cheer > 0) return; cheer = 1.6; coach.anim?.once('Cheer', { then: 'Idle' }); adult.anim?.once('Wave', { then: 'Idle' }); coachWalking = false; },
    /** s: { x, z, heading, wet, bubbles, front, speed, travel } in pool coordinates (travel: Mika is on a swim leg). */
    update(dt, s) {
      time += dt; cheer = Math.max(0, cheer - dt);
      tex.offset.set(time * 0.011, time * 0.017); tex2.offset.set(-time * 0.014, time * 0.009);
      // Rin keeps level with Mika along the deck
      const wantX = s.travel ? COACH.deckX : COACH.x, wantZ = s.travel ? clamp(s.z + 0.9, -6.4, 6.6) : COACH.z;
      const dx = wantX - coach.pos.x, dz = wantZ - coach.pos.z, gap = Math.hypot(dx, dz), walk = gap > (coachWalking ? 0.06 : 0.5) && cheer <= 0;
      if (walk) {
        const stride = Math.min(gap, 1.35 * dt) / gap;
        coach.pos.x += dx * stride; coach.pos.z += dz * stride; coach.root.position.x = coach.pos.x; coach.root.position.z = coach.pos.z;
        face(coach, coach.pos.x + dx, coach.pos.z + dz, dt);
      } else face(coach, s.x, s.z, dt);
      if (walk !== coachWalking && cheer <= 0) { coachWalking = walk; coach.anim?.play(walk ? 'Walk' : 'Idle', { speed: walk ? 0.8 : 1 }); }
      face(adult, s.x, s.z, dt);
      coach.anim?.update(dt); adult.anim?.update(dt);
      // a slow ring where she breaks the surface, a quicker wake while she travels
      if (s.wet) {
        wake -= dt * (1 + s.speed * 3);
        if (wake <= 0) { wake = 1.15; ripple(s.x, s.z, s.speed > 0.2 ? 0.75 : 0.95, 1.7); }
      }
      for (let i = 0; i < RIPPLES; i++) {
        const o = i * 5, life = rip[o + 3];
        if (life <= 0) continue;
        const age = (rip[o + 2] += dt), k = age / life;
        if (k >= 1) { rip[o + 3] = 0; matrix.makeScale(0, 0, 0); ripples.setMatrixAt(i, matrix); continue; }
        const r = rip[o + 4] * (0.3 + 0.9 * k);
        matrix.makeScale(r, 1, r).setPosition(rip[o], W + 0.012 + i * 0.0006, rip[o + 1]); ripples.setMatrixAt(i, matrix);
        ripples.setColorAt(i, color.copy(FOAM).multiplyScalar((1 - k) * (1 - k)));
      }
      ripples.instanceMatrix.needsUpdate = true; ripples.instanceColor.needsUpdate = true;
      for (let i = 0; i < DROPS; i++) {
        const o = i * 7;
        if (drop[o + 6] <= 0) continue;
        drop[o + 4] -= 7.5 * dt; drop[o] += drop[o + 3] * dt; drop[o + 1] += drop[o + 4] * dt; drop[o + 2] += drop[o + 5] * dt;
        if (drop[o + 1] < W) { drop[o + 6] = 0; matrix.makeScale(0, 0, 0); } else matrix.makeTranslation(drop[o], drop[o + 1], drop[o + 2]);
        drops.setMatrixAt(i, matrix);
      }
      drops.instanceMatrix.needsUpdate = true;
      bubbles.visible = !!s.bubbles;
      if (s.bubbles) {
        const ahead = s.front ? 0.5 : 0.24, mx = s.x + Math.sin(s.heading) * ahead, mz = s.z + Math.cos(s.heading) * ahead;
        for (let i = 0; i < BUBBLES; i++) {
          const age = (time * 1.3 + i * 0.19) % 1, size = 0.55 + age * 0.9;
          vPos.set(mx + Math.sin(i * 4.1) * 0.07 * (0.4 + age), W - 0.16 + age * 0.17, mz + Math.cos(i * 3.7) * 0.07 * (0.4 + age));
          matrix.compose(vPos, quat, vScale.setScalar(size)); bubbles.setMatrixAt(i, matrix);
        }
        bubbles.instanceMatrix.needsUpdate = true;
      }
      target.position.y = W + 0.05 + Math.sin(time * 3) * 0.03;
      for (let i = 0; i < rings.length; i++) rings[i].position.y = W + 0.05 + Math.sin(time * 3 + 1.3 + i) * 0.03;
    },
    dispose() {
      if (disposed) return; disposed = true;
      group.removeFromParent(); disposeRigs(coach.root); disposeRigs(adult.root);
      floats.dispose(); ripples.dispose(); drops.dispose(); bubbles.dispose(); owned.forEach(o => o.dispose?.()); grass?.();
    },
  };
}

/** Seconds since the last stroke, against the level's beat: 'first' (any tap starts it), 'wait', 'now' or 'late'. */
function pulseState(lesson) {
  if (lesson.lastStroke === null) return 'first';
  const age = lesson.time - lesson.lastStroke, r = lesson.rules;
  return age > r.beat + r.window ? 'late' : age >= r.beat - r.window ? 'now' : 'wait';
}
const PULSE_CUE = { first: N_('Tap gently now'), now: N_('Tap gently now'), late: N_('Tap once to restart the pulse') };

function instructions(phase, lesson, snap) {
  if (phase === 'check') return { text: N_('A grown-up is watching. Move to the gold exit ring on the dry deck, then press Action to check it.'), cue: N_('Move to the exit ring'), button: N_('Check exit') };
  if (phase === 'entry') return { text: N_('Walk slowly down the steps into the water. Press Action when you are ready.'), cue: N_('Walk down the steps'), button: N_('Begin practice') };
  if (phase === 'out' || phase === 'climbing') return { text: N_('You found the exit. Press Action to walk up the steps.'), cue: N_('Return to the dry deck'), button: N_('Climb out') };
  if (phase === 'done') return { text: N_('Mika is back on the dry deck. You practised all six game skills. Real swimming still needs a qualified teacher and supervision.'), cue: N_('Practice complete — safely out'), button: N_('Well done') };
  if (snap.stage === 'bubbles') {
    const release = lesson.held && lesson.holdTime >= 1.5;
    return { text: N_('Hold Action: Mika blows gentle bubbles. Let go: she breathes. Three times. You just breathe normally.'),
      cue: release ? N_('Release — normal breath') : lesson.airTime < lesson.rules.air ? N_('Normal breath — wait a moment') : lesson.held ? N_('Gentle bubbles…') : N_('Hold for gentle bubbles'), button: release ? N_('Release for air') : N_('Gentle bubbles') };
  }
  if (snap.stage === 'float') {
    if (lesson.floatMode === 'back') return { text: N_('Hold Action and Mika floats on her back. Keep still. Let go when the bar is full.'), cue: lesson.floatBack >= lesson.rules.floatSeconds ? N_('Release — recover upright') : N_('Back float — relax Mika'), button: N_('Relax Mika') };
    if (lesson.floatMode === 'front') return { text: N_('Now the front float: hold to float with gentle bubbles, let go for a breath. Fill the bar.'), cue: lesson.held && lesson.holdTime >= 1.5 ? N_('Release — normal breath') : lesson.airTime < lesson.rules.air ? N_('Normal breath — wait a moment') : N_('Short front float, then air'), button: N_('Front float') };
    return { text: N_('Mika stands up again. Press Action to go on.'), cue: N_('Upright recovery'), button: N_('Recover upright') };
  }
  const pulse = pulseState(lesson);
  if (snap.stage === 'tread') return { text: N_('Tap Action each time the dot reaches the green. Slow, steady taps keep her head up.'), cue: PULSE_CUE[pulse] || N_('Wait for the pulse'), button: N_('Gentle scull') };
  if (snap.stage === 'turn') return { text: N_('Turn Mika round to face the gold exit ring where she got in.'), cue: N_('Face the starting exit'), button: N_('Look for exit') };
  return { text: snap.stage === 'swim' ? lesson.viaIndex < lesson.rules.via.length ? N_('Swim through the two red rings, then to the gold exit. Tap Action when the dot reaches the green.')
    : N_('Steer back to the gold exit. Tap Action each time the dot reaches the green.') : N_('Steer toward the red ring. Tap Action each time the dot reaches the green.'),
    cue: PULSE_CUE[pulse] || N_('Steer and wait for the pulse'), button: N_('Gentle stroke') };
}

const cot=deg=>1/Math.tan(deg*Math.PI/180);
const shot=(fov,tilt,up,down,min)=>({fov,min,low:cot(tilt+down),ahead:cot(tilt),cover:cot(tilt-up)-cot(tilt+down)});
// Travel shots. tilt: degrees below the horizon; up/down: how far above/below the centre ray the usable picture reaches
// (the lesson panel hides the top, the safety line the bottom); min: lowest camera, which in portrait keeps both ropes in.
const SHOT={landscape:shot(50,50,7,22,4.6),portrait:shot(60,55,8,26,10.5)},VIEW_AHEAD=8.5;

/** Translate and write a text only when its source (or the language) changed: the panel is touched a few times a drill. */
const setText = (node, source, lang) => {
  if (node._src === source && node._lang === lang) return;
  node._src = source; node._lang = lang; node.textContent = source ? tx(source) : '';
};
const setStyle = (node, key, value) => { if (node.style[key] !== value) node.style[key] = value; };
/** A percentage style, written (and its text built) only when the rounded value moves: tenths = 1 keeps one decimal. */
const setPercent = (node, key, value, tenths = 0) => {
  const n = Math.round(value * (tenths ? 10 : 1));
  if (node['_' + key] === n) return;
  node['_' + key] = n; node.style[key] = `${tenths ? n / 10 : n}%`;
};

export default { id:'swimming', async play(ctx) {
  const g=ctx.game,p=ctx.player,input=ctx.input;
  let pool=null,ui=null,restorePlayer=null;
  const follow=g.follow, savedFov=follow.fovBase, savedYaw=follow.yaw, savedPitch=follow.pitch;
  const savedShot=follow.shot,savedTracking=follow.tracking;
  const savedLook=follow.look.clone(),savedPos=follow.pos.clone(),savedCameraPos=follow.camera.position.clone(),savedCameraRot=follow.camera.quaternion.clone();
  const savedCameraFov=follow.camera.fov,savedCameraNear=follow.camera.near;
  const savedSign=ctx.director.tricks.signs.find(s=>s.t.id==='swimming');
  const signVisible=savedSign?.obj?.visible,signHidden=savedSign?.hidden;
  let phase='check', phaseTime=0,total=0,exitCheck=false,entry=false,climbed=false,oldAct=false;
  const local={x:-3,z:8.2};
  // What is drawn this frame (one object, rewritten in place): the deck phases fill it by hand, the lesson from its rules.
  const view={heading:Math.PI/2,clip:'Idle',clipSpeed:1,wet:false,pitch:0,depth:1.03,side:'upright',bubbles:false,speed:0};
  const body={pitch:0,depth:1.03};          // eased, so a float tips over and a recovery stands up instead of snapping
  // the level comes from the picker (ctx.level); the guided first try has its own gentle numbers
  const lesson=new SwimLesson({level:ctx.level||'normal',first:ctx.first});
  let snap=lesson.snapshot(),exitWalk=0,slideX=0,slideZ=0,lessonEvent=0,sweep=0,score=0;
  const cameraPos=new THREE.Vector3(),cameraLook=new THREE.Vector3();
  const hidden=[],poolState={x:0,z:0,heading:0,wet:false,bubbles:false,front:false,speed:0,travel:false};
  const result=()=>{
    // all six drills but still in the water when the time ran out: the practised skills count, the dry exit does not
    const r=lesson.result(),points=climbed?r.score:r.skills*8;
    return {score:points,
      note:climbed?tx('You returned to the dry deck after all six game drills. Stars are game rewards.')
        :tx("You practised {skills}/6 game skills. Replay and take your time with Rin's cues.",{skills:lesson.skills}),
      detail:{complete:climbed,skills:lesson.skills,retries:lesson.retries,seconds:Math.round(total)}};
  };
  try {
    ctx.lock(true); ctx.director.ground?.release('trick',true);
    ctx.setNight(true,11); // The shared round-look override also supports daylight; frozen story clocks bypass hour gates.
    pool=makePool(g,{rope:ropeFor(lesson.level),via:lesson.rules.via}); ui=makeUi(ctx);
    const pose=makeSwimPose(p);
    restorePlayer=takeSwimmer(p,dt=>pose.apply(dt));
    if(savedSign) { savedSign.hidden=true; if(savedSign.obj)savedSign.obj.visible=false; }
    // Hide nearby unrelated actors only while they could walk through this temporary pool (looked for twice a second).
    const hideNearby=()=>{
      for(const o of g.scene.children) {
        if(o===pool.group || o===p.root || !/^(npc:|critter:|animal:)/.test(o.name))continue;
        if(Math.abs(o.position.x-POOL.x)<POOL.apronX+.5 && Math.abs(o.position.z-POOL.z)<POOL.apronZ+1.6 && !hidden.some(h=>h[0]===o))hidden.push([o,o.visible]);
      }
      for(const [o] of hidden)o.visible=false;
    };
    follow.fovBase=52;
    follow.track(()=>cameraPos,()=>cameraLook,5);
    input.releaseAll?.();
    ctx.debug={lesson, get phase(){return phase;}, get exitCheck(){return exitCheck;},get entered(){return entry;},get climbed(){return climbed;},
      get snapshot(){return snap;}, get local(){return {...local};}, pool:{x:POOL.x,z:POOL.z,floor:pool.floor,waterY:pool.waterY,deckY:pool.deckY,entryZ:POOL.entry.z,exit:POOL.exit,floatSeconds:lesson.rules.floatSeconds,glide:SWIM.glide,rope:ropeFor(lesson.level),via:lesson.rules.via},
      get pointerHeld(){return ui?.held || false;},get body(){return {...body,...pose.now};},pose,stageLabels:STAGE};
    const nodes=ui.nodes;
    const frame=dt=>{
      if(ctx.quit)return {score:0,quit:true};
      dt=Math.min(.1,Math.max(0,dt)); total+=dt;phaseTime+=dt;
      const controls=swimInput(input,ui.held),pressed=controls.act&&!oldAct;oldAct=controls.act;
      let cheer=false;
      if(phase==='check'||phase==='entry') {
        // dry deck, then down the steps: she wades (slower) once her feet are in the water
        const stick=Math.hypot(controls.mx,controls.mv),wading=local.z<7.75,pace=wading?1:1.6;
        local.x=clamp(local.x+controls.mx*pace*dt,phase==='check'?-3.4:-1,phase==='check'?1.6:1);
        local.z=clamp(local.z+controls.mv*pace*dt,phase==='check'?7.9:POOL.entry.z,8.8);
        if(stick>.1)view.heading=Math.atan2(controls.mx,controls.mv);
        view.clip=stick>.1?'Walk':'Idle';view.clipSpeed=wading?.7:1;view.wet=false;view.speed=stick>.1?pace:0;
        if(phase==='check'&&pressed&&Math.hypot(local.x-POOL.exit.x,local.z-POOL.exit.z)<.75){exitCheck=true;phase='entry';phaseTime=0;ctx.audio.good();}
        else if(phase==='entry'&&pressed&&local.z<=POOL.entry.z+.25){
          entry=true;phase='lesson';phaseTime=0;slideX=local.x-SWIM.start.x;slideZ=local.z-SWIM.start.z;
          body.depth=POOL.water-stepHeight(local.z);body.pitch=0;
          lesson.needsRelease=controls.act;ctx.audio.good();ctx.audio.splash?.(.25);pool.splash(local.x,local.z-.3,4,.7);ui.release();
        }
      } else if(phase==='lesson') {
        snap=lesson.step(dt,controls);
        // she pushes off the steps to the practice spot instead of jumping there
        const ease=Math.exp(-dt*1.8);slideX*=ease;slideZ*=ease;
        local.x=snap.position.x+slideX;local.z=snap.position.z+slideZ;
        const events=snap.events;
        for(;lessonEvent<events.length;lessonEvent++) {
          const ev=events[lessonEvent];
          if(ev.type==='skill')cheer=true;
          else if(ev.type==='good'&&ev.kind==='stroke'){ctx.audio.stroke?.();pool.splash(local.x+Math.sin(snap.heading)*.35,local.z+Math.cos(snap.heading)*.35,ev.stage==='tread'?3:5,ev.stage==='tread'?.7:1);}
          else if(ev.type==='good'&&ev.kind==='upright')pool.splash(local.x,local.z,4,.8);
          else if(ev.type==='good'&&ev.kind==='ring'){ctx.audio.good();pool.splash(local.x,local.z,5,.9);}
          else if(ev.type==='good')pool.ripple(local.x,local.z,1.3,1.4);
        }
        const side=snap.floatSide,travel=snap.clip==='Swim'&&side==='upright';
        view.side=side;view.heading=snap.heading;view.wet=true;view.bubbles=snap.bubbles;view.speed=lesson.speed;
        view.pitch=side==='back'?-1.42:side==='front'?1.45:travel?1.2:snap.bubbles?.18:.08;
        view.depth=side==='back'?.99:side==='front'?1.01:travel?.92:snap.bubbles?1.17:1.03;
        view.clip=side!=='upright'?'Idle':travel?'Swim':'Tread';
        view.clipSpeed=side!=='upright'?.5:travel?.45+snap.strokePulse*2.4:slideZ>.15?1.3:.85+snap.strokePulse*1.6;
        if(snap.bubbles&&Math.floor(total*3)!==Math.floor((total-dt)*3))ctx.audio.bubble?.();
        if(snap.complete){phase='out';phaseTime=0;ui.release();}
      } else if(phase==='out') {
        local.x=snap.position.x;local.z=snap.position.z;
        view.side='upright';view.bubbles=false;view.speed=0;view.pitch=0;view.depth=1.03;view.clip='Idle';view.clipSpeed=1;view.wet=true;view.heading=0;
        if(pressed){phase='climbing';phaseTime=0;ui.release();pool.splash(local.x,local.z+.3,4,.7);ctx.audio.splash?.(.2);}
      } else if(phase==='climbing') {
        exitWalk=Math.min(1,phaseTime/2.2);local.x=snap.position.x*(1-exitWalk);local.z=lerp(snap.position.z,POOL.exit.z-.1,exitWalk);
        view.wet=false;view.heading=0;view.clip='Walk';view.clipSpeed=local.z<7.75?.7:1;view.speed=1;
        if(exitWalk>=1){climbed=true;phase='done';phaseTime=0;view.clip='Idle';view.speed=0;cheer=true;}
      } else if(phase==='done') {
        view.clip='Idle';view.clipSpeed=1;view.heading=0;
        if(phaseTime>=1.6)return result();
      }
      if(cheer){ctx.audio.good();pool.cheer();}
      // body: ease the pitch and the depth; upright she stands on whatever is under her feet (the steps, near the exit)
      const wet=view.wet,k=1-Math.exp(-dt*4.5),ground=pool.floor+stepHeight(local.z);
      let y=ground;
      if(wet) {
        body.pitch+=(view.pitch-body.pitch)*k;body.depth+=(view.depth-body.depth)*k;
        const flat=Math.min(1,Math.abs(body.pitch)/1.1),afloat=pool.waterY-body.depth+Math.sin(total*2.1)*(.012+.02*flat);
        y=lerp(Math.max(afloat,ground),afloat,flat);
      } else { body.pitch=0;body.depth=POOL.water-stepHeight(local.z); }
      pose.want.back=wet&&view.side==='back'?1:0;pose.want.front=wet&&view.side==='front'?1:0;pose.want.dip=wet&&view.bubbles&&view.side==='upright'?1:0;
      p.pos.set(POOL.x+local.x,y,POOL.z+local.z);
      p.facing=view.heading;p.pitch=body.pitch;p.pose=view.clip;p.poseSpeed=view.clipSpeed;p.speed=view.speed;
      p.root.position.copy(p.pos);p.root.rotation.y=p.facing;p.pivot.rotation.x=p.pitch;
      const stage=phase==='lesson'?snap.stage:null;
      pool.target.visible=stage==='glide';
      for(let i=0;i<pool.rings.length;i++)pool.rings[i].visible=(stage==='turn'||stage==='swim')&&i>=lesson.viaIndex;
      poolState.x=local.x;poolState.z=local.z;poolState.heading=view.heading;poolState.wet=wet||(phase!=='check'&&phase!=='done'&&local.z<7.6);
      poolState.travel=stage==='glide'||stage==='turn'||stage==='swim';poolState.bubbles=wet&&view.bubbles;poolState.front=view.side==='front';poolState.speed=wet?view.speed:0;
      pool.update(dt,poolState);
      if((sweep-=dt)<=0){sweep=.5;hideNearby();}
      // ---- camera: always from the exit side or the open side, so pool-relative controls never reverse
      const portrait=innerHeight>innerWidth;
      const stationary=stage==='bubbles'||stage==='float'||stage==='tread';
      const overview=phase==='check'||phase==='entry';
      if(stationary) {
        // Close, from the far side of her: her face, the bubbles and the recovery, with Rin and the grown-up behind.
        // (high enough that the two heads on the deck clear the bottom of the lesson panel)
        follow.fovBase=portrait?58:50;
        if(portrait){cameraPos.set(POOL.x-1.4,pool.waterY+3.6,POOL.z+local.z-5.2);cameraLook.set(POOL.x+.6,pool.waterY+1.38,POOL.z+local.z);}
        else{cameraPos.set(POOL.x-2.4,pool.waterY+3.4,POOL.z+local.z-4.4);cameraLook.set(POOL.x+.95,pool.waterY+1.5,POOL.z+local.z+.3);}
      } else if(overview) {
        follow.fovBase=portrait?64:50;
        if(portrait){cameraPos.set(POOL.x,pool.waterY+10.5,POOL.z+17.5);cameraLook.set(POOL.x,pool.waterY+3.2,POOL.z+5.5);}
        else{cameraPos.set(POOL.x-.6,pool.waterY+5.6,POOL.z+15.2);cameraLook.set(POOL.x+.5,pool.waterY+2.2,POOL.z+6);}
      } else {
        // Travel: fit BOTH ends of the active leg (Mika and the ring she is aiming for) under the lesson panel, looking
        // steeply down so that a small swimmer far up the lane still reads as a whole body.
        // A whole 12 m leg in one picture makes her a speck, so the shot holds Mika and the next VIEW_AHEAD metres of lane:
        // the ring (out) or the gold steps (back) come into view after the first few strokes and stay there.
        const markerZ=stage==='glide'?SWIM.glide.z:stage==='turn'||stage==='swim'?POOL.stepsTo-.6:POOL.exit.z;
        const near=Math.min(Math.max(local.z,markerZ),local.z+VIEW_AHEAD),far=Math.max(Math.min(local.z,markerZ),local.z-VIEW_AHEAD),span=near-far;
        // SHOT: the look-down angle, then the cotangents of the lowest and highest usable rays (above the safety line,
        // below the panel), and how much pool one metre of camera height covers between them.
        const S=portrait?SHOT.portrait:SHOT.landscape,height=Math.max(S.min,(span+1.2)/S.cover),slack=height*S.cover-span;
        follow.fovBase=S.fov;
        const camZ=near+height*S.low+slack*.5;
        cameraPos.set(POOL.x,pool.waterY+height,POOL.z+camZ);cameraLook.set(POOL.x,pool.waterY,POOL.z+camZ-height*S.ahead);
      }
      // ---- lesson panel: every write below is skipped while its value stays the same
      const lang=getLang(),inst=instructions(stage||phase,lesson,snap);
      const stepNo=phase==='lesson'?snap.stageIndex+2:overview?1:8,name=STAGE[stage||phase]||STAGE.out;
      if(nodes.title._step!==stepNo||nodes.title._name!==name||nodes.title._lang!==lang){
        nodes.title._step=stepNo;nodes.title._name=name;nodes.title._lang=lang;
        nodes.title.textContent=tx('{step} · {name}',{step:`${stepNo}/8`,name:tx(name)});
      }
      setText(nodes.instruction,inst.text,lang);setText(nodes.cue,inst.cue,lang);setText(nodes.act,inst.button,lang);
      const feedback=phase==='lesson'?FEEDBACK[snap.feedback]||'':'';
      setText(nodes.feedback,feedback,lang);setStyle(nodes.feedback,'display',feedback?'block':'none');
      // the control reminder shows while she is on the deck; afterwards the button label and the cue say enough
      setText(nodes.controls,overview?input.lastDevice==='gamepad'?N_('Left stick moves · X is Action · B leaves'):ctx.ui.touch?N_('Left thumb moves · hold or tap the Action button'):N_('WASD / arrows move · E is Action · Backspace leaves'):'',lang);
      setStyle(nodes.controls,'display',overview?'block':'none');
      // one bar per task: the float fills once on her back and once on her front (never "release at halfway")
      const done=stage==='float'?lesson.floatMode==='back'?lesson.floatBack/lesson.rules.floatSeconds:lesson.floatMode==='front'?lesson.floatFront/lesson.rules.frontSeconds:1
        :phase==='lesson'?snap.progress:phase==='check'?0:phase==='entry'?clamp((8-local.z)/(8-POOL.entry.z),0,1):phase==='out'?0:exitWalk;
      setPercent(nodes.progress,'width',done*100);
      // the dot: a beat to tap on (tread and the two swims), or how long this bubble/float hold has lasted
      const beat=stage==='tread'||stage==='glide'||stage==='swim',holding=stage==='bubbles'||stage==='float'&&lesson.floatMode==='front';
      setStyle(nodes.rhythm,'display',beat||holding?'block':'none');
      if(beat) {
        const r=lesson.rules,full=r.beat+r.window,state=pulseState(lesson),age=state==='first'?r.beat:lesson.time-lesson.lastStroke;
        setPercent(nodes.zone,'width',2*r.window/full*100);
        setPercent(nodes.pulse,'left',Math.min(1,age/full)*97+1.5,1);
        if(nodes.rhythm._late!==(state==='late')){nodes.rhythm._late=state==='late';nodes.rhythm.classList[state==='late'?'add':'remove']('late');}
      } else if(holding) {
        const r=lesson.rules,resting=!lesson.held&&lesson.airTime<r.air;
        setPercent(nodes.zone,'width',(1-r.bubbleMin/r.bubbleMax)*100);
        setPercent(nodes.pulse,'left',Math.min(1,(lesson.held?lesson.holdTime:0)/r.bubbleMax)*97+1.5,1);
        if(nodes.rhythm._late!==resting){nodes.rhythm._late=resting;nodes.rhythm.classList[resting?'add':'remove']('late');}
      }
      if(phase==='lesson')score=snap.score;
      // "take your time": the clock only appears for the last half minute of the generous round budget
      const left=ctx.roundTime-total;
      ctx.hud(score,left<=30?Math.max(0,left):null);
      if(total>=ctx.roundTime)return result();
    };
    frame(0);
    // Place the first shot immediately so the dry deck and supervision are visible from the opening frame.
    follow.camera.position.copy(cameraPos);follow.look.copy(cameraLook);follow.tracking.lookNow.copy(cameraLook);follow.camera.lookAt(cameraLook);
    return await ctx.loop(frame);
  } finally {
    ui?.destroy();restorePlayer?.();pool?.dispose();
    for(const [o,visible]of hidden)o.visible=visible;
    if(savedSign){savedSign.hidden=signHidden;if(savedSign.obj)savedSign.obj.visible=signVisible;}
    follow.fovBase=savedFov;follow.yaw=savedYaw;follow.pitch=savedPitch;follow.shot=savedShot;follow.tracking=savedTracking;
    follow.look.copy(savedLook);follow.pos.copy(savedPos);follow.camera.position.copy(savedCameraPos);follow.camera.quaternion.copy(savedCameraRot);
    follow.camera.fov=savedCameraFov;follow.camera.near=savedCameraNear;follow.camera.updateProjectionMatrix();
    ctx.setNight(false);
    ctx.lock(false);input.releaseAll?.();
  }
} };
