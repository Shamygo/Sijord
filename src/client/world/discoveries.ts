import * as THREE from 'three';
import { GeoBuilder, mats } from './shared';
import { Frame, box, cyl } from './buildings';
import type { World } from './types';
import { DISCOVERIES, type Discovery } from '../../shared/discoveries';
import { resolveCircle } from '../core/collision';
import { mulberry32 } from './noise';

/**
 * The props for Hearthmeadow's discoveries (`src/shared/discoveries.ts`): wooden supply caches
 * whose lids open, carved Lysfolk tablets whose glyphs glow until read, and field notes pinned to
 * stakes. Unfound caches and notes twinkle so they can be spotted from a distance.
 */
export interface DiscoverySpot {
  def: Discovery;
  x: number;
  y: number;
  z: number;
  found: boolean;
  root: THREE.Group;
  lid?: THREE.Object3D;
  paper?: THREE.Object3D;
  glyphs?: THREE.Mesh;
  sparkle?: THREE.Sprite;
  /** Seconds since it was opened, for the lid swing. */
  openT: number;
}

const WOOD = 0x9a6234;
const WOOD_DARK = 0x6a4022;
const IRON = 0x45403b;
const BRASS = 0xc9a24a;
const STONE = 0xb9b2a4;
const STONE_DARK = 0x8f887b;
const MOSS = 0x6fae3c;
const LID_OPEN = -1.95;
/** How close the trainer has to be to use one. */
const REACH = 2.1;
const SHOW_WITHIN = 170;

const glyphLit = new THREE.MeshStandardMaterial({ color: 0xa8ecff, emissive: new THREE.Color(0x58d6ff), emissiveIntensity: 1.7, roughness: 0.5 });
const glyphDim = new THREE.MeshStandardMaterial({ color: 0x6d6a62, emissive: new THREE.Color(0x58d6ff), emissiveIntensity: 0.1, roughness: 0.85 });

let sparkleTex: THREE.Texture | null = null;
function sparkleTexture(): THREE.Texture {
  if (sparkleTex) return sparkleTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.18, 'rgba(255,244,200,0.85)');
  r.addColorStop(0.5, 'rgba(255,214,120,0.18)');
  r.addColorStop(1, 'rgba(255,200,90,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  // a four-point glint
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.fillRect(31, 4, 2, 56);
  g.fillRect(4, 31, 56, 2);
  sparkleTex = new THREE.CanvasTexture(c);
  sparkleTex.colorSpace = THREE.SRGBColorSpace;
  return sparkleTex;
}

