import { useEffect, useState } from "react";
import { useTags } from "./tags/useTags";
import { Process } from "./components/Process";
import type { TagName } from "./tags/model";

const labels = {
  connecting: "Conectando",
  live: "Conectado",
  offline: "Sem conexão",
  stale: "Dados desatualizados",
};
export function App() {
  const [page, setPage] = useState("Supervisão");
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
          {["Supervisão", "Tags", "Ajuda"].map((item, i) => (
            <button
              key={item}
              aria-current={page === item ? "page" : undefined}
              onClick={() => setPage(item)}
            >
              <span aria-hidden="true">{["▦", "≋", "?"][i]}</span>
              {item}
            </button>
          ))}
        </nav>
        <div className="future">
          <span>PRÓXIMAS ETAPAS</span>
          <p>Editor visual</p>
          <p>Alarmes e histórico</p>
          <p>Laboratório PID</p>
        </div>
        <div className="sidebar-footer">
          <span className="small-dot" /> Ambiente local{" "}
          <small>Etapa 0 · v0.1.0</small>
        </div>
      </aside>
      <div className="main">
        <header>
          <span>
            Projetos <span className="slash">/</span>{" "}
            <strong>Tanque TQ-001</strong>
          </span>
          <span className="simulation">◉ SIMULAÇÃO</span>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">PROJETO DE DEMONSTRAÇÃO</div>
              <h1>
                {page === "Supervisão" ? "Visão geral do processo" : page}
              </h1>
              <p>
                Tanque TQ-001 <span className="separator">•</span>{" "}
                {page === "Supervisão"
                  ? "Acompanhamento em tempo real"
                  : "Ambiente de desenvolvimento local"}
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
                : "Aguardando dados do backend Java em localhost:8080."}
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
                  <strong>Um ambiente seguro para explorar.</strong> Todos os
                  valores são gerados pelo simulador. Nenhum equipamento físico
                  está conectado.
                </p>
                <button onClick={() => setPage("Ajuda")}>
                  Conhecer o projeto →
                </button>
              </div>
            </>
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
                Esta é a Etapa 0: uma tela de operação conectada a um simulador
                Java. A ajuda está incluída no aplicativo e não depende de
                serviços externos.
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
                Editor com Fabric.js, persistência PostgreSQL/Flyway,
                autenticação e perfis, drivers de leitura, alarmes e laboratório
                de controle serão entregas separadas. Não há comandos para
                dispositivos físicos nesta versão.
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
