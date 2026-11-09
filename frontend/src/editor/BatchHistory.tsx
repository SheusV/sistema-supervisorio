import { useEffect, useState } from "react";
import type { Batch } from "./drying";
import { BatchCurves } from "./BatchCurves";
import { batchCsv } from "./batchCsv";
import { pastBatches, storeBatch, type RecordedBatch } from "./operationArchive";

export function BatchHistory({ project, oven, batch, unit, dark }: { project: string; oven: string; batch: Batch; unit: string; dark: boolean }) {
  const scope = JSON.stringify([project, oven]);
  const [exportIssue, setExportIssue] = useState(false);
  const [selected, setSelected] = useState("");
  const [records, setRecords] = useState<RecordedBatch[]>([]);
  const [issue, setIssue] = useState(false);
  useEffect(() => {
    let current = true;
    setRecords([]);
    setIssue(false);
    setExportIssue(false);
    async function refresh() {
      try {
        if (batch.phase === "finished" && batch.id && batch.started && batch.finishedAt) {
          await storeBatch({ id: batch.id, scope, started: batch.started, unit, batch });
        }
        const saved = await pastBatches(scope);
        if (current) setRecords(saved);
      } catch { if (current) setIssue(true); }
    }
    void refresh();
    return () => { current = false; };
  }, [scope, batch.phase, batch.id, unit]);
  return <section aria-label="Histórico de lotes secos">
    <h3>Lotes secos</h3>
    <p>Últimos 20 lotes concluídos neste navegador, por projeto e forno. O registro ocorre ao concluir a secagem.</p>
    <button disabled={!records.length} onClick={() => {
      setExportIssue(false);
      try {
        const file = new Blob([batchCsv(records, project, oven)], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(file);
        const link = document.createElement("a");
        link.href = url;
        link.download = "nexo-lotes-secos.csv";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch { setExportIssue(true); }
    }}>Exportar lotes em CSV</button>
    {exportIssue && <p role="alert">Não foi possível exportar os lotes. Confira os registros e tente novamente.</p>}
    {records.length ? <ol>{records.map(record => {
      const b = record.batch;
      return <li key={record.id}>
        <time>{new Date(record.started).toLocaleString("pt-BR")}</time>
        {" · "}{b.mass.toLocaleString("pt-BR")} {record.unit}
        {" · "}{b.target} °C
        {" · "}{b.duration} s mínimos na temperatura
        {" · "}{b.initialMoisture?.toLocaleString("pt-BR")}% → {b.moisture.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% (meta ≤ {b.moistureTarget}%)
        {b.finishedAt && <> · Concluído {new Date(b.finishedAt).toLocaleTimeString("pt-BR")}</>}
        <button onClick={() => setSelected(selected === record.id ? "" : record.id)} aria-expanded={selected === record.id}>Ver curvas do lote</button>
        {selected === record.id && <BatchCurves batch={b} dark={dark} />}
      </li>;
    })}</ol> : <p>Nenhum lote seco registrado.</p>}
    {issue && <p role="alert">Não foi possível consultar ou gravar os lotes. Feche outras abas do supervisório e tente reabrir esta operação.</p>}
  </section>;
}
