import * as THREE from 'three';
import type { Collider, World } from './types';
import { HALF, POI, TOWN, WATER_LEVEL, ROADS, MESAS, distToPolyline, POND, LAKE } from './layout';
import { buildTerrainData, TerrainQuery, makeNoiseTexture, makeTerrainMaterial, buildTerrainMeshes, makeDepthTexture, waterDistance } from './terrain';
import { createLights, createSky, centreSun } from './sky';
import { createWater } from './water';
import { GeoBuilder, mats, worldUniforms } from './shared';
import { scatterVegetation, GrassField, makeTreeKinds, makeFoliageMaterial, makeBushGeometry, flowerGeometry, makeFlowerMaterial, FLOWER_COLORS } from './vegetation';
import { buildHometown } from './hometown';
import { buildRuins, buildBridge, buildDock, buildPOIs, lilyPads, type Walkable } from './poi';
import type { Kit } from './buildings';
import { mulberry32 } from './noise';

export { applyAtmosphere } from './sky';

/**
 * Build the Sijord overworld (milestone 1): a 1.2 km square valley ringed by snowy mountains,
 * with the hometown Bramblewick in the south, Route 1 heading north, a river + lake to the east
 * and layered mesas with ruins to the north-west. North = +Z, east = -X.
 */
export function createWorld(): World {
  const root = new THREE.Group();
  root.name = 'world';
  const colliders: Collider[] = [];

  // ---- terrain ----
  const data = buildTerrainData();
  const terrain = new TerrainQuery(data);
  const noiseTex = makeNoiseTexture();
  const terrainMat = makeTerrainMaterial(noiseTex);
  const terrainMeshes = buildTerrainMeshes(data, terrainMat);
  root.add(terrainMeshes.group);

  // ---- sky + light ----
  const { sun } = createLights(root);
  const sky = createSky();
  root.add(sky);

  // ---- water ----
  const water = createWater(makeDepthTexture(data));
  root.add(water);

  // ---- static props ----
  const kit: Kit = { solid: new GeoBuilder(), glow: new GeoBuilder(), extras: new THREE.Group(), colliders };
  const kinds = makeTreeKinds();
  const town = buildHometown(kit, kinds);
  const rawH = (x: number, z: number) => terrain.heightAt(x, z);
  const ruinReserved = buildRuins(kit, rawH);
  const bridge = buildBridge(kit, rawH);
  const dock = buildDock(kit);
  const poi = buildPOIs(kit, rawH);
  lilyPads(kit, POND.x, POND.z, POND.r, 26, rawH, 5);
  lilyPads(kit, LAKE.x, LAKE.z, Math.min(LAKE.rx, LAKE.rz), 70, rawH, 6);
  const walkables: Walkable[] = [bridge.walk, dock];

  // lone big tree on its hill
  const foliage = makeFoliageMaterial(0.008, 2.2);
  {
    const lt = POI.loneTree;
    const m = new THREE.Mesh(kinds.wide.hi, foliage);
    m.position.set(lt.x, terrain.heightAt(lt.x, lt.z) - 0.3, lt.z);
    m.scale.setScalar(2.7);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
    colliders.push({ kind: 'circle', x: lt.x, z: lt.z, r: 1.4 });
  }

  // town trees, hedges, flower beds
  {
    const byKind = new Map<string, typeof town.trees>();
    for (const t of town.trees) {
      if (!byKind.has(t.kind)) byKind.set(t.kind, []);
      byKind.get(t.kind)!.push(t);
    }
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const rnd = mulberry32(9);
    for (const [k, list] of byKind) {
      const im = new THREE.InstancedMesh(kinds[k].hi, foliage, list.length);
      list.forEach((t, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28);
        im.setMatrixAt(i, mtx.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.s, t.s, t.s)));
      });
      im.castShadow = true;
      im.receiveShadow = true;
      root.add(im);
    }
    const hedge = new THREE.InstancedMesh(makeBushGeometry(false), makeFoliageMaterial(0.03, 0.3), town.hedges.length);
    town.hedges.forEach((h, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28);
      hedge.setMatrixAt(i, mtx.compose(new THREE.Vector3(h.x, h.y - 0.05, h.z), q, new THREE.Vector3(h.s * 1.2, h.s, h.s * 1.2)));
    });
    hedge.castShadow = true;
    hedge.receiveShadow = true;
    root.add(hedge);
    const fl = new THREE.InstancedMesh(flowerGeometry(), makeFlowerMaterial(), town.flowerSpots.length);
    const c = new THREE.Color();
    town.flowerSpots.forEach((p, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28);
      const s = 1.1 + rnd() * 0.5;
      fl.setMatrixAt(i, mtx.compose(new THREE.Vector3(p[0], p[1], p[2]), q, new THREE.Vector3(s, s, s)));
      fl.setColorAt(i, c.copy(FLOWER_COLORS[Math.floor(rnd() * FLOWER_COLORS.length)]));
    });
    fl.receiveShadow = true;
    root.add(fl);
  }

  const solid = new THREE.Mesh(kit.solid.build(), mats.vc);
  solid.name = 'props';
  solid.castShadow = true;
  solid.receiveShadow = true;
  root.add(solid);
  const glow = new THREE.Mesh(kit.glow.build(), mats.glow);
  glow.name = 'lanterns';
  root.add(glow);
  root.add(kit.extras);

  // campfire flames
  const fireGroup = new THREE.Group();
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa23a, toneMapped: false });
  const flameMat2 = new THREE.MeshBasicMaterial({ color: 0xffe27a, toneMapped: false });
  const flames: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.35 - i * 0.08, 1.1 - i * 0.2, 7), i === 2 ? flameMat2 : flameMat);
    f.position.set((i - 1) * 0.12, 0.6, (i % 2) * 0.1);
    flames.push(f);
    fireGroup.add(f);
  }
  fireGroup.position.copy(poi.fire);
  root.add(fireGroup);

  // ---- boundary: mountains + invisible walls just inside them ----
  const W = 200;
  colliders.push(
    { kind: 'box', minX: HALF, maxX: HALF + W, minZ: -HALF - W, maxZ: HALF + W },
    { kind: 'box', minX: -HALF - W, maxX: -HALF, minZ: -HALF - W, maxZ: HALF + W },
    { kind: 'box', minX: -HALF - W, maxX: HALF + W, minZ: HALF, maxZ: HALF + W },
    { kind: 'box', minX: -HALF - W, maxX: HALF + W, minZ: -HALF - W, maxZ: -HALF },
  );

  // ---- vegetation scatter ----
  const reservedSpots: { x: number; z: number; r: number }[] = [
    ...ruinReserved, ...poi.reserved,
    { x: bridge.x, z: bridge.z, r: 26 },
    { x: POI.loneTree.x, z: POI.loneTree.z, r: 12 },
    { x: POI.dock.x, z: POI.dock.z, r: 10 },
  ];
  const reserved = (x: number, z: number, margin: number): boolean => {
    if (Math.hypot(x - TOWN.x, z - TOWN.z) < TOWN.fenceR + 10 + margin) return true;
    for (const r of ROADS) if (distToPolyline(x, z, r.pts) < r.width + 2 + margin) return true;
    for (const s of reservedSpots) if (Math.hypot(x - s.x, z - s.z) < s.r + margin) return true;
    for (const m of MESAS) if (Math.hypot(x - m.x, z - m.z) < m.r * 0.35) return true;
    return false;
  };
  const veg = scatterVegetation({ terrain, reserved, waterDist: (x, z) => waterDistance(x, z).d, colliders, half: HALF });
  root.add(veg.group);

  // ---- grass around the focus ----
  const blockBoxes = colliders.filter((c): c is Extract<Collider, { kind: 'box' }> => c.kind === 'box' && c.maxX - c.minX < 60);
  const grassBlocked = (x: number, z: number): boolean => {
    if (Math.abs(x - TOWN.x) < 70 && Math.abs(z - TOWN.z) < 70) {
      for (const b of blockBoxes) if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return true;
    }
    return false;
  };
  const grass = new GrassField(terrain, grassBlocked, 34);
  root.add(grass.group);

  // ---- queries ----
  const heightAt = (x: number, z: number): number => {
    let h = terrain.heightAt(x, z);
    for (const w of walkables) {
      const d = w.test(x, z);
      if (d > h) h = d;
    }
    return h;
  };

  const world: World = {
    root,
    heightAt,
    waterLevel: WATER_LEVEL,
    colliders,
    regions: [town.region],
    anchors: town.anchors,
    halfSize: HALF,
    sun,
    update(dt: number, elapsed: number, focus: THREE.Vector3): void {
      void dt;
      worldUniforms.uTime.value = elapsed;
      worldUniforms.uFocus.value.copy(focus);
      const g = 0.75 + Math.sin(elapsed * 0.23) * 0.25;
      worldUniforms.uWind.value.set(0.8 * g, 0.45 * g);
      grass.update(focus);
      terrainMeshes.update(focus);
      for (const b of veg.batches) b.update(focus);
      sky.position.set(focus.x, 0, focus.z);
      centreSun(sun, focus);
      for (let i = 0; i < flames.length; i++) {
        const f = flames[i];
        const s = 0.85 + Math.sin(elapsed * (9 + i * 3) + i) * 0.12 + Math.sin(elapsed * 17 + i * 2) * 0.06;
        f.scale.set(1, s, 1);
        f.rotation.y = elapsed * (1 + i);
      }
    },
    groundColorAt(x: number, z: number): THREE.Color {
      return terrain.groundColorAt(x, z);
    },
  };
  // initialise animated state around the town so the first frame is complete
  world.update(0, 0, town.anchors.playerSpawns[0]);
  return world;
}
