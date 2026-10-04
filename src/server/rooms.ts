import { MAX_PLAYERS, type ServerMessage } from '../shared/protocol';
import type { PlayerProfile, PlayerSnapshot } from '../shared/types';

export interface Member {
  id: string;
  slot: 0 | 1;
  profile: PlayerProfile;
  last?: PlayerSnapshot;
  send(msg: ServerMessage): void;
}

/**
 * Two-player worlds keyed by a room code. Kept free of socket code so it can be unit tested.
 */
export class RoomRegistry {
  private rooms = new Map<string, Member[]>();

  /** Adds a member to a room, or returns null when the room already has two players. */
  join(room: string, id: string, profile: PlayerProfile, send: Member['send']): Member | null {
    const members = this.rooms.get(room) ?? [];
    if (members.length >= MAX_PLAYERS) return null;
    const taken = new Set(members.map((m) => m.slot));
    const slot: 0 | 1 = taken.has(0) ? 1 : 0;
    const member: Member = { id, slot, profile, send };
    member.send({
      t: 'welcome',
      id,
      slot,
      peers: members.map((m) => ({ id: m.id, slot: m.slot, profile: m.profile, s: m.last })),
    });
    for (const m of members) m.send({ t: 'peer-joined', id, slot, profile });
    members.push(member);
    this.rooms.set(room, members);
    return member;
  }

  state(room: string, id: string, s: PlayerSnapshot): void {
    const members = this.rooms.get(room);
    if (!members) return;
    for (const m of members) {
      if (m.id === id) m.last = s;
      else m.send({ t: 'peer-state', id, s });
    }
  }

  leave(room: string, id: string): void {
    const members = this.rooms.get(room);
    if (!members) return;
    const rest = members.filter((m) => m.id !== id);
    if (rest.length === 0) this.rooms.delete(room);
    else {
      this.rooms.set(room, rest);
      for (const m of rest) m.send({ t: 'peer-left', id });
    }
  }

  size(room: string): number {
    return this.rooms.get(room)?.length ?? 0;
  }
}
