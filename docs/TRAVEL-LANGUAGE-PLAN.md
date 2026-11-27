# Travel & language plan: "Listening at the table"

Written 2026-11-28 against local `main` `7d2ac9e`. This is a plan only: nothing in `src/` has changed. Voice samples
are in `.tools/voice-samples/` (ignored): open `listen.html` there. The owner's idea in their own words:

> "upgrade it so that it can play like a travel to rural. The NPC can speak English so we can learn English, Korean,
> Vietnamese in each house; if possible make it a little larger so that when we go inside we can listen to
> conversation in English, Korean, Vietnamese; in the game where there is conversation then it can speak TTS there."

---

## 1. Goal and score targets

**Goal.** Starline becomes the cosy valley where *every home talks*. Mika travels through the valley and is welcomed
into people's houses: family supper, shop talk, a grandma with her grandchild, a farmer's early morning. Each of
these little scenes is written once. It plays **voiced in the language the player is learning** (English, Korean
or Vietnamese), with **subtitles in the player's own language**. Lines can be replayed or slowed down, and tapping
a highlighted phrase shows what it means. A travel-notebook **Phrasebook** collects every phrase the player has
heard. This is an Explore/travel layer: the Star Lamp story is unchanged, and none of it blocks the story.

The fiction: Tamo, the star spirit, lends Mika his *star-ear*. Near him, the valley's words sound in the language
her heart is learning. This fits the story already in the game, and it explains why Mrs. Nakano speaks Korean
today and Vietnamese tomorrow.

**Identity.** No other cosy game teaches language by having you *sit at a family table and listen*. The game's
own cast already points this way:

- Hoa teaches the hat dance from Vietnam and studies in Seoul.
- Her friends Nabi, Byeol and Haru are Korean.
- Kotone is a traveller from the city.

They become the three guides: Hoa for Vietnamese, Nabi for Korean, and Kotone for English, the "travel buddy".

**Hard limits.**

- Phones must not get slower. Outdoor perf budget rows (`tests/perf/budget.json`) stay unchanged, and new interior
  rows stay under the outdoor ones.
- No hidden or grouped buttons: flat rows only.
- Text is at least 11 px and touch targets at least 44 px.
- Easy and Normal must not get harder.
- Captions are always available.

### Score targets (game-aaa-scorecard, baseline 6.0 on 2026-11-27)

Weights per part: Audio parts 5 % each, Gameplay parts 4.29 %, UI parts 2.5 %, Technical parts 1.875 %,
Visual parts 3.33 %. The per-category reasoning is in §11.

| Part | Now | Target | Weighted gain |
|---|---:|---:|---:|
| Voices / announcer | 3 | 6.5 | +0.175 |
| Audio / music / SFX | 4 | 5 | +0.050 |
| Balance & depth | 5 | 6 | +0.043 |
| Replay value | 6 | 7 | +0.043 |
| Character identity | 6.5 | 7.5 | +0.043 |
| Content volume | 8 | 8.5 | +0.021 |
| Secondary modes | – | +0.5 | +0.021 |
| Onboarding | 6 | 6.5 | +0.013 |
| Accessibility | 5 | 6.5 | +0.028 |
| Localisation | 8 | 8.5 | +0.009 |
| Terrain/environment + Animation (interiors, talk motion) | – | +0.3 each | +0.020 |
| **Overall** | **6.0** | **≈ 6.45** | **+0.47** |

This is the biggest single gain on the ranked list, because Voices carries a full 5 % of the weight and starts at 3.

---

## 2. Player experience walkthrough

### Phone (390×844, Low tier)

1. **First time near a home in Explore.** The door prompt reads "Go inside: Nakano house". When a scene is on, a
   small warm lantern icon sits next to it, with "Supper time" under it. Mika goes in, the fade runs as today, and
   the room is now about 30–45 % bigger: a low table with dishes, four cushions, and the family seated.
2. **One-time choice card.** Four flat buttons: *Listen in English* · *한국어로 듣기* · *Nghe bằng tiếng Việt* ·
   *Not now*. Each is at least 44 px. The card shows one line: "You can change this in Settings > Languages". The
   choice is remembered.
3. **The scene plays.** The camera cuts to an authored wide shot of the table. Each line is spoken by the baked
   voice for that speaker. Mrs. Nakano's lines sound like a warm woman, Grandpa Ōta's like an old man. The
   subtitle panel at the bottom (no backdrop blur) shows:
   - **row 1, the learning line**, in the learning language, coloured with the speaker's colour. Key phrases are
     underlined chips.
   - **row 2, the meaning** in the player's own UI language. It is smaller and can be switched off.
   - **one flat button row**: ⟲ *Again* · 🐢 *Slower* · *Next ▸*. All three are visible and each is at least
     44×44. Tapping the panel also advances.
4. **Tap a chip** (for example 잘 먹겠습니다). A small card opens with:
   - the pronunciation (jal meok-get-seum-ni-da)
   - the meaning ("I will eat well: said before a meal")
   - a culture note ("Korean families say it together before eating")
   - ▶ to hear the phrase on its own, and ★ *Keep*.
5. **When the scene ends,** a toast says "3 new phrases in your Phrasebook". Mika can talk to each family member
   as before, and sit at the table (hotspot). The family stays seated, idles and chats with small talk barks.
6. **The next visit, or the next morning,** Tamo floats up with a gentle recall: "What did Daichi say before
   eating?" There are three audio buttons. A wrong pick only plays that line, a right pick gives a soft chime. No
   fail state and no timer. *Skip* is always shown.
7. **Phrase of the day.** On the first load of the day a toast shows the phrase, for example "Phrase of the day:
   *Cảm ơn ạ*". When Mika hears someone say it in a scene that day, she earns a stamp on the travel stamp card
   (`game/stamps.js`).
8. **Journal > Phrasebook** (new tab 12, styled as a travel notebook). It has a page per home, with a stamp for
   each scene heard. Every heard line can be replayed audio-only with its subtitles (no 3D needed). The tab has
   ★ kept phrases and the recall streak.

### PC (1280×720+, High tier)

The flow is the same, with keys added:

- **E** goes in.
- **Space/Enter** goes to the next line.
- **R** replays the line, **S** toggles slow.
- **1–3** pick a recall answer.
- **J** opens the journal at the Phrasebook.

A mouse hover on a chip shows the meaning as a tooltip, and a click opens the card. The subtitle panel is
centred, at most 760 px wide. High tier also shows the household's idle chatter and kitchen sounds.

### What never happens

- A scene never starts while a story step is running (`director.busy`), during a minigame or while photo mode is
  open.
- The story's own dialogue is never replaced: it keeps its current behaviour until phase P8.
- No quiz blocks progress, and nothing is timed.

---

## 3. Voice decision, with evidence and samples

### 3.1 Option (a): browser Web Speech (what Settings > Voices "Read aloud" uses today)

Availability of EN/KO/VI voices:

