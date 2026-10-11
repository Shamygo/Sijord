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
  // The rest of Kanto, for the wider region (2026-10-11). Their models load on demand (REGION_ONLY).
  arbok: { dex: 24, name: 'Arbok' }, sandshrew: { dex: 27, name: 'Sandshrew' }, sandslash: { dex: 28, name: 'Sandslash' }, nidorina: { dex: 30, name: 'Nidorina' },
  nidoqueen: { dex: 31, name: 'Nidoqueen' }, nidorino: { dex: 33, name: 'Nidorino' }, nidoking: { dex: 34, name: 'Nidoking' }, ninetales: { dex: 38, name: 'Ninetales' },
  wigglytuff: { dex: 40, name: 'Wigglytuff' }, golbat: { dex: 42, name: 'Golbat' }, vileplume: { dex: 45, name: 'Vileplume' }, paras: { dex: 46, name: 'Paras' },
  parasect: { dex: 47, name: 'Parasect' }, venonat: { dex: 48, name: 'Venonat' }, venomoth: { dex: 49, name: 'Venomoth' }, diglett: { dex: 50, name: 'Diglett' },
  dugtrio: { dex: 51, name: 'Dugtrio' }, persian: { dex: 53, name: 'Persian' }, golduck: { dex: 55, name: 'Golduck' }, primeape: { dex: 57, name: 'Primeape' },
  poliwhirl: { dex: 61, name: 'Poliwhirl' }, poliwrath: { dex: 62, name: 'Poliwrath' }, kadabra: { dex: 64, name: 'Kadabra' }, alakazam: { dex: 65, name: 'Alakazam' },
  machop: { dex: 66, name: 'Machop' }, machoke: { dex: 67, name: 'Machoke' }, machamp: { dex: 68, name: 'Machamp' }, weepinbell: { dex: 70, name: 'Weepinbell' },
  victreebel: { dex: 71, name: 'Victreebel' }, tentacool: { dex: 72, name: 'Tentacool' }, tentacruel: { dex: 73, name: 'Tentacruel' }, graveler: { dex: 75, name: 'Graveler' },
  golem: { dex: 76, name: 'Golem' }, rapidash: { dex: 78, name: 'Rapidash' }, slowpoke: { dex: 79, name: 'Slowpoke' }, slowbro: { dex: 80, name: 'Slowbro' },
  magnemite: { dex: 81, name: 'Magnemite' }, magneton: { dex: 82, name: 'Magneton' }, doduo: { dex: 84, name: 'Doduo' }, dodrio: { dex: 85, name: 'Dodrio' },
  seel: { dex: 86, name: 'Seel' }, dewgong: { dex: 87, name: 'Dewgong' }, grimer: { dex: 88, name: 'Grimer' }, muk: { dex: 89, name: 'Muk' },
  shellder: { dex: 90, name: 'Shellder' }, cloyster: { dex: 91, name: 'Cloyster' }, gastly: { dex: 92, name: 'Gastly' }, haunter: { dex: 93, name: 'Haunter' },
  gengar: { dex: 94, name: 'Gengar' }, onix: { dex: 95, name: 'Onix' }, drowzee: { dex: 96, name: 'Drowzee' }, hypno: { dex: 97, name: 'Hypno' },
  krabby: { dex: 98, name: 'Krabby' }, kingler: { dex: 99, name: 'Kingler' }, voltorb: { dex: 100, name: 'Voltorb' }, electrode: { dex: 101, name: 'Electrode' },
  exeggcute: { dex: 102, name: 'Exeggcute' }, exeggutor: { dex: 103, name: 'Exeggutor' }, cubone: { dex: 104, name: 'Cubone' }, marowak: { dex: 105, name: 'Marowak' },
  hitmonlee: { dex: 106, name: 'Hitmonlee' }, hitmonchan: { dex: 107, name: 'Hitmonchan' }, lickitung: { dex: 108, name: 'Lickitung' }, koffing: { dex: 109, name: 'Koffing' },
  weezing: { dex: 110, name: 'Weezing' }, rhyhorn: { dex: 111, name: 'Rhyhorn' }, rhydon: { dex: 112, name: 'Rhydon' }, chansey: { dex: 113, name: 'Chansey' },
  tangela: { dex: 114, name: 'Tangela' }, kangaskhan: { dex: 115, name: 'Kangaskhan' }, horsea: { dex: 116, name: 'Horsea' }, seadra: { dex: 117, name: 'Seadra' },
  goldeen: { dex: 118, name: 'Goldeen' }, seaking: { dex: 119, name: 'Seaking' }, staryu: { dex: 120, name: 'Staryu' }, starmie: { dex: 121, name: 'Starmie' },
  scyther: { dex: 123, name: 'Scyther' }, jynx: { dex: 124, name: 'Jynx' }, electabuzz: { dex: 125, name: 'Electabuzz' }, magmar: { dex: 126, name: 'Magmar' },
  pinsir: { dex: 127, name: 'Pinsir' }, tauros: { dex: 128, name: 'Tauros' }, magikarp: { dex: 129, name: 'Magikarp' }, gyarados: { dex: 130, name: 'Gyarados' },
  lapras: { dex: 131, name: 'Lapras' }, aerodactyl: { dex: 142, name: 'Aerodactyl' }, snorlax: { dex: 143, name: 'Snorlax' }, dratini: { dex: 147, name: 'Dratini' },
  dragonair: { dex: 148, name: 'Dragonair' }, dragonite: { dex: 149, name: 'Dragonite' },
};

/** Species that only live beyond the vale: their models are fetched the first time one is needed. */
export const REGION_ONLY = new Set<string>(['arbok', 'sandshrew', 'sandslash', 'nidorina', 'nidoqueen', 'nidorino', 'nidoking', 'ninetales', 'wigglytuff', 'golbat', 'vileplume', 'paras', 'parasect', 'venonat', 'venomoth', 'diglett', 'dugtrio', 'persian', 'golduck', 'primeape', 'poliwhirl', 'poliwrath', 'kadabra', 'alakazam', 'machop', 'machoke', 'machamp', 'weepinbell', 'victreebel', 'tentacool', 'tentacruel', 'graveler', 'golem', 'rapidash', 'slowpoke', 'slowbro', 'magnemite', 'magneton', 'doduo', 'dodrio', 'seel', 'dewgong', 'grimer', 'muk', 'shellder', 'cloyster', 'gastly', 'haunter', 'gengar', 'onix', 'drowzee', 'hypno', 'krabby', 'kingler', 'voltorb', 'electrode', 'exeggcute', 'exeggutor', 'cubone', 'marowak', 'hitmonlee', 'hitmonchan', 'lickitung', 'koffing', 'weezing', 'rhyhorn', 'rhydon', 'chansey', 'tangela', 'kangaskhan', 'horsea', 'seadra', 'goldeen', 'seaking', 'staryu', 'starmie', 'scyther', 'jynx', 'electabuzz', 'magmar', 'pinsir', 'tauros', 'magikarp', 'gyarados', 'lapras', 'aerodactyl', 'snorlax', 'dratini', 'dragonair', 'dragonite']);


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
