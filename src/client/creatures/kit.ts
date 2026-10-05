import * as THREE from 'three';
import { clean, paint as applyPaint, solid, type Paint } from './geo';

/**
 * Builder for creature templates.
 *
 * A species is authored as ordinary meshes parented to a hierarchy of bones (like the trainer),
 * then `consolidate()` merges every mesh that shares a material into ONE skinned mesh whose
 * vertices are bound rigidly to the bone they were authored on (or blended, for parts that were
 * authored pre-skinned, like the torso and tails). Animation still drives the bones exactly like
 * a rigid hierarchy, but a whole creature draws in 3 to 6 calls instead of 40+.
 *
 * Templates are built once per species and cloned per instance (geometry and materials shared,
 * bones and skeleton per instance).
 */

export type MatKind = 'fur' | 'soft' | 'gloss' | 'metal' | 'glow' | 'leaf' | 'glint' | 'water' | 'shell';

interface MatDef {
  roughness: number;
  /** Soft fresnel rim in the vertex colour (stylised edge light). */
  rim?: number;
  metalness?: number;
  glow?: number;
  side?: THREE.Side;
  transparent?: number;
}

const MAT_DEFS: Record<Exclude<MatKind, 'glint'>, MatDef> = {
  fur: { roughness: 0.8, rim: 0.32 },
  soft: { roughness: 0.55, rim: 0.15 },
  gloss: { roughness: 0.14 },
  metal: { roughness: 0.38, metalness: 0.45 },
  glow: { roughness: 0.5, glow: 1.6 },
  leaf: { roughness: 0.68, side: THREE.DoubleSide, rim: 0.2 },
  water: { roughness: 0.04, transparent: 0.62, glow: 0.12 },
  shell: { roughness: 0.32, metalness: 0.2, glow: 0.18, side: THREE.DoubleSide, rim: 0.4 },
};

/** Uniform for the vertex-colour emissive term, per material. */
export interface VcGlow {
  value: number;
}

/**
 * Creates a creature material. Standard materials get a small shader patch that adds
 * `vertexColor * uVCGlow` to the emissive term, so glowing parts (embers, forge seams, aurora
 * bands) glow in their own painted colours and can be pulsed per instance.
 */
export function makeMaterial(kind: MatKind): THREE.Material {
  if (kind === 'glint') {
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
    m.userData.kind = kind;
    return m;
  }
  const d = MAT_DEFS[kind];
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: d.roughness,
    metalness: d.metalness ?? 0,
    side: d.side ?? THREE.FrontSide,
  });
  if (d.transparent !== undefined) {
    m.transparent = true;
    m.opacity = d.transparent;
  }
  const vc: VcGlow = { value: d.glow ?? 0 };
  m.userData.kind = kind;
  m.userData.vcGlow = vc;
  m.userData.baseGlow = vc.value;
  const rim = { value: d.rim ?? 0 };
  m.userData.rim = rim;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uVCGlow = vc;
    sh.uniforms.uRim = rim;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uVCGlow;\nuniform float uRim;')
      .replace(
        '#include <emissivemap_fragment>',
        [
          '#include <emissivemap_fragment>',
          '#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )',
          'totalEmissiveRadiance += vColor.rgb * uVCGlow;',
          'float sjRim = 1.0 - clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );',
          'totalEmissiveRadiance += vColor.rgb * uRim * sjRim * sjRim * sjRim;',
          '#endif',
        ].join('\n'),
      );
  };
  m.customProgramCacheKey = () => 'sj-creature';
  return m;
}

/** Ordered list of kinds so consolidated meshes are created in a stable order. */
const KIND_ORDER: MatKind[] = ['fur', 'soft', 'gloss', 'metal', 'glow', 'leaf', 'shell', 'glint', 'water'];

export interface AddOpts {
  pos?: readonly [number, number, number];
  rot?: readonly [number, number, number];
  scale?: readonly [number, number, number];
  /** Paint applied to the geometry (if it has no colour yet). Defaults to white. */
  paint?: Paint;
  name?: string;
}

