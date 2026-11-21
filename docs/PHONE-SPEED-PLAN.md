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
