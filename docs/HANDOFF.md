# Sijord: handoff

Everything a new contributor (human or Claude) needs to pick up this project from the repository alone. Written 2026-10-04 after PR #3, updated 2026-10-05 after PR #9 and live world/UI polish verification. Update the "Current state" and "Next up" sections whenever a milestone lands.

**Latest direct feedback:** Read [POLISH_HANDOFF.md](POLISH_HANDOFF.md) first. It explains the new requests, implemented changes, asset/animation provenance and remaining gaps. The latest reference images and before/after screenshots are stored in this repo.

## Who and what

- **Owner:** Simon, GitHub [`Shamygo`](https://github.com/Shamygo). He builds this with a friend who collaborates in this repo. They play it together as two-player co-op.
- **The game:** a Palworld-style ("Power World" in Simon's words), third-person 3D, open world Pokemon game in the browser, later packaged for Windows and Mac. Two-player co-op is the core. Battles are hard on purpose.
- **Simon's own words** are in [VISION.md](VISION.md): the full spec plus his feedback. Read it first. It outranks every other doc.
- **Art target: use the reference picture.** [reference/art-reference.png](reference/art-reference.png) is the image Simon attached to his spec, and it is the visual target for everything the player sees: terrain, sky, water, foliage, characters, creatures, towns and HUD. Open the image itself (not just the description) before any visual work, screenshot the game from a similar angle, and compare side by side. Simon asked for the game to look "exactly like" it. See [The art reference](#the-art-reference) below for a written breakdown.

## How Simon likes to work

- He wants the game **hard**: doable, but difficult. Player power (classes, perks, prices) leans stingy. Strong abilities are earned through skill trees, not handed out at the start.
- Quality bar is high. He asked for graphics that look **exactly** like the reference and animation at **Legends Arceus** quality. Treat "close enough" as not done, and say plainly what still doesn't match.
- He is fine with Claude **merging to `main`** so the live site updates, and with Claude using **multiple parallel agents** to go faster.
- He tests by playing the live site with his friend, then sends feedback as a short message. Ship each change as a playable build.
- Keep replies to him plain and short: what changed, how to try it, what's still off, and any decision only he can make.

## Docs map

| Doc | What it holds |
|---|---|
| [VISION.md](VISION.md) | Simon's spec and feedback, verbatim |
| [DESIGN.md](DESIGN.md) | Every system in the full game: world, settlements, adaptive gyms and level caps, battles and boss AI, catching and aggression, survival craft, classes and skill trees, riding, gimmicks, story, quests, gyms, multiplayer, controls. §18 lists open questions |
| [ROADMAP.md](ROADMAP.md) | Milestones M1 to M14 plus 1.0, each with scope and an exit criterion |
| [DEX_PLAN.md](DEX_PLAN.md) | How mainline games pick a regional dex, Sijord's rule (~400 returning + 100 new), regional forms, and all 100 new species |
| [DEV_NOTES.md](DEV_NOTES.md) | Code gotchas (axes, colliders, shader warm-up, rendering, rig, saves, co-op) and how to play-test in a Claude cloud container |
| [README.md](../README.md) | How to play, run, build and test |
| [screenshots/](screenshots/) | Screenshots of the current build |

## Canon (keep consistent)

- Region **Sijord** (fjords and meadows). Hometown **Bramblewick**, a small fenced village south-centre in **Hearthmeadow Vale**, with both players' houses and **Professor Hazel**'s lab. Route 1 leaves through the north gate.
- Villains **Team Tether**, hidden inside **Krane Industries** (HQ in Jernhamn). Rival **Sunniva**.
- Classes (code ids): `ranger`, `tamer`, `artisan`, `scholar`, `medic`. Each has one small perk and one real cost (DESIGN §7.2, `src/shared/classes.ts`).
- 12 large cities, 10 of them with gyms. **Crownspire** (Elite Four, 10 badges) and **Tornhavn** (Battle Tower, 5 badges) are the only hard-locked places.
- World axes: **north = +Z, east = -X**.
- Environment art is procedural. As of 2026-10-05, the user explicitly requested imported Pokémon character models and Red from Pokémon Masters, publicly hosted. See [MODEL_ASSETS.md](MODEL_ASSETS.md).

## Stack and layout

TypeScript + Three.js, built with Vite, tested with Vitest. The environment is procedural; imported character/item assets are self-hosted with procedural fallbacks.

```
src/client/main.ts    boot: title -> trainer creator -> loading screen -> Game
src/client/core       game loop (game.ts), renderer and post (render.ts), input, collision, save, settings + keybinds
src/client/world      terrain, sky, water, grass, vegetation, cliffs, fauna, POIs, Bramblewick (hometown.ts), layout
src/client/player     trainer model and rig, animation clips and IK math, movement controller, camera, remote partner
src/client/npc        Professor Hazel, Sunniva (rival)
src/client/battle     in-world battles: stage (ring, effects), director (playback, camera, prompts), battle UI
src/client/overworld  wild herds, the follower creature, creature movement
src/client/creatures  procedural creature models and animation
src/client/ui         title, creator, HUD (compass, minimap, quests), dialogue, menus (map, bag, party, quests, settings)
src/client/net        co-op: p2p.ts (default, Trystero) and client.ts (optional Node server)
src/server            optional Node WebSocket server (2 players per room)
src/shared            types, protocol, classes, items; battle/ (engine, stats, damage, AI); data/ (species, moves, abilities)
tests/                Vitest unit tests (battle engine and damage calc, data, controller, camera, animation math, collision, settings, rooms)
```

In dev builds the running game is exposed as `window.sijord` for debugging, with `debugGiveParty`, `debugWildBattle`, `debugTeleport` and `debugTimeScale` (speeds game time up, handy in the container's slow software renderer).

## Run, test, build, deploy

```bash
npm install
npm run dev            # http://localhost:5173
npm run typecheck
npm test               # 155 tests in the current polish build
npm run build          # dist/ (what GitHub Pages serves)
npm run build:single   # dist-single/sijord.html, game code in a double-clickable file; imported art still needs internet
```

- **Live site:** https://shamygo.github.io/Sijord/. `.github/workflows/pages.yml` runs tests, builds and deploys on every push to `main`. Pages source is set to "GitHub Actions". The repo is public, which is what makes free Pages hosting possible.
- **Downloadable build:** `.github/workflows/release.yml` rebuilds `sijord.html` on every push to `main` and attaches it to the `latest` release ("Latest playable build").
- **Co-op:** both players type the same world code on the title screen. Default transport is peer-to-peer WebRTC via Trystero, using free public Nostr relays only for matchmaking, so nothing is hosted. Fallbacks: `npm run relay` plus `?relay=ws://<ip>:8090`, or `npm run server` plus `?server=ws://<ip>:8787` (or `?server=local`). Co-op over the public relays has not yet been confirmed on Simon's and his friend's real machines.
- **Verifying visually:** Chromium and Playwright are typically available in Claude's cloud container. Run `npm run dev` or `npm run preview` and screenshot the game. Software rendering there is very slow, so judge frame rate on real hardware, not in the container. [DEV_NOTES.md](DEV_NOTES.md#how-to-play-test-in-a-claude-cloud-container) has the exact Playwright setup.

## Imported character update (2026-10-05)

The 21 existing gameplay species now display animated Kanto Pokémon models and matching names. Rei from Legends: Arceus is now the default trainer, using eight baked Quaternius CC0 keyframe clips retargeted to its rig. Red/custom remain selectable. These are not original Arceus animation clips. Existing save IDs and combat progression are preserved. A searchable [model library](https://shamygo.github.io/Sijord/pokemon.html) exposes 1,322 available models/forms, 404 with embedded clips. The original 151 have 869 clips. See [MODEL_ASSETS.md](MODEL_ASSETS.md) for exact coverage and limitations. Model import does not expand encounters to the full catalogue. Next: continue M3 catching, then add encounter/species data incrementally.

## Current state (M2 plus Pokémon, battle-mode and world/UI polish)

**Current additions:** Animated Pokémon visuals for the 21 stable gameplay slots; the 1,322-entry self-hosted model explorer; 2,035 item icons and working medicine use; both free-roam turn-based and direct Pokémon action/dodge modes with host-authoritative shared encounters; default Rei with eight retargeted clips; menu pointer fixes and transitions; new empty-party guide; 971 explorer portraits; material/lighting integration; slope/ladder climbing and lookout platforms; six substantial Bramblewick street façades and stalls. See [POLISH_HANDOFF.md](POLISH_HANDOFF.md) for complete details and reasons.

**Canonical Kanto species (2026-10-05):** the 21 original save ids (`fernfawn` = Bulbasaur, `hjordpup` = Growlithe, ...) now carry their Pokémon's real types, base stats, growth rates, base exp, EV yields, catch rates, evolution levels and level-up learnsets (latest mainline data, filtered to moves the engine has), with short original descriptions. 24 more Kanto species use the Pokémon's lowercase name as id (`weedle`, `pikachu`, `nidoran-f`, ...), 45 in all, and spawn by zone in `src/client/overworld/wild.ts` (bugs, birds and rats common; Pikachu, Eevee and Abra rare; Poliwag and Psyduck by water, Geodude by the mesas). About 110 moves and 18 abilities were added, with engine support for binding, Rest, Teleport, Knock Off, Sucker Punch, Self-Destruct, fixed and variable power and more (`tests/battle-kanto.test.ts`). Loading saves moves an ability a species no longer has to a legal one and puts experience back on the new growth curve (levels never change). The 21 gameplay-pack models still load before the world; the 24 new models (about 21 MB, gzip) stream in afterwards and a species only spawns once its model is in. Gaps: stone evolutions (Pikachu, Clefairy, Growlithe) use placeholder levels until evolution items exist; Abra only knows Teleport, as in the games; binding moves don't trap yet; Chlorophyll and Cloud Nine do nothing until there is weather. Growlithe is now Fire with Intimidate, which makes the gifted second creature (and the rival fight) easier than the old Normal-type Hjordpup.

**Merged foundation/history:**
- PR #2: 3D foundation, design docs and milestone 1. Trainer creator (looks plus class), weighty third-person movement and orbit camera, Bramblewick with both houses and Hazel's lab, Hazel's intro leading to Route 1, HUD with compass, minimap and quest tracker, two-player presence.
- PR #3: second pass after Simon's feedback. Graphics reworked toward the reference (lush grass, fluffy trees, layered grey cliffs, blue river with sandy banks, haze, snowy mountains). Trainer rebuilt with walk, jog and sprint cycles, foot IK on slopes, start, stop, turn, skid, jump and land animations, idle fidgets and secondary motion. Classes nerfed to one perk and one cost. Menus: M map, B bag, P party, J quests, Esc pause and settings. Settings cover key rebinding, mouse sensitivity, invert look, FOV and quality (Low, Medium, High). Shader warm-up moved behind the loading screen so menu keys work immediately.
- PR #4 and #5: this handoff (docs only).
- PR #6: milestone 2. A deterministic, seeded double-battle engine in `src/shared/battle` (Gen 3+ stats, Gen 5+ damage with 4096 fixed-point rounding, natures, IVs and EVs, crits, type chart, priority, spread moves, Protect, Fake Out, Follow Me, Helping Hand, Tailwind, Leech Seed, status, 33 abilities, berries, running, level caps with banked XP) and a T1 and wild AI, all covered by unit tests with damage-calc reference values. Data in `src/shared/data`: 21 species (the three starter lines plus Hearthmeadow), about 80 moves, 33 abilities. Hazel's starter pick (Fernfawn, Cindlet, Splashpup) plus a gifted Hjordpup so every battle is two on two. Sunniva challenges you straight after with the starter that beats yours and waits by the lab for rematches until beaten. Wild herds roam outside the town fence with temperaments (skittish ones flee a sprinting trainer, territorial ones charge); walk up and press E to fight two of them. Battles play in the world inside a glowing ring with no screen change: ball throws, lunges, projectiles, particles, battle camera shots, floating foe plates, your team docked bottom left, a battle log, move and target menus. XP, EVs, levels to cap 15, move learning and evolution prompts, blackout back to Hazel's lab. Lead creature follows you (F recalls it), party strip top left, full party screen on P. All 21 species have procedural models with walk, run, attack, hit, faint and idle animations in `src/client/creatures` (open `/creatures.html` on the dev server for a turntable gallery). Model heights are display heights, not dex heights: small species are scaled up so a starter stands about hip-high to the trainer like the fox in the reference, while big ones stay near true size.
- PR #1, an old 2D tile prototype, predates the 3D vision and is superseded. It should be closed if still open.

**Milestone status:** M1 is done apart from its 60 fps check on real hardware. M2 (first creatures and battles) is done. M3 (catching, party and the first route) is in progress.

**M3 so far (in-battle catching):** the catch formula from DESIGN §5.2 lives in `src/shared/battle/catch.ts` (HP, catch rate, ball bonus, status, levelMod against your party level clamped to the cap, overworld/unaware throw kinds, class lean, halved over the cap, a ^0.75 curve, then four shake checks). In wild battles the command panel has **B Ball** (both battle modes): pick a ball if you carry more than one kind, then a target if two wild creatures are up. Balls go before moves. A catch plays the ball arc, absorb, shakes and a sparkle burst, takes the creature off the field and gives XP; a territorial or aggressive creature that breaks free gets +1 Attack. Catching the last wild one ends the battle. Caught creatures join the party (up to 6) or go to `save.box`, and `save.dex` records seen and caught species. The Party screen (P) shows the PC box under the team; within about 14 m of Hazel's lab you can send Pokémon to the PC or take them out (the party always keeps one that can fight). The Pokédex tab is now the region Dex: every gameplay species in national order, silhouettes until seen, name and types once seen, base stats once caught, with links to the 3D model explorer. Hazel hands over 5 Poke Balls with the starter (older saves get them on their next visit) and 3 more only when you've run out. Great and Ultra Balls exist as items but nothing gives them yet. In a friend's shared wild battle the guest throws from their own bag too: the join message carries the guest's ball counts and class catch lean (the host clamps both), the host's engine rolls the catch, and the guest's result returns the balls used and the creatures they caught, which go to the guest's party or box. The guest sees the caption and the slot empty but not the ball animation yet.

**M3 overworld throws (2026-10-06):** hold **Q** (or the right mouse button) to aim: the camera pulls in over the shoulder, Rei holds the wound-up throw, a dotted arc and a landing ring show exactly where the ball will go (the preview runs the same fixed physics steps as the real ball, `src/client/overworld/ball-flight.ts`), and the arc turns gold with a lock ring and a name, level and HP panel when it will hit a creature. The wheel picks the ball, E cancels, releasing (or a left click) throws. Balls fly, bounce off the ground and walls, roll and stop; a ball only catches while still in its first arc. A hit plays the catch in the world (the creature shrinks into the ball, it drops and shakes, then a sparkle or a burst, `src/client/overworld/throw.ts`). The overworld throw is worth ×0.6, but ×1.5 when the creature hasn't noticed you (grazing or wandering, not alert, and you're outside its 105° view either side), so sneaking up from behind matters. Missed balls lie in the grass with a twinkle for 150 s and E picks them up; balls landing in deep water are lost; a landing ball alerts creatures within 4.5 m. When a creature breaks free it reacts by temperament (DESIGN §5.3, `src/shared/overworld-catch.ts`): skittish ones bolt with their skittish herd-mates, docile ones back off warily, either may turn and fight on an aggro roll that rises when it outlevels you, territorial ones start a battle, and aggressive ones charge you directly: they close in, stop dead for a 0.7 s wind-up, then lunge in a straight line you can sidestep or dodge (**V**: a quick low hop along your input, or a backstep with none; hits pass through for its first 0.3 s; it costs stamina and side and back steps land planted facing the threat), for up to 20 s or until you leave their territory by 40 m (E battles a charging creature). A lunge that connects knocks the trainer down and costs HP (`src/shared/trainer-vitals.ts`: 100 HP plus 2 per trainer level scaled by class, damage by the creature's level, a short guard after each hit). HP only comes back after 12 s with nothing attacking, at 0.5 HP/s, or 30 at once with **H** (uses a Potion). At 0 HP you black out to Hazel's lab like a team wipe. The HP bar appears only while hurt. Your friend sees your throws, catches and knockdowns replayed (snapshots carry `ballThrow`, `ballCatch` and `down`). V is used rather than DESIGN §17's Ctrl/Alt because Ctrl+W closes the browser tab and Alt+D jumps to the address bar. Screenshots: [aiming](screenshots/2026-10-06-catching/overworld-aim.png) (compare `docs/reference/2026-10-05/ui-catching.png`), [caught](screenshots/2026-10-06-catching/overworld-caught.png), [knocked down](screenshots/2026-10-06-catching/charge-knockdown.png), [wild Pikachu](screenshots/2026-10-06-catching/wild-pikachu.png). Gaps: the dodge is a hop, not a roll (Rei has no roll clip); the knockdown tips the whole rig over stiffly rather than playing a fall clip; no Treats or partner interceptions, no crouch/sneak key (only facing counts), and herd positions drift apart between the two screens, so a friend's ball can land beside the creature on your screen.

**Known gaps:**
- Visuals vs the reference: clouds are puffier than the reference's wispy ones, cliffs look blocky up close, and there is no distant castle town on the skyline yet.
- Co-op: shared encounter lobbies and both battle modes are implemented. Wild herds are shared (below), but each player still simulates them locally, so a herd's exact positions drift apart once it moves; cross-home NAT verification remains open. Gyms/boss progression are still later milestones.
- Battle balance is untested by humans. Sunniva's first team is her counter-starter at Lv. 5 holding an Oran Berry plus a Lv. 4 Finchlet, with T1 AI that focuses your starter. A script that always picks the first move and first target won 2 of 3 runs, so a thoughtful player should usually win and a careless one can lose.
- Creature/character assets: catalogue coverage is 1,322 forms/models, not every Pokémon or implemented encounter. 45 gameplay species currently use these models. Rei's original game animation clips were unavailable; eight separate CC0 clips are retargeted. NPCs still use procedural avatars. Towns are improved but still lack Arceus-scale interiors, residents, commerce and environmental detail.
- Battles in tall grass hide the lower half of the arena ring; the ring reads well on paths and in town.
- Performance on Simon's and his friend's computers is unverified. Quality "Low" in settings is the escape hatch.
- DESIGN §17 (controls) predates PR #3. The code is the truth for current bindings (`DEFAULT_KEYS` in `src/client/core/settings.ts`): WASD move, Shift sprint, Space jump, E interact, M map, B bag, P party, J quests, Q (hold) aim and throw a ball (also right mouse), V dodge, H use a Potion on yourself, F partner, C climb, Esc pause. In battles, Tab toggles commands/mouse look, X switches and 1–4 selects moves. §17 still lists B as build mode and Tab/I as inventory, so reconcile it when build mode lands.

## Open questions waiting on Simon

From DESIGN §18. None answered yet. Proceed on the current default and flag it.
1. Gyms with only one player online: wait for the partner (current default), or offer an AI partner?
2. A player who joins a world later: inherit the host's badges or earn their own (default: their own, with a catch-up cap)?
3. 10 gyms (current plan) or the classic 8?
4. Is it okay that charging wild creatures can knock players down?

## Next up

**M3: Catching, party and the first route** (ROADMAP). In-battle catching, guest throws in shared battles, overworld throws, failed-catch aggression with trainer HP and knockdown, the party of 6 with a PC box, the region Dex and 45 species are done (above). Press E at either house door in Bramblewick to rest: the team and the trainer go back to full. Still to do: Treats and partner interceptions (§5.3), the Hearthmeadow slice to its density target with its first POIs,. Exit: catch 10+ species, survive or get knocked down by an angry charge after a bad throw, manage a party, and two players catch side by side without desync.

**Shared wild herds (2026-10-06):** herds now come from a grid of 70 m cells seeded by the world's name and a 15-minute window (`SHARED_SPAWN` and `cellPlan` in `src/client/overworld/wild.ts`), so both friends meet the same herds: same species, levels, stats and starting spots, each member keyed `cell,epoch:index`. A cell holds a herd 60% of the time; herds spawn 55-105 m away and despawn past 160 m as before. Snapshots carry `wildTaken` (keys caught or defeated in the last 30 s; they fade on the friend's screen and don't respawn that window) and `wildBusy` (keys in your battle or ball; the friend's copy hides and can't be engaged until released) and `wildCells` (`i,j,epoch` of herds you have out, so a friend arriving just after the window turns over meets those herds rather than a fresh roll). Each machine gives its copy its own creature ID, so if both friends catch the same creature in a race they each keep a distinct one. Behaviour still runs per player, so positions drift once herds move. Taken keys are only repeated for 30 s, so a friend who arrives later can still meet a creature that was caught before they got there. Two-browser check (2026-10-06): the guest's herd matched the host's key for key, a host catch faded on the guest, and a host battle hid the guest's copy and released it afterwards. Debug herds (`debugSpawnWild`) are local only. Tests: `tests/wild-shared.test.ts`.

Still an M2 follow-up: tune battle difficulty from Simon's play-testing.

Keep closing the visual gaps above alongside M3, since Simon judges every build by how it looks. Follow the newer Arceus town/trainer and UI references in POLISH_HANDOFF.md. Preserve both battle variants for side-by-side testing; do not collapse them into one mode without new feedback.

## Project history

All of this happened on 2026-10-04 in a private Claude project ("Sijord Pokemon Game") that only Simon could join. Everything from its project chat and all three of its threads is summarised here, so nothing else needs to be looked up.

**Project chat (setup)**
- Simon asked to add his friend to the Claude project. That wasn't possible (private project), so they agreed to collaborate through GitHub instead. Simon created https://github.com/Shamygo/Sijord, added his friend as a collaborator there, and added the repo to the project. The friend works in the repo but never saw the Claude chats.

**Thread 1: "Build the next feature"** (suggested by the app, before Simon described the game)
- The repo was empty. Claude picked TypeScript + Phaser + Vite and opened **PR #1**, a 2D tile overworld (grid movement, collision, tall grass, 14 tests), and created `main` with a one-line README. It was never merged. Simon then described a 3D game, which made PR #1 obsolete. Close it if it's still open.

**Thread 2: "Open world Pokemon game"** (the main build)
- Simon posted the full spec (see [VISION.md](VISION.md)) with the reference picture attached.
- Claude chose TypeScript + Three.js, wrote DESIGN, ROADMAP and DEX_PLAN, and built milestone 1 in **PR #2**, using parallel agents for docs, world, player and co-op.
- Claude asked two questions at the end of PR #2: should gyms wait for an offline partner or offer an AI partner, and 10 gyms or 8? Simon never answered (see Open questions).
- "Set it so me and my friend can play": co-op was switched from the Node server to peer-to-peer (Trystero over public Nostr relays), and a single-file `sijord.html` build was added.
- Hosting back-and-forth: Simon asked for a github.io site, then for one only collaborators could see (impossible without GitHub Enterprise), then settled on public. He made the repo public and set Pages to GitHub Actions; Claude merged PR #2 and confirmed the site loads.
- Simon played it and asked for big changes (VISION.md §3). **PR #3** delivered them and was merged. Claude's own note on what still didn't match the reference is under Known gaps.

**Thread 3: "Handoff context in the repo"**
- Simon asked for everything a new project would need to be in the repo, which produced this file, VISION.md, CLAUDE.md and the reference image (PR #4). He then asked that the handoff make the reference picture the explicit visual target and cover every thread, which is this section.

**2026-10-04 and 05: a new Claude project ("Game")**
- Jordan (GitHub `jiweep`) started a fresh Claude project from this handoff and asked Claude to carry on as if it were its own project, pushing to the repo and the live site. Claude kept `main` as the one canonical branch (it is the only one that deploys) and built M2 in **PR #6**, with the creature models made in parallel by a second agent and checked against the reference with screenshots.

## The art reference

[reference/art-reference.png](reference/art-reference.png) is the target look. Always open the image itself for visual work; this description is only a summary. It shows a stylised, painterly, Palworld-like scene:
- A trainer in a red hoodie with a black backpack (red ball emblem) walks away from the camera up a dirt path through bright, saturated, wind-blown grass with small white flowers. An orange fox-like partner creature with a cream tail walks alongside.
- Left: tall grey layered cliffs topped with grass and mossy stone ruins with arches. Round, fluffy broadleaf trees and scattered grey boulders.
- Right and distance: a deep blue river with sandy banks and a wooden bridge, cliffs and stone arches across the water, a red-roofed castle town with a spire on a plateau, and big snowy mountains behind, softened by blue atmospheric haze. Clear deep-blue sky with a few thin clouds. Warm late-morning sun.
- HUD: a compass strip at top centre, time and weather at top right, a round minimap at top right, a quest tracker below it ("Head to the Grand Ridge", "Meet Professor Rowan"), three party portraits with level and HP bars at top left, the ridden or partner creature's card bottom left with an "E Ride" prompt, and a hotbar bottom right (ball count on Q, partner on F, bag on Tab).
- The look: clean stylised shapes, soft shading, high saturation, crisp silhouettes and lots of small detail on the ground. The names in the image are placeholders, not canon.

## Public Pokémon update (2026-10-05)

The user requested imported Pokémon models, a game trainer, public access, both free-roam turn-based and action/dodge battle modes with co-op, and the six supplied UI inspirations. See [MODEL_ASSETS.md](MODEL_ASSETS.md) for asset sources and exact coverage. All 1,322 selected models (404 animated, 8,518 clips) and 2,035 item sprites are self-hosted. Existing encounters still use the 21 save-compatible species slots. Rei is now the default, with eight baked, retargeted Quaternius clips; original Arceus player clips were unavailable. Red remains selectable and uses adapted Sijord movement rather than original Masters clips.

At a battle lobby the host selects either mode. A nearby friend presses E to join first. The host resolves turns; the guest controls its own slot and receives committed party results. Tab switches commands/mouse look, X switches creatures, Space jumps in trainer mode and dashes in action mode. The dark/cyan menu includes medicine use, trainer/party details, map destination markers and a searchable model Pokédex. Manual Save progress supplements existing progress saves. Catching and fast travel remain unimplemented.

Validation: 140 unit tests, typecheck, regular and single-file builds; all published asset hashes and clip lists verified; actual two-context WebRTC tests with a local signaling relay covered shared commands, turn completion, trainer movement, both players’ action movement/dodge inputs, guest result persistence, running and AI continuation after a guest leaves. Public-relay/NAT success on two different home networks is not established by those local tests.

## World and interface polish (2026-10-05)

Pointer retries are cancelled on overlay opening and checked against live menu/dialogue/battle-command state. Closing menus keeps the cursor available until an explicit gameplay click. Panels/tabs/buttons animate and respect reduced motion. Empty parties now show a trainer, compact slots and a functional Hazel destination guide. The explorer has paged portrait cards, search/form/animation filtering, pause/reset and responsive layout; 971 pinned local portraits are verified in CI. Rei has source-model provenance and eight retargeted CC0 clips (idle/walk/run/jump/fall/land/climb/throw), with matte lit materials shared by Pokémon. Old default-Red saves migrate visuals only; custom appearances and subsequent explicit Red choices persist. Climb snapshots propagate through co-op. Two raised timber lookouts support landing/walking/falling, and steep terrain supports held-key climbing with collision/water limits and stamina. Six substantial street buildings, porches, lattice windows, tile details, stalls and broad paths improve Bramblewick; storefronts remain decorative. See MODEL_ASSETS.md for exact source limitations.

Validation: 155 tests pass, published model/item/portrait/trainer hashes and clip lists verified, desktop/mobile explorer filters and animation controls exercised, real pointer acquisition/release and delayed retry cancellation checked, and two-peer tests reran both battle modes with Rei, shared commands and guest action movement. Local peer tests do not establish cross-home NAT reachability.


### Latest movement follow-up

The trainer gait is now calibrated to the final rig and actual displacement, with phase-preserving walk/jog transitions and support-foot stabilization. Short landing recovery and stronger air braking remove the repeated-jump car/bhop feel. Action-mode Pokémon movement/facing and guest mirrors ease smoothly; dodges still launch immediately. Read POLISH_HANDOFF's movement addendum and VISION's exact feedback before changing these tunings.
