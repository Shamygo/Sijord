import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Appearance, MoveAnim, PlayerSnapshot } from '../../shared/types';
import type { Avatar } from './types';

/**
 * Procedural trainer avatar: a chunky, stylised humanoid (~1.72 m) in a hoodie with a
 * backpack, built entirely from smooth primitives. The root origin is at the feet and the
 * model faces +Z. All motion is procedural and blended through smoothed weights and springs
 * so transitions never snap.
 */

// ---------------------------------------------------------------------------------------------
// Rig dimensions (metres). Feet at y = 0.
// ---------------------------------------------------------------------------------------------
const HIPS_Y = 0.84;
const HIP_JOINT_Y = -0.04; // relative to hips
const THIGH_LEN = 0.36;
const SHIN_LEN = 0.36;
const LEG_LEN = THIGH_LEN + SHIN_LEN;
const SPINE_Y = 0.05; // relative to hips
const SHOULDER_Y = 0.35; // relative to spine
const UPPER_ARM_LEN = 0.25;
const FOREARM_LEN = 0.21;
const HEAD_R = 0.19;
/** Face feature scale relative to the original head size. */
const F = HEAD_R / 0.165;

const SHOE_COLOR = '#4a3326';
const SOLE_COLOR = '#e9e1d2';
const GLOVE_COLOR = '#2c2a30';
const PACK_COLOR = '#a07d4f';
const PACK_DARK = '#6e5434';
const EMBLEM_GOLD = '#f2c14e';
const EMBLEM_FACE = '#fbf3e4';
const EYE_COLOR = '#211c26';
const STRING_COLOR = '#f4efe6';

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
/** Frame-rate independent exponential approach. */
function damp(current: number, target: number, rate: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-rate * dt));
}

/** A damped spring scalar: x is pulled to a target, v is its velocity. */
interface Spring {
  x: number;
  v: number;
}
function stepSpring(s: Spring, target: number, stiffness: number, dampingRatio: number, dt: number): void {
  const c = 2 * Math.sqrt(stiffness) * dampingRatio;
  // Semi-implicit Euler with small sub-steps for stability at stiff settings.
  const n = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    const a = -stiffness * (s.x - target) - c * s.v;
    s.v += a * h;
    s.x += s.v * h;
  }
}

/**
 * Tapered limb: a lathe with a half-sphere at each end. Origin at the top joint, extending
 * down -Y by `len`, so it can be parented directly under a pivot.
 */
function limbGeometry(rTop: number, rBot: number, len: number, radial = 16): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(0, Math.cos(a)) * rBot, -len + Math.sin(a) * rBot));
  }
  for (let i = 1; i <= n; i++) {
    const a = (i / n) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(0, Math.cos(a)) * rTop, Math.sin(a) * rTop));
  }
  pts[0].x = 0;
  pts[pts.length - 1].x = 0;
  return new THREE.LatheGeometry(pts, radial);
}

function starShape(outer: number, inner: number, points = 5): THREE.Shape {
  const shape = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

class Kit {
  private readonly mats = new Map<string, THREE.MeshStandardMaterial>();

  mat(color: THREE.ColorRepresentation, roughness = 0.78, key?: string): THREE.MeshStandardMaterial {
    const c = new THREE.Color(color);
    const k = key ?? `${c.getHexString()}-${roughness}`;
    let m = this.mats.get(k);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: c, roughness, metalness: 0 });
      this.mats.set(k, m);
    }
    return m;
  }

  mesh(
    geo: THREE.BufferGeometry,
    material: THREE.Material,
    parent: THREE.Object3D,
    pos?: [number, number, number],
    rot?: [number, number, number],
    scale?: [number, number, number],
  ): THREE.Mesh {
    const m = new THREE.Mesh(geo, material);
    m.castShadow = true;
    m.receiveShadow = true;
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    if (scale) m.scale.set(scale[0], scale[1], scale[2]);
    parent.add(m);
    return m;
  }
}

function shade(hex: string, f: number): THREE.Color {
  return new THREE.Color(hex).multiplyScalar(f);
}

// ---------------------------------------------------------------------------------------------
// Rig
// ---------------------------------------------------------------------------------------------
interface Limb {
  upper: THREE.Group;
  lower: THREE.Group;
  end: THREE.Group;
}

interface Rig {
  body: THREE.Group;
  hips: THREE.Group;
  spine: THREE.Group;
  head: THREE.Group;
  armL: Limb;
  armR: Limb;
  legL: Limb;
  legR: Limb;
  pack: THREE.Group;
  hairSway: THREE.Group | null;
  shoulderX: number;
}

