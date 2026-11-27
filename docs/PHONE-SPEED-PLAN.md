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

## 4. Round 3: trees and other scenery (researched 2026-11-27, not started)

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
