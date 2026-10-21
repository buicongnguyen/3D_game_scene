import './mobile-game-init.mjs';
import * as THREE from 'three';
import { Game } from './game/game.js';
import { exploreState } from './game/fastforward.js';
import { UI } from './ui/ui.js';
import { Audio } from './engine/audio.js';
import { PALETTES } from './world/seasons.js';
import { detectLang, setLang, tx } from './i18n/i18n.js';
import { loadSave, clearSave, saveSlots, lastSlot } from './game/saves.js';
import { quickStartWanted } from './quick/switch.js';
import { TitleStill } from './quick/title-still.js';
import { registerServiceWorker } from './sw-register.js';
// QUICK START. This file must stay light: it is what a phone downloads before the title menu shows. The valley's own
// code (the Director, the weather, the QA helpers: ./valley.js) and the quick-start runtime (./quick/runtime.js) are
// fetched with import() when they are first needed. Do NOT import them (or anything under world/, actors/, fx/) here,
// and do NOT add a top-level await below the two that exist: every chunk fetched on demand depends on this module
// and would hang until that await is done.

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game');

addEventListener('error', e => showError(e.message));
addEventListener('unhandledrejection', e => showError(e.reason?.message || String(e.reason)));
function showError(msg) {
  console.error(msg);
  const el = document.getElementById('err');
  if (el && params.has('qa')) { el.textContent = msg; el.classList.remove('hidden'); }
}

await setLang(params.get('lang') || detectLang());

// Starline draws with WebGL 2. A browser can refuse it for a moment (the GPU has just reset) or for the whole session
// (3D switched off after a graphics crash or when memory ran out), so try a few times, then say which it is.
async function probeWebGL() {
  const tryGet = kind => {
    let gl = null;
    try { gl = document.createElement('canvas').getContext(kind); } catch { /* ignore */ }
    gl?.getExtension('WEBGL_lose_context')?.loseContext(); // don't keep a spare context alive
    return !!gl;
  };
  for (let i = 0; i < 3; i++) {
    if (tryGet('webgl2')) return 'ok';
    await new Promise(r => setTimeout(r, 700));
  }
  return tryGet('webgl') ? 'old' : 'off';
}

function glMessage(text, button, onClick) {
  const label = document.getElementById('loadLabel');
  label.textContent = text;
  const b = document.createElement('button');
  b.className = 'retry';
  b.textContent = button;
  b.addEventListener('click', onClick);
  label.after(b);
}

const glState = await probeWebGL();
if (glState !== 'ok') {
  glMessage(glState === 'old'
    ? tx('Starline needs WebGL 2, and this browser only offers WebGL 1. Please try a recent Chrome, Edge, Firefox or Safari.')
    : tx('3D graphics are switched off in this browser right now. That can happen after the graphics card or the browser ran out of memory. Close other tabs or restart the browser, check that hardware acceleration is on, and try again.'),
  tx('Try again'), () => location.reload());
  throw new Error(`WebGL2 unavailable (${glState})`);
}

const game = new Game(canvas, params);
// Graphics lost mid-game (a GPU reset, or a phone short of memory): keep the progress and offer a clean reload
// instead of a frozen picture.
canvas.addEventListener('webglcontextlost', e => {
  e.preventDefault();
  try { game.director?.save?.(); } catch { /* ignore */ }
  // quick start: the title menu and the card games are drawn by the page itself. Nothing of theirs was lost; if the
  // context is still gone when the valley is wanted, loadValley() says so then.
  if (game.quickBoot && !game.world && (!game.quick || game.quick.dom)) return;
  glLostNotice();
});
function glLostNotice() {
  if (document.getElementById('glLost')) return;
  const el = document.createElement('div');
  el.id = 'glLost';
  el.innerHTML = `<div class="panel"><p></p><button class="retry"></button></div>`;
  el.querySelector('p').textContent = tx('The graphics were interrupted. Your progress is saved.');
  const b = el.querySelector('button');
  b.textContent = tx('Reload');
  b.addEventListener('click', () => location.reload());
  document.body.appendChild(el);
}
// three.js rebuilds its GPU resources by itself when the browser gives the context back; then the game simply goes on
canvas.addEventListener('webglcontextrestored', () => document.getElementById('glLost')?.remove());
const audio = new Audio();
game.audio = audio;
const ui = new UI(game, audio);
game.ui = ui;

