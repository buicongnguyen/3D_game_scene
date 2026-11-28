// © 2026 Bui Cong Nguyen · solluxlabs.com
// Who speaks with which baked voice, per learning language (docs/TRAVEL-LANGUAGE-PLAN.md §5.2). Read by
// scripts/speech-build.mjs (the bake list and the clip hashes) and tests/scenes.test.mjs (every speaker has a profile;
// nobody in one house shares one). The engines run OFFLINE (tools/tts/bake.py); the game ships only the clips.
//   kind: f-adult | f-elder | m-adult | m-elder | boy | girl (children are voiced by a young woman's voice, never
//         pitch-shifted: owner 2026-11-28)
//   en: Kokoro-82M (Apache-2.0) voice id or blend 'a:0.7+b:0.3'; speed is Kokoro's native pace (no time stretch)
//   vi: VieNeu-TTS v3 Turbo (Apache-2.0) preset name
//   ko: Supertonic 3 (OpenRAIL-M) preset style F1-F5 / M1-M5, DRAFT: it won the 2026-11-28 blind A/B against
//       Qwen3-TTS 1.7B CustomVoice on a CER tie; the Qwen3 cast is kept in tools/tts/ko-ab.json (see tools/tts/README.md)
// Houses: kw4 = v2 v8 v10 ota mika · kw2 = t1 t2 v3 mika · kw5 = v18 v20 mika.
export const CAST_VOICES = {
  v2: { kind: 'f-adult', en: { engine: 'kokoro', voice: 'af_heart', speed: 1 }, vi: { engine: 'vieneu', voice: 'Trúc Ly' }, ko: { engine: 'supertonic', voice: 'F1', speed: 1 } },
  v8: { kind: 'm-adult', en: { engine: 'kokoro', voice: 'am_michael', speed: 1 }, vi: { engine: 'vieneu', voice: 'Hải Đăng' }, ko: { engine: 'supertonic', voice: 'M1', speed: 1 } },
  v10: { kind: 'boy', en: { engine: 'kokoro', voice: 'af_nova', speed: 1.06 }, vi: { engine: 'vieneu', voice: 'Ngọc Huyền' }, ko: { engine: 'supertonic', voice: 'F3', speed: 1.05 } },
  ota: { kind: 'm-elder', en: { engine: 'kokoro', voice: 'bm_lewis', speed: 0.92 }, vi: { engine: 'vieneu', voice: 'Thiền Tâm Đức' }, ko: { engine: 'supertonic', voice: 'M3', speed: 0.92 } },
  mika: { kind: 'girl', en: { engine: 'kokoro', voice: 'af_sky', speed: 1.04 }, vi: { engine: 'vieneu', voice: 'Quỳnh Anh' }, ko: { engine: 'supertonic', voice: 'F4', speed: 1.05 } },
  t1: { kind: 'm-adult', en: { engine: 'kokoro', voice: 'am_fenrir', speed: 1 }, vi: { engine: 'vieneu', voice: 'Phạm Tuyên' }, ko: { engine: 'supertonic', voice: 'M2', speed: 1 } },
  t2: { kind: 'f-adult', en: { engine: 'kokoro', voice: 'af_bella', speed: 1 }, vi: { engine: 'vieneu', voice: 'Đoan Trang' }, ko: { engine: 'supertonic', voice: 'F2', speed: 1 } },
  v3: { kind: 'boy', en: { engine: 'kokoro', voice: 'af_kore', speed: 1.06 }, vi: { engine: 'vieneu', voice: 'Ngọc Huyền' }, ko: { engine: 'supertonic', voice: 'F3', speed: 1.05 } },
  v18: { kind: 'f-elder', en: { engine: 'kokoro', voice: 'bf_emma', speed: 0.92 }, vi: { engine: 'vieneu', voice: 'Ngọc Linh' }, ko: { engine: 'supertonic', voice: 'F5', speed: 0.92 } },
  v20: { kind: 'girl', en: { engine: 'kokoro', voice: 'af_nicole', speed: 1.04 }, vi: { engine: 'vieneu', voice: 'Ngọc Huyền' }, ko: { engine: 'supertonic', voice: 'F3', speed: 1.05 } },
};

/** A stable text form of one voice profile (part of each clip's hash). */
export const voiceKey = p => (p ? [p.engine, p.voice, p.speed ?? '', p.pitch ?? '', p.style ?? ''].join(':') : '');
