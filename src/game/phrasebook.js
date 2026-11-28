// The travel notebook behind "Listening at the table" (docs/TRAVEL-LANGUAGE-PLAN.md §4, §8.4). Pure: what was heard,
// the phrases met (light Leitner boxes 1-3, spaced over days), the gentle recall pick and the phrase of the day.
// Progress is shared by all save slots (owner default 2026-11-28): localStorage `starline-phrasebook`; the player's
// learning choice is a device preference, `starline-learn`. tests/phrasebook.test.mjs covers the pure parts.
import { SCENES, SCENE_BY_ID, lineKey, scenePhrases, LEARN_LANGS } from '../content/scenes/index.js';

export const BOOK_KEY = 'starline-phrasebook';
export const LEARN_KEY = 'starline-learn';
const BOX_DAYS = [0, 1, 3, 7];          // a phrase in box b comes up again after BOX_DAYS[b] days

/** The local calendar day as a number (days since 1970 in local time). */
export const dayOf = (date = new Date()) => Math.floor((date.getTime() - date.getTimezoneOffset() * 60000) / 86400000);

export const emptyBook = () => ({ v: 1, heard: {}, phrases: {}, scenes: {}, potd: null, recall: {} });

/** Learning preferences: learn null = not asked yet, 'off' = said Not now, else 'en' | 'ko' | 'vi'. */
export const defaultPrefs = () => ({ learn: null, meaning: true, speed: 1, roman: true });

export function normalizePrefs(p) {
  const d = defaultPrefs();
  if (!p || typeof p !== 'object') return d;
  return {
    learn: p.learn === 'off' || LEARN_LANGS.includes(p.learn) ? p.learn : null,
    meaning: p.meaning !== false,
    speed: p.speed === 0.75 ? 0.75 : 1,
    roman: p.roman !== false,
  };
}

export function normalizeBook(b) {
  if (!b || typeof b !== 'object' || b.v !== 1) return emptyBook();
  return { ...emptyBook(), ...b };
}

/** Line i of a scene was heard in `lang` on `day`: the line, its phrases (box 1 when new) and the scene count. */
export function hearLine(book, sceneId, i, lang, day) {
  const s = SCENE_BY_ID.get(sceneId);
  if (!s || !s.lines[i]) return book;
  const k = lineKey(sceneId, i);
  const h = (book.heard[k] ??= {});
  const e = (h[lang] ??= { n: 0, first: day, last: day });
  e.n++; e.last = day;
  for (const [, id] of s.lines[i].chips?.[lang] || []) {
    const p = ((book.phrases[id] ??= {})[lang] ??= { box: 1, due: day + BOX_DAYS[1], kept: false, first: day });
    p.seen = day;
  }
  return book;
}

/** A whole scene was heard (to the end) in `lang` on `day`. */
export function hearScene(book, sceneId, lang, day) {
  const sc = ((book.scenes[sceneId] ??= {})[lang] ??= { n: 0, last: null });
  sc.n++; sc.last = day;
  return book;
}

/** Scene ids heard to the end today in `lang`. */
export function heardToday(book, lang, day) {
  return new Set(Object.entries(book.scenes).filter(([, v]) => v?.[lang]?.last === day).map(([id]) => id));
}

/** The phrases met in `lang`: [id]. */
export const phrasesIn = (book, lang) => Object.keys(book.phrases).filter(id => book.phrases[id]?.[lang]);

export function keep(book, id, lang, on = true) {
  const p = book.phrases[id]?.[lang];
  if (p) p.kept = on;
  return book;
}

/**
 * The recall question for house `house` in `lang` on `day`, or null: from a scene heard on an EARLIER day, whose
 * answer line has a phrase that is due, and not asked yet today. -> { scene, q, answer, choices: [line index] (shuffled
 * by the day, so the right one is not always first) }
 */
export function recallFor(book, house, lang, day) {
  for (const s of SCENES) {
    if (s.house !== house || !s.recall?.length) continue;
    const heard = book.scenes[s.id]?.[lang];
    if (!heard || heard.last === day || book.recall[s.id]?.[lang] === day) continue;
    const r = s.recall[day % s.recall.length];
    const ids = (s.lines[r.answer]?.chips?.[lang] || []).map(([, id]) => id);
    const due = ids.length ? ids.some(id => (book.phrases[id]?.[lang]?.due ?? 0) <= day) : true;
    if (!due) continue;
    const choices = [r.answer, ...r.decoys];
    const rot = day % choices.length;
    return { scene: s, q: r.q, answer: r.answer, choices: [...choices.slice(rot), ...choices.slice(0, rot)] };
  }
  return null;
}

/** The player answered a recall: a right pick moves its phrases up a box, a wrong one back to box 1. Never a fail. */
export function answerRecall(book, sceneId, lang, day, right) {
  const s = SCENE_BY_ID.get(sceneId);
  ((book.recall[sceneId] ??= {}))[lang] = day;
  const r = s?.recall?.[day % s.recall.length];
  if (!r) return book;
  for (const [, id] of s.lines[r.answer]?.chips?.[lang] || []) {
    const p = book.phrases[id]?.[lang];
    if (!p) continue;
    p.box = right ? Math.min(3, p.box + 1) : 1;
    p.due = day + BOX_DAYS[p.box];
  }
  return book;
}

/**
 * The phrase of the day in `lang`: seeded by the day, from the phrases already met (or, before any, the first scene's).
 * -> { id, scene, line } (the scene and line where it is heard)
 */
export function phraseOfDay(book, lang, day) {
  let pool = phrasesIn(book, lang).sort();
  if (!pool.length) pool = scenePhrases(SCENES[0], lang);
  if (!pool.length) return null;
  const h = ((day * 2654435761) >>> 0) % pool.length;
  const id = pool[h];
  for (const s of SCENES) {
    const i = s.lines.findIndex(l => (l.chips?.[lang] || []).some(([, p]) => p === id));
    if (i >= 0) return { id, scene: s.id, line: i };
  }
  return { id, scene: null, line: -1 };
}

/** Counts for the notebook's first page. */
export function bookStats(book, lang) {
  const lines = Object.values(book.heard).filter(h => h[lang]).length;
  const scenes = Object.values(book.scenes).filter(h => h[lang]).length;
  return { lines, scenes, phrases: phrasesIn(book, lang).length, kept: phrasesIn(book, lang).filter(id => book.phrases[id][lang].kept).length };
}

// ------------------------------------------------------------------ storage (browser)
const read = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
export const loadBook = () => normalizeBook(read(BOOK_KEY, null));
export const saveBook = b => write(BOOK_KEY, b);
export const loadPrefs = () => normalizePrefs(read(LEARN_KEY, null));
export const savePrefs = p => write(LEARN_KEY, normalizePrefs(p));
