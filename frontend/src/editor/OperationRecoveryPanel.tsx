import type { useOperationRecovery } from "./useOperationRecovery";

export function OperationRecoveryPanel({ recovery, busy, unit }: { recovery: ReturnType<typeof useOperationRecovery>; busy: boolean; unit: string }) {
  if (recovery.mode === "inactive") return null;
  return <section aria-label="Retomada da operação">
    <h3>Retomada da operação</h3>
    {recovery.mode === "reading" && <p role="status">Consultando operação salva…</p>}
    {recovery.mode === "working" && <p role="status">Validando a operação…</p>}
    {recovery.mode === "choice" && <>
      <p role="status">Operação salva encontrada</p>
      <p>Há um ponto de retomada neste navegador. Escolha como continuar.</p>
      {recovery.candidate && <p>Salvo em {new Date(recovery.candidate.savedAt).toLocaleString("pt-BR")} · {Object.keys(recovery.candidate.values).length} variáveis do processo</p>}
      {recovery.candidate && recovery.candidate.batch.mass > 0 && <p>Massa no forno {recovery.candidate.batch.mass.toLocaleString("pt-BR")} {unit} · Temperatura {recovery.candidate.batch.temperature} °C · Umidade {recovery.candidate.batch.moisture.toLocaleString("pt-BR")}%</p>}
      {recovery.candidate && <button disabled={busy} onClick={() => void recovery.resume()}>Retomar operação salva</button>}
      <button disabled={busy} onClick={() => void recovery.discard()}>Iniciar nova operação</button>
    </>}
    {recovery.mode === "active" && <p role="status">{recovery.saving ? "Gravando ponto de retomada…" : recovery.savedAt
      ? "Ponto de retomada salvo às " + new Date(recovery.savedAt).toLocaleTimeString("pt-BR")
      : "Preparando ponto de retomada…"}</p>}
    <p>A retomada conserva as leituras, o lote e suas curvas. A simulação fica pausada até você iniciá-la.</p>
    {recovery.message && <p role="alert">{recovery.message}</p>}
    {recovery.mode === "error" && <>
      <button onClick={recovery.reload}>Recarregar ponto salvo</button>
      <button onClick={recovery.continueWithoutSaving}>Continuar sem gravação</button>
    </>}
    {recovery.mode === "volatile" && <p role="alert">Operação sem gravação de retomada. Ao fechar, as alterações desta sessão podem ser perdidas.</p>}
  </section>;
}
