package com.norma.dataset.dto;

/**
 * Input for the find operation: the id of a previously imported dataset, the sheet and
 * rectangular range (row/column bounds, all inclusive) to search within, and the query to match
 * against each cell in that range — the same case/whitespace-insensitive match lookup's own
 * search column uses.
 */
public record FindRequest(String datasetId, int sheetIndex, int startRow, int endRow, int startColumn, int endColumn, String query) {
}
