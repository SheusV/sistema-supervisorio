# Código completo — Etapa 0
Cópia integral dos arquivos autorais; lockfile e capturas disponíveis separadamente.

## .gitattributes
````
* text=auto
*.java text eol=lf
*.ts text eol=lf
*.tsx text eol=lf
*.json text eol=lf
*.md text eol=lf
*.ps1 text eol=crlf
*.png binary

````

## .gitignore
````
.tools/
**/target/
**/node_modules/
**/dist/
**/test-results/
**/playwright-report/
*.log
.env
.env.*
!.env.example
*.pem
*.key
*.p12
*.pfx
*.jks
*.keystore
.npmrc
.netrc
credentials.json
secrets/
*.tsbuildinfo
.idea/

````

## backend/pom.xml
````
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <parent><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-parent</artifactId><version>4.1.2</version><relativePath/></parent>
  <groupId>br.com.scada</groupId><artifactId>scada-platform</artifactId><version>0.1.0</version>
  <name>SCADA — Etapa 0</name>
  <properties><java.version>21</java.version><project.build.sourceEncoding>UTF-8</project.build.sourceEncoding></properties>
  <dependencies>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-webmvc</artifactId></dependency>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-websocket</artifactId></dependency>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-test</artifactId><scope>test</scope></dependency>
  </dependencies>
  <build><plugins><plugin><groupId>org.springframework.boot</groupId><artifactId>spring-boot-maven-plugin</artifactId></plugin></plugins></build>
</project>

````

## backend/src/main/java/br/com/scada/api/ScadaController.java
````
package br.com.scada.api;

import br.com.scada.simulation.TankSimulator;
import br.com.scada.tag.TagSnapshot;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.Map;

@RestController
public class ScadaController {
    private final TankSimulator simulator;
    public ScadaController(TankSimulator simulator) { this.simulator = simulator; }

    @GetMapping("/api/health")
    public Map<String, String> health() {
        return Map.of("status", "UP", "mode", "SIMULATION", "version", "0.1.0");
    }

    @GetMapping("/api/tags")
    public TagSnapshot tags() { return simulator.current(); }
}

````

## backend/src/main/java/br/com/scada/api/TagSocket.java
````
package br.com.scada.api;

