// © 2026 Bui Cong Nguyen · solluxlabs.com
// Sing & Play's Song picker: the whole song library (docs/SING-AND-PLAY.md "Song list: Download and Delete"). Owner,
// 2026-11-28: "Add the full list of songs: if I want, I press Download and it downloads; if memory is full I can delete
// a song (it stays in the list). The list should include ALL the songs ... (Vietnamese and Korean songs too)."
//   tabs      All · English · Tiếng Việt · 한국어 · Instrumental (a flat row, the game's language first picked; Japanese:
//             English). Each language keeps its own name in every language.
//   header    "Downloaded: N songs · X MB · free about Y" (navigator.storage.estimate), and one direct button: Download
//             all (the songs of this tab not on the device yet) or, while downloads run, Stop downloads.
//   a row     the song (tap: pick it, as before; title, language, bpm, dance style, length, size) and its own button
//             beside it: Download · the download's % (tap: stop it) · Delete once downloaded (the row stays). Its state
//             line: Downloaded, Downloading n %, Waiting, Needs internet (offline and not on the device), Playing now.
//   keyboard / gamepad  the tabs, the header button, each row and its button are controls in the picker's own
//             arrow / D-pad steps (pickers.js navStep); LB / RB switch the tab.
// Data and handlers stay with their owners: SingPlay songChoices / chooseSong / downloadSong / deleteSong / cancelDownload
// / downloadAll / stopDownloads, the device state in song-library.js. pickers.js hosts the panel.
import { tx, N_, LANGS } from '../../i18n/i18n.js';

export const SONG_TABS = Object.freeze(['all', 'en', 'vi', 'ko', 'inst']);
/** A tab's label: All and Instrumental translated; a language by its own name (English, Tiếng Việt, 한국어). */
export const tabName = t => (t === 'all' ? tx(N_('All')) : t === 'inst' ? tx(N_('Instrumental')) : LANGS[t]?.name || t);
/** The tab the list opens on: the game's language (Japanese: English, the songs she sings then). */
export const defaultTab = lang => (lang === 'vi' || lang === 'ko' ? lang : 'en');
const langsOf = c => String(c.lang || '').split('+').filter(Boolean);
/** True when a song (SingPlay.songChoices() entry) is listed under a tab. */
export const inTab = (c, tab) => tab === 'all' || (tab === 'inst' ? !!c.instrumental : !c.instrumental && langsOf(c).includes(tab));

const MB = 1048576, GB = 1073741824;
/** Bytes as a short size: 3.6 MB, 145 MB, 1.2 GB (a no-break space before the unit). */
export function fmtSize(b) {
  const n = Number(b) || 0, nb = '\u00a0';   // (no line break between the number and its unit)
  if (n >= GB) return `${(n / GB).toFixed(1)}${nb}GB`;
  return n >= 100 * MB ? `${Math.round(n / MB)}${nb}MB` : `${(n / MB).toFixed(1)}${nb}MB`;
}

/** The header's line: what is downloaded and the room left (when the browser tells). lib: SongLibrary or null. */
export function storageLine(lib) {
  if (!lib?.ok) return '';
  const { n, bytes } = lib.summary(), free = lib.free(), parts = [];
  parts.push(n === 0 ? tx(N_('Nothing downloaded yet')) : n === 1 ? tx(N_('Downloaded: 1 song')) : tx(N_('Downloaded: {n} songs'), { n }));
  if (n > 0) parts.push(fmtSize(bytes));
  if (free !== null) parts.push(tx(N_('free about {size}'), { size: fmtSize(free) }));
  return parts.join(' · ');
}

/** The note under the list: the last download's trouble, else being offline, else ''. */
export function libraryNote(lib) {
  const e = lib?.error;
  if (e?.kind === 'full') return tx(N_('Not enough room on this device for {song}. Delete a downloaded song to make room.'), { song: e.title });
  if (e?.kind === 'net') return tx(N_("{song} couldn't be downloaded: check the connection."), { song: e.title });
  if (e?.kind === 'storage') return tx(N_("This browser can't keep songs."));
  if (lib && !lib.online()) return tx(N_('Offline: the downloaded songs can be sung.'));
  return '';
}

/**
 * A song row's state and its button as data. c: a songChoices() entry; sp: the SingPlay (library, perf, songWait).
 * -> { state, pct, line, act: null | { kind: 'download' | 'cancel' | 'delete', text, aria, disabled } , usable }
 */
