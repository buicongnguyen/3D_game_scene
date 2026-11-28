# Sing & Play (plan, 2026-11-27)

> **Since 2026-11-28 Sing & Play is Explore's show layer** (docs/EXPLORE-AND-SHOW.md), not a mode of its own. What
> changed from the sections below: it opens in place from Explore (the HUD's Perform on flat open ground, the pause
> menu's Sing here, the title's Sing & Play = Explore with the layer open); the singer is the Play as body (Saki when the
> player was Mika) and the Singer chip changes the body walking the valley; **Leave show** closes the layer where she
> stands (no reload, no return to the title); the Explore save goes on (nothing is written mid-song) and the mode's own
> place key `starline:singplay:v1` is no longer read; the **Time** chip is a Go to… (the valley's own clock moves
> forward, days lived, no slow clock while free, nothing eased on open); Tamo waits at home only during a song; the
> station sisters keep their day; the Night Star waits only during the player's own song; the **Festival stage** on the
> Takamori square is the eighth stage. Everything else (songs, groups, the camera man, Record, captions, effects,
> watchers, the strong-phone rule, Stella) works as described below.

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
- `src/game/singplay/singplay.js` (mode: body swap, HUD, perform flow, audience), `pickers.js` (the setup chips and their
  picker: "Bar layout" below), `flat.js` (pure: the flat-ground test),
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

## Time of day, watchers at night, the song lock (2026-11-28, branch singplay-time)
Owner: "so we may need a kind of time travel to the good time to perform?" (the show's beams, lasers, confetti and
fireworks are night-only, petals and bubbles day-only; Stella sings at night; the mode starts at 17:30).
- **Time** (`src/game/singplay/time-row.js`): a flat choice **Morning (8:00) · Noon (12:30) · Sunset (18:00) · Night
  (21:00)**, each with a small pictogram. One tap eases the valley there in 2 s (smoothstep, the shorter way round the
  clock: sky, sun and moon, lamps, the night value, Town Life's plans all follow the shown hour); the pressed button is the
  band the valley is in (Night from 19:00, where the show's own night starts) or the one it is easing to. While she is
  free the clock runs on slowly (an hour every 10 minutes); while she performs it holds (a song's look never changes
  mid-song); after Stop it runs on. A song started mid-ease jumps to the hour it was easing to (the show picks day or
  night then). Remembered per device (`starline:singplay:time`): the next visit eases to it once the mode is up. The
  mode owns the shown hour only (`game.timeOverride`); `game.time.hour` (the story and Explore clock) is never touched
  and Sing & Play writes no Explore save. Hidden with the other setup rows while she performs.
  For the coming picker: `TIME_CHOICES` ({ id, hour, label, icon }), `currentTime(sp)`, `pickTime(sp, id)`,
  `timeIcon(id)`; `mountTime` is the thin row.
- **Layout**: phones (and phones on their side) put Time on one line with the Stages (it scrolls sideways as before;
  icon over an 11 px label, 44 px tall), so the idle bar keeps its four rows (390x844: 194 px as before). PC (wider than
  640 px and taller than 480 px): the four join the Perform row (CSS `display: contents` on the line), the stages keep
  their own row.
- **Watchers at night** (`src/game/singplay/night-watchers.js`): Town Life sends people home after dark, so a Night show
  found nobody to wave a glow stick. When a song starts at night the audience fills up to **6 on PC, 3 on Low, 2 on Low
  with the group of 8**: first Town Life people still out (walking home, from up to 60 m), then villagers who "stayed
  out for the show": bodies from the valley's own villager models (no download, tinted), **no shadow (one draw each)**,
  walking in from 5 m to the side over dry, clear ground; places on the half ring first, then a row 1.5 m farther or 1.2 m
  nearer (a platform edge or a lamp on the ring), 1.2 m apart at least; fewer when there is no more room. After the song
  they walk off and are removed (12 s at most). `?nightWatchers=off` for measuring.
- **Stella's hint**: with the Night Star as the singer and the time not Night, the hint line says "Stella sings best at
  night" (her name in the game's language; nothing is changed for the player).
- **The song lock** (`director.js`): the director derives `player.locked` every frame, so the `locked = true` Perform set
  was undone the next frame and she could walk off mid-song (measured: 4.46 m in 1 s holding W). The derivation now
  includes `performing` (Sing & Play and the Night Star set it for the whole song): 0 m. Interaction prompts and the kite
  are off during a song for the same reason.
- **Measured** (dev server, Chromium + GPU, `.tools/time/check.mjs`, `watchers-shot.mjs`):
  - the ease, Low 390x844 at 4x CPU, unpaced, warmed: steady frames p50 18.6 / p95 27.8 / max 46.8 ms; during an 11-hour
    ease (Morning -> Night) 17.6 / 31.5 / 37.7 ms. The extra is the sky's own environment-map rebuild (its 120 ms rule:
    15 an ease, 5.4-6.4 ms each at 4x). An ease is one 2-s governor window and leaves the median alone; the governor
    steps on a median over 31 ms twice running or a p95 over 62.5 ms three times running, so an ease cannot step it.
  - night watchers: PC High, group of 4 at the station: 6 villagers, +6 draws and the sticks' 1 (+8.8 measured with Town
    Life walkers moving), their update 0.15 ms a frame; Low at 4x CPU: group of 4: 2 villagers (the station's ring had
    room for two), +3.8 draws, 0.6 ms a frame; group of 8: 2 villagers, +3.8 draws, 0.3 ms a frame (the first run: one
    villager and the sticks, +2.0 exactly).
  - the station's Low budget (91; tests/perf/budget.json, the budget's own view from Mika's spot there): 87.7 draws at
    11:00 and 81.7 at 21:00 with the villagers home, so at night the 8 and the show (+3 +3, docs/GROUP-PERFORMANCE.md,
    docs/SHOW-EFFECTS.md) and the watchers (+3) come to about 84 - 6 + 9 = 87 of 91. People still walking home in view
    add their own draws for a while (99.5 measured right after jumping from 11:00 to 21:00), as on any evening.
  - every bar button 44 px+, text 11 px+, no sideways page scroll, no overlap with the minimap, menu, journal or touch
    buttons on 1280x720, 390x844, 360x780 and 844x390 (on its side the scrolling lines' clipped buttons pass under the
    touch buttons' boxes, hidden by the line's own clip, as before). Pictures: `.tools/time/` (local).

