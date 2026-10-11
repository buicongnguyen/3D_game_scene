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
// Drawing: a bow (a bent tube of 60 vertices rewritten each frame, a string), up to 12 pooled arrows sharing one geometry,
// a dotted aim arc (one Points), and a small DOM layer (crosshair with the draw ring, sight pins, wind gauge, buttons).
// Everything made here is removed and freed when the round ends, quit or not.
import * as THREE from 'three';
import { N_, tx } from '../../i18n/i18n.js';
import { addCss } from './util.js';
import { Kit, RING_COLOURS } from '../../world/archery.js';
import { ARCHERY } from '../../content/archery.js';
import {
  ARCH, roundPlan, arcAlpha, makeWind, windAt, drawAt, speedFor, swayAmp, swayAt, clampAim, movingV, launch, stepArrow, arc, solveAim,
} from './rules-archery.js';

const V3 = THREE.Vector3;
const A = ARCHERY;
const POOL = 12;            // arrows alive at most (6 stuck per end + the one nocked + slack)
const ARROW_XY = 2.6, ARROW_Z = 1.2;   // the practice arrows are drawn thicker than life so they read from the line
const ARC_N = 26;           // dots in the aim arc
const BOW_N = 13;           // rings along the bow's limbs
const CAM_BACK = 2.6;       // the camera stands this far behind the bow hand...
const CAM_SIDE = 0.55, CAM_UP = 0.5;   // ...a little to the right and above it, so the bow and Mika sit low on the left
const CONVERGE = 17;        // and looks at the bore line this far down the range
const LOOK = 0.0016;        // radians of aim per pixel dragged (mouse, finger)
const KEYAIM = 0.5;         // radians per second with the keys or the stick

const GRADE = [N_('Nice shot!'), N_('Very close!')];

const CSS = `
#archUi{position:fixed;inset:0;z-index:15;pointer-events:none;font:700 14px Nunito,system-ui,sans-serif;color:#5a3a22;user-select:none;-webkit-user-select:none;touch-action:none}
#archUi .panel{position:absolute;padding:6px 12px;border-radius:14px;background:rgba(255,247,232,.93);box-shadow:0 4px 14px rgba(40,20,0,.22);zoom:var(--ui-scale,1)}
#archUi .end{left:50%;top:calc(62px + env(safe-area-inset-top,0px));transform:translateX(-50%);text-align:center;white-space:nowrap}
#archUi .end b{font:600 16px Fredoka,Nunito,sans-serif;color:#c2541c}
#archUi .pips{display:flex;gap:5px;justify-content:center;margin-top:4px}
#archUi .pip{min-width:20px;height:20px;padding:0 3px;border-radius:10px;background:#ead9b8;font:600 12px/20px Fredoka,Nunito,sans-serif;color:#fff;text-align:center;box-sizing:border-box}
#archUi .pip.left{background:#d9c49a}
#archUi .pip.s0{background:#b6aca0}
#archUi .wind{right:calc(10px + env(safe-area-inset-right,0px));top:calc(62px + env(safe-area-inset-top,0px));text-align:center;min-width:64px}
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
#archLeave{position:absolute;left:calc(10px + env(safe-area-inset-left,0px));top:calc(62px + env(safe-area-inset-top,0px));padding:7px 12px;border-radius:12px;background:rgba(90,58,34,.82);zoom:var(--ui-scale,1)}
body.arch-round{cursor:none}
body.arch-round #tJump,body.arch-round #tAct,body.arch-round #btnMenu,body.arch-round #btnJournal{visibility:hidden}
@media (max-width:520px){#archUi .end{top:calc(68px + env(safe-area-inset-top,0px));max-width:62vw}#archUi .wind{top:calc(60px + env(safe-area-inset-top,0px))}#archUi .pip{min-width:17px;height:17px;font-size:10px;line-height:17px}#archLeave{top:calc(112px + env(safe-area-inset-top,0px))}}
`;

