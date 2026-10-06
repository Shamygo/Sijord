import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WildManager } from '../src/client/overworld/wild';
import type { World } from '../src/client/world/types';
import { catchChance } from '../src/shared/battle/catch';
import { SPECIES } from '../src/shared/data/species';
import {
  BALL_FLIGHT, ballSpeed, canCatch, launchElevation, launchVelocity, newBall, predictArc, stepBall, type StepEnv,
} from '../src/client/overworld/ball-flight';
import { aggroChance, failedCatchReaction, isUnaware, WILD_VIEW_HALF_ANGLE } from '../src/shared/overworld-catch';
import { chargeDamage, knockdownTilt, TRAINER_HP, TrainerVitals, trainerMaxHp } from '../src/shared/trainer-vitals';

const flat: StepEnv = { ground: () => 0 };
const DEFAULT_PITCH = (14 * Math.PI) / 180;

/** Fly a ball until it first touches something other than air. */
function firstContact(env: StepEnv, from: { x: number; y: number; z: number }, vel: { x: number; y: number; z: number }) {
  const b = newBall(from, vel);
  for (let i = 0; i < 10000; i++) if (stepBall(b, env) !== 'fly') break;
  return b;
}

/** Fly a ball until it rests or sinks. */
function settle(env: StepEnv, from: { x: number; y: number; z: number }, vel: { x: number; y: number; z: number }) {
  const b = newBall(from, vel);
  const results: string[] = [];
  for (let i = 0; i < 20000 && !b.resting && !b.sunk; i++) results.push(stepBall(b, env));
  return { b, results };
}

describe('overworld ball flight', () => {
  it('launches along the aim yaw at the throw speed', () => {
    const north = launchVelocity(0, 0);
    expect(north.z).toBeCloseTo(BALL_FLIGHT.speed);
    expect(north.x).toBeCloseTo(0);
    const left = launchVelocity(Math.PI / 2, 0.5);
    expect(left.x).toBeGreaterThan(0);
    expect(Math.hypot(left.x, left.y, left.z)).toBeCloseTo(BALL_FLIGHT.speed);
  });

  it('throws higher when looking up and flatter when looking down, within limits', () => {
    expect(launchElevation(DEFAULT_PITCH, DEFAULT_PITCH)).toBeCloseTo(BALL_FLIGHT.baseElevation);
    expect(launchElevation(DEFAULT_PITCH - 0.3, DEFAULT_PITCH)).toBeGreaterThan(BALL_FLIGHT.baseElevation);
    expect(launchElevation(DEFAULT_PITCH + 0.3, DEFAULT_PITCH)).toBeLessThan(BALL_FLIGHT.baseElevation);
    expect(launchElevation(-5, DEFAULT_PITCH)).toBe(BALL_FLIGHT.maxElevation);
    expect(launchElevation(5, DEFAULT_PITCH)).toBe(BALL_FLIGHT.minElevation);
  });

  it('a default throw lobs a sensible distance; a 45 degree throw goes about as far as the physics says', () => {
    const from = { x: 0, y: 1.45, z: 0 };
    const mid = firstContact(flat, from, launchVelocity(0, launchElevation(DEFAULT_PITCH, DEFAULT_PITCH)));
    expect(mid.z).toBeGreaterThan(9);
    expect(mid.z).toBeLessThan(17);
    const v = BALL_FLIGHT.speed * Math.SQRT1_2;
    const g = BALL_FLIGHT.gravity;
    const h = from.y - BALL_FLIGHT.radius;
    const t = (v + Math.sqrt(v * v + 2 * g * h)) / g;
    const far = firstContact(flat, from, launchVelocity(0, Math.PI / 4));
    expect(far.z).toBeCloseTo(v * t, 0);
  });

  it('the aim preview lands exactly where the real ball first touches down', () => {
    const hill: StepEnv = { ground: (x, z) => Math.sin(x * 0.2) * 1.5 + z * 0.08 };
    const from = { x: 2, y: 3, z: -4 };
    const vel = launchVelocity(0.4, 0.35);
    const preview = predictArc(from, vel, hill, undefined, { maxTime: 5 });
    const real = firstContact(hill, from, vel);
    expect(preview.end.x).toBeCloseTo(real.x, 6);
    expect(preview.end.y).toBeCloseTo(real.y, 6);
    expect(preview.end.z).toBeCloseTo(real.z, 6);
    expect(preview.points.length).toBeGreaterThan(5);
  });

  it('stops the preview at the first target it would hit', () => {
    const vel = launchVelocity(0, 0.3);
    const p = predictArc({ x: 0, y: 1.4, z: 0 }, vel, flat, (b) => (b.z > 5 ? 0 : -1));
    expect(p.hit).toBe(0);
    expect(p.end.z).toBeGreaterThan(5);
    expect(p.end.z).toBeLessThan(5.3);
  });

  it('bounces, rolls to a stop and only catches while still flying', () => {
    const { b, results } = settle(flat, { x: 0, y: 1.45, z: 0 }, launchVelocity(0, 0.4));
    expect(results.filter((r) => r === 'bounce').length).toBeGreaterThanOrEqual(1);
    expect(b.resting).toBe(true);
    expect(b.y).toBeCloseTo(BALL_FLIGHT.radius);
    expect(ballSpeed(b)).toBe(0);
    expect(canCatch(b)).toBe(false);
    const first = firstContact(flat, { x: 0, y: 1.45, z: 0 }, launchVelocity(0, 0.4));
    // The ball goes further than its first bounce: a miss doesn't stop dead.
    expect(b.z).toBeGreaterThan(first.z + 0.5);
    const air = newBall({ x: 0, y: 2, z: 0 }, launchVelocity(0, 0));
    expect(canCatch(air)).toBe(true);
    air.bounces = 2;
    expect(canCatch(air)).toBe(false);
  });

  it('rolls down a steep slope but soon settles on a gentle one', () => {
    const steep: StepEnv = { ground: (x) => -x * 0.6 };
    const rolled = settle(steep, { x: 0, y: 0.5, z: 0 }, { x: 0, y: -1, z: 0 }).b;
    expect(rolled.x).toBeGreaterThan(2);
    const gentle: StepEnv = { ground: (x) => -x * 0.1 };
    const thrown = settle(gentle, { x: 0, y: 1.45, z: 0 }, launchVelocity(Math.PI / 2, 0.4));
    expect(thrown.b.resting).toBe(true);
    expect(thrown.b.t).toBeLessThan(5);
    // Rolled on after its bounces, but nowhere near a runaway.
    expect(thrown.b.x).toBeLessThan(26);
  });

  it('is lost in deep water', () => {
    const lake: StepEnv = { ground: (_x, z) => (z > 6 ? -3 : 0), waterLevel: -0.5 };
    const { b, results } = settle(lake, { x: 0, y: 1.45, z: 0 }, launchVelocity(0, 0.5));
    expect(b.sunk).toBe(true);
    expect(results.at(-1)).toBe('sink');
  });

  it('glances back off a wall', () => {
    const wall: StepEnv = { ground: () => 0, push: (x, z) => ({ x, z: Math.min(z, 4) }) };
    const b = newBall({ x: 0, y: 1.5, z: 0 }, launchVelocity(0, 0.2));
    for (let i = 0; i < 200 && b.vz > 0; i++) stepBall(b, wall);
    expect(b.vz).toBeLessThan(0);
    expect(b.z).toBeLessThanOrEqual(4);
  });
});

