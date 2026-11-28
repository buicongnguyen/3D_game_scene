// © 2026 Bui Cong Nguyen · solluxlabs.com
// Name boards: what every building in the valley is, written on a wooden board at its door. Pure data (no three.js,
// no DOM), read by src/world/signs.js (which builds and paints the boards) and checked by tests/signs.test.mjs.
//
// text / sub: English source strings (translated with tx() when painted). Names the game already uses are reused, so
//   a board always says what the journal, the map and the neighbours say. `grandma: {…}` overrides fields in the
//   Grandma story (forStory, src/game/stories/index.js).
// icon: a small pictogram painted left of the name (left out where the device has no emoji font).
// kind: 'shop' | 'civic' | 'home' | 'place' (a warmer glow on shop boards at night).
// mount: where the name lives. Boards that stood beside paths covered the player's view (owner, 2026-11-21), so a
//   building's name is on its own wall now, out of the way, the way Japanese houses do it:
//   'plate'  = a small wooden nameplate (表札) on the wall above or beside the front door (homes);
//   'kanban' = a shop sign (看板) flat on the wall above the entrance (shops, the mill, the boathouse...).
//   Their spots are measured from each model (WALL_SPOTS, found by a ray search over the front wall: flat, facing
//   out, no window, door, noren or lantern). The door prompt says the name too ("Go inside: Kubo family").
//   'stand'  = a small board on two posts, only where there is no wall: the station, fields, the playgrounds.
// Where a stand goes, in the building's own space (x right, z out of the front door; see layout.js `rot`):
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
  { id: 'engineShed', building: 'engineShed', kind: 'civic', mount: 'kanban', text: N_('Engine shed'), icon: '🔧' },
  { id: 'cottage', building: 'cottage', kind: 'home', mount: 'plate', text: N_("Sora's cottage"), icon: '🏡', grandma: { text: N_("Grandma's cottage") } },
  // ---- Kawabe: the houses face the main street, so their boards stand across it
  { id: 'kw1', building: 'kw1', kind: 'home', mount: 'plate', text: N_('Hirano family'), sub: N_('Kawabe postman'), icon: '📮' },
  { id: 'kw2', building: 'kw2', kind: 'shop', mount: 'kanban', text: N_('Fujita Grocery'), icon: '🍙' },
  { id: 'kw3', building: 'kw3', kind: 'home', mount: 'plate', text: N_('Kubo family'), icon: '🥬' },
  { id: 'kw4', building: 'kw4', kind: 'home', mount: 'plate', text: N_('Nakano family'), sub: N_('Fisher'), icon: '🐟' },
  { id: 'kw5', building: 'kw5', kind: 'home', mount: 'plate', text: N_('Granny Tsuru'), icon: '🌸' },
  { id: 'kw6', building: 'kw6', kind: 'home', mount: 'plate', text: N_('Miss Endo'), sub: N_('Schoolteacher'), icon: '📖' },
  { id: 'kw7', building: 'kw7', kind: 'home', mount: 'plate', text: N_('Ishida family'), sub: N_('Carpenter'), icon: '🔨' },
  { id: 'kw8', building: 'kw8', kind: 'shop', mount: 'kanban', text: N_('Komori Sweets & Paper'), icon: '🍡' },
  { id: 'otaHouse', building: 'otaHouse', kind: 'home', mount: 'plate', text: N_('Grandpa Ōta'), icon: '🧵' },
  { id: 'mill', building: 'mill', kind: 'civic', mount: 'kanban', text: N_("Ōta's mill"), icon: '🌾' },
  { id: 'boathouse', building: 'boathouse', kind: 'civic', mount: 'kanban', text: N_("Rin's boathouse"), icon: '⛵' },
  // ---- Takamori: the houses stand round the square and their boards face it
  { id: 'belltower', building: 'belltower', kind: 'civic', mount: 'kanban', text: N_('Bell tower'), icon: '🔔' },
  { id: 'bakery', building: 'bakery', kind: 'shop', mount: 'kanban', text: N_("Hana's bakery"), icon: '🍞' },
  { id: 'tk1', building: 'tk1', kind: 'home', mount: 'plate', text: N_('Mr. Sato'), sub: N_('Takamori postman'), icon: '📮' },
  { id: 'tk2', building: 'tk2', kind: 'home', mount: 'plate', text: N_('Aiko'), icon: '🌼' },
  { id: 'tk3', building: 'tk3', kind: 'home', mount: 'plate', text: N_('Tanabe family'), sub: N_('Bell-ringer'), icon: '🔔' },
  { id: 'tk4', building: 'tk4', kind: 'home', mount: 'plate', text: N_("Hiro's house"), icon: '⚽' },
  { id: 'tk5', building: 'tk5', kind: 'home', mount: 'plate', text: N_("Nao's house"), icon: '🎯' },
  { id: 'tk6', building: 'tk6', kind: 'home', mount: 'plate', text: N_('Mr. Oda'), sub: N_('Shepherd at the pasture'), icon: '🐑' },
  { id: 'halt', building: 'haltPlatform', kind: 'civic', mount: 'stand', lx: 8, lz: -1.8, top: 0.95, text: N_('Takamori Halt'), icon: '🚉' },
  { id: 'stall', at: { x: 110, z: 8, rot: 0 }, kind: 'shop', mount: 'stand', text: N_('Takamori Market Stall'), icon: '💐' },
  // ---- out of the villages
  { id: 'shrine', building: 'shrine', kind: 'civic', mount: 'stand', side: -6.4, out: 1.2, text: N_('Forest Shrine'), icon: '⛩' },
  { id: 'pasture', at: { x: 145.2, z: -33.4, rot: -20 }, kind: 'place', mount: 'stand', text: N_('Sheep pasture'), icon: '🐑' },
  { id: 'orchard', at: { x: 90.6, z: -28, rot: 25 }, kind: 'place', mount: 'stand', text: N_('Peach orchard'), icon: '🍑' },
  { id: 'paddies', at: { x: -66.6, z: 25.5, rot: 90 }, kind: 'place', mount: 'stand', text: N_('Rice paddies'), icon: '🌾' },
  // the two dry plots of the top terrace (world/fields.js WHEAT_FIELDS): the board stands at the head of the lane between them
  { id: 'wheat', at: { x: -103.0, z: 14.5, rot: 90 }, kind: 'place', mount: 'stand', text: N_('Wheat field'), icon: '🌾' },
  { id: 'yard', at: { x: -23.5, z: 26.2, rot: 0 }, kind: 'place', mount: 'stand', text: N_('Kawabe Playground'), icon: '🏸' },
  { id: 'green', at: { x: 118, z: -11.9, rot: 0 }, kind: 'place', mount: 'stand', text: N_('Takamori Green'), icon: '🏐' },
  { id: 'archery', at: { x: -67.2, z: 55.8, rot: 90 }, kind: 'place', mount: 'stand', text: N_('Archery range'), icon: '🏹' },
];

