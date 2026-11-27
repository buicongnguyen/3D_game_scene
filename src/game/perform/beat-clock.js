// A song's musical time as pure functions of song time t (seconds): beats, bars, sections, energy. Ported from Avatar
// Studio's Club mode (src/club/beat-clock.js, "Shared interfaces" in its docs/club/PLAN.md), without the audio analysis
// (Starline never decodes a song: the song files carry their grid).
//
//   createBeatClock(song, { beats, sections, lyrics }) -> { beatAt, barAt, phase, sectionAt, energyAt, bpmAt, beatTime, ... }
//     song      { id, bpm, offset, duration, loopEnd, mood, clubFx }   (the songs list entry, content/kotone-songs.js)
//     beats     <id>.beats.json (version 1: every beat, downbeats, sections, energy), optional
//     sections  <id>.stage.json's sections, optional (wins over beats.json's: the studio's own plan)
//     lyrics    <id>.lyrics.json, optional (its section labels when nothing else names the sections)
// Beat 0 = the first downbeat, so beatAt / barAt are negative before it. Grid: beats.json, else bpm + offset, else bpm +
// the first lyric. Sections: stage.json, beats.json, the lyric labels, a plain verse / chorus arc.

export const SECTION_KINDS = Object.freeze(['intro', 'verse', 'prechorus', 'chorus', 'drop', 'bridge', 'break', 'outro']);
export const KIND_ENERGY = Object.freeze({ intro: .32, verse: .45, prechorus: .62, chorus: .86, drop: 1, bridge: .5, break: .28, outro: .3 });
const SECTION_SNAP = .08;   // s: a stage section line this close to a beats.json downbeat moves onto it

const finite = v => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const mod = (n, m) => ((n % m) + m) % m;

/** Any section label (beats.json, stage.json, a lyric "Pre-Chorus") -> one of SECTION_KINDS. */
export function normalizeKind(kind) {
  const k = String(kind || '').toLowerCase().replace(/[^a-z]/g, '');
  if (SECTION_KINDS.includes(k)) return k;
  if (k === 'pre' || k === 'build' || k === 'buildup') return 'prechorus';
  if (k === 'hook' || k === 'refrain' || k === 'postchorus') return 'chorus';
  if (k === 'breakdown' || k === 'interlude' || k === 'instrumental' || k === 'inst') return 'break';
  if (k === 'ending' || k === 'end') return 'outro';
  if (k === 'start' || k === 'opening') return 'intro';
  return 'verse';
}

/** Calm / tender songs never step in double time (Avatar Studio src/beat-sync.js isCalmSong). */
export function isCalmSong(song = {}) {
  const mood = String(song.mood || '').toLowerCase(), bpm = Number(song.bpm) || 0;
  if (song.clubFx === 'calm' || /tender|slow|ballad|lullaby|calm/.test(mood)) return true;
  return bpm > 0 && bpm < 86 && !/uplifting|upbeat|bright|anthem|dance|party|groove|r&b/.test(mood);
}

/**
 * Beat sync (Studio src/beat-sync.js): a move authored at moveBpm plays m move beats per song beat, m in {1/2, 1, 2},
 * the m whose rate is nearest 1 inside 0.8..1.2; calm songs never double; nothing fits: the half-time side down to 0.5.
 */
export function beatRate(songBpm, moveBpm = 120, { calm = false } = {}) {
  const s = songBpm > 0 ? songBpm : moveBpm, ms = calm ? [1, .5] : [1, .5, 2], c = ms.map(m => ({ m, rate: m * s / moveBpm })), dist = x => Math.abs(Math.log(x.rate));
  const ok = c.filter(x => x.rate >= .8 - 1e-9 && x.rate <= 1.2 + 1e-9).sort((a, b) => dist(a) - dist(b) || a.m - b.m)[0];
  if (ok) return { ...ok, ok: true };
  const slow = c.filter(x => x.rate < .8 && x.rate >= .5 - 1e-9).sort((a, b) => b.rate - a.rate)[0];
  return { ...(slow || [...c].sort((a, b) => dist(a) - dist(b))[0]), ok: false };
}

