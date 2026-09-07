package com.norma.dataset.dto;

import java.util.List;

/**
 * A single worksheet parsed into an index-addressed row/cell matrix.
 */
public record SheetData(String sheetName, int totalRows, List<RowData> rows) {
}