| Platform | English | Korean | Vietnamese | Notes |
|---|---|---|---|---|
| Windows Chrome / Firefox | local SAPI/OneCore (David, Zira; Mark) | **only if the Korean language feature is installed** (Heami) | **only if installed** (An) | Windows natural voices show only in Edge [R1]. On this PC: Zira, David, Heami Desktop (SAPI) and An (OneCore only). |
| Windows Edge | online neural (many) | online neural (SunHi, InJoon) | online neural (HoaiMy, NamMinh) | Needs a network connection; pitch adjustment is ignored [R1]. |
| macOS / iOS Safari | yes | Yuna (preloaded compact) | Linh (preloaded compact) | Downloadable/enhanced voices **do not appear** in the Web Speech list; installing a higher-quality variant can remove the language entirely [R1]. Every iOS browser uses Safari's engine. |
| Android Chrome | Google voices | Google ko-KR if the pack is installed | Google vi-VN if the pack is installed | `getVoices()` returns an unfiltered list; a missing pack falls back to English, and the first utterance can take up to a minute [R1]. |
| Chrome desktop | 19 Google voices (online) | – | – | Utterances over about 14 s are cut off [R1]. |

Quality: Windows SAPI voices sound flat and robotic (listen to the `sapi__*` rows). Apple compact voices are fair.
Edge online and Google voices are good but need a network connection.

- **Pros:** 0 MB download and already built (`engine/voice.js`).
- **Cons:**
  - For a learner, the voice is *unpredictable*: each device gives a different voice, and some give none.
  - There is no way to know when a line ends exactly, and no audio data to drive lips.
  - There is no real slow speed (the rate setting is erratic), and there are no gender or age voices on most phones.
- **Verdict:** keep it only as the **fallback** (for Japanese, which is not a learning language, and for any line
  without a baked clip).

### 3.2 Option (b): pre-generated audio from a local, permissively licensed TTS (recommended)

This machine already has a working TTS lab from the Avatar Studio work: `C:\Users\n\source\repos\voice_sync`. It
was only read and its venvs only run here: nothing was written there. Its venvs:

- `engines\venv`: Kokoro 0.9.4, qwen-tts 0.1.1, faster-whisper, torch 2.8 cu128.
- `engines\venv2`: VieNeu 3.8.3 and Piper.

Its licence notes [R6] were checked on 2026-10-21. The Avatar Studio speech folder (`tmp\avatar-unified-lan\public\speech`,
read only) shows the voices used before: Windows SAPI, Qwen3 "Serena" (English), and **edge-tts HoaiMy** (online and
unlicensed for redistribution, so not usable here).

| Engine | EN | KO | VI | Licence (weights) | Size | RTX 4080 speed | Status here |
|---|---|---|---|---|---|---|---|
| **Kokoro-82M** | ✅ 20+ voices | ❌ | ❌ | Apache-2.0 | 0.33 GB | ~0.05× real time (0.15–0.25 s a line) | **installed** (`hexgrad/Kokoro-82M` in the HF cache) |
| **VieNeu-TTS v3 Turbo** | – | ❌ | ✅ 25 preset voices (North/Central/South, m/f) | Apache-2.0; **preset-voice provenance unstated**; embeds a watermark | 0.3 GB + codec 0.08 GB | ~0.15× real time (0.35–0.6 s a line) | **installed** |
| Piper vi vais1000 | – | – | ✅ 1 female voice | engine GPL (not shipped); data CC BY 4.0 | 63 MB | CPU, instant | installed (baseline only) |
| **Supertonic 3** (Supertone) | ✅ | ✅ | ✅ (31 languages) | **OpenRAIL-M** (commercial use OK, with use restrictions: no impersonation, disclose machine-made content); repo **archived 2026-09-09** [R3][R4] | **0.40 GB** ONNX (10 voices F1–F5, M1–M5) | CPU/GPU ONNX Runtime | **not downloaded: needs approval** |
| **Qwen3-TTS 12Hz 1.7B CustomVoice** | ✅ | ✅ (Sohee is Korean-native; Serena gave CER 0.05 in KO) | ❌ | Apache-2.0 | **4.5 GB** | ~1.2–4 s a line | venv installed; **weights deleted from %TEMP%: re-download needs approval** |
| MeloTTS-KR (MyShell) | – | ✅ 1 voice | – | MIT | ~0.2 GB | fast | not installed (Windows needs MeCab; easier in WSL) |
| Chatterbox Multilingual | ✅ | ✅ | ❌ | MIT; Perth watermark | ~2–3 GB | ~real time | not installed; pins torch 2.6, so it needs its own venv; needs a *permitted* reference voice |
| F5/E2-TTS, XTTS-v2, viXTTS, Fish/OpenAudio, OmniVoice, MMS-TTS | | | | **non-commercial** (CC-BY-NC / CPML) | | | **excluded** from shipped assets [R6] |
| Azure Speech (cloud) | ✅ | ✅ SunHi/InJoon | ✅ HoaiMy/NamMinh | Paid service; output may be used in apps under the Azure terms; free F0 tier is 0.5 M characters a month | 0 | – | needs an owner account; scripts go to Microsoft |

Kokoro has no Korean or Vietnamese voices [R2]. Qwen3-TTS has no Vietnamese [R6].

### 3.3 Samples made today (`.tools/voice-samples/listen.html`)

The samples are three lines from the example scene (§5.3), one each for a warm woman, an elder man and a child, in
each language. That is 35 clips. All are loudness-matched to −18 LUFS and encoded twice: Opus 24 kbps (`.ogg`) and
AAC 40 kbps (`.m4a`). The page loads all 35 in Chromium at 390 px, with no sideways scroll. The scripts that made
them are in `.tools/voice-samples/scripts/`.

Machine checks:

- **CER** is the Whisper large-v3 round trip. "2" heard for "hai" counts as an error.
- **F0** is the median pitch. Typical ranges are adult women about 180–260 Hz, men 85–155 Hz, and children
  250–320 Hz.

| Lang | Role | Best by machine | CER | F0 | Others |
|---|---|---|---|---|---|
| EN | warm woman | Kokoro **af_heart** | 0 | 196 Hz | af_bella 0 / 207 Hz; SAPI Zira 0 (flat, robotic) |
| EN | elder man | Kokoro **am_michael** at 0.9 speed | 0 | 106 Hz, wide range | bm_lewis (83 Hz, deep); bm_george; am_fenrir; SAPI David |
| EN | child | **none fits**: af_nova at 1.06 gives 168 Hz, which sounds like a young woman | 0 | 164–168 Hz | SAPI Zira +25 % |
| VI | warm woman | VieNeu **Trúc Ly** (Northern) | 0 on all 3 takes | 243–277 Hz | Đoan Trang 0; Piper 0.115 (mishears "cả" as "tại") |
| VI | elder man | VieNeu **Thiền Tâm Đức** (storyteller) | 0 | 105 Hz | Hải Đăng 0 / 140 Hz (younger) |
| VI | child | VieNeu **Ngọc Huyền** take 0 | 0 | 227 Hz (young woman) | Quỳnh Anh 0.02–0.065 |
| KO | all | **Windows Heami only** (no neural Korean engine on the machine) | 0 | 169–230 Hz | the "elder man" is Heami pitched down, which is poor |

