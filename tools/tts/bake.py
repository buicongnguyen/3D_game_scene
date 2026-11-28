"""Offline TTS bake for Starline's house scenes ("Listening at the table", docs/TRAVEL-LANGUAGE-PLAN.md sections 3, 5.2, 8.2).

Reads .tools/speech/lines.json (node scripts/speech-build.mjs --lines), synthesises every line with the engine named in
its voice profile, scores every take with a Whisper large-v3 round trip, keeps the best take, and writes
  public/speech/<lang>/<scene>/<nn>.m4a     AAC-LC, mono, 24 kHz, 40 kbps
  .tools/speech/report-<lang>.json          what `node scripts/speech-build.mjs --import` turns into index.json
See tools/tts/README.md for the venvs, models (ids + revisions), licences and the Korean A/B.

Engines live in two venvs, so this script re-runs itself as worker processes:
  synth  (engine venv)   text -> raw wav takes in .tools/speech/raw/...
  post   (Whisper venv)  raw take -> chain -> m4a -> Whisper -> CER
Chain: sentences joined with fixed gaps (Qwen3/Supertonic synthesise one sentence at a time) -> trim silence ->
HPF 70 Hz -> de-ess -> -18 LUFS -> -1 dBTP true-peak limiter -> AAC. No time stretching, no pitch shifting.
Take choice: takes whose onset trembles (tools/tts/onset.py, score > 1.0) are rejected, then lowest CER, then length;
takes with CER over max(0.1, best CER) are never kept for their onset. If no clear take of a seeded engine is steady,
EXTRA_TAKES more seeds are made before falling back to the clear take with the lowest onset score.

  python tools/tts/bake.py lines [--lang en,vi,ko] [--scene kw4.supper] [--force]     shipped clips + reports
  python tools/tts/bake.py lines --lang vi --keys kw4.supper/02,kw5.cranes/07           re-bake only these lines
  python tools/tts/bake.py score [--lang en,vi,ko]       onset + Whisper of the SHIPPED clips -> .tools/speech/score-<lang>.json
  python tools/tts/bake.py ab --lang ko --keys k1,k2 --cast tools/tts/ko-ab.json       blind A/B takes (no shipping)
(any python 3.9+ works for the orchestrator; it only spawns the venvs.)
"""
from __future__ import annotations

import argparse, base64, hashlib, json, os, re, shutil, subprocess, sys, time, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / ".tools" / "speech"
RAW = TOOLS / "raw"
PUBLIC = ROOT / "public" / "speech"
VOICE_SYNC = Path(os.environ.get("VOICE_SYNC", r"C:\Users\n\source\repos\voice_sync"))
VENV = Path(os.environ.get("TTS_VENV", VOICE_SYNC / "engines" / "venv")) / "Scripts" / "python.exe"     # kokoro, qwen-tts, whisper
VENV2 = Path(os.environ.get("TTS_VENV2", VOICE_SYNC / "engines" / "venv2")) / "Scripts" / "python.exe"  # vieneu
MODELS = Path(os.environ.get("TTS_MODELS", r"E:\models\tts\hf\hub"))
QWEN_DIR = MODELS / "models--Qwen--Qwen3-TTS-12Hz-1.7B-CustomVoice" / "snapshots" / "0c0e3051f131929182e2c023b9537f8b1c68adfe"
SUPERTONIC_DIR = MODELS / "models--Supertone--supertonic-3" / "snapshots" / "3cadd1ee6394adea1bd021217a0e650ede09a323"

ENGINE_TAG = {
    "kokoro": "kokoro-82m@f3ff357 (kokoro 0.9.4)",
    "vieneu": "vieneu-tts-v3-turbo@61b85e3 (vieneu 3.8.3)",
    "qwen3": "qwen3-tts-12hz-1.7b-customvoice@0c0e305 (qwen-tts 0.1.1)",
    "supertonic": "supertonic-3@3cadd1e",
}
LICENCE = {
    "kokoro": "Kokoro-82M (hexgrad), Apache-2.0",
    "vieneu": "VieNeu-TTS v3 Turbo (pnnbao-ump), Apache-2.0 incl. preset voices; codec MOSS-Audio-Tokenizer-Nano Apache-2.0; audio watermarked",
    "qwen3": "Qwen3-TTS-12Hz-1.7B-CustomVoice (Qwen), Apache-2.0",
    "supertonic": "Supertonic 3 (Supertone), OpenRAIL-M: machine-made speech, no impersonation",
}
TAKES = {"kokoro": 1, "vieneu": 3, "qwen3": 3, "supertonic": 3}
SEEDED = {"vieneu", "qwen3", "supertonic"}    # Kokoro is deterministic: another take would be the same audio
EXTRA_TAKES = 3                               # more seeds when every take's onset trembles
WORKER_VENV = {"kokoro": VENV, "qwen3": VENV, "supertonic": VENV, "vieneu": VENV2}
SR = 24000
SEED = 20261128
GAP_S = 0.24     # pause between sentences synthesised one at a time


