import type { TagName } from "../tags/model";
import type { DryingRecipe } from "./drying";

export type ComponentKind = "tank" | "pump" | "indicator" | "text" | "valve" | "motor" | "sensor" | "button" | "setpoint" | "rectangle" | "ellipse" | "silo" | "conveyor" | "feeder" | "mixer" | "crusher" | "oven";
export interface ProjectVariable {
  name: string; dataType: "BOOLEAN" | "DOUBLE"; unit: string;
  initial: number | boolean; min: number; max: number;
}
export interface TankRule {
  highHysteresis?: number;
  highDelaySeconds?: number;
  dryingRecipe?: DryingRecipe;
  levelTag: string; enableTag: string; permitTag?: string; drainTags?: string[]; highLimit?: number; fillRate: number; drainRate: number;
}
export type Port = "left" | "right" | "top" | "bottom";
export interface ConnectionLine {
  id: string; from: string; to: string; fromPort: Port; toPort: Port;
  kind: "pipe" | "signal"; binding: string | null;
}
export interface HmiComponent {
  id: string;
  kind: ComponentKind;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  binding: string | null;
  color?: string;
  rangeMin?: number;
  rangeMax?: number;
}
export interface HmiProject {
  schemaVersion: 1 | 2;
  name: string;
  screen: { width: 1200; height: 720 };
  components: HmiComponent[];
  variables?: ProjectVariable[];
  connections?: ConnectionLine[];
  simulation?: TankRule;
}
export const componentNames: Record<ComponentKind, string> = {
  silo: "Silo", conveyor: "Esteira", feeder: "Dosador de rosca", mixer: "Misturador", crusher: "Triturador", oven: "Forno",
  tank: "Tanque",
  pump: "Bomba",
  indicator: "Indicador",
  text: "Texto",
  valve: "Válvula", motor: "Motor", sensor: "Sensor", button: "Botão",
  setpoint: "Entrada numérica", rectangle: "Retângulo", ellipse: "Elipse",
};
export const bindings: Record<ComponentKind, TagName[]> = {
  silo: [], conveyor: [], feeder: [], mixer: [], crusher: [], oven: [],
  tank: ["TQ001.LEVEL"],
  pump: ["P001.RUNNING"],
  indicator: ["TQ001.TEMPERATURE", "TQ001.LEVEL"],
  text: [],
  valve: ["P001.RUNNING"], motor: ["P001.RUNNING"], sensor: ["TQ001.TEMPERATURE", "TQ001.LEVEL"],
  button: [], setpoint: [], rectangle: [], ellipse: [],
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

function record(input: unknown, keys: string[], optional: string[] = []): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Estrutura de projeto inválida.");
  const object = input as Record<string, unknown>;
  if (
    Object.keys(object).some(key => !keys.includes(key) && !optional.includes(key)) ||
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
  ], ["variables", "connections", "simulation"]);
  if (project.schemaVersion !== 1 && project.schemaVersion !== 2)
    throw new Error("Versão de projeto não suportada.");
  if (project.schemaVersion === 1 && (project.variables !== undefined || project.connections !== undefined || project.simulation !== undefined))
    throw new Error("Tags próprias e ligações exigem projeto versão 2.");
  const variables: ProjectVariable[] = [];
  if (project.schemaVersion === 2) {
    if (!Array.isArray(project.variables) || project.variables.length > 32 || !Array.isArray(project.connections))
      throw new Error("Defina até 32 tags de simulação e uma lista de ligações.");
    for (const raw of project.variables) {
      const v = record(raw, ["name", "dataType", "unit", "initial", "min", "max"]);
      const name = text(v.name, 64);
      if (!/^[A-Z][A-Z0-9_.]{0,63}$/.test(name) || ["TQ001.LEVEL", "P001.RUNNING", "TQ001.TEMPERATURE"].includes(name) || variables.some(tag => tag.name === name))
        throw new Error("Nome de tag inválido, reservado ou repetido. Use letras maiúsculas, números, ponto e sublinhado.");
      const min = number(v.min, -1000000, 1000000), max = number(v.max, -1000000, 1000000);
      if (min >= max || typeof v.unit !== "string" || v.unit.length > 16 || /[\u0000-\u001f]/.test(v.unit)) throw new Error("Faixa ou unidade da tag inválida.");
      if (v.dataType !== "DOUBLE" && v.dataType !== "BOOLEAN") throw new Error("Tipo de tag inválido.");
      if (v.dataType === "BOOLEAN" ? typeof v.initial !== "boolean" : typeof v.initial !== "number" || !Number.isFinite(v.initial) || v.initial < min || v.initial > max)
        throw new Error("Valor inicial fora do tipo ou faixa da tag.");
      variables.push({ name, dataType: v.dataType, unit: v.unit, initial: v.initial as number | boolean, min, max });
    }
  }
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
    ], project.schemaVersion === 2 ? ["color", "rangeMin", "rangeMax"] : []);
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
      !availableBindings(kind, variables).includes(item.binding as string)
    )
      throw new Error("A tag é incompatível com este componente.");
    const appearance: Pick<HmiComponent, "color" | "rangeMin" | "rangeMax"> = {};
    if (item.color !== undefined) {
      if (typeof item.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(item.color)) throw new Error("Cor inválida.");
      appearance.color = item.color;
    }
    if (item.rangeMin !== undefined || item.rangeMax !== undefined) {
      appearance.rangeMin = number(item.rangeMin, -1000000, 1000000);
      appearance.rangeMax = number(item.rangeMax, -1000000, 1000000);
      if (appearance.rangeMin >= appearance.rangeMax) throw new Error("A escala máxima deve ser maior que a mínima.");
    }
    return {
      id,
      kind,
      label: text(item.label, 64),
      x: number(item.x, 0, 1160),
      y: number(item.y, 0, 688),
      width: number(item.width, 40, 500),
      height: number(item.height, 32, 500),
      angle: number(item.angle, -180, 180),
      binding: item.binding as string | null,
      ...appearance,
    };
  });
  const connections: ConnectionLine[] = [];
  if (project.schemaVersion === 2) {
    const rawLines = project.connections as unknown[];
    if (rawLines.length > 100) throw new Error("Limite de 100 ligações por tela.");
    for (const raw of rawLines) {
      const line = record(raw, ["id", "from", "to", "fromPort", "toPort", "kind", "binding"]);
      const id = text(line.id, 80);
      if (!/^[a-zA-Z0-9_-]+$/.test(id) || connections.some(c => c.id === id)) throw new Error("Identificador de ligação inválido ou repetido.");
      if (typeof line.from !== "string" || typeof line.to !== "string" || !ids.has(line.from) || !ids.has(line.to) || line.from === line.to)
        throw new Error("A ligação deve unir dois objetos existentes e distintos.");
      if (typeof line.fromPort !== "string" || typeof line.toPort !== "string" || typeof line.kind !== "string" || !["left", "right", "top", "bottom"].includes(line.fromPort) || !["left", "right", "top", "bottom"].includes(line.toPort) || !["pipe", "signal"].includes(line.kind))
        throw new Error("Porta ou tipo de ligação inválido.");
      if (line.binding !== null && !availableBindings("pump", variables).includes(line.binding as string)) throw new Error("A ligação exige tag booleana.");
      connections.push({ id, from: line.from, to: line.to, fromPort: line.fromPort as Port, toPort: line.toPort as Port, kind: line.kind as ConnectionLine["kind"], binding: line.binding as string | null });
    }
  }
  let simulation: TankRule | undefined;
  if (project.simulation !== undefined) {
    const rule = record(project.simulation, ["levelTag", "enableTag", "fillRate", "drainRate"], ["permitTag", "highLimit", "drainTags", "dryingRecipe", "highHysteresis", "highDelaySeconds"]);
    if (typeof rule.levelTag !== "string" || typeof rule.enableTag !== "string"
      || !variables.some(v => v.name === rule.levelTag && v.dataType === "DOUBLE")
      || !variables.some(v => v.name === rule.enableTag && v.dataType === "BOOLEAN"))
      throw new Error("A regra exige uma tag numérica de nível e uma tag booleana de acionamento.");
    if (rule.permitTag !== undefined && (typeof rule.permitTag !== "string" || !variables.some(v => v.name === rule.permitTag && v.dataType === "BOOLEAN")))
      throw new Error("A permissão de entrada exige uma tag booleana do projeto.");
    const drainTags = rule.drainTags;
    if (drainTags !== undefined && (!Array.isArray(drainTags) || drainTags.length > 32 ||
      drainTags.some(name => !variables.some(v => v.name === name && v.dataType === "BOOLEAN")) ||
      new Set(drainTags).size !== drainTags.length)) throw new Error("A descarga exige tags booleanas distintas do projeto.");
    const measured = variables.find(v => v.name === rule.levelTag)!;
    const limit = rule.highLimit === undefined ? {} : { highLimit: number(rule.highLimit, measured.min, measured.max) };
    const alarmOptions = {
      ...(rule.highHysteresis === undefined ? {} : { highHysteresis: number(rule.highHysteresis, 0, (limit.highLimit ?? measured.max) - measured.min) }),
      ...(rule.highDelaySeconds === undefined ? {} : { highDelaySeconds: number(rule.highDelaySeconds, 0, 3600) }),
    };
    let dryingRecipe: DryingRecipe | undefined;
    if (rule.dryingRecipe !== undefined) {
      const recipe = record(rule.dryingRecipe, ["target", "duration", "moisture", "moistureTarget"], ["capacity"]);
      const duration = number(recipe.duration, 1, 3600);
      if (!Number.isInteger(duration)) throw new Error("O tempo de secagem exige segundos inteiros.");
      dryingRecipe = { ...(recipe.capacity === undefined ? {} : { capacity: number(recipe.capacity, 1, 1000000) }), target: number(recipe.target, 20, 120), duration,
        moisture: number(recipe.moisture, 0, 100), moistureTarget: number(recipe.moistureTarget, 0, 100) };
    }
    simulation = { ...limit, ...alarmOptions, ...(dryingRecipe ? { dryingRecipe } : {}), ...(drainTags?.length ? { drainTags } : {}), ...(typeof rule.permitTag === "string" ? { permitTag: rule.permitTag } : {}), levelTag: rule.levelTag, enableTag: rule.enableTag,
      fillRate: number(rule.fillRate, 0, 1000), drainRate: number(rule.drainRate, 0, 1000) };
  }
  return {
    schemaVersion: project.schemaVersion,
    name: text(project.name, 80),
    screen: { width: 1200, height: 720 },
    components,
    ...(project.schemaVersion === 2 ? { variables, connections } : {}),
    ...(simulation ? { simulation } : {}),
  };
}
export function replaceVariable(project: HmiProject, previousName: string, variable: ProjectVariable): HmiProject {
  if (!project.variables?.some(v => v.name === previousName)) throw new Error("A tag não existe mais. Selecione-a novamente.");
  return parseProject(JSON.stringify({ ...project,
    variables: project.variables.map(v => v.name === previousName ? variable : v),
    components: project.components.map(c => c.binding === previousName ? { ...c, binding: variable.name } : c),
    connections: project.connections?.map(c => c.binding === previousName ? { ...c, binding: variable.name } : c),
    ...(project.simulation ? { simulation: { ...project.simulation,
      levelTag: project.simulation.levelTag === previousName ? variable.name : project.simulation.levelTag,
      ...(project.simulation.drainTags ? { drainTags: project.simulation.drainTags.map(name => name === previousName ? variable.name : name) } : {}),
      ...(project.simulation.permitTag === previousName ? { permitTag: variable.name } : {}),
      enableTag: project.simulation.enableTag === previousName ? variable.name : project.simulation.enableTag } } : {}),
  }));
}
export function availableBindings(kind: ComponentKind, variables: ProjectVariable[] = []): string[] {
  const numeric = ["tank", "silo", "indicator", "sensor", "setpoint"].includes(kind);
  const boolean = ["pump", "valve", "motor", "conveyor", "feeder", "mixer", "crusher", "oven", "button", "rectangle", "ellipse"].includes(kind);
  return [...bindings[kind], ...variables.filter(tag => numeric ? tag.dataType === "DOUBLE" : boolean && tag.dataType === "BOOLEAN").map(tag => tag.name)];
}
export function removeComponents(project: HmiProject, ids: string[]): HmiProject {
  return { ...project, components: project.components.filter(item => !ids.includes(item.id)),
    ...(project.connections ? { connections: project.connections.filter(line => !ids.includes(line.from) && !ids.includes(line.to)) } : {}) };
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