window.__STARLINE__ = game;
// Which runtime owns the screen now: 'title' (the menu; nothing of the valley is loaded), 'quick' (a quick-start mini
// game, src/quick/runtime.js), 'loading' (the valley is being fetched and built) or 'valley'.
window.__STARLINE_RUNTIME__ = 'title';
// Quick start (src/quick/switch.js): the title comes first and the valley is loaded when something needs it.
// ?quick=off keeps the old order (the valley, then the title over it), to compare the two.
const quickBoot = game.quickBoot = quickStartWanted(params);
if (quickBoot && params.has('qa')) window.__STARLINE_QA__ = { game, ui, errors: [] };   // (the valley's own QA helpers replace this when it loads)

let V = null, director = null, valleyP = null, valleyReady = false;
/** Fetch the valley's code, then load and build the valley and its Director. Once; before quick start this ran above the title. */
const loadValley = () => (valleyP ??= (async () => {
  window.__STARLINE_RUNTIME__ = 'loading';
  if (game.renderer.renderer.getContext().isContextLost()) glLostNotice();     // (lost while only the title or a card game was up)
  V = await import('./valley.js');
  await game.load((p, label) => ui.setLoad(p, label));
  game.fx = new V.FX(game.scene, game.renderer.q);
  ui.applySettings?.(); // the world exists now: apply saved view settings (season, time, shadows, FOV…)
  game.renderer.onResize = (w, h) => { game.camera.aspect = w / h; game.camera.updateProjectionMatrix(); game.fx.resize(game.renderer.pixelRatio); };
  game.fx.resize(game.renderer.pixelRatio); // the first pass ran before the FX existed
  director = new V.Director(game, ui, audio, game.fx);
  game.director = director;
  game.celebrate = new V.Celebrate(game); // chapter celebrations and the valley's lasting decorations
  game.systems.push(director);
  if (params.has('qa')) V.attachQA(game, director, ui);
  valleyReady = true;
  window.__STARLINE_RUNTIME__ = 'valley';
})());

/** Title: the valley at golden hour behind the menu, with a slow drifting camera. */
function titleLook() {
  game.setSeason('autumn');
  game.time.hour = 17.3;
  game.fx.setWeather('leaves');
  game.player.root.visible = false;
  let titleT = 0;
  game.beforeUpdate = dt => {
    titleT += dt;
    const a = titleT * 0.02;
    game.follow.cutscene({ pos: new THREE.Vector3(-70 + Math.sin(a) * 30, 34, 180 + Math.cos(a) * 12), look: new THREE.Vector3(5, 14, 110) }, 0.001);
  };
  game.railway.placeAt(game.railway.train.s);
}