export function rowState(sp, c) {
  const lib = sp.library, st = lib ? lib.state(c) : c.remote ? 'none' : 'builtin', pct = lib ? Math.round(lib.progress(c) * 100) : 0;
  const usable = sp.canPlay ? sp.canPlay(c) : true, playing = sp.inUse ? sp.inUse(c.id) : false, size = fmtSize(c.totalBytes || c.bytes);
  const can = !!lib?.ok && c.remote;
  let line = '', act = null;
  if (playing) line = tx(N_('Playing now'));
  else if (st === 'kept') line = `✓ ${tx(N_('Downloaded'))}`;
  else if (st === 'run') line = tx(N_('Downloading {n} %'), { n: pct });
  else if (st === 'wait') line = tx(N_('Waiting to download'));
  else if (!usable) line = tx(N_('Needs internet'));
  if (can && st === 'kept') act = { kind: 'delete', text: tx(N_('Delete')), aria: tx(N_('Delete {song} from this device'), { song: c.title }), disabled: playing };
  else if (can && (st === 'run' || st === 'wait')) act = { kind: 'cancel', text: st === 'run' ? `${pct} %` : tx(N_('Waiting')), aria: tx(N_('Stop downloading {song}'), { song: c.title }), disabled: false };
  else if (can && lib.online() && (st === 'none' || st === 'cached')) act = { kind: 'download', text: tx(N_('Download')), aria: tx(N_('Download {song} ({size})'), { song: c.title, size }), disabled: false };
  return { state: playing ? 'playing' : !usable ? 'offline' : st, pct, line, act, usable };
}

/**
 * The Song picker as data. tab: one of SONG_TABS. songTags / songSections / ICONS come from pickers.js (passed in, so
 * this file does not import its host).
 * -> { kind: 'songs', tab, tabs, storage, all, sections, note, w }
 */
export function songListData(sp, tab, { songTags, songSections, icons }) {
  const all = sp.songChoices(), cur = sp.currentSong()?.id, busy = !!sp.songWait, lib = sp.library;
  const list = all.filter(c => inTab(c, tab));
  const sections = songSections(list).map(s => ({
    label: tx(s.label),
    items: s.items.map(c => {
      const r = rowState(sp, c), tags = songTags(c);
      if (c.remote && (c.totalBytes || c.bytes)) tags.push(fmtSize(c.totalBytes || c.bytes));
      return { id: c.id, name: c.title, sub: tags.join(' · '), svg: c.instrumental ? icons.notes : icons.note, selected: c.id === cur, disabled: busy || !r.usable, ...r };
    }),
  }));
  // the header's one button: Stop while downloads run, else Download all (a language or the instrumentals, online)
  let head = null;
  if (lib?.busy?.()) head = { kind: 'stop', text: tx(N_('Stop downloads')) };
  else if (lib?.ok && tab !== 'all' && lib.online()) {
    const todo = list.filter(c => c.remote && ['none', 'cached'].includes(lib.state(c)));
    if (todo.length) head = { kind: 'all', n: todo.length, text: tx(N_('Download all {n} ({size})'), { n: todo.length, size: fmtSize(todo.reduce((a, c) => a + (c.totalBytes || c.bytes || 0), 0)) }) };
  }
  const note = !all.length ? tx(N_('No songs yet')) : !list.length ? tx(N_('No songs in this list yet')) : libraryNote(lib);
  return { kind: 'songs', tab, tabs: SONG_TABS.map(t => ({ id: t, name: tabName(t), selected: t === tab, n: all.filter(c => inTab(c, t)).length })), storage: storageLine(lib), all: head, sections, note, w: 500 };
}

// ---------------------------------------------------------------- the view (inside pickers.js's panel)
const svg = (body, s = 20) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
export const LIST_ICONS = Object.freeze({
  download: svg('<path d="M7 17.5H6a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 16 8.4a4 4 0 0 1 2 7.6"/><path d="M12 11v9M8.6 16.8 12 20.2l3.4-3.4"/>'),
  delete: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  stop: svg('<rect x="7" y="7" width="10" height="10" rx="1.5"/>', 16),
});

