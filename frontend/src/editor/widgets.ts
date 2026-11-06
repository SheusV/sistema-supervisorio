import {
  Circle,
  FabricText,
  Group,
  Rect,
  Triangle,
  type FabricObject,
} from "fabric";
import type { HmiComponent } from "./project";

const origin = { originX: "left", originY: "top" } as const;
const ink = "#25384b";
function label(text: string, left: number, top: number, fontSize = 15) {
  return new FabricText(text, {
    ...origin,
    left,
    top,
    fontFamily: "Segoe UI",
    fontSize,
    fill: ink,
  });
}
export interface Widget {
  root: Group;
  update: (value: number | boolean | null, editing: boolean) => void;
}
export function createWidget(item: HmiComponent): Widget {
  const width = item.kind === "tank" ? 180 : item.kind === "text" ? 240 : 160;
  const height = item.kind === "tank" ? 260 : item.kind === "text" ? 48 : 130;
  const base = new Rect({
    ...origin,
    width,
    height,
    fill: "transparent",
    strokeWidth: 0,
  });
  const heading = label(item.label, 12, 10, item.kind === "text" ? 18 : 14);
  heading.set({ scaleX: Math.min(1, (width - 24) / heading.width) });
  // A fixed bounding box keeps live measurements from changing the equipment geometry.
  const children: FabricObject[] = [base, heading];
  let update: Widget["update"] = () => {};
  if (item.kind === "tank") {
    const vessel = new Rect({
      ...origin,
      left: 21,
      top: 40,
      width: 138,
      height: 170,
      rx: 14,
      ry: 14,
      fill: "#eef3f6",
      stroke: "#7d91a2",
      strokeWidth: 2,
    });
    const water = new Rect({
      ...origin,
      left: 25,
      top: 112,
      width: 132,
      height: 94,
      fill: "#318f9b",
      strokeWidth: 0,
    });
    const valueLabel = label("50.0 %", 49, 115, 23);
    const quality = label("Prévia", 23, 228, 11);
    children.push(vessel, water, valueLabel, quality);
    // Group construction changes child coordinates from canvas space to group space.
    update = (value, editing) => {
      const available = typeof value === "number";
      const level = editing ? 50 : available ? value : 0;
      const bottom = 206 - height / 2;
      water.set({
        top: bottom - level * 1.62,
        height: level * 1.62,
        visible: editing || available,
      });
      valueLabel.set({
        text: editing ? "50.0 %" : available ? `${value.toFixed(1)} %` : "—",
      });
      quality.set({
        text: editing
          ? "Prévia de edição"
          : available
            ? "SIMULADO"
            : "INDISPONÍVEL",
      });
    };
  } else if (item.kind === "pump") {
    const body = new Circle({
      ...origin,
      left: 54,
      top: 36,
      radius: 25,
      fill: "#e5f0ee",
      stroke: "#588c83",
      strokeWidth: 2,
    });
    const rotor = new Triangle({
      ...origin,
      left: 68,
      top: 48,
      width: 24,
      height: 27,
      fill: "#588c83",
    });
    const status = label("Prévia de edição", 17, 106, 11);
    children.push(body, rotor, status);
    update = (value, editing) => {
      const active = editing || value === true;
      body.set({
        stroke: active ? "#27826f" : "#8494a3",
        fill: active ? "#dcefe9" : "#edf0f3",
      });
      rotor.set({ fill: active ? "#27826f" : "#8494a3" });
      status.set({
        text: editing
          ? "Prévia de edição"
          : value === null
            ? "INDISPONÍVEL"
            : value
              ? "EM OPERAÇÃO"
              : "PARADA",
      });
    };
  } else if (item.kind === "indicator") {
    const panel = new Rect({
      ...origin,
      left: 2,
      top: 35,
      width: 155,
      height: 61,
      fill: "#f5f8fa",
      stroke: "#b6c5d1",
      rx: 4,
      ry: 4,
    });
    const valueLabel = label("25.0 °C", 15, 48, 25);
    const quality = label("Prévia de edição", 12, 108, 10);
    children.push(panel, valueLabel, quality);
    update = (value, editing) => {
      const unit = item.binding === "TQ001.LEVEL" ? "%" : "°C";
      valueLabel.set({
        text: editing
          ? `25.0 ${unit}`
          : typeof value === "number"
            ? `${value.toFixed(1)} ${unit}`
            : "—",
      });
      quality.set({
        text: editing
          ? "Prévia de edição"
          : value === null
            ? "INDISPONÍVEL"
            : "SIMULADO",
      });
    };
  }
  const root = new Group(children, {
    ...origin,
    left: item.x,
    top: item.y,
    angle: item.angle,
    scaleX: item.width / width,
    scaleY: item.height / height,
    lockScalingFlip: true,
    lockSkewingX: true,
    lockSkewingY: true,
    borderColor: "#267eb0",
    cornerColor: "#267eb0",
    cornerStyle: "circle",
    cornerSize: 9,
    transparentCorners: false,
    padding: 6,
    objectCaching: false,
  });
  return { root, update };
}
