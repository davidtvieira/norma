package com.norma.dataset.dto;

/**
 * Input for the lookup operation: the id of a previously imported dataset (held server-side
 * by {@code DatasetStore}), which sheet/column to match the query against, and which
 * sheet/column to read the result from. {@code startRow} skips every row before it when
 * scanning for a match (0 to search from the very first row, same as before this existed).
 * {@code matchMode} is "equals" (the original, default behavior — the whole cell must match the
 * query exactly) or "contains" (the cell just needs to contain the query somewhere in it); null
 * or blank is treated as "equals" too, so a model saved before this field existed still runs the
 * same way it always did.
 */
public record LookupRequest(
        String datasetId,
        int searchSheetIndex,
        int searchColumn,
        int resultSheetIndex,
        int resultColumn,
        String query,
        int startRow,
        String matchMode) {
}
