import { describe, expect, it } from 'vitest';
import { createCreature } from '../src/shared/battle/creature';
import { Rng } from '../src/shared/battle/rng';
import { LEVEL_CAPS } from '../src/shared/battle/stats';
import { moveData } from '../src/shared/data/moves';
import { SPECIES } from '../src/shared/data/species';
import { aceLevel, awardBadge, bossMoves, echoTeam, gymAi, gymTeamSize, gymTrainers, GYMS, leaderTeam, registerForBoss } from '../src/shared/gyms';
import { SETTLEMENTS } from '../src/shared/region';

describe('gyms', () => {
  it('has a leader for every gym city, with real species in every band', () => {
    expect(GYMS.length).toBe(SETTLEMENTS.filter((s) => s.gym).length);
    for (const g of GYMS) {
      for (const band of g.bands) {
        expect(band.length).toBeGreaterThanOrEqual(3);
        for (const sp of band) expect(SPECIES[sp], `${g.id}: ${sp}`).toBeDefined();
      }
    }
  });

  it('scales the ace to the cap for the badges held, never below the record plus six', () => {
    expect(aceLevel({ tier: 0, record: 0 })).toBe(LEVEL_CAPS[0]);
    expect(aceLevel({ tier: 4, record: 0 })).toBe(LEVEL_CAPS[4]);
    expect(aceLevel({ tier: 1, record: 30 })).toBe(36);
    for (const g of GYMS) {
      for (const tier of [0, 3, 6, 9]) {
        const t = leaderTeam(g, { tier, record: 0 });
        expect(t.creatures.length).toBe(Math.min(gymTeamSize(tier), g.bands[Math.min(3, Math.floor(tier / 3))].length));
        expect(t.creatures.at(-1)!.level).toBe(LEVEL_CAPS[tier]);
        for (const c of t.creatures) {
          expect(c.level).toBeGreaterThanOrEqual(LEVEL_CAPS[tier] - 4);
          expect(c.moves.length).toBeGreaterThan(0);
          for (const m of c.moves) expect(() => moveData(m.id)).not.toThrow();
        }
      }
    }
  });

  it('gets stronger and smarter with the band', () => {
    const g = GYMS[0];
    const early = leaderTeam(g, { tier: 0, record: 0 });
    const late = leaderTeam(g, { tier: 8, record: 0 });
    expect(early.ai).toBe('t2');
    expect(late.ai).toBe('t3');
    expect(early.creatures.at(-1)!.ivs.atk).toBe(15);
    expect(late.creatures.at(-1)!.ivs.spe).toBe(31);
    expect(late.creatures.at(-1)!.item).toBe(g.items[0]);
    expect(gymAi(0, false)).toBe('t1');
  });

  it('fields two gym trainers a little under the ace', () => {
    for (const g of GYMS) {
      const [a, b] = gymTrainers(g, { tier: 2, record: 0 });
      expect(a.name).not.toBe(b.name);
      for (const c of [...a.creatures, ...b.creatures]) expect(c.level).toBeLessThan(aceLevel({ tier: 2, record: 0 }));
    }
  });

  it('picks boss moves with STAB and coverage', () => {
    const moves = bossMoves('gyarados', 40).map(moveData);
    expect(moves.length).toBe(4);
    expect(moves.some((m) => m.category !== 'status' && (m.type === 'water' || m.type === 'flying'))).toBe(true);
  });

  it('registers three healthy creatures at or under the cap', () => {
    const rng = new Rng(1);
    const party = [createCreature('nibblet', 30, rng), createCreature('pikachu', 12, rng), createCreature('geodude', 14, rng), createCreature('ponyta', 15, rng), createCreature('oddish', 9, rng)];
    party[2].hp = 0;
    const { registered, tooWild } = registerForBoss(party, 15);
    expect(registered.map((c) => c.species)).toEqual(['pikachu', 'ponyta', 'oddish']);
    expect(tooWild.map((c) => c.species)).toEqual(['nibblet']);
  });

  it('awards each badge once and raises the record', () => {
    const a = awardBadge([], 'verdhavn', 0, 15);
    expect(a).toEqual({ earned: ['verdhavn'], record: 15 });
    expect(awardBadge(a.earned, 'verdhavn', 15, 21).earned).toEqual(['verdhavn']);
  });

  it('gives the Echo three creatures under the cap', () => {
    for (const g of GYMS) {
      const t = echoTeam(g, { tier: 3, record: 0 });
      expect(t.length).toBe(3);
      for (const c of t) expect(c.level).toBeLessThanOrEqual(LEVEL_CAPS[3]);
    }
  });
});
