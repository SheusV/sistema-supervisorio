import { useEffect, useState } from "react";
import { parseSnapshot, type Snapshot } from "./model";

export type Connection = "connecting" | "live" | "offline" | "stale";
export function useTags() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout>;
    let lastMessage = 0;
    let attempt = 0;
    function connect() {
      if (disposed) return;
      setConnection("connecting");
      lastMessage = Date.now();
      let sequence = -1;
      socket = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/tags`,
      );
      socket.onmessage = ({ data }) => {
        if (disposed) return;
        try {
          const next = parseSnapshot(data);
          if (next.sequence <= sequence) return;
          sequence = next.sequence;
          lastMessage = Date.now();
          attempt = 0;
          setSnapshot(next);
          setConnection("live");
        } catch {
          setConnection("stale");
          socket?.close();
        }
      };
      socket.onerror = () => socket?.close();
      socket.onclose = () => {
        if (disposed) return;
        setConnection("offline");
        retry = setTimeout(connect, Math.min(1000 * 2 ** attempt++, 10000));
      };
    }
    connect();
    const watchdog = setInterval(() => {
      if (lastMessage && Date.now() - lastMessage > 5000) {
        setConnection("stale");
        socket?.close();
        lastMessage = 0;
      }
    }, 1000);
    return () => {
      disposed = true;
      clearTimeout(retry);
      clearInterval(watchdog);
      socket?.close();
    };
  }, []);
  return { snapshot, connection };
}
