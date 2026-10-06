import * as THREE from 'three';
import { PICNICKER } from '../../shared/cookoff';
import { createAvatar } from '../player/avatar';
import type { Avatar } from '../player/types';
import type { World } from '../world/types';

let textures: { gingham: THREE.CanvasTexture; wicker: THREE.CanvasTexture; sign: THREE.CanvasTexture } | null = null;
/** The checked blanket, the basket's weave and the sign's lettering. */
function picnicTextures(): typeof textures {
  if (textures) return textures;
  if (typeof document === 'undefined') return null;
  const canvas = (w: number, hgt: number) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = hgt;
    return [c, c.getContext('2d')!] as const;
  };
  const tex = (c: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  // Red and cream gingham: the bands cross and darken where they overlap, with a woven edge.
  let [c, g] = canvas(256, 192);
  g.fillStyle = '#f4ead8';
  g.fillRect(0, 0, 256, 192);
  const band = 16;
  g.fillStyle = 'rgba(196,48,44,0.55)';
  for (let x = 0; x < 256; x += band * 2) g.fillRect(x, 0, band, 192);
  for (let y = 0; y < 192; y += band * 2) g.fillRect(0, y, 256, band);
  g.strokeStyle = 'rgba(120,30,28,0.35)';
  g.lineWidth = 1;
  for (let i = 0; i < 1400; i++) {
    const x = (i * 37) % 256, y = (i * 53) % 192;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 2, y + (i % 2 ? 0 : 2));
    g.stroke();
  }
  g.strokeStyle = '#b2302c';
  g.lineWidth = 6;
  g.strokeRect(3, 3, 250, 186);
  const gingham = tex(c);
  // Wicker: rows of woven reeds.
  [c, g] = canvas(128, 128);
  g.fillStyle = '#9b6a35';
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 8) {
    for (let x = (y / 8) % 2 ? 0 : 8; x < 128; x += 16) {
      const grad = g.createLinearGradient(x, y, x, y + 8);
      grad.addColorStop(0, '#d8a86a');
      grad.addColorStop(1, '#8a5a2b');
      g.fillStyle = grad;
      g.beginPath();
      g.roundRect(x + 1, y + 1, 14, 6, 3);
      g.fill();
    }
  }
  const wicker = tex(c);
  wicker.wrapS = wicker.wrapT = THREE.RepeatWrapping;
  // A chalk sign.
  [c, g] = canvas(256, 192);
  g.fillStyle = '#2f3a33';
  g.fillRect(0, 0, 256, 192);
  g.strokeStyle = '#8a6238';
  g.lineWidth = 14;
  g.strokeRect(0, 0, 256, 192);
  g.fillStyle = '#f2efe4';
  g.textAlign = 'center';
  g.font = 'bold 34px system-ui, sans-serif';
  g.fillText('COOK-OFF', 128, 58);
  g.font = 'bold 22px system-ui, sans-serif';
  g.fillText('Beat the champ!', 128, 98);
  g.fillStyle = '#f3c96b';
  g.font = '18px system-ui, sans-serif';
  g.fillText('Bring 3 mushrooms', 128, 138);
  g.fillText('★ 14 summers unbeaten ★', 128, 166);
  const sign = tex(c);
  textures = { gingham, wicker, sign };
  return textures;
}

/**
 * Gudrun's picnic under the lone tree (DESIGN §12.4): a checked blanket with a basket and plates,
 * a chalk sign, and a little grill with a pot on a tripod. The grill is a campfire anyone can cook
 * at. She stands behind it and turns to watch whoever comes close.
 */
export class Picnicker {
  readonly root = new THREE.Group();
  readonly name = PICNICKER.name;
  /** Where to stand to talk to her, in front of the grill. */
  readonly grill: THREE.Vector3;
  private avatar: Avatar;
  private flames: THREE.Mesh[] = [];
  private steam: THREE.Mesh[] = [];
  private t = 0;
  private yaw = PICNICKER.yaw;
  private lookYaw = PICNICKER.yaw;
  private stir = 0;

