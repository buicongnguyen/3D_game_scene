// QUICK START: the mini games that need no valley, played from the title's Mini games list without loading or building
// the valley (no world, no terrain, no forests, no villagers, no Director, not one model file).
//
// How it fits together
//   * src/main.js shows the title before the valley exists. A pick from the list that is marked `quick` in the catalogue
//     (content/minigames.js) comes here: runQuick() plays it, opens the list again after it, plays the next quick pick,
//     and returns null (the list was closed: the title menu again) or { e, plan } for a game that does need the valley
//     (main.js then loads the valley and starts it as always; dispose() has let go of everything made here first).
//   * The games are NOT forked. The round runners are the valley's own classes, Tricks (game/tricks.js: level picker,
//     HUD, how-to card, results card, records) and Yard (game/yard/round.js: the sims, the camera framing, HUD, hints,
//     pad buttons, results), given a stand-in `game` and `director` made here: a flat "world", a camera rig that cuts
//     straight to the shot, a Mika and a playmate who exist only as positions, and the same Input, Audio, UI and renderer
//     as the full game. `game.quickStart` is what the three places that differ ask (no signposts; no focus session: there
//     is no valley to still; a drawn face for the playmate's chip).
//   * The card games draw nothing in 3D: a painted still scene (./art.js) lies under their board and the frame loop
//     only reads the input. Marbles and ô ăn quan draw a tiny scene of their own straight to the screen (the ground,
//     the mat with the ring or the board, the pieces, the aim line): no shadow pass, no post-processing.
//   * Records: the same Explore save the title's Mini games session has always used (saves.js 'explore'): stars, bests
//     and levels earned here are what the full game shows, and the other way round.
// Loaded on demand (import() in main.js) and it imports nothing of the valley: see the chunk list `vite build` prints.
import * as THREE from 'three';
import { Quest } from '../game/quest.js';
import { exploreState } from '../game/fastforward.js';
import { loadSave, saveKey } from '../game/saves.js';
import { TRICK } from '../content/tricks.js';
import { YARDS, YARD_NAMES, setGameOn, stageOf } from '../content/yard.js';
import { PEOPLE } from '../content/townsfolk.js';
import { MinigameStop } from '../ui/minigame-stop.js';
import { tx } from '../i18n/i18n.js';
import { CSS, sceneFor, groundTexture, GROUND_COLOUR, faceOf } from './art.js';

const GROUND_HALF = 9;
const $ = id => document.getElementById(id);

/** Mika where nobody is drawn: a place and a heading for the round runners to write to. */
function standInPlayer() {
  const root = new THREE.Object3D();
  return {
    root, model: null, pivot: null, anim: null, carry: null, events: [], pos: new THREE.Vector3(), vel: new THREE.Vector3(), facing: 0, speed: 0, locked: false, mounted: false,
    teleport(x, z, y, facing) { this.pos.set(x, y ?? 0, z); root.position.copy(this.pos); if (facing !== undefined) this.facing = facing; },
    turnTo(a) { this.facing = a; },
  };
}

/** The camera rig: a round's shot is simply where the camera is (nothing to glide through, nothing to collide with). */
function standInFollow(camera) {
  let fov = camera.fov;
  return {
    camera, yaw: 0, pitch: 0.3, first: false, zoomTarget: 6, look: new THREE.Vector3(),
    get fovBase() { return fov; },
    set fovBase(v) { fov = v; if (camera.fov !== v) { camera.fov = v; camera.updateProjectionMatrix(); } },
    cutscene(shot) { camera.position.copy(shot.pos); camera.lookAt(shot.look); this.look.copy(shot.look); },
    clearCutscene() {}, track() {},
  };
}

/** A playmate for the yard games, shaped like a Town Life person (`p` is the real one from content/townsfolk.js). */
function standInKid(p) {
  const root = new THREE.Object3D();
  root.visible = false;
  return {
    p, face: faceOf(p.id), yardHold: false, yPath: null,
    n: {
      root, model: null, pos: root.position, anim: null, visible: true, far: true, riding: false, sitting: false, path: null, facing: 0, targetFacing: 0, idleClip: 'Idle',
      place(x, z, facing = 0) { root.position.set(x, 0, z); this.facing = facing; },
      setIdle() {}, setDetail() {}, setHidden() {}, walk(path, done) { done?.(); }, head(out) { return out.copy(root.position); },
    },
  };
}

