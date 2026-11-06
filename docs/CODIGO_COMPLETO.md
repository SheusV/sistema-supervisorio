# Código completo — versão 0.3.0
Cópia integral dos arquivos autorais; lockfile e capturas disponíveis separadamente.

## .dockerignore
````
**
!Dockerfile
!backend/
!backend/pom.xml
!backend/src/
!backend/src/**
!frontend/
!frontend/package.json
!frontend/package-lock.json
!frontend/index.html
!frontend/tsconfig.json
!frontend/vite.config.ts
!frontend/playwright.config.ts
!frontend/src/
!frontend/src/**
!frontend/e2e/
!frontend/e2e/**
!examples/
!examples/water-tank/
!examples/water-tank/project.json
**/.env
**/.env.*
**/*.pem
**/*.key
**/*.p12
**/*.pfx
**/credentials.json
````

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
  <profiles>
    <profile>
      <id>web-ui</id>
      <build><resources>
        <resource><directory>src/main/resources</directory></resource>
        <resource><directory>../frontend/dist</directory><targetPath>static</targetPath></resource>
      </resources></build>
    </profile>
  </profiles>
</project>
````

## backend/src/main/java/br/com/scada/api/HostedHeaders.java
````
package br.com.scada.api;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;

/** Browser restrictions for the public simulation, served behind a TLS proxy. */
@Component
@Profile("hosted")
public class HostedHeaders extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Referrer-Policy", "no-referrer");
        response.setHeader("X-Frame-Options", "DENY");
        response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
        response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; "
            + "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; "
            + "connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
        chain.doFilter(request, response);
    }
}
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

## backend/src/main/resources/application-hosted.properties
````
# Public simulation profile. Never enable industrial drivers here.
server.address=0.0.0.0
server.port=${PORT:8080}
server.forward-headers-strategy=framework
scada.allowed-origins=${PUBLIC_ORIGIN:${RENDER_EXTERNAL_URL:http://localhost:8080}}
server.tomcat.threads.max=40
server.tomcat.max-connections=200
server.tomcat.accept-count=50
server.servlet.session.cookie.secure=true
server.servlet.session.cookie.http-only=true
server.servlet.session.cookie.same-site=strict
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

## backend/src/test/java/br/com/scada/HostedHeadersTest.java
````
package br.com.scada;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;
import java.net.URI;
import java.net.http.*;
import static org.junit.jupiter.api.Assertions.*;

@ActiveProfiles("hosted")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "server.address=127.0.0.1")
class HostedHeadersTest {
    @LocalServerPort int port;

    @Test void simulationResponsesHaveBrowserProtectionHeaders() throws Exception {
        var response = HttpClient.newHttpClient().send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/health")).build(),
            HttpResponse.BodyHandlers.ofString());
        assertEquals(200, response.statusCode());
        assertEquals("nosniff", response.headers().firstValue("X-Content-Type-Options").orElseThrow());
        assertEquals("DENY", response.headers().firstValue("X-Frame-Options").orElseThrow());
        var policy = response.headers().firstValue("Content-Security-Policy").orElseThrow();
        assertTrue(policy.contains("script-src 'self'"));
        assertTrue(policy.contains("object-src 'none'"));
        assertFalse(policy.contains("unsafe-eval"));
    }
}
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

## CHANGELOG.md
````
# Histórico de versões

## 0.3.0 — 06/11/2026

- Seleção múltipla por Shift + clique, área de seleção ou Selecionar todos.
- Movimento conjunto com grade e limites, preservando geometria e vínculos.
- Alinhamento por bordas/centros e distribuição de espaços, considerando rotação.
- Exclusão conjunta e uma revisão de histórico por ação; JSON v1 compatível.

## Preparação de hospedagem — 06/11/2026

- Interface integrada ao pacote Java, perfil hosted e cabeçalhos de segurança.
- Dockerfile com testes durante o build e execução sem privilégios.
- Configuração Render Free com publicação automática da main após conexão da conta.
- Pacote validado localmente: 21 testes frontend, 5 Java e 6 de navegador.
- Serviço público e imagem Docker validados no Render; seis testes de navegador aprovados no endereço público.

## 0.2.0 — 06/11/2026

- Editor Fabric.js com biblioteca de tanque, bomba, indicador e texto.
- Arraste, ajuste à grade, tamanho, rotação, propriedades e ordem de exibição.
- Edição e Operação separadas, com vínculo às tags simuladas existentes.
- Arquivo JSON versionado, validação estrita, exportação/importação e histórico de 60 alterações.
- Documentação de uso revisada e textos de interface orientados à operação.

## 0.1.0 — 06/11/2026

- Backend Java com saúde, consulta de tags e WebSocket.
- Simulador de nível, bomba e temperatura.
- Sinótico React, lista de tags, reconexão e ajuda F1.
- Testes de contrato, interface e comunicação com o backend.
````

## Dockerfile
````
FROM node:24-bookworm-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --ignore-scripts
COPY frontend/ ./
COPY examples/ /build/examples/
RUN npm test && npm run build

FROM maven:3.9.11-eclipse-temurin-21 AS backend
WORKDIR /build
COPY backend/pom.xml backend/pom.xml
RUN mvn -B -ntp -f backend/pom.xml dependency:go-offline
COPY backend/src/ backend/src/
COPY --from=frontend /build/frontend/dist/ frontend/dist/
RUN mvn -B -ntp -f backend/pom.xml -Pweb-ui verify

FROM eclipse-temurin:21-jre-jammy AS runtime
WORKDIR /app
RUN groupadd --gid 10001 scada && useradd --uid 10001 --gid scada --no-create-home scada
COPY --from=backend --chown=scada:scada /build/backend/target/scada-platform-0.1.0.jar /app/scada.jar
USER scada
ENV SPRING_PROFILES_ACTIVE=hosted
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=60 -XX:+ExitOnOutOfMemoryError"
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/scada.jar"]
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

## docs/adr/0002-editor.md
````
# ADR 0002 — editor de telas e persistência de arquivos

Status: implementado na versão 0.2.0.

Fabric.js 7.4.0 fornece seleção e transformação de objetos. A dependência é fixada no lockfile e carregada em um módulo separado ao abrir o editor. O backend e o contrato de tags permanecem compatíveis com 0.1.0.

O documento HMI é a fonte da geometria, ordem e vínculos. Objetos Fabric são uma representação desse documento. Valores recebidos do servidor atualizam somente a representação em Operação; não entram no histórico nem no arquivo exportado.

Foi escolhido um formato JSON próprio, com versão e validação estrita, em vez de importar cenas nativas da biblioteca. Isso mantém o contrato pequeno, revisável e independente de mecanismos de construção de classes ou carregamento de URLs.

Neste incremento, persistência significa exportação de arquivo local. Não há gravação automática no servidor. Navegação interna preserva o documento em memória; recarregar exige abrir um JSON exportado.

Grupos, imagens/SVG, expressões e plugins estão fora desse contrato. Serão incluídos somente com requisitos e validações específicos.

Referência: https://fabricjs.com/docs/getting-started/installing/
````

## docs/architecture.md
````
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
````

## docs/deployment.md
````
# Publicação da demonstração

## Arquitetura de hospedagem

O Dockerfile constrói o frontend, executa seus testes e inclui o resultado no JAR Java pelo perfil Maven `web-ui`. O servidor atende a página, `/api` e `/ws` no mesmo domínio. O navegador escolhe automaticamente WSS quando a página usa HTTPS.

O contêiner final contém somente Java e a aplicação; executa como usuário sem privilégios. `.dockerignore` usa uma lista de inclusão, deixando ferramentas locais, Git, arquivos de ambiente e credenciais fora do contexto de build.

O perfil Spring `hosted` escuta a porta fornecida pelo provedor. O perfil local continua limitado a loopback. As variáveis utilizadas são de configuração, não de autenticação:

| Variável | Origem / finalidade |
| --- | --- |
| PORT | Porta fornecida pela hospedagem |
| SPRING_PROFILES_ACTIVE | hosted |
| RENDER_EXTERNAL_URL | Domínio HTTPS fornecido pelo Render |
| PUBLIC_ORIGIN | Opcional; origem exata ao usar domínio próprio |

Não colocar chaves ou tokens no repositório, Dockerfile ou frontend. Esta demonstração não precisa de credenciais de equipamentos ou APIs externas.

## Render

1. Criar/acessar uma conta Render e conectar o GitHub, limitando o acesso a `SheusV/sistema-supervisorio`.
2. Criar um Blueprint a partir desse repositório para usar `render.yaml`, ou criar um Web Service com runtime Docker, branch main e Dockerfile na raiz.
3. Revisar o plano Free e seus limites na conta antes de confirmar. Não é plano de produção e pode haver quotas/condições de cobrança da conta.
4. Usar `/api/health` como verificação de saúde. Não cadastrar banco de dados nesta etapa.
5. Aguardar a compilação e conferir HTTPS, WebSocket, editor e exportação de JSON na URL retornada pelo provedor.

