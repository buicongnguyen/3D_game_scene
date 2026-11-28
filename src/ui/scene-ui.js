// © 2026 Bui Cong Nguyen · solluxlabs.com
// The house scenes' screens (docs/TRAVEL-LANGUAGE-PLAN.md §2, §4): the subtitle panel (the learning line with its
// phrase chips, the meaning under it, one flat row Again · Slower · Next · Leave), the phrase card, the first-visit
// language card and the gentle recall card. Built from JS (no index.html markup); styles in ui/style.css (.hs-*).
// Every button is at least 44 px, every text at least 11 px, no backdrop blur. UI words go through tx().
import { tx, N_, loadFont } from '../i18n/i18n.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const LEARN_NAMES = { en: 'Listen in English', ko: '한국어로 듣기', vi: 'Nghe bằng tiếng Việt' };
const LANG_HTML = { en: 'en', ko: 'ko', vi: 'vi', ja: 'ja' };

export class SceneUI {
  constructor(ui) {
    this.ui = ui;
    this.root = null;
  }

  host() {
    if (this.root) return this.root;
    const r = this.root = el('div', 'hs-root');
    r.id = 'houseScene';
    document.body.appendChild(r);
    return r;
  }

  // ------------------------------------------------------------------ subtitle panel
  /**
   * Open the panel. handlers: { again, slow, next, leave, chip(phraseId) }. Tapping the panel's text also goes next.
   */
  open(handlers) {
    this.close();
    const p = this.panel = el('div', 'hs-panel');
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-live', 'polite');
    this.title = el('div', 'hs-title');
    this.who = el('div', 'hs-who');
    this.learn = el('div', 'hs-learn');
    this.meaning = el('div', 'hs-meaning');
    const text = el('div', 'hs-text');
    text.append(this.who, this.learn, this.meaning);
    text.addEventListener('click', e => { if (!e.target.closest('.hs-chip')) handlers.next?.(); });
    const row = el('div', 'hs-row');
    const btn = (label, fn, cls = '') => { const b = el('button', `hs-btn ${cls}`, label); b.type = 'button'; b.addEventListener('click', e => { e.stopPropagation(); fn?.(); }); row.appendChild(b); return b; };
    this.bAgain = btn(`⟲ ${tx(N_('Again'))}`, handlers.again);
    this.bSlow = btn(`🐢 ${tx(N_('Slower'))}`, handlers.slow, 'hs-toggle');
    this.bNext = btn(`${tx(N_('Next'))} ▸`, handlers.next, 'hs-primary');
    this.bLeave = btn(`✕ ${tx(N_('Leave'))}`, handlers.leave);
    this.bLeave.setAttribute('aria-label', tx(N_('Stop listening')));
    this.handlers = handlers;
    p.append(this.title, text, row);
    this.host().appendChild(p);
    document.body.classList.add('hs-on');
  }

  setTitle(text, step) { if (this.title) this.title.textContent = step ? `${text} · ${step}` : text; }
  setSlow(on) { this.bSlow?.classList.toggle('on', !!on); this.bSlow?.setAttribute('aria-pressed', on ? 'true' : 'false'); }

  /** One line: { name, color, lang, segments: [{text, phrase?}], meaning (null = hidden) }. */
  line({ name, color, lang, segments, meaning, draft }) {
    if (!this.panel) return;
    loadFont(lang);
    this.who.textContent = name;
    this.who.style.color = color || '';
    this.learn.textContent = '';
    this.learn.lang = LANG_HTML[lang] || lang;
    this.learn.style.borderColor = color || '';
    for (const s of segments) {
      if (!s.phrase) { this.learn.appendChild(document.createTextNode(s.text)); continue; }
      const c = el('button', 'hs-chip', s.text);
      c.type = 'button';
      c.addEventListener('click', e => { e.stopPropagation(); this.handlers?.chip?.(s.phrase); });
      this.learn.appendChild(c);
    }
    if (draft) this.learn.appendChild(el('span', 'hs-draft', tx(N_('draft'))));
    this.meaning.hidden = !meaning;
    this.meaning.textContent = meaning || '';
  }

  close() {
    this.panel?.remove();
    this.panel = null;
    this.card?.remove();
    this.card = null;
    document.body.classList.remove('hs-on');
  }