export class QuickRuntime {
  constructor({ game, ui, audio, params, onPlay = null }) {
    this.real = game; this.ui = ui; this.audio = audio; this.params = params;
    this.onPlay = onPlay;        // told true while a game owns the screen, false when the title is back (main.js rests the title's clip)
    this.r = game.renderer.renderer;
    this.scene = new THREE.Scene();
    this.scene.name = 'quick';
    this.scene.background = new THREE.Color(GROUND_COLOUR);
    this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 80);
    this.dom = true;             // what is on screen is drawn by the page itself (a card board): no 3D frame is drawn
    this.running = false;
    this.calls = 0;              // draw calls of the last frame (QA)
    this.tricks = null; this.yard = null; this.ground = null;
    this.busy = null;            // the id of the game being played
    if (!$('quickCss')) { const s = document.createElement('style'); s.id = 'quickCss'; s.textContent = CSS; document.head.appendChild(s); }
    this.sceneEl = document.createElement('div');
    this.sceneEl.id = 'quickScene'; this.sceneEl.className = 'hidden'; this.sceneEl.setAttribute('aria-hidden', 'true');
    $('game').after(this.sceneEl);

    // the records live in the Explore save, as they do for a Mini games session in the valley (main.js: mode 'explore')
    this.saved = loadSave('explore') || { v: 1, quest: exploreState(), player: { x: -45, y: 4, z: 27, facing: Math.PI }, at: Date.now() };
    this.quest = new Quest(this.saved.quest);