## Songs from the library (2026-11-28, branch songs-remote)
Owner: Starline's songs move to their own public repo, served by GitHub Pages, and the game loads them from there.
- **The library**: github.com/buicongnguyen/starline-songs, served at https://buicongnguyen.github.io/starline-songs/
  (the game's own origin: Web Audio `createMediaElementSource` and Record's `captureStream` keep working).
  `index.json` (version 1) lists every song; `songs/<id>/<id>.<ver>.{m4a,beats.json,lyrics.json,mouth.json,stage.json}`
  are immutable (the version is a hash of the song's files). Audio: AAC-LC 160 kbps 44.1 kHz from the WAV master; the
  Avatar Studio songs are copied byte for byte (SHA-256 checked). Golden Rails EN/VI + the hum are there too; the game
  keeps its own copy of them (`public/songs/kotone/`) as the offline set.
- **Reading it** (`content/song-catalog.js`): Sing & Play starts with the built-in songs and asks for the catalog at once;
  it comes in within 4 s or not at all (the row keeps the built-in songs). `?songsBase=<url>` reads another copy (a local
  server of the songs repo, with CORS), `?songsBase=off` none; `?qa` pages read none unless given one. A library song with
  a built-in id replaces it (keeps its translated title; the built-in copy is its fallback).
- **Song row**: the songs of the game's language (`songsFor`: Korean now has its own; Japanese hears English) plus the
  instrumentals, in the order dance songs (bpm 90 and up), slow songs, instrumentals; one flat row after Lyrics On/Off,
  sideways scroll where it does not fit. Picking a song brings its dance style (`songStyle`: the catalog's `style`, else
  Cute for a slow song); the Dance row still changes it. The choice is data plus handlers (`songChoices()`,
  `currentSong()`, `chooseSong(id)`, `onSongs`) so another picker can host it.
- **Lazy files**: nothing of a song loads before Perform. Perform fetches its json files and its whole audio (shown as
  "Getting the song ready…"), then plays a blob: copy (one download; Record and Web Audio take it as before). A failure:
  the built-in copy when there is one, else a toast.
- **Instrumentals** (`instrumental: true`, no lyrics or mouth): danced only, no mic span, no singing mouth, no caption.
- **Level**: the catalog's `gainDb` (to -16 LUFS) scales the song on the music bus (`SongAudio.level`).
- **Service worker**: nothing of the library is precached. index.json is network first (the kept copy offline); a song's
  files are kept in `starline-songs` once played (range answers from the kept copy; the oldest go past 120 MB); `?qa` and
  `?nosw` pages keep nothing. Settings' "Clear downloaded game data" clears it with the rest.
- **Titles**: a library song's title is shown as its catalog writes it (its own language); a built-in one stays translated.
- **Caption**: a line still being sung keeps the caption until its end (a short line right before the next one was cut
  off by the next one's 0.6 s lead and its last word never lit: Tay Trong Tay).
- **Checked on every song** (`.tools/songs/library-check.mjs`, 2026-11-28): beat clock from beats.json, the plan in all four
  styles (a dance for every section, mic spans only on sung songs), solo and group camera plans to the end, every caption
  line shown at its own time with its words lit in order, the singing mouth open on 89-98 % of the sung word time. Six
  slow songs sing into their last two bars, so their plan has no closing bow (the plan's rule: no moment over a sung
  line). troupe-check (group of 8): Mơ Thật Xa (mix) and 별까지 자라나 (K-pop): no joint-rule frames, planted-foot slide
  p95 0.8-1.4 cm/s, p99 under 3.2 cm/s.
- **Credits**: "Songs © 2026 Bui Cong Nguyen, made with ACE-Step 1.5; from the Avatar Studio library."
- Tests: `tests/song-catalog.test.mjs` (fixture `tests/fixtures/songs-index.json`, no network; the service worker run in a vm).

## Bar layout: picker chips (2026-11-28, branch singplay-pickers)
Owner: "In Sing & Play there are now too many buttons. Think deep and organise them nicely, neat and tidy. Maybe group:
'select singer' shows the current one singer; click on it shows the 8 singers to select. The same with the other
groups." An owner-approved exception to the flat-menu rule, for setup **choices** only; the **actions** stay direct
one-tap buttons. This replaces the rows described in the sections above (Group, Dance, Singer, Song + Lyrics + Show
effects, Stages, Time); every choice, its handler and its remembered value are the same.
- **Chips** (`src/game/singplay/pickers.js`): Singer (face + name) · Song (♪/♫ + title) · Group (Solo / Group of 4 /
  Group of 8) · Dance (Auto / Mixed / K-pop / Cute / Hip-hop) · Stage (the stage she stands on, else "Here") · Time
  (sky icon + Morning / Noon / Sunset / Night) · ⚙ (Lyrics, Show effects). Each chip shows a small label over its current
  value; a chip being loaded (a singer's model, the group, a song) pulses. Chips hide during a song.
- **One picker**: a tap on a chip opens its picker; one tap on an option picks it and closes (the ⚙ sheet opens straight
  to its two switches and stays open while they flip). Phones (width up to 640 px or height up to 480 px): a bottom sheet,
  never over the chips; PC: a popover over the chip (under the little map's line at the top), clamped to the screen.
  Only one open at a time: another chip switches to its picker in one tap, the same chip / ✕ / Esc / a tap outside
  closes. A tap outside only closes (it starts no stick, look, drag or button). While a picker is open (or a gamepad is
  on the bar) `game.inputHold` keeps the keys, pad and sticks off her (`game.js`: no movement, no look, no edges).
  - Singer: face tiles with names (Stella: "Best at night"). Song: list rows (title; language or Instrumental, bpm, dance
    style, length) in sections Dance songs / Slow songs / Instrumentals, scrolling inside the sheet, the current one
    picked. Group: Solo / 4 / 8 tiles with little people; 8 only where the device offers it, else a short note
    ("Group of 8: checking this device…" while a phone measures, "Group of 8 needs a faster device"). Dance: 5 tiles; Auto
    says what it will dance now ("Follows the song: Cute"). Stage: "Here" (where she stands; only when she is not on a
    stage) and the 7 stages. Time: 4 tiles with sky icons and hours.
  - Keyboard: Tab reaches the chips; Enter / Space opens (the focus on the picked option); arrows / WASD move by place,
    Home / End, Enter / Space pick, Esc / Backspace close, Tab stays inside; the focus goes back to the chip. Gamepad: the
    D-pad puts the pad on the bar (Perform first; the D-pad moves among chips and actions), A presses, B closes a picker /
    leaves the bar, moving the stick leaves it too; in a picker the D-pad or stick moves, A picks, B closes.
  - ARIA: chips are buttons with `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls`, an aria-label
    "Singer: Kotone"; the panel is `role="dialog"` (labelled by its title) holding `role="listbox"` sections of
    `role="option"` buttons with `aria-selected` (⚙: `role="switch"` + `aria-checked`).
- **Dance: Auto** (new, the default): she dances the song's own style (`danceFor`: the catalog's style, Cute for a slow
  sung song, else Mixed). A picked style now stays whatever song is chosen (before, picking a song overwrote the Dance
  choice). Remembered per device under a new key `starline:singplay:dancePick` (the old `starline:singplay:dance` was
  also written by song picks, so it is not read: everyone starts on Auto once).
- **Actions** (`singplay.js` hud): a big primary **Perform** (mic; **Stop** in the same place during a song), **Record**
  (red dot; the time while it records) and **Photo**; **Camera: Auto / Free** only during a song. Narrow phones during a
  song: Record / Photo show their icon, Camera "Auto" / "Free" (names kept as aria-labels); where the row would wrap (a
  long language) Photo, then Record, drop their text (`fitActions`).
- **Where things go** (one column at the bottom centre: caption, chips, hint, actions; `--sp-top`, `--sp-below`,
  `--sp-clear` set on body by `Pickers.layout`):
  - Phones upright: chips in two rows at the top, under the objective and the little map with its buttons (Singer · Song
    · Group / Dance · Stage · Time · ⚙); actions centred just over the Do it / Jump buttons (124 px up); the hint and,
    during a song, the song line and the lyric caption stacked over them. Toasts under the chips.
  - Phones on their side: chips in one row under the objective; actions at the bottom in the band left of the touch
    buttons; the sheet between the chips and the bottom edge. Toasts under the chips.
  - PC: one chip row over the hint and the actions at the bottom centre; the popover over its chip; toasts at the top as
    before; the interaction prompt moved over the stack (`--sp-clear`).
- **Measured** (`.tools/pickers/audit.mjs`, dev server, Chromium + GPU, library songs, `?nightstar=1`): 390x844,
  360x780, 430x932 (touch, Low), 844x390 (touch, Low), 1280x720, 1920x1080; idle, a toast, every picker open, and a song
  with a caption line and a toast: 66 states, 0 problems: every control 44 px+ (chips 44 phones / 48 PC, actions 48-58),
  text 11 px+ (chip labels; values 13-15 px), no overlap with the objective, little map, menu, journal or touch buttons,
  toasts and the caption clear of everything, no sideways scroll of the page or the chip rows, panels on screen and never
  over the little map. Vietnamese on 360x780 and 844x390, Korean on 390x844: the same (Vietnamese found two: Photo's
  text now drops where the row would wrap; the phone chip rows are single flex lines, so long values ellipsize). The idle bar on 390x844: chips 94 px (two rows) at the top + actions 52 px over the touch
  buttons, instead of 194 px of rows that scrolled sideways. Behaviour (`.tools/pickers/behave.mjs`): picks (singer
  swap, group load, dance, time ease, stage jump, switches), keyboard, gamepad, outside taps, input hold, the song state:
  all pass. Pictures: `.tools/pickers/before/`, `.tools/pickers/after/` (local).
- Tests: `tests/singplay-pickers.test.mjs` (chips and pickers as data, song tags and sections, Auto, the Group of 8 note,
  Stage "Here", the keyboard / pad step), `tests/song-catalog.test.mjs` (Auto follows the song, a picked style stays).
