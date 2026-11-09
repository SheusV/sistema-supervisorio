import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { acknowledge, emptyRun, observe } from "./alarmHistory";
import { pastRuns, storeRun, type RecordedRun } from "./operationArchive";
import type { ProjectVariable } from "./project";
const TrendChart = lazy(() => import("./TrendChart"));
const clockLabel = (at: number) => new Date(at).toLocaleTimeString("pt-BR");

interface Props {
  projectName: string; variable: ProjectVariable; limit?: number; dark: boolean;
  ready: boolean; values: Record<string, number | boolean>;
}
export function OperationHistory({ projectName, variable, limit, dark, ready, values }: Props) {
  const [session] = useState(() => ({ id: crypto.randomUUID(), started: Date.now() }));
  const [live, setLive] = useState(emptyRun);
  const [archives, setArchives] = useState<RecordedRun[]>([]);
  const [selected, select] = useState("");
  const [storageIssue, setStorageIssue] = useState(false);
  const lastObservation = useRef<Record<string, number | boolean> | null>(null);
  const scope = JSON.stringify([projectName, variable.name]);

  useEffect(() => {
    let current = true;
    pastRuns(scope, session.id).then(records => { if (current) setArchives(records); })
      .catch(() => { if (current) setStorageIssue(true); });
    return () => { current = false; };
  }, [scope, session.id]);
  useEffect(() => {
    const snapshot = ready ? values : null;
    if (lastObservation.current === snapshot) return;
    lastObservation.current = snapshot;
    const value = snapshot?.[variable.name];
    const sample = { at: Date.now(), value: typeof value === "number" ? value : null };
    setLive(run => observe(run, sample, limit));
  }, [ready, values, variable.name, limit]);
  useEffect(() => {
    if (!live.samples.length) return;
    let current = true;
    storeRun({ ...session, scope, min: variable.min, max: variable.max, unit: variable.unit, limit, run: live })
      .catch(() => { if (current) setStorageIssue(true); });
    return () => { current = false; };
  }, [session, scope, variable, limit, live]);

  const archived = archives.find(r => r.id === selected);
  const run = archived?.run ?? live;
  const threshold = archived ? archived.limit : limit;
  const unit = archived?.unit ?? variable.unit;
  const value = run.samples.at(-1)?.value;
  const alarmStatus = run.acknowledged ? "Alto · reconhecido" : "Alto · aguardando reconhecimento";
  const status = value == null
    ? run.high ? `Sem leitura · último estado: ${alarmStatus}` : "Sem leitura"
    : run.high ? alarmStatus : "Normal";
  return <section className="operation-history" aria-label="Alarmes e histórico">
    <h2>{variable.name === "SILO.MASSA" ? "Histórico da dosagem" : "Histórico da operação"}</h2>
    <label>Operação <select value={selected} onChange={e => select(e.target.value)}>
      <option value="">Atual · {clockLabel(session.started)}</option>
      {archives.map(r => <option key={r.id} value={r.id}>{new Date(r.started).toLocaleString("pt-BR")}</option>)}
    </select></label>
    <p>{variable.name} · {archived ? "Última leitura" : "Leitura atual"} · <strong>{value == null ? "Indisponível" : value + " " + unit}</strong></p>
    {threshold !== undefined && <div className={run.high ? "alarm-line high" : "alarm-line"}>
      <strong>{variable.name === "SILO.MASSA" ? "Massa alta do silo" : "Alarme alto"}</strong>
      <span>Limite ≥ {threshold} {unit}</span><span role="status">{status}</span>
      {!archived && run.high && !run.acknowledged && <button disabled={!ready || value == null} onClick={() => {
        const at = Date.now(); setLive(previous => acknowledge(previous, at));
      }}>Reconhecer alarme</button>}
    </div>}
    {archived && live.high && <p role="status">Alarme alto na operação atual. Selecione Atual para acompanhá-lo.</p>}
    <Suspense fallback={<p>Carregando gráfico…</p>}><TrendChart samples={run.samples} unit={unit} min={archived?.min ?? variable.min} max={archived?.max ?? variable.max} limit={threshold} dark={dark} /></Suspense>
    <h3>Eventos</h3>
    {run.events.length ? <ol className="alarm-events">{[...run.events].reverse().map((event,index) =>
      <li key={run.events.length - index}><time>{clockLabel(event.at)}</time> · {event.kind}{event.value === null ? "" : " · " + event.value + " " + unit}</li>)}</ol> : <p>Nenhuma ocorrência registrada.</p>}
    <p>Histórico neste navegador por nome do projeto e tag. Últimas 20 operações, até 600 leituras e 100 eventos por operação.</p>
    {storageIssue && <p role="alert">Armazenamento local indisponível. A consulta ou a gravação do histórico pode estar incompleta.</p>}
  </section>;
}
