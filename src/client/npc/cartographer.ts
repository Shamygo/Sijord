import * as THREE from 'three';
import { CARTOGRAPHER, TREASURE } from '../../shared/cartographer';
import { LAKE, POND, RIVER_IN, RIVER_OUT, ROAD_MAIN, TOWN } from '../world/layout';
import type { World } from '../world/types';
import { Villager } from './villager';

/** Past this distance from the player his easel and the dig spot aren't drawn. */
const DRAW_RANGE = 150;

/** World metres to pixels on his map: north up, east (-X) to the right. */
const mapX = (x: number) => 256 - x * 0.33;
const mapY = (z: number) => 206 - z * 0.27;

/**
 * The page on his easel: Hearthmeadow as Edvin imagines it. Three arches at the Old Gate, twelve
 * stones round a golden statue, a sailing ship on the lake. Each place you set him straight on
 * gets crossed out in red ink with the truth written beside it.
 */
function drawMap(g: CanvasRenderingContext2D, fixed: readonly string[]): void {
  const W = 512, H = 384;
  // Old parchment, darker at the edges, with a few stains.
  g.fillStyle = '#ead9ae';
  g.fillRect(0, 0, W, H);
  const edge = g.createRadialGradient(W / 2, H / 2, 120, W / 2, H / 2, 330);
  edge.addColorStop(0, 'rgba(160,110,50,0)');
  edge.addColorStop(1, 'rgba(140,92,40,0.45)');
  g.fillStyle = edge;
  g.fillRect(0, 0, W, H);
  for (const [x, y, r] of [[402, 72, 26], [92, 300, 18], [300, 330, 12]]) {
    g.strokeStyle = 'rgba(130,85,35,0.25)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.strokeStyle = '#6b4a22';
  g.lineWidth = 3;
  g.strokeRect(10, 10, W - 20, H - 20);
  g.lineWidth = 1;
  g.strokeRect(16, 16, W - 32, H - 32);
  const ink = '#4a3214';
  const line = (pts: readonly (readonly [number, number])[], color: string, width: number, dash: number[] = []) => {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.setLineDash(dash);
    g.beginPath();
    pts.forEach(([x, z], i) => (i ? g.lineTo(mapX(x), mapY(z)) : g.moveTo(mapX(x), mapY(z))));
    g.stroke();
    g.setLineDash([]);
  };
  const label = (text: string, x: number, y: number, size = 13, color = ink, italic = true) => {
    g.fillStyle = color;
    g.font = `${italic ? 'italic ' : ''}${size}px Georgia, 'Times New Roman', serif`;
    g.textAlign = 'center';
    g.fillText(text, x, y);
  };
  // The river, the lake and the pond.
  line(RIVER_IN, '#5d86a8', 4);
  line(RIVER_OUT, '#5d86a8', 4);
  g.fillStyle = '#9fbfd4';
  g.strokeStyle = '#5d86a8';
  g.lineWidth = 2;
  g.beginPath();
  g.ellipse(mapX(LAKE.x), mapY(LAKE.z), LAKE.rx * 0.33, LAKE.rz * 0.27, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.beginPath();
  g.arc(mapX(POND.x), mapY(POND.z), 6, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // Route 1 and the town.
  line(ROAD_MAIN.pts, '#8a6a3c', 2, [5, 4]);
  for (const [dx, dy] of [[-8, 0], [0, -5], [8, 1], [-2, 7], [7, 9]]) {
    const x = mapX(TOWN.x) + dx, y = mapY(TOWN.z) + dy;
    g.fillStyle = '#b5553a';
    g.beginPath();
    g.moveTo(x - 4, y);
    g.lineTo(x, y - 4);
    g.lineTo(x + 4, y);
    g.fill();
    g.fillStyle = '#efe2c0';
    g.fillRect(x - 3, y, 6, 4);
  }
  label('Bramblewick', mapX(TOWN.x), mapY(TOWN.z) + 26, 12, ink, false);
  // The mesas, as he remembers hearing about them.
  for (const [x, z] of [[265, 175], [165, 300], [345, 25], [410, 260]]) {
    const cx = mapX(x), cy = mapY(z);
    g.strokeStyle = '#7a5a34';
    g.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(cx - 12 + i * 2, cy + 6 - i * 3);
      g.lineTo(cx + 12 - i * 2, cy + 6 - i * 3);
      g.stroke();
    }
  }
  // His three mistakes.
  const arch = { x: mapX(62), y: mapY(-128) };
  for (let i = -1; i <= 1; i++) {
    g.strokeStyle = ink;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(arch.x + i * 13 - 5, arch.y + 6);
    g.lineTo(arch.x + i * 13 - 5, arch.y - 3);
    g.arc(arch.x + i * 13, arch.y - 3, 5, Math.PI, 0);
    g.lineTo(arch.x + i * 13 + 5, arch.y + 6);
    g.stroke();
  }
  const stones = { x: mapX(-300), y: mapY(300) };
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.fillStyle = '#6d6a63';
    g.fillRect(stones.x + Math.cos(a) * 13 - 1.5, stones.y + Math.sin(a) * 13 - 2.5, 3, 5);
  }
  g.fillStyle = '#d9a520';
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 3 : 7;
    g.lineTo(stones.x + Math.cos(a) * r, stones.y + Math.sin(a) * r);
  }
  g.fill();
  const ship = { x: mapX(-150), y: mapY(-282) };
  g.fillStyle = '#3b6fb0';
  g.beginPath();
  g.moveTo(ship.x - 12, ship.y);
  g.lineTo(ship.x + 12, ship.y);
  g.lineTo(ship.x + 8, ship.y + 6);
  g.lineTo(ship.x - 8, ship.y + 6);
  g.fill();
  g.fillStyle = '#f4ead8';
  g.beginPath();
  g.moveTo(ship.x, ship.y - 18);
  g.lineTo(ship.x + 9, ship.y - 2);
  g.lineTo(ship.x, ship.y - 2);
  g.fill();
  label('Here be Gyarados', mapX(LAKE.x), mapY(LAKE.z) + 22, 10);
  const marks: [string, string, string, number, number][] = [
    ['arch', 'The Three Arches', 'one arch!', arch.x, arch.y + 20],
    ['stones', '12 Stones & Golden Statue', 'nine. a block.', stones.x, stones.y + 28],
    ['jetty', 'Sailing Ship', 'rowing boat', ship.x + 4, ship.y - 24],
  ];
  for (const [id, wrong, truth, x, y] of marks) {
    label(wrong, x, y, 12);
    if (!fixed.includes(id)) continue;
    // Crossed out in red, the truth scrawled underneath.
    const w = g.measureText(wrong).width / 2;
    g.strokeStyle = '#b3261e';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x - w - 3, y - 4);
    g.lineTo(x + w + 3, y - 3);
    g.stroke();
    label(truth, x + 6, y + 13, 12, '#b3261e');
  }
  // Title and a compass rose.
  label('HEARTHMEADOW', W / 2, 44, 26, ink, false);
  label('as surveyed by E. Brask, cartographer', W / 2, 62, 11);
  const c = { x: 58, y: 330 };
  g.fillStyle = ink;
  g.beginPath();
  g.moveTo(c.x, c.y - 22);
  g.lineTo(c.x + 5, c.y);
  g.lineTo(c.x, c.y + 22);
  g.lineTo(c.x - 5, c.y);
  g.fill();
  g.beginPath();
  g.moveTo(c.x - 18, c.y);
  g.lineTo(c.x, c.y - 4);
  g.lineTo(c.x + 18, c.y);
  g.lineTo(c.x, c.y + 4);
  g.fill();
  label('N', c.x, c.y - 26, 12, ink, false);
}

