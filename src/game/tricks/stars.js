// Stargazing (docs/RURAL-TRICKS.md trick 11): any clear night, on the hill behind the signal cottage. Mika lies back
// (a camera shot from high above the hilltop; no clip needed) under a sky far richer than the city's: a starfield dome with the
// Milky Way. Join the stars of a figure, find the North Star, then catch a shooting star and make a wish.
//
// The named stars stand where they really are (rules-stars.js: the catalogue positions for the season's night, seen from
// 35 degrees north), so the sky has true directions, and a compass shows them (ui/sky-compass.js): the letters N, E, S, W
// on the horizon and a small compass rose in the corner. The hints say which way to look; the view turns there by itself.
//
// The levels (rules-stars.js gazePlan):
//   Easy       find north: the Big Dipper (a faint outline shows it), then its two pointer stars to the North Star, which
//              the compass confirms ("right over N").
//   Normal     the Big Dipper, Cassiopeia, the North Star between them; then the view turns to the season's figure (the
//              Summer Triangle, Orion's belt, the Spring Triangle) and asks for its brightest star.
//   Difficult  no outlines, no letters on the horizon (the rose only); the Little Dipper's faint stars while a satellite
//              glides through them; then a satellite to tell from a plane and a shooting star, and a train of satellites
//              to count.
//
// Drawing: the dome is generated once (seeded) and reused: one Points draw call for ~5,000 static stars, one line set for the
// figures, one line for the shooting star. A round adds the level's named stars (8 to 19, one Points), the faint outline (one
// line set, Easy and Normal) and, on Difficult, the moving lights (one Points of 10); all are freed when the round ends,
// with the compass, the ring and the count buttons. The loop allocates nothing.
import * as THREE from 'three';
import { N_, tx, getLang } from '../../i18n/i18n.js';
import { STARS, profileFor, starName, worldDir } from '../../content/constellations.js';
import { createSkyCompass, compassName, projectSky, azDiff, COMPASS_LETTER } from '../../ui/sky-compass.js';
import {
  DIPPER, CASS, LITTLE, FIGURES, nextStars, nextInChain, nextInSet, gazeSky, gazePlan, planStars, starAt, starDir, starScore, starSize,
  frameView, middleOf, hardPasses, satAt, trainLag, trainChoices, planeBlink, SAT_FACT,
} from './rules-stars.js';

export * from './rules-stars.js';

const R = 600;                         // dome radius around the camera (well inside the far plane)
const EYE_UP = 120;                    // metres above Mika the sky is seen from: over the valley's rim, as the Star Kite lifts her in the sky viewer
const CLEAR_SKY = -1;                  // the world sky's cloud cover during a round: none (world/sky.js draws no cloud below 0)
const NONE = [], ONLY_POLARIS = ['polaris'];
const COLOUR = { w: [1, 1, 0.96], b: [0.8, 0.88, 1], y: [1, 0.95, 0.75], o: [1, 0.84, 0.62], r: [1, 0.68, 0.55] };
const LABEL = {
  alkaid: N_('Alkaid, the tip of the handle'), mizar: 'Mizar', alioth: 'Alioth', megrez: N_('Megrez, where the handle meets the bowl'),
  phecda: 'Phecda', merak: N_('Merak, a pointer star'), dubhe: N_('Dubhe, a pointer star'), polaris: N_('Polaris, the North Star'),
};

