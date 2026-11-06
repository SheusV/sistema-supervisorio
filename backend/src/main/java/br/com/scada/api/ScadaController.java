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
