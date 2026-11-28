// © 2026 Bui Cong Nguyen · solluxlabs.com
import * as THREE from 'three';
import { tx } from '../i18n/i18n.js';
import { POSES, FILTERS, FRAMES, LENSES, MAX_SHOTS, SEASON_NAMES, RIG, captionPlace, canEnter, photoState, poseOk, solveRig, fitShot, nearestPlace, addShot, shotName, padEdges } from './photo.js';
import { makePhotoPass, applyFilter } from '../engine/photo-pass.js';
import { viewRadius } from '../world/zone.js';
import { BAND } from '../world/zone-backdrop.js';
import { U } from '../fx/cel-sprites.js';
import { PhotoUI } from '../ui/photo-ui.js';
import { drawFrame } from '../ui/photo-frame.js';
import { stampCanvas } from '../ui/brand.js';

// Photo mode: the game is paused (Game.togglePause), so nothing in the valley moves, and this takes the camera.
// Nothing here changes the follow camera, the animator or the player's code: what it changes (the camera, Mika's
// clip and facing, Tamo, the governor's scale, the silhouette) is saved on entry and put back on exit, so the next
// follow-camera frame carries on exactly where play stopped. Fetched by Game.openPhoto the first time it is used.

const SENS = 0.0042;            // the follow camera's orbit feel (radians a pixel)
const ROLL_RATE = 0.8;          // radians a second, Q / E and the bumpers
const PAN_RATE = 2.2;           // metres a second, WASD / left stick

export class PhotoMode {
  constructor(game) {
    this.g = game;
    this.active = false;
    this.job = null;              // the shot being drawn and encoded (it outlives the mode: a shot pressed is a shot kept)
    this.out = { pos: new THREE.Vector3(), pivot: new THREE.Vector3(), look: new THREE.Vector3(), dist: 0 };
    this.env = { pos: null, pivotH: 1.45, heightAt: null, raycast: null, submerged: false, room: null, zone: null };
    this.choice = { pose: 'asis', filter: 'none', frame: 'none', lens: null, caption: true, grid: false, face: false, tamo: false };
    // the one larger picture (Renderer.shoot): point sprites are sized in pixels, so they grow with it for that picture
    game.renderer.onShot = k => this.scaleSprites(k);
  }

  /** Open from 'key' (V / R3) or 'pause' (the pause menu). -> true when it opened */
  enter(from) {
    const g = this.g, R = g.renderer, p = g.player, cam = g.camera;
    if (this.active) return true;
    // (the code may have been fetched while the player went on: open only from the state they pressed it in, so a
    // journal or a menu opened meanwhile, or a resume, wins)
    const listOpen = !!g.director?.minigameMenu?.picker?.resolve;
    if (from === 'pause' ? !(g.paused && g.ui.overlay === 'pause') || listOpen : g.paused) return false;
    if (!canEnter(photoState(g))) { if (from === 'key') g.ui.toast(tx("Photo mode isn't available right now")); return false; }
    this.wasPaused = g.paused;
    if (g.paused) g.ui.closeAll(); else g.togglePause(true, true);
    if (!g.paused) return false;
    const a = p.anim, act = a?.current, t = g.director?.tamo;
    this.saved = {
      pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov, near: cam.near,
      fixedScale: R.fixedScale, sil: p.silhouette?.on ?? true,
      clip: a?.currentName || '', time: act?.time || 0, speed: act?.timeScale ?? 1, facing: p.facing, rootY: p.root.rotation.y,
      tamo: t && !t.hidden ? { pos: t.pos.clone(), rootY: t.root.rotation.y } : null,
    };
    // the governor must not step the resolution while a shot is being framed (renderer.js track: fixedScale returns)
    R.fixedScale = R.scale;
    if (!R.photoPass) { R.photoPass = makePhotoPass(); R.composer.addPass(R.photoPass); }
    p.silhouette?.show(false);
    document.body.classList.add('photo-mode');
    g.input.releaseAll();
    this.padPrev = this.readPad().buttons;   // a held R3 (or A) must not act the moment the mode opens
    const f = g.follow;
    this.rig0 = { yaw: f.yaw, pitch: f.pitch, dist: f.dist, pan: new THREE.Vector3(), roll: 0, fov: cam.fov };
    this.rig = { ...this.rig0, pan: this.rig0.pan.clone() };
    this.dirty = false;               // until something moves, the camera is exactly the one play left
    this.posed = false;
    this.canPose = poseOk(p);
    this.tamoHere = !!this.saved.tamo;
    Object.assign(this.choice, { pose: 'asis', face: false, tamo: false, lens: null });
    this.active = true;
    this.ui = new PhotoUI(this);
    this.applyFilter();
    document.activeElement?.blur?.();
    return true;
  }

