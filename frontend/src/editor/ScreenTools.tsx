import { useEffect, useState } from "react";
import { addProjectScreen, deleteProjectScreen, MAX_SCREENS, projectScreens, renameProjectScreen, type HmiProject } from "./project";

export function ScreenTools({ project, editing, change, navigate, report }: {
  project: HmiProject; editing: boolean; change: (next: HmiProject) => void;
  navigate: (id: string) => void; report: (message: string) => void;
}) {
  const screens = projectScreens(project);
  const [name, setName] = useState(project.screenName ?? "Tela principal");
  useEffect(() => setName(project.screenName ?? "Tela principal"), [project.screenId, project.screenName]);
  const commit = (action: () => HmiProject) => {
    try { change(action()); report(""); }
    catch (error) { report((error as Error).message); }
  };
  function nextName(prefix: string) {
    let index = 1;
    while (screens.some(s => s.name.toLocaleLowerCase("pt-BR") === (prefix + " " + index).toLocaleLowerCase("pt-BR"))) index++;
    return prefix + " " + index;
  }
  return <section className="drawing-tools screen-tools" aria-label="Telas do projeto">
    <label>Tela exibida<select aria-label="Tela exibida" value={project.screenId ?? "main"} onChange={e => navigate(e.target.value)}>
      {[...screens].sort((a,b) => a.name.localeCompare(b.name, "pt-BR")).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select></label>
    {editing && <>
      <button disabled={screens.length >= MAX_SCREENS} onClick={() => commit(() => addProjectScreen(project, nextName("Tela")))}>Adicionar tela</button>
      <button disabled={screens.length >= MAX_SCREENS} onClick={() => commit(() => addProjectScreen(project, nextName("Cópia"), true))}>Duplicar tela</button>
      <form className="project-form" onSubmit={e => { e.preventDefault(); commit(() => renameProjectScreen(project, name)); }}>
        <label>Nome da tela exibida<input value={name} maxLength={64} required onChange={e => setName(e.target.value)} /></label>
        <button>Renomear tela</button>
      </form>
      <button disabled={screens.length === 1} onClick={() => commit(() => deleteProjectScreen(project))}>Excluir tela exibida</button>
      <span>{screens.length} / {MAX_SCREENS} telas</span>
    </>}
  </section>;
}
