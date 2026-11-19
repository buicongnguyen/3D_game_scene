import * as THREE from 'three';
import { PLACES, WATER_Y } from '../world/layout.js';
import { N_, getLang } from '../i18n/i18n.js';
import { shotsKey } from './saves.js';

// Photo mode, the pure part (no DOM, no WebGL; tests/photo.test.mjs imports it): what can be chosen, when the mode may
// open, where the free camera may go, how big a shot may be, the frame's geometry and the player's own album in storage.
// The mode itself (camera, poses, shutter) is ./photo-mode.js, fetched on first use; its screen is ../ui/photo-ui.js.

/**
 * Poses Mika can hold for the picture: only clips she has (tests/asset-contracts.mjs MIKA_CLIPS), held still at
 * `p` of the clip (0..1), with the camera's pivot at `pivot` metres above her feet so a sitting pose stays framed.
 * (Labels differ from the clip names where the plain word already means something else in the packs: "Stand" is a
 * ready stance in Japanese, "Point" a score in Korean.)
 */
export const POSES = [
  { id: 'asis', label: N_('As is'), clip: null, p: 0, pivot: 1.45 },
  { id: 'stand', label: N_('Standing'), clip: 'Idle', p: 0, pivot: 1.45 },
  { id: 'wave', label: N_('Wave'), clip: 'Wave', p: 0.45, pivot: 1.45 },
  { id: 'cheer', label: N_('Cheer'), clip: 'Cheer', p: 0.45, pivot: 1.45 },
  { id: 'point', label: N_('Pointing'), clip: 'Point', p: 0.5, pivot: 1.45 },
  { id: 'sit', label: N_('Sit on the grass'), clip: 'SitGrass', p: 0, pivot: 0.8 },
  { id: 'kneel', label: N_('Kneel'), clip: 'Kneel', p: 0, pivot: 1.0 },
  { id: 'crouch', label: N_('Crouch'), clip: 'Crouch', p: 0, pivot: 0.95 },
];

/** What every filter sets on the photo pass (engine/photo-pass.js): one value per uniform, so no filter leaks into the next. */
export const FILTER_BASE = {
  uTint: [1, 1, 1], uShadow: [0, 0, 0], uHigh: [0, 0, 0], uSat: 1, uContrast: 1, uLift: 0, uSepia: 0, uGrain: 0, uVignette: 0,
};
const f = u => ({ ...FILTER_BASE, ...u });
/**
 * Looks drawn after the game's own grade, on the finished picture. `u: null` switches the pass off (None costs nothing).
 * uShadow / uHigh: a split tone, colour added to the dark and the bright parts.
 */
export const FILTERS = [
  { id: 'none', label: N_('None'), u: null },
  { id: 'warm', label: N_('Warm film'), u: f({ uTint: [1.06, 1.0, 0.9], uShadow: [0.02, 0.005, -0.015], uSat: 1.04, uContrast: 1.06, uLift: 0.035, uSepia: 0.08, uGrain: 0.035, uVignette: 0.25 }) },
  { id: 'sakura', label: N_('Sakura'), u: f({ uTint: [1.05, 0.96, 1.0], uShadow: [0.03, -0.01, 0.04], uHigh: [0.05, 0.0, 0.025], uSat: 0.94, uContrast: 0.95, uLift: 0.06, uGrain: 0.015, uVignette: 0.15 }) },
  { id: 'golden', label: N_('Golden hour'), u: f({ uTint: [1.07, 0.99, 0.84], uShadow: [0.03, 0.0, -0.03], uHigh: [0.03, 0.015, -0.03], uSat: 1.06, uContrast: 1.02, uLift: 0.01, uVignette: 0.3 }) },
  { id: 'twilight', label: N_('Twilight'), u: f({ uTint: [0.9, 0.93, 1.08], uShadow: [-0.02, 0.0, 0.07], uHigh: [0.06, 0.02, -0.02], uSat: 0.9, uContrast: 1.1, uLift: 0.03, uVignette: 0.35 }) },
  { id: 'old', label: N_('Old photo'), u: f({ uTint: [1.0, 0.98, 0.92], uSat: 0.6, uContrast: 1.05, uLift: 0.06, uSepia: 0.85, uGrain: 0.08, uVignette: 0.45 }) },
  { id: 'bw', label: N_('Black and white'), u: f({ uSat: 0, uContrast: 1.15, uLift: 0.01, uGrain: 0.04, uVignette: 0.25 }) },
];

/** Frames drawn over the picture (../ui/photo-frame.js), on the preview and into the saved file alike. */
export const FRAMES = [
  { id: 'none', label: N_('No frame') },
  { id: 'polaroid', label: N_('Polaroid') },
  { id: 'postcard', label: N_('Postcard') },
  { id: 'film', label: N_('Film strip') },
  { id: 'stars', label: N_('Star corners') },
];

