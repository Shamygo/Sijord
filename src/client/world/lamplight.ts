import * as THREE from 'three';

/** A light source in the world: a lantern, or a fire (brighter, and it flickers). */
export interface LampSpot {
  p: THREE.Vector3;
  fire?: boolean;
}

/** How far from the player a lamp can still light the ground. */
const REACH = 46;

/**
 * Warm light from the lanterns nearest the player after dark. A few point lights follow the
 * closest lamps, so the street, the player and their partner catch lamplight without paying for
 * a light per lamp. The lights always exist (dark by day), because adding or removing lights
 * makes three.js rebuild every shader.
 */
export class LampLight {
  readonly group = new THREE.Group();
  private readonly lights: THREE.PointLight[] = [];
  private night = 0;
  private readonly order: { lamp: LampSpot; d: number }[];

  constructor(lamps: readonly LampSpot[], count = 3) {
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(0xffa04a, 0, 12, 2);
      l.castShadow = false;
      this.lights.push(l);
      this.group.add(l);
    }
    this.group.name = 'lamplight';
    this.order = lamps.map((lamp) => ({ lamp, d: 0 }));
  }

  /** 0 by day up to 1 deep in the night. */
  setNight(n: number): void {
    this.night = n;
  }

  update(focus: THREE.Vector3, elapsed: number): void {
    const n = this.lights.length;
    if (this.night < 0.01 || this.order.length === 0) {
      for (const l of this.lights) l.intensity = 0;
      return;
    }
    for (const o of this.order) o.d = Math.hypot(o.lamp.p.x - focus.x, o.lamp.p.z - focus.z);
    this.order.sort((a, b) => a.d - b.d);
    // The first lamp not lit: a lit lamp fades out as it gets nearly as far as that one, so a
    // light moving to another lamp never pops.
    const next = this.order[n]?.d ?? REACH;
    for (let i = 0; i < n; i++) {
      const l = this.lights[i];
      const o = this.order[i];
      if (!o) {
        l.intensity = 0;
        continue;
      }
      const w = THREE.MathUtils.clamp((Math.min(next, REACH) - o.d) / 5, 0, 1);
      const flicker = o.lamp.fire ? 0.85 + Math.sin(elapsed * 11 + i) * 0.08 + Math.sin(elapsed * 23.7) * 0.07 : 1;
      l.position.copy(o.lamp.p);
      l.distance = o.lamp.fire ? 16 : 12;
      l.intensity = (o.lamp.fire ? 16 : 9) * this.night * w * flicker;
    }
  }
}