// board face sizes in metres (3 : 1, like the texture cell): stands by kind (smaller than they were: 2.1-2.4 m boards
// across the streets filled the phone's view), wall plates and shop signs by mount
export const BOARD = { shop: [1.8, 0.6], civic: [1.8, 0.6], home: [1.6, 0.53], place: [1.6, 0.53] };
export const PLATE = [0.62, 0.21], KANBAN = [1.36, 0.45];

// where a plate or shop sign sits on each building model, in the model's own space (x right, y up from its base, z out
// of the front door: the wall's face). Measured by a ray search over the front wall (flat, facing out, no window, door,
// noren or lantern; above the door first, then beside it). `w`: a narrower sign where the clear patch is small.
// `back`: the door (and its sign) is in the back wall.
export const WALL_SPOTS = {
  'kawabe-house-a': { plate: { x: 0, y: 2.5, z: 2.51 } },                 // the plaster band over the lattice door
  'kawabe-house-b': { plate: { x: 1.3, y: 1.6, z: 2.1 } },                // the plaster beside the glass doors
  'takamori-house-a': { plate: { x: 1.25, y: 2.95, z: 2.57 } },           // over the porch door
  'takamori-house-b': { plate: { x: 0, y: 3.2, z: 1.63 } },               // over the veranda
  'signal-cottage': { plate: { x: 0, y: 2.85, z: 1.51 } },                // over the red door
  'kawabe-shop': { kanban: { x: 0, y: 4.22, z: 1.09 } },                  // the upper wall over the pent roof
  bakery: { kanban: { x: 0, y: 3.25, z: 2.73, w: 0.95 } },                // the brick band over the awning
  mill: { kanban: { x: 0, y: 2.92, z: 2.98 } },                           // over the double doors
  'engine-shed': { kanban: { x: 0, y: 5.12, z: 9.15 } },                  // over the arch
  boathouse: { kanban: { x: -1.0, y: 2.23, z: -3.81, back: true } },      // over the land door at the back
  belltower: { kanban: { x: 0, y: 3.42, z: 1.83 } },
};

/** A sign's board size [w, h] in metres. */
export function boardSize(sign, model) {
  if (sign.mount === 'plate') return PLATE;
  if (sign.mount === 'kanban') { const w = WALL_SPOTS[model]?.kanban?.w; return w ? [w, w / 3] : KANBAN; }
  return BOARD[sign.kind] || BOARD.home;
}

const rad = d => d * Math.PI / 180;

/**
 * Where a board stands: { x, z, yaw (radians, the way its front face looks), top (metres above the building's base,
 * or null for "on the ground") }. `b` is the sign's layout building, `fp` its wall footprint [w, d, h] and `door` its
 * door spot (interiors.js DOOR_SPOTS), all optional for boards placed with `at`.
 */
export function signPlace(sign, b, fp = [2, 2, 2], door = null) {
  if (sign.at) return { x: sign.at.x, z: sign.at.z, yaw: rad(sign.at.rot || 0), top: null };
  const r = rad(b.rot), c = Math.cos(r), s = Math.sin(r);
  const spot = (sign.mount === 'plate' || sign.mount === 'kanban') && WALL_SPOTS[b.model || b.name]?.[sign.mount];
  if (spot) {
    // flat on the wall, a few centimetres proud of it; `top` is the board's middle
    const lx = spot.x, lz = spot.z + (spot.back ? -0.03 : 0.03);
    return { x: b.x + lx * c + lz * s, z: b.z - lx * s + lz * c, yaw: r + (spot.back ? Math.PI : 0), top: spot.y, wall: true };
  }
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
