// Drop the constant tracks the old bakes carry for every node (all equal to the rest pose).
import { THREE } from './rig.mjs';
export function prune(rig, json, keepNodes, waist) {
  let dropped = 0, worst = 0;
  for (const an of json.animations) {
    const keep = [];
    for (const c of an.channels) {
      const node = c.target.node, path = c.target.path;
      const animated = (path === 'rotation' && keepNodes.has(node)) || (path === 'translation' && node === waist);
      if (animated) { keep.push(c); continue; }
      const s = an.samplers[c.sampler]; const out = rig.acc(s.output); const rest = rig.rest(node);
      const ref = path === 'rotation' ? rest.r.toArray() : path === 'translation' ? rest.t.toArray() : rest.s.toArray();
      for (let k = 0; k < out.count; k++) for (let j = 0; j < out.n; j++) {
        let d = Math.abs(out.data[k * out.n + j] - ref[j]);
        if (path === 'rotation') d = Math.min(d, Math.abs(out.data[k * out.n + j] + ref[j]));
        worst = Math.max(worst, d);
      }
      dropped++;
    }
    // re-index samplers
    const samplers = []; const map = new Map();
    for (const c of keep) { if (!map.has(c.sampler)) { map.set(c.sampler, samplers.length); samplers.push(an.samplers[c.sampler]); } c.sampler = map.get(c.sampler); }
    an.channels = keep; an.samplers = samplers;
  }
  // drop accessors and buffer views nothing references any more (all animation data lives in its own views)
  return { dropped, worst };
}
