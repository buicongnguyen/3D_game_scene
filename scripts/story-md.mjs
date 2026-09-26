// Regenerate the script appendix of docs/STORY.md from src/game/story.js, so the printed story is exactly
// what the game plays. The hand-written part of STORY.md is kept; only the text between the markers changes.
//   node scripts/story-md.mjs           (npm run story:md) rewrite the appendix
//   node scripts/story-md.mjs --check   exit 1 if docs/STORY.md is out of date
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CAST, ITEMS, CHAPTERS, DIALOGUE, CHATTER, JOURNAL, STAR_POEM, FISH, STEPS } from '../src/game/story.js';
import { FALLEN_STARS } from '../src/world/layout.js';

const DOC = fileURLToPath(new URL('../docs/STORY.md', import.meta.url));
const START = '<!-- story-md:start -->';
const END = '<!-- story-md:end -->';

// Lines the director plays outside the step effects (hints, hits, the ferry), placed where they happen.
const DURING = {
  'c1.cogs': [['c1_crab', 'When Mika gets near the crab'], ['c1_crab_hit', 'When Tamo boops the crab']],
  'c2.ferry': [['ferry_ride', 'On the ferry (Mika may also swim across)']],
  'c3.gather': [['c3_hive_hit', 'When the hive drops']],
};
const BARKS = [
  ['ferry_locked', "Rin's ferry, before the Mill Lamp is lit"],
  ['drawbridge_up', 'The raised drawbridge, before the wheel turns'],
  ['tower_locked', 'The bell-tower door, without the key'],
  ['gate_locked', 'The upper orchard gate, before it is opened'],
  ['bear_blocked', 'The sleeping bear, before the honey chestnuts'],
  ['gap_blocked', 'The broken viaduct span'],
];
const CUTSCENES = {
  arrival: 'A little red engine winds down the valley toward Hoshi Station.',
  tamoWakes: 'Mika lifts the lid. Sparks burst out of the chest.',
  wheelTurns: 'Mika hammers the cogs into place.',
  bearWakes: 'Ōkuma wakes.',
  meeting: 'Kawabe and Takamori gather on the snowy platform.',
  relay: 'Down the river, Forest, Mill, Orchard and Viaduct burn one after another.',
  starTrain: 'The Star Train, Kobo hung with lanterns, leaves Hoshi Station with both villages aboard.',
  finale: 'Meteors, Takamori fireworks and Kawabe lantern boats fill the valley.',
  farewell: 'Tamo rises into the Viaduct Lamp. Credits.',
};
const UNLOCKS = {
  drawbridge: 'The drawbridge to the mill island comes down.',
  ferry: "Rin's ferry now crosses the river.",
  orchardGate: 'The upper orchard gate opens.',
  shrineStairs: 'The shrine steps are clear.',
  viaduct: 'The viaduct is whole again.',
};

const used = new Set();
const out = [];
const put = (...lines) => out.push(...lines);
const stage = s => put(`> *${s}*`, '');
const name = who => CAST[who]?.name || who;
const objective = s => s.replace(/\s*\(\{\w+\}\/\d+\)/g, '');
const choiceLine = () => Object.values(DIALOGUE).flat().find(l => l.choice);
const hourWord = (h, prev) => (h < prev ? 'the next morning' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 18 ? 'evening' : h < 19.5 ? 'dusk' : 'nightfall');

function dialogue(id, label) {
  const lines = DIALOGUE[id];
  if (!lines) throw new Error(`missing dialogue ${id}`);
  used.add(id);
  if (label) put(`*${label}:*`, '');
  for (const l of lines) {
    if (l.choice) {
      put('> **Choice**', '>');
      l.choice.forEach((c, i) => put(`> ${i + 1}. ${c.text}`));
      put('');
      for (const c of l.choice) dialogue(`${id.split('_')[0]}_choice_${c.value}`, `If Mika says ${c.text}`);
      continue;
    }
    const [who, text] = l;
    put(who === 'narrator' ? `*${text}*` : `**${name(who)}:** ${text}`, '');
  }
}

let hour = null;
/** Render step effects; returns true if any dialogue was printed. */
function effects(list) {
  let said = false, branched = false;
  for (const e of list || []) {
    if (e.say) { dialogue(e.say, branched ? 'Then, either way' : null); said = true; branched = false; }
    else if (e.sayChoice) {
      for (const c of choiceLine().choice) dialogue(`${e.sayChoice}_${c.value}`, `If Mika chose ${c.text}`);
      said = branched = true;
    } else if (e.cutscene && CUTSCENES[e.cutscene]) stage(CUTSCENES[e.cutscene]);
    else if (e.lamp) stage(`The ${e.lamp[0].toUpperCase()}${e.lamp.slice(1)} Lamp is lit.`);
    else if (e.unlock && UNLOCKS[e.unlock]) stage(UNLOCKS[e.unlock]);
    else if (e.journal !== undefined) stage(`Journal page ${e.journal + 1} added: “${JOURNAL[e.journal].title}”.`);
    else if (e.give) stage(`Mika receives: ${ITEMS[e.give[0]].name}.`);
    else if (e.time !== undefined) hour = e.time;
    else if (e.timelapse !== undefined) { stage(`Time passes to ${hourWord(e.timelapse, hour ?? 0)}.`); hour = e.timelapse; }
  }
  return said;
}

// ---------------------------------------------------------------- Appendix A: the script
put('## Appendix A · The complete script', '');
put('Every line in the order the game plays it, grouped by chapter and quest step (the objective the player sees,',
  'then its step id). Narration is in italics; stage directions are quoted.', '');
