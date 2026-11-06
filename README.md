# NEXO — Supervisão e engenharia de telas

Plataforma SCADA/HMI local com backend Java e interface web. A versão **0.2.0** acrescenta o editor de telas ao circuito de simulação validado na versão 0.1.0.

## Recursos disponíveis

- Supervisão de nível, bomba e temperatura, com atualizações por WebSocket.
- Editor com tanque, bomba, indicador e texto.
- Posicionamento livre, ajuste à grade, dimensões, rotação e ordem de exibição.
- Vínculos com tags compatíveis e modos separados de Edição e Operação.
- Desfazer/refazer até 60 alterações, exportação e abertura de projetos JSON.
- Lista de tags com qualidade, origem e timestamps; reconexão automática.
- Ajuda local pelo menu ou pela tecla F1.

Todos os dados são **simulados**. O sistema não se conecta a equipamentos físicos e não possui comandos industriais de escrita.

## Requisitos

- JDK 21 e Maven 3.9.11 ou superior.
- Node.js 24 LTS com npm.
- Microsoft Edge para executar a suíte de testes de navegador no Windows.

Versões do frontend e dependências estão fixadas em `frontend/package.json` e `frontend/package-lock.json`. Spring Boot 4.1.2 gerencia as dependências Java. O editor usa Fabric.js 7.4.0, carregado somente ao abrir a página Editor.

## Executar no Windows

Abra dois terminais PowerShell na pasta do projeto.

**Terminal 1 — servidor:**

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Start-Backend.ps1
```

**Terminal 2 — interface:**

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Start-Frontend.ps1
```

Abra **http://127.0.0.1:5173**. O backend atende em 127.0.0.1:8080. Os scripts usam ferramentas instaladas; se disponíveis, também reconhecem as ferramentas portáteis locais em `.tools/`. Essa pasta não integra o repositório. A opção de execução do PowerShell vale apenas para o processo, sem alterar a política global.

Alternativa com ferramentas no PATH:

```powershell
# Terminal 1, a partir da pasta do projeto
Set-Location backend
mvn.cmd spring-boot:run
```

```powershell
# Terminal 2, a partir da pasta do projeto
Set-Location frontend
npm.cmd ci
npm.cmd run dev
```

Interrompa cada processo com Ctrl+C. Esses servidores de desenvolvimento escutam somente no computador local.

## Publicação da demonstração

O pacote de hospedagem reúne interface e Java em um único serviço. `Dockerfile` e `render.yaml` preparam a demonstração pública no Render, com atualizações automáticas a partir da branch main após conectar o GitHub. Publicado e verificado em https://nexo-scada-demo.onrender.com em 06/11/2026. Opção de atualização automática habilitada, mas o envio de verificação não gerou deploy. A ligação do GitHub ao Render ainda precisa ser conferida no painel autenticado.

Veja o [guia de publicação](docs/deployment.md) para configurar a conta, gerar o pacote e entender os limites do plano gratuito. A demonstração usa apenas dados simulados; autenticação e uso com dados reais serão etapas posteriores.

## Usar o editor

1. Abra **Editor** e mantenha o modo **Edição**.
2. Insira um componente pela biblioteca ou selecione um dos objetos do exemplo.
3. Arraste para mover. Use as alças para redimensionar e girar; valores exatos também podem ser informados no painel Propriedades.
4. Selecione a tag vinculada. Tanques aceitam nível; bombas aceitam estado booleano; indicadores aceitam nível ou temperatura.
5. Use **Operação** para visualizar os valores recebidos do servidor. As alterações ficam bloqueadas nesse modo.
6. Use **Salvar projeto** para exportar o JSON. **Abrir JSON** recupera componentes, geometria, ordem e vínculos. **Nova tela** abre uma tela vazia; Desfazer recupera a anterior.

As alterações são mantidas ao navegar entre as páginas, mas não são gravadas automaticamente no servidor ou no navegador. Antes de recarregar ou fechar, exporte o arquivo. A tela fixa de Supervisão é independente do projeto aberto no editor.

O arquivo `examples/water-tank/project.json` pode ser aberto diretamente no editor. Importação de imagens e SVG, grupos e alinhamento múltiplo ainda não estão disponíveis.

## Testes

A partir da pasta do projeto, backend:

```powershell
mvn.cmd -f backend/pom.xml clean test
```

Frontend:

```powershell
Set-Location frontend
npm.cmd ci
npm.cmd test
npm.cmd run build
```

Com os dois servidores iniciados, execute os testes de navegador a partir de `frontend`:

```powershell
npm.cmd run test:e2e
```

Alternativa local quando npm não está no PATH, a partir de `frontend`:

```powershell
node ..\.tools\package\bin\npm-cli.js test
node ..\.tools\package\bin\npm-cli.js run build
node node_modules/@playwright/test/cli.js test
```

O contrato, os componentes e o histórico são testados com Vitest. Playwright verifica as telas com dados controlados e com o simulador Java. Veja o [relatório de validação](docs/validation.md) e as [regras de segurança](SECURITY.md).

## Estrutura

```text
backend/          Java 21, REST, WebSocket e simulador
frontend/src/
  components/     Sinótico de supervisão
  editor/         Modelo de projeto, histórico, widgets e interface Fabric.js
  tags/           Contrato de tags, validação e reconexão
  test/           Dados e preparação de testes
frontend/e2e/     Testes de navegador
examples/         Projetos JSON importáveis
docs/             Arquitetura, contratos, decisões e validação
infrastructure/   Orientações de implantação
scripts/          Inicialização no Windows
```

O código completo também está reunido em `docs/CODIGO_COMPLETO.md`; os arquivos individuais são a fonte editável. Nenhuma fonte tipográfica ou imagem externa é necessária para operar a interface.

## Contrato e comportamento

- `GET /api/health`: saúde e modo do serviço de simulação, versão de backend 0.1.0.
- `GET /api/tags` e `WS /ws/tags`: snapshots versionados de três tags.
- `TQ001.LEVEL`: nível percentual. O ciclo enche até 85% e drena até 20%.
- `P001.RUNNING`: estado da bomba simulada.
- `TQ001.TEMPERATURE`: temperatura entre 22 e 28 °C.

O ciclo é demonstrativo, não um modelo físico calibrado. Após perda de conexão ou silêncio prolongado, as medições ficam indisponíveis. A interface tenta reconectar automaticamente. O editor usa dados ilustrativos somente em Edição, identificados como prévia; Operação depende das tags do servidor.

## Próximos incrementos

Importação segura de imagens, agrupamento e alinhamento, persistência PostgreSQL/Flyway, autenticação e perfis, histórico/alarmes e laboratório de controle. Drivers industriais permanecem em uma fase separada. Consulte o [roadmap](docs/roadmap.md).

## Diagnóstico

- **Sem conexão:** confira o terminal Java e `http://127.0.0.1:8080/api/health`.
- **Porta ocupada:** encerre a instância anterior. O frontend não troca silenciosamente de porta.
- **Java incompatível:** confira `JAVA_HOME` e `mvn.cmd -version`; use JDK 21.
- **Acesso negado ao compilar:** execute em um PowerShell normal da sua conta e confira as permissões da pasta; não desative proteções globais.
- **Projeto rejeitado:** confira o formato documentado em `docs/editor.md`. A tela atual é preservada quando o arquivo é inválido.

No Linux, use JDK 21, Maven e Node 24: `mvn spring-boot:run` em `backend` e `npm ci` seguido de `npm run dev` em `frontend`. A validação desta versão foi realizada no Windows.
