import { describe, expect, it } from 'vitest';
import { SETTLEMENTS } from '../src/shared/region';
import { allLayouts, footprint, layoutSettlement, serviceSpot, toWorld } from '../src/shared/settlement-layout';
import ASSETS from '../src/shared/data/world-assets.json';

const assets = (ASSETS as unknown as { assets: Record<string, unknown> }).assets;

describe('settlement layouts', () => {
  it('are deterministic', () => {
    const s = SETTLEMENTS.find((x) => x.id === 'runeby')!;
    const a = JSON.stringify(layoutSettlement(s));
    expect(JSON.stringify(layoutSettlement({ ...s }))).toBe(a);
  });

  it('give every town and city its services, and every city its landmark', () => {
    for (const l of allLayouts()) {
      const s = SETTLEMENTS.find((x) => x.id === l.id)!;
      const n = (r: string) => l.placements.filter((p) => p.role === r).length;
      if (s.tier === 'medium' || s.tier === 'large') {
        expect(n('pokecenter'), s.id).toBe(1);
        expect(n('mart'), s.id).toBe(1);
        expect(n('inn'), s.id).toBe(1);
        expect(serviceSpot(s, 'pokecenter'), s.id).not.toBeNull();
      }
      if (s.gym) expect(n('gym'), s.id).toBe(1);
      if (s.id === 'tornhavn') expect(n('tower')).toBe(1);
      if (s.id === 'crownspire') expect(n('league')).toBe(1);
      expect(n('house'), s.id).toBeGreaterThanOrEqual(s.tier === 'large' ? 50 : s.tier === 'medium' ? 18 : 5);
      expect(n('board'), s.id).toBe(1);
      expect(l.npcs.length, s.id).toBeGreaterThanOrEqual(s.tier === 'large' ? 15 : 4);
    }
  });

  it('only uses models the Blender kit built', () => {
    for (const l of allLayouts()) for (const p of l.placements) expect(assets[p.asset], `${l.id}: ${p.asset}`).toBeDefined();
  });

  it('keeps buildings inside the boundary and off each other', () => {
    for (const l of allLayouts()) {
      const s = SETTLEMENTS.find((x) => x.id === l.id)!;
      const solid = l.placements.filter((p) => p.role !== 'fence' && p.role !== 'gate' && p.role !== 'lamp');
      const circles = solid.map((p) => {
        const f = footprint(p.asset);
        const [x, z] = toWorld(p, f.cx, f.cz);
        return { x, z, r: Math.min(f.hw, f.hd), p };
      });
      for (const c of circles) expect(Math.hypot(c.x - s.x, c.z - s.z), `${l.id}: ${c.p.asset}`).toBeLessThan(s.r + 2);
      for (let i = 0; i < circles.length; i++) {
        for (let j = i + 1; j < circles.length; j++) {
          const a = circles[i], b = circles[j];
          expect(Math.hypot(a.x - b.x, a.z - b.z), `${l.id}: ${a.p.asset} / ${b.p.asset}`).toBeGreaterThan((a.r + b.r) * 0.6);
        }
      }
    }
  });
});
