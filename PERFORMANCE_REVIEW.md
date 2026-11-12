# Performance review — 2026-10-25

## Scope and outcome

Local-only optimization of Starline at base commit `0e7a754`, using the installed
`C:/Users/n/.claude/skills/smooth-dense-scenes/SKILL.md` and its CPU/buffer reference.
The supplied path omitted the slash before `.claude`; the installed folder was used.
Engine: **Three.js 0.180.0**, not the r185 engine used by the skill's newer case study.
Existing changes to `src/mobile-game-support.mjs` were left untouched. No commit,
push, deployment, dependency upgrade, quality reduction, or control changes.

Measured reductions: redundant world transforms and particle buffer traffic.
**No proven FPS improvement is claimed.** Draw calls and graphical resource counts
remain unchanged in the main comparison. The fixed-view screenshots match exactly.

## Method

`scripts/performance-review.mjs` runs the actual game in Chromium/ANGLE D3D11 on an
NVIDIA RTX 4080 SUPER. Local Vite development server, fixed Kawabe view
`-45,8,45,-45,2,20`, spring, seeded random source, fixed 1/60 simulation step.
Automatic quality adaptation is disabled in the measurement page only, to avoid
comparing different quality settings. The production governor is unchanged.

- Desktop: 1440×900, DPR 1, High, no CPU throttling.
- Mobile emulation: 390×844, DPR 2, Low (390×844 drawing buffer), 4× CPU throttling.
- 120 warm-up frames, 10 settling frames per state, 60 timing frames, then 60
  separately instrumented frames. A second state pauses simulation but still renders.
- Raw WebGL draw functions count every submission, including shadows and composer
  passes. `renderBufferDirect` classifies shadow submissions separately.
- Matrix4 composition and multiplication wrappers count actual engine operations.
  Call-stack attribution is collected in a separate single frame, not timed frames.
- `bufferSubData` counts calls and submitted bytes, honoring WebGL2 element offsets
  and lengths. `bufferData` tracks new buffer allocations after warm-up.
- Memory inventory deduplicates non-interleaved scene attribute ArrayBuffers and reports renderer
  geometry/texture/program counts and the browser's approximate JS heap reading.

The JSON key `moving` means **simulation running with a fixed view**, including
train/effects updates; it is not a complete player walk-through benchmark. Timing
measures synchronous CPU frame/submission work, not GPU completion or display FPS.
Bone texture uploads and total GPU VRAM are not included in buffer-byte measurements.

Raw local results/screenshots: `.tools/performance/{before,control,after,after-repeat}.*`.
These are ignored local artifacts; the scripts and this report retain the procedure
and findings. `before` lacked the later one-frame stack-attribution step at capture;
`control` and both `after` runs have matching capture schedules.

## Before / after work per frame

Counts reproduced in both baseline runs and both optimized runs:

| Running simulation | Desktop before | Desktop after | Mobile before | Mobile after |
| --- | ---: | ---: | ---: | ---: |
| Raw draw submissions | 832 | 832 | 230 | 230 |
| Shadow submissions | 141 | 141 | 29 average | 29 average |
| Matrix compositions | 74 | 74 | 72.5 | 72.5 |
| Matrix multiplications | 5,750 | 1,529 | 4,072.5 | 661.5 |
| Buffer sub-upload calls | 16 | 3 | 16 | 3 |
| Buffer bytes submitted | 105,024 | 1,864.5 | 87,424 | 1,890.1 |
| New buffer allocations after warm-up | 0 | 0 | 0 | 0 |

Matrix multiplications fell **73.4% desktop / 83.8% mobile**; uploaded bytes fell
**98.2% / 97.8%**. These are repeatable work reductions, not FPS percentages.
Mobile fractions reflect the existing every-other-frame shadow update cadence.
Paused scenes had zero steady buffer uploads in both versions; their matrix counts
were already low (desktop 1,513, mobile 645.5), and remain unchanged.

### CPU time and uncertainty

| Running simulation, median CPU ms | Before run 1 | Before control | After run 1 | After repeat |
| --- | ---: | ---: | ---: | ---: |
| Desktop | 4.3 | 3.7 | 3.5 | 7.4 |
| Mobile emulation, CPU ×4 | 17.2 | 28.1 | 11.6 | 15.4 |