let chapter = -1;
for (const s of STEPS) {
  if (s.chapter !== chapter) {
    chapter = s.chapter;
    const c = CHAPTERS[chapter];
    put(`### ${c.title}: ${c.name}`, '');
  }
  put(`#### ${objective(s.objective)} · \`${s.id}\``, '');
  const intro = effects(s.enter);
  const talks = Object.entries(s.talk || {});
  for (const [who, t] of talks) dialogue(typeof t === 'string' ? t : t.say, talks.length > 1 || intro ? `Talking to ${name(who)}` : null);
  for (const [id, label] of DURING[s.id] || []) dialogue(id, label);
  // when lines came before the player acts (and it isn't a conversation), mark where the step is completed
  const mark = out.length;
  if (effects(s.exit) && !talks.length && (intro || DURING[s.id])) out.splice(mark, 0, `> *${objective(s.objective)}: done.*`, '');
}

put('### Blocked paths', '', 'What Mika hears when she tries a way that is not open yet.', '');
for (const [id, label] of BARKS) dialogue(id, label);
used.add('sora_last_letter');
const rest = Object.keys(DIALOGUE).filter(id => !used.has(id));
if (rest.length) {
  console.warn(`story-md: dialogue not placed in the script, listed at the end: ${rest.join(', ')}`);
  put('### Other lines', '');
  for (const id of rest) dialogue(id, `\`${id}\``);
}

// ---------------------------------------------------------------- Appendix B: letters and pages
put('## Appendix B · Sora\'s letters and journal pages', '');
put('### The letter in the chest (Prologue)', '');
for (const l of DIALOGUE.p_letter.filter(l => l[0] === 'sora')) put(`> ${l[1]}`, '>');
out.pop();
put('');
put('### The journal', '');
JOURNAL.forEach((p, i) => {
  const step = STEPS.find(s => (s.exit || []).some(e => e.journal === i));
  const where = step ? `${CHAPTERS[step.chapter].title}, on “${objective(step.objective)}”` : 'not given in the story';
  put(`**${p.title}** — found in ${where}.`, '', `> ${p.text}`, '');
});
put('### The last letter (all twelve Fallen Stars)', '');
for (const l of DIALOGUE.sora_last_letter) put(`> ${l[1]}`, '>');
out.pop();
put('');

// ---------------------------------------------------------------- Appendix C: poem and stars
put('## Appendix C · The star poem and the twelve Fallen Stars', '');
put('Each Fallen Star holds one line of Sora\'s poem. The journal shows the hiding place until the star is found.', '');
put('| # | Hiding place | Line of the poem |', '|---|---|---|');
FALLEN_STARS.forEach((s, i) => put(`| ${i + 1} | ${s.hint} | ${STAR_POEM[i] ?? ''} |`));
put('', 'The whole poem:', '');
for (let i = 0; i < STAR_POEM.length; i += 4) put(...STAR_POEM.slice(i, i + 4).map((l, j) => `> ${l}${j < 3 ? '<br>' : ''}`), '>');
out.pop();
put('');

// ---------------------------------------------------------------- Appendix D: fish and items
put('## Appendix D · Fish and story items', '');
put('Fishing opens at Kawabe Dock in Chapter One and stays open. Any catch counts toward Rin\'s three fish.', '');
put('| Fish | When it bites |', '|---|---|');
for (const f of Object.values(FISH)) put(`| ${f.name} | ${f.dusk ? 'Only at dusk' : 'Any time'} |`);
put('');
const gives = new Map();
for (const s of STEPS) for (const e of s.exit || []) if (e.give && !gives.has(e.give[0])) gives.set(e.give[0], s);
const PICKED = { cog: 'c1.cogs', peach: 'c2.peaches', chestnut: 'c3.gather', mushroom: 'c3.gather', honeycomb: 'c3.gather' };
put('| Item | How Mika gets it |', '|---|---|');
for (const [k, it] of Object.entries(ITEMS)) {
  const st = gives.get(k) || STEPS.find(s => s.id === PICKED[k]);
  if (k === 'fish') put(`| ${it.name} | Caught at the dock (Chapter One) |`);
  else if (st) put(`| ${it.name} | ${gives.has(k) ? 'Given' : 'Picked up'} on “${objective(st.objective)}” |`);
}
put('');

// ---------------------------------------------------------------- Appendix E: chatter
put('## Appendix E · Idle chatter', '');
put('What the cast says when there is nothing story-related to talk about. The lines rotate in every chapter.', '');
for (const [who, lines] of Object.entries(CHATTER)) put(`**${name(who)}:** ${lines.map(l => `“${l[0]}”`).join(' · ')}`, '');

// ---------------------------------------------------------------- write
while (out[out.length - 1] === '') out.pop();
const body = `${START}\n<!-- Generated by scripts/story-md.mjs from src/game/story.js. Edit the story there, then run npm run story:md. -->\n\n${out.join('\n')}\n${END}`;
const doc = readFileSync(DOC, 'utf8');
const a = doc.indexOf(START), b = doc.indexOf(END);
if (a < 0 || b < a) throw new Error(`docs/STORY.md needs the markers ${START} and ${END}`);
const next = doc.slice(0, a) + body + doc.slice(b + END.length);
if (process.argv.includes('--check')) {
  if (next !== doc) { console.error('docs/STORY.md is out of date: run npm run story:md'); process.exit(1); }
  console.log('docs/STORY.md is up to date');
} else {
  writeFileSync(DOC, next);
  console.log(`docs/STORY.md: script appendix regenerated (${Object.keys(DIALOGUE).length} dialogues, ${STEPS.length} steps)`);
}