// --------------------------------------------------------------------------------------------- the bow and the arrows
/** An arrow with the tip at the origin and the shaft behind it (-z): bamboo, a blunt rubber tip, three bright feather vanes. */
function arrowGeometry() {
  const k = new Kit(), L = 0.8;
  k.add(new THREE.CylinderGeometry(0.013, 0.013, L, 6), '#ead7a4', 0, 0, -L / 2, Math.PI / 2, 0, 0);
  k.add(new THREE.SphereGeometry(0.028, 8, 6), '#ff7a2a', 0, 0, 0.0);
  k.add(new THREE.CylinderGeometry(0.02, 0.016, 0.07, 8), '#ff7a2a', 0, 0, -0.05, Math.PI / 2, 0, 0);
  ['#e8553d', '#fff6e0', '#4aa3df'].forEach((c, i) => {
    const g = new THREE.PlaneGeometry(0.2, 0.065);        // along the shaft (z) and out from it (local x, turned round the shaft)
    g.rotateY(Math.PI / 2);
    g.translate(0, 0.032, 0);
    g.rotateZ(i * Math.PI * 2 / 3);
    k.add(g, c, 0, 0, -L + 0.14);
  });
  return k.merge();
}

/** The bow: a bamboo limb tube of BOW_N rings (rewritten in setBow), a string, and a leather grip. */
function makeBow() {
  const RAD = 6, pos = new Float32Array(BOW_N * RAD * 3), nor = new Float32Array(BOW_N * RAD * 3), idx = [];
  for (let r = 0; r < BOW_N - 1; r++) for (let a = 0; a < RAD; a++) {
    const a2 = (a + 1) % RAD, i0 = r * RAD + a, i1 = r * RAD + a2, i2 = (r + 1) * RAD + a, i3 = (r + 1) * RAD + a2;
    idx.push(i0, i2, i1, i1, i2, i3);
  }
  const g = new THREE.BufferGeometry();
  const pa = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage), na = new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', pa); g.setAttribute('normal', na); g.setIndex(idx);
  const mat = new THREE.MeshStandardMaterial({ color: '#d8a43e', roughness: 0.7, emissive: '#4a2a08', emissiveIntensity: 0.25, side: THREE.DoubleSide });
  const limb = new THREE.Mesh(g, mat);
  limb.frustumCulled = false;
  const sg = new THREE.BufferGeometry();
  const sp = new THREE.BufferAttribute(new Float32Array(9), 3).setUsage(THREE.DynamicDrawUsage);
  sg.setAttribute('position', sp);
  const smat = new THREE.LineBasicMaterial({ color: '#fff7e6' });
  const string = new THREE.Line(sg, smat);
  string.frustumCulled = false;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 8), new THREE.MeshStandardMaterial({ color: '#c2441f', roughness: 0.8 }));
  grip.frustumCulled = false;
  const root = new THREE.Group();
  root.name = 'archery:bow';
  root.add(limb, string, grip);
  return { root, pa, na, sp, own: [g, mat, sg, smat, grip.geometry, grip.material], nock: new V3() };
}

/** Bend the bow for a draw (0..1): the tips come back toward the archer, the string's middle comes back further. */
function setBow(b, draw) {
  const RAD = 6, pa = b.pa.array, na = b.na.array, H = 0.5;
  const tip = 0.05 + 0.11 * draw;
  for (let r = 0; r < BOW_N; r++) {
    const f = r / (BOW_N - 1) * 2 - 1, y = f * H, z = -tip * Math.abs(f) ** 1.7, rad = 0.02 * (1 - 0.4 * Math.abs(f));
    // tangent angle of the limb in the y-z plane
    const dz = -tip * 1.7 * Math.abs(f) ** 0.7 * Math.sign(f) / H, ang = Math.atan(dz);
    const e2y = Math.cos(ang), e2z = Math.sin(ang);
    for (let a = 0; a < RAD; a++) {
      const ph = a / RAD * Math.PI * 2, ca = Math.cos(ph), sa = Math.sin(ph), i = (r * RAD + a) * 3;
      pa[i] = ca * rad; pa[i + 1] = y + sa * rad * e2y * 0; pa[i + 2] = z + sa * rad;
      na[i] = ca; na[i + 1] = 0; na[i + 2] = sa;
      void e2z;
    }
  }
  b.pa.needsUpdate = true; b.na.needsUpdate = true;
  const nk = -(0.06 + 0.52 * draw), sp = b.sp.array;
  sp[0] = 0; sp[1] = H; sp[2] = -tip;
  sp[3] = 0; sp[4] = 0; sp[5] = nk;
  sp[6] = 0; sp[7] = -H; sp[8] = -tip;
  b.sp.needsUpdate = true;
  b.nock.set(0, 0, nk);
}

