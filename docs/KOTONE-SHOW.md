# Kotone's song performance (2026-11-28)

Owner: "find the sequence of singing with mic and dance from the Club mode in Avatar Studio, not single dance moves."
Kotone now performs a whole song the way Avatar Studio's Club-mode lead singer does: a sequence driven by the song (beats,
bars, sections), singing into a hand mic with the mic moves laid over the dance on sung lines, dance sets changing on bar
lines by section, and moments (a clap hop into a chorus, a wave in the bridge, a cheer and a bow at the end).

**Credit.** The ideas, rules and the movement vocabulary are Avatar Studio Club mode's (its docs/club/PLAN.md: "Club
singing", "Dance styles", "Move chains", "Beat sync", "Auto move chains", "Look at camera", "Celebration moments", "Camera
man"). The moves are its Moves v2 club loops, mic moves and moment moves, solved on Kotone's own body by its solver.

## How Club mode composes a performance (the map)
```
songs.json row (bpm, offset, mood, clubFx) + <id>.beats.json + <id>.stage.json + <id>.lyrics.json + <id>.mouth.json
  -> src/club/beat-clock.js createBeatClock: beatAt / barAt / sectionAt / energyAt (beats.json grid, else bpm + offset)
  -> src/club/dance-sets.js createClubDancer (per dancer, every frame update(t)):
       block = 8 bars (4 on slow songs), new at each section; tier = section kind (verse calm, pre mid, chorus big) moved by
       energy; pickOwn/pickDance (seeded hash, never the same twice); clip time from the song beat (beat-sync.js beatRate:
       m in 1/2, 1, 2 loop beats per song beat); 1-beat crossfade on the bar line; freeze on a section's last beat;
       group moments (unison / canon / mirror / solo); clubMoment(): hop / wave / cheer / bow, faded over a beat;
       the lead singer dances SINGER_GROOVE in sung sections
     (src/move-chains.js generateAutoChain: the same idea one level up for the studio's Sing sets: a seeded plan of sets
      per section by song kind, final chorus biggest, calm outro)
  -> src/club/club-singing.js (pure): vocalLines, leadTarget (mic up 0.45 s before a line, held through gaps < 2.4 s),
       micClipFor (Sing sway on verses, Chorus punch / Wave crowd on chorus lines), castLines (duets)
  -> src/club/club-singers.js: micLayer (the mic moves' neck/head/arms/fingers slerped over the dance after the mixer),
       stage-mic-prop.js (the mic on the solver's own micGrip handle), sing-along.js + performer-sing.js (mouth from
       <id>.mouth.json), camera-look.js (eyes and part of the head to the camera on sung lines), carryHand
  -> src/club/club-director.js: the camera man's shot plan from the same clock, sections and sung lines
Moves: src/moves-v2/moves/V2Club*.js (8-beat loops at 120 BPM, feet on beats by construction), V2SingSway /
V2ChorusPunch / V2WaveCrowdM (mic), V2ClapHop / V2WaveCrowd / V2CheerFists(M) / V2BowPolite / V2BowMic (moments), all solved
per body by src/moves-v2/core.js bakeMove (targets in body frames scaled by the body's own measurements and skin).
```

## The port (what Starline got)
- **Pure modules, ported:** `src/game/perform/beat-clock.js` (the clock + beatRate, no audio analysis),
  `perform/plan.js` (the whole performance planned once, seeded by the song id: sets per block by section and song kind,
  the singer's groove in sung parts, mic spans, moments), `perform/mic-layer.js` (vocalLines, leadTarget, micClipFor,
  micFold, the mic layer).
- **The vocabulary, baked (chosen over mapping to Mixamo clips):** the Studio's own solver run on Kotone's skeleton and
  skin in Node (`scripts/kotone-club-bake.mjs`; the solver copied read-only into `.tools/club-solver` with three name
  patches: spine1 + chest, shin, the mouthO morph for her lip centre). 23 clips appended to `moves-kotone.glb`: 14 club
  loops (`Club*`), 3 mic moves (`Mic*`), 6 moments (`Moment*`). Why: the Club loops land on the beat by construction, the
  mic moves hold a mic at her own lips, and the joint rules pass on her body; Mixamo dances would need beat warping and
  have no mic moves. The bake is fast (35-200 ms a move) and needs no Blender.
