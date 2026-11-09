import { useEffect, useState } from "react";
import type { HmiProject } from "./project";

export function SimulationRuleEditor({ project, commit }: { project: HmiProject; commit: (next: HmiProject) => boolean }) {
  const [level, setLevel] = useState(""), [enable, setEnable] = useState("");
  const [limit, setLimit] = useState("");
  const [permit, setPermit] = useState("");
  const [fill, setFill] = useState("5"), [drain, setDrain] = useState("1");
  useEffect(() => {
    setLimit(String(project.simulation?.highLimit ?? ""));
    setPermit(project.simulation?.permitTag ?? "");
    setLevel(project.simulation?.levelTag ?? ""); setEnable(project.simulation?.enableTag ?? "");
    setFill(String(project.simulation?.fillRate ?? 5)); setDrain(String(project.simulation?.drainRate ?? 1));
  }, [project]);
  return <details>
    <summary>Simulação automática <span>{project.simulation ? "Regra configurada" : "Sem regra"}</span></summary>
    <p>O acionamento liga a entrada de material. Se houver uma permissão configurada, as duas tags precisam estar ligadas. A saída é contínua. O nível respeita os limites da tag. Taxas na unidade da tag por segundo simulado; não é um modelo hidráulico das tubulações.</p>
    <form className="project-form" onSubmit={event => { event.preventDefault(); if (fill.trim() && drain.trim()) commit({ ...project, simulation: { levelTag: level, enableTag: enable, ...(permit ? { permitTag: permit } : {}), ...(limit.trim() ? { highLimit: Number(limit) } : {}), fillRate: Number(fill), drainRate: Number(drain) } }); }}>
      <label>Tag de nível<select aria-label="Tag de nível da regra" value={level} onChange={event => setLevel(event.target.value)} required><option value="">Selecione</option>{project.variables?.filter(v => v.dataType === "DOUBLE").map(v => <option key={v.name}>{v.name}</option>)}</select></label>
      <label>Acionamento<select aria-label="Tag de acionamento da regra" value={enable} onChange={event => setEnable(event.target.value)} required><option value="">Selecione</option>{project.variables?.filter(v => v.dataType === "BOOLEAN").map(v => <option key={v.name}>{v.name}</option>)}</select></label>
      <label>Permissão de entrada<select value={permit} onChange={event => setPermit(event.target.value)}><option value="">Sem condição adicional</option>{project.variables?.filter(v => v.dataType === "BOOLEAN").map(v => <option key={v.name}>{v.name}</option>)}</select></label>
      <label>Entrada por segundo<input aria-label="Taxa de entrada" type="number" min="0" max="1000" step="any" value={fill} onChange={event => setFill(event.target.value)} required /></label>
      <label>Saída por segundo<input aria-label="Taxa de saída" type="number" min="0" max="1000" step="any" value={drain} onChange={event => setDrain(event.target.value)} required /></label>
      <label>Limite de alarme alto<input type="number" step="any" placeholder="Opcional" min={project.variables?.find(v => v.name === level)?.min} max={project.variables?.find(v => v.name === level)?.max} value={limit} onChange={event => setLimit(event.target.value)} /></label>
      <button>Salvar regra</button>
      {project.simulation && <button type="button" onClick={() => { const { simulation: _removed, ...next } = project; commit(next); }}>Remover regra</button>}
    </form>
    <p>Em Operação, clique em Iniciar simulação automática. Pausar mantém o último nível. Voltar à edição reinicia os valores.</p>
  </details>;
}