# ---------------------------------------------------------------- shared helpers

def sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [p for p in parts if p.strip()]


def item_id(it: dict) -> str:
    key = f"{it['text']}|{it['engine']}:{it['voice']}:{it.get('speed') or ''}::{it.get('style') or ''}"
    return hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]


def norm_text(t: str) -> str:
    return re.sub(r"[^\w]", "", unicodedata.normalize("NFC", t.lower())).replace("_", "")


def cer(ref: str, hyp: str) -> float:
    r, h = norm_text(ref), norm_text(hyp)
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        p, d[0] = d[0], i
        for k in range(1, len(h) + 1):
            p, d[k] = d[k], min(d[k] + 1, d[k - 1] + 1, p + (r[i - 1] != h[k - 1]))
    return d[len(h)] / max(1, len(r))


def run_worker(python: Path, mode: str, job: Path, engine: str | None = None) -> None:
    env = dict(os.environ, PYTHONIOENCODING="utf-8", HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1",
               HF_HUB_DISABLE_TELEMETRY="1")
    if engine == "kokoro":   # the pinned Kokoro snapshot with all 54 voices lives in the E: cache
        env["HF_HOME"] = str(MODELS.parent)
    cmd = [str(python), "-I", "-X", "utf8", str(Path(__file__).resolve()), mode, "--job", str(job)]
    print("  >", mode, job.name, flush=True)
    r = subprocess.run(cmd, env=env, cwd=str(TOOLS), timeout=4 * 3600)
    if r.returncode:
        raise SystemExit(f"worker {mode} failed ({r.returncode})")


# ---------------------------------------------------------------- synth worker (engine venv)

def make_engine(engine: str):
    import numpy as np
    if engine == "kokoro":
        import torch
        from kokoro import KPipeline
        pipes = {}

        def voice_tensor(pipe, voice):
            if "+" not in voice and ":" not in voice:
                return voice
            mix = None
            for part in voice.split("+"):
                name, w = (part.split(":") + ["1"])[:2]
                t = pipe.load_voice(name) * float(w)
                mix = t if mix is None else mix + t
            return mix

        def run(text, voice, speed, style, seed):
            code = "b" if voice.split(":")[0].startswith("b") else "a"
            if code not in pipes:
                pipes[code] = KPipeline(lang_code=code, repo_id="hexgrad/Kokoro-82M", device="cuda")
            p = pipes[code]
            parts = [np.asarray(a.cpu() if hasattr(a, "cpu") else a, dtype=np.float32)
                     for _, _, a in p(text, voice=voice_tensor(p, voice), speed=speed or 1.0, split_pattern=None)]
            return [np.concatenate(parts)], 24000
        return run

    if engine == "vieneu":
        import torch
        from vieneu import Vieneu
        tts = Vieneu()

        def run(text, voice, speed, style, seed):
            torch.manual_seed(seed); np.random.seed(seed)
            a = tts.infer(text, voice=voice, batch_size=1)
            return [np.asarray(a, dtype=np.float32).reshape(-1)], getattr(tts, "sample_rate", 48000)
        return run

    if engine == "qwen3":
        import torch
        from qwen_tts import Qwen3TTSModel
        model = Qwen3TTSModel.from_pretrained(str(QWEN_DIR), device_map="cuda:0", dtype=torch.bfloat16, attn_implementation="sdpa")
        LANG = {"ko": "Korean", "en": "English"}

        def run(text, voice, speed, style, seed, lang="ko"):
            out, sr = [], 24000
            for i, s in enumerate(sentences(text)):
                torch.manual_seed(seed + i)
                with torch.inference_mode():
                    wavs, sr = model.generate_custom_voice(text=s, language=LANG[lang], speaker=voice, instruct=style or "",
                                                           non_streaming_mode=True, max_new_tokens=240, do_sample=True,
                                                           top_k=50, top_p=1.0, temperature=0.8, repetition_penalty=1.05)
                out.append(np.asarray(wavs[0], dtype=np.float32).reshape(-1))
            return out, sr
        return run

    if engine == "supertonic":
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import supertonic_rt as st
        tts = st.load(str(SUPERTONIC_DIR / "onnx"))
        styles = {}

        def run(text, voice, speed, style, seed, lang="ko"):
            if voice not in styles:
                styles[voice] = st.load_style(str(SUPERTONIC_DIR / "voice_styles" / f"{voice}.json"))
            out = []
            for i, s in enumerate(sentences(text)):
                np.random.seed(seed + i)
                out.append(st.synth(tts, s, lang, styles[voice], steps=10, speed=speed or 1.05))
            return out, tts.sample_rate
        return run
    raise SystemExit(f"unknown engine {engine}")