export class Kit {
  readonly root = new THREE.Group();
  readonly scaled = new THREE.Group();
  private readonly mats = new Map<MatKind, THREE.Material>();
  private readonly names = new Set<string>();
  private readonly geos: THREE.BufferGeometry[] = [];

  constructor(name: string) {
    this.root.name = `creature:${name}`;
    this.scaled.name = 'scaled';
    this.root.add(this.scaled);
  }

  mat(kind: MatKind): THREE.Material {
    let m = this.mats.get(kind);
    if (!m) {
      m = makeMaterial(kind);
      this.mats.set(kind, m);
    }
    return m;
  }

  /** A bone with a unique name. Rotation order YXZ (yaw, then pitch, then roll). */
  bone(parent: THREE.Object3D, name: string, x = 0, y = 0, z = 0): THREE.Bone {
    let n = name;
    let i = 2;
    while (this.names.has(n)) n = `${name}${i++}`;
    this.names.add(n);
    const b = new THREE.Bone();
    b.name = n;
    b.rotation.order = 'YXZ';
    b.position.set(x, y, z);
    parent.add(b);
    return b;
  }

  /** Mesh of `geo` on `parent`, painted with `o.paint` unless the geometry is already coloured. */
  add(geo: THREE.BufferGeometry, kind: MatKind, parent: THREE.Object3D, o: AddOpts = {}): THREE.Mesh {
    clean(geo);
    if (!geo.getAttribute('color')) applyPaint(geo, o.paint ?? solid('#ffffff'));
    const m = new THREE.Mesh(geo, this.mat(kind));
    if (o.pos) m.position.set(o.pos[0], o.pos[1], o.pos[2]);
    if (o.rot) m.rotation.set(o.rot[0], o.rot[1], o.rot[2], 'YXZ');
    if (o.scale) m.scale.set(o.scale[0], o.scale[1], o.scale[2]);
    if (o.name) m.name = o.name;
    parent.add(m);
    return m;
  }

  /**
   * A pre-skinned part: `geo` must carry `skinIndex` (indices into `bones`) and `skinWeight`.
   * Its positions are in `parent`'s space.
   */
  addSkinned(geo: THREE.BufferGeometry, kind: MatKind, parent: THREE.Object3D, bones: THREE.Bone[], p?: Paint): THREE.Mesh {
    const m = this.add(geo, kind, parent, { paint: p });
    m.userData.skinBones = bones;
    return m;
  }

