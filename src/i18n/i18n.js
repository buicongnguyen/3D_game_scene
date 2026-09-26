// Localisation. English source strings are the keys (gettext style): every string the player sees
// passes through tx(), which returns the active language's translation or the English original.
// Packs (vi.json, ko.json, ja.json) are flat { "English": "Translation" } maps built from
// src/i18n/source.json (npm run i18n:extract) and checked for coverage by tests/i18n.test.mjs.

export const LANGS = {
  en: { name: 'English', html: 'en', cjk: false },
  vi: { name: 'Tiếng Việt', html: 'vi', cjk: false },
  ko: { name: '한국어', html: 'ko', cjk: true },
  ja: { name: '日本語', html: 'ja', cjk: true },
};

// Rounded, friendly faces per script; Fredoka / Nunito cover English.
const FONTS = {
  vi: 'family=Baloo+2:wght@500;600;700&family=Nunito:wght@600;700;800&subset=vietnamese',
  ko: 'family=Jua&family=Gothic+A1:wght@600;700;800',
  ja: 'family=Zen+Maru+Gothic:wght@500;700;900',
};

const loaders = {
  vi: () => import('./vi.json'),
  ko: () => import('./ko.json'),
  ja: () => import('./ja.json'),
};

const KEY = 'starline-lang';
let lang = 'en';
let pack = null;
const listeners = new Set();

/** Saved choice, else the browser's language, else English. */
export function detectLang() {
  try { const s = localStorage.getItem(KEY); if (s && LANGS[s]) return s; } catch { /* ignore */ }
  const nav = typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : [];
  for (const l of nav) { const k = String(l || '').slice(0, 2).toLowerCase(); if (LANGS[k]) return k; }
  return 'en';
}

export function getLang() { return lang; }
export function isCJK() { return LANGS[lang]?.cjk; }

/** Translate an English source string; {name} placeholders are filled from vars. */
export function tx(s, vars) {
  if (s == null || s === '') return s;
  let out = (pack && pack[s]) || s;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return out;
}

/** Marks an English string for translation where it is stored now and translated when shown. */
export const N_ = s => s;

export function onLangChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function loadFont(l) {
  if (!FONTS[l] || typeof document === 'undefined' || document.getElementById(`font-${l}`)) return;
  const link = document.createElement('link');
  link.id = `font-${l}`;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${FONTS[l]}&display=swap`;
  document.head.appendChild(link);
}

/** Static markup: elements carry data-i18n (text) or data-i18n-aria (aria-label); the English is kept. */
export function applyDom(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    if (el.dataset.i18nSrc === undefined) el.dataset.i18nSrc = el.textContent.trim();
    el.textContent = tx(el.dataset.i18nSrc);
  }
  for (const el of root.querySelectorAll('[data-i18n-aria]')) {
    if (el.dataset.i18nAriaSrc === undefined) el.dataset.i18nAriaSrc = el.getAttribute('aria-label') || '';
    el.setAttribute('aria-label', tx(el.dataset.i18nAriaSrc));
  }
}

export async function setLang(l) {
  if (!LANGS[l]) l = 'en';
  let next = null;
  if (l !== 'en') {
    try { next = (await loaders[l]()).default; } catch (e) { console.warn('language pack failed', l, e); l = 'en'; }
  }
  lang = l;
  pack = next;
  try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = LANGS[l].html;
    for (const k of Object.keys(LANGS)) document.body.classList.toggle(`lang-${k}`, k === l);
    loadFont(l);
    applyDom();
  }
  for (const fn of listeners) fn(l);
  return l;
}
