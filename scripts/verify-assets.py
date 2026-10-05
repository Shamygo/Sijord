#!/usr/bin/env python3
"""Verify every published model (including gzip payloads) and item sprite against its manifest."""
import gzip, hashlib, json, pathlib, struct
root = pathlib.Path(__file__).resolve().parents[1]
public = root / 'public'
models = json.loads((root / 'src/client/assets/pokemon-catalogue.json').read_text())['models']
clips = 0
for model in models:
    packed = (public / model['local']).read_bytes()
    assert hashlib.sha256(packed).hexdigest() == model['downloadSha256'], model['id']
    data = gzip.decompress(packed) if model['local'].endswith('.gz') else packed
    assert hashlib.sha256(data).hexdigest() == model['bundledSha256'], model['id']
    assert data[:4] == b'glTF' and struct.unpack_from('<I', data, 8)[0] == len(data), model['id']
    gltf = json.loads(data[20:20 + struct.unpack_from('<I', data, 12)[0]])
    names = [a.get('name', f'clip-{i}') for i, a in enumerate(gltf.get('animations', []))]
    assert gltf.get('meshes') and sorted(names) == sorted(model['animations']), model['id']
    clips += len(names)
items = json.loads((public / 'items/manifest.json').read_text())['items']
for item in items:
    data = (public / 'items' / item['file']).read_bytes()
    assert data.startswith(b'\x89PNG\r\n\x1a\n'), item['file']
    assert hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest() == item['sha'], item['file']
icons = json.loads((public / 'pokemon-icons/manifest.json').read_text())['icons']
assert {i['dex'] for i in icons} == {m['dex'] for m in models if m['dex']}
for icon in icons:
    data = (public / 'pokemon-icons' / icon['file']).read_bytes()
    assert data.startswith(b'\x89PNG\r\n\x1a\n') and len(data) == icon['bytes'], icon['file']
    assert hashlib.sha256(data).hexdigest() == icon['sha256'], icon['file']
trainer = json.loads((public / 'models/trainer/rei-manifest.json').read_text())
data = (public / 'models/trainer' / trainer['file']).read_bytes()
assert hashlib.sha256(data).hexdigest() == trainer['sha256'] and len(data) == trainer['bytes']
gltf = json.loads(data[20:20 + struct.unpack_from('<I', data, 12)[0]])
assert sorted(a['name'] for a in gltf['animations']) == sorted(a['name'] for a in trainer['animations'])
assert len(gltf['skins'][0]['joints']) == trainer['joints']
print(f'Verified {len(models)} models, {clips} Pokémon clips, {len(items)} items, {len(icons)} portraits, and Rei with 8 retargeted clips.')
