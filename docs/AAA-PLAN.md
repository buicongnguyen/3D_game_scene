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
