// © 2026 Bui Cong Nguyen · solluxlabs.com
// The group performance (game/perform/troupe.js): Kotone and the other seven VRoid Project sample characters (built
// like her by art/blender/vroid_mixamo.py --member: one mesh, one material, the 69-bone Mixamo skeleton, three face
// morphs; models and packs fetched only when a group performs). Two rows of four facing the camera, each row ONE group
// that dances in unison: the front row copies Kotone's dance (her own mixer and song plan), the back row copies its
// source (the one at nam-1's place: a mixer playing nam-1's Club bake, a second routine from the same song plan).
// Licence: VRoid Hub (commercial use, modification and redistribution allowed; credited "VRoid Project" in the Credits).
//
//   file    the model stem (public/models/<file>.glb, <file>.lite.glb on Low)
//   h       height in metres (top of the hair to the soles, as built)
//   gait    her Walk / Run ground speed at speed 1 (m/s; the build's own measure, the GLB's asset extras `gait`)
//   row     0 front, 1 back; x, z the place in metres from the formation's centre (+z toward the camera)
//   lead    the lead's place (the singer with the mic: the player's body in Sing & Play)
//   source  this member's rig is evaluated (one mixer for the row); the others copy its bones
//   pack    the clip pack that source plays
//
// Any member can sing lead (Sing & Play's Singer row, 2026-11-28): the lead's place and the front row's source are not
// tied to Kotone. castOf(lead) puts the picked singer at the lead's place and Kotone at the singer's own place, where she
// still is the front row's source: her moves pack is the only front-row pack, so the lead copies Kotone's evaluated
// rig like any follower (game/perform/troupe.js leadSource). A singer from the back row: Kotone takes the outer
// front-row place and its girl goes to the singer's place, so Kotone is in every group of 4 or 8; whoever stands at
// nam-1's place plays nam-1's pack (made ready for her own body). No new files: only the two packs there are.

export const KOTONE = 'kotone';
export const BACK_PACK = 'moves-vroid-nam1';

export const TROUPE = Object.freeze([
  // front row (group A): Kotone sings lead with the hand mic, the girls copy her dance and sing along on the choruses
  { id: 'nu-3', file: 'vroid-nu3', h: 1.645, gait: { walk: .987, run: 4.203 }, row: 0, x: -2.25, z: 0 },
  { id: 'kotone', file: 'kotone', h: 1.616, gait: { walk: .958, run: 4.077 }, row: 0, x: -.75, z: .35, source: true, lead: true, pack: 'moves-kotone' },
  { id: 'nu-1', file: 'vroid-nu1', h: 1.598, gait: { walk: .958, run: 4.077 }, row: 0, x: .75, z: 0 },
  { id: 'nu-4', file: 'vroid-nu4', h: 1.668, gait: { walk: .963, run: 4.095 }, row: 0, x: 2.25, z: 0 },
  // back row (group B), 1.8 m behind, between and outside the front row's shoulders so every face shows
  { id: 'nu-5', file: 'vroid-nu5', h: 1.737, gait: { walk: 1.04, run: 4.414 }, row: 1, x: -3.0, z: -1.8 },
  { id: 'nam-1', file: 'vroid-nam1', h: 1.713, gait: { walk: 1.028, run: 4.376 }, row: 1, x: -1.5, z: -1.8, source: true, pack: BACK_PACK },
  { id: 'nam-3', file: 'vroid-nam3', h: 1.761, gait: { walk: 1.028, run: 4.376 }, row: 1, x: 1.5, z: -1.8 },
  { id: 'nam-2', file: 'vroid-nam2', h: 1.735, gait: { walk: 1.099, run: 4.684 }, row: 1, x: 3.0, z: -1.8 },
].map(m => Object.freeze({ ...m, gait: Object.freeze(m.gait) })));