The large variation, including a slower desktop repeat, prevents a reliable speedup
claim. Paused timings also varied without work-count changes. No interleaved timing
experiment established a causal FPS improvement. Real phones, mobile GPU bandwidth,
thermal throttling, battery use, and sustained play remain untested.

A supplemental three-second live RAF CPU profile using the skill's `cpu-profile.mjs`
(Low, mobile viewport, CPU ×4) sampled 182 frames. It reported 13.29 ms/frame inclusive
game-frame work, 10.58 ms in the composer, 1.99 ms in cached matrix traversal, and
1.60 ms in shadow rendering (inclusive timings overlap; do not sum them). Remaining
self costs include scene traversal (`projectObject`, 2.01 ms) and matrix-cache visits
(1.97 ms). Its 16.7 ms median frame interval is a single desktop-host observation, not
a before/after speedup or a physical-phone result.

### Memory

| Inventory (unchanged before/after) | Desktop | Mobile |
| --- | ---: | ---: |
| Scene nodes | 7,290 | 6,420 |
| Unique scene geometries | 1,149 | 1,012 |
| Tracked non-interleaved geometry/instance ArrayBuffer bytes | 42,739,166 | 37,828,677 |
| Renderer geometries / textures | 542 / 104 | 239 / 56 |
| Compiled programs | 79 | 71 |

Approximate JS heap readings ranged 188–286 MB across runs/GC states and do not show
a defensible heap improvement or regression. The cache adds per-node parent/mode
metadata and a cached matrix for externally managed world transforms; no duplicated
geometry or particle-capacity growth was introduced. This is not a long-session
leak audit or a complete texture/render-target VRAM measurement. Interleaved geometry
storage, textures, render targets, and non-scene asset caches are outside that byte total.

## Bottlenecks and implemented changes

1. **Transform invalidation propagated through an unchanged scene.** Explicit world
   queries mark ancestor matrices dirty. The existing cache treated that flag as a
   changed world transform and multiplied thousands of unchanged descendants.
   The running desktop attribution found 4,221 multiplications in that traversal.
   `matrices.js` now distinguishes dirty flags from actual changes, while retaining
   changed-pose and changed-parent propagation. Parent identity and manual/automatic
   mode transitions invalidate the cache. Native explicit query methods are intact.
2. **Particle capacity was resent every frame.** Main particle pools now track their
   occupied extent and upload only the touched slot range. Expiry clears alpha once;
   subsequent empty frames do no uploads. Ring order, lifetimes, velocities, sizes,
   colors and capacity are unchanged (important for normal-alpha smoke). Meteors
   similarly stop resending empty buffers; underwater bubbles submit a live prefix.
3. **Rebuilt foliage lists uploaded unchanged matrices.** Float32-aware slot comparison
   avoids false changes from JS doubles. Only changed slots are marked; pending
   changes are unioned into one bounded component range until Three.js consumes them.
   Culling, shadow selection, LOD thresholds, instance counts and geometry are intact.
   This benefit is workload-dependent: fixed-camera steady runs do not repeatedly
   rebuild foliage lists, so it is not credited for the main table's byte reduction.
4. **Celebration sprite flush could discard unrendered changes.** It previously cleared
   old update ranges on each flush. It now preserves them across skipped renders,
   including wrapped ring writes, using the same bounded range helper.

The buffer helper is project-local, uses r180's `BufferAttribute.addUpdateRange`, and
does not patch engine prototypes in production. Instrumentation exists only in scripts.

## Draw-call findings and deferred changes

The prior fixed-view attribution identified structures and foliage as major submitters
(Low: roughly 94 and 51 calls, respectively). This pass confirms high submission counts
but prioritizes verified CPU/upload waste without changing material appearance.
Remaining matrix work includes per-draw model-view matrices and skeletal updates.

- **Do not blindly apply the skill's shadow-only camera-layer recipe:** installed
  r180 `WebGLShadowMap.renderObject` tests the **main camera's** layers, not the
  shadow camera's layers. That recipe would remove needed shadows. Colorless foliage
  shadow helpers remain unchanged; a separate, verified rendering strategy is needed.
- Building-material merging can change roughness, glazing, emissive windows and
  independent tinting. No speculative batching or material simplification was applied.
- Half-resolution bloom and governor thresholds remain candidates, not changes in
  this pass: applying them alters image quality or runtime quality choices.
