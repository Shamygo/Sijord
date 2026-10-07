import { normalizeCreature } from '../../shared/battle/creature';
import type { Creature } from '../../shared/battle/types';
import type { ArmourSlot } from '../../shared/items';
import type { Meters } from '../../shared/survival';
import type { PlayerProfile } from '../../shared/types';

const KEY = 'sijord.save.v1';

export interface SaveData {
  profile: PlayerProfile;
  /** Trainer visual migration, independent of party/progression. */
  visualVersion?: number;
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
  /** The trainer's own HP (DESIGN §5.4). Missing means full. */
  trainerHp?: number;
  /** Discovery ids (caches opened, tablets read, notes taken; `src/shared/discoveries.ts`). */
  found?: string[];
  /** Lysfolk tablets Professor Hazel has already paid for. */
  tabletsReported?: number;
  /** The trainer's own experience (DESIGN §7.1). Missing on saves from before trainer levels. */
  trainerXp?: number;
  /** Emptied resource nodes (`kind:index`) and when (ms since epoch) each grows back. */
  depleted?: Record<string, number>;
  /** Uses left on the tool in hand, per tool id (missing: a fresh one). */
  toolWear?: Record<string, number>;
  /** Recipes made at least once (the first time gives experience). */
  crafted?: string[];
  /** Hunger, thirst and queasiness (DESIGN §6.1). Missing on older saves: fed, watered and well. */
  meters?: Meters;
  /** Pokedollars (DESIGN §6.7). Missing on older saves: they start with the new-trainer amount. */
  money?: number;
  /** Recipes learned with Technology Points (DESIGN §6.4). */
  learned?: string[];
  /** Armour worn, by slot (item ids that are also in the bag). */
  equipped?: Partial<Record<ArmourSlot, string>>;
  /** Today's Alphas already beaten or caught, here or by a friend (`alpha:lair:day`). */
  alphas?: string[];
  /** Roaming trainers beaten: trainer id -> the (UTC) day you last beat them. */
  trainers?: Record<string, number>;
  /** Sten, the Tether Defector: meals fed and caches he's pointed you to (`src/shared/defector.ts`). */
  defector?: { fed: number; told: string[] };
  /** Gudrun's cook-off: wins against her, and the (UTC) day of the last one (`src/shared/cookoff.ts`). */
  picnicker?: { wins: number; day?: number };
  /** Side quests taken and finished, by quest id (`src/shared/sidequests.ts`). */
  sideQuests?: Record<string, { state: 'active' | 'done'; n?: number }>;
}

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    if (!data?.profile?.appearance) return null;
    if (!data.visualVersion && data.profile.appearance.trainerModel === 'red') data.profile.appearance.trainerModel = 'rei';
    // Species data moved to the canonical Pokemon: fix abilities and experience that no longer
    // fit. A creature that can't be normalised is kept as it is rather than losing the save.
    for (const c of [...(Array.isArray(data.party) ? data.party : []), ...(Array.isArray(data.box) ? data.box : [])]) {
      try {
        normalizeCreature(c);
      } catch {
        // keep it unchanged
      }
    }
    return { ...data, visualVersion:2, flags:data.flags ?? [] };
  } catch {
    return null;
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({...data,visualVersion:2}));
  } catch {
    // Storage can be unavailable (private mode); the game still runs, it just won't remember.
  }
}
