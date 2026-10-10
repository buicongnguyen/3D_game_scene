// The scene tour at runtime (Settings → Scene tour, and the title menu): a camera flight through Hoshi Valley in one
// of five looks (the four seasons and a starry summer night), or all five in a row. The stops, the lines and the
// camera math are in content/tour.js; this file owns the picker, the flight's little toolbar, and the borrowing and
// giving back of the game while it runs.
//
// Nothing of the player's game is changed. While the tour runs:
//   • the story is swapped for a throwaway one (the valley after the story: every lamp lit, every way open), so the
//     townsfolk, animals, train and lamps are all alive, also from the title screen where no story is loaded;
//   • saving is blocked (director.tourLock and the shadowed save), and nothing can be picked up, sparked or talked to;
//   • Mika is frozen and hidden, and stands in as the "where life happens" point under the camera's subject;
//   • season, hour, weather, camera, HUD, lamps, the viaduct, the train and the festival dressing are borrowed.
// close() puts every one of them back exactly (tests/tour-browser.mjs compares before and after).
// The module is loaded on demand (ui.js imports it on the first click) and costs nothing until then.
import * as THREE from 'three';
import { TOURS, TOUR, YEAR, TEXT, FOV, TOUR_PLACES, timeline, poseAt, stopTime, shotOf } from '../content/tour.js';
import { tx, onLangChange } from '../i18n/i18n.js';
import { Quest } from './quest.js';
import { stateAt, exploreState } from './fastforward.js';
import { storyId, useStory } from './stories/index.js';
import { STOPS } from '../world/railway.js';
import { buildStars } from './skygaze.js';

const ICON = { spring: '🌸', summer: '☀️', autumn: '🍁', winter: '❄️', night: '🌙', year: '✨' };
const $ = id => document.getElementById(id);

const CSS = `
#tourPick .tour-intro{margin:2px 0 12px;font:600 15px var(--ui,Nunito,sans-serif);color:var(--ink,#3b2a1c)}
#tourPick .tour-cards{display:grid;grid-template-columns:1fr 1fr;gap:10px}
#tourPick .tour-card{display:grid;grid-template-columns:auto 1fr;column-gap:10px;align-items:center;text-align:left;min-height:64px;padding:10px 12px;border:2px solid rgba(242,181,58,.6);
 border-radius:16px;background:#fff8e6;color:var(--ink,#3b2a1c);font:700 15px var(--ui,Nunito,sans-serif);cursor:pointer;transition:transform .12s,background .2s}
#tourPick .tour-card:hover,#tourPick .tour-card:focus-visible{background:#fff;transform:translateY(-2px);outline:none}
#tourPick .tour-card[disabled]{opacity:.5;cursor:default;transform:none}
#tourPick .tour-card .ic{grid-row:1/4;font-size:28px;line-height:1}
#tourPick .tour-card b{font:600 18px var(--head,Fredoka,sans-serif)}
#tourPick .tour-card small{font-weight:700;opacity:.78}
#tourPick .tour-card em{grid-column:2;font:800 12px var(--ui,Nunito,sans-serif);font-style:normal;opacity:.6}
#tourPick .tour-card.year{background:linear-gradient(180deg,#ffd66b,#f2a33a);border-color:#e08f1e;color:#3b1c05}
#tourPick .tour-safe{margin:12px 0 0;text-align:center}
#tourPick .tour-busy{margin:8px 0 0;text-align:center;font:700 14px var(--ui,Nunito,sans-serif);color:#b3401c}
#tourPick .tour-busy:empty{display:none}
#tourView{position:fixed;inset:0;z-index:16;pointer-events:none;color:#fff;font-family:var(--ui,Nunito,sans-serif)}
#tourView.hidden,#tourPick.hidden{display:none}
#tourView .tour-fade{position:absolute;inset:0;background:var(--night,#0b1024);opacity:0;transition:opacity .4s}
#tourView .tour-fade.on{opacity:1}
#tourView .tour-caption{position:absolute;left:calc(18px + env(safe-area-inset-left,0px));top:calc(16px + env(safe-area-inset-top,0px));max-width:min(520px,calc(100vw - 36px));
 text-shadow:0 2px 10px rgba(6,10,28,.85),0 0 2px rgba(6,10,28,.9);transition:opacity .45s,transform .45s;zoom:var(--ui-scale,1)}
#tourView .tour-caption.off{opacity:0;transform:translateY(-6px)}
#tourView .tour-caption small{display:block;font:800 13px var(--ui,Nunito,sans-serif);letter-spacing:.08em;text-transform:uppercase;opacity:.92}
#tourView .tour-caption h2{margin:2px 0 4px;font:600 clamp(24px,3.4vw,38px)/1.1 var(--head,Fredoka,sans-serif)}
#tourView .tour-caption p{margin:0;font:700 clamp(15px,1.7vw,19px)/1.35 var(--ui,Nunito,sans-serif)}
#tourView .tour-bar{position:absolute;left:50%;bottom:calc(12px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);width:max-content;max-width:calc(100vw - 16px);
 padding:8px 10px 8px;border-radius:18px;background:rgba(11,16,36,.82);box-shadow:0 8px 26px rgba(0,0,0,.35);pointer-events:auto;display:flex;flex-direction:column;gap:7px;align-items:stretch}
#tourView .tour-progress{height:4px;border-radius:2px;background:rgba(255,255,255,.22);overflow:hidden}
#tourView .tour-progress i{display:block;height:100%;width:0;background:linear-gradient(90deg,#ffd66b,#ff9a3a);border-radius:2px}
#tourView .tour-row{display:flex;gap:6px;justify-content:center;flex-wrap:nowrap}
#tourView button{min-width:44px;min-height:44px;padding:0 12px;border:0;border-radius:12px;background:rgba(255,255,255,.14);color:#fff;font:800 15px var(--ui,Nunito,sans-serif);cursor:pointer;
 -webkit-tap-highlight-color:transparent;touch-action:manipulation}
#tourView button:hover,#tourView button:focus-visible{background:rgba(255,255,255,.28);outline:none}
#tourView button.on{background:#ffd66b;color:#3b1c05}
#tourView button.main{min-width:104px;background:linear-gradient(180deg,#ffd66b,#f2a33a);color:#3b1c05}
#tourView .tour-seasons button{font-size:20px;padding:0 6px}
#tourView .tour-status{margin:0;text-align:center;font:700 13px var(--ui,Nunito,sans-serif);max-width:330px;align-self:center}
#tourView .tour-status:empty{display:none}
#tourView .tour-keys{text-align:center;font:700 11px var(--ui,Nunito,sans-serif);opacity:.7;white-space:pre}
body.touch #tourView .tour-keys{display:none}
@media (max-height:480px){#tourView .tour-keys{display:none}#tourView .tour-bar{flex-direction:row;align-items:center;flex-wrap:wrap;justify-content:center;padding:6px 8px}
 #tourView .tour-progress{flex:1 0 100%}#tourView .tour-caption h2{font-size:22px}}
@media (max-width:420px){#tourView .tour-row{gap:5px}#tourView button{padding:0 9px}#tourView button.main{min-width:92px}}
`;

