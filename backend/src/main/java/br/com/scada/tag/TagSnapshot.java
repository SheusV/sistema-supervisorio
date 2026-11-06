package br.com.scada.tag;

import java.util.List;

public record TagSnapshot(int schemaVersion, long sequence, List<TagValue> tags) {
    public TagSnapshot { tags = List.copyOf(tags); }
}