- **Speed:** Kokoro takes 0.14–0.21 s a line. VieNeu takes 0.34–0.64 s a line, about 0.15–0.2× real time on a
  shared GPU. A full corpus of about 900 clips bakes in under 10 minutes.
- **Size:** 3.3 s mean per line.
  - Opus 24 kbps: **2.9 KB/s**, so about 9.5 KB a line.
  - AAC 40 kbps: **5.1 KB/s**, so about 17 KB a line.
- **Caveat:** nobody has listened yet. The picks come only from CER, pitch and stability. The owner should
  overrule them by ear.

### 3.4 Decision

1. **Ship pre-baked audio for the scenes**, with Web Speech then blips as the fallback chain. The Settings > Voices
   modes become *Voiced* (baked, then device voice, then blips; the new default) · *Device voice* · *Blips* · *Off*.
2. **Engines.**
   - English: **Kokoro** (installed; Apache-2.0). Kokoro voice blending (e.g. 70 % af_heart + 30 % af_bella)
     gives each neighbour a distinct voice without any new download.
   - Vietnamese: **VieNeu v3 Turbo** (installed; Apache-2.0). It has 25 presets, including regional accents, to
     cast from. Before release, ask the author about voice provenance (§9).
   - Korean, which needs one approved download:
     - **First choice: Supertonic 3** (0.40 GB, OpenRAIL-M). It is the only permissive engine with EN+KO+VI in
       one model. Each character could have *one* timbre across all three languages, and its ONNX runs on CPU.
     - **Fallback: Qwen3-TTS 1.7B** (4.5 GB, Apache-2.0). The venv is already installed and it was proven in
       voice_sync (Sohee is Korean-native; Serena gave CER 0.05).
     - Then MeloTTS-KR (MIT) for a second Korean voice if needed.
   - If Supertonic sounds as good as Kokoro and VieNeu to the owner, it can replace them for consistency. That is
     a listening decision.
3. **Children.** No permissive engine has a real child voice.
   - Plan: give children short lines, and cast them on the lightest young female voice with a gentle offline
     pitch-and-formant shift (+3–4 semitones, formant ×1.1) through the WORLD vocoder (`pyworld`, MIT). Test that
     in P2.
   - If it sounds wrong, keep the young-woman voice, which is the convention in animation.
4. **Format: AAC-LC `.m4a`, mono, 24 kHz, 40 kbps**, as one file format for every browser.
   - iOS Safari's Opus support is partial and container-dependent: Ogg Opus is unreliable, and WebM Opus has
     been consistent only since about Safari 17.4 [R5].
   - Opus would save about 45 % (2.9 vs 5.1 KB/s). An optional `.webm` Opus set can be added later behind
     `canPlayType`, but one format keeps the build, the service worker and the tests simple.
5. **Generation rules,** carried over from voice_sync:
   - Synthesise one sentence at a time.
   - Use three seeded takes per sampled engine and keep the lowest Whisper CER.
   - Processing chain: trim → HPF 70 Hz → de-ess → −18 LUFS → −1 dBTP limiter.
   - Never use phase-vocoder stretching.
   - Run an ASR round trip for every clip; CER above 0.1 needs a human listen.

---

## 4. Learning features (cosy, not a classroom)

| Feature | What it does | Where |
|---|---|---|
| **House scenes** | 8–12 lines, 40–70 s, played once on entering at the right time. They can be replayed from the Phrasebook. | `game/house-scenes.js` |
| **Learning line + meaning** | The learning-language line is big; the player's own language is under it, smaller. Subtitles can be switched to *learning only* or *both*. Captions are **always on**: there is no "off". | `ui/scene-ui.js` |
| **Again / Slower** | ⟲ replays the clip. 🐢 plays it at 0.75× with `preservesPitch` (HTMLMediaElement), so no extra files are needed. | `engine/speech-audio.js` |
| **Phrase chips** | 1–3 authored chips per line, not every word (Korean and Vietnamese word splitting is unreliable). Tapping a chip shows meaning, pronunciation (Korean romanisation; Vietnamese tone note), a literal gloss, a culture note, ▶ and ★. | glossary JSON |
| **Phrasebook tab** | A travel notebook: a page per home, stamps per scene, every heard line replayable audio-only, ★ kept phrases, and counts ("42 phrases heard in Korean"). | `ui/phrasebook-ui.js` |
| **Gentle recall** | At most one question a visit: "What did Hana say?". Three audio choices, no fail state, always skippable. Lite Leitner boxes (1→3) per phrase, spaced across in-game days. | `game/phrasebook.js` |
| **Phrase of the day** | Seeded by the local date, picked from phrases the player has already heard (or the first scene's phrases). Hearing it again that day earns a stamp. Tamo says it on the title screen. | `game/phrasebook.js`, stamps |
| **Culture cards** | Each scene carries 1 culture note per language (bowing and 잘 먹겠습니다; the Vietnamese mời ritual, where children invite elders to eat; "please/thank you" in English shops). | scene data |
| **Settings > Languages** | Flat segmented rows (no sub-menu): *Learn* (English · 한국어 · Tiếng Việt · Off) · *Meaning under the line* (On · Off) · *Voices* (Voiced · Device · Blips · Off) · *Speech* (Normal · Slower) · *Pronunciation help* (On · Off). The existing *Text size* also scales the subtitle panel. | `index.html`, `ui/ui.js` |

**Learning language vs UI language.** They are independent: a Vietnamese player can learn Korean with Vietnamese
meanings. If the learning language equals the UI language, row 2 is hidden. Japanese stays a UI and subtitle
language only (there is no Japanese voice set). Japanese players hear the baked learning voice, which is the
point of the feature.

---

## 5. Content plan

### 5.1 Houses and scenes

The households are today's named townsfolk (`content/townsfolk.js`, homes `kw*`/`tk*`) plus story cast who have
homes. Each house gets **2 scenes**, a *day* one and an *evening* one, timed to when the household is home in its
Town Life plan.

| Wave | House (room kind) | Household (cast id, voice kind) | Scene 1 | Scene 2 |
|---|---|---|---|---|
| **1 (pilot)** | kw4 Nakano (kawabe-b) | Mrs. Nakano v2 f · Mr. Nakano v8 m · Daichi v10 c · guest Grandpa Ōta m-elder | **Supper at the Nakanos'** (family dinner, §5.3) | Mending the net (fisher's morning) |
| 1 | kw2 Fujita Grocery (kawabe-shop) | Mr. Fujita t1 m · customer Mrs. Komori t2 f · Kenta v3 c | **Shop talk**: prices, "how much", haggling | Closing time: counting the till |
| 1 | kw5 Granny Tsuru (kawabe-a) | Granny Tsuru v18 f-elder · Yui v20 c | **Grandma and grandchild**: folding paper cranes, the shrine bell | Rainy afternoon: an old story |
| 2 | kw3 Kubo (kawabe-a) | Mr. Kubo v19 m · Yui v20 c | **Farmer's day**: up at five, weather, seedlings | Tired feet, warm bath |
| 2 | bakery (Hana) | Hana f · Hoa f-young · Nabi f-young | Breakfast buns; Hoa and Nabi swap words | Kneading lesson |
| 2 | station (Kotone, Genzo) | Kotone f-young · Genzo m-elder | **Travel phrases**: a ticket, the platform, "is this seat free?" | Last train, lost umbrella |
| 2 | kw1 Hirano | Mr. Hirano v1 m · Kenta v3 c | Homework at the low table | The postman's map |
| 2 | kw8 Komori Sweets | Mrs. Komori t2 f · Daichi v10 c · Yui v20 c | Choosing sweets, counting coins | Wrapping a gift |
| 3 | tk3 Tanabe | Mr. Tanabe v27 m-elder · Sumi v13 c | Bell-tower supper | Polishing the bell |
| 3 | tk2 Aiko | Aiko v4 f · customer v5 Mr. Sato m | Flower and pickle stall talk | Pickling day |
| 3 | tk6 Oda | Mr. Oda v22 m-elder | Shepherd's evening, counting sheep | Winter wool |
| 3 | kw7 Ishida | Mr. Ishida v24 m · Mrs. Ishida v25 f | Lighting the lamps | Fixing a chair |
| 3 | kw6 Miss Endo | Miss Endo v9 f · Kenta/Yui | Lesson prep: days of the week | Poems (her secret book) |
| 3 | otaHouse | Grandpa Ōta m-elder · Mika | Tea with Grandpa Ōta | His old ferry |

