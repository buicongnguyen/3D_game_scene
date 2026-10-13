// "Float and wait" (uite mate): a calm water-safety drill in the swimming lesson's supervised pool. Mika steps in with her
// clothes on, with Rin and a grown-up at the edge, and practises what to do after a fall: do not thrash, lie back and
// float, breathe slowly, call for help, hold on to something that floats, scull to the edge and take the reaching pole.
// On Normal and Difficult a second scene shows the rescuer's side: never jump in; shout, throw, reach lying flat.
//
// The rules are pure (rules-floatsafe.js). This file owns the pictures: the pool, the swimmer and her poses come from
// swimming.js; the bottle, ball, cool-box lid, stone, bag, pole, life ring, breathing ring and river marks are built here
// from numbers (no model files). Everything is disposed and put back in `finally`: finish, Stop, Backspace or an error.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { N_, tx, getLang } from '../../i18n/i18n.js';
import { FloatDrill, FLOAT } from './rules-floatsafe.js';
import { POOL, makePool, takeSwimmer, makeSwimPose, swimInput, holdCamera, hidePoolSigns } from './swimming.js';
import { addCss } from './util.js';

const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const turn = (from, to, k) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * k;

const STEP = {
  edge: N_('Ready at the edge'), calm: N_('Fell in: stay calm'), float: N_('Float on your back'), call: N_('Float and call'),
  hold: N_('Hold on to a float'), scull: N_('Scull to the edge'), reach: N_('Hold the pole'), rescue: N_('A friend fell in'),
  done: N_('Drill complete'),
};
const SAFETY = N_('A drill in a calm pool with a grown-up at the edge. Wear a life jacket near real water.');
const FEEDBACK = {
  no_thrash: N_('Rin: Easy now. Stop moving, lie back and let the water hold you.'),
  float_first: N_('Rin: Float first, then call. Let your breathing slow down.'),
  keep_still: N_('Hands off the stick. Just float and breathe.'),
  small_corrections: N_('Small pushes, left or right, to stay level.'),
  breathe_ring: N_('Follow the ring: hold while it grows, let go while it shrinks.'),
  wait_call: N_('Save your breath. Call when the grown-up looks your way.'),
  wait_float: N_('Wait. Let it drift to you; do not reach for it.'),
  aim_edge: N_('Steer toward the pole while you tap.'),
  slow_scull: N_('Slower. Gentle taps keep you floating.'),
  try_cue: N_('Try the instruction above. Take your time; Rin is here.'),
};
const ASK = {
  first: N_('Rin plays a friend who has fallen in. What do you do first?'),
  throw: N_('Throw her something that floats. Which one?'),
  reach: N_('Now pull her in with the pole. How?'),
};
const OPTION = {
  shout: N_('Shout for a grown-up'), jump: N_('Jump in to her'), wade: N_('Wade in and grab her'),
  bottle: N_('Empty bottle'), ball: N_('Football'), stone: N_('Stone'), bag: N_('Full school bag'),
  flat: N_('Lie flat and reach'), edge: N_('Stand at the very edge'), hand: N_('Hold out my hand'),
};
const WHY = {
  jump: N_('Never jump in: then two people need help.'), wade: N_('Do not wade in: she could pull you under.'),
  stone: N_('A stone sinks. Pick something light and full of air.'), bag: N_('A full bag is heavy: it sinks.'),
  edge: N_('Standing at the edge, you could be pulled in.'), hand: N_('Your arm is too short, and she could pull you in.'),
};
const RIGHT = {
  shout: N_('“Help! Someone fell in!” The grown-up comes at once.'),
  bottle: N_('An empty bottle floats. She hugs it to her chest.'), ball: N_('A ball floats. She hugs it to her chest.'),
  flat: N_('Lying flat, you cannot be pulled in. Pull slowly.'),
};
// small pictures for the answers (28 x 28)
const INK = '#234a56', HOT = '#e8792b', BLUE = '#3d9fd2';
const OPTION_PIC = {
  shout: `<circle cx="9" cy="14" r="5" fill="${INK}"/><path d="M17 9l7-4M18 14h8M17 19l7 4" stroke="${HOT}" stroke-width="2.6" stroke-linecap="round"/>`,
  jump: `<circle cx="11" cy="6" r="3.6" fill="${INK}"/><path d="M11 10l3 7-5 5M14 17l6 2M8 13l8-2" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 25q4-3 7 0t7 0 8 0" fill="none" stroke="${BLUE}" stroke-width="2.4" stroke-linecap="round"/>`,
  wade: `<circle cx="14" cy="6" r="3.6" fill="${INK}"/><path d="M14 10v9M9 13h10" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><path d="M3 19q4-3 7 0t7 0 8 0M3 24q4-3 7 0t7 0 8 0" fill="none" stroke="${BLUE}" stroke-width="2.4" stroke-linecap="round"/>`,
  bottle: `<rect x="9" y="9" width="10" height="16" rx="4" fill="#cdeefa" stroke="${INK}" stroke-width="1.8"/><rect x="11.5" y="3" width="5" height="6" rx="1.5" fill="${HOT}" stroke="${INK}" stroke-width="1.6"/><path d="M9 15h10" stroke="${INK}" stroke-width="1.4"/>`,
  ball: `<circle cx="14" cy="14" r="10" fill="#fff" stroke="${INK}" stroke-width="1.8"/><path d="M14 9l5 3.5-2 5.5h-6l-2-5.5z" fill="${INK}"/><path d="M14 4v5M23 11l-4 1.5M19 22l-2-4M9 22l2-4M5 11l4 1.5" stroke="${INK}" stroke-width="1.6"/>`,
  stone: `<path d="M5 19q-1-8 7-11t11 5q2 8-6 9t-12-3z" fill="#9aa0a6" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 13l4-2" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`,
  bag: `<rect x="6" y="8" width="16" height="17" rx="3.5" fill="#d8604e" stroke="${INK}" stroke-width="1.8"/><path d="M6 14h16" stroke="${INK}" stroke-width="1.6"/><rect x="11" y="16" width="6" height="5" rx="1.2" fill="#f2c24e" stroke="${INK}" stroke-width="1.3"/><path d="M10 8q0-5 4-5t4 5" fill="none" stroke="${INK}" stroke-width="1.8"/>`,
  flat: `<circle cx="17" cy="14" r="3.4" fill="${INK}"/><path d="M14 15H3" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><path d="M19 15l8-3" stroke="${HOT}" stroke-width="2.4" stroke-linecap="round"/><path d="M2 20h18" stroke="#b58b55" stroke-width="3" stroke-linecap="round"/>`,
  edge: `<circle cx="16" cy="5" r="3.4" fill="${INK}"/><path d="M16 9v9m0 0-3 6m3-6 3 6M12 12h8" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><path d="M2 24h16" stroke="#b58b55" stroke-width="3" stroke-linecap="round"/><path d="M20 26q3-2 6 0" fill="none" stroke="${BLUE}" stroke-width="2.2" stroke-linecap="round"/>`,
  hand: `<circle cx="9" cy="8" r="3.6" fill="${INK}"/><path d="M9 12v9M9 14l12 1" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><circle cx="23" cy="15" r="2.2" fill="${HOT}"/>`,
};

