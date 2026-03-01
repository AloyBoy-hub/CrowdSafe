import { useCallback, useEffect, useRef, useState } from "react";
import { WS_URL } from "../lib/api";
import type { SimFrame } from "../lib/types";
import { useSimStore } from "../store/useSimStore";

export type ConnectionState = "connecting" | "open" | "closed" | "error";

const MAX_RECONNECT_DELAY_MS = 10000;

interface UseSimulationResult {
  connectionState: ConnectionState;
  lastFrameAt: number | null;
}

export function useSimulation(): UseSimulationResult {
  const setFrame = useSimStore((state) => state.setFrame);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [lastFrameAt, setLastFrameAt] = useState<number | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const isDisposedRef = useRef(false);

  const connect = useCallback(() => {
    if (isDisposedRef.current) {
      return;
    }

    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    setConnectionState("connecting");
    const socket = new WebSocket(WS_URL);
    socketRef.current = socket;

    socket.onopen = () => {
      reconnectAttemptRef.current = 0;
      setConnectionState("open");
    };

    socket.onmessage = (event) => {
      try {
        const frame = JSON.parse(event.data) as SimFrame;
        setFrame(frame);
        setLastFrameAt(Date.now());
      } catch (error) {
        console.error("Invalid simulation frame payload", error);
      }
    };

    socket.onerror = () => {
      setConnectionState("error");
    };

    socket.onclose = () => {
      if (isDisposedRef.current) {
        return;
      }

      setConnectionState("closed");
      const delay = Math.min(1000 * 2 ** reconnectAttemptRef.current, MAX_RECONNECT_DELAY_MS);
      reconnectAttemptRef.current += 1;
      reconnectTimerRef.current = window.setTimeout(connect, delay);
    };
  }, [setFrame]);

  useEffect(() => {
    isDisposedRef.current = false;
    connect();

    return () => {
      isDisposedRef.current = true;

      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }

      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [connect]);

  return { connectionState, lastFrameAt };
}

