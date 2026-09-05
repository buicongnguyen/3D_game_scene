# Repository review and improvement plan

Reviewed September 5, 2026. Existing local Season Tour look smoothing and adjustable
duration changes are preserved. `index.txt` is an unrelated untracked file.

## Findings and implemented fixes

| Priority | Finding | Change |
| --- | --- | --- |
| High | FPS used simulation delta capped at 50 ms, so actual rates below 20 FPS were misreported. Pausing produced inflated readings. | Measure real elapsed time with a fixed-size sample buffer; use wall time for adaptive-quality checks. |
| High | Every Season Tour frame called `setDaylight`, invalidating cached shadows even throughout a stable day/night chapter. | Cache the last applied daylight value; initialize uniforms on the first call and invalidate only when the value changes. |
| High | Manual daylight animation and Season Tour both wrote daylight; manual seasons could disagree with the active chapter. | Manual season/daylight choices switch to Default cinematic mode before applying the selection. |
| Medium | Holding P/F repeatedly toggled pause/flight; global shortcuts also intercepted settings controls. | Ignore repeat toggles and events originating in editable controls/buttons. Associate slider labels. |
| Medium | Hidden pages could accumulate elapsed time/input and distort adaptive quality. | Skip rendering hidden pages, clear held input and reset timing samples when visibility changes. |
| Medium | A worker that never returned could leave loading pending indefinitely; result size was unchecked. | Add timeout, message decoding/error handling, buffer validation and cleanup before fallback. |
| Medium | Pages uploaded the entire checkout, without testing or building. | CI runs locked dependency installation, tests and Vite build; publishes only `dist`. Relative asset URLs support repository Pages paths. |
| Medium | Timing rules were embedded in a large page and had no regression checks. | Extract browser-independent timing policy into `scene-timing.mjs`; test low FPS, duration boundaries and multi-cycle retiming. |

## Executed plan

1. Inspect current edits, rendering loop, tour/manual controls, terrain worker and deployment.
2. Fix the demonstrated logic faults above while preserving the scene and existing edits.
3. Introduce a small independently testable module rather than moving tightly coupled code wholesale.
4. Add regression checks and make deployment run them before publishing a built artifact.
5. Run tests, production build and whitespace checks; record remaining work explicitly.

## Recommended next passes

These are additional projects, not claims of completed work:

1. **Share terrain math between worker and fallback.** Noise, river and village
   shaping formulas are duplicated. Extract a pure terrain generator, then compare
   worker/fallback heights for fixed seeds, river edges and both villages before
   replacing either path. This is especially important given previous river gaps.
2. **Separate scene systems.** Move CSS, then configuration, recording, input,
   seasonal effects and renderer orchestration into modules with explicit init,
   update and dispose interfaces. The empty `script.js` and unused `style.css`
   are confusing leftovers; document ownership before removing legacy files.
3. **Unify animation clocks.** Manual daylight uses its own animation callback,
   unlike simulation time; pause still does not freeze every effect. Use a single
   simulation clock, with explicit UI/recording clocks, and verify pause/resume.
4. **Profile real devices.** Record frame-time distributions and GPU render passes
   for five quality presets, eight tour chapters and a full train crossing. Compare
   grass, transparency, water reflections and shadow passes separately. No measured
   device FPS improvement is claimed by this source review.
5. **Reduce rebuild spikes.** Quality changes synchronously rebuild several
   populations and targets. Stage work over multiple frames, retaining valid old
   resources until replacements are ready; test rapid preset changes and disposal.
6. **Add types incrementally.** Start with JSDoc/checkJs or TypeScript for extracted
   settings and system interfaces. TypeScript helps correctness, not GPU performance;
   converting the whole inline script first would obscure behavioral changes.

## Verification and limits

`npm test` covers timing regressions. `npm run build` validates imports, worker
bundling and production output. The workflow configuration is prepared locally;
it has not been executed on GitHub in this pass. Browser visual regressions and
physical mobile performance remain unverified. Three.js is still loaded through
the existing CDN import map, so this is not an offline bundle.
