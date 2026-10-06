# Sijord: developer notes

Things about the code and testing that aren't obvious from reading it. Most of this was written by the Claude session that built milestone 1 and PR #3, so it describes the code as of PR #3. Later milestones may have changed some details, so check the code when it matters.

## Code gotchas

**World axes.** Three.js is right-handed, so with north = +Z, east is -X, and +X is to your *left* when facing north. Yaw 0 faces +Z, and positive yaw turns toward +X (left).
- Compass: heading = -camYaw, bearing = atan2(-dx, dz) (`ui/hud.ts`).
- The minimap rotates by camYaw + PI. The full map in `ui/menu.ts` is north-up and drawn with scale(-s, -s), so screen-right is east.

**Colliders** (`core/collision.ts`). The spatial grid is built lazily, keyed by the colliders array (WeakMap), the first time the array is resolved against.
- The grid rebuilds when the array's length changes, so colliders pushed later (the professor's, the discovery props') are picked up. Replacing or moving a collider in place is not noticed.
- Colliders that move every frame need a separate list rather than a rebuild per frame.
- Box colliders also act as camera occluders up to 7 m high (`player/camera.ts` insideWall), so the camera never ends up inside a house.
- Kinds are `circle`, axis-aligned `box` and rotated `obox` (the mesa cliff columns). Any collider can carry `maxY` (it stops blocking once the feet are above it; pass the feet height to `resolveCircle`), `climb: true` (the player can grab it and stand on its top) and, for circles, `dome` (the top falls off towards the edge). `colliderContains`, `colliderTop` and `colliderNormal` are the helpers climbing uses.

**Shader warm-up.** `Game.start()` awaits `renderer.compileAsync(scene, camera)` behind the loading screen, and `main.ts` waits for it before removing the loading screen. Before this, the first seconds stalled while shaders compiled, which is most likely why Simon reported "menus didn't work at first". Anything added to the scene later (new NPCs, creatures) compiles on first draw and can hitch unless it is warmed up the same way.

**Menu keys.** Map, bag, party, quests, throw and Esc fire on keydown through Input's `onInstant` callback, not per frame, so they respond even when frames are slow. Movement keys stay per frame. GameMenu has a capture-phase keydown listener that handles rebinding and stops Esc propagating, so the menu doesn't close and reopen on the same Esc.

**Pointer lock.**
- Esc while locked exits the lock, and the pointerlockchange handler treats that as "pause" and opens settings.
- When the game releases the mouse on purpose (menus, dialogue) it sets `suppressPause` first.
- Chrome refuses `requestPointerLock` for about 1 s after an Esc exit, so `Input.requestLock` waits out that cooldown.

**Rendering** (`core/render.ts`).
- Renders HDR (HalfFloat target with MSAA), applies its own tone curve and grade, and sets `renderer.toneMapping = NoToneMapping`. Don't re-enable ACES on the renderer or the image gets graded twice.
- Quality presets: Low is pixel ratio 1, 2x MSAA, 1024 shadows, no bloom or AO. Medium is 1.25, 4x, 2048, bloom. High is up to 2, 4x, 4096, bloom plus AO.
- `renderer.info` auto-reset is off and it resets once per frame, so read it after `render()`.
- The shadow frustum follows the camera. `world.update(dt, elapsed, focus)` keeps the sun and shadow camera centred on the player; don't move `world.sun` from game code.
- Past bugs worth checking before "fixing" colour elsewhere: the far mountain ring once had inverted triangle winding (dark stripes, no snow), and the final colour grade once darkened everything.

**Grass** (`world/grass.ts`). Fixed blade patches are generated once and stamped around the camera every frame. Blade roots are placed on the terrain in the vertex shader from a height texture, using the same interpolation as `heightAt`. Blades are thinned by ground masks (paths, sand, rock, town) and culled per patch on the CPU.

**Height.** `heightAt` must stay exactly equal to the rendered ground, because grass, foot IK and collisions all depend on it. Terrain, grass and `heightAt` all come from one height grid.

