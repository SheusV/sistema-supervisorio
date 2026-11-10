import { expect, it } from "vitest";
import { parseCheckpoint, type OperationCheckpoint } from "./operationCheckpoint";
import { dosingExample } from "./processExample";
import { serializeProject } from "./project";
import { newBatch } from "./drying";

const project = dosingExample();
const scope = JSON.stringify([project.name, "FORNO.RUN"]);
const point: OperationCheckpoint = {
  schemaVersion: 1,
  scope, revision: "revision", fingerprint: serializeProject(project), savedAt: 1,
  values: Object.fromEntries(project.variables!.filter(v => !v.source).map(v => [v.name, v.initial])),
  batch: { ...newBatch(), phase: "running", id: "batch", started: 1, initialMoisture: 24, mass: 60,
    temperature: 25, target: 25, duration: 6, elapsed: 1, moisture: 23.75, moistureTarget: 23 },
};
it("accepts a valid operation snapshot without advancing its simulated time", () => {
  expect(parseCheckpoint(point, project, scope)).toEqual(point);
});
it.each([
  { fingerprint: "old-configuration" },
  { values: { ...point.values, "SILO.MASSA": 1001 } },
  { values: { ...point.values, "FORNO.TEMPERATURA": 25 } },
  { values: { ...point.values, "FORNO.RUN": "true" } },
  { batch: { ...point.batch, mass: 1001 } },
  { batch: { ...point.batch, capacity: 2000 } },
  { batch: { ...point.batch, elapsed: 7 } },
  { batch: { ...point.batch, temperature: 30 } },
  { batch: { ...point.batch, phase: "loading", elapsed: 1 } },
  { batch: { ...point.batch, phase: "finished", finishedAt: 2 } },
  { batch: { ...point.batch, samples: [{ at: 1, temperature: 999, moisture: 20 }] } },
])("rejects incompatible or corrupted recovery data", change => {
  expect(() => parseCheckpoint({ ...point, ...change }, project, scope)).toThrow();
});
