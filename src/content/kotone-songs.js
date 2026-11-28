// © 2026 Bui Cong Nguyen · solluxlabs.com
// Kotone's songs for her evening show (game/kotone-show.js performs one whole song at a time: game/perform/) and for
// Sing & Play (game/singplay/singplay.js).
import { N_ } from '../i18n/i18n.js';
import { mergeSongs } from './song-catalog.js';

// A song is its audio plus the data files next to it in `base` (any may be missing except the audio):
//   <id>.beats.json   the beat grid (version 1: beats, downbeats, sections, energy)   else bpm + offset below
//   <id>.stage.json   named sections (intro, verse, pre, chorus, bridge, outro)        else the lyric labels
//   <id>.lyrics.json  lines with word timings and section labels (when she sings, the mic moves)
//   <id>.mouth.json   the mouth curves of the vocal (v2: open, pucker at 25 fps)       else the lyric timings
// To add a song: put its files in public/songs/kotone/ and one line here, e.g.
//   { id: 'kotone-song', title: 'Kotone Song', base: 'songs/kotone/', audio: 'kotone-song.m4a', bpm: 100, offset: 0.4, duration: 180, mood: 'uplifting', language: 'en+vi' },
// (bpm / offset / duration only matter without a beats.json; mood picks the dance energy: tender / slow songs stay calm.)
// `language`: the song she sings is the one in the game's language (songsFor), English where there is none (ko, ja).
// Her song (2026-11-28, the owner's picks from .tools/kotone-song: EN-C and VI-B): "Golden Rails", one tune sung in English
// and in Vietnamese (ACE-Step 1.5 XL sft, original lyrics; the takes' credits are in .tools/kotone-song/web/songs.kotone.json).
// Only the sung mix ships (.m4a: AAC plays on every browser, older iPhones too); far from her, Mika hears it quieter.
// Sing & Play adds the song library to these (content/song-catalog.js: the starline-songs repo); these stay the built-in
// set it falls back to offline.
export const KOTONE_SONGS = [
  { id: 'golden-rails-en', title: N_('Golden Rails'), base: 'songs/kotone/', audio: 'golden-rails-en.m4a', bpm: 86.7, offset: 0.475, duration: 88, mood: 'uplifting', language: 'en' },
  { id: 'golden-rails-vi', title: N_('Golden Rails'), base: 'songs/kotone/', audio: 'golden-rails-vi.m4a', bpm: 85, offset: 0.095, duration: 88, mood: 'uplifting', language: 'vi' },
];

// `singer` (optional): whose song it is. The Night Star's show at the night festival (game/nightstar/) sings the songs
// with `singer: 'night-star'` (in the game's language, songsFor); without one she sings Kotone's (showSongs).
// Her song "Night Star" / "Ngôi Sao Đêm" (2026-11-28) is in the song library (the starline-songs catalog's night-star-en /
// night-star-vi entries carry `singer: 'night-star'`, content/song-catalog.js keeps it): her show reads the catalog
// (showSongsWith), and sings Golden Rails when it cannot (offline, ?qa). A built-in song of hers would be one entry here, e.g.
//   { id: 'night-star-en', title: N_('Night Star'), base: 'songs/kotone/', audio: 'night-star-en.m4a', bpm: 102, offset: 0.3, duration: 160, mood: 'dreamy', language: 'en', singer: 'night-star' },
// In Sing & Play every singer may sing every song (the Song row lists them all).

/** The songs a show by `singer` sings in language `lang`: her own (`singer` field), else the songs nobody owns. */
export function showSongs(list, singer, lang) {
  const own = list.filter(s => s.singer && s.singer === singer);
  return songsFor(own.length ? own : list.filter(s => !s.singer), lang);
}

/**
 * showSongs with the song library (`lib`: content/song-catalog.js catalogSongs, or null): the singer's own songs from the
 * built-in and library songs; when she has none there, the built-in songs only (a show never loads the library's others).
 */
export function showSongsWith(builtIn, lib, singer, lang) {
  const all = mergeSongs(builtIn, lib || []);
  return showSongs(all.some(s => s.singer && s.singer === singer) ? all : builtIn, singer, lang);
}

/**
 * The songs for the game's language `lang` ('en', 'vi', 'ko', 'ja'): those sung in it, else the English ones. An entry
 * without a `language` (a test page's `?kotoneSong=`, an instrumental) goes with every language; 'en+vi' with either.
 */
export function songsFor(list, lang) {
  const langs = s => (s.language && !s.instrumental ? String(s.language).split('+') : null);
  const sungIn = l => list.filter(s => !langs(s) || langs(s).includes(l));
  const own = list.filter(s => langs(s)?.includes(lang));
  return own.length ? sungIn(lang) : sungIn('en');
}

/**
 * Her hum (HUM-A): a wordless 8-bar loop she hums now and then on a day walk when Mika is near (game/kotone-hum.js).
 * The file is a 0.25 s lead-in + the 8 bars + a 0.25 s tail; it loops between loopStart and loopEnd (Web Audio
 * AudioBufferSourceNode.loopStart / loopEnd, never <audio loop>). The seam lines up in both files (Chromium / Edge decode,
 * .tools/seam-check.mjs: no lag, 0.99 correlation): .ogg where the browser plays Vorbis, else .m4a (Safari, iPhones).
 * mouth.json frame 0 = loopStart.
 */
export const KOTONE_HUM = Object.freeze({ id: 'kotone-hum', base: 'songs/kotone/', ogg: 'kotone-hum.ogg', m4a: 'kotone-hum.m4a', loopStart: 0.25, loopEnd: 23.242792, bpm: 84 });

/**
 * A song entry from a test page (`?kotoneSong=<base><id>`: the folder and id of a song's files, same origin, no scheme):
 * reads <base><id>.song.json (an Avatar Studio songs.json row) for its bpm / offset / duration / mood.
 */
export function songFromParam(param) {
  if (!param || /[:\\]|\.\./.test(param.replace(/^\/@fs\/[A-Za-z]:/, ''))) return null;
  const i = param.lastIndexOf('/'), base = param.slice(0, i + 1), id = param.slice(i + 1);
  return id ? { id, base, audio: `${id}.m4a`, meta: `${id}.song.json` } : null;
}
