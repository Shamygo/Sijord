import * as THREE from 'three';
import { ALPHA, ALPHA_LAIRS, alphaCreature, alphaDay, alphaKey, type AlphaLair } from '../../shared/alpha';
import { createCreature, newUid } from '../../shared/battle/creature';
import { Rng } from '../../shared/battle/rng';
import type { Creature } from '../../shared/battle/types';
import { MOVES } from '../../shared/data/moves';
import { SPECIES } from '../../shared/data/species';
import { disposeBall, makeTreat } from '../battle/fx';
import { createCreatureModel, creatureModelReady, type CreatureModel } from '../creatures';
import { MESAS, POND, RIVER_IN, RIVER_OUT, TOWN, distToPolyline, lakeDist } from '../world/layout';
import type { World } from '../world/types';
import { Mover } from './mover';

/**
 * Wild creatures of Hearthmeadow (DESIGN §4.1): they live in pairs, packs and flocks that graze
 * and wander, notice the player, and react by temperament. Skittish ones bolt from a sprinting
 * trainer, territorial ones square up and charge if you linger. Walking up and pressing the
 * interact key starts a double battle with the creature and its nearest herd-mate.
 */

export type WildState = 'graze' | 'wander' | 'flee' | 'watch' | 'charge' | 'battle' | 'gone'
  /** Inside an overworld ball while it shakes. */
  | 'ball'
  /** Broke out of a ball and is backing away, wary. */
  | 'startle'
  /** Furious after a failed catch: charges the trainer directly with telegraphed lunges. */
  | 'attack'
  /** Going to, or eating, a thrown Treat. */
  | 'eat';

/** A charge at the trainer (DESIGN §5.3): close in, wind up, lunge in a straight line, recover. */
export interface WildAttack {
  phase: 'approach' | 'windup' | 'lunge' | 'recover';
  /** Seconds left in the current phase. */
  t: number;
  /** Seconds before it calms down. */
  left: number;
  /** Where its territory is centred; leaving it by ATTACK_RANGE ends the charge. */
  ox: number;
  oz: number;
  /** Lunge direction, fixed when the wind-up ends so the trainer can sidestep it. */
  dx: number;
  dz: number;
  hit: boolean;
}

/** Thrown Treats (DESIGN §5.3): bait that calms a furious creature or keeps a calm one busy. */
export const TREAT = {
  /** A creature this close to where it lands comes to eat it. */
  lure: 7,
  /** Seconds spent eating once it's there. */
  eat: 8,
  /** Seconds an untouched Treat lies there before it's lost. */
  life: 25,
  /** Calm afterwards: it won't turn on the trainer again for this long. */
  calm: 30,
};

/** A Treat lying on the ground. */
export interface Bait {
  x: number;
  y: number;
  z: number;
  life: number;
  /** Seconds of eating left. */
  left: number;
  eater: WildCreature | null;
  /** The eater has reached it (and how long it has been trotting over). */
  at: boolean;
  trot: number;
  mesh: THREE.Group;
}

/** Tunables for a creature charging the trainer. */
export const WILD_ATTACK = {
  /** Seconds before it calms down (DESIGN: about 20 s). */
  duration: 20,
  /** Trainer this far from its territory: it gives up. */
  range: 40,
  /** Starts the wind-up this close. */
  windupAt: 4.6,
  windup: 0.7,
  lungeSpeed: 10.5,
  lunge: 0.55,
  recover: 1.4,
  /** Extra reach beyond its body for a lunge to connect. */
  reach: 0.55,
};

export interface WildCreature {
  id: number;
  creature: Creature;
  model: CreatureModel;
  root: THREE.Group;
  mover: Mover;
  herd: Herd;
  state: WildState;
  timer: number;
  tx: number;
  tz: number;
  /** Seconds the player has been inside this creature's comfort zone. */
  tension: number;
  /** Seconds before it may charge again (after a battle it ran from). */
  calm: number;
  /** Fade-out progress once defeated. */
  fade: number;
  /** Seconds it stays alert to the trainer (no unaware throws) after being disturbed. */
  alert: number;
  /** Set while charging the trainer. */
  attack?: WildAttack;
  /** Shared spawn key (cell, epoch, index): the same creature on a friend's screen. */
  key?: string;
  /** A friend is battling or catching this one: hidden here until they're done. */
  remoteBusy?: boolean;
  /** The Treat it's going to or eating. */
  food?: Bait;
  /** An Alpha (DESIGN §4.6): the lair it guards. */
  alpha?: AlphaLair;
}

interface Herd {
  id: number;
  species: string;
  cx: number;
  cz: number;
  members: WildCreature[];
  /** Grid cell it spawned from, when it's a shared herd. */
  cell?: string;
  /** The time window it was rolled in (shared herds only). */
  epoch?: number;
  /** An Alpha's lair: the herd stays centred on it. */
  lair?: AlphaLair;
}

/**
 * Shared spawns: herds come from a grid of cells seeded by the world's name and a time window,
 * so two friends in the same area meet the same herds (same species, levels, stats and spots).
 * Each player still simulates the herds locally; what's synced is which ones are taken (caught or
 * defeated) and which are busy in a friend's battle or ball.
 */
export const SHARED_SPAWN = {
  /** Cell size in metres: at most one herd per cell. */
  cell: 70,
  /** Share of cells that hold a herd. */
  chance: 0.6,
  /** A cell's herd is re-rolled every this many ms (taken creatures return after it). */
  epochMs: 15 * 60_000,
  /** Taken keys are repeated to friends for this long. */
  shareMs: 30_000,
};

/** FNV-style mix of integers into a 32-bit seed. */
function mix(...values: number[]): number {
  let h = 2166136261;
  for (const v of values) {
    h ^= v | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 15;
  }
  return h >>> 0;
}

