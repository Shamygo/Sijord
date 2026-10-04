# Sijord

A two-player, open world monster-catching adventure in the browser, inspired by Palworld and the mainline Pokemon games. Built with TypeScript and Three.js, with peer-to-peer co-op for two players. Desktop builds for Windows and Mac come later (see the roadmap).

## Play it

Play in the browser at https://shamygo.github.io/Sijord/ (redeployed on every push to `main`).

To play offline, download `sijord.html` from the **Latest playable build** release and double-click it, or build it yourself:

```bash
npm install
npm run build:single   # writes dist-single/sijord.html
```

Open `sijord.html` in Chrome or Edge on Windows or Mac. To play together, both players open the game and type the **same world code** on the title screen. Co-op is peer-to-peer: the two browsers find each other through public relays and then connect directly, so nothing needs hosting.

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
| Space | Jump |
| E | Talk / interact, advance dialogue |
| Mouse wheel | Zoom the camera |

## What is in this milestone

Milestone 1 is the foundation: the trainer creator with five classes, third-person movement and camera, the hometown of Bramblewick with both players' houses and Professor Hazel's lab, the first story beat, the HUD (compass, minimap, quests) and two players seeing each other in the same world.

## Docs

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

All art is original and generated in code; the project uses no official Pokemon assets.
