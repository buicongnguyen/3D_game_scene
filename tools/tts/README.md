# tools/tts: offline voice bake for the house scenes

The game ships only `public/speech/<lang>/<scene>/<nn>.m4a` plus one `public/speech/<lang>/index.json` per language
(docs/TRAVEL-LANGUAGE-PLAN.md §3, §5.2, §8.2). The engines, models and venvs below are **never committed**.

## Run

```powershell
node scripts/speech-build.mjs --lines                       # .tools/speech/lines.json (text, speaker, voice profile, hash h)
python tools/tts/bake.py lines                              # all languages; or --lang ko  --scene kw4.supper  [--force]
node scripts/speech-build.mjs --import                      # .tools/speech/report-<lang>.json -> public/speech/<lang>/index.json
node scripts/speech-build.mjs --check                       # must print "speech: all clips match"
```

`bake.py` is an orchestrator (any Python 3.9+). It writes one job file per engine and re-runs itself in the right
venv as a worker (`synth`, then `post`), with `HF_HUB_OFFLINE=1` so a bake never downloads anything:

| Step | Venv | What |
|---|---|---|
| synth kokoro / qwen3 / supertonic | `voice_sync\engines\venv` (py 3.11, torch 2.8.0+cu128, kokoro 0.9.4, qwen-tts 0.1.1, onnxruntime 1.31.0) | raw takes -> `.tools/speech/raw/<lang>/<engine>/<id>__t<k>.wav` |
| synth vieneu | `voice_sync\engines\venv2` (vieneu 3.8.3, transformers 4.57.6) | same |
| post | `voice_sync\engines\venv` (faster-whisper 1.2.1, ctranslate2 4.8.3, PyAV 18.1.0, pyloudnorm, scipy) | chain, AAC, Whisper, CER, best take |

Override the paths with `VOICE_SYNC`, `TTS_VENV`, `TTS_VENV2`, `TTS_MODELS`. Raw takes are cached by
`sha1(text|engine:voice:speed::style)`: a rerun only synthesises new or changed lines (`--force` redoes everything).
Workers run with `python -I -X utf8` (downloaded model folders are never on `sys.path`).

