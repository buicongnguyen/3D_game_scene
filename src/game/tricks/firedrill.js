// Fire drill: fire-extinguisher practice on the lawn in Kawabe, led by a grown-up (Grandma; the stationmaster in Classic).
// A practice ground is set out for the round: metal trays with small practice fires, a stand with extinguishers, a wind
// sock, an arrow to the way out and four cones. It teaches what a school fire drill teaches:
//   * first of all shout "Fire!" and tell a grown-up: getting away is a child's whole job at a real fire (said at the
//     start, by the grown-up after the shout, at the end and on the results card);
//   * then PASS: Pull the pin, Aim at the base of the fire, Squeeze the handle, Sweep from side to side;
//   * stand 2-3 m away (the ring on the ground), with the wind at your back (the wind sock) and your back to the way out.
// The rules are pure (rules-firedrill.js: the fire as a row of cells, the stance, the gauge, the re-flare, the spread, the
// choice of extinguisher, the score); this file draws them and reads the buttons:
//   {act} (E / "Do it" / pad X): shout; take an extinguisher at the stand; squeeze (held) once she stands at a tray;
//   jump  (Space / the round button / pad A): stand at the tray and pull the pin; again: step back and walk;
//   move  (WASD / stick): walk; once she stands at a tray it moves the nozzle (down: to the base; left-right: sweep).
// Cheap: no model files. Every prop is one merged mesh with vertex colours; the fires are tricks/fire-fx.js (a draw call
// each), the powder, steam and smoke come from the shared particle pools, the firelight from the shared LightPool.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { tx, N_ } from '../../i18n/i18n.js';
import { rng } from '../../engine/spline.js';
import { Animator } from '../../actors/animator.js';
import { addCss, disposeRigs, trampleGrass } from './util.js';
import { makeFire } from './fire-fx.js';
import { Drill, AIM, CELL, STAND, PASS, FUEL } from './rules-firedrill.js';

