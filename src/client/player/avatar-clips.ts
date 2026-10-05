import { blend1D, sampleClamped, sampleCyclic, type Keys } from './anim-math';

/**
 * Authored animation data for the trainer: the pose channel layout, keyframed locomotion cycles
 * (walk / jog / sprint), the idle pose, fidget clips and the static key poses used for jumps,
 * landings, skids and exhaustion. Values are hand-keyed like an animator would block them;
 * curves between keys use auto-clamped tangents (see sampleCyclic).
 *
 * Conventions (avatar body space: +Y up, +Z forward, +X the character's left):
 * - pelvis/spine/chest/head pitch: + bends forward; yaw: + turns left; roll: + raises the left side.
 * - Limb channels are authored for the left limb and mirrored for the right:
 *   foot X + is outward, foot Z + forward, foot Y is the lift of the heel/ball pivot above the
 *   ground, foot pitch + is toes up, foot yaw + is toe-out, knee out + points the knee outward.
 *   arm swing + is forward, arm out + is abduction, twist + is internal rotation, elbow + bends,
 *   wrist bend + tips the hand forward, clavicle raise + shrugs, clavicle fwd + rolls forward.
 */

// ---------------------------------------------------------------------------------------------
// Channel layout
// ---------------------------------------------------------------------------------------------
export const CH = {
  pelvisX: 0,
  pelvisY: 1,
  pelvisZ: 2,
  pelvisPitch: 3,
  pelvisYaw: 4,
  pelvisRoll: 5,
  spinePitch: 6,
  spineYaw: 7,
  spineRoll: 8,
  chestPitch: 9,
  chestYaw: 10,
  chestRoll: 11,
  headPitch: 12,
  headYaw: 13,
  headRoll: 14,
} as const;
export const BODY_CHANNELS = 15;

/** Per-leg channel offsets. */
export const LEG = { x: 0, y: 1, z: 2, pitch: 3, yaw: 4, knee: 5 } as const;
export const LEG_CHANNELS = 6;
/** Per-arm channel offsets. */
export const ARM = { clavRaise: 0, clavFwd: 1, swing: 2, out: 3, twist: 4, elbow: 5, wrist: 6, wristSide: 7 } as const;
export const ARM_CHANNELS = 8;

export const LEG_L = BODY_CHANNELS;
export const LEG_R = LEG_L + LEG_CHANNELS;
export const ARM_L = LEG_R + LEG_CHANNELS;
export const ARM_R = ARM_L + ARM_CHANNELS;
export const POSE_SIZE = ARM_R + ARM_CHANNELS;

export type Pose = Float64Array;
export function newPose(): Pose {
  return new Float64Array(POSE_SIZE);
}
export function addPose(out: Pose, p: Pose, w: number): void {
  if (w <= 0) return;
  for (let i = 0; i < POSE_SIZE; i++) out[i] += p[i] * w;
}
export function lerpPose(out: Pose, p: Pose, w: number): void {
  if (w <= 0) return;
  for (let i = 0; i < POSE_SIZE; i++) out[i] += (p[i] - out[i]) * w;
}

type LegName = keyof typeof LEG;
type ArmName = keyof typeof ARM;
type BodyName = keyof typeof CH;

/** A sparse static pose: body channels, plus left/right limb channels. */
export interface PoseDef {
  body?: Partial<Record<BodyName, number>>;
  legL?: Partial<Record<LegName, number>>;
  legR?: Partial<Record<LegName, number>>;
  armL?: Partial<Record<ArmName, number>>;
  armR?: Partial<Record<ArmName, number>>;
}

/** Bake a sparse pose on top of a base pose (unset channels keep the base values). */
export function bakePose(def: PoseDef, base?: Pose): Pose {
  const p = base ? new Float64Array(base) : newPose();
  for (const [k, v] of Object.entries(def.body ?? {})) p[CH[k as BodyName]] = v as number;
  for (const [k, v] of Object.entries(def.legL ?? {})) p[LEG_L + LEG[k as LegName]] = v as number;
  for (const [k, v] of Object.entries(def.legR ?? {})) p[LEG_R + LEG[k as LegName]] = v as number;
  for (const [k, v] of Object.entries(def.armL ?? {})) p[ARM_L + ARM[k as ArmName]] = v as number;
  for (const [k, v] of Object.entries(def.armR ?? {})) p[ARM_R + ARM[k as ArmName]] = v as number;
  return p;
}

