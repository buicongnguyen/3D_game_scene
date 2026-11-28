// © 2026 Bui Cong Nguyen · solluxlabs.com
// Sing & Play's setup chips (docs/SING-AND-PLAY.md "Bar layout"). Owner, 2026-11-28: "there are now too many buttons ...
// 'select singer' shows the current one singer; click on it shows the 8 singers to select. The same with the other
// groups." An owner-approved exception to the flat-menu rule, for setup CHOICES only: each chip shows its current value;
// one tap opens ONE picker (a bottom sheet on phones, a popover over the chip on a PC) with every option in a flat grid or
// list; one tap picks and closes. The actions (Perform / Stop, Record, Photo, Camera) stay direct buttons (singplay.js).
//   Singer · Song · Group · Dance · Stage · Time · ⚙ (Lyrics, Show effects: the sheet opens straight to the two switches)
//   keyboard  Tab reaches the chips; in a picker arrows / WASD move, Enter / Space pick, Esc closes, Tab stays inside
//   gamepad   the D-pad focuses the bar (chips and actions), A presses, B leaves (or move the stick); in a picker the D-pad
//             or the stick move, A picks, B closes (the Song list: LB / RB switch its tab)
// The Song picker is the whole song library with Download / Delete per song (song-list.js, song-library.js).
//   touch     a tap outside closes the picker and does nothing else (another chip opens its own picker at once)
// The choices' data and handlers stay with their owners (singplay.js songChoices / chooseSong / pickSinger / setGroup /
// setDance / toggleLyrics / toggleShow, time-row.js, stages-row.js); this file only shows them. While a picker is open
// (or the pad is on the bar) game.inputHold keeps the keys, the pad and the stick off her.
import { tx, N_, getLang, onLangChange } from '../../i18n/i18n.js';
import { SINGERS, NIGHT_STAR, GROUP_SIZES, nameOf, facePic } from '../../content/troupe.js';
import { STAGES } from '../../content/stages.js';
import { DANCE_STYLES } from '../../content/kotone-club.js';
import { isSequence } from '../../content/dance-sequences.js';
import { TIME_CHOICES, timeIcon, currentTime, pickTime } from './time-row.js';
import { stageAt, jump } from './stages-row.js';
import { songListData, SongListView, defaultTab } from './song-list.js';

/** The chips in the bar's order (phones: two rows, singer · song · group / dance · stage · time · settings). */
export const PICKERS = Object.freeze(['singer', 'song', 'group', 'dance', 'stage', 'time', 'settings']);
const ROWS = Object.freeze([['singer', 'song', 'group'], ['dance', 'stage', 'time', 'settings']]);
/** The Dance choice that follows the song (its own style, else Mixed): the default (singplay.js danceFor). */
export const DANCE_AUTO = 'auto';
export const DANCE_PICKS = Object.freeze([DANCE_AUTO, ...DANCE_STYLES]);
export const DANCE_LABELS = Object.freeze({ auto: N_('Auto'), mix: N_('Mixed'), kpop: N_('K-pop'), cute: N_('Cute'), hiphop: N_('Hip-hop'),
  breaking: N_('Breaking'), capoeira: N_('Capoeira'), classics: N_('Party classics'), latin: N_('Latin party'), soul: N_('Northern soul') });
/** The sequence styles' tiles: their round in a few words (content/dance-sequences.js SEQUENCES). */
export const DANCE_ROUNDS = Object.freeze({ breaking: N_('Rock · floor · freeze'), capoeira: N_('Ginga · round'),
  classics: N_('YMCA · silly steps'), latin: N_('Salsa · samba · house'), soul: N_('Jazz · floor spin') });
export const GROUP_LABELS = Object.freeze({ 1: N_('Solo'), 4: N_('Group of 4'), 8: N_('Group of 8') });
const TITLES = Object.freeze({ singer: N_('Singer'), song: N_('Song'), group: N_('Group'), dance: N_('Dance'), stage: N_('Stage'), time: N_('Time'), settings: N_('Settings') });
const PHONE = '(max-width: 640px), (max-height: 480px)';

/** A singer's label: her name in the game's language (content/troupe.js), else "Singer n" in the row's order. */
export const singerLabel = id => nameOf(id, getLang()) || tx(N_('Singer {n}'), { n: SINGERS.indexOf(id) + 1 });
/** Seconds as m:ss ('' for none). */
export const fmtDuration = s => { const t = Math.round(Number(s)); return t > 0 ? `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` : ''; };
/** An hour as h:mm (12.5 -> 12:30). */
export const fmtHour = h => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
/** A song row's tags: language (or Instrumental), bpm, dance style, length. c: SingPlay.songChoices() entry. */
export function songTags(c) {
  const out = [c.instrumental ? tx(N_('Instrumental')) : c.lang ? String(c.lang).toUpperCase().replace('+', '/') : ''];
  if (c.bpm > 0) out.push(tx(N_('{n} bpm'), { n: Math.round(c.bpm) }));
  if (c.style && DANCE_LABELS[c.style]) out.push(tx(DANCE_LABELS[c.style]));
  out.push(fmtDuration(c.duration));
  return out.filter(Boolean);
}
/** The song list's sections in its order (dance songs, slow songs, instrumentals), empty ones left out. */
export function songSections(choices) {
  const kind = c => (c.instrumental ? 'inst' : c.dance ? 'dance' : 'slow');
  return [['dance', N_('Dance songs')], ['slow', N_('Slow songs')], ['inst', N_('Instrumentals')]]
    .map(([k, label]) => ({ kind: k, label, items: choices.filter(c => kind(c) === k) })).filter(s => s.items.length);
}

/**
 * The next control from `i` in direction dir ('up' | 'down' | 'left' | 'right') by their places on the screen (rects:
 * { left, top, right, bottom }); left / right with nothing beside go to the one before / after in reading order (a list,
 * a row's end). -> an index, or -1 (stay).
 */
