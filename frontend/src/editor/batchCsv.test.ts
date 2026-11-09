import { expect, it } from "vitest";
import { batchCsv } from "./batchCsv";
import { emptyBatch } from "./drying";

it("exports accents, decimal commas, quoted fields and missing legacy metadata", () => {
  const csv = batchCsv([{
    id: "lote", scope: "", started: 0, unit: 'kg;"úmido"',
    batch: { ...emptyBatch, phase: "finished", mass: 12.5, moisture: 13.75 },
  }], "Secagem de grãos", "FORNO.RUN");
  expect(csv.startsWith("\uFEFF")).toBe(true);
  expect(csv).toContain('"12,5";"kg;""úmido"""');
  expect(csv).toContain('"1970-01-01T00:00:00.000Z";""');
  expect(csv).toContain('"Secagem de grãos"');
  expect(csv).toContain('"13,75"');
});

it("neutralizes spreadsheet formulas in project names and units", () => {
  const csv = batchCsv([{
    id: "lote", scope: "", started: 0, unit: "=1+1", batch: emptyBatch,
  }], "  @SUM(1)", "-FORNO");
  expect(csv).toContain('"' + "'  @SUM(1)" + '"');
  expect(csv).toContain('"' + "'-FORNO" + '"');
  expect(csv).toContain('"' + "'=1+1" + '"');
});
