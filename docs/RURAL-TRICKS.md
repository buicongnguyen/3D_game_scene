# Grandma's Countryside Tricks: plan

Status: **plan**. Goal: a game a city kid would love before (or after) a visit to the countryside. Each real rural
activity becomes a **short game that Grandma teaches once** ("Grandma's trick"). After that the player can do it
any time it is in season. Each trick learned is kept in a new journal page with the **real-world fact**, so the
kid can try it for real.

It builds on the systems already in the game:
- the mini-game round and results card (`docs/MINIGAMES.md`);
- the critters (`src/actors/critters.js`);
- Town Life, the friends journal and the two stories.

In Classic, Rin teaches the tricks instead of Grandma.

## 1. How it plays
1. **Learning.** Grandma (or a neighbour) mentions a trick when its season and time come round, e.g. "Summer
   night, Mi-chan. Fireflies by the stream. Bring a jar." Her garden has a **trick board** listing which tricks are
   in season now. A trick sign appears at its place (stream, paddy, oak grove…).
2. **First time.** A 20-second guided try, with Grandma's hints shown as speech bubbles.
3. **Afterwards.** It becomes a normal mini game: score, stars, rewards and a personal best.
4. **The journal "Tricks" tab.** One card per trick:
   - a picture;
   - **"How to do it for real"** (two lines);
   - **"Why it works"** (one fun fact);
   - best score and stars.

## 2. New creatures and things (Blender, light: ≤ 300 tris, instanced or pooled; `docs/FARMING-PLAN.md` art rules)
| New | Where / when | Used by |
|---|---|---|
| **Frog** (green tree frog + brown pond frog; clips Idle, Croak (throat sac), Hop, Swim) | paddies, pond edges, the river bank; spring–summer; loudest after rain and at dusk | Frog chorus, Tadpole jar; ambient croaking; befriend |
| **Tadpoles** (instanced little swimmers) | paddies and puddles in spring, turning into froglets in summer | Tadpole jar (grow them to frogs) |
| **Fireflies** (instanced glow points + a tiny firefly model for close-ups) | over the stream and paddies on summer nights | Firefly jar |
| **Rhinoceros beetle and stag beetle** (clips Idle, Walk) | oak and chestnut trees in the orchard and forest; summer nights | Beetle sap trap |
| **Crayfish / river crab** (Idle, Walk, Pinch) | stream shallows and paddy ditches | Crab on a string |
| **Cicadas** (sound mostly, a few models on trunks) | summer days | ambience, a "spot the cicada" trick |
| **Glowing eyes in the water** (instanced billboards: shrimp eyeshine) | river shallows at night | Night river lantern |
| **Props:** glass jar, bug net, hand lantern (exists), bamboo kite kit, string + dried fish, sweet potato, straw pile | — | the tricks |

