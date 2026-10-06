import fs from 'node:fs';
export function readGlb(path) {
  const buf = fs.readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not glb');
  let off = 12; let json, bin;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    else if (type === 0x004e4942) bin = Buffer.from(data);
    off += 8 + len;
  }
  return { json, bin };
}
export function writeGlb(path, json, bin) {
  let js = Buffer.from(JSON.stringify(json), 'utf8');
  const jpad = (4 - (js.length % 4)) % 4; js = Buffer.concat([js, Buffer.alloc(jpad, 0x20)]);
  const bpad = (4 - (bin.length % 4)) % 4; bin = Buffer.concat([bin, Buffer.alloc(bpad, 0)]);
  const total = 12 + 8 + js.length + 8 + bin.length;
  const h = Buffer.alloc(12); h.writeUInt32LE(0x46546c67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(path, Buffer.concat([h, jh, js, bh, bin]));
}
const COMP = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array, 5122: Int16Array, 5120: Int8Array };
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
export function accessor(json, bin, i) {
  const a = json.accessors[i]; const bv = json.bufferViews[a.bufferView];
  const T = COMP[a.componentType]; const n = NC[a.type];
  const off = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const stride = bv.byteStride || n * T.BYTES_PER_ELEMENT;
  const out = new Float32Array(a.count * n);
  for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) {
    const p = off + k * stride + c * T.BYTES_PER_ELEMENT;
    let v;
    switch (a.componentType) { case 5126: v = bin.readFloatLE(p); break; case 5123: v = bin.readUInt16LE(p); break; case 5125: v = bin.readUInt32LE(p); break; case 5121: v = bin.readUInt8(p); break; case 5122: v = bin.readInt16LE(p); break; default: v = bin.readInt8(p); }
    if (a.normalized) { if (a.componentType === 5122) v = Math.max(v / 32767, -1); else if (a.componentType === 5120) v = Math.max(v / 127, -1); else if (a.componentType === 5123) v /= 65535; else if (a.componentType === 5121) v /= 255; }
    out[k * n + c] = v;
  }
  return { data: out, n, count: a.count };
}