**Totals.**

- 14 houses × 2 scenes = **28 scenes**, at about 10 lines each, which is **≈ 280 lines**.
- Voiced in 3 languages: **≈ 840 clips**.
- Text in 4 subtitle languages: **≈ 1,120 line texts**.
- Glossary: about 3 phrases a scene, so **≈ 85 phrases × 3 learning languages**, with meanings in 4 UI languages.
- Audio: 280 × 3.3 s × 5.1 KB/s ≈ **4.7 MB per learning language**, about 340 KB a house. Only the chosen
  language is downloaded.
- Wave 1 is 3 houses, which means 3 scenes, ~30 lines, 90 clips and ≈ 0.5 MB a language.

Optional P8 is **voicing the story dialogue**: about 1,176 lines in `story.js`, `grandma.js`, the townsfolk
stories and `convos.js`, using the existing vi/ko translations. That is ≈ 20 MB per language, lazy-loaded per
chapter. It is an owner decision.

### 5.2 Writing and translation method (owner reviews)

1. **Author in English** in the game's own voice: warm, a little funny, short lines (≤ 70 characters, so they fit
   two rows on a phone). Each scene teaches 3 phrases at most.
2. **Draft Korean, Vietnamese and Japanese** with a register sheet per speaker pair:
   - **Korean speech level:** 해요체 to elders, guests and in shops; 반말 from parent to child; 합쇼체 for shop
     formulas.
   - **Vietnamese pronoun pair per relationship:** ông–cháu, bố/mẹ–con, cô–cháu. Northern by default; VieNeu's
     Central and Southern voices can match a character's origin.
   - **Japanese:** subtitles only.
3. **Culturally right, not word-for-word.** A line may use each language's own ritual for the same beat. The
   example is line 8 in §5.3: "Thank you for the food" / 잘 먹겠습니다 / the mời invitation.
4. **Review.**
   - The owner reviews Vietnamese (native) and the English tone.
   - Korean needs a native reviewer if one is available. Otherwise the lines are marked `review: "draft"` and
     shown with a small "draft" tag in dev builds only.
   - A per-scene review page (generated into `.tools/scene-review/`) shows the text in 4 languages, the audio and
     approve checkboxes.
5. **Automatic checks.** Every clip gets a Whisper round trip (CER ≤ 0.1, or a human listen), and every chip must
   occur in its line (test).

**Voice cast table** (`content/scenes/cast-voices.js`). Each speaker gets a profile for each language:

- **Kinds:** f-adult ×6, f-elder ×2, f-young ×3 (Hoa, Nabi, Kotone), m-adult ×5, m-elder ×3, boy ×3, girl ×3,
  Mika (girl), Tamo (bright: pitched up with a light chorus).
- **English:** Kokoro voices and blends, with speed 0.9–1.06.
- **Vietnamese:** VieNeu presets.
- **Korean:** Supertonic voices (or Qwen speakers) with pitch offsets.
- **Rule:** no two people in the same house share a profile. A test checks this.

### 5.3 Example scene, fully written: "Supper at the Nakanos'" (`kw4.supper`)

| Field | Value |
|---|---|
| When | 18:00–20:30, any season, Explore (chapter ≥ 1) |
| Room | kw4 (kawabe-b, dining nook, `Var_scene_supper` table set) |
| Seats | Mrs. Nakano `Seat_1`, Mr. Nakano `Seat_2`, Daichi `Seat_3`, Grandpa Ōta `Seat_4`; Mika stands at the end, or sits if she uses the table hotspot |
| Cameras | `Cam_wide` (whole table), `Cam_a` (over Daichi), `Cam_b` (over Ōta) |
| Phrases taught | wash your hands · before-meal words · asking for more |

**Spoken line (learning language)**

| # | Who | English | 한국어 | Tiếng Việt |
|---|---|---|---|---|
| 1 | Mrs. Nakano | Dinner is ready! Wash your hands, everyone. | 저녁 다 됐어요! 다들 손 씻고 오세요. | Cơm chín rồi! Cả nhà đi rửa tay nào. |
| 2 | Daichi | I already did! Well… one hand. | 벌써 씻었어요! 음… 한 손만요. | Con rửa rồi mà! À… một tay thôi ạ. |
| 3 | Mr. Nakano | Both hands, Daichi. The river is still on them. | 두 손 다 씻어, 다이치. 아직 강 냄새 나. | Rửa cả hai tay, Daichi. Tay con vẫn còn mùi sông đấy. |
| 4 | Grandpa Ōta | Thank you for having me. This soup smells wonderful. | 불러 줘서 고마워요. 국 냄새가 참 좋네요. | Cảm ơn cháu đã mời ông. Bát canh này thơm quá. |
| 5 | Mrs. Nakano | It's miso soup, with the fish Daichi caught. | 다이치가 잡은 생선으로 끓인 된장국이에요. | Canh miso nấu với cá Daichi câu được đấy ạ. |
| 6 | Daichi | I caught two fish today! The big one was this long! | 오늘 물고기 두 마리 잡았어요! 큰 건 이만했어요! | Hôm nay con bắt được hai con cá! Con to dài thế này này! |
| 7 | Mr. Nakano | Yesterday it was this long. Fish grow fast in his stories. | 어제는 이만했지. 얘 얘기 속 물고기는 빨리 자라요. | Hôm qua nó mới dài thế này. Cá trong chuyện của thằng bé lớn nhanh lắm. |
| 8 | Daichi | Thank you for the food! Let's eat! | 잘 먹겠습니다! | Con mời ông ăn cơm, mời bố mẹ ăn cơm, mời chị Mika ăn cơm ạ! |
| 9 | Mrs. Nakano | Mika, shall I give you some rice? | 미카, 밥 좀 줄까? | Mika ơi, cô xới cơm cho cháu nhé? |
| 10 | Mika | Yes, please. Just a little. | 네, 조금만 주세요. | Dạ, cháu xin ạ. Một ít thôi ạ. |
| 11 | Daichi | Mum, can I have more rice? | 엄마, 밥 더 먹어도 돼요? | Mẹ ơi, con ăn thêm cơm được không ạ? |
| 12 | Mrs. Nakano | Of course. Eat well! | 그럼. 많이 먹어! | Được chứ. Ăn nhiều vào con nhé! |