import br.com.scada.simulation.TankSimulator;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import tools.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class TagSocket extends TextWebSocketHandler {
    private final TankSimulator simulator;
    private final ObjectMapper mapper;
    private final ConcurrentHashMap<String, WebSocketSession> clients = new ConcurrentHashMap<>();

    public TagSocket(TankSimulator simulator, ObjectMapper mapper) {
        this.simulator = simulator;
        this.mapper = mapper;
    }

    @Override
    public synchronized void afterConnectionEstablished(WebSocketSession session) {
        var safeSession = new ConcurrentWebSocketSessionDecorator(session, 2000, 65536);
        clients.put(session.getId(), safeSession);
        send(safeSession, mapper.writeValueAsString(simulator.current()));
    }

    @Scheduled(fixedRateString = "${scada.simulation-period-ms:1000}")
    public synchronized void broadcast() {
        String payload = mapper.writeValueAsString(simulator.advance(Instant.now()));
        clients.values().forEach(session -> send(session, payload));
    }

    private void send(WebSocketSession session, String payload) {
        try {
            if (session.isOpen()) session.sendMessage(new TextMessage(payload));
            else clients.remove(session.getId());
        } catch (IOException | RuntimeException exception) {
            clients.remove(session.getId());
            try { session.close(CloseStatus.SERVER_ERROR); } catch (IOException ignored) { }
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws IOException {
        // This stream is outbound only: no tag writes or control commands exist.
        session.close(CloseStatus.POLICY_VIOLATION);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        clients.remove(session.getId());
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws IOException {
        clients.remove(session.getId());
        session.close(CloseStatus.SERVER_ERROR);
    }
}

````

## backend/src/main/java/br/com/scada/api/WebConfiguration.java
````
package br.com.scada.api;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.*;

@Configuration
@EnableWebSocket
public class WebConfiguration implements WebSocketConfigurer {
    private final TagSocket socket;
    private final String[] origins;

    public WebConfiguration(TagSocket socket, @Value("${scada.allowed-origins}") String[] origins) {
        this.socket = socket;
        this.origins = origins;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(socket, "/ws/tags").setAllowedOrigins(origins);
    }
}

````

## backend/src/main/java/br/com/scada/ScadaApplication.java
````
package br.com.scada;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class ScadaApplication {
    public static void main(String[] args) {
        SpringApplication.run(ScadaApplication.class, args);
    }
}

````

## backend/src/main/java/br/com/scada/simulation/TankSimulator.java
````
package br.com.scada.simulation;

import br.com.scada.tag.TagSnapshot;
import br.com.scada.tag.TagValue;
import org.springframework.stereotype.Service;
import java.time.Instant;
import java.util.List;
import static br.com.scada.tag.TagValue.*;

/** Deterministic demonstration cycle; not a physical model or production controller. */
@Service
public class TankSimulator {
    private long step;
    private double level = 42;
    private boolean running = true;
    private TagSnapshot current = snapshot(Instant.now());

    public synchronized TagSnapshot current() { return current; }

    public synchronized TagSnapshot advance(Instant now) {
        step++;
        level = Math.clamp(level + (running ? 2.0 : -1.2), 0, 100);
        if (level >= 85) running = false;
        if (level <= 20) running = true;
        current = snapshot(now);
        return current;
    }

    private TagSnapshot snapshot(Instant now) {
        return new TagSnapshot(1, step, List.of(
            tag("TQ001.LEVEL", DataType.DOUBLE, Math.round(level * 10) / 10.0, "%", now),
            tag("P001.RUNNING", DataType.BOOLEAN, running, "", now),
            tag("TQ001.TEMPERATURE", DataType.DOUBLE,
                Math.round((25 + 3 * Math.sin(step / 18.0)) * 10) / 10.0, "°C", now)));
    }

    private TagValue tag(String name, DataType type, Object value, String unit, Instant now) {
        return new TagValue(name, type, value, unit, Quality.GOOD, now, now, Source.SIMULATED, false);
    }
}

````

## backend/src/main/java/br/com/scada/tag/TagSnapshot.java
````
package br.com.scada.tag;

import java.util.List;

public record TagSnapshot(int schemaVersion, long sequence, List<TagValue> tags) {
    public TagSnapshot { tags = List.copyOf(tags); }
}

````

## backend/src/main/java/br/com/scada/tag/TagValue.java
````
package br.com.scada.tag;

import java.time.Instant;

/** Protocol-independent read-only measurement. */
public record TagValue(String name, DataType dataType, Object value, String unit,
                       Quality quality, Instant sourceTimestamp, Instant serverTimestamp,
                       Source source, boolean writable) {
    public enum DataType { DOUBLE, BOOLEAN }
    public enum Quality { GOOD, BAD, UNCERTAIN, STALE }
    public enum Source { SIMULATED }
}

````

## backend/src/main/resources/application.properties
````
spring.application.name=scada-platform
server.address=127.0.0.1
server.port=8080
scada.allowed-origins=http://localhost:5173,http://127.0.0.1:5173
scada.simulation-period-ms=1000
server.error.include-message=never

````

## backend/src/test/java/br/com/scada/ScadaIntegrationTest.java
````
package br.com.scada;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import tools.jackson.databind.json.JsonMapper;
import java.net.URI;
import java.net.http.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "scada.simulation-period-ms=100")
class ScadaIntegrationTest {
    @LocalServerPort int port;
    private final HttpClient client = HttpClient.newHttpClient();
    private final JsonMapper mapper = JsonMapper.builder().build();

    @Test void healthAndTagsAreReadableButWritesAreNotAvailable() throws Exception {
        var health = client.send(HttpRequest.newBuilder(uri("/api/health")).build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(200, health.statusCode());
        assertEquals("SIMULATION", mapper.readTree(health.body()).get("mode").asText());
        var tags = client.send(HttpRequest.newBuilder(uri("/api/tags")).build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(3, mapper.readTree(tags.body()).get("tags").size());
        var write = client.send(HttpRequest.newBuilder(uri("/api/tags")).POST(HttpRequest.BodyPublishers.ofString("{}")).build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(405, write.statusCode());
    }

    @Test void websocketPublishesChangingSnapshots() throws Exception {
        var messages = new LinkedBlockingQueue<String>();
        var socket = client.newWebSocketBuilder().header("Origin", "http://localhost:5173")
            .buildAsync(URI.create("ws://127.0.0.1:" + port + "/ws/tags"), new WebSocket.Listener() {
                private final StringBuilder partial = new StringBuilder();
                public void onOpen(WebSocket ws) { ws.request(1); }
                public CompletionStage<?> onText(WebSocket ws, CharSequence text, boolean last) {
                    partial.append(text);
                    if (last) { messages.add(partial.toString()); partial.setLength(0); }
                    ws.request(1);
                    return CompletableFuture.completedFuture(null);
                }
            }).get(5, TimeUnit.SECONDS);
        try {
            var first = messages.poll(5, TimeUnit.SECONDS);
            var second = messages.poll(5, TimeUnit.SECONDS);
            assertNotNull(first); assertNotNull(second);
            assertTrue(mapper.readTree(second).get("sequence").asLong() > mapper.readTree(first).get("sequence").asLong());
            assertNotEquals(mapper.readTree(first).get("tags").get(0).get("value"), mapper.readTree(second).get("tags").get(0).get("value"));
        } finally { socket.sendClose(WebSocket.NORMAL_CLOSURE, "test complete").join(); }
    }

    @Test void untrustedWebsocketOriginIsRejected() {
        assertThrows(ExecutionException.class, () -> client.newWebSocketBuilder()
            .header("Origin", "https://untrusted.example")
            .buildAsync(URI.create("ws://127.0.0.1:" + port + "/ws/tags"), new WebSocket.Listener() {})
            .get(5, TimeUnit.SECONDS));
    }

    private URI uri(String path) { return URI.create("http://127.0.0.1:" + port + path); }
}

````

## backend/src/test/java/br/com/scada/TankSimulatorTest.java
````
package br.com.scada;

import br.com.scada.simulation.TankSimulator;
import br.com.scada.tag.TagValue;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import static org.junit.jupiter.api.Assertions.*;

class TankSimulatorTest {
    @Test void cyclesWithinLimitsAndAlwaysIdentifiesSimulatedReadOnlyData() {
        var simulator = new TankSimulator();
        boolean on = false, off = false;
        for (int i = 1; i <= 500; i++) {
            var now = Instant.parse("2026-01-01T00:00:00Z").plusSeconds(i);
            var frame = simulator.advance(now);
            assertEquals(i, frame.sequence());
            assertEquals(3, frame.tags().size());
            double level = (Double) frame.tags().get(0).value();
            assertTrue(level >= 0 && level <= 100);
            boolean running = (Boolean) frame.tags().get(1).value();
            on |= running; off |= !running;
            for (var tag : frame.tags()) {
                assertEquals(TagValue.Source.SIMULATED, tag.source());
                assertEquals(TagValue.Quality.GOOD, tag.quality());
                assertEquals(now, tag.sourceTimestamp());
                assertFalse(tag.writable());
            }
        }
        assertTrue(on && off);
    }
}

````

## docs/adr/0001-stack.md
````
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

````

## docs/architecture.md
````
# Arquitetura — incremento 0

O pedido inicial é a fonte do escopo. Os documentos fornecidos são referências de evolução, não uma autorização para implementar todas as fases.

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

````

## docs/roadmap.md
````
# Próximos incrementos

1. Etapa 0 validada tecnicamente: backend, frontend e fluxo WebSocket real, incluindo reconexão após interrupção do transporte. Revisão visual pelo usuário disponível.
2. Editor HMI com Fabric.js, modelo de tela versionado, bindings restritos, undo/redo, salvar/abrir e importação de arquivos validada.
3. PostgreSQL/Flyway, projetos persistidos, autenticação, perfis e auditoria; testes com Testcontainers.
4. Drivers de leitura, primeiro contra servidores OPC UA/Modbus/MQTT simulados, com qualidade e timeouts testados.
5. Alarmes e histórico com ECharts.
6. Laboratório offline PID/Bode com testes numéricos contra referências analíticas.
7. Wiki pesquisável, ajuda contextual por componente e tutoriais.
8. Extensões versionadas e critérios de segurança de plugins.

Conexão com CLP físico, comandos de escrita e uso em produção exigem fases específicas posteriores. Nenhum desses recursos foi implementado nesta entrega.

````

## docs/validation.md
````
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

````

## examples/water-tank/project.json
````
{
  "schemaVersion": 1,
  "id": "water-tank",
  "name": "Tanque TQ-001",
  "mode": "SIMULATION",
  "description": "Referência declarativa da tela fixa da Etapa 0. Importação pelo editor será implementada posteriormente.",
  "components": [
    {"id": "tank", "type": "tank", "bindings": {"level": "TQ001.LEVEL"}},
    {"id": "pump", "type": "pump", "bindings": {"running": "P001.RUNNING"}},
    {"id": "temperature", "type": "indicator", "bindings": {"value": "TQ001.TEMPERATURE"}}
  ]
}

````

## frontend/e2e/interface.spec.ts
````
import { test, expect } from "@playwright/test";
import { frame } from "../src/test/fixture";

test("interface with controlled test frames: updates, disconnects and remains responsive", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  let stream: Parameters<Parameters<typeof page.routeWebSocket>[1]>[0];
  await page.routeWebSocket("**/ws/tags", (ws) => {
    stream = ws;
    ws.send(JSON.stringify(frame()));
  });
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Conectado");
  await expect(page.getByTestId("level-value")).toContainText("42.0");
  stream!.send(JSON.stringify(frame(2, 68)));
  await expect(page.getByTestId("level-value")).toContainText("68.0");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "../docs/screenshots/desktop-test-data.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Tags", exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await page.keyboard.press("F1");
  await expect(page.getByText("Primeiros passos")).toBeVisible();
  await page.getByRole("button", { name: "Supervisão", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../docs/screenshots/mobile-test-data.png",
    fullPage: true,
  });
  stream!.close();
  await expect(page.getByRole("status")).toHaveText("Sem conexão");
  await expect(page.getByTestId("level-value")).toContainText("—");
});

````

## frontend/e2e/supervision.spec.ts
````
import { test, expect } from "@playwright/test";

test("receives real backend updates, navigates, and fits a mobile viewport", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Conectado");
  const initial = await page.getByTestId("level-value").textContent();
  await expect(page.getByTestId("level-value")).not.toHaveText(initial!);
  await expect(page.getByText("◉ SIMULAÇÃO")).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "../docs/screenshots/desktop-java-live.png", fullPage: true });
  await page.getByRole("button", { name: "Tags" }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await page.keyboard.press("F1");
  await expect(page.getByText("Primeiros passos")).toBeVisible();
  await page.getByRole("button", { name: "Supervisão" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("level-value")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("recovers the real Java stream after a transport interruption", async ({ page }) => {
  let firstStream: import("@playwright/test").WebSocketRoute | undefined;
  let connections = 0;
  await page.routeWebSocket("**/ws/tags", stream => {
    connections++;
    stream.connectToServer();
    firstStream = stream;
  });
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Conectado");
  await firstStream!.close();
  await expect(page.getByTestId("level-value")).toContainText("—");
  await expect(page.getByRole("status")).toHaveText("Conectado", { timeout: 15000 });
  expect(connections).toBeGreaterThan(1);
  await expect(page.getByTestId("level-value")).not.toContainText("—");
});

````

## frontend/index.html
````
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#101c2e" />
    <title>SCADA · Tanque TQ-001</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>

````

## frontend/package.json
````
{
  "name": "scada-hmi",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22.12.0"
  },
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "19.3.1",
    "react-dom": "19.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "6.2.1",
    "vite": "8.3.6",
    "typescript": "7.0.2",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "@types/node": "26.6.6",
    "vitest": "5.1.0",
    "jsdom": "31.0.0",
    "@testing-library/react": "16.3.3",
    "@testing-library/jest-dom": "7.0.1",
    "@playwright/test": "1.65.0"
  }
}

````

## frontend/playwright.config.ts
````
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://127.0.0.1:5173",
    browserName: "chromium",
    channel: "msedge",
  },
  timeout: 30000,
  reporter: "list",
});

````

## frontend/src/App.test.tsx
````
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { frame } from "./test/fixture";
const state = vi.hoisted(() => ({
  snapshot: null as ReturnType<typeof frame> | null,
  connection: "live" as "live" | "offline",
}));
vi.mock("./tags/useTags", () => ({ useTags: () => state }));
describe("supervision", () => {
  beforeEach(() => {
    state.snapshot = frame();
    state.connection = "live";
  });
  it("renders simulation and updates the tank on new data", () => {
    const { rerender } = render(<App />);
    expect(screen.getByText("◉ SIMULAÇÃO")).toBeInTheDocument();
    expect(screen.getByTestId("level-value")).toHaveTextContent("42.0");
    expect(screen.getByTestId("tank-water")).toHaveAttribute("height", "105");
    state.snapshot = frame(2, 70);
    rerender(<App />);
    expect(screen.getByTestId("tank-water")).toHaveAttribute("height", "175");
  });
  it("hides measurements on disconnection and bad quality", () => {
    const { rerender } = render(<App />);
    state.connection = "offline";
    rerender(<App />);
    expect(screen.getByTestId("level-value")).toHaveTextContent("—");
    expect(screen.getByRole("status")).toHaveTextContent("Sem conexão");
    state.connection = "live";
    state.snapshot!.tags[0].quality = "BAD";
    rerender(<App />);
    expect(screen.getByTestId("level-value")).toHaveTextContent("—");
  });
  it("navigates to tags and opens offline help with F1", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Tags" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "F1" });
    expect(screen.getByText("Primeiros passos")).toBeInTheDocument();
  });
});

