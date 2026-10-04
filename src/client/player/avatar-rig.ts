import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Appearance } from '../../shared/types';
import { clamp, lerp, smoothstep } from './anim-math';

/**
 * The trainer model: a chunky, stylised humanoid (~1.75 m) in a hoodie with a backpack, built
 * from smooth primitives on a real joint hierarchy:
 *
 *   body ─ pelvis ─┬─ thigh ─ shin ─ foot ─ toe            (x2)
 *                  └─ spine ─ chest ─┬─ neck ─ head ─ face/hair
 *                                    ├─ clavicle ─ upper arm ─ forearm ─ hand   (x2)
 *                                    ├─ pack, hood, drawstrings (spring driven)
 *                                    └─ (spine) hem (cloth lag)
 *
 * Feet are at y = 0 and the model faces +Z; +X is the character's left. Every limb bone rests
 * along -Y so two-bone IK can drive the legs.
 */

// ---------------------------------------------------------------------------------------------
// Dimensions (metres)
// ---------------------------------------------------------------------------------------------
export const RIG = {
  /** Height of the ankle joint above the sole. */
  ankleH: 0.085,
  thigh: 0.385,
  shin: 0.37,
  /** Pelvis pivot height at rest; hip joints sit just below it. */
  hipsY: 0.875,
  hipJointY: -0.035,
  hipX: 0.092,
  /** Heel and ball of the foot relative to the ankle (for heel-strike / toe-off roll). */
  heelBack: 0.07,
  ballFwd: 0.115,
  spineY: 0.06,
  chestY: 0.17,
  neckY: 0.215,
  headY: 0.065,
  /** Head sphere radius and the face centre above the head pivot. */
  headR: 0.178,
  faceY: 0.15,
  clavX: 0.05,
  clavY: 0.19,
  shoulderX: 0.215,
  upperArm: 0.255,
  forearm: 0.215,
} as const;

/** Standing hip-joint height above the ground. */
export const HIP_HEIGHT = RIG.hipsY + RIG.hipJointY;
export const LEG_LEN = RIG.thigh + RIG.shin;

const SHOE_COLOR = '#5c6068';
const SHOE_DARK = '#42464d';
const SOLE_COLOR = '#ece8df';
const GLOVE_COLOR = '#2a282d';
const PACK_COLOR = '#34363b';
const PACK_DARK = '#232428';
const PACK_TRIM = '#8d929a';
const EMBLEM_LIGHT = '#e9e6df';
const EMBLEM_DARK = '#4a4d54';
const EYE_COLOR = '#211c26';
const STRING_COLOR = '#f4efe6';

// ---------------------------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------------------------

/**
 * Tapered limb: a lathe with a half-sphere at each end. Origin at the top joint, extending down
 * -Y by `len`, so it can be parented directly under a joint.
 */
function limbGeometry(rTop: number, rBot: number, len: number, radial = 18, bulge = 0): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(0, Math.cos(a)) * rBot, -len + Math.sin(a) * rBot));
  }
  // Optional muscle bulge along the shaft (upper third).
  const mid = 6;
  for (let i = 1; i < mid; i++) {
    const t = i / mid;
    const r = lerp(rBot, rTop, t) * (1 + bulge * Math.sin(Math.PI * Math.pow(t, 0.8)));
    pts.push(new THREE.Vector2(r, -len + len * t));
  }
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(0, Math.cos(a)) * rTop, Math.sin(a) * rTop));
  }
  pts[0].x = 0;
  pts[pts.length - 1].x = 0;
  return new THREE.LatheGeometry(pts, radial);
}

/** Lathe from a (radius, y) profile, closed at both ends. */
function profileLathe(profile: [number, number][], radial = 36): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    radial,
  );
}

class Kit {
  private readonly mats = new Map<string, THREE.MeshStandardMaterial>();