export const SONG_LIST_STYLE = `
.sp-pk-top{flex:0 0 auto;padding:2px 12px 4px}
.sp-pk-top[hidden]{display:none}
.sp-tabs{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none;padding:2px;margin:0 0 6px;background:#f1e5cf;border-radius:14px}
.sp-tabs::-webkit-scrollbar{display:none}
.sp-tab{flex:1 0 auto;min-height:44px;min-width:44px;padding:0 10px;border:0;border-radius:12px;background:transparent;color:#5a3a22;font-family:inherit;font-size:13px;line-height:1.1;font-weight:800;white-space:nowrap;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.sp-tab[aria-selected=true]{background:#5b3fa0;color:#fff;box-shadow:0 1px 4px rgba(60,20,120,.3)}
.sp-tab:focus{outline:none}.sp-tab:focus-visible,.sp-tab.pad{outline:3px solid #f08a3c;outline-offset:-3px}
.sp-libhead{display:flex;align-items:center;gap:8px;min-height:44px;flex-wrap:wrap}
.sp-storage{flex:1 1 180px;margin:0;font-size:12px;line-height:1.3;font-weight:700;color:#7d6b55}
.sp-all{flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 14px 0 10px;border:0;border-radius:22px;background:#5b3fa0;color:#fff;font-family:inherit;font-size:13px;font-weight:800;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.sp-all[data-kind=stop]{background:#f1e5cf;color:#5a3a22}
.sp-all[hidden]{display:none}
.sp-all:focus{outline:none}.sp-all:focus-visible,.sp-all.pad{outline:3px solid #f08a3c;outline-offset:2px}
.sp-songrow{display:flex;align-items:center;gap:6px}
.sp-songrow .sp-rowopt{flex:1 1 auto;min-width:0;padding-right:30px}
.sp-opt[aria-pressed=true]{background:#5b3fa0;color:#fff;border-color:#5b3fa0}.sp-opt[aria-pressed=true] .sp-opt-sub,.sp-opt[aria-pressed=true] .sp-opt-state{color:#e3d8ff}.sp-opt[aria-pressed=true] .sp-opt-vis{color:#fff;background:rgba(255,255,255,.18)}
.sp-opt[aria-pressed=true]::after{content:'✓';position:absolute;top:50%;margin-top:-7px;right:9px;font-size:14px;line-height:1;font-weight:900;color:#ffd36e}
.sp-opt-state{font-size:12px;line-height:1.25;font-weight:800;color:#3f8a4a}
.sp-opt-state:empty{display:none}
.sp-songrow[data-state=offline] .sp-opt-state{color:#a0522d}.sp-songrow[data-state=run] .sp-opt-state,.sp-songrow[data-state=wait] .sp-opt-state{color:#5b3fa0}
.sp-dl{position:relative;flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;gap:5px;width:108px;min-height:48px;padding:0 8px;border:2px solid #e4d4b8;border-radius:24px;background:#fff;color:#5b3fa0;font-family:inherit;font-size:12px;font-weight:800;white-space:nowrap;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.sp-dl[hidden]{display:none}
.sp-dl[data-kind=delete]{color:#a03a2a}
.sp-dl[data-kind=cancel]{background:conic-gradient(#5b3fa0 calc(var(--p,0) * 1%),#efe6fb 0);color:#3a2a1a;border-color:#5b3fa0}
.sp-dl[data-kind=cancel] .sp-dl-tx{background:#fff;border-radius:12px;padding:2px 6px}
.sp-dl[aria-disabled=true]{opacity:.45;cursor:default}
.sp-dl:focus{outline:none}.sp-dl:focus-visible,.sp-dl.pad{outline:3px solid #f08a3c;outline-offset:2px}
.sp-dl-ic{display:inline-flex}.sp-dl-ic:empty{display:none}.sp-dl-tx:empty{display:none}
@media (max-width:420px){.sp-dl{width:auto;min-width:52px;padding:0 6px}.sp-dl[data-kind=download] .sp-dl-tx,.sp-dl[data-kind=delete] .sp-dl-tx{display:none}.sp-tab{padding:0 8px;font-size:12px}}
@media (max-height:480px) and (orientation:landscape){
 #spPicker[data-picker=song] .sp-tabs{position:absolute;top:2px;left:104px;right:54px;margin:0}
 #spPicker[data-picker=song] .sp-pk-head{min-height:48px}
 .sp-pk-top{padding-top:0}.sp-libhead{flex-wrap:nowrap}.sp-storage{flex:1 1 auto;min-width:0}
}
`;

