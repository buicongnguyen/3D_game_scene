// Collects every player-facing English string into src/i18n/source.json (the translators' source) and
// reports coverage of each language pack. English strings are the keys (see src/i18n/i18n.js).
//   node scripts/i18n-extract.mjs            write source.json + print coverage
//   node scripts/i18n-extract.mjs --check    exit 1 if any pack misses a string or breaks a placeholder
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAST, ITEMS, CHAPTERS, DIALOGUE, CHATTER, JOURNAL, STAR_POEM, FISH, STEPS, CAPTIONS, FRIENDS, KEEPSAKES, ALBUM, TREASURES, SKY_LETTERS, GIFTS, HUNT } from '../src/game/story.js';
import { FALLEN_STARS, LAMPS } from '../src/world/layout.js';
import { BARKS } from '../src/content/barks.js';
import { PEOPLE } from '../src/content/townsfolk.js';
import { GOODS, ERRANDS, SHOPS } from '../src/content/shops.js';
import { CONVOS } from '../src/content/convos.js';
import { HOTSPOTS, MEMORIES } from '../src/content/hotspots.js';
import { STORIES, useStory } from '../src/game/stories/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LANGS = ['vi', 'ko', 'ja'];

export function collect() {
  const out = new Map();
  const add = (s, ctx) => {
    if (typeof s !== 'string' || !s.trim()) return;
    const e = out.get(s) || { s, ctx: [] };
    if (ctx && !e.ctx.includes(ctx) && e.ctx.length < 3) e.ctx.push(ctx);
    out.set(s, e);
  };
  // the story tables are read once per story: Classic, then the Grandma story swapped in (stories/index.js)
  for (const story of ['classic', 'grandma']) {
  useStory(story);
  for (const [id, c] of Object.entries(CAST)) add(c.name, `character name (${id})`);
  for (const it of Object.values(ITEMS)) add(it.name, 'inventory item');
  for (const c of CHAPTERS) { add(c.title, 'chapter label'); add(c.name, 'chapter name'); }
  for (const [id, lines] of Object.entries(DIALOGUE)) {
    for (const l of lines) {
      if (l.choice) for (const o of l.choice) add(o.text, `dialogue ${id}: Mika's answer choice`);
      else add(l[1], `dialogue ${id}, spoken by ${CAST[l[0]]?.name || l[0]}`);
    }
  }
  for (const [who, list] of Object.entries(CHATTER)) for (const l of list) add(l[0], `small talk by ${CAST[who]?.name || who}`);
  for (const p of JOURNAL) { add(p.title, "Sora's journal page title"); add(p.text, "Sora's journal page (her handwriting)"); }
  for (const l of STAR_POEM) add(l, "Sora's star poem, one line (12 lines rhyme in pairs)");
  for (const f of Object.values(FISH)) { add(f.name, 'fish species'); add(f.hint, 'fish log: where/when it bites'); add(f.desc, 'fish log: one-line description'); }
  for (const c of CAPTIONS.arrival) add(c, 'cinematic caption across the top while the train arrives (narration)');
  for (const c of CAPTIONS.ride) add(c.text, 'cinematic caption across the top during the Star Train ride (narration)');
  for (const c of CAPTIONS.tour) add(c.text, 'caption across the top while Mika rides the Sunday train in the epilogue (narration)');
  for (const k of [1, 2, 3, 4]) for (const c of CAPTIONS[`flight${k}`]) add(c.text, `caption across the top during the slow flight over the valley at the end of chapter ${k}'s celebration (narration)`);
  for (const c of CAPTIONS.theEnd) add(c.text, 'caption across the top as the camera rises over the starlit valley at the very end of the game (narration)');
  for (const f of FRIENDS) { add(f.name, 'animal friend name'); add(f.verb, 'interaction prompt shown next to the E key'); add(f.desc, 'animal friend: description'); add(f.hint, 'animal friend: where to find it'); }
  for (const a of ALBUM) add(a.title, 'photo album caption (a chapter\'s celebration photo)');
  for (const t of TREASURES) { add(t.name, 'treasure name'); add(t.hint, 'treasure: where to look (journal hint)'); add(t.text, 'treasure: journal description'); }
  for (const l of SKY_LETTERS) add(l.name, "where one of Sora's Sky Letters is hidden (journal)");
  for (const g of GIFTS) add(g.name, "a thank-you gift in Sora's cottage");
  for (const h of HUNT) add(h.name, "a treasure of the epilogue's treasure hunt (journal map label)");
  for (const k of KEEPSAKES) { add(k.name, 'keepsake name'); add(k.text, 'keepsake description (journal)'); add(k.where, 'the home a keepsake is in'); }
  for (const s of STEPS) {
    add(s.objective, 'quest objective (keep {placeholders} exactly)');
    if (s.hunt) add(s.hunt, 'quest objective during the treasure hunt (keep {placeholders} exactly)');
    if (s.huntDone) add(s.huntDone, 'quest objective once every treasure is found');
    for (const e of [...(s.enter || []), ...(s.exit || [])]) if (e.toast) add(e.toast, 'toast');
  }
  }
  useStory('classic');
  for (const s of FALLEN_STARS) add(s.hint, 'where a fallen star hides (journal hint)');
  for (const l of LAMPS) add(l.name, 'Star Lamp name');
  // barks: one-line remarks people call out as Mika walks past (a speech bubble over their head, a few seconds)
  for (const b of BARKS) add(b.text, `bark by ${b.who === 'any' ? 'any villager' : b.who === 'kid' ? 'a child' : CAST[b.who]?.name || b.who}`);
  // Town Life: the named neighbours, their stories, the shops and the conversations Mika overhears
  for (const p of PEOPLE) {
    add(p.name, "a neighbour's name"); add(p.role, `what ${p.name} does (journal)`);
    for (const s0 of p.story || []) for (const s of [s0, s0.grandma].filter(Boolean)) {
      for (const l of s.lines || []) add(l[1], `${p.name}'s story, said by ${CAST[l[0]]?.name || l[0]}`);
      for (const l of s.askLines || []) add(l[1], `${p.name} asks Mika for something`);
      add(s.ask, `${p.name} asks Mika for something (also shown in the journal)`); add(s.journal, `journal note on ${p.name}`);
    }
    for (const c of [...(p.chatter || []), ...(p.chatterGrandma || [])]) add(c, `${p.name}, small talk`);
  }
  for (const g of Object.values(GOODS)) { add(g.name, 'shop goods'); add(g.desc, 'shop goods description'); }
  for (const g of Object.values(ERRANDS)) add(g.name, 'an errand item Mika carries for a neighbour');
  for (const s of Object.values(SHOPS).flatMap(x => [x, x.grandma ? { ...x, ...x.grandma } : null]).filter(Boolean)) {
    add(s.name, 'shop name');
    for (const k of ['hello', 'bye', 'broke']) for (const l of s[k] || []) add(l, `shopkeeper (${s.name}): ${k}`);
    for (const l of Object.values(s.thanks || {})) add(l, `shopkeeper (${s.name}) after a sale`);
  }
  for (const c of CONVOS) for (const l of c.lines) add(l[1], 'overheard conversation between two villagers (speech bubble, short)');
  for (const s of Object.values(STORIES)) { add(s.name, 'story name (New Game choice, Settings)'); add(s.blurb, 'story description (New Game choice)'); }
  // indoors: what Mika can do in each room (prompts), what she thinks there, and the house memories
  for (const [room, list] of Object.entries(HOTSPOTS)) for (const h of list) {
    add(h.label, `prompt: something Mika can do inside (${room})`);
    const groups = Object.entries(h.lines || {}).flatMap(([k, v]) => (k === 'grandma' ? Object.values(v) : [v]));
    for (const lines of groups) for (const l of lines) add(l, `Mika's thought indoors (${room}, ${h.kind})`);
  }
  for (const m of Object.values(MEMORIES)) for (const v of [m, m.grandma].filter(Boolean)) { add(v.name, 'house memory: a small found object (journal)'); add(v.text, 'house memory description (journal)'); }

  // UI strings: tx('…') literals and interaction labels in the source, data-i18n markup in index.html
  const files = [];
  const walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.js$/.test(f.name)) files.push(p); } };
  walk(path.join(ROOT, 'src'));
  const lit = `'((?:[^'\\\\]|\\\\.)*)'|"((?:[^"\\\\]|\\\\.)*)"`;
  const unq = m => (m[1] ?? m[2]).replace(/\\'/g, "'").replace(/\\"/g, '"');
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    for (const m of src.matchAll(new RegExp(`\\b(?:tx|N_)\\(\\s*(?:${lit})`, 'g'))) add(unq(m), `UI (${rel})`);
    // interact(id, pos, 'label', …) / target(id, pos, 'label', …) / d.target(…)
    for (const m of src.matchAll(new RegExp(`\\b(?:interact|target)\\(\\s*[^,]+,\\s*[^,]+,\\s*(?:${lit})`, 'g'))) add(unq(m), 'interaction prompt shown next to the E key');
    // loading-screen labels
    for (const m of src.matchAll(new RegExp(`onProgress\\(\\s*[^,]+,\\s*(?:${lit})`, 'g'))) add(unq(m), 'loading screen');
  }
  // minigame titles live in a small table
  const mg = fs.readFileSync(path.join(ROOT, 'src/game/minigames.js'), 'utf8');
  const titles = mg.match(/get title\(\) \{[\s\S]*?\}\[this\.phase\]/);
  if (titles) for (const m of titles[0].matchAll(new RegExp(lit, 'g'))) add(unq(m), 'fishing minigame title');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const m of html.matchAll(/<(\w+)[^>]*\sdata-i18n(?=[\s>])[^>]*>([^<]*)</g)) add(m[2].trim().replace(/&amp;/g, '&'), 'menu / screen text');
  for (const m of html.matchAll(/aria-label="([^"]+)"[^>]*data-i18n-aria/g)) add(m[1], 'button label (screen readers)');
  return [...out.values()];
}

