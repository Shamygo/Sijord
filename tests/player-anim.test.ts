import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  blend1D,
  footRoll,
  legCycleZ,
  sampleClamped,
  sampleCyclic,
  solveTwoBone,
  spring,
  stepSpring,
  warpPhase,
  type Keys,
  type LegZ,
} from '../src/client/player/anim-math';
import {
  CH,
  GAITS,
  GAIT_SPEEDS,
  LEG,
  LEG_L,
  LEG_R,
  gaitWeights,
  mirrorPose,
  newPose,
  strideParams,
  type StrideParams,
} from '../src/client/player/avatar-clips';
import { RIG, type Rig } from '../src/client/player/avatar-rig';
import { createAvatar } from '../src/client/player/avatar';
import { PlayerController } from '../src/client/player/controller';
import type { Avatar, MoveInput } from '../src/client/player/types';
import type { World } from '../src/client/world/types';
import { DEFAULT_APPEARANCE } from '../src/shared/types';

// ---------------------------------------------------------------------------------------------
// Pure maths
// ---------------------------------------------------------------------------------------------

function newStride(): StrideParams {
  return { cycleLen: 0, duty: 0, liftTan: 0, reachTan: 0, footX: 0, footYaw: 0, kneeOut: 0, footZ: 0 } as StrideParams;
}

/** End effector of a two-bone limb (bones along -Y, hinge about X) for a solved pose. */
function effector(q: THREE.Quaternion, a: number, b: number, lowerRotX: number): THREE.Vector3 {
  const lower = new THREE.Vector3(0, -b, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), lowerRotX);
  return new THREE.Vector3(0, -a, 0).add(lower).applyQuaternion(q);
}

describe('solveTwoBone', () => {
  const a = RIG.thigh;
  const b = RIG.shin;

  it('reaches reachable targets with the knee on the pole side', () => {
    const targets = [
      new THREE.Vector3(0, -0.7, 0.1),
      new THREE.Vector3(0.05, -0.5, -0.2),
      new THREE.Vector3(-0.1, -0.4, 0.35),
      new THREE.Vector3(0, -0.3, 0),
    ];
    const pole = new THREE.Vector3(0, 0, 1);
    for (const t of targets) {
      const q = new THREE.Quaternion();
      const r = solveTwoBone(t, pole, a, b, 1, q);
      const end = effector(q, a, b, r.bend);
      expect(end.distanceTo(t)).toBeLessThan(1e-4);
      expect(r.bend).toBeGreaterThanOrEqual(0);
      const knee = new THREE.Vector3(0, -a, 0).applyQuaternion(q);
      const dir = t.clone().normalize();
      const off = knee.clone().addScaledVector(dir, -knee.dot(dir));
      expect(off.dot(pole)).toBeGreaterThan(0);
    }
  });

  it('bends elbows the other way (bendSign -1)', () => {
    const t = new THREE.Vector3(0.05, -0.3, 0.12);
    const pole = new THREE.Vector3(0, 0, -1);
    const q = new THREE.Quaternion();
    const r = solveTwoBone(t, pole, RIG.upperArm, RIG.forearm, -1, q);
    const end = effector(q, RIG.upperArm, RIG.forearm, -r.bend);
    expect(end.distanceTo(t)).toBeLessThan(1e-4);
    const elbow = new THREE.Vector3(0, -RIG.upperArm, 0).applyQuaternion(q);
    expect(elbow.z).toBeLessThan(t.z * (RIG.upperArm / t.length()));
  });

  it('extends straight towards unreachable targets without NaN', () => {
    const t = new THREE.Vector3(0, -2, 0.5);
    const q = new THREE.Quaternion();
    const r = solveTwoBone(t, new THREE.Vector3(0, 0, 1), a, b, 1, q);
    expect(r.reach).toBeGreaterThan(1);
    expect(r.bend).toBeLessThan(0.1);
    const end = effector(q, a, b, r.bend);
    expect(end.clone().normalize().dot(t.clone().normalize())).toBeGreaterThan(0.9999);
    // Degenerate inputs stay finite.
    const r2 = solveTwoBone(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), a, b, 1, q);
    expect(Number.isFinite(r2.bend)).toBe(true);
    expect([q.x, q.y, q.z, q.w].every(Number.isFinite)).toBe(true);
  });
});

