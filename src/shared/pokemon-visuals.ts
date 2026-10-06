/**
 * The Pokémon each gameplay species is, by stable save id. The first 21 ids are Sijord's
 * original slots (kept so existing saves load); species added later use the Pokémon's own
 * lowercase name as the id. A species needs an entry here to get its model, portrait, name and
 * dex number (src/shared/data/species.ts reads the name and number from this table).
 */
export const POKEMON_VISUALS: Record<string, { dex: number; name: string }> = {
  fernfawn: { dex: 1, name: 'Bulbasaur' }, bramblebuck: { dex: 2, name: 'Ivysaur' }, elkwarden: { dex: 3, name: 'Venusaur' },
  cindlet: { dex: 4, name: 'Charmander' }, pyrolynx: { dex: 5, name: 'Charmeleon' }, forgelynx: { dex: 6, name: 'Charizard' },
  splashpup: { dex: 7, name: 'Squirtle' }, sealkin: { dex: 8, name: 'Wartortle' }, selkira: { dex: 9, name: 'Blastoise' },
  finchlet: { dex: 16, name: 'Pidgey' }, fjordling: { dex: 17, name: 'Pidgeotto' }, skjaldhawk: { dex: 18, name: 'Pidgeot' },
  nibblet: { dex: 19, name: 'Rattata' }, stashquill: { dex: 20, name: 'Raticate' },
  dewmite: { dex: 10, name: 'Caterpie' }, cocoonch: { dex: 11, name: 'Metapod' }, auroramoth: { dex: 12, name: 'Butterfree' },
  cloveret: { dex: 35, name: 'Clefairy' }, luckhare: { dex: 36, name: 'Clefable' },
  hjordpup: { dex: 58, name: 'Growlithe' }, shepherion: { dex: 59, name: 'Arcanine' },
  // Hearthmeadow and Route 1 additions (ids are the Pokémon's names).
  weedle: { dex: 13, name: 'Weedle' }, kakuna: { dex: 14, name: 'Kakuna' }, beedrill: { dex: 15, name: 'Beedrill' },
  spearow: { dex: 21, name: 'Spearow' }, fearow: { dex: 22, name: 'Fearow' },
  ekans: { dex: 23, name: 'Ekans' },
  pikachu: { dex: 25, name: 'Pikachu' }, raichu: { dex: 26, name: 'Raichu' },
  'nidoran-f': { dex: 29, name: 'Nidoran♀' }, 'nidoran-m': { dex: 32, name: 'Nidoran♂' },
  vulpix: { dex: 37, name: 'Vulpix' }, jigglypuff: { dex: 39, name: 'Jigglypuff' }, zubat: { dex: 41, name: 'Zubat' },
  oddish: { dex: 43, name: 'Oddish' }, gloom: { dex: 44, name: 'Gloom' },
  meowth: { dex: 52, name: 'Meowth' }, psyduck: { dex: 54, name: 'Psyduck' }, mankey: { dex: 56, name: 'Mankey' },
  poliwag: { dex: 60, name: 'Poliwag' }, abra: { dex: 63, name: 'Abra' }, bellsprout: { dex: 69, name: 'Bellsprout' },
  geodude: { dex: 74, name: 'Geodude' }, ponyta: { dex: 77, name: 'Ponyta' }, eevee: { dex: 133, name: 'Eevee' },
};

/**
 * Dex numbers whose regular model ships uncompressed in the small gameplay pack
 * (public/models/pokemon/NNN.glb). Every other regular model is in the gzip-packed catalogue
 * (public/models/catalogue/regular/N.glb.gz). tests/species-data.test.ts checks both against
 * src/client/assets/pokemon-catalogue.json.
 */
const GAMEPLAY_PACK = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 16, 17, 18, 19, 20, 35, 36, 58, 59]);

/** Whether a dex number's model is in the gameplay pack (loaded before the world is built). */
export function inGameplayPack(dex: number): boolean {
  return GAMEPLAY_PACK.has(dex);
}

/** Path of a dex number's regular model under public/, as listed in the catalogue manifest. */
export function pokemonModelPath(dex: number): string {
  return GAMEPLAY_PACK.has(dex) ? `models/pokemon/${String(dex).padStart(3, '0')}.glb` : `models/catalogue/regular/${dex}.glb.gz`;
}
