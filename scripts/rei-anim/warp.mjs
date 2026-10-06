// Even out a gait's ground contact: retime the clip so each planted foot sweeps back at a steady
// speed (the source sprint's contact speeds up and slows down, which reads as skating at any rate).
import { rei, ual, retarget, mapped, waist } from './bake.mjs';
import { decompose } from './rig.mjs';
const lf = rei.byName.get('left_foot'), rf = rei.byName.get('right_foot');
function feetAt(src, t) {
  const r = retarget(ual.sample(src, t));
  const L = rei.sample(null, 0);
  for (const [i, q] of r.rot) L[i].r = q;
  L[waist].t = r.waistT;
  const W = rei.world(L);
  return [decompose(W[lf]).t, decompose(W[rf]).t];
}
/** Returns pose(f) for bakeClip: f in 0..1 of the output cycle → source pose. */
export function warpedPose(src, { N = 240, band = 0.035, blur = 3 } = {}) {
  const D = ual.duration(src);
  const feet = []; for (let i = 0; i <= N; i++) feet.push(feetAt(src, (D * i) / N));
  const low = [0, 1].map((f) => Math.min(...feet.map((p) => p[f].y)));
  // rate[i]: output time per input step i→i+1
  let swept = 0, time = 0;
  const contact = [];
  for (let i = 0; i < N; i++) {
    let c = null;
    for (const f of [0, 1]) { const a = feet[i][f], b = feet[i + 1][f]; if (Math.max(a.y, b.y) < low[f] + band && a.z > b.z) { c = a.z - b.z; } }
    contact.push(c);
    if (c !== null) { swept += c; time += D / N; }
  }
  const vRef = swept / time;
  let rate = contact.map((c) => (c === null ? D / N : c / vRef));
  // soften the switches between contact and flight
  for (let pass = 0; pass < blur; pass++) rate = rate.map((r, i) => (rate[(i - 1 + N) % N] + 2 * r + rate[(i + 1) % N]) / 4);
  const cum = [0]; for (let i = 0; i < N; i++) cum.push(cum[i] + rate[i]);
  const total = cum[N];
  // inverse: output fraction u → input time
  return (u) => {
    const target = u * total; let i = 0; while (i < N - 1 && cum[i + 1] < target) i++;
    const f = (target - cum[i]) / Math.max(1e-9, cum[i + 1] - cum[i]);
    return ual.sample(src, (D * (i + Math.min(1, Math.max(0, f)))) / N);
  };
}
export function stanceReport(clipPose, D, N = 240) {
  // measure contact speed variation of a pose function over the cycle
  const feet = []; for (let i = 0; i <= N; i++) { const src = clipPose(i / N); const r = retarget(src); const L = rei.sample(null, 0); for (const [k, q] of r.rot) L[k].r = q; L[waist].t = r.waistT; const W = rei.world(L); feet.push([decompose(W[lf]).t, decompose(W[rf]).t]); }
  const low = [0, 1].map((f) => Math.min(...feet.map((p) => p[f].y)));
  const v = [];
  for (let i = 0; i < N; i++) for (const f of [0, 1]) { const a = feet[i][f], b = feet[i + 1][f]; if (Math.max(a.y, b.y) < low[f] + 0.035 && a.z > b.z) v.push(((a.z - b.z) * N) / D); }
  v.sort((a, b) => a - b);
  return { n: v.length, min: v[0]?.toFixed(2), p25: v[Math.floor(v.length / 4)]?.toFixed(2), median: v[Math.floor(v.length / 2)]?.toFixed(2), p75: v[Math.floor((3 * v.length) / 4)]?.toFixed(2), max: v.at(-1)?.toFixed(2) };
}