describe('keyframe curves', () => {
  const keys: Keys = [
    [0, 0],
    [0.25, 1],
    [0.5, 0.2],
    [0.75, -1],
  ];

  it('sampleCyclic passes through keys, wraps, and never overshoots', () => {
    for (const [t, v] of keys) expect(sampleCyclic(keys, t)).toBeCloseTo(v, 9);
    expect(sampleCyclic(keys, 1.25)).toBeCloseTo(1, 9);
    expect(sampleCyclic(keys, -0.25)).toBeCloseTo(-1, 9);
    // Continuous across the wrap.
    expect(Math.abs(sampleCyclic(keys, 0.9999) - sampleCyclic(keys, 0))).toBeLessThan(1e-3);
    for (let u = 0; u < 1; u += 0.01) {
      const v = sampleCyclic(keys, u);
      expect(v).toBeLessThanOrEqual(1 + 1e-9);
      expect(v).toBeGreaterThanOrEqual(-1 - 1e-9);
    }
  });

  it('sampleClamped holds the end values and stays monotone between monotone keys', () => {
    const k: Keys = [
      [0, 0],
      [0.2, 0.1],
      [0.6, 0.9],
      [1, 1],
    ];
    expect(sampleClamped(k, -1)).toBe(0);
    expect(sampleClamped(k, 3)).toBe(1);
    let prev = -Infinity;
    for (let t = 0; t <= 1; t += 0.01) {
      const v = sampleClamped(k, t);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = v;
    }
  });
});

describe('blend space', () => {
  it('weights sum to 1 with at most two active samples', () => {
    const s = [1.4, 4.5, 8];
    for (let x = 0; x < 10; x += 0.37) {
      const w = blend1D(s, x);
      expect(w.reduce((p, c) => p + c, 0)).toBeCloseTo(1, 12);
      expect(w.filter((v) => v > 0).length).toBeLessThanOrEqual(2);
      expect(w.every((v) => v >= 0)).toBe(true);
    }
    expect(blend1D(s, 4.5)[1]).toBeCloseTo(1);
    const w = blend1D(s, 3);
    expect(w[0]).toBeCloseTo((4.5 - 3) / (4.5 - 1.4), 12);
    expect(w[2]).toBe(0);
  });

  it('gait stride parameters match the authored gaits at their speeds and plant the feet', () => {
    expect(GAIT_SPEEDS.length).toBe(GAITS.length);
    for (let i = 0; i < GAITS.length; i++) {
      const w = gaitWeights(GAIT_SPEEDS[i], []);
      expect(w[i]).toBeCloseTo(1);
      const p = strideParams(GAIT_SPEEDS[i], w, newStride());
      expect(p.cycleLen).toBeCloseTo(GAITS[i].cycleLen, 6);
      expect(p.duty).toBeCloseTo(GAITS[i].duty, 6);
    }
    // In between, stride length grows with speed (cadence and stride both rise).
    let prev = 0;
    for (let v = 1.4; v <= 8; v += 0.5) {
      const p = strideParams(v, gaitWeights(v, []), newStride());
      expect(p.cycleLen).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = p.cycleLen;
    }
  });
});

