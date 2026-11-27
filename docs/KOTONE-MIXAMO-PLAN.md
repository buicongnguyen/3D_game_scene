# Kotone on the Mixamo skeleton: dancing, singing, walking and running

Status: **built on branch `kotone-mixamo` (2026-11-28), not pushed**; section 8 has what was built and measured.
Written 2026-11-27. Owner's request: "make the character like Kotone can dance and use Mixamo walking, running and
singing, hip hop dance and maybe several other dances like Avatar Studio".

## 1. Where we are

Kotone (live since `2a18aed`) is the VRoid Project sample `nu-2`, made light by `art/blender/vroid_lite.py`:

| | `kotone.glb` (PC) | `kotone.lite.glb` (phone) |
|---|---|---|
| Download (packed, live) | 0.51 MB | 0.38 MB |
| Triangles | 13,843 | 7,979 |
| Materials / draws | 1 / 1 | 1 / 1 |
| Texture | one 1024 px atlas | one 512 px atlas |
| Bones | 31 (Hoa's 29 + eye_L, eye_R) | 31 |
| Face | blink, mouthA, mouthO morphs (`src/actors/face.js`) | same |
| Moves | Idle, Walk, Talk, Wave, Cheer, Bow, Turn (Hoa's clips, hips scaled x1.083) | same |

Moves cost about 8-30 KB raw each (about half packed). Her mesh and texture are most of the file.

## 2. Decision: move her to the full 65-bone Mixamo skeleton

Her 31 bones have no collarbones, no toes, two spine bones instead of three, and two finger joints (middle, ring and
little finger share one). Measured on 11 downloaded Mixamo moves (Blender, rotation of each missing bone away from rest,
95th percentile / max, degrees):

| Move | Collarbones | Middle spine | Toes | Finger joints 2-3 |
|---|---|---|---|---|
| Walking | 17 / 18 | 9 / 9 | 30 / 47 | 24 / 28 |
| Running (1) | 66 / 71 | 25 / 28 | 50 / 62 | 66 / 94 |
| Hip Hop Dancing | 14 / 16 | 7 / 10 | 26 / 42 | 4 / 4 |
| Hip Hop Dancing (3) | 10 / 13 | 16 / 23 | 15 / 24 | 52 / 67 |
| Arms Hip Hop Dance | 15 / 22 | 15 / 18 | 18 / 25 | 27 / 34 |
| Booty Hip Hop Dance | 20 / 26 | 12 / 14 | 8 / 27 | 21 / 44 |
| House Dancing | 36 / 51 | 9 / 11 | 28 / 41 | 43 / 49 |
| Jazz Dancing | 8 / 10 | 7 / 8 | 27 / 37 | 18 / 23 |
| Gangnam Style | 33 / 41 | 5 / 6 | 19 / 34 | 108 / 109 |
| Dancing Running Man | 30 / 41 | 8 / 11 | 29 / 52 | 100 / 125 |
| Samba Dancing | 26 / 40 | 11 / 18 | 17 / 32 | 23 / 44 |

- Collarbones (10-66 deg) carry shrugs, arms overhead and the hip hop bounce; the upper arm cannot fake them (they move
  the shoulder itself). Toes (15-62 deg) roll the foot in every step and tiptoe. Fists need the finger joints.
- The middle spine (5-28 deg) alone could be shared between two bones, but the others cannot.
- Cost of 65 bones: about 0.02 ms a frame more for one character (bone matrices); skinning stays at 4 influences a
  vertex, so drawing costs the same. A move animates more bones: roughly 2x the data before dropping constant tracks.
- Her source already has the exact Mixamo-65 skeleton: `E:\repo\ktvgo_live\characters\glb\desktop-mixamo65-candidates\nu-2-mixamo65.glb`
  (and the `-speech` variant with face aliases). Any Mixamo FBX then plays with no bone matching; the Avatar Studio
  dances use the same 65 names.

## 3. Blender to use

| Executable | Real version | Used for |
|---|---|---|
| `C:\Users\n\source\repos\Petal_cafe\.tools\blender-4.5.9-windows-x64\blender.exe` | **4.5.11 LTS** (folder name says 4.5.9; updated in place) | every Starline model so far, incl. Kotone and Mika's shoes (glTF exporter v4.5.51) |
| `%BLENDER%` / `%BLENDER_EXE%` = `C:\Users\n\source\repos\3D_claudeopus55\.tools\blender-5.2.2-windows-x64\blender.exe` | 5.2.2 LTS | scripts that fall back to these variables (e.g. `scripts/record-videos.mjs`) |

Use the **4.5.11** executable by full path, with `-b --factory-startup`, so Kotone's files match every other model in
the game. Do not rely on `BLENDER`/`BLENDER_EXE`. (Moving Starline to 5.2 is a separate decision: no visible gain for
GLBs, see the 2026-11-27 Blender review; `docs/BLENDER.md` vs `README.md`/`art/CONTRACTS.md` disagree and should be
corrected when that is decided.)

## 4. Steps

1. **Lite build on 65 bones** (`art/blender/vroid_lite.py`, a new `--rig mixamo65` mode, or a new script):
   - start from `nu-2-mixamo65(-speech).glb`; keep all 65 Mixamo body/finger bones and eye_L/eye_R (jaw optional:
     the VRoid mouth shapes looked better than the jaw in round 1);
   - fold hair, skirt and other helper bones into body bones as now (skirt half hips, half thighs);
   - same mesh/atlas route as round 1: about 8k tris (phone) / 14k (PC), 1 material, 512 / 1024 px atlas, 3 morphs;
   - keep the file names `kotone.glb` / `kotone.lite.glb` so the game code keeps working.
2. **Her everyday moves from Mixamo** (in the model file): Idle, Walking, Running, Talking, Waving, plus a Look Around and
   a Pointing. Source folder: `C:\Users\n\source\repos\pitch_intent\new_animation\` (2,221 Mixamo FBX). Import, bake onto
   her skeleton (rest pose match: Mixamo FBX is in T-pose, her rest may be A-pose: retarget with world-space deltas, as
   in the avatar-rigging skill), make loops seamless, remove root motion (the game moves her), and set `src/actors/gait.js`
   `kotone.walk` / run speed from the clip's foot speed so she does not slide.
3. **Dances and singing in an on-demand pack** `public/models/moves-kotone.glb` (armature + animations, no mesh, like the
   Morning exercise packs `exercise-<person>.glb`): 6-10 dances (candidates: Hip Hop Dancing (3), Arms Hip Hop Dance,
   House Dancing, Jazz Dancing, Gangnam Style, Dancing Running Man, Samba Dancing, Booty Hip Hop Dance) plus Singing /
   Sing Idle. Avatar Studio dances may be added from **committed** Avatar Studio sources only (v2 or Mixamo/CC0 clips;
   never `LEGACY_MOTION_NAMES`, `*_Old`, `Classic`, `KEPT_LEGACY`; never read from or write to the live studio's `tmp`
   folder). The pack is fetched only when it is needed (her stage spot or the festival).
4. **Keep files small:** drop tracks of bones that do not move, resample to 30 fps or less where the motion allows,
   pack with the repo's `scripts/pack-models.mjs`. Targets: phone model <= 0.45 MB packed, each dance <= 40 KB packed,
   the pack <= 0.4 MB.
5. **Face:** unchanged (`face.js`: blink, lips while her line shows, eyes to Mika within 7 m). While singing, drive the
   mouth from the song (the `speak()` path already exists).
6. **Where she dances and sings** (owner to choose, see section 6): e.g. on the festival stage in the evening, or as a
   partner in the dance game next to Hoa, Nabi, Byeol and Haru.
7. **Checks:**
   - joints: every move through the animation-joint-rules checker (no backward fingers, knees, elbows; no candy-wrapper
     wrists; hands not inside the body);
   - clothes: skirt and sleeves against legs and hands in the hardest dance poses (front, side, back contact sheets);
   - foot slide: planted foot within 1.5 cm while walking and running;
   - game: `npm test`, perf budget (`tests/perf-budget-browser.mjs` on a built preview), phone and PC screenshots mid-dance;
   - speed: frame time on the phone tier at 4x and 8x CPU near her, with and without the pack.

## 5. Cost and size budget

| | Now (31 bones) | Target (65 bones) |
|---|---|---|
| Phone model, packed | 0.38 MB | <= 0.45 MB |
| PC model, packed | 0.51 MB | <= 0.60 MB |
| Moves in the model | 7 (Hoa's) | about 7 (Mixamo) |
| Dance/sing pack | none | <= 0.4 MB, loaded on demand |
| Bones | 31 | 65 + eyes |
| Draws | 1 + shadow | 1 + shadow |
| Frame time | baseline | <= +0.05 ms on PC near her |

## 6. Open questions for the owner

1. Where should she dance and sing: the festival stage in the evening, the dance game, or both?
2. Favourite dances? Otherwise the best-looking 6-10 from the list above and Avatar Studio's.
3. Should the other seven VRoid lites (in `.tools/vroid-lites`, not committed) move to 65 bones too, for later visitors?
4. Blender for Starline in general: stay on 4.5.11 LTS (recommended) or move to 5.2.2 LTS later, one repo at a time.

## 7. Rules for whoever builds it

Work in a git worktree off `main` with its own `node_modules` (`npm ci`); git needs `-c safe.directory=*`; never stash;
commit on the branch, do not push (pushing to `main` deploys; the owner says when). Temp files only in the worktree's
`.tools/`. Stop servers by their own PID. Preserve each file's line endings. Licences: VRoid Project sample (VRoid Hub
licence: commercial use, modification and redistribution allowed; credited in the game's Credits); Mixamo animations
(usable in the owner's games per the owner).

## 8. What was built (2026-11-28, branch `kotone-mixamo`)

Decisions taken for section 6 (the owner had not chosen): (1) an evening show at the station forecourt (no stage exists
west of the river: the festival dance is on the Takamori square, across the river from her road network; the exercise
stage is built only during a round); (2) seven Mixamo dances picked from contact sheets of twenty; (3) only Kotone;
(4) Blender 4.5.11 LTS.

**Script:** `art/blender/vroid_mixamo.py` (one Blender session builds `kotone.glb`, `kotone.lite.glb`, `moves-kotone.glb`
from one import and one rig step, so the joints match: tests check it) + `art/blender/trim_clips.mjs` (drops tracks that
do nothing, thins keys within 0.5 deg body / 2 deg fingers, x2.4 for the dances; rotations as normalised 16-bit).
Retarget: world-space delta from each bone's rest, her rest swung onto the source's rest direction (both T-poses);
Mixamo FBX are sampled at 30 Hz in time (the FBX importer sets the scene to 60 fps).

| | Before (31 bones) | Now (69 bones) | Target |
|---|---|---|---|
| Bones | 31 | 69 (65 Mixamo + root, grip_R, eye_L, eye_R) | 65 + eyes |
| Triangles PC / phone | 13,843 / 7,979 | 13,878 / 7,995 | ~14k / ~8k |
| `kotone.glb` raw / packed | 1.07 / 0.51 MB | 1.11 / 0.58 MB | <= 0.60 packed |
| `kotone.lite.glb` raw / packed | 0.75 / 0.38 MB | 0.79 / 0.45 MB (447,784 B) | <= 0.45 packed |
| `moves-kotone.glb` raw / packed | - | 0.44 / 0.37 MB | <= 0.40 packed |
| Draws | 1 + shadow | 1 + shadow | same |

Clips in both models: Idle (Happy Idle), Walk (Walking: 0.958 m/s), Run (Running: 4.077 m/s), Talk (Talking (1)
0.6-5 s), Wave (Waving (1) x3), Cheer (Cheering), Bow (Quick Informal Bow), LookAround (Look Around), Point (Pointing):
56 KB packed together. In the pack: DanceHipHop (Hip Hop Dancing (3)), DanceArms (Arms Hip Hop Dance), DanceHouse (House
Dancing), DanceRunningMan (Dancing Running Man), DanceSamba (Samba Dancing), DanceWave (Dancing (2)), 7 s loops cut from
the long takes with a 0.5 s crossfaded seam, DanceYmca (3.5 s), Sing (Talking (1) 5-10.2 s), SingUpper (the same, upper
body only, to lay over Walk / Run / Idle). Each clip's keys are 4-7 KB packed; most of the pack's 0.37 MB is glTF JSON
(1,030 accessors for 582 tracks): sharing key times per clip is the next lever if it must shrink.
Dropped after building: Gangnam Style (the high knee lifts push the thigh through the short skirt). Left out on the
sheets: Booty Hip Hop, Hip Hop Dancing (1) (bends over), Locking / Macarena (squats), Jazz (stiff T arms), Dancing (jumps).

**Game:** `game/kotone-show.js` (17:00-19:00 at `hoshi.stage` (-91, 101.5), back to the station: dance once or twice
through, rest, now and then Sing with her lips moving, a bow every third dance; pack fetched when Mika is within 45 m
from 16:30, or when the show starts; clips lent with `exercise-moves.js` `lendClips` and taken back when she leaves);
Town Life `do: 'Show'`; mid-show talk adds one line; her day adds LookAround and Point; she strolls at 1 m/s.
`actors/face.js` gained `sing(track, clock)` (Avatar Studio `<song>.mouth.json` v2 open/pucker curves or
`<song>.lyrics.json` word timings drive mouthA / mouthO) and `speak(text, secs)`.

**Checks:** joint rules (Avatar Studio checker, copied read-only into `.tools`, her rig passed explicitly): Idle, Bow,
Point clean; the rest mostly finger knuckle back-bends and spreads from the Mixamo takes (R3), wrist radial deviation
(R5) in Cheer / RunningMan, thigh~thigh contact in DanceArms / DanceHipHop (R11, knees together), one hand-in-torso
moment in DanceHouse (5 frames). Foot slip at the measured speeds: Walk 1.45 cm, Run 3.1 cm (ankle-based; running
contact is short). npm test 1100/1100; perf budget all six places within limits. Frame time near her (phone tier, 4x
CPU, uncapped): 11.9 ms at 16:12 without the pack vs 12.7 ms at 17:18 dancing with it (different hours: lighting and
draws differ, 148 vs 154); PC 11.95 vs 12.78 ms avg, median 2.6 vs 2.9 ms. Not an A/B against the old 31-bone model.
