# Opening train scene lags on the phone: fix plan

Written 2026-11-21 for the agents that will do the work (Sonnet 5.5 for the mechanical tasks, Opus 5.5 for the ones
marked **Opus**). Read `docs/PHONE-SPEED-PLAN.md` first: it covers general play; this file covers only the opening
(`Scenes.arrival()` in `src/game/scenes.js`, the train "Kobo" running from the west tunnel into the station).

## 1. What the opening does today

There are two versions of the same 26-second scene:

| Version | When | Code |
|---|---|---|
| **Recorded clip** (H.264, 30 fps, 540×960 or 960×540, about 520 kbit/s, 1.7 MB) | Low tier, clip can start within 7 s, tropical trees off, no `?live` | `playArrival()` in `src/game/video.js`, files in `public/video/intro-*` |
| **Live cutscene** (the valley drawn in real time, wide camera flight) | every other case, including every fallback | `Scenes.arrival()` below the clip branch |

A phone gets the Low tier only when `isMobile()` (`src/engine/renderer.js:32`) says so **and** no other tier was saved
in Settings (`starline-quality`).

## 2. What was measured (live site `00b712f`, phone screen 390×844, CPU slowed 4×, machine under load)

| Case | Frame gaps | Long main-thread stalls | Draws per frame |
|---|---|---|---|
| Low tier, recorded clip | steady 17 ms; 1 of 789 video frames dropped | none | 0 (valley not drawn under the clip) |
| Low tier, live (`?live=1`) | median 17 ms, worst 184 ms | 1 (190 ms) | 98–170 |
| High tier, live, run 1 | median 33 ms, worst 234 ms | 17 stalls, 1.2 s in total | 272–316 |
| High tier, live, run 2 | median 33 ms, p99 417 ms, worst 634 ms | 113 stalls, 17.4 s in total | 272–316 |

So the clip path itself is smooth in the test, and the live path is where real lag appears. **Which path the owner's
phone takes is not known.** The lag there has one of these causes:

| # | Cause | How it shows |
|---|---|---|
| C1 | The phone runs the **live** cutscene: a tier other than Low is saved, tropical trees are on, the clip did not start within 7 s (slow network: 1.7 MB), or the browser cannot play the clip | real frame drops and stalls for the whole ride |
| C2 | The clip plays, but **30 fps at 520 kbit/s** makes a train crossing the screen look choppy and smeared | even judder, no stalls |
| C3 | The clip plays, but the page is still busy **loading the valley** under it (shader warm-up, model parsing), so the picture hitches | hitches mostly in the first seconds |
| C4 | The hand-over at the end (clip → live platform view): first live frames compile and upload | one hitch at the end, when Mika appears |

## 3. Tasks

Do them in order. Each task is one commit on a branch off `main`; follow the rules in §4.

### T0. Find out which path the phone takes (Sonnet)
- Add the opening's facts to "Copy performance report" (`src/ui/` perf report; see `tests/perf-report-browser.mjs`):
  tier, `isMobile()`, saved quality, tropical trees, the arrival's mode (`clip` / `live` and, for live, why:
  `tier`, `trees`, `no-manifest`, `cannot-play`, `timeout`, `live-param`), time until the clip's first frame,
  dropped/total video frames, the worst frame gap and count of gaps over 50 ms during the scene.
- Store the last arrival's facts on `game.arrivalReport` in `playArrival()` and `Scenes.arrival()`; expose it under
  `?qa` as `qa.arrival()`.
- Done when: `tests/perf-report-browser.mjs` shows the new lines for both modes. **Then ask the owner to play a new
  game on the phone and paste the report.** Tasks T1–T4 do not wait for it; T5 does.

### T1. Never fall back to the live cutscene by accident (Sonnet)
- Start fetching the clip as soon as "New Game" is chosen (title → slot picker), not when the scene starts:
  `clipFor('intro-<story>')` then `fetch(url)` into the HTTP cache (or `<link rel="preload" as="video">`), so the 7 s
  start timeout is not spent on the network. Do not download it for "Continue" or Explore.
- Raise the start timeout from 7 s to 12 s while the screen is already dark and the loading text is shown; show
  "Loading the opening…" (new string, vi/ko/ja) after 2 s.
- Add the intro clips for the current story to the service worker's on-demand cache (`public/sw.js`): cache on first
  fetch, not in the precache list.
- Done when: a browser check with a 3G-slow network profile (CDP `Network.emulateNetworkConditions`, 400 kbit/s) still
  plays the clip.

### T2. A smoother, cleaner clip (Opus: needs the recorder, Blender encode and a visual check)
- Re-record `intro-grandma-*` and `intro-classic-*` with `scripts/record-videos.mjs` at **60 fps** for the intro only
  (the recorder runs on a virtual clock, so 60 fps is exact; tours and the title stay at 30) and about **1,100 kbit/s**
  (2 passes of look: compare frames 200, 400, 600 against the 30 fps clip). Keep H.264 High, level ≤ 4.0, GOP 60.
- Expected size about 3.6 MB per clip; only one clip is downloaded per player. `tests/video.test.mjs` holds the size
  budget: raise it for the intro clips only and say so in the test.
- Keep the 30 fps files as `intro-*-30` and choose them when `navigator.connection?.saveData` is on or
  `effectiveType` is `2g`/`3g`.
