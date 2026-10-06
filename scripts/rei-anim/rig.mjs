import fs from 'node:fs';
import * as THREE from 'three';
import { readGlb, accessor } from './glb.mjs';
export { THREE };
export function loadGltf(path) {
  if (path.endsWith('.glb')) return readGlb(path);
  const json = JSON.parse(fs.readFileSync(path, 'utf8'));
  const dir = path.slice(0, path.lastIndexOf('/') + 1);
  const bin = fs.readFileSync(dir + json.buffers[0].uri);
  return { json, bin };
}
export class Rig {
  constructor({ json, bin }) {
    this.json = json; this.bin = bin;
    this.parent = new Array(json.nodes.length).fill(-1);
    json.nodes.forEach((n, i) => (n.children || []).forEach(c => (this.parent[c] = i)));
    this.byName = new Map(json.nodes.map((n, i) => [n.name, i]));
    this.cache = new Map();
    // topological order
    this.order = []; const visit = i => { this.order.push(i); (json.nodes[i].children || []).forEach(visit); };
    json.nodes.forEach((n, i) => { if (this.parent[i] < 0) visit(i); });
  }
  acc(i) { if (!this.cache.has(i)) { const a = this.json.accessors[i]; this.cache.set(i, a.bufferView === undefined ? { data: new Float32Array(a.count * ({SCALAR:1,VEC3:3,VEC4:4}[a.type])), n: {SCALAR:1,VEC3:3,VEC4:4}[a.type], count: a.count } : accessor(this.json, this.bin, i)); } return this.cache.get(i); }
  anim(name) { return this.json.animations.find(a => a.name === name); }
  duration(name) { let m = 0; for (const s of this.anim(name).samplers) m = Math.max(m, this.json.accessors[s.input].max[0]); return m; }
  rest(i) {
    const n = this.json.nodes[i];
    return { t: new THREE.Vector3(...(n.translation || [0, 0, 0])), r: new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])), s: new THREE.Vector3(...(n.scale || [1, 1, 1])) };
  }
  /** local TRS of every node at time t of the clip (null = rest pose) */
  sample(name, t) {
    const L = this.json.nodes.map((_, i) => this.rest(i));
    if (!name) return L;
    const an = this.anim(name);
    for (const c of an.channels) {
      const s = an.samplers[c.sampler]; const inp = this.acc(s.input).data; const out = this.acc(s.output);
      let k = 0; while (k < inp.length - 1 && inp[k + 1] <= t) k++;
      const k1 = Math.min(k + 1, inp.length - 1);
      let f = k1 === k || s.interpolation === 'STEP' ? 0 : (t - inp[k]) / (inp[k1] - inp[k]); f = Math.min(Math.max(f, 0), 1);
      const n = out.n; const get = j => Array.from(out.data.subarray(j * n, j * n + n));
      const node = L[c.target.node];
      if (c.target.path === 'rotation') { const a = new THREE.Quaternion(...get(k)), b = new THREE.Quaternion(...get(k1)); node.r = a.slerp(b, f); }
      else if (c.target.path === 'translation') node.t = new THREE.Vector3(...get(k)).lerp(new THREE.Vector3(...get(k1)), f);
      else if (c.target.path === 'scale') node.s = new THREE.Vector3(...get(k)).lerp(new THREE.Vector3(...get(k1)), f);
    }
    return L;
  }
  world(L) {
    const W = new Array(L.length);
    for (const i of this.order) {
      const m = new THREE.Matrix4().compose(L[i].t, L[i].r, L[i].s);
      W[i] = this.parent[i] >= 0 ? W[this.parent[i]].clone().multiply(m) : m;
    }
    return W;
  }
}
export function decompose(m) { const t = new THREE.Vector3(), r = new THREE.Quaternion(), s = new THREE.Vector3(); m.decompose(t, r, s); return { t, r, s }; }
