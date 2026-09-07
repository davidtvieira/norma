package com.norma.dataset.dto;

/**
 * A single cell in a sheet, addressed purely by its column index (no header assumption).
 */
public record CellData(int columnIndex, Object value) {
}
