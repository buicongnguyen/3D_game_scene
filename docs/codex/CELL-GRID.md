# Codex task: draw the valley by cells (spatial grid)

Owner request, 2026-10-25: make the game smoother on phones without lowering quality. This card is the whole task;
read it to the end before starting. Report back by filling in the **Log** at the bottom.

## Why

Measured on the phone tier (390x844, Low) with the CPU slowed 4x and 8x (the owner's phone is about 8x slower than
the development PC), at Kawabe in Explore:

| | Value |
|---|---|
| JS per frame at 4x | ~11 ms (budget 16.7) |
| JS per frame at 8x | ~25–28 ms (paced to an even 30 fps by `src/engine/pacer.js`) |
| Draw calls | ~140–200 (view + shadow + post) |
| Objects in the scene | ~6,500, of which ~1,800 visible |
| Biggest costs at 8x | native per-draw cost ~12 ms; `projectObject` (three.js frustum walk) ~2.7 ms; `updateWorldMatrices` (`src/engine/matrices.js`) ~2.6 ms; the shadow pass walks the scene again |

Triangles and the ground are cheap. The cost is **how many objects three.js walks and tests every frame, twice (view
and shadow map)**, and how many draws they make. Today every building, prop and decoration is its own child of
`structures.group` and is distance-culled one by one (`Structures.cull`, every 0.3 s, `src/world/structures.js`).

## Goal

Put the static world into a grid of cells, one `THREE.Group` per cell. Each frame (or every 0.3 s as now) decide which
cells are near and in view, and hide whole far cells. three.js then skips everything inside a hidden cell without
testing it, and the matrix pass skips hidden subtrees already (`visit` returns on `visible === false`).

Same picture, fewer objects walked, fewer draws.

## Rules

- Work in a **git worktree** of this repository (for example `git worktree add ../3D_game_scene-cells origin/main`).
  Never edit the folder `C:\Users\n\source\repos\3D_game_scene` itself: it holds another session's uncommitted work.
- Run git with `-c safe.directory=*` on this machine. Fetch and merge `origin/main` before pushing; Claude also
  pushes here.
- Keep each file's line endings (most `src/` files are CRLF in the working copy). Do not rewrite whole files.
- **No visible change.** Every shot taken at the same spot before and after must match (see Verify). If a change
  shows, find out why; don't accept it.
- Keep a switch to the old path: `?cells=off`, like `?merge=off`, `?zones=off` and `?pace=off`.
- Stop dev and preview servers by their exact port or PID, never by process name: other sessions run Vite too.
  Use ports 5897/5898 or any free port above 5900; avoid 4173.
- Real build: `npm run build` (packs the models and stamps the service worker); plain `vite build` ships unpacked
  models. Profile on an unminified build (see Measure).
- Commit messages end with your own attribution line. One commit per step that works.

## Design

`src/world/cells.js` (new; keep the pure part testable in Node):

- `CELL = 64` metres. The grid is **centred on the villages**, not aligned at 0: use
  `i = Math.floor(x / CELL + 0.5)` so Kawabe (−26, 20) and Takamori (110, −16) don't straddle four cells.
- `class CellGrid { constructor(parent, cell = CELL) }` creates groups lazily, named `cell:i,j`, children of
  `parent`, at the origin with identity transforms (so moving an object into a cell changes nothing in world space).
- `add(obj, x, z, kind)`: reparent `obj` into the cell of (x, z). `kind` is `'building' | 'prop' | 'mid'`, the same
  three distances `Structures.cull` uses today (`q.buildDist`, `q.propDist`, `q.midDist`). A cell keeps the
  largest distance among its kinds per kind list (a cell can hold a building and props; see "Mixed cells").
- `update(ref, camera, q)`: a cell is shown when its nearest point is within its distance of `ref` (with the same
  hysteresis as today: `back(d) = min(d − 12, d × 0.94)` to hide, full `d` to show) **and** its box intersects the
  camera frustum (pad the box by 30 m upward for tall things such as the bell tower and lamp towers). Cheap: ~40
  cells, a box test each.
