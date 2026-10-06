import * as THREE from 'three';

/**
 * Hand tools the trainer swings while gathering (src/shared/gathering.ts), built from a few
 * primitives. Each is in metres with the grip at the origin, the haft along +Y and the working
 * edge (blade or points) facing +Z, the way the head travels in a swing.
 */
let materials: { wood: THREE.Material; stone: THREE.Material; cord: THREE.Material } | undefined;
const mats = () => materials ??= {
  wood: new THREE.MeshStandardMaterial({ color: 0x7a5232, roughness: 0.85 }),
  stone: new THREE.MeshStandardMaterial({ color: 0x8d8a83, roughness: 0.8, flatShading: true }),
  cord: new THREE.MeshStandardMaterial({ color: 0xb39a62, roughness: 0.95 }),
};

/** A knapped stone: a low-poly solid squashed and nudged so the facets read as chipped. */
function knapped(geo: THREE.BufferGeometry, seed: number, amount: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.getAttribute('position');
  // Displace by position, not by vertex, so faces that share a corner stay closed.
  const hash = (x: number, y: number, z: number) => {
    const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed) * 43758.5453;
    return s - Math.floor(s) - 0.5;
  };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = Math.round(x * 1000) / 1000, l = Math.round(y * 1000) / 1000, m = Math.round(z * 1000) / 1000;
    p.setXYZ(i, x + hash(k, l, m) * amount, y + hash(l, m, k) * amount, z + hash(m, k, l) * amount);
  }
  g.computeVertexNormals();
  return g;
}

function haft(length: number, butt: number): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(0.015, 0.019, length, 7);
  geo.translate(0, length / 2 - butt, 0);
  const mesh = new THREE.Mesh(geo, mats().wood);
  mesh.castShadow = true;
  return mesh;
}

function lashing(y: number, radius: number, turns: number): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < turns; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.0045, 4, 10), mats().cord);
    ring.rotation.x = Math.PI / 2;
    ring.rotation.z = (i % 2 ? 1 : -1) * 0.35;
    ring.position.y = y + (i - (turns - 1) / 2) * 0.011;
    g.add(ring);
  }
  return g;
}

function hatchet(): THREE.Group {
  const g = new THREE.Group();
  g.add(haft(0.46, 0.07));
  // A flat stone blade wedged through the haft, thick at the back and sharp at the front.
  const geo = new THREE.BoxGeometry(0.034, 0.075, 0.13, 1, 2, 3);
  const p = geo.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i), front = (z + 0.065) / 0.13;
    p.setX(i, p.getX(i) * (1 - 0.85 * front));
    p.setY(i, p.getY(i) * (1 + 0.55 * front * front));
  }
  const blade = new THREE.Mesh(knapped(geo, 3.1, 0.006), mats().stone);
  blade.position.set(0, 0.34, 0.035);
  blade.castShadow = true;
  g.add(blade, lashing(0.34, 0.024, 3));
  return g;
}

function pick(): THREE.Group {
  const g = new THREE.Group();
  g.add(haft(0.52, 0.07));
  // Two points across the top, curving down a little like a pickaxe.
  for (const side of [1, -1]) {
    const geo = new THREE.ConeGeometry(0.026, side > 0 ? 0.15 : 0.11, 6, 2);
    const point = new THREE.Mesh(knapped(geo, side * 5.3, 0.005), mats().stone);
    point.rotation.x = side * (Math.PI / 2 + 0.22);
    point.position.set(0, 0.41 - (side > 0 ? 0.012 : 0.008), side * (side > 0 ? 0.07 : 0.05));
    point.castShadow = true;
    g.add(point);
  }
  const knot = new THREE.Mesh(knapped(new THREE.IcosahedronGeometry(0.03, 0), 9.7, 0.006), mats().stone);
  knot.scale.set(0.9, 0.85, 1.2);
  knot.position.y = 0.42;
  g.add(knot, lashing(0.41, 0.027, 2));
  return g;
}

function sickle(): THREE.Group {
  const g = new THREE.Group();
  g.add(haft(0.3, 0.05));
  // A long curved flake of stone, hooked forward from the top of the handle.
  const geo = new THREE.TorusGeometry(0.1, 0.014, 4, 12, Math.PI * 1.05);
  geo.scale(1, 1, 0.45);
  geo.rotateY(Math.PI / 2);
  const blade = new THREE.Mesh(knapped(geo, 7.7, 0.004), mats().stone);
  // Centred ahead of the handle's tip, so the arc starts at the lashing and hooks forward and down.
  blade.position.set(0, 0.25, 0.1);
  blade.castShadow = true;
  g.add(blade, lashing(0.24, 0.022, 2));
  return g;
}

const BUILDERS: Record<string, () => THREE.Group> = { 'stone-hatchet': hatchet, 'stone-pick': pick, 'stone-sickle': sickle };

/** The model for a tool item, or null for items that aren't held. */
export function toolModel(id: string): THREE.Group | null {
  const build = BUILDERS[id];
  if (!build) return null;
  const g = build();
  g.name = `tool:${id}`;
  return g;
}

/**
 * Keys of the chop swing (Rei's 'chop' clip): haft pitch in degrees, 0 = straight ahead and
 * 90 = straight up. It winds up with the head hanging behind the shoulders, swings over the top
 * to strike in front, and lifts back over the top again.
 */
const CHOP_KEYS: [number, number][] = [[0, 205], [0.3, -12], [0.5, -28], [1, 205]];

/** Haft pitch at a point in the chop loop (0..1), eased like the clip's own keys. */
export function chopPitch(u: number): number {
  const f = ((u % 1) + 1) % 1;
  let k = 0;
  while (k < CHOP_KEYS.length - 2 && CHOP_KEYS[k + 1][0] <= f) k++;
  const [a0, p0] = CHOP_KEYS[k], [a1, p1] = CHOP_KEYS[k + 1];
  let t = Math.min(1, Math.max(0, (f - a0) / (a1 - a0)));
  t = t * t * (3 - 2 * t);
  return p0 + (p1 - p0) * t;
}
