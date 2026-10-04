import Phaser from 'phaser';
import { STARTER_ROUTE } from '../world/maps';
import { DIRECTION_DELTAS, tryMove, type Direction, type PlayerState } from '../world/movement';
import { parseMap, type TileMap, type TileType } from '../world/tilemap';

export const TILE_SIZE = 32;
const STEP_DURATION_MS = 160;

// Placeholder colours until we have real tile art.
const TILE_COLORS: Record<TileType, number> = {
  path: 0x8fd16a,
  tallGrass: 0x3f9b3a,
  tree: 0x1f5a2a,
  water: 0x3a7bd5,
  wall: 0x8a6d4b,
};

export class OverworldScene extends Phaser.Scene {
  private map!: TileMap;
  private player!: PlayerState;
  private playerSprite!: Phaser.GameObjects.Container;
  private facingMarker!: Phaser.GameObjects.Rectangle;
  private isStepping = false;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<Direction, Phaser.Input.Keyboard.Key>;

  constructor() {
    super('Overworld');
  }

  create(): void {
    this.map = parseMap(STARTER_ROUTE);
    this.player = { position: this.map.playerStart, facing: 'down' };

    this.drawMap();
    this.createPlayer();

    const keyboard = this.input.keyboard!;
    this.cursors = keyboard.createCursorKeys();
    this.wasd = {
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    const worldWidth = this.map.width * TILE_SIZE;
    const worldHeight = this.map.height * TILE_SIZE;
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    this.cameras.main.startFollow(this.playerSprite, true);
  }

  update(): void {
    if (this.isStepping) return;
    const direction = this.heldDirection();
    if (direction) this.step(direction);
  }

  private heldDirection(): Direction | null {
    if (this.cursors.up.isDown || this.wasd.up.isDown) return 'up';
    if (this.cursors.down.isDown || this.wasd.down.isDown) return 'down';
    if (this.cursors.left.isDown || this.wasd.left.isDown) return 'left';
    if (this.cursors.right.isDown || this.wasd.right.isDown) return 'right';
    return null;
  }

  private step(direction: Direction): void {
    const { state, moved } = tryMove(this.map, this.player, direction);
    this.player = state;
    this.updateFacingMarker();
    if (!moved) return;

    this.isStepping = true;
    this.tweens.add({
      targets: this.playerSprite,
      x: this.tileCenter(state.position.x),
      y: this.tileCenter(state.position.y),
      duration: STEP_DURATION_MS,
      onComplete: () => {
        this.isStepping = false;
      },
    });
  }

  private drawMap(): void {
    const graphics = this.add.graphics();
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const tile = this.map.tiles[y][x];
        graphics.fillStyle(TILE_COLORS[tile], 1);
        graphics.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        if (tile === 'tallGrass') {
          // A few darker blades so tall grass reads differently from the path.
          graphics.fillStyle(0x2c7a2a, 1);
          graphics.fillRect(x * TILE_SIZE + 6, y * TILE_SIZE + 8, 4, 12);
          graphics.fillRect(x * TILE_SIZE + 18, y * TILE_SIZE + 14, 4, 12);
        }
      }
    }
  }

  private createPlayer(): void {
    const body = this.add.rectangle(0, 0, TILE_SIZE - 8, TILE_SIZE - 8, 0xe04848);
    body.setStrokeStyle(2, 0x5a1010);
    this.facingMarker = this.add.rectangle(0, 0, 8, 8, 0xffffff);
    this.playerSprite = this.add.container(
      this.tileCenter(this.player.position.x),
      this.tileCenter(this.player.position.y),
      [body, this.facingMarker],
    );
    this.updateFacingMarker();
  }

  private updateFacingMarker(): void {
    const offset = DIRECTION_DELTAS[this.player.facing];
    const distance = TILE_SIZE / 2 - 8;
    this.facingMarker.setPosition(offset.x * distance, offset.y * distance);
  }

  private tileCenter(index: number): number {
    return index * TILE_SIZE + TILE_SIZE / 2;
  }
}
