// © 2026 Bui Cong Nguyen · solluxlabs.com
// House scenes: little voiced moments inside the valley's homes, heard in the language the player is learning
// (docs/TRAVEL-LANGUAGE-PLAN.md). Pure data and pure helpers only (tests/scenes.test.mjs); the runner is
// src/game/house-scenes.js.
import kw4 from './kw4.js';
import kw2 from './kw2.js';
import kw5 from './kw5.js';
import station from './station.js';

export const LEARN_LANGS = ['en', 'ko', 'vi'];          // voiced learning languages (Japanese is subtitles only)
export const UI_LANGS = ['en', 'vi', 'ko', 'ja'];
export const SCENES = [...kw4, ...kw2, ...kw5, ...station];
export const SCENE_BY_ID = new Map(SCENES.map(s => [s.id, s]));
export const SCENE_HOUSES = new Set(SCENES.filter(s => s.house).map(s => s.house));   // (outdoor scenes have a `place` instead)

/** The language a line is voiced and shown in: its own `say` (a traveller asking in English) or the one being learned. */
export const lineLang = (line, lang) => line?.say || lang;

/** The clip key of line i (0-based) of a scene: 'kw4.supper/01'. */
export const lineKey = (sceneId, i) => `${sceneId}/${String(i + 1).padStart(2, '0')}`;

/** A text in one language from a { en, vi, ko, ja } table (English when that language is missing). */
export const inLang = (t, lang) => (t && typeof t === 'object' ? t[lang] ?? t.en ?? '' : t ?? '');

/** Is the hour inside [from, to) (a window may run past midnight: [21, 2])? */
export function hourIn([a, b], h) {
  return a <= b ? h >= a && h < b : h >= a || h < b;
}

/**
 * The scene due in house `house` now, or null. ctx: { hour, heardToday: Set of scene ids heard today (in this
 * language), chapter }. A scene is due when its hour window holds and it has not been heard today; when none is
 * due by the clock, nothing plays (the Phrasebook can replay it).
 */
export function dueScene(house, ctx = {}) {
  const heard = ctx.heardToday || new Set();
  for (const s of SCENES) {
    if (s.house !== house) continue;
    if (s.when?.hour && ctx.hour !== undefined && !hourIn(s.when.hour, ctx.hour)) continue;
    if (s.when?.chapter && ctx.chapter !== undefined && (ctx.chapter < s.when.chapter[0] || ctx.chapter > s.when.chapter[1])) continue;
    if (heard.has(s.id)) continue;
    return s;
  }
  return null;
}

/**
 * The chips of a line in `lang` as segments for the subtitle: [{ text, phrase? }], in order (chips are authored
 * substrings of the line; one that is not found is skipped).
 */
export function segments(line, lang) {
  const text = line[lang] || '';
  const chips = (line.chips?.[lang] || []).map(([t, id]) => ({ t, id, at: text.indexOf(t) })).filter(c => c.at >= 0).sort((a, b) => a.at - b.at);
  const out = [];
  let i = 0;
  for (const c of chips) {
    if (c.at < i) continue;
    if (c.at > i) out.push({ text: text.slice(i, c.at) });
    out.push({ text: c.t, phrase: c.id });
    i = c.at + c.t.length;
  }
  if (i < text.length) out.push({ text: text.slice(i) });
  return out;
}

/** Every phrase id a scene teaches (in `lang`, or in any language). */
export function scenePhrases(scene, lang) {
  const ids = new Set();
  for (const l of scene.lines) for (const [k, list] of Object.entries(l.chips || {})) if (!lang || k === lang) for (const [, id] of list) ids.add(id);
  return [...ids];
}
