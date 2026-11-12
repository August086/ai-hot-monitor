import { useEffect, useRef, useState } from 'react';
import type { Hotspot, Stats } from '../types';

export type LiveStatus = 'connecting' | 'online' | 'offline';

interface LiveHandlers {
  onHotspotNew?: (hotspot: Hotspot) => void;
  onHotspotUpdate?: (hotspot: Hotspot) => void;
  onStats?: (stats: Stats) => void;
  onRun?: (payload: Record<string, unknown>) => void;
  onNotification?: (payload: Record<string, unknown>) => void;
  onPresence?: (online: number) => void;
}

export function useLive(handlers: LiveHandlers) {
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [online, setOnline] = useState(0);
  const handlerRef = useRef(handlers);
  handlerRef.current = handlers;

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retryTimer: number | undefined;
    let pingTimer: number | undefined;
    let closed = false;
    let attempt = 0;

    const connect = () => {
      if (closed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
      setStatus('connecting');

      socket.onopen = () => {
        attempt = 0;
        setStatus('online');
        pingTimer = window.setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'ping' }));
          }
        }, 20_000);
      };

      socket.onmessage = (event) => {
        let frame: { type: string; payload: unknown };
        try {
          frame = JSON.parse(event.data);
        } catch {
          return;
        }
        const h = handlerRef.current;
        switch (frame.type) {
          case 'hotspot:new':
            h.onHotspotNew?.(frame.payload as Hotspot);
            break;
          case 'hotspot:update':
            h.onHotspotUpdate?.(frame.payload as Hotspot);
            break;
          case 'stats:update':
            h.onStats?.(frame.payload as Stats);
            break;
          case 'run:update':
            h.onRun?.(frame.payload as Record<string, unknown>);
            break;
          case 'notification':
            h.onNotification?.(frame.payload as Record<string, unknown>);
            break;
          case 'presence': {
            const payload = frame.payload as { online: number };
            setOnline(payload.online);
            h.onPresence?.(payload.online);
            break;
          }
          default:
            break;
        }
      };

      socket.onclose = () => {
        setStatus('offline');
        window.clearInterval(pingTimer);
        if (!closed) {
          attempt += 1;
          const delay = Math.min(1000 * 2 ** attempt, 15_000);
          retryTimer = window.setTimeout(connect, delay);
        }
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    connect();

    return () => {
      closed = true;
      window.clearTimeout(retryTimer);
      window.clearInterval(pingTimer);
      socket?.close();
    };
  }, []);

  return { status, online };
}
