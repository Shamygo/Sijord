import { describe, expect, it } from 'vitest';
import { calcDamage, damageRange, modify } from '../src/shared/battle/damage';
import { calcStat, levelCap, stageMultiplier, xpForLevel, xpYield } from '../src/shared/battle/stats';
import { effectiveness } from '../src/shared/battle/typechart';

describe('stat formula', () => {
  // Bulbapedia's worked example: a level 78 Garchomp, Adamant, with the IVs and EVs below.
  it('matches the published Garchomp example', () => {
    expect(calcStat('hp', 108, 24, 74, 78, 'adamant')).toBe(289);
    expect(calcStat('atk', 130, 12, 190, 78, 'adamant')).toBe(278);
    expect(calcStat('def', 95, 30, 91, 78, 'adamant')).toBe(193);
    expect(calcStat('spa', 80, 16, 48, 78, 'adamant')).toBe(135);
    expect(calcStat('spd', 85, 23, 84, 78, 'adamant')).toBe(171);
    expect(calcStat('spe', 102, 5, 23, 78, 'adamant')).toBe(171);
  });

  it('applies stat stages', () => {
    expect(stageMultiplier(1)).toBe(1.5);
    expect(stageMultiplier(2)).toBe(2);
    expect(stageMultiplier(-1)).toBeCloseTo(2 / 3);
    expect(stageMultiplier(-6)).toBe(0.25);
    expect(stageMultiplier(9)).toBe(4);
  });
});

describe('damage formula', () => {
  it('matches the published Glaceon Ice Fang vs Garchomp example (168-196)', () => {
    // Level 75, 65 power, 123 Attack into 163 Defense, STAB, 4x effective.
    expect(damageRange({ level: 75, power: 65, attack: 123, defense: 163, stab: true, effectiveness: 4 })).toEqual([168, 196]);
  });

  it('rounds like the games (4096 fixed point, .5 rounds down)', () => {
    expect(modify(33, 1.5)).toBe(49); // 49.5 -> 49
    expect(modify(28, 1.5)).toBe(42);
    expect(modify(41, 0.75)).toBe(31);
  });

  it('applies the spread reduction before the random roll and STAB', () => {
    // base 41 -> spread 31 -> roll (26..31) -> STAB (39..46; 46.5 rounds down)
    expect(damageRange({ level: 50, power: 90, attack: 100, defense: 100, spread: true, stab: true, effectiveness: 1 })).toEqual([39, 46]);
  });

  it('applies critical hits and burns', () => {
    // base 54 -> crit 81 -> roll -> burn halves
    expect(damageRange({ level: 50, power: 80, attack: 120, defense: 80, crit: true, burned: true, effectiveness: 1 })).toEqual([34, 40]);
  });

  it('halves step by step for resisted hits and never goes below 1', () => {
    expect(calcDamage({ level: 75, power: 65, attack: 123, defense: 163, random: 100, effectiveness: 0.5 })).toBe(16);
    expect(calcDamage({ level: 2, power: 10, attack: 5, defense: 200, random: 85, effectiveness: 0.25 })).toBe(1);
    expect(calcDamage({ level: 50, power: 90, attack: 100, defense: 100, random: 100, effectiveness: 0 })).toBe(0);
  });
});

describe('type chart', () => {
  it('combines dual types', () => {
    expect(effectiveness('fire', ['grass', 'steel'])).toBe(4);
    expect(effectiveness('water', ['water', 'fairy'])).toBe(0.5);
    expect(effectiveness('ground', ['normal', 'flying'])).toBe(0);
    expect(effectiveness('fighting', ['normal', 'flying'])).toBe(1);
    expect(effectiveness('normal', ['ghost'])).toBe(0);
    expect(effectiveness('dragon', ['fairy'])).toBe(0);
    expect(effectiveness('grass', ['bug', 'grass'])).toBe(0.25);
  });
});

describe('experience', () => {
  it('follows the growth curves', () => {
    expect(xpForLevel('medium-slow', 5)).toBe(135);
    expect(xpForLevel('medium-slow', 6)).toBe(179);
    expect(xpForLevel('medium-slow', 1)).toBe(0);
    expect(xpForLevel('medium-fast', 10)).toBe(1000);
    expect(xpForLevel('fast', 10)).toBe(800);
    expect(xpForLevel('slow', 10)).toBe(1250);
  });

  it('pays more for beating higher-level foes, and more again from trainers', () => {
    expect(xpYield(64, 5, 5, false)).toBe(65);
    expect(xpYield(64, 5, 5, true)).toBe(97);
    expect(xpYield(64, 10, 5, false)).toBeGreaterThan(xpYield(64, 5, 5, false) * 2);
    expect(xpYield(64, 3, 12, false)).toBeLessThan(xpYield(64, 3, 3, false));
  });

  it('caps levels by badge count', () => {
    expect(levelCap(0)).toBe(15);
    expect(levelCap(1)).toBe(21);
    expect(levelCap(10)).toBe(76);
    expect(levelCap(3, true)).toBe(100);
  });
});
