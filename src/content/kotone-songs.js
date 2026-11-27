// Kotone's songs for her evening show (game/kotone-show.js performs one whole song at a time: game/perform/).
// A song is its audio plus the data files next to it in `base` (any may be missing except the audio):
//   <id>.beats.json   the beat grid (version 1: beats, downbeats, sections, energy)   else bpm + offset below
//   <id>.stage.json   named sections (intro, verse, pre, chorus, bridge, outro)        else the lyric labels
//   <id>.lyrics.json  lines with word timings and section labels (when she sings, the mic moves)
//   <id>.mouth.json   the mouth curves of the vocal (v2: open, pucker at 25 fps)       else the lyric timings
// To add a song: put its files in public/songs/kotone/ and one line here, e.g.
//   { id: 'kotone-song', title: 'Kotone Song', base: 'songs/kotone/', audio: 'kotone-song.m4a', bpm: 100, offset: 0.4, duration: 180, mood: 'uplifting', language: 'en+vi' },
// (bpm / offset / duration only matter without a beats.json; mood picks the dance energy: tender / slow songs stay calm.)
export const KOTONE_SONGS = [
];

/**
 * A song entry from a test page (`?kotoneSong=<base><id>`: the folder and id of a song's files, same origin, no scheme):
 * reads <base><id>.song.json (an Avatar Studio songs.json row) for its bpm / offset / duration / mood.
 */
export function songFromParam(param) {
  if (!param || /[:\\]|\.\./.test(param.replace(/^\/@fs\/[A-Za-z]:/, ''))) return null;
  const i = param.lastIndexOf('/'), base = param.slice(0, i + 1), id = param.slice(i + 1);
  return id ? { id, base, audio: `${id}.m4a`, meta: `${id}.song.json` } : null;
}
