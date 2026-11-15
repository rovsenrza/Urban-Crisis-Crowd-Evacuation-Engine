import { useEffect, useRef, useState } from "react";
import type { WsMessage } from "../api/types";
import { platform } from "../platform";

const PING_MS = 25_000;
const MAX_BACKOFF_MS = 8_000;

/**
 * Auto-reconnecting WebSocket. `onReconnect` fires after every successful
 * re-connection so the caller can reload state it may have missed.
 */
export function useLiveSocket(
  path: string | null,
  onMessage: (message: WsMessage) => void,
  onReconnect?: () => void,
): boolean {
  const [connected, setConnected] = useState(false);
  // Latest callbacks in refs: the socket must not be recreated on every render.
  const handlers = useRef({ onMessage, onReconnect });
  handlers.current = { onMessage, onReconnect };

  useEffect(() => {
    if (!path) return;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;
    let attempts = 0;
    let everConnected = false;
    let disposed = false;

    const connect = () => {
      socket = new WebSocket(platform.realtime.url(path));
      socket.onopen = () => {
        attempts = 0;
        setConnected(true);
        if (everConnected) handlers.current.onReconnect?.();
        everConnected = true;
        ping = setInterval(() => socket?.readyState === WebSocket.OPEN && socket.send("ping"), PING_MS);
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WsMessage;
          if (message.type !== "pong") handlers.current.onMessage(message);
        } catch {
          /* ignore malformed frames */
        }
      };
      socket.onclose = () => {
        setConnected(false);
        clearInterval(ping);
        if (disposed) return;
        attempts += 1;
        retry = setTimeout(connect, Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempts));
      };
      socket.onerror = () => socket?.close();
    };

    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      clearInterval(ping);
      socket?.close();
    };
  }, [path]);

  return connected;
}
