export interface Sample {
  at: number;
  value: number | null;
}
export const eventKinds = ["Ativação", "Reconhecimento", "Retorno ao normal", "Comunicação perdida", "Comunicação restabelecida"] as const;
export type EventKind = typeof eventKinds[number];
export interface AlarmEvent { at: number; kind: EventKind; value: number | null }
export interface Run {
  samples: Sample[];
  events: AlarmEvent[];
  high: boolean;
  acknowledged: boolean;
}
export const emptyRun: Run = { samples: [], events: [], high: false, acknowledged: false };
const sampleLimit = 600;
const eventLimit = 100;

export function observe(run: Run, sample: Sample, limit?: number): Run {
  const previous = run.samples.at(-1);
  if (sample.value === null && (!previous || previous.value === null)) return run;
  const events = [...run.events];
  if (sample.value === null) events.push({ ...sample, kind: "Comunicação perdida" });
  else if (previous?.value === null) events.push({ ...sample, kind: "Comunicação restabelecida" });
  const high = sample.value === null ? run.high : limit !== undefined && sample.value >= limit;
  if (high !== run.high) events.push({ ...sample, kind: high ? "Ativação" : "Retorno ao normal" });
  return {
    samples: [...run.samples.slice(1 - sampleLimit), sample],
    events: events.slice(-eventLimit),
    high, acknowledged: high && run.high && run.acknowledged,
  };
}

export function acknowledge(run: Run, at: number): Run {
  const value = run.samples.at(-1)?.value;
  if (value == null || !run.high || run.acknowledged) return run;
  const event: AlarmEvent = { at, kind: "Reconhecimento", value };
  return { ...run, acknowledged: true, events: [...run.events, event].slice(-eventLimit) };
}
