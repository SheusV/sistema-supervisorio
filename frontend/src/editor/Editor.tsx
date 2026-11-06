import { useEffect, useRef, useState, type Dispatch } from "react";
import { Canvas, Pattern } from "fabric";
import type { Snapshot } from "../tags/model";
import type { Connection } from "../tags/useTags";
import {
  bindings,
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
  history: ProjectHistory;
  dispatch: Dispatch<ProjectAction>;
  snapshot: Snapshot | null;
  connection: Connection;
  dirty: boolean;
  onDirty: (dirty: boolean) => void;
}
export default function Editor({
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(true);
  const [zoom, setZoom] = useState(70);
  const [snap, setSnap] = useState(true);
  const [message, setMessage] = useState("");
  const selected = project.components.find((item) => item.id === selectedId);
  const state = useRef({ project, editing, snap });
  state.current = { project, editing, snap };
  const change = (next: HmiProject) => {
    dispatch({ type: "change", project: next });
    onDirty(true);
  };
  const changeRef = useRef(change);
  changeRef.current = change;

  useEffect(() => {
    if (!canvasElement.current) return;
    const instance = new Canvas(canvasElement.current, {
      width: 840,
      height: 504,
      selection: false,
      preserveObjectStacking: true,
      backgroundColor: "#ffffff",
    });
    canvas.current = instance;
    const identify = (target: unknown) =>
      [...widgets.current].find(([, widget]) => widget.root === target)?.[0] ??
      null;
    instance.on("selection:created", (event) =>
      setSelectedId(identify(event.selected[0])),
    );
    instance.on("selection:updated", (event) =>
      setSelectedId(identify(event.selected[0])),
    );
    instance.on("selection:cleared", () => setSelectedId(null));
    instance.on("object:moving", ({ target }) => {
      if (!state.current.snap) return;
      target.set({
        left: Math.round(target.left / 20) * 20,
        top: Math.round(target.top / 20) * 20,
      });
    });
    instance.on("object:modified", ({ target }) => {
      if (!state.current.editing) return;
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

  useEffect(() => {
    const instance = canvas.current;
    if (!instance) return;
    const active = selectedId;
    const grid = document.createElement("canvas");
    grid.width = 20;
    grid.height = 20;
    const context = grid.getContext("2d")!;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 20, 20);
    context.fillStyle = "#c3ced8";
    context.fillRect(0, 0, 1.5, 1.5);
    instance.backgroundColor = editing
      ? new Pattern({ source: grid, repeat: "repeat" })
      : "#ffffff";
    instance.discardActiveObject();
    instance.remove(...instance.getObjects());
    widgets.current.clear();
    for (const item of project.components) {
      const widget = createWidget(item);
      widget.root.set({ selectable: editing, evented: editing });
      widget.update(null, editing);
      widgets.current.set(item.id, widget);
      instance.add(widget.root);
      if (editing && item.id === active) instance.setActiveObject(widget.root);
    }
    setSelectedId(
      editing && project.components.some((item) => item.id === active)
        ? active
        : null,
    );
    instance.requestRenderAll();
    // Selection changes do not rebuild the scene; document changes do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, editing]);

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
      const tag = snapshot?.tags.find((tag) => tag.name === item.binding);
      const value =
        connection === "live" && tag?.quality === "GOOD" ? tag.value : null;
      widgets.current.get(item.id)?.update(value, false);
    }
    canvas.current?.requestRenderAll();
  }, [snapshot, connection, editing, project]);

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

  function select(id: string) {
    if (!editing) return;
    setSelectedId(id);
    const object = widgets.current.get(id)?.root;
    if (object) {
      canvas.current?.setActiveObject(object);
      canvas.current?.requestRenderAll();
    }
  }
  function add(kind: ComponentKind) {
    if (!editing || project.components.length >= MAX_COMPONENTS) return;
    const item = createComponent(kind, project.components.length);
    setSelectedId(item.id);
    change({ ...project, components: [...project.components, item] });
  }
  function patch(values: Partial<HmiComponent>) {
    if (!editing || !selected) return;
    try {
      const next = parseProject(
        JSON.stringify({
          ...project,
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
      setSelectedId(null);
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
            {dirty ? "Alterações não exportadas" : "Arquivo exportado"}
          </span>
          <button
            disabled={!editing}
            onClick={() => {
              change({ ...project, name: "Nova tela", components: [] });
              setSelectedId(null);
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
          <button className="primary-action" onClick={save}>
            Salvar projeto
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
      <div className="editor-layout">
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
                  aria-pressed={selectedId === item.id}
                  onClick={() => select(item.id)}
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
            <span>{project.name}</span>
            <span>1200 × 720 px</span>
          </div>
          <div
            ref={host}
            className={`canvas-scroll ${editing ? "editing" : "operating"}`}
          >
            <canvas
              ref={canvasElement}
              aria-label="Área de desenho da tela HMI"
            />
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
              ? "Arraste para mover. Use as alças para redimensionar e girar. Valores ilustrativos no modo edição."
              : "Operação • Somente leitura • Valores do simulador em tempo real"}
          </div>
          {!editing && (
            <div className="runtime-readings" aria-label="Valores em operação">
              {project.components
                .filter((item) => item.binding)
                .map((item) => {
                  const tag = snapshot?.tags.find(
                    (tag) => tag.name === item.binding,
                  );
                  const valid =
                    connection === "live" && tag?.quality === "GOOD";
                  return (
                    <span key={item.id} data-testid={`runtime-${item.id}`}>
                      {item.label}:{" "}
                      <strong>
                        {valid
                          ? `${String(tag.value)} ${tag.unit}`
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
                  {bindings[selected.kind].map((tag) => (
                    <option key={tag}>{tag}</option>
                  ))}
                </select>
              </label>
              <p className="property-note">
                {selected.kind === "tank"
                  ? "A tag controla o nível de 0 a 100%."
                  : selected.kind === "pump"
                    ? "A tag booleana controla o estado visual."
                    : selected.kind === "indicator"
                      ? "Exibe o valor e a unidade da tag."
                      : "Texto fixo da tela."}
              </p>
              <h3>Ordem de exibição</h3>
              <div className="layer-actions">
                <button onClick={() => reorder(1)}>Para frente</button>
                <button onClick={() => reorder(-1)}>Para trás</button>
              </div>
              <button
                className="delete-component"
                onClick={() => {
                  change({
                    ...project,
                    components: project.components.filter(
                      (item) => item.id !== selected.id,
                    ),
                  });
                  setSelectedId(null);
                }}
              >
                Excluir componente
              </button>
            </>
          ) : (
            <div className="empty-properties">
              {editing
                ? "Selecione um objeto na tela ou na lista para editar suas propriedades."
                : "Edição bloqueada durante a operação."}
            </div>
          )}
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
