// Sing & Play (docs/SING-AND-PLAY.md): the player walks the valley as Kotone and performs a whole song wherever the ground
// is flat and open, villagers gather to watch, an automatic camera films it and Record saves the take with the song.
// Loaded only when the mode starts (src/main.js). Mika's own save is untouched: the mode keeps Kotone's place apart.
import * as THREE from 'three';
import { tx, N_, getLang } from '../../i18n/i18n.js';
import { Animator } from '../../actors/animator.js';
import { Face } from '../../actors/face.js';
import { Silhouette } from '../../actors/silhouette.js';
import { HUMAN_GAIT } from '../../actors/gait.js';
import { SWIM } from '../../actors/player.js';
import { prepareMoves, lendClips } from '../tricks/exercise-moves.js';
import { SHOW } from '../kotone-show.js';
import { KOTONE_SONGS, songFromParam, songsFor } from '../../content/kotone-songs.js';
import { Performer } from '../perform/performer.js';
import { planShots, createCameraMan } from '../perform/camera-man.js';
import { startRecording, srtFromLyrics, saveBlob } from '../perform/recorder.js';
import { canPerform, canGroup, gameEnv } from './flat.js';
import { Troupe } from '../perform/troupe.js';
import { GROUP_SIZES, troupeOf, troupeFiles, leadOffset } from '../../content/troupe.js';
import { strongPhone, BudgetWatch, dropNow, shotIndex, STRONG_KEY } from './strong-phone.js';
import { deviceFacts } from '../../engine/device-note.js';

export const SAVE_KEY = 'starline:singplay:v1';
export const GROUP_KEY = 'starline:singplay:group';   // the group size last picked (per device: 1, 4 or 8)
export const STAGE = Object.freeze({ x: -91, z: 99.5, facing: Math.PI });   // first visit: in front of the station stage
const REASONS = { water: N_('Too close to the water'), steep: N_('Too steep here'), room: N_('Not enough room here'), group: N_('Not enough room for the group here') };
const GROUP_LABELS = { 1: N_('Solo'), 4: N_('Group of 4'), 8: N_('Group of 8') };
const AUDIENCE = { low: 2, other: 4, near: 35, ring: 4.2, groupRing: 7.5 };
const loadPlace = () => { try { const v = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return v && Number.isFinite(v.x) && Number.isFinite(v.z) ? v : null; } catch { return null; } };
const savePlace = p => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(p)); } catch { /* per-device convenience */ } };
const loadGroup = () => { try { const n = Number(localStorage.getItem(GROUP_KEY)); return GROUP_SIZES.includes(n) ? n : 1; } catch { return 1; } };
const saveGroup = n => { try { localStorage.setItem(GROUP_KEY, String(n)); } catch { /* per-device convenience */ } };
const loadStrong = () => { try { return localStorage.getItem(STRONG_KEY); } catch { return null; } };
const saveStrong = v => { try { localStorage.setItem(STRONG_KEY, v); } catch { /* measured again next time */ } };
/**
 * The phone limits of a group (measured: docs/GROUP-PERFORMANCE.md): the largest group the tier shows and what the back
 * row gives up. URL switches for measuring: ?troupeMax=1|4|8, ?troupeHalf=0|1, ?troupeBackFaces=0|1, ?troupeBackShadows=0|1,
 * ?troupeMerge=0|1.
 */