function buildRig(a: Appearance): Rig {
  const kit = new Kit();
  const build = clamp(a.build, 0, 1);
  const widthF = 1.12 + 0.14 * build;
  const shoulderX = 0.225 + 0.035 * build;
  const limbF = 1 + 0.12 * build;

  const skin = kit.mat(a.skinTone, 0.6);
  const hair = kit.mat(a.hairColor, 0.62);
  const jacket = kit.mat(a.jacketColor, 0.82);
  const jacketDark = kit.mat(shade(a.jacketColor, 0.72), 0.85);
  const pants = kit.mat(a.pantsColor, 0.85);
  const pantsDark = kit.mat(shade(a.pantsColor, 0.75), 0.85);
  const shoe = kit.mat(SHOE_COLOR, 0.7);
  const sole = kit.mat(SOLE_COLOR, 0.8);
  const glove = kit.mat(GLOVE_COLOR, 0.7);
  const packM = kit.mat(PACK_COLOR, 0.85);
  const packDark = kit.mat(PACK_DARK, 0.8);
  const gold = kit.mat(EMBLEM_GOLD, 0.45);
  const emblemFace = kit.mat(EMBLEM_FACE, 0.55);
  const eye = kit.mat(EYE_COLOR, 0.25);
  const white = kit.mat('#ffffff', 0.3);
  const strings = kit.mat(STRING_COLOR, 0.7);
  const blush = kit.mat(new THREE.Color(a.skinTone).lerp(new THREE.Color('#ff7a6b'), 0.45), 0.65);
  const mouthM = kit.mat('#7a3b33', 0.6);

  const body = new THREE.Group();
  body.name = 'avatar-body';
  const hips = new THREE.Group();
  hips.position.y = HIPS_Y;
  body.add(hips);

  // ---- Pelvis / pants seat --------------------------------------------------------------
  kit.mesh(new THREE.SphereGeometry(0.17, 24, 16), pants, hips, [0, -0.03, 0], undefined, [widthF * 0.98, 0.72, 0.85]);

  // ---- Legs ---------------------------------------------------------------------------------
  const thighGeo = limbGeometry(0.1 * limbF, 0.082 * limbF, THIGH_LEN);
  const shinGeo = limbGeometry(0.08 * limbF, 0.07 * limbF, SHIN_LEN - 0.06);
  const kneeGeo = new THREE.SphereGeometry(0.083 * limbF, 16, 12);
  const bootGeo = limbGeometry(0.08 * limbF, 0.077 * limbF, 0.1);
  const shoeGeo = new RoundedBoxGeometry(0.155 * limbF, 0.11, 0.26, 4, 0.05);
  const soleGeo = new RoundedBoxGeometry(0.155 * limbF, 0.035, 0.265, 3, 0.016);
  const toeGeo = new THREE.SphereGeometry(0.075 * limbF, 16, 10);
  const makeLeg = (side: number): Limb => {
    const upper = new THREE.Group();
    upper.position.set(side * 0.1 * widthF * 0.9, HIP_JOINT_Y, 0);
    hips.add(upper);
    kit.mesh(thighGeo, pants, upper);
    const lower = new THREE.Group();
    lower.position.y = -THIGH_LEN;
    upper.add(lower);
    kit.mesh(kneeGeo, pants, lower);
    kit.mesh(shinGeo, pants, lower);
    // Boot cuff over the lower shin.
    kit.mesh(bootGeo, shoe, lower, [0, -SHIN_LEN + 0.13, 0]);
    kit.mesh(new THREE.TorusGeometry(0.08 * limbF, 0.015, 8, 20), pantsDark, lower, [0, -SHIN_LEN + 0.15, 0], [Math.PI / 2, 0, 0]);
    const end = new THREE.Group();
    end.position.y = -SHIN_LEN;
    lower.add(end);
    kit.mesh(shoeGeo, shoe, end, [0, -0.02, 0.04]);
    kit.mesh(toeGeo, shoe, end, [0, -0.025, 0.12], undefined, [1, 0.7, 1]);
    kit.mesh(soleGeo, sole, end, [0, -0.064, 0.042]);
    return { upper, lower, end };
  };
  const legL = makeLeg(1);
  const legR = makeLeg(-1);

  // ---- Spine / hoodie ------------------------------------------------------------------------
  const spine = new THREE.Group();
  spine.position.y = SPINE_Y;
  hips.add(spine);

  const torsoProfile = [
    [0.0, -0.17],
    [0.16, -0.17],
    [0.195, -0.14],
    [0.2, -0.06],
    [0.195, 0.04],
    [0.2, 0.14],
    [0.212, 0.24],
    [0.21, 0.32],
    [0.19, 0.39],
    [0.14, 0.44],
    [0.07, 0.465],
    [0.0, 0.47],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const torsoGeo = new THREE.LatheGeometry(torsoProfile, 32);
  const torsoScale: [number, number, number] = [widthF, 1, 0.8];
  kit.mesh(torsoGeo, jacket, spine, [0, 0, 0], undefined, torsoScale);
  // Ribbed hem band.
  kit.mesh(new THREE.TorusGeometry(0.19, 0.035, 10, 32), jacketDark, spine, [0, -0.15, 0], [Math.PI / 2, 0, 0], [widthF, 0.82, 1]);
  // Kangaroo pocket.
  kit.mesh(new RoundedBoxGeometry(0.24, 0.11, 0.05, 3, 0.022), jacketDark, spine, [0, -0.02, 0.15], [-0.05, 0, 0], [widthF * 0.95, 1, 1]);
  // Hood rim around the neck and the hood bunched up behind it.
  kit.mesh(new THREE.TorusGeometry(0.1, 0.045, 12, 28), jacketDark, spine, [0, 0.44, -0.01], [Math.PI / 2 + 0.25, 0, 0], [1.05, 1, 1]);
  kit.mesh(new THREE.SphereGeometry(0.15, 24, 16), jacket, spine, [0, 0.4, -0.14], [0.4, 0, 0], [1.15, 0.72, 0.62]);
  kit.mesh(new THREE.SphereGeometry(0.11, 20, 14), jacketDark, spine, [0, 0.43, -0.1], [0.4, 0, 0], [1.1, 0.5, 0.5]);
  // Drawstrings.
  const stringGeo = new THREE.CapsuleGeometry(0.008, 0.1, 3, 6);
  const tipGeo = new THREE.SphereGeometry(0.014, 8, 6);
  for (const s of [-1, 1]) {
    kit.mesh(stringGeo, strings, spine, [s * 0.04, 0.33, 0.172], [-0.15, 0, s * 0.05]);
    kit.mesh(tipGeo, strings, spine, [s * 0.043, 0.27, 0.18]);
  }

  // Neck.
  kit.mesh(new THREE.CylinderGeometry(0.055, 0.062, 0.12, 14), skin, spine, [0, 0.47, 0.01]);

  // ---- Backpack (hangs from a pivot so it can bounce) -----------------------------------------
  const pack = new THREE.Group();
  pack.position.set(0, 0.36, -0.16);
  spine.add(pack);
  const packBodyY = -0.2;
  kit.mesh(new RoundedBoxGeometry(0.36, 0.4, 0.18, 4, 0.07), packM, pack, [0, packBodyY, -0.08]);
  // Top flap.
  kit.mesh(new RoundedBoxGeometry(0.37, 0.13, 0.2, 4, 0.05), packDark, pack, [0, packBodyY + 0.16, -0.085], [0.12, 0, 0]);
  // Side pockets.
  for (const s of [-1, 1]) {
    kit.mesh(new RoundedBoxGeometry(0.08, 0.2, 0.13, 3, 0.035), packDark, pack, [s * 0.19, packBodyY - 0.07, -0.08]);
  }
  // Bottom bedroll.
  kit.mesh(new THREE.CapsuleGeometry(0.06, 0.3, 6, 16), kit.mat('#4f7a6a', 0.85), pack, [0, packBodyY - 0.22, -0.09], [0, 0, Math.PI / 2]);
  // Round emblem on the back: gold ring, cream face, star in the jacket colour.
  const emblem = new THREE.Group();
  emblem.position.set(0, packBodyY - 0.01, -0.175);
  emblem.rotation.y = Math.PI;
  pack.add(emblem);
  kit.mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.02, 32), emblemFace, emblem, [0, 0, 0], [Math.PI / 2, 0, 0]);
  kit.mesh(new THREE.TorusGeometry(0.085, 0.014, 10, 36), gold, emblem, [0, 0, 0.004]);
  const star = new THREE.ExtrudeGeometry(starShape(0.055, 0.024), {
    depth: 0.012,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.004,
    bevelSegments: 2,
  });
  kit.mesh(star, jacket, emblem, [0, 0, 0.006]);
  // Shoulder straps: an arc over each shoulder plus a strip down the chest.
  const strapArc = new THREE.TorusGeometry(0.175, 0.016, 6, 20, Math.PI);
  const strapDown = new THREE.CapsuleGeometry(0.016, 0.16, 3, 6);
  for (const s of [-1, 1]) {
    kit.mesh(strapArc, packDark, spine, [s * 0.12 * widthF, 0.27, -0.005], [0, -Math.PI / 2, 0], [1, 0.95, 2.2]);
    kit.mesh(strapDown, packDark, spine, [s * 0.12 * widthF, 0.18, 0.168], [-0.08, 0, 0], [2.2, 1, 1]);
  }

  // ---- Arms ----------------------------------------------------------------------------------
  const shoulderGeo = new THREE.SphereGeometry(0.078 * limbF, 18, 14);
  const upperArmGeo = limbGeometry(0.072 * limbF, 0.062 * limbF, UPPER_ARM_LEN);
  const elbowGeo = new THREE.SphereGeometry(0.063 * limbF, 14, 10);
  const forearmGeo = limbGeometry(0.062 * limbF, 0.058 * limbF, FOREARM_LEN - 0.03);
  const cuffGeo = new THREE.TorusGeometry(0.058 * limbF, 0.018, 8, 20);
  const handGeo = new THREE.SphereGeometry(0.06 * limbF, 16, 12);
  const thumbGeo = new THREE.SphereGeometry(0.025 * limbF, 10, 8);
  const makeArm = (side: number): Limb => {
    const upper = new THREE.Group();
    upper.position.set(side * shoulderX, SHOULDER_Y, -0.01);
    spine.add(upper);
    kit.mesh(shoulderGeo, jacket, upper, [-0.012 * Math.sign(side), -0.015, 0], undefined, [1, 1, 0.95]);
    kit.mesh(upperArmGeo, jacket, upper);
    const lower = new THREE.Group();
    lower.position.y = -UPPER_ARM_LEN;
    upper.add(lower);
    kit.mesh(elbowGeo, jacket, lower);
    kit.mesh(forearmGeo, jacket, lower);
    kit.mesh(cuffGeo, jacketDark, lower, [0, -FOREARM_LEN + 0.015, 0], [Math.PI / 2, 0, 0]);
    const end = new THREE.Group();
    end.position.y = -FOREARM_LEN - 0.05;
    lower.add(end);
    kit.mesh(handGeo, glove, end, [0, 0, 0], undefined, [0.85, 1.1, 1]);
    kit.mesh(thumbGeo, glove, end, [-side * 0.01, 0.01, 0.05]);
    return { upper, lower, end };
  };
  const armL = makeArm(1);
  const armR = makeArm(-1);

  // ---- Head ----------------------------------------------------------------------------------
  const head = new THREE.Group();
  head.position.set(0, 0.49, 0.015);
  spine.add(head);
  const face = new THREE.Group();
  face.position.y = 0.155;
  head.add(face);
  const headScale: [number, number, number] = [1, 0.97, 0.96];
  kit.mesh(new THREE.SphereGeometry(HEAD_R, 40, 28), skin, face, [0, 0, 0], undefined, headScale);

  const onHead = (x: number, y: number, inset = 0): number => {
    const z2 = HEAD_R * HEAD_R - x * x - y * y;
    return Math.sqrt(Math.max(0, z2)) * headScale[2] - inset;
  };
  const eyeGeo = new THREE.SphereGeometry(0.034 * F, 20, 16);
  const glintGeo = new THREE.SphereGeometry(0.0095 * F, 8, 6);
  const browGeo = new THREE.CapsuleGeometry(0.0085 * F, 0.036 * F, 3, 6);
  const blushGeo = new THREE.SphereGeometry(0.027 * F, 12, 8);
  const earGeo = new THREE.SphereGeometry(0.036 * F, 12, 10);
  for (const s of [-1, 1]) {
    const ex = s * 0.06 * F;
    const ey = -0.018 * F;
    kit.mesh(eyeGeo, eye, face, [ex, ey, onHead(ex, ey, 0.011 * F)], [0, s * 0.35, 0], [0.7, 1.15, 0.42]);
    kit.mesh(glintGeo, white, face, [ex + 0.009 * F, ey + 0.015 * F, onHead(ex + 0.009 * F, ey + 0.015 * F, -0.002)]);
    const bx = s * 0.064 * F;
    const by = 0.05 * F;
    kit.mesh(browGeo, hair, face, [bx, by, onHead(bx, by, 0.003)], [0, s * 0.35, Math.PI / 2 - s * 0.1]);
    const cx = s * 0.1 * F;
    const cy = -0.058 * F;
    kit.mesh(blushGeo, blush, face, [cx, cy, onHead(cx, cy, 0.008 * F)], [0, s * 0.6, 0], [1, 0.6, 0.35]);
    kit.mesh(earGeo, skin, face, [s * HEAD_R * 0.97, -0.015 * F, -0.008], undefined, [0.45, 1, 0.75]);
  }
  kit.mesh(new THREE.SphereGeometry(0.017 * F, 10, 8), skin, face, [0, -0.045 * F, onHead(0, -0.045 * F, -0.004)]);
  const my = -0.088 * F;
  kit.mesh(new THREE.TorusGeometry(0.014 * F, 0.0045 * F, 6, 14, Math.PI), mouthM, face, [0, my + 0.01 * F, onHead(0, my, 0.0) + 0.012 * F], [0.25, 0, Math.PI]);

  const hairSway = buildHair(kit, hair, face, a.hairStyle, a.jacketColor);

  // Every mesh casts shadows. The head's many overlapping little parts don't receive them:
  // self-shadowing there only produces acne along the seams at game shadow-map resolutions.
  body.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  head.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.receiveShadow = false;
  });

  return { body, hips, spine, head, armL, armR, legL, legR, pack, hairSway, shoulderX };
}

