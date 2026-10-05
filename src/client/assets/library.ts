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
const stage = canvas.parentElement!;
const grid = document.querySelector<HTMLElement>('#collection-grid')!;
const form = document.querySelector<HTMLSelectElement>('#form')!;
const animated = document.querySelector<HTMLInputElement>('#animated')!;
const more = document.querySelector<HTMLButtonElement>('#more')!;
const loading = document.querySelector<HTMLElement>('#loading')!;
let visibleCount = 60, paused = false;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#b1c8c2'); scene.fog = new THREE.Fog('#b1c8c2', 9, 24);
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.05, 100);
const controls = new OrbitControls(camera, canvas); controls.enableDamping = true; controls.minDistance = 1; controls.maxDistance = 16; controls.maxPolarAngle = Math.PI * 0.52;
scene.add(new THREE.HemisphereLight(0xd9edf4, 0x66765c, 1.35));
const sun = new THREE.DirectionalLight(0xffefd8, 2.1); sun.position.set(4, 6, 5); sun.castShadow = true; sun.shadow.mapSize.set(1024,1024); sun.shadow.camera.left=-5;sun.shadow.camera.right=5;sun.shadow.camera.top=5;sun.shadow.camera.bottom=-5;sun.shadow.normalBias=.03;scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80,80), new THREE.MeshStandardMaterial({ color: '#8fa99b', roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -.015; ground.receiveShadow = true; scene.add(ground);
let model: ImportedCreatureModel | null = null, request = 0, time = 0, selectedAnimation = 'idle';
let filtered = catalogue.models;
const qs = new URLSearchParams(location.search);
const wanted = qs.get('model') ?? 'regular/1';
document.querySelector('#coverage')!.textContent = `${catalogue.models.length.toLocaleString()} models & forms · ${catalogue.models.filter(m=>m.animations.length).length} animated`;
const format = (m: typeof catalogue.models[number]) => `${m.dex ? '#' + String(m.dex).padStart(3, '0') + ' ' : ''}${m.name}${m.form !== 'regular' ? ' · ' + m.form + ' · ' + m.id.split('/')[1] : ''}${/-(M|F)$/.test(m.id) ? ' · ' + m.id.slice(-1) : ''}`;
function cards(): void {
  grid.replaceChildren(...filtered.slice(0,visibleCount).map(m => {
    const button = document.createElement('button');button.className='pokemon-card'+(m.id===select.value?' on':'');button.setAttribute('aria-label',format(m));button.setAttribute('aria-pressed',String(m.id===select.value));
    const icon=document.createElement('img');icon.src=assetUrl(`pokemon-icons/${m.dex}.png`);icon.alt='';icon.loading='lazy';icon.addEventListener('error',()=>{icon.style.visibility='hidden';});
    const number=document.createElement('span');number.className='dex-number';number.textContent=m.dex?'#'+String(m.dex).padStart(3,'0'):'';
    const name=document.createElement('b');name.textContent=m.name;const sub=document.createElement('small');sub.textContent=m.form==='regular'?'Regular':m.form.replaceAll('-',' ');
    button.append(number,icon,name,sub);if(m.animations.length){const dot=document.createElement('i');dot.className='clip-dot';dot.title='Includes animation clips';button.append(dot);}
    button.onclick=()=>{select.value=m.id;void show();};return button;
  }));
  if(!filtered.length){const empty=document.createElement('p');empty.textContent='No Pokémon found. Try another name.';grid.append(empty);}
  document.querySelector('#result-count')!.textContent=`${filtered.length.toLocaleString()} results`;more.hidden=visibleCount>=filtered.length;
}
function populate(want = select.value): void {
  const term = input.value.trim().toLowerCase();visibleCount=60;
  filtered = catalogue.models.filter(m => `${m.name} ${m.dex ?? ''} ${m.form} ${m.id}`.toLowerCase().includes(term) && (form.value==='all'||(form.value==='regular'?m.form==='regular':m.form!=='regular')) && (!animated.checked||m.animations.length>0));
  select.replaceChildren(...filtered.map(m=>new Option(format(m),m.id)));if(filtered.some(m=>m.id===want))select.value=want;select.disabled=!filtered.length;cards();
  if(!filtered.length){request++;model?.dispose();model=null;status.textContent='No matching models.';animation.replaceChildren();details.textContent='';loading.classList.add('hidden');return;}
  if(!model || select.value!==model.root.userData.catalogueId)void show();
}
async function show(): Promise<void> {
  const entry = catalogue.models.find((m) => m.id === select.value);
  if (!entry) return;
  const token = ++request;
  model?.dispose(); model = null; animation.replaceChildren();
  loading.classList.remove('hidden');loading.textContent=`Preparing ${entry.name}…`;cards();
  document.querySelector('#number')!.textContent=`${entry.dex?'NO. '+String(entry.dex).padStart(3,'0'):''} · ${entry.form==='regular'?'REGULAR':entry.form.toUpperCase()}`;document.querySelector('#pokemon-name')!.textContent=entry.name;
  status.textContent = 'Loading model…'; details.textContent = '';
  try {
    const url = assetUrl(entry.local);
    const asset = await loadAsset(url);
    if (token !== request) return;
    model = importedCreature(asset, 1.6); scene.add(model.root); model.root.userData.catalogueId=entry.id; loading.classList.add('hidden');
    const clips = asset.animations.map((c) => c.name);
    animation.replaceChildren(new Option('Auto · idle / generated motion', 'auto'), ...clips.map((name) => new Option(name, name)));
    const preferred = clips.find((s) => s.toLowerCase() === selectedAnimation) ?? clips.find((s) => /idle/i.test(s));
    animation.value = preferred ?? 'auto'; model.setAnimation(preferred ?? null);
    status.textContent = clips.length ? `${clips.length} included animations · choose a motion below` : 'This model includes no animation clips · gentle generated idle';
    details.textContent = `${(entry.downloadBytes / 1024 / 1024).toFixed(2)} MB · ${entry.form === 'regular' && (entry.dex ?? 9999) <= 151 ? 'Animated original-151 collection' : 'Pokémon 3D API collection'}`;
    resetView(); if(!matchMedia('(prefers-reduced-motion: reduce)').matches) document.querySelector<HTMLElement>('.model-info')!.animate([{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'none'}],{duration:220});
  } catch { if (token === request) {loading.classList.add('hidden');status.textContent = 'This model could not load. Choose another model or try again.';} }
}
input.addEventListener('input', () => populate());form.addEventListener('change',()=>populate());animated.addEventListener('change',()=>populate());more.onclick=()=>{visibleCount+=60;cards();}; select.addEventListener('change', () => void show());
animation.addEventListener('change', () => { selectedAnimation = animation.value; model?.setAnimation(animation.value === 'auto' ? null : animation.value); });
function next(delta: number): void { if (!filtered.length) return; select.selectedIndex = (select.selectedIndex + delta + filtered.length) % filtered.length; void show(); }
document.querySelector('#previous')!.addEventListener('click', () => next(-1)); document.querySelector('#next')!.addEventListener('click', () => next(1));
function resetView(): void {camera.position.set(3.3,2.15,4.9);controls.target.set(0,.83,0);controls.update();}
document.querySelector('#reset')!.addEventListener('click',resetView);document.querySelector('#play')!.addEventListener('click',e=>{paused=!paused;(e.currentTarget as HTMLButtonElement).textContent=paused?'▶':'Ⅱ';(e.currentTarget as HTMLButtonElement).setAttribute('aria-label',paused?'Play animation':'Pause animation');});
function resize(): void { renderer.setSize(stage.clientWidth, stage.clientHeight, false); camera.aspect = stage.clientWidth / stage.clientHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
function step(dt: number): void { time += dt; if(!paused)model?.update(dt, 0); controls.update(); renderer.render(scene, camera); }
let last = performance.now(); renderer.setAnimationLoop(() => { const now = performance.now(); step(Math.min(0.05, (now - last) / 1000)); last = now; });
Object.assign(window, { render_game_to_text: () => JSON.stringify({ mode: 'model-library', id: select.value, animation: animation.value, paused, results:filtered.length, ready: !!model, clips: model?.animations, status: status.textContent, time }), advanceTime: (ms: number) => { for (let t = 0; t < ms; t += 1000 / 60) step(1 / 60); } });
populate(wanted);
