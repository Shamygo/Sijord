import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PLAYER_TUNING, PlayerController } from '../src/client/player/controller';
import type { MoveInput } from '../src/client/player/types';
import type { Collider, World } from '../src/client/world/types';
import { colliderContains, colliderTop } from '../src/client/core/collision';

function fakeWorld(opts: { heightAt?: (x: number, z: number) => number; colliders?: Collider[]; waterLevel?: number } = {}): World {
  return {
    root: new THREE.Object3D(),
    heightAt: opts.heightAt ?? (() => 0),
    waterLevel: opts.waterLevel ?? -10,
    colliders: opts.colliders ?? [],
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
  };
}

const idle: MoveInput = { forward: 0, right: 0, sprint: false, jump: false };
const fwd: MoveInput = { forward: 1, right: 0, sprint: false, jump: false };
const sprint: MoveInput = { forward: 1, right: 0, sprint: true, jump: false };
const DT = 1 / 60;

function run(c: PlayerController, w: World, input: MoveInput, seconds: number, camYaw = 0): void {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) c.update(DT, input, camYaw, w);
}

function spawn(w: World, x = 0, z = 0, yaw = 0): PlayerController {
  const c = new PlayerController();
  c.teleport(new THREE.Vector3(x, w.heightAt(x, z), z), yaw);
  c.update(DT, idle, 0, w);
  return c;
}