const placeholders = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');

export function coverage(source) {
  const res = {};
  for (const l of LANGS) {
    const p = path.join(ROOT, 'src/i18n', `${l}.json`);
    const pack = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
    const missing = source.filter(e => !pack[e.s]);
    const badPh = source.filter(e => pack[e.s] && placeholders(pack[e.s]) !== placeholders(e.s));
    const stale = Object.keys(pack).filter(k => !source.some(e => e.s === k));
    res[l] = { total: source.length, missing, badPh, stale };
  }
  return res;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = collect();
  const check = process.argv.includes('--check');
  if (!check) {
    fs.writeFileSync(path.join(ROOT, 'src/i18n/source.json'), JSON.stringify(source, null, 1) + '\n');
    console.log(`source.json: ${source.length} strings, ${source.reduce((a, e) => a + e.s.length, 0)} characters`);
  }
  let bad = 0;
  for (const [l, r] of Object.entries(coverage(source))) {
    console.log(`${l}: ${r.total - r.missing.length}/${r.total} translated, ${r.badPh.length} placeholder mismatches, ${r.stale.length} stale`);
    if (r.missing.length && r.missing.length < 12) for (const m of r.missing) console.log(`   missing: ${m.s}`);
    for (const m of r.badPh.slice(0, 10)) console.log(`   placeholders differ: ${m.s}`);
    bad += r.missing.length + r.badPh.length;
  }
  if (check && bad) process.exit(1);
}