/** The singers in the Singer row's order (Kotone first, then the girls, then the boys). */
export const SINGERS = Object.freeze(['kotone', 'nu-1', 'nu-3', 'nu-4', 'nu-5', 'nam-1', 'nam-2', 'nam-3']);
/** Their names (owner 2026-11-28; Kotone's art-club friends from the city): the row's labels and the file names. id -> name. */
export const NAMES = Object.freeze({
  kotone: 'Kotone', 'nu-3': 'Saki', 'nu-1': 'Mio', 'nu-4': 'Yuna', 'nu-5': 'Aoi', 'nam-1': 'Riku', 'nam-3': 'Kai', 'nam-2': 'Ren',
});
/** Their own names in Korean and Vietnamese (owner 2026-11-28: a Korean / Vietnamese name each, not a spelling of the
 *  English one; Kotone keeps hers, written in Hangul). Other languages use NAMES. */
export const LOCAL_NAMES = Object.freeze({
  ko: Object.freeze({ kotone: '코토네', 'nu-3': '지유', 'nu-1': '서아', 'nu-4': '하린', 'nu-5': '수아', 'nam-1': '도윤', 'nam-3': '시우', 'nam-2': '준호' }),
  vi: Object.freeze({ kotone: 'Kotone', 'nu-3': 'Mai', 'nu-1': 'Linh', 'nu-4': 'Thảo', 'nu-5': 'Vy', 'nam-1': 'Minh', 'nam-3': 'Khoa', 'nam-2': 'Huy' }),
});
/** A singer's name in a game language (ko / vi: their own names; else the English ones). */
export const nameOf = (id, lang) => LOCAL_NAMES[lang]?.[id] || NAMES[id] || null;
/** A member by id (null for an unknown id). */
export const member = id => TROUPE.find(m => m.id === id) || null;
/** A singer's face picture (64 px webp, baked by scripts/bake-singer-faces.mjs from each model's head). */
export const facePic = id => `faces/${id}.webp`;

const PERSON = ['id', 'file', 'h', 'gait'];
/** The whole cast of 8 with `lead` singing at the lead's place (see the top of this file). */
export function castOf(lead = KOTONE) {
  const who = TROUPE.map(m => m.id), at = id => who.indexOf(id);
  const L = at(KOTONE), S = at(lead);
  if (S >= 0 && S !== L) {
    if (TROUPE[S].row === 0) { who[L] = lead; who[S] = KOTONE; }
    else { const outer = TROUPE.findLastIndex(m => m.row === 0 && !m.lead); who[L] = lead; who[S] = who[outer]; who[outer] = KOTONE; }
  }
  return TROUPE.map((slot, i) => {
    const p = member(who[i]), out = { row: slot.row, x: slot.x, z: slot.z };
    for (const k of PERSON) out[k] = p[k];
    if (slot.lead) out.lead = true;
    // the front row's source is Kotone wherever she stands (her pack); the back row's is its slot (nam-1's pack)
    if (slot.row === 0 ? p.id === KOTONE : slot.source) { out.source = true; out.pack = slot.row === 0 ? member(KOTONE).pack : slot.pack; }
    return Object.freeze(out);
  });
}

/** Group sizes the player can pick in Sing & Play (1 = the lead alone). */
export const GROUP_SIZES = Object.freeze([1, 4, 8]);

/** The members of a group of n (1, 4 or 8) with `lead` singing, the lead included. */
export const troupeOf = (n, lead = KOTONE) => { const c = castOf(lead); return n >= 8 ? c : n >= 4 ? c.filter(m => m.row === 0) : c.filter(m => m.lead); };

/** Where the formation's centre is from the lead (she stands at her own place; the rows are laid out around her). */
export const leadOffset = () => { const k = TROUPE.find(m => m.lead); return { x: k.x, z: k.z }; };

/**
 * The files a group of n needs beyond the lead's model and Kotone's model and pack (the mode loads those; lite on Low):
 * the models of the others, the back row's pack.
 */
export function troupeFiles(n, low, lead = KOTONE) {
  const out = [];
  for (const m of troupeOf(n, lead)) {
    if (m.lead || m.id === KOTONE) continue;
    out.push(low ? `${m.file}.lite` : m.file);
    if (m.source && m.row === 1) out.push(m.pack);
  }
  return out;
}

/** The limits of a group performance (game/perform/troupe.js; measured in docs/GROUP-PERFORMANCE.md). */
export const TROUPE_LIMITS = Object.freeze({
  faceNear: 12,       // m: a member's face (blink, sing-along mouth, eyes) runs only while the camera is this near
  shadowRows: 2,      // rows that cast shadows (1: the back row casts none)
});
