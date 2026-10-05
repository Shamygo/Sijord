# Sijord: developer notes

Things about the code and testing that aren't obvious from reading it. Most of this was written by the Claude session that built milestone 1 and PR #3, so it describes the code as of PR #3. Later milestones may have changed some details, so check the code when it matters.

## Code gotchas

**World axes.** Three.js is right-handed, so with north = +Z, east is -X, and +X is to your *left* when facing north. Yaw 0 faces +Z, and positive yaw turns toward +X (left).
- Compass: heading = -camYaw, bearing = atan2(-dx, dz) (`ui/hud.ts`).
- The minimap rotates by camYaw + PI. The full map in `ui/menu.ts` is north-up and drawn with scale(-s, -s), so screen-right is east.

**Colliders** (`core/collision.ts`). The spatial grid is built lazily, keyed by the colliders array (WeakMap), the first time the array is resolved against.
- Anything pushed into `world.colliders` after the first movement update is silently ignored. The professor's collider is pushed in the Game constructor for that reason.
- Dynamic colliders need a separate list or a grid rebuild.
- Box colliders also act as camera occluders up to 7 m high (`player/camera.ts` insideWall), so the camera never ends up inside a house.

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

## Smaller known issues (as of PR #3)

- On the minimap and full map, the river and lake render as blocky dark blue.
- Water is less turquoise than the reference, and one boundary foothill seen from town is a pointy cone. A cliff mesa can read as a ruined fortress from a distance.
- HUD toast timers count frame dt, which is capped at 0.1 s, so with very slow frames toasts linger. Harmless on real hardware.
- Dialogue choice buttons need a mouse click; there's no keyboard or gamepad selection for choices yet.