const CSS = `
body.float-round #tAct,body.float-round #tJump,body.float-round #tDive,body.float-round #tKite,body.float-round #tAim,body.float-round #tFire{display:none!important}
body.float-round #toasts{visibility:hidden}
#floatDrill{position:fixed;inset:0;z-index:17;pointer-events:none;font:700 15px Nunito,system-ui,sans-serif;color:#234a56;user-select:none;-webkit-user-select:none}
#floatDrill .lesson{position:absolute;top:calc(68px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);width:min(440px,calc(100vw - 28px));box-sizing:border-box;padding:9px 16px 10px;border-radius:20px;background:rgba(245,255,253,.95);box-shadow:0 5px 18px #1234;text-align:center}
#floatDrill .step{font:700 12px Nunito,system-ui,sans-serif;letter-spacing:.02em;color:#4f8590;margin:0 0 1px}
#floatDrill .cue{font:600 21px/1.2 Fredoka,Nunito,sans-serif;margin:0 0 4px;color:#a34920}
#floatDrill .instruction{font-size:14px;line-height:1.3}
#floatDrill .calm{display:flex;align-items:center;gap:8px;margin:7px 0 0;font-size:12px;color:#4f8590}
#floatDrill .calm b{flex:none;font-weight:800}
#floatDrill .calm .bar{flex:1;height:10px;border-radius:20px;background:#d5e6e2;overflow:hidden}
#floatDrill .calm i{display:block;height:100%;width:60%;border-radius:20px;background:#59b7d9;transition:background .3s}
#floatDrill .calm.low i{background:#e59a2e}
#floatDrill .track{height:8px;border-radius:20px;background:#bddad5;overflow:hidden;margin:6px 0 2px}
#floatDrill .progress{height:100%;width:0;background:#3caa82;border-radius:20px}
#floatDrill .gauge{height:20px;position:relative;background:#dceee6;border-radius:20px;margin:6px 0 2px;overflow:hidden;display:none}
#floatDrill .zone{position:absolute;top:0;height:100%;background:#87cba8}
#floatDrill .dot{position:absolute;left:0;top:2px;width:16px;height:16px;border-radius:50%;background:#bb602b;transform:translateX(-50%)}
#floatDrill .feedback{font-size:13px;line-height:1.3;color:#a34920;margin-top:5px;display:none}
#floatDrill .controls{font-size:12px;color:#5b787a;margin-top:5px;display:none}
#floatDrill .safe{position:absolute;left:50%;bottom:calc(12px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);max-width:min(650px,calc(100vw - 32px));width:max-content;padding:5px 10px;border-radius:12px;background:#eefbf7e8;text-align:center;font-size:11px;line-height:1.3}
#floatDrill button{pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;cursor:pointer;border:0;font:800 16px Nunito,system-ui,sans-serif;border-radius:18px}
#floatDrill .act{position:absolute;right:calc(24px + env(safe-area-inset-right,0px));bottom:calc(92px + env(safe-area-inset-bottom,0px));width:132px;max-width:35vw;min-height:72px;padding:10px 12px;box-shadow:0 4px 0 #174e5e;background:#27889b;color:#fff}
#floatDrill .act.held{background:#bf672b;transform:translateY(3px);box-shadow:0 1px 0 #713d1b}
#floatDrill .act.wait{opacity:.6}
#floatDrill .choices{position:absolute;left:50%;bottom:calc(84px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);display:none;gap:10px;justify-content:center;width:max-content;max-width:calc(100vw - 32px)}
#floatDrill .choices.on{display:flex}
#floatDrill .choices button{display:flex;align-items:center;gap:8px;min-height:60px;min-width:150px;padding:8px 14px 8px 10px;background:#fffaf0;color:#234a56;box-shadow:0 4px 0 #c9b48c;text-align:left;font-size:15px;line-height:1.15;touch-action:manipulation}
#floatDrill .choices button svg{flex:none;width:34px;height:34px;border-radius:10px;background:#e1f0ec}
#floatDrill .choices button.sel{box-shadow:0 4px 0 #c9b48c,0 0 0 3px #e59a2e}
#floatDrill .choices button.no{background:#ece7df;color:#8c8377;box-shadow:0 2px 0 #cfc6b6;transform:translateY(2px)}
#floatDrill .choices button.yes{background:#dff5e3;box-shadow:0 4px 0 #7fc08c,0 0 0 3px #3caa82}
#floatDrill .choices kbd{flex:none;font:700 11px/16px Nunito,sans-serif;min-width:16px;text-align:center;border-radius:5px;background:#0001;color:#5b787a}
body.touch #floatDrill .choices kbd{display:none}
@media(max-width:560px){#floatDrill .lesson{top:calc(112px + env(safe-area-inset-top,0px));padding:8px 12px 9px}#floatDrill .cue{font-size:19px}#floatDrill .instruction{font-size:13px}#floatDrill .feedback{font-size:12px}#floatDrill .safe{font-size:10px}
 #floatDrill .choices{display:none;grid-template-columns:1fr 1fr;left:12px;right:12px;transform:none;width:auto;max-width:none;bottom:calc(254px + env(safe-area-inset-bottom,0px));gap:8px}#floatDrill .choices.on{display:grid}
 #floatDrill .choices button{min-height:54px;min-width:0;font-size:14px;padding:6px 8px 6px 7px;gap:6px}#floatDrill .choices button svg{width:30px;height:30px}#floatDrill .choices button:last-child:nth-child(odd){grid-column:1/3;justify-self:center;width:calc(50% - 4px)}}
@media(max-height:540px){body.touch.float-round #minigameStop{top:calc(12px + env(safe-area-inset-top,0px));bottom:auto}#floatDrill .lesson{top:64px;width:316px;padding:6px 12px 7px;font-size:12px}#floatDrill .instruction{font-size:12px;line-height:1.22}#floatDrill .cue{font-size:17px;margin-bottom:2px}#floatDrill .feedback{font-size:11.5px;margin-top:3px}
 #floatDrill .calm{margin-top:4px}#floatDrill .track{margin-top:4px}#floatDrill .gauge{height:16px;margin-top:4px}#floatDrill .dot{width:12px;height:12px}
 #floatDrill .safe{left:auto;right:16px;transform:none;max-width:44vw;bottom:8px}
 #floatDrill .choices{flex-direction:column;left:auto;right:calc(14px + env(safe-area-inset-right,0px));transform:none;top:106px;bottom:auto;width:238px;gap:5px}#floatDrill .choices button{min-height:44px;min-width:0;font-size:14px;padding:4px 10px 4px 8px}#floatDrill .choices button svg{width:28px;height:28px}}
`;

