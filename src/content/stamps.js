// © 2026 Bui Cong Nguyen · solluxlabs.com
// The daily stamp card's tables (Explore only; docs/STAMPS.md). Pure data: game/stamps-rules.js draws a card from them,
// game/stamps.js runs it. Strings are English sources marked with N_() (tx() on show).
//   DELIVERIES  take something from one neighbour's front door to another's. People are townsfolk ids (content/townsfolk.js),
//               doors are building ids (a home's room id is its building id: world/interiors.js HOMES). Story characters
//               (Hana, Ōta, Genzo, Rin, Grandma) are left out.
//   FINDS       something a neighbour lost, lying on the ground at one of three spots (each passes roads.js placeProblems).
//               model × scale are boot props; lift = how high the bobbing pickup's origin floats above the ground.
//   DECOR       what the stamps bring to the cottage: room-local three.js coordinates of interior-cottage (door at +Z).
//               surface = the resting height measured from the room's visible faces (tests/stamps.test.mjs test 8 checks
//               every piece against the model: its Col boxes, the face under it, and the room's own things around it);
//               the runtime lifts the model by its own bounding box, so props whose origin is at the top (the lantern,
//               the basket) sit on the surface too. at = stamps needed.
import { N_ } from '../i18n/i18n.js';

export const DELIVERIES = [
  { id: 'hirano-sato', from: 'v1', fromDoor: 'kw1', to: 'v5', toDoor: 'tk1', what: N_('the Kawabe letters') },
  { id: 'fujita-tsuru', from: 't1', fromDoor: 'kw2', to: 'v18', toDoor: 'kw5', what: N_('a bag of rice') },
  { id: 'komori-endo', from: 't2', fromDoor: 'kw8', to: 'v9', toDoor: 'kw6', what: N_('a parcel of paper') },
  { id: 'aiko-nakano', from: 'v4', fromDoor: 'tk2', to: 'v2', toDoor: 'kw4', what: N_('a jar of pickles') },
  { id: 'kubo-tanabe', from: 'v19', fromDoor: 'kw3', to: 'v27', toDoor: 'tk3', what: N_('a sack of carrots') },
  { id: 'ishida-oda', from: 'v24', fromDoor: 'kw7', to: 'v22', toDoor: 'tk6', what: N_('a new gate latch') },
];

// spots: [x, z, place] with place a world/layout.js PLACES key (its name is the card's "Near …")
export const FINDS = [
  { id: 'ball', asker: 'v3', model: 'ball', scale: 1.6, lift: 0.5, name: N_("Kenta's ball"), spots: [[-12, 28, 'kawabe'], [-30, 34, 'kawabe'], [-24, 4, 'kawabe']] },
  { id: 'letters', asker: 'v1', model: 'letters', scale: 2.0, lift: 0.5, name: N_("Mr. Hirano's letters"), spots: [[-40, 2, 'kawabe'], [-66, 22, 'kawabe'], [-52, 44, 'kawabe']] },
  // the hoe and the bug net stand upright with their origin near the foot: 0.3 keeps the foot out of the grass at the bob's low point
  { id: 'hoe', asker: 'v19', model: 'hoe', scale: 1.0, lift: 0.3, name: N_("Mr. Kubo's hoe"), spots: [[-62, -20, 'kawabe'], [-48, -12, 'kawabe'], [-36, -18, 'kawabe']] },
  { id: 'bucket', asker: 'v2', model: 'bucket', scale: 1.2, lift: 0.75, name: N_("Mrs. Nakano's bucket"), spots: [[-6, 40, 'kawabeDock'], [-8, 20, 'kawabeDock'], [-10, -2, 'kawabe']] },
  { id: 'bugnet', asker: 'v13', model: 'bug-net', scale: 1.0, lift: 0.3, name: N_("Sumi's bug net"), spots: [[95, -30, 'orchard'], [122, 30, 'takamori'], [70, -60, 'orchard']] },
  { id: 'basket', asker: 'v4', model: 'basket', scale: 1.2, lift: 0.7, name: N_("Aiko's flower basket"), spots: [[104, 24, 'takamori'], [136, -20, 'pasture'], [90, 0, 'takamori']] },
];

// icon: a journal icon that exists (public/icons), else glyph: a picture for the journal card
export const DECOR = [
  // the counter by the window (the tansu top is full: a box stands where the lantern was first meant to go)
  { id: 'lantern', model: 'noren-lantern', scale: 0.6, x: 1.90, surface: 1.106, z: -2.80, yaw: 0, name: N_('A paper lantern'), from: N_('Mrs. Ishida'), at: 2, glyph: '🏮' },
  { id: 'geraniums', model: 'flowerpot', scale: 0.75, x: -0.25, surface: 0.24, z: -2.84, yaw: 0, name: N_('A pot of geraniums'), from: N_('Granny Tsuru'), at: 4, glyph: '🪴' },
  { id: 'paperflowers', model: 'flowers-b', scale: 0.4, x: 1.62, surface: 0.904, z: 2.94, yaw: Math.PI, name: N_('Paper flowers'), from: N_('Mrs. Komori'), at: 8, icon: 'flowers' },
  { id: 'ball', model: 'ball', scale: 1, x: -3.30, surface: 0, z: 2.90, yaw: 0, name: N_("Kenta's spare ball"), from: N_('Kenta'), at: 12, icon: 'ball' },
  // the firefly game's own jar (empty, red cloth lid): named for what it is, with the jar's own journal picture
  { id: 'pickles', model: 'glass-jar', scale: 1.4, x: 3.04, surface: 0.904, z: 2.95, yaw: Math.PI, name: N_('A firefly jar'), from: N_('Aiko'), at: 16, icon: 'trick-firefly' },
  { id: 'bugnet', model: 'bug-net', scale: 0.9, x: 3.30, surface: 0, z: 2.50, yaw: Math.PI / 2, name: N_('A bug net'), from: N_('Yui'), at: 20, glyph: '🦋' },
  { id: 'basket', model: 'basket', scale: 0.9, x: 1.12, surface: 0, z: 2.92, yaw: Math.PI, name: N_('A straw basket'), from: N_('Mr. Kubo'), at: 26, glyph: '🧺' },
  // the low table's far end, beside the tea things: seen from the seat, never between the seated shot and Mika
  { id: 'postcards', model: 'letters', scale: 1.6, x: -1.30, surface: 0.60, z: -0.25, yaw: 0.3, name: N_('Postcards from the neighbours'), from: N_('Mr. Hirano'), at: 32, icon: 'letters' },
];

/** Who asks for a game on the card (existing names): the playground kids, the fisher, Grandma for the countryside tricks. */
export function playAsker(e) {
  if (e.kind === 'yard') return e.yard === 'takamori' ? N_('Hiro') : N_('Kenta');
  if (e.kind === 'fish') return N_('Mr. Nakano');
  return N_('Grandma Sora');
}

export const TABLES = { deliveries: DELIVERIES, finds: FINDS, decor: DECOR };