    const self = this, player = standInPlayer(), follow = standInFollow(this.camera);
    this.town = { byId: new Map(), setProp() {}, release() {} };
    // the stand-ins the round runners are built on: what Game and Director are to them in the valley
    this.g = {
      quickStart: true, params, canvas: game.canvas, renderer: game.renderer, input: game.input, assets: game.assets, audio, ui,
      scene: this.scene, camera: this.camera, player, follow, paused: false, night: 0, timeOverride: null,
      world: { heightAt: () => 0, quality: { propShadows: false } },
      time: { hour: 15, speed: 0, season: 'spring' }, shownSeason: 'spring', shownHour: () => 15,
      get easy() { return game.easy; }, get hard() { return game.hard; },
    };
    this.d = {
      game: this.g, ui, audio, fx: null, busy: 0, minigame: null, npcs: {}, scenes: { active: null }, town: this.town, actCooldown: 0, explore: true,
      minigameMenu: { running: true },          // (the results card says "More games", the way out says "Back to games")
      get quest() { return self.quest; }, get q() { return self.quest; },
      save: () => self.save(), interact() {}, meetFriend() {},
      /** A teacher's first words: the same dialogue box, with nobody to frame. */
      async dialogueBody(lines) {
        const choice = await ui.dialogue(lines, { onLine: () => audio.blip?.(1) });
        game.input.edges.clear();               // the press that closed it must not also press something on the board
        return choice;
      },
    };
    this.stopControl = new MinigameStop(this.d);
    this.tick = this.tick.bind(this);
    this.prevResize = game.renderer.onResize;
    game.renderer.onResize = (w, h) => { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.prevResize?.(w, h); };
    const qa = window.__STARLINE_QA__;
    if (qa) {
      qa.director = this.d;
      qa.quick = {
        runtime: this, calls: () => (this.dom ? 0 : this.calls), state: () => ({ playing: this.busy, dom: this.dom, running: this.running }),
        /** What a leak would grow: GPU objects, the scene and the page. */
        counts: () => { const m = this.r.info.memory; let n = 0; this.scene.traverse(() => n++); return { geometries: m.geometries, textures: m.textures, programs: this.r.info.programs?.length ?? 0, objects: n, nodes: document.getElementsByTagName('*').length }; },
      };
    }
  }

  // ------------------------------------------------------------------ records
  save() {
    try { localStorage.setItem(saveKey('explore'), JSON.stringify({ ...this.saved, v: 1, quest: this.quest.save(), at: Date.now() })); return true; }
    catch { return false; }
  }

  // ------------------------------------------------------------------ the frame
  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }

  tick(now) {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);
    // (a tab that was hidden comes back with one huge gap: the step is capped, as in the full game)
    const dt = Math.min(Math.max((now - this.last) / 1000, 0), 1 / 20);
    this.last = now;
    const inp = this.g.input;
    try {
      inp.poll();
      this.ui.pollGamepad();
      inp.enabled = !this.ui.dialogueOpen;
      this.tricks?.update(dt);
      this.yard?.update(dt);
      this.stopControl.update();
      if (!this.dom) this.draw();
    } catch (e) { this.fail(e); }
    inp.endFrame();
  }

  /** The yard games' own small scene, straight to the screen. */
  draw() {
    const r = this.r, info = r.info;
    info.autoReset = false; info.reset();
    r.setRenderTarget(null);
    r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = false;     // (nothing here casts a shadow: the blobs are painted)
    r.render(this.scene, this.camera);
    this.calls = info.render.calls;
    this.real.lastInfo = { calls: info.render.calls, tris: info.render.triangles };
  }

  /** Something broke inside a round: leave it the way Stop would, and say so once the list is back. */
  fail(e) {
    console.error('[quick] the round failed', e);
    this.failed = true;
    try { this.tricks?.quitRound(); } catch { /* ignore */ }
    try { this.yard?.quit(); } catch { /* ignore */ }
  }

  // ------------------------------------------------------------------ the runners
  async needTricks() {
    if (!this.tricks) {
      const { Tricks } = await import('../game/tricks.js');
      this.tricks = this.d.tricks = new Tricks(this.d);
    }
    return this.tricks;
  }

  async needYard() {
    if (!this.yard) {
      const [{ Yard }, { YARD_GAME }] = await Promise.all([import('../game/yard/round.js'), import('../game/yard/index.js')]);
      this.YARD_GAME = YARD_GAME;
      // the ground of the playground and the daylight on the pieces
      const geo = new THREE.PlaneGeometry(GROUND_HALF * 2, GROUND_HALF * 2); geo.rotateX(-Math.PI / 2);
      const tex = groundTexture(GROUND_HALF);
      this.ground = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex }));
      this.ground.name = 'quick:ground'; this.ground.position.y = -0.01; this.ground.renderOrder = -1;
      this.groundTex = tex;
      this.lights = [new THREE.HemisphereLight('#fff6e4', '#b08a5c', 1.5), new THREE.DirectionalLight('#fff2d8', 2.2)];
      this.lights[1].position.set(-3, 6, 2);
      this.scene.add(this.ground, ...this.lights);
      this.yard = this.d.yard = new Yard(this.d);
    }
    return this.yard;
  }

  // ------------------------------------------------------------------ one game
  /** Play one quick game to its end (results card, Play again and all). Never throws. */
  async play(id) {
    for (const k of [this.tricks, this.yard]) if (k) k.lastError = null;
    const [kind, ref] = id.split(':'), ui = this.ui, name = kind === 'trick' ? TRICK[ref]?.name : YARD_NAMES[ref];
    this.failed = false;
    this.busy = id;
    window.__STARLINE_RUNTIME__ = 'quick';
    await ui.fade(true, 140);
    try {
      $('title').classList.add('hidden');
      document.body.classList.add('quick-play');
      this.onPlay?.(true);
      $('hud').classList.remove('hidden');                  // (only its toasts show: see the stylesheet in ./art.js)
      this.g.input.releaseAll?.();
      if (kind === 'trick') {
        const tricks = await this.needTricks();
        if (!TRICK[ref]) throw new Error(`no trick ${ref}`);
        this.dom = true;
        this.sceneEl.innerHTML = sceneFor(ref);
        this.sceneEl.classList.remove('hidden');
        this.start();
        ui.fade(false, 260);
        await tricks.play(ref);
      } else {
        const yard = await this.needYard(), Y = YARDS.kawabe, c = yard.ctl[Y.id], G = this.YARD_GAME[ref];
        if (!G || !Y.games.includes(ref)) throw new Error(`no yard game ${ref}`);
        this.sceneEl.classList.add('hidden');
        // one of the yard's kids plays against her: a different one each time
        const kids = Y.kids.map(k => PEOPLE.find(p => p.id === k)).filter(Boolean);
        const rec = this.quest.state.yard?.[ref], kid = kids[(rec?.plays || 0) % kids.length];
        this.town.byId = new Map(kid ? [[kid.id, standInKid(kid)]] : []);
        setGameOn(yard.save, Y, ref);
        // the shot of the stage, so the level picker already lies over the playground's ground
        const S = stageOf(Y, ref), tall = yard.tall() ? G.tall : null, shot = yard.cameraFor(S, tall ? { ...G.focus, ...tall } : G.focus, 'end', 0);
        this.g.follow.fovBase = shot.fov; this.g.follow.cutscene(shot);
        this.g.player.teleport(S.x, S.z, 0, 0);
        this.ground.position.set(S.x, -0.01, S.z);          // (the games keep their own places in the yard: the ground comes to them)
        this.ground.rotation.y = -(S.rot || 0) * Math.PI / 180;
        this.dom = false;
        this.start();
        await yard.play(c);                                  // (it lifts the fade itself)
      }
    } catch (e) { this.fail(e); }
    // (a runner ends a round that broke by itself, quietly: it only leaves a note)
    for (const k of [this.tricks, this.yard]) if (k?.lastError) { k.lastError = null; this.failed = true; }
    // back to the title: whatever happened above, the game keeps neither the screen nor the frame
    try {
      await ui.fade(true, 160);
      this.stop();
      this.dom = true;
      this.sceneEl.classList.add('hidden'); this.sceneEl.innerHTML = '';
      this.stopControl.update();
      document.body.classList.remove('quick-play');
      $('hud').classList.add('hidden');
      $('title').classList.remove('hidden');
      this.onPlay?.(false);
      this.g.input.releaseAll?.();
      this.g.input.enabled = true;
    } finally { ui.fade(false, 220); }
    this.busy = null;
    window.__STARLINE_RUNTIME__ = 'title';
    if (this.failed) this.note(tx('{name} is not ready yet', { name: tx(name || '') }));
  }

  /** A kind word over the title (its toasts are part of the game HUD, which is not shown there). */
  note(text) {
    const n = document.createElement('div');
    n.id = 'quickNote'; n.setAttribute('role', 'status');
    n.style.cssText = 'position:fixed;left:50%;top:calc(18px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:80;max-width:86vw;padding:10px 18px;border-radius:16px;background:#fff8ea;color:#5a3a22;box-shadow:0 8px 24px rgba(0,0,0,.35);font:700 15px Nunito,system-ui,sans-serif;text-align:center';
    n.textContent = text;
    $('quickNote')?.remove();
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 4200);
  }

  /** Give everything back: the valley is about to be loaded, or the page no longer wants the runtime. Safe twice. */
  dispose() {
    if (this.gone) return;
    this.gone = true;
    this.stop();
    try { this.yard?.dispose(); } catch (e) { console.warn('[quick] yard', e); }
    try { this.tricks?.dispose(); } catch (e) { console.warn('[quick] tricks', e); }
    this.yard = this.tricks = this.d.yard = this.d.tricks = null;
    this.stopControl.button?.remove();
    document.body.classList.remove('minigame-stoppable', 'quick-play', 'trick-round', 'yard-round', 'yard-pad', 'life-round');
    if (this.ground) { this.ground.removeFromParent(); this.ground.geometry.dispose(); this.ground.material.dispose(); this.groundTex.dispose(); this.ground = null; }
    for (const l of this.lights || []) { l.removeFromParent(); l.dispose?.(); }
    this.scene.clear();
    this.sceneEl.remove();
    $('quickNote')?.remove();
    this.town.byId.clear();
    const R = this.real.renderer;
    R.onResize = this.prevResize;
    this.r.renderLists?.dispose();
    this.r.setRenderTarget(null);
    this.g.input.enabled = true;
    if (this.real.quick === this) this.real.quick = null;
    const qa = window.__STARLINE_QA__;
    if (qa?.quick?.runtime === this) { delete qa.quick; if (qa.director === this.d) delete qa.director; }
  }
}

/**
 * Play the quick game `id`, then let the player go on from the Mini games list. Resolves null when the list is closed
 * (the caller shows the title menu again) or { e, plan } when a game that needs the valley was picked.
 */
export async function runQuick({ game, ui, audio, params, id, onPlay }) {
  const rt = (game.quick ??= new QuickRuntime({ game, ui, audio, params, onPlay }));
  for (;;) {
    await rt.play(id);
    const next = await ui.pickMinigame();               // the same list, on the title, still without the valley
    if (!next) return null;
    if (!next.e.quick) return next;
    id = next.e.id;
  }
}