/**
 * Hair cap around a head of radius R. The hairline height (as the y of a unit direction) runs
 * from `front` at the forehead to `back` at the nape; below it the surface tucks under the skin.
 */
function hairCapGeometry(R: number, front: number, back: number, puff: number): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(R, 48, 32);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const az = Math.atan2(v.x, v.z); // 0 at the face
    const backness = (1 - Math.cos(az)) / 2;
    // Slight dip at the temples so the sides frame the face.
    const line = lerp(front, back, Math.pow(backness, 1.8)) - 0.1 * Math.sin(backness * Math.PI);
    const inside = smoothstep(line - 0.05, line + 0.12, v.y);
    const top = Math.max(0, v.y);
    const r = R * lerp(0.9, puff + 0.05 * top, inside);
    v.multiplyScalar(r);
    v.y += 0.012 * top * inside;
    pos.setXYZ(i, v.x, v.y, v.z * 0.98 - 0.004);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Hair styles: 0 short, 1 spiky, 2 long, 3 ponytail. Returns a pivot for hair secondary motion. */
function buildHair(kit: Kit, hair: THREE.Material, face: THREE.Group, style: number, accent: string): THREE.Group | null {
  const R = HEAD_R;
  const s = ((Math.round(style) % 4) + 4) % 4;
  const group = new THREE.Group();
  face.add(group);

  // Skull cap: one smooth sphere whose vertices below a hairline sink inside the head, so the
  // hair has a soft, continuous edge instead of seams between intersecting shells.
  const front = s === 1 ? 0.36 : 0.3;
  const back = s === 2 ? -0.85 : -0.62;
  kit.mesh(hairCapGeometry(R, front, back, s === 1 ? 1.07 : 1.075), hair, group);

  const up = new THREE.Vector3(0, 1, 0);
  const zAxis = new THREE.Vector3(0, 0, 1);
  const surface = (az: number, el: number, scale = 1.04): THREE.Vector3 =>
    new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(R * scale);

  const tuft = new THREE.SphereGeometry(0.06 * F, 16, 12);
  const addFringe = (count: number, spread: number, el: number, size = 1): void => {
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : i / (count - 1) - 0.5;
      const az = t * spread;
      const p = surface(az, el, 1.0);
      const n = p.clone().normalize();
      const m = kit.mesh(tuft, hair, group, [p.x, p.y - 0.012, p.z]);
      m.quaternion.setFromUnitVectors(zAxis, n);
      m.rotateZ(t * 0.6);
      const big = 1 - Math.abs(t) * 0.35;
      m.scale.set(0.95 * size * big, 1.15 * size * big, 0.42);
    }
  };

  let sway: THREE.Group | null = null;

  if (s === 0) {
    // Short: soft fringe swept to one side, short sideburns.
    addFringe(5, 1.75, 0.42);
    for (const side of [-1, 1]) {
      kit.mesh(new THREE.CapsuleGeometry(0.022, 0.04, 4, 8), hair, group, [side * 0.152, -0.03, 0.03], [0, 0, side * 0.12]);
    }
  } else if (s === 1) {
    // Spiky: rings of cones pointing out and swept back.
    const spike = new THREE.ConeGeometry(0.066 * F, 0.13 * F, 12);
    const rings: [number, number, number, number][] = [
      // count, elevation, azimuth spread, length scale
      [5, 0.55, 2.0, 0.8],
      [5, 0.95, 2.6, 1.0],
      [3, 1.3, 1.6, 0.95],
      [6, 0.5, 3.4, 0.9], // back ring (offset by PI)
    ];
    rings.forEach(([count, el, spread, len], ri) => {
      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0 : i / (count - 1) - 0.5;
        const az = (ri === 3 ? Math.PI : 0) + t * spread;
        const p = surface(az, el, 0.98);
        const dir = p.clone().normalize().add(new THREE.Vector3(0, 0.25, -0.75)).normalize();
        const m = kit.mesh(spike, hair, group, [p.x + dir.x * 0.05, p.y + dir.y * 0.05, p.z + dir.z * 0.05]);
        m.quaternion.setFromUnitVectors(up, dir);
        m.scale.set(1, len, 1);
      }
    });
    addFringe(3, 1.0, 0.45, 0.8);
  } else if (s === 2) {
    // Long: curtain of hair down to the shoulders, side locks framing the face.
    addFringe(4, 1.5, 0.45);
    sway = new THREE.Group();
    sway.position.set(0, 0.02, -0.05);
    group.add(sway);
    kit.mesh(limbGeometry(0.16, 0.13, 0.2, 24), hair, sway, [0, -0.02, -0.02], undefined, [1.08, 1, 0.62]);
    for (const side of [-1, 1]) {
      kit.mesh(limbGeometry(0.05 * F, 0.035 * F, 0.17 * F), hair, group, [side * R * 0.9, -0.0, 0.06], [0.05, 0, side * 0.1], [0.75, 1, 1.15]);
    }
  } else {
    // Ponytail: hair tie at the back of the head and a springy tail.
    addFringe(5, 1.6, 0.42);
    const tieY = 0.035 * F;
    const tieZ = -R * 1.0;
    kit.mesh(new THREE.TorusGeometry(0.034 * F, 0.014 * F, 8, 18), kit.mat(accent, 0.6), group, [0, tieY, tieZ - 0.005], [0.2, 0, 0]);
    sway = new THREE.Group();
    sway.position.set(0, tieY, tieZ - 0.012);
    group.add(sway);
    // Two-segment tail: a full bunch kicking slightly out, then a tapering tip.
    const seg1 = new THREE.Group();
    seg1.rotation.x = 0.35;
    sway.add(seg1);
    kit.mesh(limbGeometry(0.048 * F, 0.055 * F, 0.1 * F, 18), hair, seg1, [0, -0.01, 0], undefined, [1.1, 1, 0.9]);
    const seg2 = new THREE.Group();
    seg2.position.y = -0.1 * F;
    seg2.rotation.x = -0.3;
    seg1.add(seg2);
    kit.mesh(limbGeometry(0.052 * F, 0.016 * F, 0.17 * F, 18), hair, seg2, undefined, undefined, [1.1, 1, 0.85]);
  }
  return sway;
}

