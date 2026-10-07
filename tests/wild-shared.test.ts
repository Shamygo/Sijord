import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { entryWeight, SHARED_SPAWN, seedFromName, WildManager, ZONES } from '../src/client/overworld/wild';
import type { World } from '../src/client/world/types';

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

const T0 = 1_800_000_000_000;
/** Two players' managers: different behaviour seeds, same world name. */
function pair(world = fakeWorld(), name = 'our-world', clock = () => T0, night = () => false) {
  const opts = { clock, modelReady: () => true, night };
  return [new WildManager(world, 11, seedFromName(name), opts), new WildManager(world, 99, seedFromName(name), opts)] as const;
}

/** One spawn pass without moving anything. */
const spawnAt = (w: WildManager, p: THREE.Vector3) => w.update(1e-6, p, 0, false, false);

const describeHerds = (w: WildManager) =>
  w.creatures
    .map((m) => ({ key: m.key, species: m.creature.species, level: m.creature.level, ivs: m.creature.ivs, nature: m.creature.nature, x: Math.round(m.mover.pos.x * 100), z: Math.round(m.mover.pos.z * 100) }))
    .sort((a, b) => String(a.key).localeCompare(String(b.key)));

describe('shared wild herds', () => {
  const field = new THREE.Vector3(150, 0, 20);

  it('two players in the same world meet the same herds', () => {
    const [a, b] = pair();
    spawnAt(a, field);
    spawnAt(b, field);
    expect(a.creatures.length).toBeGreaterThan(0);
    expect(describeHerds(a)).toEqual(describeHerds(b));
    expect(a.creatures.every((m) => m.key)).toBe(true);
    // Each machine's copy has its own ID, so both catching it in a race can't make one creature twice.
    const uidOf = (w: WildManager, key?: string) => w.creatures.find((m) => m.key === key)!.creature.uid;
    for (const m of a.creatures) expect(uidOf(b, m.key)).not.toBe(m.creature.uid);
  });

  it('a friend arriving just after the time window turns over meets the herds already out', () => {
    const before = () => T0 - 1;
    const after = () => T0 + 1;
    const [a] = pair(fakeWorld(), 'our-world', before);
    const [, b] = pair(fakeWorld(), 'our-world', after);
    const [, fresh] = pair(fakeWorld(), 'our-world', after);
    spawnAt(a, field);
    expect(a.creatures.length).toBeGreaterThan(0);
    b.setFriendCells(a.liveCells);
    spawnAt(b, field);
    spawnAt(fresh, field);
    // In the cells the friend has a herd out, both meet the same one (other cells roll the new window).
    const cellOf = (key?: string) => String(key).split(',').slice(0, 2).join(',');
    const theirs = new Set(a.creatures.map((m) => cellOf(m.key)));
    const inTheirCells = (w: WildManager) => describeHerds(w).filter((h) => theirs.has(cellOf(h.key)));
    expect(inTheirCells(b)).toEqual(describeHerds(a));
    expect(inTheirCells(fresh)).not.toEqual(describeHerds(a));
  });

  it('a different world or a later time window rolls different herds', () => {
    const [a] = pair();
    const [c] = pair(fakeWorld(), 'another-world');
    const [d] = pair(fakeWorld(), 'our-world', () => T0 + SHARED_SPAWN.epochMs);
    for (const w of [a, c, d]) spawnAt(w, field);
    expect(describeHerds(c)).not.toEqual(describeHerds(a));
    expect(describeHerds(d)).not.toEqual(describeHerds(a));
  });

  it('herds spawn out of sight, never on top of the player', () => {
    const [a] = pair();
    spawnAt(a, field);
    for (const m of a.creatures) expect(Math.hypot(m.mover.pos.x - field.x, m.mover.pos.z - field.z)).toBeGreaterThan(45);
  });

  it('a creature one player catches fades for the other and does not respawn this window', () => {
    const [a, b] = pair();
    spawnAt(a, field);
    spawnAt(b, field);
    const caught = a.creatures[0];
    a.caught(caught);
    expect(a.sharedTaken).toEqual([caught.key]);
    b.applyTaken(a.sharedTaken);
    const there = b.creatures.find((m) => m.key === caught.key)!;
    expect(there.state).toBe('gone');
    // Walk far away (everything despawns), then come back: it stays caught, its herd-mates return.
    const away = new THREE.Vector3(-400, 0, 400);
    for (let i = 0; i < 3; i++) b.update(2, away, 0, false, false);
    expect(b.creatures.some((m) => m.key?.startsWith(caught.key!.split(':')[0]))).toBe(false);
    for (let i = 0; i < 3; i++) b.update(2, field, 0, false, false);
    const keys = b.creatures.map((m) => m.key);
    expect(keys).not.toContain(caught.key);
    const mates = a.creatures.filter((m) => m.herd === caught.herd && m !== caught).map((m) => m.key);
    for (const k of mates) expect(keys).toContain(k);
  });

  it("a friend's battle hides the creature here and it can't be engaged until released", () => {
    const [a, b] = pair();
    spawnAt(a, field);
    spawnAt(b, field);
    const target = a.creatures[0];
    a.enterBattle([target]);
    expect(a.sharedBusy).toEqual([target.key]);
    b.setRemoteBusy(new Set(a.sharedBusy));
    const there = b.creatures.find((m) => m.key === target.key)!;
    expect(there.remoteBusy).toBe(true);
    expect(there.root.visible).toBe(false);
    expect(b.nearestEngageable(there.mover.pos.clone())).not.toBe(there);
    b.setRemoteBusy(new Set());
    expect(there.remoteBusy).toBe(false);
    expect(there.root.visible).toBe(true);
    expect(b.nearestEngageable(there.mover.pos.clone())).toBe(there);
  });

  it('defeated creatures count as taken; ones that ran away do not', () => {
    const [a] = pair();
    spawnAt(a, field);
    const [x, y] = a.creatures;
    a.enterBattle([x, y]);
    a.leaveBattle([x, y], new Set([x.creature.uid]));
    expect(a.sharedTaken).toEqual([x.key]);
  });

  it('night brings out its own herds, the same for both friends', () => {
    const [a, b] = pair(fakeWorld(), 'our-world', () => T0, () => true);
    const [day] = pair();
    for (const w of [a, b, day]) spawnAt(w, field);
    expect(a.creatures.length).toBeGreaterThan(0);
    expect(describeHerds(a)).toEqual(describeHerds(b));
    // Night herds are a separate roll, under their own keys.
    const keys = new Set(day.creatures.map((m) => m.key));
    expect(a.creatures.some((m) => keys.has(m.key))).toBe(false);
  });

  it('a friend still out in the day herds after dusk is met in them', () => {
    const [a] = pair();
    const [, b] = pair(fakeWorld(), 'our-world', () => T0, () => true);
    spawnAt(a, field);
    b.setFriendCells(a.liveCells);
    spawnAt(b, field);
    const cellOf = (key?: string) => String(key).split(',').slice(0, 2).join(',');
    const theirs = new Set(a.creatures.map((m) => cellOf(m.key)));
    expect(describeHerds(b).filter((h) => theirs.has(cellOf(h.key)))).toEqual(describeHerds(a));
  });

  it('by night the birds and bugs sleep and Zubat, Oddish and Meowth come out', () => {
    const [w] = pair();
    const count = (night: boolean) => {
      const n: Record<string, number> = {};
      const e = Math.floor(T0 / SHARED_SPAWN.epochMs) * 2 + (night ? 1 : 0);
      // Cells within Route 1's reach of town (the fake world is flat open ground).
      for (let i = -5; i <= 5; i++) for (let j = -9; j <= 1; j++) for (let k = 0; k < 6; k++) {
        const plan = w.cellPlan(i, j, e + k * 2);
        if (plan) n[plan.entry.species] = (n[plan.entry.species] ?? 0) + 1;
      }
      return n;
    };
    const day = count(false), night = count(true);
    expect(day.zubat ?? 0).toBeLessThan(night.zubat ?? 0);
    expect(night.oddish ?? 0).toBeGreaterThan(day.oddish ?? 0);
    expect(night.meowth ?? 0).toBeGreaterThan(day.meowth ?? 0);
    expect(night.finchlet ?? 0).toBeLessThan(day.finchlet ?? 0);
    // Near town, Zubat only ever come out at night.
    const near = ZONES[0].entries.find((e) => e.species === 'zubat')!;
    expect(entryWeight(near, false)).toBe(0);
    expect(entryWeight(near, true)).toBeGreaterThan(0);
    for (const z of ZONES) for (const e of z.entries) expect(entryWeight(e, false) + entryWeight(e, true)).toBeGreaterThan(0);
  });
});