/** Field of view per lens (degrees); the player's own FOV setting is what the mode starts with. */
export const LENSES = [
  { id: 'wide', label: N_('Wide'), fov: 72 },
  { id: 'normal', label: N_('Normal'), fov: 55 },
  { id: 'close', label: N_('Close-up'), fov: 34 },
];
/** The Lens tab's tilt chips (radians; Q / E and the bumpers tilt freely within ROLL_MAX). */
export const ROLLS = [
  { id: 'left', label: N_('Tilt left'), roll: 0.2618 },
  { id: 'level', label: N_('Level'), roll: 0 },
  { id: 'right', label: N_('Tilt right'), roll: -0.2618 },
];

/** The free camera's limits. */
export const RIG = { pitchMin: -0.6, pitchMax: 1.35, distMin: 0.8, distMax: 12, panMax: 2.5, panDown: -1.2, panUp: 1.5, roll: 0.52, fovMin: 30, fovMax: 75 };
/** Shots kept per save profile. Nothing is ever evicted to make room: the player chooses what goes. */
export const MAX_SHOTS = 12;

/** The caption's season words (the same strings the clock and Settings use). */
export const SEASON_NAMES = { spring: N_('Spring'), summer: N_('Summer'), autumn: N_('Autumn'), winter: N_('Winter') };

/** Named places for the caption: the journal map's labels (ui/map.js), so the words are already translated. */
export const CAPTION_PLACES = [
  { at: PLACES.kawabe, name: N_('Kawabe') },
  { at: PLACES.takamori, name: N_('Takamori') },
  { at: PLACES.station, name: N_('Hoshi Station') },
  { at: PLACES.cottage, name: N_("Sora's cottage") },
  { at: PLACES.kawabeDock, name: N_('Kawabe Dock') },
  { at: { x: -17.6, z: -45 }, name: N_("Ōta's mill") },
  { at: PLACES.pasture, name: N_('Sheep pasture') },
  { at: PLACES.orchard, name: N_('Peach orchard') },
  { at: PLACES.halt, name: N_('Takamori Halt') },
  { at: PLACES.shrine, name: N_('Forest Shrine') },
  { at: PLACES.landslide, name: N_('Landslide scar') },
  { at: PLACES.engineShed, name: N_('Engine shed') },
  { at: PLACES.viaductLamp, name: N_('Viaduct Lamp') },
];
export const VALLEY_NAME = N_('Hoshi Valley');

/** The nearest named place within 60 m, else the valley itself (English source string: translate when shown). */
export function nearestPlace(x, z) {
  let best = null, bd = 60;
  for (const c of CAPTION_PLACES) {
    const d = Math.hypot(c.at.x - x, c.at.z - z);
    if (d <= bd) { bd = d; best = c.name; }
  }
  return best || VALLEY_NAME;
}

// ------------------------------------------------------------------ when it may open

/** The game's state as plain flags, so canEnter can be tested without a game. */
export function photoState(g) {
  const d = g?.director, f = g?.follow, R = g?.renderer;
  let lost = false;
  try { lost = !!R?.renderer?.getContext?.()?.isContextLost?.(); } catch { lost = true; }
  return {
    world: !!g?.world, quest: !!d?.quest, menu: !!d?.minigameMenu?.canOpen?.(), dialogue: !!g?.ui?.dialogueOpen,
    shot: !!f?.shot, tracking: !!f?.tracking, hold: !!R?.hold, focus: !!R?.focus, rooms: !!g?.interiors?.busy, lost,
  };
}

/**
 * Photo mode opens only when nothing else owns the camera or the screen. The Mini games menu's own test already
 * refuses rounds, scenes, the tour, sky gazing, the kite and riding; swimming and indoors are fine (poses are not).
 */
export const canEnter = s => !!(s.world && s.quest && s.menu && !s.dialogue && !s.shot && !s.tracking && !s.hold && !s.focus && !s.rooms && !s.lost);

/** Can Mika be posed? Only standing on the ground with nothing playing: a pose replaces her clip outright. */
export const poseOk = p => !!(p?.anim && !p.anim.busy && p.grounded && !p.pose && !p.swimming && !p.climb && !p.mounted);

// ------------------------------------------------------------------ the free camera

const _fwd = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Vector3();
const clamp = THREE.MathUtils.clamp;

