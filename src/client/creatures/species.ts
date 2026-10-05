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

/** Fallback used for ids that have no dedicated model. */
export function fallbackSpecies(): SpeciesDef {
  return SPECIES.cindlet;
}
