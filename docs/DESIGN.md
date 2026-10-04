# Sijord: Game Design Document

> A two-player co-op, open-world monster-catching survival adventure. It plays like Palworld, has the depth of a mainline Pokemon game, and is set in the fjord-and-meadow region of **Sijord**.

| | |
|---|---|
| **Platform** | Browser first (TypeScript + Three.js). Desktop builds for Windows and macOS come later via Electron or Tauri |
| **Players** | 1-2 per world. Co-op is the intended way to play |
| **Camera** | Third person, orbit camera |
| **Art direction** | Bright, painterly and stylised: lush saturated greens, deep blue skies, soft warm light, sheer cliffs, mossy ruins, chunky characters with readable silhouettes. All assets are original or placeholder. No ripped official models or sprites |
| **Tone** | Warm and adventurous on top. The difficulty is real underneath: doable, but hard |
| **Status** | Living document. Numbers marked *(tune)* are first-pass values to be balanced in playtests |

Related docs: [ROADMAP.md](ROADMAP.md) (milestones) and [DEX_PLAN.md](DEX_PLAN.md) (species list and the 100 new creatures).

---

## Table of contents

1. [Pillars](#1-pillars)
2. [World structure](#2-world-structure)
3. [Progression: adaptive gyms and level caps](#3-progression-adaptive-gyms-and-level-caps)
4. [Battle system](#4-battle-system)
5. [Catching and aggression](#5-catching-and-aggression)
6. [Survival craft](#6-survival-craft)
7. [Player levels and classes](#7-player-levels-and-classes)
8. [Riding](#8-riding)
9. [Mega Evolution, Z-Moves and Dynamax/Gigantamax](#9-mega-evolution-z-moves-and-dynamaxgigantamax)
10. [Story](#10-story)
11. [Quest system](#11-quest-system)
12. [Substance: the content density plan](#12-substance-the-content-density-plan)
13. [Gyms: cooperative puzzle buildings](#13-gyms-cooperative-puzzle-buildings)
14. [No post-game lockouts](#14-no-post-game-lockouts)
15. [Character customisation](#15-character-customisation)
16. [Multiplayer architecture](#16-multiplayer-architecture)
17. [Controls](#17-controls)
18. [Open questions for Simon](#18-open-questions-for-simon)

---

## 1. Pillars

Every feature has to serve at least one of these pillars. If it fights one of them, it gets cut or reworked.

### 1.1 Open world freedom
From the moment you leave Bramblewick you can walk to the far side of the map, as you can in Palworld. No invisible walls and no "you need Surf" gates. Water, cliffs and snowfields are hard to cross early (stamina, cold, aggressive high-level wild creatures), but nothing makes them impossible. Only two places are hard-locked: **Crownspire** (Elite Four, 10 badges) and **Tornhavn** (Battle Tower, 5 badges). Because the world **adapts to the order you choose** (gym scaling, story beats keyed to progress rather than place), freedom never breaks the difficulty curve.

### 1.2 Substance over empty space
Our main complaint about Palworld is that it is big and mostly empty in between. In Sijord, every screen of travel offers something to do: a quirky NPC, a puzzle shrine, a ruin with a secret, a herd migration, a caravan under attack. The map is **smaller and denser** than Palworld's on purpose (see §12 for the measurable density targets).

### 1.3 Hard but fair
Bosses build competitive-level teams and play smart. Survival meters matter. Prices are high. The challenge never comes from hidden information or cheating AI: bosses never read your inputs, every rule is visible in the UI, and players get access to the same items, spreads and strategy tools that bosses use.

### 1.4 Co-op at the core
The game is built for two friends. Overworld play is "together but independent": you each fight your own wild battles, and either of you can gather, build or roam alone. **Boss content is truly cooperative.** Gyms are two-person puzzle buildings and every boss battle is a shared double battle. You need each other to progress.

---

## 2. World structure

### 2.1 The Sijord region

Sijord is an island region. Its western edge is cut by deep fjords. A spine of snowy peaks runs through its middle. Around them lie rolling meadows in the south, volcanic highlands in the east, tundra in the north and a sun-bleached canyonland in the southeast. The culture is loosely Nordic (turf roofs, stave halls, runestones, longships) and painted in Palworld's bright, saturated palette rather than grim northern greys. An ancient civilisation, the **Lysfolk**, left ruins all over the region. Their story is tied to the region's light legendaries (see §10).

**World size:** about **6 km x 6 km** of playable land plus surrounding sea, about 36 km². That is deliberately smaller than Palworld's map so it can be densely hand-authored (§12). Streaming uses 256 m chunks.

### 2.2 Biomes

| # | Biome | Where | Look | Signature hazards and features | Typical types |
|---|---|---|---|---|---|
| B1 | **Hearthmeadow Vale** | South-central | Rolling green hills, wildflowers, stone walls, windmills | Gentle start zone, berry bushes, streams | Normal, Grass, Bug, Flying |
| B2 | **Elderwood** | Centre-west | Old-growth forest, giant mossy trunks, glowing mushrooms, light shafts | Dense canopy (low visibility), tree-top paths | Bug, Grass, Fairy, Poison |
| B3 | **Fjordlands** | West coast | Sheer cliffs, waterfalls, deep blue inlets, sea stacks | Cliffs (climbing stamina), cold water, updrafts | Water, Flying, Rock |
| B4 | **Skerry Archipelago** | Far west and southwest sea | Small islands, white beaches, kelp forests, reefs | Open sea (needs a water mount or boat), storms | Water, Electric, Dragon |
| B5 | **Mirefen** | Southwest | Misty bog, stilt walkways, will-o'-wisps, sunken ruins | Sinking mud (slows), poison pools, night fog | Poison, Ghost, Water, Ground |
| B6 | **Runestone Heath** | Centre | Purple heather plateau scattered with Lysfolk megaliths | Ruin puzzles, ley lines, aurora events | Psychic, Rock, Fairy |
| B7 | **Stormcrown Peaks** | North-centre spine | Snow-capped mountains, glaciers, thunderstorms | Altitude cold, lightning, avalanches | Ice, Rock, Electric, Dragon |
| B8 | **Rimefrost Tundra** | North | Wide snowfields, frozen lakes, ice caves | Cold (insulation required), blizzards, thin ice | Ice, Water, Steel |
| B9 | **Ashen Highlands** | East | Black rock, lava rivers, hot springs, geysers | Heat (cooling required), lava, eruptions | Fire, Rock, Ground, Steel |
| B10 | **Sunscar Badlands** | Southeast | Red canyons, mesas, dry riverbeds, hoodoos | Heat, sandstorms, scarce water | Ground, Fire, Fighting, Dark |
| B11 | **Deepdelve** (underground) | Under the centre, many entrances | Crystal caverns, underground lakes, Lysfolk vaults | Darkness (lantern), cave-ins | Rock, Steel, Ghost, Dark, Dragon |

### 2.3 Settlement tiers

Every settlement has a **settlement boundary** (a circle, `Region.radius` in code). You cannot build inside it, wild creatures do not spawn inside it, and the region name shows on the HUD when you cross the line.

| Tier | Count | Footprint | What's inside | Analogy |
|---|---|---|---|---|
| **Small: fenced village** (most common) | ~28 | 60-120 m radius | Wooden palisade or stone wall, 4-10 buildings, a well, a cooking fire, a merchant tent, 1-3 quest givers, a bed you can rent. Little substance by design, but each has one quirk (see §12) | Legends: Arceus settlements |
| **Medium: town** | ~16 | 150-250 m radius | 15-30 buildings, a Poke Center, a general shop, one specialist shop (tools, berries, armour, fishing), a café or inn, a small battle venue, 4-8 quest givers, a notice board. No high-rises and not many NPCs | Mainline route towns |
| **Large: city** (rare) | 12 | 300-500 m radius | Districts, landmarks, a gym or league building, a department store, a full market, a Battle Café, transport hub (ferry or glider tower), a dense NPC population and city-specific quest chains | Mainline gym cities |
| **Hometown** | 1 | ~110 m radius | Bramblewick: a small fenced village with both players' houses and Professor Hazel's lab | Pallet Town, Littleroot |

### 2.4 The twelve large cities

Ten cities have gyms that can be taken in **any order**. Two are progression-locked.

| City | Biome | Role | Gym type | Leader (working name) | Lock |
|---|---|---|---|---|---|
| **Verdhavn** | Elderwood edge | Gym | Bug | Leader Siv, beekeeper-botanist | — |
| **Skarsund** | Fjordlands | Gym, main port | Water | Leader Bjorn, ferry captain | — |
| **Emberholt** | Ashen Highlands | Gym, smithing city | Fire | Leader Ingrid, master smith | — |
| **Voltavik** | Stormcrown foothills / coast | Gym, wind-and-hydro power city | Electric | Leader Teo, turbine engineer | — |
| **Grusdal** | Sunscar Badlands | Gym, canyon mining city | Ground | Leader Asta, canyon guide | — |
| **Isfjell** | Rimefrost Tundra | Gym, ice-harbour city | Ice | Leader Eira, figure skater | — |
| **Runeby** | Runestone Heath | Gym, university town | Psychic | Leader Professor Odd, ruin linguist | — |
| **Myrkvald** | Mirefen | Gym, stilt city | Ghost | Leader Vesla, lantern-keeper | — |
| **Blomstad** | Hearthmeadow / hot springs | Gym, flower-terrace spa city | Fairy | Leader Liv, garden designer | — |
| **Jernhamn** | Ashen / Badlands border | Gym, industrial city, Krane Industries HQ | Steel | Leader Magnus, automation engineer | — |
| **Tornhavn** | Skerry Archipelago | **Battle Tower** island city | — | Tower Tycoon Freya | **5 badges** (ferry pass) |
| **Crownspire** | Stormcrown summit | **Pokemon League**: Elite Four and Champion | — | Champion Ragna Stormhild | **10 badges** (Victory Gate) |

The Elite Four specialise in Dark, Dragon, Fighting and Poison/Flying (working). The Champion uses a mixed team built around Dragon and Ice.

### 2.5 Medium towns and small villages (examples)

**Medium towns (16):** Lyngmark, Saltvik, Hollowmere, Fernbrook, Kettlefoss (waterfall town), Coppergill (mining), Ravnsby, Stillwater Landing, Mossbridge, Thornfield, Gullhaven, Cinderbank, Duneholt, Frostgate, Lanternwell, Old Harbour.

**Small villages (~28):** for example Bramblewick (hometown), Pinecrest, Mudsock, Hearth's End, Wren's Rest, Tallowfen, Sheepcross, Glimmerhollow, Barrowfield, Owlgate, Sorrel, Kelpstrand, Emberstead, Ridge Hut, Last Light, Cairnstead and others. Each village has **one memorable quirk**. Examples: the village where everyone speaks only in rhymes, the village that worships a very ordinary Wooloo, the village whose fence keeps getting eaten.

### 2.6 Map sketch

North is up. Each cell is about 500 m.

```
            0     1     2     3     4     5     6     7     8     9    10    11
        +-----------------------------------------------------------------------+
     0  | ~~~~  ~~~~  Rimefrost Tundra .................. Frostgate   ~~~~  ~~~~ |
     1  | ~~~~  [Isfjell]  .   *ice caves*  .   .   .   .   .   .   .     ~~~~   |
     2  | ~~~ Fjord  .   .   .   ^^^ STORMCROWN PEAKS ^^^  .  [Voltavik]  ~~~    |
     3  | ~~ [Skarsund] Kettlefoss  ^^^  {CROWNSPIRE}  ^^^   .   . Ashen ..   ~~  |
     4  | ~~ Fjordlands  .  Elderwood    ^^ Victory Gate ^^ .  [Emberholt] .  ~~  |
     5  | ~~~  .   [Verdhavn]   .   .   RUNESTONE HEATH   .   .  lava  .  Ashen ~ |
     6  |~~ Kelpstrand  .   Mossbridge  .  [Runeby]  .   .  Coppergill [Jernhamn]~|
     7  |~~~~  .   MIREFEN  .   .   .  Hearthmeadow Vale .   .   .  Cinderbank ~ |
     8  |~~ (Tornhavn) [Myrkvald] .   .  Lyngmark  .  [Blomstad] .  SUNSCAR  .  ~|
     9  |~~~ Skerry  .   .  Hollowmere  .  (BRAMBLEWICK)  .   .  [Grusdal] .  ~~ |
    10  |~~~~ Archipelago ~~~   .  Saltvik  .  Pinecrest  .   Duneholt  .   ~~~  |
    11  | ~~~~  ~~~~  ~~~~  ~~~~  ~~~~ Southern Sea  ~~~~  ~~~~  ~~~~  ~~~~  ~~~ |
        +-----------------------------------------------------------------------+
  [City] gym city   {X} League (10 badges)   (Tornhavn) Battle Tower island (5 badges)
  Deepdelve caverns run under rows 3-7, with entrances in Elderwood, Runestone, Coppergill and Grusdal.
```

Design intent of the layout:
- **Bramblewick** sits south-centre. Four gym cities (Blomstad, Runeby, Myrkvald, Grusdal) are roughly equally close, so even the "first" gym is a real choice.
- The harshest biomes (Rimefrost, Ashen, Stormcrown) are farthest away and need survival gear (insulation or cooling armour). That steers the *natural* path without walls.
- Crownspire sits on the central summit, visible from almost everywhere: a constant visual goal.

---

## 3. Progression: adaptive gyms and level caps

### 3.1 Concepts
- **Badges (b):** 0-10, counted per player. Because gyms are cleared together, both players normally hold the same count.
- **World tier:** the higher of the two players' badge counts. Gym scaling uses it.
- **Level cap C[b]:** the highest level your creatures can reach **through experience**, and the highest level that **fully obeys** you.
- **Level record R:** the level of the strongest gym ace beaten so far in this world.

### 3.2 Cap table *(tune)*

| Badges held | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | Champion beaten |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Level cap C[b]** | 15 | 21 | 27 | 33 | 39 | 45 | 51 | 57 | 63 | 69 | 76 | 100 |
| Next gym's ace level | 15 | 21 | 27 | 33 | 39 | 45 | 51 | 57 | 63 | 69 | — | — |
| Wild levels, "home" biomes | 2-14 | 8-20 | 14-26 | ... | | | | | | | | |

With 10 badges the Elite Four aces sit at 72-75 and the Champion's ace at 76. Wild creatures do **not** scale. Each biome has a fixed level band (Hearthmeadow 2-14 up to Stormcrown 55-75). That is what makes far-away regions dangerous and their creatures tempting but hard to control.

### 3.3 The adaptive gym algorithm

Every unbeaten gym re-scales its whole team whenever world progress changes. The gym you happen to fight *third* is always a "third-gym" fight, wherever it is on the map.

```ts
// Runs on the authoritative server whenever a badge is awarded.
function scaleGym(gym: Gym, world: WorldProgress) {
  const b = world.tier;                       // max badges among players
  const R = world.levelRecord;                // ace level of strongest gym beaten so far (0 if none)
  // Normal case: ace = cap for current badge count.
  // Safety: never step backwards relative to what the players have already proven (R),
  // e.g. if a co-op partner joins with fewer badges or the cap table is re-tuned mid-save.
  const ace = Math.max(C[b], R + MIN_STEP);   // MIN_STEP = 6
  gym.team = gym.teamTemplates[tierBand(b)]   // species list grows / evolves per band
    .map((slot, i) => ({
      ...slot,
      level: slot.isAce ? ace : ace - slot.offset,   // offsets 1..4
    }));
  gym.teamSize   = Math.min(6, 3 + Math.floor(b / 2));  // 3 mons at b=0, 6 by b=6
  gym.aiTier     = aiTierFor(b);                         // see §4.5
  gym.itemBudget = itemBudgetFor(b);                     // held items + in-battle items
  gym.gimmick    = b >= 3;                                // Mega / Z / Dynamax allowed from 3 badges
}

// On victory:
world.levelRecord = Math.max(world.levelRecord, gym.aceLevel);
players.forEach(p => p.badges.add(gym.id));
world.tier = Math.max(...players.map(p => p.badges.size));
unbeatenGyms.forEach(g => scaleGym(g, world));
```

- **Team templates per band.** Each leader has species planned for 4 bands: badges 0-2, 3-5, 6-8 and 9. That way an early-game Ground leader fights with Sandile and Diglett, while a late-game one brings Krookodile and Garchomp with a Mega slot. Species are hand-picked; the code only sets levels.
- **The "levels at which previous gyms were beaten" rule** is the levelRecord `R`. If you beat a gym at a given level, every remaining gym starts from at least the next step above it.
- **Team quality scales too**, not just levels: the spread quality, the held items and the AI tier all step up per band (see §4.5).

### 3.4 Level cap rules
- **XP banking.** A creature at the cap stops levelling. Extra XP banks, up to one level's worth, and is applied the moment the cap rises. Grinding is never wasted, but it can't break the curve.
- **Rare Candies** and other level items cannot push a creature past the cap.
- **Caught creatures above the cap keep their level.** You can catch a level 60 Glalie with 2 badges. It just won't fully obey you (below) and can't enter boss fights.
- **Class perk:** the Tamer's *Kindred Command* skill line raises their personal obedience threshold to C[b]+3 and then C[b]+5 (see §7).

### 3.5 Disobedience
A creature is **over cap** when `L > C[b]` (plus any Tamer bonus). Let `d = L - cap`.

| d | Behaviour in wild or trainer battles, each turn |
|---|---|
| 1-5 | `p = 0.10 + 0.06*d` chance to disobey (max 40%) |
| 6-15 | `p = min(0.85, 0.10 + 0.06*d)` |
| 16+ | 85%, and it also refuses riding or base work until it is under cap |

When it disobeys, roll one: loafs around (does nothing), uses a random move, falls asleep for 1-3 turns, or hits itself (one in eight). Using a **Treat** (crafted food the creature likes) lowers `p` by 25% for 3 turns, which gives over-cap creatures a usable "bond" route instead of a dead end. Over-cap mounts move at 70% of normal speed and may buck you off at low stamina.

### 3.6 Gym and boss eligibility
- The **gym gate kiosk** registers each player's 3 battle creatures. Any creature with level above **C[b]** for the badge count the players hold *when they enter* is **ineligible**: it is greyed out with the label "Too wild for League rules."
- Ineligible creatures become eligible automatically once the cap rises past their level. Nothing is lost.
- The same rule applies to the Elite Four (cap 76) and the Champion. The Battle Tower uses its own fixed brackets: Level 50 and Open (levels set to 100).

---

## 4. Battle system

### 4.1 Every battle is a double battle

| Situation | Format | Who is involved |
|---|---|---|
| Wild encounter (solo) | 2 vs 2 (or 2 vs 1 + call for help) | One player. **Your first two party slots** lead |
| NPC trainer, roaming | 2 vs 2 | One player |
| Partner nearby in a wild fight | Still 2 vs 2 per player. Two separate battles can run side by side in the world | Each player fights alone |
| **Boss battle** (gym trainers, gym leader, Team Tether admins and boss, Elite Four, Champion, legendary encounters) | **Co-op multi battle.** Each player registers **3** creatures and sends **1**. Each player controls one slot. The boss fields 2 | Both players **must be inside the building or arena** |
| Battle Tower | Co-op (3 each, 1 out each) or solo (4 registered, 2 out) | 1-2 players |
| Max Raid dens | Co-op double (each sends 1) against one Dynamaxed raid boss. Solo uses two of your own | 1-2 players |

**Wild herds.** Wild creatures spawn in pairs, packs or herds. When you engage one, the nearest herd-mate joins. A creature that is truly alone uses **Call for Help** on its first turn: a nearby wild creature of the biome joins. So every wild fight is a double battle.

**Boss presence rule.** A boss trigger volume (gym leader platform, Elite Four chamber, Tether admin arena) only activates when **both connected players** stand inside the building's interior volume. If only one is there, the boss NPC delivers a line ("You'll want your partner for this one") and the battle doesn't start. In a world with only one player connected, see Open Question 1.

### 4.2 Battle presentation
Battles happen **in the world**, Palworld-style, with no screen transition. A battle ring (~18 m) forms at the encounter spot. Creatures fight in place and players stand behind their creatures. Other wild creatures stay out of the ring. The partner can walk up and spectate. Battles are turn-based and use the familiar mainline rules (moves, PP, types, abilities, natures, items, priority, speed order, spread moves at 0.75x damage).

### 4.3 Turn flow in co-op
1. **Plan phase** (45 s timer in boss fights *(tune)*). Each player picks a move and a target for their slot. A **planning ping** shows your partner's tentative choice ("Leah: Earthquake → both foes") so you can coordinate, for example with Protect.
2. **Lock in.** When both have locked in (or the timer runs out, which picks the last highlighted move), the server resolves the turn.
3. **Switching.** In co-op each player can switch only to their own 2 benched creatures.
4. **Fainting.** When a player's three creatures have all fainted, that player is out. The surviving partner fights on alone with one slot until the end of the battle, and the boss keeps two slots. That is hard on purpose, but the battle can still be won.

### 4.4 Stats and team building (player side)
Players get **the same depth bosses have**:
- **Potential (IV-like):** 0-31 per stat, rolled on spawn. The Scholar's *Appraisal* skill shows it. Wild **Alphas** and quest rewards guarantee 3+ maxed stats. Bottle Caps (from Legendary quests, the Battle Tower and Lysfolk vaults) hyper-train.
- **Training (EV-like):** 510 total, 252 per stat. Earned from battles, from the **Training Grounds** base structure and from craftable vitamins.
- **Natures:** the classic 25. **Mints** can be crafted at T3 from rare herbs, so the stat effect can change.
- **Abilities:** Ability Capsule (craftable T3) and Ability Patch (rare, quest reward).
- **Moves:** level-up moves, a **Move Tutor** in each large city (paid with crafted Heart Scales or money), and TMs found, bought or crafted at a **TM Press** (T3).

### 4.5 Boss AI: competitive-level design

The boss AI is the heart of "hard but fair." It is built in layers.

**A. Team building (offline, hand-authored with tool support)**
- Each boss has hand-built sets per tier band: species, nature, ability, 4 moves, held item, EV and IV spread. These are authored like real competitive sets: Choice Scarf sweeper, Assault Vest pivot, Trick Room setter, Intimidate support.
- **Spread quality by AI tier** *(tune)*:

| AI tier | Applies at | IVs | EVs | Held items | In-battle items | Gimmick | Search |
|---|---|---|---|---|---|---|---|
| T1 | Gyms with 0-2 badges, Tether grunts | 15 | 85 spread | Berries only (Oran/Sitrus) | 1 Potion | — | 1-ply greedy, 15% noise |
| T2 | Gyms with 3-5 badges, admins | 20 | Focused 252/252 on the ace | Sitrus, Leftovers, type boosters, Focus Sash | 1 Super Potion | Ace only | 1-ply plus prediction |
| T3 | Gyms with 6-9 badges, Tether boss | 31 on key stats | Full competitive spreads | Life Orb, Choice items, Weakness Policy, Assault Vest, Eject Button | 1 Full Restore (ace) | Yes | Prediction plus switching |
| T4 | Elite Four, Champion, Battle Tower top floors | 31 | Optimised | Full competitive item pool | 1 Full Restore + 1 X item | Yes | 2-ply expectimax on the critical turns |

**B. Decision making (runtime, server side)**

For each turn the AI:
1. **Enumerates joint actions** for its two slots: each move × each valid target, plus switches, plus item use. That is roughly 20-60 joint actions, which is cheap.
2. **Models the players' likely actions** with a weighted *opponent model* instead of reading their inputs. Each player option is scored with the same evaluator from the player's point of view, then turned into probabilities with a softmax. The model has learned-style biases: players tend to attack a target that is weak to their STAB move, Protect a slot that is threatened by a KO, and switch out a creature that is threatened by a type disadvantage.
3. **Scores outcomes** with a deterministic damage calculator that uses expected damage and KO probability ranges. The evaluation weighs:
   - HP percentage traded, and KOs (weighted heavily) in both directions.
   - **Speed control:** the value of Tailwind, Trick Room, Icy Wind or Electroweb given the speed tiers on the field.
   - **Board state:** weather, terrain, screens, stat stages, status.
   - **Ace preservation:** a penalty for exposing the ace early.
4. **Chooses** the action with the best expected value (T2-T3), or uses 2-ply expectimax over the top 6 candidate lines (T4). There is a randomness floor at T1 so early bosses make human-like mistakes.

**C. Targeting heuristics (applied on top of scores)**
- **Focus fire** the slot that poses the bigger threat (highest expected damage to the AI's side next turn), unless a KO is available elsewhere.
- **Don't feed absorbers:** never send Electric moves into Lightning Rod or Volt Absorb, or Ground moves into Levitate, once the ability has been revealed or is a commonly known species ability.
- **Spread-move awareness:** use Earthquake or Surf when its partner is immune (Flying, Levitate, Water Absorb) or will survive comfortably.
- **Protect prediction:** if a player Protected last turn, assume they won't this turn (Protect fails twice in a row) and double into that slot. Discount attacks into a likely Protect (a threatened slot with Protect revealed and not used last turn).
- **Fake Out** on turn 1 into the bigger threat. **Intimidate cycling** through switches at T3+.
- **Switch logic:** switch out when the current creature has under 25% expected survival and a teammate resists both of the threatening STAB types. Hard cap of 1 switch per 3 turns per slot so play doesn't get irritating.
- **Item logic:** use a Full Restore only on the ace, only below 35% HP and only when the ace would then win the matchup. Never use it on a creature that will be KO'd before acting.

**D. Fairness guarantees**
- The AI never sees the players' locked-in choices, and its accuracy and crit rolls are standard.
- Its knowledge of player creatures is limited to **species, revealed moves, revealed abilities and revealed items**, plus "common sets" priors (the same knowledge a skilled human would have).
- **Bosses are scouted in advance:** gym lobbies have a **scout board** that lists the leader's species and type (and the Scholar class sees more). Hard is fine; surprise gotchas are not.

### 4.6 How players get battle items
Players should be able to build teams that match the bosses. Sources:

| Source | Examples |
|---|---|
| **World points of interest** (hand-placed, one-time) | Life Orb in a Lysfolk vault, Choice Scarf from an Elderwood treetop chest, Focus Sash on a fjord sea stack |
| **Crafting T2-T4** | Leftovers (food + Fabric + Lysfolk Seal), Sitrus/Lum Berries (farm), Assault Vest (T3 tailoring), Weakness Policy (T4), Eject Button, type-boosting charms |
| **Shops** (expensive) | City department stores sell basic held items at high prices. The Battle Tower BP shop sells top-tier items |
| **Quests** | Class quests award spreads tools (Mints, Bottle Caps); Legendary quests award Ability Patches; side quests award specific items |
| **Alpha drops** | Alpha creatures drop their species' signature held items |
| **Mega Stones and Z-Crystals** | See §9 |

---

## 5. Catching and aggression

### 5.1 Two ways to catch
1. **Overworld throw.** Throw a ball at a wild creature that isn't in battle, as in Palworld and Legends: Arceus. It is fast and risky. Its HP is full unless you've already weakened it, and failing can make it aggressive (§5.3).
2. **In-battle throw.** Weaken it in a double battle first, then throw. This is the safer, higher-success route that Simon describes.

### 5.2 Catch formula (sketch)

Based on the mainline formula with a **level difference** term:

```
a = ((3*HPmax - 2*HPcur) * rate * ball * status) / (3*HPmax)      // mainline core
a *= levelMod(Lw, Lref)                                              // level difference
a *= overworldMod                                                     // 1.0 in battle; 0.6 overworld; 1.5 if unaware/back-stab
a *= classMod                                                         // Tamer skills, Scholar "weak point" read
a *= capMod                                                           // 0.5 if Lw > C[b]
p(catch) = clamp((a / 255), 0, 1) ^ 0.75    // softened "shake check" curve (tune)

Lref = min(your strongest party member's level, C[b])               // "your level"
d = Lw - Lref
levelMod = d <= 0 ? min(1.25, 1 + 0.02 * -d)                       // weaker targets: small bonus
                  : 1 / (1 + 0.15*d + 0.02*d*d)                      // stronger targets: steep falloff
```

| Target level vs yours | levelMod | Feel |
|---|---|---|
| 10 levels below | 1.20 | Easy |
| Same level | 1.00 | Standard |
| +3 | 0.62 | Noticeably harder |
| +5 | 0.44 | Weaken it first |
| +10 | 0.22 | Weaken it, put it to sleep, use a good ball |
| +20 and over cap | 0.05 x 0.5 | A long shot. You'll want armour |

### 5.3 Failed-catch aggression
Every species has a **temperament**: Skittish, Docile, Territorial or Aggressive. A failed overworld catch rolls a reaction:

```
aggroChance = base[temperament] + 0.04 * max(0, d) - armourCalm - classCalm
base: Skittish 0.05 (they usually flee), Docile 0.10, Territorial 0.40, Aggressive 0.70
```

| Reaction | What happens |
|---|---|
| **Flee** | Runs. Skittish creatures mostly flee |
| **Forced battle** | A battle ring forms. Its herd-mate joins |
| **Charge the player** | It attacks **you directly** in real time with telegraphed attacks (tackle lunge, elemental projectile, ground slam) that you can dodge-roll. It keeps going until you leave its territory (~40 m), it calms down (Treat thrown, 20 s) or your partner creature intercepts it, which triggers a battle |

A failed **in-battle** throw just costs the turn, but a Territorial or Aggressive target gets +1 Attack (it's "enraged").

### 5.4 Player health and armour mitigation
- **Player HP:** 100 at base, +2 per player level.
- **Incoming damage:** `dmg = mon.level * movePower/40 * (100 / (100 + armour.defence)) * (1 - armour.resist[type])`.
- **Armour** gives Defence, elemental **resistances** (rubber-lined coat vs Electric, fur parka vs Ice, ash-cloth vs Fire), **Calm** (lowers aggroChance by 0.05-0.25) and **temperature insulation**.
- **Knockdown** at 0 HP. You wake at your last bed, tent or Poke Center. Carried *materials* (not creatures, key items or equipment) drop in a **satchel** at the spot, which you can recover. Your partner can **revive you** in the field within 30 s, with a 5 s channel. That is a real co-op moment.

---

## 6. Survival craft

### 6.1 Meters

| Meter | Range | Drain *(tune)* | Effects when low |
|---|---|---|---|
| **Hunger** | 0-100 | -1 every 36 s (about 1 hour real time from full to empty while active) | Below 25: stamina regen halved. At 0: lose 1 HP every 3 s |
| **Thirst** | 0-100 | -1 every 24 s. Doubled in heat biomes | Below 25: max stamina -30%. At 0: lose 1 HP every 2 s |
| **Stamina** | 100 (+ skills) | Sprint, climb, swim, glide, dodge roll | 0: slowed to a walk, no climbing (and you fall) |
| **Body temperature** | Cold ↔ Hot | Biome, weather, time of day, insulation | Freezing or Overheating: fast stamina and HP drain |

Food comes from cooking (campfire, cooking pot, kitchen), berries, fishing and farming. Water comes from streams (raw water risks a "queasy" debuff unless boiled), wells, canteens, rain collectors and base purifiers. Meters are deliberately **gentle in towns** (inns and food stalls are everywhere) and **harsh in the wilderness**.

### 6.2 Tools and armour, no weapons
Players **never fight creatures with weapons**. Your creatures battle, and you survive, gather and traverse.

| Tools | Use |
|---|---|
| Hatchet → Axe → Steel Axe | Wood |
| Pick → Pickaxe → Drill (T3) | Stone, ore, crystals |
| Sickle | Fibre, herbs, crops |
| Fishing Rod (Old / Good / Super) | Fish, water creatures, items |
| Canteen | Water storage |
| Glider (T2) | Air traversal before you have a flying mount |
| Grapple Line (T2) | Cliffs and gaps. Ranger-boosted |
| Lantern | Caves, Mirefen fog, Ghost gym |
| Binoculars | Scout levels, Alphas and POIs from range |
| Lure Bell | Attracts specific wild creatures |

**Armour slots:** Head, Body, Legs, Accessory x2. Tiers: Cloth → Leather → Reinforced → Insulated or Cooling variants → Lysfolk.

### 6.3 Gathering and resources
Resource nodes (trees, rocks, ore veins, herb patches, berry bushes, salvage piles) respawn per chunk. **Partner gathering:** your out-of-ball companion creature helps if it has the right work aptitude (a Fire type smelts on the go, a Rock type mines 2x). Key materials:

`Wood, Stone, Fibre, Clay, Copper Ore, Iron Ore, Coal, Sulfur, Crystal Shard, Apricorns (7 colours), Berries, Hide, Wool, Kelp, Pearl, Ancient Fragment, Lysfolk Seal, Electric Coil, Ice Crystal, Magma Core.`

### 6.4 Crafting tiers

| Tier | Station | Gated by | Example outputs |
|---|---|---|---|
| T0 | Hands | — | Torch, Hatchet, Pick, Campfire, Fibre Rope, Tent |
| T1 | Workbench | Player Lv 3 | **Poke Ball** (Red Apricorn + Copper + Fibre Spring), Cloth armour, Canteen, Potion, Storage chest |
| T2 | Forge + Loom | Lv 10, Iron | **Great Ball**, Leather/Reinforced armour, Glider, Grapple, Super Potion, Fishing Rod (Good), Training Grounds |
| T3 | Assembly Bench + Alchemy Table | Lv 20, Electric Coil | **Ultra Ball**, specialty balls (Net, Dusk, Quick, Heavy...), Mints, Ability Capsule, TM Press, Assault Vest, Drill, conveyors |
| T4 | Lysfolk Fabricator (rebuilt from ruins) | Lv 30 + Ancient quest | Weakness Policy, Life Orb (requires a vault core), Lysfolk armour, high-tier automation, Revival Herbs |

Recipes are learned with **Technology Points** (from player levels and Lysfolk tablets) and with class skills (the Artisan unlocks some recipes early).

### 6.5 Base building
- Allowed **anywhere outside settlement boundaries** (and outside gyms, dungeons and story arenas). The build tool turns red inside a boundary.
- **Base Core:** each player can place up to 3 base cores (Artisan: 4). Each core has a 35 m build radius.
- Building pieces snap together: foundations, walls, roofs, stairs, doors, fences, defensive walls. There are cosmetic sets per biome (turf-roof Nordic, stone, timber, Lysfolk).
- **Bases are shared** in a co-op world. Both players can build on and use any base.
- **Incursions** *(optional, on by default)*: occasionally wild packs (or a Team Tether raid squad during Act II) come for bases with rich storage. Assigned base creatures defend in auto-battles.

### 6.6 Automation
Creatures with **work aptitudes** can be assigned to a base:

`Kindling, Watering, Planting, Generating (electricity), Handiwork, Gathering, Lumbering, Mining, Medicine, Cooling, Transporting, Farming (produce)`

Each species has 1-3 aptitudes rated 1-4, derived from its type and design.

**Automation chains (examples):**
1. **Poke Ball assembly line.** An Apricorn Grove (Planting + Watering) and a Copper Mine (Mining) feed a Smelter (Kindling) and a Spring Coiler (Handiwork). Conveyors (Transporting) carry the parts to a **Ball Press** (Generating, needs power), and finished balls go to a storage chest. A tuned T3 line makes about 40 Poke Balls or 15 Great Balls per in-game day.
2. **Money: Berry Juice Co.** A berry farm feeds a juice press, then bottling, then a **Merchant Stall** that sells to passing traders for money.
3. **Money: Ore to Ingots to Contracts.** Ingots fill **Delivery Contracts** (a board at your base) that pay out daily.

**Anti-runaway economics:** each sellable good has a **market saturation** curve. Its price drops 2% per unit sold in the same in-game day, floored at 40%, and recovers overnight. Automation is very good, but diversifying beats spamming one good.

### 6.7 Prices
City prices sit at **2-3x mainline**, so things don't come easily. Selling returns 25%. *(tune)*

| Item | Price |
|---|---|
| Poke Ball | 600 |
| Great Ball | 1,500 |
| Ultra Ball | 3,600 |
| Potion | 450 |
| Full Restore | 9,000 |
| Revive | 4,500 |
| Life Orb (dept. store, 7+ badges) | 60,000 |
| Rent a bed at an inn | 300 |

Typical early income: wild battles (50-200), roaming trainers (300-1,500), quests (500-5,000). Automation should become the main income source by mid-game.

---

## 7. Player levels and classes

### 7.1 Player levels
- **Levels 1-50.** XP comes from: catching (more for new species, more for higher level difference), battles, crafting a recipe for the first time, discovering POIs, quests (the largest source, §11), Dex milestones and gym clears.
- **Each level** gives +1 **Skill Point**, +1 **Technology Point** and +2 max HP. Class quests award +2 bonus Skill Points each (5 class quests, so +10).
- In total about 59 Skill Points against about 85 nodes per class tree, so **you can't max everything**. Builds diverge even within one class.
- Changing class: **one free respec** at Professor Hazel's lab. After that, respecs cost an expensive Memory Herb.

### 7.2 The five classes

| id (code) | Class | Fantasy | Innate perk | Trade-off |
|---|---|---|---|---|
| `ranger` | **Ranger** | Wilderness scout and pathfinder | +15% max stamina, mounts +5% speed, sees tracks of nearby rare creatures | Crafting stations work 15% slower. Shop prices +5% (no city contacts) |
| `tamer` | **Tamer** | Creature whisperer | +10% catch rate, -0.10 aggroChance, over-cap obedience +2 | -15% carry weight. Base creatures work 10% slower when the Tamer isn't nearby (they miss them) |
| `artisan` | **Artisan** | Builder, engineer, industrialist | Crafting -15% material cost, +1 base core, tools last 2x longer | -10% catch rate. -10% battle XP for their creatures |
| `scholar` | **Scholar** | Researcher and tactician | +20% XP for player and creatures. Sees wild levels, natures and abilities at a glance. Boss scout boards show held items | -15% max HP. Hunger and thirst drain 10% faster ("forgets to eat") |
| `medic` | **Medic** | Field healer and survivalist | Heals creatures 10% HP after each battle. Hunger and thirst drain 20% slower. Can revive a partner instantly | -10% stamina. Cannot carry more than 3 mounts in the party at once (the herbal pack takes space) |

### 7.3 Skill trees
Each class has **3 branches** of about 8 nodes plus a **capstone** (about 27 skills, plus ranks, roughly 85 points). Nodes need a prerequisite in the same branch. The capstone needs 12 points spent in its branch.

#### Ranger: Pathfinder / Wildcraft / Outrider
| Branch | Nodes (outline) | Capstone |
|---|---|---|
| **Pathfinder** (traversal) | Sure-Footed (climb stamina -20%), Long Stride (sprint +8%), Grapple Mastery (longer, faster grapple), Glider Thermals (glider climbs in updrafts), Cold-Blooded (cold tolerance), Desert Walker (heat tolerance), Swift Swim, Waypointer (place 3 custom fast-travel cairns) | **Wayfarer:** fast travel between any discovered villages and towns, not just Poke Centers |
| **Wildcraft** (catching and tracking) | Tracker (rare creature trails), Stalker (crouch-sneak +30% back-throw bonus), Lure Crafting, Herd Reading (see temperament), Alpha Sense, Bait Mastery, Quick Throw | **Ambush:** an overworld throw at an unaware target counts as in-battle with the target at 50% HP |
| **Outrider** (riding) | Mount stamina +15%, Mount Swap (instant swap while moving), Double Saddle (carry partner on any land mount), Dive Mount, Air Stamina, Stampede (ram nodes for resources) | **Wind Rider:** +15% speed on all mounts and no buck-offs |

#### Tamer: Bond / Command / Sanctuary
| Branch | Nodes | Capstone |
|---|---|---|
| **Bond** (catching) | Gentle Hand (+5% catch, 3 ranks), Calming Aura (-aggro), Second Chance (first failed throw per day refunds the ball), Favourite Food (Treats 2x as strong), Wild Friends (Skittish creatures approach), Heavy Throw (+range) | **Kindred Spirit:** catch rate levelMod floor raised to 0.35 |
| **Command** (battle and obedience) | Kindred Command I/II (obedience +3/+5 over cap), Pep Talk (once per battle: +1 Speed to an ally), Focus Call (reduces confusion and sleep), Trainer's Eye (shows which foe each player is likely to target), Swift Recall (switching is free once per battle) | **Trust Fall:** once per boss battle, a creature survives a KO hit at 1 HP (does not stack with Sash) |
| **Sanctuary** (ranch and breeding) | Daycare (breeding at base, egg moves), Nursery (hatch speed), Happy Ranch (base morale), Potential Sense (see IVs), Shiny Charm-lite | **Lineage:** breeding passes 5 IVs and the nature freely |

#### Artisan: Forge / Engineer / Architect
| Branch | Nodes | Capstone |
|---|---|---|
| **Forge** (crafting) | Thrifty (-10% cost, ranks), Masterwork (chance of a +1 quality tool), Early Blueprint (recipes one tier early), Ball Smith (crafted balls +10% catch), Quick Craft, Repair Kit | **Lysfolk Artificer:** unlocks unique T4 items (Artisan Scarf, Tool Belt+) |
| **Engineer** (automation) | Conveyor Logic (filters, splitters), Power Grid (+25% generator output), Overtime (+15% work speed), Logistics (cross-base item transport), Market Savvy (sells +15%, slower saturation) | **Factory Floor:** assembly lines run at 2x speed while any player is online |
| **Architect** (building) | Extra Base Core, Larger Radius, Fortify (incursion defence), Biome Sets, Fast Build, Sky Platforms | **Landmark:** build a fast-travel tower at each base |

#### Scholar: Research / Tactics / Lore
| Branch | Nodes | Capstone |
|---|---|---|
| **Research** (catching and dex) | Appraisal (IVs), Field Notes (+XP per new species), Weak Point (+15% catch on a status-afflicted target), Habitat Map (spawns per biome on the map), Alpha Census | **Living Dex:** shows exact capture odds before each throw |
| **Tactics** (battle) | Scout+ (see boss EV spreads on the scout board), Damage Preview (calc ranges shown), Speed Tiers (turn order preview), Revealed Sets (once a boss move is used, all are revealed), Plan Ahead (plan timer +20 s) | **Grandmaster:** once per boss battle, see the boss AI's top candidate action for one slot |
| **Lore** (exploration) | Rune Reading (Lysfolk puzzles hint), Vault Keys, Legendary Echoes (legendary quest steps marked), Technology Points +1 per 2 levels | **Ancient Mind:** T4 Fabricator unlocked without the quest |

#### Medic: Remedy / Field Care / Hearth
| Branch | Nodes | Capstone |
|---|---|---|
| **Remedy** (battle healing) | Potion Mastery (+50% item healing), Status Cure, Revive Craft, Battle Medic (once per battle use an item without spending a turn), Partner Heal (heal the co-op partner's creature) | **Lifeline:** once per boss battle, revive one fainted creature (either player's) at 50% HP |
| **Field Care** (survival) | Iron Stomach (raw water and food are safe), Bandage (self-heal), Temperature Ward, Second Wind (stamina burst), Calming Presence (-aggro), Rescue (revive partner from 15 m) | **Guardian:** you and your partner take 25% less damage from charging wild creatures |
| **Hearth** (cooking) | Cooking +1 tier, Hearty Meals (meal buffs 2x longer), Sandwich-style buffs (catch power, sparkling spawns), Herbalism (herb yield), Base Clinic (sick base creatures recover) | **Feast:** shared meal gives both players +2 skill effects for 30 min |

---

## 8. Riding

### 8.1 Mount types
Each species has a **riding profile** derived from its design: body shape, size, limbs, fins or wings.

| Mode | What it means | Requirements |
|---|---|---|
| **None** | Too small or not shaped for riding | — |
| **Land** | Ride on its back | Size ≥ 1.2 m or a sturdy build, legs or a serpent body |
| **Water** | Surface swim. Some can **dive** | Swimmer design |
| **Air** | Flight. Some only **glide** (lose altitude) | Wings or levitation, and size |

A species can have **several modes** (Dragonite: Air A, Water C). Riding requires a **Saddle** for that species (crafted, T1-T3 by mount tier). Mounts are capped by obedience (§3.5).

### 8.2 Deriving mount stats

```
bodyBase      = { heavyBeast: 7, quadrupedRunner: 11, serpent: 9, raptorFlyer: 13, glider: 8, swimmer: 9, ... }  // m/s
speedFactor   = 0.75 + baseSpe / 400              // Spe 20 → 0.80, 100 → 1.00, 150 → 1.125
mountSpeed    = bodyBase * speedFactor * (1 + skills)
mountStamina  = 60 + (baseHP + baseDef) / 4       // sprint / flight / dive budget
handling      = clamp(1.3 - weightKg / 600, 0.5, 1.2)  // turn rate and acceleration (weight = momentum)
special       = per-species flags: rockSmash, climbWalls, iceWalk, lavaWalk, dive, sandstormImmune, twoSeat
```

Then speed tiers: **D** (<6 m/s), **C** (6-8), **B** (8-10), **A** (10-12), **S** (≥12). Player sprint is about 6.5 m/s.

### 8.3 Examples (returning species)

| Species | Modes | Tier | Character |
|---|---|---|---|
| Bouffalant | Land | **D** | Slow, enormous stamina, rams through boulders and fences. Two-seat |
| Mudsdale | Land | C | Ignores rough terrain (mud, snow drifts) |
| Rapidash | Land | A | Fast, low stamina, sets dry grass alight behind it |
| **Cyclizar** | Land | **S** | The fastest land mount: low and sleek, but small stamina |
| Gogoat | Land | B | Climbs near-vertical cliffs |
| Lapras | Water | B | Two-seat ferry with a stable ride |
| Sharpedo | Water | S | Burst speed, drains stamina quickly |
| Wailord | Water | D | Gigantic, carries both players, dives |
| Corviknight | Air | B | Steady flyer, good stamina, heavy |
| Dragonite | Air, Water | A, C | All-rounder |
| Flygon | Air | A | Immune to sandstorms |
| Altaria | Air | C | Slow, very high stamina, cold-proof |

Sijord's new species have their riding profiles in [DEX_PLAN.md](DEX_PLAN.md).

**Co-op riding:** two-seat mounts carry both players, so the passenger can throw balls, use binoculars or ping.

---

## 9. Mega Evolution, Z-Moves and Dynamax/Gigantamax

**One gimmick per player per battle.** You pick Mega, Z or Dynamax, which keeps them balanced. In co-op both players may each use one, and bosses from AI T2 onwards get one per boss.

| Mechanic | How you unlock it | Where to get the parts | When usable | Boss usage |
|---|---|---|---|---|
| **Mega Evolution** | **Keystone**. Professor Hazel hands it over at the end of the Act I quest "The Lysfolk Stone" (triggers at 2 badges, in any order) | Mega Stones are in fixed POIs and in quest rewards across the map, roughly 30. The rarest are in Lysfolk vaults | Any battle | Leaders with 4+ badges. One Mega in the ace slot |
| **Z-Moves** | **Z-Band**, from the Skerry trial-keeper after the "Trials of the Isles" quest (needs 3+ badges and a water mount) | Type Z-Crystals (18) from **Trial Shrines** (solo or co-op puzzle mini-dungeons, one per type, spread by biome). Species crystals from side quests | Any battle | From 5 badges onward |
| **Dynamax / Gigantamax** | **Dynamax Band**, earned in Act II from the Voltavik ley engineers | Only on **Power Spots**: Max Raid dens (co-op raids), 3 gym stadiums built on ley lines (Voltavik, Runeby, Crownspire), the Champion arena and the Battle Tower. **G-Max Soup** (Max Mushrooms from dens) gives the Gigantamax factor | Only on Power Spots, for 3 turns. In the world the creature physically grows huge (spectacular in third person) | Power Spot bosses only |

Terastallisation is **not** in scope. It could be a possible post-release addition.

---

## 10. Story

### 10.1 Premise
Sijord has long, hard winters. Every year, during **Lysvaka** (the Light Vigil), the aurora legendary **Nordlyth** balances the two seasonal titans: **Solvyrn**, the midnight-sun legendary, and **Nocthyrn**, the polar-night legendary. The ancient Lysfolk built their ruins to honour that balance.

**Krane Industries**, a cheerful, modern automation company based in Jernhamn, promises "no more winters." Its hidden wing, **Team Tether**, captures creatures en masse and chains them into **Tether Engines** that drain ley energy. Their goal is to bind Solvyrn and make an endless summer. **Director Halvard Krane** is sympathetic and grief-driven: he lost family in a famous winter storm. His logic mirrors the player's own automation (§6.6), which is the story's thematic hook. Do your creatures *work with you* or *work for you*?

**Supporting cast:** Professor Hazel (Bramblewick lab, studies Lysfolk–creature bonds), **Sunniva** (Hazel's ambitious niece and the NPC rival who pops up across the map), three Tether admins (Ottar: Steel and Electric; Ylva: Poison and Dark; Brann: Fire and Ground), Champion Ragna Stormhild.

### 10.2 Structure for a non-linear open world
Story beats are **keyed to progress counts** (badges, engines destroyed), not to specific places. Act transitions trigger wherever the players happen to be. Fixed locations exist only where geography matters (the engines, the Lysfolk Observatory, Crownspire).

| Act | Trigger | Check marks (main quests) | Highlights |
|---|---|---|---|
| **Prologue: Bramblewick** | New game | Wake up in your house → meet your partner player → visit Professor Hazel → pick a starter (three new starters, see the dex plan) → first double battle with Sunniva → Hazel gives you the Sijord Dex and a Field Kit → leave the village gate | The intro tutorial: movement, a first catch, a campfire. Leaving Bramblewick opens the world |
| **Act I: The Wide World** | Leaving Bramblewick | Earn any 2 badges. In the **first large city you enter**, witness a Krane Industries "Demo Day". Return to Hazel: "The Lysfolk Stone" → **Keystone (Mega)** | Free exploration. Sunniva appears at the second gym you enter |
| **Act II: The Tether Engines** | 3 badges | Three **Tether Engines**, at Coppergill mine, the Skarsund dam and the Rimefrost drill, all **shut down in any order** → each one frees trapped creatures, and the shutdown boss is an admin double battle (co-op) → **Dynamax Band** from Voltavik | The engines physically scar their biome (drained colour, angry wild packs) until shut down, then the land visibly heals: a world-state change |
| **Act III: The Long Night** | 6 badges **and** all 3 engines shut down | Krane rips Solvyrn out of its sleep. The sky splits: the east is stuck in **midnight sun**, the west in **polar night**, which changes spawns, temperature and lighting. Players follow the **Legendary quest chain** "Light Vigil" across Lysfolk shrines → Krane HQ assault at Jernhamn (co-op boss gauntlet) → **Solvyrn** and **Nocthyrn** become catchable → aurora finale at the Lysfolk Observatory: **Nordlyth** (catchable) | The legendaries are caught **before** the Elite Four |
| **Act IV: Crownspire** | 10 badges | Victory Gate → Victory Road (a co-op climb with roaming Ace trainers) → Elite Four → Champion Ragna → final Sunniva battle → credits | Krane, now redeemed, appears in the epilogue running a "Fair Work" creature ranch. Everything stays open afterwards |

If players finish 10 badges before Act III (possible because of the open world), the Victory Gate guard sends them to resolve the Long Night first. Leaving the region eternally broken while you go win the League doesn't fit the story.

---

## 11. Quest system

### 11.1 Quest types

| Type | Count (target) | Given by | XP *(tune)* | Notes |
|---|---|---|---|---|
| **Main** | ~30 steps | Story | 1,000-5,000 | Always tracked first |
| **Side** | ~150 | NPCs in settlements and the wilds, notice boards | 150-1,500 | Short, characterful, many chained |
| **Class** | 5 per class | Class mentor in a city | 1,500 + 2 Skill Points | Unlocks class-specific recipes and abilities |
| **Legendary / Mythical** | 6 chains | Lysfolk tablets, rumours, Hazel | 3,000-8,000 | Lead to the legendaries and mythicals (§10, Dex plan). **Mythicals are earnable in-game, not event-only** |
| **Bounties** | Rotating daily | City bounty boards | 200-800 | Alpha creatures, Tether stragglers, rare materials |
| **Co-op Contracts** | Rotating | Bounty boards | 400-1,200 each | Require both players: escort caravans, twin-lever ruins |
| **Dex Research** | Per species | Hazel (remote) | 20-200 | Catch, see a move, observe a behaviour, ride |

### 11.2 Quest tracker
- The HUD shows **one pinned quest** plus up to 2 secondary quests.
- Markers appear on the compass and the minimap.
- Quests carry a recommended level, displayed relative to your cap.

### 11.3 XP curve
Player XP needed for level n is `100 * n^1.6`. Quests supply about 55% of total XP by design, so questing (substance) beats grinding.

---

## 12. Substance: the content density plan

### 12.1 What's wrong with Palworld's open space
Palworld's map is large, but much of the space between points of interest is procedural foliage with creature spawns, ore and little else. Once you can fly, the land becomes something to skip. Its structures (towers, dungeons) are spread far apart, and NPCs are mostly merchants or hostile humans with no character. **The result is space that looks full but plays empty.**

### 12.2 Sijord's rules
1. **The 45-second rule.** Moving at walking speed in any direction, a player should see a new **interactable** thing within ~45 s and a **notable** thing (POI, event, character) within ~90 s. Interactables don't count gather nodes or ordinary spawns.
2. **Smaller, denser, vertical.** About 36 km² of land, with caves, cliff ledges, treetops and under-bridges as extra layers.
3. **Hand-authored vignettes beat procedural noise.** Procedural tools place foliage and resources. Designers place stories.
4. **Flying isn't a skip button.** Interesting things are visible from the air (smoke from a camp, a glowing ruin, a herd stampede) and pull players down. Air mounts use stamina and must land.
5. **The world reacts.** Engines scar biomes, the Long Night splits the sky, villages remember you.

### 12.3 Density targets per km² *(tune in playtests)*

| Content | Per km² | Examples |
|---|---|---|
| Minor POI | 10-14 | A shrine stone with a riddle, a chest on a cliff, a fishing spot, a lone camp with a story note, a fairy ring |
| Major POI | 2-3 | A Lysfolk ruin, a cave system, an abandoned mine, a crashed airship, a Trial Shrine, a Max Raid den |
| Quirky NPC | 3-5 | Wandering characters with a hook (below) |
| Roaming trainer | 4-6 | Doubles specialists with themed teams and banter |
| Side quest start | 3-4 | |
| Collectible | ~20 | Lysfolk tablets, lost Field Notes, Unown-style glyph creatures |
| Alpha creature | 0.5-1 | Bigger, glowing eyes, high Potential, drops a held item |
| Settlement | ~1.2 total | Small, medium and large combined |

### 12.4 Quirky NPC catalogue (sample)

| NPC | Hook |
|---|---|
| **Gunnar the Fence-Mender** | Wanders between villages fixing fences and is convinced a Grumpig keeps breaking them. Following him across the region reveals that it's a Sijordic Stantler doing it out of love |
| **The Overconfident Cartographer** | His maps are wrong on purpose. Correct three of them and he gives you a real treasure map |
| **Old Maj and her 40 Wooloo** | A herding minigame. Lose a Wooloo and you'll find it later in very unlikely places |
| **The Tether Defector** | A grunt hiding in a hay bale who sells intel for food |
| **Competitive Picnicker** | Challenges you to a cooking-off. The prize is a recipe |
| **The Hermit Who Only Battles at Night** | Their team changes with the moon phase |
| **The Lost Tourist** | Has been "on holiday" for 6 years. Shows up in every biome a little more feral each time |
| **The Ferryman Poet** | Ferry rides cost a rhyme. You pick your lines from dialogue options |

### 12.5 Dynamic world events
An **Event Director** on the server tracks a "time since last stimulus" per player. When it rises too high, it spawns an event *near the player's direction of travel*, picked from a weighted pool that respects biome, time and act.

| Event | Frequency | Description |
|---|---|---|
| **Herd migration** | Hourly per biome | Dozens of a species crossing a valley. Easy catches, possible stampede |
| **Mass outbreak** | 1-2 active | One species (with a shiny boost) in an area |
| **Caravan in trouble** | Frequent | Merchant cart under attack by wild creatures or Tether. Save it for a discount |
| **Tether convoy** (Act II) | Frequent | Ambush it to free caged creatures (co-op double battle) |
| **Meteor shower** | Nightly chance | Fallen stars become rare material nodes, and space-themed creatures spawn |
| **Aurora night** | Weekly in-game | Psychic and Fairy spawns, Lysfolk ruins activate, Nordlyth hints |
| **Weather fronts** | Constant | Thunderstorm (Electric spawns, lightning hazard), blizzard, sandstorm, fog |
| **Village festival** | Rotating | Minigames (log toss, Wooloo herding, flower picking), food stalls, unique rewards |
| **Alpha challenge** | Rare | A roaring Alpha marked on the compass, with a "Defeat in 10 min" bonus |
| **Wandering master** | Rare | A strong roaming trainer who teaches a move tutor move if beaten |

---

## 13. Gyms: cooperative puzzle buildings

### 13.1 Rules for every gym
1. **Both players must be present.** The gym door is a two-person lock: each player stands on one of the twin plates.
2. The interior is a **Portal-style cooperative puzzle** with 3-5 chambers that **can't be solved alone**. Asymmetric information and asymmetric abilities force talking.
3. Between chambers are **gym trainers**. These are co-op double battles (3 registered each, 1 out each), so they act as warm-ups for the leader.
4. The final chamber is the **leader's arena**. The leader fights a co-op boss battle (§4.3).
5. **Checkpoints.** Losing to the leader returns you to the last chamber. Puzzles you've solved stay solved.
6. **Ping tools.** A contextual ping wheel ("Here!", "Wait", "Go!", "Pull now") and in-world markers for when there's no voice chat.

### 13.2 Concrete puzzle concepts

**A. Voltavik (Electric): "Split Circuit"**
- The players are on different floors of a turbine hall. Player A (top) sees live wires through a grated floor but can't reach the switches. Player B (bottom) can reach switches and capacitors but sees only dead conduits.
- The puzzle is routing power through a junction board to open B's doors, then A's bridges. Some relays need an **Electric creature** sent out to charge them for 10 s while the partner runs the circuit.
- In the final chamber, both players hold rotating conductors at once to complete one circuit. If either moves, the arc breaks and the floor tiles shock.

**B. Skarsund (Water): "Lock and Sluice"**
- A multi-level canal. Player A runs the **sluice control room** and raises or lowers water levels in 4 chambers. Player B **rides a water mount** (one is provided if needed) through the chambers.
- Water level decides what's reachable: high water floats B over walls, low water exposes underwater doors and lever wheels. B has to call out what they see. Later chambers swap roles.
- The finale is a whirlpool chamber: A times the rising tide while B surfs the current through a ring course.

**C. Runeby (Psychic): "Mirror Minds"**
- Two **mirrored rooms** joined by a glass wall. Each player's room has invisible platforms, but **you only see the platforms in your partner's room**, so each player guides the other.
- Mid-gym twist: a **position swap** rune. Stepping on it teleports both players into each other's spots, so the plan has to include it.
- The finale is a Lysfolk glyph lock. A sees half of each rune and B sees the other half. They enter it together on twin consoles.

**D. Myrkvald (Ghost): "Lantern and Shade"**
- Player A carries the **Spirit Lantern**. Its light reveals ghost bridges, but the lantern-bearer can't cross them (spirits shy from the bearer). Player B can walk only on **lit bridges** and only within the lantern's cone.
- Ghost-type gym trainers hide in the dark and ambush whichever player is out of the light.
- The finale is a mansion where the lantern is passed back and forth at fixed stations while a "Shade" creature chases whoever is in the dark.

**Other six gyms (one line each):**
- **Verdhavn (Bug): "Hive Signals."** Players lay and follow pheromone trails that redirect swarms. One lures, one sneaks.
- **Emberholt (Fire): "Bellows and Vents."** One player opens cooling vents and works the bellows, the other crosses a lava foundry in the cooled window.
- **Grusdal (Ground): "Counterweight Canyon."** Elevators balanced by players' weight and boulders, plus digging with Ground creatures.
- **Isfjell (Ice): "Human Stopper."** Sliding ice floors where players stop each other's slides.
- **Blomstad (Fairy): "Two-Part Melody."** Each player holds half a melody on bell flowers that grow bridges.
- **Jernhamn (Steel): "Conveyor Foundry."** One player runs the crane, the other rides the assembly line, which echoes the automation theme.

---

## 14. No post-game lockouts

Everything in the game can be done **before the Elite Four**:
- All legendaries and mythicals are reachable through quests during Acts II-III.
- The Battle Tower opens at 5 badges, not after the credits.
- Every Mega Stone, Z-Crystal and Gigantamax source is in the main world.
- Every crafting tier and automation feature unlocks through player level and quests, not story completion.
- The Champion rematch, harder Battle Tower ranks and the cap rising to 100 come **after** the Champion, but they're **extensions, not new content gates**. Nothing new is *locked* there.

---

## 15. Character customisation

Kept light but distinctive. A character creator appears at the start and can be revisited at a mirror in your house. The M1 code already supports the base fields (`Appearance` in `src/shared/types.ts`).

| Category | Options (M1) | Later |
|---|---|---|
| Body | Build (slimmer or broader), skin tone (swatches plus picker) | Height slider, face shapes |
| Hair | Style (short, spiky, long, ponytail), colour | 12+ styles, facial hair |
| Outfit | Jacket and trousers colours | Outfit pieces found and bought; armour transmog (look vs stats) |
| Name | Free text | — |
| Class | Pick one of 5 (§7) | — |

Your partner's appearance syncs over the network so the two players always look different.

---

## 16. Multiplayer architecture

### 16.1 Topology
- **One world = max 2 players** (`MAX_PLAYERS = 2`).
- The **authoritative Node.js WebSocket server** owns the world simulation. Browser clients render and predict.
- Hosting options:
  1. **Self-hosted** with `npm run server`. A friend connects by room code and URL. This is the M1 setup.
  2. **Desktop build** (Electron or Tauri) that embeds the server. The host player's game launches it locally (like Palworld co-op), with optional relay.
  3. A dedicated hosted relay later.

### 16.2 Authority split

| Concern | Authority | Notes |
|---|---|---|
| Player movement | Client predicts, server validates (speed and teleport checks) and relays at 15-20 Hz | M1: client-reported position, server relay |
| Wild spawns, AI, world events | Server | Spawns per chunk near either player; deterministic seed per chunk |
| Battles | **Server** runs the battle engine (shared TypeScript in `src/shared/battle`), deterministic with a seeded RNG | Clients send choices and receive event logs to animate |
| Catching rolls, loot | Server | Prevents client-side cheating and desync |
| Building, crafting, automation | Server | Automation is ticked on the server (and fast-forwarded on load) |
| UI, camera, animation, audio | Client | |

### 16.3 Messaging
JSON messages typed in `src/shared/protocol.ts` (`hello`, `state`, `welcome`, `peer-joined`, `peer-state`, `peer-left`, `room-full` exist today). Planned message groups are `battle/*`, `inventory/*`, `build/*`, `world/*` (events, time, weather), `quest/*` and `ping`. Binary encoding is planned once message rates grow.

### 16.4 Persistence
- **World save** (server): terrain edits, bases, automation state, world flags (story act, engines, Long Night), gym scaling state (`tier`, `levelRecord`), POIs claimed, time.
- **Player save** (server, per player profile): appearance, class, level, skills, party and boxes, bag, badges, quests, dex.
- Format: versioned JSON files in M1-M3, then SQLite. Autosave every 2 minutes and on important events.

### 16.5 Desktop packaging
Electron is the safer first choice because the Node server can run in-process. Tauri, with a Node sidecar, gives smaller builds. We'll decide at the packaging milestone (see ROADMAP).

---

## 17. Controls

| Action | Keyboard and mouse | Gamepad |
|---|---|---|
| Move | WASD | Left stick |
| Camera | Mouse (orbit), wheel zoom | Right stick |
| Sprint | Shift | L3 or LB |
| Jump / climb / glide | Space (hold in the air to glide) | A |
| Dodge roll | Ctrl or Alt | B |
| Interact / talk / gather | E | X |
| Throw ball (aim) | Hold RMB, release LMB | Hold LT, RT |
| Send out or recall partner creature | Q | Y |
| Mount / dismount | R | Down on D-pad |
| Ping wheel (co-op) | Middle mouse / Z | Right on D-pad |
| Build mode | B | Menu → Build |
| Inventory / party | Tab / I | View |
| Map | M | Map button |
| Quest log | J | Menu |
| Battle | Mouse or 1-4 to pick moves, Tab to cycle target | D-pad and A |

**Movement feel:** fluid but weighty. Acceleration and deceleration ramps (~0.18 s to full speed), turn-rate limits at a sprint, a small landing squash and recovery, momentum on slopes, foot IK later, and mounts inheriting weight from the `handling` stat (§8.2).

---

## 18. Open questions for Simon

1. **Solo worlds and gyms.** The vision says gyms need both players. If one player is offline, should gyms (a) wait for the partner, or (b) offer an optional **AI "Echo" partner** for solo saves? The current design assumes (a), with (b) as a toggle.
2. **Badge sharing.** If a second player joins a world later, should they inherit the host's badges or earn their own? The design currently uses separate badges, scaling to the higher count, plus a catch-up cap for the newcomer.
3. **Number of gyms.** 10 gyms fits "10-12 large cities with gym leaders". The classic count is 8. Easy to change.
4. **Real-time player damage.** Is it okay that charging creatures can knock players down (§5.3)?
