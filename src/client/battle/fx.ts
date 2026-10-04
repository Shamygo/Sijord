import * as THREE from 'three';
import type { TypeName } from '../../shared/battle/types';

/** Signature colour of each type, used for move effects and UI chips. */
export const TYPE_COLORS: Record<TypeName, string> = {
  normal: '#cfc8b4', fire: '#ff7a2e', water: '#3fa2ff', grass: '#5cc84a', electric: '#ffd23a', ice: '#8ee8ff',
  fighting: '#d8502e', poison: '#b05ce0', ground: '#d8a858', flying: '#9cb8ff', psychic: '#ff5c9a', bug: '#a8c83a',
  rock: '#bba468', ghost: '#7a62b8', dragon: '#6f5cff', dark: '#6a5a50', steel: '#a8bccc', fairy: '#ffa8e0',
};

function softDot(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number;
  size: number;
  r: number; g: number; b: number;
  drag: number;
  gravity: number;
}

/**
 * Pooled additive particles for battle effects: sparks, embers, leaves, droplets, dust. One
 * draw call; size and alpha fade over each particle's life.
 */
export class Particles {
  readonly points: THREE.Points;
  private parts: Particle[] = [];
  private geo = new THREE.BufferGeometry();
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;

  constructor(private max = 900) {
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: softDot() }, uScale: { value: 600 } },
      vertexShader: /* glsl */ `
        attribute vec4 aColor; attribute float aSize; varying vec4 vColor; uniform float uScale;
        void main() {
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; varying vec4 vColor;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(vColor.rgb * t.rgb, vColor.a * t.a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  emit(
    at: THREE.Vector3,
    count: number,
    color: THREE.ColorRepresentation,
    opts: { speed?: number; up?: number; spread?: number; life?: number; size?: number; drag?: number; gravity?: number; dir?: THREE.Vector3 } = {},
  ): void {
    const c = new THREE.Color(color);
    const speed = opts.speed ?? 3;
    const spread = opts.spread ?? 0.2;
    for (let i = 0; i < count; i++) {
      if (this.parts.length >= this.max) this.parts.shift();
      let vx = (Math.random() * 2 - 1);
      let vy = (Math.random() * 2 - 1);
      let vz = (Math.random() * 2 - 1);
      const l = Math.hypot(vx, vy, vz) || 1;
      vx /= l; vy /= l; vz /= l;
      if (opts.dir) {
        vx = vx * 0.35 + opts.dir.x;
        vy = vy * 0.35 + opts.dir.y;
        vz = vz * 0.35 + opts.dir.z;
      }
      const s = speed * (0.4 + Math.random() * 0.8);
      const life = (opts.life ?? 0.7) * (0.6 + Math.random() * 0.6);
      this.parts.push({
        x: at.x + (Math.random() * 2 - 1) * spread,
        y: at.y + (Math.random() * 2 - 1) * spread,
        z: at.z + (Math.random() * 2 - 1) * spread,
        vx: vx * s, vy: vy * s + (opts.up ?? 0), vz: vz * s,
        life, max: life,
        size: (opts.size ?? 0.35) * (0.6 + Math.random() * 0.8),
        r: c.r, g: c.g, b: c.b,
        drag: opts.drag ?? 2.5,
        gravity: opts.gravity ?? 0,
      });
    }
  }

  update(dt: number): void {
    let n = 0;
    const keep: Particle[] = [];
    for (const p of this.parts) {
      p.life -= dt;
      if (p.life <= 0) continue;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy = p.vy * k - p.gravity * dt; p.vz *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      keep.push(p);
      const f = p.life / p.max;
      this.pos[n * 3] = p.x; this.pos[n * 3 + 1] = p.y; this.pos[n * 3 + 2] = p.z;
      this.col[n * 4] = p.r; this.col[n * 4 + 1] = p.g; this.col[n * 4 + 2] = p.b; this.col[n * 4 + 3] = Math.min(1, f * 1.6);
      this.size[n] = p.size * (0.5 + 0.5 * f);
      n++;
    }
    this.parts = keep;
    this.geo.setDrawRange(0, n);
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
  }

  clear(): void {
    this.parts = [];
    this.geo.setDrawRange(0, 0);
  }

  dispose(): void {
    this.geo.dispose();
    (this.points.material as THREE.ShaderMaterial).dispose();
  }
}

/** A glowing orb flying from one point to another along an arc, trailing particles. */
export class Projectile {
  readonly mesh: THREE.Mesh;
  private t = 0;
  done = false;

  constructor(
    private from: THREE.Vector3,
    private to: THREE.Vector3,
    private color: THREE.Color,
    private duration: number,
    private particles: Particles,
    private arc = 0.8,
    size = 0.22,
  ) {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(size, 16, 12),
      new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(1.6), transparent: true, opacity: 0.95 }),
    );
    this.mesh.position.copy(from);
  }

  update(dt: number): void {
    if (this.done) return;
    this.t = Math.min(1, this.t + dt / this.duration);
    const p = this.mesh.position;
    p.lerpVectors(this.from, this.to, this.t);
    p.y += Math.sin(this.t * Math.PI) * this.arc;
    this.mesh.scale.setScalar(0.8 + Math.sin(this.t * 40) * 0.12);
    this.particles.emit(p, 3, this.color, { speed: 0.6, life: 0.35, size: 0.28, spread: 0.08 });
    if (this.t >= 1) this.done = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/**
 * The battle circle on the ground: a soft, glowing ring that follows the terrain, like a chalk
 * line in the grass. Built as a polar mesh so it drapes over slopes.
 */
export function makeArenaRing(center: THREE.Vector3, radius: number, heightAt: (x: number, z: number) => number): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 16;
  const g = c.getContext('2d')!;
  // u = radius fraction (0 centre .. 1 edge); v unused.
  const grad = g.createLinearGradient(0, 0, 512, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.72, 'rgba(255,248,220,0.05)');
  grad.addColorStop(0.9, 'rgba(255,240,200,0.35)');
  grad.addColorStop(0.955, 'rgba(255,255,245,0.95)');
  grad.addColorStop(0.985, 'rgba(255,240,200,0.4)');
  grad.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 16);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;

  const rings = 18;
  const segs = 72;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let r = 0; r <= rings; r++) {
    const f = r / rings;
    // Pack rings towards the edge where the detail is.
    const rr = radius * (0.55 + 0.45 * f) * (r === 0 ? 0 : 1);
    for (let s = 0; s <= segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const x = center.x + Math.cos(a) * rr;
      const z = center.z + Math.sin(a) * rr;
      pos.push(x - center.x, heightAt(x, z) + 0.06 - center.y, z - center.z);
      uv.push(rr / radius, s / segs);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segs; s++) {
      const a = r * (segs + 1) + s;
      const b = a + segs + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, fog: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(center);
  mesh.renderOrder = 2;
  return mesh;
}

/**
 * A low curtain of light standing on the ring's edge, fading upwards: it reads as the arena's
 * boundary even in tall grass that hides the ground line.
 */
export function makeArenaWall(center: THREE.Vector3, radius: number, heightAt: (x: number, z: number) => number, height = 0.9): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 128;
  const g = c.getContext('2d')!;
  // v = 0 at the bottom of the canvas texture's flipped space: draw bright at the bottom row.
  const grad = g.createLinearGradient(0, 128, 0, 0);
  grad.addColorStop(0, 'rgba(255,246,214,0.55)');
  grad.addColorStop(0.25, 'rgba(255,240,200,0.28)');
  grad.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const segs = 96;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let s = 0; s <= segs; s++) {
    const a = (s / segs) * Math.PI * 2;
    const x = center.x + Math.cos(a) * radius;
    const z = center.z + Math.sin(a) * radius;
    const y = heightAt(x, z) - center.y;
    pos.push(x - center.x, y, z - center.z, x - center.x, y + height, z - center.z);
    uv.push(s / segs, 0, s / segs, 1);
  }
  for (let s = 0; s < segs; s++) {
    const a = s * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(center);
  mesh.renderOrder = 3;
  return mesh;
}

/** A red-and-white ball for throws and recalls. */
export function makeBall(): THREE.Group {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.11, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe8392f, roughness: 0.35 }));
  const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.11, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf6f3ee, roughness: 0.4 }));
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.012, 6, 24), new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.5 }));
  band.rotation.x = Math.PI / 2;
  const button = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
  button.rotation.x = Math.PI / 2;
  button.position.z = 0.108;
  g.add(top, bottom, band, button);
  return g;
}