  /**
   * Close. forced: something else needs the screen (a dialogue, a scene, a video): play goes on; 'lost': the
   * graphics went away: the game stays paused, on the pause menu; otherwise back to where it came from.
   */
  exit({ forced = false } = {}) {
    if (!this.active) return;
    const g = this.g, R = g.renderer, p = g.player, cam = g.camera, s = this.saved;
    this.active = false;
    // a shutter pressed just before leaving: take it now, from the view the player framed (it then encodes on its own)
    const j = this.job;
    if (j && !j.copy && !j.failed && forced !== 'lost') this.capture(j);
    cam.position.copy(s.pos); cam.quaternion.copy(s.quat);
    if (cam.fov !== s.fov || cam.near !== s.near) { cam.fov = s.fov; cam.near = s.near; cam.updateProjectionMatrix(); }
    this.fitSprites();
    R.fixedScale = s.fixedScale;
    p.silhouette?.show(s.sil);
    if (this.posed && p.anim && s.clip) p.anim.snap(s.clip, { speed: s.speed, time: s.time });
    p.facing = s.facing; p.root.rotation.y = s.rootY;
    if (this.posed || this.choice.face) { p.carry?.snap(); p.lateUpdate(1 / 60, g); }
    this.placeTamo(false);
    this.syncTamo();                  // (his glow for the play camera again: exactly what the pause left)
    if (R.photoPass) R.photoPass.enabled = false;
    this.ui?.destroy(); this.ui = null;
    document.body.classList.remove('photo-mode');
    g.input.releaseAll();
    if (forced === 'lost') { if (g.paused && !g.ui.overlay) g.ui.open('pause'); }
    else if (!forced) {
      if (this.wasPaused) { g.ui.open('pause'); document.getElementById('btnPausePhoto')?.focus({ preventScroll: true }); }
      else g.togglePause(false);
    } else if (g.paused && !g.ui.overlay) g.togglePause(false);
  }

