import { joinRoom as joinRelayRoom } from '@trystero-p2p/ws-relay';
import { joinRoom as joinNostrRoom, selfId } from 'trystero/nostr';
import type { PlayerProfile, PlayerSnapshot } from '../../shared/types';
import type { NetEvents } from './client';

const APP_ID = 'sijord-coop-v1';

interface Hello {
  profile: PlayerProfile;
  /** When this player entered the world; the earlier player keeps house 1. */
  joinedAt: number;
}

/**
 * Serverless co-op: players who type the same world code find each other through public
 * Nostr relays and then talk directly over WebRTC. Nothing needs hosting.
 */
export class P2PClient {
  private sendState: ((s: PlayerSnapshot) => void) | null = null;
  private lastSent = 0;
  private partner: string | null = null;

  constructor(private events: NetEvents) {}

  /** `relayUrl` swaps the public Nostr relays for a self-hosted Trystero relay (also used in tests). */
  connect(room: string, profile: PlayerProfile, relayUrl?: string | null): void {
    this.events.onStatus('connecting');
    let r: ReturnType<typeof joinNostrRoom>;
    try {
      r = relayUrl
        ? joinRelayRoom({ appId: APP_ID, relayConfig: { urls: [relayUrl] } }, room)
        : joinNostrRoom({ appId: APP_ID }, room);
    } catch {
      this.events.onStatus('offline');
      return;
    }
    const me: Hello = { profile, joinedAt: Date.now() };
    // Payloads travel as JSON strings to keep the typed shapes on both ends.
    const hello = r.makeAction<string>('hello');
    const state = r.makeAction<string>('state');
    this.sendState = (s) => {
      if (this.partner) void state.send(JSON.stringify(s), { target: this.partner });
    };

    r.onPeerJoin = (peerId) => void hello.send(JSON.stringify(me), { target: peerId });
    hello.onMessage = (raw, { peerId }) => {
      const h = parse<Hello>(raw);
      if (!h?.profile) return;
      // Two players per world: a third arrival is ignored.
      if (this.partner && this.partner !== peerId) return;
      const isNew = this.partner !== peerId;
      this.partner = peerId;
      const theyAreFirst = h.joinedAt < me.joinedAt || (h.joinedAt === me.joinedAt && peerId < selfId);
      if (isNew) {
        this.events.onWelcome(theyAreFirst ? 1 : 0, []);
        this.events.onPeerJoined(peerId, theyAreFirst ? 0 : 1, h.profile);
      }
    };
    state.onMessage = (raw, { peerId }) => {
      const s = parse<PlayerSnapshot>(raw);
      if (s && peerId === this.partner) this.events.onPeerState(peerId, s);
    };
    r.onPeerLeave = (peerId) => {
      if (peerId !== this.partner) return;
      this.partner = null;
      this.events.onPeerLeft(peerId);
    };
    this.events.onStatus('online');
  }

  send(s: PlayerSnapshot, nowMs: number): void {
    if (!this.sendState || nowMs - this.lastSent < 66) return;
    this.lastSent = nowMs;
    this.sendState(s);
  }
}

function parse<T>(raw: unknown): T | null {
  try {
    return typeof raw === 'string' ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
