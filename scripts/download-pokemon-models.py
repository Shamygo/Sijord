#!/usr/bin/env python3
"""Download and validate the pinned model library. Requires only Python's standard library.
Usage: python3 scripts/download-pokemon-models.py --output /path/to/model-cache
The 1,322 selected models occupy about 1.2 GiB; a complete source archive is about 1.4 GiB.
Keep this cache outside the repository. The game loads the library on demand from pinned URLs.
"""
import argparse, concurrent.futures, hashlib, json, pathlib, struct, time, urllib.request
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', required=True, type=pathlib.Path)
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[1]
catalogue = json.loads((root/'src/client/assets/pokemon-catalogue.json').read_text())

def download(model):
    dest = args.output/(model['id']+'.glb')
    dest.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(3):
        try:
            data = dest.read_bytes() if dest.exists() else urllib.request.urlopen(model['url'], timeout=90).read()
            assert len(data) == model['bytes'], 'length mismatch'
            digest = hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
            assert digest == model['sha'], 'source hash mismatch'
            assert data[:4] == b'glTF' and struct.unpack_from('<I', data, 8)[0] == len(data), 'invalid GLB'
            header = json.loads(data[20:20+struct.unpack_from('<I', data, 12)[0]])
            assert header.get('meshes'), 'empty model'
            clips = [a.get('name', f'clip-{i}') for i,a in enumerate(header.get('animations', []))]
            assert clips == model['animations'], 'animation inventory mismatch'
            if not dest.exists(): dest.write_bytes(data)
            return {'id':model['id'], 'bytes':len(data), 'animations':clips}
        except Exception:
            if attempt == 2: raise
            dest.unlink(missing_ok=True)
            time.sleep(attempt+1)

results, errors = [], []
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    futures = {pool.submit(download, m):m['id'] for m in catalogue['models']}
    for future in concurrent.futures.as_completed(futures):
        try: results.append(future.result())
        except Exception as error: errors.append({'id':futures[future], 'error':str(error)})
        if (len(results)+len(errors))%100 == 0: print(f'{len(results)} validated; {len(errors)} failed', flush=True)
args.output.mkdir(parents=True, exist_ok=True)
(args.output/'validation.json').write_text(json.dumps({'sources':catalogue['sources'], 'models':results, 'errors':errors}, indent=2))
print(f'{len(results)} validated; {len(errors)} failed')
raise SystemExit(1 if errors else 0)
