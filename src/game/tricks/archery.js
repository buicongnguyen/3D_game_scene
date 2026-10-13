// Bow and arrow (docs/RURAL-TRICKS.md): the village archery range west of Kawabe (world/archery.js builds it; content/archery.js
// says where). Mika stands at the shooting line with a bamboo practice bow and shoots six arrows at each of three straw targets
// (10, 15, 20 m), and after the first try four more at a sliding target. HOLD to draw (E, the mouse button, a trigger or the
// on-screen Draw button), aim with the mouse, the stick or by dragging, RELEASE to shoot. A longer draw is a faster, flatter
// arrow; held too long the bow trembles, and a breath (Space, A or the Breathe button) steadies it. The wind sock shows the
// crosswind that drifts the arrow. Rules and physics: ./rules-archery.js (pure, tested).
//
// Safety is built in: the aim is a narrow cone down the lane, arrows stop at targets, ground, backstop or side limit, and
// nothing else in the world can be hit (they are practice arrows with soft rubber tips, too).
//
// Drawing: Mika's arms and hands posed by hand (actors/archer-rig.js) round a bamboo bow and a nocked arrow (./archery-gear.js),
// up to 12 pooled arrows sharing one geometry, a dotted aim arc (one Points), and a small DOM layer (crosshair with the draw
// ring, sight pins, wind gauge, buttons). The first try is guided (./archery-guide.js: a "How to shoot" card, a cue under the
// crosshair, hints one at a time, a ghost hand after a few idle seconds, an easy first end, and the first arrow in slow motion).
// Everything made here is removed and freed when the round ends, quit or not.
//
// The last end of every round after the first try is the BALLOON end (./rules-balloons.js): balloons rise down the range and
// drift on the wind the sock shows, each with a sandbag on its string. A popped balloon drops its sandbag straight down and it
// breaks the balloons below (a chain: x2, x3...), so the top of a stack is the shot. Drawn as four instanced meshes (archery-gear.js).
import * as THREE from 'three';
import { N_, tx } from '../../i18n/i18n.js';
import { addCss } from './util.js';
import { RING_COLOURS } from '../../world/archery.js';
import { ArcherRig, STANCE, nockAt } from '../../actors/archer-rig.js';
import { arrowGeometry, makeBow, makeFingers, dotTexture, BOW, makeBalloons, BALLOON_RGB, BALLOON_GOLD_RGB } from './archery-gear.js';
import { createGuide, GUIDE_CSS, GHOST_LOOP, BALLOON_NOTE } from './archery-guide.js';
import { ARCHERY } from '../../content/archery.js';
import {
  ARCH, roundPlan, arcAlpha, makeWind, windAt, drawAt, speedFor, swayAmp, swayAt, clampAim, movingV, gongV, launch, stepArrow, arc, solveAim,
  missReason, aimOffset, guideStep, ghostWanted, guideDevice, SLOWMO, slowMo, stepArrowBalloons, solveBalloon,
} from './rules-archery.js';
import { BAL, stagePlan, newStage, stepStage, falling, nearestBalloon, topOf } from './rules-balloons.js';

const V3 = THREE.Vector3;
const A = ARCHERY;
const POOL = 12;            // arrows alive at most (6 stuck per end + the one nocked + slack)
const ARROW_LEN = STANCE.arrow;   // metres
const ARROW_XY = 1.4, ARROW_Z = STANCE.arrow / 0.8;   // the practice arrows are drawn thicker than life so they read from the line (the model is 0.8 long)
const ARC_N = 26;           // dots in the aim arc
// the camera stands `back` behind the bow hand, `side` to its right and `up` above it (so Mika, her bow and her string hand show past her
// shoulder, low on the left) and looks at the bore line `conv` down the range; fov 0: the game's own
const CAM = { back: 2.3, side: 1.4, up: 0.6, conv: 9, fov: 0 };
const CAM_TALL = { back: 3.4, side: 0.7, up: 0.8, conv: 10, fov: 72 };   // a phone held upright sees a narrow strip: stand further back and look wider
// the balloon end: the camera stands further back and looks up the range at a fixed tilt (pitch), turning only a little with the aim
// (follow), so the balloons' whole climb stays in the picture, under the panels at the top
// (Mika's head and the quiver come just under the lowest sandbag, not in front of the balloons). SHORT: a phone on its side: a
// longer lens, looking up more (the end's panel moves to the left there, see the CSS). TALL: a phone held upright.
const CAM_BAL = { back: 3.6, side: 1.1, up: 1.1, conv: 10, fov: 50, pitch: 0.23, follow: 0.08 };
const CAM_BAL_SHORT = { back: 3.6, side: 1.1, up: 1.2, conv: 10, fov: 37.5, pitch: 0.33, follow: 0.08 };
const CAM_BAL_TALL = { back: 4.2, side: 0.6, up: 1.25, conv: 10, fov: 64, pitch: 0.092, follow: 0.08 };
const BAL_AIM0 = 0.25;      // the aim (pitch) at which the camera has exactly its own tilt
const camBal = cam => (cam.aspect < 0.9 ? CAM_BAL_TALL : innerHeight < 500 ? CAM_BAL_SHORT : CAM_BAL);
const BAL_MAX = 20;         // balloons drawn at once (two waves can overlap)
const LOOK = 0.0016;        // radians of aim per pixel dragged (mouse, finger)
const KEYAIM = 0.5;         // radians per second with the keys or the stick

const GRADE = [N_('Nice shot!'), N_('Very close!')];
// why an arrow missed (rules-archery.js missReason) -> what Grandma says
const MISS = {
  high: N_('Too high. Aim a little lower.'),
  low: N_('Too low. Aim a little higher.'),
  left: N_('A bit to the left. Aim a little to the right.'),
  right: N_('A bit to the right. Aim a little to the left.'),
  wind: N_('See the wind sock? It points where the wind blows. Aim a little the other way.'),
  short: N_('That one fell short. A longer draw makes a faster, flatter arrow.'),
  other: N_('That was another target!'),
};
// the first try's hints, one at a time, for each device
const STEP_HINT = {
  aim: { key: N_('Move the mouse to put the circle on the target.'), touch: N_('Drag a finger on the screen to put the circle on the target.'), pad: N_('Push the stick to put the circle on the target.') },
  hold: { key: N_('Now hold {act} (or the mouse button) to pull the string back.'), touch: N_('Now press and hold the orange Draw button.'), pad: N_('Now hold the right trigger (RT) to pull the string back.') },
  release: { key: N_('Now let go to shoot!'), touch: N_('Now let go to shoot!'), pad: N_('Now let go to shoot!') },
};

const CSS = GUIDE_CSS + `
#archUi{position:fixed;inset:0;z-index:15;pointer-events:none;font:700 14px Nunito,system-ui,sans-serif;color:#5a3a22;user-select:none;-webkit-user-select:none;touch-action:none}
#archUi .panel{position:absolute;padding:6px 12px;border-radius:14px;background:rgba(255,247,232,.93);box-shadow:0 4px 14px rgba(40,20,0,.22);zoom:var(--ui-scale,1)}
#archUi .end{left:50%;top:calc(62px + env(safe-area-inset-top,0px));transform:translateX(-50%);text-align:center;white-space:nowrap}
#archUi .end b{font:600 16px Fredoka,Nunito,sans-serif;color:#c2541c}
#archUi .pips{display:flex;gap:5px;justify-content:center;margin-top:4px}
#archUi .pip{min-width:20px;height:20px;padding:0 3px;border-radius:10px;background:#ead9b8;font:600 12px/20px Fredoka,Nunito,sans-serif;color:#fff;text-align:center;box-sizing:border-box}
#archUi .pip.left{background:#d9c49a}
#archUi .pip.s0{background:#b6aca0}
#archUi .wind{right:calc(10px + env(safe-area-inset-right,0px));top:calc(62px + env(safe-area-inset-top,0px));text-align:center;min-width:64px}
body.arch-round #inventory{visibility:hidden}
#archUi .wind .lab{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#8a6a4a}
#archUi .wind .dir{font:800 30px/1 Nunito,sans-serif;color:#2a6fb0;letter-spacing:-3px;white-space:nowrap;height:30px}
#archUi .wind .n{font:600 13px Fredoka,Nunito,sans-serif}
#archUi .cross{position:absolute;left:50%;top:50%;width:0;height:0}
#archUi .ring{position:absolute;left:-30px;top:-30px;width:60px;height:60px;border-radius:50%;opacity:0;transition:opacity .12s;
 background:conic-gradient(var(--c,#ffd34a) calc(var(--p,0) * 1%),rgba(255,255,255,.28) 0);-webkit-mask:radial-gradient(circle,transparent 21px,#000 22px,#000 27px,transparent 28px);mask:radial-gradient(circle,transparent 21px,#000 22px,#000 27px,transparent 28px)}
#archUi .ring.on{opacity:.95}
#archUi .dot{position:absolute;left:-3px;top:-3px;width:6px;height:6px;border-radius:50%;background:#fff;box-shadow:0 0 0 1.5px #c2441f,0 0 6px #fff8}
#archUi .tick{position:absolute;width:16px;height:2px;margin-left:-8px;border-radius:1px;background:#fff;box-shadow:0 0 0 1px #0006}
#archUi .tick span{position:absolute;left:19px;top:-6px;font:700 10px/1 Nunito,sans-serif;color:#fff;text-shadow:0 1px 2px #000a}
#archUi .pop{position:absolute;left:0;top:0;font:700 30px Fredoka,Nunito,sans-serif;color:#fff;text-shadow:0 2px 0 #c2441f,0 0 8px #0007;opacity:0;white-space:nowrap;transform:translate(-50%,-50%)}
#archUi .pop.go{animation:archPop 1.15s ease-out}
#archUi .pop.big{font-size:40px;color:#ffe052}
@keyframes archPop{0%{opacity:0;margin-top:14px;scale:.4}18%{opacity:1;margin-top:0;scale:1.18}70%{opacity:1;scale:1}100%{opacity:0;margin-top:-34px}}
#archUi button{pointer-events:auto;touch-action:none;border:0;font:700 15px Nunito,sans-serif;color:#fff;cursor:pointer;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}
#archDraw{position:absolute;right:calc(22px + env(safe-area-inset-right,0px));bottom:calc(28px + env(safe-area-inset-bottom,0px));width:104px;height:104px;border-radius:50%;background:#f08a3c;box-shadow:0 6px 0 #b8581a,0 10px 22px rgba(0,0,0,.3);font-size:19px;zoom:var(--ui-scale,1)}
#archDraw.on{transform:translateY(4px);box-shadow:0 2px 0 #b8581a,0 4px 12px rgba(0,0,0,.3);background:#ff9d50}
#archBreathe{position:absolute;right:calc(142px + env(safe-area-inset-right,0px));bottom:calc(40px + env(safe-area-inset-bottom,0px));width:78px;height:78px;border-radius:50%;background:#4aa3df;box-shadow:0 5px 0 #2a72a8,0 8px 16px rgba(0,0,0,.28);zoom:var(--ui-scale,1)}
#archBreathe.cool{opacity:.55}
#archBreathe.on{background:#7cc4f2}
#archLeave{position:absolute;left:calc(10px + env(safe-area-inset-left,0px));top:calc(62px + env(safe-area-inset-top,0px));padding:7px 12px;min-height:40px;border-radius:12px;background:rgba(90,58,34,.82);zoom:var(--ui-scale,1)}
#archUi .halo{position:absolute;left:-17px;top:-17px;width:34px;height:34px;border-radius:50%;box-sizing:border-box;border:3px solid rgba(255,255,255,.8);box-shadow:0 0 0 1px #0004;transition:border-color .12s,box-shadow .12s,transform .12s}
#archUi .halo.on{border-color:#4fe03d;box-shadow:0 0 0 1px #0004,0 0 10px 2px #4fe03d99;transform:scale(1.15)}
#archUi .sight.on .dot{background:#d8ffd0;box-shadow:0 0 0 1.5px #2f9a22,0 0 6px #4fe03d}
#archUi .halo.off{opacity:0}
body.arch-round{cursor:none}
body.arch-help{cursor:auto}
body.arch-help #archUi #archDraw,body.arch-help #archUi #archBreathe{visibility:hidden}
body.arch-round #tJump,body.arch-round #tAct,body.arch-round #btnMenu,body.arch-round #btnJournal{visibility:hidden}
@media (max-height:500px) and (min-width:521px){body.arch-bal #archUi .end{left:calc(84px + env(safe-area-inset-left,0px));transform:none}body.arch-bal #archUi .end b{font-size:14px}body.arch-bal #archUi .pips{gap:3px}body.arch-bal #archUi .pip{min-width:15px;height:15px;padding:0 2px;font-size:10px;line-height:15px}}
@media (max-width:520px){#archUi .end{top:calc(68px + env(safe-area-inset-top,0px));max-width:62vw}#archUi .wind{top:calc(60px + env(safe-area-inset-top,0px))}#archUi .pip{min-width:17px;height:17px;font-size:10px;line-height:17px}#archLeave{top:calc(112px + env(safe-area-inset-top,0px))}}
`;

