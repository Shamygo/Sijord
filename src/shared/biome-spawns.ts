import { BIOMES, type BiomeId } from './region';

/**
 * Wild herds beyond the vale, by biome (DESIGN §2.2 and §3.2). Wild levels do not scale: each
 * biome keeps its band, so far regions are dangerous and their Pokémon tempting but hard to
 * control (a creature above your level cap is harder to catch and may not listen).
 *
 * `night` is the weight after dark (0: it sleeps); `habitat` keeps water species by water and
 * rock species on rocky ground. Herd sizes keep most fights two on two, rare species alone or in
 * pairs. The vale itself keeps its own tables in src/client/overworld/wild.ts.
 */
export interface BiomeSpawn {
  species: string;
  weight: number;
  night?: number;
  min: number;
  max: number;
  herd: [number, number];
  habitat?: 'water' | 'rock';
}

const E = (species: string, weight: number, min: number, max: number, herd: [number, number] = [2, 3], extra: Partial<BiomeSpawn> = {}): BiomeSpawn =>
  ({ species, weight, min, max, herd, ...extra });
const W = (species: string, weight: number, min: number, max: number, herd: [number, number] = [2, 3], extra: Partial<BiomeSpawn> = {}): BiomeSpawn =>
  E(species, weight, min, max, herd, { habitat: 'water', ...extra });
const R = (species: string, weight: number, min: number, max: number, herd: [number, number] = [2, 3], extra: Partial<BiomeSpawn> = {}): BiomeSpawn =>
  E(species, weight, min, max, herd, { habitat: 'rock', ...extra });

