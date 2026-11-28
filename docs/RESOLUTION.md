# Render resolution on PC

© 2026 Bui Cong Nguyen · solluxlabs.com

Written 2026-11-28 (branch `pc-resolution`) after the owner said: "On PC I still feel the resolution is a little low."
Code: `src/engine/resolution.js` (pure), `src/engine/renderer.js` (`resize`, `setResolutionMode`, `applyLevel`),
`src/engine/governor.js` (`governorFor`, `LADDER_PC`), Settings row in `index.html` + `src/ui/ui.js`.
Tests: `tests/resolution.test.mjs`, `tests/governor-desktop.test.mjs`. Measuring tool: `tests/perf/resolution-perf.mjs`.

## 1. What the owner's PC got before

The PC: RTX 4080 SUPER, Windows reports one 1920×1080 display at 100 % scaling (96 DPI), 60 Hz. Chrome names the chip
`ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 SUPER ...)`, so the first pick (`quality-pick.js`) is **High** (STRONG and
ULTRA), unless a tier was saved in Settings (Light mode saves Low).

High drew at `min(devicePixelRatio, 2)` capped at 5.0 M pixels. On a 1920×1080 screen at DPR 1 that is already the
screen's own resolution (2.07 M), so the cap was not the problem there. Three things lowered it:

1. **The governor took resolution first.** The desktop ladder's first two steps were 85 % and 72 %, taken after two
   2-second windows with a median frame over 38 ms (or three with a 95th percentile over 62 ms). A GPU shared with
   another job (ACE-Step, Blender, other browser suites) gets there easily. A climb back that had to be taken back
   within 30 s locked the lower step **for the rest of the session**, and climbing needed five calm windows per step
   (a 30 s busy spell: down to 62 %, full resolution again only after ~100 s; see the trace in 4.).
2. **Cinematic and mini game floors hit the PC too.** `setFloor(2)` (the arrival flight, the scene tour) and the
   round-light floor (every trick and yard round, the Mini games menu plus 20 s after) were meant for the Low tier but
   were applied on every tier. On the desktop ladder level 2 is the 72 % step: **every mini game on a PC ran at 72 %.**
3. **Larger screens were capped.** 4K at 100 % (8.3 M) and 4K at 150 % (2560×1440 CSS × 1.5) drew at 78 %; a MacBook at
   DPR 2 at 96 %.

And at 100 % of a 1080p screen, thin things (sign letters, fences, far trees, faces) still step and shimmer: MSAA only
smooths triangle edges.

## 2. What it does now

