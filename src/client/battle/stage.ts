import * as THREE from 'three';
import type { Pos } from '../../shared/battle/engine';
import type { MajorStatus, TypeName } from '../../shared/battle/types';
import { createCreatureModel, type CreatureModel } from '../creatures';
import type { World } from '../world/types';
import { makeArenaRing, makeArenaWall, makeBall, Particles, Projectile, TYPE_COLORS } from './fx';

export function key(p: Pos): string {
  return `${p.side}:${p.slot}`;
}

interface Slot {
  pos: Pos;
  spot: THREE.Vector3;
  yaw: number;
  model: CreatureModel | null;
  root: THREE.Group | null;
  /** Owned by the wild manager: never disposed here. */
  external: boolean;
}

interface Tween {
  t: number;
  dur: number;
  fn: (k: number) => void;
  done?: () => void;
}

/** Arena layout in metres: creatures stand close enough that a small creature still reads on screen. */
export const ARENA = {
  /** Distance from the centre to each side's line of creatures. */
  line: 2.9,
  /** Half the gap between the two creatures on a side. */
  lateral: 1.55,
  /** Distance from the centre to each trainer. */
  trainer: 5.6,
  radius: 6.6,
};

const ease = (k: number) => k * k * (3 - 2 * k);
const easeOut = (k: number) => 1 - (1 - k) * (1 - k);
const easeIn = (k: number) => k * k;
const STATUS_COLOR: Record<MajorStatus, string> = { brn: '#ff7a2e', par: '#ffd23a', psn: '#b05ce0', tox: '#8a3cc0', slp: '#9fb4d8', frz: '#8ee8ff' };

/**
 * The 3D side of a battle (DESIGN §4.2): a glowing ring forms where the encounter starts, the
 * creatures take their places inside it, and moves play out as lunges, projectiles, impacts and
 * status bursts. No screen transition: the world keeps running around the ring.
 */
export class BattleStage {
  readonly root = new THREE.Group();
  readonly particles = new Particles();
  readonly center: THREE.Vector3;
  /** Unit vector from the player's side towards the foes. */
  readonly axis: THREE.Vector3;
  readonly right: THREE.Vector3;
  readonly trainerSpot: THREE.Vector3;
  readonly trainerYaw: number;
  readonly foeTrainerSpot: THREE.Vector3;
  readonly radius = ARENA.radius;
  private ring: THREE.Mesh;
  private wall: THREE.Mesh;
  private slots = new Map<string, Slot>();
  private tweens: Tween[] = [];
  private projectiles: Projectile[] = [];
  private balls: THREE.Group[] = [];
  /** Creatures that left their slot but are still animating (fainting, being recalled). */
  private dying = new Map<THREE.Group, CreatureModel>();
  private ringFade = 0;
  private closing = false;

  constructor(private world: World, center: THREE.Vector3, axisYaw: number) {
    this.root.name = 'battle';
    this.center = new THREE.Vector3(center.x, world.heightAt(center.x, center.z), center.z);
    this.axis = new THREE.Vector3(Math.sin(axisYaw), 0, Math.cos(axisYaw));
    // Right of a direction facing (sin, cos) is (-cos, sin).
    this.right = new THREE.Vector3(-Math.cos(axisYaw), 0, Math.sin(axisYaw));
    this.trainerSpot = this.ground(this.center.clone().addScaledVector(this.axis, -ARENA.trainer).addScaledVector(this.right, 0.6));
    this.trainerYaw = axisYaw;
    this.foeTrainerSpot = this.ground(this.center.clone().addScaledVector(this.axis, ARENA.trainer + 0.2).addScaledVector(this.right, -0.6));
    this.ring = makeArenaRing(this.center, this.radius, (x, z) => world.heightAt(x, z));
    this.wall = makeArenaWall(this.center, this.radius, (x, z) => world.heightAt(x, z));
    this.root.add(this.ring, this.wall, this.particles.points);
    for (const side of [0, 1] as const) {
      for (const slot of [0, 1] as const) {
        const s = side === 0 ? -1 : 1;
        const lateral = (slot === 0 ? -1 : 1) * ARENA.lateral;
        const p = this.center.clone().addScaledVector(this.axis, s * ARENA.line).addScaledVector(this.right, lateral);
        this.slots.set(key({ side, slot }), {
          pos: { side, slot }, spot: this.ground(p), yaw: side === 0 ? axisYaw : axisYaw + Math.PI, model: null, root: null, external: false,
        });
      }
    }
  }