/** Swap left and right (limb channels swap sides, lateral body channels flip sign). */
export function mirrorPose(src: Pose, out: Pose = newPose()): Pose {
  const tmp = new Float64Array(src);
  out.set(tmp);
  for (const ch of [CH.pelvisX, CH.pelvisYaw, CH.pelvisRoll, CH.spineYaw, CH.spineRoll, CH.chestYaw, CH.chestRoll, CH.headYaw, CH.headRoll]) out[ch] = -tmp[ch];
  for (let i = 0; i < LEG_CHANNELS; i++) {
    out[LEG_L + i] = tmp[LEG_R + i];
    out[LEG_R + i] = tmp[LEG_L + i];
  }
  for (let i = 0; i < ARM_CHANNELS; i++) {
    out[ARM_L + i] = tmp[ARM_R + i];
    out[ARM_R + i] = tmp[ARM_L + i];
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Locomotion cycles
// ---------------------------------------------------------------------------------------------

/**
 * One gait of the locomotion blend space. Phase u ∈ [0, 1) is the left leg's cycle with u = 0
 * at left heel contact; the right limbs play the same curves half a cycle later, mirrored.
 * Foot curves (`lift`, `footPitch`) are keyed in warped phase (stance 0..0.5, swing 0.5..1) so
 * contacts stay locked together when gaits with different duty factors blend.
 */
export interface Gait {
  name: string;
  /** Ground speed (m/s) this gait is authored for: its position in the blend space. */
  speed: number;
  /** Distance covered by one full cycle (two steps), metres. */
  cycleLen: number;
  /** Fraction of the cycle each foot is on the ground. */
  duty: number;
  /** Swing curve tangent scales: follow-through after toe-off and reach before contact. */
  liftTan: number;
  reachTan: number;
  /** Static leg settings: stance width offset, toe-out, knee pole. */
  footX: number;
  footYaw: number;
  kneeOut: number;
  /** Shifts the whole foot cycle forward/back relative to the hips. */
  footZ: number;
  lift: Keys;
  footPitch: Keys;
  /** Body tracks keyed in u. */
  body: Partial<Record<BodyName, Keys | number>>;
  /** Left-arm tracks keyed in u (right arm plays them at u + 0.5). */
  arm: Partial<Record<ArmName, Keys | number>>;
}

export const WALK: Gait = {
  name: 'walk',
  speed: 1.4,
  cycleLen: 1.12,
  duty: 0.6,
  liftTan: 0.25,
  reachTan: 0.3,
  footX: 0.012,
  footYaw: 0.12,
  kneeOut: 0.06,
  footZ: -0.02,
  // Toe clearance stays low; the foot skims forward.
  lift: [
    [0, 0],
    [0.5, 0],
    [0.58, 0.03],
    [0.7, 0.07],
    [0.84, 0.055],
    [0.95, 0.012],
  ],
  // Heel strike, foot flat, heel peel, toe-off, toes swing through and lift for the next strike.
  footPitch: [
    [0, 0.3],
    [0.07, 0.0],
    [0.3, 0.0],
    [0.5, -0.78],
    [0.6, -0.62],
    [0.76, -0.08],
    [0.92, 0.26],
  ],
  body: {
    // Lowest just after contact (weight acceptance), highest at the up pose.
    pelvisY: [
      [0, -0.022],
      [0.1, -0.04],
      [0.34, -0.004],
      [0.5, -0.022],
      [0.6, -0.04],
      [0.84, -0.004],
    ],
    pelvisX: [
      [0.24, 0.02],
      [0.74, -0.02],
    ],
    pelvisPitch: 0.04,
    pelvisYaw: [
      [0.02, -0.12],
      [0.52, 0.12],
    ],
    // Hip of the stance leg rises, the swing side drops.
    pelvisRoll: [
      [0, 0.0],
      [0.12, 0.05],
      [0.36, 0.015],
      [0.5, 0.0],
      [0.62, -0.05],
      [0.86, -0.015],
    ],
    spinePitch: 0.02,
    spineYaw: [
      [0.04, 0.09],
      [0.54, -0.09],
    ],
    spineRoll: [
      [0.14, -0.03],
      [0.64, 0.03],
    ],
    chestPitch: 0.0,
    chestYaw: [
      [0.06, 0.1],
      [0.56, -0.1],
    ],
    chestRoll: [
      [0.16, -0.015],
      [0.66, 0.015],
    ],
    headPitch: 0.02,
  },
  arm: {
    // Swing lags the opposite leg slightly (drag), elbow and wrist lag further (follow-through).
    swing: [
      [0.06, -0.34],
      [0.33, 0.0],
      [0.58, 0.38],
      [0.84, 0.02],
    ],
    out: 0.1,
    twist: 0.12,
    elbow: [
      [0.1, 0.18],
      [0.4, 0.38],
      [0.64, 0.6],
      [0.9, 0.3],
    ],
    wrist: [
      [0.2, -0.14],
      [0.45, 0.04],
      [0.7, 0.16],
      [0.96, -0.04],
    ],
    clavRaise: [
      [0.08, -0.01],
      [0.6, 0.03],
    ],
    clavFwd: [
      [0.08, -0.03],
      [0.6, 0.04],
    ],
  },
};

export const JOG: Gait = {
  name: 'jog',
  speed: 4.5,
  cycleLen: 2.36,
  duty: 0.32,
  liftTan: 0.5,
  reachTan: 0.42,
  footX: -0.012,
  footYaw: 0.06,
  kneeOut: 0.07,
  footZ: -0.04,
  // Heel kicks up behind after toe-off, then the foot is carried forward under the knee.
  lift: [
    [0, 0],
    [0.5, 0],
    [0.6, 0.15],
    [0.72, 0.26],
    [0.85, 0.15],
    [0.95, 0.035],
  ],
  footPitch: [
    [0, 0.14],
    [0.08, 0.0],
    [0.24, 0.0],
    [0.5, -0.95],
    [0.62, -1.15],
    [0.8, -0.35],
    [0.93, 0.12],
  ],
  body: {
    // Down at mid-stance, up in the flight phase.
    pelvisY: [
      [0, -0.045],
      [0.14, -0.08],
      [0.4, -0.018],
      [0.5, -0.045],
      [0.64, -0.08],
      [0.9, -0.018],
    ],
    pelvisX: [
      [0.16, 0.012],
      [0.66, -0.012],
    ],
    pelvisPitch: 0.09,
    pelvisYaw: [
      [0.03, -0.16],
      [0.53, 0.16],
    ],
    pelvisRoll: [
      [0.1, 0.045],
      [0.36, 0.0],
      [0.6, -0.045],
      [0.86, 0.0],
    ],
    spinePitch: 0.07,
    spineYaw: [
      [0.05, 0.13],
      [0.55, -0.13],
    ],
    spineRoll: [
      [0.12, -0.03],
      [0.62, 0.03],
    ],
    chestPitch: 0.05,
    chestYaw: [
      [0.07, 0.14],
      [0.57, -0.14],
    ],
    chestRoll: [
      [0.14, -0.02],
      [0.64, 0.02],
    ],
    headPitch: 0.0,
  },
  arm: {
    swing: [
      [0.06, -0.62],
      [0.31, 0.02],
      [0.56, 0.7],
      [0.81, 0.06],
    ],
    out: 0.21,
    twist: 0.32,
    elbow: [
      [0.08, 1.05],
      [0.32, 1.22],
      [0.58, 1.6],
      [0.84, 1.3],
    ],
    wrist: [
      [0.2, -0.1],
      [0.7, 0.12],
    ],
    clavRaise: [
      [0.08, -0.01],
      [0.58, 0.05],
    ],
    clavFwd: [
      [0.08, -0.04],
      [0.58, 0.07],
    ],
  },
};

export const SPRINT: Gait = {
  name: 'sprint',
  speed: 8,
  cycleLen: 3.3,
  duty: 0.25,
  liftTan: 0.6,
  reachTan: 0.5,
  footX: -0.02,
  footYaw: 0.03,
  kneeOut: 0.06,
  footZ: -0.03,
  lift: [
    [0, 0],
    [0.5, 0],
    [0.6, 0.22],
    [0.71, 0.37],
    [0.84, 0.24],
    [0.95, 0.05],
  ],
  // Forefoot strike, big plantar flexion at toe-off.
  footPitch: [
    [0, 0.04],
    [0.1, 0.0],
    [0.24, -0.08],
    [0.5, -1.05],
    [0.62, -1.3],
    [0.8, -0.3],
    [0.93, 0.06],
  ],
  body: {
    pelvisY: [
      [0, -0.05],
      [0.12, -0.085],
      [0.38, -0.01],
      [0.5, -0.05],
      [0.62, -0.085],
      [0.88, -0.01],
    ],
    pelvisX: [
      [0.12, 0.008],
      [0.62, -0.008],
    ],
    pelvisPitch: 0.13,
    pelvisYaw: [
      [0.03, -0.14],
      [0.53, 0.14],
    ],
    pelvisRoll: [
      [0.08, 0.04],
      [0.33, 0.0],
      [0.58, -0.04],
      [0.83, 0.0],
    ],
    spinePitch: 0.13,
    spineYaw: [
      [0.05, 0.15],
      [0.55, -0.15],
    ],
    spineRoll: [
      [0.1, -0.025],
      [0.6, 0.025],
    ],
    chestPitch: 0.07,
    chestYaw: [
      [0.07, 0.16],
      [0.57, -0.16],
    ],
    chestRoll: [
      [0.12, -0.02],
      [0.62, 0.02],
    ],
    headPitch: -0.02,
  },
  arm: {
    swing: [
      [0.05, -0.92],
      [0.3, 0.04],
      [0.55, 1.02],
      [0.8, 0.08],
    ],
    out: 0.19,
    twist: 0.28,
    elbow: [
      [0.07, 1.2],
      [0.31, 1.42],
      [0.57, 1.78],
      [0.83, 1.4],
    ],
    wrist: [
      [0.2, -0.12],
      [0.7, 0.1],
    ],
    clavRaise: [
      [0.07, -0.01],
      [0.57, 0.07],
    ],
    clavFwd: [
      [0.07, -0.05],
      [0.57, 0.09],
    ],
  },
};

export const GAITS: readonly Gait[] = [WALK, JOG, SPRINT];
export const GAIT_SPEEDS: readonly number[] = GAITS.map((g) => g.speed);

/** Blended stride parameters for the current speed. */
export interface StrideParams {
  cycleLen: number;
  duty: number;
  liftTan: number;
  reachTan: number;
  footX: number;
  footYaw: number;
  kneeOut: number;
  footZ: number;
}

/** Shortest stride used as speed approaches zero (keeps cadence sane while starting/stopping). */
export const MIN_CYCLE_LEN = 0.5;

export function gaitWeights(speed: number, out: number[]): number[] {
  return blend1D(GAIT_SPEEDS, speed, out);
}

export function strideParams(speed: number, weights: readonly number[], out: StrideParams): StrideParams {
  out.cycleLen = out.duty = out.liftTan = out.reachTan = out.footX = out.footYaw = out.kneeOut = out.footZ = 0;
  for (let i = 0; i < GAITS.length; i++) {
    const w = weights[i];
    if (w <= 0) continue;
    const g = GAITS[i];
    out.cycleLen += g.cycleLen * w;
    out.duty += g.duty * w;
    out.liftTan += g.liftTan * w;
    out.reachTan += g.reachTan * w;
    out.footX += g.footX * w;
    out.footYaw += g.footYaw * w;
    out.kneeOut += g.kneeOut * w;
    out.footZ += g.footZ * w;
  }
  // Below the walk sample the stride shortens towards a shuffle instead of the cadence dropping to zero.
  const walk = GAITS[0];
  if (speed < walk.speed) out.cycleLen = MIN_CYCLE_LEN + (walk.cycleLen - MIN_CYCLE_LEN) * Math.max(0, speed / walk.speed);
  return out;
}

function track(v: Keys | number | undefined, u: number): number {
  if (v === undefined) return 0;
  return typeof v === 'number' ? v : sampleCyclic(v, u);
}

const BODY_KEYS = Object.keys(CH) as BodyName[];
const ARM_KEYS = Object.keys(ARM) as ArmName[];

/** Sample one gait's body and arm tracks at phase u, adding them with weight w into `out`. */
export function addGaitUpper(g: Gait, u: number, w: number, out: Pose): void {
  if (w <= 0) return;
  for (const k of BODY_KEYS) {
    const v = g.body[k];
    if (v !== undefined) out[CH[k]] += track(v, u) * w;
  }
  for (const k of ARM_KEYS) {
    const v = g.arm[k];
    if (v === undefined) continue;
    out[ARM_L + ARM[k]] += track(v, u) * w;
    out[ARM_R + ARM[k]] += track(v, u + 0.5) * w;
  }
}

/** Blended swing lift and foot pitch at warped phase w (see warpPhase). */
export function gaitFoot(weights: readonly number[], w: number, out: { lift: number; pitch: number }): { lift: number; pitch: number } {
  out.lift = 0;
  out.pitch = 0;
  for (let i = 0; i < GAITS.length; i++) {
    const k = weights[i];
    if (k <= 0) continue;
    out.lift += Math.max(0, sampleCyclic(GAITS[i].lift, w)) * k;
    out.pitch += sampleCyclic(GAITS[i].footPitch, w) * k;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Idle
// ---------------------------------------------------------------------------------------------

/** Relaxed standing pose; breathing, weight shifts and glances are layered on at runtime. */
export const IDLE: Pose = bakePose({
  body: { pelvisY: -0.018, pelvisPitch: 0.03, spinePitch: 0.015, chestPitch: -0.025, headPitch: 0.02 },
  legL: { x: 0.03, z: 0.03, yaw: 0.2, knee: 0.08 },
  legR: { x: 0.03, z: -0.035, yaw: 0.16, knee: 0.08 },
  armL: { out: 0.12, swing: 0.04, twist: 0.12, elbow: 0.24, wrist: 0.04, clavFwd: 0.02 },
  armR: { out: 0.12, swing: 0.0, twist: 0.12, elbow: 0.2, wrist: 0.06, clavFwd: 0.02 },
});

/** A one-shot clip: sparse channel tracks keyed in seconds, blended over the idle pose. */
export interface Clip {
  name: string;
  duration: number;
  /** Blend in/out times (s). */
  fadeIn: number;
  fadeOut: number;
  /** Channel index → keys (absolute values). */
  tracks: [number, Keys][];
  /** Channels added on top instead of replacing (e.g. head turns over the idle glance). */
  additive?: [number, Keys][];
  /** Time (s) at which the backpack gets a hitch impulse, if any. */
  packKick?: number;
}

export function sampleClip(c: Clip, t: number, out: Pose, w: number): void {
  if (w <= 0) return;
  for (const [ch, keys] of c.tracks) out[ch] += (sampleClamped(keys, t) - out[ch]) * w;
  if (c.additive) for (const [ch, keys] of c.additive) out[ch] += sampleClamped(keys, t) * w;
}

const L = (k: ArmName): number => ARM_L + ARM[k];
const R = (k: ArmName): number => ARM_R + ARM[k];

/** Glance left, hold, glance right, hold, back to centre. */
export const FIDGET_LOOK: Clip = {
  name: 'look',
  duration: 3.8,
  fadeIn: 0.25,
  fadeOut: 0.4,
  tracks: [],
  additive: [
    [
      CH.headYaw,
      [
        [0, 0],
        [0.45, 0.75],
        [1.35, 0.8],
        [1.95, -0.62],
        [2.9, -0.66],
        [3.5, 0],
      ],
    ],
    [
      CH.headPitch,
      [
        [0, 0],
        [0.45, -0.08],
        [1.35, -0.04],
        [1.7, 0.04],
        [1.95, -0.06],
        [2.9, -0.02],
        [3.5, 0],
      ],
    ],
    [
      CH.chestYaw,
      [
        [0, 0],
        [0.55, 0.18],
        [1.35, 0.2],
        [2.05, -0.16],
        [2.9, -0.17],
        [3.6, 0],
      ],
    ],
    [
      CH.pelvisX,
      [
        [0, 0],
        [0.6, 0.012],
        [2.1, -0.012],
        [3.6, 0],
      ],
    ],
  ],
};

/** Both hands grab the straps at the chest and hitch the backpack up. */
export const FIDGET_STRAPS: Clip = {
  name: 'straps',
  duration: 2.5,
  fadeIn: 0.3,
  fadeOut: 0.45,
  packKick: 1.02,
  tracks: [
    ...([L, R] as const).flatMap((S): [number, Keys][] => [
      [
        S('swing'),
        [
          [0, 0.02],
          [0.4, 0.42],
          [0.85, 0.46],
          [1.0, 0.55],
          [1.25, 0.44],
          [1.9, 0.42],
          [2.5, 0.02],
        ],
      ],
      [
        S('elbow'),
        [
          [0, 0.22],
          [0.4, 1.9],
          [0.85, 2.0],
          [1.0, 2.05],
          [1.25, 1.95],
          [1.9, 1.95],
          [2.5, 0.22],
        ],
      ],
      [
        S('out'),
        [
          [0, 0.12],
          [0.4, 0.0],
          [1.9, 0.0],
          [2.5, 0.12],
        ],
      ],
      [
        S('twist'),
        [
          [0, 0.12],
          [0.4, 0.62],
          [1.9, 0.62],
          [2.5, 0.12],
        ],
      ],
      [
        S('wrist'),
        [
          [0, 0.04],
          [0.4, -0.35],
          [1.9, -0.35],
          [2.5, 0.04],
        ],
      ],
      [
        S('clavRaise'),
        [
          [0, 0],
          [0.85, 0.0],
          [1.02, 0.14],
          [1.25, 0.02],
          [1.9, 0.0],
        ],
      ],
    ]),
  ],
  additive: [
    [
      CH.pelvisY,
      [
        [0, 0],
        [0.85, -0.02],
        [1.02, 0.018],
        [1.3, -0.005],
        [1.6, 0],
      ],
    ],
    [
      CH.headPitch,
      [
        [0, 0],
        [0.4, 0.2],
        [0.9, 0.12],
        [1.3, 0.0],
        [2.0, 0],
      ],
    ],
    [
      CH.chestPitch,
      [
        [0, 0],
        [0.85, 0.06],
        [1.02, -0.05],
        [1.4, 0],
      ],
    ],
  ],
};

/** Arms overhead, lean back, up on the toes, then a relaxed drop. */
export const FIDGET_STRETCH: Clip = {
  name: 'stretch',
  duration: 3.6,
  fadeIn: 0.35,
  fadeOut: 0.5,
  tracks: [
    ...([L, R] as const).flatMap((S): [number, Keys][] => [
      [
        S('swing'),
        [
          [0, 0.02],
          [0.6, 1.6],
          [1.0, 2.75],
          [2.3, 2.85],
          [2.9, 1.2],
          [3.6, 0.02],
        ],
      ],
      [
        S('elbow'),
        [
          [0, 0.22],
          [0.6, 1.3],
          [1.0, 0.75],
          [2.3, 0.62],
          [2.9, 0.9],
          [3.6, 0.22],
        ],
      ],
      [
        S('out'),
        [
          [0, 0.12],
          [1.0, 0.32],
          [2.3, 0.36],
          [2.9, 0.4],
          [3.6, 0.12],
        ],
      ],
      [
        S('twist'),
        [
          [0, 0.12],
          [1.0, 0.7],
          [2.3, 0.7],
          [3.6, 0.12],
        ],
      ],
      [
        S('wrist'),
        [
          [0, 0.04],
          [1.0, -0.5],
          [2.3, -0.55],
          [3.6, 0.04],
        ],
      ],
      [
        S('clavRaise'),
        [
          [0, 0],
          [1.0, 0.12],
          [2.3, 0.14],
          [2.9, -0.02],
          [3.6, 0],
        ],
      ],
    ]),
    [
      LEG_L + LEG.pitch,
      [
        [0, 0],
        [0.9, 0],
        [1.3, -0.32],
        [2.2, -0.34],
        [2.6, 0],
      ],
    ],
    [
      LEG_R + LEG.pitch,
      [
        [0, 0],
        [0.9, 0],
        [1.3, -0.32],
        [2.2, -0.34],
        [2.6, 0],
      ],
    ],
  ],
  additive: [
    [
      CH.spinePitch,
      [
        [0, 0],
        [1.1, -0.1],
        [2.3, -0.12],
        [2.9, 0.06],
        [3.6, 0],
      ],
    ],
    [
      CH.chestPitch,
      [
        [0, 0],
        [1.1, -0.12],
        [2.3, -0.14],
        [2.9, 0.05],
        [3.6, 0],
      ],
    ],
    [
      CH.headPitch,
      [
        [0, 0],
        [1.1, -0.3],
        [2.3, -0.34],
        [2.9, 0.1],
        [3.6, 0],
      ],
    ],
    [
      CH.pelvisY,
      [
        [0, 0],
        [1.3, 0.035],
        [2.2, 0.035],
        [2.6, -0.01],
        [3.0, 0],
      ],
    ],
    [
      CH.chestRoll,
      [
        [0, 0],
        [1.3, 0.0],
        [1.7, 0.06],
        [2.1, -0.05],
        [2.4, 0],
      ],
    ],
  ],
};

export const FIDGETS: readonly Clip[] = [FIDGET_LOOK, FIDGET_STRAPS, FIDGET_STRETCH];

/**
 * Overhand ball throw with the right arm: wind up behind the shoulder, whip forward, follow
 * through. The ball leaves the hand at about 0.38 s (THROW_RELEASE).
 */
export const THROW_RELEASE = 0.38;
export const GESTURE_THROW: Clip = {
  name: 'throw',
  duration: 1.15,
  fadeIn: 0.12,
  fadeOut: 0.3,
  tracks: [
    [R('swing'), [[0, 0], [0.24, -0.75], [0.3, -0.6], [0.38, 1.7], [0.52, 1.15], [0.8, 0.5], [1.15, 0]]],
    [R('elbow'), [[0, 0.2], [0.24, 1.55], [0.32, 1.1], [0.38, 0.2], [0.6, 0.35], [1.15, 0.2]]],
    [R('out'), [[0, 0.12], [0.24, 0.55], [0.38, 0.25], [0.7, 0.18], [1.15, 0.12]]],
    [R('twist'), [[0, 0.12], [0.24, -0.4], [0.38, 0.3], [1.15, 0.12]]],
    [L('swing'), [[0, 0.04], [0.24, 0.55], [0.38, -0.1], [0.7, 0.05], [1.15, 0.04]]],
    [L('elbow'), [[0, 0.24], [0.24, 0.7], [0.5, 0.4], [1.15, 0.24]]],
  ],
  additive: [
    [CH.chestYaw, [[0, 0], [0.24, -0.32], [0.4, 0.22], [0.8, 0.08], [1.15, 0]]],
    [CH.spinePitch, [[0, 0], [0.24, -0.05], [0.42, 0.12], [0.8, 0.04], [1.15, 0]]],
    [CH.pelvisZ, [[0, 0], [0.24, -0.03], [0.45, 0.04], [1.15, 0]]],
  ],
};

export const GESTURES = { throw: GESTURE_THROW } as const;
export type GestureName = keyof typeof GESTURES;

// ---------------------------------------------------------------------------------------------
// Key poses (static; blended by the state machine)
// ---------------------------------------------------------------------------------------------

/** Wind-up just before take-off: hips drop, arms swing back. */
export const JUMP_CROUCH: Pose = bakePose({
  body: { pelvisY: -0.13, pelvisZ: -0.03, pelvisPitch: 0.2, spinePitch: 0.16, chestPitch: 0.08, headPitch: -0.12 },
  legL: { x: 0.03, z: 0.02, yaw: 0.12, knee: 0.1 },
  legR: { x: 0.03, z: -0.02, yaw: 0.12, knee: 0.1 },
  armL: { swing: -0.75, out: 0.2, elbow: 0.35, twist: 0.1, wrist: -0.2 },
  armR: { swing: -0.75, out: 0.2, elbow: 0.35, twist: 0.1, wrist: -0.2 },
});

/** Standing jump going up: knees tucked, arms thrown up. */
export const AIR_RISE_STAND: Pose = bakePose({
  body: { pelvisY: 0.02, pelvisPitch: 0.06, spinePitch: -0.04, chestPitch: -0.06, headPitch: -0.12 },
  legL: { x: 0.03, y: 0.24, z: 0.08, pitch: -0.45, yaw: 0.1, knee: 0.12 },
  legR: { x: 0.03, y: 0.2, z: -0.02, pitch: -0.55, yaw: 0.1, knee: 0.12 },
  armL: { swing: 1.55, out: 0.45, elbow: 0.55, twist: 0.3, wrist: 0.1, clavRaise: 0.1 },
  armR: { swing: 1.35, out: 0.5, elbow: 0.7, twist: 0.3, wrist: 0.1, clavRaise: 0.1 },
});

/** Running jump going up, left leg leading: a bounding stride. */
export const AIR_RISE_RUN: Pose = bakePose({
  body: { pelvisY: 0.0, pelvisPitch: 0.12, pelvisYaw: -0.12, spinePitch: 0.06, spineYaw: 0.12, chestYaw: 0.1, headPitch: -0.08 },
  legL: { x: 0.0, y: 0.34, z: 0.24, pitch: 0.05, yaw: 0.05, knee: 0.08 },
  legR: { x: -0.01, y: 0.2, z: -0.4, pitch: -1.0, yaw: 0.05, knee: 0.05 },
  armL: { swing: -0.7, out: 0.25, elbow: 0.7, twist: 0.2 },
  armR: { swing: 1.05, out: 0.2, elbow: 1.35, twist: 0.35, clavRaise: 0.06 },
});

/** Top of the arc: legs gather, arms open for balance. */
export const AIR_APEX: Pose = bakePose({
  body: { pelvisY: 0.0, pelvisPitch: 0.06, spinePitch: 0.02, chestPitch: -0.02, headPitch: 0.06 },
  legL: { x: 0.03, y: 0.2, z: 0.12, pitch: -0.2, yaw: 0.1, knee: 0.12 },
  legR: { x: 0.03, y: 0.24, z: -0.12, pitch: -0.55, yaw: 0.1, knee: 0.12 },
  armL: { swing: 0.45, out: 0.85, elbow: 0.55, twist: 0.4, wrist: 0.1 },
  armR: { swing: 0.25, out: 0.9, elbow: 0.45, twist: 0.4, wrist: 0.1 },
});

/** Coming down: legs reach for the ground, arms up and out. */
export const AIR_FALL: Pose = bakePose({
  body: { pelvisY: 0.0, pelvisPitch: 0.0, spinePitch: -0.05, chestPitch: -0.04, headPitch: 0.18 },
  legL: { x: 0.04, y: 0.05, z: 0.14, pitch: 0.12, yaw: 0.14, knee: 0.1 },
  legR: { x: 0.04, y: 0.12, z: -0.06, pitch: -0.3, yaw: 0.14, knee: 0.1 },
  armL: { swing: 0.5, out: 1.15, elbow: 0.55, twist: 0.45, wrist: 0.15, clavRaise: 0.08 },
  armR: { swing: 0.3, out: 1.2, elbow: 0.4, twist: 0.45, wrist: 0.15, clavRaise: 0.08 },
});

/** Hard landing: deep crouch, one hand reaching for the ground. Feet follow the ground. */
export const LAND_HEAVY: Pose = bakePose({
  body: { pelvisY: -0.3, pelvisZ: -0.05, pelvisPitch: 0.4, spinePitch: 0.25, chestPitch: 0.12, headPitch: -0.45, spineRoll: 0.06 },
  legL: { x: 0.07, z: 0.1, yaw: 0.25, knee: 0.22 },
  legR: { x: 0.06, z: -0.12, pitch: -0.4, yaw: 0.2, knee: 0.18 },
  armL: { swing: 0.35, out: 0.55, elbow: 0.9, twist: 0.3, wrist: 0.2 },
  armR: { swing: 0.95, out: 0.12, elbow: 0.15, twist: 0.1, wrist: -0.5, clavFwd: 0.1, clavRaise: -0.04 },
});

/** Sliding stop (feet are placed along the slide direction at runtime). */
export const SKID: Pose = bakePose({
  body: { pelvisY: -0.12, pelvisZ: -0.04, pelvisPitch: -0.02, pelvisYaw: 0.25, spinePitch: -0.04, spineYaw: 0.15, chestYaw: 0.12, headPitch: 0.05 },
  legL: { x: 0.02, z: 0.34, pitch: 0.42, yaw: 0.25, knee: 0.15 },
  legR: { x: 0.05, z: -0.22, pitch: -0.15, yaw: 0.35, knee: 0.25 },
  armL: { swing: 0.55, out: 0.65, elbow: 0.6, twist: 0.3, wrist: 0.15 },
  armR: { swing: -0.35, out: 0.75, elbow: 0.45, twist: 0.3, wrist: 0.15 },
});

/** Out of breath after a sprint: hands on knees. */
export const TIRED_STAND: Pose = bakePose({
  body: { pelvisY: -0.1, pelvisZ: -0.07, pelvisPitch: 0.42, spinePitch: 0.3, chestPitch: 0.16, headPitch: -0.55 },
  legL: { x: 0.06, z: 0.06, yaw: 0.22, knee: 0.2 },
  legR: { x: 0.06, z: -0.04, yaw: 0.2, knee: 0.2 },
  armL: { swing: 0.62, out: 0.02, elbow: 0.32, twist: 0.25, wrist: 0.45, clavRaise: 0.06, clavFwd: 0.1 },
  armR: { swing: 0.62, out: 0.02, elbow: 0.32, twist: 0.25, wrist: 0.45, clavRaise: 0.06, clavFwd: 0.1 },
});

/** Exhausted jog: slumped, arms loose, head hanging (applied as an overlay on the cycle). */
export const TIRED_MOVE = {
  spinePitch: 0.12,
  chestPitch: 0.14,
  headPitch: 0.28,
  pelvisY: -0.03,
  clavRaise: -0.05,
  armSwingScale: 0.5,
  elbow: 0.55,
  liftScale: 0.55,
  rollScale: 1.8,
};
