import * as THREE from 'three';
import { mulberry32 } from './noise';
import { TOWN, GATE_HALF_WIDTH } from './layout';
import {
  Frame, box, cottage, lab, signpost, lantern, crate, barrel, well, bench, garden, flowerBed, fenceSegment, addSignBoard, cart, COL,
  type Kit, streetHouse, marketStall, workbench,
} from './buildings';
import { signTexture } from './shared';
import type { WorldAnchors, Region, ClimbPoint, Platform } from './types';
import type { TreeKind } from './vegetation';

export interface TownResult {
  anchors: WorldAnchors;
  climbs:ClimbPoint[];
  platforms:Platform[];
  region: Region;
  flowerSpots: [number, number, number][];
  trees: { kind: string; x: number; y: number; z: number; s: number }[];
  hedges: { x: number; y: number; z: number; s: number }[];
}

/** Bramblewick: the starting village. North (+Z) gate, plaza with a well, houses, Hazel's lab. */
export function buildHometown(kit: Kit, kinds: Record<string, TreeKind>): TownResult {
  const rnd = mulberry32(31337);
  const X = TOWN.x, Z = TOWN.z, Y = TOWN.h;
  const at = (lx: number, lz: number): [number, number, number] => [X + lx, Y, Z + lz];

  // ---- buildings ----
  const p1Door = cottage(kit, ...at(27, 20), Math.PI, { w: 8, d: 7, wallH: 3.2, roof: 0x567080, shutter: 0x3a7d44 });
  const p2Door = cottage(kit, ...at(14, 20), Math.PI, { w: 8, d: 7, wallH: 3.2, roof: COL.roofBlue, shutter: 0xd9a03f, wall: 0xf6ecd6 });
  cottage(kit, ...at(-16, 22), Math.PI, { w: 7, d: 6, wallH: 3.0, roof: 0x596f64, shutter: 0xb5553a, wall: 0xefe0bf });
  cottage(kit, ...at(-28, -2), Math.PI / 2, { w: 7.5, d: 6, wallH: 4.6, roof: 0x7f6b58, shutter: 0x3d6fc4, floors: 2 });
  cottage(kit, ...at(28, -10), -Math.PI / 2, { w: 7, d: 6, wallH: 3.0, roof: 0x596779, shutter: 0x4f8f3a, wall: 0xf3e3d0 });
  const labDoor = lab(kit, ...at(0, -30), 0);

  // A denser commercial street, with porches facing the central avenue.
  for(const [x,z,yaw,label] of [
    [-20,38,Math.PI/2,'FIELD SUPPLIES'],[-20,9,Math.PI/2,'THE CLOTHIER'],[-20,-20,Math.PI/2,'WAYFARER INN'],
    [20,40,-Math.PI/2,'CRAFT WORKSHOP'],[20,0,-Math.PI/2,'APOTHECARY'],[20,-26,-Math.PI/2,'SURVEY LODGE'],
  ] as [number,number,number,string][])streetHouse(kit,...at(x,z),yaw,label,0x526e7b);
  // The village workbench stands on the Craft Workshop's porch, by the door.
  const bench0 = new Frame(...at(20, 40), -Math.PI / 2).p(2.7, 0, 4.25);
  const workbenchSpot = workbench(kit, bench0[0], Y + 0.11, bench0[2], -Math.PI / 2);
  // Broad dirt avenue with stone edging; keep the plaza and every existing quest approach open.
  const street=new Frame(X,Y,Z,0);
  box(kit.solid,street,[11.2,.035,76],[0,.012,16],0xb8a080);
  for(const sx of [-5.9,5.9])for(let z=-21;z<54;z+=1.3)box(kit.solid,street,[.34,.12,1.1],[sx,.06,z],0x9c9687);
  for(const [x,z,color] of [[-9,26,0x315c65],[9,16,0xa95744]] as [number,number,number][])marketStall(kit,...at(x,z),0,color);
  const climbs:ClimbPoint[]=[],platforms:Platform[]=[];
  for(const [lx,lz,name] of [[9,47,'Gate lookout'],[-10,-5,'Village lookout']] as [number,number,string][]){
    const f=new Frame(...at(lx,lz),0),top=Y+4.8;
    for(const sx of [-1.8,1.8])for(const sz of [-1.8,1.8]){
      box(kit.solid,f,[.22,4.8,.22],[sx,2.4,sz],COL.woodDark);
      kit.colliders.push({kind:'circle',x:X+lx+sx,z:Z+lz+sz,r:.18,maxY:top});
    }
    for(let x=-1.8;x<=1.8;x+=.3)box(kit.solid,f,[.28,.18,4],[x,4.71,0],COL.woodLight);
    for(const sx of [-1.95,1.95]){box(kit.solid,f,[.12,1,4],[sx,5.3,0],COL.woodDark);}
    box(kit.solid,f,[4,1,.12],[0,5.3,1.95],COL.woodDark);
    // Ladder front, with open access to the platform at the top.
    for(const sx of [-.42,.42])box(kit.solid,f,[.095,4.9,.095],[sx,2.45,-2.18],COL.wood);
    for(let h=.22;h<4.9;h+=.32)box(kit.solid,f,[.9,.075,.11],[0,h,-2.18],COL.woodLight);
    climbs.push({id:name,bottom:{x:X+lx,y:Y,z:Z+lz-2.6},top:{x:X+lx,y:top,z:Z+lz-2.6},landing:{x:X+lx,y:top,z:Z+lz-1.35},yaw:0});
    platforms.push({minX:X+lx-2,maxX:X+lx+2,minZ:Z+lz-2,maxZ:Z+lz+2,y:top});
  }

  // ---- plaza ----
  well(kit, ...at(0, 0));
  // cobbled plaza rings around the well
  for (let r = 2.3; r < 7.6; r += 0.78) {
    const n = Math.round((2 * Math.PI * r) / 0.78);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r;
      const tone = [0xb9b1a2, 0xa8a090, 0xc8c0b0, 0x9d9585][Math.floor(rnd() * 4)];
      box(kit.solid, new Frame(X + Math.sin(a) * r, Y, Z + Math.cos(a) * r, a), [0.68, 0.1, 0.7], [0, 0.02, 0], tone, [(rnd() - 0.5) * 0.04, (rnd() - 0.5) * 0.2, 0]);
    }
  }
  bench(kit, ...at(12.6, 4), -Math.PI / 2);
  bench(kit, ...at(-12.6, 5), Math.PI / 2);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    lantern(kit, ...at(Math.sin(a) * 11.6, Math.cos(a) * 11.6), a + Math.PI);
  }
  for (const lz of [22, 36, 50]) for (const sx of [-1, 1]) lantern(kit, ...at(sx * 3.4, lz), sx > 0 ? -Math.PI / 2 : Math.PI / 2);
  lantern(kit, ...at(3.8, -19), -Math.PI / 2);
  lantern(kit, ...at(-3.8, -19), Math.PI / 2);
  signpost(kit, ...at(4.2, 11.5), 0, [["Route 1"], ["Hazel's Lab"], ['Homes']], [0, Math.PI, Math.PI / 2]);

  // ---- props ----
  crate(kit, ...at(-10.6, -26), 0.2, 1.0);
  crate(kit, ...at(-10.4, -27.3), -0.1, 0.8);
  crate(kit, ...at(-10.5, -26.4).map((v, i) => (i === 1 ? v + 1.0 : v)) as [number, number, number], 0.5, 0.7);
  barrel(kit, ...at(-11.2, -22.5));
  barrel(kit, ...at(-12.0, -21.6));
  barrel(kit, ...at(-11, 26.5));
  crate(kit, ...at(-11.5, 25), 0.4, 0.9);
  crate(kit, ...at(33, -15), 0.1, 0.9);
  barrel(kit, ...at(32.5, -6));
  cart(kit, ...at(-10, 37), 0.4);
  // laundry line between the player houses
  const lf = new Frame(...at(20.5, 26.5), 0);
  for (const sx of [-2.4, 2.4]) box(kit.solid, lf, [0.12, 2.2, 0.12], [sx, 1.1, 0], COL.woodDark);
  box(kit.solid, lf, [4.8, 0.03, 0.03], [0, 2.0, 0], 0xeeeeee);
  const cloths = [0xffffff, 0x7fb8ff, 0xff8a8a, 0xffe08a];
  cloths.forEach((c, i) => box(kit.solid, lf, [0.7, 0.8, 0.03], [-1.6 + i * 1.05, 1.58, 0], c));
  kit.colliders.push({ kind: 'circle', x: X + 18.1, z: Z + 26.5, r: 0.2 }, { kind: 'circle', x: X + 22.9, z: Z + 26.5, r: 0.2 });

  // ---- gardens + flower beds ----
  garden(kit, ...at(-31, -16), 0, 5, 3.4, rnd);
  garden(kit, ...at(31, -23), 0, 5, 3, rnd);
  garden(kit, ...at(-16, 31), 0, 6, 3, rnd);
  const flowerSpots: [number, number, number][] = [];
  for (const [lx, lz, w, d] of [[9.5, 8, 3, 2], [-9.5, 8, 3, 2], [-9.5, -6, 3, 2], [9.5, -5, 3, 2], [6.8, -21.5, 3.2, 1.6], [-6.8, -21.5, 3.2, 1.6], [20.5, 14.2, 2.2, 1.2], [8, 14.5, 2.2, 1.2]] as [number, number, number, number][]) {
    flowerSpots.push(...flowerBed(kit, ...at(lx, lz), w, d, rnd));
  }

  // ---- fence ring with a north gate ----
  const R = TOWN.fenceR;
  const gap = GATE_HALF_WIDTH / R;
  const segs = Math.round((2 * Math.PI * R) / 2.4);
  const ang = (i: number) => (i / segs) * Math.PI * 2;
  for (let i = 0; i < segs; i++) {
    const a0 = ang(i), a1 = ang(i + 1);
    const inGap = (a: number) => Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < gap;
    if (inGap(a0) || inGap(a1) || inGap((a0 + a1) / 2)) continue;
    fenceSegment(kit, X + Math.sin(a0) * R, Z + Math.cos(a0) * R, X + Math.sin(a1) * R, Z + Math.cos(a1) * R, Y, true);
  }
  // close the fence up to the gate posts
  for (const s of [-1, 1]) {
    const aPost = s * gap;
    const iEdge = s > 0 ? Math.ceil((gap / (Math.PI * 2)) * segs) : segs - Math.ceil((gap / (Math.PI * 2)) * segs);
    const aEdge = ang(iEdge);
    fenceSegment(kit, X + Math.sin(aPost) * R, Z + Math.cos(aPost) * R, X + Math.sin(aEdge) * R, Z + Math.cos(aEdge) * R, Y, false);
  }
  const ncol = Math.round((2 * Math.PI * R) / 0.9);
  for (let i = 0; i < ncol; i++) {
    const a = (i / ncol) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < gap + 0.004) continue;
    kit.colliders.push({ kind: 'circle', x: X + Math.sin(a) * R, z: Z + Math.cos(a) * R, r: 0.45 });
  }
  // gate arch
  const gf = new Frame(X, Y, Z + R, 0);
  for (const sx of [-GATE_HALF_WIDTH, GATE_HALF_WIDTH]) {
    box(kit.solid, gf, [0.45, 4.6, 0.45], [sx, 2.3, 0], COL.woodDark);
    box(kit.solid, gf, [0.7, 0.5, 0.7], [sx, 0.25, 0], COL.stone);
    box(kit.solid, gf, [0.6, 0.25, 0.6], [sx, 4.7, 0], COL.wood);
    kit.colliders.push({ kind: 'circle', x: X + sx, z: Z + R, r: 0.35 });
  }
  box(kit.solid, gf, [GATE_HALF_WIDTH * 2 + 1.2, 0.35, 0.4], [0, 4.35, 0], COL.wood);
  box(kit.solid, gf, [GATE_HALF_WIDTH * 2 + 0.4, 0.22, 0.3], [0, 3.85, 0], COL.woodDark);
  for (const sx of [-1.4, 1.4]) box(kit.solid, gf, [0.05, 0.5, 0.05], [sx, 3.5, 0], 0x444444);
  box(kit.solid, gf, [3.6, 0.85, 0.12], [0, 3.05, 0], COL.wood);
  addSignBoard(kit.extras, gf, signTexture(['BRAMBLEWICK'], { w: 1024, h: 240 }), 3.4, 0.78, [0, 3.05, 0], 0);
  // flowers and lanterns at the gate
  lantern(kit, X - 5, Y, Z + R + 1.2, 0);
  lantern(kit, X + 5, Y, Z + R + 1.2, 0);
  // Route 1 sign just outside
  signpost(kit, X + 5, Y, Z + R + 6, 0, [['Route 1'], ['Bramblewick']], [0, Math.PI]);

  // ---- trees + hedges in town ----
  const trees: TownResult['trees'] = [];
  const treeSpots: [string, number, number][] = [
    ['round', -40, -30], ['wide', 39, -38], ['round', 43, 30], ['tall', -42, 30], ['round', -34, 43], ['wide', 34, 45],
    ['tall', -13, -46], ['round', 17, -46], ['wide', -47, 4], ['tall', 47, 8], ['round', -24, -40], ['tall', 44, -14],
    ['round', 35, 33], ['tall', -8, 42],
  ];
  for (const [kind, lx, lz] of treeSpots) {
    const s = 0.9 + rnd() * 0.35;
    trees.push({ kind, x: X + lx, y: Y - 0.1, z: Z + lz, s });
    kit.colliders.push({ kind: 'circle', x: X + lx, z: Z + lz, r: kinds[kind].radius * s });
  }
  const hedges: TownResult['hedges'] = [];
  for (let lx = -9; lx <= 9; lx += 1.5) if (Math.abs(lx) > 3.3) hedges.push({ x: X + lx, y: Y, z: Z - 23.4, s: 0.6 + rnd() * 0.15 });
  for (const hx of [31.5, 22.5, 18, 9.5]) hedges.push({ x: X + hx, y: Y, z: Z + 16, s: 0.65 });
  for (let a = 0; a < Math.PI * 2; a += 0.11) {
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < gap + 0.12) continue;
    if (rnd() < 0.55) hedges.push({ x: X + Math.sin(a) * (R - 1.6), y: Y, z: Z + Math.cos(a) * (R - 1.6), s: 0.6 + rnd() * 0.5 });
  }

  // ---- anchors ----
  const spawnP1 = new THREE.Vector3(X + 27, Y, Z + 14.8);
  const spawnP2 = new THREE.Vector3(X + 14, Y, Z + 14.8);
  const anchors: WorldAnchors = {
    playerSpawns: [spawnP1, spawnP2],
    playerSpawnYaw: [Math.PI, Math.PI],
    professor: new THREE.Vector3(X, Y, Z - 19.6),
    professorYaw: 0,
    landmarks: [
      { id: 'p1-house', label: 'Your House', position: p1Door.setY(Y) },
      { id: 'p2-house', label: "Partner's House", position: p2Door.setY(Y) },
      { id: 'lab', label: "Hazel's Lab", position: labDoor.setY(Y) },
      { id: 'gate', label: 'Route 1', position: new THREE.Vector3(X, Y, Z + R) },
    ],
    stations: [{ kind: 'workbench', position: workbenchSpot }],
  };
  const region: Region = { name: 'Bramblewick', tier: 'small', centerX: X, centerZ: Z, radius: R + 5 };
  return { anchors, region, flowerSpots, trees, hedges, climbs, platforms };
}
