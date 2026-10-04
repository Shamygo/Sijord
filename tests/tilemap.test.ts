import { describe, expect, it } from 'vitest';
import { STARTER_ROUTE } from '../src/world/maps';
import { isWalkable, parseMap, tileAt } from '../src/world/tilemap';

describe('parseMap', () => {
  it('parses tiles and the player start', () => {
    const map = parseMap(`
###
#P"
#~=
`);
    expect(map.width).toBe(3);
    expect(map.height).toBe(3);
    expect(map.playerStart).toEqual({ x: 1, y: 1 });
    expect(map.tiles[1]).toEqual(['tree', 'path', 'tallGrass']);
    expect(map.tiles[2]).toEqual(['tree', 'water', 'wall']);
  });

  it('rejects an empty map', () => {
    expect(() => parseMap('\n\n')).toThrow('empty');
  });

  it('rejects ragged rows', () => {
    expect(() => parseMap('###\n#P\n###')).toThrow('width');
  });

  it('rejects unknown characters', () => {
    expect(() => parseMap('#P?')).toThrow("Unknown map character '?'");
  });

  it('requires exactly one player start', () => {
    expect(() => parseMap('#.#')).toThrow('no player start');
    expect(() => parseMap('PP')).toThrow('more than one');
  });

  it('parses the starter route', () => {
    const map = parseMap(STARTER_ROUTE);
    expect(isWalkable(map, map.playerStart)).toBe(true);
  });
});

describe('isWalkable', () => {
  const map = parseMap(`
#~=
.P"
`);

  it('allows paths and tall grass', () => {
    expect(isWalkable(map, { x: 0, y: 1 })).toBe(true);
    expect(isWalkable(map, { x: 1, y: 1 })).toBe(true);
    expect(isWalkable(map, { x: 2, y: 1 })).toBe(true);
  });

  it('blocks trees, water and walls', () => {
    expect(isWalkable(map, { x: 0, y: 0 })).toBe(false);
    expect(isWalkable(map, { x: 1, y: 0 })).toBe(false);
    expect(isWalkable(map, { x: 2, y: 0 })).toBe(false);
  });

  it('blocks positions off the edge of the map', () => {
    expect(tileAt(map, { x: -1, y: 1 })).toBeUndefined();
    expect(isWalkable(map, { x: -1, y: 1 })).toBe(false);
    expect(isWalkable(map, { x: 3, y: 1 })).toBe(false);
    expect(isWalkable(map, { x: 0, y: 2 })).toBe(false);
  });
});
