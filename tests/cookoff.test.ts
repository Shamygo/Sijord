import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { COOK_MAX, COOK_STEPS, cookoffWon, judge, markerAt, PICNICKER, picnickerState, rivalScore, sweetSpot } from '../src/shared/cookoff';
import { canLearn, craftBlock, recipeById, techPoints } from '../src/shared/crafting';
import { VALUE } from '../src/shared/economy';
import { ITEMS } from '../src/shared/items';
import { Rng } from '../src/shared/battle/rng';
import { Picnicker } from '../src/client/npc/picnicker';
import type { World } from '../src/client/world/types';

describe("Gudrun's cook-off", () => {
  it('sweeps the marker there and back across the bar', () => {
    const s = COOK_STEPS[0];
    expect(markerAt(s, 0)).toBe(0);
    expect(markerAt(s, 1 / s.speed)).toBeCloseTo(1);
    expect(markerAt(s, 2 / s.speed)).toBeCloseTo(0);
    expect(markerAt(s, 0.5 / s.speed)).toBeCloseTo(0.5);
    for (let t = 0; t < 20; t += 0.037) {
      const x = markerAt(s, t);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
    }
    // Each step is faster and tighter than the last.
    for (let i = 1; i < COOK_STEPS.length; i++) {
      expect(COOK_STEPS[i].speed).toBeGreaterThan(COOK_STEPS[i - 1].speed);
      expect(COOK_STEPS[i].good).toBeLessThan(COOK_STEPS[i - 1].good);
    }
  });

  it('judges how close to the sweet spot you stopped', () => {
    const s = COOK_STEPS[1];
    expect(judge(s, 0.5, 0.5)).toBe(3);
    expect(judge(s, 0.5 + s.perfect + 0.001, 0.5)).toBe(2);
    expect(judge(s, 0.5 - s.good - 0.001, 0.5)).toBe(1);
    expect(judge(s, 0.5 + s.ok + 0.001, 0.5)).toBe(0);
    for (let seed = 0; seed < 50; seed++) {
      for (let i = 0; i < COOK_STEPS.length; i++) {
        const spot = sweetSpot(seed, i);
        expect(spot).toBeGreaterThanOrEqual(0.25);
        expect(spot).toBeLessThanOrEqual(0.75);
      }
    }
    expect(sweetSpot(1, 0)).not.toBe(sweetSpot(2, 0));
  });

  it('only counts an outright win, and she gets better once beaten', () => {
    expect(rivalScore(0)).toBe(6);
    expect(rivalScore(3)).toBe(7);
    expect(cookoffWon([2, 2, 2], 6)).toBe(false);
    expect(cookoffWon([3, 2, 2], 6)).toBe(true);
    expect(cookoffWon([3, 2, 2], 7)).toBe(false);
    expect(COOK_MAX).toBe(9);
  });

  it('is beatable with good timing and hopeless when sloppy', () => {
    // A player who presses with a timing error of sigma seconds (normally distributed).
    const rng = new Rng(9);
    const normal = () => Math.sqrt(-2 * Math.log(1 - rng.next())) * Math.cos(2 * Math.PI * rng.next());
    const winRate = (sigma: number) => {
      let wins = 0;
      for (let n = 0; n < 4000; n++) {
        const scores = COOK_STEPS.map((s) => judge(s, 0.5 + s.speed * sigma * normal(), 0.5));
        if (cookoffWon(scores, rivalScore(0))) wins++;
      }
      return wins / 4000;
    };
    const sharp = winRate(0.035), steady = winRate(0.06), sloppy = winRate(0.12);
    expect(sharp).toBeGreaterThan(0.75);
    expect(steady).toBeGreaterThan(0.3);
    expect(steady).toBeLessThan(0.65);
    expect(sloppy).toBeLessThan(0.15);
  });

  it('teaches a stew that can only be won, not bought with Technology Points', () => {
    const r = recipeById(PICNICKER.prize)!;
    expect(r.prize).toBeTruthy();
    expect(r.station).toBe('campfire');
    expect(ITEMS[r.out].food?.hunger).toBeGreaterThan(ITEMS['mushroom-skewer'].food!.hunger!);
    expect(VALUE[r.out]).toBeGreaterThan(0);
    const bag = { 'wild-mushroom': 5, 'bramble-berry': 5, 'river-water': 2, wood: 3 };
    expect(craftBlock(r, bag, 10, ['campfire'], [])).toBe('learn');
    expect(canLearn(r, 10, 99, [])).toBe(false);
    expect(craftBlock(r, bag, 10, ['campfire'], [r.id])).toBeNull();
    expect(craftBlock(r, {}, 10, ['campfire'], [r.id])).toBe('materials');
    // Winning it doesn't use up Technology Points.
    expect(techPoints(5, 0, [r.id]).spent).toBe(0);
    for (const id of Object.keys(PICNICKER.fee)) expect(ITEMS[id]).toBeDefined();
  });

  it('loads whatever an old or hand-edited save has', () => {
    expect(picnickerState(undefined)).toEqual({ wins: 0 });
    expect(picnickerState('x')).toEqual({ wins: 0 });
    expect(picnickerState({ wins: 2.9, day: 20000.5 })).toEqual({ wins: 2, day: 20000 });
    expect(picnickerState({ wins: -1, day: 'today' })).toEqual({ wins: 0 });
  });

  it('sets up a picnic with a grill anyone can cook at', () => {
    const world = { heightAt: () => 0, colliders: [], anchors: { stations: [{ kind: 'workbench', position: new THREE.Vector3() }] } } as unknown as World;
    const g = new Picnicker(world);
    expect(world.anchors.stations!.map((s) => s.kind)).toEqual(['workbench', 'campfire']);
    expect(g.grill.distanceTo(g.position)).toBeGreaterThan(1);
    expect(world.colliders.length).toBeGreaterThanOrEqual(2);
    const near = g.position.clone().add(new THREE.Vector3(3, 0, 0));
    g.update(0.1, near);
    expect(g.root.visible).toBe(true);
    g.update(0.1, new THREE.Vector3(1000, 0, 0));
    expect(g.root.visible).toBe(false);
  });
});
