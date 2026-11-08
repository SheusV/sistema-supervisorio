import { useEffect, useRef, useState } from "react";
import type { HmiProject } from "./project";
import { editSavedEntry, listProjects, readEntry, readProject, saveProject } from "./savedProjects";

interface Props {
  project: HmiProject;
  open: (next: HmiProject) => void;
  saved: () => void;
  editedEntry: (entry: Awaited<ReturnType<typeof readEntry>>, newName: string | null) => void;
}

export function ProjectLibrary({ project, open, saved, editedEntry }: Props) {
  const [names, setNames] = useState<string[]>([]);
  const [selection, setSelection] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [replacement, setReplacement] = useState<{ project: HmiProject; revision: string } | null>(null);
  const [operation, setOperation] = useState<{ type: "rename" | "delete"; entry: Awaited<ReturnType<typeof readEntry>> } | null>(null);
  const [newName, setNewName] = useState("");
  const notifyEdit = useRef(editedEntry);
  notifyEdit.current = editedEntry;
  const active = useRef(false);
  const latest = useRef(project);
  latest.current = project;
  const pending = replacement?.project === project ? replacement : null;

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  async function refresh(preferred?: string) {
    const available = await listProjects();
    if (!active.current) return;
    setNames(available);
    setSelection(current => {
      const name = preferred ?? current;
      return available.includes(name) ? name : available[0] ?? "";
    });
  }

  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      if (active.current) setMessage(error instanceof DOMException
        ? "O navegador não conseguiu acessar a biblioteca. Confira o espaço disponível ou use Exportar JSON."
        : error instanceof Error ? error.message : "Não foi possível concluir a operação.");
    } finally {
      if (active.current) setBusy(false);
    }
  }

  async function save(revision?: string) {
    const result = await saveProject(project, revision);
    if (!active.current) return;
    if (!result.saved) {
      if (result.revision === null) {
        setReplacement(null);
        await refresh();
        setMessage("A cópia foi removida ou renomeada em outra aba. Use Salvar projeto para criar uma nova cópia.");
        return;
      }
      if (latest.current === project) {
        setReplacement({ project, revision: result.revision });
        setMessage(revision ? "Outra aba atualizou esta tela. Confirme para substituir a versão mais recente." : "");
      }
      return;
    }
    setReplacement(null);
    if (latest.current === project) saved();
    setMessage(`Projeto “${project.name}” salvo neste navegador.`);
    await refresh(project.name);
  }

  async function begin(type: "rename" | "delete") {
    const entry = await readEntry(selection);
    if (!active.current) return;
    setReplacement(null);
    setOperation({ type, entry });
    setNewName(entry.name);
  }

  async function confirmEdit() {
    if (!operation) return;
    const name = operation.type === "rename" ? newName.trim() : null;
    try {
      await editSavedEntry(operation.entry, name);
    } catch (error) {
      setOperation(null);
      await refresh();
      throw error;
    }
    if (!active.current) return;
    setOperation(null);
    notifyEdit.current(operation.entry, name);
    await refresh(name ?? undefined);
    setMessage(name ? `Projeto renomeado para “${name}”.` : `Projeto “${operation.entry.name}” excluído da biblioteca.`);
  }

  return <details className="project-library" onToggle={event => {
    if (event.currentTarget.open) void perform(() => refresh());
    else { setReplacement(null); setOperation(null); }
  }}>
    <summary>Projetos salvos</summary>
    <p>Biblioteca deste navegador. Use Exportar JSON para guardar uma cópia fora deste dispositivo.</p>
    <div className="library-controls">
      <button disabled={busy || !!pending || !!operation} onClick={() => void perform(() => save())}>Salvar projeto</button>
      <label>Projeto <select aria-label="Projeto salvo" value={selection} disabled={busy || !names.length}
        onChange={event => { setSelection(event.target.value); setReplacement(null); setOperation(null); }}>
        {!names.length && <option value="">Nenhum projeto salvo</option>}
        {names.map(name => <option key={name}>{name}</option>)}
      </select></label>
      <button disabled={busy || !selection || !!operation} onClick={() => void perform(async () => {
        const next = await readProject(selection);
        if (!active.current || latest.current !== project) return;
        setReplacement(null);
        open(next);
        setMessage(`Projeto “${next.name}” aberto. Desfazer recupera a tela anterior.`);
      })}>Abrir projeto salvo</button>
      <button disabled={busy || !selection || !!operation} onClick={() => void perform(() => begin("rename"))}>Renomear</button>
      <button disabled={busy || !selection || !!operation} onClick={() => void perform(() => begin("delete"))}>Excluir da biblioteca</button>
    </div>
    {operation && <form className="library-controls" onSubmit={event => {
      event.preventDefault();
      void perform(confirmEdit);
    }}>
      {operation.type === "rename" ? <label>Novo nome de “{operation.entry.name}” <input aria-label="Novo nome do projeto" value={newName} maxLength={80} required autoFocus onChange={event => setNewName(event.target.value)} /></label>
        : <span>Excluir a cópia salva de “{operation.entry.name}” deste navegador?</span>}
      <button disabled={busy || (operation.type === "rename" && (!newName.trim() || newName.trim() === operation.entry.name))}>
        {operation.type === "rename" ? "Confirmar nome" : "Confirmar exclusão"}
      </button>
      <button type="button" disabled={busy} onClick={() => setOperation(null)}>Cancelar</button>
    </form>}
    {pending && <div className="library-controls">
      <span>Já existe um projeto chamado “{project.name}”. Substituir a cópia salva?</span>
      <button disabled={busy} onClick={() => void perform(() => save(pending.revision))}>Substituir projeto</button>
      <button disabled={busy} onClick={() => { setReplacement(null); setMessage(""); }}>Cancelar</button>
    </div>}
    {message && <p role="status">{message}</p>}
  </details>;
}
