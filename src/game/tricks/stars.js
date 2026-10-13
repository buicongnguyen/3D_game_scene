// Stargazing (docs/RURAL-TRICKS.md trick 11): any clear night, on the hill behind the signal cottage. Mika lies back
// (a camera shot from her eyes; no clip needed) under a sky far richer than the city's: a starfield dome with the
// Milky Way. Join the stars of a figure in order, find the North Star, then catch a shooting star and make a wish.
// Score: stars joined, the North Star, the wish, speed, minus wrong picks.
//
// The levels (gazePlan) ask for different things:
//   Easy       the Big Dipper, then its two pointer stars lead to the North Star (a line shows most of the way).
//   Normal     the Big Dipper AND Cassiopeia, the W on the other side of the pole: the North Star sits between the two (the
//              pointer line starts you off, and a short one from the middle of the W). The sky is drawn a little smaller and
//              the view tilts up to the pole once the Dipper is joined.
//   Difficult  all of that with no guiding lines at all, then the Little Dipper's faint stars down from the North Star, while
//              clouds drift over: a star under a cloud cannot be seen or picked until it has passed.
//
// Drawing: the dome is generated once (seeded) and reused: one Points draw call for ~5,000 static stars, one line set for the
// figures, one line for the shooting star. The named stars of the level (8 to 19) are their own small Points, made for the
// round (their glow is written each frame), and Difficult adds three cloud sprites; both are freed when the round ends.
import * as THREE from 'three';
import { N_ } from '../../i18n/i18n.js';
import { dipperPatch, STARS } from '../../content/constellations.js';

const R = 600;                         // dome radius around the camera (well inside the far plane)
const AZ = Math.PI;                    // Mika looks toward -z, out over the valley
const ELEV = 52 * Math.PI / 180;       // the centre of the first view above the horizon
const CENTRE = [-8, 6.5];              // the first view's centre in the Easy figure's own degrees (see NAMED)
// the Big Dipper and the North Star, in degrees on a small patch of sky (u right, v up). Merak -> Dubhe, five times
// over, reaches Polaris: the "pointer stars" rule.
// (real star positions: content/constellations.js, drawn here at 0.75 of the real spread with the North Star straight above Dubhe)
export const NAMED = dipperPatch();
export const DIPPER = ['alkaid', 'mizar', 'alioth', 'megrez', 'phecda', 'merak', 'dubhe'];
export const CASS = ['caph', 'schedar', 'navi', 'ruchbah', 'segin'];
/** The Little Dipper is joined on from the North Star (the tip of its handle), down to the little bowl. */
export const LITTLE = ['polaris', 'yildun', 'epsumi', 'zetumi', 'etaumi', 'pherkad', 'kochab'];
const REVERSED = [...DIPPER].reverse(), ENDS = [DIPPER[0], DIPPER[DIPPER.length - 1]], NONE = [], ONLY_POLARIS = ['polaris'];
const NEXT = { fwd: DIPPER.map(k => [k]), back: REVERSED.map(k => [k]) };   // the answers of nextStars, made once
const LABEL = {
  alkaid: N_('Alkaid, the tip of the handle'), mizar: 'Mizar', alioth: 'Alioth', megrez: N_('Megrez, where the handle meets the bowl'),
  phecda: 'Phecda', merak: N_('Merak, a pointer star'), dubhe: N_('Dubhe, a pointer star'), polaris: N_('Polaris, the North Star'),
};

/**
 * The next star to pick in the Dipper, given those picked so far (either end may start). Returns the allowed ids.
 * Pure: tested in tests/tricks.test.mjs.
 */
export function nextStars(picked) {
  if (!picked.length) return ENDS;
  const order = picked[0] === DIPPER[0] ? NEXT.fwd : NEXT.back;
  return picked.length < order.length ? order[picked.length] : NONE;      // (shared lists: read, never changed)
}

/**
 * The next star of any figure joined as a chain: either end may start (both are offered), then it runs on from that end.
 * `out`: a list to fill instead of a new one (the round asks every frame).
 */
export function nextInChain(chain, picked, out = []) {
  out.length = 0;
  if (!picked.length) { out.push(chain[0], chain[chain.length - 1]); return out; }
  if (picked.length >= chain.length) return out;
  out.push(picked[0] === chain[0] ? chain[picked.length] : chain[chain.length - 1 - picked.length]);
  return out;
}

