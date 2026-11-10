import { expect, it } from "vitest";
import { addOvenTags, ovenValues } from "./ovenTags";
import { emptyBatch } from "./drying";
import { availableBindings, parseProject, replaceVariable, serializeProject } from "./project";
import { dosingExample } from "./processExample";

it("keeps calculated tags in JSON, follows renames and excludes them from command bindings", () => {
  const project = dosingExample();
  expect(parseProject(serializeProject(project))).toEqual(project);
  const original = project.variables!.find(v => v.source === "temperature")!;
  const renamed = replaceVariable(project, original.name, { ...original, name: "FR01.TEMP" });
  expect(ovenValues(renamed.variables!, { ...emptyBatch, temperature: 45 }, true)["FR01.TEMP"]).toBe(45);
  expect(renamed.alarmRules!.find(r => r.id === "oven-hot")!.tag).toBe("FR01.TEMP");
  expect(availableBindings("setpoint", project.variables)).not.toContain("FORNO.TEMPERATURA");
  expect(availableBindings("button", project.variables)).not.toContain("FORNO.LOTE_SECO");
});

it("makes moisture unavailable without grains and reflects batch completion and reset", () => {
  const variables = dosingExample().variables!;
  expect(ovenValues(variables, emptyBatch, true)["FORNO.UMIDADE"]).toBeUndefined();
  expect(ovenValues(variables, emptyBatch, false)).toEqual({});
  expect(ovenValues(variables, { ...emptyBatch, phase: "finished", mass: 45, moisture: 14, elapsed: 30 }, true))
    .toMatchObject({ "FORNO.MASSA": 45, "FORNO.LOTE_SECO": true, "FORNO.UMIDADE": 14, "FORNO.TEMPO": 30 });
  expect(ovenValues(variables, emptyBatch, true)["FORNO.LOTE_SECO"]).toBe(false);
});

it("adds missing measurements once and rejects duplicates or manipulated definitions", () => {
  const project = dosingExample();
  expect(addOvenTags(project)).toEqual(project);
  for (const invalid of [
    { ...project, variables: [...project.variables!, { ...project.variables!.find(v => v.source === "temperature")!, name: "OUTRA.TEMP" }] },
    { ...project, variables: project.variables!.map(v => v.source === "temperature" ? { ...v, max: 999 } : v) },
    { ...project, variables: project.variables!.map(v => v.source === "temperature" ? { ...v, unit: "°F" } : v) },
    { ...project, simulation: { ...project.simulation!, enableTag: "FORNO.LOTE_SECO" } },
  ]) expect(() => serializeProject(invalid)).toThrow();
});

it("keeps the calculated mass unit consistent with the configured process measurement", () => {
  const project = dosingExample();
  const variable = project.variables!.find(v => v.name === "SILO.MASSA")!;
  const next = replaceVariable(project, variable.name, { ...variable, unit: "t" });
  expect(next.variables!.find(v => v.source === "mass")!.unit).toBe("t");
});
