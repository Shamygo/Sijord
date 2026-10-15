import { describe, expect, it } from 'vitest';
import { createCreature, creatureStats, maxHp } from '../src/shared/battle/creature';
import { Rng } from '../src/shared/battle/rng';
import { SPECIES } from '../src/shared/data/species';
import { ITEMS } from '../src/shared/items';
import {
  BP_SHOP, buyWithBp, emptyTowerRecord, isTycoon, TOWER, towerAi, towerBlock, towerEntrants, towerKey, towerLoss, towerOpponents, towerPool, towerReward, towerSet, towerWin,
} from '../src/shared/battle-tower';
import { hallAt, hallBlockers, hallInterior, hallWorld } from '../src/shared/halls';
import { interiorAt } from '../src/shared/gym-interior';
import { REGION } from '../src/shared/region';

const party = () => ['tauros', 'snorlax', 'golem', 'starmie', 'pikachu'].map((id, i) => createCreature(id, 20 + i, new Rng(i + 1), { uid: `p${i}` }));

describe('Battle Tower', () => {
  it('enters copies at the bracket level and never touches the real team', () => {
    const p = party();
    p[0].hp = 0;
    const solo = towerEntrants(p, 'solo', 'level50');
    expect(solo).toHaveLength(4);
    expect(solo.every((c) => c.level === 50 && c.uid.startsWith('tower:'))).toBe(true);
    expect(solo.every((c) => c.hp === maxHp(c) && c.hp > 100)).toBe(true);
    solo[0].moves[0].pp = 0;
    solo[0].level = 99;
    expect(p[0].level).toBe(20);
    expect(p[0].moves[0].pp).toBeGreaterThan(0);
    expect(towerEntrants(p, 'coop', 'open').map((c) => c.level)).toEqual([100, 100, 100]);
  });

  it('needs four Pokémon solo and three for co-op', () => {
    expect(towerBlock(party().slice(0, 3), 'solo')).toMatch(/4/);
    expect(towerBlock(party().slice(0, 3), 'coop')).toBeNull();
  });

  it('builds legal teams that get tougher by set', () => {
    for (const battle of [1, 8, 15, 22, 50]) {
      const solo = towerOpponents('level50', 'solo', battle, 42 + battle);
      const coop = towerOpponents('level50', 'coop', battle, 42 + battle);
      expect(solo.teams).toHaveLength(1);
      expect(solo.teams[0].creatures).toHaveLength(4);
      expect(coop.teams).toHaveLength(2);
      const all = coop.teams.flatMap((t) => t.creatures);
      expect(new Set(all.map((c) => c.species)).size).toBe(6);
      const items = all.map((c) => c.item).filter(Boolean);
      for (const t of coop.teams) {
        const held = t.creatures.map((c) => c.item).filter(Boolean);
        expect(new Set(held).size).toBe(held.length);
      }
      for (const c of all) {
        expect(c.level).toBe(50);
        expect(SPECIES[c.species]).toBeDefined();
        expect(c.moves.length).toBeGreaterThan(0);
        if (c.item) expect(ITEMS[c.item]?.held).toBe(true);
      }
      expect(items.length).toBeGreaterThan(0);
    }
    expect(towerAi(1)).toBe('t2');
    expect(towerAi(8)).toBe('t3');
    expect(towerAi(22)).toBe('t4');
    const bst = (id: string) => Object.values(SPECIES[id].baseStats).reduce((a, b) => a + b, 0);
    expect(Math.max(...towerPool(0).map(bst))).toBeLessThanOrEqual(490);
    expect(towerPool(0).length).toBeGreaterThan(12);
    expect(towerPool(4)).toContain('dragonite');
    // A fourth-set opponent is stronger than a first-set one.
    const avg = (b: number) => {
      const cs = towerOpponents('level50', 'solo', b, 7).teams[0].creatures;
      return cs.reduce((s, c) => s + Object.values(creatureStats(c)).reduce((a, x) => a + x, 0), 0) / cs.length;
    };
    expect(avg(22)).toBeGreaterThan(avg(1));
  });

  it('sends the Tycoon at 21 and 49 with a full team in co-op', () => {
    expect(isTycoon(21) && isTycoon(49) && !isTycoon(20)).toBe(true);
    const silver = towerOpponents('open', 'coop', 21, 1);
    expect(silver.tycoon).toBe(true);
    expect(silver.teams).toHaveLength(1);
    expect(silver.teams[0].creatures).toHaveLength(6);
    expect(silver.teams[0].creatures.every((c) => c.level === 100)).toBe(true);
    expect(towerOpponents('level50', 'solo', 49, 1).teams[0].creatures.map((c) => c.species)).toContain('dragonite');
  });

  it('keeps streaks per bracket and mode, pays BP, and ends at a loss', () => {
    const rec = emptyTowerRecord();
    let bp = 0;
    for (let i = 1; i <= 7; i++) bp += towerWin(rec, 'level50', 'solo').bp;
    expect(bp).toBe(7 + 3);
    expect(rec.bp).toBe(10);
    expect(rec.streak[towerKey('level50', 'solo')]).toBe(7);
    expect(rec.streak[towerKey('level50', 'coop')]).toBeUndefined();
    expect(towerLoss(rec, 'level50', 'solo')).toBe(7);
    expect(rec.streak[towerKey('level50', 'solo')]).toBe(0);
    expect(rec.best[towerKey('level50', 'solo')]).toBe(7);
    expect(towerReward(21)).toBe(10);
    expect(towerReward(49)).toBe(20);
    expect(towerSet(22)).toBe(3);
    rec.streak[towerKey('open', 'coop')] = 20;
    expect(towerWin(rec, 'open', 'coop').print).toBe('open-silver');
    expect(rec.prints).toEqual(['open-silver']);
  });

  it('trades BP for held items, and only what you can afford', () => {
    const rec = emptyTowerRecord();
    const bag: Record<string, number> = {};
    expect(BP_SHOP.every((e) => ITEMS[e.id]?.held)).toBe(true);
    expect(buyWithBp(rec, bag, 'leftovers')).toBe(false);
    rec.bp = 50;
    expect(buyWithBp(rec, bag, 'leftovers')).toBe(true);
    expect(rec.bp).toBe(2);
    expect(bag.leftovers).toBe(1);
    expect(buyWithBp(rec, bag, 'poke-ball')).toBe(false);
  });

  it('builds its hall out over the sea, apart from the gyms', () => {
    const h = hallInterior('battle-tower');
    const spawn = hallWorld(h, h.spots.spawn);
    expect(hallAt(spawn.x, spawn.z)?.hall).toBe(h);
    expect(interiorAt(spawn.x, spawn.z)).toBeNull();
    expect(TOWER.badges).toBe(5);
    // Inside the walkable bounds (the world keeps players 60 m in from the edge), clear of every gym.
    for (const p of [{ x: -h.halfW, z: 0 }, { x: h.halfW, z: h.length }]) {
      const w = hallWorld(h, p);
      expect(w.x).toBeGreaterThan(REGION.minX + 60);
      expect(w.z).toBeLessThan(REGION.maxZ - 60);
      expect(interiorAt(w.x, w.z)).toBeNull();
    }
    // Every spot people stand on is clear of walls and counters.
    const solid = hallBlockers(h, new Set());
    for (const [k, p] of Object.entries(h.spots)) {
      if (k === 'guide' || k === 'exchange') continue;
      expect(solid.some((rc) => p.x >= rc.x0 - 0.3 && p.x <= rc.x1 + 0.3 && p.z >= rc.z0 - 0.3 && p.z <= rc.z1 + 0.3), k).toBe(false);
    }
  });
});