````

## frontend/src/App.tsx
````
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

````

## frontend/src/components/Process.tsx
````
export function Process({
  level,
  running,
  temperature,
}: {
  level: number | null;
  running: boolean | null;
  temperature: number | null;
}) {
  return (
    <svg
      className="process"
      viewBox="0 0 900 420"
      role="img"
      aria-label={`Tanque TQ-001: ${level === null ? "nível indisponível" : `nível ${level.toFixed(1)} por cento`}`}
    >
      <defs>
        <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="#dfe7ed" />
        </pattern>
        <clipPath id="tank">
          <rect x="350" y="79" width="220" height="250" rx="24" />
        </clipPath>
        <linearGradient id="water" x2="0" y2="1">
          <stop stopColor="#5dcfc1" />
          <stop offset="1" stopColor="#159c94" />
        </linearGradient>
      </defs>
      <rect width="900" height="420" fill="url(#grid)" />
      <text x="65" y="100" className="diagram-label">
        ALIMENTAÇÃO
      </text>
      <path d="M65 215 H350 M570 275 H760 V335 H820" className="pipe" />
      {running === true && <path d="M65 215 H350" className="flow" />}
      <path d="M375 330 V358 M545 330 V358" stroke="#8193a4" strokeWidth="9" />
      <rect
        x="350"
        y="79"
        width="220"
        height="250"
        rx="24"
        fill="#f3f7fa"
        stroke="#8497a8"
        strokeWidth="3"
      />
      <g clipPath="url(#tank)">
        <rect
          data-testid="tank-water"
          x="351"
          y={329 - (level ?? 0) * 2.5}
          width="218"
          height={(level ?? 0) * 2.5}
          fill="url(#water)"
          style={{ transition: "y 850ms ease, height 850ms ease" }}
        />
      </g>
      {[0, 25, 50, 75, 100].map((n) => (
        <g key={n}>
          <line
            x1="585"
            x2="595"
            y1={329 - n * 2.5}
            y2={329 - n * 2.5}
            stroke="#91a0af"
          />
          <text x="603" y={334 - n * 2.5} className="scale">
            {n}%
          </text>
        </g>
      ))}
      <text x="460" y="49" textAnchor="middle" className="equipment-title">
        TQ-001
      </text>
      <text x="460" y="198" textAnchor="middle" className="tank-value">
        {level === null ? "—" : `${level.toFixed(1)}%`}
      </text>
      <text x="460" y="222" textAnchor="middle" className="tank-caption">
        {level === null ? "INDISPONÍVEL" : "NÍVEL SIMULADO"}
      </text>
      <text x="460" y="390" textAnchor="middle" className="diagram-label">
        TANQUE DE PROCESSO
      </text>
      <circle
        cx="195"
        cy="215"
        r="36"
        fill={running === true ? "#e0f5ef" : "#eef1f4"}
        stroke={running === true ? "#139a80" : "#8193a4"}
        strokeWidth="3"
      />
      <g className={running === true ? "rotor spinning" : "rotor"}>
        <path
          d="M195 190 L208 217 L183 226 Z"
          fill={running === true ? "#139a80" : "#8193a4"}
        />
      </g>
      <text x="195" y="280" textAnchor="middle" className="equipment-title">
        P-001
      </text>
      <text x="195" y="303" textAnchor="middle" className="diagram-label">
        {running === null ? "INDISPONÍVEL" : running ? "EM OPERAÇÃO" : "PARADA"}
      </text>
      <rect
        x="702"
        y="106"
        width="150"
        height="85"
        rx="10"
        fill="white"
        stroke="#dce4eb"
      />
      <text x="720" y="132" className="diagram-label">
        TT-001 · TEMP.
      </text>
      <text x="720" y="166" className="temperature">
        {temperature === null ? "—" : `${temperature.toFixed(1)} °C`}
      </text>
      <path
        d="M702 150 H660 V175 H570"
        stroke="#9bafbd"
        strokeDasharray="4 5"
        fill="none"
      />
      <text x="742" y="372" className="diagram-label">
        SAÍDA
      </text>
    </svg>
  );
}