/** The Song picker's own parts of the panel: the tabs and header over the list (not scrolled) and the rows. */
export class SongListView {
  /** pk: the Pickers (panel, body, sp, pick(), render()). */
  constructor(pk) {
    this.pk = pk; this.key = '';
    if (!document.getElementById('singplaySongListStyle')) {
      const st = document.createElement('style'); st.id = 'singplaySongListStyle'; st.textContent = SONG_LIST_STYLE; document.head.appendChild(st);
    }
    const top = this.top = document.createElement('div');
    top.className = 'sp-pk-top'; top.hidden = true;
    top.innerHTML = '<div class="sp-tabs" role="tablist"></div><div class="sp-libhead"><p class="sp-storage" aria-live="polite"></p><button type="button" class="sp-all" hidden></button></div>';
    pk.panel.insertBefore(top, pk.body);
    this.tabsEl = top.querySelector('.sp-tabs'); this.storageEl = top.querySelector('.sp-storage'); this.allEl = top.querySelector('.sp-all');
    this.allEl.dataset.all = '1';
    this.allEl.addEventListener('click', e => { e.stopPropagation(); this.pk.g.audio?.click?.(); this.head(); });
  }

  hide() { this.top.hidden = true; this.key = ''; }

  /** The states again (only while the Song picker is the open one). */
  redraw() { if (this.pk.open === 'song') this.pk.render(false); }

