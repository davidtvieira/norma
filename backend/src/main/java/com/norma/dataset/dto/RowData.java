package com.norma.dataset.dto;

import java.util.List;

/**
 * A single row in a sheet, addressed purely by its row index (no header assumption).
 */
public record RowData(int rowIndex, List<CellData> cells) {
}
