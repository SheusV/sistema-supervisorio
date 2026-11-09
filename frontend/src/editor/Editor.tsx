import { useEffect, useRef, useState, type Dispatch } from "react";
import { ActiveSelection, Canvas, Pattern, Path } from "fabric";
import { PortOverlay, portPosition, portSides, connectionPath, type DrawingSession, type DrawingPort } from "./PortOverlay";
import { arrange, layoutLabels, moveTogether, type LayoutAction } from "./layout";
import { OperationHistory } from "./OperationHistory";
import { BatchHistory } from "./BatchHistory";
import { BatchCurves } from "./BatchCurves";
import { ProjectLibrary } from "./ProjectLibrary";
import { ProjectTools } from "./ProjectTools";
import { dosingExample, processExample } from "./processExample";
import { useProjectSimulation } from "./useProjectSimulation";
import type { Snapshot } from "../tags/model";
import type { Connection } from "../tags/useTags";
import {
  availableBindings,
  removeComponents,
  type ConnectionLine,
  componentNames,
  createComponent,
  MAX_COMPONENTS,
  MAX_PROJECT_BYTES,
  parseProject,
  serializeProject,
  type ComponentKind,
  type HmiComponent,
  type HmiProject,
  type ProjectAction,
  type ProjectHistory,
} from "./project";
import { createWidget, type Widget } from "./widgets";
import "./editor.css";

