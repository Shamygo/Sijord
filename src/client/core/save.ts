import type { Creature } from '../../shared/battle/types';
import type { PlayerProfile } from '../../shared/types';

const KEY = 'sijord.save.v1';

export interface SaveData {
  profile: PlayerProfile;
  room: string;
  /** Story flags, e.g. "met-professor", "left-town". */
  flags: string[];
  /** Item id to count. Missing on saves from before the bag existed. */
  bag?: Record<string, number>;
  /** Party in order; the first two healthy ones lead in battle. Missing before M2. */
  party?: Creature[];
  /** The starter species picked at Hazel's lab (Sunniva picks the one that beats it). */
  starter?: string;
  /** Gym badges earned; sets the level cap. */
  badges?: number;
  /** Creatures that didn't fit in the party, stored in the PC at Hazel's lab. */
  box?: Creature[];
  /** Species ids seen in battle and caught, for the Dex. */
  dex?: { seen: string[]; caught: string[] };
}

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    return data?.profile?.appearance ? { ...data, flags: data.flags ?? [] } : null;
  } catch {
    return null;
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage can be unavailable (private mode); the game still runs, it just won't remember.
  }
}