**Trainer rig** (`player/avatar-rig.ts`).
- Feet at y = 0. The model faces +Z, and +X is the character's own left.
- Every limb bone rests along -Y so two-bone IK works.
- Hierarchy: pelvis to thigh, shin, foot, toe; spine to chest, then neck and head, plus clavicle, upper arm, forearm, hand.
- Clips are pose keyframes in `avatar-clips.ts`. The pure maths (IK, springs, blends) is in `anim-math.ts`.
- Feet on terrain need `avatar.setGround((x, z) => world.heightAt(x, z))` and `RemotePlayer.setGround(...)`. Without it, feet only estimate the slope from movement. The creator preview and the professor run without ground, which is fine.

**Rei's scarf** (`player/bone-chain.ts`, set up in `imported-trainer.ts`). No clip keys the scarf tail bones (`parts_01-04`), so after `mixer.update` a verlet chain resets them to rest, measures where the pose puts each joint, simulates gravity, a light pull back to that pose (stiffness 0.008, fading to the tip), damping relative to the knot's own motion, air drag, a tapered capsule from `spine_01` (0.235 m, clear of the back bag) to `neck` (0.19 m), which is where the authored drape sits, and a plane 8 cm behind the spine along Rei's facing so a sudden stop can't swing it through the chest. Then it turns each bone to its simulated joint. It runs at a fixed 1/60 s, at most 6 steps a frame, and restarts from the pose after a jump of more than 1.5 m (teleports). `root.userData.scarf` exposes the joints for probes. Damping absolute velocity instead of velocity relative to the body makes the tail stream out flat behind any run.

**Jump.** Physics is instant because the controller tests require it. The crouch before take-off is a visual hold (`AVATAR_ANIM.takeoffHold`).

**Camera.** `setSensitivity`, `setFov` and `setInvertY` exist. Invert-Y is applied in `game.ts` before the delta reaches the camera, and the camera's own `setInvertY` is called with false so it isn't applied twice.

**Classes.** Modifiers live in `src/shared/classes.ts`. As of PR #3 only stamina was applied (`game.ts` passes staminaDrain / mods.stamina to PlayerController). catchRate, xp, craftCost, survivalDrain and maxHp need wiring as their systems land.

**Saves.** localStorage keys are `sijord.save.v1` (profile, room, flags, bag, and later party) and `sijord.settings.v1`. Saves from before the bag existed get `STARTING_BAG` on load. Keep loads backward compatible, since Simon and his friend have saves in their browsers.

**P2P co-op** (`net/p2p.ts`).
- Slot (which house you spawn at) is decided by comparing join timestamps in the "hello" exchange. The later player moves to house 2 only if they're still within 3 m of their spawn.
- A third peer in the same room is ignored rather than refused cleanly.
- Payloads are JSON strings because Trystero's DataPayload typing rejects interfaces.
- There is no TURN server, only STUN. Players behind strict NAT (some school or corporate networks) may never connect. The fallback is `npm run relay` plus `?relay=`. If public-relay co-op fails for Simon and his friend, add a TURN fallback.

## How to play-test in a Claude cloud container

- Install Playwright outside the repo (for example `npm i playwright` in a scratch folder) and launch with:
  ```js
  chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--ignore-certificate-errors', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  })
  ```
  `--ignore-certificate-errors` is needed because Chromium doesn't trust the container's HTTPS proxy CA.
- Rendering is software, at about 1 to 2 s per frame at 1280x720 on Medium.
  - Force Low quality before navigating: `ctx.addInitScript(() => localStorage.setItem('sijord.settings.v1', JSON.stringify({ quality: 'low' })))`.
  - Use generous timeouts (creator 120 s, HUD 400 s) and `ctx.setDefaultTimeout(120000)`.
  - Run each player in a separate `chromium.launch`. Two contexts in one browser starve each other and the second player never gets past the creator.
- Click with `locator.evaluate(e => e.click())` rather than `.click()`, because Playwright's actionability wait times out while the page is busy rendering. Fill text inputs by setting `.value` and dispatching an `input` event.
- Dev builds expose `window.sijord`, including `debugTeleport(x, z, yaw)`. Useful spots: professor (0.5, -347.6, PI); just outside the gate (0, -255, 0); bridge (-185, -60, 0.6). Bramblewick centre is (0, -330) with radius 60, the gate is at (0, -275), the professor stands at (0, -349.6), and talk radius is 2.6 m.
- Two-player tests: public Nostr relays can't be reached from the container (the proxy answers WebSocket upgrades with HTTP 200). Run a local Trystero relay instead, either `npm run relay` (port 8090) or a node script importing `createWsRelayServer` from `node_modules/@trystero-p2p/ws-relay/dist/server.mjs`, and open both pages with `?relay=ws://localhost:<port>`. It's the same game code path; only discovery differs.
- Menu checks: read `document.querySelector('.menu').classList.contains('show')` and the `.menu-tab.on` text. At swiftshader speeds, wait at least 3 s after key presses.
- Compare screenshots against `docs/reference/art-reference.png` for any visual change.

