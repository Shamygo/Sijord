import * as THREE from 'three';

// TEMPORARY stand-in with the final API; replaced by the real procedural models.
export type CreatureAction = 'attack' | 'special' | 'hit' | 'faint' | 'happy';
export interface CreatureModel {
  readonly root: THREE.Group;
  readonly height: number;
  readonly radius: number;
  update(dt: number, speed: number): void;
  play(action: CreatureAction): number;
  reset(): void;
  dispose(): void;
}

const SIZE: Record<string, [number, number]> = {
  fernfawn: [0.55, 0x8fbf5a], bramblebuck: [1.3, 0x6f9a3e], elkwarden: [2.3, 0x4f7a34],
  cindlet: [0.5, 0xf08a3c], pyrolynx: [1.1, 0xe0662a], forgelynx: [1.6, 0xb0b4bc],
  splashpup: [0.5, 0x6cb8e8], sealkin: [1.1, 0x4a90c8], selkira: [1.8, 0x8fb8e8],
  finchlet: [0.3, 0xc89a5a], fjordling: [0.7, 0x5a6a8a], skjaldhawk: [1.5, 0x8a6a4a],
  nibblet: [0.3, 0xb08a64], stashquill: [0.7, 0x8a6a4a], dewmite: [0.25, 0x9ad0e8],
  cocoonch: [0.6, 0x6a8a4a], auroramoth: [1.2, 0x7ad0c8], cloveret: [0.4, 0xd8e8c8],
  luckhare: [0.9, 0xa8d088], hjordpup: [0.45, 0x3a3a3a], shepherion: [1.2, 0x4a4a4a],
};

export const MODELLED_SPECIES = Object.keys(SIZE);

export function createCreatureModel(speciesId: string): CreatureModel {
  const [h, color] = SIZE[speciesId] ?? [0.6, 0xcccccc];
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.SphereGeometry(h * 0.35, 20, 14), mat);
  torso.scale.set(1, 0.85, 1.3);
  torso.position.y = h * 0.45;
  const head = new THREE.Mesh(new THREE.SphereGeometry(h * 0.25, 20, 14), mat);
  head.position.set(0, h * 0.78, h * 0.3);
  for (const m of [torso, head]) {
    m.castShadow = true;
    body.add(m);
  }
  let action: CreatureAction | null = null;
  let t = 0;
  let dur = 0;
  let phase = 0;
  return {
    root, height: h, radius: h * 0.45,
    update(dt, speed) {
      phase += dt * (2 + speed * 3);
      body.position.y = Math.abs(Math.sin(phase)) * Math.min(0.08, speed * 0.02) * h;
      if (action) {
        t += dt;
        const k = Math.min(1, t / dur);
        if (action === 'attack' || action === 'special') body.position.z = Math.sin(k * Math.PI) * h * 0.6;
        if (action === 'hit') body.position.z = -Math.sin(k * Math.PI) * h * 0.25;
        if (action === 'happy') body.position.y += Math.sin(k * Math.PI) * h * 0.4;
        if (action === 'faint') body.rotation.z = k * Math.PI / 2;
        if (k >= 1 && action !== 'faint') {
          action = null;
          body.position.z = 0;
        }
      }
    },
    play(a) {
      action = a;
      t = 0;
      dur = a === 'faint' ? 0.8 : 0.5;
      return dur;
    },
    reset() {
      action = null;
      body.rotation.z = 0;
      body.position.set(0, 0, 0);
    },
    dispose() {
      torso.geometry.dispose();
      head.geometry.dispose();
      mat.dispose();
    },
  };
}