function makeUi(ctx) {
  addCss('floatCss', CSS);
  const el = document.createElement('div'); el.id = 'floatDrill';
  el.innerHTML = '<section class="lesson"><div class="step"></div><div class="cue" aria-live="polite"></div><div class="instruction"></div>'
    + '<div class="calm"><b></b><span class="bar"><i></i></span></div><div class="track"><div class="progress"></div></div>'
    + '<div class="gauge"><i class="zone"></i><i class="dot"></i></div><div class="feedback"></div><div class="controls"></div></section>'
    + '<div class="choices"></div><button class="act"></button><div class="safe"></div>';
  document.body.append(el); document.body.classList.add('float-round');
  const nodes = Object.fromEntries(['step', 'cue', 'instruction', 'calm', 'progress', 'gauge', 'zone', 'dot', 'feedback', 'controls', 'choices', 'act', 'safe'].map(c => [c, el.querySelector(`.${c}`)]));
  nodes.calmLabel = el.querySelector('.calm b'); nodes.calmFill = el.querySelector('.calm i');
  nodes.safe.textContent = tx(SAFETY);
  let held = false, pointer = null, picked = null;
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
  on(window, 'blur', release); on(window, 'pagehide', release); on(window, 'mobile-game-interruption', release);
  on(document, 'visibilitychange', () => { if (document.hidden) release(); });
  on(window, 'resize', release);
  // the rescuer's answers: tap or click one, or its number key (the stick and Action work too: see the round)
  on(nodes.choices, 'pointerdown', e => e.stopPropagation());
  on(nodes.choices, 'click', e => { const b = e.target?.closest?.('button'); if (b && b.dataset.i !== undefined) picked = +b.dataset.i; });
  on(window, 'keydown', e => { if (/^Digit[1-4]$/.test(e.code || '') && nodes.choices._count >= +e.code.slice(5)) picked = +e.code.slice(5) - 1; });
  return { nodes, get held() { return held; }, release,
    /** The answer chosen since the last call (an index), or null. */
    takePick() { const v = picked; picked = null; return v; },
    destroy() { release(); listeners.forEach(f => f()); el.remove(); document.body.classList.remove('float-round'); } };
}

/** The drill's own small things, built from numbers: one vertex-coloured material, a mesh each (they move separately). */
export function makeProps(group, { shadows = true } = {}) {
  const owned = [], keep = o => (owned.push(o), o), c = new THREE.Color();
  const paint = (geo, color) => {
    const n = geo.attributes.position.count, a = new Float32Array(n * 3), p = geo.attributes.position;
    for (let i = 0; i < n; i++) { c.set(typeof color === 'function' ? color(p.getX(i), p.getY(i), p.getZ(i)) : color); a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo;
  };
  const mat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65 }));
  const mesh = (name, parts) => {
    const geo = keep(parts.length > 1 ? mergeGeometries(parts) : parts[0]); if (parts.length > 1) parts.forEach(g => g.dispose());
    const m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = shadows; m.visible = false; group.add(m); return m;
  };
  const cyl = (r0, r1, h, y, color, seg = 10) => paint(new THREE.CylinderGeometry(r0, r1, h, seg).translate(0, y, 0), color);
  const box = (w, h, d, x, y, z, color) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);
  // an empty two-litre bottle lying on its side (its cap toward +x)
  const bottle = mesh('float-bottle', [cyl(0.1, 0.1, 0.3, 0, '#bfe8f7'), cyl(0.103, 0.103, 0.1, 0.02, '#ffffff'), cyl(0.04, 0.1, 0.08, 0.19, '#bfe8f7'), cyl(0.045, 0.045, 0.05, 0.255, '#f08a3c', 8)]
    .map(g => g.rotateZ(-Math.PI / 2)));
  const lid = mesh('float-lid', [box(0.6, 0.06, 0.42, 0, 0, 0, '#f4f7f8'), box(0.64, 0.03, 0.46, 0, -0.03, 0, '#3d8fd0'), box(0.2, 0.03, 0.05, 0, 0.045, 0, '#3d8fd0')]);
  // a football: white with dark patches (painted by where a vertex lies on the ball)
  const ball = mesh('float-ball', [paint(new THREE.SphereGeometry(0.19, 14, 10), (x, y, z) => {
    const a = Math.atan2(z, x), lat = Math.asin(clamp(y / 0.19, -1, 1));
    return (Math.floor((a + Math.PI) / (Math.PI / 3)) + Math.floor((lat + Math.PI / 2) / (Math.PI / 4))) % 2 ? '#fdfdf8' : '#e2553f';
  })]);
  const stone = mesh('float-stone', [paint(new THREE.SphereGeometry(0.15, 7, 5).scale(1.25, 0.7, 1), (x, y) => (y > 0.03 ? '#a4a8ad' : '#7f8388'))]);
  const bag = mesh('float-bag', [box(0.3, 0.34, 0.15, 0, 0, 0, '#c9503f'), box(0.31, 0.12, 0.16, 0, 0.115, 0.004, '#a53a2e'), box(0.18, 0.1, 0.03, 0, -0.08, 0.085, '#e2b04a')]);
  // the red and white life ring on its stand by the grown-up (part of every safe pool)
  const ring = mesh('float-ring', [paint(new THREE.TorusGeometry(0.27, 0.08, 8, 24).rotateX(Math.PI / 2), (x, y, z) => (Math.floor((Math.atan2(z, x) + Math.PI) / (Math.PI / 4)) % 2 ? '#fdfaf2' : '#e2483f')),
    box(0.08, 0.5, 0.08, 0, -0.33, 0, '#93a4ad')]);
  // the reaching pole: a unit shaft along +y (scaled to its length) with a loop at the far end
  const pole = new THREE.Group(); pole.name = 'float-pole'; pole.visible = false; group.add(pole);
  const shaft = new THREE.Mesh(keep(cyl(0.022, 0.022, 1, 0.5, '#f2c230', 6)), mat); shaft.castShadow = shadows; pole.add(shaft);
  const loop = new THREE.Mesh(keep(paint(new THREE.TorusGeometry(0.09, 0.02, 6, 14), '#f2c230')), mat); pole.add(loop);
  // the breathing ring on the water round her, and marks drifting down the "river" lane
  const overlay = { transparent: true, depthWrite: false };
  const breath = new THREE.Mesh(keep(new THREE.RingGeometry(0.93, 1, 44).rotateX(-Math.PI / 2)), keep(new THREE.MeshBasicMaterial({ color: '#ffffff', opacity: 0.8, ...overlay })));
  breath.name = 'float-breath'; breath.renderOrder = 3; breath.visible = false; group.add(breath);
  const FLOW = 9, flow = new THREE.InstancedMesh(keep(new THREE.PlaneGeometry(0.55, 0.09).rotateX(-Math.PI / 2)), keep(new THREE.MeshBasicMaterial({ color: '#ffffff', opacity: 0.4, ...overlay })), FLOW);
  flow.name = 'float-flow'; flow.renderOrder = 3; flow.frustumCulled = false; flow.visible = false; group.add(flow);
  const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), matrix = new THREE.Matrix4();
  let disposed = false;
  return { bottle, lid, ball, stone, bag, ring, pole, breath, flow,
    /** Lay the pole from a hand (ax, ay, az) to its far end (bx, by, bz), in pool coordinates. */
    aimPole(ax, ay, az, bx, by, bz) {
      dir.set(bx - ax, by - ay, bz - az); const len = dir.length() || 1;
      pole.position.set(ax, ay, az); pole.quaternion.setFromUnitVectors(up, dir.multiplyScalar(1 / len));
      shaft.scale.y = len; loop.position.y = len + 0.08; pole.visible = true;
    },
    /** Marks on the water of the east lane, drifting toward -z at `speed` metres a second. */
    flowMarks(time, speed, y) {
      for (let i = 0; i < FLOW; i++) {
        const z = 5.5 - ((time * speed * 2.2 + i * 1.37) % 11.5), x = 0.2 + ((i * 0.83) % 3.2);
        matrix.makeRotationY(Math.PI / 2).setPosition(x, y, z); flow.setMatrixAt(i, matrix);
      }
      flow.instanceMatrix.needsUpdate = true; flow.visible = true;
    },
    dispose() { if (disposed) return; disposed = true; for (const o of [bottle, lid, ball, stone, bag, ring, pole, breath, flow]) o.removeFromParent(); flow.dispose(); owned.forEach(o => o.dispose?.()); } };
}