  private ground(p: THREE.Vector3): THREE.Vector3 {
    p.y = Math.max(this.world.heightAt(p.x, p.z), this.world.waterLevel);
    return p;
  }

  spot(p: Pos): THREE.Vector3 {
    return this.slots.get(key(p))!.spot;
  }

  model(p: Pos): CreatureModel | null {
    return this.slots.get(key(p))?.model ?? null;
  }

  /** Point to aim at on a creature (its chest). */
  focusOf(p: Pos): THREE.Vector3 {
    const s = this.slots.get(key(p))!;
    const h = s.model?.height ?? 0.6;
    const base = s.root ? s.root.position : s.spot;
    return new THREE.Vector3(base.x, base.y + h * 0.55, base.z);
  }

  /** Top of a creature's head, for info plates and damage numbers. */
  headOf(p: Pos): THREE.Vector3 {
    const s = this.slots.get(key(p))!;
    const h = s.model?.height ?? 0.6;
    const base = s.root ? s.root.position : s.spot;
    return new THREE.Vector3(base.x, base.y + h + 0.35, base.z);
  }

  occupied(p: Pos): boolean {
    return !!this.slots.get(key(p))?.root;
  }

  /** A wild creature already standing in the world steps into its place in the ring. */
  adopt(p: Pos, root: THREE.Group, model: CreatureModel): number {
    const s = this.slots.get(key(p))!;
    s.root = root;
    s.model = model;
    s.external = true;
    const from = root.position.clone();
    const fromYaw = root.rotation.y;
    const dur = 0.7;
    this.tween(dur, (k) => {
      const e = ease(k);
      root.position.lerpVectors(from, s.spot, e);
      root.position.y += Math.sin(k * Math.PI) * 0.45;
      root.rotation.y = fromYaw + wrap(s.yaw - fromYaw) * e;
    });
    return dur;
  }

  /** Throw a ball from `from` and pop a creature out at the slot. */
  sendOut(p: Pos, species: string, from: THREE.Vector3): number {
    const s = this.slots.get(key(p))!;
    this.clearSlot(p);
    const model = createCreatureModel(species);
    const root = new THREE.Group();
    root.add(model.root);
    root.position.copy(s.spot);
    root.rotation.y = s.yaw;
    root.scale.setScalar(0.001);
    root.visible = false;
    this.root.add(root);
    s.root = root;
    s.model = model;
    s.external = false;

    const ball = makeBall();
    const start = from.clone().add(new THREE.Vector3(0, 1.35, 0));
    const end = s.spot.clone().add(new THREE.Vector3(0, 0.35, 0));
    ball.position.copy(start);
    this.root.add(ball);
    this.balls.push(ball);
    const flight = 0.55;
    this.tween(flight, (k) => {
      ball.position.lerpVectors(start, end, k);
      ball.position.y += Math.sin(k * Math.PI) * 1.4;
      ball.rotation.x = k * 9;
    }, () => {
      this.root.remove(ball);
      this.particles.emit(end, 40, '#fff6d8', { speed: 4, life: 0.5, size: 0.3 });
      this.particles.emit(end, 18, '#ff6a5a', { speed: 2.5, life: 0.6, size: 0.25 });
      root.visible = true;
      model.play('happy');
      this.tween(0.4, (k) => root.scale.setScalar(Math.max(0.001, k < 0.7 ? easeOut(k / 0.7) * 1.12 : 1.12 - (k - 0.7) / 0.3 * 0.12)));
    });
    return flight + 0.55;
  }

  /** Recall into a ball: a red flash and the creature shrinks away. */
  recall(p: Pos): number {
    const s = this.slots.get(key(p))!;
    const root = s.root;
    if (!root) return 0;
    this.particles.emit(this.focusOf(p), 24, '#ff5a4a', { speed: 1.5, life: 0.5, size: 0.3 });
    const dur = 0.45;
    const external = s.external;
    const model = s.model;
    this.tween(dur, (k) => root.scale.setScalar(Math.max(0.001, 1 - easeIn(k))), () => {
      if (!external) this.drop(root, model);
    });
    s.root = null;
    s.model = null;
    return dur;
  }