````

## frontend/src/main.tsx
````
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

````

## frontend/src/styles.css
````
:root {
  font-family:
    Inter,
    Segoe UI,
    Arial,
    sans-serif;
  color: #263548;
  background: #f3f6f9;
  font-synthesis: none;
  font-size: 14px;
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
}
button,
a {
  -webkit-tap-highlight-color: transparent;
}
button {
  font: inherit;
  cursor: pointer;
}
button:focus-visible,
a:focus-visible {
  outline: 3px solid #2dbba6;
  outline-offset: 4px;
}
.shell {
  display: flex;
  min-height: 100vh;
}
.sidebar {
  width: 228px;
  background: #101c2e;
  color: #93a2b7;
  display: flex;
  flex-direction: column;
  padding: 33px 20px;
  position: fixed;
  inset: 0 auto 0 0;
}
.brand {
  position: relative;
  color: #fff;
  text-decoration: none;
  font-size: 27px;
  font-weight: 700;
  letter-spacing: 3px;
  padding-left: 42px;
  margin-bottom: 60px;
}
.brand-icon {
  position: absolute;
  left: 2px;
  top: 0;
  color: #4bd0b4;
  font-size: 37px;
  line-height: 1;
}
.brand-sub {
  display: block;
  font-size: 8px;
  color: #99a9bc;
  letter-spacing: 2px;
  margin-top: 5px;
}
.workspace-label,
.future > span {
  font-size: 9px;
  letter-spacing: 1.6px;
  font-weight: 600;
  padding: 0 13px;
  margin-bottom: 16px;
}
nav {
  display: grid;
  gap: 7px;
}
nav button {
  border: 0;
  text-align: left;
  color: #a6b3c5;
  background: none;
  border-radius: 7px;
  padding: 14px 13px;
}
nav button span {
  display: inline-block;
  width: 30px;
  font-size: 19px;
  vertical-align: middle;
}
nav button[aria-current] {
  color: #67dfc7;
  background: #163b40;
}
nav button:hover {
  background: #213549;
}
.future {
  margin-top: 42px;
  font-size: 12px;
}
.future p {
  padding: 5px 13px;
  color: #6d7e93;
}
.sidebar-footer {
  margin-top: auto;
  padding: 30px 12px 0;
  font-size: 12px;
}
.sidebar-footer small {
  display: block;
  margin-top: 10px;
  color: #667a92;
}
.small-dot,
.legend-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #29b69f;
  margin-right: 8px;
}
.main {
  margin-left: 228px;
  width: calc(100% - 228px);
}
header {
  height: 76px;
  background: #fff;
  border-bottom: 1px solid #e1e7ee;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 38px;
  font-size: 12px;
  color: #7b8999;
}
header strong {
  font-weight: 500;
  color: #36495f;
}
.slash {
  padding: 0 15px;
  color: #c1cad2;
}
.simulation {
  background: #fff4d9;
  color: #886011;
  border: 1px solid #f0deb0;
  border-radius: 5px;
  padding: 7px 10px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1px;
}
main {
  padding: 34px 38px 0;
  max-width: 1600px;
  margin: auto;
}
.page-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 29px;
  gap: 20px;
}
.eyebrow {
  font-size: 9px;
  font-weight: 700;
  color: #8995a5;
  letter-spacing: 1.7px;
}
h1 {
  font-size: 27px;
  letter-spacing: -0.8px;
  margin: 10px 0;
  color: #223247;
  font-weight: 650;
}
.page-heading p {
  color: #8190a0;
  font-size: 12px;
  margin: 0;
}
.separator {
  margin: 0 10px;
  color: #acb6c1;
}
.connection {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  white-space: nowrap;
  padding: 8px 12px;
  border: 1px solid #d9e2e8;
  background: #fff;
  border-radius: 20px;
}
.connection i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #a18246;
}
.connection.live {
  color: #218772;
  border-color: #c8e8df;
  background: #f0fbf7;
}
.connection.live i {
  background: #20b18a;
}
.metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 19px;
  margin-bottom: 24px;
}
.metrics article {
  background: #fff;
  border: 1px solid #e0e7ee;
  border-radius: 10px;
  padding: 22px;
  position: relative;
  box-shadow: 0 2px 3px #18283b03;
}
.metric-label {
  font-size: 12px;
  color: #7b899b;
}
.metric-value {
  font-size: 35px;
  font-weight: 600;
  letter-spacing: -1px;
  margin: 17px 0 19px;
  color: #23394e;
}
.metric-value small {
  font-size: 17px;
  color: #8c9cac;
  font-weight: 400;
}
.metric-icon {
  position: absolute;
  right: 20px;
  top: 16px;
  color: #269e91;
  background: #ecf7f4;
  border-radius: 8px;
  padding: 8px 11px;
  font-size: 19px;
}
.metric-icon.warm {
  color: #c88a49;
  background: #fcf5eb;
}
.metric-foot {
  font:
    9px Consolas,
    monospace;
  display: flex;
  justify-content: space-between;
  gap: 5px;
  color: #93a0ad;
}
.metric-foot span {
  font:
    9px Segoe UI,
    Arial;
}
.pump-value {
  font-size: 24px;
  font-weight: 600;
  margin: 24px 0 26px;
  color: #7f8c9c;
}
.pump-value.active {
  color: #26977e;
}
.panel {
  background: white;
  border: 1px solid #e0e7ee;
  border-radius: 10px;
  overflow: hidden;
}
.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 22px 25px;
  border-bottom: 1px solid #eef1f5;
}
.panel h2 {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 6px;
}
.panel p {
  font-size: 11px;
  color: #8b98a7;
  margin: 0;
}
.pill {
  font-size: 8px;
  color: #7b8c9e;
  border: 1px solid #e2e8ed;
  padding: 6px 9px;
  border-radius: 4px;
  letter-spacing: 0.9px;
}
.process {
  display: block;
  width: 100%;
  max-height: 440px;
  padding: 12px;
}
.pipe {
  fill: none;
  stroke: #b8c9d2;
  stroke-width: 12;
  stroke-linejoin: round;
}
.flow {
  fill: none;
  stroke: #27b6a2;
  stroke-width: 5;
  stroke-dasharray: 9 9;
  animation: flow 1s linear infinite;
}
.equipment-title {
  font:
    600 15px Segoe UI,
    Arial;
  fill: #344b60;
}
.diagram-label {
  font:
    10px Segoe UI,
    Arial;
  fill: #8091a1;
  letter-spacing: 0.8px;
}
.scale {
  font:
    10px Segoe UI,
    Arial;
  fill: #8d9bab;
}
.tank-value {
  font:
    600 36px Segoe UI,
    Arial;
  fill: #173f4a;
}
.tank-caption {
  font:
    9px Segoe UI,
    Arial;
  fill: #245263;
  letter-spacing: 1px;
}
.temperature {
  font:
    600 25px Segoe UI,
    Arial;
  fill: #345066;
}
.rotor {
  transform-origin: 195px 215px;
}
.spinning {
  animation: spin 2s linear infinite;
}
.panel-footer {
  border-top: 1px solid #edf0f4;
  display: flex;
  justify-content: space-between;
  padding: 15px 25px;
  color: #8d9baa;
  font-size: 10px;
}
.info-strip {
  display: flex;
  gap: 15px;
  align-items: center;
  margin: 22px 0;
  padding: 15px 19px;
  background: #eaf0f5;
  border: 1px solid #e0e8f0;
  border-radius: 7px;
  color: #6b8197;
}
.info-strip > span {
  font-size: 20px;
}
.info-strip p {
  font-size: 11px;
  line-height: 1.8;
  margin: 0;
  flex: 1;
}
.info-strip strong {
  color: #536d85;
  font-weight: 600;
}
.info-strip button {
  border: 0;
  background: none;
  color: #4c708d;
  font-size: 10px;
  white-space: nowrap;
}
footer {
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  color: #9aa6b3;
  padding: 16px 0 23px;
  gap: 12px;
  border-top: 1px solid #e1e7ee;
}
.notice {
  padding: 12px 16px;
  border: 1px solid #ead8ab;
  color: #896b32;
  background: #fff9eb;
  border-radius: 6px;
  font-size: 12px;
  margin-bottom: 20px;
}
.tag-panel,
.help {
  padding: 28px;
}
.table-scroll {
  overflow: auto;
}
table {
  border-collapse: collapse;
  width: 100%;
  margin-top: 25px;
  font-size: 12px;
  text-align: left;
}
td,
th {
  padding: 17px 10px;
  border-bottom: 1px solid #e9edf2;
}
th {
  color: #8391a1;
  font-size: 11px;
  font-weight: 500;
}
.help {
  max-width: 850px;
}
.help p {
  font-size: 14px;
  line-height: 1.9;
  color: #65788c;
}
.help h3 {
  font-size: 16px;
  margin-top: 30px;
}
kbd {
  background: #edf1f5;
  padding: 3px 7px;
  border-radius: 3px;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes flow {
  to {
    stroke-dashoffset: -36;
  }
}
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation: none !important;
    transition: none !important;
  }
}
@media (min-width: 1500px) {
  main {
    padding-top: 45px;
  }
  .process {
    max-height: 510px;
  }
  .metrics article {
    padding: 27px;
  }
}
@media (max-width: 1050px) {
  .sidebar {
    width: 185px;
    padding: 30px 14px;
  }
  .main {
    margin-left: 185px;
    width: calc(100% - 185px);
  }
  main {
    padding: 25px 22px 0;
  }
  header {
    padding: 0 22px;
  }
  .metrics {
    gap: 12px;
  }
  .metrics article {
    padding: 18px 14px;
  }
  .metric-icon {
    display: none;
  }
  .metric-foot {
    flex-wrap: wrap;
  }
  .pump-value {
    font-size: 21px;
  }
  .info-strip button {
    display: none;
  }
}
@media (max-width: 720px) {
  .sidebar {
    position: static;
    width: 100%;
    padding: 15px;
    display: block;
  }
  .brand {
    font-size: 20px;
    margin: 0;
    display: inline-block;
    padding-left: 35px;
  }
  .brand-icon {
    font-size: 30px;
  }
  .workspace-label,
  .future,
  .sidebar-footer {
    display: none;
  }
  nav {
    display: flex;
    float: right;
    gap: 3px;
  }
  nav button {
    padding: 9px;
    font-size: 11px;
  }
  nav button span {
    display: none;
  }
  .shell {
    display: block;
  }
  .main {
    margin: 0;
    width: 100%;
  }
  header {
    height: 58px;
    padding: 0 18px;
  }
  main {
    padding: 25px 15px 0;
  }
  h1 {
    font-size: 23px;
  }
  .page-heading {
    align-items: flex-start;
  }
  .connection {
    font-size: 9px;
    padding: 6px;
  }
  .eyebrow {
    font-size: 8px;
  }
  .metrics {
    gap: 8px;
  }
  .metrics article {
    padding: 15px 10px;
  }
  .metric-label {
    font-size: 10px;
    min-height: 26px;
  }
  .metric-value {
    font-size: 27px;
    margin: 10px 0;
  }
  .pump-value {
    font-size: 16px;
    margin: 15px 0;
  }
  .metric-foot {
    font-size: 8px;
  }
  .metric-foot span {
    display: none;
  }
  .panel-heading {
    padding: 18px 15px;
  }
  .panel-footer {
    padding: 13px 12px;
    font-size: 8px;
  }
  .panel-footer .separator {
    margin: 0 3px;
  }
  .process {
    padding: 0;
  }
  .info-strip {
    padding: 12px;
    gap: 10px;
  }
  footer {
    flex-wrap: wrap;
  }
  footer span {
    display: none;
  }
}

