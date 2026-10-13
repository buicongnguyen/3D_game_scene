// From seed to harvest: a thinking game about the crops of the valley. Mika sits down at the edge of the rice paddies
// with her teacher, who lays out picture cards: put a crop's life in order, find the missing card, spot the stranger,
// read the year wheel (how long is it in the field?), say what a crop needs, which part we eat and what is made from
// it, and (Difficult) plan a field: what to plant now for a festival, and what follows what through a year. No
// reflexes, no clock on screen: look, think, choose.
//
// A sibling of "From egg to wings": the board, the seated teacher and the camera shot are lifecycle.js (makeBoard,
// playCards); this file only hands them its kit. The rules and the data are rules-crops.js, the pictures crops-art.js.
import { N_, tx } from '../../i18n/i18n.js';
import { addCss } from './util.js';
import { playCards } from './lifecycle.js';
import { creatureOf } from './lifecycle-art.js';
import { makeRound, check, solve, explain, CARD, CROP, pointsFor, MAX_MISSES, quickBonus } from './rules-crops.js';
import { cardSvg, wheelSvg, CROP_COLOUR } from './crops-art.js';

// the year wheel and its legend, over the cards of the shared board (#lifeBoard .ban; --wh is set by the board's fit)
const CSS = `
#lifeBoard .ban .wheel{display:block;width:var(--wh,180px);height:var(--wh,180px)}
#lifeBoard .ban .lg{display:flex;flex-wrap:wrap;justify-content:center;gap:2px 12px;font:700 13px Nunito,system-ui,sans-serif;color:#5a3a22}
#lifeBoard .ban .lg span{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
#lifeBoard .ban .lg i{width:13px;height:13px;border-radius:4px;box-shadow:inset 0 0 0 1.5px #5a3a22}
`;

const INTRO = {
  sora: N_('Sit down by me, Mi-chan. These are my field cards: how rice, wheat and potatoes grow, from seed to harvest.'),
  rin: N_("Sit down, city girl. These are Sora's field cards: how rice, wheat and potatoes grow, from seed to harvest."),
};
const INTRO_2 = N_('Nobody is counting the seconds. Look at the pictures, think, and then choose.');
// the guided first play: what the teacher says as each of the first puzzles is laid out
const GUIDE = [
  N_('Rice grows all summer long. Pick the cards one by one, from first to last. The seeds come first!'),
  N_('Now one card is missing from the row. Pick the card that fills the gap, then press Check.'),
  N_('You have got it! The next ones are all yours. A wrong answer is fine: just think and try again.'),
];
const HINT = {
  order: N_('Pick a card to lay it in the row. Pick it again to take it back.'),
  choice: N_('Pick a card, then press Check.'),
};
// the camera stands a little higher than for the animal cards: it looks over the bank at the paddies behind the two
const RISE = 2.9;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** What this game brings to the card board (lifecycle.js LIFE_KIT is the other one). */
export const CROPS_KIT = {
  check, solve, explain, pointsFor, MAX_MISSES, cardSvg,
  nameOf: id => CARD[id]?.name || '',
  // the stage cards lose their names on Difficult; a crop, a need, a part of the plant and a food are always named
  alwaysLabel: id => CARD[id]?.kind !== 'stage',
  labelled: p => (p.choices || []).some(c => CARD[c]?.kind !== 'stage'),
  /** The question, with the month and the festival it names (each translated by itself). */
  prompt: p => tx(p.prompt, p.vars ? Object.fromEntries(Object.entries(p.vars).map(([k, v]) => [k, tx(v)])) : undefined),
  /** The year wheel over the cards, with the crops' colours named under it. */
  banner(p) {
    if (!p.wheel) return '';
    const legend = p.wheel.legend ? `<div class="lg">${p.wheel.arcs.filter(a => a.crop).map(a => `<span><i style="background:${CROP_COLOUR[a.crop]}"></i>${esc(tx(CROP[a.crop].name))}</span>`).join('')}</div>` : '';
    return wheelSvg(p.wheel) + legend;
  },
  // a butterfly crosses the field after an answer right at the first try
  celebrate: () => ({ svg: creatureOf('butterfly.adult'), hop: false }),
  guide: GUIDE,
  hint: HINT,
};

export default {
  id: 'crops',
  async play(ctx) {
    addCss('cropsCss', CSS);
    // (a QA script may name the seed, so a run can be repeated)
    const seed = (typeof window !== 'undefined' && window.__STARLINE_QA__?.seed) || Math.floor(Math.random() * 2 ** 31) + 1;
    const round = makeRound({ level: ctx.level, seed, first: ctx.first });
    return playCards(ctx, { round, seed, kit: CROPS_KIT, intro: [INTRO[ctx.teacher] || INTRO.sora, INTRO_2], bonusFor: quickBonus, debug: 'crops', rise: RISE });
  },
};