  /** The attacker's move. Returns when the hit lands and when the animation is over. */
  attack(p: Pos, type: TypeName, category: 'physical' | 'special' | 'status', targets: Pos[]): { impact: number; total: number } {
    const s = this.slots.get(key(p))!;
    const color = new THREE.Color(TYPE_COLORS[type]);
    if (!s.root || !s.model) return { impact: 0, total: 0 };
    const root = s.root;
    const model = s.model;
    const self = targets.length === 1 && targets[0].side === p.side && targets[0].slot === p.slot;
    if (category === 'physical' && targets.length && !self) {
      // Lunge at the (first) target and spring back.
      model.play('attack');
      const home = s.spot.clone();
      const aim = this.spot(targets[0]);
      const dir = aim.clone().sub(home);
      const dist = dir.length();
      const reach = home.clone().addScaledVector(dir.normalize(), Math.max(0, dist - 1.1 - (this.model(targets[0])?.radius ?? 0.3)));
      const out = 0.38;
      const back = 0.42;
      this.tween(out, (k) => {
        const e = easeIn(k);
        root.position.lerpVectors(home, reach, e);
        root.position.y = this.world.heightAt(root.position.x, root.position.z) + Math.sin(k * Math.PI) * 0.35;
      }, () => {
        for (const t of targets) this.impact(t, color);
        this.tween(back, (k) => {
          const e = ease(k);
          root.position.lerpVectors(reach, home, e);
          root.position.y = this.world.heightAt(root.position.x, root.position.z) + Math.sin(k * Math.PI) * 0.25;
        });
      });
      return { impact: out, total: out + back };
    }
    model.play('special');
    const charge = 0.32;
    const from = this.focusOf(p);
    this.particles.emit(from, 20, color, { speed: 1.2, life: 0.5, size: 0.3 });
    if (self || !targets.length) {
      // Self buffs and side effects: an aura rising around the user.
      this.tween(charge, () => {}, () => this.aura(p, color));
      return { impact: charge, total: charge + 0.5 };
    }
    let flight = 0;
    for (const t of targets) {
      const to = this.focusOf(t);
      flight = Math.max(flight, Math.min(0.55, 0.18 + from.distanceTo(to) * 0.045));
    }
    this.tween(charge, () => {}, () => {
      for (const t of targets) {
        const pr = new Projectile(from, this.focusOf(t), color, flight, this.particles, category === 'status' ? 0.3 : 0.6, category === 'status' ? 0.12 : 0.2);
        this.projectiles.push(pr);
        this.root.add(pr.mesh);
      }
      this.tween(flight, () => {}, () => {
        for (const t of targets) category === 'status' ? this.aura(t, color) : this.impact(t, color);
      });
    });
    return { impact: charge + flight, total: charge + flight + 0.35 };
  }

  private impact(p: Pos, color: THREE.Color): void {
    const at = this.focusOf(p);
    this.particles.emit(at, 34, color, { speed: 5, life: 0.45, size: 0.32 });
    this.particles.emit(at, 14, '#ffffff', { speed: 3, life: 0.25, size: 0.4 });
  }

  private aura(p: Pos, color: THREE.Color): void {
    const at = this.slots.get(key(p))!.root?.position ?? this.spot(p);
    for (let i = 0; i < 4; i++) {
      this.tween(0.12 * (i + 1), () => {}, () => this.particles.emit(new THREE.Vector3(at.x, at.y + 0.1, at.z), 14, color, { speed: 1.2, up: 2.6, life: 0.8, size: 0.26, spread: 0.5, drag: 1.5 }));
    }
  }

  /** The target reacts to a hit. */
  hit(p: Pos, crit: boolean): number {
    const m = this.model(p);
    if (!m) return 0;
    const d = m.play('hit');
    if (crit) this.particles.emit(this.focusOf(p), 24, '#fff2a8', { speed: 6, life: 0.35, size: 0.35 });
    return d;
  }

