import * as THREE from 'three';
import { Renderer } from '../engine/renderer.js';
import { Assets } from '../engine/assets.js';
import { Input } from '../engine/input.js';
import { FX } from '../engine/effects.js';
import { World } from '../world/world.js';
import { scatter } from '../world/scatter.js';
import { Foliage } from '../world/foliage.js';
import { Grass } from '../world/grass.js';
import { Colliders } from '../world/colliders.js';
import { Structures } from '../world/structures.js';
import { Railway } from '../world/railway.js';
import { PALETTES } from '../world/seasons.js';
import { Player } from '../actors/player.js';
import { FollowCamera } from '../actors/camera.js';
import { ALL_MODELS } from '../content/models.js';
import { LightPool } from '../engine/lights.js';
import { Paddies } from '../world/paddies.js';
import { Underwater } from '../fx/underwater.js';
import { Riverbed } from '../world/riverbed.js';
import { StarKite } from '../actors/kite.js';
import { Interiors } from '../world/interiors.js';
import { tx } from '../i18n/i18n.js';

/** Owns every system and the frame loop. Story and UI plug in through hooks. */
export class Game {
  constructor(canvas, params = new URLSearchParams()) {
    this.params = params;
    this.canvas = canvas;
    this.renderer = new Renderer(canvas, params.get('quality'));
    this.scene = new THREE.Scene();
    // near 0.35 m: the follow camera never gets closer than ~1 m, and a small near plane makes distant trim
    // (train lining, window frames) z-fight and shimmer
    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.35, 4600);
    this.renderer.onResize = (w, h) => { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); };
    this.renderer.resize();
    this.input = new Input(canvas);
    this.assets = new Assets();
    this.time = { hour: 10, speed: 0, season: 'spring' };
    this.systems = [];
    this.paused = false;
    this.fps = 0;
  }

  async load(onProgress = () => {}) {
    onProgress(0.02, 'Shaping the valley');
    await nextFrame();
    this.world = new World(this.scene, this.renderer.renderer, this.renderer.q);
    onProgress(0.12, 'Unpacking Blender models');
    await this.assets.load(ALL_MODELS, p => onProgress(0.12 + p * 0.7, 'Unpacking Blender models'));
    await this.assets.finalize();
    onProgress(0.84, 'Planting the forests');
    await nextFrame();
    this.colliders = new Colliders();
    this.lights = new LightPool(this.scene, 3);
    this.structures = new Structures(this.scene, this.assets, this.world, this.colliders, this.lights);
    this.railway = new Railway(this.scene, this.assets, this.world, this.colliders, this.lights);
    this.paddies = new Paddies(this.scene, this.assets, this.world);
    const isFree = (x, z) => this.world.splat.sample(x, z, 0) < 0.12 && this.world.splat.sample(x, z, 3) > 0.1 && this.world.grid.slopeAt(x, z) < 36;
    this.placed = scatter((x, z) => this.world.heightAt(x, z), isFree, this.renderer.q.trees);
    for (const t of this.placed.trees) if (!t.far) this.world.splat.paintDisc(t.x, t.z, 2.4 * t.s, 2, 0.75, 2);
    this.foliage = new Foliage(this.scene, this.assets, this.placed, this.renderer.q);
    this.grass = new Grass(this.scene, this.world.heightTex, this.world.splat, this.world.terrain.noise, this.renderer.q);
    for (const t of this.placed.trees) if (!t.far && t.s > 0.7) this.colliders.cylinder(t.x, t.z, 0.38 * t.s, t.y - 1, t.y + 5, { id: 'tree' });
    onProgress(0.94, 'Waking Mika');
    await nextFrame();
    this.player = new Player(this.scene, this.assets, this.world, this.colliders);
    this.follow = new FollowCamera(this.camera, this.world, this.colliders);
    this.underwater = new Underwater(this);
    this.kite = new StarKite(this);
    this.interiors = new Interiors(this);
    this.riverbed = new Riverbed(this.scene, this.assets, this.world);
    this.setSeason(this.time.season);
    onProgress(1, 'Ready');
  }

  /** The story's season. What is shown can be overridden in Settings (seasonOverride), without touching the story. */
  setSeason(s) {
    this.time.season = s;
    this.applyLook();
  }

  /** Apply the season on screen (story season unless overridden) and its weather (unless weather is off). */
  applyLook() {
    const s = this.seasonOverride || this.time.season;
    if (this.shownSeason !== s) {
      this.shownSeason = s;
      this.world.setSeason(s);
      this.foliage.setSeason(s);
      this.grass.setSeason(s);
      this.paddies.setSeason(s);
      FX.uSnow.value = PALETTES[s].snow;
      this.onSeason?.(s);
    }
    this.fx?.setWeather(this.weatherOff ? null : PALETTES[s].particles);
  }

  /** The hour shown on screen: the story clock, a fixed hour from Settings, or a free-running day cycle. */
  shownHour() {
    const o = this.timeOverride;
    if (o === null || o === undefined) return this.time.hour;
    return typeof o === 'number' ? o : (this.cycleHour ??= this.time.hour);
  }

  start() {
    this.clock = new THREE.Clock();
    const loop = () => {
      this.frame();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  togglePause(on, fromUi = false) {
    if (!this.director?.quest) return;
    if (on === undefined) on = !this.paused;
    if (on === this.paused) return;
    this.paused = on;
    this.input.releaseAll();
    if (on && !fromUi) this.ui.open('pause');
    if (!on) this.ui.closeAll();
  }

  saveAndQuit() {
    if (!this.director.save()) { this.ui.toast(tx('Can\'t save during a scene — try again in a moment')); return; }
    location.reload();
  }

  frame() {
    this.frameCount = (this.frameCount || 0) + 1;
    const info = this.renderer.renderer.info;
    info.autoReset = false;
    this.lastInfo = { calls: info.render.calls, tris: info.render.triangles };
    info.reset();
    const raw = this.clock.getDelta();
    const dt = Math.min(raw, 1 / 20);
    this.renderer.track(raw);
    this.input.poll();
    this.ui?.pollGamepad();
    if (this.director?.quest && !this.ui.dialogueOpen && !this.director.minigame && !this.director.scenes.active) {
      if (this.input.pressed('pause')) { if (this.ui.overlay) this.ui.closeOverlay(); else this.togglePause(true); }
      else if (this.input.pressed('journal') && !this.paused) this.ui.openJournal();
    }
    this.input.enabled = !this.paused && !this.ui.dialogueOpen;
    const running = !this.paused;
    if (running) {
      FX.uTime.value += dt;
      this.time.hour = (this.time.hour + dt * this.time.speed / 3600 * 24 + 24) % 24;
      if (this.timeOverride === 'cycle-slow' || this.timeOverride === 'cycle-fast') {
        // a full day in 24 or 6 minutes
        this.cycleHour = ((this.cycleHour ?? this.time.hour) + dt * (this.timeOverride === 'cycle-fast' ? 1 / 15 : 1 / 60)) % 24;
      }
      this.world.hour = this.shownHour();
      this.beforeUpdate?.(dt);
      // the train moves first: Mika (when riding) and the camera then see this frame's train, not last frame's
      this.railway.update(dt, this.night || 0);
      this.kite?.update(dt); // the kite moves before Mika reads its handle
      this.player.update(dt, this.input, this.follow.yaw);
      this.follow.update(dt, this.player, this.input, false);
      for (const s of this.systems) s.update(dt, this);
      const L = this.world.update(dt, this.player.pos);
      this.underwater?.update(dt, L);
      this.riverbed?.update(dt);
      this.interiors?.update(dt);
      this.fx?.update(dt, this.player.pos, L.night, this.audio, this.camera.position);
      this.night = L.night;
      this.structures.update(dt, L.night);
      this.world.lamps = this.structures.lampReflections();
      this.assets.setGlow('Window glow', L.night * 2.2);
      this.assets.setGlow('Lantern glow', 0.4 + L.night * 2.4);
      this.assets.setGlow('Street glow', L.night * 3);
      this.assets.setGlow('Headlamp glass', L.night * 4);
      this.afterUpdate?.(dt);
    }
    this.lights.update(this.camera.position);
    this.cullT = (this.cullT || 0) - raw;
    if (this.cullT <= 0) { this.cullT = 0.3; this.structures.cull(this.camera.position, this.renderer.q); }
    this.foliage.update(this.camera);
    this.foliage.updateShadows(this.player.pos);
    this.grass.update(this.camera.position, this.player.pos);
    this.renderer.grade.uniforms.uNight.value = this.night || 0;
    if (this.fpsShown !== this.fps) { this.fpsShown = this.fps; this.ui?.fpsText(`${this.fps} fps · ${this.renderer.qualityName} · ${Math.round(this.renderer.scale * 100)}%`); }
    this.renderer.render(this.scene, this.camera);
    this.player.events.length = 0;
    this.input.endFrame();
    this.fpsAcc = (this.fpsAcc || 0) + raw; this.fpsN = (this.fpsN || 0) + 1;
    if (this.fpsAcc > 1) { this.fps = Math.round(this.fpsN / this.fpsAcc); this.fpsAcc = 0; this.fpsN = 0; window.__STARLINE_FPS__ = this.fps; }
  }
}

const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
