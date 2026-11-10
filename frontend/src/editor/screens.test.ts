import { expect, it } from "vitest";
import { addProjectScreen, deleteProjectScreen, operationFingerprint, parseProject, projectComponents,
  projectReducer, projectScreens, renameProjectScreen, replaceVariable, serializeProject, switchProjectScreen } from "./project";
import { dosingExample, multiScreenExample } from "./processExample";

it("adds, duplicates, renames and deletes screens while preserving JSON and undo", () => {
  const original = dosingExample();
  const duplicated = addProjectScreen(original, "Detalhe", true);
  expect(duplicated.components).toEqual(original.components);
  expect(projectScreens(duplicated)).toHaveLength(2);
  const renamed = renameProjectScreen(duplicated, "Forno");
  expect(parseProject(serializeProject(renamed))).toEqual(renamed);
  const history = projectReducer({ past: [], present: original, future: [] }, { type: "change", project: renamed });
  expect(projectReducer(history, { type: "undo" }).present).toEqual(original);
  expect(deleteProjectScreen(renamed).components).toEqual(original.components);
});

it("navigation keeps the operation fingerprint, physical source and edit history", () => {
  const original = multiScreenExample();
  const other = switchProjectScreen(original, "receiving");
  expect(other.variables).toBe(original.variables);
  expect(other.alarmRules).toBe(original.alarmRules);
  expect(other.simulation).toBe(original.simulation);
  expect(other.components.some(c => c.kind === "oven")).toBe(false);
  expect(projectComponents(other).find(c => c.kind === "oven")?.binding).toBe("FORNO.RUN");
  expect(operationFingerprint(other)).toBe(operationFingerprint(original));
  const h = { past: [dosingExample()], present: original, future: [] };
  const navigated = projectReducer(h, { type: "navigate", screenId: "receiving" });
  expect(navigated.past).toBe(h.past);
  expect(navigated.future).toBe(h.future);
  expect(projectReducer(navigated, { type: "undo" }).present).toEqual(h.past[0]);
});

it("renames a shared tag in components, connections and alarms on every screen", () => {
  const project = multiScreenExample();
  const variable = project.variables!.find(v => v.name === "ESTEIRA.RUN")!;
  const renamed = replaceVariable(project, variable.name, { ...variable, name: "ET01.RUN" });
  expect(projectScreens(renamed).flatMap(s => s.components).filter(c => c.id === "belt").every(c => c.binding === "ET01.RUN")).toBe(true);
  expect(projectScreens(renamed).flatMap(s => s.connections).filter(c => c.id === "belt-bin").every(c => c.binding === "ET01.RUN")).toBe(true);
  expect(serializeProject(renamed)).not.toContain('"ESTEIRA.RUN"');
});

it("rejects duplicate names, unsafe inactive screens and excessive screen counts", () => {
  const project = multiScreenExample();
  expect(() => renameProjectScreen(project, "Secagem")).toThrow();
  expect(() => deleteProjectScreen(dosingExample())).toThrow();
  expect(() => switchProjectScreen(project, "missing")).toThrow();
  const bad = structuredClone(project);
  (bad.additionalScreens![0].components[0] as any).script = "anything";
  expect(() => parseProject(JSON.stringify(bad))).toThrow();
  expect(() => parseProject(JSON.stringify({ ...project, additionalScreens: Array(16).fill(project.additionalScreens![0]) }))).toThrow();
});
