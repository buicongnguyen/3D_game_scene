#!/usr/bin/env bash
# Apply Starline's fixed src/mobile-game-support.mjs (the touch helper that forced layouts every frame) to the other repos.
# Run from Git Bash:   bash apply-mgs-fix.sh            -> dry run: only reports what it would do
#                      bash apply-mgs-fix.sh --push     -> commits and pushes to origin/main of each listed repo
# Safe by design: each repo gets a TEMPORARY worktree from origin/main, so your working folders and uncommitted work are
# never touched; a repo is skipped unless its helper is byte-identical to the slow version (blob c1d6b499...); no force push;
# if a push is rejected (someone pushed meanwhile) the repo is reported and left alone.
REPOS_DIR="/c/Users/n/source/repos"
SOURCE_REPO="$REPOS_DIR/3D_game_scene"
SLOW_BLOB_PREFIX="c1d6b499"
PUSH=0; [ "$1" = "--push" ] && PUSH=1
G="git -c safe.directory=*"

# repo:path-of-helper-inside-the-repo
TARGETS="
3D_claudeopus55:src
3D_game_action:game/src
3D_game_fighting:src
3d_farmer_fish_sell:src
Attack_terrorist_3D:src
Choice_of_life:game/src
Choice_of_life_3D:src
Classic_Picnic:src
Little_Keepsakes:src
Olympic_game:src
Piano_tutor:src
Tank_game_3D:src
WorldClaw:src
game_RPG:src
hello_algo_claude_3D:src
picnic_game:src
pixel-life-journey-v3:src
race3D_game:src
sidewalk-iced-tea:client
world_of_toy:src
world_of_toy_claude:src
"

$G -C "$SOURCE_REPO" fetch -q origin || { echo "cannot fetch $SOURCE_REPO"; exit 1; }
FIXED=$(mktemp)
$G -C "$SOURCE_REPO" show origin/main:src/mobile-game-support.mjs > "$FIXED" || exit 1
grep -q attributeOldValue "$FIXED" || { echo "source file is not the fixed version"; exit 1; }
MSG=$(mktemp)
cat > "$MSG" <<'EOF'
Stop the touch helper forcing layouts in every frame of play

The safe-area observer answered every class/hidden mutation record, and
a HUD that re-applies classes each frame made it re-measure the controls
with getComputedStyle several times a frame on touch devices (30 -> 25
fps on a phone in Starline). It now reacts only when the attribute
really changed on a control or one of its ancestors. Same file as
3D_game_scene ced8e3b.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF

for t in $TARGETS; do
  repo=${t%%:*}; dir=${t#*:}; R="$REPOS_DIR/$repo"; F="$dir/mobile-game-support.mjs"
  [ -d "$R" ] || { echo "SKIP  $repo (folder missing)"; continue; }
  $G -C "$R" fetch -q origin 2>/dev/null || { echo "SKIP  $repo (fetch failed)"; continue; }
  cur=$($G -C "$R" rev-parse "origin/main:$F" 2>/dev/null | cut -c1-8)
  [ "$cur" = "$SLOW_BLOB_PREFIX" ] || { echo "SKIP  $repo (helper at $F is '$cur', not the known slow version)"; continue; }
  if [ $PUSH = 0 ]; then echo "WOULD fix $repo ($F)"; continue; fi
  W="$REPOS_DIR/$repo-mgsfix-tmp"
  $G -C "$R" worktree add --detach "$W" origin/main >/dev/null 2>&1 || { echo "FAIL  $repo (worktree)"; continue; }
  cp "$FIXED" "$W/$F"
  $G -C "$W" add "$F" && $G -C "$W" commit -q -F "$MSG" || { echo "FAIL  $repo (commit)"; $G -C "$R" worktree remove --force "$W"; continue; }
  if $G -C "$W" push origin HEAD:main >/dev/null 2>&1; then echo "OK    $repo pushed $($G -C "$W" rev-parse --short HEAD)"; else echo "FAIL  $repo (push rejected; left unchanged)"; fi
  $G -C "$R" worktree remove --force "$W"
done
rm -f "$FIXED" "$MSG"
echo "done. (cute_game has its own variant of the helper and a test for it: handle separately.)"
