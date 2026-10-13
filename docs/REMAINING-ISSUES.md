# Starline: remaining issues and next tasks

Status: **handover for Codex**, written 2026-10-12 against live commit `d6e5c06`
(https://buicongnguyen.github.io/3D_game_scene/). This is the original handover; see
**[Codex verification and implementation](CODEX-VERIFICATION.md)** for completed work, test evidence and owner decisions.
The first two P1 items, the hard electric-lamp prompt, lantern update order and sack-race rules have since been fixed.
Items are ordered by priority:
**P1** = player-visible defect or promised feature, **P2** = quality / consistency, **P3** = cleanup, **D** = needs a product
decision from the owner before coding (do not guess, ask), **X** = work in other repositories.

Read first: `docs/STORY-GRANDMA.md` (§1a "Voice and facts" for all story text), `docs/RURAL-TRICKS.md`, `docs/MINIGAME-MENU.md`,
`docs/VIDEO.md`, `art/CONTRACTS.md` (every model, clip, bone and budget claim), `docs/TOWNLIFE.md`.

---

## 0. How to work in this repo (read before touching anything)

- **Worktree per task.** `git -c safe.directory=* worktree add -b <branch> ../3D_game_scene-<name> origin/main`, then junction
  `node_modules` to the main folder's (Windows: `New-Item -ItemType Junction -Path <wt>\node_modules -Target <main>\node_modules`).
  The main folder `C:\Users\n\source\repos\3D_game_scene` is **behind origin and holds another session's uncommitted copy of
  `src/mobile-game-support.mjs`; never edit, reset or stage there.** Before removing a worktree, delete the `node_modules`
  junction first (`(Get-Item <wt>\node_modules).Delete()`), then `git worktree remove --force`.
- **Git quirks:** always `git -c safe.directory=* …` (the folder is owned by another Windows user). Push with
  `git push origin <branch>:main` from the worktree after `git fetch origin && git rebase origin/main`. A push to `main` deploys
  GitHub Pages (workflow runs `npm ci`, `npm test`, `npm run build`); watch it with `gh run watch -R buicongnguyen/3D_game_scene`
  (plain `gh` inside the folder fails with "dubious ownership": pass `-R`).
- **Line endings:** `core.autocrlf=true`, files are CRLF in the working tree. Use an editor that preserves CRLF. `sed -i` in Git Bash
  strips it. Heredocs with backslashes or apostrophes get mangled: write patch scripts to a file instead.
- **Text and i18n:** all player-visible English text goes through `tx()` / `N_()` (`src/i18n/i18n.js`); the English string is the key.
  After adding strings run `npm run i18n:extract`, then add vi/ko/ja translations to `src/i18n/{vi,ko,ja}.json` (ko uses 1-space
  indent, vi/ja 2) until it reports `N/N translated, 0 placeholder mismatches, 0 stale`. `npm test` fails on missing translations.
  Currently 3641 strings per language. Keep `{placeholders}` and key names (E, Space, Shift, W A S D) unchanged.
- **Tests:** `npm test` (566 tests). Browser suites need a server and `GAME_URL`:
  `NO_HMR=1 node node_modules/vite/bin/vite.js --port <p> --strictPort` (does **not** watch files: restart after edits) and
  `GAME_URL=http://127.0.0.1:<p>/ node tests/e2e/run.mjs --story=grandma --quality=low --out=.tools/e2e-x` (~9.5 min, both
  `--story=grandma` and `--story=classic`; no source edits while it runs). Also `tests/minigame-menu-browser.mjs --all=1`,
  `tests/tour-browser.mjs`, `tests/video-browser.mjs` (needs real Edge/Chrome: Playwright's Chromium has no H.264),
  `tests/workshop-browser.mjs`, `tests/cowrace-browser.mjs`, `tests/skyflight-browser.mjs`.
- **Always test against the production build too:** `node node_modules/vite/bin/vite.js build --outDir .tools/dist-x` and
  `vite preview --outDir .tools/dist-x --port <p>`. A top-level `await` in `main.js` once deadlocked every lazy chunk in the built
  site only; the dev server hid it.
- **Do not edit** `index.html`, `src/main.js`, `src/engine/input.js`, `src/game/game.js` without asking: they belong to another
  session's mobile-input work (build new DOM from JS, as `src/ui/ui.js` `bindTour` does).
- **Ports:** pick your own (5850+); never kill processes by name, only by the exact port's PID (other sessions run servers here).
- **Blender:** headless only. The active installation is now 5.2.2 LTS; see [BLENDER.md](BLENDER.md) for the path and environment setup. Use `& $env:BLENDER_EXE -b --factory-startup --python art/blender/<script>.py -- <args>` in PowerShell. Validate every model with
  `node art/blender/validate_glb.mjs` and `node --test tests/assets.test.mjs tests/pack.test.mjs`. **Model size cap has only ~33 KB
  headroom** (`TOTAL_RAW_BYTES` 39.9 MB, `TOTAL_PACKED_BYTES` 15.38 MB in `tests/asset-contracts.mjs`): raise it with a note in
  `art/CONTRACTS.md` when you add a model or clips.
- **Quality bar for creatures and people:** render contact sheets from several angles and *look at them*; the owner notices odd
  shapes. Check in the game renderer too (bloom threshold ≈ 0.92 luminance: keep albedo ≤ 0.85).
- **Commit trailer:** end commit messages with `Co-Authored-By: <your model> <noreply@…>` as your environment requires.

---

## P1: Mika (and the village kids) cannot crouch, kneel, pick up or sit in the grass

**Request (owner):** "make the avatar bend the body, or sit down to catch or touch something on the grass".
**Today:** Mika/kids have Sit, SitFloor, Pet, Interact, Cast, Stir, Hammer, ride clips (`RideCow*`); nothing near the ground, so
bug catching, dew webs, feeding and pickups are all done standing upright.
**Existing scaffolding:** a stale local worktree `../3D_game_scene-poses` (branch `poses`, at `b5f9095`) exists but holds no work;
branch fresh from `origin/main` instead.

### Part A: art (Blender, `art/blender/player_anims.py`, `npcs.py`, `build_townlife.py`, rig helpers in `animal_kit.py`/`rig.py`)
Add to **both** `public/models/mika.glb` and `public/models/villager-kid.glb` (same clip names, no new nodes or bones so the Low
tier's merged skin in `src/engine/skin-merge.js` is unaffected; 30 fps; root on the ground; feet/hands must not penetrate it):
- `Crouch` (loop 3 s): deep squat, torso leaned ~30°, hands near the knees, head up, gentle breathing.
- `CrouchWalk` (loop 0.9 s, authored 0.6 m/s): low creeping shuffle, hands slightly out front; no foot skating (validator).
- `CrouchReach` (once 0.8 s) and `CrouchReachHold` (loop 1.5 s): right arm extends ~0.5 m forward-down to touch/feed/pat, then returns.
- `Kneel` (loop 3 s): one knee down, leaning in to look closely (webs, beetles).
- `Pickup` (once 1.0 s): bend from the hips, grab with the right hand at ~40% of the clip (document the exact frame in `art/CONTRACTS.md`), rise with the hand to the chest.
- `SitGrass` (loop 4 s): relaxed cross-legged sit, small sway (differ from existing `SitFloor`; check it first).
Mika has **no finger bones**, only `hand_L`, `hand_R`, `grip_R` (mitten + thumb): do not rely on fingers.
**Acceptance:** `validate_glb.mjs` 0 errors/warnings for the new clips (loop seams, foot slide < 1 % leg length), contact sheets for
Mika and one kid from front/side/back at several frames, no clipping through the hip lantern (see below), scarf, satchel or ground,
`tests/asset-contracts.mjs` clip lists and budgets and `art/CONTRACTS.md` updated, asset tests green.

### Part B: game hooks (new `src/actors/pose-ground.js` + tests, surgical edits elsewhere)
A small pure state machine: input = creeping speed, pickup request, touch/feed request, waiting; output = pose with hysteresis and
blend times. Feature-detect (`anim.has('Crouch')`) and fall back to today's behaviour. Wire in:
1. **Hoppers** (`src/game/tricks/hoppers.js`, `bugkit.js`): creep band (< ~1 m/s, already produced by `ctx.beforeMove`) → `Crouch`/`CrouchWalk` (`timeScale = speed/0.6`, clamp); net swing plays over it (if layering is impossible keep the swing as a procedural arm overlay like `src/game/yard/poses.js`); caught bug into the cage → `CrouchReach`.
2. **Cricket** (`tricks/cricket.js`): when "shh" within 2.4 m → crouch/kneel; tickle taps → `CrouchReach`.
3. **Dew webs** (`tricks/dew.js`): `Kneel` when within ~3.5 m of a web on the sun side; the photo = a short kneel hold.
4. **Pickups** (hay, roast straw armfuls, mill cogs, chestnuts; `director.js` collect/pickup code): `Pickup` animation, item attaches at the grab frame. **Game logic stays instant** and the movement lock ≤ 0.6 s so story steps and the autopilot (`tests/e2e/run.mjs` presses E and expects completion) are unaffected.
5. **Feeding/petting low targets** (`src/actors/cow-ride.js` feed, critter "hello" reactions in `director.js`): `CrouchReach` when the target is below knee height.
6. **Waiting/watching** (firefly and frog-chorus waiting phases; stargazing hill outside the sky viewer): `SitGrass` after > 2.5 s idle, stand on move. Do not touch the sky-gaze pose/camera code (`src/game/skygaze.js`).
7. **Camera:** follow target lowers ~0.35 m in crouch so she stays framed; tall-grass tricks keep their tilt.
8. **Lantern:** add the new clips to `HAND_CLIPS` in `src/actors/lantern-carry.js` (lantern goes to the belt); verify the belt hook (`src/actors/lantern-rig.js`) does not clip into the ground/legs in each pose and add a per-pose offset if it does.
**Acceptance:** pure tests for the state machine; Playwright (desktop 1280×720 and phone 390×844, quality low and medium, `?qa=1&mute=1`): creep → crouch → swing → catch, a hay pickup, feeding the cow, sitting at the firefly place; screenshots from front/side/chase camera, day and night, lantern visible; Mini games sweep and both autopilots still pass; production build checked.

---

## P1: Tour and intro videos still show the old (Classic) look

**Problem:** the phone videos in `public/video/` were filmed from the title screen, where the loaded story is Classic at boot, so
they show **flame lamps and Classic captions**, while the default story ("A Year with Grandma") has **electric bulbs**
(`src/world/bulb.js`, `structures.js` `setLampStyle`, set in `director.begin` per story). The live (non-video) tour started from the
title also uses the last-loaded story = Classic at boot (`src/game/tour.js`, `storyId()`).
**Do:**
1. In `scripts/record-videos.mjs` (see `docs/VIDEO.md`), start every tour/intro clip in the **Grandma story with the electric lamp style** (and record Classic variants separately if the size budget allows, else keep Classic intro live on phones). The intro clips are `intro-grandma-*`/`intro-classic-*`.
2. Fix `src/game/tour.js` so a tour started from the title uses the default story's lamp style and text (`defaultStory()` in `src/game/stories/index.js`), not whatever loaded last, and restores correctly on exit.
3. Re-record all clips (≈ 25–30 min, needs headless Blender for H.264; Playwright `page.clock` drives 30 fps; Chromium with `--use-angle=d3d11`), regenerate `public/video/manifest.json`, keep total ≤ ~60 MB (`TOTAL_VIDEO_BYTES` in `tests/asset-contracts.mjs`; currently 56.5 MB, aim lower if possible: 390–500 kbps).
**Acceptance:** extracted frames at the Mill Lamp/Forest Lamp/viaduct stops show bulbs, not flames; `tests/video.test.mjs`, `tests/video-browser.mjs`, `tests/tour-browser.mjs` pass; look at frames from every clip (the earlier job only looked at some).

---

## P1: Archery polish (hands, camera, kids)

The archery game was reworked (`src/actors/archer-rig.js`, `src/game/tricks/archery{,-gear,-guide}.js`, `rules-archery.js`, `src/content/archery.js`).
Remaining:
1. **Fingers:** they are skin-coloured ring meshes on a squashed mitten (no finger bones). Real fingers: add 3 bones per finger + thumb under `hand_L`/`hand_R` in `mika.glb` (`art/blender/player_anims.py`, skin weights, contract names in `art/CONTRACTS.md`), then drive grip/hook/open curl presets in `archer-rig.js` instead of rings. Mind skin-merge on Low and the 16 k-tri budget for Mika.
2. **Phone portrait camera:** in the narrow strip her head hides most of the bow and arrow (`CAM_TALL` in `archery.js`). Try a higher/more lateral camera, a smaller bow offset or a transparent head-dither while aiming; verify at 390×844 and 360×640.
3. **Kids practise at the range** (not done): `ARCHERY.spot` (≈ x −64.4, z 48.7, face −π/2, just behind the lane box) is tested clear. Add `'kawabe.archery'` to `SPOTS` in `src/content/townsfolk.js`, add `{ play: 'archery', at: 'kawabe.archery', t: 40 }`-style plan tasks for one or two Kawabe kids, implement the ambient animation in `src/game/townlife.js` (follow how `footnet`/`marbles` hand off to `d.yard.ambient`; the kids must **never** shoot toward a person: reuse `rules-archery.js` aim limits or just animate a bow-draw pose without projectiles). Keep Town Life LOD rules (sim sleeps when far). `tests/barks.test.mjs` checks spots.
4. **Number planks** in `src/world/archery.js` hard-code 3 targets (192 px, uv/3) and are painted once before the web font may have loaded: derive from the target count and repaint on `document.fonts` ready.
5. **Bonus targets** (swinging lantern, hanging apple) were cut: optional.
6. **Real device checks** not possible in headless: pointer lock (mouse), gamepad (RT draw, A breathe).
**Acceptance:** screenshots of the hands from 3 angles at idle/draw/full draw/release on desktop and phone; `tests/archery.test.mjs` (25 tests) green; both autopilots; production build.

---

## P2: Cow riding and racing: remaining art/UX

- **Kids' legs** look folded or crossed from the front (riders are seated and at the correct height, but the `RideCow*` leg pose on `villager-kid` is awkward). Re-pose in `art/blender/npcs.py`/`player_anims.py`; contact sheets front/side/back on the cow (`art/blender/rider_check.py`).
- **Mount/dismount** uses `Jump`/`Fall` clips, so brief standing frames show in the air (`src/actors/cow-ride.js`). Add seated `RideCowMount`/`RideCowDismount` clips or hide the rider's legs during the hop.
- **Gait:** hooves match `Walk/Trot/Gallop`; the suspension phase of the gallop was never inspected frame by frame: check with a debug camera and adjust `Gallop` in `art/blender/animal_kit.py` if the cow looks like a fast walk.
- **Cow hide brightness:** near-white in direct midday sun (hide is `#efe5cd`, luminance 0.79). Consider ≈ 0.72 or a shade tweak if it still blooms (check at 12:00 and dusk, medium tier).
- **Start gate beam** briefly crosses the chase camera at race start (`src/content/cowtrack.js`/`cowrace.js` camera).
- **Mika's `RideCow*` clips** play at timescale 1; only cows and kids get speed-matched timescale.
- **Gamepad wording** names keyboard/touch only (`src/actors/cow-help.js`).
- **Harrow-sled (Bảy Núi) second mode** was cut (docs/RURAL-TRICKS.md mentions it).
**Acceptance:** `tests/cowrace.test.mjs`, `tests/cowhelp.test.mjs`, `node tests/cowrace-browser.mjs` (all riders seated in every phase, low/medium/high × both stories), screenshots from front/side/podium.

---

## P2: Story and text consistency

1. **Hard-mode lamp prompt** still talks about "spark" even when lamps are electric: `src/game/director.js` ~lines 1422 and 1426 (`'Aim and spark: {what}'` produces "Aim and spark: Fit the new bulb: Mill Lamp", a double colon) and the toast `'Hard mode: hold {aim} to aim, then press {fire} to spark'`. In the Grandma story use bulb wording ("Aim and fit: …" / "…then press {fire} to fit the bulb"; Tamo carries the bulb); Classic keeps "spark". New strings in vi/ko/ja.
2. **Re-check the default story for leftover sad/flame wording** with the facts sheet (`docs/STORY-GRANDMA.md` §1a): a previous pass found none beyond the oil bark (fixed in `src/content/barks.js`), but only the Grandma story's tables were scanned; scan shop lines (e.g. Fujita "my father would haunt me" is kept as a joke), chapter names "The Last Train of Winter"/"Keep Watch", and Tamo's lines after the finale. Granny Tsuru is **no longer a widow** in the Grandma story (Isamu is away building boats): see decision D3.
3. **Tour captions** that mention lamps ("shines"): `src/content/tour.js` (one caption was changed from "burns" to "shines"); re-read all captions after re-recording videos.

---

## P2: Sky, stars and the fly-up view

(`src/game/skygaze.js`, `skystars.js`, `skyflight.js`, `src/content/constellations.js`, `skyspots.js`, `horizon.js`, `src/ui/stargroups.js`.)
- **Fly-up altitude:** 120–140 m per spot because the valley rim stands 25–55° above the floor. The exit descent from the top is ~100 m/s peak (2.4 s): smooth but very fast: consider a ≈ 3.5 s exit.
- **Phone portrait:** the clock chip is left-aligned (not top-centre) because the HUD buttons sit there; the "Antares, the red heart" label clips at the right edge.
- **Rain:** the rain case could not be tested (weather override); it looks like night.
- **Not covered by browser runs:** full 12-case matrix ran on desktop-low only; greyed "Get the Star Kite first" button on phone; blocked-path message; motors-fitted line; gamepad D-pad/Y.
- **Taps:** a tap anywhere (including the next-group arrow) while a star falls counts as a wish; `pad()` allocates an array per frame while groups are shown.
- **Quiz mode** (optional, never built): "Which one is the Big Dipper?".
- **Journal:** the star-group list sits under the Fallen Stars tab because `index.html` was off limits; a real tab needs an `index.html` edit (ask).
- **`tests/skyflight-browser.mjs` day case is flaky:** "scene 7117 → 7122" (+5 objects, 1 texture) fails about 1 run in 2 because ambient daytime critters stream in at a random moment. Make the assertion tolerant (compare only the sky-owned groups/names, or wait for streaming to settle).
- **Vietnamese star text** was authored by AI from vi.wikipedia and a few news sources; see the `sourceOfVn` comment in `src/content/constellations.js` for which names are verified. "sao Cày" = Orion's belt and folk names for Scorpius/Leo/Cygnus/"Bánh lái lớn" are unverified and not shown: ask a native speaker before adding them.

---

## P2: Fishing

- Fish are small on screen at the fishing camera; trout look greenish through water (dark green back). Consider a larger fish scale in the clear patch or brighter instance colour (`src/game/fishing/pond.js`, patch alpha in `src/world/water.js`; the default river must stay pixel-identical with the patch off: `.tools/fishing-ab.mjs` method in `docs/MINIGAMES.md` §3.8).
- Camera is chosen once per session: rotating a phone mid-cast keeps the landscape view (`fishingShot` in `pond.js`).
- Camera cuts (not eases) back to the follow camera on leaving; Esc leaves fishing **and** opens the pause menu.
- Objective text says "from the dock" though fish caught at the mill count (`src/game/story.js` / `stories/grandma.js` step c1.fish).
- No mystery shadow/bait/shop; no fishing icon on the in-game map (`src/ui/map.js`).
- Gamepad hold-to-reel is implemented but untested.

---

## P2: Yards and games

- **D1 (decision):** Takamori volleyball practice: when no kid is visible `volley.teams` returns `wall: true` and the ball bounces at stage `v = -9.1` (≈ z −11.9) where nothing stands; the HUD says "Kick-board". Either build a practice board at a spot that does not block the south gate, or give Mika a "kid called over" fallback like Kawabe. (`src/game/yard/volley.js`, `src/content/yard.js`.)
- **D2 (decision):** Sack race stars: finishing alone = 3 stars, losing to the only kid = 2 stars (`SackSim.result()` in `src/game/yard/sack.js`).
- Marbles aim by tapping a marble or arrow keys (no drag-back slingshot); tug of war has only 3 village kids so it is Mika + one vs two; mashing wins ~70 % on Easy (tune `rules.js`/`tug.js`).
- Kids' arm/leg poses for volley set/spike are bone bends after the mixer and were not inspected closely (`src/game/yard/poses.js`).
- Mika stays where a stage game leaves her (end of the sack course, board edge); a kid asked to watch walks to the bench on foot.
- Scoreboard text does not re-translate on a language switch until the next event.
- Kids leaving the court use gate waypoints; recheck for fence cut-through at Takamori.
- Real-device pointer/gamepad checks not possible in headless.

---

## P3: Engine, code and test hygiene

- **Lantern update order:** `lanternSystem` is pushed from `Director.registerStatic` before `main.js` pushes the director (`game.systems = [lantern, director]`), so the carry state reads one-frame-old data. Fix by moving the lantern update after the director's (needs a small `Director.update` restructure or `game.js`/`main.js`: ask).
- `main.js:95` exposes `window.__STARLINE__` (whole game object) in production, not only with `?qa=1` (ask before editing `main.js`).
- Build: main chunk 1.94 MB; warnings that `minigames-ui.js` and `content/minigames.js` are imported both statically (`minigame-menu.js`) and dynamically (`ui.js`), so the dynamic import splits nothing. Pick one.
- `src/game/governor.js`: `ceiling` only rises, so one failed climb within 30 s caps quality for the whole session across scenes (design choice; revisit).
- `src/actors/critters.js`: pool sizes for Low are read once at plan time (a runtime quality change needs a reload, as the Settings text says).
- `Tricks.dropMoveHooks` drops the original hook if something chains `beforeUpdate` after the trick's; Mini games `canOpen` does not check `kite.active` during the "arrive" state.
- `art/blender/validate_glb.mjs` flags `mika` and `villager-kid` (6–10 ERR by default: one-shot clips seen as loop seams, coplanar skin/iris overlaps handled at runtime by `src/engine/coplanar.js`): teach the validator the one-shot/coplanar exceptions.
- Model library headroom is only ~33 KB under `TOTAL_RAW_BYTES`.
- `docs/RURAL-TRICKS.md` phases 3–4 not built (tadpole jar, crab on a string, weather signs, skipping stones, grass whistle/leaf boats); `docs/FARMING-PLAN.md` and `docs/MINIGAMES.md` farming phase 1 not started.
- Title menu with a save on very small landscape phones (667×375, 568×320) scrolls by ~10 px (`src/ui/style.css`, "The title menu always fits the screen").
- **iPhone/Safari:** inline video autoplay (Low Power Mode), `AbortError` from `play()` after a quick pause (guarded defensively in `tour.js` but untested on WebKit), and real-phone performance were never verified: only Chromium emulation on a desktop GPU.

---

## D: Product decisions for the owner (ask, then implement)

- **D3: Granny Tsuru** is a widow with a shrine in Classic; in the default story her husband Isamu is alive and away building boats (variants in `src/content/townsfolk.js` `roleGrandma`, `convos.js` `-g`, `hotspots.js` altar). Keep or restore the gentle remembrance?
- **D4: Mill electricity wording:** the default story says the mill wheel/dynamo makes the electricity that lights the lamp towers (Tamo carries bulbs, no longer sparks the Star Lamps). Keep, or return to star-lit lamps?
- **D5: Tour from the pause menu** shows the *after-the-story* valley (all lamps lit, viaduct repaired) even to a chapter-1 player (a mild spoiler): show the current save's state instead?
- **D6: Yard camera:** default is behind-the-court; a side-on option exists. Make side-on the default on wide screens?
- **D7: Video size:** 56.5 MB (wide + tall cuts at 540p, ~500 kbps) is over the original 45 MB aim; drop one orientation or lower the bitrate?
- **D8: Setting:** keep the Japanese-style valley (current plan) or build a Vietnamese-village variant (new names, houses, voice) as a separate project?
- **D9: Playground difficulty** (Normal): tune `STYLES.*.miss/flat` in `src/game/yard/rules.js` for foot-tennis/volley so careful players win ~60–70 %.

---

## X: Other repositories: the slow touch helper (do not do this casually)

**Problem:** `src/mobile-game-support.mjs` (a helper copied into ~24 game repos) re-measured touch controls with `getComputedStyle` on
**every class/hidden mutation**; a HUD that re-applies classes each frame made it force **four layouts per frame on touch devices**
(Starline fell 30 → 25 fps on a phone). Fixed in Starline (`ced8e3b`: observer reacts only when the attribute really changed on a
control or ancestor; `1a63aec`: `controls: []` in `src/mobile-game-init.mjs` because the stylesheet already insets with `env(safe-area-inset-*)`).
**Still slow on `origin/main` of 22 repos** (blob `c1d6b499` identical copy): `3D_claudeopus55`, `3D_game_action` (path `game/src/`), `3D_game_fighting` (KITEFALL, no auto deploy), `3d_farmer_fish_sell`, `Attack_terrorist_3D`, `Choice_of_life` (`game/src/`), `Choice_of_life_3D`, `Classic_Picnic`, `Little_Keepsakes`, `Olympic_game` (no auto deploy), `Piano_tutor`, `Tank_game_3D`, `WorldClaw`, `game_RPG` (no auto deploy), `hello_algo_claude_3D`, `picnic_game`, `pixel-life-journey-v3`, `race3D_game`, `sidewalk-iced-tea` (`client/`), `world_of_toy`, `world_of_toy_claude`; plus **`cute_game`** (Zoo Garden: own variant `18bf0b43` and `tests/mobile-game-support.test.mjs`, patch and test separately).
**Fixed file:** `src/mobile-game-support.mjs` from this repo (`2d12ed5c`). **Script:** `docs/remaining/apply-mgs-fix.sh` (Git Bash; dry run by default, `--push` to apply; uses a temporary worktree per repo from `origin/main`, skips any repo whose helper is not the known slow blob, never force-pushes). A previous attempt by Claude to push to those repos was **blocked by the permission system**: the owner must run it (or grant permission) deliberately.
For each repo afterwards consider the second pass (`controls: []`) only if that game's stylesheet already insets its touch buttons; run each game's tests; three repos have no auto deploy and need their own deploy step; other sessions are active in many of these repos (fetch/rebase, never overwrite their uncommitted work).

---

## Translations: review needed by native speakers

All 3641 strings per language were produced by AI and have **not** been read by native speakers. Highest risk: Vietnamese
(star group names/stories for the Vietnam sky, the folk-game notes for đá cầu, kéo co, ô ăn quan, đua bao bố, bắn bi, the cow-race
note about An Giang, "cái điện điếc" and other jokes), Korean (족구/제기차기 names, 연 공방), Japanese (あしテニス, 星だこ, やきいも
captions). Keep key names and `{placeholders}` intact when editing the packs.