````

## frontend/src/tags/model.test.ts
````
import { describe, expect, it } from "vitest";
import { frame } from "../test/fixture";
import { parseSnapshot } from "./model";
describe("tag contract", () => {
  it("accepts a complete simulated snapshot", () =>
    expect(parseSnapshot(JSON.stringify(frame())).tags).toHaveLength(3));
  it("rejects malformed values, duplicate tags and unsupported sources", () => {
    for (const change of [
      { value: "42" },
      { value: 101 },
      { source: "REAL" },
      { writable: true },
      { quality: "UNKNOWN" },
      { serverTimestamp: "invalid" },
    ]) {
      const data = frame();
      Object.assign(data.tags[0], change);
      expect(() => parseSnapshot(JSON.stringify(data))).toThrow();
    }
    const data = frame();
    data.tags[1] = data.tags[0];
    expect(() => parseSnapshot(JSON.stringify(data))).toThrow();
  });
});

````

## frontend/src/tags/model.ts
````
export type TagName = "TQ001.LEVEL" | "P001.RUNNING" | "TQ001.TEMPERATURE";
export interface TagValue {
  name: TagName;
  dataType: "DOUBLE" | "BOOLEAN";
  value: number | boolean;
  unit: string;
  quality: "GOOD" | "BAD" | "UNCERTAIN" | "STALE";
  source: "SIMULATED";
  sourceTimestamp: string;
  serverTimestamp: string;
  writable: false;
}
export interface Snapshot {
  schemaVersion: 1;
  sequence: number;
  tags: TagValue[];
}
const types = {
  "TQ001.LEVEL": "DOUBLE",
  "P001.RUNNING": "BOOLEAN",
  "TQ001.TEMPERATURE": "DOUBLE",
};

