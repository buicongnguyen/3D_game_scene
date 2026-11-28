// © 2026 Bui Cong Nguyen · solluxlabs.com
// The Night Star's show (docs/NIGHT-STAR.md; content/night-star.js): at night a girl stands in the shrine yard, softly
// lit, and when Mika comes to watch she sings one song with Kotone and two of her friends dancing behind her, filmed by
// the automatic camera (perform/camera-man.js) under the show effects (fx/show-fx.js). Her body copies Kotone's danced
// rig like any other lead (perform/troupe.js leadSource), with the moves her dress allows (content/troupe.js GUESTS
// avoid: no kicks, jumps or wide steps). After her bow she is gone in a shower of sparks, and from then on she is in
// Sing & Play's Singer row. Loaded only at night near the shrine (game/nightstar/watch.js); costs nothing elsewhere.
import * as THREE from 'three';
import { tx, N_, getLang } from '../../i18n/i18n.js';
import { NPC } from '../../actors/npc.js';
import { Performer } from '../perform/performer.js';
import { planShots, createCameraMan, fromCamera } from '../perform/camera-man.js';
import { Troupe, leadSource } from '../perform/troupe.js';
import { prepareMoves } from '../tricks/exercise-moves.js';
import { SHOW } from '../kotone-show.js';
import { KOTONE_SONGS, showSongs } from '../../content/kotone-songs.js';
import { troupeOf, leadOffset, member, avoidOf, KOTONE, NIGHT_STAR, nameOf } from '../../content/troupe.js';
import { NIGHT_STAR_SHOW, markNightStarSeen, nightStarSeen } from '../../content/night-star.js';
import { ShowFX } from '../../fx/show-fx.js';

const S = NIGHT_STAR_SHOW;
const _v = new THREE.Vector3();

/**
 * Starlight on her while she waits: one soft additive cone from the sky (edge-soft by the view angle, brightest at her
 * feet, gone 7 m up; fx/show-fx.js's beam recipe, no texture, 1 draw), so she reads in the dark from the shrine steps.
 */
function starlight() {
  const g = new THREE.CylinderGeometry(0.45, 1.15, 7, 16, 1, true); g.translate(0, 3.5, 0);
  const m = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uK: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, forceSinglePass: true,
    vertexShader: `varying float vY, vE; void main() { vY = position.y / 7.0; vec4 w = modelMatrix * vec4(position, 1.0); vec3 n = normalize(mat3(modelMatrix) * vec3(position.x, 0.0, position.z));
      vE = abs(dot(n, normalize(cameraPosition - w.xyz))); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uT, uK; varying float vY, vE; void main() { float a = pow(clamp(vE, 0.0, 1.0), 2.0) * (1.0 - vY) * (1.0 - vY) * smoothstep(0.0, 0.04, vY) * uK * (0.85 + 0.15 * sin(uT * 1.7));
      gl_FragColor = vec4(vec3(0.55, 0.68, 1.0) * a * 0.55, 1.0); }`,
  });
  const mesh = new THREE.Mesh(g, m); mesh.name = 'nightstar-starlight'; mesh.renderOrder = 10; mesh.frustumCulled = false;
  return mesh;
}

/** Her group by tier (measured: docs/NIGHT-STAR.md): Kotone and two friends behind her, on phones too. ?nightStarGroup=1|4 */
export const groupFor = (tier, params = null) => { const q = Number(params?.get?.('nightStarGroup')); return q === 1 || q === 4 ? q : S.group; };

/** A song's data files (the same as Sing & Play's loadSong): { song, beats, lyrics, mouth, stage, url } or null. */
async function loadSong(e) {
  const json = url => fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null);
  const meta = e.meta ? await json(e.base + e.meta) : null, song = { ...(meta || {}), ...e, id: e.id };
  const [beats, lyrics, mouth, stage] = await Promise.all(['beats', 'lyrics', 'mouth', 'stage'].map(k => json(`${e.base}${e.id}.${k}.json`)));
  return song.bpm > 0 || beats ? { song, beats, lyrics, mouth, stage, url: e.base + (e.audio || `${e.id}.m4a`) } : null;
}

export class NightStar {
  constructor(game, director) {
    this.g = game; this.d = director;
    this.low = game.renderer.qualityName === 'low';
    this.n = groupFor(game.renderer.qualityName, game.params);
    this.body = null; this.loading = null; this.ready = false; this.state = 'gone';
    this.perf = null; this.troupe = null; this.formation = null; this.show = null; this.cam = null; this.watching = false;
    this.spent = false;   // (she has sung tonight: gone until Mika has been away)
    this.t = 0;
  }