const V = () => new THREE.Vector3();
const _v = V(), _w = V(), _a = V(), _c = new THREE.Color(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = V();
const clamp01 = v => Math.max(0, Math.min(1, v));
const WHITE = [0.97, 0.97, 0.95], STEAM = [0.86, 0.93, 1], GREY = [0.62, 0.62, 0.6], DARK = [0.2, 0.19, 0.18], SPARK = [1, 0.7, 0.2];
const O = { life: 1, size: 0.3, color: WHITE, alpha: 0.8, gravity: 0, drag: 0, grow: 0 };   // one options record for every particle (nothing is made per frame)
const TRAY_GAP = 3.3;
const FIRE = { small: { size: 0.72, h: 0.95, r: 0.72 }, medium: { size: 0.9, h: 1.2, r: 0.86 }, big: { size: 1.12, h: 1.5, r: 1.0 } };
const SPRAY_POSE = 'Point';        // (not 'Aim': that clip brings her lantern into the same hand)
const CARRY_ROT = [Math.PI, 0, 0], SPRAY_ROT = [Math.PI, 0, 0];   // on her grip bone: as she walks, as she sprays
const BODY = { powder: '#e23a2c', water: '#3b8fe0' };

// what the grown-up says when a step goes wrong: always with the reason
const WHY = {
  noshout: N_('Wait: first shout "Fire!" so that everyone knows. Then the extinguisher.'),
  nopin: N_('The handle will not move: the pin is still in. Stand in the ring and pull it out first.'),
  high: N_('Aim low! The spray must hit the base of the fire, where it burns. Up in the flames it does nothing.'),
  still: N_('Sweep from side to side, so that the whole base is covered.'),
  early: N_('It flared up again! Keep sweeping a moment after the flames are down.'),
  close: N_('Too close: it is hot there. Stand in the ring, two or three steps back.'),
  tooclose: N_('Too close: it is hot there. Stand in the ring, two or three steps back.'),
  far: N_('Too far: the spray falls short. Come into the ring.'),
  toofar: N_('Go nearer: stand in the ring round the burning tray.'),
  downwind: N_('The wind blows the spray back at you. Stand with the wind at your back: look at the wind sock.'),
  exit: N_('Keep your back to the way out, so that you can always get away.'),
  'water-oil': N_('Stop! Never water on burning oil: it splashes and flares up. Take the powder one.'),
  'powder-soft': N_('Powder works here, but water is better: it soaks paper and straw, so they cannot flare up again.'),
  none: N_('Take an extinguisher from the stand first.'),
  stand: N_('Stand in the ring at the tray first, then squeeze.'),
};
const STEP_NAME = { pull: N_('Pull'), aim: N_('Aim'), squeeze: N_('Squeeze'), sweep: N_('Sweep') };
const JUMP = { pull: N_('Pull pin'), stand: N_('Stand'), back: N_('Step back') };   // what a phone's round button does now
const KIND_NAME = { powder: N_('Powder'), water: N_('Water') };

// the four pictures of PASS (24 x 24): a pin drawn out, a nozzle on the foot of a flame, a hand on the lever, a sweep
const INK = '#5a3a22', RED = '#e23a2c';
const FLAME = 'M12 3c1 3.5 5 5 5 10a5 5 0 0 1-10 0c0-2.5 1.6-3.4 2.4-5.8.8.9.9 1.7 1.6 2.6.8-1.8.9-4 1-6.8z';
const STEP_PIC = {
  pull: `<rect x="3" y="9" width="9" height="11" rx="2" fill="${RED}"/><rect x="5" y="5" width="5" height="4" fill="${INK}"/><circle class="pin" cx="17" cy="7" r="3.2" fill="none" stroke="#f2a51a" stroke-width="2"/><path class="pin" d="M10 7h4" stroke="#f2a51a" stroke-width="2" stroke-linecap="round"/>`,
  aim: `<path d="${FLAME}" fill="#ff9a1c" transform="translate(0 -2)"/><path d="M4 20h16" stroke="${INK}" stroke-width="2" stroke-linecap="round"/><circle class="tg" cx="12" cy="18" r="4" fill="none" stroke="#2f9a44" stroke-width="2"/>`,
  squeeze: `<path d="M4 9h13l3 3" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/><path class="lv" d="M4 15h12" stroke="${RED}" stroke-width="2.6" stroke-linecap="round"/><path d="M9 19v-2m3 2v-2m3 2v-2" stroke="#9aa7b0" stroke-width="1.6" stroke-linecap="round"/>`,
  sweep: `<path d="${FLAME}" fill="#ff9a1c" transform="translate(0 -3) scale(1 .9)"/><path d="M3 20h18m-18 0 3-3m-3 3 3 3m15-3-3-3m3 3-3 3" fill="none" stroke="#2f9a44" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
};

const CSS = `
#fdUi{position:fixed;left:50%;top:calc(70px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:16;display:flex;gap:10px;align-items:center;
 padding:5px 12px 5px 8px;border-radius:999px;background:rgba(255,247,232,.94);box-shadow:0 4px 14px rgba(40,20,0,.22);font:700 13px Nunito,system-ui,sans-serif;color:#5a3a22;
 zoom:var(--ui-scale,1);pointer-events:none;white-space:nowrap}
#fdUi .ext{display:flex;gap:6px;align-items:center}
#fdUi .can{width:14px;height:22px;border-radius:5px 5px 3px 3px;background:#cfc6b8;box-shadow:inset 0 0 0 1.5px rgba(90,58,34,.35);position:relative}
#fdUi .can:before{content:"";position:absolute;left:3px;top:-4px;width:8px;height:4px;border-radius:2px 2px 0 0;background:#5a3a22}
#fdUi .can.powder{background:#e23a2c}#fdUi .can.water{background:#3b8fe0}
#fdUi .bar{position:relative;width:84px;height:12px;border-radius:6px;background:#e6d3b0;box-shadow:inset 0 0 0 1.5px rgba(90,58,34,.28);overflow:hidden}
#fdUi .bar b{position:absolute;left:0;top:0;bottom:0;width:100%;border-radius:6px;background:#3fae4a;transition:width .12s linear}
#fdUi .bar.low b{background:#f08a3c}#fdUi .bar.out b{background:#dd3b1e}
#fdUi .kind{min-width:0;font-size:12px;color:#7a5a3a}
#fdUi .kind:empty{display:none}
#fdUi .steps{display:flex;gap:4px;align-items:center}
#fdUi .steps span{position:relative;width:30px;height:30px;border-radius:50%;background:#fdeccb;box-shadow:inset 0 0 0 1.5px rgba(90,58,34,.18);display:block;transition:transform .15s}
#fdUi .steps svg{position:absolute;inset:3px;width:24px;height:24px}
#fdUi .steps span.on{background:#fff;box-shadow:0 0 0 3px #f08a3c;transform:scale(1.14);animation:fdPulse 1s ease-in-out infinite}
#fdUi .steps span.ok{background:#dff3d8;box-shadow:inset 0 0 0 1.5px #3fae4a}
#fdUi .steps span.ok:after{content:"✓";position:absolute;right:-3px;bottom:-4px;width:14px;height:14px;border-radius:50%;background:#3fae4a;color:#fff;font:700 10px/14px Nunito,sans-serif;text-align:center}
#fdUi .name{font:600 15px Fredoka,Nunito,sans-serif;color:#c2541c;min-width:0}
#fdUi .name:empty{display:none}
#fdUi .on .pin{animation:fdPin 1s ease-in-out infinite}
#fdUi .on .tg{animation:fdAim 1.2s ease-in-out infinite}
#fdUi .on .lv{animation:fdSq .8s ease-in-out infinite alternate}
@keyframes fdPulse{50%{box-shadow:0 0 0 5px rgba(240,138,60,.45)}}
@keyframes fdPin{0%,30%{transform:none}70%,100%{transform:translateX(3px)}}
@keyframes fdAim{0%,20%{transform:translateY(-12px)}70%,100%{transform:none}}
@keyframes fdSq{from{transform:none}to{transform:translateY(-4px)}}
@media (max-width:520px){#fdUi{left:calc(10px + env(safe-area-inset-left,0px));transform:none;gap:6px;padding:4px 9px 4px 7px}#fdUi .bar{width:46px}#fdUi .steps span{width:26px;height:26px}#fdUi .steps svg{inset:2px;width:22px;height:22px}#fdUi .name,#fdUi .kind{display:none}}
#fdWarn{position:fixed;left:50%;top:73%;transform:translate(-50%,-50%);z-index:17;width:min(330px,74vw);padding:12px 14px;border-radius:20px;background:#fff8ea;
 box-shadow:0 10px 30px rgba(40,10,0,.35),0 0 0 4px #e23a2c;font:700 14px Nunito,system-ui,sans-serif;color:#4a3020;text-align:center;zoom:var(--ui-scale,1);pointer-events:none}
#fdWarn svg{width:150px;height:84px;display:block;margin:0 auto 4px}
#fdWarn b{display:block;font:600 18px Fredoka,Nunito,sans-serif;color:#c2301c;margin-bottom:2px}
#fdWarn .dr{animation:fdDrop 1.6s ease-in infinite}
#fdWarn .fl{animation:fdFlare 1.6s ease-out infinite;transform-box:fill-box;transform-origin:50% 100%}
@keyframes fdDrop{0%{transform:translateY(-14px);opacity:1}45%{transform:translateY(8px);opacity:1}50%,100%{opacity:0}}
@keyframes fdFlare{0%,45%{transform:scale(.5)}70%{transform:scale(1.15)}100%{transform:scale(.5)}}
@media (max-width:700px){#fdWarn{top:52%;width:min(300px,66vw)}}
@media (max-height:480px){#fdWarn{top:60%;width:min(300px,50vw);padding:8px 12px}#fdWarn svg{width:110px;height:60px}}
@media (prefers-reduced-motion:reduce){#fdUi *,#fdWarn *{animation:none!important}}
`;
const WARN_PIC = `<svg viewBox="0 0 150 84" aria-hidden="true"><rect x="96" y="62" width="44" height="9" rx="3" fill="#3d4249"/><rect x="136" y="64" width="12" height="4" rx="2" fill="#3d4249"/>
<path class="fl" d="M118 6c5 16 20 22 20 40a20 16 0 0 1-40 0c0-10 6-14 9-23 3 4 4 7 6 10 3-7 4-16 5-27z" fill="#ff8a16"/><path class="fl" d="M118 30c3 9 10 12 10 20a10 9 0 0 1-20 0c0-6 4-8 5-12 2 2 2 4 3 5 1-4 2-8 2-13z" fill="#ffd23a"/>
<rect x="10" y="34" width="22" height="38" rx="6" fill="#3b8fe0"/><rect x="15" y="26" width="12" height="8" fill="${INK}"/><path d="M32 40h12" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
<path class="dr" d="M62 40c4 6 6 9 6 12a6 6 0 0 1-12 0c0-3 2-6 6-12z" fill="#57b7e8"/>
<path d="M48 22 84 70M84 22 48 70" stroke="#e23a2c" stroke-width="7" stroke-linecap="round"/></svg>`;

/** One mesh out of coloured parts: [geometry, colour, x, y, z, rx, ry, rz, sx, sy, sz]. The parts are thrown away. */
function build(parts) {
  const list = parts.map(([geo, col, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1]) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.deleteAttribute('uv');
    g.applyMatrix4(_m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)));
    _c.set(col);
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = _c.r; c[i * 3 + 1] = _c.g; c[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    geo.dispose();
    return g;
  });
  const out = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  out.computeVertexNormals();
  return out;
}
const cyl = (rt, rb, h, n = 10, open = false) => new THREE.CylinderGeometry(rt, rb, h, n, 1, open);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);

/** An extinguisher, hanging from its carry handle (the origin): the body below, the nozzle on its short hose to +z. */
function extinguisherGeo(kind) {
  const body = BODY[kind], black = '#2a2a2e', band = kind === 'water' ? '#ffffff' : '#ffd95a';
  const hose = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.062, 0.02), new THREE.Vector3(0, -0.05, 0.085), new THREE.Vector3(0, -0.1, 0.125), new THREE.Vector3(0, -0.17, 0.118)]), 7, 0.012, 5);
  return build([
    [box(0.034, 0.014, 0.13), black, 0, 0, 0.022, -0.1],                      // the carry handle
    [box(0.03, 0.012, 0.12), body, 0, -0.03, 0.03, 0.22],                     // the lever she squeezes
    [cyl(0.024, 0.026, 0.06, 8), '#55585e', 0, -0.062, 0],                    // the valve
    [cyl(0.021, 0.021, 0.014, 10), '#f4f4f0', -0.032, -0.062, 0, 0, 0, Math.PI / 2],   // the gauge
    [cyl(0.008, 0.008, 0.016, 6), '#3fae4a', -0.036, -0.058, 0, 0, 0, Math.PI / 2],
    [new THREE.SphereGeometry(0.074, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), body, 0, -0.105, 0, 0, 0, 0, 1, 0.6, 1],
    [cyl(0.074, 0.074, 0.25, 12), body, 0, -0.23, 0],
    [cyl(0.0765, 0.0765, 0.075, 12), band, 0, -0.215, 0],
    [cyl(0.078, 0.078, 0.024, 12), black, 0, -0.366, 0],
    [hose, black],
    [cyl(0.02, 0.013, 0.05, 7), black, 0, -0.2, 0.116],                       // the nozzle
  ]);
}

class DrillRound {
  constructor(ctx, seed) {
    this.ctx = ctx;
    const g = this.g = ctx.game;
    this.player = ctx.player || g.player;
    this.scene = g.scene;
    this.added = [];
    this.own = [];
    this.seed = seed;
    this.rand = rng(seed);
    this.game = new Drill({ level: ctx.level, first: !!ctx.first, rand: this.rand });
    this.plan = this.game.plan;
    this.mode = 'walk';         // 'walk' | 'plant' | 'done'
    this.t = 0;
    this.ax = 0; this.ay = AIM.start;
    this.jumpAsk = false;
    this.flick = 1;
    this.I = 0;
    this.acc = 0; this.acc2 = 0;
    this.told = '';             // the step whose prompt is up
    this.promptT = 0;
    this.quiet = 0;             // seconds a correction keeps the step prompts away
    this.warnT = 0;
    this.shoutT = 0;
    this.endT = 0;
    this.near = '';             // the extinguisher she could take now
    this.ui = null;
    this.windYaw = 0; this.sockYaw = 0; this.sockDroop = -1.3;
    this.windDir = V();
    this.touch = !!ctx.ui?.touch;
  }

  add(o, parent = this.scene) { parent.add(o); if (parent === this.scene) this.added.push(o); return o; }
  keep(x) { this.own.push(x); return x; }
  hint(text, life) { this.ctx.hint?.(text, life); }
  /** A prop: one merged mesh in the round's own vertex-colour material. */
  prop(geo, parent, mat = this.mats.prop) { const m = new THREE.Mesh(this.keep(geo), mat); m.castShadow = true; m.receiveShadow = true; return this.add(m, parent); }

  /** What the two buttons are called on the device in use. */
  jumpKey() { return this.touch ? `“${tx(this.game.ext[this.game.held || 'powder'].pin ? JUMP.stand : JUMP.pull)}”` : this.g.input?.lastDevice === 'gamepad' ? 'A' : 'Space'; }

  // ------------------------------------------------------------ the ground
  build() {
    const g = this.g, ctx = this.ctx, heightAt = (x, z) => g.world.heightAt(x, z), P = this.plan, t = ctx.trick;
    // the ground lies behind the sign as Mika comes to it: `f` points from the way out to the trays, `r` to her right
    const face = t.place.face ?? 0, f = this.f = V().set(-Math.sin(face), 0, -Math.cos(face)), r = this.r = V().set(-f.z, 0, f.x);
    const at = (u, v, out = V()) => { out.set(ctx.place.x + r.x * u + f.x * v, 0, ctx.place.z + r.z * u + f.z * v); out.y = heightAt(out.x, out.z); return out; };
    this.centre = at(0, 5.2);
    this.restore = trampleGrass(g.world, this.centre.x, this.centre.z, 6.4, 9);
    this.mats = {
      prop: this.keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.05, flatShading: true })),
      ring: this.keep(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })),
      good: this.keep(new THREE.MeshBasicMaterial({ color: '#52d65c', transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })),
      way: this.keep(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })),
      aim: this.keep(new THREE.MeshBasicMaterial({ color: '#ff8a1c', transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, fog: false })),
      pin: this.keep(new THREE.MeshStandardMaterial({ color: '#ffc21a', roughness: 0.5 })),
      cover: this.keep(new THREE.MeshBasicMaterial({ color: '#f4f2ea', transparent: true, opacity: 0, depthWrite: false })),
      sock: this.keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide, flatShading: true })),
    };
    this.geo = {
      ring: this.keep(new THREE.RingGeometry(STAND.near, STAND.far, 44).rotateX(-Math.PI / 2)),
      good: this.keep(new THREE.RingGeometry(STAND.near, STAND.far, 14, 1, -0.5, 1).rotateX(-Math.PI / 2)),
      aim: this.keep(new THREE.TorusGeometry(0.17, 0.028, 6, 22)),
      dot: this.keep(new THREE.CircleGeometry(0.05, 10)),
      pin: this.keep(new THREE.TorusGeometry(0.02, 0.006, 5, 10)),
      arrow: this.keep(new THREE.ConeGeometry(0.13, 0.26, 4).rotateX(Math.PI)),
    };
    // ---- the trays, in a row across the ground, each with its fuel and its fire
    const n = this.game.fires.length;
    this.trays = this.game.fires.map((fr, i) => {
      const F = FIRE[fr.size], pos = at((i - (n - 1) / 2) * TRAY_GAP, 7.4), R = F.r;
      const root = this.add(new THREE.Group());
      root.position.copy(pos);
      root.rotation.y = Math.atan2(f.x, f.z);
      const oil = fr.fuel === 'oil';
      this.prop(build([
        [cyl(R, R * 0.86, 0.15, 14), oil ? '#34383f' : '#5b616b', 0, 0.075, 0],
        [cyl(R * 0.9, R * 0.9, 0.02, 14), oil ? '#3a2a12' : '#77706a', 0, 0.152, 0],
        ...(oil ? [[box(0.16, 0.05, 0.6), '#34383f', 0, 0.12, R + 0.25]] : [[box(0.2, 0.05, 0.08), '#3d4249', R * 0.78, 0.03, R * 0.5], [box(0.2, 0.05, 0.08), '#3d4249', -R * 0.78, 0.03, -R * 0.5]]),
      ]), root);
      // the fuel darkens as it burns (its own material)
      const fm = this.keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: oil ? 0.25 : 0.9, flatShading: !oil }));
      const rr = () => (this.rand() - 0.5);
      const fuel = fr.fuel === 'straw' ? [0, 1, 2, 3, 4, 5].map(k => [new THREE.ConeGeometry(R * (k ? 0.34 : 0.56), R * (k ? 0.22 : 0.34), 7), k % 2 ? '#d9b04c' : '#e9c865', k ? rr() * R * 1.1 : 0, 0.16 + R * (k ? 0.11 : 0.17), k ? rr() * R * 1.1 : 0, rr() * 0.3, rr() * 3, rr() * 0.3])
        : fr.fuel === 'paper' ? [0, 1, 2, 3, 4, 5].map(k => [k % 3 ? new THREE.IcosahedronGeometry(R * 0.2, 0) : box(R * 0.36, R * 0.26, R * 0.3), k % 3 ? (k % 2 ? '#efe4c6' : '#d9cba6') : '#c39a5e', rr() * R * 1.1, 0.17 + R * 0.14, rr() * R * 1.1, rr() * 2, rr() * 3, rr()])
          : [[cyl(R * 0.84, R * 0.84, 0.012, 16), '#a9741e', 0, 0.17, 0], [cyl(R * 0.3, R * 0.3, 0.006, 10), '#d9a23a', R * 0.25, 0.178, -R * 0.2]];
      const fuelMesh = this.prop(build(fuel), root, fm);
      fuelMesh.castShadow = false;
      const cover = this.add(new THREE.Mesh(this.keep(new THREE.CircleGeometry(R * 0.88, 16).rotateX(-Math.PI / 2)), this.keep(this.mats.cover.clone())), root);
      cover.position.y = 0.2 + (oil ? 0 : R * 0.1); cover.renderOrder = 3; cover.visible = false;
      const fire = this.keep(makeFire({ size: F.size, cells: fr.n, cellWidth: CELL, seed: this.seed % 89 + i * 7 + 3 }));
      fire.cells.fill(0);
      fire.object.position.set(pos.x, pos.y + 0.17, pos.z);
      fire.object.rotation.y = Math.atan2(-f.x, -f.z);                       // its row of cells lies across the ground until she stands at it
      this.add(fire.object);
      return { i, pos, R, F, root, fm, fuel: fr.fuel, cover, fire, vis: 0, char: 0, smoke: 0, yaw: Math.atan2(-f.x, -f.z), across: V().copy(r) };
    });
    // ---- the stand with the extinguishers (two powder ones; on Difficult water and powder, each under its picture)
    this.rackAt = at(3.3, 2.3);
    const rack = this.add(new THREE.Group());
    rack.position.copy(this.rackAt);
    rack.rotation.y = Math.atan2(r.x, r.z);                                   // its length runs along f; the cans face the ground's middle
    const kinds = P.choose ? ['water', 'powder'] : ['powder', 'powder'];
    const wood = '#b98a4a', woodD = '#8d6634';
    const parts = [[box(0.5, 0.07, 1.5), wood, 0, 0.4, 0], [box(0.42, 0.4, 0.08), woodD, 0, 0.2, -0.6], [box(0.42, 0.4, 0.08), woodD, 0, 0.2, 0.6]];
    kinds.forEach((k, j) => {
      const z = (j - 0.5) * 0.74;
      if (!P.choose) return;
      // a round picture on a post behind each, the same on both faces: a white drop on blue, a white cloud on red
      parts.push([box(0.045, 0.75, 0.045), woodD, -0.2, 0.8, z], [cyl(0.16, 0.16, 0.036, 14), BODY[k], -0.2, 1.24, z, 0, 0, Math.PI / 2]);
      for (const sx of [-1, 1]) {
        const x = -0.2 + sx * 0.02;
        if (k === 'water') parts.push([new THREE.SphereGeometry(0.062, 8, 6), '#ffffff', x, 1.215, z, 0, 0, 0, 0.3, 1, 1], [new THREE.ConeGeometry(0.054, 0.1, 8), '#ffffff', x, 1.29, z, 0, 0, 0, 0.3, 1, 1]);
        else for (const [dy, dz, sz] of [[-0.02, -0.055, 0.05], [0.0, 0.03, 0.064], [0.05, -0.015, 0.046]]) parts.push([new THREE.SphereGeometry(sz, 7, 5), '#ffffff', x, 1.24 + dy, z + dz, 0, 0, 0, 0.3, 1, 1]);
      }
    });
    this.prop(build(parts), rack);
    this.extGeo = { powder: this.keep(extinguisherGeo('powder')), water: P.choose ? this.keep(extinguisherGeo('water')) : null };
    const can = kind => {
      const o = new THREE.Group(), m = new THREE.Mesh(this.extGeo[kind], this.mats.prop), pin = new THREE.Mesh(this.geo.pin, this.mats.pin), noz = new THREE.Object3D();
      m.castShadow = true;
      pin.position.set(0.046, -0.05, 0); pin.rotation.y = Math.PI / 2;
      noz.position.set(0, -0.215, 0.12);
      o.add(m, pin, noz);
      o.userData.pin = pin; o.userData.noz = noz;
      return o;
    };
    this.slots = kinds.map((k, j) => {
      const o = can(k);
      o.scale.setScalar(1.1);
      o.position.set(0.04, 0.435 + 0.378 * 1.1, (j - 0.5) * 0.74);
      o.rotation.y = Math.PI / 2;
      rack.add(o);
      return { kind: k, o, at: rack.localToWorld(V().set(0.04, 0, (j - 0.5) * 0.74)) };
    });
    // the ones in her hand: on her grip bone, hanging from the carry handle (a plain place at her side without the bone)
    const p = this.player, grip = p.grip || p.model, onBone = !!p.grip && grip !== p.model;
    this.hand = {};
    this.onBone = onBone;
    for (const k of new Set(kinds)) {
      const o = this.hand[k] = can(k);
      o.scale.setScalar(1.05);
      o.visible = false;
      (onBone ? grip : p.root || p.model).add(o);
      if (onBone) o.rotation.set(Math.PI, 0, 0); else o.position.set(-0.26, 0.86, 0.12);
    }
    // ---- the way out (a green arrow board, and an arrow on the ground), the cones, the wind sock
    // the way out: a gate with a green board (a white arrow: through here), and a green arrow on the ground that points to it
    this.exitAt = at(-3.2, -1.2);
    const ex = this.add(new THREE.Group());
    ex.position.copy(this.exitAt);
    ex.rotation.y = Math.atan2(f.x, f.z);
    const green = '#2fae52';
    this.prop(build([[box(0.09, 2.5, 0.09), '#8d6634', -1.15, 1.25, 0], [box(0.09, 2.5, 0.09), '#8d6634', 1.15, 1.25, 0], [box(2.5, 0.46, 0.07), green, 0, 2.3, 0],
      [box(0.13, 0.17, 0.11), '#ffffff', 0, 2.4, 0], [new THREE.ConeGeometry(0.2, 0.2, 3), '#ffffff', 0, 2.22, 0, 0, 0, Math.PI, 1, 1, 0.28]]), ex);
    const way = this.add(new THREE.Mesh(this.keep(new THREE.ShapeGeometry(arrowShape()).rotateX(-Math.PI / 2)), this.mats.way));
    way.position.copy(at(-3.2, 0.7)).y += 0.05;
    way.rotation.y = Math.atan2(f.x, f.z);
    way.renderOrder = 2;
    const coneParts = [];
    for (const [u, v] of [[-5.4, 0.9], [5.4, 0.9], [-5.4, 10.2], [5.4, 10.2]]) {
      const q = at(u, v, _a);
      coneParts.push([new THREE.ConeGeometry(0.17, 0.52, 8), '#f2761e', q.x, q.y + 0.28, q.z], [cyl(0.105, 0.135, 0.1, 8), '#ffffff', q.x, q.y + 0.27, q.z], [box(0.42, 0.04, 0.42), '#f2761e', q.x, q.y + 0.02, q.z]);
    }
    this.prop(build(coneParts));
    const sockAt = at(4.9, 10.0);
    const pole = this.add(new THREE.Group());
    pole.position.copy(sockAt);
    this.prop(build([[cyl(0.035, 0.045, 3.3, 7), '#d9d4c8', 0, 1.65, 0], [cyl(0.07, 0.07, 0.05, 8), '#8a8f97', 0, 3.3, 0]]), pole);
    this.sock = new THREE.Group();
    this.sock.position.set(0, 3.2, 0);
    const sg = new THREE.CylinderGeometry(0.2, 0.08, 1.25, 9, 5, true).rotateZ(Math.PI / 2).translate(0.66, 0, 0).toNonIndexed();
    sg.deleteAttribute('uv');
    const sp = sg.attributes.position, sc = new Float32Array(sp.count * 3);
    for (let i = 0; i < sp.count; i += 3) {
      // stripes: every triangle takes the colour of the band its middle lies in
      _c.set(Math.floor((sp.getX(i) + sp.getX(i + 1) + sp.getX(i + 2)) / 3 / 0.25) % 2 ? '#ffffff' : '#f2761e');
      for (let k = i; k < i + 3; k++) { sc[k * 3] = _c.r; sc[k * 3 + 1] = _c.g; sc[k * 3 + 2] = _c.b; }
    }
    sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    sg.computeVertexNormals();
    this.sock.add(new THREE.Mesh(this.keep(sg), this.mats.sock));
    pole.add(this.sock);
    // ---- the ring to stand in, its good part (Easy), the nozzle's mark, the arrow to the base
    this.ring = this.add(new THREE.Mesh(this.geo.ring, this.mats.ring)); this.ring.renderOrder = 2; this.ring.visible = false;
    this.good = this.add(new THREE.Mesh(this.geo.good, this.mats.good)); this.good.renderOrder = 3; this.good.visible = false;
    this.mark = this.add(new THREE.Group());
    this.mark.add(new THREE.Mesh(this.geo.aim, this.mats.aim), new THREE.Mesh(this.geo.dot, this.mats.aim));
    this.mark.renderOrder = 9; this.mark.children.forEach(c => { c.renderOrder = 9; });
    this.mark.visible = false;
    this.baseArrow = this.add(new THREE.Mesh(this.geo.arrow, this.keep(new THREE.MeshBasicMaterial({ color: '#52d65c', fog: false, depthTest: false, transparent: true }))));
    this.baseArrow.renderOrder = 9; this.baseArrow.visible = false;
    // the firelight, borrowed from the shared pool
    this.lightPos = V().copy(this.trays[0].pos);
    this.light = g.lights?.add({ pos: this.lightPos, intensity: () => this.I * this.flick, range: 7, color: '#ff9a3c' });
    this.camPos = V(); this.camLook = V();
    this.camPosFn = () => this.camPos; this.camLookFn = () => this.camLook;
    // jump never hops here: it is the pin (and "step back"); and she keeps off the hot trays
    ctx.beforeMove?.(() => {
      const inp = this.g.input;
      if (inp.pressed('jump')) this.jumpAsk = true;
      inp.edges?.delete('jump');
    });
    this.standIn(at(-5.6, 3.2));
    this.setWind(0, true);
    this.showUi();
    return true;
  }

  /** The grown-up who leads the drill: the teacher when she stands near, else a stand-in of her model at the side. */
  standIn(pos) {
    const d = this.ctx.director, g = this.g, n = d?.npcs?.[this.ctx.teacher];
    this.grownAt = pos;
    if (!n || (n.visible && n.pos.distanceTo(this.centre) < 12)) return;
    const name = n.model?.userData?.model;
    const m = name && g.assets?.has?.(name) ? g.assets.clone(name) : null;
    if (!m) return;
    m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    m.position.copy(pos);
    m.rotation.y = Math.atan2(this.centre.x + this.f.x * 2 - pos.x, this.centre.z + this.f.z * 2 - pos.z);
    this.grown = this.add(m);
    this.grownAnim = m.userData.clips?.length ? new Animator(m) : null;
    this.grownAnim?.play('Idle');
  }

  /** The wind for tray i: the sock swings round to it, the flames lean, the smoke drifts. */
  setWind(i, quiet = false) {
    const a = this.game.winds[i] || 0, f = this.f, c = Math.cos(a), s = Math.sin(a);
    this.windDir.set(f.x * c + f.z * s, 0, f.z * c - f.x * s);
    this.windYaw = Math.atan2(-this.windDir.z, this.windDir.x);
    if (quiet) this.sockYaw = this.windYaw;
    else if (this.plan.wind && i > 0) { this.hint(tx('The wind has turned. Look at the wind sock before you stand.'), 4.5); this.quiet = 4; }
  }

  // ------------------------------------------------------------ the little panel: the gauge and the four steps
  showUi() {
    if (typeof document === 'undefined' || this.ui) return;
    addCss('fdCss', CSS);
    const el = document.createElement('div');
    el.id = 'fdUi';
    el.innerHTML = `<div class="ext"><i class="can"></i><div class="bar"><b></b></div><span class="kind"></span></div><div class="steps">${PASS.map(s => `<span data-s="${s}"><svg viewBox="0 0 24 24" aria-hidden="true">${STEP_PIC[s]}</svg></span>`).join('')}</div><em class="name"></em>`;
    document.body.appendChild(el);
    this.ui = { el, can: el.querySelector('.can'), bar: el.querySelector('.bar'), fill: el.querySelector('.bar b'), kind: el.querySelector('.kind'), name: el.querySelector('.name'), steps: [...el.querySelectorAll('.steps span')], pct: -1, held: '', key: '', step: '' };
    const b = document.getElementById('tJump');
    if (b) this.jumpWas = { b, text: b.textContent, label: '' };
  }

  drawUi() {
    const U = this.ui, G = this.game;
    if (!U) return;
    const held = G.held || '', e = held ? G.ext[held] : null, pct = e ? Math.round(e.left / this.plan.seconds * 100) : 0;
    if (held !== U.held) { U.held = held; U.can.className = `can ${held}`; U.kind.textContent = held && this.plan.choose ? tx(KIND_NAME[held]) : ''; }
    if (pct !== U.pct) { U.pct = pct; U.fill.style.width = `${pct}%`; U.bar.className = `bar${pct <= 0 ? ' out' : pct < 30 ? ' low' : ''}`; }
    // the steps: ticked as they are done at this tray; the one that is due is lit (not on Difficult: nobody prompts there)
    const f = G.fires[G.target >= 0 ? G.target : G.cur], step = this.mode === 'done' ? '' : G.step;
    let key = step;
    if (f) for (const s of PASS) key += f.steps[s] ? '1' : '0';
    if (key !== U.key) {
      U.key = key;
      U.steps.forEach(sp => { const s = sp.dataset.s; sp.className = f?.steps[s] && (s !== 'pull' || G.target >= 0 || f.st === 'out') ? 'ok' : this.plan.prompts && s === step ? 'on' : ''; });
      U.name.textContent = this.plan.prompts && STEP_NAME[step] ? tx(STEP_NAME[step]) : '';
    }
    // a phone's round button says what it does now
    const J = this.jumpWas;
    if (J) { const label = this.mode === 'plant' ? JUMP.back : e?.pin ? JUMP.stand : JUMP.pull; if (label !== J.label) { J.label = label; J.b.textContent = tx(label); } }
  }

  hideUi() {
    if (this.ui) { this.ui.el.remove(); this.ui = null; }
    this.warn?.remove(); this.warn = null;
    if (typeof document !== 'undefined') document.getElementById('fdCss')?.remove();
    if (this.jumpWas) { this.jumpWas.b.textContent = this.jumpWas.text; this.jumpWas = null; }
  }

  /** Water at the pan of oil: the grown-up stops it before a drop falls, and a picture shows why. */
  showWarn() {
    if (typeof document === 'undefined') return;
    if (!this.warn) {
      const el = this.warn = document.createElement('div');
      el.id = 'fdWarn';
      el.innerHTML = `${WARN_PIC}<b></b><span></span>`;
      document.body.appendChild(el);
    }
    this.warn.querySelector('b').textContent = tx('Never water on burning oil!');
    this.warn.querySelector('span').textContent = tx('Water sinks under the hot oil, boils at once and throws burning oil out. Use powder, or a grown-up puts a lid on the pan.');
    this.warn.style.display = '';
    this.warnT = 6.5;
  }

  // ------------------------------------------------------------ what Mika does
  shout() {
    const d = this.ctx.director, p = this.player;
    if (!this.game.shout()) return;
    this.shoutT = 2.4;
    d?.barks?.ui?.show?.('firedrill:mika', tx('Fire! Fire!'), out => out.copy(p.pos).setY(p.pos.y + 1.55), { name: tx('Mika'), life: 2.2 });
    if (p.anim?.has?.('Wave')) p.gesture('Wave', { lock: false });
    this.ctx.audio?.whistle?.();
    this.hint(tx('Well shouted! At a real fire that is your whole job: shout, tell a grown-up, get away.'), 5);
    this.quiet = 4.2;
  }

  take(kind) {
    const G = this.game, was = G.held;
    if (!G.take(kind)) return;
    if (was && this.hand[was]) this.hand[was].visible = false;
    this.hand[kind].visible = true;
    this.hand[kind].userData.pin.visible = !G.ext[kind].pin;
    this.ctx.audio?.pickup?.();
    if (this.player.anim?.has?.('Interact')) this.player.gesture('Interact', { lock: false });
    this.showSlots();
  }

  /** The stand shows what is not in her hand (a spare stays for a refill). */
  showSlots() {
    let hid = false;
    for (const s of this.slots) { s.o.visible = hid || s.kind !== this.game.held; if (!s.o.visible) hid = true; }
  }

  /** Where she stands to tray i: { dist, up, exit } for the rules. */
  stanceAt(i, out) {
    const T = this.trays[i], p = this.player.pos, dx = T.pos.x - p.x, dz = T.pos.z - p.z, d = Math.hypot(dx, dz) || 1e-3;
    const ex = this.exitAt.x - T.pos.x, ez = this.exitAt.z - T.pos.z, el = Math.hypot(ex, ez) || 1;
    out.dist = d;
    out.up = (dx * this.windDir.x + dz * this.windDir.z) / d;
    out.exit = (-dx * ex - dz * ez) / (d * el);
    return out;
  }

  /** The best place to stand at tray i (between "wind at her back" and "back to the way out"), 2.5 m off. */
  idealAt(i, out) {
    const T = this.trays[i], ex = this.exitAt.x - T.pos.x, ez = this.exitAt.z - T.pos.z, el = Math.hypot(ex, ez) || 1;
    let x = ex / el, z = ez / el;
    if (this.plan.wind) { x -= this.windDir.x; z -= this.windDir.z; const l = Math.hypot(x, z) || 1; x /= l; z /= l; }
    return out.set(T.pos.x + x * 2.5, T.pos.y, T.pos.z + z * 2.5);
  }

  plant() {
    const G = this.game, p = this.player;
    if (!G.held) { this.hint(tx(WHY.none), 4); this.quiet = 3; return; }
    // the burning tray nearest to her
    let i = -1, best = 99;
    for (const T of this.trays) { const st = G.fires[T.i].st; if (st !== 'burn' && st !== 'down') continue; const d = Math.hypot(T.pos.x - p.pos.x, T.pos.z - p.pos.z); if (d < best) { best = d; i = T.i; } }
    if (i < 0) return;
    const res = G.plant(i, this.stanceAt(i, this._st ??= {}));
    if (!res.ok) {
      if (res.why === 'water-oil') this.showWarn();
      else if (res.why === 'toofar' || res.why === 'none') { this.hint(tx(WHY[res.why]), 4); this.quiet = 3; }
      return;
    }
    const T = this.trays[i], dx = T.pos.x - p.pos.x, dz = T.pos.z - p.pos.z, d = Math.hypot(dx, dz) || 1;
    this.mode = 'plant';
    this.ctx.lock?.(true);
    this.ax = 0; this.ay = AIM.start;
    this.dirX = dx / d; this.dirZ = dz / d;
    T.across.set(-this.dirZ, 0, this.dirX);                 // screen-right from where she stands: the row of cells runs along it
    T.fire.object.rotation.y = Math.atan2(-this.dirX, -this.dirZ);
    p.facing = Math.atan2(dx, dz);
    this.hand[G.held].userData.pin.visible = false;
    const pose = (typeof window !== 'undefined' && window.__STARLINE_QA__?.fdPose) || SPRAY_POSE;
    if (p.anim?.has?.(pose)) p.pose = this.pose = pose;
    this.grip(true);
    this.g.follow?.track?.(this.camPosFn, this.camLookFn, 5);
    this.ctx.audio?.click?.();
  }

  /** How she holds it: hanging from its handle as she walks; lifted to spray, the body upright and the nozzle to the fire. */
  grip(spray) {
    if (!this.onBone) return;
    const qa = typeof window !== 'undefined' ? window.__STARLINE_QA__?.fdRot : null, r = spray ? qa || SPRAY_ROT : CARRY_ROT;
    for (const o of Object.values(this.hand)) o.rotation.set(r[0], r[1], r[2]);
  }

  unplant(quiet = false) {
    if (this.mode !== 'plant') return;
    this.mode = 'walk';
    this.game.unplant();
    this.ctx.lock?.(false);
    if (this.pose && this.player.pose === this.pose) this.player.pose = null;
    this.grip(false);
    this.g.follow?.clearCutscene?.(true);
    this.mark.visible = false;
    if (!quiet) this.ctx.audio?.click?.();
  }

  /** The planted view: over her left shoulder, the tray in the middle, far enough for the whole sweep on a narrow phone. */
  camera() {
    const G = this.game, T = this.trays[G.target], p = this.player.pos, cam = this.g.follow?.camera;
    if (!T) return;
    const d = Math.hypot(T.pos.x - p.x, T.pos.z - p.z), aspect = cam?.aspect || 1.6, tan = Math.tan(((cam?.fov || 50) * Math.PI / 180) / 2);
    const back = Math.max(2.5, 2.0 / (tan * aspect) - d), side = aspect < 1 ? 0.5 : 0.95;
    // (high enough to look over her head at the foot of the fire: the further back, the higher)
    this.camPos.set(p.x - this.dirX * back - (-this.dirZ) * side, p.y + Math.max(1.75 + back * 0.3, 0.6 * (back + d)), p.z - this.dirZ * back - this.dirX * side);
    this.camLook.set(T.pos.x, T.pos.y + 0.55, T.pos.z);
  }

  // ------------------------------------------------------------ particles
  puff(x, y, z, vx, vy, vz, color, life, size, grow, alpha, gravity = -0.1, drag = 0.8) {
    O.life = life; O.size = size; O.color = color; O.alpha = alpha; O.gravity = gravity; O.drag = drag; O.grow = grow;
    this.ctx.fx?.soft?.emit(_v.set(x, y, z), _w.set(vx, vy, vz), O);
  }

  spray(dt) {
    const G = this.game, T = this.trays[G.target], water = G.held === 'water';
    if (!T) return;
    const noz = this.hand[G.held].userData.noz.getWorldPosition(_a), F = T.F;
    const tx_ = T.pos.x + T.across.x * this.ax, tz_ = T.pos.z + T.across.z * this.ax, ty_ = T.pos.y + 0.2 + this.ay * F.h;
    const dx = tx_ - noz.x, dy = ty_ - noz.y, dz = tz_ - noz.z, l = Math.hypot(dx, dy, dz) || 1, sp = 9;
    const col = water ? STEAM : WHITE, st = G.fires[T.i].stance, back = st && this.plan.wind && st.up < 0.2 ? 1 : 0;
    this.acc += dt * 90;
    let n = 0;
    while (this.acc >= 1 && n++ < 5) {
      this.acc -= 1;
      const j = 0.5;
      this.puff(noz.x, noz.y, noz.z, dx / l * sp + (Math.random() - 0.5) * j, dy / l * sp + (Math.random() - 0.5) * j, dz / l * sp + (Math.random() - 0.5) * j, col, l / sp + 0.05, water ? 0.09 : 0.1, water ? 0.9 : 1.7, water ? 0.9 : 0.85, water ? 2 : 0.2, 0.2);
    }
    // where it lands: a cloud of powder (white steam for water) that rolls with the wind; into her face when she stands downwind
    this.acc2 += dt * (water ? 12 : 20);
    n = 0;
    const w = this.plan.wind ? 1.3 : 0.25, high = this.ay > AIM.high ? 1 : 0;
    while (this.acc2 >= 1 && n++ < 3) {
      this.acc2 -= 1;
      const vx = this.windDir.x * w + dx / l * (high ? 3.5 : 0.5) + (Math.random() - 0.5) * 1.1 - this.dirX * back * 2.2;
      const vz = this.windDir.z * w + dz / l * (high ? 3.5 : 0.5) + (Math.random() - 0.5) * 1.1 - this.dirZ * back * 2.2;
      this.puff(tx_ + (Math.random() - 0.5) * 0.3, ty_ + Math.random() * 0.15, tz_ + (Math.random() - 0.5) * 0.3, vx, 0.5 + Math.random() * 0.7, vz, col, water ? 0.9 : 1.5, 0.3, water ? 0.7 : 1.0, water ? 0.5 : 0.62);
    }
  }

  // ------------------------------------------------------------ the rules' news
  news() {
    const G = this.game, ctx = this.ctx, ev = G.events;
    for (let k = 0; k < ev.length; k++) {
      const e = ev[k], T = this.trays[e.i];
      if (e.type === 'lit' || e.type === 'spread') {
        this.setWind(e.i, e.i === 0);
        ctx.audio?.whoosh?.(2);
        if (e.type === 'spread') { this.hint(tx('Too slow: the fire has jumped to the next tray! One at a time, the nearest first.'), 5); this.quiet = 4; }
        else if (e.i > 0 && !this.plan.wind) this.hint(tx('Now the next tray.'), 3);
      } else if (e.type === 'pin') ctx.audio?.click?.();
      else if (e.type === 'out') {
        ctx.audio?.good?.();
        ctx.fx?.burst?.(_v.copy(T.pos).setY(T.pos.y + 0.6), { n: 10, color: [1, 1, 1], speed: 1.4, size: 0.14, gravity: 0.4 });
        if (this.mode === 'plant') this.unplant(true);
        if (!G.done) { this.hint(tx('Out! Well done.'), 2.6); this.quiet = 2.6; }
      } else if (e.type === 'down') { if (this.plan.prompts) { this.hint(tx('The flames are down, but it still smoulders. Keep sweeping a moment!'), 3); this.quiet = 2; } }
      else if (e.type === 'reflare') ctx.audio?.whoosh?.(3);
      else if (e.type === 'empty') { ctx.audio?.miss?.(); this.hint(tx('Empty! That is all an extinguisher holds. Fetch a full one from the stand.'), 5); this.quiet = 4; if (this.mode === 'plant') this.unplant(true); }
      else if (e.type === 'wrong' || e.type === 'coach') {
        if (e.why === 'water-oil') { ctx.audio?.miss?.(); continue; }           // (the picture card says it)
        if (WHY[e.why]) { this.hint(tx(WHY[e.why]), 5.5); this.quiet = 4.5; }
        if (e.type === 'wrong') ctx.audio?.miss?.();
      }
    }
    ev.length = 0;
  }

  /** Easy and Normal: the step that is due, said once by the grown-up (with the button for the device in use). */
  prompt(dt) {
    const G = this.game;
    if (!this.plan.prompts || this.mode === 'done') return;
    this.quiet -= dt;
    const step = G.step;
    if (step === this.told) { this.promptT += dt; if (this.promptT < 9) return; }
    if (this.quiet > 0) return;
    this.told = step; this.promptT = 0;
    const pad = this.g.input?.lastDevice === 'gamepad', stick = this.touch || pad;
    const text = step === 'shout' ? tx('First of all, shout! Press {act} to shout "Fire!"')
      : step === 'take' ? tx('Now take an extinguisher: walk to the stand and press {act}.')
        : step === 'pull' ? (this.plan.wind ? tx('Stand in the ring with the wind at your back, then press {key} to pull the pin.', { key: this.jumpKey() }) : tx('Stand in the green part of the ring, then press {key} to pull the pin.', { key: this.jumpKey() }))
          : step === 'aim' ? (stick ? tx('Aim at the base: pull the stick down until the ring sits at the foot of the fire.') : tx('Aim at the base: hold S until the ring sits at the foot of the fire.'))
            : step === 'squeeze' ? tx('Now squeeze the handle: hold {act}.')
              : step === 'sweep' ? (stick ? tx('Sweep! Push the stick left and right along the base while you squeeze.') : tx('Sweep! Press A and D to go left and right along the base while you squeeze.'))
                : '';
    if (text) this.hint(text, 6.5);
  }

  finishRound(timeUp) {
    if (this.mode === 'done') return;
    const G = this.game, ctx = this.ctx;
    if (this.mode === 'plant') this.unplant(true);
    if (timeUp) G.finish();
    this.mode = 'done';
    this.ring.visible = this.good.visible = this.mark.visible = this.baseArrow.visible = false;
    this.endT = 3.2;
    if (G.done) { ctx.audio?.fanfare?.(); if (this.player.anim?.has?.('Cheer')) this.player.gesture('Cheer', { lock: false }); }
    else ctx.audio?.good?.();
    this.hint(G.done ? tx('All out! And remember: at a real fire you shout, tell a grown-up and get away.')
      : tx('Time is up: I will put a lid on the rest. At a real fire you shout and get away!'), 4.5);
  }

  // ------------------------------------------------------------ every frame
  update(dt) {
    const G = this.game, ctx = this.ctx, p = this.player, inp = this.g.input;
    this.t += dt;
    const jump = this.jumpAsk; this.jumpAsk = false;
    let squeeze = false;
    if (this.mode === 'walk') {
      // the extinguisher she could take: the one on the stand she stands at
      let near = null, nd = 1.7;
      for (const s of this.slots) { if (!s.o.visible) continue; const d = Math.hypot(s.at.x - p.pos.x, s.at.z - p.pos.z); if (d < nd) { nd = d; near = s; } }
      this.near = near ? near.kind : '';
      if (ctx.pressed()) {
        if (near && (near.kind !== G.held || G.ext[near.kind].left <= 0)) this.take(near.kind);
        else if (!G.shouted) this.shout();
      }
      if (jump) this.plant();
      // the handle squeezed before she stands at a tray with the pin out: it will not move (the rules say why)
      squeeze = !!G.held && !near && G.shouted && inp.held('act') && this.shoutT <= 0;
      // she keeps off the trays: the hot ones well off
      for (const T of this.trays) {
        const hot = G.fires[T.i].st === 'burn' || G.fires[T.i].st === 'down', rad = hot ? STAND.min + 0.05 : T.R + 0.35;
        const dx = p.pos.x - T.pos.x, dz = p.pos.z - T.pos.z, d = Math.hypot(dx, dz);
        if (d < rad && d > 1e-3) { p.pos.x = T.pos.x + dx / d * rad; p.pos.z = T.pos.z + dz / d * rad; }
      }
    } else if (this.mode === 'plant') {
      const T = this.trays[G.target];
      if (!T) this.unplant(true);
      else if (jump) this.unplant();
      else {
        this.ax = Math.max(-AIM.x, Math.min(AIM.x, this.ax + inp.move.x * AIM.speed * dt));
        this.ay = clamp01(this.ay + inp.move.y * AIM.lift * dt);
        squeeze = inp.held('act');
        // she turns a little with the nozzle
        p.facing = Math.atan2(T.pos.x + T.across.x * this.ax - p.pos.x, T.pos.z + T.across.z * this.ax - p.pos.z);
        this.camera();
      }
    }
    this.shoutT -= dt;
    G.update(dt, { squeeze, ax: this.ax, ay: this.ay });
    if (G.spraying) this.spray(dt);
    this.news();
    this.prompt(dt);
    if (G.done && this.mode !== 'done') this.finishRound(false);
    this.draw(dt);
    this.drawUi();
    if (this.warnT > 0) { this.warnT -= dt; if (this.warnT <= 0 && this.warn) this.warn.style.display = 'none'; }
    this.grownAnim?.update(dt);
    if (this.mode === 'done') this.endT -= dt;
  }

  draw(dt) {
    const G = this.game, P = this.plan, cam = this.g.follow?.camera || this.g.camera, cur = G.target >= 0 ? G.target : G.cur;
    this.flick += ((0.82 + Math.random() * 0.36) - this.flick) * Math.min(1, dt * 14);
    const wind = P.wind ? 0.3 : 0.05, wob = Math.sin(this.t * 0.9) * 0.05;
    let light = 0;
    for (const T of this.trays) {
      const f = G.fires[T.i], lv = this.mode === 'done' && !G.done ? 0 : G.level(T.i);
      T.vis += (lv - T.vis) * Math.min(1, dt * (lv > T.vis ? 2.2 : 7));
      for (let k = 0; k < f.n; k++) T.fire.cells[k] += ((f.st === 'burn' ? f.cells[k] : 0) - T.fire.cells[k]) * Math.min(1, dt * 8);
      const on = T.vis > 0.02;
      T.fire.update(dt, on ? 0.92 + this.flick * 0.08 : 0, this.windDir.x * wind + wob, this.windDir.z * wind);
      if (on) {
        if (T.i === cur || !light) { light = T.vis; this.lightPos.set(T.pos.x, T.pos.y + 0.7, T.pos.z); }
        T.char = Math.min(1, T.char + dt * 0.03);
        // smoke off the flames, a spark now and then
        if (Math.random() < dt * 5 * T.vis) this.puff(T.pos.x + (Math.random() - 0.5) * 0.3, T.pos.y + 0.5 + T.F.h * T.vis * 0.8, T.pos.z + (Math.random() - 0.5) * 0.3, this.windDir.x * (P.wind ? 1.1 : 0.15), 1.5 + Math.random() * 0.5, this.windDir.z * (P.wind ? 1.1 : 0.15), f.fuel === 'oil' ? DARK : GREY, 1.8, 0.4, 0.8, f.fuel === 'oil' ? 0.6 : 0.42, -0.15, 0.5);
        if (Math.random() < dt * 4 * T.vis) { O.life = 0.7 + Math.random() * 0.6; O.size = 0.06 + Math.random() * 0.05; O.color = SPARK; O.alpha = 1; O.gravity = -0.3; O.drag = 0.6; O.grow = 0; this.ctx.fx?.glow?.emit(_v.set(T.pos.x + (Math.random() - 0.5) * 0.5, T.pos.y + 0.3, T.pos.z + (Math.random() - 0.5) * 0.5), _w.set((Math.random() - 0.5) * 0.5, 1 + Math.random() * 1.2, (Math.random() - 0.5) * 0.5), O); }
      }
      // smouldering: grey smoke keeps coming until the embers are dealt with
      if (f.st === 'down' && Math.random() < dt * 9) this.puff(T.pos.x + (Math.random() - 0.5) * T.R, T.pos.y + 0.3, T.pos.z + (Math.random() - 0.5) * T.R, this.windDir.x * 0.6, 1.1, this.windDir.z * 0.6, GREY, 1.5, 0.35, 0.7, 0.5);
      if (f.st === 'out' || T.char > 0) {
        const out = f.st === 'out', k = out ? 1 : T.char * 0.6;
        T.fm.color.setScalar(1 - 0.72 * k);
        if (out && f.used.includes('powder')) { T.cover.visible = true; T.cover.material.opacity = Math.min(0.82, T.cover.material.opacity + dt * 1.5); }
      }
    }
    this.I = light * 5;
    // the wind sock: limp in still air; in a wind it stands out and flutters, and swings round when the wind turns
    let dy = this.windYaw - this.sockYaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.sockYaw += dy * Math.min(1, dt * 1.6);
    this.sockDroop += ((P.wind ? -0.22 : -1.32) - this.sockDroop) * Math.min(1, dt * 2);
    this.sock.rotation.set(0, this.sockYaw + (P.wind ? Math.sin(this.t * 2.3) * 0.1 : 0), this.sockDroop + Math.sin(this.t * (P.wind ? 5.1 : 1.1)) * (P.wind ? 0.07 : 0.03));
    // the ring round the tray that burns (its green part on Easy: where to stand)
    const T = this.trays[cur], show = !!T && this.mode !== 'done' && !!G.held;
    this.ring.visible = show;
    this.good.visible = show && P.level === 'easy' && this.mode === 'walk';
    if (show) {
      this.ring.position.set(T.pos.x, T.pos.y + 0.05, T.pos.z);
      this.mats.ring.opacity = this.mode === 'walk' ? 0.3 + Math.sin(this.t * 3) * 0.06 : 0.14;
      if (this.good.visible) {
        const id = this.idealAt(T.i, _a);
        this.good.position.set(T.pos.x, T.pos.y + 0.06, T.pos.z);
        this.good.rotation.y = Math.atan2(-(id.z - T.pos.z), id.x - T.pos.x);
        this.mats.good.opacity = 0.5 + Math.sin(this.t * 4) * 0.15;
      }
    }
    // the nozzle's mark on the fire: orange up in the flames, green at the base
    const aiming = this.mode === 'plant' && !!T;
    this.mark.visible = aiming;
    this.baseArrow.visible = aiming && P.prompts && this.ay > AIM.base;
    if (aiming) {
      const low = this.ay <= AIM.base;
      this.mark.position.set(T.pos.x + T.across.x * this.ax, T.pos.y + 0.2 + this.ay * T.F.h, T.pos.z + T.across.z * this.ax);
      if (cam) this.mark.quaternion.copy(cam.quaternion);
      this.mark.scale.setScalar(low ? 1.15 + Math.sin(this.t * 8) * 0.06 : 1);
      this.mats.aim.color.set(low ? '#3fd65a' : '#ff8a1c');
      if (this.baseArrow.visible) this.baseArrow.position.set(T.pos.x + T.across.x * this.ax - this.dirX * 0.2, T.pos.y + 0.62 + Math.sin(this.t * 6) * 0.07, T.pos.z + T.across.z * this.ax - this.dirZ * 0.2);
    }
  }

  get score() { return this.game.score; }
  get over() { return this.mode === 'done' && this.endT <= 0; }

  /** What a QA script needs: where things are and what the rules hold. */
  view() {
    const G = this.game, p = this.player.pos;
    return {
      mode: this.mode, level: this.plan.level, seed: this.seed, step: G.step, score: G.score, held: G.held, shouted: G.shouted, target: G.target, cur: G.cur,
      ax: this.ax, ay: this.ay, near: this.near, spraying: !!G.spraying, mistakes: G.mistakes, used: G.used, refills: G.refills,
      ext: { powder: { ...G.ext.powder }, water: { ...G.ext.water } }, wind: { x: this.windDir.x, z: this.windDir.z, on: this.plan.wind },
      mika: { x: p.x, z: p.z }, exit: { x: this.exitAt.x, z: this.exitAt.z }, grown: { x: this.grownAt.x, z: this.grownAt.z },
      slots: this.slots.map(s => ({ kind: s.kind, x: s.at.x, z: s.at.z, there: s.o.visible })),
      trays: this.trays.map(T => {
        const f = G.fires[T.i], id = this.idealAt(T.i, V());
        return { i: T.i, x: T.pos.x, z: T.pos.z, fuel: f.fuel, size: f.size, st: f.st, level: G.level(T.i), cells: [...f.cells], embers: f.embers, steps: { ...f.steps }, wrong: [...f.wrong], stance: f.stance, ideal: { x: id.x, z: id.z }, best: FUEL[f.fuel].best, score: G.fireScore(f) };
      }),
    };
  }

  dispose() {
    this.disposed = true;
    if (this.mode === 'plant') { this.game.unplant(); this.g.follow?.clearCutscene?.(true); }
    if (this.pose && this.player.pose === this.pose) this.player.pose = null;
    this.ctx.lock?.(false);
    this.hideUi();
    if (this.light) this.g.lights?.remove(this.light);
    for (const o of Object.values(this.hand || {})) o.removeFromParent();
    this.restore?.();
    for (const o of this.added || []) { this.scene.remove(o); disposeRigs(o); }
    for (const x of this.own) x.dispose?.();
    this.own.length = 0;
    this.ctx.director?.barks?.ui?.hide?.('firedrill:mika');
  }
}

/** A flat arrow for the ground (it points along +y of the shape: turned to the way out). */
function arrowShape() {
  const s = new THREE.Shape();
  s.moveTo(-0.22, -0.7); s.lineTo(0.22, -0.7); s.lineTo(0.22, 0.15); s.lineTo(0.5, 0.15); s.lineTo(0, 0.75); s.lineTo(-0.5, 0.15); s.lineTo(-0.22, 0.15); s.closePath();
  return s;
}

export default {
  id: 'firedrill',
  async play(ctx) {
    const g = ctx.game;
    const qa = typeof window !== 'undefined' ? window.__STARLINE_QA__ : null;
    const r = new DrillRound(ctx, qa?.trickSeed ?? ((Date.now() / 7) & 0xffff));
    // a bright daytime look for the round when the hour on screen is not one (the framework restores it)
    const h = g.shownHour ? g.shownHour() : 11;
    if (!(h >= 8 && h < 17)) ctx.setNight?.(true, 10.5);
    if (qa) qa.trickRound = r;                                                   // test hook (?qa=1 only)
    ctx.debug.view = () => r.view();
    ctx.debug.round = r;
    try {
      r.build();
      // the hints sit at the top, under the HUD and the gauge: the middle of the picture is the fire
      ctx.hintTop?.(true, 112);
      ctx.hint?.(ctx.hard
        ? tx('Three fires: paper, oil and straw. Choose the right extinguisher for each: water or powder. And first?')
        : tx('We practise at a tray, together. A real fire is for grown-ups: you shout "Fire!" and get away.'), 6);
      r.quiet = ctx.hard ? 0 : 5;
      let left = ctx.roundTime || 100;
      ctx.hud?.(0, left);
      const res = await ctx.loop(dt => {
        r.update(dt);
        if (r.mode !== 'done') { left -= dt; if (left <= 0) r.finishRound(true); }
        ctx.hud?.(r.score, Math.max(0, left));
        if (r.over) return true;
      });
      const G = r.game, n = G.outCount, m = G.fires.length;
      return {
        score: r.score, caught: n, quit: !!res?.quit,
        extra: m > 1 ? tx('{n} of {m} fires out', { n, m }) : n ? tx('fire out') : '',
        detail: { out: n, fires: m, level: r.plan.level, mistakes: G.mistakes, shout: G.shoutScore, saved: G.saved, used: +G.used.toFixed(2), refills: G.refills,
          parts: G.fires.map(f => ({ fuel: f.fuel, size: f.size, wrong: [...f.wrong], ...G.fireScore(f) })), seed: r.seed },
      };
    } finally {
      r.dispose();
      ctx.setNight?.(false);
    }
  },
  ambient() {},
  _Round: DrillRound,
};
