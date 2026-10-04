# Sijord

A Pokemon-style monster-catching adventure game, built with [Phaser](https://phaser.io/), TypeScript and Vite.

## Getting started

You need [Node.js](https://nodejs.org/) 20 or newer.

```sh
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173). Walk around with the arrow keys or WASD.

## Scripts

| Command             | What it does                         |
| ------------------- | ------------------------------------ |
| `npm run dev`       | Start the dev server with hot reload |
| `npm test`          | Run the unit tests (Vitest)          |
| `npm run typecheck` | Type-check the project               |
| `npm run build`     | Type-check and build to `dist/`      |
| `npm run preview`   | Serve the production build locally   |

## Project layout

```
src/
  main.ts                  Phaser game setup
  scenes/OverworldScene.ts Draws the map, reads input, animates the player
  world/tilemap.ts         ASCII map parsing and walkability (no Phaser)
  world/movement.ts        Grid movement rules (no Phaser)
  world/maps.ts            Map data
tests/                     Unit tests for the game logic in src/world
```

Game rules live in `src/world` as plain TypeScript with no Phaser imports, so they can be unit tested. Scenes stay thin: they render state and turn input into calls to those rules.

## Editing maps

Maps are ASCII art in `src/world/maps.ts`:

| Char | Tile                     | Walkable |
| ---- | ------------------------ | -------- |
| `.`  | path                     | yes      |
| `"`  | tall grass               | yes      |
| `#`  | tree                     | no       |
| `~`  | water                    | no       |
| `=`  | wall                     | no       |
| `P`  | player start (on a path) | yes      |

Every row must be the same width and there must be exactly one `P`.
