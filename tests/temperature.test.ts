import { describe, expect, it } from 'vitest';
import { airTemp, exposureOf, feltTemp, heatEffects, heatState, regionHeat, stepHeat, TEMPERATURE, type Exposure } from '../src/shared/temperature';
import { armourStats, ARMOUR, calmReach, HIDE, resistTo, rollHide, shedsHide } from '../src/shared/armour';
import { clockAt, cycleFor, DAY_CYCLE_MS } from '../src/shared/daynight';
import { ITEMS } from '../src/shared/items';
import { biomeAt, SETTLEMENT_BY_ID } from '../src/shared/region';
import { craftBlock, recipeById } from '../src/shared/crafting';
import { SHOPS, VALUE } from '../src/shared/economy';
import { chargeDamage } from '../src/shared/trainer-vitals';
import { failedCatchReaction } from '../src/shared/overworld-catch';
import { stepMeters } from '../src/shared/survival';
import { SPECIES } from '../src/shared/data/species';

const open = (air: number, more: Partial<Exposure> = {}): Exposure => ({ air, warmth: 0, wet: 0, exertion: false, fire: false, town: false, partner: 0, ...more });
const CLOTH = { head: 'cloth-cap', body: 'cloth-tunic', legs: 'cloth-trousers' } as const;
const LEATHER = { head: 'leather-hood', body: 'leather-vest', legs: 'leather-leggings' } as const;
const bagOf = (eq: Record<string, string>) => Object.fromEntries(Object.values(eq).map((id) => [id, 1]));

/**
 * Spend a night out in the open from 21:00 until 09:00, a real second at a time on the shared
 * clock. Returns the lowest body heat and the HP the cold cost.
 */
function night(more: (minutes: number) => Partial<Exposure>, height = 0): { low: number; hp: number; end: number } {
  const start = cycleFor(21 * 60) * DAY_CYCLE_MS, end = (1 + cycleFor(9 * 60)) * DAY_CYCLE_MS;
  let heat = 0, low = 0, hp = 0;
  for (let ms = start; ms < end; ms += 1000) {
    const minutes = clockAt(ms);
    const e = open(airTemp(minutes, height), more(minutes));
    heat = stepHeat(heat, feltTemp(e), 1, e.fire);
    low = Math.min(low, heat);
    hp += heatEffects(heat).hpLoss;
  }
  return { low, hp, end: heat };
}

describe('the air', () => {
  it('is mild in the afternoon, cold before dawn, and colder on high ground', () => {
    expect(airTemp(14 * 60)).toBeCloseTo(TEMPERATURE.warmest, 5);
    expect(airTemp(5 * 60)).toBeCloseTo(TEMPERATURE.coldest, 5);
    expect(airTemp(10 * 60)).toBeGreaterThan(TEMPERATURE.comfort.low);
    expect(airTemp(3 * 60)).toBeLessThan(TEMPERATURE.comfort.low - 5);
    // Smooth all day round: no jumps at midnight or at the turn of the curve.
    for (let m = 0; m < 1440; m += 5) expect(Math.abs(airTemp(m + 5) - airTemp(m))).toBeLessThan(0.6);
    expect(airTemp(3 * 60, 50)).toBeLessThan(airTemp(3 * 60, 5) - 4);
    expect(airTemp(3 * 60, 9)).toBe(airTemp(3 * 60, 0));
  });
});

describe('how warm it feels', () => {
  it('clothes and hard work warm you, getting soaked chills you', () => {
    expect(feltTemp(open(5, { warmth: 9 }))).toBe(14);
    expect(feltTemp(open(5, { exertion: true }))).toBe(5 + TEMPERATURE.exertion);
    expect(feltTemp(open(15, { wet: 1 }))).toBe(15 - TEMPERATURE.wetChill);
    expect(feltTemp(open(15, { wet: 0.5 }))).toBe(15 - TEMPERATURE.wetChill / 2);
  });

  it('a fire or the town keeps the cold off, soaked or not', () => {
    expect(feltTemp(open(2, { wet: 1, fire: true }))).toBe(TEMPERATURE.fireFloor);
    expect(feltTemp(open(2, { town: true }))).toBe(TEMPERATURE.townFloor);
    expect(exposureOf(TEMPERATURE.townFloor)).toBe(0);
    // Neither makes a warm afternoon any cooler.
    expect(feltTemp(open(25, { town: true }))).toBe(25);
  });

  it('a Fire-type partner warms you in the cold but never makes you hot', () => {
    expect(feltTemp(open(4, { partner: TEMPERATURE.partner }))).toBe(4 + TEMPERATURE.partner);
    expect(feltTemp(open(15, { partner: TEMPERATURE.partner }))).toBe(TEMPERATURE.partnerCap);
    expect(feltTemp(open(25, { partner: TEMPERATURE.partner }))).toBe(25);
    expect(feltTemp(open(34, { partner: -TEMPERATURE.partner }))).toBe(34 - TEMPERATURE.partner);
    expect(feltTemp(open(5, { partner: -TEMPERATURE.partner }))).toBe(5);
  });
});

