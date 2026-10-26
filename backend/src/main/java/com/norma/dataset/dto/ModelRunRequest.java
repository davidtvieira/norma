package com.norma.dataset.dto;

import java.util.Map;

/**
 * Runs a previously registered model: {@code inputValues} replaces the literal value of each of
 * the model's designated input operations for this run, keyed by operation id (null/omitted, or
 * missing an entry for a given input operation, is treated as an empty string for that one — same
 * as when the model has no input operations at all). The operations themselves — every
 * table/column/range detail — stay server-side, registered once; a run only ever sends the values
 * a caller is actually meant to supply, never the operations themselves. {@code watchIds} lists
 * extra operations (any in the model, by id) whose values the caller also wants back, next to the
 * outputs (null/omitted: none).
 */
public record ModelRunRequest(Map<String, String> inputValues, java.util.List<String> watchIds) {

    public ModelRunRequest(Map<String, String> inputValues) {
        this(inputValues, null);
    }
}
