// Eggs down the gutters: Grandma's hens sit on the roof of the henhouse behind the cottage and lay into four bamboo
// down-gutters. Bamboo seesaws ("rungs") join neighbouring gutters: an egg takes every rung it meets (Amidakuji, the
// ghost-leg lot game), so the spout it leaves by has to be read off the board. Mika runs left and right under the
// spouts and catches the eggs in her straw hat. The rules (board, paths, waves, score) are pure and Node-tested in
// ./rules-eggs.js; this file only draws them.
//
// The henhouse stands in the valley for good (the framework's `scenery` hook shows it while Mika is anywhere near, in
// every season and at every hour): one merged vertex-coloured mesh (walls, roof, gutters, spouts, nests, the basket on
// its crate), one instanced mesh for the rungs and four hens from the model library. A round adds its own few things
// (the eggs, the hat, splats, the "!" over a hen about to lay, a small panel) and takes them away again.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { N_, tx } from '../../i18n/i18n.js';
import { Animator } from '../../actors/animator.js';
import { mergeSkinnedParts } from '../../engine/skin-merge.js';
import { addCss, disposeRigs, fit, trampleGrass } from './util.js';
import { EGGS, EggRound, laneX, rungY, rng, makeBoard } from './rules-eggs.js';

/** Where the henhouse stands: the middle of its front wall at the ground. The board faces south (+z), into the sun. */
export const HOUSE = Object.freeze({ x: -53, z: 147.7, halfWidth: 1.95, depth: 1.7 });
// Front-of-house coordinates (x right, y up, z out of the wall): Mika's feet, where the eggs fall into the hat, pipes.
const MZ = 0.35, HZ = 0.72, PIPE_Z = 0.21, PIPE_R = 0.15, RUNG_Z = 0.46, RUNG_R = 0.135, EGG_R = 0.125;
const WALL_H = 3.98, SHELF = 4.02, HEN_Z = 0.3;
const BASKET = Object.freeze({ x: 2.5, y: 0.5, z: HZ });
const MAX_RUNGS = EGGS.rows, SIM_EGGS = 4, HAT_EGGS = 8, BASKET_EGGS = 12, EGG_SLOTS = SIM_EGGS + HAT_EGGS + BASKET_EGGS, SPLATS = 4;
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const smooth = k => k * k * (3 - 2 * k);

const C = { stone: '#b7ae9f', plaster: '#f1e6cf', frame: '#5b3b27', plank: ['#8f5f3c', '#85573a', '#986742'], shelf: '#b88957', straw: '#e6bd4f', strawDeep: '#c99a36',
  tile: ['#c9472f', '#bb3f2a', '#d4553b'], ridge: '#983323', bamboo: '#b4dc62', bambooDeep: '#39682a', node: '#4f8433', rung: '#f8e391', rungDeep: '#8a6a26',
  pane: '#9fc4d6', dark: '#3a2a20', crate: '#a8733f', crateDark: '#7d5330', weave: ['#d9a95e', '#c08f47'], egg: '#eadbb9', gold: '#ffc526', hat: '#f2d27e', hatDeep: '#cfa650', ribbon: '#d9483b' };

const CSS = `
body.eggs-round #tAct,body.eggs-round #tJump{display:none!important}
body.eggs-direct #stick{display:none!important}
body.eggs-round .bark{display:none}
#eggHud{position:fixed;left:50%;top:calc(66px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:16;display:flex;gap:12px;align-items:center;
 padding:4px 12px;border-radius:999px;background:rgba(255,247,232,.92);box-shadow:0 4px 14px rgba(40,20,0,.2);font:700 13px Nunito,system-ui,sans-serif;color:#5a3a22;
 zoom:var(--ui-scale,1);pointer-events:none;white-space:nowrap}
#eggHud span{display:flex;gap:4px;align-items:center}
#eggHud i{display:block;width:12px;height:15px;border-radius:50% 50% 50% 50%/60% 60% 40% 40%;background:#fff;box-shadow:inset 0 0 0 1.5px #c9b48c}
#eggHud .lives i.x{background:#e9ded0;box-shadow:inset 0 0 0 1.5px #d6c9b4;position:relative;opacity:.75}
#eggHud .lives i.x::after{content:'';position:absolute;left:5px;top:1px;width:2px;height:13px;background:#c2541c;transform:rotate(28deg);border-radius:2px}
#eggHud .hat{padding-left:10px;border-left:2px solid #e6d3b0}
#eggHud .hat i{width:9px;height:11px;background:#f1e6cf;box-shadow:inset 0 0 0 1.5px #d9c7a4}
#eggHud .hat i.on{background:#f08a3c;box-shadow:none}
#eggHud .hat.full{animation:eggFull .5s ease-in-out infinite alternate}
#eggHud .hat svg{width:20px;height:14px;display:block}
#eggHud.first .hat{display:none}
#eggPop{position:fixed;z-index:16;left:0;top:0;pointer-events:none;font:600 26px Fredoka,Nunito,sans-serif;color:#fff;text-shadow:0 2px 0 #b8581a,0 0 8px #b8581a;opacity:0;will-change:transform,opacity}
#eggPop.gold{color:#ffe169;font-size:34px}
#eggPop.go{animation:eggPop .7s ease-out both}
@keyframes eggPop{0%{opacity:0;transform:translate(-50%,-10px) scale(.6)}20%{opacity:1;transform:translate(-50%,-34px) scale(1.15)}100%{opacity:0;transform:translate(-50%,-78px) scale(1)}}
@keyframes eggFull{from{transform:scale(1)}to{transform:scale(1.12)}}
@media (min-aspect-ratio:1/1){body.eggs-round #trickHint{left:auto;right:calc(14px + env(safe-area-inset-right,0px));transform:none;bottom:auto;top:40%;width:auto;max-width:min(250px,24vw)}}
@media (max-aspect-ratio:1/1){body.eggs-round #trickHint{bottom:calc(58px + env(safe-area-inset-bottom,0px))}}
@media (max-width:560px){#eggHud{left:calc(8px + env(safe-area-inset-left,0px));transform:none}}
@media (max-height:480px){
 body.eggs-round #trickHud{left:calc(12px + env(safe-area-inset-left,0px));transform:none}
 body.eggs-round #trickHud .n{display:none}
 #eggHud{left:calc(12px + env(safe-area-inset-left,0px));transform:none}
 body.eggs-round #trickHint{top:34%;max-width:168px;font-size:14px;padding:8px 12px}
}
@media (prefers-reduced-motion:reduce){#eggHud .hat.full{animation:none}}
`;

// ---------------------------------------------------------------------------------------------------- geometry
const _c = new THREE.Color(), _c2 = new THREE.Color();
/** Non-indexed, no uv, one colour per vertex: every part of the henhouse merges into one mesh. */
function prep(geo, color, deep = null, depth = null) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute('uv');
  const p = g.attributes.position, a = new Float32Array(p.count * 3);
  _c.set(color);
  if (deep) _c2.set(deep);
  for (let i = 0; i < p.count; i++) {
    const k = deep ? clamp(depth(p.getX(i), p.getY(i), p.getZ(i)), 0, 1) : 0;
    a[i * 3] = _c.r + (deep ? (_c2.r - _c.r) * k : 0); a[i * 3 + 1] = _c.g + (deep ? (_c2.g - _c.g) * k : 0); a[i * 3 + 2] = _c.b + (deep ? (_c2.b - _c.b) * k : 0);
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const box = (x0, x1, y0, y1, z0, z1, color) => prep(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), color);
/** Half a bamboo pipe along +y, open toward +z (the camera); darker toward the back of the channel. */
const halfPipe = (len, r, color, deep) => prep(new THREE.CylinderGeometry(r, r, len, 10, 1, true, Math.PI / 2, Math.PI), color, deep, (x, y, z) => -z / r);

