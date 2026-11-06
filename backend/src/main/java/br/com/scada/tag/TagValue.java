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