describe('wild awareness', () => {
  const grazing = { state: 'graze', alert: 0, x: 0, z: 0, yaw: 0 };
  it('is unaware of a trainer behind it', () => {
    expect(isUnaware({ ...grazing, px: 0, pz: -6 })).toBe(true);
    expect(isUnaware({ ...grazing, px: 3, pz: -6 })).toBe(true);
  });
  it('notices a trainer in front or to the side', () => {
    expect(isUnaware({ ...grazing, px: 0, pz: 6 })).toBe(false);
    expect(isUnaware({ ...grazing, px: 6, pz: 0 })).toBe(false);
    const edge = WILD_VIEW_HALF_ANGLE - 0.05;
    expect(isUnaware({ ...grazing, px: Math.sin(edge) * 5, pz: Math.cos(edge) * 5 })).toBe(false);
  });
  it('stays aware while alert, watching, fleeing or angry', () => {
    expect(isUnaware({ ...grazing, alert: 3, px: 0, pz: -6 })).toBe(false);
    for (const state of ['watch', 'flee', 'charge', 'attack', 'startle']) expect(isUnaware({ ...grazing, state, px: 0, pz: -6 })).toBe(false);
    expect(isUnaware({ ...grazing, state: 'wander', px: 0, pz: -6 })).toBe(true);
  });
  it('a sneaking trainer is unnoticed even from the front', () => {
    expect(isUnaware({ ...grazing, px: 0, pz: 6, crouched: true })).toBe(true);
  });
});