// Nothing below may be a top-level await: in the built site every chunk imported on demand (the valley, the quick
// runtime, the title video, the scene tour) depends on this module and would hang until the await is done.
(async () => {
  if (!quickBoot) await loadValley();

  // Look-dev viewer mode (screenshots): ?view=x,y,z,tx,ty,tz
  if (params.has('view')) {
    game.setSeason(params.get('season') || 'spring');
    game.time.hour = Number(params.get('hour') ?? 10);
    game.fx.setWeather(PALETTES[game.time.season].particles);
    V.viewerCamera(game.camera, params);
    const look = new THREE.Vector3(...params.get('view').split(',').slice(3).map(Number));
    game.follow.cutscene({ pos: game.camera.position.clone(), look }, 0.001);
    ui.hideLoading();
    game.player.root.visible = false;
    game.start();
    window.__STARLINE_READY__ = true;
    return;
  }

  let still = null, underTitle = null;
  if (valleyReady) { titleLook(); ui.hideLoading(); game.start(); }
  else {
    // quick start: a filmed still of the valley behind the menu; no 3D yet
    still = new TitleStill();
    ui.hideLoading();
    // the title's Scene tour shows the valley: it is loaded under the title, which then is the usual live one
    game.needValley = () => (underTitle ??= (async () => {
      const title = document.getElementById('title'), shown = !title.classList.contains('hidden');
      title.classList.add('hidden');
      ui.showLoading();
      await loadValley();
      titleLook();
      still?.remove(); still = null;
      game.start();
      if (shown) title.classList.remove('hidden');
      ui.titleClip();
      ui.hideLoading();
    })());
  }
  window.__STARLINE_READY__ = true;
  registerServiceWorker(params);

  const unlockAudio = () => { if (!params.has('mute')) { try { audio.unlock(); } catch (e) { console.warn('audio unavailable', e); } } };
  const auto = params.get('start'); // qa: ?start=new|continue[&slot=n] skips the title
  let picked = null;
  while (!picked) {
    picked = auto ? { mode: auto, slot: +params.get('slot') || 1, story: params.get('story') || undefined } : await ui.title(saveSlots(), lastSlot());
    const launch = ui.pendingLaunch;
    if (valleyP || !launch?.quick) break;
    // A game that needs no valley, picked from the title's Mini games list: the quick-start runtime plays it, and the
    // ones picked after it. It comes back with null (the list was closed: the title again) or with a game that does
    // need the valley ({ e, plan }), which then starts the way it always has.
    unlockAudio();
    let next = null;
    try {
      const { runQuick } = await import('./quick/runtime.js');
      ui.pendingLaunch = null;
      next = await runQuick({ game, ui, audio, params, id: launch.id, onPlay: on => still?.rest(on) });
    } catch (e) { console.error('[quick] not available: the valley plays it', e); if (ui.pendingLaunch) break; }
    if (next) ui.pendingLaunch = { id: next.e.id };
    picked = next ? { mode: 'explore', slot: 'explore', season: next.plan.season, hour: next.plan.hour, fresh: false } : null;
  }

  if (!valleyReady) {
    // quick start: now the valley is needed. The quick runtime lets go of everything it made, the loading screen
    // comes back ("Shaping the valley…") and the game starts as soon as the valley stands.
    document.getElementById('title').classList.add('hidden');
    game.quick?.dispose();
    ui.showLoading();
    await (underTitle || loadValley());
    still?.remove(); still = null;
    game.railway.placeAt(game.railway.train.s);
    game.start();
    ui.hideLoading();
  }

  const choice = picked.mode;
  director.slot = picked.slot;
  director.newStory = picked.story;      // which story a new game plays (the title's story card)
  let saved = loadSave(picked.slot);
  if (choice === 'explore') {
    // Explore mode: its own save; the first time (or "start over") it begins in a valley where the story is done
    director.explore = true;
    if (!saved || picked.fresh) saved = { v: 1, quest: exploreState(), player: { x: -45, y: 4, z: 27, facing: Math.PI }, at: Date.now() };
    game.seasonOverride = picked.season || null;
    game.timeOverride = picked.hour ?? null;
    game.cycleHour = undefined;
  }
  unlockAudio();
  game.beforeUpdate = null;
  game.player.root.visible = true;
  ui.showHud(true);
  game.follow.clearCutscene();
  if (choice === 'new') { clearSave(picked.slot); try { localStorage.removeItem(`starline-album-${picked.slot}`); } catch { /* ignore */ } }
  const started = director.begin(choice === 'continue' || choice === 'explore' ? saved : null);
  window.__STARLINE_PLAYING__ = true;
  await started;
})().catch(e => { console.error('[start]', e); showError(e?.message || String(e)); });
