import { describe, expect, it } from 'vitest';
import { SPECIES } from '../src/shared/data/species';
import { MOVES } from '../src/shared/data/moves';
import { ITEMS } from '../src/shared/items';
import { CHAMPION, ELITE_FOUR, LEAGUE, LEAGUE_MEMBERS, leagueEcho, leagueTeam, memberByAce } from '../src/shared/league';
import { hallAt, hallBlockers, hallInterior, hallRoomAt, hallWorld } from '../src/shared/halls';
import { interiorAt } from '../src/shared/gym-interior';
import { REGION } from '../src/shared/region';

describe('the League', () => {
  it('fields four Elite Four and a Champion with legal, hand-picked teams', () => {
    expect(ELITE_FOUR).toHaveLength(4);
    expect(LEAGUE.cap).toBe(76);
    expect(LEAGUE_MEMBERS.map((m) => m.ace)).toEqual([72, 73, 74, 75, 76]);
    for (const m of LEAGUE_MEMBERS) {
      expect(memberByAce(m.ace)).toBe(m);
      const { creatures, ai } = leagueTeam(m, 3);
      expect(ai).toBe('t4');
      expect(creatures).toHaveLength(6);
      expect(creatures[5].level).toBe(m.ace);
      expect(Math.min(...creatures.map((c) => c.level))).toBe(m.ace - 4);
      for (const c of creatures) {
        expect(SPECIES[c.species], c.species).toBeDefined();
        expect(c.moves).toHaveLength(4);
        for (const mv of c.moves) expect(MOVES[mv.id], `${m.name} ${c.species}: ${mv.id}`).toBeDefined();
        expect(ITEMS[c.item!]?.held, `${m.name} ${c.species}: ${c.item}`).toBe(true);
        expect(c.hp).toBeGreaterThan(0);
      }
    }
    expect(CHAMPION.title).toBe('Champion');
    const echo = leagueEcho();
    expect(echo).toHaveLength(3);
    expect(echo.every((c) => c.level === LEAGUE.cap - 2 && c.moves.length > 0)).toBe(true);
  });

  it('builds its hall in bounds, apart from the gyms and the Tower, with clear spots', () => {
    const h = hallInterior('league');
    const tower = hallInterior('battle-tower');
    for (const p of [{ x: -h.halfW - 1, z: 0 }, { x: h.halfW + 1, z: h.length + 1 }, { x: 0, z: h.length / 2 }]) {
      const w = hallWorld(h, p);
      expect(w.x).toBeGreaterThan(REGION.minX + 60);
      expect(w.z).toBeLessThan(REGION.maxZ - 60);
      expect(interiorAt(w.x, w.z)).toBeNull();
      expect(hallAt(w.x, w.z)?.hall).toBe(h);
    }
    expect(hallAt(tower.ox, tower.oz + 10)?.hall).toBe(tower);
    expect(h.rooms.map((rm) => rm.id)).toEqual(['foyer', 'room-0', 'room-1', 'room-2', 'room-3', 'room-4']);
    expect(h.doors.map((d) => d.id)).toEqual(['door-0', 'door-1', 'door-2', 'door-3', 'door-4']);
    const solid = hallBlockers(h, new Set());
    for (const [k, p] of Object.entries(h.spots)) {
      expect(solid.some((rc) => p.x >= rc.x0 - 0.3 && p.x <= rc.x1 + 0.3 && p.z >= rc.z0 - 0.3 && p.z <= rc.z1 + 0.3), k).toBe(false);
    }
    // Each member stands in their own room, where the battle puts the foe trainer.
    LEAGUE_MEMBERS.forEach((_, k) => expect(hallRoomAt(h, h.spots[`m${k}`].z)?.id).toBe(`room-${k}`));
  });
});