- **Mixed cells**: props vanish sooner than buildings. Give each cell two child groups, `buildings` and `props`
  (and `mid` for the landslide trees, see `structures.js` ~line 178), each with its own distance. Then a far cell
  can show its buildings and hide its props, as now.
- `ref`: the same rule as `Structures.cull`: the player's position while the follow camera orbits near her
  (`world.focus` within 15 m of the camera), else the camera itself (cut-scenes, tours, wide shots).

Wiring:

1. `Structures`: in `place()`, `placeDocks()`, `placeStones()`, `placeDressing()` and `placeLandslide()`, add each
   object to the grid instead of `this.group.add(...)`. Every object that is pushed to `cullList` today goes into a
   cell of its kind; objects with `noCull` (the lamps placed with `noCull: true`, the bell tower) go into a cell group
   that is never distance-culled (frustum only), or stay directly under `structures.group`. `byId`, `nodes`,
   `lamps`, `solids` and colliders stay as they are: only the parent changes.
2. `Structures.cull()`: replace the per-object loop with `cells.update(...)`. Keep `signs.cull` and the
   `propShadowsOff` step.
3. `batchCopies` (`src/world/static-batch.js`): it batches copies per 48 m cell. Make it use the same grid (64 m,
   centred) and put each batch into its cell's group, so batches hide with their cell. Fences, the viaduct spans and
   abutments use it.
4. `YardBuild` (`src/world/yard.js`) and `ArcheryBuild` (`src/world/archery.js`) push their whole group to
   `cullList` as a prop: add the group to the cell of its middle instead.
5. Name boards (`src/world/signs.js`, `Signs.cull`) and the trick signposts (`Tricks.batchSigns` in
   `src/game/tricks.js`: one instanced mesh for all 35 posts) stay as they are.
6. Play zones (`src/world/zone-build.js`): `pruneOutside` removes children of `structures.group` that are wholly
   outside the zone. With cells, prune whole cells and the objects inside cells that straddle the zone edge (walk
   one level deeper). `tests/zone-browser.mjs` must still pass with no placeholder inside a zone.
7. Optional, only after 1–6 pass and are measured: put the wildlife (`src/actors/animals.js`) and the Town Life
   people under cells by their **home** spot, hiding whole far cells. They move, so this must not break walking
   between cells (re-parent when one crosses a cell edge, at most a few per frame). Skip if it gets risky.

Things that set `visible` on objects in `structures.group` themselves (they keep working because the cell is a
separate parent): the interiors hide their house while Mika is inside (`src/world/interiors.js`), the scene tour,
focus mode (`src/engine/focus.js` hides objects for its still picture), the drawbridge, the gate, the viaduct
repair. Check each one still behaves: a hidden cell must not stop focus mode or the tour from showing what they
need. Focus mode renders the valley once from the round's camera: call `cells.update` for that camera before it
takes its picture, or the far cells of a wide shot will be missing.

## Measure (before you start, after each step)

```bash
npm run build && npx vite preview --port 5897 --strictPort --host 127.0.0.1      # production build
GAME_URL=http://127.0.0.1:5897/ node tests/perf/draw-calls.mjs                   # draws per pass / group / object, Low and High
npx vite build --minify false --outDir .tools/dist-prof && node scripts/pack-models.mjs .tools/dist-prof/models
npx vite preview --outDir .tools/dist-prof --port 5898 --strictPort --host 127.0.0.1
GAME_URL=http://127.0.0.1:5898/ node tests/perf/frame-profile.mjs --cpu=4 --secs=8   # and --cpu=8; --spot=takamori|station
```

Also count the visible objects at the three spots (traverse `window.__STARLINE__.scene`, honouring `visible`) and
write all numbers into the Log. Run each timing twice: the machine is shared and single runs vary.

