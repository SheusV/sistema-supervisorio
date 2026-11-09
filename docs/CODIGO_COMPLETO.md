# Código completo — versão 0.9.0
Cópia integral dos arquivos de autoria. Lockfile, ferramentas e capturas permanecem nos arquivos individuais.

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

## backend/src/main/java/br/com/scada/api/ProjectSimulationController.java

````
package br.com.scada.api;

import br.com.scada.simulation.ProjectSimulation;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.MapperFeature;
import tools.jackson.databind.json.JsonMapper;
import java.io.IOException;

@RestController
public class ProjectSimulationController {
    private final JsonMapper mapper = JsonMapper.builder()
        .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
        .disable(MapperFeature.ALLOW_COERCION_OF_SCALARS).build();

    @PostMapping(value = "/api/simulation/evaluate", consumes = "application/json")
    public ProjectSimulation.Result evaluate(HttpServletRequest request) throws IOException {
        byte[] body = request.getInputStream().readNBytes(65_537);
        if (body.length > 65_536) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE);
        try {
            return ProjectSimulation.evaluate(mapper.readValue(body, ProjectSimulation.Request.class));
        } catch (RuntimeException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Configuração ou valor inválido para simulação.");
        }
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

## backend/src/main/java/br/com/scada/simulation/ProjectSimulation.java

````
package br.com.scada.simulation;

import java.util.*;

/** Stateless project simulation: no shared state, devices, addresses or executable expressions. */
public final class ProjectSimulation {
    private ProjectSimulation() {}
    public record Variable(String name, String dataType, String unit, Object initial, Double min, Double max) {}
    public record TankRule(String levelTag, String enableTag, Double fillRate, Double drainRate, String permitTag) {}
    public record Request(List<Variable> variables, Map<String, Object> values, TankRule rule, Double seconds) {}
    public record Result(String source, Map<String, Object> values) {}

