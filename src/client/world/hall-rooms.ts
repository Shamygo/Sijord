import * as THREE from 'three';
import type { Rect } from '../../shared/gym-interior';
import { hallAt, hallBlockers, type HallInterior, type HallProp } from '../../shared/halls';
import type { DynamicColliders } from '../core/collision';
import { tileTexture } from './gym-rooms';
import type { Collider } from './types';

/**
 * The Battle Tower's and the League's interiors, drawn and made solid for whichever one the player
 * is in, in the same plaster-and-trim style as the gyms (gym-rooms.ts). The layout lives in
 * shared/halls; this turns it into rooms, doors that lift as they open, and the halls' furniture.
 */

const WALL_H = 10;
const DOOR_H = 3.4;
const COLLIDER_GROUP = 9_100_000;

interface Built {
  h: HallInterior;
  root: THREE.Group;
  doors: Map<string, { mesh: THREE.Mesh; open: number }>;
  glow: THREE.MeshStandardMaterial[];
  colliderKey: string;
}

export class HallRooms {
  readonly group = new THREE.Group();
  private built: Built | null = null;
  private time = 0;

  readonly walk = {
    test: (x: number, z: number): number => hallAt(x, z)?.hall.floorY ?? -Infinity,
  };

  constructor(private dynamic: DynamicColliders) {
    this.group.name = 'hall-rooms';
  }

  get active(): HallInterior | null {
    return this.built?.h ?? null;
  }