interface Props {
  dark: boolean;
  history: ProjectHistory;
  dispatch: Dispatch<ProjectAction>;
  snapshot: Snapshot | null;
  connection: Connection;
  dirty: boolean;
  onDirty: (dirty: boolean) => void;
}
export default function Editor({
  dark,
  history,
  dispatch,
  snapshot,
  connection,
  dirty,
  onDirty,
}: Props) {
  const project = history.present;
  const canvasElement = useRef<HTMLCanvasElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<Canvas | null>(null);
  const widgets = useRef(new Map<string, Widget>());
  const importing = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editing, setEditing] = useState(true);
  const [zoom, setZoom] = useState(70);
  const [snap, setSnap] = useState(true);
  const [message, setMessage] = useState("");
  const [sceneRevision, setSceneRevision] = useState(0);
  const ovenTag = project.components.find(c => c.kind === "oven" && c.binding && project.simulation?.drainTags?.includes(c.binding))?.binding ?? undefined;
  const simulation = useProjectSimulation(project.variables ?? [], !editing, project.simulation, ovenTag);
  const batch = simulation.batch;
  const measured = project.variables?.find(v => v.name === project.simulation?.levelTag);
  const lines = useRef<Path[]>([]);
  const [drawing, setDrawing] = useState<DrawingSession | null>(null);
  const [sourcePort, setSourcePort] = useState<DrawingPort | null>(null);
  const [lineKind, setLineKind] = useState<ConnectionLine["kind"]>("pipe");
  const drawingActive = editing && drawing?.project === project;
  useEffect(() => {
    setDrawing(null);
    setSourcePort(null);
  }, [project, editing]);
  const drawLinesRef = useRef<() => void>(() => {});
  const commandRef = useRef<(id: string) => void>(() => {});
  const valueFor = (binding: string | null): number | boolean | null => {
    if (!binding) return null;
    if (project.variables?.some(tag => tag.name === binding)) return simulation.ready ? simulation.values[binding] ?? null : null;
    const tag = snapshot?.tags.find(tag => tag.name === binding);
    return connection === "live" && tag?.quality === "GOOD" ? tag.value : null;
  };
  const unitFor = (binding: string | null) => project.variables?.find(tag => tag.name === binding)?.unit
    ?? snapshot?.tags.find(tag => tag.name === binding)?.unit ?? (binding === "TQ001.LEVEL" ? "%" : "");
  commandRef.current = id => {
    const item = project.components.find(item => item.id === id);
    if (!item?.binding || !simulation.ready || simulation.busy) return;
    if (item.kind === "button" && typeof simulation.values[item.binding] === "boolean") simulation.write(item.binding, !simulation.values[item.binding]);
    if (item.kind === "setpoint") document.getElementById(`setpoint-${item.binding}`)?.focus();
  };
  const selected = selectedIds.length === 1 ? project.components.find((item) => item.id === selectedIds[0]) : undefined;
  const state = useRef({ project, editing, snap });
  state.current = { project, editing, snap };
  const change = (next: HmiProject) => {
    dispatch({ type: "change", project: { ...next, schemaVersion: 2, variables: next.variables ?? [], connections: next.connections ?? [] } });
    setSceneRevision(value => value + 1);
    onDirty(true);
  };
  const changeRef = useRef(change);
  changeRef.current = change;

  useEffect(() => {
    if (!canvasElement.current) return;
    const instance = new Canvas(canvasElement.current, {
      width: 840,
      height: 504,
      selection: true,
      preserveObjectStacking: true,
      backgroundColor: "#ffffff",
    });
    canvas.current = instance;
    const identify = (target: unknown) =>
      [...widgets.current].find(([, widget]) => widget.root === target)?.[0] ??
      null;
    const syncSelection = () => {
      const active = instance.getActiveObject();
      if (active instanceof ActiveSelection) active.set({ hasControls: false, lockScalingX: true, lockScalingY: true, lockRotation: true });
      setSelectedIds(instance.getActiveObjects().map(identify).filter((id): id is string => id !== null));
    };
    instance.on("selection:created", syncSelection);
    instance.on("selection:updated", syncSelection);
    instance.on("selection:cleared", () => setSelectedIds([]));
    instance.on("mouse:up", ({ target }) => {
      if (!state.current.editing) { const id = identify(target); if (id) commandRef.current(id); }
    });
    instance.on("object:moving", ({ target }) => {
      if (state.current.snap) target.set({
        left: Math.round(target.left / 20) * 20,
        top: Math.round(target.top / 20) * 20,
      });
      drawLinesRef.current();
    });
    instance.on("object:scaling", () => drawLinesRef.current());
    instance.on("object:rotating", () => drawLinesRef.current());
    instance.on("object:modified", ({ target }) => {
      if (!state.current.editing) return;
      if (target instanceof ActiveSelection) {
        const ids = instance.getActiveObjects().map(identify).filter((id): id is string => id !== null);
        const first = state.current.project.components.find(item => item.id === ids[0]);
        const object = first && widgets.current.get(first.id)?.root;
        if (first && object) {
          const position = object.getXY();
          let dx = position.x - first.x, dy = position.y - first.y;
          if (state.current.snap) { dx = Math.round(dx / 20) * 20; dy = Math.round(dy / 20) * 20; }
          changeRef.current(moveTogether(state.current.project, ids, dx, dy));
        }
        return;
      }
      const id = identify(target);
      if (!id) return;
      const angle = ((((target.angle + 180) % 360) + 360) % 360) - 180;
      const geometry = {
        x: Math.max(0, Math.min(1160, Math.round(target.left))),
        y: Math.max(0, Math.min(688, Math.round(target.top))),
        width: Math.max(40, Math.min(500, Math.round(target.getScaledWidth()))),
        height: Math.max(
          32,
          Math.min(500, Math.round(target.getScaledHeight())),
        ),
        angle: Math.round(angle),
      };
      changeRef.current({
        ...state.current.project,
        components: state.current.project.components.map((item) =>
          item.id === id ? { ...item, ...geometry } : item,
        ),
      });
    });
    return () => {
      canvas.current = null;
      widgets.current.clear();
      void instance.dispose();
    };
  }, []);

  drawLinesRef.current = () => {
    const instance = canvas.current;
    if (!instance) return;
    instance.remove(...lines.current);
    lines.current = [];
    for (const line of project.connections ?? []) {
      const source = widgets.current.get(line.from)?.root, destination = widgets.current.get(line.to)?.root;
      if (!source || !destination) continue;
      source.setCoords();
      destination.setCoords();
      const path = connectionPath(portPosition(source, line.fromPort), portPosition(destination, line.toPort), line.fromPort);
      const value = valueFor(line.binding);
      const object = new Path(path, { fill: "", stroke: editing || value === true ? "#318f9b" : "#94a3b0", strokeWidth: line.kind === "pipe" ? 7 : 2,
        strokeDashArray: line.kind === "signal" || (!editing && line.binding && value === null) ? [8, 5] : undefined,
        selectable: false, evented: false, strokeLineCap: "round", objectCaching: false });
      lines.current.push(object); instance.add(object); instance.sendObjectToBack(object);
    }
    instance.requestRenderAll();
  };

  useEffect(() => {
    const instance = canvas.current;
    if (!instance) return;
    const active = selectedIds;
    instance.selection = editing;
    const grid = document.createElement("canvas");
    grid.width = 20;
    grid.height = 20;
    const context = grid.getContext("2d")!;
    const paper = dark ? "#162533" : "#ffffff";
    context.fillStyle = paper;
    context.fillRect(0, 0, 20, 20);
    context.fillStyle = dark ? "#405569" : "#c3ced8";
    context.fillRect(0, 0, 1.5, 1.5);
    instance.backgroundColor = editing
      ? new Pattern({ source: grid, repeat: "repeat" })
      : paper;
    instance.discardActiveObject();
    instance.remove(...instance.getObjects());
    lines.current = [];
    widgets.current.clear();
    for (const item of project.components) {
      const widget = createWidget(item, unitFor(item.binding), dark);
      widget.root.set({ selectable: editing, evented: editing || item.kind === "button" || item.kind === "setpoint", hoverCursor: !editing && (item.kind === "button" || item.kind === "setpoint") ? "pointer" : "move" });
      widget.update(null, editing);
      widgets.current.set(item.id, widget);
      instance.add(widget.root);
    }
    const ids = editing ? active.filter(id => widgets.current.has(id)) : [];
    activate(ids);
    drawLinesRef.current();
    instance.requestRenderAll();
    // Selection changes do not rebuild the scene; document changes do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, editing, sceneRevision, dark]);

  useEffect(() => {
    const instance = canvas.current;
    if (!instance) return;
    instance.setDimensions({
      width: (1200 * zoom) / 100,
      height: (720 * zoom) / 100,
    });
    instance.setZoom(zoom / 100);
    instance.requestRenderAll();
  }, [zoom]);

  useEffect(() => {
    if (editing) return;
    for (const item of project.components) {
      const value = valueFor(item.binding);
      widgets.current.get(item.id)?.update(value, false);
    }
    canvas.current?.requestRenderAll();
    drawLinesRef.current();
  }, [snapshot, connection, editing, project, simulation.values, simulation.ready, dark]);

  const fit = () => {
    if (host.current)
      setZoom(
        Math.max(
          25,
          Math.min(
            100,
            Math.floor(((host.current.clientWidth - 36) / 1200) * 100),
          ),
        ),
      );
  };
  useEffect(() => {
    fit();
  }, []);

  function activate(ids: string[]) {
    const instance = canvas.current;
    if (!instance) return;
    instance.discardActiveObject();
    const objects = ids.flatMap(id => { const widget = widgets.current.get(id); return widget ? [widget.root] : []; });
    if (objects.length === 1) instance.setActiveObject(objects[0]);
    if (objects.length > 1) instance.setActiveObject(new ActiveSelection(objects, {
      canvas: instance, hasControls: false, lockScalingX: true, lockScalingY: true, lockRotation: true,
    }));
    setSelectedIds(ids);
    instance.requestRenderAll();
  }
  function select(id: string, multiple = false) {
    if (!editing) return;
    setDrawing(null);
    activate(multiple ? selectedIds.includes(id) ? selectedIds.filter(value => value !== id) : [...selectedIds, id] : [id]);
  }
  function startDrawing() {
    activate([]);
    const ports: DrawingPort[] = [];
    for (const item of project.components) {
      const root = widgets.current.get(item.id)?.root;
      if (!root) continue;
      root.setCoords();
      for (const side of portSides) {
        ports.push({ id: item.id, label: item.label, side, ...portPosition(root, side) });
      }
    }
    setSourcePort(null);
    setDrawing({ project, ports });
    setMessage("");
  }
  function finishDrawing(from: DrawingPort, to: DrawingPort) {
    if (!drawingActive || from.id === to.id) return;
    const line: ConnectionLine = {
      id: crypto.randomUUID(), from: from.id, fromPort: from.side,
      to: to.id, toPort: to.side, kind: lineKind, binding: null,
    };
    change({ ...project, connections: [...project.connections ?? [], line] });
    setDrawing(null);
    setMessage(`Ligação criada entre ${from.label} e ${to.label}. Para vincular uma tag, abra Ligações.`);
  }
  function add(kind: ComponentKind) {
    if (!editing || project.components.length >= MAX_COMPONENTS) return;
    const item = createComponent(kind, project.components.length);
    setSelectedIds([item.id]);
    change({ ...project, components: [...project.components, item] });
  }
  function patch(values: Partial<HmiComponent>) {
    if (!editing || !selected) return;
    try {
      const next = parseProject(
        JSON.stringify({
          ...project,
          schemaVersion: 2, variables: project.variables ?? [], connections: project.connections ?? [],
          components: project.components.map((item) =>
            item.id === selected.id ? { ...item, ...values } : item,
          ),
        }),
      );
      change(next);
      setMessage("");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  function reorder(direction: number) {
    if (!selected) return;
    const items = [...project.components];
    const index = items.findIndex((item) => item.id === selected.id);
    const destination = Math.max(
      0,
      Math.min(items.length - 1, index + direction),
    );
    items.splice(index, 1);
    items.splice(destination, 0, selected);
    change({ ...project, components: items });
  }
  function save() {
    const blob = new Blob([serializeProject(project)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "projeto-hmi.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onDirty(false);
    setMessage(
      "Arquivo exportado. Guarde o JSON para abrir o projeto novamente.",
    );
  }
  async function open(file?: File) {
    if (!file || !editing) return;
    const request = ++importing.current;
    try {
      if (file.size > MAX_PROJECT_BYTES)
        throw new Error("O arquivo excede o limite de 256 KiB.");
      const loaded = parseProject(await file.text());
      if (request !== importing.current || !state.current.editing) return;
      change(loaded);
      setSelectedIds([]);
      setMessage("Projeto aberto. Desfazer recupera a tela anterior.");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  return (
    <section className="editor" aria-label="Editor de telas">
      <div className="editor-toolbar">
        <div className="mode-switch" aria-label="Modo da tela">
          <button aria-pressed={editing} onClick={() => setEditing(true)}>
            Edição
          </button>
          <button aria-pressed={!editing} onClick={() => setEditing(false)}>
            Operação
          </button>
        </div>
        <span className="toolbar-divider" />
        <button
          disabled={!editing || !history.past.length}
          onClick={() => {
            dispatch({ type: "undo" });
            onDirty(true);
          }}
        >
          Desfazer
        </button>
        <button
          disabled={!editing || !history.future.length}
          onClick={() => {
            dispatch({ type: "redo" });
            onDirty(true);
          }}
        >
          Refazer
        </button>
        <div className="toolbar-files">
          <span className="save-state">
            {dirty ? "Alterações pendentes" : "Alterações salvas"}
          </span>
          <button
            disabled={!editing}
            onClick={() => {
              const { simulation: _removed, ...base } = project;
              change({ ...base, name: "Nova tela", components: [], variables: [], connections: [] });
              setSelectedIds([]);
              setMessage("Tela criada. Desfazer recupera a tela anterior.");
            }}
          >
            Nova tela
          </button>
          <button
            disabled={!editing}
            onClick={() => fileInput.current?.click()}
          >
            Abrir JSON
          </button>
          <button disabled={!editing} onClick={() => { change(processExample()); setSelectedIds([]); setMessage("Exemplo carregado. Abra Operação para testar os comandos. Desfazer recupera a tela anterior."); }}>Exemplo de processo</button>
          <button disabled={!editing} onClick={() => { change(dosingExample()); setSelectedIds([]); setMessage("Em Operação, inicie a simulação e ligue o dosador e a esteira para alimentar o silo."); }}>Exemplo de dosagem</button>
          <button className="primary-action" onClick={save}>
            Exportar JSON
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            aria-label="Arquivo de projeto"
            hidden
            onChange={(e) => {
              void open(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      </div>
      {editing && <ProjectLibrary project={project} saved={() => onDirty(false)} editedEntry={(entry, newName) => {
        if (project.name !== entry.name) return;
        if (newName === null || serializeProject(project) !== entry.document) onDirty(true);
        else {
          change({ ...project, name: newName });
          onDirty(dirty);
        }
      }} open={next => {
        importing.current++;
        change(next);
        setSelectedIds([]);
        onDirty(false);
        setMessage("");
      }} />}
      {editing && <ProjectTools project={project} change={change} report={setMessage} />}
      {!editing && !!project.variables?.length && <section className="simulation-console" aria-label="Comandos da simulação">
        <h2>Simulação do projeto</h2>
        <p>Comandos e regras calculados pelo Java, isolados nesta aba. Tubulações representam o desenho; a evolução do nível segue a regra configurada.</p>
        {project.simulation && <div className="automatic-controls">
          <button disabled={!simulation.ready || simulation.busy} aria-pressed={simulation.automatic} onClick={simulation.toggleAutomatic}>{simulation.automatic ? "Pausar simulação automática" : "Iniciar simulação automática"}</button>
          <span>{simulation.automatic ? "Em execução" : "Pausada"} · {project.simulation.levelTag} · entrada {project.simulation.fillRate}, saída {project.simulation.drainRate} por segundo simulado</span>
          {!!project.simulation.drainTags?.length && <p>Descarga · {project.simulation.drainTags.join(" + ")} · {simulation.ready ? ovenTag && (batch.phase !== "loading" || batch.mass >= batch.capacity) ? "Bloqueada pelo lote no forno" : project.simulation.drainTags.every(name => simulation.values[name] === true) ? "Liberada" : "Bloqueada" : "Indisponível"}</p>}
          {project.simulation.permitTag && <p>Permissão de entrada · {project.simulation.permitTag} · {simulation.ready ? simulation.values[project.simulation.permitTag] ? "Liberada" : "Bloqueada" : "Indisponível"}</p>}
          <p>Um segundo simulado por ciclo confirmado. Lentidão ou aba em segundo plano pode reduzir a velocidade; não há recuperação de tempo perdido.</p>
        </div>}
        <p role="status">{simulation.busy ? "Validando no Java…" : simulation.ready ? "Simulação pronta" : simulation.error || "Conectando ao simulador…"}</p>
        {simulation.error && <button disabled={simulation.busy} onClick={simulation.retry}>Reconectar simulação</button>}
        {ovenTag && <section className="drying-panel" aria-label="Secagem dos grãos">
          <h3>Secagem dos grãos</h3>
          <p>Com a simulação em execução, ligue o triturador e o forno para receber grãos. Iniciar a secagem fecha a entrada do lote até a retirada.</p>
          <p role="status">{!simulation.ready ? "Sem comunicação" : batch.phase === "finished" ? "Lote seco" :
            batch.phase === "loading" ? batch.mass >= batch.capacity ? "Forno cheio · descarga bloqueada" : batch.mass > 0 ? "Recebendo lote" : "Aguardando grãos" :
            !simulation.automatic || !simulation.values[ovenTag] ? "Secagem pausada" :
            batch.temperature < batch.target ? "Aquecendo" : batch.elapsed >= batch.duration ? "Secando até a umidade final" :
            batch.moisture <= batch.moistureTarget ? "Cumprindo tempo mínimo" : "Secando"}</p>
          <p>Massa carregada: <strong>{batch.mass.toLocaleString("pt-BR")} {measured?.unit}</strong> · Temperatura simulada: <strong>{batch.temperature.toLocaleString("pt-BR")} °C</strong></p>
          <p>Capacidade do forno · {batch.capacity.toLocaleString("pt-BR")} {measured?.unit}</p>
          <p>Umidade simulada dos grãos: <strong>{batch.mass > 0 && simulation.ready ? batch.moisture.toLocaleString("pt-BR", {maximumFractionDigits: 2}) + "%" : "—"}</strong></p>
          {batch.phase === "loading" ? <form className="project-form" onSubmit={e => {
            e.preventDefault();
            const recipe = new FormData(e.currentTarget);
            simulation.startBatch(Number(recipe.get("target")), Number(recipe.get("duration")), Number(recipe.get("moistureTarget")));
          }}>
            <label>Temperatura alvo (°C)<input type="number" name="target" min="20" max="120" step="1" defaultValue={batch.target} required /></label>
            <label>Tempo mínimo de secagem (s)<input type="number" name="duration" min="1" max="3600" defaultValue={batch.duration} required /></label>
            <label>Umidade final máxima (%)<input type="number" name="moistureTarget" min="0" max="100" step="0.1" defaultValue={batch.moistureTarget} required /></label>
            <label>Umidade inicial do lote (%)<input type="number" min="0" max="100" step="0.1" defaultValue={batch.moisture} required disabled={!simulation.ready || simulation.busy} onChange={e => {
              if (e.currentTarget.value && e.currentTarget.validity.valid) simulation.setInitialMoisture(Number(e.currentTarget.value));
            }} /></label>
            <button disabled={!simulation.ready || simulation.busy || !simulation.values[ovenTag] || batch.mass <= 0}>Iniciar secagem</button>
          </form> : <><p>Temperatura alvo: {batch.target} °C · Tempo mínimo na temperatura: {Number(batch.elapsed.toFixed(1))} / {batch.duration} s · Umidade final máxima: {batch.moistureTarget.toLocaleString("pt-BR")}%</p>
            <progress aria-label="Tempo mínimo de secagem cumprido" max={batch.duration} value={batch.elapsed} />
            {batch.phase === "finished" && <button disabled={!simulation.ready || simulation.busy} onClick={simulation.releaseBatch}>Retirar lote seco</button>}
          </>}
        </section>}
        {ovenTag && batch.phase !== "loading" && <BatchCurves batch={batch} dark={dark} />}
        {ovenTag && <BatchHistory project={project.name} oven={ovenTag} batch={batch} unit={measured?.unit ?? ""} dark={dark} />}
        <div className="simulation-values">{project.variables.map(variable => <div key={variable.name}>
          <strong>{variable.name}</strong><output aria-label={`Valor de ${variable.name}`}>{simulation.ready ? `${String(simulation.values[variable.name])} ${variable.unit}` : "Indisponível"}</output>
          {variable.dataType === "BOOLEAN" ? <button disabled={!simulation.ready || simulation.busy} onClick={() => simulation.write(variable.name, !simulation.values[variable.name])}>Alternar {variable.name}</button>
            : <form onSubmit={event => { event.preventDefault(); const field = new FormData(event.currentTarget).get("value"); if (typeof field === "string" && field.trim()) simulation.write(variable.name, Number(field)); }}>
              <input id={`setpoint-${variable.name}`} key={String(simulation.values[variable.name])} aria-label={`Novo valor de ${variable.name}`} name="value" type="number" step="any" min={variable.min} max={variable.max} defaultValue={Number(simulation.values[variable.name] ?? variable.initial)} required disabled={!simulation.ready || simulation.busy} />
              <button disabled={!simulation.ready || simulation.busy}>Aplicar {variable.name}</button>
            </form>}
        </div>)}</div>
      </section>}
      {!editing && measured && <OperationHistory key={JSON.stringify([project.name, measured.name])} projectName={project.name} variable={measured}
        limit={project.simulation?.highLimit} hysteresis={project.simulation?.highHysteresis} delaySeconds={project.simulation?.highDelaySeconds} dark={dark} ready={simulation.ready} values={simulation.values} />}
      <div className={`editor-layout ${editing ? "" : "operating-layout"}`}>
        <aside
          className="component-library"
          aria-label="Biblioteca de componentes"
        >
          <h2>Componentes</h2>
          <p>Selecione para inserir</p>
          <div className="library-items">
            {(Object.keys(componentNames) as ComponentKind[]).map((kind) => (
              <button
                key={kind}
                disabled={
                  !editing || project.components.length >= MAX_COMPONENTS
                }
                onClick={() => add(kind)}
              >
                <span className={`library-symbol ${kind}`} aria-hidden="true" />
                {componentNames[kind]}
              </button>
            ))}
          </div>
          <h2 className="layers-heading">
            Objetos <span>{project.components.length}</span>
          </h2>
          <ol className="layer-list">
            {[...project.components].reverse().map((item) => (
              <li key={item.id}>
                <button
                  disabled={!editing}
                  aria-pressed={selectedIds.includes(item.id)}
                  onClick={(event) => select(item.id, event.shiftKey || event.ctrlKey || event.metaKey)}
                >
                  <span className="layer-kind">
                    {componentNames[item.kind]}
                  </span>
                  {item.label}
                </button>
              </li>
            ))}
          </ol>
        </aside>
        <div className="editor-workspace">
          <div className="screen-title">
            {editing ? <input aria-label="Nome da tela" key={project.name} defaultValue={project.name} maxLength={80} onBlur={event => {
              if (event.target.value === project.name) return;
              try { change(parseProject(JSON.stringify({ ...project, name: event.target.value }))); setMessage(""); }
              catch (error) { setMessage((error as Error).message); }
            }} /> : <span>{project.name}</span>}
            <span>1200 × 720 px</span>
          </div>
          {editing && <div className="drawing-tools">
            {drawingActive ? <>
              <label>Tipo <select aria-label="Tipo do traçado" value={lineKind}
                onChange={event => setLineKind(event.target.value as ConnectionLine["kind"])}>
                <option value="pipe">Tubulação</option><option value="signal">Sinal</option>
              </select></label>
              <button onClick={() => setDrawing(null)}>Cancelar ligação</button>
              <span role="status">{sourcePort ? `Saída de ${sourcePort.label} selecionada. Escolha a entrada em outro objeto.` : "Escolha a porta de saída no desenho."}</span>
            </> : <button onClick={startDrawing} disabled={project.components.length < 2 || (project.connections?.length ?? 0) >= 100}>Desenhar ligação</button>}
          </div>}
          <div
            ref={host}
            className={`canvas-scroll ${editing ? "editing" : "operating"}`}
          >
            <div className="drawing-surface">
            <canvas
              ref={canvasElement}
              aria-label="Área de desenho da tela HMI"
            />
            {drawingActive && drawing && <PortOverlay session={drawing} source={sourcePort} selectSource={setSourcePort}
              kind={lineKind} finish={finishDrawing} cancel={() => setDrawing(null)} />}
            </div>
          </div>
          <div className="canvas-controls">
            <label>
              <input
                type="checkbox"
                checked={snap}
                disabled={!editing}
                onChange={(e) => setSnap(e.target.checked)}
              />{" "}
              Ajustar à grade de 20 px
            </label>
            <label>
              Zoom{" "}
              <select
                aria-label="Zoom"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              >
                {[...new Set([25, 50, 75, 100, zoom])]
                  .sort((a, b) => a - b)
                  .map((value) => (
                    <option key={value} value={value}>
                      {value}%
                    </option>
                  ))}
              </select>
            </label>
            <button onClick={fit}>Ajustar</button>
          </div>
          <div className="editor-hint">
            {editing
              ? "Shift + clique para selecionar vários objetos, ou arraste uma área vazia. A seleção múltipla permite mover e alinhar. Valores ilustrativos em edição."
              : "Operação • Tags de demonstração em leitura • Comandos apenas nas tags próprias de simulação"}
          </div>
          {!editing && (
            <div className="runtime-readings" aria-label="Valores em operação">
              {project.components
                .filter((item) => item.binding)
                .map((item) => {
                  const value = valueFor(item.binding);
                  return (
                    <span key={item.id} data-testid={`runtime-${item.id}`}>
                      {item.label}:{" "}
                      <strong>
                        {value !== null
                          ? `${String(value)} ${unitFor(item.binding)}`
                          : "Indisponível"}
                      </strong>
                    </span>
                  );
                })}
            </div>
          )}
        </div>
        <aside className="properties" aria-label="Propriedades do componente">
          <h2>Propriedades</h2>
          {editing && <div className="selection-actions">
            <button disabled={!project.components.length} onClick={() => { setDrawing(null); activate(project.components.map(item => item.id)); }}>Selecionar todos</button>
            <button disabled={!selectedIds.length} onClick={() => activate([])}>Limpar seleção</button>
          </div>}
          {editing && selectedIds.length > 1 && <div className="multiple-properties">
            <p role="status">{selectedIds.length} objetos selecionados</p>
            <h3>Alinhamento e espaçamento</h3>
            <p className="property-note">Usa os limites da seleção, considerando a rotação. Distribuir exige ao menos três objetos.</p>
            <div className="alignment-actions">
              {(Object.keys(layoutLabels) as LayoutAction[]).map(action => <button key={action}
                disabled={action.startsWith("space") && selectedIds.length < 3}
                onClick={() => {
                  try { change(arrange(project, selectedIds, action)); setMessage(""); }
                  catch (error) { setMessage((error as Error).message); }
                }}>{layoutLabels[action]}</button>)}
            </div>
            <button className="delete-component" onClick={() => {
              change(removeComponents(project, selectedIds));
              setSelectedIds([]);
            }}>Excluir selecionados</button>
          </div>}
          {selected && editing ? (
            <>
              <div className="selected-type">
                {componentNames[selected.kind]}
              </div>
              <label>
                Identificação
                <input
                  key={`${selected.id}-${selected.label}`}
                  aria-label="Identificação"
                  defaultValue={selected.label}
                  maxLength={64}
                  onBlur={(e) => {
                    if (e.target.value !== selected.label)
                      patch({ label: e.target.value });
                  }}
                />
              </label>
              <div className="geometry-fields">
                {(["x", "y", "width", "height", "angle"] as const).map(
                  (field) => (
                    <label key={field}>
                      {
                        {
                          x: "X",
                          y: "Y",
                          width: "Largura",
                          height: "Altura",
                          angle: "Rotação",
                        }[field]
                      }
                      <input
                        key={`${selected.id}-${selected[field]}`}
                        aria-label={
                          {
                            x: "X",
                            y: "Y",
                            width: "Largura",
                            height: "Altura",
                            angle: "Rotação",
                          }[field]
                        }
                        type="number"
                        defaultValue={selected[field]}
                        onBlur={(e) => {
                          if (
                            e.target.value !== "" &&
                            Number(e.target.value) !== selected[field]
                          )
                            patch({ [field]: Number(e.target.value) });
                        }}
                      />
                    </label>
                  ),
                )}
              </div>
              <label>
                Tag vinculada
                <select
                  aria-label="Tag vinculada"
                  value={selected.binding ?? ""}
                  disabled={selected.kind === "text"}
                  onChange={(e) =>
                    patch({
                      binding: (e.target.value ||
                        null) as HmiComponent["binding"],
                    })
                  }
                >
                  <option value="">Sem vínculo</option>
                  {availableBindings(selected.kind, project.variables).map((tag) => (
                    <option key={tag}>{tag}</option>
                  ))}
                </select>
              </label>
              <label>Cor do componente<input aria-label="Cor do componente" type="color" value={selected.color ?? "#318f9b"} onChange={e => patch({ color: e.target.value })} /></label>
              {(selected.kind === "tank" || selected.kind === "silo") && <div className="geometry-fields">
                <label>Escala mínima<input key={`min-${selected.id}-${selected.rangeMin}`} aria-label="Escala mínima" type="number" defaultValue={selected.rangeMin ?? 0} onBlur={e => patch({ rangeMin: Number(e.target.value), rangeMax: selected.rangeMax ?? 100 })} /></label>
                <label>Escala máxima<input key={`max-${selected.id}-${selected.rangeMax}`} aria-label="Escala máxima" type="number" defaultValue={selected.rangeMax ?? 100} onBlur={e => patch({ rangeMin: selected.rangeMin ?? 0, rangeMax: Number(e.target.value) })} /></label>
              </div>}
              <p className="property-note">
                {selected.kind === "tank"
                  ? "A tag controla o nível de 0 a 100%."
                  : selected.kind === "pump"
                    ? "A tag booleana controla o estado visual."
                    : selected.kind === "indicator"
                      ? "Exibe o valor e a unidade da tag."
                    : selected.kind === "button" ? "Em Operação, clique no botão para alternar a tag booleana de simulação."
                    : selected.kind === "setpoint" ? "Em Operação, clique para acessar o campo de valor da tag."
                    : "Vínculo opcional para estado ou leitura. Cores e dimensões são configuráveis."}
              </p>
              <h3>Ordem de exibição</h3>
              <div className="layer-actions">
                <button onClick={() => reorder(1)}>Para frente</button>
                <button onClick={() => reorder(-1)}>Para trás</button>
              </div>
              <button
                className="delete-component"
                onClick={() => {
                  change(removeComponents(project, [selected.id]));
                  setSelectedIds([]);
                }}
              >
                Excluir componente
              </button>
            </>
          ) : selectedIds.length <= 1 || !editing ? (
            <div className="empty-properties">
              {editing
                ? "Selecione um objeto na tela ou na lista para editar suas propriedades."
                : "Edição bloqueada durante a operação."}
            </div>
          ) : null}
        </aside>
      </div>
      {message && (
        <div className="editor-message" role="status">
          {message}
          <button aria-label="Fechar mensagem" onClick={() => setMessage("")}>
            ×
          </button>
        </div>
      )}
    </section>
  );
}
