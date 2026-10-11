import * as THREE from 'three';
import type { DynamicColliders } from '../../core/collision';
import type { Collider } from '../types';
import { VegBatch, getVegKit, type TreeKind } from '../vegetation';
import type { ResourceField } from '../resources';
import type { ChunkEntry, TerrainStreamer } from './streamer';
import { BUSH_STRIDE, OUTER_TREE_KINDS, OUTER_TREE_RADIUS, ROCK_STRIDE, TREE_STRIDE, type OuterTreeKind } from './scatter';

/**
 * Trees, bushes and rocks for the streamed land beyond the vale. Each level-0 chunk's scatter
 * (built in a worker) becomes instances in three shared batches, colliders in a dynamic layer
 * and gatherable resource nodes; all of it goes again when the chunk streams out.
 */
export class OuterVegetation {
  readonly group = new THREE.Group();
  readonly batches: VegBatch[];
  private readonly trees: VegBatch;
  private readonly bushes: VegBatch;
  private readonly rocks: VegBatch;
  private readonly owned = new Map<number, { trees: number[]; bushes: number[]; rocks: number[]; nodes: string[] }>();
  private readonly treeModels: Record<OuterTreeKind, TreeKind>;
  private readonly col = new THREE.Color();

  constructor(streamer: TerrainStreamer, private readonly dyn: DynamicColliders, private readonly resources: ResourceField | undefined, extraKinds: Partial<Record<OuterTreeKind, TreeKind>> = {}) {
    this.group.name = 'outer-vegetation';
    const kit = getVegKit();
    const k = kit.kinds;
    // Kinds without a model of their own yet borrow the closest existing one.
    this.treeModels = {
      round: k.round, tall: k.tall, wide: k.wide, pine: k.pine,
      snowpine: extraKinds.snowpine ?? k.pine,
      giant: extraKinds.giant ?? k.wide,
      dead: extraKinds.dead ?? k.tall,
      birch: extraKinds.birch ?? k.tall,
      willow: extraKinds.willow ?? k.round,
      cactus: extraKinds.cactus ?? k.pine,
    };
    const treeGeos = [...new Set(Object.values(this.treeModels).flatMap((m) => [m.hi, m.lo]))];
    this.trees = new VegBatch(treeGeos, 26000, kit.foliage, 85, 'outer-trees');
    this.trees.mesh.castShadow = true;
    this.trees.mesh.customDepthMaterial = kit.depth;
    this.bushes = new VegBatch([kit.bushHi, kit.bushLo], 16000, kit.foliage, 60, 'outer-bushes');
    this.bushes.mesh.castShadow = true;
    this.bushes.mesh.customDepthMaterial = kit.depth;
    this.rocks = new VegBatch([...kit.rockGeos, ...kit.rockLo], 12000, kit.rockMat, 110, 'outer-rocks');
    this.rocks.mesh.castShadow = true;
    this.batches = [this.trees, this.bushes, this.rocks];
    this.group.add(this.trees.mesh, this.bushes.mesh, this.rocks.mesh);
    streamer.chunkListeners.push({ add: (e) => this.add(e), drop: (e) => this.drop(e) });
  }

  private add(e: ChunkEntry): void {
    const s = e.scatter;
    if (!s || this.owned.has(e.key)) return;
    const kit = getVegKit();
    const own = { trees: [] as number[], bushes: [] as number[], rocks: [] as number[], nodes: [] as string[] };
    const colliders: Collider[] = [];
    const prefix = `o${e.ci},${e.cj}:`;
    const t = s.trees;
    if (this.trees.hasRoom(t.length / TREE_STRIDE)) {
      for (let i = 0; i < t.length; i += TREE_STRIDE) {
        const kind = OUTER_TREE_KINDS[t[i + 9]];
        const m = this.treeModels[kind];
        this.col.setRGB(t[i + 6], t[i + 7], t[i + 8]);
        own.trees.push(this.trees.add(m.hi, m.lo, t[i], t[i + 1], t[i + 2], t[i + 3], t[i + 4], t[i + 5], this.col));
        const r = OUTER_TREE_RADIUS[kind] * t[i + 4];
        colliders.push({ kind: 'circle', x: t[i], z: t[i + 2], r });
        if (this.resources && kind !== 'cactus') {
          const key = `${prefix}tree:${i / TREE_STRIDE}`;
          this.resources.addNode({ key, kind: 'tree', x: t[i], y: t[i + 1], z: t[i + 2], r });
          own.nodes.push(key);
        }
      }
    }
    const b = s.bushes;
    if (this.bushes.hasRoom(b.length / BUSH_STRIDE)) {
      for (let i = 0; i < b.length; i += BUSH_STRIDE) {
        this.col.setRGB(b[i + 6], b[i + 7], b[i + 8]);
        own.bushes.push(this.bushes.add(kit.bushHi, kit.bushLo, b[i], b[i + 1], b[i + 2], b[i + 3], b[i + 4], b[i + 5], this.col));
        if (this.resources) {
          const key = `${prefix}bush:${i / BUSH_STRIDE}`;
          this.resources.addNode({ key, kind: 'bush', x: b[i], y: b[i + 1], z: b[i + 2], r: b[i + 4] });
          own.nodes.push(key);
        }
      }
    }
    const r = s.rocks;
    if (this.rocks.hasRoom(r.length / ROCK_STRIDE)) {
      for (let i = 0; i < r.length; i += ROCK_STRIDE) {
        const k = r[i + 9];
        this.col.setRGB(r[i + 6], r[i + 7], r[i + 8]);
        const id = this.rocks.add(kit.rockGeos[k], kit.rockLo[k], r[i], r[i + 1], r[i + 2], r[i + 3], r[i + 4], r[i + 5], this.col);
        own.rocks.push(id);
        const top = r[i + 10];
        if (top >= 0) {
          const cr = r[i + 11];
          const climb = top - (r[i + 1] + r[i + 4] * 0.2) > 0.7;
          colliders.push({ kind: 'circle', x: r[i], z: r[i + 2], r: cr, ...(climb ? { maxY: top, climb: true, dome: r[i + 12] } : {}) });
          if (this.resources) {
            const key = `${prefix}boulder:${i / ROCK_STRIDE}`;
            this.resources.addNode({ key, kind: 'boulder', x: r[i], y: top, z: r[i + 2], r: cr });
            own.nodes.push(key);
          }
        } else if (this.resources && r[i + 4] >= 0.3 && r[i + 4] <= 0.9) {
          const key = `${prefix}stones:${i / ROCK_STRIDE}`;
          this.resources.addNode({ key, kind: 'stones', x: r[i], y: r[i + 1] + r[i + 5] * 0.3, z: r[i + 2], r: r[i + 4] * 0.8 }, (empty) => this.rocks.setVisible(id, !empty));
          own.nodes.push(key);
        }
      }
    }
    this.owned.set(e.key, own);
    this.dyn.addGroup(e.key, colliders);
  }

  private drop(e: ChunkEntry): void {
    const own = this.owned.get(e.key);
    if (!own) return;
    for (const id of own.trees) this.trees.remove(id);
    for (const id of own.bushes) this.bushes.remove(id);
    for (const id of own.rocks) this.rocks.remove(id);
    if (this.resources) for (const k of own.nodes) this.resources.removeNode(k);
    this.dyn.removeGroup(e.key);
    this.owned.delete(e.key);
  }

  update(focus: THREE.Vector3): void {
    for (const b of this.batches) b.update(focus);
  }

  setLodScale(s: number): void {
    for (const b of this.batches) b.setLodScale(s);
  }
}
