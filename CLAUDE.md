# Sijord

A two-player co-op, Palworld-style, third-person 3D open world Pokemon game in the browser (TypeScript + Three.js). Owner: Simon (GitHub `Shamygo`), who plays it with a friend at https://shamygo.github.io/Sijord/.

**Start here:** [docs/HANDOFF.md](docs/HANDOFF.md) has the current state, known gaps, open questions and what's next. Simon's own spec and feedback are in [docs/VISION.md](docs/VISION.md), and they outrank every other doc. The target look is [docs/reference/art-reference.png](docs/reference/art-reference.png).

Other docs: [DESIGN.md](docs/DESIGN.md) (all systems), [ROADMAP.md](docs/ROADMAP.md) (milestones M1 to M14), [DEX_PLAN.md](docs/DEX_PLAN.md) (species).

## Commands

```bash
npm install
npm run dev           # http://localhost:5173
npm run typecheck
npm test
npm run build         # dist/, deployed to GitHub Pages
npm run build:single  # dist-single/sijord.html, one-file offline build
```

Run `npm run typecheck && npm test && npm run build` before pushing. CI runs the tests before every deploy.

## Rules

- Every push to `main` redeploys the live site that Simon and his friend play. Simon is fine with Claude merging PRs to `main`. Keep `main` playable.
- The game must be **hard**. Don't hand the player power; strong abilities come from skill trees and effort.
- Visual and animation quality is judged against the reference image and Legends Arceus. Say honestly what still doesn't match.
- All art is original and procedural. Never use official Pokemon assets.
- Keep canon names consistent (see HANDOFF.md). World axes: north = +Z, east = -X.
- When a milestone lands, update the "Current state" and "Next up" sections of docs/HANDOFF.md and the milestone status in docs/ROADMAP.md.