  constructor(world: World) {
    const tx = picnicTextures();
    const hAt = (x: number, z: number) => world.heightAt(x, z);
    const { x, z, yaw } = PICNICKER;
    // Local frame: +Z is the way she faces, +X to her left.
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    const at = (lx: number, lz: number) => new THREE.Vector3(x + lx * cos + lz * sin, 0, z - lx * sin + lz * cos);
    const ground = (p: THREE.Vector3, up = 0) => p.setY(hAt(p.x, p.z) + up);
    const solid = (geo: THREE.BufferGeometry, mat: THREE.Material, p: THREE.Vector3, ry = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(p);
      m.rotation.y = yaw + ry;
      m.castShadow = true;
      m.receiveShadow = true;
      this.root.add(m);
      return m;
    };

    // The blanket, draped over the slope beside her.
    const blanketAt = at(1.9, 0.6);
    const blanketGeo = new THREE.PlaneGeometry(2.5, 1.9, 10, 8);
    blanketGeo.rotateX(-Math.PI / 2);
    blanketGeo.rotateY(yaw + 0.25);
    const bp = blanketGeo.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const wx = blanketAt.x + bp.getX(i), wz = blanketAt.z + bp.getZ(i);
      // A few soft rucks in the cloth.
      bp.setY(i, hAt(wx, wz) + 0.035 + Math.max(0, Math.sin(bp.getX(i) * 3.1 + bp.getZ(i) * 1.7)) * 0.025);
    }
    blanketGeo.translate(blanketAt.x, 0, blanketAt.z);
    blanketGeo.computeVertexNormals();
    const blanket = new THREE.Mesh(blanketGeo, new THREE.MeshStandardMaterial({ color: tx ? 0xffffff : 0xd9605a, map: tx?.gingham ?? null, roughness: 0.95, side: THREE.DoubleSide }));
    blanket.receiveShadow = true;
    this.root.add(blanket);

    // A wicker basket with its lid propped open, and two plates.
    const wicker = new THREE.MeshStandardMaterial({ color: tx ? 0xffffff : 0xb07a40, map: tx?.wicker ?? null, roughness: 0.9 });
    const basketAt = ground(at(2.5, 1.1), 0.05);
    solid(new THREE.BoxGeometry(0.55, 0.32, 0.38), wicker, basketAt.clone().setY(basketAt.y + 0.16), 0.25);
    const lid = solid(new THREE.BoxGeometry(0.57, 0.04, 0.4), wicker, basketAt.clone().setY(basketAt.y + 0.36), 0.25);
    lid.rotation.order = 'YXZ';
    lid.rotation.x = -0.5;
    const handle = solid(new THREE.TorusGeometry(0.2, 0.018, 6, 14, Math.PI), new THREE.MeshStandardMaterial({ color: 0x7a4f26, roughness: 0.8 }), basketAt.clone().setY(basketAt.y + 0.32), 0.25);
    handle.rotation.order = 'YXZ';
    const cloth = solid(new THREE.BoxGeometry(0.2, 0.06, 0.3), new THREE.MeshStandardMaterial({ color: 0xc4302c, roughness: 1 }), basketAt.clone().add(new THREE.Vector3(0, 0.33, 0)), 0.6);
    cloth.rotation.z = 0.3;
    const plate = new THREE.MeshStandardMaterial({ color: 0xf6f1e6, roughness: 0.5 });
    for (const [lx, lz] of [[1.4, 0.9], [1.9, 0.1]] as const) {
      const p = ground(at(lx, lz), 0.05);
      solid(new THREE.CylinderGeometry(0.16, 0.12, 0.03, 16), plate, p);
      // A bun on each.
      solid(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshStandardMaterial({ color: 0xd99a4e, roughness: 0.7 }), p.clone().setY(p.y + 0.05)).scale.set(1, 0.7, 1);
    }