function mesh(b: GeoBuilder, material: THREE.Material = mats.vc): THREE.Mesh {
  const m = new THREE.Mesh(b.build(), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** A banded wooden chest; the lid is its own object, hinged at the back. */
function buildCache(spot: DiscoverySpot): void {
  const f = new Frame(0, 0, 0, 0);
  const body = new GeoBuilder();
  const W = 0.92, H = 0.46, D = 0.6;
  box(body, f, [W, H, D], [0, H / 2, 0], WOOD);
  // plank seams and a darker base rail
  for (const y of [0.16, 0.31]) for (const z of [D / 2 + 0.004, -D / 2 - 0.004]) box(body, f, [W - 0.02, 0.018, 0.012], [0, y, z], WOOD_DARK);
  box(body, f, [W + 0.04, 0.07, D + 0.04], [0, 0.035, 0], WOOD_DARK);
  // iron bands round the sides and brass corners
  for (const x of [-W / 2 + 0.16, W / 2 - 0.16]) box(body, f, [0.07, H + 0.01, D + 0.02], [x, H / 2, 0], IRON);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(body, f, [0.09, H + 0.02, 0.09], [sx * (W / 2 - 0.035), H / 2, sz * (D / 2 - 0.035)], BRASS);
  // packing straw, seen when the lid is up
  box(body, f, [W - 0.1, 0.012, D - 0.1], [0, H + 0.004, 0], 0xd9b85c);
  // lock plate
  box(body, f, [0.16, 0.14, 0.03], [0, H - 0.07, D / 2 + 0.012], BRASS);
  box(body, f, [0.04, 0.06, 0.035], [0, H - 0.09, D / 2 + 0.02], IRON);
  const base = mesh(body);

  const lidB = new GeoBuilder();
  const R = D / 2;
  const half = new THREE.CylinderGeometry(R, R, W, 14, 1, false, 0, Math.PI);
  // The half-cylinder lid: axis along X, curved side up, front edge at +Z of the hinge.
  lidB.add(half, WOOD, [0, 0, R], [0, 0, Math.PI / 2]);
  // the underside, seen once it swings open
  lidB.add(new THREE.BoxGeometry(W - 0.01, 0.02, D - 0.01), WOOD_DARK, [0, 0.012, R]);
  for (const x of [-W / 2 + 0.16, W / 2 - 0.16]) lidB.add(new THREE.CylinderGeometry(R + 0.012, R + 0.012, 0.07, 14, 1, false, 0, Math.PI), IRON, [x, 0, R], [0, 0, Math.PI / 2]);
  // the Poke Ball roundel on the front of the lid: a supplies crate from the lab
  // Sits on the lid where its surface faces (0, 0.6, 0.8); red half towards the top.
  const tilt = Math.atan2(0.8, 0.6), at: [number, number, number] = [0, R * 0.6 + 0.008, R + R * 0.8 + 0.01];
  lidB.add(new THREE.CylinderGeometry(0.085, 0.085, 0.02, 16, 1, false, Math.PI / 2, Math.PI), 0xd8362f, at, [tilt, 0, 0]);
  lidB.add(new THREE.CylinderGeometry(0.085, 0.085, 0.02, 16, 1, false, -Math.PI / 2, Math.PI), 0xf5f2ea, at, [tilt, 0, 0]);
  lidB.add(new THREE.BoxGeometry(0.172, 0.024, 0.016), 0x262222, at, [tilt, 0, 0]);
  lidB.add(new THREE.CylinderGeometry(0.032, 0.032, 0.03, 12), 0x262222, at, [tilt, 0, 0]);
  lidB.add(new THREE.CylinderGeometry(0.018, 0.018, 0.034, 10), 0xf5f2ea, at, [tilt, 0, 0]);
  const lid = new THREE.Group();
  lid.position.set(0, H, -R);
  lid.add(mesh(lidB));
  spot.root.add(base, lid);
  spot.lid = lid;
}

/** An upright Lysfolk stone with an arched top, rune carvings and moss. */
function buildTablet(spot: DiscoverySpot): void {
  const f = new Frame(0, 0, 0, 0);
  const rnd = mulberry32(spot.def.id.length * 977 + Math.round(spot.x * 13 + spot.z * 7));
  const stone = new GeoBuilder();
  box(stone, f, [1.5, 0.22, 0.75], [0, 0.07, 0], STONE_DARK);
  box(stone, f, [1.25, 0.16, 0.56], [0, 0.24, 0], STONE);
  const W = 1.0, H = 1.2, T = 0.26;
  box(stone, f, [W, H, T], [0, 0.32 + H / 2, 0], STONE);
  stone.add(new THREE.CylinderGeometry(W / 2, W / 2, T, 16, 1, false, -Math.PI / 2, Math.PI), STONE, [0, 0.32 + H, 0], [-Math.PI / 2, 0, 0]);
  // a raised border on the face
  for (const sx of [-1, 1]) box(stone, f, [0.07, H - 0.1, 0.04], [sx * (W / 2 - 0.09), 0.32 + H / 2, T / 2 + 0.01], STONE_DARK);
  // moss on the top and the plinth
  stone.add(new THREE.SphereGeometry(0.26, 8, 6), MOSS, [-0.2, 0.32 + H + 0.45, 0.02], [0, 0, 0], [1, 0.32, 0.6]);
  stone.add(new THREE.SphereGeometry(0.3, 8, 6), MOSS, [0.5, 0.2, 0.22], [0, 0, 0], [1, 0.35, 0.7]);
  // a sun ring over the runes: the Lysfolk mark
  const ring = new THREE.TorusGeometry(0.19, 0.025, 6, 20);
  const glyph = new GeoBuilder();
  glyph.add(ring, 0xffffff, [0, 0.32 + H + 0.08, T / 2 + 0.012]);
  glyph.add(new THREE.CircleGeometry(0.06, 12), 0xffffff, [0, 0.32 + H + 0.08, T / 2 + 0.015]);
  // four rows of runes: a stave with a couple of branches each
  for (let row = 0; row < 4; row++) {
    const y = 0.32 + H - 0.2 - row * 0.24;
    for (let col = 0; col < 4; col++) {
      const x = -0.28 + col * 0.19;
      box(glyph, f, [0.022, 0.16, 0.012], [x, y, T / 2 + 0.012], 0xffffff);
      const branches = 1 + Math.floor(rnd() * 2);
      for (let b = 0; b < branches; b++) {
        const up = rnd() < 0.5 ? 1 : -1, side = rnd() < 0.5 ? 1 : -1;
        box(glyph, f, [0.09, 0.02, 0.012], [x + side * 0.035, y + up * (0.02 + rnd() * 0.05), T / 2 + 0.012], 0xffffff, [0, 0, side * up * 0.7]);
      }
    }
  }
  const glyphs = new THREE.Mesh(glyph.build(), spot.found ? glyphDim : glyphLit);
  spot.root.add(mesh(stone), glyphs);
  spot.glyphs = glyphs;
}

/** A page pinned to a leaning stake, with a red ribbon. */
function buildNote(spot: DiscoverySpot): void {
  const f = new Frame(0, 0, 0, 0);
  const stake = new GeoBuilder();
  cyl(stake, f, 0.045, 0.035, 1.15, [0, 0.52, 0], WOOD_DARK, 7, [0.06, 0, 0]);
  stake.add(new THREE.ConeGeometry(0.04, 0.08, 7), WOOD_DARK, [0, 1.12, 0.035]);
  box(stake, f, [0.03, 0.18, 0.012], [0.05, 0.86, 0.06], 0xc8382e, [0, 0, 0.3]);
  const paperB = new GeoBuilder();
  // the page hangs from its top edge so it can flutter
  paperB.add(new THREE.PlaneGeometry(0.26, 0.34), 0xf4ecd8, [0, -0.17, 0]);
  paperB.add(new THREE.PlaneGeometry(0.26, 0.34), 0xe8dfc8, [0, -0.17, -0.001], [0, Math.PI, 0]);
  paperB.add(new THREE.PlaneGeometry(0.2, 0.012), 0x5b5148, [0, -0.09, 0.002]);
  paperB.add(new THREE.PlaneGeometry(0.18, 0.012), 0x5b5148, [0, -0.13, 0.002]);
  paperB.add(new THREE.PlaneGeometry(0.2, 0.012), 0x5b5148, [0, -0.17, 0.002]);
  paperB.add(new THREE.PlaneGeometry(0.12, 0.012), 0x5b5148, [0, -0.21, 0.002]);
  const paper = new THREE.Group();
  paper.position.set(0, 1.0, 0.075);
  paper.add(mesh(paperB));
  spot.root.add(mesh(stake), paper);
  spot.paper = paper;
}

export class DiscoveryProps {
  readonly root = new THREE.Group();
  readonly spots: DiscoverySpot[] = [];

  constructor(world: World, found: Iterable<string>) {
    this.root.name = 'discoveries';
    const have = new Set(found);
    for (const def of DISCOVERIES) {
      let x = def.x, z = def.z;
      let y = def.onTop ? world.surfaceHeightAt?.(x, z, 1e4) ?? world.heightAt(x, z) : world.heightAt(x, z);
      if (!def.onTop) {
        // Keep clear of trees and stones that scattered onto the spot.
        const p = resolveCircle(x, z, 0.8, world.colliders, y);
        x = p.x; z = p.z; y = world.heightAt(x, z);
      }
      const root = new THREE.Group();
      root.position.set(x, y - 0.02, z);
      root.rotation.y = def.yaw ?? 0;
      const spot: DiscoverySpot = { def, x, y, z, found: have.has(def.id), root, openT: 0 };
      if (def.kind === 'cache') buildCache(spot);
      else if (def.kind === 'tablet') buildTablet(spot);
      else buildNote(spot);
      if (def.kind !== 'tablet') {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkleTexture(), color: def.kind === 'cache' ? 0xffe7a8 : 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
        s.position.set(0, def.kind === 'cache' ? 0.95 : 1.35, 0);
        s.scale.setScalar(0.5);
        s.renderOrder = 2;
        root.add(s);
        spot.sparkle = s;
      }
      // Solid to walk into, but low enough to step past once you're above it.
      if (def.kind === 'cache') world.colliders.push({ kind: 'circle', x, z, r: 0.5, maxY: y + 0.75 });
      else if (def.kind === 'tablet') world.colliders.push({ kind: 'obox', x, z, hw: 0.62, hd: 0.3, yaw: def.yaw ?? 0, maxY: y + 1.9 });
      this.setFound(spot, spot.found, false);
      this.root.add(root);
      this.spots.push(spot);
    }
  }

  /** The closest unfound discovery within reach of the trainer's feet. */
  nearest(pos: THREE.Vector3): DiscoverySpot | null {
    let best: DiscoverySpot | null = null, bestD = REACH;
    for (const s of this.spots) {
      if (s.found || Math.abs(pos.y - s.y) > 1.8) continue;
      const d = Math.hypot(pos.x - s.x, pos.z - s.z);
      if (d < bestD) { best = s; bestD = d; }
    }
    return best;
  }

  markFound(id: string): void {
    const s = this.spots.find((p) => p.def.id === id);
    if (s && !s.found) this.setFound(s, true, true);
  }

  private setFound(s: DiscoverySpot, found: boolean, animate: boolean): void {
    s.found = found;
    if (s.glyphs) s.glyphs.material = found ? glyphDim : glyphLit;
    if (s.paper) s.paper.visible = !found;
    if (s.lid) s.lid.rotation.x = found && !animate ? LID_OPEN : 0;
    s.openT = found && animate ? 0.0001 : 0;
    if (s.sparkle) s.sparkle.visible = !found;
  }

  update(dt: number, elapsed: number, focus: THREE.Vector3): void {
    for (const s of this.spots) {
      const near = Math.hypot(focus.x - s.x, focus.z - s.z) < SHOW_WITHIN;
      s.root.visible = near;
      if (!near) continue;
      if (s.lid && s.openT > 0) {
        s.openT += dt;
        const k = Math.min(1, s.openT / 0.55);
        s.lid.rotation.x = LID_OPEN * (1 - (1 - k) ** 3) + Math.sin(k * Math.PI) * 0.08;
        if (k >= 1) s.openT = 0;
      }
      if (s.sparkle?.visible) {
        const ph = elapsed * 2.1 + s.x * 0.37;
        const glint = Math.max(0, Math.sin(elapsed * 0.9 + s.z)) ** 24;
        s.sparkle.scale.setScalar(0.32 + 0.08 * Math.sin(ph) + glint * 0.9);
        s.sparkle.material.opacity = 0.65 + 0.25 * Math.sin(ph * 1.3) + glint * 0.1;
      }
      if (s.paper?.visible) s.paper.rotation.x = -0.12 + Math.sin(elapsed * 3.1 + s.x) * 0.1 + Math.sin(elapsed * 7.3 + s.z) * 0.035;
    }
  }
}