/** The figures a level joins: { chain, from: picked already (the Little Dipper starts at the North Star, found before) }. */
export const FIGURES = { dipper: { chain: DIPPER, from: 0 }, cass: { chain: CASS, from: 0 }, little: { chain: LITTLE, from: 1 } };

/**
 * What a level asks for: { steps: ['dipper' | 'cass' | 'polaris' | 'little', …], scale (the sky's spread, times the real
 * one), guide (how far the pointer line is drawn toward the North Star, 0..1), clouds, par (seconds for the speed bonus),
 * stars (how many are joined in all) }. The guided first try is Easy with the pointer line drawn all the way.
 */
export function gazePlan(level = 'normal', first = false) {
  const plan = first || level === 'easy' ? { steps: ['dipper', 'polaris'], scale: 0.75, guide: first ? 0.9 : 0.6, clouds: false, par: 45 }
    : level === 'hard' ? { steps: ['dipper', 'cass', 'polaris', 'little'], scale: 0.6, guide: 0, clouds: true, par: 120 }
      : { steps: ['dipper', 'cass', 'polaris'], scale: 0.6, guide: 0.35, clouds: false, par: 80 };
  plan.stars = plan.steps.reduce((n, s) => n + (FIGURES[s] ? FIGURES[s].chain.length - FIGURES[s].from : 0), 0);
  return plan;
}

/**
 * Round score: 10 per star joined, 20 for the North Star, 15 for the wish, a speed bonus once everything is found (half a
 * point for every second under the level's par), 4 off per wrong pick. `polaris` alone means "all found" (the Easy round).
 */
export function starScore({ joined = 0, polaris = false, wish = false, mistakes = 0, seconds = 99, par = 45, done = polaris }) {
  const speed = done ? Math.max(0, Math.round((par - seconds) / 2)) : 0;
  return Math.max(0, joined * 10 + (polaris ? 20 : 0) + (wish ? 15 : 0) + speed - mistakes * 4);
}

/** The most a level can score: every star, the North Star, the wish and the fastest plausible finish (3 s a star). */
export function gazeMax(plan) {
  const n = plan.stars + 1;
  return starScore({ joined: plan.stars, polaris: true, wish: true, seconds: n * 3, par: plan.par, done: true });
}

/**
 * The level's named stars on the sky patch (degrees, u right and v up, Dubhe at the origin, the North Star straight above
 * it): an azimuthal-equidistant picture around Dubhe from the real positions, drawn at `scale` of the real spread. The same
 * picture as dipperPatch() (which is this at 0.75, moved 1.6 to the right).
 */
export function skyPatch(ids, scale = 0.75) {
  const RAD = Math.PI / 180;
  const unit = (ra, dec) => { const a = ra * 15 * RAD, d = dec * RAD; return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)]; };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const nrm = a => { const l = Math.hypot(...a); return a.map(v => v / l); };
  const o = unit(STARS.dubhe.ra, STARS.dubhe.dec), north = unit(STARS.polaris.ra, STARS.polaris.dec);
  const y = nrm(north.map((v, i) => v - dot(north, o) * o[i])), x = cross(o, y);
  const out = {};
  for (const id of ids) {
    const p = unit(STARS[id].ra, STARS[id].dec), dist = Math.acos(Math.max(-1, Math.min(1, dot(p, o)))) / RAD;
    const q = p.map((v, i) => v - dot(p, o) * o[i]), ql = Math.hypot(...q) || 1;
    out[id] = [scale * dist * dot(q, x) / ql, scale * dist * dot(q, y) / ql];
  }
  return out;
}

/** Every named star of a plan, once each, in the order they are met. */
export function planStars(plan) {
  const ids = [];
  for (const s of plan.steps) for (const id of FIGURES[s]?.chain || ['polaris']) if (!ids.includes(id)) ids.push(id);
  return ids;
}

/** A cloud covers this much of the patch round its middle (degrees across and up): what its sprite hides. */
export const CLOUD = { x: 9.5, y: 4.2, wrap: 36 };
/** Is a star (its patch point [u, v]) under a cloud whose middle is at (cu, cv)? */
export function cloudCovers(star, cu, cv) { return Math.abs(star[0] - cu) < CLOUD.x && Math.abs(star[1] - cv) < CLOUD.y; }

