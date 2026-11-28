# Phone speed plan

Written 2026-11-21 from a fresh profile of `00b712f` (phone tier: Low, 390×844, CPU slowed 8×, Explore, Kawabe and
Takamori). The machine was fully loaded by other work during the run, so absolute times were about 2× too high
(51 ms of game work per frame; 23–29 ms on 2026-11-12). The shares and the draw counts are reliable.

## 1. Where a frame goes

| Part | Share of the frame | Note |
|---|---:|---|
| Drawing (`renderer.render`) | 77 % | |
| – submitting draws (`renderBufferDirect`) | 43 % | 170–176 draws a frame |
| – of that, switching program / uniforms / textures (`setProgram`) | 29 % | lights and material uniforms re-sent per draw |
| – walking the scene to decide what to draw (`projectObject`) | 12 % | |
| – world matrices | 8 % | |
| – shadow map | 5–8 % | drawn every other frame |
| – bloom, grade, output | 4 % of CPU | 15 full-screen passes: the GPU cost is not visible in this test |
| Game logic (`director.update`) | 17 % | |

About two thirds of the main thread's time is inside the browser's graphics calls, not in the game's own code.
**The bottleneck is the number of draw calls and the state changed between them**, then the scene walk, then game
logic. Resolution is not the problem on a CPU-bound phone (the governor's resolution steps buy nothing there).

Draws per frame on the phone tier:

| Spot | Total | View | Shadow | Full-screen |
|---|---:|---:|---:|---:|
| Kawabe | 170 | 122 | 33 | 15 |
| Takamori | 176 | 144 | 17 | 15 |

Biggest groups: buildings 34–41, trees and plants 20–27, railway 26 (Kawabe), full-screen passes 15, building
shadows 7–15, festival lanterns 11, Mika 10, Hoa 12, the idle cow-race site 11, loose props 12–19.

**Not known:** the GPU side on a real phone. Thirteen bloom passes plus two more full-screen passes may cost more
there than everything above. The owner's "Copy performance report" from the real phone is still missing.

## 2. Plan (in this order; each step measured before and after)

| # | Step | Draws saved | Look changes? |
|---|---|---:|---|
| 0 | Baseline on a quiet machine + the real phone's report (Settings → Copy performance report) | – | no |
| 1 | Full-screen passes on Low: bloom with 3 levels instead of 5, grade and output in one pass | 15 → 8 | bloom slightly tighter |
| 2 | Building shadows: one shadow-only mesh per map square instead of one per building part | 7–15 → 2–4 | no |
| 3 | Railway near Kawabe: merge beams, rails and plain parts | 26 → ~8 | no |
| 4 | Festival lanterns (`cel:decor`): one mesh for bulbs, one for strings | 11 → 3 | no |
| 5 | Mika: body, silhouette and carried things in fewer draws | 10 → 5 | no |
| 6 | Hoa on Low uses the merged light model; the cow-race site hides while no race runs | ~20 → ~3 | Hoa's wardrobe detail on Low |
| 7 | Loose props (benches, cogs): merge per map square, no shadows on Low | ~12 → ~4 | no |
| 8 | Cheaper draws: stop re-sending light uniforms when no light changed; share duplicate materials; find the texture re-uploaded every frame | – | no |
| 9 | Scene walk: put loose props and plants in the cell grid; freeze matrices of things that never move | – | no |
| 10 | Game logic: profile inside `director.update`; run slow scans (interact search, town plans) 10 times a second | – | no |
| 11 | Governor for slow CPUs: steps that remove draws (people and prop distance, shadows, bloom), not pixels | – | only on slow phones |

Target after steps 1–7: about 110 draws a frame (from 170–176), which at the measured cost per draw is roughly a
quarter to a third off the frame. Steps 8–10 aim at a further 10–15 %. These are estimates until measured.

## 3. Rules for every step

- Measure with `tests/perf/frame-profile.mjs --cpu=8` and `tests/perf/draw-calls.mjs` on a quiet machine; compare old
  and new interleaved with an identical-pair control (the noise floor).
- Prove the picture with a pixel diff where the table says "no".
- Keep a URL switch for each step (like `?cells=off`) so it can be A/B tested on the real phone.
- After a real gain, record it in `tests/perf/budget.json` (`perf-budget-browser.mjs --record`) so it cannot slip back.
- Steps 1, 6 and 11 change the look a little: the owner decides.

## 4. Round 3: trees and other scenery (researched 2026-11-27, R3-0..R3-6 done 2026-11-28, results in 4.1)

Measured on a built preview, summer 11:00, frozen world (`g.paused = true`, `readPixels` right after `render`: pixel-diff
noise floor 0 px). Cost per draw on Low: ~0.055 ms at 4x CPU, ~0.11 ms at 8x, so **10 draws ~ 1.1 ms ~ 4 % of a phone
frame**; people cost ~2x per draw. Scratch scripts, JSON and pictures: `.tools/scene-research/` (ignored).

### Low (phone) per view: draws / k triangles

| Group | Kawabe | Takamori | Station | Meadow |
|---|---:|---:|---:|---:|
| trees | 10 / 34 | 10 / 34 | 10 / 38 | 10 / 43 |
| rocks + bushes | 7 / 9 | 10 / 10 | 8 / 6 | 7 / 11 |
| flowers / reeds / lilies | 10 / 5 | – | – | – |
| grass | 1 / **181** | 1 / **181** | 1 / **181** | 1 / **181** |
| buildings | 5 / 16 | 24 / 49 | 21 / 32 | **46** / 52 |
| props (structures + loose) | 13 / 6 | 14 / 6 | 8 / 2 | 10 / 4 |
| festival decor | 7 / 96 | 9 / 52 | 4 / 20 | 11 / 128 |
| people / animals | 14 / 37 | 26 / 110 | 19 / 64 | 29 / 80 |
| railway | **22** / 88 | 6 / 37 | 10 / 49 | 10 / 55 |
| shadow pass | 27 / 83 | 15 / 66 | 5 / 28 | 5 / 66 |
| **total** | **146 / 606** | **155 / 614** | **115 / 471** | **170 / 717** |

- Trees: 8 species, 2,511 records, untextured, vertex colours, opaque (no alphaTest); on Low every tree in view is the
  344-tri LOD, 150-400 m away, over 64 px tall on screen, none hidden behind terrain. Their cost is draws (2 a species:
  Bark + Leaves), not triangles.
- Grass is the largest triangle item (30 % of Low, 49 % of High); `tests/perf/draw-calls.mjs` showed it as 36 triangles
  because it ignores `InstancedBufferGeometry.instanceCount`.

### Prototypes (measured, all four spots)

| Variant | Low draws (K / T / S / M) | High draws | Pixels changed (> 8) |
|---|---|---|---|
| M: one vertex-coloured mesh per foliage model (roughness, wind weight and original part height per vertex) | -15 / -9 / -7 / -12 | -23 / -21 / -26 / -23 | Low 0-11 of 329k; High 16-420 of 922k at reed/lily bank edges (group parts by `side`) |
| B: then all far trees in one `BatchedMesh` | -4 / -4 / -4 / -4 | -4 to -6 | 0 |
| G: grass blades with 2 segments instead of 3 | 0 (-60k tris Low, -385k High) | 0 | Low 0.7-1.6 % (same by eye); High 4-7 % (keep 3 there) |

### Steps (each with a URL switch, a frozen-world pixel A/B and a budget record after a gain)

| Step | What | Low draws saved (K / T / S / M) | Look | Effort | Files |
|---|---|---|---|---|---|
| R3-0 | Tool: count `instanceCount` in `draw-calls.mjs`; baseline at 4 spots x 2 tiers | – | – | S | `tests/perf/draw-calls.mjs` |
| R3-1 | Foliage part merge (`?foliageMerge=off`): per-vertex `color`, `aRough`, `aWind`, `aY` (part-local height before the dequantizing part matrix), `aPart`; season tint/bare/fruit through uniforms + part mask | -15 / -9 / -7 / -12 | 0-11 px; test every season | M | `src/world/foliage.js`, `src/engine/effects.js` |
| R3-2 | Grass 2 segments on Low and Medium (`?grassSegs=3`) | 0 (-60k tris) | 0.7-1.6 % px; owner eye check | S | `src/world/grass.js` |
| R3-3 | Buildings: one PBR material (per-vertex roughness/metalness), then merge static buildings per 64 m cell (`?buildMerge=off`); story-toggled houses and kept nodes stay separate; glow panes one mesh per cell | ~ -2 / -12 / -10 / -22 (est.) | 0 px expected; check noon and night | M | `src/engine/static-merge.js`, `src/engine/cell-grid.js`, `src/world/structures.js` |
| R3-4 | Small props: ferry, laundry line, bench into the merge list; NPC tools merged (keep the rod tip node) | ~ -5 / -6 / -4 / -15 | 0 px | S-M | `src/content/models.js`, `src/engine/static-merge.js` |
| R3-5 | Railway: Iron + Sleeper wood as one vertex-coloured instanced mesh per chunk | -3 to -6 at Kawabe | 0 px | S | `src/world/railway.js` |
| R3-6 | Trees in one `BatchedMesh` (`?treeBatch=off`, off without `WEBGL_multi_draw`): `perObjectFrustumCulled = false`, `sortObjects = false`, cells drive `setVisibleAt`/`setGeometryIdAt`; wind reads `batchingMatrix` | -4 each | 0 px | M (after R3-1) | `src/world/foliage.js` |
| R3-7 | Optional, owner decides: festival lanterns 12 -> 8 segments, puffs detail 1 -> 0 | 0 (-30 to -60 % of decor tris) | lanterns a bit less round up close | S | `src/fx/cel-decor.js` |

Expected after R3-1..R3-6 on Low: Kawabe 146 -> ~120, Takamori 155 -> ~120, Station 115 -> ~90, Meadow 170 -> ~115
draws (about -2.5 to -5.5 ms per frame at 8x), plus -60k grass triangles.

Not recommended here (measured): tree impostors or a third far level (trees are > 64 px tall at 150-400 m; at most -30k
tris, 0 draws), baking the far forest into the terrain (loses the rim silhouettes), terrain occlusion for foliage (0
trees hidden at all four spots), alphaTest/card foliage (breaks hidden-surface removal on tile GPUs), KTX2 for foliage
(it has no textures). People (14-29 draws at 2x cost) are the next big item: a round 4.

### 4.1 Results (2026-11-28, branch `phone-speed-r3`)

Measured on built previews, summer 11:00, governor off. Draws and triangles per frame (the budget tool, whole scene,
main + shadow + full-screen passes); people and animals move between page loads, so whole-scene draws carry ±1-2 of
noise. Pixel A/Bs: run-time switches were compared in the same page with a frozen world (noise floor 0 px); load-time
switches (`?buildMerge=off`) across two page loads with `Math.random` seeded and only the static scene shown (people,
animals, particles, the train and the grass hidden; noise floor 0 px > 8 except 633 px of one far tree near its LOD
band at High Kawabe). "px" = pixels changed by more than 8 of 255.

| Step | Switch | Low draws K / T / S / M | High draws K / T / S / M | Pixels (Low; High) |
|---|---|---|---|---|
| R3-0 baseline (tool counts `instanceCount`) | – | 146 / 153 / 115 / 170 | 418 / 367 / 274 / 559 | – |
| R3-1 foliage part merge | `?foliageMerge=off` | -12 / -9 / -14 / -10 | -20 / -19 / -22 / -19 | 0-1; 1-8 (all four seasons, wind at three times; 0 on the dev server) |
| R3-2 grass 2 segments on Low/Medium | `?grassSegs=3` | 0 (-60k triangles) | 0 (High keeps 3) | 0.7-1.5 %; 0 |
| R3-3 one merged material + one draw call per map square | `?buildMerge=off` | -20 / -18 / -12 / -16 | -67 / -47 / -37 / -108 | 0 / 60 / 0 / 174; 636 / 86 / 10 / 111 (edge seams); night and winter alike |
| R3-4 ferry, laundry line, bench, NPC tools | `?buildMerge=off` | -7 / -7 / -5.5 / -15.5 | -33 / -22 / -10 / -45 | 15 / 0 / 41 / 0; 1 / 0 / 170 / 0 |
| R3-5 sleepers one instanced mesh a stretch | `?buildMerge=off` | -3 / -2 / -2 / -3 | -5 / -3 / -5 / -6 | 0; 0 |
| R3-6 far trees in one BatchedMesh | `?treeBatch=off` | -4 / -4 / -4 / -4 | -4 / -5 / -5 / -6 | 0; 0 (summer and winter) |
| **after R3-6** (budget record) | | **100 / 110 / 84 / 123** | **291 / 275 / 196 / 380** | |

Low triangles: 608k / 608k / 472k / 719k -> 547k / 540k / 412k / 659k (grass). Draws on Low: -27 to -32 % at the four
spots (the plan expected -18 to -32 %); on High -25 to -32 %. `tests/perf/budget.json` now has the meadow too and was
tightened after every step (the lower of the old and new limit; triangle limits re-based once in R3-0, when the tool
started counting the grass).

How each step was done, and what changed from the plan:
- **R3-1.** Not baked: the merged mesh keeps each part's local (quantized) coordinates and rebuilds the part matrix in
  the shader from a per-part uniform table (`aPart`), so the wind, snow and sakura-glow patches run unchanged. The
  per-part meshes stay as handles (not drawn): the seasons, the peach orchard lights and BlossomGlow still change their
  materials, and the merged material copies colour, emissive, roughness, metalness and the season switch from them each
  frame. Better pixels than the prototype (0-8 instead of 16-420 px).
- **R3-3.** The plan's "merge per 64 m cell" first folded culled buildings away in the shader: that drew +49k to +131k
  triangles a Low view (hidden buildings still vertex-shaded), so it became one BatchedMesh per square (each model's
  geometry once, each building an instance, three's per-instance view culling on, the distance culling synced into
  `setVisibleAt`). Same draws, equal triangles. Needs `WEBGL_multi_draw`; without it squares are not joined (the
  one-material merge still applies). Glow panes were **not** joined per square (0-1 draws a spot; they would need the
  same per-building switch). A follow-up fix (7fda9ac) makes the snow/wind patch read `batchingMatrix`: without it
  batched buildings would have had winter snow on the wrong faces.
- **R3-4.** Models merged for the first time (`MERGE_EXACT` and two-part models like the bench) keep their exact
  roughness and metalness; the ones merged before keep their quarters, so nothing changes on screen. The tools people
  carry are not in the static picture (people hidden): their merge was checked by counts only.
- **R3-6.** Only with `WEBGL_multi_draw` (passed in from game.js); the batch is rebuilt with the tree sets on a theme
  switch.
- **R3-7** (festival decor) not done: the owner decides.

Found on the way, not changed: the built (quantized) trees never sway. The wind patch compares the part-local height
(-1..1 after meshopt quantization) with 1.4 m, so `hgt` is always 0; in dev (unquantized models) they sway. Pictures
at two times: tree pixels identical. Fixing it changes the look (owner decides).

Checks on the final build: `npm test` 1100/1100; perf budget (built preview, 8 places) within the tightened limits;
minigame-menu browser suite passed; moments browser suite passed on a rerun (the first run failed only its wall-clock
"in the running game at 8x" ceiling, idle 348 µs with idle slower than a shower: machine load; rerun idle 91 µs);
Grandma story autopilot on Low finished in 9.7 min (all four lamps, menus work).

Open: the real phone's numbers (Settings -> Copy performance report) for the ms per frame; Safari's support of
`WEBGL_multi_draw` decides whether R3-3/R3-6 apply on iPhones (they fall back to the per-building / per-species draws).
Scripts: `.tools/r3/` (ignored): `ab.mjs` (frozen-world A/B with variants and `--static`), `diff.cjs`, `cross.sh`,
`vsprev.sh`, `budget-merge.mjs`.

## 5. PC resolution (2026-11-28, branch `pc-resolution`)

The phone tiers are unchanged: Low and Medium on a phone keep their pixel-ratio and pixel caps, the Low ladder, its
31 ms line and the cinematic / mini game floors. On a desktop the governor now gives up supersampling, the shadow map,
the glow, MSAA and distances before any resolution, and the floors no longer touch a desktop's Medium/High (they put
every PC mini game at 72 %). Settings > Resolution (Auto / Sharp / Balanced) and the numbers: `docs/RESOLUTION.md`.
