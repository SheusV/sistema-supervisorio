# NEXO — SCADA/HMI · Etapa 0

Primeiro incremento de um supervisório modular com **backend Java 21 + Spring Boot 4.1.2** e **frontend React + TypeScript + Vite**. “NEXO” é apenas o nome provisório da interface.

**Estado desta entrega:** Etapa 0 validada tecnicamente em Windows. Backend compilado, quatro testes Java aprovados, frontend compilado, seis testes unitários aprovados e três testes de navegador aprovados (dois com backend real). O tanque recebeu dados do simulador Java e recuperou o fluxo após interrupção de transporte. O bloqueio inicial foi resolvido com execução autorizada fora do ambiente restrito. Veja [o relatório de validação](docs/validation.md).

## O que está implementado

- Backend com `GET /api/health`, `GET /api/tags` e WebSocket `/ws/tags`.
- Simulador em memória: `TQ001.LEVEL`, `P001.RUNNING` e `TQ001.TEMPERATURE`.
- Sinótico com tanque animado, bomba e indicador de temperatura, atualizado sem recarregar.
- Navegação entre Supervisão, Tags e Ajuda; ajuda offline por F1.
- Marcação permanente **SIMULAÇÃO**, dados somente de leitura, qualidade e timestamps.
- Reconexão automática com espera progressiva; valores indisponíveis após desconexão ou silêncio superior a 5 segundos.
- Testes Java, testes React/contrato/reconexão e testes de navegador separados para dados controlados e backend real.

## Instalação

