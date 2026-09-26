import * as THREE from 'three';
import { Game } from './game/game.js';
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

const webgl2 = (() => { try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; } })();
if (!webgl2) {
  document.getElementById('loadLabel').textContent = tx('Starline needs WebGL 2. Please try a recent Chrome, Edge, Firefox or Safari.');
  throw new Error('WebGL2 unavailable');
}

const game = new Game(canvas, params);
const audio = new Audio();
game.audio = audio;
const ui = new UI(game, audio);
game.ui = ui;

await game.load((p, label) => ui.setLoad(p, label));
game.fx = new FX(game.scene, game.renderer.q);
ui.applySettings?.(); // the world exists now: apply saved view settings (season, time, shadows, FOV…)
game.renderer.onResize = (w, h) => { game.camera.aspect = w / h; game.camera.updateProjectionMatrix(); game.fx.resize(); };
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
  const saved = Director.loadSave(picked.slot);
  if (!params.has('mute')) { try { audio.unlock(); } catch (e) { console.warn('audio unavailable', e); } }
  game.beforeUpdate = null;
  game.player.root.visible = true;
  ui.showHud(true);
  game.follow.clearCutscene();
  if (choice === 'new') { Director.clearSave(picked.slot); try { localStorage.removeItem(`starline-album-${picked.slot}`); } catch { /* ignore */ } }
  const started = director.begin(choice === 'continue' ? saved : null);
  window.__STARLINE_PLAYING__ = true;
  await started;
}
