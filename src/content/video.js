// © 2026 Bui Cong Nguyen · solluxlabs.com
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

// kbps: the encoder's target bitrate for the clip (both cuts); fps: frames a second when not FPS. The arrival is
// filmed at 60: a train crossing the screen judders at 30 (docs/OPENING-LAG-PLAN.md T2), and it is the first thing
// a new player sees. More frames need more bits to stay as sharp.
export const CLIPS = [
  ...TOURS.map(t => ({ id: `tour-${t.id}`, kind: 'tour', tour: t.id, story: 'grandma', lampStyle: 'electric', kbps: 450 })),
  { id: 'intro-grandma', kind: 'intro', story: 'grandma', lampStyle: 'electric', kbps: 880, fps: 60 },
  { id: 'intro-classic', kind: 'intro', story: 'classic', lampStyle: 'flame', kbps: 880, fps: 60 },
  { id: 'title', kind: 'title', story: 'grandma', lampStyle: 'electric', kbps: 400 },
];

/** Frames a second of a clip (a CLIPS entry or a manifest entry). */
export const fpsOf = c => c?.fps || FPS;
export const clipFile = (id, cut, ext = 'mp4') => `${id}-${cut}.${ext}`;
/** The cut for a screen: portrait screens take the tall one. */
export const cutFor = (w, h) => (h > w ? 'tall' : 'wide');
/** Manifest key of a clip for a screen. */
export const clipKey = (id, w, h) => `${id}-${cutFor(w, h)}`;
