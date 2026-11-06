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
