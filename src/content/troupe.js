// © 2026 Bui Cong Nguyen · solluxlabs.com
// The group performance (game/perform/troupe.js): Kotone and the other seven VRoid Project sample characters (built
// like her by art/blender/vroid_mixamo.py --member: one mesh, one material, the 69-bone Mixamo skeleton, three face
// morphs; models and packs fetched only when a group performs). Two rows of four facing the camera, each row ONE group
// that dances in unison: the front row copies Kotone's dance (her own mixer and song plan), the back row copies its
// source (nam-1, his own mixer, his own Club bake, a second routine from the same song plan). Licence: VRoid Hub
// (commercial use, modification and redistribution allowed; credited "VRoid Project" in the Credits).
//
//   file    the model stem (public/models/<file>.glb, <file>.lite.glb on Low; the pack moves-<file>.glb)
//   h       height in metres (top of the hair to the soles, as built)
//   row     0 front, 1 back; x, z the place in metres from the formation's centre (+z toward the camera)
//   source  this member's rig is evaluated (one mixer for the row); the others copy its bones

export const TROUPE = Object.freeze([
  // front row (group A): Kotone sings lead with the hand mic, the girls copy her dance and sing along on the choruses
  { id: 'nu-3', file: 'vroid-nu3', h: 1.645, row: 0, x: -2.25, z: 0 },
  { id: 'kotone', file: 'kotone', h: 1.616, row: 0, x: -.75, z: .35, source: true, lead: true },
  { id: 'nu-1', file: 'vroid-nu1', h: 1.598, row: 0, x: .75, z: 0 },
  { id: 'nu-4', file: 'vroid-nu4', h: 1.668, row: 0, x: 2.25, z: 0 },
  // back row (group B), 1.8 m behind, between and outside the front row's shoulders so every face shows
  { id: 'nu-5', file: 'vroid-nu5', h: 1.737, row: 1, x: -3.0, z: -1.8 },
  { id: 'nam-1', file: 'vroid-nam1', h: 1.713, row: 1, x: -1.5, z: -1.8, source: true },
  { id: 'nam-3', file: 'vroid-nam3', h: 1.761, row: 1, x: 1.5, z: -1.8 },
  { id: 'nam-2', file: 'vroid-nam2', h: 1.735, row: 1, x: 3.0, z: -1.8 },
].map(Object.freeze));

/** Group sizes the player can pick in Sing & Play (1 = Kotone alone). */
export const GROUP_SIZES = Object.freeze([1, 4, 8]);

/** The members of a group of n (1, 4 or 8), Kotone included. */
export const troupeOf = n => (n >= 8 ? TROUPE : n >= 4 ? TROUPE.filter(m => m.row === 0) : TROUPE.filter(m => m.lead));

/** Where the formation's centre is from Kotone (she stands at her own place; the rows are laid out around her). */
export const leadOffset = () => { const k = TROUPE.find(m => m.lead); return { x: k.x, z: k.z }; };

/** The files a group of n needs beyond Kotone's own model and pack (lite on Low): models of all, the back row's pack. */
export function troupeFiles(n, low) {
  const out = [];
  for (const m of troupeOf(n)) {
    if (m.lead) continue;
    out.push(low ? `${m.file}.lite` : m.file);
    if (m.source) out.push(`moves-${m.file}`);
  }
  return out;
}

/** The limits of a group performance (game/perform/troupe.js; measured in docs/GROUP-PERFORMANCE.md). */
export const TROUPE_LIMITS = Object.freeze({
  faceNear: 12,       // m: a member's face (blink, sing-along mouth, eyes) runs only while the camera is this near
  shadowRows: 2,      // rows that cast shadows (1: the back row casts none)
});
