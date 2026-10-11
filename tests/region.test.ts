import { describe, expect, it } from 'vitest';
import { terrainHeight, sampleGround, settlementPlateau, type GroundSample } from '../src/client/world/heightfield';
import {
  BIOME_IDS, REGION, REGION_ROADS, SETTLEMENTS, biomeAt, biomeWeights, coastDist, inNoBuildZone, placeName, roadDist, settlementAt,
} from '../src/shared/region';
import { buildPatch } from '../src/client/world/stream/patch';
import { scatterChunk } from '../src/client/world/stream/scatter';
import { PATCH_V, cellSize, nodeOrigin } from '../src/client/world/stream/lattice';

/** Heights of the hand-built vale before the region existed (captured from the old terrain.ts). */
const VALE_REFERENCE: [number, number, number][] = [
  [0, -330, 9], [0, -240, 6.692557], [62, -128, 4.762932], [215, -125, 18.338776], [-172, -288, -3.4], [-110, 130, -1.7],
  [265, 175, 55.304183], [345, 25, 65.946139], [-20, -40, 14.528678], [100, 130, 5.920251], [-300, 300, 3.669784],
  [132, -262, 4.056838], [40, -60, 6.941569], [400, -400, 8.849907], [-400, 400, -2.5], [-200, -60, -2.5],
  [150, 300, 32.171707], [-350, -150, 16.155294], [300, -300, 14.398273], [0, 400, 8.80808],
];

describe('the vale is untouched by the region', () => {
  it('keeps every reference height', () => {
    for (const [x, z, h] of VALE_REFERENCE) expect(terrainHeight(x, z)).toBeCloseTo(h, 5);
  });
});

describe('biomes', () => {
  it('weights sum to one everywhere', () => {
    for (let i = 0; i < 200; i++) {
      const x = REGION.minX + ((i * 7919) % 6400), z = REGION.minZ + ((i * 104729) % 6400);
      const w = biomeWeights(x, z);
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    }
  });

  it('lays the region out like the design map', () => {
    expect(biomeAt(0, 0)).toBe('meadow');
    expect(biomeAt(600, 4100)).toBe('tundra');
    expect(biomeAt(-250, 2850)).toBe('peaks');
    expect(biomeAt(-2000, 2400)).toBe('ashen');
    expect(biomeAt(-2100, 300)).toBe('badlands');
    expect(biomeAt(1800, 600)).toBe('mirefen');
    expect(biomeAt(250, 1500)).toBe('heath');
    expect(biomeAt(1450, 2050)).toBe('elderwood');
    expect(new Set(SETTLEMENTS.map((s) => biomeAt(s.x, s.z))).size).toBeGreaterThanOrEqual(BIOME_IDS.length - 1);
  });
});

describe('settlements', () => {
  it('has the design counts: 12 cities, 16 towns, 28 villages with Bramblewick', () => {
    expect(SETTLEMENTS.filter((s) => s.tier === 'large')).toHaveLength(12);
    expect(SETTLEMENTS.filter((s) => s.tier === 'medium')).toHaveLength(16);
    expect(SETTLEMENTS.filter((s) => s.tier === 'small' || s.tier === 'home')).toHaveLength(28);
    expect(SETTLEMENTS.filter((s) => s.gym)).toHaveLength(10);
    expect(SETTLEMENTS.filter((s) => s.lock).map((s) => s.id).sort()).toEqual(['crownspire', 'tornhavn']);
  });

  it('never overlap', () => {
    for (const a of SETTLEMENTS) for (const b of SETTLEMENTS) {
      if (a === b) continue;
      expect(Math.hypot(a.x - b.x, a.z - b.z), `${a.id} / ${b.id}`).toBeGreaterThan(a.r + b.r + 40);
    }
  });

  it('stand on dry, level ground', () => {
    for (const s of SETTLEMENTS) {
      if (s.tier === 'home') continue;
      const h = terrainHeight(s.x, s.z);
      expect(h, s.id).toBeGreaterThan(1.5);
      expect(h, s.id).toBeCloseTo(settlementPlateau(s), 0);
      for (let a = 0; a < 8; a++) {
        const x = s.x + Math.cos(a) * s.r * 0.6, z = s.z + Math.sin(a) * s.r * 0.6;
        expect(Math.abs(terrainHeight(x, z) - settlementPlateau(s)), s.id).toBeLessThan(1.2);
      }
    }
  });

  it('forbid building inside their boundary', () => {
    for (const s of SETTLEMENTS) {
      expect(inNoBuildZone(s.x, s.z)).toBe(true);
      expect(settlementAt(s.x, s.z)?.id).toBe(s.id);
      expect(placeName(s.x, s.z).name).toBe(s.name);
    }
    expect(inNoBuildZone(300, -700)).toBe(false);
  });

  it('are linked by roads (each non-island settlement has one within reach of its edge)', () => {
    for (const s of SETTLEMENTS) {
      if (s.id === 'tornhavn' || s.id === 'driftwood' || s.tier === 'home') continue;
      let best = Infinity;
      for (const r of REGION_ROADS) for (const [x, z] of r.pts) best = Math.min(best, Math.hypot(x - s.x, z - s.z) - s.r);
      expect(best, s.id).toBeLessThan(40);
    }
  });
});

describe('roads and coast', () => {
  it('keeps roads on land', () => {
    for (const r of REGION_ROADS) {
      for (const [x, z] of r.pts) expect(coastDist(x, z), r.id).toBeGreaterThan(0);
    }
    expect(roadDist(26, 300)).toBeLessThan(3);
  });

  it('surrounds the island with sea', () => {
    expect(terrainHeight(REGION.minX + 50, REGION.minZ + 50)).toBeLessThan(0);
    expect(terrainHeight(REGION.maxX - 50, 1000)).toBeLessThan(0);
    expect(terrainHeight(0, REGION.maxZ - 50)).toBeLessThan(0);
  });
});

describe('streamed patches', () => {
  it('match the height function exactly at their vertices', () => {
    const p = buildPatch(0, 25, 30);
    const [x0, z0] = nodeOrigin(0, 25, 30);
    for (const [i, j] of [[0, 0], [64, 0], [13, 40], [64, 64]]) {
      expect(p.l0!.heights[j * PATCH_V + i]).toBeCloseTo(terrainHeight(x0 + i * cellSize(0), z0 + j * cellSize(0)), 3);
    }
  });

  it('scatter the same trees for every player', () => {
    const p = buildPatch(0, 30, 28);
    const a = scatterChunk(30, 28, p.l0!), b = scatterChunk(30, 28, p.l0!);
    expect(Array.from(a.trees)).toEqual(Array.from(b.trees));
    expect(Array.from(a.rocks)).toEqual(Array.from(b.rocks));
  });

  it('paints snow in the tundra and lava in the highlands', () => {
    const g: GroundSample = { r: 0, g: 0, b: 0, dirt: 0, sand: 0, grass: 0, snow: 0, tr: 1, tg: 1, tb: 1, lava: 0 };
    sampleGround(600, 4150, terrainHeight(600, 4150), 0.99, g);
    expect(g.snow).toBeGreaterThan(0.2);
    sampleGround(-2120, 2250, terrainHeight(-2120, 2250), 0.99, g);
    expect(g.lava).toBeGreaterThan(0.5);
  });
});
