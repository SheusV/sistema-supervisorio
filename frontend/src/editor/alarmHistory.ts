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
  pendingSince?: number;
}
export const emptyRun: Run = { samples: [], events: [], high: false, acknowledged: false };
const sampleLimit = 600;
const eventLimit = 100;

export function observe(run: Run, sample: Sample, limit?: number, hysteresis = 0, delaySeconds = 0): Run {
  const previous = run.samples.at(-1);
  if (sample.value === null && (!previous || previous.value === null)) return run;
  const events = [...run.events];
  if (sample.value === null) events.push({ ...sample, kind: "Comunicação perdida" });
  else if (previous?.value === null) events.push({ ...sample, kind: "Comunicação restabelecida" });
  let high = run.high;
  let pendingSince: number | undefined;
  if (sample.value !== null) {
    if (limit === undefined) high = false;
    else if (run.high) {
      high = hysteresis > 0 ? sample.value > limit - hysteresis : sample.value >= limit;
    } else if (sample.value >= limit) {
      pendingSince = run.pendingSince ?? sample.at;
      high = sample.at - pendingSince >= delaySeconds * 1000;
      if (high) pendingSince = undefined;
    }
  }
  if (high !== run.high) events.push({ ...sample, kind: high ? "Ativação" : "Retorno ao normal" });
  return {
    samples: [...run.samples.slice(1 - sampleLimit), sample],
    events: events.slice(-eventLimit),
    high, pendingSince, acknowledged: high && run.high && run.acknowledged,
  };
}

export function acknowledge(run: Run, at: number): Run {
  const value = run.samples.at(-1)?.value;
  if (value == null || !run.high || run.acknowledged) return run;
  const event: AlarmEvent = { at, kind: "Reconhecimento", value };
  return { ...run, acknowledged: true, events: [...run.events, event].slice(-eventLimit) };
}
