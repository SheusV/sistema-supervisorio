export interface Batch {
  phase: "loading" | "running" | "finished";
  mass: number;
  temperature: number;
  target: number;
  duration: number;
  elapsed: number;
}

export const emptyBatch: Batch = {
  phase: "loading", mass: 0, temperature: 20, target: 60, duration: 30, elapsed: 0,
};

// One confirmed simulator second per tick. Only time actually spent at target counts.
export function advanceBatch(batch: Batch, discharged: number, powered: boolean, seconds: number): Batch {
  if (batch.phase === "loading") return { ...batch, mass: batch.mass + discharged };
  if (batch.phase !== "running" || seconds === 0) return batch;
  if (!powered) return { ...batch, temperature: Math.max(20, batch.temperature - seconds) };
  const warmup = (batch.target - batch.temperature) / 5;
  const temperature = Math.min(batch.target, batch.temperature + 5 * seconds);
  const elapsed = Math.min(batch.duration, batch.elapsed + Math.max(0, seconds - warmup));
  return { ...batch, temperature, elapsed, phase: elapsed >= batch.duration ? "finished" : "running" };
}