describe('body temperature', () => {
  it('a whole night in the open with nothing warm on freezes you before dawn', () => {
    const bare = night(() => ({}));
    expect(bare.low).toBe(-100);
    expect(bare.hp).toBeGreaterThan(30);
  });

  it('cloth keeps you from freezing, leather keeps you comfortable', () => {
    const cloth = night(() => ({ warmth: armourStats(CLOTH, bagOf(CLOTH)).warmth }));
    expect(heatState(cloth.low)).not.toBe('freezing');
    expect(cloth.low).toBeLessThan(-TEMPERATURE.chilly);
    expect(cloth.hp).toBe(0);
    const leather = night(() => ({ warmth: armourStats(LEATHER, bagOf(LEATHER)).warmth }));
    expect(heatState(leather.low)).toBe('ok');
  });

  it('a Fire-type partner out beside you gets you through the night', () => {
    const pup = night(() => ({ partner: TEMPERATURE.partner }));
    expect(pup.hp).toBe(0);
    expect(heatState(pup.low)).not.toBe('freezing');
  });

  it('a mesa top at night is cold even in leather, and wading at night chills you fast', () => {
    const top = night(() => ({ warmth: 9 }), 58);
    expect(top.low).toBeLessThan(-TEMPERATURE.chilly);
    let heat = 0, t = 0;
    while (heatState(heat) !== 'freezing') {
      heat = stepHeat(heat, feltTemp(open(airTemp(2 * 60), { wet: 1 })), 1);
      t++;
    }
    expect(t).toBeLessThan(200);
  });

  it('warms back up when comfortable, much faster by a fire', () => {
    const at = (felt: number, fire = false) => {
      let heat = -100, t = 0;
      while (heat < 0) {
        heat = stepHeat(heat, felt, 1, fire);
        t++;
      }
      return t;
    };
    expect(at(18)).toBeLessThan(100);
    expect(at(TEMPERATURE.fireFloor, true)).toBeLessThan(at(18) / 2);
    // Slightly too warm still brings a frozen trainer round at least as fast as comfortable.
    expect(at(TEMPERATURE.comfort.high + 1)).toBeLessThanOrEqual(at(18));
    expect(stepHeat(NaN, 18, 1)).toBe(0);
    expect(stepHeat(-99.9, -40, 10)).toBe(-100);
  });

  it('cold slows stamina, freezing costs HP; heat makes you thirsty', () => {
    expect(heatEffects(0)).toEqual({ staminaRegen: 1, thirst: 1, hpLoss: 0, heals: true });
    expect(heatEffects(-40).staminaRegen).toBe(1);
    expect(heatEffects(-70).staminaRegen).toBeLessThan(1);
    expect(heatEffects(-100).hpLoss).toBeGreaterThan(0);
    expect(heatEffects(-100).heals).toBe(false);
    expect(heatEffects(40).thirst).toBeGreaterThan(1);
    expect(heatEffects(100).hpLoss).toBeGreaterThan(0);
    const m = { hunger: 100, thirst: 100, queasy: 0 };
    stepMeters(m, 24, { drain: 1, inTown: false, thirst: heatEffects(70).thirst });
    expect(m.thirst).toBeCloseTo(98, 5);
  });
});

