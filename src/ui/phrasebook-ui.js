// © 2026 Bui Cong Nguyen · solluxlabs.com
// Journal > Phrasebook: the travel notebook of "Listening at the table" (docs/TRAVEL-LANGUAGE-PLAN.md §4). One flat row
// to pick the language being learned, the counts, then a page per house scene: a stamp when heard to the end, every
// heard line with ▶ (audio only, no 3D) and its meaning, and the kept ★ phrases.
import { tx, N_, getLang, loadFont } from '../i18n/i18n.js';
import { SCENES, LEARN_LANGS, inLang, lineKey, lineLang } from '../content/scenes/index.js';
import { GLOSSARY } from '../content/scenes/glossary.js';
import { bookStats, phrasesIn } from '../game/phrasebook.js';
import { CAST } from '../game/story.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const NAMES = { en: 'English', ko: '한국어', vi: 'Tiếng Việt' };

export function mountPhrasebook(body, ui, hs) {
  if (!hs) { body.textContent = ''; return; }
  const ui0 = getLang(), lang = hs.lang;
  const pick = `<div class="pb-langs" role="group" aria-label="${esc(tx(N_('Learn a language')))}">` +
    LEARN_LANGS.map(l => `<button type="button" class="hs-btn ${l === lang ? 'on' : ''}" data-learn="${l}" lang="${l}">${esc(NAMES[l])}</button>`).join('') +
    `<button type="button" class="hs-btn ${lang ? '' : 'on'}" data-learn="off">${esc(tx(N_('Off')))}</button></div>`;
  if (!lang) {
    body.innerHTML = `<p>${esc(tx(N_('Pick a language, then visit the homes in Kawabe: families talk at supper, in the shop and over paper cranes. Every phrase you hear is kept here.')))}</p>${pick}`;
    bind(body, ui, hs);
    return;
  }
  loadFont(lang);
  const st = bookStats(hs.book, lang);
  let html = `${pick}<p>${esc(tx(N_('{scenes} scenes and {lines} lines heard, {phrases} phrases met.'), st))}</p>`;
  for (const s of SCENES) {
    const heard = hs.book.scenes[s.id]?.[lang];
    const lines = s.lines.map((l, i) => ({ l, i, h: hs.book.heard[lineKey(s.id, i)]?.[lang] })).filter(x => x.h);
    const [a, b] = s.when?.hour || [];
    html += `<div class="pb-page"><h3>${heard ? '<span class="pb-stamp" aria-hidden="true">✓</span>' : ''}${esc(inLang(s.title, ui0))}</h3>`;
    if (!lines.length) html += `<p class="note">${esc(tx(N_('Not heard yet. Visit between {from}:00 and {to}:00.'), { from: Math.floor(a ?? 0), to: Math.ceil(b ?? 24) }))}</p>`;
    for (const { l, i } of lines) {
      const c = CAST[l.who] || {}, ll = lineLang(l, lang);
      html += `<div class="pb-line"><button type="button" class="hs-btn pb-play" data-play="${esc(s.id)}|${i}" aria-label="${esc(tx(N_('Hear it')))}">▶</button>` +
        `<div><b style="color:${esc(c.color || 'inherit')}">${esc(tx(c.name || l.who))}</b> <span lang="${ll}">${esc(l[ll])}</span>` +
        (ui0 !== ll ? `<div class="pb-mean">${esc(l[ui0] || l.en)}</div>` : '') + '</div></div>';
    }
    html += '</div>';
  }
  const kept = phrasesIn(hs.book, lang).filter(id => hs.book.phrases[id][lang].kept && GLOSSARY[id]);
  const met = phrasesIn(hs.book, lang).filter(id => GLOSSARY[id]);
  if (met.length) {
    html += `<h3>${esc(tx(N_('Phrases')))} · ${met.length}</h3><div class="pb-phrases">` + met.map(id => {
      const e = GLOSSARY[id], k = hs.book.phrases[id][lang].kept;
      return `<div class="pb-phrase"><span lang="${lang}">${k ? '★ ' : ''}${esc(e[lang]?.say)}</span> <small>${esc(e[lang]?.roman || e[lang]?.tone || '')}</small><div class="pb-mean">${esc(e.mean?.[ui0] || e.mean?.en)}</div></div>`;
    }).join('') + '</div>';
    if (kept.length) html += `<p class="note">${esc(tx(N_('★ = kept. Tap a phrase in a scene to keep it.')))}</p>`;
  }
  body.innerHTML = html;
  bind(body, ui, hs);
}

function bind(body, ui, hs) {
  body.querySelectorAll('[data-learn]').forEach(b => b.addEventListener('click', () => {
    hs.setPrefs({ learn: b.dataset.learn });
    const sel = document.getElementById('optLearn');
    if (sel) sel.value = b.dataset.learn;
    mountPhrasebook(body, ui, hs);
  }));
  body.querySelectorAll('[data-play]').forEach(b => b.addEventListener('click', () => {
    const [id, i] = b.dataset.play.split('|');
    hs.replay(id, +i);
  }));
}
