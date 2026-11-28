// © 2026 Bui Cong Nguyen · solluxlabs.com
// A song's files for a show (Sing & Play: game/singplay/singplay.js; the Night Star's show: game/nightstar/night-star.js).

/**
 * Fetch a song's data files: { song, beats, lyrics, mouth, stage, url } or null. A library song (content/song-catalog.js:
 * `files` names its versioned files, `remote`) also fetches its whole audio first and plays that copy (a blob: URL): one
 * download, kept by the service worker for the next time, the same sound for Web Audio and Record. null when it fails.
 */
export async function loadSong(e, { fetch: get = globalThis.fetch } = {}) {
  const json = url => Promise.resolve().then(() => get(url)).then(r => (r.ok ? r.json() : null)).catch(() => null);
  const meta = e.meta ? await json(e.base + e.meta) : null, song = { ...(meta || {}), ...e, id: e.id };
  const file = k => (e.files ? (e.files[k] ? e.base + e.files[k] : null) : `${e.base}${e.id}.${k}.json`);
  const [beats, lyrics, mouth, stage] = await Promise.all(['beats', 'lyrics', 'mouth', 'stage'].map(k => (file(k) ? json(file(k)) : null)));
  let url = e.base + (e.audio || `${e.id}.m4a`);
  if (e.remote) {
    const blob = await Promise.resolve().then(() => get(url)).then(r => (r.ok ? r.blob() : null)).catch(() => null);
    if (!blob?.size || typeof URL?.createObjectURL !== 'function') return null;
    url = URL.createObjectURL(blob.type === 'audio/mp4' ? blob : new Blob([blob], { type: 'audio/mp4' }));   // (Safari goes by the type)
  }
  return song.bpm > 0 || beats ? { song, beats, lyrics, mouth, stage, url } : null;
}
