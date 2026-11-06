import { describe, expect, it } from "vitest";
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  exampleProject,
  parseProject,
  projectReducer,
  serializeProject,
  type ProjectHistory,
} from "./project";

describe("project files", () => {
  it('opens the distributed water-tank example', () => {
    const project = parseProject(readFileSync(resolve(process.cwd(), '../examples/water-tank/project.json'), 'utf8'));
    expect(project.components).toHaveLength(4);
    expect(project.components[1].binding).toBe('TQ001.LEVEL');
  });
  it("round trips geometry, layer order, labels and tag bindings", () => {
    const project = exampleProject();
    Object.assign(project.components[1], {
      x: 320,
      y: 180,
      angle: 45,
      width: 210,
    });
    expect(parseProject(serializeProject(project))).toEqual(project);
  });
  it.each([
    ["unsupported version", (p: any) => (p.schemaVersion = 99)],
    [
      "remote assets",
      (p: any) => (p.components[0].src = "https://example.com/image.svg"),
    ],
    ["scripts", (p: any) => (p.components[0].script = "alert(1)")],
    [
      "prototype injection",
      (p: any) =>
        Object.defineProperty(p, "__proto__", { value: {}, enumerable: true }),
    ],
    ["unexpected widget", (p: any) => (p.components[0].kind = "image")],
    [
      "incompatible tag",
      (p: any) => (p.components[1].binding = "P001.RUNNING"),
    ],
    ["negative dimension", (p: any) => (p.components[1].width = -1)],
    ["duplicate id", (p: any) => (p.components[1].id = p.components[0].id)],
    [
      "too many objects",
      (p: any) => (p.components = Array(101).fill(p.components[0])),
    ],
  ])("rejects %s", (_name, mutate) => {
    const project = exampleProject();
    mutate(project);
    expect(() => parseProject(JSON.stringify(project))).toThrow();
  });
  it("rejects malformed, oversized and missing data", () => {
    for (const input of ["null", "[]", "{", "{}", " ".repeat(262145)])
      expect(() => parseProject(input)).toThrow();
  });
  it("treats markup as plain text and preserves it without executing", () => {
    const project = exampleProject();
    project.components[0].label = "<script>alert(1)</script>";
    expect(parseProject(serializeProject(project)).components[0].label).toBe(
      "<script>alert(1)</script>",
    );
  });
});
describe("editing history", () => {
  it("undoes imports, redoes changes, and clears redo after a new edit", () => {
    const initial: ProjectHistory = {
      past: [],
      present: exampleProject(),
      future: [],
    };
    const changed = projectReducer(initial, {
      type: "change",
      project: { ...initial.present, name: "Tela 02" },
    });
    const undone = projectReducer(changed, { type: "undo" });
    expect(undone.present).toEqual(initial.present);
    expect(projectReducer(undone, { type: "redo" }).present.name).toBe(
      "Tela 02",
    );
    const branched = projectReducer(undone, {
      type: "change",
      project: { ...initial.present, name: "Tela 03" },
    });
    expect(branched.future).toHaveLength(0);
  });
  it("limits history to 60 revisions and ignores identical changes", () => {
    let state: ProjectHistory = {
      past: [],
      present: exampleProject(),
      future: [],
    };
    expect(
      projectReducer(state, { type: "change", project: state.present }),
    ).toBe(state);
    for (let index = 0; index < 70; index++)
      state = projectReducer(state, {
        type: "change",
        project: { ...state.present, name: `Tela ${index}` },
      });
    expect(state.past).toHaveLength(60);
  });
});
