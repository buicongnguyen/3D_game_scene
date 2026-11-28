# Show effects (Sing & Play and the Night Star, 2026-11-28)

Owner (2026-11-28): show effects in Sing & Play, day and night, beat-synced and phone-cheap: a small festival stage set,
spotlight beams at night, colour washes per section, chorus bursts (confetti at night; petals, bubbles and balloons by
day), fireworks on the last chorus at night, audience glow sticks on the beat, laser fans on dance-song drops, a soft
haze; "use optimized algorithms: search the internet for the best algorithms". Every piece is faked: no three.js lights,
no extra render pass, no post effect. A **Show effects: On / Off** switch sits in the idle bar (owner rule: every costly
feature can be switched off in the game).

## Files
- `src/game/perform/show-cues.js` (pure): the wash per section (eased over a beat), the beat pulse, the cue plan (bursts,
  fireworks, laser windows), the burst slots, what a device draws (`showItems`, `showDraws`), the switch's key and default.
- `src/fx/show-fx.js`: `ShowFX` (the stage set, glow cards, beams and lasers, bursts, glow sticks; the watchers' beat
  clips), `buildStage` (the set's geometry), `stageSize`.
- `src/game/singplay/singplay.js`: the switch (`spShow`, `starline:singplay:showfx`), start / update / stop with the song.
- `src/game/nightstar/night-star.js`: the Night Star's show uses the same effects (docs/NIGHT-STAR.md).
- `tests/show-fx.test.mjs` (cues, budget rule, the set's triangle budget), `tests/perf/show-perf.mjs` (the in-page A/B
  with a null control and the fill count).

## What each effect is (draw calls: one each)
| effect | how | draws | when |
|---|---|---|---|
| stage set | ONE opaque mesh (~2.3k triangles): two truss towers with LED pillars, a top truss with 7 paper lanterns and 4-6 spot cans. Colour in the vertices (rgb + a material code in alpha); the LED dots and climbing bars, the lantern glow and the lenses come from the wash and the beat in its fragment shader; it unfolds (towers rise, the truss extends from the middle, lanterns and cans pop in, ease-out-back) in its vertex shader from one uniform. Towers stand on their own ground (hillsides). | 1 | always (on) |
| glow cards | ONE additive instanced draw of a quad: the ground wash (flat, tilted to the slope), a floor spot where each beam meets the ground (the beam's own aim maths in the vertex shader), a lens glow per can, a faint haze card behind the group at night (faded when the camera is within 2.5-6 m). Procedural falloffs, no texture. | 1 | always (night: haze, spots, lenses) |
| beams + lasers | ONE additive instanced draw of a 12-sided open cylinder: a beam is a cone from its can, sweeping in mirrored pairs (a full swing every 2 bars, a brightness pulse on each beat), edge-soft by the view angle (`pow(|n·v|, 2.2)`), quadratic fade along its length, a fade at the camera and an analytic fade into the floor (height over the stage's ground: no depth texture). A laser is the same instance kind 1: the cone collapsed to a camera-facing ribbon, kept 1.5 px wide at least (its brightness scaled down by the same ratio, so it adds the same light and never shimmers). | 1 | night (lasers: dance-song choruses, the last chorus) |
| bursts | ONE instanced draw of a quad, 192 (Low) / 480 (PC) particles in 4 burst slots; the position of every particle is a pure function of song time and its seed in the vertex shader (ballistic lift, analytic drag toward a drift velocity, flutter), so the CPU writes 8 uniforms a frame and uploads nothing. Night: confetti (half from cannons on the tower tops, half showered from the truss, tumbling); day: petals, soap bubbles (rim, highlight, a rainbow tint), balloons. Dead particles collapse to a point outside the view (no `discard`). | 1 | every chorus opens with one, a long chorus gets a second at its middle bar, the closing cheer one |
| glow sticks | ONE `InstancedMesh` of the dance game's `light-stick.glb` (handle + glowing head, one geometry, ×1.7 so it reads at concert distance) in each watcher's `grip_R` (their hand's matrix written after their own pose this frame: no lag). The watchers play the dance game's crowd clips (`villager-*-dance`: 34 KB each) with the clip time set from the song's beat before their mixer runs: `StickWave` (left on one beat, right on the next) at night, `Clap` on the beat by day. | 1 | night, with watchers |
| fireworks | the valley's own (`fx/fx.js fireworks`, its spark pool) 45 m behind the stage | +1 while they fly | the last chorus to the end, night |

All of them read one shared set of uniforms (song time, beat sweep, pulse, wash, level, night, unfold); the CPU's work a
frame is those uniforms and up to 12 stick matrices. Shaders are compiled when the mode starts (`ShowFX.warm`:
`compileAsync` against the scene's fog and the frame's HDR target), not at the first chorus.

**Cues from the song clock** (`perform/beat-clock.js`): the wash by section (verse blue, pre-chorus violet, chorus and
drop pink, bridge, intro and outro gold), the level by the section's energy (0.35-1), the pulse `exp(-5 x beat phase)`
(downbeats 1.25), the sweep `beat x pi/4`. The performer's song time already follows the audio clock with a 0.35 s time
constant (performer.js), so the lights never drift from the music. **Day vs night**: the valley's own `night` (0..1)
from the shown hour: beams, haze, lasers, confetti, fireworks and sticks from 0.5 (about 19:00).

## Research (2026-11-28) and what was applied
Sources opened during the research step (full list with notes in the skill reference
`~/.claude/skills/lightweight-game-objects/references/show-lighting.md`):

| topic | finding | applied / rejected |
|---|---|---|
| fake volumetric cones | threex.volumetricspotlight (open cone, `pow(|normal.z|, anglePower)`, distance attenuation, additive, no depth write; John Chapman's "Good Enough Volumetrics" minus soft particles) [github.com/jeromeetienne/threex.volumetricspotlight]; drei `SpotLightMaterial` (the same, optional depth fade with a depth texture) [github.com/pmndrs/drei src/materials/SpotLightMaterial.tsx]; Unity Volumetric Light Beam SD (the mobile path: additive, side softness, camera near fade, "low precision Z buffer on mobile: glitches" with depth fade; 18 sides x 4 segments) [saladgamer.com/vlb-doc/comp-lightbeam-sd] | **applied**: open cone, `|n·v|` with the world view vector (better off screen-centre than `normal.z`), quadratic length fade, camera fade, an analytic floor fade instead of a depth fade; 12 sides x 1 segment (narrow, short cones). |
| soft particles | NVIDIA's soft particles (Lorach 2007): reading the depth buffer as a texture cost 60 % fps in their test; GPU Gems 3 ch. 23 (off-screen low-res particles) [developer.download.nvidia.com/whitepapers/2007/SDK10/SoftParticles_hi.pdf; developer.nvidia.com/gpugems/gpugems3 ch. 23]; three.js needs a separate depth pass (Mugen87) [discourse.threejs.org/t/soft-particles-rendering-performance/27610] | **rejected** a depth texture (an extra full scene pass on an 8x slower CPU, and tile GPUs reload the depth from memory). Fades against the known stage floor instead. |
| GPU-only particles | SHOPS stateless particles (pos = p0 + v t + 1/2 a t^2 in the vertex shader) [gist.github.com/VirtuosoChris/6e0d163e76a8d42fd7b5084d2e24cdfc]; three r91 GPUParticleSystem (unborn particles size 0, frustumCulled off) | **applied**: positions from song time and a static seed, 4 burst slots in a uniform array, analytic drag; dead particles collapsed (no `discard`); `frustumCulled = false` and the mesh hidden when no burst flies. |
| overdraw on tile GPUs | Imagination: never `discard` on PowerVR, blend only where needed, fit sprites tightly [docs.imgtec.com ... do-not-use-discard; efficient-sprite-rendering]; Arm: average overdraw over ~2.5x is "too much" [developer.arm.com ... mali-graphics-debugger case study]; Apple WWDC19: opaque first, translucent later, never draw invisible meshes [developer.apple.com/videos/play/wwdc2019/606]; Android: transparency layers are the cost [developer.android.com/games/optimize/materials] | **applied**: no `discard` or alpha test in any effect, additive with no depth write, narrow short cones, a small haze card faded near the camera, effects drawn only while they show (a hidden mesh, not a zero alpha). Measured fill below. |
| InstancedMesh vs BatchedMesh | BatchedMesh: different geometries, one material, per-object culling and sorting on the CPU each frame; without `WEBGL_multi_draw` (about 11 % of Android) a loop of draws [threejs.org/docs BatchedMesh; web3dsurvey WEBGL_multi_draw; forum: "a single geometry: always InstancedMesh"] | **InstancedMesh / InstancedBufferGeometry** for every pool (one geometry each). BatchedMesh rejected: nothing here needs mixed geometry, and its per-frame CPU culling is the wrong trade on a slow phone. |
| thin lasers | `LineBasicMaterial.linewidth` is always 1 px in WebGL; `LineMaterial` (Line2) `discard`s for caps and dashes and is a draw per line [threejs.org/docs LineBasicMaterial, LineMaterial; r187 source] | **applied**: camera-facing ribbons in the beams' own draw, held at 1.5 px minimum with the brightness scaled by true width / drawn width (Persson's wire antialiasing idea). Line2 rejected. |
| glow / haze | UnrealBloomPass is 13 draws and 11 targets a frame [r187 source]; Arm + Nordeus: billboards and baked glow under 1 ms where bloom cost ~3 ms [developer.arm.com ... post-processing-effects-on-mobile] | **applied**: the game's existing bloom catches the LED, lanterns and lenses (HDR > 0.92); one haze card, no new pass. |
| beat sync | web.dev "A tale of two clocks": draw in rAF, read time from the audio clock [web.dev/articles/audio-scheduling]; media element `currentTime` is coarse [MDN] | **already there**: the performer's clock follows the `<audio>` time softly (0.35 s), the effects read that clock. |
| three.js r18x | `forceSinglePass` for double-sided transparent (else two passes); ShaderMaterial fog needs `UniformsLib.fog`; `compileAsync` with the target scene for its fog [threejs.org/docs Material, ShaderMaterial, WebGLRenderer] | **applied** all three; additive fog darkens instead of mixing in fog colour (`rgb *= 1 - fogFactor`). |

**Found on the way (a pitfall for the skill):** `pow(x, y)` of an interpolated varying that is 0 at a silhouette came out
a hair below 0 on some fragments (ANGLE / D3D11), `pow` of a negative is NaN, and the HDR bloom spread that one NaN over
the whole picture (a flat dark screen). Clamp before `pow`.

## Measured
`node tests/perf/show-perf.mjs` on a built preview (Chromium + GPU, this PC shared with other jobs), Sing & Play at the
station (or as noted), the song from its first chorus, the governor held. ONE page; per cycle the arms run in turn and
re-seek the song: **off** (not updated, not drawn), **on**, **null** (off again: the noise floor). Paired rise = the
median over cycles of (arm - off) in the same cycle. Draws: every draw call a frame, shadow pass included. fx JS: the
effects' own update a frame (uniforms, sticks, cues).

| tier, view | cycles | draws off -> on | paired p50 rise on (null) | fx JS a frame |
|---|---|---|---|---|
| Low 390x844, 4x CPU, night, Solo, fixed camera | 30 | 121.4 -> 125.9 (+4.5) | +0.7 ms (null +0.8) | - |
| Low, 4x CPU, night, group of 4, orbiting camera | 30 | 123.1 -> 128.3 (+5.2) | +0.4 ms (null +0.3) | - |
| Low, 4x CPU, night, group of 8 (the Low + 8 rule: stage, bursts, sticks) | 24 | 130.0 -> 132.9 (+2.9) | +0.3 ms (null -0.2) | 0.079 ms |
| Low, 4x CPU, day (12:00), group of 4 | 24 | 127.6 -> 130.3 (+2.7) | +1.3 ms (null +1.0) | 0.153 ms |
| PC High 1280x720, no throttle, night, group of 8 | 24 | 470.2 -> 472.4 (+2.2) | +0.1 ms (null +0.3) | 0.013 ms |

Every rise is within its null control's swing (the largest gap over the null: +0.5 ms, Low with 8): under the
+1 ms p50 line on Low at 4x CPU. The effects' own JS is 0.08-0.15 ms a frame at 4x (0.013 ms on PC): uniforms and a
few matrices. Draws: +2.7 to +5.2 a frame on Low (inside the 6-8 asked; with 8 on Low the rule keeps it at +3: the
station's Low budget 87 + 3 = 90 of 91).

**Fill** (the effects' own fragments a screen pixel, averaged over the frame, mid-chorus; depth-tested against the scene
= what the GPU shades, and raw = no depth test, the upper bound):

| view | beams | glow cards (ground, spots, lenses, haze) | stage set | bursts | all, depth-tested |
|---|---|---|---|---|---|
| Low, Solo, fixed 7.5 m | 0.18 (raw 1.17) | 0.23 (raw 0.51) | 0.09 | 0.00 | **0.50** |
| Low, group of 4, orbit | 0.18 (raw 0.48) | 0.31 (raw 0.32) | 0.06 | 0.00 | **0.55** |
| PC, group of 8, fixed | 0.20 (raw 0.57) | 0.31 (raw 0.35) | 0.07 | 0.00 | **0.58** |

About half an additive layer a pixel in all: the beams are narrow and short, the haze card small and faded near the
camera, and the scene in front hides much of them (the raw counts are 2-3x higher). The bursts are a few thousand
pixels (small quads). Fireworks are the valley's own pool (unchanged).

**Night Star at the shrine** (docs/NIGHT-STAR.md): Low (390x844) 50-72 draws a frame during her show with the group of
4 and the effects (62 standing there before it); PC High 119-121 (143 before).

**Pictures** (.tools/show/final/, local): PC and phone, day and night, mid-chorus; the last chorus at night with 8
(lasers, fireworks); the idle bar on a phone and on PC; the Night Star's show on PC and phone, its end and the unlock.

## The switch
**Show effects: On / Off** in the Song row of the idle bar (after Lyrics; flat, 44 px on phones, text 13 px; the row
scrolls sideways on a phone as before; hidden with the setup rows while a song plays), remembered per device in
`starline:singplay:showfx`. Default: **On** on every device, weak phones included (measured: the rise stays inside the noise on Low at 4x CPU, the effects' JS is ~0.1 ms, and the Low tier already draws fewer beams and burst particles; with 8 on Low the fill-heavy effects drop out by rule). `?showfx=off|on` for measuring.

## Open
- The glow sticks need watchers: Town Life's people go home at night by the shown hour, so in deep night (21:00+) nobody
  comes to watch (and no sticks wave); in the evening (19:00-20:00) they do. A festival crowd of its own would cost a
  draw or two a person.
- Real-phone numbers (the "Copy performance report" from two or three phones) would confirm the 4x-CPU measurements.