Publicado em 06/11/2026: https://nexo-scada-demo.onrender.com. Serviço nexo-scada-demo, plano Free, região Virginia, branch main, GitHub autorizado e repositório vinculado pelo provedor Git, com publicação automática a cada envio à main. Criado diretamente como Web Service; render.yaml permanece como modelo para reproduzir a infraestrutura e não está vinculado a um Blueprint. Health Check Path configurado como /api/health no painel; endpoint conferido externamente com resposta UP. Os seis testes de navegador passaram contra o endereço público.

## Atualizações

A configuração usa `autoDeployTrigger: commit` na branch main. Isso requer conectar o GitHub ao Render; a opção de publicar apenas por uma URL pública de repositório não habilita deploy automático.

Fluxo: alteração em branch → testes e revisão de segredos → integração na main → Render reconstrói a imagem → testes Java/frontend dentro do build → verificação de saúde → nova versão na mesma URL. Se o build falhar, corrigir antes de considerar a nova versão publicada. Testes de navegador continuam sendo executados antes do envio.

O simulador reinicia em cada deploy. Documentos do editor ficam no navegador até exportação; não há persistência no servidor. Exporte alterações antes de atualizar a página. Conexões WebSocket podem cair durante a troca de versão e o cliente tenta reconectar.

## Plano gratuito

O serviço gratuito pode suspender após inatividade e levar cerca de um minuto para retomar. Existem limites de horas, banda e builds. A oferta e os valores devem ser conferidos na conta. Não prometer disponibilidade industrial nem usar estratégias de tráfego artificial para evitar a suspensão.

## Teste local do pacote

