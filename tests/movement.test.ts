import { describe, expect, it } from 'vitest';
import { tryMove, type PlayerState } from '../src/world/movement';
import { parseMap } from '../src/world/tilemap';

const map = parseMap(`
#####
#.P"#
#.~.#
#####
`);

const start: PlayerState = { position: map.playerStart, facing: 'down' };

describe('tryMove', () => {
  it('steps onto a walkable tile and faces that way', () => {
    expect(tryMove(map, start, 'left')).toEqual({
      state: { position: { x: 1, y: 1 }, facing: 'left' },
      moved: true,
    });
  });

  it('can walk into tall grass', () => {
    const result = tryMove(map, start, 'right');
    expect(result.moved).toBe(true);
    expect(result.state.position).toEqual({ x: 3, y: 1 });
  });

  it('turns to face a blocked direction without moving', () => {
    expect(tryMove(map, start, 'up')).toEqual({
      state: { position: { x: 2, y: 1 }, facing: 'up' },
      moved: false,
    });
    expect(tryMove(map, start, 'down').moved).toBe(false);
  });

  it('does not mutate the previous state', () => {
    const before = structuredClone(start);
    tryMove(map, start, 'left');
    expect(start).toEqual(before);
  });

  it('cannot leave the map', () => {
    const edgeMap = parseMap('P.');
    const state: PlayerState = { position: edgeMap.playerStart, facing: 'right' };
    expect(tryMove(edgeMap, state, 'left').moved).toBe(false);
    expect(tryMove(edgeMap, state, 'up').moved).toBe(false);
  });
});
