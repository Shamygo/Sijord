import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import catalogue from './pokemon-catalogue.json';
import { loadAsset, assetUrl } from './loader';
import { importedCreature, type ImportedCreatureModel } from '../creatures/imported';

const input = document.querySelector<HTMLInputElement>('#search')!;
const select = document.querySelector<HTMLSelectElement>('#model')!;
const animation = document.querySelector<HTMLSelectElement>('#animation')!;
const status = document.querySelector<HTMLElement>('#status')!;
const details = document.querySelector<HTMLElement>('#details')!;
const canvas = document.querySelector<HTMLCanvasElement>('#viewer')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#a8c9dd');
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.05, 100);
const controls = new OrbitControls(camera, canvas); controls.enableDamping = true; controls.minDistance = 1; controls.maxDistance = 16; controls.maxPolarAngle = Math.PI * 0.52;
scene.add(new THREE.HemisphereLight(0xeaf5ff, 0x66924d, 2.3));
const sun = new THREE.DirectionalLight(0xffefd8, 3); sun.position.set(4, 6, 5); scene.add(sun);
const ground = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.85, 0.15, 64), new THREE.MeshStandardMaterial({ color: '#6f9d64', roughness: 1 })); ground.position.y = -0.075; scene.add(ground);
let model: ImportedCreatureModel | null = null, request = 0, time = 0, selectedAnimation = 'idle';
let filtered = catalogue.models;
const qs = new URLSearchParams(location.search);
const wanted = qs.get('model') ?? 'regular/1';
document.querySelector('#coverage')!.textContent = `${catalogue.models.length.toLocaleString()} models and forms. ${catalogue.models.filter((m) => m.animations.length).length} have included animation clips. Load one at a time.`;
const format = (m: typeof catalogue.models[number]) => `${m.dex ? '#' + String(m.dex).padStart(3, '0') + ' ' : ''}${m.name}${m.form !== 'regular' ? ' · ' + m.form + ' · ' + m.id.split('/')[1] : ''}${/-(M|F)$/.test(m.id) ? ' · ' + m.id.slice(-1) : ''}`;
function populate(want = select.value): void {
  const term = input.value.trim().toLowerCase();
  filtered = catalogue.models.filter((m) => `${m.name} ${m.dex ?? ''} ${m.form} ${m.id}`.toLowerCase().includes(term));
  select.replaceChildren(...filtered.map((m) => new Option(format(m), m.id)));
  if (filtered.some((m) => m.id === want)) select.value = want;
  select.disabled = !filtered.length;
  if (!filtered.length) { request++; model?.dispose(); model = null; status.textContent = 'No matching models.'; animation.replaceChildren(); details.textContent = ''; return; }
  void show();
}
async function show(): Promise<void> {
  const entry = catalogue.models.find((m) => m.id === select.value);
  if (!entry) return;
  const token = ++request;
  model?.dispose(); model = null; animation.replaceChildren();
  status.textContent = `Loading ${format(entry)}…`; details.textContent = '';
  try {
    const url = assetUrl(entry.local);
    const asset = await loadAsset(url);
    if (token !== request) return;
    model = importedCreature(asset, 1.6); scene.add(model.root);
    const clips = asset.animations.map((c) => c.name);
    animation.replaceChildren(new Option('Auto · idle / generated motion', 'auto'), ...clips.map((name) => new Option(name, name)));
    const preferred = clips.find((s) => s.toLowerCase() === selectedAnimation) ?? clips.find((s) => /idle/i.test(s));
    animation.value = preferred ?? 'auto'; model.setAnimation(preferred ?? null);
    status.textContent = clips.length ? `${format(entry)} · ${clips.length} included clips` : `${format(entry)} · no animation clips in this source; generated idle motion`;
    details.textContent = `${(entry.downloadBytes / 1024 / 1024).toFixed(2)} MB download · self-hosted\n${entry.form === 'regular' && (entry.dex ?? 9999) <= 151 ? 'Animated original-151 collection' : 'Pokémon 3D API collection'}`;
    camera.position.set(3.8, 2.7, 5.5); controls.target.set(0, 0.85, 0); controls.update();
  } catch { if (token === request) status.textContent = 'This model could not load. Choose another model or try again.'; }
}
input.addEventListener('input', () => populate()); select.addEventListener('change', () => void show());
animation.addEventListener('change', () => { selectedAnimation = animation.value; model?.setAnimation(animation.value === 'auto' ? null : animation.value); });
function next(delta: number): void { if (!filtered.length) return; select.selectedIndex = (select.selectedIndex + delta + filtered.length) % filtered.length; void show(); }
document.querySelector('#previous')!.addEventListener('click', () => next(-1)); document.querySelector('#next')!.addEventListener('click', () => next(1));
function resize(): void { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
function step(dt: number): void { time += dt; model?.update(dt, 0); controls.update(); renderer.render(scene, camera); }
let last = performance.now(); renderer.setAnimationLoop(() => { const now = performance.now(); step(Math.min(0.05, (now - last) / 1000)); last = now; });
Object.assign(window, { render_game_to_text: () => JSON.stringify({ mode: 'model-library', id: select.value, animation: animation.value, ready: !!model, clips: model?.animations, status: status.textContent, time }), advanceTime: (ms: number) => { for (let t = 0; t < ms; t += 1000 / 60) step(1 / 60); } });
populate(wanted);
