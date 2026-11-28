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
import { songsBase, fetchCatalog, mergeSongs, songOrder, songStyle, songDance } from '../../content/song-catalog.js';
import { Performer } from '../perform/performer.js';
import { planShots, createCameraMan, fromCamera } from '../perform/camera-man.js';
import { startRecording, srtFromLyrics, saveBlob } from '../perform/recorder.js';
import { canPerform, canGroup, gameEnv } from './flat.js';
import { Troupe, leadSource } from '../perform/troupe.js';
import { GROUP_SIZES, troupeOf, troupeFiles, leadOffset, KOTONE, NAMES, member, singersWith, avoidOf, NIGHT_STAR } from '../../content/troupe.js';
import { nightStarSeen } from '../../content/night-star.js';
import { ShowFX } from '../../fx/show-fx.js';
import { SHOW_KEY, showDefault } from '../perform/show-cues.js';
import { captionLines, captionAt } from '../perform/caption.js';
import { strongPhone, BudgetWatch, dropNow, shotIndex, STRONG_KEY } from './strong-phone.js';
import { deviceFacts } from '../../engine/device-note.js';
import { SAVE_KEY } from './sing-here.js';
import { DANCE_STYLES, DANCE_STYLE } from '../../content/kotone-club.js';
import { makeTime } from './time-row.js';
import { NightWatchers } from './night-watchers.js';
import { mountPickers, DANCE_AUTO, DANCE_PICKS, singerLabel } from './pickers.js';

export { SAVE_KEY };   // (sing-here.js: the pause menu's Sing here writes her place before this module loads)
export { singerLabel };   // (a singer's label: pickers.js)
export const GROUP_KEY = 'starline:singplay:group';   // the group size last picked (per device: 1, 4 or 8)
// the Dance choice last picked (per device: 'auto', the default, or a content/kotone-club.js DANCE_STYLES id). The older
// key 'starline:singplay:dance' is not read: song picks wrote it too, so it was rarely the player's own choice.
export const DANCE_KEY = 'starline:singplay:dancePick';
export const SINGER_KEY = 'starline:singplay:singer';   // the singer last picked (per device: content/troupe.js SINGERS)
export const SONG_KEY = 'starline:singplay:song';       // the song last picked (per device: a content/kotone-songs.js id)
export const LYRICS_KEY = 'starline:singplay:lyrics';   // the lyric caption on ('1', the default) or off ('0')
export { SHOW_KEY };                                     // the show effects on ('1') or off ('0'): perform/show-cues.js showDefault
export const STAGE = Object.freeze({ x: -92, z: 101, facing: Math.PI });   // first visit: the station stage (facing: the camera's view, content/stages.js)
const REASONS = { water: N_('Too close to the water'), steep: N_('Too steep here'), room: N_('Not enough room here'), group: N_('Not enough room for the group here') };
export const loadDance = (store = globalThis.localStorage) => { try { const v = store?.getItem(DANCE_KEY); return DANCE_PICKS.includes(v) ? v : DANCE_AUTO; } catch { return DANCE_AUTO; } };
const saveDance = v => { try { localStorage.setItem(DANCE_KEY, v); } catch { /* per-device convenience */ } };
/** The style she dances: Auto follows the song (content/song-catalog.js songStyle: the catalog's hint, Cute for a slow
 *  sung song), else Mixed; a picked style stays whatever the song. */