- Recording needs a built preview and the Edge channel (Playwright's Chromium has no H.264); see `docs/VIDEO.md`.
- Done when: the manifest has the 60 fps entries, `tests/video-browser.mjs` passes, and a side-by-side screenshot
  sheet of the three frames is attached to the commit message's notes.

### T3. Nothing heavy runs under the clip (Opus)
- In `playArrival()` the valley is drawn for the clip's first second as a warm-up, then `renderer.hold = true`. Move
  the warm-up **before** the clip's first frame (behind the dark screen) and keep `hold` on for the whole clip.
- While the clip plays, skip per-frame work that nobody sees: `Director.update` town life, animals, grass and foliage
  wind, railway update. Add one flag (`game.clipPlaying`) checked at the top of those updates; the story queue and
  captions keep running.
- Make sure no model parsing or shader compile is scheduled during the clip: defer `interior` fetches and
  `Renderer.warm` leftovers until after the hand-over, or finish them before the clip starts.
- Done when: a CPU profile of the clip seconds (`tests/perf/frame-profile.mjs` pattern, 8×) shows under 2 ms of
  script per frame and no long task.

### T4. A clean hand-over at the end (Opus)
- Before the clip's last second, with `hold` still on, render the platform view once to an off-screen target
  (`renderer.compileAsync` for the platform's camera, then one hidden frame) so the first visible live frame has its
  programs and textures.
- Dissolve from the clip's last picture over 400 ms only after two live frames came in under 50 ms.
- Done when: the worst frame gap in the 2 s after the clip ends is under 100 ms at 8× CPU (it is checked by a new
  assertion in `tests/video-browser.mjs`).

### T5. Phones that still take the live path (Opus; only after the owner's report from T0)
Choose by the report's reason:
- **Saved tier is Medium/High on a phone:** play the clip on every tier when `isMobile()` is true (change the
  condition in `Scenes.arrival()` from "Low tier" to "Low tier or mobile").
- **Tropical trees on:** record a tropical variant of the intro, or accept the original valley's clip for the opening
  only (owner decides: the trees then change when play starts).
- **Clip cannot play:** make the live cutscene cheap instead:
  - start it at governor floor 4 (today 2) and keep shadows frozen after the first frame (`shadows: false`);
  - hide people, animals, festival lanterns and grass for the two wide shots (they are specks at that distance);
  - shorten the wide flight: cut straight to the tracking shot beside the train;
  - target: under 110 draws a frame and no stall over 100 ms at 8× CPU on Low.

### T6. Lock it in (Sonnet)
- New suite `tests/arrival-browser.mjs`: phone screen, Low tier, built preview, Edge channel; asserts mode `clip`,
  dropped video frames under 2 %, no long task over 100 ms during the scene, hand-over gap under 100 ms; a second pass
  with `?live=1` asserts the T5 targets if T5's cheap live path was built.
- Add it to the list in `docs/VIDEO.md` and to the release checklist.

## 4. Rules for the agents

- Work in the worktree `C:\Users\n\source\repos\3D_game_scene-cr` (branch `codex-review`) or a new worktree off it;
  every git command needs `-c safe.directory=*`; never `git stash`; a push to `main` deploys the live site, so push
  only when the owner says so.
- Scratch files only in the worktree's ignored `.tools/`; stop only your own servers, by the PID on your port.
- The dev server hides build-only problems and has no H.264: check videos against `npm run build` + `vite preview`
  with `channel: 'msedge'`.
- English strings are keys: add vi, ko and ja for every new string, then `npm run i18n:extract`; `npm test` must pass.
- Measure before and after on a quiet machine; never run two browser suites against one server at once.
- Report what was not checked. The owner's real phone is the final judge: after T1–T4 ask for a new report.

## 5. What success looks like

| Measure (phone screen, Low, 8× CPU) | Now | Target |
|---|---|---|
| Opening takes the clip on the owner's phone | unknown | yes |
| Clip frame rate | 30 fps | 60 fps |
| Dropped video frames | 1 of 789 in the test | under 2 % on the phone |
| Stalls over 100 ms during the scene | 0 (clip) / 1–113 (live) | 0 |
| Worst gap at the hand-over | not measured | under 100 ms |

## 6. Status (2026-11-21)

| Task | State |
|---|---|
| T0 report | Done: "opening:" line + phone / saved tier / tropical trees in Settings > Copy performance report; `qa.arrival()` |
| T1 never fall back by accident | Done: clip fetched when New Game is chosen; the service worker keeps that one download; start timeout 12 s with a "Loading the opening…" note |
| T2 smoother clip | Done: intro clips at 60 fps, ~1,000 kbit/s, 3.3 MB each (level 3.2); video total 57.6 MB of 60. Not done: separate 30 fps files for Data Saver (the clip is fetched during the valley's 27 MB load anyway) |
| T3 nothing under the clip | Done: platform drawn once behind the dark screen; `game.clipPlaying` skips all valley updates and drawing |
| T4 clean hand-over | Done: dissolve after two frames under 50 ms (max 1.5 s) |
| T5 phones on the live path | Waiting for the owner's report from a real phone |
| T6 lock it in | Done: `tests/arrival-browser.mjs` |

Measured on the built site, phone screen, Low tier (CPU 1× / 4×): the clip starts 316 / 607 ms after the screen goes
dark, 0 draws under it, worst frame gap 33 / 67 ms, hand-over worst gap 17 / 33 ms, dropped video frames under 1 %,
the clip's bytes downloaded once.
