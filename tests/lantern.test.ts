import { describe, expect, it } from 'vitest';
import { burnLantern, isDark, LANTERN, lanternOil } from '../src/shared/lantern';
import { litAt, nightOf, STARDUST, stardustSpots, stardustState } from '../src/shared/stardust';
import { cycleFor, DAY_CYCLE_MS, isNight } from '../src/shared/daynight';
import { ITEMS } from '../src/shared/items';
import { recipeById } from '../src/shared/crafting';
import { SHOPS, VALUE, SELL_RATE } from '../src/shared/economy';
import { TRAINER_XP } from '../src/shared/trainer-level';

describe('the lantern', () => {
  it('only does anything once the sun is down', () => {
    expect(isDark(12 * 60)).toBe(false);
    expect(isDark(18 * 60 + 59)).toBe(false);
    expect(isDark(19 * 60)).toBe(true);
    expect(isDark(3 * 60)).toBe(true);
    expect(isDark(6 * 60)).toBe(false);
  });

  it('burns about two nights of oil, then is spent', () => {
    const bag: Record<string, number> = { lantern: 1 };
    const wear: Record<string, number> = {};
    expect(lanternOil(bag, wear)).toBe(LANTERN.seconds);
    // A night is 10 real minutes: one lantern lasts two whole nights.
    expect(LANTERN.seconds).toBeGreaterThanOrEqual(2 * DAY_CYCLE_MS / 3 / 1000);
    expect(LANTERN.seconds).toBeLessThanOrEqual(2.5 * DAY_CYCLE_MS / 3 / 1000);
    expect(burnLantern(bag, wear, 600)).toEqual({ left: LANTERN.seconds - 600, burnedOut: false });
    expect(lanternOil(bag, wear)).toBe(LANTERN.seconds - 600);
    expect(burnLantern(bag, wear, LANTERN.seconds).burnedOut).toBe(true);
    expect(bag.lantern).toBeUndefined();
    expect(wear.lantern).toBeUndefined();
    expect(burnLantern(bag, wear, 1)).toEqual({ left: 0, burnedOut: false });
  });

  it('starts a spare fresh once the first burns out', () => {
    const bag: Record<string, number> = { lantern: 2 };
    const wear: Record<string, number> = { lantern: 5 };
    expect(burnLantern(bag, wear, 6).burnedOut).toBe(true);
    expect(bag.lantern).toBe(1);
    expect(lanternOil(bag, wear)).toBe(LANTERN.seconds);
    // A hand-edited save can't hold more oil than a lantern does.
    expect(lanternOil(bag, { lantern: 1e9 })).toBe(LANTERN.seconds);
    expect(lanternOil(bag, { lantern: -4 })).toBe(LANTERN.seconds);
  });

  it('is made at the workbench from copper, or bought dear', () => {
    const r = recipeById('lantern')!;
    expect(r.station).toBe('workbench');
    expect(r.cost['copper-ore']).toBeGreaterThanOrEqual(2);
    expect(r.tp).toBe(1);
    expect(ITEMS.lantern.category).toBe('tools');
    expect(SHOPS['field-supplies'].stock).toContain('lantern');
    expect(VALUE.lantern).toBeGreaterThan(VALUE.canteen);
  });
});

describe('fallen stardust', () => {
  const ok = () => true;

  it('falls in the same places for both friends, and differently each night', () => {
    const a = stardustSpots(1234, 77, 550, ok);
    const b = stardustSpots(1234, 77, 550, ok);
    expect(a).toEqual(b);
    expect(a.length).toBe(STARDUST.perNight);
    expect(stardustSpots(1234, 78, 550, ok)).not.toEqual(a);
    expect(stardustSpots(999, 77, 550, ok)).not.toEqual(a);
    expect(new Set(a.map((s) => s.id)).size).toBe(a.length);
    for (const s of a) {
      expect(Math.abs(s.x)).toBeLessThanOrEqual(550);
      expect(Math.abs(s.z)).toBeLessThanOrEqual(550);
      for (const t of a) if (t !== s) expect(Math.hypot(s.x - t.x, s.z - t.z)).toBeGreaterThanOrEqual(STARDUST.spacing);
    }
  });

  it('only lands where the ground allows, and is mostly Stardust', () => {
    const east = stardustSpots(5, 3, 550, (x) => x < 0);
    for (const s of east) expect(s.x).toBeLessThan(0);
    let pieces = 0, all = 0;
    for (let n = 0; n < 60; n++) for (const s of stardustSpots(42, n, 550, ok)) { all++; if (s.piece) pieces++; }
    expect(pieces / all).toBeGreaterThan(0.06);
    expect(pieces / all).toBeLessThan(0.25);
  });

  it('belongs to one night: the whole night, until sunrise', () => {
    const day = 5000;
    const dusk = (day + cycleFor(20 * 60)) * DAY_CYCLE_MS;
    const lateNight = (day + cycleFor(5 * 60)) * DAY_CYCLE_MS;
    expect(isNight(20 * 60)).toBe(true);
    expect(nightOf(dusk)).toBe(nightOf(lateNight));
    const nextMorning = (day + 1 + cycleFor(7 * 60)) * DAY_CYCLE_MS;
    expect(nightOf(nextMorning)).toBe(nightOf(dusk) + 1);
  });

  it('forgets what you picked up once the night is over', () => {
    expect(stardustState(undefined, 9)).toEqual({ night: 9, taken: [] });
    expect(stardustState({ night: 9, taken: ['9.1', '9.1', '8.2', 4] }, 9)).toEqual({ night: 9, taken: ['9.1'] });
    expect(stardustState({ night: 8, taken: ['8.1'] }, 9)).toEqual({ night: 9, taken: [] });
  });

  it('can only be found by a lantern close by, yours or your friend', () => {
    expect(litAt(10, 10, [])).toBe(false);
    expect(litAt(10, 10, [{ x: 0, z: 0, r: LANTERN.reach }])).toBe(false);
    expect(litAt(4, 4, [{ x: 0, z: 0, r: LANTERN.reach }])).toBe(true);
    expect(litAt(4, 4, [{ x: 100, z: 0, r: LANTERN.reach }, { x: 6, z: 6, r: LANTERN.reach }])).toBe(true);
  });

  it('pays something, but not so much it beats a night of battles', () => {
    for (const id of ['stardust', 'star-piece']) {
      expect(ITEMS[id]).toBeDefined();
      expect(VALUE[id]).toBeGreaterThan(0);
    }
    const night = STARDUST.perNight * (1 - STARDUST.pieceChance) * VALUE.stardust * SELL_RATE + STARDUST.perNight * STARDUST.pieceChance * VALUE['star-piece'] * SELL_RATE;
    // Picking up every one in a night pays about a handful of Poke Balls.
    expect(night / VALUE['poke-ball']).toBeLessThan(15);
    expect(TRAINER_XP.stardust).toBeGreaterThan(0);
  });
});