// ------------------------------------------------------------------ the fish under the dock
// The river's own fish swim half a metre down and the water hides them. For the tour a small school of koi and trout
// swims just under the surface where the camera looks down: one instanced mesh, flat fish shapes drawn after the
// water, their tails wagged in the vertex shader. Built on entering a tour, disposed on leaving it.
const FISH_VERT = `
attribute vec3 aTint;
attribute vec3 aTint2;
attribute float aPhase;
attribute float aPatch;
uniform float uTime;
varying vec3 vC;
void main() {
  vec3 p = position;
  float tail = smoothstep(0.15, -0.5, p.z);
  p.x += sin(uTime * 5.0 + aPhase + p.z * 4.5) * 0.11 * (0.2 + tail);
  vC = mix(aTint, aTint2, step(0.5, fract(aPatch + aPhase * 0.37)));
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(p, 1.0);
}`;
const FISH_FRAG = `
uniform float uDim;
uniform float uAlpha;
varying vec3 vC;
void main() { gl_FragColor = vec4(vC * uDim, uAlpha); }`;

function fishGeometry() {
  // top view, head toward +z, one metre long; rows of [z, half width, patch]
  const rows = [[0.5, 0.0, 0.1], [0.43, 0.085, 0.1], [0.27, 0.135, 0.6], [0.06, 0.14, 0.6], [-0.14, 0.105, 0.2], [-0.3, 0.05, 0.7], [-0.37, 0.035, 0.7]];
  const pos = [], patch = [], idx = [];
  for (const [z, w, k] of rows) { pos.push(-w, 0, z, w, 0, z); patch.push(k, k); }
  for (let i = 0; i < rows.length - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  // the forked tail, and two small side fins
  let n = pos.length / 3;
  pos.push(0, 0, -0.36, -0.17, 0, -0.56, 0, 0, -0.46, 0.17, 0, -0.56); patch.push(0.7, 0.7, 0.7, 0.7);
  idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
  n += 4;
  pos.push(-0.12, 0, 0.22, -0.27, 0, 0.08, -0.13, 0, 0.1, 0.12, 0, 0.22, 0.13, 0, 0.1, 0.27, 0, 0.08); patch.push(0.2, 0.2, 0.2, 0.2, 0.2, 0.2);
  idx.push(n, n + 1, n + 2, n + 3, n + 4, n + 5);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aPatch', new THREE.Float32BufferAttribute(patch, 1));
  geo.setIndex(idx);
  return geo;
}

class TourFish {
  constructor(scene, count) {
    const KINDS = [['#ff7a22', '#fff4e2'], ['#fff4e2', '#f2452a'], ['#ffbf2e', '#ff7a22'], ['#f2452a', '#fff4e2'], ['#bfe6ee', '#8fc4d6'], ['#ffd9b0', '#ff7a22']];
    const geo = fishGeometry(), tint = [], tint2 = [], phase = [];
    let seed = 7;
    const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    this.fish = [];
    for (let i = 0; i < count; i++) {
      const [a, b] = KINDS[i % KINDS.length], ca = new THREE.Color(a), cb = new THREE.Color(b);
      tint.push(ca.r, ca.g, ca.b); tint2.push(cb.r, cb.g, cb.b); phase.push(R() * 6.28);
      this.fish.push({ ox: (R() - 0.5) * 5.2, oz: (R() - 0.5) * 4.2, rx: 0.9 + R() * 1.5, rz: 0.7 + R() * 1.2, a: R() * 6.28, w: (0.28 + R() * 0.3) * (R() < 0.5 ? -1 : 1), s: 0.8 + R() * 0.45, y: -0.1 - R() * 0.1 });
    }
    geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(new Float32Array(tint), 3));
    geo.setAttribute('aTint2', new THREE.InstancedBufferAttribute(new Float32Array(tint2), 3));
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(phase), 1));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: FISH_VERT, fragmentShader: FISH_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      uniforms: { uTime: { value: 0 }, uDim: { value: 1 }, uAlpha: { value: 0 } },
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, count);
    this.mesh.name = 'tour:fish';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;            // after the water (2): they read as just under the surface
    this.mesh.visible = false;
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.p = new THREE.Vector3(); this.s = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.t = 0; this.alpha = 0;
    scene.add(this.mesh);
  }

  /** show: 0..1 wanted visibility; at: [x, z] the middle of the school. */
  update(dt, show, at, night) {
    this.alpha += (show - this.alpha) * Math.min(1, dt * 2.5);
    if (show <= 0 && this.alpha < 0.02) this.alpha = 0;
    this.mesh.visible = this.alpha > 0;
    if (!this.mesh.visible) return;
    this.t += dt;
    this.mat.uniforms.uTime.value = this.t;
    this.mat.uniforms.uAlpha.value = this.alpha * 0.94;
    this.mat.uniforms.uDim.value = 1 - 0.5 * night;
    this.fish.forEach((f, i) => {
      f.a += f.w * dt;
      const c = Math.cos(f.a), s = Math.sin(f.a);
      this.p.set(at[0] + f.ox + c * f.rx, f.y, at[1] + f.oz + s * f.rz);
      // heading: along the ellipse's tangent
      this.q.setFromAxisAngle(this.up, Math.atan2(-s * f.rx * Math.sign(f.w), c * f.rz * Math.sign(f.w)));
      this.m.compose(this.p, this.q, this.s.setScalar(f.s));
      this.mesh.setMatrixAt(i, this.m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.mesh.dispose?.();
  }
}

// ------------------------------------------------------------------ the tour
export class SceneTour {
  constructor(game) {
    this.g = game;
    this.active = false;
    this.paused = false;
    this.done = false;
    this.t = 0;
    this.data = { TOURS, TOUR_PLACES };     // the live tables (the browser tests and look-dev may adjust a shot)
    this.buildDom();
    this.onKey = this.onKey.bind(this);
    this.onHide = () => { if (document.hidden && this.active && !this.done) { this.paused = true; this.syncUi(); } };
    this.frame = dt => this.update(dt);
    this.offLang = onLangChange(() => this.text());
  }

  get d() { return this.g.director; }
  get ui() { return this.g.ui; }

  // ---------------------------------------------------------------- DOM
  buildDom() {
    if (!$('tourCss')) { const s = document.createElement('style'); s.id = 'tourCss'; s.textContent = CSS; document.head.appendChild(s); }
    const pick = document.createElement('div');
    pick.id = 'tourPick';
    pick.className = 'overlay hidden';
    pick.innerHTML = `<div class="book small"><header><h2></h2><button class="close" type="button" aria-label="Close">✕</button></header>
      <p class="tour-intro"></p><div class="tour-cards">${[...TOURS, YEAR].map(t => `<button type="button" class="tour-card${t.id === 'year' ? ' year' : ''}" data-tour="${t.id}"><span class="ic" aria-hidden="true">${ICON[t.id]}</span><b></b><small></small><em></em></button>`).join('')}</div>
      <p class="note tour-safe"></p><p class="tour-busy" role="status"></p></div>`;
    document.body.appendChild(pick);
    pick.querySelector('.close').addEventListener('click', () => this.ui.closeOverlay());
    pick.addEventListener('click', e => { if (e.target === pick) this.ui.closeOverlay(); });
    pick.querySelectorAll('.tour-card').forEach(b => b.addEventListener('click', () => this.start(b.dataset.tour)));
    const view = document.createElement('section');
    view.id = 'tourView';
    view.className = 'hidden';
    view.innerHTML = `<div class="tour-fade"></div>
      <div class="tour-caption off"><small></small><h2></h2><p></p></div>
      <div class="tour-bar">
        <div class="tour-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i></i></div>
        <div class="tour-row tour-seasons">${TOURS.map(t => `<button type="button" data-tour="${t.id}">${ICON[t.id]}</button>`).join('')}</div>
        <div class="tour-row tour-buttons">
          <button type="button" data-do="prev" aria-keyshortcuts="ArrowLeft">◀</button>
          <button type="button" class="main" data-do="pause" aria-keyshortcuts="P Space"></button>
          <button type="button" data-do="next" aria-keyshortcuts="ArrowRight">▶</button>
          <button type="button" data-do="back" aria-keyshortcuts="Escape"></button>
        </div>
        <p class="tour-status" role="status"></p>
        <small class="tour-keys"></small>
      </div>`;
    document.body.appendChild(view);
    const act = { prev: () => this.prev(), next: () => this.next(), pause: () => this.togglePause(), back: () => this.close() };
    view.querySelectorAll('[data-do]').forEach(b => b.addEventListener('click', () => { b.blur(); act[b.dataset.do](); }));
    view.querySelectorAll('.tour-seasons button').forEach(b => b.addEventListener('click', () => { b.blur(); this.jump(b.dataset.tour); }));
    this.el = { pick, view, fade: view.querySelector('.tour-fade'), cap: view.querySelector('.tour-caption'), bar: view.querySelector('.tour-progress i'), prog: view.querySelector('.tour-progress') };
    this.text();
  }

  /** (Re)write every label in the current language. */
  text() {
    const { pick, view } = this.el;
    pick.querySelector('h2').textContent = tx(TEXT.title);
    pick.querySelector('.tour-intro').textContent = tx(TEXT.intro);
    pick.querySelector('.tour-safe').textContent = tx(TEXT.safe);
    pick.querySelectorAll('.tour-card').forEach(b => {
      const t = b.dataset.tour === 'year' ? YEAR : TOUR[b.dataset.tour];
      const secs = t === YEAR ? TOURS.reduce((a, x) => a + timeline(x).length, 0) : timeline(t).length;
      b.querySelector('b').textContent = tx(t.name);
      b.querySelector('small').textContent = tx(t.blurb);
      b.querySelector('em').textContent = tx(TEXT.length, { n: Math.max(1, Math.round(secs / 60)) });
    });
    view.setAttribute('aria-label', tx(TEXT.title));
    view.querySelector('[data-do=prev]').setAttribute('aria-label', tx(TEXT.prev));
    view.querySelector('[data-do=next]').setAttribute('aria-label', tx(TEXT.next));
    view.querySelector('[data-do=back]').textContent = tx(TEXT.back);
    view.querySelector('.tour-keys').textContent = tx(TEXT.keys);
    view.querySelectorAll('.tour-seasons button').forEach(b => { const n = tx(TOUR[b.dataset.tour].name); b.title = n; b.setAttribute('aria-label', n); });
    this.capKey = null;
    if (this.active) { this.syncUi(); this.caption(); }
  }

  // ---------------------------------------------------------------- the picker
  /** Why the tour cannot start right now (a scene, a minigame, a ride ...), or null. */
  blocked() {
    const g = this.g, d = this.d;
    if (!d?.quest) return null;                       // the title screen: nothing is going on
    const p = g.player;
    return !!(d.scenes?.active || d.minigame || d.tricks?.round || d.tricks?.locks || d.sky?.active || d.sky?.locks || d.busy > 0 || this.ui.dialogueOpen
      || g.interiors?.active || p.mounted || g.kite?.active || d.running);
  }

  openPicker() {
    if (this.active) return;
    const no = this.blocked();
    this.el.pick.querySelector('.tour-busy').textContent = no ? tx(TEXT.busy) : '';
    this.el.pick.querySelectorAll('.tour-card').forEach(b => { b.disabled = !!no; });
    this.ui.open('tourPick');
    if (!no) this.el.pick.querySelector('.tour-card').focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------- start / stop
  /** Start a tour: one of TOURS' ids, or 'year' for all five in order. Returns false when it cannot start. */
  start(id = 'year') {
    if (this.active) return false;
    if (this.blocked()) { this.openPicker(); return false; }
    if (id !== 'year' && !TOUR[id]) return false;
    this.year = id === 'year';
    this.order = this.year ? TOURS.slice() : [TOUR[id]];
    this.enter();
    this.setTour(0);
    this.cover(false, 600);
    return true;
  }

  enter() {
    const g = this.g, d = this.d, ui = this.ui, p = g.player, S = g.structures, R = g.railway, T = R.train;
    // 1) everything the tour owns is made first: a failure here leaves the game untouched
    const story = storyId();
    let state;
    try { state = stateAt('e.done', 'together', story); } catch { state = exploreState(); }
    state.flags = { ...state.flags, huntAsked: true, explore: true, porchTalk: true, tour: true };
    state.inv = { ...state.inv, kite: 0 };
    const quest = new Quest(state);
    useStory(story);                                   // the story tables keep speaking the player's story
    const fish = new TourFish(g.scene, g.world.quality?.name === 'Low' || ui.touch ? 7 : 11);
    this.fish = fish;
    this.fromGame = !!d.quest;
    // 2) remember all that is borrowed
    const hidden = id => $(id).classList.contains('hidden');
    this.saved = {
      seasonOverride: g.seasonOverride, timeOverride: g.timeOverride, cycleHour: g.cycleHour, weatherOff: g.weatherOff, viewFocus: g.viewFocus ?? null,
      beforeUpdate: g.beforeUpdate ?? null, paused: g.paused,
      cam: { pos: g.camera.position.clone(), quat: g.camera.quaternion.clone(), fov: g.camera.fov, near: g.camera.near },
      follow: { shot: g.follow.shot, tracking: g.follow.tracking, fovBase: g.follow.fovBase, pos: g.follow.pos.clone(), look: g.follow.look.clone() },
      hud: hidden('hud'), touch: hidden('touch'), title: hidden('title'),
      player: { visible: p.root.visible, pos: p.pos.clone() },
      quest: d.quest ?? null, timetable: d.timetable, drawbridgeAngle: d.drawbridgeAngle, saveClock: d.saveClock, stepClock: d.stepClock, lastHour: d.lastHour,
      actCooldown: d.actCooldown, bees: d.bees, tourLock: d.tourLock,
      tamo: { hidden: d.tamo.hidden, visible: d.tamo.root.visible, pos: d.tamo.pos.clone(), light: d.tamo.light.intensity },
      lamps: [...S.lamps.entries()].map(([id, L]) => [id, L.target, L.lit]),
      rail: { repaired: !!R.repaired, repair: R.repair?.visible, scaffold: R.scaffold?.visible, beams: (R.beams || []).map(b => b.visible), s: T.s, v: T.v, target: T.target, cruise: T.cruise, dir: T.dir },
      decor: g.celebrate?.decor?.level ?? 0, meteors: g.fx.meteorOn,
      pickups: [...d.pickups.values()].map(pk => [pk, pk.obj.visible]), kiteStand: d.kiteStand?.obj.visible,
      people: [...(d.returning || []).map(r => r[0]), 'sora'].filter(id => d.npcs[id]).map(id => [id, d.npcs[id].storyVisible]),
    };
    // 3) borrow the game
    ui.closeAll();
    this.el.pick.classList.add('hidden');
    $('title').classList.add('hidden');
    ui.showHud(false);
    g.paused = false;
    g.input.releaseAll();
    this.cover(true, 0);
    this.el.view.classList.remove('hidden');
    document.body.classList.add('tour-on');
    // the throwaway story, and nothing that could reach the real one or the save files
    d.tourLock = true;
    d.quest = quest;
    for (const k of ['save', 'canSave', 'canAim']) d[k] = () => false;
    for (const k of ['event', 'run', 'say']) d[k] = () => Promise.resolve();
    d.collect = () => {};
    g.togglePause = () => {};
    ui.openJournal = () => {};
    d.actCooldown = 1e9;
    d.timetable = { phase: 'wait', t: 1e9 };          // the tour runs the train itself
    d.tamo.hide();
    // Mika: frozen and hidden; her position follows the camera's subject so that life gathers there
    p.root.visible = false;
    p.update = () => {};
    // the valley as it is after the story: lamps lit, the viaduct whole, everybody home
    for (const L of S.lamps.values()) { L.target = 1; L.lit = 1; }
    R.setRepaired(true);
    for (const [id] of this.saved.people) if (id !== 'sora' || story === 'grandma') d.npcs[id].setVisible(true);
    g.weatherOff = false;
    this.focus = new THREE.Vector3();
    this.shot = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
    g.beforeUpdate = this.frame;
    addEventListener('keydown', this.onKey, true);
    document.addEventListener('visibilitychange', this.onHide);
    this.active = true; this.paused = false; this.done = false;
  }

  /** Leave the tour and give everything back. Synchronous: the game is whole again when this returns. */
  close() {
    if (!this.active) return;
    const g = this.g, d = this.d, ui = this.ui, p = g.player, S = g.structures, R = g.railway, T = R.train, s = this.saved;
    this.active = false;
    removeEventListener('keydown', this.onKey, true);
    document.removeEventListener('visibilitychange', this.onHide);
    this.cover(true, 0);
    // what the tour made
    this.fish?.dispose(); this.fish = null;
    if (this.stars) { this.stars.removeFromParent(); this.stars.geometry.dispose(); this.stars.material.dispose(); this.stars = null; }
    // the places' ambient life the tour woke (fireflies, frogs ...) goes back to sleep now, not when Mika next walks by
    const tr = d.tricks;
    if (tr?.ambientOn) for (const id of [...tr.ambientOn]) {
      const sign = tr.signs.find(x => x.t.id === id);
      try { if (sign) tr.mods[id]?.ambient?.(0, { ...tr.ambientCtx(sign.t), off: true }); } catch (e) { console.warn('[tour] ambient off', id, e); }
      tr.ambientOn.delete(id);
    }
    d.barks?.ui?.update?.(0, g.camera, true);
    // the small creatures the tour drew round its stops go back into their pool (they come out again round Mika)
    const cr = d.wildlife?.critters;
    try { for (const v of cr?.visuals || []) if (v.slot) cr.unbind(v); cr?.showWebs?.(s.player.pos, false); if (cr) cr.assignT = 0; } catch (e) { console.warn('[tour] critters', e); }
    // the story and the locks
    for (const k of ['save', 'canSave', 'canAim', 'event', 'run', 'say', 'collect']) delete d[k];
    delete g.togglePause; delete ui.openJournal; delete p.update;
    d.quest = s.quest;
    useStory(s.quest?.state.story ?? storyId());
    d.tourLock = s.tourLock;
    d.timetable = s.timetable; d.drawbridgeAngle = s.drawbridgeAngle; d.saveClock = s.saveClock; d.stepClock = s.stepClock; d.lastHour = s.lastHour;
    d.actCooldown = s.actCooldown; d.bees = s.bees;
    if (g.structures.nodes.drawbridge && s.drawbridgeAngle !== undefined) g.structures.nodes.drawbridge.rotation.x = s.drawbridgeAngle;
    for (const [pk, vis] of s.pickups) pk.obj.visible = vis;
    if (d.kiteStand) d.kiteStand.obj.visible = s.kiteStand;
    for (const [id, vis] of s.people) d.npcs[id].setVisible(vis);
    // Mika and Tamo
    p.pos.copy(s.player.pos);
    p.root.visible = s.player.visible;
    d.tamo.hidden = s.tamo.hidden; d.tamo.root.visible = s.tamo.visible; d.tamo.pos.copy(s.tamo.pos); d.tamo.light.intensity = s.tamo.light;
    // the valley
    for (const [id, target, lit] of s.lamps) { const L = S.lamps.get(id); L.target = target; L.lit = lit; }
    R.setRepaired(s.rail.repaired, s.rail.beams.filter(Boolean).length);
    if (R.repair) R.repair.visible = s.rail.repair;
    if (R.scaffold) R.scaffold.visible = s.rail.scaffold;
    (R.beams || []).forEach((b, i) => { b.visible = s.rail.beams[i]; });
    T.s = s.rail.s; T.v = s.rail.v; T.target = s.rail.target; T.cruise = s.rail.cruise; T.dir = s.rail.dir;
    g.celebrate?.decorate?.(s.decor);
    g.fx.meteorShower(s.meteors);
    // the look
    g.seasonOverride = s.seasonOverride; g.timeOverride = s.timeOverride; g.cycleHour = s.cycleHour; g.weatherOff = s.weatherOff; g.viewFocus = s.viewFocus;
    g.applyLook();
    g.beforeUpdate = s.beforeUpdate;
    g.follow.shot = s.follow.shot; g.follow.tracking = s.follow.tracking; g.follow.fovBase = s.follow.fovBase;
    g.follow.pos.copy(s.follow.pos); g.follow.look.copy(s.follow.look);
    g.camera.position.copy(s.cam.pos); g.camera.quaternion.copy(s.cam.quat); g.camera.fov = s.cam.fov; g.camera.near = s.cam.near;
    g.camera.updateProjectionMatrix();
    // the screen
    document.body.classList.remove('tour-on');
    $('hud').classList.toggle('hidden', s.hud);
    $('touch').classList.toggle('hidden', s.touch);
    $('title').classList.toggle('hidden', s.title);
    g.input.releaseAll();
    if (this.fromGame) {
      // back in the pause menu the game stands still: draw it once as it was, so no tour light lingers behind the menu
      this.settle();
      d.refreshObjective();
      g.paused = true;
      ui.open('pause');
      $('btnResume')?.focus({ preventScroll: true });
    } else {
      g.paused = s.paused;
      $('btnTitleTour')?.focus({ preventScroll: true });
    }
    this.saved = null;
    this.el.cap.classList.add('off');
    // the picture comes back out of the dark; the bar is gone at once
    this.el.view.querySelector('.tour-bar').style.display = 'none';
    this.cover(false, 450);
    clearTimeout(this.hideT);
    this.hideT = setTimeout(() => { if (!this.active) this.el.view.classList.add('hidden'); this.el.view.querySelector('.tour-bar').style.display = ''; }, 480);
  }

  /** One still "frame" of the world's look (sky, light, lamps, window glow) at the restored hour, with no game time passing. */
  settle() {
    const g = this.g;
    g.world.hour = g.shownHour();
    const L = g.world.update(0, g.player.pos);
    g.night = L.night;
    g.structures.update(0, L.night);
    g.world.lamps = g.structures.lampReflections();
    g.assets.setGlow('Window glow', L.night * 2.2);
    g.assets.setGlow('Lantern glow', 0.4 + L.night * 2.4);
    g.assets.setGlow('Street glow', L.night * 3);
    g.assets.setGlow('Headlamp glass', L.night * 4);
    g.railway.update(0, L.night);
  }

  // ---------------------------------------------------------------- flight
  cover(on, ms = 400) {
    const f = this.el.fade;
    f.style.transitionDuration = `${ms}ms`;
    if (!ms) void f.offsetWidth;
    f.classList.toggle('on', on);
  }

  /** Switch to tour k of the order (its season, weather and dressing), at its first stop or at time `t`. */
  setTour(k, t = 0) {
    const g = this.g;
    this.k = k;
    this.tour = this.order[k];
    this.tl = timeline(this.tour);
    this.t = Math.min(t, this.tl.length);
    this.done = false;
    this.fading = false;
    this.stopI = -1;
    g.seasonOverride = this.tour.season;
    g.applyLook();
    g.celebrate?.decorate?.(this.tour.festival ? 4 : this.saved.decor);
    this.capKey = null;
    this.el.cap.classList.add('off');
    this.syncUi();
    this.update(0, true);
  }

  /** Advance the flight by dt seconds (the game's frame calls this; tests may step it, `force` also while paused). */
  update(dt, force = false) {
    if (!this.active) return;
    const g = this.g;
    if ((this.paused && !force) || this.done) dt = 0;
    this.t += dt;
    const next = this.year && this.k < this.order.length - 1;
    if (this.t >= this.tl.length) {
      if (next) { this.setTour(this.k + 1); this.cover(false, 500); return; }
      this.t = this.tl.length;
      if (!this.done) { this.done = true; this.paused = true; this.syncUi(); }
    } else if (next && !this.fading && this.t > this.tl.length - 0.42) { this.fading = true; this.cover(true, 400); }

    const env = (this.env ??= { heightAt: (x, z) => g.world.heightAt(x, z), aspect: 1 });
    env.aspect = g.camera.aspect;
    const P = poseAt(this.tour, this.tl, this.t, env);
    this.pose = P;
    // camera: a held scripted shot, re-aimed every frame
    this.shot.pos.set(P.pos[0], P.pos[1], P.pos[2]);
    this.shot.look.set(P.look[0], P.look[1], P.look[2]);
    const F = g.follow;
    if (!F.shot || F.shot.tour !== this) { F.cutscene(this.shot, 0.001); F.shot.tour = this; }
    F.shot.to.pos.copy(this.shot.pos); F.shot.to.look.copy(this.shot.look);
    F.shot.from.pos.copy(this.shot.pos); F.shot.from.look.copy(this.shot.look);
    F.fovBase = env.aspect < 0.9 ? FOV.tall : FOV.wide;
    // the hour and the air
    g.timeOverride = P.hour;
    g.fx.setWeather(P.weather || null);
    // life gathers round the subject: detail, shadows, weather, ambient places and sounds all follow Mika's position
    this.focus.set(P.look[0], Math.max(g.world.heightAt(P.look[0], P.look[2]), 0), P.look[2]);
    g.player.pos.copy(this.focus);
    g.viewFocus = this.focus;

    // arriving at a stop
    const st = this.tour.stops[P.i], shot = shotOf(st);
    if (P.i !== this.stopI) {
      this.stopI = P.i;
      if (shot.does === 'train') this.runTrain(P.kind === 'travel' ? this.tl.segs.find(s => s.kind === 'dwell' && s.i === P.i).t0 - this.t : 0);
      this.syncUi();
    }
    const near = P.kind === 'dwell' ? 1 : P.f;       // 0 leaving the last stop .. 1 here
    const prev = P.kind === 'travel' ? shotOf(this.tour.stops[P.i - 1]) : null;
    // the school under the dock (not under winter's ice)
    const atFish = shot.does === 'fish' ? (near > 0.35 ? 1 : 0) : prev?.does === 'fish' && near < 0.4 ? 1 : 0;
    const fs = shot.does === 'fish' ? shot : prev?.does === 'fish' ? prev : null;
    if (fs) this.fishAt = fs.fish || [fs.look[0], fs.look[2]];
    this.fish.update(dt, atFish && !g.world.frozen ? 1 : 0, this.fishAt || [0, 0], g.night || 0);
    // shooting stars over the hill at night
    const sky = shot.does === 'stars' ? near : prev?.does === 'stars' ? 1 - near : 0, dark = Math.max(0, ((g.night || 0) - 0.5) * 2);
    g.fx.meteorShower(sky > 0.5 && this.tour.night ? 0.07 : this.saved.meteors);
    this.starDome(dt, sky * dark * (this.tour.night ? 1 : 0.6));
    // words and the bar
    this.caption(P.kind === 'dwell' || P.f > 0.55);
    const k = this.t / this.tl.length;
    if (Math.abs(k - (this.barK ?? -1)) > 0.002) { this.barK = k; this.el.bar.style.width = `${(k * 100).toFixed(1)}%`; }
  }

  /** The star dome of "look up at the sky" (game/skygaze.js), faded in over the stargazing hill; made when first wanted. */
  starDome(dt, want) {
    if (!this.stars && want <= 0) return;
    const g = this.g;
    if (!this.stars) { this.stars = buildStars(); this.stars.name = 'tour:stars'; g.scene.add(this.stars); this.starT = 0; }
    const u = this.stars.material.uniforms;
    u.uFade.value += (want - u.uFade.value) * Math.min(1, dt * 1.8);
    if (dt === 0 && want > 0) u.uFade.value = Math.max(u.uFade.value, want * 0.999);   // a stepped or paused view shows it at once
    this.stars.visible = u.uFade.value > 0.01;
    this.stars.position.copy(this.shot.pos);
    u.uPx.value = (g.renderer.renderer.domElement.height || innerHeight) / 720;
    u.uTime.value = (this.starT += dt);
  }

  /** The train sets off so that it is on the viaduct while the camera rests there (`lead` seconds from now). */
  runTrain(lead) {
    const R = this.g.railway, v = 9;
    R.placeAt(Math.max(STOPS.station + 4, STOPS.viaductWest + 22 - lead * v));
    R.train.v = lead > 0 ? v : v * 0.8;
    R.goTo(STOPS.halt, v);
  }

  caption(show = true) {
    const st = this.tour.stops[this.stopI];
    if (!st) return;
    const key = `${this.tour.id}:${this.stopI}`;
    if (show && this.capKey !== key) {
      this.capKey = key;
      const c = this.el.cap;
      c.querySelector('small').textContent = tx(TEXT.of, { season: tx(this.tour.name), i: this.stopI + 1, n: this.tour.stops.length });
      c.querySelector('h2').textContent = tx(TOUR_PLACES[st.place].name);
      c.querySelector('p').textContent = tx(st.line);
    }
    this.el.cap.classList.toggle('off', !show || this.capKey !== key);
  }

  syncUi() {
    const v = this.el.view;
    const b = v.querySelector('[data-do=pause]');
    b.textContent = tx(this.done ? TEXT.replay : this.paused ? TEXT.resume : TEXT.pause);
    v.querySelectorAll('.tour-seasons button').forEach(x => x.classList.toggle('on', x.dataset.tour === this.tour?.id));
    v.querySelector('.tour-status').textContent = this.done ? tx(TEXT.done) : '';
    this.el.prog.setAttribute('aria-valuenow', String(Math.round((this.t / (this.tl?.length || 1)) * 100)));
  }

  // ---------------------------------------------------------------- controls
  togglePause() {
    if (!this.active) return;
    if (this.done) return this.replay();
    this.paused = !this.paused;
    this.syncUi();
  }

  /** A cut inside the tour (to a stop or another season) hides behind a short dip to dark. */
  cut(fn) {
    this.cover(true, 0);
    fn();
    this.cover(false, 450);
  }

  goStop(i) {
    if (!this.active) return;
    this.cut(() => {
      this.t = stopTime(this.tl, Math.max(0, Math.min(this.tour.stops.length - 1, i)));
      if (this.done) { this.done = false; this.paused = false; }
      this.fading = false;
      this.stopI = -1; this.capKey = null;
      this.update(0, true);
      this.syncUi();
    });
  }

  next() {
    if (!this.active) return;
    const i = (this.pose?.i ?? 0) + 1;
    if (i < this.tour.stops.length) return this.goStop(i);
    if (this.year && this.k < this.order.length - 1) this.cut(() => { this.paused = false; this.setTour(this.k + 1); });
  }

  prev() {
    if (!this.active) return;
    const P = this.pose, i = P?.i ?? 0;
    // early in a stop "previous" means the stop before; later it means this stop again
    const here = P?.kind === 'dwell' && this.t - stopTime(this.tl, i) > 1.5 && !this.done;
    if (here || P?.kind === 'travel') return this.goStop(P.kind === 'travel' ? i - 1 : i);
    if (i > 0) return this.goStop(i - 1);
    if (this.year && this.k > 0) this.cut(() => { this.paused = false; this.setTour(this.k - 1); });
    else this.goStop(0);
  }

  /** Jump to another season's tour (in "whole year" the tour then carries on from there). */
  jump(id) {
    if (!this.active || !TOUR[id]) return;
    this.cut(() => {
      if (!this.year) this.order = [TOUR[id]];
      this.paused = false;
      this.setTour(this.year ? this.order.indexOf(TOUR[id]) : 0);
    });
  }

  replay() {
    if (!this.active) return;
    this.cut(() => { this.paused = false; this.setTour(this.year ? 0 : this.k); });
  }

  onKey(e) {
    if (!this.active || e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.code) || e.code === 'Tab') return;
    // the tour owns the keyboard: nothing reaches the game's own keys (pause menu, journal, movement)
    e.stopImmediatePropagation();
    if (e.code === 'Enter' && e.target instanceof HTMLButtonElement) return;   // a focused button still works with Enter
    e.preventDefault();
    if (e.repeat) return;
    const c = e.code;
    if (c === 'Escape' || c === 'Backspace') this.close();
    else if (c === 'KeyP' || c === 'Space' || c === 'Enter') this.togglePause();
    else if (c === 'ArrowRight' || c === 'KeyD') this.next();
    else if (c === 'ArrowLeft' || c === 'KeyA') this.prev();
    else if (c === 'KeyR') this.replay();
    else if (/^Digit[1-5]$/.test(c)) this.jump(TOURS[+c.slice(5) - 1].id);
  }

  /** For tests and look-dev. */
  debug() {
    const P = this.pose;
    return { active: this.active, paused: this.paused, done: this.done, tour: this.tour?.id || null, year: !!this.year, t: this.t, length: this.tl?.length || 0, stop: P?.i ?? -1, kind: P?.kind || null,
      place: this.tour ? this.tour.stops[P?.i ?? 0]?.place : null, hour: P?.hour ?? null, pos: P?.pos || null, look: P?.look || null, fish: !!this.fish?.mesh.visible, fromGame: !!this.fromGame };
  }
}

/** Open the picker (the entry from Settings and from the title menu). One tour object per game. */
export function openTour(game) {
  game.tour ??= new SceneTour(game);
  game.tour.openPicker();
  return game.tour;
}
