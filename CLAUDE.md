# Sijord

A two-player co-op, Palworld-style, third-person 3D open world Pokemon game in the browser (TypeScript + Three.js). Owner: Simon (GitHub `Shamygo`), who plays it with a friend at https://shamygo.github.io/Sijord/.

## Latest user feedback and completed polish — read first

**Read [docs/POLISH_HANDOFF.md](docs/POLISH_HANDOFF.md) before changing this build.** It records the latest direct user requests, why each change was made, exact implementation paths, validation, controls and remaining gaps. It supplements the older vision and supersedes older procedural-character/default-Red/boss-only-co-op assumptions where the user explicitly changed those requests. The user specifically asked that returning Claude see these notes and know exactly what changed and why.

The current build uses Rei from Legends: Arceus by default, with eight **Quaternius CC0 clips retargeted to Rei**, not original Arceus motion files. Red and custom trainers remain selectable. Imported Pokémon/material lighting, polished/animated menus, the rebuilt explorer, empty-party onboarding, slope/ladder climbing and a substantially expanded Bramblewick are implemented. Both tactical free-roam and action/dodge co-op battle modes remain available so the user and friend can compare them. Keep the public game playable and preserve existing save IDs/progression.

The user-supplied latest reference images are now in [docs/reference/2026-10-05](docs/reference/2026-10-05). Compare the Arceus trainer/landscape/town references and the supplied dark/cyan UI references directly; screenshots of the implemented polish are in [docs/screenshots/2026-10-05-polish](docs/screenshots/2026-10-05-polish). This is a meaningful improvement, not a finished match for Arceus town/animation detail. Do not mistake the model catalogue for implemented encounters, decorative shops for functioning commerce, or retargeted clips for original game clips.

**The visual target:** [docs/reference/art-reference.png](docs/reference/art-reference.png) is Simon's art reference. Open it and look at it before any graphics, animation, HUD or world work, and compare your screenshots against it. The game should look like that image. A written breakdown is in [HANDOFF.md](docs/HANDOFF.md#the-art-reference).

**Start here:** [docs/HANDOFF.md](docs/HANDOFF.md) has the current state, known gaps, open questions and what's next. Simon's own spec and feedback are in [docs/VISION.md](docs/VISION.md), and they outrank every other doc.

How the project got here (every thread and decision) is in [HANDOFF.md](docs/HANDOFF.md#project-history). Other docs: [DESIGN.md](docs/DESIGN.md) (all systems), [ROADMAP.md](docs/ROADMAP.md) (milestones M1 to M14), [DEX_PLAN.md](docs/DEX_PLAN.md) (species), [DEV_NOTES.md](docs/DEV_NOTES.md) (code gotchas and how to play-test). Read DEV_NOTES before touching rendering, collisions, input, the rig or co-op.

## Commands

```bash
npm install
npm run dev           # http://localhost:5173
npm run typecheck
npm test
npm run build         # dist/, deployed to GitHub Pages
npm run build:single  # dist-single/sijord.html, one-file code build (imported art requires internet)
```

Run `npm run typecheck && npm test && npm run build` before pushing. CI runs the tests before every deploy.

## Rules

- Every push to `main` redeploys the live site that Simon and his friend play. Simon is fine with Claude merging PRs to `main`. Keep `main` playable.
- The game must be **hard**. Don't hand the player power; strong abilities come from skill trees and effort.
- Visual and animation quality is judged against the reference image (`docs/reference/art-reference.png`) and Legends Arceus. Every graphics change should be checked by screenshotting the game and comparing it side by side with the reference. Say honestly what still doesn't match.
- Environment art remains procedural. The user explicitly requested Pokémon model assets, Red from Pokémon Masters, and then Rei from Legends: Arceus on 2026-10-05, including public hosting. See docs/MODEL_ASSETS.md for sources, animation gaps, save compatibility and model loading.
- Keep canon names consistent (see HANDOFF.md). World axes: north = +Z, east = -X.
- When a milestone lands, update the "Current state" and "Next up" sections of docs/HANDOFF.md and the milestone status in docs/ROADMAP.md.
