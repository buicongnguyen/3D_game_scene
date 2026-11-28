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
8. **Sing here** (2026-11-28; `src/game/singplay/sing-here.js`, `ui.js` bindSingHere): in Explore the pause menu has
   *Sing here* under Photo mode. It shows while nothing else owns the game (Photo mode's own rule: no round, scene, tour
   or ride) and is pressable only on dry, flat, open ground outdoors (the Perform check, solo); otherwise it stays in place,
   dimmed, with one short reason (`Not while swimming`, `Not while riding`, `Not indoors`, `Stand on the ground first`,
   or the Perform reasons). Pressing it writes the Explore save once (Mika's place, as any save), stores her spot and
   facing as Kotone's place, and starts the mode in place (no reload; a reload into `?start=singplay` only if the module
   fails to load). From then on nothing writes the Explore save (director.canSave). The valley keeps its season and hour.
   Explore only: the story keeps its own flow and save.
9. **Stages** (2026-11-28; `src/content/stages.js`, `src/game/singplay/stages-row.js`): a flat, always-visible row
   of six ready-made spots in the bar, under the group row: Station stage (-91, 99.5, facing pi), Shrine yard (62, -147,
   0), Kite meadow (-29, 79, pi/2), Riverside by Ōta Mill (-16.3, -55.6, 3pi/2), Village square in Kawabe (-45, 20, pi),
   Star hill (-59, 159, pi). A tap teleports her there (out of a room first), resets the camera behind her and she is
   ready to press Perform; the stage she stands on shows pressed; refused during a song. Each spot was searched in the
   running game with canPerform + canGroup for 4 and 8 at its facing and still passes 0.6 m off and 0.1 rad turned;
   tests/singplay.test.mjs checks them again on the terrain and building boxes. Phones: the row scrolls sideways; on its
   side it takes no width of its own (CSS `contain: inline-size`) so the bar stays clear of the Do it button.

## Files
- `src/game/singplay/singplay.js` (mode: body swap, HUD, perform flow, audience), `flat.js` (pure: the flat-ground test),
  `camera-man.js` (pure plan + per-frame follower), `recorder.js`, `captions.js` (pure: .srt from lyrics).
- `src/ui/ui.js` + `index.html` (the title button), `src/main.js` (start the mode), i18n strings in `src/i18n/*.json`.

## Checks
- Node: flat test (slopes, water, colliders, rooms), camera plan (deterministic, shot per section, close-ups on chorus
  lines, no shot twice in a row, reveal last, follower frame-rate independent), captions, mode switches.
- Browser: PC 1280x720 and phone 390x844 (Low, 4x CPU) screenshots of free play, Perform allowed / refused, a performance
  with the audience, the camera shots; a recorded sample; frame time while recording on Low.
- Switch: `?singplay=off` hides the menu entry and Sing here; in the story and Explore only the pause menu's small
  check loads (`sing-here.js` + `flat.js`), the mode itself only when Sing here is pressed.

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

## Face the camera, Record from idle, the camera grammar, hillsides (2026-11-28, branch sing-camera)
Owner: "when I press Perform the group should turn 180 deg to face the camera so we see that background behind them";
"there is no Record button yet"; "learn the camera from Avatar Studio"; the phone bar covered the view; "make it perform
in a little steep spot".
- **Face the camera** (`singplay.js` performFacing / faceCamera): on Perform Kotone and the formation turn to the camera's
  view direction + pi, so the view the player framed is the backdrop; Stop turns her back and puts the follow camera behind
  her again. The idle room checks (canGroup) use that turned facing. Stages (`content/stages.js`): `facing` is now the
  camera's view after a jump (each stage keeps its spot and its old backdrop: the stored facing turned half round), except
  Star hill, which now films the valley (checked at the new turn); the place saved for the next visit keeps the view.
- **Record** works before a song: it starts the performance and the take together (label "Record", "● 0:12" while it
  records); Stop ends both and saves the video + captions as before.
- **Phone bar**: during a song the setup rows (group, dance, stages) hide; Stop / Record / Photo / Camera stay in one
  row with the song line under it (390x844: the bar 194 px tall idle, 44 px performing); they come back after Stop.
- **Camera grammar** (`perform/camera-man.js`, from Avatar Studio `club/club-director.js`: cuts on bar lines, a new shot
  per section, never the same shot twice, short close-ups, calm long moves in verses, a crane after the loud parts, the
  ending crane-out): open (starts at the player's own camera, then eases in), wide, crane, landscape (far and high,
  aimed 30 m past the group: the chosen view fills the frame), medium, side, low hero (opens every chorus), push, orbit,
  close (Kotone's sung lines: a verse line every 6 bars at most, a chorus line every 4, never two in a row, 4 bars at
  most), reveal. No shot shorter than 2 bars; the camera stays in front of walls and trees (collider ray to her) and over
  the ground between it and her (terrain samples), portrait frames stand back. No extra render passes.
- **Hillsides** (`singplay/flat.js`): her ring may slope up to 20 deg (0.6 m over 1.6 m; banks/cliffs past 30 deg between
  samples still refuse), a group's whole ground within 0.6 m of height and each member's ground under 20 deg (reasons:
  "Too steep here"); a closer layout (x 0.85, z 0.75) is tried when the first one does not fit. Feet: `perform/ground-fit.js`
  drops the pelvis to the lower planted foot and turns each planted foot by the slope about its toe joint onto the ground
  (two-bone leg solve), for Kotone and every member. Measured (`scripts/troupe-check.mjs --slope 15|20 [--across]`, 8
  dancers, golden-rails-en): planted toe/ankle within 0.55 cm of the dance's height over the ground (0 sink), slide p95
  1.01 cm/s (the same as level), joint rules 0. New stage **Orchard slope** (80, -85; a 12 deg hillside, the valley below).

