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
