import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { chooseAction } from '../src/shared/battle/ai';
import { createCreature } from '../src/shared/battle/creature';
import { Battle } from '../src/shared/battle/engine';
import { Rng } from '../src/shared/battle/rng';
import { MOVES } from '../src/shared/data/moves';
import { SPECIES } from '../src/shared/data/species';
import { levelCap } from '../src/shared/battle/stats';
import { trainerPrize } from '../src/shared/economy';
import { patrolAt, ROAMING_TRAINERS, trainerById, trainerDay, trainerReward, trainersBeaten, trainerSees, trainerStanding, trainerTeam, TRAINER_TUNING } from '../src/shared/trainers';
import { RoamingTrainer } from '../src/client/npc/roaming-trainer';
import type { World } from '../src/client/world/types';

function fakeWorld(): World {
  return {
    root: new THREE.Object3D(),
    heightAt: () => 0,
    waterLevel: -10,
    colliders: [],
    regions: [],
    anchors: { playerSpawns: [new THREE.Vector3(), new THREE.Vector3()], playerSpawnYaw: [0, 0], professor: new THREE.Vector3(), professorYaw: 0, landmarks: [] },
  } as unknown as World;
}

describe('roaming trainers', () => {
  it('have real teams under the first level cap, with moves and items that exist', () => {
    expect(ROAMING_TRAINERS.length).toBeGreaterThanOrEqual(6);
    expect(new Set(ROAMING_TRAINERS.map((t) => t.id)).size).toBe(ROAMING_TRAINERS.length);
    for (const t of ROAMING_TRAINERS) {
      expect(t.path.length).toBeGreaterThanOrEqual(2);
      expect(t.team.length).toBeGreaterThanOrEqual(2);
      for (const m of t.team) {
        expect(SPECIES[m.species], `${t.id} ${m.species}`).toBeDefined();
        expect(m.level).toBeLessThanOrEqual(levelCap(0));
        for (const move of m.moves ?? []) expect(MOVES[move], `${t.id} ${move}`).toBeDefined();
        // Held items that work in battle are the berries.
        if (m.item) expect(['oran-berry', 'sitrus-berry']).toContain(m.item);
      }
      for (const line of [...t.lines.challenge, ...t.lines.beaten, ...t.lines.won, t.lines.after, t.lines.rematch]) expect(line.length).toBeGreaterThan(5);
    }
  });

  it('bring the same team every time, at full health, with their own moves', () => {
    const liv = trainerById('liv')!;
    const a = trainerTeam(liv), b = trainerTeam(liv);
    expect(a.map((c) => c.ivs)).toEqual(b.map((c) => c.ivs));
    expect(a[0].moves.map((m) => m.id)).toEqual(['helping-hand', 'quick-attack', 'sand-attack', 'covet']);
    expect(a[0].item).toBe('oran-berry');
    expect(a.every((c) => c.ot === 'Ace Trainer Liv')).toBe(true);
    expect(trainerTeam(trainerById('haldor')!).map((c) => c.nickname)).toEqual(['Tor', 'Bjorn']);
    expect(trainerById('nobody')).toBeUndefined();
    expect(trainerById('constructor')).toBeUndefined();
    expect(trainerById(7)).toBeUndefined();
  });

  it('pay the full prize the first time and a rematch prize after', () => {
    const brann = trainerById('brann')!;
    expect(trainerReward(brann, false)).toBe(trainerPrize(14, false));
    expect(trainerReward(brann, true)).toBe(trainerPrize(14, true));
    expect(trainerReward(brann, true)).toBeLessThan(trainerReward(brann, false));
  });

  it('know who beat them, and when', () => {
    const day = trainerDay(Date.UTC(2026, 9, 6, 12));
    expect(trainerStanding(undefined, 'tobin', day)).toBe('unbeaten');
    expect(trainerStanding({ tobin: day }, 'tobin', day)).toBe('beaten-today');
    expect(trainerStanding({ tobin: day - 3 }, 'tobin', day)).toBe('rematch');
    expect(trainerStanding({ tobin: 'yes' }, 'tobin', day)).toBe('unbeaten');
    expect(trainerStanding('broken', 'tobin', day)).toBe('unbeaten');
    expect(trainersBeaten({ tobin: day, liv: 1, nobody: 3 })).toBe(2);
    expect(trainersBeaten(null)).toBe(0);
  });

  it('walk their beat from the clock alone, smoothly, and look around at each end', () => {
    for (const t of ROAMING_TRAINERS) {
      const [a, b] = [t.path[0], t.path[t.path.length - 1]];
      let prev = patrolAt(t, 1000);
      let sawA = false, sawB = false, paused = false;
      for (let s = 1000.5; s < 1300; s += 0.5) {
        const p = patrolAt(t, s);
        // Never further than the walking pace allows.
        expect(Math.hypot(p.x - prev.x, p.z - prev.z)).toBeLessThanOrEqual(TRAINER_TUNING.walk * 0.5 + 1e-6);
        if (Math.hypot(p.x - a[0], p.z - a[1]) < 0.01) sawA = true;
        if (Math.hypot(p.x - b[0], p.z - b[1]) < 0.01) sawB = true;
        if (!p.walking) paused = true;
        prev = p;
      }
      expect(sawA && sawB && paused, t.id).toBe(true);
      // Both friends agree.
      expect(patrolAt(t, 4321.25)).toEqual(patrolAt(t, 4321.25));
    }
  });

  it('see a trainer ahead of them or right beside them, but not behind them or far away', () => {
    // Facing north (+Z).
    expect(trainerSees(0, 0, 0, 0, 10)).toBe(true);
    expect(trainerSees(0, 0, 0, 6, 8)).toBe(true);
    expect(trainerSees(0, 0, 0, 0, -8)).toBe(false);
    expect(trainerSees(0, 0, 0, 0, -2)).toBe(true);
    expect(trainerSees(0, 0, 0, 0, TRAINER_TUNING.sight + 1)).toBe(false);
    expect(trainerSees(0, 0, 0, 12, 1)).toBe(false);
    // Facing south, angles wrapping round.
    expect(trainerSees(0, 0, Math.PI * 3, 0.5, -10)).toBe(true);
  });

  it('follow their beat in the world, walk up when the game says so, and hide far away', async () => {
    const def = trainerById('tobin')!;
    const t = new RoamingTrainer(def, fakeWorld());
    const s0 = 5000;
    const near = new THREE.Vector3(def.path[0][0], 0, def.path[0][1]);
    for (let i = 0; i < 300; i++) t.update(0.1, s0 + i * 0.1, near);
    const beat = patrolAt(def, s0 + 30);
    expect(Math.hypot(t.position.x - beat.x, t.position.z - beat.z)).toBeLessThan(1.5);
    expect(t.visible && t.patrolling).toBe(true);
    // Taken over to walk up to the player.
    t.setScripted(true);
    expect(t.patrolling).toBe(false);
    const goal = t.position.clone().add(new THREE.Vector3(4, 0, 0));
    let arrived = false;
    void t.walkTo(goal, true).then(() => (arrived = true));
    for (let i = 0; i < 60 && !arrived; i++) { t.update(0.1, s0 + 30, near); await Promise.resolve(); }
    expect(arrived).toBe(true);
    expect(t.position.distanceTo(goal)).toBeLessThan(0.5);
    // Handed back, they return to the beat.
    t.setScripted(false);
    for (let i = 0; i < 200; i++) t.update(0.1, s0 + 30 + i * 0.1, near);
    const back = patrolAt(def, s0 + 50);
    expect(Math.hypot(t.position.x - back.x, t.position.z - back.z)).toBeLessThan(1.5);
    // At a friend's battle they stand at the ring.
    const ring = t.position.clone().add(new THREE.Vector3(-3, 0, 2));
    t.standAt({ p: ring, yaw: 1 });
    expect(t.patrolling).toBe(false);
    for (let i = 0; i < 60; i++) t.update(0.1, s0 + 50, near);
    expect(t.position.distanceTo(ring)).toBeLessThan(0.5);
    // Nobody about: not drawn.
    t.update(0.1, s0 + 60, new THREE.Vector3(500, 0, 500));
    expect(t.visible).toBe(false);
  });

  it('fight as a doubles team in the battle engine', () => {
    for (const def of ROAMING_TRAINERS) {
      const rng = new Rng(3);
      const party = [createCreature('cindlet', 15, rng, { uid: 'p0' }), createCreature('geodude', 15, rng, { uid: 'p1' }), createCreature('poliwag', 15, rng, { uid: 'p2' })];
      const b = new Battle({ seed: 1, kind: 'trainer', sides: [
        { teams: [{ owner: 'p', name: 'P', creatures: party, levelCap: 15, ai: 't1' }], slots: ['p', 'p'] },
        { teams: [{ owner: 't', name: def.name, creatures: trainerTeam(def), ai: def.ai }], slots: ['t', 't'] },
      ] });
      b.start();
      let turns = 0;
      while (b.phase !== 'ended' && turns < 80) { b.resolve(chooseAction); turns++; }
      expect(b.phase, def.id).toBe('ended');
    }
  });
});