export const danceFor = (pick, song) => (pick !== DANCE_AUTO && DANCE_STYLES.includes(pick) ? pick : songStyle(song) || DANCE_STYLE);
const load = (k, ok, d, store = globalThis.localStorage) => { try { const v = store?.getItem(k); return v !== null && v !== undefined && ok(v) ? v : d; } catch { return d; } };
const keep = (k, v) => { try { localStorage.setItem(k, v); } catch { /* per-device convenience */ } };
/** The Singer row: the eight, and the Night Star once her show was seen (content/night-star.js; ?nightstar=1 for testing). */
export const singerList = (store = globalThis.localStorage, params = null) => singersWith(nightStarSeen(store) || params?.get?.('nightstar') === '1' ? [NIGHT_STAR] : []);
export const loadSinger = (store, params = null) => load(SINGER_KEY, v => singerList(store, params).includes(v), KOTONE, store);
/** The model file of a singer's body (the lite one on Low). */
export const bodyFile = (id, low) => { const m = member(id) || member(KOTONE); return low ? `${m.file}.lite` : m.file; };
/** The show effects' switch as stored (per device), else the default for this device. */
export const loadShow = (store = globalThis.localStorage, facts = {}) => { const v = load(SHOW_KEY, x => x === '1' || x === '0', '', store); return v ? v === '1' : showDefault(facts); };
/** A song's title as shown: a built-in song's translated (N_ in content/kotone-songs.js), a library song's as its catalog
 *  writes it (its own language; never matched against the game's strings). */
export const songTitle = s => (s.remote && !s.fallback ? String(s.title || s.id) : tx(s.title || s.id));
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

/**
 * Fetch a song's data files: { song, beats, lyrics, mouth, stage, url } or null. A library song (content/song-catalog.js:
 * `files` names its versioned files, `remote`) also fetches its whole audio first and plays that copy (a blob: URL): one
 * download, kept by the service worker for the next time, the same sound for Web Audio and Record. null when it fails.
 */
export async function loadSong(e, { fetch: get = globalThis.fetch } = {}) {
  const json = url => Promise.resolve().then(() => get(url)).then(r => (r.ok ? r.json() : null)).catch(() => null);
  const meta = e.meta ? await json(e.base + e.meta) : null, song = { ...(meta || {}), ...e, id: e.id };
  const file = k => (e.files ? (e.files[k] ? e.base + e.files[k] : null) : `${e.base}${e.id}.${k}.json`);
  const [beats, lyrics, mouth, stage] = await Promise.all(['beats', 'lyrics', 'mouth', 'stage'].map(k => (file(k) ? json(file(k)) : null)));
  let url = e.base + (e.audio || `${e.id}.m4a`);
  if (e.remote) {
    const blob = await Promise.resolve().then(() => get(url)).then(r => (r.ok ? r.blob() : null)).catch(() => null);
    if (!blob?.size || typeof URL?.createObjectURL !== 'function') return null;
    url = URL.createObjectURL(blob.type === 'audio/mp4' ? blob : new Blob([blob], { type: 'audio/mp4' }));   // (Safari goes by the type)
  }
  return song.bpm > 0 || beats ? { song, beats, lyrics, mouth, stage, url } : null;
}

export class SingPlay {
  constructor(game, director, ui) {
    this.g = game; this.d = director; this.ui = ui;
    this.perf = null; this.cam = null; this.auto = true; this.freeUntil = 0; this.rec = null; this.songIx = 0; this.audience = [];
    this.checkT = 0; this.allowed = { ok: false, reason: 'room' }; this.saveT = 0;
    this.dancePick = loadDance();   // ('auto': the song's own style, danceFor)
    this.group = 1; this.groupReady = null; this.groupWait = false; this.troupe = null; this.formation = null; this.limits = null; this.layout = LAYOUTS[0];
    this.viewYaw = null; this.from = null;
    this.singers = singerList(undefined, game.params); this.singer = loadSinger(undefined, game.params); this.singerWait = false; this.singerNext = null; this.songId = load(SONG_KEY, () => true, ''); this.lyricsOn = load(LYRICS_KEY, () => true, '1') !== '0';
    this.rig = null; this.capLines = null; this.capKey = '';
    this.songWait = false; this.loaded = new Map();   // (a song's files, fetched when it is first performed: id -> promise)
    this.show = null; this.showOn = true;   // (the show effects: fx/show-fx.js, the switch read in start())
    this.time = null; this.watchers = new NightWatchers(this);   // (the Time choice: time-row.js; night audiences: night-watchers.js)
  }

