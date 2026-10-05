# Latest user requests and implementation handoff — 2026-10-05

Read this before continuing graphics, UI, trainer, traversal or multiplayer work. The user specifically requested notes that returning Claude will see and understand, so the top-level `CLAUDE.md` links here prominently. The older VISION/DESIGN/ROADMAP remain useful, but later direct user feedback recorded here takes precedence where it changes earlier assumptions.

## What the user wants and why

The user and a friend want to play this game together. They asked to keep the game publicly accessible for easy access, while describing the use as their own personal fun. They explicitly requested Pokémon models/items and a trainer from the games, then specifically preferred the Legends: Arceus trainer and animations. They want both a free-roam trainer/turn-based battle mode and a direct Pokémon movement/dodging mode as separate options so they can test which is better.

After trying the first update, the user reported that clicking UI made the mouse disappear and Escape awkwardly undid it. They said the Pokémon explorer looked bad, and the starting-save party UI did not look like their inspiration. They requested Pokémon that blend into world lighting, a better trainer, actual animations, animated climbing, continuing graphics polish, and towns that feel substantial and detailed like Legends: Arceus. They then added: “also add ui animations so it feels like a polished experience”.

Their latest exact visual/gameplay feedback is appended to [VISION.md](VISION.md). The screenshot showing the problem is [empty-party-before.png](reference/2026-10-05/empty-party-before.png). The reference images are visual inspiration, not evidence that features such as catching/flying already exist.

## Reference images to open

- [Arceus trainer and terrain](reference/2026-10-05/arceus-overworld.png): original Rei uniform/hat/scarf, natural stance, muted character shading integrated with terrain.
- [Arceus town street](reference/2026-10-05/arceus-town.png): substantial two-storey buildings, timber/shop detail, inhabited street, meaningful depth. The current town is improved but does not match the full scene's residents/interiors/detail.
- [Arceus free-roam battle](reference/2026-10-05/arceus-battle.png): trainer remains present in the environment, compact battle commands and readable enemy/party health.
- UI inspirations: [battle](reference/2026-10-05/ui-battle.png), [map](reference/2026-10-05/ui-map.png), [catching](reference/2026-10-05/ui-catching.png), [town/map detail](reference/2026-10-05/ui-town-map.png), [bag](reference/2026-10-05/ui-bag.png), [menu/party](reference/2026-10-05/ui-menu.png). Dark translucent panels, cyan selection, clear hierarchy, real item/creature portraits, restrained screen coverage.
- Actual implemented screenshots: [starting party](screenshots/2026-10-05-polish/starting-party.png), [Bramblewick](screenshots/2026-10-05-polish/town.png), [climbing](screenshots/2026-10-05-polish/climbing.png). Compare these against the references; do not present them as an exact Arceus reproduction.

## What changed, why, and where

| Change | User reason and resulting behavior | Main implementation |
| --- | --- | --- |
| Pointer capture | Clicking menus must leave the mouse available. Cancel delayed capture requests on release; check live overlay state before retry; immediately release an in-flight capture granted after an overlay opens. Close/backdrop clicks do not recapture. Click the world or the small “Click to play” button to resume look. | `src/client/core/input.ts`, `core/game.ts`, `ui/menu.ts`, `ui/hud.ts`, `ui/styles.css`; `tests/input-lock.test.ts` |
| UI animations | The interface should feel polished. Backdrop/panel entrance, tab content transitions, hover/press/selection responses, health bar transitions, dialogue/battle entrance. Honor `prefers-reduced-motion`; keep interactions immediate. | `src/client/ui/styles.css`, `assets/library.ts`, `assets/library.css` |
| Empty starting party | The old six large blank cards looked unfinished. Show the actual trainer, six compact partner slots, three starter portraits and “Guide me to Professor Hazel”, which sets a world destination and closes the menu. No free Pokémon are silently granted. | `src/client/ui/menu.ts`, `ui/portraits.ts` |
| Pokémon explorer | Replace the awkward viewer with a responsive collection sidebar and dedicated 3D stage. Local portrait cards, 60-entry pagination, search/form/animated filters, model selector, included clip selector, play/pause, reset and empty/error states. In-game Pokédex also has portrait cards. | `pokemon.html`, `src/client/assets/library.ts`, `library.css`, `ui/menu.ts`, `public/pokemon-icons`; `scripts/download-pokemon-icons.py` |
| Default trainer | User likes Legends: Arceus Rei and wants a better fit. Publish the actual Rei mesh/painted textures/191-joint rig and eight keyframe clips retargeted to it. Default new trainers to Rei; retain Red/custom choices. | `public/models/trainer/rei.glb`, `rei-manifest.json`, `LICENSE-ANIMATIONS.txt`; `src/client/player/imported-trainer.ts`, `assets/loader.ts`, `shared/types.ts`, `ui/creator.ts` |
| Save compatibility | A visual update should not restart the user's adventure. Earlier default-Red saves migrate appearance to Rei only. Preserve party, bag, flags and room. `visualVersion: 2` preserves subsequent explicit Red selections; old custom trainers remain custom. | `src/client/core/save.ts`; `tests/save-visuals.test.ts` |
| Character/world lighting | Pokémon should blend into the world instead of looking pasted on. Convert unlit skins to lit materials; use matte shading, shadows, fog and the same subtle grain as props. Tone down sky/sun colors. Omit Rei's packed source normal/AO maps because they produced incorrect dark facial patches. Lower/widen Bulbasaur-line portraits so their faces remain visible. | `src/client/assets/materials.ts`, `assets/loader.ts`, `world/sky.ts`, `ui/portraits.ts` |
| Animated climbing | User explicitly requested traversal and animations. C climbs steep slopes or attaches to a nearby lookout ladder; S+C descends a ladder, releasing C hangs, Space lets go. Consume stamina, respect walls/water, support landing on the lookout and falling after walking off its edge. Send the climb state to the partner; a stale remote climb freezes rather than standing in midair. | `src/client/player/controller.ts`, `player/remote.ts`, `player/imported-trainer.ts`, `player/types.ts`, `shared/types.ts`, `core/settings.ts`, `core/collision.ts`, `world/types.ts`, `world/index.ts`; controller regression tests |
| Substantial town | User wants Arceus-like street substance. Six larger two-storey façades (supplies, clothier, inn, workshop, apothecary, survey lodge), covered porches, lattice windows, tile seams, timber detail, lanterns, market counters/produce, broad maintained roads and two climbable timber lookouts. Long sign labels fit their boards. | `src/client/world/buildings.ts`, `hometown.ts`, `layout.ts`, `shared.ts` |

