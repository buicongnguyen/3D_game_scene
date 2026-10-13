// Levels of a mini game: Easy, Normal and Difficult. Every countryside trick and every playground game is played at one
// of them; the very first go at a game is always a guided Easy round. Normal opens with one star on Easy, Difficult with
// two stars on Normal. Pure data and rules (no three.js, no DOM): the picker is src/ui/level-picker.js, the runners are
// src/game/tricks.js and src/game/yard/round.js, and each game reads the level it is handed (ctx.level / its sim's `level`).
//
// A saved record keeps, beside its old fields, `level` (the one played last) and `levels: { easy|normal|hard: { best, stars,
// plays } }`. Records from before the levels have none: their stars count as Normal play, so nothing a player earned locks.
import { N_ } from '../i18n/i18n.js';

export const LEVELS = ['easy', 'normal', 'hard'];
export const LEVEL_NAME = { easy: N_('Easy'), normal: N_('Normal'), hard: N_('Difficult') };
/** What opens a level: this many stars on the level before it. */
export const UNLOCK = { normal: { from: 'easy', stars: 1 }, hard: { from: 'normal', stars: 2 } };
export const UNLOCK_TEXT = { normal: N_('Get 1 star on Easy'), hard: N_('Get 2 stars on Normal') };

const int = v => (Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);

/** The stars earned on a level (0..3). A record from before the levels counts as Normal. */
export function levelStars(rec, level) {
  if (rec?.levels) return Math.min(3, rec.levels[level]?.stars || 0);
  return level === 'normal' ? Math.min(3, rec?.stars || 0) : 0;
}

/** The best score on a level. */
export function levelBest(rec, level) {
  if (rec?.levels) return rec.levels[level]?.best || 0;
  return level === 'normal' ? rec?.best || 0 : 0;
}

/** Can this level be chosen? */
export function unlocked(rec, level) {
  if (level === 'easy') return true;
  if (rec?.levels?.[level]?.plays) return true;                      // played once is open for good
  const u = UNLOCK[level];
  if (!u) return false;
  if (levelStars(rec, u.from) >= u.stars) return true;
  // before the levels there was one record: any star then opens Normal (it was played on Easy or Normal, nobody knows)
  return !rec?.levels && level === 'normal' && (rec?.stars || 0) >= 1;
}

/** The level the picker offers first: the one played last, else Easy mode's choice; never a locked one. */
export function defaultLevel(rec, easyMode) {
  const want = LEVELS.includes(rec?.level) ? rec.level : easyMode ? 'easy' : 'normal';
  if (unlocked(rec, want)) return want;
  return unlocked(rec, 'normal') && want !== 'easy' ? 'normal' : 'easy';
}

/**
 * The numbers of a level for a game row (a trick of content/tricks.js): { stars: [1★, 2★, 3★], length: seconds }.
 * A row says them in `levels: { easy: { stars, length }, normal: …, hard: … }`; what it leaves out falls back to the
 * row's own `stars` / `length` (Difficult then runs a quarter longer).
 */
export function levelSpec(t, level) {
  const own = t.levels?.[level] || {};
  const length = own.length ?? (level === 'hard' ? Math.round((t.length || 60) * 1.25) : t.length);
  return { stars: own.stars || t.stars, length };
}

/**
 * Fold a finished round into a record's levels. Returns { levels, level, newBest, opened } where `opened` is the level
 * this round has just made available ('normal' | 'hard' | null). `stars`: what the round earned (0..3).
 */
export function recordLevel(prev, level, score, stars) {
  const was = { normal: unlocked(prev, 'normal'), hard: unlocked(prev, 'hard') };
  const levels = {};
  // a record from before the levels brings what it had along as Normal
  if (!prev?.levels && prev?.plays) levels.normal = { best: int(prev.best), stars: Math.min(3, int(prev.stars)), plays: int(prev.plays) };
  for (const l of LEVELS) if (prev?.levels?.[l]) levels[l] = { ...prev.levels[l] };
  const cur = levels[level] || { best: 0, stars: 0, plays: 0 };
  const newBest = score > cur.best;
  levels[level] = { best: Math.max(cur.best, int(score)), stars: Math.max(cur.stars, Math.min(3, int(stars))), plays: cur.plays + 1 };
  const now = { levels, plays: 1 };
  const opened = !was.normal && unlocked(now, 'normal') ? 'normal' : !was.hard && unlocked(now, 'hard') ? 'hard' : null;
  return { levels, level, newBest, opened };
}

/** A clean `levels` field for a save (migrate), or undefined when there is nothing to keep. */
export function cleanLevels(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out = {};
  for (const l of LEVELS) {
    const r = raw[l];
    if (r && typeof r === 'object') out[l] = { best: int(r.best), stars: Math.min(3, int(r.stars)), plays: int(r.plays) };
  }
  return Object.keys(out).length ? out : undefined;
}

/** The level after this one, or null. */
export const nextLevel = level => LEVELS[LEVELS.indexOf(level) + 1] || null;