/** Reject malformed or unexpected sources rather than displaying them as measurements. */
export function parseSnapshot(raw: string): Snapshot {
  const frame = JSON.parse(raw);
  if (
    frame.schemaVersion !== 1 ||
    !Number.isSafeInteger(frame.sequence) ||
    frame.sequence < 0 ||
    !Array.isArray(frame.tags) ||
    frame.tags.length !== 3
  )
    throw new Error("Formato de tags inválido");
  const seen = new Set<string>();
  for (const tag of frame.tags) {
    if (
      !tag ||
      !Object.hasOwn(types, tag.name) ||
      seen.has(tag.name) ||
      tag.dataType !== types[tag.name as TagName] ||
      tag.source !== "SIMULATED" ||
      tag.writable !== false ||
      typeof tag.unit !== "string" ||
      !["GOOD", "BAD", "UNCERTAIN", "STALE"].includes(tag.quality) ||
      !Number.isFinite(Date.parse(tag.sourceTimestamp)) ||
      !Number.isFinite(Date.parse(tag.serverTimestamp)) ||
      (tag.dataType === "BOOLEAN"
        ? typeof tag.value !== "boolean"
        : typeof tag.value !== "number" || !Number.isFinite(tag.value))
    ) {
      throw new Error("Tag inválida ou origem não suportada");
    }
    if (tag.name === "TQ001.LEVEL" && (tag.value < 0 || tag.value > 100))
      throw new Error("Nível fora da faixa");
    seen.add(tag.name);
  }
  return frame as Snapshot;
}