/** The straw hat, opening up: brim at y = 0, crown hanging below (she holds it upside-down to catch). */
function hatGeometry() {
  const P = (r, y) => new THREE.Vector2(r, y);
  const straw = prep(new THREE.LatheGeometry([P(0.001, -0.17), P(0.2, -0.17), P(0.25, 0), P(0.41, 0.03)], 16), C.hat, C.hatDeep, (x, y) => -y / 0.17);
  const band = prep(new THREE.LatheGeometry([P(0.236, -0.075), P(0.254, -0.02)], 16), C.ribbon);
  const g = mergeGeometries([straw, band]);
  straw.dispose(); band.dispose();
  return g;
}

function eggGeometry() {
  const g = new THREE.SphereGeometry(EGG_R, 12, 9);
  const p = g.attributes.position;
  // an egg: longer than wide, the top end a little narrower
  for (let i = 0; i < p.count; i++) { const y = p.getY(i) / EGG_R, k = 1 - 0.14 * Math.max(0, y); p.setXYZ(i, p.getX(i) * k, p.getY(i) * 1.3, p.getZ(i) * k); }
  g.computeVertexNormals();
  return g;
}

/** A broken egg on the ground: a wobbly white with the yolk in the middle. */
function splatGeometry() {
  const white = new THREE.CircleGeometry(0.46, 12).rotateX(-Math.PI / 2);
  const p = white.attributes.position;
  for (let i = 1; i < p.count; i++) { const k = 0.72 + 0.28 * Math.abs(Math.sin(i * 2.4)); p.setXYZ(i, p.getX(i) * k, 0, p.getZ(i) * k); }
  const yolk = new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1).translate(0.04, 0.005, 0.03);
  const parts = [prep(white, '#fffdf4'), prep(yolk, '#ffb21f')], g = mergeGeometries(parts);
  parts.forEach(q => q.dispose());
  g.computeVertexNormals();
  return g;
}

/**
 * One rung: a short bamboo trough on a peg, open at the top, so the egg rolls along it in full view (origin: the height
 * of the egg's middle, halfway between two gutters; it tips about z like a seesaw).
 */
// RUNG_DROP: the trough's rim lies this far under the middle of an egg riding in it. RUNG_DEEP: the trough is half as
// deep again as it is wide, so it reads as a bar at phone size.
const RUNG_DROP = 0.09, RUNG_DEEP = 1.5, RUNG_FRONT = RUNG_Z + RUNG_R + EGG_R * 0.9;
function rungGeometry() {
  const len = EGGS.dx + 0.3, parts = [];
  parts.push(halfPipe(len, RUNG_R, C.rung, C.rungDeep).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2).scale(1, RUNG_DEEP, 1).translate(0, -RUNG_DROP, 0));
  for (const s of [-1, 1]) parts.push(prep(new THREE.CircleGeometry(RUNG_R, 8, Math.PI, Math.PI).rotateY(Math.PI / 2).scale(1, RUNG_DEEP, 1).translate(s * len / 2, -RUNG_DROP, 0), C.rung, C.rungDeep, (x, y) => -(y + RUNG_DROP) / (RUNG_R * RUNG_DEEP)));
  // the peg it rocks on comes out of the wall behind it; a dark wooden saddle under the middle shows where it tips
  const back = RUNG_Z - 0.035 - RUNG_R;
  parts.push(prep(new THREE.CylinderGeometry(0.05, 0.05, back, 8).rotateX(Math.PI / 2).translate(0, -RUNG_DROP - RUNG_R * 0.8, -RUNG_R - back / 2), C.frame));
  parts.push(prep(new THREE.BoxGeometry(0.17, 0.1, 0.2).translate(0, -RUNG_DROP - RUNG_R * RUNG_DEEP - 0.03, 0), C.frame));
  const g = mergeGeometries(parts);
  parts.forEach(q => q.dispose());
  return g;
}

