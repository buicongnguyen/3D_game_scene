# Town Life

Twenty named neighbours live in Kawabe and Takamori. Each one has a day plan, which sets where they go and what they
do at each hour, and a small personal story that Mika can follow across the chapters. The kids play outdoors,
shopkeepers mind their counters, and friends meet up and chat. Mika earns **mon** (coins) from errands and from
selling her catches, and spends them in three shops.

## Where things live

| File | What it holds |
|---|---|
| `src/content/townsfolk.js` | `SPOTS` (named outdoor places), `PEOPLE` (plans and stories), `FOLK_CAST` (dialogue names and colours) |
| `src/content/shops.js` | `GOODS`, `ERRANDS` (parcels passed between neighbours), `SHOPS` (grocer, sweets, stall) |
| `src/content/convos.js` | `CONVOS`: two-person conversations Mika can overhear, as speech bubbles |
| `src/world/roads.js` | Pure. Road graph built from `PATHS` with spurs to spots and doors, routes, and placement rules |
| `src/game/schedule.js` | Pure. `Planner` turns a day plan into commands; `Meetings` handles rendezvous |
| `src/game/folk.js` | Pure. Story stages, requests, shop buy/sell, and the journal summary |
| `src/game/townlife.js` | Runtime. Runs the planners' commands on NPCs and handles props, kids' games, conversations, talking and shopping |

The pure modules are covered by `tests/roads.test.mjs`, `tests/schedule.test.mjs` and `tests/folk.test.mjs`. These
tests also validate the real content:
- every spot is placeable and attached to a road;
- every route stays in its own village;
- a 24-hour simulation of each plan produces well-formed commands;
- every story can be completed.

## Day plans

A plan is a list of hour blocks, `{ from, tasks, when? }`. The block in force is the one with the latest `from` that is
at or before `game.shownHour()`. Its task list then **loops** until the next block. The story clock is usually frozen
at the story hour, so every block must be a satisfying loop on its own.

Optional `when` conditions: `{ lamps: n }` (at least n lamps lit), `{ folk: { id: stage } }` (that neighbour's story
has reached this stage), `{ chapter: [a, b] }`. Among blocks with the same `from`, the last one listed whose
condition holds wins. So list the plain block first and the conditional one after it, and read the pair as "until /
from then on".

Task kinds:
- `go` (walk the roads to a spot or `door:<building>`)
- `do` (play a clip for t seconds, optionally with a prop in the right hand)
- `inside` (go home through the door)
- `sell` (mind the shop: indoors for a shop room, in plain sight at an open-air stall)
- `chat` (meet a partner at a spot)
- `play` (kids' games: `ball`, `tag`, `hop`)
- `deliver` (door to door)
- `wander`

At night (20:00–05:00) everyone goes home, unless their block says `night: true`.

Movement rules:
- **Routes:** walks follow the road graph. There is no bridge, so Kawabe folk never cross the river and Takamori folk
  never come west.
- **Meetings:** whoever arrives first waits up to 40 s. A waiting partner calls the other person over from any small
  chore or errand they are on.
- **Hour jumps:** an hour jump over 0.75 h (a story time-lapse) teleports people instead of walking them across the
  village.
- **Games:** a kid who starts a game calls over the friends named in its `with` list, if they have the same game in
  their current block. A kid left alone at a game for 8 s moves on to their next task.
- **Manners:** a walker who meets Mika face to face (within 2.2 m, and she isn't running) stops, turns to her and
  waves, then walks on once she steps away. Walkers sidestep each other and Mika to keep 0.7 m apart.
- **Scenes:** scenes that need a neighbour (the parties, the meeting) call `town.release(id)`. That brings them back
  into sight and resets their plan.

## Stories, errands and shops

The `story` stages of each person run strictly in order. Each stage plays when Mika talks to them and its `when` holds:
- `chapter: [a, b]`;
- `after: stepId`, meaning that main-story step is finished;
- `lamps: n`.

A stage may `need` items, which are taken from Mika, and may `give` items or mon. The first talk without the items
plays the stage's `ask` line. The journal's **Neighbours** tab then shows the request.

**Rules:**
- A request for something the main story still needs (fish, chestnuts, mushrooms, or anything a later step takes) is
  only asked, never taken, until the story is done with it.
- Shops never buy or sell story items (`PROTECTED` in folk.js), nor anything a current or later step still needs.
- Every line must stay true for the whole range in which it can play. Because stages run in order and their ranges
  end at the epilogue, a line about "next week's festival" has to survive being heard months later.

## Playing ball with the kids

Near a ball game, Mika can **Join the ball game**. The kids throw to her about half the time; **Throw the ball** sends
it to one of them, and every third throw someone cheers. While she plays, the kids stay in the game. Walking more
than 9 m away tosses the ball back and ends her turn. There is one ball in the valley: it belongs to the ball game
nearest Mika.

## Overheard conversations

When two people's `chat` tasks bring them together and Mika is within 20 m, they trade 2–4 bubble lines. Their own
running story plays first, in `after` order; generic chit-chat (`a`/`b` = man, woman, kid or any) plays otherwise.

`when` keys: `chapter`, `season`, `night`, `lamps`, `folk`. A conversation counts as heard (saved in
`quest.state.heard`) only if Mika was close enough to read it.

## Art

Villager clips: Run, Jump, Bow, Interact, Hammer, Sweep, Carry, Sit, Throw, Kick.

Props: ball, broom, bucket, basket, letters, hoe. They come from `art/blender/build_townlife.py`, and the grip
rotations are in `townlife.js` (`GRIP`).

**Sit:** the clip puts the hips on a 0.45 m seat over the root. That is why a bench is placed at every spot where
someone sits.

The goods' icons are in `public/icons/`. See `art/CONTRACTS.md` → "Town Life villager clips".

## Performance

People get a level of detail every 0.3 s (`Director.updateDetail`). The distances come from the quality tier
(`npcAnim`, `npcDraw`, `npcShadow` in `src/engine/renderer.js`):
- **Near:** full detail.
- **Mid-range:** animated every third frame, with no shadow.
- **Far:** not drawn. Their plans keep running.

Measured against the previous release on the same save and camera views, the busier valley draws slightly fewer calls
and triangles on low and medium quality, and the director's per-frame time also went down.
