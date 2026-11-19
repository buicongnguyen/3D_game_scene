# Starline: the road to an AAA feel

Written 2026-11-19 after playing the build at `3ddeefc` + astra's two review branches. "AAA" here means the bar the
owner set for all the games: Mario Kart 8 polish, vivid warm colour (not pastel), and a story whose logic holds up.

## 1. Where the game stands

**Strong already (keep, do not rework):**
- Content depth: two stories (Grandma, Classic), 4 seasons, ~39 story steps, 21 rooms, 20 townsfolk with routines,
  ~25 mini games with levels, swimming, diving, kite flight, sky gazing, Explore mode, four languages.
- Title screen and the valley's look: warm, saturated, readable; grass with wind and colour patches; lit windows at night.
- Phone path: Low tier, cell grid, program-sorted draws, warm-up behind the loading screen, governor, light mode.
- Tests: 1,033 unit tests, i18n coverage gate, browser suites, story autopilots.

**Gaps against the AAA bar (found by playing, desktop 1280×720 and phone 390×844):**

| # | Gap | Seen where | Weight |
|---|-----|-----------|--------|
| G1 | Small props (well, signboards, trees, fences) hide Mika completely; the camera only pulls in for buildings and hills | Kawabe well, phone view: half the screen is the well and she is gone | High: you lose your character |
| G2 | Yes/no questions use the browser's popup (`confirm()`): grey system box, English buttons, breaks full screen | New game over a save, Delete save, Explore "Start over" | Medium: the first thing a new player may see |
| G3 | Phone objective card: the chapter line wraps to two lines, the card covers ~12 % of the screen | Every phone screen | Medium |
| G4 | Pick-ups, petting and low targets have no body motion (no crouch/kneel/reach) | Mill cogs, hay, bugs, feeding | High, but needs Blender clips (REMAINING-ISSUES P1) |
| G5 | Tour/intro videos still show the old Classic look | Title → Scene tour | Medium (re-record ≈ 30 min) |
| G6 | Archery hands are mittens with rings, phone camera hides the bow | Archery | Medium |
| G7 | No photo mode: the album only gets the party photos | Everywhere | Medium (fun, shareable) |
| G8 | Follow camera made up to ~20 new vectors every frame | `actors/camera.js` | Low (GC on phones) |
| G9 | `docs/STORY.md` was out of date with the scripts | docs | Low |

## 2. The owner's ideas, checked

| Idea | Verdict |
|------|---------|
| Lower the mountains and put a sea around so only sky is drawn (fewer trees) | **Not worth it.** Measured: the cost is the village (people, buildings, shadows), not the far forest; the forest is already instanced and culled. It would also change the valley the story is about. Done instead: program sort + warm-up (`f6f474c`) and the cell grid (`6a807ed`). |
| Optimise for phones when a phone is used | **Done** (`f6f474c`, `6a807ed`; Low tier only where it changes the picture). |
| Characters speak (TTS) | **Done** (`3ddeefc`): Settings → Voices: Blips / Read aloud / Off, in the game's language, per-speaker pitch. |
| Choose male or female voices | **Done** (`3ddeefc`): each speaker gets a woman's, a man's or a child's voice where the device has one. |
| astra's review (two branches) | **Merged** in this pass: double blip, dialogue timers, Explore saves, picker focus, tree LOD fix, interrupted-scene recovery, objective counters. |

## 3. New ideas (ranked by fun per hour of work)

1. **Mika never lost** (G1): see-through silhouette where scenery hides her. *Cheap, felt every minute.*
2. **In-game questions** (G2): one confirm card in the game's look and language.
3. **Photo mode**: pause, free orbit camera, Mika poses (wave, peace sign, sit), frame filters (film, sakura, night),
   saved to the Album and as a PNG. The album and the snapshot code (`game.takeSnapshot`) already exist.
4. **Crouch / kneel / pick-up clips** (G4): the plan is written in `REMAINING-ISSUES.md` P1.
5. **Little weather moments**: a sun shower with a rainbow, a passing kite flock, the 17:00 bell with birds lifting.
   Small random events make the valley feel alive between story beats.
6. **Daily stamp card**: three small tasks a day from the neighbours (deliver, find, play), stamps unlock
   decorations for Sora's cottage. Gives Explore mode a loop.
7. **Haptics and rumble** on phones/gamepads for catches, lamp lighting and landings.
8. Re-record the tour videos (G5) and archery hands (G6).

## 4. Plan