  async start() {
    const g = this.g, a = g.assets, low = g.renderer.qualityName === 'low', body = this.kBody = low ? 'kotone.lite' : 'kotone';
    this.d.singplay = true;
    this.d.refreshObjective?.();
    // the song stops with the game: pause (menu, photo mode) pauses her audio; the next frame after resume plays it on
    const tp = g.togglePause?.bind(g);
    if (tp) g.togglePause = (...args) => { const r = tp(...args); if (g.paused) { this.perf?.sound?.el?.pause(); this.pickers?.reset(); } return r; };
    // Kotone's model and moves always (she is the lead, or the rig the lead copies), the picked singer's model besides
    const lead = bodyFile(this.singer, low);
    await a.loadLater([...new Set([body, SHOW.pack, lead])]);
    if (!a.has(body)) { this.ui.toast?.(tx("Kotone couldn't be loaded")); return false; }
    this.prepareClips();
    if (!this.swapBody(a.has(lead) ? this.singer : KOTONE)) return false;
    const place = loadPlace() || STAGE;
    g.player.teleport(place.x, place.z, undefined, place.facing);
    g.follow.first = true; g.follow.yaw = place.facing;   // (the camera behind her looks at the view: she turns to it on Perform)
    // the songs: the built-in ones now, the library's when its catalog comes in (content/song-catalog.js; at most 4 s, else
    // the built-in ones stay); a song's own files load when it is performed
    this.builtIn = [...KOTONE_SONGS, songFromParam(g.params?.get?.('kotoneSong'))].filter(Boolean);
    this.songs = this.builtIn.map(song => ({ song }));
    const base = songsBase(g.params);
    this.catalog = base ? fetchCatalog(base).then(lib => { if (lib) this.setSongs(mergeSongs(this.builtIn, lib)); return lib; }) : Promise.resolve(null);
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
    // (while her model loads, the Singer chip already shows her, dimmed: singerNext)
    if (!a.has(name)) { this.singerWait = true; this.singerNext = id; this.label(); await a.loadLater([name]).catch(() => {}); this.singerWait = false; this.singerNext = null; }
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

  // ---------------------------------------------------------------- the HUD (docs/SING-AND-PLAY.md "Bar layout")
  // One stack at the bottom centre: the lyric caption (while she sings), the setup chips (pickers.js: Singer, Song, Group,
  // Dance, Stage, Time, settings; on phones they sit at the top under the little map instead, in two rows), the hint line
  // and the actions. The actions stay direct buttons, always in their places: Perform (Stop while she sings, in the same
  // spot), Record, Photo, and Camera during a song. During a song the chips hide.
  hud() {
    const bar = this.bar = document.createElement('div');
    bar.id = 'singplayBar'; bar.className = 'singplay-bar';
    // the lyric caption over the view while she sings (a DOM line: recorded videos stay clean, the .srt has the words)
    const cap = this.capEl = document.createElement('div'); cap.id = 'spCaption'; cap.className = 'singplay-caption'; cap.hidden = true; cap.setAttribute('aria-hidden', 'true');
    bar.appendChild(cap);
    this.hint = document.createElement('p'); this.hint.className = 'singplay-hint'; this.hint.setAttribute('aria-live', 'polite');
    bar.appendChild(this.hint);
    const acts = this.actsEl = document.createElement('div'); acts.className = 'sp-actions';
    const mk = (id, icon, fn, cls = '') => {
      const b = document.createElement('button'); b.type = 'button'; b.id = id; b.className = `singplay-btn sp-act${cls}`;
      b.innerHTML = `<span class="sp-act-ic">${icon}</span><span class="sp-act-tx"></span><span class="sp-act-short"></span>`;
      b.addEventListener('click', e => { e.stopPropagation(); this.g.audio?.click?.(); fn(); });
      acts.appendChild(b); return b;
    };
    this.btnPerform = mk('spPerform', ACT.mic, () => (this.perf ? this.stopSong() : this.perform()), ' primary');
    this.btnRecord = mk('spRecord', ACT.rec, () => this.toggleRecord());
    this.btnPhoto = mk('spPhoto', ACT.photo, () => this.photo());
    this.btnCam = mk('spCam', ACT.cam, () => { this.auto = !this.auto; this.freeUntil = 0; this.label(); });
    bar.appendChild(acts);
    if (!document.getElementById('singplayStyle')) {
      const st = document.createElement('style'); st.id = 'singplayStyle';
      st.textContent = BAR_STYLE;
      document.head.appendChild(st);
    }
    document.body.appendChild(bar);
    document.body.classList.add('singplay');   // Kotone carries none of Mika's items: the item strip hides (style above)
    this.time = makeTime(this);          // the Time choice's clock (time-row.js; its saved choice eases in now)
    this.pickers = mountPickers(this);   // the setup chips and their picker (pickers.js), before the hint line
    this.label();
  }

  /** An action button's face: icon, text (and its short form for a phone during a song), written only when it changes. */
  setAct(b, icon, text, short = '', aria = text) {
    const k = `${icon.length}|${text}|${short}`;
    if (b.dataset.k === k) return;
    b.dataset.k = k;
    const [ic, t, s] = b.children;
    if (ic.dataset.n !== String(icon.length)) { ic.innerHTML = icon; ic.dataset.n = String(icon.length); }
    t.textContent = text; s.textContent = short;
    b.setAttribute('aria-label', aria);
    if (!this.fitRaf) this.fitRaf = requestAnimationFrame(() => { this.fitRaf = 0; this.fitActions(); });
  }

  /** The actions keep one row: where they would wrap (a narrow phone, a long language) Photo, then Record, show only
   *  their icon (their names stay as aria-labels). */
  fitActions() {
    const a = this.actsEl; if (!a?.isConnected) return;
    a.classList.remove('tight1', 'tight2');
    const one = () => a.offsetHeight <= this.btnPerform.offsetHeight + 2;
    if (one()) return;
    a.classList.add('tight1'); if (one()) return;
    a.classList.add('tight2');
  }

  // ---------------------------------------------------------------- the choices (data + handlers; the chips only show them)
  /** The songs to choose from now (pool order: dance songs, slow songs, instrumentals), as plain data for any picker. */
  songChoices() {
    return this.pool().map(({ song: s }) => ({ id: s.id, title: songTitle(s), lang: s.language || null, bpm: s.bpm, duration: s.duration || null,
      dance: songDance(s), instrumental: !!s.instrumental, style: songStyle(s), remote: !!s.remote }));
  }
  /** The song Perform sings now (the picked one when it is in the pool, else the first): its choice data, or null. */
  currentSong() { const id = pickSong(this.pool(), this.songId)?.song.id; return this.songChoices().find(c => c.id === id) || null; }
  /** Pick a song (remembered per device). With Dance on Auto she dances its style (danceFor); a picked style stays.
   *  false while a song plays or loads, or for a song not in the pool. */
  chooseSong(id) {
    const x = this.perf || this.songWait ? null : this.pool().find(e => e.song.id === id);
    if (!x) return false;
    this.songId = id; keep(SONG_KEY, id);
    this.label();
    return true;
  }
  /** The style Auto dances to the song picked now (danceFor). */
  songDance() { return danceFor(DANCE_AUTO, pickSong(this.pool(), this.songId)?.song); }
  /** The style she dances to the song picked now. */
  danceNow() { return danceFor(this.dancePick, pickSong(this.pool(), this.songId)?.song); }
  /** The Dance choice: 'auto' (the song's style) or a style (remembered per device; not during a song). */
  setDance(id) {
    if (this.perf || !DANCE_PICKS.includes(id)) return false;
    this.dancePick = id; saveDance(id);
    this.label();
    return true;
  }
  /** The lyric caption's switch (remembered per device). */
  toggleLyrics() { this.lyricsOn = !this.lyricsOn; keep(LYRICS_KEY, this.lyricsOn ? '1' : '0'); this.capKey = '-'; this.label(); }
  /** The show effects' switch (fx/show-fx.js; remembered per device; owner rule: every costly feature can be switched off
   *  in the game). Not during a song. */
  toggleShow() { if (this.perf) return; this.showOn = !this.showOn; keep(SHOW_KEY, this.showOn ? '1' : '0'); if (this.showOn) this.makeShow(); this.label(); }

  /** New songs (the library's catalog came in): the chip and an open Song picker follow. */
  setSongs(list) {
    this.songs = list.map(song => ({ song }));
    this.onSongs?.(this.songChoices());   // (another host showing the song choice refreshes here)
    if (this.bar) this.label();
  }

  /** A song's files (once per song this visit; the library's copy failing: the built-in one it replaced). */
  songData(e) {
    if (!this.loaded.has(e.id)) {
      const p = loadSong(e).then(d => d || (e.fallback ? loadSong(e.fallback) : null));
      this.loaded.set(e.id, p); p.then(d => { if (!d) this.loaded.delete(e.id); });
    }
    return this.loaded.get(e.id);
  }

  label() {
    const p = this.perf, ok = this.allowed.ok || !!p;
    const go = tx(p ? N_('Stop') : N_('Perform'));
    this.setAct(this.btnPerform, p ? ACT.stop : ACT.mic, go, go);
    this.btnPerform.setAttribute('aria-disabled', String(!ok || !this.songs?.length || this.songWait));
    const secs = this.rec ? fmt(this.rec.secs()) : '';
    this.setAct(this.btnRecord, ACT.rec, secs || tx(N_('Record')), secs, secs ? `${tx(N_('Record'))} ${secs}` : tx(N_('Record')));
    this.btnRecord.classList.toggle('on', !!this.rec);
    // Record works before a song too: it starts the performance and the recording together
    this.btnRecord.setAttribute('aria-disabled', String(!p && !this.rec && !(ok && this.songs?.length && !this.groupWait && !this.songWait)));
    this.setAct(this.btnPhoto, ACT.photo, tx(N_('Photo')));
    this.bar.classList.toggle('performing', !!p);   // (during a song the chips hide: Stop, Record, Photo, Camera)
    this.setAct(this.btnCam, ACT.cam, tx(this.auto ? N_('Camera: Auto') : N_('Camera: Free')), tx(this.auto ? N_('Auto') : N_('Free')));
    this.btnCam.setAttribute('aria-disabled', String(!p));
    if (p) { if (this.pickers?.open) this.pickers.close('outside'); }
    else this.pickers?.refresh();   // (the chips' values; Group of 8 shows on a phone once it has measured strong: strong-phone.js)
    this.hint.textContent = !this.songs?.length ? tx(N_('No songs yet')) : p ? (p.data.song.title ? `${p.data.song.instrumental ? '♫' : '♪'} ${songTitle(p.data.song)}` : '')
      : this.songWait ? tx(N_('Getting the song ready…')) : this.groupWait ? tx(N_('Getting the group ready…')) : this.allowed.ok ? '' : tx(REASONS[this.allowed.reason] || REASONS.room);
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

  /** Perform the picked song: its files load first (the first time: "Getting the song ready…"), then she starts. */
  async perform() {
    if (this.perf || this.songWait || !this.songs?.length) return;
    if (!this.allowed.ok) { this.ui.toast?.(tx(REASONS[this.allowed.reason] || REASONS.room)); return; }
    if (this.groupWait) { this.ui.toast?.(tx(N_('Getting the group ready…'))); return; }
    // the picked song (the Song row) of those in the game's language (content/kotone-songs.js songsFor: English where she
    // has none in it) or an instrumental
    const pick = pickSong(this.pool(), this.songId);
    if (!pick) return;
    this.songWait = true; this.label();
    const song = await this.songData(pick.song).catch(() => null);
    this.songWait = false;
    if (!song) { this.ui.toast?.(tx(N_("The song couldn't be loaded"))); this.label(); return; }
    // (while it loaded: she may have walked off the flat ground, or the mode closed)
    if (this.perf || !this.bar?.isConnected || !this.allowed.ok || this.groupWait) { this.label(); return; }
    this.performWith(song);
  }

  performWith(song) {
    const g = this.g, p = g.player;
    this.time?.settle();   // (mid-ease: the hour it was easing to, before the show picks its day or night look)
    p.locked = true; p.vel.set(0, 0, 0);
    // she (and the group) turns to face the camera: the view the player framed becomes the backdrop; the auto camera's
    // first shot starts where the player's camera stood (camera-man.js open)
    const f = this.performFacing();
    this.viewYaw = f - Math.PI; p.facing = f; p.root.rotation.y = f;
    this.from = fromCamera(g.camera.position, { x: p.pos.x, y: p.pos.y, z: p.pos.z, facing: f });
    const ground = this.ground();
    this.perf = new Performer(p, this.clips, song, { audio: g.audio, restRoot: this.restRoot, style: danceFor(this.dancePick, song.song), ground, avoid: avoidOf(this.singer) });
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
    this.pickers?.pad();   // (a gamepad on the bar or in a picker: pickers.js)
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
        if (was !== this.allowed.ok + this.allowed.reason) this.label(); else this.pickers?.refresh();   // (the Stage chip as she walks)
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

  /** The songs she can sing now: those in the game's language (content/kotone-songs.js songsFor) and the instrumentals;
   *  the dance songs first, then the slow ones, then the instrumentals (content/song-catalog.js songOrder). */
  pool() { const list = this.songs || [], by = new Map(list.map(x => [x.song, x])); return songOrder(songsFor(list.map(x => x.song), getLang())).map(s => by.get(s)); }

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
      if (this.songWait) return;
      await this.perform();
      if (!this.perf || this.rec) return;
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
  leave() { this.stopSong(); this.keepPlace(); this.pickers?.dispose(); this.g.inputHold = false; this.bar?.remove(); location.href = location.pathname; }
}
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
/** The actions' pictograms (20 px, the button's own colour; the Record dot red). */
const ico = body => `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ACT = Object.freeze({
  mic: ico('<rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>'),
  stop: ico('<rect x="6.5" y="6.5" width="11" height="11" rx="2.5" fill="currentColor"/>'),
  rec: ico('<circle class="dot" cx="12" cy="12" r="6.5" fill="#e0384f" stroke="none"/>'),
  photo: ico('<path d="M4 8h3l1.6-2.5h6.8L17 8h3v11H4z"/><circle cx="12" cy="13.2" r="3.4"/>'),
  cam: ico('<rect x="3" y="7" width="12" height="10" rx="2"/><path d="M15 11l6-3v8l-6-3z"/>'),
});
// The bar (docs/SING-AND-PLAY.md "Bar layout"): one column at the bottom centre (caption, chips, hint, actions). PC: 16 px
// over the bottom edge. Touch screens: over the touch buttons (Do it / Jump end 114 px up). Phones on their side: at the
// bottom, in the band left of the touch buttons. Phones upright: the chips go to the top (pickers.js). During a song on a
// narrow screen Record, Photo and Camera show their short forms (an icon; the time; Auto / Free).
const BAR_STYLE = `.singplay-bar{position:fixed;left:calc(12px + env(safe-area-inset-left,0px));right:calc(12px + env(safe-area-inset-right,0px));bottom:calc(env(safe-area-inset-bottom,0px) + 16px);z-index:30;
 display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;font-family:var(--ui,Nunito,system-ui,sans-serif)}
body.touch .singplay-bar{bottom:calc(env(safe-area-inset-bottom,0px) + 124px)}
.sp-actions{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:10px;max-width:100%;pointer-events:none}
.singplay-btn{pointer-events:auto;display:inline-flex;align-items:center;justify-content:center;gap:7px;box-sizing:border-box;min-width:48px;min-height:52px;padding:0 18px 0 14px;border:0;border-radius:26px;
 background:rgba(255,250,240,.94);color:#3a2a1a;box-shadow:0 2px 8px rgba(0,0,0,.25);font-family:inherit;font-size:16px;line-height:1;font-weight:800;white-space:nowrap;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.sp-act-ic{display:inline-flex;flex:0 0 auto}.sp-act-short{display:none}.sp-act-tx:empty,.sp-act-short:empty{display:none!important}
.sp-actions.tight1 #spPhoto .sp-act-tx,.sp-actions.tight2 #spRecord:not(.on) .sp-act-tx{display:none}.sp-actions.tight1 #spPhoto,.sp-actions.tight2 #spRecord:not(.on){padding:0 13px}
.singplay-btn.primary{min-width:150px;min-height:56px;padding:0 24px 0 18px;font-size:18px;background:linear-gradient(180deg,#ffd66b,#f2a33a);color:#3b1c05;box-shadow:0 3px 12px rgba(0,0,0,.3)}
.singplay-bar.performing .singplay-btn.primary{background:linear-gradient(180deg,#ff8fa8,#e0567a);color:#fff}
.singplay-btn[aria-disabled=true]{opacity:.5}.singplay-btn.on{background:#e0567a;color:#fff}.singplay-btn.on .dot{fill:#fff}
#spCam{display:none}.singplay-bar.performing #spCam{display:inline-flex}.singplay-bar.performing .sp-chips{display:none}
.sp-act:focus{outline:none}.sp-act:focus-visible,.sp-act.pad{outline:3px solid #ffd36e;outline-offset:2px}
.singplay-hint{margin:0;max-width:100%;min-height:17px;text-align:center;font-size:13px;line-height:17px;font-weight:700;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.8);pointer-events:none}
body.singplay #inventory{display:none}
body.singplay.singplay #prompt{bottom:calc(var(--sp-clear,190px) / var(--ui-scale,1))}
.singplay-caption{box-sizing:border-box;max-width:min(720px,100%);margin-bottom:4px;padding:6px 16px;border-radius:18px;background:rgba(14,10,24,.58);color:rgba(255,255,255,.7);font-size:17px;line-height:1.35;font-weight:600;
 text-align:center;pointer-events:none;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-shadow:0 1px 2px rgba(0,0,0,.5)}
.singplay-caption[hidden]{display:none}.singplay-caption .sung{color:#fff}.singplay-caption .now{color:#ffd36e}
@media (max-width:640px){
 .singplay-btn{min-height:48px;padding:0 14px 0 11px;font-size:14px;gap:6px}
 .singplay-btn.primary{min-width:118px;min-height:52px;padding:0 18px 0 14px;font-size:16px}
 .sp-actions{gap:8px}
 .singplay-caption{font-size:14px;padding:5px 12px}
}
@media (max-height:480px) and (orientation:landscape){
 .singplay-bar,body.touch .singplay-bar{bottom:calc(env(safe-area-inset-bottom,0px) + 10px);gap:6px}
 body.touch .singplay-bar{right:calc(194px + env(safe-area-inset-right,0px))}
 .singplay-btn{min-height:46px;padding:0 14px 0 11px;font-size:14px;gap:6px}
 .singplay-btn.primary{min-width:118px;min-height:50px;font-size:16px}
 .singplay-caption{font-size:14px;padding:5px 12px;margin-bottom:0}
}
@media (max-width:640px),(max-height:480px) and (max-width:760px){
 .singplay-bar.performing .sp-act-tx{display:none}.singplay-bar.performing .sp-act-short{display:inline}
 .singplay-bar.performing .sp-act:not(.primary){padding:0 13px}
 .singplay-bar.performing .singplay-btn.primary{min-width:100px}
}
@media (max-width:370px){.sp-actions{gap:6px}.singplay-btn{padding:0 12px 0 10px}.singplay-btn.primary{min-width:108px;padding:0 14px 0 12px}}
@media (max-width:640px),(max-height:480px){body.singplay.touch #toasts{top:calc(var(--sp-below,200px) / var(--ui-scale,1));bottom:auto}}`;

/** Start Sing & Play on a loaded Explore session (src/main.js). */
export async function startSingPlay(game, director, ui) {
  const m = new SingPlay(game, director, ui);
  game.singplay = m;
  await m.start();
  return m;
}