## 3. The tricks (each a 30–90 s game)
| # | Trick | Season / time | How it plays | Real-world fact on the card |
|---|---|---|---|---|
| 1 | **Firefly jar** 🫙 | summer, dusk–night | Sweep the net through the glowing dots; fireflies flash on a rhythm, so catch them when they glow. 10 make a jar lantern. Walk Grandma's dark path by its light, read the note it reveals, then let them go | Fireflies flash to talk to each other; each kind has its own blink pattern. They need clean water and darkness. Always let them go before bed |
| 2 | **Night river lantern** 🏮 | any season (not winter), night | Wade the shallows holding the lantern. In its circle sleepy fish hold still and show clearly; shrimp eyes sparkle back. Spot and name the fish (adds to the fish log; some fish appear only at night) | Many fish rest near the bottom at night. Shrimp eyes reflect light back like cat eyes ("eyeshine") |
| 3 | **Frog chorus** 🐸 | spring–summer, dusk; after rain | Sneak up on a croaking frog: walk when the chorus is loud, freeze when it goes quiet. Reach it and it hops onto Mika's hand. A Simon-says round follows: copy the frogs' call order | Frogs sing loudest after rain. The throat pouch works like a speaker. Only male frogs call |
| 4 | **Tadpole jar** 🌱 | spring (catch) → summer (release) | Scoop tadpoles from a paddy into a jar (gentle timing). Keep the jar on Grandma's porch, where they grow legs over the chapters (or days in Explore), then release the froglets | Tadpoles grow back legs first, then front legs; the tail shrinks away. It takes about 6–12 weeks |
| 5 | **Cricket by its song** 🦗 | summer–autumn, night | Close your eyes (the screen dims): the chirp grows louder and pans as you turn and walk toward it. Find it, then tickle it out with a grass blade (gentle taps). **Bonus:** count chirps in 14 s to read the temperature | Only male crickets chirp, rubbing their wings. Dolbear's law: chirps in 14 s + 40 ≈ °F |
| 6 | **Beetle sap trap** 🪲 | summer, set at dusk → check at dawn | Choose an oak or chestnut tree, then rub banana and sugar on the bark. Next morning (skip the night by sleeping), see what came: rhinoceros beetle, stag beetle, moths. Gently lift one to look | Beetles drink tree sap at night. Oak and chestnut are favourites. Put them back where you found them |
| 7 | **Crab on a string** 🦀 | spring–autumn, day | Dangle dried fish on a string by the ditch; a crayfish grabs it. Lift slowly; too fast and it lets go (a tension bar like fishing) | Crayfish hold on with their pincers and walk backwards when scared |
| 8 | **Grass whistle and leaf boats** 🍃 | any, day | Grass whistle: hold the blade tight and blow on the beat to play a tune. Leaf boats: fold a boat (3 timing folds) and race it down the stream against the kids | A tight grass blade vibrates like a reed in an instrument |
| 9 | **Make a kite** 🪁 | autumn–winter, windy days | Build it: bamboo cross, paper and tail, in three quick steps. Fly it on the meadow by reading the wind (grass and cloud direction); keep it up through gusts | Wind is steadier higher up. A tail keeps a kite from spinning |
| 10 | **Sweet potato roast** 🍠 | autumn, after harvest | Build a straw fire, bury the potatoes and watch the colour: dig out too early and they're raw, too late and they're burnt. Share them with the kids | Ash keeps an even, gentle heat, like an oven |
| 11 | **Stargazing** ✨ | clear nights, all seasons | Lie on the hill, join the stars into the Big Dipper, follow its pointer stars to the North Star, and spot the Milky Way and a shooting star | Without city lights you can see about ten times more stars. The North Star barely moves, so travellers used it |
| 12 | **Nature's weather signs** ☁️ | any | Grandma's quiz walks: notice the signs (ants in a line, swallows flying low, a red evening sky) and guess tomorrow's weather. The weather then really follows | Swallows fly low before rain because the insects they eat fly lower in damp air |
| 13 | **Dew webs at dawn** 🕸️ | spring–autumn, dawn | At dawn the spider webs sparkle with dew. Find 5 hidden webs (photo mode) | Webs are almost invisible until dew or mist shows them |
| 14 | **Skipping stones** 🪨 | any, day | Pick a flat stone (shape matters), then time the angle and power. Count the skips | A flat stone at a low angle bounces on the water's surface like a tiny surfboard |

## 4. Rewards and links
- **Stars and friends.** Each trick gives Harvest Stars (as in `docs/MINIGAMES.md`). New creatures (frog, beetle,
  crayfish) join the friends journal.
- **Unlocks tied to tricks:**
  - the firefly jar works as a lantern in dark places;
  - the night river reveals night-only fish for the fish log;
  - the kite you make can be flown again on any windy day;
  - the roasted potatoes are a gift every neighbour loves.
- **Neighbours.** The Town Life kids (Kenta, Yui, Sumi, Hiro, Nao) join tricks 7, 8 and 10 and challenge your best
  scores. Their speech bubbles cheer you on.
