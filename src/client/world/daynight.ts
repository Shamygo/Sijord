import * as THREE from 'three';
import { SUNRISE, SUNSET } from '../../shared/daynight';
import { mats } from './shared';
import { SKY, SKY_UNIFORMS } from './sky';

/**
 * How the vale looks at one time of day: sky and fog colours, the hemisphere (sky and ground
 * bounce) light, the key light (the sun, or the moon at night), exposure, stars, and a tint for
 * clouds and water. Colours are sRGB hex.
 */
interface Look {
  zenith: number;
  mid: number;
  horizon: number;
  fog: number;
  hemiSky: number;
  hemiGround: number;
  hemiI: number;
  key: number;
  keyI: number;
  exposure: number;
  stars: number;
  tint: number;
}

// Daytime is the look the vale has always had (SKY in sky.ts and createLights).
const DAY: Look = { zenith: 0x538fae, mid: 0x83b4c3, horizon: 0xc1d9d1, fog: 0xa0bfc5, hemiSky: 0xc4dce5, hemiGround: 0x6d7c60, hemiI: 1.2, key: 0xfff0da, keyI: 2.6, exposure: 1, stars: 0, tint: 0xffffff };
// Late afternoon: the light turns gold and the shadows lengthen.
const GOLDEN: Look = { zenith: 0x5584ab, mid: 0xa9b8b4, horizon: 0xf2cf98, fog: 0xd3bd96, hemiSky: 0xcfd0c8, hemiGround: 0x76704f, hemiI: 1.0, key: 0xffc27a, keyI: 2.6, exposure: 1.02, stars: 0, tint: 0xffecd0 };
const SUNSET_LOOK: Look = { zenith: 0x47679a, mid: 0xc98f8a, horizon: 0xf6a56c, fog: 0xc99a86, hemiSky: 0xc2a9a8, hemiGround: 0x5a5048, hemiI: 0.95, key: 0xff9a5c, keyI: 1.6, exposure: 1.06, stars: 0, tint: 0xffc8a0 };
const DUSK: Look = { zenith: 0x203260, mid: 0x4f5584, horizon: 0x8c6e84, fog: 0x4c4e6c, hemiSky: 0x56648c, hemiGround: 0x23262e, hemiI: 0.78, key: 0xb3abd8, keyI: 0.5, exposure: 1.3, stars: 0.35, tint: 0x6f6c92 };
// Night stays readable: a blue moonlit world, like the Arceus nights, not a black screen.
const NIGHT: Look = { zenith: 0x0b1530, mid: 0x182a50, horizon: 0x2b4268, fog: 0x1f2f4c, hemiSky: 0x3d5686, hemiGround: 0x171d28, hemiI: 0.7, key: 0xa3b9ea, keyI: 0.62, exposure: 1.55, stars: 1, tint: 0x3a4a72 };
const BLUE_HOUR: Look = { zenith: 0x1f3561, mid: 0x5a6a92, horizon: 0x9c8ca2, fog: 0x5d6680, hemiSky: 0x5e7096, hemiGround: 0x262c34, hemiI: 0.8, key: 0xd8b6a6, keyI: 0.5, exposure: 1.32, stars: 0.4, tint: 0x8a8aac };
const DAWN: Look = { zenith: 0x4f78a8, mid: 0xc29c92, horizon: 0xf1c08e, fog: 0xc0a698, hemiSky: 0xb3b8c4, hemiGround: 0x56604c, hemiI: 1.0, key: 0xffc690, keyI: 1.8, exposure: 1.06, stars: 0, tint: 0xffdcc0 };

/** Looks through the day, by game hour; the colours in between blend. */
const KEYS: [number, Look][] = [
  [0, NIGHT], [4.8, NIGHT], [5.6, BLUE_HOUR], [6.4, DAWN], [8, DAY], [17, DAY], [18.3, GOLDEN], [19.1, SUNSET_LOOK], [19.9, DUSK], [20.8, NIGHT], [24, NIGHT],
];

/** The same looks with colours converted to linear once. */
const LINEAR = KEYS.map(([h, l]) => {
  const c = (hex: number) => new THREE.Color(hex);
  return { h, l, zenith: c(l.zenith), mid: c(l.mid), horizon: c(l.horizon), fog: c(l.fog), hemiSky: c(l.hemiSky), hemiGround: c(l.hemiGround), key: c(l.key), tint: c(l.tint) };
});

