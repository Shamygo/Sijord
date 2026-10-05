# Sijord: Roadmap

Every milestone ends in a **playable build** that two people can open in a browser and play together. Each one adds a vertical slice on top of the last instead of building systems in isolation. Scope details refer to [DESIGN.md](DESIGN.md) sections (§).

**2026-10-05 cross-milestone update:** M2 remains complete and M3 catching is still next. At the user's request, imported Pokémon/Rei, public hosting, both shared free-roam battle variants, UI polish and climbing have landed ahead of later milestones. These additions do not complete M3 catching or M6 gyms. See [POLISH_HANDOFF.md](POLISH_HANDOFF.md).

**Guiding principles**
- **Playable at every step.** No milestone ends with "the systems are in but you can't do anything."
- **Battle engine early.** It's the deepest system and everything (gyms, catching, AI) depends on it.
- **Data-driven content.** Species, moves, items, recipes, quests and POIs live in data files, so content can grow in parallel with code.
- **Art follows current user direction.** Environments remain procedural; imported Pokémon and Rei/Red character assets are explicitly requested. Preserve source/animation provenance and the latest reference targets.

---

## Overview

| # | Milestone | Playable result | Rough size |
|---|---|---|---|
| M1 | Hometown and co-op presence | Walk around Bramblewick with a friend and talk to Professor Hazel | Done |
| M2 | First creatures and battles | Pick a starter and fight wild double battles near Bramblewick | Done |
| M3 | Catching, party and the first route | Catch creatures (overworld and in battle) across the starter biome, with aggression | In progress (in-battle catching done) |
| M4 | Survival and crafting core | Hunger, thirst and stamina, gathering, T0-T1 crafting, Poke Ball crafting, tools and armour | L |
| M5 | Open world and settlements | Streamed 6x6 km terrain with 4-5 biomes, villages and towns, NPCs, shops | XL |
| M6 | First gym slice | Two-player puzzle gym, co-op boss battle, competitive AI T1-T2, badges and level caps | XL |
| M7 | Player levels, classes and quests | XP, skill trees for all 5 classes, quest system, first side quests | L |
| M8 | Base building and automation | Base cores, building, work aptitudes, a Poke Ball assembly line, money automation | XL |
| M9 | Riding and traversal | Land, water and air mounts with derived stats, saddles, glider, grapple | L |
| M10 | Content expansion I | All 11 biomes, all 12 cities, 5 gyms, Act I-II story, about 250 species | XXL |
| M11 | Battle depth and gimmicks | AI T3-T4, Mega / Z / Dynamax, full items, spreads tools, Battle Tower | L |
| M12 | Content expansion II | All 10 gyms, Act III-IV, the Elite Four, legendaries, about 500 species | XXL |
| M13 | Substance pass and dynamic events | Event Director, density targets met, quirky NPCs, festivals | L |
| M14 | Desktop packaging and polish | Electron or Tauri builds for Windows and Mac, embedded server, saves, settings | M |
| 1.0 | Release | Balance, performance, art pass, onboarding, bug bash | — |

---

## M1: Hometown and co-op presence *(done; 60 fps on real hardware unverified)*

**Scope**
- Third-person character controller: fluid but weighty acceleration and turning, sprint, jump, landing recovery. Orbit camera with collision.
- Character customisation (body, skin, hair, colours, name) and a **class pick** (`ranger | tamer | artisan | scholar | medic`, flavour only for now).
- **Bramblewick:** a small fenced village with both players' houses, Professor Hazel's lab and a settlement boundary.
- **Professor Hazel** NPC with intro dialogue.
- HUD: compass, minimap, quest tracker (showing the intro quest "Visit Professor Hazel").
- Two-player presence over the WebSocket server: join by room, see the other player move and animate, max 2 per room.
- Bright painterly look: skybox, lighting, stylised foliage, water.

**Exit criterion:** two people on different machines join the same room, create different-looking characters, walk around Bramblewick together and each complete Hazel's intro dialogue. Movement feels responsive and weighty, and the frame rate holds 60 fps on a mid-range laptop.

---

## M2: First creatures and battles *(done; each player battles on their own screen, and wild herds aren't shared between the two players yet)*

