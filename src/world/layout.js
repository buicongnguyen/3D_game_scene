// Hoshi Valley layout: pure data (no three.js), shared by the runtime and Node tests.
// Coordinates: metres, x east, z south, y up. Water surface is y = 0.
// rot: degrees about +Y; a model's front (+Z in three.js) faces (sin rot, cos rot).

import { Spline } from '../engine/spline.js';

export const WATER_Y = 0;
export const RAIL_Y = 16;            // rail-top height for the whole main line
export const DECK_Y = 15.7;          // walkable viaduct deck (beside the rails)
export const WORLD = { minX: -200, maxX: 200, minZ: -215, maxZ: 185 };   // playable rectangle (soft walls)
export const TERRAIN = { minX: -320, maxX: 320, minZ: -330, maxZ: 300 }; // rendered terrain incl. mountains

// ------------------------------------------------------------------ river (north -> south)
export const RIVER_POINTS = [
  [34, -300], [30, -240], [22, -190], [8, -148], [-4, -108], [-3, -62], [3, -22], [11, 18], [13, 55],
  [6, 95], [0, 120], [-7, 150], [-18, 200], [-26, 260], [-30, 320],
];
export const river = new Spline(RIVER_POINTS, 1);
export function riverHalfWidth(z) {
  const t = Math.min(1, Math.max(0, (z + 200) / 360));
  return 7 + t * 4.6; // 14 m wide in the north forest, ~23 m below the viaduct
}
// Bank width (how far the land takes to rise from the water) varies: flat Kawabe, steep gorge at the viaduct.
export function bankWidth(z) {
  if (z > 92 && z < 150) return 12;
  if (z > -90 && z < 70) return 18;
  return 11;
}

// ------------------------------------------------------------------ railway (west portal -> north-east portal)
export const RAIL_POINTS = [
  [-262, 34], [-228, 58], [-196, 82], [-164, 102], [-130, 116], [-98, 119.5], [-70, 120], [-50, 120],
  [0, 120], [50, 120], [74, 118], [102, 108], [126, 92], [143, 72], [156, 44], [165, 6], [169, -34],
  [168, -80], [161, -126], [152, -170], [144, -216], [136, -262],
];
export const rail = new Spline(RAIL_POINTS, 1);
// The line runs in tunnels beyond these arc lengths (portals face along the track).
export const RAIL_PORTALS = {
  west: rail.nearest(-186, 88).s,
  east: rail.nearest(150, -192).s,
};
export const VIADUCT = { x0: -52, x1: 52, z: 120, spanLength: 14, brokenSpan: [0, 14], lampPierX: 0 };
// Span centres along X (each span has its pier at +7). Abutments at +-47.
export const VIADUCT_SPANS = [-35, -21, -7, 7, 21, 35];

// ------------------------------------------------------------------ places (story locations)
export const PLACES = {
  station: { x: -98, z: 116, name: 'Hoshi Station' },
  platform: { x: -98, z: 115.2 },
  cottage: { x: -60, z: 140, name: "Sora's Signal Cottage" },
  kawabe: { x: -45, z: 20, name: 'Kawabe' },
  kawabeDock: { x: 1, z: 30, name: 'Kawabe Dock' },
  eastDock: { x: 24.5, z: 30, name: 'Takamori Landing' },
  mill: { x: -15.5, z: -45, name: 'Ōta Mill' },
  millIsland: { x: 0.6, z: -45, r: 4.2, top: 1.25 },
  boathouse: { x: -12, z: -6 },
  sandbar: { x: -6.5, z: -22 },
  takamori: { x: 115, z: 6, name: 'Takamori' },
  belltower: { x: 115, z: -4 },
  bakery: { x: 98, z: 14 },
  pasture: { x: 150, z: -38, name: 'Sheep pasture' },
  pen: { x: 150, z: -38 },
  orchard: { x: 72, z: -48, name: 'Peach orchard' },
  orchardGate: { x: 85, z: -80 },
  halt: { x: 143, z: 72, name: 'Takamori Halt' },
  shrine: { x: 62, z: -156, name: 'Forest Shrine' },
  shrineStairsBase: { x: 62, z: -124 },
  bearSpot: { x: 62, z: -121.2 },
  forestHearth: { x: 53, z: -121 },
  steppingStones: { x: -4, z: -112 },
  landslide: { x: -50, z: -168, name: 'Landslide scar' },
  engineShed: { x: -160, z: 90, name: 'Engine shed' },
  viaductLamp: { x: 0, z: 120, name: 'Viaduct Lamp' },
  viaductWest: { x: -47, z: 120 },
};

