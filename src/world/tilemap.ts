/**
 * Tile types that make up an overworld map.
 *
 * Maps are authored as ASCII art so they are easy to read and edit by hand:
 *
 *   '#'  tree       (blocks movement)
 *   '~'  water      (blocks movement)
 *   '='  wall       (blocks movement)
 *   '.'  grass path (walkable)
 *   '"'  tall grass (walkable; wild encounters will happen here later)
 *   'P'  player start (walkable grass path)
 */
export type TileType = 'tree' | 'water' | 'wall' | 'path' | 'tallGrass';

export interface Position {
  x: number;
  y: number;
}

export interface TileMap {
  width: number;
  height: number;
  /** tiles[y][x] */
  tiles: TileType[][];
  playerStart: Position;
}

const CHAR_TO_TILE: Record<string, TileType> = {
  '#': 'tree',
  '~': 'water',
  '=': 'wall',
  '.': 'path',
  '"': 'tallGrass',
  P: 'path',
};

const WALKABLE: ReadonlySet<TileType> = new Set<TileType>(['path', 'tallGrass']);

/**
 * Parse an ASCII map into a TileMap. Throws if the map is empty, ragged,
 * contains unknown characters, or doesn't have exactly one player start.
 */
export function parseMap(source: string): TileMap {
  const rows = source
    .split('\n')
    .map((row) => row.trimEnd())
    .filter((row) => row.length > 0);

  if (rows.length === 0) {
    throw new Error('Map is empty');
  }

  const width = rows[0].length;
  let playerStart: Position | null = null;

  const tiles = rows.map((row, y) => {
    if (row.length !== width) {
      throw new Error(`Map row ${y} has width ${row.length}, expected ${width}`);
    }
    return [...row].map((char, x) => {
      const tile = CHAR_TO_TILE[char];
      if (!tile) {
        throw new Error(`Unknown map character '${char}' at (${x}, ${y})`);
      }
      if (char === 'P') {
        if (playerStart) {
          throw new Error('Map has more than one player start');
        }
        playerStart = { x, y };
      }
      return tile;
    });
  });

  if (!playerStart) {
    throw new Error("Map has no player start ('P')");
  }

  return { width, height: rows.length, tiles, playerStart };
}

export function tileAt(map: TileMap, pos: Position): TileType | undefined {
  return map.tiles[pos.y]?.[pos.x];
}

/** Off-map positions are never walkable. */
export function isWalkable(map: TileMap, pos: Position): boolean {
  const tile = tileAt(map, pos);
  return tile !== undefined && WALKABLE.has(tile);
}
