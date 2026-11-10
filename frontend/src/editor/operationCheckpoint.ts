import { newBatch, type Batch } from "./drying";
import { operationFingerprint, projectComponents, type HmiProject } from "./project";

export interface OperationCheckpoint {
  schemaVersion: 1;
  scope: string;
  revision: string;
  fingerprint: string;
  savedAt: number;
  values: Record<string, number | boolean>;
  batch: Batch;
}

const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

export function parseCheckpoint(raw: unknown, project: HmiProject, scope: string): OperationCheckpoint {
  const fail = () => { throw new Error("O ponto salvo é incompatível com este projeto ou contém dados inválidos."); };
  if (!raw || typeof raw !== "object" || JSON.stringify(raw).length > 1048576) return fail();
  const point = raw as OperationCheckpoint;
  if (point.schemaVersion !== 1 || Object.keys(point).some(key => !["schemaVersion", "scope", "revision", "fingerprint", "savedAt", "values", "batch"].includes(key))
    || point.scope !== scope || point.fingerprint !== operationFingerprint(project)
    || typeof point.revision !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(point.revision)
    || !finite(point.savedAt, 0, Number.MAX_SAFE_INTEGER)
    || !point.values || typeof point.values !== "object" || Array.isArray(point.values)) return fail();
  const variables = (project.variables ?? []).filter(v => !v.source);
  if (Object.keys(point.values).length !== variables.length || variables.some(v =>
    !Object.hasOwn(point.values, v.name) || (v.dataType === "BOOLEAN"
      ? typeof point.values[v.name] !== "boolean" : !finite(point.values[v.name], v.min, v.max)))) return fail();
  const b = point.batch;
  if (!b || typeof b !== "object" || Array.isArray(b) || !["loading", "running", "finished"].includes(b.phase)
    || Object.keys(b).some(key => !["capacity", "id", "started", "finishedAt", "initialMoisture", "samples", "phase", "mass", "temperature", "target", "duration", "elapsed", "moisture", "moistureTarget"].includes(key))
    || b.capacity !== newBatch(project.simulation?.dryingRecipe).capacity
    || !finite(b.mass, 0, b.capacity) || !finite(b.temperature, 20, 120)
    || !finite(b.target, 20, 120) || !finite(b.duration, 1, 3600) || !Number.isInteger(b.duration)
    || !finite(b.elapsed, 0, b.duration) || !finite(b.moisture, 0, 100) || !finite(b.moistureTarget, 0, 100)) return fail();
  if (b.temperature > b.target || (b.phase === "loading" && (b.elapsed !== 0 || b.temperature !== 20
    || b.id !== undefined || b.started !== undefined || b.finishedAt !== undefined
    || b.initialMoisture !== undefined || b.samples !== undefined))) return fail();
  if ((b.mass > 0 || b.phase !== "loading") && !projectComponents(project).some(c =>
    c.kind === "oven" && c.binding && project.simulation?.drainTags?.includes(c.binding))) return fail();
  if (b.phase !== "loading" && (b.mass <= 0 || typeof b.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(b.id)
    || !finite(b.started, 0, Number.MAX_SAFE_INTEGER) || !finite(b.initialMoisture, 0, 100))) return fail();
  if (b.phase === "finished" && (!finite(b.finishedAt, 0, Number.MAX_SAFE_INTEGER)
    || b.elapsed !== b.duration || b.moisture > b.moistureTarget)) return fail();
  if (b.samples !== undefined && (!Array.isArray(b.samples) || b.samples.length > 600 || b.samples.some(s =>
    !s || !finite(s.at, 0, Number.MAX_SAFE_INTEGER) ||
    !((s.temperature === null && s.moisture === null) || (finite(s.temperature, 20, 120) && finite(s.moisture, 0, 100)))))) return fail();
  return point;
}
