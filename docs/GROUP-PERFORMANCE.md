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
| members | nu-3, **Kotone** (lead, mic), nu-1, nu-4 | nu-5, **nam-1** (source), nam-3, nam-2 |
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

## Checks
- `npm test` (troupe.test.mjs: cast, back routine, copy maths, leg solve, sing-along gate, room check, group shots,
  limits, a packed pack's rest pose); assets + pack tests for the 21 files; i18n check.
- `node scripts/troupe-check.mjs [--own] [--song public/songs/kotone/golden-rails-en]`: slide, joints, JS.
- Perf budget (tests/perf-budget-browser.mjs, built preview): all eight places within limits (nothing new at the start).
- Pictures mid-chorus (Golden Rails): `.tools/group/final/sheet-pc-8.png`, `sheet-phone-4.png` (and the single frames);
  a 26 s PC recording of the eight: `.tools/group/final/pc-8-performance.webm` (local only).

## Owner decisions
1. Keep the six packs nobody fetches yet (moves-vroid-nu1/nu3/nu4/nu5/nam2/nam3, 5.2 MB packed in the deploy) or drop
   them until a member needs a solo show? (The group needs only nam-1's.)
2. Names for the seven (the files are vroid-<id>; the game shows no names yet).
3. Group of 8 on phones: off (measured); allow it on a strong phone (Medium tier is already 8)?
4. Golden Rails: Kotone's own planted-foot slide is 1.68 cm/s p95 (the gate is 1.5); a plan-side fix is hers to make.