// --------------------------------------------------------------------- the sky (built once)
const V3 = THREE.Vector3;
const basis = () => {
  const f = new V3(Math.cos(ELEV) * Math.sin(AZ), Math.sin(ELEV), Math.cos(ELEV) * Math.cos(AZ)).normalize();
  const r = new V3().crossVectors(f, new V3(0, 1, 0)).normalize();
  const u = new V3().crossVectors(r, f).normalize();
  return { f, r, u };
};
/** Direction of a figure point (degrees on the patch) as a unit vector; centre: the patch point straight ahead of the first view. */
function dirOf([u, v], B = basis(), centre = CENTRE, out = new V3()) {
  const du = THREE.MathUtils.degToRad(u - centre[0]), dv = THREE.MathUtils.degToRad(v - centre[1]);
  return out.copy(B.f).addScaledVector(B.r, Math.tan(du)).addScaledVector(B.u, Math.tan(dv)).normalize();
}

const STAR_VERT = `
attribute float aSize;
attribute vec3 aColor;
uniform float uScale;
uniform float uTime;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.82 + 0.18 * sin(uTime * (1.3 + fract(position.x * 0.13) * 3.0) + position.z);
  gl_PointSize = aSize * uScale;
  vColor = aColor * tw;
}`;
const STAR_FRAG = `
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d);
  gl_FragColor = vec4(vColor, a * a);
}`;
const starMaterial = () => new THREE.ShaderMaterial({ vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, uniforms: { uScale: { value: 300 }, uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const LINES = 24;                      // line segments the figures can use (the longest plan joins 16 and draws two guides)

let SKY = null;
function buildSky() {
  if (SKY) return SKY;
  let seed = 20261009;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pos = [], size = [], col = [];
  const add = (d, s, c) => { pos.push(d.x * R, d.y * R, d.z * R); size.push(s); col.push(...c); };
  const tint = () => { const k = rand(); return k < 0.15 ? [0.75, 0.85, 1] : k < 0.25 ? [1, 0.85, 0.65] : [1, 1, 0.95]; };
  // the field: many faint stars, a few bright ones
  for (let i = 0; i < 2600; i++) {
    const y = rand() * 1.08 - 0.08, a = rand() * Math.PI * 2, h = Math.sqrt(1 - y * y);
    const m = Math.pow(rand(), 7);
    const c = tint(), b = 0.35 + m * 0.9;
    add(new V3(Math.cos(a) * h, y, Math.sin(a) * h), 0.0035 + m * 0.006, c.map(x => x * b));
  }
  // the Milky Way: a soft band of tiny dim stars along a tilted great circle, thicker in the middle
  const n = new V3(0.55, 0.42, 0.72).normalize(), e1 = new V3().crossVectors(n, new V3(0, 1, 0)).normalize(), e2 = new V3().crossVectors(n, e1);
  for (let i = 0; i < 4200; i++) {
    const th = rand() * Math.PI * 2;
    const gauss = (rand() + rand() + rand() - 1.5) * (0.12 + 0.08 * Math.cos(th * 2));
    const d = e1.clone().multiplyScalar(Math.cos(th)).addScaledVector(e2, Math.sin(th)).addScaledVector(n, gauss).normalize();
    if (d.y < -0.08) continue;
    const b = 0.22 + rand() * 0.38;
    add(d, 0.0032 + rand() * 0.0035, [0.8 * b, 0.86 * b, 1 * b]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
  geo.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
  const field = new THREE.Points(geo, starMaterial());
  field.frustumCulled = false;
  // the figure lines (drawn as Mika joins the stars) and the pointer guides
  const lgeo = new THREE.BufferGeometry();
  lgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LINES * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
  lgeo.setDrawRange(0, 0);
  const lines = new THREE.LineSegments(lgeo, new THREE.LineBasicMaterial({ color: '#ffd76a', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  lines.frustumCulled = false;
  lines.renderOrder = 6;
  // the shooting star: a two-point line, bright head, dark (= invisible, additive) tail
  const sgeo = new THREE.BufferGeometry();
  sgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3).setUsage(THREE.DynamicDrawUsage));
  sgeo.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 0.92, 0, 0, 0], 3));
  const shoot = new THREE.Line(sgeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  shoot.frustumCulled = false;
  shoot.visible = false;
  const group = new THREE.Group();
  group.add(field, lines, shoot);
  group.name = 'stargazing-dome';
  SKY = { group, field, lines, shoot, B: basis() };
  return SKY;
}

/** The level's named stars as their own small Points (made for a round, freed with it): { points, dirs, names, dispose }. */
function buildNamed(plan, B) {
  const names = planStars(plan), patch = skyPatch(names, plan.scale);
  // the first view looks at the same part of the Dipper at every scale
  const centre = [(CENTRE[0] - 1.6) * plan.scale / 0.75, CENTRE[1] * plan.scale / 0.75];
  const dirs = names.map(k => dirOf(patch[k], B, centre));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(dirs.flatMap(d => [d.x * R, d.y * R, d.z * R]), 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(names.length), 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(names.length * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const mat = starMaterial(), points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 6;
  return { points, dirs, names, patch, centre, dispose() { points.removeFromParent(); geo.dispose(); mat.dispose(); } };
}

/** A soft night cloud for the sprites (dark blue-grey, a little moonlit at the top). */
function cloudTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const x = c.getContext('2d');
  for (const [cx, cy, r] of [[36, 38, 22], [60, 30, 27], [88, 36, 23], [64, 42, 25], [104, 42, 15], [22, 44, 13]]) {
    const gr = x.createRadialGradient(cx, cy - 3, 0, cx, cy, r);
    gr.addColorStop(0, 'rgba(92,106,150,1)'); gr.addColorStop(0.55, 'rgba(58,70,108,0.96)'); gr.addColorStop(1, 'rgba(40,50,84,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 128, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const STEP_HINT = {
  cass: N_('Now look higher: five stars in a zigzag, like a W on its side. That is Cassiopeia. Join them from either end.'),
  polarisGuided: N_('The Big Dipper! Now follow the two stars at the end of the bowl, about five times their gap, to the North Star.'),
  polarisBoth: N_('The North Star sits between the two. Follow the Dipper\'s pointer stars, or go straight out from the middle of the W.'),
  polarisAlone: N_('Now the North Star: between the Big Dipper and the W. No lines to help tonight!'),
  little: N_('The North Star is the tip of the Little Dipper\'s handle. Join its faint stars, down to the little bowl.'),
};
const WRONG = {
  dipper: N_('Not that one. The next star along the ladle.'), cass: N_('Not that one. The next star along the W.'),
  little: N_('Not that one. The next star down the little handle.'),
};
const DONE = {
  cass: N_('Cassiopeia! She sits across the North Star from the Big Dipper, all year round.'),
  little: N_('The Little Dipper! It swings round the North Star all night.'),
};

export default {
  id: 'stars',

  async play(ctx) {
    const { game: g, player: p, audio, fx } = ctx;
    const cam = g.camera, sky = buildSky();
    const plan = gazePlan(ctx.level, ctx.first);
    const st = { step: 0, picked: { dipper: [], cass: [], little: ['polaris'] }, joined: 0, polaris: false, wish: false, mistakes: 0, phase: plan.steps[0], tDone: 0, tStep: 0, shots: 0, done: false };
    let left = ctx.roundTime;

    // lie back on the hill: a fade, the night, and the view from Mika's eyes up into the sky
    const rootWas = p.root.visible, tamo = ctx.director.tamo?.root || null, tamoWas = tamo?.visible;
    const canvas = g.canvas || g.renderer.renderer.domElement;
    let ring = null, onMove = null, onDown = null, cleaned = false, named = null;
    const clouds = [], own = [];
    // back to the valley, however the round ends (a quit, or an error half-way)
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (onMove) canvas.removeEventListener('pointermove', onMove);
      if (onDown) removeEventListener('pointerdown', onDown);
      ring?.remove();
      sky.shoot.visible = false;
      named?.dispose();
      for (const c of clouds) c.sprite.removeFromParent();
      for (const x of own) x.dispose();
      sky.group.removeFromParent();
      p.root.visible = rootWas;
      if (tamo && tamoWas !== undefined) tamo.visible = tamoWas;
      ctx.setNight(false);
      g.follow.clearCutscene(true);
      ctx.lock(false);
    };
    try {
    ctx.lock(true);
    await ctx.fade(true, 400);
    ctx.setNight(true, 23);
    named = buildNamed(plan, sky.B);
    const NAMES = named.names, dirs = named.dirs, idx = k => NAMES.indexOf(k);
    sky.group.add(named.points);
    const eye = p.pos.clone().add(new V3(0, 0.55, 0));
    const look = eye.clone().addScaledVector(sky.B.f, 10);
    g.follow.cutscene({ pos: eye, look }, 0.001, { pos: eye.clone(), look: look.clone() });
    p.root.visible = false;
    if (tamo) tamo.visible = false;
    g.scene.add(sky.group);
    sky.lines.geometry.setDrawRange(0, 0);
    // the view of the pole: the North Star a little below the middle, the Dipper's bowl under it and the W above
    // (a little low in the picture: the HUD and the hint bubble own the top of the screen)
    const poleStars = NAMES.filter(k => !DIPPER.includes(k) || k === 'dubhe' || k === 'merak').map(k => named.patch[k]);
    const span = i => { const v = poleStars.map(q => q[i]); return (Math.min(...v) + Math.max(...v)) / 2; };
    const poleCentre = [span(0), span(1) + 2.6];
    const poleDir = dirOf(poleCentre, sky.B, named.centre);
    let viewC = named.centre, north = false;
    const lookNorth = () => {
      if (north || plan.steps.length <= 2) return;
      north = true; viewC = poleCentre;
      g.follow.cutscene({ pos: eye, look: eye.clone().addScaledVector(poleDir, 10) }, 1.8);
    };
    // clouds (Difficult): three soft sprites drifting across the patch, one row each for the Dipper, the pole and the W
    if (plan.clouds) {
      const tex = cloudTexture(), mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.97, depthWrite: false, fog: false });
      own.push(tex, mat);
      const wide = 2 * R * 0.96 * Math.tan((CLOUD.x + 3.5) * Math.PI / 180), tall = 2 * R * 0.96 * Math.tan((CLOUD.y + 2.8) * Math.PI / 180);
      const top = named.patch.caph[1];
      [[-2, 2.6, 14], [top * 0.5, -2.2, -20], [top * 0.94, 2.4, -34]].forEach(([v, speed, u0]) => {
        const s = new THREE.Sprite(mat);
        s.scale.set(wide, tall, 1);
        s.renderOrder = 7;
        sky.group.add(s);
        clouds.push({ sprite: s, u: u0, v, speed, dir: new V3() });
      });
    }
    await ctx.wait(0.2);
    await ctx.fade(false, 700);

    // the ring Mika points with: stick / WASD moves it, the mouse hovers it, a tap or click puts it there and picks
    ring = document.createElement('div');
    ring.style.cssText = 'position:fixed;left:0;top:0;width:46px;height:46px;margin:-23px 0 0 -23px;border:3px solid rgba(255,226,140,.95);border-radius:50%;box-shadow:0 0 12px rgba(255,220,120,.6),inset 0 0 8px rgba(255,220,120,.4);pointer-events:none;z-index:14;transition:border-color .2s';
    document.body.appendChild(ring);
    let rx = innerWidth / 2, ry = innerHeight / 2, pick = false, shake = 0;
    onMove = e => { if (e.pointerType === 'mouse') { rx = e.clientX; ry = e.clientY; } };
    // anywhere on screen except the buttons (pause, journal): the hint and HUD let clicks through
    onDown = e => { if (e.target.closest?.('button, a, input, select, .overlay')) return; rx = e.clientX; ry = e.clientY; pick = true; };
    ctx.hintTop(true, ctx.ui.touch ? 112 : 0);            // (on a phone: under the two corner buttons)
    canvas.addEventListener('pointermove', onMove);
    addEventListener('pointerdown', onDown);

    const tmp = new V3();
    const screenOf = (d, out) => { tmp.copy(d).multiplyScalar(R).add(sky.group.position).project(cam); out.x = (tmp.x * 0.5 + 0.5) * innerWidth; out.y = (-tmp.y * 0.5 + 0.5) * innerHeight; out.z = tmp.z; return out; };
    const scr = NAMES.map(() => ({ x: 0, y: 0, z: 0 }));
    const hidden = new Uint8Array(NAMES.length);          // 1: a cloud is over this star now
    const patchOf = NAMES.map(k => named.patch[k]);
    // (the smaller sky of Normal and Difficult has its stars closer together: a tighter reach, so the nearest one is the one meant)
    const thr = (ctx.ui.touch ? 58 : 44) * (plan.scale < 0.7 ? 0.8 : 1);
    /** The named star under the ring: its name, or null. A star behind a cloud is not there to be picked (`clouded` says so). */
    let clouded = false;
    const nearest = () => {
      let best = null, bd = thr;
      clouded = false;
      for (let i = 0; i < NAMES.length; i++) {
        const s = scr[i];
        if (s.z > 1) continue;
        const d = Math.hypot(s.x - rx, s.y - ry);
        if (d >= bd) continue;
        if (hidden[i]) { clouded = true; continue; }
        bd = d; best = NAMES[i];
      }
      if (best) clouded = false;
      return best;
    };
    const linePos = sky.lines.geometry.attributes.position;
    let lineN = 0;
    const guideAt = {};                                   // the line number of each pointer guide (overwritten by the real line)
    const segment = (a, b, at = lineN++) => {
      const da = dirs[idx(a)], db = typeof b === 'string' ? dirs[idx(b)] : b;
      linePos.setXYZ(at * 2, da.x * R * 0.99, da.y * R * 0.99, da.z * R * 0.99);
      linePos.setXYZ(at * 2 + 1, db.x * R * 0.99, db.y * R * 0.99, db.z * R * 0.99);
      linePos.needsUpdate = true;
      sky.lines.geometry.setDrawRange(0, Math.max(sky.lines.geometry.drawRange.count, at * 2 + 2));
      return at;
    };
    /** A pointer line from a star part of the way to the North Star (the level says how far; none on Difficult). */
    const guide = from => {
      if (plan.guide <= 0 || guideAt[from] !== undefined) return;
      const d = dirs[idx(from)], pz = dirs[idx('polaris')];
      guideAt[from] = segment(from, d.clone().lerp(pz, from === 'dubhe' ? plan.guide : plan.guide * 0.8).normalize());
    };

    if (ctx.first) {
      ctx.hint(N_('See the pale band across the sky? The Milky Way: billions of stars, too far away to see one by one.'), 5.5);
      await ctx.wait(5.2);
    }
    ctx.hint(ctx.ui.touch ? N_('Find the Big Dipper: seven bright stars like a ladle. Tap them in order, from either end.')
      : N_('Find the Big Dipper: seven bright stars like a ladle. Point with the mouse or WASD, click or press {act} on each, in order.'), 6);

    const nextBuf = [];
    /** The stars that may be picked now (a shared list: read, never kept). */
    const nextNow = () => {
      const s = plan.steps[st.step];
      if (!s) return NONE;
      if (s === 'polaris') return ONLY_POLARIS;
      return s === 'dipper' ? nextStars(st.picked.dipper) : nextInChain(FIGURES[s].chain, st.picked[s], nextBuf);
    };
    ctx.debug.named = () => NAMES.map((k, i) => ({ k, x: scr[i].x, y: scr[i].y, hidden: !!hidden[i] }));
    ctx.debug.phase = () => st.phase;
    ctx.debug.next = () => [...nextNow()];
    ctx.debug.plan = plan;
    ctx.debug.state = st;
    ctx.debug.shooting = () => shootT >= 0 && shootT < 1.2;
    const sizes = named.points.geometry.attributes.aSize, cols = named.points.geometry.attributes.aColor;
    const faint = NAMES.map(k => (STARS[k].mag > 2.9 && k !== 'megrez' ? 0.78 : 1));       // the Little Dipper's handle is dim
    let shootT = -1, shootWait = 1.2, wishTries = 0, wrongHint = 0, elapsed = 0, cloudHint = 0;
    const sA = new V3(), sB = new V3(), head = new V3(), tail = new V3(), pt = [0, 0];
    // one record for the score and two remembered ring looks: the loop below builds nothing new each frame
    const tally = { joined: 0, polaris: false, wish: false, mistakes: 0, seconds: 0, par: plan.par, done: false };
    const scoreNow = () => { tally.joined = st.joined; tally.polaris = st.polaris; tally.wish = st.wish; tally.mistakes = st.mistakes; tally.seconds = st.tDone; tally.done = st.done; return starScore(tally); };
    /** A step is finished: say so, and set the next one up (or the wish, when it was the last). */
    const nextStep = () => {
      const was = plan.steps[st.step];
      st.step++; st.tStep = elapsed; wrongHint = 0;
      const now = plan.steps[st.step];
      if (!now) {
        st.done = true; st.tDone = elapsed; st.phase = 'wish'; shootWait = 3.5;
        audio.star();
        ctx.hint(was === 'polaris' ? N_('Polaris, the North Star. It hardly moves all night, so travellers always knew where north was.') : DONE[was], 5.5);
        return;
      }
      st.phase = now;
      audio.good();
      if (now === 'cass') { lookNorth(); ctx.hint(STEP_HINT.cass, 7); }
      else if (now === 'polaris') {
        lookNorth();
        guide('dubhe');
        if (plan.steps.includes('cass')) guide('navi');
        ctx.hint(plan.steps.includes('cass') ? plan.guide > 0 ? STEP_HINT.polarisBoth : STEP_HINT.polarisAlone : STEP_HINT.polarisGuided, 7);
      } else if (now === 'little') ctx.hint(STEP_HINT.little, 7);
    };
    let ringX = NaN, ringY = NaN, ringLit = null;
    const res = await ctx.loop(dt => {
      elapsed += dt;
      if (st.phase !== 'wish') left -= dt;
      sky.group.position.copy(cam.position);
      const scale = (g.renderer.renderer.domElement.height || innerHeight) * 0.5 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) / R;
      sky.field.material.uniforms.uScale.value = scale * R * 0.9;
      named.points.material.uniforms.uScale.value = scale * R * 0.9;
      sky.field.material.uniforms.uTime.value = ctx.t;
      named.points.material.uniforms.uTime.value = ctx.t;
      // the clouds drift across; a star under one is hidden
      if (clouds.length) {
        hidden.fill(0);
        for (const c of clouds) {
          c.u += c.speed * dt;
          if (c.u > CLOUD.wrap) c.u = -CLOUD.wrap; else if (c.u < -CLOUD.wrap) c.u = CLOUD.wrap;
          pt[0] = c.u; pt[1] = c.v;
          dirOf(pt, sky.B, named.centre, c.dir);
          c.sprite.position.copy(c.dir).multiplyScalar(R * 0.96);
          for (let i = 0; i < NAMES.length; i++) if (cloudCovers(patchOf[i], c.u, c.v)) hidden[i] = 1;
        }
      }
      // the ring: stick and keys move it
      const mv = g.input.move, sp = Math.min(innerWidth, innerHeight) * 0.75;
      rx = THREE.MathUtils.clamp(rx + mv.x * sp * dt, 10, innerWidth - 10);
      ry = THREE.MathUtils.clamp(ry - mv.y * sp * dt, 10, innerHeight - 10);
      shake = Math.max(0, shake - dt);
      const sx = shake > 0 ? Math.sin(shake * 60) * 8 : 0;
      const px = Math.round(rx + sx), py = Math.round(ry);
      if (px !== ringX || py !== ringY) { ringX = px; ringY = py; ring.style.transform = `translate(${px}px, ${py}px)`; }
      for (let i = 0; i < NAMES.length; i++) screenOf(dirs[i], scr[i]);
      // the named stars: bright, the picked ones golden, the next one pulsing in the guided try (and after a few wrong picks,
      // except on Difficult: nothing points the way there)
      const next = nextNow(), step = plan.steps[st.step];
      const mayHint = ctx.first || (wrongHint > 2 && !plan.clouds);
      for (let i = 0; i < NAMES.length; i++) {
        const k = NAMES[i];
        const on = (k === 'polaris' && st.polaris) || st.picked.dipper.includes(k) || st.picked.cass.includes(k) || (k !== 'polaris' && st.picked.little.includes(k));
        const hintMe = mayHint && next.includes(k) && !(k === 'polaris' && !ctx.first && elapsed - st.tStep < 10);
        const pulse = hintMe ? 0.5 + 0.5 * Math.sin(ctx.t * 6) : 0;
        sizes.setX(i, (k === 'polaris' ? 0.026 : 0.024) * faint[i] * (on ? 1.3 : 1) * (1 + pulse * 0.6));
        if (on) cols.setXYZ(i, 1.4, 1.15, 0.55); else cols.setXYZ(i, 1.05 + pulse * 0.4, 1.05 + pulse * 0.3, 1.1);
      }
      sizes.needsUpdate = true; cols.needsUpdate = true;
      const lit = !!nearest();
      if (lit !== ringLit) { ringLit = lit; ring.style.borderColor = lit ? 'rgba(255,240,170,1)' : 'rgba(255,226,140,.6)'; }

      const press = pick || ctx.pressed() || g.input.pressed('jump');
      pick = false;
      cloudHint -= dt;
      if (step) {
        if (press) {
          const k = nearest();
          if (k && next.includes(k)) {
            audio.twinkle(2); audio.blip(1 + (st.joined % 7) * 0.12);
            fx.twinkle?.(dirs[idx(k)].clone().multiplyScalar(30).add(cam.position));
            wrongHint = 0;
            if (step === 'polaris') {
              st.polaris = true;
              // the pointer line is drawn all the way now; from the W too when it helped
              if (guideAt.dubhe !== undefined) segment('dubhe', 'polaris', guideAt.dubhe); else segment('dubhe', 'polaris');
              if (guideAt.navi !== undefined) segment('navi', 'polaris', guideAt.navi);
              nextStep();
            } else {
              const list = st.picked[step], chain = FIGURES[step].chain;
              if (list.length) segment(list[list.length - 1], k);
              list.push(k);
              st.joined++;
              if (ctx.first && list.length < chain.length && LABEL[k]) ctx.hint(LABEL[k], 2.5);
              if (list.length === chain.length) {
                if (step === 'little') segment('kochab', 'zetumi');           // the little bowl closes
                nextStep();
              }
            }
          } else if (!k && clouded) {
            // a cloud is over what she pointed at: not a mistake, just wait
            if (cloudHint <= 0) { cloudHint = 5; ctx.hint(N_('A cloud is in the way. Wait for it to drift past.'), 3); }
            audio.blip(0.7);
          } else if (k || step === 'dipper') {
            st.mistakes++; wrongHint++; shake = 0.3;
            audio.bad();
            if (wrongHint === 1 || wrongHint === 3) ctx.hint(step === 'polaris' ? N_('Further along the pointer line. The North Star sits on its own.')
              : st.picked[step].length > FIGURES[step].from ? WRONG[step] : step === 'dipper' ? N_('Start at either end: the tip of the handle or the edge of the bowl.') : step === 'cass' ? N_('Start at either end of the W.') : WRONG[step], 3.5);
          }
        }
      } else if (st.phase === 'wish') {
        // a shooting star crosses the sky; press while it streaks to make a wish (three chances)
        if (shootT < 0) {
          shootWait -= dt;
          if (shootWait <= 0) {
            shootT = 0; wishTries++;
            if (wishTries === 1) ctx.hint(N_('Look! A shooting star! Quick, press to make a wish!'), 3);
            // (across the view she has now: the pole's, once she has looked up)
            const ox = viewC[0] - named.centre[0], oy = viewC[1] - named.centre[1];
            pt[0] = named.centre[0] - 18 + Math.random() * 10 + ox; pt[1] = named.centre[1] + 11.5 + Math.random() * 8 + oy;
            dirOf(pt, sky.B, named.centre, sA);
            pt[0] = named.centre[0] + 6 + Math.random() * 10 + ox; pt[1] = named.centre[1] - 4.5 + Math.random() * 6 + oy;
            dirOf(pt, sky.B, named.centre, sB);
            sky.shoot.visible = true;
            audio.twinkle(1.5);
          }
        } else {
          shootT += dt;
          const k = Math.min(1, shootT / 1.15);
          head.copy(sA).lerp(sB, k).normalize().multiplyScalar(R * 0.98);
          tail.copy(sA).lerp(sB, Math.max(0, k - 0.22)).normalize().multiplyScalar(R * 0.98);
          const sp2 = sky.shoot.geometry.attributes.position;
          sp2.setXYZ(0, head.x, head.y, head.z); sp2.setXYZ(1, tail.x, tail.y, tail.z); sp2.needsUpdate = true;
          if (press && shootT < 1.55) {
            st.wish = true; sky.shoot.visible = false;
            audio.star(); fx.burst?.(head.clone().normalize().multiplyScalar(30).add(cam.position), { n: 30, color: [1, 0.95, 0.6], speed: 2, size: 0.3, gravity: 0 });
            ctx.hint(N_('Wish made. Don\'t tell anyone, or it won\'t come true.'), 3.5);
            return { done: true };
          }
          if (shootT > 1.6) {
            shootT = -1; sky.shoot.visible = false; shootWait = 2.2;
            if (wishTries >= 3) { ctx.hint(N_('Too quick for a wish tonight. There will be others.'), 3.5); return { done: true }; }
            ctx.hint(N_('Missed it! Keep watching, they come in showers.'), 2.5);
          }
        }
      }
      ctx.hud(scoreNow(), st.phase === 'wish' ? null : left);
      if (left <= 0) { ctx.hint(N_('Time to head in. The stars will still be here tomorrow.'), 3.5); return { done: true }; }
      return undefined;
    });

    const score = scoreNow();
    if (!res.quit) await ctx.wait(1.6);
    // sit up: back to the valley
    await ctx.fade(true, 400);
    cleanup();
    await ctx.fade(false, 500);
    return { score, quit: !!res.quit && !st.joined, extra: st.wish ? N_('a wish made') : undefined,
      detail: { joined: st.joined, of: plan.stars, polaris: st.polaris, wish: st.wish, mistakes: st.mistakes, seconds: Math.round(st.tDone) } };
    } finally {
      // an error above left the screen as it was (perhaps black): put the valley back and show it
      if (!cleaned) { cleanup(); ctx.fade(false, 300); }
    }
  },
};
