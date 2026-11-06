import { describe, expect, it } from "vitest";
import { availableBindings, parseProject, removeComponents, serializeProject } from "./project";
import { processExample } from "./processExample";

describe("process projects", () => {
  it("round trips variables, connections, colors and numeric scales", () => {
    const project = processExample();
    Object.assign(project.components[3], { color: "#aabbcc", rangeMin: -20, rangeMax: 150 });
    expect(parseProject(serializeProject(project))).toEqual(project);
  });
  it.each([
    ["dangling connection", (p: any) => p.connections[0].to = "missing"],
    ["self connection", (p: any) => p.connections[0].to = p.connections[0].from],
    ["wrong line type", (p: any) => p.connections[0].kind = "script"],
    ["coerced port", (p: any) => p.connections[0].fromPort = ["left"]],
    ["numeric flow state", (p: any) => p.connections[0].binding = "TANQUE.NIVEL"],
    ["unknown binding", (p: any) => p.components[0].binding = "MISSING"],
    ["reserved tag", (p: any) => p.variables[0].name = "P001.RUNNING"],
    ["prototype tag", (p: any) => p.variables[0].name = "__proto__"],
    ["repeated tag", (p: any) => p.variables.push(p.variables[0])],
    ["too many tags", (p: any) => p.variables = Array(33).fill(p.variables[0])],
    ["invalid range", (p: any) => p.variables[1].max = -1],
    ["wrong initial type", (p: any) => p.variables[0].initial = "false"],
    ["invalid color", (p: any) => p.components[0].color = "url(https://example.com)"],
    ["unknown property", (p: any) => p.components[0].action = "eval"],
    ["zero scale", (p: any) => { p.components[3].rangeMin = 1; p.components[3].rangeMax = 1; }],
  ])("rejects %s atomically", (_name, mutate) => {
    const project = processExample(); mutate(project);
    expect(() => parseProject(JSON.stringify(project))).toThrow();
  });
  it("only allows typed bindings and writable custom tags for controls", () => {
    const variables = processExample().variables;
    expect(availableBindings("button", variables)).toEqual(["LINHA.HABILITADA"]);
    expect(availableBindings("setpoint", variables)).toEqual(["TANQUE.NIVEL", "TEMP.VALOR"]);
    expect(availableBindings("tank", variables)).not.toContain("LINHA.HABILITADA");
  });
  it("removes dependent lines when deleting equipment and preserves other links", () => {
    const project = processExample();
    const next = removeComponents(project, ["valve"]);
    expect(next.connections?.map(line => line.id)).toEqual(["signal1", "signal2"]);
    expect(project.connections).toHaveLength(4);
    expect(parseProject(serializeProject(next))).toEqual(next);
  });
});
