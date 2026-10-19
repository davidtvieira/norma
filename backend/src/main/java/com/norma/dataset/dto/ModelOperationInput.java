package com.norma.dataset.dto;

import java.util.Map;

/**
 * One operation in a model being calculated: an id (used by other operations' "reference"
 * inputs to chain off its result), which kind it is ("lookup", "sum", ...), and its fields —
 * the exact same JSON shape the frontend already builds and exports (see
 * frontend/src/utils/modelSerialization.ts), just flattened rather than nested. {@code name} is
 * the operation's display name, only used to label a model's designated inputs/outputs (see
 * {@link ModelIoResponse}); it plays no part in computing anything and may be absent.
 */
public record ModelOperationInput(String id, String kind, Map<String, Object> fields, String name) {

    public ModelOperationInput(String id, String kind, Map<String, Object> fields) {
        this(id, kind, fields, null);
    }
}
