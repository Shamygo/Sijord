# Latest user requests and implementation handoff — 2026-10-05

Read this before continuing graphics, UI, trainer, traversal or multiplayer work. The user specifically requested notes that returning Claude will see and understand, so the top-level `CLAUDE.md` links here prominently. The older VISION/DESIGN/ROADMAP remain useful, but later direct user feedback recorded here takes precedence where it changes earlier assumptions.

## Latest published movement update (PR #10)

- [PR #10](https://github.com/Shamygo/Sijord/pull/10) merged as `873bb0a9ed393cfa3cf092e688329e54009a25f6`.
- [Pages deployment](https://github.com/Shamygo/Sijord/actions/runs/37376975342) and [downloadable build](https://github.com/Shamygo/Sijord/actions/runs/37376975489) succeeded. Play at https://shamygo.github.io/Sijord/?v=movement10.
- The live `assets/game-BJOz-V2a.js` build was checked through ordinary keyboard/mouse controls: Rei reached 4.5 m/s using the calibrated run/jog clip, stopped after input release, jumped and returned to ground, and Party released the captured cursor. Completed live probe had no browser errors. Tests use an isolated fresh save, not the user's browser save.
- Downloaded release matches the final local single-file build byte-for-byte: 4,151,708 bytes, SHA-256 `b8f4d783fad350ddf00b66e7b9b5b37e95d36506c8b086ae34804ce7a3c7d19b`.
- [Actual movement screenshot](screenshots/2026-10-05-movement/live-jog.png) and [local gait/stage measurements](screenshots/2026-10-05-movement/verification.json) are retained. Full implementation/reproduction/limits are in the movement follow-up below. This final notes-only commit changes no runtime code or assets.

## Previous published polish state (PR #9)

Gameplay changes merged in [PR #9](https://github.com/Shamygo/Sijord/pull/9), gameplay merge commit `ba2250645f5814ed252a0bdc0e7bd52dd2d34d33`.

- [Public game](https://shamygo.github.io/Sijord/?v=polish9) and [explorer](https://shamygo.github.io/Sijord/pokemon.html?v=polish9) are live. Pages [run 37294989420](https://github.com/Shamygo/Sijord/actions/runs/37294989420) and downloadable-build [run 37294989426](https://github.com/Shamygo/Sijord/actions/runs/37294989426) both succeeded.
- Live browser checks confirmed the published `assets/game-JaPnUxlV.js` build, Rei with its idle clip, old-default visual migration with the party preserved, actual mouse capture/release over Party/Save/Bag/close, and empty-party Hazel guidance. Pikachu's included attack clip and all 971 portrait-manifest entries were available. No browser errors in the completed live run.
- Published Rei SHA-256: `d4405b1af003678bbd2f09cfb803de872fa18fd8113695bc1e8061e4c70de3ba`.
- The [latest downloadable release](https://github.com/Shamygo/Sijord/releases/tag/latest) HTML was downloaded and matched the final local build byte-for-byte (4,148,220 bytes; SHA-256 `692c40a98c163e724ab45ede228b025ac19e8fe35dd6eeeea82b4edfeb15223c`). Imported art still requires internet.

These checks used isolated test saves, not the user's personal browser save. Preserve all compatibility rules below. The PR #9 evidence above describes the previous polish release; the newer movement update is documented below.

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


## Movement follow-up — moonwalking, repeated jumps and Pokémon direction snaps

The exact new feedback is preserved in VISION.md. The user wants fluid, responsive character movement rather than floating steps, car-like airborne steering or instant Pokémon direction changes.

- `player/imported-trainer.ts` measures backwards foot travel on each final-sized Rei instance (120 samples per walk/run cycle). Playback uses actual resolved displacement rather than a capped speed multiplier. Gaits preserve normalized phase when changing and use a running stride above 2.7 m/s (return to walk below 2.2): the existing 4.5 m/s exploration speed is jogging pace. A bounded 30 cm visual hip correction stabilizes the supporting foot against the world; running retains its flight phase. Teleports reset the anchor. The physics capsule remains authoritative. This improves the retargeted clips; it does not replace them with original Arceus animations.
- `player/controller.ts` applies limited directional air forces instead of rotating velocity like a car. Releasing movement brakes in air at 8 m/s². Air movement cannot raise the take-off speed cap. Landing after a meaningful drop/jump plants for 75 ms and retains 90% horizontal speed; a 180 ms press buffer and coyote time preserve responsiveness. A held jump still cannot auto-hop. Facing follows actual travel through skids instead of immediately facing backwards. Ladder release, climbing and platform collisions remain supported.
- `battle/stage.ts` eases normal Pokémon movement over about 56 ms and turns over about 71 ms using frame-rate-independent shortest-angle damping. Dodge launches remain immediate, with dash speed removed when the dodge ends. Guest mirrors interpolate positions and facing between host snapshots. Animation speed uses resolved travel, including stopping against boundaries, rather than input magnitude. Combat damage/PP/status rules and dodge timing/cooldown are unchanged.
- Regression coverage: new controller cases check grounded repeat-jump recovery, air braking, no mid-air sprint acceleration, and reversal facing. Facing tests check the ±PI seam and frame-rate independence. `scripts/check-movement-browser.mjs` checks the actual Rei gait and actual BattleStage direction reversal/remote interpolation in a running Vite game; requires Playwright available locally, `npm run dev`, then `node scripts/check-movement-browser.mjs`. Output defaults to the system temp directory; `QA_OUTPUT` overrides it. Browser fixtures are isolated, not the user's saves.

Local validation: 161 tests pass, typecheck and normal/downloadable builds pass. The actual normal-travel trace showed median planted-foot world drift of 0 m/s across 89 support samples at 4.5 m/s travel; the first Pokémon turn moved 0.327 radians rather than snapping 1.571 radians. A remote 0.7 m position update advanced 0.181 m in its first rendered frame. These are regression measurements, not proof of perfect foot IK on every slope or every species. Two isolated browser peers completed shared tactical combat and exercised both host/guest action movement and dodging, guest leave/AI continuation, battle return, medicine and menus with no browser errors. The standard game client screenshot was inspected; all 1,322 model/8,518 clip/2,035 item/971 portrait/Rei hashes verified. Publication results follow below.
