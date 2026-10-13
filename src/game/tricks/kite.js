// Make & fly a kite (docs/RURAL-TRICKS.md trick 9): autumn and winter, on the cow meadow south of Kawabe.
// Build it in three timing presses (bamboo cross, paper, tail), then fly it: the wind swings and gusts, the grass
// streaks and the clouds show where it is going a moment before the kite feels it, and Mika steers the kite back into
// the wind window so it climbs. Points for every second aloft, more the higher it flies. Rules: ./rules-kite.js.
// The level (ctx.level, rules-kite.js flightPlan) decides the sky: Easy a steady wind and rings up high; Normal gusts and
// rings at set heights (slide out of the wind to sink to one); Difficult a wind that turns, rings out to the sides and a
// tree at the right edge of the field that catches a low kite.
//
// Drawing: the kite (model `kite-paper`, or a procedural diamond), one line for the string, one ribbon mesh for the
// tail, one LineSegments for the wind streaks and three cloud sprites; one pooled ring (two thin hoops) for the ring in the
// sky and, on Difficult, one tree from the model library. Everything is written in place each frame.
import * as THREE from 'three';
import { N_, tx } from '../../i18n/i18n.js';
import { FX } from '../../engine/effects.js';
import { addCss, fit } from './util.js';
import { enterFocus } from '../../engine/focus.js';
import { KITE, KITE_STYLES, KITE_STYLE, kiteOpen, fluteVoice, sweepAt, buildQuality, buildGrade, buildResult, makeWind, windPush, newFlight, stepFlight, kiteScore, flightPlan, kiteBot } from './rules-kite.js';
import { KITE_ART, buildKite, kiteThumb } from './kite-art.js';
import { openPick } from './pick.js';
import { LEVELS, levelStars } from '../../content/levels.js';

const V3 = THREE.Vector3;
const WIND_HEADING = 0.3;        // the wind blows toward (sin, cos) of this: south over the meadow, the viaduct behind the kite
const STAND = 7;                 // Mika flies it this far downwind of the sign (the sign stays behind the camera)
const KITE_SIZE = 1.15;          // metres tall
const BUILD_SCALE = 1.25;        // a little larger than life while it is built, so the parts read
const PICK_SCALE = 0.86;         // smaller while it is chosen: the whole kite shows under the chooser
const FLY_SCALE = 2.4, FLY_GROW = 1.8;   // drawn larger in the sky so it reads at 40 m: scale at the grass, and more at the top
const STRING_N = 14, TAIL_N = 11, TAIL_SEG = 0.34, STREAKS = 30, CLOUDS = 3;
const STEPS = [
  { label: N_('Tie the bamboo cross'), part: 'frame', speed: 0.8 },
  { label: N_('Glue on the paper'), part: 'paper', speed: 1.0 },
  { label: N_('Tie on the tail'), part: 'tail', speed: 1.25 },
];
// the same three presses for every kite; only what is tied on differs
const STEP_LABELS = {
  kaku: [N_('Tie the bamboo lattice'), N_('Glue on the painted paper'), N_('Tie on the two long tails')],
  sao: [N_('Bend the bamboo into a bow'), N_('Glue on the paper'), N_('Tie on the three flutes')],
  bird: [N_('Tie the spine and the wing sticks'), N_('Glue on the paper wings'), N_('Tie on the bridle')],
  box: [N_('Tie the four long sticks'), N_('Wrap on the two paper bands'), N_('Tie on the bridle')],
};
// what the teacher says about the kite once it is up
const STYLE_HINT = {
  kaku: N_('The kaku-dako is steady but slow to climb. Be patient, and tug the line.'),
  sao: N_('The diều sáo climbs fast. Up high its flutes hum. But watch the gusts!'),
  bird: N_('The hawk kite turns quickly. Steer it with small, gentle moves.'),
  box: N_('The box kite climbs only in the dark green, the very middle of the wind.'),
};
let lastStyle = 'diamond';        // the kite chosen last, for this visit to the valley (the saved record keeps scores only)
const GRADE = [N_('A bit wobbly, but it will fly.'), N_('Good and tight!'), N_('Perfect!')];

const CSS = `
#kiteUi{position:fixed;left:50%;top:calc(70px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:15;width:min(300px,78vw);
 padding:8px 12px 10px;border-radius:16px;background:rgba(255,247,232,.92);box-shadow:0 5px 16px rgba(40,20,0,.22);font:700 14px Nunito,system-ui,sans-serif;
 color:#5a3a22;text-align:center;zoom:var(--ui-scale,1);touch-action:manipulation;user-select:none;-webkit-user-select:none}
#kiteUi .lab{margin-bottom:6px;line-height:1.2}
#kiteUi .zone u{position:absolute;top:0;bottom:0;border-radius:9px;background:#4fae40;display:none}
#kiteUi .zone.out u{background:#e08a5a}
#kiteUi .bar{position:relative;height:18px;border-radius:9px;background:#ead9b8;overflow:hidden}
#kiteUi .zone{position:absolute;top:0;bottom:0;background:#8fd07a;border-radius:9px}
#kiteUi .zone.out{background:#f0b08a}
#kiteUi .mark{position:absolute;top:-2px;left:0;width:14px;height:22px;margin-left:-7px;border-radius:6px;background:#e2572b;box-shadow:0 0 0 2px #fff8}
#kiteUi .mark.kite{width:18px;height:18px;margin-left:-9px;top:0;border-radius:3px;transform-origin:center}
#kiteUi .gust{position:absolute;top:0;bottom:0;width:34px;font:700 16px/18px Nunito,sans-serif;color:#2a6fb0;opacity:0;transition:opacity .15s}
#kiteUi .gust.l{left:2px;text-align:left}#kiteUi .gust.r{right:2px;text-align:right}
#kiteUi .gust.on{opacity:1;animation:kiteGust .35s infinite alternate}
#kiteUi .alt{margin-top:6px;height:6px;border-radius:3px;background:#ead9b8;overflow:hidden}
#kiteUi .alt i{display:block;height:100%;width:0;background:#f2a51a;border-radius:3px}
#kiteUi .alt{position:relative}
#kiteUi .alt b{position:absolute;top:-1px;bottom:-1px;width:4px;margin-left:-2px;border-radius:2px;background:#c2541c;display:none}
#kiteUi .rg{position:absolute;top:1px;left:0;width:12px;height:12px;margin-left:-8px;border-radius:50%;border:2px solid #f2a51a;background:#fff8;display:none}
#kiteUi .tz{position:absolute;top:0;bottom:0;right:0;width:0;background:repeating-linear-gradient(135deg,#3f8f4a 0 4px,#57a85f 4px 8px);border-radius:0 9px 9px 0}
@media (max-width:520px){#kiteUi{left:calc(14px + env(safe-area-inset-left,0px));transform:none;width:min(236px,60vw)}}
@keyframes kiteGust{from{transform:translateX(0)}to{transform:translateX(4px)}}
`;