/** Keep a rig's values inside RIG (in place). */
export function clampRig(rig) {
  rig.pitch = clamp(rig.pitch, RIG.pitchMin, RIG.pitchMax);
  rig.dist = clamp(rig.dist, RIG.distMin, RIG.distMax);
  rig.roll = clamp(rig.roll, -RIG.roll, RIG.roll);
  rig.fov = clamp(rig.fov, RIG.fovMin, RIG.fovMax);
  const h = Math.hypot(rig.pan.x, rig.pan.z);
  if (h > RIG.panMax) { rig.pan.x *= RIG.panMax / h; rig.pan.z *= RIG.panMax / h; }
  rig.pan.y = clamp(rig.pan.y, RIG.panDown, RIG.panUp);
  return rig;
}

/** The ground and water rules of the follow camera (actors/camera.js), for one point. */
function keepAbove(p, env, lift) {
  const g = env.heightAt(p.x, p.z);
  if (p.y < g + lift) p.y = g + lift;
  if (g < WATER_Y) p.y = env.submerged ? Math.min(p.y, WATER_Y - 0.35) : Math.max(p.y, WATER_Y + lift);
}

/** A zone's real ground ends at its view radius: neither the pivot nor the camera goes near the baked far view. */
function keepInZone(p, z) {
  if (!z) return;
  const dx = p.x - z.x, dz = p.z - z.z, d = Math.hypot(dx, dz);
  if (d > z.r) { p.x = z.x + dx * z.r / d; p.z = z.z + dz * z.r / d; }
}

/**
 * Where the photo camera goes: the follow camera's collision copied (camera.js), around a pivot the player can pan.
 *   rig  {yaw, pitch, dist, pan: {x,y,z}, roll, fov}  (clamped in place)
 *   env  {pos, pivotH, heightAt(x,z), raycast(ax,ay,az,bx,by,bz) -> t 0..1, submerged, room(p) -> p | null,
 *         zone {x, z, r} | null}
 *   out  {pos: Vector3, pivot: Vector3, look: Vector3, dist}
 * The pan is stopped short of a wall between her chest and the pivot, so the camera cannot be pushed through it.
 */
export function solveRig(rig, env, out) {
  clampRig(rig);
  const pos = env.pos, piv = out.pivot;
  const chest = _q.set(pos.x, pos.y + Math.min(1.2, env.pivotH), pos.z);
  piv.set(pos.x + rig.pan.x, pos.y + env.pivotH + rig.pan.y, pos.z + rig.pan.z);
  const len = piv.distanceTo(chest);
  if (len > 1e-3) {
    const t = env.raycast(chest.x, chest.y, chest.z, piv.x, piv.y, piv.z);
    if (t < 1) piv.lerpVectors(chest, piv, Math.max(0, t - 0.3 / len));
  }
  keepAbove(piv, env, 0.3);
  if (env.room) piv.copy(env.room(piv));
  keepInZone(piv, env.zone);
  const fwd = _fwd.set(Math.sin(rig.yaw) * Math.cos(rig.pitch), -Math.sin(rig.pitch), Math.cos(rig.yaw) * Math.cos(rig.pitch));
  let d = rig.dist;
  // terrain: pull in before a hill hides her
  for (let i = 1; i <= 14; i++) {
    const t = (i / 14) * rig.dist;
    const p = _p.copy(piv).addScaledVector(fwd, -t);
    if (env.heightAt(p.x, p.z) > p.y - 0.35) { d = Math.max(RIG.distMin, t - 0.4); break; }
  }
  // buildings and walls (only what blocks the view: small props do not)
  const end = _p.copy(piv).addScaledVector(fwd, -d);
  const hit = env.raycast(piv.x, piv.y, piv.z, end.x, end.y, end.z);
  if (hit < 1) d = Math.max(RIG.distMin, d * hit - 0.3);
  const cam = out.pos.copy(piv).addScaledVector(fwd, -d);
  keepAbove(cam, env, 0.45);
  if (env.room) cam.copy(env.room(cam));
  keepInZone(cam, env.zone);
  out.look.copy(piv).addScaledVector(fwd, 10);
  out.dist = d;
  return out;
}

// ------------------------------------------------------------------ the shot

/**
 * The pixel ratio for a shot: sharper than the screen where the device can afford it, never less sharp. A phone's
 * composer at a high ratio (two HDR targets, MSAA samples, bloom mips, the drawing buffer and the 2D copy) can run it
 * out of graphics memory, which costs the whole game its context, hence the memory cap per pixel.
 *   {w, h} CSS pixels, dpr the device's, cur the ratio drawn now, touch, samples (MSAA), maxTex (GL max texture size)
 */
