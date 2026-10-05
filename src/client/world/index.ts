import * as THREE from 'three';
import type { Collider, World } from './types';
import { HALF, POI, TOWN, WATER_LEVEL, ROADS, MESAS, distToPolyline, POND, LAKE } from './layout';
import { buildTerrainData, TerrainQuery, makeTerrainMaterial, buildTerrainMeshes, makeDepthTexture, waterDistance, makeTerrainTextures } from './terrain';
import { createLights, createSky, centreSun, createClouds } from './sky';
import { createWater } from './water';
import { GeoBuilder, mats, worldUniforms } from './shared';
import { scatterVegetation, makeTreeKinds, makeBedFlowers, type FixedTree } from './vegetation';
import { buildHometown } from './hometown';
import { buildRuins, buildBridge, buildDock, buildPOIs, lilyPads, type Walkable } from './poi';
import type { Kit } from './buildings';
import { GrassSystem, makeTownMask } from './grass';
import { buildCliffs, type CliffResult } from './cliffs';
import { createFauna } from './fauna';

export { applyAtmosphere } from './sky';

type Quality = 'low' | 'medium' | 'high';

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
  const grassRadius = { value: 48 };
  const terrainMat = makeTerrainMaterial(grassRadius);
  const terrainMeshes = buildTerrainMeshes(data, terrainMat);
  root.add(terrainMeshes.group);

  // ---- sky + light ----
  const { sun } = createLights(root);
  const sky = createSky();
  root.add(sky);
  const clouds = createClouds();
  root.add(clouds.mesh);

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

  // layered stone cliffs on the mesas
  const cliffs = buildCliffs(terrain, colliders);
  root.add(cliffs.group);

  // hand-placed trees: the lone big tree on its hill and the town trees
  const fixedTrees: FixedTree[] = town.trees.map((t) => ({ kind: t.kind, x: t.x, y: t.y, z: t.z, s: t.s }));
  {
    const lt = POI.loneTree;
    fixedTrees.push({ kind: 'wide', x: lt.x, y: terrain.heightAt(lt.x, lt.z) - 0.3, z: lt.z, s: 2.7 });
    colliders.push({ kind: 'circle', x: lt.x, z: lt.z, r: 1.4 });
  }
  fixedTrees.push(...cliffs.topTrees);
  const fixedBushes: CliffResult['rimBushes'] = town.hedges.map((h) => ({ x: h.x, y: h.y - 0.05, z: h.z, s: h.s * 1.2, sy: h.s }));
  fixedBushes.push(...cliffs.rimBushes);
  root.add(makeBedFlowers(town.flowerSpots, 9));

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
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa23a).multiplyScalar(2.2), fog: true });
  const flameMat2 = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe27a).multiplyScalar(2.6), fog: true });
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
  const veg = scatterVegetation({
    terrain, reserved, waterDist: (x, z) => waterDistance(x, z).d, colliders, half: HALF,
    fixedTrees, fixedBushes,
  });
  root.add(veg.group);

  // ---- GPU grass + flowers ----
  const blockBoxes = colliders.filter((c): c is Extract<Collider, { kind: 'box' }> => c.kind === 'box' && c.maxX - c.minX < 60);
  const grassBlocked = (x: number, z: number): boolean => {
    if (Math.abs(x - TOWN.x) < 70 && Math.abs(z - TOWN.z) < 70) {
      for (const b of blockBoxes) if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return true;
    }
    return false;
  };
  const townMask = makeTownMask(colliders, TOWN.x, TOWN.z, 72);
  const grass = new GrassSystem(terrain, makeTerrainTextures(data), townMask, grassBlocked, grassRadius);
  root.add(grass.group);

  // ---- ambient life ----
  const fauna = createFauna();
  root.add(fauna.group);

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
    climbs:town.climbs,
    surfaceHeightAt(x,z,feetY){let h=heightAt(x,z);for(const p of town.platforms)if(feetY>=p.y-.3&&x>=p.minX&&x<=p.maxX&&z>=p.minZ&&z<=p.maxZ)h=Math.max(h,p.y);return h;},
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
      terrainMeshes.update(focus);
      for (const b of veg.batches) b.update(focus);
      sky.position.set(focus.x, 0, focus.z);
      clouds.update(focus, elapsed);
      centreSun(sun, focus);
      fauna.update(focus, heightAt);
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
    setQuality(q: Quality): void {
      grass.setQuality(q);
      const lod = q === 'low' ? 0.65 : q === 'medium' ? 1 : 1.5;
      for (const b of veg.batches) b.setLodScale(lod);
      terrainMeshes.setLodScale(q === 'low' ? 0.75 : q === 'medium' ? 1 : 1.4);
      fauna.setCount(q === 'low' ? 10 : q === 'medium' ? 20 : 28, q === 'low' ? 6 : 14);
    },
  };
  world.setQuality!('medium');
  // initialise animated state around the town so the first frame is complete
  world.update(0, 0, town.anchors.playerSpawns[0]);
  return world;
}
