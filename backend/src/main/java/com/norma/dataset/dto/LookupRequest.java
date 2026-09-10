package com.norma.dataset.dto;

/**
 * Input for the lookup operation: the id of a previously imported dataset (held server-side
 * by {@code DatasetStore}), which sheet/column to match the query against, and which
 * sheet/column to read the result from. {@code startRow} skips every row before it when
 * scanning for a match (0 to search from the very first row, same as before this existed).
 * {@code matchMode} is "equals" (the original, default behavior — the whole cell must match the
 * query exactly), "contains" (the cell just needs to contain the query somewhere in it), or
 * "tokenEquals" (the cell is split on whichever of {@code tokenIgnoreSpaces}/
 * {@code tokenIgnoreDashes} are set, and the query must exactly match one of the resulting
 * pieces — e.g. a cell of "1 -2" with both set matches a query of "1" or "2", but a cell of "10"
 * never matches a query of "0", unlike "contains"); null or blank is treated as "equals" too, so
 * a model saved before this field existed still runs the same way it always did.
 * {@code tokenIgnoreSpaces}/{@code tokenIgnoreDashes} are only meaningful for "tokenEquals" —
 * absent (a model saved before they existed) defaults both to false.
 */
public record LookupRequest(
        String datasetId,
        int searchSheetIndex,
        int searchColumn,
        int resultSheetIndex,
        int resultColumn,
        String query,
        int startRow,
        String matchMode,
        boolean tokenIgnoreSpaces,
        boolean tokenIgnoreDashes) {
}
