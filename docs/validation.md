# Relatório de validação — 06/11/2026

## Resultado atualizado

**Etapa 0 validada tecnicamente em Windows.** Backend iniciado pelo script Start-Backend.ps1, frontend iniciado e dados do simulador Java recebidos no navegador.

- Maven `clean test`: BUILD SUCCESS, 4 testes, zero falhas, erros ou testes ignorados.
- `/api/health` e `/api/tags`: HTTP 200, status UP e modo SIMULATION.
- Dois testes Playwright com backend real aprovados: atualização, navegação/F1, tela de 390 px e recuperação após interrupção do transporte WebSocket.
- O teste de reconexão encaminha mensagens do Java real e fecha a conexão ativa; não substitui as medições.
- A primeira versão desse teste fechava a conexão já descartada pelo React StrictMode. Foi corrigida para fechar a conexão ativa e passou. Não foi necessário alterar o código da aplicação.

## Frontend validado

- Instalação npm com lockfile: concluída; auditoria no momento da instalação reportou zero vulnerabilidades.
- TypeScript e build de produção Vite: aprovados.
- Vitest: 6 testes aprovados em 3 arquivos. Cobrem contrato, rejeição de dados inválidos, atualização do tanque, qualidade ruim, desconexão, navegação/F1, silêncio, reconexão e reinício da sequência.
- Playwright/Edge: 1 teste de interface com mensagens controladas aprovado. Verifica atualização, navegação, F1, perda de conexão e ausência de transbordamento horizontal em 390 px.
- Servidor Vite iniciado e HTTP 200 confirmado.

## Histórico do bloqueio — resolvido

- Maven/Java: dependências foram obtidas, mas a compilação falhou com `java.nio.file.AccessDeniedException` em `WindowsLinkSupport.getRealPath`, inclusive ao resolver o caminho de um JAR e limpar `backend/target`. Teste isolado com `Path.toRealPath` reproduziu a falha na leitura do próprio `pom.xml`.
- Duas solicitações adicionais de leitura foram concedidas, mas não removeram essa restrição do executor.
- A execução autorizada fora do ambiente restrito resolveu a falha. Os quatro testes Java passaram e o Spring Boot iniciou normalmente.
- Os dois testes Playwright com backend real (`supervision.spec.ts`) passaram.
- Nenhuma validação em CLPs físicos, rede local entre máquinas, Linux, carga ou ambiente de produção foi feita.

## Capturas

`screenshots/desktop-java-live.png` mostra a tela conectada ao simulador Java real.

`screenshots/desktop-test-data.png` e `screenshots/mobile-test-data.png` usam mensagens injetadas exclusivamente pelo teste Playwright. O código normal da aplicação não contém esse fallback. O indicador Conectado nessas capturas refere-se ao fluxo controlado do teste, não a um backend Java validado.

## Critério de pronto

**Critério técnico da Etapa 0 atendido:** backend e frontend iniciaram e o tanque recebeu os dados do simulador Java via WebSocket. Comandos e checklist de revisão estão no README. Não foi testado reinício manual do processo Java com navegador aberto: a reconexão foi verificada por interrupção do transporte, e sequência reiniciada por teste unitário. Nenhum avanço para equipamentos físicos foi feito.
