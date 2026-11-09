import { lazy, Suspense } from "react";
import type { Batch } from "./drying";
const TrendChart = lazy(() => import("./TrendChart"));

export function BatchCurves({ batch, dark }: { batch: Batch; dark: boolean }) {
  if (!batch.samples?.length) return <p>Curvas indisponíveis para este lote.</p>;
  return <section aria-label="Curvas da secagem">
    <p>Até 600 leituras confirmadas por lote. Interrupções de comunicação aparecem como lacunas.</p>
    <Suspense fallback={<p>Carregando curvas…</p>}>
      <h4>Temperatura do forno</h4>
      <TrendChart samples={batch.samples.map(s => ({ at: s.at, value: s.temperature }))} min={0} max={120} unit="°C" limit={batch.target} dark={dark} />
      <h4>Umidade dos grãos</h4>
      <TrendChart samples={batch.samples.map(s => ({ at: s.at, value: s.moisture }))} min={0} max={100} unit="%" limit={batch.moistureTarget} dark={dark} />
    </Suspense>
  </section>;
}