## Verify

1. **Pictures.** Write `tests/perf/spot-shots.mjs`: Explore (`?qa=1&quality=high&start=explore&slot=explore`) at
   Kawabe (−36, 30 facing −50, 40), Takamori (104, −4 facing 120, 14), the station (−98, 104 facing −60, 140) and a
   wide shot from the forest lamp hill, each at 11:00 and 21:00 in summer, 1280x720, with `?cells=off` and without.
   Compare each pair pixel by pixel (decode the PNGs in a page canvas, or add `pngjs` as a dev dependency) and print
   "N of M pixels differ". First diff two captures of the same build to know the noise (people and particles move:
   compare with Town Life frozen if needed, `director.townFrozen` / pause the clock). Look at every pair yourself.
2. **Tests.** `npm test`, then against the production build:
   `tests/quickstart-browser.mjs`, `tests/zone-browser.mjs`, `tests/minigame-exit-browser.mjs --only=phone`,
   `tests/minigame-menu-browser.mjs --all=1`, `tests/tour-production-browser.mjs`, and one story autopilot
   (`npm run test:e2e`, see `tests/e2e/`; it takes a while, run it once at the end).
3. **Phone.** At 8x the frame must not be slower than before, and the pacer (`?pace=off` to compare) should keep
   30 fps more steadily.

## Pass criteria

- Visible objects at Kawabe on Low: ≤ 1,000 (from ~1,800).
- JS per frame at 4x on Low: at least 10% lower at all three spots; never higher.
- Draw calls: never higher at any spot or tier.
- Pictures: no difference beyond the noise of two captures of the same build.
- All the suites above pass; `?cells=off` restores the old path exactly.

## Log (fill in)

| Step | Commit | Kawabe visible objects | JS/frame 4x (Kawabe / Takamori / station) | Draws Low / High | Notes |
|---|---|---|---|---|---|
| Baseline | `ac32acc` | ~1,786 | ~11 / – / – ms | ~150 / ~509 | measured by Claude 2026-10-25 |
| Repeated baseline | `c8d93cb` | 1,859 | 11.3, 13.4 / 13.6, 17.6 / 11.3, 20.6 ms | 172 / 461 at Kawabe | Codex, 2026-10-25; station's 20.6 ms sample was transient (control 12.1 ms); raw samples retained |
| Cell foundation | `8e4d4a5` | Unchanged (not wired yet) | Unchanged | Unchanged | Seven pure Node cases pass: centred indices, transforms, exact distance hysteresis, frustum and shadow bounds, visibility ownership, pruning |
| Static integration | `0ff39a1` | 1,600 | 19.90 / 22.80 / 17.00 ms | 172 / 461 at Kawabe | Same-build paired control: 20.30 / 22.55 / 18.95 ms; gains 2.0% / −1.1% / 10.3%. Static step alone misses the target; 975 Node cases pass |
| Static + actor cells | `ea700df` | 874 live; 954 fixed pose | 10.05 / 26.20 / 14.00 ms | 197 / 462 at Kawabe, fixed pose | Paired old-path control: 23.40 / 31.30 / 20.70 ms; 989 Node tests pass. See repetitions and final controlled 8× follow-up below |
| Guarded verification | `eed1cfe` | 954 fixed pose | Prior 4× results above | All nine spot/tier pairs non-increasing | 995 Node tests, all required browser suites and 16 exact image pairs pass; final controlled 8× work is lower at all three spots |

### Codex measurement notes

- Task branch: `codex-cell-grid`; isolated worktree `3D_claudeopus55/.worktrees/starline-cell-grid`. The original
  `3D_game_scene` checkout and its uncommitted mobile-support file are untouched.
- Immutable production and unminified baseline builds are retained under `.tools/cell-grid/baseline-prod` and
  `.tools/cell-grid/baseline-prof`; both use packed models. Baseline commit: `c8d93cb10df8e5f2f800d92fab781b3b1faf7ca4`.