## Asset and animation truth — do not blur these distinctions

- The Pokémon catalogue contains 1,322 downloaded/self-hosted models/forms, covering 971 distinct regular dex numbers. It is not every species/form. 404 entries contain 8,518 included clips. The first 151 regular models use the animated 06wj collection.
- Only the 21 existing gameplay species slots are implemented as encounters/progression. `src/shared/pokemon-visuals.ts` maps stable Sijord IDs to Kanto models/names. The custom stats, types, moves and progression have not been replaced by fully canonical Pokémon data. Preserve save IDs.
- There are 2,035 self-hosted item sprites and 971 portrait sprites, pinned to immutable source commits. Medicines work in the bag; collecting pictures did not implement every item's gameplay effect.
- Rei's character is from Legends: Arceus, imported from `tr0036_00_senpai_m` in the trainer source archive using SomeKitten's importer. Only LOD0 is published. Archive/source hashes are recorded.
- **Original Arceus player animation files were not found as a usable download.** The archive contained the rig/meshes/textures but no usable original motion clips. Eight actual Quaternius Universal Animation Libraries 1/2 CC0 keyframe clips were mapped, retargeted and baked at 30 fps: idle, walk, run, jump, fall, land, climb, throw. These are not original Arceus motion files. Keep this limitation explicit if asked or if replacing them later.
- Red still has no original Masters clips; it uses the adapted procedural driver. Custom avatars/NPCs remain procedural. Rei's fixed costume does not take custom clothing/hair colors.
- Geometry/textures are shared, skeletons/materials are independent per instance, and optional library models have a bounded unused cache. Do not load all 1,322 models at game startup or remove disposal/ref-counting.
- Full source/coverage details: [MODEL_ASSETS.md](MODEL_ASSETS.md). `python3 scripts/verify-assets.py` verifies every published model/item/portrait and Rei's hash/joint/clip list.

## Both battle modes remain intentional

This earlier release already implemented both modes, at the user's explicit request to compare them. Do not remove one as redundant. The tactical mode keeps turn-based commands while the trainer moves; the action mode controls the active Pokémon and applies spatial dodging through the same battle engine. E joins a friend's nearby encounter lobby before the host chooses the mode. Each player commands their own Pokémon; the host resolves shared choices and sends stage/events/party results. Tab toggles commands and mouse look, X switches, 1–4 chooses moves, Space jumps or dodges by mode.

The later request for multiplayer free-roam battles expands the original vision's boss-only collaboration restriction. This does not implement gyms, PvP, every possible battle interaction, mid-battle joining or a new networking service. Keep results, HP/PP/XP/status persistence and disconnect/AI continuation intact.

## Validation performed

- All **155 tests** pass; typecheck plus regular and downloadable builds pass. Regression tests cover delayed and in-flight pointer races, visual-save migration, ladder ascent/pause/descent/letting go/stamina exhaustion/landing/walking off, steep slopes and wall collision.
- Every published Pokémon/item/portrait/trainer hash and trainer/creature clip list checked by the asset verifier.
- Real browser pointer acquisition, release on menu opening, repeated Bag/Party/Save interactions, queued retry cancellation, scripted-battle Tab capture/release with commands guarded, and Hazel guide checked without browser errors.
- Fresh creator exercised Rei/Red/custom selections, then began a new save and inspected the actual empty-party menu. Bulbasaur face framing corrected after screenshot review.
- Explorer checked with the standard web-game client plus full-page desktop/390px phone checks: search, no results, form/animated filters, clip selection, static-model notice, pause/play/reset, no horizontal phone overflow.
- Ladder climbing and the raised landing inspected in screenshots and state. A second peer displayed Rei's climb clip. Both co-op battle variants rerun: shared tactical commands/turn completion, trainer movement, host and guest action movement/dodge, disconnect continuation and returning to exploration. No browser errors in these runs.
- These peer tests used an actual local WebRTC signaling relay. They do not establish success on the user's two different home networks or real-device performance.

## Remaining work and things not to accidentally claim

Catching, fast travel, PC storage, full-dex encounters, functioning shop commerce/enterable new interiors, gyms, new cities and complete synchronized overworld herds are still pending. The shop façades/stalls are decorative. Reference catching/flying UI images are targets for future features. The town still needs residents and richer terrain/environment/architecture detail to approach Arceus. Original Arceus motion files remain a sourcing gap; current CC0 retargets are a working replacement, not proof the original clips were acquired.

M3 catching is still the next gameplay milestone; follow current user feedback for any further polish. Keep saves compatible, both battle test modes accessible, menus click-safe and the public game playable. Record new user decisions and test/deploy evidence in this handoff rather than relying on the chat being available.
