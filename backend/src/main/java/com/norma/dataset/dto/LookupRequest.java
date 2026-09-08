package com.norma.dataset.dto;

/**
 * Input for the lookup operation: the id of a previously imported dataset (held server-side
 * by {@code DatasetStore}), which sheet/column to match the query against, and which
 * sheet/column to read the result from.
 */
public record LookupRequest(
        String datasetId,
        int searchSheetIndex,
        int searchColumn,
        int resultSheetIndex,
        int resultColumn,
        String query) {
}