**Rules** (plan §3.4): Qwen3 and Supertonic synthesise one sentence at a time (0.24 s gap); Kokoro and VieNeu split
internally. Seeded engines (VieNeu, Qwen3, Supertonic) make 3 takes (seed 20261128 + 1000·take), Kokoro 1. Every take
goes through the chain, is encoded, then decoded by Whisper large-v3 (beam 5, language forced) and given an **onset
score** (below). Only "clear" takes count (CER ≤ max(0.1, the line's best CER): a dropped word is never traded for a
steadier start). Clear takes whose onset trembles are rejected; of the rest the kept take has the lowest CER (ties:
length closest to the median take). If no clear take of a seeded engine is steady, 3 more seeds (k = 3..5) are made and
the choice is redone; if none is steady still, the clear take with the lowest onset score wins (then CER, then length). Kokoro is deterministic (one
take), so its onset is logged but cannot be re-rolled. Chain: trim silence -> HPF 70 Hz -> de-ess (5 kHz split, up to
8 dB) -> −18 LUFS -> −1 dBTP true-peak limiter (4× oversampled) -> AAC-LC, mono, 24 kHz, 40 kbps (PyAV, `ipod`
muxer). AAC overshoots the limiter, so the clip is decoded and re-limited until the **decoded** true peak is ≤ −1
dBTP. No time stretching and no pitch shifting (children are young-woman voices: owner 2026-11-28).
CER = edit distance on lower-cased NFC text with punctuation and spaces removed; numbers heard as digits count as
errors (`digits: true` in the report). CER > 0.1 = needs a human listen.

**Onset score** (`tools/tts/onset.py`, owner listen 2026-11-28: VieNeu Trúc Ly takes 0 and 1 "vibrate at the
beginning", take 2 does not). Measured on the decoded clip (what ships; pYIN's voicing edge can move with the AAC
round trip). pYIN pitch (5 ms hop) of the first voiced run (≥ 40 ms), at most 250 ms, 15 ms trimmed at
each edge, 3-frame median; a zig-zag with 12-cent hysteresis splits it into monotone legs. Every pair of adjacent legs
that are both 15–100 ms long and where the return is at least half the swing counts its smaller height: a quick
up-and-back (tremble, warble, vibrato) scores, a held / rising / falling tone and a slow intonation arch or pitch accent
(small rise, big fall) do not. `score = back-swing cents / 60`; a take **fails above 1.0**. Trúc Ly: t0 1.17 (legs
+80 c/65 ms, −70 c/70 ms), t1 3.50 (+210/80, −310/75), t2 0.00 (one 30-cent leg). The amplitude dip in the attack is
logged (`amp`, dB) but not scored (it did not separate the takes). `python tools/tts/onset.py <wav|m4a>...` prints the
numbers; `python tools/tts/bake.py score` scores the shipped clips (onset + Whisper) into `.tools/speech/score-<lang>.json`;
`python tools/tts/bake.py lines --lang vi --keys kw4.supper/02` re-bakes single lines (a missing report is seeded from
the shipped `index.json`, so `--import` keeps every other clip as shipped).

`report-<lang>.json` per line: `f, d, h, env` (what `--import` keeps) plus `cer, heard, engine, voice, take, takes`
(CER of every take), `onset, onsets` (onset score of the kept take / of every take), `kb`. The post worker's
`.tools/speech/jobs/<tag>-results.json` has every take's `onset` {score, pitch, amp, t_on, run_ms} and `onset_ok`. `env` = base64 Uint8 RMS per 1/30 s window, 95th-percentile window = 255.

## Models (all model downloads live on E:)

| Engine | HF repo @ revision | Where | Licence |
|---|---|---|---|
| Kokoro-82M | `hexgrad/Kokoro-82M` @ `f3ff3571791e39611d31c381e3a41a3af07b4987` (kokoro-v1_0.pth + all 54 voices) | `E:\models\tts\hf\hub` (bake sets `HF_HOME=E:\models\tts\hf` for this worker) | Apache-2.0 |
| VieNeu-TTS v3 Turbo | `pnnbao-ump/VieNeu-TTS-v3-Turbo` @ `61b85e3d937fbbacb387714180e8182823512523` (PyTorch `update/model.safetensors`, 305 MB) + codec `OpenMOSS-Team/MOSS-Audio-Tokenizer-Nano` @ `6aa02b01e445cc585582cf0ba480bc3ea6c8dd68`; 25 preset voices from the SDK file `vieneu/assets/voices_v3_turbo.json` (vieneu 3.8.3) | default HF cache `%USERPROFILE%\.cache\huggingface` (installed earlier, read only) | **Apache-2.0** (model card FAQ: covers weights, ONNX, configs **and the preset-voice assets**; commercial use of generated audio allowed; speakers consented). Codec Apache-2.0. Output carries VieNeu's audio watermark (`apply_watermark=True`, default) |
| Qwen3-TTS 12Hz 1.7B CustomVoice | `Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice` @ `0c0e3051f131929182e2c023b9537f8b1c68adfe` (4.3 GB incl. `speech_tokenizer/`) | `E:\models\tts\hf\hub` | Apache-2.0 |
| Supertonic 3 | `Supertone/supertonic-3` @ `3cadd1ee6394adea1bd021217a0e650ede09a323` (`onnx/*`, `voice_styles/F1-F5,M1-M5.json`, LICENSE; 383 MB) | `E:\models\tts\hf\hub`; runtime = `tools/tts/supertonic_rt.py` (adapted from Supertone's MIT sample `py/helper.py`), ONNX Runtime CPU, 10 flow steps | **OpenRAIL-M** (commercial use OK with use restrictions: no impersonation/deception, disclose machine-made speech). Supertone archived the GitHub repo (2026-09-09) and is reportedly winding down: treat this snapshot as **mirror-only** and keep a copy |
| Whisper large-v3 (QA only, not shipped) | `Systran/faster-whisper-large-v3` @ `edaa852ec7e145841d8ffdb056a99866b5f0a478` | default HF cache (installed earlier) | MIT |

Model cards and the Supertonic LICENSE copies: `E:\models\tts\cards\`.

**VieNeu model check (2026-11-28).** The installed and used model is **v3 Turbo**, not the older `pnnbao-ump/VieNeu-TTS`
(0.5B) or `pnnbao-ump/VieNeu-TTS-0.3B`. All three HF repos are tagged `license: apache-2.0` today; v3 Turbo's card states
explicitly that the licence includes the preset voices. The training-data pipeline is not disclosed (dataset gated).
No non-commercial weights are used anywhere in this bake.

## Cast (src/content/scenes/cast-voices.js)

Each speaker has a different profile inside each house (kw4 = v2 v8 v10 ota mika · kw2 = t1 t2 v3 mika · kw5 = v18 v20 mika).

| Who | Kind | EN Kokoro | VI VieNeu | KO Supertonic 3 (draft) |
|---|---|---|---|---|
| v2 Mrs. Nakano | f-adult | af_heart | Trúc Ly | F1 |
| v8 Mr. Nakano | m-adult | am_michael | Hải Đăng | M1 |
| v10 Daichi | boy | af_nova @1.06 | Ngọc Huyền | F3 @1.05 |
| ota Grandpa Ōta | m-elder | bm_lewis @0.92 | Thiền Tâm Đức | M3 @0.92 |
| mika Mika | girl | af_sky @1.04 | Quỳnh Anh | F4 @1.05 |
| t1 Mr. Fujita | m-adult | am_fenrir | Phạm Tuyên | M2 |
| t2 Mrs. Komori | f-adult | af_bella | Đoan Trang | F2 |
| v3 Kenta | boy | af_kore @1.06 | Ngọc Huyền | F3 @1.05 |
| v18 Granny Tsuru | f-elder | bf_emma @0.92 | Ngọc Linh | F5 @0.92 |
| v20 Yui | girl | af_nicole @1.04 | Ngọc Huyền | F3 @1.05 |

Speeds are each engine's native pace control (Kokoro `speed`, Supertonic duration scale), not DSP stretching.
Supertonic median F0 on one Korean line: F4 196 Hz, F1 181, F2 178, F3 166, F5 154; M1-M5 86-95 Hz.

## Korean: blind A/B (2026-11-28) and how to switch

`python tools/tts/bake.py ab --lang ko --cast tools/tts/ko-ab.json --keys kw4.supper/01,kw4.supper/09,kw2.shop/02,kw2.shop/04,kw4.supper/03,kw4.supper/07,kw4.supper/11,kw4.supper/06`
-> `.tools/speech/ab/ko/results.json`. Best-of-3 CER: **Qwen3 0.008, Supertonic 0.008** (tie); all takes: Qwen3 0.032,
Supertonic 0.045. Supertonic 3 shipped as the draft on the tie because every one of its 10 voices is a native
multilingual voice (Qwen3 has one Korean-native speaker, Sohee; Serena/Vivian are Chinese-, Aiden/Ryan English-,
Ono_Anna Japanese-native, so most of a Qwen cast would be accented), it gives 10 clearly different timbres, and it runs
on CPU in 0.4 GB (Qwen3: 4.3 GB on GPU, ~1.5-5 s a line). Against it: OpenRAIL-M use restrictions and an archived vendor.

**Losing engine (Qwen3) cast**, kept in `tools/tts/ko-ab.json`: v2 Sohee, t2 Serena, v18/v10/v3/v20 Sohee with
age/character `instruct` styles, mika Ono_Anna, v8 Aiden, t1 Eric, ota Uncle_Fu; sampling top_k 50, top_p 1.0,
temperature 0.8, repetition penalty 1.05, `max_new_tokens` 240 per sentence, bf16 + sdpa. To switch: copy the `qwen3`
block into the `ko` profiles of `cast-voices.js` as `{ engine: 'qwen3', voice, style }`, then `--lines`, `bake.py lines --lang ko`, `--import`, `--check`.

Magpie TTS Multilingual (NVIDIA, 357M, NVIDIA Open Model License) was not baked: the Python route needs the NeMo
toolkit, and the prebuilt NeMo-Speech.cpp Windows binary could not be run in this session. Its voices are 5 English
speakers across languages.
