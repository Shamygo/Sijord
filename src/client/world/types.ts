import type * as THREE from 'three';

/** Static obstacles on the ground plane. Players are resolved as circles against these. */
export type Collider =
  | { kind: 'circle'; x: number; z: number; r: number }
  | { kind: 'box'; minX: number; maxX: number; minZ: number; maxZ: number };

export type SettlementTier = 'small' | 'medium' | 'large';

export interface Region {
  name: string;
  tier: SettlementTier;
  centerX: number;
  centerZ: number;
  /** Radius of the settlement's boundary; building is forbidden inside it. */
  radius: number;
}

/** Named points the game logic needs to find in the world. */
export interface WorldAnchors {
  /** Spawn points outside player 1's and player 2's houses (slot 0 and 1). */
  playerSpawns: [THREE.Vector3, THREE.Vector3];
  /** Yaw each spawned player should face. */
  playerSpawnYaw: [number, number];
  /** Where the professor stands, and the yaw they face. */
  professor: THREE.Vector3;
  professorYaw: number;
  /** Labelled points shown on the minimap and compass (house doors, the lab, the town exit). */
  landmarks: { id: string; label: string; position: THREE.Vector3 }[];
}

export interface World {
  /** Everything the world adds to the scene lives under this node. */
  root: THREE.Object3D;
  /** Ground height (terrain or walkable surface) at a point; must be cheap, called every frame. */
  heightAt(x: number, z: number): number;
  /** Sea / lake surface height; players cannot walk below it yet (no swimming in M1). */
  waterLevel: number;
  colliders: Collider[];
  regions: Region[];
  anchors: WorldAnchors;
  /** Half the side length of the playable square, centred on the origin. */
  halfSize: number;
  /** The main directional light, so the game can keep its shadow camera centred on the player. */
  sun: THREE.DirectionalLight;
  /** Per-frame animation (water, swaying grass, clouds, critters). */
  update(dt: number, elapsed: number, focus: THREE.Vector3): void;
  /** Base colour of the ground near a point, used to paint the minimap. */
  groundColorAt(x: number, z: number): THREE.Color;
}