/** Everything of the henhouse that never moves, as one geometry. */
function houseGeometry() {
  const W = HOUSE.halfWidth, D = HOUSE.depth, parts = [];
  parts.push(box(-W - 0.07, W + 0.07, -0.6, 0.3, -D - 0.07, 0.07, C.stone));
  parts.push(box(-W, W, 0.3, WALL_H, -D, 0, C.plaster));
  // the board: warm planks, so a white egg in a green gutter stands out
  const n = 11, w = 2 * W / n;
  parts.push(box(-W, W, 0.3, WALL_H, 0, 0.02, C.frame));
  for (let i = 0; i < n; i++) parts.push(box(-W + i * w + 0.009, -W + (i + 1) * w - 0.009, 0.3, WALL_H, 0, 0.035, C.plank[i % 3]));
  // dark timber, like the cottage: corner posts, rails round the sides and the back
  for (const sx of [-1, 1]) for (const zc of [0, -D]) parts.push(box(sx * W - 0.09, sx * W + 0.09, 0.3, WALL_H, zc - 0.09, zc + 0.09, C.frame));
  parts.push(box(-W, W, 0.3, 0.46, 0, 0.06, C.frame));
  for (const y of [0.3, 2.05, WALL_H - 0.16]) {
    for (const sx of [-1, 1]) parts.push(box(sx * W - 0.03, sx * W + 0.03, y, y + 0.16, -D, 0, C.frame));
    parts.push(box(-W, W, y, y + 0.16, -D - 0.03, -D + 0.03, C.frame));
  }
  // the back and the sides are what the cottage sees: a middle post, a little window, and the hens' own door with its ramp
  parts.push(box(-0.07, 0.07, 0.3, WALL_H, -D - 0.03, -D + 0.03, C.frame));
  for (const sx of [-1, 1]) parts.push(box(sx * W - 0.03, sx * W + 0.03, 0.3, WALL_H, -D / 2 - 0.07, -D / 2 + 0.07, C.frame));
  parts.push(box(-1.3, -0.62, 2.72, 3.4, -D - 0.045, -D, C.frame));
  parts.push(box(-1.23, -0.69, 2.79, 3.33, -D - 0.05, -D, C.pane));
  parts.push(box(-0.985, -0.935, 2.79, 3.33, -D - 0.06, -D, C.frame));
  parts.push(box(-1.23, -0.69, 3.035, 3.085, -D - 0.06, -D, C.frame));
  parts.push(box(0.62, 1.3, 0.46, 1.22, -D - 0.045, -D, C.frame));
  parts.push(box(0.7, 1.22, 0.46, 1.14, -D - 0.05, -D, C.dark));
  const rampLen = Math.hypot(0.5, 1.15), rampA = Math.atan2(0.5, 1.15);
  parts.push(prep(new THREE.BoxGeometry(0.46, 0.04, rampLen).rotateX(-rampA).translate(0.96, 0.25, -D - 0.575), C.shelf));
  for (let k = 0; k < 5; k++) parts.push(prep(new THREE.BoxGeometry(0.46, 0.035, 0.05).rotateX(-rampA).translate(0.96, 0.25 + 0.03 + (0.19 - k * 0.095), -D - 0.575 + (0.437 - k * 0.2185)), C.frame));
  // the laying shelf under the eaves, its brackets, and a straw nest over each gutter
  parts.push(box(-W - 0.12, W + 0.12, SHELF - 0.07, SHELF, -0.02, 0.62, C.shelf));
  for (const x of [-1.9, -0.95, 0, 0.95, 1.9]) parts.push(box(x - 0.035, x + 0.035, SHELF - 0.4, SHELF - 0.07, 0.035, 0.4, C.frame));
  for (let i = 0; i < EGGS.lanes; i++) {
    parts.push(prep(new THREE.CylinderGeometry(0.31, 0.35, 0.1, 10).translate(laneX(i), SHELF + 0.05, HEN_Z), C.straw, C.strawDeep, (x, y) => (SHELF + 0.1 - y) / 0.1));
    parts.push(prep(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 10).translate(laneX(i), SHELF + 0.105, HEN_Z), C.strawDeep));
  }
  // the roof: red tiles in three rows a side, a ridge, and the gable ends closed with planks
  const rise = 0.86, run = 0.9, eave = 0.06, a = Math.atan2(rise, run), slope = Math.hypot(rise, run) + 0.16;
  for (const s of [1, -1]) for (let k = 0; k < 3; k++) {
    const u = (k + 0.5) / 3, g = new THREE.BoxGeometry(2 * W + 0.56, 0.07, slope / 3 + 0.09).rotateX(s * (a + 0.07));
    // u runs from the eave (0) up to the ridge (1)
    g.translate(0, WALL_H + 0.02 + rise * u + 0.05, s > 0 ? eave - run * u : eave - 2 * run + run * u);
    parts.push(prep(g, C.tile[k]));
  }
  parts.push(box(-W - 0.32, W + 0.32, WALL_H + rise + 0.02, WALL_H + rise + 0.15, eave - run - 0.11, eave - run + 0.11, C.ridge));
  for (const sx of [-1, 1]) {
    const x = sx * (W - 0.01), t = new THREE.BufferGeometry();
    const v = [x, WALL_H, eave, x, WALL_H, eave - 2 * run, x, WALL_H + rise, eave - run];
    if (sx < 0) v.splice(0, 9, x, WALL_H, eave - 2 * run, x, WALL_H, eave, x, WALL_H + rise, eave - run);
    t.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    t.setAttribute('normal', new THREE.Float32BufferAttribute([sx, 0, 0, sx, 0, 0, sx, 0, 0], 3));
    parts.push(prep(t, C.plank[1]));
  }
  // the four down-gutters, their knots, and a spout tongue that brings the egg out over Mika's hat
  const y1 = SHELF - 0.07, y0 = EGGS.spout + 0.14;
  for (let i = 0; i < EGGS.lanes; i++) {
    const x = laneX(i);
    parts.push(halfPipe(y1 - y0, PIPE_R, C.bamboo, C.bambooDeep).translate(x, (y0 + y1) / 2, PIPE_Z));
    for (let r = 0; r < EGGS.rows; r++) parts.push(halfPipe(0.05, PIPE_R * 1.1, C.node, C.bambooDeep).translate(x, rungY(r) + EGGS.rowH / 2, PIPE_Z));
    const dy = y0 - (EGGS.spout - 0.1), dz = HZ + 0.04 - PIPE_Z, L = Math.hypot(dy, dz);
    parts.push(halfPipe(L, PIPE_R, C.bamboo, C.bambooDeep).rotateX(-Math.atan2(dz, dy)).translate(x, y0 - dy / 2, PIPE_Z + dz / 2));
  }
  // the basket on its crate, at the corner of the house
  const bx = BASKET.x, bz = BASKET.z;
  parts.push(box(bx - 0.36, bx + 0.36, 0, BASKET.y, bz - 0.34, bz + 0.34, C.crate));
  for (const y of [0.1, 0.3]) parts.push(box(bx - 0.38, bx + 0.38, y, y + 0.07, bz - 0.36, bz + 0.36, C.crateDark));
  const P = (r, y) => new THREE.Vector2(r, y);
  parts.push(prep(new THREE.LatheGeometry([P(0.001, 0.02), P(0.27, 0.02), P(0.3, 0.1), P(0.33, 0.19), P(0.36, 0.28), P(0.39, 0.34), P(0.35, 0.34), P(0.3, 0.14), P(0.001, 0.12)], 14)
    .translate(bx, BASKET.y, bz), C.weave[0], C.weave[1], (x, y) => (Math.floor((y - BASKET.y) / 0.085) % 2 ? 1 : 0)));
  parts.push(prep(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 12).translate(bx, BASKET.y + 0.15, bz), C.straw));
  const g = mergeGeometries(parts);
  parts.forEach(q => q.dispose());
  return g;
}

// ---------------------------------------------------------------------------------------------------- the henhouse
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
let SET = null, sceneryOn = false, roundOn = false;