- Baseline Low draw calls, Kawabe / Takamori / station: **172 / 178 / 129**; High: **461 / 400 / 293**.
  Ancestor-aware visible objects: Low **1,859 / 2,462 / 1,546**; High **2,873 / 3,379 / 2,393**.
- Of Kawabe's 1,859 visible objects, structures account for only 543. Static structures alone cannot meet the
  1,000-object target, even if all of them disappeared. The optional actor step must be assessed after the static checks.
- Correctness refinements to the proposed design: keep exact per-object distance gates inside cell kind groups
  (using only the cell's nearest edge would extend prop range); retain the existing hysteresis direction (hide at
  the full distance, reappear 12 m or 6% inside it); include the directional shadow frustum as well as the view;
  use actual object extents across cell edges. The drawbridge and travelling boats retain their original parents
  because their footprints move. Gameplay owns each model's `visible`; cell and distance gates own separate parents.
- Splitting the existing 400 m viaduct batches into 64 m batches added 3 calls at High Kawabe and 4 at High station.
  These measured regressions were fixed by preserving those batches intact inside cell parents, with bounds covering
  their full geometry. Fences use the centred 64 m partition. The corrected static draw survey has no increases:
  Low Kawabe / Takamori / station **172 / 177.7 / 125**, High **461 / 395 / 293**. Takamori's moving actors can vary
  the averaged count slightly; the corresponding same-run old-path Low counts were **172 / 180.8 / 129**.
- Static timing used alternating off/on/on/off samples, three seconds of warm-up and eight seconds of sampling at
  4×, with governor 0 and scale 1 throughout. Absolute timings were slower than the earlier baseline window:
  an unchanged single-page control also measured 17.6 ms at Kawabe. Compare the paired gains, not timings collected
  in different load conditions. Raw measurements are under `.tools/cell-grid/static-paired-cpu4`.
- Screenshot calibration caught an asynchronous fixture issue: ambient dancer Hoa could be born ten simulation
  frames later in one capture. The harness waits for lazy scenery/models before advancing the fixed clock; it keeps
  all characters, shadows and effects in the picture. No pixel regions are excluded.

### Final implementation and checks

- The optional actor step was needed to reach the object target. Moving actors use their current 64 m cell and
  a conservative per-actor view/shadow gate. Simulation, animation, distance detail and logical visibility still
  run normally. Room residents, train passengers, ridden cows and roots transferred to other owners bypass the
  grid. Removed roots are not resurrected; foreign-owner disposal does not retain them in the grid's strong map.
  Fourteen actor regression cases cover crossings, ownership, interior visibility, shadows and cleanup.
- Final runtime commit: `ea700df`; production service-worker stamp: `c04b191b77`. `npm run build` passed, including
  model packing and service-worker stamping. The final suite passed **995/995 Node tests**, including six additional
  benchmark-recorder/guard cases (`final-harness-tests.log`). No protected entry/input/game file changed.
- Live Low visible objects, old path → cells: Kawabe **1,859 → 874**, Takamori **2,462 → 1,282**, station
  **1,546 → 960**. High: **2,873 → 1,680**, **3,379 → 2,044**, **2,393 → 1,201**.
  The separately seeded fixed-pose comparison is **2,035 → 954** at Low Kawabe; both Kawabe protocols meet ≤1,000.
  Live and seeded fixed-pose counts are different protocols: do not compare a live count to a fixed-pose count.
- A live Takamori survey briefly differed by one draw because an NPC had moved. The final draw comparison freezes
  the same seeded state and counts 30 actual `renderWorld` calls per spot (not animation-frame callbacks, which the
  pacer can skip). All nine spot/tier combinations are equal or lower; fixed draws are not timing measurements:

