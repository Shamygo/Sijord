import * as THREE from 'three';
import { LANTERN } from '../../shared/lantern';

/** Where the lantern hooks onto the belt, in the trainer's frame (+Z ahead, +X their left). */
const HOOK = new THREE.Vector3(0.25, 0.95, -0.03);
const UP = new THREE.Vector3(0, 1, 0);
/** How far below the hook the flame hangs (the model's glass, at its scale). */
const FLAME = 0.142 * 1.3;

let shared: { copper: THREE.Material; dark: THREE.Material; glass: THREE.MeshStandardMaterial } | undefined;
const mats = () => shared ??= {
  copper: new THREE.MeshStandardMaterial({ color: 0xc8804a, roughness: 0.4, metalness: 0.55 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x3b2a20, roughness: 0.7, metalness: 0.3 }),
  glass: new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: new THREE.Color(0xff8a20), emissiveIntensity: 2, roughness: 0.3 }),
};

/** A small copper lantern, about 20 cm tall, hanging from its ring at the origin. */
function lanternModel(): THREE.Group {
  const m = mats();
  const g = new THREE.Group();
  const part = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = y;
    mesh.castShadow = false;
    g.add(mesh);
    return mesh;
  };
  const ring = part(new THREE.TorusGeometry(0.022, 0.005, 5, 12), m.dark, -0.022);
  ring.rotation.y = Math.PI / 2;
  part(new THREE.ConeGeometry(0.058, 0.045, 8), m.copper, -0.062);
  part(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 8), m.copper, -0.088);
  part(new THREE.CylinderGeometry(0.044, 0.044, 0.1, 8), m.glass, -0.142);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const post = part(new THREE.CylinderGeometry(0.005, 0.005, 0.11, 4), m.dark, -0.142);
    post.position.x = Math.cos(a) * 0.05;
    post.position.z = Math.sin(a) * 0.05;
  }
  part(new THREE.CylinderGeometry(0.058, 0.052, 0.022, 8), m.copper, -0.203);
  g.name = 'lantern';
  // A touch bigger than life, so it reads on the belt from the camera.
  g.scale.setScalar(1.3);
  return g;
}

/**
 * A lantern on a trainer's belt, yours or your friend's. It swings as they move and lights the
 * ground round them. The light always stays in the scene (dark when the lantern is out), because
 * adding or removing a light makes three.js rebuild every shader.
 */
export class CarriedLantern {
  readonly root = new THREE.Group();
  readonly light = new THREE.PointLight(0xffb060, 0, LANTERN.reach + 3, 2);
  private readonly model = lanternModel();
  private on = false;
  /** 0 out, 1 fully lit: it fades up and down. */
  private glow = 0;
  /** Pendulum angles (forward and sideways) and their rates. */
  private swing = new THREE.Vector2();
  private swingV = new THREE.Vector2();
  private readonly prev = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  private hasPrev = false;
  private readonly tmp = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');

  constructor() {
    this.root.name = 'carried-lantern';
    this.model.visible = false;
    this.light.castShadow = false;
    this.root.add(this.model, this.light);
    this.light.position.set(0, -FLAME, 0);
  }

  get lit(): boolean {
    return this.on;
  }

  setOn(on: boolean): void {
    this.on = on;
  }

  /** Follow the trainer it hangs from (null: nobody to carry it). */
  update(dt: number, owner: THREE.Object3D | null, elapsed: number): void {
    this.glow = THREE.MathUtils.clamp(this.glow + (this.on && owner ? dt * 3 : -dt * 3), 0, 1);
    this.model.visible = this.glow > 0 && !!owner;
    if (!owner) {
      this.light.intensity = 0;
      this.hasPrev = false;
      return;
    }
    owner.updateWorldMatrix(true, false);
    const hook = this.tmp.copy(HOOK).applyMatrix4(owner.matrixWorld);
    // A jump of more than a couple of metres is a teleport (or a respawn), not a swing.
    if (this.hasPrev && this.prev.distanceTo(hook) > 2) {
      this.hasPrev = false;
      this.vel.set(0, 0, 0);
    }
    if (this.hasPrev && dt > 0) {
      // The hook's velocity, turned into the trainer's frame, drives a damped pendulum: the
      // lantern lags behind as they set off and swings forward as they stop.
      const v = this.prev.sub(hook).multiplyScalar(-1 / dt);
      const accel = v.clone().sub(this.vel).divideScalar(dt);
      this.vel.copy(v);
      const yaw = this.e.setFromQuaternion(owner.getWorldQuaternion(this.q)).y;
      const fwd = Math.sin(yaw) * accel.x + Math.cos(yaw) * accel.z;
      const side = Math.cos(yaw) * accel.x - Math.sin(yaw) * accel.z;
      // Positive x swings the bottom back, positive y swings it to the trainer's left.
      const k = 38, c = 4.2, push = 0.9;
      this.swingV.x += (-k * this.swing.x - c * this.swingV.x + push * THREE.MathUtils.clamp(fwd, -40, 40)) * dt;
      this.swingV.y += (-k * this.swing.y - c * this.swingV.y - push * THREE.MathUtils.clamp(side, -40, 40)) * dt;
      this.swing.addScaledVector(this.swingV, dt);
      this.swing.clampScalar(-0.7, 0.7);
    }
    this.prev.copy(hook);
    this.hasPrev = true;
    this.root.position.copy(hook);
    const yaw = this.e.setFromQuaternion(owner.getWorldQuaternion(this.q)).y;
    // A step's bounce, from how fast the trainer is moving.
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const bob = Math.sin(elapsed * (6 + speed * 1.1)) * Math.min(1, speed / 5) * 0.12;
    this.root.quaternion.setFromAxisAngle(UP, yaw);
    this.model.rotation.set(this.swing.x + bob, 0, this.swing.y);
    // The flame sits in the glass and moves with it.
    this.light.position.set(0, -FLAME * Math.cos(this.swing.x + bob), -FLAME * Math.sin(this.swing.x + bob));
    const flicker = 0.92 + Math.sin(elapsed * 13.1) * 0.04 + Math.sin(elapsed * 29.7 + 1.3) * 0.04;
    this.light.intensity = 5 * this.glow * flicker;
  }

  dispose(): void {
    this.root.removeFromParent();
  }
}