/** Build the henhouse (once): it stays until Mika has walked away from it. */
function ensureSet(game) {
  if (SET) return SET;
  const world = game.world, group = new THREE.Group();
  group.name = 'henhouse';
  const ground = world.heightAt(HOUSE.x, HOUSE.z + MZ);
  group.position.set(HOUSE.x, ground, HOUSE.z);
  const owned = [], keep = o => (owned.push(o), o);
  const shadows = world.quality?.propShadows !== false;
  const mat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }));
  const house = new THREE.Mesh(keep(houseGeometry()), mat);
  house.castShadow = shadows; house.receiveShadow = true;
  group.add(house);
  const rungs = new THREE.InstancedMesh(keep(rungGeometry()), mat, MAX_RUNGS);
  rungs.castShadow = false; rungs.frustumCulled = false;
  group.add(rungs);
  // slots: where each rung instance is drawn { on, x, y, z, tilt, spin, scale }
  const slots = Array.from({ length: MAX_RUNGS }, () => ({ on: false, x: 0, y: 0, z: RUNG_Z, tilt: 0, spin: 0, scale: 0, row: -1, col: -1 }));
  const drawRungs = () => {
    for (let i = 0; i < MAX_RUNGS; i++) {
      const s = slots[i];
      if (!s.on || s.scale <= 0.001) { rungs.setMatrixAt(i, ZERO); continue; }
      _m.compose(_p.set(s.x, s.y, s.z), _q.setFromEuler(_e.set(0, 0, s.tilt + s.spin)), _s.setScalar(s.scale));
      rungs.setMatrixAt(i, _m);
    }
    rungs.instanceMatrix.needsUpdate = true;
  };
  const place = (s, r) => { s.on = true; s.row = r.row; s.col = r.col; s.x = (laneX(r.col) + laneX(r.col + 1)) / 2; s.y = rungY(r.row); s.z = RUNG_Z; s.tilt = 0; s.spin = 0; s.scale = 1; };
  /** The board the henhouse shows when nobody is playing. */
  const showIdle = () => {
    const b = makeBoard(rng(7), 3);
    slots.forEach((s, i) => { s.on = false; if (b.rungs[i]) place(s, b.rungs[i]); });
    drawRungs();
  };
  showIdle();
  // the hens: four of the valley's chickens on their nests
  const hens = [];
  for (let i = 0; i < EGGS.lanes; i++) {
    const m = game.assets.clone('chicken');
    if (!m) break;
    // a hen is seven small skinned parts: drawn as one (the merged geometry is shared, the palette material is hers)
    try { const body = mergeSkinnedParts(m, 'chicken'); if (body) keep(body.material); } catch (e) { console.warn('[eggs] hens left unmerged', e); }
    fit(m, 0.68);
    const base = m.scale.x;
    m.position.set(laneX(i), SHELF + 0.06, HEN_Z);
    m.rotation.y = [0.3, -0.2, 0.15, -0.35][i];
    m.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; } });
    group.add(m);
    const anim = m.userData.clips?.length ? new Animator(m) : null;
    anim?.play('Idle');
    anim?.update(i * 0.37);
    hens.push({ root: m, anim, base, yaw: m.rotation.y, flap: false, hop: 0 });
  }
  const grass = trampleGrass(world, HOUSE.x + 0.3, HOUSE.z + 0.8, 2.5);
  const solid = game.colliders?.box?.(HOUSE.x, HOUSE.z - HOUSE.depth / 2, HOUSE.halfWidth + 0.05, HOUSE.depth / 2 + 0.05, 0, ground - 1, ground + 5, { id: 'henhouse' });
  const crate = game.colliders?.box?.(HOUSE.x + BASKET.x, HOUSE.z + BASKET.z, 0.38, 0.36, 0, ground - 1, ground + 1, { id: 'henhouse' });
  game.scene.add(group);
  let t = 0;
  SET = { group, ground, mat, slots, drawRungs, place, showIdle, hens,
    /** The hens breathe and look about while Mika is close enough to see them do it. */
    idle(dt, player) {
      t += dt;
      const dx = player.pos.x - HOUSE.x, dz = player.pos.z - HOUSE.z, near = dx * dx + dz * dz < 45 * 45;
      for (const h of hens) { if (h.root.visible !== near) h.root.visible = near; if (near) h.anim?.update(dt); }
    },
    dispose() {
      group.removeFromParent();
      for (const h of hens) { h.anim?.mixer.stopAllAction(); disposeRigs(h.root); }
      rungs.dispose();
      owned.forEach(o => o.dispose?.());
      grass?.();
      if (solid) game.colliders.remove(solid);
      if (crate) game.colliders.remove(crate);
    } };
  return SET;
}
function dropSet() { if (SET && !sceneryOn && !roundOn) { SET.dispose(); SET = null; } }

// ---------------------------------------------------------------------------------------------------- Mika
/**
 * Take over Mika's body for the round: her update only places and animates her (pose, facing, a few bones bent after
 * the mixer so she holds the hat out). The returned function puts everything back.
 */
function takeBody(player, afterPose) {
  const fields = ['facing', 'swimming', 'pitch', 'speed', 'grounded', 'locked', 'pose', 'poseSpeed'];
  const had = new Map(['update', ...fields].map(k => [k, Object.getOwnPropertyDescriptor(player, k)]));
  const pos = player.pos.clone(), vel = player.vel.clone();
  const rootPos = player.root.position.clone(), rootRot = player.root.rotation.clone(), pivotRot = player.pivot.rotation.clone();
  const anim = player.anim, clip = anim?.currentName, clipTime = anim?.current?.time || 0, clipSpeed = anim?.current?.timeScale || 1;
  let done = false;
  anim?.cancelOneShot?.();
  player.swimming = false; player.grounded = true; player.locked = true; player.pitch = 0; player.speed = 0; player.vel.set(0, 0, 0);
  player.update = dt => {
    player.root.position.copy(player.pos); player.root.rotation.y = player.facing;
    player.pivot.rotation.x = 0;
    anim?.play(player.pose || 'Idle', { speed: player.poseSpeed ?? 1, fade: 0.12 }); anim?.update(dt);
    afterPose?.(dt);
  };
  return () => {
    if (done) return;
    done = true;
    player.pos.copy(pos); player.vel.copy(vel);
    player.root.position.copy(rootPos); player.root.rotation.copy(rootRot); player.pivot.rotation.copy(pivotRot);
    for (const [k, d] of had) { if (d) Object.defineProperty(player, k, d); else delete player[k]; }
    if (clip) anim?.snap?.(clip, { speed: clipSpeed, time: clipTime });
  };
}

// ---------------------------------------------------------------------------------------------------- sounds
const cluck = (a, pitch = 1, vol = 1) => {
  if (!a?.tone) return;
  a.tone(560 * pitch, { type: 'square', dur: 0.07, vol: 0.045 * vol, glide: 1.45, filter: 2100, rev: 0.1 });
  a.tone(600 * pitch, { type: 'square', dur: 0.07, vol: 0.045 * vol, glide: 1.45, filter: 2100, rev: 0.1, when: 0.13 });
  a.tone(760 * pitch, { type: 'square', dur: 0.16, vol: 0.05 * vol, glide: 0.72, filter: 2300, rev: 0.12, when: 0.27 });
};
const pop = (a, f = 720) => { a?.tone?.(f, { type: 'triangle', dur: 0.1, vol: 0.09, rev: 0.15 }); a?.tone?.(f * 1.5, { type: 'triangle', dur: 0.14, vol: 0.07, rev: 0.2, when: 0.06 }); };
const tock = (a, f = 420) => { a?.tone?.(f, { type: 'triangle', dur: 0.07, vol: 0.07, rev: 0.05 }); a?.noise?.({ dur: 0.04, vol: 0.05, freq: 2200 }); };

// ---------------------------------------------------------------------------------------------------- the round
const HAT_PILE = [[0, 0.02, 0.12], [-0.11, 0.02, -0.06], [0.11, 0.02, -0.06], [0.1, 0.19, 0.06], [-0.1, 0.19, 0.06], [0, 0.19, -0.11], [0.06, 0.36, 0], [-0.07, 0.36, 0.02]];
const BASKET_PILE = [[0, 0.3, 0], [0.2, 0.3, 0.03], [-0.2, 0.3, 0.03], [0.07, 0.3, 0.2], [-0.1, 0.3, -0.19], [0.12, 0.46, 0.08], [-0.12, 0.46, 0.06], [0, 0.46, -0.12], [0.02, 0.46, 0.2],
  [0, 0.62, 0.04], [0.15, 0.6, -0.08], [-0.14, 0.6, -0.08]];