// ---------------------------------------------------------------------------------------------
// Pose
// ---------------------------------------------------------------------------------------------
interface Pose {
  hipY: number;
  hipX: number;
  hipRotX: number;
  hipRotY: number;
  hipRotZ: number;
  spineX: number;
  spineY: number;
  spineZ: number;
  headX: number;
  headY: number;
  headZ: number;
  thighL: number;
  thighR: number;
  thighSpread: number;
  kneeL: number;
  kneeR: number;
  ankleL: number;
  ankleR: number;
  shoulderLX: number;
  shoulderRX: number;
  shoulderLZ: number;
  shoulderRZ: number;
  elbowL: number;
  elbowR: number;
}

function zeroPose(): Pose {
  return {
    hipY: 0, hipX: 0, hipRotX: 0, hipRotY: 0, hipRotZ: 0,
    spineX: 0, spineY: 0, spineZ: 0, headX: 0, headY: 0, headZ: 0,
    thighL: 0, thighR: 0, thighSpread: 0, kneeL: 0, kneeR: 0, ankleL: 0, ankleR: 0,
    shoulderLX: 0, shoulderRX: 0, shoulderLZ: 0, shoulderRZ: 0, elbowL: 0, elbowR: 0,
  };
}

const POSE_KEYS = Object.keys(zeroPose()) as (keyof Pose)[];

