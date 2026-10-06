import { EL, type Built, type SpeciesDef } from './defs';
import { finchlet, fjordling, skjaldhawk } from './birds';
import { auroramoth, cocoonch, dewmite } from './bugs';
import { sealkin, selkira, splashpup } from './seals';
import { bramblebuck, cindlet, cloveret, elkwarden, fernfawn, forgelynx, hjordpup, luckhare, nibblet, pyrolynx, shepherion, stashquill } from './quads';

/**
 * The Sijord species registry: standing height (metres), element colour for the special-move
 * glow and burst, and the builder that authors the model on its body plan.
 *
 * Heights are display heights, not the dex heights: small species are scaled up (a starter
 * stands about hip-high to the trainer, like the partner fox in the art reference) while the
 * big ones stay close to true size, so a line still grows visibly as it evolves.
 */

export type { Built, SpeciesDef };

export const SPECIES: Record<string, SpeciesDef> = {
  // Grass line
  fernfawn: { height: 0.95, element: EL.grass, build: fernfawn },
  bramblebuck: { height: 1.5, element: EL.grass, build: bramblebuck },
  elkwarden: { height: 2.3, element: EL.grass, build: elkwarden },
  // Fire line
  cindlet: { height: 0.9, element: EL.fire, build: cindlet },
  pyrolynx: { height: 1.35, element: EL.fire, build: pyrolynx },
  forgelynx: { height: 1.7, element: EL.fire, build: forgelynx },
  // Water line
  splashpup: { height: 0.8, element: EL.water, build: splashpup },
  sealkin: { height: 1.35, element: EL.water, build: sealkin },
  selkira: { height: 1.8, element: EL.fairy, build: selkira },
  // Birds
  finchlet: { height: 0.5, element: EL.flying, build: finchlet },
  fjordling: { height: 1.0, element: EL.flying, build: fjordling },
  skjaldhawk: { height: 1.6, element: EL.steel, build: skjaldhawk },
  // Rodents
  nibblet: { height: 0.55, element: EL.normal, build: nibblet },
  stashquill: { height: 1.0, element: EL.ground, build: stashquill },
  // Bugs
  dewmite: { height: 0.5, element: EL.bug, build: dewmite },
  cocoonch: { height: 0.9, element: EL.bug, build: cocoonch },
  auroramoth: { height: 1.4, element: '#8af0d0', build: auroramoth },
  // Rabbits
  cloveret: { height: 0.7, element: EL.fairy, build: cloveret },
  luckhare: { height: 1.2, element: EL.fairy, build: luckhare },
  // Herding dogs
  hjordpup: { height: 0.8, element: EL.normal, build: hjordpup },
  shepherion: { height: 1.45, element: EL.normal, build: shepherion },
};

/**
 * Display heights (metres) for species that only exist as imported Pokémon models, on the same
 * scale as the table above: small ones are scaled up so they read at third-person distance,
 * bigger ones stay near their dex height. Ekans and Zubat use their coiled / wing-spread size.
 */
export const IMPORTED_HEIGHTS: Record<string, number> = {
  weedle: 0.5, kakuna: 0.85, beedrill: 1.3,
  spearow: 0.5, fearow: 1.4,
  ekans: 0.8,
  pikachu: 0.6, raichu: 0.95,
  'nidoran-f': 0.55, 'nidoran-m': 0.6,
  vulpix: 0.75, jigglypuff: 0.6, zubat: 0.75,
  oddish: 0.6, gloom: 0.9,
  meowth: 0.6, psyduck: 0.9, mankey: 0.65,
  poliwag: 0.7, abra: 0.95, bellsprout: 0.85,
  geodude: 0.6, ponyta: 1.2, eevee: 0.55,
};

/** Fallback used for ids that have no dedicated model. */
export function fallbackSpecies(): SpeciesDef {
  return SPECIES.cindlet;
}
