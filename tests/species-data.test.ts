import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import catalogue from '../src/client/assets/pokemon-catalogue.json';
import { ZONES } from '../src/client/overworld/wild';
import { createCreature, defaultMoves, normalizeCreature } from '../src/shared/battle/creature';
import { Rng } from '../src/shared/battle/rng';
import { xpForLevel } from '../src/shared/battle/stats';
import { ABILITIES } from '../src/shared/data/abilities';
import { MOVES } from '../src/shared/data/moves';
import { SPECIES, SPECIES_IDS, STARTERS } from '../src/shared/data/species';
import { POKEMON_VISUALS, inGameplayPack, pokemonModelPath } from '../src/shared/pokemon-visuals';

const ORIGINAL_IDS = [
  'fernfawn', 'bramblebuck', 'elkwarden', 'cindlet', 'pyrolynx', 'forgelynx', 'splashpup', 'sealkin', 'selkira',
  'finchlet', 'fjordling', 'skjaldhawk', 'nibblet', 'stashquill', 'dewmite', 'cocoonch', 'auroramoth',
  'cloveret', 'luckhare', 'hjordpup', 'shepherion',
];

describe('canonical species', () => {
  it('keeps every original save id', () => {
    for (const id of ORIGINAL_IDS) expect(SPECIES[id], id).toBeDefined();
    expect(STARTERS).toEqual(['fernfawn', 'cindlet', 'splashpup']);
    expect(SPECIES_IDS.length).toBeGreaterThanOrEqual(41);
  });

  it('names new species after the Pokémon and gives every species its visual entry', () => {
    expect(Object.keys(POKEMON_VISUALS).sort()).toEqual([...SPECIES_IDS].sort());
    for (const sp of Object.values(SPECIES)) {
      const v = POKEMON_VISUALS[sp.id];
      expect(sp.name).toBe(v.name);
      expect(sp.dex).toBe(`#${String(v.dex).padStart(3, '0')}`);
      if (!ORIGINAL_IDS.includes(sp.id)) expect(sp.id).toBe(v.name.toLowerCase().replace('♀', '-f').replace('♂', '-m'));
    }
    expect(new Set(Object.values(POKEMON_VISUALS).map((v) => v.dex)).size).toBe(SPECIES_IDS.length);
  });

  it('has an animated model in the catalogue, shipped at the path the game loads', () => {
    for (const [id, v] of Object.entries(POKEMON_VISUALS)) {
      const entry = catalogue.models.find((m) => m.id === `regular/${v.dex}`);
      expect(entry, id).toBeDefined();
      expect(entry!.local, id).toBe(pokemonModelPath(v.dex));
      expect(entry!.animations, id).toContain('walk');
      expect(existsSync(resolve(__dirname, '../public', entry!.local)), entry!.local).toBe(true);
      expect(inGameplayPack(v.dex), id).toBe(ORIGINAL_IDS.includes(id));
    }
  });

  it('only uses moves and abilities the engine has, and evolves into species that exist', () => {
    for (const sp of Object.values(SPECIES)) {
      expect(sp.abilities.length, sp.id).toBeGreaterThan(0);
      for (const a of [...sp.abilities, ...(sp.hiddenAbility ? [sp.hiddenAbility] : [])]) expect(ABILITIES[a], `${sp.id}: ${a}`).toBeDefined();
      for (const e of sp.learnset) {
        expect(MOVES[e.move], `${sp.id}: ${e.move}`).toBeDefined();
        expect(e.level, `${sp.id}: ${e.move}`).toBeGreaterThanOrEqual(1);
      }
      expect(new Set(sp.learnset.map((e) => e.move)).size, `${sp.id} learns a move twice`).toBe(sp.learnset.length);
      for (let level = 1; level <= 15; level++) expect(defaultMoves(sp.id, level).length, `${sp.id} at ${level}`).toBeGreaterThan(0);
      if (sp.evolution) {
        expect(SPECIES[sp.evolution.into], `${sp.id} evolves`).toBeDefined();
        expect(sp.evolution.level).toBeGreaterThan(1);
        expect(SPECIES[sp.evolution.into].growth, `${sp.id} line growth`).toBe(sp.growth);
      }
    }
  });

  it('has the canonical types and an original description for each species', () => {
    const types: Record<string, string[]> = {
      fernfawn: ['grass', 'poison'], forgelynx: ['fire', 'flying'], selkira: ['water'], finchlet: ['normal', 'flying'],
      auroramoth: ['bug', 'flying'], cloveret: ['fairy'], hjordpup: ['fire'], shepherion: ['fire'], weedle: ['bug', 'poison'],
      pikachu: ['electric'], jigglypuff: ['normal', 'fairy'], zubat: ['poison', 'flying'], geodude: ['rock', 'ground'], eevee: ['normal'],
    };
    for (const [id, t] of Object.entries(types)) expect(SPECIES[id].types, id).toEqual(t);
    expect(SPECIES.hjordpup.abilities).toEqual(['intimidate', 'flash-fire']);
    expect(SPECIES.hjordpup.growth).toBe('slow');
    expect(SPECIES.dewmite.evolution).toEqual({ into: 'cocoonch', level: 7 });
    expect(SPECIES.finchlet.catchRate).toBe(255);
    expect(SPECIES.eevee.catchRate).toBe(45);
    const seen = new Set<string>();
    for (const sp of Object.values(SPECIES)) {
      expect(sp.description.length, sp.id).toBeGreaterThan(20);
      expect(sp.description, sp.id).not.toMatch(/pok[eé]dex #|national/i);
      expect(seen.has(sp.description), `${sp.id} repeats a description`).toBe(false);
      seen.add(sp.description);
      expect(sp.height).toBeGreaterThan(0);
    }
  });
});

describe('wild spawn tables', () => {
  it('only spawns real species, inside the first level cap', () => {
    for (const zone of ZONES) {
      for (const e of zone.entries) {
        expect(SPECIES[e.species], e.species).toBeDefined();
        expect(e.min).toBeGreaterThanOrEqual(2);
        expect(e.min).toBeLessThanOrEqual(e.max);
        expect(e.max).toBeLessThanOrEqual(15);
        expect(e.herd[0]).toBeGreaterThanOrEqual(1);
        expect(e.herd[0]).toBeLessThanOrEqual(e.herd[1]);
      }
    }
  });

  it('keeps the town outskirts low level, common bugs and birds common and the prized ones rare', () => {
    const near = ZONES[0].entries;
    for (const e of near) expect(e.max, e.species).toBeLessThanOrEqual(7);
    const weight = (id: string) => near.find((e) => e.species === id)?.weight ?? 0;
    const common = ['nibblet', 'finchlet', 'dewmite', 'weedle'];
    const rare = ['pikachu', 'eevee', 'abra'];
    for (const c of common) for (const r of rare) expect(weight(c), `${c} vs ${r}`).toBeGreaterThan(weight(r) * 5);
    for (const r of rare) expect(weight(r), r).toBeGreaterThan(0);
    const spawned = new Set(ZONES.flatMap((z) => z.entries.map((e) => e.species)));
    for (const id of ['weedle', 'spearow', 'ekans', 'pikachu', 'nidoran-f', 'nidoran-m', 'oddish', 'bellsprout', 'poliwag', 'psyduck', 'geodude', 'zubat', 'eevee', 'abra']) {
      expect(spawned.has(id), id).toBe(true);
    }
  });
});

describe('old saves', () => {
  it('moves an ability the species no longer has to a legal one, and puts experience back on its curve', () => {
    const c = createCreature('hjordpup', 12, new Rng(1));
    // A Hjordpup saved before it became Growlithe: old ability, medium-fast experience.
    c.ability = 'run-away';
    c.xp = xpForLevel('medium-fast', 12) + 10;
    c.hp = 999;
    c.moves[0].pp = 99;
    expect(normalizeCreature(c)).toBe(true);
    expect(c.level).toBe(12);
    expect(c.ability).toBe('intimidate');
    expect(c.xp).toBeGreaterThanOrEqual(xpForLevel('slow', 12));
    expect(c.xp).toBeLessThan(xpForLevel('slow', 13));
    expect(c.hp).toBeLessThan(999);
    expect(c.moves[0].pp).toBe(MOVES[c.moves[0].id].pp);
    // Already fine: nothing changes.
    expect(normalizeCreature(c)).toBe(false);
    // A hidden ability is legal.
    c.ability = 'justified';
    expect(normalizeCreature(c)).toBe(false);
  });

  it('keeps moves a species no longer learns and leaves partial or unknown creatures alone', () => {
    const c = createCreature('fernfawn', 8, new Rng(2), { moves: ['tackle', 'leafage', 'quick-attack'] });
    normalizeCreature(c);
    expect(c.moves.map((m) => m.id)).toEqual(['tackle', 'leafage', 'quick-attack']);
    const partial = { species: 'cindlet', hp: 12, level: 5 } as never;
    expect(normalizeCreature(partial)).toBe(false);
    expect(partial).toEqual({ species: 'cindlet', hp: 12, level: 5 });
    const unknown = { ...createCreature('cindlet', 5, new Rng(3)), species: 'missingno' };
    expect(normalizeCreature(unknown)).toBe(false);
  });
});
