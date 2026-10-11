import * as THREE from 'three';
import type { DynamicColliders } from '../core/collision';
import { SETTLEMENTS, type Settlement } from '../../shared/region';
import { assetMeta, layoutSettlement, toWorld, type Placement, type SettlementLayout } from '../../shared/settlement-layout';
import type { LampLight, LampSpot } from './lamplight';
import type { Collider } from './types';
import { kitGlowMaterial, kitMaterial, type KitModel } from './world-kit';

/** How far away each tier of settlement is built (cities show on the skyline from far off). */
const SHOW: Record<Settlement['tier'], number> = { home: 0, small: 900, medium: 1500, large: 2700 };
const HIDE_PAD = 250;
/** Within this distance a building is drawn at full detail. */
const LOD_NEAR = 120;

/** A door or service point the game can react to (E at a Pokémon Center, a shop, a gym...). */
export interface ServicePoint {
  settlement: Settlement;
  role: Placement['role'];
  asset: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Named spots of the model in the world (plates in front of a gym, a desk, a counter). */
  anchors: Record<string, THREE.Vector3>;
}

interface Built {
  s: Settlement;
  layout: SettlementLayout;
  solid: { id: number; hi: number; lo: number; x: number; z: number; isHi: boolean }[];
  glow: { id: number; hi: number; lo: number; x: number; z: number; isHi: boolean }[];
  lamps: LampSpot[];
  services: ServicePoint[];
}

/**
 * Builds Sijord's 55 settlements beyond Bramblewick from the Blender kit as the player nears
 * them: one batched mesh for every building's solid part and one for windows and lanterns, so
 * all towns draw in two calls. Each building switches between its detailed and low-detail model
 * by distance. Colliders go to the dynamic collision layer, lamps to the lamplight.
 */