- **Seasons give a reason to come back:**
  - spring: tadpoles, frogs, dew webs;
  - summer: fireflies, beetles, crickets;
  - autumn: kite, sweet potato;
  - winter: stargazing and weather signs.

## 5. Priority: most visible and most "only in the countryside" first
Scored on two things: **visible** (how striking it looks on screen, in a screenshot or a video) and **rural spark**
(how strongly it says "you can't do this in the city", and makes a kid want to try it for real).

| Rank | Trick | Visible | Rural spark | Why it ranks here |
|---|---|---|---|---|
| 1 | **Firefly jar** | ★★★ | ★★★ | Hundreds of glowing dots, then a living lantern in your hands: the icon of a countryside night. No city kid has done it |
| 2 | **Night river lantern** | ★★★ | ★★★ | A circle of light on black water, fish clear as glass, shrimp eyes twinkling back. Pure magic, and real |
| 3 | **Stargazing** | ★★★ | ★★★ | The Milky Way, impossible under city lights. The biggest sky shot in the game; it teaches the North Star |
| 4 | **Frog chorus** | ★★☆ | ★★★ | A paddy full of singing frogs after rain, throat pouches puffing; the sound alone says "countryside" |
| 5 | **Make & fly a kite** | ★★★ | ★★☆ | A home-made kite high over the valley; a classic rural childhood (thả diều) |
| 6 | **Dew webs at dawn** | ★★★ | ★★☆ | Sparkling webs everywhere at sunrise: beautiful, and it teaches noticing |
| 7 | **Sweet potato roast** | ★★☆ | ★★★ | Fire glow, smoky field, sharing hot potatoes with the kids (nướng khoai): warm and social |
| 8 | **Beetle sap trap** | ★★☆ | ★★★ | Big rhinoceros beetles on a tree at dawn; a "set it at night, check in the morning" wonder |
| 9 | **Cricket by its song** | ★☆☆ | ★★★ | Played by ear; less to see, but the chirp thermometer is a great "wow, really?" fact |
| 10 | **Tadpole jar** | ★★☆ | ★★★ | Slow magic: legs appear over the chapters; teaches life cycles |
| 11 | **Crab on a string** | ★★☆ | ★★☆ | Funny and simple; a good kids' challenge |
| 12 | **Weather signs** | ★☆☆ | ★★★ | Clever knowledge (swallows, ants, red sky) but quiet on screen |
| 13 | **Skipping stones** | ★★☆ | ★☆☆ | Fun, but a river in a city park can do it too |
| 14 | **Grass whistle & leaf boats** | ★☆☆ | ★★☆ | Charming small extras |

## 6. Build phases (in that order)
| Phase | Contents |
|---|---|
| **1** | Trick framework (Grandma teaches → guided first try → mini-game round → journal Tricks tab with real-world facts); **Firefly jar**, **Night river lantern**, **Stargazing**, **Frog chorus** with the frog model (+ ambient frogs and croaking around the paddies) |
| **2** | **Make & fly a kite**, **Dew webs at dawn**, **Sweet potato roast**, **Beetle sap trap**; beetle models |
| **3** | **Cricket by its song** (positional chirp), **Tadpole jar** (grows over time), **Crab on a string**; crayfish + tadpole models |
| **4** | **Weather signs**, **Skipping stones**, **Grass whistle & leaf boats** |

Each phase delivers:
- **Rules** as pure, tested modules (recorded inputs).
- **Art** in Blender, kept within the light budgets.
- **Text** in vi/ko/ja.
- **Browser checks** on desktop and phone.
- **Draw cost** compared A/B against the previous release.
- **Both stories** pass the full-story autopilot.
- **Deploy.**

## 7. Safety and kindness notes (shown on cards where relevant)
- Always let fireflies, frogs, tadpoles, beetles and crabs go where you found them.
- Go to the river at night only with a grown-up; stay in the shallows.
- Fires are for grown-ups: a grown-up lights the straw.
