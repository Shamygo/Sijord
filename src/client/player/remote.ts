import * as THREE from 'three';
import type { Appearance, MoveAnim, PlayerProfile, PlayerSnapshot } from '../../shared/types';
import { createAvatar } from './avatar';
import type { Avatar, GroundFn } from './types';

/** Interpolation tunables for remote players. */
export const REMOTE_TUNING = {
  /** Render this far in the past so there are two snapshots to blend between. */
  interpDelayMs: 100,
  /** Keep extrapolating along the last velocity for at most this long when packets stop. */
  maxExtrapolateMs: 250,
  /** Final visual smoothing on position / yaw (1/s). */
  posSmooth: 18,
  yawSmooth: 14,
  /** Distance beyond which we snap instead of smoothing (teleports). */
  snapDistance: 8,
  bufferSize: 24,
  nameTagHeight: 2.08,
};

interface Sample {
  t: number;
  s: PlayerSnapshot;
}

function wrapAngle(a: number): number {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}
function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * t;
}

function makeNameTag(name: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = '600 40px system-ui, -apple-system, "Segoe UI", sans-serif';
  const padX = 26;
  const h = 64;
  let w = 256;
  if (ctx) {
    ctx.font = font;
    w = Math.ceil(Math.min(600, ctx.measureText(name).width + padX * 2));
  }
  canvas.width = w;
  canvas.height = h;
  if (ctx) {
    const r = h / 2;
    ctx.fillStyle = 'rgba(18, 22, 32, 0.62)';
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(w - r, 0);
    ctx.arc(w - r, r, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(r, h);
    ctx.arc(r, r, r, Math.PI / 2, (Math.PI * 3) / 2);
    ctx.closePath();
    ctx.fill();
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(name, w / 2, h / 2 + 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  const worldH = 0.26;
  sprite.scale.set((worldH * w) / h, worldH, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/**
 * The co-op partner: an avatar driven by network snapshots, rendered ~100 ms in the past with
 * interpolation (and brief extrapolation if packets stop), plus a floating name tag.
 */
export class RemotePlayer {
  readonly root = new THREE.Group();
  readonly avatar: Avatar;
  private nameTag: THREE.Sprite;
  private name: string;
  private readonly buffer: Sample[] = [];
  private readonly displayPos = new THREE.Vector3();
  private displayYaw = 0;
  private hasState = false;
  private anim: MoveAnim = 'idle';
  private speed = 0;
  private tired = false;
  private readonly tmp = new THREE.Vector3();

  constructor(profile: PlayerProfile | { name: string; appearance: Appearance }) {
    this.name = profile.name;
    this.avatar = createAvatar(profile.appearance);
    this.root.add(this.avatar.root);
    this.nameTag = makeNameTag(this.name);
    this.nameTag.position.y = REMOTE_TUNING.nameTagHeight;
    this.root.add(this.nameTag);
    this.root.visible = false;
  }

  /** World position currently rendered. */
  get position(): THREE.Vector3 {
    return this.root.position;
  }

  setName(name: string): void {
    if (name === this.name) return;
    this.name = name;
    this.root.remove(this.nameTag);
    disposeSprite(this.nameTag);
    this.nameTag = makeNameTag(name);
    this.nameTag.position.y = REMOTE_TUNING.nameTagHeight;
    this.root.add(this.nameTag);
  }

  setAppearance(a: Appearance): void {
    this.avatar.setAppearance(a);
  }

  /** Queue a snapshot received at local time `timeMs` (e.g. performance.now()). */
  push(s: PlayerSnapshot, timeMs: number): void {
    const last = this.buffer[this.buffer.length - 1];
    // Keep timestamps strictly increasing even if two packets land in the same millisecond.
    const t = last && timeMs <= last.t ? last.t + 1 : timeMs;
    this.buffer.push({ t, s: { ...s } });
    if (this.buffer.length > REMOTE_TUNING.bufferSize) this.buffer.shift();
    if (!this.hasState) {
      this.hasState = true;
      this.displayPos.set(s.x, s.y, s.z);
      this.displayYaw = s.yaw;
      this.root.visible = true;
      this.apply();
    }
  }

  update(dt: number, nowMs: number): void {
    if (!this.hasState || this.buffer.length === 0) return;
    const T = REMOTE_TUNING;
    const renderT = nowMs - T.interpDelayMs;
    const buf = this.buffer;

    // Drop samples we no longer need (keep one before renderT).
    while (buf.length > 2 && buf[1].t <= renderT) buf.shift();

    const target = this.tmp;
    let yaw: number;
    const a = buf[0];
    const b = buf[1];
    if (!b || renderT <= a.t) {
      // Only one sample, or render time before it: hold.
      target.set(a.s.x, a.s.y, a.s.z);
      yaw = a.s.yaw;
      this.speed = a.s.speed;
      this.anim = a.s.anim;
      this.tired = isTired(a.s);
    } else if (renderT <= b.t) {
      const k = (renderT - a.t) / (b.t - a.t);
      target.set(a.s.x + (b.s.x - a.s.x) * k, a.s.y + (b.s.y - a.s.y) * k, a.s.z + (b.s.z - a.s.z) * k);
      yaw = lerpAngle(a.s.yaw, b.s.yaw, k);
      this.speed = a.s.speed + (b.s.speed - a.s.speed) * k;
      this.anim = k < 0.5 ? a.s.anim : b.s.anim;
      this.tired = isTired(k < 0.5 ? a.s : b.s);
    } else {
      // Past the newest sample: extrapolate briefly along the last velocity, then hold.
      const span = Math.max(1, b.t - a.t);
      const over = Math.min(renderT - b.t, T.maxExtrapolateMs);
      const k = over / span;
      target.set(b.s.x + (b.s.x - a.s.x) * k, b.s.y + (b.s.y - a.s.y) * k, b.s.z + (b.s.z - a.s.z) * k);
      yaw = b.s.yaw;
      this.anim = b.s.anim;
      this.tired = isTired(b.s);
      // Ease the animation speed down once we've stopped hearing from them.
      const stale = Math.min(1, (renderT - b.t) / T.maxExtrapolateMs);
      this.speed = b.s.speed * (1 - 0.6 * stale);
      if (renderT - b.t > T.maxExtrapolateMs && this.anim !== 'jump' && this.anim !== 'fall') {
        this.speed = 0;
        if(this.anim !== 'climb')this.anim = 'idle';
      }
    }

    if (this.displayPos.distanceTo(target) > T.snapDistance) {
      this.displayPos.copy(target);
      this.displayYaw = yaw;
    } else {
      const kp = 1 - Math.exp(-T.posSmooth * dt);
      this.displayPos.lerp(target, kp);
      this.displayYaw = lerpAngle(this.displayYaw, yaw, 1 - Math.exp(-T.yawSmooth * dt));
    }
    this.apply();
    // World position + yaw let the avatar plant its feet, lean into turns and detect jumps.
    this.avatar.animate(dt, {
      speed: this.speed,
      anim: this.anim,
      x: this.displayPos.x,
      y: this.displayPos.y,
      z: this.displayPos.z,
      yaw: this.displayYaw,
      tired: this.tired,
    });
  }

  /** Terrain height function so the partner's feet sit exactly on slopes. Optional. */
  setGround(fn: GroundFn | null): void {
    this.avatar.setGround(fn);
  }

  private apply(): void {
    this.root.position.copy(this.displayPos);
    this.avatar.root.rotation.y = this.displayYaw;
  }

  dispose(): void {
    this.avatar.dispose();
    disposeSprite(this.nameTag);
    this.root.clear();
  }
}

/** Snapshots may carry the controller's optional `tired` animation hint. */
function isTired(s: PlayerSnapshot): boolean {
  return (s as PlayerSnapshot & { tired?: unknown }).tired === true;
}

function disposeSprite(s: THREE.Sprite): void {
  s.material.map?.dispose();
  s.material.dispose();
}