export class SettlementRenderer {
  readonly group = new THREE.Group();
  readonly built = new Map<string, Built>();
  private readonly solid: THREE.BatchedMesh;
  private readonly glow: THREE.BatchedMesh;
  private readonly geoIds = new Map<THREE.BufferGeometry, number>();
  private readonly glowIds = new Map<THREE.BufferGeometry, number>();
  private readonly freeSolid: number[] = [];
  private readonly freeGlow: number[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly last = new THREE.Vector3(1e9, 0, 1e9);
  private lodScale = 1;
  private check = 0;
  /** Called when a settlement is built or taken down (NPCs, services). */
  readonly listeners: { build: (b: Built) => void; drop: (b: Built) => void }[] = [];

  constructor(private readonly models: Map<string, KitModel>, private readonly dyn: DynamicColliders, private readonly lamps: LampLight, private readonly heightAt: (x: number, z: number) => number) {
    this.group.name = 'settlements';
    const uniq = (list: (THREE.BufferGeometry | null)[]) => [...new Set(list.filter((g): g is THREE.BufferGeometry => !!g))];
    const solids = uniq([...models.values()].flatMap((m) => [m.hi, m.lo]));
    const glows = uniq([...models.values()].flatMap((m) => [m.glowHi, m.glowLo]));
    const size = (gs: THREE.BufferGeometry[]) => gs.reduce((a, g) => [a[0] + g.attributes.position.count, a[1] + (g.index?.count ?? 0)], [0, 0]);
    const [sv, si] = size(solids);
    const [gv, gi] = size(glows);
    this.solid = new THREE.BatchedMesh(9000, Math.max(1, sv), Math.max(1, si), kitMaterial);
    this.glow = new THREE.BatchedMesh(6000, Math.max(1, gv), Math.max(1, gi), kitGlowMaterial);
    for (const g of solids) this.geoIds.set(g, this.solid.addGeometry(g));
    for (const g of glows) this.glowIds.set(g, this.glow.addGeometry(g));
    for (const b of [this.solid, this.glow]) {
      b.sortObjects = false;
      b.perObjectFrustumCulled = true;
      b.frustumCulled = false;
    }
    this.solid.castShadow = this.solid.receiveShadow = true;
    this.solid.name = 'settlement-buildings';
    this.glow.name = 'settlement-lights';
    this.group.add(this.solid, this.glow);
  }

  setLodScale(s: number): void {
    this.lodScale = s;
    this.last.set(1e9, 0, 1e9);
  }

  /** Build or take down settlements round the player, and switch building detail. */
  update(focus: THREE.Vector3, dt: number): void {
    this.check -= dt;
    if (this.check <= 0) {
      this.check = 0.5;
      // Build at most one settlement a tick, nearest first, so arriving never hitches long.
      let next: Settlement | null = null, nd = Infinity;
      for (const s of SETTLEMENTS) {
        if (s.tier === 'home') continue;
        const d = Math.hypot(s.x - focus.x, s.z - focus.z) - s.r;
        const on = this.built.has(s.id);
        if (on && d > SHOW[s.tier] + HIDE_PAD) this.drop(s.id);
        else if (!on && d < SHOW[s.tier] && d < nd) {
          nd = d;
          next = s;
        }
      }
      if (next) this.build(next);
    }
    const dx = focus.x - this.last.x, dz = focus.z - this.last.z;
    if (dx * dx + dz * dz < 25) return;
    this.last.copy(focus);
    const near2 = (LOD_NEAR * this.lodScale) ** 2;
    for (const b of this.built.values()) {
      for (const [list, mesh] of [[b.solid, this.solid], [b.glow, this.glow]] as const) {
        for (const it of list) {
          if (it.hi === it.lo) continue;
          const ex = it.x - focus.x, ez = it.z - focus.z;
          const near = ex * ex + ez * ez < near2;
          if (near !== it.isHi) {
            it.isHi = near;
            mesh.setGeometryIdAt(it.id, near ? it.hi : it.lo);
          }
        }
      }
    }
  }

  private addInstance(mesh: THREE.BatchedMesh, free: number[], geo: number, p: Placement, y: number): number {
    const reuse = free.pop();
    const id = reuse ?? mesh.addInstance(geo);
    if (reuse !== undefined) {
      mesh.setGeometryIdAt(id, geo);
      mesh.setVisibleAt(id, true);
    }
    this.q.setFromAxisAngle(this.up, p.yaw);
    this.m.compose(new THREE.Vector3(p.x, y, p.z), this.q, new THREE.Vector3(1, 1, 1));
    mesh.setMatrixAt(id, this.m);
    return id;
  }

  private build(s: Settlement): void {
    const layout = layoutSettlement(s);
    const b: Built = { s, layout, solid: [], glow: [], lamps: [], services: [] };
    const colliders: Collider[] = [];
    for (const p of layout.placements) {
      const model = this.models.get(p.asset);
      const meta = assetMeta(p.asset);
      if (!model || !meta) continue;
      if (this.solid.instanceCount >= this.solid.maxInstanceCount - 2 && !this.freeSolid.length) break;
      const y = this.heightAt(p.x, p.z);
      const hi = this.geoIds.get(model.hi)!, lo = this.geoIds.get(model.lo)!;
      b.solid.push({ id: this.addInstance(this.solid, this.freeSolid, lo, p, y), hi, lo, x: p.x, z: p.z, isHi: false });
      if (model.glowHi) {
        const ghi = this.glowIds.get(model.glowHi)!, glo = model.glowLo ? this.glowIds.get(model.glowLo)! : ghi;
        b.glow.push({ id: this.addInstance(this.glow, this.freeGlow, glo, p, y), hi: ghi, lo: glo, x: p.x, z: p.z, isHi: false });
      }
      for (const c of meta.colliders) {
        const [wx, wz] = toWorld(p, c.x, -c.y);
        if ('r' in c) colliders.push({ kind: 'circle', x: wx, z: wz, r: c.r, maxY: y + c.top });
        else colliders.push({ kind: 'obox', x: wx, z: wz, hw: c.hw, hd: c.hd, yaw: p.yaw + c.yaw, maxY: y + c.top });
      }
      for (const l of meta.lamps) {
        const [wx, wz] = toWorld(p, l[0], -l[1]);
        b.lamps.push({ p: new THREE.Vector3(wx, y + l[2], wz), fire: p.asset === 'campfire' });
      }
      if (p.role === 'pokecenter' || p.role === 'mart' || p.role === 'inn' || p.role === 'gym' || p.role === 'tower' || p.role === 'league' || p.role === 'board' || p.role === 'stall') {
        const door = meta.doors.find((d) => d.kind !== 'door') ?? meta.doors[0];
        const [dx, dz] = door ? toWorld(p, door.x, -door.y) : toWorld(p, 0, 1.5);
        const anchors: Record<string, THREE.Vector3> = {};
        for (const [k, v] of Object.entries(meta.anchors)) {
          const [ax, az] = toWorld(p, v[0], -v[1]);
          anchors[k] = new THREE.Vector3(ax, y + v[2], az);
        }
        b.services.push({ settlement: s, role: p.role, asset: p.asset, x: dx, y, z: dz, yaw: p.yaw, anchors });
      }
    }
    this.dyn.addGroup(groupId(s), colliders);
    this.lamps.addLamps(b.lamps);
    this.built.set(s.id, b);
    this.last.set(1e9, 0, 1e9);
    for (const l of this.listeners) l.build(b);
  }

  private drop(id: string): void {
    const b = this.built.get(id);
    if (!b) return;
    for (const it of b.solid) {
      this.solid.setVisibleAt(it.id, false);
      this.freeSolid.push(it.id);
    }
    for (const it of b.glow) {
      this.glow.setVisibleAt(it.id, false);
      this.freeGlow.push(it.id);
    }
    this.dyn.removeGroup(groupId(b.s));
    this.lamps.removeLamps(b.lamps);
    this.built.delete(id);
    for (const l of this.listeners) l.drop(b);
  }

  /** The service point nearest (x, z) within `r`, if any. */
  serviceNear(x: number, z: number, r: number): ServicePoint | null {
    let best: ServicePoint | null = null, bd = r;
    for (const b of this.built.values()) {
      if (Math.hypot(b.s.x - x, b.s.z - z) > b.s.r + r) continue;
      for (const sp of b.services) {
        const d = Math.hypot(sp.x - x, sp.z - z);
        if (d < bd) {
          bd = d;
          best = sp;
        }
      }
    }
    return best;
  }

  /** Every service point of built settlements (for markers). */
  *services(): Iterable<ServicePoint> {
    for (const b of this.built.values()) yield* b.services;
  }
}

/** Dynamic collider group ids for settlements, clear of the terrain chunks' keys. */
function groupId(s: Settlement): number {
  return 10_000_000 + SETTLEMENTS.indexOf(s);
}

export type { Built as BuiltSettlement };
