import * as THREE from 'three';
import type { NodeKind } from '../../shared/gathering';
import { collidersNear, colliderContains } from '../core/collision';
import { makeStoneMaterial } from './materials';
import { mulberry32 } from './noise';
import type { Collider } from './types';
import { makeBushGeometry, makeRockGeometry, makeTreeKinds, type ScatterNodes, type VegBatch } from './vegetation';

/**
 * Everything in Hearthmeadow that can be gathered (DESIGN §6.3): the scattered trees, bushes and
 * stones, plus hand-placed props for the scarcer materials: Oran Berry bushes, Red Apricorn trees
 * and copper veins. Node keys (`kind:index`) are saved, so placement must stay deterministic.
 */
export interface ResourceNode {
  key: string;
  kind: NodeKind;
  x: number;
  y: number;
  z: number;
  /** The node's own radius: reach is measured from its edge. */
  r: number;
}

export interface ResourceContext {
  heightAt(x: number, z: number): number;
  slopeAt(x: number, z: number): number;
  reserved(x: number, z: number, margin: number): boolean;
  waterDist(x: number, z: number): number;
  /** Grass blade weight (0..1); loose stones only count where they show above it. */
  grassAt(x: number, z: number): number;
  /** Thin the grass blades around a point (before the grass is built), so a prop shows. */
  thinGrass?(x: number, z: number, r: number, keep: number): void;
  colliders: Collider[];
  half: number;
  town: { x: number; z: number; r: number };
  mesas: { x: number; z: number; r: number }[];
  scatter: ScatterNodes;
  rocks: VegBatch;
  foliage: THREE.Material;
}

/** How far past a node's edge the trainer can reach it from. */
const REACH = 0.95;
/** Metres of head start the rarer nodes get over common ones in reach, so a berry bush beside a plain bush offers berries. */
const PRIORITY: Partial<Record<NodeKind, number>> = { berry: 0.8, apricorn: 0.8, copper: 0.8, mushroom: 0.8 };
const CELL = 8;
const SHOW_WITHIN = 180;
const counts = { berry: 26, apricorn: 14, copper: 12, mushroom: 40 };

const key = (cx: number, cz: number) => (cx + 32768) * 65536 + (cz + 32768);

export class ResourceField {
  readonly root = new THREE.Group();
  readonly nodes: ResourceNode[] = [];
  private grid = new Map<number, ResourceNode[]>();
  private byKey = new Map<string, ResourceNode>();
  private empty = new Set<string>();
  private visuals = new Map<string, (empty: boolean) => void>();
  private props: THREE.Object3D[] = [];

  constructor(ctx: ResourceContext) {
    this.root.name = 'resources';
    const inTown = (x: number, z: number) => Math.hypot(x - ctx.town.x, z - ctx.town.z) < ctx.town.r;
    ctx.scatter.trees.forEach((t, i) => { if (!inTown(t.x, t.z)) this.add({ key: `tree:${i}`, kind: 'tree', ...t }); });
    ctx.scatter.bushes.forEach((b, i) => { if (!inTown(b.x, b.z)) this.add({ key: `bush:${i}`, kind: 'bush', ...b }); });
    ctx.scatter.boulders.forEach((b, i) => { if (!inTown(b.x, b.z)) this.add({ key: `boulder:${i}`, kind: 'boulder', x: b.x, y: b.top, z: b.z, r: b.r }); });
    ctx.scatter.stones.forEach((s, i) => {
      // Small stones vanish in the tall meadow grass, so only the ones on paths, sand, bare or
      // rocky ground (or big enough to stand out) can be picked up.
      if (inTown(s.x, s.z) || (ctx.grassAt(s.x, s.z) > 0.3 && s.r < 0.6)) return;
      const k = `stones:${i}`;
      this.add({ key: k, kind: 'stones', x: s.x, y: s.y, z: s.z, r: s.r }, (e) => ctx.rocks.setVisible(s.id, !e));
    });
    this.placeBerryBushes(ctx);
    this.placeApricornTrees(ctx);
    this.placeCopperVeins(ctx);
    this.placeMushroomLogs(ctx);
  }