describe('stride cycle', () => {
  it('warpPhase maps stance to [0, 0.5) and swing to [0.5, 1)', () => {
    expect(warpPhase(0, 0.3)).toBe(0);
    expect(warpPhase(0.3, 0.3)).toBeCloseTo(0.5);
    expect(warpPhase(0.15, 0.3)).toBeCloseTo(0.25);
    expect(warpPhase(0.65, 0.3)).toBeCloseTo(0.75);
    expect(warpPhase(1.15, 0.3)).toBeCloseTo(0.25);
  });

  it('legCycleZ moves the stance foot back at constant speed and is continuous', () => {
    const duty = 0.4;
    const sweep = 0.8;
    const out: LegZ = { z: 0, stance: true, t: 0 };
    const du = 1e-4;
    // Stance: dz/du = -sweep/duty everywhere.
    for (let u = 0.01; u < duty - 0.01; u += 0.05) {
      const z0 = legCycleZ(u, duty, sweep, 1, 1, out).z;
      const z1 = legCycleZ(u + du, duty, sweep, 1, 1, out).z;
      expect(out.stance).toBe(true);
      expect((z1 - z0) / du).toBeCloseTo(-sweep / duty, 4);
    }
    // Continuity at contact and toe-off, including velocity matching (tangent scale 1).
    for (const u of [duty, 1]) {
      const a = legCycleZ(u - du, duty, sweep, 1, 1, out).z;
      const b = legCycleZ(u + du, duty, sweep, 1, 1, out).z;
      expect(Math.abs(b - a)).toBeLessThan(1e-3);
      const va = (a - legCycleZ(u - 2 * du, duty, sweep, 1, 1, out).z) / du;
      const vb = (legCycleZ(u + 2 * du, duty, sweep, 1, 1, out).z - b) / du;
      expect(vb).toBeCloseTo(va, 1);
    }
    // Swing travels forwards overall.
    expect(legCycleZ(duty + 0.01, duty, sweep, 1, 1, out).stance).toBe(false);
    expect(legCycleZ(0.99, duty, sweep, 1, 1, out).z).toBeGreaterThan(0);
  });

  it('footRoll keeps the heel / ball pivot fixed on the ground', () => {
    const { ankleH, heelBack, ballFwd } = RIG;
    const out = { z: 0, y: 0 };
    for (const pitch of [-0.8, -0.3, 0, 0.2, 0.5]) {
      footRoll(pitch, ankleH, heelBack, ballFwd, out);
      // Pivot in foot space (relative to the ankle) before rotation.
      const pz = pitch >= 0 ? -heelBack : ballFwd;
      const c = Math.cos(pitch);
      const s = Math.sin(pitch);
      // Rotate the foot-space pivot (pz, -ankleH) by pitch (toes up positive) and add the ankle.
      const wz = out.z + pz * c + ankleH * s;
      const wy = out.y + pz * s - ankleH * c;
      expect(wy).toBeCloseTo(0, 9);
      expect(wz).toBeCloseTo(pz, 9);
    }
    footRoll(0, ankleH, heelBack, ballFwd, out);
    expect(out.z).toBeCloseTo(0, 12);
    expect(out.y).toBeCloseTo(ankleH, 12);
  });

  it('mirrorPose swaps legs and negates lateral channels', () => {
    const p = newPose();
    p[LEG_L + LEG.x] = 0.1;
    p[LEG_L + LEG.z] = 0.3;
    p[LEG_R + LEG.z] = -0.2;
    p[CH.pelvisYaw] = 0.2;
    p[CH.pelvisPitch] = 0.1;
    const m = mirrorPose(p);
    expect(m[LEG_R + LEG.z]).toBeCloseTo(0.3);
    expect(m[LEG_L + LEG.z]).toBeCloseTo(-0.2);
    expect(m[LEG_R + LEG.x]).toBeCloseTo(0.1);
    expect(m[CH.pelvisYaw]).toBeCloseTo(-0.2);
    expect(m[CH.pelvisPitch]).toBeCloseTo(0.1);
  });
});

describe('springs', () => {
  it('stepSpring settles the same at 30, 60 and 144 fps', () => {
    const run = (fps: number): number[] => {
      const s = spring(0);
      const out: number[] = [];
      const dt = 1 / fps;
      let t = 0;
      // Marks on frame boundaries for every rate (1/6 s = 5, 10 and 24 frames).
      for (const mark of [1 / 6, 2 / 6, 3 / 6, 1]) {
        while (t + 1e-9 < mark) {
          stepSpring(s, 1, 12, 0.45, dt);
          t += dt;
        }
        out.push(s.x);
      }
      return out;
    };
    const a = run(30);
    const b = run(60);
    const c = run(144);
    for (let i = 0; i < a.length; i++) {
      expect(Math.abs(a[i] - b[i])).toBeLessThan(0.005);
      expect(Math.abs(b[i] - c[i])).toBeLessThan(0.005);
    }
    // Under-damped: overshoots, then settles.
    expect(Math.max(...b)).toBeGreaterThan(1);
    expect(b[3]).toBeCloseTo(1, 2);
  });
});

// ---------------------------------------------------------------------------------------------
// Avatar integration (controller -> avatar, as the game drives it)
// ---------------------------------------------------------------------------------------------

function fakeWorld(heightAt: (x: number, z: number) => number = () => 0): World {
  return {
    root: new THREE.Object3D(),
    heightAt,
    waterLevel: -50,
    colliders: [],
    regions: [],
    anchors: {
      playerSpawns: [new THREE.Vector3(), new THREE.Vector3()],
      playerSpawnYaw: [0, 0],
      professor: new THREE.Vector3(),
      professorYaw: 0,
      landmarks: [],
    },
    halfSize: 500,
    sun: new THREE.DirectionalLight(),
    update: () => {},
    groundColorAt: () => new THREE.Color(),
  } as World;
}

interface Sim {
  avatar: Avatar;
  rig: Rig;
  controller: PlayerController;
  world: World;
  t: number;
  step(dt: number, input: MoveInput): void;
}

