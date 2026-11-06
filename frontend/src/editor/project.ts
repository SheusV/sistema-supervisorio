import type { TagName } from "../tags/model";

export type ComponentKind = "tank" | "pump" | "indicator" | "text";
export interface HmiComponent {
  id: string;
  kind: ComponentKind;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  binding: TagName | null;
}
export interface HmiProject {
  schemaVersion: 1;
  name: string;
  screen: { width: 1200; height: 720 };
  components: HmiComponent[];
}
export const componentNames: Record<ComponentKind, string> = {
  tank: "Tanque",
  pump: "Bomba",
  indicator: "Indicador",
  text: "Texto",
};
export const bindings: Record<ComponentKind, TagName[]> = {
  tank: ["TQ001.LEVEL"],
  pump: ["P001.RUNNING"],
  indicator: ["TQ001.TEMPERATURE", "TQ001.LEVEL"],
  text: [],
};
export const MAX_COMPONENTS = 100;
export const MAX_PROJECT_BYTES = 262144;

export function createComponent(
  kind: ComponentKind,
  index: number,
): HmiComponent {
  return {
    id: crypto.randomUUID(),
    kind,
    label: componentNames[kind],
    x: 80 + (index % 8) * 24,
    y: 80 + (index % 8) * 24,
    width: kind === "tank" ? 180 : 160,
    height: kind === "tank" ? 260 : kind === "text" ? 48 : 130,
    angle: 0,
    binding: bindings[kind][0] ?? null,
  };
}
export function exampleProject(): HmiProject {
  return {
    schemaVersion: 1,
    name: "Tanque TQ-001",
    screen: { width: 1200, height: 720 },
    components: [
      {
        ...createComponent("text", 0),
        label: "ALIMENTAÇÃO / TQ-001",
        x: 100,
        y: 64,
        width: 360,
      },
      { ...createComponent("tank", 0), label: "TQ-001", x: 510, y: 190 },
      { ...createComponent("pump", 0), label: "P-001", x: 180, y: 310 },
      { ...createComponent("indicator", 0), label: "TT-001", x: 860, y: 240 },
    ],
  };
}

function record(input: unknown, keys: string[]): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Estrutura de projeto inválida.");
  const object = input as Record<string, unknown>;
  if (
    Object.keys(object).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(object, key))
  ) {
    throw new Error("O projeto contém campos ausentes ou não suportados.");
  }
  return object;
}
function text(value: unknown, max: number): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    /[\u0000-\u001f]/.test(value)
  ) {
    throw new Error(
      `Use um texto de 1 a ${max} caracteres, sem caracteres de controle.`,
    );
  }
  return value;
}
function number(value: unknown, min: number, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    throw new Error("Posição, tamanho ou rotação fora dos limites permitidos.");
  }
  return value;
}

/** Imports only a small domain schema, never executable Fabric scenes or remote assets. */
export function parseProject(raw: string): HmiProject {
  if (new TextEncoder().encode(raw).length > MAX_PROJECT_BYTES)
    throw new Error("O arquivo excede o limite de 256 KiB.");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("Não foi possível ler o JSON do projeto.");
  }
  const project = record(json, [
    "schemaVersion",
    "name",
    "screen",
    "components",
  ]);
  if (project.schemaVersion !== 1)
    throw new Error("Versão de projeto não suportada.");
  const screen = record(project.screen, ["width", "height"]);
  if (screen.width !== 1200 || screen.height !== 720)
    throw new Error("A tela deve ter 1200 × 720 px.");
  if (
    !Array.isArray(project.components) ||
    project.components.length > MAX_COMPONENTS
  )
    throw new Error("Limite de 100 componentes por tela.");
  const ids = new Set<string>();
  const components = project.components.map((input) => {
    const item = record(input, [
      "id",
      "kind",
      "label",
      "x",
      "y",
      "width",
      "height",
      "angle",
      "binding",
    ]);
    const id = text(item.id, 80);
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id))
      throw new Error("Identificador de componente inválido ou repetido.");
    ids.add(id);
    if (
      typeof item.kind !== "string" ||
      !Object.hasOwn(componentNames, item.kind)
    )
      throw new Error("Componente não suportado.");
    const kind = item.kind as ComponentKind;
    if (
      item.binding !== null &&
      !bindings[kind].includes(item.binding as TagName)
    )
      throw new Error("A tag é incompatível com este componente.");
    return {
      id,
      kind,
      label: text(item.label, 64),
      x: number(item.x, 0, 1160),
      y: number(item.y, 0, 688),
      width: number(item.width, 40, 500),
      height: number(item.height, 32, 500),
      angle: number(item.angle, -180, 180),
      binding: item.binding as TagName | null,
    };
  });
  return {
    schemaVersion: 1,
    name: text(project.name, 80),
    screen: { width: 1200, height: 720 },
    components,
  };
}
export function serializeProject(project: HmiProject): string {
  return JSON.stringify(parseProject(JSON.stringify(project)), null, 2);
}

export interface ProjectHistory {
  past: HmiProject[];
  present: HmiProject;
  future: HmiProject[];
}
export type ProjectAction =
  { type: "change"; project: HmiProject } | { type: "undo" } | { type: "redo" };
export function projectReducer(
  state: ProjectHistory,
  action: ProjectAction,
): ProjectHistory {
  if (action.type === "change") {
    const project = parseProject(JSON.stringify(action.project));
    if (JSON.stringify(project) === JSON.stringify(state.present)) return state;
    return {
      past: [...state.past, state.present].slice(-60),
      present: project,
      future: [],
    };
  }
  if (action.type === "undo" && state.past.length)
    return {
      past: state.past.slice(0, -1),
      present: state.past.at(-1)!,
      future: [state.present, ...state.future],
    };
  if (action.type === "redo" && state.future.length)
    return {
      past: [...state.past, state.present],
      present: state.future[0],
      future: state.future.slice(1),
    };
  return state;
}