  /** Her body, Kotone's rig and moves, the two friends and the song's data (once; ~2.5-3.3 MB, at night near the shrine). */
  load() {
    if (this.loading) return this.loading;
    const a = this.g.assets, f = id => (this.low ? `${member(id).file}.lite` : member(id).file);
    const files = [...new Set([f(NIGHT_STAR), f(KOTONE), SHOW.pack, ...(this.n > 1 ? troupeOf(this.n, NIGHT_STAR).filter(m => !m.lead).map(m => f(m.id)) : [])])];
    this.files = files;
    const list = showSongs(KOTONE_SONGS, NIGHT_STAR, getLang());
    this.loading = Promise.all([a.loadLater(files).catch(() => {}), Promise.all(list.map(loadSong))]).then(([, songs]) => {
      this.songs = songs.filter(Boolean);
      this.ready = files.every(x => a.has(x)) && this.songs.length > 0;
      if (this.ready) {
        const pack = a.gltf(SHOW.pack), rig = a.clone(f(KOTONE));
        this.clips = pack && rig ? prepareMoves(pack, rig, pack.scene, false) : new Map();
        this.restRoot = pack?.scene || null;
      }
      return this.ready;
    });
    return this.loading;
  }

  /** She is there: standing in the starlight at her spot, the prompt to watch her near. */
  appear() {
    if (this.body || !this.ready || this.spent) return;
    const g = this.g, file = this.low ? `${member(NIGHT_STAR).file}.lite` : member(NIGHT_STAR).file;
    const n = this.body = new NPC(g.scene, g.assets, g.world, NIGHT_STAR, file, { x: S.x, z: S.z, facing: S.facing });
    n.name = nameOf(NIGHT_STAR, getLang());
    n.anim?.play('Idle');
    this.t = 0;
    this.light ||= starlight();
    this.light.material.uniforms.uK.value = 0;   // (fades in over 2 s)
    this.light.position.copy(n.pos); g.scene.add(this.light);
    // the show effects made and their shaders compiled now, while she waits (not when the song starts)
    try { if (!this.show) { this.show = new ShowFX(g); this.show.warm(g.camera).catch(() => {}); } } catch (e) { console.warn('[nightstar] no show effects', e); this.show = null; }
    this.d.interact('nightStar', new THREE.Vector3(S.x, n.pos.y + 1, S.z), N_('Watch the Night Star'), () => this.canWatch(), () => this.watch(), S.watch, null, 1.5);
  }

  /** Gone (day came, Mika went far, or after her song). */
  vanish() {
    if (this.watching || this.perf) this.endShow(false);
    this.d.interactables?.delete?.('nightStar');
    this.light?.removeFromParent();
    if (this.body) { this.body.root.removeFromParent(); this.body = null; }
  }

  canWatch() { return !!this.body && !this.perf && !this.d.busy && !this.d.minigame && !this.d.scenes?.active && !this.g.paused && !this.g.ui?.dialogueOpen; }

