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
