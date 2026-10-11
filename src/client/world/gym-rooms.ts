import * as THREE from 'three';
import type { TypeName } from '../../shared/battle/types';
import { blockers, HALF_W, interiorAt, LENGTH, safeTile, watchedLanes, type GymInterior, type GymState, type Rect } from '../../shared/gym-interior';
import type { DynamicColliders } from '../core/collision';
import type { Collider } from './types';

/**
 * The gyms' interiors (DESIGN §13), drawn and made solid for whichever gym the player is in.
 * The layout and the puzzle rules live in shared/gym-interior; this file turns them into walls,
 * sliding doors, energy gates, glowing plates, hazard bands and glass tiles, and keeps the
 * colliders in step with which gates are open.
 */

export interface GymTheme {
  floor: string;
  wall: string;
  /** Wainscot, pilasters and beams. */
  trim: string;
  accent: string;
  /** The floor's pattern. */
  pattern: 'square' | 'hex' | 'plank' | 'diamond';
  hazard: string;
  /** What the hazard is called ("lava"). */
  hazardName: string;
  /** Glowing hazards (lava, live floor) light themselves. */
  hazardGlow: boolean;
}

export const GYM_THEMES: Record<string, GymTheme> = {
  bug: { floor: '#6a5236', wall: '#e2d4ae', trim: '#7a5a32', accent: '#f0b830', pattern: 'hex', hazard: '#a86a14', hazardName: 'sticky resin', hazardGlow: false },
  water: { floor: '#3a6478', wall: '#dde8ee', trim: '#2f5f7a', accent: '#4fc3f7', pattern: 'diamond', hazard: '#123a66', hazardName: 'deep water', hazardGlow: false },
  fire: { floor: '#423a36', wall: '#7a5448', trim: '#2e2420', accent: '#ff7a2a', pattern: 'square', hazard: '#ff4a10', hazardName: 'lava', hazardGlow: true },
  electric: { floor: '#3e4650', wall: '#cfd3d8', trim: '#4a5664', accent: '#ffd84a', pattern: 'square', hazard: '#d8c020', hazardName: 'live floor', hazardGlow: true },
  ground: { floor: '#9a7a52', wall: '#d2b488', trim: '#7a5a3a', accent: '#e0603f', pattern: 'plank', hazard: '#8a6a3a', hazardName: 'quicksand', hazardGlow: false },
  ice: { floor: '#cfe6f2', wall: '#f0f7fb', trim: '#8ab4d8', accent: '#3d8fe4', pattern: 'diamond', hazard: '#1a4a7a', hazardName: 'thin ice', hazardGlow: false },
  psychic: { floor: '#3e3450', wall: '#ddd2e8', trim: '#6a4a8a', accent: '#e070f0', pattern: 'diamond', hazard: '#120a20', hazardName: 'void', hazardGlow: false },
  ghost: { floor: '#2a2a34', wall: '#56525e', trim: '#2a2830', accent: '#a080ff', pattern: 'plank', hazard: '#05050a', hazardName: 'dark pit', hazardGlow: false },
  fairy: { floor: '#efdfe8', wall: '#fff7f2', trim: '#9ccc8a', accent: '#ff8ac8', pattern: 'hex', hazard: '#3a5a2a', hazardName: 'thorns', hazardGlow: false },
  steel: { floor: '#4e5058', wall: '#9a9ea6', trim: '#34363c', accent: '#ff9a2a', pattern: 'square', hazard: '#ff6a20', hazardName: 'molten slag', hazardGlow: true },
};

const WALL_H = 9;
const DOOR_H = 3.4;
const COLLIDER_GROUP = 9_000_000;

