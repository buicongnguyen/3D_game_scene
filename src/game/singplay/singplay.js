// © 2026 Bui Cong Nguyen · solluxlabs.com
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
import { planShots, createCameraMan, fromCamera } from '../perform/camera-man.js';
import { startRecording, srtFromLyrics, saveBlob } from '../perform/recorder.js';
import { canPerform, canGroup, gameEnv } from './flat.js';
import { Troupe, leadSource } from '../perform/troupe.js';
import { GROUP_SIZES, troupeOf, troupeFiles, leadOffset, KOTONE, SINGERS, NAMES, nameOf, member, facePic, singersWith, avoidOf, NIGHT_STAR } from '../../content/troupe.js';
import { nightStarSeen } from '../../content/night-star.js';
import { ShowFX } from '../../fx/show-fx.js';
import { SHOW_KEY, showDefault } from '../perform/show-cues.js';
import { captionLines, captionAt } from '../perform/caption.js';
import { strongPhone, BudgetWatch, dropNow, shotIndex, STRONG_KEY } from './strong-phone.js';
import { deviceFacts } from '../../engine/device-note.js';
import { mountStages } from './stages-row.js';
import { SAVE_KEY } from './sing-here.js';
import { DANCE_STYLES, DANCE_STYLE } from '../../content/kotone-club.js';
import { mountTime } from './time-row.js';
import { NightWatchers } from './night-watchers.js';

export { SAVE_KEY };   // (sing-here.js: the pause menu's Sing here writes her place before this module loads)
export const GROUP_KEY = 'starline:singplay:group';   // the group size last picked (per device: 1, 4 or 8)
export const DANCE_KEY = 'starline:singplay:dance';   // the Dance choice last picked (per device: content/kotone-club.js DANCE_STYLES)
export const SINGER_KEY = 'starline:singplay:singer';   // the singer last picked (per device: content/troupe.js SINGERS)
export const SONG_KEY = 'starline:singplay:song';       // the song last picked (per device: a content/kotone-songs.js id)
export const LYRICS_KEY = 'starline:singplay:lyrics';   // the lyric caption on ('1', the default) or off ('0')
export { SHOW_KEY };                                     // the show effects on ('1') or off ('0'): perform/show-cues.js showDefault
export const STAGE = Object.freeze({ x: -92, z: 101, facing: Math.PI });   // first visit: the station stage (facing: the camera's view, content/stages.js)
const REASONS = { water: N_('Too close to the water'), steep: N_('Too steep here'), room: N_('Not enough room here'), group: N_('Not enough room for the group here') };
const GROUP_LABELS = { 1: N_('Solo'), 4: N_('Group of 4'), 8: N_('Group of 8') };
const DANCE_LABELS = { mix: N_('Mixed'), kpop: N_('K-pop'), cute: N_('Cute'), hiphop: N_('Hip-hop') };
export const loadDance = (store = globalThis.localStorage) => { try { const v = store?.getItem(DANCE_KEY); return DANCE_STYLES.includes(v) ? v : DANCE_STYLE; } catch { return DANCE_STYLE; } };
const saveDance = v => { try { localStorage.setItem(DANCE_KEY, v); } catch { /* per-device convenience */ } };
const load = (k, ok, d, store = globalThis.localStorage) => { try { const v = store?.getItem(k); return v !== null && v !== undefined && ok(v) ? v : d; } catch { return d; } };
const keep = (k, v) => { try { localStorage.setItem(k, v); } catch { /* per-device convenience */ } };
/** The Singer row: the eight, and the Night Star once her show was seen (content/night-star.js; ?nightstar=1 for testing). */
export const singerList = (store = globalThis.localStorage, params = null) => singersWith(nightStarSeen(store) || params?.get?.('nightstar') === '1' ? [NIGHT_STAR] : []);
export const loadSinger = (store, params = null) => load(SINGER_KEY, v => singerList(store, params).includes(v), KOTONE, store);
/** The model file of a singer's body (the lite one on Low). */
export const bodyFile = (id, low) => { const m = member(id) || member(KOTONE); return low ? `${m.file}.lite` : m.file; };
/** A singer's label: her name once she has one (content/troupe.js NAMES), else "Singer n" in the row's order. */
export const singerLabel = id => nameOf(id, getLang()) || tx(N_('Singer {n}'), { n: SINGERS.indexOf(id) + 1 });
/** The show effects' switch as stored (per device), else the default for this device. */
export const loadShow = (store = globalThis.localStorage, facts = {}) => { const v = load(SHOW_KEY, x => x === '1' || x === '0', '', store); return v ? v === '1' : showDefault(facts); };
/** The song to sing from a pool (the songs in the game's language): the picked one when it is there, else the first. */
export const pickSong = (pool, id) => pool.find(x => x.song.id === id) || pool[0] || null;
/** The formation's layouts, tried in turn when the group checks its room (a hillside: the closer one keeps the whole
 *  formation within the height range; content/troupe.js spots scaled across x and front to back z). */
