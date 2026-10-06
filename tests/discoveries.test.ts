import { describe, expect, it } from 'vitest';
import { DISCOVERIES, DISCOVERY_LABEL, discoveryCounts, tabletReward, TABLETS_PER_REWARD } from '../src/shared/discoveries';
import { ITEMS } from '../src/shared/items';
import { HALF, LAKE, POND, RIVER_HALF_WIDTH, RIVER_IN, RIVER_OUT, TOWN, distToPolyline } from '../src/client/world/layout';

describe('Hearthmeadow discoveries', () => {
  it('have unique ids, real loot and something to read', () => {
    expect(new Set(DISCOVERIES.map((d) => d.id)).size).toBe(DISCOVERIES.length);
    for (const d of DISCOVERIES) {
      expect(DISCOVERY_LABEL[d.kind]).toBeDefined();
      if (d.kind === 'cache') {
        const loot = Object.entries(d.loot ?? {});
        expect(loot.length, d.id).toBeGreaterThan(0);
        for (const [id, n] of loot) {
          expect(ITEMS[id], `${d.id}: ${id}`).toBeDefined();
          expect(n).toBeGreaterThan(0);
        }
      } else expect(d.text?.length, d.id).toBeGreaterThan(0);
    }
  });

  it('meet the density targets for a vale this size (DESIGN §12.3)', () => {
    const c = discoveryCounts([]);
    expect(c.cache.total).toBeGreaterThanOrEqual(12);
    expect(c.tablet.total + c.note.total).toBeGreaterThanOrEqual(18);
  });

  it('keep supplies scarce: a handful of balls and Great Balls only for the hardest climbs', () => {
    const total: Record<string, number> = {};
    for (const d of DISCOVERIES) for (const [id, n] of Object.entries(d.loot ?? {})) total[id] = (total[id] ?? 0) + n;
    expect(total['poke-ball']).toBeLessThanOrEqual(16);
    expect(total['great-ball']).toBeLessThanOrEqual(5);
    expect(total['ultra-ball'] ?? 0).toBe(0);
    for (const d of DISCOVERIES) if (d.loot?.['great-ball']) expect(d.onTop, d.id).toBe(true);
  });

  it('sit in the open vale: inside the mountains, outside town, out of the water', () => {
    for (const d of DISCOVERIES) {
      expect(Math.abs(d.x), d.id).toBeLessThan(HALF - 60);
      expect(Math.abs(d.z), d.id).toBeLessThan(HALF - 60);
      expect(Math.hypot(d.x - TOWN.x, d.z - TOWN.z), d.id).toBeGreaterThan(TOWN.fenceR + 8);
      expect(Math.min(distToPolyline(d.x, d.z, RIVER_IN), distToPolyline(d.x, d.z, RIVER_OUT)), d.id).toBeGreaterThan(RIVER_HALF_WIDTH + 2);
      expect(Math.hypot((d.x - LAKE.x) / LAKE.rx, (d.z - LAKE.z) / LAKE.rz), d.id).toBeGreaterThan(1.1);
      expect(Math.hypot(d.x - POND.x, d.z - POND.z), d.id).toBeGreaterThan(POND.r + 2);
    }
  });

  it('counts what has been found', () => {
    const c = discoveryCounts(['cache-arch', 'tablet-arch', 'tablet-stones', 'not-a-thing']);
    expect(c.cache.found).toBe(1);
    expect(c.tablet.found).toBe(2);
    expect(c.note.found).toBe(0);
  });

  it('Hazel pays a Great Ball per three tablets, once each', () => {
    const tablets = DISCOVERIES.filter((d) => d.kind === 'tablet').map((d) => d.id);
    expect(tabletReward(tablets.slice(0, 2), 0)).toEqual({ balls: 0, reported: 2 });
    expect(tabletReward(tablets.slice(0, TABLETS_PER_REWARD), 2)).toEqual({ balls: 1, reported: 3 });
    expect(tabletReward(tablets.slice(0, TABLETS_PER_REWARD), 3)).toEqual({ balls: 0, reported: 3 });
    expect(tabletReward(tablets.slice(0, 7), 3)).toEqual({ balls: 1, reported: 7 });
    expect(tabletReward(tablets.slice(0, 9), 0)).toEqual({ balls: 3, reported: 9 });
  });
});