### Faster probes (2026-10-06)

- In the cloud container Playwright is at `/opt/node22/lib/node_modules/playwright/index.mjs` (import it by that path from a scratch script) and Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
- Skip the creator by injecting a save before loading: `localStorage.setItem('sijord.save.v1', JSON.stringify({ room, flags: ['met-professor', 'got-starter', 'got-balls'], bag: {...}, profile: { name, playerClass: 'ranger', appearance: {...} } }))`, then click **Continue** and wait for `window.sijord?.avatar?.root`. With saves injected, two contexts in one browser worked for a two-player check (host and guest in the same `room`, both on `?relay=ws://127.0.0.1:8090`).
- Frames come at 0.2-1 fps, so poll with `page.waitForFunction` (for example until `window.sijord.aiming` or `window.sijord.battle`) instead of fixed waits, and set `window.sijord.debugTimeScale` to 4-5 while a ball or animation plays out.
- Useful hooks: `debugTeleport(x, z, yaw)`, `debugGiveParty([[species, level], ...])`, `debugSpawnWild(species, level, dist)`, `debugWildBattle`, `debugAimAt(x, y, z)` (puts the crosshair on a point), `debugCatch = { caught, reaction }` (forces overworld catch outcomes), and `wild`, `controller`, `vitals`, `aiming`. A good open-field spot just north of the gate is (1.2, -232).
- `pkill -f "<pattern>"` kills its own shell when the pattern appears in the same command line. Use a bracket, for example `pkill -f "probe[.]mjs"`.
- Don't edit `src/` while a probe runs against `npm run dev`: Vite reloads the page, `window.sijord` goes away and the probe fails with "Cannot read properties of undefined".
- Gathering and crafting: `window.sijord.world.resources.nodes` lists every node (`key`, `kind`, `x`, `y`, `z`, `r`); stand at about `r + 0.5` from one, facing it, and press E. `window.sijord.gathering` is set while it runs (`t` against `way.seconds`). `window.sijord.cam.setLook(yaw, pitch)` swings the camera round for a side view. Craft buttons are `.craft-card` (find one by its item name) `button.craft-go`. The workbench spot is in `world.anchors.stations`.

## Smaller known issues (as of PR #3)

- On the minimap and full map, the river and lake render as blocky dark blue.
- Water is less turquoise than the reference, and one boundary foothill seen from town is a pointy cone. A cliff mesa can read as a ruined fortress from a distance.
- HUD toast timers count frame dt, which is capped at 0.1 s, so with very slow frames toasts linger. Harmless on real hardware.
- Dialogue choice buttons need a mouse click; there's no keyboard or gamepad selection for choices yet.


## Movement QA after PR #10

`window.sijord` exists only in Vite development; production intentionally retains only `render_game_to_text` and `advanceTime`. Do not wait for the private game object in a public-site probe. Use ordinary controls and the text hook in production; the committed movement browser regression needs the Vite dev server. A fresh player starts in front of a house: walking into its collider correctly stops motion/animation, so move sideways into clear space when checking sustained gait. Native pointer-lock tests require a focused visible browser window; headless capture was not reliable on this Mac.

Since 2026-10-06 Rei's walk, jog and run share one stride phase, with stride lengths measured from the clips at load (HANDOFF, "Movement, dodge roll and climbing"); the support-foot correction described in POLISH_HANDOFF is gone. Gait clips are posed by setting `action.time` by hand, so their `timeScale` stays 0; `userData.animationRate` reports the effective playback rate. Physics position and collisions own movement. To measure foot slide, drive `controller.update` and `avatar.animate` at a fixed 1/60 s with the render loop stopped (as `scripts/check-movement-browser.mjs` does) and track feet within a few cm of their lowest point. `scripts/rei-anim/` rebuilds Rei's clips.