  // ---------------------------------------------------------------- the show
  watch() {
    if (!this.canWatch()) return;
    const g = this.g, d = this.d, n = this.body, p = g.player, a = g.assets;
    const song = this.songs[0];
    // Mika takes her place among the watchers: in front of the group, a little to the side, facing it
    const sn = Math.sin(S.facing), cs = Math.cos(S.facing), k = leadOffset();
    const cx = S.x - k.x * cs - k.z * sn, cz = S.z + k.x * sn - k.z * cs;   // (the formation's centre, from her place)
    const vx = cx + S.view.x * cs + S.view.z * sn, vz = cz - S.view.x * sn + S.view.z * cs;
    p.teleport(vx, vz, undefined, Math.atan2(cx - vx, cz - vz)); p.root.position.copy(p.pos); p.root.rotation.y = p.facing; p.vel.set(0, 0, 0);
    // the show owns the screen like a scene: the director keeps Mika still and offers no other prompt (its lock is
    // derived every frame from `busy`), saves wait; taken back in endShow
    d.busy++; this.busyHeld = true;
    g.follow.first = true; g.follow.yaw = p.facing;
    this.from = fromCamera(g.camera.position, { x: n.pos.x, y: n.pos.y, z: n.pos.z, facing: S.facing });
    const ground = (x, z) => g.world.heightAt(x, z);
    this.perf = new Performer(n, this.clips, song, { audio: g.audio, restRoot: this.restRoot, style: 'cute', ground, avoid: avoidOf(NIGHT_STAR) });
    // the group: Kotone (whose rig every body copies) and two friends; a solo: a hidden Kotone under her
    const members = this.n > 1 ? this.makeFormation() : null;
    let rig = members?.find(e => e.m.id === KOTONE)?.model;
    if (!rig) { rig = this.rig = a.clone(this.low ? 'kotone.lite' : 'kotone'); rig.visible = false; n.model.add(rig); rig.updateMatrixWorld(true); }
    this.perf.source = leadSource(this.perf, rig, this.clips, this.restRoot, n.model, a.gltf(this.low ? `${member(NIGHT_STAR).file}.lite` : member(NIGHT_STAR).file)?.scene || rig);
    if (members) {
      g.scene.add(this.formation); this.formation.updateMatrixWorld(true);
      const cast = troupeOf(this.n, NIGHT_STAR), xs = cast.map(m => m.x), zs = cast.map(m => m.z);
      this.groupW = Math.max(...xs) - Math.min(...xs); this.groupD = Math.max(...zs) - Math.min(...zs);
      this.troupe = new Troupe(this.perf, n.model, this.restRoot, members, { parent: this.formation, ground });
    }
    this.perf.start(0);
    this.light?.removeFromParent();   // (the stage's own lights now)
    d.performing = true;
    g.audio?.holdMusic?.('nightstar', true);
    // the show effects (night: the stage set, beams, haze, confetti, fireworks over the last chorus)
    try { this.show ||= new ShowFX(g); } catch (e) { console.warn('[nightstar] no show effects', e); this.show = null; }
    this.show?.start(this.perf, { spot: { x: cx, z: cz, facing: S.facing }, group: members ? { w: this.groupW, depth: this.groupD } : null, n: this.n, ground });
    this.centre = { x: cx, z: cz };
    this.shots = planShots(this.perf.plan, this.perf.clock, { group: !!this.troupe });
    this.cam = createCameraMan(this.shots, { portrait: innerHeight > innerWidth });
    this.watching = true; this.freeUntil = 0; this.watchT = 0;
    g.cameraOverride = dt => this.camera(dt);
    // the song stops with the game (pause menu): her audio pauses with it
    if (!this.pauseHooked && g.togglePause) { const tp = g.togglePause.bind(g); this.pauseHooked = true; g.togglePause = (...args) => { const r = tp(...args); if (g.paused) this.perf?.sound?.el?.pause(); return r; }; }
    this.button(true);
  }

  makeFormation() {
    const g = this.g, n = this.body, k = leadOffset(), root = this.formation = new THREE.Group(); root.name = 'nightstar-troupe';
    root.position.set(n.pos.x, 0, n.pos.z); root.rotation.y = S.facing;
    const s = Math.sin(S.facing), c = Math.cos(S.facing), out = [];
    for (const m of troupeOf(this.n, NIGHT_STAR)) {
      if (m.lead) continue;
      const model = g.assets.clone(this.low ? `${m.file}.lite` : m.file); if (!model) continue;
      const x = m.x - k.x, z = m.z - k.z;
      model.position.set(x, g.world.heightAt(n.pos.x + x * c + z * s, n.pos.z - x * s + z * c), z);
      model.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
      root.add(model);
      out.push({ m, model });
    }
    return out;
  }

  /** The automatic camera while Mika watches (a drag gives the view back for 4 s; walking ends the watching). */
  camera(dt) {
    const g = this.g, n = this.body, now = performance.now();
    if (!this.perf || !this.cam || !this.watching) return false;
    if (g.input.dragging || g.input.touch?.look?.moved) this.freeUntil = now + 4000;
    if (now < this.freeUntil) { this.camWas = false; return false; }
    if (!this.camWas) { this.cam = createCameraMan(this.shots, { portrait: innerHeight > innerWidth }); this.camWas = true; }
    this.cam.portrait = innerHeight > innerWidth;
    const clear = (a, b) => g.colliders.raycast(a.x, a.y, a.z, b.x, b.y, b.z);
    const subject = { x: n.pos.x, y: n.pos.y, z: n.pos.z, facing: S.facing, from: this.from };
    if (this.troupe) subject.group = { x: this.centre.x, z: this.centre.z, w: this.groupW, depth: this.groupD };
    this.cam.update(dt, this.perf.t, subject, g.camera, clear, (x, z) => g.world.heightAt(x, z));
    g.player.silhouette?.show?.(false);
    return true;
  }