| Tier | Kawabe off → on | Takamori off → on | Station off → on |
|---|---|---|---|
| Low | 197 → 197 | 177 → 177 | 129 → 125 |
| Medium | 349.5 → 349.5 | 299 → 299 | 246 → 246 |
| High | 462 → 462 | 400 → 395 | 293 → 293 |

- All **16 image pairs** (four official spots × day/night × High/Low) differ by **0 of 921,600 pixels**.
  Two independent old-path controls and frozen repeat captures also differ by zero. Every pair was visually
  inspected. The test uses a fixed clock, seeded randomness and explicit lazy-model readiness; it has no pixel
  masks, exclusions or tolerance. Evidence: `.tools/cell-grid/shots-final-c04b/`.

### Final CPU measurements

The unminified, packed final build was served on port 5903. Tests used Low, 390×844, DPR 2, summer 11:00, normal
pacing and adaptive quality. Each sample had readiness checks, four seconds of warm-up, 1.5 seconds of CPU settling
and eight seconds of profiling. Order was off/on/on/off per spot; only one game context was loaded at a time.
The table reports both repetitions and their mean median. Alternate shadow frames make medians bimodal; p90 and
raw samples are retained rather than treating these percentage gains as precise estimates.

| 4× spot | Off medians (ms) | On medians (ms) | Mean off → on (ms) | Reduction | Mean p90 off → on (ms) |
|---|---|---|---|---|---|
| Kawabe | 25.3, 21.5 | 14.1, 6.0 | 23.40 → 10.05 | 57.1% | 33.15 → 22.35 |
| Takamori | 34.1, 28.5 | 26.8, 25.6 | 31.30 → 26.20 | 16.3% | 43.25 → 32.85 |
| Station | 19.3, 22.1 | 18.3, 9.7 | 20.70 → 14.00 | 32.4% | 27.85 → 20.35 |

All 4× samples ended at governor level 0 / scale 1. The paired results meet the 10% criterion at each spot.
Evidence: `.tools/cell-grid/FINAL-CPU.md`, `final-cpu-summary.json` and `final-single-world-paired/`.

**The initial 8× comparisons were inconclusive.** The same ABBA series showed mean medians
69.95 → 57.90 ms at Kawabe, 73.35 → 45.90 at Takamori and 67.00 → 43.60 at the station, but adaptive quality
varied and these absolute timings were much slower than the earlier baseline. A separate fresh-process/browser
Kawabe ABBA check contradicted that gain: off 42.5 / 52.6 ms, on 62.6 / 44.6 ms, mean **47.55 → 53.60 ms**;
p90 means were 82.1 → 81.3 ms. The final off sample also dropped to governor 2 / scale .85, while the other three
ended at level 1 / scale 1. This is inconclusive, not a pass. Raw failures and controls remain under
`.tools/cell-grid/fresh-browser-sanity/`. Native renderer cost changed substantially between samples; the data
does not establish its cause. No steady-30-fps claim is made.

A bounded fixed-state GL diagnostic initially found **45,225 native GL calls over 30 Low Kawabe renders in both
modes**, including **1,935 `useProgram` calls** with the same shader-source signature sequence. A confirmation
boot found **45,225 → 45,255** calls: exactly one additional `useProgram` per render (64.5 → 65.5 average), with
draws, uniform upload counts/types/array lengths and texture/buffer counts still equal. The same RTX 4080 SUPER /
D3D11 device was used. Full command order and matrix values were not byte-identical. There is a small
ordering-sensitive program-bind variation; the diagnostic does not establish the cause of the much larger timing
swing. These are command counts, not CPU timing results. Both datasets are retained locally.

**The final controlled follow-up supports 8× non-regression at all three spots.** The hardened recorder ran exactly
four fresh-process/browser samples per spot in off/on/on/off order, with eight seconds of unthrottled warm-up,
three seconds of CPU settling and a 12-second gated sample. All 12 samples stayed at **Low level 0 / scale 1 on
every frame**, with no quality transitions or resource/runtime failures. Normal pacing remained enabled. No sample
was repeated to chase a pass; earlier contradictory measurements remain above and in their original files.

