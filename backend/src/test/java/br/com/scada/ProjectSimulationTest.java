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
