# Pokémon models and trainer

Added at the user's explicit request on 2026-10-05, including publication on the existing public site. This supersedes the procedural-only art rule for these imported characters. Assets remain the property of their respective creators and rights holders; code licensing does not grant an asset licence.

## Sources and coverage

- [Pokémon 3D API assets](https://github.com/Pokemon-3D-api/assets), commit `429de1288cea0d43f5b4f56305d2276e94239d65`: 1,322 regular and alternate-form GLBs, including 971 distinct regular Pokédex numbers. This is not every species or every form.
- [06wj Pokémon collection](https://github.com/06wj/pokemon), commit `00d96f7f18894055e7f1db44fa0df6462e5e4c8a`: 151 original-generation regular models with 869 included animation clips. These override the regular models for #1–151 in the catalogue.
- [Red from Pokémon Masters](https://models.spriters-resource.com/mobile/pokemonmasters/asset/347972/), submitted by Ziella to The Models Resource. Original download: `https://models.spriters-resource.com/media/assets/345/347972.zip?updated=1755513646`; self-contained rigged preview: `https://models.spriters-resource.com/media/preview_models/345/347972.glb?updated=1755513646`. The skin has no embedded clips. Its 93-joint skeleton is driven by Sijord's existing world-space walk/jog/sprint/jump/terrain and throw poses, with bind-axis conversion and T-pose arm correction. These are adapted Sijord motions, not original Pokémon Masters animation clips.
- Names: [PokeAPI species CSV](https://github.com/PokeAPI/pokeapi/blob/master/data/v2/csv/pokemon_species.csv).
- Draco decoder: copied from the installed Three.js package (`three/examples/jsm/libs/draco/gltf`), with the upstream README and Apache licence.

All 1,473 source GLBs were downloaded, checked for mesh content and GLB lengths, and verified against Git blob hashes. Combined source size was 1,395.7 MiB. The selected catalogue has 1,322 entries; 404 entries contain 8,518 animation clips. It does not imply 1,322 implemented encounter species. The rest display clearly labelled generated idle motion in the library.

## Gameplay

The 21 existing Sijord save/species IDs remain stable. `src/shared/pokemon-visuals.ts` maps those slots to Bulbasaur–Venusaur, Charmander–Charizard, Squirtle–Blastoise, Pidgey–Pidgeot, Rattata–Raticate, Caterpie–Butterfree, Clefairy/Clefable and Growlithe/Arcanine. Display names and starter dialogue now match the models. Existing combat stats, types, learnsets and encounter balance are preserved; they are still Sijord's custom progression, not a fully canonical Pokémon data import.

The 21 gameplay models and Red are self-hosted under `public/models`. Pokémon idle, walk, run, attack and happy clips are selected by context. Hit flash, special pulse and faint lean use additional generated reactions. Pokémon with a sleep clip use it during faint; the final faint state holds until reset. Skeletons and reaction materials are independent per instance; geometries/textures are shared. The initial gameplay pack is loaded before portraits and world construction, with a 30-second deadline per file. Failures retain playable procedural fallbacks and show a toast.

Red is the default for new and existing saves. The trainer creator also offers the original custom trainer. NPCs retain their original appearance. Co-op transmits the optional trainer choice in the existing appearance record; older saves require no migration.

## Library, downloads and builds

`pokemon.html` provides a searchable viewer and animation selector for every catalogue entry. The library loads only the selected model, using self-hosted local assets for all 1,322 entries. Catalogue-only GLBs use lossless gzip packaging and browser decompression before GLTF loading. An unavailable model displays an error and can be retried. Original immutable source URLs and hashes remain in the manifest for provenance. An unused-template cache retains only four optional catalogue models after disposing an instance.

Download the selected library without extra dependencies:

```sh
python3 scripts/download-pokemon-models.py --output /path/outside/the/repo
```

The script verifies source hashes, container lengths and animation names, emits `validation.json`, and exits nonzero on incomplete coverage. Do not commit the original source cache. The optimized and compressed published collection is bundled under `public/models`. Bundled models were optimized with `@gltf-transform/cli`: `optimize INPUT OUTPUT --texture-size 512 --compress draco --simplify false`; the trainer uses the same texture/compression settings. GLB assets retain their skeletons and clips. The full original source catalogue is approximately 1.4 GiB; bundled gameplay assets are approximately 30 MiB and the complete published Pokémon catalogue is 579.92 MiB. Gzip changes neither clip data nor model data; both compressed and decompressed SHA-256 hashes were checked for every entry.

`npm run build` includes the game and both gallery pages. The one-file release still embeds the game code, but the imported asset pack loads from the public Sijord site when opened from `file://`. It therefore needs an internet connection for imported characters; offline loading falls back to procedural models. It is no longer a fully self-contained offline asset build.

## Items and interface

All 2,035 PNG item sprites from PokeAPI/sprites are self-hosted under `public/items`; their immutable source commit, byte counts and Git blob hashes are recorded in `public/items/manifest.json`. Custom save IDs remain valid. The three original medical supplies display as Oran Berry, Fresh Water and Potion and restore 10/30/20 HP to a selected living Pokémon from the bag, consuming one item only when healing succeeds. Balls and key items use the corresponding sprite artwork; custom raw materials retain their symbols. Downloading the icon set does not add 2,035 functional items.

The player-provided interface references guide dark glass panels, cyan focus borders, vertically stacked move choices, a five-column bag, trainer portrait beside the party, and a searchable Pokédex linked to the complete model viewer. The existing map, quest and settings functions remain available. Catching and fast travel have not been added by these artwork changes.

## Battle modes and co-op

At the encounter lobby choose **Free-roam · turn-based** or **Action · move and dodge**. In the first, trainers walk/run/jump while commands still resolve through the original double-battle engine. Tab hides/shows commands and switches between mouse look and cursor control. Switch uses X rather than S to preserve backward movement. The battle camera no longer takes over the orbit camera.

Action mode pilots the first allied Pokémon with WASD and Shift. Space dashes with a 1.4-second cooldown. Commands have a 2.5-second window (idling passes), followed by a 0.9-second marked impact warning; leaving the marked zone or dashing through impact can cause a spatial miss. PP, damage, accuracy, type, status, priority, switching and XP still use the shared engine. A solo second ally is AI controlled. This is an experimental timed action variant of that engine, not a separate canonical Pokémon battle system.

Friends using the same world code can press E near an encounter lobby to join before its host selects a mode. Each brings their own party and commands one active Pokémon. One host resolves both players’ choices and publishes the stage and events; the guest renders that view and receives committed HP/PP/XP/status results. Guests can switch and run from wild battles. A missing guest command times out; disconnects hand the guest slot to AI so the host is not stuck. Closing the host ends the shared encounter on the guest device. Existing networking still depends on successful WebRTC peer connectivity or a reachable optional server; the feature does not supply a new TURN service.
