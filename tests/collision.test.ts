import { describe, expect, it } from 'vitest';
import { resolveCircle } from '../src/client/core/collision';
import type { Collider } from '../src/client/world/types';

describe('resolveCircle', () => {
  it('pushes out of circles and boxes', () => {
    expect(resolveCircle(0.5, 0, 0.5, [{ kind: 'circle', x: 0, z: 0, r: 1 }]).x).toBeCloseTo(1.5);
    expect(resolveCircle(0, 0.9, 0.5, [{ kind: 'box', minX: -1, maxX: 1, minZ: -1, maxZ: 1 }]).z).toBeCloseTo(1.5);
  });

  it('gives the same answer through the spatial grid for large lists', () => {
    const many: Collider[] = [];
    for (let i = 0; i < 500; i++) many.push({ kind: 'circle', x: i * 10, z: 0, r: 1 });
    many.push({ kind: 'box', minX: -600, maxX: 600, minZ: 50, maxZ: 52 });
    const p = resolveCircle(250.5, 0, 0.5, many);
    expect(p.x).toBeCloseTo(251.5);
    expect(resolveCircle(-300, 49.8, 0.5, many).z).toBeCloseTo(49.5);
    expect(resolveCircle(3000, 0, 0.5, many)).toEqual({ x: 3000, z: 0 });
  });
});