**Scope**
- Shared **battle engine** (`src/shared/battle`): server-authoritative, deterministic with a seeded RNG, double battles only. Covers stats (base, IV, EV, nature), types, about 60 moves, about 20 abilities, status, priority, spread damage and switching.
- Data pipeline for species, moves and abilities (JSON or TS data, validated in tests).
- First **20 species** (starters plus early Hearthmeadow creatures) with placeholder chunky models and idle, attack and hit animations.
- Starter selection at Hazel's lab and the first rival battle against Sunniva (scripted AI T1).
- Wild creatures roam the meadow outside Bramblewick in herds. An in-world battle ring with no screen transition. Two lead party slots go out.
- Battle UI: move select, targets, party, log. XP and levelling up to cap 15.

**Exit criterion:** each player picks a starter, beats Sunniva and fights wild 2v2 battles in the meadow that level their creatures. The battle engine passes a unit test suite of damage-calc cases matching reference values.

---

## M3: Catching, party and the first route

**Scope**
- Overworld throw (aim and arc) and in-battle throw. The catch formula with levelMod (§5.2).
- Temperaments and failed-catch aggression: flee, forced battle or charge the player. Player HP, dodge roll, knockdown and respawn at bed (§5.3-5.4).
- Party of 6 and a PC box (in the lab). Healing at home and at Hazel's lab.
- 40 species. The Hearthmeadow biome slice (about 1 km²) to the density target, with its first POIs.
- Dex UI (seen and caught).

**Exit criterion:** a player can catch 10+ species, gets charged by an aggressive creature after a bad throw and survives it or is knocked down, and manages a party. Two players catch side by side in separate battles without desync.

---

## M4: Survival and crafting core

**Scope**
- Hunger, thirst, stamina and body temperature meters (§6.1). Cooking at a campfire, drinking water.
- Gathering nodes (wood, stone, fibre, apricorns, berries, copper) and partner-creature gathering help.
- Tools (hatchet, pick, sickle, canteen, lantern) with durability. Cloth and leather armour with defence, resistances and Calm.
- Crafting UI and T0-T1 recipes, including **Poke Balls** and Potions. Technology Points.
- Shops with high prices (§6.7). Money.

**Exit criterion:** a 45-minute session where both players survive in the wilderness by gathering, cooking and crafting their own Poke Balls and armour, with meters that genuinely shape decisions.

---

## M5: Open world and settlements

**Scope**
- Chunked terrain streaming for the 6x6 km region, with LOD and foliage instancing.
- 5 biomes playable: Hearthmeadow, Elderwood, Fjordlands, Mirefen, Runestone Heath. Day and night, basic weather.
- Settlement framework: small, medium and large tiers with boundaries, a no-build rule and region banners. 1 large city (Blomstad or Runeby), 3 towns and 6 villages.
- NPC framework: schedules, dialogue trees, shops, inns. Poke Centers as fast travel.
- The map screen, plus POI and discovery tracking.
- About 80 species with biome spawn tables and level bands.
- Performance budget: 60 fps target, 30 fps floor, in the browser.

**Exit criterion:** players walk from Bramblewick to a large city through 3 biomes without loading screens, discovering settlements and POIs along the way, and fast travel back.

---

## M6: First gym slice

**Scope**
- Gym framework: two-plate entry, presence checks, chambers, checkpoints, ping wheel.
- One complete puzzle gym (Runeby "Mirror Minds", or Blomstad as fallback) with 2 co-op gym trainers and the leader.
- **Co-op boss battle** (3 registered each, 1 out each, the boss fields 2), with a plan-phase timer and partner planning pings.
- **Boss AI T1-T2** (§4.5): joint-action enumeration, damage-calc evaluation, an opponent model and targeting heuristics.
- **Badges, the level cap table, XP banking, disobedience, gym eligibility** (§3).
- **Adaptive gym scaling** algorithm with 2 gym templates to prove the re-scaling works.

