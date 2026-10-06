import { describe, expect, it } from 'vitest';
import { RECIPES, recipeById } from '../src/shared/crafting';
import { NODE_RULES } from '../src/shared/gathering';
import { ITEMS } from '../src/shared/items';
import { canteenRoom, consume, meterState, OPEN_WATER, stepMeters, SURVIVAL, survivalEffects, type Meters } from '../src/shared/survival';
import { TrainerVitals } from '../src/shared/trainer-vitals';

const full = (): Meters => ({ hunger: 100, thirst: 100, queasy: 0 });

/** Run the meters for `seconds` in one-second steps; total HP lost. */
function run(m: Meters, seconds: number, opts = { drain: 1, inTown: false }): number {
  let hp = 0;
  for (let t = 0; t < seconds; t++) hp += stepMeters(m, 1, opts).hpLoss;
  return hp;
}

describe('hunger and thirst', () => {
  it('empty in about an hour and forty minutes out in the wild, four times slower in town', () => {
    const m = full();
    run(m, 40 * 60);
    expect(m.thirst).toBe(0);
    expect(m.hunger).toBeCloseTo(100 - 40 * 60 / 36, 5);
    run(m, 20 * 60);
    expect(m.hunger).toBeCloseTo(0, 5);
    const town = full();
    run(town, 40 * 60, { drain: 1, inTown: true });
    expect(town.thirst).toBeCloseTo(75, 5);
  });

  it('the Scholar drains faster and the Medic slower', () => {
    const scholar = full(), medic = full();
    run(scholar, 600, { drain: 1.1, inTown: false });
    run(medic, 600, { drain: 0.9, inTown: false });
    expect(scholar.hunger).toBeLessThan(medic.hunger);
  });

  it('reports a meter only when it crosses into low or empty', () => {
    const m = { hunger: 25.01, thirst: 60, queasy: 0 };
    expect(stepMeters(m, 1, { drain: 1, inTown: false }).changed).toEqual(['hunger']);
    expect(meterState(m.hunger)).toBe('low');
    expect(stepMeters(m, 1, { drain: 1, inTown: false }).changed).toEqual([]);
    expect(meterState(0)).toBe('empty');
    expect(meterState(25)).toBe('ok');
  });

  it('empty meters cost HP: 1 every 3 s starving, 1 every 2 s parched', () => {
    expect(run({ hunger: 0, thirst: 100, queasy: 0 }, 30)).toBeCloseTo(10, 5);
    expect(run({ hunger: 100, thirst: 0, queasy: 0 }, 30)).toBeCloseTo(15, 5);
    expect(run(full(), 30)).toBe(0);
  });

  it('low meters bend stamina, and HP only comes back fed and watered', () => {
    expect(survivalEffects(full())).toEqual({ staminaRegen: 1, staminaCap: 1, heals: true });
    expect(survivalEffects({ hunger: 20, thirst: 100, queasy: 0 }).staminaRegen).toBe(0.5);
    expect(survivalEffects({ hunger: 20, thirst: 100, queasy: 30 }).staminaRegen).toBe(0.25);
    expect(survivalEffects({ hunger: 100, thirst: 20, queasy: 0 }).staminaCap).toBe(0.7);
    expect(survivalEffects({ hunger: 0, thirst: 100, queasy: 0 }).heals).toBe(false);
    expect(survivalEffects({ hunger: 100, thirst: 0, queasy: 0 }).heals).toBe(false);
  });

  it('eating fills up to the top, and risky food can leave you queasy for a while', () => {
    const m = { hunger: 80, thirst: 50, queasy: 0 };
    expect(consume(m, ITEMS['mushroom-skewer'].food!, () => 0).queasy).toBe(false);
    expect(m.hunger).toBe(100);
    expect(consume(m, OPEN_WATER, () => 0.9).queasy).toBe(false);
    expect(m.thirst).toBe(80);
    expect(consume(m, OPEN_WATER, () => 0.1).queasy).toBe(true);
    expect(m.queasy).toBe(SURVIVAL.queasySeconds);
    run(m, SURVIVAL.queasySeconds);
    expect(m.queasy).toBe(0);
  });
});

describe('food, water and canteens', () => {
  it('every food item fills something, and only raw food is risky', () => {
    const foods = Object.values(ITEMS).filter((i) => i.food);
    expect(foods.map((i) => i.id).sort()).toEqual(['bramble-berry', 'hearty-stew', 'mushroom-skewer', 'river-water', 'water-flask', 'wild-mushroom']);
    for (const f of foods) expect((f.food!.hunger ?? 0) + (f.food!.thirst ?? 0)).toBeGreaterThan(0);
    expect(ITEMS['mushroom-skewer'].food!.queasy).toBeUndefined();
    expect(ITEMS['water-flask'].food!.queasy).toBeUndefined();
    expect(ITEMS['hearty-stew'].food!.queasy).toBeUndefined();
    expect(ITEMS['wild-mushroom'].food!.queasy).toBeGreaterThan(0);
  });

  it('cooking is worth the trip: a skewer beats eating its mushrooms raw', () => {
    const r = recipeById('mushroom-skewer')!;
    expect(r.station).toBe('campfire');
    expect(ITEMS['mushroom-skewer'].food!.hunger!).toBeGreaterThan(r.cost['wild-mushroom'] * ITEMS['wild-mushroom'].food!.hunger!);
    const boil = recipeById('boiled-water')!;
    expect(boil.out).toBe('water-flask');
    expect(boil.cost['river-water']).toBe(1);
  });

  it('mushrooms grow on logs and are picked by hand', () => {
    expect(NODE_RULES.mushroom.hand?.gives).toHaveProperty('wild-mushroom');
  });

  it('canteens hold three drinks each, counting boiled-off water as freed room', () => {
    expect(canteenRoom({})).toBe(0);
    expect(canteenRoom({ canteen: 1 })).toBe(3);
    expect(canteenRoom({ canteen: 2, 'river-water': 4 })).toBe(2);
    expect(canteenRoom({ canteen: 1, 'river-water': 5 })).toBe(0);
    const canteen = RECIPES.find((r) => r.out === 'canteen')!;
    expect(canteen.station).toBe('workbench');
  });

  it('starving takes HP without knocking you down', () => {
    const v = new TrainerVitals(100);
    expect(v.drain(30)).toBe(false);
    expect(v.knockedDown).toBe(false);
    expect(v.hp).toBe(70);
    v.update(60, false, false);
    expect(v.hp).toBe(70);
    v.update(60, false, true);
    expect(v.hp).toBeGreaterThan(70);
    expect(v.drain(500)).toBe(true);
    expect(v.drain(1)).toBe(false);
  });
});
