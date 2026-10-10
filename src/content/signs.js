// Name boards: what every building in the valley is, written on a wooden board at its door. Pure data (no three.js,
// no DOM), read by src/world/signs.js (which builds and paints the boards) and checked by tests/signs.test.mjs.
//
// text / sub: English source strings (translated with tx() when painted). Names the game already uses are reused, so
//   a board always says what the journal, the map and the neighbours say. `grandma: {…}` overrides fields in the
//   Grandma story (forStory, src/game/stories/index.js).
// icon: a small pictogram painted left of the name (left out where the device has no emoji font).
// kind: 'shop' | 'civic' | 'home' | 'place' (board size, and a warmer glow on shop boards at night).
// mount: 'stand' = a board on two posts beside the path to the door; 'hang' = a tall post with an arm and a hanging
//   board, clear above head height.
// Where it goes, in the building's own space (x right, z out of the front door; see layout.js `rot`):
//   side: metres to the side of the door; out: metres in front of the wall; turn: degrees the board is turned from
//   facing straight out (90 = across the street, so it reads to people walking along it; boards are two-sided).
//   back: the door is in the back wall (the boathouse). lx, lz: an exact spot in the building's space instead.
//   top: metres above the building's base (boards standing on a platform).
// Boards with no building give `at: { x, z, rot }` in world coordinates.
import { N_ } from '../i18n/i18n.js';

export const SIGNS = [
  // ---- Hoshi Station and the railway side
  { id: 'station', at: { x: -99, z: 105.2, rot: 180 }, near: 'station', kind: 'civic', mount: 'stand', text: N_('Hoshi Station'), icon: '🚂' },
  { id: 'stationPlatform', building: 'platform', kind: 'civic', mount: 'stand', lx: 10.5, lz: -1.8, top: 0.95, text: N_('Hoshi Station'), icon: '🚂' },
  { id: 'engineShed', building: 'engineShed', kind: 'civic', mount: 'stand', side: 6.3, out: 1.2, text: N_('Engine shed'), icon: '🔧' },
  { id: 'cottage', building: 'cottage', kind: 'home', mount: 'stand', side: -2.9, out: 1.6, turn: 45, text: N_("Sora's cottage"), icon: '🏡', grandma: { text: N_("Grandma's cottage") } },
  // ---- Kawabe: the houses face the main street, so their boards stand across it
  { id: 'kw1', building: 'kw1', kind: 'home', mount: 'stand', side: 3.4, out: 1.5, turn: 90, text: N_('Hirano family'), sub: N_('Kawabe postman'), icon: '📮' },
  { id: 'kw2', building: 'kw2', kind: 'shop', mount: 'hang', side: -3.9, out: 2.1, turn: 90, text: N_('Fujita Grocery'), icon: '🍙' },
  { id: 'kw3', building: 'kw3', kind: 'home', mount: 'stand', side: 2.7, out: 1.5, turn: 90, text: N_('Kubo family'), icon: '🥬' },
  { id: 'kw4', building: 'kw4', kind: 'home', mount: 'stand', side: 3.2, out: 1.5, turn: 90, text: N_('Nakano family'), sub: N_('Fisher'), icon: '🐟' },
  { id: 'kw5', building: 'kw5', kind: 'home', mount: 'stand', side: 2.7, out: 1.5, turn: 90, text: N_('Granny Tsuru'), icon: '🌸' },
  { id: 'kw6', building: 'kw6', kind: 'home', mount: 'stand', side: 3.2, out: 1.5, turn: 90, text: N_('Miss Endo'), sub: N_('Schoolteacher'), icon: '📖' },
  { id: 'kw7', building: 'kw7', kind: 'home', mount: 'stand', side: 2.7, out: 1.5, turn: 90, text: N_('Ishida family'), sub: N_('Carpenter'), icon: '🔨' },
  { id: 'kw8', building: 'kw8', kind: 'shop', mount: 'hang', side: -3.9, out: 2.1, turn: 90, text: N_('Komori Sweets & Paper'), icon: '🍡' },
  { id: 'otaHouse', building: 'otaHouse', kind: 'home', mount: 'stand', side: 3.2, out: 1.8, text: N_('Grandpa Ōta'), icon: '🧵' },
  { id: 'mill', building: 'mill', kind: 'civic', mount: 'stand', side: -4.4, out: 1.8, turn: -40, text: N_("Ōta's mill"), icon: '🌾' },
  { id: 'boathouse', building: 'boathouse', kind: 'civic', mount: 'stand', back: true, side: -3.6, out: 1.5, text: N_("Rin's boathouse"), icon: '⛵' },
  // ---- Takamori: the houses stand round the square and their boards face it
  { id: 'belltower', building: 'belltower', kind: 'civic', mount: 'stand', side: 3.6, out: 1.0, text: N_('Bell tower'), icon: '🔔' },
  { id: 'bakery', building: 'bakery', kind: 'shop', mount: 'hang', side: -5.4, out: 2.1, turn: 90, text: N_("Hana's bakery"), icon: '🍞' },
  { id: 'tk1', building: 'tk1', kind: 'home', mount: 'stand', side: -6.65, out: 0.9, text: N_('Mr. Sato'), sub: N_('Takamori postman'), icon: '📮' },
  { id: 'tk2', building: 'tk2', kind: 'home', mount: 'stand', side: 2.5, out: 1.6, text: N_('Aiko'), icon: '🌼' },
  { id: 'tk3', building: 'tk3', kind: 'home', mount: 'stand', side: -2.6, out: 1.6, text: N_('Tanabe family'), sub: N_('Bell-ringer'), icon: '🔔' },
  { id: 'tk4', building: 'tk4', kind: 'home', mount: 'stand', side: 2.6, out: 1.6, text: N_("Hiro's house"), icon: '⚽' },
  { id: 'tk5', building: 'tk5', kind: 'home', mount: 'stand', side: -2.6, out: 1.6, text: N_("Nao's house"), icon: '🎯' },
  { id: 'tk6', building: 'tk6', kind: 'home', mount: 'stand', side: 2.5, out: 1.6, text: N_('Mr. Oda'), sub: N_('Shepherd at the pasture'), icon: '🐑' },
  { id: 'halt', building: 'haltPlatform', kind: 'civic', mount: 'stand', lx: 8, lz: -1.8, top: 0.95, text: N_('Takamori Halt'), icon: '🚉' },
  { id: 'stall', at: { x: 110, z: 8, rot: 0 }, kind: 'shop', mount: 'stand', text: N_('Takamori Market Stall'), icon: '💐' },
  // ---- out of the villages
  { id: 'shrine', building: 'shrine', kind: 'civic', mount: 'stand', side: -6.4, out: 1.2, text: N_('Forest Shrine'), icon: '⛩' },
  { id: 'pasture', at: { x: 145.2, z: -33.4, rot: -20 }, kind: 'place', mount: 'stand', text: N_('Sheep pasture'), icon: '🐑' },
  { id: 'orchard', at: { x: 90.6, z: -28, rot: 25 }, kind: 'place', mount: 'stand', text: N_('Peach orchard'), icon: '🍑' },
  { id: 'paddies', at: { x: -66.6, z: 25.5, rot: 90 }, kind: 'place', mount: 'stand', text: N_('Rice paddies'), icon: '🌾' },
  { id: 'yard', at: { x: -23.5, z: 26.2, rot: 0 }, kind: 'place', mount: 'stand', text: N_('Kawabe Playground'), icon: '🏸' },
];

