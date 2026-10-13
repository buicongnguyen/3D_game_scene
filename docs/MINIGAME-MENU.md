# Mini games menu

A "Mini games" button on the title menu (and in the pause menu) opens a picker of every game in the valley. Choose one and
you play it straight away: no story progress, no Grandma or Rin teaching it first.

**Learn to swim** is in Countryside tricks. Rin guides a supervised virtual pool lesson through bubbles, front/back
floating and recovery, treading, travel, turning toward the exit, swimming back and climbing onto the deck.
Use movement plus hold/release/tap Action as each cue asks. The lesson has a four-minute budget and rewards completion
only after the dry exit. See [the researched lesson plan](SWIMMING-LESSON-PLAN.md) for the controls and design.

Every running mini-game has a visible **Stop playing** button on desktop and touch screens. It returns through the
game's normal cleanup and does not record an unfinished round or award its stars. Fishing packs up the rod and sky
watching descends normally; catches and workshop construction already earned before stopping are kept. The control
waits for teaching dialogue to finish and is hidden on completed results cards.

**Ô ăn quan** also has a persistent **How to play** button. Its written rules and step-by-step examples pause the live
round without changing the board or scores. Close the guide to resume, or use Stop playing while it is open.

## Where the list comes from

`src/content/minigames.js` builds the catalogue at run time from the sources of truth, so a game that lands later appears
with no edit here:

| source | what it adds |
| --- | --- |
| `content/tricks.js` TRICKS | one card per trick (countryside, stargazing, bug catching, archery, cow races...) |
| `game/yard/index.js` YARD_GAMES + `content/yard.js` YARDS | one card per yard game that a yard hosts |
| `game/fishing/places.js` SPOTS | one card per fishing place |
| `content/skyspots.js` SKY_SPOTS | "Look up at the sky" on open ground (not the lamp towers) |
| the Kite workshop | one card |

A small hand-written `META` table adds the category, a one-line description, an icon and the best season and hour for each
game. A game with no row still appears with its own name and icon (category by id, season and hour from its own rules).
Categories: Countryside tricks, Playground games, Fishing, Sky & stars, Animals & riding (a tab with no game is not shown).
`tests/minigame-menu.test.mjs` checks every trick, yard game and fishing place has an entry and a valid launch plan.

## How a launch works

`src/game/minigame-menu.js` (`director.minigameMenu`). The plan (`launchPlan`) gives the season, the hour and where Mika stands.

* **From the title.** The button resolves `ui.title()` as an Explore session in the existing `explore` save slot (every way open,
  scores and learned tricks are kept there) and leaves `ui.pendingLaunch`. `Director.begin()` hands it to `launchFirst()` once
  the world is ready: fade, season and hour overrides (like Explore), Mika placed at the game's spot, the teacher's intro as a
  short local scene on the first play (the trick is then marked taught), then the game's own round runner. After the results
  card Mika stays at the place in free roam, with a hint and a "Mini games" chip (top-left, under the objective, hidden in rounds).
* **From the pause menu in Explore.** The same, without leaving the world.
* **From the pause menu in a story save.** The valley is borrowed like the scene tour borrows it: a throwaway quest (the valley
  after the story, every gate open) stands in for the real one, `tourLock` blocks every save, and when the game ends Mika, the
  season, the hour, the camera and the story are put back. The save file, the quest, her position and the overrides are
  identical afterwards (`tests/minigame-menu-browser.mjs` compares snapshots). Scores from such a session are not kept.

`tests/minigame-menu-browser.mjs --all=1` launches every game in the catalogue once and lists those that fail to start or to come back.
