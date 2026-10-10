// The phone videos: which clips exist and how they are named (pure data, shared by the recorder
// scripts/record-videos.mjs, the players in game/tour.js and game/video.js, and tests/video.test.mjs).
// The files live in public/video/ next to manifest.json, which the recorder writes: durations and stop times come
// from the take itself, never from here.
import { TOURS } from './tour.js';

export const FPS = 30;
export const TITLE_LOOP = 14;          // seconds of the title's seamless loop
export const VIDEO_DIR = 'video/';

// two cuts of every clip: `wide` for a phone held sideways (and desktops that ask for video), `tall` for portrait
export const CUTS = {
  wide: { w: 960, h: 540 },
  tall: { w: 540, h: 960 },
};

// kbps: the encoder's target bitrate for the clip (both cuts)
export const CLIPS = [
  ...TOURS.map(t => ({ id: `tour-${t.id}`, kind: 'tour', tour: t.id, kbps: 500 })),
  { id: 'intro-grandma', kind: 'intro', story: 'grandma', kbps: 500 },
  { id: 'intro-classic', kind: 'intro', story: 'classic', kbps: 500 },
  { id: 'title', kind: 'title', kbps: 400 },
];

export const clipFile = (id, cut, ext = 'mp4') => `${id}-${cut}.${ext}`;
/** The cut for a screen: portrait screens take the tall one. */
export const cutFor = (w, h) => (h > w ? 'tall' : 'wide');
/** Manifest key of a clip for a screen. */
export const clipKey = (id, w, h) => `${id}-${cutFor(w, h)}`;