describe('PlayerController', () => {
  it('accelerates over time rather than instantly', () => {
    const w = fakeWorld();
    const c = spawn(w);
    c.update(DT, fwd, 0, w);
    expect(c.horizontalSpeed).toBeGreaterThan(0);
    expect(c.horizontalSpeed).toBeLessThan(PLAYER_TUNING.walkSpeed * 0.5);
    run(c, w, fwd, 0.1);
    expect(c.horizontalSpeed).toBeLessThan(PLAYER_TUNING.walkSpeed);
  });

  it('reaches walk speed and moves camera-relative', () => {
    const w = fakeWorld();
    const c = spawn(w);
    run(c, w, fwd, 1.5);
    expect(c.horizontalSpeed).toBeCloseTo(PLAYER_TUNING.walkSpeed, 2);
    expect(c.position.z).toBeGreaterThan(4);
    expect(Math.abs(c.position.x)).toBeLessThan(1e-6);
    expect(c.snapshot().anim).toBe('walk');

    // Camera yawed 90° (looking along +X): forward input now moves along +X, and the
    // character turns to face it.
    const c2 = spawn(w);
    run(c2, w, fwd, 1.5, Math.PI / 2);
    expect(c2.position.x).toBeGreaterThan(4);
    expect(c2.yaw).toBeCloseTo(Math.PI / 2, 2);
    // Right input with camera at yaw 0 moves towards -X (screen right).
    const c3 = spawn(w);
    run(c3, w, { ...idle, right: 1 }, 1);
    expect(c3.position.x).toBeLessThan(-2);
  });

  it('reaches sprint speed and reports the run animation', () => {
    const w = fakeWorld();
    const c = spawn(w);
    run(c, w, sprint, 2.5);
    expect(c.horizontalSpeed).toBeCloseTo(PLAYER_TUNING.sprintSpeed, 2);
    expect(c.snapshot().anim).toBe('run');
  });

  it('decelerates over time, carrying a little momentum', () => {
    const w = fakeWorld();
    const c = spawn(w);
    run(c, w, sprint, 2);
    const z0 = c.position.z;
    c.update(DT, idle, 0, w);
    expect(c.horizontalSpeed).toBeGreaterThan(PLAYER_TUNING.sprintSpeed * 0.8);
    run(c, w, idle, 0.15);
    expect(c.horizontalSpeed).toBeGreaterThan(0);
    run(c, w, idle, 1.5);
    expect(c.horizontalSpeed).toBe(0);
    const slide = c.position.z - z0;
    expect(slide).toBeGreaterThan(0.8);
    expect(slide).toBeLessThan(4);
    expect(c.snapshot().anim).toBe('idle');
  });

  it('turns smoothly towards the move direction, not instantly', () => {
    const w = fakeWorld();
    const c = spawn(w, 0, 0, 0);
    c.update(DT, { ...idle, forward: -1 }, 0, w);
    const yaw1 = Math.abs(c.yaw);
    expect(yaw1).toBeGreaterThan(0);
    expect(yaw1).toBeLessThanOrEqual((PLAYER_TUNING.turnRateMax * DT) + 1e-6);
    run(c, w, { ...idle, forward: -1 }, 1);
    expect(Math.abs(Math.abs(c.yaw) - Math.PI)).toBeLessThan(0.02);
  });

  it('collides with a box', () => {
    const w = fakeWorld({ colliders: [{ kind: 'box', minX: -2, maxX: 2, minZ: 5, maxZ: 6 }] });
    const c = spawn(w);
    run(c, w, sprint, 4);
    expect(c.position.z).toBeLessThanOrEqual(5 - PLAYER_TUNING.radius + 1e-3);
    expect(c.position.z).toBeGreaterThan(4);
    expect(c.horizontalSpeed).toBeLessThan(0.5);
  });

  it('cannot walk up a steep slope (it has to be climbed) but walks up a gentle one', () => {
    // 63° cliff starting at z = 5.
    const steep = fakeWorld({ heightAt: (_x, z) => Math.max(0, z - 5) * 2 });
    const c = spawn(steep);
    run(c, steep, sprint, 4);
    expect(c.climbing).toBe(true);
    expect(c.position.y).toBeLessThan(PLAYER_TUNING.climbSpeed * 3.5);
    expect(c.position.z).toBeLessThan(5 + c.position.y / 2);

    // 20° ramp: climbs fine.
    const gentle = fakeWorld({ heightAt: (_x, z) => Math.max(0, z - 5) * Math.tan((20 * Math.PI) / 180) });
    const g = spawn(gentle);
    run(g, gentle, fwd, 4);
    expect(g.position.z).toBeGreaterThan(12);
    expect(g.position.y).toBeCloseTo(gentle.heightAt(g.position.x, g.position.z), 3);
    expect(g.grounded).toBe(true);
  });

  it('slides back down when standing on a too-steep slope', () => {
    const steep = fakeWorld({ heightAt: (_x, z) => Math.max(0, z - 5) * 2 });
    const c = new PlayerController();
    c.teleport(new THREE.Vector3(0, steep.heightAt(0, 7), 7), 0);
    run(c, steep, idle, 2);
    expect(c.position.z).toBeLessThan(5.3);
    expect(c.position.y).toBeLessThan(0.6);
  });

  it('treats deep water as a wall', () => {
    const w = fakeWorld({ waterLevel: 0, heightAt: (_x, z) => (z > 5 ? -2 : 0.5) });
    const c = spawn(w);
    run(c, w, fwd, 3);
    expect(c.position.z).toBeLessThanOrEqual(5.01);
  });

  it('jumps and returns to the ground', () => {
    const w = fakeWorld();
    const c = spawn(w);
    c.update(DT, { ...idle, jump: true }, 0, w);
    expect(c.grounded).toBe(false);
    let peak = 0;
    let sawJump = false;
    let sawFall = false;
    for (let i = 0; i < 120; i++) {
      c.update(DT, idle, 0, w);
      peak = Math.max(peak, c.position.y);
      const a = c.snapshot().anim;
      sawJump ||= a === 'jump';
      sawFall ||= a === 'fall';
    }
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThan(2);
    expect(sawJump && sawFall).toBe(true);
    expect(c.grounded).toBe(true);
    expect(c.position.y).toBe(0);
    // Holding jump doesn't bunny-hop: it needs a fresh press.
    c.update(DT, { ...idle, jump: true }, 0, w);
    run(c, w, { ...idle, jump: true }, 1.2);
    expect(c.grounded).toBe(true);
  });

  it('buffers a jump pressed just before landing and allows coyote-time jumps', () => {
    const w = fakeWorld();
    const c = spawn(w);
    c.update(DT, { ...idle, jump: true }, 0, w);
    // Fall until just above the ground, then press jump again.
    for (let i = 0; i < 200 && !(c.velocity.y < 0 && c.position.y < 0.6); i++) c.update(DT, idle, 0, w);
    c.update(DT, { ...idle, jump: true }, 0, w);
    let rejumped = false;
    for (let i = 0; i < 20; i++) {
      c.update(DT, idle, 0, w);
      if (c.velocity.y > 5) rejumped = true;
    }
    expect(rejumped).toBe(true);

    // Coyote: run off a ledge and jump a few frames later.
    const ledge = fakeWorld({ heightAt: (_x, z) => (z < 2 ? 3 : 0) });
    const d = spawn(ledge);
    for (let i = 0; i < 300 && d.grounded; i++) d.update(DT, fwd, 0, ledge);
    expect(d.grounded).toBe(false);
    d.update(DT, { ...fwd, jump: true }, 0, ledge);
    expect(d.velocity.y).toBeGreaterThan(5);
  });

  it('drains stamina while sprinting, locks out when empty and regenerates', () => {
    const w = fakeWorld();
    const c = spawn(w);
    run(c, w, sprint, 1);
    expect(c.stamina).toBeLessThan(1);
    expect(c.stamina).toBeGreaterThan(0.6);
    run(c, w, sprint, 4.3); // ~5 s of sprint empties the bar
    expect(c.stamina).toBeLessThan(0.05);
    expect(c.exhausted).toBe(true);
    // Locked out: holding sprint only walks.
    run(c, w, sprint, 1);
    expect(c.exhausted).toBe(true);
    expect(c.horizontalSpeed).toBeLessThanOrEqual(PLAYER_TUNING.walkSpeed + 1e-6);
    const s0 = c.stamina;
    run(c, w, idle, 2);
    expect(c.stamina).toBeGreaterThan(s0 + 0.3);
    expect(c.exhausted).toBe(false);
    run(c, w, idle, 5);
    expect(c.stamina).toBe(1);
  });

  it('is stable under dt spikes (sub-stepping and dt cap)', () => {
    const w = fakeWorld({ colliders: [{ kind: 'box', minX: -2, maxX: 2, minZ: 5, maxZ: 5.3 }] });
    const c = spawn(w);
    for (let i = 0; i < 20; i++) c.update(0.5, sprint, 0, w);
    expect(c.position.z).toBeLessThanOrEqual(5 - PLAYER_TUNING.radius + 1e-3);
    expect(Number.isFinite(c.position.x)).toBe(true);
  });

  it('stays inside the map bounds', () => {
    const w = { ...fakeWorld(), halfSize: 10 };
    const c = spawn(w);
    run(c, w, sprint, 5);
    expect(c.position.z).toBeLessThanOrEqual(10);
  });
});