Instale [JDK 21](https://adoptium.net/temurin/releases/?version=21), [Maven 3.9.11 ou superior](https://maven.apache.org/download.cgi) e [Node.js 24 LTS](https://nodejs.org/en/download). Maven precisa estar no PATH; `JAVA_HOME` deve apontar para a pasta do JDK, não sua pasta `bin`.

Confira no PowerShell:

```powershell
java -version
mvn.cmd -version
node --version
npm.cmd --version
```

Para esta sessão foram baixados JDK 21.0.13+9, Maven 3.9.11 e npm em `.tools/`, sem instalação global. Os scripts abaixo usam essas cópias se as ferramentas não estiverem disponíveis globalmente. `.tools/` é local, ignorada pelo Git e não faz parte do código distribuído. Node continua sendo necessário no PATH.

## Executar no Windows

Abra **dois terminais PowerShell**, fora do ambiente restrito do assistente caso encontre a mesma falha de caminhos.

Terminal 1 — backend:

```powershell
Set-Location 'C:\Users\Sheus\Documents\ChatGPT\Sistema Supervisorio'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Start-Backend.ps1
```

Terminal 2 — frontend:

```powershell
Set-Location 'C:\Users\Sheus\Documents\ChatGPT\Sistema Supervisorio'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Start-Frontend.ps1
```

`ExecutionPolicy Bypass` vale apenas para esse processo; não altera a política global. O script do frontend instala as dependências do lockfile quando `node_modules` não existe. Interrompa cada servidor com `Ctrl+C`.

Abra **http://127.0.0.1:5173**. O Vite encaminha `/api` e `/ws` para Java em 127.0.0.1:8080. O navegador só recebe valores de medição pelo backend; não existe simulador de fallback escondido no frontend.

Alternativa com ferramentas instaladas, comandos padrão:

```powershell
# Terminal 1
Set-Location 'C:\Users\Sheus\Documents\ChatGPT\Sistema Supervisorio\backend'
mvn.cmd spring-boot:run

# Terminal 2
Set-Location 'C:\Users\Sheus\Documents\ChatGPT\Sistema Supervisorio\frontend'
npm.cmd ci
npm.cmd run dev
```

## Testar no Windows

Backend, com ferramentas instaladas (não precisa de servidor já iniciado):

```powershell
Set-Location 'C:\Users\Sheus\Documents\ChatGPT\Sistema Supervisorio\backend'
mvn.cmd clean test
mvn.cmd package
```

Alternativa usando as ferramentas portáteis baixadas nesta sessão:

```powershell
Set-Location 'C:\Users\Sheus\Documents\ChatGPT\Sistema Supervisorio'
$env:JAVA_HOME = (Resolve-Path '.tools\jdk-21.0.13+9').Path
& '.\.tools\apache-maven-3.9.11\bin\mvn.cmd' -B -ntp -f backend/pom.xml '-Dmaven.repo.local=.tools/m2' clean test
```

Frontend, com npm instalado:

```powershell
Set-Location 'C:\Users\Sheus\Documents\ChatGPT\Sistema Supervisorio\frontend'
npm.cmd ci
npm.cmd test
npm.cmd run build
```

Alternativa desta sessão, a partir de `frontend`:

```powershell
node ..\.tools\package\bin\npm-cli.js test
node ..\.tools\package\bin\npm-cli.js run build
```

Testes de navegador usam Microsoft Edge instalado. Com o frontend iniciado:

```powershell
# Interface com dados de teste controlados; NÃO valida o backend
node node_modules/@playwright/test/cli.js test e2e/interface.spec.ts

# Ponta a ponta: exige backend E frontend iniciados
node node_modules/@playwright/test/cli.js test e2e/supervision.spec.ts
```

A captura `docs/screenshots/desktop-java-live.png` mostra o simulador Java real. As capturas terminadas em `test-data.png` usam dados controlados. `npm.cmd run test:e2e` executa ambos os arquivos e também exige os dois servidores.

Verificação manual de saúde:

```powershell
Invoke-RestMethod 'http://127.0.0.1:8080/api/health'
Invoke-RestMethod 'http://127.0.0.1:8080/api/tags' | ConvertTo-Json -Depth 6
```

## Estrutura

```text
backend/
  pom.xml
  src/main/java/br/com/scada/
    ScadaApplication.java
    api/           # REST, WebSocket, origens permitidas
    tag/           # contrato tipado e snapshot versionado
    simulation/    # ciclo demonstrativo do tanque
  src/main/resources/application.properties
  src/test/java/br/com/scada/
frontend/
  src/App.tsx      # navegação e telas iniciais
  src/components/ # sinótico SVG próprio
  src/tags/       # contrato, validação e reconexão
  src/test/       # preparação e dados dos testes
  e2e/            # testes com e sem backend
  package.json / package-lock.json
docs/
  architecture.md / roadmap.md / validation.md
  adr/0001-stack.md
  screenshots/    # capturas identificadas como dados de teste
  CODIGO_COMPLETO.md # cópia integral dos arquivos autorais para revisão
examples/water-tank/project.json
infrastructure/README.md
scripts/Start-Backend.ps1 / Start-Frontend.ps1
```

O JSON de exemplo descreve os vínculos da tela fixa; ainda não existe importação de projetos ou editor. O código-fonte completo está nos arquivos e reunido em `docs/CODIGO_COMPLETO.md`, sem omitir trechos. Não há dependência de imagens, fontes ou ajuda hospedadas externamente durante a operação.

## Funcionamento e decisões

O backend gera um snapshot completo a cada segundo. A bomba é ligada/desligada pelo ciclo demonstrativo, sem botão de comando. Enche até 85%, drena até 20% e recomeça. Temperatura varia entre 22 e 28 °C. Não é modelo físico calibrado nem controlador PID.

Spring Boot 4.1.2 foi verificado na [documentação oficial](https://docs.spring.io/spring-boot/system-requirements.html) e no Maven Central. O BOM gerencia as dependências Java. As versões npm estão fixadas no manifesto e no lockfile. Detalhes e fontes: [ADR 0001](docs/adr/0001-stack.md).

Escolhemos um monólito por pacotes, WebSocket JSON nativo (sem STOMP) e SVG próprio para a tela fixa. Fabric.js será usado no editor; ECharts quando houver gráficos. Banco, drivers industriais e demais módulos entram em incrementos separados. Veja [arquitetura e contrato](docs/architecture.md).

## Checklist de validação e revisão manual

- [x] `mvn.cmd clean test` passa e o backend inicia sem erro.
- [x] `/api/health` retorna `UP` e `SIMULATION`.
- [x] Frontend mostra `Conectado`, três tags e a marca SIMULAÇÃO.
- [ ] Nível e altura da água mudam sem recarga; bomba alterna no ciclo.
- [ ] Temperatura muda entre 22 e 28 °C.
- [ ] Parar Java torna as medições indisponíveis e para a animação da bomba.
- [ ] Reiniciar Java recupera a comunicação automaticamente.
- [x] Tags mostra tipos, qualidade e origem; F1 abre a ajuda.
- [x] Teste `e2e/supervision.spec.ts` passa com backend real.

## O que ainda falta

Fluxo ponta a ponta validado. Próximos incrementos: editor, importação segura, persistência, autenticação/RBAC/TLS, auditoria, gráficos, alarmes, histórico, drivers, PID/Bode, wiki pesquisável e plugins. [Roadmap](docs/roadmap.md).

Esta versão escuta somente no computador local. Acesso de outros computadores na rede exigirá uma etapa de implantação com segurança. Nenhum CLP está conectado e nenhuma escrita física foi implementada. O SCADA não substitui funções de segurança ou controle determinístico do CLP.

## Solução de problemas

- **Sem conexão:** verifique o terminal Java, a porta 8080 e `/api/health`. A página não inventa medições se Java estiver indisponível.
- **Porta 5173 ocupada:** encerre a instância anterior; `strictPort` evita trocar silenciosamente a origem permitida.
- **Java antigo:** confira `JAVA_HOME` e `mvn.cmd -version`; é necessário JDK 21, não apenas JRE.
- **AccessDeniedException em `Path.toRealPath`:** foi a falha observada no ambiente restrito do assistente, inclusive em caminhos de leitura. Execute os mesmos comandos em um PowerShell normal da sua conta. Se persistir, preserve o log e investigue permissões/antivírus; não desative proteções globalmente.
- **Primeiro download:** requer internet. Após dependências instaladas, a aplicação em execução e a ajuda não dependem de internet.

No Linux, use JDK 21, Maven e Node 24, execute `mvn spring-boot:run` em `backend` e `npm ci && npm run dev` em `frontend`. A execução Linux não foi validada nesta entrega.