**Japanese subtitles (meaning row only):**

1. ごはんできたよ！みんな手を洗ってきてね。
2. もう洗ったよ！……えっと、片手だけ。
3. 両手だよ、ダイチ。まだ川のにおいがする。
4. 呼んでくれてありがとう。いいにおいのお味噌汁だね。
5. ダイチが釣った魚のお味噌汁なんです。
6. 今日は魚を二匹とったんだ！大きいのはこーんなに長かったよ！
7. 昨日はこのくらいだったな。この子の話だと魚がすぐ大きくなる。
8. いただきます！
9. ミカちゃん、ごはんよそおうか？
10. はい、お願いします。少しだけ。
11. お母さん、ごはんおかわりしてもいい？
12. もちろん。たくさん食べてね！

The English, Korean and Vietnamese columns double as subtitles when one of them is the UI language.

**Chips (phrase ids) and culture notes**

| Phrase id | EN chip | KO chip (romanisation) | VI chip | Meaning / note |
|---|---|---|---|---|
| `wash-hands` | "Wash your hands" (L1) | "손 씻고 오세요" (son ssitgo oseyo) | "rửa tay" | "go and wash your hands". VI: *nào* softens it into a friendly nudge. |
| `before-meal` | "Thank you for the food!" (L8) | "잘 먹겠습니다" (jal meokgetseumnida) | "mời … ăn cơm" | Culture card. **KO:** everyone says it before eating ("I will eat well"). **VI:** the youngest invites each elder by name; *ạ* is a polite ending. **EN:** there is no fixed phrase; families say "Thank you for cooking" or "Let's eat". |
| `just-a-little` | "Just a little" (L10) | "조금만 주세요" (jogeumman juseyo) | "Một ít thôi ạ" | Polite "only a little, please". |
| `more` | "can I have more…?" (L11) | "더 먹어도 돼요?" (deo meogeodo dwaeyo?) | "ăn thêm … được không ạ?" | Asking for more. KO 돼요? = "is it OK?"; VI *được không* = "can (I)?". |

**Recall questions (pick 1 a visit):**

- "What did Daichi say before eating?" with L8 and two distractors (L2, L12).
- "How did Mika ask for only a little?" with L10.

The voice samples in §3.3 come from lines 1, 4 and 6/11 of this scene, lightly shortened.

---

## 6. Room changes ("a little larger")

### 6.1 Measured now (`content/interior-manifest.js` floors; GLBs in `public/models`)

| Kind (houses) | Floor (m) | Ceiling | Tris | Primitives | Materials | Resident spots |
|---|---|---|---:|---:|---:|---:|
| kawabe-shop (kw2, kw8) | **5.4 × 4.7** | 3.10 | 12.7 k | 17 | 7 | 2 |
| takamori-b (tk2, tk4, tk6) | **5.3 × 4.9** | 3.02 | 11.7 k | 17 | 7 | 2 |
| kawabe-a (kw1, kw3, kw5, kw7) | 6.4 × 5.4 | 3.10 | 12.2 k | 21 | 7 | 2 |
| takamori-a (tk1, tk3, tk5) | 7.3 × 6.0 | 3.12 | 12.1 k | 18 | 7 | 2 |
| kawabe-b (kw4, kw6, otaHouse) | 8.2 × 6.2 | 3.10 | 10.9 k | 19 | 7 | 2 |
| boathouse | 5.4 × 7.4 | 3.45 | 9.9 k | 18 | 7 | 2 |
| shed | 8.4 × 10.4 | 3.70 | 14.2 k | 20 | 7 | 2 |
| cottage / bakery / mill / station | 7.6–8.2 × 6.6–7.4 | 3.12–3.45 | 12.8–23.7 k | 6–13 | 6–7 | 0 |

The camera inside (`interiors.js` `snapCamera`) uses zoom ≤ 4.6 m and pitch 0.34. In a 4.7–5.4 m-deep room, a
4.6 m follow distance cannot fit, so `clampCamera` pulls the camera to the wall right behind Mika. A table with
four people cannot be framed there.

Today's residents are **anonymous** (`director.spawnResidents`: `res:<room>:<i>`, random man/woman/kid). The named
family members vanish at their door (`{ inside: 0 }`). Only shopkeepers get a dressed indoor body
(`townlife.spawnKeepers`).

### 6.2 Proposal

| Kind | New floor | Area change | Ceiling | What is added |
|---|---|---|---|---|
| kawabe-shop | 6.6 × 5.6 | +45 % | 3.3 | Back nook behind the counter (stools, tea), room for 2 customers |
| takamori-b | 6.8 × 6.0 | +57 % | 3.3 | Low table and cushions, kitchen corner |
| kawabe-a | 7.6 × 6.4 | +41 % | 3.3 | Low table (chabudai) + 4 zabuton; small altar shelf |
| takamori-a | 8.0 × 6.8 | +24 % | 3.3 | Dining nook |
| kawabe-b | 8.4 × 7.0 | +16 % | 3.2 | Dining nook (the pilot room) |
| cottage, bakery, mill, station, boathouse, shed | unchanged | – | – | Scene nodes only (bakery breakfast table, station bench) |

Rooms hang at y 600 and do not need to match the outside footprint, so making them bigger changes nothing outdoors.

**New Blender nodes per room** (read by `scripts/interior-manifest.mjs`):

- `Seat_1..4` (position and facing; replaces the need for more `Spot_npc_*`)
- `Cam_wide`, `Cam_a`, `Cam_b` (empties for the scene camera)
- `Var_scene_<id>` groups (e.g. the supper dishes), hidden unless the scene runs

**Budget per home room:**

- ≤ 20 k tris (today 10–14 k), ≤ 24 primitives, ≤ 7 materials (shared palette, no textures, as today).
- Scene props, such as the dishes set, are one merged mesh per scene, about 1.5 k tris.
- GLB ≤ 0.9 MB raw (today 0.57–0.70 MB; meshopt packs it to about 40 %).

**Phone cost.** Inside a room, all outdoor objects are hidden (`hideOutdoors`). The outdoor Low rows are 91–133
draws and 0.45–0.72 M tris. A room is 17–24 primitives, about 20 k tris, plus up to 4 villager NPCs, Mika, Tamo,
shadows and the 11 Low post passes.

- **Estimate:** 45–70 draws and under 0.15 M tris inside, well under every outdoor row.
- **To confirm in P0:** measure it on the Low tier and record new budget rows `low:interior-kw4`,
  `low:interior-kw4-scene` (4 NPCs), `high:interior-kw4-scene`.
- **Memory:** about +0.2 MB per room model when it is cloned. Rooms load only near their door (`PREFETCH` 28 m), as
  today.

**Camera.**