  // ------------------------------------------------------------------ cards
  /** A small modal card; resolves with the value of the button pressed. buttons: [{ label, value, cls, keep }] */
  modal(cls, build) {
    this.card?.remove();
    const c = this.card = el('div', `hs-card ${cls}`);
    c.setAttribute('role', 'dialog');
    this.host().appendChild(c);
    return new Promise(resolve => {
      const finish = v => { if (this.card === c) { c.remove(); this.card = null; } resolve(v); };
      build(c, finish);
    });
  }

  /** The first-visit question: which language to listen in (question: another wording). -> 'en' | 'ko' | 'vi' | 'off' */
  chooseLanguage(sceneTitle, question = null) {
    return this.modal('hs-choose', (c, finish) => {
      c.appendChild(el('h3', '', sceneTitle));
      c.appendChild(el('p', '', question || tx(N_('The family is talking. Which language would you like to listen in?'))));
      const row = el('div', 'hs-col');
      for (const l of ['en', 'ko', 'vi']) {
        loadFont(l);
        const b = el('button', 'hs-btn hs-wide', LEARN_NAMES[l]);
        b.lang = l; b.type = 'button';
        b.addEventListener('click', () => finish(l));
        row.appendChild(b);
      }
      const no = el('button', 'hs-btn hs-wide hs-quiet', tx(N_('Not now')));
      no.type = 'button';
      no.addEventListener('click', () => finish('off'));
      row.appendChild(no);
      c.appendChild(row);
      c.appendChild(el('p', 'hs-note', tx(N_('You can change this in Settings > Learn a language.'))));
      row.querySelector('button')?.focus();
    });
  }

  /** A phrase card. entry = glossary entry; actions: { play(), keep(on) }; kept: bool. Resolves when closed. */
  phrase(entry, lang, uiLang, { play, keep, kept, roman }) {
    return this.modal('hs-phrase', (c, finish) => {
      const e = entry[lang] || {};
      loadFont(lang);
      const say = el('div', 'hs-say', e.say || '');
      say.lang = LANG_HTML[lang];
      c.appendChild(say);
      if (roman !== false && (e.roman || e.tone)) c.appendChild(el('div', 'hs-roman', e.roman || e.tone));
      c.appendChild(el('div', 'hs-mean', entry.mean?.[uiLang] || entry.mean?.en || ''));
      const note = entry.note?.[uiLang] || entry.note?.en;
      if (note) c.appendChild(el('p', 'hs-note', note));
      const row = el('div', 'hs-row');
      const b = (label, fn, cls = '') => { const x = el('button', `hs-btn ${cls}`, label); x.type = 'button'; x.addEventListener('click', fn); row.appendChild(x); return x; };
      b(`▶ ${tx(N_('Hear it'))}`, () => play?.());
      let on = !!kept;
      const k = b(`${on ? '★' : '☆'} ${tx(N_('Keep'))}`, () => { on = !on; keep?.(on); k.textContent = `${on ? '★' : '☆'} ${tx(N_('Keep'))}`; k.classList.toggle('on', on); }, on ? 'on' : '');
      b(tx(N_('Close')), () => finish(), 'hs-primary');
      c.appendChild(row);
    });
  }

  /**
   * Gentle recall: { q, choices: [{ text, lang, play() }], answer: index into choices }. A wrong pick only plays that
   * line; the right one chimes and closes. Skip is always there. -> true (right) | false (skipped)
   */
  recall({ q, choices, answer, chime }) {
    return this.modal('hs-recall', (c, finish) => {
      c.appendChild(el('div', 'hs-tamo', tx(N_('Tamo remembers…'))));
      c.appendChild(el('h3', '', q));
      const col = el('div', 'hs-col');
      choices.forEach((ch, i) => {
        const b = el('button', 'hs-btn hs-wide hs-choice', `▶ ${ch.text}`);
        b.type = 'button'; b.lang = LANG_HTML[ch.lang];
        b.addEventListener('click', async () => {
          ch.play?.();
          if (i === answer) { b.classList.add('right'); chime?.(); setTimeout(() => finish(true), 1400); }
          else b.classList.add('tried');
        });
        col.appendChild(b);
      });
      const skip = el('button', 'hs-btn hs-wide hs-quiet', tx(N_('Skip')));
      skip.type = 'button';
      skip.addEventListener('click', () => finish(false));
      col.appendChild(skip);
      c.appendChild(col);
    });
  }
}