def synth_worker(job_path: Path) -> None:
    import numpy as np, soundfile as sf
    job = json.loads(job_path.read_text(encoding="utf-8"))
    engine = job["engine"]
    run = make_engine(engine)
    first = True
    for it in job["items"]:
        for k in range(it["takes"]):
            out = Path(it["raw"][k])
            if out.exists() and not job.get("force"):
                continue
            if first:  # warm-up (not timed, not kept)
                kw = {"lang": it["lang"]} if engine in ("qwen3", "supertonic") else {}
                run(it["text"], it["voice"], it.get("speed"), it.get("style"), 1, **kw); first = False
            t0 = time.perf_counter()
            kw = {"lang": it["lang"]} if engine in ("qwen3", "supertonic") else {}
            pieces, sr = run(it["text"], it["voice"], it.get("speed"), it.get("style"), SEED + 1000 * k, **kw)
            if len(pieces) > 1:
                gap = np.zeros(int(GAP_S * sr), np.float32)
                joined = []
                for i, p in enumerate(pieces):
                    joined += ([gap] if i else []) + [trim(p, sr, lead=0.0, tail=0.0)]
                a = np.concatenate(joined)
            else:
                a = pieces[0]
            out.parent.mkdir(parents=True, exist_ok=True)
            sf.write(str(out), a, sr, subtype="PCM_16")
            dt = time.perf_counter() - t0
            print(json.dumps({"id": it["id"], "take": k, "s": round(len(a) / sr, 2), "gen_s": round(dt, 2)}, ensure_ascii=False), flush=True)


# ---------------------------------------------------------------- audio chain (Whisper venv)

def trim(a, sr, lead=0.06, tail=0.12, floor_db=-42.0):
    import numpy as np
    if len(a) == 0:
        return a
    hop = max(1, int(0.01 * sr))
    n = len(a) // hop
    if n < 2:
        return a
    fr = a[: n * hop].reshape(n, hop)
    db = 20 * np.log10(np.sqrt((fr ** 2).mean(1)) + 1e-9)
    thr = max(db.max() + floor_db, -60.0)
    on = np.where(db > thr)[0]
    if len(on) == 0:
        return a
    s = max(0, on[0] * hop - int(lead * sr))
    e = min(len(a), (on[-1] + 1) * hop + int(tail * sr))
    return a[s:e]


