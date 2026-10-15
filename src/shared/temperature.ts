import { BIOME_IDS, BIOMES, biomeWeights, lavaDist } from './region';

/**
 * Body temperature (DESIGN §6.1). The air in the Vale is mild by day and cold at night: coldest
 * just before sunrise, colder still on high ground, and colder again when you're soaked from
 * wading. Clothes keep the cold out (Warmth), a campfire or the town warms you up, and a Fire-type
 * partner out beside you takes the edge off. Too long in the cold and you get chilly, then cold
 * (shivering: stamina comes back slowly), then freezing (you lose HP). Heat works the same way
 * the other side of comfortable, for the hot lands further out.
 *
 * Body heat runs from -100 (frozen through) to 100 (overheated); 0 is comfortable.
 */
export const TEMPERATURE = {
  /** Felt temperatures (°C) the body is comfortable in. */
  comfort: { low: 10, high: 30 },
  /** The lowland air at its warmest and coldest, and when (game minutes since midnight). */
  warmest: 20,
  warmestAt: 14 * 60,
  coldest: 2,
  coldestAt: 5 * 60,
  /** Degrees colder for every metre above `lapseFrom`: the mesa tops are cold at night. */
  lapse: 0.12,
  lapseFrom: 12,
  /** High ground never costs more than this: the peaks get their cold from their biome. */
  lapseMax: 10,
  /** Degrees per step of a biome's temperature pull (region.ts: -2 freezing .. +2 scorching). */
  biome: 8,
  /** Standing this close to lava is like standing in a furnace. */
  lavaReach: 12,
  lavaHeat: 15,
  /** How much colder it feels when you're soaked, and the seconds it takes to dry off. */
  wetChill: 8,
  drySeconds: 45,
  /** Sprinting and climbing warm you up. */
  exertion: 3,
  /** A campfire this close keeps you at least `fireFloor` warm. */
  fireReach: 5,
  fireFloor: 22,
  /** Inside Bramblewick's fence: walls, hearths and hot food are never far. */
  townFloor: 12,
  /** Inside a gym or a hall. */
  indoorAir: 18,
  /** A Fire-type partner beside you warms you by this much, but never past `partnerCap`. */
  partner: 6,
  partnerCap: 18,
  /** Body heat lost (or gained) per second, per degree outside the comfort band. */
  rate: 0.05,
  /** Body heat recovered per second while comfortable, and by a fire. */
  recover: 1.2,
  fireRecover: 4,
  /** How far from 0 body heat gets before you're chilly (warm), cold (hot), freezing (overheating). */
  chilly: 30,
  cold: 60,
  freezing: 90,
  /** HP lost per second while freezing or overheating. */
  hpLoss: 1 / 3,
};

export type HeatState = 'freezing' | 'cold' | 'chilly' | 'ok' | 'warm' | 'hot' | 'overheating';

/** Where the weather is on a trainer right now. */
export interface Exposure {
  /** The air (°C), from `airTemp`. */
  air: number;
  /** Warmth of the clothes worn (°C). */
  warmth: number;
  /** Soaked 1, dry 0. */
  wet: number;
  /** Sprinting or climbing. */
  exertion: boolean;
  /** Beside a campfire. */
  fire: boolean;
  /** Inside the town fence. */
  town: boolean;
  /** A partner beside you: positive for a Fire type, negative for an Ice type, else 0. */
  partner: number;
}

const ease = (k: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, k)));

/** The air temperature (°C) at a time of day and a height above the sea. */
export function airTemp(minutes: number, height = 0): number {
  const T = TEMPERATURE;
  const m = ((minutes % 1440) + 1440) % 1440;
  // Warming quickly once the sun is up, then cooling slowly through the evening and the night.
  const up = (T.warmestAt - T.coldestAt + 1440) % 1440;
  const since = (m - T.coldestAt + 1440) % 1440;
  const k = since < up ? Math.sin((Math.PI / 2) * (since / up)) : 1 - ease((since - up) / (1440 - up));
  return T.coldest + (T.warmest - T.coldest) * k - Math.min(T.lapseMax, Math.max(0, height - T.lapseFrom) * T.lapse);
}

