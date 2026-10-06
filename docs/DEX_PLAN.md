# Sijord: Regional Dex Plan

> **Current state (2026-10-05).** The game now uses canonical Kanto Pokémon, not original species: the 21 original save ids are kept but each is now its Pokémon with real types, stats and learnsets (`fernfawn` = Bulbasaur, `cindlet` = Charmander, `splashpup` = Squirtle, `finchlet` = Pidgey, `nibblet` = Rattata, `dewmite` = Caterpie, `cloveret` = Clefairy, `hjordpup` = Growlithe and their evolutions; see `src/shared/pokemon-visuals.ts`), and newer species use the Pokémon's own name as id. The plan below (original species, original art) predates the owner's switch to imported Pokémon models and is kept for the regional-dex structure, not as the current roster.

How mainline Pokemon games build a regional dex, and how Sijord copies that pattern: **about 400 returning species plus 100 new species**, for a regional dex of about 500 (plus regional forms).

Related: [DESIGN.md](DESIGN.md) (riding §8, catching §5, story §10).

> **IP note.** Returning species are referenced by name for design purposes. Every in-game model, sprite, icon and cry must be **original or placeholder art**. Never rip official assets. The 100 new species below are original concepts.

---

## 1. Research: how the mainline games compose a regional dex

### 1.1 The numbers