    // The chalk sign on its easel, facing the path up the hill.
    const signAt = ground(at(-1.6, 1.2));
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a5232, roughness: 0.9 });
    const board = solid(new THREE.BoxGeometry(0.72, 0.54, 0.04), [wood, wood, wood, wood, new THREE.MeshStandardMaterial({ color: tx ? 0xffffff : 0x2f3a33, map: tx?.sign ?? null, roughness: 0.95 }), wood] as unknown as THREE.Material, signAt.clone().setY(signAt.y + 0.78), -0.35);
    board.rotation.order = 'YXZ';
    board.rotation.x = -0.18;
    for (const lx of [-0.3, 0.3]) {
      const leg = solid(new THREE.BoxGeometry(0.05, 1.05, 0.05), wood, signAt.clone().add(new THREE.Vector3(Math.cos(yaw - 0.35) * lx, 0.5, -Math.sin(yaw - 0.35) * lx)), -0.35);
      leg.rotation.order = 'YXZ';
      leg.rotation.x = -0.18;
    }

    // The grill: a ring of stones, a few logs, a fire and a pot on a tripod.
    this.grill = ground(at(0, 1.25));
    const stone = new THREE.MeshStandardMaterial({ color: 0x7d7a74, roughness: 1, flatShading: true });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const s = solid(new THREE.DodecahedronGeometry(0.15, 0), stone, this.grill.clone().add(new THREE.Vector3(Math.cos(a) * 0.48, 0.07, Math.sin(a) * 0.48)), a);
      s.scale.set(1, 0.7, 1);
    }
    const logMat = new THREE.MeshStandardMaterial({ color: 0x4a2e18, roughness: 1 });
    for (let i = 0; i < 3; i++) {
      const l = solid(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6), logMat, this.grill.clone().add(new THREE.Vector3(0, 0.08, 0)), (i / 3) * Math.PI);
      l.rotation.order = 'YXZ';
      l.rotation.x = Math.PI / 2 - 0.25;
    }
    const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa23a).multiplyScalar(2.2), fog: true });
    const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe27a).multiplyScalar(2.6), fog: true });
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.17 - i * 0.04, 0.5 - i * 0.1, 7), i === 2 ? coreMat : flameMat);
      f.position.copy(this.grill).add(new THREE.Vector3((i - 1) * 0.06, 0.3, (i % 2) * 0.05));
      this.flames.push(f);
      this.root.add(f);
    }
    const iron = new THREE.MeshStandardMaterial({ color: 0x2c2c30, roughness: 0.55, metalness: 0.6 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      const leg = solid(new THREE.CylinderGeometry(0.018, 0.018, 1.25, 5), iron, this.grill.clone().add(new THREE.Vector3(Math.cos(a) * 0.3, 0.58, Math.sin(a) * 0.3)));
      leg.rotation.set(0, 0, 0);
      leg.lookAt(this.grill.clone().setY(this.grill.y + 1.6));
      leg.rotateX(Math.PI / 2);
    }
    const pot = solid(new THREE.LatheGeometry([[0.0, 0], [0.14, 0.01], [0.2, 0.06], [0.22, 0.16], [0.2, 0.26], [0.21, 0.28]].map(([r, y]) => new THREE.Vector2(r, y)), 16), iron, this.grill.clone().setY(this.grill.y + 0.52));
    pot.material = new THREE.MeshStandardMaterial({ color: 0x2c2c30, roughness: 0.55, metalness: 0.6, side: THREE.DoubleSide });
    solid(new THREE.CircleGeometry(0.19, 16).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8a5a2a, roughness: 0.4 }), this.grill.clone().setY(this.grill.y + 0.75));
    const chain = solid(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 4), iron, this.grill.clone().setY(this.grill.y + 1.05));
    chain.rotation.set(0, 0, 0);
    const steamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false, fog: true });
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), steamMat.clone());
      this.steam.push(s);
      this.root.add(s);
    }
    world.colliders.push({ kind: 'circle', x: this.grill.x, z: this.grill.z, r: 0.6 });
    world.colliders.push({ kind: 'circle', x: basketAt.x, z: basketAt.z, r: 0.35 });
    world.colliders.push({ kind: 'circle', x: signAt.x, z: signAt.z, r: 0.35 });
    world.colliders.push({ kind: 'circle', x, z, r: 0.4 });
    // Her grill is a campfire like any other: cook at it.
    world.anchors.stations = [...(world.anchors.stations ?? []), { kind: 'campfire', position: this.grill.clone() }];

    // Gudrun herself, behind the grill.
    this.avatar = createAvatar({ trainerModel: 'custom', skinTone: '#e9b48c', hairColor: '#e2c27a', hairStyle: 2, jacketColor: '#b8433a', pantsColor: '#efe3c8', build: 0 });
    this.avatar.setGround((px, pz) => hAt(px, pz));
    this.avatar.root.position.set(x, hAt(x, z), z);
    this.avatar.root.rotation.y = yaw;
    this.root.add(this.avatar.root);
  }

  get position(): THREE.Vector3 {
    return this.avatar.root.position;
  }

  /** Turn to watch a point, or back to her grill. */
  lookAt(p: THREE.Vector3 | null): void {
    this.lookYaw = p ? Math.atan2(p.x - this.position.x, p.z - this.position.z) : PICNICKER.yaw;
  }

  /** She cooks along with you: the pot steams harder and the fire flares for a while. */
  cook(seconds: number): void {
    this.stir = seconds;
  }

  update(dt: number, player: THREE.Vector3): void {
    this.t += dt;
    const far = player.distanceTo(this.position) > 150;
    this.root.visible = !far;
    if (far) return;
    this.stir = Math.max(0, this.stir - dt);
    const busy = this.stir > 0 ? 1 : 0;
    for (let i = 0; i < this.flames.length; i++) {
      const f = this.flames[i];
      const s = 1 + busy * 0.35 + Math.sin(this.t * (9 + i * 3) + i) * 0.12;
      f.scale.set(1, s, 1);
      f.rotation.y = this.t * (1.5 + i);
    }
    for (let i = 0; i < this.steam.length; i++) {
      const k = (this.t * (0.45 + busy * 0.4) + i / this.steam.length) % 1;
      const s = this.steam[i];
      s.position.copy(this.grill).add(new THREE.Vector3(Math.sin(this.t + i * 2) * 0.06, 0.82 + k * 0.9, Math.cos(this.t * 0.7 + i) * 0.06));
      s.scale.setScalar(0.6 + k * 1.6);
      (s.material as THREE.MeshBasicMaterial).opacity = (0.3 + busy * 0.15) * (1 - k);
    }
    let d = this.lookYaw - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 3);
    this.avatar.root.rotation.y = this.yaw;
    const p = this.position;
    this.avatar.animate(dt, { speed: 0, anim: 'idle', x: p.x, y: p.y, z: p.z, yaw: this.yaw });
  }

  dispose(): void {
    this.avatar.dispose();
  }
}