/** The straw hat, the eggs, the splats and the "!" marks: what a round adds to the henhouse. */
function makeProps(set) {
  const owned = [], keep = o => (owned.push(o), o), group = new THREE.Group();
  group.name = 'eggs-round';
  set.group.add(group);
  const hat = new THREE.Mesh(keep(hatGeometry()), set.mat);
  hat.castShadow = false;
  group.add(hat);
  const eggMat = keep(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 }));
  const eggs = new THREE.InstancedMesh(keep(eggGeometry()), eggMat, EGG_SLOTS);
  eggs.frustumCulled = false;
  const white = new THREE.Color(C.egg), gold = new THREE.Color(C.gold);
  for (let i = 0; i < EGG_SLOTS; i++) { eggs.setMatrixAt(i, ZERO); eggs.setColorAt(i, white); }
  group.add(eggs);
  const splats = new THREE.InstancedMesh(keep(splatGeometry()), set.mat, SPLATS);
  splats.frustumCulled = false;
  for (let i = 0; i < SPLATS; i++) splats.setMatrixAt(i, ZERO);
  group.add(splats);
  // "!" beside a hen that is about to lay: white against the red tiles, gold for a golden egg
  const bang = mergeGeometries([new THREE.BoxGeometry(0.15, 0.24, 0.08).translate(0, 0.24, 0), new THREE.SphereGeometry(0.085, 8, 6)]);
  const marks = new THREE.InstancedMesh(keep(bang), keep(new THREE.MeshBasicMaterial({ color: '#ffffff' })), EGGS.lanes);
  marks.frustumCulled = false;
  const hot = new THREE.Color('#ffffff');
  for (let i = 0; i < EGGS.lanes; i++) { marks.setMatrixAt(i, ZERO); marks.setColorAt(i, hot); }
  group.add(marks);
  // an arrow over the basket when the hat is full
  const arrow = new THREE.Mesh(keep(new THREE.ConeGeometry(0.2, 0.36, 4).rotateX(Math.PI)), keep(new THREE.MeshBasicMaterial({ color: '#ff7a1f' })));
  arrow.visible = false;
  group.add(arrow);
  return { group, hat, eggs, splats, marks, arrow, white, gold, hot,
    dispose() { group.removeFromParent(); eggs.dispose(); splats.dispose(); marks.dispose(); owned.forEach(o => o.dispose?.()); } };
}

function makeUi(first, lives) {
  addCss('eggsCss', CSS);
  const el = document.createElement('div');
  el.id = 'eggHud';
  if (first) el.className = 'first';
  el.innerHTML = `<span class="lives">${'<i></i>'.repeat(lives)}</span><span class="hat"><svg viewBox="0 0 20 14" aria-hidden="true"><path d="M1 3h18l-1 2H2z" fill="#e0b85a"/><path d="M5 5h10l-1.2 6.5H6.2z" fill="#f2d27e"/><path d="M5.4 7h9.2l-.3 1.8H5.7z" fill="#d9483b"/></svg>${'<i></i>'.repeat(EGGS.full)}</span>`;
  const pop = document.createElement('div');
  pop.id = 'eggPop';
  document.body.append(el, pop);
  document.body.classList.add('eggs-round');
  const lifeEls = [...el.querySelectorAll('.lives i')], hatEls = [...el.querySelectorAll('.hat i')], hatEl = el.querySelector('.hat');
  let broken = -1, hat = -1, full = null;
  return { el,
    set(b, h, isFull) {
      if (b !== broken) { broken = b; lifeEls.forEach((e, i) => e.classList.toggle('x', i >= lifeEls.length - b)); }
      if (h !== hat) { hat = h; hatEls.forEach((e, i) => e.classList.toggle('on', i < h)); }
      if (isFull !== full) { full = isFull; hatEl.classList.toggle('full', isFull); }
    },
    points(text, x, y, isGold) {
      pop.textContent = text;
      pop.style.left = `${Math.round(x)}px`; pop.style.top = `${Math.round(y)}px`;
      pop.className = isGold ? 'gold' : '';
      void pop.offsetWidth;                 // restart the animation
      pop.classList.add('go');
    },
    destroy() { el.remove(); pop.remove(); document.body.classList.remove('eggs-round', 'eggs-direct'); } };
}

/**
 * The camera that shows the whole board, the four hens and Mika, whatever the screen's shape. wide: the basket too.
 * (A wide screen always has room for the basket; an upright phone is as wide as the board, so there the picture
 * only opens up to the basket while the hat is full.)
 */
function fitCamera(out, wide) {
  const W = innerWidth, H = innerHeight, portrait = H > W, low = H <= 480;
  // Room kept free (px). Upright: the HUD and the egg panel above, the hint and the thumbs below. A phone on its side:
  // the HUD moves to the top left corner (CSS above), so the board takes the whole height to the right of it.
  // A desktop: the HUD above, the How to play card on the left and the hint on the right are beside the board anyway.
  const top = portrait ? 104 : low ? 6 : 100, bottom = portrait ? 132 : low ? 6 : 30, left = portrait ? 4 : low ? 226 : 0, right = portrait ? 4 : low ? 96 : 0;
  const X0 = portrait ? -2.14 : -2.22, X1 = wide || !portrait ? 2.94 : 2.14, Y0 = -0.1, Y1 = 4.9;
  const fov = portrait ? 44 : 34, t = Math.tan(fov * Math.PI / 360), bandH = H - top - bottom, bandW = W - left - right;
  const d = Math.max((Y1 - Y0) / (2 * t * bandH / H), (X1 - X0) / (2 * t * bandW / H)) * 1.03;
  // the middle of the free band is not the middle of the screen: aim a little off so the board sits in the band
  const midY = (top + bandH / 2) / H, midX = (left + bandW / 2) / W;
  out.fov = fov; out.d = d; out.w = W; out.h = H;
  out.x = (X0 + X1) / 2 - (midX - 0.5) * 2 * t * d * W / H;
  out.y = (Y0 + Y1) / 2 + (midY - 0.5) * 2 * t * d;
  return out;
}