const setText = (node, source, lang) => {
  if (node._src === source && node._lang === lang) return;
  node._src = source; node._lang = lang; node.textContent = source ? tx(source) : '';
};
const setStyle = (node, key, value) => { if (node.style[key] !== value) node.style[key] = value; };
const setPercent = (node, key, value, tenths = 0) => {
  const n = Math.round(value * (tenths ? 10 : 1));
  if (node['_' + key] === n) return;
  node['_' + key] = n; node.style[key] = `${tenths ? n / 10 : n}%`;
};

/** What the panel says for the step she is in. { text, cue, button } (English source strings). */
function instructions(phase, d, s) {
  if (phase === 'edge' || phase === 'slip') return { text: N_('Today we practise falling in with clothes on. Rin and a grown-up are right here. Press Action to step in.'), cue: N_('Ready? Step in'), button: N_('Step in') };
  if (phase === 'done') return { text: N_('Mika is out and dry. Float first, then call. For a friend: reach or throw, never jump in, and get a grown-up.'), cue: N_('Drill complete — well done'), button: N_('Well done') };
  if (s.step === 'calm') return s.gasp
    ? { text: N_('The water is cold and your breath goes fast. That passes. Do not shout yet, do not swim: keep still.'), cue: N_('Cold! Keep still…'), button: N_('Shout?') }
    : { text: N_('Surprise! Do not thrash. Take your hands off everything until the bar is full.'), cue: N_('Hands off… keep still'), button: N_('Wait…') };
  if (s.step === 'float') {
    if (s.floatMode === 'upright') return { text: N_('Now lie back: head back, ears in the water, arms and legs out like a star. Clothes and shoes help you float: keep them on.'), cue: N_('Lie back like a star'), button: N_('Lie back') };
    if (s.floatMode === 'roll') return { text: N_('Now lie back: head back, ears in the water, arms and legs out like a star. Clothes and shoes help you float: keep them on.'), cue: N_('Head back… ears in the water'), button: N_('Wait…') };
    return { text: s.waves ? N_('Little waves! Breathe with the ring, and nudge the stick left or right to stay level.') : N_('Breathe slowly with the ring: hold Action while it grows, let go while it shrinks.'),
      cue: s.inhale ? N_('Breathe in… (hold)') : N_('Breathe out… (let go)'), button: s.inhale ? N_('Breathe in') : N_('Breathe out') };
  }
  if (s.step === 'call') return { text: d.rules.prompts ? N_('Float and wait. When the grown-up looks your way, press Action once: wave one arm and shout.') : N_('Float and wait. Call when the grown-up looks your way.'),
    cue: s.call.prompt ? N_('Now! Wave and shout') : N_('Float and wait…'), button: s.call.prompt ? N_('Help!') : N_('Wait…') };
  if (s.step === 'hold') {
    const near = s.object.phase === 'near', got = s.object.phase === 'caught';
    return { text: N_('The grown-up throws something that floats. Let it drift to you, then press Action and hug it to your chest.'),
      cue: got ? N_('Hug it to your chest') : near ? N_('Now! Hug it') : N_('Wait… it is drifting to you'), button: near ? N_('Hug it') : N_('Wait…') };
  }
  if (s.step === 'scull') return { text: s.current ? N_('This lane flows like a slow river. Feet first! Steer across to the bank and tap Action on the slow pulse.') : N_('Stay on your back. Steer toward the pole and tap Action on the slow pulse.'),
    cue: N_('Slow taps… to the edge'), button: N_('Gentle scull') };
  if (s.step === 'reach') return { text: N_('The grown-up reaches out with the pole. Hold Action to hold on with both hands.'), cue: s.reach.pulled ? N_('Hold on… you are being pulled in') : N_('Hold on to the pole'), button: N_('Hold on') };
  const r = s.rescue;
  if (!r || r.phase === 'intro') return { text: N_('Now the other side. Rin plays a friend who has fallen in. Whatever happens: do NOT jump in after her.'), cue: N_('A friend is in the water!'), button: '' };
  return { text: ASK[r.q] || '', cue: r.phase === 'wrong' ? N_('Not that one. Try again') : r.phase === 'right' || r.phase === 'done' ? N_('Yes! That is right') : N_('Choose an answer'), button: '' };
}