function makeSim(heightAt?: (x: number, z: number) => number, withGround = true): Sim {
  const world = fakeWorld(heightAt);
  const avatar = createAvatar(DEFAULT_APPEARANCE);
  if (withGround) avatar.setGround(world.heightAt);
  const controller = new PlayerController();
  controller.teleport(new THREE.Vector3(0, world.heightAt(0, 0), 0), 0);
  const rig = (avatar as unknown as { rig: Rig }).rig;
  const sim: Sim = {
    avatar,
    rig,
    controller,
    world,
    t: 0,
    step(dt, input) {
      controller.update(dt, input, 0, world);
      avatar.root.position.copy(controller.position);
      avatar.root.rotation.y = controller.yaw;
      avatar.animate(dt, controller.snapshot());
      avatar.root.updateMatrixWorld(true);
      sim.t += dt;
    },
  };
  return sim;
}

const NONE: MoveInput = { forward: 0, right: 0, sprint: false, jump: false };
const FWD: MoveInput = { forward: 1, right: 0, sprint: false, jump: false };
const SPRINT: MoveInput = { forward: 1, right: 0, sprint: true, jump: false };

function allFinite(root: THREE.Object3D): boolean {
  let ok = true;
  root.traverse((o) => {
    const v = [o.position.x, o.position.y, o.position.z, o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w, o.scale.x, o.scale.y, o.scale.z];
    if (!v.every(Number.isFinite)) ok = false;
  });
  return ok;
}

const _p = new THREE.Vector3();
function ankle(rig: Rig, side: 'L' | 'R'): THREE.Vector3 {
  return (side === 'L' ? rig.legL : rig.legR).foot.getWorldPosition(new THREE.Vector3());
}

