import { describe, expect, it } from 'vitest';
import { BIOME_SPAWNS, biomeBand, biomeSpecies } from '../src/shared/biome-spawns';
import { BIOME_IDS } from '../src/shared/region';
import { SPECIES } from '../src/shared/data/species';
import { spawnTableAt, ZONES } from '../src/client/overworld/wild';

describe('biome spawn tables', () => {
  it('only spawn real species, inside each biome\'s level band', () => {
    for (const b of BIOME_IDS) {
      const [lo, hi] = biomeBand(b);
      for (const e of BIOME_SPAWNS[b]) {
        expect(SPECIES[e.species], `${b}: ${e.species}`).toBeDefined();
        expect(e.min, `${b}: ${e.species}`).toBeGreaterThanOrEqual(lo);
        expect(e.max, `${b}: ${e.species}`).toBeLessThanOrEqual(hi);
        expect(e.min).toBeLessThanOrEqual(e.max);
        expect(e.herd[0]).toBeGreaterThanOrEqual(1);
        expect(e.herd[0]).toBeLessThanOrEqual(e.herd[1]);
      }
    }
  });

  it('give every biome a varied roster by day and by night', () => {
    for (const b of BIOME_IDS) {
      const day = BIOME_SPAWNS[b].filter((e) => e.weight > 0 && !e.habitat);
      const night = BIOME_SPAWNS[b].filter((e) => (e.night ?? e.weight) > 0 && !e.habitat);
      expect(day.length, b).toBeGreaterThanOrEqual(4);
      expect(night.length, b).toBeGreaterThanOrEqual(3);
      expect(new Set(BIOME_SPAWNS[b].map((e) => e.species)).size, b).toBeGreaterThanOrEqual(12);
    }
  });

  it('fit each biome\'s types (DESIGN §2.2)', () => {
    const typesIn = (b: keyof typeof BIOME_SPAWNS) => new Set(BIOME_SPAWNS[b].flatMap((e) => SPECIES[e.species].types));
    expect(typesIn('mirefen').has('poison')).toBe(true);
    expect(typesIn('mirefen').has('ghost')).toBe(true);
    expect(typesIn('elderwood').has('bug')).toBe(true);
    expect(typesIn('heath').has('psychic')).toBe(true);
    expect(typesIn('badlands').has('ground')).toBe(true);
    expect(typesIn('ashen').has('fire')).toBe(true);
    expect(typesIn('tundra').has('ice')).toBe(true);
    expect(typesIn('skerry').has('dragon')).toBe(true);
    expect(typesIn('peaks').has('rock')).toBe(true);
  });

  it('reach almost every species in Sijord somewhere', () => {
    const wild = new Set([...biomeSpecies(), ...ZONES.flatMap((z) => z.entries.map((e) => e.species))]);
    const starters = ['fernfawn', 'bramblebuck', 'elkwarden', 'cindlet', 'forgelynx', 'splashpup', 'sealkin', 'selkira', 'eevee'];
    const missing = Object.keys(SPECIES).filter((id) => !wild.has(id) && !starters.includes(id));
    expect(missing.length, missing.join(', ')).toBeLessThanOrEqual(12);
  });

  it('keep the vale on its own tables and use the biome beyond it', () => {
    expect(spawnTableAt(0, -200)).toBe(ZONES[0].entries);
    expect(spawnTableAt(600, 4100)).toBe(BIOME_SPAWNS.tundra);
    expect(spawnTableAt(-2050, 2400)).toBe(BIOME_SPAWNS.ashen);
  });
});
