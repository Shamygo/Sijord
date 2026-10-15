import { describe, expect, it } from 'vitest';
import { RIDE_PROFILES, RIDING, SADDLE_TIERS, canRide, mountStats, mountTier, riddenSpeed, rideBlock, saddleId, stepMountStamina } from '../src/shared/riding';
import { craftBlock, recipeById } from '../src/shared/crafting';
import { ITEMS } from '../src/shared/items';
import { SHOPS, VALUE } from '../src/shared/economy';
import { SPECIES } from '../src/shared/data/species';
import { PLAYER_TUNING } from '../src/client/player/controller';

describe('mounts', () => {
  it('derive their speed, stamina and handling from the Pokémon (DESIGN §8.2)', () => {
    const rapidash = mountStats('rapidash')!;
    // Runner 11 m/s × (0.75 + 105/400).
    expect(rapidash.designSpeed).toBeCloseTo(11 * 1.0125, 5);
    expect(rapidash.tier).toBe('A');
    expect(rapidash.stamina).toBeCloseTo((60 + (65 + 70) / 4) / RIDING.staminaPerSecond, 5);
    expect(mountStats('dodrio')!.tier).toBe('S');
    expect(mountStats('rhyhorn')!.tier).toBe('B');
    expect(mountStats('dewgong')!.tier).toBe('C');
    // Heavier turns slower.
    expect(mountStats('lapras')!.handling).toBeLessThan(mountStats('seaking')!.handling);
    expect(mountStats('eevee')).toBeNull();
    expect(mountTier(5.9)).toBe('D');
    expect(mountTier(12)).toBe('S');
  });

  it('are all real species, each with its saddle, and every one outruns the trainer at a gallop', () => {
    for (const id of Object.keys(RIDE_PROFILES)) {
      expect(ITEMS[saddleId(id)], id).toBeDefined();
      expect(SPECIES[id], id).toBeDefined();
      expect(canRide(id)).toBe(true);
      const m = mountStats(id)!;
      // Land mounts beat a sprint (which runs out); even a slow swimmer beats walking.
      if (m.mode === 'land') expect(m.speed, id).toBeGreaterThan(PLAYER_TUNING.sprintSpeed);
      else expect(m.speed, id).toBeGreaterThan(PLAYER_TUNING.walkSpeed);
    }
  });

  it('need their own saddle, made at the workbench, dearer by tier and never sold', () => {
    expect(Object.keys(ITEMS).filter((i) => i.startsWith('saddle-')).length).toBe(Object.keys(RIDE_PROFILES).length);
    for (const id of Object.keys(RIDE_PROFILES)) {
      const sid = saddleId(id), r = recipeById(sid)!, t = SADDLE_TIERS[mountStats(id)!.tier];
      expect(ITEMS[sid], sid).toBeDefined();
      expect(r.station).toBe('workbench');
      expect(r.level).toBe(t.level);
      expect(r.tp).toBeGreaterThanOrEqual(1);
      expect(VALUE[sid]).toBe(t.value);
      for (const shop of Object.values(SHOPS)) expect(shop.stock).not.toContain(sid);
      expect(craftBlock(r, { ...t.cost }, t.level, ['workbench'], [sid])).toBeNull();
    }
    expect(SADDLE_TIERS.S.level).toBeGreaterThan(SADDLE_TIERS.B.level);
    expect(SADDLE_TIERS.S.cost['star-piece']).toBe(1);
  });

  it('carry you only with a saddle, when healthy, and not far over the level cap', () => {
    const bag = { [saddleId('rapidash')]: 1 };
    const horse = { species: 'rapidash', level: 30, hp: 50 };
    expect(rideBlock(horse, bag, 33)).toBeNull();
    expect(rideBlock(horse, {}, 33)).toBe('no-saddle');
    expect(rideBlock({ ...horse, hp: 0 }, bag, 33)).toBe('fainted');
    expect(rideBlock({ ...horse, level: 50 }, bag, 33)).toBe('too-wild');
    expect(rideBlock({ species: 'eevee', level: 5, hp: 5 }, bag, 15)).toBe('not-rideable');
    const m = mountStats('rapidash')!;
    expect(riddenSpeed(m, 36, 33)).toBeCloseTo(m.speed * RIDING.overCapSpeed, 5);
    expect(riddenSpeed(m, 33, 33)).toBe(m.speed);
  });

  it('tire at a gallop, get their breath back resting, and stay blown a while', () => {
    const m = mountStats('rapidash')!, st = { value: 1, rest: 0, blown: false };
    let t = 0;
    while (!st.blown && t < 100) { stepMountStamina(st, true, 0.1, m); t += 0.1; }
    expect(t).toBeCloseTo(m.stamina, 0);
    for (let i = 0; i < 20; i++) stepMountStamina(st, false, 0.1, m);
    expect(st.blown).toBe(true);
    for (let i = 0; i < 40; i++) stepMountStamina(st, false, 0.1, m);
    expect(st.blown).toBe(false);
  });
});

describe('flyers', () => {
  it('are rated like other mounts and tire in the air (DESIGN §8.2, §10.4)', () => {
    const zard = mountStats('forgelynx')!;
    expect(zard.mode).toBe('air');
    expect(zard.tier).toBe('A');
    expect(mountStats('aerodactyl')!.tier).toBe('S');
    expect(mountStats('dragonite')!.tier).toBe('B');
    // Cruising spends half a gallop's stamina: a full bar is good for a few hundred metres.
    const st = { value: 1, rest: 0, blown: false };
    let t = 0;
    while (!st.blown) { stepMountStamina(st, true, 0.1, zard, RIDING.flyDrain); t += 0.1; }
    expect(t).toBeCloseTo(zard.stamina / RIDING.flyDrain, 0);
    const reach = t * zard.speed * RIDING.flyCruise;
    expect(reach).toBeGreaterThan(250);
    expect(reach).toBeLessThan(900);
  });
});