describe('failed-catch aggression', () => {
  it('follows the DESIGN §5.3 aggro chances', () => {
    expect(aggroChance('skittish', 0)).toBeCloseTo(0.05);
    expect(aggroChance('docile', -5)).toBeCloseTo(0.1);
    expect(aggroChance('territorial', 3)).toBeCloseTo(0.52);
    expect(aggroChance('aggressive', 50)).toBe(0.95);
  });
  it('skittish flee, docile back off, territorial fight, aggressive charge', () => {
    expect(failedCatchReaction('skittish', 0, 0.5, true)).toBe('flee');
    expect(failedCatchReaction('docile', 0, 0.5, true)).toBe('startle');
    expect(failedCatchReaction('territorial', 0, 0.99, true)).toBe('battle');
    expect(failedCatchReaction('aggressive', 0, 0.99, true)).toBe('charge');
  });
  it('a bad roll makes even a timid creature turn and fight, more often when it outlevels you', () => {
    expect(failedCatchReaction('skittish', 0, 0.02, true)).toBe('battle');
    expect(failedCatchReaction('docile', 0, 0.2, true)).toBe('startle');
    expect(failedCatchReaction('docile', 5, 0.2, true)).toBe('battle');
  });
  it('charges a trainer whose team cannot battle instead of challenging them', () => {
    expect(failedCatchReaction('territorial', 0, 0.5, false)).toBe('charge');
    expect(failedCatchReaction('skittish', 0, 0.01, false)).toBe('charge');
    expect(failedCatchReaction('skittish', 0, 0.9, false)).toBe('flee');
  });
});

describe('overworld catch odds stay hard', () => {
  const wild = Object.values(SPECIES);
  it('a throw at a full-HP creature that has noticed you usually fails', () => {
    for (const sp of wild) {
      const p = catchChance({ maxHp: 30, hp: 30, catchRate: sp.catchRate, ball: 'poke-ball', level: 6, partyLevel: 6, cap: 15, throw: 'overworld' });
      expect(p, sp.id).toBeLessThan(0.35);
    }
  });
  it('sneaking up pays off, most on easy, low-level creatures', () => {
    const base = { maxHp: 20, hp: 20, catchRate: 255, ball: 'poke-ball', level: 3, partyLevel: 6, cap: 15 } as const;
    const seen = catchChance({ ...base, throw: 'overworld' });
    const unaware = catchChance({ ...base, throw: 'unaware' });
    expect(unaware).toBeGreaterThan(seen * 1.8);
    expect(unaware).toBeGreaterThan(0.5);
    expect(catchChance({ ...base, level: 12, throw: 'unaware' })).toBeLessThan(0.4);
  });
});

describe('trainer HP and knockdown', () => {
  it('max HP is 100 plus 2 a level, scaled by class', () => {
    expect(trainerMaxHp()).toBe(100);
    expect(trainerMaxHp(5)).toBe(108);
    expect(trainerMaxHp(1, 0.9)).toBe(90);
  });

  it('a charge hurts by level, never trivially, and armour softens it', () => {
    expect(chargeDamage(2)).toBe(TRAINER_HP.minDamage);
    expect(chargeDamage(12)).toBe(24);
    expect(chargeDamage(12, 80, 100)).toBe(12);
  });

  it('a hit knocks down, then guards briefly against a second', () => {
    const v = new TrainerVitals(100);
    expect(v.hit(20)).toBe('down');
    expect(v.hp).toBe(80);
    expect(v.knockedDown).toBe(true);
    expect(v.hit(20)).toBe('ignored');
    v.update(TRAINER_HP.knockdown + 0.01, true);
    expect(v.knockedDown).toBe(false);
    expect(v.hit(20)).toBe('ignored');
    v.update(TRAINER_HP.guard, true);
    expect(v.hit(20)).toBe('down');
    expect(v.hp).toBe(60);
  });

  it('at 0 HP the trainer is out', () => {
    const v = new TrainerVitals(30);
    expect(v.hit(50)).toBe('out');
    expect(v.hp).toBe(0);
    v.update(100, false);
    expect(v.hp).toBe(0);
    v.restore();
    expect(v.hp).toBe(30);
    expect(v.knockedDown).toBe(false);
  });

  it('regenerates slowly, only once nothing has hit or threatened it for a while', () => {
    const v = new TrainerVitals(100, 50);
    v.sinceHit = 0;
    v.update(TRAINER_HP.regenDelay - 1, false);
    expect(v.hp).toBe(50);
    v.update(2, false);
    expect(v.hp).toBeGreaterThan(50);
    expect(v.hp).toBeLessThan(52);
    v.update(1, true);
    const held = v.hp;
    v.update(TRAINER_HP.regenDelay - 1, false);
    expect(v.hp).toBe(held);
    for (let i = 0; i < 1000; i++) v.update(1, false);
    expect(v.hp).toBe(100);
    expect(v.full).toBe(true);
  });

  it('healing is capped at max HP', () => {
    const v = new TrainerVitals(100, 90);
    expect(v.heal(TRAINER_HP.potionHeal)).toBe(10);
    expect(v.hp).toBe(100);
  });

  it('the knockdown pose falls, lies flat and gets back up', () => {
    expect(knockdownTilt(0)).toBe(0);
    expect(knockdownTilt(0.1)).toBeGreaterThan(0);
    expect(knockdownTilt(0.2)).toBeGreaterThan(knockdownTilt(0.1));
    expect(knockdownTilt(0.8)).toBe(1);
    expect(knockdownTilt(TRAINER_HP.knockdown - 0.2)).toBeLessThan(1);
    expect(knockdownTilt(TRAINER_HP.knockdown)).toBe(0);
  });
});

