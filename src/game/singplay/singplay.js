// Sing & Play (docs/SING-AND-PLAY.md): the player walks the valley as Kotone and performs a whole song wherever the ground
// is flat and open, villagers gather to watch, an automatic camera films it and Record saves the take with the song.
// Loaded only when the mode starts (src/main.js). Mika's own save is untouched: the mode keeps Kotone's place apart.
import * as THREE from 'three';
import { tx, N_ } from '../../i18n/i18n.js';
import { Animator } from '../../actors/animator.js';
import { Face } from '../../actors/face.js';
import { Silhouette } from '../../actors/silhouette.js';
import { HUMAN_GAIT } from '../../actors/gait.js';
import { SWIM } from '../../actors/player.js';
import { prepareMoves, lendClips } from '../tricks/exercise-moves.js';
import { SHOW } from '../kotone-show.js';
import { KOTONE_SONGS, songFromParam } from '../../content/kotone-songs.js';
import { Performer } from '../perform/performer.js';
import { planShots, createCameraMan } from '../perform/camera-man.js';
import { startRecording, srtFromLyrics, saveBlob } from '../perform/recorder.js';
import { canPerform, gameEnv } from './flat.js';

export const SAVE_KEY = 'starline:singplay:v1';
export const STAGE = Object.freeze({ x: -91, z: 99.5, facing: Math.PI });   // first visit: in front of the station stage
const REASONS = { water: N_('Too close to the water'), steep: N_('Too steep here'), room: N_('Not enough room here') };
const AUDIENCE = { low: 2, other: 4, near: 35, ring: 4.2 };
const loadPlace = () => { try { const v = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return v && Number.isFinite(v.x) && Number.isFinite(v.z) ? v : null; } catch { return null; } };
const savePlace = p => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(p)); } catch { /* per-device convenience */ } };

/** Fetch a song's data files: { song, beats, lyrics, mouth, stage, url } or null. */
export async function loadSong(e) {
  const json = url => fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null);
  const meta = e.meta ? await json(e.base + e.meta) : null, song = { ...(meta || {}), ...e, id: e.id };
  const [beats, lyrics, mouth, stage] = await Promise.all(['beats', 'lyrics', 'mouth', 'stage'].map(k => json(`${e.base}${e.id}.${k}.json`)));
  return song.bpm > 0 || beats ? { song, beats, lyrics, mouth, stage, url: e.base + (e.audio || `${e.id}.m4a`) } : null;
}

export class SingPlay {
  constructor(game, director, ui) {
    this.g = game; this.d = director; this.ui = ui;
    this.perf = null; this.cam = null; this.auto = true; this.freeUntil = 0; this.rec = null; this.songIx = 0; this.audience = [];
    this.checkT = 0; this.allowed = { ok: false, reason: 'room' }; this.saveT = 0;
  }

  async start() {
    const g = this.g, a = g.assets, low = g.renderer.qualityName === 'low', body = low ? 'kotone.lite' : 'kotone';
    this.d.singplay = true;
    await a.loadLater([body, SHOW.pack]);
    if (!a.has(body)) { this.ui.toast?.(tx("Kotone couldn't be loaded")); return false; }
    this.swapBody(body);
    const place = loadPlace() || STAGE;
    g.player.teleport(place.x, place.z, undefined, place.facing);
    g.follow.first = true;
    const list = [...KOTONE_SONGS, songFromParam(g.params?.get?.('kotoneSong'))].filter(Boolean);
    this.songs = (await Promise.all(list.map(loadSong))).filter(Boolean);
    this.hud();
    this.pauseLeave();
    // the visitor herself steps out of Town Life while the player is her (no second Kotone at the station)
    const town = this.d.town, k = town?.people.find(it => it.p.id === SHOW.who);
    if (k) { if (town.show?.on(k)) town.show.end(); k.yardHold = true; k.n.setHidden(true); }
    // Tamo is Mika's companion: he stays home while Kotone performs (and does not float into her close-ups)
    this.d.tamo?.hide(); this.d.tamoAround = () => false;
    g.systems.push(this);
    g.cameraOverride = dt => this.camera(dt);
    addEventListener('pagehide', () => this.keepPlace());
    return true;
  }