// --------------------------------------------------------------------- the sky (built once)
const V3 = THREE.Vector3;
const STAR_VERT = `
attribute float aSize;
attribute vec3 aColor;
uniform float uScale;
uniform float uTime;
uniform float uTw;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 1.0 - uTw + uTw * sin(uTime * (1.3 + fract(position.x * 0.13) * 3.0) + position.z);
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
/** twinkle: how much a point's light wavers (a star twinkles; a satellite's light is steady: 0). */
const starMaterial = (twinkle = 0.18) => new THREE.ShaderMaterial({ vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, uniforms: { uScale: { value: 300 }, uTime: { value: 0 }, uTw: { value: twinkle } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
const LINES = 36;                      // line segments the figures can use (the longest plan draws 21)
const MOVERS = 10;                     // the moving lights of Difficult: 0 the satellite, 1 the plane, 2.. the train
const TRAIN_MAX = MOVERS - 2;

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
  SKY = { group, field, lines, shoot };
  return SKY;
}

/**
 * What a round adds to the dome (made for the round, freed with it): the level's named stars as their own small Points,
 * the faint outline of the figures the level shows, and the moving lights of Difficult.
 * { points, outline, movers, dirs, names, dispose }.
 */
function buildRound(plan, sky) {
  const names = planStars(plan), tmp = [0, 0, 0];
  const dirs = names.map(k => new V3(...starDir(k, sky, tmp)));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(dirs.flatMap(d => [d.x * R, d.y * R, d.z * R]), 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(names.length), 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(names.length * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const mat = starMaterial(), points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 6;
  const own = [geo, mat], objs = [points];
  // the faint outline: the Dipper as the ladle it is (the chain, and the bowl closed)
  let outline = null;
  if (plan.outline.length) {
    const seg = [];
    for (const f of plan.outline) {
      const chain = FIGURES[f].chain;
      const pairs = chain.slice(1).map((b, i) => [chain[i], b]);
      if (f === 'dipper') pairs.push(['megrez', 'dubhe']);
      for (const [a, b] of pairs) for (const k of [a, b]) { const d = dirs[names.indexOf(k)]; seg.push(d.x * R * 0.992, d.y * R * 0.992, d.z * R * 0.992); }
    }
    const og = new THREE.BufferGeometry();
    og.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
    const om = new THREE.LineBasicMaterial({ color: '#a9bcff', transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    outline = new THREE.LineSegments(og, om);
    outline.frustumCulled = false;
    outline.renderOrder = 5;
    own.push(og, om); objs.push(outline);
  }
  // the moving lights: steady points (no twinkle), parked dark until their pass begins
  let movers = null;
  if (plan.steps.includes('satellite') || plan.decoy) {
    const mg = new THREE.BufferGeometry();
    const mp = new Float32Array(MOVERS * 3);
    for (let i = 0; i < MOVERS; i++) mp[i * 3 + 1] = R;
    mg.setAttribute('position', new THREE.BufferAttribute(mp, 3).setUsage(THREE.DynamicDrawUsage));
    mg.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(MOVERS), 1).setUsage(THREE.DynamicDrawUsage));
    mg.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(MOVERS * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const mm = starMaterial(0);
    movers = new THREE.Points(mg, mm);
    movers.frustumCulled = false;
    movers.renderOrder = 7;
    own.push(mg, mm); objs.push(movers);
  }
  return { points, outline, movers, dirs, names, dispose() { for (const o of objs) o.removeFromParent(); for (const x of own) x.dispose(); } };
}

// --------------------------------------------------------------------- the words
const HINT = {
  milky: N_('See the pale band across the sky? The Milky Way: billions of stars, too far away to see one by one.'),
  compass: N_('See the letters on the horizon? {n} is north. The little compass in the corner turns with your eyes.'),
  dipper: N_('Look to the {dir}. Find the Big Dipper: seven bright stars like a ladle. Join them from either end.'),
  dipperHard: N_('The Big Dipper is in the {dir} tonight. No outline to help: join its seven stars.'),
  cass: N_('Now look to the {dir}: five stars in a zigzag, like a W. That is Cassiopeia. Join them from either end.'),
  polarisGuided: N_('The Big Dipper! Now follow the two stars at the end of the bowl, about five times their gap, to the North Star.'),
  polarisBoth: N_('The North Star sits between the two. Follow the Dipper\'s pointer stars, or go straight out from the middle of the W.'),
  polarisAlone: N_('Now the North Star: follow the two stars at the end of the bowl. No line to help tonight!'),
  north: N_('Yes! The North Star sits right over the {n}. That way is north, all night long.'),
  northRose: N_('The North Star! Look at the compass in the corner: you are facing north.'),
  little: N_('The North Star is the tip of the Little Dipper\'s handle. Join its faint stars, down to the little bowl.'),
  decoy: N_('Something is gliding through the Little Dipper. A star stays put: pick only the stars.'),
  decoyPick: N_('That light is moving: a satellite, not a star. A star stays put and twinkles.'),
  bright: N_('Which star of the figure is the brightest? Point at it.'),
  brightWrong: N_('A bright one, but another shines stronger. Look again.'),
  kinds: N_('Now look to the {dir}. Not every light is a star: a star stays put and twinkles, a planet shines steadily.'),
  spot: N_('Three lights are moving. A plane blinks red and green. A shooting star is gone in a second. A satellite glides steadily. Pick the satellite!'),
  spotYes: N_('Yes, a satellite! Steady and slow. Watch: it fades when it slips into the Earth\'s shadow.'),
  spotPlane: N_('That one blinks red and green: a plane. A satellite does not blink.'),
  spotGone: N_('The satellite has slipped into the Earth\'s shadow. Never mind: here comes something new.'),
  train: N_('Look, a line of lights: a satellite train! New satellites, just launched, still travel together. How many are there?'),
  trainYes: N_('Yes, {n}! In a few weeks they spread out, climb higher and grow fainter.'),
  trainAgain: N_('Not quite. Count them once more as they pass.'),
  trainNo: N_('There were {n}. A train is hard to count!'),
  wrongStart: N_('Start at either end: the tip of the handle or the edge of the bowl.'),
  wrongW: N_('Start at either end of the W.'),
  wrongNorth: N_('Further along the pointer line. The North Star sits on its own.'),
};
const WRONG = {
  dipper: N_('Not that one. The next star along the ladle.'), cass: N_('Not that one. The next star along the W.'),
  little: N_('Not that one. The next star down the little handle.'), season: N_('Not that one. Look for the three bright ones.'),
};
const DONE = {
  cass: N_('Cassiopeia! She sits across the North Star from the Big Dipper, all year round.'),
  little: N_('The Little Dipper! It swings round the North Star all night.'),
};
/** The season's figure: how to find it, what to say when it is joined and when its brightest star is named. */
const FIGURE_WORDS = {
  'summer-triangle': {
    find: N_('Now turn to the {dir} and look high up: three bright stars, far apart. Join them into the Summer Triangle.'),
    done: N_('The Summer Triangle! Vega, Deneb and Altair, with the Milky Way running through.'),
    bright: N_('Yes, {star}! One of the brightest stars of the whole sky.'),
  },
  'spring-triangle': {
    find: N_('Now turn to the {dir}: three bright stars, far apart. Join them into the Spring Triangle.'),
    done: N_('The Spring Triangle! Arcturus, Spica and Denebola.'),
    bright: N_('Yes, {star}! Follow the curve of the Big Dipper\'s handle and you land on it.'),
  },
  orion: {
    find: N_('Now turn to the {dir}: three stars in a short row. That is Orion\'s Belt. Join them.'),
    done: N_('Orion the hunter! His belt, his shoulders and his feet.'),
    bright: N_('Yes, {star}! Blue-white, and brighter than the red shoulder.'),
  },
};

export default {
  id: 'stars',

  async play(ctx) {
    const { game: g, player: p, audio, fx } = ctx;
    const cam = g.camera, sky = buildSky();
    const night = gazeSky(g.shownSeason || g.time?.season);
    const plan = gazePlan(ctx.level, ctx.first, night);
    const fig = plan.figure, profile = profileFor(getLang());
    const st = { step: 0, picked: { dipper: [], cass: [], little: ['polaris'], season: [] }, joined: 0, polaris: false, tasks: 0, wish: false, mistakes: 0, phase: plan.steps[0], tDone: 0, tStep: 0, shots: 0, done: false };
    let left = ctx.roundTime;

    // lie back on the hill: a fade, the night, and the view from Mika's eyes up into the sky
    const rootWas = p.root.visible, tamo = ctx.director.tamo?.root || null, tamoWas = tamo?.visible;
    const canvas = g.canvas || g.renderer.renderer.domElement;
    const fovWas = g.follow.fovBase;
    let ring = null, onMove = null, onDown = null, cleaned = false, round = null, compass = null, countEl = null;
    // only stars: the valley's own painted clouds are taken out of the sky while the round runs, and so are its painted
    // night (a cloudy-looking Milky Way and a glaring moon), which the round's own dome of stars replaces. The sky sets
    // both every frame, so they are written after it, in the game's afterUpdate slot; when the slot is given back the
    // sky is its own again on the next frame.
    const afterWas = g.afterUpdate, cover = g.world?.sky?.uniforms?.uCover, painted = g.world?.sky?.uniforms?.uStars;
    const clearSky = dt => { afterWas?.(dt); if (cover) cover.value = CLEAR_SKY; if (painted) painted.value = 0; };
    // back to the valley, however the round ends (a quit, or an error half-way)
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (onMove) canvas.removeEventListener('pointermove', onMove);
      if (onDown) removeEventListener('pointerdown', onDown);
      if (g.afterUpdate === clearSky) g.afterUpdate = afterWas;
      ring?.remove();
      compass?.remove();
      countEl?.remove();
      sky.shoot.visible = false;
      round?.dispose();
      sky.group.removeFromParent();
      p.root.visible = rootWas;
      if (tamo && tamoWas !== undefined) tamo.visible = tamoWas;
      g.follow.fovBase = fovWas;
      ctx.setNight(false);
      g.follow.clearCutscene(true);
      ctx.lock(false);
    };
    try {
    ctx.lock(true);
    await ctx.fade(true, 400);
    ctx.setNight(true, night.hour);
    g.afterUpdate = clearSky;
    round = buildRound(plan, night);
    const NAMES = round.names, dirs = round.dirs, idx = k => NAMES.indexOf(k);
    const at = NAMES.map(k => starAt(k, night));                                // { alt, az } of each named star
    sky.group.add(round.points);
    if (round.outline) sky.group.add(round.outline);
    if (round.movers) sky.group.add(round.movers);
    // (the picture is taken from high above her: the valley is a bowl, and its rim would hide the low sky all round)
    const eye = p.pos.clone().add(new V3(0, EYE_UP, 0));

    // ---- the view: it looks at (vAz, vAlt) and eases toward (tAz, tAlt); a step says which stars it wants in the picture
    const touch = !!ctx.ui.touch;
    const lay = { w: 0, h: 0, fov: 60, yTop: 0.27, yBot: 0.9, hintTop: 0, avoid: [[0, 0, 0, 0]], bottom: 0 };
    const layout = () => {
      const w = innerWidth, h = innerHeight;
      lay.w = w; lay.h = h;
      lay.fov = w / h < 0.8 ? 76 : h < 500 ? 66 : 60;                            // a phone held upright sees a narrow sky: look wider
      // the hint bubble sits under the HUD; on a phone under its two corner buttons, or beside them when it is wide enough
      lay.hintTop = touch ? (w > h && w >= 800 ? 66 : 112) : 0;
      lay.yTop = Math.min(0.5, ((lay.hintTop || 76) + 92) / h);
      lay.yBot = h < 500 ? 0.92 : touch ? 0.8 : 0.9;
      // the corner buttons: a horizon letter never stands in them
      const a = lay.avoid[0];
      a[0] = w - (touch ? 200 : 124); a[1] = h - (touch ? 150 : 72); a[2] = w; a[3] = h;
      lay.bottom = 6;
      ctx.hintTop(true, lay.hintTop);
    };
    layout();
    const view = { fov: lay.fov, aspect: 1 }, fit = { x: 0, y: 0, front: false }, aimPts = [];
    let aimNeed = NONE, aimMore = NONE, aimMode = 'prefer', aimDir = null, aimZoom = 1;
    let tAz = 0, tAlt = 40, vAz = 0, vAlt = 40, horizonSeen = false;
    /** Turn the view to some stars: `need` must be in the picture, `more` too if the screen is wide enough for them. */
    const reaim = () => {
      view.fov = lay.fov * aimZoom; view.aspect = lay.w / lay.h;
      g.follow.fovBase = view.fov;
      // a direction to watch (the satellites' side): it is put in the middle of the sky left free under the hint
      if (aimDir) { tAz = aimDir.az; tAlt = Math.min(80, aimDir.alt + 6 + Math.atan(lay.yTop * Math.tan(lay.fov * Math.PI / 360)) * 180 / Math.PI); horizonSeen = false; return; }
      const opts = { yTop: lay.yTop, yBot: lay.yBot, horizon: aimMode };
      const frame = ids => { aimPts.length = 0; for (const k of ids) aimPts.push(at[idx(k)]); return frameView(aimPts, view, opts); };
      const cut = v => { const vv = { az: v.az, alt: v.alt, fov: view.fov, aspect: view.aspect }; return aimPts.some(q => { projectSky(q.az, q.alt, vv, fit); return !fit.front || Math.abs(fit.x) > 0.86 || fit.y < -0.86; }); };
      let v = null;
      if (aimMore.length) { v = frame([...aimNeed, ...aimMore]); if (cut(v)) v = null; }
      if (!v) {
        // the stars that must be seen: a narrow screen looks wider until they all fit side by side (the pointers and the North Star)
        v = frame(aimNeed);
        while (cut(v) && view.fov < 100) { view.fov += 4; v = frame(aimNeed); }
        g.follow.fovBase = view.fov;
      }
      tAz = v.az; tAlt = v.alt; horizonSeen = v.horizon;
    };
    /** zoom: under 1 looks closer (a small figure: Orion's belt). */
    const aim = (need, more = NONE, mode = 'prefer', zoom = 1) => { aimNeed = need; aimMore = more; aimMode = mode; aimDir = null; aimZoom = zoom; reaim(); };
    const aimAt = dir => { aimDir = dir; aimZoom = 1; reaim(); };
    const F = new V3(), look = new V3(), Rt = new V3(), U = new V3(), wd = [0, 0, 0];
    const setView = () => {
      worldDir(vAlt, vAz, wd); F.set(wd[0], wd[1], wd[2]);
      Rt.crossVectors(F, U.set(0, 1, 0)).normalize(); U.crossVectors(Rt, F).normalize();
      look.copy(eye).addScaledVector(F, 10);
    };
    const firstFigure = plan.steps[0] === 'dipper' ? DIPPER : FIGURES[plan.steps[0]]?.chain || DIPPER;
    const firstMore = plan.guide >= 0.5 ? ONLY_POLARIS : NONE;
    aim(firstFigure, firstMore);
    vAz = tAz; vAlt = tAlt; setView();
    g.follow.cutscene({ pos: eye, look }, 0.001, { pos: eye.clone(), look: look.clone() });
    const shot = g.follow.shot;
    p.root.visible = false;
    if (tamo) tamo.visible = false;
    sky.group.position.copy(eye);                        // (the dome rides with the camera: the loop keeps it there)
    g.scene.add(sky.group);
    sky.lines.geometry.setDrawRange(0, 0);
    compass = createSkyCompass({ kind: 'trick' });
    compass.horizon(plan.horizon);
    const compassOpts = { bottom: lay.bottom, avoid: lay.avoid, alt: 0 };
    await ctx.wait(0.2);
    await ctx.fade(false, 700);

    // the ring Mika points with: stick / WASD moves it, the mouse hovers it, a tap or click puts it there and picks
    ring = document.createElement('div');
    ring.style.cssText = 'position:fixed;left:0;top:0;width:46px;height:46px;margin:-23px 0 0 -23px;border:3px solid rgba(255,226,140,.95);border-radius:50%;box-shadow:0 0 12px rgba(255,220,120,.6),inset 0 0 8px rgba(255,220,120,.4);pointer-events:none;z-index:14;transition:border-color .2s';
    document.body.appendChild(ring);
    let rx = innerWidth / 2, ry = innerHeight / 2, pick = false, shake = 0;
    onMove = e => { if (e.pointerType === 'mouse') { rx = e.clientX; ry = e.clientY; } };
    // anywhere on screen except the buttons (pause, journal, the count): the hint and HUD let clicks through
    onDown = e => { if (e.target.closest?.('button, a, input, select, .overlay')) return; rx = e.clientX; ry = e.clientY; pick = true; };
    canvas.addEventListener('pointermove', onMove);
    addEventListener('pointerdown', onDown);

    const tmp = new V3();
    const screenOf = (d, out) => { tmp.copy(d).multiplyScalar(R).add(sky.group.position).project(cam); out.x = (tmp.x * 0.5 + 0.5) * innerWidth; out.y = (-tmp.y * 0.5 + 0.5) * innerHeight; out.z = tmp.z; return out; };
    const scr = NAMES.map(() => ({ x: 0, y: 0, z: 0 }));
    const thr = touch ? 52 : 42;
    // the moving lights of Difficult (the satellite, the plane, the train): where they are now
    const pass = round.movers ? hardPasses(night, middleOf(LITTLE, night),
      Math.atan(Math.tan(lay.fov * Math.PI / 360) * lay.w / lay.h) * 180 / Math.PI) : null;
    const mv = { sat: { on: false, x: 0, y: 0, z: 0, alt: 0, az: 0, light: 0 }, plane: { on: false, x: 0, y: 0, z: 0, alt: 0, az: 0, light: 0 }, car: { on: false, x: 0, y: 0, z: 0, alt: 0, az: 0, light: 0 } };
    const mscr = { sat: { x: 0, y: 0, z: 2 }, plane: { x: 0, y: 0, z: 2 } };
    const mpos = round.movers?.geometry.attributes.position, msize = round.movers?.geometry.attributes.aSize, mcol = round.movers?.geometry.attributes.aColor;
    const rgb = [0, 0, 0];
    let satPass = null, satT0 = 0, satRuns = 0, planeT0 = 0, trainT0 = 0, trainN = 0, trainTries = 0, trainLagS = 0, spotOn = false, decoyTold = false, fadeWatch = false;
    const TRAIN_GAP = 3;                                                     // degrees between the lights of a train
    /** A moving light as a point of the dome (i: its slot), and where it is on screen (s, when it can be picked). */
    const putMover = (i, o, size, r, gr, b, s) => {
      const lit = o.on && o.light > 0.02;
      if (lit) { tmp.set(o.x, o.y, o.z); mpos.setXYZ(i, o.x * R * 0.985, o.y * R * 0.985, o.z * R * 0.985); if (s) screenOf(tmp, s); }
      else if (s) s.z = 2;
      msize.setX(i, lit ? size : 0);
      mcol.setXYZ(i, r * o.light, gr * o.light, b * o.light);
    };
    /**
     * What the ring is on: a named star's id, '@sat' or '@plane' (a moving light), or null. Of the stars within reach, one
     * that may be picked now wins over a nearer one that may not (the three stars of Orion's belt stand very close).
     */
    const nearest = () => {
      let best = null, bd = thr, want = null, wd2 = thr;
      const next = nextNow();
      for (let i = 0; i < NAMES.length; i++) {
        const s = scr[i];
        if (s.z > 1 || hiddenStar(i)) continue;
        const d = Math.hypot(s.x - rx, s.y - ry);
        if (d < bd) { bd = d; best = NAMES[i]; }
        if (d < wd2 && next.includes(NAMES[i])) { wd2 = d; want = NAMES[i]; }
      }
      if (want) { best = want; bd = wd2; }
      if (pass) {
        if (mv.sat.on && mv.sat.light > 0.25 && mscr.sat.z <= 1) { const d = Math.hypot(mscr.sat.x - rx, mscr.sat.y - ry); if (d < bd) { bd = d; best = '@sat'; } }
        if (mv.plane.on && mscr.plane.z <= 1) { const d = Math.hypot(mscr.plane.x - rx, mscr.plane.y - ry); if (d < bd) { bd = d; best = '@plane'; } }
      }
      return best;
    };
    const linePos = sky.lines.geometry.attributes.position;
    let lineN = 0;
    const guideAt = {};                                   // the line number of each pointer guide (overwritten by the real line)
    const segment = (a, b, n = lineN++) => {
      if (n >= LINES) return n;
      const da = dirs[idx(a)], db = typeof b === 'string' ? dirs[idx(b)] : b;
      linePos.setXYZ(n * 2, da.x * R * 0.99, da.y * R * 0.99, da.z * R * 0.99);
      linePos.setXYZ(n * 2 + 1, db.x * R * 0.99, db.y * R * 0.99, db.z * R * 0.99);
      linePos.needsUpdate = true;
      sky.lines.geometry.setDrawRange(0, Math.max(sky.lines.geometry.drawRange.count, n * 2 + 2));
      return n;
    };
    /** A pointer line from a star part of the way to the North Star (the level says how far; none on Difficult). */
    const guide = from => {
      if (plan.guide <= 0 || guideAt[from] !== undefined) return;
      const d = dirs[idx(from)], pz = dirs[idx('polaris')];
      guideAt[from] = segment(from, d.clone().lerp(pz, from === 'dubhe' ? plan.guide : plan.guide * 0.8).normalize());
    };
    const say = (text, vars, life) => ctx.hint(vars ? tx(text, vars) : text, life);
    /** The way the view is turning to, as a word ("north-east"): what the compass rose will say when it gets there. */
    const facing = () => compassName(tAz);
    const letterN = () => tx(COMPASS_LETTER[0]);


    const nextBuf = [], BRIGHT = fig ? [fig.bright] : NONE;
    /** A star of the season's figure that is not drawn yet (it shows once the figure is joined) cannot be pointed at. */
    const hiddenStar = i => late[i] && st.picked.season.length < fig.join.length;
    /** Is this star joined already? (Pointing at it again is no mistake.) */
    const joined = k => st.picked.dipper.includes(k) || st.picked.cass.includes(k) || st.picked.little.includes(k) || st.picked.season.includes(k);
    /** The stars that may be picked now (a shared list: read, never kept). */
    const nextNow = () => {
      const s = plan.steps[st.step];
      if (!s) return NONE;
      if (s === 'polaris') return ONLY_POLARIS;
      if (s === 'dipper') return nextStars(st.picked.dipper);
      if (FIGURES[s]) return nextInChain(FIGURES[s].chain, st.picked[s], nextBuf);
      if (s === 'season') return fig.order === 'chain' ? nextInChain(fig.join, st.picked.season, nextBuf) : nextInSet(fig.join, st.picked.season, nextBuf);
      return s === 'bright' ? BRIGHT : NONE;
    };
    const sizes = round.points.geometry.attributes.aSize, cols = round.points.geometry.attributes.aColor;
    const base = NAMES.map(k => starSize(STARS[k].mag)), tint = NAMES.map(k => COLOUR[STARS[k].col] || COLOUR.w);
    // the stars of the season's figure that only show once it is joined (Orion's shoulders and feet)
    const late = NAMES.map(k => !!fig && fig.show.includes(k));
    let shootT = -1, shootWait = 1.2, wishTries = 0, wrongHint = 0, elapsed = 0, played = 0, hold = 0, after = null, answer = 0, outlineFade = 0;
    const sA = new V3(), sB = new V3(), head = new V3(), tail = new V3();
    /** Wait a moment (the round's clock stands still, nothing can be picked: time to read and to watch the view turn), then go on. */
    const pause = (sec, fn) => { hold = sec; after = fn; };
    // one record for the score: the loop below builds nothing new each frame
    const tally = { joined: 0, polaris: false, tasks: 0, wish: false, mistakes: 0, seconds: 0, par: plan.par, done: false };
    const scoreNow = () => { tally.joined = st.joined; tally.polaris = st.polaris; tally.tasks = st.tasks; tally.wish = st.wish; tally.mistakes = st.mistakes; tally.seconds = st.tDone; tally.done = st.done; return starScore(tally); };
    const wrong = text => { st.mistakes++; wrongHint++; shake = 0.3; audio.bad(); if (text) ctx.hint(text, 3.5); };
    /** A streak across the picture she has now (the wish, and the "gone in a second" light of the satellite step). */
    const launchStreak = () => {
      const tv = Math.tan(cam.fov * Math.PI / 360), th = tv * cam.aspect;
      sA.copy(F).addScaledVector(Rt, (-0.7 + Math.random() * 0.4) * th).addScaledVector(U, (0.1 + Math.random() * 0.35) * tv).normalize();
      sB.copy(F).addScaledVector(Rt, (0.15 + Math.random() * 0.5) * th).addScaledVector(U, (-0.45 + Math.random() * 0.25) * tv).normalize();
      shootT = 0;
      sky.shoot.visible = true;
      audio.twinkle(1.5);
    };
    const moveStreak = dt => {
      shootT += dt;
      const k = Math.min(1, shootT / 1.15);
      head.copy(sA).lerp(sB, k).normalize().multiplyScalar(R * 0.98);
      tail.copy(sA).lerp(sB, Math.max(0, k - 0.22)).normalize().multiplyScalar(R * 0.98);
      const sp2 = sky.shoot.geometry.attributes.position;
      sp2.setXYZ(0, head.x, head.y, head.z); sp2.setXYZ(1, tail.x, tail.y, tail.z); sp2.needsUpdate = true;
    };
    /** The three answers for the train's count: buttons at the bottom (a tap or a click; the ring and the action key work too). */
    const showCount = () => {
      countEl?.remove();
      countEl = document.createElement('div');
      countEl.className = 'stg-count';
      const tall = touch && innerHeight > innerWidth;
      countEl.style.cssText = `position:fixed;left:50%;bottom:calc(${tall ? 184 : 26}px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:15;display:flex;gap:12px;padding:8px;border-radius:999px;background:rgba(14,20,48,.78);box-shadow:0 4px 14px rgba(0,0,0,.35);zoom:var(--ui-scale,1)`;
      for (const n of trainChoices(trainN, Math.random())) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'stg-n'; b.dataset.n = n; b.textContent = n;
        b.style.cssText = 'min-width:56px;min-height:48px;border:0;border-radius:999px;background:rgba(255,253,246,.95);color:#4a3020;font:600 22px Fredoka,Nunito,sans-serif;cursor:pointer';
        b.addEventListener('click', () => { answer = n; });
        countEl.appendChild(b);
      }
      document.body.appendChild(countEl);
    };
    const hideCount = () => { countEl?.remove(); countEl = null; };

    /** Begin a step: turn the view, say what to look for. */
    const enter = now => {
      st.phase = now; st.tStep = elapsed; wrongHint = 0;
      if (now === 'cass') { aim(CASS, ['polaris', 'dubhe', 'merak']); say(HINT.cass, { dir: facing() }, 7); }
      else if (now === 'polaris') {
        const both = plan.steps.includes('cass');
        aim(['dubhe', 'merak', 'polaris'], both ? [...CASS, ...DIPPER] : DIPPER);
        guide('dubhe');
        if (both) guide('navi');
        ctx.hint(both ? plan.guide > 0 ? HINT.polarisBoth : HINT.polarisAlone : plan.guide > 0 ? HINT.polarisGuided : HINT.polarisAlone, 7);
      } else if (now === 'little') { aim(LITTLE, ['dubhe', 'merak']); ctx.hint(HINT.little, 7); satPass = pass.decoy; satT0 = elapsed + 4; satRuns = 0; }
      else if (now === 'season') { aim([...fig.join, ...fig.show], NONE, 'prefer', fig.zoom || 1); say(FIGURE_WORDS[fig.id].find, { dir: facing() }, 8); }
      else if (now === 'bright') ctx.hint(HINT.bright, 7);
      else if (now === 'satellite') {
        // the lights begin once the first words are read
        aimAt(pass.look); satPass = null; mv.sat.on = false;
        say(HINT.kinds, { dir: facing() }, 6);
        pause(5.5, () => { ctx.hint(HINT.spot, 14); spotOn = true; satPass = pass.sat; satT0 = elapsed + 0.5; satRuns = 0; planeT0 = elapsed + 2.5; shootWait = 3; });
      } else if (now === 'train') {
        spotOn = false; fadeWatch = false; trainN = 5 + Math.floor(Math.random() * (TRAIN_MAX - 4)); trainTries = 0; trainT0 = elapsed + 0.5; trainLagS = trainLag(pass.train, TRAIN_GAP);
        ctx.hint(HINT.train, 9);
        showCount();
      }
    };
    /** A step is finished: go to the next one (or the wish, when it was the last). */
    const nextStep = () => {
      st.step++;
      const now = plan.steps[st.step];
      if (!now) { st.done = true; st.tDone = played; st.phase = 'wish'; shootT = -1; sky.shoot.visible = false; shootWait = 1.5; audio.star(); return; }
      audio.good();
      enter(now);
    };

    // the first words. The guided first try begins with the Milky Way, then the compass: the view turns north to show the
    // N on the horizon, and back to the Big Dipper, so the letters are seen to slide (the clock waits meanwhile)
    const find = () => { aim(firstFigure, firstMore); say(plan.outline.includes('dipper') ? HINT.dipper : HINT.dipperHard, { dir: facing() }, 7); };
    if (ctx.first) { ctx.hint(HINT.milky, 5.5); pause(5.2, () => { aim(ONLY_POLARIS, NONE, 'force'); say(HINT.compass, { n: letterN() }, 6); pause(5.6, find); }); }
    else find();

    ctx.debug.named = () => NAMES.map((k, i) => ({ k, x: scr[i].x, y: scr[i].y, on: scr[i].z <= 1, alt: +at[i].alt.toFixed(1), az: +at[i].az.toFixed(1) }));
    ctx.debug.phase = () => st.phase;
    ctx.debug.next = () => [...nextNow()];
    ctx.debug.plan = plan;
    ctx.debug.state = st;
    ctx.debug.sky = night;
    ctx.debug.shooting = () => st.phase === 'wish' && shootT >= 0 && shootT < 1.2;
    ctx.debug.hold = () => hold;
    ctx.debug.compass = () => compass.state();
    ctx.debug.view = () => ({ az: +vAz.toFixed(1), alt: +vAlt.toFixed(1), horizon: horizonSeen, fov: cam.fov });
    ctx.debug.movers = () => ({ sat: mv.sat.on && mv.sat.light > 0.25 ? { x: mscr.sat.x, y: mscr.sat.y, light: +mv.sat.light.toFixed(2) } : null, plane: mv.plane.on ? { x: mscr.plane.x, y: mscr.plane.y } : null,
      train: st.phase === 'train' ? { n: trainN, choices: [...(countEl?.querySelectorAll('button') || [])].map(b => +b.dataset.n) } : null });

    let ringX = NaN, ringY = NaN, ringLit = null;
    const res = await ctx.loop(dt => {
      elapsed += dt;
      if (hold > 0) { hold -= dt; if (hold <= 0 && after) { const fn = after; after = null; fn(); } }
      else if (st.phase !== 'wish') { left -= dt; played += dt; }
      // the view: a new screen shape (a phone turned) is framed again; then it eases to where the step looks
      if (innerWidth !== lay.w || innerHeight !== lay.h) { layout(); reaim(); }
      const kv = 1 - Math.exp(-dt * 2.6);
      vAz = (vAz + azDiff(tAz, vAz) * kv + 360) % 360; vAlt += (tAlt - vAlt) * kv;
      setView();
      if (g.follow.shot === shot) shot.to.look.copy(look);
      sky.group.position.copy(cam.position);
      const scale = (g.renderer.renderer.domElement.height || innerHeight) * 0.5 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) / R;
      sky.field.material.uniforms.uScale.value = scale * R * 0.9;
      round.points.material.uniforms.uScale.value = scale * R * 0.9;
      sky.field.material.uniforms.uTime.value = ctx.t;
      round.points.material.uniforms.uTime.value = ctx.t;
      compass.update(cam, compassOpts);
      // the faint outline goes once its figure is joined (Normal: the later figures have none)
      if (round.outline && outlineFade > 0) { outlineFade = Math.max(0, outlineFade - dt); round.outline.material.opacity = 0.3 * outlineFade; if (!outlineFade) round.outline.visible = false; }
      // the ring: stick and keys move it
      const move = g.input.move, sp = Math.min(innerWidth, innerHeight) * 0.75;
      rx = THREE.MathUtils.clamp(rx + move.x * sp * dt, 10, innerWidth - 10);
      ry = THREE.MathUtils.clamp(ry - move.y * sp * dt, 10, innerHeight - 10);
      shake = Math.max(0, shake - dt);
      const sx = shake > 0 ? Math.sin(shake * 60) * 8 : 0;
      const px = Math.round(rx + sx), py = Math.round(ry);
      if (px !== ringX || py !== ringY) { ringX = px; ringY = py; ring.style.transform = `translate(${px}px, ${py}px)`; }
      for (let i = 0; i < NAMES.length; i++) screenOf(dirs[i], scr[i]);
      // the named stars: as bright as they really are, the picked ones golden, the next one pulsing in the guided try (and
      // after a few wrong picks, except on Difficult: nothing points the way there)
      const next = nextNow(), step = plan.steps[st.step];
      const mayHint = ctx.first || (plan.nudge > 0 && wrongHint >= plan.nudge);
      const figDone = !!fig && st.picked.season.length >= fig.join.length;
      for (let i = 0; i < NAMES.length; i++) {
        const k = NAMES[i];
        // (while the brightest star is asked for, the figure's stars show their own light again, not the gold of a joined star)
        const on = (k === 'polaris' && st.polaris) || st.picked.dipper.includes(k) || st.picked.cass.includes(k) || (k !== 'polaris' && st.picked.little.includes(k))
          || (step !== 'bright' && (st.picked.season.includes(k) || (figDone && st.tasks > 0 && k === fig.bright)));
        const hintMe = mayHint && next.includes(k) && !(k === 'polaris' && !ctx.first && elapsed - st.tStep < 10);
        const pulse = hintMe ? 0.5 + 0.5 * Math.sin(ctx.t * 6) : 0;
        sizes.setX(i, late[i] && !figDone ? 0 : base[i] * (on ? 1.25 : 1) * (1 + pulse * 0.6));
        const c = tint[i];
        if (on) cols.setXYZ(i, 1.4, 1.15, 0.55); else cols.setXYZ(i, c[0] * 1.08 + pulse * 0.4, c[1] * 1.08 + pulse * 0.3, c[2] * 1.1);
      }
      sizes.needsUpdate = true; cols.needsUpdate = true;

      // the moving lights of Difficult
      if (pass) {
        round.movers.material.uniforms.uScale.value = scale * R * 0.9;
        // the satellite: through the Little Dipper while it is joined, then on its own pass (it fades in the Earth's shadow)
        if (satPass) {
          satAt(satPass, elapsed - satT0, pass.sun, mv.sat);
          if (elapsed - satT0 > satPass.dur) {
            // a pass is over: the next one after a breath (the lone satellite twice at most, then the round goes on)
            satRuns++; satT0 = elapsed + (satPass === pass.decoy ? 5 : 2.5);
            if (satPass === pass.sat && !spotOn) satPass = null;                // it was found: it does not come round again
            else if (step === 'satellite' && satRuns >= 2) { spotOn = false; satPass = null; ctx.hint(HINT.spotGone, 4); pause(3.5, nextStep); }
          }
          if (satPass === pass.decoy && !decoyTold && mv.sat.on && mv.sat.light > 0.6 && step === 'little') { decoyTold = true; ctx.hint(HINT.decoy, 5); }
        } else mv.sat.on = false;
        if (fadeWatch && hold > 0 && (!mv.sat.on || mv.sat.light < 0.03)) { fadeWatch = false; hold = Math.min(hold, 1.6); }
        putMover(0, mv.sat, 0.021, 1.15, 1.08, 0.92, mscr.sat);
        // the plane: only while the three lights are told apart
        if (spotOn) {
          satAt(pass.plane, elapsed - planeT0, null, mv.plane);
          if (elapsed - planeT0 > pass.plane.dur) planeT0 = elapsed + 3;
        } else mv.plane.on = false;
        planeBlink(elapsed, rgb);
        putMover(1, mv.plane, 0.022, rgb[0], rgb[1], rgb[2], mscr.plane);
        // the train: one pass, its lights one behind the other
        for (let i = 0; i < TRAIN_MAX; i++) {
          if (step === 'train' && i < trainN) satAt(pass.train, elapsed - trainT0, pass.sun, mv.car, i * trainLagS); else mv.car.on = false;
          putMover(2 + i, mv.car, 0.018, 1.12, 1.06, 0.95, null);
        }
        if (step === 'train' && elapsed - trainT0 > pass.train.dur + trainN * trainLagS) trainT0 = elapsed + 2;
        mpos.needsUpdate = true; msize.needsUpdate = true; mcol.needsUpdate = true;
      }
      const lit = !!nearest();
      if (lit !== ringLit) { ringLit = lit; ring.style.borderColor = lit ? 'rgba(255,240,170,1)' : 'rgba(255,226,140,.6)'; }

      const press = pick || ctx.pressed() || g.input.pressed('jump');
      pick = false;
      if (step && hold > 0) {
        // reading time: nothing is picked (a streak already falling finishes its fall)
        answer = 0;
        if (shootT >= 0) { moveStreak(dt); if (shootT > 1.5) { shootT = -1; sky.shoot.visible = false; } }
      }
      else if (step === 'train') {
        // the count: a button (tapped, clicked, or under the ring when the action key is pressed)
        if (press && !answer) { const b = document.elementFromPoint(rx, ry)?.closest?.('.stg-n'); if (b) answer = +b.dataset.n; }
        if (answer) {
          const ok = answer === trainN;
          answer = 0;
          if (ok) { st.tasks++; audio.twinkle(2); audio.star(); hideCount(); say(HINT.trainYes, { n: trainN }, 5); pause(4.5, nextStep); }
          else if (++trainTries >= 2) { wrong(null); hideCount(); say(HINT.trainNo, { n: trainN }, 4.5); pause(4, nextStep); }
          else wrong(HINT.trainAgain);
        }
      } else if (step === 'satellite') {
        // a shooting star now and then: the light that is gone in a second
        if (shootT < 0) { if (spotOn && (shootWait -= dt) <= 0) launchStreak(); }
        else { moveStreak(dt); if (shootT > 1.5) { shootT = -1; sky.shoot.visible = false; shootWait = 4 + Math.random() * 2; } }
        if (press && spotOn) {
          const k = nearest();
          // found: now it is watched until it fades in the Earth's shadow (ten seconds at most)
          if (k === '@sat') { st.tasks++; spotOn = false; fadeWatch = true; audio.twinkle(2); audio.star(); ctx.hint(HINT.spotYes, 8); pause(10, nextStep); }
          else if (k === '@plane') wrong(HINT.spotPlane);
          else audio.blip(0.7);
        }
      } else if (step) {
        if (press) {
          const k = nearest();
          if (k && next.includes(k)) {
            audio.twinkle(2); audio.blip(1 + (st.joined % 7) * 0.12);
            fx.twinkle?.(tmp.copy(dirs[idx(k)]).multiplyScalar(30).add(cam.position).clone());
            wrongHint = 0;
            if (step === 'polaris') {
              st.polaris = true;
              // the pointer line is drawn all the way now; from the W too when it helped
              if (guideAt.dubhe !== undefined) segment('dubhe', 'polaris', guideAt.dubhe); else segment('dubhe', 'polaris');
              if (guideAt.navi !== undefined) segment('navi', 'polaris', guideAt.navi);
              audio.star();
              // the compass agrees: the view drops until the N on the horizon stands under the star
              if (plan.horizon === 'on') { aim(ONLY_POLARIS, NONE, 'force'); say(HINT.north, { n: letterN() }, 6); }
              else { aim(ONLY_POLARIS); ctx.hint(HINT.northRose, 5); }
              pause(4.5, nextStep);
            } else if (step === 'bright') {
              st.tasks++;
              audio.star();
              say(FIGURE_WORDS[fig.id].bright, { star: starName(fig.bright, profile, tx) || '' }, 5.5);
              pause(4, nextStep);
            } else if (step === 'season') {
              const list = st.picked.season;
              if (list.length) segment(list[list.length - 1], k);
              list.push(k);
              st.joined++;
              if (list.length === fig.join.length) {
                // the whole figure shows: the triangle closes, the hunter gets his shoulders and feet
                for (const [a, b] of fig.lines) segment(a, b);
                ctx.hint(FIGURE_WORDS[fig.id].done, 5);
                pause(3.5, nextStep);
              }
            } else {
              const list = st.picked[step], chain = FIGURES[step].chain;
              if (list.length) segment(list[list.length - 1], k);
              list.push(k);
              st.joined++;
              if (ctx.first && list.length < chain.length && LABEL[k]) ctx.hint(LABEL[k], 2.5);
              if (list.length === chain.length) {
                if (step === 'little') segment('kochab', 'zetumi');           // the little bowl closes
                if (step === 'dipper') { segment('megrez', 'dubhe'); if (round.outline) outlineFade = 1; }   // and the ladle's
                if (DONE[step]) { ctx.hint(DONE[step], 5); pause(3.5, nextStep); }
                else nextStep();
              }
            }
          } else if (k === '@sat') wrong(HINT.decoyPick);
          else if (k && k[0] !== '@' && joined(k) && step !== 'bright') audio.blip(0.7);
          else if (k && k[0] !== '@') {
            wrong(null);
            if (wrongHint === 1 || wrongHint === 3) ctx.hint(step === 'polaris' ? HINT.wrongNorth : step === 'bright' ? HINT.brightWrong
              : step === 'season' ? WRONG.season : st.picked[step].length > FIGURES[step].from ? WRONG[step] : step === 'dipper' ? HINT.wrongStart : step === 'cass' ? HINT.wrongW : WRONG[step], 3.5);
          } else audio.blip(0.7);
        }
      } else if (st.phase === 'wish') {
        // a shooting star crosses the sky; press while it streaks to make a wish (three chances)
        if (shootT < 0) {
          shootWait -= dt;
          if (shootWait <= 0) {
            wishTries++;
            if (wishTries === 1) ctx.hint(N_('Look! A shooting star! Quick, press to make a wish!'), 3);
            launchStreak();
          }
        } else {
          moveStreak(dt);
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
      // the Difficult level's card says a little more about the satellites it showed
      fact: plan.steps.includes('train') && !res.quit ? { title: tx(SAT_FACT.title), text: tx(SAT_FACT.text) } : undefined,
      detail: { joined: st.joined, of: plan.stars, polaris: st.polaris, tasks: st.tasks, wish: st.wish, mistakes: st.mistakes, seconds: Math.round(st.tDone) } };
    } finally {
      // an error above left the screen as it was (perhaps black): put the valley back and show it
      if (!cleaned) { cleanup(); ctx.fade(false, 300); }
    }
  },
};
