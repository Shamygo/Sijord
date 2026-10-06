import * as THREE from 'three';
import { createCreature } from '../../shared/battle/creature';
import { Rng } from '../../shared/battle/rng';
import type { Creature } from '../../shared/battle/types';
import { MOVES } from '../../shared/data/moves';
import { SPECIES } from '../../shared/data/species';
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
  | 'attack';

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
}

interface Herd {
  id: number;
  species: string;
  cx: number;
  cz: number;
  members: WildCreature[];
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

  constructor(private world: World, seed: number) {
    this.rng = new Rng(seed);
    this.root.name = 'wild';
  }

  get creatures(): WildCreature[] {
    return this.herds.flatMap((h) => h.members);
  }

  /** Clear everything near the player (e.g. a herd that would spawn on top of a battle). */
  clear(): void {
    for (const h of this.herds) for (const m of [...h.members]) this.removeMember(m);
    this.herds = [];
  }

  update(dt: number, player: THREE.Vector3, playerSpeed: number, sprinting: boolean, paused: boolean): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && !paused) {
      this.spawnTimer = 1.5;
      this.despawnFar(player);
      if (this.herds.length < MAX_HERDS) this.trySpawn(player);
    }
    for (const h of this.herds) {
      // The herd's centre drifts slowly so the group roams.
      h.cx += (this.rng.next() - 0.5) * dt * 0.6;
      h.cz += (this.rng.next() - 0.5) * dt * 0.6;
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
    if (!paused && !reacting) {
      if (temperament === 'skittish' && sprinting && dist < 12 && m.state !== 'flee') {
        m.state = 'flee';
        m.timer = 2.5 + this.rng.next() * 1.5;
      } else if ((temperament === 'territorial' || temperament === 'aggressive') && dist < 9 && m.calm <= 0 && m.state !== 'charge') {
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
    m.model.update(dt, m.mover.speed);
    void playerSpeed;
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
      if (m.state === 'battle' || m.state === 'gone' || m.state === 'flee' || m.state === 'ball') continue;
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
      if (m.state !== 'charge') continue;
      if (Math.hypot(player.x - m.mover.pos.x, player.z - m.mover.pos.z) < 2.2) return m;
    }
    return null;
  }

  /** The creature plus its nearest healthy herd-mate: the two that will fight. */
  opponentsFor(m: WildCreature): WildCreature[] {
    const mates = m.herd.members
      .filter((o) => o !== m && o.state !== 'gone' && o.state !== 'battle' && o.state !== 'ball' && o.mover.pos.distanceTo(m.mover.pos) < 16)
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
      } else if (fainted.has(m.creature.uid) || teleported(m.creature)) {
        m.state = 'gone';
        m.fade = 0;
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

  private trySpawn(player: THREE.Vector3): void {
    for (let attempt = 0; attempt < 6; attempt++) {
      const a = this.rng.next() * Math.PI * 2;
      const r = SPAWN_MIN + this.rng.next() * (SPAWN_MAX - SPAWN_MIN);
      const x = player.x + Math.cos(a) * r;
      const z = player.z + Math.sin(a) * r;
      if (!this.spawnable(x, z)) continue;
      if (this.herds.some((h) => Math.hypot(h.cx - x, h.cz - z) < 30)) continue;
      this.spawnHerd(x, z);
      return;
    }
  }

  spawnable(x: number, z: number): boolean {
    const w = this.world;
    if (Math.abs(x) > w.halfSize - 20 || Math.abs(z) > w.halfSize - 20) return false;
    if (Math.hypot(x - TOWN.x, z - TOWN.z) < TOWN.fenceR + 22) return false;
    if (w.heightAt(x, z) < w.waterLevel + 0.4) return false;
    for (const m of MESAS) if (Math.hypot(x - m.x, z - m.z) < m.r * 0.9) return false;
    return true;
  }

  /** Spawn a herd at a point (also used by debugging tools). */
  spawnHerd(x: number, z: number, forceSpecies?: string, forceLevel?: number): Herd {
    const d = Math.hypot(x - TOWN.x, z - TOWN.z);
    const zone = ZONES.find((zn) => d < zn.maxDist) ?? ZONES[ZONES.length - 1];
    const entry = forceSpecies ? zone.entries.find((e) => e.species === forceSpecies) ?? { species: forceSpecies, weight: 1, min: 3, max: 5, herd: [2, 2] as [number, number] } : this.pickEntry(this.candidates(zone.entries, x, z));
    const herd: Herd = { id: this.nextId++, species: entry.species, cx: x, cz: z, members: [] };
    const n = this.rng.int(entry.herd[0], entry.herd[1]);
    for (let i = 0; i < n; i++) {
      const level = forceLevel ?? this.rng.int(entry.min, entry.max);
      const creature = createCreature(entry.species, level, this.rng, { item: this.rng.chance(8) ? 'oran-berry' : undefined });
      const model = createCreatureModel(entry.species);
      const root = new THREE.Group();
      root.add(model.root);
      const mover = new Mover(Math.max(0.2, model.radius * 0.8), 10, 6);
      const a = this.rng.next() * Math.PI * 2;
      const rr = 1 + this.rng.next() * 3;
      mover.place(x + Math.cos(a) * rr, z + Math.sin(a) * rr, this.world, this.rng.next() * Math.PI * 2);
      root.position.copy(mover.pos);
      const m: WildCreature = {
        id: this.nextId++, creature, model, root, mover, herd, state: 'graze', timer: this.rng.next() * 3,
        tx: x, tz: z, tension: 0, calm: 0, fade: 0, alert: 0,
      };
      herd.members.push(m);
      this.root.add(root);
    }
    this.herds.push(herd);
    return herd;
  }

  /**
   * Entries that can spawn at a spot: the habitat fits, and the species' model has finished
   * loading (models outside the gameplay pack stream in after the world is built).
   */
  private candidates(entries: ZoneEntry[], x: number, z: number): ZoneEntry[] {
    const ok = entries.filter((e) => (!e.habitat || habitatAt(x, z, e.habitat)) && creatureModelReady(e.species));
    return ok.length ? ok : entries.filter((e) => !e.habitat);
  }

  private pickEntry(entries: ZoneEntry[]): ZoneEntry {
    const total = entries.reduce((a, e) => a + e.weight, 0);
    let r = this.rng.next() * total;
    for (const e of entries) {
      r -= e.weight;
      if (r <= 0) return e;
    }
    return entries[0];
  }

  private removeMember(m: WildCreature): void {
    this.root.remove(m.root);
    m.model.dispose();
    m.herd.members = m.herd.members.filter((x) => x !== m);
  }
}
