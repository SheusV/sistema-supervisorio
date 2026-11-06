import { parseProject, type HmiComponent, type HmiProject } from "./project";

export type LayoutAction = "left" | "centerX" | "right" | "top" | "centerY" | "bottom" | "spaceX" | "spaceY";
export const layoutLabels: Record<LayoutAction, string> = {
  left: "Alinhar à esquerda", centerX: "Centralizar horizontalmente", right: "Alinhar à direita",
  top: "Alinhar ao topo", centerY: "Centralizar verticalmente", bottom: "Alinhar à base",
  spaceX: "Distribuir na horizontal", spaceY: "Distribuir na vertical",
};

// Bounds of the rotated component box in screen coordinates (top-left origin).
export function bounds(item: HmiComponent) {
  const radians = item.angle * Math.PI / 180;
  const c = Math.cos(radians), s = Math.sin(radians);
  const xs = [0, item.width * c, -item.height * s, item.width * c - item.height * s];
  const ys = [0, item.width * s, item.height * c, item.width * s + item.height * c];
  return { left: item.x + Math.min(...xs), right: item.x + Math.max(...xs),
    top: item.y + Math.min(...ys), bottom: item.y + Math.max(...ys) };
}

export function arrange(project: HmiProject, ids: string[], action: LayoutAction): HmiProject {
  const selected = project.components.filter(item => ids.includes(item.id));
  const spacing = action === "spaceX" || action === "spaceY";
  if (selected.length < (spacing ? 3 : 2)) return project;
  const horizontal = ["left", "right", "centerX", "spaceX"].includes(action);
  const start = horizontal ? "left" : "top", end = horizontal ? "right" : "bottom";
  const entries = selected.map(item => ({ item, box: bounds(item) }));
  const min = Math.min(...entries.map(e => e.box[start]));
  const max = Math.max(...entries.map(e => e.box[end]));
  const positions = new Map<string, number>();
  if (spacing) {
    entries.sort((a, b) => a.box[start] - b.box[start]);
    const gap = (max - min - entries.reduce((sum, e) => sum + e.box[end] - e.box[start], 0)) / (entries.length - 1);
    if (gap < -0.001) throw new Error("Afaste os objetos antes de distribuir: não há espaço suficiente entre os extremos.");
    let cursor = min;
    for (const { item, box } of entries) {
      positions.set(item.id, (horizontal ? item.x : item.y) + cursor - box[start]);
      cursor += box[end] - box[start] + Math.max(0, gap);
    }
  } else {
    for (const { item, box } of entries) {
      const delta = action === "left" || action === "top" ? min - box[start]
        : action === "right" || action === "bottom" ? max - box[end]
        : (min + max - box[start] - box[end]) / 2;
      positions.set(item.id, (horizontal ? item.x : item.y) + delta);
    }
  }
  const components = project.components.map(item => {
    const value = positions.get(item.id);
    return value === undefined ? item : { ...item, [horizontal ? "x" : "y"]: Math.round(value * 1000) / 1000 };
  });
  try { return parseProject(JSON.stringify({ ...project, components })); }
  catch { throw new Error("O alinhamento ultrapassa os limites de posição. Reposicione os objetos e tente novamente."); }
}

export function moveTogether(project: HmiProject, ids: string[], dx: number, dy: number): HmiProject {
  const items = project.components.filter(item => ids.includes(item.id));
  if (!items.length) return project;
  // Clamp the shared translation, preserving the distances between all objects.
  dx = Math.max(-Math.min(...items.map(i => i.x)), Math.min(1160 - Math.max(...items.map(i => i.x)), dx));
  dy = Math.max(-Math.min(...items.map(i => i.y)), Math.min(688 - Math.max(...items.map(i => i.y)), dy));
  return parseProject(JSON.stringify({ ...project, components: project.components.map(item => ids.includes(item.id)
    ? { ...item, x: item.x + dx, y: item.y + dy } : item) }));
}
