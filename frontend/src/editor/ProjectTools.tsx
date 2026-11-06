import { useState } from "react";
import { availableBindings, parseProject, type HmiProject, type ProjectVariable, type Port } from "./project";

interface Props { project: HmiProject; change: (next: HmiProject) => void; report: (message: string) => void; }
export function ProjectTools({ project, change, report }: Props) {
  const [name, setName] = useState("MOTOR.RUN");
  const [editingName, setEditingName] = useState<string | null>(null);
  const [type, setType] = useState<"BOOLEAN" | "DOUBLE">("BOOLEAN");
  const [unit, setUnit] = useState("");
  const [initial, setInitial] = useState("0");
  const [min, setMin] = useState("0"), [max, setMax] = useState("100");
  const [from, setFrom] = useState(""), [to, setTo] = useState("");
  const [fromPort, setFromPort] = useState<Port>("right"), [toPort, setToPort] = useState<Port>("left");
  const [kind, setKind] = useState<"pipe" | "signal">("pipe");
  const [binding, setBinding] = useState("");
  function commit(next: HmiProject) {
    try { change(parseProject(JSON.stringify({ ...next, schemaVersion: 2, variables: next.variables ?? [], connections: next.connections ?? [] }))); report(""); return true; }
    catch (error) { report((error as Error).message); return false; }
  }
  function removeVariable(variable: ProjectVariable) {
    commit({ ...project, variables: project.variables?.filter(v => v.name !== variable.name),
      components: project.components.map(item => item.binding === variable.name ? { ...item, binding: null } : item),
      connections: project.connections?.map(line => line.binding === variable.name ? { ...line, binding: null } : line) });
  }
  const ports: Record<Port, string> = { left: "Esquerda", right: "Direita", top: "Topo", bottom: "Base" };
  return <div className="project-tools">
    <details>
      <summary>Tags do projeto <span>{project.variables?.length ?? 0} / 32</span></summary>
      <p>Variáveis manuais da sua simulação. BOOLEAN comanda estados; DOUBLE representa valores numéricos. As três tags da demonstração permanecem somente leitura.</p>
      <form className="project-form" onSubmit={event => {
        event.preventDefault();
        if (![initial, min, max].every(value => value.trim())) { report("Preencha os valores da tag."); return; }
        const variable: ProjectVariable = { name: name.trim(), dataType: type, unit,
          initial: type === "BOOLEAN" ? initial === "1" : Number(initial), min: type === "BOOLEAN" ? 0 : Number(min), max: type === "BOOLEAN" ? 1 : Number(max) };
        const saved = commit({ ...project, variables: editingName ? project.variables?.map(v => v.name === editingName ? variable : v) : [...project.variables ?? [], variable] });
        if (saved) setEditingName(null);
      }}>
        <label>Nome da tag<input aria-label="Nome da tag" value={name} maxLength={64} disabled={!!editingName} onChange={e => setName(e.target.value)} required /></label>
        <label>Tipo<select aria-label="Tipo da tag" value={type} disabled={!!editingName} onChange={e => { setType(e.target.value as typeof type); setInitial("0"); }}><option>BOOLEAN</option><option>DOUBLE</option></select></label>
        <label>Valor inicial{type === "BOOLEAN" ? <select aria-label="Valor inicial" value={initial} onChange={e => setInitial(e.target.value)}><option value="0">Desligado / falso</option><option value="1">Ligado / verdadeiro</option></select>
          : <input aria-label="Valor inicial" type="number" step="any" value={initial} onChange={e => setInitial(e.target.value)} required />}</label>
        {type === "DOUBLE" && <>
          <label>Mínimo<input aria-label="Mínimo da tag" type="number" step="any" value={min} onChange={e => setMin(e.target.value)} required /></label>
          <label>Máximo<input aria-label="Máximo da tag" type="number" step="any" value={max} onChange={e => setMax(e.target.value)} required /></label>
          <label>Unidade<input aria-label="Unidade da tag" value={unit} maxLength={16} onChange={e => setUnit(e.target.value)} /></label>
        </>}
        <button type="submit" disabled={!editingName && (project.variables?.length ?? 0) >= 32}>{editingName ? "Salvar tag" : "Criar tag"}</button>
        {editingName && <button type="button" onClick={() => setEditingName(null)}>Cancelar edição da tag</button>}
      </form>
      <ul className="project-items">{project.variables?.map(variable => <li key={variable.name}>
        <span><strong>{variable.name}</strong> · {variable.dataType} · Inicial: {String(variable.initial)} {variable.unit} {variable.dataType === "DOUBLE" && `(${variable.min} a ${variable.max})`}</span>
        <div><button onClick={() => { setEditingName(variable.name); setName(variable.name); setType(variable.dataType); setUnit(variable.unit); setInitial(typeof variable.initial === "boolean" ? variable.initial ? "1" : "0" : String(variable.initial)); setMin(String(variable.min)); setMax(String(variable.max)); }}>Editar tag {variable.name}</button>{" "}<button onClick={() => { removeVariable(variable); if (editingName === variable.name) setEditingName(null); }}>Excluir tag {variable.name}</button></div>
      </li>)}</ul>
      <p>Excluir uma tag remove seus vínculos; Desfazer recupera tudo. Os valores de operação não são exportados, apenas o valor inicial.</p>
    </details>
    <details>
      <summary>Ligações <span>{project.connections?.length ?? 0} / 100</span></summary>
      <p>Escolha origem, destino e as portas. Tubulações e sinais acompanham o movimento dos objetos. Vincule uma tag booleana para indicar o estado da linha; a ligação gráfica não calcula vazão.</p>
      <form className="project-form" onSubmit={event => { event.preventDefault(); commit({ ...project, connections: [...project.connections ?? [], { id: crypto.randomUUID(), from, to, fromPort, toPort, kind, binding: binding || null }] }); }}>
        <label>Origem<select aria-label="Origem da ligação" value={from} onChange={e => setFrom(e.target.value)} required><option value="">Selecione</option>{project.components.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label>Porta de saída<select aria-label="Porta de saída" value={fromPort} onChange={e => setFromPort(e.target.value as Port)}>{Object.entries(ports).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Destino<select aria-label="Destino da ligação" value={to} onChange={e => setTo(e.target.value)} required><option value="">Selecione</option>{project.components.filter(item => item.id !== from).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label>Porta de entrada<select aria-label="Porta de entrada" value={toPort} onChange={e => setToPort(e.target.value as Port)}>{Object.entries(ports).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Tipo<select aria-label="Tipo da ligação" value={kind} onChange={e => setKind(e.target.value as typeof kind)}><option value="pipe">Tubulação</option><option value="signal">Sinal</option></select></label>
        <label>Tag de estado<select aria-label="Tag da ligação" value={binding} onChange={e => setBinding(e.target.value)}><option value="">Sem vínculo</option>{availableBindings("pump", project.variables).map(tag => <option key={tag}>{tag}</option>)}</select></label>
        <button type="submit" disabled={(project.connections?.length ?? 0) >= 100}>Criar ligação</button>
      </form>
      <ul className="project-items">{project.connections?.map((line, index) => <li key={line.id}><span>{project.components.find(item => item.id === line.from)?.label} → {project.components.find(item => item.id === line.to)?.label} · {line.kind === "pipe" ? "Tubulação" : "Sinal"} · {line.binding ?? "Sem vínculo"}</span><button onClick={() => commit({ ...project, connections: project.connections?.filter(item => item.id !== line.id) })}>Excluir ligação {index + 1}</button></li>)}</ul>
    </details>
  </div>;
}
