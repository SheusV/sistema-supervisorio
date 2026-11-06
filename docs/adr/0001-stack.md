# ADR 0001 — stack e limites da Etapa 0

Status: implementado e validado em Windows. Quatro testes Java e dois testes de navegador com backend real aprovados.

## Decisão

- Java 21, requisito do projeto, com compilação `release=21`.
- Spring Boot 4.1.2, disponível no Maven Central e listado como estável na documentação oficial consultada em 06/11/2026. Java 21 está dentro da faixa suportada; Maven mínimo oficial é 3.6.3. Para reprodução local foi baixado Maven 3.9.11.
- Spring Web MVC/WebSocket e Jackson 3, com versões transitivas administradas pelo BOM do Boot. Não misturar importações Jackson 2 (`com.fasterxml.jackson.databind`) com o mapper Jackson 3 (`tools.jackson.databind`).
- React 19.3.1, Vite 8.3.6 e TypeScript 7.0.2, versões verificadas no registro npm e fixadas no manifesto e lockfile. Node usado: 24.22.1. Node 24 LTS é a recomendação para reprodução.
- Vitest 5.1.0 e React Testing Library para contrato, componentes e reconexão. Playwright para navegador; teste com dados controlados separado do teste com backend real.
- JUnit gerenciado por Spring Boot, sem forçar a versão 5 contra o BOM do Boot 4.1. Os testes usam a API Jupiter.

## Motivos

A tela fixa usa SVG próprio e CSS: é simples de revisar e não precisa ainda de canvas/editor. Fabric.js será introduzido com edição e serialização. ECharts entra com tendências. PostgreSQL/Flyway/Testcontainers entram com persistência. Milo/PLC4X/Paho entram quando o contrato de conectividade e seus testes de leitura forem implementados. Essas dependências não foram instaladas nem tiveram sua compatibilidade alegada nesta fase.

São dois processos de desenvolvimento locais. O alvo futuro permanece um servidor Java, podendo servir os arquivos estáticos produzidos pelo frontend; o empacotamento integrado não faz parte deste incremento.

## Referências oficiais

- https://docs.spring.io/spring-boot/system-requirements.html
- https://docs.spring.io/spring-boot/
- https://repo.maven.apache.org/maven2/org/springframework/boot/spring-boot-starter-parent/4.1.2/
- https://vite.dev/guide/
- https://registry.npmjs.org/react/latest
- https://registry.npmjs.org/vite/latest
- https://registry.npmjs.org/typescript/latest