  /** "Stop watching": a flat 48 px button while the show plays (E does the same). */
  button(on) {
    if (!on) { this.btn?.remove(); this.btn = null; return; }
    if (this.btn) return;
    const b = this.btn = document.createElement('button'); b.type = 'button'; b.id = 'nsStop'; b.className = 'ns-stop'; b.textContent = tx(N_('Stop watching'));
    // (PC: bottom centre; phones: under the objective card, clear of the touch buttons in the bottom corners)
    if (!document.getElementById('nsStyle')) {
      const st = document.createElement('style'); st.id = 'nsStyle';
      st.textContent = `.ns-stop{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 14px);z-index:30;min-height:48px;min-width:48px;padding:0 18px;border-radius:24px;border:0;font:600 15px/1 inherit;background:rgba(255,250,240,.92);color:#3a2a1a;box-shadow:0 2px 8px rgba(0,0,0,.25);cursor:pointer}
@media (max-width:640px){.ns-stop{bottom:auto;top:calc(env(safe-area-inset-top,0px) + 104px);min-height:44px;font-size:14px}}
@media (max-height:480px) and (orientation:landscape){.ns-stop{bottom:auto;top:calc(env(safe-area-inset-top,0px) + 70px)}}`;
      document.head.appendChild(st);
    }
    b.addEventListener('click', e => { e.stopPropagation(); this.g.audio?.click?.(); this.endShow(false); });
    document.body.appendChild(b);
  }

  /** The show ends: seen to the bow (seen) or stopped. She is gone in a shower of sparks either way. */
  endShow(seen) {
    const g = this.g, d = this.d, p = g.player;
    this.show?.stop();
    this.troupe?.dispose(); this.troupe = null;
    this.formation?.removeFromParent(); this.formation = null;
    this.perf?.dispose(); this.perf = null;
    this.rig?.removeFromParent(); this.rig = null;
    if (this.watching) { g.cameraOverride = null; g.follow.first = true; this.watching = false; }
    if (this.busyHeld) { d.busy = Math.max(0, d.busy - 1); this.busyHeld = false; if (!d.busy) p.locked = false; }
    d.performing = false;
    g.audio?.holdMusic?.('nightstar', false);
    this.button(false);
    if (this.body) {
      const at = this.body.pos.clone().add(_v.set(0, 1.1, 0));
      g.fx?.burst?.(at, { n: 70, color: [1, 0.86, 0.5], speed: 3.2, life: 1.6, size: 0.3, gravity: -0.6 });
      g.fx?.burst?.(at, { n: 40, color: [0.6, 0.75, 1], speed: 2.2, life: 2, size: 0.24, gravity: -0.8 });
      g.audio?.chime?.();
    }
    this.spent = true;
    this.vanish();
    if (seen) {
      const first = !nightStarSeen();
      markNightStarSeen();
      if (first) this.g.ui?.toast?.(tx(N_('{name}, the Night Star, can sing in Sing & Play now'), { name: nameOf(NIGHT_STAR, getLang()) }));
    }
  }

  /** Every frame (a game system). */
  update(dt) {
    const g = this.g, n = this.body;
    this.show?.update(dt, g.camera);
    if (!n) return;
    n.update(dt, g.colliders);
    this.t += dt;
    if (!this.perf) {
      if (this.light) { const L = this.light.material.uniforms; L.uT.value += dt; L.uK.value = Math.min(1, L.uK.value + dt / 2); }
      // waiting in the starlight: a few slow sparks round her
      if (Math.random() < dt * 6) g.fx?.twinkle?.(_v.copy(n.pos).add(new THREE.Vector3(0, 1 + Math.random() * 0.8, 0)), [0.75, 0.85, 1]);
      return;
    }
    const P = this.perf, d = Math.hypot(g.player.pos.x - n.pos.x, g.player.pos.z - n.pos.z);
    P.update(dt, { listen: this.watching ? 1 : Math.max(0, Math.min(1, 1 - (d - 10) / 35)), camera: g.camera });
    this.troupe?.update(dt, g.camera);
    this.watchT = (this.watchT || 0) + dt;
    if (this.watching && this.watchT > 0.6 && g.input.pressed?.('act')) { this.endShow(false); return; }   // (not the press that began it)
    if (P.done) this.endShow(this.watching || d < 30);
  }
}