## Singer, Song and the lyric caption (2026-11-28, branch singer-pick)
Owner: "Can we change the singer to other characters in the group?"; "Add a small caption to see what she is singing";
a Song row ready for the songs being made.
- **Singer row** (`singplay.js` pickSinger / swapBody, `content/troupe.js` SINGERS / castOf): a flat row of the eight
  members' faces (48 px buttons, 44 on phones; `public/faces/<id>.webp`, 64 px, 1.2-1.6 KB each, baked once by
  `node scripts/bake-singer-faces.mjs` from each model's head), aria-label "Singer 1..8" (names: `NAMES` in
  content/troupe.js, empty until they have them). Idle only (hidden while performing, like the other setup rows);
  remembered per device (`starline:singplay:singer`). The picked one becomes the player's body (her model, `.lite` on
  Low; her own Idle / Walk / Run from her GLB at her own gait, `TROUPE[].gait` from the build) and the lead: her face sings
  the song's mouth, the mic sits on her own grip_R, the close-ups and camera follow her.
- **Her dance, no new downloads** (`perform/troupe.js` leadSource, `performer.js` source): Kotone's moves pack plays on a
  Kotone rig (her place in the formation, or a hidden clone under the lead in a solo: one mixer, her foot hold) and the
  lead copies it with the followers' maths (hips by the leg ratio, the leg solve, then her own ground fit); the mic layer
  goes on top on the lead. The front row copies the same Kotone rig.
- **The cast** (`castOf(lead)`): the singer takes the lead's place, Kotone the singer's own place; a back-row singer:
  Kotone takes the outer front place and its girl the singer's place, so Kotone is in every group of 4 and 8. The places
  never change (the stage and room checks hold for every singer); whoever stands at nam-1's place plays nam-1's pack,
  made ready for her own body. Files: only the built models and the two packs there are.
- **Song row** (idle only, remembered per device `starline:singplay:song`): the songs in the game's language
  (`songsFor`); a new song is an entry in `content/kotone-songs.js` and shows up here. Perform sings the picked one (no
  more cycling). The row ends with **Lyrics: On / Off** (`starline:singplay:lyrics`, default On).
- **Lyric caption** (`perform/caption.js`, pure; DOM `#spCaption`): the line being sung from `<id>.lyrics.json` in a
  semi-transparent dark pill, the sung word lit (gold), the sung ones white, the rest dimmed; from 0.6 s before the line to
  0.9 s after it; one line (two at most). PC: lower third, 17 px; phones: above the touch buttons, 14 px; phones on their
  side: above the one-row bar. Not in recorded videos (the DOM is not the canvas; the `.srt` has the lines).
- **Layout**: setup rows share lines: [Group | Dance] and [Singer | Song + Lyrics], so the idle bar keeps its four rows
  (390x844: 194 px tall as before); on phones a line scrolls sideways when it does not fit.
- **Stage backdrops** (owner, 2026-11-28: "choose the best backdrop for each stage"): each stage's framed view was drawn
  both ways at 17:30 (PC 1280x720) and the more open one kept: Station stage, Shrine yard and Kite meadow turned round
  (the valley and Kawabe's roofs, the torii and the valley, the stream and a cherry tree, instead of the station wall, the
  shrine hall and a stand of trees); Riverside, Village square, Star hill and Orchard slope kept. The station spot moved
  to (-92, 101) and the shrine spot to (62.5, -149) so a group of 8 fits at the new turn. Room for Solo / 4 / 8 at every chosen turn, 0.6 m off and 0.1 rad
  turned, checked again with the game's own colliders.
- **Measured** (dev server, Chromium + real GPU, `.tools/singer/final.mjs`): the lead copy (Kotone's rig: mixer, foot
  hold, matrices, the copy with the leg solve) 0.10 ms a frame on PC (group of 4 led by nu-3; the front row's copies
  0.11 ms besides, as before), 0.08-0.14 ms on the phone views (Low, solo, no CPU throttle). Kotone leading: no change
  (no rig, no copy). Every bar button 44 px+, text 11 px+, no overlaps with the minimap / menu / touch buttons, no
  sideways page scroll on 1280x720, 390x844, 360x780, 844x390; the caption 16 px PC / 14 px phones, one line.

## Show effects and the Night Star (2026-11-28, branch show-fx)
- **Show effects** (docs/SHOW-EFFECTS.md): on Perform a festival stage set unfolds behind the performers and the song
  drives fake show lighting: colour washes per section, beams and lasers at night, chorus bursts (confetti at night;
  petals, bubbles and balloons by day), fireworks over the last chorus at night, the watchers' glow sticks waving on the
  beat (they clap on the beat by day). No lights, no extra pass: 4-6 draws at night, 2-3 by day. **Show effects: On /
  Off** after Lyrics in the Song row (remembered per device, `starline:singplay:showfx`; `?showfx=off|on`).
- **The Night Star** (docs/NIGHT-STAR.md): once her show at the shrine was seen, Stella joins the Singer row at its end
  (`public/faces/night-star.webp`); she leads at the lead's place, Kotone takes the outer front place (a group of 8 then
  leaves one girl out), and in any Dance choice she skips the moves her long dress cannot take. `?nightstar=1` shows her
  in the row for testing.

