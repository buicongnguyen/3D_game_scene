"""Minimal Supertonic 3 ONNX runtime (adapted from Supertone's MIT sample code, github.com/supertone-inc/supertonic py/helper.py).

Only what tools/tts/bake.py needs: load the four ONNX graphs + tts.json + unicode_indexer.json, load a preset voice style
(voice_styles/F1..M5.json), synthesise one sentence. The caller seeds numpy (the flow-matching start noise).
"""
import json, os, re
from unicodedata import normalize

import numpy as np
import onnxruntime as ort

LANGS = {"en", "ko", "ja", "vi"}


class TTS:
    def __init__(self, onnx_dir: str):
        with open(os.path.join(onnx_dir, "tts.json"), "r", encoding="utf-8") as f:
            self.cfg = json.load(f)
        with open(os.path.join(onnx_dir, "unicode_indexer.json"), "r", encoding="utf-8") as f:
            self.indexer = json.load(f)
        opts = ort.SessionOptions()
        prov = ["CPUExecutionProvider"]
        s = lambda n: ort.InferenceSession(os.path.join(onnx_dir, n), sess_options=opts, providers=prov)
        self.dp, self.enc, self.est, self.voc = (s("duration_predictor.onnx"), s("text_encoder.onnx"),
                                                 s("vector_estimator.onnx"), s("vocoder.onnx"))
        self.sample_rate = self.cfg["ae"]["sample_rate"]
        self.base_chunk = self.cfg["ae"]["base_chunk_size"]
        self.ccf = self.cfg["ttl"]["chunk_compress_factor"]
        self.ldim = self.cfg["ttl"]["latent_dim"]


def load(onnx_dir: str) -> TTS:
    return TTS(onnx_dir)


def load_style(path: str):
    with open(path, "r", encoding="utf-8") as f:
        st = json.load(f)
    ttl = np.array(st["style_ttl"]["data"], np.float32).reshape(1, *st["style_ttl"]["dims"][1:])
    dp = np.array(st["style_dp"]["data"], np.float32).reshape(1, *st["style_dp"]["dims"][1:])
    return ttl, dp


def _prep(text: str, lang: str) -> str:
    text = normalize("NFKD", text)
    for k, v in {"–": "-", "‑": "-", "—": "-", "_": " ", "“": '"', "”": '"', "‘": "'", "’": "'",
                 "´": "'", "`": "'", "[": " ", "]": " ", "|": " ", "/": " ", "#": " "}.items():
        text = text.replace(k, v)
    for p in [",", ".", "!", "?", ";", ":", "'"]:
        text = text.replace(" " + p, p)
    text = re.sub(r"\s+", " ", text).strip()
    if not re.search(r"[.!?;:,'\"')\]}…。」』】〉》›»]$", text):
        text += "."
    return f"<{lang}>{text}</{lang}>"


def _mask(lengths, max_len=None):
    max_len = max_len or int(lengths.max())
    return (np.arange(max_len) < lengths[:, None]).astype(np.float32).reshape(-1, 1, max_len)


def synth(tts: TTS, text: str, lang: str, style, steps: int = 10, speed: float = 1.05) -> np.ndarray:
    ttl, dp = style
    t = _prep(text, lang)
    ids = np.array([[tts.indexer[ord(c)] for c in t]], np.int64)
    tmask = _mask(np.array([ids.shape[1]], np.int64))
    dur, *_ = tts.dp.run(None, {"text_ids": ids, "style_dp": dp, "text_mask": tmask})
    dur = dur / speed
    emb, *_ = tts.enc.run(None, {"text_ids": ids, "style_ttl": ttl, "text_mask": tmask})
    wav_len = (dur * tts.sample_rate).astype(np.int64)
    chunk = tts.base_chunk * tts.ccf
    lat_len = int((wav_len.max() + chunk - 1) // chunk)
    lmask = _mask((wav_len + chunk - 1) // chunk, lat_len)
    xt = np.random.randn(1, tts.ldim * tts.ccf, lat_len).astype(np.float32) * lmask
    total = np.array([steps], np.float32)
    for step in range(steps):
        xt, *_ = tts.est.run(None, {"noisy_latent": xt, "text_emb": emb, "style_ttl": ttl, "text_mask": tmask,
                                     "latent_mask": lmask, "current_step": np.array([step], np.float32), "total_step": total})
    wav, *_ = tts.voc.run(None, {"latent": xt})
    w = wav.reshape(-1)[: int(wav_len[0])]
    return w.astype(np.float32)