/**
 * Edvin at his easel on a rise west of Route 1, sketching the mesas, with a satchel of rolled-up
 * maps at his feet. The page on the easel is his map of the vale, corrected as you set him straight.
 */
export class Cartographer {
  readonly root = new THREE.Group();
  readonly person: Villager;
  private props = new THREE.Group();
  private page: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture } | null = null;
  private drawn: string | null = null;

  constructor(world: World) {
    this.person = new Villager(CARTOGRAPHER, world);
    this.root.add(this.person.root, this.props);
    const { x, z, yaw } = CARTOGRAPHER;
    const hAt = (px: number, pz: number) => world.heightAt(px, pz);
    // Local frame: +Z is the way he faces, +X to his left.
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    const at = (lx: number, lz: number) => new THREE.Vector3(x + lx * cos + lz * sin, 0, z - lx * sin + lz * cos);
    const solid = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], p: THREE.Vector3, ry = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(p);
      m.rotation.order = 'YXZ';
      m.rotation.y = yaw + ry;
      m.castShadow = true;
      m.receiveShadow = true;
      this.props.add(m);
      return m;
    };
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a5d34, roughness: 0.85 });

    // The easel a step in front of him, its page turned towards him (and whoever walks up behind).
    const easel = at(0, 0.95);
    easel.y = hAt(easel.x, easel.z);
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 384;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      this.page = { canvas, tex };
    }
    const paper = new THREE.MeshStandardMaterial({ color: this.page ? 0xffffff : 0xe8d6a8, map: this.page?.tex ?? null, roughness: 0.95 });
    const back = new THREE.MeshStandardMaterial({ color: 0xd8c9a0, roughness: 1 });
    // Box faces: +x, -x, +y, -y, +z, -z. The board's -z face looks back at him.
    const board = solid(new THREE.BoxGeometry(0.96, 0.72, 0.025), [back, back, back, back, back, paper], easel.clone().setY(easel.y + 1.36));
    board.rotation.x = 0.16;
    // Two front legs splayed under the board, a back leg propping it up, and the ledge it rests on.
    for (const lx of [-0.34, 0.34]) {
      const leg = solid(new THREE.BoxGeometry(0.045, 1.8, 0.045), wood, at(lx, 0.97).setY(easel.y + 0.88));
      leg.rotation.x = 0.16;
      leg.rotation.z = lx > 0 ? 0.08 : -0.08;
    }
    const backLeg = solid(new THREE.BoxGeometry(0.04, 1.7, 0.04), wood, at(0, 1.3).setY(easel.y + 0.8));
    backLeg.rotation.x = -0.38;
    solid(new THREE.BoxGeometry(0.9, 0.04, 0.09), wood, at(0, 0.93).setY(easel.y + 0.99));
    // His satchel beside him, stuffed with rolled-up maps.
    const bag = at(-0.75, -0.1);
    bag.y = hAt(bag.x, bag.z);
    const leather = new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 0.8 });
    solid(new THREE.BoxGeometry(0.42, 0.3, 0.18), leather, bag.clone().setY(bag.y + 0.15), 0.4);
    const flap = solid(new THREE.BoxGeometry(0.43, 0.03, 0.2), leather, bag.clone().setY(bag.y + 0.3), 0.4);
    flap.rotation.x = 0.5;
    const scroll = new THREE.MeshStandardMaterial({ color: 0xe8d6a8, roughness: 0.95 });
    for (const [dx, tilt, len] of [[-0.1, 0.25, 0.62], [0.04, -0.15, 0.55], [0.13, 0.4, 0.5]] as const) {
      const s = solid(new THREE.CylinderGeometry(0.035, 0.035, len, 8), scroll, at(-0.75 + dx, -0.1).setY(bag.y + 0.32), 0.4);
      s.rotation.z = tilt;
    }
    // One that rolled away into the grass.
    const loose = solid(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8), scroll, at(-0.4, -0.55).setY(hAt(at(-0.4, -0.55).x, at(-0.4, -0.55).z) + 0.04), 1.2);
    loose.rotation.z = Math.PI / 2;
    world.colliders.push({ kind: 'circle', x: easel.x, z: easel.z, r: 0.5 });
    this.setFixed([]);
  }

  /** Redraw the page with the places you've corrected crossed out. */
  setFixed(fixed: readonly string[]): void {
    const key = [...fixed].sort().join(',');
    if (!this.page || key === this.drawn) return;
    this.drawn = key;
    drawMap(this.page.canvas.getContext('2d')!, fixed);
    this.page.tex.needsUpdate = true;
  }

  update(dt: number, player: THREE.Vector3): void {
    this.person.update(dt, player);
    this.props.visible = player.distanceTo(this.person.position) < DRAW_RANGE;
  }
}

