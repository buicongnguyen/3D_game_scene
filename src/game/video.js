// Recorded video in place of live 3D on phones (docs/VIDEO.md): the title's backdrop, the new game's arrival and the
// scene tour (game/tour.js uses the layer from here). The clips are filmed from the real game by
// scripts/record-videos.mjs; only the picture is video: captions, buttons and fades stay live HTML, so they are
// translated and tappable as ever. While a clip shows, the 3D renderer is held (renderer.hold): the phone decodes a
// video instead of drawing the valley.
// Anything that goes wrong (no file, no H.264, autoplay refused, a stall) falls back to live 3D.
// Loaded on demand: desktops that never ask for video never fetch this file.
import * as THREE from 'three';
import { CAPTIONS } from './story.js';
import { storyId } from './stories/index.js';
import { tx } from '../i18n/i18n.js';
import { STOPS } from '../world/railway.js';
import { RAIL_Y } from '../world/layout.js';
import { VIDEO_DIR, clipKey } from '../content/video.js';

const BASE = new URL(VIDEO_DIR, document.baseURI).href;
const CSS = `
#sceneVideo{position:fixed;inset:0;width:100%;height:100%;object-fit:cover;background:#0b1024 center/cover no-repeat;z-index:1;opacity:0;transition:opacity .35s;pointer-events:none}
#sceneVideo.on{opacity:1}
#sceneVideo.hidden{display:none}
#introSkip{position:fixed;right:calc(14px + env(safe-area-inset-right,0px));bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:19;min-width:88px;min-height:44px;padding:0 16px;border:0;border-radius:14px;
 background:rgba(11,16,36,.72);color:#fff;font:800 15px var(--ui,Nunito,sans-serif);cursor:pointer;-webkit-tap-highlight-color:transparent}
#introSkip:hover,#introSkip:focus-visible{background:rgba(11,16,36,.9);outline:none}
`;

/** Phones (the Low tier) get video by default; everything else draws live. */
export const lowTier = game => game.renderer.qualityName === 'low';

let manifestP = null;
/** public/video/manifest.json (written by the recorder), or null when there are no videos. */
export function loadManifest() {
  return (manifestP ??= fetch(`${BASE}manifest.json`).then(r => (r.ok ? r.json() : null)).then(m => (m?.clips ? m : null)).catch(() => null));
}

/** Can this browser play the clips at all? (H.264 in MP4; some open-source browser builds cannot.) */
export function canPlay() {
  try { return !!document.createElement('video').canPlayType('video/mp4; codecs="avc1.640020"'); } catch { return false; }
}

/** The manifest entry of clip `id` for this screen (portrait screens take the tall cut), with its URLs; or null. */
export async function clipFor(id) {
  const m = await loadManifest();
  const c = m?.clips[clipKey(id, innerWidth, innerHeight)];
  return c ? { ...c, key: clipKey(id, innerWidth, innerHeight), url: BASE + c.file, posterUrl: BASE + c.posterFile } : null;
}

/**
 * The one <video> the game shows pictures on: over the canvas, under every piece of UI. Muted and inline (phones
 * only autoplay such videos); nothing is downloaded before a clip is asked for.
 */
export class VideoLayer {
  constructor(game) {
    this.g = game;
    if (!document.getElementById('sceneVideoCss')) { const s = document.createElement('style'); s.id = 'sceneVideoCss'; s.textContent = CSS; document.head.appendChild(s); }
    const v = this.el = document.createElement('video');
    v.id = 'sceneVideo';
    v.className = 'hidden';
    v.muted = true; v.defaultMuted = true; v.playsInline = true; v.preload = 'metadata';
    v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
    v.disablePictureInPicture = true; v.disableRemotePlayback = true;
    v.setAttribute('aria-hidden', 'true'); v.tabIndex = -1;
    document.getElementById('game').after(v);
    this.owner = null;
  }

  static of(game) { return (game.videoLayer ??= new VideoLayer(game)); }

  /**
   * Show a clip and start it. Resolves true once pictures are really coming; false if it cannot be played (then the
   * layer is hidden again and the caller draws live). The poster shows at once; the renderer is held once the
   * video is running (the frames drawn underneath until then warm the scene).
   */
  async show(clip, { owner, loop = false, at = 0, autoplay = true, timeout = 9000 } = {}) {
    const v = this.el, token = (this.token = (this.token || 0) + 1);
    this.owner = owner; this.clip = clip;
    v.loop = loop;
    v.style.backgroundImage = `url("${clip.posterUrl}")`;
    v.poster = clip.posterUrl;
    v.classList.remove('hidden');
    void v.offsetWidth;
    v.classList.add('on');
    const ok = await new Promise(res => {
      const done = r => { clearTimeout(timer); v.removeEventListener('error', bad); v.removeEventListener(autoplay ? 'playing' : 'loadeddata', good); res(r); };
      const good = () => done(true), bad = () => done(false);
      const timer = setTimeout(bad, timeout);
      v.addEventListener('error', bad);
      v.addEventListener(autoplay ? 'playing' : 'loadeddata', good);
      v.src = clip.url;
      if (at > 0) v.currentTime = at;
      if (autoplay) v.play().catch(bad); else v.load();
    });
    if (token !== this.token) return false;         // something else took the layer meanwhile
    if (!ok) { this.hide(owner); return false; }
    this.g.renderer.hold = true;
    return true;
  }

