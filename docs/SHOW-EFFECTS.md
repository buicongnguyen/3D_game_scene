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
- `src/fx/stage-uplight.js`: the stage light on the performers at night (footlights, stage fill, rim; below), patched
  into the VRoid atlas material by `src/engine/assets.js` (one line).
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
| stage light on the performers | footlights along the stage front (glowing fixtures in the stage set's mesh), the light they throw on the performers and a stage fill (a term in the performers' own shader: `fx/stage-uplight.js`), a warm pool on the ground (in the ground wash's card) and the footlights' spill (one more card). See "Stage light on the performers" below. | 0 | night only: none from morning to the end of Sunset (19:00), full from about 20:10; Show effects On |

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

(The glow cards' numbers here were taken while their ground kinds were culled by mistake: see "Stage light on the
performers" below for the fix and the fill with them.) About half an additive layer a pixel in all: the beams are narrow and short, the haze card small and faded near the
camera, and the scene in front hides much of them (the raw counts are 2-3x higher). The bursts are a few thousand
pixels (small quads). Fireworks are the valley's own pool (unchanged).

**Night Star at the shrine** (docs/NIGHT-STAR.md): Low (390x844) 50-72 draws a frame during her show with the group of
4 and the effects (62 standing there before it); PC High 119-121 (143 before).

**Pictures** (.tools/show/final/, local): PC and phone, day and night, mid-chorus; the last chorus at night with 8
(lasers, fireworks); the idle bar on a phone and on PC; the Night Star's show on PC and phone, its end and the unlock.

## Stage light on the performers (night, 2026-11-28)
Owner: "In the night, maybe we need to add light from the ground to shine up on their bodies and faces ... or make their
performance area lit so we can see their faces." The effects above light the scene but not the people: at night the
performers stood dark against the show (face luminance ~20 of 255 in every shot). Now three terms light them, still with
no three.js light (a light recompiles every lit material and costs every fragment of the valley), no draw and no program:

| term | what | look |
|---|---|---|
| key (footlights) | toward a line of footlights on the ground 1 m in front of the front-most performer; the light seems to come from a little higher for a higher point (source height 0.12 m + 0.45 x the point's height): grazing on the legs, front-below on the face, never a floor light from straight under the chin; soft wrap (0.3), falloff 1 / (1 + (d / 2.2 m)^2) and to 60 % at head height; nothing on the back | warm white (1, 0.86, 0.72) with 14 % of the section's colour, x2.4, +10 % on the beat |
| fill (the stage area) | from the audience and above, half-Lambert squared (the body keeps its shape, nothing on the back), faces x1.22 (the face mask of actors/face-look.js; their bent normals make it one soft surface) | warm (1, 0.9, 0.8) with 10 % of the section's colour, x0.45 |
| rim | `(1 - n.v)^3` on the side toward the stage front | the section's colour (verse blue, chorus pink, bridge gold), x1.4 scaled by the section's energy |

All three only inside the formation's area (a box round the members, 0.85 m past the outer ones, a 0.7 m soft edge, from
the feet to above the hair): watchers and villagers are outside it (and wear other materials); a VRoid visitor elsewhere
in the valley is never lit. Night only (`uplightNight`: 0 up to night 0.65 = the sun on the horizon at 19:00, the end of
Sunset; full at 0.95, about 20:10; see "Not by day" below), Show effects On only, in and out with the stage set's unfold
and fold. Solo, 4 and 8, the lead, both rows'
joined meshes, the Night Star and her group: everyone on the stage.

**A visible source.** Footlights stand on the ground along the stage front (3-9 by the stage's width, each on its own
ground): a dark housing and a warm lens in the stage set's own mesh (material code 0.25 in the vertex colour's alpha; 24
triangles each, the set 2.4-2.9k of its 3.2k budget), the lens glowing with the light (and the beat) at night. On the
ground: a warm pool in the ground wash's own card (the same card, one layer of fill) and the footlights' spill (one more
card in the glow draw). Low with 8 has no glow cards (the budget rule): the performers are lit, the ground is not.

**How (src/fx/stage-uplight.js).** `patchUplight` chains onto the VRoid atlas material when it loads (engine/assets.js,
after face-look's patch; program key `...|face-look|uplight`): the terms are in the people's program from its first
compile, so nothing compiles at a show or at nightfall, and the rows' joined material (game/perform/row-merge.js) gets
them through its own-hook chain. The fragment shader adds `area * E * BRDF_Lambert(diffuseColor.rgb)` to the direct
diffuse after `lights_fragment_end`; the world position and normal come from three's own `vViewPosition` and `normal` and
the view matrix (no vertex shader change, no varying). Seven shared uniforms (`UPLIGHT`): the stage frame and area (set at
a show's start), the strengths and colours (a vec4 and three colours a frame). One uniform test (`k.x + k.y + k.z > 0`)
skips everything by day and with the effects off. The show whose light it is owns it (`uplightStart` / `uplightUpdate` /
`uplightStop`: the Night Star and Sing & Play each keep a ShowFX). Switches: `?uplight=off` (not patched, no footlights:
the before pictures), `?uplight=key|fill|both`, `ShowFX.light.mix` (probes, the A/B).

**Balance (picked: both).** Face luminance (0-255, the lead's face patch, mid-chorus at 21:30, the station), main's code
vs this branch, and this branch's terms one at a time (PC, group of 4):

| shot | before (main) | uplight only (key + rim) | fill only | both |
|---|---|---|---|---|
| PC, 4, wide | 17 (27) | 68 (75) | 43 (51) | **81 (88)** |
| PC, 4, medium | 20 (24) | 83 (77) | 51 (50) | **96 (88)** |
| PC, 4, close (the lead) | 22 (25) | 84 (79) | 53 (52) | **98 (92)** |
| PC, 4, low hero | 26 (26) | 107 (88) | 63 (55) | **121 (100)** |

(the lead's face, in brackets the mean over every visible face). Both, the other shots, before -> after: phone 4 wide
17 -> 69 (24 -> 86), medium 22 -> 97 (31 -> 118); phone solo medium 22 -> 96, close 22 -> 94; PC solo medium 34 -> 104,
close 24 -> 95; PC 8 wide 18 -> 80 (42 -> 99), medium 21 -> 99 (36 -> 96: the back row lit too); phone 8 wide 17 -> 72
(27 -> 90); Sunset (18:00, the light at ~0.2) PC wide 75 -> 79, close 90 -> 95, phone medium 91 -> 95: a hint only, the
low sun already lights them.

Uplight only gives the anime stage look (warm front-below light, bright legs) but the faces stay a little dim and the
back row dark; fill only is even but flat and dim; both lights the faces clearly in wide, medium and close shots while
the key's direction and the rim keep the shape. No clipped skin (hot pixels 0 on faces), skin not orange (the warm
white key stays near neutral after the night grade), no bloom on the white dresses (under the 0.92 threshold).

**Found on the way: the ground cards were never drawn.** The glow cards' ground kinds (the ground wash and the beams'
floor spots) laid a `PlaneGeometry` on the ground by mapping its y to z, which turned its front face down: the
single-sided material culled it from every camera above the ground. Fixed (z = -y). Drawn for the first time they were
strong (a pink floor), so the wash is now half of what it was written as, and smaller (the performers' area and a little
round it); the warm pool shares its card. Their fill counts now: see Measured below.

**Measured** (`tests/perf/show-perf.mjs --what=uplight`: the show on in every arm, the light off / on / off again in one
page; a built preview, the governor held):

| Low 390x844, 4x CPU, group of 4 | arms off / on / null | paired p50 rise on (null) | draws off -> on | glow fill (depth-tested; main) |
|---|---|---|---|---|
| fixed wide camera (7.5 m+) | 30 cycles | +0.4 ms (null +2.3) | 127.7 -> 127.0 | 0.190 (main 0.176) |
| close-up on the lead (1.75 m) | 30 cycles | -0.6 ms (null +1.3) | 106.9 -> 107.4 | 0.753 (main 0.689) |

Both rises are inside their null controls (this PC was busy with other jobs: frame p50 21-34 ms at 4x, so the noise is
+-2 ms; an earlier run gave +1.2 vs +0.9 and -3.0 vs -0.4): no cost shows. The draw counts move with the song time, not
with the light. The pool and spill on the ground: 0.002-0.004 fragments a pixel (the grass hides most of it). The ground
wash fades out when the camera is within ~3 m of its middle (close-ups: the feet are out of the frame), which took the
close-up's glow fill from 0.92 to 0.75: the fixed ground cards cost +0.01 (wide) and +0.06 (close-up) over main.

Draws: none added (the footlights are in the stage set's draw, the pool and spill in the glow draw). Programs: the same
count as main in every configuration (PC 152-154, phone 143-145, `renderer.info.programs`). CPU: a vec4 and three colours
a frame. Fragment work: about 40 ALU operations per performer fragment while it is on, nothing elsewhere.

**Pictures** (.tools/uplight/final/, local): `*-before.png` from main's own code (2cc6019) and `*-both.png` from this branch,
PC 1280x720 and phone 390x844: group of 4 at night (wide, medium, close, low hero; plus `-off`, `-key`, `-fill` for the
balance), solo at night (medium, close), group of 8 (wide, medium), Sunset (wide, close), the Night Star at the shrine
(`nightstar-*`); the probes `.tools/uplight/shots.mjs` and `nightstar.mjs` (the song frozen mid-chorus, fixed views).

### Not by day (2026-11-28, after the deploy)
Owner: "In the daytime we maybe don't need the light, but keep the other effects — in the daytime, with the light added,
all characters seem too bright."

**Why.** The light faded in over the valley's night value 0.05-0.6, which the sky reaches at 17:40-18:55: the whole
Sunset hour, with the sun still up. Sunset (18:00) had ~8 % of it, 18:24 19 %, 18:42 59 % and 18:55 95 %: performers in
nearly full footlights under an orange sky, on top of the low sun. Explore's own clock and Sing & Play's slow clock
(an hour every 10 minutes) walk a show through those times. At Noon nothing of the show touched them.

**Fix.** `UP.nightFrom` 0.65, `nightTo` 0.95: exactly 0 from morning through the end of Sunset (the sun is on the horizon
at 19:00 whatever the season; at dawn the night value is under 0.65 before sunrise at 5:36), then in over the first
hour of the night, full from about 20:10. The footlight lenses and the warm pool follow it (they use the same value).
Everything else by day stays: the stage set, petals, bubbles, balloons, the ground wash, the claps. tests/show-fx.test.mjs
checks the hours (0 at 5:36, 6, 8, 12:30, 15, 17:12, 18, 18:24, 18:42, 18:57, 19; full at 20:30, 21, 23, 2, 4:48).

**Measured** (`.tools/day/probe.mjs`: Sing & Play, group of 4 at the station, first chorus, the world frozen and three
arms drawn on that frame: as shipped / the light's terms at 0 / no show effects at all; faces = Rec. 709 luma 0-255 over
each performer's face box, the mean of the four):

| hour (night value) | PC before: ship / no light / no show | PC after: ship / no show | phone before: ship / no show | phone after: ship / no show |
|---|---|---|---|---|
| Noon 12:30 (0) | 221.2 / 221.2 / 221.2 | 220.3 / 220.3 | 233.9 / 233.9 | 233.4 / 233.4 |
| Sunset 18:00 (0.15) | 128.3 / 122.6 / 122.4 | 122.3 / 122.1 | 142.1 / 135.7 | 135.8 / 135.8 |
| 18:24 (0.20) | 118.1 / 103.7 / 103.7 | (0 now) | | |
| 18:42 (0.36) | 130.5 / 83.2 / 83.0 | 83.3 / 83.0 | 145.3 / 92.4 | 92.3 / 92.3 |
| dusk 19:36 (0.83) | 135.9 / 41.8 / 35.1 | 118.4 / 38.3 | 154.0 / 43.3 | 125.5 / 42.7 |
| Night 21:00 (1) | 138.9 / 46.5 / 36.2 | 138.5 / 35.2 | 149.6 / 39.4 | 149.9 / 39.3 |

By day the performers' faces now equal a no-show frame (within 0.3 of 255: the glow cards' light in the bloom). Night is
unchanged. Also checked at Noon on that frozen frame: the glow (bloom) adds +20 to the faces (bloom off 199.7), the face
shading's bent normals +4 (shade off 216.2), the PC supersampling nothing (Resolution Balanced 219.5): the performers'
daylight brightness is the valley's own (sun 3.3, the pale VRoid skin near white, the white dresses over the glow's
threshold), not the show's. Pictures: `.tools/day/day-light-pc.png`, `day-light-phone.png` (before | after | no show at
Noon, Sunset, 18:42, 19:36, Night; the frames in `.tools/day/before*`, `after/`), local.

## The switch
**Show effects: On / Off** in the Song row of the idle bar (after Lyrics; flat, 44 px on phones, text 13 px; the row
scrolls sideways on a phone as before; hidden with the setup rows while a song plays), remembered per device in
`starline:singplay:showfx`. Default: **On** on every device, weak phones included (measured: the rise stays inside the noise on Low at 4x CPU, the effects' JS is ~0.1 ms, and the Low tier already draws fewer beams and burst particles; with 8 on Low the fill-heavy effects drop out by rule). `?showfx=off|on` for measuring.

## Open
- (Done 2026-11-28, docs/SING-AND-PLAY.md "Watchers at night") The glow sticks needed watchers: Town Life's people go
  home after dark, so in deep night nobody came. A night show in Sing & Play now fills its audience with villagers who
  stayed out for it (one draw each, no shadow).
- Real-phone numbers (the "Copy performance report" from two or three phones) would confirm the 4x-CPU measurements.
- The stage light (2026-11-28): the owner's look at the balance (key + fill, "both"), the footlights' size and the
  ground wash now that it draws (at half its written strength). Knobs: `UP` in src/fx/stage-uplight.js.
