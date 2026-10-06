# Sijord

A two-player, open world monster-catching adventure in the browser, inspired by Palworld and the mainline Pokemon games. Built with TypeScript and Three.js, with peer-to-peer co-op for two players. Desktop builds for Windows and Mac come later (see the roadmap).

## Play it

Play in the browser at https://shamygo.github.io/Sijord/ (redeployed on every push to `main`).

For a downloadable copy, download `sijord.html` from the **Latest playable build** release and double-click it, or build it yourself:

```bash
npm install
npm run build:single   # writes dist-single/sijord.html
```

The downloadable HTML uses online model assets. With no internet connection it falls back to the original procedural characters. Open `sijord.html` in Chrome or Edge on Windows or Mac. To play together, both players open the game and type the **same world code** on the title screen. Co-op is peer-to-peer: the two browsers find each other through public relays and then connect directly, so nothing needs hosting.

For development, `npm run dev` serves the game at http://localhost:5173.

### Co-op fallbacks

- If the public relays are blocked on your network, run `npm run relay` on one machine and open the game with `?relay=ws://<that-machine's-ip>:8090` added to the URL on both.
- `npm run server` starts the original WebSocket server; open the game with `?server=ws://<ip>:8787` (or `?server=local`) to use it instead.

### Controls

| Key | Action |
| --- | --- |
| Mouse | Look around (click the game to capture the mouse, Esc to release) |
| W A S D | Move |
| Shift | Sprint (uses stamina) |
| Space | Jump; on a wall, leap up (or sideways with A/D); S+Space kicks off |
| (walk into rock) | Climb cliffs, big rocks, steep slopes and ladders; W A S D move on the wall, pull-up at the top is automatic |
| C | Let go of a wall |
| E | Talk / interact, advance dialogue, battle a nearby wild Pokémon |
| Q (hold) or right mouse | Aim a Poke Ball or Treat; release to throw, wheel to pick, E to cancel |
| V | Dodge roll (backstep with no direction held) |
| H | Use a Potion on yourself |
| F | Call or recall your partner, or send it at a Pokémon charging you |
| M / B / P / J | Map, bag, party, quests |
| Esc | Pause and settings (rebind keys, sensitivity, FOV, quality) |
| Mouse wheel | Zoom the camera |

## What's in the game so far

Milestones 1, 2 and 3 are done. You get a trainer creator, Bramblewick with both players' houses and Professor Hazel's lab, a starter and a rival battle, and 45 Kanto species roaming Hearthmeadow in herds both players share. Battles are 2v2, in tactical or action mode, and you can catch in battle or by sneaking up and throwing in the overworld. A failed catch can make a Pokémon charge you: dodge it, calm it with a Treat or send your partner at it. Hearthmeadow hides supply caches (the best ones on top of rocks and mesas), Lysfolk tablets that Professor Hazel trades Great Balls for, and pages of her lost field notes. There is a party of 6 with a PC box, a region Dex, and co-op battles a friend can join. [docs/HANDOFF.md](docs/HANDOFF.md) has the details.

## Docs

- [Handoff](docs/HANDOFF.md): current state, known gaps and what's next. Start here.
- [Vision](docs/VISION.md): the owner's original spec and feedback, verbatim.
- [Game design](docs/DESIGN.md): every system in the full game.
- [Roadmap](docs/ROADMAP.md): the milestones from here to release.
- [Dex plan](docs/DEX_PLAN.md): how the regional dex is chosen, and the new species.

## Project layout

```
src/client/core     renderer, game loop, input, collision, save
src/client/world    terrain, sky, water, vegetation, Bramblewick
src/client/player   trainer model, movement controller, camera, remote partner
src/client/npc      Professor Hazel and other characters
src/client/ui       title, trainer creator, HUD, minimap, dialogue
src/client/net      co-op client
src/server          co-op server (two players per world)
src/shared          types and network protocol used by both sides
```

## Checks

```bash
npm run typecheck
npm test
npm run build
```

The landscape is procedural. Pokémon, Rei and Red use imported models; see [model assets](docs/MODEL_ASSETS.md) for source credits and animation coverage. The [Pokémon library](https://shamygo.github.io/Sijord/pokemon.html) contains all 1,322 available models/forms and their included animation clips. Gameplay currently uses 21 of those Pokémon; adding more encounters is separate from importing models.

### Imported Pokémon, battle modes and interface

The public build includes a searchable collection of 1,322 Pokémon models/forms (404 with included animation clips), the Legends: Arceus Rei trainer (with eight retargeted Quaternius animation clips), the optional Pokémon Masters Red trainer, and 2,035 item icons. The existing world has 21 gameplay species, now represented by animated Pokémon models. Source coverage and credits are in [MODEL_ASSETS.md](docs/MODEL_ASSETS.md).

Battles offer a free-roam trainer mode with the original turn-based commands, and an experimental action mode with direct Pokémon movement and spatial dodging. Friends join an encounter lobby with E before the host chooses its mode, then command one Pokémon each. WASD moves, Shift runs, Space jumps/dodges, 1–4 selects moves, X switches, and Tab toggles commands/mouse look. Both players use the same world code.

The bag, party, map and battle panels follow the supplied dark/cyan interface references. Medicines can heal a selected Pokémon from the bag; the Pokédex searches the full model collection. Catching, fast travel and additional world encounters remain separate gameplay work.

The latest polish update fixes pointer capture over menus, animates panel/tab/selection transitions with reduced-motion support, improves empty-party onboarding and the Pokémon explorer, and adds matte world-lit character materials. Rei replaces the previous default trainer without resetting progression. Bramblewick has larger detailed street façades, covered porches, market stalls and two climbable lookout platforms. Shop fronts are decorative. Walk into a cliff, a big rock, a steep slope or a ladder to grab it, climb with W A S D, and Rei pulls up over the top on their own; climbing costs stamina, and C lets go. Original Arceus player motion files were unavailable; the included keyframes are separately sourced CC0 animations retargeted to Rei.
