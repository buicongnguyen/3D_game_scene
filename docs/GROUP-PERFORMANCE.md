# Group performance: Kotone and the other seven VRoid samples (2026-11-28)

Owner: "prepare the remaining ones so we can add them to the game if we need; make a group of performers, all 8 together,
maybe the same style, or 2 groups of 4 that dance and sing the same so the game stays small; suggest the better way that
doesn't reduce fps out of acceptable on mobile; then execute."

## The choice: two groups of four, one evaluation a group
All eight in one style would need eight animation evaluations (eight mixers blending 69-bone clips, eight foot holds) or
eight copies of one pose (no variety: one dancer cloned eight times). Two groups of four give two routines from the same
song plan for the price of two evaluations:

| | front row (group A) | back row (group B) |
|---|---|---|
| members | Saki (nu-3), **Kotone** (lead, mic), Aoi (nu-5), Yuna (nu-4) — the group of 4 (owner 2026-11-28: the two girls in white in, Mio's blue-green hair out) | Mio (nu-1), **Riku (nam-1)** (source), Kai (nam-3), Ren (nam-2) |
| evaluated | Kotone's own performer (performer.js, unchanged) | ONE mixer on nam-1 (his own Club bake) |
| routine | her plan (plan.js) | `planBacking`: the same bar lines and sections, another dance in every block, no hand contact, the same cheer and bow |
| the others | copy her bones after her dance pose, before her mic layer | copy his bones |
| singing | she sings lead; the three girls sing along on chorus lines | all four sing along on chorus lines |

The copy (game/perform/troupe.js `makeCopier`): each follower bone turns from its own rest by the turn the source bone
made from the source's rest (a constant per bone; identity for 62-63 of 65 bones, the VRoid conversion gives the bodies
the same bone frames), the hips' travel is scaled by the ratio of hip-to-ankle heights, and a follower whose thigh : shin
split differs from the source's by more than 1 % (nu-3, nu-5, nam-2) gets a two-bone leg solve that puts its ankle where
the source's goes (scaled), only while the foot is within 8 cm of the floor (`legSolve`: only the leg's own chain is
recomposed, no scene walk). Faces: each member's blink is its own (staggered), the mouth follows the song's mouth curve
only on chorus lines (`face.sing(track, clock, when)`), and only within 12 m of the camera.

