import { lazy, Suspense, useEffect, useReducer, useState } from "react";
import { useTheme } from "./useTheme";
import { useTags } from "./tags/useTags";
import { Process } from "./components/Process";
import type { TagName } from "./tags/model";
import { exampleProject, projectReducer } from "./editor/project";
const Editor = lazy(() => import("./editor/Editor"));

const labels = {
  connecting: "Conectando",
  live: "Conectado",
  offline: "Sem conexão",
  stale: "Dados desatualizados",
};
export function App() {
  const { theme, dark, choose } = useTheme();
  const [page, setPage] = useState("Supervisão");
  const [editorHistory, editorDispatch] = useReducer(
    projectReducer,
    undefined,
    () => ({ past: [], present: exampleProject(), future: [] }),
  );
  const [editorDirty, setEditorDirty] = useState(true);
  useEffect(() => {
    if (!editorHistory.past.length || !editorDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editorHistory, editorDirty]);
  const { snapshot, connection } = useTags();
  useEffect(() => {
    const help = (e: KeyboardEvent) => {
      if (e.key === "F1") {
        e.preventDefault();
        setPage("Ajuda");
      }
    };
    window.addEventListener("keydown", help);
    return () => window.removeEventListener("keydown", help);
  }, []);
  function value(name: TagName) {
    const tag = snapshot?.tags.find((t) => t.name === name);
    return connection === "live" && tag?.quality === "GOOD" ? tag.value : null;
  }
  const level = value("TQ001.LEVEL") as number | null;
  const running = value("P001.RUNNING") as boolean | null;
  const temperature = value("TQ001.TEMPERATURE") as number | null;
  return (
    <div className="shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("Supervisão");
          }}
        >
          <span className="brand-icon">◈</span> NEXO
          <span className="brand-sub">SCADA PLATFORM</span>
        </a>
        <div className="workspace-label">ÁREA DE TRABALHO</div>
        <nav aria-label="Navegação principal">
          {["Supervisão", "Editor", "Tags", "Ajuda"].map((item, i) => (
            <button
              key={item}
              aria-current={page === item ? "page" : undefined}
              onClick={() => setPage(item)}
            >
              <span aria-hidden="true">{["▦", "⊞", "≋", "?"][i]}</span>
              {item}
            </button>
          ))}
        </nav>
        <div className="future">
          <span>PRÓXIMAS ETAPAS</span>
          <p>Alarmes e histórico</p>
          <p>Laboratório PID</p>
        </div>
        <div className="sidebar-footer">
            <span className="small-dot" /> Ambiente simulado{" "}
            <small>v0.8.1 · Engenharia</small>
        </div>
      </aside>
      <div className="main">
        <header>
          <span>
            Projetos <span className="slash">/</span>{" "}
            <strong>{page === "Editor" ? editorHistory.present.name : "Tanque TQ-001"}</strong>
          </span>
          <div className="header-actions">
            <label>Tema <select value={theme} onChange={event => choose(event.target.value as typeof theme)}>
              <option value="system">Sistema</option><option value="light">Claro</option><option value="dark">Escuro</option>
            </select></label>
            <span className="simulation">◉ SIMULAÇÃO</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">UNIDADE DE PROCESSO / 01</div>
              <h1>
                {page === "Supervisão"
                  ? "Visão geral do processo"
                  : page === "Editor"
                    ? "Editor de telas"
                    : page}
              </h1>
              <p>
                {page === "Editor" ? editorHistory.present.name : "Tanque TQ-001"} <span className="separator">•</span>{" "}
                {page === "Supervisão"
                  ? "Acompanhamento em tempo real"
                  : page === "Editor"
                    ? "Composição e configuração de sinóticos"
                    : "Configuração do projeto"}
              </p>
            </div>
            <span role="status" className={`connection ${connection}`}>
              <i />
              {labels[connection]}
            </span>
          </div>
          {connection !== "live" && (
            <div className="notice" role="alert">
              {snapshot
                ? "Atualizações interrompidas. Valores indisponíveis até a reconexão automática."
                : "Aguardando conexão com o servidor de dados."}
            </div>
          )}
          {page === "Supervisão" && (
            <>
              <section className="metrics" aria-label="Indicadores do processo">
                <article>
                  <span className="metric-icon">▤</span>
                  <div className="metric-label">Nível do tanque</div>
                  <div className="metric-value" data-testid="level-value">
                    {level === null ? "—" : level.toFixed(1)} <small>%</small>
                  </div>
                  <div className="metric-foot">
                    TQ001.LEVEL <span>0–100 %</span>
                  </div>
                </article>
                <article>
                  <span className="metric-icon warm">♨</span>
                  <div className="metric-label">Temperatura</div>
                  <div className="metric-value">
                    {temperature === null ? "—" : temperature.toFixed(1)}{" "}
                    <small>°C</small>
                  </div>
                  <div className="metric-foot">
                    TQ001.TEMPERATURE <span>Simulada</span>
                  </div>
                </article>
                <article>
                  <span className="metric-icon">◉</span>
                  <div className="metric-label">Bomba de alimentação</div>
                  <div className={`pump-value ${running ? "active" : ""}`}>
                    {running === null
                      ? "Indisponível"
                      : running
                        ? "Em operação"
                        : "Parada"}
                  </div>
                  <div className="metric-foot">
                    P001.RUNNING <span>Somente leitura</span>
                  </div>
                </article>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Sinótico do processo</h2>
                    <p>Circuito de alimentação e armazenamento</p>
                  </div>
                  <span className="pill">MODO OPERAÇÃO</span>
                </div>
                <Process
                  level={level}
                  running={running}
                  temperature={temperature}
                />
                <div className="panel-footer">
                  <span>
                    <i className="legend-dot" /> Fluido simulado{" "}
                    <span className="separator">·</span> Atualização a cada 1 s
                  </span>
                  <span>3 tags vinculadas</span>
                </div>
              </section>
              <div className="info-strip">
                <span>ⓘ</span>
                <p>
                  <strong>Origem dos dados: simulador local.</strong> Ciclo de
                  enchimento e descarga com atualização a cada segundo.
                </p>
                <button onClick={() => setPage("Ajuda")}>
                  Ajuda de operação
                </button>
              </div>
            </>
          )}
          {page === "Editor" && (
            <Suspense fallback={<p>Carregando editor…</p>}>
              <Editor
                dark={dark}
                history={editorHistory}
                dispatch={editorDispatch}
                snapshot={snapshot}
                connection={connection}
                dirty={editorDirty}
                onDirty={setEditorDirty}
              />
            </Suspense>
          )}
          {page === "Tags" && (
            <section className="panel tag-panel">
              <h2>Tags do simulador</h2>
              <p>Contrato independente de protocolo · somente leitura</p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Tag</th>
                      <th>Tipo</th>
                      <th>Valor</th>
                      <th>Qualidade</th>
                      <th>Origem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot?.tags.map((tag) => (
                      <tr key={tag.name}>
                        <td>{tag.name}</td>
                        <td>{tag.dataType}</td>
                        <td>
                          {value(tag.name) === null ? "—" : String(tag.value)}{" "}
                          {tag.unit}
                        </td>
                        <td>{connection === "live" ? tag.quality : "STALE"}</td>
                        <td>SIMULATED</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!snapshot && <p>Aguardando primeiro conjunto de tags.</p>}
            </section>
          )}
          {page === "Ajuda" && (
            <section className="panel help">
              <h2>Primeiros passos</h2>
              <p>
                Use Supervisão para acompanhar o processo e Editor para compor
                telas. A ajuda está disponível localmente, sem serviços
                externos.
              </p>
              <h3>Como funciona o tanque?</h3>
              <p>
                A bomba enche o tanque até 85%. Ela para e o nível diminui até
                20%, quando o ciclo recomeça. A temperatura oscila entre 22 e 28
                °C. Este ciclo é ilustrativo, não um modelo físico validado.
              </p>
              <h3>Como verificar a comunicação?</h3>
              <p>
                O indicador “Conectado” confirma o recebimento das tags por
                WebSocket. Pare o backend: os indicadores devem ficar
                indisponíveis. Reinicie-o: a reconexão é automática, com
                tentativas a cada 1 a 10 segundos.
              </p>
              <h3>O que vem depois?</h3>
              <p>
                Persistência de projetos no servidor, autenticação e perfis,
                drivers de leitura, alarmes e laboratório de controle serão
                entregas separadas. Não há comandos para dispositivos físicos
                nesta versão.
              </p>
              <h3>Como montar uma tela?</h3>
              <p>
                No Editor, insira tanques, bombas, indicadores e textos. Arraste
                para posicionar e use as alças para redimensionar ou girar.
                Selecione a tag no painel Propriedades. Edição usa valores
                ilustrativos; Operação usa as tags do simulador e bloqueia
                alterações.
              </p>
              <h3>Como organizar vários objetos?</h3>
              <p>
                Use Shift + clique para selecionar vários objetos na tela ou
                na lista. Também é possível arrastar uma área vazia ou usar
                Selecionar todos. Arraste o conjunto para mover; no painel
                Propriedades, alinhe pelas bordas ou centros. Com três objetos
                ou mais, distribua os espaços. Desfazer recupera a ação inteira.
              </p>
              <h3>Como ligar equipamentos e definir valores?</h3>
              <p>
                Abra Tags do projeto para criar variáveis BOOLEAN ou DOUBLE,
                com valor inicial e faixa permitida. Vincule os objetos pelo
                painel Propriedades. Em Ligações, escolha equipamentos e portas
                para criar tubulações ou sinais; uma tag booleana pode indicar
                seu estado. Exemplo de processo carrega uma linha pronta.
              </p>
              <p>
                Em Operação, botões alternam tags próprias e entradas numéricas
                acessam os campos de valor. Os comandos são validados pelo Java
                e não afetam outras abas. Voltar à edição ou sair do editor
                reinicia a simulação. Em Simulação automática, configure uma
                regra de nível com entrada acionada e saída contínua. Inicie
                ou pause em Operação. O Java calcula um segundo por ciclo,
                respeitando a faixa da tag. Tubulações não calculam pressão
                ou vazão: o comportamento vem da regra explícita.
              </p>
              <h3>Como salvar e recuperar o projeto?</h3>
              <p>
                Em Projetos salvos, você pode guardar e reabrir telas neste navegador. Exportar JSON baixa uma cópia. Abrir JSON recupera a
                tela, as dimensões e os vínculos. Salve as alterações antes
                de fechar ou recarregar a página. Desfazer e Refazer mantêm até 60 alterações. A
                importação aceita apenas o formato de projeto documentado.
              </p>
              <h3>Atalho de ajuda</h3>
              <p>
                Pressione <kbd>F1</kbd> em qualquer tela para abrir esta página.
              </p>
            </section>
          )}
          <footer>
            SCADA / HMI{" "}
            <span>Somente simulação · Sem comandos industriais</span>
            <time>
              {snapshot
                ? `Última amostra: ${new Date(snapshot.tags[0].serverTimestamp).toLocaleTimeString("pt-BR")}`
                : "Nenhuma amostra recebida"}
            </time>
          </footer>
        </main>
      </div>
    </div>
  );
}