export function navStep(rects, i, dir) {
  const a = rects[i];
  if (!a) return rects.length ? 0 : -1;
  const cx = (a.left + a.right) / 2, cy = (a.top + a.bottom) / 2, w = a.right - a.left, h = a.bottom - a.top;
  let best = -1, bd = Infinity;
  rects.forEach((q, j) => {
    if (j === i) return;
    const dx = (q.left + q.right) / 2 - cx, dy = (q.top + q.bottom) / 2 - cy;
    const ok = dir === 'down' ? dy > h * 0.4 : dir === 'up' ? dy < -h * 0.4 : dir === 'right' ? dx > w * 0.4 && Math.abs(dy) < h * 0.6 : dx < -w * 0.4 && Math.abs(dy) < h * 0.6;
    if (!ok) return;
    const d = dir === 'up' || dir === 'down' ? Math.abs(dy) + Math.abs(dx) * 2 : Math.abs(dx) + Math.abs(dy) * 2;
    if (d < bd) { bd = d; best = j; }
  });
  if (best < 0 && (dir === 'left' || dir === 'right')) { const j = i + (dir === 'right' ? 1 : -1); if (j >= 0 && j < rects.length) best = j; }
  return best;
}

/** The note under the Group choices when 8 is not offered here (why), or ''. sp: the SingPlay (limits, strong). */
export function groupNote(sp) {
  if (sp.max() >= 8) return '';
  return sp.strong?.why === 'measuring' && !sp.limits?.forced ? tx(N_('Group of 8: checking this device…')) : tx(N_('Group of 8 needs a faster device'));
}

/**
 * What a picker shows now, as plain data. -> { kind: 'tiles' | 'rows' | 'switches', sections: [{ label, items }], note, w }
 * items: { id, name, sub, img, svg, selected, disabled } (switches: on instead of selected).
 */
export function pickerData(sp, id) {
  const one = (items, extra = {}) => ({ kind: 'tiles', sections: [{ label: '', items }], note: '', w: 380, ...extra });
  if (id === 'singer') {
    const cur = sp.singerNext || sp.singer;
    return one(sp.singers.map(s => ({ id: s, name: singerLabel(s), img: facePic(s), sub: s === NIGHT_STAR ? tx(N_('Best at night')) : '', selected: s === cur, disabled: !!sp.singerWait })), { w: 440, tile: 92 });
  }
  if (id === 'song') return songListData(sp, sp.songTab || defaultTab(getLang()), { songTags, songSections, icons: ICONS });   // (song-list.js)
  if (id === 'group') {
    const sizes = GROUP_SIZES.filter(n => n <= sp.max());
    return one(sizes.map(n => ({ id: String(n), name: tx(GROUP_LABELS[n]), svg: people(n), selected: n === sp.group })), { note: sp.groupWait ? tx(N_('Getting the group ready…')) : groupNote(sp), w: 380, tile: 104 });
  }
  if (id === 'dance') {
    // the styles, then the sequence styles under their own heading (each tile says its round)
    const auto = sp.songDance?.() || 'mix';
    const tile = d => ({ id: d, name: tx(DANCE_LABELS[d]), sub: d === DANCE_AUTO ? tx(N_('Follows the song: {style}'), { style: tx(DANCE_LABELS[auto]) }) : DANCE_ROUNDS[d] ? tx(DANCE_ROUNDS[d]) : '',
      svg: d === DANCE_AUTO ? ICONS.auto : DANCE_ICONS[d] || ICONS.dance, selected: d === sp.dancePick });
    return { kind: 'tiles', note: '', w: 440, tile: 112, sections: [
      { label: '', items: DANCE_PICKS.filter(d => !isSequence(d)).map(tile) },
      { label: tx(N_('Dance sequences')), items: DANCE_PICKS.filter(isSequence).map(tile) }] };
  }
  if (id === 'stage') {
    const here = stageAt(sp.g.player.pos);
    const items = here ? [] : [{ id: 'here', name: tx(N_('Here')), sub: tx(N_('Where you stand')), svg: ICONS.here, selected: true }];
    for (const st of STAGES) items.push({ id: st.id, name: tx(st.name), svg: ICONS.pin, selected: here?.id === st.id });
    return one(items, { w: 440, tile: 120 });
  }
  if (id === 'time') {
    const cur = currentTime(sp);
    return one(TIME_CHOICES.map(c => ({ id: c.id, name: tx(c.label), sub: fmtHour(c.hour), svg: timeIcon(c.id), selected: c.id === cur })), { w: 380, tile: 80 });
  }
  return {
    kind: 'switches', note: '', w: 380,
    sections: [{ label: '', items: [
      { id: 'lyrics', name: tx(N_('Lyrics')), sub: tx(N_('The words she sings, on screen')), on: !!sp.lyricsOn },
      { id: 'show', name: tx(N_('Show effects')), sub: tx(N_('Lights, confetti and fireworks around the show')), on: !!sp.showOn, disabled: !!sp.perf },
    ] }],
  };
}

/** A chip's face now: { k (label), v (value), img | svg, wait }. */
export function chipData(sp, id) {
  if (id === 'singer') { const s = sp.singerNext || sp.singer; return { k: tx(TITLES.singer), v: singerLabel(s), img: facePic(s), wait: !!sp.singerWait }; }
  if (id === 'song') { const c = sp.currentSong(); return { k: tx(TITLES.song), v: c ? c.title : tx(N_('No songs yet')), svg: c?.instrumental ? ICONS.notes : ICONS.note, wait: !!sp.songWait }; }
  if (id === 'group') return { k: tx(TITLES.group), v: tx(GROUP_LABELS[sp.group] || GROUP_LABELS[1]), svg: ICONS.group, wait: !!sp.groupWait };
  if (id === 'dance') return { k: tx(TITLES.dance), v: tx(DANCE_LABELS[sp.dancePick] || DANCE_LABELS.auto), svg: ICONS.dance };
  if (id === 'stage') { const st = stageAt(sp.g.player.pos); return { k: tx(TITLES.stage), v: st ? tx(st.name) : tx(N_('Here')), svg: ICONS.pin }; }
  if (id === 'time') { const t = TIME_CHOICES.find(c => c.id === currentTime(sp)) || TIME_CHOICES[0]; return { k: tx(TITLES.time), v: tx(t.label), svg: timeIcon(t.id) }; }
  return { k: tx(TITLES.settings), v: '', svg: ICONS.gear };
}