**Exit criterion:** two players solve the gym together (it provably can't be soloed), beat a leader that uses held items and makes smart targeting choices, earn the badge, and see the cap rise and the second gym's team re-scale. A playtest rates the leader as "hard but fair".

---

## M7: Player levels, classes and quests

**Scope**
- Player XP, levels 1-50, Skill Points and the **5 class skill trees** with about 10 nodes each implemented (the full trees in content milestones).
- Class innate perks and trade-offs active.
- Quest framework: main, side, class and bounty quests; tracker integration; rewards. Data-driven quest scripting.
- The Prologue and Act I main quests. 15 side quests. The first class quest for each class.

**Exit criterion:** two players with different classes feel different in play (for example the Ranger out-travels while the Artisan out-crafts). Quests drive most of their XP over a 2-hour session.

---

## M8: Base building and automation

**Scope**
- Base cores, snapping build pieces and 2 biome sets. Shared bases in co-op.
- T2-T3 crafting stations, conveyors, power.
- Work aptitudes, assigning creatures, base morale and food.
- **Poke Ball assembly line** and **money automation** (Merchant Stall and Delivery Contracts) with market saturation.
- Optional base incursions.
- Server-side automation ticking with offline fast-forward.

**Exit criterion:** players build a base outside a settlement that, once set up, produces Poke Balls and money while they explore. Prices stay balanced (automation helps but doesn't trivialise).

---

## M9: Riding and traversal

**Scope**
- Mount controller for land, water (surface and dive) and air (flight and glide), with stats derived from body plan, Speed and weight (§8.2).
- Saddle crafting. Two-seat mounts. Glider and grapple tools.
- 10 rideable species spread across tiers D-S.
- Swimming and climbing for players.

**Exit criterion:** a "race across the map" test. A player on an S-tier land mount clearly outpaces a D-tier one, water and air travel open the Fjordlands and the archipelago, and both players can share a two-seat mount.

---

## M10: Content expansion I

**Scope**
- All 11 biomes and all 12 cities blocked out; 6 fully dressed.
- 5 gyms with complete puzzles. Act I-II story including the 3 Tether Engines and their world-state changes.
- About 250 species (the starters, regional bird and rodent lines, about 50 new species).
- Mega Evolution (the Keystone quest) as the first gimmick.
- 60 side quests.

**Exit criterion:** a fresh pair of players can play from the Prologue to 5 badges in any gym order, and gym scaling holds in every order tested (automated simulation plus playtest).

---

## M11: Battle depth and gimmicks

**Scope**
- Boss AI T3-T4 (switch prediction, 2-ply expectimax, item logic).
- Z-Moves (Trial Shrines), Dynamax and Gigantamax (Power Spots, Max Raid dens).
- The full held-item pool, Mints, Ability Capsules and Patches, Bottle Caps, Training Grounds, TM Press, Move Tutors.
- The Battle Tower at Tornhavn (unlocks at 5 badges), with BP shop.
- The Scholar's battle-intel skills.

**Exit criterion:** experienced competitive players rate the T4 AI as a credible opponent that wins at least 40% against a reasonable player team. Every gimmick works in co-op and solo.

---

## M12: Content expansion II

**Scope**
- All 10 gyms. Act III "The Long Night" (the split-sky world state) and Act IV at Crownspire.
- Elite Four, Champion and Victory Road.
- All new legendaries and mythicals with their quest chains. **The full ~500 species dex** ([DEX_PLAN.md](DEX_PLAN.md)).
- The remaining class quests and full skill trees.

**Exit criterion:** the game can be completed from start to credits. Every legendary and mythical is obtainable before the Elite Four (verified against the checklist in DESIGN §14).

---

## M13: Substance pass and dynamic events

**Scope**
- The Event Director and the full dynamic events list (§12.5).
- A density audit against §12.3 using an automated POI-per-km² heatmap tool. Fill the gaps.
- The quirky NPC catalogue, village quirks, festivals and minigames.
- About 150 side quests total.

**Exit criterion:** a density heatmap shows no km² below target, and blind playtesters walking any straight line hit something interesting at least every ~45 s.

---

## M14: Desktop packaging and polish

**Scope**
- Electron (or Tauri plus sidecar) builds for Windows and macOS with the embedded server for host-and-join, a settings menu (graphics, controls, rebinding), gamepad support and save management.
- Code signing and notarisation for macOS. An auto-updater.

**Exit criterion:** a non-technical player installs the desktop build on Windows and Mac, hosts a world, and a friend joins over the internet and plays a full session.

---

## 1.0 release

**Scope:** a balance pass (caps, prices, AI, catch rates), an art pass to the target painterly look, audio and music, the accessibility pass, a performance pass, onboarding and tutorials, and a bug bash.

**Exit criterion:** an external playtest group of 10 pairs completes the game with no blocking bugs, and the median "difficulty felt fair" rating is 4/5 or higher.

### Character assets (2026-10-05)

The existing 21 gameplay slots now use animated imported Pokémon models, with Red as an available/default trainer. A library contains 1,322 available models/forms. This completes the asset-import layer; it does not mark unimplemented encounters, canonical stats or later milestones complete. See MODEL_ASSETS.md.