  /** Take the picture away (only its owner may) and let the renderer draw again. `fade`: dissolve to the live view. */
  hide(owner, fade = false) {
    if (owner !== undefined && this.owner !== owner) return;
    const v = this.el;
    this.token = (this.token || 0) + 1;
    this.owner = null; this.clip = null;
    this.g.renderer.hold = false;
    v.pause();
    v.classList.remove('on');
    clearTimeout(this.hideT);
    const off = () => { v.classList.add('hidden'); v.removeAttribute('src'); v.removeAttribute('poster'); v.style.backgroundImage = ''; try { v.load(); } catch { /* ignore */ } };
    if (fade) this.hideT = setTimeout(() => { if (!this.owner) off(); }, 380); else off();
  }
}

// ------------------------------------------------------------------ the title's backdrop
/**
 * On phones the title's slow view of the valley is a short looping clip, and the valley is not drawn under it.
 * suspend()/resume() let the tour borrow the screen; stop() ends it for good (the game is starting).
 */
export class TitleLoop {
  constructor(game) { this.g = game; this.on = false; this.paused = 0; }

  static of(game) { return (game.titleLoop ??= new TitleLoop(game)); }

  async start() {
    if (this.on || this.stopped) return;
    this.on = true;
    await this.play();
  }

  async play() {
    if (!this.on || this.paused || this.stopped || !canPlay()) return;
    const clip = await clipFor('title');
    if (!clip || !this.on || this.paused || this.stopped) return;
    const layer = VideoLayer.of(this.g);
    if (layer.owner && layer.owner !== this) return;
    await layer.show(clip, { owner: this, loop: true });
  }

  suspend() { this.paused++; VideoLayer.of(this.g).hide(this); }
  resume() { this.paused = Math.max(0, this.paused - 1); return this.play(); }
  stop() { this.stopped = true; this.on = false; if (this.g.videoLayer) this.g.videoLayer.hide(this, true); }
}

// ------------------------------------------------------------------ the arrival
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const wait = ms => new Promise(r => setTimeout(r, ms));
const frames = n => new Promise(r => { const f = () => (n-- > 0 ? requestAnimationFrame(f) : r()); f(); });

/** Where the live arrival leaves the valley: the train in the station, Mika and Genzo on the platform, the camera on them. */
function arrivalEndState(scenes) {
  const g = scenes.g, d = scenes.d;
  g.railway.placeAt(STOPS.station);
  g.player.root.visible = true;
  g.player.teleport(-94.5, 115.2, undefined, Math.PI / 2);
  g.follow.yaw = Math.PI / 2;
  d.npcs.genzo.setVisible(true);
  d.npcs.genzo.place(-91.8, 115.4, -Math.PI / 2, RAIL_Y + 0.95);
  g.follow.cutscene({ pos: V(-90, 19.2, 110.5), look: V(-93, 17.3, 115.4) }, 0.01);
}

/**
 * The new game's arrival as a recorded clip (called by scenes.arrival on the Low tier). The same captions are told
 * live over it and a Skip button ends it early. Underneath, the valley is put straight into the state the live
 * cutscene ends in and drawn for a moment (its shaders compile out of sight), so the cut back to live is clean.
 * Resolves true when the clip stood in for the cutscene; false when it could not play (the live one then runs).
 */
export async function playArrival(scenes) {
  const g = scenes.g, d = scenes.d, ui = d.ui;
  if (!canPlay()) return false;
  const clip = await clipFor(`intro-${storyId()}`);
  if (!clip) return false;
  g.titleLoop?.stop();
  await ui.fade(true, 10);
  const layer = VideoLayer.of(g), v = layer.el, owner = {};
  // pictures first: if the clip cannot start, nothing has been changed and the live cutscene takes over
  const ok = await layer.show(clip, { owner, timeout: 7000 });
  if (!ok) return false;
  g.renderer.hold = false;                           // the valley is drawn under the clip for its first second: warm-up
  arrivalEndState(scenes);
  ui.cinema(true);
  let skipped = false, ended = false;
  const told = Promise.all(CAPTIONS.arrival.map(c => ui.caption(c, 4300)));
  const skip = document.createElement('button');
  skip.id = 'introSkip'; skip.type = 'button';
  skip.textContent = `${tx('Skip')} ▸▸`;
  document.body.appendChild(skip);
  const finish = new Promise(res => {
    const end = () => { if (!ended) { ended = true; res(); } };
    skip.addEventListener('click', () => { skipped = true; end(); });
    v.addEventListener('ended', end, { once: true });
    v.addEventListener('error', end, { once: true });
    // the whistles of the live scene, on the clip's own clock; and a watchdog for a clip that stops coming
    const marks = clip.marks || {}, blown = {};
    let last = -1, stuck = 0;
    const tick = () => {
      if (ended) return;
      const t = v.currentTime;
      for (const k of ['whistle', 'platform']) if (marks[k] !== undefined && t >= marks[k] && !blown[k]) { blown[k] = true; d.audio.whistle(); }
      stuck = t === last && !v.paused ? stuck + 1 : 0;
      last = t;
      if (stuck > 60 * 8 || t >= clip.duration - 0.04) return end();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await ui.fade(false, 1600);
  if (!ended) g.renderer.hold = true;
  await finish;
  skip.remove();
  // back to live: draw the platform again under the last picture, then dissolve
  g.renderer.hold = false;
  await frames(3);
  layer.hide(owner, true);
  if (skipped) ui.clearCaptions?.(); else await told;
  ui.cinema(false);
  await wait(skipped ? 150 : 400);
  return true;
}
