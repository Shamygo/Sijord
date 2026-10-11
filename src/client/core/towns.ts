import { SETTLEMENT_BY_ID, SETTLEMENTS, placeName, type Settlement } from '../../shared/region';
import { serviceSpot } from '../../shared/settlement-layout';
import { SHOPS, type Shop } from '../../shared/economy';
import type { ServicePoint } from '../world/settlements';

/**
 * Life in Sijord's towns: the banner when you walk into a settlement or a new biome, the prompts
 * at service buildings, which shop a door is, and where Pokémon Centers send you back to.
 */

/** Shows the place's name on arrival, once it has stayed the same for a moment (no flicker at borders). */
export class PlaceTracker {
  private current = '';
  private candidate = '';
  private held = 0;

  /** Returns a banner to show, or null. */
  update(x: number, z: number, dt: number): { title: string; sub: string } | null {
    const p = placeName(x, z);
    const key = p.settlement ? `s:${p.settlement.id}` : `b:${p.biome}`;
    if (key === this.current) {
      this.candidate = '';
      return null;
    }
    if (key !== this.candidate) {
      this.candidate = key;
      this.held = 0;
      return null;
    }
    this.held += dt;
    // Settlements announce at once; biomes once you're properly into them.
    if (this.held < (p.settlement ? 0.2 : 2.5)) return null;
    const first = this.current === '';
    this.current = key;
    this.candidate = '';
    if (first) return null;
    if (p.settlement?.tier === 'home') return null;
    return { title: p.name, sub: p.settlement ? `${tierLabel(p.settlement)} · ${p.sub}` : p.sub };
  }
}

function tierLabel(s: Settlement): string {
  return s.tier === 'large' ? 'City' : s.tier === 'medium' ? 'Town' : 'Village';
}

/** The E prompt at a service point. */
export function servicePrompt(sp: ServicePoint, badges: number): string {
  const s = sp.settlement;
  switch (sp.role) {
    case 'pokecenter': return `Enter the ${s.name} Pokémon Center`;
    case 'mart': return 'Shop at the Poké Mart';
    case 'inn': return `Visit the ${s.name} inn`;
    case 'stall': return s.tier === 'small' ? 'Trade with the travelling trader' : 'Browse the market stall';
    case 'board': return 'Read the notice board';
    case 'gym': return s.gym ? `${s.name} Gym · Leader ${s.gym.leader}` : 'The gym';
    case 'tower': return badges >= 5 ? 'Enter the Battle Tower' : 'The Battle Tower · needs 5 badges';
    case 'league': return badges >= 10 ? 'Enter the Sijord League' : 'The Pokémon League · needs 10 badges';
    default: return 'Look';
  }
}

/** The shop behind a service point, if it is one. */
export function serviceShop(sp: ServicePoint): Shop | null {
  if (sp.role === 'mart') return SHOPS[sp.settlement.tier === 'large' ? 'city-mart' : 'town-mart'];
  if (sp.role === 'stall') return SHOPS[sp.settlement.tier === 'small' ? 'village-trader' : 'market-stall'];
  return null;
}

/** Where a Pokémon Center's front door is (for respawning and fast travel). */
export function centerSpot(id: string): { x: number; z: number; yaw: number } | null {
  const s = SETTLEMENT_BY_ID[id];
  return s ? serviceSpot(s, 'pokecenter') : null;
}

/** Visited Pokémon Centers, nearest first from (x, z). */
export function travelList(visited: readonly string[], x: number, z: number): Settlement[] {
  return SETTLEMENTS.filter((s) => visited.includes(s.id)).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
}

/** A few lines of local news for a notice board: the nearest places worth a visit. */
export function noticeLines(s: Settlement): string[] {
  const near = SETTLEMENTS.filter((o) => o !== s && o.tier !== 'small').map((o) => ({ o, d: Math.hypot(o.x - s.x, o.z - s.z) }))
    .sort((a, b) => a.d - b.d).slice(0, 3);
  const dir = (o: Settlement) => compass(o.x - s.x, o.z - s.z);
  const lines = near.map(({ o, d }) => `${o.name}, ${Math.round(d / 100) / 10} km ${dir(o)}: ${o.gym ? `its ${o.gym.type} gym is led by ${o.gym.leader}.` : o.lock ? `${o.lock.what} opens to trainers with ${o.lock.badges} badges.` : o.tagline.toLowerCase() + '.'}`);
  if (s.quirk) lines.unshift(`Local custom: ${s.quirk}`);
  return lines;
}

/** Compass words for a direction (north = +Z, east = -X). */
export function compass(dx: number, dz: number): string {
  const ang = Math.atan2(-dx, dz);
  const names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  return names[(Math.round(ang / (Math.PI / 4)) + 8) % 8];
}