describe('climbing',()=>{
  function ladderWorld():World {
    const world=fakeWorld();world.climbs=[{id:'lookout',bottom:{x:0,y:0,z:0},top:{x:0,y:4.8,z:0},landing:{x:0,y:4.8,z:1.2},yaw:0}];
    world.surfaceHeightAt=(x,z,y)=>Math.abs(x)<2&&z>=.9&&z<=3.1&&y>=4.5?4.8:0;
    return world;
  }
  it('ascends a ladder, reports climbing, spends stamina, and stays on the landing',()=>{
    const w=ladderWorld(),c=spawn(w);run(c,w,{...idle,climb:true},1);expect(c.position.y).toBeGreaterThan(1);expect(c.anim).toBe('climb');expect(c.stamina).toBeLessThan(1);run(c,w,{...idle,climb:true},3);run(c,w,idle,.5);expect(c.position.y).toBeCloseTo(4.8);expect(c.climbing).toBe(false);expect(c.anim).toBe('idle');
  });
  it('pauses on the ladder when released and descends with back plus climb',()=>{
    const w=ladderWorld(),c=spawn(w);run(c,w,{...idle,climb:true},1);const y=c.position.y;run(c,w,idle,.5);expect(c.position.y).toBeCloseTo(y);run(c,w,{...idle,forward:-1,climb:true},2);expect(c.position.y).toBeCloseTo(0);expect(c.climbing).toBe(false);
  });
  it('lets go on jump, falls safely and does not immediately reattach',()=>{
    const w=ladderWorld(),c=spawn(w);run(c,w,{...idle,climb:true},1);c.update(DT,{...idle,jump:true},0,w);expect(c.climbing).toBe(false);run(c,w,idle,2);expect(c.position.y).toBeCloseTo(0);expect(c.grounded).toBe(true);
  });
  it('falls after walking off the raised platform',()=>{
    const w=ladderWorld(),c=spawn(w);run(c,w,{...idle,climb:true},4);run(c,w,fwd,2);run(c,w,idle,1);expect(c.position.z).toBeGreaterThan(3.1);expect(c.position.y).toBeCloseTo(0);
  });
  it('grabs a steep slope when pushed into and climbs it, hugging the surface',()=>{
    const w=fakeWorld({heightAt:(_x,z)=>z*1.6});const c=spawn(w);run(c,w,fwd,2.5);
    expect(c.climbing).toBe(true);expect(c.anim).toBe('climb');expect(c.position.y).toBeGreaterThan(1.5);
    expect(Math.abs(c.position.y-c.position.z*1.6)).toBeLessThan(1);expect(c.stamina).toBeLessThan(1);
    // Exhausted climbers can't grab on.
    const tired=spawn(w);tired.stamina=0;tired.exhausted=true;run(tired,w,fwd,1);expect(tired.climbing).toBe(false);expect(tired.position.y).toBeLessThan(.5);
  });
  it('drops from a ladder when stamina runs out',()=>{
    const w=ladderWorld(),c=spawn(w);c.stamina=.02;run(c,w,{...idle,climb:true},.5);expect(c.climbing).toBe(false);run(c,w,idle,1);expect(c.position.y).toBeCloseTo(0);expect(c.grounded).toBe(true);
  });
  it('never grabs a slope that can be walked up',()=>{
    const w=fakeWorld({heightAt:(_x,z)=>Math.max(0,z)*.5});const c=spawn(w);run(c,w,fwd,2);expect(c.climbing).toBe(false);expect(c.position.z).toBeGreaterThan(3);
  });
  it('cannot climb through a solid wall',()=>{
    const w=fakeWorld({heightAt:(_x,z)=>z*1.6,colliders:[{kind:'box',minX:-4,maxX:4,minZ:.4,maxZ:1}]});const c=spawn(w);run(c,w,{...fwd,climb:true},3);expect(c.position.z).toBeLessThan(.4);
  });
});

