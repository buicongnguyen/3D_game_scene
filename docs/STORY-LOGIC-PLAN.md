# Story logic and replay plan

This guide contains spoilers. Each row pairs a player action with a change the player should be able to see or explain. Both stories use the same step IDs, so a save's story and step together determine its dialogue and objectives.

| Chapter | What the player does | What changes and why |
| --- | --- | --- |
| Arrival | Get off the train, walk to the cottage, open the chest and light the porch lamp. | In Classic, Mika reads her late grandmother's letter. In A Year with Grandma, Sora welcomes her in person. Tamo joins Mika. In Grandma's story, the porch shows how an oil lamp works before Mika introduces the bulbs. |
| Spring at the mill | Catch three fish for Ōta's meal, recover three cogs, repair the wheel and cross the drawbridge to the Mill Lamp. Return to Ōta. | The lamp reveals a memory, Ōta gives Mika the first diary page and Rin can take her across the river. In Grandma's story, repairing the wheel also lets it drive Kobo's spare dynamo and power the first bulb. |
| Summer in the orchard | Return five sheep, ring five scarecrow bells and pick five peaches. Deliver Hana's bun to Genzo and bring back his answer to get the tower key. Ring the bell, light the Orchard Lamp and visit Hana. | Genzo refuses the bun in Classic. In Grandma's story he eats half and sends the other half back with a note, which Hana understands as thanks. Hana gives Mika page two and opens the upper orchard gate. |
| Autumn at the shrine | Walk through the gate and follow Kon. Gather three chestnuts, two mushrooms and one honeycomb. Cook at the hearth, visit the slope, feed Ōkuma and reach the Forest Lamp. | In Classic, the landslide explains the flood and the lamp recalls Sora's warning. In Grandma's story, Genzo's sign marks where last year's flood moved the path. Feeding Ōkuma opens the stairs, and Mika recovers page three. |
| Winter on the railway | Speak to Genzo, invite Ōta and Hana, meet on the platform, fit three beams and light the Viaduct Lamp. Board the train and light lanterns along the route. | In Classic, the player chooses whether Genzo confesses alone or with Mika. The meeting and epilogue remember that choice. In Grandma's story, Genzo asks both villages for help and Mika's parents arrive on the restored train. Finishing the ride opens the epilogue regardless of the lantern count. |
| Spring epilogue | Find twelve distinct Fallen Stars. If Mika already has all twelve, finish the winter story to see Starfall Night. | The sky darkens, the constellations trace Sora's poem and her last letter appears before the credits. Closing the credits returns control to the player. Tamo's optional treasure hunt tracks thirteen separate finds and can continue after the ending. |

The shared chapter order, Grandma's overrides and the conditions that advance a quest are recorded in the game data. [Shared steps](../src/game/story.js) · [Grandma's story](../src/game/stories/grandma.js) · [Quest progression](../src/game/quest.js)

## Replay checks

- Create a Grandma save with one cog and a Classic save with two. Open Continue, load each slot and check the HUD against the current journal row. Older saves without a story label use Classic. On a phone, check the translated chooser and action label.
- Continue a save made during arrival. Finish the scene, walk toward the cottage, save and reload. The cottage objective should return immediately. A save from an interrupted train ride returns Mika to boarding.
- At the orchard gate, stop at the map pin. Walking to it should advance the objective to following Kon. Read the firefly drawing away from the cottage and check that the handwriting identifies Grandma as its author.
- Resume just after the twelfth star. Watch the sky, read the last letter, close the credits and save. The next Continue should return Mika to free roam. Repeat with the stars collected before winter ends.
- Replay both Classic confession choices and Grandma's winter meeting. Check who speaks on the platform, who arrives on the train and what Mika remembers in spring.

## Running the checks

Run `npm test` and `npm run i18n:check` first. For browser checks, run `npm run build`, serve it with `npm run preview -- --port 5953 --strictPort` and set `$env:GAME_URL = 'http://127.0.0.1:5953/'` in a second PowerShell window. Use a free port for both commands if 5953 is occupied.

- `npm run test:e2e -- --story=grandma --quality=low` follows Grandma's story to the epilogue. For Classic, use `--story=classic` and either `--choice=alone` or `--choice=together`.
- `node tests/navigation-guidance-browser.mjs` walks into the orchard-gate trigger in both stories on desktop and phone layouts.
- `node tests/starfall-resume-browser.mjs` continues a twelve-star save, checks the sky and letter, closes the credits and reloads the completed story.