// Flatten / shaping operations for the height field, applied in order (see heightfield.js).
// kind 'disc': target height t within radius r, blended to the underlying height over falloff f.
// kind 'ramp': linear height from a (ha) to b (hb) within half-width w, falloff f.
// kind 'landslide': the wooded spur the landslide scar is torn out of, sunk under the scar model (landslide.js).
export const SHAPES = [
  { kind: 'disc', x: -98, z: 116, r: 34, f: 26, t: 16 },          // station plateau
  { kind: 'disc', x: -60, z: 140, r: 12, f: 14, t: 16.2 },        // cottage bluff
  { kind: 'disc', x: -50, z: 121, r: 7, f: 10, t: 15.7 },         // west abutment ground
  { kind: 'disc', x: 50, z: 121, r: 7, f: 10, t: 15.7 },          // east abutment ground
  { kind: 'disc', x: -160, z: 92, r: 16, f: 16, t: 15.9 },        // engine shed yard
  { kind: 'disc', x: -45, z: 15, r: 48, f: 26, t: 3.0 },          // Kawabe terrace
  { kind: 'disc', x: -22, z: -45, r: 9, f: 8, t: 1.0 },           // mill yard
  { kind: 'disc', x: 115, z: 8, r: 38, f: 26, t: 21 },            // Takamori plateau
  { kind: 'disc', x: 150, z: -38, r: 20, f: 14, t: 22 },          // pasture
  { kind: 'disc', x: 143, z: 72, r: 12, f: 14, t: 16 },           // Takamori Halt
  { kind: 'disc', x: 62, z: -157, r: 16, f: 14, t: 24 },          // shrine hilltop (the great hall's terrace and the Forest Lamp)
  { kind: 'ramp', ax: 62, az: -122, bx: 62, bz: -140, ha: 12, hb: 24, w: 3.2, f: 5 }, // shrine stairs: 4 flights of 4.5 m x 3 m
  { kind: 'disc', x: 62, z: -116, r: 8, f: 10, t: 12 },           // stair foot clearing
  { kind: 'ramp', ax: -86, az: 100, bx: -60, bz: 64, ha: 15.6, hb: 3.6, w: 3, f: 9 },  // station road down to Kawabe
  { kind: 'landslide' },                                           // the scar's spur north of PLACES.landslide
];
// Terraced rice paddies west of Kawabe: 3 columns stepping up the foothills x 4 rows.
export const PADDIES = [];
for (const [i, x, t] of [[0, -73.5, 3.2], [1, -85, 4.0], [2, -96.5, 4.8]]) {
  for (const [j, z] of [[0, -2], [1, 9], [2, 20], [3, 31]]) PADDIES.push({ id: `paddy${i}${j}`, x, z: z + (i % 2) * 1.5, w: 10.2, d: 9.6, t: t + j * 0.12 });
}
for (const p of PADDIES) SHAPES.push({ kind: 'rect', x: p.x, z: p.z, hw: p.w / 2 + 0.7, hd: p.d / 2 + 0.7, f: 2.5, t: p.t - 0.05 });

// Applied after the river is carved (islands, landings, fords).
export const POST_SHAPES = [
  { kind: 'disc', x: 0.6, z: -45, r: 4.2, f: 2.4, t: 1.25 },      // mill island
  { kind: 'disc', x: -6.5, z: -22, r: 2.6, f: 2.8, t: 0.25 },     // crab sandbar
  { kind: 'disc', x: -12.2, z: -45, r: 1.6, f: 1.8, t: -1.6 },    // mill race under the wheel
  { kind: 'rect', x: -9.6, z: -45, hw: 1.1, hd: 1.9, f: 1.2, t: 1.1 }, // stone landing for the drawbridge
  { kind: 'ramp', ax: -16, az: -112, bx: 8, bz: -112, ha: -0.9, hb: -0.9, w: 3, f: 3, onlyBelow: true }, // shallow ford
  { kind: 'rect', x: -21.1, z: 16.6, hw: 7.15, hd: 10.45, f: 2.2, t: 3.0 },  // Kawabe playground yard: level to its east fence (content/yard.js)
];

