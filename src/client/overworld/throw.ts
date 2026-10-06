import * as THREE from 'three';
import type { CatchRoll } from '../../shared/battle/catch';
import { resolveCircle } from '../core/collision';
import { disposeBall, makeBall, makeTreat, Particles } from '../battle/fx';
import type { World } from '../world/types';
import { BALL_FLIGHT, canCatch, groundNormal, newBall, predictArc, stepBall, type BallState, type StepEnv, type Vec3 } from './ball-flight';
import type { WildCreature } from './wild';

/**
 * Overworld throws in the world (DESIGN §5.1), Legends: Arceus style: a dotted arc and landing
 * marker while aiming, the ball's physical flight and bounces, the in-world catch (the creature
 * shrinks into the ball, it drops and shakes, then a sparkle or a burst), missed balls lying in
 * the grass until picked up, and replicas of the partner's throws.
 */

/** Thrown like a ball, but it feeds instead of catching (DESIGN §5.3). */
export const TREAT_ITEM = 'treat';
export const isTreat = (item: string) => item === TREAT_ITEM;

/** Seconds a missed ball stays on the ground before it's lost. */
export const DROPPED_BALL_LIFE = 150;
/** How close the trainer must be to pick a ball back up. */
export const PICKUP_RADIUS = 1.7;

const easeOut = (k: number) => 1 - (1 - k) * (1 - k);
const easeIn = (k: number) => k * k;

/** Catch sequence timing (seconds). */
const SEQ = { absorb: 0.45, fall: 0.38, shake: 0.75, beat: 0.3, pop: 0.35, keep: 0.9 };

export interface ThrowDeps {
  world: World;
  /** Wild creatures a ball can hit right now. */
  targets(): WildCreature[];
  /** A local ball hit a creature: roll the catch (the creature is held in the ball meanwhile). */
  onHit(m: WildCreature, ball: string, throwId: number, at: Vec3): CatchRoll;
  /** The shakes are over: caught, or it broke out right now. */
  onResult(m: WildCreature, ball: string, roll: CatchRoll, at: Vec3, throwId: number): void;
  /** A local ball came to rest without hitting anything. */
  onRest(ball: string, at: Vec3): void;
  /** A local ball was lost in deep water. */
  onSink(ball: string): void;
  /** A local Treat hit a creature or came to rest (`m` null): someone may come and eat it. */
  onTreat(m: WildCreature | null, at: Vec3): void;
}

interface Flight {
  key: string;
  id: number;
  ball: string;
  state: BallState;
  mesh: THREE.Group;
  local: boolean;
  /** Seconds before the ball leaves the hand. */
  delay: number;
  acc: number;
  /** Remote replicas fade out a moment after landing. */
  restT: number;
  spinAxis: THREE.Vector3;
}

interface CatchSeq {
  mesh: THREE.Group;
  creature: WildCreature | null;
  ball: string;
  roll: CatchRoll;
  throwId: number;
  t: number;
  hit: THREE.Vector3;
  hover: THREE.Vector3;
  rest: THREE.Vector3;
  startScale: number;
  resolved: boolean;
}

interface Dropped {
  id: number;
  ball: string;
  mesh: THREE.Group;
  /** Twinkle floating above it so it can be found in tall grass. */
  star: THREE.Sprite;
  life: number;
  glint: number;
}

/** A soft four-point twinkle, shared by every dropped ball. */
const TRAIL_AT = new THREE.Vector3();

function starTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.2, 'rgba(255,248,220,0.6)');
  grad.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath();
  g.moveTo(32, 2); g.lineTo(35, 29); g.lineTo(62, 32); g.lineTo(35, 35); g.lineTo(32, 62); g.lineTo(29, 35); g.lineTo(2, 32); g.lineTo(29, 29);
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class OverworldThrows {
  readonly root = new THREE.Group();
  readonly particles = new Particles(500);
  private flights: Flight[] = [];
  private seqs: CatchSeq[] = [];
  private dropped: Dropped[] = [];
  private nextDropId = 1;
  private env: StepEnv;
  private seenRemote = new Map<string, { throwId: number; catchId: number }>();

  // Aim preview.
  private dots: THREE.InstancedMesh;
  private starMat: THREE.SpriteMaterial | null = null;
  private marker: THREE.Group;
  private markerRing: THREE.Mesh;
  private markerFill: THREE.Mesh;
  private readonly maxDots = 90;
  private tmpM = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpS = new THREE.Vector3();
  private tmpV = new THREE.Vector3();
  private tmpC = new THREE.Color();

  constructor(private deps: ThrowDeps) {
    this.root.name = 'overworld-throws';
    const world = deps.world;
    this.env = {
      ground: (x, z) => world.heightAt(x, z),
      waterLevel: world.waterLevel,
      // Walls, rocks and trunks stop a ball up to about roof height.
      push: (x, z, y) => (y - world.heightAt(x, z) > 6 ? { x, z } : resolveCircle(x, z, BALL_FLIGHT.radius, world.colliders, y - BALL_FLIGHT.radius)),
    };
    this.root.add(this.particles.points);

    const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, depthWrite: false, fog: false });
    this.dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.042, 8, 6), dotMat, this.maxDots);
    this.dots.frustumCulled = false;
    this.dots.count = 0;
    this.dots.renderOrder = 6;
    this.dots.visible = false;
    for (let i = 0; i < this.maxDots; i++) this.dots.setColorAt(i, new THREE.Color(1, 1, 1));
    this.root.add(this.dots);

    this.marker = new THREE.Group();
    this.markerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.4, 40),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    this.markerFill = new THREE.Mesh(
      new THREE.CircleGeometry(0.3, 40),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    for (const m of [this.markerRing, this.markerFill]) {
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 6;
      this.marker.add(m);
    }
    this.marker.visible = false;
    this.root.add(this.marker);
  }

  /** Physics settings the preview and flights share (also the remote replicas). */
  get stepEnv(): StepEnv {
    return this.env;
  }

  /**
   * Where the camera's centre ray first meets a wild creature (its middle) or the ground (the
   * water surface over deep water), within `max` metres; null when it only meets sky.
   */
  aimRay(origin: THREE.Vector3, dir: THREE.Vector3, max = 45): { point: Vec3; creature: WildCreature | null } | null {
    const world = this.deps.world;
    const targets = this.deps.targets();
    const floor = (x: number, z: number) => Math.max(world.heightAt(x, z), world.waterLevel);
    const p = { x: 0, y: 0, z: 0 };
    let prev = 0;
    for (let t = 1.5; t <= max; t += 0.2) {
      p.x = origin.x + dir.x * t;
      p.y = origin.y + dir.y * t;
      p.z = origin.z + dir.z * t;
      const i = hitIndex(p, targets);
      if (i >= 0) {
        const m = targets[i];
        return { point: { x: m.root.position.x, y: m.root.position.y + Math.max(0.35, m.model.height) * 0.5, z: m.root.position.z }, creature: m };
      }
      if (p.y < floor(p.x, p.z)) {
        // Refine the ground crossing between the last two samples.
        let lo = prev;
        let hi = t;
        for (let k = 0; k < 12; k++) {
          const mid = (lo + hi) / 2;
          const y = origin.y + dir.y * mid;
          if (y < floor(origin.x + dir.x * mid, origin.z + dir.z * mid)) hi = mid;
          else lo = mid;
        }
        const x = origin.x + dir.x * hi;
        const z = origin.z + dir.z * hi;
        return { point: { x, y: floor(x, z) + BALL_FLIGHT.radius, z }, creature: null };
      }
      prev = t;
    }
    return null;
  }

  /**
   * Show the predicted arc for a throw from `from` at `vel`. Returns the creature the ball would
   * hit first, if any. `hits` colours the arc gold when it's on target.
   */
  preview(from: Vec3, vel: Vec3): WildCreature | null {
    const targets = this.deps.targets();
    const p = predictArc(from, vel, this.env, (b) => hitIndex(b, targets), { maxTime: 3, sampleEvery: 0.035 });
    const target = p.hit >= 0 ? targets[p.hit] : null;
    const n = Math.min(this.maxDots, p.points.length);
    const gold = new THREE.Color(1, 0.84, 0.3);
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < n; i++) {
      const pt = p.points[i];
      const k = i / Math.max(1, n - 1);
      // Dots start small near the hand, are fullest mid-flight and taper towards the landing.
      const s = (0.55 + 0.45 * Math.sin(Math.min(1, k * 1.6) * Math.PI * 0.5)) * (i === 0 ? 0 : 1);
      this.tmpM.compose(this.tmpV.set(pt.x, pt.y, pt.z), this.tmpQ.identity(), this.tmpS.setScalar(s));
      this.dots.setMatrixAt(i, this.tmpM);
      this.dots.setColorAt(i, this.tmpC.copy(target ? gold : white).lerp(white, target ? 0 : 0.2 * k));
    }
    this.dots.count = n;
    this.dots.instanceMatrix.needsUpdate = true;
    if (this.dots.instanceColor) this.dots.instanceColor.needsUpdate = true;
    this.dots.visible = true;

    // Landing marker: lies on the ground where the ball first comes down (hidden on a hit; the HUD rings the target).
    const world = this.deps.world;
    if (!target) {
      const g = world.heightAt(p.end.x, p.end.z);
      const nrm = groundNormal(this.env.ground, p.end.x, p.end.z);
      this.marker.position.set(p.end.x, g + 0.05, p.end.z);
      this.marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(nrm.x, nrm.y, nrm.z));
      const wet = g < world.waterLevel - 0.05;
      const c = wet ? 0x7fc8ff : 0xffffff;
      (this.markerRing.material as THREE.MeshBasicMaterial).color.setHex(c);
      (this.markerFill.material as THREE.MeshBasicMaterial).color.setHex(c);
      if (wet) this.marker.position.y = world.waterLevel + 0.03;
      const pulse = 1 + Math.sin(performance.now() / 160) * 0.06;
      this.marker.scale.setScalar(pulse);
      this.marker.visible = true;
    } else this.marker.visible = false;
    return target;
  }

  hidePreview(): void {
    this.dots.visible = false;
    this.marker.visible = false;
  }

  /** Throw a ball. `delay` waits for the arm to come over; `local` balls can catch and be picked up. */
  launch(o: { id: number; ball: string; from: Vec3; vel: Vec3; delay: number; local: boolean; key?: string }): void {
    const mesh = isTreat(o.ball) ? makeTreat() : makeBall(o.ball);
    mesh.visible = false;
    mesh.position.set(o.from.x, o.from.y, o.from.z);
    this.root.add(mesh);
    const axis = new THREE.Vector3(o.vel.z, 0, -o.vel.x).normalize();
    if (axis.lengthSq() < 0.5) axis.set(1, 0, 0);
    this.flights.push({ key: o.key ?? `local:${o.id}`, id: o.id, ball: o.ball, state: newBall(o.from, o.vel), mesh, local: o.local, delay: o.delay, acc: 0, restT: 0, spinAxis: axis });
  }

  /** The partner threw: replay the same flight here (it can't catch anything on this side). */
  remoteThrow(peer: string, fx: { id: number; ball: string; from: [number, number, number]; vel: [number, number, number] }, delay: number): boolean {
    const seen = this.seenRemote.get(peer) ?? { throwId: 0, catchId: 0 };
    this.seenRemote.set(peer, seen);
    if (fx.id <= seen.throwId) return false;
    seen.throwId = fx.id;
    this.launch({ id: fx.id, key: `${peer}:${fx.id}`, ball: fx.ball, from: { x: fx.from[0], y: fx.from[1], z: fx.from[2] }, vel: { x: fx.vel[0], y: fx.vel[1], z: fx.vel[2] }, delay, local: false });
    return true;
  }

  /** The partner's ball hit something: play the shakes and the result where it happened. */
  remoteCatch(peer: string, fx: { id: number; ball: string; at: [number, number, number]; shakes: number; caught: boolean }): void {
    const seen = this.seenRemote.get(peer) ?? { throwId: 0, catchId: 0 };
    this.seenRemote.set(peer, seen);
    if (fx.id <= seen.catchId) return;
    seen.catchId = fx.id;
    const key = `${peer}:${fx.id}`;
    const f = this.flights.find((x) => x.key === key);
    if (f) this.removeFlight(f);
    this.startSequence(null, fx.ball, { caught: fx.caught, shakes: fx.shakes }, new THREE.Vector3(...fx.at), fx.id);
  }

  /** A ball lying close enough to pick up, if any. */
  nearestPickup(p: THREE.Vector3, r = PICKUP_RADIUS): { id: number; ball: string } | null {
    let best: Dropped | null = null;
    let bd = r;
    for (const d of this.dropped) {
      const dist = Math.hypot(d.mesh.position.x - p.x, d.mesh.position.z - p.z);
      if (dist < bd && Math.abs(d.mesh.position.y - p.y) < 2) {
        bd = dist;
        best = d;
      }
    }
    return best ? { id: best.id, ball: best.ball } : null;
  }

  /** Pick a dropped ball up; returns its kind. */
  pickup(id: number): string | null {
    const d = this.dropped.find((x) => x.id === id);
    if (!d) return null;
    this.particles.emit(d.mesh.position, 10, '#ffffff', { speed: 1.2, life: 0.4, size: 0.18, up: 1 });
    this.removeDropped(d);
    return d.ball;
  }

  /** Balls lying on the ground (for tests / the text view). */
  get droppedCount(): number {
    return this.dropped.length;
  }

  /** Balls in the air or shaking. */
  get busy(): boolean {
    return this.flights.length > 0 || this.seqs.some((s) => !s.resolved);
  }

  update(dt: number): void {
    const step = BALL_FLIGHT.step;
    for (const f of [...this.flights]) {
      if (f.delay > 0) {
        f.delay -= dt;
        if (f.delay > 0) continue;
        f.mesh.visible = true;
      }
      if (f.state.resting) {
        if (!f.local) {
          f.restT += dt;
          f.mesh.scale.setScalar(Math.max(0.001, 1 - Math.max(0, f.restT - 1.5) / 0.5));
          if (f.restT > 2) this.removeFlight(f);
        }
        continue;
      }
      f.acc += dt;
      let ended = false;
      while (f.acc >= step && !ended) {
        f.acc -= step;
        const r = stepBall(f.state, this.env, step);
        if (f.local && canCatch(f.state)) {
          const targets = this.deps.targets();
          const i = hitIndex(f.state, targets);
          if (i >= 0) {
            const m = targets[i];
            const at = { x: f.state.x, y: f.state.y, z: f.state.z };
            if (isTreat(f.ball)) {
              // A Treat bounces off its nose and drops at its feet.
              this.particles.emit(new THREE.Vector3(at.x, at.y, at.z), 10, '#e8a548', { speed: 1.4, life: 0.45, size: 0.14, up: 1 });
              this.removeFlight(f);
              this.deps.onTreat(m, at);
              ended = true;
              break;
            }
            const roll = this.deps.onHit(m, f.ball, f.id, at);
            this.removeFlight(f);
            this.startSequence(m, f.ball, roll, new THREE.Vector3(at.x, at.y, at.z), f.id);
            ended = true;
            break;
          }
        }
        if (r === 'bounce' && f.state.bounces === 1) this.particles.emit(new THREE.Vector3(f.state.x, f.state.y - 0.08, f.state.z), 8, '#d8c9a0', { speed: 1.2, life: 0.45, size: 0.22, up: 0.6 });
        if (r === 'sink') {
          this.particles.emit(new THREE.Vector3(f.state.x, this.deps.world.waterLevel + 0.05, f.state.z), 18, '#cfeaff', { speed: 2, life: 0.5, size: 0.25, up: 2.5, gravity: 6 });
          this.removeFlight(f);
          if (f.local) this.deps.onSink(f.ball);
          ended = true;
        } else if (r === 'rest') {
          if (f.local && isTreat(f.ball)) {
            // Lies where it landed as bait (the wild manager draws it from here on).
            this.removeFlight(f);
            this.deps.onTreat(null, { x: f.state.x, y: f.state.y, z: f.state.z });
          } else if (f.local) {
            this.flights = this.flights.filter((x) => x !== f);
            f.mesh.position.set(f.state.x, f.state.y, f.state.z);
            this.starMat ??= new THREE.SpriteMaterial({ map: starTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
            const star = new THREE.Sprite(this.starMat);
            star.position.set(f.state.x, f.state.y + 0.55, f.state.z);
            star.renderOrder = 7;
            this.root.add(star);
            this.dropped.push({ id: this.nextDropId++, ball: f.ball, mesh: f.mesh, star, life: DROPPED_BALL_LIFE, glint: Math.random() });
            this.deps.onRest(f.ball, { x: f.state.x, y: f.state.y, z: f.state.z });
          }
          ended = true;
        }
      }
      if (ended && !this.flights.includes(f)) continue;
      const s = f.state;
      // A faint white streak behind a ball still in its first arc, as in the catching reference.
      if (s.bounces === 0 && !s.contact && f.mesh.visible) {
        const from = f.mesh.position;
        const n = Math.min(6, Math.ceil(Math.hypot(s.x - from.x, s.y - from.y, s.z - from.z) / 0.07));
        for (let i = 0; i < n; i++) {
          const k = (i + 1) / n;
          TRAIL_AT.set(from.x + (s.x - from.x) * k, from.y + (s.y - from.y) * k, from.z + (s.z - from.z) * k);
          this.particles.emit(TRAIL_AT, 1, '#f4f8ff', { speed: 0.05, spread: 0.015, life: 0.22, size: 0.13, drag: 0 });
        }
      }
      f.mesh.position.set(s.x, s.y, s.z);
      const speed = Math.hypot(s.vx, s.vz);
      if (speed > 0.05) f.spinAxis.set(s.vz, 0, -s.vx).normalize();
      f.mesh.rotateOnWorldAxis(f.spinAxis, (Math.max(speed, Math.abs(s.vy) * 0.3) / BALL_FLIGHT.radius) * dt * 0.35);
    }

    for (const q of [...this.seqs]) this.updateSequence(q, dt);

    for (const d of [...this.dropped]) {
      d.life -= dt;
      d.glint -= dt;
      if (d.glint <= 0) {
        // A small glint so a ball in the grass can be found again.
        d.glint = 1.1 + Math.random() * 0.6;
        this.particles.emit(d.mesh.position.clone().add(new THREE.Vector3(0, 0.16, 0)), 2, '#fff8e0', { speed: 0.25, life: 0.6, size: 0.2, up: 0.4 });
      }
      const fade = Math.min(1, d.life / 2);
      if (d.life < 2) d.mesh.scale.setScalar(Math.max(0.001, fade));
      // Twinkle: a slow swell with a quick sparkle now and then.
      const k = performance.now() / 1000 + d.id;
      d.star.scale.setScalar((0.34 + 0.1 * Math.sin(k * 2.4) + (d.glint > 0.9 ? 0.16 : 0)) * fade);
      d.star.position.y = d.mesh.position.y + 0.55 + Math.sin(k * 1.7) * 0.04;
      if (d.life <= 0) this.removeDropped(d);
    }
    this.particles.update(dt);
  }

  private removeDropped(d: Dropped): void {
    this.dropped = this.dropped.filter((x) => x !== d);
    d.star.removeFromParent();
    disposeBall(d.mesh);
  }

  private removeFlight(f: Flight): void {
    this.flights = this.flights.filter((x) => x !== f);
    disposeBall(f.mesh);
  }

  private startSequence(m: WildCreature | null, ball: string, roll: CatchRoll, hit: THREE.Vector3, throwId: number): void {
    const mesh = makeBall(ball);
    mesh.position.copy(hit);
    this.root.add(mesh);
    const world = this.deps.world;
    // Pop up off the creature, then drop to the ground at its feet.
    const hover = hit.clone().add(new THREE.Vector3(0, 0.55, 0));
    if (m) hover.set(m.root.position.x, Math.max(hit.y, m.root.position.y + m.model.height * 0.6) + 0.5, m.root.position.z);
    const gx = hover.x;
    const gz = hover.z;
    const rest = new THREE.Vector3(gx, Math.max(world.heightAt(gx, gz), world.waterLevel) + BALL_FLIGHT.radius, gz);
    this.particles.emit(hit, 26, '#ff5a4a', { speed: 2.2, life: 0.5, size: 0.3 });
    this.seqs.push({ mesh, creature: m, ball, roll, throwId, t: 0, hit, hover, rest, startScale: m ? m.root.scale.x || 1 : 1, resolved: false });
  }

  private updateSequence(q: CatchSeq, dt: number): void {
    q.t += dt;
    const g = q.mesh;
    const root = q.creature?.root;
    const t1 = SEQ.absorb;
    const t2 = t1 + SEQ.fall;
    const t3 = t2 + q.roll.shakes * SEQ.shake;
    const t4 = t3 + SEQ.beat;
    if (q.t < t1) {
      const k = q.t / t1;
      g.position.lerpVectors(q.hit, q.hover, easeOut(k));
      g.rotation.set(0, 0, 0);
      // The ball opens towards the creature: tilt it back a little while it draws it in.
      g.rotation.x = -0.5 * Math.sin(k * Math.PI);
      if (root) root.scale.setScalar(Math.max(0.001, q.startScale * (1 - easeIn(k))));
      if (Math.random() < dt * 30) this.particles.emit(g.position, 2, '#ff6a5a', { speed: 0.8, life: 0.3, size: 0.22 });
    } else if (q.t < t2) {
      if (root) root.visible = false;
      const k = (q.t - t1) / SEQ.fall;
      g.position.lerpVectors(q.hover, q.rest, easeIn(k));
      g.position.y += Math.sin(k * Math.PI) * 0.12;
      g.rotation.x = 0;
    } else if (q.t < t3) {
      g.position.copy(q.rest);
      const i = Math.floor((q.t - t2) / SEQ.shake);
      const k = (q.t - t2 - i * SEQ.shake) / SEQ.shake;
      // Each wobble is a quick rock, then stillness: the tension of waiting is half the fun.
      const w = k < 0.6 ? Math.sin((k / 0.6) * Math.PI * 2) * 0.5 : 0;
      g.rotation.z = w;
      if (k < 0.02) this.particles.emit(q.rest, 3, '#fff2c8', { speed: 0.6, life: 0.25, size: 0.15 });
    } else if (!q.resolved) {
      g.rotation.z = 0;
      g.position.copy(q.rest);
      if (q.t < t4) return;
      q.resolved = true;
      if (q.roll.caught) {
        this.particles.emit(q.rest.clone().add(new THREE.Vector3(0, 0.2, 0)), 30, '#ffe36a', { speed: 2.4, life: 0.8, size: 0.26, up: 2 });
        this.particles.emit(q.rest.clone().add(new THREE.Vector3(0, 0.25, 0)), 10, '#ffffff', { speed: 1.4, life: 1, size: 0.34, up: 1.5 });
      } else {
        this.particles.emit(q.rest.clone().add(new THREE.Vector3(0, 0.25, 0)), 36, '#fff6d8', { speed: 3.6, life: 0.45, size: 0.3 });
        g.visible = false;
        if (root && q.creature) {
          root.visible = true;
          root.scale.setScalar(0.001);
        }
      }
      if (q.creature) this.deps.onResult(q.creature, q.ball, q.roll, { x: q.rest.x, y: q.rest.y, z: q.rest.z }, q.throwId);
    } else {
      const k = Math.min(1, (q.t - t4) / (q.roll.caught ? SEQ.keep : SEQ.pop));
      if (q.roll.caught) {
        // The ball sits a moment, then is drawn back to the trainer's belt (shrinks away).
        g.scale.setScalar(Math.max(0.001, 1 - easeIn(Math.max(0, k - 0.55) / 0.45)));
      } else if (root) {
        const s = k < 0.7 ? easeOut(k / 0.7) * 1.1 : 1.1 - ((k - 0.7) / 0.3) * 0.1;
        root.scale.setScalar(Math.max(0.001, q.startScale * s));
      }
      if (k >= 1) {
        if (root && !q.roll.caught) root.scale.setScalar(q.startScale);
        this.seqs = this.seqs.filter((x) => x !== q);
        disposeBall(g);
      }
    }
  }

  /** Forget balls in flight and mid-catch (blackout), and those on the ground unless `keepDropped`. */
  clear(keepDropped = false): void {
    for (const f of this.flights) disposeBall(f.mesh);
    for (const q of this.seqs) disposeBall(q.mesh);
    this.flights = [];
    this.seqs = [];
    if (!keepDropped) {
      for (const d of [...this.dropped]) this.removeDropped(d);
    }
    this.hidePreview();
    this.particles.clear();
  }
}

/** Index of the first target a ball overlaps, or -1. Creatures are treated as upright cylinders. */
export function hitIndex(b: Vec3, targets: readonly WildCreature[]): number {
  for (let i = 0; i < targets.length; i++) {
    const m = targets[i];
    const p = m.root.position;
    const r = m.model.radius * 1.1 + BALL_FLIGHT.radius + 0.12;
    if ((b.x - p.x) ** 2 + (b.z - p.z) ** 2 > r * r) continue;
    const h = Math.max(0.35, m.model.height);
    if (b.y >= p.y - 0.1 && b.y <= p.y + h + 0.15) return i;
  }
  return -1;
}