**Settings > Resolution: Auto · Sharp · Balanced** (one flat row of three, 44 px tall, under Graphics; saved per device
in `starline-res`; `?res=` for one page). Under it a live line: `Render 3840×2160 · 200 % · High` (drawing buffer, its
share of the screen's own pixels, tier). The performance report has a `render:` line and the chip's name.

| Mode | Phones, Low, Medium, High on an ordinary card | High on a strong desktop card (ULTRA: RTX 3070+, 4060+, RX 6700+, M3+) |
|---|---|---|
| **Auto** (default) | the tier's caps as before | the screen's own pixels; on a screen smaller than 4K with DPR under 2, **supersampled** up to 2× and 4K-class (1080p → 3840×2160, 1440p → 3840×2160) and scaled down by the browser |
| **Sharp** | the screen's own pixels (up to 4K-class), never lower | as Auto, and the governor never touches the resolution |
| **Balanced** | the tier's caps as before | the caps and the governor as before 2026-11-28 (pixels first) |

The governor on a desktop (Auto, Medium/High, not a phone) — `LADDER_PC`:

| Step | What goes | Steps down when the median frame is over |
|---|---|---|
| 1 | supersampling (back to the screen's own pixels) | 20 ms (under 50 fps) |
| 2 | shadow map half size, redrawn every other frame | 25 ms (under 40 fps) |
| 3 | lighter glow (3 blur levels) | 25 ms |
| 4 | 2× MSAA | 25 ms |
| 5 | people, props, buildings drawn 75 % as far | 25 ms |
| 6 | **85 %** | 38 ms (under 26 fps) for **5 windows** (~10 s) running; hitches alone never |
| 7 | no MSAA, 55 % distances, shadows every 3rd frame | 25 ms |
| 8 | **72 %** | 38 ms for 5 windows |

Climbing back needs 2 calm windows (~4 s) instead of 5; a regretted climb holds the lower step for 90 s, not for good.
Floors (`setFloor`, round-light) apply to the Low tier and phones only. Phones and Balanced keep the old ladders and lines
exactly (`governorFor`). The Advanced "Render resolution" percentage still works and now means a share of the screen
(no supersampling); choosing a Resolution mode sets it back to Automatic. Clearing it no longer leaves the old fixed
scale behind.

When the picture is supersampled the glow blurs at the screen's size (`bloomSize`), so lamps glow as far on screen as at
the screen's resolution (without it the halo shrank to half). GL lines (1 px: lantern strings, rope, meteor trails)
become thinner and lighter at 2×, as on a Retina screen.

## 3. Numbers (RTX 4080 SUPER, Chrome 149 headless, D3D11, vsync off, High, governor held)

`GAME_URL=... node tests/perf/resolution-perf.mjs --scene=kawabe|show --views=...` — one page per view, arms switched in
the page, 8 interleaved cycles of 1 s. GPU = `EXT_disjoint_timer_query_webgl2` around the whole frame (shadow map,
scene, bloom, grade, output); "rise" = the paired median against `old` in the same cycle; `null` = `old` again (noise).
Frames are CPU-bound on this machine (5–8 ms, 125–190 fps uncapped) at every resolution, so the frame time does not
move; the GPU time is what the pixels cost.

Kawabe (Explore, summer noon, playground and river):

| View | Arm | Drawn | % of screen | Frame p50 | GPU p50 | GPU rise |
|---|---|---|---:|---:|---:|---:|
| 1920×1080 | before = native | 1920×1080 | 100 | 6.1 ms | 2.46 ms | 0 |
| 1920×1080 | **after (Auto): 2×** | 3840×2160 | 200 | 6.0 ms | 4.67 ms | +2.56 ms |
| 1920×1080 | 1.5× | 2880×1620 | 150 | 5.9 ms | 3.34 ms | +0.85 ms |
| 1920×1080 | governor 85 % / 72 % | 1632×918 / 1382×777 | 85 / 72 | 5.7 / 5.9 ms | 2.36 / 2.31 ms | −0.10 / −0.22 ms |
| 1920×1080 | null | 1920×1080 | 100 | 6.4 ms | 2.59 ms | +0.17 ms |
| 2560×1440 | before = native | 2560×1440 | 100 | 5.4 ms | 2.58 ms | 0 |
| 2560×1440 | **after: 1.5×** | 3840×2160 | 150 | 5.6 ms | 4.20 ms | +1.69 ms |
| 3840×2160 | before | 2981×1677 | 78 | 5.2 ms | 4.42 ms | 0 |
| 3840×2160 | **after: native** | 3840×2160 | 100 | 5.6 ms | 4.11 ms | +1.23 ms |
| 2560×1440 @1.5 | before | 2981×1677 | 78 | 6.0 ms | 3.47 ms | 0 |
| 2560×1440 @1.5 | **after: native** | 3840×2160 | 100 | 5.8 ms | 4.38 ms | +1.23 ms |

Hoshi Station at night, Sing & Play with the group of 8, the show effects on (beams, LED walls), a fixed camera in front
of the group, the song re-seeked to its first chorus for every arm:

| View | Arm | Drawn | % of screen | Frame p50 | GPU p50 | GPU rise |
|---|---|---|---:|---:|---:|---:|
| 1920×1080 | before = native | 1920×1080 | 100 | 7.9 ms | 5.45 ms | 0 |
| 1920×1080 | **after (Auto): 2×** | 3840×2160 | 200 | 7.9 ms | 7.12 ms | +1.82 ms |
| 1920×1080 | 1.5× | 2880×1620 | 150 | 7.8 ms | 6.26 ms | +0.88 ms |
| 1920×1080 | null | 1920×1080 | 100 | 7.6 ms | 5.46 ms | −0.10 ms |
| 2560×1440 | before = native | 2560×1440 | 100 | 7.0 ms | 5.40 ms | 0 |
| 2560×1440 | **after: 1.5×** | 3840×2160 | 150 | 6.9 ms | 6.43 ms | +1.23 ms |
| 3840×2160 | before | 2981×1677 | 78 | 7.5 ms | 5.81 ms | 0 |
| 3840×2160 | **after: native** | 3840×2160 | 100 | 7.7 ms | 6.79 ms | +0.96 ms |
| 2560×1440 @1.5 | before | 2981×1677 | 78 | 7.1 ms | 5.77 ms | 0 |
| 2560×1440 @1.5 | **after: native** | 3840×2160 | 100 | 7.4 ms | 6.75 ms | +0.97 ms |

Every "after" frame keeps more than half of a 60 Hz frame free on the GPU (worst: 7.1 ms of 16.7). On a GPU shared
with another job that headroom shrinks; the governor then gives the supersampling up first (section 2).

The resolution steps below native buy almost nothing on this card (72 % saves 0.2 ms of a 2.5 ms GPU frame): the GPU
time is mostly the 4096 shadow map and the geometry, which is why the cheaper looks now go first.

**Picture quality** (`.tools/res/`, not committed): the same paused frame drawn at each ratio, shown at the screen's
size the way the browser does (bilinear), against a reference drawn at 3× and box-filtered. PSNR, 1080p Kawabe:

| | whole frame | sign | scoreboard | far trees | fence | house |
|---|---:|---:|---:|---:|---:|---:|
| 72 % | 30.9 | 25.1 | 34.3 | 30.9 | 33.5 | 25.5 |
| 85 % | 32.3 | 26.0 | 36.9 | 32.4 | 34.7 | 27.4 |
| native (before) | 34.1 | 30.4 | 41.2 | 35.0 | 38.8 | 30.2 |
| 1.5× | 39.4 | 33.8 | 46.3 | 39.1 | 40.6 | 36.2 |
| **2× (after)** | **44.4** | **38.9** | **52.5** | **44.4** | **46.1** | **41.9** |

+10 dB is a tenth of the error: the sign's letters, the fence rails and the far tree crowns stop stepping. The show at
1080p (faces at about 8 m): native 38.1 → 2× 48.4 dB over the frame, Kotone's face and microphone 33.5 → 45.2 dB (at
native the microphone's grip and her tie shimmer as a checkerboard; at 2× they are solid).

**Contrast-adaptive sharpening** (FidelityFX CAS, sharpen only) was tried offline on the 85 % and 72 % frames before
anything was added: at its lightest it gives back most of the lost edge contrast (mean gradient 10.3 → 12.1 at 72 %,
native 12.6) with PSNR unchanged (30.9 → 30.9); stronger settings over-sharpen (PSNR −1.3 to −1.8 dB). Since a PC on
Auto or Sharp now draws below native only after a long slow stretch, it was **not added**; worth it only if Balanced on
a 4K screen (78 %) becomes common.

## 4. The shared GPU, simulated (`Governor` fed 45 ms frames for 30 s, then 60 fps)

| | lowest resolution | full resolution again after |
|---|---:|---:|
| before (LADDER_DESKTOP) | 62 % | 101 s |
| after (Auto, supersampled 1080p) | 85 % (reached at 30 s, as the spell ended) | 55 s, supersampling included |

A 12 s spell: before 72 % and back after 42 s; after never below native, all back after 24 s. 30 fps steady: before
nothing changed (under the 38 ms line); after the supersampling and the cheaper looks go, native stays.

## 5. Phones

Unchanged: Auto and Balanced give Low and Medium on a phone the same ratio as before for every size and governor scale
(tested in `tests/resolution.test.mjs` against the old formula), the Low ladder and its 31 ms line are the same, and
the floors still apply there. Only an explicit **Sharp** on a phone draws its own pixels (a 390×844 @3 phone: 1170×2532).
