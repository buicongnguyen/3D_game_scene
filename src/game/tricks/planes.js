// Paper planes on the breeze: fold a paper aeroplane step by step, then throw it far down the long open hillside above
// Takamori Landing. Rules: ./rules-planes.js (folding as real flat folds, the trim they give, the flight).
//
// One button plays the whole game on every device (E / Space, a click or a tap on the picture, the gamepad's X / A):
//   fold   a marker sweeps over a bar; press when it is in the green and the fold lands on its line
//   throw  the aim swings up and down; press AND HOLD to take that angle, the power fills while held, let go to throw
// The chooser (which plane) and the trim card (elevator, paper clip, wingtip) are moved with left / right / up / down
// and can be pressed with a finger or the mouse.
// The level (ctx.level, rules-planes.js makeDay): Easy the Dart, wide fold marks, no wind and the flight drawn ahead;
// Normal a choice of four planes, a light wind, the elevator and a ring to land in; Difficult every trim, gusts, a
// thermal over the field and a distance to beat that wants the right plane for the day's wind.
//
// Drawing: the folding is an SVG of the sheet's real layers (the flap swings over its crease); in the valley one small
// mesh for the plane (and its paper clip), one line for its trail, three pooled flags with their numbers, standing tapes
// for the record, the goal and the ring, points for the flight to come and for the thermal, one LineSegments for the
// wind. Everything is made once per round, written in place each frame and freed in cleanup.
import * as THREE from 'three';
import { N_, tx } from '../../i18n/i18n.js';
import { addCss } from './util.js';
import { openPick } from './pick.js';
import { DESIGNS, DESIGN, FOLD, THROW, FIELD, foldPaper, movingPart, creaseOf, foldError, trimOf, newSheet, mirror, sweepAt, makeDay, dayGoal, makePlane, newThrow, stepPlane, flyThrow,
  verdict, inRing, planeScore, aimAt, powerAt, fieldGround } from './rules-planes.js';

const V3 = THREE.Vector3;
const HOLD_SCALE = 2.3, FLY_SCALE = 5.6;     // the plane is drawn larger than life: in her hand, and more in the air (it must read at 40 m)
const TRAIL_N = 90, PATH_N = 30, STREAKS = 18, MOTES = 26, STEP = 1 / 60;
const FLAG_COL = ['#e8432b', '#3f7fd0', '#3fae4a'];
const ACCENT = { dart: [0.91, 0.26, 0.17], glider: [0.25, 0.5, 0.82], stunt: [0.96, 0.62, 0.1], bulldog: [0.25, 0.68, 0.29] };
const GRADE = [N_('A bit crooked. It will still fly.'), N_('A good fold.'), N_('A perfect fold!')];
const WIND_NAME = { calm: N_('No wind'), tail: N_('Tailwind'), head: N_('Headwind'), cross: N_('Side wind') };
const DAY_HINT = {
  tail: N_('The wind is behind us today. Which plane will ride it the longest?'),
  head: N_('The wind is in our faces today. Which plane can push through it?'),
  cross: N_('The wind blows across the hill today. Which plane holds its line?'),
};
const VERDICT = {
  wet: N_('Splash! Right into the river. We will fish it out later.'),
  loop: N_('A loop! Lovely to watch. For distance, throw it flatter and softer.'),
  stall: N_('It reared up, ran out of speed and dropped: a stall. Throw lower, or softer.'),
  dive: N_('Nose first into the grass. Throw it harder, or a little higher.'),
  veer: N_('It curved away: the folds do not quite match left and right.'),
  far: N_('What a glide! That is the way.'),
  ok: N_('A fair flight. Try another angle.'),
};
const TWEAK = {
  elev: { name: N_('Back edges'), vals: [N_('flat'), N_('up a little'), N_('up more'), N_('up a lot')], note: N_('Bent up, they lift the nose. Too much and it stalls.') },
  clip: { name: N_('Paper clip'), vals: [N_('off'), N_('on the nose')], note: N_('Weight in front: steadier, and better into the wind.') },
  tip: { name: N_('Wingtip'), vals: [N_('bent left'), N_('straight'), N_('bent right')], note: N_('A bent wingtip makes the plane turn that way.') },
};

