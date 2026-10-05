#!/usr/bin/env python3
"""Fetch pinned Pokémon portraits for the explorer; reruns retain valid PNGs."""
from pathlib import Path
import json,urllib.request,concurrent.futures,hashlib
root=Path(__file__).resolve().parents[1];commit=json.loads((root/'public/items/manifest.json').read_text())['commit']
dex=sorted({m['dex'] for m in json.loads((root/'src/client/assets/pokemon-catalogue.json').read_text())['models'] if m['dex']})
out=root/'public/pokemon-icons';out.mkdir(exist_ok=True)
def fetch(n):
 url=f'https://raw.githubusercontent.com/PokeAPI/sprites/{commit}/sprites/pokemon/{n}.png'
 try:
  p=out/f'{n}.png';b=p.read_bytes() if p.exists() else urllib.request.urlopen(url,timeout=25).read();assert b.startswith(b'\x89PNG\r\n\x1a\n');p.write_bytes(b)
  return {'dex':n,'file':p.name,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
 except Exception as e:return {'dex':n,'error':str(e)}
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as p:results=list(p.map(fetch,dex))
(out/'manifest.json').write_text(json.dumps({'source':'PokeAPI/sprites','commit':commit,'icons':[r for r in results if 'error' not in r]},indent=2))
print('Icons',len(results),'errors',[r for r in results if 'error' in r])

if any('error' in r for r in results): raise SystemExit(1)