    public static Result evaluate(Request request) {
        if (request == null || request.variables() == null || request.values() == null || request.variables().size() > 32
                || request.values().size() > 32) throw invalid();
        Map<String, Object> result = new LinkedHashMap<>();
        for (Variable variable : request.variables()) {
            if (variable == null || variable.name() == null || !variable.name().matches("[A-Z][A-Z0-9_.]{0,63}")
                    || Set.of("TQ001.LEVEL", "P001.RUNNING", "TQ001.TEMPERATURE").contains(variable.name())
                    || result.containsKey(variable.name()) || variable.unit() == null || variable.unit().length() > 16
                    || variable.unit().chars().anyMatch(c -> c < 32) || variable.min() == null || variable.max() == null || !Double.isFinite(variable.min()) || !Double.isFinite(variable.max())
                    || variable.min() < -1_000_000 || variable.max() > 1_000_000 || variable.min() >= variable.max()) throw invalid();
            validateValue(variable, variable.initial());
            Object value = request.values().containsKey(variable.name()) ? request.values().get(variable.name()) : variable.initial();
            validateValue(variable, value);
            result.put(variable.name(), value);
        }
        if (!result.keySet().containsAll(request.values().keySet())) throw invalid();
        double seconds = request.seconds() == null ? 0 : request.seconds();
        if (!Double.isFinite(seconds) || seconds < 0 || seconds > 1) throw invalid();
        if (request.rule() != null) {
            TankRule rule = request.rule();
            Variable level = request.variables().stream().filter(v -> v.name().equals(rule.levelTag()) && "DOUBLE".equals(v.dataType())).findFirst().orElseThrow(ProjectSimulation::invalid);
            if (!(result.get(rule.enableTag()) instanceof Boolean enabled)
                    || rule.fillRate() == null || rule.drainRate() == null
                    || !Double.isFinite(rule.fillRate()) || !Double.isFinite(rule.drainRate())
                    || rule.fillRate() < 0 || rule.fillRate() > 1000 || rule.drainRate() < 0 || rule.drainRate() > 1000) throw invalid();
            double previous = ((Number) result.get(level.name())).doubleValue();
            boolean permitted = true;
            if (rule.permitTag() != null) {
                if (!(result.get(rule.permitTag()) instanceof Boolean state)) throw invalid();
                permitted = state;
            }
            double rate = (enabled && permitted ? rule.fillRate() : 0) - rule.drainRate();
            double next = Math.clamp(previous + rate * seconds, level.min(), level.max());
            result.put(level.name(), next);
        } else if (seconds != 0) throw invalid();
        return new Result("SIMULATED", result);
    }
    private static void validateValue(Variable variable, Object value) {
        if ("BOOLEAN".equals(variable.dataType())) {
            if (!(value instanceof Boolean)) throw invalid();
        } else if ("DOUBLE".equals(variable.dataType())) {
            if (!(value instanceof Number number) || !Double.isFinite(number.doubleValue())
                    || number.doubleValue() < variable.min() || number.doubleValue() > variable.max()) throw invalid();
        } else throw invalid();
    }
    private static IllegalArgumentException invalid() { return new IllegalArgumentException("Tags, tipos ou valores fora dos limites da simulação."); }
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

## backend/src/test/java/br/com/scada/ProjectSimulationTest.java

````
package br.com.scada;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import java.net.URI;
import java.net.http.*;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ProjectSimulationTest {
    @LocalServerPort int port;
    private final HttpClient client = HttpClient.newHttpClient();
    private final String variables = "\"variables\":[{\"name\":\"M1.RUN\",\"dataType\":\"BOOLEAN\",\"unit\":\"\",\"initial\":false,\"min\":0,\"max\":1},{\"name\":\"T1.LEVEL\",\"dataType\":\"DOUBLE\",\"unit\":\"%\",\"initial\":25,\"min\":0,\"max\":100}]";
    private HttpResponse<String> post(String body) throws Exception {
        return client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/simulation/evaluate"))
            .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
    }
    @Test void validatesManualCommandsAndDoesNotShareValuesBetweenRequests() throws Exception {
        var response = post("{" + variables + ",\"values\":{\"M1.RUN\":true,\"T1.LEVEL\":70}}");
        assertEquals(200, response.statusCode());
        var json = JsonMapper.builder().build().readTree(response.body());
        assertTrue(json.get("values").get("M1.RUN").asBoolean());
        assertEquals(70, json.get("values").get("T1.LEVEL").asInt());
        var fresh = post("{" + variables + ",\"values\":{}}");
        assertFalse(JsonMapper.builder().build().readTree(fresh.body()).get("values").get("M1.RUN").asBoolean());
    }
    @Test void rejectsUnknownTagsWrongTypesAndOutOfRangeValues() throws Exception {
        for (String values : new String[]{"{\"M1.RUN\":1}", "{\"T1.LEVEL\":101}", "{\"T1.LEVEL\":-1}", "{\"UNKNOWN\":1}", "{\"M1.RUN\":null}"})
            assertEquals(400, post("{" + variables + ",\"values\":" + values + "}").statusCode());
        assertEquals(400, post("{" + variables + ",\"values\":{},\"script\":\"anything\"}").statusCode());
    }
    @Test void boundsRequestSizeAndRejectsMalformedDocuments() throws Exception {
        assertEquals(413, post(" ".repeat(65_537)).statusCode());
        assertEquals(400, post("{}").statusCode());
        assertEquals(400, post("{").statusCode());
        assertEquals(400, post("{" + variables.replace("\"min\":0", "\"min\":\"0\"") + ",\"values\":{}}").statusCode());
        assertEquals(400, post("{" + variables.replace("\"min\":0,", "") + ",\"values\":{}}").statusCode());
        assertEquals(400, post("{" + variables + ",\"values\":{}} {}").statusCode());
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

## backend/src/test/java/br/com/scada/TankRuleTest.java

````
package br.com.scada;

import br.com.scada.simulation.ProjectSimulation;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class TankRuleTest {
    private final List<ProjectSimulation.Variable> variables = List.of(
        new ProjectSimulation.Variable("LEVEL", "DOUBLE", "%", 35, 0.0, 100.0),
        new ProjectSimulation.Variable("RUN", "BOOLEAN", "", false, 0.0, 1.0));
    private final ProjectSimulation.TankRule rule = new ProjectSimulation.TankRule("LEVEL", "RUN", 5.0, 1.0, null);
    private double step(double level, boolean enabled, double seconds) {
        var result = ProjectSimulation.evaluate(new ProjectSimulation.Request(variables, Map.of("LEVEL", level, "RUN", enabled), rule, seconds));
        return ((Number) result.values().get("LEVEL")).doubleValue();
    }
    @Test void balancesInputAndContinuousOutput() {
        assertEquals(39, step(35, true, 1));
        assertEquals(34, step(35, false, 1));
        assertEquals(37, step(35, true, 0.5));
        assertEquals(35, step(35, true, 0));
    }
    @Test void feedingRequiresBothCommandsAndDrainingContinues() {
        var definitions = new ArrayList<>(variables);
        definitions.add(new ProjectSimulation.Variable("BELT", "BOOLEAN", "", false, 0.0, 1.0));
        var gated = new ProjectSimulation.TankRule("LEVEL", "RUN", 5.0, 1.0, "BELT");
        for (boolean run : List.of(false, true)) {
            for (boolean belt : List.of(false, true)) {
                var request = new ProjectSimulation.Request(definitions, Map.of("RUN", run, "BELT", belt), gated, 1.0);
                assertEquals(run && belt ? 39.0 : 34.0, ProjectSimulation.evaluate(request).values().get("LEVEL"));
            }
        }
        assertThrows(IllegalArgumentException.class, () -> ProjectSimulation.evaluate(
                new ProjectSimulation.Request(variables, Map.of(), gated, 1.0)));
    }
    @Test void clampsAtBothLimitsAndIsDeterministic() {
        assertEquals(100, step(99, true, 1));
        assertEquals(0, step(0.5, false, 1));
        double level = 35;
        for (int i = 0; i < 10; i++) level = step(level, true, 1);
        assertEquals(75, level);
        assertEquals(39, step(35, true, 1));
    }
    @Test void rejectsInvalidStepsAndRules() {
        for (double seconds : new double[] { -1, 1.01, Double.NaN, Double.POSITIVE_INFINITY })
            assertThrows(IllegalArgumentException.class, () -> step(35, true, seconds));
        for (var invalid : List.of(
            new ProjectSimulation.TankRule("RUN", "LEVEL", 5.0, 1.0, null),
            new ProjectSimulation.TankRule("MISSING", "RUN", 5.0, 1.0, null),
            new ProjectSimulation.TankRule("LEVEL", "RUN", -1.0, 1.0, null),
            new ProjectSimulation.TankRule("LEVEL", "RUN", 5.0, Double.NaN, null)))
            assertThrows(IllegalArgumentException.class, () -> ProjectSimulation.evaluate(new ProjectSimulation.Request(variables, Map.of(), invalid, 1.0)));
        assertThrows(IllegalArgumentException.class, () -> ProjectSimulation.evaluate(new ProjectSimulation.Request(variables, Map.of(), null, 1.0)));
    }
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

## 0.9.0 — 08/11/2026

- Alarme de massa alta do silo com limite editável, reconhecimento e registro de retorno ao normal.
- Gráfico da variável simulada e consulta das operações anteriores salvas no navegador.

## 0.8.2 — 08/11/2026

- Interruptor de sol e lua no cabeçalho. A opção de seguir o sistema fica em Ajuda → Aparência.

## 0.8.1 — 08/11/2026

- Temas claro, escuro e do sistema na supervisão, tags, ajuda e editor, incluindo o sinótico. Preferência guardada no navegador.

## 0.8.0 — 08/11/2026

- Silo com leitura e escala, esteira transportadora, dosador de rosca e misturador com indicação de estado.
- Exemplo de dosagem em kg e permissão booleana opcional para habilitar a entrada de material no simulador Java.

## 0.7.1 — 08/11/2026

- Renomeação e exclusão de projetos na biblioteca local, com confirmação de exclusão e controle de conflitos entre abas.

## 0.7.0 — 08/11/2026

- Biblioteca de projetos no navegador. Salvar e abrir preservam componentes, ligações, tags e regras de simulação.
- Substituição por nome com confirmação e verificação de revisão entre abas. Exportar JSON baixa uma cópia portátil.

## 0.6.0 — 07/11/2026

- Desenho de tubulações e sinais entre portas na tela, com prévia, cancelamento e suporte a zoom. As conexões podem receber tags, ser editadas e ser recuperadas pelo histórico ou arquivo de projeto.

## 0.5.0 — 06/11/2026

- Edição de origem, destino, portas, tipo e vínculo de ligações existentes.
- Renomeação de tags preserva vínculos com objetos, ligações e regra.
- Regra configurável de enchimento/drenagem calculada pelo Java, com limites, iniciar/pausar e parada por falha.
- Guia Por onde começar e exemplo com simulação automática.
- Importação de projetos anteriores mantida e alterações recuperáveis por Desfazer.

## 0.4.0 — 06/11/2026

- Válvulas, motores, sensores, botões, entradas numéricas e figuras na biblioteca.
- Tubulações e sinais ancorados a portas, com indicação de estado por tag booleana.
- Tags de projeto tipadas, valores iniciais/faixas editáveis, cores e escala do tanque.
- Comandos de simulação manual validados pelo Java, sem estado compartilhado entre abas.
- Exemplo de processo conectado; projeto v2 com importação v1 preservada.
- Simulação manual explícita: sem cálculo hidráulico, lógica automática ou comandos físicos.

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

Atualização 0.5.0: `ProjectSimulation` e `ProjectSimulationController` acrescentam `POST /api/simulation/evaluate`, uma validação sem estado de tags e comandos de cada editor, com regra opcional de enchimento/drenagem em passos de até um segundo. O cliente guarda os valores aceitos em memória; não há estado compartilhado nem escrita em equipamentos. O contrato WebSocket original permanece somente leitura. O projeto v2 define variáveis e ligações de desenho; inclui uma regra limitada de tanque, sem scripts ou cálculo hidráulico das tubulações. Consulte [Editor de processo](process-editor.md). As restrições de ausência de POST descritas abaixo referem-se ao contrato original de `/api/tags`.

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

O simulador reinicia em cada deploy. Projetos salvos ficam no armazenamento local do navegador, associado à origem do site. Salve ou exporte alterações antes de atualizar a página. Conexões WebSocket podem cair durante a troca de versão e o cliente tenta reconectar.

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

A publicação é uma demonstração pública com dados sintéticos. As tags compartilhadas permanecem somente leitura; o endpoint de simulação valida definições e valores próprios sem guardar estado entre requisições. Não há login, dados privados, upload de projeto no servidor, conexão OT ou comandos físicos. Projetos importados são processados no navegador; somente definições/valores de tags e a regra limitada de tanque são enviados ao Java. TLS é terminado pelo provedor; o perfil hosted usa cabeçalhos encaminhados exclusivamente atrás desse proxy.

Qualquer evolução que inclua persistência compartilhada, dados reais ou administração remota exige autenticação, autorização e revisão específica antes de publicação.

Referências oficiais: https://render.com/docs/docker ; https://render.com/docs/deploys ; https://render.com/docs/websocket ; https://render.com/docs/free
````

## docs/editor.md

````
# Editor de telas — base v1 e organização

A versão 0.4.0 mantém a leitura do formato v1 e acrescenta o formato v2 com tags próprias, ligações, cores e comandos manuais. Consulte o [contrato v2 e guia de processo](process-editor.md). As regras abaixo descrevem a base v1, preservada para importação.

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

O histórico guarda até 60 revisões; uma nova alteração após desfazer limpa o caminho de refazer. O estado permanece durante a navegação interna. A partir da versão 0.7.0, Projetos salvos guarda o documento neste navegador e Exportar JSON baixa uma cópia. O aviso de saída depende do comportamento do navegador e não substitui a exportação.

## Limites deste incremento

Na base v1: uma tela por projeto e quatro tipos de componente. A versão 0.4.0 amplia a biblioteca e permite comandos em tags próprias de simulação, conforme o guia de processo. Grupos permanentes, importação de imagens e servidor de projetos ainda não estão disponíveis. O sinótico fixo de Supervisão continua separado do editor.

## Seleção múltipla — 0.3.0

Shift + clique acrescenta ou remove objetos da seleção. Na lista, Ctrl/Cmd + clique também funciona. Arraste uma área vazia para selecionar objetos, ou use Selecionar todos e Limpar seleção no painel. A seleção é temporária e não altera o contrato JSON v1.

Arrastar uma seleção múltipla mantém distâncias, tamanhos, rotações e vínculos. A grade arredonda o deslocamento conjunto para múltiplos de 20 px; os limites de posição restringem o deslocamento do conjunto sem separar seus objetos. Redimensionamento e rotação são individuais.

Alinhamento usa as bordas ou centros do retângulo envolvente da seleção, considerando a rotação de cada componente. Distribuição exige três objetos, mantém os extremos e iguala os espaços entre as caixas. Se não houver espaço ou uma posição exceder o contrato, a ação é recusada sem alterar o documento. Não se aplica arredondamento à grade ao alinhar ou distribuir; posições podem conter até três casas decimais.

Alinhamento, distribuição, movimento e exclusão conjunta geram uma revisão por ação. Desfazer recupera todos os componentes afetados. Modo Operação desativa seleção e comandos de edição.

Referência da biblioteca: https://fabricjs.com/docs/getting-started/installing/
````

## docs/process-editor.md

````
# Editor de processo — versão 0.6.0

## Experimente

1. Abra Editor e clique em **Exemplo de processo**. Desfazer recupera a tela anterior.
2. Entre em **Operação**. Aguarde a confirmação da simulação Java.
3. Clique no botão desenhado **Ligar / desligar linha**, ou em **Alternar LINHA.HABILITADA**. Bomba, motor, válvula e tubulações compartilham essa tag e refletem seu estado.
4. Informe um valor entre 0 e 100 em **TANQUE.NIVEL** e clique em Aplicar. O nível do tanque acompanha o valor. Clicar na entrada numérica desenhada leva ao campo correspondente.
5. Clique em **Iniciar simulação automática**: a linha ligada enche o tanque; desligada, ele drena. Pausar mantém o nível.
6. Volte à Edição para criar outros equipamentos, tags e ligações. A simulação reinicia com os valores iniciais ao entrar novamente em Operação.

## Monte sua tela

O nome pode ser alterado acima do desenho. A biblioteca contém tanque, bomba, válvula, motor, sensor, indicador, texto, botão, entrada numérica, retângulo e elipse. Objetos podem ser movidos, redimensionados, girados, coloridos, alinhados, vinculados e excluídos. O tanque tem escala mínima/máxima configurável. Texto aceita cor; figuras aceitam uma tag booleana para indicação de estado.

Em **Tags do projeto**, crie até 32 variáveis BOOLEAN ou DOUBLE. Cada variável possui nome, unidade, valor inicial e limites. Os nomes usam letras maiúsculas, números, ponto e sublinhado. As três tags da demonstração são reservadas. Use Editar tag para ajustar nome, unidade, valor inicial e faixa. Renomear atualiza os vínculos dos objetos, ligações e regra; o tipo permanece fixo. Excluir uma tag limpa seus vínculos e remove a regra que a utiliza; Desfazer recupera a alteração inteira.

No painel Propriedades, **Tag vinculada** apresenta somente tags compatíveis. Tanques, sensores, indicadores e entradas aceitam números. Bombas, válvulas, motores, botões e figuras aceitam booleanos. Botões e entradas aceitam somente tags próprias, pois as tags transmitidas pelo WebSocket permanecem somente leitura.

Para desenhar, clique em **Desenhar ligação** acima da tela. Escolha **Tubulação** ou **Sinal**, clique em uma porta de saída e depois em uma porta de outro objeto. A prévia acompanha o ponteiro. Escape ou **Cancelar ligação** descarta o traçado. Depois, atribua uma tag em **Ligações → Editar ligação**. Desfazer remove a conexão em uma etapa.

Em **Ligações**, escolha origem, destino, porta de saída, porta de entrada e tipo. Portas disponíveis: esquerda, direita, topo e base. Tubulação usa linha contínua; sinal usa linha tracejada. Uma tag booleana opcional indica o estado da ligação. Os caminhos são ortogonais automáticos e acompanham movimento, escala e rotação. Não há edição de pontos intermediários ou desvio automático de obstáculos. Use **Editar ligação** para alterar origem, destino, portas, tipo e tag sem duplicar a conexão. Excluir um objeto remove suas ligações; Desfazer recupera objetos e ligações juntos.

## Funcionamento da simulação

O navegador envia a definição das tags e os valores propostos ao Java por `POST /api/simulation/evaluate`. O servidor valida nomes, tipos, limites e tamanho da requisição e devolve os valores aceitos, identificados como SIMULATED. Só então a tela atualiza os componentes. As respostas são verificadas também no frontend.

O endpoint não guarda estado entre requisições: uma aba não modifica outra, o simulador compartilhado de demonstração ou equipamentos físicos. O estado da simulação permanece apenas na instância aberta do editor. Sair do editor, voltar à edição ou recarregar reinicia os valores. Exportação salva definições e valores iniciais, não os valores de operação.

Os valores mostrados são os últimos valores aceitos pelo Java, não medições físicas. Uma falha ou timeout de comando torna os valores próprios indisponíveis até Reconectar simulação. Durante uma requisição, os controles ficam bloqueados. Respostas atrasadas de um projeto anterior são descartadas.

Tubulações não implementam fluxo físico. Compartilhar uma tag cria uma associação explícita de estado; não calcula vazão, pressão, balanço de massa ou intertravamentos. A regra explícita é independente do desenho. Este incremento não contém linguagem de programação, scripts, expressões livres, drivers ou escrita em CLPs.

## Dosagem de sólidos

Abra **Exemplo de dosagem** e entre em Operação. A massa começa em 200 kg. Inicie o ciclo automático e ligue DOSADOR.RUN e ESTEIRA.RUN. Cada segundo simulado acrescenta 20 kg até atingir 1000 kg. O comando do misturador altera seu estado de forma independente. Para configurar outra linha, selecione uma tag booleana em **Permissão de entrada**. O simulador aplica a taxa de entrada quando acionamento e permissão estão ligados e mantém a saída contínua configurada. Renomear a tag atualiza a regra. Excluir a tag remove a regra dependente.

## Alarme alto e histórico da operação

No exemplo de dosagem, o alarme ativa em 800 kg ou mais. Configure o limite em **Simulação automática → Limite de alarme alto** e salve a regra. Um campo vazio desativa o limite e mantém a tendência. Reconhecer registra a ação; a indicação permanece alta até a leitura cair abaixo do limite. Uma falha de comunicação registra uma lacuna, preservando a condição anterior até uma nova leitura.

Em Operação, o gráfico mostra a variável da regra a cada confirmação do Java. O eixo horizontal usa o horário local das leituras e o tracejado indica o limite configurado. Selecione uma execução anterior para consultar o gráfico e os eventos. O navegador guarda as últimas 20 operações por nome do projeto e tag, com até 600 leituras e 100 eventos por operação. Limpar os dados do site remove o histórico. O arquivo JSON leva as configurações, inclusive o limite.

## Regra automática de tanque

Em **Simulação automática**, escolha uma tag DOUBLE de nível, uma BOOLEAN de acionamento e taxas entre 0 e 1000 unidades da tag por segundo simulado. O Java calcula `nível + ((ligada ? entrada : 0) - saída) × segundos`, limitado ao mínimo/máximo da tag. A saída é contínua. Há uma regra por projeto.

A operação começa pausada. Cada ciclo confirmado avança um segundo simulado, com solicitações a cada segundo e sem sobreposição. Lentidão ou abas em segundo plano podem reduzir a velocidade; não há recuperação de tempo perdido. Falhas pausam o cálculo e exigem reconexão, sem retomada automática. Durante um pedido, os controles aguardam sua conclusão. Voltar à edição reinicia os valores. A regra é exportada com o projeto.

## Contrato de projeto v2

O formato v1 permanece aceito. Ao editar, o projeto passa a v2, mantendo os componentes existentes. Projetos v2 não são compatíveis com versões antigas do aplicativo.

- `schemaVersion`: 2; nome e tela 1200 × 720 seguem os limites anteriores.
- `components`: até 100, com campos v1 e tipos adicionais da biblioteca. Campos opcionais: `color` no formato hexadecimal #RRGGBB; `rangeMin` e `rangeMax`, ambos obrigatórios quando uma escala é informada e com mínimo menor que máximo.
- `variables`: até 32 registros com exatamente `name`, `dataType`, `unit`, `initial`, `min`, `max`. Nomes únicos de até 64 caracteres; unidades até 16; números finitos entre −1.000.000 e 1.000.000; valores iniciais dentro da faixa.
- `connections`: até 100 registros com exatamente `id`, `from`, `to`, `fromPort`, `toPort`, `kind`, `binding`. IDs únicos; dois objetos existentes e distintos; portas left/right/top/bottom; tipo pipe/signal; vínculo booleano ou null.
- `simulation`: opcional, com `levelTag`, `enableTag`, `fillRate`, `drainRate` e os campos opcionais `permitTag` (tag própria BOOLEAN) e `highLimit` (limite de alarme na faixa da variável medida); referências a tags próprias DOUBLE/BOOLEAN e taxas finitas de 0 a 1000. Projetos antigos sem regra continuam aceitos; versões anteriores à 0.5 não leem a extensão.
- Limite total do arquivo: 256 KiB. Nenhuma URL, imagem remota, script, campo desconhecido ou desserialização Fabric é aceita.

O endpoint Java aceita JSON de até 64 KiB com `variables` e `values`, além de `rule` e `seconds` opcionais. `rule` possui os campos de cálculo de `simulation`. O editor avalia `highLimit` após cada resposta validada; `seconds` é finito entre 0 e 1 (padrão zero), e passos diferentes de zero exigem regra válida. `values` é um mapa de nomes para valores; nomes ausentes usam o valor inicial. Tags desconhecidas, tipos incorretos e valores fora da faixa resultam em 400; corpo excedente resulta em 413. Um documento inválido não altera nenhum estado compartilhado.

## Validação

Testes cobrem importação/exportação, rejeição de ligações órfãs, nomes reservados, tipos incompatíveis, cores inválidas, exclusão com ligações, edição das tags, comandos Java, clique no botão desenhado, limites numéricos, isolamento entre abas e falha de comunicação. Consulte o relatório de validação.
````

## docs/roadmap.md

````
# Próximos incrementos

1. Etapa 0 validada tecnicamente: backend, frontend e fluxo WebSocket real, incluindo reconexão após interrupção do transporte. Revisão visual pelo usuário disponível.
2. Editor: base em 0.2.0; seleção/alinhamento em 0.3.0; ligações, biblioteca ampliada, tags próprias e comandos manuais em 0.4.0. Edição de ligações, renomeação de tags e regra de tanque entregues em 0.5.0. Ligação direta por portas disponível na versão 0.6.0. A biblioteca local da versão 0.7.0 inicia o passo 3. Em 0.8.0, o editor ganhou equipamentos para sólidos e uma permissão configurável na simulação. Grupos permanentes e imagens seguem previstos.
3. Em andamento: salvar e reabrir telas no mesmo navegador entregue em 0.7.0, com renomeação e exclusão de projetos locais em 0.7.1. Para acesso entre dispositivos seguem previstos PostgreSQL/Flyway, projetos persistidos, autenticação, perfis e auditoria; testes com Testcontainers.
4. Drivers de leitura, primeiro contra servidores OPC UA/Modbus/MQTT simulados, com qualidade e timeouts testados.
5. Em andamento. Versão 0.9.0 entrega tendência com ECharts, limite alto configurável, reconhecimento e histórico neste navegador para a variável da regra de simulação. Primeiro exemplo: massa do silo.
6. Laboratório offline PID/Bode com testes numéricos contra referências analíticas.
7. Wiki pesquisável, ajuda contextual por componente e tutoriais.
8. Extensões versionadas e critérios de segurança de plugins.

Conexão com CLP físico, comandos de escrita e uso em produção exigem fases específicas posteriores. Nenhum desses recursos foi implementado nesta entrega.
````

## docs/validation.md

````
# Relatório de validação — versão 0.9.0

Passaram o build, os 59 testes de frontend e os cinco cenários de automação no navegador. O teste do silo cobre cruzamento do limite durante a dosagem, reconhecimento, retorno ao normal e recuperação dos eventos e leituras após recarga. [Gráfico e alarme do silo](screenshots/alarme-massa.png).

## Resultados da versão 0.8.2

O teste de navegador verificou o interruptor por clique e teclado, preferência após recarga, redesenho do editor, retorno ao tema do sistema e acesso em tela estreita. O build de produção passou.

## Resultados da versão 0.8.1

Em 08/11/2026 passaram o build, os 58 testes de frontend e o cenário do tema no navegador. Foram verificados o modo Sistema, a preferência explícita após recarregar, a troca com o editor aberto e o seletor em tela de celular. [Sinótico escuro](screenshots/editor-tema-escuro.png).

## Resultados da versão 0.8.0

Em 08/11/2026 passaram o build, 12 testes Java, 58 de frontend e os quatro cenários de automação no navegador. A dosagem verifica massa estável com a esteira parada e aumento com a esteira e o dosador acionados. O teste Java cobre as quatro combinações de comandos com saída contínua. [Tela de dosagem](screenshots/dosagem-solidos.png).

## Resultados da versão 0.7.1

Em 08/11/2026, o build e os dois cenários de biblioteca passaram localmente no Edge. O novo cenário verifica a integridade do documento renomeado, cancelamento, exclusão da cópia local e rejeição de uma exclusão desatualizada em outra aba.

## Resultados da versão 0.7.0

Em 08/11/2026, o build, os 57 testes de frontend e os 14 cenários de navegador passaram localmente. A biblioteca foi validada fechando e reiniciando o navegador no mesmo perfil, comparando o documento completo e verificando o cancelamento e a confirmação de substituição.

## Resultados da versão 0.6.0

Em 07/11/2026, a compilação de produção, os 57 testes de frontend e os 13 cenários de navegador passaram localmente. O novo cenário cobre cancelamento por Escape, duas portas de equipamentos distintos, zoom durante o traçado, desfazer/refazer, atribuição de tag e reabertura do JSON. Veja a [captura do traçado](screenshots/desenhar-ligacao.png).

## Resultados da versão 0.5.0

Data: 06/11/2026. Ambiente: Windows, Node.js 24.22.1, Java 21.0.13, Microsoft Edge.

## Resultado

Editor integrado e validado com o simulador Java. A supervisão existente permanece funcional. Nenhum equipamento físico foi conectado.

## Verificações realizadas

- TypeScript: compilação sem erros.
- Vite: build de produção aprovado; editor carregado separadamente da tela inicial.
- Vitest: **57 testes aprovados em 6 arquivos**.
- Playwright/Edge: **12 testes aprovados** contra o Java local, incluindo edição de ligações, renomeação de tags, enchimento, drenagem, pausa e falha. Os mesmos 12 cenários passaram no endereço público após a publicação automática da versão 0.5.0 (commit 510150c).
- Dependências npm: instalação concluída; auditoria reportou zero vulnerabilidades no momento da instalação.
- Backend: **11 testes Java aprovados**, incluindo isolamento por requisição, tipos, faixas, corpo excedente, campos desconhecidos e JSON malformado. O Dockerfile executa novamente os testes Java/frontend em cada build.
- Docker não está instalado localmente. A hospedagem usa a imagem Linux construída pelo Render em https://nexo-scada-demo.onrender.com.

## Cobertura do editor

- Projeto v2 com tags próprias, componentes ampliados, cores, escalas e ligações; importação v1 preservada.
- Exclusão de equipamento remove ligações; Desfazer recupera tudo. Vínculos incompatíveis, órfãos, nomes reservados e cores inválidas são rejeitados.
- Criação e edição de tags, nome da tela, comandos reais de simulação Java, botão no canvas, limite numérico e isolamento entre abas.
- Falha na API manual torna valores próprios indisponíveis e oferece reconexão. Tubulações não calculam vazão.

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

Os testes de contrato usam mensagens controladas; os testes de supervisão, reconexão, comandos e regra automática usam o backend real. A restrição de importar conteúdo fora da raiz do servidor Vite foi respeitada: o teste do exemplo lê o arquivo diretamente como dado local de teste, sem ampliar as permissões do servidor web.

## Capturas

- `screenshots/simulacao-automatica.png`: controles da regra automática na versão 0.5.0.
- `screenshots/processo-operacao.png`: processo conectado e comandos de simulação da versão 0.4.0.

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

## frontend/e2e/automation.spec.ts

````
import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function exportProject(page: Page) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar JSON", exact: true }).click();
  return JSON.parse(await readFile((await (await pending).path())!, "utf8"));
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await page.getByRole("button", { name: "Exemplo de processo", exact: true }).click();
});
test("edits existing links and renames tags without losing references", async ({ page }) => {
  const original = await exportProject(page);
  await page.locator("summary").filter({ hasText: "Ligações" }).click();
  await page.getByRole("button", { name: "Editar ligação 1", exact: true }).click();
  await page.getByLabel("Porta de saída", { exact: true }).selectOption("bottom");
  await page.getByLabel("Tipo da ligação", { exact: true }).selectOption("signal");
  await page.getByRole("button", { name: "Salvar ligação", exact: true }).click();
  let project = await exportProject(page);
  expect(project.connections).toHaveLength(4);
  expect(project.connections[0]).toMatchObject({ id: original.connections[0].id, fromPort: "bottom", kind: "signal" });
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  expect((await exportProject(page)).connections).toEqual(original.connections);
  await page.locator("summary").filter({ hasText: "Tags do projeto" }).click();
  await page.getByRole("button", { name: "Editar tag LINHA.HABILITADA", exact: true }).click();
  await page.getByLabel("Nome da tag", { exact: true }).fill("BOMBA.RUN");
  await page.getByRole("button", { name: "Salvar tag", exact: true }).click();
  project = await exportProject(page);
  expect(project.simulation.enableTag).toBe("BOMBA.RUN");
  expect(project.connections[0].binding).toBe("BOMBA.RUN");
  expect(project.components.find((c: {id: string}) => c.id === "pump").binding).toBe("BOMBA.RUN");
  await page.locator("summary").filter({ hasText: "Simulação automática" }).click();
  await page.getByLabel("Taxa de entrada", { exact: true }).fill("8");
  await page.getByRole("button", { name: "Salvar regra", exact: true }).click();
  expect((await exportProject(page)).simulation.fillRate).toBe(8);
  await page.getByRole("button", { name: "Excluir tag BOMBA.RUN", exact: true }).click();
  expect((await exportProject(page)).simulation).toBeUndefined();
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  expect((await exportProject(page)).simulation.enableTag).toBe("BOMBA.RUN");
});
test("Java advances the level, pauses, drains and stops on connection failure", async ({ page }) => {
  await page.getByRole("button", { name: "Operação", exact: true }).click();
  const level = page.getByLabel("Valor de TANQUE.NIVEL", { exact: true });
  await expect(level).toHaveText("35 %");
  await page.getByRole("button", { name: "Alternar LINHA.HABILITADA", exact: true }).click();
  await expect(page.getByLabel("Valor de LINHA.HABILITADA", { exact: true })).toHaveText("true");
  await page.getByRole("button", { name: "Iniciar simulação automática", exact: true }).click();
  await expect.poll(async () => parseFloat((await level.textContent())!)).toBeGreaterThan(35);
  await page.getByRole("button", { name: "Pausar simulação automática", exact: true }).click();
  const paused = await level.textContent();
  await page.waitForTimeout(1300);
  await expect(level).toHaveText(paused!);
  await page.getByRole("button", { name: "Alternar LINHA.HABILITADA", exact: true }).click();
  await expect(page.getByLabel("Valor de LINHA.HABILITADA", { exact: true })).toHaveText("false");
  await page.getByRole("button", { name: "Iniciar simulação automática", exact: true }).click();
  await expect.poll(async () => parseFloat((await level.textContent())!)).toBeLessThan(parseFloat(paused!));
  await page.route("**/api/simulation/evaluate", route => route.abort());
  await expect(level).toHaveText("Indisponível");
  await expect(page.getByRole("button", { name: "Iniciar simulação automática", exact: true })).toBeDisabled();
  await page.unroute("**/api/simulation/evaluate");
  await page.getByRole("button", { name: "Reconectar simulação", exact: true }).click();
  await expect(page.getByRole("button", { name: "Iniciar simulação automática", exact: true })).toBeEnabled();
  await page.screenshot({ path: "../docs/screenshots/simulacao-automatica.png", fullPage: true });
});
test("draws a signal on the screen, cancels a draft and reopens the edited connection", async ({ page }) => {
  const original = await exportProject(page);
  const draw = page.getByRole("button", { name: "Desenhar ligação" });
  const source = page.getByRole("button", { name: "P-101 · Topo", exact: true });
  await draw.click();
  await source.click();
  await expect(page.getByRole("button", { name: "P-101 · Base", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(source).toHaveCount(0);
  expect((await exportProject(page)).connections).toEqual(original.connections);

  await draw.click();
  await page.getByLabel("Tipo do traçado").selectOption("signal");
  await source.click();
  await page.getByLabel("Zoom", { exact: true }).selectOption("75");
  await page.getByRole("button", { name: "TQ-101 · Base", exact: true }).click();
  const drawn = await exportProject(page);
  expect(drawn.connections).toHaveLength(original.connections.length + 1);
  const line = drawn.connections.at(-1);
  expect(line).toMatchObject({ from: "pump", fromPort: "top", to: "tank", toPort: "bottom", kind: "signal", binding: null });
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  expect((await exportProject(page)).connections).toEqual(original.connections);
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  await page.locator("summary").filter({ hasText: "Ligações" }).click();
  await page.getByRole("button", { name: "Editar ligação 5", exact: true }).click();
  await page.getByLabel("Tag da ligação").selectOption("LINHA.HABILITADA");
  await page.getByRole("button", { name: "Salvar ligação" }).click();
  const edited = await exportProject(page);
  await page.getByRole("button", { name: "Nova tela", exact: true }).click();
  await page.getByLabel("Arquivo de projeto").setInputFiles({
    name: "processo.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(edited)),
  });
  await expect(draw).toBeEnabled();
  expect((await exportProject(page)).connections.at(-1)).toEqual({ ...line, binding: "LINHA.HABILITADA" });
});
test("fills the solids silo only when feeder and conveyor both run", async ({ page }) => {
  await page.getByRole("button", { name: "Exemplo de dosagem" }).click();
  const project = await exportProject(page);
  expect(project.components.map((item: {kind: string}) => item.kind)).toEqual(expect.arrayContaining(["silo", "conveyor", "feeder", "mixer"]));
  await page.getByRole("button", { name: "Operação", exact: true }).click();
  const mass = page.getByLabel("Valor de SILO.MASSA", { exact: true });
  await expect(mass).toHaveText("200 kg");
  await page.getByRole("button", { name: "Alternar DOSADOR.RUN" }).click();
  await page.getByRole("button", { name: "Iniciar simulação automática" }).click();
  await expect(page.getByText(/ESTEIRA.RUN · Bloqueada/)).toBeVisible();
  await page.waitForTimeout(1300);
  await expect(mass).toHaveText("200 kg");
  await page.getByRole("button", { name: "Alternar ESTEIRA.RUN" }).click();
  await expect.poll(async () => parseFloat((await mass.textContent())!)).toBeGreaterThan(200);
  await page.getByRole("button", { name: "Alternar MISTURA.RUN" }).click();
  await expect(page.getByTestId("runtime-mixer")).toContainText("true");
});
test("records the high mass alarm, its acknowledgment and its return across reload", async ({ page }) => {
  const loadDose = async () => {
    await page.getByRole("button", { name: "Exemplo de dosagem" }).click();
    await page.getByRole("button", { name: "Operação", exact: true }).click();
    await expect(page.getByLabel("Valor de SILO.MASSA", { exact: true })).toHaveText("200 kg");
  };
  await loadDose();
  const panel = page.getByRole("region", { name: "Alarmes e histórico" });
  const apply = async (mass: string) => {
    await page.getByLabel("Novo valor de SILO.MASSA").fill(mass);
    await page.getByRole("button", { name: "Aplicar SILO.MASSA" }).click();
  };
  await apply("780");
  for (const name of ["Alternar DOSADOR.RUN", "Alternar ESTEIRA.RUN", "Iniciar simulação automática"]) {
    await page.getByRole("button", { name }).click();
  }
  await expect(panel.getByText("Alto · aguardando reconhecimento")).toBeVisible();
  await page.getByRole("button", { name: "Pausar simulação automática" }).click();
  await panel.getByRole("button", { name: "Reconhecer alarme" }).click();
  await expect(panel.getByText("Alto · reconhecido")).toBeVisible();
  await apply("790");
  await expect(panel.getByText("Normal", { exact: true })).toBeVisible();
  await expect(panel.getByRole("img").locator("canvas")).toBeVisible();
  await expect(panel.getByRole("listitem")).toHaveCount(3);
  await page.reload();
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await loadDose();
  await panel.getByRole("combobox").selectOption({ index: 1 });
  await expect(panel.getByText(/Última leitura/)).toContainText("790 kg");
  await expect(panel.getByRole("listitem")).toHaveText([/Retorno ao normal/, /Reconhecimento/, /Ativação/]);
});
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
  await page.getByRole("button", { name: "Exportar JSON" }).click();
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
    page.getByRole("button", { name: "Tanque", exact: true, includeHidden: true }),
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
  await page.getByRole("button", { name: "Exportar JSON" }).click();
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
  await expect(page.getByLabel("Propriedades do componente")).toBeHidden();
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

## frontend/e2e/library.spec.ts

````
import { expect, test, chromium, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function library(page: Page) {
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await page.getByText("Projetos salvos", { exact: true }).click();
}

async function documentOf(page: Page) {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar JSON" }).click();
  return JSON.parse(await readFile((await (await download).path())!, "utf8"));
}

test("keeps the full project after closing the browser and confirms replacement", async ({ baseURL }, info) => {
  test.setTimeout(90000);
  const profile = info.outputPath("browser-profile");
  const launch = () => chromium.launchPersistentContext(profile, { channel: "msedge", baseURL });
  const first = await launch();
  let original;
  try {
    const page = await first.newPage();
    await page.goto("/");
    await library(page);
    await page.getByRole("button", { name: "Exemplo de processo" }).click();
    original = await documentOf(page);
    await page.getByRole("button", { name: "Salvar projeto", exact: true }).click();
    await expect(page.getByLabel("Projeto salvo", { exact: true })).toHaveValue(original.name);
  } finally { await first.close(); }

  const second = await launch();
  try {
    const page = await second.newPage();
    await page.goto("/");
    await library(page);
    await page.getByRole("button", { name: "Abrir projeto salvo" }).click();
    await expect(page.getByLabel("Nome da tela")).toHaveValue(original.name);
    expect(await documentOf(page)).toEqual(original);
    await page.getByRole("button", { name: "Nova tela" }).click();
    await page.getByLabel("Nome da tela").fill(original.name);
    await page.getByLabel("Nome da tela").press("Tab");
    await page.getByRole("button", { name: "Salvar projeto", exact: true }).click();
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await page.getByRole("button", { name: "Abrir projeto salvo" }).click();
    await expect(page.getByText("Projeto “" + original.name + "” aberto.", { exact: false }).first()).toBeVisible();
    expect(await documentOf(page)).toEqual(original);
    await page.getByRole("button", { name: "Tanque", exact: true }).click();
    const revised = await documentOf(page);
    await page.getByRole("button", { name: "Salvar projeto", exact: true }).click();
    await page.getByRole("button", { name: "Substituir projeto" }).click();
    await expect(page.getByText("Projeto “" + original.name + "” salvo neste navegador.")).toBeVisible();
    await page.reload();
    await library(page);
    await page.getByRole("button", { name: "Abrir projeto salvo" }).click();
    await expect(page.getByLabel("Nome da tela")).toHaveValue(original.name);
    expect(await documentOf(page)).toEqual(revised);
  } finally { await second.close(); }
});
test("renames saved content and rejects a stale deletion from another tab", async ({ page, context }) => {
  await page.goto("/");
  await library(page);
  await page.getByRole("button", { name: "Exemplo de processo" }).click();
  const original = await documentOf(page);
  const selection = page.getByLabel("Projeto salvo", { exact: true });
  await page.getByRole("button", { name: "Salvar projeto", exact: true }).click();
  await expect(selection).toHaveValue(original.name);
  const other = await context.newPage();
  await other.goto("/");
  await library(other);
  await other.getByRole("button", { name: "Excluir da biblioteca" }).click();
  await expect(other.getByRole("button", { name: "Confirmar exclusão" })).toBeVisible();
  await page.getByRole("button", { name: "Renomear", exact: true }).click();
  await page.getByLabel("Novo nome do projeto").fill("Estação de transferência");
  await page.getByRole("button", { name: "Confirmar nome" }).click();
  await expect(selection).toHaveValue("Estação de transferência");
  await other.getByRole("button", { name: "Confirmar exclusão" }).click();
  await expect(other.getByText(/O projeto mudou em outra aba/)).toBeVisible();
  await page.getByRole("button", { name: "Abrir projeto salvo" }).click();
  expect(await documentOf(page)).toEqual({ ...original, name: "Estação de transferência" });
  await page.getByRole("button", { name: "Excluir da biblioteca" }).click();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(selection).toHaveValue("Estação de transferência");
  await page.getByRole("button", { name: "Excluir da biblioteca" }).click();
  await page.getByRole("button", { name: "Confirmar exclusão" }).click();
  await expect(selection).toBeDisabled();
  expect(await documentOf(page)).toEqual({ ...original, name: "Estação de transferência" });
  await page.reload();
  await library(page);
  await expect(selection.locator("option")).toHaveText("Nenhum projeto salvo");
});
````

## frontend/e2e/process.spec.ts

````
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("creates a tag and anchored connection, preserves them in JSON and undoes deletion", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto("/");
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await page.getByText("Tags do projeto", { exact: false }).first().click();
  await page.getByLabel("Nome da tag", { exact: true }).fill("VALVULA.ABERTA");
  await page.getByRole("button", { name: "Criar tag", exact: true }).click();
  await page.getByRole("button", { name: "Editar tag VALVULA.ABERTA", exact: true }).click();
  await page.getByLabel("Valor inicial", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: "Salvar tag", exact: true }).click();
  await page.getByLabel("Nome da tela", { exact: true }).fill("Minha linha de processo");
  await page.getByLabel("Nome da tela", { exact: true }).press("Tab");
  await page.getByRole("button", { name: "Válvula", exact: true }).click();
  await page.getByLabel("Tag vinculada").selectOption("VALVULA.ABERTA");
  await page.getByLabel("Cor do componente").fill("#bc7c28");
  await page.locator("summary").filter({ hasText: "Ligações" }).click();
  await page.getByLabel("Origem da ligação").selectOption({ label: "P-001" });
  await page.getByLabel("Destino da ligação").selectOption({ label: "Válvula" });
  await page.getByLabel("Tag da ligação").selectOption("VALVULA.ABERTA");
  await page.getByRole("button", { name: "Criar ligação", exact: true }).click();
  await expect(page.getByRole("button", { name: "Excluir ligação 1" })).toBeVisible();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar JSON" }).click();
  const file = await pending;
  const data = JSON.parse(await readFile((await file.path())!, "utf8"));
  expect(data.schemaVersion).toBe(2);
  expect(data.name).toBe("Minha linha de processo");
  expect(data.variables[0]).toMatchObject({ name: "VALVULA.ABERTA", initial: true });
  expect(data.connections[0]).toMatchObject({ binding: "VALVULA.ABERTA", fromPort: "right", toPort: "left" });
  expect(data.components.at(-1)).toMatchObject({ kind: "valve", color: "#bc7c28" });
  await page.getByRole("button", { name: "Excluir componente", exact: true }).click();
  await expect(page.getByRole("button", { name: "Excluir ligação 1" })).toHaveCount(0);
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect(page.getByRole("button", { name: "Excluir ligação 1" })).toBeVisible();
  await page.getByLabel("Arquivo de projeto").setInputFiles({ name: "process.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)) });
  await expect(page.getByRole("button", { name: "Excluir ligação 1" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("runs real Java commands, updates bound equipment and isolates another browser", async ({ page, context }) => {
  await page.setViewportSize({ width: 1600, height: 1200 });
  await page.goto("/");
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await page.getByRole("button", { name: "Exemplo de processo", exact: true }).click();
  await page.getByRole("button", { name: "Operação", exact: true }).click();
  await expect(page.getByText("Simulação pronta", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Alternar LINHA.HABILITADA", exact: true }).click();
  await expect(page.getByLabel("Valor de LINHA.HABILITADA", { exact: true })).toHaveText("true");
  await expect(page.getByTestId("runtime-valve")).toContainText("true");
  await page.getByLabel("Novo valor de TANQUE.NIVEL", { exact: true }).fill("72");
  await page.getByRole("button", { name: "Aplicar TANQUE.NIVEL", exact: true }).click();
  await expect(page.getByTestId("runtime-tank")).toHaveText("TQ-101: 72 %");
  await page.getByLabel("Novo valor de TANQUE.NIVEL", { exact: true }).fill("101");
  await page.getByRole("button", { name: "Aplicar TANQUE.NIVEL", exact: true }).click();
  await expect(page.getByTestId("runtime-tank")).toHaveText("TQ-101: 72 %");
  const other = await context.newPage();
  await other.goto("/");
  await other.getByRole("button", { name: "Editor", exact: true }).click();
  await other.getByRole("button", { name: "Exemplo de processo", exact: true }).click();
  await other.getByRole("button", { name: "Operação", exact: true }).click();
  await expect(other.getByLabel("Valor de LINHA.HABILITADA", { exact: true })).toHaveText("false");
  await expect(other.getByTestId("runtime-tank")).toHaveText("TQ-101: 35 %");
  await other.close();
  await page.getByLabel("Novo valor de TANQUE.NIVEL", { exact: true }).fill("72");
  await page.locator(".upper-canvas").scrollIntoViewIfNeeded();
  const area = (await page.locator(".upper-canvas").boundingBox())!;
  const zoom = Number(await page.getByLabel("Zoom", { exact: true }).inputValue()) / 100;
  await page.mouse.click(area.x + 430 * zoom, area.y + 560 * zoom);
  await expect(page.getByLabel("Valor de LINHA.HABILITADA", { exact: true })).toHaveText("false");
  await page.screenshot({ path: "../docs/screenshots/processo-operacao.png", fullPage: true });
  await page.route("**/api/simulation/evaluate", route => route.abort());
  await page.getByRole("button", { name: "Alternar LINHA.HABILITADA", exact: true }).click();
  await expect(page.getByTestId("runtime-valve")).toContainText("Indisponível");
  await expect(page.getByRole("button", { name: "Reconectar simulação", exact: true })).toBeVisible();
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

## frontend/e2e/theme.spec.ts

````
import { test, expect } from "@playwright/test";

test("theme follows the system, persists an override and redraws the editor", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const theme = page.getByRole("switch", { name: "Tema escuro", exact: true });
  const html = page.locator("html");
  await expect(theme).toBeChecked();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await theme.click();
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await page.getByRole("button", { name: "Exemplo de dosagem" }).click();
  const canvas = page.locator("canvas.lower-canvas");
  const pixel = () => canvas.evaluate((el: HTMLCanvasElement) => Array.from(el.getContext("2d")!.getImageData(5, 5, 1, 1).data).slice(0, 3));
  await expect.poll(pixel).toEqual([255,255,255]);
  await theme.focus();
  await theme.press("Space");
  await expect(theme).toBeChecked();
  await expect.poll(pixel).toEqual([22,37,51]);
  await expect(page.getByLabel("Nome da tela")).toHaveValue("Dosagem de sólidos");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Ajuda", exact: true }).click();
  await page.getByRole("button", { name: "Usar tema do sistema" }).click();
  await expect(html).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Supervisão", exact: true }).click();
  await expect(theme).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
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
  "version": "0.9.0",
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
    "echarts": "6.1.0",
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
          <p>Protocolos industriais de leitura</p>
          <p>Laboratório PID</p>
        </div>
        <div className="sidebar-footer">
            <span className="small-dot" /> Ambiente simulado{" "}
            <small>v0.9.0 · Engenharia</small>
        </div>
      </aside>
      <div className="main">
        <header>
          <span>
            Projetos <span className="slash">/</span>{" "}
            <strong>{page === "Editor" ? editorHistory.present.name : "Tanque TQ-001"}</strong>
          </span>
          <div className="header-actions">
            <button type="button" role="switch" aria-checked={dark} aria-label="Tema escuro"
              title={dark ? "Usar tema claro" : "Usar tema escuro"} className="theme-switch"
              onClick={() => choose(dark ? "light" : "dark")}>
              <span className="theme-track" aria-hidden="true">
                <svg className="theme-moon" viewBox="0 0 24 24"><path fill="currentColor" d="M20.8 15A9 9 0 0 1 9 3.2 9.4 9.4 0 1 0 20.8 15Z" /></svg>
                <svg className="theme-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
                </svg>
                <span className="theme-thumb" />
              </span>
            </button>
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
              <h3>Aparência</h3>
              <p>O interruptor no topo alterna entre os temas claro e escuro.</p>
              <button className="system-theme" disabled={theme === "system"} onClick={() => choose("system")}>
                Usar tema do sistema
              </button>
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
        className="temperature-panel"
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
.screen-title > input { flex: 1; min-width: 0; max-width: 75%; font: inherit; font-weight: 600; color: #3e5265; background: white; border: 1px solid #d8e1e8; padding: 4px 6px; border-radius: 3px; }
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
.project-tools { border-bottom: 1px solid #dce4eb; padding: 8px 14px; }
.editor-layout.operating-layout { grid-template-columns: minmax(0, 1fr); min-height: 0; }
.operating-layout .component-library, .operating-layout .properties { display: none; }
.operating-layout .canvas-container { margin-inline: auto; }
.project-tools details { padding: 8px 0; }
.project-tools summary { cursor: pointer; font-size: 12px; font-weight: 600; color: #344b60; }
.project-tools summary span { margin-left: 10px; color: #718596; font-weight: 400; }
.project-tools p, .simulation-console p { font-size: 12px; color: #64798a; line-height: 1.6; }
.project-form { display: flex; flex-wrap: wrap; gap: 10px; align-items: end; }
.project-form label { display: grid; gap: 5px; font-size: 11px; color: #536b7d; flex: 1 1 140px; }
.project-form input, .project-form select, .simulation-console input { min-width: 0; width: 100%; padding: 8px; border: 1px solid #c8d5df; border-radius: 4px; background: white; color: #25384b; }
.project-items { list-style: none; padding: 0; margin: 12px 0; }
.project-items li { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; border-top: 1px solid #e5ebef; padding: 8px 0; font-size: 11px; overflow-wrap: anywhere; }
.simulation-console { padding: 18px; background: #f2f8f7; border-bottom: 1px solid #c7ded8; }
.editing-banner { padding: 9px 12px; border-left: 3px solid #318f9b; background: #eef7f6; }
.editor-steps { font-size: 12px; color: #536b7d; line-height: 1.8; padding-left: 20px; }
.automatic-controls { padding: 12px 0; border-block: 1px solid #c7ded8; margin-bottom: 12px; }
.automatic-controls > span { margin-left: 12px; font-size: 12px; color: #405d73; }
.simulation-values { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)); gap: 12px; }
.simulation-values > div { display: grid; gap: 8px; background: white; border: 1px solid #d3e1dd; padding: 12px; min-width: 0; }
.simulation-values strong { font-size: 12px; overflow-wrap: anywhere; }
.simulation-values output { font-size: 18px; color: #256b61; }
.simulation-values form { display: flex; flex-wrap: wrap; gap: 6px; }
.library-symbol.motor:after, .library-symbol.valve:after, .library-symbol.sensor:after, .library-symbol.button:after, .library-symbol.setpoint:after { position: absolute; inset: 4px 0; text-align: center; font-size: 13px; }
.library-symbol.motor { border-radius: 50%; }
.library-symbol.motor:after { content: "M"; }
.library-symbol.valve:after { content: "⋈"; }
.library-symbol.sensor:after { content: "S"; }
.library-symbol.button:after { content: "I/O"; font-size: 10px; }
.library-symbol.setpoint:after { content: "SP"; }
.library-symbol.ellipse { border-radius: 50%; }
@media (max-width: 720px) { .toolbar-files { flex-wrap: wrap; } }
@media (min-width: 721px) and (max-width: 850px) {
  .main:has(.editor) {
    width: calc(100% - 185px);
  }
}
.drawing-surface { position: relative; width: max-content; }
.operating-layout .drawing-surface { margin-inline: auto; }
.drawing-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 12px; background: white; border-bottom: 1px solid #d5dfe8; font-size: 12px; }
.drawing-tools select { font: inherit; }
.port-overlay { position: absolute; inset: 0; overflow: hidden; cursor: crosshair; }
.port-overlay svg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.editor .port-overlay button { position: absolute; transform: translate(-50%, -50%); width: 16px; height: 16px; min-width: 0; min-height: 0; padding: 0; border-radius: 50%; border: 2px solid #087c85; background: white; cursor: crosshair; }
.editor .port-overlay button:is(:hover, :focus-visible, .chosen-port) { background: #087c85; outline: 2px solid white; }
.editor .port-overlay button:disabled { cursor: default; opacity: .45; }
.editor .port-overlay button.chosen-port { opacity: 1; }
.project-library { background: white; border-bottom: 1px solid #d5dfe8; padding: 10px 16px; font-size: 13px; }
.project-library summary { cursor: pointer; font-weight: 600; }
.project-library p { color: #465c70; }
.library-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 10px 0; }
.library-controls label, .library-controls select { max-width: 100%; }
.library-symbol.silo { clip-path: polygon(0 0,100% 0,100% 65%,56% 100%,44% 100%,0 65%); background: #7992a4; }
.library-symbol.conveyor { border-radius: 12px; height: 14px; width: 33px; }
.library-symbol.feeder:after { content: "≋"; display: block; text-align: center; }
.library-symbol.mixer:after { content: "Ψ"; display: block; text-align: center; }
[data-theme="dark"] :is(.editor, .project-library, .screen-title, .drawing-tools, .canvas-controls, .editor-hint, .runtime-readings, .simulation-values > div) { background: var(--surface); color: var(--ink); border-color: var(--edge); }
[data-theme="dark"] .editor-workspace { background: #0f1c28; }
[data-theme="dark"] .editor :is(button, input, select) { color: var(--ink); background: var(--raised); border-color: var(--edge); }
[data-theme="dark"] .editor button:hover:not(:disabled) { background: #304b5f; }
[data-theme="dark"] .editor :is(.primary-action, button[aria-pressed="true"]) { background: #205267; color: #ecfffc; border-color: #529aab; }
[data-theme="dark"] .editor :is(.editor-toolbar, .toolbar-divider, .component-library, .project-tools, .properties, .selected-type, .project-items li, .automatic-controls) { border-color: var(--edge); }
[data-theme="dark"] .editor :is(.component-library > p, .save-state, .project-library p, .layer-kind, .property-note, .empty-properties, .properties label, .properties h3, .selected-type, .project-form label, .project-tools p, .editor-steps, .project-tools summary span, .simulation-console p, .multiple-properties > p, .automatic-controls > span, .layers-heading span) { color: var(--muted); }
[data-theme="dark"] .editor :is(.screen-title span:first-child, .project-tools summary, .runtime-readings strong) { color: var(--ink); }
[data-theme="dark"] .editor :is(.editing-banner, .simulation-console, .editor-message) { color: var(--ink); background: #193239; border-color: #35575c; }
[data-theme="dark"] .simulation-values output { color: var(--positive); }
[data-theme="dark"] .editor .delete-component { color: #ffb4b4; }
[data-theme="dark"] .editor .port-overlay button { background: #14323c; border-color: #6de2d6; }
[data-theme="dark"] .editor .port-overlay button:is(:hover, :focus-visible, .chosen-port) { background: #69cfc3; }
.operation-history { padding: 16px; border-bottom: 1px solid #96a8b5; }
.operation-history select { max-width: 100%; padding: 4px; }
.operation-history p, .alarm-line { font-size: 12px; }
.alarm-line { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 10px; border-left: 4px solid #438a7a; }
.alarm-line.high { border-color: #b44114; background: #fff0e5; color: #742c12; }
[data-theme="dark"] .alarm-line.high { background: #422d23; color: #ffd2ae; border-color: #ffa068; }
.trend-chart { width: 100%; height: 240px; }
.alarm-events { max-height: 9em; overflow: auto; margin: 0; padding-inline-start: 22px; }
````

## frontend/src/editor/alarmHistory.ts

````
export interface Sample {
  at: number;
  value: number | null;
}
export type EventKind = "Ativação" | "Reconhecimento" | "Retorno ao normal" | "Comunicação perdida" | "Comunicação restabelecida";
export interface AlarmEvent { at: number; kind: EventKind; value: number | null }
export interface Run {
  samples: Sample[];
  events: AlarmEvent[];
  high: boolean;
  acknowledged: boolean;
}
export const emptyRun: Run = { samples: [], events: [], high: false, acknowledged: false };
const sampleLimit = 600;
const eventLimit = 100;

export function observe(run: Run, sample: Sample, limit?: number): Run {
  const previous = run.samples.at(-1);
  if (sample.value === null && (!previous || previous.value === null)) return run;
  const events = [...run.events];
  if (sample.value === null) events.push({ ...sample, kind: "Comunicação perdida" });
  else if (previous?.value === null) events.push({ ...sample, kind: "Comunicação restabelecida" });
  const high = sample.value === null ? run.high : limit !== undefined && sample.value >= limit;
  if (high !== run.high) events.push({ ...sample, kind: high ? "Ativação" : "Retorno ao normal" });
  return {
    samples: [...run.samples.slice(1 - sampleLimit), sample],
    events: events.slice(-eventLimit),
    high, acknowledged: high && run.high && run.acknowledged,
  };
}

export function acknowledge(run: Run, at: number): Run {
  const value = run.samples.at(-1)?.value;
  if (value == null || !run.high || run.acknowledged) return run;
  const event: AlarmEvent = { at, kind: "Reconhecimento", value };
  return { ...run, acknowledged: true, events: [...run.events, event].slice(-eventLimit) };
}
````

## frontend/src/editor/alarmHistory.test.ts

````
import { describe, expect, it } from "vitest";
import { acknowledge, emptyRun, observe } from "./alarmHistory";

describe("high alarm", () => {
  it("triggers at equality, preserves acknowledged alarms across gaps and rearms below the threshold", () => {
    let run = emptyRun;
    for (const [at, value] of [790, 800, 801].entries()) run = observe(run, { at, value }, 800);
    run = acknowledge(run, 3);
    run = acknowledge(run, 4);
    run = observe(run, { at: 5, value: null }, 800);
    expect(run.high && run.acknowledged).toBe(true);
    for (const [i, value] of [805, 799, 800].entries()) run = observe(run, { at: i + 6, value }, 800);
    expect(run.events.map(e => e.kind)).toEqual(["Ativação", "Reconhecimento", "Comunicação perdida", "Comunicação restabelecida", "Retorno ao normal", "Ativação"]);
    expect(run.high && !run.acknowledged).toBe(true);
  });
});
````

## frontend/src/editor/operationArchive.ts

````
import type { Run } from "./alarmHistory";

export interface RecordedRun {
  id: string; scope: string; started: number;
  unit: string; min: number; max: number; limit?: number; run: Run;
}
let opening: Promise<IDBDatabase> | undefined;
function database() {
  if (!opening) {
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("nexo-operation-history", 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore("runs", { keyPath: "id" });
        store.createIndex("byScope", "scope");
        store.createIndex("byTime", ["scope", "started", "id"]);
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); opening = undefined; };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    }).catch((error: unknown) => { opening = undefined; throw error; });
  }
  return opening;
}
export async function pastRuns(scope: string, currentId: string): Promise<RecordedRun[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction("runs").objectStore("runs").index("byScope").getAll(scope);
    request.onsuccess = () => resolve((request.result as RecordedRun[]).filter(r => r.id !== currentId).sort((a,b) => b.started - a.started));
    request.onerror = () => reject(request.error);
  });
}
export async function storeRun(record: RecordedRun) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("runs", "readwrite");
    const runs = tx.objectStore("runs");
    runs.put(record);
    const range = IDBKeyRange.bound([record.scope], [record.scope, []]);
    const keys = runs.index("byTime").getAllKeys(range);
    keys.onsuccess = () => {
      for (const expired of keys.result.slice(0, -20)) runs.delete(expired);
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
}
````

## frontend/src/editor/OperationHistory.tsx

````
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { acknowledge, emptyRun, observe } from "./alarmHistory";
import { pastRuns, storeRun, type RecordedRun } from "./operationArchive";
import type { ProjectVariable } from "./project";
const TrendChart = lazy(() => import("./TrendChart"));
const clockLabel = (at: number) => new Date(at).toLocaleTimeString("pt-BR");

interface Props {
  projectName: string; variable: ProjectVariable; limit?: number; dark: boolean;
  ready: boolean; values: Record<string, number | boolean>;
}
export function OperationHistory({ projectName, variable, limit, dark, ready, values }: Props) {
  const [session] = useState(() => ({ id: crypto.randomUUID(), started: Date.now() }));
  const [live, setLive] = useState(emptyRun);
  const [archives, setArchives] = useState<RecordedRun[]>([]);
  const [selected, select] = useState("");
  const [storageIssue, setStorageIssue] = useState(false);
  const lastObservation = useRef<Record<string, number | boolean> | null>(null);
  const scope = JSON.stringify([projectName, variable.name]);

  useEffect(() => {
    let current = true;
    pastRuns(scope, session.id).then(records => { if (current) setArchives(records); })
      .catch(() => { if (current) setStorageIssue(true); });
    return () => { current = false; };
  }, [scope, session.id]);
  useEffect(() => {
    const snapshot = ready ? values : null;
    if (lastObservation.current === snapshot) return;
    lastObservation.current = snapshot;
    const value = snapshot?.[variable.name];
    const sample = { at: Date.now(), value: typeof value === "number" ? value : null };
    setLive(run => observe(run, sample, limit));
  }, [ready, values, variable.name, limit]);
  useEffect(() => {
    if (!live.samples.length) return;
    let current = true;
    storeRun({ ...session, scope, min: variable.min, max: variable.max, unit: variable.unit, limit, run: live })
      .catch(() => { if (current) setStorageIssue(true); });
    return () => { current = false; };
  }, [session, scope, variable, limit, live]);

  const archived = archives.find(r => r.id === selected);
  const run = archived?.run ?? live;
  const threshold = archived ? archived.limit : limit;
  const unit = archived?.unit ?? variable.unit;
  const value = run.samples.at(-1)?.value;
  const status = value == null ? "Sem leitura" : run.high ? run.acknowledged ? "Alto · reconhecido" : "Alto · aguardando reconhecimento" : "Normal";
  return <section className="operation-history" aria-label="Alarmes e histórico">
    <h2>{variable.name === "SILO.MASSA" ? "Histórico da dosagem" : "Histórico da operação"}</h2>
    <label>Operação <select value={selected} onChange={e => select(e.target.value)}>
      <option value="">Atual · {clockLabel(session.started)}</option>
      {archives.map(r => <option key={r.id} value={r.id}>{new Date(r.started).toLocaleString("pt-BR")}</option>)}
    </select></label>
    <p>{variable.name} · {archived ? "Última leitura" : "Leitura atual"} · <strong>{value == null ? "Indisponível" : value + " " + unit}</strong></p>
    {threshold !== undefined && <div className={run.high ? "alarm-line high" : "alarm-line"}>
      <strong>{variable.name === "SILO.MASSA" ? "Massa alta do silo" : "Alarme alto"}</strong>
      <span>Limite ≥ {threshold} {unit}</span><span role="status">{status}</span>
      {!archived && run.high && !run.acknowledged && <button disabled={!ready} onClick={() => {
        const at = Date.now(); setLive(previous => acknowledge(previous, at));
      }}>Reconhecer alarme</button>}
    </div>}
    {archived && live.high && <p role="status">Alarme alto na operação atual. Selecione Atual para acompanhá-lo.</p>}
    <Suspense fallback={<p>Carregando gráfico…</p>}><TrendChart samples={run.samples} unit={unit} min={archived?.min ?? variable.min} max={archived?.max ?? variable.max} limit={threshold} dark={dark} /></Suspense>
    <h3>Eventos</h3>
    {run.events.length ? <ol className="alarm-events">{[...run.events].reverse().map((event,index) =>
      <li key={run.events.length - index}><time>{clockLabel(event.at)}</time> · {event.kind}{event.value === null ? "" : " · " + event.value + " " + unit}</li>)}</ol> : <p>Nenhuma ocorrência registrada.</p>}
    <p>Histórico neste navegador por nome do projeto e tag. Últimas 20 operações, até 600 leituras e 100 eventos por operação.</p>
    {storageIssue && <p role="alert">Armazenamento local indisponível. A consulta ou a gravação do histórico pode estar incompleta.</p>}
  </section>;
}
````

## frontend/src/editor/TrendChart.tsx

````
import { useEffect, useRef } from "react";
import { init, use, type ECharts } from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, MarkLineComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { Sample } from "./alarmHistory";

use([LineChart, GridComponent, MarkLineComponent, TooltipComponent, CanvasRenderer]);
const clockLabel = (at: number) => new Date(at).toLocaleTimeString("pt-BR");

export default function TrendChart({ samples, unit, min, max, limit, dark }: {
  samples: Sample[]; unit: string; min: number; max: number; limit?: number; dark: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<ECharts | null>(null);
  useEffect(() => {
    if (!host.current) return;
    const instance = init(host.current);
    chart.current = instance;
    const resize = new ResizeObserver(() => instance.resize());
    resize.observe(host.current);
    return () => { resize.disconnect(); instance.dispose(); chart.current = null; };
  }, []);
  useEffect(() => {
    const ink = dark ? "#c4d6df" : "#445968";
    const line = dark ? "#72dccc" : "#117d73";
    chart.current?.setOption({
      animation: false, useUTC: false, grid: { left: 64, right: 30, top: 38, bottom: 38 },
      tooltip: { trigger: "axis", renderMode: "richText" },
      xAxis: { type: "time", axisLabel: { color: ink, hideOverlap: true, formatter: clockLabel }, splitNumber: 4 },
      yAxis: { type: "value", min, max, name: unit, nameTextStyle: { color: ink }, axisLabel: { color: ink, formatter: (value: number) => value.toLocaleString("pt-BR") },
        splitLine: { lineStyle: { color: dark ? "#324554" : "#dde4e8" } } },
      series: [{ type: "line", name: unit || "Valor", showSymbol: samples.length < 25, symbolSize: 5,
        itemStyle: { color: line }, lineStyle: { color: line, width: 2 }, connectNulls: false,
        data: samples.map(s => [s.at, s.value]),
        markLine: { silent: true, symbol: "none", label: { position: "insideEndTop", formatter: "Limite {c}", color: ink },
          lineStyle: { color: dark ? "#ffa981" : "#af4c20", type: "dashed" },
          data: limit === undefined ? [] : [{ yAxis: limit }] } }],
    });
  }, [samples, dark, unit, min, max, limit]);
  return <div className="trend-chart" ref={host} role="img" aria-label={`Tendência de ${unit || "valor"} ao longo do tempo. ${samples.filter(s => s.value !== null).length} amostras.`} />;
}
````

## frontend/src/editor/Editor.tsx

````
import { useEffect, useRef, useState, type Dispatch } from "react";
import { ActiveSelection, Canvas, Pattern, Path } from "fabric";
import { PortOverlay, portPosition, portSides, connectionPath, type DrawingSession, type DrawingPort } from "./PortOverlay";
import { arrange, layoutLabels, moveTogether, type LayoutAction } from "./layout";
import { OperationHistory } from "./OperationHistory";
import { ProjectLibrary } from "./ProjectLibrary";
import { ProjectTools } from "./ProjectTools";
import { dosingExample, processExample } from "./processExample";
import { useProjectSimulation } from "./useProjectSimulation";
import type { Snapshot } from "../tags/model";
import type { Connection } from "../tags/useTags";
import {
  availableBindings,
  removeComponents,
  type ConnectionLine,
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
  dark: boolean;
  history: ProjectHistory;
  dispatch: Dispatch<ProjectAction>;
  snapshot: Snapshot | null;
  connection: Connection;
  dirty: boolean;
  onDirty: (dirty: boolean) => void;
}
export default function Editor({
  dark,
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
  const simulation = useProjectSimulation(project.variables ?? [], !editing, project.simulation);
  const measured = project.variables?.find(v => v.name === project.simulation?.levelTag);
  const lines = useRef<Path[]>([]);
  const [drawing, setDrawing] = useState<DrawingSession | null>(null);
  const [sourcePort, setSourcePort] = useState<DrawingPort | null>(null);
  const [lineKind, setLineKind] = useState<ConnectionLine["kind"]>("pipe");
  const drawingActive = editing && drawing?.project === project;
  useEffect(() => {
    setDrawing(null);
    setSourcePort(null);
  }, [project, editing]);
  const drawLinesRef = useRef<() => void>(() => {});
  const commandRef = useRef<(id: string) => void>(() => {});
  const valueFor = (binding: string | null): number | boolean | null => {
    if (!binding) return null;
    if (project.variables?.some(tag => tag.name === binding)) return simulation.ready ? simulation.values[binding] ?? null : null;
    const tag = snapshot?.tags.find(tag => tag.name === binding);
    return connection === "live" && tag?.quality === "GOOD" ? tag.value : null;
  };
  const unitFor = (binding: string | null) => project.variables?.find(tag => tag.name === binding)?.unit
    ?? snapshot?.tags.find(tag => tag.name === binding)?.unit ?? (binding === "TQ001.LEVEL" ? "%" : "");
  commandRef.current = id => {
    const item = project.components.find(item => item.id === id);
    if (!item?.binding || !simulation.ready || simulation.busy) return;
    if (item.kind === "button" && typeof simulation.values[item.binding] === "boolean") simulation.write(item.binding, !simulation.values[item.binding]);
    if (item.kind === "setpoint") document.getElementById(`setpoint-${item.binding}`)?.focus();
  };
  const selected = selectedIds.length === 1 ? project.components.find((item) => item.id === selectedIds[0]) : undefined;
  const state = useRef({ project, editing, snap });
  state.current = { project, editing, snap };
  const change = (next: HmiProject) => {
    dispatch({ type: "change", project: { ...next, schemaVersion: 2, variables: next.variables ?? [], connections: next.connections ?? [] } });
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
    instance.on("mouse:up", ({ target }) => {
      if (!state.current.editing) { const id = identify(target); if (id) commandRef.current(id); }
    });
    instance.on("object:moving", ({ target }) => {
      if (state.current.snap) target.set({
        left: Math.round(target.left / 20) * 20,
        top: Math.round(target.top / 20) * 20,
      });
      drawLinesRef.current();
    });
    instance.on("object:scaling", () => drawLinesRef.current());
    instance.on("object:rotating", () => drawLinesRef.current());
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

  drawLinesRef.current = () => {
    const instance = canvas.current;
    if (!instance) return;
    instance.remove(...lines.current);
    lines.current = [];
    for (const line of project.connections ?? []) {
      const source = widgets.current.get(line.from)?.root, destination = widgets.current.get(line.to)?.root;
      if (!source || !destination) continue;
      source.setCoords();
      destination.setCoords();
      const path = connectionPath(portPosition(source, line.fromPort), portPosition(destination, line.toPort), line.fromPort);
      const value = valueFor(line.binding);
      const object = new Path(path, { fill: "", stroke: editing || value === true ? "#318f9b" : "#94a3b0", strokeWidth: line.kind === "pipe" ? 7 : 2,
        strokeDashArray: line.kind === "signal" || (!editing && line.binding && value === null) ? [8, 5] : undefined,
        selectable: false, evented: false, strokeLineCap: "round", objectCaching: false });
      lines.current.push(object); instance.add(object); instance.sendObjectToBack(object);
    }
    instance.requestRenderAll();
  };

  useEffect(() => {
    const instance = canvas.current;
    if (!instance) return;
    const active = selectedIds;
    instance.selection = editing;
    const grid = document.createElement("canvas");
    grid.width = 20;
    grid.height = 20;
    const context = grid.getContext("2d")!;
    const paper = dark ? "#162533" : "#ffffff";
    context.fillStyle = paper;
    context.fillRect(0, 0, 20, 20);
    context.fillStyle = dark ? "#405569" : "#c3ced8";
    context.fillRect(0, 0, 1.5, 1.5);
    instance.backgroundColor = editing
      ? new Pattern({ source: grid, repeat: "repeat" })
      : paper;
    instance.discardActiveObject();
    instance.remove(...instance.getObjects());
    lines.current = [];
    widgets.current.clear();
    for (const item of project.components) {
      const widget = createWidget(item, unitFor(item.binding), dark);
      widget.root.set({ selectable: editing, evented: editing || item.kind === "button" || item.kind === "setpoint", hoverCursor: !editing && (item.kind === "button" || item.kind === "setpoint") ? "pointer" : "move" });
      widget.update(null, editing);
      widgets.current.set(item.id, widget);
      instance.add(widget.root);
    }
    const ids = editing ? active.filter(id => widgets.current.has(id)) : [];
    activate(ids);
    drawLinesRef.current();
    instance.requestRenderAll();
    // Selection changes do not rebuild the scene; document changes do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, editing, sceneRevision, dark]);

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
      const value = valueFor(item.binding);
      widgets.current.get(item.id)?.update(value, false);
    }
    canvas.current?.requestRenderAll();
    drawLinesRef.current();
  }, [snapshot, connection, editing, project, simulation.values, simulation.ready, dark]);

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
    setDrawing(null);
    activate(multiple ? selectedIds.includes(id) ? selectedIds.filter(value => value !== id) : [...selectedIds, id] : [id]);
  }
  function startDrawing() {
    activate([]);
    const ports: DrawingPort[] = [];
    for (const item of project.components) {
      const root = widgets.current.get(item.id)?.root;
      if (!root) continue;
      root.setCoords();
      for (const side of portSides) {
        ports.push({ id: item.id, label: item.label, side, ...portPosition(root, side) });
      }
    }
    setSourcePort(null);
    setDrawing({ project, ports });
    setMessage("");
  }
  function finishDrawing(from: DrawingPort, to: DrawingPort) {
    if (!drawingActive || from.id === to.id) return;
    const line: ConnectionLine = {
      id: crypto.randomUUID(), from: from.id, fromPort: from.side,
      to: to.id, toPort: to.side, kind: lineKind, binding: null,
    };
    change({ ...project, connections: [...project.connections ?? [], line] });
    setDrawing(null);
    setMessage(`Ligação criada entre ${from.label} e ${to.label}. Para vincular uma tag, abra Ligações.`);
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
          schemaVersion: 2, variables: project.variables ?? [], connections: project.connections ?? [],
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
            {dirty ? "Alterações pendentes" : "Alterações salvas"}
          </span>
          <button
            disabled={!editing}
            onClick={() => {
              const { simulation: _removed, ...base } = project;
              change({ ...base, name: "Nova tela", components: [], variables: [], connections: [] });
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
          <button disabled={!editing} onClick={() => { change(processExample()); setSelectedIds([]); setMessage("Exemplo carregado. Abra Operação para testar os comandos. Desfazer recupera a tela anterior."); }}>Exemplo de processo</button>
          <button disabled={!editing} onClick={() => { change(dosingExample()); setSelectedIds([]); setMessage("Em Operação, inicie a simulação e ligue o dosador e a esteira para alimentar o silo."); }}>Exemplo de dosagem</button>
          <button className="primary-action" onClick={save}>
            Exportar JSON
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
      {editing && <ProjectLibrary project={project} saved={() => onDirty(false)} editedEntry={(entry, newName) => {
        if (project.name !== entry.name) return;
        if (newName === null || serializeProject(project) !== entry.document) onDirty(true);
        else {
          change({ ...project, name: newName });
          onDirty(dirty);
        }
      }} open={next => {
        importing.current++;
        change(next);
        setSelectedIds([]);
        onDirty(false);
        setMessage("");
      }} />}
      {editing && <ProjectTools project={project} change={change} report={setMessage} />}
      {!editing && !!project.variables?.length && <section className="simulation-console" aria-label="Comandos da simulação">
        <h2>Simulação do projeto</h2>
        <p>Comandos e regras calculados pelo Java, isolados nesta aba. Tubulações representam o desenho; a evolução do nível segue a regra configurada.</p>
        {project.simulation && <div className="automatic-controls">
          <button disabled={!simulation.ready || simulation.busy} aria-pressed={simulation.automatic} onClick={simulation.toggleAutomatic}>{simulation.automatic ? "Pausar simulação automática" : "Iniciar simulação automática"}</button>
          <span>{simulation.automatic ? "Em execução" : "Pausada"} · {project.simulation.levelTag} · entrada {project.simulation.fillRate}, saída {project.simulation.drainRate} por segundo simulado</span>
          {project.simulation.permitTag && <p>Permissão de entrada · {project.simulation.permitTag} · {simulation.ready ? simulation.values[project.simulation.permitTag] ? "Liberada" : "Bloqueada" : "Indisponível"}</p>}
          <p>Um segundo simulado por ciclo confirmado. Lentidão ou aba em segundo plano pode reduzir a velocidade; não há recuperação de tempo perdido.</p>
        </div>}
        <p role="status">{simulation.busy ? "Validando no Java…" : simulation.ready ? "Simulação pronta" : simulation.error || "Conectando ao simulador…"}</p>
        {simulation.error && <button disabled={simulation.busy} onClick={simulation.retry}>Reconectar simulação</button>}
        <div className="simulation-values">{project.variables.map(variable => <div key={variable.name}>
          <strong>{variable.name}</strong><output aria-label={`Valor de ${variable.name}`}>{simulation.ready ? `${String(simulation.values[variable.name])} ${variable.unit}` : "Indisponível"}</output>
          {variable.dataType === "BOOLEAN" ? <button disabled={!simulation.ready || simulation.busy} onClick={() => simulation.write(variable.name, !simulation.values[variable.name])}>Alternar {variable.name}</button>
            : <form onSubmit={event => { event.preventDefault(); const field = new FormData(event.currentTarget).get("value"); if (typeof field === "string" && field.trim()) simulation.write(variable.name, Number(field)); }}>
              <input id={`setpoint-${variable.name}`} key={String(simulation.values[variable.name])} aria-label={`Novo valor de ${variable.name}`} name="value" type="number" step="any" min={variable.min} max={variable.max} defaultValue={Number(simulation.values[variable.name] ?? variable.initial)} required disabled={!simulation.ready || simulation.busy} />
              <button disabled={!simulation.ready || simulation.busy}>Aplicar {variable.name}</button>
            </form>}
        </div>)}</div>
      </section>}
      {!editing && measured && <OperationHistory key={JSON.stringify([project.name, measured.name])} projectName={project.name} variable={measured}
        limit={project.simulation?.highLimit} dark={dark} ready={simulation.ready} values={simulation.values} />}
      <div className={`editor-layout ${editing ? "" : "operating-layout"}`}>
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
            {editing ? <input aria-label="Nome da tela" key={project.name} defaultValue={project.name} maxLength={80} onBlur={event => {
              if (event.target.value === project.name) return;
              try { change(parseProject(JSON.stringify({ ...project, name: event.target.value }))); setMessage(""); }
              catch (error) { setMessage((error as Error).message); }
            }} /> : <span>{project.name}</span>}
            <span>1200 × 720 px</span>
          </div>
          {editing && <div className="drawing-tools">
            {drawingActive ? <>
              <label>Tipo <select aria-label="Tipo do traçado" value={lineKind}
                onChange={event => setLineKind(event.target.value as ConnectionLine["kind"])}>
                <option value="pipe">Tubulação</option><option value="signal">Sinal</option>
              </select></label>
              <button onClick={() => setDrawing(null)}>Cancelar ligação</button>
              <span role="status">{sourcePort ? `Saída de ${sourcePort.label} selecionada. Escolha a entrada em outro objeto.` : "Escolha a porta de saída no desenho."}</span>
            </> : <button onClick={startDrawing} disabled={project.components.length < 2 || (project.connections?.length ?? 0) >= 100}>Desenhar ligação</button>}
          </div>}
          <div
            ref={host}
            className={`canvas-scroll ${editing ? "editing" : "operating"}`}
          >
            <div className="drawing-surface">
            <canvas
              ref={canvasElement}
              aria-label="Área de desenho da tela HMI"
            />
            {drawingActive && drawing && <PortOverlay session={drawing} source={sourcePort} selectSource={setSourcePort}
              kind={lineKind} finish={finishDrawing} cancel={() => setDrawing(null)} />}
            </div>
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
              : "Operação • Tags de demonstração em leitura • Comandos apenas nas tags próprias de simulação"}
          </div>
          {!editing && (
            <div className="runtime-readings" aria-label="Valores em operação">
              {project.components
                .filter((item) => item.binding)
                .map((item) => {
                  const value = valueFor(item.binding);
                  return (
                    <span key={item.id} data-testid={`runtime-${item.id}`}>
                      {item.label}:{" "}
                      <strong>
                        {value !== null
                          ? `${String(value)} ${unitFor(item.binding)}`
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
            <button disabled={!project.components.length} onClick={() => { setDrawing(null); activate(project.components.map(item => item.id)); }}>Selecionar todos</button>
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
              change(removeComponents(project, selectedIds));
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
                  {availableBindings(selected.kind, project.variables).map((tag) => (
                    <option key={tag}>{tag}</option>
                  ))}
                </select>
              </label>
              <label>Cor do componente<input aria-label="Cor do componente" type="color" value={selected.color ?? "#318f9b"} onChange={e => patch({ color: e.target.value })} /></label>
              {(selected.kind === "tank" || selected.kind === "silo") && <div className="geometry-fields">
                <label>Escala mínima<input key={`min-${selected.id}-${selected.rangeMin}`} aria-label="Escala mínima" type="number" defaultValue={selected.rangeMin ?? 0} onBlur={e => patch({ rangeMin: Number(e.target.value), rangeMax: selected.rangeMax ?? 100 })} /></label>
                <label>Escala máxima<input key={`max-${selected.id}-${selected.rangeMax}`} aria-label="Escala máxima" type="number" defaultValue={selected.rangeMax ?? 100} onBlur={e => patch({ rangeMin: selected.rangeMin ?? 0, rangeMax: Number(e.target.value) })} /></label>
              </div>}
              <p className="property-note">
                {selected.kind === "tank"
                  ? "A tag controla o nível de 0 a 100%."
                  : selected.kind === "pump"
                    ? "A tag booleana controla o estado visual."
                    : selected.kind === "indicator"
                      ? "Exibe o valor e a unidade da tag."
                    : selected.kind === "button" ? "Em Operação, clique no botão para alternar a tag booleana de simulação."
                    : selected.kind === "setpoint" ? "Em Operação, clique para acessar o campo de valor da tag."
                    : "Vínculo opcional para estado ou leitura. Cores e dimensões são configuráveis."}
              </p>
              <h3>Ordem de exibição</h3>
              <div className="layer-actions">
                <button onClick={() => reorder(1)}>Para frente</button>
                <button onClick={() => reorder(-1)}>Para trás</button>
              </div>
              <button
                className="delete-component"
                onClick={() => {
                  change(removeComponents(project, [selected.id]));
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

## frontend/src/editor/PortOverlay.tsx

````
import { useEffect, useState, type PointerEvent } from "react";
import type { FabricObject } from "fabric";
import type { ConnectionLine, HmiProject, Port } from "./project";

const sides = { left: "Esquerda", top: "Topo", right: "Direita", bottom: "Base" } as const;
const corners = { top: 0, right: 1, bottom: 2, left: 3 };

export interface Point { x: number; y: number }
export interface DrawingPort extends Point { id: string; label: string; side: Port }

export function portPosition(object: FabricObject, side: Port): Point {
  const points = object.getCoords();
  const index = corners[side];
  const a = points[index], b = points[(index + 1) % 4];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function connectionPath(a: Point, b: Point, side: Port) {
  const horizontal = side === "left" || side === "right";
  const middle = horizontal ? (a.x + b.x) / 2 : (a.y + b.y) / 2;
  const bend = horizontal
    ? `L ${middle} ${a.y} L ${middle} ${b.y}`
    : `L ${a.x} ${middle} L ${b.x} ${middle}`;
  return `M ${a.x} ${a.y} ${bend} L ${b.x} ${b.y}`;
}

export interface DrawingSession {
  project: HmiProject;
  ports: DrawingPort[];
}

interface Props {
  session: DrawingSession;
  source: DrawingPort | null;
  selectSource: (port: DrawingPort) => void;
  kind: ConnectionLine["kind"];
  finish: (source: DrawingPort, target: DrawingPort) => void;
  cancel: () => void;
}

export function PortOverlay({ session, source, selectSource, kind, finish, cancel }: Props) {
  const [pointer, setPointer] = useState<Point | null>(null);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") cancel(); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [cancel]);
  function preview(event: PointerEvent<HTMLDivElement>) {
    if (!source) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setPointer({
      x: (event.clientX - rect.left) * 1200 / rect.width,
      y: (event.clientY - rect.top) * 720 / rect.height,
    });
  }
  return <div className="port-overlay" aria-label="Portas de ligação" onPointerMove={preview}>
    {source && pointer && <svg aria-hidden="true" viewBox="0 0 1200 720">
      <path d={connectionPath(source, pointer, source.side)} fill="none" stroke="#087c85"
        strokeWidth={kind === "pipe" ? 4 : 2} strokeDasharray={kind === "signal" ? "8 5" : undefined} />
    </svg>}
    {session.ports.map(port => {
      const label = `${port.label} · ${sides[port.side]}`;
      return <button type="button" key={`${port.id}/${port.side}`} aria-label={label} title={label}
        disabled={port.id === source?.id} className={source === port ? "chosen-port" : ""}
        style={{ left: `${port.x / 12}%`, top: `${port.y / 7.2}%` }}
        onClick={() => {
          if (source) finish(source, port);
          else { selectSource(port); setPointer(port); }
        }} />;
    })}
  </div>;
}

export const portSides = Object.keys(sides) as Port[];
````

## frontend/src/editor/process.test.ts

````
import { describe, expect, it } from "vitest";
import { availableBindings, parseProject, removeComponents, replaceVariable, serializeProject } from "./project";
import { processExample, dosingExample } from "./processExample";

describe("process projects", () => {
  it("preserves the solids equipment, validates tag types and follows a renamed permission", () => {
    const project = dosingExample();
    expect(parseProject(serializeProject(project))).toEqual(project);
    expect(availableBindings("silo", project.variables)).toEqual(["SILO.MASSA"]);
    for (const kind of ["conveyor", "mixer", "feeder"] as const) {
      expect(availableBindings(kind, project.variables)).toContain("ESTEIRA.RUN");
      expect(availableBindings(kind, project.variables)).not.toContain("SILO.MASSA");
    }
    const tag = project.variables!.find(v => v.name === "ESTEIRA.RUN")!;
    const renamed = replaceVariable(project, tag.name, { ...tag, name: "ET01.RUN" });
    expect(renamed.simulation?.permitTag).toBe("ET01.RUN");
    expect(() => serializeProject({ ...project, simulation: { ...project.simulation!, permitTag: "SILO.MASSA" } })).toThrow();
  });
  it("round trips variables, connections, colors and numeric scales", () => {
    const project = processExample();
    Object.assign(project.components[3], { color: "#aabbcc", rangeMin: -20, rangeMax: 150 });
    expect(parseProject(serializeProject(project))).toEqual(project);
  });
  it("renames a tag atomically across equipment, connections and the rule", () => {
    const project = processExample();
    const next = replaceVariable(project, "LINHA.HABILITADA", { ...project.variables![0], name: "BOMBA.RUN" });
    expect(next.components.find(c => c.id === "pump")?.binding).toBe("BOMBA.RUN");
    expect(next.connections?.[0].binding).toBe("BOMBA.RUN");
    expect(next.simulation?.enableTag).toBe("BOMBA.RUN");
    expect(project.variables![0].name).toBe("LINHA.HABILITADA");
    expect(() => replaceVariable(project, "LINHA.HABILITADA", { ...project.variables![0], name: "TANQUE.NIVEL" })).toThrow();
  });
  it("imports older v2 documents without an automatic rule", () => {
    const { simulation: _removed, ...project } = processExample();
    expect(parseProject(serializeProject(project))).toEqual(project);
  });
  it.each([
    ["dangling connection", (p: any) => p.connections[0].to = "missing"],
    ["self connection", (p: any) => p.connections[0].to = p.connections[0].from],
    ["wrong line type", (p: any) => p.connections[0].kind = "script"],
    ["coerced port", (p: any) => p.connections[0].fromPort = ["left"]],
    ["numeric flow state", (p: any) => p.connections[0].binding = "TANQUE.NIVEL"],
    ["unknown binding", (p: any) => p.components[0].binding = "MISSING"],
    ["reserved tag", (p: any) => p.variables[0].name = "P001.RUNNING"],
    ["prototype tag", (p: any) => p.variables[0].name = "__proto__"],
    ["repeated tag", (p: any) => p.variables.push(p.variables[0])],
    ["too many tags", (p: any) => p.variables = Array(33).fill(p.variables[0])],
    ["invalid range", (p: any) => p.variables[1].max = -1],
    ["wrong initial type", (p: any) => p.variables[0].initial = "false"],
    ["invalid color", (p: any) => p.components[0].color = "url(https://example.com)"],
    ["unknown property", (p: any) => p.components[0].action = "eval"],
    ["zero scale", (p: any) => { p.components[3].rangeMin = 1; p.components[3].rangeMax = 1; }],
    ["wrong rule tag type", (p: any) => p.simulation.levelTag = "LINHA.HABILITADA"],
    ["dangling rule", (p: any) => p.simulation.enableTag = "MISSING"],
    ["negative fill rate", (p: any) => p.simulation.fillRate = -1],
    ["excessive output rate", (p: any) => p.simulation.drainRate = 1001],
    ["unknown rule field", (p: any) => p.simulation.script = "anything"],
  ])("rejects %s atomically", (_name, mutate) => {
    const project = processExample(); mutate(project);
    expect(() => parseProject(JSON.stringify(project))).toThrow();
  });
  it("only allows typed bindings and writable custom tags for controls", () => {
    const variables = processExample().variables;
    expect(availableBindings("button", variables)).toEqual(["LINHA.HABILITADA"]);
    expect(availableBindings("setpoint", variables)).toEqual(["TANQUE.NIVEL", "TEMP.VALOR"]);
    expect(availableBindings("tank", variables)).not.toContain("LINHA.HABILITADA");
  });
  it("removes dependent lines when deleting equipment and preserves other links", () => {
    const project = processExample();
    const next = removeComponents(project, ["valve"]);
    expect(next.connections?.map(line => line.id)).toEqual(["signal1", "signal2"]);
    expect(project.connections).toHaveLength(4);
    expect(parseProject(serializeProject(next))).toEqual(next);
  });
});
````

## frontend/src/editor/processExample.ts

````
import { createComponent, type HmiProject, type ComponentKind } from "./project";

/** Demonstrates shared tag bindings; the drawing is not a hydraulic solver. */
export function processExample(): HmiProject {
  function component(id: string, kind: ComponentKind, label: string, x: number, y: number, binding: string | null) {
    return { ...createComponent(kind, 0), id, label, x, y, binding };
  }
  return {
    schemaVersion: 2, name: "Linha de transferência — simulação", screen: { width: 1200, height: 720 },
    simulation: { levelTag: "TANQUE.NIVEL", enableTag: "LINHA.HABILITADA", fillRate: 5, drainRate: 1 },
    variables: [
      { name: "LINHA.HABILITADA", dataType: "BOOLEAN", unit: "", initial: false, min: 0, max: 1 },
      { name: "TANQUE.NIVEL", dataType: "DOUBLE", unit: "%", initial: 35, min: 0, max: 100 },
      { name: "TEMP.VALOR", dataType: "DOUBLE", unit: "°C", initial: 25, min: -20, max: 150 },
    ],
    components: [
      { ...component("title", "text", "LINHA DE TRANSFERÊNCIA", 80, 50, null), width: 450 },
      component("pump", "pump", "P-101", 70, 260, "LINHA.HABILITADA"),
      component("valve", "valve", "XV-101", 350, 260, "LINHA.HABILITADA"),
      component("tank", "tank", "TQ-101", 650, 180, "TANQUE.NIVEL"),
      component("sensor", "sensor", "TT-101", 970, 230, "TEMP.VALOR"),
      component("motor", "motor", "M-101", 70, 480, "LINHA.HABILITADA"),
      component("command", "button", "Ligar / desligar linha", 350, 500, "LINHA.HABILITADA"),
      component("level-input", "setpoint", "Ajustar nível", 650, 500, "TANQUE.NIVEL"),
    ],
    connections: [
      { id: "pipe1", from: "pump", to: "valve", fromPort: "right", toPort: "left", kind: "pipe", binding: "LINHA.HABILITADA" },
      { id: "pipe2", from: "valve", to: "tank", fromPort: "right", toPort: "left", kind: "pipe", binding: "LINHA.HABILITADA" },
      { id: "signal1", from: "tank", to: "sensor", fromPort: "right", toPort: "left", kind: "signal", binding: null },
      { id: "signal2", from: "motor", to: "pump", fromPort: "top", toPort: "bottom", kind: "signal", binding: "LINHA.HABILITADA" },
    ],
  };
}
export function dosingExample(): HmiProject {
  const item = (id: string, kind: ComponentKind, label: string, x: number, y: number, binding: string) =>
    ({ ...createComponent(kind, 0), id, label, x, y, binding });
  const drives = ["DOSADOR.RUN", "ESTEIRA.RUN", "MISTURA.RUN"];
  return {
    schemaVersion: 2, name: "Dosagem de sólidos", screen: { width: 1200, height: 720 },
    variables: [
      ...drives.map(name => ({ name, dataType: "BOOLEAN" as const, unit: "", initial: false, min: 0, max: 1 })),
      { name: "SILO.MASSA", dataType: "DOUBLE", unit: "kg", initial: 200, min: 0, max: 1000 },
    ],
    simulation: { levelTag: "SILO.MASSA", enableTag: drives[0], permitTag: drives[1], highLimit: 800, fillRate: 20, drainRate: 0 },
    components: [
      item("feeder", "feeder", "DS-01 · Dosador", 65, 155, drives[0]),
      item("belt", "conveyor", "ET-01 · Esteira", 345, 155, drives[1]),
      { ...item("silo", "silo", "SL-01 · Silo", 650, 155, "SILO.MASSA"), rangeMin: 0, rangeMax: 1000 },
      item("mixer", "mixer", "MX-01 · Misturador", 945, 155, drives[2]),
      item("feed-cmd", "button", "Comandar dosador", 65, 410, drives[0]),
      item("belt-cmd", "button", "Comandar esteira", 345, 410, drives[1]),
      item("weigh", "setpoint", "Ajustar massa", 650, 410, "SILO.MASSA"),
      item("mix-cmd", "button", "Comandar misturador", 945, 410, drives[2]),
    ],
    connections: [
      { id: "feed-belt", from: "feeder", fromPort: "right", to: "belt", toPort: "left", kind: "signal", binding: drives[0] },
      { id: "belt-bin", from: "belt", fromPort: "right", to: "silo", toPort: "left", kind: "signal", binding: drives[1] },
    ],
  };
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
    ["unsupported version", (p: any) => (p.schemaVersion = 99)],
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

export type ComponentKind = "tank" | "pump" | "indicator" | "text" | "valve" | "motor" | "sensor" | "button" | "setpoint" | "rectangle" | "ellipse" | "silo" | "conveyor" | "feeder" | "mixer";
export interface ProjectVariable {
  name: string; dataType: "BOOLEAN" | "DOUBLE"; unit: string;
  initial: number | boolean; min: number; max: number;
}
export interface TankRule {
  levelTag: string; enableTag: string; permitTag?: string; highLimit?: number; fillRate: number; drainRate: number;
}
export type Port = "left" | "right" | "top" | "bottom";
export interface ConnectionLine {
  id: string; from: string; to: string; fromPort: Port; toPort: Port;
  kind: "pipe" | "signal"; binding: string | null;
}
export interface HmiComponent {
  id: string;
  kind: ComponentKind;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  binding: string | null;
  color?: string;
  rangeMin?: number;
  rangeMax?: number;
}
export interface HmiProject {
  schemaVersion: 1 | 2;
  name: string;
  screen: { width: 1200; height: 720 };
  components: HmiComponent[];
  variables?: ProjectVariable[];
  connections?: ConnectionLine[];
  simulation?: TankRule;
}
export const componentNames: Record<ComponentKind, string> = {
  silo: "Silo", conveyor: "Esteira", feeder: "Dosador de rosca", mixer: "Misturador",
  tank: "Tanque",
  pump: "Bomba",
  indicator: "Indicador",
  text: "Texto",
  valve: "Válvula", motor: "Motor", sensor: "Sensor", button: "Botão",
  setpoint: "Entrada numérica", rectangle: "Retângulo", ellipse: "Elipse",
};
export const bindings: Record<ComponentKind, TagName[]> = {
  silo: [], conveyor: [], feeder: [], mixer: [],
  tank: ["TQ001.LEVEL"],
  pump: ["P001.RUNNING"],
  indicator: ["TQ001.TEMPERATURE", "TQ001.LEVEL"],
  text: [],
  valve: ["P001.RUNNING"], motor: ["P001.RUNNING"], sensor: ["TQ001.TEMPERATURE", "TQ001.LEVEL"],
  button: [], setpoint: [], rectangle: [], ellipse: [],
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

function record(input: unknown, keys: string[], optional: string[] = []): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Estrutura de projeto inválida.");
  const object = input as Record<string, unknown>;
  if (
    Object.keys(object).some(key => !keys.includes(key) && !optional.includes(key)) ||
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
  ], ["variables", "connections", "simulation"]);
  if (project.schemaVersion !== 1 && project.schemaVersion !== 2)
    throw new Error("Versão de projeto não suportada.");
  if (project.schemaVersion === 1 && (project.variables !== undefined || project.connections !== undefined || project.simulation !== undefined))
    throw new Error("Tags próprias e ligações exigem projeto versão 2.");
  const variables: ProjectVariable[] = [];
  if (project.schemaVersion === 2) {
    if (!Array.isArray(project.variables) || project.variables.length > 32 || !Array.isArray(project.connections))
      throw new Error("Defina até 32 tags de simulação e uma lista de ligações.");
    for (const raw of project.variables) {
      const v = record(raw, ["name", "dataType", "unit", "initial", "min", "max"]);
      const name = text(v.name, 64);
      if (!/^[A-Z][A-Z0-9_.]{0,63}$/.test(name) || ["TQ001.LEVEL", "P001.RUNNING", "TQ001.TEMPERATURE"].includes(name) || variables.some(tag => tag.name === name))
        throw new Error("Nome de tag inválido, reservado ou repetido. Use letras maiúsculas, números, ponto e sublinhado.");
      const min = number(v.min, -1000000, 1000000), max = number(v.max, -1000000, 1000000);
      if (min >= max || typeof v.unit !== "string" || v.unit.length > 16 || /[\u0000-\u001f]/.test(v.unit)) throw new Error("Faixa ou unidade da tag inválida.");
      if (v.dataType !== "DOUBLE" && v.dataType !== "BOOLEAN") throw new Error("Tipo de tag inválido.");
      if (v.dataType === "BOOLEAN" ? typeof v.initial !== "boolean" : typeof v.initial !== "number" || !Number.isFinite(v.initial) || v.initial < min || v.initial > max)
        throw new Error("Valor inicial fora do tipo ou faixa da tag.");
      variables.push({ name, dataType: v.dataType, unit: v.unit, initial: v.initial as number | boolean, min, max });
    }
  }
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
    ], project.schemaVersion === 2 ? ["color", "rangeMin", "rangeMax"] : []);
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
      !availableBindings(kind, variables).includes(item.binding as string)
    )
      throw new Error("A tag é incompatível com este componente.");
    const appearance: Pick<HmiComponent, "color" | "rangeMin" | "rangeMax"> = {};
    if (item.color !== undefined) {
      if (typeof item.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(item.color)) throw new Error("Cor inválida.");
      appearance.color = item.color;
    }
    if (item.rangeMin !== undefined || item.rangeMax !== undefined) {
      appearance.rangeMin = number(item.rangeMin, -1000000, 1000000);
      appearance.rangeMax = number(item.rangeMax, -1000000, 1000000);
      if (appearance.rangeMin >= appearance.rangeMax) throw new Error("A escala máxima deve ser maior que a mínima.");
    }
    return {
      id,
      kind,
      label: text(item.label, 64),
      x: number(item.x, 0, 1160),
      y: number(item.y, 0, 688),
      width: number(item.width, 40, 500),
      height: number(item.height, 32, 500),
      angle: number(item.angle, -180, 180),
      binding: item.binding as string | null,
      ...appearance,
    };
  });
  const connections: ConnectionLine[] = [];
  if (project.schemaVersion === 2) {
    const rawLines = project.connections as unknown[];
    if (rawLines.length > 100) throw new Error("Limite de 100 ligações por tela.");
    for (const raw of rawLines) {
      const line = record(raw, ["id", "from", "to", "fromPort", "toPort", "kind", "binding"]);
      const id = text(line.id, 80);
      if (!/^[a-zA-Z0-9_-]+$/.test(id) || connections.some(c => c.id === id)) throw new Error("Identificador de ligação inválido ou repetido.");
      if (typeof line.from !== "string" || typeof line.to !== "string" || !ids.has(line.from) || !ids.has(line.to) || line.from === line.to)
        throw new Error("A ligação deve unir dois objetos existentes e distintos.");
      if (typeof line.fromPort !== "string" || typeof line.toPort !== "string" || typeof line.kind !== "string" || !["left", "right", "top", "bottom"].includes(line.fromPort) || !["left", "right", "top", "bottom"].includes(line.toPort) || !["pipe", "signal"].includes(line.kind))
        throw new Error("Porta ou tipo de ligação inválido.");
      if (line.binding !== null && !availableBindings("pump", variables).includes(line.binding as string)) throw new Error("A ligação exige tag booleana.");
      connections.push({ id, from: line.from, to: line.to, fromPort: line.fromPort as Port, toPort: line.toPort as Port, kind: line.kind as ConnectionLine["kind"], binding: line.binding as string | null });
    }
  }
  let simulation: TankRule | undefined;
  if (project.simulation !== undefined) {
    const rule = record(project.simulation, ["levelTag", "enableTag", "fillRate", "drainRate"], ["permitTag", "highLimit"]);
    if (typeof rule.levelTag !== "string" || typeof rule.enableTag !== "string"
      || !variables.some(v => v.name === rule.levelTag && v.dataType === "DOUBLE")
      || !variables.some(v => v.name === rule.enableTag && v.dataType === "BOOLEAN"))
      throw new Error("A regra exige uma tag numérica de nível e uma tag booleana de acionamento.");
    if (rule.permitTag !== undefined && (typeof rule.permitTag !== "string" || !variables.some(v => v.name === rule.permitTag && v.dataType === "BOOLEAN")))
      throw new Error("A permissão de entrada exige uma tag booleana do projeto.");
    const measured = variables.find(v => v.name === rule.levelTag)!;
    const limit = rule.highLimit === undefined ? {} : { highLimit: number(rule.highLimit, measured.min, measured.max) };
    simulation = { ...limit, ...(typeof rule.permitTag === "string" ? { permitTag: rule.permitTag } : {}), levelTag: rule.levelTag, enableTag: rule.enableTag,
      fillRate: number(rule.fillRate, 0, 1000), drainRate: number(rule.drainRate, 0, 1000) };
  }
  return {
    schemaVersion: project.schemaVersion,
    name: text(project.name, 80),
    screen: { width: 1200, height: 720 },
    components,
    ...(project.schemaVersion === 2 ? { variables, connections } : {}),
    ...(simulation ? { simulation } : {}),
  };
}
export function replaceVariable(project: HmiProject, previousName: string, variable: ProjectVariable): HmiProject {
  if (!project.variables?.some(v => v.name === previousName)) throw new Error("A tag não existe mais. Selecione-a novamente.");
  return parseProject(JSON.stringify({ ...project,
    variables: project.variables.map(v => v.name === previousName ? variable : v),
    components: project.components.map(c => c.binding === previousName ? { ...c, binding: variable.name } : c),
    connections: project.connections?.map(c => c.binding === previousName ? { ...c, binding: variable.name } : c),
    ...(project.simulation ? { simulation: { ...project.simulation,
      levelTag: project.simulation.levelTag === previousName ? variable.name : project.simulation.levelTag,
      ...(project.simulation.permitTag === previousName ? { permitTag: variable.name } : {}),
      enableTag: project.simulation.enableTag === previousName ? variable.name : project.simulation.enableTag } } : {}),
  }));
}
export function availableBindings(kind: ComponentKind, variables: ProjectVariable[] = []): string[] {
  const numeric = ["tank", "silo", "indicator", "sensor", "setpoint"].includes(kind);
  const boolean = ["pump", "valve", "motor", "conveyor", "feeder", "mixer", "button", "rectangle", "ellipse"].includes(kind);
  return [...bindings[kind], ...variables.filter(tag => numeric ? tag.dataType === "DOUBLE" : boolean && tag.dataType === "BOOLEAN").map(tag => tag.name)];
}
export function removeComponents(project: HmiProject, ids: string[]): HmiProject {
  return { ...project, components: project.components.filter(item => !ids.includes(item.id)),
    ...(project.connections ? { connections: project.connections.filter(line => !ids.includes(line.from) && !ids.includes(line.to)) } : {}) };
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

## frontend/src/editor/ProjectLibrary.tsx

````
import { useEffect, useRef, useState } from "react";
import type { HmiProject } from "./project";
import { editSavedEntry, listProjects, readEntry, readProject, saveProject } from "./savedProjects";

interface Props {
  project: HmiProject;
  open: (next: HmiProject) => void;
  saved: () => void;
  editedEntry: (entry: Awaited<ReturnType<typeof readEntry>>, newName: string | null) => void;
}

export function ProjectLibrary({ project, open, saved, editedEntry }: Props) {
  const [names, setNames] = useState<string[]>([]);
  const [selection, setSelection] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [replacement, setReplacement] = useState<{ project: HmiProject; revision: string } | null>(null);
  const [operation, setOperation] = useState<{ type: "rename" | "delete"; entry: Awaited<ReturnType<typeof readEntry>> } | null>(null);
  const [newName, setNewName] = useState("");
  const notifyEdit = useRef(editedEntry);
  notifyEdit.current = editedEntry;
  const active = useRef(false);
  const latest = useRef(project);
  latest.current = project;
  const pending = replacement?.project === project ? replacement : null;

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  async function refresh(preferred?: string) {
    const available = await listProjects();
    if (!active.current) return;
    setNames(available);
    setSelection(current => {
      const name = preferred ?? current;
      return available.includes(name) ? name : available[0] ?? "";
    });
  }

  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      if (active.current) setMessage(error instanceof DOMException
        ? "O navegador não conseguiu acessar a biblioteca. Confira o espaço disponível ou use Exportar JSON."
        : error instanceof Error ? error.message : "Não foi possível concluir a operação.");
    } finally {
      if (active.current) setBusy(false);
    }
  }

  async function save(revision?: string) {
    const result = await saveProject(project, revision);
    if (!active.current) return;
    if (!result.saved) {
      if (result.revision === null) {
        setReplacement(null);
        await refresh();
        setMessage("A cópia foi removida ou renomeada em outra aba. Use Salvar projeto para criar uma nova cópia.");
        return;
      }
      if (latest.current === project) {
        setReplacement({ project, revision: result.revision });
        setMessage(revision ? "Outra aba atualizou esta tela. Confirme para substituir a versão mais recente." : "");
      }
      return;
    }
    setReplacement(null);
    if (latest.current === project) saved();
    setMessage(`Projeto “${project.name}” salvo neste navegador.`);
    await refresh(project.name);
  }

  async function begin(type: "rename" | "delete") {
    const entry = await readEntry(selection);
    if (!active.current) return;
    setReplacement(null);
    setOperation({ type, entry });
    setNewName(entry.name);
  }

  async function confirmEdit() {
    if (!operation) return;
    const name = operation.type === "rename" ? newName.trim() : null;
    try {
      await editSavedEntry(operation.entry, name);
    } catch (error) {
      setOperation(null);
      await refresh();
      throw error;
    }
    if (!active.current) return;
    setOperation(null);
    notifyEdit.current(operation.entry, name);
    await refresh(name ?? undefined);
    setMessage(name ? `Projeto renomeado para “${name}”.` : `Projeto “${operation.entry.name}” excluído da biblioteca.`);
  }

  return <details className="project-library" onToggle={event => {
    if (event.currentTarget.open) void perform(() => refresh());
    else { setReplacement(null); setOperation(null); }
  }}>
    <summary>Projetos salvos</summary>
    <p>Biblioteca deste navegador. Use Exportar JSON para guardar uma cópia fora deste dispositivo.</p>
    <div className="library-controls">
      <button disabled={busy || !!pending || !!operation} onClick={() => void perform(() => save())}>Salvar projeto</button>
      <label>Projeto <select aria-label="Projeto salvo" value={selection} disabled={busy || !names.length}
        onChange={event => { setSelection(event.target.value); setReplacement(null); setOperation(null); }}>
        {!names.length && <option value="">Nenhum projeto salvo</option>}
        {names.map(name => <option key={name}>{name}</option>)}
      </select></label>
      <button disabled={busy || !selection || !!operation} onClick={() => void perform(async () => {
        const next = await readProject(selection);
        if (!active.current || latest.current !== project) return;
        setReplacement(null);
        open(next);
        setMessage(`Projeto “${next.name}” aberto. Desfazer recupera a tela anterior.`);
      })}>Abrir projeto salvo</button>
      <button disabled={busy || !selection || !!operation} onClick={() => void perform(() => begin("rename"))}>Renomear</button>
      <button disabled={busy || !selection || !!operation} onClick={() => void perform(() => begin("delete"))}>Excluir da biblioteca</button>
    </div>
    {operation && <form className="library-controls" onSubmit={event => {
      event.preventDefault();
      void perform(confirmEdit);
    }}>
      {operation.type === "rename" ? <label>Novo nome de “{operation.entry.name}” <input aria-label="Novo nome do projeto" value={newName} maxLength={80} required autoFocus onChange={event => setNewName(event.target.value)} /></label>
        : <span>Excluir a cópia salva de “{operation.entry.name}” deste navegador?</span>}
      <button disabled={busy || (operation.type === "rename" && (!newName.trim() || newName.trim() === operation.entry.name))}>
        {operation.type === "rename" ? "Confirmar nome" : "Confirmar exclusão"}
      </button>
      <button type="button" disabled={busy} onClick={() => setOperation(null)}>Cancelar</button>
    </form>}
    {pending && <div className="library-controls">
      <span>Já existe um projeto chamado “{project.name}”. Substituir a cópia salva?</span>
      <button disabled={busy} onClick={() => void perform(() => save(pending.revision))}>Substituir projeto</button>
      <button disabled={busy} onClick={() => { setReplacement(null); setMessage(""); }}>Cancelar</button>
    </div>}
    {message && <p role="status">{message}</p>}
  </details>;
}
````

## frontend/src/editor/ProjectTools.tsx

````
import { useEffect, useRef, useState } from "react";
import { availableBindings, parseProject, replaceVariable, type HmiProject, type ProjectVariable, type Port, type ConnectionLine } from "./project";
import { SimulationRuleEditor } from "./SimulationRuleEditor";

interface Props { project: HmiProject; change: (next: HmiProject) => void; report: (message: string) => void; }
export function ProjectTools({ project, change, report }: Props) {
  const [name, setName] = useState("MOTOR.RUN");
  const [editingName, setEditingName] = useState<string | null>(null);
  const [type, setType] = useState<"BOOLEAN" | "DOUBLE">("BOOLEAN");
  const [unit, setUnit] = useState("");
  const [initial, setInitial] = useState("0");
  const [min, setMin] = useState("0"), [max, setMax] = useState("100");
  const [from, setFrom] = useState(""), [to, setTo] = useState("");
  const [fromPort, setFromPort] = useState<Port>("right"), [toPort, setToPort] = useState<Port>("left");
  const [kind, setKind] = useState<"pipe" | "signal">("pipe");
  const [binding, setBinding] = useState("");
  const [editingLine, setEditingLine] = useState<string | null>(null);
  const tagForm = useRef<HTMLFormElement>(null), lineForm = useRef<HTMLFormElement>(null);
  useEffect(() => { setEditingName(null); setEditingLine(null); }, [project]);
  function commit(next: HmiProject) {
    try { change(parseProject(JSON.stringify({ ...next, schemaVersion: 2, variables: next.variables ?? [], connections: next.connections ?? [] }))); report(""); return true; }
    catch (error) { report((error as Error).message); return false; }
  }
  function removeVariable(variable: ProjectVariable) {
    const { simulation, ...base } = project;
    commit({ ...base, ...(simulation && simulation.levelTag !== variable.name && simulation.enableTag !== variable.name && simulation.permitTag !== variable.name ? { simulation } : {}), variables: project.variables?.filter(v => v.name !== variable.name),
      components: project.components.map(item => item.binding === variable.name ? { ...item, binding: null } : item),
      connections: project.connections?.map(line => line.binding === variable.name ? { ...line, binding: null } : line) });
  }
  const ports: Record<Port, string> = { left: "Esquerda", right: "Direita", top: "Topo", bottom: "Base" };
  return <div className="project-tools">
    <details>
      <summary>Por onde começar?</summary>
      <ol className="editor-steps">
        <li><strong>Tags:</strong> crie variáveis e use Editar tag para ajustar nome, faixa ou valor inicial.</li>
        <li><strong>Objetos e ligações:</strong> insira equipamentos, vincule suas tags e use Desenhar ligação para escolher duas portas na tela. Editar ligação altera uma conexão existente.</li>
        <li><strong>Regra:</strong> configure o nível, o acionamento e as taxas em Simulação automática.</li>
        <li><strong>Operação:</strong> teste os comandos e clique em Iniciar simulação automática. Em Projetos salvos, guarde a configuração neste navegador.</li>
      </ol>
      <p>Para experimentar primeiro, use Exemplo de processo. Desfazer recupera a tela anterior. Salve seu projeto antes de fechar ou recarregar.</p>
    </details>
    <details>
      <summary>Tags do projeto <span>{project.variables?.length ?? 0} / 32</span></summary>
      <p>Crie ou edite as tags na lista abaixo. Renomear atualiza seus vínculos. BOOLEAN comanda estados; DOUBLE representa valores numéricos. As três tags da demonstração permanecem somente leitura.</p>
      {editingName && <p className="editing-banner">Editando tag: <strong>{editingName}</strong></p>}
      <form ref={tagForm} className="project-form" onSubmit={event => {
        event.preventDefault();
        if (![initial, min, max].every(value => value.trim())) { report("Preencha os valores da tag."); return; }
        const variable: ProjectVariable = { name: name.trim(), dataType: type, unit,
          initial: type === "BOOLEAN" ? initial === "1" : Number(initial), min: type === "BOOLEAN" ? 0 : Number(min), max: type === "BOOLEAN" ? 1 : Number(max) };
        try {
          const saved = commit(editingName ? replaceVariable(project, editingName, variable) : { ...project, variables: [...project.variables ?? [], variable] });
          if (saved) setEditingName(null);
        } catch (error) { report((error as Error).message); }
      }}>
        <label>Nome da tag<input aria-label="Nome da tag" value={name} maxLength={64} onChange={e => setName(e.target.value)} required /></label>
        <label>Tipo<select aria-label="Tipo da tag" value={type} disabled={!!editingName} onChange={e => { setType(e.target.value as typeof type); setInitial("0"); }}><option>BOOLEAN</option><option>DOUBLE</option></select></label>
        <label>Valor inicial{type === "BOOLEAN" ? <select aria-label="Valor inicial" value={initial} onChange={e => setInitial(e.target.value)}><option value="0">Desligado / falso</option><option value="1">Ligado / verdadeiro</option></select>
          : <input aria-label="Valor inicial" type="number" step="any" value={initial} onChange={e => setInitial(e.target.value)} required />}</label>
        {type === "DOUBLE" && <>
          <label>Mínimo<input aria-label="Mínimo da tag" type="number" step="any" value={min} onChange={e => setMin(e.target.value)} required /></label>
          <label>Máximo<input aria-label="Máximo da tag" type="number" step="any" value={max} onChange={e => setMax(e.target.value)} required /></label>
          <label>Unidade<input aria-label="Unidade da tag" value={unit} maxLength={16} onChange={e => setUnit(e.target.value)} /></label>
        </>}
        <button type="submit" disabled={!editingName && (project.variables?.length ?? 0) >= 32}>{editingName ? "Salvar tag" : "Criar tag"}</button>
        {editingName && <button type="button" onClick={() => setEditingName(null)}>Cancelar edição da tag</button>}
      </form>
      <ul className="project-items">{project.variables?.map(variable => <li key={variable.name}>
        <span><strong>{variable.name}</strong> · {variable.dataType} · Inicial: {String(variable.initial)} {variable.unit} {variable.dataType === "DOUBLE" && `(${variable.min} a ${variable.max})`}</span>
        <div><button onClick={() => { setEditingName(variable.name); setName(variable.name); setType(variable.dataType); setUnit(variable.unit); setInitial(typeof variable.initial === "boolean" ? variable.initial ? "1" : "0" : String(variable.initial)); setMin(String(variable.min)); setMax(String(variable.max)); tagForm.current?.scrollIntoView({ block: "center" }); }}>Editar tag {variable.name}</button>{" "}<button onClick={() => { removeVariable(variable); if (editingName === variable.name) setEditingName(null); }}>Excluir tag {variable.name}</button></div>
      </li>)}</ul>
      <p>O tipo de uma tag existente permanece fixo. Excluir remove seus vínculos e a regra que a utiliza; Desfazer recupera tudo. Os valores de operação não são exportados, apenas o valor inicial.</p>
    </details>
    <details>
      <summary>Ligações <span>{project.connections?.length ?? 0} / 100</span></summary>
      <p>Escolha origem, destino e as portas. Tubulações e sinais acompanham o movimento dos objetos. Vincule uma tag booleana para indicar o estado da linha; a ligação gráfica não calcula vazão.</p>
      {editingLine && <p className="editing-banner">Editando ligação existente</p>}
      <form ref={lineForm} className="project-form" onSubmit={event => {
        event.preventDefault();
        if (editingLine && !project.connections?.some(line => line.id === editingLine)) { report("A ligação não existe mais. Selecione-a novamente."); return; }
        const line: ConnectionLine = { id: editingLine ?? crypto.randomUUID(), from, to, fromPort, toPort, kind, binding: binding || null };
        if (commit({ ...project, connections: editingLine ? project.connections?.map(item => item.id === editingLine ? line : item) : [...project.connections ?? [], line] })) setEditingLine(null);
      }}>
        <label>Origem<select aria-label="Origem da ligação" value={from} onChange={e => setFrom(e.target.value)} required><option value="">Selecione</option>{project.components.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label>Porta de saída<select aria-label="Porta de saída" value={fromPort} onChange={e => setFromPort(e.target.value as Port)}>{Object.entries(ports).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Destino<select aria-label="Destino da ligação" value={to} onChange={e => setTo(e.target.value)} required><option value="">Selecione</option>{project.components.filter(item => item.id !== from).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label>Porta de entrada<select aria-label="Porta de entrada" value={toPort} onChange={e => setToPort(e.target.value as Port)}>{Object.entries(ports).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Tipo<select aria-label="Tipo da ligação" value={kind} onChange={e => setKind(e.target.value as typeof kind)}><option value="pipe">Tubulação</option><option value="signal">Sinal</option></select></label>
        <label>Tag de estado<select aria-label="Tag da ligação" value={binding} onChange={e => setBinding(e.target.value)}><option value="">Sem vínculo</option>{availableBindings("pump", project.variables).map(tag => <option key={tag}>{tag}</option>)}</select></label>
        <button type="submit" disabled={!editingLine && (project.connections?.length ?? 0) >= 100}>{editingLine ? "Salvar ligação" : "Criar ligação"}</button>
        {editingLine && <button type="button" onClick={() => setEditingLine(null)}>Cancelar edição da ligação</button>}
      </form>
      <ul className="project-items">{project.connections?.map((line, index) => <li key={line.id}><span>{project.components.find(item => item.id === line.from)?.label} → {project.components.find(item => item.id === line.to)?.label} · {line.kind === "pipe" ? "Tubulação" : "Sinal"} · {line.binding ?? "Sem vínculo"}</span><div><button onClick={() => { setEditingLine(line.id); setFrom(line.from); setTo(line.to); setFromPort(line.fromPort); setToPort(line.toPort); setKind(line.kind); setBinding(line.binding ?? ""); lineForm.current?.scrollIntoView({ block: "center" }); }}>Editar ligação {index + 1}</button>{" "}<button onClick={() => commit({ ...project, connections: project.connections?.filter(item => item.id !== line.id) })}>Excluir ligação {index + 1}</button></div></li>)}</ul>
    </details>
    <SimulationRuleEditor project={project} commit={commit} />
  </div>;
}
````

## frontend/src/editor/savedProjects.ts

````
import { parseProject, serializeProject, type HmiProject } from "./project";

const databaseName = "nexo-project-library";
const storeName = "projects";

interface Entry {
  name: string;
  revision: string;
  document: string;
}

function openLibrary(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: "name" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function useStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, result: (value: T) => void) => void) {
  const db = await openLibrary();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      let value: T;
      transaction.oncomplete = () => resolve(value);
      transaction.onabort = () => reject(transaction.error ?? new Error("Gravação interrompida."));
      run(transaction.objectStore(storeName), next => { value = next; });
    });
  } finally {
    db.close();
  }
}

export function listProjects() {
  return useStore<string[]>("readonly", (store, result) => {
    const keys = store.getAllKeys();
    keys.onsuccess = () => result(keys.result.map(String).sort((a, b) => a.localeCompare(b, "pt-BR")));
  });
}

export async function readEntry(name: string) {
  const entry = await useStore<Entry | undefined>("readonly", (store, result) => {
    const request = store.get(name);
    request.onsuccess = () => result(request.result);
  });
  if (!entry) throw new Error("O projeto já não está na lista deste navegador.");
  return entry;
}

export async function readProject(name: string) {
  return parseProject((await readEntry(name)).document);
}

export async function editSavedEntry(entry: Entry, newName: string | null) {
  const renamed = newName === null ? null : {
    name: newName,
    document: serializeProject({ ...parseProject(entry.document), name: newName }),
    revision: crypto.randomUUID(),
  };
  const error = await useStore<string>("readwrite", (store, result) => {
    const read = store.get(entry.name);
    read.onsuccess = () => {
      if (read.result?.revision !== entry.revision) {
        result("O projeto mudou em outra aba. Selecione a versão atual e tente novamente.");
        return;
      }
      if (!renamed) {
        store.delete(entry.name);
        result("");
        return;
      }
      const destination = store.getKey(renamed.name);
      destination.onsuccess = () => {
        if (destination.result !== undefined) {
          result("Este nome já está em uso. Escolha outro nome.");
          return;
        }
        store.add(renamed);
        store.delete(entry.name);
        result("");
      };
    };
  });
  if (error) throw new Error(error);
}

type SaveResult = { saved: true } | { saved: false; revision: string | null };

export function saveProject(project: HmiProject, expectedRevision?: string) {
  const document = serializeProject(project);
  return useStore<SaveResult>("readwrite", (store, result) => {
    const request = store.get(project.name);
    request.onsuccess = () => {
      const existing: Entry | undefined = request.result;
      if (!existing && expectedRevision !== undefined) {
        result({ saved: false, revision: null });
        return;
      }
      if (existing && existing.revision !== expectedRevision) {
        result({ saved: false, revision: existing.revision });
        return;
      }
      store.put({ name: project.name, document, revision: crypto.randomUUID() } satisfies Entry);
      result({ saved: true });
    };
  });
}
````

## frontend/src/editor/SimulationRuleEditor.tsx

````
import { useEffect, useState } from "react";
import type { HmiProject } from "./project";

export function SimulationRuleEditor({ project, commit }: { project: HmiProject; commit: (next: HmiProject) => boolean }) {
  const [level, setLevel] = useState(""), [enable, setEnable] = useState("");
  const [limit, setLimit] = useState("");
  const [permit, setPermit] = useState("");
  const [fill, setFill] = useState("5"), [drain, setDrain] = useState("1");
  useEffect(() => {
    setLimit(String(project.simulation?.highLimit ?? ""));
    setPermit(project.simulation?.permitTag ?? "");
    setLevel(project.simulation?.levelTag ?? ""); setEnable(project.simulation?.enableTag ?? "");
    setFill(String(project.simulation?.fillRate ?? 5)); setDrain(String(project.simulation?.drainRate ?? 1));
  }, [project]);
  return <details>
    <summary>Simulação automática <span>{project.simulation ? "Regra configurada" : "Sem regra"}</span></summary>
    <p>O acionamento liga a entrada de material. Se houver uma permissão configurada, as duas tags precisam estar ligadas. A saída é contínua. O nível respeita os limites da tag. Taxas na unidade da tag por segundo simulado; não é um modelo hidráulico das tubulações.</p>
    <form className="project-form" onSubmit={event => { event.preventDefault(); if (fill.trim() && drain.trim()) commit({ ...project, simulation: { levelTag: level, enableTag: enable, ...(permit ? { permitTag: permit } : {}), ...(limit.trim() ? { highLimit: Number(limit) } : {}), fillRate: Number(fill), drainRate: Number(drain) } }); }}>
      <label>Tag de nível<select aria-label="Tag de nível da regra" value={level} onChange={event => setLevel(event.target.value)} required><option value="">Selecione</option>{project.variables?.filter(v => v.dataType === "DOUBLE").map(v => <option key={v.name}>{v.name}</option>)}</select></label>
      <label>Acionamento<select aria-label="Tag de acionamento da regra" value={enable} onChange={event => setEnable(event.target.value)} required><option value="">Selecione</option>{project.variables?.filter(v => v.dataType === "BOOLEAN").map(v => <option key={v.name}>{v.name}</option>)}</select></label>
      <label>Permissão de entrada<select value={permit} onChange={event => setPermit(event.target.value)}><option value="">Sem condição adicional</option>{project.variables?.filter(v => v.dataType === "BOOLEAN").map(v => <option key={v.name}>{v.name}</option>)}</select></label>
      <label>Entrada por segundo<input aria-label="Taxa de entrada" type="number" min="0" max="1000" step="any" value={fill} onChange={event => setFill(event.target.value)} required /></label>
      <label>Saída por segundo<input aria-label="Taxa de saída" type="number" min="0" max="1000" step="any" value={drain} onChange={event => setDrain(event.target.value)} required /></label>
      <label>Limite de alarme alto<input type="number" step="any" placeholder="Opcional" min={project.variables?.find(v => v.name === level)?.min} max={project.variables?.find(v => v.name === level)?.max} value={limit} onChange={event => setLimit(event.target.value)} /></label>
      <button>Salvar regra</button>
      {project.simulation && <button type="button" onClick={() => { const { simulation: _removed, ...next } = project; commit(next); }}>Remover regra</button>}
    </form>
    <p>Em Operação, clique em Iniciar simulação automática. Pausar mantém o último nível. Voltar à edição reinicia os valores.</p>
  </details>;
}
````

## frontend/src/editor/useProjectSimulation.ts

````
import { useEffect, useRef, useState } from "react";
import type { ProjectVariable, TankRule } from "./project";

export function useProjectSimulation(variables: ProjectVariable[], enabled: boolean, rule?: TankRule) {
  const [values, setValues] = useState<Record<string, number | boolean>>({});
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [automatic, setAutomatic] = useState(false);
  const currentValues = useRef<Record<string, number | boolean>>({});
  const tick = useRef<() => void>(() => {});
  const generation = useRef(0);
  const pending = useRef(false);
  const config = JSON.stringify(variables);
  const ruleConfig = JSON.stringify(rule);
  async function evaluate(next: Record<string, number | boolean>, epoch = generation.current, seconds = 0) {
    if (!enabled || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      // Alarm limits belong to the display; the Java endpoint accepts only the physical rule.
      const calculation = rule && { levelTag: rule.levelTag, enableTag: rule.enableTag, permitTag: rule.permitTag, fillRate: rule.fillRate, drainRate: rule.drainRate };
      const response = await fetch("/api/simulation/evaluate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variables, values: next, ...(calculation ? { rule: calculation, seconds } : {}) }), signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(response.status === 400 ? "O Java recusou o valor ou a configuração das tags." : "Não foi possível comunicar com o simulador Java.");
      const data = await response.json();
      if (data.source !== "SIMULATED" || !data.values || Object.keys(data.values).length !== variables.length
          || variables.some(v => !Object.hasOwn(data.values, v.name) || (v.dataType === "BOOLEAN"
            ? typeof data.values[v.name] !== "boolean" : typeof data.values[v.name] !== "number" || !Number.isFinite(data.values[v.name]) || data.values[v.name] < v.min || data.values[v.name] > v.max)))
        throw new Error("Resposta inválida do simulador.");
      if (epoch === generation.current) { currentValues.current = data.values; setValues(data.values); setReady(true); }
    } catch (cause) {
      if (epoch === generation.current) { setAutomatic(false); setReady(false); setError(cause instanceof Error && cause.name !== "TimeoutError" ? cause.message : "Simulador sem resposta. Tente reconectar."); }
    } finally {
      if (epoch === generation.current) { pending.current = false; setBusy(false); }
    }
  }
  useEffect(() => {
    const epoch = ++generation.current;
    pending.current = false; currentValues.current = {}; setAutomatic(false); setReady(false); setValues({}); setBusy(false); setError("");
    if (enabled && variables.length) void evaluate({}, epoch);
    return () => { generation.current++; };
    // Configuration changes start a fresh, isolated project simulation.
  }, [config, ruleConfig, enabled]);
  tick.current = () => { if (rule && ready) void evaluate(currentValues.current, generation.current, 1); };
  useEffect(() => {
    if (!enabled || !ready || !automatic || !rule) return;
    const timer = window.setInterval(() => tick.current(), 1000);
    return () => window.clearInterval(timer);
  }, [enabled, ready, automatic, ruleConfig]);
  return { values, ready, busy, error, automatic,
    toggleAutomatic: () => { if (rule && ready && !pending.current) setAutomatic(value => !value); },
    write: (name: string, value: number | boolean) => { if (ready) void evaluate({ ...currentValues.current, [name]: value }); },
    retry: () => void evaluate(currentValues.current),
  };
}
````

## frontend/src/editor/widgets.ts

````
import {
  Circle,
  Path,
  FabricText,
  Group,
  Rect,
  Triangle,
  Ellipse,
  Polygon,
  Line,
  type FabricObject,
} from "fabric";
import type { HmiComponent } from "./project";

const origin = { originX: "left", originY: "top" } as const;
const lightInk = "#25384b";
function makeLabel(text: string, left: number, top: number, fontSize: number, ink: string) {
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
export function createWidget(item: HmiComponent, customUnit?: string, dark = false): Widget {
  const ink = dark ? "#e1ecf4" : lightInk;
  const label = (text: string, x: number, y: number, size = 15) => makeLabel(text, x, y, size, ink);
  const accent = item.color ?? (dark ? "#62c4cb" : "#318f9b");
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
  if (item.kind === "text") heading.set({ fill: item.color ?? ink });
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
      fill: accent,
      strokeWidth: 0,
    });
    const valueLabel = makeLabel("50.0 %", 49, 115, 23, lightInk);
    const quality = label("Prévia", 23, 228, 11);
    children.push(new Line([3, 130, 21, 130], { stroke: accent, strokeWidth: 5 }), new Line([159, 130, 177, 130], { stroke: accent, strokeWidth: 5 }), vessel, water, valueLabel, quality);
    // Group construction changes child coordinates from canvas space to group space.
    update = (value, editing) => {
      const available = typeof value === "number";
      const minimum = item.rangeMin ?? 0, maximum = item.rangeMax ?? 100;
      const level = editing ? 50 : available ? Math.max(0, Math.min(100, (value - minimum) * 100 / (maximum - minimum))) : 0;
      const bottom = 206 - height / 2;
      water.set({
        top: bottom - level * 1.62,
        height: level * 1.62,
        visible: editing || available,
      });
      valueLabel.set({
        text: editing ? "50.0 %" : available ? `${value.toFixed(1)} ${customUnit ?? "%"}` : "—",
      });
      quality.set({
        text: editing
          ? "Prévia de edição"
          : available
            ? "SIMULADO"
            : "INDISPONÍVEL",
      });
    };
  } else if (item.kind === "silo") {
    const bin = new Polygon([{x: 0, y: 0}, {x: 92, y: 0}, {x: 92, y: 43}, {x: 53, y: 67}, {x: 39, y: 67}, {x: 0, y: 43}],
      { ...origin, left: 22, top: 31, fill: dark ? "#23394b" : "#edf3f5", stroke: ink, strokeWidth: 2 });
    const track = new Rect({ ...origin, left: 127, top: 31, width: 12, height: 67, fill: "#dbe3e8" });
    const bar = new Rect({ left: 127, top: 98, originX: "left", originY: "bottom", width: 12, height: 34, fill: accent, strokeWidth: 0 });
    const reading = label("", 13, 107, 13);
    children.push(bin, track, bar, reading);
    update = (value, editing) => {
      const min = item.rangeMin ?? 0, max = item.rangeMax ?? 100;
      const amount = editing ? (min + max) / 2 : value;
      const fraction = typeof amount === "number" ? Math.max(0, Math.min(1, (amount - min) / (max - min))) : 0;
      bar.set({ height: fraction * 67 });
      reading.set({ text: typeof amount === "number" ? amount.toFixed(1) + " " + (customUnit ?? "") : "INDISPONÍVEL" });
    };
  } else if (item.kind === "conveyor" || item.kind === "feeder" || item.kind === "mixer") {
    const shapes = {
      conveyor: "M 31 48 H 130 A 16 16 0 0 1 130 80 H 31 A 16 16 0 0 1 31 48 Z M 33 81 L 24 95 M 126 81 L 134 95 M 26 64 A 6 6 0 1 0 38 64 A 6 6 0 1 0 26 64 M 124 64 A 6 6 0 1 0 136 64 A 6 6 0 1 0 124 64",
      feeder: "M 15 34 H 67 L 51 58 H 31 Z M 18 59 H 142 V 85 H 18 Z M 27 72 H 135 M 37 62 L 47 82 M 56 62 L 66 82 M 75 62 L 85 82 M 94 62 L 104 82 M 113 62 L 123 82",
      mixer: "M 34 47 V 82 Q 34 96 49 96 H 112 Q 127 96 127 82 V 47 M 66 31 H 94 V 48 H 66 Z M 80 48 V 80 M 54 68 L 80 80 L 106 68 M 54 83 L 80 71 L 106 83",
    };
    const symbol = new Path(shapes[item.kind], { fill: "", stroke: ink, strokeWidth: 3, strokeLineJoin: "round" });
    const status = label("", 12, 106, 12);
    children.push(symbol, status);
    update = (value, editing) => {
      symbol.set({ stroke: editing || value === true ? accent : "#8494a3" });
      status.set({ text: editing ? "Prévia de edição" : value === null ? "INDISPONÍVEL" : value ? "ACIONADO" : "PARADO" });
    };
  } else if (["pump", "valve", "motor", "button"].includes(item.kind)) {
    const body = new Circle({
      ...origin,
      left: 54,
      top: 40,
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
    const symbol = item.kind === "valve"
      ? new Polygon([{ x: 0, y: 0 }, { x: 66, y: 42 }, { x: 66, y: 0 }, { x: 0, y: 42 }], { ...origin, left: 45, top: 43, fill: accent, stroke: ink, strokeWidth: 1 })
      : item.kind === "button" ? new Rect({ ...origin, left: 12, top: 36, width: 136, height: 54, rx: 6, ry: 6, fill: accent }) : body;
    const centerLabel = label(item.kind === "motor" ? "M" : "Alternar", item.kind === "motor" ? 67 : 45, 49, item.kind === "motor" ? 24 : 16);
    centerLabel.set({ fill: lightInk });
    if (item.kind === "pump" || item.kind === "valve") children.push(
      new Line([3, 65, item.kind === "pump" ? 54 : 45, 65], { stroke: accent, strokeWidth: 5 }),
      new Line([item.kind === "pump" ? 104 : 111, 65, 157, 65], { stroke: accent, strokeWidth: 5 }),
    );
    children.push(symbol, ...(item.kind === "pump" ? [rotor] : item.kind === "motor" || item.kind === "button" ? [centerLabel] : []), status);
    update = (value, editing) => {
      const active = editing || value === true;
      symbol.set({
        stroke: active ? accent : "#8494a3",
        fill: active ? accent : "#edf0f3",
      });
      rotor.set({ fill: active ? "#ffffff" : "#8494a3" });
      status.set({
        text: editing
          ? "Prévia de edição"
          : value === null
            ? "INDISPONÍVEL"
            : value
              ? item.kind === "valve" ? "ABERTA" : "LIGADO"
              : item.kind === "valve" ? "FECHADA" : "DESLIGADO",
      });
    };
  } else if (["indicator", "sensor", "setpoint"].includes(item.kind)) {
    const panel = new Rect({
      ...origin,
      left: 2,
      top: 35,
      width: 155,
      height: 61,
      fill: dark ? "#203547" : "#f5f8fa",
      stroke: accent,
      rx: 4,
      ry: 4,
    });
    const valueLabel = label("25.0 °C", 15, 48, 25);
    const quality = label("Prévia de edição", 12, 108, 10);
    children.push(panel, valueLabel, quality);
    update = (value, editing) => {
      const unit = customUnit ?? (item.binding === "TQ001.LEVEL" ? "%" : "°C");
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
  } else if (item.kind === "rectangle" || item.kind === "ellipse") {
    const shape = item.kind === "rectangle" ? new Rect({ ...origin, left: 8, top: 34, width: 144, height: 88, fill: accent, strokeWidth: 0 })
      : new Ellipse({ ...origin, left: 8, top: 34, rx: 72, ry: 44, fill: accent, strokeWidth: 0 });
    children.push(shape);
    update = (value, editing) => shape.set({ fill: editing || !item.binding || value === true ? accent : value === false ? "#c6d0d8" : "#edf0f3" });
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
.header-actions { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
.theme-switch { display: inline-grid; place-items: center; height: 44px; padding: 0 2px; background: none; border: 0; border-radius: 22px; }
.theme-track { position: relative; display: block; width: 56px; height: 28px; border-radius: 20px; background: #b05419; box-shadow: inset 0 0 0 1px #0002; color: white; }
.theme-track svg { position: absolute; top: 6px; width: 16px; height: 16px; }
.theme-sun { right: 6px; }
.theme-moon { left: 6px; visibility: hidden; }
.theme-thumb { position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px #0005; transition: transform 160ms ease; }
.theme-switch[aria-checked="true"] .theme-track { background: #101827; box-shadow: inset 0 0 0 1px #8296af; }
.theme-switch[aria-checked="true"] .theme-thumb { transform: translateX(28px); }
.theme-switch[aria-checked="true"] .theme-sun { visibility: hidden; }
.theme-switch[aria-checked="true"] .theme-moon { visibility: visible; }
.system-theme { margin-top: 8px; padding: 6px 10px; border: 1px solid #899aaa; border-radius: 4px; }
header > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 8px; }
@media (max-width: 480px) { .header-actions { gap: 6px; } header { padding-inline: 10px; } }
:root[data-theme="dark"] {
  color-scheme: dark;
  --surface: #172635;
  --raised: #213547;
  --edge: #3b5063;
  --ink: #e1ecf4;
  --muted: #b2c4d3;
  --positive: #79dfcc;
  color: var(--ink);
  background: #0e1925;
}
[data-theme="dark"] :is(header, .panel, .metrics article, .connection) { background: var(--surface); border-color: var(--edge); }
[data-theme="dark"] :is(header, .page-heading p, .eyebrow, .metric-label, .metric-value small, .metric-foot, .pump-value, .panel p, .panel-footer, .pill, th, footer, .future p, .sidebar-footer small) { color: var(--muted); }
[data-theme="dark"] :is(h1, header strong, .metric-value, .info-strip strong) { color: var(--ink); }
[data-theme="dark"] :is(.info-strip, kbd) { color: var(--ink); background: var(--raised); border-color: var(--edge); }
[data-theme="dark"] :is(.panel-heading, .panel-footer, td, th, footer, .pill) { border-color: var(--edge); }
[data-theme="dark"] :is(.simulation, .notice, .metric-icon.warm) { color: #ffdb98; background: #382e20; border-color: #6c5631; }
[data-theme="dark"] :is(.connection.live, .metric-icon:not(.warm)) { background: #173c3d; color: var(--positive); border-color: #366561; }
[data-theme="dark"] :is(.pump-value.active, .info-strip button) { color: var(--positive); }
[data-theme="dark"] .process :is(.equipment-title, .temperature) { fill: var(--ink); }
[data-theme="dark"] .process :is(.diagram-label, .scale) { fill: var(--muted); }
[data-theme="dark"] .process #grid circle { fill: #354858; }
[data-theme="dark"] .process .temperature-panel { fill: var(--raised); stroke: var(--edge); }
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

## frontend/src/useTheme.ts

````
import { useEffect, useLayoutEffect, useState } from "react";

type Theme = "system" | "light" | "dark";
const key = "nexo.theme";

function preference(): Theme {
  try {
    const value = localStorage.getItem(key);
    if (value === "dark" || value === "light") return value;
  } catch { /* Storage may be disabled in this browser. */ }
  return "system";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(preference);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
  const dark = theme === "dark" || (theme === "system" && systemDark);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const syncSystem = () => setSystemDark(media?.matches ?? false);
    const syncStorage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) setTheme(preference());
    };
    syncSystem();
    media?.addEventListener("change", syncSystem);
    window.addEventListener("storage", syncStorage);
    return () => {
      media?.removeEventListener("change", syncSystem);
      window.removeEventListener("storage", syncStorage);
    };
  }, []);

  function choose(value: Theme) {
    setTheme(value);
    try { localStorage.setItem(key, value); } catch { /* Keep the session preference. */ }
  }
  return { theme, dark, choose };
}
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

Plataforma SCADA/HMI com backend Java e interface web. Use o interruptor de sol e lua no cabeçalho para alternar o tema. A escolha fica guardada no navegador. Na versão **0.9.0**, a operação do silo mostra gráfico de massa, alarme alto e histórico local. Em **Ajuda → Aparência**, você pode voltar ao tema do sistema. Para experimentar os equipamentos de sólidos, abra **Editor → Exemplo de dosagem → Operação** para testar silo, esteira, dosador de rosca e misturador. Inicie a simulação automática e ligue o dosador e a esteira para alimentar o silo a 20 kg por segundo simulado, até 1000 kg. O misturador tem comando independente. Em **Simulação automática**, a permissão de entrada aceita uma tag booleana do projeto. Na biblioteca local, o editor guarda telas na biblioteca **Projetos salvos** deste navegador. Para conectar equipamentos, use **Desenhar ligação** no editor, escolha Tubulação ou Sinal e clique nas portas de dois equipamentos. Atribua uma tag de estado em **Ligações → Editar ligação**.

## Recursos disponíveis

- Supervisão de nível, bomba e temperatura, com atualizações por WebSocket.
- Editor com tanque, bomba, válvula, motor, sensor, indicador, texto, botão, entrada numérica, retângulo e elipse.
- Tubulações e sinais entre portas dos objetos, acompanhando movimento e transformação.
- Tags próprias BOOLEAN/DOUBLE com unidade, valor inicial e faixa; comandos manuais validados pelo Java e isolados por aba.
- Nome da tela, cores e escala do tanque configuráveis; exemplo de processo conectado.
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

Para testar a nova entrega, abra **Editor → Exemplo de processo → Operação**. Use o botão desenhado para ligar/desligar a linha e clique em **Iniciar simulação automática**. O tanque enche com a linha ligada e drena quando desligada. Em Edição, use **Editar tag**, **Editar ligação** e **Simulação automática**. O guia **Por onde começar?** organiza os passos. Para construir sua própria tela, use **Tags do projeto**, **Ligações** e **Tag vinculada**. Veja o [guia de processo](docs/process-editor.md).

1. Abra **Editor** e mantenha o modo **Edição**.
2. Insira um componente pela biblioteca ou selecione um dos objetos do exemplo.
3. Arraste para mover. Use as alças para redimensionar e girar; valores exatos também podem ser informados no painel Propriedades.
4. Selecione a tag vinculada. Objetos numéricos aceitam tags DOUBLE; equipamentos de estado aceitam BOOLEAN. Botões e entradas numéricas usam somente tags próprias.
5. Use **Operação** para visualizar valores e comandar tags próprias de simulação. A geometria fica bloqueada nesse modo; as tags da demonstração continuam somente leitura.
6. Abra **Projetos salvos → Salvar projeto** para guardar a tela pelo nome. Para recuperá-la, escolha o nome na lista e clique em **Abrir projeto salvo**. Selecione um projeto na lista para renomeá-lo ou excluir sua cópia salva. **Exportar JSON** baixa uma cópia. **Abrir JSON** recupera componentes, geometria, ordem e vínculos. **Nova tela** abre uma tela vazia; Desfazer recupera a anterior.

As alterações são mantidas ao navegar entre as páginas, mas não são gravadas automaticamente no servidor ou no navegador. Antes de recarregar ou fechar, salve na biblioteca ou exporte o arquivo. A biblioteca pertence ao perfil do navegador e ao endereço do site. Limpar os dados do site apaga as cópias locais. A tela fixa de Supervisão é independente do projeto aberto no editor.

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

- `POST /api/simulation/evaluate`: validação sem estado dos valores de tags próprias e cálculo opcional de uma regra de tanque; nenhum comando físico ou alteração do simulador compartilhado. Tubulações não calculam vazão.

- `GET /api/health`: saúde e modo do serviço de simulação, versão de backend 0.1.0.
- `GET /api/tags` e `WS /ws/tags`: snapshots versionados de três tags.
- `TQ001.LEVEL`: nível percentual. O ciclo enche até 85% e drena até 20%.
- `P001.RUNNING`: estado da bomba simulada.
- `TQ001.TEMPERATURE`: temperatura entre 22 e 28 °C.

O ciclo é demonstrativo, não um modelo físico calibrado. Após perda de conexão ou silêncio prolongado, as medições ficam indisponíveis. A interface tenta reconectar automaticamente. O editor usa dados ilustrativos somente em Edição, identificados como prévia; Operação depende das tags do servidor.

## Próximos incrementos

Os próximos incrementos incluem persistência PostgreSQL/Flyway, importação segura de imagens, agrupamento, autenticação e perfis, histórico/alarmes e laboratório de controle. Drivers industriais permanecem em uma fase separada. Consulte o [roadmap](docs/roadmap.md).

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

O endpoint de simulação `/api/simulation/evaluate` valida valores de tags próprias, sem persistência ou mutação de estado compartilhado. Limita o corpo a 64 KiB, a 32 tags, nomes/tipos/faixas permitidos e rejeita campos desconhecidos. Ele não aceita endereços de dispositivos, scripts ou comandos físicos. A interface só atualiza valores após resposta válida; falhas tornam os valores próprios indisponíveis até reconexão. Os projetos continuam sendo lidos no navegador; apenas definições de tags, valores e a regra limitada da simulação são enviados ao Java.

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