const CSS = `
#planeUi{position:fixed;left:50%;top:calc(68px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:15;width:min(440px,94vw);box-sizing:border-box;
 padding:8px 12px 10px;border-radius:18px;background:rgba(255,247,232,.95);box-shadow:0 6px 20px rgba(40,20,0,.25);font:700 14px Nunito,system-ui,sans-serif;color:#5a3a22;
 zoom:var(--ui-scale,1);touch-action:manipulation;user-select:none;-webkit-user-select:none}
#planeUi.hidden,#planeUi .hidden{display:none}
#planeUi .lab{font:600 16px Fredoka,Nunito,sans-serif;color:#c2541c;text-align:center;margin-bottom:5px}
#planeUi .fold{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:center}
#planeUi svg.pp{height:236px;width:auto;aspect-ratio:2.6/3.2;display:block;border-radius:12px;background:#f3e2bf}
#planeUi svg.pp polygon{stroke:#8a6a4a;stroke-width:.022;stroke-linejoin:round}
#planeUi svg.pp .up{fill:#fffdf5}#planeUi svg.pp .dn{fill:#ffc98a}
#planeUi svg.pp .mv polygon{fill-opacity:.55;stroke-dasharray:.06 .05}
#planeUi svg.pp .mv.go polygon{fill-opacity:1;stroke-dasharray:none}
#planeUi svg.pp .mid{stroke:#b89a78;stroke-width:.02;stroke-dasharray:.09 .07}
#planeUi svg.pp .cr{stroke:#e2572b;stroke-width:.035;stroke-dasharray:.11 .07;stroke-linecap:round}
#planeUi svg.pp .tg{fill:none;stroke:#3fae4a;stroke-width:.045}
#planeUi svg.pp .dot{fill:#e2572b;stroke:#fff;stroke-width:.025}
#planeUi svg.pp .dot.ok{fill:#3fae4a}
#planeUi .txt{margin:0 0 8px;font-size:14px;line-height:1.25;min-height:3.75em}
#planeUi .bar{position:relative;height:18px;border-radius:9px;background:#ead9b8;overflow:hidden}
#planeUi .zone{position:absolute;top:0;bottom:0;background:#8fd07a;border-radius:9px}
#planeUi .mark{position:absolute;top:-2px;left:0;width:14px;height:22px;margin-left:-7px;border-radius:6px;background:#e2572b;box-shadow:0 0 0 2px #fff8}
#planeUi .gr{margin:7px 0 0;min-height:1.3em;font-size:13px;color:#2f8a4a}
#planeUi .pips{display:flex;gap:4px;margin-top:6px}
#planeUi .pips i{width:11px;height:11px;border-radius:50%;background:#ead9b8}
#planeUi .pips i.g2{background:#3fae4a}#planeUi .pips i.g1{background:#f2a51a}#planeUi .pips i.g0{background:#e2572b}
#planeUi .tw{display:grid;grid-template-columns:auto 1fr;gap:1px 10px;align-items:center;padding:5px 8px;border-radius:12px;margin-top:4px}
#planeUi .tw.sel{background:#fff1cf;box-shadow:0 0 0 2px #f08a3c}
#planeUi .tw b{font-size:14px}
#planeUi .tw .st{display:flex;align-items:center;justify-content:flex-end;gap:6px}
#planeUi .tw .v{min-width:86px;text-align:center;font-size:13px;color:#7a3e16}
#planeUi .tw button{all:unset;box-sizing:border-box;width:30px;height:30px;border-radius:50%;background:#f4dfb5;box-shadow:0 2px 0 #d9bd85;text-align:center;font:700 16px/30px Nunito,sans-serif;color:#5a3a22;cursor:pointer;-webkit-tap-highlight-color:transparent}
#planeUi .tw small{grid-column:1/3;font-size:12px;font-weight:600;color:#8a6a4a;line-height:1.2}
#planeUi .go{all:unset;box-sizing:border-box;display:block;width:100%;margin-top:8px;padding:8px 10px;border-radius:13px;background:#f08a3c;color:#fff;font:700 15px Nunito,sans-serif;text-align:center;cursor:pointer;box-shadow:0 3px 0 #b8581a}
#planeUi .go.sel{box-shadow:0 3px 0 #b8581a,0 0 0 3px #7a3e16}
#planeUi kbd{font:700 12px Nunito,sans-serif;padding:1px 5px;border-radius:5px;background:#0002;margin-left:6px}
#planeUi .aim{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;align-items:center}
#planeUi svg.ga{width:170px;height:104px;display:block}
#planeUi .pw{position:relative;height:16px;border-radius:8px;background:#ead9b8;overflow:hidden}
#planeUi .pw u{position:absolute;top:0;bottom:0;background:#8fd07a}
#planeUi .pw i{position:absolute;left:0;top:0;bottom:0;width:0;background:#f08a3c;border-radius:8px;opacity:.92}
#planeUi .pl{font-size:12px;color:#8a6a4a;margin:0 0 3px}
#planeUi .info{display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap;margin-top:6px;font-size:13px}
#planeUi .chip{display:inline-flex;gap:5px;align-items:center;padding:2px 9px;border-radius:999px;background:#fff;box-shadow:inset 0 0 0 1.5px #e6d3b0;white-space:nowrap}
#planeUi .chip svg{width:16px;height:16px}
#planeUi .chip.big{font:600 17px Fredoka,Nunito,sans-serif;color:#7a3e16}
@media (max-width:520px){#planeUi{top:calc(112px + env(safe-area-inset-top,0px));padding:6px 9px 8px}#planeUi .lab{font-size:14px;margin-bottom:3px}
 #planeUi svg.pp{height:164px}#planeUi .txt{font-size:13px;margin-bottom:6px}#planeUi .tw{padding:3px 6px;margin-top:3px}#planeUi .tw small{font-size:11.5px;display:none}#planeUi .tw.sel small{display:block}#planeUi .tune:not(.hidden) ~ .info{display:none}#planeUi .tw .v{min-width:74px}
 #planeUi .go{margin-top:6px;padding:7px 10px}#planeUi svg.ga{width:104px;height:64px}}
body.planes-round #trickHint{max-width:min(520px,90vw)}
@media (max-height:480px){body.planes-round #trickHint{left:calc(10px + env(safe-area-inset-left,0px));transform:none;bottom:calc(8px + env(safe-area-inset-bottom,0px));max-width:44vw;font-size:14px;padding:7px 12px}
 #planeUi{top:calc(58px + env(safe-area-inset-top,0px));padding:5px 10px 7px;width:min(420px,94vw)}#planeUi .lab{font-size:14px;margin-bottom:2px}
 #planeUi svg.pp{height:150px}#planeUi .txt{font-size:13px;margin-bottom:5px;min-height:3.2em}#planeUi .tw{padding:2px 6px;margin-top:2px}#planeUi .tw small{display:none}
 #planeUi .tw.sel small{display:block}#planeUi .go{margin-top:5px;padding:6px 10px}#planeUi svg.ga{width:96px;height:58px}}
`;

// ------------------------------------------------------------------------------------------------ the planes, drawn
// the right half of each plane seen from above: [x to the wingtip, z to the nose], metres; the left half is its mirror
const WING = {
  dart: [[0, 0.16], [0.078, -0.15], [0.014, -0.128], [0, -0.16]],
  glider: [[0, 0.1], [0.135, 0.072], [0.135, -0.085], [0.02, -0.062], [0, -0.1]],
  stunt: [[0, 0.115], [0.112, 0.0], [0.112, -0.098], [0.02, -0.07], [0, -0.108]],
  bulldog: [[0, 0.14], [0.036, 0.14], [0.106, -0.14], [0.014, -0.115], [0, -0.15]],
};
const PAPER = [1, 0.98, 0.92], KEEL = [0.9, 0.85, 0.74];

/** The chooser's picture of a plane: the same outline, as SVG. */
function planeThumb(id) {
  const w = WING[id], k = 170, pt = ([x, z]) => `${(30 + x * k).toFixed(1)},${(30 - z * k).toFixed(1)}`, a = ACCENT[id].map(v => Math.round(v * 255));
  const right = w.map(pt).join(' '), left = w.map(([x, z]) => pt([-x, z])).join(' ');
  const span = Math.max(...w.map(p => p[0])), tips = w.filter(p => p[0] > span * 0.6);
  const tip = s => `<polygon points="${tips.map(([x, z]) => pt([s * x, z])).join(' ')} ${pt([s * span * 0.55, (tips[0][1] + tips[tips.length - 1][1]) / 2])}" fill="rgb(${a})" stroke="none"/>`;
  return `<svg viewBox="0 0 60 60"><g stroke="#8a6a4a" stroke-width="1.6" stroke-linejoin="round" fill="#fffdf5"><polygon points="${right}"/><polygon points="${left}"/>${tip(1)}${tip(-1)}
    <polygon points="${right}" fill="none"/><polygon points="${left}" fill="none"/></g><path d="M30 ${(30 - w[0][1] * k).toFixed(1)}V${(30 - w[w.length - 1][1] * k).toFixed(1)}" stroke="#b89a78" stroke-width="1.4"/></svg>`;
}

/** A paper plane as one mesh (wings with a little dihedral, coloured tips, a keel to hold), nose to +Z. */
function planeMesh(id, own) {
  const w = WING[id], pos = [], col = [], acc = ACCENT[id], span = Math.max(...w.map(p => p[0]));
  const v = (x, z, y, c) => { pos.push(x, y, z); col.push(c[0], c[1], c[2]); };
  for (const s of [1, -1]) for (let i = 1; i < w.length - 1; i++) for (const p of [w[0], w[i], w[i + 1]]) v(s * p[0], p[1], p[0] * 0.3, p[0] > span * 0.6 ? acc : PAPER);
  const zf = w[0][1], zb = w[w.length - 1][1];
  v(0, zf, 0, KEEL); v(0, zb * 0.55, -0.05, KEEL); v(0, zb, 0, KEEL);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  // the paper clip: a little grey block on the nose (shown when it is on)
  const cg = new THREE.BoxGeometry(0.014, 0.012, 0.05), cm = new THREE.MeshBasicMaterial({ color: '#9aa3ad' });
  const clip = new THREE.Mesh(cg, cm);
  clip.position.set(0, -0.006, zf - 0.04);
  clip.visible = false;
  m.add(clip);
  m.userData.clip = clip;
  own.push(geo, mat, cg, cm);
  return m;
}

function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d'), g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

