// © 2026 Bui Cong Nguyen · solluxlabs.com
// Record a performance: the canvas (captureStream) and the song's audio into one video file, after Avatar Studio Club
// mode's Record and its YouTube kit (captions from the lyrics). mp4 where MediaRecorder writes it (Safari / iOS, new
// Chromes), else webm. The caller caps the picture (720p on phones) and stops it at the song's end.
//   pickType(isTypeSupported) -> { mime, ext } | null      (pure)
//   srtFromLyrics(lyrics, offset) -> string                 (pure: SubRip captions on the video's clock, CRLF, no BOM)
//   startRecording(canvas, audioStream, { fps, bitrate }) -> { stop() -> Promise<{ blob, ext, mime, secs }>, secs() }
// The author's mark (ui/brand.js) goes into every file made here: the first caption, a corner of each video frame (a 2D
// copy of the canvas, drawn only while recording) and a corner of saved pictures.
import { MARK, stampCanvas } from '../../ui/brand.js';
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
/** Captions from <id>.lyrics.json: song time t -> video time t - offset (the song time the take started at); lines before it are left out.
 *  The first cue is the author's mark (`brand`), from 0 until the first line (1-3 s). */
export function srtFromLyrics(lyrics, offset = 0, end = Infinity, brand = MARK) {
  const out = []; let n = 0;
  for (const l of lyrics?.lines || []) {
    const t = Number(l.t) - offset, e = Math.min(Number(l.e), end) - offset, text = String(l.text || (l.words || []).map(w => w.w).join(' ')).trim();
    if (!text || !(e > 0) || !(e > t)) continue;
    if (!n && brand) out.push(`${++n}\r\n${stamp(0)} --> ${stamp(Math.min(3, Math.max(1, t)))}\r\n${brand}\r\n`);
    out.push(`${++n}\r\n${stamp(Math.max(0, t))} --> ${stamp(e)}\r\n${text}\r\n`);
  }
  return out.join('\r\n');
}

/** A 2D copy of `src` with the mark in its corner, redrawn once a frame (after the game's own frame) while recording. */
function brandedSource(src) {
  if (typeof document === 'undefined' || typeof requestAnimationFrame === 'undefined') return null;
  const out = document.createElement('canvas'), ctx = out.getContext('2d', { alpha: false });
  if (!ctx || !out.captureStream) return null;
  let on = true, raf = 0;
  const draw = () => {
    if (!on) return;
    raf = requestAnimationFrame(draw);
    const w = src.width, h = src.height;
    if (!w || !h) return;
    if (out.width !== w || out.height !== h) { out.width = w; out.height = h; }
    try { ctx.drawImage(src, 0, 0); stampCanvas(ctx, w, h); } catch { /* a lost context: keep the last frame */ }
  };
  draw();
  return { canvas: out, stop() { on = false; cancelAnimationFrame(raf); out.width = out.height = 0; } };
}

export function startRecording(canvas, audioStream, { fps = 30, bitrate = 4_000_000 } = {}) {
  if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) return null;
  const type = pickType(m => MediaRecorder.isTypeSupported(m)); if (!type) return null;
  const brand = brandedSource(canvas);
  const video = (brand?.canvas || canvas).captureStream(fps), tracks = [...video.getVideoTracks(), ...(audioStream ? audioStream.getAudioTracks() : [])];
  const stream = new MediaStream(tracks), chunks = [];
  let rec;
  try { rec = new MediaRecorder(stream, { mimeType: type.mime, videoBitsPerSecond: bitrate, audioBitsPerSecond: 128000 }); } catch { brand?.stop(); return null; }
  rec.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };
  const t0 = performance.now();
  rec.start(1000);
  return {
    type,
    secs: () => (performance.now() - t0) / 1000,
    stop() {
      return new Promise(res => {
        rec.onstop = () => { video.getTracks().forEach(t => t.stop()); brand?.stop(); res({ blob: new Blob(chunks, { type: type.mime.split(';')[0] }), ext: type.ext, mime: type.mime, secs: (performance.now() - t0) / 1000 }); };
        if (rec.state !== 'inactive') rec.stop(); else rec.onstop();
      });
    },
  };
}

/** Save a blob as a file (a link with download). Pictures get the author's mark in their corner first. */
export function saveBlob(blob, name) {
  if (/^image\/(png|jpeg|webp)$/.test(blob?.type || '') && !blob.branded && typeof createImageBitmap === 'function' && typeof document !== 'undefined') {
    const plain = () => { blob.branded = true; saveBlob(blob, name); };
    createImageBitmap(blob).then(bm => {
      const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height;
      const ctx = c.getContext('2d'); ctx.drawImage(bm, 0, 0); bm.close?.(); stampCanvas(ctx, c.width, c.height);
      c.toBlob(b => { c.width = 0; if (b) { b.branded = true; saveBlob(b, name); } else plain(); }, blob.type, 0.92);
    }, plain);
    return;
  }
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