function lastAtOrBefore(times, t) {
  let lo = 0, hi = times.length - 1, hit = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (times[mid] <= t) { hit = mid; lo = mid + 1; } else hi = mid - 1; }
  return hit;
}
function continuousIndex(times, t) {
  const n = times.length;
  if (n === 1) return t - times[0];
  const i = lastAtOrBefore(times, t);
  if (i < 0) return (t - times[0]) / (times[1] - times[0]);
  if (i >= n - 1) return n - 1 + (t - times[n - 1]) / (times[n - 1] - times[n - 2]);
  return i + (t - times[i]) / (times[i + 1] - times[i]);
}
const sortedTimes = list => { if (!Array.isArray(list)) return null; const o = list.filter(finite).sort((a, b) => a - b); return o.filter((v, i) => i === 0 || v - o[i - 1] > .2); };
function sampleEnvelope(env, t) {
  const v = env?.values; if (!v?.length || !(env.fps > 0)) return 0;
  const x = t * env.fps; if (!(x >= 0)) return 0;
  const i = Math.floor(x); if (i >= v.length - 1) return v[v.length - 1] ?? 0;
  return v[i] + (v[i + 1] - v[i]) * (x - i);
}
function normalizeEnergy(env) {
  const values = (env?.values || []).map(v => (finite(v) ? v : 0)), ref = [...values].sort((a, b) => a - b)[Math.floor(.95 * (values.length - 1))] || 0;
  if (!(ref >= .05)) return { fps: env.fps, values };
  return { fps: env.fps, values: values.map(v => clamp(v / ref, 0, 1)) };
}
function sectionsFromList(list, duration) {
  if (!Array.isArray(list)) return null;
  const rows = list.filter(s => s && finite(s.t)).map(s => ({ t: Math.max(0, s.t), kind: normalizeKind(s.kind ?? s.name), label: String(s.name || s.kind || '') })).sort((a, b) => a.t - b.t);
  if (!rows.length) return null;
  rows.forEach((s, i) => { s.e = rows[i + 1]?.t ?? Math.max(s.t + 1, duration); });
  if (rows[0].t > 0) rows.unshift({ t: 0, e: rows[0].t, kind: 'intro', label: 'Intro' });
  return rows;
}
function sectionsFromLyrics(lyrics, duration) {
  const lines = (lyrics?.lines || []).filter(l => finite(l?.t)).sort((a, b) => a.t - b.t);
  if (!lines.some(l => l.section)) return null;
  const rows = [];
  for (const l of lines) if (l.section || !rows.length) rows.push({ t: l.t, kind: normalizeKind(l.section || 'verse'), label: String(l.section || 'Verse') });
  const last = lines[lines.length - 1], end = finite(last.e) ? last.e : last.t + 2;
  if (duration > end + 4) rows.push({ t: end + .5, kind: 'outro', label: 'Outro' });
  return sectionsFromList(rows, duration);
}
function defaultArc(duration, barLength, start) {
  const rows = [], bars = n => n * barLength; let t = 0;
  const push = (kind, len) => { const e = Math.min(duration, t + len); if (e > t) rows.push({ t, e, kind, label: kind }); t = e; };
  push('intro', start + bars(8));
  while (t < duration - bars(8)) { push('verse', bars(16)); if (t < duration - bars(8)) push('chorus', bars(8)); }
  push('outro', duration - t);
  return rows;
}

