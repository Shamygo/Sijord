import * as THREE from 'three';
import type { Appearance } from '../../shared/types';
import { createAvatar } from '../player/avatar';
import type { Avatar } from '../player/types';
import type { World } from '../world/types';

/** Past this distance from the player a villager isn't drawn or animated. */
const DRAW_RANGE = 140;

export type QuestMark = 'new' | 'ready' | null;

/** Who a villager is and where they stand. */
export interface VillagerDef {
  id: string;
  giver: string;
  /** Where they stand (world metres) and which way they face. */
  x: number;
  z: number;
  yaw: number;
  look: Appearance;
  /** Height against a grown-up's. */
  size?: number;
}

const marks = new Map<Exclude<QuestMark, null>, THREE.SpriteMaterial>();
/** The gold "!" over someone with a quest for you, and "?" when you can hand it in. */
function markMaterial(kind: Exclude<QuestMark, null>): THREE.SpriteMaterial {
  const have = marks.get(kind);
  if (have) return have;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.beginPath();
  g.arc(64, 64, 50, 0, Math.PI * 2);
  const grad = g.createRadialGradient(54, 50, 6, 64, 64, 52);
  grad.addColorStop(0, '#fff3b8');
  grad.addColorStop(1, '#f0b324');
  g.fillStyle = grad;
  g.fill();
  g.lineWidth = 7;
  g.strokeStyle = '#7a4f0c';
  g.stroke();
  g.fillStyle = '#5a3606';
  g.font = 'bold 72px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(kind === 'new' ? '!' : '?', 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, toneMapped: false });
  marks.set(kind, mat);
  return mat;
}

/**
 * Someone in Hearthmeadow with something for you: a side quest giver (`src/shared/sidequests.ts`)
 * or Edvin the cartographer. They stand at their spot, turn to watch a trainer who comes close,
 * and wear a "!" while they have a quest for you and a "?" when you can hand it in.
 */
export class Villager<D extends VillagerDef = VillagerDef> {
  readonly root = new THREE.Group();
  readonly name: string;
  private avatar: Avatar;
  private mark: THREE.Sprite | null = null;
  private markKind: QuestMark = null;
  private yaw: number;
  private lookYaw: number;
  private t = Math.random() * 10;

  constructor(readonly def: D, world: World) {
    this.name = def.giver;
    this.avatar = createAvatar(def.look);
    this.avatar.setGround((x, z) => world.heightAt(x, z));
    this.avatar.root.position.set(def.x, world.heightAt(def.x, def.z), def.z);
    this.yaw = this.lookYaw = def.yaw;
    this.avatar.root.rotation.y = def.yaw;
    this.avatar.root.scale.setScalar(def.size ?? 1);
    this.root.add(this.avatar.root);
    this.root.name = `villager:${def.id}`;
    world.colliders.push({ kind: 'circle', x: def.x, z: def.z, r: 0.4 });
  }

  get position(): THREE.Vector3 {
    return this.avatar.root.position;
  }

  get visible(): boolean {
    return this.root.visible;
  }

  /** Which quest mark floats over their head. */
  setMark(kind: QuestMark): void {
    if (kind === this.markKind) return;
    this.markKind = kind;
    if (!kind) {
      if (this.mark) this.mark.visible = false;
      return;
    }
    if (typeof document === 'undefined') return;
    if (!this.mark) {
      this.mark = new THREE.Sprite(markMaterial(kind));
      this.mark.renderOrder = 10;
      this.root.add(this.mark);
    }
    this.mark.material = markMaterial(kind);
    this.mark.visible = true;
  }

  get markShown(): QuestMark {
    return this.markKind;
  }

  /** Turn to watch a point, or back to where they were facing. */
  lookAt(p: THREE.Vector3 | null): void {
    this.lookYaw = p ? Math.atan2(p.x - this.position.x, p.z - this.position.z) : this.def.yaw;
  }

  update(dt: number, player: THREE.Vector3): void {
    const far = player.distanceTo(this.position) > DRAW_RANGE;
    this.root.visible = !far;
    if (far) return;
    this.t += dt;
    let d = this.lookYaw - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 3);
    this.avatar.root.rotation.y = this.yaw;
    const p = this.position;
    this.avatar.animate(dt, { speed: 0, anim: 'idle', x: p.x, y: p.y, z: p.z, yaw: this.yaw });
    if (this.mark?.visible) {
      // Bobs gently over their head.
      this.mark.position.set(p.x, p.y + 2.2 * (this.def.size ?? 1) + Math.sin(this.t * 2.2) * 0.06, p.z);
      this.mark.scale.setScalar(0.5);
    }
  }

  dispose(): void {
    this.avatar.dispose();
  }
}