export default {
  id: 'eggs',

  /** The henhouse itself: called by the framework while Mika is near the place, whatever the season or the hour. */
  scenery(dt, ctx) {
    if (ctx.off) { sceneryOn = false; dropSet(); return; }
    sceneryOn = true;
    const set = ensureSet(ctx.game);
    if (!roundOn) set.idle(dt, ctx.player);
  },

  async play(ctx) {
    const g = ctx.game, p = ctx.player, input = ctx.input, audio = ctx.audio, follow = g.follow;
    const saved = { fov: follow.fovBase, yaw: follow.yaw, pitch: follow.pitch, shot: follow.shot, tracking: follow.tracking, look: follow.look.clone(), pos: follow.pos.clone(),
      camPos: follow.camera.position.clone(), camRot: follow.camera.quaternion.clone(), camFov: follow.camera.fov, camNear: follow.camera.near };
    let set = null, props = null, ui = null, restore = null;
    const hidden = [], listeners = [];
    const tamo = ctx.director.tamo || null, tamoShown = !!tamo && !tamo.hidden;      // (the little star would hover in front of the board)
    const on = (target, name, fn, options) => { target.addEventListener(name, fn, options); listeners.push(() => target.removeEventListener(name, fn, options)); };
    try {
      roundOn = true;
      ctx.lock(true);
      await ctx.fade(true, 180);                // she is put under the spouts and the camera steps back: not a cut to watch
      ctx.setNight(true, 10.5);                 // a bright morning on the board, whatever the story clock says
      set = ensureSet(g);
      props = makeProps(set);
      const level = g.easy ? 'easy' : g.hard ? 'hard' : 'normal';
      const sim = new EggRound({ level, first: ctx.first, length: ctx.roundTime, rand: rng((Date.now() % 2147483000) + 1) });
      ui = makeUi(ctx.first, sim.lives);
      const X = HOUSE.x, Y = set.ground, Z = HOUSE.z, slots = set.slots, hens = set.hens;
      for (const s of slots) s.on = false;
      set.drawRungs();
      for (const h of hens) h.root.visible = true;

      // ---- Mika: she faces us, the hat held out in front of her in both hands
      const bone = n => p.model?.getObjectByName?.(n) || null;
      const B = { uaL: bone('upperarm_L'), uaR: bone('upperarm_R'), faL: bone('forearm_L'), faR: bone('forearm_R'), spine: bone('spine') };
      let lean = 0, tipLean = 0;
      restore = takeBody(p, () => {
        // (arm bones point down their own -Y: turning about X swings them forward, about Z out to the side)
        B.uaL?.rotateZ(-0.34); B.uaR?.rotateZ(0.34);
        B.uaL?.rotateX(-0.82); B.uaR?.rotateX(-0.82);
        B.faL?.rotateX(-0.5); B.faR?.rotateX(-0.5);
        if (B.spine) { B.spine.rotateZ(-tipLean * 0.3); B.spine.rotateX(0.06); }
      });
      p.facing = 0; p.pose = 'Idle'; p.poseSpeed = 1;
      p.pos.set(X + sim.mika.x, Y, Z + MZ);

      // ---- nobody wanders through the picture
      const hideNearby = () => {
        for (const o of g.scene.children) {
          if (o === set.group || o === p.root || !/^(npc:|critter:|animal:)/.test(o.name)) continue;
          if (Math.abs(o.position.x - X - 0.4) < 4.2 && o.position.z > Z - 0.5 && o.position.z < Z + 17 && !hidden.some(h => h[0] === o)) hidden.push([o, o.visible]);
        }
        for (const [o] of hidden) o.visible = false;
      };
      if (tamoShown) tamo.hide?.();

      // ---- the camera: a fixed front view
      const cam = fitCamera({}, false), camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
      let wide = false;
      const aim = () => {
        fitCamera(cam, wide);
        follow.fovBase = cam.fov;
        // a little above the middle, looking a little down: the roof shows its tiles and the hat its eggs
        camPos.set(X + cam.x, Y + cam.y + cam.d * 0.07, Z + HZ + cam.d);
        camLook.set(X + cam.x, Y + cam.y - cam.d * 0.012, Z + HZ);
      };
      aim();
      follow.track(() => camPos, () => camLook, 6);
      follow.camera.position.copy(camPos); follow.look.copy(camLook); follow.tracking.lookNow.copy(camLook); follow.camera.lookAt(camLook);
      follow.camera.fov = cam.fov; follow.camera.updateProjectionMatrix();
      input.releaseAll?.();

      // ---- a tap or a drag under a spout sends her there (the stick and the keys work as well)
      const direct = { on: false, id: -1, lane: 0, tap: -1 }, stops = new Float32Array(EGGS.lanes + 1), band = { top: 0, bottom: 0 };
      const project = (x, y, z) => { _p.set(X + x, Y + y, Z + z).project(follow.camera); return _p; };
      const measure = () => {
        for (let i = 0; i <= EGGS.lanes; i++) stops[i] = (project(i < EGGS.lanes ? laneX(i) : EGGS.basket, 1, HZ).x + 1) / 2 * innerWidth;
        band.top = (1 - project(0, SHELF + 0.7, HZ).y) / 2 * innerHeight;
        band.bottom = (1 - project(0, -0.1, HZ).y) / 2 * innerHeight + 36;
      };
      const laneAt = x => {
        let best = 0, bd = Infinity;
        for (let i = 0; i <= (sim.full ? EGGS.lanes : EGGS.lanes - 1); i++) { const d = Math.abs(stops[i] - x); if (d < bd) { bd = d; best = i; } }
        return best;
      };
      const inBand = e => { const lanePx = stops[1] - stops[0]; return e.clientY > band.top && e.clientY < band.bottom && e.clientX > stops[0] - lanePx * 0.75 && e.clientX < stops[EGGS.lanes] + lanePx * 0.75; };
      const endDirect = () => { direct.on = false; direct.id = -1; document.body.classList.remove('eggs-direct'); };
      on(window, 'pointerdown', e => {
        if (direct.on || e.target?.tagName !== 'CANVAS' || document.pointerLockElement || (e.pointerType === 'mouse' && e.button !== 0) || !inBand(e)) return;
        direct.on = true; direct.id = e.pointerId; direct.lane = direct.tap = laneAt(e.clientX);     // (tap: a touch shorter than a frame still counts)
        document.body.classList.add('eggs-direct');
      }, true);
      on(window, 'pointermove', e => { if (direct.on && e.pointerId === direct.id) direct.lane = laneAt(e.clientX); }, true);
      const up = e => { if (e.pointerId === direct.id) endDirect(); };
      on(window, 'pointerup', up, true); on(window, 'pointercancel', up, true);
      on(window, 'blur', endDirect); on(window, 'resize', endDirect);

      // ---- drawing state
      const inp = { mx: 0, lane: null };
      const pile = new Float32Array(HAT_EGGS);                                         // the drop-in bounce of each egg in the hat
      const splat = new Float32Array(SPLATS * 3);                                     // x, age, on
      let splatNext = 0, time = 0, hatKick = 0, sweep = 0, outro = 0, basketShown = -1, saidGold = false, saidMiss = false, saidCatch = false, saidRung = false;
      const said = (text, life) => ctx.hint(text, life);
      if (ctx.first) said(N_('A hen clucks and puffs before she lays. Stand under her gutter!'), 7);
      else said(N_('Follow each egg down the gutters and catch it in your hat!'), 4.5);

      const setEgg = (i, x, y, z, spin, scale) => {
        _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, 0, spin)), _s.setScalar(scale));
        props.eggs.setMatrixAt(i, _m);
      };

      const handle = ev => {
        switch (ev.type) {
          case 'warn': {
            cluck(audio, 0.9 + ev.lane * 0.07);
            hens[ev.lane]?.anim?.play('Flap', { speed: 1.6, fade: 0.1 });
            if (hens[ev.lane]) hens[ev.lane].flap = true;
            props.marks.setColorAt(ev.lane, ev.gold ? props.gold : props.hot);
            props.marks.instanceColor.needsUpdate = true;
            if (ev.gold && !saidGold) { saidGold = true; said(N_('A golden egg is coming! It counts for three.'), 4.5); audio.twinkle?.(2); }
            break;
          }
          case 'lay': {
            const h = hens[ev.lane];
            if (h) { h.flap = false; h.hop = 1; h.anim?.play('Idle', { fade: 0.2 }); }
            audio.plop?.(0.6);
            break;
          }
          case 'cross': tock(audio, 520 - ev.row * 30); break;
          case 'catch': {
            if (ev.gold) { audio.pickup?.(); } else pop(audio, 660 + Math.min(6, ev.hat) * 28);
            hatKick = 1;
            const k = Math.min(HAT_EGGS, ev.hat) - 1;
            pile[k] = 1;
            props.eggs.setColorAt(SIM_EGGS + k, ev.gold ? props.gold : props.white);
            props.eggs.instanceColor.needsUpdate = true;
            const s = project(sim.mika.x, EGGS.hatY + 0.5, HZ);
            ui.points(`+${ev.points}`, (s.x + 1) / 2 * innerWidth, (1 - s.y) / 2 * innerHeight, ev.gold);
            if (ctx.first && !saidCatch) { saidCatch = true; said(N_('Caught it! Every egg in your hat counts.'), 4); }
            break;
          }
          case 'break': {
            audio.miss?.(); audio.noise?.({ dur: 0.16, vol: 0.12, freq: 900, type: 'lowpass' });
            const o = (splatNext++ % SPLATS) * 3;
            splat[o] = ev.x; splat[o + 1] = 0; splat[o + 2] = 1;
            follow.shake = Math.max(follow.shake || 0, 0.12);
            if (!saidMiss && ev.left > 0) { saidMiss = true; said(ctx.first ? N_('Oops, a broken egg. Watch where the gutters lead it.') : N_('Oops! Read the rungs before the egg gets there.'), 4.5); }
            break;
          }
          case 'full': said(N_('The hat is full! Run to the basket on the right.'), 5); audio.chime?.(1); break;
          case 'tip': audio.whoosh?.(2); break;
          case 'banked': for (let i = 0; i < 3; i++) audio.tone?.(520 + i * 90, { type: 'triangle', dur: 0.09, vol: 0.07, when: i * 0.07 }); break;
          case 'shift': {
            // the rungs of the new board find a slot each: one that moves keeps its slot, a new one takes a free slot
            const used = new Set();
            for (const c of sim.changes) {
              let s = c.from ? slots.find(q => q.on && q.row === c.from.row && q.col === c.from.col && !used.has(q)) : null;
              if (!s && c.to) s = slots.find(q => !q.on && !used.has(q));
              if (!s) continue;
              used.add(s);
              s.on = true; s.move = c;
              s.fromX = c.from ? (laneX(c.from.col) + laneX(c.from.col + 1)) / 2 : 0; s.fromY = c.from ? rungY(c.from.row) : 0;
              if (c.to) { s.row = c.to.row; s.col = c.to.col; } else { s.row = -1; s.col = -1; }
            }
            tock(audio, 300);
            if (ctx.first && !saidRung && sim.board.rungs.length) { saidRung = true; said(N_('A rung! The egg takes every rung it meets. Follow it with your eyes.'), 7.5); }
            break;
          }
          case 'time': if (sim.busy) said(N_('Time is up! Catch the last eggs.'), 3); break;
          case 'over':
            outro = sim.reason === 'broken' ? 1.5 : 1.3;
            if (sim.reason !== 'broken') { for (const h of hens) h.anim?.play('Flap', { speed: 1.3, fade: 0.1 }); cluck(audio, 1.1); }
            break;
          default: break;
        }
      };

      const draw = dt => {
        time += dt;
        const m = sim.mika;
        // ---- rungs: moving to their new places between waves, tipping under an egg
        let moving = false;
        for (const s of slots) {
          if (!s.on) continue;
          const c = s.move;
          if (c) {
            moving = true;
            const k = smooth(sim.phase === 'shift' ? sim.shiftK : 1);
            const tx_ = c.to ? (laneX(c.to.col) + laneX(c.to.col + 1)) / 2 : s.fromX, ty = c.to ? rungY(c.to.row) : s.fromY;
            if (c.from && c.to) { s.x = lerp(s.fromX, tx_, k); s.y = lerp(s.fromY, ty, k); s.z = RUNG_Z + Math.sin(Math.PI * k) * 0.3; s.spin = Math.PI * k; s.scale = 1; }
            else if (c.to) { s.x = tx_; s.y = ty; s.z = RUNG_Z; s.spin = (1 - k) * -1.6; s.scale = k * (1 + 0.25 * Math.sin(Math.PI * k)); }
            else { s.scale = 1 - k; s.spin = k * 1.6; }
            if (sim.phase !== 'shift' || sim.shiftK >= 1) {
              s.move = null; s.spin = 0; s.z = RUNG_Z;
              if (!c.to) s.on = false; else { s.scale = 1; tock(audio, 640); }
            }
          }
          let want = 0;
          for (const e of sim.eggs) {
            if (!e.on || e.state !== 'roll') continue;
            const leg = e.path.legs[e.leg];
            if (leg.kind === 'cross' && leg.row === s.row) want = leg.to > leg.from ? -0.14 : 0.14;
          }
          if (Math.abs(want - s.tilt) > 1e-4) { s.tilt += (want - s.tilt) * Math.min(1, dt * 12); moving = true; }
        }
        if (moving) set.drawRungs();

        // ---- hens: a wiggle and a puff before she lays, a little hop as the egg drops
        for (let i = 0; i < hens.length; i++) {
          const h = hens[i], w = sim.hens[i].warn;
          h.hop = Math.max(0, h.hop - dt * 3.5);
          const puff = w > 0 ? 0.1 + 0.16 * w : 0, hop = Math.sin(Math.PI * h.hop) * 0.14;
          h.root.scale.set(h.base * (1 + puff), h.base * (1 + puff * 0.7 - (w > 0 ? 0.04 * Math.sin(time * 26) : 0)), h.base * (1 + puff));
          h.root.rotation.set(0, h.yaw + (w > 0 ? Math.sin(time * 24) * 0.22 : 0), w > 0 ? Math.sin(time * 31) * 0.09 : 0);
          h.root.position.y = SHELF + 0.06 + hop;
          h.anim?.update(dt);
          if (w > 0) { _m.compose(_p.set(laneX(i) + 0.41, SHELF + 0.3 + Math.abs(Math.sin(time * 9)) * 0.07, HEN_Z + 0.14), _q.identity(), _s.setScalar(1 + 0.25 * w)); props.marks.setMatrixAt(i, _m); }
          else props.marks.setMatrixAt(i, ZERO);
        }
        props.marks.instanceMatrix.needsUpdate = true;

        // ---- eggs in the gutters and in the air
        for (let i = 0; i < SIM_EGGS; i++) {
          const e = sim.eggs[i];
          if (!e.on) { props.eggs.setMatrixAt(i, ZERO); continue; }
          let z = PIPE_Z, y = e.y;
          if (e.state === 'roll') {
            const legs = e.path.legs, leg = legs[e.leg], u = e.s - leg.s0, v = leg.s1 - e.s;
            if (leg.kind === 'cross') {
              z = RUNG_Z;
              for (const q of slots) if (q.on && q.row === leg.row) y += Math.tan(q.tilt) * (e.x - q.x);
            } else {
              // off a rung: over its front lip, down past it in full view, then back into the gutter behind
              if (e.leg > 0 && u < 0.42) z = u < 0.07 ? lerp(RUNG_Z, RUNG_FRONT, u / 0.07) : u < 0.3 ? RUNG_FRONT : lerp(RUNG_FRONT, PIPE_Z, smooth((u - 0.3) / 0.12));
              // onto the next rung: out of the gutter into the trough in front of it; the last stretch is the spout
              if (e.leg < legs.length - 1) { if (v < 0.2) z = lerp(RUNG_Z, z, smooth(v / 0.2)); }
              else if (v < 0.34) z = lerp(HZ, z, smooth(v / 0.34));
            }
          } else if (e.state === 'fall') z = HZ;
          props.eggs.setColorAt(i, e.gold ? props.gold : props.white);
          setEgg(i, e.x, y, z, e.s * 5 + (e.state === 'fall' ? time * 6 : 0), e.gold ? 1.06 + 0.07 * Math.sin(time * 12) : 1);
        }

        // ---- Mika, the hat and what is in it
        const run = m.moving;
        lean += ((run ? m.dir : 0) - lean) * Math.min(1, dt * 14);
        tipLean += ((sim.tipT > 0 ? 1 : 0) - tipLean) * Math.min(1, dt * 12);
        p.pos.set(X + m.x, Y, Z + MZ);
        p.facing = lean * 0.75 + tipLean * 0.5; p.pose = run ? 'Run' : 'Idle'; p.poseSpeed = run ? 1.3 : 1; p.speed = run ? EGGS.mika : 0;
        hatKick = Math.max(0, hatKick - dt * 5);
        const hx = m.x + lean * 0.05 + tipLean * 0.22, hy = EGGS.hatY - 0.06 * Math.sin(Math.PI * hatKick) + (run ? Math.abs(Math.sin(time * 16)) * 0.02 : 0), tilt = -tipLean * 0.95;
        props.hat.position.set(hx, hy, HZ);
        props.hat.rotation.set(0.1, 0, tilt);
        props.hat.scale.set(1 + 0.08 * Math.sin(Math.PI * hatKick), 1 - 0.1 * Math.sin(Math.PI * hatKick), 1 + 0.08 * Math.sin(Math.PI * hatKick));
        const tipping = sim.tipT > 0, tipK = tipping ? 1 - sim.tipT / EGGS.tip : 0, shown = Math.min(HAT_EGGS, sim.hat);
        for (let k = 0; k < HAT_EGGS; k++) {
          const i = SIM_EGGS + k;
          if (k >= shown) { props.eggs.setMatrixAt(i, ZERO); continue; }
          pile[k] = Math.max(0, pile[k] - dt * 4);
          const o = HAT_PILE[k];
          let ex = hx + o[0], ey = hy - 0.1 + o[1] + pile[k] * pile[k] * 0.22, ez = HZ + o[2];
          if (tipping) {
            // one after another they tumble out of the hat into the basket
            const u = clamp(tipK * 1.7 - (shown - 1 - k) * 0.09, 0, 1), b = BASKET_PILE[k % BASKET_PILE.length];
            if (u >= 1) { props.eggs.setMatrixAt(i, ZERO); continue; }
            ex = lerp(ex, BASKET.x + b[0] * 0.5, u); ey = lerp(ey, BASKET.y + 0.4, u) + Math.sin(Math.PI * u) * 0.22; ez = lerp(ez, BASKET.z, u);
          }
          setEgg(i, ex, ey, ez, k * 1.3 + (tipping ? tipK * 5 : 0), 0.8);
        }
        const inBasket = Math.min(BASKET_EGGS, sim.basket);
        if (inBasket !== basketShown) {
          basketShown = inBasket;
          for (let k = 0; k < BASKET_EGGS; k++) {
            const i = SIM_EGGS + HAT_EGGS + k, b = BASKET_PILE[k];
            if (k >= inBasket) { props.eggs.setMatrixAt(i, ZERO); continue; }
            props.eggs.setColorAt(i, props.white);
            setEgg(i, BASKET.x + b[0], BASKET.y + b[1], BASKET.z + b[2], k * 2.1, 0.8);
          }
        }
        props.eggs.instanceMatrix.needsUpdate = true;
        if (props.eggs.instanceColor) props.eggs.instanceColor.needsUpdate = true;
        props.arrow.visible = sim.full && !tipping;
        if (props.arrow.visible) props.arrow.position.set(BASKET.x, BASKET.y + 1.25 + Math.abs(Math.sin(time * 6)) * 0.16, BASKET.z);

        // ---- splats: they spread, lie a while, then dry up
        for (let k = 0; k < SPLATS; k++) {
          const o = k * 3;
          if (!splat[o + 2]) continue;
          const age = (splat[o + 1] += dt), sc = age < 0.18 ? 0.3 + 0.7 * (age / 0.18) : age > 7 ? Math.max(0, 1 - (age - 7) / 0.6) : 1;
          if (age > 7.6) { splat[o + 2] = 0; props.splats.setMatrixAt(k, ZERO); continue; }
          _m.compose(_p.set(splat[o], 0.03 + k * 0.004, HZ), _q.setFromEuler(_e.set(0, k * 1.9, 0)), _s.set(sc, 1, sc));
          props.splats.setMatrixAt(k, _m);
        }
        props.splats.instanceMatrix.needsUpdate = true;
        ui.set(sim.broken, Math.min(EGGS.full, sim.hat), sim.full);
      };

      const result = () => {
        const r = sim.result();
        return { score: r.score, note: tx('{caught} caught · {golden} golden · {broken} broken', { caught: r.caught, golden: r.golden, broken: r.broken }), detail: r };
      };

      // lane: a test may say where she should go (0..3, 4 the basket), as a tap under that spout would
      ctx.debug = { sim, HOUSE, stops, band, slots, get cam() { return cam; }, get outro() { return outro; }, fail: false, lane: null,
        /** Screen position (px) under a stop, for a test's tap: 0..3 the spouts, 4 the basket. */
        tapAt(i) { measure(); return { x: stops[i], y: (band.top + band.bottom) / 2 }; } };

      const frame = dt => {
        if (ctx.quit) return { score: 0, quit: true };
        if (ctx.debug.fail) throw new Error('eggs: test failure');
        dt = Math.min(0.1, Math.max(0, dt));
        const open = sim.full || sim.tipT > 0 || sim.mika.x > laneX(EGGS.lanes - 1) + 0.05;
        if (cam.w !== innerWidth || cam.h !== innerHeight || open !== wide) { wide = open; aim(); }
        measure();
        if ((sweep -= dt) <= 0) { sweep = 0.5; hideNearby(); }
        if (outro > 0) {
          outro -= dt;
          draw(dt);
          ctx.hud(sim.score, sim.left);
          return outro <= 0 ? result() : undefined;
        }
        inp.mx = direct.on ? 0 : input.move?.x || 0;
        inp.lane = direct.on ? direct.lane : direct.tap >= 0 ? direct.tap : ctx.debug.lane;
        direct.tap = -1;
        const events = sim.step(dt, inp);
        for (let i = 0; i < events.length; i++) handle(events[i]);
        draw(dt);
        ctx.hud(sim.score, sim.left);
        return undefined;
      };
      frame(0);
      ctx.fade(false, 320);
      return await ctx.loop(frame);
    } finally {
      listeners.forEach(f => f());
      ui?.destroy();
      restore?.();
      props?.dispose();
      if (set) {
        for (const h of set.hens) { h.root.scale.setScalar(h.base); h.root.rotation.set(0, h.yaw, 0); h.root.position.y = SHELF + 0.06; h.flap = false; h.anim?.play('Idle'); }
        for (const s of set.slots) { s.move = null; s.tilt = 0; s.spin = 0; }
        set.showIdle();
      }
      for (const [o, visible] of hidden) o.visible = visible;
      if (tamoShown) tamo.show?.();
      follow.fovBase = saved.fov; follow.yaw = saved.yaw; follow.pitch = saved.pitch; follow.shot = saved.shot; follow.tracking = saved.tracking;
      follow.look.copy(saved.look); follow.pos.copy(saved.pos); follow.camera.position.copy(saved.camPos); follow.camera.quaternion.copy(saved.camRot);
      follow.camera.fov = saved.camFov; follow.camera.near = saved.camNear; follow.camera.updateProjectionMatrix();
      ctx.setNight(false);
      ctx.fade(false, 0);                       // (a round that failed before its first frame must not leave the screen dark)
      ctx.lock(false); input.releaseAll?.();
      roundOn = false;
      dropSet();
    }
  },
};