````

## frontend/src/tags/useTags.test.tsx
````
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useTags } from "./useTags";
import { frame } from "../test/fixture";
class FakeSocket {
  static sockets: FakeSocket[] = [];
  onmessage?: (event: { data: string }) => void;
  onclose?: () => void;
  onerror?: () => void;
  constructor() {
    FakeSocket.sockets.push(this);
  }
  close() {
    this.onclose?.();
  }
  sendFrame(sequence: number) {
    this.onmessage?.({ data: JSON.stringify(frame(sequence)) });
  }
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  FakeSocket.sockets = [];
});
it("reconnects, accepts reset sequences after restart and rejects stale streams", () => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeSocket);
  const { result, unmount } = renderHook(useTags);
  act(() => FakeSocket.sockets[0].sendFrame(20));
  expect(result.current.connection).toBe("live");
  act(() => FakeSocket.sockets[0].sendFrame(19));
  expect(result.current.snapshot?.sequence).toBe(20);
  act(() => vi.advanceTimersByTime(6000));
  expect(result.current.connection).not.toBe("live");
  act(() => vi.advanceTimersByTime(1000));
  act(() => FakeSocket.sockets[1].sendFrame(0));
  expect(result.current.connection).toBe("live");
  expect(result.current.snapshot?.sequence).toBe(0);
  unmount();
  const count = FakeSocket.sockets.length;
  act(() => vi.advanceTimersByTime(20000));
  expect(FakeSocket.sockets).toHaveLength(count);
});

````

## frontend/src/tags/useTags.ts
````
import { useEffect, useState } from "react";
import { parseSnapshot, type Snapshot } from "./model";

