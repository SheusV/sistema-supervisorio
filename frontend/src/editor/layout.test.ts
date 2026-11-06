import { describe, expect, it } from "vitest";
import { arrange, bounds, moveTogether } from "./layout";
import { createComponent, parseProject, projectReducer, serializeProject, type HmiProject } from "./project";

function fixture(): HmiProject {
  return { schemaVersion: 1, name: "Layout", screen: { width: 1200, height: 720 }, components: [
    { ...createComponent("pump", 0), id: "a", x: 100, y: 100, width: 80, height: 60 },
    { ...createComponent("tank", 0), id: "b", x: 330, y: 200, width: 120, height: 80 },
    { ...createComponent("indicator", 0), id: "c", x: 700, y: 400, width: 60, height: 40 },
  ] };
}
describe("selection layout", () => {
  it("aligns rotated boxes without changing bindings, size or order", () => {
    const project = fixture(); project.components[1].angle = 90;
    const result = arrange(project, ["a", "b"], "left");
    expect(bounds(result.components[0]).left).toBeCloseTo(bounds(result.components[1]).left);
    expect(result.components[1]).toMatchObject({ width: 120, height: 80, angle: 90, binding: "TQ001.LEVEL" });
    expect(result.components[2]).toEqual(project.components[2]);
    expect(project.components[1].x).toBe(330);
  });
  it.each(["right", "top", "bottom", "centerX", "centerY"] as const)("aligns %s", action => {
    const result = arrange(fixture(), ["a", "b", "c"], action);
    const values = result.components.map(item => {
      const b = bounds(item);
      return action === "centerX" ? (b.left + b.right) / 2 : action === "centerY" ? (b.top + b.bottom) / 2 : b[action];
    });
    expect(values[0]).toBeCloseTo(values[1]); expect(values[1]).toBeCloseTo(values[2]);
  });
  it.each(["spaceX", "spaceY"] as const)("distributes equal gaps for different dimensions: %s", action => {
    const result = arrange(fixture(), ["c", "a", "b"], action);
    const [a, b, c] = result.components.map(bounds);
    expect(action === "spaceX" ? b.left - a.right : b.top - a.bottom)
      .toBeCloseTo(action === "spaceX" ? c.left - b.right : c.top - b.bottom, 2);
    expect(result.components[0]).toEqual(fixture().components[0]);
    expect(result.components[2]).toEqual(fixture().components[2]);
  });
  it("rejects insufficient space and invalid positions atomically", () => {
    const project = fixture(); project.components.forEach(item => { item.x = 0; item.y = 0; });
    expect(() => arrange(project, ["a", "b", "c"], "spaceX")).toThrow("espaço suficiente");
    project.components[1].angle = 90;
    expect(() => arrange(project, ["a", "b"], "left")).toThrow("limites");
    expect(project.components[0].x).toBe(0);
  });
  it("clamps movement as a unit and preserves geometry and export", () => {
    const project = fixture(); project.components[1].angle = 35;
    const result = moveTogether(project, ["a", "b"], -200, 900);
    expect(result.components[0]).toMatchObject({ x: 0, y: 588 });
    expect(result.components[1]).toMatchObject({ x: 230, y: 688, angle: 35 });
    expect(result.components[2]).toEqual(project.components[2]);
    expect(parseProject(serializeProject(result))).toEqual(result);
  });
  it("undoes a whole alignment in one revision and ignores small selections", () => {
    const project = fixture();
    expect(arrange(project, ["a"], "left")).toBe(project);
    expect(arrange(project, ["a", "b"], "spaceX")).toBe(project);
    const changed = projectReducer({ past: [], present: project, future: [] }, { type: "change", project: arrange(project, ["a", "b"], "left") });
    expect(changed.past).toHaveLength(1);
    expect(projectReducer(changed, { type: "undo" }).present).toEqual(project);
  });
});
