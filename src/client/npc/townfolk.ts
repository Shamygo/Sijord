import * as THREE from 'three';
import { layoutSettlement } from '../../shared/settlement-layout';
import { townsperson, type Townsperson } from '../../shared/townfolk';
import type { Settlement } from '../../shared/region';
import type { World } from '../world/types';
import { Villager } from './villager';

/** Residents appear within this distance of their settlement's edge and go past the second. */
const SHOW = 200;
const HIDE = 300;

export interface Resident {
  person: Townsperson;
  villager: Villager;
  settlement: Settlement;
}

/**
 * The people of the region's towns, villages and cities: standing in plazas, at shop doors and
 * by the gym, turning to watch you, each with something to say (src/shared/townfolk.ts). They
 * only exist while you are near their settlement.
 */
export class TownFolk {
  readonly root = new THREE.Group();
  private readonly here = new Map<string, Resident[]>();

  constructor(private readonly world: World) {
    this.root.name = 'townfolk';
  }

  update(dt: number, player: THREE.Vector3): void {
    const built = this.world.settlements?.built;
    if (!built) return;
    for (const [id, b] of built) {
      const s = b.s;
      const d = Math.hypot(s.x - player.x, s.z - player.z) - s.r;
      const on = this.here.get(id);
      if (!on && d < SHOW) this.spawn(s);
      else if (on && d > HIDE) this.despawn(id);
    }
    for (const [id, list] of this.here) {
      if (!built.has(id)) {
        this.despawn(id);
        continue;
      }
      for (const r of list) r.villager.update(dt, player);
    }
  }

  private spawn(s: Settlement): void {
    const layout = layoutSettlement(s);
    const list: Resident[] = layout.npcs.map((spot, i) => {
      const person = townsperson(s, i, spot);
      const villager = new Villager({ id: person.id, giver: person.name, x: spot.x, z: spot.z, yaw: spot.yaw, look: person.look, size: person.size }, this.world, false);
      this.root.add(villager.root);
      return { person, villager, settlement: s };
    });
    this.here.set(s.id, list);
  }

  private despawn(id: string): void {
    const list = this.here.get(id);
    if (!list) return;
    for (const r of list) this.root.remove(r.villager.root);
    this.here.delete(id);
  }

  /** The resident within `r` of a point, if any. */
  nearest(p: THREE.Vector3, r: number): Resident | null {
    let best: Resident | null = null, bd = r;
    for (const list of this.here.values()) {
      for (const res of list) {
        if (!res.villager.visible) continue;
        const d = p.distanceTo(res.villager.position);
        if (d < bd) {
          bd = d;
          best = res;
        }
      }
    }
    return best;
  }
}
