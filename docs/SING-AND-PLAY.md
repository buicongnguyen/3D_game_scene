# Sing & Play (plan, 2026-11-27)

Owner's choices: play as Kotone, perform anywhere flat, an automatic camera and Record. Mika stays the story heroine.
Builds on Kotone's song performance (`src/game/perform/`, docs/KOTONE-SHOW.md).

## Flow
1. Title menu: **Sing & Play** (next to Explore and Mini games). It starts an Explore session (its own valley, the Explore
   save untouched) with `singplay` set; the mode module (`src/game/singplay/`) loads only then.
2. The player's body becomes Kotone (`kotone` / `kotone.lite` on Low, plus `moves-kotone`): same controller, touch, keys and
   pad; her Mixamo Idle / Walk / Run at her own gait (actors/gait.js `kotone`: walk 0.958, run 4.077 m/s), so the feet do
   not slide. She starts where she last left this mode (localStorage `starline:singplay:v1`), else at the station stage.
3. **Perform** (a 44 px+ HUD button, always the same place, no sub-menu) is enabled only on flat, walkable, open ground:
   ground heights over a 1.6 m ring (12 samples + centre) within 0.25 m and no slope over 12 deg; not in or by water; no
   collider within 1.4 m; inside a room only if that clear radius fits. When not allowed the button stays visible but
   dimmed, with one short reason (`Too steep here`, `Too close to the water`, `Not enough room here`).
4. Pressing it: the song plays (content/kotone-songs.js: "Golden Rails" in the game's language, Vietnamese or English;
   the next one each time when there are more), she performs it
   (perform/performer.js on the player), up to 4 villagers nearby (2 on Low) walk over, stand in a half ring, face her and
   cheer / wave on the choruses and at the end (Town Life's own people, held from their plan meanwhile).
5. **Auto camera** (perform/camera-man.js): shots planned from the song's sections and bars, after Avatar Studio Club
   mode's camera man: an establishing wide at the start, medium shots on verses, close-ups on chorus lines, an orbit in the
   bridge, a pull-back reveal at the end. A critically damped follower keeps it smooth at any frame rate. No handheld shake
   at all (phones: owner rule). Dragging hands the camera back to the player for a few seconds.
6. **Record** (perform/recorder.js): `canvas.captureStream(30)` + the song's audio (a MediaStreamDestination on the song's
   gain node) into MediaRecorder: `video/mp4` where supported (Safari / iOS), else `video/webm`; on Low / phones the
   picture is capped at 720p (the renderer's pixel ratio for the take); the button shows the elapsed time; it stops at the
   song's end (or on a tap) and downloads `kotone-<song>-<date>.mp4|webm` plus captions `.srt` from the lyrics. **Photo**
   saves the frame as a PNG. Stop / Leave go back to free play.
7. Leaving the mode (pause menu: **Leave Sing & Play**) saves her place and returns to the title.

## Files
- `src/game/singplay/singplay.js` (mode: body swap, HUD, perform flow, audience), `flat.js` (pure: the flat-ground test),
  `camera-man.js` (pure plan + per-frame follower), `recorder.js`, `captions.js` (pure: .srt from lyrics).
- `src/ui/ui.js` + `index.html` (the title button), `src/main.js` (start the mode), i18n strings in `src/i18n/*.json`.

## Checks
- Node: flat test (slopes, water, colliders, rooms), camera plan (deterministic, shot per section, close-ups on chorus
  lines, no shot twice in a row, reveal last, follower frame-rate independent), captions, mode switches.
- Browser: PC 1280x720 and phone 390x844 (Low, 4x CPU) screenshots of free play, Perform allowed / refused, a performance
  with the audience, the camera shots; a recorded sample; frame time while recording on Low.
- Switch: `?singplay=off` hides the menu entry; nothing of it loads in the story or Explore.

## Results (2026-11-28, dev server, Chromium + real GPU)
- Flow checked on PC 1280x720 and phone 390x844 (Low, CPU 4x): the mode starts as Kotone, Perform is refused on a
  hillside ("Too steep here") and allowed on the station square, a whole song plays with the camera man (wide intro,
  medium / low / side verses, close-ups on chorus lines, an orbit in the bridge, the reveal over the bow), no errors.
- Phones: the bar sits in one row under the objective (four 44 px buttons), clear of the touch buttons and her body.
- Record: Chromium writes `video/mp4` (avc1 + mp4a): PC 28 s take 18.2 MB; phone 24 s take 1.55 MB (720p cap, 24 fps,
  2 Mbps); captions `.srt` saved beside it.
- Frame time while performing, phone Low at 4x CPU: p50 18.7 / p95 40.2 ms; while recording 41.1 / 72 ms (headless
  Chromium encodes in software on the throttled CPU; a real phone's encoder is hardware, still to be measured on a device).

## Group of 4 / 8 (2026-11-28)
A flat **Solo / Group of 4 / Group of 8** row under the bar: Kotone performs with three girls (front row) or with all seven
other VRoid samples in two rows; each row dances in unison from ONE animation evaluation. Phones (Low) offer Solo and 4.
See docs/GROUP-PERFORMANCE.md.

## Dance choice (2026-11-28)
A third flat row under the bar: **Mixed / K-pop / Cute / Hip-hop** (44 px+, always visible, no menu, vi/ko/ja; disabled
while performing like the group row; remembered per device). It picks the plan's dance loops, mic moves and moments
(docs/KOTONE-SHOW.md "The Dance choice"); a group dances the same style. Phone layout: the hint moved down to 152 px under
the three rows.