/** A label that stands in the valley (a flag's metres, "Goal 30 m"): a sprite with its own small canvas; set(text) repaints it. */
function label(own, colour = '#5a3a22') {
  const c = document.createElement('canvas'); c.width = 192; c.height = 64;
  const x = c.getContext('2d'), tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // (the same size on screen near and far: a number must read at 40 m and not fill the picture at 4)
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, sizeAttenuation: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(0.18, 0.06, 1);
  s.renderOrder = 6;
  s.visible = false;
  own.push(tex, mat);
  s.userData.set = text => {
    x.clearRect(0, 0, 192, 64);
    x.font = '600 34px Fredoka, Nunito, sans-serif';
    const w = Math.min(184, x.measureText(text).width + 28);
    x.fillStyle = 'rgba(255,247,232,.95)';
    x.beginPath(); x.roundRect((192 - w) / 2, 8, w, 48, 22); x.fill();
    x.fillStyle = colour; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, 96, 34, 176);
    tex.needsUpdate = true;
  };
  return s;
}

export default {
  id: 'planes',

  async play(ctx) {
    const { game: g, player: p, audio, fx } = ctx;
    const world = g.world, scene = g.scene, input = g.input, touch = !!ctx.ui.touch;
    addCss('planeCss', CSS);

    // ---- the hill: x runs down the throw, y to its right, z up from Mika's feet
    const ground = fieldGround((x, z) => world.heightAt(x, z), ctx.trick.place), O = ground.origin;
    const toWorld = (x, y, z, out) => out.set(O.x + O.dx * x + O.rx * y, O.y + z, O.z + O.dz * x + O.rz * y);
    const groundZ = (x, y) => { const h = ground(x, y); return h < -90 ? h + 100 : h; };
    const d = new V3(O.dx, 0, O.dz), r = new V3(O.rx, 0, O.rz), origin = new V3(O.x, O.y, O.z);
    const added = [], own = [], undo = [];
    let ui = null, pick = null, cleaned = false;
    const ptr = { down: false, tap: false };

    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      pick?.close();
      for (const f of undo) f();
      for (const o of added) o.removeFromParent();
      for (const x of own) x.dispose();
      ui?.remove();
      g.follow.clearCutscene(true);
      ctx.lock(false);
    };

    try {
      ctx.lock(true);
      await ctx.fade(true, 350);
      if (ctx.quit) return { score: 0, quit: true };
      p.teleport(O.x, O.z, O.y, FIELD.heading);

      // ---- the day and its goal
      const qa = typeof window !== 'undefined' ? window.__STARLINE_QA__ : null;
      const seed = qa?.trickSeed || Math.floor(Math.random() * 1e6) + 1;
      const day = makeDay(seed, ctx.level, ctx.first), level = day.level, F = FOLD[level];
      if (level === 'hard') day.goal = dayGoal(day, ground);

      // ---- the picture: over her right shoulder, down the hill
      const portrait = innerHeight > innerWidth;
      const camHome = origin.clone().addScaledVector(d, portrait ? -6.4 : -4.6).addScaledVector(r, portrait ? 0.9 : 1.7).add(new V3(0, portrait ? 3 : 2.5, 0));
      const lookHome = origin.clone().addScaledVector(d, 13).add(new V3(0, 0.3 + groundZ(13, 0), 0));
      g.follow.cutscene({ pos: camHome, look: lookHome }, 0.001);

      // ---- things in the valley (all made now, shown when they are needed)
      const put = o => { scene.add(o); added.push(o); return o; };
      const tmp = new V3(), tmp2 = new V3(), pp = new V3(), camPos = camHome.clone(), camLook = lookHome.clone();
      const dTex = dotTexture(); own.push(dTex);
      // a tape that stands in the grass along a curve of the hill: n points from at(i / (n - 1)), two colours in turn
      const tape = (n, at, c1, c2, lo = 0.26, hi = 0.4) => {
        const pos = new Float32Array(n * 6), col = new Float32Array(n * 6), idx = [], q = [0, 0];
        for (let i = 0; i < n; i++) {
          at(i / (n - 1), q);
          const z = groundZ(q[0], q[1]);
          toWorld(q[0], q[1], z + lo, tmp); pos.set([tmp.x, tmp.y, tmp.z], i * 6);
          toWorld(q[0], q[1], z + hi, tmp); pos.set([tmp.x, tmp.y, tmp.z], i * 6 + 3);
          const c = (i >> 1) % 2 ? c2 : c1;
          col.set(c, i * 6); col.set(c, i * 6 + 3);
          if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        geo.setIndex(idx);
        const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
        own.push(geo, mat);
        const m = put(new THREE.Mesh(geo, mat));
        m.frustumCulled = false;
        return m;
      };
      const TAPE_HALF = 7;                                     // metres to each side of the throw line
      const lineAt = dist => (k, q) => { q[0] = dist; q[1] = (k - 0.5) * 2 * TAPE_HALF; };
      // its name stands at one end of the tape (side: -1 the left end, 1 the right), clear of the flags in the middle
      const standLabel = (text, dist, colour, side) => {
        const s = put(label(own, colour)), x = dist, y = side * TAPE_HALF * 0.55;
        s.userData.set(text);
        toWorld(x, y, groundZ(x, y) + 1.25, s.position);
        s.visible = true;
        return s;
      };
      // the record of this visit to the hill (the saved record keeps points, not metres)
      const record = SESSION[level] || 0;
      if (record > 3) { tape(29, lineAt(record), [1, 0.82, 0.25], [1, 0.97, 0.88]); standLabel(tx('Best {n} m', { n: Math.floor(record) }), record, '#b8760a', -1); }
      if (day.goal) { tape(29, lineAt(day.goal), [0.25, 0.5, 0.82], [1, 1, 1], 0.46, 0.6); standLabel(tx('Goal {n} m', { n: day.goal }), day.goal, '#2a5fa8', 1); }
      if (day.ring) tape(49, (k, q) => { const a = k * Math.PI * 2; q[0] = day.ring.x + Math.cos(a) * day.ring.r; q[1] = day.ring.y + Math.sin(a) * day.ring.r; }, [0.91, 0.26, 0.17], [1, 1, 1]);
      // the three flags, with their metres
      const poleGeo = new THREE.BoxGeometry(0.06, 1.7, 0.06), poleMat = new THREE.MeshBasicMaterial({ color: '#8a6a4a' });
      const penGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 1.68, 0, 0, 1.2, 0, 0.62, 1.44, 0], 3));
      own.push(poleGeo, poleMat, penGeo);
      const flags = FLAG_COL.map((c, i) => {
        const f = new THREE.Group(), pm = new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }), pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.y = 0.85;
        const lab = label(own, c);
        lab.position.y = 2.1 + i * 0.5;                         // (three flags close together: their numbers stand one above the other)
        f.add(pole, new THREE.Mesh(penGeo, pm), lab);
        f.userData.lab = lab;
        f.visible = false;
        own.push(pm);
        return put(f);
      });
      // the trail of the flight, and (Easy) the flight to come
      const trGeo = new THREE.BufferGeometry(), trPos = new THREE.BufferAttribute(new Float32Array(TRAIL_N * 3), 3).setUsage(THREE.DynamicDrawUsage);
      trGeo.setAttribute('position', trPos);
      const trail = put(new THREE.Line(trGeo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7, depthWrite: false })));
      trail.frustumCulled = false; trail.visible = false;
      own.push(trGeo, trail.material);
      const paGeo = new THREE.BufferGeometry(), paPos = new THREE.BufferAttribute(new Float32Array(PATH_N * 3), 3).setUsage(THREE.DynamicDrawUsage), paBuf = new Float32Array(PATH_N * 3);
      paGeo.setAttribute('position', paPos);
      const path = put(new THREE.Points(paGeo, new THREE.PointsMaterial({ map: dTex, color: '#fff7c8', size: 0.3, transparent: true, opacity: 0.9, depthWrite: false, sizeAttenuation: true })));
      path.frustumCulled = false; path.visible = false;
      own.push(paGeo, path.material);
      // the wind: pale streaks blowing over the grass, as fast and as long as it blows
      const wGeo = new THREE.BufferGeometry(), wPos = new THREE.BufferAttribute(new Float32Array(STREAKS * 6), 3).setUsage(THREE.DynamicDrawUsage);
      wGeo.setAttribute('position', wPos);
      const streaks = put(new THREE.LineSegments(wGeo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, depthWrite: false })));
      streaks.frustumCulled = false;
      own.push(wGeo, streaks.material);
      const sk = new Float32Array(STREAKS * 3);
      for (let i = 0; i < STREAKS; i++) { sk[i * 3] = -6 + Math.random() * 40; sk[i * 3 + 1] = (Math.random() - 0.5) * 26; sk[i * 3 + 2] = 0.7 + Math.random() * 3.2; }
      const windy = Math.hypot(day.wind.x, day.wind.y) > 0.2;
      streaks.visible = windy;
      // the thermal: warm air rising over the sunny patch, shown as slow bright motes
      let motes = null, mPos = null;
      const mk = new Float32Array(MOTES * 3);
      if (day.thermal) {
        const geo = new THREE.BufferGeometry();
        mPos = new THREE.BufferAttribute(new Float32Array(MOTES * 3), 3).setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('position', mPos);
        motes = put(new THREE.Points(geo, new THREE.PointsMaterial({ map: dTex, color: '#ffe9a0', size: 0.55, transparent: true, opacity: 0.75, depthWrite: false, sizeAttenuation: true })));
        motes.frustumCulled = false;
        own.push(geo, motes.material);
        for (let i = 0; i < MOTES; i++) { const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * day.thermal.r * 0.8; mk[i * 3] = Math.cos(a) * rr; mk[i * 3 + 1] = Math.sin(a) * rr; mk[i * 3 + 2] = Math.random() * 9; }
      }
      const _wind = { x: 0, y: 0 };
      /** The air made visible, every frame of the round. */
      const stepAir = (dt, wx, wy) => {
        if (windy) {
          const a = wPos.array, sp = Math.hypot(wx, wy), ln = 0.5 + sp * 0.55;
          for (let i = 0; i < STREAKS; i++) {
            const j = i * 3, k = i * 6;
            sk[j] += wx * 2.4 * dt; sk[j + 1] += wy * 2.4 * dt;
            if (sk[j] > 36) sk[j] -= 44; else if (sk[j] < -8) sk[j] += 44;
            if (sk[j + 1] > 13) sk[j + 1] -= 26; else if (sk[j + 1] < -13) sk[j + 1] += 26;
            const z = groundZ(sk[j], sk[j + 1]) + sk[j + 2], ux = wx / (sp || 1), uy = wy / (sp || 1);
            a[k] = O.x + O.dx * sk[j] + O.rx * sk[j + 1]; a[k + 1] = O.y + z; a[k + 2] = O.z + O.dz * sk[j] + O.rz * sk[j + 1];
            a[k + 3] = a[k] - (O.dx * ux + O.rx * uy) * ln; a[k + 4] = a[k + 1]; a[k + 5] = a[k + 2] - (O.dz * ux + O.rz * uy) * ln;
          }
          wPos.needsUpdate = true;
        }
        if (motes) {
          const a = mPos.array, th = day.thermal, gz = groundZ(th.x, th.y);
          for (let i = 0; i < MOTES; i++) {
            const j = i * 3;
            mk[j + 2] += (0.9 + (i % 5) * 0.12) * dt;
            if (mk[j + 2] > 9) mk[j + 2] -= 9;
            const sw = Math.sin(ctx.t * 0.8 + i) * 0.4, x = th.x + mk[j] + sw, y = th.y + mk[j + 1];
            a[j] = O.x + O.dx * x + O.rx * y; a[j + 1] = O.y + gz + 0.4 + mk[j + 2]; a[j + 2] = O.z + O.dz * x + O.rz * y;
          }
          mPos.needsUpdate = true;
        }
      };

      // ---- the card under the HUD
      ui = document.createElement('div');
      ui.id = 'planeUi';
      ui.innerHTML = `<div class="lab"></div>
        <div class="fold hidden"><svg class="pp" viewBox="-1.3 -1.6 2.6 3.2"><g transform="scale(1,-1)"><g class="st"></g><line class="mid"/><g class="mv"></g><line class="cr"/><circle class="tg" r=".15"/><circle class="dot" r=".09"/></g></svg>
          <div><p class="txt"></p><div class="bar"><div class="zone"></div><div class="mark"></div></div><div class="pips"></div><p class="gr"></p></div></div>
        <div class="tune hidden"></div>
        <div class="aim hidden"><svg class="ga" viewBox="0 0 124 76"><path class="band" fill="none" stroke="#8fd07a" stroke-width="9" stroke-linecap="round"/><path class="arc" fill="none" stroke="#ead9b8" stroke-width="5" stroke-linecap="round"/>
          <path d="M12 62H118" stroke="#b89a78" stroke-width="2" stroke-dasharray="4 4"/><g class="nd"><path d="M12 62H74" stroke="#5a3a22" stroke-width="3" stroke-linecap="round"/><path d="M92 62 72 55v14z" fill="#e2572b" stroke="#5a3a22" stroke-width="1.5" stroke-linejoin="round"/></g><circle cx="12" cy="62" r="5" fill="#5a3a22"/></svg>
          <div><p class="pl"></p><div class="pw"><u></u><i></i></div></div></div>
        <div class="info"></div>`;
      document.body.appendChild(ui);
      const q = s => ui.querySelector(s);
      const el = { lab: q('.lab'), fold: q('.fold'), st: q('.st'), mv: q('.mv'), mid: q('.mid'), cr: q('.cr'), tg: q('.tg'), dot: q('.dot'), txt: q('.txt'), zone: q('.zone'), mark: q('.mark'), pips: q('.pips'), gr: q('.gr'),
        tune: q('.tune'), aim: q('.aim'), nd: q('.nd'), band: q('.band'), arc: q('.arc'), pl: q('.pl'), pwFill: q('.pw i'), pwZone: q('.pw u'), info: q('.info') };
      const show = k => { for (const n of ['fold', 'tune', 'aim']) el[n].classList.toggle('hidden', n !== k); el.info.classList.toggle('hidden', k === 'fold'); };
      document.body.classList.add('planes-round');
      undo.push(() => document.body.classList.remove('planes-round'));
      // one button: a press on the picture, on this card, the action keys or the gamepad
      const onDown = e => { if (e.button > 0 || e.target.closest?.('button')) return; ptr.down = true; ptr.tap = true; };
      const onUp = () => { ptr.down = false; };
      const cv = input.canvas || g.renderer?.domElement || null;
      for (const t of [cv, ui]) { if (!t) continue; t.addEventListener('pointerdown', onDown); undo.push(() => t.removeEventListener('pointerdown', onDown)); }
      for (const ev of ['pointerup', 'pointercancel', 'blur']) { addEventListener(ev, onUp); undo.push(() => removeEventListener(ev, onUp)); }
      const padHeld = () => {
        if (input.lastDevice !== 'gamepad') return false;
        const pads = navigator.getGamepads?.() ?? [], gp = input.gamepadIndex !== null ? pads[input.gamepadIndex] : [...pads].find(Boolean);
        return !!(gp && (gp.buttons[2]?.pressed || gp.buttons[0]?.pressed || gp.buttons[7]?.value > 0.4));
      };
      const held = () => ptr.down || input.held('act') || input.held('jump') || padHeld();
      const pressNow = () => { const on = ptr.tap || input.pressed('act') || input.pressed('jump'); ptr.tap = false; return on; };

      const st = { phase: 'start', design: 'dart', step: 0, steps: 0, e: 0, tol: F.tol, errs: [], grades: [], trim: null, tweaks: { elev: 0, clip: 0, tip: 0 }, row: 0, nth: 0, angle: 0, power: 0, locked: false,
        fl: null, throws: [], score: 0, best: 0, goal: day.goal, kind: day.kind };
      ctx.debug.planes = () => ({ phase: st.phase, level, design: st.design, step: st.step, steps: st.steps, e: st.e, tol: st.tol, errs: st.errs, trim: st.trim, tweaks: { ...st.tweaks }, row: st.row, nth: st.nth,
        angle: st.angle, power: st.power, locked: st.locked, x: st.fl?.x ?? 0, y: st.fl?.y ?? 0, z: st.fl?.z ?? 0, landed: !!st.fl?.landed, stalled: !!st.fl?.stalled, loops: st.fl?.loops ?? 0,
        throws: st.throws.map(t => ({ dist: +t.dist.toFixed(1), ring: t.ring, wet: t.wet, why: t.why })), score: st.score, best: st.best, goal: st.goal, kind: st.kind, wind: day.wind, ring: day.ring, thermal: day.thermal, seed });
      /** QA: where a perfect plane of this design and trim would land for an angle and a power (the rules' own flight). */
      ctx.debug.fly = (design, tweaks, angle, power, nth = 0) => { const s = flyThrow(makePlane(design, tweaks), { angle, power }, day, ground, { nth }); return { dist: s.dist, x: s.x, y: s.y, wet: s.wet }; };
      ctx.hud(0, null);
      const windChip = () => {
        const sp = Math.hypot(day.wind.x, day.wind.y), a = Math.atan2(day.wind.y, day.wind.x) * 180 / Math.PI;     // (up the chip is down the hill)
        return `<span class="chip"><svg viewBox="0 0 16 16"><g transform="rotate(${a.toFixed(0)} 8 8)"><path d="M8 14V3m-4 4 4-5 4 5" fill="none" stroke="${sp > 0.2 ? '#2a6fb0' : '#c9b48c'}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></g></svg>${tx(WIND_NAME[day.kind])}${sp > 0.2 ? ` ${'•'.repeat(sp > 2.2 ? 3 : sp > 1.2 ? 2 : 1)}` : ''}</span>`;
      };

      await ctx.wait(0.15);
      await ctx.fade(false, 450);
      if (ctx.quit) return { score: 0, quit: true };

      // ---- which plane? (Easy folds the Dart)
      el.lab.textContent = tx(N_('Paper planes'));
      el.info.innerHTML = windChip();
      if (day.designs.length > 1) {
        st.phase = 'pick';
        ui.classList.add('hidden');
        if (DAY_HINT[day.kind]) ctx.hint(DAY_HINT[day.kind], 6.5);
        let chosen;
        pick = openPick({
          title: `${tx(N_('Which plane today?'))} · ${tx(WIND_NAME[day.kind])}`, sel: DESIGN[lastDesign] ? lastDesign : 'dart', go: tx(N_('Fold this plane')), touch,
          items: day.designs.map(id => ({ id, name: tx(DESIGN[id].name), desc: tx(DESIGN[id].desc), pic: planeThumb(id), lock: '',
            stats: [[tx(N_('Speed')), DESIGN[id].bars[0]], [tx(N_('Float')), DESIGN[id].bars[1]], [tx(N_('Steady')), DESIGN[id].bars[2]]] })),
          onSel: id => { if (st.design !== id) { st.design = id; audio.blip(1.2); } },
        });
        st.design = pick.sel();
        pick.done.then(v => { chosen = v; });
        const picked = await ctx.loop(dt => { pick.step(input); stepAir(dt, day.wind.x, day.wind.y); return chosen !== undefined ? true : undefined; });
        if (picked?.quit || !chosen) return { score: 0, quit: true };
        pick = null;
        st.design = lastDesign = chosen;
        ui.classList.remove('hidden');
        audio.good();
      }
      const D = DESIGN[st.design];

      // ---- fold it
      st.phase = 'fold';
      show('fold');
      el.zone.style.left = `${(50 - F.tol * 46).toFixed(1)}%`; el.zone.style.width = `${(F.tol * 92).toFixed(1)}%`;
      let polys = newSheet(), c = 0;
      const total = D.fold(0).length;
      st.steps = total;
      const poly = (P, cls = '') => `<polygon class="${P.up ? 'up' : 'dn'}${cls}" points="${P.pts.map(a => `${a[0].toFixed(3)},${a[1].toFixed(3)}`).join(' ')}"/>`;
      const draw = list => { el.st.innerHTML = list.map(P => poly(P)).join(''); };
      const line = (node, cr, len = 4) => { node.setAttribute('x1', (cr.a[0] - cr.d[0] * len).toFixed(3)); node.setAttribute('y1', (cr.a[1] - cr.d[1] * len).toFixed(3)); node.setAttribute('x2', (cr.a[0] + cr.d[0] * len).toFixed(3)); node.setAttribute('y2', (cr.a[1] + cr.d[1] * len).toFixed(3)); };
      /** The flap swung about its crease: k = 1 lying as it was, 0 standing on edge, -1 folded right over. */
      const swing = (cr, k) => {
        const nx = -cr.d[1], ny = cr.d[0], m = 1 - k, an = cr.a[0] * nx + cr.a[1] * ny;
        el.mv.setAttribute('transform', `matrix(${(1 - m * nx * nx).toFixed(4)} ${(-m * nx * ny).toFixed(4)} ${(-m * nx * ny).toFixed(4)} ${(1 - m * ny * ny).toFixed(4)} ${(m * an * nx).toFixed(4)} ${(m * an * ny).toFixed(4)})`);
      };
      const pips = () => { el.pips.innerHTML = Array.from({ length: total }, (_, i) => `<i${i < st.grades.length ? ` class="g${st.grades[i]}"` : ''}></i>`).join(''); };
      el.mid.style.display = 'none';
      draw(polys); pips();
      ctx.hint(touch ? N_('Fold it step by step. Tap when the red dot is in the green ring.') : N_('Fold it step by step. Press {act} or Space when the red dot is in the green ring.'), 6);
      let markAt = NaN, swingAt = NaN;
      for (let i = 0; i < total; i++) {
        const step = D.fold(c)[i], exact = creaseOf(step, 0), target = mirror(step.key, exact.a, exact.d);
        st.step = i;
        el.lab.textContent = tx('Fold {n} of {m}', { n: i + 1, m: total });
        el.txt.textContent = tx(step.text);
        el.gr.textContent = '';
        // the flap that will move (drawn pale, where the fold would put it now) and the place its corner belongs
        el.mv.classList.remove('go');
        el.mv.innerHTML = movingPart(polys, exact, step.key).map(P => poly({ pts: P.pts, up: !P.up })).join('');
        el.tg.setAttribute('cx', target[0].toFixed(3)); el.tg.setAttribute('cy', target[1].toFixed(3));
        el.cr.style.display = el.tg.style.display = el.dot.style.display = '';
        let t0 = 0, e = 0, cr = exact;
        ptr.tap = false;
        const speed = F.speed * (ctx.first ? 0.8 : 1) * (1 + i * 0.05);
        const res = await ctx.loop(dt => {
          t0 += dt;
          stepAir(dt, day.wind.x, day.wind.y);
          e = st.e = sweepAt(t0 + 0.5 / speed, speed);         // (it starts from the middle, moving out)
          const k = Math.round(e * 250);
          if (k !== markAt) {
            markAt = k;
            cr = creaseOf(step, foldError(e, level).err);       // what a press would fold now: inside the green, exactly on the line
            el.mark.style.left = `${(50 + e * 46).toFixed(1)}%`;
            line(el.cr, cr); swing(cr, -1);
            const at = mirror(step.key, cr.a, cr.d);
            el.dot.setAttribute('cx', at[0].toFixed(3)); el.dot.setAttribute('cy', at[1].toFixed(3));
            el.dot.classList.toggle('ok', Math.abs(e) <= F.tol);
          }
          if (t0 > 0.3 && pressNow()) return true;
          return t0 > 11 ? true : undefined;                    // never stalls: after a long wait the fold is made where the marker is
        });
        if (res?.quit) return { score: 0, quit: true };
        const j = foldError(e, level), made = creaseOf(step, j.err);
        st.errs.push(j.err); st.grades.push(j.grade);
        // the fold itself: the flap swings over its crease (and back again, when the step only makes a crease)
        const away = mirror(step.key, made.a, made.d), movers = movingPart(polys, made, step.key);
        draw(movingPart(polys, made, away));
        el.mv.classList.add('go');
        el.cr.style.display = el.tg.style.display = el.dot.style.display = 'none';
        line(el.cr, made);
        audio.noise?.({ dur: 0.16, vol: 0.05, freq: 2600, q: 0.7 });
        p.gesture('Interact', { lock: false });
        let ft = 0, side = 0;
        const len = step.back ? 1.05 : 0.55;
        const r2 = await ctx.loop(dt => {
          ft += dt;
          stepAir(dt, day.wind.x, day.wind.y);
          const u = Math.min(1, ft / 0.5), k = step.back && ft > 0.55 ? -Math.cos(Math.min(1, (ft - 0.55) / 0.45) * Math.PI) : Math.cos(u * Math.PI), s = k < 0 ? -1 : 1;
          if (s !== side) { side = s; el.mv.innerHTML = movers.map(P => poly({ pts: P.pts, up: s < 0 ? !P.up : P.up })).join(''); }
          const kk = Math.round(k * 60);
          if (kk !== swingAt) { swingAt = kk; swing(made, k); }
          return ft >= len ? true : undefined;
        });
        if (r2?.quit) return { score: 0, quit: true };
        if (step.side === 'C') { c = made.a[0]; el.mid.style.display = ''; line(el.mid, made); }
        if (step.side === 'H') el.mid.style.display = 'none';
        if (!step.back) polys = foldPaper(polys, made, step.key);
        el.mv.innerHTML = '';
        el.mv.removeAttribute('transform');
        draw(polys); pips();
        el.gr.textContent = tx(GRADE[j.grade]);
        el.gr.style.color = j.grade === 2 ? '#2f8a4a' : j.grade ? '#b8760a' : '#c2541c';
        if (j.grade) audio.good(); else audio.blip(0.8);
        const r3 = await ctx.wait(0.55);
        if (r3?.quit) return { score: 0, quit: true };
      }
      st.trim = trimOf(st.design, st.errs);

      // ---- the plane in her hand
      const plane = put(planeMesh(st.design, own));
      const hand = new V3(), fwd = new V3();
      const handAt = () => { if (p.grip && p.grip !== p.model) p.grip.getWorldPosition(hand); else hand.copy(origin).add(tmp.set(0, 1.1, 0)); hand.y = Math.max(hand.y, origin.y + 1.25); return hand.addScaledVector(d, 0.28).addScaledVector(r, 0.12); };
      const inHand = angle => {
        handAt();
        plane.position.copy(hand);
        plane.scale.setScalar(HOLD_SCALE);
        const a = angle * Math.PI / 180;
        plane.lookAt(tmp.copy(hand).addScaledVector(d, Math.cos(a)).add(tmp2.set(0, Math.sin(a), 0)));
      };
      inHand(10);
      fx.burst?.(hand, { n: 14, color: [1, 0.95, 0.7], speed: 1.4, size: 0.14, gravity: 0.5 });
      audio.pickup?.();
      const veer = st.trim.veer;
      ctx.hint(st.trim.perfect === total ? N_('Every fold exact. That plane will fly true!')
        : Math.abs(veer) > 0.22 ? (veer > 0 ? N_('A fine plane. The folds do not quite match, so it may pull to the right.') : N_('A fine plane. The folds do not quite match, so it may pull to the left.'))
          : N_('A fine plane! Now, down the hill with it.'), 4);
      const r4 = await ctx.wait(1.2);
      if (r4?.quit) return { score: 0, quit: true };

      // ---- three throws
      const score = () => { const s = planeScore(day, st.throws, st.trim.perfect); st.score = s.score; st.best = s.best; ctx.hud(s.score, null); return s; };
      score();
      // the trim card: what may be changed today, one row each
      const rows = day.tweaks;
      const range = { elev: [0, 3], clip: [0, 1], tip: [-1, 1] };
      const tuneHtml = () => `${rows.map((k, i) => `<div class="tw${st.row === i ? ' sel' : ''}" data-k="${k}"><b></b><span class="st"><button type="button" data-d="-1">◀</button><span class="v"></span><button type="button" data-d="1">▶</button></span><small></small></div>`).join('')}
        <button class="go${st.row === rows.length ? ' sel' : ''}" type="button"></button>`;
      const tuneFill = () => {
        el.tune.querySelectorAll('.tw').forEach((n, i) => {
          const k = rows[i], T = TWEAK[k];
          n.classList.toggle('sel', st.row === i);
          n.querySelector('b').textContent = tx(T.name);
          n.querySelector('.v').textContent = tx(T.vals[st.tweaks[k] - range[k][0]]);
          n.querySelector('small').textContent = tx(T.note);
        });
        const b = el.tune.querySelector('.go');
        b.classList.toggle('sel', st.row === rows.length);
        b.innerHTML = `${tx(N_('Ready to throw'))}${touch ? '' : '<kbd>E</kbd>'}`;
        plane.userData.clip.visible = !!st.tweaks.clip;
      };
      let ready = false;
      const change = (k, dir) => { const v = Math.max(range[k][0], Math.min(range[k][1], st.tweaks[k] + dir)); if (v !== st.tweaks[k]) { st.tweaks[k] = v; audio.blip(1 + v * 0.1); tuneFill(); } };
      const onTune = e => {
        e.stopPropagation();
        const b = e.target.closest?.('button');
        if (!b) return;
        e.preventDefault();
        if (b.classList.contains('go')) { ready = true; return; }
        const k = b.closest('.tw').dataset.k;
        st.row = rows.indexOf(k);
        change(k, +b.dataset.d);
      };
      el.tune.addEventListener('pointerdown', onTune);
      // the aim gauge: an arc from the lowest to the highest throw, the green band where a gentle throw lies (Easy)
      const GA = { x: 12, y: 62, r: 62 };
      const arcPath = (a0, a1, rr) => { const pt = a => `${(GA.x + Math.cos(a * Math.PI / 180) * rr).toFixed(1)} ${(GA.y - Math.sin(a * Math.PI / 180) * rr).toFixed(1)}`; return `M${pt(a0)}A${rr} ${rr} 0 0 0 ${pt(a1)}`; };
      el.arc.setAttribute('d', arcPath(THROW.minAngle, THROW.maxAngle, GA.r));
      if (day.path) { el.band.setAttribute('d', arcPath(4, 22, GA.r)); el.pwZone.style.left = '78%'; el.pwZone.style.width = '22%'; } else { el.band.style.display = 'none'; el.pwZone.style.display = 'none'; }
      let ndAt = NaN, pwAt = NaN;
      const setNeedle = a => { const k = Math.round(a * 2); if (k !== ndAt) { ndAt = k; el.nd.setAttribute('transform', `rotate(${(-a).toFixed(1)} ${GA.x} ${GA.y})`); } };
      const setPower = v => { const k = Math.round(v * 100); if (k !== pwAt) { pwAt = k; el.pwFill.style.width = `${k}%`; } };
      const info = extra => { el.info.innerHTML = `${windChip()}${day.goal ? `<span class="chip">${tx('Goal {n} m', { n: day.goal })}</span>` : ''}${extra || ''}`; };
      let seenStall = false, seenClip = false, thermalSaid = false, newRecord = record;

      for (let n = 0; n < THROW.throws; n++) {
        st.nth = n;
        // -- trim it (Normal: the elevator; Difficult: the clip and the wingtip too)
        if (rows.length) {
          st.phase = 'tune';
          st.row = rows.length;
          ready = false;
          el.lab.textContent = tx('Throw {n} of {m}: trim the plane', { n: n + 1, m: THROW.throws });
          el.tune.innerHTML = tuneHtml();
          tuneFill();
          show('tune');
          info();
          if (n === 0) ctx.hint(touch ? N_('Change the plane if you like, then tap Ready to throw.') : N_('Change the plane with the arrow keys if you like. {act} when it is ready.'), 5.5);
          let ax = 0, ay = 0;
          ptr.tap = false;
          const rt = await ctx.loop(dt => {
            stepAir(dt, day.wind.x, day.wind.y);
            inHand(10 + st.tweaks.elev * 4);
            const mx = input.move.x, my = input.move.y, dx = mx > 0.5 ? 1 : mx < -0.5 ? -1 : 0, dy = my > 0.5 ? -1 : my < -0.5 ? 1 : 0;
            if (dy && dy !== ay) { st.row = Math.max(0, Math.min(rows.length, st.row + dy)); tuneFill(); }
            if (dx && dx !== ax && st.row < rows.length) change(rows[st.row], dx);
            ax = dx; ay = dy;
            if (input.pressed('act') || input.pressed('jump')) ready = true;
            return ready ? true : undefined;
          });
          if (rt?.quit) return { score: st.score, quit: true };
          audio.click?.();
        }
        const P = makePlane(st.design, st.tweaks, st.trim);
        plane.userData.clip.visible = !!P.clip;

        // -- aim and wind up
        st.phase = 'aim';
        st.locked = false; st.power = 0;
        el.lab.textContent = tx('Throw {n} of {m}', { n: n + 1, m: THROW.throws });
        el.pl.textContent = tx(N_('Power'));
        show('aim');
        info();
        setPower(0);
        ctx.hint(n === 0 || ctx.first ? (touch ? N_('The aim swings. Press and hold to take it, then let go to throw!') : N_('The aim swings. Hold {act} to take it: the power fills. Let go to throw!'))
          : N_('Again! Change one thing and watch what it does.'), n === 0 ? 6 : 3);
        let ta = n * 0.7, th = 0, was = held(), aim = null;
        path.visible = !!day.path;
        const ra = await ctx.loop(dt => {
          stepAir(dt, day.wind.x, day.wind.y);
          const h = held();
          if (!st.locked) {
            ta += dt;
            st.angle = aimAt(ta);
            if (h && !was) { st.locked = true; th = 0; audio.reel?.(); }
          } else if (h) {
            th += dt;
            st.power = powerAt(th);
          } else if (st.power < 0.12) {
            // a tap, not a hold: nothing is thrown, the aim swings on
            if (th > 0) ctx.hint(N_('Keep it held to wind up, then let go.'), 3);
            th = 0; st.power = 0; st.locked = false;
          } else aim = { angle: st.angle, power: st.power };
          was = h;
          setNeedle(st.angle); setPower(st.power);
          inHand(st.angle);
          if (day.path) {
            // the flight to come, for this angle (and the power so far; a firm throw while she has not wound up yet)
            const s = flyThrow(P, { angle: st.angle, power: st.locked ? Math.max(0.15, st.power) : 0.85 }, day, ground, { nth: n, path: paBuf, every: 9 });
            const a = paPos.array;
            for (let i = 0; i < PATH_N; i++) { const j = Math.min(i, s.n - 1) * 3; a[i * 3] = O.x + O.dx * paBuf[j] + O.rx * paBuf[j + 1]; a[i * 3 + 1] = O.y + paBuf[j + 2]; a[i * 3 + 2] = O.z + O.dz * paBuf[j] + O.rz * paBuf[j + 1]; }
            paPos.needsUpdate = true;
          }
          return aim ? true : undefined;
        });
        if (ra?.quit) return { score: st.score, quit: true };
        path.visible = false;

        // -- the flight
        st.phase = 'fly';
        const fl = st.fl = newThrow(P, aim, day, n);
        p.gesture('Interact', { lock: false });
        audio.whoosh(2 + aim.power * 3);
        show('none');
        el.lab.textContent = tx('Throw {n} of {m}', { n: n + 1, m: THROW.throws });
        ctx.hintTop(false);
        handAt();
        const h0 = hand.clone().sub(origin);                    // where it leaves her hand (the rules throw from above her feet)
        const hx = h0.dot(d), hy = h0.dot(r), hz = h0.y - THROW.hand;
        trail.visible = true;
        let tn = 0, acc = 0, shownM = -1, tSince = 0, loopSaid = 0;
        const at = out => toWorld(fl.x + hx * Math.max(0, 1 - fl.t * 2), fl.y + hy * Math.max(0, 1 - fl.t * 2), fl.z + hz * Math.max(0, 1 - fl.t * 2), out);
        at(pp);
        for (let i = 0; i < TRAIL_N; i++) trPos.setXYZ(i, pp.x, pp.y, pp.z);
        camPos.copy(camHome); camLook.copy(lookHome);
        g.follow.track(() => camPos, () => camLook, 4.5);
        const back = portrait ? 9 : 6.8;
        const rf = await ctx.loop(dt => {
          acc += Math.min(dt, 0.1);
          while (acc >= STEP && !fl.landed) { stepPlane(fl, P, day, STEP, ground); acc -= STEP; }
          stepAir(dt, fl.wx, fl.wy);
          at(pp);
          if (fl.landed) pp.y += 0.55;                          // it rests on top of the grass
          plane.position.copy(pp);
          plane.scale.setScalar(HOLD_SCALE + (FLY_SCALE - HOLD_SCALE) * Math.min(1, fl.t * 1.5));
          // nose along its flight through the air (a stalled plane hangs nose-high and wobbles), banked into its turn
          const gg = fl.landed ? -0.25 : fl.g + (fl.stall ? 0.5 : 0), cg = Math.cos(gg), cpsi = Math.cos(fl.psi), spsi = Math.sin(fl.psi);
          fwd.set((O.dx * cpsi + O.rx * spsi) * cg, Math.sin(gg), (O.dz * cpsi + O.rz * spsi) * cg);
          if (Math.abs(cg) < 0.05) plane.up.set(-O.dx * cpsi - O.rx * spsi, 0, -O.dz * cpsi - O.rz * spsi); else plane.up.set(0, cg < 0 ? -1 : 1, 0);
          plane.lookAt(tmp.copy(pp).add(fwd));
          if (!fl.landed) plane.rotateZ(P.turn * 2.2 + Math.sin(fl.t * 9) * (0.06 + (1 - P.neat) * 0.22) + (fl.stall ? Math.sin(fl.t * 13) * 0.3 : 0));
          // the trail
          tSince += dt;
          if (!fl.landed && tSince > 0.05) {
            tSince = 0;
            const a = trPos.array;
            if (tn < TRAIL_N) tn++; else a.copyWithin(0, 3);
            a[(tn - 1) * 3] = pp.x; a[(tn - 1) * 3 + 1] = pp.y; a[(tn - 1) * 3 + 2] = pp.z;
            for (let i = tn; i < TRAIL_N; i++) { a[i * 3] = pp.x; a[i * 3 + 1] = pp.y; a[i * 3 + 2] = pp.z; }
            trPos.needsUpdate = true;
          }
          // the camera flies along behind it, a little to the side, and never lower than the hill
          camPos.copy(pp).addScaledVector(d, -back).addScaledVector(r, 2.4);
          camPos.y = Math.max(pp.y + 1.6, world.heightAt(camPos.x, camPos.z) + 1.7);
          camLook.copy(pp).addScaledVector(d, 3.5);
          const m = Math.max(0, Math.floor(fl.x));
          if (m !== shownM) { shownM = m; el.info.innerHTML = `<span class="chip big">${tx('{n} m', { n: m })}</span>${windChip()}${day.goal ? `<span class="chip">${tx('Goal {n} m', { n: day.goal })}</span>` : ''}`; }
          if (fl.loops > loopSaid) { loopSaid = fl.loops; audio.star?.(); ctx.hint(N_('A loop!'), 2); }
          if (fl.lift > 0.5 && !thermalSaid) { thermalSaid = true; ctx.hint(N_('See it rise? Warm air is lifting it: a thermal.'), 4); }
          return fl.landed ? true : undefined;
        });
        if (rf?.quit) return { score: st.score, quit: true };

        // -- the landing: a flag with its metres
        st.phase = 'land';
        const ring = inRing(day, fl), why = verdict(fl, P, st.best);
        st.throws.push({ dist: fl.dist, ring, loops: fl.loops, wet: fl.wet, why, design: st.design, tweaks: { ...st.tweaks }, angle: aim.angle, power: aim.power });
        const before = st.best, sc = score();
        if (fl.wet) { audio.splash?.(0.5); fx.burst?.(pp, { n: 26, color: [0.6, 0.85, 1], speed: 3.5, size: 0.3, gravity: 6 }); plane.visible = false; }
        else {
          const f = flags[n];
          toWorld(fl.x + 0.3, fl.y + 0.9, groundZ(fl.x + 0.3, fl.y + 0.9), f.position);     // (beside the plane, not on it)
          f.rotation.y = FIELD.heading + Math.PI / 2;
          f.userData.lab.userData.set(tx('{n} m', { n: Math.floor(fl.dist) }));
          f.userData.lab.visible = true;
          f.visible = true;
          audio.land?.(0.3);
          fx.burst?.(f.position.clone().add(tmp.set(0, 0.6, 0)), { n: 16, color: [1, 0.9, 0.5], speed: 2.4, size: 0.22, gravity: 3 });
        }
        if (ring) { audio.star?.(); fx.burst?.(pp, { n: 34, color: [1, 0.85, 0.3], speed: 5, size: 0.45, gravity: 1 }); }
        if (!fl.wet && fl.dist > newRecord) newRecord = fl.dist;
        const goalNow = sc.goal && !(day.goal > 0 && before >= day.goal);
        if (goalNow) audio.fanfare?.();
        ctx.hint(ring ? N_('Right in the ring! Ten more points.') : goalNow ? N_('Over the goal line! You read the wind well.') : VERDICT[why], 4);
        if (why === 'stall') seenStall = true;
        el.info.innerHTML = `<span class="chip big">${fl.wet ? tx(N_('In the river')) : tx('{n} m', { n: Math.floor(fl.dist) })}</span>${windChip()}`;
        // look at it for a moment (a press moves on), then back up the hill
        let tl = 0;
        ptr.tap = false;
        const rl = await ctx.loop(dt => {
          tl += dt;
          stepAir(dt, day.wind.x, day.wind.y);
          camPos.copy(pp).addScaledVector(d, -back * 0.8).addScaledVector(r, 2.4);
          camPos.y = Math.max(pp.y + 2.6, world.heightAt(camPos.x, camPos.z) + 2.2);
          const pr = pressNow();
          return tl > 3.2 || tl > 0.9 && pr ? true : undefined;
        });
        if (rl?.quit) return { score: st.score, quit: true };
        trail.visible = false;
        plane.visible = true;
        plane.up.set(0, 1, 0);
        if (n < THROW.throws - 1) {
          g.follow.cutscene({ pos: camHome, look: lookHome }, 0.7);
          inHand(10);
          // one thing to try next, from what just happened
          if (rows.includes('clip') && !seenClip && day.kind === 'head' && !st.tweaks.clip) { seenClip = true; ctx.hint(N_('Into a headwind, try the paper clip: a heavier nose pushes through.'), 4.5); }
          else if (seenStall && rows.includes('elev') && st.tweaks.elev > 1) ctx.hint(N_('It stalls with the back edges bent up so far. Flatten them a little.'), 4.5);
          const rw = await ctx.wait(0.75);
          if (rw?.quit) return { score: st.score, quit: true };
        }
      }

      // ---- the end of the round
      const fin = score();
      SESSION[level] = newRecord;                              // (the tape moves for the next round)
      st.phase = 'done';
      ui.classList.add('hidden');
      await ctx.wait(0.5);
      await ctx.fade(true, 300);
      cleanup();
      await ctx.fade(false, 400);
      const bestT = st.throws.reduce((a, t) => (!t.wet && (!a || t.dist > a.dist) ? t : a), null);
      const lesson = day.kind === 'tail' ? N_('With the wind behind it, a slow, floating plane stays up longest and is carried furthest.')
        : day.kind === 'head' ? N_('Against the wind a fast, heavy-nosed plane keeps its speed. A slow floater is blown back.')
          : day.kind === 'cross' ? N_('A side wind pushes every plane off its line. A steady one, or a wingtip bent into the wind, holds it.')
            : N_('Throw gently and level, not hard and up. A plane thrown steeply slows down, stalls and drops.');
      return {
        score: fin.score, quit: false,
        detail: { best: Math.floor(fin.best), throws: st.throws.map(t => Math.floor(t.dist)), ring: fin.ring, goal: fin.goal, loop: fin.loop, perfect: st.trim.perfect, folds: total, design: st.design, kind: day.kind },
        extra: tx('best throw: {n} m', { n: Math.floor(fin.best) }),
        note: [tx('{n} of {m} folds exact', { n: st.trim.perfect, m: total }), fin.ring ? tx(N_('in the ring')) : '', fin.goal ? tx(N_('over the goal line')) : '', fin.loop ? tx(N_('a loop')) : ''].filter(Boolean).join(' · '),
        fact: { title: bestT ? tx('Today: {wind}, {plane}', { wind: tx(WIND_NAME[day.kind]), plane: tx(DESIGN[bestT.design].name) }) : tx(WIND_NAME[day.kind]), text: tx(lesson) },
      };
    } finally {
      // a quit or an error anywhere above: put everything back (the framework un-fades nothing, so do it here)
      if (!cleaned) { cleanup(); ctx.fade(false, 300); }
    }
  },
};

const SESSION = { easy: 0, normal: 0, hard: 0 };     // the longest throw of this visit, per level (the record tape)
let lastDesign = 'dart';
