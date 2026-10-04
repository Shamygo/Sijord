import { DEFAULT_SERVER_PORT, decode, encode, type ClientMessage, type ServerMessage } from '../../shared/protocol';
import type { PlayerProfile, PlayerSnapshot } from '../../shared/types';

export interface NetEvents {
  onWelcome(slot: 0 | 1, peers: { id: string; slot: 0 | 1; profile: PlayerProfile; s?: PlayerSnapshot }[]): void;
  onPeerJoined(id: string, slot: 0 | 1, profile: PlayerProfile): void;
  onPeerState(id: string, s: PlayerSnapshot): void;
  onPeerLeft(id: string): void;
  onStatus(status: 'connecting' | 'online' | 'offline' | 'full'): void;
}

/** Sends this player's state ~15 times a second; the game still runs solo when no server answers. */
export class NetClient {
  private socket: WebSocket | null = null;
  private lastSent = 0;
  private open = false;

  constructor(private events: NetEvents) {}

  connect(url: string, room: string, profile: PlayerProfile): void {
    this.events.onStatus('connecting');
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      this.events.onStatus('offline');
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      this.open = true;
      this.send({ t: 'hello', room, profile });
    };
    socket.onmessage = (ev) => {
      const msg = decode<ServerMessage>(String(ev.data));
      if (!msg) return;
      switch (msg.t) {
        case 'welcome':
          this.events.onStatus('online');
          this.events.onWelcome(msg.slot, msg.peers);
          break;
        case 'peer-joined':
          this.events.onPeerJoined(msg.id, msg.slot, msg.profile);
          break;
        case 'peer-state':
          this.events.onPeerState(msg.id, msg.s);
          break;
        case 'peer-left':
          this.events.onPeerLeft(msg.id);
          break;
        case 'room-full':
          this.events.onStatus('full');
          break;
      }
    };
    socket.onclose = () => {
      this.events.onStatus('offline');
      this.open = false;
    };
  }

  sendState(s: PlayerSnapshot, nowMs: number): void {
    if (!this.open || nowMs - this.lastSent < 66) return;
    this.lastSent = nowMs;
    this.send({ t: 'state', s: round(s) });
  }

  private send(msg: ClientMessage): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) this.socket.send(encode(msg));
  }
}

/** Server URL: `?server=` overrides; otherwise the same host on the default port. */
export function defaultServerUrl(): string {
  const params = new URLSearchParams(location.search);
  const override = params.get('server');
  if (override) return override;
  const host = location.hostname || 'localhost';
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${host}:${DEFAULT_SERVER_PORT}`;
}

function round(s: PlayerSnapshot): PlayerSnapshot {
  const r = (v: number) => Math.round(v * 100) / 100;
  return { x: r(s.x), y: r(s.y), z: r(s.z), yaw: r(s.yaw), speed: r(s.speed), anim: s.anim };
}
