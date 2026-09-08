package com.norma.dataset.dto;

import java.util.Map;

/**
 * One operation in a model being calculated: an id (used by other operations' "reference"
 * inputs to chain off its result), which kind it is ("lookup", "sum", ...), and its fields —
 * the exact same JSON shape the frontend already builds and exports (see
 * frontend/src/utils/modelSerialization.ts), just flattened rather than nested.
 */
public record ModelOperationInput(String id, String kind, Map<String, Object> fields) {
}
