import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ALPHA, ALPHA_LAIRS, alphaCreature, alphaDay, alphaKey, alphaPrize, currentAlphaKeys } from '../src/shared/alpha';
import { ALPHA_CATCH, catchChance } from '../src/shared/battle/catch';
import { createCreature } from '../src/shared/battle/creature';
import { Battle } from '../src/shared/battle/engine';
import { Rng } from '../src/shared/battle/rng';
import { STATS } from '../src/shared/battle/types';
import { wildPrize } from '../src/shared/economy';
import { seedFromName, WildManager } from '../src/client/overworld/wild';
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
const DAY = alphaDay(T0);
const LAIR = ALPHA_LAIRS[0];
const near = (d = 40) => new THREE.Vector3(LAIR.x, 0, LAIR.z - d);
const manager = (seed = 11, name = 'our-world', clock = () => T0) => new WildManager(fakeWorld(), seed, seedFromName(name), { clock, modelReady: () => true });
const tick = (w: WildManager, p: THREE.Vector3, dt = 1e-6, sprint = false) => w.update(dt, p, sprint ? 7 : 0, sprint, false);
const alphaOf = (w: WildManager) => w.creatures.find((m) => m.alpha);

describe('Alpha Pokemon', () => {
  it('rolls three perfect stats, holds a Sitrus Berry, and comes out the same for both friends', () => {
    const a = alphaCreature(LAIR, 1234, 'mine');
    const b = alphaCreature(LAIR, 1234, 'theirs');
    expect(a.alpha).toBe(true);
    expect(a.item).toBe(ALPHA.item);
    expect(a.level).toBe(LAIR.level);
    expect(STATS.filter((s) => a.ivs[s] === 31).length).toBeGreaterThanOrEqual(ALPHA.perfect);
    expect({ ...a, uid: '' }).toEqual({ ...b, uid: '' });
    expect(alphaCreature(LAIR, 99).ivs).not.toEqual(a.ivs);
  });

  it('forgets yesterday\'s Alphas, so they come back', () => {
    const today = alphaKey(LAIR, DAY);
    expect(currentAlphaKeys([alphaKey(LAIR, DAY - 1), today, '3,4,5:0'], DAY)).toEqual([today]);
    expect(currentAlphaKeys([today, 7, null], DAY)).toEqual([today]);
    expect(currentAlphaKeys('broken', DAY)).toEqual([]);
    expect(alphaPrize(18)).toBe(wildPrize([18]) * 3);
  });

  it('shows up at its lair when a trainer comes close, bigger than its kind, and stays there', () => {
    const far = manager();
    tick(far, near(ALPHA.spawn + 30));
    expect(alphaOf(far)).toBeUndefined();
    const w = manager();
    tick(w, near(60));
    const m = alphaOf(w)!;
    expect(m).toBeDefined();
    expect(m.key).toBe(alphaKey(LAIR, DAY));
    expect(m.creature.species).toBe(LAIR.species);
    expect(w.alphas).toEqual([m]);
    expect(m.herd.members).toEqual([m]);
    expect(w.opponentsFor(m)).toEqual([m]);
    // Same model, scaled up.
    const plain = w.spawnHerd(LAIR.x + 30, LAIR.z, LAIR.species, 10).members[0];
    expect(m.model.height).toBeCloseTo(plain.model.height * ALPHA.scale, 5);
    // It wanders around its lair rather than drifting off with the herd centre.
    for (let i = 0; i < 400; i++) tick(w, near(60), 0.1);
    expect(Math.hypot(m.mover.pos.x - LAIR.x, m.mover.pos.z - LAIR.z)).toBeLessThan(10);
  });

  it('is the same creature for two friends in one world, and not in another world', () => {
    const a = manager(11), b = manager(99), other = manager(11, 'another-world');
    for (const w of [a, b, other]) tick(w, near(60));
    const [ma, mb, mo] = [a, b, other].map((w) => alphaOf(w)!.creature);
    expect({ ...ma, uid: '' }).toEqual({ ...mb, uid: '' });
    expect(ma.uid).not.toBe(mb.uid);
    expect(mo.ivs).not.toEqual(ma.ivs);
  });

  it('squares up to a trainer who comes near, roars, then charges, even a sprinting one', () => {
    const w = manager();
    tick(w, near(60));
    const m = alphaOf(w)!;
    const p = new THREE.Vector3(m.mover.pos.x, 0, m.mover.pos.z - (ALPHA.notice - 4));
    tick(w, p, 0.1, true);
    expect(m.state).toBe('watch');
    expect(w.consumeRoars()).toEqual([]);
    for (let t = 0; t < ALPHA.roar + 0.3; t += 0.1) tick(w, p, 0.1, true);
    expect(m.state).toBe('attack');
    expect(m.attack?.ox).toBe(LAIR.x);
    expect(w.consumeRoars()).toEqual([m]);
    // Calmed down, it leaves the trainer be for a while.
    w.calmDown(m);
    for (let t = 0; t < 5; t += 0.1) tick(w, p, 0.1);
    expect(m.state).not.toBe('attack');
    expect(w.consumeRoars()).toEqual([]);
  });

  it('once beaten it is gone for the day for both friends, and back the next day', () => {
    const a = manager(11), b = manager(99);
    tick(a, near(60));
    tick(b, near(60));
    const taken: string[] = [];
    b.onAlphaTaken = (k) => taken.push(k);
    const m = alphaOf(a)!;
    a.enterBattle([m]);
    a.leaveBattle([m], new Set([m.creature.uid]));
    expect(a.sharedTaken).toEqual([alphaKey(LAIR, DAY)]);
    b.applyTaken(a.sharedTaken);
    expect(taken).toEqual([alphaKey(LAIR, DAY)]);
    expect(alphaOf(b)?.state).toBe('gone');
    // Far away and back the same day (a reload re-applies the saved key): no Alpha.
    const reload = manager(5);
    reload.applyTaken(taken);
    tick(reload, near(60));
    expect(alphaOf(reload)).toBeUndefined();
    // The next day it's back.
    const tomorrow = manager(5, 'our-world', () => T0 + ALPHA.dayMs);
    tomorrow.applyTaken(currentAlphaKeys(taken, alphaDay(T0 + ALPHA.dayMs)));
    tick(tomorrow, near(60));
    expect(alphaOf(tomorrow)?.key).toBe(alphaKey(LAIR, DAY + 1));
  });

  it('comes into battle with its aura raising every stat, under its own name', () => {
    const rng = new Rng(3);
    const party = [createCreature('fernfawn', 15, rng, { uid: 'a' }), createCreature('hjordpup', 14, rng, { uid: 'b' })];
    const b = new Battle({
      seed: 1, kind: 'wild',
      sides: [
        { teams: [{ owner: 'p', name: 'Ash', creatures: party, levelCap: 15 }], slots: ['p', 'p'] },
        { teams: [{ owner: 'w', name: 'Wild', creatures: [alphaCreature(LAIR, 7, 'x')], ai: 'wild' }], slots: ['w', 'w'] },
      ],
    });
    const ev = b.start();
    const foe = b.at({ side: 1, slot: 0 })!;
    expect(foe.boosts).toMatchObject({ atk: 1, def: 1, spa: 1, spd: 1, spe: 1 });
    expect(b.label({ side: 1, slot: 0 })).toBe(`The Alpha ${foe.name}`);
    expect(ev.some((e) => e.t === 'switch-in' && e.alpha)).toBe(true);
    // An ordinary wild one gets no aura.
    const plain = new Battle({
      seed: 1, kind: 'wild',
      sides: [
        { teams: [{ owner: 'p', name: 'Ash', creatures: party, levelCap: 15 }], slots: ['p', 'p'] },
        { teams: [{ owner: 'w', name: 'Wild', creatures: [createCreature('ponyta', 18, rng)], ai: 'wild' }], slots: ['w', 'w'] },
      ],
    });
    plain.start();
    expect(plain.at({ side: 1, slot: 0 })!.boosts.atk).toBe(0);
  });

  it('fights the ball much harder', () => {
    const base = { maxHp: 60, hp: 10, catchRate: 190, ball: 'great-ball', level: 18, partyLevel: 15, cap: 15, throw: 'battle' as const };
    const plain = catchChance(base), alpha = catchChance({ ...base, alpha: true });
    expect(alpha).toBeLessThan(plain);
    expect(alpha).toBeCloseTo(Math.pow(Math.pow(plain, 1 / 0.75) * ALPHA_CATCH, 0.75), 6);
  });
});