/** A white floor pattern, tinted by the material's colour. */
function tileTexture(pattern: GymTheme['pattern']): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  const S = 256;
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  // Gentle mottling so big floors don't look printed.
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(0,0,0,${0.015 + Math.random() * 0.03})`;
    const r = 4 + Math.random() * 18;
    g.beginPath();
    g.arc(Math.random() * S, Math.random() * S, r, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = 'rgba(0,0,0,0.22)';
  g.lineWidth = 3;
  if (pattern === 'hex') {
    const r = S / 6;
    const h = Math.sqrt(3) * r;
    for (let row = -1; row < 5; row++) {
      for (let col = -1; col < 5; col++) {
        const cx = col * 1.5 * r;
        const cy = row * h + (col % 2 ? h / 2 : 0);
        g.beginPath();
        for (let k = 0; k <= 6; k++) g.lineTo(cx + r * Math.cos((k * Math.PI) / 3), cy + r * Math.sin((k * Math.PI) / 3));
        g.stroke();
      }
    }
  } else if (pattern === 'plank') {
    for (let y = 0; y < S; y += S / 4) {
      g.strokeRect(0, y, S, S / 4);
      const off = (y / (S / 4)) % 2 ? S / 2 : S / 4;
      g.beginPath();
      g.moveTo(off, y);
      g.lineTo(off, y + S / 4);
      g.stroke();
    }
  } else if (pattern === 'diamond') {
    g.strokeRect(1.5, 1.5, S - 3, S - 3);
    g.beginPath();
    g.moveTo(S / 2, 0); g.lineTo(S, S / 2); g.lineTo(S / 2, S); g.lineTo(0, S / 2); g.closePath();
    g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.06)';
    g.fill();
  } else {
    g.strokeRect(1.5, 1.5, S - 3, S - 3);
    g.strokeRect(S / 2, 0, S / 2, S / 2);
    g.strokeRect(0, S / 2, S / 2, S / 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Built {
  it: GymInterior;
  root: THREE.Group;
  doors: Map<string, { mesh: THREE.Mesh; open: number }>;
  gates: Map<string, { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; open: number }>;
  plates: Map<string, THREE.MeshStandardMaterial>;
  /** Hazard bands: [chamber index] -> the two halves' bridges (x < 0, x >= 0). */
  bridges: Map<number, [THREE.Mesh, THREE.Mesh]>;
  /** Glowing hazards, which pulse. */
  hazards: THREE.MeshStandardMaterial[];
  /** Mirror tiles: key `${chamber}:${lane}:${row}:${col}`. */
  tiles: Map<string, THREE.Mesh>;
  tileMats: { plain: THREE.MeshStandardMaterial; lit: THREE.MeshStandardMaterial; hint: THREE.MeshStandardMaterial };
  colliderKey: string;
}

export class GymRooms {
  readonly group = new THREE.Group();
  private built: Built | null = null;
  private time = 0;

  /** Floors: inside a gym's footprint the ground is its floor. */
  readonly walk = {
    test: (x: number, z: number): number => (interiorAt(x, z) ? this.floorY(x, z) : -Infinity),
  };

  constructor(private dynamic: DynamicColliders) {
    this.group.name = 'gym-rooms';
  }

  private floorY(x: number, z: number): number {
    return interiorAt(x, z)!.interior.floorY;
  }

  get active(): GymInterior | null {
    return this.built?.it ?? null;
  }

  /** Build (or drop) the interior the player is in. */
  setActive(it: GymInterior | null): void {
    if (this.built?.it === it) return;
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
    if (it) this.built = this.build(it);
  }

  /** Bring doors, gates, plates, bridges and tiles in line with the puzzle state. */
  sync(state: GymState, local: { x: number; z: number }, hints: boolean, dt: number): void {
    const b = this.built;
    if (!b) return;
    this.time += dt;
    const it = b.it;
    // Colliders: walls plus every closed gate.
    const key = [...state.open].sort().join(',');
    if (key !== b.colliderKey) {
      b.colliderKey = key;
      const list: Collider[] = blockers(it, state).map((rc) => ({ kind: 'box', minX: it.ox + rc.x0, maxX: it.ox + rc.x1, minZ: it.oz + rc.z0, maxZ: it.oz + rc.z1 }));
      this.dynamic.addGroup(COLLIDER_GROUP, list);
    }
    const ease = Math.min(1, dt * 3);
    for (const [id, d] of b.doors) {
      d.open += ((state.open.has(id) ? 1 : 0) - d.open) * ease;
      d.mesh.position.y = it.floorY + DOOR_H / 2 + d.open * (DOOR_H - 0.2);
    }
    for (const [id, g] of b.gates) {
      g.open += ((state.open.has(id) ? 1 : 0) - g.open) * Math.min(1, dt * 6);
      g.mat.opacity = 0.55 * (1 - g.open) + 0.04;
      g.mesh.scale.y = Math.max(0.02, 1 - g.open);
      g.mesh.position.y = it.floorY + (DOOR_H * g.mesh.scale.y) / 2;
      g.mat.emissiveIntensity = 0.8 + Math.sin(this.time * 6) * 0.2;
    }
    for (const [id, m] of b.plates) m.emissiveIntensity = state.pressed.has(id) ? 1.6 : 0.15;
    for (const m of b.hazards) m.emissiveIntensity = 1 + Math.sin(this.time * 2.1) * 0.25 + Math.sin(this.time * 5.3) * 0.08;
    for (const [ci, [neg, pos]] of b.bridges) {
      neg.visible = state.pressed.has(`c${ci}-far`);
      pos.visible = state.pressed.has(`c${ci}-near`);
    }
    // Mirror tiles light up for whoever watches their lane (and, with the Echo, for the walker).
    const watched = new Set(watchedLanes(it, local.x, local.z).map((w) => `${w.chamber.index}:${w.lane}`));
    for (const [k, mesh] of b.tiles) {
      const [ci, lane, row, col] = k.split(':').map(Number);
      const c = it.chambers[ci];
      const safe = safeTile(c, lane as 0 | 1, row, col);
      const lit = safe && watched.has(`${ci}:${lane}`);
      const hint = safe && hints && state.pressed.has(`c${ci}-watch-${lane === 0 ? 'a' : 'b'}`);
      mesh.material = lit ? b.tileMats.lit : hint ? b.tileMats.hint : b.tileMats.plain;
    }
  }

  private build(it: GymInterior): Built {
    const theme = GYM_THEMES[it.gym.type as TypeName] ?? GYM_THEMES.bug;
    const root = new THREE.Group();
    root.position.set(it.ox, 0, it.oz);
    const y0 = it.floorY;
    const std = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
    const box = (rc: Rect, yb: number, h: number, mat: THREE.Material): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.05, rc.x1 - rc.x0), h, Math.max(0.05, rc.z1 - rc.z0)), mat);
      m.position.set((rc.x0 + rc.x1) / 2, yb + h / 2, (rc.z0 + rc.z1) / 2);
      root.add(m);
      return m;
    };
    // Floor, tiled.
    const tex = tileTexture(theme.pattern);
    if (tex) tex.repeat.set((HALF_W * 2) / 4, LENGTH / 4);
    const floor = box({ x0: -HALF_W - 0.6, x1: HALF_W + 0.6, z0: -0.6, z1: LENGTH + 0.6 }, y0 - 0.5, 0.5, std(theme.floor, { map: tex ?? undefined }));
    floor.receiveShadow = true;
    // Walls: plaster over a darker wainscot, with a cornice.
    const wallMat = std(theme.wall, { roughness: 0.9 });
    const trimMat = std(theme.trim, { roughness: 0.7 });
    const WAIN = 1.3;
    for (const rc of it.walls) {
      box(rc, y0, WAIN, trimMat);
      box(rc, y0 + WAIN, WALL_H - WAIN, wallMat);
    }
    // A thin lip on the wainscot and a cornice at the top, on both long walls.
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? -HALF_W : HALF_W - 0.12;
      box({ x0, x1: x0 + 0.12, z0: 0, z1: LENGTH }, y0 + WAIN, 0.1, std(theme.accent, { emissive: theme.accent, emissiveIntensity: 0.2 }));
      box({ x0: side < 0 ? -HALF_W : HALF_W - 0.3, x1: side < 0 ? -HALF_W + 0.3 : HALF_W, z0: 0, z1: LENGTH }, y0 + WALL_H - 0.45, 0.45, trimMat);
      // Pilasters every six metres.
      for (let z = 3; z < LENGTH; z += 6) box({ x0: side < 0 ? -HALF_W : HALF_W - 0.45, x1: side < 0 ? -HALF_W + 0.45 : HALF_W, z0: z - 0.4, z1: z + 0.4 }, y0, WALL_H, trimMat);
    }
    // Ceiling, beams across it, and light panels between the beams.
    box({ x0: -HALF_W - 0.6, x1: HALF_W + 0.6, z0: -0.6, z1: LENGTH + 0.6 }, y0 + WALL_H, 0.4, std(new THREE.Color(theme.wall).multiplyScalar(0.8).getStyle(), { roughness: 1 }));
    for (let z = 3; z < LENGTH; z += 6) box({ x0: -HALF_W, x1: HALF_W, z0: z - 0.18, z1: z + 0.18 }, y0 + WALL_H - 0.35, 0.35, trimMat);
    const panel = std('#ffffff', { emissive: '#fff4dc', emissiveIntensity: 0.9 });
    for (let z = 6; z < LENGTH; z += 12) box({ x0: -4, x1: 4, z0: z - 1, z1: z + 1 }, y0 + WALL_H - 0.08, 0.06, panel);
    // Lintels over the doorways.
    for (const d of it.doors) box({ ...d.rect, z0: d.rect.z0 - 0.05, z1: d.rect.z1 + 0.05 }, y0 + DOOR_H, WALL_H - DOOR_H, wallMat);
    for (const d of it.doors) box({ x0: d.rect.x0 - 0.3, x1: d.rect.x1 + 0.3, z0: d.rect.z0 - 0.15, z1: d.rect.z1 + 0.15 }, y0 + DOOR_H, 0.3, std(theme.accent, { emissive: theme.accent, emissiveIntensity: 0.5 }));

    const doors = new Map<string, { mesh: THREE.Mesh; open: number }>();
    for (const d of it.doors) doors.set(d.id, { mesh: box(d.rect, y0, DOOR_H, std(theme.accent, { metalness: 0.4, roughness: 0.4 })), open: 0 });

    const gates = new Map<string, { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; open: number }>();
    const plates = new Map<string, THREE.MeshStandardMaterial>();
    const bridges = new Map<number, [THREE.Mesh, THREE.Mesh]>();
    const hazards: THREE.MeshStandardMaterial[] = [];
    const tiles = new Map<string, THREE.Mesh>();
    const tileMats = {
      plain: std('#9aa8b8', { transparent: true, opacity: 0.55, roughness: 0.15, metalness: 0.2 }),
      lit: std('#ffffff', { emissive: theme.accent, emissiveIntensity: 1.4 }),
      hint: std('#e8f2ff', { emissive: theme.accent, emissiveIntensity: 0.7 }),
    };
    for (const c of it.chambers) {
      for (const g of c.gates) {
        const mat = std(theme.accent, { emissive: theme.accent, emissiveIntensity: 1, transparent: true, opacity: 0.55, depthWrite: false });
        gates.set(g.id, { mesh: box(g.rect, y0, DOOR_H, mat), mat, open: 0 });
      }
      for (const p of c.plates) {
        const mat = std(theme.accent, { emissive: theme.accent, emissiveIntensity: 0.15, metalness: 0.5, roughness: 0.3 });
        const m = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r * 1.05, 0.12, 28), mat);
        m.position.set(p.x, y0 + 0.06, p.z);
        root.add(m);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(p.r + 0.12, 0.06, 6, 32), std(theme.wall));
        rim.rotation.x = Math.PI / 2;
        rim.position.set(p.x, y0 + 0.05, p.z);
        root.add(rim);
        plates.set(p.id, mat);
      }
      if (c.band) {
        const glow = theme.hazardGlow ? { emissive: theme.hazard, emissiveIntensity: 1.1 } : {};
        const hz = std(theme.hazard, { roughness: 0.3, ...glow });
        box({ ...c.band }, y0 - 0.02, 0.05, hz);
        if (theme.hazardGlow) hazards.push(hz);
        // Bridges that appear over each half while its plate is held.
        const plank = std('#c8b088', { emissive: theme.accent, emissiveIntensity: 0.2 });
        const neg = box({ ...c.band, x1: -0.1 }, y0, 0.08, plank);
        const pos = box({ ...c.band, x0: 0.1 }, y0, 0.08, plank);
        neg.visible = pos.visible = false;
        bridges.set(c.index, [neg, pos]);
      }
      if (c.tiles) {
        const t = c.tiles;
        // The drop under the tiles.
        for (const lane of t.lanes) box(lane, y0 - 0.02, 0.04, std('#05060a'));
        t.lanes.forEach((lane, li) => {
          for (let row = 0; row < t.rows; row++) {
            for (let col = 0; col < t.cols; col++) {
              const x0 = lane.x0 + col * t.size;
              const z0 = t.z0 + row * t.size;
              const m = box({ x0: x0 + 0.08, x1: Math.min(lane.x1, x0 + t.size) - 0.08, z0: z0 + 0.08, z1: z0 + t.size - 0.08 }, y0, 0.06, tileMats.plain);
              tiles.set(`${c.index}:${li}:${row}:${col}`, m);
            }
          }
        });
      }
    }
    // Glass walls between mirror lanes.
    for (const rc of it.glass) box(rc, y0, WALL_H, std('#bfe6ff', { transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.1, depthWrite: false }));

    // Foyer: the exit pad and the scout board.
    box({ x0: it.exit.x - 1.6, x1: it.exit.x + 1.6, z0: it.exit.z - 1, z1: it.exit.z + 1 }, y0, 0.05, std('#ffffff', { emissive: '#7fd8ff', emissiveIntensity: 0.9 }));
    box({ x0: -9.5, x1: -6.5, z0: 9.6, z1: 9.9 }, y0 + 0.6, 1.8, std('#5a4632'));
    box({ x0: -9.2, x1: -6.8, z0: 9.55, z1: 9.6 }, y0 + 0.8, 1.4, std('#efe6cf'));
    // Hall: two daises where the gym trainers stand.
    for (const t of it.hall.trainers) box({ x0: t.x - 1.2, x1: t.x + 1.2, z0: t.z - 1.2, z1: t.z + 1.2 }, y0, 0.15, std(theme.wall));
    // Rest stop: the healing machine.
    const h = it.ante.heal;
    box({ x0: h.x - 1, x1: h.x + 1, z0: h.z - 0.6, z1: h.z + 0.6 }, y0, 1.1, std('#e8e8ec'));
    box({ x0: h.x - 0.9, x1: h.x + 0.9, z0: h.z - 0.5, z1: h.z + 0.5 }, y0 + 1.1, 0.12, std('#ff5a6a', { emissive: '#ff3a4a', emissiveIntensity: 0.8 }));
    // Arena: the ring and the leader's dais.
    const ring = new THREE.Mesh(new THREE.RingGeometry(8.6, 9, 64), std(theme.accent, { emissive: theme.accent, emissiveIntensity: 0.8, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, y0 + 0.02, (it.arena.z0 + it.arena.z1) / 2);
    root.add(ring);
    const l = it.arena.leader;
    box({ x0: l.x - 2.2, x1: l.x + 2.2, z0: l.z - 1.6, z1: l.z + 2.4 }, y0, 0.3, std(theme.wall));
    // Banners in the gym's colour.
    for (const x of [-HALF_W + 0.05, HALF_W - 0.35]) for (const z of [it.arena.z0 + 8, it.arena.z1 - 8]) box({ x0: x, x1: x + 0.3, z0: z - 1.2, z1: z + 1.2 }, y0 + 2, 4, std(theme.accent, { emissive: theme.accent, emissiveIntensity: 0.3 }));

    // Planters in the foyer and the arena's corners, and pillars flanking the arena.
    const pot = std(theme.trim);
    const leaf = std('#4f8a3a', { roughness: 0.9 });
    const plant = (x: number, z: number) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.45, 0.8, 12), pot);
      p.position.set(x, y0 + 0.4, z);
      root.add(p);
      for (let k = 0; k < 3; k++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55 - k * 0.1, 0), leaf);
        b.position.set(x + (k - 1) * 0.15, y0 + 1.05 + k * 0.35, z + (k % 2) * 0.1);
        root.add(b);
      }
    };
    for (const [x, z] of [[-15.5, 2.5], [15.5, 2.5], [-15.5, 12], [15.5, 12], [-15.5, it.arena.z1 - 2.5], [15.5, it.arena.z1 - 2.5]]) plant(x, z);
    for (const x of [-6, 6]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, WALL_H, 16), trimMat);
      col.position.set(x, y0 + WALL_H / 2, it.arena.z0 + 2);
      root.add(col);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), std(theme.accent, { emissive: theme.accent, emissiveIntensity: 2 }));
      flame.position.set(x, y0 + 3.2, it.arena.z0 + 2 - 0.75);
      root.add(flame);
    }

    // Light: a soft fill plus warm lamps down the length.
    root.add(new THREE.HemisphereLight('#fffaf0', theme.floor, 1.05));
    for (const z of [8, 30, 56, 79, 102, 121, 141]) {
      const lamp = new THREE.PointLight('#fff1d6', 45, 36, 1.3);
      lamp.position.set(0, y0 + WALL_H - 1.2, z);
      root.add(lamp);
    }
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = false;
        if (o !== floor) o.receiveShadow = false;
      }
    });
    this.group.add(root);
    return { it, root, doors, gates, plates, bridges, hazards, tiles, tileMats, colliderKey: '-' };
  }
}
