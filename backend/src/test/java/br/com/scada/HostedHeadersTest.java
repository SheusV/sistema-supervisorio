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