  mat(color: THREE.ColorRepresentation, roughness = 0.78): THREE.MeshStandardMaterial {
    const c = new THREE.Color(color);
    const k = `${c.getHexString()}-${roughness}`;
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

function group(parent: THREE.Object3D, name: string, x = 0, y = 0, z = 0): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

// ---------------------------------------------------------------------------------------------
// Rig
// ---------------------------------------------------------------------------------------------
export interface LegRig {
  thigh: THREE.Group;
  shin: THREE.Group;
  foot: THREE.Group;
  toe: THREE.Group;
}

export interface ArmRig {
  clav: THREE.Group;
  upper: THREE.Group;
  fore: THREE.Group;
  hand: THREE.Group;
}

export interface Rig {
  body: THREE.Group;
  pelvis: THREE.Group;
  spine: THREE.Group;
  chest: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  legL: LegRig;
  legR: LegRig;
  armL: ArmRig;
  armR: ArmRig;
  /** Pendulum pivot at the top of the backpack. */
  pack: THREE.Group;
  /** Bunched hood behind the neck. */
  hood: THREE.Group;
  /** Hoodie hem band; lags the hips a little. */
  hem: THREE.Group;
  /** Drawstring pivots (left, right). */
  strings: THREE.Group[];
  /** Long hair / ponytail pivot, if the style has one. */
  hairSway: THREE.Group | null;
  /** Whole hair group, for a subtle bounce. */
  hair: THREE.Group;
  /** Eye meshes, scaled on Y to blink. */
  eyes: THREE.Object3D[];
  /** Shoulder joint x offset from the chest centre (build dependent). */
  shoulderX: number;
}

export function buildRig(a: Appearance): Rig {
  const kit = new Kit();
  const build = clamp(a.build, 0, 1);
  const widthF = 1.1 + 0.14 * build;
  const limbF = 1 + 0.12 * build;
  const shoulderX = RIG.shoulderX * (1 + 0.1 * build);
  const F = RIG.headR / 0.165;

  const skin = kit.mat(a.skinTone, 0.6);
  const hair = kit.mat(a.hairColor, 0.62);
  const jacket = kit.mat(a.jacketColor, 0.82);
  const jacketDark = kit.mat(shade(a.jacketColor, 0.7), 0.85);
  const pants = kit.mat(a.pantsColor, 0.86);
  const pantsDark = kit.mat(shade(a.pantsColor, 0.72), 0.86);
  const shoe = kit.mat(SHOE_COLOR, 0.72);
  const shoeDark = kit.mat(SHOE_DARK, 0.72);
  const sole = kit.mat(SOLE_COLOR, 0.8);
  const glove = kit.mat(GLOVE_COLOR, 0.7);
  const packM = kit.mat(PACK_COLOR, 0.8);
  const packDark = kit.mat(PACK_DARK, 0.8);
  const packTrim = kit.mat(PACK_TRIM, 0.7);
  const emblemLight = kit.mat(EMBLEM_LIGHT, 0.5);
  const emblemDark = kit.mat(EMBLEM_DARK, 0.6);
  const eye = kit.mat(EYE_COLOR, 0.25);
  const white = kit.mat('#ffffff', 0.3);
  const strings = kit.mat(STRING_COLOR, 0.7);
  const blush = kit.mat(new THREE.Color(a.skinTone).lerp(new THREE.Color('#ff7a6b'), 0.45), 0.65);
  const mouthM = kit.mat('#7a3b33', 0.6);

  const body = new THREE.Group();
  body.name = 'avatar-body';
  const pelvis = group(body, 'pelvis', 0, RIG.hipsY, 0);
  pelvis.rotation.order = 'YXZ';

  // ---- Pelvis: seat of the pants and a belt line under the hoodie --------------------------
  kit.mesh(new THREE.SphereGeometry(0.16, 28, 18), pants, pelvis, [0, -0.035, -0.005], undefined, [widthF * 0.98, 0.72, 0.86]);

  // ---- Legs -----------------------------------------------------------------------------------
  const thighGeo = limbGeometry(0.094 * limbF, 0.072 * limbF, RIG.thigh, 18, 0.06);
  const kneeGeo = new THREE.SphereGeometry(0.073 * limbF, 16, 12);
  const shinGeo = limbGeometry(0.071 * limbF, 0.06 * limbF, RIG.shin - 0.05, 18, 0.08);
  const hemGeo = limbGeometry(0.07 * limbF, 0.072 * limbF, 0.05, 18);
  const heelGeo = new RoundedBoxGeometry(0.118 * limbF, 0.085, 0.2, 4, 0.04);
  const heelSoleGeo = new RoundedBoxGeometry(0.124 * limbF, 0.03, 0.205, 3, 0.013);
  const toeGeo = new RoundedBoxGeometry(0.116 * limbF, 0.062, 0.1, 4, 0.03);
  const toeSoleGeo = new RoundedBoxGeometry(0.122 * limbF, 0.03, 0.105, 3, 0.013);
  const toeCapGeo = new THREE.SphereGeometry(0.058 * limbF, 16, 10);
  const tongueGeo = new RoundedBoxGeometry(0.07, 0.05, 0.09, 3, 0.02);
  const makeLeg = (side: number): LegRig => {
    const thigh = group(pelvis, side > 0 ? 'thighL' : 'thighR', side * RIG.hipX * widthF * 0.92, RIG.hipJointY, 0);
    kit.mesh(thighGeo, pants, thigh);
    const shin = group(thigh, 'shin', 0, -RIG.thigh, 0);
    kit.mesh(kneeGeo, pants, shin, [0, 0, 0.004]);
    kit.mesh(shinGeo, pants, shin);
    // Pants hem flaring a little over the shoe.
    kit.mesh(hemGeo, pantsDark, shin, [0, -RIG.shin + 0.085, -0.004]);
    const foot = group(shin, 'foot', 0, -RIG.shin, 0);
    const A = RIG.ankleH;
    // Heel / mid-foot block from the heel to the ball.
    const midZ = (RIG.ballFwd - RIG.heelBack) / 2;
    kit.mesh(heelGeo, shoe, foot, [0, -A + 0.058, midZ - 0.008]);
    kit.mesh(heelSoleGeo, sole, foot, [0, -A + 0.015, midZ - 0.006]);
    kit.mesh(tongueGeo, shoeDark, foot, [0, -A + 0.1, midZ + 0.035], [0.35, 0, 0]);
    // Toe box pivots at the ball so the toes stay flat during push-off.
    const toe = group(foot, 'toe', 0, -A, RIG.ballFwd);
    kit.mesh(toeGeo, shoe, toe, [0, 0.042, 0.03]);
    kit.mesh(toeCapGeo, shoe, toe, [0, 0.036, 0.062], undefined, [1, 0.62, 0.9]);
    kit.mesh(toeSoleGeo, sole, toe, [0, 0.015, 0.034]);
    return { thigh, shin, foot, toe };
  };
  const legL = makeLeg(1);
  const legR = makeLeg(-1);

  // ---- Spine & hoodie --------------------------------------------------------------------------
  const spine = group(pelvis, 'spine', 0, RIG.spineY, 0);
  spine.rotation.order = 'YXZ';
  const chest = group(spine, 'chest', 0, RIG.chestY, 0);
  chest.rotation.order = 'YXZ';
  const torsoScale: [number, number, number] = [widthF, 1, 0.8];

  // Lower hoodie (belly to waist) rides the spine; the upper hoodie rides the chest, and they
  // overlap so bending never opens a gap.
  const lower = profileLathe([
    [0.0, -0.13],
    [0.17, -0.13],
    [0.196, -0.1],
    [0.2, -0.02],
    [0.197, 0.08],
    [0.19, 0.17],
    [0.17, 0.22],
    [0.0, 0.22],
  ]);
  kit.mesh(lower, jacket, spine, [0, 0, 0], undefined, torsoScale);
  const upper = profileLathe([
    [0.0, -0.08],
    [0.188, -0.08],
    [0.198, -0.02],
    [0.208, 0.06],
    [0.212, 0.13],
    [0.198, 0.2],
    [0.16, 0.25],
    [0.1, 0.275],
    [0.0, 0.28],
  ]);
  kit.mesh(upper, jacket, chest, [0, 0, 0], undefined, torsoScale);
  // Ribbed hem band on its own pivot so it can lag behind hip motion.
  const hem = group(spine, 'hem', 0, -0.1, 0);
  hem.rotation.order = 'YXZ';
  kit.mesh(new THREE.TorusGeometry(0.188, 0.034, 10, 36), jacketDark, hem, [0, -0.02, 0], [Math.PI / 2, 0, 0], [widthF, 0.82, 1]);
  // Kangaroo pocket.
  kit.mesh(new RoundedBoxGeometry(0.24, 0.1, 0.05, 3, 0.022), jacketDark, spine, [0, -0.01, 0.148], [-0.06, 0, 0], [widthF * 0.95, 1, 1]);
  // Zip / seam line hint down the front of the chest.
  kit.mesh(new RoundedBoxGeometry(0.012, 0.16, 0.012, 2, 0.005), jacketDark, chest, [0, 0.12, 0.17], [-0.12, 0, 0]);

  // Hood: rim around the neck and the bunched hood resting behind it.
  kit.mesh(new THREE.TorusGeometry(0.098, 0.044, 12, 28), jacketDark, chest, [0, 0.262, -0.008], [Math.PI / 2 + 0.25, 0, 0], [1.08, 1, 1]);
  const hood = group(chest, 'hood', 0, 0.27, -0.06);
  kit.mesh(new THREE.SphereGeometry(0.15, 24, 16), jacket, hood, [0, -0.03, -0.085], [0.4, 0, 0], [1.15, 0.72, 0.62]);
  kit.mesh(new THREE.SphereGeometry(0.11, 20, 14), jacketDark, hood, [0, 0.0, -0.05], [0.4, 0, 0], [1.1, 0.5, 0.5]);

  // Drawstrings dangle from pivots at the collar.
  const stringGeo = new THREE.CapsuleGeometry(0.0075, 0.1, 3, 6);
  const tipGeo = new THREE.SphereGeometry(0.0135, 8, 6);
  const stringPivots: THREE.Group[] = [];
  for (const s of [1, -1]) {
    const p = group(chest, 'drawstring', s * 0.04, 0.235, 0.172);
    kit.mesh(stringGeo, strings, p, [0, -0.06, 0]);
    kit.mesh(tipGeo, strings, p, [0, -0.125, 0.003]);
    stringPivots.push(p);
  }

  // ---- Neck & head ----------------------------------------------------------------------------
  const neck = group(chest, 'neck', 0, RIG.neckY, 0.012);
  neck.rotation.order = 'YXZ';
  kit.mesh(new THREE.CylinderGeometry(0.052, 0.06, 0.13, 14), skin, neck, [0, 0.04, 0]);
  const head = group(neck, 'head', 0, RIG.headY, 0.005);
  head.rotation.order = 'YXZ';
  const face = group(head, 'face', 0, RIG.faceY, 0);
  const R = RIG.headR;
  const headScale: [number, number, number] = [1, 0.97, 0.96];
  kit.mesh(new THREE.SphereGeometry(R, 40, 28), skin, face, [0, 0, 0], undefined, headScale);
  const onHead = (x: number, y: number, inset = 0): number => {
    const z2 = R * R - x * x - y * y;
    return Math.sqrt(Math.max(0, z2)) * headScale[2] - inset;
  };
  const eyeGeo = new THREE.SphereGeometry(0.034 * F, 20, 16);
  const glintGeo = new THREE.SphereGeometry(0.0095 * F, 8, 6);
  const browGeo = new THREE.CapsuleGeometry(0.0085 * F, 0.036 * F, 3, 6);
  const blushGeo = new THREE.SphereGeometry(0.027 * F, 12, 8);
  const earGeo = new THREE.SphereGeometry(0.036 * F, 12, 10);
  const eyes: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const ex = s * 0.06 * F;
    const ey = -0.018 * F;
    // Each eye (with its glint) sits in a group scaled on Y to blink.
    const eg = group(face, 'eye', ex, ey, onHead(ex, ey, 0.011 * F));
    kit.mesh(eyeGeo, eye, eg, [0, 0, 0], [0, s * 0.35, 0], [0.7, 1.15, 0.42]);
    kit.mesh(glintGeo, white, eg, [0.009 * F, 0.015 * F, onHead(ex + 0.009 * F, ey + 0.015 * F, -0.002) - onHead(ex, ey, 0.011 * F)]);
    eyes.push(eg);
    const bx = s * 0.064 * F;
    const by = 0.05 * F;
    kit.mesh(browGeo, hair, face, [bx, by, onHead(bx, by, 0.003)], [0, s * 0.35, Math.PI / 2 - s * 0.1]);
    const cx = s * 0.1 * F;
    const cy = -0.058 * F;
    kit.mesh(blushGeo, blush, face, [cx, cy, onHead(cx, cy, 0.008 * F)], [0, s * 0.6, 0], [1, 0.6, 0.35]);
    kit.mesh(earGeo, skin, face, [s * R * 0.97, -0.015 * F, -0.008], undefined, [0.45, 1, 0.75]);
  }
  kit.mesh(new THREE.SphereGeometry(0.017 * F, 10, 8), skin, face, [0, -0.045 * F, onHead(0, -0.045 * F, -0.004)]);
  const my = -0.088 * F;
  kit.mesh(new THREE.TorusGeometry(0.014 * F, 0.0045 * F, 6, 14, Math.PI), mouthM, face, [0, my + 0.01 * F, onHead(0, my, 0.0) + 0.012 * F], [0.25, 0, Math.PI]);
  const { group: hairGroup, sway: hairSway } = buildHair(kit, hair, face, a.hairStyle, a.jacketColor, R, F);

  // ---- Backpack (hangs from a pivot at its top so it can swing and bounce) ------------------
  // Rides the lower spine (not the chest) so its bottom stays against the lower back when the
  // chest bends; the pivot sits at the top, level with the shoulder blades.
  const pack = group(spine, 'pack', 0, RIG.chestY + 0.2, -0.17);
  pack.rotation.order = 'YXZ';
  const packBodyY = -0.2;
  kit.mesh(new RoundedBoxGeometry(0.34, 0.38, 0.17, 5, 0.07), packM, pack, [0, packBodyY, -0.075]);
  // Rolled top and a lighter trim band.
  kit.mesh(new THREE.CapsuleGeometry(0.06, 0.25, 6, 16), packDark, pack, [0, packBodyY + 0.19, -0.075], [0, 0, Math.PI / 2], [1, 1, 1.25]);
  kit.mesh(new RoundedBoxGeometry(0.345, 0.05, 0.175, 3, 0.022), packTrim, pack, [0, packBodyY - 0.15, -0.076]);
  // Side pockets.
  for (const s of [-1, 1]) {
    kit.mesh(new RoundedBoxGeometry(0.07, 0.18, 0.12, 3, 0.03), packDark, pack, [s * 0.18, packBodyY - 0.06, -0.075]);
  }
  // Front pocket with a round emblem: light disc, dark band, button.
  kit.mesh(new RoundedBoxGeometry(0.24, 0.2, 0.06, 4, 0.03), packDark, pack, [0, packBodyY - 0.03, -0.165]);
  const emblem = group(pack, 'emblem', 0, packBodyY - 0.015, -0.198);
  emblem.rotation.y = Math.PI;
  kit.mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.016, 36), emblemLight, emblem, [0, 0, 0], [Math.PI / 2, 0, 0]);
  kit.mesh(new THREE.TorusGeometry(0.068, 0.011, 10, 36), emblemDark, emblem, [0, 0, 0.003]);
  kit.mesh(new RoundedBoxGeometry(0.14, 0.018, 0.012, 2, 0.005), emblemDark, emblem, [0, 0, 0.009]);
  kit.mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.014, 24), emblemDark, emblem, [0, 0, 0.01], [Math.PI / 2, 0, 0]);
  kit.mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.016, 24), emblemLight, emblem, [0, 0, 0.012], [Math.PI / 2, 0, 0]);
  // Shoulder straps: an arc over each shoulder and a strip down the chest.
  const strapArc = new THREE.TorusGeometry(0.17, 0.016, 6, 20, Math.PI);
  const strapDown = new THREE.CapsuleGeometry(0.016, 0.15, 3, 6);
  for (const s of [-1, 1]) {
    kit.mesh(strapArc, packDark, chest, [s * 0.115 * widthF, 0.1, -0.005], [0, -Math.PI / 2, 0], [1, 0.95, 2.15]);
    kit.mesh(strapDown, packDark, chest, [s * 0.115 * widthF, 0.02, 0.165], [-0.06, 0, 0], [2.2, 1, 1]);
    kit.mesh(new RoundedBoxGeometry(0.04, 0.025, 0.02, 2, 0.008), packTrim, chest, [s * 0.115 * widthF, -0.04, 0.17]);
  }

  // ---- Arms -----------------------------------------------------------------------------------
  const shoulderGeo = new THREE.SphereGeometry(0.076 * limbF, 18, 14);
  const upperArmGeo = limbGeometry(0.07 * limbF, 0.058 * limbF, RIG.upperArm, 18, 0.05);
  const elbowGeo = new THREE.SphereGeometry(0.058 * limbF, 14, 10);
  const forearmGeo = limbGeometry(0.058 * limbF, 0.05 * limbF, RIG.forearm - 0.03, 18, 0.06);
  const cuffGeo = new THREE.TorusGeometry(0.05 * limbF, 0.017, 8, 20);
  const palmGeo = new RoundedBoxGeometry(0.062, 0.095, 0.1, 3, 0.027);
  const fingersGeo = new RoundedBoxGeometry(0.06, 0.07, 0.094, 3, 0.026);
  const thumbGeo = new THREE.CapsuleGeometry(0.02 * limbF, 0.04, 4, 8);
  const makeArm = (side: number): ArmRig => {
    const clav = group(chest, side > 0 ? 'clavL' : 'clavR', side * RIG.clavX, RIG.clavY, -0.01);
    const upper = group(clav, 'upperArm', side * (shoulderX - RIG.clavX), 0, 0);
    kit.mesh(shoulderGeo, jacket, upper, [-0.008 * side, -0.012, 0], undefined, [1, 1, 0.95]);
    kit.mesh(upperArmGeo, jacket, upper);
    const fore = group(upper, 'forearm', 0, -RIG.upperArm, 0);
    kit.mesh(elbowGeo, jacket, fore);
    kit.mesh(forearmGeo, jacket, fore);
    kit.mesh(cuffGeo, jacketDark, fore, [0, -RIG.forearm + 0.02, 0], [Math.PI / 2, 0, 0]);
    const hand = group(fore, 'hand', 0, -RIG.forearm, 0);
    // Mitten-like glove: palm, softly curled fingers, a thumb on the front edge.
    kit.mesh(palmGeo, glove, hand, [0, -0.045, 0.004], undefined, [limbF, 1, limbF]);
    kit.mesh(fingersGeo, glove, hand, [-side * 0.01, -0.105, 0.002], [0, 0, side * 0.24], [limbF, 1, limbF]);
    kit.mesh(thumbGeo, glove, hand, [-side * 0.014, -0.05, 0.054], [0.55, 0, -side * 0.25]);
    return { clav, upper, fore, hand };
  };
  const armL = makeArm(1);
  const armR = makeArm(-1);

  // Every mesh casts shadows. The head's many overlapping little parts don't receive them:
  // self-shadowing there only produces acne along the seams at game shadow-map resolutions.
  body.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  head.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.receiveShadow = false;
  });

  return {
    body,
    pelvis,
    spine,
    chest,
    neck,
    head,
    legL,
    legR,
    armL,
    armR,
    pack,
    hood,
    hem,
    strings: stringPivots,
    hairSway,
    hair: hairGroup,
    eyes,
    shoulderX,
  };
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