| 8× spot | Mean frame work off → on | Reduction | Mean median off → on | Mean p90 off → on | Mean frame gap off → on |
|---|---|---|---|---|---|
| Kawabe | 38.80 → 33.34 ms | 14.1% | 36.35 → 31.10 ms | 50.50 → 43.75 ms | 42.39 → 37.61 ms |
| Takamori | 46.31 → 40.85 ms | 11.8% | 43.40 → 38.05 ms | 60.65 → 53.50 ms | 48.94 → 43.33 ms |
| Station | 34.58 → 32.35 ms | 6.4% | 31.00 → 28.30 ms | 52.20 → 50.00 ms | 38.62 → 37.61 ms |

Each table value is the mean of the corresponding two per-run statistics. Use the gated frame statistics for
these conclusions: raw CPU profiles include 2.2–2.8 seconds of explicitly recorded profiler-control padding outside
the frame window. Evidence: `.tools/cell-grid/final-pinned8/ALL-SPOTS.md`, `all-spots-summary.json`, `hashes.json`,
`commands.log` and all 12 raw JSON/log/profile sets. The five helper/build hashes matched across all runs.

**Steady 30 fps remains unproven.** Kawabe's pooled frame-gap standard deviation improved from 9.69 to 7.86 ms,
but individual gaps still reached 68–107 ms. The normal pacer entered its 33.33 ms setting during each sample;
these histories are not an assigned `pace=off` comparison. See `final-pinned8/KAWABE-PACER.md`. The cell grid
reduces work without lowering quality; it does not establish a fixed 30 fps guarantee on a phone.

### Production browser results

All required browser suites ran against the same packed build on `http://127.0.0.1:5901/`, with fresh browser
contexts. Functional suites ran concurrently after timed profiling; their frame rates are not performance evidence.

| Suite | Result | Evidence under `.tools/cell-grid/` |
|---|---|---|
| `tests/quickstart-browser.mjs` | PASS, 315 s; phone/desktop play, input/win/save, valley transition, three viewport groups, 10-round memory plateau, rotation/WebGL recovery, boot/title/tour | `quickstart-final/`, `quickstart-final.log` |
| `tests/zone-browser.mjs` | PASS, 40 s; eggs/fireflies/tug, baked far view, zero in-zone placeholders, cross-zone cleanup, actual boundary walk, `zones=off` | `zones-final/`, `zones-final.log` |
| `tests/minigame-exit-browser.mjs --only=phone` | PASS, 159 s; every game returns to the list | `exits-final/`, `exits-final.log` |
| `tests/minigame-menu-browser.mjs --all=1` | PASS, 369 s; six title sizes, desktop/phone picker and story-pause entry, full catalogue launch | `menu-final/`, `menu-final.log` |
| `tests/tour-production-browser.mjs` | PASS, 53 s; all eight Grandma/Classic × title/pause × desktop/phone cases | `tour-final/`, `tour-final.log` |
| `npm run test:e2e -- --story=grandma --quality=low` | PASS, 574 s; finished `e.free`, all four lamps, 8/8 train lanterns, pause/journal/resume | `e2e-grandma-final/`, `e2e-grandma-final.log` |

The menu suite's old fallback imported `/src/content/minigames.js` in the browser, which is unavailable in the
production build. It now reads that pure catalogue fixture in Node; actual game launches still use the production UI.

An additional phone smoke check entered and exited houses `kw1` and `kw3` using the real E interaction. During
rendered room frames, the actor-grid and structures roots stayed hidden, and resident visibility flags stayed
enabled with direct scene parenting at room height 600. The door camera did not provide a clear resident portrait.
Exiting restored both roots and the house, returned the player outdoors, hid residents and restored unlocked play.
The orchard gate, drawbridge and repaired viaduct/scaffold state were unchanged; there were no page/resource
errors. Evidence: `interior-ownership/` and `interior-ownership.log`. The story autopilot separately exercised
viaduct repair and the complete train ride; the tour suite exercised world-state restoration, and the quickstart /
zone suites exercised launch/exit and returns to the valley. Those browser suites do not explicitly assert that
the focus capture path was active, so an additional production focus check was run.