  private add(n: ResourceNode, visual?: (empty: boolean) => void): void {
    this.nodes.push(n);
    this.byKey.set(n.key, n);
    if (visual) this.visuals.set(n.key, visual);
    const k = key(Math.floor(n.x / CELL), Math.floor(n.z / CELL));
    const list = this.grid.get(k);
    if (list) list.push(n);
    else this.grid.set(k, [n]);
  }

  /** The closest node the trainer at (x, y, z) can reach that `accept` allows, if any. */
  nearest(x: number, y: number, z: number, accept: (n: ResourceNode) => boolean): ResourceNode | null {
    let best: ResourceNode | null = null, bd = Infinity;
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let i = cx - 1; i <= cx + 1; i++) {
      for (let j = cz - 1; j <= cz + 1; j++) {
        for (const n of this.grid.get(key(i, j)) ?? []) {
          const d = Math.hypot(n.x - x, n.z - z) - n.r, score = d - (PRIORITY[n.kind] ?? 0);
          if (d > REACH || score >= bd || this.empty.has(n.key)) continue;
          // Reachable from the ground beside it, or from on top of a boulder.
          if (y - n.y > 1.2 || n.y - y > (n.kind === 'tree' || n.kind === 'apricorn' ? 3 : 1.8)) continue;
          if (!accept(n)) continue;
          bd = score;
          best = n;
        }
      }
    }
    return best;
  }

  node(k: string): ResourceNode | undefined {
    return this.byKey.get(k);
  }

  isEmpty(k: string): boolean {
    return this.empty.has(k);
  }

  /** Mark a node emptied (berries picked, ore mined) or grown back. */
  setEmpty(k: string, empty: boolean): void {
    if (empty === this.empty.has(k) || !this.byKey.has(k)) return;
    if (empty) this.empty.add(k);
    else this.empty.delete(k);
    this.visuals.get(k)?.(empty);
  }

  /** Replace the whole emptied set (loading a save). */
  setAllEmpty(keys: Iterable<string>): void {
    const want = new Set(keys);
    for (const k of [...this.empty]) if (!want.has(k)) this.setEmpty(k, false);
    for (const k of want) this.setEmpty(k, true);
  }

  update(focus: THREE.Vector3): void {
    for (const p of this.props) {
      const dx = p.position.x - focus.x, dz = p.position.z - focus.z;
      p.visible = dx * dx + dz * dz < SHOW_WITHIN * SHOW_WITHIN;
    }
  }

  // ---- placement -----------------------------------------------------------------------------

  /** A clear spot: on dry, gentle ground, away from paths, town, water and anything solid. */
  private spot(ctx: ResourceContext, rnd: () => number, near: (x: number, z: number) => boolean, clear: number, spacing: number, taken: { x: number; z: number }[], maxSlope = 0.3): { x: number; y: number; z: number } | null {
    const H = ctx.half - 30;
    for (let tries = 0; tries < 4000; tries++) {
      const x = (rnd() * 2 - 1) * H, z = (rnd() * 2 - 1) * H;
      if (!near(x, z)) continue;
      if (Math.hypot(x - ctx.town.x, z - ctx.town.z) < ctx.town.r + 25) continue;
      if (ctx.slopeAt(x, z) > maxSlope || ctx.waterDist(x, z) < 5 || ctx.reserved(x, z, 2)) continue;
      if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < spacing)) continue;
      const y = ctx.heightAt(x, z);
      if (y > 80) continue;
      if (collidersNear(x, z, clear, ctx.colliders).some((c) => colliderContains(c, x, z, clear))) continue;
      taken.push({ x, z });
      return { x, y, z };
    }
    return null;
  }

  /** Trees within `r` of a point (berry bushes grow at the edge of woods). */
  private treesNear(ctx: ResourceContext, x: number, z: number, r: number): number {
    let n = 0;
    for (const c of collidersNear(x, z, r, ctx.colliders)) if (c.kind === 'circle' && c.maxY === undefined && c.r < 1.2 && Math.hypot(c.x - x, c.z - z) < r) n++;
    return n;
  }

  private placeBerryBushes(ctx: ResourceContext): void {
    const rnd = mulberry32(8841);
    const taken: { x: number; z: number }[] = [];
    const geo = makeBushGeometry(false);
    const bushes = new THREE.InstancedMesh(geo, ctx.foliage, counts.berry);
    bushes.castShadow = bushes.receiveShadow = true;
    const berryGeo = new THREE.IcosahedronGeometry(0.075, 1);
    const berryMat = new THREE.MeshStandardMaterial({ color: 0x3f63c9, roughness: 0.32, metalness: 0.05 });
    const per = 16;
    const berries = new THREE.InstancedMesh(berryGeo, berryMat, counts.berry * per);
    berries.castShadow = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    let made = 0;
    for (let i = 0; i < counts.berry; i++) {
      const p = this.spot(ctx, rnd, (x, z) => this.treesNear(ctx, x, z, 14) >= 2, 1.4, 38, taken);
      if (!p) break;
      const sc = 1.05 + rnd() * 0.25, rot = rnd() * Math.PI * 2;
      bushes.setMatrixAt(made, m.compose(v.set(p.x, p.y - 0.08, p.z), q.setFromAxisAngle(up, rot), s.set(sc, sc * 0.95, sc)));
      bushes.setColorAt(made, new THREE.Color(0.78, 0.86, 0.82));
      const mats: THREE.Matrix4[] = [];
      for (let b = 0; b < per; b++) {
        // On the outside of the canopy, mostly the sunny upper half.
        const a = rnd() * Math.PI * 2, el = -0.2 + rnd() * 1.0;
        const rr = 0.86 * sc, cy = 0.62 * sc;
        const bx = p.x + Math.cos(a) * Math.cos(el) * rr, bz = p.z + Math.sin(a) * Math.cos(el) * rr, by = p.y + cy + Math.sin(el) * rr * 0.7;
        const bs = 0.8 + rnd() * 0.5;
        mats.push(new THREE.Matrix4().compose(v.set(bx, by, bz), q.identity(), s.set(bs, bs, bs)));
      }
      const first = made * per;
      mats.forEach((mm, b) => berries.setMatrixAt(first + b, mm));
      const zero = new THREE.Matrix4().makeScale(0, 0, 0);
      this.add({ key: `berry:${i}`, kind: 'berry', x: p.x, y: p.y, z: p.z, r: 0.9 * sc }, (e) => {
        mats.forEach((mm, b) => berries.setMatrixAt(first + b, e ? zero : mm));
        berries.instanceMatrix.needsUpdate = true;
      });
      ctx.colliders.push({ kind: 'circle', x: p.x, z: p.z, r: 0.55 * sc });
      made++;
    }
    bushes.count = made;
    berries.count = made * per;
    bushes.name = 'berry-bushes';
    this.root.add(bushes, berries);
  }

  private placeApricornTrees(ctx: ResourceContext): void {
    const rnd = mulberry32(5521);
    const taken: { x: number; z: number }[] = [];
    const kind = makeTreeKinds().round;
    const trees = new THREE.InstancedMesh(kind.hi, ctx.foliage, counts.apricorn);
    trees.castShadow = trees.receiveShadow = true;
    // A dark red-brown apricorn with a pale cap, hanging from a stalk.
    const fruitGeo = new THREE.SphereGeometry(0.13, 12, 9);
    fruitGeo.scale(1, 0.92, 1);
    const fruitMat = new THREE.MeshStandardMaterial({ color: 0xb8322a, roughness: 0.38 });
    const capGeo = new THREE.CylinderGeometry(0.035, 0.07, 0.08, 8);
    const capMat = new THREE.MeshStandardMaterial({ color: 0xe8d9a8, roughness: 0.6 });
    const per = 9;
    const fruit = new THREE.InstancedMesh(fruitGeo, fruitMat, counts.apricorn * per);
    const caps = new THREE.InstancedMesh(capGeo, capMat, counts.apricorn * per);
    fruit.castShadow = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    let made = 0;
    for (let i = 0; i < counts.apricorn; i++) {
      // Out in the open meadow, where the sun gets at them.
      const p = this.spot(ctx, rnd, (x, z) => this.treesNear(ctx, x, z, 10) === 0, 2.5, 70, taken, 0.22);
      if (!p) break;
      const sc = 0.5 + rnd() * 0.08, rot = rnd() * Math.PI * 2;
      trees.setMatrixAt(made, m.compose(v.set(p.x, p.y - 0.1, p.z), q.setFromAxisAngle(up, rot), s.set(sc, sc, sc)));
      trees.setColorAt(made, new THREE.Color(0.86, 0.9, 0.72));
      const fm: THREE.Matrix4[] = [], cm: THREE.Matrix4[] = [];
      for (let b = 0; b < per; b++) {
        // Hanging under the outer edge of the canopy, within reach.
        const a = (b / per) * Math.PI * 2 + rnd() * 0.5, rr = (1.5 + rnd() * 0.5) * sc * 1.6;
        const fx = p.x + Math.cos(a) * rr, fz = p.z + Math.sin(a) * rr, fy = p.y + 1.75 + rnd() * 0.45;
        fm.push(new THREE.Matrix4().compose(v.set(fx, fy, fz), q.identity(), s.set(1, 1, 1)));
        cm.push(new THREE.Matrix4().compose(v.set(fx, fy + 0.13, fz), q.identity(), s.set(1, 1, 1)));
      }
      const first = made * per, zero = new THREE.Matrix4().makeScale(0, 0, 0);
      const show = (e: boolean) => {
        for (let b = 0; b < per; b++) {
          fruit.setMatrixAt(first + b, e ? zero : fm[b]);
          caps.setMatrixAt(first + b, e ? zero : cm[b]);
        }
        fruit.instanceMatrix.needsUpdate = caps.instanceMatrix.needsUpdate = true;
      };
      show(false);
      this.add({ key: `apricorn:${i}`, kind: 'apricorn', x: p.x, y: p.y, z: p.z, r: 1.6 }, show);
      ctx.colliders.push({ kind: 'circle', x: p.x, z: p.z, r: kind.radius * sc * 1.1 });
      made++;
    }
    trees.count = made;
    fruit.count = caps.count = made * per;
    trees.name = 'apricorn-trees';
    this.root.add(trees, fruit, caps);
  }

  private placeCopperVeins(ctx: ResourceContext): void {
    const rnd = mulberry32(7307);
    const taken: { x: number; z: number }[] = [];
    const rockMat = makeStoneMaterial(0.5);
    const oreMat = new THREE.MeshStandardMaterial({ color: 0xc9773a, roughness: 0.32, metalness: 0.75, emissive: new THREE.Color(0x3a1a06), emissiveIntensity: 0.6 });
    const oreGeo = new THREE.DodecahedronGeometry(0.11, 0);
    const per = 11;
    const ore = new THREE.InstancedMesh(oreGeo, oreMat, counts.copper * per);
    ore.castShadow = true;
    const ray = new THREE.Raycaster(), v = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    const geos = [makeRockGeometry(31), makeRockGeometry(32), makeRockGeometry(33)];
    let made = 0;
    for (let i = 0; i < counts.copper; i++) {
      // At the feet of the mesas and on rocky slopes.
      const nearMesa = (x: number, z: number) => ctx.mesas.some((me) => {
        const d = Math.hypot(x - me.x, z - me.z);
        return d > me.r * 0.95 && d < me.r * 1.5;
      });
      const p = this.spot(ctx, rnd, nearMesa, 1.8, 45, taken, 0.42);
      if (!p) break;
      const sc = 1.0 + rnd() * 0.35;
      const rock = new THREE.Mesh(geos[i % geos.length], rockMat);
      rock.position.set(p.x, p.y - sc * 0.15, p.z);
      rock.rotation.y = rnd() * Math.PI * 2;
      rock.scale.set(sc * 1.15, sc * 0.95, sc);
      rock.castShadow = rock.receiveShadow = true;
      rock.updateMatrixWorld(true);
      const mats: THREE.Matrix4[] = [];
      for (let b = 0; b < per * 3 && mats.length < per; b++) {
        // Cast in from outside towards the core and seat a nugget where the ray meets stone.
        const a = rnd() * Math.PI * 2, el = 0.15 + rnd() * 0.9;
        const from = v.set(p.x + Math.cos(a) * Math.cos(el) * 4, rock.position.y + 0.25 * sc + Math.sin(el) * 4, p.z + Math.sin(a) * Math.cos(el) * 4);
        const target = new THREE.Vector3(p.x, rock.position.y + 0.25 * sc, p.z);
        ray.set(from.clone(), target.sub(from).normalize());
        const hit = ray.intersectObject(rock, false)[0];
        if (!hit) continue;
        const n = hit.face ? hit.face.normal.clone().transformDirection(rock.matrixWorld) : new THREE.Vector3(0, 1, 0);
        const ns = 0.7 + rnd() * 0.7;
        q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6));
        mats.push(new THREE.Matrix4().compose(hit.point.clone().addScaledVector(n, -0.03), q.clone(), s.set(ns, ns * 0.7, ns)));
      }
      const first = made * per, zero = new THREE.Matrix4().makeScale(0, 0, 0);
      const show = (e: boolean) => {
        for (let b = 0; b < per; b++) ore.setMatrixAt(first + b, e || !mats[b] ? zero : mats[b]);
        ore.instanceMatrix.needsUpdate = true;
      };
      show(false);
      const top = rock.position.y + sc * 0.95 * 0.75;
      this.add({ key: `copper:${i}`, kind: 'copper', x: p.x, y: p.y, z: p.z, r: 1.0 * sc }, show);
      ctx.colliders.push({ kind: 'circle', x: p.x, z: p.z, r: 0.9 * sc, maxY: top });
      rock.name = 'copper-vein';
      this.root.add(rock);
      this.props.push(rock);
      made++;
    }
    ore.count = made * per;
    this.root.add(ore);
  }

  /**
   * Mossy fallen logs in the woods with wild mushrooms growing on them. Mushrooms on their own
   * would vanish in the meadow grass; a log stands out and gives the player something to look for.
   */
  private placeMushroomLogs(ctx: ResourceContext): void {
    const rnd = mulberry32(6619);
    // Colour noise has its own stream so mesh detail never moves the logs.
    const tint = mulberry32(6620);
    const taken: { x: number; z: number }[] = [];
    const bark = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.95 });
    const cut = new THREE.MeshStandardMaterial({ color: 0xa88a62, roughness: 0.9 });
    const per = 9;
    const capGeo = new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    capGeo.scale(1, 0.55, 1);
    const stemGeo = new THREE.CylinderGeometry(0.28, 0.36, 1, 7);
    stemGeo.translate(0, -0.5, 0);
    const caps = new THREE.InstancedMesh(capGeo, new THREE.MeshStandardMaterial({ color: 0xc27a3e, roughness: 0.55 }), counts.mushroom * per);
    const stems = new THREE.InstancedMesh(stemGeo, new THREE.MeshStandardMaterial({ color: 0xeee3c8, roughness: 0.8 }), counts.mushroom * per);
    caps.castShadow = true;
    const q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const bark0 = new THREE.Color(0x8a6c52), moss = new THREE.Color(0x86a34a), c = new THREE.Color();
    let made = 0;
    for (let i = 0; i < counts.mushroom; i++) {
      const p = this.spot(ctx, rnd, (x, z) => this.treesNear(ctx, x, z, 14) >= 3, 1.8, 22, taken, 0.25);
      if (!p) break;
      const r = 0.27 + rnd() * 0.09, half = 1.0 + rnd() * 0.4, yaw = rnd() * Math.PI;
      const ax = Math.sin(yaw), az = Math.cos(yaw);
      // Sit it on the lower of its two ends so it doesn't float on a slope.
      const ground = Math.min(ctx.heightAt(p.x + ax * half, p.z + az * half), ctx.heightAt(p.x - ax * half, p.z - az * half), p.y);
      const cy = ground + r * 0.75;
      const geo = new THREE.CylinderGeometry(r, r * 0.9, half * 2, 14, 6);
      const pos = geo.getAttribute('position');
      // Knobbly, not a perfect tube: bulges that wind along it, the same at every shared corner.
      for (let k = 0; k < pos.count; k++) {
        const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k), ang = Math.atan2(x, z);
        const bulge = 1 + 0.07 * Math.sin(3 * ang + y * 2.3 + i) + 0.04 * Math.sin(7 * ang - y * 4.1) + 0.05 * Math.sin(y * 3.7 + i * 2);
        pos.setXYZ(k, x * bulge, y, z * bulge);
      }
      geo.computeVertexNormals();
      const nrm = geo.getAttribute('normal');
      const colors = new Float32Array(pos.count * 3);
      for (let k = 0; k < pos.count; k++) {
        // Lying down, the cylinder's +Z side faces up: moss there, bark below, darker in the grooves.
        const ang = Math.atan2(pos.getX(k), pos.getZ(k));
        const mossy = Math.max(0, nrm.getZ(k)) * (0.75 + 0.25 * Math.sin(pos.getY(k) * 5 + i));
        c.copy(bark0).multiplyScalar(0.8 + 0.2 * Math.sin(9 * ang)).lerp(moss, Math.min(1, mossy * 1.1)).multiplyScalar(0.9 + tint() * 0.15);
        colors.set([c.r, c.g, c.b], k * 3);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const log = new THREE.Mesh(geo, [bark, cut, cut]);
      log.position.set(p.x, cy, p.z);
      log.quaternion.setFromAxisAngle(up, yaw).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
      log.castShadow = log.receiveShadow = true;
      log.name = 'mushroom-log';
      this.root.add(log);
      this.props.push(log);
      // Caps along the top and upper sides, a couple on the ground beside it.
      const mats: THREE.Matrix4[][] = [];
      for (let b = 0; b < per; b++) {
        const t = (rnd() * 2 - 1) * half * 0.85;
        const onLog = b < per - 2;
        const side = rnd() < 0.5 ? -1 : 1, ang = onLog ? (rnd() * 2 - 1) * 1.1 : side * 1.5;
        const across = { x: Math.cos(yaw), z: -Math.sin(yaw) };
        const out = onLog ? r : r + 0.12 + rnd() * 0.15;
        const bx = p.x + ax * t + across.x * Math.sin(ang) * out, bz = p.z + az * t + across.z * Math.sin(ang) * out;
        const by = onLog ? cy + Math.cos(ang) * r : ctx.heightAt(bx, bz);
        const size = 0.07 + rnd() * 0.07, stem = size * (0.8 + rnd() * 0.6);
        q.setFromAxisAngle(up, rnd() * 6).premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(across.x, 0, across.z), -Math.sin(ang) * 0.35));
        mats.push([
          new THREE.Matrix4().compose(v.set(bx, by + stem, bz), q, s.set(size, size, size)),
          new THREE.Matrix4().compose(v.set(bx, by + stem, bz), q, s.set(size, stem, size)),
        ]);
      }
      const first = made * per;
      const show = (e: boolean) => {
        mats.forEach(([cm, sm], b) => { caps.setMatrixAt(first + b, e ? zero : cm); stems.setMatrixAt(first + b, e ? zero : sm); });
        caps.instanceMatrix.needsUpdate = stems.instanceMatrix.needsUpdate = true;
      };
      show(false);
      this.add({ key: `mushroom:${i}`, kind: 'mushroom', x: p.x, y: ground, z: p.z, r: half * 0.75 }, show);
      // Shade under the trees: the grass is short and sparse around the log.
      ctx.thinGrass?.(p.x, p.z, half + 1.5, 0.25);
      ctx.colliders.push({ kind: 'obox', x: p.x, z: p.z, hw: r, hd: half, yaw, maxY: cy + r });
      made++;
    }
    caps.count = stems.count = made * per;
    caps.name = 'mushrooms';
    this.root.add(caps, stems);
  }
}
