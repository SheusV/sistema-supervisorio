import type { Batch } from "./drying";
import type { HmiProject, ProjectVariable } from "./project";

export const ovenMeasurements = {
  temperature: { name: "FORNO.TEMPERATURA", dataType: "DOUBLE", unit: "°C", initial: 20, min: 0, max: 120 },
  moisture: { name: "FORNO.UMIDADE", dataType: "DOUBLE", unit: "%", initial: 22, min: 0, max: 100 },
  mass: { name: "FORNO.MASSA", dataType: "DOUBLE", unit: "kg", initial: 0, min: 0, max: 1000000 },
  elapsed: { name: "FORNO.TEMPO", dataType: "DOUBLE", unit: "s", initial: 0, min: 0, max: 3600 },
  finished: { name: "FORNO.LOTE_SECO", dataType: "BOOLEAN", unit: "", initial: false, min: 0, max: 1 },
} as const;
export type OvenSource = keyof typeof ovenMeasurements;
export const ovenVariables: ProjectVariable[] = Object.entries(ovenMeasurements).map(([source, definition]) =>
  ({ ...definition, source: source as OvenSource }));

export function addOvenTags(project: HmiProject): HmiProject {
  const existing = project.variables ?? [];
  const unit = existing.find(v => v.name === project.simulation?.levelTag)?.unit ?? "kg";
  const missing = ovenVariables.filter(v => !existing.some(item => item.source === v.source))
    .map(v => ({ ...v, unit: v.source === "mass" ? unit : v.unit }));
  if (existing.length + missing.length > 32 || missing.some(v => existing.some(item => item.name === v.name)))
    throw new Error("Reserve nomes livres e espaço nas 32 tags para adicionar as medições do forno.");
  return { ...project, variables: [...existing, ...missing] };
}

export function ovenValues(variables: ProjectVariable[], batch: Batch, available: boolean): Record<string, number | boolean> {
  if (!available) return {};
  const readings = {
    temperature: batch.temperature, moisture: batch.moisture, mass: batch.mass,
    elapsed: batch.elapsed, finished: batch.phase === "finished",
  };
  return Object.fromEntries(variables.filter(v => v.source && (v.source !== "moisture" || batch.mass > 0))
    .map(v => [v.name, readings[v.source!]]));
}