export const BIOME_SPAWNS: Record<BiomeId, BiomeSpawn[]> = {
  // Hearthmeadow beyond the vale: farmland, hedgerows and herds. Levels 4-16.
  meadow: [
    E('finchlet', 10, 4, 9, [2, 4], { night: 2 }), E('fjordling', 4, 13, 16, [2, 3], { night: 1 }),
    E('nibblet', 10, 4, 9, [2, 4], { night: 6 }), E('stashquill', 3, 14, 16, [1, 2], { night: 3 }),
    E('spearow', 8, 5, 10, [2, 3], { night: 1 }), E('nidoran-f', 6, 5, 10), E('nidoran-m', 6, 5, 10),
    E('nidorina', 2, 14, 16, [1, 2]), E('nidorino', 2, 14, 16, [1, 2]), E('doduo', 5, 8, 12, [2, 3], { night: 1 }),
    E('tauros', 2, 14, 16, [2, 4], { night: 1 }), E('meowth', 3, 6, 12, [1, 2], { night: 10 }), E('persian', 0, 15, 16, [1, 1], { night: 2 }),
    E('jigglypuff', 3, 6, 12, [1, 2], { night: 6 }), E('oddish', 4, 6, 12, [2, 3], { night: 12 }), E('bellsprout', 5, 6, 12),
    E('pikachu', 1, 8, 12, [1, 2]), E('eevee', 1, 8, 12, [1, 1]), E('chansey', 0.4, 12, 16, [1, 1]), E('kangaskhan', 0.5, 14, 16, [1, 1]),
    E('hjordpup', 2, 8, 12, [1, 2]), E('ponyta', 3, 8, 14, [2, 3], { night: 1 }), E('diglett', 3, 6, 12, [2, 3]),
    E('zubat', 0, 6, 12, [2, 4], { night: 12 }), E('venonat', 0, 8, 12, [1, 2], { night: 6 }), E('cloveret', 1, 8, 12, [1, 2], { night: 6 }),
    E('snorlax', 0.15, 16, 16, [1, 1]),
    W('magikarp', 4, 5, 12, [2, 4]), W('goldeen', 4, 6, 12), W('psyduck', 4, 6, 12, [1, 2]), W('poliwag', 4, 6, 12), W('slowpoke', 3, 8, 14, [1, 2]),
  ],
  // Mirefen: bog, poison and ghosts. Levels 14-26.
  mirefen: [
    E('grimer', 8, 14, 22, [2, 3], { night: 10 }), E('muk', 1, 24, 26, [1, 1], { night: 2 }), E('koffing', 4, 14, 20),
    E('ekans', 6, 14, 20), E('arbok', 3, 22, 26, [1, 2]), E('bellsprout', 4, 14, 18), E('weepinbell', 4, 20, 26),
    E('oddish', 3, 14, 18, [2, 3], { night: 8 }), E('gloom', 3, 18, 24, [1, 2], { night: 6 }), E('venonat', 3, 16, 22, [2, 3], { night: 8 }),
    E('gastly', 0, 16, 22, [2, 3], { night: 14 }), E('haunter', 0, 24, 26, [1, 2], { night: 4 }),
    E('zubat', 0, 16, 20, [2, 4], { night: 8 }), E('golbat', 0, 22, 26, [1, 2], { night: 3 }),
    E('tangela', 1.5, 18, 24, [1, 1]), E('lickitung', 1, 18, 24, [1, 1]),
    W('poliwag', 6, 14, 20), W('poliwhirl', 5, 20, 26), W('psyduck', 4, 14, 22, [1, 2]), W('golduck', 2, 24, 26, [1, 1]),
    W('slowpoke', 4, 14, 22, [1, 2]), W('tentacool', 3, 14, 20), W('magikarp', 4, 14, 20, [2, 4]),
  ],
  // Elderwood: old forest, bugs and spores. Levels 11-23.
  elderwood: [
    E('dewmite', 8, 11, 14, [2, 4], { night: 2 }), E('cocoonch', 4, 12, 15, [2, 3]), E('auroramoth', 3, 14, 20, [1, 2], { night: 1 }),
    E('weedle', 8, 11, 14, [2, 4], { night: 2 }), E('kakuna', 4, 12, 15, [2, 3]), E('beedrill', 3, 16, 22, [2, 3]),
    E('paras', 8, 12, 18, [2, 3], { night: 6 }), E('parasect', 2, 21, 23, [1, 2]),
    E('venonat', 2, 12, 18, [2, 3], { night: 10 }), E('venomoth', 0, 20, 23, [1, 2], { night: 3 }),
    E('oddish', 4, 12, 18, [2, 3], { night: 10 }), E('gloom', 2, 18, 23, [1, 2], { night: 6 }),
    E('bellsprout', 4, 12, 18), E('weepinbell', 2, 20, 23, [1, 2]), E('exeggcute', 3, 14, 20, [1, 2]),
    E('tangela', 3, 14, 22, [1, 1]), E('scyther', 0.8, 18, 23, [1, 1]), E('pinsir', 0.8, 18, 23, [1, 1]),
    E('finchlet', 3, 12, 16, [2, 3], { night: 1 }), E('fjordling', 2, 18, 23, [1, 2]),
    E('zubat', 0, 12, 18, [2, 4], { night: 6 }), E('abra', 1, 12, 18, [1, 1]), E('jigglypuff', 2, 12, 18, [1, 2], { night: 6 }),
  ],
  // Runestone Heath: the plateau of standing stones and psychic Pokémon. Levels 18-30.
  heath: [
    E('abra', 4, 18, 22, [1, 1]), E('kadabra', 3, 22, 28, [1, 1]), E('drowzee', 8, 18, 24, [2, 3], { night: 10 }), E('hypno', 3, 26, 30, [1, 2], { night: 4 }),
    E('cloveret', 4, 18, 24, [1, 2], { night: 10 }), E('luckhare', 0, 26, 30, [1, 1], { night: 2 }),
    E('jigglypuff', 4, 18, 24, [1, 2], { night: 6 }), E('wigglytuff', 1, 26, 30, [1, 1], { night: 2 }),
    E('nidorina', 4, 18, 24), E('nidorino', 4, 18, 24), E('ponyta', 5, 18, 24), E('rapidash', 1, 28, 30, [1, 1]),
    E('vulpix', 3, 18, 24, [1, 2]), E('persian', 3, 22, 28, [1, 1], { night: 5 }), E('meowth', 3, 18, 22, [1, 2], { night: 6 }),
    E('machop', 3, 18, 24), E('tauros', 2, 22, 30, [2, 4]), E('chansey', 0.6, 24, 30, [1, 1]), E('lickitung', 1, 20, 26, [1, 1]),
    R('geodude', 6, 18, 24), R('graveler', 3, 25, 30, [1, 2]), R('onix', 2, 22, 30, [1, 1]),
  ],
  // Fjordlands: sea cliffs and inlets. Levels 22-34.
  fjord: [
    E('fearow', 5, 22, 30, [1, 2]), E('fjordling', 6, 22, 30, [2, 3]), E('skjaldhawk', 1, 32, 34, [1, 1]),
    E('machop', 4, 22, 28), E('machoke', 2, 28, 34, [1, 2]),
    E('zubat', 0, 22, 26, [2, 4], { night: 8 }), E('golbat', 0, 26, 34, [1, 2], { night: 4 }),
    R('geodude', 5, 22, 26), R('graveler', 4, 25, 34, [1, 2]), R('onix', 2, 24, 34, [1, 1]),
    W('seel', 6, 22, 28), W('dewgong', 2, 32, 34, [1, 1]), W('tentacool', 6, 22, 28, [2, 4]), W('tentacruel', 3, 30, 34, [1, 2]),
    W('krabby', 6, 22, 26), W('kingler', 3, 28, 34, [1, 2]), W('shellder', 5, 22, 30), W('slowpoke', 3, 22, 28, [1, 2]),
    W('slowbro', 1, 32, 34, [1, 1]), W('golduck', 3, 26, 34, [1, 2]), W('poliwhirl', 3, 25, 32),
    W('magikarp', 4, 22, 30, [2, 4]), W('gyarados', 0.6, 30, 34, [1, 1]), W('lapras', 0.3, 30, 34, [1, 1]),
  ],
  // Sunscar Badlands: red canyons and dry riverbeds. Levels 20-34.
  badlands: [
    E('sandshrew', 10, 20, 24), E('sandslash', 5, 24, 34, [1, 2]), E('diglett', 8, 20, 26, [2, 3]), E('dugtrio', 4, 26, 34, [1, 2]),
    E('cubone', 6, 20, 26, [1, 2]), E('marowak', 3, 28, 34, [1, 1]), E('ekans', 4, 20, 24), E('arbok', 3, 24, 34, [1, 2]),
    E('vulpix', 4, 20, 26, [1, 2], { night: 6 }), E('ninetales', 1, 32, 34, [1, 1], { night: 2 }),
    E('hjordpup', 4, 20, 26, [1, 2]), E('shepherion', 0.3, 32, 34, [1, 1]), E('doduo', 5, 20, 28), E('dodrio', 3, 30, 34, [1, 2]),
    E('tauros', 3, 26, 34, [2, 4]), E('rhyhorn', 4, 24, 32, [1, 2]), E('rhydon', 0.5, 32, 34, [1, 1]),
    E('mankey', 4, 20, 26), E('primeape', 3, 28, 34, [1, 2]), E('machop', 4, 20, 26), E('machoke', 2, 28, 34, [1, 2]),
    E('ponyta', 3, 20, 28), E('rapidash', 2, 32, 34, [1, 1]), E('kangaskhan', 0.7, 28, 34, [1, 1]),
    E('zubat', 0, 20, 26, [2, 4], { night: 8 }), E('golbat', 0, 28, 34, [1, 2], { night: 3 }), E('meowth', 0, 20, 26, [1, 2], { night: 5 }), E('persian', 0, 28, 34, [1, 1], { night: 2 }),
  ],
  // Skerry Archipelago: islands, reefs and dragons in the shallows. Levels 30-45.
  skerry: [
    E('exeggcute', 5, 30, 34, [1, 2]), E('exeggutor', 3, 36, 45, [1, 1]), E('pikachu', 2, 30, 34, [1, 2]), E('raichu', 1, 34, 40, [1, 1]),
    E('fearow', 3, 30, 40, [1, 2]), E('skjaldhawk', 2, 38, 45, [1, 1]),
    W('tentacool', 6, 30, 34, [2, 4]), W('tentacruel', 5, 34, 45, [1, 2]), W('staryu', 0, 30, 36, [2, 3], { night: 10 }), W('starmie', 0, 38, 45, [1, 1], { night: 3 }),
    W('horsea', 6, 30, 34), W('seadra', 4, 34, 45, [1, 2]), W('krabby', 4, 30, 34), W('kingler', 4, 34, 45, [1, 2]),
    W('shellder', 4, 30, 36), W('cloyster', 1, 40, 45, [1, 1]), W('slowpoke', 3, 30, 36, [1, 2]), W('slowbro', 3, 38, 45, [1, 1]),
    W('seel', 3, 30, 36), W('dewgong', 2, 38, 45, [1, 1]), W('lapras', 1, 38, 45, [1, 1]), W('gyarados', 1, 38, 45, [1, 1]),
    W('magikarp', 3, 30, 40, [2, 4]), W('dratini', 0.8, 30, 36, [1, 1]), W('dragonair', 0.3, 38, 45, [1, 1]),
  ],
  // Ashen Highlands: volcano, lava and smoke. Levels 35-50.
  ashen: [
    E('magmar', 4, 35, 45, [1, 2]), E('ponyta', 4, 35, 40), E('rapidash', 4, 40, 50, [1, 2]), E('hjordpup', 3, 35, 40, [1, 2]), E('shepherion', 1, 44, 50, [1, 1]),
    E('vulpix', 2, 35, 40, [1, 2]), E('ninetales', 2, 40, 50, [1, 1]), E('koffing', 5, 35, 40), E('weezing', 3, 40, 50, [1, 2]),
    E('grimer', 3, 35, 40), E('muk', 2, 40, 50, [1, 1]), E('magnemite', 4, 35, 40), E('magneton', 2, 40, 50, [1, 2]),
    E('rhyhorn', 3, 35, 42), E('rhydon', 2, 42, 50, [1, 1]), E('machoke', 3, 35, 45, [1, 2]), E('machamp', 1, 45, 50, [1, 1]),
    E('pyrolynx', 0.5, 35, 40, [1, 1]), E('golbat', 0, 35, 45, [1, 2], { night: 8 }),
    R('geodude', 4, 35, 40), R('graveler', 5, 38, 46, [1, 2]), R('golem', 2, 45, 50, [1, 1]), R('onix', 4, 35, 50, [1, 1]),
  ],
  // Rimefrost Tundra: snowfields and frozen lakes. Levels 40-55.
  tundra: [
    E('jynx', 4, 40, 50, [1, 2]), E('skjaldhawk', 2, 45, 55, [1, 1]), E('fearow', 3, 40, 50, [1, 2]), E('chansey', 0.6, 45, 55, [1, 1]),
    E('lickitung', 1, 40, 50, [1, 1]), E('snorlax', 0.4, 50, 55, [1, 1]), E('golbat', 0, 40, 50, [1, 2], { night: 6 }), E('electabuzz', 1, 45, 55, [1, 1]),
    W('seel', 5, 40, 45), W('dewgong', 5, 45, 55, [1, 2]), W('shellder', 4, 40, 46), W('cloyster', 3, 45, 55, [1, 1]),
    W('lapras', 1.2, 45, 55, [1, 1]), W('slowbro', 2, 45, 55, [1, 1]), W('golduck', 3, 40, 50, [1, 2]), W('gyarados', 1, 45, 55, [1, 1]), W('magikarp', 3, 40, 46, [2, 4]),
  ],
  // Stormcrown Peaks: the high spine round the League. Levels 55-75.
  peaks: [
    E('machoke', 3, 55, 60, [1, 2]), E('machamp', 3, 60, 75, [1, 1]), E('primeape', 3, 55, 70, [1, 2]), E('electabuzz', 4, 55, 70, [1, 1]),
    E('magneton', 3, 55, 70, [1, 2]), E('electrode', 3, 55, 65, [1, 2]), E('voltorb', 2, 55, 60), E('aerodactyl', 1.5, 60, 75, [1, 1]),
    E('dragonair', 1, 55, 65, [1, 1]), E('dragonite', 0.3, 65, 75, [1, 1]), E('golbat', 3, 55, 65, [1, 2], { night: 10 }),
    E('hitmonlee', 0.8, 60, 70, [1, 1]), E('hitmonchan', 0.8, 60, 70, [1, 1]), E('skjaldhawk', 3, 55, 70, [1, 2]), E('fearow', 3, 55, 65, [1, 2]),
    E('kangaskhan', 0.5, 60, 70, [1, 1]), E('snorlax', 0.3, 65, 75, [1, 1]), E('jynx', 2, 55, 65, [1, 1]), E('tauros', 2, 55, 65, [2, 3]),
    E('haunter', 0, 55, 65, [1, 2], { night: 3 }), E('gengar', 0, 60, 70, [1, 1], { night: 2 }),
    R('graveler', 4, 55, 60, [1, 2]), R('golem', 4, 60, 75, [1, 1]), R('onix', 4, 55, 70, [1, 1]), R('rhydon', 2, 60, 75, [1, 1]),
  ],
};

/** Every species that lives somewhere in the region beyond the vale. */
export function biomeSpecies(): Set<string> {
  return new Set(Object.values(BIOME_SPAWNS).flatMap((l) => l.map((e) => e.species)));
}

/** The level band a biome's table stays inside (from BIOMES, with Hearthmeadow's outer reaches at 4-16). */
export function biomeBand(b: BiomeId): [number, number] {
  return b === 'meadow' ? [4, 16] : BIOMES[b].levels;
}