/** Where the moon hangs at night: high in the south-west. */
const MOON_DIR = new THREE.Vector3(0.34, 0.74, -0.58).normalize();

/** Towards the sun: it rises in the east (-X), crosses the southern sky and sets in the west (+X). */
export function sunDirAt(minutes: number, out = new THREE.Vector3()): THREE.Vector3 {
  const a = (Math.PI * (minutes - SUNRISE)) / (SUNSET - SUNRISE);
  return out.set(-Math.cos(a), Math.sin(a) * 0.95, -Math.max(0.25, Math.sin(a)) * 0.75).normalize();
}

export interface TimeOfDayState {
  /** Game minutes since midnight this state is for. */
  minutes: number;
  /** For the render pipeline's exposure. */
  exposure: number;
  /** For the scene's fog. */
  fog: THREE.Color;
  /** 0 by day up to 1 deep in the night. */
  night: number;
  /** Whether the key light is the moon. */
  moon: boolean;
}

const tmp = { a: new THREE.Color(), b: new THREE.Color(), dir: new THREE.Vector3() };
const state: TimeOfDayState = { minutes: 0, exposure: 1, fog: SKY.fog.clone(), night: 0, moon: false };

/**
 * Set the sky, fog colour, lights, clouds, water and lamp glow for a time of day. Cheap enough
 * to call every frame. Returns what the game applies itself (exposure and scene fog).
 */
export function applyTimeOfDay(minutes: number, sun: THREE.DirectionalLight, hemi: THREE.HemisphereLight | null): TimeOfDayState {
  const hour = (((minutes / 60) % 24) + 24) % 24;
  let i = 0;
  while (i < LINEAR.length - 2 && LINEAR[i + 1].h <= hour) i++;
  const a = LINEAR[i], b = LINEAR[i + 1];
  const t = THREE.MathUtils.smoothstep(hour, a.h, b.h);
  const mix = (key: 'zenith' | 'mid' | 'horizon' | 'fog' | 'hemiSky' | 'hemiGround' | 'key' | 'tint', out: THREE.Color) => out.copy(a[key]).lerp(b[key], t);
  const num = (key: 'hemiI' | 'keyI' | 'exposure' | 'stars') => a.l[key] + (b.l[key] - a.l[key]) * t;
  const U = SKY_UNIFORMS;
  mix('zenith', U.uZenith.value);
  mix('mid', U.uMid.value);
  mix('horizon', U.uHorizon.value);
  mix('fog', U.uSkyFog.value);
  mix('tint', U.uLightTint.value);
  const stars = num('stars');
  U.uStars.value = stars;
  if (hemi) {
    mix('hemiSky', hemi.color);
    mix('hemiGround', hemi.groundColor);
    hemi.intensity = num('hemiI');
  }
  // The sun lights the vale while it's up; once it's well down the moon takes over. Both are
  // faint around the change, so the light swaps direction without a jump.
  const sunDir = sunDirAt(minutes, tmp.dir);
  const moon = sunDir.y < -0.03;
  const fade = moon ? THREE.MathUtils.smoothstep(-sunDir.y, 0.03, 0.2) : THREE.MathUtils.smoothstep(sunDir.y, -0.03, 0.1);
  if (moon) SKY.sunDir.copy(MOON_DIR);
  else SKY.sunDir.set(sunDir.x, Math.max(sunDir.y, 0.06), sunDir.z).normalize();
  const keyI = num('keyI') * fade;
  mix('key', sun.color);
  sun.intensity = keyI;
  sun.shadow.intensity = moon ? 0.55 : 0.92;
  // What the sky dome, clouds and water see of the key light.
  SKY.sunColor.copy(sun.color).multiplyScalar(moon ? 0.32 * fade : Math.min(1, 0.35 + 0.65 * fade));
  U.uSunDisc.value = moon ? 0.12 : 1;
  // Lamps and lit windows glow brighter after dark.
  mats.glow.emissiveIntensity = 1.4 + stars * 1.6;
  state.minutes = minutes;
  state.exposure = num('exposure');
  mix('fog', state.fog);
  state.night = stars;
  state.moon = moon;
  return state;
}