// ------------------------------------------------------------------ buildings & big props
// model: GLB name; x, z; rot degrees; y: optional explicit ground height (else terrain); pad: flatten radius.
export const BUILDINGS = [
  // Hoshi Station & railway side
  { id: 'station', model: 'station', x: -98, z: 109.4, rot: 0 },
  { id: 'platform', model: 'platform', x: -98, z: 115.15, rot: 0, y: RAIL_Y - 0.0 },
  { id: 'engineShed', model: 'engine-shed', x: -164, z: 84, rot: 30 },
  { id: 'cottage', model: 'signal-cottage', x: -60, z: 140, rot: 90 },
  // Kawabe (main street along x = -45)
  { id: 'kw1', model: 'kawabe-house-a', x: -56, z: 48, rot: 90 },
  { id: 'kw2', model: 'kawabe-shop', x: -56, z: 33, rot: 90 },
  { id: 'kw3', model: 'kawabe-house-a', x: -56, z: 18, rot: 90 },
  { id: 'kw4', model: 'kawabe-house-b', x: -58, z: 1, rot: 90 },
  { id: 'kw5', model: 'kawabe-house-a', x: -34, z: 52, rot: -90 },
  { id: 'kw6', model: 'kawabe-house-b', x: -33, z: 12, rot: -90 },
  { id: 'kw7', model: 'kawabe-house-a', x: -34, z: -13, rot: -90 },
  { id: 'kw8', model: 'kawabe-shop', x: -56, z: -16, rot: 90 },
  { id: 'otaHouse', model: 'kawabe-house-b', x: -40, z: -47, rot: 90 },
  { id: 'mill', model: 'mill', x: -17.6, z: -45, rot: 0, y: 1.0 },
  { id: 'boathouse', model: 'boathouse', x: -12.5, z: -6, rot: 90, y: 1.2 },
  // Takamori
  { id: 'belltower', model: 'belltower', x: 115, z: -4, rot: 0 },
  { id: 'bakery', model: 'bakery', x: 98, z: 14, rot: 90 },
  { id: 'tk1', model: 'takamori-house-a', x: 132, z: 12, rot: -90 },
  { id: 'tk2', model: 'takamori-house-b', x: 101, z: -14, rot: 90 },
  { id: 'tk3', model: 'takamori-house-a', x: 131, z: -18, rot: -90 },
  { id: 'tk4', model: 'takamori-house-b', x: 117, z: 30, rot: 180 },
  { id: 'tk5', model: 'takamori-house-a', x: 95, z: 34, rot: 145 },
  { id: 'tk6', model: 'takamori-house-b', x: 138, z: 34, rot: 215 },
  { id: 'haltPlatform', model: 'platform', x: 141.2, z: 73.4, rot: -122, y: RAIL_Y },
  // Shrine
  { id: 'shrine', model: 'shrine', x: 62, z: -160, rot: 0 },     // origin = centre of its 11.4 x 13.2 m stone terrace
  { id: 'torii', model: 'torii', x: 62, z: -113.5, rot: 0 },
  { id: 'toriiTop', model: 'torii', x: 62, z: -144.5, rot: 0 },
];

// Star Lamps (story beacons). tower: model; flame offset is read from the model's `Flame` node.
export const LAMPS = [
  // the Forest Lamp is the grand tower (twice the Star Lamp). range, gain: reach and strength of its light (the flame is
  // 15 m up); shot: how much further back the lighting cutscene stands
  { id: 'forest', name: 'Forest Lamp', model: 'star-lamp-grand', x: 73, z: -152, rot: 0, chapter: 3, range: 60, gain: 2.4, shot: 1.8 },
  { id: 'mill', name: 'Mill Lamp', model: 'star-lamp', x: 1.2, z: -45.6, rot: -90, chapter: 1, y: 1.25 },
  { id: 'orchard', name: 'Orchard Lamp', model: null, building: 'belltower', chapter: 2 },
  { id: 'viaduct', name: 'Viaduct Lamp', model: 'lamp-viaduct', x: 0, z: 123.0, rot: 0, y: DECK_Y, chapter: 4 }, // in the pier refuge
];

