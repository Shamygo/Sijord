import type { PlayerProfile } from '../../shared/types';

const KEY = 'sijord.save.v1';

export interface SaveData {
  profile: PlayerProfile;
  room: string;
  /** Story flags, e.g. "met-professor", "left-town". */
  flags: string[];
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