function addPose(out: Pose, p: Pose, w: number): void {
  if (w <= 0) return;
  for (const k of POSE_KEYS) out[k] += p[k] * w;
}

/** Tunables for the avatar's procedural animation. */
export const AVATAR_ANIM = {
  /** Speed (m/s) where the run cycle is fully blended in. */
  runBlendStart: 4.7,
  runBlendEnd: 7.0,
  walkLegSwing: 0.52,
  runLegSwing: 0.82,
  walkArmSwing: 0.42,
  runArmSwing: 0.95,
  walkBob: 0.022,
  runBob: 0.045,
  runLean: 0.32,
  /** Lean per m/s² of acceleration (forward when speeding up, back when braking). */
  accelLean: 0.02,
  landingSquash: 0.9,
};

class AvatarImpl implements Avatar {
  readonly root = new THREE.Group();
  private rig: Rig;
  private appearance: Appearance;

  // Animation state.
  private time = Math.random() * 10;
  private phase = 0;
  private speedS = 0;
  private prevSpeed = 0;
  private accelS = 0;
  private airW = 0;
  private riseW = 0;
  private airTime = 0;
  private wasAir = false;
  private squash: Spring = { x: 0, v: 0 };
  private packSpring: Spring = { x: 0, v: 0 };
  private hairSpring: Spring = { x: 0, v: 0 };
  private hairSide: Spring = { x: 0, v: 0 };
  private prevHipY = 0;
  private hipYVel = 0;
  private readonly pose = zeroPose();
  private readonly tmpIdle = zeroPose();
  private readonly tmpMove = zeroPose();
  private readonly tmpAir = zeroPose();

