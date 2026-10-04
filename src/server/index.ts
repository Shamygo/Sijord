import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { DEFAULT_SERVER_PORT, decode, encode, type ClientMessage } from '../shared/protocol';
import { RoomRegistry } from './rooms';

const port = Number(process.env.PORT ?? DEFAULT_SERVER_PORT);
const wss = new WebSocketServer({ port });
const rooms = new RoomRegistry();

wss.on('connection', (socket: WebSocket) => {
  const id = randomUUID();
  let room: string | null = null;
  const send = (msg: Parameters<typeof encode>[0]) => {
    if (socket.readyState === socket.OPEN) socket.send(encode(msg));
  };

  socket.on('message', (data) => {
    const msg = decode<ClientMessage>(data.toString());
    if (!msg) return;
    if (msg.t === 'hello' && room === null) {
      const code = String(msg.room || 'default').slice(0, 32);
      if (!rooms.join(code, id, msg.profile, send)) {
        send({ t: 'room-full' });
        socket.close();
        return;
      }
      room = code;
      console.log(`[sijord] ${msg.profile.name} joined room "${code}" (${rooms.size(code)}/2)`);
    } else if (msg.t === 'state' && room !== null) {
      rooms.state(room, id, msg.s);
    }
  });

  socket.on('close', () => {
    if (room !== null) {
      rooms.leave(room, id);
      console.log(`[sijord] a player left room "${room}" (${rooms.size(room)}/2)`);
    }
  });
});

console.log(`[sijord] co-op server listening on ws://localhost:${port}`);