- Raise the indoor zoom clamp to `min(zoom, 5.2)` in the bigger rooms. Read `man.floor` and leave the small
  shop/boathouse at 4.6.
- During scenes, use the authored `Cam_*` shots through `follow.shot` (the pattern of `indoor.js` `seatShot`). Cut
  between shots, never pan fast. Keep the existing 0.42 m wall margin in `clampToRoom`.

---

## 7. Lips, faces and talk animation

| Who | Face rig today (measured from the GLBs) | During a voiced line |
|---|---|---|
| **Kotone** | morphs `blink`, `mouthA`, `mouthO`; bones `eye_L`/`eye_R` (`actors/face.js`) | Real lip motion: drive `mouthA`/`mouthO` from the clip's **loudness envelope** (30 Hz, precomputed in the manifest), through a new `face.speakClip(env, clock)` beside `sing()`. Blink and gaze carry on. |
| Story cast (Mika, Hana, Ōta, Rin, Genzo, Sora) and villagers (man, woman, kid) | none: the mouth is a painted geometry patch (`build_characters.py` `f.mouth`); 19–22 bones, `head` only | Play the `Talk` clip (all villagers and Hana have it). Add a **head nod**: an additive head-bone pitch of ≤ 4°, triggered on envelope peaks and capped at 3 a second. Listeners turn their heads to the speaker. A speaker-coloured name tag is shown in the subtitle. Cost: one quaternion multiply per speaking NPC. |
| Dancers (Hoa, Nabi, Byeol, Haru) | body-shape morphs only | Same as the villagers: talk gesture and head nod. A face rig is a later job with the face-speech-motion skill. |
| Tamo | – | Emissive glow pulses with the envelope (a uniform; free). |

**Optional P7b: a mouth morph for the chibi cast.** Add one `mouthOpen` shape key to the mouth patch in
`build_characters.py`, and drive it with the envelope.

- **Risk:** `skin-merge.js` / `mergeChars` must keep morph attributes. Test that before committing.
- **Cost:** a morph on about 150 vertices, only for the 1–2 speakers at a time.
- **Gate:** ship only if phone draws and frame time stay the same.

---

## 8. Tech design

### 8.1 Files

**New:**

| File | Purpose |
|---|---|
| `src/content/scenes/index.js` | Scene registry: id, house, when, cast, seats, cams, lines (pure). |
| `src/content/scenes/<house>.js` | One file per house, e.g. `kw4.js` holds `kw4.supper`, `kw4.net`. |
| `src/content/scenes/glossary.js` | Phrase entries (EN/KO/VI chips with meanings in en/vi/ko/ja). |
| `src/content/scenes/cast-voices.js` | Voice profile per speaker per learning language (used by the bake and the tests). |
| `src/game/house-scenes.js` | Picks the scene on entering (time, chapter, household home, not heard today), runs it (seats the household bodies, cams, line loop), and pauses Town Life for the house. Pure picker exported for tests. |
| `src/game/phrasebook.js` | Pure: record heard lines and phrases, Leitner boxes, recall pick, phrase of the day (date seed), stamps hook. |
| `src/engine/speech-audio.js` | Baked clip player: one reusable `<audio>` element, `preservesPitch`, routed through `createMediaElementSource` into the existing `AudioContext` gain (iOS ignores `audio.volume`). Methods: `prefetch(sceneId, lang)`, `play(lineKey, {slow})`, `stop()`, `envelopeAt(t)`. Also ducks the music during speech. |
| `src/ui/scene-ui.js` | Subtitle panel (learning line, meaning, chips, Again/Slower/Next), chip card, recall card, first-time language card. |
| `src/ui/phrasebook-ui.js` | Journal tab 12. |
| `scripts/speech-build.mjs` | From the scene data: writes `.tools/speech/lines.json` for the bake, takes the produced `.m4a` + envelopes, writes `public/speech/<lang>/<scene>/<n>.m4a` and `public/speech/<lang>/index.json`. `--check` verifies all clips exist and the text hashes match. |
| `tools/tts/` (committed) | `bake.py` (Kokoro/VieNeu/Supertonic engines, takes, chain, Whisper CER, envelope), `README.md` (venvs, model ids and revisions, licences). Models and venvs are never committed; they stay in voice_sync or `.tools/`. |
| `art/blender/interior_*.py` edits + `scripts/interior-manifest.mjs` | Bigger rooms, seat/cam nodes, scene variants. |
| Tests | `tests/scenes.test.mjs`, `tests/phrasebook.test.mjs`, `tests/speech-manifest.test.mjs`, `tests/house-scenes-browser.mjs`, new rows in `tests/perf/budget.json`. |

**Changed:**

| File | Change |
|---|---|
| `src/engine/voice.js` | `VOICE_MODES = ['voiced','read','blips','off']`. The old `read` stays as "Device voice". Migrate saved `read` → `voiced`. Keep `tests/voice.test.mjs` green. |
| `src/ui/ui.js` | Settings > Languages rows; journal tab `phrases`; `showPage` asks `speech-audio` first when a baked clip exists (P8). |
| `index.html` | Settings rows (flat `<select>` or segmented buttons) and the journal tab button. |
| `src/world/interiors.js` | Read `Seat_*`/`Cam_*`; `Var_scene_*` toggles; start `speech.prefetch()` alongside `ensure()` for the house's due scene; zoom clamp by room size. |
| `src/game/director.js` | Household bodies: like `spawnKeepers`, a dressed indoor copy of each named folk, created lazily only for the active room's scene cast (not 21 at start). Anonymous residents are skipped in houses that have scenes. |
| `src/game/townlife.js` | Expose "is X home now" for the picker; hold the household's plan during a scene. |
| `public/sw.js`, `scripts/stamp-sw.mjs` | `speech/**` handled like models (content-hashed, cached on first fetch). Respect `MIN_FREE_MB`. "Clear downloaded game data" also clears speech. |
| `scripts/i18n-extract.mjs` | Skip `content/scenes/*`: scene lines are learning content with their own language fields, not UI strings. New UI strings still go through `tx()` and the packs. |

### 8.2 Data formats

```js
// src/content/scenes/kw4.js
export default [{
  id: 'kw4.supper', house: 'kw4', title: N_('Supper at the Nakanos\''),
  when: { hour: [18, 20.5], chapter: [1, 5] },          // seasons/story keys as in barks/convos
  cast: { v2: 'Seat_1', v8: 'Seat_2', v10: 'Seat_3', ota: 'Seat_4' }, props: 'Var_scene_supper',
  cams: ['Cam_wide', 'Cam_a', 'Cam_b'],
  lines: [
    { who: 'v2', cam: 0, gesture: 'Talk',
      en: 'Dinner is ready! Wash your hands, everyone.',
      ko: '저녁 다 됐어요! 다들 손 씻고 오세요.',
      vi: 'Cơm chín rồi! Cả nhà đi rửa tay nào.',
      ja: 'ごはんできたよ！みんな手を洗ってきてね。',
      chips: { en: [['Wash your hands', 'wash-hands']], ko: [['손 씻고 오세요', 'wash-hands']], vi: [['rửa tay', 'wash-hands']] } },
    // …
  ],
  recall: [{ q: N_('What did Daichi say before eating?'), answer: 7, decoys: [1, 11] }],
  review: { en: 'ok', ko: 'draft', vi: 'ok', ja: 'draft' },
}];

// glossary entry
'before-meal': { en: { say: 'Thank you for the food!', note: {...4 UI langs} },
                 ko: { say: '잘 먹겠습니다', roman: 'jal meokgetseumnida', lit: {...}, note: {...} },
                 vi: { say: 'mời … ăn cơm', tone: 'mời (huyền) · ăn · cơm', note: {...} } }
```

