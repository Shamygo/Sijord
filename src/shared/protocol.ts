import type { PlayerProfile, PlayerSnapshot } from './types';

/** A world holds at most two players: the game is built for two-player co-op. */
export const MAX_PLAYERS = 2;
export const DEFAULT_SERVER_PORT = 8787;

export type ClientMessage =
  | { t: 'hello'; room: string; profile: PlayerProfile }
  | { t: 'state'; s: PlayerSnapshot };

export type ServerMessage =
  | { t: 'welcome'; id: string; slot: 0 | 1; peers: { id: string; slot: 0 | 1; profile: PlayerProfile; s?: PlayerSnapshot }[] }
  | { t: 'peer-joined'; id: string; slot: 0 | 1; profile: PlayerProfile }
  | { t: 'peer-state'; id: string; s: PlayerSnapshot }
  | { t: 'peer-left'; id: string }
  | { t: 'room-full' };

export function encode(msg: ClientMessage | ServerMessage): string {
  return JSON.stringify(msg);
}

export function decode<T extends ClientMessage | ServerMessage>(raw: string): T | null {
  try {
    const v = JSON.parse(raw);
    return v && typeof v.t === 'string' ? (v as T) : null;
  } catch {
    return null;
  }
}