  /** Bounding box of every mesh (at the current pose), in the scaled group's space. */
  measure(): THREE.Box3 {
    this.root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    this.scaled.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const pos = m.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        box.expandByPoint(v);
      }
    });
    return box;
  }

  /**
   * Merge all meshes into one skinned mesh per material, bound to every bone under `scaled`.
   * Call with the bones in their rest pose and the root at the origin with unit scale.
   */
  consolidate(): { meshes: THREE.SkinnedMesh[]; skeleton: THREE.Skeleton; tris: number } {
    this.root.updateMatrixWorld(true);
    const bones: THREE.Bone[] = [];
    this.scaled.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone);
    });
    const boneIndex = new Map<THREE.Object3D, number>();
    bones.forEach((b, i) => boneIndex.set(b, i));
    const groups = new Map<THREE.Material, THREE.Mesh[]>();
    const all: THREE.Mesh[] = [];
    this.scaled.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) all.push(m);
    });
    for (const m of all) {
      const mat = m.material as THREE.Material;
      if (!groups.has(mat)) groups.set(mat, []);
      groups.get(mat)!.push(m);
    }
    const skeleton = new THREE.Skeleton(bones);
    const meshes: THREE.SkinnedMesh[] = [];
    let tris = 0;
    const mats = [...groups.keys()].sort(
      (a, b) => KIND_ORDER.indexOf(a.userData.kind as MatKind) - KIND_ORDER.indexOf(b.userData.kind as MatKind),
    );
    const v = new THREE.Vector3();
    const nm = new THREE.Matrix3();
    for (const mat of mats) {
      const list = groups.get(mat)!;
      let nv = 0;
      let ni = 0;
      for (const m of list) {
        nv += (m.geometry.getAttribute('position') as THREE.BufferAttribute).count;
        ni += m.geometry.index!.count;
      }
      const P = new Float32Array(nv * 3);
      const N = new Float32Array(nv * 3);
      const C = new Float32Array(nv * 3);
      const SI = new Uint16Array(nv * 4);
      const SW = new Float32Array(nv * 4);
      const I = new Uint32Array(ni);
      let vo = 0;
      let io = 0;
      for (const m of list) {
        const g = m.geometry;
        const pos = g.getAttribute('position') as THREE.BufferAttribute;
        const nor = g.getAttribute('normal') as THREE.BufferAttribute;
        const col = g.getAttribute('color') as THREE.BufferAttribute;
        const si = g.getAttribute('skinIndex') as THREE.BufferAttribute | undefined;
        const sw = g.getAttribute('skinWeight') as THREE.BufferAttribute | undefined;
        const mw = m.matrixWorld;
        nm.getNormalMatrix(mw);
        const flip = mw.determinant() < 0;
        const preBones = m.userData.skinBones as THREE.Bone[] | undefined;
        const rigid = boneIndex.get(m.parent!) ?? 0;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(mw);
          P[(vo + i) * 3] = v.x;
          P[(vo + i) * 3 + 1] = v.y;
          P[(vo + i) * 3 + 2] = v.z;
          v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
          N[(vo + i) * 3] = v.x;
          N[(vo + i) * 3 + 1] = v.y;
          N[(vo + i) * 3 + 2] = v.z;
          C[(vo + i) * 3] = col.getX(i);
          C[(vo + i) * 3 + 1] = col.getY(i);
          C[(vo + i) * 3 + 2] = col.getZ(i);
          if (preBones && si && sw) {
            for (let k = 0; k < 4; k++) {
              const local = si.getComponent(i, k);
              SI[(vo + i) * 4 + k] = boneIndex.get(preBones[local]) ?? rigid;
              SW[(vo + i) * 4 + k] = sw.getComponent(i, k);
            }
          } else {
            SI[(vo + i) * 4] = rigid;
            SW[(vo + i) * 4] = 1;
          }
        }
        const idx = g.index!;
        for (let i = 0; i < idx.count; i += 3) {
          const a = idx.getX(i) + vo;
          const b = idx.getX(i + 1) + vo;
          const c = idx.getX(i + 2) + vo;
          I[io++] = a;
          I[io++] = flip ? c : b;
          I[io++] = flip ? b : c;
        }
        vo += pos.count;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
      geo.setAttribute('skinIndex', new THREE.BufferAttribute(SI, 4));
      geo.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
      geo.setIndex(new THREE.BufferAttribute(I, 1));
      geo.computeBoundingSphere();
      tris += ni / 3;
      const sm = new THREE.SkinnedMesh(geo, mat);
      sm.name = `skin:${mat.userData.kind as string}`;
      sm.castShadow = mat.userData.kind !== 'glint' && mat.userData.kind !== 'water';
      sm.receiveShadow = mat.userData.kind === 'fur' || mat.userData.kind === 'metal' || mat.userData.kind === 'leaf';
      this.geos.push(geo);
      meshes.push(sm);
    }
    // Remove the authoring meshes and their geometry.
    for (const m of all) {
      m.parent?.remove(m);
      m.geometry.dispose();
    }
    for (const sm of meshes) {
      this.scaled.add(sm);
      sm.bind(skeleton);
      // Generous fixed bounds (in the scaled group's space) so lunges and faints stay visible.
      const bs = sm.geometry.boundingSphere!.clone();
      bs.radius = bs.radius * 1.5 + 0.05;
      sm.boundingSphere = bs;
    }
    return { meshes, skeleton, tris };
  }

  get materials(): THREE.Material[] {
    return [...this.mats.values()];
  }

  get geometries(): THREE.BufferGeometry[] {
    return this.geos;
  }
}

/**
 * Clone a consolidated template: geometry and materials are shared, bones and the skeleton are
 * new. Returns a lookup from bone name to the cloned bone.
 */
