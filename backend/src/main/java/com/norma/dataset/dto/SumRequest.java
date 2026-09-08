package com.norma.dataset.dto;

/**
 * Input for the sum operation: the id of a previously imported dataset, the sheet, and the
 * rectangular range (row/column bounds, all inclusive) of cells to sum.
 */
public record SumRequest(String datasetId, int sheetIndex, int startRow, int endRow, int startColumn, int endColumn) {
}