- No reduced grass, water detail, animals, effects, animation rates, or shadow density.

## Correctness and visual checks

- Focused Node tests cover pending range union, Float32 equality, slot replacement,
  movement/rotation/scaling, reparenting, hidden/revealed objects, explicit queries,
  manual/automatic matrix transitions, animated skeletons/bind inverses, particle
  expiry/ring reuse, and celebration flushes without an intervening render.
- Final full suite: **411 passed, 0 failed**, including seven new focused checks.
- Matching baseline-control vs optimized screenshots: **0 differing pixels** on both
  desktop (1440×900) and mobile (780×1688 screenshot, DPR 2). The initial before/control
  pair differed 3.942% because the stack-attribution version advanced one extra frame;
  do not interpret that mismatched pair as optimization damage or a deterministic control.
- `scripts/performance-correctness.mjs` exercises four seasons on both configurations
  with forward input, train updates, bursts, fireworks and meteors. For 3,403–4,251
  visible nodes per case: **zero matrix mismatches** against native traversal.
- All eight cases: **zero differing pixel channels** for cached/native world updates
  and selective/full GPU uploads of the same frozen scene. Paddy light wall-clock
  flicker is frozen during comparison, not disabled in the game.
- No page errors in the measurement or seasonal correctness runs.
- Production build passed; Vite still reports its existing large-entry-chunk warning.
- No full story completion, physical-device controls audit, or long-run leak test claimed.

## Reproduce locally

```powershell
npm run dev -- --host 127.0.0.1 --port 5175
# In another terminal; use the browser cache installed on your machine if needed:
# $env:PLAYWRIGHT_BROWSERS_PATH = 'your installed browser cache'
node scripts/performance-review.mjs local
node scripts/performance-correctness.mjs
node --test tests/performance-work.test.mjs
npm test
npm run build
```

Retain the JSON and matched screenshots for future comparisons. Do not compare against
the skill's other-game results or convert CPU work reductions into promised phone FPS.

## Phone pass, 2026-11-12: people and animals out of the camera's view

Low tier, 390x844 at 3x, CPU slowed 8x (the owner's phone is estimated at about that). At Takamori the game's own work
was 36.5 ms a frame (below 30 fps), of which `(program)`/GL submission ~21 ms, the world-matrix pass 4.8 ms and 59
`AnimationMixer.update` calls 5.4 ms, while only 16 skinned meshes were drawn: on a portrait phone most characters in
animation range stand beside or behind the player.

`src/engine/view.js` takes the frustum of the camera that is about to draw, once per drawn frame, and asks the world's
people and animals (`NPC` created with `cull: true`) whether they are outside it. An idle body outside the view and
beyond shadow range hides its `model` (not the root, which other systems lock): no animation (its clock is kept), no
matrix walk, no renderer walk. In view again it is posed with the missed time in the same frame. Margins 4.5 m to hide,
3 m to show. `?view=off` (and `game.view.enabled = false` at run time) restores the old behaviour.

| Interleaved A/B, 10 pairs, null control 0.1-0.3 ms | off | on | change |
|---|---:|---:|---:|
| Takamori JS per frame | 28.0 ms | 24.6 ms | -3.4 ms (12%) |
| Kawabe JS per frame | 22.4 ms | 19.5 ms | -2.9 ms (13%) |

Mixer updates per frame 59 -> 24 (Takamori) and 33 -> 6 (Kawabe); matrix-pass nodes at Takamori 2,460 -> 1,501;
draw calls unchanged. Checked by `tests/view.test.mjs` (margins and every exclusion) and `tests/view-browser.mjs` (a
360-degree camera sweep on a phone and a wide screen: nobody within reach of the real frustum is ever hidden; up to 45 of
154 are hidden at once).

Measured and found small, so not worth a change: `Skeleton.update` + bone texture upload 0.3 ms, bloom ~0 ms of JS,
shadow pass 0.6 ms (desktop GPU; phone GPU cost unmeasured). What is left at 8x is flat: GL submission for ~160 draws
(~100 us each), the matrix pass 2.6 ms, `projectObject` 3 ms. The next candidates are the cell grid for static
structures (docs/codex/CELL-GRID.md, est. 1-2 ms), the 62 program switches a frame (distinct materials) and the three
point lights' uniforms uploaded for every lit program.
