// © 2026 Bui Cong Nguyen · solluxlabs.com
// Render resolution: how many pixels each frame is drawn at (docs/RESOLUTION.md). Pure, so it is tested without a GPU
// (tests/resolution.test.mjs); engine/renderer.js applies it on every resize and governor step.
//
// The player's choice, Settings > Resolution, remembered per device (localStorage starline-res):
//   auto      phones, the Low and Medium tiers and High on an ordinary card: the tier's caps as before (High: 2x and
//             5.0 M pixels at most). A desktop on High with a strong card (quality-pick.js ULTRA): the screen's own pixels,
//             and on a screen smaller than 4K with big pixels (devicePixelRatio under 2) drawn larger than the screen
//             (supersampled, up to 2x and 4K-class) and scaled down by the browser, which keeps thin edges, signs and
//             faces crisp (docs/RESOLUTION.md has the pictures). When frames run slow the governor gives the
//             supersampling up first, then cheaper looks; below the screen's resolution only after a long slow stretch.
//   sharp     never below the screen's own resolution (CSS size x devicePixelRatio, up to 4K-class), supersampled on a
//             strong card like Auto; the governor never touches the resolution
//   balanced  the caps and the governor as they were before 2026-11-28: the resolution is the first thing given up when
//             frames run slow. Lighter on a busy or shared graphics card, or a laptop on battery.

export const RES_MODES = ['auto', 'sharp', 'balanced'];
export const RES_KEY = 'starline-res';
/** 4K-class: 3840 x 2160 = 8.29 M physical pixels (and a little room for rounding). */
export const NATIVE_MAX = 8.4e6;
/** Supersampling: at most 2x the screen's pixels along each side; under 1.25x it is not worth the cost. */
export const SS_MAX = 2, SS_MIN = 1.25;

export const resModeOf = v => (RES_MODES.includes(v) ? v : 'auto');

/** The saved choice (or ?res=), 'auto' when there is none. */
export function readResMode(param) {
  if (RES_MODES.includes(param)) return param;
  try { return resModeOf(globalThis.localStorage?.getItem(RES_KEY)); } catch { return 'auto'; }
}
export function saveResMode(mode) { try { globalThis.localStorage?.setItem(RES_KEY, resModeOf(mode)); } catch { /* private mode */ } }

/**
 * What a tier may draw under a mode on this device: { dpr: cap on the device pixel ratio, maxPixels, ss: may draw above the
 * screen's resolution, floor: never below it }. `q` is a QUALITY tier ({ name, dpr, maxPixels }); `gpu` is
 * quality-pick.js gpuClass(): 'ultra' | 'strong' | 'other' | 'software'.
 */
export function resolutionPlan(q, { mode = 'auto', mobile = false, gpu = 'other' } = {}) {
  const old = { dpr: q.dpr, maxPixels: q.maxPixels, ss: false, floor: false };
  const strongPc = !mobile && gpu === 'ultra';
  if (mode === 'sharp') return { dpr: Infinity, maxPixels: NATIVE_MAX, ss: strongPc, floor: true };
  if (mode === 'auto' && strongPc && q.name === 'High') return { dpr: Infinity, maxPixels: NATIVE_MAX, ss: true, floor: false };
  return old;
}

/** How much larger than the screen to draw: up to SS_MAX, within the pixel budget; 1 when it would be under SS_MIN. */
export function ssFactor(nativePixels, maxPixels = NATIVE_MAX) {
  const k = Math.min(SS_MAX, Math.sqrt(maxPixels / Math.max(1, nativePixels)));
  return k >= SS_MIN ? Math.floor(k * 100) / 100 : 1;
}

/**
 * The supersampling this screen gets under a plan: 1 when the plan has none, or the screen's own pixels are already small
 * (devicePixelRatio 2 and up: a Retina or 4K-at-200 % panel gains nothing from more).
 */
export function ssFor({ w, h, dpr = 1, plan }) {
  return plan.ss && dpr < 2 ? ssFactor(Math.max(1, w * h) * dpr * dpr, plan.maxPixels) : 1;
}

/**
 * The pixel ratio to draw at: w x h CSS pixels on a `dpr` screen, the plan, the governor's `scale` (< 1 below the screen's
 * resolution) and whether its supersampling is still on (`ssOn`).
 */
export function pixelRatioFor({ w, h, dpr = 1, plan, scale = 1, ssOn = true }) {
  const area = Math.max(1, w * h);
  let pr = Math.min(dpr, plan.dpr);
  const ss = ssOn ? ssFor({ w, h, dpr, plan }) : 1;
  if (ss > 1) pr = dpr * ss;
  pr *= scale;
  if (area * pr * pr > plan.maxPixels) pr = Math.sqrt(plan.maxPixels / area);
  if (plan.floor) pr = Math.max(pr, Math.min(dpr, Math.sqrt(plan.maxPixels / area)));
  return Math.max(0.5, pr);
}

/**
 * The numbers the Settings readout and the performance report show: the drawing buffer (three.js floors w x ratio),
 * the screen's own pixels, and the drawing buffer's width as a percentage of the screen's.
 */
export function resolutionInfo({ w, h, dpr = 1, pr }) {
  const rw = Math.floor(w * pr), rh = Math.floor(h * pr), nw = Math.round(w * dpr), nh = Math.round(h * dpr);
  return { w: rw, h: rh, nativeW: nw, nativeH: nh, pct: Math.round(rw / Math.max(1, nw) * 100) };
}