// ---------------------------------------------------------------- pictograms (currentColor, drawn for this bar)
const svg = (body, s = 18) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
export const ICONS = Object.freeze({
  note: svg('<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'),
  notes: svg('<path d="M9 18V6l10-2v11"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="15" r="2.5"/><path d="M9 10l10-2"/>'),
  group: svg('<circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9" r="2.4"/><path d="M15.6 14.1A4.6 4.6 0 0 1 21 18.6"/>'),
  dance: svg('<circle cx="13" cy="4.2" r="2"/><path d="M5 9.5l4-2 4 1.2 4.5-3"/><path d="M13 8.7l-1 5 3.5 2.6-1.2 5"/><path d="M12 13.7l-3.2 2.8-3.3.5"/>'),
  auto: svg('<path d="M9 18V6l9-2v11"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="15.5" cy="15" r="2.5"/><path d="M20.5 3.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" stroke-width="1.4"/>'),
  pin: svg('<path d="M12 21s-6.5-5.8-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 15.2 12 21 12 21z"/><circle cx="12" cy="9.6" r="2.4"/>'),
  here: svg('<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/><circle cx="12" cy="12" r="6.3"/>', 22),
  caret: svg('<path d="M7 10l5 5 5-5"/>', 14),
});
/** The Dance tiles' pictures: Mixed a shuffle, K-pop a star, Cute a heart, Hip-hop a bolt; the sequences: a head spin
 *  (Breaking), a kick (Capoeira), the Y of the YMCA (Party classics), maracas (Latin party), a record
 *  (Northern soul). */
const DANCE_ICONS = Object.freeze({
  breaking: svg('<circle cx="12" cy="19" r="2"/><path d="M12 17V9.5M12 9.5 8 4M12 9.5l4-5.5"/><path d="M4.5 13.5c1.6 1.6 4.4 2.5 7.5 2.5s5.9-.9 7.5-2.5"/>'),
  capoeira: svg('<circle cx="6.5" cy="5" r="2"/><path d="M7 7.2 8.2 13l-2.7 7.5M8.2 13l10.3-4.2M7.6 9.6 3.5 11.5"/>'),
  classics: svg('<circle cx="12" cy="9.5" r="2"/><path d="M12 11.5v5.5M12 17l-3 4.5M12 17l3 4.5M10.8 10.2 6 3M13.2 10.2 18 3"/>'),
  latin: svg('<ellipse cx="7.5" cy="7" rx="3" ry="4"/><path d="M9 10.7l3 9.3"/><ellipse cx="16.5" cy="7" rx="3" ry="4"/><path d="M15 10.7 12 20"/>'),
  soul: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.4"/><path d="M12 5.6a6.4 6.4 0 0 1 6.4 6.4"/>'),
  mix: svg('<path d="M3 7h3.5c4 0 6 10 10 10H21M3 17h3.5c1.8 0 3.1-2 4.3-4.4M13.2 9.4C14.3 8 15.4 7 16.5 7H21"/><path d="M18.5 4.5 21 7l-2.5 2.5M18.5 14.5 21 17l-2.5 2.5"/>'),
  kpop: svg('<path d="M12 3.2l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/>'),
  cute: svg('<path d="M12 20.2s-7.8-4.6-7.8-10.1A4.4 4.4 0 0 1 12 7.5a4.4 4.4 0 0 1 7.8 2.6c0 5.5-7.8 10.1-7.8 10.1z"/>'),
  hiphop: svg('<path d="M13.5 2.5 5 13.5h6l-1 8 8.5-11h-6z"/>'),
});
/** n little people in rows of four (a Group tile's picture). */
function people(n) {
  const cols = Math.min(n, 4), rows = Math.ceil(n / 4), W = 6 + cols * 10, H = rows * 13 + 4;
  let body = '';
  for (let i = 0; i < n; i++) {
    const x = 8 + (i % 4) * 10, y = 4 + Math.floor(i / 4) * 13;
    body += `<circle cx="${x}" cy="${y + 2.5}" r="2.6"/><path d="M${x - 3.6} ${y + 11}a3.6 3.6 0 0 1 7.2 0"/>`;
  }
  return `<svg class="sp-people" viewBox="0 0 ${W + 4} ${H}" width="${Math.round((W + 4) * 1.4)}" height="${Math.round(H * 1.4)}" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">${body}</svg>`;
}