describe('wild reactions in the overworld', () => {
  function setup(speciesId = 'hjordpup') {
    const world = fakeWorld();
    const wild = new WildManager(world, 7);
    const herd = wild.spawnHerd(0, 10, speciesId, 6);
    const m = herd.members[0];
    m.mover.place(0, 10, world, Math.PI);
    m.root.position.copy(m.mover.pos);
    return { world, wild, herd, m };
  }
  const step = (wild: WildManager, player: THREE.Vector3, seconds: number, each?: () => void) => {
    for (let t = 0; t < seconds; t += 1 / 60) {
      wild.update(1 / 60, player, 0, false, false);
      each?.();
    }
  };

  it('a furious creature closes in, winds up and lunges into a trainer who stands still', () => {
    const { wild, m } = setup();
    const player = new THREE.Vector3(0, 0, 0);
    wild.breakOut(m, 'charge');
    expect(m.state).toBe('attack');
    let hits = 0;
    let sawWindup = false;
    step(wild, player, 5, () => {
      if (m.attack?.phase === 'windup') sawWindup = true;
      hits += wild.consumeHits().length;
    });
    expect(sawWindup).toBe(true);
    expect(hits).toBeGreaterThanOrEqual(1);
    expect(wild.attacking).toBe(true);
  });

  it('the lunge is aimed when the wind-up ends, so a sidestep dodges it', () => {
    const { wild, m } = setup();
    const player = new THREE.Vector3(0, 0, 0);
    wild.breakOut(m, 'charge');
    let hits = 0;
    let dodgedAt = -1;
    let t = 0;
    step(wild, player, 6, () => {
      t += 1 / 60;
      if (dodgedAt < 0 && m.attack?.phase === 'lunge') {
        // Step well to the side the moment it commits.
        player.x += 2.6;
        dodgedAt = t;
      }
      // The whole lunge and its recovery: no second lunge can start in this window.
      const n = wild.consumeHits().length;
      if (dodgedAt >= 0 && t - dodgedAt < 1) hits += n;
    });
    expect(dodgedAt).toBeGreaterThan(0);
    expect(hits).toBe(0);
    // Standing still for the same lunge would have hurt (checked in the test above).
  });

  it('gives up once the trainer leaves its territory', () => {
    const { wild, m } = setup();
    wild.breakOut(m, 'charge');
    step(wild, new THREE.Vector3(0, 0, -60), 0.5);
    expect(m.state).toBe('graze');
    expect(m.alert).toBeGreaterThan(0);
  });

  it('a skittish creature that breaks out bolts with its skittish herd-mates', () => {
    const { wild, herd, m } = setup('nibblet');
    wild.breakOut(m, 'flee');
    expect(m.state).toBe('flee');
    for (const o of herd.members) expect(o.state).toBe('flee');
    expect(m.alert).toBeGreaterThan(0);
  });

  it('a startled creature backs away from the trainer, then settles', () => {
    const { wild, m } = setup('cocoonch');
    const player = new THREE.Vector3(0, 0, 4);
    wild.breakOut(m, 'startle');
    const before = m.mover.pos.distanceTo(player);
    step(wild, player, 1.2);
    expect(m.state).toBe('startle');
    expect(m.mover.pos.distanceTo(player)).toBeGreaterThan(before + 0.5);
    step(wild, player, 3);
    expect(m.state).not.toBe('startle');
  });

  it('a creature held in a ball cannot be battled and does not move', () => {
    const { wild, m } = setup();
    wild.hold(m);
    const at = m.mover.pos.clone();
    step(wild, new THREE.Vector3(0, 0, 8), 1);
    expect(m.mover.pos.distanceTo(at)).toBe(0);
    expect(wild.nearestEngageable(new THREE.Vector3(0, 0, 9))).not.toBe(m);
    wild.caught(m);
    step(wild, new THREE.Vector3(0, 0, 0), 0.1);
    expect(wild.creatures).not.toContain(m);
  });
});

function fakeWorld(): World {
  return {
    root: new THREE.Object3D(),
    heightAt: () => 0,
    waterLevel: -10,
    colliders: [],
    regions: [],
    anchors: { playerSpawns: [new THREE.Vector3(), new THREE.Vector3()], playerSpawnYaw: [0, 0], professor: new THREE.Vector3(), professorYaw: 0, landmarks: [] },
    halfSize: 500,
    sun: new THREE.DirectionalLight(),
    update: () => {},
    groundColorAt: () => new THREE.Color(),
  };
}
