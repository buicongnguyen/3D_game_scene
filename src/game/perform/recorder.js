// Record a performance: the canvas (captureStream) and the song's audio into one video file, after Avatar Studio Club
// mode's Record and its YouTube kit (captions from the lyrics). mp4 where MediaRecorder writes it (Safari / iOS, new
// Chromes), else webm. The caller caps the picture (720p on phones) and stops it at the song's end.
//   pickType(isTypeSupported) -> { mime, ext } | null      (pure)
//   srtFromLyrics(lyrics, offset) -> string                 (pure: SubRip captions on the video's clock, CRLF, no BOM)
//   startRecording(canvas, audioStream, { fps, bitrate }) -> { stop() -> Promise<{ blob, ext, mime, secs }>, secs() }
export const TYPES = Object.freeze([
  ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'mp4'], ['video/mp4;codecs=avc1,mp4a', 'mp4'], ['video/mp4', 'mp4'],
  ['video/webm;codecs=vp9,opus', 'webm'], ['video/webm;codecs=vp8,opus', 'webm'], ['video/webm', 'webm'],
]);
export function pickType(supported) {
  for (const [mime, ext] of TYPES) { try { if (supported(mime)) return { mime, ext }; } catch { /* next */ } }
  return null;
}

const stamp = s => { const ms = Math.max(0, Math.round(s * 1000)), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, x = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
/** Captions from <id>.lyrics.json: song time t -> video time t - offset (the song time the take started at); lines before it are left out. */
export function srtFromLyrics(lyrics, offset = 0, end = Infinity) {
  const out = []; let n = 0;
  for (const l of lyrics?.lines || []) {
    const t = Number(l.t) - offset, e = Math.min(Number(l.e), end) - offset, text = String(l.text || (l.words || []).map(w => w.w).join(' ')).trim();
    if (!text || !(e > 0) || !(e > t)) continue;
    out.push(`${++n}\r\n${stamp(Math.max(0, t))} --> ${stamp(e)}\r\n${text}\r\n`);
  }
  return out.join('\r\n');
}

export function startRecording(canvas, audioStream, { fps = 30, bitrate = 4_000_000 } = {}) {
  if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) return null;
  const type = pickType(m => MediaRecorder.isTypeSupported(m)); if (!type) return null;
  const video = canvas.captureStream(fps), tracks = [...video.getVideoTracks(), ...(audioStream ? audioStream.getAudioTracks() : [])];
  const stream = new MediaStream(tracks), chunks = [];
  let rec;
  try { rec = new MediaRecorder(stream, { mimeType: type.mime, videoBitsPerSecond: bitrate, audioBitsPerSecond: 128000 }); } catch { return null; }
  rec.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };
  const t0 = performance.now();
  rec.start(1000);
  return {
    type,
    secs: () => (performance.now() - t0) / 1000,
    stop() {
      return new Promise(res => {
        rec.onstop = () => { video.getTracks().forEach(t => t.stop()); res({ blob: new Blob(chunks, { type: type.mime.split(';')[0] }), ext: type.ext, mime: type.mime, secs: (performance.now() - t0) / 1000 }); };
        if (rec.state !== 'inactive') rec.stop(); else rec.onstop();
      });
    },
  };
}

/** Save a blob as a file (a link with download). */
export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