// the ambient wind of the sock when nobody shoots: one slow seeded wind (a fresh second counter each minute)
const AMBIENT = makeWind(71, 2, 0.8);
let ambT = 0;

export default {
  id: 'archery',

  /** While Mika is near (in season): the wind sock sways with a gentle, endless wind. */
  ambient(dt, ctx) {
    const R = ctx.game.structures?.archery;
    if (!R) return;
    if (ctx.off) return;
    ambT += dt;
    R.setWind(windAt(AMBIENT, 1, ambT % 60), ambT);
  },

  async play(ctx) {
    const { game: g, player: p, audio, fx } = ctx;
    const R = g.structures?.archery;
    if (!R) { ctx.hint(N_('The range is not ready yet.'), 3); return { score: 0, quit: true }; }
    const world = g.world, scene = g.scene, input = g.input, canvas = input.canvas;
    addCss('archCss', CSS);

    const rec = ctx.director.tricks.rec('archery');
    const plays = rec?.plays || 0, easy = !!ctx.easy;
    const plan = roundPlan(ctx.first, ctx.level);          // the level comes from the picker: Easy has no wind, Difficult a gong
    // QA: window.__STARLINE_QA__.archeryStage = 'balloons' plays the balloon end alone; archerySeed fixes the wind and the waves
    const qa = (typeof window !== 'undefined' && window.__STARLINE_QA__) || {};
    if (qa.archeryStage === 'balloons' && plan.ends.some(e => e.target === 'balloons')) plan.ends = plan.ends.filter(e => e.target === 'balloons');
    const touch = !!ctx.ui.touch;
    const y0 = R.y0, hAt = (x, z) => world.heightAt(x, z);
    const seed = qa.archerySeed || Math.floor(Math.random() * 1e6) + 1;
    const wind = makeWind(seed, plan.ends.length, plan.windScale, plan.ends.map(e => e.wind), plan.gust);
    const G = A.gong, MOVING = 3, GONG = 4;                 // the sliding target and the gong, as indices into the scene's targets
    let period = A.moving.period;                           // the sliding target's pace in the end being shot

    // ---- the lane <-> world conversions (no allocation: callers pass the vector to fill)
    const W = (u, v, y, out) => out.set(A.x - u, y0 + y, A.z - v);
    const ground = (u, v) => hAt(A.x - u, A.z - v) - y0;
    const dirW = (vu, vv, vy, out) => out.set(-vu, vy, -vv).normalize();

    // ---- state
    const st = {
      phase: 'intro', t: 0, end: -1, arrow: 0, shots: 0, total: 0, endScore: 0, scores: [], bulls: 0, hits: 0,
      windT: 0, wS: 0, left: ctx.roundTime, drawT: 0, draw: 0, steady: 0, steadyCool: 0, armed: false, free: 0,
      yaw: 0, pitch: 0.03, camYaw: 0, camPitch: 0.03, sw: { yaw: 0, pitch: 0 }, mode: 'aim', modeK: 0, cur: null,
      hitW: new V3(), impact: 0, endSummary: 0, teach: 0, said: {}, leaveHeld: false, script: null,
      hold: 1, relT: 99, relDraw: 0, slow: false,
      // the first try's guide: what the player has done, idle seconds, the ghost hand's clock, the hint now shown
      done: { aimed: false, drew: false, shot: false }, aimAcc: 0, idle: 0, ghostT: -1, helpSeen: false, stepKey: null, stepT: 0,
    };
    const input_ = { mdx: 0, mdy: 0, padDX: 0, padDY: 0, mouse: false, btn: false, btnId: -1, lx: 0, ly: 0, breatheTap: false };
    const added = [], disposables = [];
    let ui = null, cleaned = false, savedFov = 0, hadLock = false, rig = null, lanternWas = null;
    const cleanups = [];
    const scenery = { targets: [], active: -1, back: A.back, side: A.side, ground, vAt: (i, t) => (i === GONG ? gongV(G, t) : movingV(A.moving, t, period)) };
    for (const t of A.targets) scenery.targets.push({ u: t.u, v: t.v, r: t.r, r0: t.r, y: hAt(A.x - t.u, A.z - t.v) - y0 + A.centreH });
    scenery.targets.push({ u: A.moving.u, v: 0, r: A.moving.r, r0: A.moving.r, y: hAt(A.x - A.moving.u, A.z) - y0 + A.centreH, moving: true, off: true });
    scenery.targets.push({ u: G.u, v: G.v, r: G.r, r0: G.r, y: hAt(A.x - G.u, A.z - G.v) - y0 + G.h, moving: true, off: true });
    let gong = null;                                        // the gong's frame and disc (made for a plan that has a gong end)
    // the balloon end (rules-balloons.js): its drawing (made for a plan that has one), the stage while it is played, the aim cone in use
    let balVis = null, bal = null, cone = ARCH, bAim = null;
    const tgB = { u: 0, v: 0, y: 0, r: 0 };

    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      for (const f of cleanups) { try { f(); } catch (e) { console.warn(e); } }
      for (const o of added) o.removeFromParent();
      for (const d of disposables) d.dispose?.();
      ui?.remove();
      document.body.classList.remove('arch-round', 'arch-bal');
      if (document.pointerLockElement === canvas) document.exitPointerLock?.();
      if (savedFov) g.follow.fovBase = savedFov;
      g.follow.clearCutscene(true);
      // the targets and arrows are put back as the world built them
      for (const t of R.targets) { t.group.visible = true; t.group.scale.setScalar(1); t.group.position.y = t.baseY; t.flag.visible = false; }
      R.moving.group.visible = false; R.moving.group.scale.setScalar(1);
      R.moving.flag.visible = false;
      rig?.leave();
      p.facing = A.heading - st.yaw;                     // she turns square to the lane again (the stance is side-on)
      p.root.rotation.y = p.facing;
      if (lanternWas !== null && p.lantern) p.lantern.visible = lanternWas;
      p.pose = st.poseWas ?? null;
      p.carry?.release('archery');
      ctx.lock(false);
    };

    try {
      ctx.lock(true);
      p.carry?.want('worn', 'archery');
      await ctx.fade(true, 350);
      if (ctx.quit) return { score: 0, quit: true };

      // ---- Mika at the line, the camera behind her
      const stand = W(A.stand.u, A.stand.v, 0, new V3());
      stand.y = hAt(stand.x, stand.z);
      p.teleport(stand.x, stand.z, stand.y, A.heading);
      st.poseWas = p.pose ?? null;
      p.pose = 'Aim';
      // her belt lantern would swing about in the middle of the picture all round: it stays out of sight while she shoots
      if (p.lantern) { lanternWas = p.lantern.visible; p.lantern.visible = false; }
      savedFov = g.follow.fovBase;
      document.body.classList.add('arch-round');

      // ---- the pieces
      const bow = makeBow();
      scene.add(bow.root); added.push(bow.root); disposables.push(...bow.own);
      // Mika's hands: the rig poses her arms; her fingers are small parts on the hand bones (the rig has no finger bones)
      rig = new ArcherRig(p);
      if (rig.ok) {
        const fl = makeFingers('grip', rig.palmL.clone().multiply(rig.fist), -1), fr = makeFingers('hook', rig.palmR.clone().multiply(rig.fist), 1);
        rig.b.haL.add(fl.mesh); rig.b.haR.add(fr.mesh);
        added.push(fl.mesh, fr.mesh); disposables.push(...fl.own, ...fr.own);
        rig.setHands(fl.mesh, fr.mesh);
        rig.enter();
      }
      const aGeo = arrowGeometry(), aMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide, emissive: '#2a1a08', emissiveIntensity: 0.3 });
      disposables.push(aGeo, aMat);
      const pool = [];
      for (let i = 0; i < POOL; i++) {
        const m = new THREE.Mesh(aGeo, aMat);
        m.visible = false; m.frustumCulled = false; m.castShadow = false; m.name = 'archery:arrow';
        R.group.add(m); added.push(m);
        pool.push({ mesh: m, a: { state: 'free' }, use: 'free', fade: 0, wob: 0, base: new THREE.Quaternion(), moving: false });
      }
      const dotTex = dotTexture();
      const arcPos = new Float32Array(ARC_N * 3), arcLane = new Float32Array(ARC_N * 3);
      const arcGeo = new THREE.BufferGeometry();
      const arcAttr = new THREE.BufferAttribute(arcPos, 3).setUsage(THREE.DynamicDrawUsage);
      arcGeo.setAttribute('position', arcAttr);
      const arcMat = new THREE.PointsMaterial({ map: dotTex, size: 0.16, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, color: '#ffffff' });
      const arcPts = new THREE.Points(arcGeo, arcMat);
      arcPts.frustumCulled = false;
      scene.add(arcPts); added.push(arcPts); disposables.push(arcGeo, arcMat, dotTex);

      // ---- the gong (Difficult): a small bronze disc hung from a wooden frame; it swings like a slow pendulum
      if (plan.ends.some(e => e.target === 'gong')) {
        const root = new THREE.Group(), swing = new THREE.Group();
        root.name = 'archery:gong';
        const gx = A.x - G.u, gz = A.z - G.v, gy = hAt(gx, gz), top = G.h + 1.0, L = 1.0;       // the pivot is a metre above the disc's middle
        const wood = new THREE.MeshStandardMaterial({ color: '#8a5a30', roughness: 0.85 }), rope = new THREE.MeshStandardMaterial({ color: '#e9dcc0', roughness: 0.9 });
        // (a deep copper face with a dark rim and a bright boss: it has to stand out against the straw wall behind it)
        const bronze = new THREE.MeshStandardMaterial({ color: '#c8742a', roughness: 0.4, metalness: 0.45, emissive: '#3a1a06', emissiveIntensity: 0.55 });
        const dark = new THREE.MeshStandardMaterial({ color: '#4a2a14', roughness: 0.5, metalness: 0.4 });
        const gold = new THREE.MeshStandardMaterial({ color: '#ffd35a', roughness: 0.3, metalness: 0.5, emissive: '#5a3a00', emissiveIntensity: 0.6 });
        const postG = new THREE.CylinderGeometry(0.06, 0.075, top + 0.15, 8), barG = new THREE.CylinderGeometry(0.05, 0.05, 2.5, 8).rotateX(Math.PI / 2);
        const discG = new THREE.CylinderGeometry(G.r, G.r, 0.035, 28).rotateZ(Math.PI / 2), rimG = new THREE.TorusGeometry(G.r - 0.02, 0.04, 8, 28).rotateY(Math.PI / 2);
        const bossG = new THREE.SphereGeometry(0.11, 14, 8).scale(0.45, 1, 1), ropeG = new THREE.CylinderGeometry(0.012, 0.012, 1, 5);
        for (const s of [-1, 1]) { const m = new THREE.Mesh(postG, wood); m.position.set(0, (top + 0.15) / 2, s * 1.2); m.castShadow = true; root.add(m); }
        const bar = new THREE.Mesh(barG, wood); bar.position.set(0, top, 0); root.add(bar);
        swing.position.set(0, top, 0);
        const disc = new THREE.Mesh(discG, bronze); disc.position.y = -L; disc.castShadow = true;
        const rim = new THREE.Mesh(rimG, dark); rim.position.y = -L;
        const boss = new THREE.Mesh(bossG, gold); boss.position.set(0.03, -L, 0);
        swing.add(disc, rim, boss);
        for (const s of [-1, 1]) {
          // two cords from the bar to the top of the rim
          const m = new THREE.Mesh(ropeG, rope), len = L - G.r * 0.86;
          m.scale.y = len; m.position.set(0, -len / 2, s * G.r * 0.5); swing.add(m);
        }
        root.add(swing);
        root.position.set(gx, gy, gz);
        root.visible = false;
        scene.add(root); added.push(root);
        disposables.push(wood, rope, bronze, dark, gold, postG, barG, discG, rimG, bossG, ropeG);
        gong = { root, swing, L, ring: 0 };
      }
      // ---- the balloons of the last end: four small instanced meshes (archery-gear.js), empty until that end begins
      if (plan.ends.some(e => e.target === 'balloons')) {
        balVis = makeBalloons(BAL_MAX, BAL);
        scene.add(balVis.root); added.push(balVis.root); disposables.push(...balVis.own);
      }

      // ---- the page layer
      ui = document.createElement('div');
      ui.id = 'archUi';
      ui.innerHTML = `<div class="panel end"><b></b><div class="pips"></div></div>
        <div class="panel wind"><div class="lab"></div><div class="dir"></div><div class="n"></div></div>
        <div class="cross pins"><div class="tick t10"><span>10</span></div><div class="tick t15"><span>15</span></div><div class="tick t20"><span>20</span></div></div>
        <div class="cross sight"><div class="halo"></div><div class="ring"></div><div class="dot"></div></div>
        <div class="pop"></div>
        <button id="archLeave"></button><button id="archHelpBtn"></button><button id="archBreathe"></button><button id="archDraw"></button>`;
      document.body.appendChild(ui);
      const q = s => ui.querySelector(s);
      const el = {
        endB: q('.end b'), pips: q('.pips'), windLab: q('.wind .lab'), windDir: q('.wind .dir'), windN: q('.wind .n'), cross: q('.sight'), ring: q('.ring'), dot: q('.dot'),
        ticks: [q('.t10'), q('.t15'), q('.t20')], pop: q('.pop'), draw: q('#archDraw'), breathe: q('#archBreathe'), leave: q('#archLeave'), help: q('#archHelpBtn'), halo: q('.halo'),
      };
      el.windLab.textContent = tx('Wind');
      el.draw.textContent = tx('Draw');
      el.breathe.textContent = tx('Breathe');
      el.leave.textContent = tx('Leave');
      el.help.textContent = '?';
      el.help.setAttribute('aria-label', tx('How to shoot'));
      // the "How to shoot" card (opens by itself on the first try, and from the ? button): it holds the round still while it is up
      const dev = () => guideDevice(touch, input.lastDevice);
      const guide = createGuide(ui, dev(), () => { st.armed = false; st.free = 0; st.idle = 0; input_.mouse = false; });
      const onHelp = e => { e.preventDefault(); if (st.phase !== 'done' && st.phase !== 'timeUp') guide.open(dev()); };
      el.help.addEventListener('pointerdown', onHelp);
      // (with the mouse locked to the game the ? button cannot be clicked: H opens the card too)
      const onKey = e => { if ((e.code === 'KeyH' || e.key === '?') && !e.repeat && !e.ctrlKey && !e.metaKey) onHelp(e); };
      addEventListener('keydown', onKey);
      el.help.title = tx('How to shoot') + (touch ? '' : ' (H)');
      cleanups.push(() => { removeEventListener('keydown', onKey); el.help.removeEventListener('pointerdown', onHelp); guide.destroy(); document.body.classList.remove('arch-help'); });
      ctx.debug.guide = guide;
      // desktop: the buttons stay (a mouse can use them) but are smaller on a big screen
      if (!touch) { el.draw.style.width = el.draw.style.height = '84px'; el.breathe.style.width = el.breathe.style.height = '64px'; el.breathe.style.right = '120px'; el.draw.style.fontSize = '16px'; }
      // cached writes: the page is only touched when a shown value changes
      const memo = {};
      const setText = (node, key, text) => { if (memo[key] !== text) { memo[key] = text; node.textContent = text; } };
      const setStyle = (node, key, prop, val) => { if (memo[key] !== val) { memo[key] = val; node.style[prop] = val; } };

      const onDown = e => {
        e.preventDefault();
        try { el.draw.setPointerCapture(e.pointerId); } catch { /* the pointer is gone */ }
        input_.btn = true; input_.btnId = e.pointerId; input_.lx = e.clientX; input_.ly = e.clientY;
        el.draw.classList.add('on');
      };
      const onMove = e => { if (input_.btn && e.pointerId === input_.btnId) { input_.padDX += e.clientX - input_.lx; input_.padDY += e.clientY - input_.ly; input_.lx = e.clientX; input_.ly = e.clientY; } };
      const onUp = e => { if (e.pointerId === input_.btnId) { input_.btn = false; input_.btnId = -1; el.draw.classList.remove('on'); } };
      el.draw.addEventListener('pointerdown', onDown);
      el.draw.addEventListener('pointermove', onMove);
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.draw.addEventListener(ev, onUp);
      const onBreathe = e => { e.preventDefault(); input_.breatheTap = true; };
      el.breathe.addEventListener('pointerdown', onBreathe);
      const onLeave = e => { e.preventDefault(); input.press('back'); input.release('back'); };
      el.leave.addEventListener('pointerdown', onLeave);
      // the mouse: a held button draws, its movement aims (the pointer is locked on the first press, so it cannot leave the screen)
      const fromTouch = e => !!e.sourceCapabilities?.firesTouchEvents;
      const onMouseDown = e => {
        if (e.button !== 0 || e.target !== canvas || fromTouch(e)) return;
        input_.mouse = true;
        if (!document.pointerLockElement) { try { const r = canvas.requestPointerLock?.(); r?.catch?.(() => {}); } catch { /* not allowed here */ } }
      };
      const onMouseUp = e => { if (e.button === 0) input_.mouse = false; };
      const onMouseMove = e => { if (!fromTouch(e)) { input_.mdx += e.movementX || 0; input_.mdy += e.movementY || 0; } };
      addEventListener('mousedown', onMouseDown);
      addEventListener('mouseup', onMouseUp);
      addEventListener('mousemove', onMouseMove);
      const onBlur = () => { input_.mouse = false; };
      addEventListener('blur', onBlur);
      cleanups.push(() => {
        el.draw.removeEventListener('pointerdown', onDown); el.draw.removeEventListener('pointermove', onMove);
        for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.draw.removeEventListener(ev, onUp);
        el.breathe.removeEventListener('pointerdown', onBreathe); el.leave.removeEventListener('pointerdown', onLeave);
        removeEventListener('mousedown', onMouseDown); removeEventListener('mouseup', onMouseUp); removeEventListener('mousemove', onMouseMove); removeEventListener('blur', onBlur);
      });

      // ---- the arrows: take one from the pool; show it nocked, in flight or stuck
      const take = () => {
        let s = pool.find(x => x.use === 'free');
        if (!s) s = pool.reduce((o, x) => (x.use === 'stuck' && (!o || x.age > o.age) ? x : o), null) || pool[0];
        s.use = 'nock'; s.fade = 0; s.wob = 0; s.age = 0;
        if (s.moving) { R.group.add(s.mesh); s.moving = false; }
        s.mesh.scale.set(ARROW_XY, ARROW_XY, ARROW_Z); s.mesh.visible = true;
        return s;
      };
      const release = s => { s.use = 'free'; s.mesh.visible = false; if (s.moving) { R.group.add(s.mesh); s.moving = false; } };
      const tmpV = new V3(), tmpD = new V3(), tmpE = new V3(), tmpQ = new THREE.Quaternion(), tmpO = new THREE.Object3D();
      const camPos = new V3(), camLook = new V3(), eyeW = new V3(), aimD = new V3(), camD = new V3(), camR = new V3();
      const setMode = (mode, k) => {
        if (st.mode === mode && st.modeK === k) return;
        st.mode = mode; st.modeK = k;
        g.follow.track(() => camPos, () => camLook, k);
      };
      const hint = (key, text, life = 4) => { if (ctx.first || !st.said[key]) { st.said[key] = true; ctx.hint(text, life); } };

      // ---- the end's targets: the active one carries a red pennant; for the sliding end the others fold down
      const showEnd = e => {
        const kind = plan.ends[e].target, slide = kind === 'moving', isGong = kind === 'gong', isBal = kind === 'balloons', moving = slide || isGong || isBal;
        period = plan.ends[e].period || A.moving.period;
        cone = isBal ? BAL.aim : ARCH;
        if (isBal) {
          // the straw targets are put away; the first wave is let go (a little upwind: the stage is told how the wind of this end blows)
          const we = wind.ends[Math.min(e, wind.ends.length - 1)];
          bal = { S: newStage(stagePlan(plan.ends[e].level), seed + 7, we.base * wind.scale * (we.mul ?? 1)), ev: [], fly: 0, noteT: 0, spark: 0, best: 0, popped: 0, lost: 0 };
          bal.S.ground = ground;
          document.body.classList.add('arch-bal');
        }
        R.targets.forEach((t, i) => { t.flag.visible = !moving && kind === i; t.group.visible = !moving; t.group.scale.setScalar(1); });
        R.moving.group.visible = slide;
        R.moving.flag.visible = slide;
        if (gong) gong.root.visible = isGong;
        const special = slide ? MOVING : isGong ? GONG : -1;
        scenery.targets.forEach((t, i) => { t.off = moving ? i !== special : i >= MOVING; });
        scenery.active = moving ? special : kind;
        const tg = scenery.targets[scenery.active];
        // the easy end: a bigger face (about its middle: the stand sinks a little into the ground), a big dotted arc
        const big = plan.ends[e].scale;
        scenery.targets.forEach((t, i) => { t.r = t.r0 * (i === scenery.active && !moving ? big : 1); });
        R.targets.forEach((t, i) => { const on = i === scenery.active && !moving, k = on ? big : 1; t.group.scale.setScalar(k); t.group.position.y = t.baseY + A.centreH * (1 - k); });
        arcMat.size = plan.ends[e].bigArc ? 0.27 : 0.16;
        // the first aim points at the target's middle, a little high for the drop (the balloons: up the middle of the range)
        st.yaw = isBal ? 0 : Math.atan2((isGong ? G.v : tg.moving ? 0 : tg.v) - ARCH.muzzle.v, tg.u - ARCH.muzzle.u);
        st.pitch = isBal ? BAL_AIM0 : 0.03;
        // the very first aim of the first try starts a little off the target, so the first thing to learn (move the circle onto it) is a real thing to do
        if (ctx.first && e === 0) st.yaw += 0.11;
        st.camYaw = st.yaw; st.camPitch = st.pitch;
      };
      // (the balloon end has no one distance: the crosshair is drawn at the depth of the balloon the aim is nearest to)
      const endDist = e => (plan.ends[e].target === 'balloons' ? (bAim ? bAim.u : 10.5) : plan.ends[e].target === 'moving' ? A.moving.dist : plan.ends[e].target === 'gong' ? G.dist : A.targets[plan.ends[e].target].dist);
      const isBonus = e => typeof plan.ends[e].target === 'string';
      const isBalEnd = () => st.end >= 0 && plan.ends[st.end].target === 'balloons';

      const pipsFor = () => {
        const e = plan.ends[st.end], n = e.arrows, balE = e.target === 'balloons';
        let key = st.end * 1000 + st.scores.length * 10 + st.arrow;
        if (balE) for (const s of st.scores) key += s * 10000;       // an arrow's points grow while its chain runs
        if (memo.pips === key) return;
        memo.pips = key;
        let html = '';
        for (let i = 0; i < n; i++) {
          const s = st.scores[i];
          if (s === undefined) html += '<span class="pip left"></span>';
          else if (balE) html += `<span class="pip s${s ? 1 : 0}" style="${s ? `background:${s >= 9 ? '#ffbf1c' : '#f46e52'};color:${s >= 9 ? '#7a4a22' : '#fff'}` : ''}">${s || '×'}</span>`;
          else html += `<span class="pip s${s ? 1 : 0}" style="${s ? `background:${RING_COLOURS[s - 1]};color:${s >= 5 && s <= 6 ? '#fff' : s >= 9 || s <= 2 ? '#7a4a22' : '#fff'}` : ''}">${s || '×'}</span>`;
        }
        el.pips.innerHTML = html;
      };
      const setEndLabel = () => {
        const e = st.end;
        setText(el.endB, 'endLabel', plan.ends[e].target === 'moving'
          ? tx('Bonus end · sliding target')
          : plan.ends[e].target === 'gong' ? tx('Bonus end · swinging gong')
            : plan.ends[e].target === 'balloons' ? tx('Last end · balloons')
              : tx('End {n} of {total} · {d} m', { n: e + 1, total: plan.ends.filter(x => typeof x.target === 'number').length, d: endDist(e) }));
      };

      // ---- the page's wind gauge (the sock itself shows in the world)
      const setWindGauge = w => {
        const wr = Math.round(w * 10);
        if (memo.wr === wr) return;
        memo.wr = wr;
        const m = Math.abs(w), n = m < 0.4 ? 0 : Math.min(4, 1 + Math.floor(m / 1.1));
        el.windDir.textContent = n ? (w > 0 ? '›'.repeat(n) : '‹'.repeat(n)) : '·';
        el.windN.textContent = `${m.toFixed(1)} m/s`;
      };

      // ---- projections for the crosshair and the sight pins
      const cam = g.camera, ndc = new V3();
      const toScreen = (v, out) => { ndc.copy(v).project(cam); out.x = (ndc.x * 0.5 + 0.5) * innerWidth; out.y = (-ndc.y * 0.5 + 0.5) * innerHeight; return ndc.z < 1; };
      const scr = { x: 0, y: 0 };

      // ---- the first picture: she stands at the line; the camera comes in behind her shoulder
      st.end = 0;
      showEnd(0);
      const placeAim = (dt, sw) => {
        // the camera's own aim eases toward the player's (a small lag keeps it from jittering with the hand)
        const k = Math.min(1, dt * 14);
        st.camYaw += (st.yaw - st.camYaw) * k; st.camPitch += (st.pitch - st.camPitch) * k;
        // the arrow's start: the bow hand
        W(ARCH.muzzle.u - 0.25, ARCH.muzzle.v, A.eye, eyeW);
        eyeW.y += 0;
        // (the balloon end: the camera keeps its own tilt up the range and turns only a little with the aim)
        const CB = bal ? camBal(cam) : null;
        const cyaw = CB ? st.camYaw * CB.follow : st.camYaw, cpit = CB ? CB.pitch + (st.camPitch - BAL_AIM0) * CB.follow : st.camPitch;
        const cp = Math.cos(cpit);
        camD.set(-cp * Math.cos(cyaw), Math.sin(cpit), -cp * Math.sin(cyaw));
        const yy = st.yaw + (sw ? sw.yaw : 0), pp = st.pitch + (sw ? sw.pitch : 0), cq = Math.cos(pp);
        aimD.set(-cq * Math.cos(yy), Math.sin(pp), -cq * Math.sin(yy));
      };
      placeAim(1, null);
      camR.set(-camD.z, 0, camD.x).normalize();
      { const C = cam.aspect < 0.9 ? CAM_TALL : CAM; camPos.copy(eyeW).addScaledVector(camD, -C.back).addScaledVector(camR, C.side); camPos.y += C.up; camLook.copy(eyeW).addScaledVector(camD, C.conv); }
      g.follow.cutscene({ pos: camPos, look: camLook }, 0.001);
      g.follow.track(() => camPos, () => camLook, 8);
      st.mode = 'aim'; st.modeK = 8;

      ctx.debug.archery = () => ({
        phase: st.phase, end: st.end, arrow: st.arrow, shots: st.shots, total: st.total, scores: st.scores.slice(), ends: st.ends || null, left: st.left, draw: st.draw,
        yaw: st.yaw, pitch: st.pitch, wind: windAt(wind, Math.max(0, st.end), st.windT), windT: st.windT, bulls: st.bulls, hits: st.hits, plan: plan.ends.map(e => e.arrows),
        hit: st.hitW.toArray(), alive: pool.filter(s => s.use !== 'free').length, mode: st.mode, steady: st.steady, arc: arcMat.opacity, sock: R.sockWind,
      });
      /** QA: shoot now with a given aim and draw (the next 'ready' frame), exactly as the pure rules fly it. */
      ctx.debug.fire = (yaw, pitch, draw = 1) => { st.script = { yaw, pitch, draw }; };
      /** QA: the balloon end as it stands (null before it): the balloons with where they are on the screen, the sandbags, the points. */
      ctx.debug.balloons = () => {
        if (!bal) return null;
        const S = bal.S, o = { x: 0, y: 0 };
        return {
          t: S.t, wave: S.wave, done: S.done, score: S.score, popped: S.popped, lost: S.lost, away: S.away, best: bal.best, falling: S.weights.filter(x => x.on).length,
          up: S.balloons.filter(b => b.state === 'up').map(b => { W(b.u, b.sv, b.sy, tmpV); toScreen(tmpV, o); return { id: b.id, kind: b.kind, group: b.group, u: b.u, v: +b.sv.toFixed(2), y: +b.sy.toFixed(2), sx: Math.round(o.x), sy: Math.round(o.y) }; }),
          drawn: balVis.root.children[0].count, sandbags: balVis.root.children[3].count,
        };
      };
      /** QA: the aim that pops a balloon now (id, or 'top': the top one of the tallest stack still up). */
      ctx.debug.solveBalloon = (id = 'top') => {
        if (!bal) return null;
        let b = bal.S.balloons[id];
        if (id === 'top') {
          const n = {};
          for (const x of bal.S.balloons) if (x.state === 'up') n[x.group] = (n[x.group] || 0) + 1;
          const gr = Object.keys(n).sort((p, q) => n[q] - n[p] || p - q)[0];
          b = gr === undefined ? null : topOf(bal.S, +gr);
        }
        return b && b.state === 'up' ? { id: b.id, group: b.group, ...solveBalloon(b, 1, wind, st.end, st.windT + 0.05, A.eye) } : null;
      };
      ctx.debug.camBal = { wide: CAM_BAL, short: CAM_BAL_SHORT, tall: CAM_BAL_TALL };      // QA: the balloon end's camera (the numbers can be tried live)
      /** QA: where the balloons' whole climb falls on the screen (px): the box round every place a balloon of this end can be. */
      ctx.debug.balloonBox = () => {
        const o = { x: 0, y: 0 }, box = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
        for (const u of [9.5, 12.5]) for (const v of [-3.3, 3.3]) for (const y of [0.5, BAL.ceil + 0.52]) {
          W(u, v, y, tmpV); toScreen(tmpV, o);
          box.x0 = Math.min(box.x0, o.x); box.x1 = Math.max(box.x1, o.x); box.y0 = Math.min(box.y0, o.y); box.y1 = Math.max(box.y1, o.y);
        }
        return box;
      };
      /** QA: the aim that hits the middle of the current target for the wind as it is now. */
      ctx.debug.solve = (draw = 1) => solveAim(scenery.active, draw, wind, st.end, st.windT + 0.05, scenery, A.eye);
      /** QA: set the seconds left on the clock (to reach the time-up path quickly). */
      ctx.debug.setLeft = sec => { st.left = sec; };
      ctx.debug.scene = scenery;
      /** QA: hold the draw at this many seconds (undefined: let it run). */
      ctx.debug.freeze = sec => { st.qaDraw = sec; };
      ctx.debug.stance = STANCE;
      ctx.debug.camCfg = cam.aspect < 0.9 ? CAM_TALL : CAM;
      ctx.debug.arms = () => ({ reachL: rig.reachL, reachR: rig.reachR, eL: rig.elbowL.toArray(), eR: rig.elbowR.toArray(), sL: rig.shoulderL.toArray(), sR: rig.shoulderR.toArray(), gL: rig.gripL.toArray(), hR: rig.hookR.toArray(), M: bowM.toArray() });
      ctx.debug.rig = () => ({ ok: rig.ok, reachL: +rig.reachL.toFixed(3), reachR: +rig.reachR.toFixed(3), gripL: rig.gripL.toArray().map(v => +v.toFixed(3)), hookR: rig.hookR.toArray().map(v => +v.toFixed(3)), M: bowM.toArray().map(v => +v.toFixed(3)), root: p.root.position.toArray().map(v => +v.toFixed(3)), facing: p.facing, aim: aimD.toArray() });
      let dbgCam = null;
      /** QA: a free camera ({ pos: [x,y,z], look: [x,y,z] } in world units), or null for the round's own. */
      ctx.debug.cam = c => { dbgCam = c ? { pos: new V3(...c.pos), look: new V3(...c.look), fov: c.fov } : null; };

      el.leave.style.display = '';
      ctx.hud(0, ctx.roundTime);
      await ctx.wait(0.1);
      await ctx.fade(false, 450);
      if (ctx.quit) return { score: 0, quit: true };
      ctx.hintTop(true, touch ? 150 : 128);
      if (!ctx.first) {
        ctx.hint(touch ? N_('Hold Draw and drag to aim. Let go to shoot. Watch the wind sock!')
          : N_('Aim with the mouse. Hold {act} (or the mouse button) to draw, let go to shoot. Space steadies you.'), 7);
      }

      // -------------------------------------------------------------------------- the round
      const padHeld = () => {
        if (input.gamepadIndex === null && input.lastDevice !== 'gamepad') return false;
        const pads = navigator.getGamepads?.() ?? [];
        const gp = input.gamepadIndex !== null ? pads[input.gamepadIndex] : [...pads].find(Boolean);
        return !!gp && (gp.buttons[7]?.value > 0.4 || !!gp.buttons[2]?.pressed);
      };
      const finishEnd = () => {
        const sum = st.scores.reduce((s, v) => s + v, 0);
        (st.ends ??= []).push(sum);
      };
      const stuckAt = (s, a) => {
        // pin the arrow where it stopped: tip a little inside what it hit, shaft pointing back along its flight
        W(a.u, a.v, a.y, tmpV);
        dirW(a.vu, a.vv, a.vy, tmpD);
        const into = a.state === 'hit' || a.state === 'other' ? 0.2 : 0.1;
        s.mesh.position.copy(tmpV).addScaledVector(tmpD, into);
        tmpO.position.copy(s.mesh.position);
        tmpO.lookAt(tmpV.copy(s.mesh.position).add(tmpD));
        s.base.copy(tmpO.quaternion);
        s.mesh.quaternion.copy(s.base);
        s.wob = a.state === 'hit' || a.state === 'other' ? 1 : 0.3;
        s.use = 'stuck'; s.age = 0;
        if (a.hitIdx === MOVING && (a.state === 'hit' || a.state === 'other')) { R.moving.group.attach(s.mesh); s.moving = true; }
        // a rubber-tipped arrow rings the gong and drops away: it does not stick in bronze
        if (a.hitIdx === GONG && a.state === 'hit') { release(s); if (gong) gong.ring = 1; }
      };

      let lastHold = false, tick = 0;
      const fire = () => {
        const s = st.cur;
        const aim = clampAim({ yaw: st.yaw + st.sw.yaw, pitch: st.pitch + st.sw.pitch }, cone);
        const balE = isBalEnd();
        if (balE) { st.scores.push(0); pipsFor(); }                 // this arrow's points come as its chain runs
        launch(s.a, aim, st.draw, st.windT, A.eye);
        s.use = 'fly'; s.a.state = 'fly';
        st.phase = 'flight'; st.t = 0; st.shots++;
        W(s.a.u, s.a.v, s.a.y, s.mesh.position);
        s.lead = Math.max(0, ARROW_LEN - nockAt(st.draw));          // the nocked arrow's tip stood this far ahead of the muzzle
        st.relT = 0; st.relDraw = st.draw;
        st.done.shot = true;
        st.slow = slowMo(ctx.first, st.shots);                       // the first arrow of the first try flies in slow motion
        if (st.slow) ctx.hint(N_('Watch it fly!'), 2.4);
        // the twang and whoosh
        audio.tone(210 + st.draw * 90, { type: 'triangle', dur: 0.18, vol: 0.09, glide: 0.8, rev: 0.1 });
        audio.noise({ dur: 0.14, vol: 0.05, freq: 3000, q: 1.2, sweep: 0.5 });
        if (!balE) setMode('flight', 7);                             // (the balloons are watched from the line: the picture stays)
        tick = 0; lastHold = false;
        st.drawShown = st.draw; st.draw = 0; st.drawT = 0;
      };
      const landed = (s, a) => {
        W(a.u, a.v, a.y, st.hitW);
        stuckAt(s, a);
        let ring = 0;
        const hit = a.state === 'hit';
        if (hit) { ring = a.ring; st.hits++; }
        st.scores.push(ring);
        st.total += ring;
        if (ring >= ARCH.perfect) st.bulls++;
        st.phase = 'impact'; st.t = 0;
        setMode('impact', 6);
        // the thunk, a puff, the number
        const col = hit ? (ring >= 9 ? [1, 0.86, 0.3] : [0.92, 0.78, 0.45]) : [0.62, 0.52, 0.36];
        fx.burst?.(st.hitW, { n: ring >= 9 ? 26 : hit ? 12 : 8, color: col, speed: hit ? 2.3 : 1.4, life: 0.8, size: 0.13, gravity: 1.2 });
        audio.noise({ dur: 0.1, vol: hit ? 0.22 : 0.12, freq: hit ? 320 : 200, q: 0.8, type: 'lowpass' });
        audio.tone(hit ? 96 : 70, { type: 'triangle', dur: 0.14, vol: 0.16, glide: 0.6, rev: 0.05 });
        if (hit && a.hitIdx === GONG) { audio.tone(196, { type: 'sine', dur: 1.6, vol: 0.2, rev: 0.6 }); audio.tone(293.7, { type: 'triangle', dur: 1.1, vol: 0.08, rev: 0.6 }); }
        if (ring >= ARCH.perfect) { audio.star(); p.gesture?.('Cheer', { lock: false }); fx.burst?.(st.hitW, { n: 40, color: [1, 0.9, 0.4], speed: 4, life: 1.2, size: 0.18, gravity: -0.3 }); }
        else if (ring >= 7) audio.good(); else if (hit) audio.blip(1.2); else audio.miss();
        // the number pops where it landed
        const vis = toScreen(st.hitW, scr);
        const pop = el.pop;
        pop.textContent = !hit ? tx('Miss') : ring >= ARCH.perfect ? tx('Perfect!') : `${ring}`;
        pop.classList.toggle('big', ring >= ARCH.perfect);
        pop.style.left = `${Math.max(40, Math.min(innerWidth - 40, vis ? scr.x : innerWidth / 2))}px`;
        pop.style.top = `${Math.max(90, Math.min(innerHeight - 160, vis ? scr.y - 40 : innerHeight / 2))}px`;
        pop.classList.remove('go'); void pop.offsetWidth; pop.classList.add('go');
        // what Grandma says: on the first try every arrow gets an answer (it flew to the target, or why it missed), later only now and then
        const why = missReason(a, windAt(wind, st.end, st.windT));
        if (a.state === 'other') hint('other', MISS.other, 3);
        else if (ring >= 9) ctx.hint(N_('Bullseye! The village will hear about this.'), 3);
        else if (ctx.first) {
          if (hit) ctx.hint(st.shots === 1 ? N_('Great! It flew to the target') : GRADE[ring >= 7 ? 1 : 0], 3.5);
          else ctx.hint(why === 'low' && st.shots === 1 ? N_('Not on the target yet. Arrows drop as they fly: aim a little higher.') : MISS[why] || MISS.low, 4.2);
        } else if (!hit && a.state === 'ground' && st.shots < 5) hint('short2', MISS.short, 3.5);
        pipsFor();
      };
      // ---- the balloon end: an arrow of it has stopped (it popped what it crossed on the way), and what the stage reports
      const landedBal = (s, a) => {
        W(a.u, a.v, a.y, st.hitW);
        // over the net it is gone into the hillside; lower it sticks in the hay or the grass
        if (a.state === 'back' && a.y > 3.3) release(s); else { stuckAt(s, a); audio.noise({ dur: 0.08, vol: 0.1, freq: 220, q: 0.8, type: 'lowpass' }); }
        if (bal.S.chain[st.arrow]) st.hits++;
        else { audio.miss(); if (!st.said.balTop && bal.noteT <= 0 && st.arrow >= 1) { st.said.balTop = true; guide.setNote(N_('Aim at the top balloon of a stack.')); bal.noteT = 4; } }
        st.phase = 'impact'; st.t = 0;
      };
      const popAt = (text, big) => {
        const vis = toScreen(tmpV, scr), pop = el.pop;
        pop.textContent = text;
        pop.classList.toggle('big', !!big);
        pop.style.left = `${Math.max(60, Math.min(innerWidth - 60, vis ? scr.x : innerWidth / 2))}px`;
        pop.style.top = `${Math.max(130, Math.min(innerHeight - 160, vis ? scr.y - 30 : innerHeight / 2))}px`;
        pop.classList.remove('go'); void pop.offsetWidth; pop.classList.add('go');
      };
      const balEvents = () => {
        const ev = bal.ev;
        for (let i = 0; i < ev.length; i++) {
          const e = ev[i];
          if (e.type === 'pop') {
            const b = e.b, col = b.gold ? BALLOON_GOLD_RGB : BALLOON_RGB[b.col % BALLOON_RGB.length];
            W(b.u, b.sv, b.sy, tmpV);
            // confetti in the balloon's colour, a few white scraps, and a pop that climbs with the chain
            fx.burst?.(tmpV, { n: b.gold ? 30 : 18, color: col, speed: 3.4, life: 0.9, size: 0.17, gravity: 2.6 });
            fx.burst?.(tmpV, { n: 6, color: [1, 1, 1], speed: 2.2, life: 0.5, size: 0.11, gravity: 1.5 });
            audio.noise({ dur: 0.07, vol: 0.26, freq: 2600, q: 0.7, type: 'highpass' });
            audio.tone(330 * (1 + 0.26 * Math.min(5, e.chain - 1)), { type: 'triangle', dur: 0.12, vol: 0.14, glide: 0.5, rev: 0.05 });
            if (e.lost) {
              bal.lost++;
              // the first balloon that pops by itself is explained once (at the foot of the picture, clear of the balloons)
              if (e.by === 'self') { popAt(tx('Pop!'), false); if (!st.said.selfPop) { st.said.selfPop = true; guide.setNote(N_('Too high: it popped by itself! Shoot the high balloons first.')); bal.noteT = 5; } }
            } else {
              bal.popped++;
              st.total += e.pts;
              if (st.scores[e.root] !== undefined) st.scores[e.root] += e.pts;
              if (e.chain > bal.best) bal.best = e.chain;
              popAt(e.mult > 1 ? `${tx('Chain ×{n}!', { n: e.mult })} +${e.pts}` : `+${e.pts}`, e.mult > 1 || b.gold);
              if (b.gold) audio.star(); else if (e.mult > 1) audio.good();
              if (e.mult === 3) p.gesture?.('Cheer', { lock: false });
              pipsFor();
            }
          } else if (e.type === 'thud') {
            W(e.u, e.v, e.y + 0.05, tmpV);
            fx.burst?.(tmpV, { n: 6, color: [0.72, 0.62, 0.44], speed: 1.2, life: 0.6, size: 0.12, gravity: 1.5 });
            audio.noise({ dur: 0.09, vol: 0.12, freq: 180, q: 0.8, type: 'lowpass' });
          } else if (e.type === 'wave' && e.n > 0) audio.blip(1.4);
        }
        ev.length = 0;
      };
      const showSummary = () => {
        const e = st.end, sum = st.ends[st.ends.length - 1];
        setMode('aim', 8);
        ctx.hint(plan.ends[e].target === 'balloons' ? tx('Balloons: {n} points.', { n: sum }) : plan.ends[e].target === 'moving' ? tx('Bonus end: {n} points.', { n: sum }) : plan.ends[e].target === 'gong' ? tx('The gong: {n} points.', { n: sum }) : tx('End {n}: {pts} points.', { n: e + 1, pts: sum }), 2);
        audio.good();
      };

      const bowAt = new V3(), bowM = new V3(), bowL = new V3(), bowU = new V3(), bowQ = new THREE.Quaternion(), AXZ = new V3(0, 0, 1);
      const res = await ctx.loop(dt => {
        st.t += dt;
        const ph = st.phase;
        // ---- time: it runs only while the player is lining up a shot
        const helpUp = guide.isOpen;       // the "How to shoot" card holds the round still
        if (helpUp && (input.pressed('act') || input.pressed('jump'))) guide.dismiss();
        const timed = (ph === 'ready' || ph === 'draw') && !helpUp;
        if (timed) st.left = Math.max(0, st.left - dt);
        st.windT += dt;
        const w = st.end >= 0 ? windAt(wind, st.end, st.windT) : 0;
        st.wS += (w - st.wS) * Math.min(1, dt * 4);

        // ---- input: aim, draw, breathe
        const held = !helpUp && (input_.mouse || input.held('act') || input_.btn || padHeld());
        if (!held) { st.free += dt; if (st.free > 0.2 && !helpUp) st.armed = true; } else st.free = 0;
        let dx = 0, dy = 0;
        const mouseMoved = input_.mdx !== 0 || input_.mdy !== 0;
        // a stick sweeps the cone in a blink at the touch/mouse scale: slow it down
        const lookK = input.lastDevice === 'gamepad' ? 0.35 : 1;
        if (mouseMoved) { dx += input_.mdx; dy += input_.mdy; } else { dx += input.look.x * lookK; dy += input.look.y * lookK; }
        dx += input_.padDX; dy += input_.padDY;
        input_.mdx = input_.mdy = input_.padDX = input_.padDY = 0;
        const fine = ph === 'draw' ? 0.6 : 1;
        const canAim = (ph === 'ready' || ph === 'draw') && !helpUp;
        let moved = 0;
        if (canAim) {
          const yaw0 = st.yaw, pit0 = st.pitch;
          st.yaw += dx * LOOK * fine + input.move.x * KEYAIM * fine * dt;
          st.pitch += -dy * LOOK * 0.9 * fine + input.move.y * KEYAIM * 0.6 * fine * dt;
          clampAim(st, cone);
          moved = Math.abs(st.yaw - yaw0) + Math.abs(st.pitch - pit0);
          st.aimAcc += moved;
        }
        // the first try's idle clock: seconds of neither aiming nor drawing (the ghost hand shows how at guideIdle)
        if (ph === 'ready' && !helpUp && !held && moved < 1e-4) st.idle += dt; else st.idle = 0;
        const breathe = !helpUp && (input_.breatheTap || input.pressed('jump'));
        input_.breatheTap = false;
        st.steadyCool = Math.max(0, st.steadyCool - dt);
        if (st.steady > 0) { st.steady -= dt; if (st.steady <= 0) st.steadyCool = ARCH.steadyCool; }
        if (breathe && canAim && st.steady <= 0 && st.steadyCool <= 0) { st.steady = ARCH.steady; audio.blip(0.7); }

        // ---- phases
        if (ph === 'intro') {
          if (st.t > 1.1) { st.phase = 'endIntro'; st.t = 0; setEndLabel(); pipsFor(); }
        } else if (ph === 'endIntro') {
          if (st.t > 1.4) {
            st.phase = 'ready'; st.t = 0; st.cur = take();
            if (ctx.first && !st.helpSeen) { st.helpSeen = true; guide.open(dev()); }      // the first try starts with the "How to shoot" card
            // what the level changes is said once, at the first arrow
            if (isBalEnd()) { /* (QA can start at the balloons: the level's first words belong to the targets) */ }
            else if (!ctx.first && st.end === 0 && ctx.easy) hint('lvEasy', N_('No wind today. Follow the dotted line: arrows drop as they fly.'), 4.5);
            else if (!ctx.first && st.end === 0 && ctx.hard) hint('lvHard', N_('Strong gusts today, and no dotted line. Watch the sock before every arrow.'), 4.5);
            // the balloon end is introduced in one line at the foot of the picture, and on the card while it is played
            // (and the game's own hint line moves under the balloons for this end, so nothing is said across their climb)
            if (isBalEnd()) { guide.setTip(BALLOON_NOTE); guide.setNote(BALLOON_NOTE); bal.noteT = 7; }
          }
        } else if (ph === 'ready' && bal && bal.S.done) {
          // every balloon is popped or gone before the arrows are: the end is over
          st.phase = 'endSum'; st.t = 0; finishEnd(); showSummary();
        } else if (ph === 'ready' || ph === 'draw') {
          if (st.script && ph === 'ready') {
            const sc = st.script; st.script = null;
            st.yaw = sc.yaw; st.pitch = sc.pitch; clampAim(st, cone);
            st.draw = sc.draw; st.sw.yaw = st.sw.pitch = 0;
            fire();
          } else if (ph === 'ready') {
            if (held && st.armed && st.left > 0) { st.phase = 'draw'; st.drawT = 0; st.done.drew = true; audio.reel(); }
          } else {
            st.drawT = st.qaDraw !== undefined ? st.qaDraw : st.drawT + dt;      // (QA can freeze the draw at a given second)
            st.draw = drawAt(st.drawT);
            swayAt(st.t * 1.0, swayAmp(st.drawT, st.steady), st.sw);
            tick -= dt;
            if (st.draw < 1 && tick <= 0) { tick = 0.11; audio.reel(); }
            if (st.draw >= 1 && lastHold === false) { audio.blip(1.7); }
            lastHold = st.draw >= 1;
            if (!held) {
              if (st.draw < ARCH.minDraw) { st.phase = 'ready'; st.draw = 0; st.drawT = 0; hint('short', N_('Draw a little longer, then let go.'), 3); }
              else fire();
            } else if (st.left <= 0) { st.phase = 'ready'; st.draw = 0; }
            else if (st.drawT > ARCH.drawTime + ARCH.holdFree + 1.2 && !st.said.tremble) { st.said.tremble = true; ctx.hint(N_('Steady... press Space or Breathe to calm the bow.'), 3.5); }
          }
          if (st.left <= 0 && st.phase !== 'flight') { st.phase = 'timeUp'; st.t = 0; ctx.hint(N_('Time is up! Well shot.'), 3); audio.good(); setMode('aim', 8); }
        } else if (ph === 'flight') {
          const s = st.cur, a = s.a, balE = isBalEnd();
          if (balE) stepArrowBalloons(a, wind, st.end, dt, scenery, bal.S, st.arrow, bal.ev);
          else stepArrow(a, wind, st.end, st.slow ? dt * SLOWMO : dt, scenery);
          W(a.u, a.v, a.y, s.mesh.position);
          dirW(a.vu, a.vv, a.vy, tmpD);
          if (a.state === 'fly' && a.t < 0.12 && s.lead > 0) s.mesh.position.addScaledVector(tmpD, s.lead * (1 - a.t / 0.12));
          if (a.state === 'fly') {
            tmpO.position.copy(s.mesh.position);
            tmpO.lookAt(tmpV.copy(s.mesh.position).add(tmpD));
            s.mesh.quaternion.copy(tmpO.quaternion);
          } else if (balE) landedBal(s, a); else landed(s, a);
          if (st.t > (st.slow ? 7 : 4) && a.state === 'fly') { a.state = 'ground'; if (balE) landedBal(s, a); else landed(s, a); }
        } else if (ph === 'impact') {
          const balE = isBalEnd();
          if (st.t > (balE ? 0.45 : 1.15)) {
            st.arrow++;
            // (the balloons: the last arrow's chain is watched to its end before the end is summed up)
            if (st.arrow >= plan.ends[st.end].arrows || st.left <= 0) { if (balE) { st.phase = 'settle'; st.t = 0; } else { st.phase = 'endSum'; st.t = 0; finishEnd(); showSummary(); } }
            else { st.phase = 'ready'; st.t = 0; st.cur = take(); setMode('aim', 8); }
          }
        } else if (ph === 'settle') {
          if ((st.t > 0.5 && !falling(bal.S)) || st.t > 5) { st.phase = 'endSum'; st.t = 0; finishEnd(); showSummary(); }
        } else if (ph === 'endSum') {
          // pull the arrows (they shrink away), then the next end, or the finish
          for (const s of pool) if (s.use === 'stuck' || s.use === 'nock') { s.fade = Math.min(1, s.fade + dt / 0.5); { const f = Math.max(0.001, 1 - s.fade); s.mesh.scale.set(ARROW_XY * f, ARROW_XY * f, ARROW_Z * f); } if (s.fade >= 1) release(s); }
          if (st.t > 2.1) {
            if (st.end + 1 < plan.ends.length && st.left > 0) {
              st.end++; st.arrow = 0; st.scores = []; st.windT = 0; showEnd(st.end);
              for (const s of pool) release(s);
              st.phase = 'endIntro'; st.t = 0; st.draw = 0; setEndLabel(); pipsFor(); setMode('aim', 8);
              if (plan.ends[st.end].target === 'balloons') { /* introduced by the guide's own line when the first arrow is nocked */ }
              else if (plan.ends[st.end].target === 'moving') hint('moving', N_('Bonus end! The target slides: aim a little ahead of it.'), 4.5);
              else if (plan.ends[st.end].target === 'gong') hint('gong', N_('The gong! It is small and it swings. Let go just before it reaches your circle.'), 5);
              else if (st.end === 1) hint('far', N_('Farther away, so the wind has longer to push. Check the sock.'), 4);
            } else { st.phase = 'done'; st.t = 0; }
          }
        } else if (ph === 'timeUp') {
          if (st.t > 1.6) { finishEnd(); st.phase = 'done'; st.t = 0; }
        } else if (ph === 'done') {
          if (st.t > 0.6) return { done: true };
        }
        // the gong swings (a pendulum drawn from the rules' sideways place), and shivers when it is rung
        if (gong && gong.root.visible) {
          const dv = gongV(G, st.windT) - G.v;
          gong.ring = Math.max(0, gong.ring - dt * 1.4);
          gong.swing.rotation.x = Math.asin(Math.max(-0.9, Math.min(0.9, dv / gong.L)));
          gong.swing.rotation.z = Math.sin(ctx.t * 34) * 0.09 * gong.ring;
        }
        // the balloons rise and drift in the wind the sock shows (they hold still while the card is up and once the end is summed up)
        if (bal) {
          const S = bal.S, live = ph === 'ready' || ph === 'draw' || ph === 'flight' || ph === 'impact' || ph === 'settle';
          if (live && !helpUp) stepStage(S, dt, w, bal.ev);
          if (bal.ev.length) balEvents();
          bal.fly = live || ph === 'endIntro' ? 0 : Math.min(1, bal.fly + dt / 1.3);
          if (bal.noteT > 0 && !helpUp && (bal.noteT -= dt) <= 0) guide.setNote(null);
          // the game's own hint line moves under the balloons for this end, so nothing is said across their climb (while the card
          // is up it is back where the card expects it)
          const low = !helpUp;
          if (memo.hintLow !== low) { memo.hintLow = low; ctx.hintTop(true, low ? Math.max(150, innerHeight - (innerHeight < 500 ? 70 : cam.aspect < 0.9 ? 310 : 125)) : touch ? 150 : 128); }
          // the golden balloon twinkles
          if (live && (bal.spark -= dt) <= 0) {
            bal.spark = 0.35;
            for (const b of S.balloons) if (b.gold && b.state === 'up') { W(b.u, b.sv + (Math.random() - 0.5) * b.r * 1.6, b.sy + (Math.random() - 0.3) * b.r * 1.4, tmpV); fx.burst?.(tmpV, { n: 1, color: [1, 0.93, 0.55], speed: 0.4, life: 0.7, size: 0.16, gravity: -0.3 }); }
          }
          bAim = live ? nearestBalloon(S, st.yaw, st.pitch, ARCH.muzzle.u, ARCH.muzzle.v, A.eye) : null;
          balVis.draw(S, W, cam, ctx.t, bal.fly);
        }
        // the sliding target glides along its rail
        if (R.moving.group.visible) {
          const mv = movingV(A.moving, st.windT, period);
          R.moving.group.position.set(A.x - A.moving.u, hAt(A.x - A.moving.u, A.z - mv), A.z - mv);
        }

        // ---- the bow, the arrow in it, and the camera
        if (!(ph === 'flight' || ph === 'impact')) {
          const useSw = ph === 'draw' || ph === 'ready';
          placeAim(dt, useSw ? st.sw : null);
          if (ph === 'ready' || ph === 'endIntro' || ph === 'intro') { st.sw.yaw *= 0.8; st.sw.pitch *= 0.8; }
        } else placeAim(dt, null);
        const drawNow = ph === 'draw' ? st.draw : 0;
        // ---- Mika, her bow and the arrow in it: she turns side-on to the lane, the bow is held at the muzzle with its string back to her cheek
        st.relT += dt;
        st.hold = ph === 'done' ? Math.max(0, st.hold - dt * 3) : Math.min(1, st.hold + dt * 4);
        const rt = st.relT;
        // after the release the string rebounds (a quick, damped swing past rest) and the string hand springs back and out
        const drawVis = ph === 'draw' ? st.draw : rt < 0.6 ? Math.max(-0.25, st.relDraw * Math.exp(-rt * 15) * Math.cos(rt * 50)) : 0;
        const follow = Math.min(1, rt * 10) * Math.max(0, 1 - rt / 1.7) ** 2;
        bow.set(Math.round(drawVis * 200) / 200);
        tmpO.position.set(0, 0, 0);
        tmpO.lookAt(aimD.x, aimD.y, aimD.z);
        bowQ.copy(tmpO.quaternion).multiply(tmpQ.setFromAxisAngle(AXZ, BOW.cant));
        bowL.set(1, 0, 0).applyQuaternion(bowQ); bowU.set(0, 1, 0).applyQuaternion(bowQ);
        W(ARCH.muzzle.u, ARCH.muzzle.v, A.eye, bowM);                                      // where the arrow leaves (the rules' muzzle)
        bowAt.copy(bowM).addScaledVector(bowL, -BOW.restX).addScaledVector(bowU, -BOW.restY);   // the grip centre (the arrow lies left of it, on top)
        tmpV.copy(bow.nock).applyQuaternion(bowQ).add(bowAt).addScaledVector(bowU, -0.022);       // the string hand's hook, just under the nock
        if (rig.ok) { rig.update(bowAt, tmpV, aimD, Math.max(0, drawVis), st.hold, follow); bowAt.copy(rig.gripL); }
        p.facing = A.heading - st.yaw - STANCE.side * st.hold;
        p.root.rotation.y = p.facing;
        bow.root.position.copy(bowAt);
        bow.root.quaternion.copy(bowQ);
        bow.root.visible = ph !== 'done';
        const nockS = st.cur;
        if (nockS && nockS.use === 'nock' && (ph === 'ready' || ph === 'draw' || ph === 'endIntro')) {
          // the arrow lies on the bow's rest, its nock on the string: tip = tail + the arrow's length down the aim
          tmpV.set(BOW.restX, BOW.restY, bow.nock.z + ARROW_LEN).applyQuaternion(bowQ).add(bowAt);
          nockS.mesh.position.copy(tmpV);
          nockS.mesh.quaternion.copy(bowQ);
        }

        // camera
        if (st.mode === 'aim') {
          camR.set(-camD.z, 0, camD.x).normalize();
          const tall = cam.aspect < 0.9, C = bal ? camBal(cam) : tall ? CAM_TALL : CAM;
          // drawing: the camera comes in a little toward the line and the picture zooms, but Mika (and her string hand) stay in view
          // (not at the balloons: the picture holds still there, so the whole climb stays in it)
          const zoom = bal ? 0 : drawNow;
          camPos.copy(eyeW).addScaledVector(camD, -C.back).addScaledVector(camR, C.side * (1 - 0.22 * zoom)); camPos.y += C.up;
          camLook.copy(eyeW).addScaledVector(camD, C.conv);
          g.follow.fovBase = (C.fov || savedFov) * (1 - 0.1 * zoom);
        } else if (st.mode === 'flight') {
          const a = st.cur.a;
          W(a.u, a.v, a.y, tmpE);
          dirW(a.vu || 1, a.vv, a.vy, tmpD);
          camPos.copy(tmpE).addScaledVector(tmpD, -3.4); camPos.x += 0; camPos.y += 0.55; camPos.z -= 0.7;
          camLook.copy(tmpE).addScaledVector(tmpD, 8);
        } else if (st.mode === 'impact') {
          camPos.copy(st.hitW); camPos.x += 5.2; camPos.y += 1.5; camPos.z += 1.8;
          camLook.copy(st.hitW); camLook.y += 0.1;
        }
        if (dbgCam) { camPos.copy(dbgCam.pos); camLook.copy(dbgCam.look); if (dbgCam.fov) g.follow.fovBase = dbgCam.fov; }     // QA: a free camera (close-ups of her hands)
        // wobble of the stuck arrows
        for (const s of pool) if (s.use === 'stuck' && s.wob > 0.002) {
          s.age += dt;
          s.wob *= Math.exp(-dt * 3.2);
          const a1 = Math.sin(s.age * 38) * 0.12 * s.wob;
          tmpQ.setFromAxisAngle(tmpE.set(0, 1, 0), a1); s.mesh.quaternion.copy(s.base).multiply(tmpQ);
          tmpQ.setFromAxisAngle(tmpE.set(1, 0, 0), Math.cos(s.age * 31) * 0.1 * s.wob); s.mesh.quaternion.multiply(tmpQ);
        }

        // ---- the aim arc (faint on later tries), the sight pins, the crosshair and its ring
        const alpha = plan.noArc ? 0 : plan.arc ? 1 : arcAlpha(plays, easy);
        const arcOn = (ph === 'ready' || ph === 'draw') && alpha > 0.02;
        const targetOp = arcOn ? 0.85 * alpha : 0;
        if (Math.abs(arcMat.opacity - targetOp) > 0.01) arcMat.opacity += (targetOp - arcMat.opacity) * Math.min(1, dt * 8);
        if (arcMat.opacity > 0.02) {
          arc({ yaw: st.yaw + st.sw.yaw, pitch: st.pitch + st.sw.pitch }, Math.max(0.5, st.draw || 1), ARC_N, 0.032, arcLane, A.eye);
          for (let i = 0; i < ARC_N; i++) { W(arcLane[i * 3], arcLane[i * 3 + 1], arcLane[i * 3 + 2], tmpV); arcPos[i * 3] = tmpV.x; arcPos[i * 3 + 1] = tmpV.y; arcPos[i * 3 + 2] = tmpV.z; }
          arcAttr.needsUpdate = true;
          // the arrow starts at the bow, so the first dots start there too
        }
        const pw = ph === 'draw' ? Math.max(0.3, st.draw) : 1, spd = speedFor(pw), pcp = Math.cos(st.pitch);
        const pvu = spd * pcp * Math.cos(st.yaw), pvv = spd * pcp * Math.sin(st.yaw), pvy = spd * Math.sin(st.pitch);
        for (let i = 0; i < 3; i++) {
          const U = A.targets[i].dist, tt = (U - ARCH.muzzle.u) / pvu;
          W(U, ARCH.muzzle.v + pvv * tt, A.eye + pvy * tt - 0.5 * ARCH.g * tt * tt, tmpV);
          const vis = toScreen(tmpV, scr);
          const cx = innerWidth / 2, cy = innerHeight / 2;
          const px = Math.round((scr.x - cx) * 2) / 2, py = Math.round((scr.y - cy) * 2) / 2, show = vis && !bal && (ph === 'ready' || ph === 'draw') && !(ctx.first && st.end === 0) && Math.abs(px) < innerWidth * 0.45 && Math.abs(py) < innerHeight * 0.45;
          setStyle(el.ticks[i], `tk${i}`, 'transform', show ? `translate(${px}px,${py}px)` : 'translate(-999px,-999px)');
        }
        // the crosshair stands where an arrow of a full draw (no wind) would cross the plane of the target in play: the camera looks
        // past Mika's shoulder, so it is not the middle of the picture. The halo turns green when that is on the target's face.
        const aimTot = { yaw: st.yaw + st.sw.yaw, pitch: st.pitch + st.sw.pitch }, d0 = endDist(Math.max(0, st.end));
        const s1 = speedFor(1), cpT = Math.cos(aimTot.pitch), t1 = (d0 - ARCH.muzzle.u) / (s1 * cpT * Math.cos(aimTot.yaw));
        W(d0, ARCH.muzzle.v + s1 * cpT * Math.sin(aimTot.yaw) * t1, A.eye + s1 * Math.sin(aimTot.pitch) * t1 - 0.5 * ARCH.g * t1 * t1, tmpV);
        const vis0 = toScreen(tmpV, scr), lim = 0.45;
        const ox = vis0 ? Math.round(Math.max(-innerWidth * lim, Math.min(innerWidth * lim, scr.x - innerWidth / 2)) * 2) / 2 : 0;
        const oy = vis0 ? Math.round(Math.max(-innerHeight * lim, Math.min(innerHeight * lim, scr.y - innerHeight / 2)) * 2) / 2 : 0;
        setStyle(el.cross, 'cross', 'transform', `translate(${ox}px,${oy}px)`);
        const tgA = scenery.targets[scenery.active], aimPh = ph === 'ready' || ph === 'draw';
        // (the balloons: green when a full-draw arrow would cross the nearest one's hit circle where it hangs now)
        if (bAim) { tgB.u = bAim.u; tgB.v = bAim.sv; tgB.y = bAim.sy; tgB.r = bAim.r * bal.S.spec.hit; }
        const onTgt = aimPh && (bAim ? aimOffset(aimTot, 1, tgB, A.eye).on : !!tgA && !tgA.moving && aimOffset(aimTot, 1, tgA, A.eye).on);
        if (memo.halo !== (aimPh ? (onTgt ? 2 : 1) : 0)) {
          memo.halo = aimPh ? (onTgt ? 2 : 1) : 0;
          el.halo.classList.toggle('on', onTgt); el.halo.classList.toggle('off', !aimPh); el.cross.classList.toggle('on', onTgt);
        }
        // ---- the first try's guide: the cue under the crosshair, the marker over the target, the hint of the step, the ghost hand
        const cxs = innerWidth / 2 + ox, cys = innerHeight / 2 + oy;
        if (ctx.first && !helpUp && aimPh) {
          if (onTgt && st.aimAcc > 0.015) st.done.aimed = true;
          const step = guideStep(st.done, ph === 'draw');
          if (step !== st.stepKey) {
            st.stepKey = step; st.stepT = 0;
            if (step) ctx.hint(STEP_HINT[step][dev()], step === 'release' ? 4 : 6);
          } else if (step && (st.stepT += dt) > 9) { st.stepT = 0; ctx.hint(STEP_HINT[step][dev()], 5); }       // still not done: say it again
          guide.setCue(ph === 'ready' && ghostWanted(ctx.first, st.done, st.idle, helpUp) ? null : step, cxs, cys);      // (not under the ghost's own label)
          const mk = !!tgA && !tgA.moving && step === 'aim' && !onTgt;
          if (mk) { W(tgA.u, tgA.v, tgA.y, tmpV); toScreen(tmpV, scr); }
          guide.setMark(mk, scr.x, scr.y);
          const pulse = step === 'hold';
          if (memo.pulse !== pulse) { memo.pulse = pulse; el.draw.classList.toggle('pulse', pulse); }
          // the ghost: nothing done for guideIdle seconds -> it shows the draw, up to three times, then waits for the next idle spell
          if (ph === 'ready' && ghostWanted(ctx.first, st.done, st.idle, helpUp)) {
            if (st.ghostT < 0) st.ghostT = 0;
            st.ghostT += dt;
            if (st.ghostT > GHOST_LOOP * 3) { st.ghostT = -1; st.idle = 0; guide.setGhost(false); }
            else {
              const br = el.draw.getBoundingClientRect();
              if (tgA && !tgA.moving) { W(tgA.u, tgA.v, tgA.y, tmpV); toScreen(tmpV, scr); }
              guide.setGhost(true, st.ghostT, { cx: cxs, cy: cys, tx: scr.x, ty: scr.y, bx: br.left + br.width / 2, by: br.top + br.height / 2 });
            }
          } else if (st.ghostT >= 0) { st.ghostT = -1; guide.setGhost(false); }
        } else {
          guide.setCue(null, 0, 0); guide.setMark(false, 0, 0);
          if (st.ghostT >= 0) { st.ghostT = -1; guide.setGhost(false); }
          if (memo.pulse) { memo.pulse = false; el.draw.classList.remove('pulse'); }
        }
        const showRing = ph === 'draw';
        if (memo.ringOn !== showRing) { memo.ringOn = showRing; el.ring.classList.toggle('on', showRing); }
        const pct = Math.round(drawAt(st.drawT) * 50) * 2;
        if (showRing && memo.pct !== pct) { memo.pct = pct; el.ring.style.setProperty('--p', String(pct)); }
        const over = ph === 'draw' && st.drawT > ARCH.drawTime + ARCH.holdFree;
        const ringC = over ? '#ff8a4a' : pct >= 100 ? '#7fe06a' : '#ffd34a';
        if (memo.ringC !== ringC) { memo.ringC = ringC; el.ring.style.setProperty('--c', ringC); }
        if (memo.breathe !== (st.steady > 0 ? 2 : st.steadyCool > 0 ? 1 : 0)) {
          memo.breathe = st.steady > 0 ? 2 : st.steadyCool > 0 ? 1 : 0;
          el.breathe.classList.toggle('on', memo.breathe === 2); el.breathe.classList.toggle('cool', memo.breathe === 1);
        }
        setWindGauge(st.wS);
        // the sock follows the same eased wind (and a flutter clock)
        R.setWind(st.wS, ctx.t);
        ctx.hud(st.total, st.left);
        return undefined;
      });

      // ---- the round is over (or quit)
      const quit = !!res?.quit;
      if (quit) return { score: st.total, quit: true };
      ctx.hint(N_('That is the end of the round. Put the bow down and have a drink of water.'), 3.5);
      await ctx.fade(true, 300);
      cleanup();
      await ctx.fade(false, 400);
      const allHit = st.shots > 0 && st.hits === st.shots;
      return {
        score: st.total, quit: false, detail: { shots: st.shots, hits: st.hits, bulls: st.bulls, ends: st.ends, balloons: bal ? { popped: bal.popped, lost: bal.lost, chain: bal.best } : null },
        fact: { title: tx('Rings'), text: tx('The middle of the target is 10 (a bullseye). Each ring further out is worth 1 less. A miss is 0.') },
        extra: bal && bal.best >= 3 ? N_('a chain of three balloons!') : st.bulls >= 1 ? N_('a bullseye!') : allHit ? N_('every arrow found the target') : undefined,
      };

    } finally {
      // a quit or an error anywhere above: put everything back (the framework un-fades nothing, so do it here)
      if (!cleaned) { cleanup(); ctx.fade(false, 300); }
    }
  },
};