export type Connection = "connecting" | "live" | "offline" | "stale";
export function useTags() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout>;
    let lastMessage = 0;
    let attempt = 0;
    function connect() {
      if (disposed) return;
      setConnection("connecting");
      lastMessage = Date.now();
      let sequence = -1;
      socket = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/tags`,
      );
      socket.onmessage = ({ data }) => {
        if (disposed) return;
        try {
          const next = parseSnapshot(data);
          if (next.sequence <= sequence) return;
          sequence = next.sequence;
          lastMessage = Date.now();
          attempt = 0;
          setSnapshot(next);
          setConnection("live");
        } catch {
          setConnection("stale");
          socket?.close();
        }
      };
      socket.onerror = () => socket?.close();
      socket.onclose = () => {
        if (disposed) return;
        setConnection("offline");
        retry = setTimeout(connect, Math.min(1000 * 2 ** attempt++, 10000));
      };
    }
    connect();
    const watchdog = setInterval(() => {
      if (lastMessage && Date.now() - lastMessage > 5000) {
        setConnection("stale");
        socket?.close();
        lastMessage = 0;
      }
    }, 1000);
    return () => {
      disposed = true;
      clearTimeout(retry);
      clearInterval(watchdog);
      socket?.close();
    };
  }, []);
  return { snapshot, connection };
}

````

## frontend/src/test/fixture.ts
````
import type { Snapshot } from "../tags/model";
export function frame(sequence = 1, level = 42): Snapshot {
  const base = {
    quality: "GOOD",
    source: "SIMULATED",
    writable: false,
    sourceTimestamp: "2026-01-01T00:00:00Z",
    serverTimestamp: "2026-01-01T00:00:00Z",
  } as const;
  return {
    schemaVersion: 1,
    sequence,
    tags: [
      {
        ...base,
        name: "TQ001.LEVEL",
        dataType: "DOUBLE",
        value: level,
        unit: "%",
      },
      {
        ...base,
        name: "P001.RUNNING",
        dataType: "BOOLEAN",
        value: true,
        unit: "",
      },
      {
        ...base,
        name: "TQ001.TEMPERATURE",
        dataType: "DOUBLE",
        value: 25,
        unit: "°C",
      },
    ],
  };
}

````

## frontend/src/test/setup.ts
````
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
afterEach(cleanup);

````

## frontend/tsconfig.json
````
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "types": ["vite/client", "vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "vite.config.ts", "playwright.config.ts", "e2e"]
}

````

## frontend/vite.config.ts
````
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:8080",
      "/ws": { target: "ws://127.0.0.1:8080", ws: true },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});

````

## infrastructure/README.md
````
# Infraestrutura — Etapa 0

Backend em 127.0.0.1:8080; frontend Vite em 127.0.0.1:5173. Não há banco, broker, contêiner ou equipamento industrial necessário nesta etapa.

Acesso pela rede local será preparado com autenticação, TLS, proxy reverso e regras de firewall explícitas. Não publicar este servidor de desenvolvimento na internet. O perfil atual é local e não possui login. Nenhuma regra de firewall ou configuração global do computador foi alterada.

PostgreSQL + Flyway e Testcontainers entram quando houver persistência; adicionar Docker Compose neste momento não validaria nenhum comportamento do incremento.

````

## README.md
````
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

````

## scripts/Start-Backend.ps1
````
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $projectRoot
$portableJava = Join-Path $projectRoot '.tools/jdk-21.0.13+9'
if (-not $env:JAVA_HOME -and (Test-Path $portableJava)) { $env:JAVA_HOME = $portableJava }
$mavenCommand = Get-Command mvn.cmd -ErrorAction SilentlyContinue
$maven = if ($mavenCommand) { $mavenCommand.Source } else { Join-Path $projectRoot '.tools/apache-maven-3.9.11/bin/mvn.cmd' }
if (-not (Test-Path $maven)) { throw 'Instale Maven 3.9.11 ou superior e adicione sua pasta bin ao PATH. Consulte o README.' }
& $maven -B -ntp -f backend/pom.xml "-Dmaven.repo.local=$projectRoot/.tools/m2" spring-boot:run
exit $LASTEXITCODE

````

## scripts/Start-Frontend.ps1
````
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location (Join-Path $projectRoot 'frontend')
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($npmCommand) {
    if (-not (Test-Path 'node_modules')) { & $npmCommand.Source ci; if ($LASTEXITCODE) { exit $LASTEXITCODE } }
    & $npmCommand.Source run dev
} else {
    $portableNpm = Join-Path $projectRoot '.tools/package/bin/npm-cli.js'
    if (-not (Test-Path $portableNpm)) { throw 'Instale Node.js 24 LTS (com npm). Consulte o README.' }
    if (-not (Test-Path 'node_modules')) { & node $portableNpm ci; if ($LASTEXITCODE) { exit $LASTEXITCODE } }
    & node $portableNpm run dev
}
exit $LASTEXITCODE

````

## SECURITY.md
````
# Segurança do projeto

Este repositório público contém um protótipo local de simulação. Não contém autenticação/RBAC ou TLS e não está pronto para exposição na internet ou operação industrial. Não há comandos de escrita para equipamentos físicos.

## Antes de cada envio

- Revisar a lista de arquivos e o diff do commit.
- Nunca registrar tokens, senhas, chaves privadas, certificados privados ou credenciais de equipamentos.
- Arquivos `.env` e suas variações são ignorados. Um `.env.example`, se criado, deve conter somente nomes e exemplos sem segredos.
- `.gitignore` não protege arquivos já versionados. Conferir também o histórico enviado.
- Manter a autenticação Git fora do repositório, usando o gerenciador de credenciais ou autorização pelo navegador. Não colocar tokens nas URLs dos remotos.

Com Gitleaks instalado, executar antes do commit e antes do envio:

```powershell
gitleaks git --pre-commit --staged --redact .
gitleaks git --redact .
```

A varredura inicial foi realizada com Gitleaks 8.30.1. A ausência de alertas não garante ausência absoluta de segredos; a revisão dos arquivos continua necessária. Não há bloqueio automático de novos commits configurado nesta etapa.

Se uma credencial for publicada por engano, revogá-la/rotacioná-la imediatamente. Apagar somente o arquivo mais recente não remove o segredo do histórico. Não inclua credenciais ao relatar problemas em issues públicas.

````
