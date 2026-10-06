# Sijord

A two-player co-op, Palworld-style, third-person 3D open world Pokémon game in the browser (TypeScript + Three.js). Live at https://shamygo.github.io/Sijord/, where the two friends play it together.

## Read this first (updated 2026-10-06)

You are probably a fresh session with none of the earlier context. Everything you need is in this repo:

1. **This file**: who's who, the direction you've been given, how to work and ship.
2. **[docs/HANDOFF.md](docs/HANDOFF.md)**: start with its "Start here" section. Then read "Current state" for what's built (with file paths) and "Next up" for where to pick up.
3. **[docs/VISION.md](docs/VISION.md)**: Simon's own spec and feedback, verbatim. It outranks every other doc.
4. **[docs/DEV_NOTES.md](docs/DEV_NOTES.md)** before touching rendering, collisions, input, the rig or co-op. It also covers how to play-test in a cloud container.
5. **[docs/POLISH_HANDOFF.md](docs/POLISH_HANDOFF.md)**: ChatGPT's notes from its 2026-10-05 polish pass (Rei, imported Pokémon models, menus, climbing, movement, both battle modes). Read it before changing any of those areas.

Always `git fetch origin main` and start from a fresh `main`. Other people push to it, ChatGPT included.

## People and permissions

- **Simon** (GitHub `Shamygo`) owns the game and the repo, plays it with a friend, and sends feedback as short messages.
- **Jordan** (GitHub `jiweep`) works on the game with Simon and runs the Claude project that does most of the building. Jordan asked Claude to treat Sijord as its own project.
- **Merging:** Jordan said "always merge". Merge your own PRs into `main` once typecheck, tests and build pass, without asking. Every push to `main` redeploys the live site, so keep `main` playable.
- **Ask first** before closing or merging a PR someone else opened. PR #1, an obsolete 2D prototype, is still open: closing it needs Jordan's or Simon's OK.
- **ChatGPT** also ships to `main` when Claude's usage runs out (PRs #8-#10). Jordan trusts Claude's judgement more: rework ChatGPT's choices on merit, as long as the result still follows the direction below.

## Direction (Simon's and Jordan's requests, newest last)

- **Hard game.** Doable but difficult. Don't hand the player power: strong abilities come from skill trees and effort, supplies are scarce, prices are stingy.
- **Looks:** match the reference images closely and look polished, "non amateur". The targets are [docs/reference/art-reference.png](docs/reference/art-reference.png) and the Legends: Arceus references in [docs/reference/2026-10-05](docs/reference/2026-10-05). Jordan also shared a close-up of an anime trainer in chat (not in the repo) and asked for that level of polish up close. Screenshot the game, compare side by side, and say honestly what still doesn't match.
- **Movement:** fluid like Breath of the Wild, with varied movement and climbing. The earlier running felt stiff.
- **Models:** official Pokémon models and Rei from Legends: Arceus, self-hosted, were explicitly requested (see [docs/MODEL_ASSETS.md](docs/MODEL_ASSETS.md)). The 1,322-model catalogue is a library, not implemented encounters. New species map to existing models. Environment art stays procedural.
- **Both battle modes** (tactical turn-based and action/dodge) stay available so the two friends can compare them. Don't collapse them into one without new feedback.
- **Co-op is the core.** Every feature should work with two players in one world.
- Keep existing save IDs and progression working: old saves must load.

## Commands

```bash
npm install
npm run dev           # http://localhost:5173
npm run typecheck
npm test
npm run build         # dist/, deployed to GitHub Pages
npm run build:single  # dist-single/sijord.html, one-file code build (imported art requires internet)
npm run relay         # local co-op relay on :8090; open pages with ?relay=ws://127.0.0.1:8090
```

Run `npm run typecheck && npm test && npm run build` before pushing.

## How to ship

- Work on a `claude/<topic>` branch, then open a PR into `main` and merge it. `gh pr create` fails here (GraphQL 403). Use the REST API instead:
  - Open: `gh api repos/Shamygo/Sijord/pulls -f title=... -f head=<branch> -f base=main -F body=@body.md`
  - Merge: `gh api -X PUT repos/Shamygo/Sijord/pulls/N/merge -f merge_method=merge`
- **No CI runs on PRs.** Only a push to `main` runs `.github/workflows/pages.yml` (asset check, tests, build, deploy), so validate locally first. After merging, check that the "Deploy to GitHub Pages" run for the merge commit succeeds and the site returns 200.
- Verify in a real browser, not just in tests. Headless Chromium in the cloud container renders at 0.2-1 fps. Scripted probes must poll for state (`page.waitForFunction`) rather than wait fixed times, and raise `window.sijord.debugTimeScale`. Dev builds expose `window.sijord` with `debugTeleport`, `debugGiveParty`, `debugSpawnWild`, `debugWildBattle`, `debugAimAt`, `debugCatch` and more. `render_game_to_text()` dumps state in every build. See DEV_NOTES.
- When something lands, update "Current state" and "Next up" in docs/HANDOFF.md and the milestone status in docs/ROADMAP.md. The next session only knows what the repo says.
- Never put model names or IDs in commits, PRs or code.

## Rules

- World axes: north = +Z, east = -X. Keep canon names consistent (HANDOFF "Canon").
- Visual and animation work is judged against the reference images and Legends: Arceus. Check every graphics change with a screenshot.
- Keep replies to Simon and Jordan short and plain: what changed, how to try it, what's still off, and any decision only they can make.
