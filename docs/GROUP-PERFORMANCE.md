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
