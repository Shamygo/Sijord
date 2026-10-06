import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DISCOVERIES } from '../src/shared/discoveries';
import { DEFECTOR, DEFECTOR_LORE, defectorState, nextMeal, nextTip, pendingTip, tipDirections } from '../src/shared/defector';
import { ITEMS } from '../src/shared/items';
import { RECIPES } from '../src/shared/crafting';
import { Defector } from '../src/client/npc/defector';
import type { World } from '../src/client/world/types';

const caches = DISCOVERIES.filter((d) => d.kind === 'cache');

describe('the Tether Defector', () => {
  it('takes a meal you can cook', () => {
    expect(ITEMS[DEFECTOR.fee]?.category).toBe('food');
    expect(RECIPES.some((r) => r.out === DEFECTOR.fee && r.station === 'campfire')).toBe(true);
  });

  it('points you to the best cache first, then the next, and never one you already found', () => {
    const first = nextTip([], [])!;
    expect(first.kind).toBe('cache');
    // The best haul he knows of has a Great Ball in it.
    expect(first.loot?.['great-ball']).toBeGreaterThan(0);
    const second = nextTip([], [first.id])!;
    expect(second.id).not.toBe(first.id);
    expect(nextTip([first.id], [])!.id).not.toBe(first.id);
    // Found or told about every one: nothing left to tell.
    expect(nextTip(caches.map((c) => c.id), [])).toBeUndefined();
    expect(nextTip([], caches.map((c) => c.id))).toBeUndefined();
  });

  it('reminds you of the last cache he told you about until you find it', () => {
    const [a, b] = [caches[0], caches[1]];
    expect(pendingTip([], [])).toBeUndefined();
    expect(pendingTip([], [a.id, b.id])!.id).toBe(b.id);
    expect(pendingTip([b.id], [a.id, b.id])!.id).toBe(a.id);
    expect(pendingTip([a.id, b.id], [a.id, b.id])).toBeUndefined();
    expect(pendingTip([], ['nonsense'])).toBeUndefined();
  });

  it('gives directions with north as +Z and east as -X', () => {
    const at = (dx: number, dz: number, onTop = false) => tipDirections({ ...caches[0], x: DEFECTOR.x + dx, z: DEFECTOR.z + dz, onTop });
    expect(at(0, 200)).toBe('about 200 m north of here');
    expect(at(-200, 0)).toBe('about 200 m east of here');
    expect(at(200, 0)).toBe('about 200 m west of here');
    expect(at(0, -120)).toBe('about 100 m south of here');
    expect(at(-150, 150)).toBe('about 200 m north-east of here');
    expect(at(10, 5)).toBe('about 50 m north-west of here');
    expect(at(0, 300, true)).toMatch(/north of here, up high/);
  });

  it('trades one piece of lore per meal and a cache while any are left', () => {
    let st = defectorState(undefined);
    expect(st).toEqual({ fed: 0, told: [] });
    const found: string[] = [];
    const seen: string[] = [];
    for (let i = 0; i < 40; i++) {
      const meal = nextMeal(st, found);
      if (!meal) break;
      if (meal.lore) seen.push(meal.lore);
      st = { fed: st.fed + 1, told: meal.tip ? [...st.told, meal.tip.id] : st.told };
    }
    expect(seen).toEqual(DEFECTOR_LORE);
    expect(new Set(st.told).size).toBe(caches.length);
    expect(nextMeal(st, found)).toBeNull();
  });

  it('loads whatever an old or hand-edited save has', () => {
    expect(defectorState(null)).toEqual({ fed: 0, told: [] });
    expect(defectorState([1, 2])).toEqual({ fed: 0, told: [] });
    expect(defectorState({ fed: 'lots', told: 'x' })).toEqual({ fed: 0, told: [] });
    expect(defectorState({ fed: 2.7, told: ['a', 3, null, 'b'] })).toEqual({ fed: 2, told: ['a', 'b'] });
    expect(defectorState({ fed: -4 })).toEqual({ fed: 0, told: [] });
  });

  it('sits in a solid bale and only shows himself when he peeks out', () => {
    const world = { heightAt: () => 0, colliders: [] } as unknown as World;
    const sten = new Defector(world);
    expect(world.colliders.length).toBe(1);
    const near = new THREE.Vector3(DEFECTOR.x + 3, 0, DEFECTOR.z);
    sten.update(0.1, near);
    expect(sten.root.visible).toBe(true);
    const head = () => sten.root.getObjectByName('sten')!.position.y;
    const hidden = head();
    sten.setPeeking(true);
    for (let i = 0; i < 30; i++) sten.update(0.1, near);
    expect(head()).toBeGreaterThan(hidden + 0.4);
    sten.setPeeking(false);
    for (let i = 0; i < 30; i++) sten.update(0.1, near);
    expect(head()).toBeCloseTo(hidden, 2);
    sten.update(0.1, new THREE.Vector3(DEFECTOR.x + 500, 0, DEFECTOR.z));
    expect(sten.root.visible).toBe(false);
  });
});
