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
