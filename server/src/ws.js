import { WebSocketServer } from 'ws';

/** @type {Map<import('ws').WebSocket, {keywords: Set<string> | null}>} */
const clients = new Map();
let heartbeat = null;

export function initWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (socket) => {
    clients.set(socket, { keywords: null });
    socket.isAlive = true;

    socket.send(
      JSON.stringify({
        type: 'connected',
        payload: { message: '已接入 NEON//WATCH 实时信道', at: new Date().toISOString() },
      }),
    );
    broadcast('presence', { online: clients.size });

    socket.on('pong', () => {
      socket.isAlive = true;
    });

    socket.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const state = clients.get(socket);
      if (!state) return;

      if (message.type === 'subscribe' && Array.isArray(message.keywords)) {
        state.keywords = new Set(message.keywords.map(String));
        socket.send(JSON.stringify({ type: 'subscribed', payload: { keywords: [...state.keywords] } }));
      } else if (message.type === 'unsubscribe') {
        state.keywords = null;
        socket.send(JSON.stringify({ type: 'unsubscribed', payload: {} }));
      } else if (message.type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong', payload: { at: Date.now() } }));
      }
    });

    socket.on('close', () => {
      clients.delete(socket);
      broadcast('presence', { online: clients.size });
    });
  });

  heartbeat = setInterval(() => {
    for (const socket of clients.keys()) {
      if (socket.isAlive === false) {
        socket.terminate();
        clients.delete(socket);
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, 30_000);

  wss.on('close', () => clearInterval(heartbeat));
  return wss;
}

export function broadcast(type, payload) {
  const frame = JSON.stringify({ type, payload, at: new Date().toISOString() });
  for (const socket of clients.keys()) {
    if (socket.readyState === socket.OPEN) {
      socket.send(frame);
    }
  }
}

export function broadcastHotspot(hotspot) {
  for (const [socket, state] of clients.entries()) {
    if (socket.readyState !== socket.OPEN) continue;
    if (state.keywords && hotspot.keyword && !state.keywords.has(hotspot.keyword)) continue;
    socket.send(JSON.stringify({ type: 'hotspot:new', payload: hotspot, at: new Date().toISOString() }));
  }
}

export const onlineCount = () => clients.size;