  faint(p: Pos): number {
    const s = this.slots.get(key(p))!;
    if (!s.model || !s.root) return 0;
    const d = s.model.play('faint');
    const root = s.root;
    const model = s.model;
    const external = s.external;
    // Player and trainer creatures return to their ball after collapsing; wild ones stay down
    // and fade away in the wild manager.
    if (!external) {
      this.tween(d + 0.5, () => {}, () => {
        this.particles.emit(this.focusOf(p), 20, '#ff5a4a', { speed: 1.4, life: 0.5, size: 0.3 });
        this.tween(0.4, (k) => root.scale.setScalar(Math.max(0.001, 1 - k)), () => this.drop(root, model));
      });
      this.dying.set(root, model);
      s.model = null;
      s.root = null;
      return d + 0.9;
    }
    s.model = null;
    s.root = null;
    return d + 0.3;
  }

  status(p: Pos, status: MajorStatus | null): number {
    const at = this.focusOf(p);
    this.particles.emit(at, 30, status ? STATUS_COLOR[status] : '#ffffff', { speed: 2, life: 0.7, size: 0.28, up: 1 });
    return 0.5;
  }

  boost(p: Pos, up: boolean): number {
    const s = this.slots.get(key(p))!;
    const at = (s.root?.position ?? s.spot).clone();
    const color = up ? '#ffb347' : '#6fa8ff';
    for (let i = 0; i < 5; i++) {
      this.tween(0.08 * i, () => {}, () => this.particles.emit(new THREE.Vector3(at.x, at.y + (up ? 0.1 : (s.model?.height ?? 1) + 0.3), at.z), 10, color, { speed: 0.6, up: up ? 3 : -3, life: 0.6, size: 0.24, spread: 0.45, drag: 0.5 }));
    }
    return 0.6;
  }

  heal(p: Pos): number {
    this.aura(p, new THREE.Color('#7dffa0'));
    return 0.5;
  }

  /** Brief per-frame motion: tweens, projectiles, particles, creature animation. */
  update(dt: number): void {
    // Run tweens; tweens can schedule more tweens.
    const list = this.tweens;
    this.tweens = [];
    for (const tw of list) {
      tw.t += dt;
      const k = Math.min(1, tw.dur > 0 ? tw.t / tw.dur : 1);
      tw.fn(k);
      if (k >= 1) tw.done?.();
      else this.tweens.push(tw);
    }
    for (const pr of this.projectiles) pr.update(dt);
    for (const pr of this.projectiles.filter((x) => x.done)) {
      this.root.remove(pr.mesh);
      pr.dispose();
    }
    this.projectiles = this.projectiles.filter((x) => !x.done);
    for (const s of this.slots.values()) if (s.model && !s.external) s.model.update(dt, 0);
    for (const m of this.dying.values()) m.update(dt, 0);
    this.particles.update(dt);
    const mat = this.ring.material as THREE.MeshBasicMaterial;
    this.ringFade = Math.max(0, Math.min(1, this.ringFade + (this.closing ? -dt * 1.5 : dt * 1.2)));
    const pulse = 0.85 + Math.sin(performance.now() / 600) * 0.1;
    mat.opacity = this.ringFade * pulse;
    (this.wall.material as THREE.MeshBasicMaterial).opacity = this.ringFade * pulse * 0.8;
  }

  get busy(): boolean {
    return this.tweens.length > 0 || this.projectiles.length > 0;
  }

  private tween(dur: number, fn: (k: number) => void, done?: () => void): void {
    this.tweens.push({ t: 0, dur, fn, done });
  }

  private clearSlot(p: Pos): void {
    const s = this.slots.get(key(p))!;
    if (s.root && !s.external) this.drop(s.root, s.model);
    s.root = null;
    s.model = null;
    s.external = false;
  }

  private drop(root: THREE.Group, model: CreatureModel | null): void {
    this.root.remove(root);
    model?.dispose();
    this.dying.delete(root);
  }

  /** Fade the ring out; the caller removes the stage afterwards. */
  close(): void {
    this.closing = true;
  }

  dispose(): void {
    for (const s of this.slots.values()) {
      if (s.root && !s.external) {
        this.root.remove(s.root);
        s.model?.dispose();
      }
    }
    for (const [root, model] of this.dying) {
      this.root.remove(root);
      model.dispose();
    }
    for (const b of this.balls) this.root.remove(b);
    for (const pr of this.projectiles) pr.dispose();
    this.particles.dispose();
    for (const m of [this.ring, this.wall]) {
      m.geometry.dispose();
      (m.material as THREE.MeshBasicMaterial).map?.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.root.removeFromParent();
  }
}

function wrap(a: number): number {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}
