import { useEffect, useState } from "react";
import { acknowledge, emptyRun, type Run } from "./alarmHistory";
import { observeRule, priorities, type AlarmRule } from "./alarmRules";
import { pastRuns, storeRun, type RecordedRun } from "./operationArchive";
import type { ProjectVariable } from "./project";

interface Props {
  project: string; rules: AlarmRule[]; variables: ProjectVariable[];
  values: Record<string, number | boolean>; ready: boolean;
}
export function AlarmCenter({ project, rules, variables, values, ready }: Props) {
  const [session] = useState(() => ({ id: crypto.randomUUID(), started: Date.now() }));
  const [runs, setRuns] = useState<Record<string, Run>>({});
  const [archives, setArchives] = useState<RecordedRun[]>([]);
  const [issue, setIssue] = useState(false);
  const [priority, setPriority] = useState("");
  const [state, setState] = useState("");
  const scope = (rule: AlarmRule) => JSON.stringify([project, "alarm", rule.id]);
  useEffect(() => {
    const at = Date.now();
    setRuns(previous => Object.fromEntries(rules.map(rule =>
      [rule.id, observeRule(previous[rule.id] ?? emptyRun, rule, ready ? values[rule.tag] : undefined, at)])));
  }, [values, ready, rules]);
  useEffect(() => {
    let current = true;
    Promise.all(rules.map(rule => pastRuns(scope(rule), session.id + rule.id))).then(groups => {
      if (current) setArchives(groups.flat());
    }).catch(() => { if (current) setIssue(true); });
    return () => { current = false; };
  }, [project, rules, session.id]);
  useEffect(() => {
    let current = true;
    Promise.all(rules.map(rule => {
      const run = runs[rule.id];
      const variable = variables.find(v => v.name === rule.tag)!;
      if (!run?.samples.length) return;
      return storeRun({
        id: session.id + rule.id, started: session.started, scope: scope(rule),
        unit: variable.unit, min: variable.min, max: variable.max, run,
        alarmName: rule.name, alarmPriority: rule.priority,
      });
    })).catch(() => { if (current) setIssue(true); });
    return () => { current = false; };
  }, [runs, rules, project, variables, session]);
  const status = (rule: AlarmRule) => {
    const run = runs[rule.id] ?? emptyRun;
    if (!ready || values[rule.tag] === undefined) return "Sem leitura";
    if (run.high) return run.acknowledged ? "Reconhecido" : "Ativo";
    return run.pendingSince !== undefined ? "Confirmando" : "Normal";
  };
  const visible = rules.filter(r => (!priority || r.priority === priority) && (!state || status(r) === state))
    .sort((a,b) => priorities.indexOf(a.priority) - priorities.indexOf(b.priority));
  const events = [
    ...archives.flatMap(r => r.run.events.map(event => ({ ...event, name: r.alarmName ?? "", priority: r.alarmPriority ?? "", key: r.id + event.at + event.kind }))),
    ...rules.flatMap(rule => (runs[rule.id]?.events ?? []).map(event =>
      ({ ...event, name: rule.name, priority: rule.priority, key: rule.id + event.at + event.kind }))),
  ].filter(e => !priority || e.priority === priority).sort((a,b) => b.at - a.at).slice(0, 100);
  const active = rules.filter(r => runs[r.id]?.high).length;
  return <section className="operation-history" aria-label="Central de alarmes">
    <h2>Central de alarmes</h2>
    <p>{active} alarmes ativos · {rules.length} regras. Sem leitura, o último estado ativo é preservado.</p>
    <label>Filtrar prioridade<select value={priority} onChange={e => setPriority(e.target.value)}><option value="">Todas</option>{priorities.map(p => <option key={p}>{p}</option>)}</select></label>
    <label>Filtrar estado<select value={state} onChange={e => setState(e.target.value)}><option value="">Todos</option>{["Ativo", "Reconhecido", "Confirmando", "Normal", "Sem leitura"].map(s => <option key={s}>{s}</option>)}</select></label>
    <button disabled={!ready || !visible.some(r => values[r.tag] !== undefined && runs[r.id]?.high && !runs[r.id]?.acknowledged)} onClick={() => {
      const at = Date.now();
      setRuns(previous => ({ ...previous, ...Object.fromEntries(visible.filter(r => values[r.tag] !== undefined).map(r => [r.id, acknowledge(previous[r.id] ?? emptyRun, at)])) }));
    }}>Reconhecer alarmes visíveis</button>
    {visible.length ? <ul className="project-items">{visible.map(rule => {
      const run = runs[rule.id] ?? emptyRun;
      const variable = variables.find(v => v.name === rule.tag)!;
      return <li key={rule.id} className={run.high ? "alarm-line high" : "alarm-line"}>
        <strong>{rule.name}</strong><span>{rule.priority} · {rule.tag}</span>
        <span>{ready ? String(values[rule.tag] ?? "—") + " " + variable.unit : "Indisponível"}</span>
        <span role="status">{status(rule)}</span>
        {(!ready || values[rule.tag] === undefined) && run.high && <span>Último estado · {run.acknowledged ? "Reconhecido" : "Ativo"}</span>}
        <button disabled={!ready || values[rule.tag] === undefined || !run.high || run.acknowledged} onClick={() => {
          const at = Date.now();
          setRuns(previous => ({ ...previous, [rule.id]: acknowledge(previous[rule.id] ?? emptyRun, at) }));
        }}>Reconhecer {rule.name}</button>
      </li>;
    })}</ul> : <p>Nenhum alarme corresponde aos filtros.</p>}
    <h3>Ocorrências recentes</h3>
    <p>Até 100 ocorrências exibidas. Últimas 20 operações por regra neste navegador. O filtro de estado se aplica à lista atual.</p>
    {events.length ? <ol>{events.map(e => <li key={e.key}>
      <time>{new Date(e.at).toLocaleString("pt-BR")}</time> · {e.priority} · {e.name} · {e.kind}{e.value === null ? "" : " · " + e.value}
    </li>)}</ol> : <p>Nenhuma ocorrência registrada.</p>}
    {issue && <p role="alert">Histórico de alarmes indisponível. Confira o armazenamento deste navegador.</p>}
  </section>;
}
