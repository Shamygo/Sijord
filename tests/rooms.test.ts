import { describe, expect, it } from 'vitest';
import { RoomRegistry } from '../src/server/rooms';
import type { ServerMessage } from '../src/shared/protocol';
import { DEFAULT_APPEARANCE, type PlayerProfile } from '../src/shared/types';

const profile = (name: string): PlayerProfile => ({ name, appearance: DEFAULT_APPEARANCE, playerClass: 'ranger' });

function inbox() {
  const msgs: ServerMessage[] = [];
  return { msgs, send: (m: ServerMessage) => msgs.push(m) };
}

describe('RoomRegistry', () => {
  it('assigns slots, introduces peers and relays state', () => {
    const r = new RoomRegistry();
    const a = inbox();
    const b = inbox();
    r.join('x', 'a', profile('Ash'), a.send);
    r.join('x', 'b', profile('Bea'), b.send);
    expect(a.msgs[0]).toMatchObject({ t: 'welcome', slot: 0, peers: [] });
    expect(b.msgs[0]).toMatchObject({ t: 'welcome', slot: 1, peers: [{ id: 'a' }] });
    expect(a.msgs[1]).toMatchObject({ t: 'peer-joined', id: 'b', slot: 1 });

    r.state('x', 'a', { x: 1, y: 0, z: 2, yaw: 0, speed: 3, anim: 'walk' });
    expect(b.msgs.at(-1)).toMatchObject({ t: 'peer-state', id: 'a' });
    expect(a.msgs.some((m) => m.t === 'peer-state')).toBe(false);
  });

  it('rejects a third player and frees the slot on leave', () => {
    const r = new RoomRegistry();
    r.join('x', 'a', profile('A'), () => {});
    const b = inbox();
    r.join('x', 'b', profile('B'), b.send);
    expect(r.join('x', 'c', profile('C'), () => {})).toBeNull();
    r.leave('x', 'a');
    expect(b.msgs.at(-1)).toMatchObject({ t: 'peer-left', id: 'a' });
    const c = inbox();
    r.join('x', 'c', profile('C'), c.send);
    expect(c.msgs[0]).toMatchObject({ t: 'welcome', slot: 0 });
  });
});