export default { id: 'floatsafe', async play(ctx) {
  const g = ctx.game, p = ctx.player, input = ctx.input, follow = g.follow;
  let pool = null, ui = null, props = null, restorePlayer = null, restoreSigns = null, fading = false;
  const restoreCamera = holdCamera(follow);
  const drill = new FloatDrill({ level: ctx.level || 'normal', first: ctx.first }), R = drill.rules;
  const W = POOL.water, D = POOL.deck, EDGE_X = 4.5, DECK_X = 4.85, RIN_X = 1.75, RESCUE_Z = 1;
  let phase = 'edge', phaseTime = 0, total = 0, oldAct = false, event = 0, sweep = 0, splashWait = 0, cut = null, selected = 0, oldStick = 0;
  let snap = drill.snapshot(), heading = -Math.PI / 2, roll = 0, objectPhase = '', shownQuestion = -1, askedPhase = '', adultWalking = false;
  const local = { x: EDGE_X, z: R.spot.z }, adultAt = { x: 5.35, z: R.spot.z - 1.5 }, rin = { x: RIN_X, on: false };
  const body = { pitch: 0, depth: 1.03 }, item = { mesh: null, x: 0, y: 0, z: 0, spin: 0 }, toss = { id: null, t: 0, sinks: false };
  const cameraPos = new THREE.Vector3(), cameraLook = new THREE.Vector3(), hidden = [];
  const poolState = { x: 0, z: 0, heading: 0, wet: false, bubbles: false, front: false, speed: 0, travel: true, coachHeld: false };
  const deckItems = [];            // the rescuer's things on the deck: { id, mesh, x, z, h }
  const result = () => {
    const r = drill.result();
    return { score: r.score,
      note: r.complete ? tx('Float first, then call. Never swim after someone: reach or throw, and get a grown-up.')
        : tx('You practised {steps} steps of the drill. Take your time: staying calm is what counts.', { steps: r.steps }),
      detail: { complete: r.complete, steps: r.steps, panics: r.panics, wrongs: r.wrongs, seconds: Math.round(total) } };
  };
  try {
    ctx.lock(true); ctx.director.ground?.release('trick', true);
    ctx.setNight(true, 11);
    // the lane ropes stand aside (3.6 m from the middle): the drill needs open water, and drifting marks show the "river" lane
    pool = makePool(g, { rope: 3.6 }); ui = makeUi(ctx);
    props = makeProps(pool.group, { shadows: g.world.quality?.propShadows !== false });
    const pose = makeSwimPose(p);
    restorePlayer = takeSwimmer(p, dt => pose.apply(dt));
    restoreSigns = hidePoolSigns(ctx);
    pool.target.visible = false;
    // both watchers start beside her at the edge (Rin a step to the south, the grown-up with the pole to the north)
    for (const [npc, x, z] of [[pool.coach, 5.05, R.spot.z + 0.9], [pool.adult, adultAt.x, adultAt.z]]) { npc.pos.x = x; npc.pos.z = z; npc.root.position.x = x; npc.root.position.z = z; npc.root.rotation.y = -Math.PI / 2; }
    props.ring.position.set(5.95, D + 0.58, R.spot.z - 2.7); props.ring.visible = true;
    const hideNearby = () => {
      for (const o of g.scene.children) {
        if (o === pool.group || o === p.root || !/^(npc:|critter:|animal:)/.test(o.name)) continue;
        if (Math.abs(o.position.x - POOL.x) < POOL.apronX + .5 && Math.abs(o.position.z - POOL.z) < POOL.apronZ + 1.6 && !hidden.some(h => h[0] === o)) hidden.push([o, o.visible]);
      }
      for (const [o] of hidden) o.visible = false;
    };
    follow.fovBase = 52;
    follow.track(() => cameraPos, () => cameraLook, 5);
    input.releaseAll?.();
    const nodes = ui.nodes;
    ctx.debug = { drill, get phase() { return phase; }, get snapshot() { return snap; }, get local() { return { ...local }; },
      get pointerHeld() { return ui?.held || false; }, get body() { return { ...body, ...pose.now }; }, pose, stepLabels: STEP,
      pool: { x: POOL.x, z: POOL.z, floor: pool.floor, waterY: pool.waterY, deckY: pool.deckY }, props,
      get choices() { return [...nodes.choices.querySelectorAll('button')].map(b => b.dataset.id); } };
    /** A soft cut: black for a moment while the scene is rearranged. */
    const cutTo = fn => { cut = { t: 0, fn }; fading = true; ctx.fade?.(true, 250); };
    const dryOnDeck = z => { local.x = DECK_X; local.z = z; heading = -Math.PI / 2; body.pitch = 0; props.pole.visible = false; if (item.mesh) item.mesh.visible = false; item.mesh = null; props.breath.visible = false; props.flow.visible = false; };
    const placeRin = (x, z, wet) => {
      const c = pool.coach; c.pos.x = x; c.pos.z = z; c.root.position.set(x, wet ? W - 1.02 : D, z); c.root.rotation.y = wet ? Math.PI / 2 : -Math.PI / 2;
      if (wet) c.anim?.play(c.anim.has?.('Wave') ? 'Wave' : 'Idle', { speed: 0.8 }); else c.anim?.play('Idle');
    };
    const setupRescue = () => {
      dryOnDeck(RESCUE_Z); rin.on = true; rin.x = RIN_X; poolState.coachHeld = true; placeRin(RIN_X, RESCUE_Z, true);
      adultAt.x = 5.7; adultAt.z = RESCUE_Z - 2.6;
      props.ring.position.set(5.95, D + 0.58, RESCUE_Z - 3.4);
      const ids = (R.rescue.find(q => q.id === 'throw')?.options || []).map(o => o.id), H = { bottle: 0.1, ball: 0.19, stone: 0.1, bag: 0.17 };
      ids.forEach((id, i) => {
        const mesh = props[id]; if (!mesh) return;
        const it = { id, mesh, x: 4.38, z: RESCUE_Z + 0.75 + i * 0.52, h: D + 0.06 + H[id] };
        mesh.position.set(it.x, it.h, it.z); mesh.rotation.set(0, id === 'bottle' ? 1.2 : 0.4 * i, 0); mesh.visible = true; deckItems.push(it);
      });
    };
    const showChoices = r => {
      const box = nodes.choices;
      box.innerHTML = r.options.map((id, i) => `<button type="button" data-i="${i}" data-id="${id}"><svg viewBox="0 0 28 28" aria-hidden="true">${OPTION_PIC[id] || ''}</svg><span></span><kbd>${i + 1}</kbd></button>`).join('');
      [...box.querySelectorAll('button')].forEach((b, i) => { b.querySelector('span').textContent = tx(OPTION[r.options[i]]); });
      box._count = r.options.length; box.classList.add('on'); box._on = true; selected = 0;
    };
    const frame = dt => {
      if (ctx.quit) return { score: 0, quit: true };
      dt = Math.min(.1, Math.max(0, dt)); total += dt; phaseTime += dt;
      const controls = swimInput(input, ui.held), pressed = controls.act && !oldAct; oldAct = controls.act;
      let cheer = false, pick = ui.takePick();
      if (cut) {
        // the scene changes while the screen is dark
        cut.t += dt;
        if (cut.fn && cut.t >= 0.32) { cut.fn(); cut.fn = null; ctx.fade?.(false, 350); fading = false; }
        if (cut.t >= 0.7) cut = null;
      }
      if (phase === 'edge') {
        // dry on the deck, at the edge, with both watchers beside her: one press and she steps in
        if (pressed && phaseTime > 0.4) { phase = 'slip'; phaseTime = 0; ui.release(); }
      } else if (phase === 'slip') {
        const u = clamp(phaseTime / 1.3, 0, 1);
        local.x = lerp(EDGE_X, R.spot.x, smooth(u)); heading = -Math.PI / 2;
        if (u > 0.5 && splashWait === 0) { splashWait = 0.3; pool.splash(local.x, local.z, 9, 1.3); pool.ripple(local.x, local.z, 1.6, 1.8); ctx.audio.splash?.(.55); }
        if (u >= 1) { phase = 'drill'; phaseTime = 0; drill.needsRelease = controls.act; }
      } else if (phase === 'drill') {
        // answers by stick and Action as well as by tap, click or number key
        const r0 = snap.rescue;
        if (r0?.phase === 'ask') {
          const n = r0.options.length, axis = Math.abs(controls.mx) > Math.abs(controls.mv) ? controls.mx : controls.mv, step = axis > 0.5 ? 1 : axis < -0.5 ? -1 : 0;
          if (step && step !== oldStick) selected = (selected + step + n) % n;
          oldStick = step;
          if (pick === null && pressed) pick = selected;
        } else pick = null;
        snap = drill.update(dt, { act: controls.act, mx: controls.mx, mv: controls.mv, pick });
        const events = snap.events;
        for (; event < events.length; event++) {
          const ev = events[event];
          if (ev.type === 'panic') { pool.splash(local.x, local.z, 8, 1.2); ctx.audio.splash?.(.4); }
          else if (ev.type === 'step' && ev.step !== 'reach') cheer = true;
          else if (ev.type === 'good' && ev.kind === 'lean') { pool.splash(local.x, local.z, 4, .7); ctx.audio.splash?.(.2); }
          else if (ev.type === 'good' && ev.kind === 'call') { ctx.audio.good(); pool.adult.anim?.once('Wave', { then: 'Idle' }); }
          else if (ev.type === 'prompt') ctx.audio.blip?.(1.2);
          else if (ev.type === 'rethrow') pool.adult.anim?.once('Wave', { then: 'Idle' });
          else if (ev.type === 'good' && ev.kind === 'catch') ctx.audio.good();
          else if (ev.type === 'good' && ev.kind === 'stroke') { ctx.audio.stroke?.(); pool.ripple(local.x, local.z, 0.8, 1.2); }
          else if (ev.type === 'good' && ev.kind === 'grab') ctx.audio.good();
          else if (ev.type === 'good' && ev.kind === 'out') { pool.splash(local.x, local.z, 5, .8); ctx.audio.splash?.(.25); }
          else if (ev.type === 'stage' && drill.step === 'rescue') cutTo(setupRescue);
          else if (ev.type === 'right') {
            ctx.audio.good(); cheer = ev.q !== 'throw';
            if (ev.q === 'first') { adultAt.x = 5.25; adultAt.z = RESCUE_Z - 1.25; }
            if (ev.q === 'throw') { toss.id = ev.option; toss.t = 0; toss.sinks = false; }
          } else if (ev.type === 'wrong') {
            ctx.audio.miss?.();
            if (ev.option === 'stone' || ev.option === 'bag') { toss.id = ev.option; toss.t = 0; toss.sinks = true; }
          } else if (ev.type === 'complete') { phase = 'done'; phaseTime = 0; ui.release(); cutTo(() => { dryOnDeck(rin.on ? RESCUE_Z : local.z); if (rin.on) { placeRin(5.1, RESCUE_Z + 1.1, false); for (const it of deckItems) it.mesh.visible = false; } }); }
        }
      } else if (phase === 'done') {
        if (phaseTime > 0.5 && phaseTime - dt <= 0.5) cheer = true;
        if (phaseTime >= 3) return result();
      }
      if (cheer) { ctx.audio.good(); if (!rin.on || phase === 'done') pool.cheer(); else pool.adult.anim?.once('Wave', { then: 'Idle' }); }
      splashWait = Math.max(0, splashWait - dt);
      // ---- where she is and how she lies
      const s = snap, inDrill = phase === 'drill', step = inDrill ? s.step : null, rescue = step === 'rescue' && !cut?.fn;
      // (between the last pull on the pole and the cut to the dry deck she is still in the water, at the wall)
      const wet = phase === 'slip' ? phaseTime > 0.6 : inDrill && step !== 'rescue' ? true : phase === 'done' ? !rin.on && !!cut?.fn : inDrill && step === 'rescue' && !rin.on;
      let back = false, flat = false, clip = 'Idle', clipSpeed = 1, wantHeading = heading;
      if (inDrill && step !== 'rescue') {
        back = s.back;
        if (step === 'scull' || step === 'reach') { local.x = s.position.x; local.z = s.position.z; }
        if (step === 'reach' && s.reach.pulled) local.x = lerp(s.position.x, 3.45, smooth(s.reach.u));
        // on her back she lies head toward the exit end; sculling she goes head first (Difficult: feet first down the lane,
        // angled a little toward the bank); at the pole her head is at the wall
        wantHeading = step === 'scull' ? (s.current ? Math.PI - 0.5 : s.heading + Math.PI) : step === 'reach' ? -Math.PI / 2 : back ? Math.PI : -Math.PI / 2;
        clip = back ? 'Idle' : 'Tread'; clipSpeed = back ? .5 : s.thrashing ? 2.3 : .8;
        if (s.thrashing && splashWait === 0) { splashWait = 0.28; pool.splash(local.x + Math.sin(total * 9) * .3, local.z + Math.cos(total * 7) * .3, 4, .9); }
      } else if (rescue && s.rescue) {
        // the rescuer: on the dry deck. Lying flat for the reach, with the pole out over the water.
        flat = s.rescue.q === 'reach' && (s.rescue.phase === 'right' || s.rescue.phase === 'done');
        local.x = DECK_X; wantHeading = -Math.PI / 2;
      }
      heading = turn(heading, wantHeading, 1 - Math.exp(-dt * (step === 'scull' ? 2.4 : 4)));
      const k = 1 - Math.exp(-dt * 4.5), deckY = pool.deckY;
      const wantPitch = flat ? 1.47 : back ? -1.42 : wet ? .08 : 0, wantDepth = back ? .99 : 1.03;
      body.pitch += (wantPitch - body.pitch) * k; body.depth += (wantDepth - body.depth) * k;
      const afloat = pool.waterY - body.depth + Math.sin(total * 2.1) * (back ? .03 : .012);
      // (her hips turn about a point a metre above her feet: lying flat on the deck, her feet are that far below it)
      let y = wet ? afloat : deckY - (flat || body.pitch > 0.2 ? 0.84 * Math.min(1, Math.abs(body.pitch) / 1.4) : 0);
      if (phase === 'slip') { const u = clamp(phaseTime / 1.3, 0, 1); y = lerp(deckY, afloat, smooth(u * 1.25)) + Math.sin(Math.PI * Math.min(1, u * 1.25)) * .18; body.pitch = 0; }
      if (phase === 'edge') body.pitch = 0;
      // little waves rock her about her own length; thrashing shakes her
      const wantRoll = inDrill && s.waves ? s.tilt * .38 : inDrill && s.thrashing && wet ? Math.sin(total * 15) * .12 : 0;
      roll += (wantRoll - roll) * (1 - Math.exp(-dt * 8));
      pose.want.back = wet && back ? 1 : 0; pose.want.wave = wet && back && s.waving ? 1 : 0; pose.want.hug = wet && back && s.hugging ? 1 : 0;
      pose.want.front = flat ? 1 : 0;
      p.pos.set(POOL.x + local.x, y, POOL.z + local.z);
      p.facing = heading; p.pitch = body.pitch; p.pose = clip; p.poseSpeed = clipSpeed; p.speed = 0;
      p.root.position.copy(p.pos); p.root.rotation.y = heading; p.root.rotation.z = roll; p.pivot.rotation.x = body.pitch;
      // her chest and hands (pool coordinates): on her back her head lies behind her facing
      // (the wide cool-box lid is held lower, over the tummy, so that it never hides her face)
      const hugOff = R.current ? .24 : 0, fx = Math.sin(heading), fz = Math.cos(heading), chestX = local.x - fx * .16, chestZ = local.z - fz * .16, chestY = W + .14;
      // ---- the grown-up keeps level with her; Rin walks the deck (the pool does that) or plays the friend in the water
      const adult = pool.adult;
      if (inDrill && step !== 'rescue') { adultAt.x = 5.3; adultAt.z = clamp(local.z - 1.35, -6.5, 6.4); }
      const gap = Math.hypot(adultAt.x - adult.pos.x, adultAt.z - adult.pos.z), walking = gap > (adultWalking ? 0.08 : 0.45);
      if (walking) { const stride = Math.min(gap, 1.2 * dt) / gap; adult.pos.x += (adultAt.x - adult.pos.x) * stride; adult.pos.z += (adultAt.z - adult.pos.z) * stride; adult.root.position.x = adult.pos.x; adult.root.position.z = adult.pos.z; }
      if (walking !== adultWalking && !adult.anim?.busy) { adultWalking = walking; adult.anim?.play(walking ? 'Walk' : 'Idle', { speed: walking ? 0.8 : 1 }); }
      const handX = adult.pos.x - .32, handY = D + 1.02, handZ = adult.pos.z + .1;
      // ---- the float she is thrown (a bottle; on Difficult a cool-box lid)
      if (inDrill && step === 'hold' && s.object) {
        const o = s.object, mesh = R.current ? props.lid : props.bottle, u = o.u;
        if (item.mesh !== mesh) { item.mesh = mesh; mesh.visible = true; }
        const lx = local.x + 1.5, lz = local.z + .3, nx = local.x + .55, nz = local.z - .15;
        if (o.phase === 'fly') { item.x = lerp(handX, lx, u); item.z = lerp(handZ, lz, u); item.y = lerp(handY, W + .05, u) + Math.sin(Math.PI * u) * .8; item.spin += dt * 6; }
        else if (o.phase === 'drift') { item.x = lerp(lx, nx, smooth(u)); item.z = lerp(lz, nz, smooth(u)); item.y = W + .05; item.spin += dt * .6; }
        else if (o.phase === 'near') { item.x = nx; item.z = nz; item.y = W + .05; item.spin += dt * .3; }
        else if (o.phase === 'past') { item.x = lerp(nx, local.x + .5, u); item.z = lerp(nz, local.z - 1.9, u); item.y = W + .05; item.spin += dt * .6; }
        else { const q = smooth(u * 2.5); item.x = lerp(item.x, chestX + fx * hugOff, q); item.z = lerp(item.z, chestZ + fz * hugOff, q); item.y = lerp(item.y, chestY + .05, q); }
        if (objectPhase !== o.phase) { if (objectPhase === 'fly') { pool.splash(item.x, item.z, 5, .8); ctx.audio.plop?.(.8); } objectPhase = o.phase; }
      } else if (item.mesh && inDrill && (step === 'scull' || step === 'reach')) { item.x = chestX + fx * hugOff; item.z = chestZ + fz * hugOff; item.y = chestY + .05; }
      if (item.mesh) { item.mesh.position.set(item.x, item.y + Math.sin(total * 2.3) * .012, item.z); item.mesh.rotation.y = item.spin; }
      // ---- the reaching pole: from the grown-up to her hands, or (the rescuer's reach) from Mika to Rin
      if (inDrill && step === 'reach') props.aimPole(handX, handY, handZ, chestX + .1, W + .12, chestZ);
      else if (flat) props.aimPole(local.x - .62, D + .17, local.z, rin.x + .45, W + .16, RESCUE_Z);
      else if (props.pole.visible && !cut?.fn) props.pole.visible = false;
      // ---- the breathing ring on the water, and the river lane's drifting marks
      const breathing = inDrill && step === 'float' && s.floatMode === 'breathe';
      props.breath.visible = breathing;
      if (breathing) { const sc = 0.85 + s.breath * .75; props.breath.scale.set(sc, 1, sc); props.breath.position.set(chestX, W + .02, chestZ); props.breath.material.opacity = .45 + .4 * s.breath; }
      if (R.current && inDrill && step !== 'rescue') props.flowMarks(total, step === 'scull' ? R.current : R.current * .5, W + .016); else props.flow.visible = false;
      // ---- the rescuer's scene: Rin in the water, the thing that is thrown, the pull to the wall
      if (rin.on && phase === 'drill' && s.rescue) {
        const r = s.rescue, c = pool.coach;
        if (flat) { rin.x = lerp(RIN_X, 3.35, smooth(r.t / (FLOAT.right - .4))); }
        c.pos.x = rin.x; c.root.position.x = rin.x; c.root.position.y = W - 1.02 + Math.sin(total * 2) * .015;
        if (toss.id) {
          const it = deckItems.find(q => q.id === toss.id), u = clamp(toss.t / .9, 0, 1), tx_ = rin.x + .42;
          toss.t += dt;
          if (it) {
            const m = it.mesh;
            if (u < 1) m.position.set(lerp(DECK_X - .3, tx_, u), lerp(D + 1.05, W + .06, u) + Math.sin(Math.PI * u) * .7, lerp(RESCUE_Z, RESCUE_Z + .05, u));
            else if (toss.sinks) {
              // it sinks, and is back on the deck when the question is asked again
              const v = clamp((toss.t - .9) / .9, 0, 1); m.position.set(tx_, W + .06 - v * .8, RESCUE_Z + .05);
              if (r.phase === 'ask') { m.position.set(it.x, it.h, it.z); toss.id = null; }
            } else m.position.set(rin.x + .3, W + .08 + Math.sin(total * 2.3) * .012, RESCUE_Z + .02);
            if (u >= 1 && toss.t - dt < .9) { pool.splash(tx_, RESCUE_Z, toss.sinks ? 7 : 4, toss.sinks ? 1 : .7); ctx.audio.plop?.(1); }
            m.rotation.y += dt * (u < 1 ? 7 : .2);
          }
        }
        // the answers
        if (r.phase !== askedPhase || r.index !== shownQuestion) {
          if (r.phase === 'ask' && r.index !== shownQuestion) { showChoices(r); shownQuestion = r.index; }
          const buttons = [...nodes.choices.querySelectorAll('button')];
          if (r.phase === 'wrong') buttons.find(b => b.dataset.id === r.picked)?.classList.add('no');
          if (r.phase === 'right') buttons.forEach(b => b.classList.add(b.dataset.id === r.picked ? 'yes' : 'no'));
          askedPhase = r.phase;
        }
        const buttons = nodes.choices.children;
        for (let i = 0; i < buttons.length; i++) { const on = r.phase === 'ask' && i === selected && !ctx.ui?.touch; if (buttons[i]._sel !== on) { buttons[i]._sel = on; buttons[i].classList[on ? 'add' : 'remove']('sel'); } }
      } else if (nodes.choices._on !== false && (phase === 'done' || !snap.rescue)) { nodes.choices.classList.remove('on'); nodes.choices._on = false; }
      poolState.x = local.x; poolState.z = rin.on ? RESCUE_Z + 1.2 : local.z; poolState.heading = heading; poolState.wet = wet; poolState.speed = inDrill && step === 'scull' ? s.speed : 0;
      poolState.coachHeld = rin.on && (phase === 'drill' || !!cut?.fn);
      pool.update(dt, poolState);
      if ((sweep -= dt) <= 0) { sweep = .5; hideNearby(); }
      // ---- camera: from over the water on the west side, looking east at her and the two watchers on the deck;
      // the rescuer's scene from the steps end, so that Rin in the water and Mika on the deck are both seen from the side
      const portrait = innerHeight > innerWidth, short = innerHeight < 540;
      const cz = POOL.z + (rin.on ? RESCUE_Z : local.z), mx = POOL.x + (rin.on ? (RIN_X + DECK_X) / 2 : local.x);
      if (rin.on) {
        follow.fovBase = portrait ? 62 : 48;
        if (portrait) { cameraPos.set(POOL.x + 3.1, pool.waterY + 5.6, cz + 8.2); cameraLook.set(POOL.x + 3.3, pool.waterY + .35, cz); }
        else { cameraPos.set(POOL.x + 1.9, pool.waterY + 3.1, cz + 5.9); cameraLook.set(POOL.x + 3.3, pool.waterY + (short ? 1.25 : 1.0), cz); }
      } else if (portrait) {
        follow.fovBase = 60;
        // (a phone held upright: she floats right of the Stop button and the folded How to play card)
        cameraPos.set(mx - 6.2, pool.waterY + 6.2, cz - 2.7); cameraLook.set(mx + .6, pool.waterY + 1.9, cz - 1.25);
      } else {
        follow.fovBase = 50;
        // (a phone on its side: the panel fills the top middle, so she floats lower left of it, clear of the safety line)
        if (short) { cameraPos.set(mx - 4.5, pool.waterY + 3.5, cz - 1.7); cameraLook.set(mx + 2.2, pool.waterY + 1.0, cz + 1.1); }
        else { cameraPos.set(mx - 4.1, pool.waterY + 3.2, cz - 2.7); cameraLook.set(mx + 1.6, pool.waterY + 1.1, cz + .1); }
      }
      const qaShot = ctx.debug.shot;
      if (qaShot) { cameraPos.set(p.pos.x + qaShot.pos[0], pool.waterY + qaShot.pos[1], p.pos.z + qaShot.pos[2]); cameraLook.set(p.pos.x + qaShot.look[0], pool.waterY + qaShot.look[1], p.pos.z + qaShot.look[2]); if (qaShot.fov) follow.fovBase = qaShot.fov; }
      // ---- the panel: every write is skipped while its value stays the same
      const lang = getLang(), inst = instructions(phase, drill, s), count = drill.steps.length + 1;
      const stepNo = inDrill ? s.stepIndex + 2 : phase === 'done' ? count : 1, name = STEP[inDrill ? s.step : phase === 'done' ? 'done' : 'edge'];
      if (nodes.step._n !== stepNo || nodes.step._name !== name || nodes.step._lang !== lang) {
        nodes.step._n = stepNo; nodes.step._name = name; nodes.step._lang = lang;
        nodes.step.textContent = tx('{step} · {name}', { step: `${stepNo}/${count}`, name: tx(name) });
      }
      setText(nodes.instruction, inst.text, lang); setText(nodes.cue, inst.cue, lang); setText(nodes.act, inst.button, lang);
      setStyle(nodes.act, 'display', inst.button ? 'block' : 'none');
      const waiting = inDrill && (step === 'calm' || (step === 'call' && !s.call.prompt) || (step === 'hold' && s.object.phase !== 'near') || (step === 'float' && s.floatMode === 'roll'));
      if (nodes.act._wait !== waiting) { nodes.act._wait = waiting; nodes.act.classList[waiting ? 'add' : 'remove']('wait'); }
      const rs = inDrill ? s.rescue : null;
      const feedback = rs?.phase === 'wrong' ? WHY[rs.picked] || '' : rs?.phase === 'right' ? RIGHT[rs.picked] || '' : inDrill ? FEEDBACK[s.feedback] || '' : '';
      setText(nodes.feedback, feedback, lang); setStyle(nodes.feedback, 'display', feedback ? 'block' : 'none');
      const edge = phase === 'edge';
      setText(nodes.controls, edge ? input.lastDevice === 'gamepad' ? N_('X is Action · B leaves') : ctx.ui.touch ? N_('Hold or tap the Action button') : N_('E is Action · Backspace leaves') : '', lang);
      setStyle(nodes.controls, 'display', edge ? 'block' : 'none');
      // calm: the heart of the drill, always on the panel while she is in the water
      setText(nodes.calmLabel, N_('Calm'), lang);
      setStyle(nodes.calm, 'display', inDrill && step !== 'rescue' ? 'flex' : 'none');
      setPercent(nodes.calmFill, 'width', s.calm * 100);
      if (nodes.calm._low !== (s.calm < .35)) { nodes.calm._low = s.calm < .35; nodes.calm.classList[s.calm < .35 ? 'add' : 'remove']('low'); }
      setPercent(nodes.progress, 'width', (inDrill ? s.progress : phase === 'done' ? 1 : 0) * 100);
      // one small gauge: level on the waves, the time a call or a catch is open, or the sculling pulse
      const tilt = inDrill && s.waves, calling = inDrill && step === 'call' && s.call.prompt, beat = inDrill && step === 'scull';
      setStyle(nodes.gauge, 'display', tilt || calling || beat ? 'block' : 'none');
      if (tilt) { setStyle(nodes.zone, 'left', '25%'); setPercent(nodes.zone, 'width', 50); setPercent(nodes.dot, 'left', 50 + s.tilt * 48, 1); }
      else if (calling) { setStyle(nodes.zone, 'left', '0%'); setPercent(nodes.zone, 'width', s.call.left * 100); setPercent(nodes.dot, 'left', s.call.left * 97 + 1.5, 1); }
      else if (beat) {
        const full = s.beat + s.window, age = s.strokeAge === null ? s.beat : s.strokeAge;
        setStyle(nodes.zone, 'left', `${Math.round((s.beat - s.window) / full * 100)}%`); setPercent(nodes.zone, 'width', 2 * s.window / full * 100);
        setPercent(nodes.dot, 'left', Math.min(1, age / full) * 97 + 1.5, 1);
      }
      ctx.hud(s.score, null);
      // no clock: the round only ends itself long after a calm child would have finished
      if (total >= ctx.roundTime * 2.5 + 60) return result();
    };
    frame(0);
    follow.camera.position.copy(cameraPos); follow.look.copy(cameraLook); follow.tracking.lookNow.copy(cameraLook); follow.camera.lookAt(cameraLook);
    return await ctx.loop(frame);
  } finally {
    if (fading) ctx.fade?.(false, 200);
    ui?.destroy(); restorePlayer?.(); props?.dispose(); pool?.dispose();
    for (const [o, visible] of hidden) o.visible = visible;
    restoreSigns?.(); restoreCamera();
    ctx.setNight(false);
    ctx.lock(false); input.releaseAll?.();
  }
} };
