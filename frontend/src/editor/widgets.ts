import {
  Circle,
  Path,
  FabricText,
  Group,
  Rect,
  Triangle,
  Ellipse,
  Polygon,
  Line,
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
export function createWidget(item: HmiComponent, customUnit?: string): Widget {
  const accent = item.color ?? "#318f9b";
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
  if (item.kind === "text") heading.set({ fill: item.color ?? ink });
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
      fill: accent,
      strokeWidth: 0,
    });
    const valueLabel = label("50.0 %", 49, 115, 23);
    const quality = label("Prévia", 23, 228, 11);
    children.push(new Line([3, 130, 21, 130], { stroke: accent, strokeWidth: 5 }), new Line([159, 130, 177, 130], { stroke: accent, strokeWidth: 5 }), vessel, water, valueLabel, quality);
    // Group construction changes child coordinates from canvas space to group space.
    update = (value, editing) => {
      const available = typeof value === "number";
      const minimum = item.rangeMin ?? 0, maximum = item.rangeMax ?? 100;
      const level = editing ? 50 : available ? Math.max(0, Math.min(100, (value - minimum) * 100 / (maximum - minimum))) : 0;
      const bottom = 206 - height / 2;
      water.set({
        top: bottom - level * 1.62,
        height: level * 1.62,
        visible: editing || available,
      });
      valueLabel.set({
        text: editing ? "50.0 %" : available ? `${value.toFixed(1)} ${customUnit ?? "%"}` : "—",
      });
      quality.set({
        text: editing
          ? "Prévia de edição"
          : available
            ? "SIMULADO"
            : "INDISPONÍVEL",
      });
    };
  } else if (item.kind === "silo") {
    const bin = new Polygon([{x: 0, y: 0}, {x: 92, y: 0}, {x: 92, y: 43}, {x: 53, y: 67}, {x: 39, y: 67}, {x: 0, y: 43}],
      { ...origin, left: 22, top: 31, fill: "#edf3f5", stroke: ink, strokeWidth: 2 });
    const track = new Rect({ ...origin, left: 127, top: 31, width: 12, height: 67, fill: "#dbe3e8" });
    const bar = new Rect({ left: 127, top: 98, originX: "left", originY: "bottom", width: 12, height: 34, fill: accent, strokeWidth: 0 });
    const reading = label("", 13, 107, 13);
    children.push(bin, track, bar, reading);
    update = (value, editing) => {
      const min = item.rangeMin ?? 0, max = item.rangeMax ?? 100;
      const amount = editing ? (min + max) / 2 : value;
      const fraction = typeof amount === "number" ? Math.max(0, Math.min(1, (amount - min) / (max - min))) : 0;
      bar.set({ height: fraction * 67 });
      reading.set({ text: typeof amount === "number" ? amount.toFixed(1) + " " + (customUnit ?? "") : "INDISPONÍVEL" });
    };
  } else if (item.kind === "conveyor" || item.kind === "feeder" || item.kind === "mixer") {
    const shapes = {
      conveyor: "M 31 48 H 130 A 16 16 0 0 1 130 80 H 31 A 16 16 0 0 1 31 48 Z M 33 81 L 24 95 M 126 81 L 134 95 M 26 64 A 6 6 0 1 0 38 64 A 6 6 0 1 0 26 64 M 124 64 A 6 6 0 1 0 136 64 A 6 6 0 1 0 124 64",
      feeder: "M 15 34 H 67 L 51 58 H 31 Z M 18 59 H 142 V 85 H 18 Z M 27 72 H 135 M 37 62 L 47 82 M 56 62 L 66 82 M 75 62 L 85 82 M 94 62 L 104 82 M 113 62 L 123 82",
      mixer: "M 34 47 V 82 Q 34 96 49 96 H 112 Q 127 96 127 82 V 47 M 66 31 H 94 V 48 H 66 Z M 80 48 V 80 M 54 68 L 80 80 L 106 68 M 54 83 L 80 71 L 106 83",
    };
    const symbol = new Path(shapes[item.kind], { fill: "", stroke: ink, strokeWidth: 3, strokeLineJoin: "round" });
    const status = label("", 12, 106, 12);
    children.push(symbol, status);
    update = (value, editing) => {
      symbol.set({ stroke: editing || value === true ? accent : "#8494a3" });
      status.set({ text: editing ? "Prévia de edição" : value === null ? "INDISPONÍVEL" : value ? "ACIONADO" : "PARADO" });
    };
  } else if (["pump", "valve", "motor", "button"].includes(item.kind)) {
    const body = new Circle({
      ...origin,
      left: 54,
      top: 40,
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
    const symbol = item.kind === "valve"
      ? new Polygon([{ x: 0, y: 0 }, { x: 66, y: 42 }, { x: 66, y: 0 }, { x: 0, y: 42 }], { ...origin, left: 45, top: 43, fill: accent, stroke: ink, strokeWidth: 1 })
      : item.kind === "button" ? new Rect({ ...origin, left: 12, top: 36, width: 136, height: 54, rx: 6, ry: 6, fill: accent }) : body;
    const centerLabel = label(item.kind === "motor" ? "M" : "Alternar", item.kind === "motor" ? 67 : 45, 49, item.kind === "motor" ? 24 : 16);
    if (item.kind === "pump" || item.kind === "valve") children.push(
      new Line([3, 65, item.kind === "pump" ? 54 : 45, 65], { stroke: accent, strokeWidth: 5 }),
      new Line([item.kind === "pump" ? 104 : 111, 65, 157, 65], { stroke: accent, strokeWidth: 5 }),
    );
    children.push(symbol, ...(item.kind === "pump" ? [rotor] : item.kind === "motor" || item.kind === "button" ? [centerLabel] : []), status);
    update = (value, editing) => {
      const active = editing || value === true;
      symbol.set({
        stroke: active ? accent : "#8494a3",
        fill: active ? accent : "#edf0f3",
      });
      rotor.set({ fill: active ? "#ffffff" : "#8494a3" });
      status.set({
        text: editing
          ? "Prévia de edição"
          : value === null
            ? "INDISPONÍVEL"
            : value
              ? item.kind === "valve" ? "ABERTA" : "LIGADO"
              : item.kind === "valve" ? "FECHADA" : "DESLIGADO",
      });
    };
  } else if (["indicator", "sensor", "setpoint"].includes(item.kind)) {
    const panel = new Rect({
      ...origin,
      left: 2,
      top: 35,
      width: 155,
      height: 61,
      fill: "#f5f8fa",
      stroke: accent,
      rx: 4,
      ry: 4,
    });
    const valueLabel = label("25.0 °C", 15, 48, 25);
    const quality = label("Prévia de edição", 12, 108, 10);
    children.push(panel, valueLabel, quality);
    update = (value, editing) => {
      const unit = customUnit ?? (item.binding === "TQ001.LEVEL" ? "%" : "°C");
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
  } else if (item.kind === "rectangle" || item.kind === "ellipse") {
    const shape = item.kind === "rectangle" ? new Rect({ ...origin, left: 8, top: 34, width: 144, height: 88, fill: accent, strokeWidth: 0 })
      : new Ellipse({ ...origin, left: 8, top: 34, rx: 72, ry: 44, fill: accent, strokeWidth: 0 });
    children.push(shape);
    update = (value, editing) => shape.set({ fill: editing || !item.binding || value === true ? accent : value === false ? "#c6d0d8" : "#edf0f3" });
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