describe('climbing rock', () => {
  /** Flat ground with climbable rock you can stand on, as the real world wires it. */
  function rockWorld(colliders: Collider[]): World {
    const w = fakeWorld({ colliders });
    w.surfaceHeightAt = (x, z, feet) => {
      let h = 0;
      for (const c of colliders) if (c.climb && c.maxY !== undefined && colliderContains(c, x, z) && feet >= colliderTop(c, x, z) - 0.35) h = Math.max(h, colliderTop(c, x, z));
      return h;
    };
    return w;
  }
  const cliff: Collider = { kind: 'obox', x: 0, z: 3, hw: 3, hd: 2, yaw: 0, maxY: 5, climb: true };

  it('climbs a cliff face to the top and pulls up onto it', () => {
    const w = rockWorld([cliff]), c = spawn(w);
    run(c, w, fwd, 1);
    expect(c.climbing).toBe(true);
    expect(c.position.z).toBeGreaterThan(0.5);
    expect(c.position.z).toBeLessThan(1);
    run(c, w, fwd, 3.2);
    run(c, w, idle, 1.5);
    expect(c.climbing).toBe(false);
    expect(c.grounded).toBe(true);
    expect(c.position.y).toBeCloseTo(5, 1);
    expect(c.position.z).toBeGreaterThan(1.2);
  });

  it('plays the pull-up while mantling, and spends stamina only on the wall', () => {
    const w = rockWorld([cliff]), c = spawn(w);
    const anims = new Set<string>();
    let atTop = -1;
    for (let i = 0; i < 5 * 60; i++) {
      c.update(DT, fwd, 0, w);
      anims.add(c.anim);
      if (c.anim === 'mantle' && atTop < 0) atTop = c.stamina;
      if (c.anim === 'mantle') expect(c.stamina).toBe(atTop);
    }
    expect(anims.has('climb')).toBe(true);
    // 3.5 m of wall at climbing speed.
    expect(atTop).toBeLessThan(1 - 0.9 * 3.5 * PLAYER_TUNING.climbDrain / PLAYER_TUNING.climbSpeed);
  });

  it('climbs on past a step too narrow to stand on, onto the wall behind it', () => {
    // The wall behind sits just out of a normal reach, too close to leave room to stand.
    const step: Collider = { kind: 'obox', x: 0, z: 1.835, hw: 3, hd: 0.335, yaw: 0, maxY: 2, climb: true };
    const upper: Collider = { kind: 'obox', x: 0, z: 4.17, hw: 3, hd: 2, yaw: 0, maxY: 6, climb: true };
    const w = rockWorld([step, upper]), c = spawn(w);
    let lowest = Infinity, wasUp = false;
    for (let i = 0; i < 5.2 * 60; i++) {
      c.update(DT, fwd, 0, w);
      if (c.position.y > 1.5) wasUp = true;
      if (wasUp) lowest = Math.min(lowest, c.position.y);
    }
    run(c, w, idle, 1.5);
    expect(lowest).toBeGreaterThan(1.4);
    expect(c.grounded).toBe(true);
    expect(c.position.y).toBeCloseTo(6, 1);
  });

  it('vaults straight onto chest-high rock', () => {
    const w = rockWorld([{ kind: 'circle', x: 0, z: 2, r: 1.2, maxY: 1.1, climb: true }]), c = spawn(w);
    const anims = new Set<string>();
    for (let i = 0; i < 45; i++) { c.update(DT, fwd, 0, w); anims.add(c.anim); }
    run(c, w, idle, 0.5);
    expect(anims.has('vault')).toBe(true);
    expect(anims.has('climb')).toBe(false);
    expect(c.position.y).toBeCloseTo(1.1, 1);
  });

  it('lets go with the climb key and on running out of stamina', () => {
    const tall: Collider = { ...cliff, maxY: 40 };
    const w = rockWorld([tall]), c = spawn(w);
    run(c, w, fwd, 2);
    expect(c.climbing).toBe(true);
    c.update(DT, { ...idle, climb: true }, 0, w);
    expect(c.climbing).toBe(false);
    run(c, w, idle, 2);
    expect(c.position.y).toBeCloseTo(0);

    const d = spawn(w);
    d.stamina = 0.3;
    run(d, w, fwd, 0.5);
    expect(d.climbing).toBe(true);
    for (let i = 0; i < 20 * 60 && d.climbing; i++) d.update(DT, fwd, 0, w);
    expect(d.exhausted).toBe(true);
    expect(d.position.y).toBeGreaterThan(3);
    run(d, w, idle, 2);
    expect(d.position.y).toBeLessThan(0.5);
  });

  it('a climb jump lunges up for extra stamina', () => {
    const tall: Collider = { ...cliff, maxY: 40 };
    const w = rockWorld([tall]), c = spawn(w);
    run(c, w, fwd, 1.2);
    const y = c.position.y, st = c.stamina;
    c.update(DT, { ...idle, jump: true }, 0, w);
    run(c, w, idle, PLAYER_TUNING.climbJumpTime);
    expect(c.position.y - y).toBeGreaterThan(PLAYER_TUNING.climbJumpHeight * 0.8);
    expect(st - c.stamina).toBeGreaterThan(PLAYER_TUNING.climbJumpCost);
    expect(c.climbing).toBe(true);
  });

  it('does not climb walls that are not rock', () => {
    const w = rockWorld([{ kind: 'box', minX: -3, maxX: 3, minZ: 1, maxZ: 3 }]), c = spawn(w);
    run(c, w, fwd, 2);
    expect(c.climbing).toBe(false);
    expect(c.position.y).toBeCloseTo(0);
  });
});

