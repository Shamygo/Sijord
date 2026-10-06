import { describe, expect, it } from 'vitest';
import { applyCraft, craftBlock, craftSpend, RECIPES, recipeById } from '../src/shared/crafting';
import { gatherWay, NODE_RULES, pruneDepleted, rollYield, TOOL_USES, wearTool, type NodeKind } from '../src/shared/gathering';
import { ITEMS } from '../src/shared/items';
import { chopPitch, toolModel } from '../src/client/player/tools';
import { earnedXp, trainerLevel, TRAINER_MAX_LEVEL, xpForLevel, xpToNext } from '../src/shared/trainer-level';

describe('trainer levels', () => {
  it('starts at 1 and needs more experience for each level', () => {
    expect(trainerLevel(0)).toEqual({ level: 1, into: 0, need: xpToNext(1) });
    for (let l = 1; l < 20; l++) expect(xpToNext(l + 1)).toBeGreaterThan(xpToNext(l));
    expect(trainerLevel(xpForLevel(3)).level).toBe(3);
    expect(trainerLevel(xpForLevel(3) - 1).level).toBe(2);
    expect(trainerLevel(1e9)).toEqual({ level: TRAINER_MAX_LEVEL, into: 0, need: 0 });
  });

  it('level 3 (the workbench) takes a handful of new catches, not one', () => {
    expect(xpForLevel(3)).toBeGreaterThan(4 * 60);
    expect(xpForLevel(3)).toBeLessThan(8 * 60);
  });

  it('back-dates experience for old saves from catches, the rival and finds, not Hazel\'s gifts', () => {
    expect(earnedXp({})).toBe(0);
    const xp = earnedXp({ starter: 'cindlet', dex: { caught: ['cindlet', 'hjordpup', 'weedle', 'pidgey'] }, flags: ['beat-rival'], found: ['cache-arch', 'tablet-arch', 'note-gate'] });
    expect(xp).toBe(2 * 60 + 60 + 15 + 25 + 10);
  });
});

describe('gathering', () => {
  const none = () => false, all = () => true;

  it('every node can be worked one way or another and grows back', () => {
    for (const [kind, r] of Object.entries(NODE_RULES)) {
      expect(r.hand || r.withTool, kind).toBeTruthy();
      expect(r.regrow, kind).toBeGreaterThanOrEqual(300);
      for (const way of [r.hand, r.withTool]) for (const id of Object.keys(way?.gives ?? {})) expect(ITEMS[id], `${kind} gives ${id}`).toBeTruthy();
    }
  });

  it('tools beat bare hands, and copper needs a pick', () => {
    expect(gatherWay('tree', none)?.gives.wood).toEqual([1, 1]);
    expect(gatherWay('tree', all)?.tool).toBe('stone-hatchet');
    expect(gatherWay('copper', none)).toBeNull();
    expect(gatherWay('copper', (t) => t === 'stone-pick')?.gives['copper-ore']).toEqual([1, 1]);
    expect(gatherWay('boulder', none)).toBeNull();
  });

  it('rolls within range and drops zero counts', () => {
    const way = gatherWay('copper', all)!;
    expect(rollYield(way, () => 0)).toEqual({ 'copper-ore': 1 });
    expect(rollYield(way, () => 0.999)).toEqual({ 'copper-ore': 1, stone: 1 });
    for (const kind of Object.keys(NODE_RULES) as NodeKind[]) {
      const w = gatherWay(kind, all)!;
      for (const [id, n] of Object.entries(rollYield(w, Math.random))) expect(n).toBeLessThanOrEqual(w.gives[id][1]);
    }
  });

  it('forgets nodes that have grown back', () => {
    expect(pruneDepleted({ a: 100, b: 300 }, 200)).toEqual({ b: 300 });
  });

  it('every tool has a model to hold, swung over the top from behind to in front', () => {
    for (const id of Object.keys(TOOL_USES)) expect(toolModel(id), id).not.toBeNull();
    expect(toolModel('wood')).toBeNull();
    expect(chopPitch(0)).toBeCloseTo(205);
    expect(chopPitch(0.3)).toBeCloseTo(-12);
    // Both ways round pass straight up (90), never straight down (-90 or 270) through the legs.
    const swing = Array.from({ length: 100 }, (_, i) => chopPitch(i / 100));
    expect(Math.min(...swing)).toBeGreaterThan(-90);
    expect(Math.max(...swing)).toBeLessThan(270);
  });

  it('wears tools out and moves on to the next one', () => {
    const bag: Record<string, number> = { 'stone-pick': 2 }, wear: Record<string, number> = {};
    for (let i = 0; i < TOOL_USES['stone-pick'] - 1; i++) expect(wearTool(bag, wear, 'stone-pick').broke).toBe(false);
    expect(wearTool(bag, wear, 'stone-pick').broke).toBe(true);
    expect(bag['stone-pick']).toBe(1);
    expect(wear['stone-pick']).toBeUndefined();
    expect(wearTool(bag, wear, 'stone-pick').broke).toBe(false);
    expect(wear['stone-pick']).toBe(TOOL_USES['stone-pick'] - 1);
    expect(wearTool({}, wear, 'stone-hatchet').broke).toBe(false);
  });
});

describe('crafting', () => {
  it('recipes make real items from real items', () => {
    for (const r of RECIPES) {
      expect(ITEMS[r.out], r.id).toBeTruthy();
      for (const id of Object.keys(r.cost)) expect(ITEMS[id], `${r.id} needs ${id}`).toBeTruthy();
    }
  });

  it('a Poke Ball needs the workbench, level 3 and a trip for apricorns and copper', () => {
    const ball = recipeById('poke-ball')!;
    const bag = { 'red-apricorn': 1, 'copper-ore': 1, fiber: 2 };
    expect(craftBlock(ball, bag, 2, ['workbench'])).toBe('level');
    expect(craftBlock(ball, bag, 3, [])).toBe('station');
    expect(craftBlock(ball, { ...bag, fiber: 1 }, 3, ['workbench'])).toBe('materials');
    expect(craftBlock(ball, bag, 3, ['workbench'])).toBeNull();
    expect(craftBlock(recipeById('stone-hatchet')!, { wood: 3, stone: 2, fiber: 2 }, 1, [])).toBeNull();
  });

  it('takes the materials and adds the result', () => {
    const bag: Record<string, number> = { 'red-apricorn': 1, 'copper-ore': 2, fiber: 2, 'poke-ball': 1 };
    const r = recipeById('poke-ball')!;
    applyCraft(r, bag, craftSpend(r, 1, Math.random));
    expect(bag).toEqual({ 'copper-ore': 1, 'poke-ball': 2 });
  });

  it('the Artisan pays about 8% less over many crafts, never more than the cost', () => {
    const r = recipeById('stone-pick')!;
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let paid = 0, full = 0;
    for (let i = 0; i < 4000; i++) {
      const s = craftSpend(r, 0.92, rand);
      for (const [id, n] of Object.entries(s)) {
        expect(n).toBeLessThanOrEqual(r.cost[id]);
        paid += n;
        full += r.cost[id];
      }
    }
    expect(paid / full).toBeGreaterThan(0.9);
    expect(paid / full).toBeLessThan(0.94);
    expect(craftSpend(r, 1, () => 0.5)).toEqual(r.cost);
  });
});