The focus check used `quick=off&zones=off&focus=on` and the real pause → Mini games → tug UI. Takamori's `cell:2,0`
began hidden and outside the camera frustum. The active renderer focus session revealed that cell for its backdrop,
with 12 captures and the actual round camera/projection. Rotating from portrait to landscape produced fresh
captures (36 total) with matching camera/projection. Stop restored methods, camera/input and unlocked play, cleared
both focus handles and preserved plays/stars/best values. No page/resource errors. Evidence: `focus-ownership/`.

A final bounds audit confirmed that live tropical swaps rebuild the separate foliage group, outside CellGrid.
Archery's slider/easy-target motion remains inside the range footprint; temporary gong/balloon visuals are separate
scene objects. The existing gate, drawbridge, viaduct, interior and focus ownership paths were also reviewed.

### Reproduce

Run from the isolated worktree, with the production preview on 5901 and packed unminified preview on 5903:

```powershell
$env:GAME_URL='http://127.0.0.1:5901/'
node tests/perf/draw-calls.mjs --fixed=1 --quality=low,medium,high --cells=off --out=.tools/cell-grid/fixed-off.json
node tests/perf/draw-calls.mjs --fixed=1 --quality=low,medium,high --out=.tools/cell-grid/fixed-default.json
node tests/perf/spot-shots.mjs --quality=high,low --out=.tools/cell-grid/shots-repeat
# Run each browser suite above with this same GAME_URL; use --out for separate evidence directories.
$env:GAME_URL='http://127.0.0.1:5903/'
node tests/perf/frame-profile.mjs --cpu=4 --secs=8 --spot=kawabe --cells=off --out=.tools/cell-grid/profile-off.json
node tests/perf/frame-profile.mjs --cpu=4 --secs=8 --spot=kawabe --out=.tools/cell-grid/profile-on.json
# Repeat off/on/on/off at kawabe, takamori and station; repeat with --cpu=8. No parallel browser/build work.
# Final matched-quality follow-up used these additional arguments, at all three spots:
node tests/perf/frame-profile.mjs --cpu=8 --secs=12 --warmup=8 --settle=3 --lock-quality=1 --spot=kawabe --cells=off --out=.tools/cell-grid/pinned-off.json
```

Fixed-clock draw and picture checks must never be used for CPU/FPS claims. Baseline builds, screenshots, JSON,
logs and CPU profiles remain local ignored artifacts; the measured results and their limitations are recorded here.

The final measurement-script review corrected triangle counting to use native renderer totals, separated actual
frames from gaps, gated the frame recorder inside the profiling session, preserved the original frame owner,
and added per-frame quality/pacing history and explicit profiler-control padding. It also added failures for
HTTP/request/console errors, visible placeholders, production `/src` requests and absent/default or present/off
grids. Earlier raw artifacts are preserved; request telemetry absent from those files must not be inferred as zero.
The hardened native draw check repeated all nine spot/tier pairs with the same non-increasing counts and clean
resource/grid guards (`draw-native-v2-off.json`, `draw-native-v2-default.json`). A guarded High Kawabe day picture
check also passed against the fixed OFF-B reference with zero differing pixels; OFF-A had one pixel of fresh-boot
noise, retained in the report. This additional smoke does not replace the earlier complete 16-pair comparison.

### Disposition

Implementation and the listed numeric/image/test pass criteria are complete on `codex-cell-grid`. Controlled 8×
frame work is also lower at all three spots. The remaining phone-performance limitation is the steady-30-fps
expectation above. This task branch is ready for review before a main merge; the original `3D_game_scene` working
copy remains untouched.
