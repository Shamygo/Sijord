"""
Builds Sijord's world asset packs with Blender (headless):

  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/blender/build.py

Writes public/models/world/<pack>.glb (Draco, vertex colours with baked AO, a `__glow` mesh per
asset where it has lit parts, and `__lod` meshes at low detail) and
src/shared/data/world-assets.json (footprints, colliders, doors, lamps and anchors per asset).
Deterministic: the same script always writes the same models.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import kit  # noqa: E402
from buildings import HOUSES  # noqa: E402

try:
    from specials import SPECIALS  # noqa: E402
except ImportError:  # while specials are being written
    SPECIALS = {}
try:
    from props import PROPS  # noqa: E402
except ImportError:
    PROPS = {}

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

# name -> (pack, builder(asset))
CATALOGUE = {}
for style, fn in HOUSES.items():
    for v in range(3):
        CATALOGUE[f'house_{style}_s{v}'] = (f'houses-{style}', (lambda f, vv: (lambda a: f(a, vv, False)))(fn, v))
    for v in range(2):
        CATALOGUE[f'house_{style}_l{v}'] = (f'houses-{style}', (lambda f, vv: (lambda a: f(a, vv + 1, True)))(fn, v))
for name, (pack, fn) in SPECIALS.items():
    CATALOGUE[name] = (pack, fn)
for name, (pack, fn) in PROPS.items():
    CATALOGUE[name] = (pack, fn)


def make(name, detail=True, bake=True):
    pack, fn = CATALOGUE[name]
    a = kit.Asset(name if detail else name + '__lod', detail=detail)
    fn(a)
    obs, meta = kit.finish(a, bake=bake)
    return obs, meta


def main():
    only = None
    if '--' in sys.argv:
        args = sys.argv[sys.argv.index('--') + 1:]
        only = set(args) if args else None
    out_dir = os.path.join(ROOT, 'public', 'models', 'world')
    os.makedirs(out_dir, exist_ok=True)
    manifest_path = os.path.join(ROOT, 'src', 'shared', 'data', 'world-assets.json')
    manifest = {'version': 1, 'packs': {}, 'assets': {}}
    if only and os.path.exists(manifest_path):
        with open(manifest_path) as f:
            manifest = json.load(f)
    packs = {}
    for name, (pack, _) in CATALOGUE.items():
        packs.setdefault(pack, []).append(name)
    for pack, names in sorted(packs.items()):
        if only and pack not in only:
            continue
        kit.reset_scene()
        objects = []
        for name in names:
            obs, meta = make(name, detail=True)
            lod, lmeta = make(name, detail=False)
            objects += obs + lod
            meta['pack'] = pack
            meta['lodTris'] = lmeta['tris']
            manifest['assets'][name] = meta
            print(f'  {name}: {meta["tris"]} tris (lod {lmeta["tris"]})', flush=True)
        path = os.path.join(out_dir, f'{pack}.glb')
        kit.export_pack(objects, path)
        manifest['packs'][pack] = {'file': f'models/world/{pack}.glb', 'bytes': os.path.getsize(path)}
        print(f'PACK {pack}: {len(names)} assets, {os.path.getsize(path)} bytes', flush=True)
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=1, sort_keys=True)
        f.write('\n')
    print('MANIFEST', manifest_path)


if __name__ == '__main__' and 'preview.py' not in ' '.join(sys.argv):
    main()