describe('natural jump recovery', () => {
  it('plants briefly before accepting a buffered repeat jump', () => {
    const w=fakeWorld(),c=spawn(w);
    c.update(DT,{...fwd,jump:true},0,w);
    let landingFrame=-1, nextTakeoff=-1;
    for(let i=0;i<100;i++) {
      const wasGrounded=c.grounded;
      c.update(DT,{...fwd,jump:i%2===0},0,w);
      if(!wasGrounded&&c.grounded&&landingFrame<0)landingFrame=i;
      if(landingFrame>=0&&wasGrounded&&!c.grounded){nextTakeoff=i;break;}
    }
    expect(landingFrame).toBeGreaterThan(0);
    expect(nextTakeoff-landingFrame).toBeGreaterThanOrEqual(4);
    expect(nextTakeoff-landingFrame).toBeLessThan(10);
  });
  it('brakes airborne momentum when movement is released', () => {
    const w=fakeWorld(),c=spawn(w);
    run(c,w,sprint,1);
    c.update(DT,{...sprint,jump:true},0,w);
    run(c,w,idle,.3);
    expect(c.grounded).toBe(false);
    expect(c.horizontalSpeed).toBeLessThan(6);
    expect(c.horizontalSpeed).toBeGreaterThan(3);
  });
  it('cannot gain sprint speed by steering or pressing sprint in mid-air', () => {
    const w=fakeWorld(),c=spawn(w);
    run(c,w,fwd,1);
    c.update(DT,{...fwd,jump:true},0,w);
    for(let i=0;i<25;i++) {
      c.update(DT,{...sprint,right:i%2?1:-1},0,w);
      expect(c.horizontalSpeed).toBeLessThanOrEqual(PLAYER_TUNING.walkSpeed+.001);
    }
  });
  it('faces its travel direction through a reversal instead of walking backwards', () => {
    const w=fakeWorld(),c=spawn(w);run(c,w,fwd,1);
    c.update(DT,{...fwd,forward:-1},0,w);
    expect(c.velocity.z).toBeGreaterThan(0);
    expect(Math.abs(c.yaw)).toBeLessThan(.01);
  });
});