Formation (content/troupe.js): front row x -2.25 / -0.75 (Kotone, 0.35 m forward) / 0.75 / 2.25, back row 1.8 m behind
at x -3 / -1.5 / 1.5 / 3 (between and outside the front row's shoulders, so every face shows); everyone faces where
Kotone faces. The camera man frames the formation's centre for every shot but a close-up, far enough back for its width
at the camera's own field of view; choruses are group shots (wide and medium in turn on each chorus line), close-ups go
to Kotone's verse lines. The village evening show at the station stays Kotone solo.

## Sing & Play
A row of its own under the HUD: **Solo / Group of 4 / Group of 8** (44 px+, always visible, no menu; vi/ko/ja). Picking a
group fetches its models (and nam-1's pack for 8) right then; "Getting the group ready…" until they are in; Perform
also checks that every member's place is level (within 0.35 m), dry and clear ("Not enough room for the group here").
The villagers who come to watch stand 7.5 m from the formation's centre. URL switches for measuring: `?troupeMax=`,
`?troupeHalf=1`, `?troupeBackFaces=0`, `?troupeBackShadows=0`.

## Measured
### The members (art/blender/vroid_mixamo.py --member, Blender 5.2.5 LTS; packed = scripts/pack-models.mjs)

| member | height | tris PC / phone | PC model raw / packed | phone model raw / packed | pack raw / packed | Walk m/s (slip) |
|---|---|---|---|---|---|---|
| Kotone (nu-2, unchanged) | 1.62 | 13,878 / 7,995 | 1.11 / 0.58 MB | 0.79 / 0.45 MB | 1.14 / 0.86 MB | 0.958 (1.45 cm) |
| nu-1 | 1.60 | 12,501 / 7,891 | 0.99 / 0.57 | 0.75 / 0.44 | 1.13 / 0.86 | 0.958 (1.45) |
| nu-3 | 1.65 | 13,881 / 7,951 | 1.11 / 0.58 | 0.79 / 0.45 | 1.14 / 0.86 | 0.987 (1.57) |
| nu-4 | 1.67 | 13,911 / 7,968 | 1.07 / 0.56 | 0.75 / 0.43 | 1.14 / 0.86 | 0.963 (1.57) |
| nu-5 | 1.74 | 12,545 / 7,966 | 1.04 / 0.56 | 0.76 / 0.43 | 1.14 / 0.86 | 1.040 (1.94) |
| nam-1 (x0.975) | 1.71 | 12,836 / 7,992 | 0.93 / 0.53 | 0.72 / 0.43 | 1.14 / 0.86 | 1.028 (1.54) |
| nam-2 (x0.909) | 1.73 | 13,872 / 7,916 | 1.12 / 0.59 | 0.81 / 0.47 | 1.14 / 0.86 | 1.099 (1.88) |
| nam-3 (x0.975) | 1.76 | 13,733 / 7,712 | 1.07 / 0.56 | 0.76 / 0.43 | 1.14 / 0.86 | 1.028 (1.54) |

Every file: 69 bones, one mesh, one MASK material, 1024 / 512 px atlas, blink / mouthA / mouthO, the nine everyday clips
(Idle, Walk, Run, Talk, Wave, Cheer, Bow, LookAround, Point), the pack with the seven Mixamo dances, Sing / SingUpper and
the 23 Club moves. Joint rules R1-R11 on every Club move of every member: 0 before and after thinning. All 21 files:
+20.63 MB raw, +13.06 MB packed in the deploy; a group of 4 on a phone fetches 1.32 MB (three light models), a group of
8 on PC 3.95 MB of models + 0.86 MB (nam-1's pack). Nothing at the valley's start.

### Planted-foot slide over a whole song (scripts/troupe-check.mjs: posed exactly as the game does, toe joints within 4 mm)

| song | Kotone | front followers (nu-3 / nu-1 / nu-4) | back row (nu-5 / nam-1 / nam-3 / nam-2) |
|---|---|---|---|
| test fixture (Ngày Nào Cũng Vui) | 1.18 cm/s p95 | 1.24 / 1.18 / 1.18 | 0.76 / 0.91 / 0.91 / 0.77 |
| Golden Rails (EN, main) | **1.68** | 1.72 / 1.68 / 1.68 | 0.42 / 0.43 / 0.43 / 0.41 |

Without the leg solve nu-5 and nam-2 skated at 2.45 / 3.06 cm/s. The followers equal their source; Golden Rails' 1.68
is Kotone's own solo performance (18 planted contacts in the song, one slide over 1.5 cm): it is in her plan, not in the
copy (each member's own bake on its own mixer gives the same 1.67-1.71). Joint rules on the copied poses over both songs: 0.

### The saving (JS, scripts/troupe-check.mjs, one core, no throttle)
| a frame of 8 dancers | ms |
|---|---|
| every member its own mixer + foot hold (`--own`) | 0.157 (test song) / 0.100 (Golden Rails) |
| two evaluations + copies + 3 leg solves (shipped) | 0.046 / 0.034 (-70 % / -66 %) |
| the same, copies only, no leg solve | 0.040 |
| the leg solve with foot-hold.js `reach` (a scene walk per leg) | 0.104 (replaced by `legSolve`) |

### Frame time near the stage (tests/perf/troupe-perf.mjs on a built preview, Chromium + GPU, uncapped)
This machine was shared with other heavy jobs: one page per size moved by 2-6 ms between loads, so the sizes were
switched inside ONE page (`--ab`: 1 / 4 / 8 every 2 s, 8-12 cycles, members hidden = neither posed nor drawn).

Low, 390x844, 4x CPU (p50 rise over Solo, ms; JS in the performers):
| camera | 4 | 8 | 8, back row half rate | 8, half rate + back faces off |
|---|---|---|---|---|
| fixed, 8.5 m (run 1) | +1.3 | +2.9 | +2.4 | - |
| fixed (run 2, after the copy fix) | +0.9 | +1.2 | +0.8 | +0.5 |
| moving (orbit, run 1) | +1.5 | +4.5 | +4.7 | +2.1 |
| moving (run 2) | -2.6 (noise) | -1.2 (noise) | -0.9 | -0.9 |
| JS in game.frame (fixed run 2) | +0.9 | +1.2 | +0.8 | +0.6 |
| performers' own JS | +0.13 | +0.36 | +0.24 | +0.28 |
| draws / k tris (fixed view, Solo 68 / 370k) | 72 / 406k | 78 / 453k | | |

PC (High, 1280x720, no throttle): 4 adds +0.4 / +0.2 ms p50 (fixed / moving), 8 adds +0.8 / +0.5 ms; draws 189 -> 196 -> 204.
Memory: GPU geometries +3 / +7 and textures +9 / +21 (atlas, bone and morph textures) for 4 / 8; JS heap within the noise
(+10-25 MB between pages). Estimated GPU memory a member: ~2 MB light, ~6 MB standard.

**Applied:** with 8 on Low the rise was over the +2 ms line in two of the moving-camera runs (+4.5, +4.1 between pages)
and the back row at half rate did not change that beyond the noise, nor did its faces off; 8 also takes the station's Low
draw budget past its limit (84 + 11 > 91). So the third step applies: **Low shows Solo and Group of 4; PC 8**
(`GROUP_LIMITS` in singplay.js; `?troupeMax=8` for testing). Half rate and back faces off stay as switches
(`?troupeHalf=1`, `?troupeBackFaces=0`), off by default. 4 on Low: +0.7-1.5 ms p50, +5 draws, within the station budget.
(Superseded on 2026-11-28 by "Group of 8 on strong phones" below: rows drawn as one mesh, 8 offered on a phone that
measures strong.)

## Group of 8 on strong phones (2026-11-28)
Owner: "only strong phones get group of 8; find an optimization algorithm and apply it for our case to make it work better."

### What the eight cost, and what fits our case
The members' own JS is small (posing and copies ~0.1-0.5 ms at 4x CPU); the cost is drawing: each member was its own
SkinnedMesh (69 bones, morphs) = a view draw + a shadow draw + its skeleton update and bone-texture upload + its own
program/texture/uniform state, seven times. Our rows dance in exact unison in a fixed formation, mostly seen from mid or
far, so the candidates were judged on that:

| candidate | verdict |
|---|---|
| **one skinned mesh a row** (row-merge.js: the followers' geometry joined in bind space, one combined skeleton of their own bones, one atlas, faces kept through per-member morph slots) | **applied**: exact (the same skinned vertices: 0.0000 mm on the lite files, 0.0002 mm on the packed PC files), 7 member draws -> 2, 7 shadow draws -> 2, 7 bone-texture uploads -> 2; no change to posing, copies, leg solves or faces |
| blob shadows / shadow proxies for the back row | rejected: after the merge the back row's shadow is ONE draw; a blob is also one draw and looks worse |
| lite mesh as shadow caster, lite LOD for the back row on Medium/High | not needed for phones (Low already draws the lite files); on PC 8 is already +0.5-0.8 ms |
| skip face work past `faceNear` | already there (faces run only within 12 m); the merged mesh adds one copy of 3 weights a member |
| skip identical bone uploads | the copies are not identical in the bone texture (each member's bones are in its own place), so there is nothing to skip; the merge already makes it one upload a row |
| baked vertex/bone animation textures (VAT/BAT) | rejected: the routines are planned from the song at run time (plan.js, two routines, foot hold, leg solves, mic layer), so a bake would be per song and per routine, ~46 MB a clip as VAT (smooth-dense-scenes animated-crowds-bat.md); BAT pays off for dozens of dancers, not 7, and faces need real skinning anyway |
| back row at half rate / back faces off | measured again on the merged rows (table below) |

How the merge works (src/game/perform/row-merge.js): each follower's vertices are moved into its bind space (its
`bindMatrix`), joined; each vertex's joints are shifted by 69 x the member's number, so a combined `THREE.Skeleton` of the
members' **own** bones skins it (the troupe keeps posing those bones; the merged mesh is "attached" with an identity bind
matrix, so world = sum w * bone.matrixWorld * boneInverse * p as before). The members' atlases go into one 2 x 2 texture
with a 1/16 margin around each cell that repeats the member's own picture (nam-1 has 16 triangles with v down to -0.04:
they read what they read with REPEAT; no bleeding between members in the far mips). Faces: the morph targets are joined by
name; each vertex carries `aMember` and the vertex shader reads its weights from `uRowMorph[member * 3 + i]`, filled every
frame from the members' own (hidden) meshes, where actors/face.js still writes. three's own morph weights on the merged
mesh stay 0, so the shadow pass (three's depth material) draws no faces, which the shadow cannot show anyway. Both rows
share one shader program (four slots a row). The members' own meshes stay in the scene hidden; their bones are still
walked (engine/matrices.js skips only hidden subtrees, and a mesh is a leaf). `Troupe.setMerged(false)` /
`?troupeMerge=0` draws every member on its own again (the A/B switch).

### The strong-phone rule (src/game/singplay/strong-phone.js)
Every phone is the Low tier (quality-pick.js: mobile -> low), so "strong" is measured on the phone itself while Sing &
Play runs (about once a second, before a show):
- not marked slow (device-note.js: the governor went 2+ steps down, or the pacer had to hold 30 fps, on any visit), and
  more than 3 GB where the browser tells (`navigator.deviceMemory`; the core count is not used: browsers report it
  unevenly, and the frames say more);
- the governor at level 0 and the pacer not pacing;
- over the last 120+ frames (game.ring, the "Copy performance report" ring): the game's own work per frame p50 <= 10 ms
  (the pacer's own "calm" line) and the frame gap p50 <= 20 ms (50+ fps: a GPU-bound phone shows here, not in the work).
Then the third button, **Group of 8**, shows (the same flat row; remembered per device in `starline:singplay:strong` = 1,
so it is there at once on the next visit). Medium and High are strong as before. Weak phones keep Solo / Group of 4.

During a show of 8 on a phone the budget is watched (`BudgetWatch`): two 1-second windows running with the median work
over 15 ms (near the pacer's 17 ms step) or the median gap over 26 ms (under ~38 fps), or the governor or the pacer
stepping in at all, breaks it. The back row then leaves **at the next camera cut** (a shot that cuts, not one that glides
on) or during a close-up of Kotone (it is out of the picture), at most 10 s later: `Troupe.setSize(4)` hides and stops
posing it, the camera frames the front row, the HUD shows Group of 4, and the device is remembered as `0`: 8 is not
offered on it again. Checked in the browser: tripped about 1 s into a show, the back row left 7.9 s later exactly at the cut
into her first close-up. `?troupeMax=` turns the rule and the fallback off (measuring).

### Measured (tests/perf/troupe-perf.mjs --ab, built preview, Chromium + GPU, uncapped)
The machine was shared and very noisy (one size's phase medians ranged 8-30 ms in one run), so the method changed:
- ONE page, sizes switched every 0.8 s (+0.25 s settle), 40 cycles; each cycle's phase medians are paired against Solo
  in the same cycle and the median of those differences is reported (**paired rise**); a null control (`1n`: Solo again)
  shows what noise is left;
- `u` phases draw every member on its own (the code before this change) in the same page, so before/after is in-page;
- every phase of a cycle starts at the same song time (re-seeked from the first chorus) and the same orbit point;
- `--frame=group`: the camera far enough for all eight in the picture. The earlier numbers (above) used 8.5 m, where a
  portrait phone shows only the middle four, so the others were culled. Older long runs also passed the song's end, where
  the group leaves and every size is a solo: the draws stayed flat, which gave it away.

Low, 390x844, 4x CPU, all eight in the picture (paired p50 rise over Solo, ms):
| camera | 4 merged | 4 own meshes | **8 merged** | 8 own meshes (before) | null control |
|---|---|---|---|---|---|
| fixed (group framing) | +1.5 | +1.8 | **+3.1** | +4.5 | -0.2 |
| moving (orbit) | +0.8 | +0.9 | **+1.7** | +2.8 | 0.0 |
| fixed, a second run (with switches) | | | **+2.9**; back row half rate +1.8; half rate + back faces off +3.0 | +3.7 | +0.6 |

The second run shows the noise left (null +0.6, and faces off "costing" 1.2 ms more than faces on): the back row at
half rate may save about a millisecond but is inside that noise, and it makes the back row move at half the frame rate,
so it stays a switch (`?troupeHalf=1`), off. Posing and faces of the eight: 0.4-0.6 ms of JS at 4x (`performerMs`).

Draws a frame (static view, shadow pass included: the Low tier redraws shadows every other frame): Solo 67.5; Group of 4
69 (own meshes 72); **Group of 8 70.5 (own meshes 78)**. The station's Low budget (tests/perf/budget.json): 84 + 3 = 87
of 91 with 8 (it was 84 + 11 = 95). Triangles unchanged (the same lite files: +~74k with the shadow pass). Downloads
unchanged: a group of 8 on a phone fetches 3.08 MB of light models + 0.86 MB (nam-1's pack). GPU memory: two 1152 px
atlases (2 x ~7 MB with mips) replace seven 512 px member textures (~10 MB; the members' own textures are never uploaded
now), PC two 2304 px (2 x ~28 MB) for seven 1024 px (~39 MB); textures in use +6 for 8 (2 atlases, 2 bone and 2 morph
textures).

PC (High, 1280x720, no throttle, all eight in the picture, paired p50 rise over Solo, ms; 30 cycles):
| camera | 4 merged | **8 merged** | 8 own meshes (before) | null control |
|---|---|---|---|---|
| fixed (group framing) | +0.3 | **+1.1** | +1.4 | +0.6 |
| moving (orbit) | +0.4 | **+0.7** | +0.9 | +0.1 |

Draws on High (static view, shadows every frame): Solo 190, 4 192 (own meshes 196), **8 194 (own meshes 204)**; the
station's High budget is 212.

Pictures (frozen world, .tools/g8/pictures.mjs: the game's loop stopped, the same frame drawn with every member its own
mesh, then merged; shadows redrawn for each):
| view | Low 390x844: pixels off by > 8 / > 24 levels (max) | High 1280x720 |
|---|---|---|
| group, mid-chorus, faces on | 0.066 % / 0.012 % (162) | 0.083 % / 0.004 % (54) |
| close (front row, faces on) | 0.019 % / 0.003 % (113) | 0.086 % / 0.004 % (95) |
| wide | 0.078 % / 0.014 % (161) | 0.073 % / 0.003 % (52) |
| a member's face at 1.1 m, every face forced to a blink + open mouth | 0.069 % (control with the slots left at 0: 0.79 %) | 0.089 % (control 0.34 %) |

The differences over 8 levels are single pixels on hair and cloth edges (elsewhere 1-3 levels at most): the atlas is drawn through a 2D canvas, which stores
premultiplied alpha, so the half-transparent texels of the MASK edges round a little differently (and the mips are made
from that). The face check proves the merged mesh moves the faces exactly where the members' own meshes did: without the
slots the difference is 5-10x larger. Joints and slide (scripts/troupe-check.mjs, Golden Rails): unchanged, the same
1.68 / 1.72 / 1.68 / 1.68 (front) and 0.42 / 0.43 / 0.43 / 0.41 cm/s (back), joint rules 0 (the merge does not touch
the bones).

### Goal and result
Goal: 8 on the strong-phone path within ~+2 ms p50 over Solo and inside each place's draw budget. Draws: met (87 of 91
at the station). Time: met with a moving camera (+1.7 ms, from +2.8), not with a fixed view that holds all eight for a long time (+2.9 to
+3.1 ms, from +3.7 to +4.5). The game's own shots move (the camera man glides, cuts and orbits), so in a show the rise sits
between the two. What is left is the eight's skinning and their bone walk (7 x 69 bones in the matrix pass), not draws.
On the strong-phone path that is still inside the frame: a phone is offered 8 only with its solo frame work at 10 ms or
less, so 8 lands near 13 ms at worst, under the 15 ms fall-back line and the 16.7 ms of 60 fps; a phone that cannot hold
it drops the back row at the next cut. The next steps, if wanted, trade looks: the back row at half rate (about -1 ms,
inside the noise, moves at half the frame rate) or no back-row shadows.
**Owner (2026-11-28):** +3.1 ms on the fixed full-group view accepted (no look trade); when the back row leaves, a short
toast says "The back row is taking a break" (vi/ko/ja).

## Faces at a distance (2026-11-28)
Owner: "In Perform, when the camera is a little distant, the faces of the characters are not clear, they seem broken,
even on PC. How to fix?"

Measured on frozen frames (Sing & Play, group of 8, mid-chorus; the camera 2-18 m in front of Kotone and on the
formation's centre; PC High 1280x720 and 1920x1080, Low 390x844), every suspect switched on the same frame and compared
with a 3x supersampled picture of it (`.tools/faces/probe.mjs`, `sheet.py`, `summary.py`; sheets in `.tools/faces/shots/`).

**Cause 1, the main one: the eyes turned out of their sockets.** Every face looks at the camera within 7 m
(actors/face.js; the troupe's faces always, Kotone on her sung lines). The VRoid irises are wide, shallow caps
(36 mm across, 15 mm deep) sitting about 0.4 mm in front of the eye white, and the eye bones of the converted rig sit
58 mm behind them and 2 cm toward the nose (`.tools/faces/eye_rig.py`; the same in the source files). Turning such an
eye by 4 / 10 / 17 degrees slides the iris 4 / 10 / 16 mm and sinks its rim behind the eye white: 94 / 76 / 49 % of the
iris stays visible, cut by a hard straight edge (`iris_visible.py`). Over 75 s of a real show (the camera man's own
shots) the old gaze turned more than 12 degrees in 85 % of the samples and sat at its 17 degree limit in 72 %; with the
camera 3-8 m away, 88-93 % were over 10 degrees (`gaze-stats.mjs`). Close-ups are straight on and past 7 m the eyes
look ahead, so it showed exactly "a little distant": half-white crescents or blank white eyes.
**Fix:** the iris slides in the face plane instead (`EYE` in actors/face.js): an eyeball of 12 mm turned toward the
target, at most 3 mm across and 2 mm up (an ellipse), the eye bone never turns, so the iris never goes deeper than the
eye white: 92-98 % visible at the full slide. `?eyes=turn` brings the old turn back to compare. Same cost (well under
1 us a face a frame in Node), works on the merged rows (they skin the members' own bones) and on the lead.

**Cause 2: the boys' faces were drawn from the wrong mip.** In vroid-nam1/nam2/nam3 (and their light files) the face
skin is packed squashed about 9 : 1 (p90 16 : 1) in the atlas: a 60 x 1010 texel strip (`face_density.py`; the source's
face UVs are 1.1 : 1: the squash happens in the atlas build, `vroid_lite.build_atlas`, not found yet). Trilinear filtering picks the mip from the dense
axis, so from a few metres the boys' faces were smeared and darkened, their brows gone. The girls' islands are fine
(1.2 : 1). **Fix:** anisotropic filtering on the VRoid atlas only (engine/assets.js `atlasAniso`, set in game.js: the
GPU's most on PC, 4 on Low; `?atlasAniso=1` turns it off); the rows' joined atlas copies it. Eye-band error (mean of
0-255 levels) against a 3x supersampled picture of the fixed frame, boys: 11.5 -> 8.0 (2-4 m), 15.3 -> 12.3 (6-8 m), 22.4 -> 15.6 (12-18 m) on PC 720p; 1080p
9.5 -> 7.0, 14.8 -> 12.0, 18.4 -> 12.4; Low 11.2 -> 9.6, 16.2 -> 14.2. Girls and Kotone (eyes + filtering): 8.0 -> 6.3,
14.3 -> 13.0, 17.1 -> 15.9 (PC 720p). No new draws or programs (a sampler setting). Still to do (an art job): pack the
boys' atlases right (their atlases also leave 40-55 % empty); then their faces gain detail close up too.

**Cause 3 (small): a blank face past 12 m.** Faces switch off past `faceNear` and every weight went to 0: eyes open and
mouth closed (fine), but no smile, the "a little sad" face the owner had asked to fix. Off now rests at the resting smile.

**Measured and rejected** (PC 720p, the same frozen frame, error against its supersampled picture):
- Alpha-tested lines lost in the mips (lashes, brows): the dark feature pixels in the eye band already match the
  reference (e.g. Kotone at 8 m 149 of 153, 12 m 55 of 53), drawing the girls and Kotone from mip 0 only moves their
  error by -1.0..+2.3 (the boys gain from it: cause 2), and the whole atlas keeps 96 % of its alpha coverage at mip 3.
  Coverage-preserving mips or alpha sharpening would buy nothing. (Round 2 below: wrong. That count was too lenient
  and the alpha was measured over the whole atlas; per face sheet the boys' brows lose 55 % of their coverage at mip 3.)
- Shadows on the faces (receiveShadow off): -0.1..+0.5 error, no visible change. Bloom off: no change.
- Bleeding between members in the merged rows' atlas: the boys' smear is the same on their own meshes (cause 2).
- Lite mesh normals: the faces are not decimated in the light files (same face triangles).
Not changed: the faces are lit as 3D surfaces (a shading line down the nose when the sun is from the side). An anime
look would bend the face normals forward; that changes close-ups too, so it is the owner's call (done in round 2).

### Round 2 (2026-11-28): "at a little distance their face becomes no face"
After the first round the owner still saw blank faces from ~6 m (head ~38 px at 1080p): eyes, eye lines and brows faded
to skin colour while the supersampled picture still showed dark marks; at 12 m nearly no face; a hard light/shade split
down every face. Measured again on frozen Sing & Play frames (group of 8, Golden Rails at 42 s) with a new probe
(`.tools/faces2/probe.mjs`: variants switched by uniform on ONE frame, a 3x supersampled truth, crops read back with
readPixels; `sheet.py`, `final_sheet.py`; 2 s moving-camera sequences for flicker).

**What made the face disappear.**
1. *The boys' atlases (the root of their smear).* `vroid_lite.build_atlas` scaled each source island by sqrt(w x h) and
   then `bpy.ops.uv.pack_islands` "corrected" the islands for the aspect of the material's picture: the boys' first
   material slot is the 1024 x 256 brow sheet, and every island the packer turned 90 degrees came back squashed by that
   aspect squared. Face skin 15 : 1 (p90 19 : 1; the source is 1.15 : 1), nam-2's irises 7.7 : 1, the atlas 27-43 % used,
   nam-1's UVs past the picture's edge (v -0.039). Reproduced in Blender 5.2.5 (`.tools/faces2/pack_probe.py`: face skin
   1.2 -> 16.1 after the pack; a picture-less material on every slot while packing: 1.2 -> 1.2). The girls' first slot is
   the square mouth sheet: not squashed. Two more wastes on every VRoid build: the brow / eye-line / lash sheets came out
   4 : 1 and the eyes 2 : 1 (sqrt scaling of non-square pictures), and nam-2's 83 hair cards each got their own copy of
   the hair sheet (~85 % of his atlas: his face skin 112 x 112 texels).
2. *Thin strokes vanish under the alpha cut-off.* The lines, lashes and brows are alpha-tested shells. Per face sheet
   (not the whole atlas, as round 1 measured): nam-1's brows keep all their passing texels to mip 2, 45 % at mip 3,
   30 % at mip 4, none at mip 5; his lashes 67 % at mip 3, none at mip 5; Kotone's lashes 51 % at mip 4. A stroke
   thinner than half the pixel is discarded and the skin shows; the supersampled picture keeps it as a partly dark
   pixel. Against that truth the eye band of the plain render had 75-87 % of its darkness at 6-18 m for Kotone and
   57 % (12 m) / 1 % (18 m) for nam-1.
3. *Side light on a 3D face.* The face is lit as a real surface: a hard shade line down the nose and one dark cheek,
   which at 20-40 px reads as a patchy, featureless face.

**Fixes.**
1. *Atlas (art/blender/vroid_lite.py build_atlas; the three boys rebuilt, one Blender 5.2.5 run each; nam-1's pack and
   Club bake redone: byte-identical to before).* Islands scaled by the source picture's width and height (square
   texels); each material on a UV tile of its own with `merge_overlap` (one material's islands that read the same texels
   share them; two materials never do); one picture-less material on every slot while packing; `udim_source=
   'ACTIVE_UDIM'` (into the unit square); an assert that every UV stays inside. Face skin 15 : 1 -> 1.18 : 1 and
   54,590 / 8,950 / 16,628 -> 153,519 / 136,612 / 151,789 texels (nam-1 / nam-2 / nam-3); brows, lines, lashes, irises
   1.1-1.4 : 1 with 2.5-15x the texels; atlas used 27 / 38 / 43 % -> 72 / 75 / 73 %. tests/assets.test.mjs now checks
   every VRoid file's face texels (median stretch under 1.6 : 1; boys 1.17-1.20, girls 1.21-1.49) and that its UVs stay
   inside. Sizes: the six boys' files +51 KB raw, +10.7 KB packed (the PC group set +39 KB, the phone set -29 KB).
2. *Strokes (actors/face-look.js, patched into the VRoid material and the rows' copy).* On a multisampled frame (PC
   Medium, High) the face's own fragments (a per-vertex face mask, 1 byte, found at load: the parts a face morph moves,
   held by the head or an eye bone) use alpha to coverage: near, the edge sharpened at the cut-off; far (from mip 0.5,
   full at 2.5), the cut-off done on four reads a level finer across the pixel, coverage = (the part that passes) ^ 0.7,
   in the stroke's own colour. Hair and clothes keep the all-or-nothing cut-off (partial coverage let the forehead show
   through the fringe). Low (no multisampling) is unchanged; a governor step that drops the samples switches it back.
3. *Anime face shading (actors/face-look.js faceNormals).* The face's normals bent 80 % toward an ellipsoid in the head
   (half-axes 0.15 / 0.18 / 0.086 m, flat in front, centre 1 cm behind and below the eye bones), once a model at load;
   the joined rows carry both normal sets. The face is lit as one soft surface from any side; the hair and body keep
   theirs. `?faceShade=off` / `?faceFeatures=off` compare.

**Effect** (eye-band error in 0-255 levels against the run's own supersampled truth, before -> after; "dark" = the
darkness the eyes and brows put in that band, 1 = the truth's). PC 1280 x 720: Kotone 2 m 4.6 -> 4.0, 4 m 9.3 -> 8.4,
8 m 16.7 -> 11.1, 12 m 16.1 -> 13.9 (dark 0.78 -> 0.92 at 8 m); Saki (nu-3) 4 m 8.8 -> 7.2, 8 m 13.7 -> 11.4; Riku
(nam-1) 3 m 6.6 -> 4.5, 6 m 8.4 -> 6.3, 12 m 6.8 -> 4.7 (dark 0.57 -> 1.14), 18 m dark 0.01 -> 0.80. At 18 m (7 px heads)
the girls' error rises 1-2 levels while their darkness gets closer to the truth's (0.75 -> 0.85, 0.79 -> 0.96).
Low 390 x 844: the re-pack alone (no runtime rule there): the girls within 1.5 levels of before; the boy's smear is gone
(before, the squashed skin darkened his whole face). Flicker over a 2 s dolly (excess frame-to-frame change against the
truth's): PC at 8 m Kotone 1.11 -> 1.19, Saki 1.17 -> 1.22, Riku 0.65 -> 0.54; Low at 6 m 1.19 -> 1.24, 1.39 -> 1.43,
0.52 -> 0.60. Cost: no new draws, materials or programs (149 PC / 140 Low, before and after); frame time on the frozen
frame 7.9 vs 8.1 ms (Kotone at 6 m) and 7.7 vs 8.2 ms (the group at 10 m), within noise; four extra texture reads only
on far face pixels. Sheets: `.tools/faces2/final/pc720-*.png`, `low390-*.png` (before | after | truth), numbers in
`pc720.json`, `low390.json`.

**Measured and rejected (round 2).** Alpha to coverage with the plain mip alpha (soft stroke edges read as see-through:
lighter eyes, a streaky fringe, smudges around the eyes once boosted); a lower far cut-off (0.3-0.42: black bars and
broken dashes on the boys' brows, the girls 1.4x too dark at 12 m); a 2 x 2 screen dither (eye error 20-30); a -1 mip
bias (black blobs on the brows); the four-read majority without multisampling (the boy 1.45x too dark, flicker
0.52 -> 0.83). On Low every all-or-nothing rule measured worse than none.

### Round 3 (2026-11-28): sharper close-ups for the girls, and a mouth that reads
Owner: "Maybe Saki looks better — build for sharper close-ups too. Check those 8 characters; maybe we need to keep the
lips more pink-red so we can see the mouth?"

**The girls re-packed.** Kotone, Saki, Mio, Yuna, Aoi, the Night Star and the visitors Vita and Bibi rebuilt with round
2's atlas (`vroid_mixamo.py`, Blender 5.2.5, one run each; the boys once more for the mouth). The texels the face's own
triangles get (skin, eyes, lines, brows, mouth; each texel once), PC file / light file: Kotone 66,495 -> 327,597 (4.9x) /
16,764 -> 83,056; Saki 62,853 -> 322,436 (5.1x) / 15,875 -> 83,019; Yuna 61,041 -> 365,256 (6.0x); Aoi 138,830 ->
363,948 (2.6x); Mio 298,330 -> 387,735 (1.3x: her atlas was roomy); Stella 2.3x, Vita and Bibi 2.1x (the same on the
light files). The face skin alone: Kotone 27,146 -> 135,887, Saki 25,606 -> 133,715. Sharper close-ups (the eye lines,
lashes and the mouth line at 0.8-2 m); from ~6 m on nothing changes (the mip there is the same picture).

**The mouth, measured first.** The same frozen Sing & Play frame (group of 8, Golden Rails, first chorus + 4 s, the pose
stepped by hand so every run shows the same frame), the camera 0.8-12 m in front of each face, the mouth closed and sung
open (mouthA 0.6 / mouthO 0.2: the song's median sung frame), PC 1280 x 720 (Medium, MSAA 4) and Low 390 x 844 (light
files). Numbers per face, top quarter of the mouth box's pixels, CIE76: "signal" = how much singing changes the pixels
(open vs closed), "darkness" = skin L minus the open mouth's L. What we found: the VRoid faces paint a closed mouth as
one thin line, and the open mouth's inside is a mid red (the tongue / roof sheet) close to the skin's brightness, so the
moving mouth was a small red smudge from 4 m on. Options built into the atlas (`VROID_MOUTH_VARIANTS=1`) and compared on
one frame against the plain re-packed atlas, girls' mean (PC; Low alike):
- (a) a soft lip tint, a few mm round the slit (strength 0.55): a closed mouth changed by 1.2 units at 2 m (not seen).
  A wider band (3.2 mm above, 6.8 mm below the slit at most; strength 0.88): 4.4 at 2 m, 3.9 at 4 m, 3.2 at 6 m, 2.7 at
  8 m: just seen, soft pink lips, no lipstick. Alone it lowers the signal a little (21.8 -> 21.1 at 2 m: closed lips
  are pinker, so opening changes less).
- (b) the inside darker (teeth kept): signal at 2 / 4 / 6 / 8 / 12 m 21.8 / 18.7 / 15.4 / 11.8 / 8.7 -> 24.7 / 20.8 /
  17.2 / 12.7 / 9.5 at 0.5 darker, 28.2 / 23.4 / 19.1 / 13.6 / 9.9 at 0.65 darker (Low 21.2 / 20.2 / 17.4 / 15.1 / 14.7
  -> 28.1 / 26.6 / 22.2 / 19.4 / 18.3): the open mouth reads as a dark shape, the anime way.
- (c) both: what was kept. Girls and women: the wide pink-coral lip band (0.88) and the inside 0.6 darker; boys: a faint
  natural rose on a narrow band (0.35, 2 / 4 mm) and the inside 0.6 darker. In the atlas at build time
  (`vroid_lite.MOUTH`, `mouth_masks`, `mouth_look`; art/CONTRACTS.md): no draws, materials, textures or shader work,
  the same on PC, Low and the merged rows.

**Effect** (before = the shipped files, after = these, the same frame). Signal before -> after: PC girls 22.3 -> 28.5
(+28 %) at 2 m, 19.5 -> 23.8 (+22 %) at 4 m, +14 % at 6 m, +18 % at 8 m, +12 % at 12 m; boys +55 / +42 / +45 / +45 / +34 %;
Low girls +29 / +27 / +26 / +22 / +16 %, boys +44-51 %. The open mouth's darkness, PC girls 28.1 -> 40.0 (2 m), 25.9 ->
35.9 (4 m), 26.8 -> 33.8 (6 m). A closed mouth changed by 3-7 units (the pink lips). Saki and Kotone gain least (their
slits are the narrowest, 20.9 / 25 mm; Aoi's is 35.6): Saki PC +9 % at 2 and 4 m, +4-6 % further, darkness 30.4 -> 37.7
at 2 m, her closed mouth 4.5 / 4.0 / 3.2 units changed at 2 / 4 / 6 m (Low 6.9 / 7.3 / 5.0); Kotone PC +9 / +8 / +2 %,
Low +14-18 %. Past ~8 m a mouth is 1-2 pixels: no tint makes it readable there.
Sizes: raw -49 KB (91,193,824 B), packed -83 KB (40,695,020 B): the re-pack shrank the girls' pictures more than the
tint added; no budget changed. Skeletons: all 24 files (16 models, 8 light) and both packs keep the same 69 joints, order,
parents, rest and inverse binds to the last bit; nam-1's pack and Club bake came out byte-identical, Kotone's pack's
nine own clips too. Kotone's body is 13,989 tris now (13,878: her last build predates decimate_to's fix, b4e5fc6), and
the Club bake re-solved her arms' clearance on it (the solver on her old body gives the shipped pack byte for byte):
Club / Mic / Moment upper arms moved up to 12-35 deg at their extremes (p99 under 19 deg), hips and legs exact.
`scripts/troupe-check.mjs`: joints 0 for all eight, slide unchanged (Kotone p95 1.01 cm/s before and after).
Pictures: `.tools/girls/<name>-pc.png` / `-low.png` (face at 0.8 m x2, close-ups 0.8 / 1.2 / 2 m resting and singing
before | after, the 2-12 m strip singing, the options), `all8-pc.png` / `all8-low.png`, `portrait-before-after.png`,
`singer-faces-before-after.png`; numbers in `.tools/girls/m/final-vs-before.json`, `tint-pc-wide.json`,
`tint-low-wide.json` (local, ignored).

## Checks
- `npm test` (troupe.test.mjs: cast, back routine, copy maths, leg solve, sing-along gate, room check, group shots,
  limits, strong-phone rule, budget watch and the cut, the row merge's skinning/morph/UV maths, a packed pack's rest
  pose); assets + pack tests for the 21 files; i18n check (no new strings).
- `node tests/perf/troupe-perf.mjs --ab --frame=group --sizes=1,8,8u,1n --settle=250 --secs=0.8 --runs=40`: the paired A/B.
- `node scripts/troupe-check.mjs [--own] [--song public/songs/kotone/golden-rails-en]`: slide, joints, JS.
- Perf budget (tests/perf-budget-browser.mjs, built preview): all eight places within limits (nothing new at the start).
- Pictures mid-chorus (Golden Rails): `.tools/group/final/sheet-pc-8.png`, `sheet-phone-4.png` (and the single frames);
  a 26 s PC recording of the eight: `.tools/group/final/pc-8-performance.webm` (local only).

## Owner decisions
1. **Done (2026-11-28):** the six packs nobody fetched (moves-vroid-nu1/nu3/nu4/nu5/nam2/nam3, 5.2 MB packed) are
   dropped; only nam-1's ships. `vroid_mixamo.py --member <id>` rebuilds one when a member gets a solo show.
   Also fixed then: the villagers' bubbles are hidden while she performs (`director.performing`), the song pauses with
   the game (pause menu, photo mode), and the objective card says what Sing & Play is about.
2. **Done (2026-11-28):** names for the seven (Kotone's art-club friends from the city, on a summer trip to sing at the
   station; none taken by a villager): nu-3 Saki, nu-1 Mio, nu-4 Yuna, nu-5 Aoi, nam-1 Riku, nam-3 Kai, nam-2 Ren
   (content/troupe.js NAMES: the Singer row's labels and the photo/video file names). Their own Korean and Vietnamese
   names in those game languages (LOCAL_NAMES): ko Kotone 코토네, Saki 지유, Mio 서아, Yuna 하린, Aoi 수아, Riku 도윤,
   Kai 시우, Ren 준호; vi Saki Mai, Mio Linh, Yuna Thảo, Aoi Vy, Riku Minh, Kai Khoa, Ren Huy (Kotone keeps hers). Korean voices: Supertonic 3 kept.
3. **Done (2026-11-28):** Group of 8 on phones only when the phone measures strong (strong-phone.js), with a fallback
   to the front row at a camera cut; every row drawn as one mesh. Open: the thresholds (work p50 10 ms, gap p50 20 ms;
   fall back at 15 ms / 26 ms) are set from this machine's 4x-CPU numbers, not from real phones: a "Copy performance
   report" from two or three real phones would confirm them.
4. Golden Rails: Kotone's own planted-foot slide is 1.68 cm/s p95 (the gate is 1.5); a plan-side fix is hers to make.