export const LAYOUTS = Object.freeze([Object.freeze({ x: 1, z: 1 }), Object.freeze({ x: .85, z: .75 })]);
/** Her facing when she performs: toward the camera (its view direction turned half round), so the view the player framed
 *  is the backdrop behind her. dir: the camera's world look direction. */
export const faceCamera = dir => Math.atan2(dir.x, dir.z) + Math.PI;
const _dir = new THREE.Vector3();
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
    this.dance = loadDance();
    this.group = 1; this.groupReady = null; this.groupWait = false; this.troupe = null; this.formation = null; this.limits = null; this.layout = LAYOUTS[0];
    this.viewYaw = null; this.from = null;
    this.singers = singerList(undefined, game.params); this.singer = loadSinger(undefined, game.params); this.singerWait = false; this.songId = load(SONG_KEY, () => true, ''); this.lyricsOn = load(LYRICS_KEY, () => true, '1') !== '0';
    this.rig = null; this.capLines = null; this.capKey = '';
    this.show = null; this.showOn = true;   // (the show effects: fx/show-fx.js, the switch read in start())
    this.time = null; this.watchers = new NightWatchers(this);   // (the Time choice: time-row.js; night audiences: night-watchers.js)
  }

  async start() {
    const g = this.g, a = g.assets, low = g.renderer.qualityName === 'low', body = this.kBody = low ? 'kotone.lite' : 'kotone';
    this.d.singplay = true;
    this.d.refreshObjective?.();
    // the song stops with the game: pause (menu, photo mode) pauses her audio; the next frame after resume plays it on
    const tp = g.togglePause?.bind(g);
    if (tp) g.togglePause = (...args) => { const r = tp(...args); if (g.paused) this.perf?.sound?.el?.pause(); return r; };
    // Kotone's model and moves always (she is the lead, or the rig the lead copies), the picked singer's model besides
    const lead = bodyFile(this.singer, low);
    await a.loadLater([...new Set([body, SHOW.pack, lead])]);
    if (!a.has(body)) { this.ui.toast?.(tx("Kotone couldn't be loaded")); return false; }
    this.prepareClips();
    if (!this.swapBody(a.has(lead) ? this.singer : KOTONE)) return false;
    const place = loadPlace() || STAGE;
    g.player.teleport(place.x, place.z, undefined, place.facing);
    g.follow.first = true; g.follow.yaw = place.facing;   // (the camera behind her looks at the view: she turns to it on Perform)
    const list = [...KOTONE_SONGS, songFromParam(g.params?.get?.('kotoneSong'))].filter(Boolean);
    this.songs = (await Promise.all(list.map(loadSong))).filter(Boolean);
    this.limits = groupLimits(low, g.params);
    this.judgeStrong();
    this.showOn = g.params?.get?.('showfx') ? g.params.get('showfx') !== 'off' : loadShow(undefined, { tier: g.renderer.qualityName, strong: this.strong });
    if (this.showOn) this.makeShow();
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

  /** Kotone's dance clips (her moves pack), made ready once for any clone of her model (the same skeleton and rest). */
  prepareClips() {
    const g = this.g, pack = g.assets.gltf(SHOW.pack), rig = g.assets.clone(this.kBody);
    this.clips = pack && rig ? prepareMoves(pack, rig, pack.scene, false) : new Map();
    this.restRoot = pack?.scene || null;
  }

  /**
   * The player's body becomes the singer `id` (Kotone unless the Singer row picked another member): her model, her own
   * everyday clips (Kotone: plus her show pack), her gait, her face; Mika's lantern put away. -> false if not loaded.
   */
  swapBody(id) {
    const g = this.g, p = g.player, name = bodyFile(id, g.renderer.qualityName === 'low'), m = g.assets.clone(name);
    if (!m) return false;
    p.anim?.mixer?.stopAllAction?.(); p.face?.sing?.(null);
    p.pivot.remove(p.model);
    p.silhouette?.dispose?.();
    m.position.y = -SWIM.pivot;
    m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    p.pivot.add(m);
    p.model = m; p.anim = new Animator(m); p.gait = id === KOTONE ? HUMAN_GAIT.kotone : member(id).gait; p.grip = m.getObjectByName('grip_R') || m; p.idleClip = 'Idle';
    p.silhouette = new Silhouette(m);
    p.lantern?.removeFromParent(); p.carry = null;
    p.face = Face.attach(m);
    if (id === KOTONE) lendClips(p.anim, this.clips);
    p.anim.play('Idle');
    this.singer = id; this.bodyName = name;
    return true;
  }

  /** The Singer row: she becomes the player's body and the lead (her model loads first; never during a song). */
  async pickSinger(id) {
    if (this.perf || this.singerWait || id === this.singer || !this.singers.includes(id)) return;
    const a = this.g.assets, name = bodyFile(id, this.g.renderer.qualityName === 'low');
    keep(SINGER_KEY, id);
    if (!a.has(name)) { this.singerWait = true; this.label(); await a.loadLater([name]).catch(() => {}); this.singerWait = false; }
    if (this.perf || !a.has(name) || !this.swapBody(id)) { if (!a.has(name)) this.ui.toast?.(tx(N_("The group couldn't be loaded"))); this.label(); return; }
    this.setGroup(this.group, false);   // (the cast around her changes: its files load now)
    this.label();
  }

  // (facing kept: the view's, not her turn to the camera during a song)
  keepPlace() { const p = this.g.player, f = this.perf && this.viewYaw !== null ? this.viewYaw : p.facing; if (!p.swimming) savePlace({ x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2), facing: +(Math.atan2(Math.sin(f), Math.cos(f))).toFixed(3) }); }

  /** Her facing if she performed now: toward the camera (faceCamera). */
  performFacing() {
    const c = this.g.camera, d = c.getWorldDirection(_dir);
    return Math.hypot(d.x, d.z) > .05 ? faceCamera(d) : (this.g.follow?.yaw ?? this.g.player.facing) + Math.PI;
  }

  /** The ground for the feet and the camera on a hillside: the terrain outdoors; null in a room or on a deck (level). */
  ground() { const g = this.g, p = g.player; return g.interiors?.active || p.onItem ? null : (x, z) => g.world.heightAt(x, z); }

  // ---------------------------------------------------------------- the HUD: one row, every button always in its place
  // (during a song the setup rows - group, dance, stages - hide: they cannot be used then; Stop, Record, Photo and Camera
  // stay in one row with the song line under it)
  hud() {
    const bar = this.bar = document.createElement('div');
    bar.id = 'singplayBar'; bar.className = 'singplay-bar';
    const mk = (id, label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.id = id; b.className = 'singplay-btn'; b.textContent = tx(label); b.addEventListener('click', e => { e.stopPropagation(); this.g.audio?.click?.(); fn(); }); bar.appendChild(b); return b; };
    this.btnPerform = mk('spPerform', N_('Perform'), () => (this.perf ? this.stopSong() : this.perform()));
    this.btnRecord = mk('spRecord', N_('Record'), () => this.toggleRecord());
    this.btnPhoto = mk('spPhoto', N_('Photo'), () => this.photo());
    this.btnCam = mk('spCam', N_('Camera: Auto'), () => { this.auto = !this.auto; this.freeUntil = 0; this.label(); });
    // (two setup rows share a line: group + dance, singer + song; a line scrolls sideways where it does not fit)
    const line = (...rows) => { const l = document.createElement('div'); l.className = 'singplay-line'; l.append(...rows); bar.appendChild(l); return l; };
    // the group: three flat choices in a row of their own, always visible (no menu)
    const row = this.groupRow = document.createElement('div'); row.className = 'singplay-group'; row.setAttribute('role', 'group'); row.setAttribute('aria-label', tx(N_('Group')));
    this.btnGroup = GROUP_SIZES.filter(n => n <= Math.max(this.limits.max, this.limits.strongMax)).map(n => {
      const b = document.createElement('button'); b.type = 'button'; b.id = `spGroup${n}`; b.className = 'singplay-btn singplay-seg'; b.textContent = tx(GROUP_LABELS[n]); b.dataset.n = String(n);
      b.addEventListener('click', e => { e.stopPropagation(); this.g.audio?.click?.(); if (!this.perf) this.setGroup(n); });
      row.appendChild(b); return b;
    });
    // the dance style: four flat choices in a row of their own, always visible (no menu); the group dances it too
    const drow = this.danceRow = document.createElement('div'); drow.className = 'singplay-group singplay-dance'; drow.setAttribute('role', 'group'); drow.setAttribute('aria-label', tx(N_('Dance style')));
    this.btnDance = DANCE_STYLES.map(id => {
      const b = document.createElement('button'); b.type = 'button'; b.id = `spDance-${id}`; b.className = 'singplay-btn singplay-seg'; b.textContent = tx(DANCE_LABELS[id]); b.dataset.dance = id;
      b.addEventListener('click', e => { e.stopPropagation(); this.g.audio?.click?.(); if (!this.perf) { this.dance = id; saveDance(id); this.label(); } });
      drow.appendChild(b); return b;
    });
    line(row, drow);
    // the singer: the eight members' faces in a flat row (no menu); she becomes the player and sings lead
    const srow = this.singerRow = document.createElement('div'); srow.className = 'singplay-group singplay-scroll singplay-singers'; srow.setAttribute('role', 'group'); srow.setAttribute('aria-label', tx(N_('Singer')));
    this.btnSinger = this.singers.map(id => {
      const b = document.createElement('button'); b.type = 'button'; b.id = `spSinger-${id}`; b.className = 'singplay-btn singplay-seg singplay-face'; b.dataset.singer = id;
      b.setAttribute('aria-label', singerLabel(id)); b.title = singerLabel(id);
      const img = document.createElement('img'); img.src = facePic(id); img.alt = ''; img.width = 40; img.height = 40; img.decoding = 'async'; img.draggable = false;
      b.appendChild(img);
      b.addEventListener('click', e => { e.stopPropagation(); this.g.audio?.click?.(); this.pickSinger(id); });
      srow.appendChild(b); return b;
    });
    // the song: the songs she can sing in the game's language (new ones: an entry in content/kotone-songs.js), and the
    // lyric caption's switch at the end of the same row
    const qrow = this.songRow = document.createElement('div'); qrow.className = 'singplay-group singplay-scroll singplay-songs'; qrow.setAttribute('role', 'group'); qrow.setAttribute('aria-label', tx(N_('Song')));
    this.btnSongs = this.pool().map(x => {
      const b = document.createElement('button'); b.type = 'button'; b.id = `spSong-${x.song.id}`; b.className = 'singplay-btn singplay-seg'; b.textContent = `♪ ${tx(x.song.title || x.song.id)}`; b.dataset.song = x.song.id;
      b.addEventListener('click', e => { e.stopPropagation(); this.g.audio?.click?.(); if (!this.perf) { this.songId = x.song.id; keep(SONG_KEY, x.song.id); this.label(); } });
      qrow.appendChild(b); return b;
    });
    this.btnLyrics = document.createElement('button'); this.btnLyrics.type = 'button'; this.btnLyrics.id = 'spLyrics'; this.btnLyrics.className = 'singplay-btn singplay-seg';
    this.btnLyrics.addEventListener('click', e => { e.stopPropagation(); this.g.audio?.click?.(); this.lyricsOn = !this.lyricsOn; keep(LYRICS_KEY, this.lyricsOn ? '1' : '0'); this.capKey = '-'; this.label(); });
    qrow.appendChild(this.btnLyrics);
    // the show effects (fx/show-fx.js: the stage set, lights, bursts, glow sticks, fireworks): a switch of their own,
    // remembered per device (owner rule: every costly feature can be switched off in the game)
    this.btnShow = document.createElement('button'); this.btnShow.type = 'button'; this.btnShow.id = 'spShow'; this.btnShow.className = 'singplay-btn singplay-seg';
    this.btnShow.addEventListener('click', e => { e.stopPropagation(); this.g.audio?.click?.(); if (this.perf) return; this.showOn = !this.showOn; keep(SHOW_KEY, this.showOn ? '1' : '0'); if (this.showOn) this.makeShow(); this.label(); });
    qrow.appendChild(this.btnShow);
    line(srow, qrow);
    // the lyric caption over the view while she sings (a DOM line: recorded videos stay clean, the .srt has the words)
    const cap = this.capEl = document.createElement('div'); cap.id = 'spCaption'; cap.className = 'singplay-caption'; cap.hidden = true; cap.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cap);
    this.hint = document.createElement('p'); this.hint.className = 'singplay-hint'; this.hint.setAttribute('aria-live', 'polite');
    bar.appendChild(this.hint);
    this.stages = mountStages(this);   // the stage list: a row of its own (stages-row.js)
    this.time = mountTime(this);       // the Time choice, on one line with the stages (time-row.js)
    if (!document.getElementById('singplayStyle')) {
      const st = document.createElement('style'); st.id = 'singplayStyle';
      st.textContent = `.singplay-bar{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 12px);display:flex;flex-wrap:wrap;justify-content:center;gap:8px;z-index:30;max-width:calc(100vw - 24px);pointer-events:auto}
.singplay-btn{min-width:48px;min-height:48px;padding:0 16px;border-radius:24px;border:0;font:600 15px/1 inherit;background:rgba(255,250,240,.92);color:#3a2a1a;box-shadow:0 2px 8px rgba(0,0,0,.25);cursor:pointer}
.singplay-btn[aria-disabled=true]{opacity:.5}.singplay-btn.on{background:#e0567a;color:#fff}
.singplay-hint{flex-basis:100%;margin:0;text-align:center;font:600 13px/1.3 inherit;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.7);min-height:17px}
body.singplay #inventory{display:none}
@media (max-width:640px){body.singplay #toasts{top:auto;bottom:calc(8px + env(safe-area-inset-bottom,0px))}}
.singplay-group{flex-basis:100%;display:flex;justify-content:center;gap:6px}.singplay-seg[aria-pressed=true]{background:#5b3fa0;color:#fff}
.singplay-bar.performing .singplay-group,.singplay-bar.performing .singplay-stages{display:none}
@media (max-width:640px){.singplay-bar{bottom:auto;top:calc(env(safe-area-inset-top,0px) + 104px);left:12px;right:12px;transform:none;max-width:none;flex-wrap:wrap;gap:6px}.singplay-btn{min-height:44px;min-width:44px;padding:0 10px;font-size:13px;white-space:nowrap}.singplay-hint{position:absolute;top:152px;left:0;right:0}}
@media (max-width:640px){.singplay-bar.performing.performing .singplay-hint{top:52px}}
.singplay-scroll{overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:none;-webkit-overflow-scrolling:touch}.singplay-scroll::-webkit-scrollbar{display:none}.singplay-scroll>.singplay-btn{flex:0 0 auto}
.singplay-face{width:48px;padding:0;display:inline-flex;align-items:center;justify-content:center;overflow:hidden}.singplay-face img{width:40px;height:40px;border-radius:50%;display:block;pointer-events:none}
.singplay-face[aria-pressed=true]{background:#5b3fa0;box-shadow:0 0 0 3px #5b3fa0,0 2px 8px rgba(0,0,0,.25)}
.singplay-line{flex-basis:100%;display:flex;flex-wrap:nowrap;gap:16px;justify-content:safe center;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:none;-webkit-overflow-scrolling:touch}.singplay-line::-webkit-scrollbar{display:none}
.singplay-line>.singplay-group{flex:0 0 auto;width:auto}
.singplay-bar.performing .singplay-line{display:none}
@media (max-width:640px){.singplay-line{justify-content:flex-start;gap:12px}}
@media (max-height:480px) and (orientation:landscape){.singplay-line{justify-content:flex-start;gap:12px;contain:inline-size}}
.singplay-caption{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 23vh);z-index:29;width:max-content;max-width:min(720px,calc(100vw - 32px));box-sizing:border-box;padding:6px 16px;border-radius:18px;background:rgba(14,10,24,.58);color:rgba(255,255,255,.7);font:600 17px/1.35 inherit;text-align:center;pointer-events:none;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-shadow:0 1px 2px rgba(0,0,0,.5)}
.singplay-caption[hidden]{display:none}.singplay-caption .sung{color:#fff}.singplay-caption .now{color:#ffd36e}
@media (max-width:640px){.singplay-face{width:44px}.singplay-face img{width:36px;height:36px}.singplay-singers,.singplay-songs{justify-content:flex-start}.singplay-caption{bottom:calc(env(safe-area-inset-bottom,0px) + 190px);font-size:14px;padding:5px 12px}}
@media (max-height:480px) and (orientation:landscape){.singplay-face{width:44px;min-height:44px}.singplay-face img{width:36px;height:36px}.singplay-caption{bottom:calc(env(safe-area-inset-bottom,0px) + 98px);font-size:14px;max-width:min(560px,calc(100vw - 360px))}}`;
      document.head.appendChild(st);
    }
    document.body.appendChild(bar);
    document.body.classList.add('singplay');   // Kotone carries none of Mika's items: the item strip hides (style above)
    this.label();
  }

  label() {
    const p = this.perf, ok = this.allowed.ok || !!p;
    this.btnPerform.textContent = tx(p ? N_('Stop') : N_('Perform'));
    this.btnPerform.setAttribute('aria-disabled', String(!ok || !this.songs?.length));
    this.btnRecord.textContent = this.rec ? `● ${fmt(this.rec.secs())}` : tx(N_('Record'));
    this.btnRecord.classList.toggle('on', !!this.rec);
    // Record works before a song too: it starts the performance and the recording together
    this.btnRecord.setAttribute('aria-disabled', String(!p && !this.rec && !(ok && this.songs?.length && !this.groupWait)));
    this.bar.classList.toggle('performing', !!p);   // (during a song the setup rows hide: one row of Stop, Record, Photo, Camera)
    this.btnCam.textContent = tx(this.auto ? N_('Camera: Auto') : N_('Camera: Free'));
    this.btnCam.setAttribute('aria-disabled', String(!p));
    // (Group of 8 shows on a phone once it has measured strong: strong-phone.js)
    for (const b of this.btnDance || []) { b.setAttribute('aria-pressed', String(b.dataset.dance === this.dance)); b.setAttribute('aria-disabled', String(!!p)); }
    for (const b of this.btnGroup || []) { b.hidden = Number(b.dataset.n) > this.max(); b.setAttribute('aria-pressed', String(Number(b.dataset.n) === this.group)); b.setAttribute('aria-disabled', String(!!p)); }
    for (const b of this.btnSinger || []) { b.setAttribute('aria-pressed', String(b.dataset.singer === this.singer)); b.setAttribute('aria-disabled', String(!!p || this.singerWait)); }
    const song = pickSong(this.pool(), this.songId)?.song.id;
    for (const b of this.btnSongs || []) { b.setAttribute('aria-pressed', String(b.dataset.song === song)); b.setAttribute('aria-disabled', String(!!p)); }
    if (this.btnLyrics) { this.btnLyrics.textContent = tx(this.lyricsOn ? N_('Lyrics: On') : N_('Lyrics: Off')); this.btnLyrics.setAttribute('aria-pressed', String(this.lyricsOn)); }
    if (this.btnShow) { this.btnShow.textContent = tx(this.showOn ? N_('Show effects: On') : N_('Show effects: Off')); this.btnShow.setAttribute('aria-pressed', String(this.showOn)); this.btnShow.setAttribute('aria-disabled', String(!!p)); }
    this.stages?.refresh();
    this.time?.refresh?.();
    this.hint.textContent = !this.songs?.length ? tx(N_('No songs yet')) : p ? (p.data.song.title ? `♪ ${tx(p.data.song.title)}` : '') : this.groupWait ? tx(N_('Getting the group ready…')) : this.allowed.ok ? '' : tx(REASONS[this.allowed.reason] || REASONS.room);
    if (!this.hint.textContent && this.time) this.hint.textContent = this.time.hint();   // ("Stella sings best at night")
  }

  // ---------------------------------------------------------------- performing
  /** Pick the group size (1, 4, 8): its members' models (and the back row's pack) start loading now. */
  setGroup(n, save = true) {
    this.group = Math.min(n, this.limits ? this.max() : 8);
    if (save) saveGroup(this.group);
    this.checkT = 0;
    const files = troupeFiles(this.group, this.g.renderer.qualityName === 'low', this.singer), a = this.g.assets;
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
    // the picked song (the Song row) of those in the game's language (content/kotone-songs.js songsFor: English where she
    // has none in it)
    const song = pickSong(this.pool(), this.songId);
    if (!song) return;
    this.time?.settle();   // (mid-ease: the hour it was easing to, before the show picks its day or night look)
    p.locked = true; p.vel.set(0, 0, 0);
    // she (and the group) turns to face the camera: the view the player framed becomes the backdrop; the auto camera's
    // first shot starts where the player's camera stood (camera-man.js open)
    const f = this.performFacing();
    this.viewYaw = f - Math.PI; p.facing = f; p.root.rotation.y = f;
    this.from = fromCamera(g.camera.position, { x: p.pos.x, y: p.pos.y, z: p.pos.z, facing: f });
    const ground = this.ground();
    this.perf = new Performer(p, this.clips, song, { audio: g.audio, restRoot: this.restRoot, style: this.dance, ground, avoid: avoidOf(this.singer) });
    // another singer: the group's Kotone (or a hidden Kotone under her in a solo) dances and the lead copies her
    const members = this.group > 1 ? this.makeFormation() : null;
    if (this.singer !== KOTONE) {
      let rig = members?.find(e => e.m.id === KOTONE)?.model;
      if (!rig) { rig = this.rig = g.assets.clone(this.kBody); rig.visible = false; rig.position.copy(p.model.position); p.pivot.add(rig); rig.updateMatrixWorld(true); }
      this.perf.source = leadSource(this.perf, rig, this.clips, this.restRoot, p.model, g.assets.gltf(this.bodyName)?.scene || rig);
    }
    if (members) this.makeTroupe(members);
    this.perf.start(0);
    // the show effects behind them (the stage set unfolds, the lights play the song: fx/show-fx.js)
    if (this.showOn && this.makeShow()) {
      const c = this.formation ? this.groupCentre() : p.pos;
      this.show.start(this.perf, { spot: { x: c.x, z: c.z, y: this.formation ? undefined : p.pos.y, facing: f }, group: this.formation ? { w: this.groupW, depth: this.groupD } : null, n: this.troupe?.count || 1, ground: this.ground() || (() => p.pos.y) });
    }
    this.d.performing = true;   // (director.updateBarks: the villagers' bubbles hidden, no new ones, until she stops)
    this.capLines = captionLines(song.lyrics); this.capKey = '-';
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
    this.show?.stop();
    this.dropTroupe();
    this.watch = null; this.dropAt = null;
    this.perf?.dispose(); this.perf = null; this.cam = null;
    this.rig?.removeFromParent(); this.rig = null;
    this.capLines = null; this.caption();
    this.d.performing = false;
    g.player.locked = false; g.follow.first = true;
    // back to the view the player framed: she turns to it again, the camera behind her
    if (this.viewYaw !== null) { g.player.facing = this.viewYaw; g.player.root.rotation.y = this.viewYaw; g.follow.yaw = this.viewYaw; this.viewYaw = null; }
    this.from = null;
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
    this.watchers?.fill(this.audience, { c, ring, spread, facing: p.facing });   // (at night: up to its count, night-watchers.js)
    this.cheerT = 3;
    // with the show effects: they wave glow sticks on the beat at night, clap on the beat by day (fx/show-fx.js)
    if (this.show?.on && this.show.items.particles) this.show.setCrowd(this.audience);
  }
  release() { for (const it of this.audience) { it.yardHold = false; it.singHold = false; it.n.path = null; it.n.setIdle('Idle'); } this.audience = []; this.watchers?.release(); }

  /** Every frame (a game system). */
  update(dt) {
    const g = this.g, p = g.player;
    p.face?.setEnabled(Face.on); p.face?.lookAt(p.gaze || null); p.face?.update(dt);
    if (this.perf) {
      this.perf.update(dt, { listen: 1, camera: g.camera });
      if (this.watch) this.budget();
      this.troupe?.update(dt, g.camera);
      this.caption();
      // the audience: a cheer or a wave now and then, more on the choruses, all of them at the end
      this.cheerT -= dt;
      const st = this.perf.state;
      if (this.cheerT <= 0 && this.audience.length && (!this.show?.crowd.length || st.moment)) {
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
        if (this.allowed.ok && this.group > 1) {
          // the formation turned to the camera, as Perform will turn it; the closer layout when the first will not fit
          const f = this.performFacing();
          let r = null;
          for (const L of LAYOUTS) { r = canGroup(p.pos, f, this.spots(L), env); if (r.ok) { this.layout = L; break; } }
          this.allowed = r;
        }
        if (was !== this.allowed.ok + this.allowed.reason) this.label(); else this.stages?.refresh();
      }
    }
    this.time?.update(dt);             // (the shown hour: a tap's ease, the slow clock while free, held during a song)
    this.watchers?.update(dt);
    this.show?.update(dt, g.camera);   // (after the song too: the set folds away)
    this.saveT -= dt; if (this.saveT <= 0) { this.saveT = 5; this.keepPlace(); }
  }

  /** The show effects, made once (their shaders compiled at once, not at the first chorus). -> the ShowFX or null */
  makeShow() {
    if (this.show) return this.show;
    try { this.show = new ShowFX(this.g); this.show.warm(this.g.camera).catch(() => {}); } catch (e) { console.warn('[show] effects not available', e); this.show = null; }
    return this.show;
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
    const subject = { x: p.pos.x, y: p.pos.y, z: p.pos.z, facing: p.facing, from: this.from };
    if (this.formation) { const c = this.groupCentre(); subject.group = { x: c.x, z: c.z, w: this.groupW, depth: this.groupD }; }
    this.cam.update(dt, this.perf.t, subject, g.camera, clear, this.ground());
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
    this.groupW = (Math.max(...xs) - Math.min(...xs)) * this.layout.x; this.groupD = (Math.max(...zs) - Math.min(...zs)) * this.layout.z;
    saveStrong('0'); this.strong = { ok: false, why: 'fell back' };
    this.group = 4; saveGroup(4);
    this.watch = null; this.dropAt = null;
    this.ui.toast?.(tx(N_('The back row is taking a break')));
    this.label();
  }

  // ---------------------------------------------------------------- the group (content/troupe.js, perform/troupe.js)
  /** The members' places from Kotone, in her frame (metres: x across, z forward). */
  spots(L = this.layout) {
    const k = leadOffset();
    return troupeOf(this.group).filter(m => !m.lead).map(m => ({ x: (m.x - k.x) * L.x, z: (m.z - k.z) * L.z }));
  }

  /** The formation's centre in the world (Kotone stands off it: front row, inner place). */
  groupCentre() {
    const p = this.g.player, k = leadOffset(), L = this.layout, s = Math.sin(p.facing), c = Math.cos(p.facing), x = -k.x * L.x, z = -k.z * L.z;
    return { x: p.pos.x + x * c + z * s, z: p.pos.z - x * s + z * c };
  }

  /** The lyric caption: the line she sings now, its sung word lit (DOM touched only when the line or word changes). */
  caption() {
    const el = this.capEl; if (!el) return;
    const at = this.perf && this.lyricsOn && this.capLines?.length ? captionAt(this.capLines, this.perf.t) : null;
    const key = at ? `${at.i}:${at.k}` : '';
    if (key === this.capKey) return;
    this.capKey = key;
    if (!at) { el.hidden = true; return; }
    const W = this.capLines[at.i].words;
    if (el.dataset.line !== String(at.i)) {
      el.dataset.line = String(at.i); el.textContent = '';
      W.forEach((w, j) => { if (j) el.append(' '); const s = document.createElement('span'); s.textContent = w.w; el.appendChild(s); });
    }
    const spans = el.children;
    for (let j = 0; j < spans.length; j++) spans[j].className = j < at.k ? 'sung' : j === at.k ? 'now' : '';
    el.hidden = false;
  }

  /** The songs she can sing now: those in the game's language (content/kotone-songs.js songsFor). */
  pool() { const want = new Set(songsFor((this.songs || []).map(x => x.song), getLang())); return (this.songs || []).filter(x => want.has(x.song)); }

  /** The members around her (clones of the loaded files; the back row's source gets its pack, made ready for its body). */
  makeFormation() {
    const g = this.g, p = g.player, low = g.renderer.qualityName === 'low', k = leadOffset();
    const root = this.formation = new THREE.Group(); root.name = 'troupe';
    root.position.set(p.pos.x, 0, p.pos.z); root.rotation.y = p.facing;
    const members = [], cast = troupeOf(this.group, this.singer), s = Math.sin(p.facing), c = Math.cos(p.facing);
    for (const m of cast) {
      if (m.lead) continue;
      const model = g.assets.clone(low ? `${m.file}.lite` : m.file); if (!model) continue;
      const x = (m.x - k.x) * this.layout.x, z = (m.z - k.z) * this.layout.z;
      model.position.set(x, g.world.heightAt(p.pos.x + x * c + z * s, p.pos.z - x * s + z * c), z);
      model.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
      root.add(model);
      const e = { m, model };
      if (m.source && m.row === 1) { const pack = g.assets.gltf(m.pack); e.clips = pack ? prepareMoves(pack, model, pack.scene, false) : new Map(); }
      members.push(e);
    }
    return members;
  }

  /** The troupe that poses the formation's members (after makeFormation and the lead's source). */
  makeTroupe(members) {
    const g = this.g, p = g.player, L = this.limits, root = this.formation, cast = troupeOf(this.group, this.singer);
    g.scene.add(root); root.updateMatrixWorld(true);
    const xs = cast.map(m => m.x), zs = cast.map(m => m.z);
    this.groupW = (Math.max(...xs) - Math.min(...xs)) * this.layout.x; this.groupD = (Math.max(...zs) - Math.min(...zs)) * this.layout.z;
    // (a hillside: each member's feet fitted to the ground under its own spot, ground-fit.js; the formation stands at y 0,
    // so its members' heights are the world's)
    const ground = this.ground();
    this.troupe = new Troupe(this.perf, p.model, this.restRoot, members, { backHalf: L.backHalf, backFaces: L.backFaces, backShadows: L.backShadows, merge: L.merge, parent: root, ground });
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
      const name = `${(NAMES[this.singer] || 'kotone').toLowerCase()}-${this.recSong}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`;
      saveBlob(out.blob, `${name}.${out.ext}`);
      const srt = srtFromLyrics(this.recLyrics, at, this.recEnd);
      if (srt) saveBlob(new Blob([srt], { type: 'application/x-subrip' }), `${name}.srt`);
      this.lastTake = { name: `${name}.${out.ext}`, bytes: out.blob.size, secs: out.secs, mime: out.mime };
      this.ui.toast?.(tx(N_('Video saved')));
      return;
    }
    if (!this.perf) {
      // Record before a song: the performance and the recording start together (Perform's own checks first)
      this.perform();
      if (!this.perf) return;
    }
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
    R.shoot(g.scene, g.camera, R.pixelRatio, canvas => canvas.toBlob(b => { if (b) saveBlob(b, `${(NAMES[this.singer] || 'kotone').toLowerCase()}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`); }, 'image/png'));
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