```jsonc
// public/speech/ko/index.json (written by speech-build; one file per learning language, ~10 KB)
{ "v": 1, "lang": "ko", "engine": "supertonic-3@<rev>", "built": "2026-12-..",
  "lines": { "kw4.supper/1": { "f": "kw4.supper/01.m4a", "d": 2.86, "h": "<sha1 of text+voice>",
                               "env": "<base64 uint8 loudness, 30 Hz>" } } }
```

The hash `h` ties a clip to its exact text and voice: `speech-build --check` (part of `npm test`) fails when the
text changed after the bake. The fallback chain is clip, then device voice (`voice.js`), then blips.

### 8.3 Loading

- **Fetch order.** Only the chosen learning language's `index.json` is fetched, once, at game start (~10 KB).
- **Prefetch on approach.** When Mika comes within 28 m of a door (the existing room prefetch), the room's
  *due* scene clips are fetched: about 12 × 17 KB ≈ 200 KB, with no decode. HTTP/2 on Pages makes 12 small
  requests cheap.
- **Caching.** The service worker keeps the clips, so a revisit is offline. Phrasebook replays fetch on demand.
- **No frame cost.** Playback is `<audio>` element streaming, so nothing is decoded into PCM on the main thread.
  Per frame, the only work is one `envelopeAt()` lookup for the speaker.
- **Budgets.**
  - The first scene adds ≤ 250 KB a house, and ≤ 5 MB per language for all 28 scenes.
  - Nothing is preloaded at boot except `index.json`.
  - The subtitle panel has no `backdrop-filter`.
  - Each scene adds 0 draw calls besides the household bodies (≤ 4) and props (1).
- **iOS.**
  - The first tap unlocks audio (the existing `voice.unlock` pattern, extended to `speech-audio`).
  - Test the silent switch. Use `navigator.audioSession.type = 'playback'` where Safari supports it.
  - Opus is not used, so there is no codec gap.

### 8.4 Settings and save data

- **Device preferences** (localStorage, like `starline-opt-voices`): `starline-learn` =
  `{ learn: 'ko'|'en'|'vi'|null, meaning: true, speed: 1|0.75, roman: true }`.
- **Learning progress** in `starline-phrasebook` (shared by all save slots by default; owner decision §10):
  `{ v:1, heard: { 'kw4.supper/8': { ko: { n, first, last } } }, phrases: { 'before-meal': { ko: { box: 1-3, due, kept } } }, scenes: { 'kw4.supper': { ko: 2 } }, potd: { day, id, done } }`.
  The payload is under 30 KB even when complete.
- **The save slot** gets only `lastScene` per house, so a scene does not replay on every entry. Old saves load
  unchanged.

---

## 9. Phased build plan (each phase small, testable and shippable)

These checks apply to **every** phase:

- `npm test` passes, including `i18n:check` and the new scene/speech checks.
- `tests/perf-budget-browser.mjs` passes: outdoor rows unchanged; interior rows once recorded.
- The story e2e (`node tests/e2e/run.mjs`) still passes: scenes never fire while `director.busy`.
- Screenshots at 390×844 and 1280×720 in en/vi/ko/ja.
- The UI audit (11 px / 44 px / no sideways scroll) passes on every new panel.
- Worktree with its own vite `cacheDir`; ports 5961–5963; servers stopped by PID.

| Phase | Scope | Acceptance |
|---|---|---|
| **P0 Measure + decide** (no game code) | Measure Low/High draws, tris and frame time inside kw4 with 4 NPCs spawned (QA hook); the owner listens to `listen.html`; downloads approved; the Korean engine picked; the reviewer for Korean named. | Numbers in this doc §6; decisions in §10 ticked. |
| **P1 Scene data + pure logic** | `content/scenes/*` with `kw4.supper` in 4 languages, glossary, cast-voices; `game/phrasebook.js`; `house-scenes` picker (pure). Nothing visible. | `tests/scenes.test.mjs`: all languages are present, chips are substrings, lines ≤ 70 characters (40 CJK), speakers have profiles, no two in a house share a voice. `phrasebook.test.mjs`: boxes, potd determinism, recall decoys. |
| **P2 Voice pipeline** | `tools/tts/bake.py` + `scripts/speech-build.mjs`; bake kw4 in EN (Kokoro) and VI (VieNeu); KO after the download; child-voice WORLD-shift test; listen page per scene. | `speech-build --check` is green; CER ≤ 0.1 or listened; all clips at −18 LUFS ±1, ≤ 25 KB; the owner approves the kw4 audio by ear. |
| **P3 Scene runner (pilot, existing room)** | `speech-audio.js`, `scene-ui.js`, household bodies, cams from fallback positions (before the new rooms), Settings > Languages, voice-mode migration, first-time card. Wave-1 text for kw2 and kw5. | `tests/house-scenes-browser.mjs` (fake `<audio>` like `voice-browser.mjs`): enter kw4 at 18:30 with `?learn=ko`; 12 lines; Again/Slower/Next; skip; chip card; no scene during a story step; returning to the door works. New perf rows ≤ estimate. iPhone/Android check by the owner. |
| **P4 Phrasebook + recall + phrase of the day** | Journal tab 12, recall card, potd toast and stamp. | Browser test: tab renders all 4 UI languages with no overflow at 390 px; recall is never shown during story; tab count audit passes. |
| **P5 Bigger rooms** | Blender: kawabe-a, kawabe-b, kawabe-shop, takamori-a, takamori-b at the §6.2 sizes, with seats, cams and `Var_scene_*`; manifest regenerated; zoom clamp by size. | `interiors.test.mjs` and `interior-manifest.test.mjs` pass; `asset-contracts` pass; tris and primitives within §6.2; before/after screenshots in every kind; the camera never clips (existing clamp test); hotspots re-placed (`indoor.test.mjs`). |
| **P6 Content wave 2, then wave 3** | 5 houses, then 6, each 2 scenes: write, review, bake, test. | Same as P1–P3 per wave; ≤ 5 MB per language in total. |
| **P7 Faces** | Kotone `speakClip` lips; head-nod and listener look-at for everyone; (b) optional chibi `mouthOpen` morph experiment. | `face.test.mjs` extended; no extra draws; Low frame time is the same within noise (A/B worktree bench). |
| **P8 (optional) Voice the story** | Bake story, grandma and townsfolk dialogue in EN/KO/VI from the existing packs; lazy per chapter; `showPage` plays clips. | ≤ 20 MB a language, lazy; e2e still green with `?mute=1`; owner approval for the size. |