/** A 32-bit seed from a world name, so both players derive the same herds. */
export function seedFromName(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Where a species lives: by water (the lake, river and pond) or among the stone mesas. */
export type Habitat = 'water' | 'rock';

export interface ZoneEntry {
  species: string;
  weight: number;
  min: number;
  max: number;
  herd: [number, number];
  habitat?: Habitat;
}

/**
 * Spawn tables by distance from Bramblewick. Further out means stronger creatures. Common
 * creatures roam in pairs and flocks (so most fights are two at once); the rare ones (Pikachu,
 * Eevee, Abra) are met alone or in pairs. Levels stay under the first level cap (15).
 */
export const ZONES: { maxDist: number; entries: ZoneEntry[] }[] = [
  {
    // Hearthmeadow, just outside the town fence: levels 2-6.
    maxDist: 190,
    entries: [
      { species: 'nibblet', weight: 20, min: 2, max: 4, herd: [2, 3] },
      { species: 'finchlet', weight: 20, min: 2, max: 4, herd: [2, 4] },
      { species: 'dewmite', weight: 15, min: 2, max: 4, herd: [2, 4] },
      { species: 'weedle', weight: 15, min: 2, max: 4, herd: [2, 3] },
      { species: 'spearow', weight: 6, min: 3, max: 5, herd: [2, 3] },
      { species: 'nidoran-f', weight: 5, min: 3, max: 5, herd: [2, 2] },
      { species: 'nidoran-m', weight: 5, min: 3, max: 5, herd: [2, 2] },
      { species: 'oddish', weight: 5, min: 3, max: 5, herd: [2, 3] },
      { species: 'bellsprout', weight: 4, min: 3, max: 5, herd: [2, 2] },
      { species: 'cloveret', weight: 3, min: 3, max: 5, herd: [1, 2] },
      { species: 'hjordpup', weight: 3, min: 3, max: 5, herd: [2, 2] },
      { species: 'poliwag', weight: 8, min: 3, max: 5, herd: [2, 2], habitat: 'water' },
      { species: 'psyduck', weight: 5, min: 4, max: 6, herd: [1, 2], habitat: 'water' },
      { species: 'pikachu', weight: 1.5, min: 3, max: 5, herd: [1, 2] },
      { species: 'eevee', weight: 1, min: 3, max: 5, herd: [1, 1] },
      { species: 'abra', weight: 1, min: 4, max: 6, herd: [1, 1] },
    ],
  },
  {
    // Route 1: levels 4-9.
    maxDist: 360,
    entries: [
      { species: 'nibblet', weight: 14, min: 4, max: 7, herd: [2, 3] },
      { species: 'finchlet', weight: 14, min: 4, max: 7, herd: [2, 4] },
      { species: 'dewmite', weight: 6, min: 4, max: 6, herd: [2, 3] },
      { species: 'cocoonch', weight: 5, min: 7, max: 9, herd: [2, 2] },
      { species: 'weedle', weight: 6, min: 4, max: 6, herd: [2, 3] },
      { species: 'kakuna', weight: 5, min: 7, max: 9, herd: [2, 2] },
      { species: 'spearow', weight: 10, min: 5, max: 8, herd: [2, 3] },
      { species: 'ekans', weight: 7, min: 5, max: 8, herd: [1, 2] },
      { species: 'nidoran-f', weight: 5, min: 5, max: 8, herd: [2, 2] },
      { species: 'nidoran-m', weight: 5, min: 5, max: 8, herd: [2, 2] },
      { species: 'oddish', weight: 6, min: 5, max: 8, herd: [2, 3] },
      { species: 'bellsprout', weight: 5, min: 5, max: 8, herd: [2, 2] },
      { species: 'mankey', weight: 6, min: 5, max: 8, herd: [2, 3] },
      { species: 'meowth', weight: 6, min: 5, max: 8, herd: [1, 2] },
      { species: 'jigglypuff', weight: 3, min: 5, max: 7, herd: [1, 2] },
      { species: 'vulpix', weight: 3, min: 5, max: 7, herd: [1, 2] },
      { species: 'ponyta', weight: 3, min: 6, max: 8, herd: [2, 3] },
      { species: 'hjordpup', weight: 4, min: 6, max: 8, herd: [2, 3] },
      { species: 'cloveret', weight: 3, min: 6, max: 8, herd: [1, 2] },
      { species: 'poliwag', weight: 8, min: 5, max: 8, herd: [2, 3], habitat: 'water' },
      { species: 'psyduck', weight: 6, min: 5, max: 8, herd: [1, 2], habitat: 'water' },
      { species: 'pikachu', weight: 1.5, min: 5, max: 7, herd: [1, 2] },
      { species: 'eevee', weight: 1, min: 5, max: 7, herd: [1, 1] },
      { species: 'abra', weight: 1, min: 6, max: 8, herd: [1, 1] },
    ],
  },
  {
    // The far reaches and the mesas: levels 8-14.
    maxDist: Infinity,
    entries: [
      { species: 'nibblet', weight: 8, min: 8, max: 12, herd: [2, 3] },
      { species: 'stashquill', weight: 6, min: 10, max: 14, herd: [2, 2] },
      { species: 'finchlet', weight: 8, min: 8, max: 12, herd: [2, 3] },
      { species: 'fjordling', weight: 4, min: 12, max: 14, herd: [2, 3] },
      { species: 'spearow', weight: 8, min: 9, max: 13, herd: [2, 3] },
      { species: 'cocoonch', weight: 5, min: 9, max: 12, herd: [2, 2] },
      { species: 'kakuna', weight: 5, min: 9, max: 12, herd: [2, 2] },
      { species: 'ekans', weight: 7, min: 9, max: 13, herd: [1, 2] },
      { species: 'nidoran-f', weight: 4, min: 9, max: 13, herd: [2, 2] },
      { species: 'nidoran-m', weight: 4, min: 9, max: 13, herd: [2, 2] },
      { species: 'oddish', weight: 5, min: 9, max: 13, herd: [2, 3] },
      { species: 'bellsprout', weight: 5, min: 9, max: 13, herd: [2, 2] },
      { species: 'mankey', weight: 6, min: 9, max: 13, herd: [2, 3] },
      { species: 'meowth', weight: 5, min: 9, max: 13, herd: [1, 2] },
      { species: 'jigglypuff', weight: 4, min: 9, max: 12, herd: [1, 2] },
      { species: 'vulpix', weight: 4, min: 9, max: 12, herd: [1, 2] },
      { species: 'ponyta', weight: 5, min: 9, max: 13, herd: [2, 3] },
      { species: 'hjordpup', weight: 6, min: 8, max: 13, herd: [2, 3] },
      { species: 'cloveret', weight: 4, min: 8, max: 12, herd: [1, 2] },
      { species: 'zubat', weight: 6, min: 9, max: 13, herd: [2, 4] },
      { species: 'geodude', weight: 10, min: 9, max: 13, herd: [2, 3], habitat: 'rock' },
      { species: 'poliwag', weight: 6, min: 9, max: 13, herd: [2, 3], habitat: 'water' },
      { species: 'psyduck', weight: 6, min: 9, max: 13, herd: [1, 2], habitat: 'water' },
      { species: 'pikachu', weight: 2, min: 9, max: 12, herd: [1, 2] },
      { species: 'eevee', weight: 1, min: 9, max: 12, herd: [1, 1] },
      { species: 'abra', weight: 1, min: 9, max: 12, herd: [1, 1] },
    ],
  },
];

/** Whether a spot suits a habitat: close to water, or among the stone mesas. */
function habitatAt(x: number, z: number, habitat: Habitat): boolean {
  if (habitat === 'water') {
    const water = Math.min(distToPolyline(x, z, RIVER_IN), distToPolyline(x, z, RIVER_OUT), lakeDist(x, z), Math.hypot(x - POND.x, z - POND.z) - POND.r);
    return water < 35;
  }
  return MESAS.some((m) => Math.hypot(x - m.x, z - m.z) < m.r + 60);
}

/** A wild creature that spent Teleport's PP blinked away at the end of the battle. */
function teleported(c: Creature): boolean {
  return c.moves.some((m) => MOVES[m.id]?.special === 'teleport' && m.pp < MOVES[m.id].pp);
}

const MAX_HERDS = 7;

interface CellPlan {
  x: number;
  z: number;
  entry: ZoneEntry;
  /** Seeds the herd's members (levels, stats, spots). */
  seed: number;
}
const SPAWN_MIN = 55;
const SPAWN_MAX = 105;
const DESPAWN = 160;
export const ENGAGE_RADIUS = 4.2;

export class WildManager {
  readonly root = new THREE.Group();
  private herds: Herd[] = [];
  private rng: Rng;
  private nextId = 1;
  private spawnTimer = 0;
  /** Lunges that connected with the trainer since the last consumeHits(). */
  private hits: WildCreature[] = [];
  /** Shared spawn keys caught or defeated here or by a friend: they don't come back this epoch. */
  private taken = new Set<string>();
  /** Keys this player took recently, with when, to repeat to friends. */
  private recentTaken: { key: string; at: number }[] = [];
  /** Cells whose whole herd is taken this epoch. */
  private emptied = new Set<string>();
  /** Cells a friend has a herd out in, with the time window it was rolled in. */
  private friendCells = new Map<string, number>();
  /** Treats lying on the ground. */
  private baits: Bait[] = [];
  /** Alphas that roared and charged the trainer since the last consumeRoars(). */
  private roars: WildCreature[] = [];
  /** An Alpha was beaten or caught, here or by a friend (the key goes in the save). */
  onAlphaTaken?: (key: string) => void;

  private clock: () => number;
  private modelReady: (species: string) => boolean;

  /**
   * `seed` drives behaviour; `spawnSeed` (from the world's name) decides which herds live where.
   * Tests can pass their own clock and model check.
   */
  constructor(private world: World, seed: number, private spawnSeed = seed, opts: { clock?: () => number; modelReady?: (species: string) => boolean } = {}) {
    this.rng = new Rng(seed);
    this.root.name = 'wild';
    this.clock = opts.clock ?? (() => Date.now());
    this.modelReady = opts.modelReady ?? creatureModelReady;
  }

  get creatures(): WildCreature[] {
    return this.herds.flatMap((h) => h.members);
  }

  /** Clear everything near the player (e.g. a herd that would spawn on top of a battle). */
  clear(): void {
    for (const h of this.herds) for (const m of [...h.members]) this.removeMember(m);
    this.herds = [];
    for (const b of [...this.baits]) this.removeBait(b);
  }

  update(dt: number, player: THREE.Vector3, playerSpeed: number, sprinting: boolean, paused: boolean): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && !paused) {
      this.spawnTimer = 1.5;
      this.despawnFar(player);
      this.spawnAlphas(player);
      if (this.herds.length < MAX_HERDS) this.trySpawn(player);
      const cut = this.clock() - SHARED_SPAWN.shareMs;
      this.recentTaken = this.recentTaken.filter((t) => t.at >= cut);
    }
    this.updateBaits(dt, paused);
    for (const h of this.herds) {
      // The herd's centre drifts slowly so the group roams. An Alpha keeps to its lair.
      if (h.lair) {
        h.cx = h.lair.x;
        h.cz = h.lair.z;
      } else {
        h.cx += (this.rng.next() - 0.5) * dt * 0.6;
        h.cz += (this.rng.next() - 0.5) * dt * 0.6;
      }
      for (const m of h.members) this.think(m, dt, player, playerSpeed, sprinting, paused);
    }
    // Drop fully faded members and empty herds.
    for (const h of this.herds) {
      for (const m of [...h.members]) if (m.state === 'gone' && m.fade >= 1) this.removeMember(m);
    }
    this.herds = this.herds.filter((h) => h.members.length);
  }

  private think(m: WildCreature, dt: number, player: THREE.Vector3, playerSpeed: number, sprinting: boolean, paused: boolean): void {
    const world = this.world;
    m.calm = Math.max(0, m.calm - dt);
    m.alert = Math.max(0, m.alert - dt);
    if (m.state === 'battle' || m.state === 'ball') {
      // Positioned by the battle scene.
      m.model.update(dt, 0);
      return;
    }
    if (m.remoteBusy) {
      // In a friend's battle or ball: their screen shows it, so it waits here unseen.
      m.mover.idle(dt, world);
      return;
    }
    if (m.state === 'gone') {
      m.fade = Math.min(1, m.fade + dt / 1.2);
      m.root.scale.setScalar(Math.max(0.001, 1 - m.fade));
      m.model.update(dt, 0);
      return;
    }
    const temperament = SPECIES[m.creature.species].temperament;
    const dist = Math.hypot(player.x - m.mover.pos.x, player.z - m.mover.pos.z);
    const toPlayer = Math.atan2(player.x - m.mover.pos.x, player.z - m.mover.pos.z);
    const run = 2.6 + m.model.radius * 4;
    const walk = 0.9 + m.model.radius * 1.5;

    // A creature reacting to a throw ignores its usual reflexes until it's done.
    const reacting = m.state === 'startle' || m.state === 'attack';
    if (m.alpha) {
      if (!paused && !reacting && m.state !== 'eat') this.guardLair(m, dt, dist);
    } else if (!paused && !reacting) {
      if (temperament === 'skittish' && sprinting && dist < 12 && m.state !== 'flee') {
        m.state = 'flee';
        m.timer = 2.5 + this.rng.next() * 1.5;
      } else if ((temperament === 'territorial' || temperament === 'aggressive') && dist < 9 && m.calm <= 0 && m.state !== 'charge' && m.state !== 'eat') {
        m.state = 'watch';
        m.tension += dt * (temperament === 'aggressive' ? 2 : 1);
        if (m.tension > 2.2 && dist < 6.5) m.state = 'charge';
      } else if (m.state === 'watch' && dist >= 11) {
        m.state = 'graze';
        m.tension = 0;
      }
    }

    switch (m.state) {
      case 'flee': {
        m.timer -= dt;
        const away = toPlayer + Math.PI;
        m.mover.steer(dt, m.mover.pos.x + Math.sin(away) * 6, m.mover.pos.z + Math.cos(away) * 6, run, world, 0);
        if (m.timer <= 0) {
          m.state = 'graze';
          m.timer = 2;
          m.herd.cx = m.mover.pos.x;
          m.herd.cz = m.mover.pos.z;
        }
        break;
      }
      case 'watch':
        m.mover.idle(dt, world);
        m.mover.face(dt * 2, toPlayer);
        break;
      case 'startle': {
        // Hop back from the trainer, then stand and stare for a moment before settling.
        m.timer -= dt;
        if (paused || m.timer < 2.2) {
          m.mover.idle(dt, world);
          m.mover.face(dt * 2.5, toPlayer);
        } else {
          const away = toPlayer + Math.PI;
          m.mover.steer(dt, m.mover.pos.x + Math.sin(away) * 4, m.mover.pos.z + Math.cos(away) * 4, walk * 2.2, world, 0);
        }
        if (m.timer <= 0) {
          m.state = 'graze';
          m.timer = 3;
          m.herd.cx = m.mover.pos.x;
          m.herd.cz = m.mover.pos.z;
        }
        break;
      }
      case 'attack':
        this.attack(m, dt, player, dist, toPlayer, run, paused);
        break;
      case 'charge':
        if (paused) m.mover.idle(dt, world);
        else m.mover.steer(dt, player.x, player.z, run * 1.1, world, 1.0);
        break;
      case 'eat':
        this.eat(m, dt, walk, paused);
        break;
      case 'wander': {
        const rem = m.mover.steer(dt, m.tx, m.tz, walk, world, 0.3);
        m.timer -= dt;
        if (rem < 0.4 || m.timer <= 0) {
          m.state = 'graze';
          m.timer = 2 + this.rng.next() * 5;
        }
        break;
      }
      default: {
        m.mover.idle(dt, world);
        m.timer -= dt;
        if (m.timer <= 0) {
          const a = this.rng.next() * Math.PI * 2;
          const r = 1 + this.rng.next() * 6;
          m.tx = m.herd.cx + Math.cos(a) * r;
          m.tz = m.herd.cz + Math.sin(a) * r;
          m.state = 'wander';
          m.timer = 6;
        }
      }
    }
    m.root.position.copy(m.mover.pos);
    m.root.rotation.y = m.mover.yaw;
    // Nibbling: dips its head to the Treat and back up.
    const food = m.state === 'eat' ? m.food : undefined;
    m.root.rotation.x = food && food.eater === m && food.at ? 0.1 * (1 - Math.cos(food.left * 9)) : 0;
    m.model.update(dt, m.mover.speed);
    void playerSpeed;
  }

  /**
   * An Alpha squares up to a trainer who comes near its lair, roars, then charges with
   * telegraphed lunges like a furious creature (DESIGN §4.6, §5.3). It won't back down from a
   * sprinting trainer, and once it calms down it waits a while before charging again.
   */
  private guardLair(m: WildCreature, dt: number, dist: number): void {
    if (dist < ALPHA.notice && m.calm <= 0) {
      if (m.state !== 'watch') {
        m.state = 'watch';
        m.tension = 0;
        m.model.play('special');
      }
      m.tension += dt;
      if (m.tension >= ALPHA.roar) {
        this.breakOut(m, 'charge');
        this.roars.push(m);
      }
    } else if (m.state === 'watch') {
      m.state = 'graze';
      m.tension = 0;
    }
  }

  /** Alphas that started charging the trainer since the last call. */
  consumeRoars(): WildCreature[] {
    const out = this.roars;
    this.roars = [];
    return out;
  }

  /**
   * A Treat landed at `at`, or bounced off `hit`. The creature it hit, else a furious one nearby,
   * else the nearest within reach, comes to eat it: an angry one calms down first (but stays
   * wary), a calm one is too busy to notice the trainer. Returns the eater, if any yet, and
   * whether it was furious (charging the trainer) a moment ago.
   */
  treat(at: { x: number; y: number; z: number }, hit: WildCreature | null): { eater: WildCreature | null; calmed: boolean } {
    const x = hit ? hit.mover.pos.x : at.x;
    const z = hit ? hit.mover.pos.z : at.z;
    const mesh = makeTreat();
    mesh.rotation.set(0, Math.random() * Math.PI * 2, 0);
    const y = Math.max(this.world.heightAt(x, z), this.world.waterLevel) + 0.02;
    mesh.position.set(x, y, z);
    this.root.add(mesh);
    const bait: Bait = { x, y, z, life: TREAT.life, left: TREAT.eat, eater: null, at: false, trot: 0, mesh };
    this.baits.push(bait);
    const eater = hit && this.canEat(hit) ? hit : this.pickEater(bait);
    const calmed = !!eater && (eater.state === 'attack' || eater.state === 'charge');
    if (eater) this.startEating(eater, bait);
    return { eater, calmed };
  }

  /** Treats on the ground (tests and the text view). */
  get treats(): readonly Bait[] {
    return this.baits;
  }

  private canEat(m: WildCreature): boolean {
    return m.state !== 'battle' && m.state !== 'ball' && m.state !== 'gone' && m.state !== 'flee' && m.state !== 'eat' && !m.remoteBusy;
  }

  private pickEater(b: Bait): WildCreature | null {
    let best: WildCreature | null = null;
    let score = Infinity;
    for (const m of this.creatures) {
      if (!this.canEat(m)) continue;
      const d = Math.hypot(m.mover.pos.x - b.x, m.mover.pos.z - b.z);
      if (d > TREAT.lure) continue;
      // Something furious goes for it first: that's what the Treat was thrown for.
      const s = d - (m.state === 'attack' || m.state === 'charge' ? 100 : 0);
      if (s < score) {
        score = s;
        best = m;
      }
    }
    return best;
  }

  private startEating(m: WildCreature, b: Bait): void {
    if (m.state === 'attack' || m.state === 'charge' || m.state === 'watch') this.calmDown(m);
    m.state = 'eat';
    m.food = b;
    m.tension = 0;
    b.eater = m;
    b.at = false;
    b.trot = 0;
  }

  private eat(m: WildCreature, dt: number, walk: number, paused: boolean): void {
    const b = m.food;
    if (!b || b.eater !== m || !this.baits.includes(b)) {
      m.food = undefined;
      m.state = 'graze';
      m.timer = 2;
      return;
    }
    const reach = m.model.radius + 0.3;
    const d = Math.hypot(b.x - m.mover.pos.x, b.z - m.mover.pos.z);
    if (paused) m.mover.idle(dt, this.world);
    else if (!b.at && d > reach && b.trot < 6) {
      // Trots over to it (and gives up on a straight line if something is in the way).
      b.trot += dt;
      m.mover.steer(dt, b.x, b.z, walk * 1.8, this.world, reach * 0.8);
    } else {
      b.at = true;
      m.mover.idle(dt, this.world);
      m.mover.face(dt * 3, Math.atan2(b.x - m.mover.pos.x, b.z - m.mover.pos.z));
      b.left -= dt;
      const k = Math.max(0, b.left / TREAT.eat);
      b.mesh.scale.setScalar(Math.max(0.001, 0.35 + 0.65 * k));
    }
    if (b.left <= 0) {
      this.removeBait(b);
      m.food = undefined;
      m.state = 'graze';
      m.timer = 3;
      m.calm = Math.max(m.calm, TREAT.calm);
      m.herd.cx = m.mover.pos.x;
      m.herd.cz = m.mover.pos.z;
      m.model.play('happy');
    }
  }

  /** Untouched Treats draw in whoever wanders close, and are lost after a while. */
  private updateBaits(dt: number, paused: boolean): void {
    for (const b of [...this.baits]) {
      // Its eater ran off, got caught or was pulled into a battle: it's up for grabs again.
      if (b.eater && (b.eater.state !== 'eat' || b.eater.food !== b)) b.eater = null;
      if (b.eater) continue;
      if (!paused) b.life -= dt;
      if (b.life <= 0) {
        this.removeBait(b);
        continue;
      }
      if (b.life < 1) b.mesh.scale.setScalar(Math.max(0.001, b.life));
      const m = paused ? null : this.pickEater(b);
      if (m) this.startEating(m, b);
    }
  }

  private removeBait(b: Bait): void {
    this.baits = this.baits.filter((x) => x !== b);
    if (b.eater?.food === b) b.eater.food = undefined;
    b.mesh.removeFromParent();
    disposeBall(b.mesh);
  }

  private attack(m: WildCreature, dt: number, player: THREE.Vector3, dist: number, toPlayer: number, run: number, paused: boolean): void {
    const a = m.attack;
    const A = WILD_ATTACK;
    if (!a) {
      m.state = 'graze';
      return;
    }
    if (paused) {
      m.mover.idle(dt, this.world);
      return;
    }
    a.left -= dt;
    if (a.left <= 0 || Math.hypot(player.x - a.ox, player.z - a.oz) > A.range) {
      this.calmDown(m);
      return;
    }
    a.t -= dt;
    switch (a.phase) {
      case 'approach':
        m.mover.steer(dt, player.x, player.z, run * 1.15, this.world, 0.5);
        if (dist < A.windupAt) {
          a.phase = 'windup';
          a.t = A.windup;
        }
        break;
      case 'windup':
        // The tell: it stops dead and squares up before lunging.
        m.mover.idle(dt, this.world);
        m.mover.face(dt * 4, toPlayer);
        if (a.t <= 0) {
          a.phase = 'lunge';
          a.t = A.lunge;
          a.hit = false;
          a.dx = Math.sin(toPlayer);
          a.dz = Math.cos(toPlayer);
          m.model.play('attack');
        }
        break;
      case 'lunge':
        m.mover.dash(dt, a.dx * A.lungeSpeed, a.dz * A.lungeSpeed, this.world);
        if (!a.hit && Math.hypot(player.x - m.mover.pos.x, player.z - m.mover.pos.z) < m.model.radius + A.reach) {
          a.hit = true;
          this.hits.push(m);
          a.phase = 'recover';
          a.t = A.recover;
        } else if (a.t <= 0) {
          a.phase = 'recover';
          a.t = A.recover;
        }
        break;
      case 'recover': {
        // Skid out of the lunge and circle back.
        const away = toPlayer + Math.PI;
        if (a.t > A.recover * 0.5) m.mover.steer(dt, m.mover.pos.x + Math.sin(away) * 3, m.mover.pos.z + Math.cos(away) * 3, run * 0.5, this.world, 0);
        else {
          m.mover.idle(dt, this.world);
          m.mover.face(dt * 2, toPlayer);
        }
        if (a.t <= 0) a.phase = 'approach';
        break;
      }
    }
  }

  /** Lunges that hit the trainer since the last call. */
  consumeHits(): WildCreature[] {
    const out = this.hits;
    this.hits = [];
    return out;
  }

  /** Any creature currently charging the trainer (no HP regeneration while one is). */
  get attacking(): boolean {
    return this.creatures.some((m) => m.state === 'attack');
  }

  /** Freeze a creature inside an overworld ball while it shakes. */
  hold(m: WildCreature): void {
    m.state = 'ball';
    m.tension = 0;
    m.attack = undefined;
  }

  /** Caught: it stays in the ball and is gone from the world. */
  caught(m: WildCreature): void {
    m.state = 'gone';
    m.fade = 1;
    this.take(m);
  }

  /** Mark a shared creature as taken so it doesn't respawn, and tell friends. */
  private take(m: WildCreature): void {
    if (!m.key || this.taken.has(m.key)) return;
    this.taken.add(m.key);
    this.recentTaken.push({ key: m.key, at: this.clock() });
    if (m.alpha) this.onAlphaTaken?.(m.key);
  }

  /** Keys taken here recently, for the network snapshot (empty most of the time). */
  get sharedTaken(): string[] {
    return this.recentTaken.map((t) => t.key);
  }

  /** Keys of shared creatures this player is battling or catching right now. */
  get sharedBusy(): string[] {
    const out: string[] = [];
    for (const m of this.creatures) if (m.key && (m.state === 'battle' || m.state === 'ball')) out.push(m.key);
    return out;
  }

  /** A friend caught or defeated these: they fade out here too (unless this player is mid-battle with one). */
  applyTaken(keys: readonly string[]): void {
    for (const key of keys) {
      if (this.taken.has(key)) continue;
      this.taken.add(key);
      if (key.startsWith('alpha:')) this.onAlphaTaken?.(key);
      const m = this.creatures.find((c) => c.key === key);
      if (m && m.state !== 'battle' && m.state !== 'ball' && m.state !== 'gone') {
        m.state = 'gone';
        m.fade = m.remoteBusy ? 1 : 0;
      }
    }
  }

  /** Cells with a herd out here, as `i,j,epoch`, so a friend arriving later rolls the same ones. */
  get liveCells(): string[] {
    const out: string[] = [];
    for (const h of this.herds) if (h.cell && h.epoch !== undefined) out.push(`${h.cell},${h.epoch}`);
    return out;
  }

  /** Every friend's live cells (`i,j,epoch`). */
  setFriendCells(cells: Iterable<string>): void {
    this.friendCells.clear();
    for (const c of cells) {
      const m = /^(-?\d+),(-?\d+),(\d+)$/.exec(c);
      if (m) this.friendCells.set(`${m[1]},${m[2]}`, Number(m[3]));
    }
  }

  /** Every friend's busy keys: those creatures are hidden here until released. */
  setRemoteBusy(keys: ReadonlySet<string>): void {
    for (const m of this.creatures) {
      const busy = !!m.key && keys.has(m.key) && m.state !== 'battle' && m.state !== 'ball' && m.state !== 'gone';
      if (busy === !!m.remoteBusy) continue;
      m.remoteBusy = busy;
      m.root.visible = !busy;
      if (busy) {
        m.attack = undefined;
        m.tension = 0;
        if (m.state === 'charge' || m.state === 'attack') m.state = 'graze';
      } else {
        // Back from a friend's battle or ball: wary for a while.
        m.alert = Math.max(m.alert, 20);
        m.calm = Math.max(m.calm, 20);
      }
    }
  }

  /**
   * Broke out of a ball (DESIGN §5.3): 'flee' bolts (with any skittish herd-mates), 'startle'
   * backs off warily, 'charge' goes for the trainer. 'battle' is started by the game; here it
   * just turns to face the trainer. Every reaction leaves it alert for a while.
   */
  breakOut(m: WildCreature, reaction: 'flee' | 'startle' | 'battle' | 'charge'): void {
    m.mover.place(m.root.position.x, m.root.position.z, this.world, m.root.rotation.y);
    m.alert = 25;
    m.tension = 0;
    m.attack = undefined;
    if (reaction === 'flee') {
      m.state = 'flee';
      m.timer = 4 + this.rng.next() * 1.5;
      for (const o of m.herd.members) {
        if (o === m || o.state === 'battle' || o.state === 'ball' || o.state === 'gone') continue;
        o.alert = Math.max(o.alert, 20);
        if (SPECIES[o.creature.species].temperament === 'skittish') {
          o.state = 'flee';
          o.timer = 3 + this.rng.next() * 1.5;
        }
      }
    } else if (reaction === 'startle') {
      m.state = 'startle';
      m.timer = 3.6;
    } else if (reaction === 'charge') {
      m.state = 'attack';
      m.attack = { phase: 'approach', t: 0, left: WILD_ATTACK.duration, ox: m.herd.cx, oz: m.herd.cz, dx: 0, dz: 1, hit: false };
    } else {
      m.state = 'watch';
    }
  }

  /** It gives up the chase and goes back to grazing, still wary. */
  calmDown(m: WildCreature): void {
    m.state = 'graze';
    m.attack = undefined;
    m.timer = 3;
    m.calm = Math.max(m.calm, 20);
    m.alert = Math.max(m.alert, 10);
    m.herd.cx = m.mover.pos.x;
    m.herd.cz = m.mover.pos.z;
  }

  /** Something landed nearby (a missed ball): creatures within `r` notice and stay alert. */
  disturb(x: number, z: number, r: number, seconds: number): void {
    for (const m of this.creatures) {
      if (m.state !== 'graze' && m.state !== 'wander') continue;
      if (Math.hypot(m.mover.pos.x - x, m.mover.pos.z - z) < r) m.alert = Math.max(m.alert, seconds);
    }
  }

  /** The closest wild creature the player can start a battle with, if any. */
  nearestEngageable(player: THREE.Vector3): WildCreature | null {
    let best: WildCreature | null = null;
    let bd = ENGAGE_RADIUS;
    for (const m of this.creatures) {
      if (m.state === 'battle' || m.state === 'gone' || m.state === 'flee' || m.state === 'ball' || m.remoteBusy) continue;
      const d = Math.hypot(player.x - m.mover.pos.x, player.z - m.mover.pos.z);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    return best;
  }

  /** A territorial creature that has reached the player mid-charge (it starts the battle). */
  charger(player: THREE.Vector3): WildCreature | null {
    for (const m of this.creatures) {
      if (m.state !== 'charge' || m.remoteBusy) continue;
      if (Math.hypot(player.x - m.mover.pos.x, player.z - m.mover.pos.z) < 2.2) return m;
    }
    return null;
  }

  /** The creature plus its nearest healthy herd-mate: the two that will fight. */
  opponentsFor(m: WildCreature): WildCreature[] {
    const mates = m.herd.members
      .filter((o) => o !== m && o.state !== 'gone' && o.state !== 'battle' && o.state !== 'ball' && !o.remoteBusy && o.mover.pos.distanceTo(m.mover.pos) < 16)
      .sort((a, b) => a.mover.pos.distanceTo(m.mover.pos) - b.mover.pos.distanceTo(m.mover.pos));
    return mates.length ? [m, mates[0]] : [m];
  }

  /** Freeze creatures for a battle. */
  enterBattle(list: WildCreature[]): void {
    for (const m of list) {
      m.state = 'battle';
      m.tension = 0;
      m.attack = undefined;
    }
  }

  /** After a battle: fainted creatures fade away, caught ones are already in a ball, the rest calm down and go back to grazing. */
  leaveBattle(list: WildCreature[], fainted: Set<string>, caught: Set<string> = new Set()): void {
    for (const m of list) {
      if (caught.has(m.creature.uid)) {
        m.state = 'gone';
        m.fade = 1;
        this.take(m);
      } else if (fainted.has(m.creature.uid) || teleported(m.creature)) {
        m.state = 'gone';
        m.fade = 0;
        this.take(m);
      } else {
        // Pick up from wherever the battle left it standing.
        m.mover.place(m.root.position.x, m.root.position.z, this.world, m.root.rotation.y);
        m.state = 'graze';
        m.timer = 3;
        m.calm = 20;
        m.alert = 20;
        m.herd.cx = m.mover.pos.x;
        m.herd.cz = m.mover.pos.z;
      }
    }
    // The rest of the herd stays calm for a while too, so you aren't chain-charged.
    for (const m of list) for (const o of m.herd.members) o.calm = Math.max(o.calm, 20);
  }

  private despawnFar(player: THREE.Vector3): void {
    for (const h of this.herds) {
      if (h.members.some((m) => m.state === 'battle' || m.state === 'ball')) continue;
      if (Math.hypot(h.cx - player.x, h.cz - player.z) > DESPAWN) for (const m of [...h.members]) this.removeMember(m);
    }
    this.herds = this.herds.filter((h) => h.members.length);
  }

  /**
   * Fill nearby grid cells with their herds, nearest first: cells whose herd point lies in the
   * spawn ring (out of sight, not too far) and that don't already have a herd here.
   */
  private trySpawn(player: THREE.Vector3): void {
    const C = SHARED_SPAWN.cell;
    const epoch = Math.floor(this.clock() / SHARED_SPAWN.epochMs);
    const reach = Math.ceil(SPAWN_MAX / C) + 1;
    const ci = Math.floor(player.x / C);
    const cj = Math.floor(player.z / C);
    const live = new Set(this.herds.map((h) => h.cell));
    const plans: { i: number; j: number; e: number; d: number; plan: CellPlan }[] = [];
    for (let i = ci - reach; i <= ci + reach; i++) {
      for (let j = cj - reach; j <= cj + reach; j++) {
        if (live.has(`${i},${j}`)) continue;
        // A friend's herd from just before the window turned over: meet that one, not a new roll.
        const theirs = this.friendCells.get(`${i},${j}`);
        const e = theirs !== undefined && Math.abs(theirs - epoch) <= 1 ? theirs : epoch;
        if (this.emptied.has(`${i},${j},${e}`)) continue;
        const plan = this.cellPlan(i, j, e);
        if (!plan) continue;
        const d = Math.hypot(plan.x - player.x, plan.z - player.z);
        if (d >= SPAWN_MIN && d <= SPAWN_MAX) plans.push({ i, j, e, d, plan });
      }
    }
    plans.sort((a, b) => a.d - b.d);
    for (const p of plans) {
      if (this.herds.length >= MAX_HERDS) return;
      // Wait for a streamed model rather than spawning something else: both players must agree.
      if (!this.modelReady(p.plan.entry.species)) continue;
      this.spawnFromPlan(p.i, p.j, p.e, p.plan);
    }
  }

  /** What lives in a cell this epoch: the same answer on every machine for the same world. */
  cellPlan(i: number, j: number, epoch: number): CellPlan | null {
    const C = SHARED_SPAWN.cell;
    const rng = new Rng(mix(this.spawnSeed, i, j, epoch));
    if (rng.next() >= SHARED_SPAWN.chance) return null;
    // Keep herd points in the middle of their cells so neighbouring herds don't overlap.
    const x = (i + 0.2 + rng.next() * 0.6) * C;
    const z = (j + 0.2 + rng.next() * 0.6) * C;
    if (!this.spawnable(x, z)) return null;
    const d = Math.hypot(x - TOWN.x, z - TOWN.z);
    const zone = ZONES.find((zn) => d < zn.maxDist) ?? ZONES[ZONES.length - 1];
    const fits = zone.entries.filter((e) => !e.habitat || habitatAt(x, z, e.habitat));
    const entry = this.pickEntry(fits.length ? fits : zone.entries.filter((e) => !e.habitat), rng);
    return { x, z, entry, seed: rng.int(0, 0x7fffffff) };
  }

  /** Spawn a cell's herd, leaving out members already taken this epoch. */
  private spawnFromPlan(i: number, j: number, epoch: number, plan: CellPlan): Herd {
    const herd = this.spawnHerd(plan.x, plan.z, plan.entry.species, undefined, { entry: plan.entry, rng: new Rng(plan.seed), keyPrefix: `${i},${j},${epoch}` });
    herd.cell = `${i},${j}`;
    herd.epoch = epoch;
    if (!herd.members.length) this.emptied.add(`${i},${j},${epoch}`);
    return herd;
  }

  /** Today's Alphas come out at their lairs when a trainer is near, unless someone already took them. */
  private spawnAlphas(player: THREE.Vector3): void {
    const day = alphaDay(this.clock());
    for (const lair of ALPHA_LAIRS) {
      if (this.herds.some((h) => h.lair === lair)) continue;
      if (Math.hypot(lair.x - player.x, lair.z - player.z) > ALPHA.spawn) continue;
      if (this.taken.has(alphaKey(lair, day)) || !this.modelReady(lair.species)) continue;
      this.spawnAlpha(lair, day);
    }
  }

  /** An Alpha at its lair: the same creature on every machine for the same world and day. */
  spawnAlpha(lair: AlphaLair, day = alphaDay(this.clock())): Herd {
    const herd: Herd = { id: this.nextId++, species: lair.species, cx: lair.x, cz: lair.z, members: [], lair };
    const creature = alphaCreature(lair, mix(this.spawnSeed, seedFromName(lair.id), day), newUid(this.rng));
    const m = this.addMember(herd, creature, lair.x, lair.z, 0, alphaKey(lair, day));
    m.alpha = lair;
    this.herds.push(herd);
    return herd;
  }

  /** The Alphas out right now (for the compass). */
  get alphas(): WildCreature[] {
    return this.herds.filter((h) => h.lair).flatMap((h) => h.members).filter((m) => m.state !== 'gone' && !m.remoteBusy);
  }

  spawnable(x: number, z: number): boolean {
    const w = this.world;
    if (Math.abs(x) > w.halfSize - 20 || Math.abs(z) > w.halfSize - 20) return false;
    if (Math.hypot(x - TOWN.x, z - TOWN.z) < TOWN.fenceR + 22) return false;
    if (w.heightAt(x, z) < w.waterLevel + 0.4) return false;
    for (const m of MESAS) if (Math.hypot(x - m.x, z - m.z) < m.r * 0.9) return false;
    return true;
  }

  /**
   * Spawn a herd at a point. Shared herds pass their cell's entry, seeded rng and key prefix, so
   * every member comes out identical on each machine; debugging tools pass just a species.
   */
  spawnHerd(x: number, z: number, forceSpecies?: string, forceLevel?: number, shared?: { entry: ZoneEntry; rng: Rng; keyPrefix: string }): Herd {
    const d = Math.hypot(x - TOWN.x, z - TOWN.z);
    const zone = ZONES.find((zn) => d < zn.maxDist) ?? ZONES[ZONES.length - 1];
    const entry = shared?.entry ?? (forceSpecies ? zone.entries.find((e) => e.species === forceSpecies) ?? { species: forceSpecies, weight: 1, min: 3, max: 5, herd: [2, 2] as [number, number] } : this.pickEntry(this.candidates(zone.entries, x, z)));
    const rng = shared?.rng ?? this.rng;
    const herd: Herd = { id: this.nextId++, species: entry.species, cx: x, cz: z, members: [] };
    const n = rng.int(entry.herd[0], entry.herd[1]);
    for (let i = 0; i < n; i++) {
      const level = forceLevel ?? rng.int(entry.min, entry.max);
      // Shared herds take their ID from this machine, so two catches of one creature (a race) stay two creatures.
      const creature = createCreature(entry.species, level, rng, { item: rng.chance(8) ? 'oran-berry' : undefined, uid: shared ? newUid(this.rng) : undefined });
      const key = shared ? `${shared.keyPrefix}:${i}` : undefined;
      const a = rng.next() * Math.PI * 2;
      const rr = 1 + rng.next() * 3;
      const yaw = rng.next() * Math.PI * 2;
      const timer = rng.next() * 3;
      // Taken this epoch (here or by a friend): the rest of the herd still comes out the same.
      if (key && this.taken.has(key)) continue;
      this.addMember(herd, creature, x + Math.cos(a) * rr, z + Math.sin(a) * rr, yaw, key, timer);
    }
    this.herds.push(herd);
    return herd;
  }

  private addMember(herd: Herd, creature: Creature, x: number, z: number, yaw: number, key?: string, timer = 0): WildCreature {
    const model = createCreatureModel(creature.species, { alpha: creature.alpha });
    const root = new THREE.Group();
    root.add(model.root);
    const mover = new Mover(Math.max(0.2, model.radius * 0.8), 10, 6);
    mover.place(x, z, this.world, yaw);
    root.position.copy(mover.pos);
    const m: WildCreature = {
      id: this.nextId++, creature, model, root, mover, herd, state: 'graze', timer,
      tx: herd.cx, tz: herd.cz, tension: 0, calm: 0, fade: 0, alert: 0, key,
    };
    herd.members.push(m);
    this.root.add(root);
    return m;
  }

  /**
   * Entries that can spawn at a spot: the habitat fits, and the species' model has finished
   * loading (models outside the gameplay pack stream in after the world is built).
   */
  private candidates(entries: ZoneEntry[], x: number, z: number): ZoneEntry[] {
    const ok = entries.filter((e) => (!e.habitat || habitatAt(x, z, e.habitat)) && creatureModelReady(e.species));
    return ok.length ? ok : entries.filter((e) => !e.habitat);
  }

  private pickEntry(entries: ZoneEntry[], rng: Rng = this.rng): ZoneEntry {
    const total = entries.reduce((a, e) => a + e.weight, 0);
    let r = rng.next() * total;
    for (const e of entries) {
      r -= e.weight;
      if (r <= 0) return e;
    }
    return entries[0];
  }

  private removeMember(m: WildCreature): void {
    // Despawned mid-meal: the Treat is up for grabs again.
    if (m.food?.eater === m) m.food.eater = null;
    m.food = undefined;
    this.root.remove(m.root);
    m.model.dispose();
    m.herd.members = m.herd.members.filter((x) => x !== m);
  }
}