/** Hair styles: 0 short, 1 spiky, 2 long, 3 ponytail. Returns the hair group and a sway pivot. */
function buildHair(
  kit: Kit,
  hair: THREE.Material,
  face: THREE.Group,
  style: number,
  accent: string,
  R: number,
  F: number,
): { group: THREE.Group; sway: THREE.Group | null } {
  const s = ((Math.round(style) % 4) + 4) % 4;
  const g = new THREE.Group();
  g.name = 'hair';
  face.add(g);

  // Skull cap: one smooth sphere whose vertices below a hairline sink inside the head, so the
  // hair has a soft, continuous edge instead of seams between intersecting shells.
  const front = s === 1 ? 0.36 : 0.3;
  const back = s === 2 ? -0.85 : -0.62;
  kit.mesh(hairCapGeometry(R, front, back, s === 1 ? 1.07 : 1.075), hair, g);

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
      const m = kit.mesh(tuft, hair, g, [p.x, p.y - 0.012, p.z]);
      m.quaternion.setFromUnitVectors(zAxis, n);
      m.rotateZ(t * 0.6);
      const big = 1 - Math.abs(t) * 0.35;
      m.scale.set(0.95 * size * big, 1.15 * size * big, 0.42);
    }
  };
  // Messy tufts at the crown/back so the silhouette from behind isn't a perfect ball.
  const addBackTufts = (count: number): void => {
    const cone = new THREE.ConeGeometry(0.05 * F, 0.1 * F, 10);
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : i / (count - 1) - 0.5;
      const az = Math.PI + t * 1.1;
      const el = 0.12 + 0.22 * Math.cos(t * Math.PI);
      const p = surface(az, el, 0.98);
      const dir = p.clone().normalize().add(new THREE.Vector3(0, -0.9, -0.2)).normalize();
      const m = kit.mesh(cone, hair, g, [p.x + dir.x * 0.03, p.y + dir.y * 0.03, p.z + dir.z * 0.03]);
      m.quaternion.setFromUnitVectors(up, dir);
      m.scale.set(1.25, 0.75 + 0.2 * Math.cos(i * 1.7), 0.65);
    }
  };

  let sway: THREE.Group | null = null;

  if (s === 0) {
    // Short: soft fringe swept to one side, short sideburns, a few messy tufts at the back.
    addFringe(5, 1.75, 0.42);
    addBackTufts(4);
    for (const side of [-1, 1]) {
      kit.mesh(new THREE.CapsuleGeometry(0.022, 0.04, 4, 8), hair, g, [side * R * 0.86, -0.03, 0.03], [0, 0, side * 0.12]);
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
        const m = kit.mesh(spike, hair, g, [p.x + dir.x * 0.05, p.y + dir.y * 0.05, p.z + dir.z * 0.05]);
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
    g.add(sway);
    kit.mesh(limbGeometry(0.15 * F * 0.94, 0.125 * F * 0.94, 0.2, 24), hair, sway, [0, -0.02, -0.02], undefined, [1.08, 1, 0.62]);
    for (const side of [-1, 1]) {
      kit.mesh(limbGeometry(0.05 * F, 0.035 * F, 0.17 * F), hair, g, [side * R * 0.9, -0.0, 0.06], [0.05, 0, side * 0.1], [0.75, 1, 1.15]);
    }
  } else {
    // Ponytail: hair tie at the back of the head and a springy tail.
    addFringe(5, 1.6, 0.42);
    const tieY = 0.035 * F;
    const tieZ = -R * 1.0;
    kit.mesh(new THREE.TorusGeometry(0.034 * F, 0.014 * F, 8, 18), kit.mat(accent, 0.6), g, [0, tieY, tieZ - 0.005], [0.2, 0, 0]);
    sway = new THREE.Group();
    sway.position.set(0, tieY, tieZ - 0.012);
    g.add(sway);
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
  return { group: g, sway };
}

export function disposeTree(obj: THREE.Object3D): void {
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
