import { useState } from "react";
import type { HmiProject } from "./project";
import { alarmKinds, priorities, type AlarmRule } from "./alarmRules";

export function AlarmRuleEditor({ project, commit }: { project: HmiProject; commit: (project: HmiProject) => boolean }) {
  const [editing, setEditing] = useState<AlarmRule | null>(null);
  const [tag, setTag] = useState(project.variables?.[0]?.name ?? "");
  const variable = project.variables?.find(v => v.name === tag);
  const numeric = variable?.dataType === "DOUBLE";
  const rules = project.alarmRules ?? [];
  return <details>
    <summary>Alarmes do projeto <span>{rules.length} / 32</span></summary>
    <p>Crie alarmes para as tags próprias. As regras acompanham o projeto salvo e podem ser operadas na Central de alarmes.</p>
    <p>A confirmação exige novas leituras na condição de alarme. Falhas reiniciam a contagem. A margem define o retorno ao normal.</p>
    <label>Tag do alarme<select value={tag} onChange={e => { setTag(e.target.value); setEditing(null); }}>
      <option value="">Selecione</option>
      {project.variables?.map(v => <option key={v.name}>{v.name}</option>)}
    </select></label>
    {variable && <form className="project-form" key={JSON.stringify([tag, editing])} onSubmit={e => {
      e.preventDefault();
      const fields = new FormData(e.currentTarget);
      const rule: AlarmRule = {
        id: editing?.id ?? crypto.randomUUID(), name: String(fields.get("name")).trim(), tag,
        kind: fields.get("kind") as AlarmRule["kind"], priority: fields.get("priority") as AlarmRule["priority"],
        threshold: numeric ? Number(fields.get("threshold")) : 0,
        hysteresis: numeric ? Number(fields.get("hysteresis")) : 0, delaySeconds: Number(fields.get("delay")),
      };
      if (commit({ ...project, alarmRules: editing ? rules.map(r => r.id === editing.id ? rule : r) : [...rules, rule] })) setEditing(null);
    }}>
      <label>Nome do alarme<input name="name" maxLength={80} required defaultValue={editing?.name ?? ""} /></label>
      <label>Condição do alarme<select name="kind" defaultValue={editing?.kind ?? (numeric ? "high" : "on")}>
        {Object.entries(alarmKinds).filter(([kind]) => numeric === (kind === "high" || kind === "low")).map(([kind, title]) => <option key={kind} value={kind}>{title}</option>)}
      </select></label>
      <label>Prioridade do alarme<select name="priority" defaultValue={editing?.priority ?? "Média"}>{priorities.map(p => <option key={p}>{p}</option>)}</select></label>
      {numeric && <>
        <label>Limite do alarme<input name="threshold" type="number" min={variable.min} max={variable.max} step="any" defaultValue={editing?.threshold ?? variable.max} required /></label>
        <label>Margem de retorno<input name="hysteresis" type="number" min="0" step="any" defaultValue={editing?.hysteresis ?? 0} required /></label>
      </>}
      <label>Confirmação do alarme (s)<input name="delay" type="number" min="0" max="3600" step="any" defaultValue={editing?.delaySeconds ?? 0} required /></label>
      <button disabled={!editing && rules.length >= 32}>{editing ? "Salvar alarme" : "Criar alarme"}</button>
      {editing && <button type="button" onClick={() => setEditing(null)}>Cancelar edição do alarme</button>}
    </form>}
    <ul className="project-items">{rules.map(rule => <li key={rule.id}><span>{rule.name} · {rule.tag} · {alarmKinds[rule.kind]} · {rule.priority}</span>
      <button onClick={() => { setTag(rule.tag); setEditing(rule); }}>Editar alarme {rule.name}</button>
      <button onClick={() => { if (commit({ ...project, alarmRules: rules.filter(r => r.id !== rule.id) })) setEditing(null); }}>Excluir alarme {rule.name}</button>
    </li>)}</ul>
  </details>;
}
