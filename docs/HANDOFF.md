# Sijord: handoff

Everything a new contributor (human or Claude) needs to pick up this project from the repository alone. Written 2026-10-04, after PR #3. Update the "Current state" and "Next up" sections whenever a milestone lands.

## Who and what

- **Owner:** Simon, GitHub [`Shamygo`](https://github.com/Shamygo). He builds this with a friend who collaborates in this repo. They play it together as two-player co-op.
- **The game:** a Palworld-style ("Power World" in Simon's words), third-person 3D, open world Pokemon game in the browser, later packaged for Windows and Mac. Two-player co-op is the core. Battles are hard on purpose.
- **Simon's own words** are in [VISION.md](VISION.md): the full spec plus his feedback. Read it first. It outranks every other doc.
- **Art target:** [reference/art-reference.png](reference/art-reference.png). See [The art reference](#the-art-reference) below.

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
| [README.md](../README.md) | How to play, run, build and test |
| [screenshots/](screenshots/) | Screenshots of the current build |

## Canon (keep consistent)

- Region **Sijord** (fjords and meadows). Hometown **Bramblewick**, a small fenced village south-centre in **Hearthmeadow Vale**, with both players' houses and **Professor Hazel**'s lab. Route 1 leaves through the north gate.
- Villains **Team Tether**, hidden inside **Krane Industries** (HQ in Jernhamn). Rival **Sunniva**.
- Classes (code ids): `ranger`, `tamer`, `artisan`, `scholar`, `medic`. Each has one small perk and one real cost (DESIGN §7.2, `src/shared/classes.ts`).
- 12 large cities, 10 of them with gyms. **Crownspire** (Elite Four, 10 badges) and **Tornhavn** (Battle Tower, 5 badges) are the only hard-locked places.
- World axes: **north = +Z, east = -X**.
- All art is original and generated in code. Never use official Pokemon models, sprites or audio.

## Stack and layout

TypeScript + Three.js, built with Vite, tested with Vitest. No game engine and no asset files: terrain, models, textures and animation are all procedural.

```
src/client/main.ts    boot: title -> trainer creator -> loading screen -> Game
src/client/core       game loop (game.ts), renderer and post (render.ts), input, collision, save, settings + keybinds
src/client/world      terrain, sky, water, grass, vegetation, cliffs, fauna, POIs, Bramblewick (hometown.ts), layout
src/client/player     trainer model and rig, animation clips and IK math, movement controller, camera, remote partner
src/client/npc        Professor Hazel
src/client/ui         title, creator, HUD (compass, minimap, quests), dialogue, menus (map, bag, party, quests, settings)
src/client/net        co-op: p2p.ts (default, Trystero) and client.ts (optional Node server)
src/server            optional Node WebSocket server (2 players per room)
src/shared            types, protocol, classes, items
tests/                Vitest unit tests (controller, camera, animation math, collision, settings, rooms)
```

In dev builds the running game is exposed as `window.sijord` for debugging.

## Run, test, build, deploy

```bash
npm install
npm run dev            # http://localhost:5173
npm run typecheck
npm test               # 45 tests at the time of writing
npm run build          # dist/ (what GitHub Pages serves)
npm run build:single   # dist-single/sijord.html, the whole game in one double-clickable file
```

- **Live site:** https://shamygo.github.io/Sijord/. `.github/workflows/pages.yml` runs tests, builds and deploys on every push to `main`. Pages source is set to "GitHub Actions". The repo is public, which is what makes free Pages hosting possible.
- **Offline build:** `.github/workflows/release.yml` rebuilds `sijord.html` on every push to `main` and attaches it to the `latest` release ("Latest playable build").
- **Co-op:** both players type the same world code on the title screen. Default transport is peer-to-peer WebRTC via Trystero, using free public Nostr relays only for matchmaking, so nothing is hosted. Fallbacks: `npm run relay` plus `?relay=ws://<ip>:8090`, or `npm run server` plus `?server=ws://<ip>:8787` (or `?server=local`). Co-op over the public relays has not yet been confirmed on Simon's and his friend's real machines.
- **Verifying visually:** Chromium and Playwright are typically available in Claude's cloud container. Run `npm run dev` or `npm run preview` and screenshot the game. Software rendering there is very slow, so judge frame rate on real hardware, not in the container.

## Current state (after PR #3)

**Merged:**
- PR #2: 3D foundation, design docs and milestone 1. Trainer creator (looks plus class), weighty third-person movement and orbit camera, Bramblewick with both houses and Hazel's lab, Hazel's intro leading to Route 1, HUD with compass, minimap and quest tracker, two-player presence.
- PR #3: second pass after Simon's feedback. Graphics reworked toward the reference (lush grass, fluffy trees, layered grey cliffs, blue river with sandy banks, haze, snowy mountains). Trainer rebuilt with walk, jog and sprint cycles, foot IK on slopes, start, stop, turn, skid, jump and land animations, idle fidgets and secondary motion. Classes nerfed to one perk and one cost. Menus: M map, B bag, P party, J quests, Esc pause and settings. Settings cover key rebinding, mouse sensitivity, invert look, FOV and quality (Low, Medium, High). Shader warm-up moved behind the loading screen so menu keys work immediately.
- PR #1, an old 2D tile prototype, predates the 3D vision and is superseded. It should be closed if still open.

**Milestone status:** M1 (hometown and co-op presence) is done apart from its 60 fps exit check on real hardware. M2 is next. There are no creatures, battles or catching yet.

**Known gaps:**
- Visuals vs the reference: clouds are puffier than the reference's wispy ones, cliffs look blocky up close, and there is no distant castle town on the skyline yet. No partner creature follows the player, and the HUD lacks the party portraits and Q/F/Tab hotbar shown in the reference.
- Performance on Simon's and his friend's computers is unverified. Quality "Low" in settings is the escape hatch.
- DESIGN §17 (controls) predates PR #3. The code is the truth for current bindings (`DEFAULT_KEYS` in `src/client/core/settings.ts`): WASD move, Shift sprint, Space jump, E interact, M map, B bag, P party, J quests, Q throw ball, F partner, Esc pause. §17 still lists B as build mode and Tab/I as inventory, so reconcile it when build mode lands.

## Open questions waiting on Simon

From DESIGN §18. None answered yet. Proceed on the current default and flag it.
1. Gyms with only one player online: wait for the partner (current default), or offer an AI partner?
2. A player who joins a world later: inherit the host's badges or earn their own (default: their own, with a catch-up cap)?
3. 10 gyms (current plan) or the classic 8?
4. Is it okay that charging wild creatures can knock players down?

## Next up

**M2: First creatures and battles** (ROADMAP). A deterministic, seeded, double-battle-only engine in `src/shared/battle` with stats, types, about 60 moves, about 20 abilities, status, priority, spread damage and switching. A validated data pipeline for species and moves. The first 20 species with chunky procedural models. Starter pick at Hazel's lab and a rival battle with Sunniva. Wild herds in the meadow with in-world battles and no screen transition. Battle UI, XP and levelling to cap 15. Exit: each player picks a starter, beats Sunniva and fights wild 2v2s that level their team, and the damage calc matches reference values in tests.

Keep closing the visual gaps above alongside M2, since Simon judges every build by how it looks.

## The art reference

[reference/art-reference.png](reference/art-reference.png) is the target look. It shows a stylised, painterly, Palworld-like scene:
- A trainer in a red hoodie with a black backpack (red ball emblem) walks away from the camera up a dirt path through bright, saturated, wind-blown grass with small white flowers. An orange fox-like partner creature with a cream tail walks alongside.
- Left: tall grey layered cliffs topped with grass and mossy stone ruins with arches. Round, fluffy broadleaf trees and scattered grey boulders.
- Right and distance: a deep blue river with sandy banks and a wooden bridge, cliffs and stone arches across the water, a red-roofed castle town with a spire on a plateau, and big snowy mountains behind, softened by blue atmospheric haze. Clear deep-blue sky with a few thin clouds. Warm late-morning sun.
- HUD: a compass strip at top centre, time and weather at top right, a round minimap at top right, a quest tracker below it ("Head to the Grand Ridge", "Meet Professor Rowan"), three party portraits with level and HP bars at top left, the ridden or partner creature's card bottom left with an "E Ride" prompt, and a hotbar bottom right (ball count on Q, partner on F, bag on Tab).
- The look: clean stylised shapes, soft shading, high saturation, crisp silhouettes and lots of small detail on the ground. The names in the image are placeholders, not canon.