| Gen | Game (original release) | Regional dex size | New species in that generation | New share of regional dex | Notes |
|---|---|---|---|---|---|
| 1 | Red / Blue (Kanto) | 151 | 151 | 100% | Everything new |
| 2 | Gold / Silver (Johto) | 251 | 100 | ~40% | Most of Kanto returns; cross-gen evolutions (Crobat, Steelix, Scizor) and baby forms |
| 3 | Ruby / Sapphire (Hoenn) | 202 | 135 | ~67% | 67 returning, a soft reboot |
| 4 | Diamond / Pearl (Sinnoh) | 151 (Platinum: 210) | 107 | ~55-60% | Many new evolutions of old species (Magmortar, Togekiss, Mamoswine) |
| 5 | Black / White (Unova) | **156** | **156** | **100%** | No old species until post-game. B2/W2 expanded it to 300 |
| 6 | X / Y (Kalos) | **457** (Central 150 / Coastal 153 / Mountain 151) | **72** | **~16%** | The smallest new batch. Mega Evolution carried the novelty |
| 7 | Sun / Moon (Alola) | **302** (USUM: 403) | **81** (88 by USUM, incl. Ultra Beasts) | ~27% (SM) / ~22% (USUM) | **18 Alolan forms**. Dex split across 4 islands. Z-Moves |
| 8 | Sword / Shield (Galar) | **400** (+ Isle of Armor 210, Crown Tundra 210) | **81** base (89 with DLC) | ~20% | ~20 Galarian forms incl. new evolutions (Obstagoon, Perrserker, Sirfetch'd, Cursola, Mr. Rime, Runerigus). Dynamax and 32 Gigantamax forms |
| 8.5 | Legends: Arceus (Hisui) | **242** | **7** (+ 17 Hisuian forms) | ~3% (~10% counting forms) | Open-world precedent: smaller dex, many forms and new evolutions (Wyrdeer, Kleavor, Ursaluna, Basculegion, Sneasler, Overqwil, Enamorus) |
| 9 | Scarlet / Violet (Paldea) | **400** (+ Kitakami 200, Blueberry 243) | **~103** base (120 with DLC and patches) | ~26% | Paradox forms, Paldean Wooper and Tauros, Terastal |

**Takeaway.** The modern full-size formula (Gen 6-9) is a regional dex of **about 300-460**, where **new species make up roughly 15-30%**. The rest are returning species drawn from **every** previous generation. Open-world entries (Legends: Arceus, Scarlet/Violet) lean on **regional forms and new evolutions of old species** to make the old feel new.

### 1.2 The recurring pattern

| Pattern element | What mainline games do | Examples |
|---|---|---|
| **Starter trio** | Grass, Fire and Water, 3 stages each, evolving at about Lv 16 and 32-36. The final stage usually gains a second type | Decidueye (Grass/Ghost), Incineroar (Fire/Dark), Primarina (Water/Fairy) |
| **Early-route bird** | Normal/Flying, 3 stages, final stage often a mid-game flyer or taxi | Pidgey, Starly, Fletchling (Fire/Flying final), Pikipek, Rookidee (Steel/Flying final), Wattrel |
| **Early-route rodent** | Normal, 2 stages. A filler HM/utility user with a joke personality | Rattata, Bidoof, Patrat, Bunnelby, Yungoos, Skwovet, Lechonk (not a rodent, same slot) |
| **Early bug** | 3 stages with fast evolution (Lv 7-10), a flashy final | Caterpie, Wurmple, Scatterbug, Grubbin, Blipbug, Tarountula and Nymble |
| **Electric rodent ("Pikaclone")** | Small, cute, Electric | Pachirisu, Emolga, Dedenne, Togedemaru, Morpeko, Pawmi |
| **Full evolution lines** | Lines are included whole. A base form is never dropped while its evolution stays | — |
| **Cross-gen evolutions** | New evolutions or pre-evolutions for old species | Gen 2 babies, Gen 4 evolutions, Galar and Hisui new evolutions, Kingambit, Annihilape |
| **Regional forms** | Old species re-typed for the region's climate or history | 18 Alolan, ~20 Galarian, ~17 Hisuian, 3 Paldean |
| **Fossil pair** | Two 2-stage lines revived from fossils, often version-split | Tyrunt / Amaura, Dracozolt and friends |
| **Pseudo-legendary** | A 3-stage Dragon-ish line with BST 600, rare, late, slow to level | Dragonite, Tyranitar, Salamence, Metagross, Garchomp, Hydreigon, Goodra, Kommo-o, Dragapult, Baxcalibur |
| **Box legendaries** | A pair (version mascots) plus a third uniter, tied to the story's central conflict | Groudon, Kyogre and Rayquaza; Zacian, Zamazenta and Eternatus; Koraidon and Miraidon |
| **Mythicals** | 1-3 species obtainable outside normal play (events) | Mew, Celebi, Marshadow, Zarude |
| **Dex ordering** | Starters first; then bird, rodent and bug; species roughly in the order you meet them; pseudo-legendary near the end; legendaries last | All modern dexes |
| **Type balance** | Every type is represented. Water and Normal are usually the most common, Ice and Dragon the rarest. Each gym type needs 6+ options | — |
| **Generation spread** | Returning species come from every previous generation, weighted by popularity, fit with the region's theme, and to keep fan favourites | Galar and Paldea draw from Gen 1-8 |

---

## 2. Sijord's dex rule

**Regional Dex = about 400 returning species + 100 new species (#S001-S100) + 17 Sijordic regional forms.**

This puts the new share at about 20%, in line with the Galar and Paldea ratio. Sijord adds the Legends: Arceus trick of **regional forms and four new evolutions of returning species**, so the familiar 400 don't feel like a museum.

### 2.1 Returning species selection rules

A returning species line is included when it passes **all four hard rules** and scores well on the soft rules.

**Hard rules**
1. **Whole lines only.** Every stage of a line is included (including baby forms and cross-gen evolutions), unless the excluded stage is a regional form we are replacing.
2. **Biome fit.** It has a believable home in at least one Sijord biome (the climate is temperate to arctic, plus volcanic and desert pockets). Tropical-only species (Alolan forms, Tropius) are kept to a minimum.
3. **Original art feasible.** We can model it in our chunky, stylised look at placeholder quality.
4. **It doesn't crowd a new species' niche.** For example, no second early-route Normal rodent line competes with Nibblet in Hearthmeadow.

**Soft rules (scored 0-3 each, include the highest totals until each quota is met)**
- **Gimmick support.** Lines with a Mega, a Gigantamax or a signature Z-Move get priority. Targets: at least 30 Mega-capable lines (the Mega Stone hunt), at least 20 Gigantamax-capable lines (dens) and the signature Z species (Pikachu, Eevee, Snorlax, Mimikyu, Decidueye, Incineroar, Primarina, Lycanroc, Kommo-o and others).
- **Rideable.** At least 45 returning species must be rideable, spread across land, water and air and across tiers D-S. Must-haves: Cyclizar, Bouffalant, Mudsdale, Rapidash, Gogoat, Lapras, Sharpedo, Wailord, Corviknight, Dragonite, Flygon, Altaria, Mamoswine, Arcanine, Stantler line.
- **Competitive relevance.** Bosses (and players) need a real doubles toolbox: Incineroar, Amoonguss, Rillaboom, Indeedee, Grimmsnarl, Whimsicott, Hatterene, Torkoal, Pelipper, Dragapult, Garchomp, Gholdengo, Kingambit and the like.
- **Work aptitude coverage.** Every base work type needs several early, mid and late options.
- **Fan favourites and popularity.**
- **Gym and Elite Four needs.** Each gym leader needs at least 8 thematic lines across the 4 tier bands, so all 18 types end up with at least 18 species in the full dex.

**Legendaries.** About 12 returning legendaries and mythicals are obtainable through quests and Lysfolk vaults: for example the Regi trio in Deepdelve vaults, the Kanto birds as roaming quests, and the Lake trio in Runestone tarns. They count inside the 400 and must be **catchable before the Elite Four** (DESIGN §14).

### 2.2 Per-generation quota (returning species)

Weighted by generation size, by fit with Sijord's Nordic climate, and by recency (newer gens have strong doubles tools and Gigantamax).

| Gen | Pool size | Sijord quota | Share of pool | Rationale | Example inclusions |
|---|---|---|---|---|---|
| 1 | 151 | **60** | 40% | Iconic, many Megas and Gigantamax, many rideables | Lapras, Arcanine, Rapidash, Dragonite line, Eevee line, Snorlax, Gengar, Gyarados, Machamp |
| 2 | 100 | **40** | 40% | Cold-climate fits and cross-gen evolutions | Swinub line, Sneasel, Stantler, Heracross, Houndoom, Tyranitar line, Delibird, Phanpy |
| 3 | 135 | **50** | 37% | Megas and Ice and Water depth | Spheal line, Snorunt, Swablu, Absol, Aggron, Torkoal, Sharpedo, Wailord, Metagross line |
| 4 | 107 | **45** | 42% | Snow lines, cross-gen evolutions and the Garchomp line | Snover, Riolu, Garchomp line, Bidoof (alt rodent in the north only), Togekiss, Magnezone |
| 5 | 156 | **55** | 35% | Huge pool with strong doubles tools | Bouffalant, Cubchoo, Vanillite, Sawsbuck (seasonal), Hydreigon line, Volcarona, Amoonguss, Whimsicott |
| 6 | 72 | **30** | 42% | Amaura, Avalugg, Gogoat, Skiddo | Gogoat, Bergmite, Amaura, Noibat, Goodra line, Talonflame, Aegislash |
| 7 | 88 | **35** | 40% | Doubles staples and Z signature species | Incineroar line, Mimikyu, Mudsdale, Lycanroc, Kommo-o line, Crabominable, Toxapex |
| 8 | 96 (incl. Hisui) | **45** | 47% | Northern Galar fits (Crown Tundra), Gigantamax | Corviknight line, Wooloo line, Eiscue, Frosmoth, Dragapult line, Grimmsnarl, Wyrdeer, Ursaluna |
| 9 | 120 | **40** | 33% | Newest lines, Cyclizar, Cetitan, Baxcalibur | Cyclizar, Cetoddle, Frigibax line, Kingambit, Gholdengo, Annihilape, Tinkaton, Flamigo |
| **Total** | | **400** | | | |

---

## 3. Sijordic regional forms (17 forms, 9 lines; not counted in the 100)

Sijord's long winters and Lysfolk history re-shaped these species:

| Line | Sijordic type(s) | Change | New evolution? |
|---|---|---|---|
| Wooloo → Dubwool | Normal / Ice → Ice / Fighting (Dubwool) | Frost-matted wool, battering-ram horns | **Ramskald** (S083) |
| Stantler | Ice / Psychic | Frost antlers, aurora sight. Replaces Hisuian Wyrdeer in Sijord | **Rimeantler** (S084) |
| Phanpy → Donphan | Ice / Ground | Woolly coat, tusks like ploughs | **Woolyphant** (S085) |
| Torkoal | Water / Rock | Hot-spring shell that vents steam instead of smoke | **Geysault** (S086) |
| Mareep → Flaaffy → Ampharos | Electric / Ice | Super-thick insulating wool that stores static in the cold | — (Mega Ampharos is kept) |
| Ponyta → Rapidash | Ice / Fire | Aurora-coloured cold flames. Still a Land A mount | — |
| Corphish → Crawdaunt | Water / Ice | Fjord-ice armour plating | — |
| Hoothoot → Noctowl | Ghost / Flying | Mirefen fog owls that hoot for the lost | — |
| Swablu → Altaria | Ice / Flying | Snow-cloud wings. Altaria becomes a cold-proof Air C mount | — (Mega Altaria uses its original form) |

---

## 4. The 100 new species (#S001-S100)

Grouped by evolution line and ordered as the dex would be: starters, then early-route species, then species in roughly the order you'd meet them, then the pseudo-legendary, mythicals and legendaries.

**Riding key:** mode plus speed tier (D slowest to S fastest), as derived in DESIGN §8.2. "None" means not rideable.

#### Starter: Grass (fawn line)

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S001 | **Fernfawn** | Grass | Starter | Fawn with unfurling fern ears; leaves a trail of clover where it naps | Hearthmeadow | None |
| S002 | **Bramblebuck** | Grass | Lv 16 | Lanky young stag; bramble antlers it trims itself with its teeth | Hearthmeadow | Land C |
| S003 | **Elkwarden** | Grass / Fighting | Lv 36 | Towering moss elk; saplings grow in its antlers and it guards forests with shoulder charges | Elderwood | Land B (two-seat) |

#### Starter: Fire (lynx line)

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S004 | **Cindlet** | Fire | Starter | Lynx kitten with ember ear-tufts that flare when it is curious | Hearthmeadow | None |
| S005 | **Pyrolynx** | Fire | Lv 16 | Sleek hunting lynx with coal-black paws that leave smouldering prints | Ashen Highlands | Land B |
| S006 | **Forgelynx** | Fire / Steel | Lv 36 | Armoured lynx whose plates are forged in its own inner furnace; smiths revere it | Ashen Highlands | Land A |

#### Starter: Water (seal line)

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S007 | **Splashpup** | Water | Starter | Round seal pup that bounces like a ball on land | Hearthmeadow (coast) | None |
| S008 | **Sealkin** | Water | Lv 16 | Playful seal wearing a kelp scarf; carries pebbles as gifts | Fjordlands | Water C |
| S009 | **Selkira** | Water / Fairy | Lv 36 | Selkie-like seal guardian with a shimmering sealskin cloak; sings ships home through fog | Skerry Archipelago | Water A (dive) |

#### Regional bird (early route)

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S010 | **Finchlet** | Normal / Flying | — | Plump bunting that steals crumbs from picnics | Hearthmeadow | None |
| S011 | **Fjordling** | Normal / Flying | Lv 17 | Cliff-nesting swift that races updrafts along fjord walls | Fjordlands | None |
| S012 | **Skjaldhawk** | Normal / Flying | Lv 34 | Big hawk whose chest plumage forms a round shield crest; dives like a falling shield | Stormcrown Peaks | Air B |

#### Regional rodent (early route)

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S013 | **Nibblet** | Normal | — | Vole with enormous cheek pouches; hoards anything shiny | Hearthmeadow | None |
| S014 | **Stashquill** | Normal / Ground | Lv 20 | Hedgehog-vole that digs pantry tunnels; base Gathering 3 (finds items) | Hearthmeadow, Badlands | None |

#### Early bug

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S015 | **Dewmite** | Bug | — | Tiny mite that drinks morning dew off spider silk | Hearthmeadow | None |
| S016 | **Cocoonch** | Bug / Grass | Lv 8 | Cocoon wrapped in moss that sways to soak sunlight | Elderwood | None |
| S017 | **Auroramoth** | Bug / Psychic | Lv 18 | Moth with aurora-banded wings; swarms on Aurora Nights | Runestone Heath | None |

#### Regional electric rodent

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S018 | **Sparkit** | Electric | — | Squirrel whose tail fluff builds static as it scurries | Elderwood | None |
| S019 | **Voltail** | Electric / Flying | Thunder Stone | Flying squirrel that glides on charged membranes; kids ride its back as a glider pack | Elderwood, Stormcrown | Air D (glide only) |

#### Clover hare

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S020 | **Cloveret** | Grass | — | Bunny with four-leaf-clover ears; finding one is said to be lucky | Hearthmeadow | None |
| S021 | **Luckhare** | Grass / Fairy | Friendship | Lean hare that leaves lucky clover patches; boosts item finds when in party | Hearthmeadow, Blomstad | Land C |

#### House sprite (nisse)

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S022 | **Nisslet** | Fairy / Normal | — | Tiny red-capped house sprite that tidies homes in exchange for porridge | Villages (night) | None |
| S023 | **Tomteld** | Fairy / Normal | Lv 30 at a base | Bearded farm guardian; Handiwork 4, the best early base worker | Villages, bases | None |

#### Fjord fish

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S024 | **Glimfin** | Water | — | Small silver fish with a lantern freckle; schools glitter in fjord shallows | Fjordlands | None |
| S025 | **Fjordpike** | Water / Dark | Lv 30 | Huge ambush pike that lurks under ice and docks | Fjordlands, Rimefrost lakes | Water B |

#### Puffin

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S026 | **Puffwick** | Water / Flying | — | Puffin chick with a candle-flame beak stripe | Fjordlands sea stacks | None |
| S027 | **Lundecap** | Water / Flying | Lv 28 | Puffin captain with a beak like a rudder; carries fish in neat rows | Skerry Archipelago | Air C, Water C |

#### Sheepdog

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S028 | **Hjordpup** | Normal | — | Fluffy herding puppy that nips at heels | Hearthmeadow farms | None |
| S029 | **Shepherion** | Normal / Fighting | Lv 32 | Loyal herding hound that body-blocks stampedes | Hearthmeadow, Lyngmark | Land B |

#### Acorn / oak

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S030 | **Acornel** | Grass | — | Acorn with stubby legs; plants itself to sleep | Elderwood | None |
| S031 | **Oakenward** | Grass / Rock | Lv 34 | Walking oak with a stone heartwood; villages build around it | Elderwood | Land D (two-seat) |

#### Glow mushroom

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S032 | **Lumicap** | Poison / Fairy | — | Glowing mushroom that lights Elderwood paths at night | Elderwood | None |
| S033 | **Glimmershroom** | Poison / Fairy | Lv 30 | Mushroom matriarch whose spores cause sparkly hallucinations | Elderwood, Deepdelve | None |

#### Wolf

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S034 | **Vargpup** | Dark | — | Shaggy wolf pup that howls at the aurora | Stormcrown foothills | None |
| S035 | **Fenrisk** | Dark / Ice | Lv 35 | Great frost wolf with a chain-shaped scar from an old Tether trap | Rimefrost Tundra | Land A |

#### Raven

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S036 | **Huginet** | Dark / Flying | — | Inquisitive raven chick that collects words it overhears | Runestone Heath | None |
| S037 | **Muninrav** | Dark / Psychic | Lv 34 at night | Two-headed raven: one head remembers, one thinks. Gossips to Scholars | Runestone Heath | Air C |

#### Bog wisp

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S038 | **Wispet** | Ghost | — | Will-o'-wisp that leads travellers off paths, then giggles | Mirefen | None |
| S039 | **Bogwisp** | Ghost / Poison | Dusk Stone | Lantern of marsh gas wearing a reed crown | Mirefen | None |

#### Bog toad

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S040 | **Peatpole** | Water | — | Peat-brown tadpole with a mossy tail | Mirefen | None |
| S041 | **Bogbellow** | Water / Poison | Lv 27 | Fat toad whose croak shakes the fog; bubbling poison warts | Mirefen | Water C |

#### Kelpie

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S042 | **Kelpling** | Water / Ghost | — | Foal of kelp and sea foam that appears on misty shores | Fjordlands, Mirefen | None |
| S043 | **Nykkelpie** | Water / Ghost | Lv 38 | Spectral water horse; legends say it carries riders who don't fear it | Fjordlands | Water A, Land B |

#### Lindworm

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S044 | **Lindlet** | Dragon / Poison | — | Legless wyrmling that coils in heather | Runestone Heath | None |
| S045 | **Lindwurm** | Dragon / Poison | Lv 40 | Serpentine dragon with two clawed forelegs; guards Lysfolk barrows | Runestone Heath, Deepdelve | Land B |

#### Runestone

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S046 | **Runelet** | Psychic / Rock | — | Pebble carved with a single glowing rune; spells words by lining up with others | Runestone Heath | None |
| S047 | **Megalyth** | Psychic / Rock | Lv 37 | Standing stone that hovers and rearranges stone circles at night | Runestone Heath | None |

#### Thunder goat

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S048 | **Kidbolt** | Electric | — | Kid goat whose horns spark when it head-butts | Stormcrown foothills | None |
| S049 | **Tanngrim** | Electric / Fighting | Lv 33 | Storm goat that pulls carts up cliffs; famed as Voltavik's mascot | Stormcrown Peaks | Land B (climbs cliffs) |

#### Troll

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S050 | **Pebbletroll** | Rock | — | Pebble-headed troll child that freezes when looked at in sunlight | Fjordlands, Deepdelve | None |
| S051 | **Stonetroll** | Rock / Dark | Lv 30 | Bridge-dwelling troll that demands tolls (snacks) | Fjordlands bridges | None |
| S052 | **Jotunrock** | Rock / Dark | Lv 48 | Giant moss-backed mountain troll; its back is a small meadow | Stormcrown Peaks | Land D (two-seat, smashes boulders) |

#### Berserker bear

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S053 | **Bjornling** | Fighting | — | Bear cub that wrestles everything, including trees | Elderwood | None |
| S054 | **Berserkr** | Fighting / Dark | Lv 36 | Hulking bear in a cloak of its own shed fur; enters a battle rage | Stormcrown, Elderwood | Land C |

#### Hot spring capybara

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S055 | **Soakling** | Water | — | Capybara pup that's never happier than when wet | Blomstad hot springs | None |
| S056 | **Onsenbara** | Water / Fire | Lv 30 | Serene capybara that heats its own bathwater; other creatures sit on it | Blomstad, Ashen springs | Water C (two-seat) |

#### Lava mole

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S057 | **Cindermole** | Fire / Ground | — | Mole with a glowing nose that tunnels through warm ash | Ashen Highlands | None |
| S058 | **Calderamole** | Fire / Ground | Lv 33 | Massive digging claws of cooled obsidian; Mining 4 | Ashen Highlands, Coppergill | Land D (lava-walk) |

#### Canyon lizard

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S059 | **Mesalisk** | Ground | — | Frilled lizard that does push-ups on hot rocks | Sunscar Badlands | None |
| S060 | **Canyonrex** | Ground / Rock | Lv 34 | Long-legged runner lizard banded like canyon strata | Sunscar Badlands | Land A (sandstorm-immune) |

#### Cactus

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S061 | **Spinelet** | Grass / Ground | — | Barrel cactus with a flower hat; stores water for travellers | Sunscar Badlands | None |
| S062 | **Saguardian** | Grass / Ground | Lv 32 | Tall arms-raised cactus sentinel; tapping it gives water (thirst refill) | Sunscar Badlands | None |

#### Gear hound (Krane Industries)

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S063 | **Rivetpup** | Steel | — | Pup with a riveted metal coat, once Krane Industries' mascot, now feral | Jernhamn outskirts | None |
| S064 | **Gearhound** | Steel / Electric | Lv 35 | Clockwork-looking hound with a spinning gear tail; Generating 3 | Jernhamn, Ashen | Land A |

#### Tether creature (story)

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S065 | **Chainling** | Steel / Dark | — | Living link of an Engine chain that woke up and ran away | Tether Engine sites | None |
| S066 | **Fetterclad** | Steel / Dark | Lv 40 + Engine shutdown | Armoured creature made of broken shackles; it fights to free others | Tether Engine sites | None |

#### Ermine (seasonal forms)

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S067 | **Stoatlet** | Ice | — | Stoat kit; white in winter, brown in summer (form follows world season) | Rimefrost, Stormcrown | None |
| S068 | **Ermira** | Ice / Fairy | Lv 31 | Regal ermine with a royal-cloak tail. Summer form: Normal / Fairy | Rimefrost | None |

#### Musk ox

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S069 | **Muskit** | Ice / Normal | — | Woolly calf that hides under its mother's fringe | Rimefrost Tundra | None |
| S070 | **Muskolos** | Ice / Normal | Lv 36 | Colossal musk ox that forms defensive rings in blizzards | Rimefrost Tundra | Land D (two-seat, ice-walk, cold-proof) |

#### Arctic tern

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S071 | **Ternwisp** | Ice / Flying | — | Tern chick with frost-tipped feathers | Rimefrost coast | None |
| S072 | **Polaritern** | Ice / Flying | Lv 34 | Migrates pole to pole; sleeps on the wing | Rimefrost, Skerry | Air A (low stamina) |

#### Narwhal

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S073 | **Narlet** | Water / Ice | — | Narwhal calf with a nub tusk | Rimefrost sea | None |
| S074 | **Narvalor** | Water / Steel | Lv 38 | Knightly narwhal whose tusk is a steel lance | Rimefrost sea, Skerry | Water A (dive) |

#### Aurora eel

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S075 | **Aurorel** | Electric / Water | — | Eel whose skin glows aurora green | Fjordlands depths | None |
| S076 | **Aurorangler** | Electric / Water | Lv 35 | Deep anglerfish whose lure projects tiny auroras | Fjordlands depths, Skerry | Water B (dive) |

#### Draugr

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S077 | **Drauglet** | Ghost / Ice | — | Frost-rimed spirit in a tiny dented helm | Rimefrost barrows | None |
| S078 | **Draugrim** | Ghost / Ice | Reaper Cloth | Undead warrior spirit in a frozen longship plank cloak | Rimefrost, Myrkvald | None |

#### Fossil: sea reptile (Lysfolk Dig)

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S079 | **Plesiokit** | Rock / Water | Revive Fin Fossil | Long-necked fossil sea reptile pup | Fossil dig (Grusdal) | None |
| S080 | **Plesiodon** | Rock / Water | Lv 39 | Elegant plesiosaur that sails its head above fjord waves | Fjordlands | Water B (two-seat) |

#### Fossil: giant dragonfly (Lysfolk Dig)

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S081 | **Ambrid** | Rock / Bug | Revive Amber Fossil | Dragonfly nymph preserved in amber | Fossil dig (Grusdal) | None |
| S082 | **Meganeuron** | Rock / Bug | Lv 39 | Prehistoric giant dragonfly with stained-glass wings | Elderwood, Mirefen | Air B |

#### New evolutions of Sijordic forms

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S083 | **Ramskald** | Ice / Fighting | Sijordic Dubwool: land 3 crits in one battle | Ram poet-warrior; its horns are carved with sagas | Rimefrost, Stormcrown | Land B |
| S084 | **Rimeantler** | Ice / Psychic | Sijordic Stantler: level up on an Aurora Night | Reindeer whose frost antlers refract the aurora | Rimefrost | Land A |
| S085 | **Woolyphant** | Ice / Ground | Sijordic Donphan: Lv 45 in a blizzard | Mammoth-like elephant; carries whole caravans | Rimefrost Tundra | Land D (two-seat, snow plough) |
| S086 | **Geysault** | Water / Rock | Sijordic Torkoal: Lv 40 near a geyser | Tortoise whose shell vents geysers it can launch riders with | Ashen springs | Water C (launch pad) |

#### Standalone species

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S087 | **Fylgja** | Psychic / Ghost | — | Guardian spirit-animal that shadows one trainer for life; shape mirrors the player's lead creature | Anywhere (rare, night) | None |
| S088 | **Cairnward** | Rock / Ghost | — | Cairn of stacked stones that moves only when nobody is looking | Runestone Heath, Stormcrown | None |
| S089 | **Nornweave** | Bug / Psychic | — | Loom-spider that weaves threads said to show fates; three colour forms | Elderwood ruins | None |
| S090 | **Dvergsmith** | Steel / Fighting | — | Stout dwarf-like smith creature; Handiwork 4 and Kindling 2 | Emberholt mines, Deepdelve | None |
| S091 | **Krakhaug** | Water / Dark | — | Rare colossal kraken, mistaken for an island; Alpha-only spawns | Skerry Archipelago (open sea) | Water B (two-seat, dive) |
| S092 | **Sleipnyx** | Normal / Fighting | — | Rare eight-legged horse; its gallop sounds like a drumroll | Hearthmeadow, Runestone (roams) | Land S (best stamina of any S mount) |

#### Pseudo-legendary (BST 600)

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S093 | **Ripplet** | Dragon | — | Tiny sea serpent that hides in tide pools; rare | Skerry Archipelago | None |
| S094 | **Skerrling** | Dragon / Water | Lv 50 | Serpent that coils around sea stacks to sleep | Skerry, Fjordlands | Water B |
| S095 | **Jormundrake** | Dragon / Water | Lv 64 | World-serpent dragon: its body can circle an island; the fastest sea mount | Open sea | Water S (dive) |

#### Mythicals (quest-only, no events needed)

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S096 | **Wickling** | Grass / Fairy | — | Bramblewick's guardian spirit, living in the old bramble at the heart of the village | Bramblewick (Mythical quest 'The Old Bramble') | None |
| S097 | **Lysgnist** | Steel / Psychic | — | Ancient Lysfolk automaton-spirit that chose to work beside creatures, not use them | Lysfolk Fabricator (Mythical quest 'Fair Work') | None |

#### Legendaries (story, Act III)

| # | Name | Type(s) | Evolution | Concept | Biome | Riding |
|---|---|---|---|---|---|---|
| S098 | **Solvyrn** | Fire / Fairy | — | Midnight-sun titan: a gold-feathered sun-wyrm. Krane wants it chained to end winter | Eastern sky (Long Night quest) | Air S |
| S099 | **Nocthyrn** | Dark / Ice | — | Polar-night titan: a starry, frost-maned wyrm that brings the dark season | Western sky (Long Night quest) | Air S |
| S100 | **Nordlyth** | Psychic / Dragon | — | Aurora legendary that balances the two titans; ribbon-like body of shifting light | Lysfolk Observatory (finale) | Air S |

---

## 5. Composition check

### 5.1 Pattern compliance

| Pattern element | Sijord |
|---|---|
| Starter trio, 3 stages, final dual type | Fernfawn → Elkwarden (Grass/Fighting), Cindlet → Forgelynx (Fire/Steel), Splashpup → Selkira (Water/Fairy) |
| Regional bird (3 stages, Normal/Flying) | Finchlet → Fjordling → Skjaldhawk |
| Regional rodent (2 stages, Normal) | Nibblet → Stashquill |
| Early bug (3 stages, fast evolution) | Dewmite → Cocoonch → Auroramoth |
| Electric rodent | Sparkit → Voltail |
| Fossil pair | Plesiokit line (sea reptile), Ambrid line (giant dragonfly) |
| Pseudo-legendary (BST 600) | Ripplet → Skerrling → Jormundrake (Dragon/Water). Unusually, it's a sea mount |
| New evolutions of old species | 4: Ramskald, Rimeantler, Woolyphant, Geysault |
| Regional forms | 17 forms across 9 lines |
| Legendaries | Box pair Solvyrn (Fire/Fairy) and Nocthyrn (Dark/Ice), and uniter Nordlyth (Psychic/Dragon) |
| Mythicals | Wickling (Grass/Fairy), Lysgnist (Steel/Psychic). **Both earned in-game through quests**, per the no-lockout rule |
| Line structure | 7 three-stage lines (21), 32 two-stage lines (64), 4 new evolutions of returning lines, 11 single-stage species (incl. 5 legendaries and mythicals) |

### 5.2 Type coverage of the 100 new species
Each type counted once per species that has it.

| Type | Normal | Fire | Water | Grass | Electric | Ice | Fighting | Poison | Ground | Flying | Psychic | Bug | Rock | Ghost | Dragon | Dark | Steel | Fairy |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| New species | 12 | 7 | 23 | 11 | 7 | 14 | 8 | 6 | 8 | 9 | 9 | 6 | 13 | 8 | 6 | 12 | 8 | 9 |

Water and Ice skew high on purpose (fjords, archipelago, tundra). Combined with the returning 400, every type reaches at least 18 species. The thinner new types (Poison, Bug, Dragon, Fire, Electric) are covered by the returning quotas.

### 5.3 Riding coverage of the 100 new species

| Mode | Count | Tiers present |
|---|---|---|
| Land | 20 | D (Oakenward, Jotunrock, Calderamole, Muskolos, Woolyphant), C, B, A (Forgelynx, Fenrisk, Canyonrex, Gearhound, Rimeantler), S (Sleipnyx) |
| Water | 13 (incl. dual-mode) | C (Sealkin, Bogbellow, Onsenbara, Geysault), B, A (Selkira, Nykkelpie, Narvalor), S (Jormundrake) |
| Air | 9 (incl. dual-mode) | D glide (Voltail), C, B, A (Polaritern), S (the three legendaries) |
| None | 58 | — |

Combined with at least 45 rideable returning species, players have mount options in every mode and tier by mid-game.

### 5.4 Story ties
- **Chainling / Fetterclad.** These creatures were literally made from Tether Engine chains. Fetterclad evolves only after the player shuts down a Tether Engine (Act II).
- **Gearhound.** It's Krane Industries' former mascot, a reminder of the company's "friendly automation" image.
- **Solvyrn, Nocthyrn, Nordlyth.** The Act III Long Night arc (DESIGN §10).
- **Wickling.** The Bramblewick mythical quest "The Old Bramble". It unlocks after 4 badges and brings the players home.
- **Lysgnist.** The "Fair Work" mythical quest, tied to rebuilding the Lysfolk Fabricator (T4 crafting). It's the thematic answer to Krane.
- **Muninrav, Runelet, Megalyth, Cairnward, Nornweave.** Lysfolk lore carriers. Their Dex entries add up to the region's backstory.

### 5.5 Implementation notes
- Species data lives in `src/shared/data/species/*.ts` (planned), with fields `{ id, name, types, baseStats, abilities, evolution, biomes, levelBand, temperament, workAptitudes, riding: { modes, bodyPlan, flags } }`. The mount tier is computed from the stats at load time (DESIGN §8.2), not hand-entered, so balance changes flow through automatically.
- New species get IDs `S001-S100`. Returning species keep their national number. Regional forms use `national#-sijord`.
- Base stats for the new species are still to be written. Guidelines: starters BST 318 / 405 / 530, the bird line finishing at about 490, the pseudo at 600, the legendaries at 680 and the mythicals at 600.
