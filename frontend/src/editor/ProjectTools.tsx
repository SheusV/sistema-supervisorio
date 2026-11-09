import { useEffect, useRef, useState } from "react";
import { availableBindings, parseProject, replaceVariable, type HmiProject, type ProjectVariable, type Port, type ConnectionLine } from "./project";
import { SimulationRuleEditor } from "./SimulationRuleEditor";

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
  const [editingLine, setEditingLine] = useState<string | null>(null);
  const tagForm = useRef<HTMLFormElement>(null), lineForm = useRef<HTMLFormElement>(null);
  useEffect(() => { setEditingName(null); setEditingLine(null); }, [project]);
  function commit(next: HmiProject) {
    try { change(parseProject(JSON.stringify({ ...next, schemaVersion: 2, variables: next.variables ?? [], connections: next.connections ?? [] }))); report(""); return true; }
    catch (error) { report((error as Error).message); return false; }
  }
  function removeVariable(variable: ProjectVariable) {
    const { simulation, ...base } = project;
    commit({ ...base, ...(simulation && simulation.levelTag !== variable.name && simulation.enableTag !== variable.name && simulation.permitTag !== variable.name && !simulation.drainTags?.includes(variable.name) ? { simulation } : {}), variables: project.variables?.filter(v => v.name !== variable.name),
      components: project.components.map(item => item.binding === variable.name ? { ...item, binding: null } : item),
      connections: project.connections?.map(line => line.binding === variable.name ? { ...line, binding: null } : line) });
  }
  const ports: Record<Port, string> = { left: "Esquerda", right: "Direita", top: "Topo", bottom: "Base" };
  return <div className="project-tools">
    <details>
      <summary>Por onde começar?</summary>
      <ol className="editor-steps">
        <li><strong>Tags:</strong> crie variáveis e use Editar tag para ajustar nome, faixa ou valor inicial.</li>
        <li><strong>Objetos e ligações:</strong> insira equipamentos, vincule suas tags e use Desenhar ligação para escolher duas portas na tela. Editar ligação altera uma conexão existente.</li>
        <li><strong>Regra:</strong> configure o nível, o acionamento e as taxas em Simulação automática.</li>
        <li><strong>Operação:</strong> teste os comandos e clique em Iniciar simulação automática. Em Projetos salvos, guarde a configuração neste navegador.</li>
      </ol>
      <p>Para experimentar primeiro, use Exemplo de processo. Desfazer recupera a tela anterior. Salve seu projeto antes de fechar ou recarregar.</p>
    </details>
    <details>
      <summary>Tags do projeto <span>{project.variables?.length ?? 0} / 32</span></summary>
      <p>Crie ou edite as tags na lista abaixo. Renomear atualiza seus vínculos. BOOLEAN comanda estados; DOUBLE representa valores numéricos. As três tags da demonstração permanecem somente leitura.</p>
      {editingName && <p className="editing-banner">Editando tag: <strong>{editingName}</strong></p>}
      <form ref={tagForm} className="project-form" onSubmit={event => {
        event.preventDefault();
        if (![initial, min, max].every(value => value.trim())) { report("Preencha os valores da tag."); return; }
        const variable: ProjectVariable = { name: name.trim(), dataType: type, unit,
          initial: type === "BOOLEAN" ? initial === "1" : Number(initial), min: type === "BOOLEAN" ? 0 : Number(min), max: type === "BOOLEAN" ? 1 : Number(max) };
        try {
          const saved = commit(editingName ? replaceVariable(project, editingName, variable) : { ...project, variables: [...project.variables ?? [], variable] });
          if (saved) setEditingName(null);
        } catch (error) { report((error as Error).message); }
      }}>
        <label>Nome da tag<input aria-label="Nome da tag" value={name} maxLength={64} onChange={e => setName(e.target.value)} required /></label>
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
        <div><button onClick={() => { setEditingName(variable.name); setName(variable.name); setType(variable.dataType); setUnit(variable.unit); setInitial(typeof variable.initial === "boolean" ? variable.initial ? "1" : "0" : String(variable.initial)); setMin(String(variable.min)); setMax(String(variable.max)); tagForm.current?.scrollIntoView({ block: "center" }); }}>Editar tag {variable.name}</button>{" "}<button onClick={() => { removeVariable(variable); if (editingName === variable.name) setEditingName(null); }}>Excluir tag {variable.name}</button></div>
      </li>)}</ul>
      <p>O tipo de uma tag existente permanece fixo. Excluir remove seus vínculos e a regra que a utiliza; Desfazer recupera tudo. Os valores de operação não são exportados, apenas o valor inicial.</p>
    </details>
    <details>
      <summary>Ligações <span>{project.connections?.length ?? 0} / 100</span></summary>
      <p>Escolha origem, destino e as portas. Tubulações e sinais acompanham o movimento dos objetos. Vincule uma tag booleana para indicar o estado da linha; a ligação gráfica não calcula vazão.</p>
      {editingLine && <p className="editing-banner">Editando ligação existente</p>}
      <form ref={lineForm} className="project-form" onSubmit={event => {
        event.preventDefault();
        if (editingLine && !project.connections?.some(line => line.id === editingLine)) { report("A ligação não existe mais. Selecione-a novamente."); return; }
        const line: ConnectionLine = { id: editingLine ?? crypto.randomUUID(), from, to, fromPort, toPort, kind, binding: binding || null };
        if (commit({ ...project, connections: editingLine ? project.connections?.map(item => item.id === editingLine ? line : item) : [...project.connections ?? [], line] })) setEditingLine(null);
      }}>
        <label>Origem<select aria-label="Origem da ligação" value={from} onChange={e => setFrom(e.target.value)} required><option value="">Selecione</option>{project.components.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label>Porta de saída<select aria-label="Porta de saída" value={fromPort} onChange={e => setFromPort(e.target.value as Port)}>{Object.entries(ports).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Destino<select aria-label="Destino da ligação" value={to} onChange={e => setTo(e.target.value)} required><option value="">Selecione</option>{project.components.filter(item => item.id !== from).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label>Porta de entrada<select aria-label="Porta de entrada" value={toPort} onChange={e => setToPort(e.target.value as Port)}>{Object.entries(ports).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Tipo<select aria-label="Tipo da ligação" value={kind} onChange={e => setKind(e.target.value as typeof kind)}><option value="pipe">Tubulação</option><option value="signal">Sinal</option></select></label>
        <label>Tag de estado<select aria-label="Tag da ligação" value={binding} onChange={e => setBinding(e.target.value)}><option value="">Sem vínculo</option>{availableBindings("pump", project.variables).map(tag => <option key={tag}>{tag}</option>)}</select></label>
        <button type="submit" disabled={!editingLine && (project.connections?.length ?? 0) >= 100}>{editingLine ? "Salvar ligação" : "Criar ligação"}</button>
        {editingLine && <button type="button" onClick={() => setEditingLine(null)}>Cancelar edição da ligação</button>}
      </form>
      <ul className="project-items">{project.connections?.map((line, index) => <li key={line.id}><span>{project.components.find(item => item.id === line.from)?.label} → {project.components.find(item => item.id === line.to)?.label} · {line.kind === "pipe" ? "Tubulação" : "Sinal"} · {line.binding ?? "Sem vínculo"}</span><div><button onClick={() => { setEditingLine(line.id); setFrom(line.from); setTo(line.to); setFromPort(line.fromPort); setToPort(line.toPort); setKind(line.kind); setBinding(line.binding ?? ""); lineForm.current?.scrollIntoView({ block: "center" }); }}>Editar ligação {index + 1}</button>{" "}<button onClick={() => commit({ ...project, connections: project.connections?.filter(item => item.id !== line.id) })}>Excluir ligação {index + 1}</button></div></li>)}</ul>
    </details>
    <SimulationRuleEditor project={project} commit={commit} />
  </div>;
}
