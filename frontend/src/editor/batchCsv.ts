import type { RecordedBatch } from "./operationArchive";

function cell(value: string | number | undefined): string {
  if (value === undefined) return '""';
  const text = typeof value === "number" ? String(value).replace(".", ",") : value;
  // Keep user-controlled text from being interpreted as a spreadsheet formula.
  const safe = typeof value === "string" && /^\s*[=+@-]/.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function batchCsv(records: RecordedBatch[], project: string, oven: string): string {
  const rows: (string | number | undefined)[][] = [[
    "Projeto", "Tag do forno", "ID do lote", "Início (UTC)", "Conclusão (UTC)",
    "Massa carregada", "Unidade", "Capacidade do forno", "Temperatura alvo (°C)",
    "Temperatura final (°C)", "Tempo mínimo (s)", "Tempo mínimo cumprido (s)",
    "Umidade inicial (%)", "Umidade final (%)", "Umidade final máxima (%)",
  ]];
  for (const record of records) {
    const b = record.batch;
    rows.push([
      project, oven, record.id, new Date(record.started).toISOString(),
      b.finishedAt === undefined ? undefined : new Date(b.finishedAt).toISOString(),
      b.mass, record.unit, b.capacity, b.target, b.temperature, b.duration, b.elapsed,
      b.initialMoisture, b.moisture, b.moistureTarget,
    ]);
  }
  return "\uFEFF" + rows.map(row => row.map(cell).join(";")).join("\r\n") + "\r\n";
}