// Paths drawn on the terrain (ground splat) and used by NPC walks.
export const PATHS = [
  { w: 2.6, pts: [[-104, 104], [-92, 98], [-80, 88], [-68, 74], [-56, 60], [-47, 46], [-45, 20], [-45, -10], [-42, -28], [-30, -40], [-22, -45]] },
  { w: 2.0, pts: [[-78, 124], [-68, 128], [-58, 131.5], [-53.2, 136.5], [-53, 140]] }, // platform end round to the cottage porch
  { w: 1.8, pts: [[-45, 30], [-30, 30], [-16, 30], [-3, 30]] },              // to Kawabe dock
  { w: 1.6, pts: [[-45, -2], [-30, -4], [-18, -6]] },                        // to boathouse
  { w: 1.5, pts: [[-42, -28], [-48, -62], [-44, -92], [-30, -106], [-16, -112]] }, // west forest trail
  { w: 1.4, pts: [[-44, -92], [-52, -128], [-50, -158]] },                   // to the landslide
  { w: 2.2, pts: [[26, 30], [44, 28], [66, 22], [88, 14], [104, 6], [115, 6]] }, // landing up to Takamori
  { w: 2.0, pts: [[115, 6], [128, 0], [140, -18], [150, -30]] },             // to the pasture
  { w: 2.0, pts: [[115, 6], [120, 28], [132, 48], [142, 64]] },              // to the halt
  { w: 1.8, pts: [[104, 6], [92, -18], [82, -40], [84, -66], [85, -82]] },   // orchard lane to the gate
  { w: 1.5, pts: [[85, -82], [82, -98], [72, -110], [62, -118]] },           // forest trail to the shrine
  { w: 1.3, pts: [[62, -118], [40, -114], [18, -112], [6, -112]] },          // shrine to the stepping stones
];

// Stepping stones across the ford (x, z) — tops at y 0.35.
// Seven stones span the 16 m ford with ~1 m gaps: every gap is a jump, none is a leap of faith.
export const STONES = [[3.6, -111.7], [1.3, -112.5], [-1.0, -111.8], [-3.3, -112.6], [-5.6, -111.9], [-7.9, -112.6], [-10.2, -111.9]];

// Docks: x, z, rot (deck extends along the model's front).
export const DOCKS = [
  { x: -1.8, z: 30, rot: 90, n: 2 },
  { x: 25.2, z: 30, rot: -90, n: 2 },
  { x: -7.5, z: -1.5, rot: 90, n: 1 },
];
export const FERRY = { from: { x: 5.4, z: 30 }, to: { x: 20.8, z: 30 } };

// Orchard grid & fences.
export const ORCHARD = { x0: 50, x1: 96, z0: -72, z1: -30, spacing: 7.5 };
export const SCARECROWS = [[60, -62], [78, -66], [92, -50], [56, -38], [74, -34]];
export const ORCHARD_FENCE = { z: -80, x0: 6, x1: 178, gateX: 85, gateW: 4 };

// Fallen stars (collectibles): 12 hiding places, 3 per region.
export const FALLEN_STARS = [
  { id: 'fs1', x: -152, z: 62, hint: 'West portal cutting' },
  { id: 'fs2', x: -70, z: 148, hint: 'Behind the cottage' },
  { id: 'fs3', x: -40, z: 68, hint: 'Kawabe south lane' },
  { id: 'fs4', x: -66, z: -44, hint: 'Behind the mill' },
  { id: 'fs5', x: -58, z: -118, hint: 'West woods' },
  { id: 'fs6', x: -52.5, z: -179, hint: 'Landslide ledge' }, // on the crest, just behind the headscarp's lip
  { id: 'fs7', x: 160, z: 20, hint: 'Takamori east edge' },
  { id: 'fs8', x: 58, z: -30, hint: 'Orchard corner' },
  { id: 'fs9', x: 128, z: 58, hint: 'By the halt' },
  { id: 'fs10', x: 104, z: -128, hint: 'Beehive clearing' },
  { id: 'fs11', x: 30, z: -150, hint: 'Upper river bend' },
  { id: 'fs12', x: 34, z: 142, hint: 'Under the viaduct, east bank' },
];

// Keep-out zones for scattering (trees, rocks, flowers): circles [x, z, r].
export const CLEARINGS = [
  [-98, 114, 22], [-60, 140, 12], [-45, 20, 50], [-18, -44, 14], [0, -45, 6], [-12, -6, 9],
  [115, 8, 40], [150, -38, 22], [143, 72, 14], [62, -157, 19], [73, -152, 8], [62, -128, 10], [-164, 84, 18],
  [53, -121, 6], [-50, -161, 7], [24.5, 30, 8], [1, 30, 8], // (the landslide scar clears its own ground: structures.js)
  [-85, 14.5, 25],
];