  setActive(h: HallInterior | null): void {
    if (this.built?.h === h) return;
    if (this.built) {
      this.group.remove(this.built.root);
      this.built.root.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const m = o.material as THREE.Material | THREE.Material[];
          (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
        }
      });
      this.dynamic.removeGroup(COLLIDER_GROUP);
      this.built = null;
    }
    if (h) this.built = this.build(h);
  }

  /** Doors open or shut, and colliders in step with them. */
  sync(open: ReadonlySet<string>, dt: number): void {
    const b = this.built;
    if (!b) return;
    this.time += dt;
    const key = [...open].sort().join(',');
    if (key !== b.colliderKey) {
      b.colliderKey = key;
      const h = b.h;
      const list: Collider[] = hallBlockers(h, open).map((rc) => ({ kind: 'box', minX: h.ox + rc.x0, maxX: h.ox + rc.x1, minZ: h.oz + rc.z0, maxZ: h.oz + rc.z1 }));
      this.dynamic.addGroup(COLLIDER_GROUP, list);
    }
    const ease = Math.min(1, dt * 3);
    for (const [id, d] of b.doors) {
      d.open += ((open.has(id) ? 1 : 0) - d.open) * ease;
      d.mesh.position.y = b.h.floorY + DOOR_H / 2 + d.open * (DOOR_H - 0.2);
    }
    for (const m of b.glow) m.emissiveIntensity = 0.8 + Math.sin(this.time * 2) * 0.2;
  }

  private build(h: HallInterior): Built {
    const root = new THREE.Group();
    root.position.set(h.ox, 0, h.oz);
    const y0 = h.floorY;
    const W = h.halfW;
    const std = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
    const box = (rc: Rect, yb: number, height: number, mat: THREE.Material): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.05, rc.x1 - rc.x0), height, Math.max(0.05, rc.z1 - rc.z0)), mat);
      m.position.set((rc.x0 + rc.x1) / 2, yb + height / 2, (rc.z0 + rc.z1) / 2);
      root.add(m);
      return m;
    };
    const glow: THREE.MeshStandardMaterial[] = [];
    let floorMesh: THREE.Mesh | null = null;
    const WAIN = 1.3;
    // Each room: its own floor, walls and ceiling colours.
    for (const rm of h.rooms) {
      const t = rm.theme;
      const len = rm.z1 - rm.z0;
      const tex = tileTexture(t.pattern);
      if (tex) tex.repeat.set((W * 2) / 4, len / 4);
      const fl = box({ x0: -W - 0.6, x1: W + 0.6, z0: rm.z0 - (rm.z0 === 0 ? 0.6 : 0), z1: rm.z1 + 0.3 }, y0 - 0.5, 0.5, std(t.floor, { map: tex ?? undefined, roughness: 0.55 }));
      fl.receiveShadow = true;
      floorMesh ??= fl;
      const wallMat = std(t.wall, { roughness: 0.9 });
      const trimMat = std(t.trim, { roughness: 0.6, metalness: 0.2 });
      const accent = std(t.accent, { emissive: t.accent, emissiveIntensity: 0.35, metalness: 0.5, roughness: 0.35 });
      for (const rc of h.walls) {
        // Only the stretch of wall inside this room, so each room keeps its colours.
        const z0 = Math.max(rc.z0, rm.z0 - 0.3), z1 = Math.min(rc.z1, rm.z1 + 0.3);
        if (z1 <= z0) continue;
        const part = { ...rc, z0, z1 };
        box(part, y0, WAIN, trimMat);
        box(part, y0 + WAIN, WALL_H - WAIN, wallMat);
      }
      for (const side of [-1, 1]) {
        const x0 = side < 0 ? -W : W - 0.12;
        box({ x0, x1: x0 + 0.12, z0: rm.z0, z1: rm.z1 }, y0 + WAIN, 0.1, accent);
        box({ x0: side < 0 ? -W : W - 0.3, x1: side < 0 ? -W + 0.3 : W, z0: rm.z0, z1: rm.z1 }, y0 + WALL_H - 0.45, 0.45, trimMat);
        for (let z = rm.z0 + 3; z < rm.z1 - 1; z += 6) box({ x0: side < 0 ? -W : W - 0.45, x1: side < 0 ? -W + 0.45 : W, z0: z - 0.4, z1: z + 0.4 }, y0, WALL_H, trimMat);
      }
      box({ x0: -W - 0.6, x1: W + 0.6, z0: rm.z0, z1: rm.z1 }, y0 + WALL_H, 0.4, std(new THREE.Color(t.wall).multiplyScalar(0.75).getStyle(), { roughness: 1 }));
      for (let z = rm.z0 + 3; z < rm.z1; z += 6) box({ x0: -W, x1: W, z0: z - 0.18, z1: z + 0.18 }, y0 + WALL_H - 0.35, 0.35, trimMat);
      const panel = std('#ffffff', { emissive: '#fff4dc', emissiveIntensity: 0.9 });
      for (let z = rm.z0 + 6; z < rm.z1; z += 12) box({ x0: -4, x1: 4, z0: z - 1, z1: z + 1 }, y0 + WALL_H - 0.08, 0.06, panel);
      for (let z = rm.z0 + 6; z < rm.z1; z += 14) {
        const lamp = new THREE.PointLight('#fff1d6', 50, 40, 1.3);
        lamp.position.set(0, y0 + WALL_H - 1.2, z);
        root.add(lamp);
      }
      for (const p of h.props.filter((q) => q.z >= rm.z0 && q.z < rm.z1)) this.prop(root, p, y0, t, std, box, glow);
    }
    // Doorways: lintels, and doors that lift.
    const doors = new Map<string, { mesh: THREE.Mesh; open: number }>();
    for (const d of h.doors) {
      const t = h.rooms.find((rm) => d.rect.z0 >= rm.z0 - 1 && d.rect.z0 < rm.z1)?.theme ?? h.rooms[0].theme;
      box({ ...d.rect, z0: d.rect.z0 - 0.05, z1: d.rect.z1 + 0.05 }, y0 + DOOR_H, WALL_H - DOOR_H, std(t.wall, { roughness: 0.9 }));
      box({ x0: d.rect.x0 - 0.3, x1: d.rect.x1 + 0.3, z0: d.rect.z0 - 0.15, z1: d.rect.z1 + 0.15 }, y0 + DOOR_H, 0.3, std(t.accent, { emissive: t.accent, emissiveIntensity: 0.5 }));
      doors.set(d.id, { mesh: box(d.rect, y0, DOOR_H, std(t.trim, { metalness: 0.6, roughness: 0.35 })), open: 0 });
    }
    root.add(new THREE.HemisphereLight('#fffaf0', '#3a4258', 1.05));
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = false;
        if (o !== floorMesh) o.receiveShadow = false;
      }
    });
    this.group.add(root);
    return { h, root, doors, glow, colliderKey: '-' };
  }

  private prop(
    root: THREE.Group, p: HallProp, y0: number, t: HallInterior['rooms'][number]['theme'],
    std: (c: string, e?: Partial<THREE.MeshStandardMaterialParameters>) => THREE.MeshStandardMaterial,
    box: (rc: Rect, yb: number, h: number, m: THREE.Material) => THREE.Mesh,
    glow: THREE.MeshStandardMaterial[],
  ): void {
    const w = p.w ?? 0.5, d = p.d ?? 0.5;
    const rc = { x0: p.x - w, x1: p.x + w, z0: p.z - d, z1: p.z + d };
    const color = p.color ?? t.accent;
    switch (p.kind) {
      case 'pad': {
        const m = std('#ffffff', { emissive: color === t.accent ? '#7fd8ff' : color, emissiveIntensity: 0.9 });
        box(rc, y0, 0.05, m);
        glow.push(m);
        break;
      }
      case 'counter': {
        // A desk: dark wood body, a pale top and a lit strip along its front.
        box(rc, y0, 1.05, std(t.trim, { roughness: 0.5, metalness: 0.2 }));
        box({ x0: rc.x0 - 0.08, x1: rc.x1 + 0.08, z0: rc.z0 - 0.08, z1: rc.z1 + 0.08 }, y0 + 1.05, 0.08, std('#f2efe6', { roughness: 0.3 }));
        const strip = std(color, { emissive: color, emissiveIntensity: 0.8 });
        const front = w > d ? { x0: rc.x0, x1: rc.x1, z0: rc.z0 - 0.04, z1: rc.z0 } : { x0: rc.x1, x1: rc.x1 + 0.04, z0: rc.z0, z1: rc.z1 };
        box(front, y0 + 0.75, 0.08, strip);
        glow.push(strip);
        break;
      }
      case 'board': {
        box({ ...rc, x0: rc.x0 - 0.1 }, y0 + 0.5, 2.4, std('#2a2a30'));
        const screen = std('#0e1830', { emissive: '#3a78d8', emissiveIntensity: 0.7 });
        box({ x0: rc.x0 - 0.16, x1: rc.x0 - 0.1, z0: rc.z0 + 0.15, z1: rc.z1 - 0.15 }, y0 + 0.7, 2, screen);
        glow.push(screen);
        break;
      }
      case 'ring': {
        const ring = new THREE.Mesh(new THREE.RingGeometry(w - 0.4, w, 64), std(color, { emissive: color, emissiveIntensity: 0.8, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(p.x, y0 + 0.02, p.z);
        root.add(ring);
        const line = box({ x0: p.x - w + 0.4, x1: p.x + w - 0.4, z0: p.z - 0.05, z1: p.z + 0.05 }, y0 + 0.005, 0.02, std(color, { emissive: color, emissiveIntensity: 0.6 }));
        line.renderOrder = 1;
        break;
      }
      case 'dais':
        box(rc, y0, 0.3, std(t.wall, { roughness: 0.5 }));
        box({ x0: rc.x0 - 0.1, x1: rc.x1 + 0.1, z0: rc.z0 - 0.1, z1: rc.z1 + 0.1 }, y0, 0.12, std(color, { emissive: color, emissiveIntensity: 0.4 }));
        break;
      case 'banner':
        box({ x0: p.x - 0.15, x1: p.x + 0.15, z0: p.z - 1.3, z1: p.z + 1.3 }, y0 + 2.4, 4.6, std(color, { emissive: color, emissiveIntensity: 0.25 }));
        break;
      case 'pillar': {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, WALL_H, 16), std(t.trim, { metalness: 0.3, roughness: 0.5 }));
        col.position.set(p.x, y0 + WALL_H / 2, p.z);
        root.add(col);
        const lamp = std(color, { emissive: color, emissiveIntensity: 1.6 });
        const flame = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8), lamp);
        flame.position.set(p.x, y0 + 3.2, p.z + (p.z > 30 ? -0.7 : 0.7));
        root.add(flame);
        break;
      }
      case 'plant': {
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.45, 0.8, 12), std(t.trim));
        pot.position.set(p.x, y0 + 0.4, p.z);
        root.add(pot);
        const leaf = std('#4f8a3a', { roughness: 0.9 });
        for (let k = 0; k < 3; k++) {
          const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55 - k * 0.1, 0), leaf);
          b.position.set(p.x + (k - 1) * 0.15, y0 + 1.05 + k * 0.35, p.z + (k % 2) * 0.1);
          root.add(b);
        }
        break;
      }
      case 'heal':
        box(rc, y0, 1.1, std('#e8e8ec'));
        box({ x0: rc.x0 + 0.1, x1: rc.x1 - 0.1, z0: rc.z0 + 0.1, z1: rc.z1 - 0.1 }, y0 + 1.1, 0.12, std('#ff5a6a', { emissive: '#ff3a4a', emissiveIntensity: 0.8 }));
        break;
    }
  }
}
