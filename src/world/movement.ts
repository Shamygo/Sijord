import { isWalkable, type Position, type TileMap } from './tilemap';

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface PlayerState {
  position: Position;
  facing: Direction;
}

export const DIRECTION_DELTAS: Record<Direction, Position> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export interface MoveResult {
  state: PlayerState;
  /** True if the player actually stepped onto a new tile. */
  moved: boolean;
}

/**
 * Try to step one tile in a direction. Like classic Pokemon games, the
 * player always turns to face the direction pressed, even when the way is
 * blocked.
 */
export function tryMove(map: TileMap, state: PlayerState, direction: Direction): MoveResult {
  const delta = DIRECTION_DELTAS[direction];
  const target = { x: state.position.x + delta.x, y: state.position.y + delta.y };

  if (!isWalkable(map, target)) {
    return { state: { position: state.position, facing: direction }, moved: false };
  }
  return { state: { position: target, facing: direction }, moved: true };
}