| Phase | Work | Check |
|-------|------|-------|
| A (this pass) | Merge astra's branches; G1 silhouette; G2 confirm card; G3 phone card; G8 camera allocations; G9 story doc | `npm test`, i18n gate, screenshots desktop + phone, confirm-card browser check |
| B | Photo mode (idea 3) | Unit test of the camera clamp; screenshots at 3 viewports; Low-tier frame time unchanged when off |
| C | Crouch/kneel/pick-up clips (G4) in Blender + hooks | Contact sheets from 3 angles; story autopilot both stories |
| D | Weather moments + stamp card (ideas 5, 6) | Rules tests; i18n ×3 |
| E | Videos (G5), archery hands and camera (G6), haptics (idea 7) | Video size budget test; phone archery shots |

## 5. Refinement (what changed after a second look)

- **G1: silhouette, not fading the props.** Props are merged and batched per map square (cell grid), so fading one
  well would mean un-merging it. A silhouette costs one extra draw per Mika mesh (1–2 on phones, merged), needs no
  change to the world, and shows her through anything: props, trees, hills and people.
  Two traps found and designed out: (a) drawn after her, the silhouette shows her far arm through her own body,
  so it is drawn *before* her (render order) and she covers it; (b) grass blades at her feet would count as cover,
  so the grass draws after her. It is opaque with a checker pattern (no sorted transparent pass), casts no shadow,
  and is off in cutscenes.
- **G2: inside the existing profile box**, reusing "Back", "Delete" and "New Game"; only one new string ("Start over").
- **G3: CSS only, one line, ellipsis**; no text under 11 px.
- **Cut from this pass:** photo mode and the clips (each is a pass of its own, with art), videos (30 min of recording
  for a menu item), colour grading changes (the look is already vivid; changing it without the owner's eye is a risk).

## 6. Done in this pass (phase A)

- astra's branches merged (`647e532`, `eaffac4`).
- `src/actors/silhouette.js` (+ `tests/silhouette.test.mjs`), hooked in `actors/player.js`, switched by
  `actors/camera.js`, grass order in `world/grass.js`.
- `confirmIn()` in `ui/ui.js` replaces all three `confirm()` calls; styles in `ui/style.css`; "Start over" in vi/ko/ja.
- Phone chapter line one line (`ui/style.css`).
- Follow camera: no per-frame allocations.
- `docs/STORY.md` regenerated (`npm run story:md`).

## 7. Done: phase B, photo mode

Built by a workflow: three code readers, two competing designs (player-first, risk-first), a judge that merged them,
one builder, four reviewers (state and hand-back, phone UX, capture and storage, code quality), two independent
skeptics per finding, and a fixer. 33 findings, 28 confirmed and fixed (among them: a gamepad entry that closed at
once, a photo lost when leaving right after the shutter, Postcard holes in the saved file, bloom and sprites shrinking
in the larger shot, the portrait tray hiding Mika, Enter on a focused button taking a photo).

- Pure rules and tables: `src/game/photo.js` (tests: `tests/photo.test.mjs`).
- The mode itself, fetched on first use: `src/game/photo-mode.js`; UI `src/ui/photo-ui.js`; frames
  `src/ui/photo-frame.js`; album section `src/ui/photo-album.js`; filters `src/engine/photo-pass.js` (after the
  output pass, off unless a filter is chosen).
- Hooks: V / R3 in `engine/input.js`; `openPhoto()` and one per-frame check in `game/game.js`; `Renderer.shoot()`
  (one larger frame for the shutter, restored in `finally`); the pause-menu button, album, credits and controls rows
  in `ui/ui.js`; `clearShots()` in `game/saves.js` (New game and Delete clear the photos, Explore "Start over" keeps
  them); `Tamo.glowFor()` split out of `Tamo.update()` so a joined Tamo is lit right while the world is paused.
- Storage: `starline-shots-<slot>`, 12 thumbnails (JPEG, about 40-90 kB each); the full picture is saved or shared
  from the card, never kept in localStorage.
- Checks: `npm test` (1,052), i18n 5,002 × 3, `tests/photo-mode-browser.mjs` (121 checks over 390×844, 844×390,
  1280×720 and vi/ko/ja), the Grandma story autopilot.
- Known: a real gamepad and iPhone safe areas were not tried on hardware; Tamo very close to the camera at golden
  hour reads as a soft glow rather than a crisp star.

## 8. Done: phases C and E (`8baa2c6`)

Two corrections to §1 first. **G4** was mostly done before this plan: Codex added the ground clips (Crouch, CrouchWalk,
CrouchReach, Kneel, Pickup, SitGrass) and `actors/ground-pose-system.js` in October; low pickups, petting and the bug,
dew, firefly and frog games already used them. **G5** was done too: the clips were re-recorded on 2026-10-12 (`e23aec5`)
in the Grandma story with electric bulbs, and every look change since then was a pixel-identical speed pass. Both rows
came from the old issue list, not from playing.

- **C, the last standing gestures at ground level**: the roast pit (bury, turn, dig out: she turns to the hollow and
  crouches), Grandma's note in the firefly game (she bends for it before the words start) and the music box (she kneels
  by it). Releasing bugs from the cage keeps its gesture: the cage stands 1.8 m to her side, so a crouch would reach at
  empty grass. Planting the acorn keeps it too: the spot is 2 m away and the tree grows there.
