import { expect, it } from "vitest";
import { advanceBatch, emptyBatch, type Batch } from "./drying";

it("counts only time at target, including after an interruption", () => {
  let batch: Batch = { ...emptyBatch, phase: "running", mass: 60, target: 27, duration: 2 };
  batch = advanceBatch(batch, 0, true, 1);
  expect([batch.temperature, batch.elapsed]).toEqual([25, 0]);
  batch = advanceBatch(batch, 0, true, 1);
  expect(batch.elapsed).toBeCloseTo(0.6);
  batch = advanceBatch(batch, 0, false, 1);
  expect(batch.temperature).toBe(26);
  expect(batch.elapsed).toBeCloseTo(0.6);
  batch = advanceBatch(batch, 0, true, 1);
  expect(batch.elapsed).toBeCloseTo(1.4);
  batch = advanceBatch(batch, 0, true, 1);
  expect(batch).toMatchObject({ phase: "finished", mass: 60, elapsed: 2 });
  expect(advanceBatch(batch, 0, true, 1)).toEqual(batch);
});