Com dependências já instaladas, na raiz do projeto:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Build-Package.ps1
java -jar backend/target/scada-platform-0.1.0.jar
```

Abra http://127.0.0.1:8080. Este modo mantém o perfil local. Para testar o perfil de hospedagem, mantendo o acesso restrito ao computador:

```powershell
java -jar backend/target/scada-platform-0.1.0.jar --spring.profiles.active=hosted --server.address=127.0.0.1 --server.port=8081 --scada.allowed-origins=http://127.0.0.1:8081
```

Os testes de navegador podem apontar para o pacote:

```powershell
Set-Location frontend
$env:E2E_BASE_URL = 'http://127.0.0.1:8081'
npm.cmd run test:e2e
```

Se Docker estiver instalado, `docker build -t nexo-scada .` constrói a imagem e `docker run --rm -p 127.0.0.1:8080:8080 nexo-scada` inicia a demonstração no computador. Docker não está instalado localmente; o build real da imagem foi concluído e validado no Render.

## Limites de segurança

A publicação é uma demonstração pública com dados sintéticos e consultas de leitura. Não há login, dados privados, uploads no servidor, conexão OT ou comandos físicos. Projetos importados são processados apenas no navegador. TLS é terminado pelo provedor; o perfil hosted usa cabeçalhos encaminhados exclusivamente atrás desse proxy.

Qualquer evolução que inclua persistência compartilhada, dados reais ou administração remota exige autenticação, autorização e revisão específica antes de publicação.

Referências oficiais: https://render.com/docs/docker ; https://render.com/docs/deploys ; https://render.com/docs/websocket ; https://render.com/docs/free
````

## docs/editor.md
````
# Editor de telas — contrato v1

O editor usa Fabric.js 7.4.0 para seleção e transformação, mas o arquivo salvo é um modelo de domínio próprio. Não se importa JSON nativo do Fabric nem se executam classes indicadas pelo arquivo.

## Modelo

- `schemaVersion`: 1.
- `name`: nome de 1 a 80 caracteres.
- `screen`: largura 1200 e altura 720.
- `components`: até 100 componentes, na ordem de fundo para frente.

Cada componente contém exatamente: `id`, `kind`, `label`, `x`, `y`, `width`, `height`, `angle` e `binding`.

| Campo | Regra |
| --- | --- |
| id | Único, até 80 caracteres alfanuméricos, hífen ou sublinhado |
| kind | tank, pump, indicator ou text |
| label | 1–64 caracteres; renderizado como texto, sem HTML |
| x / y | 0–1160 / 0–688 pixels |
| width / height | 40–500 / 32–500 pixels |
| angle | −180 a 180 graus |
| binding | Tag compatível ou null |

Componentes rotacionados ou próximos das bordas podem ultrapassar os limites visuais da tela e serão recortados pelo canvas. O painel permite reposicioná-los. Coordenadas e dimensões são finitas; valores fora dos limites são rejeitados.

Tanques vinculam `TQ001.LEVEL`; bombas vinculam `P001.RUNNING`; indicadores vinculam nível ou temperatura; textos não possuem vínculo. Novas tags e tipos exigem ampliação explícita do contrato.

## Segurança da importação

Limite de arquivo: 256 KiB, validado antes da leitura e novamente no parser. O parser rejeita campos inesperados, tipos não suportados, IDs repetidos, números inválidos e vínculos incompatíveis. Não há URLs, imagens, scripts, expressões livres, eval, importação SVG ou desserialização arbitrária. Objetos Fabric são construídos exclusivamente pelo código da aplicação.

O projeto é validado por completo antes da substituição da tela. Falhas mantêm a tela atual. Abrir um projeto válido é uma ação reversível pelo histórico. Os valores das tags e credenciais não são exportados.

## Edição e operação

Edição usa valores ilustrativos e mantém seleção, arraste, redimensionamento e rotação. Ajustar à grade arredonda a posição para múltiplos de 20 px; dimensões exatas podem ser informadas no painel. A ordem dos componentes determina a sobreposição.

Operação mantém a geometria e bloqueia seleção/alteração. Somente dados GOOD de uma conexão ativa são apresentados. Sem vínculo, com qualidade ruim ou com desconexão, aparece indisponibilidade. Receber uma medição não altera o documento nem seu histórico.

O histórico guarda até 60 revisões; uma nova alteração após desfazer limpa o caminho de refazer. O estado permanece durante a navegação interna. Exportação JSON é necessária para recuperação após recarga. O aviso de saída depende do comportamento do navegador e não substitui a exportação.

## Limites deste incremento

Uma tela por projeto, quatro tipos de componente, sem grupos permanentes, importação de imagens ou servidor de projetos. A edição não grava tags nem substitui automaticamente o sinótico fixo de Supervisão.

## Seleção múltipla — 0.3.0

Shift + clique acrescenta ou remove objetos da seleção. Na lista, Ctrl/Cmd + clique também funciona. Arraste uma área vazia para selecionar objetos, ou use Selecionar todos e Limpar seleção no painel. A seleção é temporária e não altera o contrato JSON v1.

Arrastar uma seleção múltipla mantém distâncias, tamanhos, rotações e vínculos. A grade arredonda o deslocamento conjunto para múltiplos de 20 px; os limites de posição restringem o deslocamento do conjunto sem separar seus objetos. Redimensionamento e rotação são individuais.

Alinhamento usa as bordas ou centros do retângulo envolvente da seleção, considerando a rotação de cada componente. Distribuição exige três objetos, mantém os extremos e iguala os espaços entre as caixas. Se não houver espaço ou uma posição exceder o contrato, a ação é recusada sem alterar o documento. Não se aplica arredondamento à grade ao alinhar ou distribuir; posições podem conter até três casas decimais.

Alinhamento, distribuição, movimento e exclusão conjunta geram uma revisão por ação. Desfazer recupera todos os componentes afetados. Modo Operação desativa seleção e comandos de edição.

Referência da biblioteca: https://fabricjs.com/docs/getting-started/installing/
````

## docs/roadmap.md
````
# Próximos incrementos

1. Etapa 0 validada tecnicamente: backend, frontend e fluxo WebSocket real, incluindo reconexão após interrupção do transporte. Revisão visual pelo usuário disponível.
2. Editor HMI inicial entregue em 0.2.0; seleção múltipla, movimento conjunto, alinhamento e distribuição entregues em 0.3.0. Próxima evolução: grupos permanentes e importação segura de imagens.
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
# Relatório de validação — versão 0.3.0

Data: 06/11/2026. Ambiente: Windows, Node.js 24.22.1, Java 21.0.13, Microsoft Edge.

## Resultado

Editor integrado e validado com o simulador Java. A supervisão existente permanece funcional. Nenhum equipamento físico foi conectado.

## Verificações realizadas

- TypeScript: compilação sem erros.
- Vite: build de produção aprovado; editor carregado separadamente da tela inicial.
- Vitest: **32 testes aprovados em 5 arquivos**.
- Playwright/Edge: **8 testes aprovados**, com o frontend atualizado e o simulador Java local; os mesmos oito testes passaram no endereço público após a publicação da versão 0.3.0.
- Dependências npm: instalação concluída; auditoria reportou zero vulnerabilidades no momento da instalação.
- Backend sem alterações neste incremento: os **5 testes Java** e o pacote integrado foram aprovados na preparação de hospedagem. O Dockerfile executa novamente os testes Java/frontend em cada build.
- Docker não está instalado localmente. A hospedagem usa a imagem Linux construída pelo Render em https://nexo-scada-demo.onrender.com.

## Cobertura do editor

- Seleção múltipla pela lista, movimento conjunto no canvas, preservação de rotação e vínculos.
- Seis alinhamentos, distribuição com dimensões diferentes, limites de movimento e rejeição atômica de posições inválidas ou espaço insuficiente.
- Alinhar/excluir vários objetos em uma revisão; recuperação pelo histórico e exportação/reabertura compatível com JSON v1.

- Arquivo de exemplo distribuído aceito pelo parser.
- Preservação de geometria, rotação, rótulo, ordem e vínculo ao exportar e reabrir.
- Rejeição de campos desconhecidos, URLs, scripts, estruturas inválidas, IDs repetidos, limites excedidos e tags incompatíveis.
- Histórico de 60 revisões, desfazer/refazer e descarte do caminho de refazer após nova edição.
- Inserção de componente, propriedades, ordem de exibição e download JSON no navegador.
- Reabertura do JSON exportado sem perder o vínculo.
- Arraste com mouse e ajuste à grade; desfazer retorna à posição anterior.
- Operação com valores recebidos do Java real; biblioteca e propriedades bloqueadas nesse modo.
- Navegação interna preserva o documento; arquivo inválido preserva a tela atual.
- Tela estreita sem transbordamento horizontal da página.

Os testes de contrato usam mensagens controladas; três testes de navegador usam o backend real: supervisão, reconexão do transporte e operação do editor. A restrição de importar conteúdo fora da raiz do servidor Vite foi respeitada: o teste do exemplo lê o arquivo diretamente como dado local de teste, sem ampliar as permissões do servidor web.

## Capturas

- `screenshots/editor-selecao-multipla.png`: painel de alinhamento e distribuição da versão 0.3.0.

- `screenshots/editor-v0.2.png`: edição e reabertura de projeto com dados controlados.
- `screenshots/editor-operacao-java.png`: editor em Operação com o simulador Java.
- `screenshots/desktop-java-live.png`: supervisão conectada ao Java.
- Arquivos terminados em `test-data.png`: interface com dados controlados.

## Limites

Não foram validados carga, persistência em servidor ou equipamentos industriais. O projeto permanece em memória até ser exportado. Imagens/SVG, grupos permanentes e conexões industriais não fazem parte desta versão.

A validação de reconexão interrompe o transporte WebSocket e verifica sua recuperação; não equivale a um teste de reinício manual do processo Java. Não há certificação de segurança ou disponibilidade industrial.
````

## examples/water-tank/project.json
````
{"schemaVersion":1,"name":"Tanque TQ-001","screen":{"width":1200,"height":720},"components":[{"id":"title","kind":"text","label":"ALIMENTAÇÃO / TQ-001","x":100,"y":64,"width":360,"height":48,"angle":0,"binding":null},{"id":"tank","kind":"tank","label":"TQ-001","x":510,"y":190,"width":180,"height":260,"angle":0,"binding":"TQ001.LEVEL"},{"id":"pump","kind":"pump","label":"P-001","x":180,"y":310,"width":160,"height":130,"angle":0,"binding":"P001.RUNNING"},{"id":"temperature","kind":"indicator","label":"TT-001","x":860,"y":240,"width":160,"height":130,"angle":0,"binding":"TQ001.TEMPERATURE"}]}
````

## frontend/e2e/editor.spec.ts
````
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { frame } from "../src/test/fixture";

test("edits, exports and reopens the same screen with bindings and layer order", async ({
  page,
}) => {
  await page.routeWebSocket("**/ws/tags", (stream) =>
    stream.send(JSON.stringify(frame())),
  );
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await expect(page.getByLabel("Editor de telas")).toBeVisible();
  await page.getByRole("button", { name: "Tanque", exact: true }).click();
  await expect(page.getByLabel("Identificação", { exact: true })).toHaveValue(
    "Tanque",
  );
  await page.getByLabel("Identificação", { exact: true }).fill("TQ-002");
  await page.getByLabel("X", { exact: true }).click();
  await page.getByLabel("X", { exact: true }).fill("340");
  await page.getByLabel("Y", { exact: true }).click();
  await page.getByLabel("Y", { exact: true }).fill("220");
  await page.getByLabel("Largura", { exact: true }).click();
  await page.getByLabel("Largura", { exact: true }).fill("230");
  await page.getByLabel("Rotação", { exact: true }).click();
  await page.getByLabel("Rotação", { exact: true }).fill("30");
  await page.getByLabel("Tag vinculada").click();
  await expect(page.getByLabel("Rotação", { exact: true })).toHaveValue("30");
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect(page.getByLabel("Rotação", { exact: true })).toHaveValue("0");
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  await expect(page.getByLabel("Rotação", { exact: true })).toHaveValue("30");
  await page.getByRole('button', { name: 'Para trás', exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Salvar projeto" }).click();
  const file = await download;
  const data = JSON.parse(await readFile((await file.path())!, "utf8"));
  expect(data.components).toHaveLength(5);
  expect(data.components[3]).toMatchObject({
    label: "TQ-002",
    x: 340,
    y: 220,
    width: 230,
    angle: 30,
    binding: "TQ001.LEVEL",
  });
  await page.getByRole("button", { name: "Excluir componente" }).click();
  await page
    .getByLabel("Arquivo de projeto")
    .setInputFiles({
      name: "projeto.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(data)),
    });
  await page
    .getByRole("button", { name: "Tanque TQ-002", exact: true })
    .click();
  await expect(page.getByLabel("X", { exact: true })).toHaveValue("340");
  await expect(page.getByLabel("Rotação", { exact: true })).toHaveValue("30");
  await page.screenshot({
    path: "../docs/screenshots/editor-v0.2.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Operação", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Tanque", exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("Valores em operação")).toContainText(
    "TQ-002: 42 %",
  );
  await page.getByRole("button", { name: "Tags", exact: true }).click();
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Tanque TQ-002", exact: true }),
  ).toBeVisible();
});

test("rejects unsafe project fields without replacing the current screen", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await page
    .getByLabel("Arquivo de projeto")
    .setInputFiles({
      name: "malformed.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        '{"schemaVersion":1,"src":"https://example.com/active.svg"}',
      ),
    });
  await expect(
    page.getByText("O projeto contém campos ausentes ou não suportados."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Tanque TQ-001", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("moves equipment with the mouse and operates using the Java stream", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Conectado");
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await page
    .getByRole("button", { name: "Tanque TQ-001", exact: true })
    .click();
  const scale =
    Number(await page.getByLabel("Zoom", { exact: true }).inputValue()) / 100;
  const area = (await page.locator(".upper-canvas").boundingBox())!;
  await page.mouse.move(area.x + 600 * scale, area.y + 320 * scale);
  await page.mouse.down();
  await page.mouse.move(area.x + 690 * scale, area.y + 370 * scale, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(page.getByLabel("X", { exact: true })).toHaveValue("600");
  await expect(page.getByLabel("Y", { exact: true })).toHaveValue("240");
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect(page.getByLabel("X", { exact: true })).toHaveValue("510");
  await page.getByRole("button", { name: "Operação", exact: true }).click();
  const readings = page.getByLabel("Valores em operação");
  await expect(readings).not.toContainText("Indisponível");
  const initial = await readings.textContent();
  await expect(readings).not.toHaveText(initial!);
  await page.screenshot({
    path: "../docs/screenshots/editor-operacao-java.png",
    fullPage: true,
  });
});
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

## frontend/e2e/layout.spec.ts
````
import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const project = { schemaVersion: 1, name: "Organização", screen: { width: 1200, height: 720 }, components: [
  { id: "a", kind: "pump", label: "P-A", x: 100, y: 100, width: 160, height: 130, angle: 0, binding: "P001.RUNNING" },
  { id: "b", kind: "tank", label: "T-B", x: 400, y: 220, width: 180, height: 260, angle: 0, binding: "TQ001.LEVEL" },
  { id: "c", kind: "indicator", label: "I-C", x: 900, y: 400, width: 160, height: 130, angle: 0, binding: "TQ001.TEMPERATURE" },
] };
async function exported(page: Page) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Salvar projeto" }).click();
  const download = await pending;
  return JSON.parse(await readFile((await download.path())!, "utf8")) as typeof project;
}
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await page.getByLabel("Arquivo de projeto").setInputFiles({ name: "layout.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(project)) });
  await expect(page.getByRole("button", { name: "Bomba P-A", exact: true })).toBeVisible();
});
test("aligns and distributes a selection, undoes once and reopens its JSON", async ({ page }) => {
  await page.getByRole("button", { name: "Bomba P-A", exact: true }).click();
  await page.getByRole("button", { name: "Tanque T-B", exact: true }).click({ modifiers: ["Shift"] });
  await expect(page.getByText("2 objetos selecionados", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Distribuir na horizontal", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Alinhar à esquerda", exact: true }).click();
  expect((await exported(page)).components.map(i => i.x)).toEqual([100, 100, 900]);
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  expect((await exported(page)).components).toEqual(project.components);
  await page.getByRole("button", { name: "Selecionar todos", exact: true }).click();
  await page.getByRole("button", { name: "Distribuir na horizontal", exact: true }).click();
  const result = await exported(page);
  expect(result.components.map(i => i.x)).toEqual([100, 490, 900]);
  await page.getByRole("button", { name: "Excluir selecionados", exact: true }).click();
  expect((await exported(page)).components).toHaveLength(0);
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  expect((await exported(page)).components).toEqual(result.components);
  await page.getByLabel("Arquivo de projeto").setInputFiles({ name: "layout.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(result)) });
  expect((await exported(page)).components).toEqual(result.components);
  await page.getByRole("button", { name: "Selecionar todos", exact: true }).click();
  await page.screenshot({ path: "../docs/screenshots/editor-selecao-multipla.png", fullPage: true });
  await page.getByRole("button", { name: "Operação", exact: true }).click();
  await expect(page.getByRole("button", { name: "Alinhar à esquerda", exact: true })).toHaveCount(0);
  await expect(page.getByText("Edição bloqueada durante a operação.")).toBeVisible();
});
test("moves a multi-selection together on the canvas and preserves rotation", async ({ page }) => {
  const rotated = structuredClone(project); rotated.components[1].angle = 30;
  await page.getByLabel("Arquivo de projeto").setInputFiles({ name: "rotated.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(rotated)) });
  await page.getByRole("button", { name: "Bomba P-A", exact: true }).click();
  await page.getByRole("button", { name: "Tanque T-B", exact: true }).click({ modifiers: ["Shift"] });
  const scale = Number(await page.getByLabel("Zoom", { exact: true }).inputValue()) / 100;
  const area = (await page.locator(".upper-canvas").boundingBox())!;
  await page.mouse.move(area.x + 180 * scale, area.y + 165 * scale);
  await page.mouse.down();
  await page.mouse.move(area.x + 260 * scale, area.y + 225 * scale, { steps: 8 });
  await page.mouse.up();
  const result = await exported(page);
  expect(result.components[0]).toMatchObject({ x: 180, y: 160 });
  expect(result.components[1]).toMatchObject({ x: 480, y: 280, angle: 30, width: 180, height: 260 });
  expect(result.components[2]).toEqual(project.components[2]);
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  expect((await exported(page)).components).toEqual(rotated.components);
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
  "version": "0.3.0",
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
    "fabric": "7.4.0",
    "react": "19.3.1",
    "react-dom": "19.3.1"
  },
  "devDependencies": {
    "@playwright/test": "1.65.0",
    "@testing-library/jest-dom": "7.0.1",
    "@testing-library/react": "16.3.3",
    "@types/node": "26.6.6",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "@vitejs/plugin-react": "6.2.1",
    "jsdom": "31.0.0",
    "typescript": "7.0.2",
    "vite": "8.3.6",
    "vitest": "5.1.0"
  }
}
````

## frontend/playwright.config.ts
````
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:5173",
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
import { lazy, Suspense, useEffect, useReducer, useState } from "react";
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
            <small>v0.3.0 · Engenharia</small>
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
              <div className="eyebrow">UNIDADE DE PROCESSO / 01</div>
              <h1>
                {page === "Supervisão"
                  ? "Visão geral do processo"
                  : page === "Editor"
                    ? "Editor de telas"
                    : page}
              </h1>
              <p>
                Tanque TQ-001 <span className="separator">•</span>{" "}
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
              <h3>Como salvar e recuperar o projeto?</h3>
              <p>
                Salvar projeto exporta um arquivo JSON. Abrir JSON recupera a
                tela, as dimensões e os vínculos. As alterações permanecem ao
                navegar entre as páginas, mas não sobrevivem ao recarregamento
                sem exportação. Desfazer e Refazer mantêm até 60 alterações. A
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

## frontend/src/editor/editor.css
````
.editor {
  border: 1px solid #d7e0e8;
  background: #fff;
  border-radius: 6px;
  overflow: hidden;
}
.editor button {
  border: 1px solid #d6dfe7;
  background: white;
  color: #344b60;
  border-radius: 4px;
  padding: 8px 11px;
  font-size: 11px;
}
.editor button:hover:not(:disabled) {
  border-color: #7795aa;
  background: #f4f8fb;
}
.editor button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 12px 14px;
  border-bottom: 1px solid #dce4eb;
  flex-wrap: wrap;
}
.mode-switch {
  display: flex;
}
.mode-switch button {
  border-radius: 0;
}
.mode-switch button:first-child {
  border-radius: 4px 0 0 4px;
}
.mode-switch button:last-child {
  border-radius: 0 4px 4px 0;
}
.mode-switch button[aria-pressed="true"] {
  background: #203b54;
  color: #fff;
  border-color: #203b54;
}
.toolbar-divider {
  height: 22px;
  border-left: 1px solid #dce4eb;
  margin: 0 5px;
}
.toolbar-files {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}
.save-state {
  font-size: 10px;
  color: #7b8997;
  margin-right: 6px;
}
.editor .primary-action {
  background: #245f80;
  color: #fff;
  border-color: #245f80;
}
.editor-layout {
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr) 210px;
  min-height: 540px;
}
.component-library {
  border-right: 1px solid #dce4eb;
  padding: 17px 12px;
}
.editor h2 {
  font-size: 12px;
  margin: 0 0 10px;
  font-weight: 650;
}
.component-library > p {
  font-size: 10px;
  color: #8493a1;
  margin: 0 0 17px;
}
.library-items {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
}
.library-items button {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  padding: 12px 4px;
}
.library-symbol {
  display: block;
  width: 24px;
  height: 29px;
  border: 2px solid #7992a4;
  border-radius: 5px;
  position: relative;
}
.library-symbol.tank:after {
  content: "";
  position: absolute;
  bottom: 2px;
  left: 2px;
  right: 2px;
  height: 10px;
  background: #579ca3;
}
.library-symbol.pump {
  border-radius: 50%;
  height: 24px;
  margin-bottom: 5px;
}
.library-symbol.pump:after {
  content: "";
  position: absolute;
  left: 6px;
  top: 4px;
  border-left: 10px solid #7992a4;
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
}
.library-symbol.indicator {
  height: 19px;
  width: 29px;
  margin: 5px 0;
}
.library-symbol.indicator:after {
  content: "25";
  position: absolute;
  font-size: 10px;
  left: 5px;
  top: 2px;
}
.library-symbol.text {
  border: 0;
  border-radius: 0;
}
.library-symbol.text:after {
  content: "T";
  font-family: Georgia, serif;
  font-size: 29px;
  position: absolute;
  top: -3px;
  left: 3px;
}
.editor .layers-heading {
  margin-top: 26px;
  display: flex;
  justify-content: space-between;
}
.layers-heading span {
  color: #8595a3;
  font-weight: 400;
}
.layer-list {
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 380px;
  overflow: auto;
}
.layer-list li {
  margin-bottom: 5px;
}
.layer-list button {
  width: 100%;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-color: transparent;
}
.layer-list button[aria-pressed="true"] {
  background: #eaf2f8;
  border-color: #c3d9e9;
}
.layer-kind {
  display: block;
  color: #8a9bab;
  font-size: 9px;
  margin-bottom: 3px;
}
.editor-workspace {
  min-width: 0;
  background: #e9eef3;
  display: flex;
  flex-direction: column;
}
.screen-title {
  display: flex;
  justify-content: space-between;
  padding: 12px 17px;
  font-size: 10px;
  color: #718395;
  border-bottom: 1px solid #d8e1e8;
  background: #f6f8fa;
}
.screen-title span:first-child {
  font-weight: 600;
  color: #3e5265;
}
.canvas-scroll {
  padding: 18px;
  overflow: auto;
  min-height: 360px;
  flex: 1;
}
.canvas-scroll .canvas-container {
  box-shadow: 0 1px 7px #1f35451a;
  background: white;
}
.canvas-scroll.editing .canvas-container {
  background-image: radial-gradient(#c5d0d8 0.8px, transparent 0.8px);
  background-size: 14px 14px;
}
.canvas-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  background: #f5f7f9;
  border-top: 1px solid #d5dfe8;
  font-size: 10px;
  color: #6d8093;
  flex-wrap: wrap;
}
.canvas-controls label:first-child {
  margin-right: auto;
}
.canvas-controls input {
  vertical-align: middle;
}
.canvas-controls select {
  font: inherit;
  padding: 3px;
  border: 1px solid #d2dce5;
  border-radius: 3px;
  margin-left: 5px;
}
.canvas-controls button {
  padding: 4px 8px;
}
.editor-hint {
  font-size: 10px;
  color: #6d7f90;
  padding: 12px 15px;
  border-top: 1px solid #dce4eb;
  background: #f5f7f9;
  line-height: 1.6;
}
.properties {
  border-left: 1px solid #dce4eb;
  padding: 17px 14px;
}
.properties label {
  display: block;
  font-size: 10px;
  color: #718596;
  margin: 15px 0 0;
}
.properties input,
.properties select {
  width: 100%;
  border: 1px solid #d2dce5;
  border-radius: 4px;
  padding: 8px;
  font:
    12px Segoe UI,
    Arial;
  color: #344b60;
  margin-top: 6px;
  background: #fff;
}
.geometry-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 9px;
}
.property-note,
.empty-properties {
  font-size: 11px;
  color: #7a8d9e;
  line-height: 1.7;
  margin-top: 16px;
}
.selected-type {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #668194;
  border-bottom: 1px solid #e5ebef;
  padding-bottom: 13px;
}
.selection-actions, .alignment-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-bottom: 16px;
}
.alignment-actions { grid-template-columns: 1fr; }
.multiple-properties > p { font-size: 12px; color: #405d73; }
.properties h3 {
  font-size: 10px;
  font-weight: 500;
  color: #718596;
  margin-top: 24px;
}
.layer-actions {
  display: flex;
  gap: 5px;
}
.layer-actions button {
  padding: 7px;
  font-size: 10px;
}
.editor .delete-component {
  color: #a44f4f;
  border-color: #ead5d5;
  margin-top: 28px;
  width: 100%;
}
.editor-message {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f4f7fa;
  border-top: 1px solid #dae3ea;
  padding: 10px 15px;
  font-size: 12px;
  color: #405d73;
}
.editor-message button {
  border: 0;
  background: none;
  font-size: 20px;
  padding: 0 8px;
}
.runtime-readings {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 15px;
  background: #fff;
  font-size: 10px;
  color: #7d8fa0;
}
.runtime-readings strong {
  font-weight: 600;
  color: #35556f;
}
.main:has(.editor) {
  width: calc(100% - 228px);
}
main:has(.editor) {
  max-width: none;
  padding-left: 24px;
  padding-right: 24px;
}
@media (max-width: 1100px) {
  .editor-layout {
    grid-template-columns: 130px minmax(0, 1fr) 180px;
  }
  .save-state {
    display: none;
  }
  .main:has(.editor) {
    width: calc(100% - 185px);
  }
}
@media (max-width: 850px) {
  .editor-layout {
    grid-template-columns: 110px minmax(0, 1fr);
  }
  .properties {
    grid-column: 1/-1;
    border-left: 0;
    border-top: 1px solid #dce4eb;
  }
  .geometry-fields {
    grid-template-columns: repeat(5, 1fr);
  }
  .properties input,
  .properties select {
    max-width: 280px;
  }
  .library-items {
    grid-template-columns: 1fr;
  }
  .toolbar-files {
    margin-left: 0;
  }
  .canvas-scroll {
    min-height: 260px;
  }
  .main:has(.editor) {
    width: 100%;
  }
}
@media (max-width: 720px) {
  main:has(.editor) {
    padding: 20px 12px;
  }
  .editor-toolbar {
    gap: 5px;
    padding: 10px;
  }
  .editor button {
    font-size: 10px;
    padding: 7px 8px;
  }
  .editor-layout {
    grid-template-columns: 94px minmax(0, 1fr);
  }
  .component-library {
    padding: 14px 7px;
  }
  .screen-title {
    gap: 8px;
    padding: 10px;
  }
  .screen-title span:last-child {
    white-space: nowrap;
  }
  .geometry-fields {
    grid-template-columns: repeat(3, 1fr);
  }
  .canvas-controls {
    gap: 5px;
  }
  .layer-list button {
    font-size: 9px;
  }
}
.editor .mode-switch button[aria-pressed="true"]:hover {
  background: #203b54;
  color: #fff;
}
.editor .primary-action:hover {
  background: #1b4f6d;
  color: #fff;
}
@media (min-width: 721px) and (max-width: 850px) {
  .main:has(.editor) {
    width: calc(100% - 185px);
  }
}
````

## frontend/src/editor/Editor.tsx
````
import { useEffect, useRef, useState, type Dispatch } from "react";
import { ActiveSelection, Canvas, Pattern } from "fabric";
import { arrange, layoutLabels, moveTogether, type LayoutAction } from "./layout";
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editing, setEditing] = useState(true);
  const [zoom, setZoom] = useState(70);
  const [snap, setSnap] = useState(true);
  const [message, setMessage] = useState("");
  const [sceneRevision, setSceneRevision] = useState(0);
  const selected = selectedIds.length === 1 ? project.components.find((item) => item.id === selectedIds[0]) : undefined;
  const state = useRef({ project, editing, snap });
  state.current = { project, editing, snap };
  const change = (next: HmiProject) => {
    dispatch({ type: "change", project: next });
    setSceneRevision(value => value + 1);
    onDirty(true);
  };
  const changeRef = useRef(change);
  changeRef.current = change;

  useEffect(() => {
    if (!canvasElement.current) return;
    const instance = new Canvas(canvasElement.current, {
      width: 840,
      height: 504,
      selection: true,
      preserveObjectStacking: true,
      backgroundColor: "#ffffff",
    });
    canvas.current = instance;
    const identify = (target: unknown) =>
      [...widgets.current].find(([, widget]) => widget.root === target)?.[0] ??
      null;
    const syncSelection = () => {
      const active = instance.getActiveObject();
      if (active instanceof ActiveSelection) active.set({ hasControls: false, lockScalingX: true, lockScalingY: true, lockRotation: true });
      setSelectedIds(instance.getActiveObjects().map(identify).filter((id): id is string => id !== null));
    };
    instance.on("selection:created", syncSelection);
    instance.on("selection:updated", syncSelection);
    instance.on("selection:cleared", () => setSelectedIds([]));
    instance.on("object:moving", ({ target }) => {
      if (!state.current.snap) return;
      target.set({
        left: Math.round(target.left / 20) * 20,
        top: Math.round(target.top / 20) * 20,
      });
    });
    instance.on("object:modified", ({ target }) => {
      if (!state.current.editing) return;
      if (target instanceof ActiveSelection) {
        const ids = instance.getActiveObjects().map(identify).filter((id): id is string => id !== null);
        const first = state.current.project.components.find(item => item.id === ids[0]);
        const object = first && widgets.current.get(first.id)?.root;
        if (first && object) {
          const position = object.getXY();
          let dx = position.x - first.x, dy = position.y - first.y;
          if (state.current.snap) { dx = Math.round(dx / 20) * 20; dy = Math.round(dy / 20) * 20; }
          changeRef.current(moveTogether(state.current.project, ids, dx, dy));
        }
        return;
      }
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
    const active = selectedIds;
    instance.selection = editing;
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
    }
    const ids = editing ? active.filter(id => widgets.current.has(id)) : [];
    activate(ids);
    instance.requestRenderAll();
    // Selection changes do not rebuild the scene; document changes do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, editing, sceneRevision]);

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

  function activate(ids: string[]) {
    const instance = canvas.current;
    if (!instance) return;
    instance.discardActiveObject();
    const objects = ids.flatMap(id => { const widget = widgets.current.get(id); return widget ? [widget.root] : []; });
    if (objects.length === 1) instance.setActiveObject(objects[0]);
    if (objects.length > 1) instance.setActiveObject(new ActiveSelection(objects, {
      canvas: instance, hasControls: false, lockScalingX: true, lockScalingY: true, lockRotation: true,
    }));
    setSelectedIds(ids);
    instance.requestRenderAll();
  }
  function select(id: string, multiple = false) {
    if (!editing) return;
    activate(multiple ? selectedIds.includes(id) ? selectedIds.filter(value => value !== id) : [...selectedIds, id] : [id]);
  }
  function add(kind: ComponentKind) {
    if (!editing || project.components.length >= MAX_COMPONENTS) return;
    const item = createComponent(kind, project.components.length);
    setSelectedIds([item.id]);
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
      setSelectedIds([]);
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
              setSelectedIds([]);
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
                  aria-pressed={selectedIds.includes(item.id)}
                  onClick={(event) => select(item.id, event.shiftKey || event.ctrlKey || event.metaKey)}
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
              ? "Shift + clique para selecionar vários objetos, ou arraste uma área vazia. A seleção múltipla permite mover e alinhar. Valores ilustrativos em edição."
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
          {editing && <div className="selection-actions">
            <button disabled={!project.components.length} onClick={() => activate(project.components.map(item => item.id))}>Selecionar todos</button>
            <button disabled={!selectedIds.length} onClick={() => activate([])}>Limpar seleção</button>
          </div>}
          {editing && selectedIds.length > 1 && <div className="multiple-properties">
            <p role="status">{selectedIds.length} objetos selecionados</p>
            <h3>Alinhamento e espaçamento</h3>
            <p className="property-note">Usa os limites da seleção, considerando a rotação. Distribuir exige ao menos três objetos.</p>
            <div className="alignment-actions">
              {(Object.keys(layoutLabels) as LayoutAction[]).map(action => <button key={action}
                disabled={action.startsWith("space") && selectedIds.length < 3}
                onClick={() => {
                  try { change(arrange(project, selectedIds, action)); setMessage(""); }
                  catch (error) { setMessage((error as Error).message); }
                }}>{layoutLabels[action]}</button>)}
            </div>
            <button className="delete-component" onClick={() => {
              change({ ...project, components: project.components.filter(item => !selectedIds.includes(item.id)) });
              setSelectedIds([]);
            }}>Excluir selecionados</button>
          </div>}
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
                  setSelectedIds([]);
                }}
              >
                Excluir componente
              </button>
            </>
          ) : selectedIds.length <= 1 || !editing ? (
            <div className="empty-properties">
              {editing
                ? "Selecione um objeto na tela ou na lista para editar suas propriedades."
                : "Edição bloqueada durante a operação."}
            </div>
          ) : null}
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
````

## frontend/src/editor/layout.test.ts
````
import { describe, expect, it } from "vitest";
import { arrange, bounds, moveTogether } from "./layout";
import { createComponent, parseProject, projectReducer, serializeProject, type HmiProject } from "./project";

function fixture(): HmiProject {
  return { schemaVersion: 1, name: "Layout", screen: { width: 1200, height: 720 }, components: [
    { ...createComponent("pump", 0), id: "a", x: 100, y: 100, width: 80, height: 60 },
    { ...createComponent("tank", 0), id: "b", x: 330, y: 200, width: 120, height: 80 },
    { ...createComponent("indicator", 0), id: "c", x: 700, y: 400, width: 60, height: 40 },
  ] };
}
describe("selection layout", () => {
  it("aligns rotated boxes without changing bindings, size or order", () => {
    const project = fixture(); project.components[1].angle = 90;
    const result = arrange(project, ["a", "b"], "left");
    expect(bounds(result.components[0]).left).toBeCloseTo(bounds(result.components[1]).left);
    expect(result.components[1]).toMatchObject({ width: 120, height: 80, angle: 90, binding: "TQ001.LEVEL" });
    expect(result.components[2]).toEqual(project.components[2]);
    expect(project.components[1].x).toBe(330);
  });
  it.each(["right", "top", "bottom", "centerX", "centerY"] as const)("aligns %s", action => {
    const result = arrange(fixture(), ["a", "b", "c"], action);
    const values = result.components.map(item => {
      const b = bounds(item);
      return action === "centerX" ? (b.left + b.right) / 2 : action === "centerY" ? (b.top + b.bottom) / 2 : b[action];
    });
    expect(values[0]).toBeCloseTo(values[1]); expect(values[1]).toBeCloseTo(values[2]);
  });
  it.each(["spaceX", "spaceY"] as const)("distributes equal gaps for different dimensions: %s", action => {
    const result = arrange(fixture(), ["c", "a", "b"], action);
    const [a, b, c] = result.components.map(bounds);
    expect(action === "spaceX" ? b.left - a.right : b.top - a.bottom)
      .toBeCloseTo(action === "spaceX" ? c.left - b.right : c.top - b.bottom, 2);
    expect(result.components[0]).toEqual(fixture().components[0]);
    expect(result.components[2]).toEqual(fixture().components[2]);
  });
  it("rejects insufficient space and invalid positions atomically", () => {
    const project = fixture(); project.components.forEach(item => { item.x = 0; item.y = 0; });
    expect(() => arrange(project, ["a", "b", "c"], "spaceX")).toThrow("espaço suficiente");
    project.components[1].angle = 90;
    expect(() => arrange(project, ["a", "b"], "left")).toThrow("limites");
    expect(project.components[0].x).toBe(0);
  });
  it("clamps movement as a unit and preserves geometry and export", () => {
    const project = fixture(); project.components[1].angle = 35;
    const result = moveTogether(project, ["a", "b"], -200, 900);
    expect(result.components[0]).toMatchObject({ x: 0, y: 588 });
    expect(result.components[1]).toMatchObject({ x: 230, y: 688, angle: 35 });
    expect(result.components[2]).toEqual(project.components[2]);
    expect(parseProject(serializeProject(result))).toEqual(result);
  });
  it("undoes a whole alignment in one revision and ignores small selections", () => {
    const project = fixture();
    expect(arrange(project, ["a"], "left")).toBe(project);
    expect(arrange(project, ["a", "b"], "spaceX")).toBe(project);
    const changed = projectReducer({ past: [], present: project, future: [] }, { type: "change", project: arrange(project, ["a", "b"], "left") });
    expect(changed.past).toHaveLength(1);
    expect(projectReducer(changed, { type: "undo" }).present).toEqual(project);
  });
});
````

## frontend/src/editor/layout.ts
````
import { parseProject, type HmiComponent, type HmiProject } from "./project";

export type LayoutAction = "left" | "centerX" | "right" | "top" | "centerY" | "bottom" | "spaceX" | "spaceY";
export const layoutLabels: Record<LayoutAction, string> = {
  left: "Alinhar à esquerda", centerX: "Centralizar horizontalmente", right: "Alinhar à direita",
  top: "Alinhar ao topo", centerY: "Centralizar verticalmente", bottom: "Alinhar à base",
  spaceX: "Distribuir na horizontal", spaceY: "Distribuir na vertical",
};

// Bounds of the rotated component box in screen coordinates (top-left origin).
export function bounds(item: HmiComponent) {
  const radians = item.angle * Math.PI / 180;
  const c = Math.cos(radians), s = Math.sin(radians);
  const xs = [0, item.width * c, -item.height * s, item.width * c - item.height * s];
  const ys = [0, item.width * s, item.height * c, item.width * s + item.height * c];
  return { left: item.x + Math.min(...xs), right: item.x + Math.max(...xs),
    top: item.y + Math.min(...ys), bottom: item.y + Math.max(...ys) };
}

export function arrange(project: HmiProject, ids: string[], action: LayoutAction): HmiProject {
  const selected = project.components.filter(item => ids.includes(item.id));
  const spacing = action === "spaceX" || action === "spaceY";
  if (selected.length < (spacing ? 3 : 2)) return project;
  const horizontal = ["left", "right", "centerX", "spaceX"].includes(action);
  const start = horizontal ? "left" : "top", end = horizontal ? "right" : "bottom";
  const entries = selected.map(item => ({ item, box: bounds(item) }));
  const min = Math.min(...entries.map(e => e.box[start]));
  const max = Math.max(...entries.map(e => e.box[end]));
  const positions = new Map<string, number>();
  if (spacing) {
    entries.sort((a, b) => a.box[start] - b.box[start]);
    const gap = (max - min - entries.reduce((sum, e) => sum + e.box[end] - e.box[start], 0)) / (entries.length - 1);
    if (gap < -0.001) throw new Error("Afaste os objetos antes de distribuir: não há espaço suficiente entre os extremos.");
    let cursor = min;
    for (const { item, box } of entries) {
      positions.set(item.id, (horizontal ? item.x : item.y) + cursor - box[start]);
      cursor += box[end] - box[start] + Math.max(0, gap);
    }
  } else {
    for (const { item, box } of entries) {
      const delta = action === "left" || action === "top" ? min - box[start]
        : action === "right" || action === "bottom" ? max - box[end]
        : (min + max - box[start] - box[end]) / 2;
      positions.set(item.id, (horizontal ? item.x : item.y) + delta);
    }
  }
  const components = project.components.map(item => {
    const value = positions.get(item.id);
    return value === undefined ? item : { ...item, [horizontal ? "x" : "y"]: Math.round(value * 1000) / 1000 };
  });
  try { return parseProject(JSON.stringify({ ...project, components })); }
  catch { throw new Error("O alinhamento ultrapassa os limites de posição. Reposicione os objetos e tente novamente."); }
}

export function moveTogether(project: HmiProject, ids: string[], dx: number, dy: number): HmiProject {
  const items = project.components.filter(item => ids.includes(item.id));
  if (!items.length) return project;
  // Clamp the shared translation, preserving the distances between all objects.
  dx = Math.max(-Math.min(...items.map(i => i.x)), Math.min(1160 - Math.max(...items.map(i => i.x)), dx));
  dy = Math.max(-Math.min(...items.map(i => i.y)), Math.min(688 - Math.max(...items.map(i => i.y)), dy));
  return parseProject(JSON.stringify({ ...project, components: project.components.map(item => ids.includes(item.id)
    ? { ...item, x: item.x + dx, y: item.y + dy } : item) }));
}
````

## frontend/src/editor/project.test.ts
````
import { describe, expect, it } from "vitest";
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  exampleProject,
  parseProject,
  projectReducer,
  serializeProject,
  type ProjectHistory,
} from "./project";

describe("project files", () => {
  it('opens the distributed water-tank example', () => {
    const project = parseProject(readFileSync(resolve(process.cwd(), '../examples/water-tank/project.json'), 'utf8'));
    expect(project.components).toHaveLength(4);
    expect(project.components[1].binding).toBe('TQ001.LEVEL');
  });
  it("round trips geometry, layer order, labels and tag bindings", () => {
    const project = exampleProject();
    Object.assign(project.components[1], {
      x: 320,
      y: 180,
      angle: 45,
      width: 210,
    });
    expect(parseProject(serializeProject(project))).toEqual(project);
  });
  it.each([
    ["unsupported version", (p: any) => (p.schemaVersion = 2)],
    [
      "remote assets",
      (p: any) => (p.components[0].src = "https://example.com/image.svg"),
    ],
    ["scripts", (p: any) => (p.components[0].script = "alert(1)")],
    [
      "prototype injection",
      (p: any) =>
        Object.defineProperty(p, "__proto__", { value: {}, enumerable: true }),
    ],
    ["unexpected widget", (p: any) => (p.components[0].kind = "image")],
    [
      "incompatible tag",
      (p: any) => (p.components[1].binding = "P001.RUNNING"),
    ],
    ["negative dimension", (p: any) => (p.components[1].width = -1)],
    ["duplicate id", (p: any) => (p.components[1].id = p.components[0].id)],
    [
      "too many objects",
      (p: any) => (p.components = Array(101).fill(p.components[0])),
    ],
  ])("rejects %s", (_name, mutate) => {
    const project = exampleProject();
    mutate(project);
    expect(() => parseProject(JSON.stringify(project))).toThrow();
  });
  it("rejects malformed, oversized and missing data", () => {
    for (const input of ["null", "[]", "{", "{}", " ".repeat(262145)])
      expect(() => parseProject(input)).toThrow();
  });
  it("treats markup as plain text and preserves it without executing", () => {
    const project = exampleProject();
    project.components[0].label = "<script>alert(1)</script>";
    expect(parseProject(serializeProject(project)).components[0].label).toBe(
      "<script>alert(1)</script>",
    );
  });
});
describe("editing history", () => {
  it("undoes imports, redoes changes, and clears redo after a new edit", () => {
    const initial: ProjectHistory = {
      past: [],
      present: exampleProject(),
      future: [],
    };
    const changed = projectReducer(initial, {
      type: "change",
      project: { ...initial.present, name: "Tela 02" },
    });
    const undone = projectReducer(changed, { type: "undo" });
    expect(undone.present).toEqual(initial.present);
    expect(projectReducer(undone, { type: "redo" }).present.name).toBe(
      "Tela 02",
    );
    const branched = projectReducer(undone, {
      type: "change",
      project: { ...initial.present, name: "Tela 03" },
    });
    expect(branched.future).toHaveLength(0);
  });
  it("limits history to 60 revisions and ignores identical changes", () => {
    let state: ProjectHistory = {
      past: [],
      present: exampleProject(),
      future: [],
    };
    expect(
      projectReducer(state, { type: "change", project: state.present }),
    ).toBe(state);
    for (let index = 0; index < 70; index++)
      state = projectReducer(state, {
        type: "change",
        project: { ...state.present, name: `Tela ${index}` },
      });
    expect(state.past).toHaveLength(60);
  });
});
````

## frontend/src/editor/project.ts
````
import type { TagName } from "../tags/model";

export type ComponentKind = "tank" | "pump" | "indicator" | "text";
export interface HmiComponent {
  id: string;
  kind: ComponentKind;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  binding: TagName | null;
}
export interface HmiProject {
  schemaVersion: 1;
  name: string;
  screen: { width: 1200; height: 720 };
  components: HmiComponent[];
}
export const componentNames: Record<ComponentKind, string> = {
  tank: "Tanque",
  pump: "Bomba",
  indicator: "Indicador",
  text: "Texto",
};
export const bindings: Record<ComponentKind, TagName[]> = {
  tank: ["TQ001.LEVEL"],
  pump: ["P001.RUNNING"],
  indicator: ["TQ001.TEMPERATURE", "TQ001.LEVEL"],
  text: [],
};
export const MAX_COMPONENTS = 100;
export const MAX_PROJECT_BYTES = 262144;

export function createComponent(
  kind: ComponentKind,
  index: number,
): HmiComponent {
  return {
    id: crypto.randomUUID(),
    kind,
    label: componentNames[kind],
    x: 80 + (index % 8) * 24,
    y: 80 + (index % 8) * 24,
    width: kind === "tank" ? 180 : 160,
    height: kind === "tank" ? 260 : kind === "text" ? 48 : 130,
    angle: 0,
    binding: bindings[kind][0] ?? null,
  };
}
export function exampleProject(): HmiProject {
  return {
    schemaVersion: 1,
    name: "Tanque TQ-001",
    screen: { width: 1200, height: 720 },
    components: [
      {
        ...createComponent("text", 0),
        label: "ALIMENTAÇÃO / TQ-001",
        x: 100,
        y: 64,
        width: 360,
      },
      { ...createComponent("tank", 0), label: "TQ-001", x: 510, y: 190 },
      { ...createComponent("pump", 0), label: "P-001", x: 180, y: 310 },
      { ...createComponent("indicator", 0), label: "TT-001", x: 860, y: 240 },
    ],
  };
}

function record(input: unknown, keys: string[]): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Estrutura de projeto inválida.");
  const object = input as Record<string, unknown>;
  if (
    Object.keys(object).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(object, key))
  ) {
    throw new Error("O projeto contém campos ausentes ou não suportados.");
  }
  return object;
}
function text(value: unknown, max: number): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    /[\u0000-\u001f]/.test(value)
  ) {
    throw new Error(
      `Use um texto de 1 a ${max} caracteres, sem caracteres de controle.`,
    );
  }
  return value;
}
function number(value: unknown, min: number, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    throw new Error("Posição, tamanho ou rotação fora dos limites permitidos.");
  }
  return value;
}

/** Imports only a small domain schema, never executable Fabric scenes or remote assets. */
export function parseProject(raw: string): HmiProject {
  if (new TextEncoder().encode(raw).length > MAX_PROJECT_BYTES)
    throw new Error("O arquivo excede o limite de 256 KiB.");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("Não foi possível ler o JSON do projeto.");
  }
  const project = record(json, [
    "schemaVersion",
    "name",
    "screen",
    "components",
  ]);
  if (project.schemaVersion !== 1)
    throw new Error("Versão de projeto não suportada.");
  const screen = record(project.screen, ["width", "height"]);
  if (screen.width !== 1200 || screen.height !== 720)
    throw new Error("A tela deve ter 1200 × 720 px.");
  if (
    !Array.isArray(project.components) ||
    project.components.length > MAX_COMPONENTS
  )
    throw new Error("Limite de 100 componentes por tela.");
  const ids = new Set<string>();
  const components = project.components.map((input) => {
    const item = record(input, [
      "id",
      "kind",
      "label",
      "x",
      "y",
      "width",
      "height",
      "angle",
      "binding",
    ]);
    const id = text(item.id, 80);
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id))
      throw new Error("Identificador de componente inválido ou repetido.");
    ids.add(id);
    if (
      typeof item.kind !== "string" ||
      !Object.hasOwn(componentNames, item.kind)
    )
      throw new Error("Componente não suportado.");
    const kind = item.kind as ComponentKind;
    if (
      item.binding !== null &&
      !bindings[kind].includes(item.binding as TagName)
    )
      throw new Error("A tag é incompatível com este componente.");
    return {
      id,
      kind,
      label: text(item.label, 64),
      x: number(item.x, 0, 1160),
      y: number(item.y, 0, 688),
      width: number(item.width, 40, 500),
      height: number(item.height, 32, 500),
      angle: number(item.angle, -180, 180),
      binding: item.binding as TagName | null,
    };
  });
  return {
    schemaVersion: 1,
    name: text(project.name, 80),
    screen: { width: 1200, height: 720 },
    components,
  };
}
export function serializeProject(project: HmiProject): string {
  return JSON.stringify(parseProject(JSON.stringify(project)), null, 2);
}

export interface ProjectHistory {
  past: HmiProject[];
  present: HmiProject;
  future: HmiProject[];
}
export type ProjectAction =
  { type: "change"; project: HmiProject } | { type: "undo" } | { type: "redo" };
export function projectReducer(
  state: ProjectHistory,
  action: ProjectAction,
): ProjectHistory {
  if (action.type === "change") {
    const project = parseProject(JSON.stringify(action.project));
    if (JSON.stringify(project) === JSON.stringify(state.present)) return state;
    return {
      past: [...state.past, state.present].slice(-60),
      present: project,
      future: [],
    };
  }
  if (action.type === "undo" && state.past.length)
    return {
      past: state.past.slice(0, -1),
      present: state.past.at(-1)!,
      future: [state.present, ...state.future],
    };
  if (action.type === "redo" && state.future.length)
    return {
      past: [...state.past, state.present],
      present: state.future[0],
      future: state.future.slice(1),
    };
  return state;
}
````

## frontend/src/editor/widgets.ts
````
import {
  Circle,
  FabricText,
  Group,
  Rect,
  Triangle,
  type FabricObject,
} from "fabric";
import type { HmiComponent } from "./project";

const origin = { originX: "left", originY: "top" } as const;
const ink = "#25384b";
function label(text: string, left: number, top: number, fontSize = 15) {
  return new FabricText(text, {
    ...origin,
    left,
    top,
    fontFamily: "Segoe UI",
    fontSize,
    fill: ink,
  });
}
export interface Widget {
  root: Group;
  update: (value: number | boolean | null, editing: boolean) => void;
}
export function createWidget(item: HmiComponent): Widget {
  const width = item.kind === "tank" ? 180 : item.kind === "text" ? 240 : 160;
  const height = item.kind === "tank" ? 260 : item.kind === "text" ? 48 : 130;
  const base = new Rect({
    ...origin,
    width,
    height,
    fill: "transparent",
    strokeWidth: 0,
  });
  const heading = label(item.label, 12, 10, item.kind === "text" ? 18 : 14);
  heading.set({ scaleX: Math.min(1, (width - 24) / heading.width) });
  // A fixed bounding box keeps live measurements from changing the equipment geometry.
  const children: FabricObject[] = [base, heading];
  let update: Widget["update"] = () => {};
  if (item.kind === "tank") {
    const vessel = new Rect({
      ...origin,
      left: 21,
      top: 40,
      width: 138,
      height: 170,
      rx: 14,
      ry: 14,
      fill: "#eef3f6",
      stroke: "#7d91a2",
      strokeWidth: 2,
    });
    const water = new Rect({
      ...origin,
      left: 25,
      top: 112,
      width: 132,
      height: 94,
      fill: "#318f9b",
      strokeWidth: 0,
    });
    const valueLabel = label("50.0 %", 49, 115, 23);
    const quality = label("Prévia", 23, 228, 11);
    children.push(vessel, water, valueLabel, quality);
    // Group construction changes child coordinates from canvas space to group space.
    update = (value, editing) => {
      const available = typeof value === "number";
      const level = editing ? 50 : available ? value : 0;
      const bottom = 206 - height / 2;
      water.set({
        top: bottom - level * 1.62,
        height: level * 1.62,
        visible: editing || available,
      });
      valueLabel.set({
        text: editing ? "50.0 %" : available ? `${value.toFixed(1)} %` : "—",
      });
      quality.set({
        text: editing
          ? "Prévia de edição"
          : available
            ? "SIMULADO"
            : "INDISPONÍVEL",
      });
    };
  } else if (item.kind === "pump") {
    const body = new Circle({
      ...origin,
      left: 54,
      top: 36,
      radius: 25,
      fill: "#e5f0ee",
      stroke: "#588c83",
      strokeWidth: 2,
    });
    const rotor = new Triangle({
      ...origin,
      left: 68,
      top: 48,
      width: 24,
      height: 27,
      fill: "#588c83",
    });
    const status = label("Prévia de edição", 17, 106, 11);
    children.push(body, rotor, status);
    update = (value, editing) => {
      const active = editing || value === true;
      body.set({
        stroke: active ? "#27826f" : "#8494a3",
        fill: active ? "#dcefe9" : "#edf0f3",
      });
      rotor.set({ fill: active ? "#27826f" : "#8494a3" });
      status.set({
        text: editing
          ? "Prévia de edição"
          : value === null
            ? "INDISPONÍVEL"
            : value
              ? "EM OPERAÇÃO"
              : "PARADA",
      });
    };
  } else if (item.kind === "indicator") {
    const panel = new Rect({
      ...origin,
      left: 2,
      top: 35,
      width: 155,
      height: 61,
      fill: "#f5f8fa",
      stroke: "#b6c5d1",
      rx: 4,
      ry: 4,
    });
    const valueLabel = label("25.0 °C", 15, 48, 25);
    const quality = label("Prévia de edição", 12, 108, 10);
    children.push(panel, valueLabel, quality);
    update = (value, editing) => {
      const unit = item.binding === "TQ001.LEVEL" ? "%" : "°C";
      valueLabel.set({
        text: editing
          ? `25.0 ${unit}`
          : typeof value === "number"
            ? `${value.toFixed(1)} ${unit}`
            : "—",
      });
      quality.set({
        text: editing
          ? "Prévia de edição"
          : value === null
            ? "INDISPONÍVEL"
            : "SIMULADO",
      });
    };
  }
  const root = new Group(children, {
    ...origin,
    left: item.x,
    top: item.y,
    angle: item.angle,
    scaleX: item.width / width,
    scaleY: item.height / height,
    lockScalingFlip: true,
    lockSkewingX: true,
    lockSkewingY: true,
    borderColor: "#267eb0",
    cornerColor: "#267eb0",
    cornerStyle: "circle",
    cornerSize: 9,
    transparentCorners: false,
    padding: 6,
    objectCaching: false,
  });
  return { root, update };
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
# Infraestrutura

Backend em 127.0.0.1:8080; frontend Vite em 127.0.0.1:5173. Não há banco, broker, contêiner ou equipamento industrial necessário nesta etapa.

Não publicar o servidor de desenvolvimento na internet. Para hospedagem, o Dockerfile da raiz reúne interface e Java em um serviço. O render.yaml prepara uma demonstração gratuita, com atualizações da main após conectar a conta ao GitHub. O perfil hosted usa o proxy HTTPS do provedor. Não há dados privados ou equipamentos físicos.

Consulte o [guia de publicação](../docs/deployment.md). Serviço publicado em https://nexo-scada-demo.onrender.com. PostgreSQL e Flyway entram quando houver persistência.
````

## README.md
````
# NEXO — Supervisão e engenharia de telas

Plataforma SCADA/HMI com backend Java e interface web. A versão **0.3.0** acrescenta seleção múltipla, movimentação conjunta, alinhamento e distribuição ao editor de telas.

## Recursos disponíveis

- Supervisão de nível, bomba e temperatura, com atualizações por WebSocket.
- Editor com tanque, bomba, indicador e texto.
- Posicionamento livre, ajuste à grade, dimensões, rotação e ordem de exibição.
- Seleção múltipla, movimento conjunto e alinhamento pelas bordas ou centros; distribuição de espaçamento com três ou mais objetos.
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

O pacote de hospedagem reúne interface e Java em um único serviço. `Dockerfile` e `render.yaml` preparam a demonstração pública no Render, com atualizações automáticas a partir da branch main após conectar o GitHub. Publicado e verificado em https://nexo-scada-demo.onrender.com em 06/11/2026. GitHub autorizado e repositório vinculado pelo provedor Git. Publicação automática configurada para cada envio à main.

Veja o [guia de publicação](docs/deployment.md) para configurar a conta, gerar o pacote e entender os limites do plano gratuito. A demonstração usa apenas dados simulados; autenticação e uso com dados reais serão etapas posteriores.

## Usar o editor

1. Abra **Editor** e mantenha o modo **Edição**.
2. Insira um componente pela biblioteca ou selecione um dos objetos do exemplo.
3. Arraste para mover. Use as alças para redimensionar e girar; valores exatos também podem ser informados no painel Propriedades.
4. Selecione a tag vinculada. Tanques aceitam nível; bombas aceitam estado booleano; indicadores aceitam nível ou temperatura.
5. Use **Operação** para visualizar os valores recebidos do servidor. As alterações ficam bloqueadas nesse modo.
6. Use **Salvar projeto** para exportar o JSON. **Abrir JSON** recupera componentes, geometria, ordem e vínculos. **Nova tela** abre uma tela vazia; Desfazer recupera a anterior.

As alterações são mantidas ao navegar entre as páginas, mas não são gravadas automaticamente no servidor ou no navegador. Antes de recarregar ou fechar, exporte o arquivo. A tela fixa de Supervisão é independente do projeto aberto no editor.

Para selecionar vários objetos, use Shift + clique na tela ou na lista, arraste uma área vazia da tela ou use **Selecionar todos**. O painel Propriedades oferece alinhamento, distribuição e exclusão conjunta. Cada ação pode ser desfeita em uma única etapa. As dimensões e rotações continuam sendo editadas individualmente.

O arquivo `examples/water-tank/project.json` pode ser aberto diretamente no editor. Importação de imagens e SVG e grupos permanentes ainda não estão disponíveis.

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
````

## render.yaml
````
services:
  - type: web
    name: nexo-scada-demo
    runtime: docker
    repo: https://github.com/SheusV/sistema-supervisorio
    branch: main
    plan: free
    dockerfilePath: ./Dockerfile
    dockerContext: .
    healthCheckPath: /api/health
    autoDeployTrigger: commit
    envVars:
      - key: SPRING_PROFILES_ACTIVE
        value: hosted
````

## scripts/Build-Package.ps1
````
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location (Join-Path $projectRoot 'frontend')
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
$portableNpm = Join-Path $projectRoot '.tools/package/bin/npm-cli.js'
foreach ($task in @('test', 'build')) {
    if ($npmCommand) { & $npmCommand.Source run $task }
    elseif (Test-Path $portableNpm) { & node $portableNpm run $task }
    else { throw 'Instale Node.js 24 com npm antes de empacotar.' }
    if ($LASTEXITCODE) { exit $LASTEXITCODE }
}
Set-Location $projectRoot
$portableJava = Join-Path $projectRoot '.tools/jdk-21.0.13+9'
if (-not $env:JAVA_HOME -and (Test-Path $portableJava)) { $env:JAVA_HOME = $portableJava }
$mavenCommand = Get-Command mvn.cmd -ErrorAction SilentlyContinue
$maven = if ($mavenCommand) { $mavenCommand.Source } else { Join-Path $projectRoot '.tools/apache-maven-3.9.11/bin/mvn.cmd' }
if (-not (Test-Path $maven)) { throw 'Instale Maven 3.9.11 ou superior.' }
& $maven -B -ntp -f backend/pom.xml "-Dmaven.repo.local=$projectRoot/.tools/m2" -Pweb-ui clean verify
exit $LASTEXITCODE
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

Este repositório público contém uma demonstração de simulação. O perfil local permanece limitado ao computador; o perfil hosted foi preparado para publicação atrás do proxy HTTPS do provedor, com cabeçalhos de segurança e origem WebSocket restrita. Não há autenticação/RBAC, dados privados ou comandos de escrita para equipamentos físicos. Não está pronto para operação industrial. Consulte [os limites da publicação](docs/deployment.md).

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