export function createBeatClock(song = {}, data = {}) {
  const json = data.beats?.version === 1 ? data.beats : null, beatList = json ? sortedTimes(json.beats) : null, grid = beatList && beatList.length >= 8 ? beatList : null;
  const duration = [song.loopEnd, json?.duration, song.duration].find(v => finite(v) && v > 0) || 0;
  const meter = Number.isInteger(json?.meter) && json.meter >= 2 && json.meter <= 12 ? json.meter : 4;
  const info = { source: '', bpm: 0, offset: 0, meter };
  let beatAt, beatTime, downbeats = null;
  if (grid) {
    info.source = 'beats';
    const given = sortedTimes(json.downbeats)?.filter(t => t >= grid[0] - .05);
    downbeats = given && given.length >= 2 ? given : grid.filter((_, i) => i % meter === 0);
    const zero = Math.max(0, lastAtOrBefore(grid, downbeats[0] + .05));
    info.bpm = finite(json.bpm) && json.bpm > 0 ? json.bpm : 60 * (grid.length - 1) / (grid[grid.length - 1] - grid[0]);
    info.offset = downbeats[0];
    beatAt = t => continuousIndex(grid, t) - zero;
    beatTime = i => { const k = i + zero, n = grid.length; if (k >= 0 && k < n && Number.isInteger(k)) return grid[k]; const j = clamp(Math.floor(k), 0, n - 2); return grid[j] + (k - j) * (grid[j + 1] - grid[j]); };
  } else {
    const bpm = finite(song.bpm) && song.bpm > 0 ? song.bpm : 120, period = 60 / bpm;
    const firstLyric = (data.lyrics?.lines || []).map(l => l?.t).filter(finite).sort((a, b) => a - b)[0];
    let offset = finite(song.offset) ? song.offset : finite(firstLyric) ? mod(firstLyric, period * meter) : 0;
    if (offset < 0) offset = mod(offset, period);
    info.source = 'bpm'; info.bpm = bpm; info.offset = offset;
    beatAt = t => (t - offset) / period;
    beatTime = i => offset + i * period;
  }
  const barAt = downbeats ? t => continuousIndex(downbeats, t) : t => beatAt(t) / meter;
  const barLength = 60 / info.bpm * meter;
  const measured = json?.energy?.values?.length && json.energy.fps > 0 ? normalizeEnergy(json.energy) : null;
  let sections = data.sections ? sectionsFromList(data.sections, duration) : null;
  if (sections && downbeats) {
    const snap = t => { const i = lastAtOrBefore(downbeats, t + SECTION_SNAP); return i >= 0 && Math.abs(downbeats[i] - t) <= SECTION_SNAP ? downbeats[i] : t; };
    sections.forEach((x, i) => { if (i > 0) x.t = snap(x.t); });
    sections.forEach((x, i) => { if (sections[i + 1]) x.e = sections[i + 1].t; });
  }
  if (!sections && json?.sections) sections = sectionsFromList(json.sections, duration);
  if (!sections && data.lyrics) sections = sectionsFromLyrics(data.lyrics, duration);
  if (!sections) sections = defaultArc(duration || 180, barLength, info.offset);
  sections = Object.freeze(sections.map((s, index) => Object.freeze({ ...s, index })));
  const starts = sections.map(s => s.t);
  const sectionAt = t => sections[Math.max(0, lastAtOrBefore(starts, t))];
  const energyAt = t => { if (measured) return clamp(sampleEnvelope(measured, t), 0, 1); return KIND_ENERGY[sectionAt(t).kind] ?? .5; };
  const phase = t => { const b = beatAt(t); return b - Math.floor(b); };
  const bpmAt = t => { if (!grid) return info.bpm; const i = clamp(lastAtOrBefore(grid, t), 0, grid.length - 2); return 60 / (grid[i + 1] - grid[i]); };
  /** Song time of bar n's downbeat. */
  const barTime = n => (downbeats ? (Number.isInteger(n) && n >= 0 && n < downbeats.length ? downbeats[n] : beatTime(n * meter)) : beatTime(n * meter));
  return Object.freeze({ beatAt, barAt, phase, sectionAt, energyAt, bpmAt, beatTime, barTime, meter, duration, barLength, sections, info: Object.freeze(info), songId: song.id || '', calm: isCalmSong(song) });
}
