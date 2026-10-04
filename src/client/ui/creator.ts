import * as THREE from 'three';
import { createAvatar } from '../player/avatar';
import { PLAYER_CLASSES } from '../../shared/classes';
import { DEFAULT_APPEARANCE, type Appearance, type PlayerProfile } from '../../shared/types';
import { h } from './dom';

const SKIN = ['#ffdbb4', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a1e'];
const HAIR = ['#1c1c1c', '#4a2f1b', '#8b5a2b', '#d9a441', '#e8e2d0', '#c0392b', '#2e86de', '#8e44ad'];
const CLOTH = ['#d63a2f', '#f39c12', '#27ae60', '#2980b9', '#8e44ad', '#f5f5f5', '#2c3e50', '#16a085', '#e84393'];
const PANTS = ['#2b2b33', '#3d4e6b', '#5b4636', '#6b7b4a', '#c9b79c', '#1f3a5f'];
const HAIR_STYLES = ['Short', 'Spiky', 'Long', 'Ponytail'];
const BUILDS = ['Slim', 'Broad'];

/** Character creator with a live, rotating 3D preview. Resolves with the finished profile. */
export function showCreator(parent: HTMLElement, initial?: PlayerProfile): Promise<PlayerProfile> {
  return new Promise((resolve) => {
    const profile: PlayerProfile = structuredClone(
      initial ?? { name: '', appearance: { ...DEFAULT_APPEARANCE }, playerClass: 'ranger' },
    );

    // Preview scene
    const canvas = h('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(0, 1.2, 5.4);
    camera.lookAt(0, 0.95, 0);
    scene.add(new THREE.HemisphereLight(0xdff3ff, 0x5c8a3a, 1.4));
    const key = new THREE.DirectionalLight(0xfff1d6, 2.4);
    key.position.set(3, 6, 4);
    key.castShadow = true;
    scene.add(key);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(1.4, 48),
      new THREE.MeshStandardMaterial({ color: 0x7cc35a, roughness: 0.9 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const avatar = createAvatar(profile.appearance);
    scene.add(avatar.root);

    let running = true;
    let last = performance.now();
    let spin = 0.5;
    let dragging = false;
    canvas.addEventListener('pointerdown', () => (dragging = true));
    addEventListener('pointerup', () => (dragging = false));
    canvas.addEventListener('pointermove', (e) => {
      if (dragging) spin += e.movementX * 0.01;
    });
    const frame = (now: number) => {
      if (!running) return;
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const w = canvas.clientWidth;
      const ht = canvas.clientHeight;
      if (canvas.width !== Math.floor(w * renderer.getPixelRatio())) {
        renderer.setSize(w, ht, false);
        camera.aspect = w / Math.max(ht, 1);
        camera.updateProjectionMatrix();
      }
      if (!dragging) spin += dt * 0.35;
      avatar.root.rotation.y = spin;
      avatar.animate(dt, { speed: 0, anim: 'idle' });
      renderer.render(scene, camera);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);

    const refresh = () => {
      avatar.setAppearance(profile.appearance);
      panel.replaceWith((panel = buildPanel()));
    };
    const set = <K extends keyof Appearance>(k: K, v: Appearance[K]) => {
      profile.appearance[k] = v;
      refresh();
    };
    const swatches = (list: string[], k: 'skinTone' | 'hairColor' | 'jacketColor' | 'pantsColor') =>
      h(
        'div.swatches',
        {},
        ...list.map((c) =>
          h('button.swatch' + (profile.appearance[k] === c ? '.on' : ''), {
            style: `background:${c}`,
            title: c,
            onclick: () => set(k, c),
          }),
        ),
      );
    const chips = (labels: string[], k: 'hairStyle' | 'build') =>
      h(
        'div.chips',
        {},
        ...labels.map((label, i) =>
          h('button.chip' + (profile.appearance[k] === i ? '.on' : ''), { onclick: () => set(k, i) }, label),
        ),
      );

    const nameInput = h('input', {
      value: profile.name,
      maxLength: 16,
      placeholder: 'Your name',
      oninput: (e: Event) => (profile.name = (e.target as HTMLInputElement).value),
    });

    const buildPanel = () =>
      h(
        'div.creator-panel',
        {},
        h('h2', {}, 'Create your trainer'),
        h('label.field', {}, 'Name', nameInput),
        h('h3', {}, 'Skin'),
        swatches(SKIN, 'skinTone'),
        h('h3', {}, 'Hair'),
        chips(HAIR_STYLES, 'hairStyle'),
        h('div', { style: 'height:8px' }),
        swatches(HAIR, 'hairColor'),
        h('h3', {}, 'Hoodie'),
        swatches(CLOTH, 'jacketColor'),
        h('h3', {}, 'Trousers'),
        swatches(PANTS, 'pantsColor'),
        h('h3', {}, 'Build'),
        chips(BUILDS, 'build'),
        h('h3', {}, 'Class'),
        h(
          'div.classes',
          {},
          ...PLAYER_CLASSES.map((c) =>
            h(
              'button.class-card' + (profile.playerClass === c.id ? '.on' : ''),
              {
                style: `border-left: 6px solid ${c.color}`,
                onclick: () => {
                  profile.playerClass = c.id;
                  refresh();
                },
              },
              h('b', {}, c.name),
              h('span.tag', {}, c.tagline),
              h('ul', {}, ...c.strengths.map((s) => h('li', {}, s)), h('li.weak', {}, c.weakness)),
            ),
          ),
        ),
        h(
          'button.btn',
          {
            onclick: () => {
              profile.name = profile.name.trim() || 'Trainer';
              running = false;
              avatar.dispose();
              renderer.dispose();
              screen.remove();
              resolve(profile);
            },
          },
          'Begin your journey',
        ),
      );

    let panel = buildPanel();
    const screen = h('div.screen', {}, h('div.creator', {}, h('div.creator-preview', {}, canvas), panel));
    parent.append(screen);
  });
}