describe('leather armour', () => {
  it('adds up Defence, Warmth, Calm and resistances, only for pieces you carry', () => {
    const s = armourStats(LEATHER, bagOf(LEATHER));
    expect(s.defence).toBe(27);
    expect(s.warmth).toBe(9);
    expect(s.calm).toBeCloseTo(0.12, 5);
    expect(s.resist.poison).toBeCloseTo(0.4, 5);
    expect(s.resist.bug).toBeCloseTo(0.4, 5);
    expect(armourStats(LEATHER, { 'leather-vest': 1 }).defence).toBe(12);
    expect(armourStats(undefined, undefined)).toEqual({ defence: 0, warmth: 0, calm: 0, resist: {} });
    const c = armourStats(CLOTH, bagOf(CLOTH));
    expect(c.defence).toBe(15);
    expect(c.calm).toBe(0);
    expect(c.warmth).toBeGreaterThan(0);
    expect(c.warmth).toBeLessThan(s.warmth);
    expect(s.calm).toBeLessThanOrEqual(ARMOUR.maxCalm);
  });

  it('takes the sting out of a Zubat or Weedle more than anything else', () => {
    const s = armourStats(LEATHER, bagOf(LEATHER));
    const zubat = chargeDamage(8, undefined, s.defence, resistTo(s, SPECIES.zubat.types[0]));
    const mankey = chargeDamage(8, undefined, s.defence, resistTo(s, SPECIES.mankey.types[0]));
    expect(zubat).toBeLessThan(mankey);
    expect(mankey).toBeLessThan(chargeDamage(8, undefined, 15));
    expect(resistTo(s, undefined)).toBe(0);
    expect(chargeDamage(30, 80, 0, 5)).toBeGreaterThan(0);
  });

  it('Calm keeps wild Pokémon from squaring up so soon, and sometimes talks one down', () => {
    expect(calmReach(0)).toBe(1);
    expect(calmReach(0.12)).toBeCloseTo(0.76, 5);
    expect(calmReach(1)).toBe(0.5);
    expect(failedCatchReaction('aggressive', 0, 0.1, true)).toBe('charge');
    expect(failedCatchReaction('aggressive', 0, 0.1, true, 0.12)).toBe('startle');
    expect(failedCatchReaction('aggressive', 0, 0.3, true, 0.12)).toBe('charge');
    expect(failedCatchReaction('territorial', 0, 0.2, true, 0.12)).toBe('startle');
    expect(failedCatchReaction('docile', 0, 0.07, true)).toBe('battle');
    expect(failedCatchReaction('docile', 0, 0.07, true, 0.05)).toBe('startle');
  });

  it('is sewn from hide that furred and scaly Pokémon leave behind', () => {
    for (const id of ['nibblet', 'mankey', 'hjordpup', 'ekans', 'nidoran-m', 'pikachu', 'eevee']) expect(shedsHide(SPECIES[id].types), id).toBe(true);
    for (const id of ['spearow', 'zubat', 'weedle', 'oddish', 'psyduck', 'geodude', 'jigglypuff']) expect(shedsHide(SPECIES[id].types), id).toBe(false);
    let got = 0;
    let r = 1;
    const rand = () => (r = (r * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 4000; i++) got += rollHide([SPECIES.nibblet.types, SPECIES.spearow.types], rand);
    expect(got / 4000).toBeCloseTo(HIDE.chance, 1);
    expect(ITEMS.hide.category).toBe('materials');
  });

  it('takes trainer level 5 or 6 and real effort, and The Clothier charges dear for it', () => {
    let hide = 0;
    for (const id of ['leather-hood', 'leather-leggings', 'leather-vest']) {
      const r = recipeById(id)!;
      expect(r.station).toBe('workbench');
      expect(r.tp).toBe(1);
      expect(r.level).toBeGreaterThanOrEqual(5);
      hide += r.cost.hide;
      expect(ITEMS[id].armour).toBeDefined();
      expect(SHOPS.clothier.stock).toContain(id);
      expect(craftBlock(r, { hide: 9, 'woven-cloth': 9, fiber: 9 }, 6, ['workbench'], [id])).toBeNull();
    }
    // A full set is a couple of dozen won battles' worth of hide.
    expect(hide / HIDE.chance).toBeGreaterThan(20);
    expect(VALUE['leather-vest']).toBeGreaterThan(VALUE['cloth-tunic'] * 3);
    expect(SHOPS.clothier.stock).not.toContain('hide');
  });
});

describe('the land itself', () => {
  const find = (biome: string) => {
    for (let x = -3100; x <= 3100; x += 50) for (let z = -1500; z <= 4700; z += 50) {
      if (biomeAt(x, z) === biome && biomeAt(x + 150, z) === biome && biomeAt(x - 150, z) === biome && biomeAt(x, z + 150) === biome && biomeAt(x, z - 150) === biome) return [x, z] as const;
    }
    throw new Error(`no ${biome}`);
  };

  it('is mild at home, bitter in the tundra and scorching in the badlands', () => {
    const home = SETTLEMENT_BY_ID.bramblewick;
    expect(Math.abs(regionHeat(home.x, home.z))).toBeLessThan(1);
    expect(regionHeat(...find('tundra'))).toBeLessThan(-10);
    expect(regionHeat(...find('badlands'))).toBeGreaterThan(10);
  });

  it('caps the cold of high ground', () => {
    expect(airTemp(5 * 60, 1000)).toBeCloseTo(TEMPERATURE.coldest - TEMPERATURE.lapseMax, 5);
  });
});
