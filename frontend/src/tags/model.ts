export type TagName = "TQ001.LEVEL" | "P001.RUNNING" | "TQ001.TEMPERATURE";
export interface TagValue {
  name: TagName;
  dataType: "DOUBLE" | "BOOLEAN";
  value: number | boolean;
  unit: string;
  quality: "GOOD" | "BAD" | "UNCERTAIN" | "STALE";
  source: "SIMULATED";
  sourceTimestamp: string;
  serverTimestamp: string;
  writable: false;
}
export interface Snapshot {
  schemaVersion: 1;
  sequence: number;
  tags: TagValue[];
}
const types = {
  "TQ001.LEVEL": "DOUBLE",
  "P001.RUNNING": "BOOLEAN",
  "TQ001.TEMPERATURE": "DOUBLE",
};

/** Reject malformed or unexpected sources rather than displaying them as measurements. */
export function parseSnapshot(raw: string): Snapshot {
  const frame = JSON.parse(raw);
  if (
    frame.schemaVersion !== 1 ||
    !Number.isSafeInteger(frame.sequence) ||
    frame.sequence < 0 ||
    !Array.isArray(frame.tags) ||
    frame.tags.length !== 3
  )
    throw new Error("Formato de tags inválido");
  const seen = new Set<string>();
  for (const tag of frame.tags) {
    if (
      !tag ||
      !Object.hasOwn(types, tag.name) ||
      seen.has(tag.name) ||
      tag.dataType !== types[tag.name as TagName] ||
      tag.source !== "SIMULATED" ||
      tag.writable !== false ||
      typeof tag.unit !== "string" ||
      !["GOOD", "BAD", "UNCERTAIN", "STALE"].includes(tag.quality) ||
      !Number.isFinite(Date.parse(tag.sourceTimestamp)) ||
      !Number.isFinite(Date.parse(tag.serverTimestamp)) ||
      (tag.dataType === "BOOLEAN"
        ? typeof tag.value !== "boolean"
        : typeof tag.value !== "number" || !Number.isFinite(tag.value))
    ) {
      throw new Error("Tag inválida ou origem não suportada");
    }
    if (tag.name === "TQ001.LEVEL" && (tag.value < 0 || tag.value > 100))
      throw new Error("Nível fora da faixa");
    seen.add(tag.name);
  }
  return frame as Snapshot;
}