/** How warm it feels (°C), all things considered. */
export function feltTemp(e: Exposure): number {
  const T = TEMPERATURE;
  let t = e.air + e.warmth - Math.min(1, Math.max(0, e.wet)) * T.wetChill + (e.exertion ? T.exertion : 0);
  // A Fire type warms you when it's cold but doesn't make a warm day hot; an Ice type the reverse.
  if (e.partner > 0 && t < T.partnerCap) t = Math.min(T.partnerCap, t + e.partner);
  if (e.partner < 0 && t > T.partnerCap) t = Math.max(T.partnerCap, t + e.partner);
  if (e.town) t = Math.max(t, T.townFloor);
  if (e.fire) t = Math.max(t, T.fireFloor);
  return t;
}

/** Degrees outside the comfort band: negative too cold, positive too hot, 0 comfortable. */
export function exposureOf(felt: number): number {
  const { low, high } = TEMPERATURE.comfort;
  return felt < low ? felt - low : felt > high ? felt - high : 0;
}

/**
 * Body heat after `dt` seconds at a felt temperature. Outside the comfort band it drifts by
 * `rate` per degree; heading back towards comfortable it recovers at least `recover` a second
 * (`fireRecover` by a fire).
 */
export function stepHeat(heat: number, felt: number, dt: number, byFire = false): number {
  const T = TEMPERATURE;
  const e = exposureOf(felt);
  const back = (byFire ? T.fireRecover : T.recover) * dt;
  const drift = Math.abs(e) * T.rate * dt;
  let h = Number.isFinite(heat) ? heat : 0;
  if (e < 0) h = h > 0 ? Math.max(0, h - Math.max(back, drift)) : h - drift;
  else if (e > 0) h = h < 0 ? Math.min(0, h + Math.max(back, drift)) : h + drift;
  else h = h > 0 ? Math.max(0, h - back) : Math.min(0, h + back);
  return Math.max(-100, Math.min(100, h));
}

export function heatState(heat: number): HeatState {
  const T = TEMPERATURE;
  if (heat <= -T.freezing) return 'freezing';
  if (heat <= -T.cold) return 'cold';
  if (heat <= -T.chilly) return 'chilly';
  if (heat >= T.freezing) return 'overheating';
  if (heat >= T.cold) return 'hot';
  if (heat >= T.chilly) return 'warm';
  return 'ok';
}

/** How body heat bends stamina, thirst and HP right now. */
export function heatEffects(heat: number): { staminaRegen: number; thirst: number; hpLoss: number; heals: boolean } {
  switch (heatState(heat)) {
    case 'cold': return { staminaRegen: 0.6, thirst: 1, hpLoss: 0, heals: true };
    case 'freezing': return { staminaRegen: 0.3, thirst: 1, hpLoss: TEMPERATURE.hpLoss, heals: false };
    case 'warm': return { staminaRegen: 1, thirst: 1.5, hpLoss: 0, heals: true };
    case 'hot': return { staminaRegen: 0.6, thirst: 2, hpLoss: 0, heals: true };
    case 'overheating': return { staminaRegen: 0.3, thirst: 2, hpLoss: TEMPERATURE.hpLoss, heals: false };
    default: return { staminaRegen: 1, thirst: 1, hpLoss: 0, heals: true };
  }
}

const weights = new Float32Array(BIOME_IDS.length);

/**
 * How much warmer or colder the land itself is here (°C): the tundra and the peaks are bitter,
 * the badlands and the ash fields scorching, blended across biome borders, and lava burns.
 */
export function regionHeat(x: number, z: number): number {
  const w = biomeWeights(x, z, weights);
  let pull = 0;
  for (let i = 0; i < BIOME_IDS.length; i++) pull += w[i] * BIOMES[BIOME_IDS[i]].temp;
  const T = TEMPERATURE;
  const lava = lavaDist(x, z);
  return pull * T.biome + (lava < T.lavaReach ? T.lavaHeat * (1 - lava / T.lavaReach) : 0);
}