  /** Once a frame while open (Game.frame, after the paused update and before the culling that follows the camera). */
  frame(raw) {
    const g = this.g, R = g.renderer, d = g.director;
    if (!g.paused || g.ui.dialogueOpen || d?.scenes?.active || d?.minigame || R.hold || R.focus) { this.exit({ forced: true }); return; }
    if (R.renderer.getContext().isContextLost()) { this.exit({ forced: 'lost' }); return; }
    const dt = Math.min(raw, 1 / 20), rig = this.rig, inp = g.input, ui = this.ui;
    const gs = ui.takeGestures();
    const pad = this.readPad(), edges = padEdges(this.padPrev, pad.buttons);
    this.padPrev = pad.buttons;
    for (const b of edges) {
      if (b === 0) this.shutter();
      else if (b === 1 || b === 9 || b === 11) { this.exit(); return; }
      else if (b === 2) this.step('pose', 1);
      else if (b === 3) this.step('filter', 1);
      else if (b === 12 || b === 13) this.step('frame', b === 13 ? 1 : -1);
      else if (b === 14 || b === 15) this.step('lens', b === 15 ? 1 : -1);
      else if (b === 8) ui.setHidden(!ui.hidden);
    }
    if (!this.active) return;
    let moved = false;
    // orbit: the drag (with the follow camera's feel) and the right stick (input.look: sensitivity and invert applied)
    const ox = gs.ox + inp.look.x, oy = gs.oy + inp.look.y;
    if (ox || oy) { rig.yaw -= ox * SENS; rig.pitch += oy * SENS * 0.8; moved = true; }
    // pan: a two-finger or right-button drag in the picture's own plane, scaled so the point at the pivot's depth (Mika)
    // stays under the fingers at any screen size and lens; WASD / the left stick along the ground
    const right = _right.set(-Math.cos(rig.yaw), 0, Math.sin(rig.yaw)), ahead = _ahead.set(Math.sin(rig.yaw), 0, Math.cos(rig.yaw));
    if (gs.px || gs.py) {
      const cam = g.camera;
      const depth = this.dirty ? Math.max(RIG.distMin, this.out.dist) : rig.dist;     // (out.dist is 0 before the first place())
      const h = R.renderer.domElement.clientHeight || innerHeight;
      const k = 2 * depth * Math.tan(cam.fov * Math.PI / 360) / Math.max(1, h);      // metres a CSS pixel at that depth
      const sx = _sx.set(1, 0, 0).applyQuaternion(cam.quaternion), sy = _sy.set(0, 1, 0).applyQuaternion(cam.quaternion);
      rig.pan.addScaledVector(sx, -gs.px * k).addScaledVector(sy, gs.py * k); moved = true;
    }
    if (inp.move.x || inp.move.y) { rig.pan.addScaledVector(right, inp.move.x * PAN_RATE * dt).addScaledVector(ahead, inp.move.y * PAN_RATE * dt); moved = true; }
    // dolly: wheel steps and pinches arrive as one factor; the triggers ease it
    let zoom = gs.zoom;
    if (pad.lt || pad.rt) zoom *= Math.exp((pad.lt - pad.rt) * dt * 1.6);
    if (zoom !== 1) { rig.dist *= zoom; moved = true; }
    const roll = (ui.held.q || pad.lb ? 1 : 0) - (ui.held.e || pad.rb ? 1 : 0);
    if (roll) { rig.roll += roll * ROLL_RATE * dt; moved = true; ui.syncRoll(); }
    if (moved) this.dirty = true;
    if (this.dirty) this.place(dt);
  }

