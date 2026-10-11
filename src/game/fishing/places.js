// Where Mika can fish: each place is data. The session, the pond and the pile read only this, so a third place is one
// more entry (and a line in tests/fishing.test.mjs, which checks every entry against the world).
// Pure data (no three.js), shared by the runtime and the Node tests.
import { N_ } from '../../i18n/i18n.js';
import { makePile } from './sim.js';

/*
 * id        the key; the interactable is `interact.id`
 * interact  the "Fish" prompt: { id, x, y, z, r } (ids are public: the story step marker is interact:fishingSpot)
 * label     the prompt's text
 * stand     where she plants her feet to cast; y: the planks' height (a dock), or null on the ground
 * leave     she is done fishing when she is farther than this from the prompt (metres)
 * area      the clear patch and its school: { cx, cz, rx, rz, clear } (ellipse the fish keep to, patch radius), for a
 *           wide screen (wide), a phone held upright (tall) and a frozen river (ice: also hole, the open water)
 * allow     where the float may land besides "deep enough, inside the ellipse": { minX, maxX, minZ, maxZ }
 * shot      the camera: land / port (a phone upright): { pos, look, fov }; iceLand / icePort in winter
 * stock     what lives there: pattern (the school, repeated), deep (the dark shadows), mult (bite odds per species;
 *           the starfin comes at dusk everywhere)
 * pile      where landed fish lie, and the creel (see makePile)
 * hide      the ambient shoal near this centre steps aside while she fishes: { x, z, r }
 */
export const SPOTS = {
  // Rin's dock at Kawabe: the end of the planks, looking north over the open water (the ferry moors to the east).
  dock: {
    id: 'dock',
    interact: { id: 'fishingSpot', x: 4.2, y: 0.9, z: 30, r: 2.6 },
    label: N_('Fish'),
    stand: { x: 3.8, z: 30.1, y: 0.72 },
    leave: 4.5,
    area: {
      wide: { cx: 9.4, cz: 23.6, rx: 4.6, rz: 4.9, clear: 9.5 },
      tall: { cx: 8.7, cz: 23.4, rx: 2.7, rz: 5.0, clear: 8.6 },
      ice: { cx: 8.3, cz: 25.6, rx: 1.75, rz: 1.75, clear: 3.3, hole: 2.1 },
    },
    allow: { minX: 6.3, maxZ: 28.3 },
    shot: {
      land: { pos: [3.2, 8.0, 35.9], look: [7.8, -0.2, 25.5], fov: 55 },
      port: { pos: [1.5, 10.0, 35.0], look: [7.7, -0.2, 24.7], fov: 63 },
      iceLand: { pos: [2.9, 7.0, 34.7], look: [7.1, 0, 26.6], fov: 55 },
      icePort: { pos: [1.7, 9.8, 35.3], look: [7.1, 0, 26.6], fov: 68 },
    },
    stock: { pattern: ['trout', 'char', 'trout', 'koi', 'trout'], deep: ['koi', 'trout'], mult: null },
    pile: makePile({
      origin: { x: 2.84, z: 29.44 }, yaw: Math.PI, side: { x: -1, z: 0 }, y: 0.72,
      region: { x0: 0.2, x1: 4.3, z0: 28.75, z1: 31.25 },
      creel: { x: 3.3, z: 29.08, r: 0.24 },
      keepOut: [{ x: 3.8, z: 30.1, r: 0.5 }, { x: 3.6, z: 31.2, r: 0.55 }],     // Mika's feet; Rin's place in chapter one
    }),
    hide: { x: 9, z: 28, r: 9 },
  },

  // Ōta's mill: the sandy bank south of the stone landing, looking east over the still pool below the Mill Lamp island.
  // (Not on the race under the wheel, and clear of the wheel, the door, the drawbridge, the lamp step and the sky spot.)
  mill: {
    id: 'mill',
    interact: { id: 'fishingSpotMill', x: -10.0, y: 0.55, z: -35.2, r: 2.6 },
    label: N_('Fish'),
    stand: { x: -10.2, z: -35.4, y: null },
    leave: 4.5,
    area: {
      wide: { cx: -2.3, cz: -35.8, rx: 4.9, rz: 3.7, clear: 9.2 },
      tall: { cx: -2.6, cz: -36.0, rx: 5.0, rz: 3.0, clear: 8.6 },
      ice: { cx: -5.6, cz: -35.6, rx: 1.75, rz: 1.75, clear: 3.3, hole: 2.1 },
    },
    allow: { minX: -7.4 },
    shot: {
      land: { pos: [-13.4, 9.0, -28.2], look: [-4.6, -0.3, -36.4], fov: 58 },
      port: { pos: [-17.2, 12.0, -31.0], look: [-3.2, -0.3, -37.3], fov: 63 },
      iceLand: { pos: [-14.0, 7.0, -32.4], look: [-5.2, 0, -36.4], fov: 55 },
      icePort: { pos: [-14.4, 9.6, -32.2], look: [-5.2, 0, -36.2], fov: 66 },
    },
    // the koi that "escaped from Ōta's mill pond" live here: they are common, the trout and char a little less so
    stock: { pattern: ['koi', 'trout', 'char', 'koi', 'trout'], deep: ['koi', 'koi'], mult: { trout: 0.8, char: 1, koi: 3.5 } },
    pile: makePile({
      origin: { x: -10.9, z: -34.55 }, yaw: Math.PI / 2, side: { x: 0, z: 1 },
      creel: { x: -10.0, z: -33.75, r: 0.24 },
      keepOut: [{ x: -10.2, z: -35.4, r: 0.5 }],                                // Mika's feet
    }),
    hide: { x: 0, z: -34, r: 9 },
  },
};
export const SPOT_IDS = Object.keys(SPOTS);

/** The place whose "Fish" prompt has this interactable id (null when it is not one). */
export function spotByInteract(id) { return Object.values(SPOTS).find(s => s.interact.id === id) || null; }

/** Which area the screen shows: a phone held upright gets the tall one, winter the hole in the ice. */
export function areaFor(spot, tall, frozen) {
  return frozen ? spot.area.ice : tall > 0.5 ? spot.area.tall : spot.area.wide;
}

/** Whether a float may land at (x, z): inside the allowed box (and the hole in winter). Depth and the ellipse are the view's. */
export function allowed(spot, x, z, frozen = false) {
  if (frozen) return Math.hypot(x - spot.area.ice.cx, z - spot.area.ice.cz) <= spot.area.ice.hole - 0.55;
  const a = spot.allow || {};
  return !(x < (a.minX ?? -Infinity) || x > (a.maxX ?? Infinity) || z < (a.minZ ?? -Infinity) || z > (a.maxZ ?? Infinity));
}