const STYLE = `
.sp-chips{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;max-width:100%;pointer-events:none}
.sp-row{display:contents}
.sp-chip{pointer-events:auto;position:relative;display:inline-flex;align-items:center;gap:8px;box-sizing:border-box;min-width:48px;min-height:48px;max-width:250px;padding:0 10px 0 7px;border:0;border-radius:24px;overflow:hidden;
 background:rgba(255,250,240,.94);color:#3a2a1a;box-shadow:0 2px 8px rgba(0,0,0,.25);font-family:inherit;text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.sp-chip-vis{flex:0 0 auto;width:34px;height:34px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:#efe6fb;color:#5b3fa0;overflow:hidden}
.sp-chip-vis img{width:34px;height:34px;display:block;pointer-events:none}
.sp-chip-tx{display:flex;flex-direction:column;min-width:0;gap:1px}
.sp-chip-k{font-size:11px;line-height:13px;font-weight:700;color:#7d6b55;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sp-chip-v{font-size:15px;line-height:18px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sp-chip-caret{flex:0 0 auto;display:inline-flex;opacity:.5;margin-left:-2px}
.sp-chip.icon{width:48px;padding:0;justify-content:center}.sp-chip.icon .sp-chip-tx,.sp-chip.icon .sp-chip-caret{display:none}.sp-chip.icon .sp-chip-vis{background:none;color:#5b3fa0}
.sp-chip[aria-expanded=true]{background:#5b3fa0;color:#fff}.sp-chip[aria-expanded=true] .sp-chip-k{color:#e3d8ff}.sp-chip[aria-expanded=true] .sp-chip-caret{transform:rotate(180deg);opacity:.9}
.sp-chip[aria-expanded=true] .sp-chip-vis{background:rgba(255,255,255,.16);color:#fff}.sp-chip.icon[aria-expanded=true] .sp-chip-vis{background:none}
.sp-chip.wait .sp-chip-vis{animation:spWait 1s ease-in-out infinite}@keyframes spWait{50%{opacity:.35}}
.sp-chip:focus{outline:none}.sp-chip:focus-visible,.sp-chip.pad{outline:3px solid #ffd36e;outline-offset:2px}
.sp-song{max-width:230px}
#spPicker{position:fixed;z-index:40;box-sizing:border-box;display:flex;flex-direction:column;background:#fff8ea;color:#3a2a1a;border-radius:20px;box-shadow:0 12px 40px rgba(0,0,0,.42);
 font-family:var(--ui,Nunito,system-ui,sans-serif);overflow:hidden;pointer-events:auto;-webkit-user-select:none;user-select:none}
#spPicker[hidden]{display:none}
#spPicker.pop{width:min(var(--pk-w,380px),calc(100vw - 24px))}
#spPicker.sheet{left:0;right:0;bottom:0;margin:0 auto;width:min(640px,100vw);max-height:max(220px,calc(100vh - var(--sp-below,200px)));border-radius:20px 20px 0 0;padding-bottom:env(safe-area-inset-bottom,0px);animation:spSheet .18s ease-out}
@keyframes spSheet{from{transform:translateY(24px);opacity:.4}}
.sp-pk-head{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:6px 6px 2px 18px}
.sp-pk-head h2{flex:1;margin:0;font-size:17px;line-height:1.2;font-weight:800;color:#5b3fa0}
.sp-pk-x{flex:0 0 auto;width:44px;height:44px;border:0;border-radius:50%;background:#f1e5cf;color:#5a3a22;font-family:inherit;font-size:18px;font-weight:800;cursor:pointer}
.sp-pk-x:focus{outline:none}.sp-pk-x:focus-visible{outline:3px solid #f08a3c}
.sp-pk-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y;padding:4px 12px 12px;scroll-padding:8px}
.sp-pk-sec{margin:8px 4px 6px;font-size:12px;line-height:1.2;font-weight:800;color:#9a7b4f;letter-spacing:.03em}
.sp-pk-sec:first-child{margin-top:2px}
.sp-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--tile,96px),1fr));gap:8px}
.sp-rows{display:flex;flex-direction:column;gap:6px}
.sp-opt{position:relative;box-sizing:border-box;border:2px solid transparent;border-radius:16px;background:#fff;color:#3a2a1a;box-shadow:0 1px 4px rgba(80,40,0,.14);font-family:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.sp-opt:focus{outline:none}.sp-opt:focus-visible,.sp-opt.pad{border-color:#f08a3c;box-shadow:0 0 0 3px rgba(240,138,60,.45)}
.sp-opt[aria-disabled=true]{opacity:.5;cursor:default}
.sp-opt-vis{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;color:#5b3fa0}
.sp-opt-name{font-size:14px;line-height:1.2;font-weight:800;overflow-wrap:anywhere}
.sp-opt-sub{font-size:12px;line-height:1.25;font-weight:700;color:#7d6b55}
.sp-tile{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:76px;padding:8px 6px;text-align:center}
.sp-tile .sp-opt-vis{min-width:40px;min-height:32px}.sp-tile .sp-opt-vis svg{width:28px;height:28px}.sp-tile .sp-opt-vis svg.sp-people{width:auto;height:auto}
.sp-tile .sp-opt-vis img{width:52px;height:52px;border-radius:50%;display:block;background:#efe6fb;pointer-events:none}
.sp-rowopt{display:flex;align-items:center;gap:12px;min-height:54px;padding:6px 30px 6px 10px;text-align:left;width:100%}
.sp-rowopt .sp-opt-vis{width:34px;height:34px;border-radius:50%;background:#efe6fb}
.sp-rowopt .sp-opt-tx{display:flex;flex-direction:column;gap:2px;min-width:0}
.sp-opt[aria-selected=true]{background:#5b3fa0;color:#fff;border-color:#5b3fa0}.sp-opt[aria-selected=true] .sp-opt-sub{color:#e3d8ff}.sp-opt[aria-selected=true] .sp-opt-vis{color:#fff}
.sp-rowopt[aria-selected=true] .sp-opt-vis{background:rgba(255,255,255,.18)}
.sp-opt[aria-selected=true]::after{content:'✓';position:absolute;top:5px;right:9px;font-size:14px;line-height:1;font-weight:900;color:#ffd36e}
.sp-rowopt[aria-selected=true]::after{top:50%;margin-top:-7px}
.sp-switch{display:flex;align-items:center;gap:12px;width:100%;min-height:62px;padding:8px 14px;text-align:left}
.sp-switch .sp-opt-tx{flex:1;display:flex;flex-direction:column;gap:2px;min-width:0}
.sp-tog{flex:0 0 auto;position:relative;width:48px;height:28px;border-radius:14px;background:#d6c8ad;transition:background .15s}
.sp-tog::after{content:'';position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:left .15s}
.sp-switch[aria-checked=true] .sp-tog{background:#5b3fa0}.sp-switch[aria-checked=true] .sp-tog::after{left:23px}
.sp-switches{display:flex;flex-direction:column;gap:8px}
.sp-pk-note{flex:0 0 auto;margin:0;padding:0 18px 12px;font-size:12px;line-height:1.3;font-weight:700;color:#7d6b55}
.sp-pk-note:empty{display:none}
@media ${PHONE}{
 .sp-chips{position:fixed;left:calc(10px + env(safe-area-inset-left,0px));right:calc(10px + env(safe-area-inset-right,0px));top:var(--sp-top,104px);display:flex;flex-direction:column;flex-wrap:nowrap;gap:6px;align-items:stretch}
 .sp-row{display:flex;gap:6px;min-width:0}
 .sp-chip{min-height:44px;min-width:44px;gap:6px;padding:0 8px 0 5px;border-radius:22px;max-width:none;flex:0 1 auto;min-width:0}
 .sp-chip-vis{width:30px;height:30px}.sp-chip-vis img{width:30px;height:30px}
 .sp-chip-v{font-size:13px;line-height:16px}
 .sp-chip-caret{display:none}
 .sp-chip.icon{width:44px;flex:0 0 44px}
 .sp-chip.sp-song,.sp-chip.sp-stage{flex:1 1 0;max-width:none}
 .sp-chip.sp-singer,.sp-chip.sp-group,.sp-chip.sp-dance,.sp-chip.sp-time{flex:0 1 auto}
}
@media (max-height:480px) and (orientation:landscape){
 .sp-chips{flex-direction:row;flex-wrap:nowrap;justify-content:center}
 .sp-row{display:contents}
 .sp-chip.sp-song{flex:0 1 auto;max-width:190px}.sp-chip.sp-stage{flex:0 1 auto;max-width:160px}
 .sp-pk-head{padding:2px 4px 0 18px}.sp-tile{min-height:60px;padding:6px 4px;gap:2px}.sp-tile .sp-opt-vis img{width:40px;height:40px}.sp-tile .sp-opt-vis svg{width:24px;height:24px}
 .sp-rowopt{min-height:48px}.sp-switch{min-height:54px}
}
@media (max-width:370px){.sp-row:last-child .sp-chip:not(.icon) .sp-chip-vis{display:none}.sp-row:last-child .sp-chip:not(.icon){padding-left:12px}}
`;