Phases P1–P4 can ship with the pilot house only. The feature is off until the player picks a learning language,
so it is safe to push at any phase.

---

## 10. Risks

| Risk | Effect | Mitigation |
|---|---|---|
| TTS sounds artificial (nobody has listened yet) | Voices stay at 5 instead of 6.5 | The owner listens in P0/P2; seeded takes; choose per voice; keep lines short. |
| No good Korean voice until a download is approved | Korean learners get only the device voice | P0 decision; Supertonic first (0.4 GB), Qwen3 as fallback. |
| Translation quality (Korean is not reviewed by a native) | Wrong lessons damage trust | Register sheets; `review` flags; a native Korean reviewer before release; a dev-only "draft" tag. |
| Child voices sound like adult women | Immersion | Short child lines; WORLD shift test; the animation convention. |
| Licences: VieNeu voice provenance unstated; Supertonic OpenRAIL use rules and archived repo; espeak-ng (GPL) inside misaki | Legal | Ship only generated audio. Record model, revision and licence per clip in `index.json` and `tools/tts/README.md`. Ask the VieNeu author. Disclose "voices are synthetic" in the credits (OpenRAIL asks for this). |
| Scenes clash with the story or Town Life | Bugs, people in two places | Never while `busy`; the household is held during the scene; e2e stays green; the scene picker checks "is home". |
| iOS audio (unlock, silent switch, `<audio>` volume) | Silence on iPhone | Gain through Web Audio; unlock on first touch; `audioSession`; owner's real-phone test in P3. |
| Phones get slower inside bigger rooms or with 4 NPCs | Breaks the hard limit | P0 measurement; budget rows; lazy household bodies; ≤ 20 k tris rooms. |
| Download size grows (P8) | Data use | Lazy per house and per chapter; one language only; the service worker cache cap and "Clear downloaded game data". |
| UI crowding on phones (two language rows + buttons) | Readability | Meaning row toggle; text-size option; the 11 px / 44 px audit; no grouped buttons. |
| Fonts: a Korean line shown while the UI language is English | Tofu or a font flash | Load the learning language's font family as well (`i18n.js` `loadFont`). |

---

## 11. AAA score estimate, before and after

| Part | Before | After | Why | What still holds it down |
|---|---:|---:|---|---|
| Voices | 3 | 6.5 | Every house scene is voiced by a character-cast neural voice in 3 languages; Kotone lip-syncs | Synthetic, not acted; story dialogue unvoiced until P8 (would add +0.5); chibi mouths don't move |
| Audio | 4 | 5 | Room ambience per house (kettle, cutlery, rain on the roof) + music ducking during speech | Procedural music is still thin; no authored SFX pass |
| Balance & depth | 5 | 6 | A real long-term loop: hear → collect → recall → potd stamps, across 3 languages | Learning is light (no production or speaking practice) |
| Replay | 6 | 7 | 3 learning languages × 28 scenes; potd; day/evening scenes | Scenes do not vary once heard |
| Character identity | 6.5 | 7.5 | Families with homes, voices and rituals; guides Hoa, Nabi and Kotone | Chibi faces; generic villager bodies inside |
| Content | 8 | 8.5 | +28 scenes, +85 phrases | – |
| Onboarding | 6 | 6.5 | First-scene language card, gentle and clear | – |
| Accessibility | 5 | 6.5 | Captions always on, replay, slow, text size inside, audio for players who cannot read yet | No colour-blind or remapping pass |
| Localisation | 8 | 8.5 | Voiced in EN/KO/VI; culturally adapted lines | Japanese is not voiced |
| Terrain/environment, Animation | – | +0.3 each | Bigger, lived-in rooms; talk gestures | – |
| **Overall** | **6.0** | **≈ 6.45** | | Still held down by first-minute wow, AI, multiplayer (5 %), synthetic voices and phone performance (unchanged by design) |

---

## 12. Owner decisions needed

1. **Downloads:**

   | Model | Size | Source | Licence | Note |
   |---|---|---|---|---|
   | (a) **Supertonic 3** | 0.40 GB | `huggingface.co/Supertone/supertonic-3`, ONNX + 10 voice styles | OpenRAIL-M | Korean plus a possible one-engine EN/KO/VI cast |
   | (b) **Qwen3-TTS-12Hz-1.7B-CustomVoice** | 4.5 GB | `huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice` | Apache-2.0 | Korean fallback; venv already in voice_sync |
   | (c) optional **MeloTTS-KR** | ~0.2 GB | | MIT | Best in WSL |
   | (d) optional `pyworld` | pip, tiny | | MIT | Child-voice shift |

   Alternatively, use **Azure Speech** (needs an account) instead of (a) and (b).
2. **Voices:** listen to `.tools/voice-samples/listen.html` and confirm or overrule the machine picks: EN af_heart
   / am_michael; VI Trúc Ly / Thiền Tâm Đức / Ngọc Huyền. Decide how children should sound (shifted voice or
   young woman).
3. **Which houses first:** the pilot proposed is kw4 Nakano supper, kw2 Fujita shop and kw5 Granny Tsuru.
4. **Room sizes:** OK to enlarge the five home kinds (§6.2), including the shop interiors?
5. **Learning progress:** shared by all save slots (proposed), or per slot?
6. **Default:** off until chosen on the first house visit (proposed), or ask on the title screen?
7. **Korean review:** is there a native Korean reviewer? Otherwise Korean ships marked as draft.
8. **P8:** voice the whole story too (≈ 20 MB a language, lazy), and in which order?
9. **Guides:** OK to make Hoa (VI), Nabi (KO) and Kotone (EN) the language guides who hand out the potd?

---

## Sources

- [R1] Readium, "SpeechSynthesis in browsers and OSes": https://readium.org/speech/docs/WebSpeech.html (raw: https://raw.githubusercontent.com/readium/speech/HEAD/docs/WebSpeech.md)
- [R2] Kokoro-82M voices: https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md (9 languages, no ko/vi)
- [R3] Supertonic 3 model card: https://huggingface.co/Supertone/supertonic-3 (31 languages incl. ko and vi, OpenRAIL-M, ~99 M params); file list and sizes: https://huggingface.co/api/models/Supertone/supertonic-3?blobs=true
- [R4] Supertonic GitHub (archived 2026-09-09, onnxruntime-web example): https://github.com/supertone-inc/supertonic
- [R5] Opus support: https://www.caniuse.com/opus; WebKit bugs https://bugs.webkit.org/show_bug.cgi?id=238546 and https://bugs.webkit.org/show_bug.cgi?id=245428
- [R6] Local: `C:\Users\n\source\repos\voice_sync\README.md` and `LICENCE_NOTES.md` (checked 2026-10-21: Kokoro, Qwen3-TTS, VieNeu, Piper, Chatterbox, MeloTTS, F5, XTTS, OpenAudio, OmniVoice, MMS)
- [R7] MDN `getVoices()` / `SpeechSynthesisVoice.localService`: https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/getVoices
- Measurements here: `.tools/voice-samples/metrics.json` (CER, F0, sizes) and the interior GLB counts (gltf-transform, 2026-11-28).