  /** Draw (full: rebuilt) or update in place (states, the % and the header only). d: songListData(). */
  render(d, full) {
    const body = this.pk.body;
    this.top.hidden = false; this.d = d;
    const key = `${d.tab}|${d.sections.map(s => s.label + s.items.map(i => i.id + i.name + i.sub).join()).join('/')}`;
    // the tabs
    if (full || this.tabsEl.childElementCount !== d.tabs.length || this.tabsKey !== d.tabs.map(t => t.name).join()) {
      this.tabsKey = d.tabs.map(t => t.name).join(); this.tabsEl.textContent = '';
      this.tabsEl.setAttribute('aria-label', tx(N_('Songs')));
      for (const t of d.tabs) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'sp-tab'; b.dataset.tab = t.id; b.setAttribute('role', 'tab'); b.textContent = t.name;
        b.addEventListener('click', e => { e.stopPropagation(); this.pk.g.audio?.click?.(); this.tab(t.id, true); });
        this.tabsEl.appendChild(b);
      }
    }
    for (const b of this.tabsEl.children) b.setAttribute('aria-selected', String(b.dataset.tab === d.tab));
    // the header
    if (this.storageEl.textContent !== d.storage) this.storageEl.textContent = d.storage;
    if (!d.all && !this.allEl.hidden && document.activeElement === this.allEl) (this.pk.options().find(o => o.getAttribute('aria-pressed') === 'true') || this.pk.options()[0])?.focus({ preventScroll: true });
    this.allEl.hidden = !d.all;
    const allKey = d.all ? `${d.all.kind}|${d.all.text}` : '';
    if (d.all && this.allKey !== allKey) { this.allEl.dataset.kind = d.all.kind; this.allEl.innerHTML = `${d.all.kind === 'stop' ? LIST_ICONS.stop : LIST_ICONS.download}<span></span>`; this.allEl.lastChild.textContent = d.all.text; }
    this.allKey = allKey;
    // the rows
    if (full || key !== this.key) {
      const a = document.activeElement, keep = this.pk.panel.contains(a) ? { opt: a.dataset.opt, dl: a.dataset.dl, tab: a.dataset.tab, all: a.dataset.all } : null;
      this.key = key; body.textContent = '';
      for (const s of d.sections) {
        const h = document.createElement('div'); h.className = 'sp-pk-sec'; h.textContent = s.label; h.setAttribute('aria-hidden', 'true'); body.appendChild(h);
        const box = document.createElement('div'); box.className = 'sp-rows'; box.setAttribute('role', 'list'); box.setAttribute('aria-label', s.label);
        for (const it of s.items) box.appendChild(this.row(it));
        body.appendChild(box);
      }
      if (keep) {
        const t = keep.opt ? body.querySelector(`[data-opt="${CSS.escape(keep.opt)}"]`) : keep.dl ? body.querySelector(`[data-dl="${CSS.escape(keep.dl)}"]`) || body.querySelector(`[data-opt="${CSS.escape(keep.dl)}"]`)
          : keep.tab ? this.tabsEl.querySelector(`[data-tab="${keep.tab}"]`) : keep.all ? (this.allEl.hidden ? null : this.allEl) : null;
        (t || this.pk.options()[0])?.focus({ preventScroll: true });
      }
      if (!full) this.pk.place();   // (a new list under a popover: it keeps to its chip)
    }
    for (const it of d.sections.flatMap(s => s.items)) this.update(it);
  }

  row(it) {
    const r = document.createElement('div'); r.className = 'sp-songrow'; r.setAttribute('role', 'listitem'); r.dataset.row = it.id;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'sp-opt sp-rowopt sp-songopt'; b.dataset.opt = it.id;
    b.innerHTML = `<span class="sp-opt-vis">${it.svg || ''}</span><span class="sp-opt-tx"><span class="sp-opt-name"></span><span class="sp-opt-sub"></span><span class="sp-opt-state"></span></span>`;
    b.querySelector('.sp-opt-name').textContent = it.name;
    b.querySelector('.sp-opt-sub').textContent = it.sub;
    b.addEventListener('click', e => { e.stopPropagation(); this.pk.pick(it.id, e.detail === 0); });
    const dl = document.createElement('button');
    dl.type = 'button'; dl.className = 'sp-dl'; dl.dataset.dl = it.id; dl.hidden = true;
    dl.innerHTML = '<span class="sp-dl-ic"></span><span class="sp-dl-tx"></span>';
    dl.addEventListener('click', e => { e.stopPropagation(); this.act(it.id, dl); });
    r.append(b, dl);
    return r;
  }

  /** One row's states (written only when they change). */
  update(it) {
    const r = this.pk.body.querySelector(`[data-row="${CSS.escape(it.id)}"]`); if (!r) return;
    const b = r.firstChild, dl = r.lastChild, set = (el, k, v) => { if (el.getAttribute(k) !== v) el.setAttribute(k, v); };
    r.dataset.state = it.state;
    set(b, 'aria-pressed', String(!!it.selected)); set(b, 'aria-disabled', String(!!it.disabled));
    const line = b.querySelector('.sp-opt-state'); if (line.textContent !== it.line) line.textContent = it.line;
    set(b, 'aria-label', [it.name, it.sub, it.line].filter(Boolean).join(', '));
    const a = it.act;
    if (!a) { if (!dl.hidden) { if (document.activeElement === dl) b.focus({ preventScroll: true }); dl.hidden = true; } return; }
    dl.hidden = false;
    if (dl.dataset.kind !== a.kind) { dl.dataset.kind = a.kind; dl.firstChild.innerHTML = a.kind === 'delete' ? LIST_ICONS.delete : a.kind === 'download' ? LIST_ICONS.download : ''; }
    if (dl.lastChild.textContent !== a.text) dl.lastChild.textContent = a.text;
    dl.style.setProperty('--p', String(it.pct || 0));
    set(dl, 'aria-label', a.aria); dl.title = a.aria; set(dl, 'aria-disabled', String(!!a.disabled));
  }

  /** A row's button: Download / stop that download / Delete. */
  act(id, dl) {
    if (dl.getAttribute('aria-disabled') === 'true') return;
    const sp = this.pk.sp, kind = dl.dataset.kind;
    this.pk.g.audio?.click?.();
    if (kind === 'download') sp.downloadSong?.(id);
    else if (kind === 'cancel') sp.cancelDownload?.(id);
    else if (kind === 'delete') Promise.resolve(sp.deleteSong?.(id)).then(() => this.redraw());
    this.redraw();
  }

  /** The header's button: Download all of this tab, or Stop downloads. */
  head() {
    const sp = this.pk.sp, a = this.d?.all; if (!a) return;
    if (a.kind === 'stop') sp.stopDownloads?.(); else sp.downloadAll?.(this.d.tab);
    this.redraw();
  }

  /** Show another tab (focus: the tab when it was picked from the tab row, else the list's first control). */
  tab(id, fromTab = false) {
    if (!SONG_TABS.includes(id)) return;
    this.pk.sp.songTab = id;
    this.pk.render(true);
    this.pk.place();
    const t = fromTab ? this.tabsEl.querySelector(`[data-tab="${id}"]`) : null;
    (t || this.pk.options().find(o => o.getAttribute('aria-pressed') === 'true') || this.pk.options()[0])?.focus({ preventScroll: true });
    if (this.pk.padBar || this.pk.via === 'pad') this.pk.mark(document.activeElement);
  }
  /** The tab before / after (LB / RB). */
  step(dir) { const i = SONG_TABS.indexOf(this.d?.tab || SONG_TABS[0]); this.tab(SONG_TABS[(i + dir + SONG_TABS.length) % SONG_TABS.length]); }

  /** The controls above the list (tabs, the header button), in order. */
  controls() { return [...this.tabsEl.children, ...(this.allEl.hidden ? [] : [this.allEl])]; }
}