describe('avatar', () => {
  it('keeps stance feet planted while jogging (no foot skating)', () => {
    const sim = makeSim();
    const dt = 1 / 60;
    while (sim.t < 2) sim.step(dt, FWD);
    // Steady jog: track each foot while it is on the ground.
    for (const side of ['L', 'R'] as const) {
      let run: THREE.Vector3[] = [];
      let worst = 0;
      let runs = 0;
      const flush = (): void => {
        if (run.length >= 3) {
          runs++;
          // The ankle may roll over the heel / ball a little; the drift of a planted foot along
          // the ground must stay tiny compared to the ~0.9 m covered by the body meanwhile.
          let drift = 0;
          for (const p of run) drift = Math.max(drift, Math.hypot(p.x - run[0].x, p.z - run[0].z));
          worst = Math.max(worst, drift);
        }
        run = [];
      };
      for (let i = 0; i < 180; i++) {
        sim.step(dt, FWD);
        const p = ankle(sim.rig, side);
        // Flat-footed on the ground: ankle at rest height.
        if (p.y < RIG.ankleH + 0.006) run.push(p);
        else flush();
      }
      flush();
      expect(runs).toBeGreaterThanOrEqual(3);
      expect(worst).toBeLessThan(0.02);
    }
  });

  it('keeps the head level and facing forward through a sprint', () => {
    const sim = makeSim();
    const dt = 1 / 60;
    const up = new THREE.Vector3();
    const fwd = new THREE.Vector3();
    const q = new THREE.Quaternion();
    let minUp = 1;
    let minFwd = 1;
    while (sim.t < 4) {
      sim.step(dt, SPRINT);
      if (sim.t < 1.5) continue;
      sim.rig.head.getWorldQuaternion(q);
      up.set(0, 1, 0).applyQuaternion(q);
      fwd.set(0, 0, 1).applyQuaternion(q);
      minUp = Math.min(minUp, up.y);
      minFwd = Math.min(minFwd, fwd.z);
    }
    expect(minUp).toBeGreaterThan(Math.cos(0.12));
    expect(minFwd).toBeGreaterThan(Math.cos(0.12));
    expect(allFinite(sim.avatar.root)).toBe(true);
  });

  it('animates the same at 30, 60 and 144 fps', () => {
    const script = (t: number): MoveInput => (t < 0.5 ? NONE : t < 2.5 ? SPRINT : t < 3.2 ? NONE : FWD);
    const sample = (fps: number): number[] => {
      const sim = makeSim();
      const dt = 1 / fps;
      const out: number[] = [];
      for (const mark of [1.0, 2.0, 2.8, 3.4, 4.0]) {
        while (sim.t + 1e-9 < mark) sim.step(dt, script(sim.t));
        const head = sim.rig.head.getWorldPosition(new THREE.Vector3()).sub(sim.controller.position);
        const pelvis = sim.rig.pelvis.getWorldPosition(new THREE.Vector3()).sub(sim.controller.position);
        out.push(head.y, head.z, pelvis.y);
      }
      return out;
    };
    const a = sample(30);
    const b = sample(60);
    const c = sample(144);
    for (let i = 0; i < b.length; i++) {
      expect(Math.abs(a[i] - b[i])).toBeLessThan(0.035);
      expect(Math.abs(c[i] - b[i])).toBeLessThan(0.035);
    }
  });

  it('plants the feet on a slope with setGround', () => {
    const slope = Math.tan((20 * Math.PI) / 180);
    const h = (x: number): number => slope * x;
    const sim = makeSim((x) => h(x));
    const dt = 1 / 60;
    // Walk across the slope (along +Z, so one foot is uphill), then stop and stand.
    let maxPen = 0;
    while (sim.t < 3) {
      sim.step(dt, FWD);
      for (const side of ['L', 'R'] as const) {
        const p = ankle(sim.rig, side);
        maxPen = Math.max(maxPen, h(p.x) + RIG.ankleH * 0.6 - p.y);
      }
    }
    expect(maxPen).toBeLessThan(0.02);
    while (sim.t < 6) sim.step(dt, NONE);
    for (const side of ['L', 'R'] as const) {
      const p = ankle(sim.rig, side);
      const above = p.y - h(p.x);
      expect(above).toBeGreaterThan(RIG.ankleH * 0.9);
      expect(above).toBeLessThan(RIG.ankleH * 1.15);
    }
    // The uphill foot (+X side is the avatar's left when facing +Z) stands higher.
    expect(ankle(sim.rig, 'L').y).toBeGreaterThan(ankle(sim.rig, 'R').y + 0.03);
  });

  it('jumps and lands without NaNs, with a landing squash', () => {
    const sim = makeSim();
    const dt = 1 / 60;
    while (sim.t < 1) sim.step(dt, FWD);
    const standingPelvis = sim.rig.pelvis.position.y;
    sim.step(dt, { ...FWD, jump: true });
    let minPelvis = Infinity;
    let wasAir = false;
    let landedAt = -1;
    while (sim.t < 3) {
      sim.step(dt, NONE);
      const air = !sim.controller.grounded;
      if (air) wasAir = true;
      if (wasAir && !air && landedAt < 0) landedAt = sim.t;
      if (landedAt > 0 && sim.t < landedAt + 0.3) minPelvis = Math.min(minPelvis, sim.rig.pelvis.position.y);
      expect(allFinite(sim.avatar.root)).toBe(true);
    }
    expect(wasAir).toBe(true);
    expect(landedAt).toBeGreaterThan(0);
    expect(minPelvis).toBeLessThan(standingPelvis - 0.02);
  });

  it('animates in place without world info (creator / professor usage)', () => {
    const avatar = createAvatar(DEFAULT_APPEARANCE);
    const rig = (avatar as unknown as { rig: Rig }).rig;
    for (let i = 0; i < 600; i++) {
      avatar.root.rotation.y += 0.01;
      avatar.animate(1 / 60, { speed: 0, anim: 'idle' });
    }
    avatar.animate(0, { speed: 0, anim: 'idle' });
    avatar.root.updateMatrixWorld(true);
    expect(allFinite(avatar.root)).toBe(true);
    for (const leg of [rig.legL, rig.legR]) {
      leg.foot.getWorldPosition(_p);
      expect(_p.y).toBeGreaterThan(RIG.ankleH * 0.7);
      expect(_p.y).toBeLessThan(RIG.ankleH * 1.6);
    }
    // Speed-only input still runs a cycle.
    for (let i = 0; i < 120; i++) avatar.animate(1 / 60, { speed: 4.5, anim: 'run' });
    expect(allFinite(avatar.root)).toBe(true);
    avatar.setAppearance({ ...DEFAULT_APPEARANCE, hairStyle: 3, build: 1 });
    avatar.animate(1 / 60, { speed: 0, anim: 'idle' });
    expect(allFinite(avatar.root)).toBe(true);
    avatar.dispose();
  });

  it('survives teleports, huge and zero time steps', () => {
    const sim = makeSim();
    sim.step(1 / 60, FWD);
    sim.step(0, FWD);
    sim.step(0.5, SPRINT);
    sim.controller.teleport(new THREE.Vector3(200, 0, -300), 2);
    sim.step(1 / 60, NONE);
    for (let i = 0; i < 30; i++) sim.step(1 / 144, FWD);
    expect(allFinite(sim.avatar.root)).toBe(true);
    const p = ankle(sim.rig, 'L');
    expect(Math.hypot(p.x - sim.controller.position.x, p.z - sim.controller.position.z)).toBeLessThan(1);
  });
});