- **E, haptics**: `engine/haptics.js`, called by the sound cues in `engine/audio.js` (hard landings, splashes,
  pickups, successes, stars, lamps, fanfares; each kind throttled). A gamepad rumbles; a phone with a coarse pointer
  buzzes; iPhones have no vibration API. Settings > Vibration (on by default). `tests/haptics.test.mjs`.
- **E, archery on an upright phone**: from behind, her big head hid the bow (it sits on the aim line just in front of
  her face). `CAM_TALL` now stands close at about 30 degrees, as on a desktop, and looks at a near point of the line;
  checked at 390x844 and 360x640 (ready and full draw). The Stop button there is a 48 px square in the free top-left
  corner (on 360x640 it covered her head).
- **Not done: real fingers.** They need finger bones in `mika.glb`, new weights, the light model rebuilt, the Low
  tier's skin merge and her 16 k-triangle budget: a separate art job on the model every other system uses. At play
  distance the camera was the visible defect.

## 9. Done: phase D, weather moments and the daily stamp card

Built by workflows: five code readers and two competing designs (player-first, risk-first) merged into one checked
spec; then two builders in their own worktrees with disjoint files, two reviewers per feature (logic and integration;
player, phone and performance), an independent verifier per review and a fixer. 23 findings, 21 confirmed and fixed
(among them: a lucky stamp from a moment cut short, swallows flying through the hillside, geese behind the HUD, the
evening crows lifting out of view, the stamp card running on the scene tour's borrowed quest, a find picked up in the
middle of the Fire drill, a merged bug net that blinked).

- **Weather moments** (`docs/WEATHER-MOMENTS.md`): about once every 3-4 minutes of free roaming by day, a breeze of
  petals, leaves or snow, geese (autumn, winter) or swallows (spring, summer), a sun shower with a rainbow away from the
  sun, diamond dust on winter mornings, and the evening bell at 17:00 with the crows going home. Pure rules
  `game/moments-rules.js`, lazy runtime `game/moments.js`, look `fx/moment-fx.js` (a second Rainbow and Butterflies:
  no new shader programs, lights or shadows, at most 2 extra draws). Settings > "Weather moments" (on by default);
  off under `?qa` unless `?moments=on`. Everything in the sky sits in the thin band a phone actually sees under the HUD
  (1.5-3.5 degrees above the eye line, not the spec's 3-8).
- **Daily stamp card** (`docs/STAMPS.md`, Explore only): three small jobs a day from the neighbours (deliver a parcel
  door to door, find a lost thing, play a mini game), a lucky stamp for seeing a weather moment, decorations for
  Grandma's cottage at 2, 4, 8 … 32 stamps. New card at 04:00 local time; no streaks, no penalties. Pure rules
  `game/stamps-rules.js`, save shape `game/stamps-save.js` (additive, old saves get an empty card), tables
  `content/stamps.js`, runtime `game/stamps.js`, card `ui/stamps-ui.js` at the top of the journal's Neighbours tab.
  Gift sparkles now show indoors too (`celebrate.indoorSprites`: they were hidden with the valley before).
- Checks: `npm test` (1,082), i18n 5,072 x 3, `tests/moments-browser.mjs`, `tests/stamps-browser.mjs`, a joint
  check (a sun shower lands the lucky stamp once, card in Vietnamese), `tests/explore-save-browser.mjs` (updated: it
  still expected the browser's own confirm popup that pass A replaced). Code chunks: moments 11.6 kB, stamps 8.0 kB gzip.
- Known: the moments' own per-frame cost at 8x CPU measured in-game is 45-85 us idle and 160-440 us in a shower (the
  spec hoped for 20 / 150; its own work, warm, is far under); geese are small on a portrait phone; the new sounds
  (drips, honks, crows) were only checked by call counts, never listened to; nothing was tried on a real phone.
