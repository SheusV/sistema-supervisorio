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
