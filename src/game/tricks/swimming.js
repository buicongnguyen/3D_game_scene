// A supervised, virtual swimming lesson. The pool and player controller exist only for this round.
// The small game distances/times are not a real swimming qualification or a breath-holding exercise.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { N_, tx } from '../../i18n/i18n.js';
import { NPC } from '../../actors/npc.js';
import { SwimLesson, SWIM } from './rules-swimming.js';
import { addCss, disposeRigs, trampleGrass } from './util.js';

export const POOL = Object.freeze({ x: -22, z: 65, halfWidth: 4, halfLength: 7, apronX: 7, apronZ: 9,
  water: 1.3, deck: 1.42, exit: Object.freeze({ x: 0, z: 8 }), entry: Object.freeze({ x: 0, z: 5 }) });

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
#swimLesson .lesson{position:absolute;top:calc(70px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);width:min(500px,calc(100vw - 28px));box-sizing:border-box;padding:12px 16px;border-radius:20px;background:rgba(245,255,253,.96);box-shadow:0 5px 18px #1234;text-align:center}
#swimLesson h2{font:600 21px Fredoka,Nunito,sans-serif;margin:0 0 5px;color:#236b79}
#swimLesson .instruction{min-height:2.5em;font-size:15px;line-height:1.3}
#swimLesson .cue{font-size:17px;color:#a34920;margin:7px 0 3px;min-height:1.3em}
#swimLesson .track{height:7px;border-radius:20px;background:#bddad5;overflow:hidden;margin:7px 0}
#swimLesson .progress{height:100%;width:0;background:#3caa82}
#swimLesson .rhythm{height:19px;position:relative;background:#dceee6;border-radius:20px;margin:6px 5px;overflow:hidden}
#swimLesson .zone{position:absolute;right:0;width:24%;height:100%;background:#87cba8}
#swimLesson .pulse{position:absolute;left:0;top:2px;width:15px;height:15px;border-radius:50%;background:#bb602b;transform:translateX(-50%)}
#swimLesson .rhythm.late .zone{background:#bdd1ce}#swimLesson .rhythm.late .pulse{background:#778d8b}
#swimLesson .feedback{font-size:13px;min-height:1.3em;color:#a34920}
#swimLesson .controls{font-size:12px;color:#5b787a;margin-top:4px}
#swimLesson .safe{position:absolute;left:50%;bottom:calc(12px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);max-width:min(650px,calc(100vw - 32px));width:max-content;padding:5px 10px;border-radius:12px;background:#eefbf7e8;text-align:center;font-size:11px;line-height:1.3}
#swimLesson button{pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;cursor:pointer;border:0;font:800 16px Nunito,system-ui,sans-serif;min-height:56px;padding:10px 16px;border-radius:18px;box-shadow:0 4px 0 #174e5e;background:#27889b;color:#fff}
#swimLesson .act{position:absolute;right:calc(24px + env(safe-area-inset-right,0px));bottom:calc(92px + env(safe-area-inset-bottom,0px));width:132px;max-width:35vw;min-height:72px}
#swimLesson .act.held{background:#bf672b;transform:translateY(3px);box-shadow:0 1px 0 #713d1b}
#swimLesson .leave{position:absolute;right:calc(24px + env(safe-area-inset-right,0px));bottom:calc(184px + env(safe-area-inset-bottom,0px));min-height:40px;font-size:13px;background:#edf8f2;color:#325955;box-shadow:0 3px 0 #c1d9d3}
@media(max-width:560px){#swimLesson .lesson{padding:9px 12px}#swimLesson h2{font-size:19px}#swimLesson .instruction{font-size:13px}#swimLesson .cue{font-size:15px}#swimLesson .feedback{font-size:12px}#swimLesson .safe{font-size:10px}#swimLesson .leave{bottom:calc(181px + env(safe-area-inset-bottom,0px))}}
@media(max-height:540px){#swimLesson .lesson{left:18px;transform:none;width:310px;top:70px;font-size:12px}#swimLesson .safe{left:16px;transform:none;max-width:65vw}#swimLesson .instruction{font-size:12px}#swimLesson h2{font-size:17px}}
`;

/** Shared input mapping includes the existing pad X hold, which Input stores separately from keyboard keys. */
export function swimInput(input, pointerHeld = false) {
  const enabled = input.enabled !== false;
  return { act: enabled && !!(pointerHeld || input.held?.('act') || input._gp?.act || input.pressed?.('act')),
    mx: enabled ? input.move?.x || 0 : 0, mv: enabled ? -(input.move?.y || 0) : 0 };
}

/** Own only this instance's update. Restores absent/inherited properties as well as explicit values. */
export function takeSwimmer(player) {
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
      anim?.snap?.(oldClip, { speed: oldSpeed, time: oldTime });
      if (oldOneShot) {
        anim.current?.setLoop?.(oldLoop, oldRepeats);
        if(anim.current)anim.current.clampWhenFinished=oldClamp;
        anim.oneShot=oldOneShot;anim.oneShotLocks=oldLocks;
      }
    }
  };
}

function makeUi(ctx) {
  addCss('swimCss', CSS);
  const el = document.createElement('div'); el.id = 'swimLesson';
  el.innerHTML = '<section class="lesson"><h2></h2><div class="instruction"></div><div class="cue" aria-live="polite"></div><div class="track"><div class="progress"></div></div><div class="rhythm"><i class="zone"></i><i class="pulse"></i></div><div class="feedback"></div><div class="controls"></div></section><button class="leave"></button><button class="act"></button><div class="safe"></div>';
  document.body.append(el); document.body.classList.add('swim-round');
  const nodes = Object.fromEntries(['instruction', 'cue', 'progress', 'rhythm', 'pulse', 'feedback', 'controls', 'safe', 'leave', 'act'].map(c => [c, el.querySelector(`.${c}`)]));
  nodes.title = el.querySelector('h2'); nodes.safe.textContent = tx(SAFETY); nodes.leave.textContent = tx('Leave');
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

/** Raised, calm pool on dry land. All geometry/materials here are owned by this round. */
export function makePool(game) {
  const group = new THREE.Group(); group.name = 'swimming-practice';
  const floor = Math.max(...[-7, 0, 7].flatMap(x => [-9, 0, 9].map(z => game.world.heightAt(POOL.x + x, POOL.z + z)))) + 0.07;
  group.position.set(POOL.x, floor, POOL.z);
  const owned = [], keep = obj => (owned.push(obj), obj), solids = [];
  const paint = (geo, color) => {
    const c = new THREE.Color(color), a = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo;
  };
  const box = (x, y, z, w, h, d, color) => solids.push(paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color));
  box(0, 0.08, 0, 8, 0.16, 14, '#a6d6ce');
  box(-5.25, POOL.deck - 0.1, 0, 2.5, 0.2, 18, '#d7c694'); box(5.25, POOL.deck - 0.1, 0, 2.5, 0.2, 18, '#d7c694');
  box(0, POOL.deck - 0.1, -8, 8, 0.2, 2, '#d7c694'); box(0, POOL.deck - 0.1, 8, 8, 0.2, 2, '#d7c694');
  box(-4.1, 0.8, 0, 0.2, 1.6, 14.4, '#589e99'); box(4.1, 0.8, 0, 0.2, 1.6, 14.4, '#589e99');
  box(0, 0.8, -7.1, 8, 1.6, 0.2, '#589e99');
  box(-2.7, 0.8, 7.1, 2.6, 1.6, 0.2, '#589e99'); box(2.7, 0.8, 7.1, 2.6, 1.6, 0.2, '#589e99');
  // The central ramp is a real visible sloped exit; the lesson controller follows its surface.
  const ramp = new THREE.BufferGeometry();
  ramp.setAttribute('position', new THREE.Float32BufferAttribute([-1.3,0.15,5, 1.3,0.15,5, -1.3,POOL.deck,8, 1.3,POOL.deck,8],3));
  ramp.setAttribute('uv', new THREE.Float32BufferAttribute([0,0,1,0,0,1,1,1],2));
  ramp.setIndex([0,2,1,1,2,3]); ramp.computeVertexNormals(); solids.push(paint(ramp, '#f1dfa7'));
  for (const x of [-1.5, 1.5]) {
    box(x, POOL.deck + 0.5, 7.8, 0.08, 1, 0.08, '#c6ebea');
    box(x, POOL.deck + 0.9, 7.2, 0.08, 0.08, 1.4, '#c6ebea');
  }
  const solidGeo = keep(mergeGeometries(solids)); solids.forEach(g => g.dispose());
  const solidMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }));
  const solid = new THREE.Mesh(solidGeo, solidMat); solid.receiveShadow = true; group.add(solid);
  const waterMat = keep(new THREE.MeshStandardMaterial({ color: '#64c7d0', transparent: true, opacity: 0.36, roughness: 0.26, depthWrite: false, side: THREE.DoubleSide }));
  const water = new THREE.Mesh(keep(new THREE.PlaneGeometry(7.95,13.95)), waterMat); water.rotation.x = -Math.PI / 2; water.position.y = POOL.water; group.add(water);
  const floatGeo = keep(new THREE.SphereGeometry(0.09, 6, 4)), floatMat = keep(new THREE.MeshStandardMaterial({ color: '#fff2b5', roughness: 0.65 }));
  const floats = new THREE.InstancedMesh(floatGeo, floatMat, 36), matrix = new THREE.Matrix4();
  for (let i = 0; i < 36; i++) { matrix.makeTranslation(i % 2 ? -2.3 : 2.3, POOL.water + 0.03, -6.3 + Math.floor(i / 2) * 0.73); floats.setMatrixAt(i,matrix); }
  group.add(floats);
  const ringGeo = keep(new THREE.TorusGeometry(0.55,0.07,5,24)), exitMat = keep(new THREE.MeshBasicMaterial({ color: '#eea137' }));
  const exit = new THREE.Mesh(ringGeo,exitMat); exit.name='swim-exit'; exit.rotation.x = -Math.PI/2; exit.position.set(0,POOL.deck + .035,8); group.add(exit);
  // An arrow points onto dry land, so the exit remains recognizable without relying on colour.
  const arrowGeo = keep(new THREE.ConeGeometry(.26,.65,3)), arrow = new THREE.Mesh(arrowGeo,exitMat);
  arrow.rotation.x = Math.PI/2; arrow.position.set(0,POOL.water+.06,6.5); group.add(arrow);
  const targetMat = keep(new THREE.MeshBasicMaterial({ color: '#a83b52' })), target = new THREE.Mesh(ringGeo,targetMat);
  target.name='swim-target'; target.rotation.x = -Math.PI/2; target.position.set(0,POOL.water+.05,-6); group.add(target);
  const bubbleGeo = keep(new THREE.SphereGeometry(.045,6,4)), bubbleMat = keep(new THREE.MeshBasicMaterial({ color:'#edffff',transparent:true,opacity:.8 }));
  const bubbles = new THREE.InstancedMesh(bubbleGeo,bubbleMat,12); bubbles.visible = false; group.add(bubbles);
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
  const coach = actor('swim-coach','rin',{x:5.1,z:4,facing:-Math.PI/2});
  const adult = actor('swim-watcher','villager-woman',{x:-5.1,z:1,facing:Math.PI/2});
  const grass = trampleGrass(game.world, POOL.x, POOL.z, 11);
  game.scene.add(group);
  let disposed = false;
  return { group, floor, waterY: floor + POOL.water, deckY: floor + POOL.deck, target, exit, coach, adult,
    update(dt,snap,time) {
      coach.anim?.update(dt); adult.anim?.update(dt);
      coach.root.rotation.y = Math.atan2(snap.position.x-coach.pos.x,snap.position.z-coach.pos.z);
      adult.root.rotation.y = Math.atan2(snap.position.x-adult.pos.x,snap.position.z-adult.pos.z);
      bubbles.visible = !!snap.bubbles;
      if (snap.bubbles) for(let i=0;i<12;i++) {
        const age = (time*1.4+i*.19)%1;
        const front=snap.floatSide==='front';
        matrix.makeTranslation(snap.position.x+Math.sin(snap.heading)*.27+Math.sin(i*4.1)*.06,
          POOL.water-(front ? 0.14 : 0.035)+age*(front ? 0.16 : 0.05),snap.position.z+Math.cos(snap.heading)*.27+Math.cos(i*3.7)*.06);
        bubbles.setMatrixAt(i,matrix);
      }
      bubbles.instanceMatrix.needsUpdate = !!snap.bubbles;
      target.position.y = POOL.water+.05+Math.sin(time*3)*.035;
    },
    dispose() { if(disposed)return; disposed=true; group.removeFromParent(); disposeRigs(coach.root); disposeRigs(adult.root); floats.dispose(); bubbles.dispose(); owned.forEach(o=>o.dispose?.()); grass?.(); },
  };
}

const latePulse = lesson => lesson.lastStroke !== null && lesson.time - lesson.lastStroke > lesson.rules.beat + lesson.rules.window;
const pulseCue = (lesson, snap) => latePulse(lesson) ? N_('Tap once to restart the pulse') : snap.beatPhase >= .85 ? N_('Tap gently now') : N_('Wait for the pulse');

function instructions(phase, lesson, snap) {
  if (phase === 'check') return { text:N_('A grown-up is watching. Move to the gold exit ring on the dry deck, then press Action to check it.'),cue:N_('Move to the exit ring'),button:N_('Check exit') };
  if (phase === 'entry') return { text:N_('Walk slowly down the shallow ramp to the water marker. Press Action when you are ready.'),cue:N_('Move up the lane into the shallow entry'),button:N_('Begin practice') };
  if (phase === 'out' || phase === 'climbing') return { text:N_('You found the exit. Press Action to stand and walk up the shallow ramp.'),cue:N_('Return to the dry deck'),button:N_('Climb out') };
  if (phase === 'done') return { text:N_('Mika is back on the dry deck. You practised all six game skills. Real swimming still needs a qualified teacher and supervision.'),cue:N_('Practice complete — safely out'),button:N_('Well done') };
  if (snap.stage === 'bubbles') {
    const release = lesson.held && lesson.holdTime >= 1.5;
    return { text:N_('Control Mika, not your breathing: hold Action for gentle bubbles, then release so she takes a normal breath. Repeat three times.'),
      cue:release ? N_('Release — normal breath') : lesson.airTime < lesson.rules.air ? N_('Normal breath — wait a moment') : lesson.held ? N_('Gentle bubbles…') : N_('Hold for gentle bubbles'),button:release ? N_('Release for air') : N_('Gentle bubbles') };
  }
  if (snap.stage === 'float') {
    if(lesson.floatMode === 'back') return {text:N_('Hold Action to relax Mika on her back. Keep movement small. When the bar reaches halfway, release to recover upright.'),cue:lesson.floatBack >= SWIM.floatSeconds ? N_('Release — recover upright') : N_('Back float — relax Mika'),button:N_('Relax Mika')};
    if(lesson.floatMode === 'front') return {text:N_('Now practise short front floats: hold for gentle bubbles, release for a normal breath, and repeat. Keep the stick near the centre.'),cue:lesson.held && lesson.holdTime >= 1.9 ? N_('Release — normal breath') : lesson.airTime < lesson.rules.air ? N_('Normal breath — wait a moment') : N_('Short front float, then air'),button:N_('Front float')};
    return {text:N_('Mika is upright again. Press Action to finish the recovery and move to treading.'),cue:N_('Upright recovery'),button:N_('Recover upright')};
  }
  if(snap.stage === 'tread') return {text:N_('Tap Action with the slow pulse for eight gentle sculls. Release between taps. Mika stays with her head above water.'),cue:pulseCue(lesson,snap),button:N_('Gentle scull')};
  if(snap.stage === 'turn') return {text:N_('Turn Mika toward the gold exit at the starting end. Move the stick down the lane until she faces it.'),cue:N_('Face the starting exit'),button:N_('Look for exit')};
  const returning = snap.stage === 'swim';
  return {text:returning ? N_('Steer back toward the gold exit. Tap gentle strokes with the pulse, and keep inside the lane.') : N_('Steer toward the far ring. Tap gentle strokes with the slow pulse; Mika glides between strokes.'),cue:latePulse(lesson) ? N_('Tap once to restart the pulse') : snap.beatPhase>=.85 ? N_('Tap gently now') : N_('Steer and wait for the pulse'),button:N_('Gentle stroke')};
}

const setText = (node,text) => { text=tx(text); if(node.textContent!==text)node.textContent=text; };

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
  const local={x:-3,z:8}, deckSnap={position:local,heading:Math.PI,pitch:0,clip:'Idle',bubbles:false,progress:0};
  const lesson=new SwimLesson({level:g.easy ? 'easy' : g.hard ? 'hard' : 'normal',first:ctx.first});
  let snap=deckSnap,exitWalk=0;
  const cameraPos=new THREE.Vector3(),cameraLook=new THREE.Vector3();
  const hidden=[];
  const result=()=>({score:climbed?lesson.result().score:lesson.result().complete?0:lesson.result().score,
    note:climbed?tx('You returned to the dry deck after all six game drills. Stars are game rewards.')
      :tx("You practised {skills}/6 game skills. Replay and take your time with Rin's cues.",{skills:lesson.skills}),
    detail:{complete:climbed,skills:lesson.skills,retries:lesson.retries,seconds:Math.round(total)}});
  try {
    ctx.lock(true); ctx.director.ground?.release('trick',true);
    ctx.setNight(true,11); // The shared round-look override also supports daylight; frozen story clocks bypass hour gates.
    pool=makePool(g); ui=makeUi(ctx); restorePlayer=takeSwimmer(p);
    if(savedSign) { savedSign.hidden=true; if(savedSign.obj)savedSign.obj.visible=false; }
    // Hide nearby unrelated actors only while they could walk through this temporary pool.
    const hideNearby=()=>{
      for(const o of g.scene.children) {
        if(o===pool.group || o===p.root || !/^(npc:|critter:|animal:)/.test(o.name))continue;
        if(Math.abs(o.position.x-POOL.x)<POOL.apronX+.5 && Math.abs(o.position.z-POOL.z)<POOL.apronZ+.5 && !hidden.some(h=>h[0]===o))hidden.push([o,o.visible]);
      }
      for(const [o] of hidden)o.visible=false;
    };
    follow.fovBase=52;
    follow.track(()=>cameraPos,()=>cameraLook,5);
    input.releaseAll?.();
    ctx.debug={lesson, get phase(){return phase;}, get exitCheck(){return exitCheck;},get entered(){return entry;},get climbed(){return climbed;},
      get snapshot(){return snap;}, get local(){return {...local};}, pool:{x:POOL.x,z:POOL.z,floor:pool.floor,waterY:pool.waterY,deckY:pool.deckY},
      get pointerHeld(){return ui?.held || false;},stageLabels:STAGE};
    const frame=dt=>{
      if(ctx.quit)return {score:0,quit:true};
      dt=Math.min(.1,Math.max(0,dt)); total+=dt;phaseTime+=dt;
      const controls=swimInput(input,ui.held),pressed=controls.act&&!oldAct;oldAct=controls.act;
      if(phase==='check'||phase==='entry') {
        local.x=THREE.MathUtils.clamp(local.x+controls.mx*1.6*dt,phase==='check'?-3.4:-1.05,phase==='check'?3.4:1.05);
        local.z=THREE.MathUtils.clamp(local.z+controls.mv*1.6*dt,phase==='check'?7.5:5,8.5);
        if(phase==='check'&&pressed&&Math.hypot(local.x,local.z-8)<.7){exitCheck=true;phase='entry';phaseTime=0;ctx.audio.good();}
        else if(phase==='entry'&&pressed&&Math.hypot(local.x,local.z-5)<.7){entry=true;phase='lesson';phaseTime=0;local.x=0;local.z=5;lesson.needsRelease=controls.act;ctx.audio.good();ui.release();}
        deckSnap.heading=Math.hypot(controls.mx,controls.mv)>.1?Math.atan2(controls.mx,controls.mv):deckSnap.heading;
        deckSnap.clip=Math.hypot(controls.mx,controls.mv)>.1?'Walk':'Idle'; snap=phase==='lesson'?lesson.snapshot():deckSnap;
      } else if(phase==='lesson') {
        snap=lesson.step(dt,controls);local.x=snap.position.x;local.z=snap.position.z;
        for(const ev of snap.events.slice(lessonEvent))if(ev.type==='stage'||ev.type==='skill')ctx.audio.good();
        lessonEvent=snap.events.length;
        if(snap.complete){phase='out';phaseTime=0;ui.release();}
      } else if(phase==='out') {
        if(pressed){phase='climbing';phaseTime=0;ui.release();}
      } else if(phase==='climbing') {
        exitWalk=Math.min(1,phaseTime/1.8);local.x=0;local.z=6+exitWalk*2;
        snap={...deckSnap,position:{...local},heading:0,clip:'Walk',progress:exitWalk};
        if(exitWalk>=1){climbed=true;phase='done';phaseTime=0;snap.clip='Idle';}
      } else if(phase==='done') {
        snap={...deckSnap,position:{...local},heading:0,clip:'Idle',progress:1};
        if(phaseTime>=1.5)return result();
      }
      const wet=phase==='lesson'||phase==='out';
      const ramp=pool.floor+.15+THREE.MathUtils.clamp((local.z-5)/3,0,1)*(POOL.deck-.15);
      // Gentle bubbles dip the mouth slightly; air cues and travel keep it above the surface.
      const depth=snap.floatSide==='front'?1.16:snap.floatSide==='back'?1.0:snap.bubbles?1.10:snap.clip==='Swim'?1.0:1.03;
      p.pos.set(POOL.x+local.x,wet?pool.waterY-depth:phase==='check'?pool.deckY:ramp,POOL.z+local.z);
      p.facing=snap.heading;p.pitch=wet?snap.pitch:0;p.pose=snap.clip;
      p.poseSpeed=wet?((snap.floatSide==='front'||snap.floatSide==='back')?0.22:snap.clip==='Swim'?0.65:1):1;
      p.speed=wet?lesson.speed:snap.clip==='Walk'?1.6:0;p.root.position.copy(p.pos);p.root.rotation.y=p.facing;p.pivot.rotation.x=p.pitch;
      pool.target.visible=phase==='entry'||phase==='lesson'&&(snap.stage==='glide'||snap.stage==='turn'||snap.stage==='swim');
      const target=snap.target||POOL.entry;pool.target.position.x=target.x;pool.target.position.z=target.z;
      pool.update(dt,{...snap,position:{...local}},total);hideNearby();
      const portrait=innerHeight>innerWidth;
      const stationary=phase==='lesson'&&['bubbles','float','tread'].includes(snap.stage);
      const travel=phase==='lesson'&&['glide','turn','swim'].includes(snap.stage)||['out','climbing','done'].includes(phase);
      const overview=phase==='check'||phase==='entry';
      follow.fovBase=portrait?(overview?68:stationary?57:60):52;
      if(travel) {
        // Keep the camera at the exit end so pool-relative controls never reverse. Fit BOTH ends of the active leg,
        // biased toward its far end so neither the destination nor Mika is covered by the top instructions.
        const marker=snap.stage==='glide'&&phase==='lesson'?SWIM.glide:POOL.exit;
        const span=Math.abs(marker.z-local.z),far=Math.min(local.z,marker.z);
        cameraPos.set(POOL.x,pool.waterY+(portrait?10.8+Math.min(6.2,span*.6):7.2+Math.min(4.3,span*.45)),POOL.z+Math.max(local.z,marker.z)+9.5);
        cameraLook.set(POOL.x,pool.waterY+(wet?0.1:0.6),POOL.z+far+span*.25);
      } else {
        // Face the swimmer during stationary drills so her mouth, bubbles and upright recovery can be seen.
        const camZ=portrait&&overview?14:stationary?local.z-4.5:Math.min(10.5,local.z+9);
        cameraPos.set(POOL.x+(stationary?3:0),pool.waterY+(portrait?overview?17:stationary?5.7:10.8:stationary?3.7:7.2),POOL.z+camZ);
        cameraLook.set(POOL.x,pool.waterY+(wet?0.1:0.6),POOL.z+(portrait&&overview?2:stationary?local.z:local.z-2.6));
      }
      const inst=instructions(phase==='lesson'?snap.stage:phase,lesson,snap);
      setText(ui.nodes.title,tx('{step} · {name}',{step:phase==='lesson'?`${snap.stageIndex+2}/8`:phase==='check'?'1/8':phase==='entry'?'1/8':'8/8',name:tx(STAGE[phase==='lesson'?snap.stage:phase]||STAGE.out)}));
      setText(ui.nodes.instruction,inst.text);setText(ui.nodes.cue,inst.cue);setText(ui.nodes.act,inst.button);
      setText(ui.nodes.feedback,FEEDBACK[snap.feedback]||'');
      setText(ui.nodes.controls,input.lastDevice==='gamepad'?N_('Left stick moves · X is Action · B leaves'):ctx.ui.touch?N_('Left thumb moves · hold or tap the Action button'):N_('WASD / arrows move · E is Action · Backspace leaves'));
      ui.nodes.progress.style.width=`${Math.round((phase==='lesson'?snap.progress:phase==='check'?exitCheck?1:0:phase==='entry'?Math.max(0,(8-local.z)/3):exitWalk)*100)}%`;
      const rhythm=phase==='lesson'&&['tread','glide','swim'].includes(snap.stage);ui.nodes.rhythm.hidden=!rhythm;ui.nodes.pulse.style.left=`${Math.min(98,(snap.beatPhase||0)*98)}%`;
      ui.nodes.rhythm.classList[rhythm&&latePulse(lesson)?'add':'remove']('late');
      ctx.hud(lesson.result().score,Math.max(0,ctx.roundTime-total));
      if(total>=ctx.roundTime)return result();
    };
    let lessonEvent=0;
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
