import * as THREE from 'three';
import { createCreature } from '../../shared/battle/creature';
import { Rng } from '../../shared/battle/rng';
import type { Creature } from '../../shared/battle/types';
import { SPECIES } from '../../shared/data/species';
import { createCreatureModel, type CreatureModel } from '../creatures';
import { MESAS, TOWN } from '../world/layout';
import type { World } from '../world/types';
import { Mover } from './mover';

/**
 * Wild creatures of Hearthmeadow (DESIGN §4.1): they live in pairs, packs and flocks that graze
 * and wander, notice the player, and react by temperament. Skittish ones bolt from a sprinting
 * trainer, territorial ones square up and charge if you linger. Walking up and pressing the
 * interact key starts a double battle with the creature and its nearest herd-mate.
 */

export type WildState = 'graze' | 'wander' | 'flee' | 'watch' | 'charge' | 'battle' | 'gone';

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
}

interface Herd {
  id: number;
  species: string;
  cx: number;
  cz: number;
  members: WildCreature[];
}

interface ZoneEntry {
  species: string;
  weight: number;
  min: number;
  max: number;
  herd: [number, number];
}

/** Spawn tables by distance from Bramblewick. Further out means stronger creatures. */
const ZONES: { maxDist: number; entries: ZoneEntry[] }[] = [
  {
    maxDist: 190,
    entries: [
      { species: 'nibblet', weight: 30, min: 2, max: 4, herd: [2, 3] },
      { species: 'finchlet', weight: 25, min: 2, max: 4, herd: [2, 4] },
      { species: 'dewmite', weight: 20, min: 2, max: 4, herd: [2, 4] },
      { species: 'cloveret', weight: 14, min: 3, max: 5, herd: [2, 2] },
      { species: 'hjordpup', weight: 11, min: 3, max: 5, herd: [2, 3] },
    ],
  },
  {
    maxDist: 360,
    entries: [
      { species: 'nibblet', weight: 22, min: 4, max: 8, herd: [2, 3] },
      { species: 'finchlet', weight: 20, min: 4, max: 8, herd: [2, 4] },
      { species: 'dewmite', weight: 10, min: 4, max: 7, herd: [2, 3] },
      { species: 'cocoonch', weight: 10, min: 8, max: 10, herd: [2, 2] },
      { species: 'cloveret', weight: 16, min: 5, max: 8, herd: [2, 2] },
      { species: 'hjordpup', weight: 16, min: 5, max: 8, herd: [2, 3] },
      { species: 'stashquill', weight: 6, min: 8, max: 9, herd: [2, 2] },
    ],
  },
  {
    maxDist: Infinity,
    entries: [
      { species: 'nibblet', weight: 14, min: 8, max: 12, herd: [2, 3] },
      { species: 'finchlet', weight: 12, min: 8, max: 12, herd: [2, 3] },
      { species: 'fjordling', weight: 10, min: 10, max: 14, herd: [2, 3] },
      { species: 'cocoonch', weight: 12, min: 9, max: 13, herd: [2, 2] },
      { species: 'cloveret', weight: 12, min: 8, max: 12, herd: [2, 2] },
      { species: 'hjordpup', weight: 18, min: 8, max: 13, herd: [2, 3] },
      { species: 'stashquill', weight: 14, min: 10, max: 14, herd: [2, 2] },
    ],
  },
];

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
    if (m.state === 'battle') {
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

    if (!paused) {
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

  /** The closest wild creature the player can start a battle with, if any. */
  nearestEngageable(player: THREE.Vector3): WildCreature | null {
    let best: WildCreature | null = null;
    let bd = ENGAGE_RADIUS;
    for (const m of this.creatures) {
      if (m.state === 'battle' || m.state === 'gone' || m.state === 'flee') continue;
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
      .filter((o) => o !== m && o.state !== 'gone' && o.state !== 'battle' && o.mover.pos.distanceTo(m.mover.pos) < 16)
      .sort((a, b) => a.mover.pos.distanceTo(m.mover.pos) - b.mover.pos.distanceTo(m.mover.pos));
    return mates.length ? [m, mates[0]] : [m];
  }

  /** Freeze creatures for a battle. */
  enterBattle(list: WildCreature[]): void {
    for (const m of list) {
      m.state = 'battle';
      m.tension = 0;
    }
  }

  /** After a battle: fainted creatures fade away, caught ones are already in a ball, the rest calm down and go back to grazing. */
  leaveBattle(list: WildCreature[], fainted: Set<string>, caught: Set<string> = new Set()): void {
    for (const m of list) {
      if (caught.has(m.creature.uid)) {
        m.state = 'gone';
        m.fade = 1;
      } else if (fainted.has(m.creature.uid)) {
        m.state = 'gone';
        m.fade = 0;
      } else {
        // Pick up from wherever the battle left it standing.
        m.mover.place(m.root.position.x, m.root.position.z, this.world, m.root.rotation.y);
        m.state = 'graze';
        m.timer = 3;
        m.calm = 20;
        m.herd.cx = m.mover.pos.x;
        m.herd.cz = m.mover.pos.z;
      }
    }
    // The rest of the herd stays calm for a while too, so you aren't chain-charged.
    for (const m of list) for (const o of m.herd.members) o.calm = Math.max(o.calm, 20);
  }

  private despawnFar(player: THREE.Vector3): void {
    for (const h of this.herds) {
      if (h.members.some((m) => m.state === 'battle')) continue;
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
    const entry = forceSpecies ? zone.entries.find((e) => e.species === forceSpecies) ?? { species: forceSpecies, weight: 1, min: 3, max: 5, herd: [2, 2] as [number, number] } : this.pickEntry(zone.entries);
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
        tx: x, tz: z, tension: 0, calm: 0, fade: 0,
      };
      herd.members.push(m);
      this.root.add(root);
    }
    this.herds.push(herd);
    return herd;
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
