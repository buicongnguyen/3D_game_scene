// The journal's star groups: the figure and story of every group learned, a "?" for the others with the season to look in.
import { profileFor, groupsFor, textOf, seasonsOf, shapeSvg, cleanStarGroups } from '../content/constellations.js';

const SEASON_NAME = { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' };

/** HTML for the section. rec: the save's starGroups; lang: the language (its sky profile); tx, esc: the UI's helpers. */
export function starGroupsHtml(rec, lang, tx, esc) {
  const profile = profileFor(lang), list = groupsFor(profile), learned = cleanStarGroups(rec).learned.filter(id => list.some(g => g.id === id));
  const cards = list.map(g => {
    const got = learned.includes(g.id), t = textOf(g, profile, tx);
    const when = seasonsOf(g, profile).map(s => tx(SEASON_NAME[s])).join(' · ');
    return `<div class="sgc${got ? '' : ' locked'}">${shapeSvg(g, got, 64)}<div><b>${esc(got ? t.name : '?')}</b><small>${esc(got ? t.story : tx('Look for it on {when} evenings.', { when }))}</small></div></div>`;
  }).join('');
  return `<h3>${esc(tx('Star groups'))} · ${learned.length} / ${list.length}</h3><p>${esc(tx('Look up at the sky at night, pick a star group and read about it to learn it.'))}</p><div class="sgcards">${cards}</div>`;
}
