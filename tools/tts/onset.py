"""Onset quality of a TTS take: does the voice tremble / warble as it starts?

Owner listen 2026-11-28 (VieNeu "Trúc Ly", "Cơm chín rồi!..."): takes 0 and 1 have "some vibration at the beginning",
take 2 does not. In the pitch track the bad takes swing up and back down inside the first syllable (t0 ~1 semitone,
t1 ~4 semitones over 0.1 s, plus an amplitude dip in t0's attack); the good take holds its tone.

Measured on the first voiced run (pYIN, 5 ms hop), at most WIN_S long, 15 ms trimmed at both edges. bake.py scores
the DECODED clip (what ships): pYIN's voicing edge, and so the run length, can move with the AAC round trip.
  pitch  = fast back-swings of the pitch contour in cents: a zig-zag with HYST_C hysteresis splits it into monotone
           legs; every pair of adjacent legs that are both LEG_MIN..LEG_MAX long, where the return is at least RATIO
           of the swing, adds its smaller height. A held, rising or falling tone, a slow intonation arch and a pitch
           accent (small rise, big fall) score 0; a quick up-and-back (tremble, warble, vibrato) scores its height.
  amp    = the deepest dip (dB) of the loudness envelope in the attack (first ATTACK_S of voicing): logged only,
           it did not separate the owner's takes.
  score  = pitch / PITCH_REF; a take fails when score > THRESHOLD (1.0).
  Owner takes (raw wav): t0 1.17, t1 3.50, t2 0.00.

  python tools/tts/onset.py a.wav b.m4a ...    prints the numbers (any venv with librosa; PyAV for .m4a)
"""
from __future__ import annotations

import sys
from pathlib import Path

SR = 24000
HOP = 120            # 5 ms
WIN_S = 0.25         # analyse the first 250 ms of the first voiced run
ATTACK_S = 0.12
EDGE = 3             # frames trimmed at both ends of the run (voicing edges are unreliable)
HYST_C = 12.0
HYST_DB = 2.0
PITCH_REF = 60.0     # cents of counter-movement that make score 1.0
AMP_REF = 4.0        # dB of attack dip that make score 1.0
THRESHOLD = 1.0
MIN_RUN = 8          # 40 ms
LEG_MIN = 3          # 15 ms: shorter legs are pitch-tracker glitches
LEG_MAX = 20         # 100 ms: longer legs are intonation, not a tremble
RATIO = 0.5          # the back swing returns at least half way: a pitch accent (small rise, big fall) is not a tremble


def _legs(c, hyst):
    """Zig-zag of contour c (one value per frame) with hysteresis: [(height, frames)] of each monotone leg."""
    if len(c) < 2:
        return []
    pts = [(0, c[0])]
    ext, ei, d = c[0], 0, 0
    for i, v in enumerate(c[1:], 1):
        if d == 0:
            if abs(v - c[0]) >= hyst:
                d, ext, ei = (1 if v > c[0] else -1), v, i
        elif (v - ext) * d > 0:
            ext, ei = v, i
        elif abs(v - ext) >= hyst:
            pts.append((ei, ext)); ext, ei, d = v, i, -d
    pts.append((ei, ext) if d else (len(c) - 1, c[-1]))
    return [(abs(b[1] - a[1]), b[0] - a[0]) for a, b in zip(pts, pts[1:])]


def _wobble(c, hyst, min_f, max_f, ratio=0.0):
    """Sum of fast back-swings: for each pair of adjacent legs both min_f..max_f frames long, the smaller height.
    A held, rising or falling tone has one leg (0); a slow intonation arch has long legs (0); a quick
    up-and-back (tremble, warble, vibrato) scores its height, every cycle counted."""
    L = _legs(c, hyst)
    return float(sum(min(a1, a2) for (a1, d1), (a2, d2) in zip(L, L[1:])
                     if min_f <= d1 <= max_f and min_f <= d2 <= max_f and min(a1, a2) >= ratio * max(a1, a2)))