- **Joint rules** (the Studio's src/anatomy-joint-check.js, R1-R11, 60 Hz, at 1.2x): 0 hits on all 23 clips, before and
  after key thinning (art/blender/trim_clips.mjs at the pack's 2.4 tolerance for arms, fingers, spine and head; hips, thighs,
  shins, feet and toes keep every key: see "Fix: skating feet" below).
- **Runtime:** `perform/performer.js` (actions on her own mixer, times and weights from the song beat every frame, the mic
  layer after the mixer, face.sing, eyes to the camera on sung lines; the audio is the clock, followed with a 0.35 s time
  constant), `perform/mic-prop.js` (the hand mic), `game/kotone-show.js` (a song every third number when Mika is near).
- **Songs:** `src/content/kotone-songs.js`. A test page can add one with `?kotoneSong=<folder>/<id>` (same origin); the
  test fixture (an Avatar Studio song) lives only in `.tools/test-song`.

## Her song: "Golden Rails" (2026-11-28)
The owner's picks from the song round (`.tools/kotone-song`, ACE-Step 1.5 XL sft, original lyrics): EN-C (English) and
VI-B (Vietnamese, "Đường Ray Vàng"), one tune, 86.7 / 85 BPM, 88 s, 32 bars; and HUM-A, her wordless 8-bar hum loop.
- Files in `public/songs/kotone/`: `golden-rails-en.*`, `golden-rails-vi.*` (`.m4a` + beats / lyrics / mouth json) and
  `kotone-hum.{ogg,m4a}` + its beats / mouth json; 2.43 MB together (`TOTAL_SONG_BYTES` 2.6 MB in tests/asset-contracts.mjs).
  No instrumentals ship: far from her the same song plays quieter. The service worker does not store `songs/` (they load
  on demand: stamp-sw lists models, icons, portraits, zones and assets only).
- **Language:** `songsFor(list, getLang())`: the show and Sing & Play sing the Vietnamese take when the game is in
  Vietnamese, the English one otherwise (ko / ja too). The title ("Golden Rails", translated) shows under the Sing & Play
  bar while she performs.
- **The hum** (`src/game/kotone-hum.js`): on one day walk in three (06:00-17:00, at least 40 s apart), with Mika within
  15 m, she hums HUM-A: an AudioBufferSourceNode looping between loopStart and loopEnd on the music bus, gain by distance
  (full within 4 m), starting on a phrase (bar 0, 2, 4 or 6), one loop cycle at most, her lips from its mouth curve. It
  stops when she stops walking, Mika walks off, or dialogue, a scene, a mini game, the pause menu, Sing & Play or her show
  begins; a dead man's switch on the gain fades it out when frames stop coming. Silent with Voices "Off", Music at 0 or
  `?mute`. The valley's tune holds while she hums. `.ogg` where Vorbis plays, else `.m4a` (Safari); both seams line up
  (`.tools/seam-check.mjs` in Chromium and Edge: lag 0, correlation 0.99).
- Tests: `tests/kotone-songs.test.mjs` (files, budget, data read by the clock / plan / face, language choice, hum rules
  with a fake Web Audio).

## Plug in Kotone's song
Put `<id>.m4a` (or .mp3) and whichever of `<id>.beats.json`, `<id>.stage.json`, `<id>.lyrics.json`, `<id>.mouth.json`
exist into `public/songs/kotone/`, then add one line to `KOTONE_SONGS`:
`{ id: '<id>', title: '<title>', base: 'songs/kotone/', audio: '<id>.m4a', bpm: <bpm>, offset: <first downbeat s>, duration: <s>, mood: 'uplifting', language: 'en+vi' }`.
Without lyrics she dances and the mouth stays shut; without mouth.json the lips follow the lyric word timings.

## Fix: skating feet (2026-11-28)
Owner, watching the first sample: "sometimes the upper body moves a lot but the legs don't move ... spinning and almost
falling over" (first blamed on the 1.52 m resize). Measured over the whole test song, posed exactly as the game does
(`.tools/motion-check.mjs`: toe joints within 4 mm of the floor = planted; chest turn against the feet, lean, chest over
the feet):

| | planted-foot slide p95 (cm/s) | fastest planted slide | slides > 1.5 cm | chest-vs-feet turn p95 / max | lean p95 | sink |
|---|---|---|---|---|---|---|
| before (1.52 m, legs thinned) | 36-38 | 76 cm/s | 430 | 2.0 / 3.1 deg | 5.7 deg | 0.7 cm |
| after (1.62 m, legs exact, stance order, foot hold) | 1.1-1.2 | 30 cm/s (a cross-fade) | 17 | 2.0 / 2.7 deg | 5.8 deg | 0.9 cm |

(Lean over 15 deg only in the closing bow, by design.) The torso never turned against the legs: the mic layer moves only the
neck, head, shoulders, arms, hands and fingers (no spine, hips or legs; weight 1, no SingUpper over-driving). The cause was
the **key thinning**: each bone's keys were thinned on their own within 1.2 deg, and the small errors of hips, thigh, shin and
foot add up at the sole, so the planted feet swam 25-58 cm/s under a steady upper body (the in-memory bake: 0.1-1.6 cm/s;
the same at both heights, so the resize was not it). Fixes:
- `trim_clips.mjs` takes a bone pattern kept exact; the bake keeps hips and legs exact (pack 0.93 -> 1.14 MB raw, 0.80 -> 0.86 MB packed).
- The order (plan.js): no loop turning the hips or chest over 10 deg or lifting over 10 cm (Body roll, Jump point) under the
  mic; a loop's neighbour is one starting in the same stance where possible (the bake measures each move's start stance,
  turn and lift: `STANCE` in kotone-club-fit.js); stances more than 6 cm apart cross-fade over two beats, others one.
- `perform/foot-hold.js`: a planted foot is held on its spot through a cross-fade (two-bone leg solve), let go over 0.8 s.
- Her height is the source's again (1.62 m; owner).

## Numbers
See the commit message and the report: pack sizes, frame times near her on Low at 4x CPU, contact sheets.
