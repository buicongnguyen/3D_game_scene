import * as THREE from 'three';
import { Game } from './game/game.js';
import { exploreState } from './game/fastforward.js';
import { UI } from './ui/ui.js';
import { Audio } from './engine/audio.js';
import { FX } from './fx/fx.js';
import { Director } from './game/director.js';
import { viewerCamera } from './dev/viewer.js';
import { PALETTES } from './world/seasons.js';
import { attachQA } from './dev/qa.js';
import { detectLang, setLang, tx } from './i18n/i18n.js';
import { Celebrate } from './fx/celebrate.js';

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
  if (document.getElementById('glLost')) return;
  const el = document.createElement('div');
  el.id = 'glLost';
  el.innerHTML = `<div class="panel"><p></p><button class="retry"></button></div>`;
  el.querySelector('p').textContent = tx('The graphics were interrupted. Your progress is saved.');
  const b = el.querySelector('button');
  b.textContent = tx('Reload');
  b.addEventListener('click', () => location.reload());
  document.body.appendChild(el);
});
// three.js rebuilds its GPU resources by itself when the browser gives the context back; then the game simply goes on
canvas.addEventListener('webglcontextrestored', () => document.getElementById('glLost')?.remove());
const audio = new Audio();
game.audio = audio;
const ui = new UI(game, audio);
game.ui = ui;

await game.load((p, label) => ui.setLoad(p, label));
game.fx = new FX(game.scene, game.renderer.q);
ui.applySettings?.(); // the world exists now: apply saved view settings (season, time, shadows, FOV…)
game.renderer.onResize = (w, h) => { game.camera.aspect = w / h; game.camera.updateProjectionMatrix(); game.fx.resize(game.renderer.pixelRatio); };
game.fx.resize(game.renderer.pixelRatio); // the first pass ran before the FX existed
const director = new Director(game, ui, audio, game.fx);
game.director = director;
game.celebrate = new Celebrate(game); // chapter celebrations and the valley's lasting decorations
game.systems.push(director);
window.__STARLINE__ = game;
if (params.has('qa')) attachQA(game, director, ui);

// Look-dev viewer mode (screenshots): ?view=x,y,z,tx,ty,tz
if (params.has('view')) {
  game.setSeason(params.get('season') || 'spring');
  game.time.hour = Number(params.get('hour') ?? 10);
  game.fx.setWeather(PALETTES[game.time.season].particles);
  viewerCamera(game.camera, params);
  const look = new THREE.Vector3(...params.get('view').split(',').slice(3).map(Number));
  game.follow.cutscene({ pos: game.camera.position.clone(), look }, 0.001);
  ui.hideLoading();
  game.player.root.visible = false;
  game.start();
  window.__STARLINE_READY__ = true;
} else {
  // Title: the valley at golden hour behind the menu, with a slow drifting camera.
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
  ui.hideLoading();
  game.start();
  window.__STARLINE_READY__ = true;
  const auto = params.get('start'); // qa: ?start=new|continue[&slot=n] skips the title
  const picked = auto ? { mode: auto, slot: +params.get('slot') || 1 } : await ui.title(Director.slots(), Director.lastSlot());
  const choice = picked.mode;
  director.slot = picked.slot;
  let saved = Director.loadSave(picked.slot);
  if (choice === 'explore') {
    // Explore mode: its own save; the first time (or "start over") it begins in a valley where the story is done
    director.explore = true;
    if (!saved || picked.fresh) saved = { v: 1, quest: exploreState(), player: { x: -45, y: 4, z: 27, facing: Math.PI }, at: Date.now() };
    game.seasonOverride = picked.season || null;
    game.timeOverride = picked.hour ?? null;
    game.cycleHour = undefined;
  }
  if (!params.has('mute')) { try { audio.unlock(); } catch (e) { console.warn('audio unavailable', e); } }
  game.beforeUpdate = null;
  game.player.root.visible = true;
  ui.showHud(true);
  game.follow.clearCutscene();
  if (choice === 'new') { Director.clearSave(picked.slot); try { localStorage.removeItem(`starline-album-${picked.slot}`); } catch { /* ignore */ } }
  const started = director.begin(choice === 'continue' || choice === 'explore' ? saved : null);
  window.__STARLINE_PLAYING__ = true;
  await started;
}