  constructor(appearance: Appearance) {
    this.root.name = 'avatar';
    this.appearance = { ...appearance };
    this.rig = buildRig(this.appearance);
    this.root.add(this.rig.body);
    this.animate(0, { speed: 0, anim: 'idle' });
  }

  setAppearance(a: Appearance): void {
    this.appearance = { ...a };
    this.root.remove(this.rig.body);
    disposeTree(this.rig.body);
    this.rig = buildRig(this.appearance);
    this.root.add(this.rig.body);
    this.applyPose(this.pose);
  }

  animate(dtIn: number, snap: Pick<PlayerSnapshot, 'speed' | 'anim'>): void {
    const dt = clamp(dtIn, 0, 0.1);
    const T = AVATAR_ANIM;
    this.time += dt;
    const anim: MoveAnim = snap.anim;
    const air = anim === 'jump' || anim === 'fall';
    const speed = Math.max(0, snap.speed || 0);

    this.speedS = damp(this.speedS, speed, 9, dt);
    if (dt > 0) {
      const accel = (this.speedS - this.prevSpeed) / dt;
      this.accelS = damp(this.accelS, clamp(accel, -30, 30), 6, dt);
    }
    this.prevSpeed = this.speedS;

    // Air / landing.
    this.airW = damp(this.airW, air ? 1 : 0, air ? 9 : 16, dt);
    this.riseW = damp(this.riseW, anim === 'jump' ? 1 : 0, 5, dt);
    if (air) {
      if (!this.wasAir) this.squash.v += 0.9; // take-off stretch
      this.airTime += dt;
    } else if (this.wasAir) {
      const impact = smoothstep(0.05, 0.9, this.airTime);
      this.squash.v -= T.landingSquash * (0.5 + 1.5 * impact);
      this.airTime = 0;
    }
    this.wasAir = air;
    stepSpring(this.squash, 0, 260, 0.42, dt);
    const squash = clamp(this.squash.x, -0.16, 0.1);

    // Locomotion weights.
    const s = this.speedS;
    const moveW = smoothstep(0.08, 1.4, s);
    const runT = smoothstep(T.runBlendStart, T.runBlendEnd, s);
    const groundW = 1 - this.airW;
    const ampScale = 0.35 + 0.65 * smoothstep(0.2, 3.5, s);
    const legAmp = lerp(T.walkLegSwing, T.runLegSwing, runT) * ampScale;
    // Phase advances with distance so feet plant instead of skating.
    const cycleLen = Math.max(0.5, 4 * LEG_LEN * Math.sin(legAmp) * lerp(1.0, 1.12, runT));
    this.phase = (this.phase + ((Math.PI * 2 * s * dt) / cycleLen) * groundW) % (Math.PI * 4);
    const p = this.phase;
    const sp = Math.sin(p);
    const cp = Math.cos(p);
    const t = this.time;

    // ---- Idle --------------------------------------------------------------------------------
    const idle = this.tmpIdle;
    {
      const breath = Math.sin(t * Math.PI * 2 * 0.27);
      const sway = Math.sin(t * 0.55);
      const look = Math.sin(t * 0.21) * Math.sin(t * 0.13 + 1.3);
      Object.assign(idle, zeroPose());
      idle.hipY = -0.012 + 0.004 * breath;
      idle.hipX = 0.012 * sway;
      idle.hipRotZ = -0.025 * sway;
      idle.spineX = 0.02 + 0.018 * breath;
      idle.spineZ = 0.03 * sway;
      idle.headX = -0.02 - 0.012 * breath;
      idle.headY = 0.16 * look;
      idle.headZ = -0.012 * sway;
      idle.thighL = -0.02;
      idle.thighR = 0.02;
      idle.thighSpread = 0.035;
      idle.kneeL = 0.07 + 0.03 * Math.max(0, sway);
      idle.kneeR = 0.07 + 0.03 * Math.max(0, -sway);
      idle.ankleL = -0.05;
      idle.ankleR = -0.05;
      idle.shoulderLX = 0.04 + 0.02 * breath;
      idle.shoulderRX = 0.04 + 0.02 * breath;
      idle.shoulderLZ = 0.16 + 0.025 * breath;
      idle.shoulderRZ = -0.16 - 0.025 * breath;
      idle.elbowL = -0.18 - 0.03 * breath;
      idle.elbowR = -0.18 - 0.03 * breath;
    }

    // ---- Walk/run cycle (shares one phase; walk and run differ in amplitude and shape) -------
    const mv = this.tmpMove;
    {
      Object.assign(mv, zeroPose());
      const kneeAmp = lerp(0.75, 1.55, runT) * ampScale;
      const armAmp = lerp(T.walkArmSwing, T.runArmSwing, runT) * ampScale;
      const thighBias = lerp(-0.04, -0.22, runT);
      mv.thighL = thighBias - sp * legAmp;
      mv.thighR = thighBias + sp * legAmp;
      // Knee bends most mid-swing (thigh moving forward), slight flex in stance.
      const stanceFlex = lerp(0.12, 0.35, runT);
      mv.kneeL = stanceFlex + kneeAmp * Math.pow(Math.max(0, cp), 1.3);
      mv.kneeR = stanceFlex + kneeAmp * Math.pow(Math.max(0, -cp), 1.3);
      // Keep feet near flat on contact, toes drop during swing.
      mv.ankleL = -(mv.thighL + mv.kneeL) * 0.75 + 0.15 * Math.max(0, cp) * runT;
      mv.ankleR = -(mv.thighR + mv.kneeR) * 0.75 + 0.15 * Math.max(0, -cp) * runT;
      mv.thighSpread = 0.02;
      const c2 = Math.cos(2 * p);
      mv.hipY = lerp(T.walkBob * c2, -T.runBob * c2, runT) - lerp(0.02, 0.07, runT);
      mv.hipRotY = 0.13 * sp * lerp(1, 0.7, runT);
      mv.hipRotZ = 0.04 * sp * (1 - runT * 0.5);
      mv.hipX = -0.012 * sp * (1 - runT);
      mv.spineX = lerp(0.05, T.runLean, runT);
      mv.spineY = -0.2 * sp * lerp(1, 1.3, runT);
      mv.spineZ = -0.025 * sp;
      mv.headX = -mv.spineX * 0.7;
      mv.headY = -mv.spineY * 0.7 - mv.hipRotY * 0.8;
      mv.shoulderLX = sp * armAmp + lerp(0.02, -0.15, runT);
      mv.shoulderRX = -sp * armAmp + lerp(0.02, -0.15, runT);
      mv.shoulderLZ = lerp(0.13, 0.2, runT);
      mv.shoulderRZ = -lerp(0.13, 0.2, runT);
      mv.elbowL = -lerp(0.25, 1.35, runT) - lerp(0.35, 0.3, runT) * Math.max(0, -sp);
      mv.elbowR = -lerp(0.25, 1.35, runT) - lerp(0.35, 0.3, runT) * Math.max(0, sp);
    }

    // ---- Air: tucked jump vs. arms-out fall --------------------------------------------------
    const ap = this.tmpAir;
    {
      const r = this.riseW;
      const flail = Math.sin(t * 7) * 0.08 * (1 - r);
      Object.assign(ap, zeroPose());
      ap.hipY = lerp(0.0, 0.03, r);
      ap.spineX = lerp(-0.04, 0.14, r);
      ap.headX = lerp(-0.08, -0.1, r);
      ap.thighL = lerp(-0.45, -1.15, r);
      ap.thighR = lerp(-0.1, -0.75, r);
      ap.kneeL = lerp(0.55, 1.5, r);
      ap.kneeR = lerp(0.35, 1.45, r);
      ap.ankleL = lerp(0.1, 0.0, r);
      ap.ankleR = lerp(0.2, 0.1, r);
      ap.thighSpread = 0.06;
      ap.shoulderLX = lerp(-0.35, -0.55, r) + flail;
      ap.shoulderRX = lerp(-0.35, 0.25, r) - flail;
      ap.shoulderLZ = lerp(0.95, 0.45, r);
      ap.shoulderRZ = -lerp(0.95, 0.5, r);
      ap.elbowL = -lerp(0.45, 1.1, r);
      ap.elbowR = -lerp(0.45, 0.7, r);
    }

    // ---- Blend -------------------------------------------------------------------------------
    const out = this.pose;
    Object.assign(out, zeroPose());
    addPose(out, idle, groundW * (1 - moveW));
    addPose(out, mv, groundW * moveW);
    addPose(out, ap, this.airW);
    // Weight: lean into acceleration, rock back when braking.
    const accelLean = clamp(this.accelS * T.accelLean, -0.18, 0.18) * groundW;
    out.spineX += accelLean;
    out.headX -= accelLean * 0.5;
    // Landing squash: knees give, hips drop.
    const give = Math.max(0, -squash);
    out.kneeL += give * 3.2;
    out.kneeR += give * 3.2;
    out.thighL -= give * 1.6;
    out.thighR -= give * 1.6;
    out.ankleL -= give * 1.5;
    out.ankleR -= give * 1.5;
    out.hipY -= give * 0.55;
    out.spineX += give * 1.2;
    out.headX -= give * 0.6;

    this.applyPose(out);
    const body = this.rig.body;
    body.scale.set(1 - squash * 0.35, 1 + squash * 0.6, 1 - squash * 0.35);

    // ---- Secondary motion: backpack bounce and hair --------------------------------------------
    if (dt > 0) {
      this.hipYVel = damp(this.hipYVel, (out.hipY - this.prevHipY) / dt, 20, dt);
    }
    this.prevHipY = out.hipY;
    const packTarget = clamp(0.05 * s * runT + this.hipYVel * 0.9 + this.airW * (0.18 - 0.3 * this.riseW), -0.08, 0.35);
    stepSpring(this.packSpring, packTarget, 150, 0.32, dt);
    this.rig.pack.rotation.x = this.packSpring.x;
    if (this.rig.hairSway) {
      const hairTarget = clamp(0.025 * s + this.hipYVel * 0.6 - this.accelS * 0.02 + this.airW * (0.3 - this.riseW * 0.6), -0.3, 0.35);
      stepSpring(this.hairSpring, hairTarget, 70, 0.3, dt);
      stepSpring(this.hairSide, -out.spineY * 0.8 - out.hipRotZ * 2, 60, 0.3, dt);
      this.rig.hairSway.rotation.x = this.hairSpring.x;
      this.rig.hairSway.rotation.z = this.hairSide.x;
    }
  }