describe('dodge', () => {
  const press = (i: MoveInput): MoveInput => ({ ...i, dodge: true });

  it('rolls a few metres along the input, turning into the roll and staying on the ground', () => {
    const w = fakeWorld();
    const c = spawn(w);
    const right: MoveInput = { forward: 0, right: 1, sprint: false, jump: false };
    c.update(DT, press(right), 0, w);
    expect(c.dodging).toBe(true);
    expect(c.invulnerable).toBe(true);
    expect(c.grounded).toBe(true);
    expect(c.anim).toBe('roll');
    // Input doesn't steer a roll.
    run(c, w, idle, 0.7);
    expect(c.dodging).toBe(false);
    // Camera yaw 0 faces +Z, so right is -X, which is yaw -PI/2.
    expect(c.position.x).toBeLessThan(-2.5);
    expect(c.position.x).toBeGreaterThan(-4.5);
    expect(Math.abs(c.yaw + Math.PI / 2)).toBeLessThan(0.2);
    expect(c.grounded).toBe(true);
  });

  it('cannot jump out of a roll', () => {
    const w = fakeWorld();
    const c = spawn(w);
    c.update(DT, press(fwd), 0, w);
    c.update(DT, { ...fwd, jump: true }, 0, w);
    run(c, w, fwd, 0.1);
    expect(c.grounded).toBe(true);
  });

  it('backsteps with no direction held, landing rather than running backwards', () => {
    const w = fakeWorld();
    const c = spawn(w);
    c.update(DT, press(idle), 0, w);
    expect(c.anim).toBe('jump');
    while (!c.grounded) c.update(DT, idle, 0, w);
    expect(c.dodging).toBe(true);
    expect(c.anim).toBe('idle');
    run(c, w, idle, 0.6);
    expect(c.position.z).toBeLessThan(-1.5);
  });

  it('costs stamina, has a short cooldown and needs the key pressed again', () => {
    const w = fakeWorld();
    const c = spawn(w);
    c.update(DT, press(idle), 0, w);
    expect(c.stamina).toBeCloseTo(1 - PLAYER_TUNING.dodgeStamina, 2);
    // Holding the key doesn't chain dodges.
    run(c, w, press(idle), 1);
    expect(c.dodging).toBe(false);
    const before = c.stamina;
    c.update(DT, idle, 0, w);
    c.update(DT, press(idle), 0, w);
    expect(c.dodging).toBe(true);
    expect(c.stamina).toBeLessThan(before);
  });

  it('can only dodge from the ground and not while exhausted', () => {
    const w = fakeWorld();
    const c = spawn(w);
    c.update(DT, { ...idle, jump: true }, 0, w);
    run(c, w, idle, 0.1);
    expect(c.grounded).toBe(false);
    c.update(DT, press(idle), 0, w);
    // The press is buffered briefly, but the jump lasts longer than that.
    run(c, w, idle, 0.12);
    expect(c.dodging).toBe(false);
    run(c, w, idle, 1);
    c.stamina = 0;
    c.exhausted = true;
    c.update(DT, press(idle), 0, w);
    expect(c.dodging).toBe(false);
  });

  it('a hit can only pass through early in the dodge', () => {
    const w = fakeWorld();
    const c = spawn(w);
    c.update(DT, press(fwd), 0, w);
    run(c, w, fwd, PLAYER_TUNING.dodgeInvuln + 0.01);
    expect(c.invulnerable).toBe(false);
  });
});