export function fitShot({ w, h, dpr = 1, cur = 1, touch = false, samples = 0, maxTex = 4096 }) {
  let pr = Math.min(dpr, 2);
  const px = w * h, capPx = touch ? 1.5e6 : 4e6;
  if (px * pr * pr > capPx) pr = Math.sqrt(capPx / px);
  const per = 16 * (1 + (samples || 0)) + 12, capMem = (touch ? 80 : 220) * 1e6;
  if (px * pr * pr * per > capMem) pr = Math.sqrt(capMem / (per * px));
  const side = Math.min(4096, maxTex || 4096);
  if (Math.max(w, h) * pr > side) pr = side / Math.max(w, h);
  return Math.max(pr, cur);
}

/**
 * A frame's geometry in pixels for a w x h picture: every length is a fraction of min(w, h), so the preview at screen
 * size and the saved file at shot size are the same drawing scaled (and the test can say so exactly).
 */
export function frameLayout(w, h, frame) {
  const m = Math.min(w, h), L = { w, h, m, frame };
  if (frame === 'polaroid') {
    const mat = 0.045 * m, base = 0.16 * m;
    Object.assign(L, { inner: { x: mat, y: mat, w: w - 2 * mat, h: h - mat - base },
      caption: { x: mat * 1.4, y: h - base * 0.5, size: base * 0.3, align: 'left' }, mark: { x: w - mat * 1.4, y: h - base * 0.5, size: base * 0.2 } });
  } else if (frame === 'postcard') {
    const b = 0.035 * m, s = 0.16 * m;
    Object.assign(L, { inner: { x: b, y: b, w: w - 2 * b, h: h - 2 * b }, border: b,
      stamp: { x: w - b * 2 - s, y: b * 2, s }, caption: { x: b * 2.2, y: h - b * 2.6, size: 0.05 * m, align: 'left' } });
  } else if (frame === 'film') {
    // the bands run along the picture's long sides, like a strip held the way the photo was taken
    const band = 0.08 * m, wide = w >= h;
    const inner = wide ? { x: 0, y: band, w, h: h - 2 * band } : { x: band, y: 0, w: w - 2 * band, h };
    Object.assign(L, { inner, band, wide, hole: { w: band * 0.42, h: band * 0.3, gap: band * 0.62 },
      caption: { x: inner.x + band * 0.5, y: inner.y + inner.h - band * 0.85, size: 0.042 * m, align: 'left' } });
  } else if (frame === 'stars') {
    const c = 0.12 * m;
    Object.assign(L, { inner: { x: 0, y: 0, w, h }, corner: c, caption: { x: w / 2, y: h - c * 0.55, size: 0.045 * m, align: 'center' } });
  } else {
    Object.assign(L, { inner: { x: 0, y: 0, w, h }, caption: null });
  }
  return L;
}

// ------------------------------------------------------------------ the album in storage

/** The player's photos for a profile, newest first. Anything unreadable is an empty album. */
export function readShots(st, slot) {
  try {
    const d = JSON.parse(st.getItem(shotsKey(slot)));
    return d && d.v === 1 && Array.isArray(d.list) ? d.list.filter(s => s && typeof s.url === 'string') : [];
  } catch { return []; }
}

/** Keep a shot: 'ok', 'full' (MAX_SHOTS already; nothing is pushed out) or 'quota' (storage refused). The list is untouched unless 'ok'. */
export function addShot(st, slot, shot, max = MAX_SHOTS) {
  const list = readShots(st, slot);
  if (list.length >= max) return 'full';
  try { st.setItem(shotsKey(slot), JSON.stringify({ v: 1, list: [shot, ...list] })); return 'ok'; } catch { return 'quota'; }
}

/** Remove one shot by id. -> true when it was there and the album was written. */
export function deleteShot(st, slot, id) {
  const list = readShots(st, slot), left = list.filter(s => s.id !== id);
  if (left.length === list.length) return false;
  try { st.setItem(shotsKey(slot), JSON.stringify({ v: 1, list: left })); return true; } catch { return false; }
}

/** The saved file's name: starline-YYYYMMDD-HHMM.jpg in local time. */
export function shotName(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `starline-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.jpg`;
}

/** Gamepad buttons pressed since last time: prev / now are arrays of booleans (or readPad()'s whole object). -> the indices that went down. */
export function padEdges(prev, now) {
  const out = [];
  prev = Array.isArray(prev) ? prev : prev?.buttons;
  now = Array.isArray(now) ? now : now?.buttons || [];
  for (let i = 0; i < now.length; i++) if (now[i] && !prev?.[i]) out.push(i);
  return out;
}

/**
 * A place's name for a caption or an album label: without a trailing gloss in brackets ("Hoshi Valley (...)" reads as
 * the valley's name on a photo), first letter capitalised (some translations are the mid-sentence form).
 */
export function captionPlace(s) {
  const t = String(s || '').replace(/\s*[(（][^)）]*[)）]\s*$/, '').trim();
  return t.charAt(0).toLocaleUpperCase(getLang() || 'en') + t.slice(1);
}
