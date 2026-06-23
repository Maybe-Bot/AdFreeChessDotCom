import { WebSocket } from 'ws';
import type { ServerMessage } from '@chess/shared';

const rooms = new Map<string, Set<WebSocket>>();

export function joinRoom(gameId: string, ws: WebSocket) {
  if (!rooms.has(gameId)) rooms.set(gameId, new Set());
  rooms.get(gameId)!.add(ws);
}

export function leaveRoom(gameId: string, ws: WebSocket) {
  const room = rooms.get(gameId);
  if (!room) return;
  room.delete(ws);
  if (room.size === 0) rooms.delete(gameId);
}

export function broadcast(gameId: string, msg: ServerMessage, exclude?: WebSocket) {
  const room = rooms.get(gameId);
  if (!room) return;
  const data = JSON.stringify(msg);
  for (const client of room) {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

export function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}