export function cloneTemplate(src: THREE.Group): {
  root: THREE.Group;
  byName: Map<string, THREE.Object3D>;
  meshes: THREE.SkinnedMesh[];
  lookup: Map<THREE.Object3D, THREE.Object3D>;
} {
  const root = src.clone(true);
  const lookup = new Map<THREE.Object3D, THREE.Object3D>();
  const walk = (a: THREE.Object3D, b: THREE.Object3D): void => {
    lookup.set(a, b);
    for (let i = 0; i < a.children.length; i++) walk(a.children[i], b.children[i]);
  };
  walk(src, root);
  const skeletons = new Map<THREE.Skeleton, THREE.Skeleton>();
  const meshes: THREE.SkinnedMesh[] = [];
  const byName = new Map<string, THREE.Object3D>();
  root.traverse((o) => {
    if (o.name) byName.set(o.name, o);
    const sm = o as THREE.SkinnedMesh;
    if (!sm.isSkinnedMesh) return;
    const srcSkel = sm.skeleton;
    let sk = skeletons.get(srcSkel);
    if (!sk) {
      sk = new THREE.Skeleton(
        srcSkel.bones.map((b) => lookup.get(b) as THREE.Bone),
        srcSkel.boneInverses.map((m) => m.clone()),
      );
      skeletons.set(srcSkel, sk);
    }
    sm.bind(sk, sm.bindMatrix);
    meshes.push(sm);
  });
  return { root, byName, meshes, lookup };
}

/**
 * Deep-copies plain rig data (objects / arrays), replacing every Object3D reference through
 * `lookup` (template bone -> cloned bone). Other values (numbers, vectors) are shared.
 */
export function remap<T>(data: T, lookup: Map<THREE.Object3D, THREE.Object3D>): T {
  const walk = (v: unknown): unknown => {
    if (v instanceof THREE.Object3D) return lookup.get(v) ?? v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object' && (v as object).constructor === Object) {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = walk(x);
      return out;
    }
    return v;
  };
  return walk(data) as T;
}

/** Skin weights for a geometry from a per-vertex function returning up to 4 (bone, weight) pairs. */
export function skin(
  geo: THREE.BufferGeometry,
  fn: (p: THREE.Vector3, i: number, out: { idx: number[]; w: number[] }) => void,
): THREE.BufferGeometry {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const SI = new Uint16Array(pos.count * 4);
  const SW = new Float32Array(pos.count * 4);
  const p = new THREE.Vector3();
  const out = { idx: [0, 0, 0, 0], w: [0, 0, 0, 0] };
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    out.idx.fill(0);
    out.w.fill(0);
    fn(p, i, out);
    let sum = 0;
    for (let k = 0; k < 4; k++) sum += out.w[k];
    if (sum <= 0) {
      out.w[0] = 1;
      sum = 1;
    }
    for (let k = 0; k < 4; k++) {
      SI[i * 4 + k] = out.idx[k];
      SW[i * 4 + k] = out.w[k] / sum;
    }
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(SI, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
  return geo;
}

/**
 * Skin a geometry to a chain of bones by a scalar coordinate (e.g. position along an axis, or a
 * sweep's curve parameter): `knots[i]` is where bone i starts; vertices blend between neighbours
 * over `blend` on each side of a knot.
 */
export function chainWeights(
  value: number,
  knots: readonly number[],
  blend: number,
  out: { idx: number[]; w: number[] },
): void {
  const n = knots.length;
  let i = 0;
  while (i < n - 1 && value >= knots[i + 1]) i++;
  // Blend with the previous bone near the start knot of i, or the next near the end.
  out.idx[0] = i;
  out.w[0] = 1;
  if (i > 0 && value < knots[i] + blend) {
    const t = 0.5 + (0.5 * (value - knots[i])) / blend;
    out.idx[1] = i - 1;
    out.w[0] = t;
    out.w[1] = 1 - t;
  } else if (i < n - 1 && value > knots[i + 1] - blend) {
    const t = 0.5 + (0.5 * (knots[i + 1] - value)) / blend;
    out.idx[1] = i + 1;
    out.w[0] = t;
    out.w[1] = 1 - t;
  }
}