/** An option shown as the chosen one (aria-selected; the Song list's rows: aria-pressed). */
const isSel = o => o.getAttribute('aria-selected') === 'true' || o.getAttribute('aria-pressed') === 'true';

/** Build the chips into the bar (before its hint line) and the one picker panel. -> Pickers */
export function mountPickers(sp) { return new Pickers(sp); }

export class Pickers {
  constructor(sp) {
    this.sp = sp; this.g = sp.g;
    this.open = null; this.via = null; this.padBar = false; this.eatUntil = 0; this.prev = {}; this.keys = new Map();
    if (!document.getElementById('singplayPickStyle')) {
      const st = document.createElement('style'); st.id = 'singplayPickStyle'; st.textContent = STYLE; document.head.appendChild(st);
    }
    // the chips
    const el = this.el = document.createElement('div');
    el.id = 'spChips'; el.className = 'sp-chips'; el.setAttribute('role', 'group'); el.setAttribute('aria-label', tx(N_('Show setup')));
    this.chips = new Map();
    for (const row of ROWS) {
      const r = document.createElement('div'); r.className = 'sp-row';
      for (const id of row) {
        const b = document.createElement('button');
        b.type = 'button'; b.id = `spChip-${id}`; b.className = `sp-chip sp-${id}${id === 'settings' ? ' icon' : ''}`; b.dataset.picker = id;
        b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-controls', 'spPicker');
        b.innerHTML = `<span class="sp-chip-vis"></span><span class="sp-chip-tx"><span class="sp-chip-k"></span><span class="sp-chip-v"></span></span><span class="sp-chip-caret">${ICONS.caret}</span>`;
        b.addEventListener('click', e => { e.stopPropagation(); this.g.audio?.click?.(); this.toggle(id, e.detail === 0 ? 'key' : 'pointer'); });
        r.appendChild(b); this.chips.set(id, b);
      }
      el.appendChild(r);
    }
    sp.bar.insertBefore(el, sp.hint || null);
    // the panel (one for every picker)
    const p = this.panel = document.createElement('div');
    p.id = 'spPicker'; p.hidden = true; p.setAttribute('role', 'dialog'); p.setAttribute('aria-labelledby', 'spPickerTitle');
    p.innerHTML = '<div class="sp-pk-head"><h2 id="spPickerTitle"></h2><button type="button" class="sp-pk-x">✕</button></div><div class="sp-pk-body"></div><p class="sp-pk-note" aria-live="polite"></p>';
    p.querySelector('.sp-pk-x').addEventListener('click', e => { e.stopPropagation(); this.g.audio?.click?.(); this.close('x'); });
    p.addEventListener('click', e => e.stopPropagation());
    document.body.appendChild(p);
    this.body = p.querySelector('.sp-pk-body');
    // a tap outside closes the open picker and does nothing else (a chip switches to its own picker)
    this.onDown = e => {
      if (!this.open) return;
      const t = e.target;
      if (p.contains(t) || t?.closest?.('.sp-chip')) return;
      this.close('outside'); this.eatUntil = performance.now() + 500;
      e.stopPropagation();
    };
    this.onEat = e => { if (performance.now() < this.eatUntil && !p.contains(e.target) && !e.target?.closest?.('.sp-chip')) { e.stopPropagation(); if (e.type === 'click') e.preventDefault(); } };
    document.addEventListener('pointerdown', this.onDown, true);
    for (const t of ['mousedown', 'touchstart', 'click']) document.addEventListener(t, this.onEat, { capture: true, passive: t !== 'click' });
    this.onKey = e => this.key(e);
    this.onResize = () => { this.layout(); this.sp.fitActions?.(); if (this.open) this.place(); };
    addEventListener('resize', this.onResize);
    this.ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { cancelAnimationFrame(this.roRaf); this.roRaf = requestAnimationFrame(() => this.layout()); }) : null;
    for (const t of [el, sp.bar, document.getElementById('objective'), document.getElementById('clock')]) if (t) this.ro?.observe(t);
    this.offLang = onLangChange(() => { el.setAttribute('aria-label', tx(N_('Show setup'))); this.keys.clear(); this.sp.label?.(); });
    this.refresh();
    this.layout();
  }

  phone() { return matchMedia(PHONE).matches; }

  /** The chips' faces (only what changed is written) and, when a picker is open, its options. */
  refresh() {
    for (const [id, b] of this.chips) {
      const c = chipData(this.sp, id), key = `${c.k}|${c.v}|${c.img || ''}|${c.svg?.length || 0}|${c.wait}`;
      if (this.keys.get(id) === key) continue;
      this.keys.set(id, key);
      const vis = b.querySelector('.sp-chip-vis');
      if (c.img) { let img = vis.querySelector('img'); if (!img) { vis.textContent = ''; img = document.createElement('img'); img.alt = ''; img.width = 34; img.height = 34; img.decoding = 'async'; img.draggable = false; vis.appendChild(img); } if (!img.src.endsWith(c.img)) img.src = c.img; }
      else vis.innerHTML = c.svg || '';
      b.querySelector('.sp-chip-k').textContent = c.k;
      b.querySelector('.sp-chip-v').textContent = c.v;
      b.setAttribute('aria-label', c.v ? `${c.k}: ${c.v}` : c.k);
      b.title = c.v ? `${c.k}: ${c.v}` : c.k;
      b.classList.toggle('wait', !!c.wait);
    }
    if (this.open) this.render(false);
  }

  toggle(id, via) { if (this.open === id) this.close('chip'); else this.show(id, via); }

  /** Open a picker (another one open closes first). via: 'pointer' | 'key' (a key, the pad or a script: focus moves in). */
  show(id, via = 'pointer') {
    if (this.sp.perf || !this.chips.has(id)) return false;
    if (this.open) this.close('switch');
    this.open = id; this.via = via;
    if (id === 'song') this.sp.library?.scan();   // (what the worker kept meanwhile, the room left: the list follows)
    const chip = this.chips.get(id);
    chip.setAttribute('aria-expanded', 'true');
    this.panel.dataset.picker = id;
    this.render(true);
    this.panel.hidden = false;
    this.place();
    addEventListener('keydown', this.onKey, true);
    this.hold();
    const sel = this.options().find(o => isSel(o) || o.getAttribute('role') === 'switch') || this.options()[0];
    sel?.focus({ preventScroll: true });
    sel?.scrollIntoView?.({ block: 'nearest' });
    if (via === 'pad') this.mark(sel);
    return true;
  }

  /** Close the open picker. how 'outside' (a tap elsewhere): the focus stays where the tap went; else back to its chip. */
  close(how = 'key') {
    const id = this.open; if (!id) return;
    this.open = null;
    this.panel.hidden = true;
    removeEventListener('keydown', this.onKey, true);
    const chip = this.chips.get(id);
    chip?.setAttribute('aria-expanded', 'false');
    if (how === 'outside') { if (this.panel.contains(document.activeElement)) document.activeElement.blur(); }
    else if (how !== 'switch' && chip?.getClientRects().length) { chip.focus({ preventScroll: true }); if (this.padBar) this.mark(chip); }
    this.hold();
  }

  /** The panel's title, options and note for the open picker (full: rebuilt; else only states and the note). */
  render(full) {
    const id = this.open, d = pickerData(this.sp, id);
    this.panel.querySelector('#spPickerTitle').textContent = tx(TITLES[id]);
    this.panel.querySelector('.sp-pk-x').setAttribute('aria-label', tx(N_('Close')));
    this.panel.style.setProperty('--pk-w', `${d.w}px`);
    const noteEl = this.panel.querySelector('.sp-pk-note'); if (noteEl.textContent !== (d.note || '')) noteEl.textContent = d.note || '';
    if (d.kind === 'songs') { (this.songView ||= new SongListView(this)).render(d, full); return; }   // (song-list.js)
    this.songView?.hide();
    const key = `${id}|${d.sections.map(s => s.label + s.items.map(i => i.id + i.name + i.sub).join()).join('/')}`;
    if (!full && key === this.bodyKey) {
      for (const it of d.sections.flatMap(s => s.items)) {
        const o = this.body.querySelector(`[data-opt="${CSS.escape(it.id)}"]`); if (!o) continue;
        if (d.kind === 'switches') o.setAttribute('aria-checked', String(!!it.on)); else o.setAttribute('aria-selected', String(!!it.selected));
        o.setAttribute('aria-disabled', String(!!it.disabled));
      }
      return;
    }
    const keep = this.panel.contains(document.activeElement) ? document.activeElement.dataset.opt : null;
    this.bodyKey = key;
    this.body.textContent = '';
    for (const s of d.sections) {
      const box = document.createElement('div');
      if (d.kind === 'switches') { box.className = 'sp-switches'; box.setAttribute('role', 'group'); box.setAttribute('aria-labelledby', 'spPickerTitle'); }
      else { box.className = d.kind === 'rows' ? 'sp-rows' : 'sp-tiles'; box.setAttribute('role', 'listbox'); box.setAttribute(s.label ? 'aria-label' : 'aria-labelledby', s.label || 'spPickerTitle'); }
      if (d.tile) box.style.setProperty('--tile', `${d.tile}px`);
      for (const it of s.items) box.appendChild(this.option(d.kind, it));
      if (s.label) { const h = document.createElement('div'); h.className = 'sp-pk-sec'; h.textContent = s.label; h.setAttribute('aria-hidden', 'true'); this.body.appendChild(h); }
      this.body.appendChild(box);
    }
    if (keep) this.body.querySelector(`[data-opt="${CSS.escape(keep)}"]`)?.focus({ preventScroll: true });
  }

  option(kind, it) {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.opt = it.id;
    b.className = `sp-opt ${kind === 'rows' ? 'sp-rowopt' : kind === 'switches' ? 'sp-switch' : 'sp-tile'}`;
    if (kind === 'switches') { b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', String(!!it.on)); }
    else { b.setAttribute('role', 'option'); b.setAttribute('aria-selected', String(!!it.selected)); }
    b.setAttribute('aria-disabled', String(!!it.disabled));
    const vis = document.createElement('span'); vis.className = 'sp-opt-vis';
    if (it.img) { const img = document.createElement('img'); img.src = it.img; img.alt = ''; img.width = 52; img.height = 52; img.decoding = 'async'; img.draggable = false; vis.appendChild(img); }
    else if (it.svg) vis.innerHTML = it.svg;
    const name = document.createElement('span'); name.className = 'sp-opt-name'; name.textContent = it.name;
    const sub = it.sub ? Object.assign(document.createElement('span'), { className: 'sp-opt-sub', textContent: it.sub }) : null;
    if (kind === 'tiles') { if (it.img || it.svg) b.appendChild(vis); b.appendChild(name); if (sub) b.appendChild(sub); }
    else {
      if (kind === 'rows') b.appendChild(vis);
      const t = document.createElement('span'); t.className = 'sp-opt-tx'; t.appendChild(name); if (sub) t.appendChild(sub); b.appendChild(t);
      if (kind === 'switches') { const tog = document.createElement('span'); tog.className = 'sp-tog'; tog.setAttribute('aria-hidden', 'true'); b.appendChild(tog); }
    }
    b.addEventListener('click', e => { e.stopPropagation(); this.pick(it.id, e.detail === 0); });
    return b;
  }

  /** A tap (or Enter / A) on an option: the choice's own handler; a choice closes the picker, a switch keeps it open. */
  pick(opt, byKey) {
    const sp = this.sp, id = this.open; if (!id) return;
    const o = this.body.querySelector(`[data-opt="${CSS.escape(opt)}"]`);
    if (o?.getAttribute('aria-disabled') === 'true') return;
    this.g.audio?.click?.();
    if (id === 'settings') { if (opt === 'lyrics') sp.toggleLyrics(); else if (opt === 'show') sp.toggleShow(); this.render(false); return; }
    if (id === 'singer') sp.pickSinger(opt);
    else if (id === 'song') sp.chooseSong(opt);
    else if (id === 'group') { if (!sp.perf) sp.setGroup(Number(opt)); }
    else if (id === 'dance') sp.setDance(opt);
    else if (id === 'stage') { const st = STAGES.find(s => s.id === opt); if (st) jump(sp, st).then(() => sp.label()); }
    else if (id === 'time') { if (!pickTime(sp, opt)) sp.ui.toast?.(tx(N_('Stop the song first'))); }
    this.close(byKey ? 'key' : 'pick');
    sp.label();
  }

  /** Where the panel goes: a sheet from the bottom on phones; on a PC a popover over (or under) its chip. */
  place() {
    const p = this.panel, sheet = this.phone();
    p.classList.toggle('sheet', sheet); p.classList.toggle('pop', !sheet);
    if (sheet) { p.style.left = p.style.top = p.style.maxHeight = ''; return; }
    const r = this.chips.get(this.open).getBoundingClientRect(), W = innerWidth, H = innerHeight;
    const topMin = parseFloat(document.body.style.getPropertyValue('--sp-top')) || 12;
    const above = r.top - 10 - topMin, below = H - r.bottom - 22, up = above >= Math.min(260, below) || above >= below;
    p.style.maxHeight = `${Math.max(160, Math.round(up ? above : below))}px`;
    p.style.top = '0px'; p.style.left = '0px';
    const w = p.offsetWidth, h = p.offsetHeight;
    p.style.left = `${Math.round(Math.min(Math.max(12, r.left + r.width / 2 - w / 2), W - 12 - w))}px`;
    p.style.top = `${Math.round(up ? r.top - 10 - h : r.bottom + 10)}px`;
  }

  /** The options of the open picker, in order. */
  options() { return [...this.body.querySelectorAll('.sp-opt')]; }
  /** Every control of the open picker in reading order (the Song list adds its tabs, header button and row buttons). */
  controls() { return this.open === 'song' && this.songView ? [...this.songView.controls(), ...this.body.querySelectorAll('.sp-opt,.sp-dl')] : this.options(); }

  /** Move the focus among the panel's controls (the options, then the close button) by their places. */
  move(dir, via) {
    const list = [...this.controls(), this.panel.querySelector('.sp-pk-x')].filter(o => o.getClientRects().length);
    const i = list.indexOf(document.activeElement);
    if (i < 0) { const s = list.find(o => o.classList.contains('sp-opt') && isSel(o)) || list[0]; s?.focus({ preventScroll: true }); s?.scrollIntoView?.({ block: 'nearest' }); if (via === 'pad') this.mark(s); return; }
    const j = navStep(list.map(o => o.getBoundingClientRect()), i, dir);
    if (j >= 0) { list[j].focus({ preventScroll: true }); list[j].scrollIntoView?.({ block: 'nearest' }); if (via === 'pad') this.mark(list[j]); }
  }

  /** Keys while a picker is open (capture: nothing reaches the game meanwhile). */
  key(e) {
    if (!this.open) return;
    const c = e.code, dirs = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' };
    e.stopImmediatePropagation();
    if (c === 'Escape' || c === 'Backspace') { e.preventDefault(); this.close('key'); return; }
    if (dirs[c]) { e.preventDefault(); this.move(dirs[c], 'key'); return; }
    if (c === 'Enter' || c === 'NumpadEnter' || c === 'Space') {
      e.preventDefault(); if (e.repeat) return;
      const a = document.activeElement;
      if (a && this.panel.contains(a)) a.click(); else this.move('down', 'key');
      return;
    }
    if (c === 'Home' || c === 'End') { e.preventDefault(); const o = this.options(), t = c === 'Home' ? o[0] : o[o.length - 1]; t?.focus({ preventScroll: true }); t?.scrollIntoView?.({ block: 'nearest' }); return; }
    if (c === 'Tab') {
      e.preventDefault();
      const all = [...this.panel.querySelectorAll('button')].filter(b => b.getClientRects().length), i = all.indexOf(document.activeElement), n = all.length;
      all[e.shiftKey ? (i <= 0 ? n - 1 : i - 1) : (i + 1) % n]?.focus();
    }
  }

  /** The gamepad, every frame (SingPlay.update; not while paused): see the top of this file. */
  pad() {
    const gp = [...(globalThis.navigator?.getGamepads?.() ?? [])].find(Boolean);
    if (!gp) { this.prev = {}; return; }
    const bt = i => !!gp.buttons[i]?.pressed, ax = gp.axes || [];
    const stick = this.open ? { up: ax[1] < -0.6, down: ax[1] > 0.6, left: ax[0] < -0.6, right: ax[0] > 0.6 } : {};
    const now = { a: bt(0), b: bt(1), lb: bt(4), rb: bt(5), up: bt(12) || !!stick.up, down: bt(13) || !!stick.down, left: bt(14) || !!stick.left, right: bt(15) || !!stick.right };
    const prev = this.prev, edge = k => now[k] && !prev[k];
    this.prev = now;
    const dirs = ['up', 'down', 'left', 'right'].filter(edge);
    if (this.open) {
      if (this.open === 'song' && (edge('lb') || edge('rb'))) { this.via = 'pad'; this.songView?.step(edge('lb') ? -1 : 1); return; }   // (the Song list's tabs)
      for (const d of dirs) this.move(d, 'pad');
      if (edge('a')) { const a = document.activeElement; if (a && this.panel.contains(a)) a.click(); else this.move('down', 'pad'); }
      else if (edge('b')) this.close('pad');
      return;
    }
    if (this.padBar) {
      // the stick takes her back: the bar lets go
      if (Math.hypot(ax[0] || 0, ax[1] || 0) > 0.5 || !this.sp.bar?.isConnected) { this.leaveBar(); return; }
      for (const d of dirs) this.moveBar(d);
      if (edge('a')) { const a = document.activeElement; if (a && this.sp.bar.contains(a)) a.click(); }
      else if (edge('b')) this.leaveBar();
      return;
    }
    if (dirs.length) this.enterBar();
  }

  /** The bar's controls a pad can reach now (chips while she is free, the actions). */
  barControls() { return [...this.sp.bar.querySelectorAll('button')].filter(b => b.getClientRects().length && getComputedStyle(b).visibility !== 'hidden'); }
  enterBar() {
    const list = this.barControls(); if (!list.length) return;
    const t = list.includes(this.lastBar) ? this.lastBar : list.find(b => b.id === 'spPerform') || list[0];
    this.padBar = true; t.focus({ preventScroll: true }); this.mark(t); this.hold();
  }
  moveBar(dir) {
    const list = this.barControls(), i = list.indexOf(document.activeElement);
    const j = i < 0 ? 0 : navStep(list.map(b => b.getBoundingClientRect()), i, dir);
    if (j >= 0 && list[j]) { list[j].focus({ preventScroll: true }); this.mark(list[j]); this.lastBar = list[j]; }
  }
  leaveBar() {
    this.padBar = false;
    for (const b of document.querySelectorAll('.pad')) b.classList.remove('pad');
    if (this.sp.bar?.contains(document.activeElement)) { this.lastBar = document.activeElement; document.activeElement.blur(); }
    this.hold();
  }
  /** The pad's ring on one control (programmatic focus shows no ring after a tap: this one always does). */
  mark(el) { for (const b of document.querySelectorAll('.sp-chip.pad,.sp-opt.pad,.sp-act.pad,.sp-tab.pad,.sp-dl.pad,.sp-all.pad')) b.classList.remove('pad'); el?.classList.add('pad'); }

  /** The game's keys, pad and stick stay off her while a picker is open or the pad is on the bar (game.js inputHold). */
  hold() { this.g.inputHold = !!(this.open || this.padBar); }

  /**
   * CSS numbers for the layout (on body): --sp-top where the phone chips start (under the objective, the little map and
   * its buttons), --sp-below under them (the phone sheet's top limit, the toasts), --sp-clear the room the bottom stack
   * takes (the interaction prompt goes over it).
   */
  layout() {
    const B = document.body, vh = innerHeight;
    if (!B || !this.sp.bar?.isConnected) return;
    const bottomOf = id => { const e = document.getElementById(id), r = e?.getBoundingClientRect(); return r && r.height > 0 && r.top < vh * 0.4 ? r.bottom : 0; };
    const top = Math.max(bottomOf('objective'), bottomOf('clock'), bottomOf('btnMenu'), bottomOf('btnJournal')) + 8;
    const phone = this.phone(), cr = this.el.getBoundingClientRect();
    const below = phone && cr.height ? cr.bottom + 8 : top;
    let high = vh;
    for (const e of this.sp.bar.children) { if (phone && e === this.el) continue; const r = e.getBoundingClientRect(); if (r.height > 0) high = Math.min(high, r.top); }
    const set = (k, v) => { const s = `${Math.round(v)}px`; if (B.style.getPropertyValue(k) !== s) B.style.setProperty(k, s); };
    set('--sp-top', top); set('--sp-below', below); set('--sp-clear', vh - high + 8);
  }

  /** The mode closed (or a song starts): nothing open, the pad off the bar. */
  reset() { this.close('outside'); if (this.padBar) this.leaveBar(); }

  dispose() {
    this.reset();
    document.removeEventListener('pointerdown', this.onDown, true);
    for (const t of ['mousedown', 'touchstart', 'click']) document.removeEventListener(t, this.onEat, true);
    removeEventListener('resize', this.onResize);
    this.ro?.disconnect(); this.offLang?.();
    this.panel.remove(); this.el.remove();
  }
}
