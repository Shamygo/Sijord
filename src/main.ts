import Phaser from 'phaser';
import { OverworldScene } from './scenes/OverworldScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 480,
  height: 320,
  backgroundColor: '#111111',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [OverworldScene],
});
