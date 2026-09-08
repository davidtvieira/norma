package com.norma.dataset.dto;

/**
 * Input for the sum operation: the id of a previously imported dataset, which sheet/column to
 * sum, and the row index to start summing from (inclusive) through the end of the sheet.
 */
public record SumRequest(String datasetId, int sheetIndex, int column, int startRow) {
}
