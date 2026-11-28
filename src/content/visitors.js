// © 2026 Bui Cong Nguyen · solluxlabs.com
// The station visitors (game/station-visitors.js): two sisters on a trip. Vita, a cosplayer come early for the summer
// festival (her cyber suit is her festival costume), and her little sister Bibi, who pulls her toward everything. They
// come off the morning train at Hoshi Station, take photos on the station square, ask Mika the way (the voiced scene
// scenes/station.js), walk to the Forest Shrine along the roads, spend the evening there, and leave on the evening train.
// Explore mode only. Pure data and pure helpers (tests/visitors.test.mjs); world x, z in metres (x east, z south).
import { STONES } from '../world/layout.js';
import { N_ } from '../i18n/i18n.js';

export const VISITORS = [
  { id: 'vita', model: 'visitor-vita', name: 'Vita' },
  { id: 'bibi', model: 'visitor-bibi', name: 'Bibi' },
];
export const SCENE_ID = 'station.which';

// the hours of their day (the shown hour: the story clock, a fixed hour from Settings or the free day cycle)
export const HOURS = { arrive: 7, walk: 15.5, evening: 17, leave: 20.5, gone: 21.5 };

/** Which part of their day an hour is in: 'away' | 'day' | 'evening' | 'leaving'. */
export function phaseAt(hour) {
  const h = ((hour % 24) + 24) % 24;
  if (h < HOURS.arrive || h >= HOURS.gone) return 'away';
  if (h < HOURS.evening) return 'day';
  if (h < HOURS.leave) return 'evening';
  return 'leaving';
}

// where they stand. Platform: where they step off the train (platform top, 16.95 m); square: in front of the station,
// west of Kotone's corner (townsfolk.js hoshi.forecourt / hoshi.stage); shrine: the yard below the great hall
export const SPOTS = {
  platform: { x: -95.5, z: 115.7 },
  platformExit: { x: -83, z: 113.5 },
  square: [
    { x: -100.5, z: 103.2, face: Math.PI },        // the station's front, the sign above them
    { x: -103.5, z: 101.5, face: Math.PI * 0.8 },
    { x: -98.5, z: 99.8, face: Math.PI * 1.1 },
  ],
  shrine: [
    { x: 62.5, z: -148.6, face: Math.PI },          // under the upper torii, the hall behind
    { x: 59.6, z: -150.2, face: Math.PI * 0.7 },
    { x: 65.4, z: -150.4, face: Math.PI * 1.3 },
  ],
  fordWest: { x: -16, z: -112 },
  fordEast: { x: 6, z: -112 },
  stairFoot: { x: 62, z: -118 },
};
// the stone steps up the shrine hill (layout.js shrine stairs: x 62, z -122 .. -140) to the yard
export const STAIRS = [[62, -121], [62, -131], [62, -141], [62.4, -146]];
// across the ford on the stepping stones, west to east (tops at y 0.35)
export const STONE_WALK = [[-12, -112], ...[...STONES].sort((a, b) => a[0] - b[0]), [5.4, -112]];
export const STONE_TOP = 0.35;
/** On the stepping stones? (their feet stay on the stones' tops there, not on the river bed) */
export const onStones = (x, z) => x > -11 && x < 4.6 && Math.abs(z + 112.2) < 1.2;

export const WALK_SPEED = 0.95;    // m/s: Bibi's short legs set the pace (her Walk is 0.80 m/s at 1x, Vita's 1.01)
export const FAST = 8;             // where Mika cannot see them, the walk runs this much faster (time passes off-screen)
export const SEEN = 140;           // metres: closer than this, they walk at their own pace
export const LOAD = 120;           // metres from Mika to where they are: bodies made (models fetched) inside this
export const DROP = 170;           // ... and dropped beyond this (with hysteresis)

/** A point a distance s along a polyline [[x, z], ...] and the heading there: { x, z, yaw, end }. */
export function along(path, s) {
  let left = Math.max(0, s);
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1], [bx, bz] = path[i], l = Math.hypot(bx - ax, bz - az);
    if (left <= l || i === path.length - 1) {
      const t = l > 0 ? Math.min(1, left / l) : 1;
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, yaw: Math.atan2(bx - ax, bz - az), end: i === path.length - 1 && left >= l };
    }
    left -= l;
  }
  const p = path[path.length - 1] || [0, 0];
  return { x: p[0], z: p[1], yaw: 0, end: true };
}

/** Where Bibi walks beside her sister: half a metre to Vita's left and a step ahead (she pulls her along). */
export function beside(x, z, yaw, side = 0.75, ahead = 0.35) {
  return { x: x + Math.cos(yaw) * side + Math.sin(yaw) * ahead, z: z - Math.sin(yaw) * side + Math.cos(yaw) * ahead };
}

// what they say when Mika talks to them outside the scene (UI language). [who, line, clip]
export const CHATTER = {
  // the learning scene is off: the same little story as plain dialogue
  ask: [
    ['bibi', N_('Sister, look! The train is so shiny! Take my picture!'), 'Point'],
    ['vita', N_("Excuse me, which way to the shrine? We came early for the summer festival.")],
    ['mika', N_('Over the river and up the stone steps. Just follow the road!')],
    ['vita', N_("Thank you! This suit is my festival costume. I'm a cosplayer!"), 'Cheer'],
    ['bibi', N_('She made it herself! Thank you so much!'), 'Bow'],
  ],
  day: [
    ['vita', N_('Over the river and up the stone steps. We remember! Thank you again.'), 'Wave'],
    ['bibi', N_("I'm the photographer today. Sister has to pose for every picture!"), 'Cheer'],
    ['vita', N_('This costume took me three months. The sun here is making it very warm!')],
    ['bibi', N_('Do they sell sweets at the festival? Sister says only one. One BIG one.'), 'Point'],
  ],
  evening: [
    ['bibi', N_('The lanterns are so pretty! Sister looks like a star in her costume.'), 'Cheer'],
    ['vita', N_('Everyone wants a photo with me. I said yes to all of them.'), 'Wave'],
    ['vita', N_('We take the evening train home. One more look at the lanterns first.')],
  ],
  leaving: [
    ['bibi', N_('Best trip ever! Can we come back next summer?'), 'Wave'],
    ['vita', N_('Thank you for showing us the way. Have a lovely evening!'), 'Bow'],
  ],
};
