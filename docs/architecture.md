# Arquitetura — incremento 0

Atualização 0.2.0: o módulo `frontend/src/editor` acrescenta um documento HMI versionado, histórico local e representação Fabric.js. Consulte [o contrato do editor](editor.md). O backend e o contrato de tags descritos abaixo permanecem inalterados.

O sistema é desenvolvido em incrementos locais, com contratos versionados e separação entre engenharia de telas e operação.

## Fluxo de dados

```text
TankSimulator (Java, memória)
  → TagSnapshot / TagValue (contrato independente de protocolo)
  → REST /api/tags + WebSocket /ws/tags
  → proxy Vite no desenvolvimento
  → useTags (validação, reconexão e detecção de silêncio)
  → React → tanque, bomba e temperatura
```

Monólito modular por pacotes, sem serviços distribuídos. `simulation` produz as amostras, `tag` define o contrato e `api` publica os dados. Não há interface de escrita nem conexão com equipamentos. A futura abstração de drivers deverá produzir o mesmo contrato, acrescentando origens reais explicitamente, sem acoplar componentes a OPC UA/Modbus/MQTT.

O simulador é determinístico por passo, avança a cada segundo, enche até 85% e drena até 20%. A temperatura segue uma senoide entre 22 e 28 °C. Não é modelo físico nem PID. Reiniciar o backend reinicia o ciclo e a sequência.

O WebSocket envia um snapshot inicial e snapshots completos subsequentes. Uma nova conexão aceita uma sequência reiniciada; na mesma conexão, mensagens repetidas/fora de ordem são ignoradas. Após mais de 5 segundos sem avanço, o frontend invalida a exibição e tenta reconectar com intervalo de 1, 2, 4, 8 e no máximo 10 segundos. Qualidade diferente de GOOD não aparece como medição válida. A tela nunca usa zero como substituto visual de uma medição indisponível: exibe “—” e interrompe a animação da bomba.

O transporte limita o buffer de envio por cliente a 64 KiB e o tempo de envio a 2 segundos com o decorador Spring. Ainda não foram realizados testes de carga; não há promessa de capacidade industrial ou isolamento completo de clientes lentos. O agendamento e a publicação são simples para esta etapa.

## Contrato v1

- `GET /api/health`: `{ "status": "UP", "mode": "SIMULATION", "version": "0.1.0" }`.
- `GET /api/tags`: mesmo snapshot do WebSocket.
- `WS /ws/tags`: apenas servidor → navegador; enviar texto fecha a conexão por violação da política.
- POST em `/api/tags` retorna 405. Nenhum endpoint de escrita é definido.

Snapshot: `schemaVersion` (1), `sequence` (inteiro crescente por inicialização), `tags` (lista).

Cada tag: `name`, `dataType` (DOUBLE/BOOLEAN), `value`, `unit`, `quality` (GOOD/BAD/UNCERTAIN/STALE), `sourceTimestamp` e `serverTimestamp` em ISO-8601 UTC, `source` (SIMULATED) e `writable` (false).

| Nome | Tipo | Unidade | Faixa da demonstração |
| --- | --- | --- | --- |
| TQ001.LEVEL | DOUBLE | % | 0–100; ciclo nominal 20–85 |
| P001.RUNNING | BOOLEAN | — | true / false |
| TQ001.TEMPERATURE | DOUBLE | °C | 22–28 |

As duas marcas de tempo são iguais porque o backend é também a fonte. No frontend, “STALE” em Tags durante uma desconexão é uma qualidade efetiva da exibição, não uma alteração da última mensagem recebida.

## Segurança e limites atuais

Somente loopback por padrão. REST usa a mesma origem pelo proxy, sem CORS liberado globalmente. WebSocket aceita apenas localhost:5173 e 127.0.0.1:5173. Verificação de origem não substitui autenticação. Autenticação, RBAC, TLS, auditoria durável e gestão de segredos ainda não existem; devem anteceder uso compartilhado.

SVG do sinótico é código próprio estático. Não há upload, importação de SVG, expressões livres, eval ou execução de plugins. A sanitização de arquivos será requisito do editor, não uma promessa desta implementação.

SCADA não substitui intertravamentos, segurança ou controle determinístico de CLPs. Escrita física permanece fora do escopo até fase específica aprovada e validada.