// Low (phones): a group of 4, and 8 on a strong phone (strong-phone.js: its own measured frames have room; it falls back
// to the front row mid-show, at a camera cut, when the budget breaks). Each row is drawn as one mesh (perform/row-merge.js),
// which is what makes 8 affordable on Low (measured: docs/GROUP-PERFORMANCE.md).
// ?troupeMax= fixes the largest group (no strong-phone rule, no fallback: for measuring); ?troupeMerge=0 draws every
// member as its own mesh.
export const GROUP_LIMITS = Object.freeze({
  low: Object.freeze({ max: 4, strongMax: 8, backHalf: false, backFaces: true, backShadows: true, merge: true }),
  other: Object.freeze({ max: 8, strongMax: 8, backHalf: false, backFaces: true, backShadows: true, merge: true }),
});
export function groupLimits(low, params = null) {
  const q = (k, d) => { const v = params?.get?.(k); if (v === null || v === undefined || v === '') return d; if (typeof d === 'boolean') return v === '1' || v === 'on'; return Number(v) || d; };
  const L = low ? GROUP_LIMITS.low : GROUP_LIMITS.other, forced = !!params?.get?.('troupeMax');
  return { max: q('troupeMax', L.max), strongMax: forced ? q('troupeMax', L.max) : L.strongMax, forced, backHalf: q('troupeHalf', L.backHalf), backFaces: q('troupeBackFaces', L.backFaces), backShadows: q('troupeBackShadows', L.backShadows), merge: q('troupeMerge', L.merge) };
}
/** The largest group this device shows now: limits from groupLimits, strong from strongPhone(). */
export const groupMax = (limits, strong) => (limits.forced ? limits.max : strong?.ok ? Math.max(limits.max, limits.strongMax) : limits.max);

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
    this.group = 1; this.groupReady = null; this.groupWait = false; this.troupe = null; this.formation = null; this.limits = null;
  }

  async start() {
    const g = this.g, a = g.assets, low = g.renderer.qualityName === 'low', body = low ? 'kotone.lite' : 'kotone';
    this.d.singplay = true;
    this.d.refreshObjective?.();
    // the song stops with the game: pause (menu, photo mode) pauses her audio; the next frame after resume plays it on
    const tp = g.togglePause?.bind(g);
    if (tp) g.togglePause = (...args) => { const r = tp(...args); if (g.paused) this.perf?.sound?.el?.pause(); return r; };
    await a.loadLater([body, SHOW.pack]);
    if (!a.has(body)) { this.ui.toast?.(tx("Kotone couldn't be loaded")); return false; }
    this.swapBody(body);
    const place = loadPlace() || STAGE;
    g.player.teleport(place.x, place.z, undefined, place.facing);
    g.follow.first = true;
    const list = [...KOTONE_SONGS, songFromParam(g.params?.get?.('kotoneSong'))].filter(Boolean);
    this.songs = (await Promise.all(list.map(loadSong))).filter(Boolean);
    this.limits = groupLimits(low, g.params);
    this.judgeStrong();
    this.hud();
    this.setGroup(Math.min(loadGroup(), this.max()), false);
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
    // the group: three flat choices in a row of their own, always visible (no menu)
    const row = this.groupRow = document.createElement('div'); row.className = 'singplay-group'; row.setAttribute('role', 'group'); row.setAttribute('aria-label', tx(N_('Group')));
    this.btnGroup = GROUP_SIZES.filter(n => n <= Math.max(this.limits.max, this.limits.strongMax)).map(n => {
      const b = document.createElement('button'); b.type = 'button'; b.id = `spGroup${n}`; b.className = 'singplay-btn singplay-seg'; b.textContent = tx(GROUP_LABELS[n]); b.dataset.n = String(n);
      b.addEventListener('click', e => { e.stopPropagation(); this.g.audio?.click?.(); if (!this.perf) this.setGroup(n); });
      row.appendChild(b); return b;
    });
    bar.appendChild(row);
    this.hint = document.createElement('p'); this.hint.className = 'singplay-hint'; this.hint.setAttribute('aria-live', 'polite');
    bar.appendChild(this.hint);
    if (!document.getElementById('singplayStyle')) {
      const st = document.createElement('style'); st.id = 'singplayStyle';
      st.textContent = `.singplay-bar{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 12px);display:flex;flex-wrap:wrap;justify-content:center;gap:8px;z-index:30;max-width:calc(100vw - 24px);pointer-events:auto}
.singplay-btn{min-width:48px;min-height:48px;padding:0 16px;border-radius:24px;border:0;font:600 15px/1 inherit;background:rgba(255,250,240,.92);color:#3a2a1a;box-shadow:0 2px 8px rgba(0,0,0,.25);cursor:pointer}
.singplay-btn[aria-disabled=true]{opacity:.5}.singplay-btn.on{background:#e0567a;color:#fff}
.singplay-hint{flex-basis:100%;margin:0;text-align:center;font:600 13px/1.3 inherit;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.7);min-height:17px}
.singplay-group{flex-basis:100%;display:flex;justify-content:center;gap:6px}.singplay-seg[aria-pressed=true]{background:#5b3fa0;color:#fff}
@media (max-width:640px){.singplay-bar{bottom:auto;top:calc(env(safe-area-inset-top,0px) + 104px);left:12px;right:12px;transform:none;max-width:none;flex-wrap:wrap;gap:6px}.singplay-btn{min-height:44px;min-width:44px;padding:0 10px;font-size:13px;white-space:nowrap}.singplay-hint{position:absolute;top:102px;left:0;right:0}}`;
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
    // (Group of 8 shows on a phone once it has measured strong: strong-phone.js)
    for (const b of this.btnGroup || []) { b.hidden = Number(b.dataset.n) > this.max(); b.setAttribute('aria-pressed', String(Number(b.dataset.n) === this.group)); b.setAttribute('aria-disabled', String(!!p)); }
    this.hint.textContent = !this.songs?.length ? tx(N_('No songs yet')) : p ? (p.data.song.title ? `♪ ${tx(p.data.song.title)}` : '') : this.groupWait ? tx(N_('Getting the group ready…')) : this.allowed.ok ? '' : tx(REASONS[this.allowed.reason] || REASONS.room);
  }

  // ---------------------------------------------------------------- performing
  /** Pick the group size (1, 4, 8): its members' models (and the back row's pack) start loading now. */
  setGroup(n, save = true) {
    this.group = Math.min(n, this.limits ? this.max() : 8);
    if (save) saveGroup(this.group);
    this.checkT = 0;
    const files = troupeFiles(this.group, this.g.renderer.qualityName === 'low'), a = this.g.assets;
    if (files.length && !files.every(f => a.has(f))) {
      this.groupWait = true;
      const ready = this.groupReady = a.loadLater(files).then(() => files.every(f => a.has(f))).catch(() => false);
      ready.then(ok => { if (this.groupReady !== ready) return; this.groupWait = false; if (!ok) { this.ui.toast?.(tx(N_("The group couldn't be loaded"))); this.group = 1; } this.label(); });
    } else { this.groupWait = false; this.groupReady = Promise.resolve(true); }
    this.label();
  }

  perform() {
    const g = this.g, p = g.player;
    if (this.perf || !this.songs?.length) return;
    if (!this.allowed.ok) { this.ui.toast?.(tx(REASONS[this.allowed.reason] || REASONS.room)); return; }
    if (this.groupWait) { this.ui.toast?.(tx(N_('Getting the group ready…'))); return; }
    // the song in the game's language (content/kotone-songs.js songsFor: English where she has none in it); the next one each time
    const want = new Set(songsFor(this.songs.map(x => x.song), getLang())), pool = this.songs.filter(x => want.has(x.song));
    const song = pool[this.songIx++ % pool.length];
    p.locked = true; p.vel.set(0, 0, 0);
    this.perf = new Performer(p, this.clips, song, { audio: g.audio, restRoot: this.restRoot });
    this.perf.start(0);
    this.d.performing = true;   // (director.updateBarks: the villagers' bubbles hidden, no new ones, until she stops)
    if (this.group > 1) this.makeTroupe();
    g.audio?.holdMusic?.('singplay', true);
    this.shots = planShots(this.perf.plan, this.perf.clock, { group: !!this.troupe });
    this.cam = createCameraMan(this.shots, { portrait: innerHeight > innerWidth });
    // a phone showing 8: its frame budget is watched; broken, the back row leaves at the next cut (strong-phone.js)
    this.watch = this.troupe?.size === 8 && g.renderer.qualityName === 'low' && !this.limits.forced ? new BudgetWatch() : null;
    this.dropAt = null;
    this.gather();
    this.label();
  }

  stopSong() {
    const g = this.g;
    if (this.rec) this.toggleRecord();
    this.dropTroupe();
    this.watch = null; this.dropAt = null;
    this.perf?.dispose(); this.perf = null; this.cam = null;
    this.d.performing = false;
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
    const c = this.formation ? this.groupCentre() : p.pos, ring = this.formation ? AUDIENCE.groupRing : AUDIENCE.ring, spread = this.formation ? .38 : .55;
    near.forEach((it, i) => {
      const a = p.facing + (i - (near.length - 1) / 2) * spread, x = c.x + Math.sin(a) * ring, z = c.z + Math.cos(a) * ring;
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
      if (this.watch) this.budget();
      this.troupe?.update(dt, g.camera);
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
      if (this.checkT <= 0) {
        this.checkT = .3;
        if ((this.strongT = (this.strongT || 0) + 1) % 4 === 0) this.judgeStrong(true);   // (about once a second)
        const was = this.allowed.ok + this.allowed.reason, env = gameEnv(g);
        this.allowed = p.grounded ? canPerform(p.pos, env) : { ok: false, reason: 'steep' };
        if (this.allowed.ok && this.group > 1) this.allowed = canGroup(p.pos, p.facing, this.spots(), env);
        if (was !== this.allowed.ok + this.allowed.reason) this.label();
      }
    }
    this.saveT -= dt; if (this.saveT <= 0) { this.saveT = 5; this.keepPlace(); }
  }

  /** The automatic camera while she performs (true: it holds the view this frame). A drag gives the view back for 4 s. */
  camera(dt) {
    const g = this.g, p = g.player, now = performance.now();
    if (!this.perf || !this.cam || !this.auto) return false;
    if (g.input.dragging || g.input.touch?.look?.moved) this.freeUntil = now + 4000;
    if (now < this.freeUntil) { this.camWas = false; return false; }
    if (!this.camWas) { this.cam = createCameraMan(this.shots, { portrait: innerHeight > innerWidth }); this.camWas = true; }
    this.cam.portrait = innerHeight > innerWidth;
    const clear = (a, b) => g.colliders.raycast(a.x, a.y, a.z, b.x, b.y, b.z);
    const subject = { x: p.pos.x, y: p.pos.y, z: p.pos.z, facing: p.facing };
    if (this.formation) { const c = this.groupCentre(); subject.group = { x: c.x, z: c.z, w: this.groupW, depth: this.groupD }; }
    this.cam.update(dt, this.perf.t, subject, g.camera, clear);
    p.silhouette?.show?.(false);
    return true;
  }

  // ---------------------------------------------------------------- strong phones (strong-phone.js)
  /** The largest group shown now. */
  max() { return groupMax(this.limits, this.strong); }

  /** Is this phone strong enough for 8 now? (Medium and High always are.) live: the HUD follows a change. */
  judgeStrong(live = false) {
    const g = this.g, r = g.renderer, was = this.limits ? this.max() : 0;
    this.strong = strongPhone({ ...deviceFacts(r.qualityName), level: r.governor?.level ?? 0, pace: g.pacer?.pace || 0, frames: g.ring?.summary?.() || null, saved: loadStrong() });
    if (this.strong.ok && this.strong.why === 'measured' && loadStrong() !== '1') saveStrong('1');
    if (!live || this.max() === was) return;
    if (this.group > this.max()) this.setGroup(this.max(), false);
    this.label();
  }

  /** During a show of 8 on a phone: the frame budget, and the back row leaving when it breaks. */
  budget() {
    const g = this.g, ring = g.ring, w = this.watch;
    if ((g.renderer.governor?.level ?? 0) > 0 || (g.pacer?.pace || 0) > 0) w.trip();
    else if (ring?.count) { const i = (ring.i - 1 + ring.n) % ring.n; w.feed(ring.work[i], ring.gap[i]); }
    if (!w.broken || !this.troupe) return;
    const t = this.perf.t;
    this.dropAt ??= { since: t, shot: shotIndex(this.shots, t) };
    if (!dropNow(this.shots, t, this.dropAt)) return;
    this.troupe.setSize(4);
    const xs = troupeOf(4).map(m => m.x), zs = troupeOf(4).map(m => m.z);
    this.groupW = Math.max(...xs) - Math.min(...xs); this.groupD = Math.max(...zs) - Math.min(...zs);
    saveStrong('0'); this.strong = { ok: false, why: 'fell back' };
    this.group = 4; saveGroup(4);
    this.watch = null; this.dropAt = null;
    this.label();
  }

  // ---------------------------------------------------------------- the group (content/troupe.js, perform/troupe.js)
  /** The members' places from Kotone, in her frame (metres: x across, z forward). */
  spots() {
    const k = leadOffset();
    return troupeOf(this.group).filter(m => !m.lead).map(m => ({ x: m.x - k.x, z: m.z - k.z }));
  }

  /** The formation's centre in the world (Kotone stands off it: front row, inner place). */
  groupCentre() {
    const p = this.g.player, k = leadOffset(), s = Math.sin(p.facing), c = Math.cos(p.facing), x = -k.x, z = -k.z;
    return { x: p.pos.x + x * c + z * s, z: p.pos.z - x * s + z * c };
  }

  /** The members around her, posed by the troupe (clones of the loaded files; the back row's source gets its pack). */
  makeTroupe() {
    const g = this.g, p = g.player, low = g.renderer.qualityName === 'low', k = leadOffset(), L = this.limits;
    const root = this.formation = new THREE.Group(); root.name = 'troupe';
    root.position.set(p.pos.x, 0, p.pos.z); root.rotation.y = p.facing;
    const members = [], cast = troupeOf(this.group), s = Math.sin(p.facing), c = Math.cos(p.facing);
    for (const m of cast) {
      if (m.lead) continue;
      const model = g.assets.clone(low ? `${m.file}.lite` : m.file); if (!model) continue;
      const x = m.x - k.x, z = m.z - k.z;
      model.position.set(x, g.world.heightAt(p.pos.x + x * c + z * s, p.pos.z - x * s + z * c), z);
      model.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
      root.add(model);
      const e = { m, model };
      if (m.source) { const pack = g.assets.gltf(`moves-${m.file}`); e.clips = pack ? prepareMoves(pack, model, pack.scene, false) : new Map(); }
      members.push(e);
    }
    g.scene.add(root); root.updateMatrixWorld(true);
    const xs = cast.map(m => m.x), zs = cast.map(m => m.z);
    this.groupW = Math.max(...xs) - Math.min(...xs); this.groupD = Math.max(...zs) - Math.min(...zs);
    this.troupe = new Troupe(this.perf, p.model, this.restRoot, members, { backHalf: L.backHalf, backFaces: L.backFaces, backShadows: L.backShadows, merge: L.merge, parent: root });
  }

  dropTroupe() {
    this.troupe?.dispose(); this.troupe = null;
    this.formation?.removeFromParent(); this.formation = null;
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