  /** Solve the rig and put the camera there; Mika (when she faces the camera) and Tamo follow it. */
  place(dt) {
    const g = this.g, p = g.player, cam = g.camera, f = g.follow, e = this.env, I = g.interiors, z = g.zone;
    e.pos = p.pos; e.pivotH = this.pivotH(); e.submerged = !!p.submerged;
    e.heightAt ??= (x, zz) => g.world.heightAt(x, zz);
    e.raycast ??= (ax, ay, az, bx, by, bz) => g.colliders.raycast(ax, ay, az, bx, by, bz);
    e.room = I?.active ? (q => I.clampToRoom(q, 0.42)) : null;
    e.zone = z ? { x: z.x, z: z.z, r: viewRadius(z) - BAND - 1 } : null;
    const o = solveRig(this.rig, e, this.out);
    cam.position.copy(o.pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(o.look);
    cam.rotateZ(this.rig.roll);
    f.setFov(this.rig.fov, dt);
    f.setNear(o.dist < 1.2 ? 0.2 : 0.35);
    this.fitSprites();
    if (this.choice.face) this.faceCamera();
    if (this.choice.tamo) this.placeTamo(true);
    this.syncTamo();                  // (a close camera dims his glow, as in play)
  }

  /** Point sprites' pixel scale for the camera's lens now (Celebrate.update sets it in play, and it is frozen while paused). */
  fitSprites() {
    const cam = this.g.camera, h = this.g.renderer.renderer.domElement.height || innerHeight;
    U.uScale.value = h / (2 * Math.tan((cam.fov * Math.PI / 180) / 2));
  }

  /**
   * For the one larger picture of a shot: every pixel-sized point uniform times k (the fx pools follow the renderer's
   * own resize). -> the undo, which writes the old values back exactly.
   */
  scaleSprites(k) {
    const g = this.g, cel = g.celebrate;
    const us = [U.uScale, cel?.starfield?.uniforms?.uPx, g.underwater?.mat?.uniforms?.scale,
      ...Object.values(cel?.figs || {}).map(f => f?.su?.uPx)].filter(Boolean);
    const was = us.map(u => u.value);
    us.forEach(u => { u.value *= k; });
    return () => us.forEach((u, i) => { u.value = was[i]; });
  }

  /** The pivot's height: the pose's own (a sitting Mika is framed lower); "as is" keeps the ground-pose camera drop. */
  pivotH() {
    const pose = POSES.find(x => x.id === this.choice.pose) || POSES[0];
    return pose.clip ? pose.pivot : pose.pivot - (this.g.player.groundCameraLower || 0);
  }

  /** Poses offered now: "as is" always, the rest only with Mika standing free on the ground and the clip in her model. */
  poses() {
    const a = this.g.player.anim;
    return POSES.filter(x => !x.clip || (this.canPose && a?.has(x.clip)));
  }

  setPose(id) {
    const g = this.g, p = g.player, a = p.anim, pose = POSES.find(x => x.id === id);
    if (!pose || !this.poses().includes(pose)) return;
    this.choice.pose = id;
    if (!pose.clip) {
      if (this.posed && a && this.saved.clip) a.snap(this.saved.clip, { speed: this.saved.speed, time: this.saved.time });
      this.posed = false;
    } else {
      const dur = a.clips.get(pose.clip)?.duration || 0;
      a.snap(pose.clip, { speed: 0, time: dur * pose.p });
      this.posed = true;
    }
    p.carry?.snap(); p.lateUpdate(1 / 60, g);
    this.dirty = true;                  // (the pivot height may have changed)
    this.place(1 / 60);
    this.ui?.sync();
  }

  setFace(on) {
    if (!this.canPose) return;
    const p = this.g.player;
    this.choice.face = !!on;
    if (on) this.faceCamera();
    else { p.facing = this.saved.facing; p.root.rotation.y = this.saved.rootY; }
    p.carry?.snap(); p.lateUpdate(1 / 60, this.g);
    this.ui?.sync();
  }

  faceCamera() {
    const p = this.g.player, c = this.g.camera.position;
    p.facing = Math.atan2(c.x - p.pos.x, c.z - p.pos.z);
    p.root.rotation.y = p.facing;
  }

  setTamo(on) {
    if (!this.tamoHere) return;
    this.choice.tamo = !!on;
    this.placeTamo(!!on);
    this.ui?.sync();
  }

  /** Tamo beside her, on the side nearer the camera, turned to it; or back where the pause found him. */
  placeTamo(on) {
    const t = this.g.director?.tamo, s = this.saved?.tamo;
    if (!t || !s) return;
    if (on) {
      const p = this.g.player, c = this.g.camera.position, f = p.facing;
      const rx = Math.cos(f), rz = -Math.sin(f), side = (c.x - p.pos.x) * rx + (c.z - p.pos.z) * rz >= 0 ? 1 : -1;
      t.pos.set(p.pos.x + rx * side * 0.55, p.pos.y + 1.55, p.pos.z + rz * side * 0.55);
      t.root.rotation.y = Math.atan2(c.x - t.pos.x, c.z - t.pos.z);
    } else {
      t.pos.copy(s.pos);
      t.root.rotation.y = s.rootY;
    }
    t.root.position.copy(t.pos);
    t.light?.position.copy(t.pos);
    this.syncTamo();
  }

  /**
   * Tamo's motes (scene sprites around him) and his near-camera glow are set only in Tamo.update, which is frozen
   * while paused: bring them along to where he is and to where the camera is. Its clock is frozen too, so with the
   * play camera back this gives exactly the values the pause left.
   */
  syncTamo() {
    const t = this.g.director?.tamo;
    if (!t || t.hidden || !this.saved?.tamo) return;
    t.updateMotes?.(0);
    t.glowFor?.(this.g.camera, this.g.night || 0);
  }

  setFilter(id) {
    if (!FILTERS.some(x => x.id === id)) return;
    this.choice.filter = id;
    this.applyFilter();
    this.ui?.sync();
  }

  applyFilter() {
    const R = this.g.renderer, fl = FILTERS.find(x => x.id === this.choice.filter);
    applyFilter(R.photoPass, fl?.u || null);
    if (R.photoPass) { const c = R.renderer.domElement; R.photoPass.uniforms.uAspect.value = c.width / Math.max(1, c.height); }
  }

  setFrame(id) {
    if (!FRAMES.some(x => x.id === id)) return;
    this.choice.frame = id;
    this.ui?.sync(); this.ui?.redrawFrame();
  }

  setCaption(on) { this.choice.caption = !!on; this.ui?.sync(); this.ui?.redrawFrame(); }
  setGrid(on) { this.choice.grid = !!on; this.ui?.sync(); this.ui?.redrawFrame(); }

  setLens(id) {
    const l = LENSES.find(x => x.id === id);
    if (!l) return;
    this.choice.lens = id;
    this.rig.fov = l.fov; this.dirty = true;
    this.ui?.sync();
  }

  setRoll(r) { this.rig.roll = r; this.dirty = true; this.place(1 / 60); this.ui?.syncRoll(); }

  /** Next / previous entry of a table (keys and pad). */
  step(kind, dir) {
    const list = kind === 'pose' ? this.poses() : kind === 'filter' ? FILTERS : kind === 'frame' ? FRAMES : LENSES;
    const cur = this.choice[kind] ?? (kind === 'lens' ? 'normal' : null);
    const i = Math.max(0, list.findIndex(x => x.id === cur));
    const next = list[(i + dir + list.length) % list.length].id;
    ({ pose: () => this.setPose(next), filter: () => this.setFilter(next), frame: () => this.setFrame(next), lens: () => this.setLens(next) })[kind]();
    this.ui?.showTab(kind);
  }

  /** The view as it was when the mode opened. */
  resetView() {
    const cam = this.g.camera, s = this.saved;
    this.rig = { ...this.rig0, pan: this.rig0.pan.clone() };
    this.choice.lens = null;
    cam.position.copy(s.pos); cam.quaternion.copy(s.quat);
    if (cam.fov !== s.fov || cam.near !== s.near) { cam.fov = s.fov; cam.near = s.near; cam.updateProjectionMatrix(); }
    this.fitSprites();
    this.dirty = false;
    if (this.choice.face) this.faceCamera();
    if (this.choice.tamo) this.placeTamo(true);
    this.syncTamo();
    this.ui?.sync(); this.ui?.syncRoll();
  }

  /**
   * The caption under the picture: the nearest place and the season on screen. The place loses a gloss in brackets
   * ("Hoshi Valley (...)" reads as the valley's name on a photo) and starts with a capital (some translations are the
   * mid-sentence form).
   */
  captionText() {
    const g = this.g, p = g.player.pos, season = g.shownSeason || g.time.season;
    return captionPlace(tx(nearestPlace(p.x, p.z))) + ' · ' + tx(SEASON_NAMES[season] || SEASON_NAMES.spring);
  }

  /** The gamepad now: buttons as booleans, triggers and bumpers. */
  readPad() {
    const pads = navigator.getGamepads?.() ?? [], i = this.g.input.gamepadIndex;
    const gp = i !== null && i !== undefined ? pads[i] : [...pads].find(Boolean);
    if (!gp) return { buttons: [], lt: 0, rt: 0, lb: false, rb: false };
    const buttons = gp.buttons.map(b => !!b?.pressed);
    const v = k => (gp.buttons[k]?.value > 0.1 ? gp.buttons[k].value : 0);
    return { buttons, lt: v(6), rt: v(7), lb: !!buttons[4], rb: !!buttons[5] };
  }

  // ------------------------------------------------------------------ the shutter

  /**
   * Take the picture: the flash and the click now, the drawing in the next task (outside the frame: no slow-frame
   * notes). A shot is a job of its own: what it shows is settled when it is pressed, it is drawn before the mode can
   * close (exit() draws it at once if it is still waiting) and once drawn it is always encoded and kept, even when the
   * mode has closed meanwhile. One at a time.
   */
  shutter() {
    if (this.job || !this.active) return;
    const g = this.g, au = g.audio, pp = g.player.pos;
    const job = this.job = { ui: this.ui, slot: this.slot(), frame: this.choice.frame, filter: this.choice.filter,
      caption: this.choice.caption ? this.captionText() : '', place: nearestPlace(pp.x, pp.z), season: g.shownSeason || g.time.season,
      copy: null, failed: false, pr: 0 };
    g.ui.flash();
    au?.noise?.({ dur: 0.05, freq: 3200, vol: 0.12 });
    au?.tone?.(2200, { type: 'triangle', dur: 0.03, vol: 0.05, when: 0.07, rev: 0 });
    if (g.ui.touch) navigator.vibrate?.(12);
    this.ui?.hideCard();
    setTimeout(() => this.capture(job), 0);
  }

  /** Draw the shot larger and copy it to a 2D canvas, now (the camera, pose, Tamo and filter as framed); then encode it. */
  capture(job) {
    if (job.copy || job.failed) return;
    const g = this.g, R = g.renderer, gl = R.renderer;
    try {
      if (gl.getContext().isContextLost()) throw new Error('context lost');
      job.pr = fitShot({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio || 1, cur: R.pixelRatio, touch: !!g.ui.touch, samples: R.q.msaa || 0, maxTex: gl.capabilities.maxTextureSize });
      job.copy = R.shoot(g.scene, g.camera, job.pr, src => {
        const out = document.createElement('canvas');
        out.width = src.width; out.height = src.height;
        out.getContext('2d').drawImage(src, 0, 0);
        return out;
      });
      if (gl.getContext().isContextLost()) throw new Error('context lost');
    } catch (e) {
      if (job.copy) job.copy.width = 0;
      this.failShot(job, e);
      return;
    }
    this.finish(job);
  }

  /** The frame and caption (after the fonts), the JPEG, the album's small copy; then the card, if its session is still open. */
  async finish(job) {
    const g = this.g, c = job.copy;
    try {
      await document.fonts?.ready;
      drawFrame(c.getContext('2d'), c.width, c.height, job.frame, job.caption, { grid: false });
      stampCanvas(c.getContext('2d'), c.width, c.height);         // the author's mark in the corner (ui/brand.js)
      const blob = await new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('no picture'))), 'image/jpeg', 0.92));
      const name = shotName(new Date());
      const file = new File([blob], name, { type: 'image/jpeg' });
      // the album keeps a small copy (a data URL in storage, next to the saves); a 5x step down wants the smooth filter
      const k = 360 / Math.max(c.width, c.height), tw = Math.max(1, Math.round(c.width * k)), th = Math.max(1, Math.round(c.height * k));
      const t = document.createElement('canvas'); t.width = tw; t.height = th;
      const tc = t.getContext('2d'); tc.imageSmoothingEnabled = true; tc.imageSmoothingQuality = 'high';
      tc.drawImage(c, 0, 0, tw, th);
      let url = t.toDataURL('image/jpeg', 0.72);
      if (url.length > 90000) url = t.toDataURL('image/jpeg', 0.6);
      t.width = 0;
      const w = c.width, h = c.height;
      c.width = 0;
      const shot = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, t: Date.now(), url, w, h,
        filter: job.filter, frame: job.frame, place: job.place, season: job.season };
      let kept = 'quota';
      try { kept = addShot(localStorage, job.slot, shot); } catch { kept = 'quota'; }
      if (kept === 'full') g.ui.toast(tx('The album holds {n} photos. Delete one in the Journal to keep more.', { n: MAX_SHOTS }));
      else if (kept === 'quota') g.ui.toast(tx("Couldn't keep the photo: storage is full"));
      // the card (the only way to the full-size file) only in the session the shot was taken in
      if (this.active && this.ui && this.ui === job.ui) this.ui.showCard({ thumb: url, kept: kept === 'ok', file });
      else if (kept === 'ok') g.ui.toast(tx('In your album'));
      this.lastShot = { name, w, h, pr: job.pr, size: blob.size, kept };
    } catch (e) {
      c.width = 0;
      this.failShot(job, e);
    } finally {
      if (this.job === job) this.job = null;
    }
  }

  /** A shot that could not be made: say so; its own session goes back where it came from (lost graphics: the pause menu). */
  failShot(job, e) {
    console.error('[photo] shot failed', e);
    job.failed = true;
    if (this.job === job) this.job = null;
    this.g.ui.toast(tx("Couldn't take the photo"));
    if (this.active && this.ui === job.ui) {
      let lost = true;
      try { lost = this.g.renderer.renderer.getContext().isContextLost(); } catch { /* lost */ }
      this.exit(lost ? { forced: 'lost' } : {});
    }
  }

  /** The save profile the album belongs to. */
  slot() { return this.g.director?.slot ?? 1; }
}

const _right = new THREE.Vector3(), _ahead = new THREE.Vector3(), _sx = new THREE.Vector3(), _sy = new THREE.Vector3();
