import { useEffect, useState, type PointerEvent } from "react";
import type { FabricObject } from "fabric";
import type { ConnectionLine, HmiProject, Port } from "./project";

const sides = { left: "Esquerda", top: "Topo", right: "Direita", bottom: "Base" } as const;
const corners = { top: 0, right: 1, bottom: 2, left: 3 };

export interface Point { x: number; y: number }
export interface DrawingPort extends Point { id: string; label: string; side: Port }

export function portPosition(object: FabricObject, side: Port): Point {
  const points = object.getCoords();
  const index = corners[side];
  const a = points[index], b = points[(index + 1) % 4];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function connectionPath(a: Point, b: Point, side: Port) {
  const horizontal = side === "left" || side === "right";
  const middle = horizontal ? (a.x + b.x) / 2 : (a.y + b.y) / 2;
  const bend = horizontal
    ? `L ${middle} ${a.y} L ${middle} ${b.y}`
    : `L ${a.x} ${middle} L ${b.x} ${middle}`;
  return `M ${a.x} ${a.y} ${bend} L ${b.x} ${b.y}`;
}

export interface DrawingSession {
  project: HmiProject;
  ports: DrawingPort[];
}

interface Props {
  session: DrawingSession;
  source: DrawingPort | null;
  selectSource: (port: DrawingPort) => void;
  kind: ConnectionLine["kind"];
  finish: (source: DrawingPort, target: DrawingPort) => void;
  cancel: () => void;
}

export function PortOverlay({ session, source, selectSource, kind, finish, cancel }: Props) {
  const [pointer, setPointer] = useState<Point | null>(null);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") cancel(); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [cancel]);
  function preview(event: PointerEvent<HTMLDivElement>) {
    if (!source) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setPointer({
      x: (event.clientX - rect.left) * 1200 / rect.width,
      y: (event.clientY - rect.top) * 720 / rect.height,
    });
  }
  return <div className="port-overlay" aria-label="Portas de ligação" onPointerMove={preview}>
    {source && pointer && <svg aria-hidden="true" viewBox="0 0 1200 720">
      <path d={connectionPath(source, pointer, source.side)} fill="none" stroke="#087c85"
        strokeWidth={kind === "pipe" ? 4 : 2} strokeDasharray={kind === "signal" ? "8 5" : undefined} />
    </svg>}
    {session.ports.map(port => {
      const label = `${port.label} · ${sides[port.side]}`;
      return <button type="button" key={`${port.id}/${port.side}`} aria-label={label} title={label}
        disabled={port.id === source?.id} className={source === port ? "chosen-port" : ""}
        style={{ left: `${port.x / 12}%`, top: `${port.y / 7.2}%` }}
        onClick={() => {
          if (source) finish(source, port);
          else { selectSource(port); setPointer(port); }
        }} />;
    })}
  </div>;
}

export const portSides = Object.keys(sides) as Port[];