// board face sizes in metres (3 : 1, like the texture cell)
export const BOARD = { shop: [2.4, 0.8], civic: [2.4, 0.8], home: [2.1, 0.7], place: [2.1, 0.7] };

const rad = d => d * Math.PI / 180;

/**
 * Where a board stands: { x, z, yaw (radians, the way its front face looks), top (metres above the building's base,
 * or null for "on the ground") }. `b` is the sign's layout building, `fp` its wall footprint [w, d, h] and `door` its
 * door spot (interiors.js DOOR_SPOTS), all optional for boards placed with `at`.
 */
export function signPlace(sign, b, fp = [2, 2, 2], door = null) {
  if (sign.at) return { x: sign.at.x, z: sign.at.z, yaw: rad(sign.at.rot || 0), top: null };
  const r = rad(b.rot), c = Math.cos(r), s = Math.sin(r);
  const dir = sign.back ? -1 : 1;
  const lx = sign.lx ?? (door?.x ?? 0) + (sign.side ?? 0);
  const lz = sign.lz ?? dir * (fp[1] / 2 + (sign.out ?? 1.6));
  return {
    x: b.x + lx * c + lz * s, z: b.z - lx * s + lz * c,
    yaw: r + (sign.back ? Math.PI : 0) + rad(sign.turn || 0),
    top: sign.top ?? null,
  };
}

/** The sign's fields in the chosen story ('grandma' takes the `grandma` block). */
export function signFor(sign, story) {
  return story === 'grandma' && sign.grandma ? { ...sign, ...sign.grandma } : sign;
}

/**
 * What the boards cost on a quality tier (engine/renderer.js QUALITY, or any object with the same keys). Every key is
 * optional; without them every tier gets what it always got.
 *   boardTexScale  size of the boards' one shared texture: 1 = 2048 x 1024 (about 11 MB on the GPU), 0.5 = 1024 x 512
 *   boardCluster   boards within this many metres share a mesh and a draw call (60)
 *   boardDist      boards are hidden beyond this many metres (default: 1.5 x propDist, at least 150)
 *   boardShadows   whether boards cast shadows (default: the tier's propShadows)
 *   detail         0 .. 1: one dial for a tier that sets none of the above (under 0.5: the half-size texture)
 * Returns { texScale, cluster, dist (or null for the default), shadows (or null for the default) }.
 */
export function boardOptions(quality = {}) {
  const q = quality || {}, num = v => Number.isFinite(v);
  return {
    texScale: num(q.boardTexScale) ? Math.min(1, Math.max(0.25, q.boardTexScale)) : num(q.detail) && q.detail < 0.5 ? 0.5 : 1,
    cluster: num(q.boardCluster) ? Math.max(1, q.boardCluster) : 60,
    dist: num(q.boardDist) ? q.boardDist : null,
    shadows: typeof q.boardShadows === 'boolean' ? q.boardShadows : null,
  };
}
