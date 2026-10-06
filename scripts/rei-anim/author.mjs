// Author poses on the source rig with world-space hinge rotations, then key them into a clip.
import { THREE } from './rig.mjs';
import { ual } from './bake.mjs';
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const AX = { x: X, y: Y, z: Z };
const depth = i => { let d = 0; while (ual.parent[i] >= 0) { i = ual.parent[i]; d++; } return d; };
function worldRot(L) { const W = []; for (const i of ual.order) { const p = ual.parent[i]; W[i] = (p >= 0 ? W[p].clone() : new THREE.Quaternion()).multiply(L[i].r); } return W; }
const clonePose = L => L.map(n => ({ t: n.t.clone(), r: n.r.clone(), s: n.s.clone() }));
/** edits: [bone, axis 'x'|'y'|'z', degrees][] applied root-first; hips: dy metres; base: [clip, t] */
export function makePose({ base = ['Idle_Loop', 0], edits = [], hipsDY = 0, hipsDZ = 0 }) {
  const L = clonePose(ual.sample(base[0], base[1]));
  const sorted = edits.map(e => [ual.byName.get('DEF-' + e[0]), e[1], e[2]]).sort((a, b) => depth(a[0]) - depth(b[0]));
  for (const [i, ax, deg] of sorted) {
    if (i === undefined) throw new Error('bad bone');
    const W = worldRot(L); const p = ual.parent[i];
    const P = p >= 0 ? W[p] : new THREE.Quaternion();
    const D = new THREE.Quaternion().setFromAxisAngle(AX[ax], deg * Math.PI / 180);
    L[i].r = P.clone().invert().multiply(D).multiply(P).multiply(L[i].r).normalize();
  }
  const h = ual.byName.get('DEF-hips');
  // hips translation is in the hips' parent space (root: -90° X), so convert a world offset
  const W = worldRot(L); const P = W[ual.parent[h]].clone().invert();
  L[h].t.add(new THREE.Vector3(0, hipsDY, hipsDZ).applyQuaternion(P));
  return L;
}
const ease = f => f * f * (3 - 2 * f);
/** keys: [{ at: 0..1, pose }]; the last key should equal the first for loops. */
export function keyed(keys, smooth = true) {
  return f => {
    let k = 0; while (k < keys.length - 2 && keys[k + 1].at <= f) k++;
    const a = keys[k], b = keys[k + 1];
    let u = Math.min(1, Math.max(0, (f - a.at) / (b.at - a.at))); if (smooth) u = ease(u);
    return a.pose.map((n, i) => ({ t: n.t.clone().lerp(b.pose[i].t, u), r: n.r.clone().slerp(b.pose[i].r, u), s: n.s.clone() }));
  };
}
/** Mirror an edit list left/right (sagittal rotations about X keep their sign; Y/Z flip). */
export const mirror = edits => edits.map(([b, ax, d]) => [b.replace(/\.L$/, '.__').replace(/\.R$/, '.L').replace(/\.__$/, '.R'), ax, ax === 'x' ? d : -d]);