function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d'), gr = x.createRadialGradient(16, 16, 0, 16, 16, 15);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

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
    const plays = rec?.plays || 0, easy = !!g.easy;
    const plan = roundPlan(ctx.first, easy);
    const touch = !!ctx.ui.touch;
    const y0 = R.y0, hAt = (x, z) => world.heightAt(x, z);
    const wind = makeWind(Math.floor(Math.random() * 1e6) + 1, plan.ends.length, plan.windScale);

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
    };
    const input_ = { mdx: 0, mdy: 0, padDX: 0, padDY: 0, mouse: false, btn: false, btnId: -1, lx: 0, ly: 0, breatheTap: false };
    const added = [], disposables = [];
    let ui = null, cleaned = false, savedFov = 0, hadLock = false;
    const cleanups = [];
    const scenery = { targets: [], active: -1, back: A.back, side: A.side, ground, vAt: (i, t) => movingV(A.moving, t) };
    for (const t of A.targets) scenery.targets.push({ u: t.u, v: t.v, r: t.r, y: hAt(A.x - t.u, A.z - t.v) - y0 + A.centreH });
    scenery.targets.push({ u: A.moving.u, v: 0, r: A.moving.r, y: hAt(A.x - A.moving.u, A.z) - y0 + A.centreH, moving: true, off: true });

    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      for (const f of cleanups) { try { f(); } catch (e) { console.warn(e); } }
      for (const o of added) o.removeFromParent();
      for (const d of disposables) d.dispose?.();
      ui?.remove();
      document.body.classList.remove('arch-round');
      if (document.pointerLockElement === canvas) document.exitPointerLock?.();
      if (savedFov) g.follow.fovBase = savedFov;
      g.follow.clearCutscene(true);
      // the targets and arrows are put back as the world built them
      for (const t of R.targets) { t.group.visible = true; t.group.scale.setScalar(1); t.flag.visible = false; }
      R.moving.group.visible = false; R.moving.group.scale.setScalar(1);
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
      savedFov = g.follow.fovBase;
      document.body.classList.add('arch-round');

      // ---- the pieces
      const bow = makeBow();
      scene.add(bow.root); added.push(bow.root); disposables.push(...bow.own);
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

      // ---- the page layer
      ui = document.createElement('div');
      ui.id = 'archUi';
      ui.innerHTML = `<div class="panel end"><b></b><div class="pips"></div></div>
        <div class="panel wind"><div class="lab"></div><div class="dir"></div><div class="n"></div></div>
        <div class="cross pins"><div class="tick t10"><span>10</span></div><div class="tick t15"><span>15</span></div><div class="tick t20"><span>20</span></div></div>
        <div class="cross sight"><div class="ring"></div><div class="dot"></div></div>
        <div class="pop"></div>
        <button id="archLeave"></button><button id="archBreathe"></button><button id="archDraw"></button>`;
      document.body.appendChild(ui);
      const q = s => ui.querySelector(s);
      const el = {
        endB: q('.end b'), pips: q('.pips'), windLab: q('.wind .lab'), windDir: q('.wind .dir'), windN: q('.wind .n'), cross: q('.sight'), ring: q('.ring'), dot: q('.dot'),
        ticks: [q('.t10'), q('.t15'), q('.t20')], pop: q('.pop'), draw: q('#archDraw'), breathe: q('#archBreathe'), leave: q('#archLeave'),
      };
      el.windLab.textContent = tx('Wind');
      el.draw.textContent = tx('Draw');
      el.breathe.textContent = tx('Breathe');
      el.leave.textContent = tx('Leave');
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
        const moving = plan.ends[e].target === 'moving';
        R.targets.forEach((t, i) => { t.flag.visible = !moving && plan.ends[e].target === i; t.group.visible = !moving; t.group.scale.setScalar(1); });
        R.moving.group.visible = moving;
        R.moving.flag.visible = moving;
        scenery.targets.forEach((t, i) => { t.off = moving ? i !== 3 : i === 3; });
        scenery.active = moving ? 3 : plan.ends[e].target;
        const tg = scenery.targets[scenery.active];
        // the first aim points at the target's middle, a little high for the drop
        st.yaw = Math.atan2((tg.moving ? 0 : tg.v) - ARCH.muzzle.v, tg.u - ARCH.muzzle.u);
        st.pitch = 0.03;
        st.camYaw = st.yaw; st.camPitch = st.pitch;
      };
      const endDist = e => (plan.ends[e].target === 'moving' ? A.moving.dist : A.targets[plan.ends[e].target].dist);

      const pipsFor = () => {
        const e = plan.ends[st.end], n = e.arrows, key = st.end * 1000 + st.scores.length * 10 + st.arrow;
        if (memo.pips === key) return;
        memo.pips = key;
        let html = '';
        for (let i = 0; i < n; i++) {
          const s = st.scores[i];
          if (s === undefined) html += '<span class="pip left"></span>';
          else html += `<span class="pip s${s ? 1 : 0}" style="${s ? `background:${RING_COLOURS[s - 1]};color:${s >= 5 && s <= 6 ? '#fff' : s >= 9 || s <= 2 ? '#7a4a22' : '#fff'}` : ''}">${s || '×'}</span>`;
        }
        el.pips.innerHTML = html;
      };
      const setEndLabel = () => {
        const e = st.end;
        setText(el.endB, 'endLabel', plan.ends[e].target === 'moving'
          ? tx('Bonus end · sliding target')
          : tx('End {n} of {total} · {d} m', { n: e + 1, total: plan.ends.filter(x => x.target !== 'moving').length, d: endDist(e) }));
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
        const cp = Math.cos(st.camPitch);
        camD.set(-cp * Math.cos(st.camYaw), Math.sin(st.camPitch), -cp * Math.sin(st.camYaw));
        const yy = st.yaw + (sw ? sw.yaw : 0), pp = st.pitch + (sw ? sw.pitch : 0), cq = Math.cos(pp);
        aimD.set(-cq * Math.cos(yy), Math.sin(pp), -cq * Math.sin(yy));
      };
      placeAim(1, null);
      camR.set(-camD.z, 0, camD.x).normalize();
      camPos.copy(eyeW).addScaledVector(camD, -CAM_BACK).addScaledVector(camR, CAM_SIDE); camPos.y += CAM_UP;
      camLook.copy(eyeW).addScaledVector(camD, CONVERGE);
      g.follow.cutscene({ pos: camPos, look: camLook }, 0.001);
      g.follow.track(() => camPos, () => camLook, 8);
      st.mode = 'aim'; st.modeK = 8;

      ctx.debug.archery = () => ({
        phase: st.phase, end: st.end, arrow: st.arrow, shots: st.shots, total: st.total, scores: st.scores.slice(), ends: st.ends || null, left: st.left, draw: st.draw,
        yaw: st.yaw, pitch: st.pitch, wind: windAt(wind, Math.max(0, st.end), st.windT), windT: st.windT, bulls: st.bulls, hits: st.hits, plan: plan.ends.map(e => e.arrows),
        alive: pool.filter(s => s.use !== 'free').length, mode: st.mode, steady: st.steady, arc: arcMat.opacity, sock: R.sockWind,
      });
      /** QA: shoot now with a given aim and draw (the next 'ready' frame), exactly as the pure rules fly it. */
      ctx.debug.fire = (yaw, pitch, draw = 1) => { st.script = { yaw, pitch, draw }; };
      /** QA: the aim that hits the middle of the current target for the wind as it is now. */
      ctx.debug.solve = (draw = 1) => solveAim(scenery.active, draw, wind, st.end, st.windT + 0.05, scenery, A.eye);
      /** QA: set the seconds left on the clock (to reach the time-up path quickly). */
      ctx.debug.setLeft = sec => { st.left = sec; };
      ctx.debug.scene = scenery;

      el.leave.style.display = '';
      ctx.hud(0, ctx.roundTime);
      await ctx.wait(0.1);
      await ctx.fade(false, 450);
      if (ctx.quit) return { score: 0, quit: true };
      ctx.hintTop(true, touch ? 150 : 128);
      ctx.hint(touch ? N_('Hold Draw and drag to aim. Let go to shoot. Watch the wind sock!')
        : N_('Aim with the mouse. Hold {act} (or the mouse button) to draw, let go to shoot. Space steadies you.'), 7);

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
        if (a.hitIdx === 3 && (a.state === 'hit' || a.state === 'other')) { R.moving.group.attach(s.mesh); s.moving = true; }
      };

      let lastHold = false, tick = 0;
      const fire = () => {
        const s = st.cur;
        const aim = clampAim({ yaw: st.yaw + st.sw.yaw, pitch: st.pitch + st.sw.pitch });
        launch(s.a, aim, st.draw, st.windT, A.eye);
        s.use = 'fly'; s.a.state = 'fly';
        st.phase = 'flight'; st.t = 0; st.shots++;
        W(s.a.u, s.a.v, s.a.y, s.mesh.position);
        // the twang and whoosh
        audio.tone(210 + st.draw * 90, { type: 'triangle', dur: 0.18, vol: 0.09, glide: 0.8, rev: 0.1 });
        audio.noise({ dur: 0.14, vol: 0.05, freq: 3000, q: 1.2, sweep: 0.5 });
        setMode('flight', 7);
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
        if (a.state === 'other') hint('other', N_('That was another target!'), 3);
        else if (ring >= 9) ctx.hint(N_('Bullseye! The village will hear about this.'), 3);
        else if (st.shots === 1 && ctx.first) ctx.hint(hit ? GRADE[ring >= 7 ? 1 : 0] : N_('Not on the target yet. Arrows drop as they fly: aim a little higher.'), 3.5);
        else if (!hit && a.state === 'ground' && a.u < a.hitU + 99 && st.shots < 5) hint('short2', N_('That one fell short. A longer draw makes a faster, flatter arrow.'), 3.5);
        else if (!hit && st.shots === 2 && ctx.first) ctx.hint(N_('See the wind sock? It points where the wind blows. Aim a little the other way.'), 4.5);
        pipsFor();
      };
      const showSummary = () => {
        const e = st.end, sum = st.ends[st.ends.length - 1];
        setMode('aim', 8);
        ctx.hint(plan.ends[e].target === 'moving' ? tx('Bonus end: {n} points.', { n: sum }) : tx('End {n}: {pts} points.', { n: e + 1, pts: sum }), 2);
        audio.good();
      };

      const bowAt = new V3();
      const res = await ctx.loop(dt => {
        st.t += dt;
        const ph = st.phase;
        // ---- time: it runs only while the player is lining up a shot
        const timed = ph === 'ready' || ph === 'draw';
        if (timed) st.left = Math.max(0, st.left - dt);
        st.windT += dt;
        const w = st.end >= 0 ? windAt(wind, st.end, st.windT) : 0;
        st.wS += (w - st.wS) * Math.min(1, dt * 4);

        // ---- input: aim, draw, breathe
        const held = input_.mouse || input.held('act') || input_.btn || padHeld();
        if (!held) { st.free += dt; if (st.free > 0.2) st.armed = true; } else st.free = 0;
        let dx = 0, dy = 0;
        const mouseMoved = input_.mdx !== 0 || input_.mdy !== 0;
        // a stick sweeps the cone in a blink at the touch/mouse scale: slow it down
        const lookK = input.lastDevice === 'gamepad' ? 0.35 : 1;
        if (mouseMoved) { dx += input_.mdx; dy += input_.mdy; } else { dx += input.look.x * lookK; dy += input.look.y * lookK; }
        dx += input_.padDX; dy += input_.padDY;
        input_.mdx = input_.mdy = input_.padDX = input_.padDY = 0;
        const fine = ph === 'draw' ? 0.6 : 1;
        const canAim = ph === 'ready' || ph === 'draw';
        if (canAim) {
          st.yaw += dx * LOOK * fine + input.move.x * KEYAIM * fine * dt;
          st.pitch += -dy * LOOK * 0.9 * fine + input.move.y * KEYAIM * 0.6 * fine * dt;
          clampAim(st);
        }
        const breathe = input_.breatheTap || input.pressed('jump');
        input_.breatheTap = false;
        st.steadyCool = Math.max(0, st.steadyCool - dt);
        if (st.steady > 0) { st.steady -= dt; if (st.steady <= 0) st.steadyCool = ARCH.steadyCool; }
        if (breathe && canAim && st.steady <= 0 && st.steadyCool <= 0) { st.steady = ARCH.steady; audio.blip(0.7); }

        // ---- phases
        if (ph === 'intro') {
          if (st.t > 1.1) { st.phase = 'endIntro'; st.t = 0; setEndLabel(); pipsFor(); }
        } else if (ph === 'endIntro') {
          if (st.t > 1.4) { st.phase = 'ready'; st.t = 0; st.cur = take(); }
        } else if (ph === 'ready' || ph === 'draw') {
          if (st.script && ph === 'ready') {
            const sc = st.script; st.script = null;
            st.yaw = sc.yaw; st.pitch = sc.pitch; clampAim(st);
            st.draw = sc.draw; st.sw.yaw = st.sw.pitch = 0;
            fire();
          } else if (ph === 'ready') {
            if (held && st.armed && st.left > 0) { st.phase = 'draw'; st.drawT = 0; audio.reel(); }
          } else {
            st.drawT += dt;
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
          const s = st.cur, a = s.a;
          stepArrow(a, wind, st.end, dt, scenery);
          W(a.u, a.v, a.y, s.mesh.position);
          dirW(a.vu, a.vv, a.vy, tmpD);
          if (a.state === 'fly') {
            tmpO.position.copy(s.mesh.position);
            tmpO.lookAt(tmpV.copy(s.mesh.position).add(tmpD));
            s.mesh.quaternion.copy(tmpO.quaternion);
          } else landed(s, a);
          if (st.t > 4 && a.state === 'fly') { a.state = 'ground'; landed(s, a); }
        } else if (ph === 'impact') {
          if (st.t > 1.15) {
            st.arrow++;
            if (st.arrow >= plan.ends[st.end].arrows || st.left <= 0) { st.phase = 'endSum'; st.t = 0; finishEnd(); showSummary(); }
            else { st.phase = 'ready'; st.t = 0; st.cur = take(); setMode('aim', 8); }
          }
        } else if (ph === 'endSum') {
          // pull the arrows (they shrink away), then the next end, or the finish
          for (const s of pool) if (s.use === 'stuck' || s.use === 'nock') { s.fade = Math.min(1, s.fade + dt / 0.5); { const f = Math.max(0.001, 1 - s.fade); s.mesh.scale.set(ARROW_XY * f, ARROW_XY * f, ARROW_Z * f); } if (s.fade >= 1) release(s); }
          if (st.t > 2.1) {
            if (st.end + 1 < plan.ends.length && st.left > 0) {
              st.end++; st.arrow = 0; st.scores = []; st.windT = 0; showEnd(st.end);
              for (const s of pool) release(s);
              st.phase = 'endIntro'; st.t = 0; st.draw = 0; setEndLabel(); pipsFor(); setMode('aim', 8);
              if (plan.ends[st.end].target === 'moving') hint('moving', N_('Bonus end! The target slides: aim a little ahead of it.'), 4.5);
              else if (st.end === 1) hint('far', N_('Farther away, so the wind has longer to push. Check the sock.'), 4);
            } else { st.phase = 'done'; st.t = 0; }
          }
        } else if (ph === 'timeUp') {
          if (st.t > 1.6) { finishEnd(); st.phase = 'done'; st.t = 0; }
        } else if (ph === 'done') {
          if (st.t > 0.6) return { done: true };
        }
        // the sliding target glides along its rail
        if (R.moving.group.visible) {
          const mv = movingV(A.moving, st.windT);
          R.moving.group.position.set(A.x - A.moving.u, hAt(A.x - A.moving.u, A.z - mv), A.z - mv);
        }

        // ---- the bow, the arrow in it, and the camera
        if (!(ph === 'flight' || ph === 'impact')) {
          const useSw = ph === 'draw' || ph === 'ready';
          placeAim(dt, useSw ? st.sw : null);
          if (ph === 'ready' || ph === 'endIntro' || ph === 'intro') { st.sw.yaw *= 0.8; st.sw.pitch *= 0.8; }
        } else placeAim(dt, null);
        const drawNow = ph === 'draw' ? st.draw : 0;
        if (memo.bowDraw !== drawNow) { memo.bowDraw = drawNow; setBow(bow, drawNow); }
        bowAt.copy(eyeW).addScaledVector(aimD, -0.2);
        bow.root.position.copy(bowAt);
        tmpO.position.copy(bowAt);
        tmpO.lookAt(tmpV.copy(bowAt).add(aimD));
        bow.root.quaternion.copy(tmpO.quaternion);
        bow.root.rotateZ(0.3);
        bow.root.visible = ph !== 'done';
        const nockS = st.cur;
        if (nockS && nockS.use === 'nock' && (ph === 'ready' || ph === 'draw' || ph === 'endIntro')) {
          // the arrow rests on the bow, its tail on the string
          tmpV.set(0, 0, bow.nock.z + 0.8).applyQuaternion(bow.root.quaternion).add(bowAt);
          nockS.mesh.position.copy(tmpV);
          nockS.mesh.quaternion.copy(tmpO.quaternion);
        }
        // Mika follows her aim with her whole body
        p.facing = A.heading - (st.yaw + (st.sw.yaw || 0) * 0.5);
        p.root.rotation.y = p.facing;

        // camera
        if (st.mode === 'aim') {
          camR.set(-camD.z, 0, camD.x).normalize();
          camPos.copy(eyeW).addScaledVector(camD, -CAM_BACK).addScaledVector(camR, CAM_SIDE); camPos.y += CAM_UP;
          camLook.copy(eyeW).addScaledVector(camD, CONVERGE);
          g.follow.fovBase = savedFov * (1 - 0.18 * drawNow);
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
        // wobble of the stuck arrows
        for (const s of pool) if (s.use === 'stuck' && s.wob > 0.002) {
          s.age += dt;
          s.wob *= Math.exp(-dt * 3.2);
          const a1 = Math.sin(s.age * 38) * 0.12 * s.wob;
          tmpQ.setFromAxisAngle(tmpE.set(0, 1, 0), a1); s.mesh.quaternion.copy(s.base).multiply(tmpQ);
          tmpQ.setFromAxisAngle(tmpE.set(1, 0, 0), Math.cos(s.age * 31) * 0.1 * s.wob); s.mesh.quaternion.multiply(tmpQ);
        }

        // ---- the aim arc (faint on later tries), the sight pins, the crosshair and its ring
        const alpha = plan.arc ? 1 : arcAlpha(plays, easy);
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
          const px = Math.round((scr.x - cx) * 2) / 2, py = Math.round((scr.y - cy) * 2) / 2, show = vis && (ph === 'ready' || ph === 'draw') && Math.abs(px) < innerWidth * 0.45 && Math.abs(py) < innerHeight * 0.45;
          setStyle(el.ticks[i], `tk${i}`, 'transform', show ? `translate(${px}px,${py}px)` : 'translate(-999px,-999px)');
        }
        // radians -> pixels: the picture is as tall as 2 tan(fov / 2) units
        const pxr = innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
        const ox = Math.round(st.sw.yaw * pxr * 2) / 2, oy = Math.round(-st.sw.pitch * pxr * 2) / 2;
        setStyle(el.cross, 'cross', 'transform', `translate(${ox}px,${oy}px)`);
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
        score: st.total, quit: false, detail: { shots: st.shots, hits: st.hits, bulls: st.bulls, ends: st.ends },
        extra: st.bulls >= 1 ? N_('a bullseye!') : allHit ? N_('every arrow found the target') : undefined,
      };

    } finally {
      // a quit or an error anywhere above: put everything back (the framework un-fades nothing, so do it here)
      if (!cleaned) { cleanup(); ctx.fade(false, 300); }
    }
  },
};