  private applyPose(p: Pose): void {
    const r = this.rig;
    r.hips.position.set(p.hipX, HIPS_Y + p.hipY, 0);
    r.hips.rotation.set(p.hipRotX, p.hipRotY, p.hipRotZ);
    r.spine.rotation.set(p.spineX, p.spineY, p.spineZ);
    r.head.rotation.set(p.headX, p.headY, p.headZ);
    r.legL.upper.rotation.set(p.thighL, 0, p.thighSpread);
    r.legR.upper.rotation.set(p.thighR, 0, -p.thighSpread);
    r.legL.lower.rotation.x = p.kneeL;
    r.legR.lower.rotation.x = p.kneeR;
    r.legL.end.rotation.x = p.ankleL;
    r.legR.end.rotation.x = p.ankleR;
    r.armL.upper.rotation.set(p.shoulderLX, 0, p.shoulderLZ);
    r.armR.upper.rotation.set(p.shoulderRX, 0, p.shoulderRZ);
    r.armL.lower.rotation.x = p.elbowL;
    r.armR.lower.rotation.x = p.elbowR;
  }

  dispose(): void {
    disposeTree(this.rig.body);
    this.root.remove(this.rig.body);
  }
}

function disposeTree(obj: THREE.Object3D): void {
  const geos = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>();
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      geos.add(m.geometry);
      if (Array.isArray(m.material)) m.material.forEach((x) => mats.add(x));
      else mats.add(m.material);
    }
  });
  geos.forEach((g) => g.dispose());
  mats.forEach((m) => m.dispose());
}

export function createAvatar(appearance: Appearance): Avatar {
  return new AvatarImpl(appearance);
}
