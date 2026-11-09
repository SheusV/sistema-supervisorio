export interface DryingRecipe {
  capacity?: number;
  target: number;
  duration: number;
  moisture: number;
  moistureTarget: number;
}
export interface Batch {
  capacity: number;
  id?: string;
  started?: number;
  finishedAt?: number;
  initialMoisture?: number;
  samples?: { at: number; temperature: number | null; moisture: number | null }[];
  phase: "loading" | "running" | "finished";
  mass: number;
  temperature: number;
  target: number;
  duration: number;
  elapsed: number;
  moisture: number;
  moistureTarget: number;
}

export const emptyBatch: Batch = {
  capacity: 1000,
  phase: "loading", mass: 0, temperature: 20, target: 60, duration: 30, elapsed: 0,
  moisture: 22, moistureTarget: 14,
};

export function newBatch(recipe?: DryingRecipe): Batch {
  return { ...emptyBatch, ...recipe };
}

export function batchDischargeRate(batch: Batch, rate: number, seconds: number): number {
  if (batch.phase !== "loading") return 0;
  const remaining = Math.max(0, batch.capacity - batch.mass);
  if (remaining === 0) return 0;
  return seconds > 0 ? Math.min(rate, remaining / seconds) : rate;
}

export function sampleBatch(batch: Batch, at: number, available = true): Batch {
  if (batch.phase === "loading") return batch;
  const samples = batch.samples ?? [];
  if (!available && samples.at(-1)?.temperature === null) return batch;
  return { ...batch, samples: [...samples.slice(-599), {
    at, temperature: available ? batch.temperature : null, moisture: available ? batch.moisture : null,
  }] };
}

// One confirmed simulator second per tick. Only time actually spent at target counts.
export function advanceBatch(batch: Batch, discharged: number, powered: boolean, seconds: number): Batch {
  if (batch.phase === "loading") return { ...batch, mass: batch.mass + discharged };
  if (batch.phase !== "running" || seconds === 0) return batch;
  if (!powered) return { ...batch, temperature: Math.max(20, batch.temperature - seconds) };
  const warmup = (batch.target - batch.temperature) / 5;
  const temperature = Math.min(batch.target, batch.temperature + 5 * seconds);
  const dryingSeconds = Math.max(0, seconds - warmup);
  const elapsed = Math.min(batch.duration, batch.elapsed + dryingSeconds);
  // Demonstration model: remove 0.25 percentage points per simulated second at target.
  const moisture = Math.max(0, batch.moisture - 0.25 * dryingSeconds);
  const finished = elapsed >= batch.duration && moisture <= batch.moistureTarget;
  return { ...batch, temperature, elapsed, moisture, phase: finished ? "finished" : "running" };
}
