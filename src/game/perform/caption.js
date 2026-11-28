// The lyric caption under a performance (Sing & Play, docs/SING-AND-PLAY.md "Singer, Song and the lyric caption"): the
// line being sung, karaoke style: the word sung now lit, the words before it sung, the rest still to come. Pure and
// cheap: the DOM is touched only when the line or the lit word changes (singplay.js). Recorded videos stay clean: the
// .srt saved beside a take carries the same lines (recorder.js).

/** How long a line shows around its own time (s): a little before its first word, a short hold after its last. */
export const CAPTION = Object.freeze({ lead: .6, hold: .9, maxChars: 64 });

/** <id>.lyrics.json -> [{ t, e, text, words: [{ w, t, e }] }] (lines without words get one word: the whole line). */
export function captionLines(lyrics) {
  const src = Array.isArray(lyrics?.lines) ? lyrics.lines : [];
  const out = [];
  for (const l of src) {
    const t = Number(l?.t), e = Number(l?.e), text = String(l?.text || '').trim();
    if (!Number.isFinite(t) || !Number.isFinite(e) || e < t || !text) continue;
    const words = Array.isArray(l.words) ? l.words.filter(w => w && Number.isFinite(+w.t) && String(w.w || '').trim()).map(w => ({ w: String(w.w).trim(), t: +w.t, e: Number.isFinite(+w.e) ? +w.e : +w.t })) : [];
    out.push({ t, e, text, words: words.length ? words : [{ w: text, t, e }] });
  }
  return out;
}

/**
 * The caption at song time t: { i (line index), k (the lit word: -1 before the first, words.length after the last) } or
 * null between lines. A line shows from CAPTION.lead before it until CAPTION.hold after it, or until the next one
 * starts showing.
 */
export function captionAt(lines, t) {
  if (!lines?.length || !(t >= 0)) return null;
  let lo = 0, hi = lines.length - 1, i = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (lines[mid].t - CAPTION.lead <= t) { i = mid; lo = mid + 1; } else hi = mid - 1; }
  if (i < 0) return null;
  const l = lines[i];
  if (t > l.e + CAPTION.hold) return null;
  const W = l.words; let k = -1;
  for (let j = 0; j < W.length; j++) if (W[j].t <= t) k = j; else break;
  if (k >= 0 && t > W[k].e && k === W.length - 1) k = W.length;   // (the last word sung: the whole line done)
  return { i, k };
}
