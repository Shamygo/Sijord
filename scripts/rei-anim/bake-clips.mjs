import { bakeClip, writeWith, reiData, rei, mapped, waist } from './bake.mjs';
import { prune } from './prune.mjs';
import { warpedPose } from './warp.mjs';
import { ual } from './bake.mjs';
import { makePose, keyed, mirror } from './author.mjs';
const body = [['spine.001', 'x', 10], ['spine.003', 'x', 4], ['head', 'x', -22]];
// A: right hand high, left hand pulling at shoulder height; left knee up and out, right leg long.
export const A = [
  ...body,
  ['upper_arm.R', 'z', -162], ['upper_arm.R', 'x', 25], ['forearm.R', 'z', -12], ['forearm.R', 'x', 15],
  ['upper_arm.L', 'z', 70], ['upper_arm.L', 'x', -25], ['forearm.L', 'z', 100], ['forearm.L', 'x', 30],
  ['thigh.L', 'x', -65], ['thigh.L', 'z', 40], ['shin.L', 'x', 95], ['foot.L', 'x', -10],
  ['thigh.R', 'x', -20], ['thigh.R', 'z', -15], ['shin.R', 'x', 35], ['foot.R', 'x', -15],
];
export const pA = makePose({ edits: A }), pB = makePose({ edits: mirror(A) });
if (process.argv[5] !== 'lib') {
  const loop = keyed([{ at: 0, pose: pA }, { at: 0.5, pose: pB }, { at: 1, pose: pA }]);
  const reach = s => [[`upper_arm.${s}`, 'z', s === 'R' ? -162 : 162], [`upper_arm.${s}`, 'x', 25], [`forearm.${s}`, 'z', s === 'R' ? -12 : 12], [`forearm.${s}`, 'x', 15]];
  const m0 = makePose({ edits: [...body, ...reach('R'), ...reach('L'), ['thigh.L', 'x', -30], ['thigh.L', 'z', 15], ['shin.L', 'x', 50], ['thigh.R', 'x', -15], ['thigh.R', 'z', -10], ['shin.R', 'x', 35], ['foot.L', 'x', -20], ['foot.R', 'x', -20]] });
  const m1 = makePose({ edits: [['spine.001', 'x', 35], ['spine.003', 'x', 10], ['upper_arm.L', 'x', -30], ['upper_arm.R', 'x', -30], ['forearm.L', 'x', -15], ['forearm.R', 'x', -15],
    ['thigh.L', 'x', -105], ['thigh.L', 'z', 15], ['shin.L', 'x', 125], ['foot.L', 'x', -10], ['thigh.R', 'x', 15], ['shin.R', 'x', 45], ['foot.R', 'x', 20]], hipsDY: -0.12 });
  const m2 = makePose({ edits: [['spine.001', 'x', 28], ['spine.003', 'x', 8], ['head', 'x', -15], ['upper_arm.L', 'x', -40], ['upper_arm.R', 'x', -40], ['forearm.L', 'x', -25], ['forearm.R', 'x', -25],
    ['thigh.L', 'x', -95], ['thigh.L', 'z', 10], ['shin.L', 'x', 120], ['foot.L', 'x', -25], ['thigh.R', 'x', -70], ['thigh.R', 'z', -10], ['shin.R', 'x', 110], ['foot.R', 'x', -40]], hipsDY: -0.38 });
  const m3 = makePose({});
  const mantle = keyed([{ at: 0, pose: m0 }, { at: 0.38, pose: m1 }, { at: 0.68, pose: m2 }, { at: 1, pose: m3 }]);
  // Gathering. Source-time segments laid end to end, with a short crossfade where they jump.
  const lerpPose = (a, b, w) => a.map((n, i) => ({ t: n.t.clone().lerp(b[i].t, w), r: n.r.clone().slerp(b[i].r, w), s: n.s.clone() }));
  const sequence = (src, segs, fade = 0.08) => {
    const total = segs.reduce((n, s) => n + s.len, 0);
    return (u) => {
      let t = u * total;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        if (t <= s.len || i === segs.length - 1) {
          const f = Math.min(1, t / s.len), pose = ual.sample(src, s.from + (s.to - s.from) * f);
          const next = segs[i + 1];
          if (next && s.len - t < fade / 2) return lerpPose(pose, ual.sample(src, next.from), 0.5 - (s.len - t) / fade);
          const prev = segs[i - 1];
          if (prev && t < fade / 2) return lerpPose(ual.sample(src, prev.to), pose, 0.5 + t / fade);
          return pose;
        }
        t -= s.len;
      }
    };
  };
  // Kneel, work at the ground a moment, stand back up (1.7 s); reach out and take something (1.1 s).
  const kneel = sequence('Fixing_Kneeling', [{ from: 0, to: 0.65, len: 0.5 }, { from: 0.65, to: 1.25, len: 0.45 }, { from: 4.25, to: 5.167, len: 0.75 }]);
  const pick = sequence('Interact', [{ from: 0, to: 2.0, len: 1 }]);
  // Two-handed overhead chop (hatchet or pick), as a loop: wind up, strike, settle, wind up.
  // The game aims the tool's haft from the same key times (CHOP_KEYS in src/client/player/tools.ts).
  // A forward lean swings hanging arms backwards (they turn with the chest), so the arm pitches
  // here are larger than the angles you see.
  const windup = makePose({ edits: [
    ['spine.001', 'x', -8], ['spine.003', 'y', -18], ['head', 'x', -6],
    ['upper_arm.R', 'x', -175], ['upper_arm.R', 'z', 10], ['forearm.R', 'x', -28],
    ['upper_arm.L', 'x', -168], ['upper_arm.L', 'z', 26], ['forearm.L', 'x', -38],
    ['thigh.L', 'x', -12], ['shin.L', 'x', 12], ['thigh.R', 'x', 6],
  ] });
  const legs = [['thigh.L', 'x', -22], ['shin.L', 'x', 28], ['thigh.R', 'x', 10], ['shin.R', 'x', 20], ['foot.R', 'x', -10]];
  const strike = makePose({ edits: [
    ['spine.001', 'x', 26], ['spine.003', 'x', 10], ['spine.003', 'y', 6], ['head', 'x', 10],
    ['upper_arm.R', 'x', -108], ['upper_arm.R', 'y', 20], ['forearm.R', 'x', -22],
    ['upper_arm.L', 'x', -106], ['upper_arm.L', 'y', -20], ['forearm.L', 'x', -24], ...legs,
  ], hipsDY: -0.07 });
  const settle = makePose({ edits: [
    ['spine.001', 'x', 30], ['spine.003', 'x', 10], ['spine.003', 'y', 4], ['head', 'x', 8],
    ['upper_arm.R', 'x', -100], ['upper_arm.R', 'y', 20], ['forearm.R', 'x', -22],
    ['upper_arm.L', 'x', -98], ['upper_arm.L', 'y', -20], ['forearm.L', 'x', -24], ...legs,
  ], hipsDY: -0.08 });
  const chop = keyed([{ at: 0, pose: windup }, { at: 0.3, pose: strike }, { at: 0.5, pose: settle }, { at: 1, pose: windup }]);
  const gait = (name, src) => bakeClip(name, null, { pose: warpedPose(src), duration: ual.duration(src) / 1.25, label: `${src}, retimed for steady foot contact` });
  const clips = [gait('walk', 'Walk_Loop'), gait('run', 'Sprint_Loop'), gait('jog', 'Jog_Fwd_Loop'), bakeClip('roll', 'Roll'), bakeClip('climb', null, { pose: loop, duration: 1.0, label: 'authored wall climb' }), bakeClip('climbup', null, { pose: mantle, duration: 0.9, label: 'authored pull-up' }),
    bakeClip('gather', null, { pose: kneel, duration: 1.7, label: 'Fixing_Kneeling, cut to kneel, work and stand' }),
    bakeClip('pick', null, { pose: pick, duration: 1.1, label: 'Interact, quickened' }),
    bakeClip('chop', null, { pose: chop, duration: 0.9, label: 'authored two-handed chop' })];
  // The old 'climb' (a 1 m vault) keeps its keys under a new name.
  const old = reiData.json.animations.find(a => a.name === 'climb'); if (old) old.name = 'vault';
  console.log('pruned', prune(rei, reiData.json, new Set(mapped.keys()), waist));
  console.log(writeWith(clips));
}