def chain(a, sr, ceiling_db=-1.0):
    """trim -> HPF 70 Hz -> de-ess -> -18 LUFS -> -1 dBTP limiter, at 24 kHz."""
    import numpy as np, pyloudnorm as pyln
    from scipy.signal import resample_poly, butter, sosfiltfilt, sosfilt
    from math import gcd
    a = np.asarray(a, np.float64)
    if sr != SR:
        g = gcd(SR, sr); a = resample_poly(a, SR // g, sr // g)
    a = trim(a, SR)
    a = sosfilt(butter(2, 70, "highpass", fs=SR, output="sos"), a)
    # de-ess: split at 5 kHz (zero-phase, complementary), duck the top band when it dominates
    hb = sosfiltfilt(butter(4, 5000, "highpass", fs=SR, output="sos"), a)
    lb = a - hb
    win = int(0.006 * SR)
    k = np.ones(win) / win
    eh = np.sqrt(np.convolve(hb ** 2, k, "same")) + 1e-9
    ef = np.sqrt(np.convolve(a ** 2, k, "same")) + 1e-9
    ratio_db = 20 * np.log10(eh / ef)                       # top band share of the whole
    red_db = np.clip(ratio_db - (-9.0), 0, 8.0)             # above -9 dB share: reduce, up to 8 dB
    g = 10 ** (-red_db / 20)
    g = np.convolve(g, np.ones(int(0.004 * SR)) / int(0.004 * SR), "same")
    a = lb + hb * g
    meter = pyln.Meter(SR)
    pad = np.pad(a, (0, max(0, int(0.6 * SR) - len(a))))
    a = a * 10 ** ((-18.0 - meter.integrated_loudness(pad)) / 20)
    # true-peak limiter: gain from the 4x oversampled peak, 2 ms look-ahead, 60 ms release
    ceil = 10 ** (ceiling_db / 20)
    for _ in range(3):
        os4 = resample_poly(a, 4, 1)
        pk = np.abs(os4[: len(a) * 4]).reshape(-1, 4).max(1)
        if pk.max() <= ceil:
            break
        need = np.minimum(1.0, ceil / np.maximum(pk, 1e-9)) * 0.995
        la = int(0.002 * SR)
        from scipy.ndimage import minimum_filter1d
        need = minimum_filter1d(need, 2 * la + 1)
        rel = np.exp(-1 / (0.06 * SR))
        gg = np.empty_like(need); cur = 1.0
        for i, v in enumerate(need):
            cur = v if v < cur else v + (cur - v) * rel
            gg[i] = cur
        a = a * gg
    return a.astype(np.float32)


def envelope(a):
    import numpy as np
    w = SR // 30
    n = max(1, int(np.ceil(len(a) / w)))
    x = np.pad(a, (0, n * w - len(a)))
    rms = np.sqrt((x.reshape(n, w) ** 2).mean(1))
    p95 = np.percentile(rms, 95) or 1e-9
    e = np.clip(np.round(rms / p95 * 255), 0, 255).astype(np.uint8)
    return base64.b64encode(e.tobytes()).decode("ascii")


def encode_m4a(a, path: Path):
    import av, numpy as np
    path.parent.mkdir(parents=True, exist_ok=True)
    c = av.open(str(path), "w", format="ipod")
    s = c.add_stream("aac", rate=SR)
    s.bit_rate = 40000; s.layout = "mono"
    fr = av.AudioFrame.from_ndarray(a.reshape(1, -1).astype(np.float32), format="flt", layout="mono")
    fr.sample_rate = SR
    for p in s.encode(fr): c.mux(p)
    for p in s.encode(None): c.mux(p)
    c.close()
    return path.stat().st_size


def decoded_true_peak(path: Path) -> float:
    import av, numpy as np
    from scipy.signal import resample_poly
    c = av.open(str(path))
    a = np.concatenate([f.to_ndarray().reshape(-1) for f in c.decode(audio=0)]).astype(np.float64)
    c.close()
    return float(20 * np.log10(np.abs(resample_poly(a, 4, 1)).max() + 1e-12))


def onset_mod():
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import onset
    return onset


CER_OK = 0.1    # a take this far from the text (or from the best take's CER) is not traded for a steadier onset


def clear(takes) -> list:
    """Takes whose words are as good as this line gets: CER <= max(CER_OK, best CER of all takes)."""
    bound = max(CER_OK, min(t["cer"] for t in takes))
    return [t for t in takes if t["cer"] <= bound]


def choose(takes) -> dict:
    """Clear takes (words right) with a steady onset first: lowest CER, then the length closest to the median take
    (runaway or truncated takes lose ties). If no clear take has a steady onset: the clear take with the lowest
    onset score, then CER, then length (a dropped word is worse than a trembly start)."""
    med = sorted(t["d"] for t in takes)[len(takes) // 2]
    ok = [t for t in clear(takes) if t["onset_ok"]]
    if ok:
        return min(ok, key=lambda t: (t["cer"], abs(t["d"] - med), t["take"]))
    return min(clear(takes), key=lambda t: (t["onset"]["score"], t["cer"], abs(t["d"] - med), t["take"]))


def post_worker(job_path: Path) -> None:
    import soundfile as sf, warnings
    from faster_whisper import WhisperModel
    warnings.filterwarnings("ignore", module="librosa")
    on = onset_mod()
    job = json.loads(job_path.read_text(encoding="utf-8"))
    asr = WhisperModel("large-v3", device="cuda", compute_type="float16", local_files_only=True)
    results = {}
    for it in job["items"]:
        takes = []
        for k in range(it["takes"]):
            raw = Path(it["raw"][k])
            a, sr = sf.read(str(raw), dtype="float32")
            if a.ndim > 1: a = a.mean(1)
            m4a = raw.with_suffix(".m4a")
            ceiling = -1.0
            for _ in range(4):   # AAC overshoots the limiter: re-limit until the DECODED clip is <= -1 dBTP
                y = chain(a, sr, ceiling)
                size = encode_m4a(y, m4a)
                tp = decoded_true_peak(m4a)
                if tp <= -1.0:
                    break
                ceiling -= (tp + 1.0) + 0.1
            segs, _ = asr.transcribe(str(m4a), language=it["lang"], beam_size=5, condition_on_previous_text=False)
            heard = " ".join(s.text.strip() for s in segs).strip()
            c = round(cer(it["text"], heard), 3)
            o = on.onset_score(*on.load(m4a))     # the decoded clip, as shipped (and as `bake.py score` measures it)
            o.pop("legs", None)
            takes.append(dict(take=k, cer=c, heard=heard, d=round(len(y) / SR, 3), bytes=size, m4a=str(m4a),
                              env=envelope(y), digits=bool(re.search(r"\d", heard)), onset=o,
                              onset_ok=o["score"] <= on.THRESHOLD))
        best = choose(takes)
        results[it["id"]] = dict(takes=takes, best=best["take"], onset_ok=any(t["onset_ok"] for t in clear(takes)))
        print(json.dumps({"id": it["id"], "key": it.get("key"), "cers": [t["cer"] for t in takes],
                          "onset": [t["onset"]["score"] for t in takes], "best": best["take"], "heard": best["heard"]},
                         ensure_ascii=False), flush=True)
    Path(job["results"]).write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")


# ---------------------------------------------------------------- orchestration

def make_items(entries, raw_root: Path, takes_override=None):
    items = []
    for e in entries:
        v = e["voice"]
        it = dict(text=e["text"], lang=e["lang"], engine=v["engine"], voice=v["voice"], speed=v.get("speed"), style=v.get("style"),
                  key=e["key"], who=e["who"], h=e.get("h"))
        it["id"] = item_id(it)
        it["takes"] = takes_override or TAKES[it["engine"]]
        it["raw"] = [str(raw_root / e["lang"] / it["engine"] / f"{it['id']}__t{k}.wav") for k in range(it["takes"])]
        items.append(it)
    return items


def _synth_post(items, tag: str, force=False) -> dict:
    jobs = TOOLS / "jobs"; jobs.mkdir(parents=True, exist_ok=True)
    for engine in sorted({i["engine"] for i in items}):
        sub = [i for i in items if i["engine"] == engine]
        jp = jobs / f"{tag}-synth-{engine}.json"
        jp.write_text(json.dumps(dict(engine=engine, items=sub, force=force), ensure_ascii=False, indent=1), encoding="utf-8")
        run_worker(WORKER_VENV[engine], "synth", jp, engine)
    jp = jobs / f"{tag}-post.json"
    res = jobs / f"{tag}-results.json"
    jp.write_text(json.dumps(dict(items=items, results=str(res)), ensure_ascii=False, indent=1), encoding="utf-8")
    run_worker(VENV, "post", jp)
    return json.loads(res.read_text(encoding="utf-8"))


def run_items(items, tag: str, force=False) -> dict:
    """Synthesise + score every item; items of seeded engines whose takes ALL tremble at the onset get EXTRA_TAKES
    more seeds (SEED + 1000*k, k = 3..5), then the choice is made again over all takes. Results: tag-results.json."""
    TOOLS.mkdir(parents=True, exist_ok=True)
    res = _synth_post(items, tag, force)
    redo = [it for it in items if not res[it["id"]]["onset_ok"] and it["engine"] in SEEDED]
    if redo:
        print(f"  onset: {len(redo)} line(s) with no steady take -> {EXTRA_TAKES} more takes each", flush=True)
        for it in redo:
            n = it["takes"]
            it["takes"] = n + EXTRA_TAKES
            it["raw"] = it["raw"] + [it["raw"][0].replace("__t0.wav", f"__t{k}.wav") for k in range(n, n + EXTRA_TAKES)]
        res.update(_synth_post(redo, tag + "-more", False))
        (TOOLS / "jobs" / f"{tag}-results.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    for it in items:
        r = res[it["id"]]
        if not r["onset_ok"]:
            print(f"  onset: {it.get('key')} kept take {r['best']} (onset {r['takes'][r['best']]['onset']['score']}): no steady take", flush=True)
    return res


def cmd_lines(args):
    lines = json.loads((TOOLS / "lines.json").read_text(encoding="utf-8"))
    langs = args.lang.split(",") if args.lang else sorted({l["lang"] for l in lines})
    for lang in langs:
        sel = [l for l in lines if l["lang"] == lang and (not args.scene or l["scene"] in args.scene.split(","))
               and (not args.keys or l["key"] in args.keys.split(","))]
        if not sel:
            continue
        missing = [l["key"] for l in sel if not l.get("voice")]
        if missing:
            raise SystemExit(f"{lang}: no voice profile for {missing}")
        print(f"{lang}: {len(sel)} lines", flush=True)
        items = make_items(sel, RAW, None)
        res = run_items(items, f"lines-{lang}", force=args.force)
        rp = TOOLS / f"report-{lang}.json"
        rep = json.loads(rp.read_text(encoding="utf-8")) if rp.exists() else seed_report(lang)
        valid = {l["key"] for l in lines if l["lang"] == lang}
        rep["lines"] = {k: v for k, v in rep.get("lines", {}).items() if k in valid}
        for it, e in zip(items, sel):
            r = res[it["id"]]
            t = r["takes"][r["best"]]
            dst = PUBLIC / lang / e["file"]
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(t["m4a"], dst)
            rep["lines"][e["key"]] = dict(f=e["file"], d=round(t["d"], 2), h=e["h"], env=t["env"], cer=t["cer"], heard=t["heard"],
                                          engine=ENGINE_TAG[it["engine"]], voice=it["voice"] + (f" @{it['speed']}" if it.get("speed") else "")
                                          + (f" [{it['style']}]" if it.get("style") else ""), take=t["take"],
                                          takes=[x["cer"] for x in r["takes"]], kb=round(t["bytes"] / 1024, 1),
                                          onset=t["onset"]["score"], onsets=[x["onset"]["score"] for x in r["takes"]],
                                          **({"digits": True} if t["digits"] else {}))
        engines = sorted({LICENCE_KEY(v["engine"]) for v in rep["lines"].values()})
        rep["licence"] = "; ".join(LICENCE[e] for e in engines)
        rep = {"licence": rep["licence"], "lines": dict(sorted(rep["lines"].items()))}
        rp.write_text(json.dumps(rep, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        cers = [v["cer"] for v in rep["lines"].values() if "cer" in v] or [0.0]   # seeded (unbaked) lines have none
        print(f"{lang}: {len(cers)} clips, mean CER {sum(cers)/len(cers):.3f}, max {max(cers):.3f}, "
              f"{sum(c > 0.1 for c in cers)} over 0.1 -> {rp.relative_to(ROOT)}", flush=True)


def seed_report(lang: str) -> dict:
    """No report-<lang>.json (a fresh checkout): start from the shipped index.json so a partial re-bake
    (--keys / --scene) keeps every other clip exactly as shipped when `speech-build.mjs --import` runs."""
    idx = PUBLIC / lang / "index.json"
    if not idx.exists():
        return {"lines": {}}
    man = json.loads(idx.read_text(encoding="utf-8"))
    eng = (man.get("engines") or [None])[0]
    return {"licence": man.get("licence"), "lines": {k: dict(v, engine=eng) for k, v in man.get("lines", {}).items()}}


def score_worker(job_path: Path) -> None:
    """Onset score + Whisper CER of shipped clips (no synthesis, nothing written under public/)."""
    import warnings
    from faster_whisper import WhisperModel
    warnings.filterwarnings("ignore", module="librosa")
    on = onset_mod()
    job = json.loads(job_path.read_text(encoding="utf-8"))
    asr = WhisperModel("large-v3", device="cuda", compute_type="float16", local_files_only=True)
    out = {}
    for it in job["items"]:
        a, sr = on.load(it["path"])
        o = on.onset_score(a, sr)
        segs, _ = asr.transcribe(it["path"], language=it["lang"], beam_size=5, condition_on_previous_text=False)
        heard = " ".join(s.text.strip() for s in segs).strip()
        out[it["key"]] = dict(onset=o, ok=o["score"] <= on.THRESHOLD, cer=round(cer(it["text"], heard), 3), heard=heard,
                              kb=round(Path(it["path"]).stat().st_size / 1024, 1), d=round(len(a) / sr, 2))
        print(f"{'ok  ' if out[it['key']]['ok'] else 'FAIL'} {o['score']:5.2f} cer {out[it['key']]['cer']:.3f}  {it['lang']} {it['key']}", flush=True)
    Path(job["results"]).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")


def cmd_score(args):
    lines = json.loads((TOOLS / "lines.json").read_text(encoding="utf-8"))
    langs = args.lang.split(",") if args.lang else sorted({l["lang"] for l in lines})
    jobs = TOOLS / "jobs"; jobs.mkdir(parents=True, exist_ok=True)
    for lang in langs:
        man = json.loads((PUBLIC / lang / "index.json").read_text(encoding="utf-8"))["lines"]
        items = [dict(key=l["key"], lang=lang, text=l["text"], path=str(PUBLIC / lang / man[l["key"]]["f"]))
                 for l in lines if l["lang"] == lang and l["key"] in man]
        jp, res = jobs / f"score-{lang}.json", TOOLS / f"score-{lang}.json"
        jp.write_text(json.dumps(dict(items=items, results=str(res)), ensure_ascii=False, indent=1), encoding="utf-8")
        run_worker(VENV, "score-worker", jp)
        r = json.loads(res.read_text(encoding="utf-8"))
        bad = [k for k, v in r.items() if not v["ok"]]
        print(f"{lang}: {len(r)} clips, {len(bad)} with a trembly onset: {','.join(bad)}", flush=True)


def LICENCE_KEY(tag: str) -> str:
    return next(k for k, v in ENGINE_TAG.items() if v == tag)


def cmd_ab(args):
    """A/B takes for a few lines under several engines' casts (tools/tts/ko-ab.json): .tools/speech/ab/<lang>/results.json."""
    lines = json.loads((TOOLS / "lines.json").read_text(encoding="utf-8"))
    cast = json.loads(Path(args.cast).read_text(encoding="utf-8"))
    keys = args.keys.split(",")
    by_key = {l["key"]: l for l in lines if l["lang"] == args.lang}
    entries = []
    for engine, people in cast.items():
        if engine.startswith("_"):
            continue
        for k in keys:
            l = by_key[k]
            v = people[l["who"]]
            entries.append(dict(l, voice=dict(engine=engine, **v)))
    items = make_items(entries, TOOLS / "ab" / "raw")
    res = run_items(items, f"ab-{args.lang}", force=args.force)
    out = []
    for it in items:
        r = res[it["id"]]
        out.append(dict(key=it["key"], who=it["who"], text=it["text"], engine=it["engine"], voice=it["voice"], style=it.get("style"),
                        speed=it.get("speed"), best=r["best"], takes=r["takes"]))
    dst = TOOLS / "ab" / args.lang / "results.json"
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    for engine in cast:
        if engine.startswith("_"):
            continue
        cs = [o["takes"][o["best"]]["cer"] for o in out if o["engine"] == engine]
        allc = [t["cer"] for o in out if o["engine"] == engine for t in o["takes"]]
        print(f"{engine}: best-take mean CER {sum(cs)/len(cs):.3f} (all takes {sum(allc)/len(allc):.3f})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["lines", "ab", "score", "synth", "post", "score-worker"])
    ap.add_argument("--job"); ap.add_argument("--lang"); ap.add_argument("--scene"); ap.add_argument("--keys"); ap.add_argument("--cast")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    if a.mode == "synth": synth_worker(Path(a.job))
    elif a.mode == "post": post_worker(Path(a.job))
    elif a.mode == "score-worker": score_worker(Path(a.job))
    elif a.mode == "score": cmd_score(a)
    elif a.mode == "lines": cmd_lines(a)
    else: cmd_ab(a)


if __name__ == "__main__":
    main()
