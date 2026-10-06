import * as THREE from 'three';
import { DEFECTOR } from '../../shared/defector';
import { createAvatar } from '../player/avatar';
import type { Avatar } from '../player/types';
import type { World } from '../world/types';

const BALE_R = 0.82;
const BALE_H = 1.2;
/** How far the trainer inside sits below the ground, hidden and peeking out. */
const HIDDEN_Y = -0.7;
const PEEK_Y = -0.02;

let straw: { side: THREE.CanvasTexture; top: THREE.CanvasTexture } | null = null;
/**
 * Straw for the bale's side and for its top. Both are laid out in rows: wrapped round the side
 * they're stalks rolled into the bale, and on the top (a lathe too) the rows become its coil.
 */
function strawTextures(): { side: THREE.CanvasTexture; top: THREE.CanvasTexture } | null {
  if (straw) return straw;
  if (typeof document === 'undefined') return null;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const sheet = (base: string, stalks: number, gaps: number, twine: number[]) => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = base;
    g.fillRect(0, 0, 512, 128);
    // Darker seams between the layers of straw.
    for (let i = 0; i < gaps; i++) {
      const y = (i + rnd() * 0.5) * (128 / gaps);
      g.fillStyle = `rgba(96,70,30,${0.18 + rnd() * 0.2})`;
      g.fillRect(0, y, 512, 1 + rnd() * 2);
    }
    // Stalks, mostly lying along the rows.
    for (let i = 0; i < stalks; i++) {
      const x = rnd() * 512, y = rnd() * 128, l = 6 + rnd() * 26, a = (rnd() - 0.5) * 0.45;
      const shade = 150 + Math.floor(rnd() * 95);
      g.strokeStyle = `rgba(${Math.min(255, shade + 34)},${shade},${Math.floor(shade * 0.42)},${0.35 + rnd() * 0.55})`;
      g.lineWidth = 0.8 + rnd() * 1.6;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
    // The twine that holds it together.
    for (const y of twine) {
      g.fillStyle = 'rgba(86,60,30,0.9)';
      g.fillRect(0, y, 512, 3);
      g.fillStyle = 'rgba(150,118,70,0.6)';
      g.fillRect(0, y, 512, 1);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  };
  straw = { side: sheet('#c4a052', 1800, 9, [40, 88]), top: sheet('#b99446', 1500, 14, []) };
  return straw;
}

/** A lathe from (radius, height) points, a little lumpy, as a pressed bale is. */
function baleLathe(profile: [number, number][], segments: number): THREE.LatheGeometry {
  const geo = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-4) continue;
    // Whole-number frequencies round the bale so the seam lines up.
    const a = Math.atan2(z, x);
    const k = 1 + 0.022 * Math.sin(3 * a + y * 4.1) + 0.014 * Math.sin(7 * a - y * 9) + 0.008 * Math.sin(13 * a + y * 17);
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Loose stalks: sticking out of the rim and frayed round the bottom, or (`dropped`) lying on the grass. */
function strands(dropped: boolean): THREE.InstancedMesh {
  const blade = new THREE.BoxGeometry(0.012, 0.26, 0.004);
  blade.translate(0, 0.13, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const out: { p: THREE.Vector3; e: THREE.Euler; s: number }[] = [];
  let seed = dropped ? 23 : 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < (dropped ? 0 : 46); i++) {
    // Out of the shoulder, leaning outwards.
    const a = rnd() * Math.PI * 2;
    const r = BALE_R * (0.72 + rnd() * 0.24);
    out.push({ p: new THREE.Vector3(Math.cos(a) * r, BALE_H - 0.03 - rnd() * 0.05, Math.sin(a) * r), e: new THREE.Euler(0.5 + rnd() * 0.9, -a + Math.PI / 2, (rnd() - 0.5) * 0.6, 'YXZ'), s: 0.6 + rnd() * 0.7 });
  }
  for (let i = 0; i < (dropped ? 0 : 34); i++) {
    // Frayed round the bottom.
    const a = rnd() * Math.PI * 2;
    out.push({ p: new THREE.Vector3(Math.cos(a) * BALE_R * 0.98, 0.02 + rnd() * 0.08, Math.sin(a) * BALE_R * 0.98), e: new THREE.Euler(1.1 + rnd() * 0.5, -a + Math.PI / 2, (rnd() - 0.5) * 0.8, 'YXZ'), s: 0.7 + rnd() * 0.8 });
  }
  for (let i = 0; i < (dropped ? 30 : 0); i++) {
    // Dropped on the grass.
    const a = rnd() * Math.PI * 2, r = BALE_R + 0.1 + rnd() * 0.9;
    out.push({ p: new THREE.Vector3(Math.cos(a) * r, 0.03, Math.sin(a) * r), e: new THREE.Euler(Math.PI / 2 - 0.1, rnd() * Math.PI * 2, 0, 'YXZ'), s: 0.6 + rnd() * 0.9 });
  }
  const mesh = new THREE.InstancedMesh(blade, mat, out.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
  out.forEach((o, i) => {
    mesh.setMatrixAt(i, m.compose(o.p, q.setFromEuler(o.e), new THREE.Vector3(1, o.s, 1)));
    mesh.setColorAt(i, c.setHSL(0.11 + rnd() * 0.03, 0.5 + rnd() * 0.15, 0.48 + rnd() * 0.18));
  });
  mesh.castShadow = true;
  return mesh;
}

/**
 * Sten, the Tether Defector (DESIGN §12.4), in his hay bale west of Route 1. The bale rustles
 * when a trainer comes near, and he pops his head out to talk.
 */
export class Defector {
  readonly root = new THREE.Group();
  private bale = new THREE.Group();
  private avatar: Avatar;
  private inside = new THREE.Group();
  private peek = 0;
  private peekTarget = 0;
  private rustle = 0;
  private t = 0;
  private lookYaw: number;

  constructor(world: World) {
    const tex = strawTextures();
    const side = new THREE.MeshStandardMaterial({ color: tex ? 0xffffff : 0xc4a052, map: tex?.side ?? null, roughness: 1 });
    const top = new THREE.MeshStandardMaterial({ color: tex ? 0xffffff : 0xb99446, map: tex?.top ?? null, roughness: 1 });
    // A round bale standing on end: pressed a little narrower at the foot, rounded at the shoulder.
    const body = new THREE.Mesh(baleLathe([[BALE_R * 0.93, 0], [BALE_R * 0.99, 0.06], [BALE_R * 1.02, 0.3], [BALE_R * 1.03, 0.62], [BALE_R * 1.01, 0.92], [BALE_R * 0.97, BALE_H - 0.1], [BALE_R * 0.9, BALE_H - 0.03], [BALE_R * 0.8, BALE_H]], 36), side);
    const lid = new THREE.Mesh(baleLathe([[BALE_R * 0.8, BALE_H], [BALE_R * 0.55, BALE_H + 0.025], [BALE_R * 0.25, BALE_H + 0.035], [0, BALE_H + 0.04]], 36), top);
    for (const m of [body, lid]) {
      m.castShadow = true;
      m.receiveShadow = true;
      this.bale.add(m);
    }
    this.bale.add(strands(false));
    this.root.add(strands(true));
    this.root.add(this.bale);
    this.avatar = createAvatar({ trainerModel: 'custom', skinTone: '#e9c19b', hairColor: '#4a4f57', hairStyle: 1, jacketColor: '#2c3340', pantsColor: '#23272f', build: 1 });
    this.avatar.setGround(null);
    this.inside.add(this.avatar.root);
    this.inside.position.y = HIDDEN_Y;
    this.inside.name = 'sten';
    this.root.add(this.inside);
    const y = world.heightAt(DEFECTOR.x, DEFECTOR.z);
    this.root.position.set(DEFECTOR.x, y - 0.05, DEFECTOR.z);
    this.lookYaw = DEFECTOR.yaw;
    world.colliders.push({ kind: 'circle', x: DEFECTOR.x, z: DEFECTOR.z, r: BALE_R + 0.1 });
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  /** Head out to talk (true) or back in the hay (false). */
  setPeeking(on: boolean): void {
    this.peekTarget = on ? 1 : 0;
  }

  /** A trainer walked close: the bale shivers. */
  shake(): void {
    this.rustle = 0.8;
  }

  lookAt(p: THREE.Vector3): void {
    this.lookYaw = Math.atan2(p.x - this.root.position.x, p.z - this.root.position.z);
  }

  update(dt: number, player: THREE.Vector3): void {
    this.t += dt;
    const far = player.distanceTo(this.root.position) > 120;
    this.root.visible = !far;
    if (far) return;
    this.peek += (this.peekTarget - this.peek) * Math.min(1, dt * 5);
    this.inside.position.y = HIDDEN_Y + (PEEK_Y - HIDDEN_Y) * this.peek;
    this.rustle = Math.max(0, this.rustle - dt);
    const wobble = Math.sin(this.t * 38) * 0.035 * Math.min(1, this.rustle * 2);
    this.bale.rotation.z = wobble;
    this.bale.rotation.x = wobble * 0.6;
    this.avatar.root.visible = this.peek > 0.05;
    if (!this.avatar.root.visible) return;
    let d = this.lookYaw - this.avatar.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.avatar.root.rotation.y += d * Math.min(1, dt * 4);
    this.avatar.animate(dt, { speed: 0, anim: 'idle', grounded: true });
  }

  dispose(): void {
    this.avatar.dispose();
  }
}
