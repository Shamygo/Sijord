// Bake extra UAL clips onto Rei with the same per-bone world offsets the existing clips use.
import { Rig, loadGltf, decompose, THREE } from './rig.mjs';
import { writeGlb } from './glb.mjs';
import crypto from 'node:crypto';
import fs from 'node:fs';

const REI = process.argv[2], UAL = process.argv[3], OUT = process.argv[4];
const reiData = loadGltf(REI);
const rei = new Rig(reiData);
const ual = new Rig(loadGltf(UAL));
const FPS = 30, SRC_RATE = 1.25, HIP_SCALE = 0.8406;
const MAP = { waist: 'DEF-hips', spine_02: 'DEF-spine.002', spine_03: 'DEF-spine.003', neck: 'DEF-neck', head: 'DEF-head' };
for (const [s, S] of [['left', 'L'], ['right', 'R']]) Object.assign(MAP, {
  [`${s}_shoulder`]: `DEF-shoulder.${S}`, [`${s}_arm_01`]: `DEF-upper_arm.${S}`, [`${s}_arm_02`]: `DEF-forearm.${S}`, [`${s}_hand`]: `DEF-hand.${S}`,
  [`${s}_leg_01`]: `DEF-thigh.${S}`, [`${s}_leg_02`]: `DEF-shin.${S}`, [`${s}_foot`]: `DEF-foot.${S}`, [`${s}_toe`]: `DEF-toe.${S}`,
});
const mapped = new Map(Object.entries(MAP).map(([r, s]) => [rei.byName.get(r), ual.byName.get(s)]));
// Offsets from the existing walk bake, frame 0.
const R0 = rei.world(rei.sample('walk', 0)).map(decompose), S0 = ual.world(ual.sample('Walk_Loop', 0)).map(decompose);
const offset = new Map([...mapped].map(([ri, si]) => [ri, S0[si].r.clone().invert().multiply(R0[ri].r)]));
const waist = rei.byName.get('waist'), hips = ual.byName.get('DEF-hips');

/** Local rotations (per mapped node) and waist translation for a source pose. */
function retarget(srcLocal, opts = {}) {
  const S = ual.world(srcLocal).map(decompose);
  const L = rei.sample(null, 0);
  const W = new Array(L.length), out = { rot: new Map(), waistT: null };
  for (const i of rei.order) {
    const p = rei.parent[i];
    const pw = p >= 0 ? W[p] : new THREE.Matrix4();
    if (mapped.has(i)) {
      const wr = S[mapped.get(i)].r.clone().multiply(offset.get(i));
      const pr = decompose(pw).r;
      L[i].r = pr.clone().invert().multiply(wr).normalize();
      out.rot.set(i, L[i].r.clone());
      if (i === waist) {
        const sp = S[hips].t;
        const wp = new THREE.Vector3(opts.keepXZ ? sp.x * HIP_SCALE : 0, sp.y * HIP_SCALE, opts.keepXZ ? sp.z * HIP_SCALE : 0);
        L[i].t = wp.applyMatrix4(pw.clone().invert());
        out.waistT = L[i].t.clone();
      }
    }
    W[i] = pw.clone().multiply(new THREE.Matrix4().compose(L[i].t, L[i].r, L[i].s));
  }
  return out;
}

/** Sample a source clip (or a pose function) into keyframes. */
function bakeClip(name, srcName, opts = {}) {
  const srcDur = srcName ? ual.duration(srcName) : opts.duration * SRC_RATE;
  const dur = srcDur / SRC_RATE, n = Math.round(dur * FPS);
  const times = [], rot = new Map(), wt = [];
  for (let k = 0; k <= n; k++) {
    const t = Math.min(dur, k / FPS);
    const src = opts.pose ? opts.pose(t / dur) : ual.sample(srcName, t * SRC_RATE);
    const r = retarget(src, opts);
    times.push(t);
    for (const [i, q] of r.rot) {
      const list = rot.get(i) ?? []; const prev = list[list.length - 1];
      if (prev && prev.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      list.push(q); rot.set(i, list);
    }
    wt.push(r.waistT);
  }
  return { name, source: srcName ?? opts.label, seconds: dur, times, rot, wt };
}

// ---- check the pipeline: re-bake walk/run and compare with what's in the file ----
const qa = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a.dot(b)))) * 180 / Math.PI;
for (const [rn, sn] of [['walk', 'Walk_Loop'], ['run', 'Sprint_Loop']]) {
  const b = bakeClip(rn, sn); let worst = 0, worstT = 0;
  b.times.forEach((t, k) => {
    const L = rei.sample(rn, t);
    for (const [i, list] of b.rot) worst = Math.max(worst, qa(list[k], L[i].r));
    worstT = Math.max(worstT, b.wt[k].distanceTo(L[waist].t));
  });
  console.log(`check ${rn}: max rotation error ${worst.toFixed(3)} deg, waist ${worstT.toFixed(4)} m`);
}

export { bakeClip, rei, ual, reiData, retarget, mapped, waist };

// ---- write ----
export function writeWith(clips) {
  const { json } = reiData; let bin = reiData.bin;
  const chunks = [bin]; let off = bin.length;
  const pad = () => { const p = (4 - (off % 4)) % 4; if (p) { chunks.push(Buffer.alloc(p)); off += p; } };
  pad();
  const addAccessor = (arr, type, minmax) => {
    const buf = Buffer.from(new Float32Array(arr).buffer);
    json.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: buf.length });
    chunks.push(buf); off += buf.length;
    const acc = { bufferView: json.bufferViews.length - 1, componentType: 5126, count: arr.length / { SCALAR: 1, VEC3: 3, VEC4: 4 }[type], type };
    if (minmax) { acc.min = [Math.min(...arr)]; acc.max = [Math.max(...arr)]; }
    json.accessors.push(acc); return json.accessors.length - 1;
  };
  for (const c of clips) {
    json.animations = json.animations.filter(a => a.name !== c.name);
    const input = addAccessor(c.times, 'SCALAR', true);
    const an = { name: c.name, channels: [], samplers: [] };
    for (const [i, list] of c.rot) {
      const out = addAccessor(list.flatMap(q => [q.x, q.y, q.z, q.w]), 'VEC4');
      an.samplers.push({ input, output: out, interpolation: 'LINEAR' });
      an.channels.push({ sampler: an.samplers.length - 1, target: { node: i, path: 'rotation' } });
    }
    const out = addAccessor(c.wt.flatMap(v => [v.x, v.y, v.z]), 'VEC3');
    an.samplers.push({ input, output: out, interpolation: 'LINEAR' });
    an.channels.push({ sampler: an.samplers.length - 1, target: { node: waist, path: 'translation' } });
    json.animations.push(an);
  }
  bin = Buffer.concat(chunks);
  json.buffers[0].byteLength = bin.length;
  writeGlb(OUT, json, bin);
  const data = fs.readFileSync(OUT);
  return { bytes: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex') };
}
