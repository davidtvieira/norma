package com.norma.dataset.dto;

import java.util.List;

/**
 * Input for the counter operation: however many already-resolved values to add together. Unlike
 * lookup/sum, a counter has no dataset dependency of its own — each of its values was itself
 * either typed directly or (from the editor's perspective) chained from another operation's
 * already-computed result, so only the resolved values themselves are sent here, never a
 * datasetId/table/column/range.
 */
public record CounterRequest(List<String> values) {
}
