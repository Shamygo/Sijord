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
  const gait = (name, src) => bakeClip(name, null, { pose: warpedPose(src), duration: ual.duration(src) / 1.25, label: `${src}, retimed for steady foot contact` });
  const clips = [gait('walk', 'Walk_Loop'), gait('run', 'Sprint_Loop'), gait('jog', 'Jog_Fwd_Loop'), bakeClip('roll', 'Roll'), bakeClip('climb', null, { pose: loop, duration: 1.0, label: 'authored wall climb' }), bakeClip('climbup', null, { pose: mantle, duration: 0.9, label: 'authored pull-up' })];
  // The old 'climb' (a 1 m vault) keeps its keys under a new name.
  const old = reiData.json.animations.find(a => a.name === 'climb'); if (old) old.name = 'vault';
  console.log('pruned', prune(rei, reiData.json, new Set(mapped.keys()), waist));
  console.log(writeWith(clips));
}
