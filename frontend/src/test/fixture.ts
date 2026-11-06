import type { Snapshot } from "../tags/model";
export function frame(sequence = 1, level = 42): Snapshot {
  const base = {
    quality: "GOOD",
    source: "SIMULATED",
    writable: false,
    sourceTimestamp: "2026-01-01T00:00:00Z",
    serverTimestamp: "2026-01-01T00:00:00Z",
  } as const;
  return {
    schemaVersion: 1,
    sequence,
    tags: [
      {
        ...base,
        name: "TQ001.LEVEL",
        dataType: "DOUBLE",
        value: level,
        unit: "%",
      },
      {
        ...base,
        name: "P001.RUNNING",
        dataType: "BOOLEAN",
        value: true,
        unit: "",
      },
      {
        ...base,
        name: "TQ001.TEMPERATURE",
        dataType: "DOUBLE",
        value: 25,
        unit: "°C",
      },
    ],
  };
}
