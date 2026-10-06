# Rei's baked clips

These scripts add clips to `public/models/trainer/rei.glb` by retargeting Quaternius's CC0 Universal Animation Library onto Rei's rig, using the same per-bone world offsets as the original Blender retarget (the script re-bakes walk and run first and prints how far they land from the stored ones; expect about 0.03 degrees). They wrote the 2026-10-06 clips: walk, jog and run (retimed so a planted foot sweeps back at a steady speed), roll, the wall climb loop, the pull-up, and the gathering clips (kneel at the ground, reach and pick, a two-handed chop). The old 1 m vault clip was renamed from `climb` to `vault`.

Rebuild the current file byte for byte:

```bash
git show c0d5e68:public/models/trainer/rei.glb > /tmp/rei-before.glb   # Rei with the original eight clips
# Library 1 from the mirror pinned in rei-manifest.json:
#   github.com/J-Ponzo/gltf-universal-animation-library @ e24c23cf2a1323488a3faa226ea7ea21f644b73e
#   glTF/AnimationLibrary_Godot_Standard.gltf and its .bin, side by side
node scripts/rei-anim/bake-clips.mjs /tmp/rei-before.glb /path/to/AnimationLibrary_Godot_Standard.gltf public/models/trainer/rei.glb
```

It prints the new byte count and SHA-256. Copy both into `rei-manifest.json` (and the clip list, if it changed), then run `python3 scripts/verify-assets.py`.

- `bake.mjs`: loads both rigs, maps 22 bones, `bakeClip(name, sourceClip | null, { pose, duration })` samples at 30 fps, `writeWith(clips)` appends the clips as new buffer views and writes the GLB. Source time runs 1.25× Rei's; the hips keep only their height, scaled by 0.8406.
- `author.mjs`: hand-authored poses on the source rig (`makePose` with world-axis hinge edits, `keyed` to tween them, `mirror` for left/right).
- `warp.mjs`: `warpedPose(source)` retimes a gait so the planted foot moves at constant speed.
- `prune.mjs`: drops the constant rest-pose tracks the Blender bakes carried for every node.
- `bake-clips.mjs`: the clip list, the authored climb, pull-up and chop poses, and the cut-down kneel and pick.

The runtime (`src/client/player/imported-trainer.ts`) measures each gait's stride length and phase from the clips when Rei loads, so a new or retimed gait needs no hand-tuned numbers.