  /** The player's body becomes Kotone: her model, clips (her own + the show pack), gait, face; Mika's lantern put away. */
  swapBody(name) {
    const g = this.g, p = g.player, m = g.assets.clone(name);
    p.pivot.remove(p.model);
    p.silhouette?.dispose?.();
    m.position.y = -SWIM.pivot;
    m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    p.pivot.add(m);
    p.model = m; p.anim = new Animator(m); p.gait = HUMAN_GAIT.kotone; p.grip = m.getObjectByName('grip_R') || m; p.idleClip = 'Idle';
    p.silhouette = new Silhouette(m);
    p.lantern?.removeFromParent(); p.carry = null;
    p.face = Face.attach(m);
    const pack = g.assets.gltf(SHOW.pack);
    this.clips = pack ? prepareMoves(pack, m, pack.scene, false) : new Map();
    lendClips(p.anim, this.clips);
    this.restRoot = pack?.scene || null;
    p.anim.play('Idle');
  }

  keepPlace() { const p = this.g.player; if (!p.swimming) savePlace({ x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2), facing: +p.facing.toFixed(3) }); }

  // ---------------------------------------------------------------- the HUD: one row, every button always in its place
  hud() {
    const bar = this.bar = document.createElement('div');
    bar.id = 'singplayBar'; bar.className = 'singplay-bar';
    const mk = (id, label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.id = id; b.className = 'singplay-btn'; b.textContent = tx(label); b.addEventListener('click', e => { e.stopPropagation(); this.g.audio?.click?.(); fn(); }); bar.appendChild(b); return b; };
    this.btnPerform = mk('spPerform', N_('Perform'), () => (this.perf ? this.stopSong() : this.perform()));
    this.btnRecord = mk('spRecord', N_('Record'), () => this.toggleRecord());
    this.btnPhoto = mk('spPhoto', N_('Photo'), () => this.photo());
    this.btnCam = mk('spCam', N_('Camera: Auto'), () => { this.auto = !this.auto; this.freeUntil = 0; this.label(); });
    this.hint = document.createElement('p'); this.hint.className = 'singplay-hint'; this.hint.setAttribute('aria-live', 'polite');
    bar.appendChild(this.hint);
    if (!document.getElementById('singplayStyle')) {
      const st = document.createElement('style'); st.id = 'singplayStyle';
      st.textContent = `.singplay-bar{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 12px);display:flex;flex-wrap:wrap;justify-content:center;gap:8px;z-index:30;max-width:calc(100vw - 24px);pointer-events:auto}
.singplay-btn{min-width:48px;min-height:48px;padding:0 16px;border-radius:24px;border:0;font:600 15px/1 inherit;background:rgba(255,250,240,.92);color:#3a2a1a;box-shadow:0 2px 8px rgba(0,0,0,.25);cursor:pointer}
.singplay-btn[aria-disabled=true]{opacity:.5}.singplay-btn.on{background:#e0567a;color:#fff}
.singplay-hint{flex-basis:100%;margin:0;text-align:center;font:600 13px/1.3 inherit;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.7);min-height:17px}
@media (max-width:640px){.singplay-bar{bottom:auto;top:calc(env(safe-area-inset-top,0px) + 104px);flex-wrap:nowrap;gap:6px}.singplay-btn{min-height:44px;min-width:44px;padding:0 10px;font-size:13px;white-space:nowrap}.singplay-hint{position:absolute;top:52px;left:0;right:0}}`;
      document.head.appendChild(st);
    }
    document.body.appendChild(bar);
    this.label();
  }

  label() {
    const p = this.perf, ok = this.allowed.ok || !!p;
    this.btnPerform.textContent = tx(p ? N_('Stop') : N_('Perform'));
    this.btnPerform.setAttribute('aria-disabled', String(!ok || !this.songs?.length));
    this.btnRecord.textContent = this.rec ? `● ${fmt(this.rec.secs())}` : tx(N_('Record'));
    this.btnRecord.classList.toggle('on', !!this.rec);
    this.btnRecord.setAttribute('aria-disabled', String(!p && !this.rec));
    this.btnCam.textContent = tx(this.auto ? N_('Camera: Auto') : N_('Camera: Free'));
    this.btnCam.setAttribute('aria-disabled', String(!p));
    this.hint.textContent = !this.songs?.length ? tx(N_('No songs yet')) : p ? '' : this.allowed.ok ? '' : tx(REASONS[this.allowed.reason] || REASONS.room);
  }

  // ---------------------------------------------------------------- performing
  perform() {
    const g = this.g, p = g.player;
    if (this.perf || !this.songs?.length) return;
    if (!this.allowed.ok) { this.ui.toast?.(tx(REASONS[this.allowed.reason] || REASONS.room)); return; }
    const song = this.songs[this.songIx++ % this.songs.length];
    p.locked = true; p.vel.set(0, 0, 0);
    this.perf = new Performer(p, this.clips, song, { audio: g.audio, restRoot: this.restRoot });
    this.perf.start(0);
    g.audio?.holdMusic?.('singplay', true);
    this.cam = createCameraMan(planShots(this.perf.plan, this.perf.clock), { portrait: innerHeight > innerWidth });
    this.gather();
    this.label();
  }

  stopSong() {
    const g = this.g;
    if (this.rec) this.toggleRecord();
    this.perf?.dispose(); this.perf = null; this.cam = null;
    g.player.locked = false; g.follow.first = true;
    g.audio?.holdMusic?.('singplay', false);
    this.release();
    this.label();
  }

  /** Town Life neighbours near her walk over and watch in a half ring (held from their day plan meanwhile). */
  gather() {
    const town = this.d.town, p = this.g.player; if (!town) return;
    const n = this.g.renderer.qualityName === 'low' ? AUDIENCE.low : AUDIENCE.other;
    const near = town.people.filter(it => it.n.visible && !it.n.far && !it.game && !it.yardHold && !it.n.sitting && !town.show?.on(it) && it.n.pos.distanceTo(p.pos) < AUDIENCE.near)
      .sort((a, b) => a.n.pos.distanceTo(p.pos) - b.n.pos.distanceTo(p.pos)).slice(0, n);
    near.forEach((it, i) => {
      const a = p.facing + (i - (near.length - 1) / 2) * .55, x = p.pos.x + Math.sin(a) * AUDIENCE.ring, z = p.pos.z + Math.cos(a) * AUDIENCE.ring;
      it.yardHold = true; it.singHold = true;
      it.n.walk([[x, z]], () => { it.n.lookAt(p.pos.x, p.pos.z); it.n.setIdle('Idle'); }, 1.6);
      this.audience.push(it);
    });
    this.cheerT = 3;
  }
  release() { for (const it of this.audience) { it.yardHold = false; it.singHold = false; it.n.path = null; it.n.setIdle('Idle'); } this.audience = []; }

  /** Every frame (a game system). */
  update(dt) {
    const g = this.g, p = g.player;
    p.face?.setEnabled(Face.on); p.face?.lookAt(p.gaze || null); p.face?.update(dt);
    if (this.perf) {
      this.perf.update(dt, { listen: 1, camera: g.camera });
      // the audience: a cheer or a wave now and then, more on the choruses, all of them at the end
      this.cheerT -= dt;
      const st = this.perf.state;
      if (this.cheerT <= 0 && this.audience.length) {
        const it = this.audience[Math.floor(Math.random() * this.audience.length)];
        if (!it.n.path) { it.n.lookAt(p.pos.x, p.pos.z); it.n.gesture(st.section === 'chorus' || st.moment ? 'Cheer' : Math.random() < .5 ? 'Wave' : 'Cheer'); }
        this.cheerT = st.section === 'chorus' ? 1.6 + Math.random() * 1.5 : 3.5 + Math.random() * 3;
      }
      if (this.rec && this.perf.t >= this.perf.plan.end) this.toggleRecord();
      if (this.perf.done) { for (const it of this.audience) it.n.gesture('Cheer'); this.stopSong(); }
      else if (this.rec) this.label();
    } else {
      this.checkT -= dt;
      if (this.checkT <= 0) { this.checkT = .3; const was = this.allowed.ok + this.allowed.reason; this.allowed = p.grounded ? canPerform(p.pos, gameEnv(g)) : { ok: false, reason: 'steep' }; if (was !== this.allowed.ok + this.allowed.reason) this.label(); }
    }
    this.saveT -= dt; if (this.saveT <= 0) { this.saveT = 5; this.keepPlace(); }
  }

  /** The automatic camera while she performs (true: it holds the view this frame). A drag gives the view back for 4 s. */
  camera(dt) {
    const g = this.g, p = g.player, now = performance.now();
    if (!this.perf || !this.cam || !this.auto) return false;
    if (g.input.dragging || g.input.touch?.look?.moved) this.freeUntil = now + 4000;
    if (now < this.freeUntil) { this.camWas = false; return false; }
    if (!this.camWas) { this.cam = createCameraMan(planShots(this.perf.plan, this.perf.clock), { portrait: innerHeight > innerWidth }); this.camWas = true; }
    this.cam.portrait = innerHeight > innerWidth;
    const clear = (a, b) => g.colliders.raycast(a.x, a.y, a.z, b.x, b.y, b.z);
    this.cam.update(dt, this.perf.t, { x: p.pos.x, y: p.pos.y, z: p.pos.z, facing: p.facing }, g.camera, clear);
    p.silhouette?.show?.(false);
    return true;
  }

  // ---------------------------------------------------------------- Record and Photo
  async toggleRecord() {
    const g = this.g, R = g.renderer;
    if (this.rec) {
      const rec = this.rec, at = this.recAt; this.rec = null; this.label();
      const out = await rec.stop();
      R.fixedScale = this.recScale; R.resize();
      const name = `kotone-${this.recSong}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`;
      saveBlob(out.blob, `${name}.${out.ext}`);
      const srt = srtFromLyrics(this.recLyrics, at, this.recEnd);
      if (srt) saveBlob(new Blob([srt], { type: 'application/x-subrip' }), `${name}.srt`);
      this.lastTake = { name: `${name}.${out.ext}`, bytes: out.blob.size, secs: out.secs, mime: out.mime };
      this.ui.toast?.(tx(N_('Video saved')));
      return;
    }
    if (!this.perf) return;
    // 720p at most on phones and Low (the canvas is what is recorded): the pixel ratio for the take
    const phone = R.qualityName === 'low' || Math.min(innerWidth, innerHeight) < 700, cap = phone ? 1280 : 1920, long = Math.max(innerWidth, innerHeight);
    this.recScale = R.fixedScale;
    if (long * R.pixelRatio > cap) { R.fixedScale = true; R.resize(cap / long); }
    this.rec = startRecording(R.renderer.domElement, this.perf.sound.stream(), { fps: phone ? 24 : 30, bitrate: phone ? 2_000_000 : 5_000_000 });
    if (!this.rec) { R.fixedScale = this.recScale; R.resize(); this.ui.toast?.(tx(N_("This browser can't record video"))); return; }
    this.recAt = this.perf.t; this.recSong = this.perf.data.song.id; this.recLyrics = this.perf.data.lyrics; this.recEnd = this.perf.plan.end;
    this.label();
  }

  photo() {
    const g = this.g, R = g.renderer;
    R.shoot(g.scene, g.camera, R.pixelRatio, canvas => canvas.toBlob(b => { if (b) saveBlob(b, `kotone-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`); }, 'image/png'));
  }

  /** The pause menu's way out (next to Photo mode). */
  pauseLeave() {
    const after = document.getElementById('btnPausePhoto') || document.getElementById('btnPauseMini'); if (!after) return;
    const b = document.createElement('button'); b.id = 'btnPauseSingLeave'; b.type = 'button'; b.textContent = tx(N_('Leave Sing & Play'));
    b.addEventListener('click', () => { this.g.audio?.click?.(); this.leave(); });
    after.after(b);
  }

  /** Leave the mode: her place kept, back to the title. */
  leave() { this.stopSong(); this.keepPlace(); this.bar?.remove(); location.href = location.pathname; }
}
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Start Sing & Play on a loaded Explore session (src/main.js). */
export async function startSingPlay(game, director, ui) {
  const m = new SingPlay(game, director, ui);
  game.singplay = m;
  await m.start();
  return m;
}
