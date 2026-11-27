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
  after key thinning (art/blender/trim_clips.mjs at the pack's 2.4 tolerance, 16-bit rotations).
- **Runtime:** `perform/performer.js` (actions on her own mixer, times and weights from the song beat every frame, the mic
  layer after the mixer, face.sing, eyes to the camera on sung lines; the audio is the clock, followed with a 0.35 s time
  constant), `perform/mic-prop.js` (the hand mic), `game/kotone-show.js` (a song every third number when Mika is near).
- **Songs:** `src/content/kotone-songs.js` (empty until her song lands). A test page can add one with
  `?kotoneSong=<folder>/<id>` (same origin); the test fixture (an Avatar Studio song) lives only in `.tools/test-song`.

## Plug in Kotone's song
Put `<id>.m4a` (or .mp3) and whichever of `<id>.beats.json`, `<id>.stage.json`, `<id>.lyrics.json`, `<id>.mouth.json`
exist into `public/songs/kotone/`, then add one line to `KOTONE_SONGS`:
`{ id: '<id>', title: '<title>', base: 'songs/kotone/', audio: '<id>.m4a', bpm: <bpm>, offset: <first downbeat s>, duration: <s>, mood: 'uplifting', language: 'en+vi' }`.
Without lyrics she dances and the mouth stays shut; without mouth.json the lips follow the lyric word timings.

## Numbers
See the commit message and the report: pack sizes, frame times near her on Low at 4x CPU, contact sheets.
