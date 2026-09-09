package com.norma.dataset.dto;

/**
 * Input for the lookup operation: the id of a previously imported dataset (held server-side
 * by {@code DatasetStore}), which sheet/column to match the query against, and which
 * sheet/column to read the result from. {@code startRow} skips every row before it when
 * scanning for a match (0 to search from the very first row, same as before this existed).
 */
public record LookupRequest(
        String datasetId,
        int searchSheetIndex,
        int searchColumn,
        int resultSheetIndex,
        int resultColumn,
        String query,
        int startRow) {
}