def _max_dip(x, hyst):
    """Deepest fall-and-recover (dB) in x: a dip of at least hyst that comes back up by hyst."""
    best, peak = 0.0, x[0] if len(x) else 0.0
    lo = peak
    for v in x[1:]:
        if v > peak:
            peak = v; lo = v
        else:
            lo = min(lo, v)
            if v - lo >= hyst:
                best = max(best, min(peak, v) - lo)
    return float(best)


def onset_score(a, sr=SR) -> dict:
    """a: mono float audio. Returns {score, pitch, amp, t_on, run_ms} (score > THRESHOLD = trembly start)."""
    import numpy as np, librosa
    from scipy.signal import medfilt
    a = np.asarray(a, np.float32).reshape(-1)
    if sr != SR:
        a = librosa.resample(a, orig_sr=sr, target_sr=SR)
    a = a[: int(1.6 * SR)]
    if len(a) < SR // 5:
        return dict(score=0.0, pitch=0.0, amp=0.0, t_on=None, run_ms=0)
    f0, v, _ = librosa.pyin(a, fmin=65, fmax=600, sr=SR, frame_length=1024, hop_length=HOP)
    rms = librosa.feature.rms(y=a, frame_length=240, hop_length=HOP)[0]
    n = min(len(f0), len(rms))
    f0, v, db = f0[:n], v[:n] & np.isfinite(f0[:n]), 20 * np.log10(rms[:n] + 1e-6)
    run, s = None, None
    for i, x in enumerate(list(v) + [False]):
        if x and s is None:
            s = i
        elif not x and s is not None:
            if i - s >= MIN_RUN:
                run = (s, i); break
            s = None
    if run is None:
        return dict(score=0.0, pitch=0.0, amp=0.0, t_on=None, run_ms=0)
    s, e = run
    e = min(e, s + int(WIN_S * SR / HOP))
    seg = f0[s:e]
    c = 1200 * np.log2(seg / np.median(seg))
    # octave slips: drop frames more than 700 cents off the run's median
    c = c[np.abs(c) < 700]
    c = c[EDGE: max(EDGE + 1, len(c) - EDGE)]
    c = medfilt(c, 3) if len(c) >= 3 else c
    pitch = _wobble(list(map(float, c)), HYST_C, LEG_MIN, LEG_MAX, RATIO)
    legs = [(round(h), n * HOP * 1000 // SR) for h, n in _legs(list(map(float, c)), HYST_C)]
    att = db[s: min(e, s + int(ATTACK_S * SR / HOP))]
    amp = _max_dip(list(map(float, att)), HYST_DB)
    score = pitch / PITCH_REF
    return dict(score=round(float(score), 2), pitch=round(float(pitch), 1), amp=round(float(amp), 1),
                t_on=round(s * HOP / SR, 3), run_ms=(e - s) * HOP * 1000 // SR, legs=legs)


def load(path) -> "np.ndarray":
    import numpy as np
    p = Path(path)
    if p.suffix.lower() in (".m4a", ".mp4", ".aac", ".ogg", ".mp3"):
        import av
        c = av.open(str(p))
        sr = c.streams.audio[0].rate
        x = np.concatenate([f.to_ndarray().mean(0) if f.to_ndarray().ndim > 1 and f.to_ndarray().shape[0] > 1
                            else f.to_ndarray().reshape(-1) for f in c.decode(audio=0)]).astype(np.float32)
        c.close()
        return x, sr
    import soundfile as sf
    x, sr = sf.read(str(p), dtype="float32")
    if x.ndim > 1:
        x = x.mean(1)
    return x, sr


if __name__ == "__main__":
    import warnings
    warnings.filterwarnings("ignore")
    for f in sys.argv[1:]:
        r = onset_score(*load(f))
        print(f"{'FAIL' if r['score'] > THRESHOLD else 'ok  '} {r['score']:5.2f}  pitch {r['pitch']:6.1f} c  amp {r['amp']:4.1f} dB  "
              f"run {r['run_ms']:3d} ms  {'/'.join(Path(f).parts[-3:])}  legs {r['legs']}", flush=True)
