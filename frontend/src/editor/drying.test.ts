import { expect, it } from "vitest";
import { advanceBatch, batchDischargeRate, emptyBatch, sampleBatch, type Batch } from "./drying";

it("counts only time at target, including after an interruption", () => {
  let batch: Batch = { ...emptyBatch, phase: "running", mass: 60, target: 27, duration: 2, moistureTarget: 22 };
  batch = advanceBatch(batch, 0, true, 1);
  expect([batch.temperature, batch.elapsed]).toEqual([25, 0]);
  expect(batch.moisture).toBe(22);
  batch = advanceBatch(batch, 0, true, 1);
  expect(batch.elapsed).toBeCloseTo(0.6);
  batch = advanceBatch(batch, 0, false, 1);
  expect(batch.temperature).toBe(26);
  expect(batch.moisture).toBeCloseTo(21.85);
  expect(batch.phase).toBe("running");
  expect(batch.elapsed).toBeCloseTo(0.6);
  batch = advanceBatch(batch, 0, true, 1);
  expect(batch.elapsed).toBeCloseTo(1.4);
  batch = advanceBatch(batch, 0, true, 1);
  expect(batch).toMatchObject({ phase: "finished", mass: 60, elapsed: 2 });
  expect(advanceBatch(batch, 0, true, 1)).toEqual(batch);
});

it("continues drying after minimum time and finishes at the moisture limit", () => {
  let batch: Batch = { ...emptyBatch, phase: "running", mass: 60, temperature: 60, duration: 1, moistureTarget: 21.5 };
  batch = advanceBatch(batch, 0, true, 1);
  expect(batch).toMatchObject({ phase: "running", elapsed: 1, moisture: 21.75 });
  expect(advanceBatch(batch, 0, false, 1).moisture).toBe(21.75);
  expect(advanceBatch(batch, 0, true, 1)).toMatchObject({ phase: "finished", moisture: 21.5 });
});

it("retains a communication gap in the bounded batch curve", () => {
  let batch: Batch = { ...emptyBatch, phase: "running" };
  for (let at = 0; at < 610; at++) batch = sampleBatch(batch, at);
  expect(batch.samples).toHaveLength(600);
  batch = sampleBatch(batch, 610, false);
  expect(sampleBatch(batch, 611, false)).toBe(batch);
  batch = sampleBatch(batch, 612);
  expect(batch.samples?.slice(-2)).toEqual([
    { at: 610, temperature: null, moisture: null },
    { at: 612, temperature: 20, moisture: 22 },
  ]);
  expect(batch.samples).toHaveLength(600);
});

it("limits transfer before the silo is drained and reopens after a fresh batch", () => {
  let batch = { ...emptyBatch, capacity: 45 };
  batch = advanceBatch(batch, batchDischargeRate(batch, 30, 1), true, 1);
  expect(batch.mass).toBe(30);
  const lastTransfer = batchDischargeRate(batch, 30, 1);
  expect(lastTransfer).toBe(15);
  batch = advanceBatch(batch, lastTransfer, true, 1);
  expect(batch.mass).toBe(45);
  expect(batchDischargeRate(batch, 30, 1)).toBe(0);
  expect(batchDischargeRate({ ...batch, phase: "running" }, 30, 1)).toBe(0);
  expect(batchDischargeRate({ ...emptyBatch, capacity: 45 }, 30, 1)).toBe(30);
});