/**
 * Where his grandmother's chest is buried: a little cairn with a faded rag on a stake, and a
 * patch of earth that's been dug and filled in long ago. Once you dig, the hole and the open
 * chest stay (in your world).
 */
export class TreasureSpot {
  readonly root = new THREE.Group();
  readonly position: THREE.Vector3;
  private filled = new THREE.Group();
  private open = new THREE.Group();
  private rag: THREE.Mesh;
  private t = 0;

  constructor(world: World) {
    const { x, z } = TREASURE;
    const hAt = (px: number, pz: number) => world.heightAt(px, pz);
    this.position = new THREE.Vector3(x, hAt(x, z), z);
    const flat = (r: number, color: number, y: number, parent: THREE.Group) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(r, 18).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
      m.position.set(x, hAt(x, z) + y, z);
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    // Disturbed earth, slightly mounded.
    flat(0.95, 0x6e5236, 0.03, this.filled);
    const mound = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x7a5c3c, roughness: 1 }));
    mound.scale.set(1, 0.22, 1);
    mound.position.set(x, hAt(x, z), z);
    mound.receiveShadow = true;
    this.filled.add(mound);
    // The cairn beside it.
    const cx = x + 1.15, cz = z + 0.35, cy = hAt(cx, cz);
    const stone = new THREE.MeshStandardMaterial({ color: 0x8d8a83, roughness: 1, flatShading: true });
    let y = cy;
    for (const [r, rot] of [[0.36, 0.2], [0.3, 1.1], [0.24, 2.3], [0.18, 0.7], [0.12, 1.9]] as const) {
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), stone);
      s.scale.set(1, 0.6, 1);
      s.position.set(cx, y + r * 0.55, cz);
      s.rotation.y = rot;
      s.castShadow = s.receiveShadow = true;
      this.root.add(s);
      y += r * 1.05;
    }
    // A weathered stake with what's left of a red rag.
    const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.4, 6), new THREE.MeshStandardMaterial({ color: 0x5c4026, roughness: 1 }));
    stake.position.set(cx - 0.25, cy + 0.7, cz - 0.35);
    stake.rotation.z = 0.12;
    stake.castShadow = true;
    this.root.add(stake);
    this.rag = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.16, 4, 1).translate(0.17, 0, 0), new THREE.MeshStandardMaterial({ color: 0xa8443a, roughness: 1, side: THREE.DoubleSide }));
    this.rag.position.set(cx - 0.17, cy + 1.3, cz - 0.35);
    this.root.add(this.rag);
    world.colliders.push({ kind: 'circle', x: cx, z: cz, r: 0.45 });
    // Dug up: a dark hole, a ring of spoil and the chest standing open beside it.
    flat(0.6, 0x2e2216, 0.035, this.open);
    const spoil = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.16, 6, 16), new THREE.MeshStandardMaterial({ color: 0x7a5c3c, roughness: 1 }));
    spoil.rotation.x = -Math.PI / 2;
    spoil.scale.set(1, 1, 0.6);
    spoil.position.set(x, hAt(x, z) + 0.04, z);
    this.open.add(spoil);
    const chestAt = new THREE.Vector3(x - 0.9, hAt(x - 0.9, z - 0.5), z - 0.5);
    const oak = new THREE.MeshStandardMaterial({ color: 0x5a3a1e, roughness: 0.9 });
    const iron = new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.6, metalness: 0.5 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.34, 0.4), oak);
    box.position.copy(chestAt).setY(chestAt.y + 0.17);
    box.rotation.y = 0.5;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.06, 0.42), oak);
    lid.position.set(0, 0.3, -0.24);
    lid.rotation.x = -1.2;
    box.add(lid);
    for (const bx of [-0.2, 0.2]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.35, 0.41), iron);
      band.position.x = bx;
      box.add(band);
    }
    box.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    this.open.add(box);
    this.root.add(this.filled, this.open);
    this.setDug(false);
  }

  setDug(dug: boolean): void {
    this.filled.visible = !dug;
    this.open.visible = dug;
  }

  update(dt: number, player: THREE.Vector3): void {
    this.root.visible = player.distanceTo(this.position) < DRAW_RANGE;
    if (!this.root.visible) return;
    this.t += dt;
    // The rag stirs in the wind.
    this.rag.rotation.y = Math.sin(this.t * 1.7) * 0.35 + 0.4;
  }
}