// --------------------------------------------------------------------------------------------- the kite
/** A plain diamond kite when the model is missing: a bamboo cross, a two-colour paper sail and a short tail. */
function proceduralKite() {
  const g = new THREE.Group();
  const bamboo = new THREE.MeshStandardMaterial({ color: '#b08a4a', roughness: 0.8 });
  const frame = new THREE.Group(); frame.name = 'Frame';
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.025, 1.0, 0.025), bamboo);
  const spar = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.025, 0.025), bamboo);
  spar.position.y = 0.16;
  frame.add(spine, spar);
  // the sail: four triangles round the crossing, red and warm yellow
  const pts = [[0, 0.5], [0.39, 0.16], [0, -0.5], [-0.39, 0.16]], pos = [], col = [];
  const cA = [0.91, 0.25, 0.16], cB = [1, 0.8, 0.25];
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[(i + 1) % 4], c = i % 2 ? cA : cB;
    pos.push(0, 0.16, 0.014, a[0], a[1], 0.014, b[0], b[1], 0.014);
    col.push(...c, ...c, ...c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const paper = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85, emissive: '#3a1a08', emissiveIntensity: 0.35 }));
  paper.name = 'Paper';
  const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.5), new THREE.MeshStandardMaterial({ color: '#f2efe2', side: THREE.DoubleSide, roughness: 0.9 }));
  tail.name = 'Tail';
  tail.position.set(0, -0.74, 0);
  g.add(frame, paper, tail);
  g.userData.own = [bamboo, spine.geometry, spar.geometry, geo, paper.material, tail.geometry, tail.material];   // made here: freed with the round
  return g;
}

/**
 * The kite ready to use: a holder whose +Y is the kite's top and +Z its face, KITE_SIZE tall, centred, with its
 * parts found by name (frame / paper / tail) so the build can show them one by one. Works for any model layout:
 * the thinnest axis of the sail is taken as its face.
 */
function makeKite(assets, style = 'diamond') {
  const art = KITE_ART[style] || KITE_ART.diamond, drawn = style !== 'diamond' && !!KITE_ART[style];
  const model = drawn ? null : assets.clone('kite-paper');
  const inner = drawn ? buildKite(style) : model || proceduralKite();
  const find = re => { const out = []; inner.traverse(o => { if ((re.test(o.name) || o.isMesh && re.test(o.material?.name || '')) && !out.some(p => { let q = o.parent; while (q) { if (q === p) return true; q = q.parent; } return false; })) out.push(o); }); return out; };
  const parts = { frame: find(/frame|stick|bamboo|cross|spar|spine/i), tail: find(/tail|ribbon|bow/i), paper: [] };
  parts.paper = find(/paper|sail|skin|face/i).filter(o => !parts.frame.includes(o) && !parts.tail.includes(o));
  // measure without the tail (it hangs below and would shift the centre)
  for (const o of parts.tail) o.visible = false;
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3();
  inner.traverseVisible(o => { if (o.isMesh) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
  for (const o of parts.tail) o.visible = true;
  const size = box.getSize(new V3()), centre = box.getCenter(new V3());
  const fit = new THREE.Group();
  inner.position.sub(centre);
  fit.add(inner);
  if (model) {
    // thinnest axis -> +Z (the face), then the longest of the other two -> +Y (the spine)
    if (size.x <= size.y && size.x <= size.z) fit.rotation.y = -Math.PI / 2;
    else if (size.y <= size.z) fit.rotation.x = Math.PI / 2;
  }
  const tall = Math.max(size.x, size.y, size.z) || 1;
  fit.scale.setScalar(KITE_SIZE * art.size / tall);
  const holder = new THREE.Group();
  holder.name = 'trick-kite';
  holder.add(fit);
  holder.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; } });
  const named = parts.frame.length && parts.paper.length;
  // where the flying ribbon is tied on: the lower end of the model's own tail (it stays on the kite in the air), or
  // the kite's bottom tip. Metres below the holder's middle, at scale 1.
  let tailEnd = KITE_SIZE * 0.478;
  if (model && parts.tail.length) {
    const tb = new THREE.Box3();
    for (const o of parts.tail) o.traverse(c => { if (c.isMesh) { c.geometry.computeBoundingBox(); tb.union(c.geometry.boundingBox.clone().applyMatrix4(c.matrixWorld)); } });
    // the spine is the longest side of the sail: the tail hangs along it
    const ax = size.y >= size.x && size.y >= size.z ? 'y' : size.x >= size.z ? 'x' : 'z';
    const far = Math.max(Math.abs(tb.min[ax] - centre[ax]), Math.abs(tb.max[ax] - centre[ax]));
    if (Number.isFinite(far) && far > 0) tailEnd = far * KITE_SIZE / tall;
  }
  // the long ribbons of the flight: [x, y] from the kite's middle (metres at scale 1) and how long each is
  const U = KITE_SIZE * art.size;
  const tails = drawn ? art.tails.map(([x, y, len]) => [x * U, y * U, len]) : [[0, -tailEnd, 1]];
  return { holder, parts, named, fromModel: !!model, tailEnd, tails, style: drawn ? style : 'diamond', own: inner.userData.own || [] };
}

function cloudTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const x = c.getContext('2d');
  for (const [cx, cy, r] of [[40, 38, 24], [64, 30, 28], [90, 38, 22], [64, 42, 26]]) {
    const gr = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 128, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// The three line drawings of the flight, as small functions over plain number arrays: the optimiser compiles these
// quickly, where the same loops inside the round's long frame function ran interpreted and made a new number object
// for every intermediate result (about 1 MB a second).
/** The string: a sagging curve from the hand (h) to the kite (k), STRING_N points into `out`. */
function drawString(out, hx, hy, hz, kx, ky, kz, sag) {
  for (let i = 0; i < STRING_N; i++) {
    const k = i / (STRING_N - 1), j = i * 3;
    out[j] = hx + (kx - hx) * k; out[j + 1] = hy + (ky - hy) * k - sag * 4 * k * (1 - k); out[j + 2] = hz + (kz - hz) * k;
  }
}

/** The tail: each knot follows the one before (nodes[0..2] is tied to the kite), blown by (bx, by, bz) and kept off the grass; then the ribbon's two edges into `out`. */
function stepTail(nodes, out, world, bx, by, bz, t, sc, rx, rz, long = 1) {
  for (let i = 1; i < TAIL_N; i++) {
    const j = i * 3;
    nodes[j] += bx + Math.sin(t * 6 + i) * 0.012; nodes[j + 1] += by; nodes[j + 2] += bz;
    const dx = nodes[j] - nodes[j - 3], dy = nodes[j + 1] - nodes[j - 2], dz = nodes[j + 2] - nodes[j - 1];
    const len = Math.hypot(dx, dy, dz) || 1, s = TAIL_SEG * long * sc * 0.5 / len;
    nodes[j] = nodes[j - 3] + dx * s; nodes[j + 1] = nodes[j - 2] + dy * s; nodes[j + 2] = nodes[j - 1] + dz * s;
    const gy = world.heightAt(nodes[j], nodes[j + 2]) + 0.08;
    if (nodes[j + 1] < gy) nodes[j + 1] = gy;
  }
  const wdt = 0.08 * sc;
  for (let i = 0; i < TAIL_N; i++) {
    const j = i * 3, k = i * 6, tw = wdt * (1 - i / TAIL_N * 0.5);
    out[k] = nodes[j] - rx * tw; out[k + 1] = nodes[j + 1]; out[k + 2] = nodes[j + 2] - rz * tw;
    out[k + 3] = nodes[j] + rx * tw; out[k + 4] = nodes[j + 1]; out[k + 5] = nodes[j + 2] + rz * tw;
  }
}

/** The wind streaks (sk: along, across, height, speed factor each) drift downwind, slanting with the wind to come. */
function stepStreaks(sk, out, ox, ground, oz, dx, dz, rx, rz, slant, dt) {
  for (let i = 0; i < STREAKS; i++) {
    const j = i * 4, k = i * 6, sp = 10 * sk[j + 3];
    sk[j] += sp * dt; sk[j + 1] += slant * sp * dt;
    if (sk[j] > 34) { sk[j] = -10; sk[j + 1] = (Math.random() - 0.5) * 34; }
    if (sk[j + 1] > 18) sk[j + 1] -= 36; else if (sk[j + 1] < -18) sk[j + 1] += 36;
    const x0 = ox + dx * sk[j] + rx * sk[j + 1], z0 = oz + dz * sk[j] + rz * sk[j + 1];
    const y0 = ground + sk[j + 2], ln = 1.2 + sk[j + 3];
    out[k] = x0; out[k + 1] = y0; out[k + 2] = z0;
    out[k + 3] = x0 - (dx + rx * slant) * ln; out[k + 4] = y0 + 0.05; out[k + 5] = z0 - (dz + rz * slant) * ln;
  }
}

export default {
  id: 'kite',

  async play(ctx) {
    const { game: g, player: p, audio, fx } = ctx;
    const world = g.world, scene = g.scene, input = g.input;
    await ctx.ensureModels(['kite-paper']);
    if (ctx.quit) return { score: 0, quit: true };

    addCss('kiteCss', CSS);

    // ---- the frame of the scene: downwind d, right r (as the camera sees it), Mika's spot
    const d = new V3(Math.sin(WIND_HEADING), 0, Math.cos(WIND_HEADING));
    const r = new V3(-d.z, 0, d.x);
    const sx = ctx.place.x + d.x * STAND, sz = ctx.place.z + d.z * STAND;
    const ground = world.heightAt(sx, sz);
    const was = { wind: FX.uWind.value };          // (her lantern is on her belt for the round: tricks.js asks)
    const added = [];              // everything put in the scene, removed in cleanup
    const disposables = [];
    let ui = null, onPress = null, tap = false, cleaned = false, sign = null, pick = null, kite = null, K = null;
    /** Take the kite out of the picture and free what it made (the chooser swaps kites; the round ends with this). */
    const dropKite = () => {
      if (!kite) return;
      still?.drop(K);              // (the chooser swaps kites while the valley is a still picture)
      K.removeFromParent();
      for (const x of kite.own) x.dispose();
      kite = K = null;
    };
    let still = null;              // focus mode for the build (engine/focus.js)

    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      pick?.close();
      dropKite();
      still?.exit();
      for (const o of added) o.removeFromParent();
      for (const x of disposables) x.dispose();
      if (ui) { ui.removeEventListener('pointerdown', onPress); ui.remove(); }
      FX.uWind.value = was.wind;
      if (sign) sign.hidden = false;            // the framework shows it again
      g.follow.clearCutscene(true);
      ctx.lock(false);
    };

    try {
      ctx.lock(true);
      await ctx.fade(true, 350);
      if (ctx.quit) return { score: 0, quit: true };
      p.teleport(sx, sz, ground, WIND_HEADING);
      const origin = new V3(sx, ground, sz);

      // ---- the build: the kite lies on the grass in front of Mika, the camera close and low
      const lay = origin.clone().addScaledVector(d, 0.7).addScaledVector(r, 1.05);
      lay.y = world.heightAt(lay.x, lay.z) + 0.04;
      const portrait = innerHeight > innerWidth;
      const buildCam = origin.clone().addScaledVector(d, portrait ? 4.4 : 3.4).addScaledVector(r, 0.9).add(new V3(0, 1.5, 0));
      // a model whose tail is not a part of its own gets a ribbon tied on in step three
      const buildTail = new THREE.Mesh(new THREE.PlaneGeometry(0.045, 0.6), new THREE.MeshBasicMaterial({ color: '#ee4a2c', side: THREE.DoubleSide }));
      buildTail.position.set(0.3, -KITE_SIZE * 0.5 + 0.02, 0.04);
      buildTail.rotation.z = 1.25;               // trailing on the grass beside it
      buildTail.visible = false;
      disposables.push(buildTail.geometry, buildTail.material);
      const showPart = (name, on) => {
        if (kite.named) { for (const o of kite.parts[name]) o.visible = on; return; }
        // a model without named parts: it simply grows in three steps
        if (name === 'frame') K.visible = on;
      };
      /** Put this kite in the picture: propped up on the grass beside her, leaning back, its face to the camera. */
      const setKite = id => {
        if (kite && kite.style === id) return;
        dropKite();
        kite = makeKite(g.assets, id);
        K = kite.holder;
        scene.add(K);
        K.add(buildTail);
        still?.keep(K);
        pose(scale);
      };
      const pose = sc => {
        const A = KITE_ART[kite.style], tall = KITE_SIZE * sc * A.size * A.h / Math.max(A.w, A.h);
        K.position.copy(lay).add(new V3(0, Math.max(0.5, tall * 0.42), 0));
        K.lookAt(buildCam.x, K.position.y + 0.9, buildCam.z);
        K.rotateZ(0.12);
        K.scale.setScalar(sc);
      };
      // the kites open to this player: two from the start, the others with the stars earned here (all levels added up)
      const rec = ctx.director.tricks.rec?.('kite'), stars = LEVELS.reduce((n, l) => n + levelStars(rec, l), 0);
      const qaStyle = typeof window !== 'undefined' ? window.__STARLINE_QA__?.kiteStyle : null;
      let style = KITE_STYLE[qaStyle] ? qaStyle : kiteOpen(lastStyle, stars) ? lastStyle : 'diamond';
      let scale = KITE_STYLE[qaStyle] ? BUILD_SCALE : PICK_SCALE;
      setKite(style);
      g.follow.cutscene({ pos: buildCam, look: origin.clone().addScaledVector(r, 0.45).add(new V3(0, 0.75, 0)) }, 0.001);
      // the signpost steps out of the picture for the round (the framework keeps it hidden while `hidden` is set)
      sign = ctx.director.tricks.signs.find(s => s.t.id === 'kite') || null;
      if (sign) { sign.hidden = true; if (sign.obj) sign.obj.visible = false; }

      ui = document.createElement('div');
      ui.id = 'kiteUi';
      ui.innerHTML = '<div class="lab"></div><div class="bar"><div class="zone"><u></u></div><div class="tz"></div><span class="gust l">«</span><span class="gust r">»</span><i class="rg"></i><div class="mark"></div></div><div class="alt"><i></i><b></b></div>';
      document.body.appendChild(ui);
      const el = { lab: ui.querySelector('.lab'), bar: ui.querySelector('.bar'), zone: ui.querySelector('.zone'), mark: ui.querySelector('.mark'), gl: ui.querySelector('.gust.l'), gr: ui.querySelector('.gust.r'), alt: ui.querySelector('.alt'), altFill: ui.querySelector('.alt i'), ring: ui.querySelector('.rg'), ringH: ui.querySelector('.alt b'), tree: ui.querySelector('.tz') };
      onPress = e => { e.preventDefault(); tap = true; };
      ui.addEventListener('pointerdown', onPress);
      el.alt.style.display = 'none';
      el.zone.style.left = '43%'; el.zone.style.width = '14%';
      ui.style.display = 'none';                 // (the chooser comes first)
      // the gauge is written only when a value changes by what can be seen (a tenth of a percent, a degree)
      let markAt = NaN, markRot = NaN, altAt = NaN;
      const setMark = v => { const k = Math.round((50 + v * 46) * 10); if (k !== markAt) { markAt = k; el.mark.style.left = `${k / 10}%`; } };
      const pressNow = () => { const on = tap || ctx.pressed() || input.pressed('jump') || input.pressed('tap'); tap = false; return on; };

      still = enterFocus(g, { keep: [K, p.root], sim: 'actors', bakeShadows: true });   // the build: the valley is a still picture, only Mika and her kite are live
      await ctx.wait(0.15);
      await ctx.fade(false, 450);
      if (ctx.quit) return { score: 0, quit: true };

      const st = { phase: 'pick', step: 0, marker: 0, qs: [], build: 0, flight: null, push: 0, lead: 0, speed: 0 };
      ctx.debug.kite = () => ({
        phase: st.phase, style: kite?.style, stars, step: st.step, marker: st.marker, speed: st.speed, build: st.build,
        x: st.flight?.x ?? 0, h: st.flight?.h ?? 0, aloft: st.flight?.aloft ?? false, window: st.flight?.window ?? 0,
        push: st.push, lead: st.lead, pts: st.flight?.pts ?? 0, falls: st.flight?.falls ?? 0, model: !!kite?.fromModel,
        c: st.flight?.c ?? 0, ring: st.flight?.ring ?? 0, got: st.flight?.got ?? 0, snags: st.flight?.snags ?? 0, t: st.flight?.t ?? 0,
        pos: K ? [K.position.x, K.position.y, K.position.z] : null,
      });
      ctx.hud(0, null);

      // ---- which kite? (a QA script names it up front and sees no chooser)
      if (!KITE_STYLE[qaStyle]) {
        const lock = k => (kiteOpen(k.id, stars) ? '' : k.stars - stars === 1 ? tx(N_('1 more star opens it')) : tx(N_('{n} more stars open it'), { n: k.stars - stars }));
        let chosen;
        pick = openPick({
          title: tx(N_('Which kite today?')), sel: style, go: tx(N_('Build this kite')), touch: ctx.ui.touch,
          items: KITE_STYLES.map(k => ({ id: k.id, name: tx(k.name), desc: tx(k.desc), pic: kiteThumb(k.id), lock: lock(k),
            stats: [[tx(N_('Lift')), k.lift], [tx(N_('Steady')), k.steady], [tx(N_('Speed')), k.speed]] })),
          onSel: id => { if (kite && id !== kite.style) { setKite(id); audio.blip(1.2); } },
        });
        pick.done.then(v => { chosen = v; });
        if (innerHeight >= 480) ctx.hint(N_('Pick a kite. Each one flies its own way: look at the bars.'), 6);     // (a phone held sideways has no room for it under the chooser)
        const picked = await ctx.loop(() => { pick.step(input); return chosen !== undefined ? true : undefined; });
        if (picked?.quit || !chosen) return { score: 0, quit: true };
        pick = null;
        style = chosen;
        scale = BUILD_SCALE;
        setKite(style);
        pose(scale);
        audio.good();
      }
      lastStyle = style;
      st.phase = 'build';
      ui.style.display = '';
      for (const s of STEPS) showPart(s.part, false);
      const labels = STEP_LABELS[kite.style] || STEPS.map(s => s.label);
      ctx.hint(ctx.ui.touch ? N_('Three steps to a kite. Tap {act} when the marker is in the green.')
        : N_('Three steps to a kite. Press {act} or Space when the marker is in the green.'), 5);

      for (let i = 0; i < STEPS.length; i++) {
        const step = STEPS[i];
        st.step = i;
        st.speed = step.speed * (ctx.first || ctx.easy ? 0.75 : 1);
        el.lab.textContent = `${i + 1}/3 · ${tx(labels[i])}`;
        let t0 = 0, done = null;
        tap = false;
        const res = await ctx.loop(dt => {
          t0 += dt;
          st.marker = sweepAt(t0, st.speed);
          setMark(st.marker);
          if (t0 > 0.25 && pressNow()) { done = buildQuality(st.marker); return true; }
          if (t0 > 9) { done = 0.3; return true; }           // never stalls: a loose knot after a long wait
          return undefined;
        });
        if (res?.quit) return { score: 0, quit: true };
        st.qs.push(done);
        st.build = buildResult(st.qs).points;
        ctx.hud(st.build, null);
        showPart(step.part, true);
        if (i === 2 && !kite.parts.tail.length) buildTail.visible = true;
        const grade = buildGrade(done);
        ctx.hint(GRADE[grade], 2.2);
        if (grade) audio.good(); else audio.blip(0.8);
        audio.hammer();
        p.gesture('Interact', { lock: false });
        fx.burst?.(lay.clone().add(new V3(0, 0.4, 0)), { n: 8 + grade * 5, color: [1, 0.85, 0.4], speed: 1.2, size: 0.12, gravity: 1 });
        // a little pop as the part goes on
        let pop = 0;
        const r2 = await ctx.loop(dt => { pop += dt; const k = 1 + Math.sin(Math.min(1, pop / 0.35) * Math.PI) * 0.12; K.scale.setScalar(k * BUILD_SCALE * (kite.named ? 1 : 0.6 + (i + 1) * 0.4 / 3)); return pop > 0.9 ? true : undefined; });
        if (r2?.quit) return { score: 0, quit: true };
      }
      const built = buildResult(st.qs);

      // ---- the flight
      await ctx.fade(true, 300);
      still.exit();                // (the flight needs the whole live sky)
      if (ctx.quit) return { score: st.build, quit: true };
      st.phase = 'fly';
      const plan = flightPlan(ctx.level, ctx.first);            // the level's sky: gusts, turns of the wind, rings, the tree
      const qaSeed = typeof window !== 'undefined' ? window.__STARLINE_QA__?.trickSeed : 0;
      const wind = makeWind(qaSeed || Math.floor(Math.random() * 1e6) + 1, ctx.roundTime, plan);
      const fl = st.flight = newFlight({ quality: built.quality, tail: built.tail, window: plan.window, style: kite.style });
      ctx.debug.wind = wind;
      const botOut = { steer: 0, tug: false };
      /** QA: what a scripted flyer would do now (rules-kite.js kiteBot). */
      ctx.debug.bot = skill => kiteBot(fl, wind, skill, botOut);
      // the model's own tail stays on the kite in the air and the long ribbon is tied to its end; a kite without one
      // (or the stand-in ribbon of the build) gets the ribbon at its bottom tip
      // (the flutes of the sáo kite and the box kite's bridle are no ribbons: they stay)
      if (!kite.fromModel && kite.tails.length) for (const o of kite.parts.tail) o.visible = false;
      buildTail.visible = false;
      K.scale.setScalar(FLY_SCALE);
      ctx.hintTop(true, 150);                                  // under the gauge: the bottom of the picture is Mika's

      // string
      const sGeo = new THREE.BufferGeometry();
      const sPos = new THREE.BufferAttribute(new Float32Array(STRING_N * 3), 3).setUsage(THREE.DynamicDrawUsage);
      sGeo.setAttribute('position', sPos);
      const string = new THREE.Line(sGeo, new THREE.LineBasicMaterial({ color: '#fffaf0', transparent: true, opacity: 0.9 }));
      string.frustumCulled = false;
      // tails: each a ribbon strip of TAIL_N nodes, red and white bands (one for the diamond, two for the kaku-dako, none for the flute and box kites)
      const tCol = new Float32Array(TAIL_N * 2 * 3), tIdx = [];
      for (let i = 0; i < TAIL_N; i++) {
        const c = i % 2 ? [1, 0.97, 0.9] : [0.93, 0.27, 0.17];
        tCol.set(c, i * 6); tCol.set(c, i * 6 + 3);
        if (i < TAIL_N - 1) tIdx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      }
      const tMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
      const tails = kite.tails.map(([ox, oy, long]) => {
        const geo = new THREE.BufferGeometry(), pos = new THREE.BufferAttribute(new Float32Array(TAIL_N * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('position', pos);
        geo.setAttribute('color', new THREE.BufferAttribute(tCol, 3));
        geo.setIndex(tIdx);
        const mesh = new THREE.Mesh(geo, tMat);
        mesh.frustumCulled = false;
        scene.add(mesh); added.push(mesh); disposables.push(geo);
        return { ox, oy, long, pos, mesh, nodes: new Float32Array(TAIL_N * 3) };
      });
      disposables.push(tMat);
      // wind streaks: short pale lines blowing over the meadow, slanting with the wind that is about to arrive
      const wGeo = new THREE.BufferGeometry();
      const wPos = new THREE.BufferAttribute(new Float32Array(STREAKS * 6), 3).setUsage(THREE.DynamicDrawUsage);
      wGeo.setAttribute('position', wPos);
      const streaks = new THREE.LineSegments(wGeo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.42, depthWrite: false }));
      streaks.frustumCulled = false;
      const sk = new Float32Array(STREAKS * 4);     // along, across, height, speed factor
      for (let i = 0; i < STREAKS; i++) { sk[i * 4] = -8 + Math.random() * 40; sk[i * 4 + 1] = (Math.random() - 0.5) * 34; sk[i * 4 + 2] = i % 3 ? 0.25 + Math.random() * 1.6 : 3 + Math.random() * 14; sk[i * 4 + 3] = 0.7 + Math.random() * 0.6; }
      // clouds
      const cTex = cloudTexture();
      const cMat = new THREE.SpriteMaterial({ map: cTex, transparent: true, opacity: 0.85, depthWrite: false, fog: false });
      const clouds = [];
      for (let i = 0; i < CLOUDS; i++) {
        const s = new THREE.Sprite(cMat);
        s.scale.set(26 + i * 6, 12 + i * 3, 1);
        s.userData.a = (i - 1) * 34 + 4; s.userData.h = 44 + i * 9; s.userData.far = 85 + i * 16;
        clouds.push(s); scene.add(s); added.push(s);
      }
      scene.add(string, streaks); added.push(string, streaks);
      disposables.push(sGeo, string.material, wGeo, streaks.material, cTex, cMat);
      // the ring in the sky: one pooled pair of hoops (gold, with a thin red-and-white one round it), moved to each ring in turn
      const ringGeo = new THREE.TorusGeometry(1, 0.045, 6, 40), ringGeo2 = new THREE.TorusGeometry(1.12, 0.02, 5, 40);
      const ringMat = new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0, depthWrite: false, fog: false });
      const ringMat2 = new THREE.MeshBasicMaterial({ color: '#ff6a4a', transparent: true, opacity: 0, depthWrite: false, fog: false });
      const hoop = new THREE.Group();
      hoop.add(new THREE.Mesh(ringGeo, ringMat), new THREE.Mesh(ringGeo2, ringMat2));
      hoop.traverse(o => { o.frustumCulled = false; });
      hoop.visible = false; hoop.renderOrder = 5;
      scene.add(hoop); added.push(hoop);
      disposables.push(ringGeo, ringGeo2, ringMat, ringMat2);
      const ringAt = new V3();
      let ringSeen = -1, ringPop = 0, ringK = 0, hitSeen = fl.hitT, snagSeen = fl.snagT, ringShown = null, ringHint = false, turnHint = false;
      // the tree (Difficult): a tall oak from the model library at the right edge of the field, where the rules catch a low kite
      if (plan.tree) {
        const tree = g.assets.clone('tree-broadleaf-a') || g.assets.clone('tree-chestnut');
        if (tree) {
          fit(tree, 11);
          const ta = 0.72, td = 14.5, tx0 = sx + (d.x * Math.cos(ta) + r.x * Math.sin(ta)) * td, tz0 = sz + (d.z * Math.cos(ta) + r.z * Math.sin(ta)) * td;
          tree.position.set(tx0, world.heightAt(tx0, tz0) - 0.55, tz0);          // (its roots a little in the slope)
          tree.name = 'trick-kite-tree';
          tree.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
          scene.add(tree); added.push(tree);
        }
        el.tree.style.width = `${(50 - KITE.treeX / KITE.edge * 46).toFixed(1)}%`;
      }

      // camera: far back and low, looking halfway between Mika and the kite so both stay in the picture
      const camPos = origin.clone().addScaledVector(d, portrait ? -14 : -12.5).addScaledVector(r, 2.2).add(new V3(0, 1.6, 0));
      const hand = new V3(), kp = new V3(), look = new V3(), a1 = new V3(), a2 = new V3(), tmp = new V3(), up2 = new V3(), right2 = new V3();
      const head = origin.clone().add(new V3(0, 1.1, 0));
      let xV = 0, hV = 0.02, roll = 0, lastX = 0, sc = FLY_SCALE;
      /** A place in the sky from the rules' (x across the wind, h up the line), into `out`. */
      const sky = (x, h, out) => {
        const az = x * 0.5, elv = 0.3 + 0.5 * h, L = 10 + 20 * h;
        const ch = Math.cos(elv) * L;
        out.copy(hand).addScaledVector(d, Math.cos(az) * ch).addScaledVector(r, Math.sin(az) * ch);
        out.y = hand.y + Math.sin(elv) * L;
        return out;
      };
      const place = () => {
        // the kite's place in the sky from (xV, hV)
        sky(xV, hV, kp);
        const gy = world.heightAt(kp.x, kp.z) + 0.25;
        if (kp.y < gy || hV <= 0.021) kp.y = gy;
        return kp;
      };
      const lookAt = () => {
        a1.copy(head).sub(camPos).normalize();
        a2.copy(K.position).sub(camPos).normalize();
        // the kite a third of the way above the middle of the picture, Mika below it
        return look.copy(a1).multiplyScalar(0.35).addScaledVector(a2, 0.65).normalize().multiplyScalar(14).add(camPos);
      };
      const handAt = () => { if (p.grip && p.grip !== p.model) p.grip.getWorldPosition(hand); else hand.copy(origin).add(tmp.set(0, 1.05, 0)); return hand; };
      handAt(); place(); K.position.copy(kp);
      for (const T of tails) for (let i = 0; i < TAIL_N; i++) { T.nodes[i * 3] = kp.x; T.nodes[i * 3 + 1] = kp.y - i * TAIL_SEG; T.nodes[i * 3 + 2] = kp.z; }
      g.follow.cutscene({ pos: camPos, look: lookAt() }, 0.001);
      g.follow.track(() => camPos, lookAt, 5);

      // the gauge: the wind window in the middle, the kite as the marker, chevrons where a gust is coming from
      el.lab.textContent = tx(N_('Keep the kite in the green'));
      el.mark.classList.add('kite');
      el.alt.style.display = '';
      const zw = fl.window / KITE.edge * 46;
      el.zone.style.left = `${(50 - zw).toFixed(1)}%`; el.zone.style.width = `${(zw * 2).toFixed(1)}%`;
      // a kite that climbs only in the middle of the wind (the box kite) shows that middle in a darker green
      if (fl.fly.core < 1) { const core = el.zone.firstChild; core.style.display = 'block'; core.style.left = core.style.right = `${((1 - fl.fly.core) * 50).toFixed(1)}%`; }
      let gustShown = 0, zoneOut = false, zoneAt = 0;

      await ctx.wait(0.1);
      await ctx.fade(false, 450);
      if (ctx.quit) return { score: st.build, quit: true };
      ctx.hint(ctx.ui.touch ? N_('Steer with the stick to stay in the wind. Jump gives the line a tug to climb.')
        : N_('Steer left and right to stay in the wind. Space gives the line a tug to climb.'), 5.5);
      let levelHint = plan.tree ? 6.5 : -1;             // Difficult says what is new once the first hint has gone
      let styleHint = STYLE_HINT[kite.style] ? (plan.tree ? 13 : 6.5) : -1, hum = 0, humHint = false;   // ...and the teacher a word about this kite
      audio.whoosh(3);

      let left = ctx.roundTime, said = 0, gustHint = false, downHint = false, highHint = false, gustWas = 0;
      const inp = { steer: 0, tug: false };
      const res = await ctx.loop(dt => {
        left -= dt;
        const t = fl.t;
        inp.steer = input.move.x;
        inp.tug = pressNow();
        const wasAloft = fl.aloft, falls = fl.falls;
        if (inp.tug && fl.tug <= 0) { audio.reel(); p.gesture('Interact', { lock: false }); }
        stepFlight(fl, wind, dt, inp);
        st.push = windPush(wind, t);
        st.lead = windPush(wind, t + KITE.lead);
        // gust sound and wind in the grass
        const gusty = Math.abs(st.lead) > 0.55;
        if (gusty && !gustWas) audio.whoosh(4);
        gustWas = gusty;
        FX.uWind.value = 2.1 + Math.min(1.6, Math.abs(st.lead) * 1.6);

        // ---- draw
        handAt();
        xV += (fl.x - xV) * Math.min(1, dt * 7);
        hV += ((fl.aloft ? fl.h : 0.02) - hV) * Math.min(1, dt * (fl.aloft ? 5 : 2.2));
        place();
        // a little life: the kite bobs and shivers more in a gust
        const flutter = fl.aloft ? 1 : 0;
        kp.y += Math.sin(ctx.t * 2.3) * 0.25 * flutter;
        K.position.copy(kp);
        sc = FLY_SCALE + FLY_GROW * hV;
        K.scale.setScalar(sc);
        if (fl.aloft || hV > 0.04) {
          K.lookAt(hand);
          K.rotateX(-0.5 - 0.3 * (1 - hV));           // leaning back on the wind
          const vx = (fl.x - lastX) / Math.max(dt, 1e-3);
          roll += ((-vx * 0.55 + Math.sin(ctx.t * 5.1) * 0.05 * (1 + Math.abs(st.push) * 2) + (1 - fl.tail) * 0.35 * Math.sin(fl.t * 3.3)) - roll) * Math.min(1, dt * 6);
          K.rotateZ(roll);
        } else {
          K.rotation.set(-Math.PI / 2 + 0.2, WIND_HEADING, 0.3);     // lying on the grass
        }
        lastX = fl.x;
        // string: a sagging curve from her hand to the kite's middle
        drawString(sPos.array, hand.x, hand.y, hand.z, kp.x, kp.y, kp.z, 0.5 + 1.8 * (1 - hV));
        sPos.needsUpdate = true;
        // tails: each knot follows the one before, blown downwind and sagging
        up2.set(0, 1, 0).applyQuaternion(K.quaternion); right2.set(1, 0, 0).applyQuaternion(K.quaternion);
        for (let i = 0; i < tails.length; i++) {
          const T = tails[i], n = T.nodes, ax = T.ox * sc, ay = T.oy * sc;
          n[0] = kp.x + right2.x * ax + up2.x * ay; n[1] = kp.y + right2.y * ax + up2.y * ay; n[2] = kp.z + right2.z * ax + up2.z * ay;
          stepTail(n, T.pos.array, world, (d.x * 2.2 + r.x * st.push * 2.5) * dt, -2.6 * dt, (d.z * 2.2 + r.z * st.push * 2.5) * dt, ctx.t + i * 1.7, sc, r.x, r.z, T.long);
          T.pos.needsUpdate = true;
        }
        // the flute kite hums when it is up high: two soft notes, a fifth apart, breathing with the wind
        const voice = fluteVoice(fl);
        if (voice > 0 && (hum -= dt) <= 0) {
          hum = 0.85;
          audio.tone(294 + Math.abs(st.push) * 24, { type: 'sine', dur: 1.5, vol: 0.035 * voice, attack: 0.35, rev: 0.5 });
          audio.tone(441 + Math.abs(st.push) * 36, { type: 'triangle', dur: 1.3, vol: 0.016 * voice, attack: 0.4, rev: 0.6 });
        }
        // streaks and clouds drift with the wind that is coming (they lead the kite)
        stepStreaks(sk, wPos.array, origin.x, ground, origin.z, d.x, d.z, r.x, r.z, st.lead * 0.9 + fl.c * 0.9, dt);
        wPos.needsUpdate = true;
        for (const c of clouds) {
          c.userData.a += st.lead * 9 * dt + 1.2 * dt;
          if (c.userData.a > 60) c.userData.a -= 120; else if (c.userData.a < -60) c.userData.a += 120;
          c.position.set(origin.x + d.x * c.userData.far + r.x * c.userData.a, ground + c.userData.h, origin.z + d.z * c.userData.far + r.z * c.userData.a);
        }

        // ---- the ring in the sky: it fades in a moment before it counts, blinks before it goes, and bursts when flown through
        const ring = fl.ring < wind.rings.length && fl.t >= wind.rings[fl.ring].t0 - 1.2 ? wind.rings[fl.ring] : null;
        if (fl.hitT !== hitSeen) {
          hitSeen = fl.hitT; ringPop = 0.45;
          audio.star?.(); fx.burst?.(ringAt, { n: 26, color: [1, 0.85, 0.3], speed: 5, size: 0.5, gravity: 0.6 });
          ctx.hint(fl.got === wind.rings.length ? N_('Every ring! What a flight.') : N_('Through the ring!'), 2.2); said = 4;
        }
        if (ring && ringPop <= 0) {
          if (fl.ring !== ringSeen) { ringSeen = fl.ring; ringK = 0; }
          ringK = Math.min(1, ringK + dt * 1.2);
          sky(ring.x, ring.h, ringAt);
          const left = ring.t1 - fl.t, blink = left < 2.2 ? 0.55 + 0.45 * Math.sin(ctx.t * 14) : 1;
          hoop.visible = true;
          hoop.position.copy(ringAt);
          hoop.lookAt(hand);
          hoop.scale.setScalar((0.11 * (10 + 20 * ring.h) + 0.5) * (0.6 + 0.4 * ringK) * (1 + Math.sin(ctx.t * 3) * 0.04));
          ringMat.opacity = 0.95 * ringK * blink; ringMat2.opacity = 0.8 * ringK * blink;
        } else if (ringPop > 0) {
          ringPop -= dt;
          hoop.scale.multiplyScalar(1 + dt * 3.5);
          ringMat.opacity = ringMat2.opacity = Math.max(0, ringPop / 0.45);
          if (ringPop <= 0) hoop.visible = false;
        } else if (hoop.visible) hoop.visible = false;
        if (ring !== ringShown) {
          ringShown = ring;
          el.ring.style.display = el.ringH.style.display = ring ? 'block' : 'none';
          if (ring) { el.ring.style.left = `${(50 + ring.x / KITE.edge * 46).toFixed(1)}%`; el.ringH.style.left = `${Math.round(ring.h * 100)}%`; }
        }

        // ---- gauge and HUD
        const za = Math.round(fl.c / KITE.edge * 460);
        if (za !== zoneAt) { zoneAt = za; el.zone.style.left = `${(50 - zw + za / 10).toFixed(1)}%`; }
        setMark(xV / KITE.edge);
        const rot = Math.round(45 + roll * 40);
        if (rot !== markRot) { markRot = rot; el.mark.style.transform = `rotate(${rot}deg)`; }
        const out = fl.aloft && !fl.inWindow;
        if (out !== zoneOut) { zoneOut = out; el.zone.classList.toggle('out', out); }
        const gs = st.lead > 0.5 ? 1 : st.lead < -0.5 ? -1 : 0;      // a push to the right comes from the left
        if (gs !== gustShown) { gustShown = gs; el.gl.classList.toggle('on', gs > 0); el.gr.classList.toggle('on', gs < 0); }
        const alt = Math.round(hV * 100);
        if (alt !== altAt) { altAt = alt; el.altFill.style.width = `${alt}%`; }
        ctx.hud(kiteScore(st.build, fl), left);

        // ---- the teacher
        said -= dt;
        if (levelHint > 0 && (levelHint -= dt) <= 0) { said = 6; ctx.hint(N_('Today the wind turns: the green slides. And keep high near the tree on the right!'), 5.5); }
        if (styleHint > 0 && (styleHint -= dt) <= 0) { said = 6; ctx.hint(STYLE_HINT[kite.style], 5.5); }
        if (voice > 0.6 && !humHint && said <= 0) { humHint = true; said = 5; ctx.hint(N_('Hear it hum? The wind is playing its flutes.'), 4); }
        if (fl.snagT !== snagSeen) {
          snagSeen = fl.snagT; audio.miss(); said = 6;
          fx.burst?.(K.position, { n: 14, color: [0.35, 0.6, 0.25], speed: 2.2, size: 0.3, gravity: 3 });
          ctx.hint(N_('Caught in the tree! Fly high when the kite is on that side.'), 4);
        } else if (falls !== fl.falls) {
          audio.miss();
          if (!downHint || said <= 0) { downHint = true; said = 6; ctx.hint(N_('Down on the grass. Wind it in and up again! A tug helps.'), 3.2); }
        } else if (!wasAloft && fl.aloft) { audio.whoosh(2); }
        else if (ring && !ringHint && fl.t >= ring.t0 && said <= 0) {
          ringHint = true; said = 6;
          ctx.hint(plan.rings === 'high' ? N_('A ring up high! Keep the kite in the green and it climbs to it.')
            : plan.rings === 'wide' ? N_('A ring out to the side! Dash out to it, then back into the wind.')
              : N_('A ring! Fly through it. Too high? Slide out of the green and the kite sinks.'), 5.5);
        } else if (plan.shift && !turnHint && Math.abs(fl.c) > 0.12 && said <= 0) { turnHint = true; said = 5; ctx.hint(N_('The wind is turning! Follow the green.'), 3.5); }
        else if (gs && !gustHint && said <= 0) { gustHint = true; said = 6; ctx.hint(N_('See the grass streak sideways? A gust is coming. Steer against it!'), 4); }
        else if (!highHint && fl.h > 0.97) { highHint = true; said = 5; audio.good(); ctx.hint(N_('Right at the top of the line! The wind is steadier up there.'), 4); }
        else if (ctx.first && said <= 0 && out) { said = 7; ctx.hint(N_('It is sliding out of the wind. Steer it back to the middle.'), 3); }
        else if (said <= 0 && fl.tail < 0.5 && fl.t > 12 && fl.t < 13) { said = 6; ctx.hint(N_('See it wag? A longer, tighter tail would keep it steady.'), 4); }
        return left <= 0 ? { done: true } : undefined;
      });

      const score = kiteScore(st.build, fl);
      if (!res?.quit) {
        // wind it in: the kite comes down to her hands
        ctx.hint(!ctx.first && fl.got % 2 ? N_('Wind it in. No wind tomorrow? Then we fold paper planes on the hill.') : N_('Wind it in. That kite will fly again on any windy day.'), 3.5);
        st.phase = 'land';
        hoop.visible = false; el.ring.style.display = el.ringH.style.display = 'none';
        let t1 = 0;
        const h0 = hV;
        await ctx.loop(dt => {
          t1 += dt;
          handAt();
          hV = h0 * Math.max(0, 1 - t1 / 1.6); xV *= Math.max(0, 1 - dt * 2);
          place();
          K.position.copy(kp);
          if (hV > 0.04) K.lookAt(hand);
          for (let i = 0; i < STRING_N; i++) { const k = i / (STRING_N - 1); sPos.setXYZ(i, hand.x + (kp.x - hand.x) * k, hand.y + (kp.y - hand.y) * k - 4 * k * (1 - k), hand.z + (kp.z - hand.z) * k); }
          sPos.needsUpdate = true;
          for (const T of tails) T.mesh.visible = false;
          return t1 > 2 ? true : undefined;
        });
      }
      await ctx.fade(true, 300);
      cleanup();
      await ctx.fade(false, 400);
      return {
        score, quit: !!res?.quit && fl.air < 5, built: st.qs, falls: fl.falls,
        detail: { rings: fl.got, ringsOf: wind.rings.length, snags: fl.snags, falls: fl.falls, air: Math.round(fl.air) },
        extra: wind.rings.length ? tx('rings: {n} of {m}', { n: fl.got, m: wind.rings.length })
          : fl.falls === 0 && fl.air > 30 ? N_('never touched the grass') : fl.top >= 0.98 ? N_('reached the top of the line') : undefined,
      };
    } finally {
      // a quit or an error anywhere above: put everything back (the framework un-fades nothing, so do it here)
      if (!cleaned) { cleanup(); ctx.fade(false, 300); }
    }
  },
};
